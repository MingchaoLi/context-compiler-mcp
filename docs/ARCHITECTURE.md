# Architecture

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
  -> active state + dependency closure
  -> recent raw window + current input
  -> compiled snapshot + metrics

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

## v0 职责：State Compilation

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

`Goal`、`Constraint`、`Decision`、`OpenQuestion`、`RejectedAlternative` 及其 lifecycle / relation 构成 authoritative state。仍为 ACTIVE 的约束、决策和开放问题不参与普通 semantic relevance competition；即使与当前输入词面或语义相似度很低，只要依赖闭包要求，assembler 也必须可靠纳入。

## 长期分层，不是当前实现范围

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
- **Evidence**：过去什么现在可能重新有用；probabilistic、relevance-oriented，属于未来 Historical Evidence Layer。
- **Experience**：长期历史说明了什么规律；abstraction、slow-evolving，属于未来研究。

PACE 类 Context Compression / Long-horizon Agent 方案可作为未来 Evidence Paging 的强 baseline 或 Extension Point，但不改变 v0 的 State Compiler 边界。当前显式 headline、exact/keyword recall 仍只是调用方主动使用的证据恢复原语，不等于运行时 semantic paging。

除非当前测试失败直接要求，否则 v0 禁止引入 SemanticRetriever、ContextScorer、embedding 历史重激活、PACE 式多粒度摘要、Full/Detailed/Brief/Placeholder 表示、pressure-adaptive selection、glimpse/page-fault、Experience abstraction 或 learned compression policy。

## v0 验证 Gate

1. **Correctness**：Constraint 不丢失；Decision lifecycle、OpenQuestion、superseded/rejected 状态正确；不得 vacuous pass。
2. **Context Reduction**：Correctness 成立后，再比较真实开发轨迹中的上下文成本。
3. **Operational Stability**：extractor 连续运行、reducer deterministic、replay 一致、provenance 可追踪，mismatch / extraction error 可诊断。

三个 Gate 未通过前，不启动 Evidence Paging、PACE 或 Experience Layer 实现。

## Modules

- `raw-store.ts`: durable raw evidence and token estimator.
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
- Active constraints are assembled from known-active state, not guessed from pruning.
- Authoritative active state is not ranked against historical evidence by semantic relevance.
- Compact representations retain provenance and exact evidence remains recoverable.
- Compiler failure must be containable by an external host; this package never controls a host's fallback policy.
- The core performs no network requests and contains no UI or application-host imports.
