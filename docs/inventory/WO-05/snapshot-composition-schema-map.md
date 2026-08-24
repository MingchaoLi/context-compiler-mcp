# WO-05 Snapshot Composition / Schema Map

Status: PRE-SOURCE FROZEN

Source baseline: `0dbff6a8a148f37fcabef7accf7f71d057e1a90f`
Execution Baseline commit: `18a2ab3dc02657200e5d96eec3bfc9a715c316e6`

## 1. Existing owner map

| Object | Table / authority | Current owner | WO-05 access | Mutation |
|---|---|---|---|---|
| Five-axis stream | `cc_revision_streams` | `revision-substrate` | same-handle exact read/equality | none |
| Revision markers | `cc_revision_commits` | `revision-substrate` | indirect owner proof | none |
| Raw Event | `cc_ledger_raw_events` | `ledger-hot-raw` | new read-only same-handle seam | none |
| Canonical State | `cc_canonical_state_revisions` | `canonical-state` | new projection same-handle seam | none |
| Fact authority | `cc_canonical_fact_*` | `canonical-fact-relation` | new current-projection same-handle seam | none |
| Relation authority | `cc_canonical_relation_*` | `canonical-fact-relation` | same seam; active `DEPENDS_ON` only for closure | none |
| Takeover + Artifact | `cc_semantic_*`, `cc_compaction_artifacts` | `semantic-takeover` | existing current/read same-handle seams | none |
| Frozen v0 context | legacy Raw/State/trace tables | existing v0 modules | no read/write | none |

WO-05 does not call public owner methods inside its transaction because those methods open separate
transactions/connections. It calls only owner-defined read seams receiving the current `DatabaseSync`.

## 2. New schema owner

`src/context-snapshot.ts` is the sole owner of three new schema objects plus immutable triggers.

### `cc_context_snapshot_schema`

```text
version INTEGER PRIMARY KEY CHECK (version > 0)
completed_at TEXT NOT NULL
```

Exactly one v1 completion row. Update/delete forbidden.

### `cc_context_snapshots`

```text
namespace TEXT NOT NULL
stream_id TEXT NOT NULL
snapshot_id TEXT NOT NULL
operation_id TEXT NOT NULL
attempt_id TEXT NOT NULL
request_fingerprint TEXT NOT NULL  -- lowercase sha256
request_json TEXT NOT NULL         -- exact canonical normalized request
manifest_hash TEXT NOT NULL        -- lowercase sha256
manifest_json TEXT NOT NULL        -- exact canonical Manifest descriptor
working_context_hash TEXT NOT NULL -- lowercase sha256 of UTF-8 body
working_context_text TEXT NOT NULL
created_at TEXT NOT NULL

PRIMARY KEY (namespace, stream_id, snapshot_id)
UNIQUE (namespace, stream_id, attempt_id)
FOREIGN KEY (namespace, stream_id)
  REFERENCES cc_revision_streams(namespace, stream_id)
```

JSON validity, identifier length and hash-shape checks are mandatory. Update/delete forbidden.

### `cc_context_attempt_starts`

```text
namespace TEXT NOT NULL
stream_id TEXT NOT NULL
attempt_id TEXT NOT NULL
operation_id TEXT NOT NULL
snapshot_id TEXT NOT NULL
snapshot_manifest_hash TEXT NOT NULL
created_at TEXT NOT NULL

PRIMARY KEY (namespace, stream_id, attempt_id)
UNIQUE (namespace, stream_id, snapshot_id)
FOREIGN KEY (namespace, stream_id, snapshot_id)
  REFERENCES cc_context_snapshots(namespace, stream_id, snapshot_id)
  DEFERRABLE INITIALLY DEFERRED
```

Update/delete forbidden. The read path verifies equality with the Snapshot row, not only FK existence.

### Exact immutable triggers

```text
cc_context_snapshot_schema_no_update
cc_context_snapshot_schema_no_delete
cc_context_snapshots_no_update
cc_context_snapshots_no_delete
cc_context_attempt_starts_no_update
cc_context_attempt_starts_no_delete
```

Migration is additive and last-completion-marker. If any target object exists without the exact complete
schema/trigger set, open fails `CORRUPT_DATA`; no salvage/backfill is attempted.

## 3. Same-handle read seams

### Ledger

```text
readLedgerHotRawInsideCore(database, scope, observed_vector)
readLedgerRawEventsInsideCore(database, scope, exact_event_ids, ledger_as_of)
```

The owner validates row canonical payloads, exact scope/ID/revision uniqueness, contiguous eligible range
and `frontier_position < revision <= ledger_as_of`. It never begins/commits/rolls back.

### State

```text
readCanonicalStateProjectionInsideCore(database, scope, observed_vector)
```

Revision zero returns the exact empty v1 projection only if no state row/marker at revision zero exists.
Positive revisions validate the complete `1..observed.state_revision` owner chain and return the exact
latest immutable State/state hash/policy hash.

