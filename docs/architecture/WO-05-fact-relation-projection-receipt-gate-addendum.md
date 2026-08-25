# WO-05 Gate Addendum — Fact/Relation Historical Projection Receipt

Status: PRE-SOURCE QA-RETURN REPAIR GATE FROZEN

Repair source baseline: `32e2e13248f72eecfbac54ecfd91db29e7d7111b`  
Repair baseline commit: `9200d539c06698543542e027c28d2491f3bfbc91`

## 1. Decision

Independent QA proved that the five-axis Snapshot vector does not identify the complete historical
world of axis-neutral Fact/Relation commits. A stored Snapshot cannot prove that its selected
Fact/Relation refs are complete by reading only those same refs.

WO-05 therefore adds one bounded authority seam:

```text
canonical-fact-relation owner
  -> immutable complete-projection receipt
  -> owner-local historical witness, no global revision axis

context-snapshot owner
  -> references receipt ID + hash only
  -> derives selected closure from receipt projection
```

The receipt is an independent Fact/Relation-owner authority source. It is not a Snapshot hash, a
selected-ref cache, a sixth revision component, a new Fact/Relation writer, or permission to expand
WO-05 into WO-06/07.

## 2. Ownership and immutable identity

`src/canonical-fact-relation.ts` exclusively owns receipt schema, migration, identity derivation,
capture, canonical bytes/hash, exact read and validation. `src/context-snapshot.ts` may pass only the
explicit same-scope `subject_snapshot_id` and observed five-axis vector to the owner capture seam. It
must not enumerate, construct, edit, repair or backfill receipt Fact/Relation content.

The owner derives:

```text
projection_receipt_id =
  "frpr-" + sha256(canonical JSON UTF-8 bytes of
    { namespace, stream_id, subject_snapshot_id })
```

Canonical JSON recursively sorts object keys lexically, preserves array order and uses the repository's
closed JSON number/string rules. The resulting ID is exactly 69 lowercase ASCII characters. The receipt
sub-schema has both:

```text
PRIMARY KEY  (namespace, stream_id, projection_receipt_id)
UNIQUE       (namespace, stream_id, subject_snapshot_id)
```

One Snapshot identity can therefore bind at most one owner receipt. Snapshot does not choose or derive
receipt bytes; it only stores the exact ID/hash returned by the owner.

## 3. Complete materialized receipt contract

The owner receipt is a complete immutable canonical projection materialization, not only a hash or a
list copied from the Snapshot Manifest. The exact v1 payload keys are:

```text
schema_version: 1
namespace
stream_id
projection_receipt_id
subject_snapshot_id
observed_revision_vector: complete same-scope five-axis vector
fact_relation_policy_hash: exact accepted Fact/Relation authority policy hash
receipt_policy_hash: exact receipt policy hash
facts: all latest authoritative Fact revisions visible at capture, lexical by fact_id
relations: all latest authoritative Relation revisions visible at capture, lexical by relation_id
created_at: owner capture timestamp
```

Each Fact and Relation entry is the full canonical owner object, including exact object revision,
authority commit ID, canonical content, provenance, observed vector, object hash and creation time. The
combined Fact/Relation count remains bounded by the accepted owner graph bound of 10,000. Empty
projections are represented by empty arrays and still receive a durable receipt.

```text
projection_receipt_hash = sha256(exact canonical receipt JSON UTF-8 bytes)
```

The receipt row stores those exact canonical JSON bytes and hash. A hash without the immutable complete
materialization is invalid. On exact read the owner must validate schema/policy/scope/derived identity,
canonical bytes/hash, lexical uniqueness, full graph invariants, and every materialized object's exact
immutable owner revision/commit binding. Later Fact/Relation revisions do not alter or replace the
historical receipt.

## 4. Receipt policy identity

