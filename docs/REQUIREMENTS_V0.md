# Context Compiler v0 requirements index

This file is the default requirements entry point. The full historical brief is archived at `archive/ORIGINAL_IMPLEMENTATION_BRIEF.md`; load it only when a work order needs original detail or wording.

## Objective

Keep remote-model working context bounded as conversation history grows, while preserving correctness, provenance, and exact recovery. Correctness and recoverability take priority over maximum token reduction.

v0 的产品职责是 State Compilation：从持续增长的 Raw Events 中稳定、低成本地维护正确的 Current Active State，并以 dependency-aware assembly 保留仍有效的 Constraint、Decision 与 OpenQuestion。它不负责预测哪些旧证据下一步可能重新有用，也不负责从历史抽象长期 Experience。

## Required design

- Persist every raw event before compacting or suppressing it.
- Represent active task state as `Goal`, `Constraint`, `Decision`, `OpenQuestion`, and `RejectedAlternative` items with explicit lifecycle states and provenance.
- Let an extractor propose only a structured State Delta; validate strictly and apply transitions deterministically in code.
- Assemble working context from active state, required dependencies, historical handles when selected, recent raw evidence, and current input.
- Never delete source evidence because of a semantic guess.
- Support immutable headlines, literal-safe search, and exact raw recall.
- Keep the model interface replaceable; another expensive remote reasoning pass must not be required by context management.
- Keep compiler failure recoverable by a host-selected safe fallback.

## v0 exclusions

Do not implement experience extraction, intuition, autonomous long-term memory, graph databases, provider training/distillation, semantic retrieval, a background autonomous agent, or broad host-framework rewrites.

PACE / Evidence Paging 属于 Research Backlog，不是 v0 实现请求。禁止顺手增加：

- `SemanticRetriever`、`ContextScorer` 或 embedding-based historical reactivation；
- PACE 式 Full / Detailed / Brief / Placeholder 多粒度表示；
- pressure-adaptive context selection 或 `glimpse()` / page-fault 恢复机制；
- Experience abstraction 或 learned compression policy。

除非当前测试失败直接要求，不得以“未来最终需要”为理由把这些机制加入 v0。

## Required evaluation

Compare D0 full context, D1 recent-window baseline, and D2 compiled context. Report context token reduction, constraint retention, decision continuity, resolved-issue reopening, open-question continuity, recall recovery, and local compile latency. Include historical recovery and failure/fallback cases.

验证按顺序解释：

1. Correctness gate：先证明 Constraint、Decision lifecycle、OpenQuestion、superseded/rejected 状态正确，且无 vacuous pass；
2. Context Reduction gate：仅在 correctness 成立后解释 D2 相对 D1/D0 的上下文成本；
3. Operational Stability gate：验证 extractor 连续运行、reducer deterministic、replay/provenance 与 mismatch/error diagnostics。

前一 Gate 未成立时，不用后续平均值掩盖失败，也不启动 Evidence Paging / Experience 实现。

## Current mapping

- Durable raw store: implemented.
- Typed state, strict parser, deterministic reducer: implemented as library primitives.
- Context assembly: implemented.
- Headline and exact/keyword recall: implemented as explicit tools.
- Nine-tool local MCP service: implemented and independently accepted.
- Explicit State Delta preparation/application pipeline: implemented and independently accepted in ST-01.
- Evaluation runner and evaluator-v2 validity calibration: implemented and independently accepted in ST-02 / EV-02.
- Optional provider-neutral local extractor transport: implemented and independently accepted in ST-03; no provider is selected by core.
- Formal host compiler mode: still deferred.
- Evidence Paging / PACE / Experience Layer: research-only extension points, not v0.
