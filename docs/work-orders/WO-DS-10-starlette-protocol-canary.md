# WO-DS-10 — Starlette 预注册评估协议 canary

状态：IMPLEMENTED — PENDING INDEPENDENT QA

## 背景与对抗审查处置

WO-DS-09 已把固定六案整理为 `promotion_candidate_not_frozen` 的 canonical-data freeze candidate，但尚无 Probe、答案判定协议或模型运行授权。DS-09 后独立对抗审查 `docs/adversarial-reviews/AR-2026-08-23-post-ds09-protocol.md` 给出 `Agree with reservations`：首次实验前必须同时冻结 context Probe 与 answer/Critical-Miss checklist，但机械填满 75 个 slice 不是继续推进所必需的条件。

本工单接受该更小路径。现有 evaluator v2 的 exact substring 只能解释为共同 lexical anchor 的 carry-through；`resolved_issues` 不能理解 Oracle item 的 `RESOLVED` 状态，会把显式已解决问题文本误判成 reopening。因此本工单不改 core，而把 resolved context 维度固定为 `not_evaluable_diagnostic_only`，禁止用 evaluator overall `passed` 作条件优劣结论。

## 单一结果

在任何 evaluator/model 输出出现前，形成一个机器可审计、仍未正式 frozen 的 Starlette protocol canary：

> 对固定六案全部 83 facts / 75 slices 生成确定性资格清单；按预注册规则固定 12 个 canary slices；对这些 slice 同时固定公平的 context Probe、answer required/forbidden/Critical-Miss checklist、盲化人工判定与逐项呈现规则。

该结果只回答“首次比较的尺子是否可运行、哪些项可精确测量”，不回答 D2 是否优于 D1。

## 固定输入与不可变边界

- canonical collection：`starlette-v1`；
- promotion 状态：`promotion_candidate_not_frozen`；
- case 顺序：STR-07、STR-08、STR-05、STR-06、STR-01、STR-04；
- 数据身份：固定引用 WO-DS-09 Builder candidate `4b974538d76d0e0d8a5ac17c5662533b714ef00e` 接受的 42 项 promotion 文件与 `promotion-hashes.json`；
- 共同 evidence cutoff：`2026-08-23T03:00:00Z`；
- 不修改 42 个案例文件、promotion metadata、既有 hash、污染 snapshot 或 `src/`。

若任一 canonical byte 变化，本工单必须失败；不得通过重建 protocol hash 吸收数据变化。

## 75-slice 资格清单

清单必须从固定 promotion 数据确定性重建，并至少记录：

- 每个 Fact 的 category、首次已知事件、superseded 事件与 provenance；
- 每个 slice 的 cutoff、D1 window、最新事件、全部 active Fact 及按事件距离计算的 age；
- Fact 是否严格位于 D1 recent window 之外；完整 Fact statement 是否逐字规范化出现在 Current Task 或最新事件；
- technically mature / recent-only / superseded / non-core-category 等原因；
- canary 选择角色、人工 task-dependency Fact 与未入选原因。

`technically_mature` 只表示 Fact 在该 slice 仍 active、首次已知事件严格位于 D1 window 之外，且完整 statement 不是 Current Task/最新事件原样复述；它不自动证明语义依赖。人工 task-dependency 必须单独记录，不能由关键词命中冒充。

## 固定 canary 选择

每案固定两个 slice，共 12 个，顺序不得改变：

1. 该案第一个存在 `technically_mature` Fact、且 Current Task 确实需要至少一个该 Fact 才能避免错误下一步的 slice；
2. 该案 terminal slice，用于核对最终 repository/tracker/open/constraint 边界。

固定结果：

- STR-07/T4、STR-07/T10；
- STR-08/T3、STR-08/T4；
- STR-05/T7、STR-05/T9；
- STR-06/T4、STR-06/T16；
- STR-01/T4、STR-01/T18；
- STR-04/T4、STR-04/T18。

选择在任何 evaluator/model 运行前完成。未来不能因 D0/D1/D2 输出换 slice；若独立 QA 证明某个“首个成熟依赖”判断缺少数据证据，只能以 append-only Builder fix 修正并重新冻结 protocol candidate，不能查看模型结果后调整。