```text
CANONICAL_FACT_RELATION_PROJECTION_RECEIPT_SCHEMA_VERSION = 1
CANONICAL_FACT_RELATION_PROJECTION_RECEIPT_POLICY_VERSION =
  canonical-fact-relation-projection-receipt/v1
CANONICAL_FACT_RELATION_PROJECTION_RECEIPT_POLICY_HASH =
  610102fa139bcfb34c1a0bea0ff177ac3f1d7238bf2949a9f27ab4b13ae5b93b
```

The exact canonical policy bytes are:

```json
{"bounds":{"identifier":500,"total_objects":10000},"capture":"complete-current-authoritative-fact-relation-projection","content":"immutable-canonical-projection-materialization","identity":"owner-derived-sha256-canonical-scope-plus-subject-snapshot-id","owner":"canonical-fact-relation","policy_version":"canonical-fact-relation-projection-receipt/v1","replay":"receipt-first-exact-owner-object-proof","schema_version":1,"scope":"explicit-same-scope-only","transaction":"caller-owned-sqlite-transaction-no-lifecycle","vector":"observe-five-components-no-advance"}
```

The accepted `CANONICAL_FACT_RELATION_POLICY_HASH` and Fact/Relation authority schema version remain
unchanged. Receipt is an additive owner sub-schema and does not change Fact/Relation commit semantics.

## 5. Snapshot contract amendment

The QA-return repair replaces the rejected Snapshot v1 runtime grammar with v2:

```text
CONTEXT_SNAPSHOT_SCHEMA_VERSION = 2
CONTEXT_SNAPSHOT_POLICY_VERSION = context-snapshot/v2
CURRENT_AUTHORITY_PROJECTION_VERSION = current-authority-hot-raw/v2
CONTEXT_SNAPSHOT_POLICY_HASH =
  279ceac17c144e99a39a041c5814f6b2e0643ecfc5ef6afe5a57f8d4bace8d6a
```

The assembler version/hash and token estimator remain unchanged. `ContextSnapshotFreezeInput`,
`ContextSnapshotManifest` and `AttemptStarted` use `schema_version: 2`. Manifest adds exactly one
required owner reference:

```text
fact_relation_projection_receipt_ref: {
  projection_receipt_id,
  projection_receipt_hash
}
```

It continues to carry `fact_relation_policy_hash`; receipt policy and full projection content are
validated by the owner receipt read, not duplicated into the Snapshot-selected view.

The exact v2 Snapshot policy bytes are:

```json
{"assembler_version":"priority-bucket-whole-object/v1","assembly":{"buckets":["P0_CURRENT_INPUT_CONSTRAINT_REQUIRED_CLOSURE","P1_ALL_CURRENT_STATE_HOT_RAW_SUFFIX","P2_CURRENT_COMPACTION_ARTIFACT_IF_FITS","P3_EMPTY"],"estimator":"character-count-divided-by-four/v1","mandatory_overflow":"BUDGET_INSUFFICIENT_NO_SNAPSHOT","trim":"lowest-bucket-first-whole-object-no-partial"},"attempt":"same-transaction-immutable-start-receipt","body":"persisted-immutable-utf8-text","bounds":{"external_content_refs":100,"hard_token_capacity":1000000,"identifier":500,"required_fact_refs":1000,"required_raw_refs":1000,"required_relation_refs":2000,"required_state_ids":1000,"stable_ref":2000},"current_authority":{"default_excluded":["CONSTRAINT/SUPERSEDED","DECISION/SUPERSEDED","GOAL/COMPLETED","GOAL/SUPERSEDED","OPEN_QUESTION/DEFERRED","OPEN_QUESTION/RESOLVED","REJECTED_ALTERNATIVE/REJECTED"],"default_selected":["CONSTRAINT/ACTIVE","DECISION/ACTIVE","GOAL/ACTIVE","OPEN_QUESTION/OPEN"],"placement":"all-current-included-no-persistent-hot-cold"},"dedup":"exact-authority-identity-no-display-dedup","dependencies":{"closure":"deterministic-transitive-state-fact-from-owner-complete-receipt","relation":"active-DEPENDS_ON-receipt-object-graph"},"evidence":"empty-wo05-reserved-contract-fields","external_content":"stable-ref-plus-sha256","fact_relation_receipt":{"capture":"owner-complete-projection-before-selection","manifest_binding":"receipt-id-plus-receipt-hash","orphan":"exactly-one-owner-receipt-per-snapshot-or-fail-closed","replay":"owner-receipt-to-complete-graph-to-expected-closure-to-manifest-and-body","tamper":"snapshot-selected-view-cannot-author-owner-receipt"},"host":"opaque-digest-only","hot_raw":{"current_input":"exact-user-input-event-single-render","eligibility":"frontier-position-exclusive-to-ledger-as-of-inclusive","projection":"identity-full-event-canonical-json","selection":"latest-contiguous-whole-event-suffix-after-required"},"inclusion_reasons":["CURRENT_AUTHORITY","CURRENT_INPUT","CURRENT_TAKEOVER_ARTIFACT","DEPENDENCY_CLOSURE","EXPLICIT_REQUIRED","HARD_CONSTRAINT","HOT_RAW_SUFFIX"],"input_world":"begin-immediate-exact-five-axis-cas-plus-owner-receipt","normalization":"nfc-no-unicode-cc-lexical-unique-sorted-inputs","policy_version":"context-snapshot/v2","projection_version":"current-authority-hot-raw/v2","retry":"exact-request-replay-owner-receipt-binding-id-substitution-conflict","schema_version":2,"scope":"explicit-only-no-host-inference","unknown":"fail-closed"}
```

