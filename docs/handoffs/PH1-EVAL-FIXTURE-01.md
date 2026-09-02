# PH1-EVAL-FIXTURE-01 Builder handoff

Status: `READY FOR FRESH EVALUATION MODULE QA / BUILDER DOES NOT APPROVE`

## Exact lineage

- Planning Gate / source parent: `8cf8ca7c24d34fe3c6b591dc721937992ea67c76`.
- Bounded source candidate: `1fe5da5da858cff5c1ed31d6b9163dce1dc67892`.
- The handoff commit is the direct child of that source candidate and changes only this handoff plus the append-only
  implementation receipt in `docs/work-orders/PH1-EVAL-FIXTURE-01.md`. Its exact SHA is reported after commit because
  a commit cannot contain its own identity.
- Materialized Builder capsule: `PH1-EVAL-FIXTURE-01-BUILDER`, version `1.0.0`.

## Delivered source paths

The source candidate changes exactly:

```text
evaluation/phase-one-synthetic-v1/corpus.json
evaluation/phase-one-synthetic-v1/oracle.json
evaluation/phase-one-synthetic-v1/renderer.json
evaluation/phase-one-synthetic-v1/run-manifest-fixtures.json
evaluation/phase-one-synthetic-v1/freeze.json
evaluation/phase-one-synthetic-v1/run-offline.mjs
test/phase-one-evaluation-fixture.test.ts
```

No `src/**`, existing evaluation artifact, package/lock/config/schema, database, build output, QA report, result
artifact, or governance file changed.

## Frozen population and controls

- Corpus id: `rc-phase-one-synthetic-v1`; selection: `ALL_CASES`.
- Cases: exactly the six WO-fixed ASCII-ordered ids, with one exact primary-category count each.
- Opaque ids: 11 sequential `FX-Fdddd`, 11 sequential `FX-Sdddd`, and 3 sequential `FX-Qdddd`.
- Corpus/oracle: ordinary, separate public files; the corpus has no evaluator-control role fields. All prose is newly
  hand-authored synthetic content. C05's one filler record uses only deterministic local ASCII repetition and yields
  exactly 39,332 reference-history UTF-8 bytes.
- Arms: exactly `D0_FULL_AUTHORIZED_FIXTURE`, `D1_HOST_NATIVE_BOUNDED`, and
  `D2_RIPPLECONTEXT_COMPILED`; positive conformance matrix: 18 cells. It is
  `REFERENCE_FIXTURE_NOT_A_HOST`, not Host evidence.
- Invalid controls: all 14 WO-frozen codes reproduce one-for-one. Missing, unknown, unsupported, unobservable,
  invalid, and genuine zero-denominator states remain distinct; no result contains weights, scalar score/rank/winner,
  or overall `passed` authority.

## Exact digest receipts

| Artifact | File SHA-256 | Value SHA-256 |
| --- | --- | --- |
| corpus | `db8e13339f57434b06f83018886edd32e7227c70c80b9eaed23b63f647d46636` | `003f36c13653f27b7f036cd97100d37b16d3dd4b9eb81e52945c79d5235daaad` |
| oracle | `efd8f9864e7625293a8aae416a10b6e352b98958468a74e342e03fff88d2f7ce` | `0682e11d36800aaac049d900d696f2666448b738ac187c47c09b1693ae297a18` |
| renderer | `d0b861f404e473557847a7a7ea25457e8825c6a31d83cc2e1eecb7c2809f87f7` | `4d61bd32d95b525832862bc967019ac422cf0db56ace3bf78ca963f59faf2e1f` |
| manifest controls | `77bdaa3e8c565efad3f7ef12197f0aa39a3f5e633facb1e49f9ec5325fa6b866` | `c76810e5e6cce4f633924e462acca3dd9a634e19d0b0d9245536523efb91d529` |
| offline runner | `756a4bbc413622b1173e2e95ac1e3e23a8e39d84840dc887a2c36c8f82a9bb1f` | `NOT_APPLICABLE` |

- Fixture bundle SHA-256: `728bf406b9c4653d6a487938c23c1de5014c9b2c3357e42c9ebee5c19ef3743b`.
- Exact `freeze.json` file SHA-256:
  `808fbc1daf2466e78d3e5b641dcb4057b3cb394c0bf437c4edf1f36b0eea75a1`.
- Positive run id:
  `RUN-SHA256-5b061c46627e651da35d788decc11cfe5500dc2440451021db67f9367468f947`.
