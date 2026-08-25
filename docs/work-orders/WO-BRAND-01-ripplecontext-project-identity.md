# WO-BRAND-01 — RippleContext project identity

Status: BUILDER HANDOFF COMPLETE / INDEPENDENT QA PENDING

Pre-source Gate commit: `67d8b9088e8e9651d81def65c0cd174390785eb4`

Builder source candidate: `01476363afea02a2073892c8e42ccb5662cd9e94`

Updated: 2026-08-25

Execution baseline: `4efe35e47a0361c60940c7bcbf9f9d29ab7dbc17`

## 1. Result

Adopt `RippleContext` as this repository's public product/project name while preserving every current technical compatibility identity.

This is a branding and authority-reconciliation work order, not a runtime rename or Host integration.

## 2. Required identity split

| Layer | Identity after this work order |
| --- | --- |
| Public product/project name | `RippleContext` |
| Repository working-directory path | unchanged: `context-compiler-mcp` |
| npm package | unchanged: `context-compiler-mcp` |
| executable/bin | unchanged: `context-compiler-mcp` |
| MCP server identity/version | unchanged |
| public tools | unchanged exact nine |
| database environment variable | unchanged: `CONTEXT_COMPILER_DB_PATH` |
| legacy compatibility variable | unchanged: `DSH_HOME` |
| library exports, schema, storage, migrations | unchanged |

The unchanged technical identities are compatibility surfaces, not the public product name. Renaming any of them requires a later bounded compatibility Gate with Host migration and rollback evidence.

## 3. Allowed paths

- `README.md`
- `package.json` — description only; `name`, `bin`, version, dependencies, scripts, files, exports, and engines are frozen
- `docs/PROJECT_STATE.md`
- `docs/ROADMAP.md`
- `docs/ARCHITECTURE.md`
- `docs/DECISIONS.md`
- this work order
- `docs/handoffs/WO-BRAND-01-ripplecontext-project-identity.md`

No source, schema, test, evaluation, artifact, adapter, or package-lock path is authorized.

## 4. Required changes

1. The active public entrypoint names the project `RippleContext` and describes `context-compiler-mcp` as the preserved technical package/MCP service identity.
2. Current repository authority records the public/technical identity split without rewriting historical accepted evidence.
3. Architecture and decision entry documents state that Core remains model/Host independent and adapters remain external.
4. Roadmap records this branding work as bounded and does not imply Host formal mode, Pi, DeepSeek, Codex plugin, WO-06/07, or algorithm work.
5. Historical work orders, QA reports, handoffs, commit messages, hashes, filenames, and frozen artifacts remain byte-unchanged.

## 5. Prohibited changes

- directory move or Git history rewrite
- npm/package/bin/server/env/tool rename
- MCP schema or output change
- source/schema/test/config/package-lock/evaluation/artifact change
- adapter implementation or dependency
- compatibility alias, migration, redirect, symlink, or wrapper executable
- claims that the public name alone proves a new runtime or product capability

## 6. Acceptance

- Exact diff is limited to §3.
- `package.json` changes only its `description` value.
- Mechanical search of active entry documents establishes the public name and explicit compatibility identities.
- `npm test`, `npm run build`, production-only package inspection, and `git diff --check` pass.
- Builder handoff records the exact candidate and Independent QA separately verifies the no-runtime-delta claim.
