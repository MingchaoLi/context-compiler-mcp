# WO-V0-15 Authoritative State Snapshot Dormancy 修复 — Builder 交接

日期：2026-08-24

状态：**FIX IMPLEMENTED — PENDING INDEPENDENT RE-QA**

固定修复起点：`main@4ccb4a2d1e3fc51ce4e2aa960e97c26f4ea6af4e`，起点工作树 clean。该提交是冻结后终局对抗审查返回的第四个 append-only correctness fix，只关闭公开 v1 source-less late state update 被错误 dormant 的 P1；未修改算法权重、MCP/API、ledger schema、QA 报告、evaluation/Gold、official artifact 或 Experience 范围。

## 修复规则

- `CONTEXT_COMPILE` 原有 payload 已包含 `state_revision / state_sha256`，本修复不增加 ledger 字段或记录类型，而是把两者纳入 dormant baseline 判定。
- 最近一条可信 compile trace 的 revision 与 fingerprint 必须和当前 authoritative state snapshot 精确一致；任一不同都表示当前 snapshot 尚无可信观测基线，本次所有 dormant placement fail-open。带 `operation_id` 的当前 compile 随后按既有原子 trace 路径写入该 snapshot 的第一条 baseline。
- 当前 snapshot 已有可信 baseline 时，取尾部连续、revision/fingerprint 相同的 trace 组中的第一条作为该 snapshot 的固定 baseline；同一 snapshot 的中间 compile 不重置 `N × dormancy_turn_multiplier` 年龄。
- item 只有在 provenance 确实存在于 baseline raw boundary 内，并且从 `max(snapshot baseline user turn, item provenance user turn)` 起已经跨过完整阈值、全生命周期没有 state hit、当前 query 未命中且不受 Constraint/dependency 保护时，才可 dormant。
- 不使用 `updated_at` 或调用方时间戳猜测 turn；content、status、relation 以及 v2 provenance update 只要改变 revision/fingerprint，都会保守重建 snapshot baseline。

## 真实公开 v1 反例

回归逐一通过 `ContextCompilerMcpService.call("prepare_state_update")` 与 `call("apply_state_delta")` 执行三类合法、无新 `DERIVED_FROM` 的 v1 mutation：

- ACTIVE Goal content update；
- ACTIVE Goal status 更新为 `COMPLETED`，同时观察未变的另一个 ACTIVE Goal；
- 两个 ACTIVE Goal 之间新增 `DEPENDS_ON` relation。

每类都先建立旧 snapshot 的可信 compile baseline，再跨过旧阈值后 mutation；验证结果为：新 snapshot 首次 compile 全量 fail-open并写 baseline，之后 14 个完整用户轮次仍不 dormant，第 15 个完整用户轮次才允许符合条件的 ACTIVE root dormant。现有 exact telemetry、operation retry、v2 provenance、zero-hit、Constraint、prior-hit、query reactivation 与 dependency rescue 回归继续通过。

## 状态与验证

- WO、PROJECT_STATE 与 ROADMAP 已明确标记 `FROZEN REOPENED — PENDING INDEPENDENT RE-QA`；Builder 不自行恢复 accepted/frozen，也不提前进入 Experience 数据积累。
- 相关 focused：10 files，152/152 PASS；
- `npm test`：469 PASS / 1 个既有 opt-in SKIP；
- `npm run test:protocol`：11/11 PASS；其中真实执行 `npm pack`、production-only offline prune，并从隔离 package 启动 stdio，health ready；
- `npm run build`、`git diff --check`：PASS；
- DS-13 fixed-object validator：PASS；
- DS-14 ST-01/ST-02 contract/scorer 与 Starlette feasibility 固定复现：30/30 PASS；official artifact 未重跑或改写。

验证环境：macOS / Darwin arm64、Node.js 25.6.1、npm 11.9.0；Windows 与 exact Node.js 24 未单独复跑。

Builder 不批准自己的工作；只有独立 re-QA 关闭对抗反例后，主控才能恢复 Context / State 冻结并进入下一阶段。
