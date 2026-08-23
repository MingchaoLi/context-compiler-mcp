# WO-V0-15 独立 QA：Experience-ready Context / State 基础设施收口冻结

日期：2026-08-24

结论：**FAIL — 返回 Builder；不得把 WO-V0-15 标记为 ACCEPTED/FROZEN。**

## 固定候选与边界

- 分支：`main`
- 固定候选：`e0d9af3acd3273d592007f7cae273b2820807b36`
- 固定父提交：`314d309dff7806633943d5b4796c2804c9cc9ba2`
- append-only checkpoint 链：A `c5405dc3065a9eabf7ffb5351a6325757a8e66ff` → B `314d309dff7806633943d5b4796c2804c9cc9ba2` → C `e0d9af3acd3273d592007f7cae273b2820807b36`
- QA 开始时工作树 clean；候选、父提交或分支未发生漂移。
- 本次未调用模型或网络，未重跑/修改 `feasibility-01`、WO-DS-14 official capture、Gold、evaluator artifact 或 core 实现。QA 只新增本报告。
- 环境：macOS / Darwin arm64、Node.js 25.6.1、npm 11.9.0；Windows 与 exact Node.js 24 未单独复跑。

## 阻塞问题

### P1-1：dormant 将不可证明完整的 telemetry 当成完整历史，能够错误冷却 ACTIVE item

工单要求“整个生命周期 retrieval hit count 为 0”且 telemetry 不完整时 fail-open。当前实现只要 ledger 中存在任意最小形状的 `CONTEXT_COMPILE`，就把最早一条当 baseline；`parseTelemetry` 只检查 `policy_version` 与 `raw_boundary_max_seq`，不验证它是否由受信的 `appendContextCompileTrace` 生成、完整 trace shape、规范 source key、operation id、raw/state snapshot 或配套 hit 父链（`src/operational-context.ts:529`）。同时通用 `SqliteExperienceLedgerStore.append` 允许调用方直接追加 `CONTEXT_COMPILE` / `RETRIEVAL_HIT`，这些类型和 source-key namespace 没有被内部 trace API 保留。

存在两个已独立复现的具体反例：

1. 真实 `operation_id` baseline 后创建一个 provenance 位于 turn 2 的 ACTIVE Goal；随后用**合法的无 operation id、历史 read-only compile**查询并命中该 Goal。该次命中不会写 telemetry。到 turn 17 再用 operation id 发起无关查询时，debug 仍报告 `telemetry_complete:true`，Goal 被放入 `dormant_state_ids` 并从 `active_goals` 消失。系统把一次真实但未记录的相关性命中当成“生命周期从未命中”。
2. 通过公开 ledger `append` 写入 `{kind:"CONTEXT_COMPILE", payload:{policy_version:"operational-context-v1", raw_boundary_max_seq:1}}`，不需要真实 compile、operation id 或完整 payload。下一次真实 compile 将它接受为完整 baseline，并把同一类旧 ACTIVE Goal 冷却。

这不是只多留 Context 的保守误差，而是 authoritative ACTIVE state 的前台错误遗漏，直接违反 fail-open 收口边界。现有测试只覆盖“完全没有 baseline”和显式坏字段，没有覆盖合法无 id compile 形成的观测缺口或通用 ledger 伪 baseline。

### P1-2：严格 JSON 规范化对 `__proto__` 发生有损转换，破坏 raw 原子镜像、旧库兼容与 source-key 冲突判断

`normalizeJsonValue` 使用普通对象 `{}`，再执行 `result[key] = ...`（`src/experience-ledger.ts:535-547`）。当合法 JSON 数据键为 `__proto__` 时，这不是创建普通数据属性，而是修改结果对象原型。

独立反例证明：

