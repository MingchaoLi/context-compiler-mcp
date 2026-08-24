# WO-03A — Shared Revision / Stream / Transaction Substrate
## Long-term Agent / Context Compiler

**状态：** PLANNED / NOT STARTED — EXECUTION BASELINE NOT YET FROZEN<br>
**类型：** Core persistence substrate implementation<br>
**依赖：** WO-02 fixed Builder candidate
`a03a059d9c0823d0500f42659e6be891558f12be` and Independent re-QA commit
`8204ccc484cdc2a36218dc5f4a350f5d1c607f50`<br>
**目标：** 只实现后续 WO-03B 与 WO-04 共同依赖的显式 namespace / stream /
revision / transaction substrate；冻结作用域、四轴、CAS、commit marker 与幂等
回放原语，不实现任何 Hot Raw 或 Semantic Takeover 业务策略。

---

# 1. Bounded Result

本工单只交付一个结果：

```text
explicit namespace + stream scope
→ four separate monotonic revision axes
→ one Core-owned SQLite transaction substrate
→ exact-replay commit markers
→ frontier revision/position double-CAS primitive
→ takeover commit identity + stream ordering primitive
```

这是后续业务 writer 的共享底座，不是 Raw Frontier、State/Fact、Takeover、
Snapshot 或 Shadow runtime 的首次业务实现。

---

# 2. Execution Baseline Gate

实现开始前必须新增：

```text
docs/inventory/WO-03A/execution-baseline-manifest.md
```

至少固定：

```text
repository_path
branch
source_baseline_HEAD
planning_authority_commit
expected_parent / base reference
worktree_status
worktree_clean
submodule_revisions
relevant_config_fingerprint
wo02_fixed_candidate
wo02_qa_commit
implementation_started_at
```

硬 Gate：

- `main`、HEAD、parent 与 clean policy 已精确记录；
- WO-02 fixed candidate 与 Independent QA acceptance 均在祖先链；
- Contract v3.1.1、Umbrella v3.1.1 与本 WO 已进入 repository authority；
- PROJECT_STATE / ROADMAP 唯一下一工单均指向 WO-03A；
- source/schema/test/config/official artifact 在 Builder 期间无未记录漂移。

---

# 3. DEPENDENCIES

- Contract v3.1.1 的收口摘要、Core ownership、Namespace/Stream/Revision、
  Raw Event identity、Raw Frontier、CAS、Shadow namespace 与关键不变量；
- Umbrella v3.1.1 的 WO-03A Registry、Shared Change-Surface Rule 与 Shadow
  Namespace Gate；
- WO-01 revision identity、persistence/transaction/crash inventory；
- WO-02 accepted Core/Host contract 与 Authority / Mutation Matrix；
- 当前 v0 accepted/frozen Raw/Event、State、Headline/FTS、compile telemetry、
  exactly-nine MCP、public export 与 evaluation behavior。

---

# 4. CAN READ

按 call-chain 最小路由读取：

- `src/core.ts`
- `src/index.ts`
- `src/sqlite-initialization.ts`
- `src/raw-store.ts`
- `src/experience-ledger.ts`
- `src/state-store.ts`
- `src/state-update.ts`
- `src/reducer.ts`
- `src/recall.ts`
- 上述边界的直接测试与 package/TypeScript config；
- accepted WO-01/WO-02 inventory、architecture、handoff 与 QA 证据。

禁止读取同级 Host 仓库。未知 Host identity/routing 继续为 Unknown。

---

# 5. CAN CHANGE

只允许共享 substrate、Core ownership、additive migration 与证明性测试所需：

```text
src/revision-substrate.ts
src/core.ts
src/index.ts
src/sqlite-initialization.ts        # 仅共享 transaction/migration primitive 所需
test/revision-substrate.test.ts
test/core-boundary.test.ts           # 仅 Core lifecycle/ownership 回归所需
test/sqlite-initialization.test.ts    # 仅 additive migration/crash 证明所需
docs/architecture/WO-03A-shared-revision-stream-transaction-substrate.md
docs/inventory/WO-03A/**
docs/handoffs/WO-03A-shared-revision-stream-transaction-substrate.md
```

本工单默认不修改 Raw、Experience、State、Recall 的业务 Store。若机械 call-chain
证明 additive substrate migration 无法在新模块/现有 initialization helper 内安全
完成，必须先更新本 WO，逐一说明需修改的 Store 路径、现有行为保持与验收必要性。

---

# 6. MUST NOT CHANGE

- 现有 Raw/Event mirror、State、Relation、Headline/FTS、Experience Ledger 的
  schema 语义、返回 shape、revision/retry/idempotency 行为；
