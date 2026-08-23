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

WO-DS-04 已在独立 re-QA 于 2026-08-23 接受，固定候选为 `c727b68bac28b158a3d6a045adfb00b552c22723`。正式六案预注册保持 STR-07/08/05/06/01/04，不得按任何 dry-run 或模型结果换案；2 short / 1 medium / 3 long 仅为预计分布。接线冒烟把已接受的 STR-08/05/04 共 31 个 slice、226 个投影历史 turn 确定性构造成 evaluator v2 严格 parser 可消费输入；没有调用 `runEvaluationSuiteV2` 或远端模型，也没有产生效果指标。该接受仅为 wiring smoke gate；数据集仍是 `planned_not_frozen`，pilot/canary 状态不变，未授权 promotion/freeze、D0/D1/D2 或任何效果解释。

WO-DS-05 已在独立 re-QA 于 2026-08-23 接受，固定候选为 `fb85572031711bc8337121fb307b5ffae81086f3`。全六案共同 `evidence_cutoff_at` 固定为 `2026-08-23T03:00:00Z`；STR-08/05/04 的 21 个 accepted 文件以 byte-identical relocation 进入独立 promotion 目录，31 个登记来源轻量复核没有要求语义改动。版本化污染 snapshot 覆盖固定六案，但因 GitHub code search 认证限制，`no_public_hit_found` 只是一项有限的 as-of 结论。首轮 QA 退回的协调重写 P1 已由代码内固定 21 个 accepted 路径/顺序/SHA 合同关闭。collection 仍是 `promotion_candidate_not_frozen`、`evaluation_ready:false`、`model_run_authorized:false`；这不是完整六案 freeze 或模型运行授权，下一步仅允许另开 STR-06 source/Gold checkpoint。

WO-DS-06 已在独立 re-QA 于 2026-08-23 接受，固定 source candidate 为 f4931ad35cc7e4a844bb40ceb397aaf07842616d。首轮 QA 发现的 E6 current-body digest/updated_at 与 E7/E16 REST null-commit canonical P0 已被 append-only 修正，并由官方 REST 逐项重验。STR-06 保留 16 个真实 information increment/slice，机械分层为 long；checkpoint 分离两次 patch/merge、tracker close/reopen、真实 FIPS 失败、有限单环境成功与残余跨环境不确定性。两个 PR 均没有 repository regression test，Builder/QA 也没有本地 FIPS replay。此次只接受 checkpoint/schema gate：状态仍为 checkpoint_not_frozen，没有进入 promotion collection，promotion_authorized:false、evaluation_ready:false、model_run_authorized:false，未授权 D0/D1/D2 或远端模型。

DS-06 接受后的第四次关键节点对抗审查记录为 `docs/adversarial-reviews/AR-2026-08-23-post-ds06-checkpoint.md`，结论为 `Challenge`。主控接受其更小路径：不单独 promotion STR-06、不提前实现 Probe，先以 WO-DS-07 制作 STR-07 source/Gold checkpoint，再单独制作 STR-01，最后一次性 promotion 新三案。当前实际已审计分布为 1 short / 0 medium / 3 long；缺少 medium 必须披露，但不授权换案、漏计或强拆 lineage。

WO-DS-07 已在独立 Data QA 于 2026-08-23 接受，固定 source candidate 为 `8f51bf4f9308d124ace63c5c8ca755373105c71f`。Issue #1008 与 closed-unmerged PR #1010 的 10 个 information increment/slice 经 GitHub 官方 REST 逐项重验，机械分层为 long，已审计分布为 1 short / 0 medium / 4 long。候选严格区分未合并 patch/test、公开 URI-template API、redirect/CORS 限制、path-converter 与 dual-route workaround，以及仍未决的 revert/release/docs；此次仅接受 checkpoint/schema gate，保持 checkpoint_not_frozen、未 promotion、promotion_authorized:false、evaluation_ready:false、model_run_authorized:false，未授权 D0/D1/D2 或远端模型。

