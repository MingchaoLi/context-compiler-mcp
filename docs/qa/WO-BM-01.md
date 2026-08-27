# WO-BM-01 Independent QA

## 2026-08-27 — RETURN

- Candidate: `b006029cad4eaff5e92dbd39f06cc57ccadb6e87`
- Planning baseline: `d18e4d48717030f441f3a2e17e5c786cfa00c699`
- QA scope: `WO-BM-01 RippleContext Synthetic Long-Context Benchmark SPEC`
- Environment: Darwin 25.5.0 arm64; Node.js `v25.6.1`; npm `11.9.0`; Ajv `8.20.0`; ajv-formats `3.0.1`
- Verdict: **FAIL / RETURN TO IMPLEMENTATION / WORLD REMAINS UNAUTHORIZED**

This is a fresh Independent QA. Git and the fixed candidate were the only repository authority. Builder assertions in
the handoff were treated as claims to reproduce, not as conclusions. I did not read private conversations, QA-only or
hidden Gold, any downstream RippleContext benchmark dataset instance, or any database.

### Result matrix

| Requirement | Result | Independent evidence |
| --- | --- | --- |
| SPEC JSON and Schema | PASS | 12/12 JSON parsed. Eight/eight schemas declare Draft 2020-12, have a closed-world top-level object, and compile with Ajv strict mode plus formats. All nested schemas that declare `type: object` are also closed-world. A valid in-memory query-surface envelope passed; injecting sibling `expected_action` was rejected. |
| Plan/taxonomy/call counts | PASS | 40 chapters; target 260,000 characters; per-chapter theoretical min/max sums 220,000/300,000; separate aggregate acceptance band 220,000–290,000; 12 cutoff groups × 6 = 72 queries; 21 case families; 15 failure families; all failure references resolve and every case denominator is non-zero; 9 stages; 22 Sol; 40 initial Terra; 0 default repair; 0 default Luna; 28 low + 12 medium generation slots. |
| Base-rate arithmetic | PASS, but qualification-aware cost is FAIL | The declared `$16.98–$24.34`, `$21.225–$30.425`, `$4.64–$6.16`, and per-stage figures exactly reconstruct if every token is charged at the base per-million rates. That assumption is false for the declared high query-surfacing range; blocker B1 follows. |
| Query underdetermination and isolation | PARTIAL / FAIL | The brief shape now fixes subject/object, information-need kind and focus, as-of perspective, relationship direction, and output shape. The safe-envelope closed-world field allowlist excludes raw oracle/action/evidence/future/scoring/span fields, and the contract correctly leaves answer-neutrality and same-information-need fidelity to semantic review. However the promised brief/envelope/input hash reconstruction is not uniquely defined; blocker B2 follows. |
| Authority and cutoff flow | PASS | The normative flow is Event/timeline → evaluator-control Gold plus query-plan → chapter plans/corpus → surface map/base validation → answer-blind query surfacing. Corpus/query/validation cannot rewrite Event, Gold, or plan authority; query self-inclusion and cutoff-after visibility are forbidden; semantic defects require versioned regeneration. No reverse truth edge was found. |
| Surface attribution and fail-closed mapping | PARTIAL / FAIL | Dataset/corpus/mapping version, chapter/unit/path, document hash, exact/normalized text hashes, code-point half-open span, Event/semantic/query-plan IDs, diagnostic roles, generation call and non-authority provenance are present. Coverage requires zero unmapped required Events/semantic units and missing mapping forbids layer attribution. The normalized hash is nevertheless not reproducible from this contract; blocker B2 follows. |
| Continuity and repair | FAIL / PASS | Repair policy passes: one initial plus at most one mechanical repair, original output permanently invalid/ineligible, no candidate selection, diagnostics/input/output linkage required by ledger/validator, second failure stops, and semantic error requires a new corpus version and dependent regeneration. Continuity does not enforce its claimed opaque-future boundary; blocker B3 follows. |
| Gold/audit/Full Context qualification | PASS with one consistency correction requested | Gold is explicitly `EVALUATOR_CONTROL_GOLD`, `independent_hidden_holdout:false`; Sol audit is Builder-side consistency only; default Full Context is deterministic token counting; Terra calibration is separate and non-qualifying; the final four-condition Sol campaign is separate and post-freeze; evaluation records/cost are excluded from the generation manifest/total. `gold.schema.json` enumerates only four prohibited reader classes even though QUERY_SURFACING separately forbids reading Gold; make that local reader list consistent when fixing the returned contract. |
| Candidate scope and cleanliness | PASS | The baseline→candidate diff changes only three governance docs, this benchmark SPEC/handoff/work order, and the 12 files under `evaluation/ripplecontext-long-v1/spec/`. There is no file below `evaluation/ripplecontext-long-v1/` outside `spec/`; no WORLD/Event/Gold/query-plan/query/corpus/model-answer/evaluator-run instance exists; no Core source, retrieval, State, MCP, database, package/lockfile, test, or frozen evaluation changed. `git diff --check` passes. |