- MCP 九工具的数量、名称、schema、结果或错误合同；
- fixed recent-N、BM25、Dense、dormancy、assembly、extractor/reducer 算法；
- compile telemetry writer fence、trace/hit payload 与 origin 规则；
- evaluator、frozen baseline、sealed evidence 或 official artifacts；
- dependency、provider、network、credential、Host/UI/delivery；
- Hot Raw selection/rebuild policy、State/Fact/Relation 新 schema/语义、
  Semantic Takeover/Enrichment 业务 commit、Compaction Artifact、Snapshot、
  Operation/Action、Verification、Outbox、Shadow routing/promotion 或 worker；
- 把 `session_id`、Raw `seq`、Experience `seq` 或旧 State revision 静默重命名/
  backfill 为 v3.1.1 `stream_id` / shared revision；
- 跨 stream/namespace revision 数字比较或单一 global revision。

禁止远端模型、网络、生产数据库与 destructive command。

---

# 7. MUST PRESERVE

1. WO-02 stable Core surface、Host/MCP dependency direction 与 Store lifecycle。
2. Raw/Event atomicity、source-event retry 与 append-only behavior。
3. State preparation fingerprint、expected revision、empty/non-empty retry 与
   reducer atomicity。
4. Headline/FTS 原子性与 recall behavior。
5. compile telemetry database-wide fence 与 reserved writer protection。
6. provider-neutral、offline/local-first 与 exactly-nine MCP behavior。
7. current package exports；新增 substrate 不删除或重解释旧 export。
8. evaluation/official artifact byte identity。

---

# 8. Required Scope Contract

必须冻结并验证：

```text
namespace
stream_id
```

- scope 必须显式传入；Core/substrate 不读取 Host/provider identity；
- `authority` 是正式 namespace；shadow substrate 至少支持
  `shadow:<experiment_id>`，且 composite key 完全隔离；
- `stream_id` 是 opaque logical continuity identity，不是 chat/session 别名；
- 不得提供隐式 `session_id → stream_id` fallback；
- 空、空白、超长、控制字符、非 plain-data 或不支持的 namespace 必须在写前拒绝；
- 所有 scope 查询必须显式带两字段，不提供跨 namespace 默认合并读。

Shadow 支持只到 isolated namespace storage。不得实现 shadow routing、对比、
promotion 或默认 authority 读取。

---

# 9. Four Separate Axes

每个 `(namespace, stream_id)` 必须持久化并独立维护：

```text
ledger_revision
state_revision
raw_frontier_revision
takeover_commit_revision
```

另持久化：

```text
frontier_position
```

硬合同：

- revision 从明确的 zero state 开始，仅在对应成功 commit 后单调推进；
- 四轴不得使用同一计数器或因另一轴 commit 隐式推进；
- 不同 scope 的 revision 不得比较或共享 allocator；
- `frontier_position` 不是第五轴；它只能随成功 Frontier CAS 改变；
- safe integer/SQLite integer overflow 必须 fail-closed，不能 wrap；
- 读取返回完整 scope 与全部当前轴，避免裸 revision 脱离 scope。

WO-03A 只提供 ledger/state revision commit primitive；不把当前 v0 Raw/State
业务 writer 自动迁移到新语义。

---

# 10. Common Transaction + Commit Marker

必须提供一个 Core-internal SQLite transaction helper，使后续 Core writer 能在
同一连接/同一 `BEGIN IMMEDIATE` 中原子完成：

```text
validate expected scope/axis state
→ apply future domain rows through an internal callback/transaction context
→ advance selected revision axes
→ append immutable commit marker
→ COMMIT
```

要求：

- Host adapter 不能取得 SQLite handle 或 generic authority mutation command；
- transaction context 只供同 repo Core module 使用；
- callback 失败、marker 失败、revision CAS 失败或 commit 失败全部 rollback；
- 禁止 nested substrate transaction；
- commit marker 至少绑定 scope、stable commit/idempotency key、kind、输入
  fingerprint、previous/new axes、result replay payload 与 created_at；
- 相同 key + 相同 exact normalized request 必须返回原结果且不再推进 revision；
- 相同 key + 不同 request 必须 stable conflict；
- 失败尝试不得留下 marker、占用 revision 或改变 position。

输入 fingerprint 必须由 substrate 内部对 canonical normalized plain data 计算，
不能信任 caller 提供 hash 代替实际 request。

---

# 11. Frontier CAS Primitive

只实现 substrate CAS，不实现 Takeover 业务：

```text
expected_frontier_revision
expected_frontier_position
next_frontier_position
commit_id / request
```

成功必须原子：

- 同时校验 expected revision 与 expected position；
- `raw_frontier_revision = previous + 1`；
- 更新 `frontier_position`；
- 写 immutable commit marker；
- 产生稳定 replay result。

任一 expected 值不匹配时不得 commit。position 不得回退、不得超过当前
`ledger_revision`；“连续安全前缀”的 proposal/coverage 业务验证属于 WO-04，
本工单不伪造。

---

# 12. Takeover Commit Identity / Ordering Primitive

必须支持但不执行业务 Takeover：

```text
takeover_commit_id       # stable idempotency identity
takeover_commit_revision # per-scope monotonic order
```

