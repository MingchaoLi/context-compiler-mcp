# WO-DS-14 / ST-02 独立 Data / Result QA

日期：2026-08-23

最终结论：**PASS — 接受 standardized-summary temporal replay 的 capture / replay / raw scoring 完整性；ST-02 Extractor correctness 实验结果为失败**

固定 Builder candidate：`423ae7cbe777c01b31dd0ec5629b1eb3255048c0`

固定直接父提交 / scoring-contract commit：`00a71dd55ab3fafb844fb44dfb584f1d8f7008f8`

## 接受结论与边界

本 QA 接受的是一次固定 30-step 回放的身份、零模型重放、原始误差统计和非空集解释，不是接受 Extractor 正确性。本次 capture 的三条 Predicted State 始终为空：35 个 accepted Gold semantic item 全部遗漏，其中 29 个为 critical；general / critical unique recall 分别为 `0/35` 与 `0/29`。因此本次 ST-02 Extractor correctness 实验结果为失败，不得由 QA PASS 推导为效果 PASS。

本结论只相对经接受的 Starlette standardized event summary + 人工 Gold 成立。它不评价 verbatim raw body、其他 prompt / model / provider、Context Reduction、Operational Stability、最终回答质量、D2-vs-D1，也不输出架构胜负或一般化结论。

## 身份、Git trust root 与字节边界

- QA 开始时为 `main@423ae7c…`，直接父为 `00a71dd…`，工作树干净；与交接值完全一致。
- official capture commit `bcce004f63b446d4bea4036f0ebfac771aff3137` 的父提交为 `9229eef89e0cddaf2d75f4a4a6ff7da633bb3591`；packets tree 为 `f911a4ee5d59b95f6cfbf029581637ac9668ed87`，capture tree 为 `4d5337f40846b05f6f566efd065abb1c82964ca3`。两棵树的闭合路径、`100644` 普通文件与 current bytes 逐字节一致；current `st02/runtime.ts` 也与 capture commit 一致。
- accepted Gold data commit `79da83d95aeac7162c95714f4f6f5eff1f9e0608` 的父提交为 `aeed861b3e3c538fbf6aa1393a5745fb4d61490b`，Gold tree 为 `7224a2b46d083e3f651ca3666778934af9b19f71`；闭合路径、普通文件与 current bytes 全部一致。ST-01 accepted QA commit `daa012c4d6f09919e798edc3771cf090bd5dd188` 在父链中存在。
- 独立前置 scoring contract commit `00a71dd…` 的父提交为 `4415f4bafb6d76fecde26ddef1e0060c6a666f84`；contract blob 为 `c461cad2fd310e044dce844c15cd481c3ac7d346`，SHA-256 为 `b406bd5198801d9968fb9c78597f60489e73efc84866151cd2a61be1d72be9c9`，current bytes 一致。scorer 在解析 capture / Gold 前先验证该前置 contract。
- Builder report 与 scorer 源码不是运行时自证 trust root；它们由本 QA 外部固定的 `423ae7c…` 候选身份、当前 blob 一致性和 clean-tree 前置保护。scorer blob 为 `d8bdc5a3ee48a734a6b4072698aa59926effe136`，report blob 为 `a5e54d8c576cd3c419603dca438f3e9c371a536c`。不把“可执行代码自行宣告没被改”冒充为运行时不可变证明。

## official capture 独立零模型重放

QA 直接从 30 个固定 raw response 用现有 `StrictStateExtractor(maxAttempts:1)` 与同一 reducer 重放，没有调用模型、provider、network 或 evaluator：

- 30 packet / response / metadata / ledger 一一对齐，packet id 唯一，ledger 中 30 个 collaboration session id 唯一；prompt/raw-response SHA-256 全部与 metadata 一致。
- 记录的运行条件为 `gpt-5.6-terra` / medium / `fork_turns:none` / fresh session / attempt 1，tools/network/repository access 均为 false；这是固定 capture provenance，不是 QA 新增的 remote call。
- fresh source-only replay 得到 30 processed：18 strict-accepted empty Delta，12 `INVALID_SCHEMA` + empty fallback，0 `INVALID_JSON`，0 `INVALID_REFERENCE`，0 reducer rejection，0 revision increment。
- 三个 case 的 predicted item / relation 从始至终均为 0；replay 与固定 `source-only-replay.json` 逐对象一致。`0 reducer rejection` 只是空 Delta / fallback 后的观测，不是 Operational Stability 证据。

## 独立重算的原始结果

30 个 primary outcome 互斥且穷尽：

- `parse_failure_with_empty_fallback`：12；
- `strict_valid_empty_on_gold_nonempty`：16；
- `strict_valid_empty_true_negative`：2，仅 `STR-06/E7` 与 `STR-06/E13`。

独立从 semantic registry / Gold Delta / checkpoint 重建的分母与 Builder report 完全一致：

| case | steps | primary 12/16/2 分布 | unique general / critical | checkpoint exposure general / critical | Gold supersession / resolution / dependency |
| --- | ---: | --- | --- | --- | --- |
| STR-08 | 4 | 2 / 2 / 0 | 6 / 5 | 15 / 13 | 1 / 1 / 1 |
| STR-07 | 10 | 3 / 7 / 0 | 13 / 12 | 79 / 71 | 1 / 3 / 0 |
| STR-06 | 16 | 7 / 7 / 2 | 16 / 12 | 159 / 108 | 4 / 3 / 3 |
| 总计 | 30 | 12 / 16 / 2 | 35 / 29 | 253 / 192 | 6 / 7 / 4 |

