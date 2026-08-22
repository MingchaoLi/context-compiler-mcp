# Project state

Updated: 2026-08-23

## Current approved baseline

- Append-only SQLite raw-event storage with per-session sequencing and source-event idempotency.
- Typed context state, SQLite state storage, strict State Delta parsing, and deterministic reducer primitives.
- Build-up context assembly from active state, dependency closure, recent raw evidence, and current input.
- Immutable history headlines plus exact and keyword recall.
- A local stdio MCP service with stable sanitized errors and exactly seven tools.
- Node.js `>=24`; official MCP SDK and Zod are runtime dependencies.
- Standalone package identity: `context-compiler-mcp`.

## Implementation awaiting independent QA

ST-01 is implemented in the current candidate. It adds durable `prepare_state_update` and `apply_state_delta` library/MCP operations, bringing the candidate server to exactly nine tools. Preparation captures a bounded current raw-event suffix and immutable fingerprint without changing state revision. Apply strictly parses an externally supplied State Delta, permits later raw appends, and atomically revalidates the fingerprint and expected revision with reducer application.

## Current behavior

`compile_context` reads stored evidence and state and returns a compiled snapshot and numeric metrics. It does not invoke an extractor, change state, create headlines, or perform retrieval automatically. State changes require an external caller to perform the explicit prepare/extract/apply sequence; this package performs no model or network call. The explicit `CONTEXT_COMPILER_DB_PATH` is the standalone database configuration. `DSH_HOME` is retained only as a legacy compatibility fallback.

## Known gaps

- No runtime State Extractor transport.
- No automatic state evolution or runtime extractor invocation.
- No automatic headline generation.
- No D0/D1/D2 evaluation runner or continuity/recovery evaluation suite.
- No formal compiler mode in any host adapter.

The current implementation candidate requires independent ST-01 QA. After acceptance, the next planned work is ST-02, the evaluation runner.