- ID 与 revision 同时存在且不可互相替代；
- exact retry 返回同一 ID/revision/result；
- conflicting reuse 稳定拒绝；
- ordering 只在同一 scope 有意义；
- primitive 可以与 Frontier CAS 在一个 substrate transaction 中原子组合；
- 不新增 Fact/Relation/State/Compaction rows，不判断 proposal coverage。

---

# 13. Additive Migration / Compatibility

- 新 schema 必须 additive、transactional、可并发首次打开、可幂等 reopen；
- 不修改或 backfill 旧表为目标语义；
- 不把已有 session 数据自动放入 `authority` 或 shadow stream；
- legacy database、fresh database、并发 process/connection 均能安全初始化；
- migration failure 不得留下“看似完成”的 substrate；必须有 schema/version 或
  completion marker 证明完整性；
- 当前 State partial-DDL 风险保持原 owner，本工单不得借机暗改。

---

# 14. CRASH / CONCURRENCY / REPLAY CASES

至少验证：

1. fresh/legacy DB 首次并发初始化与幂等 reopen；
2. scope A/B、authority/shadow 同名 stream 完全隔离；
3. 每条 revision 轴独立单调，另一轴不随动；
4. 两连接竞争同 expected revision/CAS 只有一个成功；
5. Frontier 只校验 revision 或只校验 position 均不得绕过 double-CAS；
6. callback/marker/commit 前注入失败完整 rollback；
7. exact retry byte/shape 等价且不重复推进；conflicting retry 拒绝；
8. takeover ID/revision 幂等与同 scope ordering；
9. close、重复 close、partial constructor failure 的 resource behavior；
10. overflow、非法 scope、非 plain/cyclic/accessor input 在 mutation 前拒绝；
11. current MCP/Raw/State/Recall/compile behavior 回归；
12. schema/source change allowlist 与 official artifacts 无漂移。

WO-09 才负责 full system crash matrix；这里的测试只证明 substrate 自身，不得
用 QA/replay 测试首次补实现业务能力。

---

# 15. Deliverables

1. `docs/inventory/WO-03A/execution-baseline-manifest.md`
2. `docs/architecture/WO-03A-shared-revision-stream-transaction-substrate.md`
3. `docs/inventory/WO-03A/substrate-schema-transaction-map.md`
4. Core-owned substrate source/export/lifecycle wiring
5. focused crash/concurrency/replay tests
6. `docs/handoffs/WO-03A-shared-revision-stream-transaction-substrate.md`
7. Independent QA separately creates
   `docs/qa/WO-03A-shared-revision-stream-transaction-substrate.md`

---

# 16. ACCEPTANCE

- [ ] Execution Baseline Gate fixed before source implementation.
- [ ] Scope is explicit; authority/shadow composite keys isolate; no session fallback.
- [ ] Four primary axes remain separate and scope-bound; frontier position is not an axis.
- [ ] Additive schema has transactional completion proof and concurrent initialization.
- [ ] Common transaction helper provides rollback, marker, CAS and exact replay.
- [ ] Ledger and State revision primitives advance only their selected axis.
- [ ] Frontier double-CAS validates revision + position, cannot regress/exceed ledger.
- [ ] Takeover commit ID/revision primitive is atomic, ordered per scope and idempotent.
- [ ] Host/MCP cannot call a generic authority mutation or access SQLite context.
- [ ] No old session/seq/revision is silently reinterpreted/backfilled.
- [ ] No WO-03B Hot Raw or WO-04 semantic State/Fact/Takeover business is implemented.
- [ ] Exactly-nine MCP, current results/errors, Raw/Event, State, Recall, telemetry,
      package exports, evaluation and artifacts remain compatible.
- [ ] Focused crash/concurrency/replay tests pass.
- [ ] `npm test` and `npm run build` pass.
- [ ] Candidate changes only WO-03A allowlisted paths plus its planning authority.
- [ ] No remote model, network, production DB, Host repo or destructive command.
- [ ] Builder writes handoff and does not approve itself.
- [ ] Independent QA can reproduce every substrate claim from candidate alone.

---

# 17. QA HANDOFF

Builder handoff must record：

```text
source_baseline_HEAD
planning_authority_commit
builder_candidate_HEAD
exact changed paths
schema/migration fingerprint
scope and axis contract
transaction/marker/replay contract
crash/concurrency test results
compatibility proof
known risks / unimplemented WO-03B+
```

Independent QA must pin the exact Builder candidate and independently attack:

- namespace/stream isolation and forbidden implicit mapping；
- axis coupling / cross-stream comparison；
- concurrent allocator/CAS races；
- partial migration and callback/marker rollback；
- replay key request substitution；
- Frontier revision/position confusion；
- takeover ID/revision conflation；
- generic Host mutation leakage；
- current v0 behavior/protocol/artifact drift。

QA 只写独立记录；Builder 停在 WO-03A，不进入 WO-03B/WO-04。
