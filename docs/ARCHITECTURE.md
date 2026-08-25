# RippleContext Architecture

## Project identity and adapter boundary

`RippleContext` is the public product/project name. The existing `context-compiler-mcp` npm package,
stdio executable, MCP server identity, exact-nine tool surface, environment variables, library exports,
schema, and storage formats remain compatibility identities.

This repository owns only the model-independent, Host-independent Core and MCP service. Official
Harness/Host adapters live in the separate `RippleContext-adapter` repository and may use only this
Core's stable public MCP contract. Branding does not authorize a Host dependency, provider selection,
runtime lifecycle change, or technical-identity migration.

## Data flow

```text
event producer
  -> ingest_event
  -> append-only raw_events (SQLite)

explicit state delta
  -> strict parser
  -> deterministic reducer
  -> context_items / state_relations (SQLite)

prepare_state_update
  -> validate current continuous raw suffix
  -> persist immutable snapshot identity + fingerprint
  -> return bounded provider-neutral extractor input

apply_state_delta
  -> parse complete untrusted delta before mutation
  -> revalidate preparation fingerprint + state revision in one SQLite transaction
  -> apply all deterministic reducer transitions or none

compile_context
  -> mandatory recent N complete user turns
  -> bounded BM25 + caller-Dense window-out recall
  -> lifecycle-preserving dormant placement + dependency closure
  -> compiled snapshot + metrics
  -> optional append-only trace when operation_id is present

create_headline / recall_*
  -> immutable headline index
  -> exact raw evidence recovery

offline evaluation fixture
  -> D0 complete raw transcript
  -> D1 bounded recent transcript
  -> D2 existing assembler + labeled headline recall
  -> v1 reproducibility or v2 provenance-bound historical projection
  -> aggregate quality, reduction, latency, and raw D2-vs-D1 token cost

explicit optional runtime update
  -> durable prepare
  -> one local JSON extractor child (provider owned outside core)
  -> strict State Delta validation
  -> atomic apply
```

## 项目主目标与 v0 基础设施职责

长期研究目标是理解真实经历如何由 `Event -> Action -> Outcome / Feedback` 形成 Candidate Experience，并进一步影响 Agent 的未来判断与行动。Context / State Compiler 是支撑长期运行与可信数据积累的基础设施，不再是下一阶段的主要研究对象，也不以 PACE、mem0 等成熟方案为比较对象。

v0 采用双轨：

- **前台 Context 轨**：Recent Raw 原文、typed state、bounded retrieval、dormant placement 与 targeted recovery，只要求长期运行“够用即可”；
- **后台 Research Data 轨**：append-only Raw Event / Experience Ledger 完整保留 provenance 与 replay，不因前台 suppress/compact 丢失事件。

State Compilation 仍回答：

v0 回答的问题是：

> 过去发生了这么多事情，现在什么仍然成立？

其主路径固定为：

```text
Raw Event Store
  -> State Extractor
  -> State Delta
  -> Deterministic Reducer
  -> Typed Active State
  -> Dependency-aware Context Assembly
  -> Compiled Context
```

`Goal`、`Constraint`、`Decision`、`OpenQuestion`、`RejectedAlternative` 及其 lifecycle / relation 仍构成 authoritative state。所有 ACTIVE Constraint 强制进入前台；supersede / resolve / reject 等 lifecycle 只由 reducer 改写。非 Constraint 的长期未闭合 item 可以在严格 telemetry/provenance 条件下变为 dormant placement，但 authoritative status、revision、relations 与 source refs 不变；当前命中或 dependency closure 会在本次 compile 重新纳入。

## 长期分层与冻结边界

```text
                   Raw History
                        │
         ┌──────────────┼──────────────┐
         ↓              ↓              ↓
       State         Evidence       Experience
         │              │              │
  State Compiler   History Pager    Abstraction
```

- **State**：现在什么仍然成立；deterministic、correctness-oriented，属于当前 v0。
- **Evidence**：前台只保留 bounded BM25 + caller-supplied Dense 的最小窗口外召回；PACE 式 pager、多级摘要、page fault 仍不实现。
- **Experience**：后台 ledger 为未来研究保存数据；Experience abstraction、promotion、学习或决策影响仍未实现。

