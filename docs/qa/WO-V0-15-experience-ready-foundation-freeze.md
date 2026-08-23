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

---

## 第二个 append-only fix 独立 re-QA（2026-08-24）

结论：**FAIL — fresh DB 竞争已关闭，但旧库并发 check-then-ALTER 仍有 P2；WO-V0-15 继续保持 PENDING，不得标记 ACCEPTED/FROZEN。**

### 固定候选与边界

- 分支：`main`
- 固定候选：`2739bc5251c2a0b80d6b76b3977fb3903792a7e7`
- 固定父提交：`4e366f3bd1545c1e9870de0f640195d0de232363`
- re-QA 开始与测试完成后候选均为 clean；分支、HEAD、parent 未漂移，`git diff --check HEAD^..HEAD` 通过。
- 本次未调用模型或网络，未修改 core、Gold、`feasibility-01`、WO-DS-14 official artifact 或 evaluation；QA 只追加本报告。
- 环境：macOS / Darwin 25.5.0 arm64、Node.js 25.6.1、npm 11.9.0；Windows 与 exact Node.js 24 未单独复跑。

### 已关闭问题的独立重放

- 首轮五类反例继续关闭：baseline 后 no-id 零写且稳定拒绝，exact trace/hit 变异 fail-open，public 保留 namespace 不可伪造；`__proto__ / constructor / prototype` 在 live/backfill/idempotency/fingerprint 中无损；`1e308 / Number.MIN_VALUE / 多维大数` cosine 有限且可复算；坏持久行稳定 `STORAGE_FAILURE`；RuntimeStateUpdater 成功及失败均保持 `contract_version:2`。v1 legacy parser/apply 和 DS-13/14 固定重放未漂移。
- 上轮 fresh DB 竞争已关闭。不依赖 Builder 断言的独立 `SharedArrayBuffer + Atomics` 同步攻击得到：direct Raw store 60/60 实例成功，独立 `ContextCompilerMcpService` 60/60 实例构造成功且 health ready，十组双 stdio 程序 20/20 全部 health ready、stderr 为空。
- SQLite 初始化 retry 边界与 Builder 合同一致：`ERR_SQLITE_ERROR + errcode 5/6`、`SQLITE_BUSY*`、`SQLITE_LOCKED*` 才重试；`errcode 1/11`、无 errcode 的普通 `ERR_SQLITE_ERROR`、`SQLITE_IOERR`、业务 schema error 及伪装 `ERR_OTHER + errcode 5` 均只调用一次并抛出同一 error object。持续 BUSY 共尝试 8 次（7 次延迟后耗尽）并抛回原异常；真实 service 在外部 `BEGIN IMMEDIATE` 持续锁下约 43.8 秒后稳定返回 `STORAGE_FAILURE`，未无界等待或误报请求参数。
- 已初始化 DB 的 same-source ingest 与 same-operation compile 仍保持两连接幂等：分别只留一条 raw + EVENT mirror，以及一条 CONTEXT_COMPILE + 一条 RETRIEVAL_HIT。

### 新阻塞问题

#### P2：两个实例并发升级缺少 Dense 列的 legacy raw DB 时，仍可在 check-then-ALTER 之间竞争失败

`initializeSqliteConnection` 已正确只重试 SQLite BUSY/LOCKED，但 `src/raw-store.ts` 的 `migrate` 没有把 `PRAGMA table_info(raw_events)` 的缺列检查与 `ALTER TABLE raw_events ADD COLUMN dense_embedding_json TEXT` 包在同一排他事务中。两个连接可同时看到该列缺失；其中一方 ALTER 成功后，另一方的 ALTER 抛出 `ERR_SQLITE_ERROR: duplicate column name: dense_embedding_json`。该错误按本 fix 的严格白名单正确不重试，但由于 migration 本身未原子化，仍会使一个合法实例启动失败。

独立动态证据：

