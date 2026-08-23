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

WO-DS-01 已完成 Starlette 候选筛选：预注册规则先于研究报告提交，15 条公开真实轨迹中推荐 8 条，分布为 2 short / 2 medium / 4 long。关键节点对抗审查结论为 `Agree with reservations`：该报告足以进入三案例 schema pilot，但不足以直接批量规范化并冻结 8 条。该交付只是候选报告；尚未生成时间切片、Gold、fixture、hash 或 D0/D1/D2 输出，也未修改 Context Compiler core。

## 最新对抗审查

2026-08-23 在 ST-03 接受后完成了首次独立对抗审查，结论为 `Challenge`。该结论不否定 ST-01 至 ST-03 的实现 QA；它指出现有证据主要证明“实现符合工单”，尚不足以证明“工单顺序是验证核心假设的最小投资路径”。完整记录见 `docs/adversarial-reviews/AR-2026-08-23-post-st03.md`。

审查提出三个需要在下一次重大投入前明确处置的问题：ST-02 的空 probe、`current_input` 污染及缺少 D2 相对 D1 门槛；ST-01 是否真是首轮语义实验的技术 blocker；ST-03 的持久化 preparation 在连续抽取失败后缺少有界保留策略。WO-EV-02 已关闭空 probe 与 `current_input` 污染并显式报告 D2-vs-D1 原始成本，但按范围没有新增决策门；preparation 保留风险仍未形成实现工单。

## Current behavior

`compile_context` reads stored evidence and state and returns a compiled snapshot and numeric metrics. It does not invoke an extractor, change state, create headlines, or perform retrieval automatically. State changes remain explicit: callers may perform prepare/extract/apply themselves or use the accepted ST-03 library coordinator with an explicitly supplied local adapter process. The core selects no model/provider and performs no network request. The explicit `CONTEXT_COMPILER_DB_PATH` is the standalone database configuration. `DSH_HOME` is retained only as a legacy compatibility fallback.

## Known gaps

- No implicit state evolution or extractor invocation from compile/ingest/MCP.
- No automatic headline generation.
- No formal compiler mode in any host adapter.
- WO-EV-02 已完成尺子校准；真实 Starlette 轨迹和远端回答实验完成前，evaluator 仍不能充当最终决策门。
- Starlette 下一步先用 STR-08/05/02 做三案例 schema pilot，显式审计 STR-02 composite/split，并统一扫描全部 15 条的 benchmark contamination；pilot 通过后才另开最低 6 条的 freeze 工单。STR-15 已因公开 benchmark contamination 从 v1 推荐集中排除。
- 持久化 preparation snapshot 尚无明确的有界保留策略。

WO-ST-01 through WO-ST-03 and WO-EV-02 are complete and independently accepted. Formal host mode remains out of scope and has not started.
