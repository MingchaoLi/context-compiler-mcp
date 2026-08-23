# WO-DS-12 交接 — Starlette feasibility 回答采集

日期：2026-08-23

状态：**IMPLEMENTED — PENDING NEW INDEPENDENT QA**

## 交付结果

- 从 `main` / `HEAD=b99bb4fefe0284f26f00271b3c32839b0cddfd43`、clean worktree 开始；父提交为已接受 DS-11 QA 的 planning commit；
- 严格按冻结 `packet-manifest.json#execution_order` 单调启动 36 个新 collaboration answer session；
- 每个 packet 恰好一个 session、`attempt_number:1`，无 retry、best-of、follow-up 或单点补跑；
- 每个 session 请求 `gpt-5.6-terra`、non-sol、medium、`fork_turns:none`，最多同时存在两个 answer worker；
- 初始消息只包含对应 frozen `system_instruction`、两个换行与 `user_prompt`；未加入 case/slice/condition、rubric、解释或项目上下文；
- 36 个原始 final output 按 execution index 原样保存并逐项 SHA-256；
- 机械格式结果：36 `valid_response_format` / 36 `captured`，0 `invalid_response_format`，0 `technical_failure`；最长回答 173 个按空白分隔词；
- 没有观察到 tool、network、repository 或其他外部信息使用迹象；没有因此触发 retry；
- temperature、sampling parameters、seed、backend build、billed tokens 均记录为 `unavailable`。

## 固定输入与 Capture

- DS-11 freeze Builder candidate：`a2d68b851d178db20dc3abfb17b2d3eda8d66d3c`；
- DS-11 QA commit：`8b6512098072a1c4af661a82a45bde2ee1ae7876`；
- DS-11 QA report SHA-256：`b7f6413520f98fa470702b9b901b8dbd05f3bbd71a5cec0c9618d8c101f9c8f5`；
- answer inputs SHA-256：`503441186a90efe93a93b04e53b350737877bfb941f48eb91e610144a3a52675`；
- packet manifest SHA-256：`74d45b359b15087e1858face1076113809f2938be7599bf8e79b054b1b54d982`；
- run contract SHA-256：`7cafe30a138c056da46b0f629e97fb2b0d2bcb096a8111db5ff90594206be85b`；
- raw responses SHA-256：`1b574d4c1843a283d088cc641523855e78135516545a264c4fe48d5e059a4910`；
- run manifest SHA-256：`674ab5a80074c7ce52f76c1491ba1ce428a133fdf14212445f68a3a9f90c9ed0`。

`evaluation/starlette-v1/runs/feasibility-01/` 新增：

- `raw-responses.jsonl`：36 条按 frozen execution order 排列的原始回答与调用元数据；
- `run-manifest.json`：固定输入身份、transport、调用/状态计数和解释限制；
- `capture-hashes.json`：固定 README、raw responses、run manifest 和 validator；
- `README.md`：中文运行边界；
- `validate-capture.mjs`：只读完整性 validator。

## Validator

只读 validator：

- 固定 DS-11 QA report、七项 freeze wrapper/input、promotion/protocol hash manifest SHA；
- 展开并核对 46 canonical 与 3 protocol frozen source 文件，拒绝 source freeze 漂移；
- 核对 36 records 的 execution index、packet order、prompt hash、attempt=1 与 36 个唯一 session；
- 固定 requested alias/family/effort、`fork_turns:none` 与不可用 transport metadata；
- 重算每个 raw output SHA，并严格解析顶层普通 JSON object、唯一字符串 `answer` 字段与 250-word 上限；
- 重算 parse/cell status，核对 0 retry、0 best-of、最大两个并发 worker和外部使用迹象字段；
- 核对 run manifest 计数、collection boundaries 与 capture artifact hashes。

聚焦测试覆盖正常 36-session capture、response swap + capture-hash 协调重写、DS-11 answer-input mutation 与 symlink artifact。

## 明确未做

- 未读取 answer rubric、condition mapping 或其他会话答案来调整后续调用；
- 未运行 `runEvaluationSuiteV2`、自动 context/cost metric 或任何 evaluator；
- 未做 required/forbidden/Critical-Miss、语义正确性、综合分数或 PASS rate；
- 未使用第二模型或 QA agent 代替两名 condition-blind 人类 reviewer；
- 未修改 frozen data/protocol/input、`src/`、core、provider、host、package surface 或 MCP；
- 未声明 D2 优于 D1、稳健性、一般化、provider comparison 或确定性复现。

## Builder 自检

- capture validator：36 packets / 36 sessions / 36 attempts / 36 captured；0 invalid / 0 technical failure / 0 external-use observed；
- focused：4/4 PASS；
- `npm test`：21 files / 372 tests PASS；
- `npm run test:protocol`：8/8 PASS；
- `npm run build`、`git diff --check`：PASS；
- 独立 `/private/tmp` npm cache 的 `npm pack --dry-run --json --ignore-scripts`：50 files，SHA-1 `f20e56e75c6b6aa9d7362627101771a6c2ca4510`，包内不含 `evaluation/`、`docs/` 或 `test/`；
- 第一次 pack 尝试只因宿主 `~/.npm` cache 的既有 root-owned 文件报 EPERM；没有修写宿主 cache，改用独立 `/private/tmp` cache 后通过；
- 实现者不批准本工单。

## 独立 QA 必查

- 固定 Builder candidate、父提交、main/clean，并确认 diff 仅含 DS-12 append-only capture、validator、测试与文档；
- 从 collaboration session 证据独立核对 36 个 session identity、requested model/effort、fresh `fork_turns:none`、单次 attempt 与原始 final output；
- 独立核对 started/ended 时间、冻结 launch order 与最大并发两个 answer worker；
- 逐条重算 prompt/response SHA、严格 JSON/word count、parse/cell status 和 external-use observation；
- 攻击 omission/duplicate/swap/session reuse/retry/status rewrite/raw rewrite/hash rewrite/symlink 与 frozen-source mutation；
- 确认没有 rubric、condition mapping、其他回答或项目上下文传入任何 answer session；
- 确认没有 evaluator、自动 metric、语义评分或 frozen/core/provider/host 修改；
- 运行 validator、focused、全量、protocol、build、diff check 与隔离 production pack。

即使独立 QA PASS，也只表示 36 个未评分回答的运行完整性可接受；下一工单才可生成自动 context/cost 结果和人类盲评包。两名真实人类完成 condition-blind review 前，不能给出 D2 是否优于 D1 的语义结论。

## QA 勘误（2026-08-23）

独立 QA 按 `validate-capture.mjs` 的实际规则（先 JSON parse，再对 `answer.trim().split(/\s+/u)` 计数）复算：最长回答为 execution 33 的 **176** 个词，而非上文 Builder 自检段的 173。176 仍不超过 `<=250` 合同；上文历史自检没有被重写，本节仅保留勘误留痕。
