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

---

## DA-09 — Deterministic Hot Raw Projection Target + Window Ablation

**用户状态：** 已接受修正版方向并要求纳入后续计划。

**登记状态：** RECORDED / ACCEPTED DIRECTION / PRESERVE HOT RAW + FRONTIER SEMANTICS /
PENDING WO-05 PROMOTION + ABLATION / NOT YET PROMOTED

**WO-04C impact：** NONE — 不修改 Takeover range、Frontier、coverage、Artifact、transaction、
policy hash、source/schema/test allowlist 或工期估算。

**Routing：** WO-05 ContextSnapshot Hot Raw projection/manifest/budget；future deterministic
window ablation work order。当前 frozen v0 Recent Raw behavior 保留为 compatibility comparator，
不能由本登记静默改写。

### Three distinct layers

以下三个概念不能合并：

```text
Raw Ledger
  append-only complete Event history and replay fact source

Eligible Hot Raw
  frontier_position < event.revision <= ledger_as_of_revision
  all Raw Events not yet safely taken over in the frozen Snapshot world

Snapshot Hot Raw projection
  the exact Raw Event/segment projection selected for one Working Context
```

固定 token target 只允许作用于第三层。没有进入某次 Snapshot 的 eligible Event 仍然是 Hot
Raw：不得变成 Cold、不得被视为 compacted、不得推进 Frontier，也不得从 Ledger 删除。它在
后续 Snapshot、Targeted Recovery 或安全 Takeover 中继续可用。

Snapshot 必须持久绑定实际纳入的 `hot_raw_event_refs`、`hot_raw_hash`、
`ledger_as_of_revision`、Frontier vector、projection version 与 config/policy identity。完整
eligible set 必须能由 Ledger + committed Frontier + as-of world 确定性重建。

### Accepted future projection candidate

Future WO-05 候选使用连续、机械、可审计的 Raw projection：

```text
rebuild eligible Hot Raw from Ledger + Frontier + as-of
-> apply allowed deterministic structural projection/folding
-> if projected cost <= raw soft target: include all
-> otherwise select the latest contiguous suffix
   on complete Raw Event or explicit segment boundaries
-> allow bounded whole-object overshoot only below hard Context capacity
-> freeze exact refs/hash/projection identity in Snapshot
```

禁止 semantic importance pruning、LLM message selection、topic-aware window、per-request adaptive
scoring、精确拆分 Event 或为节省少量 token 重写 Raw。Chat message 只是 Raw Event 的一种；Tool
Result、文件、external observation 与跨 session Event 必须遵循同一 stable boundary contract。

如果已有显式 active-segment/closure marker，soft target 可以向更老方向扩展到完整 segment，
但不能调用新的 LLM judge 猜测最佳边界。没有显式 marker 时只保证 complete Event boundary。
窗口选择不参与 closure Authority、Compaction coverage 或 Frontier transition。

### Soft target versus hard capacity

`raw_projection_target` 是可实验的软目标，不是 Host hard limit。完整 Event/segment 可以造成
有界 overshoot，但最终 Context 仍必须满足 DA-07 的 hard-cap contract：

```text
soft target crossed, hard capacity still valid
  -> deterministic bounded overshoot is allowed and recorded

mandatory Current Input / Authority / required refs / required Evidence exceed hard capacity
  -> explicit BUDGET_INSUFFICIENT / overage diagnostic
  -> no executable Snapshot/Attempt
```

Core 不按 provider/model 名称分支。Token/cost estimator、capacity 与 numeric target 必须使用
显式 version/config identity；未来若 Host 提供不同模型容量，也只能作为 opaque、可重放输入，
不能让 Core 隐式选择 provider 或猜模型能力。具体默认 token target 继续保持未冻结。

### Authority and correctness boundary

Hot Raw projection 是 State 提交滞后的 usability buffer，不是 Authority correctness guarantee。
新 Raw 与旧 State 冲突时，不能依赖远端模型自行裁决；Hard Constraint、撤销、最终决定仍走
Immediate Authority fast path，required Raw/Authority/Evidence 仍通过显式 inclusion reason 与
dependency closure 提升到 mandatory context。

窗口之外但本 Attempt required 的 Event 不应通过“智能扩大 Recent Raw”隐式找回；应使用 exact
required ref、Targeted Recovery 或 EvidenceBundle，并保持 non-authoritative evidence 不自动
获得 State Authority。

### Future ablation direction

在同一个 frozen Ledger/Frontier/as-of/State/Evidence world、同一 estimator/version、同一 hard
capacity 和相同 mandatory set 中比较：

```text
H0 = all mechanically projected eligible Hot Raw
H1 = 1k soft raw target
H2 = 2k soft raw target
H3 = 4k soft raw target
H4 = 8k soft raw target
```

数值仅为预注册测试档，不是 architecture default。若 estimator 不使用这些单位，promotion
work order 必须在看结果前冻结等价的 deterministic cost buckets。

至少覆盖：

```text
short Hot Raw below every target
one oversized Event and whole-object overshoot
explicit active segment crossing the soft boundary
no explicit segment marker at the boundary
negation / correction / sarcasm across the boundary
unresolved Goal or OpenQuestion older than the suffix
new Raw contradicting stale State
Immediate Hard Constraint near and outside the soft boundary
cross-session and non-chat Raw Events
Frontier unchanged while older eligible Hot Raw is omitted from one Snapshot
required exact Event outside the suffix
mandatory set already exceeds hard capacity
permutation/reopen rebuild with byte-stable selected refs/hash
```

至少记录：

```text
working_context_raw_tokens and total reduction
continuity_or_correction_loss
unresolved_item_omission
state_lag_exposure
required_recovery_rate / success
eligible_hot_raw_omitted_count / tokens
soft_target_overshoot
hard_capacity_failure_integrity
Snapshot ref/hash determinism
final-answer quality only in a separate fixed-model evaluation
```

第一阶段必须使用 fixed refs/Gold inclusion fixtures 测 projection correctness，不调用远端模型。
最终回答质量另开固定 provider/model/prompt/fresh-session 与盲化评分合同，不能用模型波动选择
projection policy。

### Promotion and stop conditions

