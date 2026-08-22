# Harness Context Compiler v0 — Codex Implementation Brief

## 0. 任务目标

为现有 Harness / 桌宠增加一个独立的 **Context Compiler（上下文编译器）**。

核心目标不是增加长期记忆能力，而是：

> **在不明显损害长对话任务连续性的前提下，减少每轮发送给远端 LLM 的有效上下文 Token。**

当前系统不要继续采用：

```text
Full Conversation History
        ↓
Remote LLM
```

目标改为：

```text
Current Input
+
Active State
+
Recent Raw Window
+
On-demand Retrieved History
        ↓
Remote LLM
```

核心设计原则：

> **不要从完整历史中猜哪些内容应该删除；从明确仍然有效的状态开始重新组装当前 Working Context（工作上下文）。**

------

# 1. 本版本明确不做什么

v0 必须严格控制范围。

不要实现：

- Experience（经验）形成；
- Episode → Experience 抽象；
- Intuition Layer（直觉层）；
- 用户长期人格画像；
- 自动偏好学习；
- 长期行为建模；
- aggressive semantic deletion；
- 让远端大模型负责上下文压缩；
- 全量历史初始化理解；
- 复杂 Knowledge Graph；
- 独立 Graph Database；
- 训练新模型；
- 自动修改 system prompt；
- 永久删除历史。

这些属于后续阶段。

v0 只解决：

> **Conversation / Task State → Minimal Working Context**

------

# 2. 总体原则

## 2.1 Raw History 永久保留

所有 User / Assistant / Tool Event 首先写入 durable raw store。

Context Compiler 的任何：

- suppress；
- compress；
- supersede；
- archive；

都不得物理删除 Raw Source。

原则：

```text
Storage != Active Context
```

被移出当前上下文：

```text
!=
被遗忘
```

------

## 2.2 Build-up，而不是 Pruning

禁止设计成：

```text
Full History
↓
LLM 判断哪些没用
↓
删除
```

目标是：

```text
Known Active State
+
Recent Window
+
Selective Recall
↓
Working Context
```

即：

> **每轮重新 assemble 一个小 Context，而不是从巨大 Context 里做减法。**

------

## 2.3 False Delete 成本远高于 False Keep

设计时默认：

```text
Cost(FalseDelete) >> Cost(FalseKeep)
```

如果无法确定一条信息是否应该退出：

> 不删除。

可以：

- 保留；
- 压缩；
- 只留下 retrieval handle；
- 移出 active context。

但原始数据必须可恢复。

------

## 2.4 LLM 负责识别 Delta，代码负责修改 State

不要让 LLM 自由管理 Context State。

推荐：

```text
New Turn
↓
State Extractor
↓
Structured Delta JSON
↓
Deterministic Reducer
↓
New Active State
```

LLM / 本地模型只负责输出：

> “发生了什么状态变化？”

实际状态修改由 deterministic code 完成。

------

# 3. 第一版 Active State 类型

v0 只维护以下五种一等对象：

```text
Goal
Constraint
Decision
OpenQuestion
RejectedAlternative
```

后续可以扩展，但本次不要扩。

------

## 3.1 Goal

表示当前仍有效的任务目标。

示例：

```text
Goal:
实现 Harness Context Compiler MVP。
```

字段建议：

```text
id
session_id
content
status
created_at
updated_at
source_refs
```

状态：

```text
ACTIVE
COMPLETED
SUPERSEDED
```

------

## 3.2 Constraint

当前执行不能违反的约束。

例如：

```text
不允许依赖远端模型判断 Context 删除。
Raw History 不得物理删除。
```

Constraint 默认应优先进入 Working Context。

------

## 3.3 Decision

已经形成的有效决定。

例如：

```text
Decision:
Working Context 使用 Active State + Recent Raw Window + Retrieval。
```

建议额外记录：

```text
reason
supersedes
reopen_if
```

例如：

```text
decision:
使用方案 B

reason:
方案 A 在测试中导致约束丢失

supersedes:
D12

reopen_if:
底层模型或数据结构发生重大变化
```

