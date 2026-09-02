# PH1-EVAL-FIXTURE-01 — Phase-one synthetic evaluation fixture and oracle

Status: `FROZEN MODULE-OWNER PLANNING GATE / BUILDER NOT STARTED / NO DATA GENERATED`

## Authority and exact baseline

- Product authority: `RippleContext-governance@7129e453fbb08648250bfbd15da93596c635ddbe`.
- Accepted Target task: `PH1-EVAL-FIXTURE-01`.
- Core planning baseline and Gate parent: `f07257044e458d2edaad7821a95e3f9b9d18d63b`.
- Requirements: `REQ-RC-010/rev-001`, `REQ-RC-011/rev-001`, and `REQ-RC-012/rev-001`.
- Accepted Target manifest:
  `docs/architecture/baselines/phase-one-target-v1.yaml` at the product-authority commit,
  Git blob `7f2e350b0947e49f295e06f63f4a61d4ab56ab52`, exact-file SHA-256
  `eecc6f6a1e6077a34751c36fc04cf810ac1f4db5c183340d6bc8c69e40a3d9bd`.
- Accepted fairness contract:
  `docs/interfaces/phase-one-evaluation-fairness-v1.md` at the product-authority commit,
  Git blob `243636ae70d5e4f0b90c9f77eeea0b48def2eb25`, exact-file SHA-256
  `07a79307c7ae452132b12ed98b13b45d6502c4126f1c25cf32c2560ab14e297b`.
- The accepted Target manifest binds that exact fairness blob with the accepted meaning
  `vector fairness, missingness, uncertainty and no forced scalar winner`. Its embedded historical
  `CANDIDATE` heading is recorded, not rewritten; acceptance comes from the exact later manifest binding.
- Materialized cold-start capsule:
  `/path/to/ripplecontext-workspace/.rc-control/governance-runtime/tasks/PH1-EVAL-FIXTURE-01-MODULE-PLAN.materialized.json`,
  schema/capsule version `1.0.0`.

Repository files and Git objects above are the authority. Chat history, private evidence, QA-only evidence,
model output, network state, and unstated branch unions are not inputs.

## Objective

After this planning Gate is accepted and separately activated, create the smallest public, wholly synthetic,
arm-neutral fixture bundle needed to exercise the accepted D0/D1/D2 comparison contract:

1. one six-case corpus;
2. one physically separate fact/prohibition/provenance oracle;
3. one reference renderer and deterministic context-unit identity;
4. immutable run-manifest conformance fixtures, including invalid-run controls;
5. deterministic offline validation/replay and exact SHA-256 freeze receipts.

This work order does not select a Host, model, provider, scalar winner, weights, billing oracle, or measured
run. It creates no real/private conversation and does not change Core authority, retrieval, ranking, MCP,
database, package, or public evaluator v2 behavior.

## Planning result and current-turn write allowlist

This Gate may change exactly these three paths:

- `docs/work-orders/PH1-EVAL-FIXTURE-01.md`
- `docs/modules/evaluation-fixtures/implementation.md`
- `docs/handoffs/PH1-EVAL-FIXTURE-01-MODULE-PLAN.md`

The planning result is the detailed module contract in
`docs/modules/evaluation-fixtures/implementation.md`. This work-order file, that module contract, and the
planning handoff must land together in one docs-only Gate commit whose parent is the exact Core planning
baseline.

## Public baseline inventory

The implementation must preserve these exact accepted/public surfaces:

| Surface | Git blob at Core baseline | Exact-file SHA-256 | Planning use |
| --- | --- | --- | --- |
| `src/evaluation.ts` | `802d4444136b231a65469b3d159cf54d36c4c732` | `1c8585fb3c20f2fac423afd6c28b2065dd23b5917df3aa41181c5efe5f56e2d9` | evaluator v2 parser/report compatibility baseline only |
| `src/evaluation-cli.ts` | `fc343f5b458d99ac919f357eb6ab54cfb1d40763` | `e20d2f76c110656db251141bbce50ce78fcc6437c6c2769bbf173fc60e3e3b4a` | package-safe JSON CLI inventory only |
| `src/index.ts` | `b46facbfb6b63927c023b552cf5c9118bce50b45` | `2d711e2e454703b5563e4856fb8be0330a42936fd440c983707e1816f3e8eec0` | current package-root exports inventory only |
| `src/raw-store.ts` | `6d950cea32f9ab5bc55ee44d64e9f3d174a54b76` | `70394a0a44974d94e1c1a767c387ffadc4a00db8375177d1dcd1b1867445c2fc` | existing UTF-16-code-unit `/4` estimator identity |
| `test/fixtures/evaluation-v2-calibration.json` | `248d5f74f29d694eebeaaef421312ca67bafc99c` | `8dee56c157e33e51206382b3c4174b1c05fcf42e25e04d3fd3754b8477184126` | existing public synthetic v2 calibration, not the phase-one corpus |

The accepted `WO-BM-01` long-context delivery remains SPEC-only. Its public spec root is
`evaluation/ripplecontext-long-v1/spec` at tree `a6821960a4d057bf376a0a4afb518b5f34482dae`; the
contract document SHA-256 is `b9bffde8bc1c46891cbd3f661beeb6eeff9087e26e047d22205fac152bdc9130`.
Its cutoff conformance fixture is not a WORLD/corpus/Gold instance and must not be relabeled or silently reused
as this task's corpus or oracle. Starlette, dogfood, state-replay, internal-ground-truth, result, capture, and
QA-only assets are outside this task's source/data allowlist.

