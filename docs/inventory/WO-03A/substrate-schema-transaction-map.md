# WO-03A Substrate Schema / Transaction Map

Baseline: `94f18b702b7eceda9e8afac7cc3d88abddbfb7da`

This inventory maps the implementation delivered by WO-03A. It is descriptive
evidence, not authority for WO-03B or WO-04 business semantics.

## 1. Ownership map

| Concern | Owner | Stable caller | Mutation visibility |
| --- | --- | --- | --- |
| lifecycle and read query | `ContextCompilerCore` | in-repo callers | `getRevisionVector` only |
| schema, vectors, markers, transactions | `SqliteRevisionSubstrate` | Core-internal modules | absent from package root and MCP |
| SQLite connection policy | `initializeSqliteConnection` | all current SQLite owners | unchanged by WO-03A |
| current Raw/State/Experience/Recall behavior | existing Stores | existing Core commands | not routed through substrate in WO-03A |
| Host/MCP routing | `ContextCompilerCommandPort` / MCP service | Host transport | exactly nine existing commands |

## 2. Schema map

### `cc_revision_substrate_schema`

| Column | Meaning | Constraint |
| --- | --- | --- |
| `version` | completed substrate schema version | positive integer primary key; exactly one supported row |
| `completed_at` | completion timestamp | non-null text |

Triggers `cc_revision_schema_no_update` and
`cc_revision_schema_no_delete` make the completion proof immutable. Reopen also
compares the normalized `sqlite_master` SQL for this table and both triggers to
the code-owned definitions.

### `cc_revision_streams`

| Column | Meaning |
| --- | --- |
| `namespace`, `stream_id` | composite scope primary key |
| `ledger_revision` | per-scope ledger axis |
| `state_revision` | per-scope semantic-state axis |
| `raw_frontier_revision` | per-scope frontier-CAS axis |
| `frontier_position` | covered ledger position; not a revision axis |
| `takeover_commit_revision` | per-scope takeover ordering axis |
| `created_at`, `updated_at` | row lifecycle timestamps |

All numeric fields are constrained to `0..9007199254740991`; the table also
checks `frontier_position <= ledger_revision`.

### `cc_revision_commits`

| Column | Meaning |
| --- | --- |
| `namespace`, `stream_id`, `commit_id` | scoped idempotency primary key |
| `operation` | `LEDGER`, `STATE`, `FRONTIER`, `TAKEOVER`, or `TAKEOVER_FRONTIER` |
| `kind` | bounded Core-domain classification |
| `request_fingerprint` | lowercase SHA-256 of canonical request descriptor |
| `request_json` | canonical descriptor bytes used for exact replay comparison |
| `previous_json`, `current_json` | complete scope-bound transition vectors |
| `result_json` | stable callback result replay payload |
| `created_at` | first successful commit timestamp |

The marker references the stream composite key. Triggers
`cc_revision_commits_no_update` and `cc_revision_commits_no_delete` prevent
ordinary mutation or deletion. Schema validation checks the full normalized SQL
for all three tables and four triggers, including PK/FK/CHECK/NOT NULL clauses
and trigger bodies; matching names and columns alone are insufficient.

## 3. Mutation primitive map

| Internal primitive | Operation | CAS input | Atomic output |
| --- | --- | --- | --- |
| `commitLedgerRevisionInsideCore` | `LEDGER` | current full vector at update | ledger `+1`, callback rows, marker |
| `commitStateRevisionInsideCore` | `STATE` | expected State revision plus current full vector | State `+1`, callback rows, marker |
| `compareAndAdvanceFrontierInsideCore` | `FRONTIER` | expected frontier revision and position plus full vector | frontier revision `+1`, position set, callback rows, marker |
| `commitTakeoverRevisionInsideCore` | `TAKEOVER` | current full vector at update | takeover order `+1`, callback rows, marker |
| `commitTakeoverFrontierInsideCore` | `TAKEOVER_FRONTIER` | expected frontier revision and position plus full vector | takeover/frontier each `+1`, position set, callback rows, marker |

