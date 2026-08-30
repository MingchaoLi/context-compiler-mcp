# PH1-CORE-REL-01 Independent Core Module QA

Status: `ACCEPT / FRESH MODULE re-QA PASSED / NOT SUBMISSION-QA`

## Fixed authority

- Handoff under review:
  `78e92478e54f27d9b4099c63154bd0d8f4bfd810`.
- Exact source candidate and sole handoff parent:
  `4990d45cc0531bfd9db64bb1218e7cdb81a430eb`.
- Exact Planning Gate and sole source parent:
  `a08723fbe9a9855f4e7710d55b596ad3cf3e03ef`.
- Planning content baseline and sole Gate parent:
  `f07257044e458d2edaad7821a95e3f9b9d18d63b`.

The handoff changes only `docs/handoffs/PH1-CORE-REL-01.md`; the source changes exactly the twelve frozen
package/source/test paths; and the Gate changes only the three planning documents. All ten reference-only
reconciliation, source and QA objects named by the work order resolve and remain non-ancestors of the handoff.
The three reviewed commits are single-parent commits. No merge, branch-union or accepted-evidence ancestry claim
was found.

QA ran from a new clean detached worktree fixed at the exact handoff. The independent attack matrix was frozen
before test execution. Dependencies were copied as a real offline directory from the permitted existing local
tree before testing; no symlink, install, network, model, provider or live data was used.

## Verdict and minimal failure family

`RETURN` for one public-boundary compatibility and sanitization failure family:

1. The candidate changes the already exported package-root `RawHistoryStore` interface by adding required
   `listSessions` and `getSession` members. An independent consumer fixture implementing the exact baseline
   interface compiled against baseline declarations, but the same fixture failed against candidate declarations.
   This is a breaking shape change to an existing root contract, not one of the frozen additive root symbols.
2. `CoreReadQuery` forwards a storage-layer failure unchanged. An independent disposable corruption attack made
   a public query method return a diagnostic that identifies an internal storage object instead of a sanitized
   surface-local failure. The private diagnostic value is intentionally omitted from this report.

Together these show that the reconciled query boundary is neither additive-only at the existing root type surface
nor fail-closed at its public error surface. No implementation was changed by QA. A bounded Builder fix must
preserve the baseline `RawHistoryStore` shape and sanitize query failures without inventing a common Core-wide
error envelope or changing the accepted missing-session `undefined` behavior.

## Independent verification summary

The following gates passed and do not override the RETURN:

- Focused writable suites: 4 files, 48/48 tests passed.
- Read-only protocol/evaluation/Raw/Core compatibility suites: 6 files, 114/114 tests passed, including MCP
  protocol 17/17.
- Independent implementation-aware attacks: 7 total; 6 passed and the sanitization attack above failed as
  expected. Passing attacks covered explicit-time exact receipts, timestamp equivalence, closed result shapes,
  Raw/EVENT divergence, zero-payload/zero-axis provision, Raw index tamper, registry-trigger tamper, missing
  session `undefined` and Context-State-only query shape.
- Clean official full suite after removing the temporary QA fixture: 39 files passed / 1 skipped; 606 passed /
  1 skipped (607 total).
- `npm run build`: passed. Prepack builds for dry and actual pack also passed.
- Exact-nine MCP names/order and published schemas remained unchanged. MCP, evaluation, lockfile and the routed
  read-only test identities matched the handoff evidence.
- Exact baseline root export names were preserved: runtime 105 -> 117 with exactly the frozen 12 runtime names;
  named runtime/type exports 301 -> 328 with exactly the frozen 27 names and no Query/internal seam name leaked
  from root. This name-level pass does not cure the interface-shape failure above.
- Candidate Core initialization produced the same ordered `sqlite_master` projection as the baseline in the
  independent comparison. Provisioner attacks confirmed empty native Raw storage, five zero axes, immutable
  payload-free receipt, live dependency validation and authorized later-write compatibility.
- Extracted-package runtime probe exposed exactly `CoreReadQuery` from `./query`; `./package.json` and both bin
  targets resolved; three private internal subpaths failed with `ERR_PACKAGE_PATH_NOT_EXPORTED`. Public root/query
  TypeScript imports compiled, and the private type subpath failed with TS2307.
- Package name/version/private/type/main/types, both bins, files, engines, runtime/dev dependencies and lock bytes
  stayed frozen. `package-lock.json` SHA-256 remained
  `519fdcf4b874886466032343c25c5e5973679ef5e0ffc3dec5bf32cba3447d88`.
- Changed imports and package metadata added no Host, UI, Adapter, orchestration, provider, network, model,
  credential, deployment or ACTIVE/live dependency or capability.

