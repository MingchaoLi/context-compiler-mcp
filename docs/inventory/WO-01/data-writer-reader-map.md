# WO-01 Data Writer and Reader Map

Source baseline: `f618ed4af4b40bc51b5b3eb8fc19bf1e61c51f52`

## Writer map

| Data | Production writer | Write path | Transaction | Multiple writers / hidden mutation | Validation and provenance |
|---|---|---|---|---|---|
| Session row | Raw, State, or Experience store through `INSERT OR IGNORE` | `sessions` | Enclosing store transaction where present | Multiple store owners share this table | Non-empty ID DB check; no namespace/stream |
| Raw Event/message history | `SqliteRawHistoryStore.ingest` | `raw_events` | `BEGIN IMMEDIATE`; Raw row and EVENT mirror commit together | One production API; evaluation loads fixtures through the same API | Strict JSON metadata, per-session seq, optional `(session_id, source_event_id)` idempotency; stable Raw UUID |
| EVENT research mirror | `appendRawEventMirrorInsideTransaction` called only by Raw ingest/migration | `experience_ledger(kind=EVENT)` | Same transaction as live Raw; deterministic migration transaction for legacy rows | Reserved from public append | Fixed ID/source key derived from Raw ID; full Raw payload and migration marker |
| State proposal/delta | External MCP caller or optional Extractor; held in memory | Not persisted as its own row | Parsed before State transaction | More than one proposal source; none has write authority by itself | Exact ten-array parser, same-session references, optional current-event v2 provenance |
| Preparation snapshot | `StateUpdateCoordinator.prepareStateUpdate` | `state_update_preparations` | State-store transaction; no state revision increment | One coordinator path, but exported library APIs allow direct construction | UUID token, expected revision, selected Raw IDs, immutable JSON, SHA-256 fingerprint |
| Context Item / fact-like state | `StateReducer` through `SqliteContextStateStore` | `context_items` | One session `BEGIN IMMEDIATE`; all reducer operations or none | Low-level store and reducer are public library exports, so mutation entry is not fully encapsulated | Code-owned type/status transitions, source Raw refs, metadata, confidence; no v3.1.1 epistemic/verification/record axes |
| State revision | `SqliteContextStateStore.advanceRevisionInsideTransaction` | `context_state_revisions` | Same transaction as dirty State changes | One store method; revision can be advanced through any successful public reducer/store transaction | Per-session monotonic integer; empty delta does not advance |
| Relation / edge | `StateReducer` and public `SqliteContextStateStore.addRelation` | `state_relations` | Same State transaction | Multiple public library entry surfaces; no direct MCP relation tool | Fixed type allow-list and endpoint checks; `DERIVED_FROM` references Raw, but relation has no ID/revision/origin/confidence |
| Headline | `SqliteHistoryRecallStore.createHeadline` | `history_headlines` | Same transaction as FTS row | One recall API | Immutable range, complete contiguous Raw range validation, range retry idempotency |
| Retrieval index | `createHeadline` and recall migration | `history_headlines_fts` | Headline transaction or migration transaction | Two paths with equivalent projection semantics | Derived from immutable headline/keywords; no Dense or BM25 cache |
| Caller-Dense vector | Raw ingest | `raw_events.dense_embedding_json` | Raw transaction | One Raw writer | Caller supplied only; exact space/vector structure; Core never creates embedding |
| Compiled Context / summary | **No durable writer** | In-memory `CompiledContext` returned to caller | None | Not applicable | Deterministic assembly validation and debug manifest; body is lost on process crash and can be recomputed from current inputs |
| Recent Raw window | **No durable writer** | In-memory slice of `raw_events` | None | Not applicable | Last N complete user turns |
| BM25/hybrid retrieval result | **No cache/index writer** | In-memory ranking | Compile transaction boundary only when tracing | Not applicable | Deterministic bounded candidate set; optional trace records selected identities/hashes |
| Compile trace | Internal `appendContextCompileTraceInsideService` | `experience_ledger(kind=CONTEXT_COMPILE)` | Same compile telemetry transaction as all hit rows | Reserved internal path | Caller `operation_id` becomes stable source key; input/result/state/raw hashes, no Raw/current-input body |
| Retrieval hit | Same internal compile batch | `experience_ledger(kind=RETRIEVAL_HIT)` | Atomic with parent compile trace | Reserved internal path | Parent trace, stable source tuple, reason allow-list, exact hit fingerprint |
| Action / operation-like record | Public `SqliteExperienceLedgerStore.append` | `experience_ledger(kind=ACTION)` | One-record `BEGIN IMMEDIATE` | Any library caller may append; MCP exposes no tool for it | Stable caller `source_key`, optional Raw/parent refs, arbitrary strict JSON payload; no enforced Action lifecycle |
| Outcome/failure/feedback | Public ledger append; verified failure may also be a Raw Event | `experience_ledger(kind=OUTCOME/FEEDBACK)` or `raw_events.event_type` | Per record / Raw ingest transaction | Caller-defined semantics | Reference existence is checked, but objectivity/verification semantics are not |
| Candidate Experience | Public ledger append | `experience_ledger(kind=CANDIDATE_EXPERIENCE)` | One-record transaction | Caller-defined | No abstraction, scoring, promotion, or runtime reader |
| Tool result | **No dedicated writer** | Caller may ingest `RawEvent(role=tool)` or append generic payload | Depends on chosen caller path | Semantics are external and unconstrained | Raw append-only if ingested; no `action_id`/durable ToolResult contract |
| Response / delivery record | **NOT PRESENT** | None | None | Not applicable | No `ResponsePrepared`, Outbox, attempt, acknowledgement, or delivery identity |
| Official evaluation artifact | Repository tooling/work orders, not the live runtime | `evaluation/**` | Git/hashes, not runtime DB | Guarded by work-order validators and Git anchors | Frozen manifests prohibit overwrite; current MCP has no writer to these paths |

