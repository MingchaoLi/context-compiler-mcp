# Evaluation Fixtures module implementation plan

Status: `FROZEN PLANNING CONTRACT / NO BUILDER OR DATA AUTHORIZED BY THIS FILE ALONE`

Work order: `PH1-EVAL-FIXTURE-01`

## 1. Module responsibility

This module owns a public synthetic input fixture, its separate evaluator-control oracle, a deterministic reference
renderer/context-unit identity, immutable run-manifest conformance fixtures, digest freeze, and offline validation/
replay. It does not own Host adapters, integration packaging, provider/model execution, private/hidden evidence,
production runs, public evaluator v2, Core selection algorithms, or governance acceptance.

The result is a reusable fixture contract for later Host lanes. It proves only deterministic inclusion/exclusion,
qualification-marker, boundary, terminal, manifest, and digest behavior over the public synthetic fixture.

## 2. Exact authority receipts

| Authority | Exact identity | Meaning used here |
| --- | --- | --- |
| Core planning baseline | `f07257044e458d2edaad7821a95e3f9b9d18d63b` | exact repository parent for this plan |
| Product Target | `RippleContext-governance@7129e453fbb08648250bfbd15da93596c635ddbe` | accepted four-Requirement Target context |
| Target manifest | blob `7f2e350b0947e49f295e06f63f4a61d4ab56ab52`; SHA-256 `eecc6f6a1e6077a34751c36fc04cf810ac1f4db5c183340d6bc8c69e40a3d9bd` | binds exact accepted artifacts and excludes implementation authorization |
| Fairness contract | blob `243636ae70d5e4f0b90c9f77eeea0b48def2eb25`; SHA-256 `07a79307c7ae452132b12ed98b13b45d6502c4126f1c25cf32c2560ab14e297b` | vector metrics, missingness, immutable manifest, claim ceilings |
| Current public evaluator v2 | `src/evaluation.ts` blob `802d4444136b231a65469b3d159cf54d36c4c732`; SHA-256 `1c8585fb3c20f2fac423afd6c28b2065dd23b5917df3aa41181c5efe5f56e2d9` | preserved compatibility surface; not full phase-one scorer |
| Existing estimator | `src/raw-store.ts` blob `6d950cea32f9ab5bc55ee44d64e9f3d174a54b76`; SHA-256 `70394a0a44974d94e1c1a767c387ffadc4a00db8375177d1dcd1b1867445c2fc` | deterministic declared-unit identity only |
| Accepted long-context SPEC | tree `a6821960a4d057bf376a0a4afb518b5f34482dae`; contract doc SHA-256 `b9bffde8bc1c46891cbd3f661beeb6eeff9087e26e047d22205fac152bdc9130` | canonical/hash design precedent; no dataset instance to reuse |

The fairness file's historical status heading and its later exact accepted-manifest binding are both facts. This plan
does not edit or reinterpret the upstream bytes.

## 3. Fairness-contract mapping

| Accepted fairness requirement | Smallest module artifact/check | Explicit ceiling |
| --- | --- | --- |
| Same frozen workload/cutoff for D0/D1/D2 | corpus case/cutoff ids plus manifest equality check | no Host result |
| Relevant facts with distractors | C01 corpus + separate oracle | fixture fact inclusion only |
| Stale/superseded | C02 oracle prohibition reasons | no natural-language semantic inference |
| Conflict + authority/provenance | C03 source metadata + qualification oracle | registered marker fidelity only |
| Missing/uncertain | C04 zero-required-fact + qualification label | honest `NOT_EVALUABLE`/qualification control |
| Long-context pressure | C05 reference-rendered history ≥32,768 UTF-8 bytes | one synthetic pressure point, no generalization |
| Safe fallback/unavailable/unobservable | C06 plus manifest terminal controls | runner terminal honesty only |
| Immutable run manifest | run-manifest conformance file + complete closed validator | template/conformance, not measured run |
| Exact context units | renderer profile + existing estimator identity | estimated units, never billing tokens |
| Vector metrics/no scalar winner | normalized vector report and status counts | no weights/rank/`passed` authority |
| Invalid runs | frozen mutation fixtures and exact error codes | invalid is separate, not zero/failure/success |
| Independent freeze | Module QA then governance Submission QA | Builder/Owner cannot accept |

## 4. Exact later implementation paths

