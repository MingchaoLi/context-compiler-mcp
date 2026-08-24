# WO-03B — Ledger High-water + Hot Raw Replay
## Long-term Agent / Context Compiler

**状态：** PLANNED / NOT STARTED — EXECUTION BASELINE NOT YET FROZEN<br>
**类型：** Core Raw Event projection + replay implementation<br>
**依赖：** WO-03A fixed Builder candidate
`c93072dc5e4b5c89464b003e716bbb688b072b89` and Independent re-QA commit
`f02c5e12ee0931d4a23a999fa2dc2c0dbb977940`<br>
**目标：** 在冻结的 WO-03A scope/revision/transaction substrate 上，只实现
canonical Raw Event projection 的 durable append、Ledger high-water 与从 committed
Frontier 重建 Hot Raw；不推进 Frontier，不实施任何 Semantic Takeover/State 业务。

---

# 1. Bounded Result

本工单只交付：

```text
explicit namespace + stream Raw Source projection
→ canonical append-only Raw Event at ledger_revision
→ durable per-scope Ledger high-water
+ committed frontier_position read
→ crash-safe Hot Raw rebuild
```

Hot Raw 是 `frontier_position < event.ledger_revision <= ledger_high_water` 的
可重建投影。push notification 不作为正确性来源，本工单不需要实现 push。

---

# 2. Execution Baseline Gate

实现前必须新增：

```text
docs/inventory/WO-03B/execution-baseline-manifest.md
```

至少固定 repository/branch/source baseline/planning authority/parent/clean
status/submodules/config hashes、WO-03A fixed candidate + QA commit、实现时间。

硬 Gate：

- `main`、HEAD、parent、clean policy 精确记录；
- WO-03A fixed candidate 与 re-QA acceptance 在祖先链；
- Contract/Umbrella/本 WO 已进入 repository authority；
- PROJECT_STATE/ROADMAP 唯一下一工单均为 WO-03B；
- Builder 期间任何未记录 source/schema/test/config/official artifact 漂移使
  baseline 失效。

---

# 3. DEPENDENCIES

- Contract v3.1.1 Raw Source/Event、Namespace/Stream/Ledger Revision、Hot Raw
  Tail/Raw Frontier、Ledger recovery、Snapshot high-water 与不变量；
- Umbrella v3.1.1 WO-03B Registry、dependency graph、Shared Change-Surface Rule；
- WO-01 Raw/Experience writer、revision identity、transaction/crash inventory；
- WO-02 accepted Core/Host authority boundary；
- WO-03A accepted scope/vector/transaction/marker/schema contract；
- accepted v0 Raw/Event mirror、State/Recall/telemetry/exactly-nine/evaluation。

---

# 4. CAN READ

按最小 call-chain：

- `src/revision-substrate.ts`（只读 frozen dependency）；
- `src/core.ts`, `src/index.ts`, `src/sqlite-initialization.ts`；
- `src/raw-store.ts`, `src/experience-ledger.ts`, `src/recall.ts`；
- 对应直接测试和 package/TypeScript config；
- routed WO-01/02/03A architecture/inventory/handoff/QA 证据。

禁止读取同级 Host 仓库。未知 Host identity/routing 保持 Unknown。

---

# 5. CAN CHANGE

```text
src/ledger-hot-raw.ts
src/core.ts
src/index.ts
test/ledger-hot-raw.test.ts
test/core-boundary.test.ts            # 仅新 Core library boundary/lifecycle
docs/architecture/WO-03B-ledger-high-water-hot-raw-replay.md
docs/inventory/WO-03B/**
docs/handoffs/WO-03B-ledger-high-water-hot-raw-replay.md
```

若上述表面不足，必须先更新本 WO 解释调用链和验收必要性。默认不得修改
`src/revision-substrate.ts` 或任何现有 Store/schema owner。

---

# 6. MUST NOT CHANGE

- WO-03A namespace/stream validation、revision allocator、schema、CAS、commit marker、
  replay、transaction capability 或 root boundary；
