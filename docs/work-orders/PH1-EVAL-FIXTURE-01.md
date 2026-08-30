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
  `/Users/lmc/Documents/agent长期记忆/.rc-control/governance-runtime/tasks/PH1-EVAL-FIXTURE-01-MODULE-PLAN.materialized.json`,
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
