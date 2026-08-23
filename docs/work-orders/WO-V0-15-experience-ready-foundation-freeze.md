# WO-V0-15 — Experience-ready Context / State 基础设施收口冻结

状态：FROZEN REOPENED — PENDING INDEPENDENT RE-QA

## 背景校准

项目长期研究目标是理解真实经历如何形成 Experience，并进一步影响 Agent 后续判断与行动。Context / State Compiler 只负责让 Agent 能低成本、可追溯地长期运行并积累可信的 Event–Action–Outcome / Feedback 数据；本工单不再以证明 Context Compiler 相对 PACE、mem0 或其他成熟方案更先进为目标。

本工单是 v0 的收口式调整，不是新架构阶段。完成并经独立 QA 接受后，Context / State 基础设施冻结；后续默认只允许 correctness 修复，不再新增 Context 算法、复杂 ontology、PACE 对比、retrieval 调参或 Graph DB。

2026-08-24 计划级对抗审查对原始五合一方案给出 `Challenge`。主控接受“风险域必须拆开验证、幂等与兼容合同必须先冻结”的挑战，但不删除用户明确要求的 bounded hybrid recall、dormant placement 与 targeted recovery。实施按三个 append-only checkpoint 顺序进行：

1. **A — Extractor correctness**：只修版本化 prompt/parser/provenance；
2. **B — Experience Ledger**：只加入 append-only data plane、raw mirror 与显式 operation id；
3. **C — Operational Context Policy + freeze**：最后接入 Recent Raw 外召回、dormant placement、targeted recovery 与文档冻结。

每个 checkpoint 都必须在进入下一个前通过 focused 与全量回归；最终统一交给独立 QA。审查记录见 `docs/adversarial-reviews/AR-2026-08-24-pre-v0-15-foundation-freeze.md`。

Checkpoint A 已完成代码与本地回归：新增 current-event provenance contract v2，并由明确命名的 `CurrentEventStateExtractor` 和现行 `RuntimeStateUpdater` 固定使用，结果与错误显式暴露合同版本；原 `parseStrictStateDelta` / `parseStrictStateDeltaPayload`、未带版本的历史 `StrictStateExtractor` 与 `apply_state_delta` 保持 v1 语义。WO-DS-14 pinned runtime、official capture、Gold 与评分结果均未修改，历史 replay 仍逐字节复现。

Checkpoint B 已完成代码与本地回归：新增独立 append-only `experience_ledger` 关系表与稳定 library store，冻结七类最小记录、session-local sequence / source-key 幂等、严格 JSON payload、同 session 已存在 raw/parent provenance 与外部连接 update/delete trigger。新 raw event 与确定性 `EVENT` mirror 由 `SqliteRawHistoryStore` 在同一 `BEGIN IMMEDIATE` transaction 中共同提交或回滚；旧库只按 raw session/sequence 确定性回填 `migration_backfill:true` 的 EVENT observation，不补造 ACTION / OUTCOME 等语义。Checkpoint B 本身未让 compile 写 trace，也未接入 retrieval / dormant / recovery；这些只由后续 Checkpoint C 实现。A/B/C 统一等待本工单最终独立 QA。

Checkpoint C 已完成 Builder 实现与本地回归：历史 `assembleContext` 缺省路径保持原输出/渲染/token 语义；MCP `compile_context` 通过 optional `context_policy` / `dense_query` / `operation_id` 进入 bounded operational path。Recent N 完整用户轮次与 retrieved history 物理分区；BM25 可独立复算，Dense 仅全候选同 space/同维/可算 norm 时启用，否则整腿 fail-closed 到 BM25。Verified failure 才可 recovery；dormant 仅在 baseline 后 provenance、age、zero state-hit 与完整 telemetry 条件同时成立时启用，Constraint 强制且 dependency closure 可救援。operation-id trace/hits 单事务追加，重试按原 trace seq 截断 telemetry 并保持幂等，不同输入冲突；payload 只含 hash、policy 和 selected ids，不含 current/raw 正文。C 及 A/B 仍待统一独立 QA，本状态不是自批准。

