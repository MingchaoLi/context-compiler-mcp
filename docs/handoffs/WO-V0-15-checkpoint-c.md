# WO-V0-15 Checkpoint C — Builder 交接

日期：2026-08-24

状态：**BUILDER COMPLETE — FINAL INDEPENDENT QA PENDING**

固定起点：`main@314d309dff7806633943d5b4796c2804c9cc9ba2`，起点工作树 clean。

## 收口前最小变更清单

### 必须修改，本 checkpoint 已实现

- Raw Event / `ingest_event` 增加严格 optional caller Dense；旧 SQLite 增量 migration，不重写已有 raw。
- `compile_context` 增加严格 optional `context_policy`、`dense_query`、`operation_id`；九工具不变。
- Recent N 完整用户轮次原文保持 mandatory；窗口外只在最近 `N × multiplier` 个完整用户轮次中做 BM25 + caller-Dense bounded retrieval。
- Dense 只有 query 与整个候选集同 `vector_space_id`、同维、有限、非零 norm 时运行；missing/partial/space/dimension/zero-norm 均整腿退化 BM25-only。
- verified-failure reference 才能把候选倍数从默认 5 扩至 8、limit 从 8 扩至 16；所有值严格有界且只是实验配置。
- dormant 只作为 placement：ACTIVE Constraint 强制；无 operation id/baseline/provenance、旧/坏 telemetry 全 fail-open；dependency closure、更新、历史 hit 与当前 query 可救援/重激活。
- `operation_id` compile 把去正文 trace 与 hits 在一个 ledger transaction 中幂等追加；固定 input/state/raw boundary 重试不重复，同 id 不同 payload 冲突，写失败不改 raw/state。
- README、架构、决策、需求、项目状态、路线图与本工单更新为双轨和 freeze candidate。

### Checkpoint A/B 已经满足，本 checkpoint 未重做

- 五类 typed state、supersede/resolve/reject/dependency lifecycle 与 deterministic reducer。
- current-event Extractor contract v2 correctness；legacy v1 parser/official replay 兼容。
- append-only 七类 Experience Ledger、同 session provenance、raw + EVENT mirror 同事务、旧库 migration observation。
- provider/model/network/Graph DB 为零；未来 ACTION/OUTCOME/FEEDBACK/CANDIDATE_EXPERIENCE 只通过 library ledger API 显式追加。

### 独立 QA 接受后可直接冻结

- Context / State 新算法、复杂 ontology、PACE/mem0 对比、retrieval 调参与 Graph DB。
- 默认 5/8/15、BM25/Dense weights 与 limit 只作为配置，不继续理论化。
- 下一阶段只进行真实使用和 Event–Action–Outcome / Feedback 数据积累；Experience formation/promotion 需另开工单。

## 实现合同

### 1. 历史兼容与输出分区

`assembleContext` 新增单一 optional `operational` placement 输入。字段缺失时不增加 output field 或 render section，历史 evaluator、DS-11 packet builder、DS-13/14 artifact 继续走原路径。Operational path 新增：

- `retrieved_history`，与 `recent_conversation` 物理分开且按 id 去重；
- `dormant_state_ids` / `reactivated_state_ids`；
- `operational_debug`，含候选范围、模式、Dense availability、逐 event BM25/Dense/combined 原始分数、selected ids 与 token。

Retrieved History 是 operational compile 的 mandatory 部分；`token_budget` 继续只决定 optional compact historical notes，mandatory state/recent/retrieved/current 超预算时显式 `budget_exceeded/overage`，不静默丢内容。

### 2. 可复算召回

- 分词：Unicode NFKC、locale-independent lower case、Unicode letter/number/underscore token；
- BM25：`k1=1.2`、`b=0.75`、standard positive idf，按候选集最大值归一；
- Dense：cosine 后截为 nonnegative，再与 normalized BM25 按有界 weights 加权；
- tie-break：combined、BM25、Dense、较新 seq、event id；只选择正分候选；
- Dense partial/mismatch 不混排，debug 明示具体 `dense_unavailable_*` 原因。

