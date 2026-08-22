# WO-ST-02 independent QA

Date: 2026-08-23

First-pass verdict: **FAIL — RETURNED TO IMPLEMENTATION**

Fresh re-QA verdict: **PASS — ACCEPTED**

## Candidate identity

- Branch at QA start: `main`
- Candidate: `218a496de66a8664892159d870508248ba4a24b7`
- Accepted parent: `c750875906d79de2ef3a64eceea22ccab6541b5c`
- The branch, exact HEAD, exact parent, and a clean tracked/untracked worktree were independently verified before testing.
- QA did not implement ST-03 or modify implementation code.

## Findings

### P1 — The packaged `context-compiler-eval` bin silently does nothing through the npm symlink

`package.json` declares `context-compiler-eval` as `dist/evaluation-cli.js`, but the main-module guard at `src/evaluation-cli.ts:70-72` compares `import.meta.url` with the unresolved `process.argv[1]` path. On macOS npm exposes a package bin through `node_modules/.bin`; when that path is a symbolic link, Node resolves the module URL to the real target while `argv[1]` remains the bin link. The comparison is false, `runEvaluationCli` is never called, and the executable exits `0` without output.

Independent reproduction used the real tarball and the normal POSIX npm link layout:

```text
node_modules/.bin/context-compiler-eval
  -> ../context-compiler-mcp/dist/evaluation-cli.js
```

Running the packed entry directly and through the bin link against the same valid fixture produced:

```json
{"direct":{"status":0,"stdout_bytes":2799,"stderr_bytes":0},"linked":{"status":0,"stdout_bytes":0,"stderr_bytes":0}}
```

Expected: the package bin must execute the evaluation and emit the same versioned JSON report as the direct entry, with exit `0` or `2` according to thresholds. Actual: a false-success exit with no report. This breaks the advertised package executable and the package-bin acceptance check.

### P2 — Real CLI stderr is not a standalone machine-readable JSON document on the tested supported Node version

On Node.js `25.6.1`, loading the evaluation path emits Node's SQLite `ExperimentalWarning`. The MCP server already filters only that exact warning, but the evaluation CLI does not. A successful real process leaves the JSON report on stdout but also writes the warning to stderr. More importantly, a missing-file/runtime failure writes the warning followed by the JSON error object, so parsing stderr as one JSON document fails.

Independent real-process evidence without `NODE_NO_WARNINGS`:

```json
{
  "valid": {
    "status": 0,
    "stdout_json": true,
    "stderr": "(node:...) ExperimentalWarning: SQLite is an experimental feature and might change at any time\n(Use `node --trace-warnings ...` to show where the warning was created)\n"
  },
  "missing": {
    "status": 4,
    "stdout": "",
    "stderr": "(node:...) ExperimentalWarning: SQLite is an experimental feature and might change at any time\n(Use `node --trace-warnings ...` to show where the warning was created)\n{\"version\":1,\"passed\":false,\"error\":{\"code\":\"RUNTIME_FAILURE\"}}\n"
  }
}
```

`NODE_NO_WARNINGS=1` is a caller workaround, not part of the CLI contract. The executable should preserve a stable, sanitized machine-readable stream itself while forwarding unrelated warnings.

No P3 findings were recorded.

## Independent contract review

Apart from the findings above, static review and independent assertions confirmed:

- Fixture version `1` is strict; unknown fields, duplicate identifiers/ranges/relations/probes, invalid references, empty required collections, non-canonical timestamps, and invalid numeric bounds are rejected before case execution.
- D0 renders all ordered raw events; D1 selects the configured newest complete user-turn suffix; D2 reuses the accepted assembler and immutable headline keyword recall.
- Per-case and aggregate token, constraint, decision, reopening, open-question, recall, and latency calculations were independently recomputed, including zero-denominator conventions.
- Aggregate threshold failures are ordered as token reduction, constraint retention, decision continuity, resolved reopening, open-question continuity, recall recovery, and mean latency. With platform warnings suppressed only to isolate application output, real processes returned `0`, `2`, `3`, and `4` for their documented conditions.
- Same-session/same-headline-range cases remain isolated; recall misses fail the recall threshold; a zero latency threshold fails; temporary evaluation directories are removed; and the submitted input remains unchanged.
- Failure payloads did not echo malicious fixture evidence, malformed JSON text, input paths, database paths, or environment details.
- Timed evaluation is read-only after isolated raw/headline setup. No model, network, provider, host, or UI dependency was introduced.
- An independent real MCP client listed exactly nine tools: `health`, `ingest_event`, `compile_context`, `get_state`, `prepare_state_update`, `apply_state_delta`, `create_headline`, `recall_exact`, and `recall_keyword`.

## Verification matrix

Environment actually run: macOS `26.5.1`, Darwin arm64, Node.js `25.6.1`, npm `11.9.0`. Windows and exact Node.js 24 were not run and are not inferred.

