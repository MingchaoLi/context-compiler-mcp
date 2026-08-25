# WO-05 — ContextSnapshot Contract
## Long-term Agent / Context Compiler

**状态：** INDEPENDENT QA RETURNED — SOURCE FIX NOT STARTED；BLOCKED ON BOUNDED
FACT/RELATION AS-OF PROJECTION PROOF DECISION<br>
**类型：** Core deterministic projection + immutable execution snapshot<br>
**依赖：** WO-03B Builder `24b7ba6971be2d8dc761368ecb66722ff053f4ea` + QA
`92e72eb785b2670068597376bccfd1136e3c6952`；WO-04A fixed Builder
`98e02ef898587b013ad588cf7ab2f182afa276e3` + re-QA
`74d39636e112054f7a4ea2b9a2e1be0b3728cdd7`；WO-04B second fixed Builder
`8758f68bf4c6b604ae37fad13d15ca7e98c08bfc` + re-QA
`0236d88e7f6e7b04ca347bc0bdddbdbfa7582dc1`；WO-04C Builder
`6642e4c04f4b7a5ff684c0399e4f83be075724f5` + QA
`d33f52281e2af857c16a79768c7d3fcde816da42`<br>
**目标：** 在已接受的显式 scope Ledger/Frontier/State/Fact/Relation/Takeover authority
之上，交付确定性的 Current Authority + Hot Raw projection、固定优先级 Context Assembly、
不可变 Snapshot Manifest 与原子 `AttemptStarted` 绑定；不实现 Host、Evidence Ripple、
Operation/Action lifecycle、Extractor、Retrieval 调参或 MCP 新工具。

> 2026-08-25 source spike 证明 accepted `readCurrentSemanticTakeoverInsideCore` 在 Takeover 后
> 任一合法 Raw advance 时错误要求完整五轴向量全等并返回 `CORRUPT_DATA`。WO-05 source 草稿
> 曾隔离保存；有界 WO-04D candidate `39334f94cb1c5ac37587cc261b261b427d2ba1b6`
> 已由 Independent QA commit `583cefaf12308229b3f3daa24982777bb884922b` 接受。修复不改变
> 写入语义，WO-05 现恢复。

> 2026-08-25 Independent QA 对 Builder candidate
> `c8c37b4beb230d2c37017b9c9d65aefa7e180eaa` 裁决 **FAIL / RETURN TO IMPLEMENTATION**，
> QA report commit 为 `88e8da7`。反例在不修改任何 Fact/Relation owner row 的前提下，
> 协调删除 Manifest/body 中由 `DEPENDS_ON` 闭包选入的 Relation + Fact + path，更新
> Snapshot/Attempt 本地哈希并恢复 exact triggers 后，stored read 仍错误接受。历史读
> 缺少独立于 caller-controlled Manifest selected refs 的完整 Fact/Relation as-of 投影证明。

---

# 1. Bounded Result

本工单只交付一个 Core-owned execution input freeze result：

```text
explicit scope + explicit operation/attempt identity
+ one consistent committed authority world
+ current input + exact required refs + opaque Host/external digests
→ deterministic Current Authority Projection
→ deterministic Frontier-bound Hot Raw Projection
→ priority-bucket / whole-object Context Assembly
→ immutable ContextSnapshot Manifest + content-bound Working Context
→ AttemptStarted atomically bound to the frozen Snapshot
```

Snapshot 必须冻结 exact `ledger_as_of_revision`、State/Frontier/Takeover vector、实际选择与
排除的 Authority/Raw refs、projection/assembler/config identity、Working Context hash、Current
Input、Host opaque digest 与 external content hashes。Freeze 后的新 Event 默认属于下一
Attempt，不能改变已冻结 Snapshot。

本工单不产生 EvidenceBundle，也不实现 WO-06/07；只冻结后续 Evidence/Operation 可消费且
不能绕过的 Snapshot 输入/输出合同。

---

# 2. Execution Baseline Gate

任何 source/schema/test 变更前必须单独新增并提交：

```text
docs/inventory/WO-05/execution-baseline-manifest.md
```

manifest 至少固定 repository/branch/source baseline/planning authority/expected parent/clean
status/submodules、四个 accepted dependency candidate + QA、root/src/test/config fingerprints 与
freeze time。

Gate 已由 standalone commit `18a2ab3dc02657200e5d96eec3bfc9a715c316e6`
冻结；固定 `source_baseline_HEAD` 与 planning authority 为
`0dbff6a8a148f37fcabef7accf7f71d057e1a90f`。该 baseline commit 只新增 manifest，
没有 source/schema/test/config 漂移。

硬 Gate：