- Byte-identical external replay file SHA-256:
  `2e898fe21ec607727241993c5dd260ebe205edfcdf3daf9e280d746110772b39`.
- Normalized result value SHA-256:
  `30c2f54f61ba5071b0d9a1c465ca7eddb54657f09d090055f6e101b83032c893`.

## Builder checks

- Focused: `vitest run test/phase-one-evaluation-fixture.test.ts` — 6/6 passed.
- Runner: `validate`, internal two-fresh-directory replay, and two external invocation byte comparison — passed.
- Existing estimator identity: reconstructed for all six renderer packets through the public `estimateTokens` test;
  passed.
- Build: `npm run build` — passed.
- Final full suite: 38 test files passed / 1 skipped; 593 tests passed / 1 skipped.
- First full-suite run: 591 passed / 2 failed / 1 skipped. One failure was the previously recorded concurrent
  ContextSnapshot cleanup/lock race; the other came from the allowed local `node_modules` symlink becoming a
  non-directory in the package-only copy and forcing an unavailable offline-cache lookup. No product source changed.
  Targeted reruns passed 24/24 and 17/17; an ignored local real copy of the already-present dependencies replaced the
  symlink, and the complete second suite passed.
- `git diff --check`, exact source/docs path allowlists, ordinary-file checks, canonical JSON/final-LF validation,
  independent exact replay comparison, and public-control credential/URL/local-path scans — passed.

## Boundaries for QA

No model, provider, network, install, private/real conversation, QA-only/hidden evidence, measured Host run, billing
claim, scalar winner, package/API promotion, or Core authority/retrieval/ranking change occurred. Module QA must fix
the exact source candidate above, independently reconstruct all bytes/digests/matrix/missingness, and write its own
QA-only commit. Governance Submission QA remains a later controller-owned gate and is not implied by this handoff.

## Append-only RETURN fix handoff — 2026-08-30

Status: `READY FOR FRESH EVALUATION MODULE RE-QA / BUILDER DOES NOT APPROVE`

### Fixed lineage and bounded delta

- Returned family: `EVALUATOR_CONTROL_QUALIFICATION_MARKER_LEAKAGE_NOT_REJECTED`.
- Prior handoff / fixed source parent: `416a1173179724ac9ec799c57c8ecf7fdfa66635`.
- Prior source candidate: `1fe5da5da858cff5c1ed31d6b9163dce1dc67892`.
- Fixed source candidate: `767cd1bb0fc91c29da5945aaa79f23b0fcce8cec`, a direct child of the prior handoff.
- The fixed source commit changes exactly the runner, focused fixture test, and freeze receipt. Corpus, oracle,
  renderer, run-manifest controls, fairness/Requirement/Architecture/Interface contracts, product source, package,
  config, schema, other evaluation, and QA paths are unchanged.

### Closure evidence

- The runner now builds its leakage set from every marker registered in the validated oracle, then recursively scans
  every cutoff-visible corpus arm-input surface: `sources`, `current_input`, and `fallback_scenario`. Exact marker
  presence fails closed with `INVALID_ORACLE_EXPOSURE`.
- The regression independently coordinates corpus, renderer, manifest, run id, freeze entries, and bundle receipts.
  Its benign rewrite passes; all 3 registered markers × all 3 surfaces fail closed (9/9 attacks), including the
  originally missed `[[SOURCE_FX-S0006]]` and `[[AUTHORITY_OR_UNCERTAIN]]` markers.
- Unchanged file/value receipts: corpus
  `db8e13339f57434b06f83018886edd32e7227c70c80b9eaed23b63f647d46636` /
  `003f36c13653f27b7f036cd97100d37b16d3dd4b9eb81e52945c79d5235daaad`; oracle
  `efd8f9864e7625293a8aae416a10b6e352b98958468a74e342e03fff88d2f7ce` /
  `0682e11d36800aaac049d900d696f2666448b738ac187c47c09b1693ae297a18`; renderer
  `d0b861f404e473557847a7a7ea25457e8825c6a31d83cc2e1eecb7c2809f87f7` /
  `4d61bd32d95b525832862bc967019ac422cf0db56ace3bf78ca963f59faf2e1f`; manifest controls
  `77bdaa3e8c565efad3f7ef12197f0aa39a3f5e633facb1e49f9ec5325fa6b866` /
  `c76810e5e6cce4f633924e462acca3dd9a634e19d0b0d9245536523efb91d529`.