首轮独立 QA 于固定候选 `e0d9af3acd3273d592007f7cae273b2820807b36` 返回五项 correctness 问题；QA 报告提交后的固定修复起点为 `c625e1632de76e63d05ddfa68c787d19dc6fe2a7`。首个 append-only fix 当时收紧了 telemetry 信任边界、特殊 JSON 键无损规范化、Dense 极值数值稳定性、持久层错误分类和 Runtime v2 错误合同，并等待下一轮独立 re-QA；该段只保留历史过程，后续结论见下文。

修复后的连续 telemetry 合同是 opt-in 且不可混用：session 在首个可信 `operation_id` compile 之前，无 id compile 保持历史 read-only；一旦可信 baseline 已建立，后续 MCP `compile_context` 缺 `operation_id` 必须稳定拒绝，避免合法但不可观测的查询命中制造 telemetry gap。通用 ledger `append` 只允许 `ACTION / OUTCOME / FEEDBACK / CANDIDATE_EXPERIENCE`；`EVENT`、`CONTEXT_COMPILE`、`RETRIEVAL_HIT` 及其 source namespace 只由 raw 原子 mirror / 内部 trace batch 产生。坏或未知 telemetry 不建立 baseline，dormant 继续 fail-open。

2026-08-24 第三次 append-only fix 在固定 source candidate `76169d8f99e6c0fbe7d99a640cd8d21c033cdf9e` 通过独立 re-QA。首轮五项 correctness 问题、fresh DB 并发初始化与 legacy raw schema 并发 ALTER 竞争均已关闭；高轮次 Raw / Service / stdio 同步攻击、旧 raw 字节/序号保留、单一 EVENT backfill、事务回滚、幂等并发与 production-only pack 均通过。本工单现已接受并冻结；Dense 效果与 Experience Formation 效果仍为未评估。

2026-08-24 冻结后终局对抗审查在 `docs/adversarial-reviews/AR-2026-08-24-post-v0-15-freeze.md` 给出 `Challenge`：公开 v1 `prepare_state_update / apply_state_delta` 允许 source-less late mutation，但原 dormant telemetry 没有把新的 authoritative state snapshot 视为新的观测基线，因而可把刚更新的 ACTIVE item 错误移出前台。本冻结只为该 correctness P1 重开；第四个 append-only fix 已实现，等待独立 re-QA。此前接受事实保留为历史，不代表该反例已经关闭，也不授权 Context 算法或 Experience 范围扩张。

2026-08-24 独立 re-QA 已在固定 source candidate `7567ac1219db65886bdc157af969c51a379a9fb9` 关闭该终局 P1。QA 通过真实 public v1 content/status/relation late mutation 独立确认：authoritative state revision/hash 变化后旧 trace 不再建立 dormancy baseline，首个新 snapshot operation 全量 fail-open 并写入新 baseline；同 snapshot 中间 compile 不重置连续尾部首 baseline，14 个用户轮次不 dormant、第 15 个才允许 dormant。旧 trace、伪 hash、revision/hash 不一致、坏 telemetry、retry/并发及此前全部反例均通过，未发现新的 P0/P1/P2。本工单恢复 `ACCEPTED / FROZEN`；Dense retrieval 与 Experience Formation 效果仍未评估，下一阶段只进入真实使用数据积累。

2026-08-24 冻结返回最终复核 `docs/adversarial-reviews/AR-2026-08-24-post-v0-15-freeze-recheck.md` 再次给出 `Challenge`：snapshot baseline 只能证明最近 mutation 后的年龄，不能证明首个可信 telemetry 前 item 整个生命周期没有发生过无 id 命中。冻结因此只为 telemetry completeness P1 再次重开；第五个 append-only fix 同时保留 session global telemetry origin 与 current snapshot baseline 两道门，等待独立 re-QA。历史第四次接受继续保留，但不再代表 never-hit 合同完整关闭。