- 现有 `raw_events` / Experience EVENT mirror / State / Headline/FTS schema 和语义；
- current `ingest_event` 的 `session_id`、seq、source-event retry、return/error；
- fixed recent-N/BM25/Dense/dormancy/assembly/telemetry/evaluator/artifacts；
- MCP 九工具数量、名称、schema、结果与错误合同；
- Raw Frontier advance、SemanticTakeoverCommit、SemanticEnrichmentCommit、Fact/
  Relation/State policy、Compaction Artifact、Snapshot、Action、Outbox、worker；
- Host/provider/network/credential/UI/delivery；
- legacy `session_id`、Raw seq、Experience seq 到 `stream_id`/`ledger_revision` 的
  rename/backfill/fallback；
- cross-scope revision comparison或单一 global allocator。

禁止网络、远端模型、生产数据库与 destructive command。

---

# 7. MUST PRESERVE

1. WO-03A accepted commit chain、four-axis isolation、private mutation boundary。
2. v0 Raw + EVENT mirror atomicity、append-only、source retry 与现有读取。
3. State/Recall/compile telemetry/operational context/evaluation 全部行为。
4. provider-neutral、offline/local-first、Core/Host direction、exactly-nine MCP。
5. package/config/dependency 与 official artifact byte identity。

---

# 8. Canonical Raw Source Projection Input

新增 library/Core domain input 必须显式包含：

```text
scope.namespace
scope.stream_id
event_id
source_kind            # user_input | tool_result | file | external_observation
source_id
source_session_id?     # provenance only; never stream identity
payload                # canonical plain JSON
occurred_at?
```

- `event_id` 是 stable Raw Event identity 和 scoped idempotency key；
- `source_session_id` 仅为可选 provenance；不得默认等于 `stream_id`；
- 同一显式 stream 可接收来自多个 session 的 Raw Source，证明 cross-session；
- 所有 identity/plain JSON/timestamp 在 transaction 前严格校验；
- 相同 event ID + exact normalized input 返回原 Event；任何替换稳定冲突；
- 不接受 caller 自报 `ledger_revision`、Frontier 或 hash。

本工单可新增 Core library method，但不得新增 MCP command 或 Host adapter。

---

# 9. Raw Event / Ledger Schema Contract

新增 additive、版本化、transactional schema，至少表达：

```text
namespace
stream_id
ledger_revision
event_id
source_kind
source_id
source_session_id?
payload_json
occurred_at?
created_at
```

硬合同：

- Raw Event append-only；scope + ledger revision 唯一；event ID 稳定唯一；
- scope row/revision 必须来自 frozen WO-03A substrate；
- domain row insert、ledger axis `+1`、immutable commit marker 在同一 WO-03A
  callback transaction；
- callback/row/marker/commit 失败不占 revision、不留下 Raw Event；
- migration completion 必须 transactionally proven、并发 first-open/reopen 安全；
- legacy DB 不 backfill，任何 same-name partial/collision fail-closed；
- 不读取/改写旧 `raw_events` 以伪造 canonical ledger。

---

# 10. Ledger High-water Contract

```text
ledger_high_water = scope-bound committed ledger_revision
```

- 只能来自同一 scope 的 WO-03A vector；
- append 成功后 Event revision 与新的 high-water 一致；
- failed append/retry 不跳号；
- 不同 namespace/stream 的 high-water 不得比较或共享；
- read 必须携带 scope，不返回脱离 scope 的裸 high-water。

---

# 11. Hot Raw Rebuild Contract

一次 rebuild 必须在单一 SQLite read snapshot 内固定：

```text
revision vector / ledger high-water
committed frontier_position
canonical Raw Events where
frontier_position < ledger_revision <= ledger_high_water
```

返回完整 scope、vector/high-water 与按 ledger revision 排序的 Event 引用/内容。

- 不使用 fixed recent-N、chat turn count、headline 或 retrieval score 作为边界；
- 不持久化可漂移的内存-only authority；
- Ingest commit 后即使 process crash/没有 push，reopen 也从 durable row 重建；
- rebuild 本身只读，不推进任何 revision/position；
- 并发新 Event 要么在本 snapshot high-water 内完整出现，要么留给下一次 rebuild；
- absent scope 返回 zero vector + empty Events，不 materialize row。

