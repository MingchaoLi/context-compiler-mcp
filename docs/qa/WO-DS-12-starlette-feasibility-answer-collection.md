# WO-DS-12 独立 Run-Integrity QA：Starlette feasibility 回答采集

日期：2026-08-23

结论：**FAIL — 不接受本次 unscored capture 进入后续自动指标或 condition-blind 人类 review bundle。** 原始候选的 36 条记录在当前 bytes 下机械一致，但 capture validator 不能拒绝被要求重点攻击的协调式 raw/hash/validator 改写；这是 P1 gate 缺口，不是对任何回答语义的评价。

## 固定边界与 diff

- 开始时 `main`、`HEAD=18a332fd06d7ebdfc8c0007ae1e9250db14c82cf`、`HEAD^=b99bb4fefe0284f26f00271b3c32839b0cddfd43` 精确匹配，工作树 clean。
- 相对父提交仅有 10 个 DS-12 文件：4 个 docs、5 个 `evaluation/starlette-v1/runs/feasibility-01/` capture/validator 文件和 1 个 focused test。未改 frozen canonical/protocol/input、`src/`、package/runtime、MCP、provider 或 host。
- DS-11 QA、answer inputs、packet manifest、run contract 的 current bytes 与 DS-11 QA commit `8b6512098072a1c4af661a82a45bde2ee1ae7876` 直接读取的 Git objects 相同；SHA-256 分别为 `b7f6413520f98fa470702b9b901b8dbd05f3bbd71a5cec0c9618d8c101f9c8f5`、`503441186a90efe93a93b04e53b350737877bfb941f48eb91e610144a3a52675`、`74d45b359b15087e1858face1076113809f2938be7599bf8e79b054b1b54d982`、`7cafe30a138c056da46b0f629e97fb2b0d2bcb096a8111db5ff90594206be85b`。

## 当前候选的独立机械重算

我没有调用 runner、模型、provider、network 或 `runEvaluationSuiteV2`，也没有读取 rubric 或判断回答好坏。直接解析原始 JSONL 并按 validator 的同一 JSON/空白词规则重算得到：

- `raw-responses.jsonl` SHA-256 为 `1b574d4c1843a283d088cc641523855e78135516545a264c4fe48d5e059a4910`，有末尾换行，恰好 36 条；36 个 packet、36 个 recorded collaboration session 均唯一，execution order 和每条 prompt SHA 均等于 frozen packet manifest。
- 每条均为 attempt 1，requested transport 均为 `gpt-5.6-terra` / `non-sol` / `medium` / `none`；36 条 response SHA、严格单键 JSON `answer`、parse/cell status、外部使用观察字段和 `unavailable` transport metadata 都相符。
- recorded start/end 顺序单调，最大重叠为 2；没有第 37 条、retry、best-of 或 technical-failure record。此为 capture 内记录的证据，仓库未提供独立的远端 session 审计导出，不能把它扩大表述为网关侧的额外证明。
- 以 validator 的实际规则（先 JSON parse，再对 `answer.trim().split(/\s+/u)` 计数）最长为 execution 33 的 176 词，全部不超过 250；raw bytes 中没有 Unicode format/control character。与 46 canonical、3 protocol expanded files、固定 DS-11 输入和 capture 文件合计检查的 64 个相关路径全为普通文件、非 symlink。
- 当前原件运行 `node evaluation/starlette-v1/runs/feasibility-01/validate-capture.mjs .` 返回 36 packets / 36 sessions / 36 attempts / 36 captured、0 invalid、0 technical failure、0 external-use observed、0 evaluator、`semantic_scoring_performed:false`。

## P1 — capture hash/validator 可协调自举（FAIL）

`validate-capture.mjs` 把 raw 与 run-manifest SHA 常量写在 validator 自身；`capture-hashes.json` 又把 validator 自身和 manifest 的 SHA 放在可改 manifest 中。没有位于这个可协调改写集合之外的不可变 trust anchor。因此“固定 hash”只阻止未改 validator 的数据改写，不能满足本工单要求的 raw rewrite/hash bootstrap 对抗边界。

最小复现均在隔离副本中完成，未触及候选文件：

