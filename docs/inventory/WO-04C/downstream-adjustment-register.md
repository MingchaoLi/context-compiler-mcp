# WO-04C Downstream Architecture Adjustment Register

Status: OPEN FOR USER SYNC — RECORDED INPUTS ARE NOT YET PROMOTED

WO-04C source baseline:
`c3a184f9c067d529e8f2908080ab72650fb59cbc`

## Purpose and promotion rule

本登记只在 WO-04C source 开始前收集用户明确同步的后续架构调整，并逐项判定其对
WO-04C 的影响。它不是 Architecture Contract、Umbrella Plan 或未来 Child WO 的替代品。

用户确认本轮同步结束后：

1. 先冻结每项的 `WO-04C impact` 与 routing；
2. 若任何项改变 WO-04C source/schema/test/config/official contract，则停止并重新评估
   work order 与 baseline；
3. 若全部为 downstream-only，则保持当前 WO-04C baseline，开始 04C Builder；
4. downstream 输入在独立的后续 docs/work-order authority 步骤中再 promotion 到
   Contract/Umbrella/WO-05+，不得混入 WO-04C source candidate。

---

## DA-01 — Raw Retention 与 Targeted Evidence Recovery 分离

**用户状态：** 已要求记录为后续方案调整。

**登记状态：** RECORDED / DOWNSTREAM CANDIDATE / NOT YET PROMOTED

**WO-04C impact：** NONE — 不改变当前 source/schema/test allowlist 或工期估算。

**Routing：** WO-05 ContextSnapshot、WO-06 Evidence Scope + Ripple、后续
Verification/Host orchestration；不进入 WO-04C。

### Accepted direction

四层必须分开：

```text
Raw Retention / Replay Guarantee
-> Targeted Evidence Recovery
-> immutable EvidenceBundle
-> Working Context / Snapshot Projection
```

任何 Authority 更新都是另一条显式路径：

```text
recovered evidence
-> explicit Proposal
-> owner Validation
-> separate Authority Commit
```

Recovery 不得直接或隐式修改 State、Fact、Relation、Frontier 或 Takeover authority。

### WO-04C preservation requirement

WO-04C 只需继续满足已经冻结的底线：

- Semantic Takeover 成功后不删除或更新 canonical Raw Event；
- Compaction Artifact 是 covered range 的不可变内容绑定，不替代 Raw Ledger；
- Frontier 只改变 Hot Raw projection boundary，不改变历史 Raw 的存在性；
- WO-04C 不实现 Historical Evidence query、Working Context injection、Ripple 或 recovery
  orchestration。

因此 DA-01 不要求重开 Transaction Composition Gate。

### Proposed downstream v1

Recovery 保持低能力、provider-neutral，并冻结为：

```text
explicit closed trigger
-> Level 0 exact provenance fetch
-> if insufficient, at most one bounded historical search
-> optional bounded one-hop Ripple
-> immutable EvidenceBundle
-> Working Context only
```

硬边界：

- `bounded`：固定 max attempts、candidate budget、scope expansions 与 ripple depth；
- `read-only`：Recovery transaction 不写任何 authority；
- `non-authoritative`：命中只是 Evidence，不因相关性得分获得 Authority；
- `snapshot-bound`：请求与结果绑定 explicit scope、`ledger_as_of_revision`、Snapshot/
  Attempt identity、trigger reason、search horizon 与 policy identity；
- `provenance-first`：优先从 State/Fact/Relation/Artifact exact refs 取 Raw；
- `no hidden model`：Core 不调用 provider/extractor/embedding service。

建议的 closed trigger reason：

```text
EXPLICIT_HISTORY_REFERENCE
PROVENANCE_DETAIL_REQUEST
REQUIRED_FIELD_MISSING
VERIFIED_FAILURE
```

Core 只消费显式 trigger，不自行解释模型回答是否失败。`VERIFIED_FAILURE` 后是否再次调用
模型属于后续 Host/Verification orchestration，不属于 Core Recovery authority。

### Retrieval and Ripple constraint

Level 1 默认使用 bounded lexical/BM25；只有 caller 为 query 与全部 candidates 提供同
space、同维、合法 Dense 时才允许可选 Dense leg，否则整体稳定退化为 lexical-only。
禁止远端 embedding、无限 query reformulation、recursive search 或全库无界扩散。

Event Ripple 可优先用于 Recovery 的 Seed/Anchor 后一跳扩展，但本登记不静默改写当前
Contract 中 Normal path 的 bounded 1-hop Ripple。若未来要把 Ripple 严格收窄为
Recovery-only，必须单独修改上层 Architecture Contract，而不能由 WO-06 实现暗改。

