# AR-2026-08-23：WO-DS-13 自动结果与人工盲评包计划审查

- 审查基线：`main@8bef431bd65590604dee42e8b6362fb1ca8a2366`，开始时工作树 clean。
- 边界：只审查计划与冻结协议，不运行 evaluator、不评分答案、不调用模型、不修改工单、代码或数据。
- 独立性：DS-10/DS-12 QA PASS 仅证明各自工单的 protocol/capture 完整性，不证明 DS-13 的结果命名、盲化或 Gate 解释必然正确。

## Verdict

**Agree with reservations（有保留同意）。** 经攻击后，“同一 no-model 工单生成自动原始诊断与供人评分的盲评包”仍是 v0 下一步的最小合理路径；把两部分拆成两个工单只会增加一次交接/QA，并没有隔离新的模型、core 或供应商风险。两名真实人类是 **DS-13 之后语义 Correctness Gate 的 blocker**，不是生成空白 bundle 或接受其盲化完整性的当前 blocker。

**事实：** DS-13 固定 12 slices、8 exact Probe、42 required、16 forbidden、38 critical，并禁止修改 frozen input/rubric/answer（`docs/work-orders/WO-DS-13-starlette-auto-metrics-blind-review-bundle.md:17-25`）；DS-12 re-QA 只接受 36 条 unscored capture integrity，明确没有自动 context/cost 或人类语义评分（`docs/qa/WO-DS-12-starlette-feasibility-answer-collection.md:68-74,84-90`）。D-014 的顺序仍是 Correctness → Context Reduction → Operational Stability（`docs/DECISIONS.md:55-61`）。

**推断：** 当前最便宜的实质推进不是再做模型调用，也不是提前引入 reviewer 或 PACE，而是先把已有固定材料变成可审计的诊断与可安全交付的评分输入。计划方向成立，但须收紧下面三点，否则可能获得“文件都生成了”的 PASS，却不能支持盲评或 Gate 解释。

## Strongest challenge 1：公开 bundle 与内部解盲材料尚未形成真实隔离边界

**事实：** 计划把 `review-items.jsonl`、两份 reviewer form、`review-key.json` 和 automatic report 都放在同一个结果目录（`docs/work-orders/WO-DS-13-starlette-auto-metrics-blind-review-bundle.md:52-59`）。公开 item 还携带原始 answer、原协议 checklist 与 provenance source id（同文件 `:61-68`）。冻结 protocol 的 rubric/source id 形如 `STR-07/T4/R1`、`STR-07/E1`，直接暴露 case/slice link（`evaluation/starlette-v1/protocol-canary/protocol.json:23-38`）。

**具体反例：** reviewer 若误收整个 `feasibility-01/` 目录，会直接拿到 `review-key.json`。即使只拿 `review-items.jsonl`，若仍可访问仓库，也可用完整 answer 字符串搜索 accepted `raw-responses.jsonl`，再沿 packet manifest/condition mapping 解盲；不带秘密的 SHA-256 排序或“opaque review_id”不能阻止这种链接。rubric/provenance id 进一步缩小反查范围。因此当前材料只可能在“reviewer 只收到严格导出的公开 allowlist，且不能访问 repo/raw/internal key”的威胁模型下 condition-blind；该前提尚未写清。

**推断：** 这是 bundle 交付前的 blocker，不是要求密码学匿名化所有答案。Condition-blind 不可能对已拥有 raw capture 与映射的 privileged reviewer 成立；应界定合理访问边界并验证实际交付物，而不是把 deterministic pseudonym 当 secrecy。

**建议：** 同一工单内物理分开 `public/` 与 `internal/`：public 只含 Current Task、answer、固定判定说明、无 case/slice/source 含义的本地 opaque criterion id 和空白 form；condition key、原 rubric/provenance 映射、automatic report 留在 internal/audit。validator 应对“实际交给 reviewer 的 public export”做 exact allowlist、拒绝 unknown/internal 文件，并记录 reviewer 不得访问 repo/raw/key 的访问合同。**不要向 reviewer 展示 D0/D1/D2 输入 context**：评分要判断 answer 是否满足同一冻结 truth，而不是让 reviewer 因看见输入缺失而宽免答案；如需 provenance 核查，应由仍不知道 condition 的 adjudicator 使用独立 internal evidence map，而非把执行 context 发给 reviewer。