- 某个 soft target 在预注册 continuity/required-context/recovery 门内取得稳定 reduction：可以
  promotion 为 WO-05 configurable default；
- 小窗口增加 correction loss、State lag exposure 或 Recovery 回补到抵消 token 收益：选择更大
  target 或 H0，不引入智能 message ranker；
- explicit segment extension 经常无限扩张或依赖不稳定 closure inference：退回 complete Event
  boundary，不升级语义窗口优化器；
- hard capacity 被 whole-object overshoot 穿透：停止 promotion，修复 explicit failure contract；
- 需要 fixed recent-N 重新定义 Hot Raw、移动 Frontier 或删除 Raw 才能达成指标：拒绝该方案并
  保持 canonical Hot Raw semantics。

---

## DA-10 — Minimal Raw Trust-root Provenance + No Generic Lineage Graph

**用户状态：** 已接受修正版方向并要求纳入后续计划。

**登记状态：** RECORDED / ACCEPTED PRESERVATION DIRECTION / PRESERVE WO-03B + WO-04A +
WO-04B CONTRACTS / NOT YET PROMOTED TO GOVERNANCE POLICY

**WO-04C impact：** NONE — 继续使用已冻结的 canonical Raw identity、same-scope Authority
provenance、coverage 与 Artifact binding；不修改 Takeover/Enrichment grammar、transaction、
policy hash、source/schema/test allowlist 或工期估算。

**Routing：** WO-05 exact Snapshot Raw refs/hash；WO-06 exact provenance fetch/Targeted Recovery；
future bounded governance/content-storage work order 处理 retention、redaction、erasure 与大型
payload。已接受的 WO-03B Raw、WO-04A State、WO-04B Fact/Relation behavior 原样保留。

### Canonical Raw identity remains mechanical and complete

Canonical Raw Event 的最小可信身份不是仅有 message/session/timestamp，而是：

```text
scope { namespace, stream_id }
event_id                         stable idempotency identity inside scope
ledger_revision                  authoritative per-stream order/high-water
source_kind + source_id
source_session_id?               provenance only; never stream identity
canonical payload
occurred_at?                     source time; never authoritative order
created_at                       first durable commit result
immutable append marker/result
```

相同 `event_id` 在不同 scope 可以独立存在；session、Raw sequence、wall-clock timestamp 或文件
路径不能代替 scope/ledger identity。Exact normalized retry 返回原 Event，任一 payload/source/
time substitution 必须稳定 conflict。Raw update/delete 继续由 canonical schema 阻止。

### Minimal source-ref rule

Canonical Derived Object 的 trust-root provenance 保持直接、无聊：

```text
object is already bound to one explicit scope
+ source_event_ids[]
-> each ID must resolve to a committed canonical Raw Event in the same scope
-> each Event must be no later than the object's frozen Ledger high-water
```

因此域内持久字段可以只保存 normalized Event ID 数组；跨 API/manifest 解释时完整引用仍为
`scope + event_id`。禁止把 legacy session ID、summary ID、Raw position、semantic-search hit 或
可变化路径当作 Authority provenance。

State v1 继续要求 commit provenance 等于 per-item `source_event_ids` 的 exact union，existing
item refs 只能单调增加。旧 immutable State revision 保持当时的 exact refs；新语义 Decision
应获得新 identity/lifecycle 或 accepted Relation，而不是回写旧历史。

### Provenance versus domain evidence semantics

不得把所有语义塞入 `source_refs`，也不得借“最小 provenance”删除已有正确性合同：

```text
source_event_ids[]
  direct Raw trust root

verification_event_ids[]
  Fact verification/disconfirmation evidence owned by Fact policy

typed Relation
  SUPPORTS / CONTRADICTS / SUPERSEDES / RETRACTS / ...
  owned by Relation policy
```

不新增第三套 generic lineage/provenance graph，不给 source ref 增加 causal/supporting/opposing/
inherited/confidence 等标签，也不做递归 derivation reasoning。Existing Fact verification 与 typed
Relation 仍保留，因为它们表达领域 correctness，而不是 source-ref metadata。

### Raw-event granularity and optional future selectors

Raw 忠实保存一次显式 source projection：user input、Tool Result、file 或 external observation。
一条 Event 可以包含多个语义事项；多个 State/Fact/Relation 对象可以引用同一个完整 Event。
当前 canonical Authority v1 不增加 semantic segmentation、sentence split 或 span offset。

如果 future evidence 证明 whole-Event Recovery token cost 不可接受，只能在独立实验中评估
deterministic selector，例如 canonical JSON Pointer/content selector + source content hash。
Tokenizer offset、LLM segmentation 或没有 selector version 的 byte/code-point span 不能进入
Authority ref；selector 只是 retrieval precision hint，不能取代 direct Event trust root。

### Authority replay versus extractor rerun

必须区分：

```text
Authority replay
  committed Proposal + policy/hash + deterministic Reducer + Raw refs
  -> exact committed Authority result

Extractor reevaluation
  Raw -> run rule/model Extractor again
  -> may produce a different Proposal
```

Raw refs 支持审计、定位、重新验证与新 proposal，但不单独证明模型 Extractor 可复现。若测试
Extractor determinism，必须另行冻结 extractor/provider/model/prompt/config identity；不得把
Authority replay pass 当作 extraction correctness。

Authority State 最终必须落回 canonical Raw Event IDs。Summary/Artifact 可以辅助 producer，
但不能成为 State trust root，也不能形成 `Raw -> Summary -> State` 的唯一有损 provenance 链。

### Retention, deletion and large payload boundary

当前不做 automatic retention、forgetting、archive scheduler 或 Raw cold-tier policy，但也不把
“用户显式删除”定义成 append-only 的简单例外。物理删除可能破坏 State/Fact/Relation refs、
Takeover coverage、Artifact、Snapshot hash 与 exact replay，必须由独立 Governance work order
冻结至少以下语义：

```text
logical tombstone versus payload redaction
cryptographic erasure / content-addressed blob removal
which identity/hash metadata may remain
effect on existing Snapshot and Derived Object integrity
authorization, audit and replay behavior after erasure
```

大型 attachment/Tool output 未来可以使用 immutable content-addressed storage，但 Raw/Snapshot
必须保存 stable ref + content hash + availability semantics；禁止只存可变化路径、静默截断或
把缺失 payload 冒充 exact replay。

