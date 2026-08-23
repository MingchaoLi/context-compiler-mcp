# WO-V0-15 Global Telemetry Origin Dormancy 修复 — Builder 交接

日期：2026-08-24

状态：**FIX IMPLEMENTED — PENDING INDEPENDENT RE-QA**

固定修复起点：`main@c016813ea26134dedbd1ce09bfdcd6a1d73ea848`，起点工作树 clean。该提交是冻结后终局复核返回的第五个 append-only correctness fix，只关闭 telemetry baseline 前已存在的 item 被错误当作全生命周期 zero-hit 并进入 dormant 的 P1；未修改算法权重、MCP/API、ledger schema、QA 报告、evaluation/Gold、official artifact 或 Experience 范围。

## 双门规则

### 1. Global telemetry origin 门

- session 的 global origin 是第一条通过现有 exact trace shape、source namespace、operation/parent、raw/state fingerprint 校验的 `CONTEXT_COMPILE`，不是任意 public append，也不是调用方时间戳。
- item 必须未出现在 origin 的 `selected_state_ids` 中；否则它在 telemetry 起点前已经存在，其更早的 retrieval hit 历史不可观测，永久保守 fail-open。
- post-origin creation 只接受 `StateStore` 创建 item 时在同一原子事务写入、`created_at` 与 item 完全一致的 `DERIVED_FROM` provenance relation。creation refs 必须非空、全部能解析到 raw event，且最早 raw seq 严格晚于 origin raw boundary。
- source-less v1、旧库缺失 creation relation、来源无法解析或定义有歧义时均 fail-open。后续补写的 `DERIVED_FROM` 不得伪造 post-origin creation eligibility。

### 2. Current state snapshot 门

- 最近可信 compile 必须精确匹配当前 `state_revision + state_sha256`；状态刚变化时首次 compile 只建立新 snapshot baseline，本次 dormant placement fail-open。
- baseline 仍取当前相同 snapshot 尾部连续 trace 组的第一条；同一 snapshot 的中间 compile 不重置年龄。
- 只有同时通过 global origin 门、current snapshot 门，并且从 `max(snapshot baseline user turn, item 最后有效 provenance user turn)` 起跨过完整 `N × 15`、全观测生命周期 zero-hit，且未获 Constraint、query 或 dependency rescue 的 item，才可进入前台 dormant。authoritative state 与后台 raw/ledger 不变。

## 公开路径回归

- baseline 前通过公开 v1 流程创建两个 Goal，先执行一次无 `operation_id` 的相关 compile（命中不会写 telemetry），再建立首个可信 baseline并增加 15 个完整用户轮次：两个 item 均保持 active。
- 对其中一个 pre-origin item 再通过公开 `prepare_state_update / apply_state_delta` 做 source-less content update，建立新 snapshot baseline并再跨 15 轮：两个 item 仍保持 active，更新后的 authoritative state 保持 `ACTIVE`。
- 先建立空状态 global origin，再通过真实 `RuntimeStateUpdater` strict v2 current-event provenance 创建 Goal：新 snapshot 首次 compile只建 baseline；14 轮仍 active，第 15 轮才 dormant；中间 compile 不重置计时，authoritative state 仍为 `ACTIVE`。
- pure regression 额外验证 origin 已包含 item 时永不把未知早期 hit 归零，以及后补 `DERIVED_FROM` 不能制造 creation evidence。上一轮公开 v1 content/status/relation late-update 14/15 回归继续通过。
- 旧/bad/伪 telemetry、Constraint、prior hit、query reactivation、dependency rescue，以及 trace/hits 原子性与无 operation-id 边界继续通过。

## 验证结果

- focused：10 files，156/156 PASS；
- `npm test`：473 PASS / 1 个既有 opt-in SKIP；
- `npm run test:protocol`：11/11 PASS；其中真实执行 `npm pack`、production-only offline prune，并从隔离 package 启动 stdio，health ready；
- `npm run build`、`git diff --check`：PASS；
- DS-13 fixed-object validator：PASS；
- DS-14 ST-01/ST-02 contract/scorer 与 Starlette feasibility 固定复现：30/30 PASS；official artifact 未重跑或改写。

验证环境：macOS / Darwin arm64、Node.js 25.6.1、npm 11.9.0；Windows 与 exact Node.js 24 未单独复跑。

WO、PROJECT_STATE 与 ROADMAP 当前保持 `FROZEN REOPENED — PENDING INDEPENDENT RE-QA`。Builder 不批准自己的工作；只有独立 re-QA 关闭该反例后，主控才能恢复 Context / State 冻结并进入下一阶段。
