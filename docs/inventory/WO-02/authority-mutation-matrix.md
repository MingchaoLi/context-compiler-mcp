# WO-02 Authority / Mutation Matrix

Status: BUILDER CANDIDATE — PENDING INDEPENDENT QA<br>
Source baseline: `8285c8a63dcc471009bdaf90b96b5fb26e6804b8`

This matrix describes the current accepted implementation after the WO-02 wrap.
“Core command” includes a named Core-internal writer that a Host cannot invoke.
Future ownership entries do not authorize implementation in WO-02.

| Canonical data / artifact | Stable Core command or internal writer | Physical writer / storage | Readers | Transaction, validation, retry / idempotency owner | Host allowed input | Host forbidden mutation | Legacy compatibility path | Future WO owner |
|---|---|---|---|---|---|---|---|---|
| Session identity rows | Implicit in mutation commands | Current Store schema/writers; SQLite `sessions` | Current Stores by `session_id` | Selected Store transaction; Core validates command session input | Submit a non-empty `session_id` | Direct session row creation/update/delete | Low-level Store exports remain compatible | Namespace/stream authority: WO-03A |
| Raw Event | `ingest_event` | `SqliteRawHistoryStore`; `raw_events` | compile, exact recall, keyword/headline recall, State preparation, evaluator | Raw Store owns `BEGIN IMMEDIATE`, pre-transaction validation, `source_event_id` retry/idempotency | Event proposal with accepted role/content/metadata/time/token/embedding fields | Direct table writes, update/delete, sequence allocation | `SqliteRawHistoryStore` export | Frontier/takeover: WO-03B/03C |
| Experience EVENT mirror | Core-internal Raw ingest hook | Same Raw transaction; `experience_ledger` kind `EVENT` | compile/retrieval and ledger reads | Raw Store owns atomic commit/rollback; internal mirror source key owns idempotency | Only the Raw Event that implies the mirror | Direct EVENT append or reserved source key | Raw Store ingest | Unified ledger evolution: WO-03A/03B |
| State update preparation | `prepare_state_update` | `StateUpdateCoordinator` + `SqliteContextStateStore`; `state_update_preparations` | `apply_state_delta`, diagnostic/library reads | Coordinator validates newest events, expected revision and fingerprint; Store preserves immutable record | Session, expected revision, bounded newest events | Direct preparation insertion/update or fingerprint fabrication | Coordinator/library functions remain exported | Shared revision/namespace: WO-03A |
| Context State items | `apply_state_delta` | `StateReducer` through `SqliteContextStateStore`; `context_items` | get State, compile, evaluator | Coordinator revalidates preparation; State Store owns one transaction; reducer owns deterministic validation/mutation | Prepared delta proposal with matching fingerprint/revision | Store/reducer calls as a Host adapter contract; direct row mutation | Store/Reducer exports remain compatible only | Schema/reducer evolution: WO-03A/03E |
| State relations | `apply_state_delta` | Reducer + State Store; `state_relations` | get State, compile, evaluator | Same State transaction, reducer validation and savepoint behavior | Relations inside an accepted prepared delta | Direct relation or cascade mutation | Store/Reducer exports | Schema/reducer evolution: WO-03A/03E |
| State revision | State Store internal allocator during `apply_state_delta` | `context_state_revisions` | prepare/apply/get State/compile | State Store owns allocation in the State transaction; coordinator owns expected-revision conflict/retry contract | Expected revision as a precondition | Set/increment/skip revision directly | State Store compatibility export | Shared namespace/stream revision: WO-03A |
| History Headline | `create_headline` | `SqliteHistoryRecallStore`; `history_headlines` | exact/headline/keyword recall and compile retrieval | Recall Store owns validation, event-range checks, transaction and conflict classification | Headline/keywords over an existing session event range | Direct row insertion/update/delete | Recall Store export | Frontier/compaction: WO-03B |
| Headline FTS projection | Core-internal part of `create_headline` | Recall Store; `history_headlines_fts` | keyword recall | Same Headline `BEGIN IMMEDIATE`; Store keeps projection atomic | Only fields of the Headline command | Direct FTS writes/rebuild as authority | Recall Store create call | Frontier/compaction: WO-03B |
| Compiled Context | `compile_context` | Deterministic in-memory result; no canonical Context row | Host consumes returned result; evaluator | Core validates command; operational compiler/assembler own deterministic selection and budgets; no retry mutation except telemetry rules | Current input, budgets, policy, dense query, operation id | Override canonical State/evidence through a compiled result | Existing MCP result shape and compiler exports | Snapshot: WO-03E |
| Compile trace | Core-internal compile telemetry writer | `experience_ledger` reserved `CONTEXT_COMPILE` record | later compile baseline checks, diagnostics/evaluator | Core owns database-wide writer fence; ledger owns transaction/source-key idempotency | `operation_id` through `compile_context` | Public append of reserved kind or `context-compile/` source key | Existing compile service behavior | Ledger/trace evolution: later bounded WO |
| Retrieval-hit telemetry | Core-internal compile telemetry writer | `experience_ledger` reserved `RETRIEVAL_HIT` records | compile diagnostics/evaluator | Same telemetry boundary/transaction; internal source keys provide idempotency | Query/policy inputs that deterministically produce hits | Direct hit append or `retrieval-hit/` source key | Existing compile service behavior | Ledger/trace evolution: later bounded WO |
| Research ACTION / OUTCOME / FEEDBACK / CANDIDATE_EXPERIENCE | `appendExperienceRecord`; `getExperienceRecords` | `SqliteExperienceLedgerStore`; `experience_ledger` | library callers, compile/evaluator where applicable | Ledger validates public kinds/plain payload; `(session_id, source_key)` owns retry/idempotency | Current public research observation | Reserved kinds/prefixes; treating research ACTION as execution authority | Ledger Store export remains compatible | Formal Operation/Action: WO-05 |
| Optional Extractor proposal | External `ExtractorTransport`, then State prepare/apply Core commands | No canonical write until Core accepts a delta | Host/extractor caller and State coordinator | Transport/provider is Host-owned; strict parser validates proposal shape; Core owns authoritative revalidation/apply | Candidate proposal only | Provider/extractor direct Store, revision, or reducer mutation | Local subprocess extractor stays explicit/optional | State takeover: WO-03C/03D |
| Evaluation temporary database | No runtime Core authority; evaluator invokes public library/Core behavior | Isolated temporary SQLite database | Offline evaluator | Evaluator owns isolation and cleanup; runtime Core rules remain authoritative inside the temp DB | Offline evaluation inputs | Production database use or mutation | Current evaluator exports/CLI | Evaluation changes require a separate WO |
| Official evaluation artifacts | None in runtime | Sealed repository artifacts | Human/QA evaluation review | Artifact-producing work order owns sealing and hash identity | None through runtime | Rewrite/relabel from WO-02 | Frozen artifacts remain byte-identical | Separate evaluation WO only |
| ToolResult / formal Operation-Action journal | Absent | None | None | No current owner implemented | None | Inferring authority from research records or Host logs | None | WO-05 |
| Response / Outbox / delivery receipt | Absent | None | Host delivery only, outside Core | No current Core transaction/retry owner | None | Marking user delivery from Context compilation | None | WO-06 |
| Background mutation / Shadow comparison | Absent | None | None | No scheduler, lease, retry, or comparison authority exists | None | Autonomous/background writes in WO-02 | None | WO-07/WO-08 |

## Writer convergence rule

Future adapters use `ContextCompilerCommandPort`. Existing low-level exports are
retained to avoid a breaking package change, but they do not authorize a new Host
writer. A future work order that migrates an in-repository legacy path must prove
equivalence and converge it onto Core before any low-level export can be removed.

## Known current risk

Each SQLite Store currently ensures its own schema. If initialization fails part
way through schema DDL, Core closes all Store handles it successfully opened, but
WO-02 does not make the State schema initialization globally atomic. The risk is
preserved from WO-01 and must be addressed only by a separately authorized schema
or migration work order.