### Wording correction

没有自动 Recovery 时，历史 Raw 不是“永久不可见”；准确含义是：

> 已越过 Frontier 的 Raw 不会自动重新进入 Working Context，但仍保留为审计、exact
> replay 与未来显式 Evidence query 的事实源。

---

## DA-02 — State Proposal / Validation / Reduction / Authority Commit 骨架

**用户状态：** 已接受评估后的修正版并要求纳入后续计划。

**登记状态：** RECORDED / DOWNSTREAM CANDIDATE / NOT YET PROMOTED

**WO-04C impact：** NONE — Takeover v1 继续只读 exact State authority，不接收 State
proposal、不获得 State apply seam、不推进 State axis。

**Routing：** 已接受的 Canonical State Authority correctness contract；未来仅在新的
Extractor、State policy/version 或 Host integration work order 中引用，不进入 WO-04C。

### Accepted direction

逻辑职责冻结为：

```text
optional Proposal Producer / Extractor
-> untrusted StateDeltaProposal
-> strict Parser + Normalizer
-> transaction-bound Authority Validator
-> deterministic pure Reducer
-> Canonical State Authority Commit
-> revision substrate allocates State revision + immutable marker
```

四项 correctness skeleton 保留：

- Proposal producer 不拥有 Authority；
- Validator 只验证 deterministic contract，不充当第二个模型或 world-truth judge；
- explicit proposal/delta 是 audit、QA、replay 输入，不用整份模型生成 State 替代；
- Reducer 只做确定性状态转换，不调用模型、embedding、retrieval、dependency guess 或
  scope inference。

逻辑职责分离不要求拆成多个服务；Parser、Validator 与 Reducer 可以在同一 Core domain
module 内保持小而明确。

### Exact corrections to the proposed wording

Delta/Proposal 是 Extractor 的不可信输出，因此顺序不是
`Extractor -> Validator -> Delta`，而是：

```text
Extractor/Detector -> untrusted Proposal -> validate/normalize -> reduce
```

Reducer 也不是 durable single writer。真正的唯一写入 Authority 是 Canonical State owner
与 revision substrate transaction；Reducer 只计算 previous + normalized proposal 的唯一
next State。

### Validation split

事务外只允许处理不依赖 Authority snapshot 的规则：

```text
plain-data shape
exact keys
NFC / Cc / bounds
canonical ordering
supported policy shape
```

事务内必须重新验证：

```text
expected State revision
current item identity/kind/status
legal lifecycle transition
same-scope committed Raw provenance
policy hash
no-delete / monotonic provenance
non-empty and non-no-op result
```

任何失败均不得部分写 State row、revision、marker 或其他 Authority。

### Vocabulary decision

不因本次调整新增 `UPSERT / SUPERSEDE / INVALIDATE / RESOLVE / KEEP` 操作语言。当前
accepted Canonical State v1 继续使用：

```text
proposal.upsert_items[]
+ closed kind/status transition table
+ no delete
```

未被 proposal 提及的 item 自动保持不变；`KEEP` 不是 operation。现有 State kind/status/
policy hash 已由 WO-04A 冻结。若未来要删除 `REJECTED_ALTERNATIVE`、减少 lifecycle 或改变
transition vocabulary，必须建立新的 Canonical State policy/schema version 与独立迁移/
promotion gate，不能原地改写 v1。

### Idempotency and replay

幂等身份属于 scoped `state_commit_id`：

- same identity + exact normalized descriptor 返回原 immutable result；
- same identity + substitution 稳定 conflict；
- new identity 重复产生 byte-identical State 是 no-op/conflict，不消费 revision。

完整 replay authority 不只是 Delta 序列，还必须绑定 policy hash、expected/previous/current
revision、proposal bytes、same-scope Raw provenance、complete State/hash 与 substrate marker。

### Extractor boundary

Extractor/Detector 是 optional、provider-neutral、untrusted Proposal Producer，可以来自规则、
显式调用或外部 transport；Canonical State commit 不依赖某个模型/provider。当前已记录的
Extractor correctness 失败不授权扩大模型、prompt 或 transport 投入。未来若重开 Extractor
实验，必须单独证明 proposal correctness，不能以 deterministic reducer conformance 代替。

---

## DA-03 — Dormant Placement / Snapshot Reactivation 降级

**用户状态：** 已接受评估后的修正版并要求纳入后续计划。

