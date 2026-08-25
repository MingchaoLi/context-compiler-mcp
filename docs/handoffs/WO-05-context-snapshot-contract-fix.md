# WO-05 Append-only Fix Builder Handoff — Owner Projection Receipt

Status: **BUILDER FIX COMPLETE / AWAITING FRESH INDEPENDENT RE-QA**  
Work order: `docs/work-orders/WO-05-context-snapshot-contract.md`  
Returned Builder candidate: `c8c37b4beb230d2c37017b9c9d65aefa7e180eaa`  
QA return commit: `88e8da7c9cee348643f3c3f698af4e8e46cf3e09`  
Repair source baseline: `32e2e13248f72eecfbac54ecfd91db29e7d7111b`  
Repair baseline commit: `9200d539c06698543542e027c28d2491f3bfbc91`  
Repair Gate commit / Builder parent: `dcb0baff1936029779b5f7837f03b467eb4b14bb`  
Builder fix candidate: the commit containing this handoff; Independent QA must resolve and pin its exact
hash before review.

## Bounded result

This append-only fix closes only the QA-proven Fact/Relation historical projection information gap.
It does not rewrite the returned candidate or QA report.

```text
Fact/Relation owner complete projection receipt
  -> same transaction as Snapshot freeze
  -> immutable owner-local historical witness
  -> Snapshot Manifest binds receipt ID/hash
  -> exact replay rebuilds the complete graph from receipt first
```

The fix adds no sixth global revision axis, no new Fact/Relation commit writer, no generic transaction
framework, no Host/provider/model/network dependency, no MCP command and no WO-06/07 behavior.

## Owner-side receipt

`src/canonical-fact-relation.ts` now exclusively owns:

```text
cc_canonical_fact_relation_projection_receipt_schema
cc_canonical_fact_relation_projection_receipts
four exact update/delete rejection triggers
```

This is an additive v1 owner sub-schema. The accepted Fact/Relation authority schema marker, commit
tables, object revision tables, policy version/hash and axis-neutral write behavior remain unchanged.

The owner derives receipt identity from exact scope + subject Snapshot ID and persists a canonical
materialization containing all latest authoritative Fact and Relation objects visible at capture. It
stores full canonical objects and exact revisions/commits, not selected refs or a hash alone. Exact read
proves canonical bytes/hash, subject-derived ID, owner policy, exact immutable object/commit bindings and
the complete historical graph invariants.

Frozen receipt identity:

```text
CANONICAL_FACT_RELATION_PROJECTION_RECEIPT_SCHEMA_VERSION = 1
CANONICAL_FACT_RELATION_PROJECTION_RECEIPT_POLICY_VERSION =
  canonical-fact-relation-projection-receipt/v1
CANONICAL_FACT_RELATION_PROJECTION_RECEIPT_POLICY_HASH =
  610102fa139bcfb34c1a0bea0ff177ac3f1d7238bf2949a9f27ab4b13ae5b93b
```

The same-handle capture/inspect/read functions are Core-private source-module exports only. They never
open/commit/roll back a transaction, never mutate Fact/Relation authority and are absent from package
root and Core public methods.

## Snapshot v2 and transaction order

The rejected Snapshot v1 runtime grammar is replaced with the Gate-frozen v2 contract:

```text
CONTEXT_SNAPSHOT_SCHEMA_VERSION = 2
CONTEXT_SNAPSHOT_POLICY_VERSION = context-snapshot/v2
CURRENT_AUTHORITY_PROJECTION_VERSION = current-authority-hot-raw/v2
CONTEXT_SNAPSHOT_POLICY_HASH =
  279ceac17c144e99a39a041c5814f6b2e0643ecfc5ef6afe5a57f8d4bace8d6a
CONTEXT_ASSEMBLER_VERSION_HASH =
  e66825b13a057ae9648a83068e330c8025729fd77723bdd199d7cc4bd9ef888a
```

`ContextSnapshotFreezeInput`, Manifest and Attempt use `schema_version: 2`. Manifest adds only:

```text
fact_relation_projection_receipt_ref: {
  projection_receipt_id,
  projection_receipt_hash
}
```

New freeze order is:

```text
BEGIN IMMEDIATE
  inspect Snapshot + Attempt + owner receipt collision state
  exact complete triple -> receipt-first replay
  any partial/orphan/mismatch -> fail closed
  exact expected five-axis vector
  State / Raw / Takeover owner reads
  Fact/Relation owner captures and exact-reads complete receipt
  select closure and assemble only from the receipt projection
  recheck vector
  insert immutable Snapshot
  insert immutable AttemptStarted
  exact receipt-first readback inside transaction
COMMIT
```

Budget failure after capture and deferred-FK COMMIT failure after all three inserts both roll back the
receipt, Snapshot and Attempt. Concurrent same-ID freezes serialize to one exact triple; compatible
retry replays it and never recaptures from a later Fact/Relation world. Receipt-only, missing receipt,
wrong subject/scope/hash and partial Snapshot/Attempt states fail closed.

Stored replay now follows:

```text
Manifest receipt ref
  -> owner complete historical projection
  -> roots + active DEPENDS_ON traversal
  -> expected selected Fact/Relation refs + paths
  -> rebuilt Manifest
  -> rebuilt Working Context/body/hash/cost
```

Manifest selected refs are comparison output, not the authority graph input. Explicit required
historical refs still come from the normalized immutable request and exact owner revision reads; they
cannot be introduced by editing the Manifest.

The returned candidate's Snapshot v1 marker fails `CORRUPT_DATA`. No backfill is attempted because an
old selected Manifest or the current axis-neutral world cannot reconstruct the historical complete
projection safely.

