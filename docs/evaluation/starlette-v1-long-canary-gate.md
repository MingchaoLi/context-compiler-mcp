# Starlette v1 STR-04 long/open canary 报告

日期：2026-08-23

结论：**Builder 已完成 canary candidate，等待新的独立 data QA；不是正式 freeze，也不是 D2 效果证据。**

## 结果概览

- `STR-04`：1 个 long/open segment，18 个时间有序 evidence event、18 个同 cutoff slice、18 个真实信息增量；
- 七类文件保持物理分离；只有 `events.json` 与 `tasks.json` 能生成模型输入；
- #1649 与 #2349 只作为部分能力和 Outcome Anchor，Issue #685 的关闭、范围反驳与重开由独立 timestamped event 表示；
- `canary-hashes.json` 状态为 `canary_not_frozen`；现有 `pilot-hashes.json` 仍为 `pilot_not_frozen`；
- 没有运行 D0/D1/D2、远端模型、aggregate 或 PASS rate，也没有修改 Context Compiler core。

## 信息增量与分层

层级按显式 `information_increment_event_ids` 的数量机械计算：short 3–4、medium 5–8、long ≥9。validator 要求这些 id 属于 `event_ids`、保持事件顺序且不重复，并强制单 segment 顶层 tier 与 classification 一致；多 segment 才允许 `boundary_audit`。

STR-04 的 18 个增量依次覆盖：问题创建、routing/middleware 执行顺序、响应后指标需求、per-Route/per-Mount 方向、#1286 实现、path-prefix 替代、对该替代的反驳、转向 #1464、#1286 关闭、#1649 Mount 方向、错误处理边界、对旧分支的评审结论、Issue 关闭、scope-creep 反驳、Issue 重开、低接触 APM 约束、workaround/框架能力分流、#2349 per-route 实现。

同一规则应用到 pilot 后，STR-05 的 9 个事件均为真实增量，已从 medium 改为 long。原 2 short / 2 medium / 2 long 配额声明失效；没有少计事件或从 reserve 自动补样。

## 时间与来源边界

Issue/PR 创建事件只使用创建时可证明的标题。当前 body 的 SHA-256 只用于发现来源变化，不作为创建时正文快照。稳定 comment/review 使用自身时间戳与 observed body hash。

三个 `issue_state` 事件的 `source_content_sha256` 对 GitHub event response 的以下规范化 JSON 计算：`id`、`node_id`、`event`、`actor`、`created_at`、`commit_id`，键顺序固定。这样可以复核 close/reopen 事件而不把整个可变 API envelope 当内容。

最终 Outcome Anchor 保留 #1649 的行为测试提交、#1649 merge 与 #2349 merge。它们不会进入任何 Available Evidence。#685 在 2026-08-23 来源审计时仍为 open；这只支持“原问题未关闭”，不表示两个部分能力没有价值。

## 模型输入 projection

`projectModelInput(bundle, sliceId)` 先运行完整 bundle 校验，再输出：

- `schema_version`；
- `history_turns`：严格等于该 slice 的 evidence 前缀；
- `current_task`：独立当前任务。

每个 history turn 只有六个字段：`id`、`role`、`event_type`、`occurred_at`、`actor`、`summary`。GitHub source/node/database id、URL、body/hash、`source_updated_at`、审计说明、Fact Gold、Oracle-State、Decision Reference、Outcome Anchor 和 merge SHA 均不在投影中。正反例同时验证早期前缀、未知审计字段拒绝和 canary hash 篡改。

validator 仍只证明结构、时间前缀、provenance 与规范化字面边界，不能证明语义无泄漏。聚焦测试明确构造一个会被 validator 接受、但人工必须拒绝的反例：在 T1 Current Task 中假定“later work supplies route-scoped hooks”，再询问为何 zero-touch instrumentation 仍不完整。它没有复制 future Gold 原文，却把后期能力和结论改写进早期任务；因此独立人工 source audit 仍是 gate 条件。

## Contamination 复扫与首轮 QA 退回

精确 source-path 复扫没有发现把 STR-04 issue/fix 显式作为 LLM、agent、benchmark、code-repair 或 evaluation task 的公开复用，状态保持有限的 `no_public_hit_found`。

首轮 Builder 曾把一个 RAGAS retrieved-context 命中判为 confirmed 并关闭 gate。独立 QA 读取同一固定提交的 `benchmark.py` 后证明该问题的 reference 是 FastAPI PR #15745，#2349 只是未被答案使用的检索噪声。主控接受退回并恢复 canary；命中与排除理由保留在 `contamination-scan.json`。若未来要把任意 LLM context 命中都定义为污染，必须新工单预注册并统一重扫全部 15 条候选。

## 剩余偏差与 Gate

STR-04 证明 schema 可以表达 long/open、部分交付、关闭后重开和字段级 projection；它不能证明六案具有统计代表性。STR-05 改层后，长度、组件和 outcome 分布需要在下一工单重新预注册。

只有新的独立 data QA 对来源、18 个增量、Gold/Oracle、语义泄漏、projection 与 hash 全部 PASS，DS-03 才可接受。即使 PASS，也只允许讨论下一批 freeze 的新预注册，不允许直接运行模型或沿用旧 2/2/2。
