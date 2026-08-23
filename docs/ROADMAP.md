# Roadmap

Work proceeds in this order:

1. **ST-01 — Model-independent State Delta pipeline. ACCEPTED.** Independent QA passed on 2026-08-23. Prepare/apply operations use durable snapshot validation, revision checks inside the SQLite transaction, strict parsing, and atomic reducer application.
2. **ST-02 — Evaluation runner. ACCEPTED.** Fresh independent re-QA passed on 2026-08-23. The accepted runner measures D0 full context, D1 complete recent user-turn context, and D2 existing assembler plus recall, including token reduction, constraint retention, decision continuity, resolved-issue reopening, open-question continuity, recall recovery, and latency. The first QA return's package-bin and warning-stream defects were closed by an append-only fix and verified against a real production-only tarball.
3. **ST-03 — Optional extractor transport. ACCEPTED.** Independent QA passed on 2026-08-23 at fixed source candidate `0b5b5dac28cbdbe78406211c9becf8646a7c114e`. The accepted provider-neutral local subprocess transport and library-only runtime updater passed real child lifecycle, two-connection SQLite conflict, production-only package, and exact nine-tool MCP verification without adding a provider SDK, network call, credential surface, or host dependency.
4. **EV-02 — Evaluator v2 测量有效性校准。 ACCEPTED.** 独立 re-QA 于 2026-08-23 在固定 source candidate `93b71dde1c660feb2671d974cbb6eedb3b58340a` 上通过。Version 1 复现能力保留；version 2 的严格 provenance、`not_evaluable`、排除 `current_input` 的历史投影和原始 D2-vs-D1 token 成本均通过反例、真实 CLI 与 production-only package 验证。该步骤只校准尺子，不提供 D2 效果证据。
5. **Starlette v1 `feasibility-01`。 SEALED BASELINE.** DS-13 的 anchored automatic artifact 与空白盲评包只保留为 Oracle-State feasibility baseline；不再等待或填写双真人盲评，answer semantic gain 固定为 `not_evaluated`。它不能支持 D2 优于 D1、稳健性或一般化结论。
6. **WO-DS-14 — State Compiler v0.1 时间状态回放。 ACCEPTED / COMPLETE.** 固定 30-step Reducer Conformance 与唯一一次 `gpt-5.6-terra` / medium ST-02 capture/raw scoring 均已通过独立 QA 的完整性验证。ST-02 Extractor correctness 实验结果为失败：12 schema failure fallback、16 strict-valid empty on Gold-nonempty、2 empty true negative，Predicted State 全空，general / critical unique recall 为 `0/35` / `0/29`。precision 与 lifecycle/relationship capability 因 zero eligibility 保持 `not_evaluable`；没有综合分、阈值或架构胜负。工单已按预定停止，下一阶段未授权。
7. **WO-V0-15 — Experience-ready foundation closure. ACCEPTED / FROZEN.** 第四个 append-only fix 已于 2026-08-24 在固定 source candidate `7567ac1219db65886bdc157af969c51a379a9fb9` 通过独立 re-QA，关闭冻结后终局对抗审查发现的 public v1 source-less late update dormant P1；历史返回与接受记录继续 append-only 保留。Dense retrieval 与 Experience Formation 效果仍未评估。
8. **Context / State infrastructure freeze. COMPLETE.** correctness、兼容、迁移、并发、回放和打包合同已独立接受；不再开发新的 Context 算法、复杂 ontology、PACE/mem0 对比或 retrieval 调参。默认 5/8/15 等仍只保留为配置实验参数，不演化为理论规则。
9. **真实使用与 Experience Formation 数据准备。 NEXT.** 下一阶段通过真实长期运行积累可回放的 `Event -> Action -> Outcome / Feedback -> Candidate Experience` 数据，再另行设计 Experience Formation 实验；现阶段不自动抽象、promotion 或影响 Agent 决策。
10. **Host formal mode consideration.** Formal Host Mode 仍需新的明确工单；本次收口不授权宿主集成或修改其他仓库。

Automatic headline generation 仍未实现，也不由既有工单隐含授权；Context / State freeze 后不再作为默认路线图任务。
