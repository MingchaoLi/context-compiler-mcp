# WO-05 Fact/Relation Projection Receipt — Owner / Schema / Call-Chain Map

Status: PRE-SOURCE QA-RETURN REPAIR GATE FROZEN

Repair source baseline: `32e2e13248f72eecfbac54ecfd91db29e7d7111b`  
Repair baseline commit: `9200d539c06698543542e027c28d2491f3bfbc91`

## 1. Mechanical finding

| Required fact | Repository evidence | Consequence |
|---|---|---|
| Fact/Relation commits are axis-neutral | accepted policy: `observe-five-components-no-advance` | five-axis Snapshot identity cannot distinguish later Fact/Relation commits |
| Object revisions are immutable and exact-readable | `cc_canonical_fact_revisions`, `cc_canonical_relation_revisions`, owner commit rows and immutable triggers | a receipt can bind exact historical objects without copying a new writer |
| Current projection is complete at capture | `readCanonicalFactRelationProjectionInsideCore` loads latest Fact/Relation revisions, proves commit/object/endpoints and full graph | owner capture can materialize the complete world in the Snapshot transaction |
| Returned replay is selected-ref rooted | `validateManifestAuthority` reads only `manifest.selected_*_refs` | coordinated omission cannot be detected without an independent enumeration |
| Snapshot already owns one single-handle `BEGIN IMMEDIATE` | `SqliteContextSnapshotStore.freeze` | owner receipt capture can compose without nested/cross-connection transactions |
| Accepted owner schema marker is immutable v1 | `cc_canonical_fact_relation_schema` allows exactly one immutable completion row | receipt must use an additive owner sub-schema, not rewrite the accepted marker |

Conclusion: the smallest correct extension is an immutable complete-projection receipt sub-schema owned
by `canonical-fact-relation`. Snapshot remains a consumer and stores only the returned reference.

## 2. Owner boundary

| Object / operation | Owner | Snapshot permission | Revision effect |
|---|---|---|---|
| Fact/Relation commits and object revisions | `canonical-fact-relation` | read through owner seam | existing axis-neutral behavior |
| projection receipt schema/migration | `canonical-fact-relation` | none | none |
| receipt ID, canonical payload and hash | `canonical-fact-relation` | reference exact returned ID/hash | none |
| complete projection capture/read/proof | `canonical-fact-relation` | call same-handle private seam | none |
| selected refs, closure paths, Manifest/body | `context-snapshot` | own deterministic projection | none |
| Snapshot + Attempt lifecycle | `context-snapshot` | own | none |

The receipt is not exported at package root and does not add a Core method. Snapshot cannot insert into,
update, delete, enumerate around or repair the receipt table directly.

## 3. Additive owner sub-schema

The accepted `cc_canonical_fact_relation_schema` and its v1 row remain byte/semantics unchanged. After
the accepted owner migration succeeds, the same initialization callback runs a second owner migration
for the following exact logical objects.

### `cc_canonical_fact_relation_projection_receipt_schema`

```sql
CREATE TABLE cc_canonical_fact_relation_projection_receipt_schema (
  version INTEGER PRIMARY KEY CHECK (version > 0),
  completed_at TEXT NOT NULL
)
```

Exactly one immutable version-1 completion row. Completion is written last.

### `cc_canonical_fact_relation_projection_receipts`

