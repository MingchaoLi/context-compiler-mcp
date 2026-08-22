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

## Current behavior

`compile_context` reads stored evidence and state and returns a compiled snapshot and numeric metrics. It does not invoke an extractor, change state, create headlines, or perform retrieval automatically. The explicit `CONTEXT_COMPILER_DB_PATH` is the standalone database configuration. `DSH_HOME` is retained only as a legacy compatibility fallback.

## Known gaps

- No runtime State Extractor transport.
- No automatic state evolution.
- No automatic headline generation.
- No D0/D1/D2 evaluation runner or continuity/recovery evaluation suite.
- No formal compiler mode in any host adapter.

The next planned work is `docs/work-orders/WO-ST-01-state-update-pipeline.md`. It is not implemented in the migration baseline.
