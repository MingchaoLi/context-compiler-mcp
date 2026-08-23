# WO-V0-15 Checkpoint B — Builder 交接

日期：2026-08-24

状态：**BUILDER COMPLETE — PENDING CHECKPOINT C / FINAL INDEPENDENT QA**

## 本次有界结果

本 checkpoint 只交付 append-only Experience Ledger 与 Raw Event 原子镜像。没有实现 compile trace、retrieval、dormant placement、targeted recovery、Experience 抽象或新 MCP tool，也没有修改 evaluator / Starlette artifact / WO-DS-14 capture 与 Gold。

新增 `SqliteExperienceLedgerStore`，使用 SQLite 关系表保存以下七类记录：

- `EVENT`
- `ACTION`
- `OUTCOME`
- `FEEDBACK`
- `CANDIDATE_EXPERIENCE`
- `CONTEXT_COMPILE`
- `RETRIEVAL_HIT`

每条记录包含稳定 id、session-local sequence、`occurred_at`、session-scoped `source_key`、raw event ids、parent ledger ids 与严格 JSON object payload。公开 store 只提供 append、单条 get、按 session sequence replay/get 与 close，不提供 update/delete；数据库 trigger 会拒绝其他连接的 update/delete。

## 原子性与迁移

- `SqliteRawHistoryStore.ingest` 在原有同一连接、同一 `BEGIN IMMEDIATE` transaction 中插入 raw event 和对应 `EVENT` mirror；ledger insert 失败会回滚 raw insert。
- raw mirror 的 id 与 source key 都由 raw id 确定性派生。带 `source_event_id` 的 raw retry 在返回旧 RawEvent 前会校验已有 mirror，避免把不一致双写静默当成功。
- 既有数据库在单一 migration transaction 中按 `session_id, raw seq, raw id` 顺序补齐缺失 mirror；payload 明示 `migration_backfill:true`。新 ingest 为 `false`。
- migration 只产生 EVENT observation，不补造 ACTION、OUTCOME、FEEDBACK 或 Candidate Experience。
- 所有 raw / parent refs 必须在 append 前已存在于同一 session；因此 future、dangling 与 cross-session reference 均 fail-closed。
- `source_key` 的同内容重试返回既有记录；不同 kind、refs、payload 或显式时间产生 `CONFLICT`。payload 会在严格 JSON 校验后按稳定键序规范化，避免仅对象键顺序不同造成假冲突。

## 兼容面

- `RawEvent` / `RawEventInput` 公共 shape 与 `ingest_event` 返回不变。
- MCP capability 保持九工具；没有增加 provider、network、Graph DB 或 runtime dependency。
- `ContextCompilerMcpService` 无需持有第二个 ledger connection：Raw store 已在自己的事务内完成 EVENT mirror。library caller 可独立打开 ledger store 追加未来研究记录。
- `compile_context` 本 checkpoint 仍保持既有行为，不写 `CONTEXT_COMPILE` / `RETRIEVAL_HIT`；operation id 与 trace 留给 Checkpoint C。

## Builder 验证

- focused：`test/experience-ledger.test.ts`、`test/raw-store.test.ts`、`test/mcp-service.test.ts`，35/35 PASS；
- 全量 `npm test`：435 PASS / 1 个既有 opt-in official runner SKIP；
- `npm run build`：PASS；
- `git diff --check`：PASS；
- 环境：macOS / Darwin arm64、Node.js 25.6.1、npm 11.9.0；Windows 与 exact Node.js 24 未单独复跑。

focused 反例覆盖外部 trigger 注入 ledger insert 失败后的 raw rollback、raw retry 对篡改 mirror 的一致性检查、旧库确定性 backfill/restart、七类顺序回放、双连接 source-key 重试、payload 冲突、strict JSON、future/dangling/cross-session refs、外部 update/delete trigger 与 closed-state。

## 后续边界

Checkpoint C 才允许在工单既定边界内接入 operational context policy 与显式 operation-id trace。本 checkpoint 的 EVENT ledger 只提供可回放后台数据面，不应被解释为已经实现 Experience Formation，也不授权新的 Context 算法或 retrieval 调参。
