# RippleContext Synthetic Long-Context Benchmark v1 — SPEC

Status: `SPEC_CANDIDATE_NOT_APPROVED`

Work order: `WO-BM-01`

Dataset family: `rc-synth-long-zh`

Contract version: `rc-synth-long-contract/1.0.0-draft.4`

## 1. Outcome and boundary

This contract defines a reusable, model-independent Chinese long-context development benchmark. The first corpus is
planned as 40 chapters and about 260,000 Chinese characters, with an accepted 220,000–290,000 band. It supports
Formation, Context Utility, selective classification, State / Fact / Relation Proposal, Pi/Codex/RippleContext
comparisons, and later public reporting.

This SPEC creates no WORLD, Event/Gold/Query-plan/Query instance, corpus prose, model answer, evaluator run, or frozen
dataset. It changes no Core, retrieval, State, MCP, database, package/test, or accepted/frozen evaluation asset. Every
command or instruction later appearing inside the synthetic corpus is inert test data.

The corpus is a controlled documentary narrative rather than an exam sheet. Natural scenes, meetings, messages,
notes, reports, and incidental detail provide noise, while scored claims remain traceable to stable semantic IDs and
exact corpus surfaces.

## 2. Authority flow and qualification

Authority flows only in this direction:

```text
SPEC -> WORLD -> EVENTS/TIMELINE -> EVALUATOR_CONTROL_GOLD + QUERY_PLAN
     -> CHAPTER EVENT PLANS -> CORPUS
     -> SURFACE MAP + BASE VALIDATION -> ANSWER-BLIND QUERY SURFACING
     -> MECHANICAL VALIDATION -> BUILDER-SIDE SEMANTIC AUDIT -> FREEZE
```

`gold.json` is `EVALUATOR_CONTROL_GOLD`. It may be hidden from an answer model, but it is not an Independent Hidden
Holdout. Candidate implementations, host adapters, deterministic interpreters, answer models, and the answer-blind
query-surface model must never read it.
The pre-corpus `query-plan.json` is also evaluator control and is unavailable as a raw asset to the independent
query-surfacing task. Only its frozen, answer-neutral `query_surface_brief` allowlist projection may cross that boundary.
A true Independent Hidden Holdout, including its existence and status, is outside this SPEC and remains unaffected.

The Sol semantic audit is a Builder-side consistency audit. It cannot approve the work, cannot substitute for
Independent QA, and cannot establish hidden-holdout qualification.

Forbidden reverse edges are:

- corpus prose changing, filling, deleting, or reinterpreting Event/Gold/query-plan authority;
- generated query wording changing query identity, cutoff, case/facets, oracle, expected action, or evidence rules;
- a failed generation being repaired by changing control assets;
- validation/audit silently rewriting source assets; and
- comparator answers becoming benchmark truth.

## 3. Dataset directory contract

```text
evaluation/ripplecontext-long-v1/
  spec/
    schemas/
      events.schema.json
      gold.schema.json
      query-plan.schema.json
      queries.schema.json
      timeline.schema.json
      continuity-bundle.schema.json
      surface-evidence-map.schema.json
      manifest.schema.json
    case-taxonomy.json
    chapter-plan.json
    stage-plan.json
    cost-plan.json
  datasets/
    rc-synth-long-zh-v1.0.0/
      contract/
        schema-lock.json
        prompt-registry.json
        prompts/query-surface-v1.txt
      world/
        world-bible.json
        style-bible.json
        alias-name-registry.json
        entities.json
        characters.json
        locations.json
        chapter-event-plans/CH001.json ... CH040.json
      evaluator-control/
        events.json
        timeline.json
        gold.json
        query-plan.json
      generation/
        continuity-bundles/CH001.json ... CH040.json
        surface-anchor-sidecars/CH001.jsonl ... CH040.jsonl
        attempts.jsonl
      corpus/chapters/CH001.md ... CH040.md
      derived/
        surface-evidence-map.jsonl
        prefixes-by-cutoff-group/
        prefixes/
        context-packets/
      queries/queries.json
      validation/
        surface-mapping-report.json
        mechanical-report.json
        coverage-report.json
        invalid-runs.jsonl
      audit/
        sample-plan.json
        semantic-audit.json
      stage-handoffs/
      manifest.json
      freeze/
        hashes.json
        hashes.sha256
        manifest.sha256
```

