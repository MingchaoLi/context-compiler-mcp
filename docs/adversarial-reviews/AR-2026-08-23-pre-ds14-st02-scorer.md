# AR-2026-08-23：WO-DS-14 / ST-02 scorer 预实现审查

- 审查基线：`main@bcce004f63b446d4bea4036f0ebfac771aff3137`，开始时工作树 clean。
- 边界：只读审查 frozen Gold、ST-01/Run-Gate QA、official capture 与 source-only replay；未运行模型，未修改 core、Gold 或 capture。
- 独立性：ST-01 QA 证明 reducer 对 accepted Gold 的机械一致，Run-Gate QA 证明运行合同边界；两者都没有预先证明后置 scorer 的分母、匹配或错误归因正确。

## Verdict

**Challenge。** 不应为当前 official capture 直接实现完整通用 exact-anchor matcher/scorer。capture 的三个 Predicted State 始终为空，匹配图必为空；通用 matcher 不会改变任何 official 数值，却新增足以事后定义 precision、transition attribution 与“0 incident”解释的代码面。更小且可信的下一步是一个 Git-anchored **empty-state outcome report**：先独立复验 capture/replay，再按预注册非空分母报告 recall 与 primary step outcome，把无预测候选或缺前置状态的维度明确写为 `not_evaluable`。

**事实：** official replay 为 30 responses、18 strict-accepted empty Delta、12 `INVALID_SCHEMA` empty fallback、0 reducer rejection、0 revision increment，三个 case 的 state 全程为空（`evaluation/state-replay-v0.1/st02/capture/source-only-replay.json`；`docs/handoffs/WO-DS-14-st02-capture.md`）。Gold 有 35 个唯一 semantic items，其中 29 critical；28 个 non-empty Gold step 与 2 个 empty true negative。Gold transition coverage 为 6 supersessions、7 resolutions、4 dependencies、53 `DERIVED_FROM` relations（`evaluation/state-replay-v0.1/gold/semantic-items.json`；`evaluation/state-replay-v0.1/gold/transition-coverage.json`）。

**推断：** 当前结果足以证明本次 extractor/prompt 合同没有建立任何 state，不足以分别识别“能否维持/转换已正确建立的 state”。把所有后续 lifecycle/relationship 缺失再计作独立 extractor failure，会对同一上游 creation miss 重复归因；把零 incident 写成零错误率，又会得到相反的 vacuous success。

## Strongest challenge 1：全空预测下 precision 和 matcher 结果不能填 0 或 1

**事实：** 35 个 Gold item 中 29 个是 critical；Predicted item、Predicted relation、可匹配边均为 0。冻结规则“同 type + 全部 normalized anchors、一对一、无歧义边”在空左侧集合上无需执行文本比较；`unmatched predicted=0`、`ambiguous=0` 只是没有候选，不是 matcher 正确。

**具体反例：** 若 critical precision 定义为“matched critical / predicted items that matched a critical key”，分母为 0；若只在 matched items 中计算，则任何没有输出的系统都能得到 1 或被静默跳过 false positive。若把 0/0 写成 precision=0，又把“没有产生错误 item”和“产生了 item 但全错”混成同一结果。

**可执行修订：** scorer schema 应固定以下语义，不允许用数值填空：

- `critical_unique_recall = 0 / 29`；`general_unique_recall = 0 / 35`。逐 step 也报告 `0 / gold_items_at_step`，不得只给 pooled 平均；
- `critical_precision.status = not_evaluable_zero_predicted_items`，不产生 rate。更根本地，未定义 unmatched predicted item 的“criticality”前，不应建立 critical precision 公式；
- `general_precision.status = not_evaluable_zero_predicted_items`，同时保留 `predicted_item_count:0`；
- `unmatched_predicted_count:0`、`ambiguous_match_count:0`，另写 `matcher_opportunity_count:0`、`matcher_execution_status:short_circuited_empty_left_set`；禁止标成 matcher PASS；
- raw invalid response 中即使出现接近 Gold 的自然语言，也不得绕过 strict fallback 进入匹配；该信息只属于未评分 transport text。

