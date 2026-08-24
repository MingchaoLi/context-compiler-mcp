# WO-04A — Canonical State Revision Commit
## Long-term Agent / Context Compiler

**状态：** PLANNED / NOT STARTED — EXECUTION BASELINE NOT YET FROZEN<br>
**类型：** Core canonical State authority implementation<br>
**依赖：** WO-03A fixed Builder candidate
`c93072dc5e4b5c89464b003e716bbb688b072b89` + Independent re-QA
`f02c5e12ee0931d4a23a999fa2dc2c0dbb977940`；WO-03B accepted Builder
candidate `24b7ba6971be2d8dc761368ecb66722ff053f4ea` + Independent QA
`92e72eb785b2670068597376bccfd1136e3c6952`<br>
**目标：** 只实现显式 namespace/stream 下 proposal-validated、append-only、可回放的
Canonical State Revision commit；不实现 Fact/Relation Authority、Semantic Takeover /
Enrichment、Frontier advance、Compaction Artifact、Snapshot 或 Host 集成。

---

# 1. Bounded Result

本工单只交付一个结果：

```text
explicit scope
+ stable state_commit_id
+ expected State revision
+ validated canonical State proposal
→ immutable CommittedStateRevision
+ state axis +1
+ exact replay marker
```

Commit mode 可记录为：

```text
immediate_authority | lazy_historical | targeted_on_demand
```

三者共享同一 proposal/validation/revision/idempotency transaction；mode 只表达提交
来源，不给予绕过验证的权力。04A 不负责 detector、extractor 或调度触发策略。

Umbrella WO-04 的剩余结果明确延后：

- WO-04B：Fact / Relation Authority、epistemic/verification/lifecycle/record policy；
- WO-04C：Semantic Takeover / Enrichment、contiguous Frontier、Compaction Artifact。

WO-05 仍依赖整个 WO-04 子序列完成；04A 单独通过不授权 WO-05。

---

# 2. Execution Baseline Gate

实现前必须新增：

```text
docs/inventory/WO-04A/execution-baseline-manifest.md
```

至少固定 repository/branch/source baseline/planning authority/parent/clean status/
submodules/config hashes、WO-03A 与 WO-03B fixed candidate/QA、实现时间。

硬 Gate：

- `main`、HEAD、parent、clean policy 精确记录；
- WO-03A/03B fixed candidates 与 QA commits 均在祖先链；
- Contract/Umbrella/本 WO 已进入 repository authority；
- PROJECT_STATE/ROADMAP 唯一下一工单均为 WO-04A；
- Builder 期间任何未记录 source/schema/test/config/official artifact 漂移使
  baseline 失效。

---

# 3. DEPENDENCIES

- Contract v3.1.1 Core ownership、Namespace/Stream/Revision、Canonical State、
  State Evolution Policy、Semantic commit idempotency 与关键不变量；
- Umbrella v3.1.1 WO-04 Registry、dependency graph 与 Shared Change-Surface Rule；
- WO-01 State writer/reader、revision identity、persistence/transaction/crash inventory；
- WO-02 accepted Core/Host authority boundary；
- WO-03A frozen scope/state-axis/common transaction/marker/exact replay；
- WO-03B accepted canonical Raw Event identity/high-water/replay，仅作为 provenance
  可引用事实源，不作为 State writer；
- accepted v0 State prepare/apply/reducer 语义与 exact-nine MCP compatibility。

---

# 4. CAN READ

按最小 call-chain：

- `src/revision-substrate.ts`、`src/ledger-hot-raw.ts`（只读 frozen dependencies）；
- `src/core.ts`、`src/index.ts`、`src/sqlite-initialization.ts`；
- `src/types.ts`、`src/state-store.ts`、`src/state-update.ts`、`src/reducer.ts`；
- 上述边界的直接测试与 package/TypeScript config；
- routed WO-01/02/03A/03B architecture、inventory、handoff、QA 证据。

禁止读取同级 Host 仓库。未知 Host identity/routing 保持 Unknown。

---

# 5. CAN CHANGE

```text
src/canonical-state.ts
src/core.ts
src/index.ts
test/canonical-state.test.ts
test/core-boundary.test.ts             # 仅新 Core library boundary/lifecycle
docs/architecture/WO-04A-canonical-state-revision-commit.md
docs/inventory/WO-04A/**
docs/handoffs/WO-04A-canonical-state-revision-commit.md
```

