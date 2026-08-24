# WO-04C — Semantic Takeover / Enrichment + Frontier + Compaction Artifact
## Long-term Agent / Context Compiler

**状态：** IN PROGRESS — EXECUTION BASELINE + PRE-SOURCE COMPOSITION GATE FROZEN；
SOURCE NOT STARTED<br>
**类型：** Core semantic commit composition + Frontier authority<br>
**依赖：** WO-03A fixed Builder `c93072dc5e4b5c89464b003e716bbb688b072b89`
+ re-QA `f02c5e12ee0931d4a23a999fa2dc2c0dbb977940`；WO-03B Builder
`24b7ba6971be2d8dc761368ecb66722ff053f4ea` + QA
`92e72eb785b2670068597376bccfd1136e3c6952`；WO-04A fixed Builder
`98e02ef898587b013ad588cf7ab2f182afa276e3` + re-QA
`74d39636e112054f7a4ea2b9a2e1be0b3728cdd7`；WO-04B second fixed Builder
`8758f68bf4c6b604ae37fad13d15ca7e98c08bfc` + re-QA
`0236d88e7f6e7b04ca347bc0bdddbdbfa7582dc1`<br>
**目标：** 只在已接受的显式 scope Raw/State/Fact/Relation authority 上建立
`SemanticTakeoverCommit`、`SemanticEnrichmentCommit`、连续 Frontier double-CAS 与
immutable Compaction Artifact；不实现 Snapshot、Working Context、Host 或 MCP 行为。

---

# 1. Bounded Result

本工单只交付一个组合 authority 结果：

```text
committed Raw range + validated canonical authority references/proposals
→ SemanticTakeoverCommit
  + takeover_commit_revision +1
  + raw_frontier_revision +1
  + frontier_position advances to the contiguous covered end
  + immutable Compaction Artifact identity

non-contiguous / historical valid semantic work
→ separate SemanticEnrichmentCommit
  + canonical object revisions / provenance
  + never advances Frontier or takeover revision
```

Takeover 只能覆盖从 current `frontier_position + 1` 开始的连续安全前缀。若 covered
range 中任一必需 proposal、authority ref、coverage disposition 或 artifact binding 失败，
整笔 Takeover 回滚且 Frontier 不动。可保留的合法子结果必须另建 Enrichment Commit，
不得用“部分成功”冒充整段已接管。

WO-05 继续等待本工单通过 Independent QA；04C 单独通过也不自动开始 Snapshot 或
Working Context。

---

# 2. Execution Baseline Gate

实现前必须单独新增并提交：

```text
docs/inventory/WO-04C/execution-baseline-manifest.md
```

Gate 已由 standalone commit `6b77ed06b250176fd9cff16b35ab1c3d4701c9a2`
冻结；固定 `source_baseline_HEAD` 为
`c3a184f9c067d529e8f2908080ab72650fb59cbc`。该 baseline commit 只新增 manifest，
没有 source/schema/test/config 漂移。

至少固定 repository/branch/source baseline/planning authority/parent/clean status/
submodules/config hashes、WO-03A/03B/04A/04B accepted candidate + QA、实现时间。

硬 Gate：

- `main`、HEAD、parent 与 clean policy 精确记录；
- 四个 dependency candidate/QA 均在祖先链；
- Contract/Umbrella/本 WO 已进入 repository authority；
- PROJECT_STATE/ROADMAP 唯一下一工单均为 WO-04C；
- Builder 期间任何未记录 source/schema/test/config/official artifact 漂移使 baseline
  失效；
- baseline commit 不得同时包含 source/schema 实现。

---

# 3. Transaction Composition Gate

在修改 source 前，architecture + transaction map 必须用机械 call-chain 证明以下问题，
不能在实现中隐式决定：

1. frozen `TAKEOVER_FRONTIER` capability 一次只推进 Frontier revision/position 与
   Takeover revision，不推进 State axis；
2. WO-04A 与 WO-04B 当前 authority writer 各自拥有 transaction lifecycle；
3. 04C 的 Takeover 内容究竟是：
   - 引用同 snapshot 中已提交且完整验证的 State/Fact/Relation revisions；或
   - 在 Takeover transaction 中产生新的 canonical revisions；
4. 对选择的语义，如何满足 Contract 的 required-proposal fail-closed、完整 coverage、
   exact replay 与 legal-subresult-only-via-Enrichment。

若 frozen WO-03A transaction capability 无法满足所冻结的组合语义：

> 停止 WO-04C source 实现，记录 blocker，并另提 bounded substrate extension proposal。

不得手工更新 `cc_revision_streams`、嵌套 transaction、跨连接先写后补 marker、复制
04A/04B writer，或私自修改 `src/revision-substrate.ts` 绕过 Gate。