## Strongest challenge 2：transition 与 provenance/relationship 必须区分“未实现”与“能力不可评价”

**事实：** 所有 Gold lifecycle 的前置 item 在 Predicted State 中从未建立。E13 的 Gold 是 empty Delta negative control；Gold 说明它不应重新激活已负向解决的问题，但 predicted state 里根本没有该 tombstone。四条 Gold dependency 的 source/target、53 条 Gold provenance 的 state source 也都不存在。

**具体反例：** STR-08/E4 期望 supersede manual-portal Decision 并 resolve lifespan question。因为 E1/E3 已先漏建两项，E4 没有可供模型更新的 opaque id。若同时记为早先两个 creation miss、E4 missed supersession、missed resolution、provenance failure 和 recall miss，就是把同一空状态扩成五类“独立错误”。反之，报告 E13 `wrong_reactivation=0` 会暗示 extractor 成功保留 tombstone，实际上 tombstone 从未存在。

**可执行修订：** 报告必须同时给“Gold 结果未实现”和“本 capture 是否真正提供该能力机会”，并冻结下列 eligibility：

- `gold_transition_realized`：supersession `0/6`、resolution `0/7`，作为**结果覆盖**事实；每项另标 `causal_attribution=inherited_precondition_absent`；
- `transition_capability_evaluable`：只有 pre-step 存在唯一匹配的 predicted source，且所需 target 在 pre/post step 可唯一匹配时才 eligible。当前 supersession/resolution eligible 均为 0，故 capability rate `not_evaluable`，不能另计 13 个 primary extractor errors；
- `stale_activation`：只有 predicted item 唯一匹配到 Gold non-active item 时 eligible。当前 incident=0、eligible=0、status=`not_evaluable`；
- `wrong_reactivation`：只有 pre-step 有唯一匹配 tombstone，post-step 出现同 key ACTIVE/OPEN 时 eligible。E13 前无 tombstone，因此 incident=0、eligible=0、status=`not_evaluable`；E13 只能记作 strict-valid empty Delta 的 1 个 true-negative step；
- `dependency_inconsistency`：只有 predicted source 与 target 都唯一匹配时 eligible；缺任一端点是 inherited state miss。当前 incident=0、eligible=0、status=`not_evaluable`，不能把 4 条 Gold edge 逐条再算独立 extractor error；
- `provenance_failure`：只有已创建/更新且唯一匹配的 predicted item或 relation 才 eligible。当前 incident=0、eligible=0、status=`not_evaluable`；不得把 53 条 Gold `DERIVED_FROM` 全部重复算 provenance failures；
- 一个 step 的 **primary outcome** 必须互斥：12 `parse_failure_with_empty_fallback`；16 `strict_valid_empty_on_gold_nonempty`；2 `strict_valid_empty_true_negative`。state/lifecycle/relation divergence 另列为 downstream observations，不参与 primary-error 求和。

## Strongest challenge 3：Gold/capture 信任根和“对 accepted Gold 的一致”必须限制声明

**事实：** ST-01 re-QA 不只是信任 Builder report：它从固定 `79da83d…` data object 独立重建 30-step ledger，并人工审计四条保留 dependency；首轮延迟关系 P1 被删除后才接受。这显著降低 checkpoint 由 Delta 现场自证的风险，但 Gold/critical labels 仍是同一 standardized-summary 任务的人工尺度，不是外部真实语义 oracle。当前 capture 则首次出现在 `bcce004…`；run manifest、responses、metadata、ledger 与 replay 尚没有位于该提交之后的独立 capture anchor/QA。

**具体反例：** 若 scorer 只读取 current `run-manifest.json`，Builder 可同步修改 raw response、metadata digest、source-only replay、manifest 与 scorer 常量，使“30 empty state”自洽通过。Run-Gate 对固定 contract 的 `8d31cb6…` anchor 不能自动固定后来才产生的 capture bytes。

