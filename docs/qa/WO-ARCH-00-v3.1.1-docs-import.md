# WO-ARCH-00 — Architecture v3.1.1 docs-only import 独立机械 QA

状态：**PASS — ACCEPTED / COMPLETE**

## 固定边界

- branch：`main`
- Builder candidate：`b27b5300f3a6acba84d09f55e43fc93feeaf80f0`
- parent：`29f7d2aa54fe321c636711c03aeb70a58ba5c508`
- candidate 起始工作树：clean
- QA 类型：只读机械文档审查；未启动 WO-01，未创建 Execution Baseline，未读取源码，未运行模型或访问网络，未修改产品。

Builder candidate 相对 parent 只有以下 7 个允许的 docs 文件：

```text
M  docs/PROJECT_STATE.md
M  docs/ROADMAP.md
A  docs/architecture/LT-Agent-Architecture-Contract-2026-08-24-v3.1.1.md
A  docs/architecture/Umbrella-Implementation-Plan-2026-08-24-v3.1.1.md
A  docs/handoffs/WO-ARCH-00-v3.1.1-docs-import.md
A  docs/work-orders/WO-01-current-architecture-inventory.md
A  docs/work-orders/WO-ARCH-00-v3.1.1-docs-import.md
```

不存在 `src/`、`test/`、package、schema、evaluation 或 official artifact 变更。

## Artifact 身份

从固定 Builder candidate 独立重建的 SHA-256：

```text
db66c5f8b1319fe9417bc67af6078de38d2b8f893beb60b3f4ee5bee52dce8cb  docs/architecture/LT-Agent-Architecture-Contract-2026-08-24-v3.1.1.md
33cb921dfdcf7b1fe85971045d060d2acd2b3b8e28df32a385df72e1b0526474  docs/architecture/Umbrella-Implementation-Plan-2026-08-24-v3.1.1.md
e9c51fa6627e8556fcdec2226212a122a4fda5f482574130e0fa7edd4fc390ee  docs/work-orders/WO-01-current-architecture-inventory.md
```

## 八项协议封口

1. **ActionStarted 顺序：通过。** Contract §10.4 明确 `ActionStarted → Durable ACK → Tool dispatch`，并规定 commit 失败不得 dispatch；目标时序图保持同一顺序。
2. **Response Outbox：通过。** Contract §13 明确 `ResponsePrepared + OutboxPending(delivery_id)` 原子提交，以及 durable claim、lease、expired lease reclaim、`DeliveryUnknown`、稳定 delivery identity 和 reconciliation。
3. **Frontier 双 CAS：通过。** Contract §3.2、§7.2 将 `raw_frontier_revision` 与 `frontier_position` 分离，并要求 CAS 同时校验 expected revision 与 expected position；Umbrella 的 WO-03A/03B/04 依赖和职责没有另行改写该合同。
4. **Child WO ownership：通过。** Umbrella §1、§3、§5 要求单结果 Child WO、明确 change surface 和独立 QA，并明确 QA/replay 工单不得首次实现能力；WO-09 也重复了该限制。
5. **Execution Baseline：通过。** Umbrella §9 与 WO-01 §2 明确导入 QA 后另行固定 `source_baseline_HEAD`，并区分正常文档交付形成的 `delivery_HEAD`；独立 QA 必须检查两者间仅有允许分析产物。
6. **Builder / QA 物理分离：通过。** WO-01 §4、§10、Acceptance 明确 Builder 只写 inventory 与 handoff，禁止创建独立 QA 结果，QA 使用独立路径。
7. **三阶段确定性扫描：通过。** WO-01 §3 固定机械索引、定向深读、必要 Git history，并要求记录 indexed、deeply inspected、commits inspected 与排除项。
8. **安全执行边界：通过。** WO-01 §5 禁止远端模型、网络与 destructive command；任何生成 cache、build artifact 或临时 DB 的诊断只能在隔离临时副本或 test harness 中进行。

## 三文档一致性

- Contract 是统一目标协议，Umbrella 只定义阶段、依赖与 Promotion Gate，WO-01 只盘点当前事实；下层没有重定义上层协议。
- Action、Outbox、Frontier、Child WO、baseline 与扫描规则在相应责任层可定位，未发现互相矛盾的顺序、所有权或启动条件。
- `Audit Ripple` 在 Contract、导入工单与 PROJECT_STATE 中均只作为非规范研究观察；它不是 blocker，不扩大 WO-01，也不授权新 Retriever、Relation 或 Context 行为。
- WO-V0-15 继续 `ACCEPTED / FROZEN`，WO-DG-01 继续 `ACCEPTED / COMPLETE`；v3.1.1 目标协议导入没有解冻或改写 v0 行为。
- WO-01 明确为 `PLANNED / NOT STARTED — EXECUTION BASELINE NOT YET FROZEN`。本次 QA 没有固定 `source_baseline_HEAD`、创建 Execution Baseline、扫描 repo 或启动实现。

## 机械检查

- 三份目标文档版本、文件名与 repository 路由统一为 v3.1.1；handoff 中的 v3.1 仅表示输入 artifact 身份。
- Markdown fence 计数均为偶数：Contract 172、Umbrella 16、WO-01 36、handoff 2。
- 工单引用的现有路径可解析；未来 WO-01 deliverable 路径明确为待创建产物，不被冒充为现有文件。
- `git diff --check 29f7d2a..b27b530` 通过。
- 候选提交 parent、文件集合与独立 SHA-256 均已复核。
- 候选没有 source/package 变更，因此按工单不运行 `npm test` 或 build。

## 结论

未发现 P0、P1 或 P2 文档缺陷。WO-ARCH-00 可以接受并完成，Architecture Contract、Umbrella Plan 与 WO-01 已进入 repository authority。

该接受只关闭 docs-only import。**WO-01 仍为 NOT STARTED，`source_baseline_HEAD` 尚未冻结，Execution Baseline 尚未建立。** 后续若启动 WO-01，必须另行固定执行边界并保持 Builder / Independent QA 分离。