- `npm test`: PASS — 9 files, 187 tests.
- `npm run test:protocol`: PASS — 8 tests.
- `npm run build`: PASS.
- Representative real evaluation: PASS — D2 estimated-token reduction `0.704388`, all positive labeled rates `1`, reopening `0`, recall `1`, thresholds passed.
- Independent boundary harness: PASS — 44 real CLI processes covering D0/D1/D2, strict/malicious JSON, all threshold order, exits `0/2/3/4`, same-session/range isolation, recall miss, latency threshold, zero denominators, input immutability, and temporary cleanup. Platform warnings were suppressed in this harness so application JSON could be asserted independently; the unsuppressed behavior is P2 above.
- `npm pack --dry-run --json` with a task-local cache: PASS — 41 entries, only `dist`, `README.md`, and package metadata.
- Real `npm pack`: PASS.
- Production-only extracted package after offline `npm prune --omit=dev`: PASS — packaged evaluation ran, `npm ls --omit=dev --all --offline` passed, and Vitest/TypeScript were absent.
- Package bin: **FAIL** — P1 above.
- Repository `npm ls --all`: PASS; only platform-inapplicable optional dependencies were unmet.
- Credential scan: PASS.
- Generated-file scan: PASS.
- Provider/network/host/UI import scan: PASS.
- Candidate and worktree `git diff --check`: PASS before this QA record was added.

The global npm cache was not modified or repaired after npm reported root-owned entries. No `sudo` or ownership change was used; pack/prune work used the task-local temporary cache.

## Required disposition

Return WO-ST-02 to implementation for an append-only fix commit. At minimum, the next candidate must:

1. make the packaged bin symlink execute the CLI and add a real installed/bin-path regression test;
2. keep real-process stderr machine-readable by filtering only the exact SQLite experimental warning without swallowing unrelated warnings;
3. rerun the full WO-ST-02 verification matrix and receive fresh independent QA.

ST-03 remains blocked.

## Fresh re-QA acceptance

Date: 2026-08-23

Verdict: **PASS — ACCEPTED**

### Candidate identity

- Branch: `main`
- Fixed candidate: `b0ec8de081a59ab5ae6725dad730080232d93aee`
- Parent/original returned candidate: `218a496de66a8664892159d870508248ba4a24b7`
- Branch, exact HEAD, exact parent, and a clean tracked/untracked worktree were independently verified before re-QA.
- The fix is one append-only commit. No ST-03 work was included or started.

### Returned-finding closure

The first-pass findings above remain intact as the historical QA return. Fresh re-QA independently closed both findings against the real fixed tarball:

- **P1 closed:** a standard POSIX `node_modules/.bin/context-compiler-eval -> ../context-compiler-mcp/dist/evaluation-cli.js` link now executes the packaged CLI. The success path returned exit `0`, a `2791`-byte version-1 JSON report, and empty stderr. The missing-file path returned exit `4`, empty stdout, and a standalone JSON `RUNTIME_FAILURE` object on stderr.
- **P2 closed:** neither the success nor error package-bin process used `NODE_NO_WARNINGS`; the exact SQLite warning was absent. Independent lease assertions suppressed only the exact string/Error `ExperimentalWarning` forms while forwarding same-message/wrong-type, other experimental, security, and deprecation warnings. Overlapping leases retained the filter until the last release and restored the prior warning handler afterward. Importing the real CLI module and emitting a later unrelated `SecurityWarning` also forwarded it while no SQLite warning appeared.

No new P1, P2, or P3 findings were recorded.

### Fresh verification matrix

Environment actually run: macOS `26.5.1`, Darwin `25.5.0` arm64, Node.js `25.6.1`, npm `11.9.0`. Windows and exact Node.js 24 were not run and are not inferred.

- `npm test`: PASS — 9 files, 187 tests.
- `npm run test:protocol`: PASS — 8 tests, including real packaged `.bin` success/error coverage.
- `npm run build`: PASS.
- Representative real evaluation without warning suppression: PASS — D2 estimated-token reduction `0.704388`, all positive labeled D2 rates `1`, reopening `0`, recall `1`, and all thresholds passed.
- Real `npm pack`: PASS — 44 entries.
- `npm pack --dry-run --json` with a task-local cache: PASS — 44 entries containing the evaluation and SQLite-warning JS/declarations, with no source or test paths.
- Production-only extracted real tarball after offline `npm prune --omit=dev`: PASS. Eight additional real package-bin processes covered exits `0/2/3/4`, all seven threshold-failure ordering, malformed and malicious JSON sanitization, same-session/same-range isolation, recall miss, and latency threshold. Every application stream was independently JSON-parseable where required.
- Repository and production-only `npm ls --omit=dev --all`: PASS; only platform-inapplicable optional dependencies were unmet. Vitest and TypeScript were absent from the production tree.
- Independent real MCP client: PASS — exactly nine tools with the accepted names.
- Credential scan: PASS.
- Generated-file scan: PASS.
- Provider/network/host/UI import scan: PASS. The extracted warning module has no imports and therefore no SQLite, MCP, host, or provider dependency.
- Candidate and worktree `git diff --check`: PASS.
- Input isolation, temporary cleanup, read-only timed evaluation, sanitized failures, provider neutrality, and the original fixture/metric contract remain covered by the first-pass independent matrix and the full fresh regression suite.

All task-local tarball, cache, installation, fixture, and harness artifacts were removed after verification. No global npm-cache repair, `sudo`, or ownership change was used.

### Acceptance decision

WO-ST-02 is accepted at fixed source candidate `b0ec8de081a59ab5ae6725dad730080232d93aee`. The first QA return remains part of the append-only history. ST-03 was not started by this QA task and remains a separate future work order.