## Frozen six-case population

The future corpus id is exactly `rc-phase-one-synthetic-v1`. Selection is `ALL_CASES`, case order is ASCII
ascending by the following exact identifiers, and each primary category count is exactly one:

1. `PH1-C01-RELEVANT-DISTRACTOR`
2. `PH1-C02-STALE-SUPERSEDED`
3. `PH1-C03-CONFLICT-PROVENANCE`
4. `PH1-C04-MISSING-UNCERTAIN`
5. `PH1-C05-LONG-CONTEXT`
6. `PH1-C06-SAFE-FALLBACK`

Every fact/source/qualification id is opaque and sequential (`FX-Fdddd`, `FX-Sdddd`, `FX-Qdddd`); identifiers
must not encode requiredness, prohibition, category, truth, arm, or expected terminal. The corpus contains no
oracle labels. The separate oracle fixes these smallest per-case controls:

| Case | Required facts | Prohibitions | Qualification/fallback control |
| --- | ---: | --- | --- |
| C01 | exactly 1 | exactly 1 `UNRELATED` | none |
| C02 | exactly 1 current fact | exactly 1 `STALE` and 1 `SUPERSEDED` | none |
| C03 | exactly 1 current supported fact | exactly 1 `CONFLICTING` | exactly 2 provenance/authority-or-uncertainty labels |
| C04 | exactly 0; exactly 1 supported non-required tentative/unknown fact | exactly 0 | exactly 1 `ABSTAIN_OR_QUALIFY` label |
| C05 | exactly 1 | exactly 1 `UNRELATED` pressure record | D0 rendered history is at least 32,768 UTF-8 bytes |
| C06 | exactly 1 | exactly 0 | `fallback_expected: true` |

All text is newly hand-authored synthetic test data. The Builder may use deterministic local repetition for the
C05 pressure record, but no model, network, real/private history, repository conversation, or copied evaluation
answer may supply corpus content. C06's corpus contains only the fallback trigger; expected native preservation is
oracle-only.

## Fairness and scoring boundary

- Arms are exactly `D0_FULL_AUTHORIZED_FIXTURE`, `D1_HOST_NATIVE_BOUNDED`, and
  `D2_RIPPLECONTEXT_COMPILED`.
- D0 is a fixture-level reference, not a Host product experience. Generic MCP is never a Host arm.
- Every comparison cell binds the same corpus id/digest, exact case, common cutoff, operation scope,
  authorization lane, allowed source records, and current input. No arm-specific retry, hint, permission,
  preprocessing, time budget, or future/cutoff knowledge is allowed.
- Opaque fact ids may appear uniformly in all arm inputs solely to make deterministic packet inclusion observable;
  required/prohibited/qualification labels remain oracle-only.
- The phase-one runner reports a vector. Existing evaluator v2 `thresholds`, `threshold_failures`, and `passed`
  are not phase-one decision authority and must not be mapped to a scalar winner.
- Current evaluator v2 remains unchanged. It can preflight compatible fixture projections and supplies the frozen
  estimator identity, but it lacks the accepted contract's fact precision, prohibition, provenance/uncertainty,
  Host terminal, lane, and missingness envelope. The fixture-local runner closes only that offline fixture gap.
- No free-text semantic claim is inferred. The scorer recognizes only delimiter-safe opaque fixture fact ids and
  exact registered qualification markers at a directly observed packet boundary. Its claim ceiling is therefore
  `PUBLIC_SYNTHETIC_FIXTURE_PACKET_INCLUSION`, not general answer correctness or truthfulness.

## Denominator and missingness rules

- Metrics are emitted per Host, arm, case primary category, evidence lane, and observed boundary before aggregate.
- Required-fact recall denominator is the count of oracle required fact ids for an otherwise evaluable cell. Zero is
  `NOT_EVALUABLE`, never 0 or 1.
- Supported precision denominator is every recognized asserted fixture fact id in the directly observed packet,
  including unknown `FX-Fdddd` ids. Zero is `NOT_EVALUABLE`. It is explicitly not general natural-language precision.
- Stale/conflict leakage denominator contains only prohibitions with reasons `STALE`, `SUPERSEDED`, or
  `CONFLICTING`. `UNRELATED` inclusion is a separately reported non-scalar diagnostic count and does not silently
  alter the accepted metric.
- Provenance/uncertainty fidelity denominator is the count of evaluable qualification labels. An unobservable packet
  is `UNKNOWN`; a genuine zero denominator is `NOT_EVALUABLE`.
- Declared context units use the frozen renderer/tokenizer at the directly observed boundary. Estimates are labeled
  `ESTIMATED` with the estimator identity and never called final-input tokens or billing savings.
- Path terminal rate uses all attempted frozen cases. `INVALID_RUN` cells are displayed separately and are neither
  success nor failure.
