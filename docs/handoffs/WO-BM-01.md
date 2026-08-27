# WO-BM-01 Builder Handoff

Status: `BUILDER DELIVERED / AWAITING INDEPENDENT QA / SPEC ONLY`

Planning baseline: `d18e4d48717030f441f3a2e17e5c786cfa00c699`

Returned candidate: `b006029cad4eaff5e92dbd39f06cc57ccadb6e87`

Independent QA return: `23d1cd4a66122043379008216b04520e47378de3`

Builder candidate: `SELF_CONTAINING_COMMIT`

Resolution rule: use the full commit ID of the Git commit containing this handoff. The Builder delivery report records
that immutable SHA; embedding a commit's own SHA in its tracked tree would change the SHA recursively.

## Delivered result

This bounded revision keeps the existing SPEC candidate and makes additive/compatible contract corrections:

- eight Draft 2020-12 schemas: Event, evaluator-control Gold, pre-corpus Query plan, post-corpus Query surface,
  Timeline, Continuity bundle, Surface evidence map, and Manifest;
- 21 case families and 15 failure families, including surface-traceability diagnostics;
- 40 chapters / 260,000 target Chinese characters / 12 cutoff groups / 72 planned queries;
- nine isolated generation stages, with answer-blind Query surfacing after corpus base validation;
- bounded chapter continuity inputs and one mechanically justified repair attempt;
- reconciled model/token/cost plan and separate Full Context evaluation boundary.

It creates no WORLD, Event/Gold/Query-plan/Query/timeline instance, corpus, model answer, evaluator run, or frozen dataset.
It changes no production source, retrieval, State, MCP, database, package/test, or existing frozen evaluation.

## Material contract corrections

- Query intent freezes pre-corpus in `evaluator-control/query-plan.json`; each plan now includes a closed-world,
  answer-neutral `query_surface_brief` that fixes subject/object, information need, as-of perspective, and output shape.
- Natural-language `query_text` is generated post-corpus by 12 independent Sol/medium tasks that see only their visible
  prefix plus a deterministic allowlist envelope containing query ID, brief, and brief hash. They never read the raw
  query plan. The transient envelope is hash-bound call input, not a ninth public asset.
- `EVALUATOR_CONTROL_GOLD` replaces the previous ambiguous qualification. It is prohibited to Candidate, Adapter,
  Interpreter, answer-model, and answer-blind query-surface readers and is explicitly not an Independent Hidden
  Holdout.
- `derived/surface-evidence-map.jsonl` binds eligible corpus surfaces to Event/semantic IDs with corpus/document/text
  hashes and Unicode-codepoint half-open spans, enabling retrieval-vs-formation-vs-answer failure attribution.
- Generation bundles now bind immutable style/name controls, local/current relationships and State, unresolved threads,
  bounded summary, at most two necessary prior snippets, and a closed future-constraint projection with only opaque
  Event IDs, enumerated generic prohibition codes, and hashes. Free-text future prohibition payload and self-attestation
  have been removed.
- One recorded mechanical repair is permitted; the failed output is invalid/ineligible and no candidate selection is
  possible. Semantic mismatch requires versioned dependent regeneration.
- Comparator terminology is `Full Context`. Development defaults to deterministic token counting. Optional Terra/low
  calibration and final Sol comparison are separate evaluation work orders and excluded from generation manifest/cost.
- Sol semantic audit is Builder-side consistency work, never Independent QA. Terra-generator/Terra-evaluator
  style-family bias is a development-only limitation.

## Independent-QA return fixes

- Sol pricing is now reconstructed per query-surfacing request. A request above 272K input applies 2x input and 1.5x
  output to the entire request. The high estimate puts QCG-08–QCG-12 in that tier and reconciles query surfacing to
  `$21.551`, default generation to `$16.98–$32.491`, and the 25% reserve to `$21.225–$40.61375`.
- JSON values use RFC 8785 JCS; JSON/JSONL final-LF rules, exact file-vs-value hash domains, strict UTF-8, Unicode 17.0.0
  NFKC/newline normalization, exact-span hashing, and all version IDs are normative. Query-surface logical input uses
  an exact tagged/length-prefixed binary frame binding request metadata, prompt, safe envelope, and prefix.
- The continuity future-constraint subtree is closed and payload-free. Deterministic derivation/hash equality is
  required, and an injected explicit future-fact field must fail Schema or projection equality.
- Gold's exact prohibited-reader set now includes `ANSWER_BLIND_QUERY_SURFACE_MODEL`.

## Mechanical checks completed

Builder-side checks completed successfully:

1. all 12 SPEC JSON files parse;
2. all eight schemas compile under Ajv Draft 2020-12 strict mode with formats enabled, and all eight top-level
   objects are closed-world;
3. 40 chapters sum to 260,000 target characters, 220,000/300,000 theoretical per-chapter min/max sums, a separate
   220,000–290,000 aggregate acceptance band, and 28 low/12 medium Terra slots;
4. 12 cutoff groups × 6 queries = 72;
5. stage/cost counts reconcile to 9 stages, 22 Sol calls, 40 initial Terra calls, 0 default repairs, 0 default Luna;
6. per-request query-surface pricing reconstructs QCG-08–QCG-12 at the high long-context tier; default generation cost
   reconstructs `$16.98–$32.491`, reserve `$21.225–$40.61375`, and repair contingency
   `$4.64–$6.16`; optional Luna and all evaluation costs remain separate;
7. taxonomy and all failure-family references resolve at 21/15;
8. Query-plan/Query Schema cross-checks prove the safe-envelope allowlist, brief hash binding, subject-label cutoff
   visibility responsibility, raw-plan prohibition, and unchanged query/call/cost counts;
9. valid safe-envelope and future-constraint fixtures are accepted, while injected `expected_action` and explicit
   future-fact fields are rejected; RFC 8785/Unicode/frame hash fixtures reconstruct byte-for-byte;
10. no file exists below `evaluation/ripplecontext-long-v1/` outside `spec/`; trailing-whitespace scan and
   `git diff --check` pass.

## Deferred and QA boundary

WORLD and all downstream instances, generator/validator implementation, Query surfacing, semantic audit, Freeze,
Full Context calibration, final four-condition campaign, and any true Independent Hidden Holdout remain deferred.

Independent QA should attack whether each answer-neutral brief identifies exactly the frozen information need without
leaking its answer, whether the final question is semantically faithful to that brief, safe-envelope provenance,
surface-map coverage, attempt eligibility/no-selection, continuity forbidden inputs, authority/version edges, and
cost arithmetic. Shape/hash/visibility are deterministic; answer-neutrality and same-information-need fidelity are
semantic review duties. Builder does not approve this work; WORLD remains unauthorized until Independent QA passes.
