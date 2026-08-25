# WO-PUB-02 Independent QA — Raw Timestamp Compatibility

Verdict: **FAIL / RETURN TO IMPLEMENTATION**

Reviewed candidate: `462e35f58bb1bdd0b4f50dc833aa6925097b8292`

Implementation baseline / parent: `b9b2dedebf97c6d9c66369af4aaab70904f73fe9`

Review date: 2026-08-25

## Scope and independence

This was a fresh Independent QA of the fixed candidate and parent. Repository files and Git history were
the only authority. The review used only synthetic temporary databases and public stdio MCP calls; it did
not read or request any Natural Case, Gold, Raw, Evidence, required point, must-not-claim, hidden holdout,
external QA artifact, sibling Host, model, provider, network or credential.

Git checks proved:

- `main` was clean and exactly at the reviewed candidate before the QA report was written;
- the implementation baseline exists, is the direct parent, and is an ancestor of the candidate;
- the candidate changes exactly the twelve paths declared in the Builder handoff;
- no package/dependency/configuration, database schema/migration, revision axis, State, Retrieval,
  user-turn/role, import, Host or sibling-repository path changed.

The Builder does not approve this result. The following independent counterexamples prevent acceptance.

## Findings

### P1 — Historical high-precision timestamps break source-event idempotency

The candidate changes an exact `source_event_id` retry from byte comparison to
`sameRawEventInstant(...)`, but its canonicalization truncates historical fractional seconds to three
digits. Distinct source instants can therefore be accepted as the same idempotent event.

Independent synthetic reproduction:

1. Initialize a session through public stdio `ingest_event` and close the process.
2. Append one historical Raw row using only `INSERT`, with stable source id `precise-source` and
   `created_at = 2025-12-31T23:59:59.123999999Z`.
3. Reopen the candidate and retry the same source id/body through public `ingest_event`, but provide
   `created_at = 2025-12-31T23:59:59.123Z`.

Observed:

```text
candidate 462e35f: ok=true; existing ...123999999Z row returned
parent b9b2ded:  ok=false; error.code=CONFLICT
```

These RFC 3339 values are not the same instant. Treating them as equivalent weakens source-event
idempotency and contradicts the work order's requirement that source-event idempotency remain unchanged.
It also makes the handoff claim that retries compare the represented instant false for supported historical
precision.

Required return condition: preserve exact instant equality across every accepted historical precision, or
freeze and enforce a narrower historical grammar that does not contradict the work order. Add a
parent-vs-candidate regression proving distinct sub-millisecond instants remain `CONFLICT`.

### P1 — Invalid stored Raw timestamp crosses the public exact-recall boundary

The new compatibility validator is used by Context Assembly, but the exact-recall Raw row reader still
returns `created_at` without applying the compatible timestamp contract.

Independent synthetic reproduction:

1. Initialize a session through public stdio and close the process.
2. Append one Raw row using only `INSERT`, with
   `created_at = 2026-02-30T00:00:00Z`.
3. Reopen and call public `recall_exact` by that event id.

Observed:

```json
{
  "ok": true,
  "result": {
    "kind": "event_id",
    "found": true,
    "event": { "created_at": "2026-02-30T00:00:00Z" }
  }
}
```

The same stored row makes `compile_context` fail with sanitized `INVALID_INPUT`, proving the read domain is
inconsistent across public paths. The work order explicitly includes recall in the read/replay domain and
requires illegal stored timestamps to fail closed; returning the invalid row as successful public Raw
evidence does not satisfy that contract.

Required return condition: every public/raw replay reader covered by the work order must share the same
historical timestamp acceptance domain and fail closed without rewriting the append-only row. Add explicit
`event_id`, range/headline as applicable, and compile/reopen regression coverage.

### P1 — A parseable RFC 3339 historical row is rejected by compile

The work order and handoff describe compatibility for parseable RFC 3339 historical fractional timestamps
without declaring a nine-digit ceiling. RFC 3339 fractional seconds allow one or more digits, while
`RAW_EVENT_COMPATIBLE_TIMESTAMP_PATTERN` accepts only one through nine.

Independent synthetic reproduction appended, without update/backfill, this historical value:

```text
2025-12-31T23:59:59.1234567890Z
```

After reopen, public `compile_context` returned sanitized `INVALID_INPUT`. Public `recall_exact` returned the
same stored bytes successfully, which also demonstrates the inconsistent reader domains described above.

Required return condition: either support the complete historical RFC 3339 fractional grammar promised by
the work order or reopen the Gate and explicitly narrow the historical compatibility contract with evidence
that no prior public writer could have accepted the excluded shape. The current public writer did accept
arbitrary timestamp strings before this candidate, so the narrowing cannot be assumed silently.

## Passing evidence

The failure is bounded. Independent public stdio checks confirmed the intended common case:

- seconds, one-, two-, and three-digit fractions and numeric offsets canonicalize to UTC milliseconds;
- reverse, equal, late and future source times append successfully as `seq=1..N`;
- invalid new calendar input returns sanitized `INVALID_INPUT` and consumes no Raw row;
- normal compile orders content by `seq`, not by source time;
- the Builder's seconds-only append-only legacy row survives reopen, exact retry, compile, exact recall and
  a second byte-stable replay without Raw update/backfill;
- an invalid stored timestamp makes compile fail closed.

Parent and candidate were also built from clean Git archives and queried through real MCP `tools/list`.
Both expose the same nine tools in the same order. Removing only
`ingest_event.inputSchema.properties.created_at` makes every tool object byte-value equal; the sole declared
schema difference is:

```text
parent:    { type: "string" }
candidate: { type: "string", format: "date-time", pattern: <declared RFC 3339 pattern> }
```

All other input schemas, descriptions and tool order are unchanged. Source-diff inspection shows no change
to the public result allowlist or error envelope; real stdio calls remained protocol-pure. Dynamic package
root inspection found 105 exports in each build with no additions or removals, so the new internal timestamp
helpers do not expand the root API.

## Commands and results

```text
npm exec vitest run test/raw-store.test.ts test/assembler.test.ts test/mcp-protocol.test.ts
PASS — 3 files / 71 tests

npm test
PASS — 37 files passed, 1 skipped / 582 tests passed, 1 skipped

npm run build
PASS — tsc -p tsconfig.json

git diff --check b9b2dedebf97c6d9c66369af4aaab70904f73fe9..462e35f58bb1bdd0b4f50dc833aa6925097b8292
PASS
```

The focused/full protocol suite's production-only npm-package stdio scenario passed with declared runtime
dependencies. Passing regression tests do not override the three uncovered contract counterexamples.

## Disposition

Return WO-PUB-02 to the implementation branch for an append-only fix candidate. The repair must remain
inside Raw timestamp compatibility: do not change database schema, rewrite historical Raw, add a time axis,
or alter event size, user-turn/role behavior, import, Retrieval, State, public result-boundary policy, Host or
Natural QA behavior. A fresh Independent re-QA must repeat these counterexamples plus the full original
acceptance matrix.
