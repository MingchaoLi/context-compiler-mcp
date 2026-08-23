# Roadmap

Work proceeds in this order:

1. **ST-01 — Model-independent State Delta pipeline. ACCEPTED.** Independent QA passed on 2026-08-23. Prepare/apply operations use durable snapshot validation, revision checks inside the SQLite transaction, strict parsing, and atomic reducer application.
2. **ST-02 — Evaluation runner. ACCEPTED.** Fresh independent re-QA passed on 2026-08-23. The accepted runner measures D0 full context, D1 complete recent user-turn context, and D2 existing assembler plus recall, including token reduction, constraint retention, decision continuity, resolved-issue reopening, open-question continuity, recall recovery, and latency. The first QA return's package-bin and warning-stream defects were closed by an append-only fix and verified against a real production-only tarball.
3. **ST-03 — Optional extractor transport. ACCEPTED.** Independent QA passed on 2026-08-23 at fixed source candidate `0b5b5dac28cbdbe78406211c9becf8646a7c114e`. The accepted provider-neutral local subprocess transport and library-only runtime updater passed real child lifecycle, two-connection SQLite conflict, production-only package, and exact nine-tool MCP verification without adding a provider SDK, network call, credential surface, or host dependency.
4. **EV-02 — Evaluator v2 测量有效性校准。 IMPLEMENTED — PENDING INDEPENDENT QA.** 保留 version 1 复现能力，version 2 增加 provenance Probe、`not_evaluable`、排除 `current_input` 的历史投影和原始 D2-vs-D1 token 成本。该步骤只校准尺子，不提供 D2 效果证据。
5. **Starlette v1 真实轨迹评估计划。** EV-02 接受后，先筛选约 15 条候选，再冻结 6–10 条短/中/长轨迹；随后进行 future-leakage/provenance 独立审查和外部回答实验。不得根据 D2 表现挑选案例。
6. **Host formal mode consideration.** Only after ST-01 through ST-03 are independently accepted and the Post-ST-03 adversarial findings are explicitly dispositioned may host repositories consider sending compiled context to a production model.

Automatic headline generation can be proposed as a separate bounded work order; it is not implied by ST-01.
