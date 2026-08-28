# RippleContext

RippleContext 是一个本地、模型无关、宿主独立的长期运行基础设施：前台用有界 Context / State 保持任务连续性，后台用 append-only Raw Event / Experience Ledger 完整保存可回放的研究数据。项目的长期研究目标是 Experience Formation；本包只负责“够用即可”的前台上下文与可信 Event–Action–Outcome / Feedback 数据面，不以证明自身优于 PACE、mem0 等方案为目标。

当前技术兼容身份仍为 `context-compiler-mcp`：npm package、stdio executable、MCP server identity、九个工具、`CONTEXT_COMPILER_DB_PATH` 与 `DSH_HOME` fallback 均不因项目品牌改名而变化。官方 Harness/Host 适配器属于独立的 `RippleContext-adapter` 仓库，本 Core 不引入宿主依赖。

The current server exposes exactly nine tools:

- `health`
- `ingest_event`
- `compile_context`
- `get_state`
- `prepare_state_update`
- `apply_state_delta`
- `create_headline`
- `recall_exact`
- `recall_keyword`

`ingest_event.created_at` 是可选的独立 source/event time，不是 append cursor。提供时必须是 RFC 3339
date-time（秒级或 1–3 位小数，`Z`/numeric offset），writer 会持久化并返回 UTC millisecond canonical
form；同 session 的 durable 顺序始终由 `seq` 表达，所以合法时间可以倒序、相等、迟到或 future-skew。
UTC 月末 RFC 3339 leap second（`:60`）保持为独立 instant，不会折叠到下一分钟。
历史 append-only Raw 中可解析的 RFC 3339 秒级/任意小数精度 timestamp bytes 在 read/replay 时保持
原样，不会 backfill 或改写；其精确 instant（包括 sub-millisecond digits）继续参与 source-event 幂等冲突判断。

公开 stdio `compile_context` 成功结果使用 closed-world allowlist：`context` 只返回
`session_id`、最终 `rendered_context`、`budget_exceeded`、`budget_overage`，另返回有限数值
`metrics`。候选列表、ranking/score、debug/manifest、trace/telemetry identity 与内部 raw/state/path
清单不属于普通 MCP 用户结果。Library/Core 调用仍可保留完整内部诊断结果；未来新增内部字段不会自动
穿透公开 MCP 边界。

`compile_context` 不调用模型、extractor、provider 或网络，也不修改 raw/state。session 建立可信 compile telemetry baseline 之前，缺少 `operation_id` 仍保持历史 read-only；一旦首次带 id 的 trace 成功提交，后续该 session 缺 id compile 会以 `INVALID_INPUT` 拒绝，不能混用可观测与不可观测请求。带 id 时只把去正文、exact-shape 的 `CONTEXT_COMPILE` 与 `RETRIEVAL_HIT` trace 原子、幂等地追加到后台 ledger。State 演进仍是显式两步操作：`prepare_state_update` 返回带 fingerprint 的有界快照，外部调用方取得候选 State Delta 后交给 `apply_state_delta` 严格校验并按 revision 原子应用。

## `CompiledContext` 与 `ContextSnapshot` 的边界

这两个名称对应不同的 package-root library surface，不可互换；本节不新增 MCP 工具或 API。

| 类型 | 公开入口与保证 | `NOT_PROVEN` / 禁止外推 |
| --- | --- | --- |
| legacy `CompiledContext` | [`assembleContext`、`renderCompiledContext` 与 `CompiledContext`](src/index.ts) 是兼容保留的有界上下文组装入口；`ContextCompilerCore.call("compile_context", …)` 返回完整 library 结果。它按 [legacy assembler contract](src/assembler.ts) 组合当前输入、选中的 active State、依赖闭包、recent Raw 与可选 retrieval，并报告确定性的预算/metrics。stdio MCP 只公开上文所列的 closed-world 投影。 | 它不是 canonical `ContextSnapshot`，也不证明完整 revision vector、exact evidence/as-of、immutable manifest、AttemptStarted receipt 或 Authority closure。调用方不得把它序列化、宣传或消费为具有这些 Snapshot 语义的对象；`debug_manifest`、event/state 列表或 `rendered_context` 也不能补足该证明。MCP 的更窄结果边界见 [`WO-PUB-01`](docs/work-orders/WO-PUB-01-public-mcp-result-boundary.md)。 |
| canonical `ContextSnapshot` | package root 导出的 [`ContextSnapshot` 类型与 policy constants](src/index.ts)，以及 `ContextCompilerCore.freezeContextSnapshot`、`readContextSnapshot`、`readContextAttemptStarted`，是独立的 library 入口。其冻结保证来自 [`ContextSnapshot` contract](docs/architecture/WO-05-context-snapshot-contract.md) 与 [stored implementation boundary](src/context-snapshot.ts)：显式 scope、exact five-axis as-of、Current Authority + Frontier-bound Hot Raw、immutable manifest/hash、同事务 AttemptStarted receipt、exact replay 与 fail-closed validation。 | 该 contract 不会反向提升 legacy `CompiledContext`，也不证明 Host 已消费、部署已激活、MCP 已公开 Snapshot、provider/model 已选择或某次 release 已接线。当前 repository authority 与这些非目标见 [`PROJECT_STATE`](docs/PROJECT_STATE.md) 和 [`ROADMAP`](docs/ROADMAP.md)。 |