2026-08-24 第五个 fix 的独立 re-QA 在固定 candidate `cdd1d79446453b3593f5486570a1f7c031af8ddb` 返回 compile telemetry 线性化 P1：首个 operation-id compile 检查空 telemetry 与实际提交首 trace 之间存在跨实例 TOCTOU，另一个实例可在该窗口创建 state 并执行不可观测的无 id 命中。第六个 append-only fix 只用同一 SQLite 的 `BEGIN IMMEDIATE` 包住完整 compile 读取、assembly、首 trace/hits 与 commit，使 no-id compile、raw ingest 和 state apply 与 telemetry origin 处于同一可回滚线性顺序；当前仍为 `FROZEN REOPENED — PENDING INDEPENDENT RE-QA`。

## 单一结果

> 在不改变现有五类 typed state 与 reducer 生命周期语义、不增加 MCP 工具数量、不引入模型/provider/Graph DB 的前提下，修复已知 Extractor 合同问题，加入最小 hybrid history retrieval、正交 dormant placement、feedback-driven targeted recovery，以及 append-only Experience Ledger，使 v0 可用于长期真实运行与 Experience 数据积累，然后冻结该基础设施。

## 固定边界

- 保留五类 `ContextItem`：Goal、Constraint、Decision、OpenQuestion、RejectedAlternative。
- 保留现有 lifecycle 与 relation：completed/superseded/resolved/rejected/deferred，以及 `SUPERSEDES`、`DEPENDS_ON`、`RESOLVED_BY`、`REJECTS`、`DERIVED_FROM`。
- `dormant/cold` 是前台 Context placement，不是 authoritative lifecycle status；不得改写 State Store 中的语义状态。
- 所有 `ACTIVE` Constraint 都是强制约束，始终进入 Context；dependency closure 仍为强制闭包。
- Recent Raw 始终保留最近 N 个完整用户轮次原文，不参与压缩或摘要。
- 原始 `raw_events` 与 Experience Ledger 只追加、不更新、不删除；前台 suppress/compact 不得改动后台记录。
- 保持现有九工具 MCP capability 列表；新增能力通过既有 `ingest_event` / `compile_context` 的兼容 optional 字段和稳定 library API 提供。
- 不修改或重跑 `feasibility-01`、WO-DS-14 official capture、Gold 或历史 evaluator artifact。

## 必须实现

### 1. Extractor correctness 收口

- `StrictStateExtractor` prompt 必须提供完整、机器可核对的十数组嵌套字段合同，而不是只展示空数组 shape。
- prompt 必须明确合法 ID namespace、允许的 lifecycle transition、same-step reference 限制与 provenance 规则。
- 新建 state item 必须携带至少一个当前 `newest_events` provenance ref；已有 item 的 content/lifecycle 变化必须在同一 Delta 中包含指向当前 `newest_events` 的 `DERIVED_FROM`。
- provenance 收紧进入新的 versioned Extractor contract；既有 `parseStrictStateDeltaPayload` / 显式 `apply_state_delta` 的历史兼容语义保留，不能让已接受 fixture 和调用方被静默升级。新的 `CurrentEventStateExtractor` 和现行 `RuntimeStateUpdater` 明确使用新合同并在结果/错误中暴露版本；未带版本的 `StrictStateExtractor` 仅为 pinned 历史 replay 保留 v1 兼容。
- 新 parser 必须 fail-closed 拒绝缺 provenance、只引用旧 recent event、非法 nested field、同一步不可解析引用及 lifecycle/reference 冲突。
- 用本地 scripted transport 证明 prompt 能产生 reducer 可接受的 non-empty Delta；不得调用远端模型，也不得重跑 DS-14 capture。

### 2. Recent Raw 与 hybrid window-out recall

