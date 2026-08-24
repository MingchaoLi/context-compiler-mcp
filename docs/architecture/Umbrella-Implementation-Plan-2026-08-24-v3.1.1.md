# Umbrella Implementation Plan v3.1.1
## Long-term Agent / Context Compiler

> 状态：**总实施计划，不是单一 Codex 执行工单**
> Authority Contract：`LT-Agent-Architecture-Contract-2026-08-24-v3.1.1.md`

---

# 1. 定位

本文只负责：

- 阶段；
- 依赖；
- Promotion Gate；
- Child Work Order 注册表；
- 总体验收顺序。

Codex 不得把本文当作“一次实现全部”的 Work Order。

实际实施必须通过 Child Work Order：

```text
单一主要结果
明确 CAN READ / CAN CHANGE / MUST NOT CHANGE
独立 Acceptance
独立 QA
```

---

# 2. 总体阶段

## Phase 1 — Boundary / Inventory

目标：

- 获取当前 repo 真实结构；
- 冻结当前写入方 / 读入方；
- 划清 Core / Host；
- 建立共享 Revision / Stream / Transaction substrate 的实施依据；
- 不改变正式行为。

## Phase 2 — Runtime Contract Implementation

目标：

- 按 v3.1.1 Contract 在 feature flag / shadow 下实现新框架；
- 不直接 Promotion；
- 每个 Child WO 独立 QA。

## Phase 3 — Integrated Replay / Dogfood

目标：

- crash / concurrency / replay；
- dogfood；
- baseline comparison；
- critical mismatch。

## Phase 4 — Promotion Decision

独立决策，不属于任何 Builder 自动步骤。

---

# 3. Child Work Order Registry

## WO-01 — Current Architecture Inventory

**结果：** 当前 repo 的事实地图。
**允许：** 读代码、测试、schema、历史 artifact；生成报告。
**禁止：** 重构 / 改行为 / schema migration / 新 Runtime 实现。

交付：

- data writer map；
- data reader map；
- current call sequence；
- DB / schema map；
- crash / transaction map；
- current revision / cursor / operation identity map；
- current Core / Host leakage map；
- baseline / official artifact dependency map。

## WO-02 — Core / Host + Authority Boundary Refactor

依赖：WO-01。

结果：

- Core / Host 责任边界；
- Authority / Mutation Matrix；
- hidden writer 收敛；
- Wrap Before Split；
- 不做 Runtime 新行为。

## WO-03A — Shared Revision / Stream / Transaction Substrate

依赖：WO-02。

**这是 WO-03/WO-04 的共享前置，必须先完成。**

结果：

- namespace / stream_id；
- authority / `shadow:<experiment_id>` namespace substrate；
- ledger_revision；
- state_revision substrate；
- raw_frontier_revision substrate；
- takeover_commit_id + takeover_commit_revision；
- CAS primitive；
- commit marker / transaction helper；
- idempotent replay primitive。

禁止：

- Hot Raw 业务策略；
- State extraction 语义；
- Semantic Takeover 业务实现。

## WO-03B — Ledger High-water + Hot Raw Replay

依赖：WO-03A。

结果：

```text
Ledger high-water
+ committed Frontier revision/position
→ Hot Raw rebuild
```

包括：

- raw source projection input；
- ingest crash gap；
- cross-session Hot Raw；
- push as optimization only。

## WO-04 — State Revision + Semantic Takeover / Enrichment

依赖：WO-03A。

可与 WO-03B **有限并行**，但不得修改 WO-03A 冻结后的：

- revision allocator；
- namespace / stream schema；
- CAS semantics；
- transaction substrate。

结果：

- Immediate Authority commit；
- Lazy / targeted State commit；
- Fact epistemic / verification / lifecycle / record schema；
- Fact Policy / Registry；
- Relation Authority / Policy；
- SemanticTakeoverCommit；
- SemanticEnrichmentCommit；
- contiguous Frontier；
- fail-closed；
- Compaction Artifact identity。

## WO-05 — ContextSnapshot Contract

依赖：

- WO-03B；
- WO-04。

结果：

- Always-on Mechanical Projection；
- final Working Context assembly；
- immutable Snapshot Manifest；
- AttemptStarted binding；
- external content hash；
- Host opaque manifest；
- replay identity；
- concurrent Event boundary。

## WO-06 — Evidence Scope + 1-hop Ripple

依赖：WO-05 input contract frozen。

结果：

- Search Scope / Horizon；
- Anchor / Seed；
- bounded 1-hop Ripple；
- Relation Path provenance；
- DSH_HOME-style recovery fixture；
- EvidenceBundle contract。

## WO-07 — Operation / Attempt / Action Journal

依赖：WO-05 input contract frozen。

可与 WO-06 并行。

结果：

- operation_id；
- attempt_id；
- action_id；
- ActionIntent；
- ActionStarted；
- ToolResult durability；
- idempotency / reconciliation contract；
- Interrupt / cancellation state。

## WO-08 — Verification / Recovery / Outbox

依赖：

- WO-06；
- WO-07。

结果：

