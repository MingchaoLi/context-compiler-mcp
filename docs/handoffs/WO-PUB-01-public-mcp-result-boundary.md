# WO-PUB-01 Builder Handoff — Public MCP Result Boundary

Status: **BUILDER FIX COMPLETE / AWAITING FRESH INDEPENDENT RE-QA**

Implementation baseline: `7a79ac631c4dd402b3cc157961e5844349d5c496`

Returned source candidate: `4643a4761a7c2b91837a198c2f7ebc340fcb8511`

QA return: `6dbedcc417e5391b9023d6e251baa397b7fae2d9`

Fix parent: `6dbedcc417e5391b9023d6e251baa397b7fae2d9`

Fixed candidate: the commit containing this corrected handoff; fresh Independent re-QA must resolve and
pin its exact hash before review. The fix changes documentation identity/status only; the passing source
candidate remains byte-identical.

## Bounded result

Only the public stdio `compile_context` success result is projected. The MCP adapter constructs a new
closed-world DTO field by field:

```text
result.context
  session_id
  rendered_context
  budget_exceeded
  budget_overage

result.metrics
  full_context_tokens
  compiled_context_tokens
  recent_window_tokens
  active_state_tokens
  retrieved_tokens
  compile_latency_ms
  extractor_latency_ms
  active_state_items
  suppressed_items
```

Unknown future internal fields are ignored. A malformed internal success shape returns the existing
sanitized `INTERNAL_FAILURE` envelope instead of a partial result. Other tools and compile failures keep
their existing public envelopes.

The internal `ContextCompilerMcpService.call("compile_context", ...)` result remains unchanged, including
its deterministic diagnostics and durable telemetry composition. `rendered_context` is copied byte for
byte from that internal result; retrieval, ranking, State, context assembly, storage, schema and input
contracts are not modified.

## Leak closure evidence

The real stdio test exercises State, Recent Raw, BM25/Dense retrieval and `operation_id`, then recursively
audits the public JSON. It rejects exposure of debug/manifest, candidate IDs/ranges, ranking components,
selection flags, trace/ledger/baseline identity, raw/state IDs, dependency paths and dormant/reactivated
identities. The corresponding direct service call still exposes the internal diagnostics, and two
durable compile traces remain committed.

A separate injected-service test proves that extra fields at the result, context and metrics levels do
not pass through, while a malformed internal success fails closed.

## Exact Builder change surface

Relative to implementation baseline `7a79ac631c4dd402b3cc157961e5844349d5c496`, the source candidate changes
exactly:

```text
src/mcp-server.ts
test/mcp-protocol.test.ts
README.md
docs/work-orders/WO-PUB-01-public-mcp-result-boundary.md
docs/handoffs/WO-PUB-01-public-mcp-result-boundary.md
docs/PROJECT_STATE.md
docs/ROADMAP.md
```

No Core, retrieval, State, schema, database, config, dependency, package, evaluation, official artifact
or sibling-repository path is changed.

## Builder verification

```text
npm exec vitest run test/mcp-protocol.test.ts
PASS — 1 file / 15 tests

npm test
PASS — 37 files passed, 1 skipped / 571 tests passed, 1 skipped

npm run build
PASS — tsc -p tsconfig.json

git diff --check
PASS
```

All diagnostics used synthetic temporary databases. No external QA Case, Gold, Raw Evidence, hidden
holdout, QA artifact, model, provider, network, credential or sibling Host source was read.

## Independent QA requirements

The Builder does not approve this candidate. Fresh Independent QA must at minimum:

1. pin the candidate, parent and exact seven-path change surface;
2. run a real stdio State + BM25/Dense + `operation_id` compile and recursively audit every returned key;
3. compare public `rendered_context` byte-for-byte with the corresponding internal result;
4. independently inject future internal fields and malformed internal success shapes;
5. prove direct service diagnostics and durable compile telemetry remain intact;
6. prove the other eight tools, nine-tool order/input schemas, failures and stdout purity are unchanged;
7. run from a production-only package and repeat focused/full/build/diff checks; and
8. write a separate QA report and commit.

The currently hosted public build remains unchanged until this candidate passes Independent QA.

## Append-only QA-return correction

First Independent QA passed every functional, protocol, package and regression check but returned the
candidate because the four full implementation-baseline references resolved to no Git object. This fix
replaces them with the exact candidate parent above and records the return chain. It does not modify
source, tests, README, configuration, package content or the public DTO contract.