- Safe-fallback rate uses only `fallback_expected: true` cases. Unobservable native preservation is `UNKNOWN`.
- Aggregation sums only evaluable numerators/denominators and displays counts for `UNKNOWN`, `NOT_EVALUABLE`,
  `UNSUPPORTED`, `INPUT_UNOBSERVABLE`, and `INVALID_RUN`. No status is converted to zero and no Host, arm, lane,
  boundary, case, or estimate substitutes for another.

## Later Builder implementation allowlist

The following paths are allowed only after a controller activates an implementation capsule whose baseline is this
planning Gate:

- `evaluation/phase-one-synthetic-v1/corpus.json`
- `evaluation/phase-one-synthetic-v1/oracle.json`
- `evaluation/phase-one-synthetic-v1/renderer.json`
- `evaluation/phase-one-synthetic-v1/run-manifest-fixtures.json`
- `evaluation/phase-one-synthetic-v1/freeze.json`
- `evaluation/phase-one-synthetic-v1/run-offline.mjs`
- `test/phase-one-evaluation-fixture.test.ts`
- `docs/work-orders/PH1-EVAL-FIXTURE-01.md` — append-only implementation receipt/status only
- `docs/handoffs/PH1-EVAL-FIXTURE-01.md`

No glob expands this allowlist. In particular, `src/**`, existing evaluation assets, `docs/qa/**`, schemas,
`package.json`, lockfiles, config, database files, build output, logs, and governance repository files are forbidden
to the Builder.

## Builder slices

1. **B1 — public fixture controls:** author the six-case corpus, physically separate oracle, renderer profile,
   run-manifest positive/template/invalid controls, and no other data. Stop if any accepted fairness field cannot be
   represented without inventing a value.
2. **B2 — deterministic validator/replay:** implement one no-network Node `.mjs` entrypoint using only Node built-ins.
   It validates closed shapes, ids, categories, arm neutrality, cutoffs, exact canonical bytes, digests, manifest
   completeness, denominator/missingness, invalid-run error codes, and two-run byte-identical replay.
3. **B3 — tests/freeze/handoff:** add focused tests, write the non-self-referential digest freeze, run required checks,
   append the implementation receipt, and write the Builder handoff. No measured Host run is part of B3.

Each slice is reviewable; only the final fixed candidate is sent to fresh Module QA. A QA return is repaired through
an append-only fix commit; history is not rewritten.

## Digest and replay acceptance

- All four public JSON control files before `freeze.json` use strict UTF-8, no BOM and LF line endings. JSON files
  are RFC 8785 JCS value bytes plus exactly one final LF; duplicate keys, non-I-JSON values, unsafe integers, `-0`,
  blank trailing records, CR, or noncanonical bytes fail closed.
- `file_sha256` is SHA-256 over exact stored bytes, including the JSON final LF.
- `value_sha256` is SHA-256 over the RFC 8785 JCS value bytes without the file LF.
- `fixture_bundle_sha256` is SHA-256 over the no-LF JCS bytes of the ASCII-path-sorted array
  `[{"path":<repository-relative-path>,"sha256":<file_sha256>}, ...]` for corpus, oracle, renderer,
  run-manifest fixtures, and `run-offline.mjs`. `freeze.json` is excluded to prevent self-reference.
- `freeze.json` records exact file/value hashes, algorithm ids, Core baseline, fairness Git blob, and bundle digest.
  The Builder handoff records the exact `freeze.json` file SHA; Module QA independently recomputes it.
- A measured run id is `RUN-SHA256-` plus the full lowercase SHA-256 of no-LF JCS bytes for the complete run manifest
  with `run_id` omitted. Any field change creates a different run id.
- Renderer id is `RC_PHASE1_FACT_LINES_V1`. Tokenizer id is
  `CC_ESTIMATE_TOKENS_JS_UTF16_CODE_UNITS_DIV4_V1`, exactly `text.length === 0 ? 0 :
  Math.max(1, Math.ceil(text.length / 4))`, tied to the baseline `src/raw-store.ts` identity above. These units are
  estimates, not provider tokens.
- Deterministic replay runs the positive conformance control twice in fresh temporary directories and requires
  byte-identical normalized result bytes and result SHA-256. It also reproduces every frozen invalid fixture's exact
  error code. Temporary output is not committed.

Actual corpus/oracle/renderer/manifest/bundle SHA values are `UNKNOWN_UNTIL_BUILDER_BYTES_EXIST`; inventing them in
this planning Gate is forbidden. Fresh Module QA and then governance Submission QA must freeze their exact values
before any measured Host run.

## Acceptance criteria

### Planning Gate acceptance

- The Gate parent is exactly `f07257044e458d2edaad7821a95e3f9b9d18d63b`.
- The Gate changes exactly the three planning paths and passes `git diff --check`.
- The implementation plan fixes the public baseline inventory, fairness mapping, six cases, arm-neutral separation,
  digest algorithms, missingness, exact later allowlist, Builder slices, QA route, UNKNOWNs, and CR disposition.
- No corpus, source, test, schema, package, lockfile, QA report, result, model/network call, or Builder start exists.

### Future implementation acceptance

- The diff is a subset of the exact later Builder allowlist and contains no real/private/QA-only/hidden evidence.
- Exactly six public synthetic cases and six exact primary category counts validate; oracle completeness and corpus ↔
  oracle id/cutoff closure pass; corpus remains free of oracle role/status fields.
