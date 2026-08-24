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

## Preservation and Complexity Gate

本轮调整的目标是减少不必要的项目复杂度与测试维度，但目标是“最小正确闭环”，不是
最少模块、最少代码或最少能力。任何 downstream promotion 必须先区分：

```text
remove duplicated implementation                    allowed with equivalence proof
default-off an unproven operational policy           reversible evidence-gated change
remove an accepted capability or weaken a contract   prohibited without explicit gate
```

每项简化候选必须在 future work order 中同时冻结：

1. 现有能力、authority level 与它防御的具体 counterexample；
2. 哪部分只 default-off，哪部分会物理删除或改变 public/schema/policy behavior；
3. 简化后明确放弃的能力、适用场景与风险；
4. 同一 frozen input world 下的 old-vs-simple ablation；
5. correctness、context cost、runtime cost 与 test-matrix complexity 指标；
6. 失败时恢复旧策略的兼容/shadow/rollback 路径；
7. 是否需要新的 schema/policy version、migration、promotion 与 Independent QA。

复杂度比较至少报告：

```text
number of authority writers / transaction boundaries
number of persisted schemas, status axes and policy branches
number of runtime decision branches and implicit heuristics
number of focused fixtures / adversarial counterexample classes
cross-product dimensions in crash/concurrency/replay tests
incremental Context tokens / latency / model calls
```

LOC、模块数量或单次 happy-path 测试不能单独证明方案更简单。已经 accepted/frozen 的能力
在新候选通过预注册 ablation、回放与 Independent QA 前，只能保留为 compatibility/shadow
路径，不得物理删除或由下层文档静默弱化。

如果简化方案不能保持同等 correctness，必须把 capability loss 明示为用户可接受的产品
trade-off；未获得明确接受时，以现有上层 Contract 为准。

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
+ Frontier-bound Hot Raw mechanical projection
+ Committed State
+ mechanically required dependency closure
-> ContextSnapshot
```

这里的 Hot Raw 必须由 `frontier_position < event <= ledger_as_of_revision` 与确定性 projection
policy 导出，不能退化为固定 recent-N turn/token 窗口。该术语纠偏只约束 future canonical
candidate；当前 frozen v0 的 Recent Raw 行为保持不变。

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
M0 = Frontier-bound Hot Raw projection + Committed State + required dependency closure
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
Hot Raw projection + State already sufficient negative control
```

所有条件共享 exact scope、ledger/state/fact/relation revisions、`frontier_position`、
`ledger_as_of_revision`、Hot Raw projection policy、query、candidate world、policy/budget 与
Gold evidence requirements。禁止按结果调权重、拆 query、换案例、扩大 Top-K 或加入 Ripple；
这些只能由后续独立实验处理。

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

---

## DA-05 — Closure Responsibility Narrowing + Grace Tail Experiment

**用户状态：** 已接受 Preservation Gate；同意未来拿现有方式与简化候选对比，目标是降低
复杂度和测试难度，而不是无证据删除已完善能力。

**登记状态：** RECORDED / PRESERVE EXISTING CONTRACT / EXPERIMENT CANDIDATE ONLY / NOT
YET PROMOTED

**WO-04C impact：** NONE under the selected routing — Grace Tail 只作为 upstream proposal/
compactor scheduling 候选，不进入 WO-04C transaction、Frontier grammar 或 policy hash。

**Routing：** Future State proposal scheduling / compactor policy experiment；Strong Constraint
沿用 accepted Immediate Authority；长期 Open/Closed 使用既有 State lifecycle；若未来形成
Snapshot input 约束，再由独立 WO-05 planning authority 接收。

### Responsibility split

必须分离三种职责：

```text
Semantic lifecycle
  Decision/Goal/OpenQuestion/Constraint 的 kind-specific current status

Commit mode
  immediate_authority / lazy_historical / targeted_on_demand

Proposal eligibility / scheduling
  当前 Raw/segment 是否进入 proposal/compaction candidate
```