```sql
CREATE TABLE cc_canonical_fact_relation_projection_receipts (
  namespace TEXT NOT NULL CHECK (length(namespace) > 0 AND length(namespace) <= 500),
  stream_id TEXT NOT NULL CHECK (length(stream_id) > 0 AND length(stream_id) <= 500),
  projection_receipt_id TEXT NOT NULL CHECK (
    length(projection_receipt_id) = 69 AND
    substr(projection_receipt_id, 1, 5) = 'frpr-' AND
    substr(projection_receipt_id, 6) NOT GLOB '*[^0-9a-f]*'
  ),
  subject_snapshot_id TEXT NOT NULL CHECK (
    length(subject_snapshot_id) > 0 AND length(subject_snapshot_id) <= 500
  ),
  receipt_policy_hash TEXT NOT NULL CHECK (
    receipt_policy_hash = '610102fa139bcfb34c1a0bea0ff177ac3f1d7238bf2949a9f27ab4b13ae5b93b'
  ),
  projection_receipt_hash TEXT NOT NULL CHECK (
    length(projection_receipt_hash) = 64 AND
    projection_receipt_hash NOT GLOB '*[^0-9a-f]*'
  ),
  receipt_json TEXT NOT NULL CHECK (json_valid(receipt_json)),
  created_at TEXT NOT NULL,
  PRIMARY KEY (namespace, stream_id, projection_receipt_id),
  UNIQUE (namespace, stream_id, subject_snapshot_id),
  FOREIGN KEY (namespace, stream_id)
    REFERENCES cc_revision_streams(namespace, stream_id)
    ON UPDATE RESTRICT ON DELETE RESTRICT
)
```

The full immutable payload is stored in `receipt_json`; no selected refs are stored in separate mutable
columns. `projection_receipt_hash` is SHA-256 over the exact canonical JSON bytes. Scope, ID, subject,
policy hash and `created_at` columns must equal their payload values on every owner read.

### Exact immutability triggers

```text
cc_canonical_fact_relation_projection_receipt_schema_no_update
cc_canonical_fact_relation_projection_receipt_schema_no_delete
cc_canonical_fact_relation_projection_receipts_no_update
cc_canonical_fact_relation_projection_receipts_no_delete
```

Migration behavior:

```text
accepted Fact/Relation v1 migration/validation
  -> BEGIN IMMEDIATE receipt sub-schema migration
       marker exists -> validate exact table/columns/SQL/triggers + exactly one v1 row
       marker absent -> reject any partial target object
                     -> create table + triggers
                     -> validate exact objects
                     -> insert completion row last
     COMMIT
```

Any partial/colliding/tampered object fails `CORRUPT_DATA`; there is no salvage or backfill. Existing
accepted Fact/Relation rows are not rewritten.

## 4. Receipt payload and hash map

```text
CanonicalFactRelationProjectionReceiptV1
  schema_version = 1
  namespace / stream_id
  projection_receipt_id
  subject_snapshot_id
  observed_revision_vector
  fact_relation_policy_hash
  receipt_policy_hash
  facts[]      # full owner canonical Fact objects, lexical by fact_id
  relations[]  # full owner canonical Relation objects, lexical by relation_id
  created_at
```

Identity input and output:

```text
identity_bytes = canonicalJson({ namespace, stream_id, subject_snapshot_id })
projection_receipt_id = "frpr-" + sha256(identity_bytes)

receipt_bytes = canonicalJson(complete receipt payload)
projection_receipt_hash = sha256(receipt_bytes)
```

The payload's complete object arrays, not the hash alone, are the historical authority witness. Each
object continues to be proved against its original accepted owner revision and commit rows.

## 5. Same-handle call chain

```text
SqliteContextSnapshotStore.freeze(v2)
  BEGIN IMMEDIATE
    inspect Snapshot + Attempt rows
    canonical-fact-relation owner inspect receipt by subject Snapshot ID

    if exact triple exists:
      read Snapshot request/Manifest/body
      owner read exact receipt by Manifest ID + subject
      verify Manifest hash equals owner receipt hash
      rebuild from complete receipt projection
      COMMIT and return stored result

    if any partial/orphan/mismatch:
      fail closed and ROLLBACK

    read exact five-axis vector == expected
    read State / Raw / Takeover owner projections
    owner capture projection receipt:
      validate receipt sub-schema
      derive receipt ID
      assert no ID/subject collision
      require live vector == observed
      read complete current Fact/Relation projection
      prove all owner objects + complete graph
      build canonical receipt bytes/hash
      insert immutable receipt
      exact owner readback

    Snapshot selection/closure reads only returned receipt projection
    assemble body + build Manifest with receipt ID/hash
    re-read five-axis vector == observed
    insert Snapshot
    insert AttemptStarted
    exact receipt-first in-transaction readback
  COMMIT
```

