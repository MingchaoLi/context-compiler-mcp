# Standalone migration handoff

Date: 2026-08-23
Source history base: `afff9367b2c46917e6f6a3483fc493966be63dc6`
Status: implementation candidate; independent QA required

## Result

The approved Context Compiler core and seven-tool MCP service now form a self-contained Node.js package named `context-compiler-mcp`. The filtered history was preserved. ST-01 was documented but not implemented.

## Changes

- Added independent package metadata, runtime/dev dependencies, lockfile, build/test/protocol/start scripts, package entry point, and generated-artifact ignores.
- Neutralized MCP and package identity while retaining all seven tool names, schemas, and behavior.
- Preserved the approved `DSH_HOME` database-path fallback as a documented legacy compatibility contract; explicit `CONTEXT_COMPILER_DB_PATH` remains first priority.
- Removed protocol-test dependence on a parent repository, distribution-copy script, and host layout.
- Added an isolation test that packs the project, extracts it, prunes an isolated dependency tree to production dependencies only, starts the packaged MCP child, verifies health/protocol purity, and verifies child exit on close.
- Replaced host-branded test temporary names and comments with neutral source terminology.
- Added standalone collaboration, architecture, state, decision, roadmap, requirements, migration, planned ST-01, and QA-routing documents.
- Preserved the exact original 1,725-line implementation brief in `docs/archive/ORIGINAL_IMPLEMENTATION_BRIEF.md`.

## Verification

- `npm install --no-audit --no-fund` — passed; 145 packages installed and standalone lockfile generated.
- `npm test` — passed; 7 files, 159 tests.
- `npm run build` — passed.
- `npm run test:protocol` — passed; 7 protocol tests, including packaged production-only isolation and real child shutdown.
- `npm pack --dry-run` — passed; package identity and runtime artifact list inspected.
- `npm ls --omit=dev --all` — passed; runtime tree resolves from the declared MCP SDK and Zod dependencies.
- `git diff --check` — passed.
- Original brief `cmp` — passed byte-for-byte.
- Source/test/package host-import scan — no matches.
- Credential-pattern scan outside the immutable archive — no matches.
- Generated/database/log scan — `dist`, `.cache`, and `node_modules` are ignored and untracked; no tracked DB, SQLite sidecar, log, tarball, or generated `dist` file.

## Remaining risks and gaps

- Runtime State Extractor transport, automatic state evolution, automatic headline generation, the D0/D1/D2 evaluation runner, and formal host compiler mode remain absent by design.
- Packaged isolation uses the already installed lockfile dependency tree, then prunes it offline; it validates declaration/isolation without performing a second registry download.
- The legacy `DSH_HOME` fallback intentionally exposes a historical environment name. It is compatibility behavior only and creates no source/package import dependency. A future breaking release may remove it under a dedicated work order.
- This candidate has not been independently approved.