- `main`、HEAD、parent 与 clean policy 精确记录；
- WO-03B/04A/04B/04C accepted candidate 与 QA commit 均在祖先链；
- Contract/Umbrella/本 WO 已进入 repository authority；
- PROJECT_STATE/ROADMAP 唯一当前工单均为 WO-05；
- baseline commit 只新增 manifest，不混入 source/schema/test/config；
- Builder 期间任何未记录 source/schema/test/config/dependency/evaluation/official artifact 漂移
  都使 baseline 失效，必须停止或另立显式 baseline。

---

# 3. Pre-source Snapshot Composition Gate

修改 source 前必须用机械 call-chain、schema map 和最小动态探针冻结以下合同：

1. 如何在一个 consistent SQLite world 读取 Ledger high-water、Frontier/Takeover vector、exact
   Canonical State revision 与所需 Fact/Relation authority，且排除并发晚到 Event；
2. Snapshot/Working Context/AttemptStarted 的 owner 与 transaction 生命周期；
3. `AttemptStarted` 如何只承担 immutable freeze receipt，不提前成为 WO-07 的第二个
   Operation/Action writer；
4. retry、ID collision、revision/vector drift、COMMIT failure 与 reopen/replay 如何 fail closed；
5. existing frozen v0 `compile_context` 与新的 canonical Snapshot path 如何物理隔离，且 MCP
   exact-nine/public compatibility 不变；
6. 当前 frozen substrate/owner seam 是否足够。若需要手工更新 revision stream、嵌套事务、
   跨连接先写后补或复制第二 writer，必须停止并提出 bounded substrate extension。

Gate 产物至少为：

```text
docs/architecture/WO-05-context-snapshot-contract.md
docs/inventory/WO-05/snapshot-composition-schema-map.md
```

并在同一个 pre-source architecture commit 中冻结 exact manifest grammar、canonical bytes/hash、
projection/assembly policy descriptor + hash、cost estimator/config identity、closed inclusion reason、
overflow/error contract、transaction order、retry identity 与最大 source/test allowlist。

Gate 选择已冻结在：

```text
docs/architecture/WO-05-context-snapshot-contract.md
docs/inventory/WO-05/snapshot-composition-schema-map.md
```

选择为一个新的 Core-private `context-snapshot` owner：它在自己的单连接 `BEGIN IMMEDIATE`
中调用 Ledger/State/Fact/Relation/Takeover owner 的只读 same-handle seam，确定性投影/组装后
原子写 immutable Snapshot + AttemptStarted receipt。Snapshot axis-neutral，不修改 shared
substrate 或任何 accepted authority table；当前 substrate 足够。existing v0 assembler/
operational context 保持隔离不变。

---

# 4. Projection Contract

## 4.1 Explicit scope first

所有输入必须显式携带 `namespace + stream_id`。Core 不从 session、聊天文本、路径、Host task、
project 名称或语义相似度推断 scope，不做 cross-scope fallback、dedup、merge 或 identity reuse。

## 4.2 Current Authority Projection

Layer 2 是 exact Canonical State revision 上的 pure deterministic view，不新增 table/revision axis/
writer/background refresh。初始 closed policy：

```text
default selected:
  GOAL/ACTIVE
  CONSTRAINT/ACTIVE
  DECISION/ACTIVE
  OPEN_QUESTION/OPEN

default excluded:
  terminal/superseded/deferred/resolved items
  REJECTED_ALTERNATIVE
```

显式 exact required ref 可把默认排除对象纳入一次 Snapshot，但不改变其 Authority/lifecycle。
默认 policy 为所有 eligible current Authority `HOT / included`；本工单不持久化 HOT/COLD，
不实现 semantic reactivation、time decay、inactivity score 或智能 scope/ranking。

## 4.3 Frontier-bound Hot Raw Projection

Eligible Hot Raw 必须从同一 frozen world 机械重建：

```text
frontier_position < raw_event.revision <= ledger_as_of_revision
```

Projection 保留完整 Raw Event boundary 与 exact source refs；不得删除 Ledger Raw、推进 Frontier、
做 semantic importance pruning、LLM message selection 或 fixed recent-N 冒充 canonical Hot Raw。
pre-source Gate 应选择闭合、可重放的最小 structural projection；未经独立实验不得加入复杂
folding、topic-aware window 或 adaptive policy。

## 4.4 Identity and display dedup

Authority identity 始终是 exact scoped item ID。不得用 embedding、LLM、lexical/semantic
similarity 合并 State。若 Gate 保留 exact-render display dedup，只允许相同 scope/kind/status 与
byte-equal normalized rendering，且 Manifest 仍必须保存全部 exact Authority refs；否则 v1
直接不做 display dedup。

---

# 5. Deterministic Assembly / Budget Contract

初始 canonical path 使用固定 buckets，不使用综合 relevance score：

