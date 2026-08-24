# WO-01 Current Architecture Inventory

Source baseline: `f618ed4af4b40bc51b5b3eb8fc19bf1e61c51f52`

This report describes the code that exists at the baseline. Architecture Contract v3.1.1 is used only as an audit dimension; target components are not treated as implemented.

## Repository and runtime topology

| Area | Current implementation | Evidence |
|---|---|---|
| Library entrypoint | Public exports for stores, reducer, compiler, recall, evaluator, MCP, and optional extractor runtime | `src/index.ts`; `package.json#main` |
| MCP entrypoint | Local stdio MCP server with exactly nine tools | `src/mcp-server.ts#createContextCompilerMcpServer`; `package.json#bin.context-compiler-mcp` |
| Service facade | Input validation, stable errors, and orchestration of four SQLite stores | `src/mcp-service.ts#ContextCompilerMcpService` |
| Raw evidence | Append-only per-session `raw_events` plus atomic EVENT mirror | `src/raw-store.ts#SqliteRawHistoryStore`; `src/experience-ledger.ts#appendRawEventMirrorInsideTransaction` |
| State | Five typed item kinds, five relation kinds, per-session revision, immutable preparation rows | `src/state-types.ts`; `src/state-store.ts#SqliteContextStateStore` |
| State transition | External/caller proposal, strict parser, deterministic reducer, revision-guarded apply | `src/state-update.ts#StateUpdateCoordinator`; `src/reducer.ts#StateReducer` |
| Optional extraction | Explicit library-only local subprocess transport; never invoked by MCP/compile/ingest | `src/runtime-state-update.ts`; `src/subprocess-extractor.ts` |
| Context assembly | Active state, dependency closure, fixed recent user-turn window, optional historical notes, retrieved history | `src/assembler.ts#assembleContext` |
| Operational retrieval | In-memory bounded BM25 and all-or-nothing caller-Dense, verified-failure recovery, dormant placement | `src/operational-context.ts#compileOperationalContext` |
| Recall | Immutable headlines, SQLite FTS5 keyword search, exact raw event/range recovery | `src/recall.ts#SqliteHistoryRecallStore` |
| Research ledger | Generic append-only EVENT/ACTION/OUTCOME/FEEDBACK/CANDIDATE_EXPERIENCE plus internal compile/hit records | `src/experience-ledger.ts#SqliteExperienceLedgerStore` |
| Verification/evaluation | Offline deterministic D0/D1/D2 evaluator and JSON CLI; not a live request verifier | `src/evaluation.ts`; `src/evaluation-cli.ts` |
| Background task | **NOT PRESENT** | No production timer/worker/background loop in `src/` |
| Main Agent/model invocation | **NOT PRESENT** | No provider SDK or agent invocation in runtime imports |
| External Tool Executor | **NOT PRESENT** | MCP tools execute only Context Compiler service operations |
| Response/Outbox delivery | **NOT PRESENT** | MCP returns an immediate `CallToolResult`; no durable response/outbox schema |

## Physical persistence topology

`ContextCompilerMcpService` opens four independent `node:sqlite` connections to one configured database path:

1. `SqliteRawHistoryStore`
2. `SqliteContextStateStore`
3. `SqliteHistoryRecallStore`
4. `SqliteExperienceLedgerStore`

Every connection enables foreign keys, a 5-second busy timeout, `synchronous=FULL`, and WAL for file databases. Initialization retries only SQLite BUSY/LOCKED with a bounded delay sequence. Schema ownership is physically distributed across store constructors, not centralized in one migration registry.

Current tables and indexes:

| Schema object | Owner |
|---|---|
| `sessions`, `raw_events`, raw append-only triggers | `raw-store.ts` |
| `experience_ledger`, ledger append-only triggers | `experience-ledger.ts` |
| `context_items`, `state_relations`, `context_state_revisions`, `state_update_preparations` | `state-store.ts` |
| `history_headlines`, `history_headlines_fts`, headline append-only triggers | `recall.ts` |

There is no separate Fact table, Frontier table, ContextSnapshot table, operation/attempt/action journal, verification table, response table, outbox table, shadow namespace column, or background-job table.

## Raw and hot-context recovery

- The durable raw source is `raw_events`; every live ingest also creates an atomic append-only `experience_ledger(kind=EVENT)` mirror.
- Compile rebuilds its input by reading all `raw_events` for one `session_id`; it does not rely on an in-memory push.
- Recent Raw is the last fixed `N` complete user turns. Window-out candidates are restricted to the preceding `N × multiplier` user turns.
- Reopening the store recovers committed raw rows. There is no committed Raw Frontier, high-water authority record, or cross-session Hot Raw Tail.
- `raw_boundary_max_seq` in a compile trace is an observation hash boundary, not an authority cursor and cannot advance/recover a Frontier.
- Information outside both the recent and candidate windows remains durable but needs explicit headline/exact recall or a query that places it inside the allowed candidate window. The DSH_HOME dogfood observation proves a broad-query miss followed by verified-failure targeted recovery; it does not prove lossless normal retrieval.

## State authority

- State proposals enter through `apply_state_delta` or the explicit library-only `RuntimeStateUpdater`.
- `parseStrictStateDeltaPayload` validates the complete untrusted delta before mutation.
- `StateReducer` is the code owner of lifecycle transitions; `SqliteContextStateStore` owns writes and requires an active session transaction.
- A preparation snapshot is durable and immutable but is not Pending State authority. Only committed `context_items/state_relations` plus `context_state_revisions` influence compile.
- State updates are explicit and conditional, not automatic per event. `compile_context`, `ingest_event`, and MCP dispatch do not call an extractor.
- State can intentionally lag Raw. Recent Raw mitigates recent lag, but there is no Frontier contract guaranteeing that every older unstructured event remains in Hot Raw until takeover.
- The package root also exports `StateReducer` and `SqliteContextStateStore`; library callers can enter lower-level mutation APIs. Their transaction/reducer checks are strong, but one unified Authority facade is not enforced at the package boundary.

