# WO-01 — Current Architecture Inventory
## Long-term Agent / Context Compiler

**状态：** PLANNED / NOT STARTED — EXECUTION BASELINE NOT YET FROZEN
**类型：** Analysis / Inventory Only
**依赖：** `LT-Agent-Architecture-Contract-2026-08-24-v3.1.1.md`、`Umbrella-Implementation-Plan-2026-08-24-v3.1.1.md`
**目标：** 建立当前 repo 的事实地图，为后续边界重构和 revision substrate 设计提供输入。
**禁止：** 本工单不修改产品行为，不进入实现。

---

# 1. 核心原则

本工单只回答：

> **现在系统实际上是怎么工作的？**

不要尝试：

> **把它顺手改成 v3.1.1。**

Target Architecture 只能作为审计维度，不能被当作“当前实现已经存在”的假设。

---

# 2. Execution Baseline Gate

WO-01 开始前必须存在 `Execution Baseline Manifest`，至少记录：

```text
repository_path
branch
source_baseline_HEAD
expected_parent / base reference（若项目需要）
worktree_status
worktree_clean
submodule_revisions（如存在）
relevant_config_fingerprint
inventory_started_at
```

硬 Gate：

```text
source_baseline_HEAD 已固定
tracked 与相关 untracked worktree 状态已记录且满足 clean policy
Contract / Umbrella / WO-01 已进入 repository authority
Current Work Order 已指向 WO-01
```

`source_baseline_HEAD` 是本次 Inventory 描述的固定代码世界。正常 WO-01 文档提交只产生：

```text
delivery_HEAD
= source_baseline_HEAD
+ 仅允许的 inventory / handoff 文档变更
```

它不重新定义 `source_baseline_HEAD`。

以下任一情况使 baseline 失效，必须停止或重新建立：

- source / schema / test / config / official artifact 相对 baseline 变化；
- 未经授权并行提交；
- 未记录的相关 worktree 修改；
- Builder 实际分析 baseline 之后的代码。

Independent QA 必须同时确认：

```text
报告声明的 source_baseline_HEAD 正确
+
source_baseline_HEAD..delivery_HEAD
只包含 WO-01 允许的分析产物
```

# 3. CAN READ

按确定性三阶段策略读取：

### Stage A — 机械索引

索引全部 tracked files、schema、migration、entrypoint 与 test topology，不等于逐文件深读。

### Stage B — 定向深读

依据 writer / reader / call-chain 定向读取相关 source 与 test。

### Stage C — 必要历史

只有当前树无法解释 provenance 时才读取必要 Git history。

必须记录：

```text
files_indexed
files_deeply_inspected
commits_inspected
paths_excluded
exclusion_reason
```

允许范围包括：

- source code；
- test；
- schema / migration；
- config；
- current MCP / transport；
- Context / State / Retrieval 实现；
- evaluation / QA runner；
- current official artifacts；
- git history 中与当前实现相关的必要提交；
- 现有 architecture / design docs。

---

# 4. CAN CHANGE

只允许新增 / 更新本 WO 自己的分析产物：

```text
docs/inventory/WO-01/**
docs/handoffs/WO-01-current-architecture-inventory.md
```

可能生成 cache、build artifact 或临时 DB 的诊断动作只能在隔离临时副本执行，不得把临时产物提交到 Git。Builder 不得创建 `docs/qa/` 结果文件。

不得修改生产实现。

---

# 5. MUST NOT CHANGE

禁止：

- source behavior；
- DB schema；
- migration；
- runtime flags；
- State semantics；
- Retrieval algorithm；
- Context algorithm；
- official evaluation artifact；
- frozen baseline；
- dependency；
- tool execution behavior；
- network / provider config。

额外硬限制：

- 不调用远端模型；
- 不访问网络；
- destructive commands 全部禁止；
- 不修改正式数据库；
- 可能生成 cache、build artifact、临时 DB 的诊断命令只能在 isolated temporary copy / test harness 中运行；
- 不得改变正式代码路径。

---

# 6. 必须产出的地图

## 6.1 Repository / Runtime Topology

列出：

- entrypoint；
- MCP / transport；
- core runtime；
- DB / storage；
- Context；
- State；
- Retrieval；
- tool execution；
- verification / evaluation；
- background task；

当前实际文件 / class / function 对应关系。

不要按 v3.1.1 强行分模块；记录真实结构。

---

## 6.2 Data Writer Map

对以下数据逐项确认实际 Writer：

