# WO-01 Persistence and Transaction Map

Source baseline: `f618ed4af4b40bc51b5b3eb8fc19bf1e61c51f52`

## SQLite connection contract

Every store uses `initializeSqliteConnection`:

```text
foreign_keys = ON
busy_timeout = 5000
synchronous = FULL
journal_mode = WAL (file DB only)
bounded retry for BUSY/LOCKED initialization only
```

The service opens four connections to the same database file. `BEGIN IMMEDIATE` therefore acts as a database-wide writer fence across store instances, while reads occur through their owning connections.

## Persistence map

| Operation | DB/file/table | Transaction and commit point | Crash before commit | Crash after commit | Recovery / idempotency |
|---|---|---|---|---|---|
| Store initialization/migration | All current SQLite schema | Per-store DDL; Raw and Experience migrations use `BEGIN IMMEDIATE`; State DDL is executed by the initialization callback | SQLite rolls back transactional DDL; constructor fails with stable storage error at service boundary | Schema is visible to later connections | BUSY/LOCKED has bounded retry; legacy Dense column and EVENT mirror backfill are deterministic |
| Ingest Raw | `sessions`, `raw_events`, `experience_ledger(EVENT)` | One Raw connection `BEGIN IMMEDIATE`; Raw + mirror `COMMIT` together | Neither Raw nor EVENT mirror commits | Both are durable and reopenable | Same `(session_id, source_event_id)` and identical input returns existing row; conflict otherwise |
| Backfill legacy Raw mirrors | `experience_ledger(EVENT)` | Experience migration transaction over ordered Raw rows | No partial backfill commit | Missing mirrors are present in deterministic Raw order | Existing exact mirror accepted; mismatch conflicts |
| Public research append | `sessions`, `experience_ledger` | One `BEGIN IMMEDIATE` per record | No row/seq consumed | Record is durable and ordered per session | `(session_id, source_key)` exact retry returns existing; changed data conflicts |
| Compile without `operation_id` before trusted baseline | None | Compile telemetry `BEGIN IMMEDIATE` still fences the read; no append; commit | No persistent change | No persistent change | Recomputed from current database state; after a trusted baseline the same no-id request is rejected |
| Compile with `operation_id` | `experience_ledger(CONTEXT_COMPILE/RETRIEVAL_HIT)` | One database-wide `BEGIN IMMEDIATE` covers State/Raw/Ledger reads, assembly, trace and all hit appends | All trace/hit rows roll back; Raw/State unchanged | Complete trace batch is durable and establishes/extends telemetry continuity | Stable operation-derived source keys; exact retry returns same trace/hits; changed input conflicts |
| Prepare State update | `state_update_preparations` | State transaction captures revision/evidence and commits immutable row | No preparation identity | Preparation persists even if later extraction/apply never occurs | Token is UUID; row and snapshot fingerprint immutable; no retention/GC policy |
| Extract candidate delta | Child process/stdin/stdout only | No DB transaction | Preparation may remain orphaned; State unchanged | Candidate remains in caller memory until apply | Bounded attempts/timeout; fallback is not applied by RuntimeStateUpdater |
| Apply empty State delta | Preparation read + State transaction | Parse first; `BEGIN IMMEDIATE` at expected revision; no dirty State write; commit | State unchanged | State revision unchanged | Same preparation/empty delta can be retried identically while revision remains current |
| Apply non-empty State delta | `context_items`, `state_relations`, `context_state_revisions` | Snapshot revalidation and all reducer writes share one expected-revision `BEGIN IMMEDIATE`; revision increments once on dirty commit | All item/relation/revision writes roll back | New State and revision are durable | Retry at old expected revision conflicts; competing updates allow one commit |
| Headline creation | `history_headlines`, `history_headlines_fts` | One `BEGIN IMMEDIATE`; base and FTS rows commit together | Both roll back | Both durable and exactly recallable | Same session/range and same content returns existing; changed content conflicts |
| Exact/keyword recall | Read-only | No write transaction | No data change | No data change | Deterministic bounded read; FTS ranking stable by rank/id |
| Compiled Context body | None | In memory only | No durable snapshot exists | Return may reach caller, but Core has no replay identity for that delivery | Can be recomputed only from caller input plus current database; not an immutable Attempt snapshot |
| Offline evaluation | Temporary SQLite under OS temp directory | Separate temporary database per case | Runner maps unexpected failure to `RUNTIME_FAILURE` | Report returned in memory/CLI stdout | Runner deletes temporary root in `finally`; official artifacts are separate work-order outputs |
| Tool side effect/result | **NOT PRESENT** | None | Unknown to this repository | Unknown to this repository | No action fence or reconciliation |
| Response/delivery | **NOT PRESENT** | None | Generated response can be lost outside Core | User receipt is unobservable to Core | No stable delivery identity/outbox |
| Background maintenance | **NOT PRESENT** | None | Not applicable | Not applicable | No worker/job recovery |

## Important transaction boundaries

### Raw plus EVENT mirror

`SqliteRawHistoryStore.ingest` appends Raw and calls the internal mirror writer on the same connection before commit. The injected-failure test proves a failed mirror insert rolls back the Raw row.

### Compile telemetry origin

`withCompileTelemetryBoundaryInsideService` obtains `BEGIN IMMEDIATE` before reading State, Raw, and prior Ledger records. Competing writers block until the first trace commits or rolls back. Cross-process tests prove that:

- committed first trace makes a later no-id compile reject;
- rolled-back first trace leaves no baseline, so a later no-id compile remains read-only;
- trace and hit insert failure leaves zero compile/hit rows and does not change Raw or State.

### State prepare/apply

Preparation is durable but not consumed. Apply checks the stored fingerprint, parses the complete delta, then revalidates the preparation and expected revision inside the same transaction as reducer changes. This closes stale-State partial mutation, but leaves unbounded orphan preparation retention as a known gap.

## Persistence objects that do not exist

- Raw Frontier revision/position
- Semantic Takeover/Enrichment commit
- first-class Fact and Relation revisions
- immutable ContextSnapshot Manifest
- AttemptStarted
- Action lifecycle/ToolResult journal
- Verification Result
- ResponsePrepared/Outbox/delivery lifecycle
- shadow namespace/promotion event