### 3. Dormant telemetry

首次带 `operation_id` 的 `CONTEXT_COMPILE` 只建立 session baseline，不冷却 item。后续仅对非 Constraint 的 ACTIVE/OPEN root 评估：item 最新 `source_refs + DERIVED_FROM` 对应可计算 user turn，raw seq 严格晚于 baseline；age `>= N × dormancy_multiplier`；历史 `STATE_ITEM` hit 为零；当前 query 无 lexical token hit。任一证据缺失即保留前台。

Assembler 对剩余 roots 做原有 dependency closure；被 closure 需要的 dormant candidate 作为 dependency item 纳入，并记录 `DEPENDENCY_RESCUE`。Placement 不修改 item、relation、revision 或 raw。

### 4. Compile trace 幂等

`source_key` 由 caller `operation_id` 确定。trace payload 固定 policy version、规范输入/current-input SHA-256、state revision/fingerprint、raw boundary/fingerprint、result fingerprint 和 selected ids，不含 current input 或 raw content。trace 与所有 hit 原子提交；retry 如果已有 trace，会把 telemetry 视图截断到原 trace sequence，从而避免后来的 hits 改变旧 operation 的计算。固定 snapshot 重试返回同 trace/hits；协调改写 current/policy/state/raw 会触发 `CONFLICT`。

## Builder 验证

- 新 C focused：`test/operational-context.test.ts` + `test/operational-context-service.test.ts`，14/14 PASS；
- 既有 focused：assembler/raw/ledger/MCP/evaluator/protocol，106/106 PASS；
- 全量 `npm test`：449 PASS / 1 个既有 opt-in official runner SKIP；
- `npm run test:protocol`：8/8 PASS；
- `npm run build`：PASS；
- `git diff --check`：PASS；
- 真实 `npm pack`：PASS，tarball 56 files，113.0 kB；
- production-only isolated prune：PASS，仅保留声明的 runtime dependency；
- isolated stdio：精确九工具，health PASS；带 Dense ingest + operation-id operational compile 真实调用返回 1 个 retrieved event、`dense_availability="hybrid"` 与持久 trace id。

覆盖的非空反例包括：N-turn exact、normal 5/recovery 8、BM25/Dense/hybrid、partial/space/dimension/zero-norm fallback、tie、recent/retrieved 去重、dormant 阈值上下界、Constraint、update、hit、reactivation、dependency rescue、无 baseline/provenance/坏 telemetry fail-open、operation retry/conflict、trace/hit 注入失败原子回滚、compile ledger 不含 current 正文、raw/state 不变、legacy Dense migration 与 strict malformed inputs。

## 保留风险与独立 QA 重点

- Dense 是 caller-supplied plumbing；没有真实宿主全候选向量覆盖时会正常保持 BM25-only，本交付不证明 hybrid 效果。
- dormant 的“生命周期从未 hit”只从首个 operation-id baseline 后可观察；因此旧库与证据不完整都 fail-open，可能多保留 Context，但不会误冷却。一次 state hit 会使该生命周期以后不满足 zero-hit 条件，这是用户冻结规则，不是热度学习。
- lexical current-query hit 与 BM25 是确定性工程定义，不是语义充分性证明。默认 multiplier/weights/limit 未调参，也没有 outcome-quality 证据。
- compile snapshot 是顺序读取的实际 state/raw bytes 并以 hash 锚定，不是跨多个 store connection 的全局 SQLite read transaction；并发改变 snapshot 会在 operation-id retry 中表现为 conflict，而不是伪装幂等。
- 独立 QA 应重点攻击：旧 operation retry 被后续 telemetry 污染、Dense partial mixed ranking、operation/source-key 协调改写、坏 ledger payload 导致误 dormant、cross-session/future failure ref、raw mirror Dense migration、trace/hit 部分提交、默认 assembler/output/token 字节兼容与生产 tarball 九工具边界。

本 Builder 未调用远端模型、未实现 Experience Formation、未批准自己的工作。