### Preservation fixtures

后续 WO-05/06 与 governance planning 至少保留以下机械测试方向：

```text
same event_id isolated across scopes
source_session_id never changes stream identity or order
exact append retry versus payload/source/time substitution conflict
missing / cross-scope / after-high-water provenance rejection
State exact-union and monotonic source refs
Fact provenance versus verification refs remain distinct
typed Relation semantics remain domain-owned
Summary-only Authority provenance rejection
whole Event containing multiple semantic objects
exact provenance fetch without semantic search
external path content substitution detected by content hash
canonical Raw update/delete rejected under current policy
Authority replay distinguished from Extractor rerun
```

至少记录 `exact_ref_recovery_success`、whole-Event recovery tokens、missing/cross-scope ref
rejection、provenance integrity failures、replay determinism 与 selector-added complexity。没有
真实 token/correctness evidence时不引入 segment schema 或 lineage graph。

### Promotion and stop conditions

- direct same-scope Event refs 支撑 Recovery/Audit/Replay 且 whole-Event成本可接受：保持最小方案；
- whole-Event Recovery 成本在预注册 workload 中不可接受：只实验可重放 selector，不改 Raw；
- 新需求可以由 existing verification refs/typed Relations 表达：拒绝 generic provenance graph；
- 要求删除 verification/Relation/scope/revision/hash 来减少字段：停止，作为 capability-removal
  proposal 走 Preservation Gate 与 Independent QA；
- 要求物理删除 Raw 或外置 payload：停止普通实现，先完成 governance、migration、integrity、
  compatibility 与 recovery 合同。

---

## DA-11 — Conservative Optional State Extractor + Shadow-first Promotion Gate

**用户状态：** 已接受修正版方向，并明确其不是短期实施内容；先登记供未来独立规划。

**登记状态：** RECORDED / LONG-HORIZON RESEARCH + PROMOTION CANDIDATE / SHADOW-FIRST /
NOT SCHEDULED / NOT YET PROMOTED

**WO-04C impact：** NONE — 当前 Takeover v1 继续只读 exact committed State authority，不调用
Extractor、不接收 State proposal、不新增 State apply seam，也不修改 Frontier、Artifact、
transaction、policy hash、source/schema/test allowlist 或工期估算。

**Routing：** Future standalone Extractor evaluation/promotion work order only。不得由 WO-05
Snapshot、WO-06 Recovery、Host adapter 或其他短期工单顺便实现/启用。Canonical State writer、
provider-neutral transport 与 Raw/Frontier contracts 原样保留。

### Repository evidence boundary

当前 repository authority 已记录唯一一次 ST-02 Extractor correctness 实验失败：

```text
12 INVALID_SCHEMA fallback
16 strict-valid empty on Gold-nonempty
2 strict-valid empty true negative
general unique recall  = 0 / 35
critical unique recall = 0 / 29
```

该证据只适用于当时 accepted standardized-event-summary input、固定一次 provider/model/prompt/
capture，不证明所有模型、真实 Raw segment 或 Extractor architecture 普遍失败；但它明确禁止把
“一个保守 prompt/transport”视为已证明可用。下一次尝试必须重新过独立 semantic evidence
gate，transport lifecycle、schema parser 或 reducer conformance 均不能替代 Extractor correctness。

### Architectural role

Automated State Extractor 是自动历史编译的可选 Proposal Producer，不是 State Authority Core
的必要 trust root。Core 在没有自动 Extractor 时仍可接受 explicit caller/manual proposal，并
通过同一个 Canonical State owner 完成 Authority commit。

未来逻辑路径保持：

```text
Explicit Authority Detector       narrow per-Event fast path
Historical State Extractor        bounded safe segment; shadow-first
Explicit caller/manual proposal   no automatic extraction dependency
               ↓
shared untrusted proposal envelope
               ↓
strict Parser / Normalizer
               ↓
transaction-bound Validator
               ↓
deterministic Reducer
               ↓
Canonical State Authority Commit
```

三条 producer path 不建立三套 State schema/writer。Extractor/Detector 不获得 database handle、
revision allocator、Authority mutation、Frontier mutation、retrieval loop 或任意 callback 能力。

### Closed producer outcomes

未来 producer envelope 使用闭合的 operational outcome，而不是自我认证的 confidence：

```text
PROPOSE
  carries an untrusted Canonical State proposal candidate

DEFER
  possible State transition but insufficient explicitness/closure/evidence

NO_PROPOSAL
  producer found no eligible State transition in the frozen input

PRODUCER_ERROR / INVALID_OUTPUT
  timeout, transport, schema, parse or unsupported-policy failure
```

`EXPLICIT` 不能成为绕过 Validator 的标签；即使 producer 声称 explicit，结果仍是 untrusted。
不持久化 continuous confidence，不增加 threshold/calibration lifecycle。`DEFER`、
`NO_PROPOSAL` 与 error 都是 proposal-production outcome，不是 Canonical State v1 empty proposal
或 Authority revision。

必须分开：

```text
NO_PROPOSAL by producer
  no candidate was emitted

Reducer no-op / byte-identical result
  current Canonical State v1 conflict; no revision consumed

INVALID_OUTPUT / producer unavailable
  fail closed; never converted to NO_PROPOSAL
```

Diagnostics 可以作为 non-authoritative evaluation telemetry，但不能进入 State content/metadata
或改变 commit eligibility。

### Frontier coupling is the primary safety gate

Extractor outcome 不能暗中决定 Raw 已被安全接管：

```text
DEFER (including ambiguous evidence) / PRODUCER_ERROR / INVALID_OUTPUT
-> affected direct-successor prefix cannot advance Frontier
-> cannot map to artifact_only / no_semantic_delta

NO_PROPOSAL before semantic promotion evidence
-> shadow observation only
-> cannot authorize artifact_only or Frontier movement
```

否则 missed Decision/Constraint 会随错误 `artifact_only` coverage 退出默认 Hot Raw。只有 future
promotion work order 在查看结果前冻结 evidence threshold、policy/version identity 与 rollback
path，并通过 Independent QA 后，指定 policy 的 `NO_PROPOSAL` 才可被评估为 closed
`no_semantic_delta` input；04C transaction 仍只做机械 coverage validation，不运行 Extractor。

