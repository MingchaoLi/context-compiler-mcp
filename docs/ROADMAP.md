# Roadmap

Work proceeds in this order:

1. **ST-01 — Model-independent State Delta pipeline. ACCEPTED.** Independent QA passed on 2026-08-23. Prepare/apply operations use durable snapshot validation, revision checks inside the SQLite transaction, strict parsing, and atomic reducer application.
2. **ST-02 — Evaluation runner. ACCEPTED.** Fresh independent re-QA passed on 2026-08-23. The accepted runner measures D0 full context, D1 complete recent user-turn context, and D2 existing assembler plus recall, including token reduction, constraint retention, decision continuity, resolved-issue reopening, open-question continuity, recall recovery, and latency. The first QA return's package-bin and warning-stream defects were closed by an append-only fix and verified against a real production-only tarball.
3. **ST-03 — Optional extractor transport. ACCEPTED.** Independent QA passed on 2026-08-23 at fixed source candidate `0b5b5dac28cbdbe78406211c9becf8646a7c114e`. The accepted provider-neutral local subprocess transport and library-only runtime updater passed real child lifecycle, two-connection SQLite conflict, production-only package, and exact nine-tool MCP verification without adding a provider SDK, network call, credential surface, or host dependency.
4. **EV-02 — Evaluator v2 测量有效性校准。 ACCEPTED.** 独立 re-QA 于 2026-08-23 在固定 source candidate `93b71dde1c660feb2671d974cbb6eedb3b58340a` 上通过。Version 1 复现能力保留；version 2 的严格 provenance、`not_evaluable`、排除 `current_input` 的历史投影和原始 D2-vs-D1 token 成本均通过反例、真实 CLI 与 production-only package 验证。该步骤只校准尺子，不提供 D2 效果证据。
5. **Starlette v1 真实轨迹评估计划。 IN PROGRESS — WO-DS-13 automatic artifact + blank blind bundle ACCEPTED.** DS-13 已在独立 QA 接受：anchored official evaluator artifact 记录 1 次 evaluator、0 model、0 semantic score，并生成 public/internal 物理隔离的 36-item 人工盲评包和两份空白评分表。8 Probe 只覆盖 3/12 slices；semantic correctness、reduction interpretation、operational stability 三项 Gate 继续 pending。下一外部 blocker 是两名真实、condition-blind 人类独立评分；返回前不得解盲、填表或声明 D2 优于 D1。
6. **v0 scope freeze.** State Compilation 是当前核心；先依次通过 Correctness、Context Reduction、Operational Stability。PACE / Evidence Paging / Experience 只保留为 Research Backlog，不进入 v0，也不构成当前 blocker。
7. **Host formal mode consideration.** Only after ST-01 through ST-03 are independently accepted and the Post-ST-03 adversarial findings are explicitly dispositioned may host repositories consider sending compiled context to a production model.

Automatic headline generation can be proposed as a separate bounded work order; it is not implied by ST-01.
