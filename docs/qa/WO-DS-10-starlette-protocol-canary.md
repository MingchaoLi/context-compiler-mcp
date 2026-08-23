# WO-DS-10 独立 Data QA：Starlette protocol canary

日期：2026-08-23
结论：**PASS — 仅接受 `protocol_canary_not_frozen`**

## 固定边界

- Builder candidate：`bc78c42505c34ae6f3220db49b2e5a5af905d0eb`；父提交：`5e496723d428fbe73158ffb5172419ad80a4f227`。开始时 `main`、HEAD、父提交均精确匹配，工作树 clean。
- 相对父提交的完整 diff 为 12 个 protocol/document/test 文件；未修改 `src/`、package/runtime、MCP、provider/host、42 个 promotion payload、既有 hash 或污染 snapshot。
- 固定 promotion identity 仍指向 DS-09 candidate `4b974538d76d0e0d8a5ac17c5662533b714ef00e`；当前 `promotion-hashes.json` 与该对象逐字节一致，SHA-256 为 `c216719f1745601786ad53f50bbaed6c5e7b0a8e8d9d6612cfb79b9c103ff51b`。

## 独立重建与人工审查

不导入 Builder 的 eligibility 生成器，直接从固定 six-case promotion 事件、任务和 fact Gold 重算，得到 83 facts、75 slices、499 fact-slice assignments。12 个 slice 的固定顺序及每案最早成熟依赖→terminal 为：

- STR-07：T4 → T10；STR-08：T3 → T4；STR-05：T7 → T9；
- STR-06：T4 → T16；STR-01：T4 → T18；STR-04：T4 → T18。

逐项人工审查 19 个 `task_dependency` Fact：它们均会实质影响各自 Current Task 的正确下一步（而非关键词命中），且每案所选首 slice 之前没有合格的 technically-mature 依赖。terminal 选择也与固定数据一致。

8 个 Probe 的 raw event 与 Oracle item 均为双边 exact anchor，类别、cutoff provenance、D1 外位置、Current Task/latest 排除与长度规则均正确。`call_next` 是已登记的代码标识符例外；其余 anchor 均满足至少两词和 12 字符。Probe 只作 lexical carry-through，resolved 保持 `not_evaluable_diagnostic_only`。

12 个答案 rubric 共 42 required、16 forbidden、38 critical 引用；每个 active Fact 和 provenance 均不晚于相应 slice cutoff。没有发现 future leakage、把 outcome 倒灌为先验、或把合理替代方案误列为 forbidden；forbidden 均是已被记录证据排除的错误状态/边界断言。

## 对抗复验

以下变异均被拒绝：Oracle-only、raw-only、Current Task/latest 重复、resolved Probe、future answer、dangling critical、过短 code 例外、标点变化、零宽 Unicode、unknown field、path/order/status 变化、symlink、protocol hash 自举及 inventory hash 自举。

还同步篡改 accepted promotion source 与 copy、对应 hash、42-item diff、collection 引用、source ledger 和 protocol/hash manifest；验证器仍先由代码内固定 DS-09 candidate source contract 拒绝，不能以协调改写吸收 canonical-data 变化。

## 发现分级

- P0：无。
- P1：无。
- P2：`interpretation` 是供人工语义审阅的自由文本，文件内校验只要求其为干净的非空字符串。最小复现：在内存 protocol 中将 STR-07/T10 的 `307 redirect` interpretation 改为相反的“保留 CORS 且无明显 round trip”，保留 raw/Oracle anchor 和其他结构字段，`validateProtocolDocuments` 仍能通过。当前文件的语义方向经人工核对正确，且实际 on-disk 改写即使同步重建 manifest 也会被固定 `FILE_CONTRACT` 拒绝，故不阻塞本次 protocol-only 接受。若未来要自动化认可 interpretation 的语义方向，返回条件是另开有界工单，为每项建立可机读的方向合同或明确的人工冻结签核；不得以本工单修改 core。

## 静态执行隔离与验证

`protocol-preflight.ts` 只静态导入并实际调用 `parseEvaluationSuiteV2`，解析恰好 12 case inputs / 101 projected turns；没有 `runEvaluationSuiteV2`、runner、provider、network 或 credential 路径。authorization 保持 `formal_freeze_authorized:false`、`evaluation_ready:false`、`evaluator_run_authorized:false`、`model_run_authorized:false`，并确认 `evaluation_run_count:0`、`model_call_count:0`、`effect_metrics_generated:false`。

- `node evaluation/starlette-v1/protocol-canary/validate-protocol-canary.mjs`：PASS（6 / 83 / 75 / 499 / 12 / 8 / 19 / 42 / 16，运行与模型计数均为 0）。
- `npx vitest run test/starlette-protocol-canary.test.ts`：17/17 PASS。
- `npm test`：19 files、354 tests PASS；`npm run test:protocol`：8/8 PASS；`npm run build`：PASS；`git diff --check`：PASS。
- 隔离 `npm pack --dry-run --json --ignore-scripts`：50 files，SHA-1 `f20e56e75c6b6aa9d7362627101771a6c2ca4510`；包内没有 `evaluation/`、`docs/` 或 `test/`。

## 接受范围与后续门槛

本 QA 仅接受固定 candidate 的 `protocol_canary_not_frozen`。六案 canonical data 仍是 `promotion_candidate_not_frozen`；0 medium 是外推限制。未进行 Probe 实验、正式 data/protocol freeze、D0/D1/D2、模型调用、aggregate 或效果解释。首次模型调用前仍须独立工单原子 freeze data+protocol、追加污染复扫并固定运行参数。
