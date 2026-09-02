# PH1-CORE-REL-01 Builder Handoff

Status: `QA-RETURN FIX COMPLETE / FIX CANDIDATE FROZEN / FRESH RE-QA REQUIRED`

## Exact lineage and scope

- Activated Planning Gate and source parent:
  `a08723fbe9a9855f4e7710d55b596ad3cf3e03ef`.
- Bounded source candidate:
  `4990d45cc0531bfd9db64bb1218e7cdb81a430eb`.
- Source candidate parent:
  `a08723fbe9a9855f4e7710d55b596ad3cf3e03ef`.
- This handoff is the direct docs-only child of that source candidate. Its exact commit is recorded after commit
  creation and must be fixed by the controller before Independent QA.
- The source commit changes exactly the twelve allowlisted package/source/test paths:
  `package.json`, `src/core.ts`, `src/index.ts`, `src/isolated-context-provisioner.ts`,
  `src/ledger-hot-raw.ts`, `src/query.ts`, `src/raw-store.ts`, `src/revision-substrate.ts`,
  `test/core-boundary.test.ts`, `test/isolated-context-provisioner.test.ts`, `test/query.test.ts`, and
  `test/raw-store.test.ts`.
- This direct-child commit changes only `docs/handoffs/PH1-CORE-REL-01.md`.

The Builder manually reconciled the three selected public behaviors onto the exact Gate. No merge, cherry-pick,
rebase, patch application, branch tree copy, ref movement or accepted-branch union occurred. The accepted Query,
provisioner and exact-receipt evidence objects remain non-ancestors.

## Bounded result

- Existing package-root, ingest, legacy `compile_context`, offline evaluation v1/v2 and both bins remain.
- Exact Raw receipt v1 is additive at package root and through `ContextCompilerCore.lookupRawReceipt`; the MCP
  command port remains exactly nine tools and has no `lookup_raw_receipt` command.
- `IsolatedContextProvisioner` v1 atomically creates one Core-owned empty native session, zero-vector revision
  stream and immutable payload-free registry receipt. It adds no close/delete/recycle lifecycle.
- `context-compiler-mcp/query` exposes exactly one runtime value, `CoreReadQuery`, and only the accepted
  session/Context-State/recall read methods. It is not canonical State authority or `ContextSnapshot`.
- The package export map is exactly `.`, `./query` and `./package.json`; deep internal subpaths are private.
- Package identity stays private `context-compiler-mcp@0.1.0`; binaries, files, engines, dependencies and lock
  identity are unchanged. No dependency was installed and no network, model, provider, Host, Adapter, UI,
  deployment, ACTIVE/live or private-data action occurred.

## S0 boundary evidence

- `git rev-parse HEAD` before implementation returned the exact Gate
  `a08723fbe9a9855f4e7710d55b596ad3cf3e03ef`; the worktree was clean.
- All reference evidence objects resolved. `git merge-base --is-ancestor <reference> a08723f...` returned false
  for the selected accepted reconciliations and source evidence. The Gate differed from content baseline
  `f07257044e458d2edaad7821a95e3f9b9d18d63b` only by the three planning documents.
- Baseline and current `ContextCompilerCore` initialization produced byte-equivalent ordered SQLite
  `sqlite_master` projections: 86 objects each.
- `package-lock.json` remained byte-identical at SHA-256
  `519fdcf4b874886466032343c25c5e5973679ef5e0ffc3dec5bf32cba3447d88`.
- Read-only MCP/evaluation identities remained:
  `src/mcp-server.ts` SHA-256 `2d57c47307176d77c27c0acee6cb353e9fd5ad6489f293a0012bf0794751b61b`;
  `src/evaluation.ts` SHA-256 `1c8585fb3c20f2fac423afd6c28b2065dd23b5917df3aa41181c5efe5f56e2d9`;
  `test/mcp-protocol.test.ts` SHA-256
  `8895bda776af6588e3dc927feb24f84e907e68688f0b79c16674be0e6764a03b`; and
  `test/evaluation.test.ts` SHA-256
  `a39f3f6b82bcd01800cfbfb0905ca1120c3ccadd7d4d2f74855c97bab0fcdfb8`.

## S1–S5 verification

All databases and artifacts used by the Builder were fresh and disposable.

- `npm run build && npx vitest run test/raw-store.test.ts test/core-boundary.test.ts
  test/isolated-context-provisioner.test.ts test/query.test.ts`:
  **4 files passed, 48 tests passed**.
- `npx vitest run test/mcp-protocol.test.ts test/evaluation.test.ts test/mcp-service.test.ts
  test/recall.test.ts test/revision-substrate.test.ts test/ledger-hot-raw.test.ts` initially produced
  **113 passed / 1 failed**. The only failure was the immutable package-runtime fixture copying the worktree
  `node_modules` symlink as a symlink; its offline prune removed the non-directory and attempted an unavailable
  cache read for an already-present dependency. No product assertion failed.