**可执行修订：** scorer 读取任何 current capture JSON 前，必须把 `bcce004f63b446d4bea4036f0ebfac771aff3137` 当外部 accepted capture candidate，固定其 parent `9229eef89e0cddaf2d75f4a4a6ff7da633bb3591`、packets tree `f911a4ee5d59b95f6cfbf029581637ac9668ed87`、capture tree `4d5337f40846b05f6f566efd065abb1c82964ca3`，并要求 current 闭合 path allowlist、普通文件、bytes 与 Git tree 一致。独立 QA 应在无模型隔离副本中从 30 raw responses 重放 runtime，复得 18/12/0/revision 0，并攻击 response + metadata + replay + manifest + scorer 常量的协调改写。

Gold/scorer 同理必须锚定 ST-01 accepted data/QA Git objects；最终措辞只能是“相对 accepted standardized-summary Gold 的结果”。不得把 0 recall 直接扩大成 verbatim raw-body extractor、所有 State Compiler、其他模型或架构的普遍结论。

## Cheaper path

不实现通用 exact-anchor matcher，先交付一个 **empty-state outcome report**，其单一结果为：

1. 固定并独立重放 capture identity、strict parse/fallback 与 revision/state 空值；
2. 从 accepted Gold 直接列每 case/step 的 Gold item 数、critical 数及 unique 35/29 denominator；
3. 输出上述 recall 数值、precision/transition capability/stale/reactivation/dependency/provenance 的结构化 `not_evaluable` 原因；
4. 输出 12/16/2 互斥 primary outcomes，以及 Gold lifecycle “0 realized + inherited precondition absent”明细；
5. 不创建 threshold、aggregate、winner，不解释 raw invalid text 的潜在语义，也不实现未来复用的通用匹配框架。

这条路径比完整 matcher 更小，却完整报告了当前 capture 能支持的全部可信结论。若未来出现非空 predicted state，再另开工单在看不到新结果前冻结 matcher normalization、bipartite assignment 与合成 ambiguity/mutation fixtures；不要为本次空集提前实现。

## Falsification

### 可推翻拟议 scorer 判断的证据

- 任一 precision 在 predicted denominator=0 时输出 0 或 1；或 `unmatched=0/ambiguous=0` 被写成 matcher PASS；
- E13 被记为 successful wrong-reactivation avoidance，或 dependency/provenance 写 0% error，而 eligibility 分母仍为 0；
- 6 supersession、7 resolution 同时被当作 13 个新的 primary extractor errors，且没有标记此前 state creation 已缺失；
- scorer 只依赖 current manifest/hash/源码常量，没有在 parse 前锚定 `bcce004…` capture Git tree；
- Gold comparison 被表述为真实 raw-body、架构或模型普遍结论。

### 会让我撤回 Challenge 的证据

- schema 对所有零分母输出结构化 `not_evaluable`，同时保留 raw incident count 与 eligibility count；precision、matcher、transition capability 都不能表达 vacuous PASS；
- primary outcome 12/16/2 互斥，downstream state/transition observations带因果标签且不重复求和；
- synthetic tests 至少覆盖：空 predicted、只有 unmatched extra、重叠 anchors 歧义、matched wrong status、缺 source/target dependency、无 tombstone 的 E13，以及有 tombstone 后真实 reactivation；
- scorer 在任何 current parse 前固定 capture 与 Gold 的先前 Git object，协调改写攻击 fail-closed，QA 无模型重放得到相同空状态；
- 实现只产 raw report、不设 threshold/aggregate/winner，并明确 standardized-summary Gold 边界。

### 可推翻本审查更小路径的证据

若只读复验发现任一步实际产生非空 Predicted State，或 official report 必须对非空 item 完成一对一归属才能确定任何当前结论，则通用 matcher 成为必要。当前 `source-only-replay.json`、30 raw responses 与 revision ledger 一致表明该条件不成立。