## Reader map

| Data | Reader | Mode | Interpretation or mutation |
|---|---|---|---|
| Raw Event | `ContextCompilerMcpService.compile` / `compileOperationalContext` / `assembleContext` | read + interpretation | Recent-N slicing, candidate ranking, context rendering; compile may append telemetry but does not mutate Raw |
| Raw Event | `StateUpdateCoordinator.captureExtractorInput` | read + interpretation | Validates continuous selected suffix and builds bounded extractor input |
| Raw Event | `SqliteHistoryRecallStore` | pure read | Exact event/range/headline recovery and headline-range validation |
| Raw Event | `migrateExperienceLedger` | read + derived append | Creates a missing EVENT mirror during initialization; does not mutate Raw |
| State | `get_state` | pure read | Returns items, relations, revision |
| State | `compileOperationalContext` / `assembleContext` | read + interpretation | Active roots, dormancy placement, query match, dependency closure, context rendering |
| State | `StateUpdateCoordinator` / Extractor | read + interpretation | Builds preparation and validates State references/provenance before a later explicit apply |
| Relation | Assembler | read + interpretation | Recursive `DEPENDS_ON` closure; no graph persistence mutation |
| Relation | Operational context | read + interpretation | `DERIVED_FROM` provenance for telemetry/dormancy and hit attribution |
| Relation | Extractor parser | read + interpretation | Rejects duplicate/conflicting proposed relation tuples |
| Headline/FTS | `recall_exact`, `recall_keyword`, offline evaluator | pure read | Returns headline plus exact Raw evidence |
| Experience EVENT | No live compile-specific interpretation | pure read as part of session ledger; telemetry parser filters it out | Available for replay/research only |
| Compile/hit records | `hasTrustedContextCompileBaseline`, dormancy placement | read + interpretation | Exact-shape validation, baseline age/hit history; malformed telemetry fails placement open |
| Public ACTION/OUTCOME/FEEDBACK/CANDIDATE_EXPERIENCE | No production decision reader | pure replay only | `getSessionRecords` can return them, but live context/state/retrieval does not consume their meaning |
| Tool Result | No dedicated reader | Raw consumers see it only as a Raw Event if a caller ingested it | No action/result reconciliation |
| Response/delivery | **NOT PRESENT** | None | None |

## Writer-risk findings

1. **Multiple public State mutation surfaces:** transaction enforcement is strong, but package exports allow callers to bypass the intended prepare/apply facade and use `StateReducer`/store operations directly.
2. **Generic action semantics:** the append-only research ledger is a durable data plane, not an execution journal. A caller can label arbitrary strict JSON as ACTION or OUTCOME without `operation_id`, `attempt_id`, `action_id`, ActionStarted, verification, or reconciliation.
3. **Distributed schema ownership:** four constructors independently initialize related objects in one SQLite file. Initialization races are retried, but there is no single schema/version registry.
4. **No hidden model persistence:** Extractor output cannot persist directly; strict parsing and reducer code remain the State mutation boundary.
