# WO-01 Current Runtime Sequence

Source baseline: `f618ed4af4b40bc51b5b3eb8fc19bf1e61c51f52`

This is the current MCP compile path. Components absent from the repository are explicitly marked.

```mermaid
sequenceDiagram
    autonumber
    actor U as User or external Host
    participant M as stdio MCP Server
    participant S as ContextCompilerMcpService
    participant R as Raw Store
    participant ST as State Store
    participant L as Experience Ledger
    participant C as Operational Context + Assembler
    participant A as Main Agent / Model (NOT PRESENT)
    participant T as External Tool Executor (NOT PRESENT)
    participant V as Live Verification (NOT PRESENT)
    participant O as Response Outbox (NOT PRESENT)

    opt Separate ingest_event call
        U->>M: ingest_event
        M->>S: validated tool dispatch
        S->>R: ingest RawEvent
        R->>R: BEGIN IMMEDIATE
        R->>R: append raw_events
        R->>L: append EVENT mirror on same SQLite transaction
        R->>R: COMMIT
        R-->>S: committed RawEvent
        S-->>M: immediate result
        M-->>U: CallToolResult
    end

    U->>M: compile_context(session, current_input, optional operation_id)
    M->>S: validated tool dispatch
    S->>L: BEGIN IMMEDIATE compile telemetry boundary
    Note over L: Global SQLite writer fence; trace may still be absent until final append
    S->>ST: read items, relations, state revision
    S->>R: read all same-session raw events
    S->>L: read same-session ledger records
    S->>C: compileOperationalContext
    C->>C: fixed recent-N + bounded BM25/caller-Dense
    C->>C: fail-open dormancy + dependency closure
    C->>C: assemble in-memory CompiledContext
    opt operation_id is present
        S->>L: append CONTEXT_COMPILE + RETRIEVAL_HIT rows
    end
    S->>L: COMMIT or ROLLBACK complete boundary
    S-->>M: in-memory context + metrics
    M-->>U: immediate CallToolResult

    Note over A,O: No Agent invocation, external Tool lifecycle, live verifier, durable response, delivery acknowledgement, or Outbox occurs in this repository.
```

## Explicit State update path

The MCP exposes a two-call path; an optional library caller may compose the same steps with a local extractor child.

```mermaid
sequenceDiagram
    autonumber
    participant H as External caller / Host
    participant S as MCP service or RuntimeStateUpdater
    participant DB as State Store + Raw tables
    participant X as Optional local Extractor child
    participant P as Strict Parser
    participant R as Deterministic Reducer

    H->>S: prepare_state_update(session, newest event ids)
    S->>DB: BEGIN IMMEDIATE
    DB->>DB: read state revision, state, relations, selected raw
    DB->>DB: insert immutable preparation snapshot + fingerprint
    DB->>DB: COMMIT without advancing state revision
    S-->>H: preparation identity + bounded extractor input

    alt Explicit library RuntimeStateUpdater
        S->>X: one strict local stdio request
        X-->>S: candidate delta
    else MCP two-call contract
        H->>H: obtain candidate delta outside this repository
    end

    H->>S: apply_state_delta(identity, expected revision, candidate)
    S->>P: parse complete untrusted delta before mutation
    P-->>S: strict StateDelta
    S->>DB: BEGIN IMMEDIATE at expected revision
    DB->>DB: re-read preparation and rebuild fingerprint
    S->>R: apply deterministic transitions
    R->>DB: write items/relations; advance revision once if dirty
    DB->>DB: COMMIT all or ROLLBACK all
    S-->>H: application result
```

## Paths that do not exist

```text
User input → Main Agent → arbitrary ToolCall → Tool Executor
    NOT PRESENT

ToolResult → live Verification → bounded recovery Attempt
    NOT PRESENT

AgentResponseGenerated → ResponsePrepared → Outbox → Delivered
    NOT PRESENT

Ledger high-water + Frontier → cross-session Hot Raw rebuild
    NOT PRESENT

Background Takeover / Enrichment / Relation update
    NOT PRESENT
```