- Every renderer output/case unit count and all file/value/bundle SHA-256 values independently reproduce.
- Positive replay is byte-identical across fresh directories; every invalid fixture returns its frozen error code.
- Missingness and denominators pass adversarial zero/unknown/unsupported/unobservable/invalid controls without
  becoming zero, success, a substitute cell, or a scalar winner.
- `npm test`, `npm run build`, focused fixture tests, deterministic replay, `git diff --check`, and exact diff allowlist
  pass. No source-change exemption applies merely because Core `src/**` is unchanged.
- Fresh independent Evaluation Module QA writes its own QA-only commit under the repository QA convention and fixes
  the exact candidate. Builder self-tests and Module Owner review are not acceptance.
- Governance Submission QA independently freezes the exact public corpus, oracle, renderer, run-manifest-fixture,
  runner, freeze, and bundle digests before any measured Host run. Its task/report path is controller-owned and remains
  `UNKNOWN` until materialized; Module QA cannot self-upgrade to Submission QA.

## Explicit non-goals and stop conditions

Forbidden in planning and implementation:

- real/private conversation, credentials, raw logs/databases, QA-only or hidden evidence;
- model/provider/network calls, answer generation, installation, deployment, `ACTIVE`/live behavior;
- arm-specific hints or unequal input, permissions, cutoff, budget, retry, preprocessing, or time;
- unconfirmed weights, scalar winner/rank, billing claims, or unknown-as-zero;
- mutation of Core authority/retrieval/ranking, current public evaluator v2, MCP exact-nine, package/config/schema;
- measured Host execution, durable real-data mutation, destructive cleanup, or accepted-branch union.

Stop and raise a new Change Request if the accepted fairness blob must change, if a cross-module Host/result contract
cannot express the required manifest/observed boundary, if exact corpus bytes require a model/private source, if the
tokenizer or assertion-observation contract must change, or if any path outside the exact allowlist is needed.

## UNKNOWN / Change Request ledger

- `UNKNOWN-01`: official supported-Host roster remains unconfirmed. Candidate Hosts are reported individually; no
  whole-roster completion claim is allowed.
- `UNKNOWN-02`: measured Host/version, integration commit/package digests, feature flags, evidence boundary, lane,
  warm-up, repetitions, timeouts, retries, concurrency, resource envelope, and sanitized artifact locations are not
  fixed by this Core fixture task. The manifest template uses required-unset sentinels that are invalid for measurement.
- `UNKNOWN-03`: actual fixture and freeze SHA-256 values do not exist before Builder bytes and remain unknown here.
- `UNKNOWN-04`: final-input observability and provider-token/billing correspondence are not established. Estimates stay
  explicitly estimated.
- `CR-01 RESOLVED BY PLAN`: evaluator v2's threshold/pass result is narrower and materially different from the
  accepted vector fairness contract. Preserve v2; use the fixture-local offline validator/scorer without public API
  promotion.
- `CR-02 DEFERRED TO CONTROLLER`: exact governance Submission-QA task id/report path must be materialized before
  implementation can be accepted for measured use. It does not block this docs-only planning Gate.
- `CR-03 REQUIRED IF NEEDED`: any request for natural-language assertion interpretation, hidden holdout, model-based
  semantic scoring, scalar weights, billing conversion, or a changed tokenizer requires a separately accepted contract.

## Builder implementation receipt — 2026-08-30

Status: `BUILDER CANDIDATE COMPLETE / NOT QA-ACCEPTED / NO MEASURED HOST RUN`

- Activated implementation baseline / exact planning Gate:
  `8cf8ca7c24d34fe3c6b591dc721937992ea67c76`.
- Bounded source candidate:
  `1fe5da5da858cff5c1ed31d6b9163dce1dc67892`; its parent is exactly the planning Gate above.
- The source candidate changes exactly the seven non-handoff implementation paths in the later Builder allowlist:
  corpus, physically separate evaluator-control oracle, renderer profile, manifest controls, freeze receipt,
  dependency-free offline runner, and focused test. It changes no `src/**`, existing evaluation asset, package,
  lockfile, config, schema, database, build output, QA report, or governance file.
- Population is exactly six ASCII-ordered `ALL_CASES`, one each for `RELEVANT_DISTRACTOR`,
  `STALE_SUPERSEDED`, `CONFLICT_PROVENANCE`, `MISSING_UNCERTAIN`, `LONG_CONTEXT`, and `SAFE_FALLBACK`.
  The corpus has 11 sequential opaque fact/source ids; the separate oracle has three sequential qualification ids.
  C05 reference D0 history is exactly 39,332 UTF-8 bytes.
- The positive conformance matrix is exactly 6 cases × 3 frozen arms = 18 cells. All 14 frozen invalid-run codes
  reproduce exactly. The positive manifest run id is
  `RUN-SHA256-5b061c46627e651da35d788decc11cfe5500dc2440451021db67f9367468f947`.
- Exact file/value SHA-256 receipts are in `freeze.json`; the bundle SHA-256 is
  `728bf406b9c4653d6a487938c23c1de5014c9b2c3357e42c9ebee5c19ef3743b`, and the exact `freeze.json` file
  SHA-256 is `808fbc1daf2466e78d3e5b641dcb4057b3cb394c0bf437c4edf1f36b0eea75a1`.