- 预先构造 v0 旧 raw schema（保留 `sessions / raw_events`，唯独缺少 `dense_embedding_json`），每组用同步 barrier 打开两个 `SqliteRawHistoryStore`。100 组 / 200 个实例中 4 个失败，错误均为 `duplicate column name: dense_embedding_json`。
- 对相同 legacy schema 同步打开两个 `ContextCompilerMcpService`，100 组 / 200 个实例中 2 个启动失败，对外是 `ContextCompilerServiceError(STORAGE_FAILURE)`。
- 这不是人工伪造普通 ALTER 错误后要求宽泛重试，而是项目自己的“先检查、后 ALTER”旧库升级路径在已要求支持的双连接启动下不可串行化。失败不会破坏已有数据，但会让共享 legacy DB 的一个宿主/MCP 进程在 health 前退出，因此仍属 operational stability 范围的 P2。

### 精确返回条件

1. 从本 QA 报告提交再追加一个最小 fix，只关闭 legacy raw schema 的并发升级竞争，不修改 Context policy、evaluator、Gold、official artifact 或进入 Experience Formation。
2. 优先使 raw schema inspection + ALTER 在同一 SQLite 排他事务中完成，或者在 duplicate-column 后严格重新验证目标列已被并发方以预期形状创建。不得把所有 `ERR_SQLITE_ERROR`、duplicate-column、schema、ALTER、corruption 或 I/O 错误加入重试/吞错白名单。
3. 新增同步双 Worker/双 service legacy migration 回归：从无 Dense 列的真实旧 schema 开始，两者均必须 health，最终列只有一个且原始 raw 行、trigger、EVENT-only backfill 与序号完全一致。
4. 保留 fresh DB Raw / service / stdio barrier、busy/locked 有界耗尽、非 busy 单次抛错、预初始化后 source/operation 幂等和前两轮已关闭的全部反例。再跑 focused/full/protocol/build/diff/DS-13/14 与 production-only pack/stdio。

### 回归与打包证据

- focused 9 文件：165/165 PASS。
- 全量 `npm test`：467 PASS / 1 个既有 opt-in official runner SKIP。
- `npm run test:protocol`：10/10 PASS；包含 fresh Raw/service/stdio 并发用例、真实 `npm pack`、production-only 隔离安装、精确九工具与 stdio 进程关闭。
- `npm run build`、`git diff --check HEAD^..HEAD`：PASS。
- DS-13 fixed-object validator：PASS；36 answers / 8 lexical Probes 诊断复现，未重跑 official artifact。
- DS-14 定向回归：ST-01 7/7、ST-02 contract 8/8、empty-state score 8/8、feasibility results 7/7，合计 30/30 PASS。
- candidate 相对父提交没有修改 `evaluation/`；未新增 provider/network/Graph DB/Experience Formation/PACE 范围。

### 本轮冻结判断

没有新的 P0/P1；fresh DB 与前两轮所有反例均已关闭。但 legacy raw DB 并发 ALTER P2 仍使已承诺的旧库兼容和 operational stability 不完整，因此本轮仍为 FAIL；WO、PROJECT_STATE 与 ROADMAP 继续保持 `QA FIX IMPLEMENTED / INDEPENDENT RE-QA PENDING`。Dense 效果与 Experience Formation 效果仍为 **未评估**，本次不授权冻结、进入下一阶段或扩展 Context 算法。

---

## 第三个 append-only fix 独立 re-QA（2026-08-24）

结论：**PASS — WO-V0-15 ACCEPTED / FROZEN。** 前三轮的全部非空反例已关闭，本轮没有 P0/P1/P2。首轮和两次返回历史继续 append-only 保留，但不再表示当前候选状态。

### 固定候选与独立性