Gate 产物必须在 pre-source architecture commit 中冻结：exact Takeover/Enrichment
grammar、authority reference/proposal model、coverage proof、no-op/partial semantics、
policy hash 与完整 transaction order。

Gate 选择已经冻结在：

```text
docs/architecture/WO-04C-semantic-takeover-enrichment-frontier-compaction.md
docs/inventory/WO-04C/transaction-composition-schema-map.md
```

选择为“一个 Core-private 组合事务协调器 + 多个领域 Authority Owner”：

- `src/authority-transaction-coordinator.ts` 是唯一跨领域组合入口；
- Takeover 在 frozen `commitTakeoverFrontierInsideCore` 已开启的单连接 transaction callback
  中统一 Raw/State/Fact/Relation/Artifact 读写；
- State v1 只引用同 snapshot 已提交且完整验证的 exact authority，State axis 不前进，
  `previous_state_revision == new_state_revision`；
- Fact/Relation 可通过 owner 的 Core-private same-handle apply/read seam 在同事务提交；
- Enrichment 由 coordinator 的单连接 axis-neutral transaction 提交，绝不调用
  Frontier/Takeover primitive；
- schema、policy、reducer、object revision 仍归各领域 owner，coordinator 不是 generic writer；
- 若功能要求同一 Takeover 新建 State revision，则当前 substrate 不足，必须另开 bounded
  substrate extension，不得在 04C 隐式实现。

---

# 4. DEPENDENCIES

- Contract v3.1.1 §4.6/4.7、§7 与关键不变量；
- Umbrella v3.1.1 WO-04 registry、dependency graph、Shared Change-Surface Rule；
- WO-03A frozen explicit scope/five-axis vector/double-CAS/takeover identity/common marker；
- WO-03B accepted canonical Raw Event/Ledger high-water/Hot Raw rebuild；
- WO-04A accepted Canonical State proposal/revision/marker authority；
- WO-04B accepted Fact/Relation object/domain revisions、typed endpoint policy 与完整 State
  authority-chain qualification；
- WO-01/02 inventory 与 Core/Host/private authority boundary；
- v0 Raw/State/Recall/compile/MCP/evaluation compatibility。

---

# 5. CAN READ

按最小 call-chain：

- `src/revision-substrate.ts`、`src/ledger-hot-raw.ts`（frozen dependency，只读）；
- `src/canonical-state.ts`、`src/canonical-fact-relation.ts`；
- `src/core.ts`、`src/index.ts`、`src/sqlite-initialization.ts`；
- 以上边界的直接测试与 package/TypeScript config；
- routed WO-01/02/03A/03B/04A/04B architecture、inventory、handoff、QA。

禁止读取同级 Host 仓库。未知 Host identity/routing 保持 Unknown。

---

# 6. CAN CHANGE

预期 allowlist：

```text
src/authority-transaction-coordinator.ts
src/semantic-takeover.ts
src/canonical-state.ts                 # 仅 Composition Gate 冻结的 Core-private seam
src/canonical-fact-relation.ts         # 仅 Composition Gate 冻结的 Core-private seam
src/core.ts
src/index.ts
test/authority-transaction-coordinator.test.ts
test/semantic-takeover.test.ts
test/canonical-state.test.ts           # 仅 seam 回归必要时
test/canonical-fact-relation.test.ts    # 仅 seam 回归必要时
test/core-boundary.test.ts
docs/architecture/WO-04C-semantic-takeover-enrichment-frontier-compaction.md
docs/inventory/WO-04C/**
docs/handoffs/WO-04C-semantic-takeover-enrichment-frontier-compaction.md
```

以上即 Composition Gate 收窄后的 exact maximum allowlist；Builder 可以少改但不得新增
source/test path。04A/04B 文件若改变，只能是保持现有 public/domain behavior 的
Core-private transaction/read adapter；不得复制第二 writer、改变现有 policy/schema/hash
或从 package root 导出。

---

# 7. MUST NOT CHANGE

- `src/revision-substrate.ts` 的 allocator、stream schema、operation、CAS、marker、private
  capability 或 replay contract；
- `src/ledger-hot-raw.ts` 的 Raw append/high-water/rebuild、Event identity/schema；
- accepted WO-04A State grammar/policy/hash/revision/read behavior；
- accepted WO-04B Fact/Relation grammar/policy hash、four-axis semantics、Relation Registry、
  authority-chain validation 与 object/domain revision behavior；
- legacy Raw/State/Relation/Recall/Experience/telemetry/evaluation schema或行为；
- MCP 九工具数量、名称、顺序、schema、结果、错误或 Host adapter；
- Snapshot Manifest、Working Context assembly、Attempt/Action/Verification/Delivery、
  Evidence Ripple、Promotion 或 shadow→authority promotion；
