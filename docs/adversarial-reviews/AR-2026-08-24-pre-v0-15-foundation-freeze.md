# AR-2026-08-24：WO-V0-15 计划级对抗审查

- 审查基线：`main@c380f27f751801375582d0e9d17bc7396f288b1d`，开始时工作树 clean。
- 审查边界：只读工单及其路由的架构、决策、需求、现有 core/protocol 实现与必要测试；未实现代码、未运行模型或网络。
- 用户校准：长期研究目标是 Experience Formation；Context / State 是收口基础设施，不以新增 Context 算法为研究目标。

## Verdict

**Challenge。** WO-V0-15 目前不是一个“收口式单一结果”，而是把 Extractor 合同迁移、自动 Evidence retrieval、state placement policy、feedback recovery、append-only research ledger 和两个现有 MCP 行为的副作用变更合并进一个工单。最危险的部分不是 ledger，而是 BM25 + Dense、dormant 与 targeted recovery：它们正是当前 D-014 / REQUIREMENTS 明确后置的 Evidence Paging / semantic reactivation，并会把 authoritative ACTIVE Goal、Decision、OpenQuestion 从现有 mandatory roots 改成 query/history-dependent placement。此扩张不是 Experience 数据积累的必要条件。

建议在实现前修订或拆分 WO；不应以“这是最后一次 Context 改动”降低对新算法、状态副作用和兼容迁移的证据要求。

**审查后主控处置：** 主控接受本审查指出的计划级 blocker，并承诺在任何实现前用 append-only commit 修订 WO。新的用户校准 HEAD 将显式 supersede D-014 / REQUIREMENTS 中与本次用户明确要求冲突的 Evidence-retrieval 禁令；因此终稿不再把“违反旧 D-014”单独视为否决理由。主控不采纳删除 hybrid/dormant/recovery 的建议，而是保留用户明确要求，并拆为 A/B/C 三个独立 checkpoint 逐项 QA。StrictStateExtractor 将使用 versioned current-event provenance，旧 `apply_state_delta` / parser 合同保持可复现；`compile_context` 只在 caller 提供 `operation_id` 时追加幂等 ledger trace。该处置显著缩小了原工单的协调失败面，但修订后的 Dense、dormant、raw mirror/ledger 原子语义仍须在各 checkpoint 中冻结后才能开始实现。

## Facts

- `docs/ARCHITECTURE.md`、D-014 与 `REQUIREMENTS_V0.md` 当前均规定：ACTIVE Constraint、Decision、OpenQuestion 不参与普通 semantic relevance competition；v0 不实现 semantic retrieval、embedding historical reactivation 或运行时 History Pager。
- 当前 `assembleContext` 把所有 ACTIVE Goal/Constraint/Decision、OPEN Question 作为 mandatory roots，再做 dependency closure；Recent Raw 按完整用户轮次选择。当前 `compile_context` 被 MCP 描述为 read-only，只读取 raw/state 并返回 context/metrics。
- 当前 `StateDelta.NewItemDelta.source_refs` 是 optional；`parseStrictStateDeltaPayload` 同时服务 `StrictStateExtractor` 和公开 `apply_state_delta`。现有合法测试包含：从 `recent_context` 而非 `newest_events` 引用 provenance、无 `source_refs` 新建 item、无同步 `DERIVED_FROM` 的 update/resolve，以及 scripted transport 返回无 provenance 的 non-empty Goal。
- `SqliteRawHistoryStore.ingest` 在自己的连接和 `BEGIN IMMEDIATE` 中提交 raw event；MCP service 又分别持有 raw/state/recall 连接。当前 compile input 没有 caller operation/idempotency key。
- 当前九工具已经能 `ingest_event`、`compile_context`、显式 headline/keyword/exact recall；Experience Ledger 的 ACTION/OUTCOME/FEEDBACK 等只计划开放 library API，并未要求新增 MCP tool。

## Inferences

- 修复 DS-14 暴露的 prompt/schema mismatch 是 correctness 收尾；记录 Event–Action–Outcome/Feedback 的 append-only ledger 是 Experience 研究的数据基础。二者与自动 Dense retrieval/dormancy 没有技术依赖。
- “Dense 缺失时退化 BM25”能证明 provider-neutral plumbing，却不能使默认系统成为 hybrid；若真实宿主不提供同一向量空间的 query/candidate vectors，Dense 分支永远不运行。它不是当前长期使用的 blocker。
- lifecycle hit count 是由新 ledger 才开始观察的局部历史。`0 hit` 可能表示“从未记录”，而不是“从未有用”；因此用它驱逐现有 ACTIVE roots 会把 observability gap 当负证据。
- 保持九工具并使用 library-only ledger API 是当前仓库边界下的合理选择；它只应被称为 host integration extension point，不能声称现有 MCP 客户端已经能显式写入所有 Experience 类型。