WO-DS-08 已在独立 Data QA 于 2026-08-23 接受，固定 source candidate 为 `454565b863cf7e9470e7ac8079febf2a5c0d42d9`。STR-01（Issue #495、closed-unmerged PR #500、merged PR #1692）的 18 个真实增量/slice 经 GitHub 官方 REST、PR commit/files 与 timeline 重审，机械为 long，使已审计分布为 1 short / 0 medium / 5 long。checkpoint 严格分离宽 scope-body 缓存被搁置、streaming 约束、body/form 差异、receive hang、`call_next` 窄化、endpoint-first 非目标、multi-chunk review bug、补测修正、approval、merge 与 Issue close。此次只接受 checkpoint/schema gate：仍为 checkpoint_not_frozen，未 promotion STR-06/07/01，未创建 Probe，且 promotion_authorized:false、evaluation_ready:false、model_run_authorized:false；未授权 D0/D1/D2 或远端模型。下一步只能另开一次性 promotion STR-06/07/01 工单并申请关键节点独立对抗审查。

DS-08 接受后的关键节点对抗审查记录为 `docs/adversarial-reviews/AR-2026-08-23-post-ds08-checkpoint.md`，结论为 `Agree with reservations`。主控接受其最小路径并已建立 WO-DS-09：先做六案 75 slices / 588 turns 不落盘静态 preflight，再一次性将 STR-06/07/01 以 byte-identical relocation 纳入 promotion。该工单的目标仅是 `promotion_candidate_not_frozen` 的 canonical-data freeze candidate，不是 frozen、Probe/evaluation ready 或模型运行授权。

WO-DS-09 已在独立 Data QA 于 2026-08-23 接受为六案 canonical-data freeze candidate，固定 Builder candidate 为 `4b974538d76d0e0d8a5ac17c5662533b714ef00e`。六案 75 slices / 588 projected turns 先通过不落盘真实 evaluator v2 parser preflight；STR-06/07/01 的 21 个 accepted 文件随后逐字节复制，使 promotion 共 42 个固定副本。四个固定 Data-QA candidate 的 42 项 accepted-source path/order/SHA 已独立重建，并经协调改写攻击复验；新的 full contamination snapshot 追加而不覆盖旧 snapshot，来源 ledger 明示没有把继承 QA 冒充本次 live re-audit。实际分布为 1 short / **0 medium** / 5 long（slice 为 4/0/71）；collection 仍为 `promotion_candidate_not_frozen`、`evaluation_ready:false`、`model_run_authorized:false`。本接受不是正式 freeze、Probe、D0/D1/D2 或模型运行授权。

DS-09 后关键节点对抗审查 `docs/adversarial-reviews/AR-2026-08-23-post-ds09-protocol.md` 结论为 `Agree with reservations`。主控接受其更小路径并建立 WO-DS-10：只制作不超过 12 slices 的预注册 protocol canary，同时生成 83 facts / 75 slices 的完整资格清单；context Probe 与 answer required/forbidden/Critical-Miss checklist 必须同冻。现有 resolved context 尺子固定为 diagnostic/not-evaluable，overall `passed` 不作决策。本工单禁止 evaluator/model 运行、core 修改与正式 freeze。

WO-DS-10 已在独立 Data QA 于 2026-08-23 接受为 `protocol_canary_not_frozen`，固定 Builder candidate 为 `bc78c42505c34ae6f3220db49b2e5a5af905d0eb`。protocol 从固定六案数据独立重建并复验 83 facts / 75 slices / 499 assignments，固定 12 slices / 101 projected turns；仅有 8 个共同 exact lexical-anchor Probe，19 个 task dependency 明确 `not_exactly_scorable`，答案 rubric 为 42 required / 16 forbidden。接受没有改动 promotion payload、`src/` 或 package surface；canonical collection 仍为 `promotion_candidate_not_frozen`，且 `formal_freeze_authorized:false`、`evaluation_ready:false`、`evaluator_run_authorized:false`、`model_run_authorized:false`，runner/model/effect count 均为 0。0 medium 仍是外推限制；这不是 Probe 实验、正式 freeze、D0/D1/D2 或模型运行授权。

DS-10 接受后已建立 WO-DS-11，只做 data+protocol 原子 freeze、append-only pre-run contamination rescan 与 36 个盲化 D0/D1/D2 input packet/GPT-5.6-terra non-sol feasibility 运行合同。该工单本身禁止 evaluator/model 调用；只有新的独立 QA PASS，下一工单才可按固定 order 发起恰好 36 个 fresh session。语义评分仍要求两名 condition-blind 人类 reviewer，不能由第二模型替代。

