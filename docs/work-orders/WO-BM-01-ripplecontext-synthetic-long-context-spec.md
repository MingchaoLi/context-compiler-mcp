# WO-BM-01 — RippleContext Synthetic Long-Context Benchmark SPEC

状态：BUILDER DELIVERED / AWAITING INDEPENDENT QA / SPEC ONLY

Planning baseline：`d18e4d48717030f441f3a2e17e5c786cfa00c699`

Returned candidate：`b006029cad4eaff5e92dbd39f06cc57ccadb6e87`

Independent QA return：`23d1cd4a66122043379008216b04520e47378de3`

## 目标

只定义一套可长期复用的 RippleContext 合成长上下文 development benchmark v1 合同，为后续 `SPEC`、
`WORLD`、`GOLD`、`GENERATION`、`SURFACE_MAPPING_BASE_VALIDATION`、`QUERY_SURFACING`、
`MECHANICAL_VALIDATION`、`SEMANTIC_AUDIT`、`FREEZE` 九阶段文件交接建立稳定边界。

本工单不生成正文、WORLD、Event/Gold/Query-plan/Query 实例，不调用 generation/audit/query-surface 模型，
不运行 Pi/Codex/RippleContext、Full Context 或任何产品评测，也不修改 Core、retrieval、State、MCP、数据库、
package/test 或冻结 artifact。

## 本轮交付

1. 总体 contract、authority flow 与兼容目录规划；
2. Event、Gold、Query-plan、Query、Timeline、Continuity bundle、Surface evidence map、Manifest 八份 JSON Schema；
3. 两阶段 Query：正文前冻结 query plan，正文基础验证后 answer-blind 生成最终自然语言 query；
4. Event/Gold/Query/case taxonomy、lifecycle/relation 与 deterministic cross-file validator 责任；
5. 40 章 / 26 万字 / 12 cutoff groups 的抽象规划，无正文；
6. 每章 bounded continuity bundle 与一次机械可证 repair 合同；
7. 固定模型/reasoning/调用次数、input/output token、每章成本和独立评测成本边界；
8. Freeze、fresh regeneration、invalid-run 与 Builder handoff。Builder 不得批准自己的结果。

## 冻结与隔离原则

- `EVALUATOR_CONTROL_GOLD` 与 query plan 必须先于正文冻结；正文不得反向决定或修补 authority。
- evaluator-control Gold 可对回答模型隐藏，但不是 Independent Hidden Holdout；Candidate、Adapter、Interpreter、
  answer model 与 answer-blind query-surface model 均不得读取。真实 hidden holdout 不在本工单范围内。
- query plan 先冻结 identity/cutoff/case/facets/oracle/expected action/required-forbidden evidence，以及只描述主体、
  信息需求、as-of 视角和输出形态的 answer-neutral `query_surface_brief`；不冻结最终问题文本。
- query surface 任务只读固定 prompt、该 cutoff 的 exact corpus prefix，以及 deterministic allowlist 从 query
  plan 投影出的 `{query_id, query_surface_brief, brief_hash}` RFC 8785 safe envelope；不得读取 raw
  query plan、Gold、未来内容或任何
  answer/current-truth/expected-action/evidence/scoring-label 字段。该 envelope 是有 hash 的瞬时调用输入，
  不新增第九类公共资产。
- query-surface 逻辑输入按 `RC_QUERY_SURFACE_REQUEST_FRAME_V1` 唯一组帧；prompt、metadata、envelope、
  prefix 的 exact bytes/length/SHA 及 full-frame input SHA 必须可独立重建。
- query 不进入自己的历史 prefix；cutoff 后证据不可见。query surface 不得复制或暗示 answer-bearing span。
- `derived/surface-evidence-map.jsonl` 以 corpus/document/text hash 和 Unicode codepoint half-open span 将正文绑定
  Event/semantic unit；它是 derived mapping，不能修改 Event/Gold authority。
