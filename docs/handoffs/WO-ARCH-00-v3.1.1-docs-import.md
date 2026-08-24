# WO-ARCH-00 Builder handoff — Architecture v3.1.1 docs-only import

状态：IMPLEMENTED — PENDING INDEPENDENT QA

## 起点

- branch：`main`
- parent baseline：`29f7d2aa54fe321c636711c03aeb70a58ba5c508`
- 起始工作树：clean
- WO-DG-01：保持 `ACCEPTED / COMPLETE`
- WO-V0-15：保持 `ACCEPTED / FROZEN`

## 单一交付

将用户提供的三份 v3.1 准备导入 artifact 机械收口为 repository 内 v3.1.1 文档：

- Architecture Contract v3.1.1；
- Umbrella Implementation Plan v3.1.1；
- WO-01 Current Architecture Inventory。

同时新增本次过渡导入工单并更新 `PROJECT_STATE/ROADMAP` 路由。WO-01 没有启动。

## 已吸收内容

- ActionStarted durable ACK → Tool dispatch；
- ResponsePrepared/OutboxPending 原子提交与 durable claim/lease/recovery；
- raw_frontier_revision/frontier_position 分离和双 CAS；
- Child WO ownership 与“QA 不首次实现能力”；
- WO-01 Execution Baseline Manifest；
- `source_baseline_HEAD` / `delivery_HEAD`；
- Builder/QA 物理分离；
- deterministic inventory scan policy；
- Audit Ripple 仅作非规范研究观察。

## 输入 SHA-256

```text
85bc9c6da8bf5f6c7e68b93bf668d17ca9baaa340f75170949e0062a58011589  LT-Agent-Architecture-Contract-2026-08-24-v3.1.md
5af1de4e6a03cea239f51390e6606d657460ad58ea022a89b1678ea4b5b0a64a  Umbrella-Implementation-Plan-2026-08-24-v3.1.md
b668a8d3658e853419e700986554eec0ba8b01a5c2d49bbaddd571d728c263d9  WO-01-Current-Architecture-Inventory.md
```

导入后的 v3.1.1 hashes 由 QA 从固定 Builder candidate 独立重建；Builder 不把预提交 hash 当信任根。

## 未做

- 未修改 `src/test/package/schema/evaluation`；
- 未运行模型或网络；
- 未创建 WO-01 Execution Baseline Manifest；
- 未开始 repo inventory；
- 未改变 Context/State/Experience 行为；
- 未进行新的宏观架构 Challenge。

## QA 返回要求

独立 QA 必须固定 Builder candidate 与 parent，复核允许文件集合、八项封口、三文档一致性、v0/DG-01 状态、WO-01 未启动、`git diff --check` 与最终 clean。QA 只写独立报告和必要状态路由，不得实现任何缺失协议。
