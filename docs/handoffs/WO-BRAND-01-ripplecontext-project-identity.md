# WO-BRAND-01 Builder handoff — RippleContext project identity

Status: BUILDER HANDOFF COMPLETE / INDEPENDENT QA REQUIRED

Date: 2026-08-25

## Identities

- Repository working directory: `context-compiler-mcp` (preserved compatibility path)
- Branch: `main`
- Execution baseline: `4efe35e47a0361c60940c7bcbf9f9d29ab7dbc17`
- Pre-source Gate: `67d8b9088e8e9651d81def65c0cd174390785eb4`
- Builder source candidate: `01476363afea02a2073892c8e42ccb5662cd9e94`

## Delivered result

- Public product/project identity is now `RippleContext` in the active README and repository authority entry documents.
- `context-compiler-mcp` remains the repository path, npm package, executable, MCP server compatibility identity, and library import name.
- Exact-nine tools, `CONTEXT_COMPILER_DB_PATH`, `DSH_HOME`, exports, schema, storage, migrations, source, tests, package lock, evaluation, and accepted artifacts remain unchanged.
- Architecture and D-016 keep Core model/Host independent and put official Harness/Host adapters in the separate `RippleContext-adapter` repository behind public interfaces.
- No historical work order, QA report, handoff, artifact, filename, or commit was rewritten.

## Exact Builder source surface

`67d8b9088e8e9651d81def65c0cd174390785eb4..01476363afea02a2073892c8e42ccb5662cd9e94` changes exactly:

- `README.md`
- `package.json` (`description` only)
- `docs/PROJECT_STATE.md`
- `docs/ROADMAP.md`
- `docs/ARCHITECTURE.md`
- `docs/DECISIONS.md`
- `docs/work-orders/WO-BRAND-01-ripplecontext-project-identity.md`

## Checks

- Mechanical package comparison against execution baseline — PASS; only top-level `description` changed.
- Active-entry identity search — PASS; `RippleContext` is the public name and every preserved compatibility boundary is explicit.
- `npm test` — PASS, 37 files passed / 1 skipped; 586 tests passed / 1 skipped.
- `npm run build` — PASS.
- `env npm_config_cache=/private/tmp/ripplecontext-core-brand-npm-cache npm pack --dry-run` — PASS; technical tarball remains `context-compiler-mcp@0.1.0`, 83 files.
- `git diff --check` — PASS.
- Candidate worktree after commit — clean.

## QA focus

Independent QA should mechanically prove:

1. exact ancestry and seven-path Builder source surface;
2. `package.json` changed only `description`;
3. no source/schema/test/package-lock/evaluation/artifact/historical evidence changed;
4. public project name is unambiguous while all technical identities remain exact;
5. Core/Host independence and separate adapter ownership are not weakened;
6. full tests, build, production-only pack, exact-nine tools, and stdio server identity remain unchanged.

Builder does not approve this result.

