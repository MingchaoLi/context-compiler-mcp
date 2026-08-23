# WO-V0-15 Fresh SQLite DB 双实例初始化竞态修复 — Builder 交接

日期：2026-08-24

状态：**FIX IMPLEMENTED — PENDING INDEPENDENT RE-QA**

固定修复起点：`main@4e366f3bd1545c1e9870de0f640195d0de232363`，起点工作树 clean。本次是 append-only 最小修复，只关闭独立实例同时打开同一 fresh SQLite DB 时的初始化竞态；未修改 Context/State 策略、公开 API、项目冻结结论、QA 报告、evaluation/Gold 或 official artifact。

## 修复边界

- 新增内部 SQLite 初始化辅助函数，统一执行既有 `foreign_keys / busy_timeout / synchronous / journal_mode` 配置和各 store 的既有 schema 初始化。
- 仅对 SQLite `BUSY / LOCKED` 做固定且有界的同步退避：`5 / 10 / 20 / 40 / 80 / 160 / 320 ms`；耗尽后把原错误原样抛给调用方。
- 可重试错误只按稳定 SQLite 错误码识别：Node `ERR_SQLITE_ERROR` 的 `errcode=5/6`，或明确的 `SQLITE_BUSY* / SQLITE_LOCKED*` code。schema、ALTER、corruption、I/O 和其他非 busy 错误不重试、不降级、不吞掉。
- 初始化失败时关闭尚未发布的连接并保留原始异常；缺失 raw schema 等既有业务错误语义保持不变。
- 辅助函数未从 package root 导出，不形成新的公开能力或合同。

## 回归覆盖

- 单元反例验证 busy/locked 可恢复，并验证 duplicate-column、corruption、schema failure 在首次失败时直接抛出。
- 使用 `SharedArrayBuffer + Atomics` 同步屏障，从同一起点重复开启两个独立实例：
  - fresh DB 的直接 `SqliteRawHistoryStore`：10 组、每组两实例均成功；
  - fresh DB 的独立 `ContextCompilerMcpService`：10 组、每组两实例均 health ready；
  - fresh DB 的独立 stdio server：5 组、每组两个进程均 health ready。
- 预初始化 DB 的并发语义保持：
  - same-source ingest 两实例返回同一 event id，最终只有一条 raw event 和一条 EVENT mirror；
  - same-operation compile 两实例返回同一 trace id，最终只有一条 CONTEXT_COMPILE 和一条 RETRIEVAL_HIT。

## Builder 验证

- fresh DB / initialization focused 与首轮修复相关 focused：9 files，144/144 PASS；
- `npm test`：467 PASS / 1 个既有 opt-in SKIP；
- `npm run test:protocol`：10/10 PASS；其中真实执行 `npm pack`，复制 lock 与 installed tree 后进行 production-only offline prune，并从隔离 package 启动 stdio，health ready；
- `npm run build`、`git diff --check`：PASS；
- DS-13 fixed-object validator：PASS；
- DS-14 ST-01/ST-02 contract/scorer 与 Starlette feasibility 固定复现：30/30 PASS；official artifact 未重跑或改写。

验证环境：macOS / Darwin arm64、Node.js 25.6.1、npm 11.9.0；Windows 与 exact Node.js 24 未单独复跑。

Builder 不批准自己的工作；本修复等待独立 re-QA，Context / State 状态不在本提交中改为 accepted 或 frozen。