Builder writes are closed to these nine paths:

```text
evaluation/phase-one-synthetic-v1/corpus.json
evaluation/phase-one-synthetic-v1/oracle.json
evaluation/phase-one-synthetic-v1/renderer.json
evaluation/phase-one-synthetic-v1/run-manifest-fixtures.json
evaluation/phase-one-synthetic-v1/freeze.json
evaluation/phase-one-synthetic-v1/run-offline.mjs
test/phase-one-evaluation-fixture.test.ts
docs/work-orders/PH1-EVAL-FIXTURE-01.md
docs/handoffs/PH1-EVAL-FIXTURE-01.md
```

The work-order write is limited to an append-only implementation receipt/status. Existing files and every unlisted
path are read-only. QA reports are independently owned and are not Builder paths.

## 5. Artifact contracts

### 5.1 `corpus.json`

Closed top-level keys:

```text
schema_version = rc-phase-one-corpus/1.0.0
corpus_id = rc-phase-one-synthetic-v1
classification = PUBLIC_SYNTHETIC_NO_REAL_OR_PRIVATE_DATA
selection_rule = ALL_CASES
case_order_rule = ASCII_CASE_ID_ASCENDING
arm_neutrality_policy = SAME_CASE_CUTOFF_SCOPE_AND_AUTHORIZED_SOURCE_SET_V1
cases
```

Each case contains only input-side data:

```text
case_id
primary_category
operation_scope
common_cutoff { cutoff_id, visible_through_stream_seq }
sources[] { source_id, fact_id, stream_seq, source_class, epistemic_marker, text }
current_input
fallback_scenario { scenario_id, trigger }
```

Constraints:

- case ids/order and one-per-category counts are exact as fixed in the work order;
- `stream_seq` is unique, positive, contiguous within a case; cutoff is inclusive and resolves exactly;
- all ids are globally unique, opaque, sequential, and ASCII;
- `operation_scope` is exactly `PHASE_ONE_PUBLIC_SYNTHETIC`; `source_class` is closed to
  `POLICY_RECORD`, `PROJECT_RECORD`, `PARTICIPANT_REPORT`, `STATUS_RECORD`, or `SYNTHETIC_FILLER`;
  `epistemic_marker` is closed to `DIRECT`, `REPORTED`, `TENTATIVE`, or `UNKNOWN`;
- source text is newly hand-authored and visibly synthetic; the renderer adds the delimiter-safe opaque `fact_id`
  uniformly to every arm's authorized input record;
- no key/value contains `required`, `prohibited`, `gold`, `oracle`, `winner`, `score`, `D0`, `D1`, `D2`, expected
  terminal, or category-encoded fact identity;
- all arms receive the same exact source set/cutoff/scope/current input; later lane adapters may only apply their
  declared construction policy;
- C05 has exactly one required fact source and one unrelated pressure source. The pressure text is a deterministic
  ASCII repetition fixed in the file; D0 historical rendering is at least 32,768 UTF-8 bytes. No random generator or
  model is used at runtime.
- C04 contains exactly one supported, non-required tentative/unknown source so required-fact recall has a genuine
  zero denominator while qualification fidelity remains evaluable. C06 corpus data contains only the fallback trigger;
  the expected preservation result remains oracle-only.

### 5.2 `oracle.json`

Closed top-level keys:

```text
schema_version = rc-phase-one-oracle/1.0.0
oracle_id = rc-phase-one-synthetic-oracle-v1
classification = PUBLIC_SYNTHETIC_EVALUATOR_CONTROL_NOT_HIDDEN_HOLDOUT
corpus_id
cases
```

Each oracle case contains:

```text
case_id
required_fact_ids[]
supported_fact_ids[]
prohibitions[] { fact_id, reason }
qualification_labels[] { qualification_id, marker, kind }
fallback_expected
```

`reason` is exactly one of `STALE`, `SUPERSEDED`, `CONFLICTING`, `UNRELATED`. `kind` is a closed enumeration
containing only the two C03 provenance/authority-or-uncertainty controls and C04 `ABSTAIN_OR_QUALIFY` control fixed by
the work order. All lists are ASCII-id sorted and duplicate-free. Required facts are a subset of supported facts;
prohibited facts are disjoint from required facts; every id resolves to the same corpus/cutoff; every corpus fact is
classified exactly once as supported or prohibited for its case. The oracle is evaluator control, never Independent
Hidden Holdout, and must be physically unavailable to arm construction.