All five route through the same symbol-gated transaction method. The full-vector
`UPDATE ... WHERE` is a final defensive CAS after the operation-specific checks.

## 4. Transaction and failure map

| Failure point | Observable result |
| --- | --- |
| invalid scope/request/CAS shape | rejected before mutation |
| stale State revision | no callback, vector, or marker |
| wrong frontier revision or position | no callback, vector, or marker |
| callback throws after domain writes | callback rows and all substrate writes rollback |
| result is not canonical plain JSON | callback rows and all substrate writes rollback |
| vector CAS loses | callback rows and marker rollback |
| marker insert/trigger fails | callback rows and vector update rollback |
| exact replay | stored record returned; callback not rerun; no axis advances |
| conflicting scoped commit ID reuse | stable `CONFLICT`; no mutation |
| malformed persisted vector/marker or descriptor/transition mismatch | fail closed as `CORRUPT_DATA` |
| close repeated | no-op after first successful close |

## 5. Initialization map

```text
open connection
→ foreign keys / busy timeout / FULL synchronous / WAL
→ BEGIN IMMEDIATE
→ completion marker exists?
   yes: validate exact table/trigger SQL, columns, and version
   no: reject any substrate-name collision
       → create version table, streams, commits, triggers
       → validate structure
       → insert version row last
→ COMMIT
```

DDL and the completion row share one SQLite transaction, so a failed fresh
migration cannot publish a partially complete substrate. Existing legacy tables
are neither read nor rewritten during this migration.

## 6. Replay descriptor map

The canonical fingerprint binds:

```text
scope.namespace
scope.stream_id
commit_id
operation
kind
request
expected_state_revision                 # STATE only
expected_frontier_revision              # FRONTIER / TAKEOVER_FRONTIER
expected_frontier_position              # FRONTIER / TAKEOVER_FRONTIER
next_frontier_position                  # FRONTIER / TAKEOVER_FRONTIER
```

Caller-supplied hashes are not accepted. Canonical keys are recursively sorted,
and the same normalized descriptor must match both stored bytes and the computed
fingerprint. Descriptor scope/key/operation/kind must also match marker columns;
stored State/Frontier CAS values and next position must match the persisted
previous/current transition.

## 7. Compatibility/no-write map

| Existing surface | WO-03A action |
| --- | --- |
| Raw/Event tables and writer | no schema or source change; no backfill |
| Experience ledger | no source/schema change |
| State/Relation and reducer | no source/schema change |
| Headline/FTS/Recall | no source/schema change |
| compile telemetry fence | no source/schema change |
| evaluator and official artifacts | no change |
| package/dependency/TypeScript config | no change |
| MCP protocol | no command/schema/result change |

The only current-runtime convergence is Core lifecycle ownership plus a scoped
read query. All business mutations remain deferred.

## 8. Verification map

| Claim | Focused evidence |
| --- | --- |
| four independent axes and authority/shadow isolation | `test/revision-substrate.test.ts` axis/scope case |
| exact replay, substitution rejection, coordinated CAS-marker integrity | replay/tamper cases |
| frontier double-CAS and takeover identity/order | frontier/takeover case |
| callback and marker rollback | injected failure case |
| input and overflow fail-closed | validation/overflow case |
| no legacy backfill and transactional completion | legacy/collision case |
| concurrent fresh/legacy initialization | worker first-open case |
| one concurrent State CAS winner | two-connection worker case |
| no root generic mutation and lifecycle preservation | `test/core-boundary.test.ts` |
| no reflected Core substrate or prototype mutation symbol | Core runtime reflection case |
| forged same-name completion schema rejected | legacy/collision case |
| Unicode C1 controls rejected before mutation | validation case |
| exactly-nine adapter compatibility | MCP and protocol regression suites |