如果 ambiguity 长期阻塞 Frontier，这是明确的 head-of-line trade-off。允许的初始处置只有保持
Raw Hot、等待后续明确 Event/用户澄清或 bounded reevaluation；不得为追求 compaction rate 把
ambiguity 改写成成功。

### Risk policy by State kind

不能对所有 State kind 使用无差别的 `precision > recall`：

```text
Goal / Decision / OpenQuestion historical extraction
  precision-first; ambiguous material remains Raw

Explicit Hard Constraint / revocation / final authority
  Immediate Authority fast path
  both false promotion and missed explicit transition are critical
```

Hot Raw/Recent projection 只能缓解 State lag，不能替代 Hard Constraint commit。Future promotion
必须分别报告 kind/transition slice；总体 accuracy 或大量 `NO_PROPOSAL` 不能掩盖 critical miss。

### Frozen extractor input world

初始 future candidate 输入应保持 bounded、exact、可重放：

```text
explicit scope { namespace, stream_id }
ledger_as_of_revision
exact bounded source Event refs + canonical Raw segment
base_state_revision
complete exact Canonical State at that revision
extractor input/policy/transport identity
```

初期提供完整 exact Canonical State，而不是先增加 State retrieval/semantic selector。Producer
需要 current/terminal items 才能识别已有 `item_id`、legal update、supersession、resolved question
与 duplicate/no-op。State 真实规模造成输入压力后，才可另开 deterministic candidate-selection
ablation；缺少证据时不引入 relevance scoring。

不向 producer 隐式发送完整长期 Raw History、unbounded retrieval、personality profile、Host
project guess 或 provider-private state。Summary/Artifact 可以作为显式辅助材料，但 Authority
proposal 必须继续落回 exact Raw provenance refs。

### Durable item identity and race policy

自动 Extractor 进入 Authority path 前必须单独冻结 item identity/reconciliation：

- existing item 只能引用输入 State 中存在的 exact `item_id`，并遵循 kind/status transition；
- new item identity 必须由可重放 orchestration/identity policy 稳定分配，不能让模型自由发明；
- transport retry、crash recovery 与 identical frozen input 必须有稳定 candidate/commit identity；
- producer 输出后若 State revision 已变化，expected-revision CAS 必须失败；不得将 stale proposal
  自动 patch 到新 State；
- conflict 后只能在新的 frozen State/Raw world 中 bounded reevaluate，或显式 defer；
- 禁止用 semantic similarity 私自协调、合并或覆盖两个 Authority items。

Identity policy 未冻结前，Extractor只能产生 shadow/evaluation candidate，不能自动提交。

### Canonical State vocabulary boundary

Extractor 不新增 `ADD / UPDATE / INVALIDATE / SUPERSEDE / RESOLVE / KEEP` operation protocol。
Authority writer 继续使用 frozen Canonical State v1：

```text
proposal.upsert_items[]
+ kind-specific initial/status transition table
+ no delete
```

Future automatic producer 的最小默认输出 subset 可限制为：

```text
GOAL
CONSTRAINT
DECISION
OPEN_QUESTION
```

这是可逆 Producer policy，不删除 v1 `REJECTED_ALTERNATIVE` kind 或 explicit proposal
capability。Experience、Personality、Preference、Summary、inferred dependency graph、scope rule、
confidence evolution 与 causal rationale 不进入 State Extractor。

Automated proposal 的 metadata profile 必须 closed、versioned 且尽量为空；禁止利用自由 metadata
偷渡新 schema/lifecycle/dependency semantics。显式“一跳关系”如未来需要，必须由独立
RelationProposal/owner contract 表达，State Extractor 不推断隐含 dependency graph。

### Provider and review boundary

Core 只拥有 plain-data input/output contract、strict parser、policy identity、stable error mapping
与 Authority validation。实际 intelligence 可以来自 local rule、explicit caller 或外部
`ExtractorTransport`；Core 不选择 provider/model，不持有 credential，不隐式联网，也不自动
发送长期私有 Raw。

当前 accepted provider-neutral subprocess transport 只证明 child lifecycle、boundary、SQLite
conflict 与 packaging；不证明语义提取可用。未来 transport failure 必须 fail closed。

不默认调用第二个 LLM Reviewer，不设计 reviewer disagreement arbitration。Reviewer/alternative
producer 只允许作为 isolated shadow comparator；其一致/不一致不能直接提高 Authority。

### Future pre-registered evaluation

独立 Extractor work order 至少比较：

```text
E0 = explicit-rule/caller proposal only
E1 = conservative bounded Extractor in shadow
```

输入必须包含 exact base State 与真实 bounded Raw segment。第一阶段可使用 sanitized synthetic/
adversarial fixtures；Raw private dogfood capture、credential、log 或 database 不进入 Git。不能只
使用已经替模型完成语义标准化的 summary 并将其结果推广到真实 Raw。

至少覆盖：

```text
explicit Decision versus tentative brainstorming
quoted or hypothetical authority
sarcasm / negation / immediate self-correction
transition closing across multiple Events
explicit Constraint / revocation / final decision
existing-item update / supersede / resolve
duplicate and reducer no-op
new-item identity and retry stability
multi-intent Event with exact provenance
ambiguous segment requiring DEFER
timeout / invalid schema / unsupported output
State revision race after extraction
DEFER never advances Frontier
false NO_PROPOSAL never silently authorizes Takeover during shadow
```

指标至少按 kind/transition slice 记录：

```text
false_authority_promotion
missed_explicit_transition
critical_constraint_miss
wrong kind / status / item identity
provenance_integrity_error
DEFER / NO_PROPOSAL / invalid-output rate
duplicate/no-op proposal rate
constraint activation latency
unsafe artifact_only / Frontier advancement
Hot Raw head-of-line stall
incremental tokens / latency / model calls
```

Schema validity、reducer conformance 与 semantic correctness 分开报告。`NO_PROPOSAL` 占比、
总体 accuracy 或低 model-call cost 不能单独构成 promotion evidence。若比较最终回答质量，必须
另开固定 provider/model/prompt/fresh-session 与盲化评分合同。