The returned v1 candidate was never accepted. An existing `cc_context_snapshot_schema` completion row
with version 1 cannot be safely backfilled because the historical complete axis-neutral projection may
already be unknowable. v2 startup must fail closed `CORRUPT_DATA`; it must not infer a receipt from old
Manifest selected refs or the current Fact/Relation projection. Fresh v2 databases and exact v2 reopen
are required by WO-05.

## 6. Same-handle owner seams

The additive owner module may expose only Core-private functions equivalent to:

```text
inspectCanonicalFactRelationProjectionReceiptInsideCore(
  database, scope, subject_snapshot_id
) -> receipt | undefined

captureCanonicalFactRelationProjectionReceiptInsideCore(
  database, scope, subject_snapshot_id, observed_vector
) -> complete immutable receipt

readCanonicalFactRelationProjectionReceiptInsideCore(
  database, scope, projection_receipt_id, subject_snapshot_id
) -> complete immutable receipt
```

They receive the caller-owned `DatabaseSync` handle. They never begin, commit or roll back a
transaction and never advance a revision. Capture requires the live five-axis vector to equal the
observed vector, loads/proves the complete current owner projection, inserts the owner receipt, exact
reads it back and returns it. Read validates exact historical object revisions; it does not substitute
the current projection.

These functions remain absent from package-root and Core public APIs. Snapshot may use the receipt's
returned projection for selection but cannot call a selected-ref authority read as its historical graph
root.

## 7. Atomic freeze and retry order

The repaired freeze order is fixed:

```text
normalize v2 request + fingerprint
BEGIN IMMEDIATE on the Snapshot owner's single handle
  inspect Snapshot ID + Attempt ID + owner receipt by subject Snapshot ID
    exact complete triple -> exact receipt-first replay
    any partial/orphan/mismatched triple -> fail closed

  read live five-axis vector; require exact expected vector
  read/prove State, Raw and Takeover/Artifact authority
  Fact/Relation owner captures complete projection receipt
  derive dependency graph/closure only from receipt projection
  assemble Working Context and build Manifest with returned receipt ID/hash
  re-read five-axis vector; require unchanged
  insert immutable Snapshot
  insert immutable AttemptStarted
  exact receipt-first readback and body/Manifest validation inside transaction
COMMIT
```

