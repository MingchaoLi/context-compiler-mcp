# WO-04B — Fact / Relation Authority + Policy
## Long-term Agent / Context Compiler

**状态：** PLANNED / NOT STARTED — EXECUTION BASELINE NOT YET FROZEN<br>
**类型：** Core canonical Fact / Relation authority implementation<br>
**依赖：** WO-03A fixed candidate `c93072dc5e4b5c89464b003e716bbb688b072b89`
+ re-QA `f02c5e12ee0931d4a23a999fa2dc2c0dbb977940`；WO-03B candidate
`24b7ba6971be2d8dc761368ecb66722ff053f4ea` + QA
`92e72eb785b2670068597376bccfd1136e3c6952`；WO-04A fixed candidate
`98e02ef898587b013ad588cf7ab2f182afa276e3` + re-QA
`74d39636e112054f7a4ea2b9a2e1be0b3728cdd7`<br>
**目标：** 只实现显式 namespace/stream 下、policy-validated、append-only、可回放的
Canonical Fact / Relation object authority；不实现 Semantic Takeover / Enrichment、
Frontier advance、Compaction Artifact、Snapshot、Host 或 MCP 集成。

---

# 1. Bounded Result

本工单只交付一个结果：

```text
explicit scope
+ stable authority_commit_id
+ expected per-object revisions
+ closed FactProposal / RelationProposal batch
+ code-owned Fact / Relation policy identity
→ immutable Fact / Relation object revisions
+ append-only domain commit record
+ exact replay / stable conflict
```

Fact / Relation revision 是 Contract 3.3 定义的 object/domain revision，不是新的一级
运行轴。04B 不得调用 `LEDGER`、`STATE`、`FRONTIER`、`TAKEOVER` 或
`TAKEOVER_FRONTIER` 来为 Fact/Relation 分配 revision，也不得改变五项现有 vector
字段。domain commit 必须在同一 SQLite transaction 中保存 observed revision vector，
并证明 commit 前后 vector byte-equivalent。

04B 可提供 Core library authority/read methods，但不新增 MCP command。Proposal 来源没有
Authority；model/provider/Host 不能获得 Store、SQLite 或 generic transaction capability。

---

# 2. Execution Baseline Gate

实现前必须新增：

```text
docs/inventory/WO-04B/execution-baseline-manifest.md
```

至少固定 repository/branch/source baseline/planning authority/parent/clean status/
submodules/config hashes、WO-03A/03B/04A candidates 与 QA、实现开始时间。

硬 Gate：

- `main`、HEAD、parent、clean policy 精确记录；
- 依赖 candidates/QA 均在祖先链；
- Contract/Umbrella/本 WO 已进入 repository authority；
- PROJECT_STATE/ROADMAP 唯一下一工单均为 WO-04B；
- Builder 期间任何未记录 source/schema/test/config/official artifact 漂移使 baseline
  失效。

---

# 3. DEPENDENCIES

- Contract v3.1.1 Core ownership、Raw fact root、Propose-don't-mutate、Namespace/Stream、
  Fact epistemic model、FactProposal/Durable Fact、RelationProposal/Durable Relation、
  Shadow isolation 与关键不变量；
- Umbrella v3.1.1 WO-04 Registry、dependency graph、Shared Change-Surface Rule；
- WO-01 Fact/Relation absence、legacy `state_relations`、writer/reader、persistence、
  transaction 与 crash-gap inventory；
- WO-02 accepted authority/mutation matrix；
- WO-03A frozen scope/vector/private transaction boundary，只读；
- WO-03B accepted same-scope committed canonical Raw Event，作为 provenance authority；
- WO-04A accepted Canonical State item identity/read，作为可选 Relation endpoint authority；
- frozen v0 State/Relation/MCP compatibility。

---

# 4. CAN READ

按最小 call-chain：

- `src/revision-substrate.ts`、`src/ledger-hot-raw.ts`、`src/canonical-state.ts`；
- `src/core.ts`、`src/index.ts`、`src/sqlite-initialization.ts`；
- `src/types.ts`、`src/state-types.ts`、`src/state-store.ts`、`src/reducer.ts`；
- 上述边界的直接测试与 package/TypeScript config；
- routed WO-01/02/03A/03B/04A architecture、inventory、handoff、QA 证据。

禁止读取同级 Host 仓库。未知 Host identity/routing 保持 Unknown。

---

# 5. CAN CHANGE

```text
src/canonical-fact-relation.ts
src/core.ts
src/index.ts
test/canonical-fact-relation.test.ts
test/core-boundary.test.ts             # 仅新 Core library boundary/lifecycle
docs/architecture/WO-04B-fact-relation-authority-policy.md
docs/inventory/WO-04B/**
docs/handoffs/WO-04B-fact-relation-authority-policy.md
```

默认不得修改 frozen `src/revision-substrate.ts`、`src/ledger-hot-raw.ts`、
`src/canonical-state.ts`、旧 State Store/reducer/schema 或 MCP。若机械 call-chain 证明
表面不足，必须先更新本 WO，解释新增路径、行为保持与验收必要性；不得以便利为由扩大
allowlist。