`reopen_if` 是重要字段。

目标：

> 避免已经讨论并排除的方案因为 Context 缩短而被远端模型不断重新提出。

------

## 3.4 OpenQuestion

仍未解决的问题。

例如：

```text
如何可靠检测 Decision Supersession？
```

状态：

```text
OPEN
RESOLVED
DEFERRED
```

解决后：

```text
resolved_by -> Decision ID
```

------

## 3.5 RejectedAlternative

明确被否决的历史方案。

不要保留完整争论进入 Active Context。

只保留简短 tombstone：

```text
Alternative:
每轮重新总结全部历史

status:
REJECTED

reason:
成本过高，并依赖远端 LLM

reopen_if:
出现低成本、高可靠本地总结方案
```

Raw discussion 仍存在 History Store。

------

# 4. Recent Raw Window

必须保留近期原始对话作为安全缓冲。

不要要求 State Extractor 100% 正确。

建议初始值：

```text
6–10 turns
```

配置化：

```text
recent_raw_window_turns
```

Recent Window 内：

> 保留原始文本。

超过窗口后：

> 不自动删除，而进入 Raw History，并依赖 Active State / Headline / Recall。

------

# 5. Raw Event Store

第一版推荐 SQLite。

原因：

- 本地；
- 简单；
- 可查询；
- 易调试；
- 桌宠非常适合；
- 无需增加服务依赖。

建议最少表：

```text
sessions
raw_events
context_items
state_relations
headlines
```

------

## 5.1 raw_events

建议：

```text
id
session_id
seq
role
content
event_type
created_at
token_count
metadata_json
```

要求：

> append-only。

禁止 Context Compiler 修改原始事件内容。

------

## 5.2 context_items

```text
id
session_id
type
content
status
confidence
created_at
updated_at
metadata_json
```

type：

```text
GOAL
CONSTRAINT
DECISION
OPEN_QUESTION
REJECTED_ALTERNATIVE
```

------

## 5.3 state_relations

```text
source_id
relation_type
target_id
created_at
```

第一版至少支持：

```text
SUPERSEDES
DEPENDS_ON
RESOLVED_BY
REJECTS
DERIVED_FROM
```

不需要 Graph DB。

SQLite relation table 足够。

------

## 5.4 headlines

每段已经退出 Recent Window 的历史，允许生成非常短的 retrieval headline。

示例：

```text
数据库迁移讨论｜决定 PostgreSQL｜MySQL 已排除
```

字段：

```text
event_start
event_end
headline
keywords
embedding_ref optional
```

第一版 embedding 可以是 optional。

先支持：

```text
SQLite FTS
```

后续再补 Dense Retrieval。

------

# 6. State Extractor

State Extractor 应作为独立接口存在。

可以：

- 小型本地 LLM；
- 当前 Harness 已有便宜模型；
- 测试阶段先用远端模型模拟；

但架构上不能和具体模型绑定。

输入：

```text
Current Active State
+
Recent Raw Context
+
Newest Turn / Tool Result
```

输出严格 JSON。

示例：

```json
{
  "new_goals": [],
  "updated_goals": [],
  "new_constraints": [],
  "updated_constraints": [],
  "new_decisions": [],
  "resolved_questions": [],
  "new_open_questions": [],
  "rejected_alternatives": [],
  "supersessions": []
}
```

禁止输出：

- 用户画像；
- Experience；
- 性格推断；
- 长期偏好；
- 情绪推断。

只做 Task State Extraction。

------

# 7. Deterministic State Reducer

这是核心组件。

Reducer 不调用 LLM。

职责：

```text
State_t
+
Delta_t
→
State_t+1
```

必须实现：

### Create

新增 Goal / Constraint / Decision / OpenQuestion。

### Resolve

OpenQuestion：

```text
OPEN → RESOLVED
```

### Supersede

例如：

```text
D19 supersedes D12
```

则：

```text
D12.status = SUPERSEDED
D19.status = ACTIVE
```

### Reject

Alternative：