- Two independent CLI invocations reproduced byte-identical replay output at file SHA-256
  `2e898fe21ec607727241993c5dd260ebe205edfcdf3daf9e280d746110772b39`; the normalized result value SHA-256 is
  `30c2f54f61ba5071b0d9a1c465ca7eddb54657f09d090055f6e101b83032c893`.
- Focused fixture tests: 6 passed. `npm run build`: passed. Final `npm test`: 38 test files passed, one skipped;
  593 tests passed, one skipped. The first full run exposed the already-recorded ContextSnapshot concurrency lock
  race plus an offline package-test artifact caused by copying a worktree `node_modules` symlink. No production code
  changed: the two paths passed targeted reruns (24/24 and 17/17), the symlink was replaced only by an ignored local
  copy of the pre-existing dependency tree, and the complete second run passed as reported.
- Runner `validate`, internal two-fresh-directory replay, external two-invocation byte comparison,
  `git diff --check`, exact seven-path source allowlist, ordinary-file checks, and public-control credential/URL/path
  scans passed. No install, network, model/provider call, private/real/QA-only/hidden evidence, scalar winner, Core
  authority/retrieval/ranking change, or measured Host execution occurred.
- This is Builder evidence only. Fresh independent Evaluation Module QA and later controller-materialized governance
  Submission QA remain mandatory; the Builder does not approve this candidate.

## Builder append-only RETURN fix receipt — 2026-08-30

Status: `FIXED BUILDER CANDIDATE COMPLETE / NOT QA-ACCEPTED / NO MEASURED HOST RUN`

- Returned family fixed: `EVALUATOR_CONTROL_QUALIFICATION_MARKER_LEAKAGE_NOT_REJECTED`.
- Fixed source candidate: `767cd1bb0fc91c29da5945aaa79f23b0fcce8cec`; its parent is exactly the prior handoff
  `416a1173179724ac9ec799c57c8ecf7fdfa66635`, whose source parent is the original candidate
  `1fe5da5da858cff5c1ed31d6b9163dce1dc67892`.
- The fix changes exactly `evaluation/phase-one-synthetic-v1/run-offline.mjs`,
  `test/phase-one-evaluation-fixture.test.ts`, and `evaluation/phase-one-synthetic-v1/freeze.json`. It does not
  change corpus, oracle, renderer, run-manifest controls, `src/**`, package/config/schema, existing evaluation,
  product code, or QA-owned paths.
- Corpus validation now derives the complete qualification-marker set from the already shape-checked frozen oracle
  registry and recursively scans every cutoff-visible `sources`, `current_input`, and `fallback_scenario` key/value.
  Any exact registered marker fails closed as `INVALID_ORACLE_EXPOSURE`; the legacy corpus scan remains limited to
  prohibition tokens and no longer duplicates one qualification kind.
- The focused coordinated-rewrite regression recomputes corpus and renderer bytes, corpus/oracle/renderer/manifest
  file/value hashes, all current-input bindings, positive run id, freeze file entries, and bundle digest. A benign
  coordinated rewrite validates, while all three registered markers across each of the three arm-input surfaces
  fail closed (9/9 attacks).
- Frozen corpus/oracle/renderer/manifest file/value bytes and the positive run id remain unchanged. New dependent
  receipts are: runner file SHA-256 `da64091ede3a7f191fce8ffc938f2d4410259734f300787c7282596ffe99d8bf`;
  bundle SHA-256 `ad8fbc95d74ab66019f6cb302eb142e99657ab2ba127e01cfe8d46fc2e6ab2f0`;
  freeze file/value SHA-256 `f3e476b1774abd4ffb294d4898d05f60e5ba4f3e3b30ec1b4f31fbbe38e456d7` /
  `f0e99b7e4e744a335029b8fe8ed9d2f634ef744bc977fdf7c7bc53a391be675b`; focused test file SHA-256
  `b76ada5bc53a76516e4b4a103482a3f04118855055dfd6aa0b177753000be214`.
- Positive run id remains
  `RUN-SHA256-5b061c46627e651da35d788decc11cfe5500dc2440451021db67f9367468f947`.
  Two external replay invocations were byte-identical at receipt file SHA-256
  `d5b4293e5daaaec0c3fb4a97cb43e3401a482725d9cc72a60dbbdd70b9e76dbe`; normalized result file/value SHA-256 are
  `bd46477669f11f07bdc588b1cdbcea5f09da9a20d3b6b01f8c93781ab19e75ff` /
  `30c2f54f61ba5071b0d9a1c465ca7eddb54657f09d090055f6e101b83032c893`.
- Final checks passed: focused fixture 7/7; runner validate 6 cases / 14 invalid controls; internal and external replay;
  `npm run build`; full `npm test` 38 files passed / 1 skipped and 594 tests passed / 1 skipped; `git diff --check`;
  exact three-path source allowlist; ordinary-file checks; freeze-command byte equality; and unchanged
  corpus/oracle/renderer/manifest bytes.
- Process classification for fresh re-QA: the first `npx vitest` attempt found no local executable in this worktree
  and attempted the npm registry, then failed DNS with `ENOTFOUND`. It downloaded nothing, installed nothing, and no
  external content entered any artifact. A later pre-final PATH-only invocation exposed the same incomplete local
  dependency tree plus an intermediate expected-code mismatch. Final required checks used only a copied, ignored
  local dependency tree already present on this machine and completed offline. No product code was changed to mask
  either environment event.