- New runner SHA-256: `da64091ede3a7f191fce8ffc938f2d4410259734f300787c7282596ffe99d8bf`.
  New bundle SHA-256: `ad8fbc95d74ab66019f6cb302eb142e99657ab2ba127e01cfe8d46fc2e6ab2f0`.
  New freeze file/value SHA-256:
  `f3e476b1774abd4ffb294d4898d05f60e5ba4f3e3b30ec1b4f31fbbe38e456d7` /
  `f0e99b7e4e744a335029b8fe8ed9d2f634ef744bc977fdf7c7bc53a391be675b`.
  Focused test file SHA-256: `b76ada5bc53a76516e4b4a103482a3f04118855055dfd6aa0b177753000be214`.
- Positive run id is unchanged at
  `RUN-SHA256-5b061c46627e651da35d788decc11cfe5500dc2440451021db67f9367468f947`.
  External replay receipt file SHA-256 is
  `d5b4293e5daaaec0c3fb4a97cb43e3401a482725d9cc72a60dbbdd70b9e76dbe`; normalized result file/value SHA-256 are
  `bd46477669f11f07bdc588b1cdbcea5f09da9a20d3b6b01f8c93781ab19e75ff` /
  `30c2f54f61ba5071b0d9a1c465ca7eddb54657f09d090055f6e101b83032c893`.

### Final checks and process classification

- Focused 7/7; validate 6 cases / 14 invalid controls; internal/external byte-identical replay; build passed; full
  suite 38 files passed / 1 skipped and 594 tests passed / 1 skipped; diff check, exact allowlist, ordinary-file,
  freeze-byte equality, and unchanged-control checks passed.
- The first `npx vitest` attempt encountered the worktree's missing local executable, attempted the npm registry, and
  failed DNS with `ENOTFOUND`. No download or install completed and no external content entered the artifacts. A
  subsequent pre-final PATH-only invocation exposed incomplete worktree dependencies and an intermediate expected-code
  mismatch. Final checks copied only the machine's already-existing dependency tree into ignored `node_modules` and
  ran offline. No unrelated product change was made to hide these events; fresh re-QA owns their independent
  classification.
- No model/provider call, successful network access, measured Host run, private/real history, deployment, `ACTIVE`,
  scalar winner, or fairness-contract change occurred. This handoff is not acceptance and does not authorize
  Submission QA or measured use.

## Append-only offline reconstruction handoff — 2026-08-30

Status: `READY FOR FRESH EVALUATION MODULE RE-QA / BUILDER DOES NOT APPROVE`

### Exact offline lineage and unchanged artifact tree

- Returned process family:
  `FORBIDDEN_IMPLEMENTATION_NETWORK_ATTEMPT_VIOLATES_FROZEN_NO_NETWORK_BOUNDARY`.
- Fixed source artifact candidate remains `767cd1bb0fc91c29da5945aaa79f23b0fcce8cec`; the preceding handoff HEAD was
  `1b8c7738bac6395eacef11b4336c504d73bf430a`.
- Fresh offline reconstruction marker: `3c5629059af48fe845f0bacfc4f67c6e62ae9648`, a direct child of `1b8c7738`.
  It is an allow-empty commit: marker and parent tree are exactly
  `42bad9669c895856809d7e2afa4fcf42a05e43f5`. The fixture subtree is
  `30b8dc401d962abf43a6c68c657f1041f99edbf2`, equal to fixed source `767cd1b`.
- The handoff commit is the direct child of that empty marker and changes only this handoff plus the append-only
  receipt in `docs/work-orders/PH1-EVAL-FIXTURE-01.md`. Its exact SHA is reported after commit because a commit cannot
  contain its own identity.

### Fresh independent offline evidence

- Complete qualification registry: `FX-Q0001` / `[[SOURCE_FX-S0006]]` / `SOURCE_PROVENANCE`, `FX-Q0002` /
  `[[AUTHORITY_OR_UNCERTAIN]]` / `AUTHORITY_OR_UNCERTAINTY`, and `FX-Q0003` /
  `[[ABSTAIN_OR_QUALIFY]]` / `ABSTAIN_OR_QUALIFY`.
- Corpus/oracle key and closed-shape checks passed. A benign coordinated rewrite passed. All 3 markers × cutoff-visible
  `sources`, `current_input`, and `fallback_scenario` were independently coordinated through renderer, manifest,
  current-input bindings, run id, freeze entries, and bundle receipt, then rejected 9/9 with
  `INVALID_ORACLE_EXPOSURE`.