1. 将 `run-manifest.json` 中未被逐字段约束的 `purpose` 改为 `coordinated-bootstrap-mutated`，同步更新 validator 的 `RUN_MANIFEST_SHA256` 及 `capture-hashes.json` 的 manifest/validator SHA；validator 仍返回 `capture_valid_unscored_pending_independent_qa`。
2. 将第 1 条 `raw_assistant_output` 追加一个尾随空格，重算该条 `response_sha256`、raw 文件 SHA，接着同步更新 validator 的 `RAW_RESPONSES_SHA256` 和 `capture-hashes.json` 的 raw/validator SHA；全量 validator 再次返回同一 valid 结果。该复现不评价或改变回答含义，但已证明 raw artifact 的 bytes 可被协调吸收。

现有 focused test 只覆盖“swap raw + 改 capture-hashes”，没有把 validator 常量/代码一并作为攻击面；它在该较弱攻击下正确拒绝，却不能关闭上述 P1。

**返回条件：** 在 raw/capture hash/validator/run manifest 同时被改写的隔离攻击下，建立并使用一个位于该可改写集合之外的固定、可独立验证的 anchor，并让验证先拒绝。修复后须至少新增 raw response + response SHA + raw SHA + validator + hash manifest 的协调改写反例，以及 run-manifest status/authorization + validator + hash manifest 的协调改写反例；两者都必须在任何后续解析或评分前失败。不能以同一可修改 validator 或其自列 hash manifest 作为唯一信任根。

## P2 — Builder handoff 词数勘误

handoff 的“最长回答 173 个按空白分隔词”与 validator 的实际规则不一致。独立按该规则重算为 execution 33 的 **176** 词，仍在 `<=250` 合同内，故不影响当前格式 status 或 P1 结论。原历史段落没有重写；已在 handoff 末尾追加 QA 勘误。

## 其余攻击面与运行隔离

- 在未改 validator 代码的普通攻击面，fixed raw SHA 会在 record 解析前拒绝 raw 改写；随后 exact record keys、36-count、frozen order/prompt、attempt、transport、session suffix/uniqueness、timestamp/concurrency、response SHA、parse/cell/status、外部观察与 manifest boundaries 分别覆盖 omission、duplicate、swap、order、session、attempt、model/effort、status、unknown field 和 Unicode 改写。focused test 另实际验证了 swap + capture-hash rewrite、DS-11 answer-input mutation 和 raw symlink 的拒绝。
- 但上述 ordinary-path 防线不抵消 P1：攻击者若也改 validator，则这些 guard 本身可被改写。因此本 QA 不把它们报告为完整的协调改写防护。
- validator 和 focused test 仅使用本地 fs/crypto/path/util；差分没有 core 或运行器修改，静态检索没有 evaluator/runner 调用、provider、fetch/network 或 child execution 调用。candidate 的 `collection_boundaries` 与 validator 输出均为 0 evaluator / 0 semantic scoring；本 QA 未进行答案语义审查。

## 污染复核范围

pre-run snapshot 保持 `starlette-contamination-rule/v1`、六案 source/cutoff、旧 snapshot SHA 与既有 exclusions。受限 public web index 对六案 exact-path 限定查询作了四组组合复扫：返回项为无关的泛化网页，未观察到满足“公开 task-level reuse”的 direct evidence。该观察受索引噪声和覆盖范围限制；冻结 snapshot 已记录 GitHub code-search API/UI 当时不可用。它不是 absence proof，不把旧 RAGAS/release-note/downstream exclusions 冒充为本次新 direct evidence，也不改变未来发现 direct evidence 时应关闭 blind eligibility 的规则。

## 执行结果

- capture validator：PASS（当前原件；不克服 P1）。
- focused 命令 `npm test -- test/starlette-feasibility-answer-capture.test.ts`：项目 npm script 运行全量，21 files / 372 tests PASS，其中 focused 4/4 PASS。
- `npm run test:protocol`：8/8 PASS；`npm run build`：PASS；`git diff --check`：PASS。
- 隔离 cache 的 `npm pack --dry-run --json --ignore-scripts`：50 files，SHA-1 `f20e56e75c6b6aa9d7362627101771a6c2ca4510`；包内无 `evaluation/`、`docs/`、`test/`。

## QA 判定

- P0：无。
- P1：1 项，capture validator 的 raw/hash/validator 协调改写可自举，阻塞 acceptance。
- P2：1 项，handoff 最大词数为 173 的记录不准确，正确值为 176，不影响 `<=250`。

本次失败不改变 WO-DS-12、PROJECT_STATE 或 ROADMAP 的 pending 状态，也不授权自动 context/cost、两名人类 blind review、任何评分或 D2-vs-D1 结论。