### Fact / Relation

```text
readCanonicalFactRelationProjectionInsideCore(database, scope, observed_vector)
```

It loads latest object revisions, proves owner commit/object/Raw/State endpoint bindings and returns stable
Fact/Relation order. It performs no mutation and no transaction lifecycle.

### Takeover / Artifact

```text
readCurrentSemanticTakeoverInsideCore(database, scope)
readSemanticTakeoverInsideCore(... exact ref ...)
readCompactionArtifactInsideCore(... exact ref ...)
```

Existing seams are sufficient and unchanged.

## 4. Transaction call chain

```text
SqliteContextSnapshotStore.freeze
  normalize request + request fingerprint
  BEGIN IMMEDIATE
    lookup Snapshot by snapshot_id
    lookup Attempt by attempt_id
      compatible pair -> exact read/replay
      partial/mismatched collision -> CONFLICT/CORRUPT_DATA

    SELECT exact cc_revision_streams row
    compare full vector to expected_revision_vector

    Ledger owner read seams
    State owner projection seam
    Fact/Relation owner projection seam
    Semantic current Takeover/Artifact seam

    pure deterministic projection / closure / assembly
    budget gate
    SELECT stream vector again; require equality

    INSERT cc_context_snapshots
    INSERT cc_context_attempt_starts
  COMMIT
  read exact persisted Snapshot + Attempt
```

No accepted table is written and no five-axis component changes. `BEGIN IMMEDIATE` serializes all current
writers before the frozen reads. Axis-neutral Fact/Relation/Enrichment writers also use write transactions
and therefore cannot cross this freeze.

## 5. Replay and collision matrix

| Condition | Result |
|---|---|
| Same snapshot ID + same attempt ID + byte-equivalent normalized request | exact original result |
| Same snapshot ID + different request or attempt | `CONFLICT` |
| Same attempt ID + different snapshot/request | `CONFLICT` |
| Snapshot row without matching Attempt row | `CORRUPT_DATA` |
| Attempt row without Snapshot | FK/`CORRUPT_DATA` |
| Stored request/manifest/body hash mismatch | `CORRUPT_DATA` |
| New freeze expected vector differs from live vector | `CONFLICT` |
| Exact retry after later authority commits | original result, after exact stored validation |
| Different IDs at same vector | two valid immutable Snapshots |

Replay lookup happens before new-freeze expected-vector comparison.

## 6. Read validation graph

```text
Snapshot row
  ├─ request_json/fingerprint
  ├─ manifest_json/hash
  ├─ working_context_text/hash/cost
  ├─ AttemptStarted two-way identity/hash
  ├─ frozen five-axis vector <= live vector
  ├─ exact State revision/hash/policy/selected refs
  ├─ exact Raw revision/event refs + Hot Raw/current-input hashes
  ├─ exact Fact/Relation object revisions/hashes + dependency paths
  └─ exact Takeover/Artifact ID/hash when present
```

Any broken edge fails closed. The body is not regenerated from current projections for old Snapshots;
its persisted immutable bytes/hash are the execution input. Exact owner refs remain independently
auditable.

## 7. Maximum Builder allowlist

```text
src/context-snapshot.ts
src/ledger-hot-raw.ts                 # Core-private read seam only
src/canonical-state.ts                # Core-private projection seam only
src/canonical-fact-relation.ts        # Core-private projection seam only
src/core.ts
src/index.ts
test/context-snapshot.test.ts
test/core-boundary.test.ts
docs/architecture/WO-05-context-snapshot-contract.md
docs/inventory/WO-05/**
docs/handoffs/WO-05-context-snapshot-contract.md
```

Frozen/no-change paths include:

```text
src/revision-substrate.ts
src/semantic-takeover.ts
src/authority-transaction-coordinator.ts
src/assembler.ts
src/operational-context.ts
src/sqlite-initialization.ts
src/mcp-service.ts
src/mcp-server.ts
package.json / package-lock.json / tsconfig.json
test/mcp-service.test.ts / test/mcp-protocol.test.ts
evaluation/** / official artifacts / legacy migrations
```

The Builder may change fewer paths but cannot add a source/test/config path without first invalidating
and explicitly reopening this Gate.

## 8. Pre-source evidence

```text
npx vitest run
  test/revision-substrate.test.ts
  test/ledger-hot-raw.test.ts
  test/canonical-state.test.ts
  test/canonical-fact-relation.test.ts
  test/semantic-takeover.test.ts
  test/authority-transaction-coordinator.test.ts

PASS: 6 files / 66 tests
```

An isolated two-connection SQLite probe additionally observed:

```text
writer_blocked_during_freeze: true
committed_snapshot_and_attempt: true
rollback_left_no_partial: true
```

All DB writes were under a temporary directory; no production DB, network, model or sibling repository
was used.