### Blocking findings

#### B1 — Query-surfacing high cost omits the official >272K-token price tier

Fact: `cost-plan.json` uses Sol `$4` input / `$20` output for the entire 12-call query-surfacing range and declares
3.2M high input tokens, 30K high billed output tokens, `$13.40` for that stage, and `$24.34` for the default total.
The official GPT-5.6 Sol model page accessed on 2026-08-27 states that requests with more than 272K input tokens are
charged at 2× input and 1.5× output for the full request:
<https://developers.openai.com/api/docs/models/gpt-5.6-sol>.

Minimal reproduction from the committed plans:

```text
high visible-prefix tokens = cutoff chapter × 6,500 target characters × 1.3 tokens/character
QCG-08..12 (CH034, CH036, CH038, CH039, CH040)
= 287,300; 304,200; 321,100; 329,550; 338,000 tokens
```

These five calls exceed 272K before prompt and safe-envelope overhead. Applying only the extra 1× input charge to
those visible prefixes adds at least `$6.3206`; this deliberately ignores their 1.5× output surcharge and therefore
is a lower bound. The declared query-surfacing high cost must be at least `$19.7206`, the declared total high must be
at least `$30.6606`, and its 25% reserve must be at least `$38.32575`, before adding the omitted output surcharge.
Thus the base-rate arithmetic is internally consistent but the claimed public list-price range is not.

Required bounded fix: cost each cutoff-group request separately under the price tier in force at the versioned access
date, include prompt/envelope overhead before threshold classification, apply the output multiplier to affected calls,
and update cost totals, reserve, SPEC prose, state/roadmap summary, and handoff. Keep calibration/final-evaluation cost
separate.

#### B2 — Canonical, normalized, and call-input hashes are not uniquely reconstructible

Fact: the contract requires reconstruction of brief, plan, safe-envelope, prefix and call-input hashes, and requires
reproduction of `normalized_surface_label_sha256` and `normalized_text_sha256`. It defines only
`UTF-8_STABLE_KEY_ORDER_LF`, never selects a complete canonical JSON algorithm, never defines the Unicode/text
normalization algorithm or its version, and names `PROMPT_PLUS_SAFE_ENVELOPE_PLUS_VISIBLE_PREFIX_V1` without defining
the exact request/message byte framing. Section 8 even describes the reconstructed call bytes as prompt-template
*hash* plus envelope bytes plus prefix bytes, which is not an exact serialization of the actual model request.

Minimal counterexamples:

```text
{"surface_label":"甲"}\n
{"surface_label":"\u7532"}\n
```

Both parse to the same JSON value, use UTF-8, one stable key and LF, but their SHA-256 values are respectively
`ac378ec5c070c452d295092807309df865cbcb7ebc6fce1751cc174c2d4d7c2e` and
`2ebc71c7a48f17f9cdae9524bd03d00bdf5a56751d093a4a5bb37ff696a9123f`.

Likewise, normalizing full-width `Ａ` with NFC leaves `Ａ`, while NFKC produces `A`; the resulting SHA-256 values are
`3075754175ec49df8c22100b30492f82cc292199f9d349cf43b1cb4c48a16f88` and
`559aead08264d5795d3909718cdd05abd49572e84fe55590eef31a88a08fdffd`.

Required bounded fix: select and version an exact canonical JSON serialization (for example RFC 8785/JCS plus an
explicit final-newline rule), select and version the exact text normalization pipeline, and define the complete
query-surface request payload/framing whose bytes are hashed. Bind those algorithms/versions and the prompt-template
file/hash in schema/manifest. Then state precisely which raw bytes each SHA-256 covers.

#### B3 — Continuity Schema accepts future payload while self-attesting that none exists

Fact: `future_negative_constraints.generation_safe_prohibitions` is an unrestricted array of non-empty strings, while
`contains_future_event_payload` is merely `const:false`. No deterministic projection, structured prohibition enum,
payload comparison rule, or complete semantic audit coverage is defined. Therefore a bundle can carry a future plan or
answer-bearing future fact in the supposedly safe field and still validate.

