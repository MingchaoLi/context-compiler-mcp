# AR-2026-08-23：WO-DS-14 终局对抗复核

- 复核基线：`main@ec82cfcdaa8ccd58471377251ddd77377e0f1a29`，开始时工作树 clean。
- 固定对象：Builder `423ae7cbe777c01b31dd0ec5629b1eb3255048c0`；scoring contract `00a71dd55ab3fafb844fb44dfb584f1d8f7008f8`；official capture `bcce004f63b446d4bea4036f0ebfac771aff3137`。
- 边界：复核工单、最终 QA、scoring report 与 scorer 预审；未调用模型或网络，未重跑或修改 capture，未修改代码、Gold 或状态文档。

## Verdict

**Agree with reservations。** 没有发现足以推翻 Data / Result QA 接受的 P0/P1。QA 接受的是固定实验链路、capture identity、零模型 replay 与原始算术完整性，并在标题、结论、限制及停止点反复把它与 **ST-02 Extractor correctness 明确失败** 分开；这一区分足够清楚。`ACCEPTED / COMPLETE` 只能理解为工单按预定完成并保留一个可信负结果，不能理解为 Correctness Gate、Extractor 能力或 State Compiler 架构已通过。

## Facts

- official capture 的三条 predicted state 全程为空：18 个 strict-valid empty Delta，12 个 `INVALID_SCHEMA` + empty fallback，0 revision increment、0 reducer rejection。30 step 的互斥 primary outcome 为 12 parse failure、16 valid-empty-on-Gold-nonempty、2 empty true negative。
- 有正分母的核心结果是 unique recall `0/35`、critical unique recall `0/29`；checkpoint exposure 为 `0/253`、`0/192`。报告明确把后者标为重复 checkpoint 暴露，不是 aggregate score。
- general / critical precision 分母均为 0；matcher opportunity 为 0；supersession、resolution、stale activation、wrong reactivation、dependency 与 provenance 的 capability eligibility 均为 0，全部结构化为 `not_evaluable`。Gold 结果未实现只另报 `0/6`、`0/7`，没有追加为 13 个 primary error。
- scoring contract 是在看到 capture 全空之后、scoring 之前冻结，状态明确为 `preregistered_after_capture_before_scoring`。capture、Gold、contract 分别锚定到三个既有 Git object；QA 又从固定 raw response 独立 replay、重算分母并攻击协调改写。
- 输入是经 Data QA 接受的 standardized event summary，不是 GitHub verbatim raw body；只有 STR-08/07/06 三条 Starlette 轨迹、单模型、单 prompt、单次 capture。

## Inferences

- 当前证据足以回答“这次固定 extractor/prompt 是否建立了可评分 state”：没有，并且失败幅度不是 vacuous 的，因为 recall 有 35/29 的正分母。
- 当前证据不能回答“若已建立前态，extractor 能否正确 supersede/resolve/保留 tombstone/关系/provenance”；这些维度的 `0 incident` 与 `not_evaluable` 不能当成功。
- standardized summary 可能把原始材料的歧义、噪声与信息发现成本先行消掉，但这不是本次 Gold 泄漏：固定 capture 的 packet 没有读 Gold，Gold 仅在 capture 后评分。它限制的是 construct validity 和外推范围。
- 候选内 scorer/report 不是自己的运行时信任根；最终可信度来自外部固定 Builder candidate 后的独立 QA。它仍不能把人工 Gold 提升成外部语义真值。

## Strongest challenge 1：`ACCEPTED` 标签仍可能在摘要层制造 vacuous pass

**具体反例：** 只引用路线图“WO-DS-14 — ACCEPTED / COMPLETE”，忽略同一段的“Extractor correctness 实验结果为失败”，会把 2 个 empty true negative、0 reducer rejection 或若干 `incident_count:0` 误读成 Correctness Gate 通过。实际上 28 个 Gold-nonempty step 没有一次建立 state，29 个 critical item 全失。

**判断：** QA 正文已经充分阻止这一推导，因此不是接受 blocker；风险位于后续引用和阶段推进。任何下一阶段若以“DS-14 correctness passed”为前提，应被拒绝，除非明确只指 ST-01 reducer conformance，而非 ST-02 extractor。