```text
ACTIVE/CANDIDATE → REJECTED
```

### Complete

Goal：

```text
ACTIVE → COMPLETED
```

------

# 8. Context Assembly

禁止让 LLM自由生成最终 Prompt。

使用 deterministic assembler。

推荐结构：

```text
# Current Goal

...

# Active Constraints

...

# Active Decisions

...

# Open Questions

...

# Relevant Historical Notes

...

# Recent Conversation

...

# Current User Input

...
```

最终：

```text
CompiledContext
```

必须可独立查看和调试。

------

# 9. Working Context Selection Policy

第一版采取保守规则。

## Always Retain

必须进入：

- Current User Input；
- ACTIVE Goal；
- ACTIVE Constraint；
- ACTIVE Decision；
- OPEN OpenQuestion；
- Recent Raw Window。

------

## Compact

以下内容只保留短表示：

- ACTIVE Decision 的 rationale；
- Rejected Alternative；
- Superseded Decision tombstone；
- 历史任务节点。

------

## Suppress

可以退出 Active Context：

- 明确 SUPERSEDED；
- 明确 REJECTED；
- 已 COMPLETED 且当前无依赖；
- 重复内容；
- 已经被有效 Decision / Constraint 覆盖的冗长讨论过程。

注意：

```text
SUPPRESS != DELETE
```

------

## Recall On Demand

所有 Suppressed / Archived 内容必须：

```text
可搜索
可恢复
可定位 Raw Source
```

------

# 10. Dependency Safety

不能只看单个 Context Item 是否 relevant。

如果：

```text
Decision D7
depends_on
Constraint C2
```

而 D7 是当前 Active Decision：

> C2 必须保留。

Assembler 应执行一个简单的 dependency closure。

例如：

```text
KeepSet
=
ActiveItems
+
Dependencies(ActiveItems)
```

第一版只需要 BFS / DFS。

------

# 11. History Recall

第一版至少实现两种：

## Exact Recall

输入：

```text
event_id / seq range / headline id
```

返回原文。

## Keyword Recall

SQLite FTS。

后续可增加：

```text
Embedding Retrieval
BM25
Hybrid
```

但不是当前阻塞项。

------

# 12. 插件 / Service 边界

不要把 Context Compiler 强耦合到桌宠。

优先实现独立模块。

建议接口：

```text
ingest(event)

compile(session_id, current_input, token_budget)

get_state(session_id)

recall(session_id, query/id/range)
```

如果 Harness 是本进程：

> 直接 library API。

如果架构更适合 service：

```text
POST /sessions/{id}/ingest

POST /sessions/{id}/compile

GET /sessions/{id}/state

POST /sessions/{id}/recall
```

Codex 应先检查 Harness 当前架构，再选择侵入性最低的方法。

------

# 13. Harness 桌宠集成

必须使用 feature flag。

例如：

```text
context_compiler.enabled = false
```

默认先关闭。

模式：

```text
full
window
compiler
```

支持运行时切换：

```text
context_mode = full
context_mode = window
context_mode = compiler
```

用于 A/B 测试。

------

# 14. Shadow Mode

第一阶段建议先做 Shadow Mode。

流程：

```text
正常：
Full Context → Remote LLM

旁路：
Context Compiler → Compiled Context
```

但 Compiled Context 暂时不影响回答。

只记录：

```text
full_tokens
compiled_tokens
active_state
suppressed_items
recall_handles
```

目标：

> 先验证 Compiler 的状态维护是否稳定。

然后再开启真正 `compiler` 模式。

------

# 15. 最小 UI：Context Lens

如果桌宠 UI 修改成本不高，可增加调试入口：

```text
Context Lens
```

显示：

```text
Full History:       18,320 tokens
Compiled Context:    2,480 tokens
Reduction:              86.5%
```

以及：

```text
Active Goals
Active Constraints
Active Decisions
Open Questions
Suppressed / Superseded
Recallable History
```

注意：

Context Lens 第一版主要是开发/debug 工具，不要求漂亮。

------

# 16. Metrics

每次 compile 记录：

