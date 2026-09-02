# WO-BRAND-01 Independent QA — RippleContext project identity

Status: **ACCEPTED / PASS**

Date: 2026-08-25

## Fixed identities

- Repository: `/path/to/context-compiler-mcp`
- Branch: `main`
- Execution baseline: `4efe35e47a0361c60940c7bcbf9f9d29ab7dbc17`
- Pre-source Gate: `67d8b9088e8e9651d81def65c0cd174390785eb4`
- Builder source candidate: `01476363afea02a2073892c8e42ccb5662cd9e94`
- Builder handoff HEAD: `b4385826fdf246f4041dec108667fe8c291cb632`

The baseline, Gate, source candidate, and handoff HEAD resolve as a strict ancestor chain. The worktree was clean before QA execution. This review did not read or modify any sibling Host or adapter repository.

## Verdict

The bounded branding result is accepted. `RippleContext` is now the unambiguous public product/project name, while the working-directory path and every technical runtime compatibility identity remain `context-compiler-mcp` or their existing exact values. No Core source, schema, test, package lock, evaluation, artifact, historical QA evidence, runtime behavior, or Host boundary changed.

## Mechanical boundary evidence

`67d8b9088e8e9651d81def65c0cd174390785eb4..01476363afea02a2073892c8e42ccb5662cd9e94` changes exactly seven paths:

1. `README.md`
2. `docs/ARCHITECTURE.md`
3. `docs/DECISIONS.md`
4. `docs/PROJECT_STATE.md`
5. `docs/ROADMAP.md`
6. `docs/work-orders/WO-BRAND-01-ripplecontext-project-identity.md`
7. `package.json`

The package diff changes only top-level `description`:

```text
Local, model-independent context state and recall service exposed over MCP
→ RippleContext: local, model-independent context state and recall service exposed over MCP
```

The following object identities are byte-exact between the execution baseline and handoff HEAD:

| Frozen surface | Baseline tree/blob | Handoff tree/blob |
| --- | --- | --- |
| `src/` | `d826f3df081d7c49bb8297cfa16d946dee561a36` | `d826f3df081d7c49bb8297cfa16d946dee561a36` |
| `test/` | `86e9c19acfb11c5787c7d06015b369476ee47cc1` | `86e9c19acfb11c5787c7d06015b369476ee47cc1` |
| `package-lock.json` | `b097160ed22f10b29a31e1ac5b6e734c172316d5` | `b097160ed22f10b29a31e1ac5b6e734c172316d5` |

The full baseline-to-handoff name set contains only the seven authority/entry paths above plus the newly added Builder handoff. No path under `src/`, `test/`, `docs/qa/`, evaluation/artifact trees, schema, or package-lock changed.

`git diff --check 67d8b9088e8e9651d81def65c0cd174390785eb4..01476363afea02a2073892c8e42ccb5662cd9e94` passed. The later administrative handoff commit contains one extra terminal blank line in its own new handoff file, so a baseline-to-handoff `git diff --check` emits a formatting warning at line 57. This is recorded as a non-blocking documentation-format observation: it is outside the fixed Builder source candidate, does not alter the accepted seven-path source result, and cannot affect the no-runtime-delta claim.

## Identity and boundary review

- `README.md`, current state, architecture, and D-016 consistently name the public project `RippleContext`.
- `package.json.name` remains `context-compiler-mcp`; version remains `0.1.0`.
- The executable/bin, stdio MCP server identity, exact-nine tools, `CONTEXT_COMPILER_DB_PATH`, legacy `DSH_HOME`, exports, schema, storage, and migrations are explicitly preserved.
- Core remains model-independent and Host-independent.
- Official Host/Harness adapters are explicitly external to this repository and assigned to `RippleContext-adapter` behind stable public interfaces.
- The roadmap does not imply Host formal mode, Pi/DeepSeek/Codex plugin implementation, WO-06/07, algorithm changes, or a technical-identity migration.

## Independent checks

Environment:

```text
Darwin 25.5.0 arm64
Node.js v25.6.1
npm 11.9.0
```

Results:

| Check | Result |
| --- | --- |
| `npm test` | PASS — 37 files passed, 1 skipped; 586 tests passed, 1 skipped |
| `npm run build` | PASS |
| isolated-cache `npm pack --dry-run --json` | PASS — `context-compiler-mcp@0.1.0`, `context-compiler-mcp-0.1.0.tgz`, 83 files |
| Gate-to-source `git diff --check` | PASS |
| worktree after test/build/pack | clean |

The production package retained the declared `context-compiler-mcp` identity and contained only `README.md`, `package.json`, and built `dist/` files; no adapter or Host implementation entered the package.

## Dynamic stdio verification

Using a synthetic database in an isolated `/private/tmp` directory, a fresh official MCP client completed initialize/connect, `tools/list`, and `tools/call` for `health` against `dist/mcp-server.js`.

Observed server identity:

```json
{"name":"context-compiler-mcp","version":"0.1.0"}
```

Observed tools, in protocol order:

```text
health
ingest_event
compile_context
get_state
prepare_state_update
apply_state_delta
create_headline
recall_exact
recall_keyword
```

- Tool count: `9`
- Normalized `{name,inputSchema}` SHA-256: `3097ad97c6aac25cb7cc18ba27b5690c2e0c737a88ca1cf6f3b2e2e809292205`
- `health`: `ok=true`, `result.version="0.1.0"`, `result.ready=true`, capabilities equal the same exact nine tools

Because `src/`, tests, and `package-lock.json` are byte-identical to the execution baseline, this live protocol check confirms the preserved server/tool/schema runtime rather than a renamed implementation.

## Scope note

This verdict accepts only the public branding and repository-authority reconciliation in WO-BRAND-01. It does not accept or authorize a directory/package/bin/server rename, adapter implementation, Host integration, provider/model selection, schema/storage migration, algorithm change, or any new runtime capability.