## Artifact reconstruction

Independent dry pack and actual pack both produced 89 entries, packed size 282867 bytes, unpacked size 1646730
bytes, npm shasum `16a512033f126a7092f99e7a9b59d712b6be6e41` and integrity
`sha512-o3CNuSowkwpNu9BM4TJ397FpIKzMwSbfCfZME7xCgFiWFL3XF7iyQMrxJ2Vh+Tr+M4gJ5JifYNU0vu9Si8soxg==`.
The independently rebuilt tarball SHA-256 is exactly:

`137a3a99281322ba4cae919a939de86147cc8cd9fa62e960647c1922d2ef59f2`

The artifact digest match is packaging evidence only; it cannot override a public-contract acceptance failure.

## Environment and retry record

- Runtime: Node.js `v25.6.1`, npm `11.9.0`; Node.js 24 was not separately run.
- The first full-suite command was intentionally not counted as the official regression because repository test
  discovery also collected the temporary independent attack fixture. That run reproduced the public failure and
  also encountered the previously observed Snapshot concurrency teardown lock. After the temporary fixture was
  removed, the clean official full suite passed 606/606 with one pre-existing skipped test; the lock did not recur.
- No dependency installation, network retry or artifact write to Git occurred.

## Scope ceiling

This is only a Core Module-QA RETURN on the fixed package candidate. It is not Requirement, Architecture,
Interface or Submission-QA approval; it does not authorize publication, installation, deployment, Host/Adapter
integration, production migration, model/provider/network behavior, real/private data, credentials or ACTIVE/live
operation.

## Fresh independent Module re-QA after append-only fix

The preceding RETURN is retained as the complete historical first-QA disposition. A different fresh Independent
Core Module re-QA reviewed the append-only fixed candidate and records the following later verdict.

### Fixed authority and verdict

- Exact fixed Builder handoff: `0432fcf7e885ceefa56978e57c78f97d752af289`.
- Sole handoff parent and fixed source: `0d23939096dde24ea4b87f5adb982d72107571de`.
- Sole fix parent and historical QA RETURN: `d5cca9305472d6acfe881ca9b16353075d3d986b`.
- Preserved earlier chain: `78e92478e54f27d9b4099c63154bd0d8f4bfd810` ->
  `4990d45cc0531bfd9db64bb1218e7cdb81a430eb` ->
  `a08723fbe9a9855f4e7710d55b596ad3cf3e03ef` ->
  `f07257044e458d2edaad7821a95e3f9b9d18d63b`.

Verdict: **ACCEPT** for the exact Core Module package candidate. Both members of the public failure family that
caused the historical RETURN are independently reproduced as closed, and the complete frozen Module-QA Gate
passes. No new public failure family was found.

The Gate changes exactly the three planning paths; initial source changes exactly the twelve work-order paths;
the first handoff changes only its handoff; the historical RETURN changes only this QA path; the bounded fix
changes exactly `src/raw-store.ts`, `src/query.ts`, `test/core-boundary.test.ts`, and `test/query.test.ts`; and the
fixed handoff changes only its handoff. Every commit in the reviewed chain is single-parent. All ten
reference-only reconciliation/source/QA objects resolve as commits, remain non-ancestors of the fixed handoff,
and retain the merge bases frozen in the work order. No merge or branch-union claim was found.

### Independent closure of the historical RETURN

1. An ordinary consumer implementing only baseline `RawHistoryStore.ingest`, `getEvent`, `getSessionEvents`, and
   `close` compiled under strict TypeScript NodeNext against declarations built from exact baseline `f072570...`,
   exact fixed candidate `0432fcf...`, and the extracted package. `listSessions` and `getSession` remain additive
   concrete-store methods and are not required root-interface members.
2. A fresh nine-test implementation-aware query attack suite passed 9/9. It covered invalid/corrupt constructor
   storage, forty repeated Raw-open/State-fail partial constructions with no database-descriptor growth, hostile
   accessors/Proxies/thrown caller diagnostics, invalid input at every public method, session-summary timestamp
   tamper, Context-State table tamper, exact-recall Raw tamper, keyword-recall index tamper, and all reads after
   close. Every failure remained the stable `CoreReadQueryError` surface-local name/message with a one-line
   redacted stack and no cause, path, SQL, SQLite code, Store/schema identity, trace/frame or hostile diagnostic.
   Legal session pagination/summary, missing-session `undefined`, existing Context-State output and recall output
   retained their accepted shapes and values.
3. The extracted artifact independently passed 44 runtime parity/privacy checks, including the same valid and
   hostile query behavior, twenty additional partial-constructor failures without descriptor growth, both bins,
   package metadata and all forbidden runtime deep imports. A separate extracted-package strict public type probe
   compiled root, `./query`, `./package.json` and the baseline consumer; the private
   `context-compiler-mcp/raw-store` type probe failed as required with TS2307.

