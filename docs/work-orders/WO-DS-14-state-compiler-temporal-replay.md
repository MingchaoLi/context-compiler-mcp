# WO-DS-14 — State Compiler v0.1 时间状态回放

状态：ST-01 ACCEPTED BY INDEPENDENT RE-QA; ST-02 RUN-GATE ACCEPTED; OFFICIAL CAPTURE AWAITS CONTROLLER AUTHORIZATION; MODEL NOT CALLED

## 当前 ST-02 Run-Gate checkpoint

ST-01 接受后已实现零模型 ST-02 run contract、source-only packet/replay runtime 与 focused tests。该 checkpoint 只允许独立 Run-Gate QA 审核合同、source boundary、prompt boundary、response/capture 格式和无模型 replay；它不授权任何 remote session。

- 固定 ST-01 QA `daa012c4d6f09919e798edc3771cf090bd5dd188`、Builder `826eb4760fe8df557a2aa7d07225bc1986579281`、data `79da83d95aeac7162c95714f4f6f5eff1f9e0608` 与 canonical source `4b974538d76d0e0d8a5ac17c5662533b714ef00e`；
- 完整 30-step order、`gpt-5.6-terra` non-sol / medium、`fork_turns:none`、每步 fresh session / attempt 1、无 retry / best-of / tools / network / repo，最大并发 3；
- `StrictStateExtractor(maxAttempts:1)` 的 invalid parse fallback 固定为空 Delta；reducer rejection 单列且 state 必须不变；
- runtime 只读取固定 Event Stream 与 ST-02 contract，不读取 Gold；每次从既有 response prefix 由空状态机械重放，并输出下一个 packet；
- 当前 `packets/`、`capture/`、`internal/` 只有边界说明，没有模型回答、capture、Gold 映射或评分。

只有该 checkpoint 经独立 Run-Gate QA PASS 后，主控才可另行授权一次 official 30-step capture。QA 不得调用模型或预填 response。

### 独立 Run-Gate re-QA 接受记录

2026-08-23，独立 re-QA 在固定 Builder fix candidate `a4c336d7f2e421c507e926fe333e5a1f4e5dbd06` 上通过。首次 QA 的 contract/validator 协调自证 P1 已由固定前置 contract candidate `8d31cb6fc06b6b99bc141258539deb51b46d2d1b` 的 parent/path/blob/SHA/current-byte pre-parse anchor 关闭；同步修改两份 contract 与 runtime 期望值仍先在固定 Git-object boundary 拒绝。默认项目根 P1 也已关闭：无参数真实 CLI 从仓库、`/private/tmp` 与新建临时 cwd 均生成 `STR-08/E1`，model/scoring 为 0。

此次接受只冻结 Run-Gate，不是 ST-02 Extractor correctness 或结果接受。QA 没有调用模型，当前没有真实 response/capture/error distribution。下一步只有主控可以另行授权按固定 order 执行恰好一次 30-step fresh GPT-5.6-terra non-sol / medium capture；未经该显式授权不得开始。

## 背景与边界

WO-DS-13 的 `feasibility-01` 从本工单开始直接封存，只保留为 **Oracle-State feasibility baseline**。不得重跑 evaluator、不得修改 official artifact、不得填写或继续等待双真人盲评；其回答语义收益继续标记为 `not_evaluated`。本工单必须用 Git object 与当前字节一致性验证该边界，不能靠可共同改写的 hash 清单自证。

本工单将 v0.1 对齐到以下 Architecture HEAD：

`Raw Event → Extractor → Strict Delta → Deterministic Reducer → Typed Active State → Context Assembler`

它只验证时间状态演进，不实现或评估 PACE、Evidence retrieval/paging、Experience、embedding、learned compression、最终回答质量或宿主集成。Context Reduction 降为次级观察，本工单不运行 D0/D1/D2 evaluator。

## 单一结果

> 以冻结 Starlette 真实事件子流建立最小且严格的 Gold Delta 与 Gold State Checkpoint；先在零模型调用下证明 reducer conformance，再用同一 reducer 做逐事件 Extractor replay，并只报告原始错误分布。

## Gate-0 — 表达能力与选择审计

任何 ST-01 实现前，先用零模型矩阵审计三个完整轨迹的 30 个事件，逐项记录：