- 分支：`main`
- 固定 source candidate：`76169d8f99e6c0fbe7d99a640cd8d21c033cdf9e`
- 固定父提交：`d59feeb2e855f7f7ded729085e89e4559bf40c2d`
- re-QA 开始与测试完成后，分支、HEAD、parent 均未漂移，source candidate 工作树 clean，`git diff --check HEAD^..HEAD` 通过。
- 本次未调用模型或网络，未修改 core、Gold、`feasibility-01`、WO-DS-14 official artifact 或 evaluation。QA 只追加中文报告并在 PASS 后更新 WO / PROJECT_STATE / ROADMAP。
- 环境：macOS / Darwin 25.5.0 arm64、Node.js 25.6.1、npm 11.9.0；Windows 与 exact Node.js 24 未单独复跑。

### legacy migration 高轮次同步攻击

独立 QA 从缺少 `dense_embedding_json` 的旧 `sessions / raw_events` schema 开始，保留一条 seq 非 1、含 Unicode 正文与特殊 JSON 数据键的原始 raw 行，以 `SharedArrayBuffer + Atomics` 同步释放两个实例：

- direct `SqliteRawHistoryStore` 100 组 / 200 实例全部成功。
- 独立 `ContextCompilerMcpService` 100 组 / 200 实例全部构造成功且 health ready。
- 双 stdio 30 组 / 60 个真实 MCP 子进程全部 health ready，stderr 为空。
- 每组在并发完成后又进行第三次重启，随后独立查库：Dense 列精确一个，为 `TEXT / nullable / no default / non-PK`；旧 raw id/session/seq/source/role/正文/时间/token/metadata 字节不变且新列为 `NULL`；raw update/delete append-only trigger 精确各一个；EVENT backfill 恰好一条、ledger seq 为 1、`migration_backfill:true`，重启没有重复回填。

### 事务、回滚与 retry 边界

- 代码级核对确认 raw migration 在读取 `PRAGMA table_info(raw_events)` 前取得 `BEGIN IMMEDIATE`，table/index/trigger、inspection、conditional ALTER 全在同一事务内，成功后才 COMMIT。
- 独立注入一个非 busy schema 冲突，让 index 名与已有 table 冲突。构造在约 1 ms 内原样抛出 `ERR_SQLITE_ERROR / errcode 1 / there is already a table named ...`；事务回滚后无 Dense 列、无半成品 raw trigger，原异常未被 rollback 覆盖。
- `src/sqlite-initialization.ts` 相对上一个 fix 没有字节变化；retry 白名单没有扩大，仍只接受 SQLite `BUSY / LOCKED`。上轮已验证的 8 次有界耗尽、非 busy 单次原样抛出与 service `STORAGE_FAILURE` 分类继续通过 focused/full 回归。

### 其他非空反例重放

- fresh DB 独立同步重放：direct Raw + Service 合计 100 组 / 200 实例零失败；protocol 还重放 Raw / Service / stdio fresh barrier。
- 预初始化 DB 上，same-source ingest 仍只有一条 raw + EVENT mirror；same-operation compile 仍只有一条 CONTEXT_COMPILE + 一条 RETRIEVAL_HIT。
- 首轮五类问题继续关闭：no-id telemetry gap 被稳定拒绝且零写，exact trace/hit 变异 fail-open、public 保留 namespace 不可伪造；`__proto__ / constructor / prototype` 在 live/backfill/idempotency/fingerprint 中无损；Dense `1e308 / Number.MIN_VALUE / 多维大数` 有限可复算；坏持久行映射 `STORAGE_FAILURE`；RuntimeStateUpdater 成功及失败均保持 `contract_version:2`。v1 legacy parser/apply 和 DS-13/14 固定重放未漂移。

### 回归、打包与范围

- focused 9 文件：165/165 PASS。
- 全量 `npm test`：468 PASS / 1 个既有 opt-in official runner SKIP。
- `npm run test:protocol`：11/11 PASS；包含 fresh/legacy 并发、same-source/same-operation、真实 `npm pack`、production-only 隔离安装、精确九工具、stdio health 与进程关闭。
- `npm run build`、`git diff --check HEAD^..HEAD`：PASS。
- DS-13 fixed-object validator：PASS；36 answers / 8 lexical Probes 诊断复现，未重跑 official artifact。
- DS-14 定向回归：ST-01 7/7、ST-02 contract 8/8、empty-state score 8/8、feasibility results 7/7，合计 30/30 PASS。
- candidate 相对父提交没有修改 `evaluation/`；没有新增 provider/network/Graph DB/Experience Formation/PACE 范围，MCP 工具仍精确为九个。

