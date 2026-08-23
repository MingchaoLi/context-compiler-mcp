# WO-DS-14 / ST-02 Run Contract — Builder 交接

日期：2026-08-23

状态：**RUN CONTRACT IMPLEMENTED — PENDING INDEPENDENT RUN-GATE QA；MODEL NOT AUTHORIZED**

## 本次有界结果

本次只冻结 ST-02 的零模型运行合同，并实现 source-only packet/replay runtime。没有调用 GPT、provider、network、evaluator 或 assembler；没有创建真实 packet、response、capture、内部评分或 Gold 映射；没有修改 `src/`、`feasibility-01`、`PROJECT_STATE` 或 `ROADMAP`。

固定身份如下：

- ST-01 独立 re-QA：`daa012c4d6f09919e798edc3771cf090bd5dd188`；
- ST-01 Builder：`826eb4760fe8df557a2aa7d07225bc1986579281`；
- 修正后 data：`79da83d95aeac7162c95714f4f6f5eff1f9e0608`；
- canonical promotion source：`4b974538d76d0e0d8a5ac17c5662533b714ef00e`；
- Event Stream Git blob：`9b4b18c77a5496278325429be2df6aaf767281e9`，SHA-256 `a35771410cd027a70e439add43a268529826def666c14421b629e79a47c0a4e1`。

## 合同与物理隔离

`st02/contract/run-contract.json` 固定 30-step 完整顺序、`gpt-5.6-terra` non-sol / medium、`fork_turns:none`、每步 fresh session、attempt 1、无 adaptive retry / best-of / tools / network / repository access，最大并发为 3。`StrictStateExtractor` 固定 `maxAttempts:1`；invalid JSON/schema/reference 使用 empty Delta fallback；reducer rejection 记录为 extractor-produced invalid transition，并要求 predicted state 不变。

`st02/contract/response-contract.json` 将每步 response 与 metadata 物理分开：

- `capture/responses/<packet_id>.json` 只保存 response artifact，`raw_response` JSON 字符串逐字符保留 transport text，包括 invalid JSON；
- `capture/metadata/<packet_id>.json` 单列 prompt/response digest、模型参数、fresh session、attempt、权限和时间；
- replay 只把 `raw_response` 交给现有 `StrictStateExtractor`，metadata 永不进入模型输入。

`packets/`、`capture/`、`internal/` 当前均只有中文 README，没有任何 official artifact。

## Source-only runtime

`st02/runtime.ts` 在解析当前 Event Stream 前，先从固定 `79da83d…` Git object 读取 blob，校验固定 parent/blob/SHA-256，再要求当前 bytes 逐字节一致并拒绝 symlink。runtime 只读取：

- `source/event-stream.jsonl`；
- `st02/contract/run-contract.json`；
- `st02/contract/response-contract.json`；
- 若显式重放 capture，则读取分离的 response/metadata 文件。

它不读取或导入任何 Gold、semantic item、checkpoint、旧 Oracle-State、future event、Outcome 或 Decision Reference。

每一步的真实 prompt 不是复制私有模板，而是给 `StrictStateExtractor` 注入 capture transport，让现有实现实际调用内部 `buildPrompt`。输入固定为：上一轮 Predicted Typed State（含 tombstone）、既有非 `DERIVED_FROM` relation、`recent_context: []` 与一个 current raw event。

SQLite 内部随机 runtime id 和 wall-clock timestamp 不暴露到 prompt。raw/state id 用 namespace hash 投影为稳定 opaque id；item `created_at/updated_at` 和 relation 时间投影为对应事件时间。每次都可由 response prefix 从空状态重放得到同一 next prompt。临时 SQLite 位于系统临时目录，结束后删除；runtime 不向仓库写 packet 或 response。

## 错误路径

- invalid response：同一 raw text、一次 Extractor attempt、empty Delta fallback、不中途修补；
- valid Delta：opaque id 转换成隔离 SQLite runtime id 后交给现有 reducer；
- reducer rejection：事务回滚，单列 reducer error name，并机械比较前后 predicted state fingerprint；
- source-only 输出只有 next packet 或 `complete_no_scoring`，没有 threshold、aggregate、Gold score 或架构结论。

focused test 使用合成 response 覆盖 valid parse、invalid JSON fallback 与 stale revision reducer rejection；不读取 Gold、不调用模型。

## Builder 验证

- focused：`test/state-replay-st02-contract.test.ts` 7/7 PASS；
- source-only CLI 冒烟：输出 `STR-08/E1` next packet，`model_call_count:0`、`scoring_run_count:0`；
- ST-02 runtime/CLI 独立 TypeScript no-emit check：PASS；
- 全量：397 PASS / 1 个既有 opt-in official runner SKIP；
- protocol：8/8 PASS；
- `npm run build`：PASS；
- `git diff --check`：PASS；
- 隔离 `npm pack --ignore-scripts`：50 files，SHA-1 `f20e56e75c6b6aa9d7362627101771a6c2ca4510`，不包含 `evaluation/`、`docs/` 或 `test/`。

验证环境沿用当前 macOS / arm64、Node.js 25.6.1 与 npm 11.9.0；Windows 和 exact Node.js 24 未在本 checkpoint 单独复跑。

## 独立 Run-Gate QA 建议

1. 固定本 Builder candidate，核验直接父为 `daa012c…`，并锚定 contract/runtime 当前字节；
2. 在只复制 `source/ + st02/contract/` 的隔离 fixture 中生成首 packet，证明 Gold 目录不存在时仍可运行；
3. 攻击 Event Stream current bytes、run contract 身份/order/model policy、response/metadata digest 与 packet id；
4. 用合成 response prefix 重放两次，核对 prompt、opaque id、event timestamp 和 response chain 完全一致；
5. 重验 invalid parse fallback 与 reducer rejection 前后 state/revision 不变；
6. 确认 `packets/`、`capture/`、`internal/` 没有真实回答，且 model/provider/network/evaluator 调用为 0。

QA PASS 只授权主控决定是否执行一次 official capture；QA 本身不得调用模型。此交接不接受 Extractor correctness、错误分布、Context Reduction、Operational Stability、PACE/Evidence/Experience 或架构胜负。
