# WO-DS-12 — Starlette 首次 GPT-5.6-terra feasibility 回答收集

状态：ACCEPTED — UNSCORED CAPTURE INTEGRITY ONLY

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

## Builder 结果

2026-08-23 已严格按冻结 `execution_order` 完成 36/36 个 answer session：36 个 packet、36 个唯一 collaboration session、36 个 attempt，全部请求 `gpt-5.6-terra` non-sol / medium / `fork_turns:none`，每个 packet 一次，无 retry、best-of 或单点补跑，最大同时存在两个 answer worker。36 个原始 final output 已按 execution index 原样保存在 `evaluation/starlette-v1/runs/feasibility-01/raw-responses.jsonl`；机械解析为 36 个 `valid_response_format` / 36 个 `captured`，0 格式无效、0 technical failure、0 个观察到外部信息使用迹象。

新增 run manifest、capture hashes、中文 README、只读 validator 与聚焦测试。validator 固定 DS-11 QA report、answer inputs、packet manifest、run contract 与完整 freeze wrapper/展开文件 SHA，并复验 36 session 唯一性、顺序、prompt/response hash、严格 JSON/250-word 状态、attempt=1、无 retry 与 capture hash。Builder 没有读取 rubric、没有运行 `runEvaluationSuiteV2`、自动 context/cost metric 或语义评分，也没有修改 frozen data/protocol/input、core、provider 或 host。完整检查与隔离 pack 结果见 `docs/handoffs/WO-DS-12-starlette-feasibility-answer-collection.md`；实现者不自批，当前等待新的独立 run-integrity QA。

## Builder append-only fix（首轮 QA FAIL 后）

首轮独立 QA commit `f261af2ce14a4dbce361bec22c7e51174d9bace7` 以 P1 退回：旧 validator 的 raw/run SHA 常量和自列 validator hash 可随 raw/run/capture-hashes 协调改写；另有 P2 词数勘误，最长回答应为 execution 33 的 176 词。修复保持 `raw-responses.jsonl` 与 `run-manifest.json` bytes 逐字节不变，也没有任何新模型会话或 retry。

修复以已提交 capture source Git object `18a332fd06d7ebdfc8c0007ae1e9250db14c82cf` 为 mutable raw/run/hash/validator 集合之外的 trust anchor。validator 在任何当前 JSON 解析或状态计算前，使用参数化、无 shell 的 `execFile` 调用 `git cat-file`/`rev-list`，固定 source commit、父提交和两个 path，独立读取 raw/run blobs 并要求 current bytes 相同；只允许调用者提供含同一固定 commit 的只读 `anchor_repository_root`，不能注入替代 commit 或 bytes。`capture-hashes.json` 移除 validator 自证，改为明确 accepted Git-source contract、current payload hashes 与 self-attestation exclusions；run manifest 的所有顶层/nested 字段严格固定，额外 `authorization` 字段明确禁止，未评分/未授权 boundaries 保持 false/zero。

聚焦测试新增两个真正隔离的协调攻击：同时修改 raw output、record response SHA、raw SHA、validator 常量与 capture hashes；以及同时修改 run purpose/status、新增 authorization、放宽 boundaries、修改 validator 常量与 capture hashes。两者均在 Git-object anchor、任何后续 JSON parse/status 之前拒绝。另独立验证固定 source lineage/blobs、validator 暴露的 code identity，以及替代 anchor repo/bytes 注入拒绝。当前仍为 implemented pending independent re-QA，不授权自动指标、人类 review bundle 或任何效果结论。

## 独立 re-QA 接受（2026-08-23）

独立 re-QA 在 fixed Builder candidate `3c172bb62e5e640d00d513e31ede6249ac9d5cba`（父 `f261af2ce14a4dbce361bec22c7e51174d9bace7`）通过。直接以无 shell Git object reader 重建固定 `18a332fd06d7ebdfc8c0007ae1e9250db14c82cf` 的父链和 raw/run blobs；current 与 fix candidate bytes 均相同，未生成新 session 或 retry。首轮 P1 的 raw/run 全协调改写、anchor commit/path/hash、unknown、symlink、option/root 和 Git unavailable 均在 current JSON parse 前 fail-closed；capture-hashes 不再自证 validator。

本接受只表示 **36 条 unscored capture 的 run integrity** 可进入下一有界步骤。下一工单才可做自动 context/cost 与 condition-blind review bundle，且仍缺两名真实人类评分；不得声明 D2 优于 D1、效果、稳健性、一般化或 provider comparison。