- AgentResponseGenerated；
- Verification statuses；
- bounded retry；
- objective Outcome / Feedback eventization；
- new Attempt on retry；
- side-effect reconciliation；
- ResponsePrepared；
- Outbox / delivery lifecycle。

## WO-09 — Full Crash / Concurrency / Replay Matrix

依赖：WO-08。

结果：

- ingest crash；
- takeover crash；
- CAS race；
- snapshot replay；
- action partial success；
- tool unknown state；
- retry side-effect safety；
- outbox delivery recovery；
- shadow namespace isolation tests。

本工单只验证已经由前置工单实现的行为；不得首次实现 Shadow isolation 或其他缺失能力。

## WO-10 — Shadow Dogfood / Promotion Evidence

依赖：WO-09。

结果：

- shadow routing；
- side-by-side；
- baseline comparison；
- correctness / continuity；
- critical mismatch；
- performance / cost；
- recommendation only。

**不自动 Promotion。**

---

# 4. 依赖图

```text
WO-01
  ↓
WO-02
  ↓
WO-03A  Shared Revision / Stream / Transaction Substrate
  ├───────────────┐
  ↓               ↓
WO-03B          WO-04
Hot Raw Replay  State / Takeover / Enrichment
  └───────┬───────┘
          ↓
        WO-05
     ContextSnapshot
       ┌────┴────┐
       ↓         ↓
     WO-06     WO-07
     Evidence   Operation/Action
       └────┬────┘
            ↓
          WO-08
   Verification/Outbox
            ↓
          WO-09
 Crash/Concurrency/Replay
            ↓
          WO-10
 Shadow Dogfood/Evidence
            ↓
    Separate Promotion Decision
```

---

# 5. Shared Change-Surface Rule

硬规则：

> QA / replay 工单不能承担任何能力的首次实现。发现前置实现缺失时必须返回对应 Builder 工单，不能一边补实现一边验证。

任何 Child WO 必须声明：

```text
CAN READ
CAN CHANGE
MUST NOT CHANGE
MUST PRESERVE
DEPENDENCIES
CRASH CASES
ACCEPTANCE
QA HANDOFF
```

尤其：

## WO-03B / WO-04 有限并行

两者共享底层，但：

> 只有 WO-03A 可以定义 / 修改共享 revision substrate。

WO-03B 和 WO-04 不得各自再次修改：

- revision allocator；
- stream identity；
- CAS contract；
- common transaction marker。

若发现 WO-03A 合同不足：

> 停止并提交 substrate change proposal，不得私自分叉实现。

## WO-06 / WO-07 并行

前提：

> WO-05 已冻结 ContextSnapshot Builder 输入 /输出合同。

---

# 6. Shadow Namespace Gate

任何 Shadow Child WO 产生：

- State；
- Relation；
- Snapshot；
- Evidence metrics；

必须进入：

```text
namespace = shadow:<experiment_id>
```

不得进入 authority 默认读取路径。

Promotion：

```text
shadow object
→ PromotionProposal
→ authority revalidation/recompute
→ new authority object
→ DERIVED_FROM shadow object
```

---

# 7. 总体 Promotion Gate

至少满足：

- Phase 1 behavior-preserving；
- official artifacts 未覆盖；
- replay deterministic；
- crash consistency；
- concurrency / CAS race 通过；
- Hot Raw 不丢；
- State / Frontier revision 一致；
- Snapshot 可审计；
- Tool side effects 不盲 retry；
- Recovery bounded；
- Delivery lifecycle 正确；
- shadow namespace 无污染；
- dogfood 样本量足够；
- correctness / continuity 无 critical mismatch；
- cost / performance 可接受。

满足后：

> 只允许提出 Promotion Proposal。

是否 Promotion 为独立决策。

---

# 8. 当前非 Scope

Umbrella 不负责直接实现：

- Graph DB；
- Experience Formation；
- retention / 脱敏策略；
- 最终 Retriever 选型；
- Heavy Verification model；
- Authority Detector 最终算法；
- 微服务；
- 外部产品 UI。

---

# 9. Repository Import / Execution Gate

在任何 Child WO 启动前必须：

```text
Contract / Umbrella / Child WO 进入 repository authority
→ docs-only import QA
→ 固定 source_baseline_HEAD
→ 建立 Execution Baseline Manifest
```

`source_baseline_HEAD` 表示 Inventory 所描述的固定代码世界，不要求交付期间 HEAD 永远不变。正常 inventory / handoff 文档提交产生 `delivery_HEAD`；独立 QA 必须确认 `source_baseline_HEAD..delivery_HEAD` 只包含该 Child WO 允许的分析产物。

# 10. 文档 Authority 层级

```text
Architecture Contract v3.1.1
= 统一、完整、权威目标协议

Umbrella Implementation Plan v3.1.1
= 阶段、依赖、Promotion Gate、Child WO 注册表

Child Work Order
= Codex 实际执行的单结果任务

QA / Challenge Report
= 对某个 Child WO 的独立验证
```

下层文档不得重新定义上层 Contract；若冲突，以 Architecture Contract v3.1.1 为准。