默认不得修改 frozen `src/revision-substrate.ts`、`src/ledger-hot-raw.ts`、旧 State
Store/reducer/schema 或 MCP。若机械 call-chain 证明表面不足，必须先更新本 WO，解释
新增路径、行为保持与验收必要性；不得以便利为由扩大 allowlist。

---

# 6. MUST NOT CHANGE

- WO-03A scope/revision allocator/schema/CAS/transaction/marker/private boundary；
- WO-03B Raw Event schema、append/high-water/rebuild/replay 语义；
- 现有 `context_items` / `state_relations` / `context_state_revisions` /
  `state_update_preparations` schema、session revision 与 prepare/apply/reducer 行为；
- current `get_state` / `prepare_state_update` / `apply_state_delta` MCP command 的
  schema、结果、错误、revision 或 retry；
- MCP 九工具数量、名称、顺序或 Host adapter；
- Fact / Relation durable schema、Fact Policy/Registry、Relation Authority/Policy；
- Raw Frontier advance、SemanticTakeoverCommit、SemanticEnrichmentCommit、
  Compaction Artifact、Snapshot、Operation/Action、Verification、Outbox、worker；
- detector/extractor/provider/network/credential/UI/delivery；
- 把 legacy `session_id`、旧 State revision/item/relation 静默 backfill、rename、
  mirror 或 reinterpret 为 canonical stream/State authority；
- fixed recent-N/BM25/Dense/dormancy/assembly/telemetry/evaluator/artifacts。

禁止网络、远端模型、生产数据库与 destructive command。

---

# 7. MUST PRESERVE

1. WO-03A four-axis isolation、state axis exact replay 与 private mutation boundary。
2. WO-03B canonical Raw Event、ledger high-water、Hot Raw 和 no-push recovery。
3. v0 State preparation fingerprint、expected revision、empty/non-empty delta、reducer
   atomicity 与 public commands。
4. Raw/Experience/Recall/compile telemetry/evaluation 全部现有行为。
5. provider-neutral、offline/local-first、Core/Host direction、exactly-nine MCP。
6. package/config/dependency 与 official artifact byte identity。

---

# 8. Canonical State Proposal Contract

新增 Core library input 必须显式包含：

```text
scope.namespace
scope.stream_id
state_commit_id
commit_mode
expected_state_revision
proposal
policy_hash
provenance_event_ids[]
```

- scope 必须显式；不接受 session/Host fallback；
- `state_commit_id` 是 scoped idempotency identity，不是 revision；
- `expected_state_revision` 必须与同 scope committed vector 一致；
- proposal 必须是严格、封闭、版本化 grammar；不能只接受任意 JSON blob；
- proposal 产生完整确定性 next State，且在 transaction 前完成 plain-data、NFC、
  Unicode `Cc`、bounds、cycle/accessor/exotic 与 exact-key validation；
- `policy_hash` 绑定实际 policy identity，不能由 caller hash 替代未验证 policy；
- provenance refs 只能引用同 scope 已提交 canonical Raw Event，排序/重复规则固定；
- `immediate_authority`、`lazy_historical`、`targeted_on_demand` 均不得绕过同一
  validator；detector/extractor 输出只有 Proposal，没有 Authority；
- caller 不得自报 new revision、state hash、commit marker 或 transaction handle。

在写 source 前，architecture deliverable 必须冻结 exact proposal grammar、确定性
reduction、empty proposal 语义、完整 State projection shape 与 policy identity 算法。
若 Contract 和现有 v0 primitives 不能唯一决定这些细节，先更新本 WO，不得在代码中
隐式决定。

---

# 9. Committed State Revision Contract

新增 additive、版本化、transactional schema 至少表达：

```text
namespace
stream_id
state_revision
state_commit_id
commit_mode
previous_state_revision
proposal_json
state_json
state_hash
policy_hash
provenance_event_ids_json
created_at
```

硬合同：

- 每次 successful non-empty authority commit 产生 immutable State Revision row；
- row insert、state axis `+1`、commit marker 在同一 frozen WO-03A callback transaction；
- exact empty proposal 的权威语义必须在 architecture 文档固定：若不推进，则不能
  留下伪 State revision；若记录 no-op marker，则必须可审计且 exact replay；