### 接受与冻结边界

WO-V0-15 的实现 correctness、兼容、并发、迁移和打包合同已有足够非空证据，因此独立 QA 接受并冻结 Context / State 基础设施。该 PASS **不表示** Dense retrieval 有正向效果，也不表示 Experience Formation 已实现或有效；二者均仍为 **未评估**。

下一阶段只转向真实长期使用，积累可回放的 `Event -> Action -> Outcome / Feedback -> Candidate Experience` 数据。Context / State 默认只允许 correctness 修复；不再进行 Context 算法、PACE/mem0 对比、retrieval 调参、Graph DB 或 Experience Formation 实现，除非之后另有明确工单和独立验证。

---

## 终局对抗审查 P1 修复独立 re-QA（2026-08-24）

结论：**PASS — WO-V0-15 再次 ACCEPTED / FROZEN。** 冻结后终局对抗审查提出的 public v1 source-less late update dormant P1 已由最小 append-only fix 关闭；本轮没有发现新的 P0/P1/P2。前述三次返回、历史 PASS 与冻结后重开记录全部保留，但不再表示当前候选状态。

### 固定候选与独立性

- 分支：`main`
- 固定 source candidate：`7567ac1219db65886bdc157af969c51a379a9fb9`
- 固定父提交：`4ccb4a2d1e3fc51ce4e2aa960e97c26f4ea6af4e`
- re-QA 开始时分支、HEAD、parent 精确匹配且工作树 clean；source diff 仅包含本次 state-snapshot dormancy 修复、对应测试、handoff 与冻结状态文档，`git diff --check HEAD^..HEAD` 通过，`evaluation/` 相对父提交零差异。
- 本次没有调用模型或网络，没有修改 core、Gold、`feasibility-01`、WO-DS-14 official artifact 或 evaluation。QA 只追加中文报告，并在 PASS 后更新 WO / PROJECT_STATE / ROADMAP。
- 环境：macOS / Darwin 25.5.0 arm64、Node.js 25.6.1、npm 11.9.0；Windows 与 exact Node.js 24 未单独复跑。

### 终局 P1 独立动态复现

QA 没有用内部 helper 代替 public path，而是分别通过真实九工具服务的 `prepare_state_update` 与 `apply_state_delta` 建立三类 v1 source-less late mutation：

1. 更新既有 ACTIVE item 的 `content`；
2. 把一个既有 ACTIVE item 改为 `COMPLETED`，同时保留另一个未更新 ACTIVE item；
3. 在两个既有 ACTIVE item 之间新增 `DEPENDS_ON` relation。

三类 mutation 均使 authoritative state revision 前进到 2；QA 以稳定 JSON 规范化和 SHA-256 独立重算当前 `revision + items + relations` 指纹，逐项与新 trace 的 `state_sha256` 核对一致。更新后的首个 operation-id compile 不沿用旧 snapshot baseline：整次 dormancy fail-open、刚更新或仍有效的 root 保持前台，同时写入新 snapshot 的可信 trace。此后在同一 snapshot 中插入两个中间 compile，连续尾部仍以该 snapshot 的第一条 trace 为 baseline，没有被中间 compile 重置；相对新 baseline 经过 14 个完整用户轮次时没有 dormant，第 15 个轮次才允许满足其他条件的非 Constraint root dormant。status mutation 中已完成 item 不被误作 ACTIVE root；content 与 relation mutation 的 ACTIVE root 行为均符合上述边界。

### revision / hash / telemetry 攻击