Minimal reproduction: an otherwise minimal valid continuity fixture using

```json
{
  "opaque_future_event_ids": ["EV-000999"],
  "generation_safe_prohibitions": [
    "EV-000999 将在 CH040 发生：负责人辞职；本章不得提前写出这一未来事实。"
  ],
  "contains_future_event_payload": false
}
```

was accepted by the committed Schema under the same Ajv strict + formats configuration. This is not merely the
acknowledged semantic limitation of `query_surface_brief`: the continuity contract affirmatively calls the data opaque
and future-payload-free, yet supplies neither a mechanical proof path nor an explicit exhaustive semantic-review gate.

Required bounded fix: replace the free text with a deterministic closed-world projection (opaque Event IDs plus
enumerated prohibition codes and cutoff-safe structured operands), hash that projection, and fail closed on any
non-allowlisted field/content. If natural language is unavoidable, specify exhaustive independent semantic review and
do not claim the boundary is mechanically proved.

### Passed adversarial checks and remaining limits

- A safe-envelope instance containing only identity/prefix metadata and `{query_id, query_surface_brief, brief_hash}`
  validated; the same object with injected sibling `expected_action` failed closed.
- Free-text `focus_description` can still contain an answer/current-truth assertion while setting
  `answer_neutral:true`; Ajv accepts that by design. This is not an additional blocker because the SPEC explicitly says
  it is not mechanically provable and requires Builder semantic audit plus Independent QA. No actual brief/query exists
  yet, so semantic neutrality and same-information-need fidelity remain untested.
- No actual surface map, context packet, formation output, answer input or answer exists. The IDs/roles are adequate for
  future attribution, but actual retrieval-vs-formation-vs-answer attribution remains untested and prohibited until a
  valid frozen map and evaluator-run contract exist.
- `gold.schema.json` should include `ANSWER_BLIND_QUERY_SURFACE_MODEL` in its exact prohibited-reader list, matching the
  stage/query-plan prohibition. The current stage boundary still forbids the read, so this inconsistency did not create
  a fourth independent RETURN basis.
- `npm test` and `npm run build` were not run because the candidate is docs/SPEC-only and changes no source; AGENTS.md
  requires them for source changes. All work-order mechanical checks relevant to this candidate were run.

### Disposition

Do not enter WORLD, GOLD, GENERATION, SURFACE_MAPPING_BASE_VALIDATION, or QUERY_SURFACING. Preserve this QA report and
the Builder candidate append-only. Return B1–B3 to the implementation branch for a new source/spec fix commit, then use
a fresh Independent re-QA on the fixed candidate.

## 2026-08-27 — Fresh Independent re-QA — RETURN

- Frozen candidate: `f1b183e309ae3c1ac502d6b0eca704f9f9c4d5c0`
- Candidate parent / returned Builder candidate: `b006029cad4eaff5e92dbd39f06cc57ccadb6e87`
- Prior Independent QA return: `23d1cd4a66122043379008216b04520e47378de3`
- Planning baseline: `d18e4d48717030f441f3a2e17e5c786cfa00c699`
- Environment: macOS `26.5.1`; Darwin `25.5.0` arm64; Node.js `v25.6.1` (Unicode `17.0`);
  npm `11.9.0`; jq `1.7.1-apple`; Ajv `8.20.0`; ajv-formats `3.0.1`
- Verdict: **RETURN**
- Authorization: **WORLD, GOLD, GENERATION, SURFACE_MAPPING_BASE_VALIDATION, QUERY_SURFACING, model calls, and
  downstream asset generation remain unauthorized.**

This was a fresh verification from the fixed Git candidate. The original candidate and prior QA report were used only
to identify the returned failure family. Builder handoff claims were re-run mechanically. I read only the repository
governance files required by AGENTS.md and the current WO-BM-01 work order, SPEC, 12 SPEC JSON/Schema files, handoff,
and prior QA report. I did not read a downstream dataset, private conversation, production source, or frozen evaluation
payload. No model was called and no WORLD/Event/Gold/query-plan/query/timeline/corpus/answer/evaluator artifact was
created.

### Result matrix