## Relations and graph behavior

`state_relations` supports `SUPERSEDES`, `DEPENDS_ON`, `RESOLVED_BY`, `REJECTS`, and `DERIVED_FROM`.

- Source is always a Context Item; a `DERIVED_FROM` target is a Raw Event, while other targets are Context Items.
- Relation creation is validated and normally occurs inside a State transaction.
- There is no `relation_id`, relation revision, namespace/stream, epistemic origin, confidence, status, or dedicated provenance field.
- Assembly performs recursive `DEPENDS_ON` closure. This is state dependency closure, not candidate-scope Event Ripple.
- There is no general graph traversal service, Graph DB, RelationProposal registry, or Audit Ripple implementation.

## Evidence retrieval

- Normal operational retrieval calculates BM25 in memory over a session-local, fixed-turn candidate horizon.
- Caller-Dense is used only when the query and every candidate share full coverage, vector space, dimension, valid numeric values, and nonzero norms; otherwise the entire Dense leg fails over to BM25-only.
- Defaults are candidate multiplier 5, recovery multiplier 8, retrieval limit 8, and recovery limit 16.
- Recovery must cite a same-session Raw Event with `event_type=verified_failure`.
- Headline FTS is a separate explicit recall path; it is not automatically combined with operational retrieval.
- There is no first-class Search Scope/Horizon record, anchor/seed, relation-path evidence, bounded 1-hop Event Ripple, EvidenceCandidate, or EvidenceBundle.

## Context compaction and snapshot behavior

- Fixed recent-N is a hard current implementation boundary for Recent Raw, and also parameterizes the candidate horizon and dormancy age.
- There is no semantic summary writer, automatic headline generation, Tool Result folding, repeated-log folding, or persisted mechanical projection artifact.
- Historical `SUPERSEDED` Decisions and `REJECTED` Alternatives may become compact notes; a token budget only admits optional historical notes. Mandatory state/recent/retrieved/current-input content can exceed the budget.
- `CompiledContext`, debug manifest, metrics, and trace fingerprints exist in memory. With `operation_id`, hashes/IDs/policy and selected-hit rows are persisted, but the Working Context body and a v3.1.1 immutable ContextSnapshot Manifest are not.
- No `attempt_id` is bound to a frozen snapshot.

## Tool, verification, and response lifecycle

- The MCP server dispatches nine internal Context Compiler tools. It does not execute arbitrary external side effects.
- The research ledger permits public `ACTION`, `OUTCOME`, `FEEDBACK`, and `CANDIDATE_EXPERIENCE` records with idempotent `source_key`, but it does not enforce `ActionIntent → ActionStarted → ToolResult → Outcome`.
- There is no durable side-effect fence, executor reconciliation, attempt retry ledger, interrupt state, or known-side-effect list.
- Verified-failure retrieval recovery is caller-selected input, not an automatic bounded Verification/Recovery loop.
- The offline evaluator uses objective fixtures and temporary SQLite databases, but it is not invoked for live requests.
- MCP serializes and returns a response immediately. There is no `AgentResponseGenerated`, `ResponsePrepared`, delivery attempt, acknowledgement, durable lease, or Outbox recovery.

## Shadow and official baselines

- Runtime feature flags, namespaces, and shadow routing are **NOT PRESENT**.
- Because current tables have no namespace, writing experimental data into them would enter the same default read paths.
- Official/frozen artifacts are rooted under `evaluation/starlette-v1/`, `evaluation/state-replay-v0.1/`, and the accepted dogfood observation under `evaluation/codex-dogfood-01/`.
- Governing manifests use hashes and Git-object anchors. The Starlette result README explicitly prohibits rerunning the official generator to overwrite its directory.
- Current runtime does not write these artifact paths. The overwrite risk is repository tooling/human execution, not a live MCP path.

## Current architecture assessment

The v0 core is internally stable and strongly guarded around append-only Raw, deterministic State transitions, and several transaction boundaries. It is nevertheless only part of the v3.1.1 target runtime. Transport/service/storage concerns coexist in one package, low-level mutation surfaces remain public, and the Host-side execution/delivery lifecycle is absent rather than cleanly adapted.

CURRENT ARCHITECTURE STATUS:
- partially coupled

HIGHEST-RISK BOUNDARY VIOLATIONS:
1. Generic ACTION/OUTCOME ledger writes are not an Operation/Attempt/Action authority lifecycle and cannot safely fence external side effects.
2. Public low-level Store/Reducer surfaces and distributed schema ownership do not enforce one mutation authority boundary.
3. Fixed session/turn context with no Frontier or immutable Attempt Snapshot cannot provide v3.1.1 Hot Raw/replay guarantees.

REUSABLE FOUNDATIONS FOR v3.1.1:
1. Append-only Raw/Event mirror storage with transactional source-event idempotency.
2. Revision-guarded deterministic State reduction and immutable preparation fingerprints.
3. Provider-neutral local runtime, bounded retrieval primitives, and deterministic replay-oriented tests.

MUST-FIX BEFORE PHASE 2:
1. Freeze the Core/Host and Authority/Mutation matrix without changing behavior.
2. Wrap and classify every current writer, especially generic ledger and low-level State writers.
3. Use WO-01 evidence to specify one shared namespace/stream/revision/transaction substrate before adding Frontier or Snapshot behavior.

RECOMMENDED NEXT CHILD WO:
WO-02