- This remains Builder self-test evidence only. Fresh independent Evaluation Module re-QA must fix the exact source
  candidate above and independently classify the process event; Submission QA remains a later controller-owned gate.

## Builder append-only offline reconstruction receipt — 2026-08-30

Status: `OFFLINE RECONSTRUCTION COMPLETE / NOT QA-ACCEPTED / NO MEASURED HOST RUN`

- Returned process family addressed by this fresh execution:
  `FORBIDDEN_IMPLEMENTATION_NETWORK_ATTEMPT_VIOLATES_FROZEN_NO_NETWORK_BOUNDARY`. This receipt does not erase,
  rewrite, or reclassify the preceding Builder's recorded `npx` registry/DNS attempt. It records a new execution in
  which no `npx`, network attempt, dependency installation, model/provider call, real/private history, deployment,
  `ACTIVE` behavior, or measured Host run occurred.
- The frozen artifact source remains `767cd1bb0fc91c29da5945aaa79f23b0fcce8cec`. Fresh reconstruction started from
  clean handoff HEAD `1b8c7738bac6395eacef11b4336c504d73bf430a`. The direct-child allow-empty offline
  candidate marker is `3c5629059af48fe845f0bacfc4f67c6e62ae9648`; its tree and its parent's tree are both
  `42bad9669c895856809d7e2afa4fcf42a05e43f5`. The fixture subtree at the marker is
  `30b8dc401d962abf43a6c68c657f1041f99edbf2`, exactly equal to the fixture subtree at fixed source `767cd1b`.
  Thus the marker changes no tree bytes and does not replace or modify the already-correct runner, test, freeze,
  corpus, oracle, renderer, or manifest controls.
- An independent temporary-directory reconstruction fixed the complete oracle qualification registry as
  `FX-Q0001` / `[[SOURCE_FX-S0006]]` / `SOURCE_PROVENANCE`, `FX-Q0002` /
  `[[AUTHORITY_OR_UNCERTAIN]]` / `AUTHORITY_OR_UNCERTAINTY`, and `FX-Q0003` /
  `[[ABSTAIN_OR_QUALIFY]]` / `ABSTAIN_OR_QUALIFY`. Corpus/oracle closed shapes passed; one benign coordinated
  corpus/renderer/manifest/run-id/freeze/bundle rewrite passed; all three markers injected independently into each
  of cutoff-visible `sources`, `current_input`, and `fallback_scenario` were rejected 9/9 with
  `INVALID_ORACLE_EXPOSURE`.
- Unchanged file/value receipts independently reproduced: corpus
  `db8e13339f57434b06f83018886edd32e7227c70c80b9eaed23b63f647d46636` /
  `003f36c13653f27b7f036cd97100d37b16d3dd4b9eb81e52945c79d5235daaad`; oracle
  `efd8f9864e7625293a8aae416a10b6e352b98958468a74e342e03fff88d2f7ce` /
  `0682e11d36800aaac049d900d696f2666448b738ac187c47c09b1693ae297a18`; renderer
  `d0b861f404e473557847a7a7ea25457e8825c6a31d83cc2e1eecb7c2809f87f7` /
  `4d61bd32d95b525832862bc967019ac422cf0db56ace3bf78ca963f59faf2e1f`; manifest controls
  `77bdaa3e8c565efad3f7ef12197f0aa39a3f5e633facb1e49f9ec5325fa6b866` /
  `c76810e5e6cce4f633924e462acca3dd9a634e19d0b0d9245536523efb91d529`; runner
  `da64091ede3a7f191fce8ffc938f2d4410259734f300787c7282596ffe99d8bf`; focused test
  `b76ada5bc53a76516e4b4a103482a3f04118855055dfd6aa0b177753000be214`.
- The unchanged bundle SHA-256 is `ad8fbc95d74ab66019f6cb302eb142e99657ab2ba127e01cfe8d46fc2e6ab2f0`;
  freeze file/value SHA-256 are `f3e476b1774abd4ffb294d4898d05f60e5ba4f3e3b30ec1b4f31fbbe38e456d7` /
  `f0e99b7e4e744a335029b8fe8ed9d2f634ef744bc977fdf7c7bc53a391be675b`. The freeze command
  reproduced byte-identical `freeze.json`. Positive run id remains
  `RUN-SHA256-5b061c46627e651da35d788decc11cfe5500dc2440451021db67f9367468f947`.
  Two external replay invocations were byte-identical at receipt file SHA-256
  `d5b4293e5daaaec0c3fb4a97cb43e3401a482725d9cc72a60dbbdd70b9e76dbe`; normalized result
  file/value SHA-256 remain `bd46477669f11f07bdc588b1cdbcea5f09da9a20d3b6b01f8c93781ab19e75ff` /
  `30c2f54f61ba5071b0d9a1c465ca7eddb54657f09d090055f6e101b83032c893`.
