# WO-DS-04 独立 QA — Starlette 无模型接线冒烟

日期：2026-08-23

结论：**FAIL（P0）— 不接受 wiring smoke gate。** 本结论不否定既有 STR-04/05/08 fixture、pilot/canary 或 evaluator v2 的已接受 QA；也不授权 promotion/freeze、D0/D1/D2、模型调用或任何效果解释。

## 固定候选与范围

- 分支为 `main`；开始和结束时工作树均 clean；候选 HEAD 为 `fe3c5cc384f54ab530d3365f7b2f87c8ee5b478b`，与指定候选一致。
- docs-only 工单基线为 `fe2a3bb869918712dce5dcb3d62cc4ebbd006618`；完整审计差异为 `fe2a3bb..fe3c5cc`，含 Builder 中间提交 `5b9faaf` 和追加收紧提交 `fe3c5cc`，没有只审最后一个提交。
- 差异只新增 collection plan、接线工具、聚焦测试与 DS-04 文档；没有修改 `src/`、package/lockfile、provider、host、MCP 或 runtime。STR-08/05/04 的七类 fixture、`pilot-hashes.json`、`canary-hashes.json` 及 `contamination-scan.json` 相对基线均逐字节不变（对这些路径的完整范围 `git diff --exit-code` 通过）。

## P0：可伪造的 parser callback 会产生 `wiring_compatible`

工单要求 `validateWiringSmoke` **只有真实** `parseEvaluationSuiteV2` 严格成功后才可返回 `wiring_compatible`。候选的 `evaluation/starlette-v1/wiring-smoke.mjs` 允许调用方提供任意 `parseSuite` callback；它只向该 callback 注入一个顶层未知字段，要求抛出 `{ code: "INVALID_INPUT" }`，再要求有效输入的返回值与输入 deep-equal。

这不是对真实 parser 的身份或完整严格语义的证明。以下无 evaluator v2 parse、无 DB、无模型的最小反例会被接受并返回完整 structural summary，状态为 `wiring_compatible`：

```js
const lookalike = (value) => {
  if (Object.prototype.hasOwnProperty.call(value, "unregistered_wiring_field")) {
    const error = new Error("synthetic strict rejection");
    error.code = "INVALID_INPUT";
    throw error;
  }
  return structuredClone(value);
};

await validateWiringSmoke(root, wiring, {
  parseSuite: lookalike,
  evaluatorReportVersion: 2,
});
// 实测：status === "wiring_compatible"
```

该 callback 可以宽松接受所有未带该特定字段的非法 suite、完全不运行 `parseEvaluationSuiteV2`，却通过候选的 control 与 deep-equal 检查。也就是说，现有实现只能排除纯 no-op 和部分改写 callback，不能满足“真实严格 parser 成功”的 gate。

### 返回条件

接线工具应在生产路径直接导入并调用既有 `parseEvaluationSuiteV2`（或等价地将 callback 身份严格限制为该已导入函数），再在它对有效 suite 成功且对严格 control 拒绝后才生成 summary。不得把“拒绝一个专用未知字段”当作任意 callback 已实施完整 v2 严格解析的证明。新增聚焦反例必须覆盖上面的 `lookalike`（拒绝 control、原样或 clone 返回有效 suite）并断言拒绝；保留真实 parser 的成功路径。修复必须作为新的 append-only Builder 提交后重新独立 QA。

## 已通过的核查（不足以抵消 P0）

- collection plan 严格固定 `STR-07/08/05/06/01/04`、冒烟子集 `STR-08/05/04`、`planned_not_frozen`、不可按结果换案、允许透明改 tier 但 `tier_distribution_is_quota: false`。直接变异 case id、顺序、smoke 子集、状态、selection policy 或 tier-quota 会被 `validateCollectionPlan`/重建的确定性映射拒绝。
- 独立遍历三案得到精确映射：STR-08 为 4、STR-05 为 9、STR-04 为 18 个 slice；共 31 个唯一 slice、226 个 projected history turns。逐 slice 比较 `available_event_ids`、`projectModelInput` 历史投影、Current Task、segment/session、连续 `seq`、UTC 毫秒、token count、`source_event_id` 和空 metadata，均完全一致；没有跨 segment、漏项或重复。
- 每个 raw content 的 JSON key 恰为 `id`、`role`、`event_type`、`occurred_at`、`actor`、`summary` 六项。Fact Gold、Decision Reference、Outcome Anchor 和 source/hash/audit metadata 不在 raw/current input；Oracle 仅映射为 typed `context_items`/`state_relations`。真实 `parseEvaluationSuiteV2` 对整套和 31 个单 case 均成功，Oracle future/non-visible `source_refs` 被其输入验证拒绝。
- 使用真实 strict parser 时，隐藏非枚举字段、symbol、getter、非 `Object.prototype` 原型均在 parse 或确定性 mapping 边界被拒绝；错误 evaluator report version 被拒绝。纯 no-op callback 被拒绝，返回改写 suite 的 callback 也被拒绝。上述 P0 是能模仿这一个 control 的 callback，不能被这些较弱反例覆盖。
- 静态检查显示接线工具未导入或调用 `runEvaluationSuiteV2`、provider、网络、credential、宿主代码、SQLite/tempdir；只有 parser-only 输入构造。运行检查后 `/private/tmp/context-compiler-evaluation*` 没有目录。摘要只含结构计数、版本、零模型/零运行和 `effect_metrics_generated: false`，不含 `passed`、aggregate、threshold/effect 指标；空 probes/零 thresholds 未被运行或解释。

## 执行记录

- `npx vitest run test/starlette-wiring-smoke.test.ts`：8/8 通过。
- `npm test`：13 files、283 tests 通过。
- `npm run test:protocol`：8/8 通过。
- `npm run build`：通过。
- `git diff --check fe2a3bb..fe3c5cc`：通过。

这些回归只能证明当前测试覆盖的 no-op/改写 callback 及正常路径；它们未覆盖本报告的 lookalike parser，因此不能转化为 acceptance。
