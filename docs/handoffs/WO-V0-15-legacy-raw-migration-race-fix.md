# WO-V0-15 Legacy Raw Schema 双实例迁移竞态修复 — Builder 交接

日期：2026-08-24

状态：**FIX IMPLEMENTED — PENDING INDEPENDENT RE-QA**

固定修复起点：`main@d59feeb2e855f7f7ded729085e89e4559bf40c2d`，起点工作树 clean。本次为第三个 append-only 最小修复，只关闭缺少 Dense 列的 legacy raw schema 在双实例升级时发生 check-then-ALTER 竞争的问题；未修改 Context/State 策略、公开 API、初始化 retry 白名单、QA 报告、evaluation/Gold、official artifact 或项目冻结状态。

## 修复边界

- raw schema migration 现在先取得 `BEGIN IMMEDIATE` 写事务，再在同一事务内执行既有 table/index/trigger 建立、`PRAGMA table_info(raw_events)` 检查和 conditional `ALTER TABLE ... ADD COLUMN dense_embedding_json TEXT`，完成后统一 commit。
- 任意异常只尝试 rollback，随后把原异常原样抛出；没有捕获或吞掉 duplicate-column、ALTER、schema、corruption、I/O 或普通 `ERR_SQLITE_ERROR`。
- `src/sqlite-initialization.ts` 未修改；仍然只有 SQLite BUSY/LOCKED 可进入既有有界退避。第二个实例在读取 legacy schema 前必须先取得同一写锁，因此不再与第一个实例同时作出“缺列”判断。

## 同步并发回归

从真实缺少 `dense_embedding_json` 的旧 `sessions/raw_events` schema 和一条既有 raw row 开始，使用 `SharedArrayBuffer + Atomics` 同步释放两个独立 Worker：

- 直接 `SqliteRawHistoryStore`：10 组、20 个实例全部成功；
- 独立 `ContextCompilerMcpService`：10 组、20 个实例全部构造成功且 health ready；
- 两个 Worker 分别启动真实 stdio MCP 子进程：5 组、10 个进程全部 health ready。

每组完成后直接审计 SQLite：

- `dense_embedding_json` 精确只有一列，定义为 nullable `TEXT`；
- 原始 raw row 的 id、session、seq、source、正文、时间、token 与 metadata 字节保持不变，新列为 `NULL`；
- raw update/delete append-only trigger 精确各一条；
- legacy row 只生成一条 EVENT backfill，ledger seq 仍为 1，没有重复回填。

原有 fresh DB Raw/Service/stdio barrier 和预初始化 same-source ingest / same-operation compile 并发幂等回归继续通过。

## Builder 验证

- 相关 focused：9 files，145/145 PASS；
- `npm test`：468 PASS / 1 个既有 opt-in SKIP；
- `npm run test:protocol`：11/11 PASS；其中真实执行 `npm pack`、production-only offline prune，并从隔离 package 启动 stdio，health ready；
- `npm run build`、`git diff --check`：PASS；
- DS-13 fixed-object validator：PASS；
- DS-14 ST-01/ST-02 contract/scorer 与 Starlette feasibility 固定复现：30/30 PASS；official artifact 未重跑或改写。

验证环境：macOS / Darwin arm64、Node.js 25.6.1、npm 11.9.0；Windows 与 exact Node.js 24 未单独复跑。

Builder 不批准自己的工作；本修复等待独立 re-QA，Context / State 状态不在本提交中改为 accepted 或 frozen。