- The existing dependency tree from
  `/path/to/context-compiler-mcp/node_modules` was then materialized locally without
  install or network, and `npx vitest run test/mcp-protocol.test.ts` passed **17/17**. The local dependency copy is
  not in Git and is removed before delivery.
- The other five focused compatibility files passed **97/97** in the first run: evaluation 32, MCP service 7,
  recall 39, revision substrate 9 and Ledger/Hot Raw 10.
- `npm test`: **39 files passed / 1 skipped; 606 tests passed / 1 skipped (607 total)**.
- `npm run build`: passed, including the pre-source compile and each pack prepack compile.
- The exact-nine MCP order remained `health`, `ingest_event`, `compile_context`, `get_state`,
  `prepare_state_update`, `apply_state_delta`, `create_headline`, `recall_exact`, `recall_keyword`;
  the unchanged protocol suite passed 17/17, including tool names, schemas and packaged runtime.
- The coexistence test used one disposable DB and proved provision preflight/`CREATED`, restart operation and
  identity `EXISTS`, empty query visibility, exact `NOT_FOUND`, explicit-time ingest, `FOUND_EXACT`, idempotent
  retry, changed-proof `IDENTITY_COLLISION`, exact/keyword recall, legacy `compile_context`, offline evaluation
  v2, and reopen stability.
- Provision tests covered zero payload/axes, operation and identity collision, rollback on both sides of registry
  insertion, lost/restarted reads, two-worker linearization, hostile Proxy/Unicode/input, live dependency-trigger
  tamper, receipt corruption, authorized later Raw/canonical-Raw writes and closed-object behavior.
- Receipt tests covered the closed five-status set, explicit time, every Raw ingest field, exact bytes, timestamp
  equivalence, hostile object graphs, mirror/row validation, corruption/unavailability, reopen and forbidden-field
  scans. Public receipts/errors contained no Raw payload, metadata, timestamp, DB path, SQL, trace or stack.

## Export, privacy and package probes

- A fresh read-only build of exact baseline `f072570...` exposed 105 runtime root exports and 301 named root type
  exports. The candidate exposed 117 runtime and 328 named type exports with no removals. The additive sets were
  exactly the 12 frozen runtime symbols and 27 frozen runtime/type receipt-plus-provisioner symbols; no Query or
  internal migration/validator symbol leaked from root.
- Source-tree and extracted-package self-reference probes both returned exactly `CoreReadQuery` from `./query`.
  `./package.json` resolved, and both bin targets imported from their unchanged manifest paths.
- Runtime imports of `context-compiler-mcp/raw-store`, `context-compiler-mcp/dist/raw-store.js` and
  `context-compiler-mcp/src/raw-store.js` failed with `ERR_PACKAGE_PATH_NOT_EXPORTED`.
- An extracted-package TypeScript NodeNext probe compiled package root, `./query` and `./package.json` public
  runtime/type imports. A separate internal-subpath type probe failed as required with TS2307.
- Changed-source import scans found no Host, UI, Adapter, orchestration, provider or network dependency.

## S6 artifact evidence

- `git diff --check`: passed before source commit and before this handoff.
- Exact changed-path audit against the Planning Gate: the source commit contains only the twelve paths listed
  above; this direct child is docs-only.
- First `npm pack --dry-run --json` attempt completed prepack/build but could not write npm logs under the managed
  home. Retried with disposable cache `/private/tmp/ph1-core-pack.QMgCtb/npm-cache`; it passed.
- `npm pack --dry-run --json --cache /private/tmp/ph1-core-pack.QMgCtb/npm-cache`:
  89 files, packed size 282867 bytes, unpacked size 1646730 bytes, npm shasum
  `16a512033f126a7092f99e7a9b59d712b6be6e41`.
- `npm pack --json --cache /private/tmp/ph1-core-pack.QMgCtb/npm-cache
  --pack-destination /private/tmp/ph1-core-pack.QMgCtb`: passed with the same manifest, sizes, shasum and
  integrity `sha512-o3CNuSowkwpNu9BM4TJ397FpIKzMwSbfCfZME7xCgFiWFL3XF7iyQMrxJ2Vh+Tr+M4gJ5JifYNU0vu9Si8soxg==`.
- Actual disposable artifact:
  `/private/tmp/ph1-core-pack.QMgCtb/context-compiler-mcp-0.1.0.tgz`.
- Actual tarball SHA-256:
  `137a3a99281322ba4cae919a939de86147cc8cd9fa62e960647c1922d2ef59f2`.