- Offline checks passed: focused fixture 7/7; runner validate 6 cases / 14 invalid controls; internal and two external
  byte-identical replays; 18 normalized cells; genuine zero denominator remained `NOT_EVALUABLE`; `UNKNOWN`,
  `UNSUPPORTED`, `INPUT_UNOBSERVABLE`, and 14 `INVALID_RUN` controls remained distinct; recursive no-scalar audit
  passed; `npm run build` passed; `git diff --check`, lineage/three-path source-fix allowlist, current-artifact
  byte equality, ordinary-file, renderer/freeze/digest, and clean-worktree checks passed.
- The first offline full-suite run reproduced the already-recorded ContextSnapshot concurrent cleanup/lock race:
  37 files passed / 1 failed / 1 skipped and 593 tests passed / 1 failed / 1 skipped. No source changed. The exact
  ContextSnapshot file then passed 24/24, and the complete offline rerun passed 38 files / 1 skipped and 594 tests /
  1 skipped. This execution used Node `v25.6.1`, npm `11.9.0`, and the already-present dependency tree at
  `/path/to/context-compiler-mcp/node_modules`; the worktree's ignored ordinary-directory
  copy had byte-equal Vitest and TypeScript entry/package files. Focused Vitest was invoked by that absolute local
  path, and npm checks ran with `npm_config_offline=true`.
- The docs-only handoff commit is the direct child of the empty marker and changes only this append-only receipt plus
  `docs/handoffs/PH1-EVAL-FIXTURE-01.md`; its exact SHA is reported after commit because it cannot contain its own
  identity. This is Builder execution evidence only. The Builder does not approve it; fresh independent Evaluation
  Module re-QA must fix the exact marker candidate and independently accept or return it before any Submission QA or
  measured use.

## Builder append-only fact-id delimiter-boundary RETURN fix receipt — 2026-08-30

Status: `FIXED BUILDER CANDIDATE COMPLETE / NOT QA-ACCEPTED / NO MEASURED HOST RUN`

- Returned family fixed: `NON_DELIMITER_SAFE_FACT_ID_SUBSTRING_FALSE_POSITIVE`.
- Fixed source candidate: `04acb738d70bd1a7be858e0bf418e8e2af0972b6`; its parent is exactly
  `e877944d45457ca0fd8b3ae2020329285d8e892d`, and its tree is
  `4d1d1ea1c090c5093cdec7ee7d7d99d64417231f`.
- The fixed source commit changes exactly `evaluation/phase-one-synthetic-v1/run-offline.mjs`,
  `test/phase-one-evaluation-fixture.test.ts`, and the runner-dependent
  `evaluation/phase-one-synthetic-v1/freeze.json`. Corpus, oracle, renderer, manifest controls, fairness,
  Requirement/Architecture/Interface contracts, `src/**`, package/config/schema, other evaluation, and QA-owned
  paths are unchanged.
- `recognizedFactIds` still recognizes only exact uppercase `FX-Fdddd` tokens, but its delimiter guard now treats
  every adjacent ASCII letter, digit, or hyphen as token continuation. The coordinated-copy regression proves
  `[FX-F0001]` remains one supported assertion, while `xFX-F0001y`, `AFX-F0001`, `FX-F00010`, one-sided lowercase
  adjacency, and hyphen adjacency contribute no recognized fact.
- The existing coordinated qualification-marker regression also passed unchanged: all three registered markers
  across cutoff-visible `sources`, `current_input`, and `fallback_scenario` were rejected 9/9 with
  `INVALID_ORACLE_EXPOSURE`.
- Frozen corpus/oracle/renderer/manifest file and value receipts remain unchanged. The positive run id remains
  `RUN-SHA256-5b061c46627e651da35d788decc11cfe5500dc2440451021db67f9367468f947`.
  New dependent receipts are: runner file SHA-256
  `2386cca0e93d03c92d9cbf833b74a9302b16ae4a4c2a2a8d0a0bfbff6103d12c`; focused test file SHA-256
  `d0b0e2cbecb460f10c0c51f1fe7223f89c93f807f8beab21f328475ac1168821`; bundle SHA-256
  `65ff3965ee54f7d71b4c5408f172e2100e870db4af115ac415ea599e31e5be26`; freeze file/value SHA-256
  `9d5edbbee19ebf4e76fbbdeeb0a0a538baefe7752e4f602d529777766bb743a4` /
  `16bdd5fac594beaa5de1742ec423e9169ca7b6b384bf7558a676cd19cca0253d`.
- Two external replay invocations were byte-identical. The replay receipt file SHA-256 is
  `f906bcefd204745277e70925e65088a5b6f4dfaca1691fb1277f1d4bf91a9695`; normalized result file/value SHA-256 remain
  `bd46477669f11f07bdc588b1cdbcea5f09da9a20d3b6b01f8c93781ab19e75ff` /
  `30c2f54f61ba5071b0d9a1c465ca7eddb54657f09d090055f6e101b83032c893`.
- Final offline checks passed: focused fixture 8/8; runner validate 6 cases / 14 invalid controls; independent
  coordinated boundary positive/negative rewrite; existing marker-leakage 3×3; internal and external replay/diff;
  freeze-command byte equality; `npm test` 38 files passed / 1 skipped and 595 tests passed / 1 skipped;
  `npm run build`; `git diff --check`; exact three-path source allowlist; and clean source-candidate status.
