# WO-EV-02 — Evaluator v2 测量有效性校准

状态：IMPLEMENTED — PENDING INDEPENDENT QA

实现交接：`docs/handoffs/WO-EV-02-evaluator-validity-calibration.md`

## 结果

在保留 ST-02 version 1 可复现能力的前提下，新增严格的 evaluator version 2，用最小校准集关闭三个已确认的测量有效性问题：空 Probe 自动通过、`current_input` 污染历史保留成绩，以及缺少 D2 相对 D1 的上下文成本报告。

本工单只校准“尺子”，不把校准案例当成 Context Compiler 效果证据。

## 允许范围

- `src/evaluation.ts` 中新增 version 2 fixture/report 类型、严格解析、运行与聚合。
- `src/evaluation-cli.ts` 对 version 1 和 version 2 输入进行显式分派。
- `src/index.ts` 导出 version 2 公共类型与函数。
- 新增最小 version 2 calibration fixture 和聚焦测试。
- 扩展真实 CLI、真实 npm pack、production-only 包验证。
- 更新 README、项目状态、路线图、决策记录、本工单 handoff。

不得修改 assembler、retrieval、recall、state reducer、extractor 或 MCP 工具行为。MCP 必须继续精确暴露九个工具。

## 路由上下文

只读取：

- `docs/ARCHITECTURE.md`
- `docs/DECISIONS.md`
- `docs/adversarial-reviews/AR-2026-08-23-post-st03.md`
- `docs/work-orders/WO-ST-02-evaluation-runner.md`
- `src/evaluation.ts`
- `src/evaluation-cli.ts`
- `src/assembler.ts`，仅用于确认结构化输出和 `current_input` 边界
- `src/index.ts`
- `package.json`
- `test/evaluation.test.ts`
- `test/mcp-protocol.test.ts`，仅用于真实打包与九工具回归
- `README.md`

Starlette 候选研究、数据集 schema、远端模型调用和历史原始需求归档不属于本工单上下文。

## 合同

### Version 兼容

- ST-02 version 1 的 parser、runner、报告和既有 CLI 输入继续可运行，结果语义不被静默改写。
- version 2 使用独立的严格 fixture/report version `2`。
- CLI 根据根级 `version` 显式分派；未知版本返回既有的 `INVALID_INPUT`。

### 带来源的 Probe

- version 2 Probe 是严格对象，至少包含稳定 `id`、非空 `text` 和非空 `provenance`。
- 每个 provenance 引用必须明确指向当前 case 中已经存在的 `raw_event` 或 `context_item`。
- 指向 `context_item` 的来源必须继续能够追溯到该 item 的合法 `source_refs`。
- `current_input` 不是合法 provenance 来源。
- 未知字段、重复 Probe id、无效引用、accessor/prototype/sparse 输入在执行前拒绝。

### `not_evaluable`

- version 2 的每个 rate 显式包含 `status: evaluable | not_evaluable`。
- `total = 0` 时必须为 `not_evaluable`，`rate = null`，不得伪造 `0` 或 `1`。
- 聚合只累计真实 Probe/recall 分母；无 Probe case 不贡献成功样本。
- 如果某个被现有阈值要求的 D2 aggregate 指标整体不可评估，报告不得 `passed=true`，并返回稳定的 not-evaluable failure code。

### 排除 `current_input` 污染

- D0/D1/D2 的 token 和 latency 仍按真实完整模型输入计算，包含同一个 `current_input`。
- constraint、decision、resolved issue、open question 的历史保留匹配只能检查历史投影，不检查 `current_input`。
- D2 历史投影必须由 assembler 已返回的结构化字段和既有 renderer 边界得到，不改变 core policy。
- Probe 文本即使完整重复在 `current_input` 中，也不能因此计为 D1/D2 历史命中。

### D2 相对 D1 成本

- 每个 case 和 aggregate 显式报告 D1 tokens、D2 tokens、`delta = D2 - D1`、`ratio = D2 / D1` 及可评估状态。
- D1 为零时 ratio 必须为 `null/not_evaluable`，不能除零或伪造结果。
- 保留既有 D2-vs-D0 reduction 和阈值。
- 本工单不新增 D2-vs-D1 pass/fail 门槛、加权分数或综合数学评分。

## Calibration Set

至少包含以下三个确定性案例：

1. 空 Probe/recall：所有 rate 明确 `not_evaluable`，aggregate 不产生 vacuous pass。
2. `current_input` 重复历史 constraint：旧事实只在较早 raw event 与当前输入出现，D1/D2 历史投影未保留时必须 miss。
3. D2 比 D1 显著更昂贵但仍满足旧 D2-vs-D0 threshold：报告必须显式暴露正 token delta 和 ratio > 1，不增加新 gate。

可以增加最小的无效 provenance、未来/缺失引用和混合 evaluable/not-evaluable 聚合案例，但不得把校准集扩展成真实效果数据集。

## 验收

- version 1 全部既有行为与测试继续通过。
- version 2 严格输入、来源、空指标、历史投影、聚合、阈值和 D2-vs-D1 原始成本均有聚焦测试。
- 真实 CLI 覆盖 v1、v2、未知版本、not-evaluable 和 threshold failure。
- 真实 tarball 的 package bin 能运行 v2 calibration fixture；production-only 安装不含开发依赖。
- `npm test`、`npm run test:protocol`、`npm run build`、真实 npm pack、production-only 执行、依赖树、凭据/生成物/provider/network/host 扫描和 `git diff --check` 通过。
- MCP 真实 `tools/list` 仍精确返回九个工具。

实现需要一个 append-only 提交和独立 QA；实现者不得自我批准。

## 明确不做

- Starlette 候选筛选、时间切片、Gold 或 hash freeze；
- 远端回答模型调用或 Critical Miss 回答评分；
- Formal Host Mode、自动 Headline、隐式 State Update；
- 修改 Context Compiler core policy；
- 新 provider SDK、综合分数或 D2-vs-D1 决策门。
