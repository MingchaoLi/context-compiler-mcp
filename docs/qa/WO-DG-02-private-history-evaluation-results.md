# WO-DG-02 — Sanitized Private-History Evaluation Results

Status: **DEVELOPMENT EVIDENCE / PARTIAL**

Classification: **NOT INDEPENDENT QA / NOT A HIDDEN HOLDOUT / NOT PUBLICLY REPRODUCIBLE FROM SOURCE DATA**

These aggregate results come from a maintainer-controlled private-history evaluation. Read the
[sanitized protocol](WO-DG-02-private-history-evaluation-protocol.md) before interpreting them. The
underlying conversations, questions, target details, answers, judge outputs, logs, and databases are
intentionally not public.

This document is a post-run public evidence note, not a new preregistration and not an Independent QA
acceptance report.

The original run's bounded disposition was `NEEDS_BOUNDED_FAILURE_WORK_ORDER`, not `PASS` or
`ACCEPTED`. The later Pi supplement remained `PARTIAL`.

## Result 1: Codex Compaction vs RC Raw-only

The original run produced five common valid cases for the direct quality comparison.

| Metric | Codex Compaction | RC Raw-only |
| --- | ---: | ---: |
| Gold retained | 16/19 | 15.5/19 |
| Quality median | 4.25 | 3.75 |
| Answer-stage input tokens | 208,354 | 122,407 |
| Critical-false cases | 0/5 | 1/5 |
| Stale-resurrection cases | 0/5 | 0/5 |
| Negative-transfer cases | 0/5 | 1/5 |

Derived descriptions used in the README:

- Gold retention relative to Codex Compaction: `15.5 / 16 = 96.875%`.
- Answer-stage input reduction: `1 - 122,407 / 208,354 ≈ 41.3%`.
- Quality-median difference: `3.75 - 4.25 = -0.5`.

Bounded interpretation: RC Raw-only used less answer-stage input and retained nearly all of the Codex
Compaction Gold score in this five-case run, but its quality median was lower and it had one critical
false / negative-transfer case. The run does not establish equivalence or generalization.

## Result 2: later Pi Native supplement vs RC Raw-only

The original Pi condition was auth-blocked. The following figures come from a later post-hoc Pi Native
supplement and are deliberately kept separate from the original direct comparison.

| Metric | RC Raw-only | Pi Native |
| --- | ---: | ---: |
| Valid answers | 5/5 | 5/5 |
| Supplemental blind-review Gold | 14/19 | 15.5/19 |
| Quality median | 3.25 | 3.25 |
| Critical-false cases | 2/5 | 5/5 |
| Stale-resurrection cases | 0/5 | 4/5 |
| Negative-transfer cases | 1/5 | 3/5 |
| Answer-stage input tokens | 122,407 | 2,723,763 |
| Longest case (`C06`) | completed | context overflow |

Derived description used in the README:

- Answer-stage input reduction: `1 - 122,407 / 2,723,763 ≈ 95.5%`.

Pi Native covered more Gold in the supplemental blind review and had the same quality median, while RC
had fewer critical-false, stale-resurrection, and negative-transfer cases. This is a development
observation, not proof that RC is generally more accurate than Pi.

Across the five valid Pi cases, observed Pi answer input plus post-answer compaction input totaled
5,261,230 tokens. That value is not used for the headline 95.5% comparison because there is no
consistently observable corresponding Codex/RC end-to-end boundary.

## Evidence accounting

The original private run retained 24 condition-level answer artifacts and 12 judge artifacts. Twelve
judge runs were parsed into the result set, with 38 disagreement fields retained for review. The later
Pi supplement retained 47 supplemental judge-disagreement fields. These counts describe the private
evidence trail; they do not make the evaluation independent or publicly reproducible.

## Capacity observation

The sixth and longest case was kept outside the five-case quality aggregates:

- RC Raw-only completed.
- Pi Native's answer request overflowed.
- Pi's attempted overflow-compaction recovery also overflowed.
- No model retry was performed.

This is one capacity observation, not a universal maximum-context benchmark.

## Overall bounded conclusion

The public result can be described as follows:

> In a small private development evaluation, RC Raw-only compiled substantially smaller answer-stage
> inputs while preserving broadly comparable target-information coverage. It also completed the longest
> case. Answer quality did not clearly outperform the Host-native baselines, and the run exposed an RC
> omission / negative-transfer risk that remains relevant to future semantic work.

The comparison supports further research into bounded context compilation. It does not support claims
of proven cross-Host final-input reduction, general answer-quality superiority, or production readiness.

## Limitations

- Six frozen cases from one maintainer's history are too small and too correlated for general claims.
- The private source payload prevents public source-data reproduction.
- These were development cases, not a hidden holdout.
- The work was not administered or accepted as Independent QA.
- The Pi supplement is `PARTIAL`, post-hoc, and subject to temporal drift.
- Codex compaction-generation usage was not observable.
- Pi usage was observed at a provider boundary rather than from the exact provider HTTP payload.
- Host injection/append behavior is not replacement and does not establish final-input control.
- `RC Raw-only` did not exercise unfinished Semantic Formation, Experience Formation, or learned
  promotion.

## Privacy boundary

Only the method, aggregate counts, arithmetic, and interpretation boundaries are public. No private
chat payload, personal fact, exact question, exact answer, judge transcript, local database, Session
identifier, or local-machine path is included in this record.