- Focused fixture: 7/7. Runner validate: 6 cases / 14 invalid controls. Internal replay and two external invocations:
  byte-identical. The result contains 18 cells; genuine zero denominator stays `NOT_EVALUABLE`; `UNKNOWN`,
  `UNSUPPORTED`, `INPUT_UNOBSERVABLE`, and 14 `INVALID_RUN` controls remain separate; recursive no-scalar audit passed.
- Build passed. The first full offline suite reproduced the known ContextSnapshot concurrent cleanup/lock race at
  593 passed / 1 failed / 1 skipped; no source changed. Targeted rerun passed 24/24, and the complete second run passed
  38 files / 1 skipped and 594 tests / 1 skipped. `git diff --check`, lineage/allowlist, ordinary-file, unchanged-byte,
  freeze-byte, digest, and clean-status checks passed.

### Exact unchanged receipts

- Corpus file/value: `db8e13339f57434b06f83018886edd32e7227c70c80b9eaed23b63f647d46636` /
  `003f36c13653f27b7f036cd97100d37b16d3dd4b9eb81e52945c79d5235daaad`.
- Oracle file/value: `efd8f9864e7625293a8aae416a10b6e352b98958468a74e342e03fff88d2f7ce` /
  `0682e11d36800aaac049d900d696f2666448b738ac187c47c09b1693ae297a18`.
- Renderer file/value: `d0b861f404e473557847a7a7ea25457e8825c6a31d83cc2e1eecb7c2809f87f7` /
  `4d61bd32d95b525832862bc967019ac422cf0db56ace3bf78ca963f59faf2e1f`.
- Manifest controls file/value: `77bdaa3e8c565efad3f7ef12197f0aa39a3f5e633facb1e49f9ec5325fa6b866` /
  `c76810e5e6cce4f633924e462acca3dd9a634e19d0b0d9245536523efb91d529`.
- Runner: `da64091ede3a7f191fce8ffc938f2d4410259734f300787c7282596ffe99d8bf`; focused test:
  `b76ada5bc53a76516e4b4a103482a3f04118855055dfd6aa0b177753000be214`.
- Bundle: `ad8fbc95d74ab66019f6cb302eb142e99657ab2ba127e01cfe8d46fc2e6ab2f0`; freeze file/value:
  `f3e476b1774abd4ffb294d4898d05f60e5ba4f3e3b30ec1b4f31fbbe38e456d7` /
  `f0e99b7e4e744a335029b8fe8ed9d2f634ef744bc977fdf7c7bc53a391be675b`.
- Positive run id: `RUN-SHA256-5b061c46627e651da35d788decc11cfe5500dc2440451021db67f9367468f947`.
  External replay receipt file: `d5b4293e5daaaec0c3fb4a97cb43e3401a482725d9cc72a60dbbdd70b9e76dbe`;
  normalized result file/value: `bd46477669f11f07bdc588b1cdbcea5f09da9a20d3b6b01f8c93781ab19e75ff` /
  `30c2f54f61ba5071b0d9a1c465ca7eddb54657f09d090055f6e101b83032c893`.

### Process boundary and next owner

This fresh execution used only Node `v25.6.1`, npm `11.9.0`, repository bytes, system temporary directories, and the
already-present dependency tree at `/path/to/context-compiler-mcp/node_modules`. The
worktree used an ignored ordinary-directory copy whose Vitest and TypeScript entry/package bytes matched that local
source. Focused Vitest used the absolute local executable path; npm checks used `npm_config_offline=true`. There was no
`npx`, network attempt, install, model/provider, real/private history, deployment, `ACTIVE`, measured Host run, or
artifact/source modification. This does not expunge the prior historical process violation. Builder self-tests and
this handoff are not acceptance; fresh independent Evaluation Module re-QA owns the next verdict, and Submission QA
and measured use remain unauthorized.

## Append-only fact-id delimiter-boundary RETURN fix handoff — 2026-08-30

Status: `READY FOR FRESH EVALUATION MODULE RE-QA / BUILDER DOES NOT APPROVE`

### Exact lineage and bounded delta

- Returned family: `NON_DELIMITER_SAFE_FACT_ID_SUBSTRING_FALSE_POSITIVE`.
- Fixed source candidate: `04acb738d70bd1a7be858e0bf418e8e2af0972b6`; exact parent:
  `e877944d45457ca0fd8b3ae2020329285d8e892d`; source tree:
  `4d1d1ea1c090c5093cdec7ee7d7d99d64417231f`.