- latest trace 为旧 revision + 旧 hash、当前 revision + 伪 hash、当前 hash + 错 revision、或最新尾记录退回旧 snapshot 时，均全量 dormancy fail-open。
- exact-shape trace 出现未知键或坏结构时 telemetry 标为不完整并 fail-open；不能把坏记录解释成 zero-hit。
- 同一 current revision/hash 的连续尾 trace 只取该 snapshot 的第一条作为 age baseline；14/15 边界独立复算通过。
- 同 operation-id 重试在后续 telemetry 已追加后仍返回逐字相同 trace 与完整 context，且 ledger 没有重复写；同 id 异输入与并发幂等合同由 focused/protocol 回归继续覆盖。

这些结果同时关闭“只看 revision”“只看 hash”“latest trace 形状合法即可”“中间 compile 重置年龄”四类替代实现。任一旧、伪造或不完整 snapshot 证据都不能使 dormant fail-closed。

### 既有 correctness 与兼容反例重放

- v2 current-event provenance、scripted non-empty Delta、zero-hit、所有 ACTIVE Constraint 强制保留，以及 hit/query/dependency rescue 全部通过 focused 回归；public v1 parser/apply 与 DS-13/14 固定回放未漂移。
- 前三轮五类反例继续关闭：不完整/伪造 telemetry、`__proto__ / constructor / prototype`、Dense 极值与维度/覆盖降级、坏 persisted row 的 `STORAGE_FAILURE` 分类、RuntimeStateUpdater `contract_version:2` 均未回归。
- fresh 与 legacy SQLite 并发路径由真实 protocol 再次同步重放：独立 Raw store、Service 与双 stdio 均 ready；预初始化 same-source ingest / same-operation compile 仍幂等；legacy schema migration、EVENT backfill、append-only trigger 与 production-only package 均通过。候选没有改动已接受的 SQLite initialization 实现。

### 回归、打包与范围

- focused 10 文件：172/172 PASS。
- 全量 `npm test`：469 PASS / 1 个既有 opt-in official runner SKIP。
- 独立 `npm run test:protocol`：11/11 PASS；覆盖 fresh/legacy 并发、same-source/same-operation、真实 `npm pack`、production-only 隔离安装、精确九工具、stdio health 与进程关闭。
- `npm run build`、`git diff --check HEAD^..HEAD`：PASS。
- DS-13 fixed-object validator：PASS；只复现既有 automatic diagnostic / blank review bundle，没有重跑 official artifact 或模型。
- DS-14 定向回归：ST-01 7/7、ST-02 contract 8/8、empty-state score 8/8、feasibility results 7/7，合计 30/30 PASS。
- 没有新增 provider/network/Graph DB/Experience Formation/PACE，Context reduction、Dense retrieval 效果和 Experience Formation 效果均未在本工单评估。

### 最终接受与冻结边界

本轮用真实 public v1 mutation、独立 state fingerprint、连续 snapshot 尾部和 14/15 边界关闭了终局 AR 的最强反例；现有证据足以恢复 WO-V0-15 的 `ACCEPTED / FROZEN`。该结论只接受 correctness、兼容、迁移、并发、可回放和打包合同，不声明 Dense 有收益，也不声明 Experience 已形成或有效。

下一阶段只允许通过真实长期使用积累可回放的 `Event -> Action -> Outcome / Feedback -> Candidate Experience` 数据。Context / State 基础设施默认冻结；除非出现新的可复现 correctness 缺陷或另立明确工单，不再开发 Context 算法、复杂 ontology、PACE/mem0 对比、retrieval 调参、Graph DB 或 Experience Formation。

---

## 第五个 telemetry-completeness fix 独立 re-QA（2026-08-24）

结论：**FAIL — 返回 Builder；WO-V0-15 继续保持 FROZEN REOPENED / PENDING INDEPENDENT RE-QA。** 单实例 pre-origin gap 与 provenance 双门的静态反例已经关闭，但独立 QA 发现一个可由两个真实服务实例触发的新 P1：首个 operation-id compile 的“检查尚无 telemetry”与 `CONTEXT_COMPILE` 实际提交之间不是跨实例原子边界，期间另一个实例仍可合法执行无 id 命中。第五个 fix 随后把该 item 当作 origin 后创建、全生命周期 zero-hit，并在第 15 轮错误 dormant。