| Requirement | Result | Fresh evidence |
| --- | --- | --- |
| B1 long-context price rule | PASS | All 12 requests were re-priced independently. Low inputs are all at or below 272K. High QCG-08–QCG-12 are above 272K and use 2× input plus 1.5× output for the entire request. Query surfacing is `$9.16–$21.551`; default generation is `$16.98–$32.491`; 25% reserve is `$21.225–$40.61375`. |
| Price/model freeze and fallback | PASS | The committed assumption fixes access date `2026-08-27`, exact model IDs and rates, request-level threshold/scope/multipliers, and no cached-input discount in the plan. Stage policy forbids automatic Terra/Luna→Sol upgrade, best-of, hidden retry, and unrecorded fallback; unavailable stages stop and report. |
| B2 canonicalization, normalization, framing | PASS at SPEC contract level | RFC 8785 JCS value bytes, JSON/JSONL final-LF file bytes, strict UTF-8, Unicode 17.0.0 NFKC/newline normalization, exact-span bytes, visible-prefix bytes, and exact tagged/uint64 frame boundaries are separately named. Independent fixtures canonicalized equivalent JSON spellings identically, distinguished different values, normalized CRLF/CR + full-width A, decoded all four request-frame segments byte-for-byte, and changed the full-frame SHA when an envelope value changed. |
| B3 closed future-constraint projection | PASS for the returned narrow subtree; **RETURN for the whole continuity boundary** | A valid opaque Event-ID + three-enum-rule projection passes. Injecting a `future_fact` field into either the projection or a rule fails Schema. A fresh cross-field counterexample nevertheless validates: the same `EV-000999` is simultaneously listed as opaque future and used by `local_entity_state.source_event_ids` as current continuity input. Blocking finding R1 follows. |
| Gold/query-surface reader policy | PASS | `gold.schema.json` requires a unique exact five-member enum set and includes `ANSWER_BLIND_QUERY_SURFACE_MODEL`. Query-plan uses the same exact reader set. |
| Schema and closed-world shape | PASS | 12/12 SPEC JSON parsed. Eight/eight schemas declare Draft 2020-12, compile in Ajv strict mode with formats, have closed-world top-level objects, and every nested schema declaring `type: object` is also closed-world. Valid safe envelope passes; injected sibling `expected_action` and brief-level `current_truth` fail. |
| Taxonomy and bounded plan | PASS | 21 case families, 15 failure families, all references resolved, non-zero case denominators; 40 chapters; 260,000 target characters; 220,000/300,000 summed chapter bounds and separate 220,000–290,000 corpus acceptance band; 10 long-range slots with gaps ≥12; 12 groups × 6 = 72 queries; 28 low + 12 medium Terra slots. |
| Stages, authority, repair, and fallback | PASS | Nine ordinals are exact. GOLD precedes GENERATION; surface mapping/base validation precedes query surfacing. Gold/query-plan are pre-corpus while final query text is not. Repair is one initial plus at most one mechanical repair, failed output is ineligible, selection is forbidden, semantic defects require fresh dependent regeneration, and declared fallbacks stop/report. |
| Relation/evidence/coverage contracts | PASS at shape/ownership level | Relation endpoints are closed typed `ref_type/ref_id` objects; required/forbidden evidence records are closed and carry semantic-unit/usage bindings; manifest coverage fixes unmapped required Events and semantic units to zero. Cross-file resolution/direction/lifecycle remain future validator work because no instances exist. |
| Scope and cleanliness | PASS | Baseline→candidate changes only governance/SPEC/handoff/work-order and the 12 files under `evaluation/ripplecontext-long-v1/spec/`. No `src/`, test, package/lockfile, database, existing frozen evaluation, or downstream dataset file changed. Candidate contains exactly the 12 SPEC files below the benchmark evaluation root. Both candidate and QA working diff checks pass. |

### R1 — Continuity admits a mechanically self-contradictory future Event as current structured input

Fact: `continuity-bundle.schema.json` closes the new `future_negative_constraints.projection` subtree, but the
bundle has no explicit visible-through Event/stream boundary and no cross-field rule requiring every State, Relation,
open-thread, prior-summary, and snippet source to be cutoff-visible and disjoint from
`opaque_future_event_ids`. In particular, `local_entity_state[].source_event_ids` accepts any syntactically valid
`EV-*`.

Fresh minimal attack:

1. Construct a valid bundle whose closed future projection contains `opaque_future_event_ids:
   ["EV-000999"]` and the required three generic prohibition codes.
2. Add a closed, otherwise valid local State item with `source_event_ids: ["EV-000999"]`.
3. Validate with the same Ajv Draft 2020-12 strict + formats configuration.

Result: Schema validation succeeds. This is not a prose-neutrality judgment: one structured Event ID is simultaneously
classified future and admitted as current continuity evidence. The committed SPEC precisely defines projection
derivation/equality inside the future subtree, but it does not state the required disjointness/as-of reconstruction
invariant elsewhere. The generic phrase “future leakage” cannot mechanically determine the bundle cutoff or prove that
the other structured inputs are current. Free-text `snapshot_text`, relation `current_state`, open-thread
`safe_summary`, and `necessary_prior_summary.text` are also not bound to an exact cutoff-derived projection, but the
structured Event-ID contradiction alone is sufficient for RETURN.