- 输入是经独立 Data QA 接受的标准化真实事件摘要，不冒充 GitHub 原始正文；
- 事件是否产生 state change，或应为 empty-delta true negative；
- lifecycle / provenance / relation 预期；
- strict delta 能否表达，以及同一事件新建 item 不能立即被其他 operation 引用的限制；
- Gold 操作由哪一句当前事件摘要支持；
- 可能的 summary-to-Gold 近似、定义歧义与 selection bias。

如果某个必要转换不能由当前 strict delta 表达，不得用 checkpoint 配合错误 Delta 来制造 100% conformance；应缩小声明、记录 `not_expressible`，或在本工单边界内先修正 Strict Delta 合同并重新走 Gate-0。

## 固定来源与事件选择

来源仅使用已接受 promotion 中的三个 Starlette 轨迹；原始 `events.json` 必须与固定 Git object 一致。复制到本工单的数据只是字段受限的时间投影，不得回写 canonical promotion。

- STR-08：E1–E4；
- STR-07：E1–E10；
- STR-06：E1–E16。

共 3 条完整轨迹、30 个按各自真实时间顺序排列的标准化事件。允许且要求预注册 empty Gold Delta：tracker close/reopen 或证据强化不必强行制造语义 state change。empty true negative 单独计数，并验证 reducer 不增加 revision、不修改 state；不得把空类别计作 state-transition 成功。

## 数据合同

新增独立目录 `evaluation/state-replay-v0.1/`，至少物理分离：

- `source/`：来源锚点、selection 与标准化 `event-stream.jsonl`；
- `gold/`：人工 Gold Delta、Gold State Checkpoint、语义键/match contract 与 transition coverage；
- `st01/`：Reducer conformance runner、原始报告、validator 与 focused tests；
- `st02/`：只有 ST-01 独立 QA 接受后才允许创建的 run contract、逐步 input/capture 与原始 replay report；
- `README.md`：中文边界、运行方式和非结论说明。

Gold 使用稳定 symbolic key；运行器负责在隔离 SQLite store 中将 symbolic state/event key 映射到 runtime id。Expected State 必须是独立冻结的 checkpoint，不能在验证时由 Gold Delta 现场生成后再作为自己的 expected value。

每项新状态必须引用当前事件；每次已有状态的 lifecycle 变化必须在同一 Delta 中留下指向当前事件的 `DERIVED_FROM` evidence relation。supersede / resolve / reject / dependency 的端点必须可追溯且类型合法。

## ST-01 — Reducer Conformance

ST-01 完全不调用模型。对每个步骤执行：

`Previous State + Gold Delta → Reducer → Actual State`

并与独立冻结的 Expected State Checkpoint 精确比较。至少验证：

- 30/30 Gold Delta（含预注册 empty true negative）经现有 strict parser/schema 接受；
- 30/30 reducer 输出与 Gold State Checkpoint 一致；
- 两次全新数据库 replay 的 canonical 输出逐字节一致；
- 所有 runtime state 均满足 schema、唯一性、合法 lifecycle 与无 dangling relation；
- 新建及 lifecycle transition provenance 完整，且只引用当时可用事件；
- `SUPERSEDES`、`RESOLVED_BY`、`REJECTS`、`DEPENDS_ON`、`DERIVED_FROM` 均有正样本；
- supersede、resolve、reject、dependency 均有正向状态转换；
- 至少一个 stale expected-revision 反例在 mutation 前 fail-closed，revision 与 state 不变；
- 对缺 provenance、错误端点/类型、future event、重复 symbolic key、checkpoint 缺项/多项、hash 协调改写和 symlink 做拒绝测试；
- model/provider/network/evaluator 调用计数均为 0。

ST-01 是硬工程 Gate：上述适用 invariant 必须 100% 成立；任何分母为 0 的类别必须标为 `not_evaluable`，不能计为成功。只有独立 QA PASS 后才授权 ST-02。

## ST-02 — Real Event Replay

每条轨迹从空 state 开始；每一步只向 Extractor 提供：

- 该轨迹上一步的 **Predicted Typed State**（含 lifecycle tombstone 与已有非 provenance state relations）；
- 当前一个 Raw Event；
- `recent_context: []`；
- `newest_events: [current_raw_event]`。

不得提供 Gold Delta、Gold State、未来事件、Outcome、Decision Reference、原 canonical Oracle-State 或其他历史 raw event。历史 provenance 只保留在 state item 的 `source_refs`；旧 `DERIVED_FROM` relation 不作为 extractor 输入，避免偷偷携带历史原文或违反 current-event-only 边界。

