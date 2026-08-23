# WO-V0-15 — Experience-ready Context / State 基础设施收口冻结

状态：PLANNED — IMPLEMENTATION NOT STARTED

## 背景校准

项目长期研究目标是理解真实经历如何形成 Experience，并进一步影响 Agent 后续判断与行动。Context / State Compiler 只负责让 Agent 能低成本、可追溯地长期运行并积累可信的 Event–Action–Outcome / Feedback 数据；本工单不再以证明 Context Compiler 相对 PACE、mem0 或其他成熟方案更先进为目标。

本工单是 v0 的收口式调整，不是新架构阶段。完成并经独立 QA 接受后，Context / State 基础设施冻结；后续默认只允许 correctness 修复，不再新增 Context 算法、复杂 ontology、PACE 对比、retrieval 调参或 Graph DB。

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
- parser 必须 fail-closed 拒绝缺 provenance、只引用旧 recent event、非法 nested field、同一步不可解析引用及 lifecycle/reference 冲突。
- 用本地 scripted transport 证明 prompt 能产生 reducer 可接受的 non-empty Delta；不得调用远端模型，也不得重跑 DS-14 capture。

### 2. Recent Raw 与 hybrid window-out recall

- `recent_raw_window_turns = N` 继续按最近完整用户轮次选取原文，默认值保持兼容；这些 raw event 不得被 retrieval 排名、摘要或压缩。
- 仅对 Recent Raw 之外、最近 `N × candidate_turn_multiplier` 个用户轮次中的 raw event 做 bounded retrieval。
- retrieval 为 BM25 + Dense cosine 的可解释混合；Dense 向量由调用方以 provider-neutral 数据提供，core 不生成 embedding、不选择 provider、不联网。
- Dense 数据不存在或维度不匹配时必须显式报告 `dense_unavailable` / 等价状态并安全退化到 BM25，不能把 BM25-only 冒充 hybrid 成功。
- 默认普通候选倍数与 targeted recovery 候选倍数分别取 5 与 8；二者和 limit/weights 都是带严格边界的配置参数，不写成理论规则，不做调参实验。
- `CompiledContext` 必须物理区分 `recent_conversation` 与 `retrieved_history`，debug/metrics 报告候选范围、模式、分项分数和 token；同一 raw event 不得同时出现两处。

### 3. Dormant / cold placement

- 对非 Constraint 的长期未闭合 item，在其最后 provenance/update 对应 turn 超过约 `N × dormancy_turn_multiplier`（默认 15）后，只有同时满足以下条件才从前台 root 中退出：整个生命周期 retrieval hit count 为 0；之后无 provenance/update；当前 query 未命中；不是 dependency closure 所需。
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
- `compile_context` 仍不调用 extractor/model/provider/network；新增 ledger append 是显式披露的本地 observation side effect。
- SQLite migration 必须兼容已有数据库，不能删除、重写或回填伪造历史语义；如为既有 raw event 建 ledger mirror，必须使用确定性来源标识并明确为 migration observation。
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
- 不进入下一阶段；本工单接受后冻结 Context / State 基础设施。