### 固定候选与边界

- 分支：`main`
- 固定 source candidate：`cdd1d79446453b3593f5486570a1f7c031af8ddb`
- 固定父提交：`c016813ea26134dedbd1ce09bfdcd6a1d73ea848`
- re-QA 开始时 branch / HEAD / parent 精确匹配且工作树 clean；`git diff --check HEAD^..HEAD` 通过，`evaluation/` 相对父提交零差异。
- 候选只修改 global-origin dormant 判定、两份 focused tests、中文 handoff 及 reopened 状态文档；没有修改 ledger schema、MCP 工具、retrieval 权重、Gold、official artifact 或 Experience 范围。
- 本次没有调用模型或网络，没有修改 source、tests、Gold、artifact、WO、PROJECT_STATE 或 ROADMAP；QA 只追加本中文失败记录。
- 环境：macOS / Darwin 25.5.0 arm64、Node.js 25.6.1、npm 11.9.0；Windows 与 exact Node.js 24 未单独复跑。

### 已关闭的原反例与正向边界

QA 使用独立脚本而非照抄 Builder test，通过真实 `ContextCompilerMcpService` 公共路径复得以下结果：

- origin 前用 public v1 `prepare_state_update / apply_state_delta` 创建两个 ACTIVE Goal，再执行一次无 `operation_id` 的相关 query；该 query 确实选中两个 Goal，ledger 中仍为零条 compile/hit。随后写入首个可信 origin 并增加 15 个完整用户轮次，两个 Goal 均保持 active。
- 对其中一个 pre-origin Goal 再做 public v1 source-less content update；新 snapshot 首 compile `dormancy_enabled:false`，再跨 15 轮两个 Goal 仍保持 active，authoritative 内容与 `ACTIVE` status 正确。
- 空状态 global origin 后，以真实 `RuntimeStateUpdater` contract v2 创建带 current-event provenance 的 Goal；creation ref 严格晚于 origin。新 snapshot 首 compile 只建 baseline，中间 compile 不重置年龄，第 14 轮仍 active、第 15 轮 dormant，State Store status 始终为 `ACTIVE`。
- 独立纯函数反例确认：多个 creation refs 全部可解析且均晚于 origin 时可进入正向分母；无 creation relation、后补但时间不等于 item creation 的 `DERIVED_FROM`、ref 位于 origin 边界或一组 refs 混入 origin 前证据时均 fail-open。现有输入/StateStore 校验继续拒绝跨 session 或悬空 raw ref。
- 上一轮 public v1 content/status/relation late-update、Constraint、prior hit、query reactivation、dependency rescue、坏 telemetry、revision/hash mismatch 与 14/15 snapshot 边界均通过 focused/full 回归。

这些结果足以接受第五个 fix 的单实例判定方向，但不足以证明 global origin 在并发下是一个真实的全局 observation boundary。

### P1：origin trace 提交前仍允许另一个实例产生不可观测命中

QA 用同一 SQLite 文件、两个独立 `ContextCompilerMcpService` 和 `SharedArrayBuffer + Atomics` 只控制调度，不改写产品输入或返回值，稳定复现两种 interleaving。更强且最小的一种是：

