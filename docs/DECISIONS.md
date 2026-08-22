# Decision register

## D-001 — Durable evidence first

Raw events are immutable and append-only. State and headlines reference evidence; they do not replace or delete it.

## D-002 — Build context from active state

Assembly starts from known-active typed state, adds required dependency closure and a recent raw window, then the current input. It does not semantically prune full history.

## D-003 — Code owns transitions

Extractor output is an untrusted State Delta. Strict parsing and the deterministic reducer own all durable transitions. Invalid output cannot partially mutate state.

## D-004 — Recovery is exact

Suppressed or historical information remains addressable through immutable headlines and raw evidence recall. Archive/suppression is not deletion.

## D-005 — Provider neutrality

The core defines `ExtractorTransport` but does not select, call, or bundle a model provider. Provider selection is deferred until after evaluation.

## D-006 — Standalone MCP boundary

The package is `context-compiler-mcp`, uses the official MCP SDK over stdio, and exposes exactly seven approved tools in this baseline. Application adapters remain outside this repository.

## D-007 — Compatibility without host dependency

`CONTEXT_COMPILER_DB_PATH` is the canonical configuration. The prior `DSH_HOME/sessions/context-compiler.db` resolution remains as a legacy fallback so approved adapters keep working, but no host code or package is imported.

## D-008 — Safe sequencing

State update preparation/application precedes evaluation; evaluation precedes optional extractor selection; formal host compiler mode is considered only after those results.

## D-009 — Durable preparation before mutation

State updates use an immutable persisted preparation identity over a bounded raw-event suffix, visible state, relations, and required provenance. The complete untrusted delta is strictly parsed before mutation. Apply then rebuilds the snapshot fingerprint and checks the expected state revision inside the same `BEGIN IMMEDIATE` transaction as reducer execution. Appended raw events are allowed; stale or conflicting state is not.