## Strongest challenge 1：hybrid + dormant + recovery 是未获授权的 Evidence/Context 研究

**具体反例：** 一个已存在、仍为 ACTIVE、没有 `DEPENDS_ON` 边的 Decision 在 migration 前被每次 assemble 纳入，但旧系统没有记录 retrieval hit；它的 source event 已超过 `N × 15`，当前 query 没有词面命中。新规则会因 lifecycle hit count 为 0 将它置为 dormant。forced Constraint 与 dependency rescue 都救不了它。这既违反 D-014 的 mandatory ACTIVE state，又把“没有历史 telemetry”误当“从未命中”。反方向上，只要它偶然命中过一次，“整个生命周期 hit count 不再为 0”又会使它永久无法 dormant，规则不是稳定的冷热度量。

**Dense 反例：** query vector 和 event vector 都是 1,536 维，但来自不同 embedding 模型/版本；仅检查维度会把无意义 cosine 当 Dense 成功。若候选中只有部分 event 有向量，未规定是整批退化、仅对有向量项混合，还是对缺失项补零，排序将无法独立复算。WO 也未冻结 tokenizer/BM25 公式、score normalization、vector-space id、partial-missing 与 tie-break 合同。

**建议：** 本审查原建议从本工单删除自动 BM25/Dense、dormant 和 targeted recovery，只保留 extension point；主控因用户明确要求未采纳删除建议，而采纳拆分 checkpoint。故最低可接受修订是：Dense/retrieval 与 dormant/recovery 必须在独立 checkpoint，且新的架构决策先显式 supersede D-014。dormant 必须 fail-open：无 provenance、无可追溯 user turn、migration 前无 hit telemetry、hit 定义不明的 ACTIVE item一律不得冷却。

## Strongest challenge 2：compile/ingest ledger 副作用缺少可实现的幂等与原子合同

**具体反例：** `compile_context(session=S,current_input=Q)` 已把 `CONTEXT_COMPILE` 与 hits 提交，响应在返回前丢失；客户端用完全相同输入重试。若每次 append，会重复；若按内容 hash 去重，则用户稍后合法地再次编译同一 Q 会被错误合并。当前 API 没有 operation/idempotency key，无法区分二者，因此“失败后安全重试不得重复”不可满足。

`ingest_event` 也会先在 raw-store 事务提交，再由独立 ledger store 镜像。若 mirror 失败且调用方未提供 `source_event_id`，服务若报失败，重试可能新建第二个 raw event；若仍报成功，则出现无 EVENT mirror 的 raw。跨连接顺序还允许 compile 依次读取 items/relations/raw 后，记录一个未锚定到同一 snapshot 的 trace。

**建议：** 在 WO 中先冻结成功语义：

- ledger-enabled compile 必须有 caller-supplied `operation_id`（同 session 唯一），相同 id + 相同 payload 为幂等，相同 id + 不同 payload 冲突；trace/hits 必须在一个 ledger 事务中提交；ledger 失败时 compile 是否失败须明确；
- EVENT mirror 要么与 raw insert 在同一 SQLite transaction/trigger 中完成，要么明确采用“API 可能在 raw 已提交后报可重试失败”的 eventual repair，并要求 `source_event_id`；不能同时承诺一般重试无重复；
- `CONTEXT_COMPILE` 至少锚定实际使用的 raw range、state revision/payload hash、policy version 与 result hash，否则 ledger 不能可信 replay；
- 并发测试必须覆盖 response-lost retry、相同 operation id 冲突、两连接写竞争、ledger commit failure 及 raw 已提交后的恢复，而不只是关闭重开。

## Strongest challenge 3：strict provenance 会静默改写已接受的公开 Delta 合同

**具体反例：** 当前 extractor 测试中的 `new_goals.source_refs=[raw-1]` 合法，而 `raw-1` 位于 `recent_context`、不在 `newest_events`；update/resolve 没有同 Delta `DERIVED_FROM` 也合法。runtime scripted worker 还返回 `{new_goals:[{content:"Runtime-created goal"}]}`。若直接收紧共享 `parseStrictStateDeltaPayload`，这些输入以及经 MCP `apply_state_delta` 提交的同类 Delta 都会从合法变非法；如果只改 prompt 而不改共享 parser，又无法兑现 fail-closed provenance。