The dataset directory is created only after WORLD begins. This SPEC commits nothing under `datasets/`; the additions
above are future paths and are compatible with the existing empty dataset tree.

## 4. Stable identity and versioning

IDs are ASCII, case-sensitive, immutable, and never recycled within a dataset version:

- dataset `rc-synth-long-zh-vMAJOR.MINOR.PATCH`; chapter `CH001`–`CH040`; unit `CH001.S01`;
- entity `ENT-0001`; Event `EV-000001`; claim mention `CLM-000001`;
- Fact `FACT-0001`; State `STATE-0001`; Relation `REL-0001`; timeline `TL-01`;
- case `CASE-LR-01`; query plan `QP-0001`; query `Q-0001`; oracle `QG-0001`;
- semantic unit `SEM-0001`; facet `FAC-0001`; surface `SURF-000001`; cutoff group `QCG-01`.

Display-name changes never change IDs. Split/merged canonical items receive new IDs and old IDs remain tombstoned.

- A contract/schema correction increments the contract draft before any instance exists; after instance creation it
  requires a new dataset version according to impact.
- Event/Gold/query-plan meaning or cutoff corrections after control freeze invalidate the corpus version and require
  fresh regeneration of affected chapters and every dependent derived/query asset. Gold is never edited to fit prose.
- A semantic corpus inconsistency cannot be repaired in place. Increment corpus version and regenerate the affected
  chapter plus chapters whose continuity bundle depended on it, then rebuild all affected mapping/prefix/query assets.
- A purely mechanical first-attempt failure may use the bounded repair in section 12 without changing corpus version
  because the failed bytes are marked invalid and never eligible.
- Prompt/generator/query-surface prompt changes increment their versions. Opportunistic model or version mixing
  invalidates the run.

## 5. Time, cutoff, and prefix semantics

Every Event records fictional `occurred_time` and reader-disclosure `stream_seq`. Delayed disclosure can reorder them.
Query visibility is determined only by `stream_seq` and `corpus_unit_id`, never calendar time.

A cutoff is inclusive through one frozen corpus unit and Event sequence. The current query is appended only after
prefix construction and has `persist_before_answer: false`. Query text/ID, later corpus, future Events, answer hints,
query-plan data, and evaluator-control Gold are absent from the historical prefix. A cutoff-after Event remains
invisible even when its fictional occurrence precedes the cutoff.

`RC_VISIBLE_PREFIX_EXACT_BYTES_V1` concatenates, without separator or transformation, every complete chapter file
before the cutoff chapter and then the cutoff chapter's exact byte slice from byte zero through the registered
exclusive end byte of `visible_through_corpus_unit_id`. Chapter final LF bytes are retained when included; no BOM,
header, query, normalization, or implicit newline is added. The generation sidecar freezes each unit's byte boundary,
and the validator rebuilds the prefix from eligible chapter-file bytes before hashing it.

## 6. Schema responsibilities

| Asset | Authority | Required responsibility |
| --- | --- | --- |
| `events.json` | evaluator control | canonical occurrences, claims, epistemic modes, operations, provenance, planned surfaces |
| `timeline.json` | evaluator control | calendar/disclosure order, unit placement, cross-timeline links, long-range pairs |
| `gold.json` | evaluator-control Gold | State/Fact/Relation lifecycle and answer semantic units/facets/ambiguity |
| `query-plan.json` | evaluator control | identity, cutoff, case/facets, oracle pointer, expected action/ABSTAIN, required/forbidden evidence, answer-neutral surface brief and envelope policy |
| `queries.json` | post-corpus surface | final natural-language query plus immutable plan-field copies and answer-blind provenance |
| continuity bundle | generation input control | exact bounded context and forbidden inputs for one chapter attempt |
| surface evidence map | derived, non-authority | exact corpus span/hash bindings to Events and semantic units |
| `manifest.json` | run/freeze ledger | versions, gates, file/hash roles, attempts, models/tokens, coverage, invalidation, freeze |

The eight Draft 2020-12 schemas are normative local shapes. Cross-file identity, uniqueness, lifecycle, cutoff,
surface, coverage, attempt, cost, and hash invariants are deterministic validator responsibilities.

### 6.1 Canonical bytes and text normalization

