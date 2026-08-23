# Roadmap

Work proceeds in this order:

1. **ST-01 — Model-independent State Delta pipeline. ACCEPTED.** Independent QA passed on 2026-08-23. Prepare/apply operations use durable snapshot validation, revision checks inside the SQLite transaction, strict parsing, and atomic reducer application.
2. **ST-02 — Evaluation runner. ACCEPTED.** Fresh independent re-QA passed on 2026-08-23. The accepted runner measures D0 full context, D1 complete recent user-turn context, and D2 existing assembler plus recall, including token reduction, constraint retention, decision continuity, resolved-issue reopening, open-question continuity, recall recovery, and latency. The first QA return's package-bin and warning-stream defects were closed by an append-only fix and verified against a real production-only tarball.
3. **ST-03 — Optional extractor transport. ACCEPTED.** Independent QA passed on 2026-08-23 at fixed source candidate `0b5b5dac28cbdbe78406211c9becf8646a7c114e`. The accepted provider-neutral local subprocess transport and library-only runtime updater passed real child lifecycle, two-connection SQLite conflict, production-only package, and exact nine-tool MCP verification without adding a provider SDK, network call, credential surface, or host dependency.
4. **EV-02 — Evaluator v2 测量有效性校准。 ACCEPTED.** 独立 re-QA 于 2026-08-23 在固定 source candidate `93b71dde1c660feb2671d974cbb6eedb3b58340a` 上通过。Version 1 复现能力保留；version 2 的严格 provenance、`not_evaluable`、排除 `current_input` 的历史投影和原始 D2-vs-D1 token 成本均通过反例、真实 CLI 与 production-only package 验证。该步骤只校准尺子，不提供 D2 效果证据。
5. **Starlette v1 `feasibility-01`。 SEALED BASELINE.** DS-13 的 anchored automatic artifact 与空白盲评包只保留为 Oracle-State feasibility baseline；不再等待或填写双真人盲评，answer semantic gain 固定为 `not_evaluated`。它不能支持 D2 优于 D1、稳健性或一般化结论。
6. **WO-DS-14 — State Compiler v0.1 时间状态回放。 IN PROGRESS — ST-01 与 ST-02 RUN-GATE ACCEPTED；MODEL NOT CALLED.** 固定候选 `826eb4760fe8df557a2aa7d07225bc1986579281` 的 30-step Reducer Conformance 与修复候选 `a4c336d7f2e421c507e926fe333e5a1f4e5dbd06` 的 current-event-only Run-Gate 均通过独立 re-QA。前置合同锚定与无参数 CLI 的首次 P1 已关闭；下一步只有主控可以显式授权固定一次 30-step GPT-5.6-terra non-sol / medium / fresh capture，Run-Gate PASS 不自动启动模型。
7. **v0 scope freeze.** State Compilation 是当前核心；先依次通过 Correctness、Context Reduction、Operational Stability。PACE / Evidence Paging / Experience 只保留为 Research Backlog，不进入 v0，也不构成当前 blocker。
8. **Host formal mode consideration.** Only after ST-01 through ST-03 are independently accepted and the Post-ST-03 adversarial findings are explicitly dispositioned may host repositories consider sending compiled context to a production model.

Automatic headline generation can be proposed as a separate bounded work order; it is not implied by ST-01.
