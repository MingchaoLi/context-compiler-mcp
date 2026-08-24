# WO-02 Core / Host Authority Boundary

Status: BUILDER CANDIDATE — PENDING INDEPENDENT QA<br>
Contract: Architecture Contract v3.1.1<br>
Execution baseline: `8285c8a63dcc471009bdaf90b96b5fb26e6804b8`

## Result

WO-02 wraps the accepted implementation behind one model- and Host-independent
composition root. It does not split processes, change persistence, or add v3.1.1
runtime behavior.

```text
MCP / future Host configuration and transport
    -> ContextCompilerCommandPort
        -> ContextCompilerCore
            -> current stores / state coordinator / compiler

optional ExtractorTransport
    -> untrusted candidate StateDelta
        -> prepare_state_update / apply_state_delta
            -> Core validation and authority mutation
```

`ContextCompilerCore` is the stable composition and command/query surface.
`ContextCompilerCommandPort` is the narrow adapter dependency. The MCP adapter
resolves Host-owned environment compatibility, owns the supplied port lifecycle,
and delegates commands. Core does not know MCP, model/provider identity, network,
UI, delivery, or a sibling Host repository.

## Stable surface

The stable surface is:

- `ContextCompilerCore(databasePath)` for an in-process Core;
- `ContextCompilerCommandPort` for adapters and compatible Core deployments;
- `CONTEXT_COMPILER_COMMANDS`, containing the accepted nine commands;
- `call(command, input)` and idempotent `close()`;
- direct `appendExperienceRecord` and `getExperienceRecords` library methods for
  the existing research ledger behavior.

The command surface covers health, Raw Event ingest, Context compilation, State
read/prepare/apply, Headline creation, exact recall, and keyword recall. It keeps
the existing request, response, and sanitized error shapes. Core owns the four
current Store lifecycles and closes every successfully opened Store when a later
Store initialization fails.

`src/index.ts` continues to export Store, Reducer, extractor, evaluator, and other
low-level symbols for package compatibility. Those exports are implementation or
compatibility surfaces. Future Hosts must use the stable Core port and must not
make Store, Reducer, SQLite, MCP, or evaluator internals their adapter contract.

## Responsibility contract

### Core owns

- current Raw Event, State item/relation/revision/preparation, Headline/FTS, and
  Experience Ledger storage authority;
- command validation and existing transaction, retry, idempotency, revision, and
  fingerprint rules;
- deterministic Context assembly and recall;
- internal compile trace/retrieval-hit mutation and its database-wide writer
  fence;
- stable Core command/query types and resource lifecycle.

### Host owns

- MCP, Chat, application, or other transport framing;
- database-path/configuration selection, including current
  `CONTEXT_COMPILER_DB_PATH` and legacy `DSH_HOME` resolution;
- main LLM and optional provider selection;
- external tool execution, side effects, and heavy verification;
- user delivery and Host execution metadata.

Host inputs are proposals or commands. A Host may submit Raw Events, State
proposals, recall queries, and current research records through Core. It may not
write SQLite tables, revisions, EVENT mirrors, FTS projections, or compile
telemetry directly. Core does not interpret a future `host_manifest` and WO-02
does not add one.

## Mutation paths

The accepted mutation paths remain:

1. `ingest_event` validates before `BEGIN IMMEDIATE`; Raw Event and EVENT mirror
   commit or roll back together, with source-event idempotency unchanged.
2. `prepare_state_update` records a fingerprint and expected revision;
   `apply_state_delta` revalidates both and delegates one State transaction to the
   current reducer. Revision allocation and empty/non-empty retry behavior remain
   unchanged.
3. `create_headline` owns the Headline/FTS transaction. Exact and keyword recall
   are read paths.
4. `compile_context` reads current State, Raw Events, and ledger evidence under
   the existing compile telemetry boundary. Only Core's internal writer can append
   reserved compile trace and retrieval-hit records.
5. Public research ledger append retains `source_key` idempotency and rejects
   reserved kinds/prefixes. Research `ACTION`, `OUTCOME`, `FEEDBACK`, and
   `CANDIDATE_EXPERIENCE` records are observations, not the future formal
   Operation/Action journal.

The complete ownership map is
`docs/inventory/WO-02/authority-mutation-matrix.md`.

## Adapter and compatibility rules

`ContextCompilerMcpService` is a thin adapter. Constructing it with a database
path creates a Core. Supplying a `ContextCompilerCommandPort` transfers lifecycle
ownership to the adapter. Repeated `close()` calls are no-ops, calls after close
return `STORAGE_FAILURE`, and Core errors remain sanitized.

The MCP server remains the transport owner and continues to expose exactly nine
tools. It does not receive a Store, Reducer, or SQLite handle. Environment access
stays in the adapter; Core receives only the resolved database path.

## Crash and rollback boundaries

- Partial Core composition closes every already-created Store before returning a
  stable storage failure. Since each Store independently ensures schema, the
  accepted State partial-DDL initialization risk remains; WO-02 does not silently
  change it.
- Core and adapter close are idempotent. A physical close failure is reported as a
  storage failure after all Store close attempts have been made.
- Adapter rejection or Core input validation occurs before the selected mutation
  path and cannot create an authority write.
- Raw/Event mirror, State, Headline/FTS, and compile telemetry retain their
  pre-WO-02 transaction and rollback owners.
- Research retries remain keyed by `(session_id, source_key)`.

## Explicit non-deliverables

WO-02 does not implement shared namespace/stream revisions, Raw Frontier,
Takeover/enrichment, canonical Fact schema, Snapshot, formal Operation/Action or
ToolResult journals, Verification, Response/Outbox, Shadow Mode, background
mutation, provider integration, or Host integration. Evaluation behavior and
official artifacts are unchanged. Those remain assigned to later work orders.