```text
full_context_tokens
compiled_context_tokens
recent_window_tokens
active_state_tokens
retrieved_tokens
compile_latency_ms
extractor_latency_ms
retrieval_latency_ms
```

计算：

```text
TokenReduction
=
1 - compiled_context_tokens / full_context_tokens
```

同时记录 Context Compiler 自身成本。

未来计算：

```text
NetGain
=
RemoteContextCostSaved
-
LocalContextManagementCost
```

v0 暂时只记录，不需要做复杂经济模型。

------

# 17. Evaluation

至少支持三个 baseline：

## D0 — Full Context

```text
完整会话
→ Remote LLM
```

## D1 — Sliding Window

```text
最近 N turns
→ Remote LLM
```

## D2 — Context Compiler

```text
Active State
+
Recent Raw
+
Recall
→ Remote LLM
```

------

# 18. Eval Case 类型

构造或从 Harness 历史中抽取以下测试。

## 18.1 Constraint Retention

很早之前建立：

```text
禁止使用方案 X
```

经过大量无关对话后继续任务。

检查：

> 是否违反 X。

------

## 18.2 Decision Continuity

早期已经确定：

```text
采用方案 A
```

后面问：

```text
下一步怎么做？
```

检查是否：

> 基于 A 继续，而不是重新设计。

------

## 18.3 Resolved Issue Reopening

历史已经明确排除方案 B。

之后继续设计。

指标：

```text
ResolvedIssueReopeningRate
```

即：

> 模型是否重新提出已经排除的问题/方案。

这个指标必须保留。

------

## 18.4 Open Question Continuity

早期存在：

```text
Open Question Q
```

经过大量中间讨论后继续。

检查是否：

> 能正确回到 Q。

------

## 18.5 Historical Recovery

某条历史此前已经 Suppressed。

之后出现一个新问题，使该历史重新相关。

检查：

> recall 是否成功恢复必要信息。

指标：

```text
RecallRecoveryRate
```

------

# 19. v0 验收指标

必须至少输出：

```text
Context Token Reduction
Constraint Retention Rate
Decision Continuity Rate
Resolved Issue Reopening Rate
Open Question Continuity
Recall Recovery Rate
Local Compile Latency
```

第一阶段不要预设非常激进的 Token Reduction 指标。

优先级：

```text
Correctness
>
Recoverability
>
Token Reduction
```

宁愿第一版只减少 30% Token，也不要因为追求 80% 导致状态丢失。

------

# 20. 失败策略

任何情况下：

```text
Compiler failure
```

必须能够 fallback：

```text
Recent Window
```

或者：

```text
Full Context
```

Context Compiler 不得成为远端调用的单点故障。

建议：

```text
if compile_failed:
    fallback_to = configured_safe_mode
```

------

# 21. 参考项目与需要借鉴的内容

## 21.1 QwenPaw — Scroll Context

Repository：

```text
agentscope-ai/QwenPaw
```

重点阅读：

```text
ScrollContextManager
context management docs
history.db
eviction index
continuation summary
recall_history
SQLite / FTS history
```

核心思想：

> 旧历史首先持久化，然后退出 live context；原始内容不丢失，在 active context 中使用紧凑索引，并允许按需恢复。

QwenPaw 当前文档明确将 working memory、durable episodic history 和 semantic memory 分开；ScrollContextManager 会先写入 SQLite，再驱逐历史，并维护 continuation summary 和可展开索引。

QwenPaw 使用 Apache License 2.0。

### 本项目主要借鉴

```text
Durable-first history
Recent live window
Compact history headline/index
On-demand exact recall
SQLite FTS
```

不要直接照搬其完整 Memory 系统。

------

## 21.2 Context Window Lifecycle — CWL

Repository：

```text
Kiz8-Team/pi-cwl
```

Paper：

```text
Beyond Compaction:
Structured Context Eviction for Long-Horizon Agents
```

重点阅读：

```text
typed episode graph
dependency edges
graduated eviction
deterministic model-free eviction
token budget handling
```