PACE 类方案不再是 v0 需要证明先进性或互补性的对象。当前 operational retrieval 只是收口所需的 bounded policy，不授权多粒度表示、pressure-adaptive paging 或 retrieval 调参研究。

除已冻结的 BM25 + caller-Dense 小窗口外，禁止继续引入新的 Context 算法、ContextScorer、core-side embedding、多粒度摘要、Full/Detailed/Brief/Placeholder、pressure-adaptive selection、glimpse/page-fault、Graph DB、Experience abstraction 或 learned compression policy。

## v0 验证 Gate

1. **Correctness**：Constraint 不丢失；Decision lifecycle、OpenQuestion、superseded/rejected 状态正确；不得 vacuous pass。
2. **Context Reduction**：Correctness 成立后，再比较真实开发轨迹中的上下文成本。
3. **Operational Stability**：extractor 连续运行、reducer deterministic、replay 一致、provenance 可追踪，mismatch / extraction error 可诊断。

WO-V0-15 独立 QA 接受后，Context / State 基础设施冻结；后续默认只允许 correctness 修复。下一阶段转向真实使用与 Event–Action–Outcome / Feedback 数据积累，而不是继续开发 Context 算法。

## Modules

- `raw-store.ts`: durable raw evidence and token estimator.
- `experience-ledger.ts`: append-only EVENT/ACTION/OUTCOME/FEEDBACK/CANDIDATE_EXPERIENCE/CONTEXT_COMPILE/RETRIEVAL_HIT data plane.
- `operational-context.ts`: bounded BM25/caller-Dense recall, targeted recovery, fail-open dormant placement, and trace fingerprints.
- `state-types.ts`, `state-store.ts`, `reducer.ts`: explicit typed state and code-owned transitions.
- `state-update.ts`: durable preparation snapshots and revision-guarded atomic State Delta application.
- `extractor.ts`: provider-neutral transport interface and strict delta validation. No runtime provider is configured.
- `assembler.ts`: deterministic build-up assembly and debug manifest.
- `recall.ts`: headline storage, FTS keyword lookup, and exact evidence recovery.
- `evaluation.ts`, `evaluation-cli.ts`: strict provider-neutral D0/D1/D2 fixtures, metrics, thresholds, and JSON CLI。Version 1 保留既有可复现语义；version 2 使用带 provenance 的 Probe、显式 `not_evaluable`、排除 `current_input` 的历史投影，并报告原始 D2-vs-D1 token 成本。评估使用隔离临时数据库，不调用模型或网络。
- `subprocess-extractor.ts`: bounded one-shot local JSON transport. It invokes no shell and owns no provider, network, or credential configuration.
- `runtime-state-update.ts`: explicit library-only prepare/extract/apply composition. It is not called by compile, ingest, recall, or MCP dispatch.
- `mcp-service.ts`: sanitized nine-tool library service.
- `mcp-server.ts`: protocol schemas, stdio lifecycle, and protocol-pure process entry point.

## Boundaries and invariants

- Raw evidence is append-only; suppression never deletes it.
- A model may propose a delta, but code validates and owns the transition.
- Preparation identities are immutable; raw events may be appended after preparation, but prepared evidence and the expected state revision must still validate at apply time.
- Active constraints are assembled from known-active state and never ranked away.
- Dormant is placement only; it never rewrites authoritative lifecycle/state.
- Recent Raw and retrieved history are physically separate and deduplicated.
- Dense is all-or-nothing per candidate set; partial/mismatched coverage never produces mixed rankings.
- A compile trace contains hashes/ids/policy, never current-input or raw-event正文。
- Compile telemetry 是 session 级 opt-in 连续合同：可信 baseline 前无 id 为 read-only；baseline 后无 id 拒绝。只有完整 exact-shape trace/hit batch 可建立 baseline，坏 telemetry 只能使 dormant fail-open。
- Ledger public append 只写未来研究四类记录；EVENT mirror 与 compile/hit namespace 由内部原子路径保留。递归 JSON 规范化无损保留所有合法数据键。
- Dense cosine 先按各向量最大绝对值缩放再计算；极大/极小有限向量不得溢出后伪装为 hybrid 零分，残余不可计算情况显式 `dense_unavailable_numeric`。
- Compact representations retain provenance and exact evidence remains recoverable.
- Compiler failure must be containable by an external host; this package never controls a host's fallback policy.
- The core performs no network requests and contains no UI or application-host imports.