- `JSON.parse('{"__proto__":{"retained":true},"safe":1}')` 是先前 Raw Store 可接受的普通 JSON metadata；当前 live ingest 在生成 EVENT mirror 时抛出 `ExperienceLedgerError(INVALID_INPUT)`，原子事务回滚。相同 metadata 已存在于旧库时，确定性 backfill/服务启动也会失败，违反既有数据库 migration 兼容。
- 两个独立 ledger ACTION payload `{"__proto__":{"candidate":"A"}}` 与 `{"__proto__":{"candidate":"B"}}` 都被持久化/读取为 `{}`；使用同一个 `source_key` 时第二个输入被错误当成相同重试，而不是 `CONFLICT`。这会静默丢失研究 ledger 数据并破坏 provenance/idempotency 可信度。

现有 strict JSON 测试覆盖 undefined、NaN、Date、BigInt、accessor、sparse 与 unknown field，但没有覆盖 JSON 特殊数据键。修复还应同步检查 operational fingerprint 的递归排序是否存在同类普通对象赋值问题。

### P1-3：有限、同空间、同维且数学非零的 Dense 向量可因浮点溢出被静默归零，同时仍报告 `hybrid`

Dense 输入只约束元素是有限数字，允许 `1e308`。当前 norm 与 dot 分别直接平方/相乘求和（`src/operational-context.ts:435-445`、`vectorNorm` / `dot`），因此 query/candidate 都为 `[1e308]` 时出现 `Infinity / Infinity -> NaN`。后续 `finiteScore` 将 NaN 静默改为 0，但 availability 仍是 `hybrid`。

独立复现结果：完全相同向量 `[1e308]` / `[1e308]`、BM25 权重 0、Dense 权重 1，debug 报告：

- `dense_availability: "hybrid"`
- `dense_cosine: 0`
- `combined_score: 0`
- `retrieved_event_ids: []`

这既不是准确 cosine，也不是 fail-closed BM25 fallback，违反可复算排名与 Dense availability 准确报告。现有测试只覆盖普通量级、missing/partial/space/dimension/zero norm。

### P2-1：持久层坏记录被服务误报为调用方 `INVALID_INPUT`

`getSessionRecords` 读取持久 JSON 时复用 `ExperienceLedgerError("INVALID_INPUT")`；service 在 `classifyError` 中把所有这类错误映射为 `INVALID_INPUT`（`src/mcp-service.ts:399-406`），没有区分请求验证失败与 persisted-row failure。

独立反例：外部连接插入满足 SQLite 表级 JSON-array CHECK、但元素为数字的 `raw_event_ids_json='[1]'` 后，无参数 operation 的合法 `compile_context` 返回 `{ok:false,error:{code:"INVALID_INPUT"}}`。错误来自已持久化 ledger 记录，而非本次请求；正确类别应为稳定的 `STORAGE_FAILURE`。这会误导调用方修改请求，并掩盖后台数据完整性故障。

### P2-2：RuntimeStateUpdater 的失败结果没有暴露 current-event contract version

工单明确要求现行 `RuntimeStateUpdater` 使用新合同并在结果/错误中暴露版本。成功结果通过嵌套 `ExtractorResult.contract_version=2` 满足；但 `RuntimeStateUpdateError` 只有 `code`（`src/runtime-state-update.ts:23-27`），extractor validation、fallback exhaustion、transport failure、abort、conflict 与 storage failure 路径均未携带 `contract_version`。focused 测试也只断言稳定 code，没有验收错误版本。

## 已独立通过的证据

以下证据成立，但不能抵消上述非空反例：