第一轮固定使用 GPT-5.6 非 sol 模型、fresh session、每 step 一次、无 adaptive retry。推荐 `gpt-5.6-terra` / medium。invalid JSON/schema/reference 记录为 Extractor parse error 并应用预注册的 empty-delta fallback；strict delta 被 reducer 拒绝时记录为 extractor-produced invalid transition，state 保持不变。不得人工修补模型输出。

每个 raw response 必须原样保留；同一 response 通过现有 `StrictStateExtractor` 与固定 transport replay，确认使用的 prompt、strict parse 和 fallback 路径。所有模型调用在 run manifest 中逐项登记；不能用模型 judge。

## 错误归因与原始指标

同一 reducer 在 ST-01 已通过后：

- Gold Delta 失败、同输入非确定或 Gold State 不一致，归为 Reducer/fixture conformance error，并停止 ST-02；
- 模型输出不能 strict parse、提出非法 transition、遗漏/新增错误语义或缺 provenance，归为 Extractor-side error；
- reducer 正确拒绝非法 predicted delta 不记作 reducer bug。

不设置综合分数、权重或 PASS threshold，不输出架构胜负。报告计数、分子/分母、逐轨迹/逐 step 明细，至少包括：

- critical state recall / precision；
- stale activation；
- missed supersession；
- missed resolution；
- wrong reactivation；
- dependency inconsistency；
- provenance failure；
- strict parse failure、fallback、reducer rejection 与 unmatched/ambiguous semantic key。

状态匹配只使用模型运行前冻结的 `type + lifecycle + required lexical anchors` 合同；一个 predicted item 最多匹配一个 Gold semantic key。歧义项不得由 Builder 事后人工映射，必须作为 `ambiguous` 原样报告。匹配合同只是第一轮机械尺度，不能冒充完整语义判断。

Context Reduction 只允许附带报告每步 extractor input 的原始字符/token estimate 与 state item 数；不得运行或复用 feasibility-01 的 D0/D1/D2 official artifact，也不得据此声称收益。

## 防泄漏与不可自证要求

- extractor packet/capture 与 `gold/` 物理分离，运行时生成 packet 的进程不得读取 Gold；
- source、Gold、ST-01 accepted result、ST-02 run contract 与 capture 各自锚定到固定 Git object；
- validator 不能只依赖同一提交中可共同改写的 JSON/hash/源码常量；
- QA 必须在隔离副本重放协调改写攻击；
- official model capture 只生成一次；QA 可用原始 response 做无模型 deterministic replay，不得新增 session；
- `feasibility-01` official files 必须与 DS-13 accepted Git object 逐字节一致。

## 交付与 Gate 顺序

1. Builder 提交工单、source selection、Gold、ST-01 runner/report/tests 与中文 handoff；
2. 独立 QA 只审 ST-01。FAIL 则返回 Builder 修复，不得启动 ST-02；
3. ST-01 QA PASS 后冻结 ST-02 run contract，再执行一次 30-step remote capture 与本地 replay；
4. Builder 提交 ST-02 原始结果与中文 handoff；
5. 独立 QA 复核 provenance、隔离、归因、算术、capture integrity、协调改写和完整回归；
6. 关键节点对抗审查挑战 vacuous pass、gold leakage、定义歧义、evaluator 自证及是否把 extractor error 误记为 reducer error；
7. 接受或明确记录失败后停止，不进入 Context Reduction、Operational Stability、PACE 或下一工单。

## 明确不做

- 不重跑或修改 `feasibility-01` official artifact；
- 不再等待、模拟或替代两名真人盲评；
- 不运行 D0/D1/D2 answer-quality evaluator；
- 不实现 PACE、Evidence retrieval/paging、Experience、embedding、semantic scorer、glimpse 或多级摘要；
- 不修改 retrieval/assembler policy 迎合数据；
- 不使用 Gold/未来事件修补 predicted state；
- 不创建综合数学评分或架构胜负结论；
- 不自动进入后续阶段。

## 完成定义

只有以下两项都完成并经独立 QA 接受，工单才可标记 ACCEPTED：

1. ST-01 所有有正分母的工程 invariant 100% 成立；
2. ST-02 单次时间回放完整保留并验证，按预注册定义输出原始错误分布与限制。

最终报告必须单列测试设计挑战：vacuous pass、Gold leakage、semantic-key/状态匹配定义歧义、checkpoint 与 validator 自证、以及 selection/短轨迹偏差。报告后停止。