- general / critical unique recall：`0/35` / `0/29`；checkpoint-weighted raw exposure recall：`0/253` / `0/192`。后者只是重复暴露计数，不是 aggregate score。
- general / critical precision 的 predicted denominator 均为 0，正确标记 `not_evaluable_zero_predicted_items`，没有伪造 0 或 1 的 rate。
- matcher opportunity 为 0，状态为 `short_circuited_empty_left_set`；`unmatched=0` 与 `ambiguous=0` 只表示没有候选，不是 matcher PASS。本交付没有实现通用 matcher。
- Gold 结果层 supersession / resolution 为 `0/6` / `0/7`；但 capability eligibility 都为 0，13 项均为 `inherited_precondition_absent` 的下游后果，没有重复计为 primary Extractor error。
- stale activation、wrong reactivation、dependency inconsistency、provenance failure 均为 incident 0 / eligible 0 / `not_evaluable`。四条 Gold dependency 与 53 条 Gold `DERIVED_FROM` 仅作未实现结果的原始背景，不得冒充能力成功率。
- `STR-06/E13` 只是 strict-valid empty true negative；因前态根本没有 tombstone，它不是“成功避免 wrong reactivation”。
- 29 个 critical Gold key 均列为 unique Critical Miss。没有用 checkpoint 重复暴露放大 unique miss 数。
- 次级输入观测为 25,328 个 JavaScript UTF-16 字符，按每步 `ceil(chars/4)` 合计估算 6,343 tokens；无 D0/D1/D2 对照，不构成 Context Reduction 结论。

## 对抗攻击与不可自证复核

- focused 攻击将 response + metadata + replay + manifest 协调改写，仍在 capture fixed-tree current-byte 边界、且在 JSON parse 前拒绝。
- scoring contract 内部分母与 Gold semantic/delta 协调改写，分别在前置 contract blob 和 accepted Gold tree 边界拒绝；不依赖 current hash 清单自证。
- missing / extra / duplicate path、unknown filesystem entry、symlink、non-NFC Unicode 均 fail-closed。order / case / denominator / step classification 的任一 current-byte 修改也会先命中固定 contract/capture/Gold 边界；QA 另行独立对齐 30 个 ordinal / event / step / case / primary classification，零差异。
- 修改 report 或 scorer constants 不是由 scorer “自我证明”拒绝；它会使 current blob / clean tree 不再匹配本 QA 外部固定的 `423ae7c…`，因而在独立 QA 候选身份门前被拒绝。这一信任边界已显式披露，没有用可同提交改写的 hash 冒充外部 trust root。

## 范围与工程回归

- candidate 相对 capture commit 没有修改 `src/`、package surface、source/Gold、packet/capture/runtime 或 `feasibility-01`；没有 PACE、Evidence Paging/Retrieval、Experience、embedding、新 provider/network/evaluator 或通用 matcher。
- focused scorer：8/8 PASS。
- 全量 `npm test`：406 PASS / 1 个既有 opt-in official runner SKIP。
- `npm run test:protocol`：8/8 PASS，包含真实 tarball + production-only 依赖的 stdio MCP 启动验证。
- `npm run build` 与 `git diff --check`：PASS。
- 真实隔离 `npm pack --ignore-scripts`：50 files，SHA-1 `f20e56e75c6b6aa9d7362627101771a6c2ca4510`；tarball 不包含 `evaluation/`、`docs/` 或 `test/`。首次 pack 因用户 npm cache 的现有权限错误失败，改用 `/private/tmp` 独立 cache 后通过，未修改用户 cache。
- 环境：macOS / Darwin 25.5.0 arm64，Node.js 25.6.1，npm 11.9.0；Windows 与 exact Node.js 24 未单独复跑。

## 测试设计挑战与停止点

- **Vacuous pass：** 本次只有 recall 存在正分母；precision、matcher 与 lifecycle/relationship capability 均保持 `not_evaluable`。“没有输出错误 item”不是成功。
- **Gold leakage：** capture 运行时为 source-only，Gold 只在固定 capture 后评分。但 Gold 仍是 standardized summary 上的人工尺度，不是外部语义 oracle。
- **定义歧义：** preregistered lexical matcher 在空 predicted set 上完全没有执行机会；unmatched predicted item 的 criticality 也没有预注册定义。未来如出现非空预测，须在新结果前单独冻结 matcher 与 ambiguity 尺度。
- **Evaluator 自证：** 三个前置 Git object 降低了输入协调改写风险，但 scoring contract 是看到 capture 为空后才冻结的 empty-state 口径，不是效果预注册；本 QA 的独立重算是接受结果所必需的外部证据。
- **Selection bias：** 仅 3 条 Starlette 轨迹、单模型、单 prompt、单次 capture，且 short-history 代表有限；不支持 provider comparison 或一般化。

WO-DS-14 至此按工单完成并停止。未授权自动进入 Context Reduction、Operational Stability、prompt/schema 修复、新模型重跑、PACE / Evidence / Experience 或任何下一阶段。
