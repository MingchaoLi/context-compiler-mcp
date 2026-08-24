# WO-01 Core / Host Leakage Map

Source baseline: `f618ed4af4b40bc51b5b3eb8fc19bf1e61c51f52`

Contract v3.1.1 treats Core/Host as a logical responsibility boundary, not a process split. The current package combines a Core library with an MCP transport facade, but does not contain an application Host.

## Responsibility map

| Responsibility | Current owner | Boundary finding |
|---|---|---|
| Raw Event persistence | Core store | Correctly local and provider-neutral |
| State Authority | Parser/reducer/store, with several public library entry surfaces | Strong internal validation; mutation ownership not fully wrapped behind one authority facade |
| Relation persistence | State store/reducer | Core-owned, but relation semantics are v0-specific and not first-class v3.1.1 objects |
| Context assembly/retrieval | Core compiler | Core-owned; current fixed-turn policy conflicts with future Frontier/pressure contract if reused unchanged |
| Replay/consistency | Store transactions and selected tests | Local primitives exist; no shared runtime replay substrate |
| Response Outbox state | **NOT PRESENT** | Target Core responsibility is missing |
| MCP transport | `mcp-server.ts` | Host/transport responsibility physically packaged with Core, but separated from data logic through `ContextCompilerMcpService` |
| Main LLM invocation | **NOT PRESENT** | Correctly not imported into Core |
| External Tool Executor | **NOT PRESENT** | Correctly not imported, but no stable Action port exists yet |
| Heavy verification | **NOT PRESENT** | Offline evaluator is not a Host verifier |
| User delivery | stdio transport returns MCP result; application delivery **NOT PRESENT** | No durable delivery boundary |
| Optional extractor provider adapter | External executable supplied by a library caller | Core owns prompt/strict parser; child owns provider/network/credentials, preserving provider neutrality |

## Required audit questions

| Question | Finding | Evidence |
|---|---|---|
| Does Core import a provider-specific SDK? | No | Runtime dependencies are MCP SDK and Zod; no provider imports in `src/` |
| Do State/Evidence know a particular Host? | No application host type; State is keyed only by `session_id` | `state-types.ts`, `operational-context.ts` |
| Does Core retain a host compatibility leak? | Yes, bounded legacy environment-path fallback `DSH_HOME/sessions/context-compiler.db` | `mcp-service.ts#resolveContextCompilerDatabasePath`; D-007 explicitly preserves it |
| Does Main Agent directly write DB? | Main Agent is not present, so unknown outside this repository | Sibling Host repositories were not read |
| Can Tool Executor modify State? | No Tool Executor exists here; an arbitrary library caller can invoke exported State APIs | `src/index.ts` exports store/reducer/coordinator |
| Can transport directly modify Relation/State? | MCP transport dispatches to the service; service invokes State coordinator. No direct SQL in `mcp-server.ts` | `mcp-server.ts`, `mcp-service.ts` |
| Does memory Core own UI or application delivery? | No | No UI/application-host imports; stdio only |
| Does optional Extractor mutate State directly? | No. It returns a candidate delta; RuntimeStateUpdater parses and applies through the coordinator | `runtime-state-update.ts` |

## Leakage and coupling findings

### 1. Public mutation surface

The package root exports `SqliteContextStateStore`, `StateReducer`, `StateUpdateCoordinator`, and raw/ledger stores. These are useful library primitives, but a future Host can choose different mutation entry points. WO-02 needs an explicit Authority/Mutation Matrix and wrapper boundary before any new behavior.

### 2. Distributed database ownership

The service constructs four store-specific SQLite connections. Store modules read each other's tables where necessary: State reads Raw, Recall reads Raw, Experience migration reads Raw, and compile coordinates reads across all stores. This is a modular monolith, but physical ownership is coupled through one schema without a common transaction/schema abstraction.

### 3. Generic Host-authored research records

Public ledger callers choose ACTION/OUTCOME/FEEDBACK payload semantics and `source_key`. This is appropriate for research capture, but is not safe to promote into the formal Host execution journal without wrapping and validation.

### 4. Legacy environment name

`DSH_HOME` is a deliberate compatibility contract, not a source dependency. It should be isolated behind future configuration/adapter boundaries rather than copied into new Core semantics.

## Unknowns that must remain unknown

- Whether any external Host currently calls low-level State APIs.
- Whether any Host has its own Tool intent, idempotency, reconciliation, verification, or delivery ledger.
- Whether the delivery channel supports stable acknowledgements or idempotency.
- Whether a Host performs opaque context compaction before/after `compile_context`.

Resolving these requires a Host work order in the Host repository. WO-01 does not authorize reading sibling projects or importing Host code.
