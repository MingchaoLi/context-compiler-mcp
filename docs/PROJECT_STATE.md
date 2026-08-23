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

WO-ST-03 passed independent QA on 2026-08-23 at fixed source candidate `0b5b5dac28cbdbe78406211c9becf8646a7c114e`. The accepted delivery provides a bounded one-shot local JSON subprocess transport plus an explicit library-only prepare/extract/apply updater, with strict envelopes, sanitized failures, child lifecycle cleanup, retry/fallback containment, and atomic revision conflict handling. Independent process and two-connection SQLite tests found no residual direct child or partial state mutation. The package and real stdio MCP were verified production-only with exactly nine tools. The QA matrix exercised macOS 26.5.1 / Darwin 25.5.0 arm64 with Node.js 25.6.1 and npm 11.9.0; Windows and exact Node.js 24 remain unverified.

## Current candidate

WO-ST-03 is accepted. There is no pending core candidate. Formal host mode remains a separate future host-repository consideration.

## 最新对抗审查

2026-08-23 在 ST-03 接受后完成了首次独立对抗审查，结论为 `Challenge`。该结论不否定 ST-01 至 ST-03 的实现 QA；它指出现有证据主要证明“实现符合工单”，尚不足以证明“工单顺序是验证核心假设的最小投资路径”。完整记录见 `docs/adversarial-reviews/AR-2026-08-23-post-st03.md`。

审查提出三个需要在下一次重大投入前明确处置的问题：ST-02 的空 probe、`current_input` 污染及缺少 D2 相对 D1 门槛；ST-01 是否真是首轮语义实验的技术 blocker；ST-03 的持久化 preparation 在连续抽取失败后缺少有界保留策略。当前没有自动生成修复工单，主控需要先决定补证、接受风险或开一个有界工单。

## Current behavior

`compile_context` reads stored evidence and state and returns a compiled snapshot and numeric metrics. It does not invoke an extractor, change state, create headlines, or perform retrieval automatically. State changes remain explicit: callers may perform prepare/extract/apply themselves or use the accepted ST-03 library coordinator with an explicitly supplied local adapter process. The core selects no model/provider and performs no network request. The explicit `CONTEXT_COMPILER_DB_PATH` is the standalone database configuration. `DSH_HOME` is retained only as a legacy compatibility fallback.

## Known gaps

- No implicit state evolution or extractor invocation from compile/ingest/MCP.
- No automatic headline generation.
- No formal compiler mode in any host adapter.
- ST-02 的确定性指标尚未证明足以充当 D2 相对 D1 的决策门。
- 持久化 preparation snapshot 尚无明确的有界保留策略。

WO-ST-01 through WO-ST-03 are complete and independently accepted. Formal host mode remains out of scope and has not started.