```text
P0 REQUIRED
  Current Input
  active Hard Constraints
  explicit required Authority/Raw refs
  mechanically required dependency closure
  required Evidence slot, only when a future accepted WO-06 supplies it

P1 CANONICAL WORKING SET
  Frontier-bound Hot Raw projection
  eligible Goal / Decision / OpenQuestion

P2 CONDITIONAL SOFT
  exact Artifact projection
  future non-required Evidence/Summary slots (empty in this WO unless already authoritative)

P3 OPTIONAL HISTORICAL
  opt-in broad retrieval
  rejected/superseded history and diagnostics
```

WO-05 不实现 broad retrieval、Summary producer 或 Evidence producer。低 bucket 不得挤掉高
bucket；稳定 key/order 与 whole-object/turn/event trim 必须使 input permutation 得到 byte-stable
输出。不得在对象中间静默截断。

若 P0 或本 Attempt 的 required closure 超过 hard capacity，必须返回显式
`BUDGET_INSUFFICIENT`，不得产生 executable Snapshot/Attempt。Active State 若因真实规模超出
预算，本工单不得用智能 relevance 猜测删除；记录 blocker 后另开 bounded placement/scope
experiment。任何 soft Raw target/default 数值必须由 pre-source policy 明示，不能按 provider/model
名称隐式切换。

---

# 6. Snapshot / Attempt Identity and Immutability

Manifest 最低绑定 Contract v3.1.1 §4.9 的字段，并补充 replay 所需的 exact selected/excluded
refs、inclusion reasons、revision vector 与 policy identities。规则：

- `snapshot_id`、`operation_id`、`attempt_id` 均为显式稳定 identity；Core 不解释 Host 业务语义；
- exact retry 返回原结果；同 ID 不同 normalized request/hash 必须 conflict/fail closed；
- Snapshot Manifest 与 Working Context bytes/hash immutable；正文可以持久化或 content-addressed
  rebuild，但 Gate 必须只选择一种 v1 authority path；
- `AttemptStarted` 不能引用不存在或未冻结 Snapshot；同一 DB 默认单事务提交；
- external content 至少绑定 stable ref + content hash，不能只保存路径；
- `host_manifest_digest` opaque，Core 不解释 provider/tool/execution environment；
- unknown policy/schema/version、missing ref、hash mismatch、revision regression、partial migration、
  tamper、reopen 或 replay mismatch 一律 fail closed；
- Snapshot freeze 后的新 Raw/State/Fact/Relation/Takeover commit 不改变旧 Snapshot。

---

# 7. CAN READ

完成 Execution Baseline 后按最小 call-chain：

- accepted `src/revision-substrate.ts`、`src/ledger-hot-raw.ts`、`src/canonical-state.ts`、
  `src/canonical-fact-relation.ts`、`src/semantic-takeover.ts`（依赖边界优先只读）；
- current Core、SQLite initialization/storage、context assembler/types/index 与直接测试；
- WO-01 inventory，WO-02/03B/04A/04B/04C architecture/handoff/QA；
- Contract v3.1.1 §2.1–2.3、§4.9、§6、§8、§9.3、§10.1–10.2 与不变量 22–25；
- Umbrella v3.1.1 WO-05/dependency graph/Shared Change-Surface Rule；
- downstream adjustment register DA-03/04/06/07/09/10/12/14。

禁止读取同级 Host 仓库。未知 Host identity/routing/dispatch 语义保持 Unknown。

---

# 8. CAN CHANGE

Composition Gate 冻结后的 exact maximum allowlist：

```text
src/context-snapshot.ts
src/ledger-hot-raw.ts                 # 仅 Core-private read seam
src/canonical-state.ts                # 仅 Core-private projection seam
src/canonical-fact-relation.ts        # 仅 Core-private projection seam
src/core.ts
src/index.ts
test/context-snapshot.test.ts
test/core-boundary.test.ts
docs/architecture/WO-05-context-snapshot-contract.md
docs/inventory/WO-05/**
docs/handoffs/WO-05-context-snapshot-contract.md
docs/work-orders/WO-05-context-snapshot-contract.md
docs/PROJECT_STATE.md
docs/ROADMAP.md
```

Builder 可以少改但不得新增 source/test/config path。`src/revision-substrate.ts`、
`src/semantic-takeover.ts`、`src/authority-transaction-coordinator.ts`、`src/assembler.ts`、
`src/operational-context.ts`、MCP、package/config/evaluation 与 official artifacts 均冻结。

---

# 9. PROHIBITED