## Strongest challenge 2：8 个 Probe 不能被命名为自动 Correctness Gate

**事实：** 本审查从冻结 protocol 重算：8 个 exact Probe 只分布在 **3/12** slices——STR-07/T10 有 3 个、STR-01/T18 有 4 个、STR-04/T4 有 1 个；其余 9 slices 为零。协议本身将 exact Probe 限定为 `lexical_carry_through_only`，将 overall `passed` 限定为 `non_decision_diagnostic`（`evaluation/starlette-v1/protocol-canary/protocol.json:306-311`）。DS-13 虽在后文承认 19 个 not-exactly-scorable dependency 和 answer correctness 等待人类，却仍在单一结果与 Part A 使用 `context correctness` / `lexical correctness` 名称（`docs/work-orders/WO-DS-13-starlette-auto-metrics-blind-review-bundle.md:13,41-48`）。

**具体反例：** D2 可在上述 3 slices 获得 8/8，同时在 STR-05、STR-06、STR-08 的全部回答中遗漏每一个 Critical-Miss；此时 automatic report 若写“Correctness PASS”，就是用没有 Probe 的 9 slices 形成 vacuous pass。反过来，某个 exact anchor 措辞未命中也不能自动证明 answer 语义错误。

**推断：** 自动指标不是架构正确性的证明，也不是完整 Correctness Gate。它是覆盖很窄但可重复的 lexical diagnostic。token/delta 可以同时计算并原样保存，因为 Gate 顺序约束的是**解释**而非禁止一次收集；在人类结果前，Context Reduction Gate 必须保持 pending。

**建议：** 最小修订是把 Part A/summary 的状态固定为 `automatic_lexical_diagnostic`，并显式输出 `semantic_correctness_gate: pending_human_review`、`context_reduction_gate: not_interpretable_pending_correctness`、`operational_stability_gate: not_tested`。允许列 raw token/delta，但不得产生 `correctness_passed`、`reduction_passed` 或“D2 更好”。若 8 个 Probe 有失败，仍可生成 blind bundle供诊断；不能用 token 值掩盖失败。

## Strongest challenge 3：一次 latency observation 与可重算的确定性结果需要逻辑分离

**事实：** DS-13 要求恰好一次调用 `runEvaluationSuiteV2`，同时保存完整 report、deterministic Probe/token 字段与 observed local latency，并让 validator 验证“真实只运行一次”（`docs/work-orders/WO-DS-13-starlette-auto-metrics-blind-review-bundle.md:27-39,93-97`）。计划已正确声明 latency 只是本机单次 observation、不是跨平台稳定性证明（同文件 `:41-46`）。Requirements 要求报告 local compile latency，但 Operational Stability 还包括连续 extractor、replay/provenance 与错误诊断，不可能由该单次计时满足（`docs/REQUIREMENTS_V0.md:35-45`）。

**具体反例：** Builder 的 canonical run 报 3 ms，独立 QA 在另一负载下重放得 12 ms。若完整 report 按 bytes/latency 等值验证，会错误拒绝确定性 Probe/token 结果；若 QA 因“一次”禁令完全不重放，又只证明 Builder 文件内部算术一致，没有证明 runner 可复现。单个计数同时表达“正式产物生成次数”和“所有验证执行次数”会造成假冲突。

**推断：** 不需要另开 latency 工单，但 deterministic correctness/cost 与 wall-clock observation 必须是不同声明。`evaluation_run_count:1` 应只表示 canonical artifact generation，不应禁止 QA 在隔离临时目录进行 non-canonical verification replay。