---

# 6. MUST NOT CHANGE

- WO-03A revision allocator、namespace/stream schema、五项 vector、CAS、common marker、
  private mutation boundary；
- WO-03B Raw Event schema、append/high-water/rebuild/replay；
- WO-04A Canonical State schema、policy、State axis、marker/read binding；
- legacy `context_items` / `state_relations` / `context_state_revisions` / preparations；
- current v0 State/MCP command schema、结果、错误、revision、retry；
- MCP 九工具数量、名称、顺序或 Host adapter；
- SemanticTakeoverCommit、SemanticEnrichmentCommit、Raw Frontier、Compaction Artifact、
  Snapshot、Promotion、Operation/Action、Verification、Outbox、worker；
- detector/extractor/provider/network/credential/UI/delivery；
- 把 legacy session/item/relation 或 shadow object 静默 backfill、rename、mirror、
  reinterpret 或原地 promotion；
- fixed recent-N/BM25/Dense/dormancy/assembly/telemetry/evaluator/artifacts。

禁止网络、远端模型、生产数据库与 destructive command。

---

# 7. MUST PRESERVE

1. WO-03A axes isolation、schema completion、exact replay 与 Core private boundary。
2. WO-03B canonical Raw Event / Ledger high-water / Hot Raw / no-push recovery。
3. WO-04A Canonical State grammar、revision、provenance 与 read snapshot。
4. v0 State item/relation/reducer/prepare/apply/compile 全部现有行为。
5. provider-neutral、offline/local-first、Core/Host direction、exact-nine MCP。
6. package/config/dependency 与 official artifact byte identity。

---

# 8. Fact Policy / Registry Contract

新增 Core library batch input 必须显式包含：

```text
scope.namespace
scope.stream_id
authority_commit_id
policy_hash
fact_proposals[]
relation_proposals[]
```

architecture deliverable 必须在 source 前冻结 exact closed grammar。最低合同：

- stable `fact_id`，caller 不得自报 `fact_revision`；create 使用 expected revision 0，
  revise 使用 exact expected latest object revision；
- Fact statement、`epistemic_origin` 在同一 `fact_id` 下不可改写；更正须新建 Fact 并以
  typed Relation 表达 supersede/retract reason；
- 正交轴固定为 `epistemic_origin`、`verification_status`、`lifecycle_status`，归档只用
  `record_status`；不得把 contested、superseded、retracted、archived 混成同一状态；
- `contested` 只允许在同一 transaction 的 final graph 中存在未解决
  `CONTRADICTS` evidence；已 verified Fact 仅有异议时保持 verified 并记录 Relation；
- superseded/retracted 必须保留历史，并由同一 scope 的 typed reason Relation 支撑；
- provenance/verification refs 只能引用 same-scope committed canonical Raw Event，
  按 lexical set 规范化；已有 refs 单调不可删除；
- no delete；object revisions contiguous `+1`；empty batch INVALID，reduced no-op
  CONFLICT；
- policy registry、枚举、transition table、bounds 与 hash 全部 code-owned；caller 只可
  提交当前受支持 `policy_hash`，不得用自报 hash 替代实际 policy；
- authority/shadow scope 均使用同一 validator，但 shadow 不得进入 authority 默认读或
  原地变更 namespace。

输入必须在 mutation 前完成 plain-data、exact-key、NFC、Unicode `Cc`、bounds、
cycle/accessor/exotic/sparse-array validation。metadata 必须是严格有界 JSON，不得携带
Host/provider/credential 语义。

---

# 9. Relation Authority / Policy Contract

Durable Relation 至少表达：

```text
relation_id
namespace
stream_id
relation_revision
authority_commit_id
source_type / source_id
relation_type
target_type / target_id
origin
provenance_event_ids
confidence?
status
metadata
created_at
```

最低合同：

- stable `relation_id`，caller 不得自报 revision；create expected 0，revise exact-CAS；
- endpoints、relation type 与 origin 在同一 identity 下不可改写；状态变化另增 object
  revision，不 update/delete 旧行；
- code-owned endpoint registry 至少区分 `RAW_EVENT`、`FACT`、`STATE_ITEM`，所有 endpoint
  必须在 same-scope transaction snapshot 中存在；同 batch 新 Fact 可作为 endpoint；
- code-owned type registry 必须冻结方向与 endpoint pairing，至少覆盖 `SUPPORTS`、
  `CONTRADICTS`、`SUPERSEDES`、`RETRACTS`、`DERIVED_FROM`、`DEPENDS_ON`、`RESOLVES`；
- 禁止 self-edge；对 Registry 指定的 `SUPERSEDES` / `DEPENDS_ON` 图做 bounded cycle
  check；
- Relation 自身 provenance-backed；`model_inferred` confidence 的存在/范围规则必须
  精确固定，不能以 confidence 取代 verification；
- cross-scope/cross-namespace endpoint 与 promotion 在 04B 一律拒绝；未来 Promotion 必须
  新建 authority object + `DERIVED_FROM`，不在此工单隐式实现；
- exact retry 返回原 batch result；任何 normalized Fact/Relation/policy/expected revision
  substitution stable CONFLICT。