### 5.3 `renderer.json`

Closed identities:

```text
schema_version = rc-phase-one-renderer-profile/1.0.0
renderer_id = RC_PHASE1_FACT_LINES_V1
tokenizer_id = CC_ESTIMATE_TOKENS_JS_UTF16_CODE_UNITS_DIV4_V1
normalization_id = RC_PHASE1_EXACT_UTF8_LF_NO_NORMALIZATION_V1
fact_order = STREAM_SEQ_ASC_FACT_ID_ASC
```

For every source at/before the inclusive cutoff, the exact line is:

```text
[<fact_id>|<source_id>|<source_class>|<epistemic_marker>] <text>\n
```

The current-input line is appended exactly once:

```text
[CURRENT_INPUT] <current_input>\n
```

No implicit prefix/suffix, BOM, CR, trimming, whitespace collapse, Unicode normalization, oracle field, or arm field is
allowed. `renderer.json` stores each case's expected D0 history byte length, full packet byte length, exact SHA-256,
and estimated units. History excludes the current-input line; full packet includes it.

The estimator uses JavaScript UTF-16 code units exactly:

```text
empty => 0
non-empty => max(1, ceil(text.length / 4))
```

The result is `declared_context_units` with evidence status `ESTIMATED`, not a provider token count or billing value.

### 5.4 `run-manifest-fixtures.json`

This file contains exactly:

- one `TEMPLATE_NOT_RUN` manifest with required-unset sentinels for controller/Host-owned measured values;
- one `VALIDATOR_CONFORMANCE_ONLY` positive control with sanitized synthetic observations and no Host claim;
- one mutation fixture for each frozen invalid-run code.

Every measured manifest must close and bind all accepted fairness fields:

```text
schema/contract/run identity
roster revision/status and exact Host/version
integration revision, repository commits, package digests, Node/toolchain, feature flags
corpus/case/oracle/cutoff/order/renderer/tokenizer ids and digests
three exact arm ids, authorization/evidence lane, observed boundary
allowed inputs and explicit exclusions
seed or NOT_APPLICABLE, case order and randomization rule
warm-up, repetitions, timeout, retry maximum, concurrency, resource envelope
invalid-run rules, sanitized artifact locations
Module-QA and Submission-QA identities
```

The template is never measurement-valid while any `REQUIRED_UNSET` remains. The conformance control uses
`REFERENCE_FIXTURE_NOT_A_HOST` and cannot be published as Host evidence. Exact invalid codes are:

```text
INVALID_MANIFEST_CHANGED
INVALID_FIXTURE_DIGEST
INVALID_ORACLE_DIGEST
INVALID_RENDERER_DIGEST
INVALID_CASE_SET
INVALID_CUTOFF_OR_ORDER
INVALID_CROSS_LANE_STATE
INVALID_UNAUTHORIZED_ACCESS
INVALID_MISSING_ARTIFACT
INVALID_ORACLE_EXPOSURE
INVALID_TIMEOUT
INVALID_CRASH
INVALID_REPLAY_MISMATCH
INVALID_RETRY_EXCEEDED
```

Each invalid fixture changes one cause from the positive control and freezes the one expected code. The original
attempt stays visible; a changed manifest identity is a new run, never a retry.

### 5.5 `run-offline.mjs`

One dependency-free Node entrypoint owns:

- strict JSON bytes/JCS/I-JSON validation;
- closed shapes and exact enumerations;
- cross-file id/cutoff/category/oracle completeness;
- arm-neutral corpus scan and forbidden-key/value scan;
- exact reference rendering and context-unit calculation;
- file/value/bundle/run-id digest reconstruction;
- manifest-template completeness and measured-use rejection;
- positive normalized scoring and frozen invalid-control reproduction;
- deterministic two-run replay with canonical result bytes to stdout.

Allowed imports are Node built-ins needed for filesystem reads, paths, cryptographic SHA-256, and temporary
directories. Network, subprocess, dynamic remote import, database, model/provider SDK, credentials, environment-owned
history, and writes outside a fresh temporary directory are forbidden. Default execution is repository-root
independent and resolves its fixture directory from `import.meta.url`.

