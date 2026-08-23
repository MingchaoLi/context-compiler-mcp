# Context Compiler v0 requirements index

This file is the default requirements entry point. The full historical brief is archived at `archive/ORIGINAL_IMPLEMENTATION_BRIEF.md`; load it only when a work order needs original detail or wording.

## Objective

长期目标是研究 Experience 如何由真实经历形成并影响未来行动。v0 只提供可冻结的双轨基础设施：前台 Context 随历史增长保持有界且够用，后台 Raw Event / Experience Ledger 完整、可追溯、可回放。Correctness、provenance 与 recoverability 优先于最大 token reduction。

State Compilation 继续维护 authoritative lifecycle；operational Context 额外提供 Recent Raw、bounded window-out recall、fail-open dormant placement 与 verified-failure recovery。Experience Ledger 只保存未来研究所需的 Event–Action–Outcome / Feedback 数据，不执行 Experience 抽象。

## Required design

- Persist every raw event before compacting or suppressing it.
- Represent active task state as `Goal`, `Constraint`, `Decision`, `OpenQuestion`, and `RejectedAlternative` items with explicit lifecycle states and provenance.
- Let an extractor propose only a structured State Delta; validate strictly and apply transitions deterministically in code.
- Assemble working context from active state, required dependencies, historical handles when selected, recent raw evidence, and current input.
- Never delete source evidence because of a semantic guess.
- Support immutable headlines, literal-safe search, and exact raw recall.
- Keep the model interface replaceable; another expensive remote reasoning pass must not be required by context management.
- Keep compiler failure recoverable by a host-selected safe fallback.
- Recent Raw 始终保留最近 N 个完整用户轮次原文，不参与排名、摘要或压缩。
- 窗口外召回只允许有界 BM25 + caller-supplied Dense；partial/mismatched Dense 整腿降级，core 不生成 embedding。
- ACTIVE Constraint 强制进入；dormant 仅为其他未闭合 item 的 fail-open placement，不得改 authoritative lifecycle。
- Raw Event 与 Experience Ledger append-only；前台 suppress/compact 不得删除或重写后台研究数据。
- `operation_id` compile trace 必须去正文、原子、幂等且 exact-shape 可验证；可信 baseline 前无 id compile 保持 read-only，baseline 后缺 id 必须拒绝，不能形成 telemetry gap。
- Public Experience Ledger append 只允许 ACTION / OUTCOME / FEEDBACK / CANDIDATE_EXPERIENCE；EVENT 与 compile/hit observation 由内部原子路径保留。严格 JSON 必须无损保留合法特殊数据键。

## v0 exclusions

Do not implement Experience formation/promotion, intuition, autonomous long-term memory, graph databases, provider training/distillation, a background autonomous agent, or broad host-framework rewrites.

PACE / Evidence Paging 属于 Research Backlog，不是 v0 实现请求。禁止顺手增加：

- 新的 `ContextScorer`、core-side embedding 或超过 D-015 bounded policy 的 historical paging；
- PACE 式 Full / Detailed / Brief / Placeholder 多粒度表示；
- pressure-adaptive context selection 或 `glimpse()` / page-fault 恢复机制；
- Experience abstraction 或 learned compression policy。

除非 correctness failure 直接要求，不得以“未来最终需要”为理由继续增加 Context 算法或 retrieval 调参。D-015 的 bounded BM25 + caller-Dense 是唯一收口例外，不等同于 PACE 实现。

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
- Append-only Experience Ledger: implemented as research data plane; no Experience abstraction/promotion.
- Bounded operational Context policy: Checkpoint C Builder candidate，等待独立 QA；不构成 PACE 或效果先进性证据。
- PACE / multi-granularity Evidence Paging / Experience Formation: excluded after infrastructure freeze.
