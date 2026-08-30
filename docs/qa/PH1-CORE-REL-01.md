# PH1-CORE-REL-01 Independent Core Module QA

Status: `RETURN / MODULE-QA FAILED / NOT SUBMISSION-QA`

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
