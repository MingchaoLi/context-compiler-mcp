# WO-DS-04 — Starlette 无模型接线冒烟

状态：IMPLEMENTED — PENDING NEW INDEPENDENT QA

Builder candidate 已完成 31 个 slice / 226 个 projected history turn 的 parser-only 接线；实现结果见 `docs/evaluation/starlette-v1-wiring-smoke.md`，独立 QA 前仍不得进入 promotion/freeze。

## 背景与对抗审查处置

WO-DS-03 已证明当前 schema 可以表达一个 long/open/partial-capability 轨迹，但 pilot 与 canary 仍分别处于 `pilot_not_frozen`、`canary_not_frozen`，尚未证明两种布局能够无歧义地进入 evaluator v2。

关键节点对抗审查 `AR-2026-08-23-post-ds03-canary.md` 的结论为 `Challenge`。本工单接受其中的更小验证路径：在制作其余三案前，先用已经独立接受的 STR-04、STR-05、STR-08 做一次确定性、无模型、无效果解释的接线冒烟。

## 单一结果

在不运行 D0/D1/D2、不调用远端模型、不修改 Context Compiler core 的前提下，证明或否定：

> 现有 STR-04/05/08 的每个真实时间片，能否经过既有字段投影和时间前缀边界，确定性地构造成 `parseEvaluationSuiteV2` 可消费的输入，同时保持最终六案索引不受试运行结果影响。

## 六案预注册

正式 Starlette v1 最小集合的 case id 固定为：

1. `STR-07`
2. `STR-08`
3. `STR-05`
4. `STR-06`
5. `STR-01`
6. `STR-04`

规则：

- 不得依据接线冒烟、后续 dry-run、D0/D1/D2 或模型结果替换案例；
- 当前预计分层为 2 short / 1 medium / 3 long，只是 survey 阶段的预计，不是配额，也不是已审计事实；
- STR-01/06/07 必须在逐事件信息增量审计后按机械规则透明改层，改层不得触发换案或少计真实增量；
- STR-08 已审计为 short，STR-05 与 STR-04 已审计为 long；这些结论仍不等于正式 freeze；
- 长度、组件和 outcome 混杂必须在后续报告中披露，不得把小型 purposeful sample 的 aggregate 外推为总体估计。

## 路由上下文

只读取：

- `AGENTS.md`；
- `docs/PROJECT_STATE.md`、`docs/ROADMAP.md`；
- 本工单；
- `docs/adversarial-reviews/AR-2026-08-23-post-ds03-canary.md`；
- WO-DS-02 与 WO-DS-03 已接受的 handoff、最终 QA 和数据合同；
- `evaluation/starlette-v1/` 下 STR-04/05/08、两份 hash、validator、README 与 contamination 记录；
- `src/evaluation.ts`、`src/raw-store.ts`、`src/state-types.ts` 中 evaluator v2 输入与报告类型；
- 与本冒烟直接相关的聚焦测试。

不得读取原始需求归档、同级项目、宿主代码、旧 aiohttp/HTTPX 数据、公开 Starlette 新来源或任何 D2/model 输出。

## 接线合同

### 集合索引

新增一个机器可读的预注册索引，至少固定：

- 上述六个 case id 及其顺序；
- `projected_tier` 与“仅预计、可透明改层”的状态；
- 冒烟使用的 STR-04/05/08；
- 禁止依据任何结果替换案例；
- 数据集整体仍为 `planned_not_frozen`。

validator 必须拒绝 case id、顺序、冒烟子集、状态或替换规则被静默更改。

### 时间片到 evaluator v2 输入

每个冒烟时间片必须：

- 先通过已接受 pilot/canary validator 与 hash 校验；
- 通过既有 `projectModelInput` 获得严格历史前缀与 Current Task；
- 把模型可见的六个 event 字段确定性映射为 evaluator `RawEvent`；
- 使用同一 slice 的 Oracle-State 作为 `context_items` / `state_relations`；
- 保持 `source_refs` 可追溯到该 slice 的 raw event id；
- 保持连续 `seq`、稳定 `source_event_id`、规范 UTC 毫秒时间戳和确定性 token count；
- 使用原 task 的 `recent_raw_window_turns`；
- 不把 Fact Gold、Decision Reference、Outcome Anchor、source audit metadata 或未来时间片写入 raw/current input；
- 使用空 Probe 仅代表“本工单不执行效果测量”，不得将其解释为成功样本或运行 aggregate。

构造出的 suite 只允许交给 `parseEvaluationSuiteV2` 做严格输入与引用验证；本工单禁止调用 `runEvaluationSuiteV2`。

### 报告契约边界

冒烟只确认现有 evaluator v2 报告版本仍为 `2`，以及未来 runner 的输入 case id 可稳定对应数据集 case/slice id。不得生成、保存或解释 token、retention、critical miss、latency、threshold failure、aggregate 或 `passed` 字段。

## 允许实现

- `evaluation/starlette-v1/` 下机器可读的 collection plan 与确定性接线工具；
- 新的聚焦测试；
- 中文接线报告、handoff、项目状态与路线图更新。

不得修改 `src/`、package runtime、MCP、依赖、retrieval/assembler/evaluator policy、provider 接口或已接受 fixture 内容/hash。

## 验收

- 固定六案索引和不可按结果换案规则可机械验证；
- STR-04/05/08 的 31 个 slice 全部被且只被映射一次；
- 每个 evaluator case 的 raw event ids 与该 task 的 exact prefix 完全一致；
- raw event 只由六字段模型投影构成，非输入 artifact 的标识/内容不进入 raw/current input；
- 每个 suite case 通过 `parseEvaluationSuiteV2`；篡改前缀、Oracle provenance、集合顺序或状态的反例被拒绝；
- 冒烟输出只包含结构性计数、版本和 `wiring_compatible`，不含效果指标或 `passed`；
- 不调用 `runEvaluationSuiteV2`，不创建临时数据库，不运行远端模型；
- 已接受 STR-04/05/08 fixture 与 pilot/canary hash 字节不变；
- 聚焦测试、`npm test`、protocol、build 与 `git diff --check` 通过；
- Builder 提交中文 handoff 后，由新的独立 QA 固定候选验证。

## Gate

只有独立 QA PASS，才允许另开正式 promotion/freeze 工单。冒烟失败时只修接线或合同，不得换案例、修改 Gold 或运行模型来规避失败。

## 明确不做

- 制作或补齐 STR-01/06/07；
- 把 STR-04/05/08 改成 frozen；
- 共同 cutoff 的来源/污染复扫或最终 hash；
- D0/D1/D2、远端 GPT-5.6、模型回答、PASS rate、aggregate 或效果解释；
- Probe/Gold 的最终评价映射、critical miss 判定或数学评分；
- 修改 Context Compiler core、Formal Host Mode、provider SDK、自动 headline 或 extractor。
