# WO-EV-02 实现交接

日期：2026-08-23

状态：**IMPLEMENTED — REQUIRES INDEPENDENT QA**

## 结果

候选保留 ST-02 evaluator version 1 的 parser、runner、报告和 CLI 行为，并新增严格 version 2：

- Probe 从裸字符串升级为带稳定 id 和非空 provenance 的严格对象；
- provenance 只能引用当前 case 的 `raw_event` 或可追溯 `context_item`；
- 空分母返回 `{ status: "not_evaluable", rate: null }`，不再伪造成功率；
- 混合聚合只累计真实分母；如果整个必需 D2 aggregate 不可评估，`passed` 不能为 true；
- token/latency 仍测完整模型输入，历史连续性匹配改为排除 `current_input` 的历史投影；
- 每个 case 和 aggregate 新增 D2-vs-D1 tokens、delta、ratio 和零分母状态；
- D2-vs-D0 reduction/threshold 保留，不新增相对 D1 gate 或综合评分。

CLI 根据根级 `version` 分派 v1/v2；未知版本继续返回稳定 `INVALID_INPUT`。MCP 行为与九工具边界未改变。

## 校准集

`test/fixtures/evaluation-v2-calibration.json` 只校准尺子，包含：

1. 空 Probe/recall，逐 case 显式 `not_evaluable` 且不贡献 aggregate 成功样本；
2. 旧 constraint 在 `current_input` 重复，但 D1/D2 历史投影均 miss；
3. D2 相对 D0 仍满足旧绝对 threshold，同时 D2 为 D1 约 4.32 倍，原始成本被显式报告。

该 fixture 不是 D2 效果证据。

## 文件

- `src/evaluation.ts`：v2 严格类型、解析、历史投影、rate、聚合、阈值和成本比较。
- `src/evaluation-cli.ts`：v1/v2 显式分派和匹配的错误版本。
- `src/index.ts`：v2 公共导出。
- `test/evaluation.test.ts`：v1 回归及 v2 测量有效性/严格输入测试。
- `test/fixtures/evaluation-v2-calibration.json`：三个最小校准案例。
- `test/mcp-protocol.test.ts`：真实 production-only tarball package bin 执行 v2 fixture。
- README、architecture、decision、state、roadmap 和工单文档。

## 实现者验证

环境：Darwin arm64，Node.js 25.6.1，npm 11.9.0。

- evaluator 聚焦测试：PASS — 30 tests。
- `npm test`：PASS — 11 files，240 tests。
- `npm run test:protocol`：PASS — 8 tests，包含真实 npm archive、production-only prune、v1/v2 package bin 和精确九工具验证。
- `npm run build`：PASS。
- 真实 v2 calibration CLI：PASS — version 2，3 cases；空 Probe 明确 not-evaluable；污染案例 D1/D2 miss；成本案例 D2/D1 ratio 约 4.32。
- `npm pack --dry-run --json --ignore-scripts`：PASS — 50 entries，仅包含 `dist`、README 和 package metadata。
- `npm ls --omit=dev --all`：PASS；仅保留 SDK 已声明的 optional `@cfworker/json-schema` 未安装提示。
- 新增代码的 provider/network/credential/host/UI 扫描与 `git diff --check`：PASS。

实现者不批准自己的交付。独立 QA 必须从精确提交候选重新验证严格输入、历史投影、聚合、package/production-only 行为和九工具边界，并写入 `docs/qa/WO-EV-02-evaluator-validity-calibration.md`。
