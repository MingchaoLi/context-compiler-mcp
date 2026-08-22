# WO-ST-03 implementation handoff

Date: 2026-08-23

Status: **IMPLEMENTED — REQUIRES INDEPENDENT QA**

## Result

The candidate adds `JsonSubprocessExtractorTransport`, a one-shot local JSON implementation of the accepted `ExtractorTransport` interface, and `RuntimeStateUpdater`, an explicit library-only composition of durable prepare, strict extraction, and atomic apply.

The process contract is exactly:

```text
stdin:  { "version": 1, "prompt": string }
stdout: { "version": 1, "delta": object }
```

Each completion uses an independent child spawned with `shell: false`. Constructor/input shapes, timeout, request bytes, output bytes, response envelope, exit/signal, abort, and close are bounded and return stable sanitized codes. Stderr is ignored and never copied into public errors. `close()` kills and awaits active children. The child inherits the launch environment but the core accepts no credential field and emits no configuration/evidence in errors.

`RuntimeStateUpdater` snapshots its exact two-field input, persists the accepted ST-01 preparation, invokes `StrictStateExtractor`, refuses fallback exhaustion with `EXTRACTION_FAILED`, and applies only a strictly parsed candidate against the prepared fingerprint/revision. Valid empty deltas still pass through atomic apply; transport/validation/abort failures do not change context state.

## Boundary result

- No provider or model is selected.
- No provider SDK or dependency was added.
- No shell, HTTP request, network library, credential option, host import, or UI import was added.
- `compile_context`, ingestion, recall, and MCP never call the runtime updater implicitly.
- The stdio MCP service remains exactly nine tools.

## Files

- `src/subprocess-extractor.ts`: strict local process transport, lifecycle, bounds, and sanitized errors.
- `src/runtime-state-update.ts`: provider-neutral runtime coordinator and stable errors.
- `src/index.ts`: library exports.
- `test/fixtures/extractor-worker.mjs`: deterministic real-child fixture.
- `test/subprocess-extractor.test.ts`: 27 transport/process tests.
- `test/runtime-state-update.test.ts`: 17 end-to-end runtime state tests.
- `test/mcp-protocol.test.ts`: real production-only packaged runtime execution while preserving nine MCP tools.
- README, architecture, decision, state, roadmap, and work-order docs.

## Implementer verification

Environment: Darwin arm64, Node.js 25.6.1, npm 11.9.0.

- Focused ST-03 tests: PASS — 44 tests.
- `npm test`: PASS — 11 files, 231 tests.
- `npm run test:protocol`: PASS — 8 tests, including real npm archive, production-only prune, packaged local worker update, and exact nine-tool MCP behavior.
- `npm run build`: PASS.
- `npm pack --dry-run --json --ignore-scripts` with a task-local cache: PASS — 50 entries including both new JS/declaration modules and no source/test paths.
- `npm ls --omit=dev --all`: PASS; no dependency change was introduced.
- Provider/network/credential/host/UI import scan and `git diff --check`: PASS.

The implementer does not approve this delivery. Independent QA must verify the exact committed candidate, add independent process/lifecycle/concurrency assertions, run the full packaging and safety matrix, and write `docs/qa/WO-ST-03-optional-extractor-transport.md`.