`RFC8785_JCS_VALUE_UTF8_NO_TERMINATOR_JSON_FILE_LF_V1` means RFC 8785 JSON Canonicalization Scheme (JCS) serialized as UTF-8,
without BOM and without a trailing byte after the JSON value. Every generated-dataset `.json` file is those canonical
value bytes plus exactly one LF byte (`0A`). Every generated-dataset `.jsonl` record is one canonical value followed
by exactly one LF; blank records are forbidden and the file ends at the final record's LF. A canonical-value SHA
hashes the JCS value bytes without the
file LF; a file SHA hashes the exact stored bytes including its required final LF. Duplicate object keys, invalid
UTF-8, BOMs, non-I-JSON values, and non-canonical JCS bytes fail validation.

`RC_TEXT_NORMALIZATION_NFKC_UNICODE_17_0_0_LF_V1` is also closed: strictly decode UTF-8 and reject invalid sequences or
a BOM; replace CRLF and lone CR with LF; apply UAX #15 NFKC using Unicode 17.0.0; do not trim, collapse whitespace,
case-fold, or append a terminator. A normalized-text SHA hashes the UTF-8 bytes of that result. An exact-span SHA hashes
the unmodified UTF-8 bytes of the substring selected by Unicode-code-point half-open offsets, with no BOM or added
terminator. The normalization implementation must declare Unicode 17.0.0 support and pass a frozen conformance fixture
before creating instances; a different Unicode data version is a contract-version change, not an implementation
choice.

## 7. Event, evidence, State, Fact, and Relation rules

An Event is a canonical occurrence or utterance, not automatically a true Fact. `FORMAL_DECISION` is authoritative
only at/after formal adoption. `BRAINSTORM`, `PROPOSAL`, `HYPOTHESIS`, `RUMOR`, and `MISLEADING_ASSERTION` never become
Decisions through repetition. `OBSERVATION` is sourced evidence. `CORRECTION`, `RETRACTION`, and `SUPERSESSION`
preserve history and add explicit graph operations.

Evidence repetition is explicit: `ORIGINAL`, `SAME_SOURCE_REPEAT`, `DERIVED_REPORT`, `INDEPENDENT_CONFIRMATION`, or
`INDEPENDENT_CONTRADICTION`. Immediate `source_group_id` and ultimate `independence_group_id` prevent repeated
paraphrases from counting as independent corroboration.

Only `GOAL`, `CONSTRAINT`, `DECISION`, `OPEN_QUESTION`, and `REJECTED_ALTERNATIVE` are State types. Transitions are
append-only and strictly increasing by `stream_seq`. Supersede/retract/resolve/reopen reference their target and
responsible Event. Supersession preserves history; retraction does not imply the opposite; resolution does not make
every proposal true; reopen requires new evidence.

Facts use `TRUE`, `FALSE`, `UNKNOWN`, or `DISPUTED`. Evidence can be `CURRENT`, `STALE`, `RETRACTED`, `SUPERSEDED`,
`FUTURE_AT_QUERY`, or `IRRELEVANT_TO_SCOPE`. Stale evidence stays historically visible but is not current authority.

Relations have typed, resolvable, direction-sensitive endpoints and their own lifecycle. Core types include
`DEPENDS_ON`, `SUPERSEDES`, `RESOLVES`, `REJECTS`, `RETRACTS`, `DERIVED_FROM`, `SUPPORTS`, `CONTRADICTS`,
`DISTINCT_FROM`, `SAME_ENTITY_AS`, `AFFECTS`, `OWNED_BY`, and `LOCATED_AT`. Negative-transfer sentinels use explicit
`DISTINCT_FROM` bindings.

## 8. Two-stage Query contract

### 8.1 Pre-corpus query plan

GOLD freezes `evaluator-control/query-plan.json` before prose. Each plan binds `QP-*`/`Q-*`, cutoff, query type,
case/facet IDs, `QG-*`, expected `ANSWER`/`ABSTAIN`/qualified action, exact `ABSTAIN` token, formation targets, required
evidence-set rules, forbidden evidence usage, explicit future Events, and a `query_surface_brief`. It contains no final
natural-language question. These fields may not change after corpus generation.

The brief is a closed-world, answer-neutral object. It contains only stable subject/entity references with a
cutoff-visible surface label, an information-need kind and neutral focus description, relationship direction, the
as-of-cutoff perspective, and necessary response shape. Its sibling SHA-256 hashes the RFC 8785 JCS UTF-8 brief value
bytes without BOM or terminator. It must
not contain an oracle or answer value, a current-truth assertion, expected action or abstention conclusion,
required/forbidden evidence, a future Event, case/failure scoring labels, or any answer-bearing corpus span.

