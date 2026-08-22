# WO-ST-02 implementation handoff

Date: 2026-08-23

Status: **IMPLEMENTED — REQUIRES INDEPENDENT QA**

## QA return and bounded fix

The first independent QA returned the candidate with two findings recorded in `docs/qa/WO-ST-02-evaluation-runner.md`:

- The npm `.bin/context-compiler-eval` symbolic-link entry silently exited because the main-module guard compared an unresolved `argv[1]` path.
- Node's exact SQLite `ExperimentalWarning` polluted the CLI error stream on the exercised Node.js 25 runtime.

The append-only fix resolves both paths by comparing real entry paths, moving the already protocol-tested exact SQLite warning filter into a dependency-free shared module, and acquiring it before dynamically loading the SQLite-backed evaluator. Unrelated warnings remain forwarded. The real package-isolation protocol test now constructs the normal POSIX npm `.bin` link and verifies both a passing report and a standalone JSON runtime error through that link.

## Result

The candidate adds an offline `runEvaluationSuite` library API and `context-compiler-eval` JSON CLI. A strict version-1 fixture is evaluated in isolated per-case SQLite databases across:

- D0: complete ordered raw transcript.
- D1: newest configured complete user-turn window.
- D2: the existing deterministic assembler plus existing keyword/headline recall.

Reports contain per-case and aggregate approximate tokens, reduction ratios, labeled constraint retention, decision continuity, resolved-issue reopening, open-question continuity, recall recovery, and latency. Explicit D2 aggregate thresholds determine pass/fail. The CLI exits `0` for pass, `2` for completed threshold failure, `3` for invalid input, and `4` for sanitized runtime failure.

## Boundary notes

- Probe matching is deterministic Unicode NFKC, whitespace collapse, and exact containment. It does not claim semantic grading.
- The shared character-count-divided-by-four estimator remains an approximation, not a provider tokenizer.
- Fixture loading writes only isolated temporary raw/headline data; timed evaluation is read-only and temporary paths are absent from reports.
- No extractor transport, model/provider SDK, network call, host import, UI, state mutation, headline generation, or MCP tool was added. The MCP protocol remains exactly nine tools.

## Files

- `src/evaluation.ts`: strict fixture parsing, isolated execution, D0/D1/D2 metrics, aggregation, and threshold evaluation.
- `src/evaluation-cli.ts`: executable versioned JSON CLI and stable exits.
- `src/index.ts`, `package.json`: public exports, package bin, and evaluation script.
- `test/evaluation.test.ts`: 21 focused runner/parser/CLI/isolation tests.
- `test/fixtures/evaluation-suite.json`: representative labeled fixture.
- `README.md`, architecture/decision/state/roadmap/work-order docs: contract and status.

## Implementer verification

Environment: Darwin 25.5.0 arm64, Node.js 25.6.1, npm 11.9.0.

- `npm test`: PASS; 9 files, 187 tests.
- `npm run test:protocol`: PASS; 8 tests, including real stdio/package isolation and exact nine-tool behavior.
- `npm run build`: PASS.
- Representative real CLI: PASS; D2 reduced estimated tokens by `0.704388`, retained all labeled constraints/decisions/open questions, reopened zero resolved issues, recovered all labeled recall evidence, and passed thresholds.
- Real `npm pack` and dry-run with a task-local cache: PASS; the fixed candidate contains 44 entries including evaluation/warning-filter JS and declarations, with no source/test paths.
- Production-only extracted package after offline prune: PASS; representative evaluation ran successfully, `npm ls --omit=dev --all --offline` passed, and Vitest/TypeScript were absent.
- `git diff --check`: PASS.

Post-return verification also passed all 187 tests, the 8-test real protocol suite, build, package dry-run, production dependency tree, and the new real tarball `.bin` success/error regression. On the exercised Node.js 25.6.1 runtime, the linked CLI now emits no SQLite platform warning while the existing warning-filter tests continue to prove that unrelated warnings are forwarded and overlapping leases restore correctly.

The implementer does not approve this delivery. Independent QA must verify the exact committed candidate, write `docs/qa/WO-ST-02-evaluation-runner.md`, and either accept it or return defects for append-only fixes.
