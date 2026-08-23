# Starlette v1 feasibility-01 回答采集

本目录只保存 WO-DS-12 对冻结 36 packet 的一次性原始回答采集。36 个 packet 严格按 `packet-manifest.json#execution_order` 启动，每个 packet 使用一个全新的 `gpt-5.6-terra` non-sol、medium、`fork_turns:none` collaboration session，恰好一次；最大并发为两个 answer worker。没有 retry、best-of 或单点补跑。

`raw-responses.jsonl` 按 execution index 保存原始 final output 和 SHA-256、请求模型元数据、session 标识、UTC 时间、严格格式解析结果，以及是否观察到 tool、network、repository 或其他外部信息使用迹象。temperature、sampling parameters、seed、backend build 与 billed tokens 均不可用，未作推断。`run-manifest.json` 汇总固定输入身份、调用数量与解释边界；`capture-hashes.json` 精确记录 accepted Git-source contract 与 current payload hashes；`validate-capture.mjs` 只读复验 source freeze 与 capture 完整性。

首轮 QA 发现旧 validator/hash 集合可被协调改写后，本目录改用已提交且不可回写的 capture source Git object `18a332fd06d7ebdfc8c0007ae1e9250db14c82cf` 作为外部 trust anchor。validator 在解析当前 JSON 或计算状态前，通过无 shell 的参数化 `execFile` 调用 `git cat-file blob` 读取该 commit 的 raw/run bytes，验证固定父提交与对象 SHA，并要求 current raw/run 逐字节相同。`capture-hashes.json` 明确不再把 validator 或自身列作自证对象；validator 代码身份由修复候选 Git commit 与独立 QA 固定。原始 `raw-responses.jsonl` 与 `run-manifest.json` bytes 未改。

本次 36/36 回答均通过机械格式检查：顶层普通 JSON object、仅一个字符串 `answer` 字段、无 markdown wrapper、按空白计不超过 250 个英文词；最长为 execution 33 的 176 词。该状态不是语义正确性判断。Builder 没有读取答案 rubric、没有运行 `runEvaluationSuiteV2`、没有运行自动 context/cost metric，也没有 required/forbidden/Critical-Miss 或其他语义评分。

这些回答仍是 `captured_unscored_pending_independent_qa`。只有独立 run-integrity QA PASS 后，后续工单才能生成自动 context/cost 结果与 condition-blind 人类 review bundle；两名真实人类完成盲评前，不得给出 D2 优于 D1 的结论。0 medium、单次 repetition、D2 人工 Oracle-State upper bound 与公开索引限制继续阻止稳健性、一般化或 provider comparison 声明。
