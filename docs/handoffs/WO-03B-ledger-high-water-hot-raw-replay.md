# WO-03B Builder Handoff — Ledger High-water + Hot Raw Replay

Status: **BUILDER COMPLETE / AWAITING INDEPENDENT QA**<br>
Work order: `docs/work-orders/WO-03B-ledger-high-water-hot-raw-replay.md`<br>
Source baseline HEAD: `06d736a0a8a7ab3cfb03228b345898ac4a57a658`<br>
Planning authority commit: `06d736a0a8a7ab3cfb03228b345898ac4a57a658`<br>
Expected parent: `f02c5e12ee0931d4a23a999fa2dc2c0dbb977940`<br>
WO-03A fixed candidate: `c93072dc5e4b5c89464b003e716bbb688b072b89`<br>
WO-03A re-QA: `f02c5e12ee0931d4a23a999fa2dc2c0dbb977940`<br>
Builder candidate HEAD: the commit containing this handoff; Independent QA must
resolve and pin that exact commit before review.

## Bounded result

WO-03B delivers:

- explicit scoped Raw Source projection input with optional session provenance;
- append-only canonical Raw Events ordered by the frozen ledger axis;
- atomic Event row + ledger revision + immutable marker commit and exact replay;
- durable scope-bound ledger high-water;
- Hot Raw rebuild from committed Frontier to one consistent high-water snapshot;
- cross-session provenance, authority/shadow isolation, and crash-without-push
  recovery;
- Core library methods without changing the nine-command MCP port.

It does not advance Frontier or implement Semantic Takeover/Enrichment, Fact,
State/Relation policy, Compaction Artifact, Snapshot, worker/push, retrieval
policy, Host/provider integration, or a legacy data migration.

## Execution baseline and paths

`docs/inventory/WO-03B/execution-baseline-manifest.md` froze a clean `main`
worktree at the planning commit before source implementation. It records no
submodules, unchanged package/lock/TypeScript hashes, and the accepted WO-03A
candidate/re-QA ancestry.

The candidate contains exactly these nine authorized paths:

```text
docs/architecture/WO-03B-ledger-high-water-hot-raw-replay.md
docs/handoffs/WO-03B-ledger-high-water-hot-raw-replay.md
docs/inventory/WO-03B/execution-baseline-manifest.md
docs/inventory/WO-03B/ledger-schema-replay-map.md
src/core.ts
src/index.ts
src/ledger-hot-raw.ts
test/core-boundary.test.ts
test/ledger-hot-raw.test.ts
```

The frozen `src/revision-substrate.ts`, its test, every existing Store/MCP/
evaluator source, package/config/dependency file, and official artifact are
unchanged from the baseline.

## Source and schema fingerprints

```text
2210d5436daada36e34af3c8c4c03575c53ac499eadb662a2fd3bff90002eda2  src/ledger-hot-raw.ts
46147984d417d5d2198fa294ed999a1346d9f402d748c482180dd15d55f6974f  src/core.ts
db4b828e18b3ebb0b2038af8e9625f82542bf8d1cbd298de5d2a8877e0c0e407  src/index.ts
9ab332bbf3c53555cafb9d90c6709e6c371ccf8bb3ccc68afe48be85697c9599  src/revision-substrate.ts (frozen)
```

Schema-definition and migration-function source fragments:

```text
df1847e3994a34fdad365791eb75fa7ada6c57e44be81dfca4009306ab9a5744  schema definitions
71e7400b1212d27cdaaaa5739737721933252c414b6a856ecf8fa503b2c66677  migration function
```

Schema version `1` owns:

```text
cc_ledger_hot_raw_schema
cc_ledger_raw_events
cc_ledger_raw_events_no_update
cc_ledger_raw_events_no_delete
cc_ledger_hot_raw_schema_no_update
cc_ledger_hot_raw_schema_no_delete
```

Migration is `BEGIN IMMEDIATE`, additive, concurrent-first-open safe, and inserts
the immutable completion row only after exact column and normalized full-SQL
validation. Legacy `raw_events` is not read or backfilled.

## Input and identity contract

The domain input binds explicit scope, scoped stable `event_id`, one of four Raw
Source kinds, `source_id`, optional provenance-only `source_session_id`, canonical
plain JSON payload, and optional exact ISO occurrence time.

`source_session_id` never supplies or defaults `stream_id`; two sessions can
contribute to one stream and equal event IDs are independent in different
scopes. Caller-supplied revisions, Frontier positions, hashes, or marker kinds
are not accepted.

Same scoped Event + exact normalized input returns the original row/result and
does not rerun the callback or advance the ledger. Source kind/ID/session,
payload, timestamp, or identity substitution conflicts.

## Transaction and high-water contract

The accepted WO-03A `RAW_EVENT_APPEND` transaction covers:

```text
scoped marker replay lookup
→ ledger_revision + 1 computation
→ scoped event-id duplicate check
→ canonical Event insert at new revision
→ full-vector CAS
→ immutable marker/result
→ COMMIT
```

Event insert, vector update, marker, or commit failure rolls back all three
authorities. Safe-integer exhaustion occurs before the Event callback. The
durable high-water returned by rebuild is exactly the same-scope vector's
`ledger_revision`; different scopes do not share or compare allocators.

## Rebuild and crash contract

`rebuildHotRaw(scope)` uses one SQLite read transaction to select the full vector
and Events satisfying:

```text
frontier_position < event.ledger_revision <= ledger_high_water
```

The vector read establishes the snapshot. A concurrent append therefore appears
as both revision + Event or neither. The result contains full scope/vector,
high-water, and ordered Events. Rebuild is read-only and never advances Frontier.

No push state exists. Tests commit an Event, close all resources immediately,
reopen, and reconstruct the full tail from the durable ledger and committed
Frontier. Non-zero Frontier tests use the accepted helper only to arrange a test
fixture and prove WO-03B production source contains no Frontier/Takeover writer.

## Core / MCP / compatibility proof

- Core owns the Store in a JavaScript private field and exposes only the
  domain-specific library append/rebuild methods.
- `ContextCompilerCommandPort`, MCP service, schemas, and exact accepted nine
  command names are unchanged.
- Package root exports types/constants/error but not the SQLite Store or
  migration function.
- Current `ingest_event(session_id, ...)` remains separate and does not advance
  the canonical ledger, even when session provenance text equals another stream.
- Existing Raw/Event mirror, State, Recall, compile telemetry, evaluation,
  package/config, and artifacts pass unchanged regression suites.
- No remote model, network, credential, production database, destructive
  command, or sibling Host repository was used.

## Builder verification

Final verification completed at `2026-08-24T10:49:19Z`:

```text
npm test
  PASS — 32 files passed, 1 skipped; 497 tests passed, 1 skipped

npm run build
  PASS — tsc -p tsconfig.json

focused Hot Raw / frozen substrate / Core / MCP run
  PASS — 4 files, 29 tests

git diff --check
  PASS

exact command enumeration
  PASS — nine commands in accepted order

root internal export check
  PASS — no SqliteLedgerHotRawStore or migrateLedgerHotRaw

frozen/prohibited-path diff
  PASS — WO-03A, existing Stores/MCP/evaluator, package/config unchanged
```

Focused evidence covers explicit scope and cross-session provenance, exact
replay/substitution, Event/marker rollback, authority/shadow and same-event scope
isolation, non-zero Frontier filtering without mutation, no-push reopen,
invalid/C1/cyclic/accessor/exotic inputs, overflow, concurrent distinct append,
concurrent exact retry, consistent read snapshot, fresh/legacy concurrent
migration, no backfill, collision, and forged completion.

## Known limits and deferred work

- Core callers must explicitly project a Raw Source; current v0 ingest is not
  automatically bridged.
- Push/worker acceleration is absent by design.
- Hot Raw is returned as a rebuild projection, not a persisted cache authority.
- Domain completeness and contiguous safe takeover cannot be decided by this
  layer; Frontier remains a read-only dependency.
- Ledger ranges may later include non-Raw event kinds. This reader returns only
  canonical Raw projections present in the selected range.
- Semantic Takeover/Enrichment, Fact/Relation/State authority, compaction,
  Snapshot/Attempt binding, retention, and full-system recovery remain later WOs.

## Independent QA requirements

The Builder does not approve this candidate. Independent QA must:

1. pin the exact candidate commit containing this handoff and verify baseline,
   WO-03A ancestry, parent, main, clean status, and the exact nine-path allowlist;
2. verify frozen WO-03A source/test and every prohibited path are unchanged;
3. try to turn `source_session_id` or legacy session/seq into scope/revision and
   verify no implicit route/backfill exists;
4. independently exercise same-event same-scope replay, all request
   substitutions, same event across scopes, and concurrent distinct allocators;
5. inject Event and marker failures and confirm row/vector/marker rollback with
   no consumed revision;
6. challenge partial/forged schema completion and legacy no-backfill;
7. reproduce crash-without-push recovery and concurrent vector/Event snapshot
   consistency;
8. arrange a committed non-zero Frontier, verify only later Events return, and
   prove WO-03B never changes the Frontier vector;
9. reproduce invalid/C1/plain-data/timestamp/overflow and lifecycle behavior;
10. run focused tests, `npm test`, `npm run build`, exact-nine, root-boundary,
    `git diff --check`, and prohibited-drift audits; and
11. write only `docs/qa/WO-03B-ledger-high-water-hot-raw-replay.md` in a separate
    QA commit. QA must not implement or begin WO-04/WO-05.