- superseded/retracted evidence 保留历史 provenance，但不继续作为 current truth；重复证据明确同源/派生/独立。
- Fixture/Gold/语义正文错误必须递增版本并 fresh regenerate 受影响章节和依赖资产，禁止原位协调改写。
- 数据内命令均为 inert test content；Schema 不绑定 Core、某个 Harness、供应商或 comparator。

## 固定模型与尝试边界

- SPEC：`gpt-5.6-sol` / high。
- WORLD、GOLD、QUERY_SURFACING：`gpt-5.6-sol` / medium；QUERY_SURFACING 为 12 个 answer-blind cutoff-group task。
- GENERATION：`gpt-5.6-terra` / low 或预登记 medium，40 个 fresh chapter task。
- 每章一次 initial；仅 truncation、schema/format、缺 Event surface、字符越界、surface-anchor 等机械可证失败可追加
  一次 repair。原输出 invalid/ineligible；同 model/reasoning/prompt/generator，仅加入已 hash 的机器 diagnostics。
- 语义不一致不得 repair，必须新 corpus version 并 fresh regenerate 受影响章节及依赖项。
- SURFACE_MAPPING_BASE_VALIDATION、FREEZE：完全 deterministic。
- MECHANICAL_VALIDATION：deterministic 优先；仅代码不能判断的预登记自然语言检查允许 Luna/low，cap 8。
- SEMANTIC_AUDIT：Sol/high，仅 Builder-side consistency audit，不是 Independent QA。
- 禁止 best-of、隐藏 retry、质量追逐、自动 Terra/Luna→Sol、未登记 fallback。模型不可用即停止并报告。

## Full Context 与报告边界

- comparator 统一称 `Full Context`，不与 RippleContext Raw evidence plane 混用。
- 日常开发不跑模型 Full Context；token 优先 deterministic 统计。
- 真实 latency/billing 校准最多一个独立评测工单下的 Terra/low campaign，标记
  `COST_CALIBRATION_ONLY / NON_QUALIFYING`；没有重大架构变化 Gate。
- corpus/control Gold/final Query/RC candidate 均冻结后，独立评测工单才可用 Sol 在相同
  model/reasoning/prompt/tool policy 下比较 `FULL_CONTEXT`、`RECENT_ONLY`、`RC_PROJECTION`、
  `RC_PROJECTION_PLUS_BOUNDED_RECALL`。
- 评测运行记录与 dataset-generation manifest 分离，评测成本不计入当前 generation total。
- Terra 生成正文且 Terra/low 做开发校准存在 style-family bias，只能作 development evidence；不得外推为
  模型无关资格。最终 Sol 横向比较也必须保持四条件相同。

## 路由文件

只允许读取：

- `AGENTS.md`
- `docs/PROJECT_STATE.md`
- `docs/ROADMAP.md`
- 本工单
- `docs/REQUIREMENTS_V0.md`
- `docs/DECISIONS.md`
- `evaluation/starlette-v1/pilot/STR-05/events.json`
- `evaluation/starlette-v1/pilot/STR-05/fact-gold.json`
- `evaluation/starlette-v1/pilot/STR-05/tasks.json`
- `evaluation/starlette-v1/pilot/STR-05/oracle-state.json`
- `evaluation/starlette-v1/pilot/STR-05/manifest.json`
- `evaluation/state-replay-v0.1/gold/transition-coverage.json`
- 本工单新增的 `docs/benchmarks/ripplecontext-long-v1-spec.md`
- 本工单新增的 `evaluation/ripplecontext-long-v1/spec/**`
- `docs/handoffs/WO-BM-01.md`

不得读取正文生成目标目录或外部私密会话。本工单没有 production source 路由。

## 接受条件

- `git diff` 不包含 `src/`、`test/`、package/lockfile、数据库、既有 frozen evaluation/Gold 或
  retrieval/State/MCP 变化。
- 全部 SPEC JSON 可解析；八份 Schema 均为 Draft 2020-12、closed-world 顶层对象，并在 Ajv strict +
  formats 下编译。