- A：v2 prompt 包含十数组 nested field、ID namespace、lifecycle、same-step 与 provenance 合同；新 item/current `DERIVED_FROM` 正反例、scripted non-empty Delta → 同一 reducer 应用通过；legacy parser/apply 保留，DS-13 validator、DS-14 ST-01/ST-02 pinned replay/scoring 均复现。
- B：七类 ledger、session sequence/source-key、same-session existing raw/parent refs、restart replay、外部 UPDATE/DELETE trigger、live raw+EVENT 同事务故障注入、旧库一般样本 EVENT-only backfill通过。
- B/C 并发附加攻击：两个真实 Worker/独立连接同时 ingest 同一 `source_event_id` 返回同一 raw id，最终一个 EVENT；两个独立 service 同时 compile 同一 operation/input 返回同一 trace，最终一条 CONTEXT_COMPILE 和一条 RETRIEVAL_HIT。
- C：Recent N 与 N×5/N×8 窗口、BM25/普通量级 cosine、partial/space/dimension/zero fallback、recovery 引用、Constraint、update、历史 hit、dependency rescue、query reactivation、threshold 与一般 fail-open fixture 通过。
- operation id：同一输入在另一个 operation 追加 telemetry 后重试仍返回原 trace且不追加；相同 id + 不同 current input 返回 `CONFLICT`；失败注入下 trace/hit 原子回滚，raw/state 不变。
- 无 operation id compile 保持 ledger 行数不变；trace payload 的正常输入路径不含 current/raw 正文。
- `assembleContext` 无 operational 输入回归、evaluator v1/v2、固定 artifact、九工具、默认数据库路径兼容、provider/network/Graph DB/Experience Formation/PACE 范围检查未见漂移。

## 回归与打包结果

- focused：8 个相关测试文件，149/149 PASS。
- 全量 `npm test`：449 PASS / 1 个既有 opt-in official runner SKIP。
- `npm run test:protocol`：8/8 PASS。
- `npm run build`：PASS。
- `git diff --check`：PASS。
- DS-13 `validate-results.mjs`：固定 Git object anchor 与 36 answer / 8 lexical Probe 诊断复现。
- DS-14：ST-01 7/7、ST-02 contract 8/8、empty-state score 8/8 PASS，official artifact 未重跑或改写。
- 真实 pack / production-only isolated stdio：由 protocol 测试重新执行并 PASS；精确九工具、SDK/Zod runtime-only、health 与进程生命周期通过。

全量 suite 通过只证明现有 fixture 没有覆盖本报告反例，不证明 dormant telemetry、JSON ledger 或极值 Dense 合同正确。

## 精确返回条件

Builder 需要 append-only 修复提交，并至少补齐以下回归后再申请独立 re-QA：

1. **telemetry 信任与覆盖**
   - 本报告的“baseline → 合法无 id query 命中 → age=N×15 → operation compile”反例必须 fail-open，不能冷却 item，也不能谎报 `telemetry_complete:true`。
   - 通用 ledger append 不能伪造可用于 dormancy 的 compile baseline/hit；内部 trace/hit namespace、完整 payload、operation/parent 关系必须可验证。已有或未知 telemetry 不能通过最小两字段自证完整。
   - 保持无 id compile 历史 read-only、Constraint 与 dependency rescue、真实完整 telemetry 下的非空 dormant 分母。
2. **无损严格 JSON**
   - 顶层和多层 JSON `__proto__` 数据键必须无损规范化，或在任何写入/序号消耗前一致 fail-closed；不得改变对象原型、丢字段或合并不同 payload。
   - 先前 Raw Store 可接受、metadata 含该键的旧数据库必须可确定迁移并生成准确 EVENT mirror；live raw+mirror 仍同事务。
   - 对所有用于 ledger payload 与 operation fingerprint 的 stable/sorted JSON helper 加特殊键反例。
3. **Dense 数值稳定性**
   - `[1e308]`、极小非零量级和多维大数必须得到可复算有限 cosine，或整腿以明确 `dense_unavailable_*` fail-closed；绝不能把 NaN/Infinity 静默变 0 后仍报告 `hybrid`。
   - 保留 partial coverage 全腿 fallback、同 space/dimension、zero norm、tie-break 与 limit 回归。