### Full Gate results

- Independent query attacks: **9/9 passed**.
- Independent extracted runtime/parity/privacy checks: **44/44 passed**.
- Independent exact-receipt/provisioner key attacks: **17/17 passed**. These covered all five exact-receipt
  statuses, hostile proof input, closed DTOs, registry create/replay/collision, zero Raw payload, five zero axes and
  live dependency-trigger tamper.
- Writable focused suites: **4 files, 52/52 passed**.
- Routed read-only protocol/evaluation/Raw/Core compatibility suites: **6 files, 114/114 passed**, including MCP
  protocol **17/17**.
- Clean official full suite after removing the temporary attack file: **39 files passed / 1 skipped; 610 passed /
  1 skipped (611 total)**.
- `npm run build`: passed before attacks, after the full suite, and during both prepack runs.
- Existing MCP remained exactly nine tools in the frozen order with the published schemas unchanged. The package
  root retained all 105 baseline runtime names and added exactly the frozen 12 (117 total); named runtime/type
  exports retained all 301 baseline names and added exactly the frozen 27 (328 total). `./query` had exactly one
  runtime export, `CoreReadQuery`, with no Query or private storage seam at root.
- The full ordered `sqlite_master` projection, including internal autoindexes, was byte-equivalent for fresh
  baseline and candidate Core initialization: **120/120 rows**. The provisioner-only additive registry remained
  confined to its selected owner and was not created by ordinary Core initialization.
- Source-tree and extracted-package root, `./query`, `./package.json` and both binary targets resolved. Runtime
  imports of `raw-store`, `dist/raw-store.js` and `src/raw-store.js` failed with
  `ERR_PACKAGE_PATH_NOT_EXPORTED`; the corresponding private type import failed with TS2307.
- Package non-export metadata stayed byte-equivalent to baseline. `package-lock.json` remained byte-identical at
  SHA-256 `519fdcf4b874886466032343c25c5e5973679ef5e0ffc3dec5bf32cba3447d88`.
  MCP server, evaluation source and routed protocol/evaluation test hashes matched the fixed handoff. Existing
  SQLite initialization, Experience Ledger, evaluation, README and TypeScript configuration paths had no diff.
- Changed imports were only Node built-ins and existing relative Core modules. No Host, UI, Adapter,
  orchestration, provider, model, network, credential, deploy, ACTIVE/live or private-data dependency/capability
  was introduced.

### Independently rebuilt artifact

Dry and actual pack each produced exactly **89 entries**, packed size **284148 bytes**, unpacked size **1653705
bytes**, npm shasum `58ba0485fe0476a917d7efd383998104bedfb594` and integrity
`sha512-kryGmzPIz3aWbHMsl77NvMZx+wH4sw5193yIP9zOBLPRVR0VjPFL3tmwhUJmtnnDU2iLHCSPq9fgf6tE0GBWoQ==`.
An independent filesystem hash of the newly packed artifact is exactly:

`e8b76024c138ecd278a690f58c448579e79e7514f4006d4e528906c71e0b6f38`

This matches the fixed Builder handoff exactly. The tarball and all build/test material remain disposable and are
not tracked by Git.

### Environment, retries and claim ceiling

- Runtime: Node.js `v25.6.1`, npm `11.9.0`; exact Node.js 24 was not separately run.
- Dependencies were materialized as a real offline directory from the permitted existing local tree. No symlink,
  install, network, model, provider, credential, live storage or private data was used.
- One schema-inspection command initially used a double-quoted SQLite string literal and was rerun with a bound
  parameter. The independent query fixture first made two incorrect assumptions about existing recall DTO nesting;
  both runs passed 8/9, the fixture assertions were corrected, and the unchanged candidate then passed 9/9. The
  independent receipt/provisioner script initially compared a null-prototype SQLite result row to a plain object;
  the fixture assertion was corrected and the unchanged candidate passed 17/17. These were QA-fixture/command
  corrections, not product retries or candidate failures. Focused, compatibility, full, build, dry-pack and
  actual-pack product commands passed on their counted runs.

This ACCEPT is an exact Core Module-QA milestone only. It is not Requirement, Architecture, Interface or formal
Submission-QA approval; it does not publish, install, deploy, migrate production data, activate a Host/Adapter,
authorize real/private data, provider/model/network behavior, credentials or ACTIVE/live operation, and it does
not convert the legacy `CompiledContext` path into canonical `ContextSnapshot`. Governance Submission QA must
consume this exact candidate and digest separately.