当前 frozen v0 的约 15 轮阈值属于 dormant placement telemetry，不是 closure 判断、State
lifecycle 或 Raw Frontier 规则。本调整不得复用该数字冒充 Grace Tail 默认值。

### Capabilities that must be preserved

- 讨论中的方案不能因局部语句被过早提交为 final Decision；
- unresolved OpenQuestion/Goal 不能因年龄或窗口移动而静默消失；
- explicit Strong Constraint 必须通过 `immediate_authority` fast path 及时生效；
- later correction/supersession 必须能产生新的显式 proposal/commit，不能协调覆盖历史；
- Raw provenance、Committed State revision、exact replay 与 Targeted Recovery 保持；
- Validator 只检查 contract/authority，不成长为预测未来对话的智能 Closure Judge。

### Grace Tail candidate

Grace Tail 的候选职责只限于：

> 在普通 lazy/compaction proposal producer 选择输入时，机械保护一个最近 suffix，降低短期
> 限定、否定或自我修正被窗口切开的概率。

它不是 correctness guarantee，也不是 State status、Authority、Frontier 或删除规则。固定
turn/token count 不能成为 Raw Frontier 的唯一边界；Core stream 可跨 session，Ledger 还含
tool/file/external events，因而 future experiment 必须明确所用稳定单位和 projection policy。

Strong Constraint fast path 不受 Grace Tail 阻塞：Constraint 可立即形成独立 State commit，
同时其 Raw Event 继续留在 Hot Raw。长期 Open topic 依靠显式 OpenQuestion/Goal 或继续留在
Hot Raw，而不是不断扩大 Grace Tail。

### Comparison direction

Future pre-registered experiment 在同一 frozen Raw/State world 比较：

```text
C0 = existing semantic proposal eligibility, no mechanical protected suffix
C1 = C0 + bounded Grace Tail used only by proposal scheduling
```

至少固定以下 counterexamples：

```text
initial affirmation followed by immediate negation
joke/self-correction or limiting qualifier across a boundary
"先这样" followed by continued discussion
long-running unresolved OpenQuestion
explicit Strong Constraint requiring immediate effect
clear final Decision where delay is unnecessary
later global revocation beyond the Grace Tail negative control
```

指标至少包含：

```text
premature_authority_commit_count
strong_constraint_activation_latency
valid_decision_commit_delay
unresolved_item_loss
later_correction_or_supersession_rate
protected_hot_raw_tokens / events
proposal/validator/reducer branch count
focused and adversarial fixture count
```

第一阶段可以用固定 Gold proposal/eligibility fixture 测机械 scheduling，不调用模型。若要
测试自然语言 closure/extractor correctness，必须另开固定 input/provider/prompt 与人工 Gold
合同，不能用 Grace Tail 的机械通过率替代语义正确性。

### Promotion and stop conditions

- C1 降低 premature commit，且 Constraint latency/Decision delay/Hot Raw cost 在预注册门内：
  可 promotion 为 future proposal scheduling default；
- C1 只是把错误延后、显著拖慢明确 Decision 或扩大 Context：保持 C0，不启用 Grace Tail；
- 问题主要来自 Extractor closure semantics：返回独立 Extractor evaluation，不扩大 Tail；
- 若要求 WO-04C writer 强制最近 N turn/token 不可 Takeover：停止，重开 Composition Gate、
  policy hash 与 baseline 评估；不得用本登记隐式授权。

无论实验结果如何，Closed/Open lifecycle、Strong Constraint Immediate Authority 与 Raw
Retention 都不得由 Grace Tail 替代。

---

## DA-06 — RejectedAlternative Default-excluded Projection

**用户状态：** 已接受修正版方向并要求纳入后续计划。

**登记状态：** RECORDED / ACCEPTED DIRECTION / PRESERVE V0 + CANONICAL STATE V1 /
PENDING FUTURE ABLATION / NOT YET PROMOTED

**WO-04C impact：** NONE — Takeover v1 继续只读 exact State authority，不改变 State kind、
policy hash、coverage、Artifact 或 transaction。