Required bounded fix:

- add an explicit generation-input visible-through Event/stream/corpus-unit boundary to every continuity bundle;
- require every source Event referenced by local State, Relation snapshot, open-thread ledger, prior summary, and prior
  snippet to resolve at or before that boundary;
- require those source sets to be disjoint from the deterministic opaque future Event set, and define exact
  reconstruction/equality rules for current snapshot content or its hash-bound source projection;
- add deterministic positive and negative fixtures, including the same-Event-in-future-and-current attack; and
- keep the future-projection subtree closed and payload-free. Do not replace the rule with a Boolean self-attestation or
  a prose-only audit.

### Commands and exact evidence

Temporary dependencies were installed outside the repository:

```text
npm install --prefix /private/tmp/wo-bm-01-reqa-ajv-f1b183e --no-save --ignore-scripts \
  ajv@8.20.0 ajv-formats@3.0.1
```

Fresh deterministic QA command:

```text
WO_BM01_AJV_ROOT=/private/tmp/wo-bm-01-reqa-ajv-f1b183e \
  node docs/qa/fixtures/wo-bm-01-fresh-reqa.mjs
```

It intentionally exits `1` after completing all positive checks and reproducing R1. Its terminal evidence is:

```text
json_parsed: 12
schemas_strict_compiled: 8
nested_object_schemas_closed: true
case_families/failure_families: 21/15
chapters/target/cutoff_groups/queries/stages: 40/260000/12/72/9
calls: Sol 22; Terra initial 40; repair default 0; Luna default 0
query surface cost: 9.16 / 21.551000000000002
default total: 16.98 / 32.491
reserve: 21.225 / 40.61375
runtime_unicode_version: 17.0
structured_future_source_event_accepted_by_continuity_schema: true
BLOCKER: continuity Schema accepts EV-000999 simultaneously as opaque future and current local_entity_state source
```

Additional commands:

```text
for f in evaluation/ripplecontext-long-v1/spec/*.json \
  evaluation/ripplecontext-long-v1/spec/schemas/*.json; do jq empty "$f" || exit 1; done

git diff --check d18e4d48717030f441f3a2e17e5c786cfa00c699..f1b183e309ae3c1ac502d6b0eca704f9f9c4d5c0
git diff --check
git diff --name-only d18e4d48717030f441f3a2e17e5c786cfa00c699..f1b183e309ae3c1ac502d6b0eca704f9f9c4d5c0
git ls-tree -r --name-only f1b183e309ae3c1ac502d6b0eca704f9f9c4d5c0 evaluation/ripplecontext-long-v1
```

All parse/diff/scope commands pass. The QA script contains the exact independent price arithmetic, JCS/NFKC/frame
fixtures, reader-set checks, schema compilation, plan counts, and structured leakage attack.

### Unproved scope

- No actual WORLD/Event/Gold/query-plan/query/timeline/corpus/surface map/attempt/evaluator asset exists. Actual semantic
  answer-neutrality, same-information-need fidelity, relation resolution/direction, required/forbidden evidence
  visibility, surface coverage, chapter continuity quality, repair eligibility, and model behavior therefore remain
  untested.
- The runtime declares Unicode 17.0 and the focused normalization fixture passed. The future required frozen full
  Unicode conformance suite and cross-runtime replay do not exist in this SPEC candidate and were not claimed.
- RFC 8785 is normatively selected and focused independent fixtures passed; exhaustive numeric/string RFC conformance
  remains a future pre-instance validator fixture.
- Price arithmetic was checked only against the repository-frozen `2026-08-27` assumption, as required by the
  repository/Git-only authority rule. No live pricing, model availability, billing, latency, or subscription behavior
  was queried.
- There is no downstream deterministic validator implementation in the routed SPEC-only scope. The QA-only script
  mechanically checks the present contracts and demonstrates the missing continuity invariant.
- `npm test` and `npm run build` were not run because candidate and QA delta contain no production source; AGENTS.md
  requires them for source changes. Windows and exact Node.js 24 were not rerun.

### Disposition

**RETURN.** Preserve the fixed candidate and this report append-only. R1 must be closed by a new bounded SPEC/Schema fix
candidate and verified by another fresh Independent re-QA. WORLD and all downstream/model stages remain unauthorized.
