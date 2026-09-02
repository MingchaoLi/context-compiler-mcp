# QA and evaluation evidence

Independent QA reports are stored here by work order. Implementers do not approve their own changes,
and a failed report must be resolved by a new implementation commit before QA reruns.

The directory also contains clearly labeled development evidence when a useful evaluation cannot meet
the Independent QA or public-reproduction boundary. These records must not be treated as acceptance
reports.

## Selected evidence map

Test counts across these records are not cumulative. Many reports deliberately rerun the same focused,
full-regression, protocol, and package checks.

| Area | Records | Current disposition |
| --- | --- | --- |
| Long-conversation dogfood | [WO-DG-01](WO-DG-01-codex-long-conversation-dogfood.md) | `PASS / ACCEPTED / COMPLETE`, within its stated observation boundary |
| Private-history development comparison | [sanitized protocol](WO-DG-02-private-history-evaluation-protocol.md) · [aggregate results](WO-DG-02-private-history-evaluation-results.md) | `DEVELOPMENT EVIDENCE / PARTIAL`; not Independent QA or publicly source-data reproducible |
| ContextSnapshot provenance and exact replay | [returned omission attack](WO-05-context-snapshot-contract.md) → [accepted owner-receipt fix](WO-05-context-snapshot-contract-fix.md) | Initial `FAIL`; bounded fix `ACCEPTED / PASS` |
| Context/State foundation freeze | [WO-V0-15](WO-V0-15-experience-ready-foundation-freeze.md) | Multiple append-only returns and fixes; final disposition `ACCEPTED / FROZEN` |
| Atomic State-update pipeline | [WO-ST-01](WO-ST-01-state-update-pipeline.md) | `PASS / ACCEPTED` |
| Public MCP result/privacy boundary | [initial return](WO-PUB-01-public-mcp-result-boundary.md) → [accepted fix](WO-PUB-01-public-mcp-result-boundary-fix.md) | Functional boundary passed; lineage defect returned and fixed; final `PASS / ACCEPTED` |
| Evaluator measurement validity | [WO-EV-02](WO-EV-02-evaluator-validity-calibration.md) | Initial provenance/parser `FAIL`; append-only Independent re-QA `PASS` |

Failed reports are intentionally retained. They show the counterexample that existed at that candidate,
not the status of a later fixed candidate. Follow the arrow or the final re-QA section for current
disposition.

## Development evidence

- [WO-DG-02 sanitized private-history evaluation protocol](WO-DG-02-private-history-evaluation-protocol.md)
- [WO-DG-02 sanitized private-history aggregate results](WO-DG-02-private-history-evaluation-results.md)