**Routing：** WO-05 ContextSnapshot projection/dedup/authority precedence；WO-06 explicit
recovery of rejection rationale；未来独立 Canonical State v2 experiment 才可评估是否移除
该 State kind。

### Semantic separation

`CONSTRAINT` 与 `REJECTED_ALTERNATIVE` 不默认合并：

```text
CONSTRAINT
  current normative Authority that must be followed

REJECTED_ALTERNATIVE
  historical record that an option was rejected, including rationale/reopen context
```

阶段性否决、成本权衡或当前不采用不能自动升级为永久 Constraint。只有显式 Authority
表达当前必须/禁止的规则时，才允许产生独立 active Constraint。Constraint 与 rejection
record 可以共享 provenance 或建立显式关系，但不能因文本相似而协调合并。

### Future canonical projection default

Future WO-05 Snapshot 默认不把 RejectedAlternative 作为常驻 Working Context root 或
automatic historical note。只有以下 closed inclusion reason 之一成立时，才纳入当前
Snapshot/EvidenceBundle：

```text
EXPLICIT_REF
OPTION_REPROPOSED
REQUIRED_DECISION_RATIONALE
DEPENDENCY_OR_RELATION_CLOSURE
TARGETED_WHY_NOT_RECOVERY
```

如果 rejection 已经派生出当前 active Constraint，默认 Context 只呈现 Constraint；拒绝
记录作为 provenance/rationale 按需取回，避免同一语义重复占用 token。纳入历史拒绝只表示
提供证据，不使旧方案、旧否决或 reopen condition 自动获得新的 Authority。

### Preservation boundary

当前 frozen v0 assembler 已将 RejectedAlternative 与 superseded Decision 放在 optional
historical notes，而非 mandatory active root；本调整不改变该 accepted behavior。Canonical
State v1 已冻结 `REJECTED_ALTERNATIVE / REJECTED`、policy descriptor/hash 与 exact replay，
同样不原地删除、重命名或合并。

Future default-excluded 是可逆 projection policy，不是 schema migration。如果真实证据显示
RejectedAlternative 不值得继续作为 canonical State kind，必须新建 State policy/schema v2、
migration/promotion/compatibility plan 与 Independent QA；v1 历史仍须 exact replay。

### Future comparison direction

在同一 frozen State/Raw world 比较：

```text
R0 = current optional historical-note projection
R1 = RejectedAlternative default-excluded + explicit/on-demand inclusion
```

至少覆盖：

```text
many unrelated rejected alternatives and Context growth
active Constraint derived from a rejection
temporary rejection that must not become a permanent prohibition
user reproposes an exact rejected option
"why did we not choose X" Targeted Recovery
changed conditions that permit reconsideration
superseded/rejected historical pollution negative control
```

指标至少包含：

```text
rejected_alternative_context_tokens
duplicate_constraint_rationale_tokens
rejection_rationale_recovery_success
forbidden_option_resuggestion
false_permanent_constraint
valid_reconsideration_blocked
Snapshot inclusion reason integrity
```

- R1 保持 active Constraint 与 why-not/reproposal correctness，同时减少常驻 token/污染：
  可 promotion 为 future WO-05 default；
- R1 导致拒绝理由不可恢复或频繁重新建议已否决方案：保留 R0/建立更窄显式 inclusion，
  不直接把 rejection 全部转成 Constraint；
- 数据不足：保持可逆候选，不宣称应删除 State kind。

---

## DA-07 — Deterministic Context Assembly + Budget Failure Contract

**用户状态：** 已接受修正版方向并要求纳入后续计划。

**登记状态：** RECORDED / ACCEPTED DIRECTION / PRESERVE FROZEN V0 / PENDING WO-05
PROMOTION + ABLATION / NOT YET PROMOTED

**WO-04C impact：** NONE — 不修改 Takeover/Enrichment、Frontier、transaction、policy hash、
source/schema/test allowlist 或工期估算。