**建议：** 保留一次 official run；在产物中将可重算 Probe/token projection 与 `latency_observation` 分段，后者附 Node/OS/CPU/计时口径且不进入 Gate。QA 可重跑 runner，仅比较 latency 以外的 deterministic projection；另记录 `official_artifact_generation_count:1` 与 QA verification replay，不把后者冒充第二个实验 repetition。若不愿定义这一区分，更便宜的选择是 DS-13 只保存单次 latency 原值、QA 只验证其类型与 provenance，不宣称重现 latency。

## Cheaper path

**不存在比“自动诊断 + blind bundle”更便宜且达到同样两个前提的拆分路径。** 只做 automatic metrics 仍不能启动人工 Correctness Gate；只做 bundle 会留下 required evaluation 的 Probe/token 原始结果未生成。两者都是冻结输入上的本地机械变换，合并仍符合一个 bounded result。建议保留 DS-13，只对 WO 做以下最小修订，不另开架构工单：

1. 把 public reviewer export 与 internal key/audit/automatic report 物理分隔并固定 reviewer access threat model；
2. 自动结果只称 lexical diagnostic，三个 Gate 状态分别保持 pending/not-interpretable/not-tested；
3. official deterministic result 与单机 latency observation 逻辑分段，允许 QA non-canonical replay；
4. 本工单只生成两份空白 form。找不到两名 reviewer 不阻塞 Builder/QA；它只在 DS-13 PASS 后成为外部评分 blocker。

**PACE 检查：** 当前计划明确拒绝 PACE、semantic retriever、core/policy 修改（`docs/work-orders/WO-DS-13-starlette-auto-metrics-blind-review-bundle.md:103,106-114`），与 D-014 一致；没有发现隐式 PACE scope creep。不要为 reviewer 临时实现语义证据选择或 History Pager；所需判据只来自冻结 rubric 的确定性投影。

## Falsification

### 可推翻当前 WO 判断的证据

- 实际 reviewer export 能包含或推导 `review-key`，或让有 repo/raw access 的 reviewer 用 answer/source id 反查 condition；则“不泄露条件”的核心交付失败。
- automatic summary 在 9 个零 Probe slices 和人类评分 pending 时仍给出 Correctness PASS，或据 raw token delta 声称 D2 优于 D1；则 Gate 顺序只是文字披露，没有约束结论。
- validator 把非确定 latency 当跨机器 exact 值，或“一次 run”禁止独立 QA 重算 deterministic fields；则 QA PASS 不能证明可重复性。
- 实现中出现 semantic selection/retriever、PACE representation、model judge 或修改 assembler/evaluator policy；则当前 no-core、v0-only 边界被突破。

### 会让我撤回保留意见的证据

- QA 用真实 public export 回放泄漏测试：目录 allowlist 不含 key/report/internal mapping；review item 不含 condition/packet/context-format 或可链接的 canonical id；指定 reviewer 只接触该 export，答案全文反查测试在其权限边界内不可行。
- public reviewer 只看 Current Task、answer 与同条件无关的 rubric；不展示执行 context。internal provenance/adjudication 材料也不含 condition key，或由权限分离保证 adjudicator 仍盲。
- summary 将 8 Probe 明确限定为 3/12-slice lexical diagnostic，并固定三 Gate 的 pending 状态；两名人类评分前无 semantic/reduction/architecture PASS。
- canonical runner 只生成一次正式 artifact，QA 可在隔离环境复验所有非 latency deterministic fields；latency 只以带环境 metadata 的 observation 报告，不被用于 Operational Stability 或跨平台结论。

### 可推翻本审查判断的证据

若现有 WO 未修订即能展示一个与 internal 目录物理隔离的 public export 合同、对 repo/raw linkability 有明确且被测试的 reviewer 权限模型，并且 automatic schema 已不可能表达 Correctness/Reduction/Operational PASS，那么上述保留主要只是措辞问题，可撤回并直接按原计划实施。当前 WO 文本尚未提供这些证据。