## Context Probe eligibility

Primary context Probe 必须同时满足：

- 只映射 `constraint`、`decision` 或 `open_question`；`resolved_issues` 本工单固定为空；
- 对应 Fact 在该 slice 为 `technically_mature`，且 Current Task 实质依赖它；
- Probe text 经 NFKC、大小写与空白规范化后，同时是 D0/D1 的某个 D1-window 外原始 event summary 与 D2 的某个 Oracle item content 的 exact substring；
- 不在 Current Task 或该 slice 最新 event summary 中 exact 出现；
- 至少两个词且规范化后不少于 12 个字符；代码标识符（例如 `call_next`）可作为单词例外，但必须逐项登记例外原因；
- provenance 同时引用匹配的 raw event 与 context item，且两者均不晚于 cutoff；
- 不把 evidence、outcome_status 或 rejected_alternative 生硬塞入 core metric。它们默认进入 answer checklist；rejected alternative 只有在共同 anchor 本身表达“拒绝仍有效”时才能映射 decision。

找不到表示中立共同 anchor 的事实必须写入 `not_exactly_scorable`，说明原因并转 answer checklist；不得用 Fact 全句制造 D2 假阴性，也不得只取 Oracle 措辞制造 D2 先验优势。

## Answer 与 Critical-Miss protocol

每个固定 slice 必须在同一 candidate 中预注册：

- `required_items`：回答必须表达的语义，可改写，不要求复刻真实开发者回复；
- `forbidden_items`：回答不得断言的已证伪、已否决、已 superseded、越界或错误状态；
- `critical_miss_ids`：只能引用上述 required/forbidden item，且只包含会实质改变下一步决策的关键项；
- 每项引用当时 active Fact 与不晚于 cutoff 的 provenance；recent/current Fact 可以用于答案正确性，但必须与 mature retention 项分开标记；
- 找不到合理 forbidden item 时允许空数组，不得为对称性制造错误答案。

未来判定规则固定为：回答语义表达 required item 即通过，不要求 exact wording；明确断言 forbidden claim 即失败；未提及 forbidden claim 不扣分；证据不足标 `uncertain` 并进入人工仲裁。Critical Miss 是 critical required item 缺失或 critical forbidden item被断言，不允许 aggregate 平均值掩盖。

首次实际判定必须对 D0/D1/D2 条件标签盲化，由两名独立人工 reviewer 逐项判断；分歧保留两份原始记录并由第三人或预先指定主控仲裁。不得使用第二个模型 judge 代替人工，也不得在看到回答后改 checklist。

## 输出与解释协议

- 逐 slice、condition、item 输出原始判断；case-level/tier-level 只作描述；
- 不创建综合加权总分；不把 12 slices 当独立总体样本；
- `resolved_issues` context metric 固定 `not_evaluable_diagnostic_only`；真正 reopening 只由 forbidden-answer item 判断；
- evaluator overall `passed` 固定 `non_decision_diagnostic`，不能解释为某条件失败；
- 0 medium 必须披露为外推限制，禁止 tier-balanced 或总体效果结论；
- context exact Probe 只称 lexical carry-through，answer checklist 才评价语义连续性。

## Protocol candidate 与 hash

允许在 `evaluation/starlette-v1/protocol-canary/` 新增：

- `eligibility-inventory.json`；
- `protocol.json`；
- `protocol-hashes.json`；
- 最小生成/验证脚本与测试。

protocol status 必须保持 `protocol_canary_not_frozen`；canonical data 仍是 `promotion_candidate_not_frozen`；`formal_freeze_authorized:false`、`evaluation_ready:false`、`evaluator_run_authorized:false`、`model_run_authorized:false`。本工单与 QA PASS 都不自动改为 true。

validator 必须代码内固定 canonical promotion identity，拒绝 coordinated rewrite、unknown field、path/order/hash/symlink、future provenance、非 canary slice、选择变更、Probe 单边 anchor、current/latest contamination、过短 anchor、错误 metric mapping、resolved Probe、answer item future leakage、critical dangling reference 与状态提权。

