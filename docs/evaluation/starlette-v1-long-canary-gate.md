# Starlette v1 STR-04 long/open canary 门禁报告

日期：2026-08-23

结论：**首轮 Builder 判断已被独立 QA 否决；STR-04 恢复为有限的 `no_public_hit_found`，canary 继续。**

本报告只回答 STR-04 是否仍有资格充当未污染 canary。它不是 Context Compiler 效果证据，也没有运行 D0/D1/D2、远端模型、aggregate 或 PASS rate。

## 先验分层校验

把“short 3–4、medium 5–8、long ≥9 个信息增量”机械应用到现有 pilot 后，STR-05 的 9 个事件都引入了新的问题、状态、实现、约束或评审结论，不能诚实排除任一事件来维持 medium。因此 STR-05 应归为 long，原计划的 2 short / 2 medium / 2 long 已失效。该结论在 contamination 结果出现前已追加到工单；没有从 reserve 自动补样。

## STR-04 来源预审

Issue #685 与 PR #1286、#1649、#2349 的公开一手来源能够形成超过 9 个真实增量：原始 route-name/APM 需求、middleware 先于 routing 的边界、两类早期替代方向、#1286 的推进与关闭、#1649 的 Mount 能力、#685 的过早关闭和重新打开、低接触 APM 约束，以及 #2349 的 Route/WebSocketRoute 部分能力。Issue #685 在复核时仍为 open。

因此“证据链不够长”不是此次停止原因。若没有污染，现有来源足以继续做 long/open canary 的人工规范化。

## 确认污染证据

同日对固定 source path 的公开 GitHub 索引复扫发现：

- 仓库：`Uniyalsumit/CT_PROJECT`；
- 固定提交：`c11a9ce776b73670789a8757c033ff11b115fa42`，提交时间 `2026-08-09T15:32:29Z`；
- 文件：`evaluation/results/ragas_results_test.csv`，Git blob `2009a996ff93ed468518f95e98a64ea2577f2448`；
- 该 CSV 的问题“Tell me about router changes.”所对应 contexts 含 Starlette 0.33.0 release note，其中明确包含 PR #2349 的 per-Route/WebSocketRoute middleware 变更；
- 同提交的 `evaluation/ragas_dataset.py` 把 RAG 的 question、answer、retrieved documents 组装为数据集；`evaluation/ragas_eval.py` 使用 RAGAS 的 faithfulness 和 answer relevancy 指标评价该数据集。

稳定证据链接：

- <https://github.com/Uniyalsumit/CT_PROJECT/blob/c11a9ce776b73670789a8757c033ff11b115fa42/evaluation/results/ragas_results_test.csv>
- <https://github.com/Uniyalsumit/CT_PROJECT/blob/c11a9ce776b73670789a8757c033ff11b115fa42/evaluation/ragas_dataset.py>
- <https://github.com/Uniyalsumit/CT_PROJECT/blob/c11a9ce776b73670789a8757c033ff11b115fa42/evaluation/ragas_eval.py>

Issue #685 的另一命中是普通 telemetry workaround；PR #1286 的命中是普通下游 middleware 源码；PR #1649 的命中主要是 release note、测试或复制源码。这些未单独标为 confirmed。关闭门禁只需要上面的 #2349 evaluation artifact。

## 为什么必须按 confirmed 处理

已冻结规则不是“公开任务必须要求修复同一个缺陷”，而是只要同一 issue 或 fix 被 LLM/evaluation task 显式复用即可确认。PR #2349 是预注册 STR-04 主线和 Outcome Anchor 的固定组成部分，且其内容确实作为 retrieved context 进入公开 LLM/RAGAS 评测；所以满足规则。

一种较窄解释是：该问答只泛问 router changes，PR #2349 只是检索上下文之一，未必影响答案，因而不应算任务级污染。这个解释在科学上可以讨论，但当前不能采用：它会在看到不利命中后改变纳入规则。若未来要采用，必须另开工单、事先重写统一污染规则，并对全部 15 条候选重新扫描，不能只豁免 STR-04。

## 停止结果

- 未创建 `evaluation/starlette-v1/canary/STR-04/`；
- 未修改 validator、projection、pilot case manifest 或 Context Compiler core；
- 未运行远端 GPT-5.6 或任何 D0/D1/D2 实验；
- 未选择 reserve 替代 STR-04；
- 只更新 contamination 记录及其 `pilot_not_frozen` hash；hash 仍只证明文件字节一致，不证明绝对无污染。

下一步不是继续制作数据，而是先由独立 data QA 复核：该文件是否确为 LLM/RAGAS evaluation artifact、#2349 是否确实进入 contexts、以及现有预注册规则是否必然导出 `confirmed`。QA 接受后，STR-04 canary 和原六案路径保持关闭；任何新样本或规则都需新的预注册决策。

## 独立 QA 结论与处置

独立 QA 固定 Builder 候选 `57279d1` 后确认前三项外部事实，但进一步读取同一固定提交的 `evaluation/benchmark.py`：该题属于 `ambiguous`，`ground_truth_ref` 为 FastAPI PR #15745；CSV 生成答案也没有使用 #2349。故 #2349 只是 context-only retrieval noise，不是 STR-04 issue/fix 被作为 evaluation task、Gold 或 patch 复用。

QA 判定 Builder 把既有规则扩大成“任何 lineage source 进入 LLM context 都 confirmed”，因此首轮 gate-closed 为 FAIL。主控接受退回：`contamination-scan.json` 改回 `no_public_hit_found`，保留命中与排除理由，继续原 canary。上文保留为被证伪的 Builder 判断记录，不再代表当前门禁状态。