4. **错误边界**
   - 从 persisted ledger row 解码/验证产生的错误必须映射 `STORAGE_FAILURE`；只有当前调用参数验证才可映射 `INVALID_INPUT`。
   - `RuntimeStateUpdater` 的成功和所有稳定失败路径都应暴露 current-event contract version 2，同时不改变 v1 parser/apply/pinned replay。
5. 重跑 focused、全量、protocol、build、diff、DS-13/14 reproduction、真实 production-only package/stdio；QA 前重新固定新 candidate/parent 且工作树 clean。

## 冻结判断

当前不能冻结 Context / State 基础设施，也不能进入真实 Experience 数据积累阶段：P1-1 会错误遗漏 ACTIVE state，P1-2 会拒绝或丢失本应 append-only 保留的研究数据，P1-3 会生成错误且自称 hybrid 的召回结果。Dense 效果与 Experience Formation 效果仍均为 **未评估**；本次 FAIL 不授权 PACE、Graph DB、provider、ontology、retrieval 调参或 Experience Formation 扩展。

---

## Append-only re-QA（2026-08-24）

结论：**FAIL — 首轮五项 correctness 问题已关闭，但新发现 fresh DB 并发初始化 P2；WO-V0-15 继续保持 PENDING，不得标记 ACCEPTED/FROZEN。**

### 固定修复候选与边界

- 分支：`main`
- 固定修复候选：`1d987a54dd81ae09013d624a0ad9e107bf239d69`
- 固定父提交：`c625e1632de76e63d05ddfa68c787d19dc6fe2a7`
- re-QA 开始和测试完成后候选均为 clean；分支、HEAD 和 parent 未漂移。
- 本次未调用模型或网络，未修改 core、Gold、`feasibility-01` 或 WO-DS-14 official artifact；QA 只追加本报告。
- 环境：macOS / Darwin 25.5.0 arm64、Node.js 25.6.1、npm 11.9.0；Windows 与 exact Node.js 24 未单独复跑。

### 首轮五项返回条件的独立重放

1. **telemetry 信任与连续性：已关闭。** 合法 baseline 后缺少 `operation_id` 的 compile 稳定返回 `INVALID_INPUT`，raw / state / ledger 计数与 revision 零变化；通用 ledger `append` 拒绝 `EVENT / CONTEXT_COMPILE / RETRIEVAL_HIT` 和三个保留 source namespace。独立协调变异了 trace extra key、`hits_sha256` 和额外 hit：只有完整合法 baseline 产生 `telemetry_complete:true` 与非空 dormant，变异样本均为 `telemetry_complete:false` 并 fail-open 保留 ACTIVE item。trace payload 仍只含 hash / policy / id，未包含 current/raw 正文。
2. **特殊 JSON 数据键：已关闭。** live raw mirror、legacy EVENT-only backfill、ledger payload 与 operational fingerprint 均无损保留嵌套 `__proto__ / constructor / prototype`；同 source 不同特殊键内容稳定 `CONFLICT`，没有原型污染或幂等合并。
3. **Dense 极值数值稳定性：已关闭。** `[1e308]`、`[Number.MIN_VALUE]` 和 `[1e308,-1e308,5e307]` 在同 space / dimension 的相同 query/candidate 上均报告 `hybrid`，cosine 为有限值 `1`，召回顺序稳定；partial/missing/space/dimension/zero/numeric 整腿 fallback 与报告回归通过。
4. **持久层坏行错误分类：已关闭。** 直接注入 `raw_event_ids_json='[1]'` 后，合法 `compile_context` 稳定返回 `STORAGE_FAILURE`，不再误报调用方 `INVALID_INPUT`。
5. **RuntimeStateUpdater v2 错误合同：已关闭。** 成功结果及 extractor validation / transport / abort / conflict / storage 等稳定失败路径均暴露 `contract_version:2`；v1 legacy parser/apply 与 DS-13/14 固定重放没有变化。

### 新阻塞问题

#### P2：两个独立实例同时首次打开同一 fresh DB 时存在可重复的初始化竞争

