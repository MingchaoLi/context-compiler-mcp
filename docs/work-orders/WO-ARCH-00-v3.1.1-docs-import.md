# WO-ARCH-00 — Architecture v3.1.1 docs-only import

状态：ACCEPTED / COMPLETE

## 单一结果

把用户已冻结的 Architecture Contract v3.1.1、Umbrella Implementation Plan v3.1.1 与 WO-01 作为 repository authority documents 导入当前独立项目，并只更新必要路由；不启动 WO-01，不改变任何产品行为。

## CAN READ

- `AGENTS.md`
- `docs/PROJECT_STATE.md`
- `docs/ROADMAP.md`
- 已完成的 `docs/work-orders/WO-DG-01-codex-long-conversation-dogfood.md`
- 用户提供的三份 v3.1 准备导入 artifact
- 本工单新增的 v3.1.1 文档、handoff 与 QA 报告

## CAN CHANGE

- `docs/architecture/LT-Agent-Architecture-Contract-2026-08-24-v3.1.1.md`
- `docs/architecture/Umbrella-Implementation-Plan-2026-08-24-v3.1.1.md`
- `docs/work-orders/WO-01-current-architecture-inventory.md`
- 本工单、Builder handoff、独立 QA 报告
- `docs/PROJECT_STATE.md`
- `docs/ROADMAP.md`

## MUST NOT CHANGE

- `src/**`
- `test/**`
- package surface / dependency / lockfile
- schema / migration / runtime flag
- `evaluation/**`、Gold、official artifact
- WO-V0-15 与 WO-DG-01 的既有接受事实
- Context / State / Retrieval / Ledger / Experience 行为

## 必须吸收的协议封口

1. `ActionStarted` durable ACK 后才允许 Tool dispatch。
2. `ResponsePrepared + OutboxPending` 原子提交；durable claim/lease/reclaim/DeliveryUnknown。
3. `raw_frontier_revision` 与 `frontier_position` 分离，CAS 同时校验 revision 与 position。
4. Child WO 职责补齐，QA/replay 工单不得首次实现能力。
5. WO-01 增加 Execution Baseline Manifest 与 `source_baseline_HEAD` / `delivery_HEAD` 合同。
6. Builder handoff 与 Independent QA artifact 物理分离。
7. Inventory 使用机械索引 → 定向深读 → 必要 Git history；记录读取和排除清单。
8. WO-01 禁止远端模型、网络和 destructive commands；生成性诊断只允许隔离临时副本。

## 非阻塞研究观察

`Audit Ripple` 只作为未来 Continuity Audit 研究观察记录：结构化 diff 负责确定性删除/变更检查，Event Ripple + typed Relation/dependency 可探索概率性遗漏审计。它不进入 v3.1.1 blocker，不扩大 WO-01 scope，也不授权实现。

## Acceptance

- [x] 三份目标文档均进入 repository authority，版本统一为 v3.1.1。
- [x] 八项协议封口全部可在文本中机械定位。
- [x] Contract / Umbrella / WO-01 无已知冲突。
- [x] WO-V0-15 继续 `ACCEPTED / FROZEN`，WO-DG-01 继续 `ACCEPTED / COMPLETE`。
- [x] WO-01 明确 `PLANNED / NOT STARTED`，没有 Execution Baseline、Inventory 或产品实现。
- [x] Builder 只写 handoff；独立 QA 另写 `docs/qa/WO-ARCH-00-v3.1.1-docs-import.md`。
- [x] Builder candidate 相对起点只包含本工单允许的 docs-only 文件。
- [x] `git diff --check` 通过，提交后工作树 clean。

## QA 边界

独立 QA 只做机械文档 QA：固定 candidate/parent/clean、文件清单、关键词/合同一致性、旧冻结状态、路由、diff 与 clean。不得启动 WO-01，不得修改生产代码，不需要新的宏观架构 Challenge。

## Independent QA Acceptance

固定 Builder candidate `b27b5300f3a6acba84d09f55e43fc93feeaf80f0` 已通过独立机械 QA；完整证据见 `docs/qa/WO-ARCH-00-v3.1.1-docs-import.md`。该接受不启动 WO-01；`source_baseline_HEAD` 与 Execution Baseline 仍未冻结。