- The extracted package manifest preserved name/version/private/type/main/types, both bins, `files`, Node engine,
  runtime/dev dependencies and the three-entry export map. Tar contents were exactly 89 entries. No generated
  build or package artifact is tracked by Git.

## Claim ceiling and next route

This is a fresh-disposable package candidate only. It does not prove or authorize publication, installation,
deployment, ACTIVE/live connectivity, Host/Adapter composition, real/private data migration, production database
upgrade, model/provider/network behavior, roster completion, canonical `ContextSnapshot` replacement, semantic
quality gain or product-wide evaluation results.

The Builder does not approve this result and has not written QA. The next permitted action is fresh Independent
Core Module QA on the exact source and handoff commits under the work order's QA-only path.

## QA-return bounded fix

This section is append-only evidence for the Independent Module-QA RETURN at
`d5cca9305472d6acfe881ca9b16353075d3d986b`. It does not replace the historical initial candidate or its artifact
record above.

### Exact fixed lineage and path boundary

- Independent Module-QA RETURN and exact fix parent:
  `d5cca9305472d6acfe881ca9b16353075d3d986b`.
- QA RETURN sole parent and historical handoff:
  `78e92478e54f27d9b4099c63154bd0d8f4bfd810`.
- Historical source candidate remains:
  `4990d45cc0531bfd9db64bb1218e7cdb81a430eb`.
- Bounded QA-return source fix:
  `0d23939096dde24ea4b87f5adb982d72107571de`.
- The fix source commit has exactly one parent, the QA RETURN, and changes exactly
  `src/raw-store.ts`, `src/query.ts`, `test/core-boundary.test.ts`, and `test/query.test.ts`.
- This docs-only fix handoff is the direct child of the fixed source commit. The controller must freeze its exact
  commit before fresh Independent Module re-QA.

No rejected commit was amended, rebased or rewritten. No accepted evidence branch was merged or copied. The
complete Planning Gate -> initial source -> initial handoff -> QA RETURN -> fix source chain remains append-only.

### Minimal failure-family closure

- `RawHistoryStore` again has the exact baseline required member set: `ingest`, `getEvent`,
  `getSessionEvents`, and `close`. The concrete `SqliteRawHistoryStore` retains additive `listSessions` and
  `getSession` methods for `CoreReadQuery`, but those query methods are no longer required of the already-exported
  package-root interface.
- A baseline-valid consumer implementing only the baseline interface is now a checked test fixture. A standalone
  strict NodeNext TypeScript compile passes against the fixed candidate, and the same fixture compiles against the
  extracted package declarations.
- `CoreReadQuery` constructs its three existing read owners behind one sanitized constructor boundary, closes any
  partially opened owner on construction failure, and maps all public read failures to stable query-local errors.
  Invalid pagination/input, unavailable/corrupt storage, and closed-object errors contain no database path, SQL,
  underlying store/schema object identity, cause or implementation trace. The redacted stack contains only the
  stable query-local error name and message.
- Session-list/session-summary outputs are copied through bounded validation before publication. Existing valid
  `listSessions`, `getSession`, Context-State `getState`, exact recall and keyword recall behavior is unchanged.
  Missing `getSession` still returns `undefined`; `getState` is not relabeled canonical authority or
  `ContextSnapshot`.
- No error class or other runtime symbol was exported. `context-compiler-mcp/query` still has exactly one runtime
  export, `CoreReadQuery`; no Core-wide common result/error envelope or query runtime expansion was introduced.

### Fixed-candidate verification

All databases, consumer fixtures, extracted packages and artifacts were synthetic and disposable.

- Standalone strict TypeScript compilation of the baseline consumer fixture against candidate types: passed.
- Targeted final query/Core boundary run: **2 files passed, 13/13 tests passed**.
- Four writable focused files: **4 files passed, 52/52 tests passed**.
- Six routed read-only compatibility files: **6 files, 114/114 tests passed**: MCP protocol 17, evaluation 32,
  MCP service 7, recall 39, revision substrate 9, and Ledger/Hot Raw 10.
- `npm test` final clean run: **39 files passed / 1 skipped; 610 passed / 1 skipped (611 total)**.
- `npm run build`: passed, including final standalone build and both prepack builds.
- Exact-nine names/order remained `health`, `ingest_event`, `compile_context`, `get_state`,
  `prepare_state_update`, `apply_state_delta`, `create_headline`, `recall_exact`, `recall_keyword`.
- Source-tree and extracted-package runtime probes each reported 117 root runtime exports and exactly
  `CoreReadQuery` from `./query`. The fix does not change `package.json`, `src/index.ts` or `src/core.ts`, so the
  frozen root additive symbol set remains identical to the initial source candidate.
- Extracted-package public type compilation passed for package root, `./query` and the baseline consumer fixture.
  The private `context-compiler-mcp/raw-store` type import failed as required with TS2307. Runtime imports of that
  subpath plus `dist/raw-store.js` and `src/raw-store.js` each failed with `ERR_PACKAGE_PATH_NOT_EXPORTED`.
