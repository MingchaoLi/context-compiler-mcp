# WO-DS-14 / ST-02 Official Capture — Builder 交接

日期：2026-08-23

状态：**OFFICIAL CAPTURED UNSCORED — SCORER PENDING**

## 本次有界结果

独立 Run-Gate re-QA 已在 `9229eef89e0cddaf2d75f4a4a6ff7da633bb3591` 接受，主控随后明确授权唯一一次固定 30-step capture。本次严格按冻结 `step_order` 串行执行：每步只把 source-only runtime 生成的 exact `packet.prompt` 交给一个 fresh `gpt-5.6-terra` / medium / `fork_turns:none` extraction agent；每步恰好一次 final payload，0 retry、0 follow-up、0 best-of。

本次新增的只是 30 个 packet、30 个原始 response、30 个 metadata、session ledger、run manifest、零 Gold source-only replay 观测和中文边界说明。没有修改 contract、runtime、`src/`、`feasibility-01`、`PROJECT_STATE` 或 `ROADMAP`，没有实现 matcher/scorer，也没有读取 Gold、future/outcome 或宣称 Extractor 效果。

official capture 落盘后，原 Run-Gate focused test 中“无参数 CLI 应看到 0 response 和首 packet”的前置状态自然失效；本次只把该断言更新为默认 CLI 应机械消费 30 条 official capture 并返回 `response_prefix_complete_no_scoring`。测试没有修改 prompt、runtime、response 或评分边界。

## Capture 完整性

- 固定 Run-Gate QA：`9229eef89e0cddaf2d75f4a4a6ff7da633bb3591`；
- 固定 Run-Gate Builder：`a4c336d7f2e421c507e926fe333e5a1f4e5dbd06`；
- 固定 contract source：`8d31cb6fc06b6b99bc141258539deb51b46d2d1b`；
- packet / response / metadata / fresh session：30 / 30 / 30 / 30；
- transport：30 completed / 0 failed；
- attempt：每步 1；retry / follow-up / best-of：0 / 0 / 0；
- capture 时间：`2026-08-23T14:18:15.138Z` 至 `2026-08-23T14:44:14.975Z`；
- model / effort / fork：全部 `gpt-5.6-terra` / `medium` / `none`；
- tools / network / repository access：合同和逐步 metadata 全部为 false；会话只收到 exact prompt，并直接返回 final payload。

每条 `raw_response` 均逐字符编码为 JSON string，SHA-256 来自 UTF-8 原文；metadata 记录 prompt/response digest、UTC 时间与 canonical collaboration task/session path。`session-ledger.jsonl` 的 ordinal、event、packet 和 session 均唯一。

## 零 Gold 重放的原始观测

完整 source-only replay 返回：

- status：`response_prefix_complete_no_scoring`；
- processed response：30；
- strict parse accepted：18；
- `INVALID_SCHEMA`：12；
- `INVALID_JSON` / `INVALID_REFERENCE`：0 / 0；
- empty-delta fallback：12；
- reducer rejection：0；
- revision increment：0；三条轨迹的 Predicted State 都保持空状态。

12 个 `INVALID_SCHEMA` step 为：`STR-08/E1`、`STR-08/E3`、`STR-07/E4`、`STR-07/E6`、`STR-07/E9`、`STR-06/E2`、`STR-06/E4`、`STR-06/E5`、`STR-06/E9`、`STR-06/E11`、`STR-06/E12`、`STR-06/E14`。其余 18 条均是 strict-accepted empty Delta。

这些只是 parser/reducer 执行事实，不是 Gold Delta/Gold State 对比。当前不能给出 critical state recall/precision、stale activation、missed supersession/resolution、wrong reactivation、dependency inconsistency 或 provenance failure；这些必须由后续冻结 matcher/scorer 在不新增 model session 的情况下计算。

## 运行边界

- Gold / semantic item / checkpoint / Oracle / future / Outcome read：0；
- scoring / matcher：0；
- response 修补或重写：0；
- `feasibility-01` 读写或重跑：0；
- contract/runtime/core 修改：0；
- PACE、Evidence、Experience、embedding、answer-quality evaluation：0。

原始回答出现了多种嵌套字段写法，strict parser 按既有合同原样拒绝；Builder 没有纠正、补跑或挑选更优回答。即使全部 transport completed，也不表示 schema-valid 或状态正确；即使 reducer rejection 为 0，也不表示 Extractor 正确，因为 invalid response 已按合同先 fallback 为空 Delta。

## Builder 验证

- capture integrity：30 packet / 30 response / 30 metadata / 30 ledger，packet/session 均唯一，order/hash/attempt/model 与合同一致；
- full source-only replay：30 processed，`response_prefix_complete_no_scoring`，12 `INVALID_SCHEMA` / 12 fallback / 0 reducer rejection；
- focused：`test/state-replay-st02-contract.test.ts` 8/8 PASS；
- 全量：398 PASS / 1 个既有 opt-in official runner SKIP；
- protocol：8/8 PASS；
- `npm run build`：PASS；
- `git diff --check`：PASS；
- 真实 `npm pack --ignore-scripts`：50 files，SHA-1 `f20e56e75c6b6aa9d7362627101771a6c2ca4510`，不包含 `evaluation/`、`docs/` 或 `test/`。

验证环境：macOS / arm64、Node.js 25.6.1、npm 11.9.0；Windows 与 exact Node.js 24 未单独复跑。

## 下一步

只允许在当前固定 capture 上实现并运行零模型 scorer/matcher，生成预注册原始错误分布并进行独立 QA。不得新增、重跑或 follow-up 任何 extraction session。完成 ST-02 scoring/QA 和关键节点对抗审查后，按 WO-DS-14 停止，不自动进入 Context Reduction、Operational Stability、PACE 或下一工单。
