# Decision register

## D-001 — Durable evidence first

Raw events are immutable and append-only. State and headlines reference evidence; they do not replace or delete it.

## D-002 — Build context from active state

Assembly starts from known-active typed state, adds required dependency closure and a recent raw window, then the current input. It does not semantically prune full history.

## D-003 — Code owns transitions

Extractor output is an untrusted State Delta. Strict parsing and the deterministic reducer own all durable transitions. Invalid output cannot partially mutate state.

## D-004 — Recovery is exact

Suppressed or historical information remains addressable through immutable headlines and raw evidence recall. Archive/suppression is not deletion.

## D-005 — Provider neutrality

The core defines `ExtractorTransport` but does not select, call, or bundle a model provider. Provider selection is deferred until after evaluation.

## D-006 — Standalone MCP boundary

The package is `context-compiler-mcp`, uses the official MCP SDK over stdio, and exposes exactly seven approved tools in this baseline. Application adapters remain outside this repository.

## D-007 — Compatibility without host dependency

`CONTEXT_COMPILER_DB_PATH` is the canonical configuration. The prior `DSH_HOME/sessions/context-compiler.db` resolution remains as a legacy fallback so approved adapters keep working, but no host code or package is imported.

## D-008 — Safe sequencing

State update preparation/application precedes evaluation; evaluation precedes optional extractor selection; formal host compiler mode is considered only after those results.

## D-009 — Durable preparation before mutation

State updates use an immutable persisted preparation identity over a bounded raw-event suffix, visible state, relations, and required provenance. The complete untrusted delta is strictly parsed before mutation. Apply then rebuilds the snapshot fingerprint and checks the expected state revision inside the same `BEGIN IMMEDIATE` transaction as reducer execution. Appended raw events are allowed; stale or conflicting state is not.

## D-010 — Labeled offline evaluation before provider selection

Evaluation uses strict versioned snapshots and explicit exact-text/recall labels rather than asking a model to grade itself. D0, D1, and D2 share the existing deterministic token estimator; D2 uses the approved assembler and recall primitives. Aggregate thresholds and distinct CLI exits make the result automation-friendly while keeping provider selection deferred to ST-03.

## D-011 — Provider adapters remain outside the process boundary

The optional runtime transport spawns one explicitly supplied local executable with `shell: false` and exchanges strict versioned JSON over stdio. The child, not the core, owns provider SDKs, network requests, credentials, and vendor response translation. The core retains prompt construction, strict State Delta validation, retry/fallback policy, revision checks, and atomic state application. Runtime invocation is explicit library behavior and does not change the nine-tool MCP service.

## D-012 — 独立 QA 与对抗审查分工

独立 QA 负责验证一个有界工单是否按约定实现；对抗审查负责质疑目标、顺序、依赖和投入是否必要。项目可在关键节点申请独立对抗审查，尤其是在进入新阶段、扩大运行时或宿主边界、连续多个工单沿同一路径通过，或 blocker 定义存在争议时。对抗审查默认只读，其 `Challenge` 不自动回滚已接受工单，也不自动成为 blocker；主控必须记录后续处置：补充证据、接受风险，或创建新的有界工单。

## D-013 — 评估尺子版本化且历史保留不由当前输入证明

ST-02 evaluator version 1 保留原始语义用于历史复现。测量有效性修正进入独立 version 2：Probe 必须带来源，空分母显式为 `not_evaluable`，历史连续性只在排除 `current_input` 的历史投影中检查。完整模型输入仍用于 token 和 latency 统计。Version 2 额外报告 D2 相对 D1 的原始 token delta/ratio，但在真实数据形成前不新增加权分数或决策门。

## D-014 — State should be compiled; historical evidence may be paged later

v0 的唯一核心职责是 State Compilation：把 Raw Events 编译为带 lifecycle、relation 与 provenance 的 authoritative active state，再由 dependency-aware assembler 生成工作上下文。ACTIVE Constraint、Decision 与 OpenQuestion 不参与普通 semantic relevance competition，不能因与当前输入相似度低而被淘汰。

长期架构将 State、Evidence、Experience 分层：Evidence Paging（包括 PACE 类语义相关性、多粒度摘要、pressure-adaptive selection 与按需恢复）和 Experience abstraction 都是未来 Research Backlog / Extension Point，不属于 v0。现有 headline/recall 是显式恢复原语，不授权新增运行时 History Pager。

执行顺序固定为 Correctness → Context Reduction → Operational Stability。三个 Gate 未通过前，不实现 PACE/Evidence Paging/Experience。Unless a current test failure directly requires it, do not introduce PACE-related mechanisms into the v0 implementation. Treat this decision as a scope-freeze clarification, not a request for architectural expansion.
