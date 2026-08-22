# Standalone Migration QA

- Result: **PASS**
- Base: `afff9367b2c46917e6f6a3483fc493966be63dc6`
- Candidate: `710d18de1a5620acc419bc864215f1927e8bcbad`
- Platform: macOS arm64, Node.js `v25.6.1`

## Verified

- Filtered history is append-only: the candidate adds one migration commit to the standalone core history.
- A clean tracked snapshot passed `npm ci`, all 159 unit tests, build, and all 7 protocol tests.
- The real npm tarball contains only the README, package manifest, and compiled `dist` files.
- A production-only isolated install started the stdio MCP server, exposed exactly seven tools, executed all seven, and terminated without leaving a child process.
- Packaged runtime resolution stayed inside the isolated install and did not use the source repository or the assistant repository.
- `CONTEXT_COMPILER_DB_PATH` takes precedence over the approved legacy `DSH_HOME` fallback.
- The archived implementation brief is byte-for-byte identical to the original attachment.
- Project state and roadmap documents accurately label automatic state evolution, evaluation runner, runtime extractor provider, and formal host mode as not implemented.
- Source and package scans found no React, Tauri, Harness, Cordis, ACP, assistant UI, messaging, embedded network provider, model, or API-key coupling.
- Credential, absolute development path, generated database, log, archive, and build-artifact scans passed.
- `git diff --check` passed and the candidate worktree remained clean.

## Findings

No P1, P2, or P3 defects were found.

## Remaining platform risk

This migration QA did not rerun the matrix on Node.js 24 or Windows. Those checks remain release-platform work and do not block the source-project separation.

## Decision

Release approved for candidate `710d18de1a5620acc419bc864215f1927e8bcbad`.