因此，兼容代码可以继续使用 `CompiledContext` 作为有界上下文输出；需要 revision/evidence/attempt/authority
语义的代码必须通过 canonical `ContextSnapshot` 入口取得并验证对应对象，不能从 legacy 输出推断或补造。

Operational compile 固定以下小边界：

- `recent_raw_window_turns=N` 始终保留最近 N 个完整用户轮次原文，不排名、不摘要、不压缩；
- 窗口外只在最近 `N × multiplier` 个用户轮次内用可复算 BM25 召回；调用方可为 raw event 与 query 提供同一 `vector_space_id` 的 Dense 向量，只有全候选覆盖、同 space、同维度且 norm 可算时才整批进入 hybrid，否则整条 Dense leg 降级为 BM25-only；
- `candidate_turn_multiplier=5`、targeted recovery multiplier `=8`、dormancy multiplier `=15` 等只是严格有界、可配置的实验参数，不是理论规则；
- recovery 只接受同 session 已存在的 `event_type="verified_failure"` reference；默认仍使用较小上下文；
- dormant/cold 只是前台 placement，不改 authoritative lifecycle。ACTIVE Constraint 永不 dormant，dependency closure 可救援 target；旧库、缺 provenance、缺 operation-id baseline 或 telemetry 不完整时一律 fail-open；
- foreground suppress/compact 永不更新或删除 `raw_events` / `experience_ledger`。

Library ledger 的公开 `append` 只接收未来研究记录 `ACTION / OUTCOME / FEEDBACK / CANDIDATE_EXPERIENCE`。`EVENT` 只由 raw ingest/migration 原子镜像，`CONTEXT_COMPILE / RETRIEVAL_HIT` 只由内部 compile batch 生成；相应 source-key namespace 也被保留。严格 JSON 会把 `__proto__`、`constructor`、`prototype` 当作普通数据键无损保存，不把合法旧 raw metadata 当作控制字段。

`ingest_event` 可选接收调用方生成的 `dense_embedding: { vector_space_id, values }`；core 不生成 embedding、不选择 provider。`compile_context` 相应可选接收 `dense_query`、`context_policy` 与 `operation_id`。MCP 工具仍精确为九个。

## Requirements and setup

Node.js 24 or newer is required.

```sh
npm install --no-audit --no-fund
npm test
npm run build
```

Start the stdio server with an explicit local database path:

```sh
CONTEXT_COMPILER_DB_PATH=/absolute/path/context-compiler.db npm start
```

For compatibility with the originally approved adapter, `DSH_HOME` remains a legacy fallback and resolves to `DSH_HOME/sessions/context-compiler.db`. New integrations should set `CONTEXT_COMPILER_DB_PATH`; it always takes precedence.

The package can also be used as a TypeScript/JavaScript library through `dist/index.js` after building. It has no network or model-provider dependency.

## Offline evaluation

The provider-neutral evaluation runner compares a versioned JSON fixture across D0 full raw context, D1 recent context, and D2 compiled context. Version 1 remains available for exact historical reproduction. Version 2 requires provenance-bound Probe objects, represents empty denominators as `not_evaluable`, measures historical continuity without treating `current_input` as retained history, and reports raw D2-vs-D1 token delta/ratio alongside the existing D2-vs-D0 reduction. Probe matching still uses Unicode NFKC plus collapsed whitespace and exact containment; it is not a semantic model judgment or a remote-model call.

```sh
npm run evaluate -- /absolute/path/evaluation-suite.json
```

The CLI dispatches version 1 or version 2 from the root `version` field and writes the matching JSON report to stdout. Exit `0` means all aggregate thresholds passed, `2` means evaluation completed but a threshold failed or a required v2 metric was wholly `not_evaluable`, `3` means invalid input, and `4` means a sanitized runtime failure. Evaluation creates isolated temporary SQLite databases only for loading fixture evidence and exercising the existing headline recall implementation; it performs no model or network call and does not alter the nine-tool MCP protocol. The deterministic v2 ruler calibration fixture is `test/fixtures/evaluation-v2-calibration.json`; it is not Context Compiler effectiveness evidence.

## Optional local extractor runtime

Library callers may explicitly compose the accepted state-update pipeline with a local provider adapter process. The core starts the executable directly with `shell: false`, sends one `{ "version": 1, "prompt": string }` request, and accepts one `{ "version": 1, "delta": object }` response. The child owns any model SDK, network use, and credentials; none are selected or configured by this package.

```js
import {
  JsonSubprocessExtractorTransport,
  RuntimeStateUpdater,
  SqliteContextStateStore,
} from "context-compiler-mcp";

const store = new SqliteContextStateStore("/absolute/path/context-compiler.db");
const transport = new JsonSubprocessExtractorTransport({
  executable: "/absolute/path/provider-adapter",
  args: ["--stdio-once"],
});
const updater = new RuntimeStateUpdater(store, transport);
const result = await updater.updateState({
  session_id: "session-id",
  newest_event_ids: ["ordered-current-suffix-event-id"],
});
await transport.close();
store.close();
```

The runtime updater performs explicit prepare → strict extract → atomic apply. It is never invoked implicitly, and the MCP server remains exactly nine tools.

## Project facts

- [Current state](docs/PROJECT_STATE.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Decisions](docs/DECISIONS.md)
- [Roadmap](docs/ROADMAP.md)
- [v0 requirements index](docs/REQUIREMENTS_V0.md)
- [Migration provenance](docs/MIGRATION.md)

The archived original brief is intentionally not part of the normal agent reading path; use the concise requirements index first.
