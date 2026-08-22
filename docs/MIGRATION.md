# Standalone migration record

## Objective

Turn the approved Context Compiler core into an independent, private-ready MCP project. Preserve the filtered Git history, make the package build and test without the TuanTuan repository, and transfer only durable Context Compiler facts into concise project documentation.

Source provenance:

- Original repository: `MingchaoLi/deepseek-pet-agent`
- Approved integrated source commit: `fa96b23189c94d6069dd64bc9e4588b0a0920e6d`
- Filtered standalone history base: `afff9367b2c46917e6f6a3483fc493966be63dc6`
- Core approvals before integration: WO-CC-01 through WO-CC-05, then local MCP service WO-CC-06A.

## Product Boundary

- This repository is the Context Compiler MCP plugin itself.
- It must not import or depend on React, Tauri, DeepSeek Harness, Cordis, ACP, the desktop pet, WeChat, or assistant packaging.
- Host-specific bridges remain in host repositories.
- No model provider is selected here. External hosts may later supply an `ExtractorTransport`; the plugin owns strict validation and deterministic state transitions.

## Required Repository Layout

```text
AGENTS.md
README.md
package.json
package-lock.json
tsconfig.json
.gitignore
src/
test/
docs/
  PROJECT_STATE.md
  ARCHITECTURE.md
  DECISIONS.md
  ROADMAP.md
  MIGRATION.md
  REQUIREMENTS_V0.md
  archive/ORIGINAL_IMPLEMENTATION_BRIEF.md
  work-orders/WO-ST-01-state-update-pipeline.md
  handoffs/
  qa/
```

## Migration Changes

1. Keep all approved core source and tests. Do not implement the unfinished state-update pipeline during this migration.
2. Make the repository self-contained:
   - package name neutral and independent;
   - runtime dependencies: official MCP SDK and zod versions already approved;
   - dev dependencies: TypeScript, Vitest, Node types;
   - scripts for build, test, protocol test and MCP start;
   - Node `>=24`.
3. Adapt `test/mcp-protocol.test.ts` to standalone paths. Remove imports and assertions tied to `scripts/prepare-sidecar.mjs`, Harness layouts, root Vite project, or portable TuanTuan sidecars. Replace them with a standalone packaged-layout or `npm pack`-equivalent isolation test that resolves only this package's runtime dependencies.
4. Neutralize product names in package metadata and MCP server identity (`context-compiler-mcp`); do not rewrite historical Git commits.
5. Keep the current seven tools and behavior unchanged. Standalone migration is not authorization to add the two state-update tools yet.
6. Copy the full original user brief into `docs/archive/ORIGINAL_IMPLEMENTATION_BRIEF.md`; write a concise requirements index in `docs/REQUIREMENTS_V0.md` so agents do not load the archive by default.
7. `AGENTS.md` must route future work through `docs/PROJECT_STATE.md`, `docs/ROADMAP.md`, and one current work order, with strict independent QA and no host coupling.
8. `docs/ROADMAP.md` must make the next order explicit:
   - ST-01 model-independent prepare/apply State Delta pipeline;
   - ST-02 evaluation runner for D0/D1/D2 and continuity/recovery metrics;
   - ST-03 choose an optional extractor transport;
   - only then consider formal compiler mode in host adapters.
9. Record known gaps truthfully: runtime State Extractor transport absent, automatic state evolution absent, automatic headline generation absent, evaluation runner absent, formal compiler mode absent.

## Validation

```sh
npm install --no-audit --no-fund
npm test
npm run build
npm run test:protocol
npm pack --dry-run
git diff --check
```

Also scan tracked files and package contents for host imports, secrets, generated `dist`, SQLite DBs, logs, and accidental source-repository paths. The final worktree must be clean and the migration must be committed without rewriting the filtered history.

## Compatibility note

The approved seven-tool behavior is unchanged. `CONTEXT_COMPILER_DB_PATH` is the canonical standalone configuration. The existing `DSH_HOME/sessions/context-compiler.db` fallback is deliberately preserved for legacy adapter compatibility; it is an environment-path contract, not a source or package dependency.

## Migration result

- Package metadata and MCP identity are neutralized to `context-compiler-mcp`.
- The repository owns its dependency manifest, lockfile, build, tests, and protocol entry point.
- Protocol coverage builds from this repository and validates an npm-packed copy after an offline production-only dependency install.
- Host-side distribution-copy tests and root-repository paths were removed.
- Durable requirements were condensed into `REQUIREMENTS_V0.md`; the exact 1,725-line source brief is preserved in `archive/ORIGINAL_IMPLEMENTATION_BRIEF.md`.
- ST-01 is documented as planned work and was not implemented during migration.
