# Project state

Updated: 2026-08-23

## Current approved baseline

- Append-only SQLite raw-event storage with per-session sequencing and source-event idempotency.
- Typed context state, SQLite state storage, strict State Delta parsing, and deterministic reducer primitives.
- Durable provider-neutral `prepare_state_update` and atomic `apply_state_delta` operations with immutable snapshot fingerprints and revision guards.
- Build-up context assembly from active state, dependency closure, recent raw evidence, and current input.
- Immutable history headlines plus exact and keyword recall.
- Strict versioned offline D0/D1/D2 evaluation with deterministic metrics, aggregate thresholds, and a package-safe JSON CLI.
- A local stdio MCP service with stable sanitized errors and exactly nine tools.
- Node.js `>=24`; official MCP SDK and Zod are runtime dependencies.
- Standalone package identity: `context-compiler-mcp`.

## Latest accepted delivery

WO-ST-02 passed fresh independent re-QA on 2026-08-23 at fixed source candidate `b0ec8de081a59ab5ae6725dad730080232d93aee`. The accepted runner strictly evaluates D0 full raw context, D1 complete recent user-turn context, and D2 existing assembler plus headline recall. It reports deterministic approximate token reduction, labeled continuity/reopening/recovery, and latency under explicit aggregate thresholds. The returned npm-bin symlink and SQLite warning-stream findings were independently closed against a real production-only tarball. The re-QA matrix exercised macOS 26.5.1 / Darwin 25.5.0 arm64 with Node.js 25.6.1; Windows and exact Node.js 24 remain unverified.

## Current candidate

WO-ST-02 is accepted. WO-ST-03 is implemented and awaiting independent QA. The candidate provides a bounded one-shot local JSON subprocess transport plus an explicit library-only prepare/extract/apply coordinator while keeping provider SDKs, network calls, credentials, hosts, and MCP expansion outside the core.

## Current behavior

`compile_context` reads stored evidence and state and returns a compiled snapshot and numeric metrics. It does not invoke an extractor, change state, create headlines, or perform retrieval automatically. State changes remain explicit: callers may perform prepare/extract/apply themselves or use the pending ST-03 library coordinator with an explicitly supplied local adapter process. The core selects no model/provider and performs no network request. The explicit `CONTEXT_COMPILER_DB_PATH` is the standalone database configuration. `DSH_HOME` is retained only as a legacy compatibility fallback.

## Known gaps

- The ST-03 optional runtime transport has not yet passed independent QA.
- No implicit state evolution or extractor invocation from compile/ingest/MCP.
- No automatic headline generation.
- No formal compiler mode in any host adapter.

WO-ST-02 is complete and independently accepted. WO-ST-03 implementation is pending independent QA; formal host mode remains out of scope.
