# WO-03B Ledger Schema / Replay Map

Baseline: `06d736a0a8a7ab3cfb03228b345898ac4a57a658`

This inventory maps the WO-03B implementation. It does not redefine the frozen
WO-03A substrate or authorize WO-04 semantic takeover.

## 1. Ownership map

| Concern | Owner | Stable caller | Boundary |
| --- | --- | --- | --- |
| Raw Source domain append | `ContextCompilerCore.appendRawSourceProjection` | in-repo library caller | not an MCP command |
| Event schema/write/replay | `SqliteLedgerHotRawStore` + frozen ledger commit helper | Core only | Store/migration absent from package root |
| high-water/vector allocation | accepted `SqliteRevisionSubstrate` | domain callback transaction | WO-03B does not modify allocator |
| Hot Raw consistent read | `SqliteLedgerHotRawStore.rebuild` | Core library caller | one read snapshot; no mutation |
| Frontier advancement | WO-04 | none in WO-03B | explicitly prohibited |
| v0 Raw/Event mirror | existing Raw Store | nine-tool MCP/Core command | unchanged and not backfilled |

## 2. Schema map

### `cc_ledger_hot_raw_schema`

| Column | Meaning |
| --- | --- |
| `version` | single completed schema version (`1`) |
| `completed_at` | last step of transactional first creation |

Update/delete triggers make the completion proof immutable.

### `cc_ledger_raw_events`

| Column | Meaning / invariant |
| --- | --- |
| `namespace`, `stream_id` | explicit frozen WO-03A scope |
| `ledger_revision` | positive safe-integer order allocated by WO-03A |
| `event_id` | stable identity unique with scope |
| `source_kind` | one of four fixed Raw Source categories |
| `source_id` | stable source-side reference |
| `source_session_id` | nullable provenance; never scope identity |
| `payload_json` | canonical plain JSON source projection |
| `occurred_at` | optional exact source timestamp |
| `created_at` | first successful append time, replayed from marker result |

Keys/constraints:

```text
PRIMARY KEY(namespace, stream_id, ledger_revision)
UNIQUE(namespace, stream_id, event_id)
FOREIGN KEY(namespace, stream_id) → cc_revision_streams
```

Update/delete triggers make Event rows append-only. Schema reopen checks full
normalized SQL, not only names or columns.

## 3. Append transaction map

| Phase | Reads/writes | Failure result |
| --- | --- | --- |
| preflight | exact object shape, scope, IDs, source kind, timestamp, plain JSON | `INVALID_INPUT`; no transaction |
| marker lookup | scoped `event_id` in `cc_revision_commits` | exact replay or stable conflict |
| vector allocation | current full scope vector | overflow/CAS conflict; no callback |
| duplicate check | same scope + event ID | conflict; transaction rollback |
| Event insert | new ledger revision and canonical payload | row/constraint failure rolls back |
| vector update | frozen full-vector CAS | callback row rolls back on loss |
| marker insert | `RAW_EVENT_APPEND` descriptor/result | Event and vector roll back on failure |
| commit | one SQLite commit | all three become durable together |

The idempotency key is scoped event ID. No caller-supplied revision, Frontier,
hash, or marker kind is accepted.

## 4. Replay descriptor map

The frozen marker adds its own scope, commit/event ID, operation, and kind. Its
WO-03B request payload contains:

```text
source_kind
source_id
source_session_id?  # provenance only
payload
occurred_at?
```

Canonical key ordering makes semantically identical plain objects replay equal.
Any identity, provenance, source, payload, or timestamp substitution conflicts.
The stored Event result is compared with the persisted append-only row before
return.

## 5. Rebuild snapshot map

```text
BEGIN read transaction
→ SELECT full scope vector from cc_revision_streams
→ SELECT scoped Raw Events in (frontier_position, ledger_revision]
→ validate scope/range/order/stored JSON
→ COMMIT
```

The first SELECT fixes the SQLite snapshot. Therefore a concurrent append is
observed as both vector + Event or as neither. `ledger_high_water` is exactly the
returned vector's ledger axis. Rebuild never writes a stream row or advances a
revision.

## 6. Crash/concurrency map

| Case | Evidence |
| --- | --- |
| Event insert trigger failure | zero row, zero vector allocation, zero marker |
| marker trigger failure after Event insert | Event/vector/marker all rollback |
| same scoped Event concurrent retry | both callers receive revision once; one row |
| distinct same-scope concurrent Events | serialized unique revisions/high-water |
| concurrent append vs rebuild | every observed vector and Event set closes at one high-water |
| close/reopen without push | complete durable Hot Raw reconstructed |
| non-zero committed Frontier | only later Event returned; vector unchanged |
| ledger safe-integer exhaustion | no Event or marker appended |
| concurrent fresh/legacy first-open | one complete idempotent schema |
| same-name/forged completion | fail closed before use |

## 7. Isolation and compatibility map

| Surface | Result |
| --- | --- |
| authority/shadow and stream scopes | independent high-water and same-name Event identity |
| multiple source sessions in one stream | preserved as provenance in one ordered ledger |
| legacy `raw_events` / EVENT mirror | no read, write, rename, or backfill |
| current `ingest_event` | accepted behavior; does not advance new ledger |
| State/Recall/compile telemetry/evaluation | no source/schema behavior change |
| MCP | exactly nine commands; no Hot Raw tool |
| package/config/dependency/artifacts | unchanged |
| WO-03A substrate source/tests | unchanged dependency evidence |

## 8. Verification map

| Claim | Focused case |
| --- | --- |
| scope, shadow, high-water, cross-session provenance | scoped append/rebuild |
| exact replay and replacement conflicts | replay substitution matrix |
| row/vector/marker rollback | injected domain/marker failures |
| Frontier filtering/read-only | non-zero Frontier fixture |
| crash without push | close/reopen recovery |
| invalid/C1/accessor/cycle/exotic and overflow | validation/overflow cases |
| concurrent allocation/retry and read snapshot | Worker concurrency cases |
| concurrent migration, legacy no-backfill, collisions | initialization cases |
| Core/root/MCP boundary | Core boundary and MCP regression tests |