1. session 先只有 raw seq 1、空 state、空 compile telemetry。
2. 实例 A 发起首个带 `operation_id` 的 `compile_context`，完成 state/raw/ledger 读取与 context/trace 计算；QA 只在内部 append-only trace 真正提交前暂停 A。此时 A 的待写 payload 为 `state_revision:0`、`raw_boundary_max_seq:1`、`selected_state_ids:[]`。
3. 实例 B 在同一数据库 ingest raw seq 2，通过真实 public v1 prepare/apply 创建一个带 seq 2 creation provenance 的 ACTIVE Goal。
4. 因 A 尚未提交任何 `CONTEXT_COMPILE`，B 的无 `operation_id` 相关 compile 通过 `hasTrustedContextCompileBaseline` 检查，真实选中该 Goal，但按兼容合同不写 trace/hit。
5. A 恢复并提交首条 trace。第五个 fix 将它作为 global origin：Goal 不在 origin selected ids，creation ref seq 2 严格大于 origin raw boundary 1，因此被判为 origin 后可完整观测。
6. 再为 current revision/state 写一次 snapshot baseline，增加 15 个完整用户轮次并用无关 query compile。实际输出为 `dormancy_enabled:true`、`dormant_state_ids:[goal]`、`active_goals:[]`，而 `get_state` 仍返回该 Goal 为 `ACTIVE`。

第二种调度在 A 读取 raw boundary 后、读取最新 revision 前插入相同的 B 操作，也得到同一错误结果；但上述第一种已经证明即使 origin payload 自身是完全一致的 revision 0 snapshot，问题仍成立。因此只检测“同 revision 异 state hash”、只在下一 snapshot rebaseline，或继续收紧 creation ref，都不能关闭该竞态。

根因是 global origin 以**首条已提交 trace**定义，服务却在该 trace 提交前没有数据库可见的 telemetry-start reservation。`hasTrustedContextCompileBaseline` 的检查、context 读取/计算和 trace append 分离；另一个进程/服务可以在 time-of-check 与 commit 之间完成合法 no-id hit。结果再次违反“整个生命周期 zero-hit”和“telemetry 不完整必须 fail-open”，严重度为 P1。

### 精确返回条件

Builder 只需继续做一个 bounded correctness fix，不扩大算法或 Experience 范围：

1. 在首个 operation-id compile 开始建立 telemetry 时，先创建同 session、数据库可见、可重试且不可伪造的 reservation / origin marker，或提供等价的跨实例原子协议。任何与其竞争的无 id compile 必须稳定拒绝，或者永久把该 session/item 标为 coverage incomplete；不能等最终 trace 提交后才切换规则。
2. reservation、最终 trace、失败回滚和 operation-id retry 必须有明确事务语义：失败不得遗留会永久锁死 session 的半状态，相同 operation 重试不得重复 origin/trace，不同 operation 并发不得产生两个相互矛盾的 origin。
3. 新增两个独立服务的同步 barrier 回归，至少固定“实例 A 已完成首 operation 计算但尚未写 trace；实例 B create + no-id related compile；A commit；current snapshot + 15 turns”这条序列。可接受结果只有：B 被拒绝/被记录，或该 Goal永久 fail-open；不得 dormant。
4. 保留本轮已通过的单实例 pre-origin public v1、post-origin strict v2 creation、source-less late update、snapshot 中间 compile、14/15、provenance 歧义与全部旧并发/幂等回归。仅增加 revision/hash 事后检查不满足返回条件。

### 回归与非阻塞事实

- focused 10 文件：176/176 PASS；Builder handoff 中 `156/156` 与当前独立实际计数不一致，但不是本次 P1 的依据。
- 全量 `npm test`：473 PASS / 1 个既有 opt-in official runner SKIP。
- `npm run test:protocol`：11/11 PASS；fresh/legacy Raw/Service/双 stdio、same-source/same-operation、真实 `npm pack`、production-only 隔离安装、精确九工具与进程关闭均通过。
- `npm run build`、candidate diff-check：PASS。
- DS-13 fixed-object validator：PASS；没有重跑模型或 official artifact。
- DS-14 定向固定回放：30/30 PASS。

除上述 concurrency origin P1 外，本轮没有发现新的 P0/P1/P2。Dense retrieval、Context 语义效果与 Experience Formation 效果仍为 **未评估**。在返回条件关闭前不得恢复 `ACCEPTED / FROZEN` 或进入真实使用数据积累；也不得借此引入 PACE、Graph DB、ontology、retrieval 调参、provider/model 或 Experience Formation。