- 读取或修改同级 Host/UI/Tauri/Harness/Cordis/ACP 仓库；
- Host adapter、provider/model SDK、network、credential、remote model、background scheduler；
- MCP 新工具或 exact-nine 名称/顺序/schema/result/error 变化；
- WO-06 Evidence search/Ripple/retrieval implementation或调参；
- WO-07 Operation/Action lifecycle、dispatch、Interrupt、Verification/Delivery/Outbox；
- Extractor/Detector/Fast Path producer、State/Fact/Relation/Takeover 第二 writer；
- semantic State merge/dedup、scope inference、learned/LLM ranker、PACE、adaptive window；
- persistent HOT/COLD、Dormant lifecycle、semantic reactivation、Rolling Summary producer；
- 修改 frozen v0 behavior、shared substrate semantics、Raw/Authority history或删除 Raw；
- production DB、official artifact、package/dependency/config/evaluation 变化，除非后续 Gate 明确
  证明为本 WO 必需并先更新 baseline/allowlist。

所有可能写 DB/cache/build artifact 的诊断只在隔离临时副本/目录执行。

---

# 10. Required Dynamic Fixtures

至少覆盖：

1. exact scope isolation 与 cross-scope ref rejection；
2. current/terminal/deferred/rejected State projection及显式历史 ref inclusion；
3. Frontier-bound Hot Raw rebuild、cross-session events、完整 Event boundary；
4. Current Input/Hard Constraint/required ref 永不被 optional context 驱逐；
5. whole-object deterministic trim、mandatory overflow 与无 executable Attempt；
6. exact retry、ID collision、request substitution、concurrent same-base Snapshot race；
7. later Event/State/Takeover commit 不进入已冻结 Snapshot；
8. Snapshot + AttemptStarted COMMIT failure 无半提交/孤立 executable Attempt；
9. reopen/exact replay、manifest/body/Raw/State/vector/policy/host/external hash tamper fail closed；
10. permutation 得到 byte-stable refs、Manifest canonical bytes 与 Working Context hash；
11. frozen v0 context behavior、MCP exact-nine、WO-03B/04A/04B/04C public/domain 回归；
12. package-root/Core reflection 不泄露 generic writer、SQLite handle、Host/provider 或 transaction
    capability。

---

# 11. Deliverables

1. `docs/inventory/WO-05/execution-baseline-manifest.md`
2. `docs/architecture/WO-05-context-snapshot-contract.md`
3. `docs/inventory/WO-05/snapshot-composition-schema-map.md`
4. Core-owned implementation/private lifecycle wiring
5. focused projection/budget/transaction/replay/concurrency/tamper tests
6. `docs/handoffs/WO-05-context-snapshot-contract.md`
7. Independent QA separately writes `docs/qa/WO-05-context-snapshot-contract.md`

---

# 12. ACCEPTANCE

- [x] Execution Baseline fixed in a standalone pre-source commit.
- [x] Snapshot Composition Gate mechanically proven and frozen before source.
- [x] Exact manifest/projection/assembly/config grammar + policy hashes frozen first.
- [x] Explicit scope only；无 Host/session/task inference 或 cross-scope fallback.
- [x] One consistent committed authority world；并发 late writes 不进入 frozen Snapshot.
- [ ] Current Authority Projection pure/deterministic；Canonical State v1 不变.
- [x] Hot Raw 从 Ledger + committed Frontier + as-of world 确定性重建并保留 exact refs.
- [x] Priority buckets、whole-object trim、hard invariant 与 explicit overflow fail closed.
- [x] No semantic ranker/dedup/scope inference/retrieval/Summary/placement writer.
- [ ] Snapshot Manifest/Working Context immutable、content-bound、policy/revision/ref-bound.
- [x] AttemptStarted 不先于 Snapshot，transaction/retry/collision/COMMIT failure fail closed.
- [x] Host manifest opaque；external content 使用 stable ref + content hash.
- [ ] Exact replay/concurrency/migration/tamper/read/reopen fail closed.
- [x] WO-03B/04A/04B/04C、frozen v0 与 MCP exact-nine behavior 保持.
- [x] Focused tests、`npm test`、`npm run build`、`git diff --check` pass.
- [x] Candidate paths exact allowlist；无 production DB/network/sibling Host access.
- [x] Builder handoff exists；Builder 不自批；Independent QA 可独立复现。

---

# 13. Builder / Independent QA Separation

Builder 只实现、验证并写 handoff，不得写 PASS。Independent QA 在固定 candidate 上只读审计并
单独写 QA 文件/commit。失败必须回到同一 append-only implementation chain 修复；不得重写已
提交历史或边 QA 边实现。

Builder candidate `c8c37b4beb230d2c37017b9c9d65aefa7e180eaa` 与 QA return commit `88e8da7`
保持 append-only。当前不得继续 source fix；必须先决定是否重开 pre-source Gate，为
Fact/Relation owner 新增一个与 Snapshot 同事务、axis-neutral、immutable 的完整投影 receipt。
仅在新 Gate 证明 owner、schema、transaction、retry/replay 和迁移合同后才可 append-only
修复；不得用另一个同 Manifest 哈希代替独立 owner proof。本状态不授权 Host、
WO-06/07、MCP 或 frozen v0 改写。