```text
Raw Event / message history
State
State delta
Summary / compiled context
Raw / recent window
Fact-like record
Relation / edge
Retrieval cache / index
Tool result
Action / operation record
Outcome / failure / recovery
Response / delivery record
```

每项记录：

```text
data
writer file/function
write path
transaction?
multiple writers?
validation?
provenance?
```

重点标红：

- multiple writers；
- hidden mutation；
- direct DB access；
- model output directly persisted。

---

## 6.3 Data Reader Map

确认：

- 谁读取 State；
- 谁读取 Raw；
- 谁读取历史；
- 谁读取 Relation；
- 谁读取 Tool Result；
- 谁读取 persisted operation / outcome。

区分：

```text
pure read
read + interpretation
read + hidden mutation
```

---

## 6.4 Current Control Flow

画 Mermaid sequence diagram，至少包括：

```text
User / Host
Ingest
Context preparation
State
Retrieval
Main Agent / Model
Tool execution
Verification
Persistence
Retry / Recovery
Response
```

如果当前不存在某一步，明确写：

```text
NOT PRESENT
```

不要为了匹配 v3.1.1 补画不存在的模块。

---

## 6.5 Current Persistence / Transaction Map

列出所有持久化动作：

```text
write
DB/file/table
transaction boundary
commit point
crash before
crash after
recovery behavior
idempotent?
```

至少检查：

- ingest；
- State update；
- context / summary；
- raw window；
- relation / edge；
- tool result；
- action / outcome；
- response；
- background maintenance。

---

## 6.6 Revision / Cursor / Identity Inventory

检查当前是否已有类似概念：

```text
sequence
cursor
revision
version
generation
epoch
session_id
operation_id
request_id
attempt_id
tool_call_id
idempotency key
```

对每个记录：

- scope；
- monotonicity；
- uniqueness；
- persistence；
- reuse semantics。

特别回答：

> 当前是否存在可以直接复用为 v3.1.1 Shared Revision Substrate 的基础？

不要在 WO-01 创建新 substrate。

---

## 6.7 Raw / Hot Context Recovery Map

回答：

- Raw 的 durable source 是什么？
- recent / hot context 如何形成？
- 是否依赖内存 push？
- crash 后如何重建？
- session 切换是否会丢未结构化历史？
- 是否存在 high-water / cursor？

---

## 6.8 State Authority Map

回答：

- 谁提出 State？
- 谁验证？
- 谁真正写 State？
- State 是每轮更新还是按条件更新？
- 是否存在 Pending / Committed 区分？
- State 与 Raw 的 provenance 如何关联？
- State 是否可能落后于 Raw？
- 如果落后，当前系统如何避免信息丢失？

---

## 6.9 Relation / Graph Inventory

检查：

- 是否已有 edge / link / relation table；
- relation 是否只有 ID join；
- 是否有 relation_type；
- 是否有 origin / confidence / provenance；
- 谁创建 / 谁修改；
- 是否有 graph traversal；
- 是否有 recursive retrieval；
- 是否有 Event Ripple 原型。

不要新增 Graph DB。

---

## 6.10 Evidence Retrieval Inventory

记录：

- FTS / BM25 / Dense / Hybrid 当前实现；
- Candidate Scope / Horizon 如何确定；
- Top-K；
- query construction；
- recovery；
- targeted retrieval；
- 是否已有 DSH_HOME 类 scope miss fixture；
- retrieval miss 当前如何处理。

---

## 6.11 Context Compaction Inventory

记录：

- mechanical dedup；
- tool output folding；
- summary；
- semantic compaction；
- recent-N / token window；
- closed/open 判断；
- raw suppression；
- provenance；
- current Context assembly。

特别回答：

> 当前系统是否把固定轮次当成硬边界？

---

## 6.12 Tool / Side-effect Lifecycle Inventory

检查当前：

```text
Agent
→ ToolCall
→ Tool Executor
→ ToolResult
```

回答：

- Main Agent 是否直接执行；
- Tool 之前是否有 durable intent；
- 是否有 operation/tool-call identity；
- crash after side effect 如何处理；
- 是否支持 idempotency / reconciliation；
- retry 是否可能重复副作用。

---

## 6.13 Verification / Recovery Inventory

检查：

- 是否存在 pre-check / red-flag；
- verification 是否每请求运行；
- 是否使用 objective oracle；
- retry budget；
- recovery loop；
- scope expansion；
- failure status。

---

## 6.14 Response / Delivery Inventory

确认当前：