## 可执行验证

至少验证：

- 6 cases / 83 unique facts / 75 slices / 499 fact-slice assignments；
- 固定 12 slices 顺序、每案 first mature dependency + terminal；
- 资格清单可从 promotion 数据逐字段重建；
- context Probe 的双边 exact anchor、类别、provenance 与排除条件；
- `not_exactly_scorable` 覆盖所有未映射的 dependency Fact，不能静默丢失；
- 12 个 answer checklist 均有 required/forbidden/critical 合同且无 future leakage；
- 构造的 canary evaluator v2 输入只做真实 `parseEvaluationSuiteV2` 静态解析，不调用 runner/model；
- mutation 覆盖 canonical data coordinated rewrite、单边 Oracle-only/raw-only anchor、Current Task/latest event 重复、resolved Probe、未来 Fact/provenance、critical dangling、hash 自举与 Unicode format/control 绕过；
- `npm test`、`npm run test:protocol`、`npm run build`、`git diff --check` 与 production pack 隔离通过。

## 允许实现

- `evaluation/starlette-v1/protocol-canary/` 的 protocol-only fixture、生成/验证器；
- 聚焦测试；
- 中文 README、handoff、PROJECT_STATE 与 ROADMAP 更新。

不得修改 `src/`、evaluator/retrieval/assembler policy、D2 权重、42 个 promotion 案例文件、provider/host、runtime/MCP、依赖或 package publish surface。

## 明确不做

- 不运行 `runEvaluationSuiteV2`、D0/D1/D2 或远端模型；
- 不调用 GPT-5.6-terra 或任何 provider；
- 不生成 token/retention/latency/aggregate/PASS rate；
- 不正式 freeze data/protocol，不做 pre-run contamination rescan；
- 不修 resolved core metric，不补 medium、不换案；
- 不实现 answer-model runner、model judge、综合评分、Formal Host Mode、headline/extractor 或新 core 能力。

## Gate

Builder 必须提交中文 handoff，明确记录 `evaluation_run_count:0`、`model_call_count:0`，且不能自批。独立 QA 固定 Builder candidate，重建 83/75/499 资格清单，人工复核 12 个 task dependency 与 checklist，攻击 Probe 公平性/future leakage/hash 自举，并确认 package 与 core 隔离。

只有独立 QA PASS，才接受 `protocol_canary_not_frozen`。其后仍需单独工单完成 data+protocol 原子正式 freeze、首次模型调用前追加污染复扫与固定运行参数；当前工单不授权模型运行。

## Builder 实现结果

2026-08-23 已完成待验收候选：从六案固定 promotion 数据确定性重建 83 facts / 75 slices / 499 fact-slice assignments，并按预注册顺序固定 12 个 canary slices。共同 exact-anchor 规则只接受 8 个 context Probe；19 个 task-dependency Fact 因无共同锚点、类别不属于 core metric、锚点过泛或标点表示差异而显式记为 `not_exactly_scorable`。同一 protocol 固定 42 个 required-answer item、16 个 forbidden-answer item 与 Critical-Miss 子集。

validator 固定 WO-DS-09 promotion identity 与 protocol file contract，重新派生完整 inventory，并拒绝 Oracle-only/raw-only anchor、latest repetition、resolved Probe、future answer Fact、dangling critical id、零宽字符、code-identifier 例外滥用、依赖静默丢失、状态提权、unknown field、coordinated rewrite 与 symlink。12 个 evaluator v2 输入只经真实 parser 静态解析，共 101 projected turns；没有调用 runner 或模型。

Builder 自检通过：protocol validator；17 项聚焦测试；全量 354 项单测；protocol 8 项；build、diff check；真实 50-entry npm tarball SHA-1 `f20e56e75c6b6aa9d7362627101771a6c2ca4510`，不含 evaluation/docs/test。`evaluation_run_count:0`、`model_call_count:0`、`effect_metrics_generated:false` 保持；实现者不自批。
