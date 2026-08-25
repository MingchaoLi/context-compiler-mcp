# WO-PUB-02 Fresh Independent Re-QA — Raw Timestamp Compatibility Fix

Verdict: **FAIL / RETURN TO IMPLEMENTATION**

Reviewed fixed candidate: `dfe71d3e36cf6304c4cb88abc0cec9d14c01c525`

Direct parent / prior QA return: `64f787606b18d138c67b880ec43a1bd198629680`

Returned candidate: `462e35f58bb1bdd0b4f50dc833aa6925097b8292`

Implementation baseline: `b9b2dedebf97c6d9c66369af4aaab70904f73fe9`

Review date: 2026-08-25

## Scope and independence

This was a fresh Independent re-QA of the append-only fix. Repository files and Git history were the only
authority. The review used synthetic temporary SQLite databases, production source/package code and public
stdio MCP calls. It did not read or request any Natural Case, Gold, Raw, Evidence, required point,
must-not-claim, hidden holdout, external QA artifact, sibling Host, model, provider, network or credential.

Before this report was written, Git checks proved:

- `main` was clean and exactly at the reviewed fixed candidate;
- the implementation baseline, returned candidate and QA return all exist and are ancestors of the fixed
  candidate; the QA return is its direct parent;
- the QA-return-to-fix range changes exactly the declared eleven paths;
- the baseline-to-fixed range contains exactly the declared fourteen Builder paths plus the original QA
  report, for fifteen append-only paths total;
- no package/dependency/configuration, database schema/migration, revision axis, State, Retrieval,
  user-turn/role, import, Host or sibling-repository path changed.

The Builder does not approve this result. The three original return conditions are closed, but a new
historical RFC 3339 compatibility counterexample prevents acceptance.

## Blocking finding

### P1 — A valid historical RFC 3339 leap second is rejected on replay

The work order freezes historical compatibility for parseable RFC 3339 seconds plus arbitrary fractional
precision and prohibits a narrower hidden reader domain. This matters here because the implementation
baseline accepted arbitrary string timestamp bytes and persisted them; a standard-valid historical shape
cannot be treated as impossible legacy input.

RFC 3339 permits `time-second = 60` at an actual inserted leap second. The independent reproduction used the
actual leap second at the end of 2016:

```text
2016-12-31T23:59:60Z
```

Reproduction:

1. Start the fixed candidate through real stdio MCP and publicly ingest one normal user event.
2. Stop that isolated process and append one legacy row with `seq=2` and the timestamp above using only
   `INSERT`; perform no Raw update, backfill or migration rewrite.
3. Reopen the same database through real stdio MCP.
4. Call public `compile_context`, then public `recall_exact` by the inserted event id.
5. Re-read the database and confirm the original timestamp bytes remain present.

Observed:

```text
compile_context -> isError=true,  { ok:false, error:{ code:"INVALID_INPUT" } }
recall_exact    -> isError=true,  { ok:false, error:{ code:"STORAGE_FAILURE" } }
stored row      -> created_at remains exactly "2016-12-31T23:59:60Z"
```

The cause is bounded: `parseRawEventTimestamp(...)` rejects every `second > 59`, even in the historical
compatibility path. This makes the work order and README claim that historical RFC 3339 Raw replays false.
It is not an ordering issue: the row has a positive, unique, contiguous `seq`, and the rejection occurs
solely because of its timestamp representation.

Required return condition: preserve append-only replay for standard-valid historical RFC 3339 leap-second
bytes across Raw Store, compile and recall, without rewriting the row. Source-event retry semantics for that
accepted historical shape must remain fail-closed and exact. If the project instead intends to exclude leap
seconds, that is a contract/Gate change and cannot be silently inferred from the current `second <= 59`
implementation, especially because the prior public writer could persist the value.

## Original return conditions independently closed

The append-only fix does close all three findings from the first Independent QA:

1. **Unbounded historical fraction and exact instant identity:** a ten-digit stdio row and an independent
   over-100-character fractional row compile, recall and survive reopen byte-exact. Retrying a non-zero
   sub-millisecond value with only milliseconds returns `CONFLICT`; a trailing-zero, offset-equivalent value
   is idempotent and returns the original stored bytes.
2. **All public recall shapes fail closed:** an invalid stored calendar timestamp returns sanitized
   `STORAGE_FAILURE` through event-id, seq-range, headline-id and keyword recall, while compile returns
   sanitized `INVALID_INPUT`. No invalid Raw evidence crosses a successful public response.
3. **Common writer contract and sequence ordering:** seconds and one-to-three-digit fractions canonicalize to
   UTC milliseconds. Reverse, equal, late, offset and future source times append successfully in `seq` order;
   compile retains that order. Invalid new calendar input is rejected before append.

The independent precision/reopen check also re-read both synthetic legacy rows after retry and second reopen;
their timestamp bytes were unchanged. No Raw `UPDATE`, backfill or delete was used.

## Protocol, package and drift evidence

A dynamic real-stdio `tools/list` comparison between implementation baseline and fixed candidate found the
same nine tools in the same order. Removing only
`ingest_event.inputSchema.properties.created_at` made every tool object byte-value equal. The sole input
schema refinement remains:

```text
baseline:  { type: "string" }
candidate: { type: "string", format: "date-time", pattern: <declared 1-3 digit RFC 3339 pattern> }
```

All observed error responses were sanitized closed envelopes, stdout remained MCP-protocol-only, and no
candidate/ranking/score/debug/dependency trace crossed the public result boundary. Dynamic package-root
inspection found 105 exports in both builds with identical names, so internal timestamp helpers do not
expand the package root.

The production-only npm-package stdio scenario is part of the focused and full protocol suite and passed
using only declared runtime dependencies. Source/range inspection found no database schema or migration
change and no revision, State, Retrieval, user-turn/role or import behavior change.

## Commands and results

Environment:

```text
Darwin 25.5.0 arm64
Node.js v25.6.1
npm 11.9.0
```

Checks:

```text
npm exec vitest run test/raw-store.test.ts test/assembler.test.ts test/recall.test.ts test/mcp-protocol.test.ts
PASS — 4 files / 111 tests

npm test
PASS — 37 files passed, 1 skipped / 584 tests passed, 1 skipped

npm run build
PASS — tsc -p tsconfig.json

git diff --check b9b2dedebf97c6d9c66369af4aaab70904f73fe9..dfe71d3e36cf6304c4cb88abc0cec9d14c01c525
PASS
```

The green regression suite and closure of the first three defects do not override the independent leap-second
counterexample.

## Disposition

Return WO-PUB-02 to the implementation branch for one more append-only, timestamp-only fix. Do not change
database schema, rewrite historical Raw, add a time axis, or alter event size, user-turn/role behavior,
import, Retrieval, State, public result-boundary policy, Host or Natural QA behavior. A fresh Independent
re-QA must repeat this leap-second reproduction along with the existing precision, invalid-recall,
writer-ordering, schema, package and full regression checks.