使用两个真实 Worker，同时构造两个 `ContextCompilerMcpService`，指向同一个尚不存在的数据库路径。10 组独立 fresh DB 中有 3 组的一个实例启动失败并抛出 `STORAGE_FAILURE`；直接对两个 `SqliteRawHistoryStore` 做同样攻击时，stack 指向 `PRAGMA journal_mode = WAL`（`dist/raw-store.js:31`，对应 `src/raw-store.ts:82`）的 `database is locked`。`busy_timeout=5000` 没有使该 fresh schema/WAL 初始化路径可并发。

对照证据说明这是初始化 race，不是幂等数据重复：

- 对同一 DB 先单实例完成初始化后，20 组双实例同时启动为 40/40 成功。
- 已初始化 DB 上，两个 Worker 同时 ingest 相同 `source_event_id` 返回同一 raw id，最终只有一个 EVENT mirror；两个 service 同时 compile 相同 operation/input 返回同一 trace，最终只有一条 CONTEXT_COMPILE 和一条 RETRIEVAL_HIT。
- 已有数据库 migration、raw + EVENT 同事务回滚、外部 UPDATE/DELETE trigger、restart replay 和 source / operation retry 回归均通过。

该问题不会静默改写数据，但在两个宿主/子进程共用首次配置的本地 DB 时，会使一个 MCP 实例在 health 可用前直接退出；因此按 operational stability 和“两连接并发”验收范围记为 P2，不允许带着该已知启动失败面冻结。

### 新问题的精确返回条件

1. 从本 QA 报告提交追加单一 fix，不扩大 WO-V0-15 范围，不修改 core policy / evaluator / Gold / official artifact。
2. 增加同步起跑的双 Worker 或双进程回归：两个独立 `ContextCompilerMcpService` 首次打开同一个尚不存在的 DB，两者都必须构造成功并通过 health；不能向宿主暴露可重现的 `database is locked` / `STORAGE_FAILURE`。
3. 如采用 retry，必须是内部有界且只针对安全的 SQLite busy/locked 初始化路径，不得吞掉真实 schema / trigger / ALTER / 数据损坏错误。
4. 保留已初始化 DB 的双连接 raw mirror / operation trace 幂等、原子回滚、旧库 migration 及本次已关闭的五组反例；再重跑 focused、full、protocol、build、DS-13/14 和 production-only package/stdio。

### re-QA 回归与打包证据

- 修复 focused：8 个相关测试文件，158/158 PASS。
- 全量 `npm test`：458 PASS / 1 个既有 opt-in official runner SKIP。
- `npm run test:protocol`：8/8 PASS；其中真实 `npm pack` + production-only 隔离安装 + stdio 启动/关闭通过，协议仍精确暴露九个工具。
- `npm run build`、`git diff --check HEAD^..HEAD`：PASS。
- DS-13 `validate-results.mjs`：fixed Git object anchor、36 answer / 8 lexical Probe 诊断复现，没有重跑 official artifact。
- DS-14 定向回归：ST-01 7/7、ST-02 contract 8/8、empty-state score 8/8、feasibility results 7/7，合计 30/30 PASS。
- candidate 相对父提交没有修改 `evaluation/`；provider/network/Graph DB/Experience Formation/PACE 范围未扩大。

### re-QA 冻结判断

首轮的 vacuous telemetry 自证、特殊 JSON 丢失、Dense 极值、persisted-row 错误分类与 Runtime v2 合同已经关闭，没有新的 P0/P1。但 fresh DB 双实例启动 P2 使 operational stability 尚未闭合，因此本轮仍为 FAIL；WO、PROJECT_STATE 与 ROADMAP 保持 `QA FIX IMPLEMENTED / INDEPENDENT RE-QA PENDING`。Dense 效果与 Experience Formation 效果继续标记为 **未评估**，本次不授权进入下一阶段或任何 Context 算法扩展。