**Routing：** WO-05 ContextSnapshot assembly/budget/trim；WO-06 EvidenceBundle inclusion；
当前 frozen v0 assembler 保留为 compatibility/shadow comparator。

### Accepted future assembly direction

Future canonical Context Assembly 候选采用：

> Priority Buckets + Hard Invariants + Deterministic Whole-object Trim

不在主路径引入 learned ranker、LLM importance judge、多因素动态权重、information-density
估计或 PACE 式动态粒度。Authority precedence、inclusion obligation 与 token placement 必须分开；
“non-authoritative evidence”不等于“可在 required Attempt 中省略”。

候选 buckets 为：

```text
P0 REQUIRED
  Current Input
  active Hard Constraints
  explicit required Authority refs
  mechanically required dependency closure
  required Recovery / Evidence for the intended Attempt

P1 CANONICAL WORKING SET
  Frontier-bound Hot Raw mechanical projection
  eligible active Goal / Decision / OpenQuestion
  their required dependency closure

P2 CONDITIONAL SOFT
  relevant Artifact projection
  non-required Recovery Evidence
  optional derived Summary, if a later contract defines one

P3 OPTIONAL HISTORICAL
  opt-in broad retrieval
  RejectedAlternative / superseded history / diagnostics
```

低优先级对象不能挤掉高优先级对象。显式 dependency/evidence obligation 可以把对象提升到
required inclusion；这不改变该对象的 Authority。跨 source 去重必须先遵循 Authority
precedence，再按稳定 key/order 组装，不能让来源枚举顺序改变 Snapshot。

### Mandatory overflow contract

如果 P0 或本次 Attempt 明确要求的 P1 closure 已经超过 budget，assembler 必须返回显式
`BUDGET_INSUFFICIENT`/overage diagnostic，并且不得生成可 dispatch 的 executable
Snapshot/Attempt。禁止通过截断 Constraint、required ref、dependency 或 required Evidence
伪装成功。

预算允许时按 P0 -> P1 -> P2 -> P3 装配；超预算只从最低 bucket 开始确定性裁剪。Raw、State、
Evidence 与 Artifact 均按完整 object/turn/segment 边界裁剪，不在对象内部随意截断。若 Active
State 在真实规模下足够小，future WO-05 可先全部纳入 eligible set；只有数据证明规模压力后，
才引入显式 scope/placement policy。

### Scope and representation boundaries

- Core 不猜测 Host `task_id`，只消费显式 scope、required refs、canonical relations 或 opaque
  Host routing input；
- Hot Raw 由 Frontier/as-of world 与 mechanical projection 决定，不使用 fixed recent-N 取代；
- 当前 architecture 没有自动 Rolling Summary guarantee；未来 Summary 只能是 optional derived
  projection，不能冒充 Raw、Committed State 或 required Evidence；
- Retrieval result 被纳入 Working Context 不会自动获得 Authority，也不能自动写 State；
- Context Assembly 只组装已在同一 frozen world 中合格的对象，不成为第二个 Extractor、Reducer
  或 policy inference engine。

### Future deterministic comparison direction

在同一 frozen Raw/State/Fact/Relation/Evidence world 中比较：

```text
A0 = frozen v0 assembler behavior
A1 = deterministic priority buckets + whole-object trim + explicit overflow failure
```

至少覆盖：

```text
exact token-budget boundaries
mandatory set already over budget
active Constraint retention
dependency/evidence promotion into required inclusion
required Recovery before high-risk Attempt
Hot Raw frontier projection differs from fixed recent-N
whole-object/turn trim without partial corruption
cross-source duplicate and authority precedence
input permutation with byte-stable deterministic output
concurrent later Event excluded by frozen ledger_as_of_revision
high-risk missing Evidence produces no executable Attempt
small Active State all-inclusion control
```

指标至少包含：