- The source commit changes exactly the offline runner, focused fixture test, and runner-dependent freeze receipt.
  It does not change corpus, oracle, renderer, manifest controls, fairness/Requirement/Architecture/Interface,
  product source, package/config/schema, other evaluation assets, or QA-owned paths.
- This docs-only handoff commit is the direct child of that source candidate and changes only this handoff plus the
  append-only work-order receipt. Its exact SHA is reported after commit because a commit cannot contain its own
  identity.

### Failure closure and regression evidence

- The delimiter guard for exact uppercase `FX-Fdddd` now excludes all adjacent ASCII letters, digits, and hyphens.
- Independent coordinated-copy scoring kept `[FX-F0001]` as one supported assertion and rejected substring forms
  `xFX-F0001y`, `AFX-F0001`, `FX-F00010`, one-sided lowercase adjacency, and both hyphen adjacencies as facts.
- Existing evaluator-control separation stayed intact: three registered qualification markers × cutoff-visible
  `sources`, `current_input`, and `fallback_scenario` were rejected 9/9 with `INVALID_ORACLE_EXPOSURE`.
- Focused fixture passed 8/8; validate passed 6 cases / 14 invalid controls; internal replay and two external replay
  invocations were byte-identical; freeze command reproduced exact bytes. Full offline suite passed 38 files / 1
  skipped and 595 tests / 1 skipped; build and `git diff --check` passed.

### Exact receipts

- Unchanged corpus file/value: `db8e13339f57434b06f83018886edd32e7227c70c80b9eaed23b63f647d46636` /
  `003f36c13653f27b7f036cd97100d37b16d3dd4b9eb81e52945c79d5235daaad`.
- Unchanged oracle file/value: `efd8f9864e7625293a8aae416a10b6e352b98958468a74e342e03fff88d2f7ce` /
  `0682e11d36800aaac049d900d696f2666448b738ac187c47c09b1693ae297a18`.
- Unchanged renderer file/value: `d0b861f404e473557847a7a7ea25457e8825c6a31d83cc2e1eecb7c2809f87f7` /
  `4d61bd32d95b525832862bc967019ac422cf0db56ace3bf78ca963f59faf2e1f`.
- Unchanged manifest controls file/value:
  `77bdaa3e8c565efad3f7ef12197f0aa39a3f5e633facb1e49f9ec5325fa6b866` /
  `c76810e5e6cce4f633924e462acca3dd9a634e19d0b0d9245536523efb91d529`.
- Runner: `2386cca0e93d03c92d9cbf833b74a9302b16ae4a4c2a2a8d0a0bfbff6103d12c`; focused test:
  `d0b0e2cbecb460f10c0c51f1fe7223f89c93f807f8beab21f328475ac1168821`.
- Bundle: `65ff3965ee54f7d71b4c5408f172e2100e870db4af115ac415ea599e31e5be26`; freeze file/value:
  `9d5edbbee19ebf4e76fbbdeeb0a0a538baefe7752e4f602d529777766bb743a4` /
  `16bdd5fac594beaa5de1742ec423e9169ca7b6b384bf7558a676cd19cca0253d`.
- Positive run id remains
  `RUN-SHA256-5b061c46627e651da35d788decc11cfe5500dc2440451021db67f9367468f947`.
  External replay receipt file: `f906bcefd204745277e70925e65088a5b6f4dfaca1691fb1277f1d4bf91a9695`;
  normalized result file/value remain `bd46477669f11f07bdc588b1cdbcea5f09da9a20d3b6b01f8c93781ab19e75ff` /
  `30c2f54f61ba5071b0d9a1c465ca7eddb54657f09d090055f6e101b83032c893`.

### Process boundary and next owner

All npm/Vitest checks ran with `npm_config_offline=true` against the already-present local dependency tree. There was
no `npx`, network attempt, installation, model/provider call, private/real history, deployment, `ACTIVE`, measured
Host run, scalar result, or contract change. This handoff is Builder evidence, not acceptance. Fresh independent
Evaluation Module re-QA must fix and judge the exact source candidate above; Submission QA and measured use remain
unauthorized.

## Bounded canonical integration handoff — 2026-08-30

Status: `READY FOR FRESH COMPOSITE-INTEGRATION QA / BUILDER DOES NOT APPROVE`

### Frozen subject and placement precondition