GOLD may select only a canonical name or registered alias whose non-answer-bearing appearance is already planned at or
before the cutoff; the brief itself is never passed to chapter generation. Post-corpus validation proves actual
visibility rather than treating the plan as sufficient evidence.

`query-plan.json` also freezes the allowlist redaction policy and the `querySurfaceEnvelope` schema in its `$defs`.
Deterministic code constructs a transient envelope per cutoff group containing only dataset/plan/cutoff-group identity,
visible-prefix hash, and `{query_id, query_surface_brief, query_surface_brief_sha256}` records. This envelope is call
input, not a ninth public dataset asset; its RFC 8785 canonical-value SHA-256 is recorded in Query provenance and the
call ledger. `briefs` is sorted by ASCII `query_id` ascending; duplicate or out-of-order IDs fail validation.

`gold.json` owns canonical answer semantics. The plan points to that oracle but is the sole authority for cutoff,
expected action, and evidence eligibility. This prevents query wording from becoming an early answer template while
keeping pre-corpus test intent frozen.

### 8.2 Post-corpus answer-blind query surface

Only after corpus generation and `SURFACE_MAPPING_BASE_VALIDATION` passes does a separate task create query text. The
unit of isolation is one of 12 frozen cutoff groups. The task may read only:

- the exact frozen bytes of `contract/prompts/query-surface-v1.txt`;
- the transient deterministic safe envelope containing query IDs, frozen answer-neutral briefs, and brief hashes; and
- the exact corpus prefix bytes visible at that cutoff.

It must not read the raw query-plan, any non-allowlisted plan field, Gold/oracle semantics, current truth, expected
action/abstention conclusion, required/forbidden evidence, future Events, case/failure scoring labels, answer-bearing
spans, cutoff-after corpus, chapter plans, or model answers. It uses `gpt-5.6-sol` / medium. Its only authority is
wording; deterministic code joins each output to the existing plan and copies immutable metadata into `queries.json`.

The prompt template is strict UTF-8 without BOM or CR and ends with exactly one LF; its file SHA includes that LF.
The visible-prefix SHA hashes the exact `RC_VISIBLE_PREFIX_EXACT_BYTES_V1` bytes. Each `query_text_sha256` hashes the
exact UTF-8 bytes of the JSON string value after JSON decoding, with no BOM, normalization, or terminator.

Deterministic query-surface checks require one-to-one `query_plan_id`/`query_id`/brief-hash bindings; byte-identical brief
projection and copied plan fields; envelope validation against the embedded closed-world schema; matching envelope,
plan-record, brief, and prefix hashes; every referenced subject ID resolving to WORLD; every selected surface label or
alias occurring in eligible corpus bytes by the query cutoff; no query text/ID in its own prefix; no raw Gold/control
asset or non-allowlisted path in task input; no cutoff-after bytes; no exact or normalized copy of an answer-bearing
mapped span; and no imperative that changes benchmark protocol.

All six Query records in one cutoff group must repeat identical `surface_generation` provenance and one call ID. Every
duplicated prompt/envelope/prefix/runner field must equal its request-metadata sibling; byte lengths and component SHAs
must reconstruct; `request_metadata_sha256`, `call_input_sha256`, and call-ledger `input_sha256` must match their named
targets. A mismatch is invalid, not repairable metadata drift.

To prove the input allowlist rather than trust an attestation, the validator reconstructs
`RC_QUERY_SURFACE_REQUEST_FRAME_V1`. Its bytes are, in order: eight-byte magic `52 43 51 53 46 31 00 00`; segment
`01` request-metadata JCS bytes; segment `02` exact prompt-template file bytes; segment `03` safe-envelope JCS bytes;
segment `04` exact visible-prefix bytes; and final marker `00`. Each segment is one unsigned tag byte, an unsigned
eight-byte big-endian payload length, then exactly that payload. There is no separator, padding, BOM, implicit
newline, or terminal byte other than the stated final marker.