- detector/extractor/provider/network/credential/UI/background scheduler；
- fixed recent-N/BM25/Dense/dormancy/retrieval tuning、official artifacts、package/dependency。

Enrichment 绝不能调用 Frontier/Takeover mutation primitive。Takeover 成功后也不得删除
Raw Event；Hot Raw 只由 Ledger + committed Frontier 重新投影。

禁止网络、远端模型、生产数据库与 destructive command。

---

# 8. Semantic Takeover Contract

Pre-source architecture 至少冻结以下 closed input：

```text
scope.namespace / scope.stream_id
takeover_commit_id
ledger_base_revision
covered_raw_range.start / covered_raw_range.end
expected_frontier_revision
expected_frontier_position
authority reference/proposal manifest
coverage dispositions for every Raw Event in range
compaction artifact input / expected hash
policy_hash
provenance_event_ids
```

硬合同：

- start 必须等于 transaction snapshot 中 `frontier_position + 1`；end 必须大于等于
  start 且不超过同 snapshot `ledger_revision` / normalized `ledger_base_revision`；
- range 内每个 canonical Raw Event 必须同 scope、连续、存在且恰好有一个冻结 grammar
  允许的 coverage disposition；不能按 session、turn count 或 recent-N 代替 Ledger range；
- caller 不得自报 new frontier/takeover/state/object revision、marker、timestamp 或 hash；
- CAS 同时校验 expected frontier revision 与 position；成功只允许 frozen
  `TAKEOVER_FRONTIER` transition：Frontier revision `+1`、Takeover revision `+1`、position
  设为 covered end；
- State/Fact/Relation authority 必须在同 snapshot 通过 accepted owner 的完整 read/apply
  contract；exact revision maps 和 complete result 绑定到 Takeover marker；
- State v1 只允许 exact authority ref，不接受 State proposal；callback previous/current 的
  State axis 必须相等。零 State 只允许空 ref，正 State 必须完整验证 `1..observed` chain；
- Fact/Relation proposal 可选；若存在，必须通过 owner same-handle seam 原子生成 object/
  domain revisions。没有新 proposal 的 Takeover仍必须有完整 coverage + Artifact；
- required proposal/ref/coverage/artifact 任一失败，marker、artifact、object rows 与全部
  primary axes 均回滚；不得推进部分 range；
- exact normalized retry 返回原 result；range/order/CAS/policy/provenance/authority/artifact
  substitution stable conflict；
- two concurrent same-base Takeovers 至多一个成功；失败者重新读取 Hot Raw/Frontier 后
  才能构造新请求。

---

# 9. Semantic Enrichment Contract

Enrichment 用于非连续旧 Event、后台 Fact/Relation 补充、Ripple 后关系增强或历史
metadata enrichment。Pre-source grammar 至少显式包含 scope、stable
`enrichment_commit_id`、source Event/range refs、authority manifest、policy、provenance 与
完整 result identity。

- 可引用非连续、很老但 same-scope committed canonical Raw Event；
- 必须使用与 Takeover 相同的 accepted State/Fact/Relation validators；
- v1 必须产生至少一个新的 Fact/Relation object revision；reference-only/no-change
  Enrichment 非法；
- 只产生 architecture 冻结的 canonical object/domain rows和自己的 append-only marker；
- 不得写 `raw_frontier_revision`、`frontier_position`、`takeover_commit_revision`；
- exact retry/替换/conflict、rollback、concurrency、migration/read 均需稳定；
- Takeover 的合法子结果若保留，必须以独立 Enrichment identity 提交，不能复用失败的
  Takeover identity 或声称覆盖整段。

---

# 10. Compaction Artifact Contract

新增 immutable Artifact 至少绑定：

```text
artifact_id
artifact_hash
namespace
stream_id
covered_raw_range
generator_version
policy_hash
provenance_event_ids
created_at
```

- artifact hash 算法、canonical bytes、body/manifest persistence 方式必须 pre-source 冻结；
- Takeover marker/result 必须绑定 artifact identity/hash 与 exact covered range；
- Artifact row 与成功 Takeover 在同一 transaction；失败/COMMIT failure 不留 orphaned
  authority row；
- replacement、cross-scope reuse、range/hash/generator/policy substitution fail-closed；
- Artifact 不是 WO-05 Snapshot Manifest，不含 Host manifest、Attempt 或 Working Context。

---

# 11. Persistence / Read / Boundary Contract

新增 additive、versioned schema 至少包含 Takeover/Enrichment domain rows、Compaction
Artifact rows、completion marker 与 exact immutable/update/delete guards。Migration 必须
transactionally completed，fresh/legacy concurrent first-open/reopen 安全，partial
collision/forged completion fail-closed，legacy 不 backfill。

至少提供 Core library-only reads：

```text
read exact SemanticTakeoverCommit
read exact SemanticEnrichmentCommit
read exact Compaction Artifact
read current scope Frontier/Takeover authority with bound commit/artifact
```