WO-DS-11 已在独立 Data / Run-Gate QA 于 2026-08-23 接受 atomic data+protocol+answer-input freeze，固定 Builder candidate 为 `a2d68b851d178db20dc3abfb17b2d3eda8d66d3c`。append-only wrapper 展开固定 46 个 canonical-data 文件、3 个 protocol 文件、12 slices 与 36 个 opaque answer-input packet，并使其固定 bytes 为 `frozen_by_manifest`；D0/D1 沿用 evaluator transcript 语义，D2 调用真实 assembler 但使用人工 Oracle-State，故只代表 typed-state upper bound。pre-run contamination rescan 在受限公开 web index 中没有新增 qualified task-level reuse，但 GitHub code-search API/UI 不可用，不能作 absence proof。本工单仍保持 `model_call_count:0`、`evaluation_run_count:0`、`answer_artifact_count:0`；下一工单最多可收集 36 次未评分 GPT-5.6-terra non-sol / medium / fresh `fork_turns:none` session，每 cell 单次、无 adaptive retry，语义评分仍须两名 condition-blind 人类。0 medium、单次 repetition、Oracle upper-bound 和公开索引限制阻止 D2 优于 D1、稳健性或一般化结论。

WO-DS-12 已在独立 re-QA 于 2026-08-23 接受为 **unscored capture integrity only**，固定 Builder fix candidate 为 `3c172bb62e5e640d00d513e31ede6249ac9d5cba`。首轮 QA 的 raw/run/hash/validator 协调自举 P1 已由 append-only 修复关闭：无 shell Git object anchor 直接读取 capture source commit `18a332fd06d7ebdfc8c0007ae1e9250db14c82cf` 的固定父链、path、blob/SHA，并在 current JSON 解析前要求 raw/run bytes 相同；capture-hashes 不再自证 validator，manifest authorization-absence 与所有未评分 boundaries 严格固定。raw/run bytes 没有改变，因此没有新模型 session、retry 或回答。36 条 artifacts 仍只是 36 valid / 0 invalid 的未评分 capture；未运行 evaluator、自动 context/cost 或语义评分。下一工单才可做自动结果和 condition-blind review bundle，且仍缺两名真实人类评分。0 medium、单次 repetition、人工 Oracle-State upper bound 与公开索引限制继续阻止 D2 优于 D1、稳健性、一般化或 provider comparison 结论。

2026-08-23 架构同步进一步冻结 v0 边界：当前核心是 State Compilation，authoritative Active State 不参与普通 semantic relevance competition；Evidence Paging（含 PACE 类多粒度语义调页）与 Experience abstraction 仅为 Research Backlog / Extension Point。验证顺序固定为 Correctness → Context Reduction → Operational Stability；除非当前测试失败直接要求，不得把 PACE 相关机制加入 v0。该结论是 scope clarification，不是扩展实现请求。

## 最新对抗审查

2026-08-23 在 ST-03 接受后完成了首次独立对抗审查，结论为 `Challenge`。该结论不否定 ST-01 至 ST-03 的实现 QA；它指出现有证据主要证明“实现符合工单”，尚不足以证明“工单顺序是验证核心假设的最小投资路径”。完整记录见 `docs/adversarial-reviews/AR-2026-08-23-post-st03.md`。

审查提出三个需要在下一次重大投入前明确处置的问题：ST-02 的空 probe、`current_input` 污染及缺少 D2 相对 D1 门槛；ST-01 是否真是首轮语义实验的技术 blocker；ST-03 的持久化 preparation 在连续抽取失败后缺少有界保留策略。WO-EV-02 已关闭空 probe 与 `current_input` 污染并显式报告 D2-vs-D1 原始成本，但按范围没有新增决策门；preparation 保留风险仍未形成实现工单。

DS-03 接受后的第二次关键节点对抗审查记录为 `docs/adversarial-reviews/AR-2026-08-23-post-ds03-canary.md`，结论为有限 `Challenge`。主控接受其更小路径：先做 DS-04 三案无模型接线冒烟，再按共同 cutoff promotion audit；未制作案例优先处理 STR-06，且所有最终案例必须逐案人工语义审计。长度/组件/outcome 混杂不阻止制作，但阻止无分层 aggregate 的一般化解释。

DS-04 接受后的第三次关键节点对抗审查记录为 `docs/adversarial-reviews/AR-2026-08-23-post-ds04-wiring.md`，结论为 `Challenge`。主控接受拆单：WO-DS-05 只固定全六案 evidence cutoff 并 promotion audit 已接受的 STR-04/05/08；STR-06 source/Gold checkpoint 另开 WO-DS-06。空 Probe/Gold→Probe 与答案评价缺口阻塞首次效果运行，但不阻塞 canonical source-data promotion。