### Promotion and stop conditions

- E1 在预注册 transition-level precision/recall、critical Constraint、identity、provenance、race
  与 Frontier safety 门内稳定通过：才可提议从 shadow 晋升 bounded producer policy；
- semantic precision 足够但 recall 不足：只允许保持显式/caller path 或更长 Hot Raw，不得用
  `NO_PROPOSAL` 推进 Frontier；
- schema/transport failure 仍显著：先关闭机械 contract，不增加第二模型 Reviewer；
- identity/reconciliation 或 stale-State handling 未闭合：保持 shadow，不提交 Authority；
- 需要 personality、deep intent、scope inference、multi-pass agent、unbounded history/retrieval
  才能过测试：停止该 v1 候选，不扩大 Core；
- 任何 provider/prompt 结果只适用于被固定的 input/policy/capture，不宣称一般模型能力。

---

## DA-12 — Current Authority Projection over Canonical State v1

**用户状态：** 已接受修正版方向并要求纳入后续计划。

**登记状态：** RECORDED / ACCEPTED PROJECTION DIRECTION / PRESERVE CANONICAL STATE V1 /
STATE V2 EVENT-LOG CANDIDATE LONG-HORIZON ONLY / NOT YET PROMOTED

**WO-04C impact：** NONE — Takeover v1 继续绑定 frozen Canonical State v1 exact authority ref/
policy hash，不修改 State grammar/status/reducer/revision、04C transaction、coverage、Artifact、
source/schema/test allowlist 或工期估算。

**Routing：** WO-05 deterministic Current Authority projection/ContextSnapshot manifest；future
standalone Canonical State v2 evidence gate only if real storage/replay pressure appears。不得在
WO-04C、Extractor 或 Host integration 中顺便重写 State v1。

### Premise correction and preservation boundary

Canonical State v1 已经不是 `kind × shared generic status enum`。它使用 closed kind-specific
initial/transition table：

```text
GOAL
  ACTIVE -> COMPLETED | SUPERSEDED

CONSTRAINT
  ACTIVE -> SUPERSEDED

DECISION
  ACTIVE -> SUPERSEDED

OPEN_QUESTION
  OPEN -> DEFERRED | RESOLVED
  DEFERRED -> OPEN | RESOLVED

REJECTED_ALTERNATIVE
  REJECTED
```

通用 `INVALID`、`DORMANT`、`UNCERTAIN`、`CONFLICTING` 不属于 v1。非法的 Goal+OPEN、
Decision+OPEN、Constraint+RESOLVED 等组合不能进入 Authority。当前 v1 complete State、
immutable proposal/row/hash、Raw provenance、policy identity、revision marker、no-delete、
monotonic item refs 与 exact replay 全部保留。

因此本调整不是 capability removal，也不授权删除 `REJECTED_ALTERNATIVE`、`DEFERRED`、
`COMPLETED` 或 terminal history。其目标只是在 Context 路径上不重复呈现非当前项目。

### Three-layer model

未来保持三层分离：

```text
Layer 1  Complete Canonical State Authority v1
  exact immutable State revision including current and terminal items

Layer 2  Current Authority Projection
  deterministic view of operative/open items at one exact state_revision

Layer 3  ContextSnapshot Projection
  placement + required inclusion/dependency closure + budget
```

Layer 2 候选默认选择：

```text
GOAL + ACTIVE
CONSTRAINT + ACTIVE
DECISION + ACTIVE
OPEN_QUESTION + OPEN
```

候选默认不选择：

```text
GOAL + COMPLETED / SUPERSEDED
CONSTRAINT + SUPERSEDED
DECISION + SUPERSEDED
OPEN_QUESTION + RESOLVED
OPEN_QUESTION + DEFERRED
REJECTED_ALTERNATIVE
```

`DEFERRED` 仍是 canonical nonterminal lifecycle，可通过 explicit State proposal 更新回 `OPEN`；
default projection exclusion 不等于 resolved、deleted 或失去历史 Authority。RejectedAlternative
沿用 DA-06 的 explicit/why-not/reproposal Recovery policy，不进入默认 Working Context。

### Presence semantics are view-local

在 Layer 2 Current Authority Projection 内，可以使用：

> Presence = currently operative/open under the exact projection policy.

但不能推广为：

> Absence from one Snapshot = no Authority.

一个当前有效 item 可能因 Layer 3 placement、scope、budget 或 required-context policy 未被某次
Snapshot 选择；这不改变其 Canonical Authority。Terminal item 也仍具有“当时曾成立/如何结束”
的历史审计意义，只是不再是当前 operative instruction。

Working Context 正文可以省略冗余的 `Decision.status=ACTIVE`、`OpenQuestion.status=OPEN` 文本，
但 Snapshot 必须绑定 exact `state_revision`、selected/excluded item refs、projection policy/hash、
placement/inclusion reasons 与 final context hash，保证 replay 与审计。

Current Authority Projection 初期作为 pure derived result，不新增 table、revision axis、writer、
background refresh 或 independent materialized-view authority。它必须能从 exact Canonical State
revision 确定性重建。

### Why no second Delta Log now

当前 Canonical State revision 已持久绑定：

```text
normalized proposal
complete reduced State
state hash
policy hash
same-scope Raw provenance
previous/current revision vector
immutable substrate marker/result
```

新增 lifecycle Delta Log + Active materialized view 会增加新的 schema、writer、atomic update、
idempotency、view rebuild、corruption proof、migration 与 Snapshot reference choice。它不会消除
kind-specific legality，只会把它从 status table 搬到 operation table，并增加 crash/concurrency/
replay cross-product。

原建议的 `UPSERT / SUPERSEDE / RESOLVE / INVALIDATE` 也不是闭合替代：还需要 Goal
`COMPLETE`、OpenQuestion `DEFER/REOPEN`，且通用 `INVALIDATE` 当前没有 accepted State 语义。
因此继续遵循 DA-02：v1 只使用 `proposal.upsert_items[] + kind-specific status transition + no
delete`，不新增通用 lifecycle operation protocol。

### Historical explanation and explicit links

Canonical revision/Raw provenance 可以证明某 item 何时创建、何时在 proposal 中变为 terminal，
但同一 commit 中“D17 superseded + D31 created”不能机械证明 D31 就是 D17 的 replacement。