## Strongest challenge 2：zero eligibility 关闭了过度计分，却也意味着 lifecycle 能力完全未测

**具体反例：** `STR-06/E13` 的 predicted pre-state 没有 tombstone，因此 `wrong_reactivation incident=0` 不能证明正确保留负向状态；同理，E4/E5/E6 等 supersession 的 source 从未建立，`0/6` 只表示 Gold 终态没有实现，不能区分 transition 失败与上游 creation miss。若把这些零值计为成功是 vacuous pass；若再计为独立错误则是重复归因。

**判断：** report/QA 采用“Gold 结果未实现 + capability not_evaluable + inherited precondition absence”的双层表示，符合预审冻结条件。其代价是本实验只能得出 creation/strict-output 层面的强负结果，不能评价时间 lifecycle 机制。

## Strongest challenge 3：checkpoint exposure 与三轨迹选择不支持总体严重度或一般化

**具体反例：** 一个在早期创建并持续 16 个 checkpoint 的 key 可贡献 16 次 exposure miss，晚期 key 只贡献一次；把 `0/253` 与 `0/192` 用于加权总分会让轨迹长度和创建时点代替语义重要性。三条轨迹又是 4/10/16 step 的有意生命周期样本，无法代表全部六案、raw-body 输入、其他 provider/prompt 或生产分布。

**判断：** 本次所有 numerator 都为 0，所以重复暴露没有改变“全失”的方向；报告也明确不 aggregate、不设 threshold、不作一般化。因此它是解释限制，不是算术或接受 P1。若未来出现非零结果，checkpoint exposure 只能保留为诊断计数，不能在未预注册权重时进入胜负判断。

## Cheaper path

不存在比已经采用的 Git-anchored empty-state report 更小、又能同等可信地接受本次固定负结果的路径；预审建议的“跳过无机会运行的通用 matcher”已经落实。现在最便宜且必要的动作是停止并封存结果，不补 matcher、不重跑 capture，也不以本结果自动进入 Context Reduction 或 Operational Stability。

若主控以后决定继续 extractor 路线，最低前置不是扩展 scorer，而是另行版本化处置“为何 30 step 全空”（prompt/response schema compatibility 与 strict-valid empty 倾向），并在新结果出现前冻结新的合同；本轮数据只能用于诊断，不能作为修正后的无偏验证集。

## Falsification

### 会推翻本次 QA 接受的证据

- 固定 `bcce004…` raw response 无法无模型复得 18/12、全空 state 或 12/16/2 互斥分类；或 current capture/Gold/contract bytes 可在绕过固定 Git-object 边界后协调改写仍通过。
- 任一 packet/runtime 在 official capture 时读取 Gold、未来事件、Outcome/Oracle-State，或输入实际不是声明的 current-event-only standardized summary。
- QA 把 zero-denominator precision、matcher、transition/dependency/provenance 标为 PASS，或把 checkpoint exposure 当 aggregate/winner。
- 项目状态把“实验链路 ACCEPTED”表述为“ST-02 Extractor correctness PASS”或据此授权后续效果结论。

### 会让我撤回保留意见的证据

- 后续所有状态、路线图与决策记录持续使用“工单完成、Extractor 实验失败”的双重措辞，并把 ST-01 reducer conformance 与 ST-02 extractor correctness 分开。
- 若要主张 lifecycle 能力，新的预注册实验提供非空、唯一可匹配的 predicted 前置 state，使 supersession/resolution/tombstone/dependency/provenance 各有正 eligibility，且不复用本次已揭示结果作无偏验证。
- 若要外推到 raw-body、其他样本或 provider，使用相应来源输入、预注册样本和独立重复，而不是从三条 standardized-summary 单次 capture 推断。

### 会推翻本审查“无 P0/P1”判断的证据

若独立 Git-object 复验显示 scorer/report 的 35/29 或 253/192 分母并非由 accepted Gold 重建，或 QA 的 30-step replay实际依赖 Builder report而非 fixed raw capture，本 Verdict 应立即改为 **Challenge**。当前 QA 记录提供了相反的独立复验与攻击证据。