## Current behavior

`compile_context` reads stored evidence and state and returns a compiled snapshot and numeric metrics. It does not invoke an extractor, change state, create headlines, or perform retrieval automatically. State changes remain explicit: callers may perform prepare/extract/apply themselves or use the accepted ST-03 library coordinator with an explicitly supplied local adapter process. The core selects no model/provider and performs no network request. The explicit `CONTEXT_COMPILER_DB_PATH` is the standalone database configuration. `DSH_HOME` is retained only as a legacy compatibility fallback.

## Known gaps

- No implicit state evolution or extractor invocation from compile/ingest/MCP.
- No automatic headline generation.
- No formal compiler mode in any host adapter.
- WO-EV-02 已完成尺子校准；真实 Starlette 轨迹和远端回答实验完成前，evaluator 仍不能充当最终决策门。
- Starlette schema pilot 与 DS-03 long/open canary 已独立接受，但均不是正式数据集 freeze 或 D2 效果证据。`pilot_not_frozen`、`canary_not_frozen` 保持；STR-02/03/11/12/15 因公开 evaluation/benchmark 复用排除，STR-04 只有有限 `no_public_hit_found`，STR-05 按机械规则属于 long。剩余样本必须重新预注册实际分层，不能沿用旧 2/2/2 或直接运行模型。
- WO-DS-04 接线冒烟已独立 re-QA 接受，但这不构成正式 promotion/freeze、D0/D1/D2、远端模型或效果解释授权；这些步骤仍需新的有界工单和独立 QA。
- WO-DS-05 三案 promotion audit 已独立 re-QA 接受；全六案共享 evidence cutoff 为 `2026-08-23T03:00:00Z`，扫描观察时间独立版本化。接受仍不是六案 freeze、`evaluation_ready` 或模型运行授权；只允许下一步另开 STR-06 source/Gold checkpoint。
- WO-DS-06 STR-06 source/Gold checkpoint 已独立 re-QA 接受为 checkpoint/schema gate；16 个增量机械归为 long。它没有 repository regression test、本地 FIPS replay 或跨环境证明，merge/close 只表示 repository/tracker acceptance。接受仍保持 checkpoint_not_frozen，未进入 promotion/freeze，且 promotion_authorized:false、evaluation_ready:false、model_run_authorized:false；下一步不得擅自扩大，必须另开有界工单决定 promotion 或剩余 STR-01/07 的制作顺序。
- WO-DS-07 STR-07 单案 source/Gold checkpoint 已独立 QA 接受：10 个增量机械归为 long，不预设 survey 的 short；仍不 promotion STR-06/07，不制作 Probe 或运行模型。其后 WO-DS-08 的 STR-01 checkpoint/schema gate 也已接受；下一步只能由新工单一次性考虑 promotion STR-06/07/01。
- WO-DS-08 STR-01 source/Gold checkpoint 已独立 QA 接受：18 个增量机械归为 long，PR #500 closed-unmerged、PR #1692 narrow merge 与 #495 tracker close 没有混写；仍为 checkpoint_not_frozen，且 promotion_authorized:false、evaluation_ready:false、model_run_authorized:false。此接受不表示 STR-01 promoted/frozen、六案完整、Probe/answer rubric 就绪或可运行 D0/D1/D2/远端模型。
- 持久化 preparation snapshot 尚无明确的有界保留策略。
- WO-DS-11 仅冻结首次 feasibility 输入与运行合同；单次 repetition、0 medium、人工 Oracle-State upper-bound、GitHub code-search 不可用与尚缺两名 condition-blind 人类评分仍限制后续解释。即使独立 QA PASS，也不能据此声明 D2 优于 D1、稳健性或一般化。
- WO-DS-12 的 36 个单次原始回答 capture 已通过独立 run-integrity re-QA，但仍没有自动 context/cost 结果或两名 condition-blind 人类语义评分；36/36 格式有效不等于答案正确或 D2 有效。
- PACE / Evidence Paging / semantic relevance、多级摘要、glimpse/page-fault 与 Experience Layer 明确不在 v0；它们不能成为当前 correctness/reduction/stability Gate 的前置 blocker。

WO-ST-01 through WO-ST-03 and WO-EV-02 are complete and independently accepted. Formal host mode remains out of scope and has not started.