Current Relation v1 的 `SUPERSEDES` 只接受 `FACT -> FACT`，不接受
`STATE_ITEM -> STATE_ITEM`。若真实 Recovery/QA 需要 exact State replacement link，必须另开
Relation/State policy version，冻结 replacement identity/provenance/acyclicity；禁止根据同 revision
co-occurrence、文本相似或 Extractor guess 隐式建立。

### Future projection comparison

WO-05 在同一 exact State revision/world 中至少比较：

```text
P0 = complete Canonical State v1 supplied to assembly
P1 = deterministic Current Authority Projection
     + explicit required/historical inclusion when triggered
```

至少覆盖：

```text
active Goal / Constraint / Decision retained
OPEN question retained
DEFERRED question default-excluded then explicitly reopened
COMPLETED Goal and RESOLVED question excluded from current view
SUPERSEDED Decision/Constraint excluded but exact Recovery succeeds
RejectedAlternative default-excluded and why-not/reproposal inclusion
terminal item explicitly required as historical Evidence
placement/budget exclusion does not change Canonical Authority
permutation/reopen produces byte-stable selected refs/hash
Snapshot references exact state_revision and projection policy
```

指标至少包含：

```text
current_projection_items / tokens
terminal_or_rejected_tokens_removed
current_authority_loss
historical_recovery_success
false_reopening / stale_constraint_injection
projection determinism
policy branch and fixture count
```

P1 必须 fail-closed on unknown kind/status/policy version；不得把未知 future State 当作 current，
也不得通过字符串规则猜测 lifecycle。

### Long-horizon Canonical State v2 gate

只有真实数据证明下列压力持续存在，才允许规划 event-log + materialized current view：

```text
terminal/current item ratio remains high
complete State canonical JSON/storage amplification is material
State commit/reopen/replay latency becomes a bottleneck
projection alone cannot absorb the cost
```

独立 v2 work order 必须预注册比较：

```text
S0 = Canonical State v1 complete immutable revisions
     + deterministic Current Authority Projection

S1 = type-specific lifecycle event log
     + atomically maintained current materialized view
```

至少测 total/current/terminal item count、revision bytes、storage amplification、commit/reopen/
replay latency、view rebuild/corruption、crash/concurrency cases、migration、old Snapshot replay 与
test-matrix complexity。减少一个 status 字段或 Active View 行数不能单独证明 S1 更简单。

任何 v2 必须继续表达 type-specific `COMPLETE/SUPERSEDE/DEFER/REOPEN/RESOLVE` 语义，迁移 v1
history，给出 stable revision/Snapshot compatibility，并经过 shadow/promotion 与 Independent QA。
它不能原地改变 v1 policy hash，也不能回写已经绑定 v1 的 WO-04C Takeover。

### Promotion and stop conditions

- P1 保留所有 current Authority、显著减少 terminal/rejected Context，并维持 exact Recovery/
  replay：可 promotion 为 WO-05 deterministic default projection；
- P1 因 DEFERRED/terminal exclusion 造成 required history loss：增加 closed explicit inclusion
  reason，不恢复 complete State 默认注入，也不改变 lifecycle Authority；
- projection 无法确定性重建或 Snapshot 未绑定 exact refs/policy：停止 promotion；
- 仅为“schema 看起来更小”要求新 Delta Log/materialized writer：拒绝，保持 v1；
- 真实规模证据达到 v2 Gate：另开独立 architecture/schema/migration work order，不扩大当前
  WO-04C/05。

---

## DA-13 — Hard-Constraint Automatic Fast Path + On-demand Decisions

**用户状态：** 已接受修正版方向并要求纳入后续计划。

**登记状态：** RECORDED / ACCEPTED DEFAULT-POLICY CANDIDATE / PRESERVE EXISTING IMMEDIATE
CAPABILITY / PENDING FUTURE ABLATION / NOT YET PROMOTED

**WO-04C impact：** NONE — Immediate Authority 继续使用 standalone Canonical State writer，
不移动 Frontier；04C Takeover v1 只引用 fresh exact committed State authority。不修改 04C
grammar、transaction、coverage、Artifact、policy hash、source/schema/test allowlist 或工期估算。

**Routing：** Future standalone Authority Detector/producer policy ablation；WO-05 P0 mandatory
Constraint projection；future Attempt/Host orchestration 使用 existing targeted-on-demand and
Interrupt contracts。不得由 WO-04C 或短期 Host adapter 顺便删除现有 Immediate capability。

### Timing mode is not an Authority hierarchy

Canonical State v1 已冻结三种 commit mode：

```text
immediate_authority
lazy_historical
targeted_on_demand
```

三者使用完全相同的 proposal grammar、Validator、Reducer、policy hash、revision substrate 与
Authority commit。`immediate_authority` 只表示低延迟提交路径，不表示更高真值、confidence、
precedence 或永久性。相同 active Constraint/Decision 一旦 committed，其 Authority 不因产生模式
而不同。

本调整拒绝 continuous authority score、preference hierarchy、confidence threshold、模型
arbitration 或“高 Authority 文本”通用分类器。

### Accepted future default policy

Future automatic producer 候选默认：

```text
explicit Hard Constraint create
or exact active Constraint supersession/revocation
-> immediate_authority candidate

ordinary Goal / Decision / OpenQuestion
-> Raw-first + lazy_historical by default

Goal/Decision/Question required before a formal operation
-> targeted_on_demand proposal/commit
-> only then freeze an executable Snapshot/Attempt
```

当前 Contract 中 explicit final Decision 的 Immediate capability 不物理删除。Explicit caller
仍可发起合法 `immediate_authority` State proposal；automatic Decision fast path 只作为 future
default-off/shadow candidate。只有预注册 Decision Fast Path ON/OFF 证据与 Independent QA 才能
修改上层 Contract wording。

Current Input 仍属于 Snapshot P0 mandatory input，Frontier-bound Hot Raw 提供短期语境缓冲；但
二者不能替代 required structured Authority。若后续 Tool/Attempt 必须依赖“最终使用 B”，必须
在 dispatch 前使用 targeted-on-demand，而不是只让模型从 Raw 自行解释。

