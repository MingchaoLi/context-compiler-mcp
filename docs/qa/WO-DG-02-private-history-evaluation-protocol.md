# WO-DG-02 — Sanitized Private-History Evaluation Protocol

Status: **DEVELOPMENT EVIDENCE / PARTIAL**

Classification: **NOT INDEPENDENT QA / NOT A HIDDEN HOLDOUT / NOT PUBLICLY REPRODUCIBLE FROM SOURCE DATA**

## Publication note

This is a post-run, sanitized description of the original private frozen protocol. It is published so
readers can understand how the aggregate values in the README were produced. It is **not** a new public
preregistration.

The source conversations belong to the maintainer's private long-running chat history. The repository
does not publish the timeline, prompts, expected-answer details, model answers, judge outputs, Session
identifiers, RPC logs, databases, or private artifact manifests. Those materials could reveal personal
content even when quoted fragments appear harmless in isolation.

## Objective

The development evaluation asked a narrow question:

> On a small set of long-history questions, how does RC Raw-only context compilation compare with the
> context available after native Host history handling, in answer-stage input size, target-information
> coverage, answer quality, and known failure modes?

It was designed as a bounded engineering baseline. It was not designed to prove generalization,
production readiness, universal memory quality, or final model-input reduction across Hosts.

## Frozen fixture and comparison set

- Fixture identity: `cases-v1`.
- Six cases were frozen from one maintainer-controlled private history.
- Five cases produced common valid answers and form the quality aggregates.
- The longest case, `C06`, is reported separately as a capacity diagnostic.
- The cases were development data, not a secret test set or an independently administered holdout.

The private fixture contained the history prefix, question, target facts, and failure-sensitive details
needed for scoring. None of that private payload is required to interpret the public aggregate tables.

## Conditions

### Full raw history (`F`)

The complete applicable history was supplied to Codex without explicitly requesting compaction. This
was primarily a capacity-path observation, not the headline quality comparison.

### Codex Compaction (`C`)

The same applicable history was supplied to Codex, explicit native compaction was requested, and the
question was answered from the resulting Host-managed context.

### RC Raw-only (`R`)

The applicable history prefix was ingested into RippleContext Core. The public rendered output from
`compile_context` was supplied as a bounded two-message context packet before the question was asked.

This condition used Raw-history retrieval and compilation only. It did **not** use Semantic Formation,
State/Fact/Relation Formation, a deterministic semantic algorithm, or a small-model fallback. The label
`RC Raw-only` is important: these results must not be presented as evidence for unfinished semantic
capabilities.

### Pi Native (`P`)

The original Pi Native condition was auth-blocked and remained invalid in the original run. A later
post-hoc supplement reran Pi Native over the frozen cases. That supplement used Pi's native automatic
compaction and is reported separately from the original comparison.

The supplement used:

- `@earendil-works/pi-coding-agent` 0.84.2;
- provider/model path `openai-codex` / `gpt-5.6-sol` / `openai-codex-responses`;
- reasoning effort `medium`;
- tools disabled;
- a fresh Session for each case;
- no answer retry.

The five valid Pi cases naturally compacted after producing an answer. On `C06`, both the answer request
and the attempted overflow-compaction recovery exceeded capacity; the run was not retried.

## Shared answer discipline

Where the Host supported it, the answer run used `gpt-5.6-sol` with reasoning effort `medium`. The model
was instructed to answer in Chinese from supplied history only, prefer the latest explicit statement
over earlier conflicting statements, and use no tools. Each case was isolated from the others.

The public record does not claim byte-identical Host execution. Host-native compaction and provider
boundaries expose different observability, which is part of the limitation being measured.

## Evaluation dimensions

The aggregate report uses the following dimensions:

- **Gold retained:** coverage of the frozen target-information units.
- **Quality median:** the median answer-quality score under the evaluation rubric.
- **Critical false:** cases containing a serious incorrect claim.
- **Stale resurrection:** cases that reintroduced information known to have been superseded.
- **Negative transfer:** cases where retrieved or retained history harmed the answer.
- **Answer-stage input tokens:** input observed for the answer request, excluding costs that could not be
  observed consistently across Hosts.
- **Capacity outcome:** whether the longest case completed or overflowed.

Because the public repository does not contain the private questions, targets, answers, and judgments,
an outside reader cannot independently recalculate these scores from source data. The report therefore
labels them development evidence rather than reproducible benchmark results.

## Review and aggregation

The original evaluation produced answer artifacts and separate judge artifacts, then parsed the judge
results into per-case fields before aggregation. Disagreements were retained and reviewed rather than
silently collapsed. The Pi supplement repeated the review on its later answers and retained its own
disagreement record.

The aggregate tables use only common valid cases. A failed or capacity-blocked condition is shown as
such rather than converted into a quality score. The Pi supplement's classification correction for the
longest-case runner was made after the run; it did not retry the model or modify model output.

## Known protocol deviations and observation limits

- The original runner files existed before execution, but their Git/SHA identities were recorded only
  after the runs. The private record explicitly marks the absence of a pre-run runner-SHA manifest.
- The Pi comparison was executed later and is exposed to temporal drift and partial position rotation.
- Codex compaction-generation token usage was unavailable. Codex-versus-RC token figures therefore
  compare answer-stage input, not strict end-to-end cost.
- Pi token figures were observed at Pi's provider boundary; the exact provider HTTP payload was not
  available.
- Native Host behavior, including append, injection, compaction, replacement, and final-input control,
  is not equivalent across systems.

## What this protocol cannot prove

This evaluation does not prove:

- robust performance beyond the small private development set;
- independent or blinded product qualification;
- a cross-Host reduction in final model input;
- an end-to-end cost advantage that includes every compaction-generation cost;
- that RC Raw-only always matches native-history answer quality;
- that planned Semantic Formation or Experience Formation works;
- production safety, privacy, or reliability.

See the [sanitized aggregate results](WO-DG-02-private-history-evaluation-results.md) for the numbers
derived under these boundaries.
