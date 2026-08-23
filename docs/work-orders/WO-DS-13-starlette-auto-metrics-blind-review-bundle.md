# WO-DS-13 — Starlette 自动 Gate 指标与人工盲评包

状态：PLANNED — no implementation yet

## 背景

WO-DS-11 已冻结六案、12 slices、8 个 provenance-bound context Probe 与 answer rubric；WO-DS-12 已在独立 re-QA commit `30e44261c119e03390fd1b7d5af6b480fe2d5180` 接受 36 个未评分 GPT-5.6-terra answer capture。架构 scope commit `ca62440b8843fef3961c1383c466227b744b65a9` 进一步固定 v0 只验证 State Compilation，不实现 PACE / Evidence Paging / Experience。

本工单不再调用模型，不修改 frozen data/protocol/prompt/raw answers，也不使用模型 judge。它只生成“自动可判部分 + 供两名真实人类判定的 condition-blind 部分”。

## 单一结果

> 对 frozen 12-case evaluator-v2 suite 做一次本地自动运行，保存 context correctness/cost/latency 原始结果；同时把 36 个已接受 raw answers 转成不泄露 D0/D1/D2 条件的人工 review bundle 与空白评分模板。自动指标与人工语义 Gate 明确分离。

## 固定输入

- atomic freeze QA：`8b6512098072a1c4af661a82a45bde2ee1ae7876`；
- answer capture source：`18a332fd06d7ebdfc8c0007ae1e9250db14c82cf`；
- answer capture re-QA：`30e44261c119e03390fd1b7d5af6b480fe2d5180`；
- `raw-responses.jsonl` SHA-256：`1b574d4c1843a283d088cc641523855e78135516545a264c4fe48d5e059a4910`；
- protocol SHA-256：`21fc57bb02a67868965475dab82347fb5abde0fb2eb2a0c8fd3b71f24c58c3f0`；
- 固定 6 cases / 12 slices / 101 history turns / 8 exact Probe / 42 required / 16 forbidden / 38 critical；
- D2 使用人工 Oracle-State typed-state upper bound，无 extractor、headline 或 recall。

任何 canonical data、slice、Gold、Oracle、Probe、rubric、prompt、answer 或 condition mapping 改动都必须拒绝，不能重算当前结果吸收。

## Part A — 自动 evaluator-v2 原始结果

使用现有 `buildProtocolCanarySuite` 构造 frozen suite，并恰好一次调用现有 `runEvaluationSuiteV2`。不新增 evaluator policy、权重或阈值。

保存：

- 完整 version-2 report；
- 每 slice D0/D1/D2 estimated token；
- 8 个 exact Probe 的 constraint / decision / open-question carry-through；
- aggregate D0/D1/D2 原始 token 与 D2-vs-D1 delta/ratio；
- observed local latency；
- resolved context `not_evaluable` 与 overall `passed` 非决策说明；
- `evaluation_run_count:1`、`model_call_count:0`、`semantic_score_count:0`。

解释顺序遵守 v0 Gate：

1. 先报告可自动判定的 lexical correctness；空 Probe 不计成功；
2. correctness 不满足时，不用 token reduction 掩盖；
3. context cost 只报告原始值；
4. latency 是本机单次 observation，不作为跨平台稳定性证明。

8 个 exact Probe 只是表示中立的 lexical carry-through 子集。19 个 `not_exactly_scorable` 历史依赖和 answer correctness 仍必须等待人类 review，不能由自动 8/8 替代。

## Part B — condition-blind 人类 review bundle

在 `evaluation/starlette-v1/results/feasibility-01/` 生成：

- `review-items.jsonl`：36 条 condition-blind item；
- `review-key.json`：内部 review-id→packet/case/slice/condition 映射，不能交给 reviewer；
- `reviewer-form-a.jsonl`、`reviewer-form-b.jsonl`：两份相同顺序的空白独立评分表；
- `adjudication-template.jsonl`：只供两名 reviewer 发生分歧后使用；
- `automatic-report.json`、`automatic-summary.json`；
- hash manifest、validator、focused tests 与中文 README。

每个 review item 只包含：

- 与 condition 无关的 opaque `review_id`；
- Current Task；
- 原始 answer 字符串；
- 该 slice 预注册的 required / forbidden / Critical-Miss checklist；
- provenance source id 供人工核对；
- 固定判定说明。

公开 reviewer bundle 禁止出现 `d0` / `d1` / `d2`、condition、packet id、context token、assembler/state/raw-window 等可推断条件的元数据。review order 由预注册 SHA-256 blinding domain 排序，不按答案或条件调整。

## 人工判定合同

两名真实人类 reviewer 必须各自独立填写：

- required item：`met | missed | uncertain`；
- forbidden item：`not_asserted | asserted | uncertain`；
- critical miss：由预注册 critical id 与上述判断机械派生；
- comments：可选，但不能改 rubric。

任何 `uncertain` 或 reviewer 分歧都进入人工 adjudication；不得由模型代判。空白 template、自动生成 bundle 与独立 QA 都不是人类评分。

在两份完成的 reviewer form 返回并经独立 scoring 工单验收前：

- 不解盲；
- 不输出 condition-level answer correctness；
- 不声称 D2 优于 D1；
- 不计算综合加权分数；
- 不用 36 个相关 observations 冒充独立总体样本。

## Validator 与测试

至少验证：

- 固定 Git-object input/raw/protocol/rubric identity；
- evaluator 真实只运行一次，report version/12 cases/8 Probe 与输入一一对应；
- token 算术、D2-vs-D1、not-evaluable 与 non-decision 状态；
- 36 review item 对应 36 accepted raw answers，原文/hash 不变；
- public bundle 无 condition/packet/context-format 泄漏，review id/order 唯一且固定；
- 两份 form 初始完全空白、同序、互不含对方判断；
- internal key 完整一对一且不能进入 public bundle；
- mutation 覆盖 answer/rubric/condition mapping、swap/duplicate/omission/order/hash 自举、review-id、future/unknown/symlink/Unicode format-control；
- 不存在模型调用、model judge、provider、PACE、semantic retriever、core/policy 修改；
- focused、`npm test`、protocol、build、diff check 与隔离 pack。

## 明确不做

- 不调用 GPT-5.6-terra 或任何模型；
- 不新增 answer、retry 或 repetition；
- 不让 Agent/模型/QA 填 reviewer form；
- 不修改 Context Compiler core、retrieval/assembler policy 或 evaluator；
- 不实现 PACE / Evidence Paging / semantic scorer / Experience；
- 不补 medium、不换案、不改 Probe/rubric/Gold；
- 不生成最终 D2-vs-D1 语义结论。

## Gate

Builder 提交中文 handoff 后必须由独立 QA 验证自动结果与 blinding。QA PASS 只表示“自动结果与人工评审包可交付”，不表示人工 Correctness Gate 已通过。

下一步必须等待两名真实、condition-blind 人类返回独立评分。若无法获得两名人类，项目应明确记录该外部 blocker，而不是用模型替代。

