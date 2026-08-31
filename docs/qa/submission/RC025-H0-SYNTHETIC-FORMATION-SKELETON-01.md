# RC025 H0 Synthetic Formation Skeleton — Fresh Independent Submission QA

Verdict: **ACCEPT / SUBMISSION_QA_PASS**

Claim ceiling: `SYNTHETIC_OFFLINE_FORMATION_SKELETON_ONLY`

## Exact frozen subject

- Submission-QA task:
  `RC025-H0-SYNTHETIC-FORMATION-SKELETON-FRESH-SUBMISSION-QA-01`
- Submission-QA capsule SHA-256:
  `7c47ab0685ceb3eda3aaeed5c2b2b83d7f1bf67d95a37882381259df9ea2eda4`
- Main and `integration/v1` expected old value:
  `9046ecaf4790dbe8bd985e2ee86c426096c60cf0`
- Approved plan `P`: `62ea8438f9e9e26903a38447d9aadf0d4d588cf6`
  - sole parent: `9046ecaf4790dbe8bd985e2ee86c426096c60cf0`
  - tree: `2b5d635b4eb9c8ac624dd176feb7e0819a502252`
- Builder source `S`: `3c7f3d4c1128fec1d0c9f5c9633dd10bd3c9326d`
  - sole parent: `P`
  - tree: `90f92a4306f25b193f1d73edfae711975dc07743`
- Builder handoff `H`: `db39466268e0d2b6c2f4a8f4be38551e87e6ff32`
  - sole parent: `S`
  - tree: `35a786b1424c0a640137b37b6ad6e3ad81ccc73b`
- Module-QA commit `Q`: `89c2937de942b202dfe815b7868f183b4138abc4`
  - sole parent: `H`
  - tree: `afb508bcbb617362a71bc2b4390c72eada2fb843`
  - report path: `docs/qa/RC025-H0-SYNTHETIC-FORMATION-SKELETON-01.md`
  - report blob: `57ecc36e2e54c256fc04eee6518de03e19f5c004`
  - report SHA-256: `6ceb8a5dad82872d5a623d08553c2f48c61c718fcebc968c1ab05294b7924beb`
- Module-QA capsule SHA-256:
  `16742629710a38c8b33b9fc87377a323405c39eb71297407f788f23c835723b3`
- Module-QA issuer return receipt SHA-256:
  `0fbab5ed738554045aadf08b94732fb858c80840e7d2e51d6d030bd90844a37e`
- Materialized Module-QA governance event SHA-256:
  `59501f2fcfe3f69bd1543fd70b0c1dcd651d4108f953fa511c03b9d317913dbb`

The Submission-QA capsule bytes match the active delivery-slot receipt. The Module-QA capsule and exact issuer
receipt match their frozen digests. The Module-QA event, `Q` commit, report blob and report bytes consistently record
a genuine fresh `13 PASS / 0 FAIL / 0 UNKNOWN` Module-QA acceptance with `builder_verdict_transfer=false`. That prior
verdict was authenticated only as an input condition; this Submission-QA verdict was recomputed independently.

## Exact lineage and path boundaries

The complete main-to-`Q` history is the four-commit sole-parent chain `main -> P -> S -> H -> Q`. Main is an ancestor,
the left/right count is exactly `0 / 4`, and the merge-commit count is zero. The frozen edges remain:

- `P`: exactly the approved two plan paths
  `docs/modules/evaluation-fixtures/implementation.md` and
  `docs/handoffs/RC025-H0-SYNTHETIC-FORMATION-SKELETON-PLAN-01.md`;
- `S`: exactly eight files under `evaluation/rc025-h0-synthetic-formation-v1/` plus
  `test/rc025-h0-synthetic-formation-skeleton.test.ts`;
- `H`: exactly `docs/handoffs/RC025-H0-SYNTHETIC-FORMATION-SKELETON-BUILDER-01.md`; and
- `Q`: exactly `docs/qa/RC025-H0-SYNTHETIC-FORMATION-SKELETON-01.md`.

All thirteen frozen plan/source/handoff/Module-QA blobs resolve exactly. The nine source/test objects are ordinary
`100644` files. Main-to-`Q` and per-edge `git diff --check` pass. `S` changes no `src/**`, package, lockfile, config,
schema, public export, product store/API, Requirement, work order, `PROJECT_STATE`, or `ROADMAP` path.

## Mandatory Submission-QA results

All mandatory checks passed: **12 PASS / 0 FAIL / 0 UNKNOWN**.