```text
mandatory_item_loss
silent_truncation_count
budget_overage_tokens and explicit failure integrity
required_evidence_inclusion / miss
constraint_retention
cross_source_duplicate_tokens
Snapshot byte/revision determinism
optional_context_tokens retained/trimmed by bucket
assembly branch count and fixture cross-product
```

### Promotion and stop conditions

- A1 保持所有 hard invariants、required evidence 与 deterministic replay，同时减少动态策略分支和
  测试交叉项：可 promotion 为 future WO-05 default；
- bucket 规则持续遗漏预注册 Gold-required context：优先增加显式 inclusion reason/scope binding，
  不直接引入不可解释综合分数；
- mandatory overflow 无法在 Host dispatch 前阻止 Attempt：停止 promotion，先补稳定失败接口；
- Active State 规模确实超过预算：另开 bounded placement/scoping experiment，不能由 assembler
  隐式猜测 relevance；
- 若需要修改 frozen v0 或 WO-04C transaction contract 才能实验：停止并另开 compatibility/
  promotion work order。

---

## DA-08 — Deterministic Compaction Pressure Gate + Strict Frontier Takeover

**用户状态：** 已接受修正版方向并要求纳入后续计划。

**登记状态：** RECORDED / ACCEPTED DIRECTION / PRESERVE FRONTIER + TRANSACTION CONTRACT /
PENDING FUTURE POLICY EXPERIMENT / NOT YET PROMOTED

**WO-04C impact：** NONE — 当前 WO-04C 继续实现已冻结的 closed Takeover/Enrichment
transaction，不新增 scheduler、detector、State writer 或 substrate transition，也不改变工期估算。

**Routing：** Future Core compaction trigger/boundary policy work order；若其输出成为 Snapshot/Hot
Raw policy input，再由 WO-05 接收。WO-04C 只验证并提交已经构造完成的 closed Takeover input。

### Correctness complexity that remains mandatory

每个 scope/stream 必须分开保存和验证：

```text
frontier_position
  highest contiguous Ledger boundary safely taken over

raw_frontier_revision
  monotonic authority version of the Frontier record

takeover_commit_id / takeover_commit_revision
  idempotent identity / monotonic Takeover order
```

Takeover CAS 必须同时校验 expected Frontier revision 与 position。成功 range 必须从
`frontier_position + 1` 开始、连续、无洞且不超过同一 transaction snapshot 的 Ledger
high-water；同 base 并发提交至多一个成功，失败者重新读取后重算。禁止通过先写后补、补偿性
best effort、手工改 revision vector 或 generic participant framework 取消这个原子边界。

Takeover 成功仍必须在一个 bounded coordinator transaction 中绑定：

```text
exact Raw range and Event identities
exact State authority reference
exact/applied Fact and Relation authority
one valid coverage disposition per Raw Event
immutable Compaction Artifact
Takeover domain row + substrate marker/result
Frontier double-CAS transition
```

任一 required ref/proposal/coverage/artifact 失败，整笔回滚且 Frontier 不动。Exact retry、
substitution conflict、COMMIT failure、close/reopen 与 Hot Raw rebuild 必须保持稳定。Raw Event
不删除、不修改；Frontier 只改变 Ledger Raw 在 Working Context 中的 Hot projection 资格。

### State and representation correction

WO-04C v1 不是 `Extract -> Delta -> atomically write State + Frontier`。当前冻结语义是：

```text
if a new State revision is required:
  Proposal -> Validate/Reduce -> standalone State Authority commit

then from a fresh exact snapshot:
  validate exact State authority reference
  + optional same-handle Fact/Relation apply
  + coverage + immutable Artifact
  + atomic Frontier Takeover
```

Takeover v1 必须保持
`previous_state_revision == new_state_revision`。如果未来功能要求同一次 Takeover 新建 State
revision，必须停止并另开 bounded substrate extension；不能借本登记扩大 WO-04C。

Compaction Artifact 是 durable coverage/provenance proof，不等同于 Rolling Summary。每个 Event
只能是 `canonicalized`，或使用 closed reason 的 `artifact_only`；proposal validation failure
不是合法 disposition。Raw wording 仍可由 Ledger exact recovery。