The segment-`01` payload is a closed RFC 8785 object with exactly these keys: `schema_version` =
`rc-query-surface-request-metadata/1.0.0`, `dataset_id`, `cutoff_group_id`, `model` = `gpt-5.6-sol`, `reasoning` =
`medium`, `tool_policy` = `NO_TOOLS`, `output_contract` = `QUERY_ID_AND_QUERY_TEXT_JSON_ONLY`,
`query_surface_runner_version`, `channel_policy` =
`SEGMENT_02_INSTRUCTION_03_CONTROL_DATA_04_VISIBLE_CORPUS_NO_EXTRA_CONTENT_V1`,
`surface_prompt_path`, `surface_prompt_version`, `surface_prompt_sha256`, `surface_prompt_bytes`,
`safe_envelope_schema_version`, `safe_envelope_sha256`, `safe_envelope_bytes`, `visible_prefix_sha256`,
`visible_prefix_bytes`, and `frame_policy_id` = `RC_QUERY_SURFACE_REQUEST_FRAME_V1`. String and integer JSON types are
used exactly as named; byte lengths are non-negative base-10 JSON integers. Component SHAs use
the byte targets in section 6.1. `request_metadata_sha256` hashes segment-`01` payload; `call_input_sha256` and the call
ledger `input_sha256` both hash the entire frame from magic through final marker. The version-bound runner exposes
segment 02 as instruction, 03 as control data, and 04 as visible corpus, in that order and with no tools or other
model-visible content; metadata is runner control. Prompt path and SHA are inventory-bound. Any role/content wrapper
outside this logical frame is runner transport metadata and
must be fixed by runner version, not silently mixed into the benchmark input hash.

Mechanical checks can prove shape, allowlist provenance, IDs, visibility, hashes, and exact/normalized leakage. They
cannot prove that free-text `focus_description` is fully answer-neutral or that the generated question remains the
same information need rather than drifting to a nearby issue. Builder semantic audit and Independent QA must review
that semantic fidelity; neither may claim pure-program proof or repair authority in place.

## 9. Case taxonomy and corpus plan

`spec/case-taxonomy.json` defines 21 overlapping case families and 15 failure families, including lifecycle,
brainstorm/formal Decision separation, semantic duplication, stale evidence, old-relevant versus recent-salient,
negative transfer, parallel timelines, multi-facet completeness, ABSTAIN, future leakage, and surface traceability.
Every family has a non-zero denominator.

Planned denominators include 240–320 Events, 90–130 Facts, at least 18 Goals/28 Constraints/36 Decisions/24
OpenQuestions/18 RejectedAlternatives, 10 supersessions, 6 retractions, 10 resolutions, 4 reopenings, 12 duplicate
clusters, 8 cross-timeline chains, and 10 long-range gaps of at least 12 chapters. The 72 queries include at least 12
multi-facet, 8 negative-transfer, 12 stale-evidence, 10 long-range, and 6 ambiguity/abstention cases.

`chapter-plan.json` fixes 40 chapters in five acts, target 6,500 characters each, 5,500–7,500 allowed, 3–5 corpus
units and 6–8 canonical Event surfaces per chapter, and 35%–55% estimated natural noise. Five parallel tracks cover
engineering/operations, ecology/safety, finance/procurement, governance/community, and people/logistics. It also
preregisters 12 cutoff groups of 6 queries each. WORLD owns all final fictional names, dates, entities, and facts.

## 10. Stable surface evidence mapping

After chapter eligibility is decided, deterministic code joins generation surface-anchor sidecars with frozen Event,
query-plan, and Gold identifiers to create `derived/surface-evidence-map.jsonl`. This is derived evidence location
metadata, never a source of Event/Gold authority.

Every line binds dataset and corpus version; chapter/unit/document path; Event IDs; semantic unit IDs; relevant query
plan IDs; full document SHA-256; exact surface and normalized-surface SHA-256; and a Unicode-codepoint, zero-based,
half-open `[start,end)` coordinate. The validator re-reads document bytes, reproduces text and normalized hashes,
checks non-overlapping/allowed duplicate spans, rejects invalid-attempt documents, resolves every endpoint, and proves
that all required evidence and semantic units have eligible pre-cutoff surfaces. Manifest inventory and coverage bind
the map hash, record count, mapped Event count, and zero unmapped required Events/semantic units.

The document hash covers exact stored chapter bytes, the surface hash uses the exact-span target, and the normalized
hash uses `RC_TEXT_NORMALIZATION_NFKC_UNICODE_17_0_0_LF_V1`; implementations may not substitute NFC, a platform
default Unicode version, trimming, or line-ending-dependent behavior.

The map enables stable failure attribution:

- retrieval omission: a required mapped pre-cutoff surface exists but is absent from the retrieved/context packet;
- formation omission: the surface was available to Formation, but the required State/Fact/Relation proposal is absent;
- answer-model failure: required mapped surfaces, and formed artifacts when applicable, reached answer input but the
  answer still violates the oracle.

Without a valid surface mapping, layer-specific attribution is prohibited.

## 11. Bounded chapter continuity bundle

Every fresh chapter task receives one immutable bundle conforming to `continuity-bundle.schema.json`:

- frozen world bible, immutable style bible, and alias/name registry hashes;
- current local entity State plus current person Relation/State snapshot;
- current chapter Event plan;
- unresolved clue/OpenQuestion ledger and bounded necessary-prior summary;
- zero to two exact earlier text snippets, only when specifically necessary (`CH001` may have zero); and
- a deterministic closed future-constraint projection containing only opaque `EV-*` IDs, the hash of its source ID
  set, and enumerated generic prohibition codes (`OMIT_OPAQUE_EVENT`, `NO_FORWARD_REFERENCE`, or
  `PRESERVE_CUTOFF_STATE`).

The bundle never contains the prior full corpus, future chapter plan, query plan, query oracle, evaluator-control Gold,
future Event payload, or comparator answer. Input hashes and character/token budgets are recorded. The immutable style
bible and alias registry are shared; all evolving snapshots/ledgers are materialized per chapter so continuity can be
reconstructed without carrying the corpus forward.

The future projection is produced only by deterministic allowlist projection from future Event IDs. IDs are unique
and ASCII-sorted; `source_future_event_ids_sha256` hashes the RFC 8785 JSON array of that sorted list without a file
LF. `opaque_future_event_ids` is byte-identical to that list. For each ID, `prohibition_rules` contains exactly three
records in this fixed code order: `OMIT_OPAQUE_EVENT`, `NO_FORWARD_REFERENCE`, `PRESERVE_CUTOFF_STATE`; IDs remain the
outer sort key. `projection_sha256` hashes the RFC 8785 projection object without a file LF. It has no
free-text field and no payload-bearing name/date/location/claim/value slot. Its object and rule shapes are closed by
Schema; every rule must reference one projected opaque ID, every projected ID must have the required generic rules,
and `projection_sha256` plus `source_future_event_ids_sha256` must reconstruct. A fixture that injects an explicit
future fact anywhere in this subtree must fail Schema or byte-for-byte projection equality. Self-declared
`contains_future_event_payload: false` is not evidence and is not part of the contract.

## 12. Bounded generation repair

Each chapter has one initial Terra call. Best-of, hidden retry, quality chasing, and choosing among multiple valid
outputs are forbidden. At most one documented repair attempt is allowed only for a mechanically provable failure:
truncation, schema/format failure, missing preregistered Event surface, character-bound violation, or surface-anchor
failure.

The original output is recorded `invalid` and is permanently ineligible. Repair uses the same Terra model, reasoning,
prompt version, and generator version; the only added input is hashed machine diagnostics. Ledger fields bind attempt
number/kind, reason, repaired call ID, diagnostics hash, input/output hashes, eligibility, and
`NO_CANDIDATE_SELECTION`. A second mechanical failure stops the stage.

A semantic inconsistency is never locally repaired. It invalidates the corpus version and triggers fresh regeneration
of the affected chapter and all chapters/mappings/prefixes/query surfaces that depend on it under the version rules.

## 13. Isolated stages and model allocation

`stage-plan.json` is normative. No single long-lived task carries the project end to end.

1. `SPEC`: Sol/high; contract, eight schemas, taxonomy, chapter/stage/cost plan only.
2. `WORLD`: Sol/medium; world, immutable style/name controls, relationships, timelines, Event slots.
3. `GOLD`: Sol/medium; Events/timeline, evaluator-control Gold, query plan, chapter Event plans; no prose/query text.
4. `GENERATION`: Terra low or preregistered medium; one isolated task per chapter and bounded repair policy.
5. `SURFACE_MAPPING_BASE_VALIDATION`: deterministic map, span/hash/coverage validation, cutoff-group prefixes.
6. `QUERY_SURFACING`: Sol/medium; 12 independent answer-blind cutoff-group calls reading only safe brief envelopes and
   their visible prefixes.