- `recent_raw_window_turns = N` 继续按最近完整用户轮次选取原文，默认值保持兼容；这些 raw event 不得被 retrieval 排名、摘要或压缩。
- 仅对 Recent Raw 之外、最近 `N × candidate_turn_multiplier` 个用户轮次中的 raw event 做 bounded retrieval。
- retrieval 为 BM25 + Dense cosine 的可解释混合；Dense 向量由调用方以 provider-neutral 数据提供，core 不生成 embedding、不选择 provider、不联网。
- Dense 输入统一为 `{ vector_space_id, values }`；space id 必须非空，values 为有界、非空、有限数字 dense array。一次 compile 只有在 query 与整个候选集合都具有相同 space 与维度时才运行 hybrid；缺失、partial coverage、space/维度不匹配均使整次 dense leg fail-closed 为 `dense_unavailable_*` 并统一退化到 BM25，禁止一部分候选用 hybrid、另一部分只用 BM25 的不可比排名。
- 默认普通候选倍数与 targeted recovery 候选倍数分别取 5 与 8；二者和 limit/weights 都是带严格边界的配置参数，不写成理论规则，不做调参实验。
- `CompiledContext` 必须物理区分 `recent_conversation` 与 `retrieved_history`，debug/metrics 报告候选范围、模式、分项分数和 token；同一 raw event 不得同时出现两处。

### 3. Dormant / cold placement

- 对非 Constraint 的长期未闭合 item，在其最后 provenance/update 对应 turn 超过约 `N × dormancy_turn_multiplier`（默认 15）后，只有同时满足以下条件才从前台 root 中退出：整个生命周期 retrieval hit count 为 0；之后无 provenance/update；当前 query 未命中；不是 dependency closure 所需。
- dormant 只允许用于具有可计算 current-event provenance turn、且其创建/最近更新不早于本功能 session telemetry baseline 的 item。既有数据库、无 provenance、无 `operation_id` compile history 或 telemetry 不完整时必须 fail-open 保留在前台，不能把“没有记录 hit”误当作“真实从未命中”。
- 退出只记为 `dormant/cold` placement；authoritative item status、relations、raw provenance 与 revision 不变。
- 当前 query 或 targeted recovery 命中 dormant item 时，该次 compile 必须重新纳入并记录 reactivation/hit；不得修改 authoritative lifecycle。
- zero-history、无 user turn、无 provenance、重复 compile、跨 session、阈值边界与 dependency rescue 必须有确定性测试。

### 4. Feedback-driven targeted recovery

- 默认 compile 使用较小候选范围；只有调用方提供同 session、已存在且明确标记为 failure/feedback 的 raw event reference 时，才进入 targeted recovery/expand。
- recovery 只扩大可配置 candidate window/limit，不改变 state lifecycle、不自动调用模型、不写入 Gold、不补造历史。
- 无效、跨 session、普通 message 冒充 failure、future/missing reference 必须拒绝。

### 5. Append-only Raw Event / Experience Ledger

- 新增独立 SQLite `experience_ledger`（或同等关系表）及 library store；不得使用 Graph DB。
- ledger 至少支持 `EVENT`、`ACTION`、`OUTCOME`、`FEEDBACK`、`CANDIDATE_EXPERIENCE`、`CONTEXT_COMPILE`、`RETRIEVAL_HIT` 记录类型。
- 每条记录包含稳定 session 顺序、发生时间、source/idempotency key、raw event / parent ledger provenance refs、严格 JSON payload；所有引用必须同 session 且已存在，禁止 future/dangling refs。
- 表与 public API 均不提供 update/delete；SQLite trigger 对其他连接也必须阻止 update/delete。
- `ingest_event` 成功后必须幂等地镜像一个 `EVENT` ledger record；`compile_context` 只追加 context trace/retrieval-hit，不修改 raw/state。失败后安全重试不得重复 ledger record。
- library API 允许未来宿主显式追加 ACTION / OUTCOME / FEEDBACK / CANDIDATE_EXPERIENCE；本工单不做 Experience 抽象、打分、promotion 或 learned policy。
- replay 按 session sequence 确定，关闭/重开数据库后一致；foreground suppress/compact 后 raw/ledger bytes 与行数不丢失。

