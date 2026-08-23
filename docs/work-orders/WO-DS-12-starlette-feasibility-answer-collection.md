# WO-DS-12 — Starlette 首次 GPT-5.6-terra feasibility 回答收集

状态：IN PROGRESS — answer collection only

## 背景

WO-DS-11 已由独立 QA commit `8b6512098072a1c4af661a82a45bde2ee1ae7876` 接受 atomic data+protocol+answer-input freeze；固定 Builder candidate 为 `a2d68b851d178db20dc3abfb17b2d3eda8d66d3c`。本工单只执行已冻结 `run-contract.json`，不修改任何 data、Gold、Oracle、protocol、Probe、rubric、prompt 或 Context Compiler core。

## 单一结果

> 严格按 `packet-manifest.json#execution_order` 启动 36 个全新 GPT-5.6-terra non-sol / medium / `fork_turns:none` collaboration session，每个 opaque packet 恰好一次；原样保存所有回答与技术元数据，不评分、不重试、不选择最好结果。

## 固定输入与身份

- atomic freeze QA：`8b6512098072a1c4af661a82a45bde2ee1ae7876`；
- input JSONL SHA-256：`503441186a90efe93a93b04e53b350737877bfb941f48eb91e610144a3a52675`；
- packet manifest SHA-256：`74d45b359b15087e1858face1076113809f2938be7599bf8e79b054b1b54d982`；
- run contract SHA-256：`7cafe30a138c056da46b0f629e97fb2b0d2bcb096a8111db5ff90594206be85b`；
- 运行顺序：冻结 manifest 中 36 个 packet id，不得删改、换序或按输出调整；
- model：`gpt-5.6-terra`，reasoning effort：`medium`；
- 每 cell `attempt_number:1`，无 adaptive retry、best-of 或单点补跑。

## 执行方式

- 每个 packet 使用新的 collaboration agent session，`fork_turns:"none"`；
- session 初始消息只包含对应 frozen `system_instruction` 与 `user_prompt`，不传 case/slice/condition mapping、rubric、其他回答或项目上下文；
- prompt 已禁止 tool、network、repository 与未来信息；若回答自述使用外部信息，只标记 cell 无效，不重跑；
- 调用按冻结 order 单调启动；为利用固定并发槽，可同时存在不超过 3 个已经按顺序启动的独立 session，完成先后不改变记录顺序；
- 每个 session 启动和结束时间由主控外部记录；原始 final output 不修写。

## Capture

在 `evaluation/starlette-v1/runs/feasibility-01/` 新增 append-only artifacts：

- `raw-responses.jsonl`：按冻结 execution order 保存 36 条记录；
- `run-manifest.json`：固定输入身份、调用计数、状态计数、不可用 transport metadata 与解释限制；
- `capture-hashes.json`：固定上述 artifact；
- `README.md`：中文边界说明；
- 最小只读 validator 与聚焦测试。

每条 response record 至少保存：

- `packet_id`、`prompt_sha256`、`execution_index`、`attempt_number`；
- requested model alias/effort 与 collaboration session id；
- `started_at`、`ended_at`；
- 原始 assistant output、`response_sha256`；
- `parse_status`、`cell_status`；
- 是否观察到 tool/network/repository 或外部信息使用迹象。

temperature、sampling、seed、backend build、billed tokens 统一记录为 `unavailable`，不得推断。

## 解析规则

- 只接受顶层普通 JSON object，恰好一个字符串字段 `answer`；
- answer 不超过 250 个按空白分隔的英文词；
- 不允许 markdown wrapper 或额外键；
- 不满足时标记 `invalid_response_format`，仍保留原始 output，不重试；
- collaboration session 技术失败标 `technical_failure`，不生成伪回答。

## 独立 QA

Builder 提交后必须由新的独立 QA 固定候选并验证：

- 恰好 36 个不同 collaboration session、36 个 attempt，packet/order/prompt hash 全匹配；
- requested alias/effort 均为 GPT-5.6-terra non-sol / medium，`fork_turns:none`；
- 原始输出与 response hash 一致，无修写、缺失、重复或单点重试；
- parse/status 计算正确，未把格式错误改写为成功；
- 没有 rubric、condition mapping 或其他答案传入任一会话；
- 未修改 frozen data/protocol/input/core，没有 evaluator/semantic scoring；
- 全量、protocol、build、diff check 与 production pack 隔离通过。

QA 只审核运行完整性，不评价回答语义，不知道条件也不代替两名人类 reviewer。

## 明确不做

- 不运行 `runEvaluationSuiteV2` 或自动 context metric；
- 不做 required/forbidden/Critical-Miss 判断；
- 不把第二模型或 QA Agent 当人工 judge；
- 不生成 D2-vs-D1 效果结论、综合分数或 PASS rate；
- 不重试任何 cell；
- 不补 medium、不增加 repetition、不修改 core/policy/provider/host。

## Gate

只有本工单独立 QA PASS，下一工单才能在固定 12-slice suite 上运行自动 context/cost 指标并生成 condition-blind 人类 review bundle。两名真实人类完成 rubric 前，不得给出 D2 是否优于 D1 的语义结论。

