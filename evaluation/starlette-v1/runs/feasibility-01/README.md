# Starlette v1 feasibility-01 回答采集

本目录只保存 WO-DS-12 对冻结 36 packet 的一次性原始回答采集。36 个 packet 严格按 `packet-manifest.json#execution_order` 启动，每个 packet 使用一个全新的 `gpt-5.6-terra` non-sol、medium、`fork_turns:none` collaboration session，恰好一次；最大并发为两个 answer worker。没有 retry、best-of 或单点补跑。

`raw-responses.jsonl` 按 execution index 保存原始 final output 和 SHA-256、请求模型元数据、session 标识、UTC 时间、严格格式解析结果，以及是否观察到 tool、network、repository 或其他外部信息使用迹象。temperature、sampling parameters、seed、backend build 与 billed tokens 均不可用，未作推断。`run-manifest.json` 汇总固定输入身份、调用数量与解释边界；`capture-hashes.json` 固定 capture 文件；`validate-capture.mjs` 只读复验 source freeze 与 capture 完整性。

本次 36/36 回答均通过机械格式检查：顶层普通 JSON object、仅一个字符串 `answer` 字段、无 markdown wrapper、按空白计不超过 250 个英文词。该状态不是语义正确性判断。Builder 没有读取答案 rubric、没有运行 `runEvaluationSuiteV2`、没有运行自动 context/cost metric，也没有 required/forbidden/Critical-Miss 或其他语义评分。

这些回答仍是 `captured_unscored_pending_independent_qa`。只有独立 run-integrity QA PASS 后，后续工单才能生成自动 context/cost 结果与 condition-blind 人类 review bundle；两名真实人类完成盲评前，不得给出 D2 优于 D1 的结论。0 medium、单次 repetition、D2 人工 Oracle-State upper bound 与公开索引限制继续阻止稳健性、一般化或 provider comparison 声明。
