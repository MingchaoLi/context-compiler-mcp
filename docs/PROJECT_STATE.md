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

统一公开 contamination 扫描确认 `STR-02`、`STR-03`、`STR-11`、`STR-12`、`STR-15` 存在评测复用。正式 freeze 的最小未污染推荐输入为 STR-07/08、STR-05/06、STR-01/04（2 short / 2 medium / 2 long），但尚未冻结。尚未运行 D0/D1/D2、远端模型、aggregate 或 PASS rate，也未修改 Context Compiler core。

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
- Starlette schema pilot 已独立接受，但不是正式数据集 freeze 或 D2 效果证据；后续另开最低 6 条的 freeze 工单。`STR-02` 已拆分且与 STR-03/11/12/15 一并因公开 benchmark contamination 排除盲评；`no_public_hit_found` 仍不是绝对无污染声明。
- 持久化 preparation snapshot 尚无明确的有界保留策略。

WO-ST-01 through WO-ST-03 and WO-EV-02 are complete and independently accepted. Formal host mode remains out of scope and has not started.
