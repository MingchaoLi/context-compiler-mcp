# Project state

Updated: 2026-08-23

## Current approved baseline

- Append-only SQLite raw-event storage with per-session sequencing and source-event idempotency.
- Typed context state, SQLite state storage, strict State Delta parsing, and deterministic reducer primitives.
- Durable provider-neutral `prepare_state_update` and atomic `apply_state_delta` operations with immutable snapshot fingerprints and revision guards.
- Build-up context assembly from active state, dependency closure, recent raw evidence, and current input.
- Immutable history headlines plus exact and keyword recall.
- Strict versioned offline D0/D1/D2 evaluation with deterministic metrics, aggregate thresholds, and a package-safe JSON CLI.
- A local stdio MCP service with stable sanitized errors and exactly nine tools.
- Node.js `>=24`; official MCP SDK and Zod are runtime dependencies.
- Standalone package identity: `context-compiler-mcp`.

## Latest accepted delivery

WO-EV-02 passed independent re-QA on 2026-08-23 at fixed source candidate `93b71dde1c660feb2671d974cbb6eedb3b58340a`. The accepted evaluator v2 preserves version 1 reproduction, rejects non-plain or untraceable Probe inputs before execution, represents empty rates explicitly as `not_evaluable`, excludes `current_input` from historical matching while retaining it in cost/latency inputs, and reports raw D2-vs-D1 token cost without adding a gate. The first QA return and append-only fix are retained in the QA report. The package and real stdio MCP were verified production-only with exactly nine tools. The QA matrix exercised macOS 26.5.1 / Darwin 25.5.0 arm64 with Node.js 25.6.1 and npm 11.9.0; Windows and exact Node.js 24 remain unverified.

## Current candidate

WO-DS-02 的 Starlette schema 与三案例 pilot 已在第二次独立 re-QA 于 2026-08-23 接受，固定候选为 `2a65c85b1fc9554b24971e8ed20551eef3b53d39`。交付包含 3 个目录、4 个独立 segment、25 个时间有序 evidence event/slice；Gold、人工 Oracle-State、Decision Reference 与 Outcome Anchor 和输入物理隔离，pilot hash 明确保持 `pilot_not_frozen`。`STR-02` 已按证据拆成两个 medium segment，不再视为单一 long 根因链。

WO-DS-03 已在第二次独立 re-QA 于 2026-08-23 接受，固定候选为 `32600eb6b7caf3fbe339e1103d3293f0b7e33103`。STR-04 long/open canary 有 1 个 segment、18 events/slices/increments、七类文件隔离、`canary_not_frozen` hash 与字段级模型投影。首轮 RAGAS context-only 误判已由独立 QA 退回：该题 reference 是 FastAPI PR #15745；命中只作为限定风险保留。T13 tracker close 与 semantic resolution 已分离，不能将 Mount partial capability 冒充 #685 已解决。

同一预检还证明 STR-05 的 9 个 pilot event 都是真实信息增量，必须从 medium 更正为 long。由此，先前 STR-07/08、STR-05/06、STR-01/04 的 2/2/2 声明已经失效；正式 freeze 不能沿用该配额或把 STR-04 当未污染样本。尚未运行 D0/D1/D2、远端模型、aggregate 或 PASS rate。

WO-DS-04 已登记为当前工单，只做 STR-04/05/08 的确定性无模型接线冒烟。正式六案预注册固定为 STR-07/08/05/06/01/04，不得按任何 dry-run 或模型结果换案；2 short / 1 medium / 3 long 仅为预计分布。该工单只验证 collection index、字段投影、slice 前缀和 evaluator v2 输入/版本合同，不运行 `runEvaluationSuiteV2` 或远端模型，也不产生效果指标。

## 最新对抗审查

2026-08-23 在 ST-03 接受后完成了首次独立对抗审查，结论为 `Challenge`。该结论不否定 ST-01 至 ST-03 的实现 QA；它指出现有证据主要证明“实现符合工单”，尚不足以证明“工单顺序是验证核心假设的最小投资路径”。完整记录见 `docs/adversarial-reviews/AR-2026-08-23-post-st03.md`。

审查提出三个需要在下一次重大投入前明确处置的问题：ST-02 的空 probe、`current_input` 污染及缺少 D2 相对 D1 门槛；ST-01 是否真是首轮语义实验的技术 blocker；ST-03 的持久化 preparation 在连续抽取失败后缺少有界保留策略。WO-EV-02 已关闭空 probe 与 `current_input` 污染并显式报告 D2-vs-D1 原始成本，但按范围没有新增决策门；preparation 保留风险仍未形成实现工单。

DS-03 接受后的第二次关键节点对抗审查记录为 `docs/adversarial-reviews/AR-2026-08-23-post-ds03-canary.md`，结论为有限 `Challenge`。主控接受其更小路径：先做 DS-04 三案无模型接线冒烟，再按共同 cutoff promotion audit；未制作案例优先处理 STR-06，且所有最终案例必须逐案人工语义审计。长度/组件/outcome 混杂不阻止制作，但阻止无分层 aggregate 的一般化解释。

## Current behavior

`compile_context` reads stored evidence and state and returns a compiled snapshot and numeric metrics. It does not invoke an extractor, change state, create headlines, or perform retrieval automatically. State changes remain explicit: callers may perform prepare/extract/apply themselves or use the accepted ST-03 library coordinator with an explicitly supplied local adapter process. The core selects no model/provider and performs no network request. The explicit `CONTEXT_COMPILER_DB_PATH` is the standalone database configuration. `DSH_HOME` is retained only as a legacy compatibility fallback.

## Known gaps

- No implicit state evolution or extractor invocation from compile/ingest/MCP.
- No automatic headline generation.
- No formal compiler mode in any host adapter.
- WO-EV-02 已完成尺子校准；真实 Starlette 轨迹和远端回答实验完成前，evaluator 仍不能充当最终决策门。
- Starlette schema pilot 与 DS-03 long/open canary 已独立接受，但均不是正式数据集 freeze 或 D2 效果证据。`pilot_not_frozen`、`canary_not_frozen` 保持；STR-02/03/11/12/15 因公开 evaluation/benchmark 复用排除，STR-04 只有有限 `no_public_hit_found`，STR-05 按机械规则属于 long。剩余样本必须重新预注册实际分层，不能沿用旧 2/2/2 或直接运行模型。
- WO-DS-04 接线冒烟尚未实现或独立 QA；在其通过前不得开始正式 promotion/freeze。
- 持久化 preparation snapshot 尚无明确的有界保留策略。

WO-ST-01 through WO-ST-03 and WO-EV-02 are complete and independently accepted. Formal host mode remains out of scope and has not started.
