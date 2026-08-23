# WO-DS-14 / ST-02 Empty-State Scoring — Builder 交接

日期：2026-08-23

状态：**SCORED — PENDING INDEPENDENT QA**

## 本次有界结果

本次没有调用模型、没有重跑或修改 `bcce004f63b446d4bea4036f0ebfac771aff3137` official capture，也没有读取/修改 `feasibility-01`、Gold、core 或 PACE 类能力。对抗审查指出 Predicted State 全程为空后，Builder 没有实现没有 official 执行机会的通用 matcher，而是先冻结独立 empty-state scoring contract，再实现只读 scorer。

评分器在解析 current capture / Gold JSON 前依次验证：

- 独立前置 scoring contract commit、parent、blob、SHA 与 current bytes；
- capture commit `bcce004…`、parent `9229eef…`、packets tree `f911a4e…`、capture tree `4d5337f…` 的闭合路径、普通文件与 current bytes；
- current `runtime.ts` 与 capture commit 中固定 blob 一致；
- accepted Gold data commit `79da83d…`、parent、Gold tree `7224a2b…` 的闭合路径、普通文件与 current bytes。

随后从 30 个原始 response fresh 执行零模型 source-only replay，并要求结果与固定 `source-only-replay.json` 逐对象一致。scorer 不写文件、不使用 provider/network，不读取 invalid raw text 做补充语义评分。

## 原始结果

互斥 primary outcome 恰好覆盖 30 step：

- `parse_failure_with_empty_fallback`：12；全部为 `INVALID_SCHEMA`；
- `strict_valid_empty_on_gold_nonempty`：16；
- `strict_valid_empty_true_negative`：2；
- reducer rejection / revision increment / predicted item / predicted relation：0 / 0 / 0 / 0。

状态指标：

- general unique recall：`0/35`；
- critical unique recall：`0/29`；
- checkpoint-weighted raw recall：general `0/253`、critical `0/192`；它只记录同一 Gold state 在时间 checkpoint 的重复暴露，不是 aggregate score；
- general / critical precision：`not_evaluable_zero_predicted_items`；
- matcher：`short_circuited_empty_left_set`，opportunity 0；unmatched / ambiguous 原始计数 0 不是 PASS。

Gold 结果层面 supersession / resolution 为 `0/6` / `0/7`。但前置 predicted item 从未建立，所以 capability eligibility 都是 0，状态为 `not_evaluable_precondition_absent`；这 13 项只列为 inherited downstream consequence，没有重复加为 primary Extractor error。四条 Gold dependency 与 53 条 Gold provenance 同理：endpoint/item eligibility 为 0，因此 dependency inconsistency、provenance failure 不能填 0% 或 100%。stale activation、wrong reactivation 也都是 incident 0 / eligible 0 / `not_evaluable`；`STR-06/E13` 只属于 strict-valid empty true negative。

次级 extractor input 观测为 25,328 字符、按每步 `ceil(chars/4)` 合计估算 6,343 tokens；每步 state item/relation 都是 0。它没有 D0/D1 比较，不能声称 Context Reduction。

## 测试设计挑战

- **Vacuous pass：** 所有 zero denominator 都用结构化 `not_evaluable`，没有把“什么都没输出”解释为 precision、matcher 或 lifecycle capability 成功。
- **Gold leakage：** capture 阶段 source-only；评分阶段才读取 Gold。Gold 是经接受的 standardized-summary 人工尺度，不是外部真实语义 oracle。
- **定义歧义：** preregistered anchor matcher 没有候选可运行；unmatched predicted item 的 criticality 也没有预注册定义，因此 critical precision 不可评价。
- **Evaluator 自证：** scoring contract、capture、Gold 分别锚定三个前置 Git object；focused test 已攻击协调改写、漏项、额外/重复路径、unknown、symlink 与非 NFC Unicode。独立 QA 仍须在固定候选上重复这些攻击。
- **Selection bias：** 只有三个 Starlette 轨迹、单模型/单 prompt capture，且短历史代表有限；不支持 provider comparison 或一般化。

## Builder 验证

- focused scorer：8/8 PASS；
- fresh no-model replay：30/30，与 fixed replay 完全一致；
- 全量 `npm test`：406 PASS / 1 个既有 opt-in official runner SKIP；
- protocol：8/8 PASS；
- `npm run build` 与 `git diff --check`：PASS；
- 真实 `npm pack --ignore-scripts`：50 files，SHA-1 `f20e56e75c6b6aa9d7362627101771a6c2ca4510`，不含 `evaluation/`、`docs/` 或 `test/`；protocol 测试同时从真实 tarball 复制依赖后执行 production-only prune，确认只有声明的 runtime dependencies 并启动真实 MCP；
- 环境：macOS / Darwin 25.5.0 arm64、Node.js 25.6.1、npm 11.9.0；Windows 与 exact Node.js 24 未单独复跑；
- 当前尚未把本交接当作独立 QA 接受。

独立 QA 需要独立复跑 focused / full / protocol / build / diff-check 与 isolated pack，并固定 Builder candidate。QA 不得调用模型、修改/重跑 capture 或把结果扩展为架构胜负。QA 完成后按 WO-DS-14 停止，不自动进入 Context Reduction、Operational Stability、PACE 或下一工单。
