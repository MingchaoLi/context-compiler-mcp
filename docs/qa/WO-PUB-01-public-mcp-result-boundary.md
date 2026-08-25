# WO-PUB-01 Independent QA — Public MCP Result Boundary

Verdict: **FAIL / RETURN TO IMPLEMENTATION**

Builder candidate: `4643a4761a7c2b91837a198c2f7ebc340fcb8511`

Actual candidate parent: `7a79ac631c4dd402b3cc157961e5844349d5c496`

Environment: Darwin 25.5.0 arm64, Node.js 25.6.1, npm 11.9.0.

## Scope and isolation

This was a fresh Independent QA pass over the fixed Builder candidate. I read the repository authority
routed by WO-PUB-01 and used only synthetic temporary databases. I did not read any external Black-box
QA directory, Case, Gold, Raw, Evidence, hidden holdout, model/provider data, sibling Host source or
network resource. I did not modify Builder source, tests, configuration or artifacts; this report is the
only repository path written by QA.

The checked-out branch was `main`, `HEAD` was the exact Builder candidate, its actual parent was the
commit above, and the pre-report worktree was clean. Relative to the actual parent, the candidate changes
exactly these seven paths:

```text
README.md
docs/PROJECT_STATE.md
docs/ROADMAP.md
docs/handoffs/WO-PUB-01-public-mcp-result-boundary.md
docs/work-orders/WO-PUB-01-public-mcp-result-boundary.md
src/mcp-server.ts
test/mcp-protocol.test.ts
```

## Blocking finding

### P1 — The declared implementation baseline is not a Git object

WO-PUB-01 and its Builder handoff claim that the implementation baseline is:

```text
7a79ac6ba0bdbd4137640cf148ef810604f85bad
```

`git cat-file -e <declared>^{commit}` fails because that full object name does not exist. The candidate's
actual parent, and the commit resolved by the short prefix `7a79ac6`, is:

```text
7a79ac631c4dd402b3cc157961e5844349d5c496
```

The invalid full identity appears four times:

```text
docs/PROJECT_STATE.md
docs/work-orders/WO-PUB-01-public-mcp-result-boundary.md
docs/handoffs/WO-PUB-01-public-mcp-result-boundary.md  (two occurrences)
```

This prevents an independent reader from reproducing the stated implementation diff or verifying the
handoff's exact change surface from repository authority. Chat-supplied or abbreviated history cannot
repair an invalid full baseline written into the work order. The minimal return is an append-only
Builder fix that replaces all four invalid identities with the actual full parent and updates the
handoff/candidate chain without changing the already-passing source result.

## Independent functional evidence

The public-boundary implementation itself passed all executed checks:

1. A separate real-stdio scenario created non-empty State and Recent Raw, forced an older BM25/Dense
   retrieval hit, and used `operation_id`. The direct internal service returned the selected historical
   event, active State, `operational_debug`, `debug_manifest` and durable trace identity. The public stdio
   response contained only the exact four-field `context` and nine-field `metrics` allowlists.
2. A recursive public-key audit found none of the candidate/sequence, BM25/Dense/ranking/selection,
   debug/manifest, trace/telemetry, raw/state/dependency-path, dormant/reactivated or rescued identities.
   The public `rendered_context` was byte-for-byte equal to the direct internal result for the same
   semantic input.
3. Independent in-memory service injection proved that future fields at envelope, result, context and
   metrics levels do not pass through. Missing fields, `NaN`, negative integer data and accessor-backed
   required data all failed closed as the sanitized `INTERNAL_FAILURE` envelope. Existing compile
   failures and a non-compile success envelope remained unchanged.
4. I built the actual parent in an isolated archive and compared its complete `tools/list` result with
   the candidate. All nine tool names, order, descriptions and full input JSON Schemas were byte-value
   equivalent.
5. An independent `npm pack` extraction was pruned offline to production dependencies. It contained the
   MCP SDK and Zod but no Vitest or TypeScript, started the packaged stdio server, listed exactly nine
   tools, returned `health.ready=true`, produced the closed compile DTO and kept stderr/stdout protocol
   purity.
6. Direct SQLite audit after independent internal/public calls found all expected durable
   `CONTEXT_COMPILE` records and retrieval hits, confirming that the public projection did not remove
   internal telemetry.

## Mechanical checks

```text
npm exec vitest run test/mcp-protocol.test.ts
PASS — 1 file / 15 tests

npm test
PASS — 37 files passed, 1 skipped / 571 tests passed, 1 skipped

npm run build
PASS — tsc -p tsconfig.json

git diff --check
PASS

independent real stdio closed-allowlist scenario
PASS

independent future-field / malformed-success injection
PASS

exact parent-vs-candidate nine-tool schema comparison
PASS

independent production-only package stdio scenario
PASS
```

## Decision

The source-level Public MCP Result Boundary behaves as specified, but the candidate cannot be accepted
while its work order, project state and handoff bind a nonexistent implementation baseline. Return to
the Builder for the bounded four-reference documentation correction, then run fresh Independent re-QA
on the append-only fixed candidate before publishing a hosted build.
