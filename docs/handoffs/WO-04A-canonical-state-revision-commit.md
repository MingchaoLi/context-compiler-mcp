# WO-04A Builder Handoff — Canonical State Revision Commit

Status: **BUILDER COMPLETE / AWAITING INDEPENDENT QA**<br>
Work order: `docs/work-orders/WO-04A-canonical-state-revision-commit.md`<br>
Source baseline HEAD: `4e7758ac459c879944c624eb27ffefcfb24a2aec`<br>
Planning authority commit: `4e7758ac459c879944c624eb27ffefcfb24a2aec`<br>
Expected parent: `92e72eb785b2670068597376bccfd1136e3c6952`<br>
WO-03A fixed candidate / QA:
`c93072dc5e4b5c89464b003e716bbb688b072b89` /
`f02c5e12ee0931d4a23a999fa2dc2c0dbb977940`<br>
WO-03B fixed candidate / QA:
`24b7ba6971be2d8dc761368ecb66722ff053f4ea` /
`92e72eb785b2670068597376bccfd1136e3c6952`<br>
Builder candidate HEAD: the commit containing this handoff; Independent QA must
resolve and pin that exact commit before review.

## Bounded result

WO-04A delivers one additive Core authority path:

- explicit namespace/stream Canonical State proposal input;
- frozen `canonical-state/v1` policy identity and deterministic upsert reducer;
- append-only complete Committed State revisions on the WO-03A State axis;
- atomic State row + State axis + immutable marker and exact replay;
- same-scope committed canonical Raw Event provenance;
- latest/exact durable State reads and close/reopen recovery;
- Core domain library methods without changing the nine-command MCP port.

It does not backfill or replace legacy State, advance Frontier, create Fact /
Relation authority, implement Semantic Takeover/Enrichment or Compaction
Artifact, change Working Context, add Host/provider behavior, or begin WO-05.

Umbrella WO-04 remains split into 04A/04B/04C. Acceptance of this candidate alone
does not authorize 04B, 04C or WO-05.

## Execution baseline and exact paths

`docs/inventory/WO-04A/execution-baseline-manifest.md` froze clean `main` at the
planning commit before source implementation. It records no submodules, stable
package/lock/TypeScript hashes and both accepted WO-03 dependencies.

The candidate contains exactly these nine authorized paths:

```text
docs/architecture/WO-04A-canonical-state-revision-commit.md
docs/handoffs/WO-04A-canonical-state-revision-commit.md
docs/inventory/WO-04A/execution-baseline-manifest.md
docs/inventory/WO-04A/state-authority-schema-transaction-map.md
src/canonical-state.ts
src/core.ts
src/index.ts
test/canonical-state.test.ts
test/core-boundary.test.ts
```

Frozen WO-03A/03B source/tests, every legacy State implementation/test, MCP,
package/config/dependencies, evaluation and official artifacts are unchanged.

## Source and policy fingerprints

```text
715e147c292d602ae1d7bb596d0399eeb5ef96c37af8e52bb2fff48d8c9b5d13  src/canonical-state.ts
be290a1850c28d6016481c9ba2987849a968cfe896e0d8a4031be53a6bbcca15  src/core.ts
03ac90bf486fd19ae45b29a1c3a3d02cfb7c81f122def7ff6f3c5395f1c76128  src/index.ts
9ab332bbf3c53555cafb9d90c6709e6c371ccf8bb3ccc68afe48be85697c9599  src/revision-substrate.ts (frozen)
2210d5436daada36e34af3c8c4c03575c53ac499eadb662a2fd3bff90002eda2  src/ledger-hot-raw.ts (frozen)
```

```text
policy_version: canonical-state/v1
policy_hash: 67c043ba4001150ccc4bb3f5630de99604970401bf418f5f33b3d524aeb0c52e
schema_version: 1
```

The policy hash is computed by Core from the frozen canonical descriptor; caller
input must equal it but cannot redefine it.

## Proposal, reduction and no-op contract

The exact input binds scope, stable `state_commit_id`, one of three recorded
commit modes, expected State revision, version-1 proposal, policy hash and the
exact provenance union.

The proposal contains 1–100 full item upserts. It supports only `GOAL`,
`CONSTRAINT`, `DECISION`, `OPEN_QUESTION` and `REJECTED_ALTERNATIVE` with the
initial/transition table frozen in the architecture deliverable. Items and Event
IDs normalize lexically; duplicate IDs, item deletion, kind changes, terminal
regression and provenance removal fail closed.

Every item source Event must be a same-scope committed canonical Raw Event. The
top-level provenance array must equal the exact union of the per-item arrays.
Legacy Raw IDs/session/sequence never satisfy this check.

The complete State is sorted by stable `item_id` and hashed from canonical JSON.
Empty proposals are `INVALID_INPUT`; byte-identical reduced State is `CONFLICT`.
Neither produces a marker or revision, so every successful commit advances the
State axis exactly once.

## Transaction, replay and read contract

The frozen WO-03A transaction performs:

```text
same-scope marker replay / expected State CAS
→ committed Raw provenance checks
→ previous complete State read + deterministic reduction
→ immutable State revision row insert
→ full-vector CAS
→ immutable marker/result insert
→ COMMIT
```

State-row insert, vector update, marker insert and a real deferred-FK COMMIT
failure were independently injected in the Builder suite. Each left no State
row/marker and no consumed State revision; a later success still received
revision 1. Safe-integer overflow fails before the domain callback.

Same ID + exact normalized request returns the original persisted revision even
after later commits. Any mode/expected/proposal/policy/provenance substitution
conflicts. Two connections at one base allow at most one distinct proposal;
concurrent exact retry writes once and returns one revision to both callers.

Latest read uses one SQLite read snapshot for the complete vector and matching
State row. Exact/latest reads validate canonical bytes/hash, previous reduction
and binding to the immutable WO-03A marker result. Absent State returns the zero
projection without materializing a scope; missing positive revisions are
`NOT_FOUND`.

## Migration and compatibility boundary

Schema version 1 owns:

```text
cc_canonical_state_schema
cc_canonical_state_revisions
cc_canonical_state_revisions_no_update
cc_canonical_state_revisions_no_delete
cc_canonical_state_schema_no_update
cc_canonical_state_schema_no_delete
```

Migration uses `BEGIN IMMEDIATE`, validates exact columns and normalized full
`sqlite_master.sql`, and writes the singleton completion last. Concurrent fresh /
legacy first-open succeeds; same-name partial objects and forged completion fail
closed. Existing `context_items`, `state_relations`, State revision/preparation
tables and command behavior are not read, backfilled or changed.

Core owns the new Store in a JavaScript private field. Package root exports only
policy/schema constants, types and the stable error—not the Store or migration.
`ContextCompilerCommandPort`, MCP service and exact nine commands are unchanged.

## Builder verification

Final verification completed at `2026-08-24T11:25:41Z`:

```text
npm test
  PASS — 33 files passed, 1 skipped; 507 tests passed, 1 skipped

npm run build
  PASS — tsc -p tsconfig.json

focused Canonical State / frozen substrate / Hot Raw / Core / MCP run
  PASS — 5 files, 39 tests

git diff --check
  PASS

exact command enumeration
  PASS — nine accepted commands in order

root internal export check
  PASS — no SqliteCanonicalStateStore or migrateCanonicalState

frozen/prohibited-path diffs
  PASS — WO-03A/03B, legacy State, MCP/evaluator, package/config unchanged
```

Focused evidence covers exact replay/substitution, status transitions, monotonic
same-scope provenance, authority/shadow isolation, row/vector/marker/COMMIT
rollback, distinct-CAS concurrency, exact-retry concurrency, one-snapshot read,
legacy no-backfill, fresh/legacy concurrent migration, collision/forged
completion, marker-row binding, invalid/Cc/cycle/accessor/exotic/no-op inputs,
overflow, reopen and Core/root/MCP boundaries.

No network, remote model, credential, production database, destructive command
or sibling Host repository was used. All write diagnostics used isolated files
under the system temporary directory.

## Known limits and deferred work

- No detector/extractor is selected; a caller supplies a strict proposal.
- State item vocabulary is intentionally limited to the accepted v0 semantic
  categories; first-class Fact/Relation records and their orthogonal policy axes
  belong to WO-04B.
- Canonical State does not drive legacy `get_state`, assembly, retrieval or MCP.
- No item deletion exists; lifecycle is expressed by status transitions.
- Frontier/Takeover/Enrichment/Compaction Artifact belongs to WO-04C.
- Snapshot/Attempt and final Working Context authority handoff remain WO-05.

## Independent QA requirements

The Builder does not approve this candidate. Independent QA must:

1. pin the exact candidate/parent/baseline/ancestry and exact nine-path allowlist;
2. verify frozen WO-03A/03B and prohibited legacy/MCP/config/artifact paths;
3. independently reconstruct the policy hash, proposal normalization, exact
   provenance union, State hash and transition rules;
4. attack session/legacy State/Raw IDs as implicit scope or provenance;
5. inject State-row/vector/marker/actual-COMMIT failures and prove total rollback;
6. reproduce distinct same-base single-winner and same-ID exact retry races;
7. challenge overflow, empty/reduced no-op, Unicode `Cc`, non-NFC, accessors,
   cycles, exotic data and every request substitution;
8. challenge partial/forged migration completion and legacy no-backfill;
9. reproduce snapshot-consistent latest read, exact historical read, reopen and
   marker-row coordinated corruption detection;
10. verify no Frontier/Fact/Relation/Takeover/Enrichment, no legacy State/MCP
    takeover and no new internal root/reflection authority;
11. run focused tests, `npm test`, `npm run build`, exact-nine/root/frozen-diff and
    `git diff --check`; and
12. write only `docs/qa/WO-04A-canonical-state-revision-commit.md` in a separate QA
    commit. QA must not implement fixes or begin WO-04B/04C/WO-05.