## QA-return attack and S0–S5 evidence

The direct Snapshot suite now performs the original coordinated attack: remove selected Relation,
Fact and dependency path, remove their body sections, recompute body/Manifest/Attempt hashes and restore
the exact Snapshot triggers without modifying any Fact/Relation owner row.

Builder results:

```text
S0 capture; coordinated omission
   -> CORRUPT_DATA

S1 capture; later axis-neutral Fact commit at the same five-axis vector; omission
   -> CORRUPT_DATA

S2 capture; later axis-neutral Relation commit at the same five-axis vector; omission
   -> CORRUPT_DATA

S3 capture; later axis-neutral Fact + Relation commit; exact old replay
   -> byte-identical original Manifest/body

S4 mandatory overflow and deferred COMMIT failure
   -> receipt / Snapshot / Attempt counts all zero

S5 two-worker same-ID freeze and exact retry
   -> one receipt / one Snapshot / one Attempt with identical result
```

Additional fixtures cover complete receipt materialization, empty projection, receipt row tamper,
orphan detection on read and retry, same-scope subject substitution, cross-scope receipt substitution,
receipt-hash substitution, partial receipt schema, trigger tamper, additive migration/reopen, and
unsupported Snapshot v1 marker fail-closed.

## Exact Builder change surface

Relative to repair Gate/Builder parent `dcb0baff1936029779b5f7837f03b467eb4b14bb`, the candidate changes
exactly:

```text
src/canonical-fact-relation.ts
src/context-snapshot.ts
test/canonical-fact-relation.test.ts
test/context-snapshot.test.ts
docs/handoffs/WO-05-context-snapshot-contract-fix.md
docs/work-orders/WO-05-context-snapshot-contract.md
docs/PROJECT_STATE.md
docs/ROADMAP.md
```

No other source, test, config, dependency, evaluation or official artifact path is changed.

Builder fingerprints before candidate commit:

```text
bdd63602eff78bad678714bfc1bb572dcff47f3d71973d753a980ea4f9c55db6  src/canonical-fact-relation.ts
fb4b8c9dbd8ec9f5b25f04b37b9e1e4393247fe11a37cad11043cfb48fd464ef  src/context-snapshot.ts
4b0c195f65f90d74e7a8d101e90ab32c187fbba8b7bc9ed9948dc23125e01ede  test/canonical-fact-relation.test.ts
94f50de5342a967d88a61fda13c51b82e4e5b750c891a4c069212deb23a240c9  test/context-snapshot.test.ts
```

Frozen paths remain byte-identical:

```text
9ab332bbf3c53555cafb9d90c6709e6c371ccf8bb3ccc68afe48be85697c9599  src/revision-substrate.ts
d63b63a62b62d469dbef4ec85815fa2c4c81cd6c394288debe2846428b1ceee1  src/semantic-takeover.ts
298efbe6b3316e6c4839354fdd41ca9ccb5d705b8f0b3e51486ea22a99be623f  src/authority-transaction-coordinator.ts
8e783cc3b4afeb66ea3defdd2c642ae93aff98345dbbe0a248334535296013e3  src/assembler.ts
4d2d537f02102f18331ebbb2374cbe91c86e647c2ab0e95bfa337bd019c52e58  src/operational-context.ts
ef2c9f996d6d43b9b1f76d3c34e765eb77d96f31720ca1a9ba9e8baf332dcb9f  package.json
519fdcf4b874886466032343c25c5e5973679ef5e0ffc3dec5bf32cba3447d88  package-lock.json
189da4e3b0f7c2b3771fb5aee021b68df401630d369ed0425812fbcac4702559  tsconfig.json
```

## Verification evidence

All diagnostics used fresh temporary SQLite databases and no network/model/provider/credential/Host:

```text
npx vitest run test/context-snapshot.test.ts test/semantic-takeover.test.ts \
  test/core-boundary.test.ts test/canonical-state.test.ts \
  test/canonical-fact-relation.test.ts test/ledger-hot-raw.test.ts
PASS — 6 files / 76 tests

npm test
PASS — 37 files passed, 1 skipped / 569 tests passed, 1 skipped

npm run build
PASS — tsc -p tsconfig.json

git diff --check
PASS
```

The receipt and Snapshot policy hashes were independently recomputed from the exact Gate canonical JSON
bytes and match the implementation constants.

## Independent re-QA requirements

The Builder does not approve this fix. Fresh Independent QA should at minimum:

1. pin candidate/parent/repair-baseline/Gate/returned-candidate/QA-return ancestry and exact eight-path
   change surface;
2. independently recompute both receipt and Snapshot policy hashes from Gate bytes;
3. independently reproduce the original coordinated omission without modifying owner receipt rows;
4. repeat the omission after later same-vector Fact-only, Relation-only and Fact+Relation commits;
5. prove old Snapshot replay begins from the owner receipt and remains byte-identical after later writes;
6. inject failures after receipt, Snapshot and Attempt insertion and at COMMIT; prove no orphan row;
7. race same-ID freezes/retries and challenge receipt ID/subject/scope/hash substitution;
8. challenge receipt schema/marker/table/trigger/row, exact object/commit bindings, v1 rejection and reopen;
9. inspect package-root/Core/MCP privacy and unchanged accepted owner/substrate/v0 behavior; and
10. rerun focused/full/build/diff checks and write a separate QA report/commit.

Any failure returns to this append-only implementation chain. Host, WO-06/07, MCP, provider/model,
network, Retrieval, Summary, Extractor, frozen v0 and sibling repositories remain out of scope.