The runner recognizes observed fixture facts only from exact delimiter-safe `FX-Fdddd` tokens. Unknown in-pattern ids
are unsupported assertions. Arbitrary natural-language claims without fixture ids are outside the scorer and force no
truthfulness claim. Qualification markers are exact registered public markers. The normalized result contains no raw
private data, model answer, or unsanitized logs.

### 5.6 `freeze.json`

It contains:

```text
schema_version = rc-phase-one-freeze/1.0.0
core_baseline
fairness_contract_git_blob
canonicalization/digest/renderer/tokenizer ids
files[] { path, role, file_sha256, value_sha256_or_NOT_APPLICABLE }
fixture_bundle_sha256
```

The `files` array includes exactly corpus, oracle, renderer, run-manifest fixtures, and runner, ASCII sorted by path.
`freeze.json` excludes itself from the bundle. Its own exact-file SHA is recorded by Builder handoff, recomputed by
Module QA, and frozen with the other public digests by Submission QA.

## 6. Canonical bytes and exact digests

JSON policy id is `RFC8785_JCS_VALUE_UTF8_NO_TERMINATOR_JSON_FILE_LF_V1`, reusing the accepted public benchmark
contract:

- strict UTF-8, no BOM, no CR;
- RFC 8785 JCS value bytes;
- exactly one LF after the value in the stored JSON file;
- I-JSON only; duplicate keys, unsafe integers, nonfinite values, `-0`, or noncanonical bytes fail;
- `value_sha256` hashes JCS value bytes without the LF;
- `file_sha256` hashes exact stored bytes including LF.

Runner source is strict UTF-8/LF and receives only `file_sha256`. The bundle preimage is the no-LF JCS value for the
ASCII-path-sorted array of exact `{path,sha256}` objects. The measured run-id preimage is the complete manifest object
with only `run_id` omitted. Hash output is lowercase 64-character hex; run id uses the full digest.

Actual future artifact hashes are deliberately not present in this plan. They cannot exist before bytes exist and are
frozen only by Builder handoff → independent Module QA → governance Submission QA.

## 7. Normalized metrics and missingness

Normalized cell statuses are closed to:

```text
EVALUABLE
NOT_EVALUABLE
UNKNOWN
UNSUPPORTED
INPUT_UNOBSERVABLE
INVALID_RUN
```

`ESTIMATED` is an evidence-quality label for context units, not a cell status. `NOT_APPLICABLE` is allowed only for a
manifest field whose contract explicitly permits it, such as a deterministic seed.

Per-cell formulas:

```text
required_fact_recall = observed_required_ids / oracle_required_ids
supported_precision = observed_supported_ids / all_recognized_asserted_fixture_ids
stale_conflict_leakage = observed_prohibited_ids(reason in STALE|SUPERSEDED|CONFLICTING)
                         / evaluable_prohibited_ids(same reasons)
provenance_uncertainty_fidelity = correct_qualification_markers / evaluable_qualification_labels
declared_context_units = exact observed bytes through frozen estimator
path_terminal_rate = terminal counts / attempted frozen cases
safe_fallback_rate = observed native-preserving fallback / evaluable fallback_expected cases
```

`UNRELATED` inclusion is a separately displayed count by case and arm. Empty denominators are `NOT_EVALUABLE`.
Unobserved outputs are `UNKNOWN` or `INPUT_UNOBSERVABLE` as applicable. Unsupported directions remain
`UNSUPPORTED`. Invalid cells are excluded and counted. Aggregate rates sum evaluable numerators/denominators rather
than average case rates. Every table carries status counts beside numerators/denominators.

The scorer never emits weights, a scalar score, rank, winner, overall boolean `passed`, provider-token/billing savings,
or cross-boundary latency comparison. Same-case D2-vs-D1/D0 context reduction is reported only when the boundary and
unit identity match; otherwise it is `NOT_EVALUABLE`/`UNKNOWN` with reason.

## 8. Builder sequence and local checks

### B1 — public data controls

- Create only four public JSON controls: corpus, oracle, renderer, run-manifest fixtures.
- Validate exact case/category/fact/prohibition/qualification counts manually and mechanically.
- Prove corpus contains no oracle role/status and no real/private/QA-only content.
- Prove C05 reference history length threshold without running a Host/model.

Stop on undefined cross-module manifest field, semantic ambiguity that needs a model, or need for an unlisted path.

