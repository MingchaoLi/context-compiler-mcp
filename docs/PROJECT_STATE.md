# Project state

Updated: 2026-08-23

## Current approved baseline

- Append-only SQLite raw-event storage with per-session sequencing and source-event idempotency.
- Typed context state, SQLite state storage, strict State Delta parsing, and deterministic reducer primitives.
- Durable provider-neutral `prepare_state_update` and atomic `apply_state_delta` operations with immutable snapshot fingerprints and revision guards.
- Build-up context assembly from active state, dependency closure, recent raw evidence, and current input.
- Immutable history headlines plus exact and keyword recall.
- A local stdio MCP service with stable sanitized errors and exactly nine tools.
- Node.js `>=24`; official MCP SDK and Zod are runtime dependencies.
- Standalone package identity: `context-compiler-mcp`.

## Latest accepted delivery

ST-01 passed independent QA on 2026-08-23. Preparation captures a bounded current raw-event suffix and immutable fingerprint without changing state revision. Apply strictly parses an externally supplied State Delta, permits later raw appends, and atomically revalidates the fingerprint and expected revision with reducer application. The QA matrix exercised macOS arm64 with Node.js 25.6.1; Windows and exact Node.js 24 remain unverified.

## Current behavior

`compile_context` reads stored evidence and state and returns a compiled snapshot and numeric metrics. It does not invoke an extractor, change state, create headlines, or perform retrieval automatically. State changes require an external caller to perform the explicit prepare/extract/apply sequence; this package performs no model or network call. The explicit `CONTEXT_COMPILER_DB_PATH` is the standalone database configuration. `DSH_HOME` is retained only as a legacy compatibility fallback.

## Known gaps

- No runtime State Extractor transport.
- No automatic state evolution or runtime extractor invocation.
- No automatic headline generation.
- No D0/D1/D2 evaluation runner or continuity/recovery evaluation suite.
- No formal compiler mode in any host adapter.

The next planned work is ST-02, the evaluation runner.
