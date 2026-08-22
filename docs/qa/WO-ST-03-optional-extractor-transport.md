# WO-ST-03 independent QA — Optional provider-neutral extractor transport

Date: 2026-08-23

Verdict: **PASS — ACCEPTED**

## Candidate identity

- Branch: `main`
- Candidate: `0b5b5dac28cbdbe78406211c9becf8646a7c114e`
- Accepted parent: `8bb4a03d7d69426a76566ad656e3b0b98d8500e7`
- The branch, exact HEAD, exact parent, and clean worktree were verified before QA.
- The implementation commit is one append-only candidate commit. Implementer handoff claims were not used as proof.

## Independent review result

Static review found no P1, P2, or P3 defect.

- `JsonSubprocessExtractorTransport` validates exact plain-data constructor and completion options before spawn, snapshots its normalized executable arguments, and uses direct `spawn` with `shell: false` and independent children.
- Request and response envelopes are exactly version 1. Request and output bounds use UTF-8 byte counts. Empty, malformed, multiple, extra-field, wrong-version, wrong-shape, nonzero, signal, spawn, pipe, timeout, abort, close, and overflow paths return stable codes.
- Stderr is ignored. Error objects do not include the executable, arguments, prompt, stdout, stderr, inherited environment, or child diagnostics. The child inherits the launcher environment without the core enumerating or copying it into the request.
- Timeout, abort, output overflow, stdin EPIPE, explicit close, repeated close, success, process failure, and concurrent completion paths were checked with real child PIDs. No direct child remained alive after completion.
- `StrictStateExtractor` retry and fallback behavior remains code-owned. `RuntimeStateUpdater` performs explicit prepare → strict extract → atomic apply, refuses fallback exhaustion, copies input before its first await, allows unrelated raw append during extraction, and rejects state drift.
- Legal empty deltas revalidate atomically without advancing revision; repeated empty updates are idempotent. A legal non-empty delta advances one revision. Strict rejection, transport failure, abort, and revision conflict do not partially mutate typed context state.
- An independent race using two `SqliteContextStateStore` connections against the same database allowed exactly one candidate to commit at the shared revision; the other returned `CONFLICT`.
- `compile_context`, ingestion, recall, and MCP dispatch have no import or call path to the optional transport/runtime updater. Real stdio `tools/list` returned exactly the approved nine tools.
- Source imports contain no provider SDK, host/UI dependency, or network primitive. No credential input or provider configuration was added.

## Independent adversarial harness

QA created an uncommitted worker and harness only under `/private/tmp`, then exercised the built library rather than importing the implementation tests. The passing run reported:

```text
{"ok":true,"assertions":204,"child_pids_checked":30}
```

The harness independently covered:

- unknown, accessor, prototype, sparse, duplicate, and numeric-boundary rejection before spawn or state preparation;
- literal shell metacharacters in arguments, exact v1 request fidelity, UTF-8 request/output byte boundaries, environment inheritance, and sanitized failures;
- valid success, empty output, malformed/multiple JSON, extra fields, wrong version/shape, spawn failure, stdin EPIPE, nonzero exit, signal, timeout, request/output overflow, pre/mid abort, close/idempotent close, and three concurrent children;
- PID liveness checks after success, failure, timeout, overflow, EPIPE, abort, close, and concurrency;
- retry followed by success, fallback exhaustion without apply, legal empty idempotency, one-revision non-empty apply, await-time input mutation, raw append during extraction, peer state drift, and a two-connection SQLite race.

The production-only extracted tarball was also executed with a real local worker and a real stdio MCP client:

```text
{"ok":true,"production_only":true,"tools":9,"runtime_revision":1}
```

## Verification matrix

- `npm test`: PASS — 11 files, 231 tests.
- `npm run test:protocol`: PASS — 8 tests.
- `npm run build`: PASS.
- Independent real worker/PID harness: PASS — 204 assertions, 30 recorded direct child PIDs checked, none residual.
- Real `npm pack --json --ignore-scripts` with a task-local cache: PASS — `context-compiler-mcp-0.1.0.tgz`, 50 entries, including runtime/subprocess JavaScript, source maps, and declarations; no `src/` or `test/` paths.
- Extracted package plus copied lockfile/modules, offline `npm prune --omit=dev`, and production-only execution: PASS. Runtime dependencies `@modelcontextprotocol/sdk` and `zod` remained; `vitest` and `typescript` were absent.
- Packaged library worker update: PASS — one state item and revision 1.
- Packaged real stdio MCP `tools/list`: PASS — exactly 9 tools; health call succeeded.
- Repository and production-only `npm ls --omit=dev --all`: PASS (exit 0). Both reported only the declared runtime tree; the SDK's undeployed `@cfworker/json-schema` entry was explicitly marked optional.
- `git diff --check` and candidate-range `git diff --check HEAD^ HEAD`: PASS.
- Credential/private-key, generated artifact, provider SDK, host/UI import, network primitive, and implicit runtime invocation scans: PASS — no matches in their applicable source/tracked-file scopes.

No provider SDK, network call, credential, host dependency, or formal host mode was introduced or exercised.

## Platform coverage

Actually exercised:

- macOS 26.5.1
- Darwin 25.5.0 arm64
- Node.js 25.6.1
- npm 11.9.0

Not exercised and not inferred:

- Windows process behavior
- exact Node.js 24 runtime

WO-ST-03 is accepted. Formal host mode remains a separate future host-repository decision and was not started by this QA.