- previous/new revision 与完整 State hash 可从 persisted bytes 独立重建；
- callback/row/marker/CAS/commit 任一失败全部 rollback，不占 revision；
- exact normalized retry 返回原 committed result；任何 proposal/mode/expected/
  policy/provenance 替换 stable conflict；
- concurrent same-base proposals 至多一个成功，失败者必须重新读取/计算；
- migration completion transactionally proven；fresh/legacy concurrent first-open、
  reopen 安全；same-name partial/collision/forged completion fail-closed；
- legacy State 不 backfill、不自动成为 revision zero snapshot。

---

# 10. Read and Authority Boundary

至少提供显式 scope read：

```text
read latest committed Canonical State
read exact committed State revision
```

- absent scope 返回 zero vector + explicit empty canonical State，不 materialize row；
- read 返回完整 scope、state revision/hash/policy/provenance，不能返回裸 revision；
- latest read 必须与同 scope substrate vector 在一个 consistent read snapshot；
- Core 可新增 domain library methods，但不新增 MCP command/Host adapter；
- Store、migration、SQLite handle、generic commit callback 不从 package root 导出，
  也不能通过 Core instance reflection 取得。

本工单的 committed State 只有新 canonical library path 可消费；它不得静默替换 v0
`get_state`/assembly/retrieval 的现行数据源。正式 Working Context 接管属于 WO-05。

---

# 11. CRASH / CONCURRENCY / REPLAY CASES

至少验证：

1. fresh/legacy DB concurrent first-open、idempotent reopen、collision rollback；
2. proposal row/state axis/marker 同事务，row/marker/vector/commit failure 全 rollback；
3. exact retry稳定，proposal/mode/expected/policy/provenance替换冲突；
4. 两连接同 base 竞争最多一胜，随后重算可连续推进且无 gap；
5. scope A/B、authority/shadow、同名 stream 完全隔离；
6. provenance event 必须同 scope、已 committed，缺失/跨 scope/重复规则 fail-closed；
7. close/reopen 可读取相同 immutable State bytes/hash/revision；
8. latest vector + State row 为 consistent read snapshot；
9. invalid/Cc/non-NFC/cyclic/accessor/exotic/overflow input 在 mutation 前拒绝；
10. current v0 State commands/reducer、Raw/Recall/telemetry/MCP/evaluation 回归；
11. WO-03A/03B source/schema 与 source/config/artifact allowlist 无漂移。

所有写诊断只在隔离临时数据库执行。

---

# 12. Deliverables

1. `docs/inventory/WO-04A/execution-baseline-manifest.md`
2. `docs/architecture/WO-04A-canonical-state-revision-commit.md`
3. `docs/inventory/WO-04A/state-authority-schema-transaction-map.md`
4. Core-owned source/export/lifecycle wiring
5. focused migration/crash/concurrency/replay tests
6. `docs/handoffs/WO-04A-canonical-state-revision-commit.md`
7. Independent QA separately writes
   `docs/qa/WO-04A-canonical-state-revision-commit.md`

---

# 13. ACCEPTANCE

- [ ] Execution Baseline fixed before source implementation.
- [ ] Exact proposal/state/policy/no-op grammar frozen before source implementation.
- [ ] Explicit scope; no session/Host fallback or legacy backfill.
- [ ] Proposal validation is strict, deterministic, model/provider independent.
- [ ] State row, state axis and marker commit atomically and append-only.
- [ ] Exact replay/conflict/concurrency/overflow/migration fail closed.
- [ ] Provenance references only committed same-scope canonical Raw Events.
- [ ] Latest/exact reads are scoped, durable and consistent after reopen.
- [ ] WO-03A/03B frozen source/schema/private boundaries unchanged.
- [ ] No Fact/Relation/Frontier/Takeover/Enrichment/Compaction/Snapshot behavior.
- [ ] Existing v0 State/MCP/Raw/Recall/telemetry/evaluation compatible.
- [ ] Focused tests, `npm test`, `npm run build`, `git diff --check` pass.
- [ ] Candidate paths exactly match allowlist; no network/Host/production DB.
- [ ] Builder handoff exists and Builder does not approve itself.
- [ ] Independent QA can reproduce claims from candidate alone.