7. `MECHANICAL_VALIDATION`: deterministic; Luna/low only for named checks code cannot decide, cap 8.
8. `SEMANTIC_AUDIT`: Sol/high samples and critical chains; Builder-side consistency only.
9. `FREEZE`: deterministic SHA-256 and manifest finalization; zero model calls.

Terra or Luna unavailability stops its stage; there is no automatic Sol upgrade. Query-surfacing or audit Sol
unavailability also stops its stage. Every stage hands off files plus input/output hashes and never relies on chat
history as authority.

## 14. Cost discipline

The official model catalog accessed 2026-08-27 lists per-million-token API prices of Sol `$4` input / `$20` output,
Terra `$2` / `$12`, and Luna `$0.20` / `$1.20`, with the required reasoning modes. These are planning references, not
a Codex subscription invoice or availability guarantee: <https://developers.openai.com/api/docs/models>.
For Sol, any request with more than 272,000 input tokens prices the entire request at 2x input and 1.5x output; this is
applied per request, not to aggregate stage tokens:
<https://developers.openai.com/api/docs/models/gpt-5.6-sol>.

`cost-plan.json` reconciles 22 planned Sol calls, 40 initial Terra calls, zero repair calls by default (40 maximum),
zero Luna calls by default (8 maximum), and three deterministic stages. Default dataset-generation list-price range
is `$16.98–$32.491`, excluding optional Luna, repairs, and all evaluation campaigns; 25% token-variance reserve is
`$21.225–$40.61375`. Query surfacing is the largest input-token stage; corpus generation remains the largest visible
output-token stage.

The 12 query-surfacing estimates include exact prompt, request metadata, safe envelope, visible prefix, and framing
overhead. Low-bound requests all remain at or below 272K. At the high bound, QCG-08 through QCG-12 exceed 272K and use
the long-context tier for their whole request; QCG-01 through QCG-07 remain base-tier. Their reconciled stage range is
2.2M–3.2M input, 18K–30K output, and `$9.16–$21.551`. Cached input is conservatively zero in this plan; actual cached
tokens are recorded if observable.

An initial chapter is budgeted at 12k–16k input, 6.5k–8.5k visible output, 7.5k–10k billed output, or about
`$0.114–$0.152`. Its optional single mechanical repair adds about `$0.116–$0.154`; a worst-case 40-repair contingency
is `$4.64–$6.16` and is not in the default total. Reserve never authorizes hidden retry, best-of, fallback, or upgrade.

Every actual call records model/reasoning, prompt/generator version, attempt and repair linkage, input/output hashes,
token fields where observable, fallback, eligibility, and stop reason. `NOT_OBSERVABLE` replaces invented actuals.

## 15. Deterministic validator responsibilities

The validator fails closed on:

- all schema failures; duplicate/unresolved IDs; chronology errors; illegal State/Fact/Relation lifecycle/endpoints;
- disagreement among Event operations and supersede/retract/resolve relations, or missing provenance;
- any mismatch among query plan, oracle pointer, generated query metadata, cutoff, case/facets, expected action, or
  required/forbidden evidence; missing or multiply bound brief; brief subject/alias absent at cutoff; envelope allowlist/schema or
  plan/brief/envelope/prefix hash mismatch; query-surface input provenance and mechanical leakage rules from section 8;
- prefix reconstruction, query-self inclusion, cutoff-after bytes/Events, future leakage, or control-asset exposure;
- surface-map document/text hash, coordinate, corpus-version, endpoint, cutoff, invalid-attempt, and required-coverage
  failures; missing map prevents retrieval/formation/answer attribution;
- duplicate-source classification, sentinel, multi-facet, long-range, and all non-zero taxonomy denominators;
- chapter character/Event counts and continuity-bundle allowlist/forbidden-input/hash/budget rules, including closed
  future-projection derivation, endpoint equality, and rejection of every payload-bearing extra field;
- more than two chapter attempts, an unapproved repair reason, changed model/reasoning/prompt/generator, missing
  diagnostics or attempt hashes, multiple eligible outputs, best-of, or selection of an invalid output;
- request-level Sol threshold/tier/cost arithmetic drift; canonicalization/normalization/framing fixture failure;
  prompt/envelope/prefix/metadata/frame hash mismatch; file inventory, version, SHA-256, or freeze-sidecar mismatch.

Programmatic success cannot determine whether a surface subtly expresses the wrong canon or a query semantically
suggests an answer. Those checks go to the Builder-side audit and Independent QA, without changing authority in place.