### No new PIN / REVOKE State protocol

Fast Path 继续复用 Canonical State v1 `proposal.upsert_items[]`：

```text
create hard Constraint
-> new CONSTRAINT item with ACTIVE status

explicitly revoke/supersede exact Constraint
-> upsert existing exact item_id
-> ACTIVE -> SUPERSEDED
```

不新增 `PIN`、`REVOKE`、`INVALIDATE` operation/status。`Pinned` 只表示 active Constraint 在
DA-07 Context Assembly 中属于 P0 mandatory inclusion，不是 Canonical State lifecycle。

Constraint `SUPERSEDED` 在 v1 是 terminal；如果用户以后重新建立同一行为规则，应产生新的
Constraint identity/provenance，不能把旧 item 恢复为 ACTIVE，也不能改写旧 revision。

### Narrow producer input and outcome

Future automatic detector 输入保持 bounded、exact：

```text
explicit scope
current canonical Raw Event
base_state_revision
exact active Constraint item refs/content at that revision
detector input/policy/transport identity
```

不读取完整长期历史、不执行 retrieval、不猜 Host Project/scope、不推断 personality/preference。
现有 active Constraint 只用于 exact revocation target 与 duplicate/conflict candidate detection，
不能让 producer 通过语义相似度自动协调 Authority。

输出沿用 DA-11：

```text
PROPOSE
  exact new Constraint candidate
  or exact existing Constraint -> SUPERSEDED candidate

DEFER
  possible behavioral constraint/revocation but scope or target is ambiguous

NO_PROPOSAL
  no eligible explicit Hard Constraint transition found

PRODUCER_ERROR / INVALID_OUTPUT
  fail-closed transport/schema/policy outcome
```

`PROPOSE` 仍是不可信输入，必须通过 Parser/Normalizer、transaction Validator 和 deterministic
Reducer。Detector/Extractor 不获得 State/Frontier writer、database handle 或 Tool-dispatch 能力。

### Precision and recall are both critical for Constraints

Hard Constraint 不能只使用无条件 `precision > recall`：

```text
false active Constraint
-> blocks or distorts permitted work

missed explicit Constraint
-> may permit forbidden work
```

两者都必须作为 critical Gate。Current Input/Hot Raw 是防御层，不是允许 detector 漏检的证明。
未来不得用总体 accuracy、`NO_PROPOSAL` 占比或普通 Decision precision 掩盖 Constraint slice。

如果 explicit caller/Host 已明确标注该 Event 是 required Hard Constraint，producer/commit 失败时
必须阻止依赖它的 executable Attempt；不能把 error 当作 NO_PROPOSAL。Automatic detector 没有
命中时的 residual risk 必须通过 adversarial fixtures、Raw inclusion 与 dogfood telemetry 明示，
不能宣称绝对安全。

### Revocation and conflict boundary

Revocation 必须定位 exact active `item_id`。例如“取消 C17”或 future contract 提供一个唯一
resolved ref，才允许 ACTIVE -> SUPERSEDED。自然语言“刚才那个限制取消”如果可指向多个
Constraint，必须 DEFER/请求澄清；不允许按 recency、embedding 或文本相似自动选择。

新 Constraint 与既有 Constraint 可能语义冲突时，Fast Path 不做 deep conflict resolution。
只有用户同一 proposal/明确 refs 显式 supersede 旧 item 时才更新；否则不能静默删除旧规则或
假设新规则覆盖旧规则。Validator 继续只验证 deterministic contract，不假装判断语言真值。

### Decision and action-safety routing

普通 explicit Decision 默认 Lazy，但以下边界必须分开：

```text
Decision only affects later planning
-> Hot Raw + lazy compilation

Decision is required by the next formal Attempt
-> targeted_on_demand commit before executable Snapshot

"stop/cancel plan A" before ActionStarted
-> immediate Constraint may block future dispatch
-> operation cancellation contract may mark cancelled-before-dispatch

Action has crossed ActionStarted
-> State Authority commit cannot undo possible side effect
-> Interrupt / cancellation / reconciliation contract applies
```

Authority 不等于 Interrupt。Fast Constraint 只能约束尚未发生的后续行为；已经可能发生的外部
效果必须由 stable action identity、durable lifecycle 与 Host/Executor reconciliation 处理。

也不得为了让 Decision 立即生效而伪造永久 Constraint。只有它确实表达“下一步必须/禁止怎样
行动”时才可产生独立 Constraint；长期方案记录仍由 Decision proposal/lifecycle 管理。

### Future ablation direction

在同一 frozen Raw/State/operation world 比较：

```text
F0 = existing eligible Immediate Authority policy
     including explicit Constraint/revocation/final Decision

F1 = automatic immediate only for explicit Constraint create/supersede
     + Decision lazy by default
     + targeted-on-demand when a formal Attempt requires it

F2 = no automatic Fast Path
     negative control; current input/Raw only
```

现有 capability 在 promotion 前保留为 compatibility/shadow comparator。至少覆盖：

```text
explicit no-write directory constraint immediately before Tool use
mandatory independent QA rule
exact revocation of one active Constraint
ambiguous "cancel that rule" with multiple candidates
quoted / hypothetical / negated / sarcastic prohibition
same-Event and next-Event self-correction
scope-limited "only in tests do not modify X"
ordinary final Decision with no immediate action
final Decision required by the next Tool/Attempt
new candidate conflicting with an active Constraint
State revision race during immediate commit
producer/commit failure before executable Attempt
stop Event before versus after ActionStarted
subtask/Snapshot missing optional Raw but retaining committed P0 Constraint
```

指标至少包含：

```text
false_constraint_activation
missed_explicit_constraint
constraint activation latency before Snapshot/Attempt
constraint supersession/revocation latency
stale_constraint_after_revoke
ambiguous_target / conflict rate
Decision authority commit delay
targeted_on_demand rate / success / latency
unsafe Tool dispatch
State revisions / Context tokens / producer calls
```

第一阶段使用 fixed event/state/operation fixtures 测 proposal与 dispatch eligibility，不调用远端
模型。未来若评估 rule/model producer，必须固定 input/provider/model/prompt/fresh-session，并把
producer semantic correctness 与 State/Attempt mechanical correctness 分开。