### B2 — offline runner and tests

- Implement strict canonicalization/digest/render/scoring/manifest validation in the allowlisted `.mjs`.
- Add focused tests for positive replay, every invalid code, zero denominators, unknown/unobservable/unsupported,
  aggregate exclusion, unknown fact ids, oracle exposure, unequal-arm fields, digest/cutoff tamper, and cwd independence.
- Do not import or edit `src/evaluation.ts`; a focused test may import existing package-root/public functions only to
  prove the frozen estimator/parser receipt still matches.

### B3 — freeze and handoff

- Generate `freeze.json` through the runner's deterministic freeze command only after all public bytes are final.
- Run focused test, replay twice, `npm test`, `npm run build`, `git diff --check`, exact path allowlist, and prohibited
  file/content scans.
- Append exact Builder candidate parent/paths/checks/digests to the work order and write the handoff.
- Do not run any Host lane, model, network, install, deployment, or real-data operation.

## 9. Module QA route

Fresh independent Evaluation Module QA fixes the exact Builder candidate and writes a QA-only commit under the
repository convention; the expected repository path is `docs/qa/PH1-EVAL-FIXTURE-01.md` unless its own materialized
capsule narrows it further. QA does not edit Builder artifacts.

Minimum Module QA matrix:

1. exact parent/candidate/path allowlist and ordinary-file checks;
2. independent raw-byte/JCS/file/value/bundle/freeze SHA reconstruction;
3. independent six-case/category and complete id/oracle/cutoff reconstruction;
4. corpus/oracle physical separation, forbidden key/value scan, arm-neutrality semantic review, and no-private-data
   review;
5. renderer byte-for-byte and UTF-16 unit reconstruction for all cases, including C05 threshold;
6. positive replay from two fresh temporary directories and exact normalized-result SHA equality;
7. every frozen invalid control plus independent near misses for nested oracle leakage, digest substitution, omitted
   unknown status, changed retry identity, denominator-as-zero, invalid-as-failure, and cross-cell substitution;
8. focused/full tests, build, diff check, package/config/schema/Core no-drift checks;
9. explicit claim-ceiling and no scalar/billing/Host-completion audit.

Module QA verdict is `PASS` or `RETURN`. Builder/Owner cannot approve. A return goes to an append-only implementation
fix, then a fresh re-QA on the new exact candidate.

## 10. Submission QA route

Only governance Submission QA may authorize these public fixtures for later measured Host tasks. The controller must
materialize its exact task id, baseline, repository, report path, and allowlist; none is invented here.

Submission QA must independently bind at least:

- Core Builder candidate and Module-QA commit/verdict;
- fairness contract Git blob;
- corpus id/file/value SHA;
- oracle id/file/value SHA;
- renderer id/file/value SHA;
- run-manifest-fixture file/value SHA;
- offline-runner file SHA;
- freeze file SHA and fixture-bundle SHA;
- six exact case ids/category counts and `ALL_CASES` selection;
- claim ceiling and all open UNKNOWNs.

No measured Host run may start before that acceptance. Submission QA does not fill Host/version/runtime values or
upgrade candidate-roster evidence to official roster completion.

## 11. UNKNOWNs and CR decisions

| ID | State | Handling |
| --- | --- | --- |
| `UNKNOWN-01` supported Host roster | open | report candidate Hosts individually; whole-roster claim forbidden |
| `UNKNOWN-02` Host/run parameters | open | template uses invalid `REQUIRED_UNSET`; Host-lane Gate must freeze values |
| `UNKNOWN-03` future artifact digests | open until Builder | compute from final bytes, never invent |
| `UNKNOWN-04` final-input/provider-token observability | open | label estimates and preserve weakest boundary |
| `CR-01` evaluator v2/fairness mismatch | resolved by this plan | preserve v2; fixture-local vector validator, no public promotion |
| `CR-02` governance Submission-QA materialization | controller pending | required before measured use, not before docs Gate |
| `CR-03` semantic free-text/hidden/model/scalar/billing request | not authorized | requires a new accepted contract and task |

Any new cross-module contract, unlisted path, changed tokenizer, expanded corpus population, model-generated corpus,
private/hidden evidence, natural-language semantic inference, Host execution, or public API/package change stops this
work order and requires a new CR/Gate.