**登记状态：** RECORDED / DOWNSTREAM CANDIDATE / NOT YET PROMOTED

**WO-04C impact：** NONE — 不改变 Takeover/Enrichment/Frontier/Artifact grammar、schema、
transaction 或测试范围。

**Routing：** WO-05 ContextSnapshot placement/projection/replay；WO-06 Evidence Recovery/
Ripple 导致的单 Snapshot re-inclusion。当前 frozen v0 operational-context 与 Canonical
State v1 均保持不变。

### Accepted separation

Truth/Authority 与 Context placement 是两条正交维度：

```text
Committed State Authority
  kind-specific lifecycle status

Snapshot-time Placement Decision
  HOT / COLD

Working Context Projection
  selected exact State refs + inclusion reasons
```

`DORMANT` 不得成为 Canonical State lifecycle status。Canonical State 继续使用既有
kind-specific closed statuses；本调整不引入通用 `INVALID`、`DORMANT`、`REACTIVATED`
状态，也不改变 State policy hash。

### Placement is derived, not State truth

未来 placement 默认作为一次 Snapshot construction 的确定性派生结果，不写入 Canonical
State item，不推进 State revision，也不修改 source refs、Fact/Relation 或其他 Authority。

WO-05 的候选 Snapshot contract 应记录足够 replay 的 plain data：

```text
selected_state_refs
excluded_or_cold_state_refs
placement_policy_hash
inclusion_reason per selected/cold override
ledger/state/fact/relation revisions as of the Snapshot
```

是否需要独立持久 PlacementRevision 不在本调整中授权。只有后续证据证明跨 Snapshot 的
durable placement 本身是 correctness requirement，才可另开 bounded work order；不得借
HOT/COLD 绕过 State Authority。

### Reactivation is one-Snapshot inclusion

`Reactivation` 的准确语义是：

> 一个仍具有当前 Authority、但按默认 placement 未选中的 State item，被本次 Snapshot
> 明确重新纳入 Working Context。

建议的 closed inclusion reason：

```text
EXPLICIT_REF
REQUIRED_CONTEXT
DEPENDENCY_CLOSURE
RECOVERY_HIT
```

该结果只属于当前 Snapshot，不构成持久 `COLD -> HOT` transition，不自动影响下一次
Snapshot，更不表示历史事实重新获得 Authority。Retrieval/Recovery hit 可以触发当次
re-inclusion，但不得修改 placement 或 lifecycle authority。

### Core routing boundary

Core 不得猜测 Host `Project ID`、当前聊天主题或用户意图来切换 placement。候选路由只能
来自显式 Core contract，例如：

```text
namespace / stream_id
explicit anchor or authority ref
required State item IDs
dependency closure
Host-supplied opaque routing data allowed by a future Snapshot contract
```

任何未来 Host/project identity 仍由 Host 解释；Core 只保存/验证允许的 opaque identity 或
显式 scope。

### Minimal activation policy

未来 canonical Snapshot 路径的初始策略应为：

```text
all eligible current Authority = HOT / included by default
```

只有真实 dogfood 证明 Active State 体积持续造成 Context pressure，才允许另开有界策略
启用 COLD placement。该策略必须有数据门、严格预算、确定性 policy identity、Snapshot
replay 和 fail-open：缺少完整 evidence/telemetry 时保留有效 State，不得把“未观测到命中”
解释为“真实不需要”。

不预先实现 semantic auto-reactivation、time decay、inactivity score、embedding similarity
promotion 或复杂冷热调度。

### Frozen v0 compatibility

当前 accepted/frozen v0 已实现 bounded BM25/caller-Dense、telemetry-qualified dormant
placement 与 compile-local reactivation。本调整不删除、不关闭、不调参、不重写该路径。
“Broad Retrieval 后移”只作为未来 WO-05/06 canonical path 的 downstream candidate，不能
冒充当前 v0 行为已变化。

如果未来决定替换 frozen v0 placement，必须以独立 compatibility/promotion work order、
回放证据与 Independent QA 完成，不能由 WO-05/06 顺便改写。

---

## DA-04 — Future Canonical Broad Retrieval Default-off + Ablation Gate

**用户状态：** 已接受修正版方向，并要求把最小裁决实验记录为后续测试方向；测试发现
问题时按证据调整。

**登记状态：** RECORDED / ACCEPTED DIRECTION / PENDING FUTURE EVIDENCE GATE / NOT YET
PROMOTED

**WO-04C impact：** NONE — 不修改当前 source/schema/test allowlist、Composition Gate 或
工期估算。

