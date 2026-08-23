# Roadmap

Work proceeds in this order:

1. **ST-01 — Model-independent State Delta pipeline. ACCEPTED.** Independent QA passed on 2026-08-23. Prepare/apply operations use durable snapshot validation, revision checks inside the SQLite transaction, strict parsing, and atomic reducer application.
2. **ST-02 — Evaluation runner. ACCEPTED.** Fresh independent re-QA passed on 2026-08-23. The accepted runner measures D0 full context, D1 complete recent user-turn context, and D2 existing assembler plus recall, including token reduction, constraint retention, decision continuity, resolved-issue reopening, open-question continuity, recall recovery, and latency. The first QA return's package-bin and warning-stream defects were closed by an append-only fix and verified against a real production-only tarball.
3. **ST-03 — Optional extractor transport. ACCEPTED.** Independent QA passed on 2026-08-23 at fixed source candidate `0b5b5dac28cbdbe78406211c9becf8646a7c114e`. The accepted provider-neutral local subprocess transport and library-only runtime updater passed real child lifecycle, two-connection SQLite conflict, production-only package, and exact nine-tool MCP verification without adding a provider SDK, network call, credential surface, or host dependency.
4. **对抗审查处置。** Post-ST-03 独立对抗审查结论为 `Challenge`。在下一次重大投入前，主控需要明确选择：补强 ST-02 决策证据、处理 preparation 保留风险，或记录接受这些风险的理由。该节点尚不是实现工单，也不回滚 ST-01 至 ST-03 的 QA 接受状态。
5. **Host formal mode consideration.** Only after ST-01 through ST-03 are independently accepted and the Post-ST-03 adversarial findings are explicitly dispositioned may host repositories consider sending compiled context to a production model.

Automatic headline generation can be proposed as a separate bounded work order; it is not implied by ST-01.