**建议：** 工单必须在实现前选择并验收一种显式兼容策略：版本化 Delta/provenance contract；或把 current-event provenance enforcement 限定在新的 Extractor-runtime validation 层，同时保留既有手工 apply 合同。不得更新旧测试期望后声称“全量回归通过”。还须明确 lifecycle change 的 provenance 是附着于被更新 item 的 `DERIVED_FROM`，以及 same-step 创建项因没有稳定 id 不能被 `new_relations` 引用时如何表达；否则 prompt 与 reducer 合法集合仍不相等。

## Cheaper path

本审查原建议将“v0 收口”缩成两个独立、可拒绝的结果，而不是当前五合一工单：

1. **Extractor contract closure：** 完整十数组 schema prompt、明确 ID/reference/lifecycle 规则、选择一种版本化 provenance 兼容策略，并用 local scripted transport 形成 reducer 可接受的 non-empty Delta。禁止 retrieval/dormancy/ledger side effect。
2. **Experience data ledger：** 只实现 append-only `EVENT/ACTION/OUTCOME/FEEDBACK/CONTEXT_COMPILE`、same-session parent refs、显式 idempotency 与 raw mirror/compile snapshot contract；保持 library-only 和九工具。`CANDIDATE_EXPERIENCE`、`RETRIEVAL_HIT` 随尚未实现的 Experience formation/Evidence retrieval 留作文档 extension point。

若必须进一步压缩，可先复用已有 append-only `raw_events` 的 `event_type + metadata + source_event_id` 做版本化 Event–Action–Outcome/Feedback envelope fixture，验证实际研究消费格式后再证明独立 ledger 表是必要的。BM25/Dense、dormant、targeted recovery 均不存在继续真实 Experience 数据采集的当前 blocker。

主控最终处置是保留用户要求但拆为 A/B/C checkpoint。只要每个 checkpoint 有单一结果和独立停止点，这比原始五合一工单更便宜且可拒绝；推荐顺序为 A：versioned Extractor correctness，B：带 `operation_id` 的 append-only ledger/镜像原子合同，C：hybrid + dormant + targeted recovery。C 不得以前两项 QA PASS 自动获得效果正确性。

## Falsification

### 会证明当前 Builder/工单判断错误的证据

- 实现使无 telemetry、无 provenance 或没有 dependency edge 的 ACTIVE Decision/Goal/OpenQuestion 因 `0 hit` 退出前台，或一次偶然 hit 导致永久不再 dormant；
- Dense 同维但不同 vector space、partial missing 或 zero-norm 时仍报告 hybrid success；
- response-lost compile retry产生重复 ledger，或按内容去重吞掉合法重复 compile；raw commit 后 ledger failure 无法在不重复 raw 的条件下修复；
- 收紧 parser 后，固定旧 contract 的合法 `apply_state_delta`/runtime fixture 被拒绝，却没有显式版本迁移；
- QA 只证明新模块各自测试通过，没有证明“这些模块是 Experience-ready foundation 的必要条件”或没有处理 D-014 冲突。

### 会让我撤回 Challenge 的证据

- WO 在实现前由明确决策修订 D-014/REQUIREMENTS，解释为何 Evidence retrieval/dormancy 现在成为真实 Experience 采集的必要条件，并提供来自长期运行而非合成 fixture 的具体 failure trace；
- dormant 对 migration/no-provenance/no-user-turn 全部 fail-open，hit 的对象、来源、时间与永久性规则预注册，ACTIVE state correctness 具有非空反例；
- Dense 合同固定 query/candidate 来源、vector-space/model version、finite/nonzero/dimension、partial-missing、normalization、BM25 formula 与 tie-break，并有真实 caller 提供 vectors 的非空路径；
- compile/ingest 具备可区分 retry 与合法重复调用的 idempotency key和明确 atomic/failure contract，独立并发/故障注入复验通过；
- provenance 采用版本化或边界隔离，旧 accepted contract 可按原版本复现，新 extractor 路径才 fail-closed。

### 会推翻本审查更小路径的证据

若真实、版本化运行日志证明：在 corrected State、Recent Raw 与现有显式 recall 下，缺少自动 hybrid retrieval/dormant/recovery 会直接阻止 Event–Action–Outcome/Feedback 的完整采集，且单独 ledger 无法取得同一研究数据，那么这些 Context 机制可成为后续 blocker。当前 WO 与仓库证据没有提供这种因果链。
