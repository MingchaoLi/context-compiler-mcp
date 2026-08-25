# WO-PUB-01 Fresh Independent Re-QA — Append-only Baseline Fix

Verdict: **PASS / ACCEPTED**

Fixed candidate: `642b456f53a18a4bbce2276bf5d3b44f406fd9cb`

Fix parent / first QA return: `6dbedcc417e5391b9023d6e251baa397b7fae2d9`

Source candidate: `4643a4761a7c2b91837a198c2f7ebc340fcb8511`

Actual implementation baseline: `7a79ac631c4dd402b3cc157961e5844349d5c496`

Environment: Darwin 25.5.0 arm64, Node.js 25.6.1, npm 11.9.0.

## Scope and isolation

This was a fresh Independent re-QA pass, physically separate from the Builder and the first Independent
QA. I read the repository authority routed by WO-PUB-01 and used only synthetic temporary data. I did not
read any external Black-box QA directory, Case, Gold, Raw, Evidence, hidden holdout, QA artifact, sibling
Host source, model/provider data or network resource. I did not modify Builder source, tests, README,
work order, handoff, project state or roadmap; this report is the only repository path written by re-QA.

The checked-out branch was `main`, pre-report `HEAD` was the exact fixed candidate, and the pre-report
worktree was clean.

## Append-only identity and change-surface audit

All four fixed identities above resolve to commits. The ancestry is exact:

```text
7a79ac631c4dd402b3cc157961e5844349d5c496
  -> 4643a4761a7c2b91837a198c2f7ebc340fcb8511
  -> 6dbedcc417e5391b9023d6e251baa397b7fae2d9
  -> 642b456f53a18a4bbce2276bf5d3b44f406fd9cb
```

The source candidate's parent is exactly the declared actual implementation baseline. Relative to that
baseline, the source candidate still changes exactly seven paths:

```text
README.md
docs/PROJECT_STATE.md
docs/ROADMAP.md
docs/handoffs/WO-PUB-01-public-mcp-result-boundary.md
docs/work-orders/WO-PUB-01-public-mcp-result-boundary.md
src/mcp-server.ts
test/mcp-protocol.test.ts
```

Relative to the first QA return, the fixed candidate changes exactly the bounded four documentation
paths:

```text
docs/PROJECT_STATE.md
docs/ROADMAP.md
docs/handoffs/WO-PUB-01-public-mcp-result-boundary.md
docs/work-orders/WO-PUB-01-public-mcp-result-boundary.md
```

The nonexistent identity `7a79ac6ba0bdbd4137640cf148ef810604f85bad` has zero occurrences across
those four fixed paths. Every complete 40-character commit identity currently written in those paths
resolves. The identity remains quoted only in the append-only first QA report as historical evidence of
the defect that caused the return; that report was correctly not rewritten.

`README.md`, `src/mcp-server.ts` and `test/mcp-protocol.test.ts` at the fixed candidate are byte-identical
to the source candidate. Therefore the append-only fix does not alter the previously tested public DTO,
Core/library behavior, protocol tests, package content or public documentation contract.

## Independent source-evidence confirmation

The first QA report's passing functional evidence remains applicable because the implementation and
tests are byte-identical. I also reran the focused and full repository checks and independently exercised
a newly packed production-only stdio service with a synthetic database:

1. Direct packaged library compile retained `operational_debug` and `debug_manifest` internally.
2. The packaged stdio service exposed exactly nine tools and returned `health.ready=true`.
3. Public `compile_context` returned exactly `context` plus `metrics`; `context` had the four allowed
   fields and `metrics` had the nine allowed aggregate fields.
4. Public `rendered_context` was byte-for-byte equal to the direct internal result for the same semantic
   input.
5. The public JSON contained none of the sampled debug/manifest, candidate, score, trace, raw ID or
   dependency-path keys.
6. The production-only package contained the MCP SDK and Zod, while Vitest and TypeScript were absent.

This independent package check supplements, rather than replaces, the first QA's broader State +
BM25/Dense + `operation_id`, future-field injection, malformed-success, schema-comparison, telemetry and
recursive forbidden-key evidence. Since the exact source bytes are unchanged, those broader passing
results remain reproducible evidence for this fixed candidate.

## Mechanical checks

```text
main / fixed candidate / clean pre-report worktree
PASS

commit resolution, exact parent and ancestry chain
PASS

fix range exact four paths
PASS

source range exact seven paths
PASS

invalid identity absent from the four fixed paths
PASS

all full commit identities in the four fixed paths resolve
PASS

README + source + protocol test byte identity versus source candidate
PASS

npm exec vitest run test/mcp-protocol.test.ts
PASS — 1 file / 15 tests

npm test
PASS — 37 files passed, 1 skipped / 571 tests passed, 1 skipped

npm run build
PASS — tsc -p tsconfig.json

production-only package public stdio synthetic seam
PASS — exact nine tools, health ready, closed 4+9 allowlist, byte-identical rendered context

git diff --check
PASS
```

## Decision

The append-only fix correctly repairs the non-resolving implementation-baseline identity, preserves the
complete QA return chain, and leaves the passing Public MCP Result Boundary implementation byte-identical.
WO-PUB-01 is **ACCEPTED** at fixed candidate
`642b456f53a18a4bbce2276bf5d3b44f406fd9cb`. The repository may now publish a new hosted-build identity
and public health/reconnection signal without exposing internal diagnostic data.