每个 read 必须在一个 snapshot 内绑定 vector、domain row、substrate marker、canonical
object refs、coverage 与 artifact。Absent scope 明确返回 zero/empty，不 materialize row。

Store/migration/SQLite/transaction adapter/generic writer 不得从 root 导出，也不能通过
Core reflection 取得。MCP 不新增 command。

---

# 12. CRASH / CONCURRENCY / REPLAY CASES

至少验证：

1. fresh/legacy concurrent first-open、reopen、partial collision、forged completion；
2. range hole、wrong start/end、after-ledger、cross-scope/missing Raw、coverage omission/
   duplicate 在 mutation 前拒绝；
3. stale frontier revision、stale position、same-base race、disjoint scope isolation；
4. required State/Fact/Relation/coverage/artifact 任一失败整笔 rollback，Frontier 不动；
5. marker/artifact/object insert 与真实 SQLite COMMIT failure 全 rollback、不占 revision；
6. exact retry稳定，任一 normalized field/order/policy/provenance/artifact substitution 冲突；
7. Enrichment 支持非连续历史但五个 primary axes完全不变；
8. Takeover 成功后 Hot Raw 由 Ledger + committed Frontier 重建且不丢 after-range Event；
9. close/reopen 与 current/exact reads 的 vector/range/object/artifact/marker bytes稳定；
10. authority/shadow scope 隔离，无 cross-namespace endpoint 或 implicit promotion；
11. invalid/Cc/non-NFC/cyclic/accessor/exotic/sparse/overflow input 零 mutation；
12. WO-03A/03B/04A/04B、legacy v0、MCP exact-nine、evaluation/package/artifact 回归。

所有写诊断只在隔离临时数据库执行。

---

# 13. Deliverables

1. `docs/inventory/WO-04C/execution-baseline-manifest.md`
2. `docs/architecture/WO-04C-semantic-takeover-enrichment-frontier-compaction.md`
3. `docs/inventory/WO-04C/transaction-composition-schema-map.md`
4. Core-owned implementation/private adapters/lifecycle wiring
5. focused policy/coverage/crash/concurrency/replay tests
6. `docs/handoffs/WO-04C-semantic-takeover-enrichment-frontier-compaction.md`
7. Independent QA separately writes
   `docs/qa/WO-04C-semantic-takeover-enrichment-frontier-compaction.md`

---

# 14. ACCEPTANCE

- [x] Execution Baseline fixed in a standalone pre-source commit.
- [x] Transaction Composition Gate 机械证明并冻结；State v1 选择 reference-only，当前
  substrate 足够；atomic new State 是明确 stop condition。
- [x] Exact Takeover/Enrichment/coverage/artifact grammar + policy hash frozen first.
- [x] Explicit scope；无 session/Host fallback、legacy backfill 或 cross-scope reuse.
- [x] Takeover range 从 current Frontier 直接后继开始且连续、完整、有界。
- [x] Frontier revision/position double-CAS 与 Takeover revision 原子推进且无 hole.
- [x] Required proposal/ref/coverage/artifact failure 整笔 rollback、Frontier 不动.
- [x] Enrichment 可非连续但绝不推进 Frontier/Takeover 或其他 primary axis.
- [x] Canonical State/Fact/Relation authority 使用 accepted owner contract，无第二 writer.
- [x] Compaction Artifact immutable、content-bound、range/policy/provenance-bound.
- [x] Exact replay/conflict/concurrency/migration/tamper/read/reopen fail closed.
- [x] Hot Raw after successful Takeover 可由 Ledger + committed Frontier 无丢失重建.
- [x] WO-03A/03B/04A/04B frozen public/domain behavior保持；substrate source不变.
- [x] No Snapshot/Working Context/Host/provider/network/MCP/new retrieval behavior.
- [x] Focused tests、`npm test`、`npm run build`、`git diff --check` pass.
- [x] Candidate paths exact allowlist；无 production DB、network 或 sibling Host access.
- [x] Builder handoff exists；Builder 不自批；Independent QA 可独立复现。

---

# 15. Builder / Independent QA Separation

Builder 只实现、验证并写 handoff，不得写 PASS。Independent QA 在固定 candidate 上只读
审计并单独写 QA 文件/commit。失败必须回到同一 append-only implementation chain 修复；
不得重写已提交历史或边 QA 边实现。

本工单已在 Builder candidate `6642e4c04f4b7a5ff684c0399e4f83be075724f5`
完成，并由 Independent QA commit `d33f52281e2af857c16a79768c7d3fcde816da42`
接受。状态：**ACCEPTED / COMPLETE**。该接受不授权 Host 集成；后续 WO-05 必须另立
有界工单、Execution Baseline、Builder handoff 与 Independent QA。