CWL 的关键价值是：历史在产生过程中被组织成 typed、dependency-linked episodes；超过预算时使用 deterministic、LLM-free eviction，而不是再调用模型总结整段历史。

Repository 为 MIT License。

### 本项目主要借鉴

```text
Dependency-aware context lifecycle
Deterministic state transition
Deterministic eviction
Recoverability thinking
```

CWL 的 `expl/act` 类型不要直接照搬。

我们的类型固定为：

```text
Goal
Constraint
Decision
OpenQuestion
RejectedAlternative
```

------

## 21.3 VISTA

Repository：

```text
binyxu/VISTA
```

重点阅读：

```text
WorkspaceManager
register_message
assemble
stable block IDs
archive
recover
payload storage
block state machine
token accounting
```

VISTA 将 append-only conversation 转换为 typed、addressable blocks，并把 archive 设计成可恢复 relocation，而不是不可逆删除；`assemble()` 负责真正构造送给模型的上下文。

### 本项目主要借鉴

```text
Stable Context Item ID
Block state
Archive != delete
Exact payload recovery
Assemble instead of passing raw history
```

**在复制任何 VISTA-specific 代码前必须自行检查当前 repository license；若授权不清晰，仅借鉴设计，不直接复制实现。**

------

## 21.4 Context as a Tool — CAT

Paper：

```text
Context as a Tool:
Context Management for Long-Horizon SWE-Agents
```

CAT 将 Context Workspace 划分为：

```text
Stable Task Semantics
+
Condensed Long-Term Memory
+
High-Fidelity Short-Term Interaction
```

这与本项目：

```text
Active State
+
Historical Handles
+
Recent Raw Window
```

高度相关。

### 本项目主要借鉴

只参考 Context Schema 和长期/近期分层思想。

不要在 v0 实现它的主动 Compressor / training pipeline。

------

## 21.5 ACON

Paper：

```text
ACON:
Optimizing Context Compression for Long-horizon LLM Agents
```

ACON 使用 full-context success / compressed-context failure 的 trajectory pair 反向优化 compression guideline，并进一步将 compressor distill 到更小模型。其结果表明上下文压缩模块未来可以独立优化并蒸馏至较小模型。

### 本项目主要作为 Future Reference

v0 不实现。

未来如果 Context Compiler 已证明有效，再考虑：

```text
Strong model Context Manager
→ collect failure pairs
→ optimize
→ distill to local small model
```

------

## 21.6 LangMem / LangGraph

LangMem 已提供 active-path memory management 和 background consolidation 等机制，并可以与 LangGraph persistence 集成。

### 处理原则

如果 Harness 已使用 LangGraph：

> 尽量复用其 checkpoint / state infrastructure。

如果没有：

> 不要仅为了 Context Compiler 引入整个 LangGraph stack。

避免增加不必要依赖。

------

# 22. 推荐实现顺序

## Milestone 0 — Repository Reconnaissance

首先检查 Harness 当前：

```text
conversation storage
LLM request builder
token counting
session lifecycle
plugin mechanism
local model integration
UI/debug hooks
```

记录集成点。

不要先重构整个 Harness。

------

## Milestone 1 — Durable Raw Store

实现：

```text
raw_events
sessions
```

保证：

> 每条历史先落盘。

------

## Milestone 2 — Active State

实现：

```text
context_items
state_relations
StateReducer
```

先提供手工/测试 Delta。

确保 deterministic reducer 工作正确。

------

## Milestone 3 — State Extractor

增加结构化 Delta Extraction。

必须：

```text
JSON schema validation
retry / fallback
```

Extractor 失败不得破坏已有 State。

------

## Milestone 4 — Context Assembly

实现：

```text
Active State
+
Recent Raw Window
+
Current Input
```

暂时可以没有历史 retrieval。

跑 D0 / D1 / D2 初步比较。

------

## Milestone 5 — Headline + Recall

加入：

```text
history headline
SQLite FTS
exact recall
```

支持旧历史重新进入 Context。

------

## Milestone 6 — Shadow Mode

