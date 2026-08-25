# WO-PUB-02 — Raw Timestamp Compatibility

状态：BUILDER COMPLETE / PENDING INDEPENDENT QA

Planning baseline：`db760a8bc8dfa8bc07f16469b5fa3252a4fc9d90`

Implementation baseline：`b9b2dedebf97c6d9c66369af4aaab70904f73fe9`

## 背景

公开 `ingest_event` 曾接受 RFC 3339 秒级或 offset 形式的顶层 `created_at` 并原样落盘，但
`compile_context` reader 只接受 `Date.toISOString()` 风格的 UTC millisecond 形式。因此同一 session
按 append 顺序写入两个独立合法、时间倒序的 Raw Event 后，后续 compile 会返回 `INVALID_INPUT`；即使
只写一条同形状 timestamp，也会触发同一 representation-domain 裂缝。省略顶层 `created_at` 时由 server
生成 canonical timestamp，compile 可正常完成。

源码审计确认不存在跨事件 timestamp monotonicity check；Raw 顺序本来已由同 session 的 `seq` 表达。
本工单因此同时关闭 writer/reader 的 timestamp grammar 裂缝，并把已有的 `seq` ordering 固定为公开合同，
避免 future reader 把可迟到、回补、跨源或来自历史导出的 source timestamp 误当作 append cursor。

## 单一结果

> 对齐 Raw write/read timestamp domain，并冻结双时间语义：`seq` 是唯一 append/replay order；每条合法
> `created_at` 是独立的 source/event time，可相等、倒序、迟到或位于未来。新 writer canonicalize，
> read/compile/reopen/replay 接受历史 writer 已提交的可解析 RFC 3339 Raw，并保持其 timestamp bytes 原样。

## 固定合同

### Write domain

- `ingest_event.created_at` 若提供，继续按现有单事件 timestamp grammar 验证并 canonicalize；非法值仍以
  `INVALID_INPUT` 拒绝，不能落盘。
- 公开 input schema 将该字段冻结为 RFC 3339 date-time，允许秒级、1–3 位小数与 `Z`/numeric offset；
  writer 持久化并返回 UTC millisecond canonical form。该 schema refinement 是本工单唯一 input 变化。
- 合法 `created_at` 不要求大于等于同 session 前一事件，也不要求小于当前 wall clock。
- 省略 `created_at` 时继续使用现有 server-assigned timestamp 行为。
- `seq`、source-event idempotency、event identity、token/content/metadata 与事务语义保持不变。

### Read/replay domain

- 同 session 的 Raw 顺序只按 durable `seq` 判断；reader 不得以 `created_at` 倒序、相等、future skew 或
  late arrival 拒绝 writer 已提交的历史。
- 所有 retained rows 仍须逐条满足现有 row shape、timestamp grammar、positive unique seq、scope/session 与
  append-only integrity；本工单不把 corruption 检查降级为“全部接受”。
- compile、Hot Raw/reopen、recall 和 exact replay 如需稳定顺序，必须使用 `seq` 及其既有 tie-free contract，
  不能按 `created_at` 重新排序。
- 历史合法 Raw 必须原样读取；禁止 UPDATE/backfill/rewrite/delete，禁止通过 schema migration 修正旧时间。
- derived output 可以原样携带 stored canonical `created_at`，但不能由它推断 append causality。

## Compatibility

- 新旧数据库中的合法 Raw row 均可 reopen/replay；倒序时间不触发 migration，也不推进/改写任何 revision、
  Frontier、Takeover、State、Fact/Relation 或 Snapshot。
- 已存在的 exact replay/hash/provenance 必须继续绑定原 event/seq/content/timestamp bytes。
- source timestamp 相同、跨时区等价输入经新 writer canonicalization 后，reader 均只验证单条合法性。
- 现有非法/非 canonical/tampered row 的 fail-closed 行为只在有 repository contract 支撑时保留；若历史
  writer 曾合法产生某形状，reader 不得新增更窄条件拒绝它。

## 路由文件

实施前只读取：

- `docs/architecture/LT-Agent-Architecture-Contract-2026-08-24-v3.1.1.md` 的 Raw Source / Raw Event、
  append-only 与 `created_at` 字段段落；
- `docs/architecture/Umbrella-Implementation-Plan-2026-08-24-v3.1.1.md` 的 Raw/Ledger replay 边界；
- `src/raw-store.ts`；
- `src/core.ts` 中 ingest/compile Raw seam；
- 机械索引命中的直接 Raw reader：`src/assembler.ts`、`src/recall.ts`、`src/ledger-hot-raw.ts` 与
  `src/operational-context.ts`，仅在其实际检查/排序 `created_at` 时深读；
- `test/raw-store.test.ts`、`test/mcp-protocol.test.ts`，以及确有直接 replay contract 的 focused tests。

允许修改：

- 经上述路由证明拥有 timestamp validation/read ordering 的最小 `src/` 路径；
- 对应 focused tests；
- README 的公开 timestamp 说明；
- `docs/PROJECT_STATE.md`、`docs/ROADMAP.md`；
- 本工单与 Builder handoff。

若机械审计证明修复需要 schema migration、新时间列、跨 owner transaction 或改写历史 Raw，必须停止并
先重开 bounded Gate；本工单不隐含授权。

## 验收

1. 真实 stdio 对同一 session 依次 ingest `2026-08-02T00:00:00Z` 与
   `2026-08-01T00:00:00Z`，两次写入和随后 `compile_context` 均成功。
2. direct store/Core 与 stdio 均证明 rows 仍为 `seq=1,2`，stored timestamps 保持各自 canonical value，
   compile/render order 不按时间倒排。
3. close/reopen 后同一 session 的 Raw list、Hot Raw、compile 与 exact replay 仍成功且 byte-stable；没有
   UPDATE/backfill/schema rewrite。
4. 覆盖 equal timestamp、future timestamp、late arrival、跨时区 canonicalization；非法 timestamp 在
   writer 边界仍拒绝且不落盘。
5. 人工 tamper 的 duplicate/invalid seq、session/scope mismatch、非法 timestamp 或既有不可变性破坏仍 fail-closed；
   兼容范围只覆盖历史 writer 已落盘的可解析 RFC 3339 timestamp，不把 arbitrary string 晋升为合法时间。
6. source-event idempotency、并发 append、九工具顺序、public result boundary 与其他八工具输出保持
   不变；除 `ingest_event.created_at` 的 RFC 3339 schema refinement 外，全部 input schemas byte-value 等价。
7. focused tests、`npm test`、`npm run build`、production-only stdio package 与 `git diff --check` 通过。
8. Builder 写独立 handoff；fresh Independent QA 固定 candidate 后独立重现倒序、reopen/replay、tamper 与
   production package 场景。

## 明确不做

- 不新增或回填 `source_created_at` / `ingested_at` / 第六 revision axis；
- 不修改 event size、role/tool candidate eligibility、import/chunk/session policy；
- 不调 Retrieval、ranking、Recent Raw、State Extractor、Context Assembly 或 Summary；
- 不清理托管数据库，不访问外部 QA Case/Gold/Raw/Evidence/artifact；
- 不修改 Host、provider、模型、网络或同级仓库。