- Dedicated detached worktree: `/private/tmp/rc-ph1-eval-integration.MlxL3o`.
- Canonical target: `refs/heads/integration/v1@378d53536f991a67e4ecc45d3ae35cfa8fdbd63c`.
- Accepted public fixture ref: `17d716438483a9d965f5031434636c8013f45a69`.
- Common baseline: `f07257044e458d2edaad7821a95e3f9b9d18d63b`.
- Mechanical integration candidate: `ec1377505e1aff1e11ac5a589af4f172431de10e`.
- The docs-only handoff candidate is the direct child of that mechanical candidate and changes only this append-only
  handoff plus the matching work-order receipt. Its exact SHA is reported after commit because it cannot contain its
  own identity.

No branch/ref was created or moved, no dirty checkout was used, and no merge/rebase occurred. The canonical ref was
re-read after composition and checks and remained the exact target object.

### Exact accepted-to-integration mapping

```text
8cf8ca7c24d34fe3c6b591dc721937992ea67c76 -> e938f69075c2a5372ed23d8cc19d5574f11c3f1c
1fe5da5da858cff5c1ed31d6b9163dce1dc67892 -> 0960774568dfd539e595a4e91d81e8461d4853e1
416a1173179724ac9ec799c57c8ecf7fdfa66635 -> 5c20ad9a3ea2010755e57bb4965bc06d6aa05369
767cd1bb0fc91c29da5945aaa79f23b0fcce8cec -> acedc20ae48c5eb3cbf02545741f2bd0eabdf069
1b8c7738bac6395eacef11b4336c504d73bf430a -> 2269597ce2460070c1d4119039623d09a693affc
3c5629059af48fe845f0bacfc4f67c6e62ae9648 -> a166d34424dd772993669a541ccf4cd44f7c1b82
e877944d45457ca0fd8b3ae2020329285d8e892d -> 8217f69c80195519a428696e08c150f4700a1340
04acb738d70bd1a7be858e0bf418e8e2af0972b6 -> 3e093a5a655b0a744914d8454b548dc4b8116589
34cef69e74f031968f9cebd5712dc683771fc717 -> be50a48d0555eae8dd0edb5d9e916a5f26a2a3c7
17d716438483a9d965f5031434636c8013f45a69 -> ec1377505e1aff1e11ac5a589af4f172431de10e
```

All ten accepted commits were linear single-parent commits and applied cleanly in this order. The empty marker
`3c5629059af48fe845f0bacfc4f67c6e62ae9648` was preserved with `--allow-empty`. The baseline-relative target and
accepted changed-path intersection was empty; three-way inspection and every cherry-pick exposed no conflict, so the
Builder performed no semantic conflict resolution.

### Boundary and Gate evidence

- Before the append-only receipt, all twelve accepted product paths were content-identical to the accepted ref; the
  target's seventeen baseline-relative paths remained content-identical to the target commit. Final candidate drift
  is limited to the two receipt suffixes. Governance Submission QA
  `a0dd1baeb5aaff6b760e7b975fbb3db993af26f5` and Architecture reconciliation
  `31c51d6e1de36ca69ff3ae442abd5527f2d03074` were verified in the separate governance repository but not
  cherry-picked.
- Focused fixture `8/8`; runner validation `6/14`; marker attacks `9/9`; delimiter-boundary matrix; two different
  fresh-cwd replay outputs byte-identical at SHA-256
  `f906bcefd204745277e70925e65088a5b6f4dfaca1691fb1277f1d4bf91a9695`; freeze bytes and exact digests; full
  offline suite `40` files passed / `1` intentional skip and `618` tests passed / `1` intentional skip; build and
  diff/path/no-drift checks passed.
- Frozen bundle SHA-256 remains `65ff3965ee54f7d71b4c5408f172e2100e870db4af115ac415ea599e31e5be26`;
  `freeze.json` file SHA-256 remains `9d5edbbee19ebf4e76fbbdeeb0a0a538baefe7752e4f602d529777766bb743a4`.
- Claim ceiling remains `PUBLIC_SYNTHETIC_FIXTURE_PACKET_INCLUSION`. No model/provider/network/install, private/real
  data, measured Host run, deployment, `ACTIVE`, scalar winner, contract change, or capability expansion occurred.

This is bounded Integration Builder evidence only. Fresh independent composite/integration QA must fix and judge the
exact docs-only candidate. Only a later Owner CAS may move `refs/heads/integration/v1`; until then the canonical ref
must remain `378d53536f991a67e4ecc45d3ae35cfa8fdbd63c`. The Builder does not mark completion or self-accept.