### Promotion and stop conditions

- F1 保留 Constraint create/revocation safety，Decision delay 可由 Current Input/Hot Raw/
  targeted-on-demand 吸收，并降低 producer branches/model calls：可提议 future default；
- F1 导致 required Decision 未在 dispatch 前结构化：修复 required targeted-on-demand trigger，
  不直接恢复所有 Decision automatic fast path；
- false/missed Constraint 任一 critical Gate 未通过：保持现有 policy，不 promotion；
- revocation 无 exact target、存在语义冲突或 scope 不明：DEFER，不扩大 detector intelligence；
- 已发生副作用问题被错误归因于 State：返回 Interrupt/Action lifecycle，不扩大 Fast Path；
- 要求删除 existing `immediate_authority` capability 或改变 Canonical State v1 grammar：另开
  Architecture Contract/policy-version work order，不由本登记隐式授权。

## DA-14 — Exact State Item Identity + No Semantic Authority Merge

- **Status:** ACCEPTED FOR DOWNSTREAM PLANNING
- **WO-04C impact:** NONE
- **Future routing:** 独立的 State identity / Extractor / Authority Producer 工单；WO-05 可选择性
  测试 exact-render projection dedup。详细 Scope binding 留给下一项裁决。

### Accepted direction

Canonical State item identity 只由精确键决定：

```text
(scope.namespace, scope.stream_id, item_id)
```

必须分开三类 identity：

```text
state_commit_id
-> Authority commit 的幂等 identity

item_id
-> 一个 Canonical State item 的持久 identity

producer / extraction-run / candidate identity
-> Authority 之前的临时 orchestration identity
```

Core / deterministic Reducer 不做 semantic identity inference，也不做 semantic dedup。系统只在
以下情形自动认定“同一个 item”：

1. exact scoped `item_id` binding；
2. 同一个 captured commit/proposal 的 exact retry。

现有 Canonical State v1 继续保持 `proposal.upsert_items[]`、kind-specific lifecycle status 与 no
delete。DA-14 不新增通用 `MERGE`、`DEDUP`、`RECONFIRM` 或其他 Canonical State operation。

### Producer outcomes before Authority

未来 producer/orchestration 可在 Authority 之前产生有界结果，但这些不是 State operations：

```text
REFERENCE_EXISTING
-> 输入中有 exact existing item_id

CREATE_CANDIDATE
-> 独立新 candidate；不允许模型发明或复用 canonical item_id

RECONFIRM_EXISTING
-> exact-bound item 的重复确认；默认 NO_PROPOSAL
   Raw Event 保留，不制造无意义 State revision

AMBIGUOUS_IDENTITY
-> DEFER，不猜测
```

新 canonical item ID 必须由 deterministic、replayable orchestration 分配，输入至少包含 explicit
scope、durable producer/extraction-run identity 与 stable candidate key。模型不得自行分配、选择或
复用 Authority ID。只有 exact ID 已在 frozen input/current State 中时才允许 update existing item。
State revision race 必须 CAS fail；不得把 stale proposal 自动补丁到较新 State。

例如已有 `C17: 禁止修改 architecture`，后来出现“架构还是先别动”：

```text
exact binding + mere reaffirmation
-> RECONFIRM_EXISTING -> NO_PROPOSAL

exact binding + material change
-> upsert existing C17

no exact binding
-> AMBIGUOUS_IDENTITY -> DEFER
```

### Scope precedes identity

- 先解析 Scope，再解析 item identity；
- 禁止 cross-scope dedup、merge 或 identity reuse；
- 相同或相似文字出现在不同 task/project/session/stream，不证明它们是同一个 item；
- DA-14 不通过 similarity rule 偷偷定义 Scope；详细 binding contract 留给下一项。

### Semantic similarity is diagnostic only

Embedding、lexical similarity 或 LLM 只能在 shadow 中输出 non-authoritative
`possible_duplicate` diagnostic，绝不得据此：

- merge items 或复用 item ID；
- 改变 lifecycle；
- 重写 provenance；
- 修改 Authority。

false merge 比 duplicate retention 更严重：前者会破坏 Authority、provenance 与 lifecycle；后者
主要增加 storage/Context cost，且以后可以显式修复。因此 canonical duplicates 默认不自动合并。

### Optional projection-only exact dedup

Context projection 未来只可测试一个极窄的 deterministic optimization：

```text
same explicit scope
+ same kind/status
+ byte-equal normalized rendered content
-> render once
-> Snapshot Manifest 仍保留全部 exact Authority refs
```

禁止 near-duplicate、paraphrase 或 semantic folding。Projection dedup 只改变展示，不改变
canonical identity 或 State。

若未来确需 canonical consolidation，必须另行定义显式操作，并提供 exact survivor IDs、exact
duplicate IDs、exact Raw refs、expected State revision 与合法的 kind-specific lifecycle
transitions；不得隐式引入 delete 或通用 `MERGED` status。

### Future comparison direction

```text
I0 = exact scoped item_id only; no semantic dedup

I1 = exact existing-ID binding
     + deterministic new-ID allocation
     + reconfirm -> NO_PROPOSAL
     + ambiguous -> DEFER
     + optional exact-render projection dedup

I2 = embedding/LLM semantic auto-merge
     negative / experimental comparator only
```

至少覆盖：explicit repeated Constraint、similar text in different scopes、same text in different
tasks、scope narrowing/broadening、Decision 与 Constraint 相似内容、explicit correction、same Raw
reprocessing、one Event producing multiple items、identical text with intentionally distinct IDs、terminal
old item beside new active item、State revision race、crash/retry/reopen，以及 projection exact dedup
仍保存全部 refs。

指标至少包含：

```text
false_merge
duplicate_active_items
unnecessary_reconfirmation_revisions
identity_stability across retry/reopen
ambiguous_identity_defer_rate
context_duplicate_tokens
provenance / lifecycle corruption
```

`false_merge` 是 critical zero-tolerance fixture failure。优先使用 projection-only dedup 或显式
consolidation，而不是 semantic Authority merge。若只有 I2 能减少重复，仍保留 I0/I1，等待更强
证据，不以减少 token 为由接受 Authority corruption 风险。
