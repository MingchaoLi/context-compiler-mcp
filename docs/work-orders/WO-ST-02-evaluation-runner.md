# WO-ST-02 — Deterministic evaluation runner

Status: ACCEPTED — INDEPENDENT RE-QA PASS

Implementation handoff: `docs/handoffs/WO-ST-02-evaluation-runner.md`

Independent QA return: `docs/qa/WO-ST-02-evaluation-runner.md`

Accepted fixed candidate: `b0ec8de081a59ab5ae6725dad730080232d93aee` on 2026-08-23. The first QA return and the fresh re-QA acceptance are both retained in the QA report.

## Result

Add an offline, provider-neutral evaluation runner that compares D0 full raw context, D1 bounded recent context, and D2 compiled context using explicit labeled fixtures. It reports token reduction, constraint retention, decision continuity, resolved-issue reopening, open-question continuity, recall recovery, and latency without making a model or network call.

## Allowed scope

- A dedicated evaluation module and JSON CLI under `src/`.
- Strict fixture/result types and deterministic rendering required by the runner.
- Reuse of the existing raw store, state store, assembler, and recall primitives without changing their accepted behavior.
- Focused unit/CLI tests, package scripts/exports, documentation, and this work order's handoff.
- Development-only fixture files under `test/fixtures/`.

No extractor transport, provider SDK, model/network call, host adapter, UI, automatic state mutation, automatic headline generation, or formal host mode. The MCP server remains exactly nine tools.

## Routed context

Read only:

- `docs/ARCHITECTURE.md`
- `docs/DECISIONS.md`
- `src/state-types.ts`
- `src/raw-store.ts`
- `src/state-store.ts`
- `src/assembler.ts`
- `src/recall.ts`
- `src/index.ts`
- `src/mcp-server.ts` (only the existing exact SQLite warning-filter pattern required by QA)
- `README.md`
- existing focused tests for those modules

## Contract

### Fixture

- The input is a strict versioned JSON suite with one or more independent cases.
- Every case supplies deterministic raw events, initial typed state, recent-window size, compiled-context budget, optional recall queries, and explicit text probes grouped by metric.
- Probes use exact normalized text containment; no semantic judgment is inferred by the core.
- Thresholds are explicit suite inputs. Unknown fields, duplicate IDs, invalid references, empty required collections, and invalid numeric bounds fail before a case runs.

### Dimensions

- D0 renders the complete ordered raw-event history.
- D1 renders only the newest configured raw-event window.
- D2 uses the existing context assembler and, for labeled recall probes, the existing recall search over immutable headlines.
- Evaluation is read-only after an isolated case fixture is loaded. Cases cannot share database state.

### Metrics and output

- Report per-case and aggregate estimated token counts, reduction versus D0, retention rates for constraints/decisions/open questions, resolved-issue reopening rate, recall recovery rate, and measured latency for D0/D1/D2.
- Token estimation is a documented deterministic approximation, not a provider tokenizer.
- A probe's expected presence or absence is evaluated separately for each dimension; resolved-issue reopening counts forbidden open-form probes that reappear.
- JSON output has a versioned, stable shape and contains no database path or environment details.
- The CLI exits `0` only when parsing and execution succeed and all configured aggregate thresholds pass; threshold failure uses a distinct nonzero exit from invalid input/runtime failure.

## Acceptance

- Unit tests cover D0/D1/D2 construction, every required metric, aggregation, zero-denominator behavior, strict parsing, deterministic token estimation, threshold pass/fail, case isolation, read-only evaluation, and sanitized failures.
- CLI tests exercise valid, threshold-failing, and malformed real JSON inputs and verify stable exit behavior and machine-readable output.
- Existing behavior remains compatible and the real MCP protocol still lists exactly nine tools.
- `npm test`, `npm run test:protocol`, `npm run build`, a representative real evaluation run, package dry-run, production-only packaged evaluation, credential/generated-file/host-import scans, and `git diff --check` pass.

Implementation requires an append-only commit and independent QA; the implementer must not self-approve.