Any failure after owner receipt insert and before successful commit rolls back receipt, Snapshot and
Attempt together. Receipt has no FK to the Snapshot table because that would invert owner dependencies
and cannot exist before Manifest construction; atomicity plus owner-subject uniqueness provides the
creation invariant. Stored-read collision inspection enforces the surviving invariant:

```text
exactly one receipt + one Snapshot + one Attempt, all mutually bound
or fail closed
```

Exact retry lookup happens before live-vector comparison and never recaptures from a later
Fact/Relation world. Concurrent same-ID freezes serialize under `BEGIN IMMEDIATE`; the winner commits
one triple and a compatible loser replays it. Same IDs with different normalized request remain
`CONFLICT`. Receipt without Snapshot/Attempt, Snapshot/Attempt without receipt, duplicate subject
binding, receipt ID/hash substitution or mismatched subject is `CORRUPT_DATA`.

## 8. Receipt-first replay algorithm

Exact read and replay must use this order:

```text
Manifest receipt ID/hash
  -> Fact/Relation owner exact receipt read
  -> complete historical canonical Fact/Relation projection
  -> exact root selection + active DEPENDS_ON traversal
  -> expected selected Fact/Relation refs + dependency paths
  -> compare full rebuilt Manifest
  -> rebuild Working Context
  -> compare persisted body/hash/cost
```

The Manifest's selected refs are comparison output, never the input authority graph. Coordinated
deletion of a Relation, Fact, dependency path and body fragment remains detectable even when every
Snapshot-local hash is recomputed and Snapshot triggers are restored. Changing or replacing the owner
receipt is owner-authority tamper and must fail the receipt schema/hash/object-binding checks.

## 9. Required adversarial matrix

The append-only fix and fresh Independent QA must retain the returned candidate's tests and add at
least:

```text
S0 capture; coordinated Manifest/Fact/Relation/path/body omission       -> CORRUPT_DATA
S1 capture; later axis-neutral Fact commit; same omission               -> CORRUPT_DATA
S2 capture; later axis-neutral Relation commit; same omission           -> CORRUPT_DATA
S3 capture; later Fact + Relation commits; exact old replay             -> original graph/body
S4 injected failure after receipt / Snapshot / Attempt, or before COMMIT
   -> receipt + Snapshot + Attempt all absent
S5 exact retry + concurrent same-ID freeze
   -> one identical triple; no orphan or duplicate owner receipt
```

Also required: empty receipt projection, cross-scope/subject/hash substitution, partial receipt schema,
marker/table/trigger/row tamper, accepted Fact/Relation v1 schema plus additive receipt migration,
reopen, unsupported Snapshot v1 fail-closed, policy substitution, and the original full regression,
`npm test`, `npm run build` and `git diff --check`.

## 10. Gate conclusion and bounded allowlist

The existing same-handle owner shape and SQLite transaction are sufficient. A temporary two-handle
probe observed that a receipt/Snapshot/Attempt triple is visible inside one transaction, a concurrent
writer is blocked, rollback leaves `0/0/0`, commit exposes `1/1/1`, and duplicate subject receipt is
rejected. No generic transaction framework or substrate change is needed.

Source may resume only within:

```text
src/canonical-fact-relation.ts
src/context-snapshot.ts
test/canonical-fact-relation.test.ts
test/context-snapshot.test.ts
docs/architecture/WO-05-fact-relation-projection-receipt-gate-addendum.md
docs/inventory/WO-05/fact-relation-projection-receipt-schema-map.md
docs/inventory/WO-05/**
docs/handoffs/WO-05-context-snapshot-contract-fix.md
docs/work-orders/WO-05-context-snapshot-contract.md
docs/PROJECT_STATE.md
docs/ROADMAP.md
```

All other source/test/config/evaluation/official artifact paths remain frozen. In particular, no change
is authorized to revision substrate, Ledger, State, Takeover, transaction coordinator, assembler,
operational context, Core/public package surface, MCP, package/config, frozen v0, Host, WO-06/07,
provider/model/network or sibling repositories.