---

# 12. Frontier Boundary

WO-03B 只读 `raw_frontier_revision` / `frontier_position`。Frontier 可能保持零，
此时所有 committed canonical Raw Event 都是 Hot Raw。

本工单不得调用 Frontier/Takeover mutation primitive。连续安全前缀、proposal
coverage、推进 Frontier 与删除 Hot Raw 的权威决定属于 WO-04。

---

# 13. CRASH / CONCURRENCY / REPLAY CASES

至少验证：

1. fresh/legacy DB concurrent first-open、idempotent reopen、collision rollback；
2. append row/revision/marker 同事务，callback/constraint/marker failure 全 rollback；
3. exact retry 稳定且不重复推进，event/key/source/payload/timestamp 替换冲突；
4. 两连接并发 append 同 scope 得到连续唯一 revisions；同 event 只有一次；
5. scope A/B、authority/shadow、同名 stream 隔离；
6. 同一 stream 的不同 `source_session_id` 均进入一个 ledger/hot tail；
7. ingest commit 后模拟无 push close/reopen，Hot Raw 完整重建；
8. rebuild 的 high-water/vector/events 为一个 consistent read snapshot；
9. committed Frontier 非零时只返回其后 Event，但不推进 Frontier；
10. invalid/C1/cyclic/accessor/exotic/overflow input 在 mutation 前拒绝；
11. current v0 Raw/State/Recall/telemetry/MCP/evaluation 回归；
12. source/schema/config/official artifact allowlist 无漂移。

所有写诊断只在隔离临时数据库执行。

---

# 14. Deliverables

1. `docs/inventory/WO-03B/execution-baseline-manifest.md`
2. `docs/architecture/WO-03B-ledger-high-water-hot-raw-replay.md`
3. `docs/inventory/WO-03B/ledger-schema-replay-map.md`
4. Core-owned source/export/lifecycle wiring
5. focused migration/crash/concurrency/replay tests
6. `docs/handoffs/WO-03B-ledger-high-water-hot-raw-replay.md`
7. Independent QA separately writes
   `docs/qa/WO-03B-ledger-high-water-hot-raw-replay.md`

---

# 15. ACCEPTANCE

- [ ] Execution Baseline fixed before source implementation.
- [ ] Explicit scope + canonical Raw Source input; provenance session is not identity.
- [ ] Event row, ledger revision and marker commit atomically and append-only.
- [ ] High-water is scope-bound durable ledger revision with no gaps from failed writes.
- [ ] Hot Raw rebuild uses committed Frontier and one consistent read snapshot.
- [ ] Crash/no-push reopen reconstructs complete Hot Raw.
- [ ] Authority/shadow and cross-session provenance cases pass.
- [ ] Exact replay/conflict/concurrency/migration fail closed.
- [ ] WO-03A source/schema/CAS/marker/private boundary is unchanged.
- [ ] Frontier is never advanced; no WO-04/05+ business appears.
- [ ] No legacy session/seq backfill or silent reinterpretation.
- [ ] Existing Raw/State/Recall/telemetry/exact-nine/evaluation compatible.
- [ ] Focused tests, `npm test`, `npm run build`, `git diff --check` pass.
- [ ] Candidate paths exactly match allowlist; no network/Host/production DB.
- [ ] Builder handoff exists and Builder does not approve itself.
- [ ] Independent QA can reproduce claims from candidate alone.

---

# 16. QA HANDOFF

Builder handoff必须记录 baseline/planning/candidate、exact paths、schema/source
fingerprints、input/identity/high-water/rebuild contracts、crash/concurrency/replay、
compatibility proof 与未实现 WO-04+。

Independent QA 必须 pin 精确 candidate 并独立验证：

- session provenance cannot become scope identity；
- event identity/replay substitution/concurrent revision allocation；
- row + revision + marker rollback；
- forged/partial migration completion；
- crash-without-push and consistent snapshot rebuild；
- non-zero Frontier filtering without mutation；
- frozen WO-03A and current v0/protocol/artifact no drift。

QA 只写独立记录；Builder 停在 WO-03B，不进入 WO-04/WO-05。