1. **Capsule, refs, trees, blobs and receipts — PASS.** The submission capsule, delivery receipt, `P/S/H/Q` commit
   graph, all frozen trees and blobs, Module-QA capsule, report and issuer receipt reproduce their exact identities.
2. **Linear history and bounded deltas — PASS.** Main-to-`Q` is linear with zero merges and retains exactly the
   two-path approved plan, nine-path source, one-path handoff and one-path Module-QA report boundaries.
3. **Genuine Module QA and fresh independence — PASS.** The earlier result is an authenticated fresh `13/13`
   Module-QA acceptance. No Builder or Module-QA conclusion was transferred into this verdict; every executable and
   static Submission-QA check below was rerun independently.
4. **Claim ceiling — PASS.** The candidate remains an Evaluation-owned disposable skeleton using fake Core and
   Adapter ports plus an injected deterministic interpreter. It makes no product Formation, provider/model/Host,
   seven-port replacement, deployment, broader `COMPLETE`, or `ACTIVE` claim.
5. **Executable H0 contract evidence — PASS.** Public source and tests bind all seven H0 limit fields, the tokenizer,
   closed action/coverage/Experience domains, the eight lifecycle ports, exact identity passage, all 18 scenarios,
   all 24 fault cells, crash-after-claim, exact replay, one-call behavior, whole-change atomicity, scope/privacy-first
   filtering, opaque Evidence and deterministic receipt/card/state hashes.
6. **Fresh focused matrix — PASS.** The exact focused file passed `58 / 58`, including `18 / 18` scenarios and
   `24 / 24` lifecycle fault cells.
7. **Fresh full repository matrix — PASS.** The authoritative physical-dependency execution passed
   `676 / 676` runnable tests; one existing official-artifact generator was intentionally skipped because
   `CONTEXT_COMPILER_DS13_OFFICIAL_OUTPUT` was unset. There were no authoritative failures.
8. **Fresh build and strict fixture types — PASS.** Exact `npm run build` passed. A separate `--noEmit --strict`
   NodeNext check over all seven fixture-local TypeScript sources passed.
9. **Offline, privacy and disposable-state boundary — PASS.** Closed-world source scans found no product import,
   network/process/provider/model call, environment access, private-history or credential path, absolute user path,
   `rc_memory`, or durable product-state dependency. Runs used literal sanitized synthetic values, fresh in-process
   state and an already-installed local dependency tree; no install or download occurred.
10. **Later direct-main eligibility only — PASS.** The frozen mechanical projection is `main=integration/v1`
    `9046ecaf...`, `main...Q=0/4`, zero merges. An accepted Submission-QA report can only be offered later to the
    Evaluation Module Owner for an exact expected-old and fast-forward CAS decision. Submission QA moved no ref and
    does not decide integration.
11. **Cleanup and sole report change — PASS.** Generated `dist`, TypeScript cache and temporary dependency copies
    were removed. Before report creation the exact detached `Q` worktree was clean; the only Submission-QA delta is
    this allowed report path.
12. **All-mandatory verdict rule — PASS.** No frozen identity, claim boundary or executable check failed, so the only
    valid verdict is `ACCEPT`.

## Explicit accounting for preliminary execution failures and skips

Two non-authoritative setup attempts were discarded rather than treated as candidate evidence:

- the first full run had no worktree-local dependency tree or built `dist`, producing `23` failed test files,
  `9` failed tests, `443` passes and `19` skips through `ERR_MODULE_NOT_FOUND`/missing-tool errors; and
- a second run used a top-level dependency symlink and reached `675` passes, `1` failure and `1` skip; the sole
  failure was the offline package-prune test treating the copied symlink as a non-directory and lacking a cache entry.

Both were execution-environment failures, not source failures. The final authoritative run used a physical copy of
the same already-installed dependency tree and passed `676` tests with zero failures. Its sole skip was
`evaluation/starlette-v1/results/feasibility-01/generate-official-results.test.ts`, whose checked-in `skipIf` requires
an explicit one-time official output path; this Submission QA did not authorize generating that artifact.

## Disposition

The exact `P -> S -> H -> Q` subject is **ACCEPTED by Fresh Independent Submission QA** within
`SYNTHETIC_OFFLINE_FORMATION_SKELETON_ONLY` and remains `ACCEPTED_NOT_INTEGRATED`.

This report does not move `main` or `integration/v1`, integrate or deploy the candidate, claim product Formation,
reduce the seven required product-port fake count, or claim broader `COMPLETE`/`ACTIVE`. The report commit, sole
parent, tree, path blob and file SHA-256 are returned externally because this file cannot self-embed those identities.