No owner seam begins or ends the transaction. No revision stream row is changed.

## 6. Manifest and replay binding

`ContextSnapshotManifest v2` adds:

```text
fact_relation_projection_receipt_ref: {
  projection_receipt_id,
  projection_receipt_hash
}
```

Read validation graph becomes:

```text
Snapshot row + immutable Manifest/body
  -> Attempt exact two-way binding
  -> Manifest receipt ID/hash
  -> owner receipt row canonical bytes/hash/subject/policy
  -> exact historical Fact/Relation object revisions and full graph
  -> deterministic selected refs + dependency paths
  -> rebuilt Manifest equality
  -> rebuilt Working Context equality/hash/cost
```

The old edge:

```text
Manifest selected refs -> selected owner reads -> Manifest proof
```

is prohibited as the historical graph root. It may exist only as an additional exact-object check after
the complete receipt has already established the expected graph.

## 7. Retry, race, rollback and orphan table

| State seen inside `BEGIN IMMEDIATE` | Required result |
|---|---|
| no receipt / Snapshot / Attempt | new capture allowed |
| exact receipt + Snapshot + Attempt + same request | exact receipt-first replay |
| receipt only | `CORRUPT_DATA` orphan |
| Snapshot/Attempt without receipt | `CORRUPT_DATA` |
| only Snapshot or only Attempt | existing partial-row fail-closed contract |
| receipt subject/ID/hash differs from Manifest | `CORRUPT_DATA` |
| same ID, different normalized request | `CONFLICT` |
| concurrent same-ID new freezes | SQLite serialization; one triple, compatible loser replay |
| any error after receipt insert | rollback receipt + Snapshot + Attempt |
| later axis-neutral Fact/Relation commit | old receipt/replay unchanged |

The receipt table intentionally has no FK to `cc_context_snapshots`: the Fact/Relation owner may not
depend on a Snapshot-owned table, and receipt capture precedes Manifest construction. Atomic creation,
unique subject binding and exact stored-read validation close the lifecycle without reversing ownership.

## 8. Snapshot storage version and migration

The physical Snapshot tables remain the original three-table shape; the exact Manifest/request grammar
and completion marker advance to v2. A fresh database creates one `cc_context_snapshot_schema` version-2
row. A database containing the returned candidate's version-1 marker fails startup `CORRUPT_DATA`.

No v1-to-v2 backfill is allowed: an old Manifest selected projection cannot prove what axis-neutral
Fact/Relation objects existed when it was frozen, and current objects may include later writes with the
same five-axis vector. Reconstructing a receipt in either way would recreate the QA defect.

## 9. Probe evidence

An isolated temporary two-handle SQLite probe, without repository or production DB writes, observed:

```text
inside transaction receipt/Snapshot/Attempt counts: 1 / 1 / 1
concurrent BEGIN IMMEDIATE writer blocked: true
rollback counts: 0 / 0 / 0
commit counts visible to second handle: 1 / 1 / 1
duplicate subject receipt rejected: true
```

This proves the proposed owner table can participate in the existing Snapshot transaction without a
generic coordinator, cross-connection choreography or sixth revision axis.

## 10. Append-only repair allowlist

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

The repair may change fewer paths but may not add any source/test/config path. It must not modify the
accepted Fact/Relation policy/hash/commit tables, shared substrate, Ledger, State, Takeover, coordinator,
assembler, operational context, Core/package-root/MCP surface, dependencies/config, frozen v0,
evaluation/official artifacts or any Host/sibling repository.