- All commands used `npm_config_offline=true` where npm/Vitest was involved and only the already-present local
  dependency tree. No `npx`, network attempt, install, model/provider, private/real history, deployment, `ACTIVE`,
  measured Host run, scalar winner, or fairness-contract change occurred.
- The docs-only handoff commit is the direct child of the fixed source candidate and changes only this append-only
  receipt plus `docs/handoffs/PH1-EVAL-FIXTURE-01.md`; its exact SHA is reported after commit because it cannot contain
  its own identity. This is Builder evidence only. Fresh independent Evaluation Module re-QA remains mandatory; the
  Builder does not approve this candidate.

## Bounded canonical integration Builder receipt — 2026-08-30

Status: `INTEGRATION BUILDER CANDIDATE / AWAITING INDEPENDENT COMPOSITE-INTEGRATION QA AND OWNER CAS`

- Dedicated detached worktree: `/private/tmp/rc-ph1-eval-integration.MlxL3o`. It was created from the exact canonical
  target object `378d53536f991a67e4ecc45d3ae35cfa8fdbd63c`; no dirty main/current checkout was used, no branch/ref was created,
  and no merge or rebase was performed.
- Canonical target was frozen as `refs/heads/integration/v1@378d53536f991a67e4ecc45d3ae35cfa8fdbd63c` before
  composition and remained exact after the mechanical candidate and all local checks. The accepted product ref is
  `17d716438483a9d965f5031434636c8013f45a69`; their exact common baseline is
  `f07257044e458d2edaad7821a95e3f9b9d18d63b`.
- The controller-routed event receipts reproduced at SHA-256
  `293f270d4aa1f959e73a511396282eb8df57e76d0026f8cd7ac6dbd358afd532` and
  `bc39b38eaac330988b8e406714fa2f9ade582199b2471292468e2dc3b4b6b197`. Governance Submission-QA `ACCEPT`
  `RippleContext-governance@a0dd1baeb5aaff6b760e7b975fbb3db993af26f5` and Architecture reconciliation
  `RippleContext-governance@31c51d6e1de36ca69ff3ae442abd5527f2d03074` were verified as bindings only and were not
  cherry-picked or otherwise copied into this product repository.
- The accepted side is exactly ten linear single-parent commits with no merge. They were cherry-picked in the frozen
  order without conflict; the accepted empty append-only marker was preserved with `--allow-empty`:

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

- The target-side and accepted-side changed-path sets from the common baseline have an empty intersection, and the
  three-way tree inspection exposed no conflict. No semantic conflict resolution was performed. Before this receipt,
  all twelve accepted product paths were content-identical to `17d716438483a9d965f5031434636c8013f45a69`; all
  seventeen target-owned paths were content-identical to `378d53536f991a67e4ecc45d3ae35cfa8fdbd63c`. This receipt
  and the matching handoff append only to the accepted work-order/handoff suffix; `docs/qa/PH1-EVAL-FIXTURE-01.md`
  was mechanically materialized from the accepted QA commit and was not edited by the Integration Builder.
- The final integrated changed-path set remains exactly the accepted twelve paths:

  ```text
  docs/handoffs/PH1-EVAL-FIXTURE-01-MODULE-PLAN.md
  docs/handoffs/PH1-EVAL-FIXTURE-01.md
  docs/modules/evaluation-fixtures/implementation.md
  docs/qa/PH1-EVAL-FIXTURE-01.md
  docs/work-orders/PH1-EVAL-FIXTURE-01.md
  evaluation/phase-one-synthetic-v1/corpus.json
  evaluation/phase-one-synthetic-v1/freeze.json
  evaluation/phase-one-synthetic-v1/oracle.json
  evaluation/phase-one-synthetic-v1/renderer.json
  evaluation/phase-one-synthetic-v1/run-manifest-fixtures.json
  evaluation/phase-one-synthetic-v1/run-offline.mjs
  test/phase-one-evaluation-fixture.test.ts
  ```

- Offline checks used only the already-present local dependency tree with `npm_config_offline=true`: focused fixture
  `8/8`; runner `validate` `6` cases / `14` invalid controls; qualification-marker matrix `9/9`; delimiter-boundary
  positive/negative matrix; two fresh-cwd byte-identical replays at receipt SHA-256
  `f906bcefd204745277e70925e65088a5b6f4dfaca1691fb1277f1d4bf91a9695`; freeze-command byte equality and exact
  file/value/bundle digests; full `npm test` `40` files passed / `1` intentional skip and `618` tests passed / `1`
  intentional skip; `npm run build`; exact accepted/target path equality; and `git diff --check`.
- Claim ceiling remains exactly `PUBLIC_SYNTHETIC_FIXTURE_PACKET_INCLUSION`. No model/provider/network/install,
  private/real data, measured Host run, deployment, `ACTIVE`, scalar result, fairness change, or capability expansion
  occurred. The docs-only integration handoff commit is the direct child of mechanical candidate
  `ec1377505e1aff1e11ac5a589af4f172431de10e` and changes only this append-only receipt plus the matching handoff;
  its exact identity is reported after commit because a commit cannot contain itself.
- This receipt is Builder evidence, not acceptance. Completion requires fresh independent composite/integration QA
  on the exact docs-only candidate and a later Owner compare-and-swap decision for the still-unmoved canonical ref.
  The Integration Builder does not mark this work `COMPLETE` and does not approve its own composition.
