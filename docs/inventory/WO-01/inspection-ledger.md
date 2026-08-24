# WO-01 Inspection Ledger

Baseline: `f618ed4af4b40bc51b5b3eb8fc19bf1e61c51f52`

## Stage A — mechanical index

The exact indexed file list is the tracked tree produced by:

```text
git ls-tree -r --name-only f618ed4af4b40bc51b5b3eb8fc19bf1e61c51f52
```

This is the normative `files_indexed` list. It contains 467 files:

| Root | Count |
|---|---:|
| `src/` | 19 |
| `test/` | 34 |
| `evaluation/` | 292 |
| `docs/` | 115 |
| repository-root files | 7 |

Mechanical indexes also covered:

- package entrypoints, bins, scripts, runtime dependencies, and Node engine from `package.json`;
- compiler output and cache paths from `tsconfig.json`;
- schema, migration, DDL, transaction, and SQL call sites in `src/`, `test/`, and `evaluation/`;
- all exported source symbols and source import edges;
- all top-level test suites and tracked fixtures;
- all official evaluation paths, without parsing every frozen payload.

Stage A was an index only. It did not run the evaluator, a model, a provider, a network request, a build, or a test that could write into the repository.

## Stage B — deeply inspected

### Repository authority and current design

- `AGENTS.md`
- `docs/PROJECT_STATE.md`
- `docs/ROADMAP.md`
- `docs/work-orders/WO-01-current-architecture-inventory.md`
- `docs/architecture/LT-Agent-Architecture-Contract-2026-08-24-v3.1.1.md`
- `docs/architecture/Umbrella-Implementation-Plan-2026-08-24-v3.1.1.md`
- `README.md`
- `docs/ARCHITECTURE.md`
- `docs/DECISIONS.md`
- `docs/MIGRATION.md`
- `docs/REQUIREMENTS_V0.md`
- `package.json`
- `tsconfig.json`
- `.gitignore`

### Runtime and storage source

The following files were inspected end-to-end:

- `src/index.ts`
- `src/mcp-server.ts`
- `src/mcp-service.ts`
- `src/raw-store.ts`
- `src/experience-ledger.ts`
- `src/state-store.ts`
- `src/state-update.ts`
- `src/reducer.ts`
- `src/state-types.ts`
- `src/operational-context.ts`
- `src/assembler.ts`
- `src/recall.ts`
- `src/runtime-state-update.ts`
- `src/subprocess-extractor.ts`
- `src/evaluation-cli.ts`
- `src/sqlite-initialization.ts`
- `src/sqlite-warning.ts`

Targeted ranges were deeply inspected in:

- `src/extractor.ts`: transport contract, retry/fallback, strict v1/v2 parsing, input/provenance validation, prompt boundary, and current-event provenance enforcement;
- `src/evaluation.ts`: versioned input/report contracts, temporary-database runner, D0/D1/D2 execution, and threshold/cost handling.

### Tests used as behavioral evidence

- `test/raw-store.test.ts` — reopen recovery, source retry, append-only triggers.
- `test/state-update.test.ts` — durable preparation, stale revision, atomic apply, immutable preparation.
- `test/experience-ledger.test.ts` — raw/EVENT atomic mirror, public kind boundary, append-only replay.
- `test/operational-context-service.test.ts` — read-only/no-id compile, trace idempotency, trace rollback.
- `test/mcp-protocol.test.ts` — cross-process first-trace commit/rollback linearization.
- `test/runtime-state-update.test.ts` — extraction delay, conflict, concurrent update, abort/close behavior.
- `test/recall.test.ts` — headline/FTS rollback.
- `test/state-reducer.test.ts` — reducer rollback, empty revision, duplicate relation behavior.

### Official artifact and observation evidence

- `evaluation/starlette-v1/freeze/v1/freeze-manifest.json`
- `evaluation/starlette-v1/results/feasibility-01/README.md`
- `evaluation/starlette-v1/results/feasibility-01/boundary-manifest.json`
- `evaluation/starlette-v1/runs/feasibility-01/run-manifest.json`
- `evaluation/state-replay-v0.1/source/baseline-seal.json`
- `evaluation/state-replay-v0.1/st02/capture/run-manifest.json`
- `evaluation/codex-dogfood-01/observation-hashes.json`
- DSH_HOME/recovery evidence excerpts in `docs/reports/WO-DG-01-codex-long-conversation-dogfood.md`.

## Stage C — necessary Git history

The following commits were inspected because current source alone does not identify the docs-import boundary or the last production-source change:

| Commit | Reason |
|---|---|
| `f618ed4af4b40bc51b5b3eb8fc19bf1e61c51f52` | source baseline and accepted v3.1.1 repository-authority state |
| `b27b5300f3a6acba84d09f55e43fc93feeaf80f0` | docs-only Contract/Umbrella/WO-01 import |
| `ad94f9350482be37f1a38538cf6b624fb69a2b9a` | last commit touching production source; compile telemetry origin linearization |

No older commit was required to explain a current writer, reader, schema, or transaction boundary.

## Paths indexed but not deeply inspected

| Path | Exclusion reason |
|---|---|
| `docs/archive/**` | The requirements index explicitly routes normal work away from the 1,725-line historical brief; no current-tree ambiguity required it. |
| historical `docs/work-orders/**`, `docs/handoffs/**`, `docs/qa/**`, `docs/adversarial-reviews/**` except the current routed files | Stage A indexed them; current source, current authority docs, and selected accepted evidence were sufficient for WO-01. |
| bulk `evaluation/starlette-v1/**` payloads, captures, Gold, packets, and reviewer forms | Frozen/official data was not needed to map runtime writers; governing manifests and boundaries were inspected instead. |
| bulk `evaluation/state-replay-v0.1/**` packets and captures | Same reason; the baseline seal and capture manifest provide the relevant artifact identity. |
| bulk `evaluation/codex-dogfood-01/**` payloads | Hash manifest and the bounded DSH_HOME report evidence were sufficient. |
| most evaluation-only tests and validators | Indexed as verification topology; they do not write production runtime state. |
| `package-lock.json` body | Included in the baseline fingerprint; dependency resolution internals were not needed after `package.json` and import topology established the runtime boundary. |
| any sibling repository or host project | Explicitly out of scope and neither read nor modified. |

## Commands and mutation boundary

- No network access or remote model was used.
- No destructive command was used.
- No production database was opened or modified.
- No source, schema, test, configuration, dependency, or official artifact was changed.
- Only `docs/inventory/WO-01/**` and the later Builder handoff are permitted Builder outputs.