若上述最低枚举不足以唯一实现，先更新 architecture/本 WO，不得在 source 中留下隐式
policy。

---

# 10. Persistence / Transaction / Read Contract

新增 additive、版本化 schema 至少包含：

```text
canonical Fact revision rows
canonical Relation revision rows
Fact/Relation domain commit rows
transactional schema completion marker
exact immutable/update/delete guards
```

硬合同：

- 一个 batch 的 Fact rows、Relation rows、domain marker/result 与 policy/vector binding 在
  同一 `BEGIN IMMEDIATE` transaction 中提交；任一失败全部 rollback；
- batch 前后 WO-03A vector 五项必须完全不变；observed vector 必须与 request/result 绑定，
  且所有 Raw/State endpoint/provenance 不得位于其 high-water 之后；
- marker 必须绑定 exact normalized request bytes/fingerprint、policy、previous/current object
  revisions、完整 result；协调替换 row/request/result/vector 必须 read/replay fail-closed；
- concurrent same-object same-base proposals 至多一个成功；disjoint object batches 可序列化
  连续提交且不能产生 object revision gap；
- migration completion transactionally proven；fresh/legacy concurrent first-open、reopen、
  partial collision、forged completion fail-closed；legacy 不 backfill；
- reads 至少提供 scoped current Fact/Relation set、exact object revision 与 exact domain commit；
  scope vector + rows + marker 必须在一个 read snapshot；absent scope 返回 explicit empty set
  与 zero vector，不 materialize row；
- root 只可导出 types、policy constants 和 stable domain error；Store、migration、SQLite、
  internal apply capability 与 generic writer 不得导出或经 Core reflection 取得。

04B 的 durable Fact/Relation 不进入 v0 compile/retrieval/assembly。正式 Working Context 接管
属于 WO-05。

---

# 11. CRASH / CONCURRENCY / REPLAY CASES

至少验证：

1. fresh/legacy concurrent first-open、idempotent reopen、collision rollback；
2. Fact/Relation/marker 同事务，row/marker/deferred COMMIT failure 全 rollback；
3. exact retry稳定，proposal/order/expected/policy/provenance substitution conflict；
4. 两连接同 object base 竞争最多一胜；disjoint object 无 revision gap；
5. scope A/B、authority/shadow、同名 object ID 完全隔离；
6. Raw/Fact/State endpoint 与 provenance 必须 same scope、committed、not-after-vector；
7. epistemic/verification/lifecycle/record 正交 transition 与 reason Relation 不变量；
8. duplicate semantic edge、self-edge、cycle、terminal status rollback；
9. close/reopen 与 current/exact reads 的 bytes/hash/revision/marker 稳定；
10. row/request/result/vector 协调替换 fail-closed；
11. invalid/Cc/non-NFC/cyclic/accessor/exotic/sparse/overflow input 在 mutation 前拒绝；
12. legacy State/Relation、Canonical State、Raw/Recall/telemetry/MCP/evaluation 回归；
13. WO-03A/03B/04A source/schema 与 source/config/artifact allowlist 无漂移。

所有写诊断只在隔离临时数据库执行。

---

# 12. Deliverables

1. `docs/inventory/WO-04B/execution-baseline-manifest.md`
2. `docs/architecture/WO-04B-fact-relation-authority-policy.md`
3. `docs/inventory/WO-04B/fact-relation-schema-transaction-map.md`
4. Core-owned source/export/lifecycle wiring
5. focused policy/migration/crash/concurrency/replay tests
6. `docs/handoffs/WO-04B-fact-relation-authority-policy.md`
7. Independent QA separately writes
   `docs/qa/WO-04B-fact-relation-authority-policy.md`

---

# 13. ACCEPTANCE

- [ ] Execution Baseline fixed before source implementation.
- [ ] Exact Fact/Relation grammar, policy registry, transitions and hash frozen first.
- [ ] Explicit scope；无 session/Host fallback、legacy backfill 或 cross-scope endpoint。
- [ ] Fact 四轴正交；contested/superseded/retracted/archived 语义不混用。
- [ ] Relation typed、versioned、provenance-backed，endpoint/type registry 严格。
- [ ] Object rows + domain marker 原子、append-only；WO-03A vector 完全不变。
- [ ] Exact replay/conflict/concurrency/overflow/migration/tamper fail closed。
- [ ] Provenance/endpoints 只引用同 scope committed canonical authorities。
- [ ] Current/exact reads scoped、durable、single-snapshot、reopen stable。
- [ ] WO-03A/03B/04A frozen source/schema/private boundaries unchanged。
- [ ] No Takeover/Enrichment/Frontier/Compaction/Snapshot/Host/MCP behavior。
- [ ] Existing v0 State/MCP/Raw/Recall/telemetry/evaluation compatible。
- [ ] Focused tests、`npm test`、`npm run build`、`git diff --check` pass。
- [ ] Candidate paths exactly match allowlist；无 network/Host/production DB。
- [ ] Builder handoff exists；Builder 不自批。
- [ ] Independent QA 可从 candidate 单独复现 claims。