让桌宠正常继续使用 Full Context。

同时后台运行 Compiler。

记录：

```text
compiled tokens
state evolution
suppressed history
```

验证正确性。

------

## Milestone 7 — Compiler Mode

Feature flag 开启：

```text
context_mode=compiler
```

正式使用 Compiled Context 调用远端模型。

------

# 23. 第一阶段交付物

Codex 最终至少提交：

```text
1. Context Compiler implementation
2. SQLite schema / migration
3. State Extractor interface
4. Deterministic State Reducer
5. Context Assembler
6. History Recall
7. Feature flags
8. Shadow mode
9. Unit tests
10. Integration tests
11. Evaluation runner
12. README / architecture note
```

------

# 24. 测试要求

必须测试：

### Reducer

```text
create
update
supersede
resolve
reject
dependency
```

### Raw History

证明：

> suppress / supersede 不影响 raw payload。

### Assembly

证明：

> ACTIVE constraints 永远进入 Context。

### Fallback

模拟：

```text
Extractor failure
Database failure
Compile failure
```

确认不会阻塞桌宠正常对话。

### Recovery

Archive / Suppressed history 可以重新恢复。

------

# 25. 代码要求

优先：

```text
simple
modular
observable
reversible
```

不要：

```text
premature abstraction
large framework rewrite
complex distributed architecture
graph DB
background autonomous agent
```

所有核心 state transition 应可通过日志复现。

建议所有 compile 都生成 debug record：

```json
{
  "session_id": "...",
  "input_tokens_full": 0,
  "input_tokens_compiled": 0,
  "retained_ids": [],
  "suppressed_ids": [],
  "retrieved_ids": [],
  "active_state_ids": [],
  "fallback_used": false
}
```

------

# 26. 核心不变量

实现过程中始终满足以下 invariants。

### Invariant 1

```text
Raw History is append-only.
```

### Invariant 2

```text
Suppression never destroys source evidence.
```

### Invariant 3

```text
LLM proposes state delta;
code owns state transition.
```

### Invariant 4

```text
Active constraints cannot be silently evicted.
```

### Invariant 5

```text
Every compact representation has provenance.
```

### Invariant 6

```text
Compiler failure must have a safe fallback.
```

### Invariant 7

```text
Context management must not require another expensive remote reasoning pass.
```

允许开发阶段用远端模型模拟 Extractor，但接口必须支持未来替换为本地小模型。

------

# 27. Definition of Done

Context Compiler v0 可以认为完成，当：

1. Harness 桌宠可以连续运行在 `compiler` 模式；
2. Raw History 保持完整；
3. Active State 随对话增量更新；
4. 已废弃 Decision 不再长期占用 Context；
5. Active Constraint 不因窗口滑动而丢失；
6. Old History 可以按需 Recall；
7. Context Token 明显低于 Full Context；
8. 长对话任务连续性不明显低于 Full Context；
9. Compiler 出错可以安全 fallback；
10. Experience / Intuition 未被偷偷加入 v0 scope。

------

# 28. 后续预留接口，但禁止当前实现

只保留 extension points：

```text
ExperienceProvider
IntuitionProvider
SemanticRetriever
ContextScorer
LocalExtractorModel
```

未来预计演化：

```text
Raw Event
↓
Context State
↓
Repeated Retrieval / Usage
↓
Episode
↓
Experience
↓
Intuition
```

但当前：

```text
STOP AT CONTEXT STATE.
```

------

# 29. 最终工程原则

本阶段最重要的两句话：

> **Build the working context from known-active state instead of pruning it from the full history.**

即：

> **从已知有效状态构造工作上下文，而不是从完整历史中猜测应该删除什么。**

以及：

> **Never delete by semantic guess when explicit state transition can suppress safely.**

即：

> **凡是能通过明确状态迁移退出工作上下文的信息，就不要依赖语义猜测去删除。**

第一版成功标准不是：

> Agent 记住了更多。

而是：

> **Agent 历史越来越长，但远端模型每轮真正需要读取的内容没有同步增长。**



 