## 16. Semantic audit and reporting boundary

Sol/high audits preregistered critical supersede/retract chains, every negative-transfer pair, every multi-facet case,
all 10 long-range chains, every brief for answer neutrality, every final query for same-information-need fidelity and
answer implication, each epistemic/taxonomy family, and a stratified 20% chapter sample. No audit call receives the
full corpus. Findings separate fact, inference, and recommendation.
A material mismatch invalidates the corpus version; the audit edits neither Gold nor prose and is not Independent QA.

Because Terra generates prose, a Terra/low development evaluator or cost-calibration run has generator/evaluator
style-family bias. It may support development evidence only and must not be generalized as model-independent final
qualification. A final Sol comparison must hold model, reasoning, prompt, and tool policy constant across conditions.

## 17. Full Context comparator policy

The comparator name is `Full Context`; legacy comparator wording that could be confused with RippleContext's Raw
evidence plane is not used. Development defaults to deterministic Full Context token counting and does not run a model.

If actual latency/billing calibration is necessary, a separate evaluation work order may authorize at most one
`gpt-5.6-terra` / low campaign labeled exactly `COST_CALIBRATION_ONLY / NON_QUALIFYING`. It is not a development
qualification result, is absent from the dataset-generation manifest, and its cost is excluded from generation total.
There is no “major architecture change” Full Context gate.

After final corpus, evaluator-control Gold, final Query, and RC candidate are all frozen, one independent evaluation
work order may run a `gpt-5.6-sol` final campaign. Under identical model/reasoning/prompt/tool policy it compares
`FULL_CONTEXT`, `RECENT_ONLY`, `RC_PROJECTION`, and `RC_PROJECTION_PLUS_BOUNDED_RECALL`. Evaluation run records live
outside the dataset-generation manifest, and final evaluation cost is not generation cost.

## 18. Freeze and invalid-run rules

Freeze is mechanical: verify passed gates; serialize JSON/JSONL and normalize text exactly under section 6.1; hash
canonical values and exact inventory-file bytes under their named targets; reconstruct every query-surface frame; hash
`hashes.json` and `manifest.json`; bind all authority/derived/prompt/generator/attempt/policy versions and hashes; and set
`FROZEN` only after an independent deterministic reconstruction. Dataset-generation `manifest.json` contains no model
answer or evaluation-run record. The frozen dataset is immutable.

`freeze.serialization_policy_sha256` hashes the RFC 8785 value bytes of the manifest's closed
`serialization_and_hashing` object. `hashes.sha256` and `manifest.sha256` are lowercase hex plus one LF, and each hashes
the exact stored bytes of `hashes.json` and `manifest.json`, respectively. The manifest cannot include its own digest;
the sidecar is the sole manifest-file digest. Re-serialization before hashing is forbidden for file-hash targets.

Immediate invalidation includes Gold/query-plan created or changed to fit visible prose; raw/non-allowlisted
query-plan or future/control input read by query surfacing; safe-envelope/brief hash or same-information-need failure;
query self-inclusion/future leakage; semantic chapter mismatch; unauthorized model,
reasoning, fallback, retry, best-of, or candidate selection; prior full corpus/query oracle in a chapter bundle;
surface-map/hash/coverage failure; missing ledger; or unauthorized edit.

Mechanical first-attempt failure is attempt-local invalidity and permits the single section-12 repair. It does not
make the failed output eligible and does not create a choice set. All other defects follow versioned fresh regeneration.
Invalid runs/attempts remain recorded with reason, affected paths/IDs, versions, timestamps, and hashes; they are never
silently deleted or scored.

## 19. SPEC exit gate

WORLD remains unauthorized until Independent QA confirms:

- all SPEC JSON parses and all eight schemas compile under Draft 2020-12 strict mode with formats;
- every cross-file invariant above has deterministic validator ownership;
- taxonomy, 40-chapter/12-cutoff-group plan, 22 Sol/40 Terra-initial/0 default Luna calls, and cost arithmetic reconcile;
- no WORLD/control instance/query instance/corpus/model answer/evaluator run exists;
- Core production source, retrieval, State, MCP, database, packages/tests, and frozen evaluations are unchanged; and
- `WO-BM-01` has no unresolved acceptance criterion.

Status remains `BUILDER DELIVERED / AWAITING INDEPENDENT QA / SPEC ONLY`; Builder does not approve its own work.