- Event/Gold/query-plan/query surface authority 无循环；最终 query text 只在 corpus 基础验证后 answer-blind
  生成。Schema 必须使 brief 足以确定主体、信息需求、as-of 视角和输出形态，同时 closed-world 排除 answer、
  current truth、expected action/abstention、required/forbidden evidence、future Event、case/failure label 与
  answer-bearing span。
- Validator 必须验证每个 query-plan/query 恰好绑定一个 brief hash、safe envelope allowlist/schema/input hash、主体
  和 alias 在 cutoff 前可见、prefix provenance，以及可机械判断的 surface leakage。最终问题是否忠实于同一
  information need 属于 Builder semantic audit 与 Independent QA，不得虚称纯程序可证明。
- Surface map Schema 至少绑定 dataset/corpus version、chapter/unit、Event/semantic IDs、document/text hash 与稳定
  span；required coverage 为零缺失，并能区分 retrieval/formation/answer layer failure。
- Continuity bundle 完整覆盖 immutable style、alias registry、open-thread ledger、relation/state snapshot、至多
  两段必要原文与仅含 opaque Event ID/枚举禁止码/hash 的 closed future-constraint projection，同时
  禁止全量历史、未来计划、query oracle/control Gold。
- Repair policy 至多一次且只允许机械可证失败；attempt/reason/input-output/diagnostics hash 完整，原输出不得参与选择；
  语义错误必须版本化重生成。
- Taxonomy 覆盖全部目标语义现象并有非零 denominator；章节规划为 40 章、26 万字、12 cutoff groups/72 queries。
- 九阶段分别列明输入、输出、模型、写入路径、停止与 handoff；无单一任务携带全部历史。
- 成本计划重新对账：22 Sol、40 initial Terra、0 default repair、0 default Luna；每章与 query-surface 成本、
  optional repair/Luna 和 excluded evaluation campaign 分离；无自动升级/fallback/best-of。
- Sol query-surfacing 必须逐 cutoff-group 以完整 request input（prompt、safe envelope、prefix、metadata/framing
  overhead）判断是否 `>272K`；超过时整次请求应用 2× input / 1.5× output。QCG-08–12 high tier、阶段/总计/
  reserve 必须逐项机械重建，不能只用 base-rate aggregate。
- 高位 query-surfacing 费用必须重建为 `$21.551`，默认 generation 总成本为
  `$16.98–$32.491`，25% reserve 为 `$21.225–$40.61375`。
- 所有对象/文件/normalized text/call-input SHA-256 必须绑定唯一版本化字节域：RFC 8785 JCS 值与文件 LF
  规则、Unicode 17.0.0 NFKC + newline pipeline、JSONL framing，以及 query-surface prompt/envelope/prefix 的
  exact request frame。Manifest/Schema 必须绑定算法、版本、prompt path/hash 与 call input hash。
- Continuity future constraints 不得包含自由文本或自声明 payload-absence；只允许 closed-world 的 opaque Event
  ID、枚举 prohibition code 和机械派生/hash 字段。注入未来事实的 QA 反例必须 Schema fail-closed。
- Gold `prohibited_reader_classes` 必须同时包含 `ANSWER_BLIND_QUERY_SURFACE_MODEL`，并保持 exact set。
- Freeze 覆盖 SHA-256、schema/version/model/prompt/generator/chapter/Gold/query-plan/query/surface map/attempt ledger；
  generation manifest 不收 evaluator run。
- 本工单正文字符、WORLD/Event/Gold/Query 实例、generation/query-surface/audit model call、model answer、
  evaluator run 均为 0。Sol semantic audit 不得冒充 Independent QA。
- `git diff --check` 通过；Independent QA PASS 前状态不得改为 ACCEPTED，不得进入 WORLD。

## 明确非目标

- 不实现生成器/validator，不生成任何 downstream instance 或正文。
- 不选择 Harness authority，不建立综合分，不宣称 RippleContext 优于 comparator。
- 不运行 Full Context、污染扫描或模型回答质量比较。
- 不改变真实 Independent Hidden Holdout 或既有 frozen evaluation 状态。