## 兼容与冻结要求

- 现有 evaluator v1/v2、已冻结 fixture 和九工具协议必须保持可复现；新 operational policy 不得悄悄改写历史 evaluator artifact。
- `compile_context` 仍不调用 extractor/model/provider/network。新增 ledger append 是显式披露的本地 observation side effect，但只在调用方提供非空 `operation_id` 时启用；无 `operation_id` 保持历史 read-only 行为。相同 operation id + 相同规范化输入必须幂等返回同一 trace，不得重复；相同 id + 不同输入必须 `CONFLICT`。
- SQLite migration 必须兼容已有数据库，不能删除、重写或回填伪造历史语义；如为既有 raw event 建 ledger mirror，必须使用确定性来源标识并明确为 migration observation。
- 新 raw event 与其 `EVENT` mirror 必须在同一 SQLite transaction 内提交或回滚，不能接受“raw 已成功但 mirror 丢失”的双写窗口。已有 raw event 的 migration mirror 使用由 raw id 派生的确定性 id/source key，并在 payload 明示 `migration_backfill`；它只是来源镜像，不补造 Action/Outcome 语义。
- package surface 不新增 runtime dependency；真实 npm pack / production-only stdio 仍须通过。
- README、ARCHITECTURE、DECISIONS、REQUIREMENTS、PROJECT_STATE、ROADMAP 必须用中文优先写明双轨与冻结：前台 Context 够用即可，后台研究数据完整保留；下一阶段转向真实使用和 Experience Formation 数据准备。

## 路由文件

实现前只读取：

- `docs/ARCHITECTURE.md`
- `docs/DECISIONS.md`
- `docs/REQUIREMENTS_V0.md`
- `src/raw-store.ts`
- `src/state-types.ts`
- `src/state-store.ts`
- `src/reducer.ts`
- `src/extractor.ts`
- `src/assembler.ts`
- `src/mcp-service.ts`
- `src/mcp-server.ts`
- `src/index.ts`
- 对应现有 core/protocol tests

允许新增：

- 一个 bounded hybrid retrieval / placement 模块；
- 一个 append-only Experience Ledger 模块；
- 对应 focused tests、中文 handoff、独立 QA 与关键节点对抗审查记录。

## 验收

- Extractor prompt/schema/provenance 正反例全部通过，scripted non-empty Delta 可由同一 reducer 应用。
- Recent Raw N-turn 精确不变；BM25、Dense、hybrid、dense-unavailable、normal/recovery window 与去重算术可独立复算。
- dormant threshold、never-hit、update rescue、forced Constraint、dependency rescue、query reactivation 全有非空分母正反例。
- ledger 类型、idempotency、same-session provenance、append-only trigger、replay/restart、raw mirror 与 compile trace 全通过。
- 既有 lifecycle/reducer、ST-01、ST-02 evaluator、九工具 MCP、package/build 全量回归通过。
- Builder 提交中文 handoff；独立 QA 在固定 candidate 上执行协调改写、migration、并发/重试、跨 session、symlink/strict input 与真实 pack/protocol 检查。
- 对抗审查明确挑战 dormant 误删、retrieval hit 自证、Dense 缺失伪装、compile side effect、selection bias 与是否仍存在不必要的 Context 研究扩张。

## 明确不做

- 不实现 Experience formation、抽象、promotion、更新规则或最终决策影响实验。
- 不实现 PACE、多级摘要、glimpse/page fault、Graph DB、复杂 ontology、learned retrieval/compression。
- 不接入 embedding/provider SDK，不联网，不调权重，不做 PACE/mem0 benchmark。
- 不增加 MCP tool，不做 Formal Host Mode，不修改宿主仓库。
- Context / State 冻结当前只因 telemetry completeness P1 重开并等待独立 re-QA；通过后才可恢复冻结并转向真实使用与 Event–Action–Outcome / Feedback 数据积累，不由本工单隐式授权 Experience Formation 实现。