- response 何时产生；
- 是否 durable；
- user delivery 前后顺序；
- 是否有 delivery acknowledgement；
- crash after prepared / before delivery 如何表现。

---

## 6.15 Core / Host Leakage Map

按 v3.1.1 的责任边界审计，但只记录现状。

重点：

- Core 是否 import provider-specific SDK；
- State / Evidence 是否知道 Host；
- Main Agent 是否直接写 DB；
- Tool Executor 是否能修改 State；
- transport 是否直接修改 Relation / State；
- memory core 是否承担 UI / delivery。

---

## 6.16 Shadow / Baseline Inventory

确认：

- 当前是否有 feature flag；
- shadow output 存哪里；
- shadow 是否会进入正式 State / Retrieval；
- official artifacts 路径；
- frozen baseline；
- 是否存在覆盖旧 artifact 的风险。

---

# 7. Crash Gap Matrix

至少枚举：

```text
Ingest commit 后 crash
State write 中 crash
Context/summary write 中 crash
Frontier/recent cursor 中 crash
Tool side effect 前 crash
Tool side effect 后 / ToolResult 前 crash
ToolResult 后 / verification 前 crash
Response 生成后 / 返回用户前 crash
用户收到后 / ledger 回写前 crash
background relation update 中 crash
```

对于每个 gap：

```text
current behavior
data lost?
duplicate risk?
replay deterministic?
severity
evidence
```

---

# 8. Gap Analysis Against v3.1.1

只做差异分析，不实现。

分类：

```text
ALREADY SATISFIED
PARTIALLY SATISFIED
MISSING
CONFLICTS WITH CURRENT BEHAVIOR
UNKNOWN
```

重点不是“有多少缺口”，而是：

> 哪些现状能力可以直接复用，哪些必须在后续 Child WO 处理。

---

# 9. 不得在 WO-01 决定的事项

WO-01 禁止决定：

- namespace / stream schema 最终形态；
- revision allocator；
- transaction substrate；
- ContextSnapshot schema 最终实现；
- Takeover / Enrichment DB migration；
- Retriever 选型；
- Graph DB；
- Authority Detector；
- Heavy Verifier；
- Experience Formation。

这些属于后续 WO。

---

# 10. Deliverables

至少：

1. `current-architecture-inventory.md`
2. `current-runtime-sequence.md`
3. `data-writer-reader-map.md`
4. `persistence-transaction-map.md`
5. `revision-identity-inventory.md`
6. `crash-gap-matrix.md`
7. `core-host-leakage-map.md`
8. `v3.1.1-gap-analysis.md`
9. `phase1-recommendation.md`
10. Builder QA handoff requirements：`docs/handoffs/WO-01-current-architecture-inventory.md`
11. Independent QA 另行创建：`docs/qa/WO-01-current-architecture-inventory.md`

---

# 11. Acceptance

- [ ] 没有生产实现修改；
- [ ] 没有 schema migration；
- [ ] 没有 official artifact 覆盖；
- [ ] 所有主要 Writer / Reader 有代码证据；
- [ ] 当前时序图只描述真实现状；
- [ ] 所有 crash gap 有当前行为描述；
- [ ] revision / identity 现状已盘点；
- [ ] Core / Host leakage 已盘点；
- [ ] v3.1.1 Gap Analysis 有证据；
- [ ] Unknown 明确标 Unknown，不猜；
- [ ] 可以直接作为 WO-02 / WO-03A 输入；
- [ ] 报告声明固定 `source_baseline_HEAD`；
- [ ] `source_baseline_HEAD..delivery_HEAD` 只包含允许的 inventory / handoff 文档；
- [ ] files indexed / deeply inspected、commits inspected、excluded paths 均有清单；
- [ ] 没有远端模型、网络或 destructive command；
- [ ] Builder 只写 handoff requirements，不写 Independent QA Result；
- [ ] 独立 QA 可在不依赖 Builder 主观解释的情况下复核。

---

# 12. 最终结论格式

报告最后必须只给：

```text
CURRENT ARCHITECTURE STATUS:
- Stable / partially coupled / highly coupled

HIGHEST-RISK BOUNDARY VIOLATIONS:
1.
2.
3.

REUSABLE FOUNDATIONS FOR v3.1.1:
1.
2.
3.

MUST-FIX BEFORE PHASE 2:
1.
2.
3.

RECOMMENDED NEXT CHILD WO:
WO-02 / WO-03A / prerequisite fix
```

不要在 WO-01 直接实施推荐。
