# WO-ST-03 — Optional provider-neutral extractor transport

Status: ACCEPTED

Implementation handoff: `docs/handoffs/WO-ST-03-optional-extractor-transport.md`

Independent QA: `docs/qa/WO-ST-03-optional-extractor-transport.md` — PASS on 2026-08-23 at candidate `0b5b5dac28cbdbe78406211c9becf8646a7c114e`.

## Result

Add a library-only runtime path that can prepare evidence, invoke an explicitly supplied local extractor process, strictly validate its State Delta, and atomically apply it. The core selects no model or provider, performs no network request, and keeps the MCP protocol at exactly nine tools.

## Allowed scope

- A one-shot JSON subprocess implementation of the existing `ExtractorTransport` interface under `src/`.
- A provider-neutral runtime coordinator that composes the accepted prepare, strict extract, and apply operations.
- Stable sanitized transport/runtime errors, timeout/output bounds, child lifecycle cleanup, and strict request/response envelopes.
- Focused unit and real-child-process tests, package exports, documentation, and this work order's handoff.
- Development-only extractor worker fixtures under `test/fixtures/`.

No provider SDK, HTTP/network request, credential configuration, shell invocation, host adapter, UI, automatic call from `compile_context`, automatic headline generation, MCP tool addition, or formal host mode.

## Routed context

Read only:

- `docs/ARCHITECTURE.md`
- `docs/DECISIONS.md`
- `src/extractor.ts`
- `src/state-update.ts`
- `src/raw-store.ts` and `src/state-store.ts` only for the public operations used by the coordinator
- `src/index.ts`
- `package.json`
- `README.md`
- focused extractor, state-update, and protocol tests

The archived original brief is not required for this bounded transport contract.

## Contract

### Process transport

- Construction requires an explicit executable and dense argument list. It uses direct process spawning with `shell: false`; no command string is interpreted by a shell.
- Each extraction starts one child, writes exactly one version-1 JSON request envelope `{ "version": 1, "prompt": string }` to stdin, closes stdin, accepts exactly one version-1 JSON response envelope `{ "version": 1, "delta": object }` from stdout, and then terminates the child. The prompt is the existing `StrictStateExtractor` provider-neutral instruction/input payload; no transport/provider configuration is included in the envelope.
- The transport returns the candidate `delta` as JSON text to the existing strict parser; strict State Delta validation remains owned by `StrictStateExtractor`.
- Default and caller-bounded timeout/request/output limits prevent an unresponsive or noisy child from exhausting the host. Overflow, timeout, signal, nonzero exit, spawn/pipe failure, malformed JSON, wrong envelope version/shape, and premature close return stable sanitized transport errors without stdout/stderr, executable paths, evidence, or credentials.
- The transport drains no secret-bearing diagnostics into public errors and leaves no live child after success, failure, timeout, abort, or caller close. Concurrent extract calls use independent children.
- Environment selection and provider credentials remain outside the core. The child inherits the launching process environment without the core enumerating, copying into reports, or accepting credentials as transport input.

### Runtime updater

- The library operation accepts exactly `session_id` and a bounded ordered `newest_event_ids` suffix.
- It calls the accepted durable preparation, invokes the strict extractor with the returned provider-neutral snapshot, and calls the accepted atomic apply operation with the preparation identity and parsed delta.
- Preparation/extraction failure never mutates state. Apply conflicts and validation failures remain stable and cannot partially mutate state.
- A valid empty delta remains idempotent; a successful non-empty delta advances revision once. Concurrent/stale behavior is inherited from and rechecked by the accepted ST-01 transaction boundary.
- The operation never runs implicitly from `compile_context`, raw ingestion, or recall.

## Acceptance

- Exact library inputs reject unknown/accessor/prototype fields before spawn or state work.
- Real child-process tests cover valid empty/non-empty deltas, request envelope fidelity, malformed/extra/multiple JSON output, wrong version/shape, nonzero exit, signal, spawn failure, stdin failure, timeout, output overflow, abort, close, concurrency, unrelated stderr, and sanitized errors.
- End-to-end tests cover prepare/extract/apply, no mutation before apply, empty idempotency, one revision advance, strict-delta rejection, stale/concurrent conflict, appended raw evidence, child failure rollback, and no residual processes.
- Existing behavior remains compatible and the real MCP protocol still lists exactly nine tools.
- `npm test`, `npm run test:protocol`, `npm run build`, real worker execution, real npm pack, production-only packaged execution, dependency tree, credential/generated-file/host-import/network scans, and `git diff --check` pass.

Implementation requires an append-only commit and independent QA; the implementer must not self-approve.

Accepted by independent QA on 2026-08-23. Formal host mode remains out of scope.