- An extracted-package runtime probe independently reproduced sanitized constructor-unavailable,
  opened-then-schema-tamper and closed-object failures.
- Extracted `package.json` was byte-identical to source. Package name/version/private/type/main/types, both bins,
  files, engine, dependencies and exact three-entry export map remained unchanged.
- `package-lock.json` remained byte-identical at SHA-256
  `519fdcf4b874886466032343c25c5e5973679ef5e0ffc3dec5bf32cba3447d88`.
- Read-only identities remained unchanged:
  `src/mcp-server.ts` SHA-256 `2d57c47307176d77c27c0acee6cb353e9fd5ad6489f293a0012bf0794751b61b`;
  `src/evaluation.ts` SHA-256 `1c8585fb3c20f2fac423afd6c28b2065dd23b5917df3aa41181c5efe5f56e2d9`;
  `test/mcp-protocol.test.ts` SHA-256
  `8895bda776af6588e3dc927feb24f84e907e68688f0b79c16674be0e6764a03b`; and
  `test/evaluation.test.ts` SHA-256
  `a39f3f6b82bcd01800cfbfb0905ca1120c3ccadd7d4d2f74855c97bab0fcdfb8`.
- Changed-source import inspection found only Node built-ins and existing relative Core modules. No Host, UI,
  Adapter, orchestration, provider, network, model, credential, deploy or ACTIVE/live dependency/capability was
  added. Provision registry/schema, MCP, evaluation and package/lock paths have no fix diff.

### Fixed artifact

- Dry and actual pack each produced **89 entries**, packed size **284148 bytes**, unpacked size **1653705 bytes**,
  npm shasum `58ba0485fe0476a917d7efd383998104bedfb594` and integrity
  `sha512-kryGmzPIz3aWbHMsl77NvMZx+wH4sw5193yIP9zOBLPRVR0VjPFL3tmwhUJmtnnDU2iLHCSPq9fgf6tE0GBWoQ==`.
- Actual disposable artifact:
  `/private/tmp/ph1-core-rel-01-fix-pack.gwIDOX/context-compiler-mcp-0.1.0.tgz`.
- Actual tarball SHA-256:
  `e8b76024c138ecd278a690f58c448579e79e7514f4006d4e528906c71e0b6f38`.
- No build, dependency copy, npm cache, fixture or tarball is tracked by Git.

### Environment and retry record

- Runtime: Node.js `v25.6.1`, npm `11.9.0`; exact Node.js 24 was not separately run.
- The first build attempt stopped before assertions because this QA worktree had no local dependency entry and
  `tsc` was unavailable. The permitted existing dependency tree at
  `/path/to/context-compiler-mcp/node_modules` was first linked for targeted work, then
  materialized as a real offline directory for the immutable package-runtime fixture. No install or network
  occurred.
- An early in-worker TypeScript consumer probe first lacked its temporary Node type root. After that was supplied,
  targeted passed; the final fixture was then made an ordinary typed baseline consumer and compiled in a separate
  strict `tsc` command so it did not add a compiler child process to Vitest's concurrent worker pool.
- The first writable focused run was 51/52 because the existing provisioner worker test encountered its recorded
  teardown `database is locked`; the unchanged suite immediately reran 52/52.
- The first six-file compatibility run was 113/114 because the package-runtime fixture copied the worktree
  dependency symlink as a symlink, pruned it, then attempted an offline cache read. After the same dependency tree
  was materialized, MCP protocol passed 17/17; the other five files had already passed 97/97.
- Three full-suite attempts with the extra in-worker TypeScript compiler process each passed 609 tests and hit only
  the known ContextSnapshot worker-teardown lock. The routed ContextSnapshot file passed 24/24 alone. After moving
  the mechanical consumer compile outside the Vitest worker, the clean full command passed 610/610 with one
  pre-existing skip.
- The first extracted-package root runtime probe stopped before export assertions because production dependencies
  are correctly not bundled in the tarball. Linking the same offline dependency tree only inside the disposable
  extracted directory allowed the runtime/deep-import probes to pass; neither artifact bytes nor Git changed.

## Fresh re-QA route after fix

The bounded Builder fix is complete. It is not an ACCEPT verdict, Requirement/Architecture/Interface approval or
Submission-QA. Fresh Independent Core Module re-QA must fix the exact source and docs-only handoff commits,
independently reproduce the public compatibility/sanitization attacks, rebuild the artifact/digest and decide
ACCEPT or RETURN. This handoff does not authorize publish, install, deployment, Host/Adapter integration,
production migration, provider/model/network behavior, real/private data, credentials or ACTIVE/live operation.