**Routing：** WO-05 optional EvidenceBundle input；WO-06 opt-in Normal Retrieval、Targeted
Recovery 与独立 ablation work order。当前 frozen v0 保留为 compatibility/shadow comparator。

### Accepted future default

Future canonical Snapshot 的默认主路径候选为：

```text
Current Input
+ Recent Raw
+ Committed State
+ mechanically required dependency closure
-> ContextSnapshot
```

没有显式触发时不默认执行 broad historical retrieval，也不把 Historical Evidence 强制注入
每个 Snapshot。以下任一 closed trigger 才允许进入 bounded Evidence Recovery：

```text
EXPLICIT_HISTORY_REFERENCE
PROVENANCE_DETAIL_REQUEST
REQUIRED_FIELD_MISSING
HIGH_RISK_REQUIRED_EVIDENCE
VERIFIED_FAILURE
```

对于可能 dispatch Tool side effect 的 high-risk operation，不允许先执行/失败后再恢复；
required evidence 缺失必须在 dispatch 前触发 Recovery 或阻止执行。

### What remains available

本调整不删除 Evidence/Retrieval architecture。Normal broad retrieval 保留为：

```text
explicit opt-in
shadow/dogfood comparator
diagnostic evidence request
```

Targeted Recovery、exact provenance fetch 与 Raw Retention 必须保留。当前 accepted/frozen
v0 bounded BM25/caller-Dense、dormant telemetry 与 recovery behavior 不关闭、不调参、
不重写；DG-01 仅挑战 future default-on 的必要性。

### Evidence interpretation boundary

DG-01 是一个 BM25-only、单复合请求的 observation：它记录 broad miss/pollution、部分有用
evidence、Targeted Recovery success 与 token cost，但没有提供 caller Dense，因此没有评估
Hybrid semantic leg，也不支持“一般情况下 broad 无价值”的结论。

当前可接受的结论仅为：

> broad historical injection 的净收益尚未证明，因此 future canonical default-on 需要先过
> evidence gate。

### Future ablation test direction

未来必须在独立、预注册、固定 input 的测试工单中比较同一个 Snapshot/query world：

```text
M0 = Recent Raw + Committed State + required dependency closure
M1 = M0 + bounded broad BM25
M2 = M0 + bounded broad hybrid
     only when frozen caller-supplied query/candidate Dense fully qualifies
```

如果没有同 space、同维、query/candidate 全覆盖且非零 norm 的 caller Dense，M2 必须报告
`not_evaluable`，不能用 BM25-only 结果代替 Hybrid 结论。

测试输入至少分开预注册：

```text
single-intent distant detail
multi-intent / query-dilution
explicit historical reference
ambiguous reference
superseded/rejected historical pollution
required evidence before high-risk action
Recent Raw + State already sufficient negative control
```

所有条件共享 exact scope、ledger/state/fact/relation revisions、Recent Raw boundary、query、
candidate world、policy/budget 与 Gold evidence requirements。禁止按结果调权重、拆 query、
换案例、扩大 Top-K 或加入 Ripple；这些只能由后续独立实验处理。

### Metrics to freeze before the run

至少记录：

```text
broad_only_required_evidence_gain
required_evidence_miss
irrelevant_evidence_count / tokens
superseded_or_forbidden_evidence_injection
incremental_context_tokens over M0
recovery_required_rate
bounded_recovery_success_rate
recovery additional tokens / latency / attempts
first-attempt insufficiency
```

第一阶段优先做 deterministic EvidenceBundle/ref-level ablation，不调用远端模型，不用模型
自评。若要比较最终回答 correctness，必须另开固定 provider/model/prompt/fresh-session 与
盲化评分合同，不能混入 Evidence eligibility test。

### Decision rule ownership

Promotion work order 必须在查看新结果前预注册 decision threshold 和 fallback：

- broad-only 必要证据增益不足且污染/成本明显：保持 future default-off；
- 某类预注册场景有稳定、不可由 bounded Recovery 接受地替代的 broad-only 增益：只为该
  显式场景建立 risk-gated/opt-in policy；
- default-off 导致 high-risk required evidence 漏检：优先加强 pre-dispatch deterministic
  trigger/Recovery，不直接恢复全请求 broad default-on；
- 数据不足或 Dense 不可评价：保持 candidate 状态，不宣称 Hybrid 胜负。

任何测试驱动调整只修改未来 WO-05/06 policy proposal；不得回写 WO-04C candidate 或静默
改动 frozen v0。