### Simplified future trigger candidate

Future scheduler 候选只保留一个确定性 Pressure Gate：

```text
Frontier-bound Hot Raw projected cost
  compared with an explicit capacity-derived high-water policy
        ↓ pressure reached
try the oldest safe contiguous prefix starting at frontier_position + 1
        ├─ no safe end -> defer; Frontier unchanged; report pressure
        └─ safe end    -> construct one bounded Takeover request
```

Gate 可以消费 token、active working-set cost 与 Host context capacity，但必须归一成一个可重放
predicate 和显式 policy identity；具体 threshold 继续是未冻结实现参数。禁止 fixed recent-N/
turn count、预测性 scheduler、动态多因素调权、后台多 segment 并行、speculative Frontier、
per-stream multi-lane cursor 或为达到时限而强制切开不安全语义。

Idle/time 只允许触发一次 eligibility check，不能自动判定 closed。长度/容量决定何时检查；
closure、risk 与完整 coverage 决定允许处理到哪个 end。如果从 Frontier 直接后继开始找不到
安全 end，不能跳过它推进后面的 range；非连续历史只能使用 Enrichment，且不能减少 Hot Raw。

### Responsibility boundary

Trigger/boundary policy producer 负责提出 candidate range；WO-04C Core transaction 负责机械验证
direct-successor、continuity、Raw identity、authority、coverage、Artifact、CAS 与 replay。WO-04C
不实现“最佳压缩时机”或 Closure classifier，也不接受 caller 自报 new revision/hash/timestamp。

未来即使抽出 policy port，也只能返回 plain-data candidate/policy identity，不能获得 SQL、
transaction handle、Authority mutation 或任意 participant registration 能力。

### Future comparison and fixtures

Trigger policy 与 Takeover transaction correctness 必须分开测试。Trigger 实验在同一 frozen
Raw/Frontier/capacity world 比较当前可用 policy baseline 与单一 deterministic Pressure Gate，
至少覆盖：

```text
below / exactly-at / above high-water
pressure reached but no safe direct-successor prefix
first safe end followed by an unresolved segment
idle check without semantic closure
cross-session Hot Raw and non-chat Events
fixed recent-N disagrees with Frontier negative control
temporary overage followed by later safe boundary
```

Takeover correctness fixtures 至少覆盖：

```text
direct successor versus gap / skipped prefix
stale revision, stale position and same-base race
concurrent later Ledger append outside the frozen range
required proposal/ref/coverage/artifact failure rollback
all-artifact_only range with valid closed reasons
proposal failure disguised as artifact_only rejection
exact retry and normalized-field substitution conflict
SQLite COMMIT failure with no leaked object/marker/revision
State revision changed before Takeover snapshot
Hot Raw rebuild retains every after-range Event
```

至少记录：

```text
compaction_attempt_count
safe_prefix_available / deferred_pressure_count
projected_hot_raw_tokens and temporary overage
unnecessary_or_premature_takeover
frontier_gap_or_duplicate_apply
CAS conflict / recompute rate
rollback_leak_count
replay_determinism
policy branch count and fixture cross-product
```

### Promotion and stop conditions

- 单一 Gate 在不增加 premature Takeover、Hot Raw loss 或 correctness failure 的前提下降低
  scheduler 分支和测试矩阵：可 promotion 为 future Core compaction default；
- 临时 overage 经常无法等到安全边界或阻止基础 Context Assembly：保留 correctness，不强制
  推进 Frontier；另开 bounded capacity/fallback experiment；
- 问题来自 semantic closure/extractor：返回独立 proposal-producer evaluation，不把 Pressure
  Gate 升级为 LLM judge；
- 需要同一 Takeover 创建 State revision：停止，先审 bounded substrate extension；
- 需要跳过未安全前缀、多 lane/speculative Frontier 或删除 Raw 才能满足性能：拒绝隐式
  promotion，另开有明确收益证据的架构工单。
