# AR-2026-08-23：DS-09 后 Gold→Probe / answer protocol 关键节点审查

- 审查基线：`main@2012961d9409f6c957d344c5432a701a1c15f8e7`，开始时工作树 clean。
- 审查范围：DS-09 freeze candidate、既有 evaluator v2 与拟议下一工单；未运行 evaluator 或模型，未修改代码、数据、状态与工单。
- 身份：独立 Adversarial Reviewer。既有 Builder/QA PASS 仅作为“已按工单验收”的事实，不作为下一步值得做的证据。

## Verdict

**Agree with reservations（有保留同意）。**

**事实：** DS-09 已把六案规范化为 75 slices，但状态仍是 `promotion_candidate_not_frozen`，且 `evaluation_ready:false`、`model_run_authorized:false`；实际分布为 1 short / 0 medium / 5 long（`evaluation/starlette-v1/promotion/collection.json:4-15,37-38`）。QA 也明确未验证 Probe、evaluator 或模型行为，并要求首次模型调用前重扫污染、完成 protocol 和正式 freeze（`docs/qa/WO-DS-09-starlette-six-case-canonical-promotion.md:12,41,54,77`）。

**推断：** 在看见任何模型输出前，同时预注册 context Probe eligibility 与 answer/Critical-Miss checklist 是必要的；仅先写 Probe、结果出来后再写回答 rubric，会留下结果导向调整空间。但这不推出“75 个 slice 都必须填 Probe”，也不推出当前 exact-substring 与 `resolved_issues` 尺子可以直接成为决策 gate。

**建议：** 下一工单仍应是 protocol-only、no-model、no-core，但把单一结果收窄为一个预注册的可评 canary protocol：固定 slice 资格规则、context Probe 与 answer required/forbidden/critical checklist、不可评原因和呈现规则。不要机械覆盖 75 slices，不产复杂总分，也不要宣称由此已经 `evaluation_ready`。

## Strongest challenge 1：Probe 与 answer protocol 要同冻，但“全部 75 slice”不是必要条件

**事实：** 六案共 83 个唯一 Fact Gold；本审查按各 slice 的 `gold_fact_ids` 只读重算得到 499 个 fact-slice assignments。类别为 13 constraints、20 decisions、14 open questions、2 resolved issues、17 evidence、10 rejected alternatives、7 outcome statuses。现有 evaluator 只直接接收四类 Probe（`src/evaluation.ts:143-160`），并且只评 D0/D1/D2 的历史上下文，不评远端回答（`src/evaluation.ts:689-732,865-909`）。因此 evidence / rejected alternative / outcome status 共 34 个 Fact 没有自然的一对一 context metric。

**具体反例：** 若先只冻结“FIPS 结果”相关 context Probe，模型输出后才决定 STR-06 的回答必须同时说明“未建立 repository regression test”还是只需说明“环境可工作”，同一输出可因事后 rubric 选择而从通过变为 Critical Miss；Probe-only 不能约束这种自由度。相反，把 evidence 或 outcome_status 生硬塞进 `decisions`，只是获得了确定输出，不等于测到了原类别。

**推断：** answer rubric 是首次运行的 blocker，不是最终架构装饰；但全量 75-slice mapping 不是 blocker。只有在事实早于当前 cutoff、仍有效且当前任务确实依赖它时，该 slice 才构成长程依赖测量。最近事件或当前结论形成的 slice 主要测复制/近因，不应与历史依赖混算。

**建议：** 对每个入选 slice 同时冻结 `required_fact_ids`、`forbidden_claim_ids`、`critical_miss_ids`、适用性和 provenance。Critical Miss 只允许是预注册 required/forbidden item 的关键子集；先用确定性 evidence checklist，由对条件标签盲化的人工作逐项判定与仲裁，不引入第二个模型 judge。结果按 item / case / condition 展开，不合成总分。

## Strongest challenge 2：exact substring 的措辞来源会结构性偏向 D2

**事实：** D0/D1 投影原始事件，D2 直接投影当前 slice 的 Oracle-State items（`scripts/evaluation/six-case-preflight.ts:71-101`）；matcher 只是 NFKC、大小写与空白归一后的 substring（`src/evaluation.ts:865-909`）。本审查重算发现，499 个 fact-slice assignments 中，完整 Fact Gold statement 在对应 Oracle item 文本中的 exact-normalized 命中为 **0/499**。

**具体反例：** STR-08/F2 写的是 “Async resources used by the app must be initialized on the same event loop as the TestClient application.”（`evaluation/starlette-v1/promotion/cases/STR-08/fact-gold.json:18`），Oracle I2 则是 “Async resources must share the application event loop.”（`evaluation/starlette-v1/promotion/cases/STR-08/oracle-state.json:19`）。二者语义接近但 exact 不同：用 Fact 原句会让 D2 假阴性；改用 Oracle 原句又因 D2 直接复制 Oracle 表示而先验有利于 D2。此时“确定且可重复”不等于“表示中立”。

**推断：** exact Probe 最多能测预注册 lexical anchor 的 carry-through，不能无条件声称测到语义记忆。若 Probe 取自 D2 Oracle 而 D0 原始事件没有同一 anchor，结果混合了表示格式差异与记忆差异。当前 task input 已被 evaluator 排除（`src/evaluation.ts:754-769`），但这仍不足以排除“最新事件原样命中”的平凡 probe。

**建议：** primary context Probe 必须同时满足：事实已在更早事件建立、当前仍有效、当前任务依赖、不是当前/最近事件的原样复述，并有一个无需改写 D0 或 D2 数据即可在两种表示中成立的、足够具体的共同 lexical anchor。找不到共同 anchor 的事实应标记 `not_exactly_scorable`，转入 answer checklist；recent-only 项单列为 control，不混入历史依赖结果。rejected alternative 默认进入 forbidden-answer checklist；仅当共同 anchor 能表达“拒绝仍有效”时才映射为正向 decision Probe。evidence 与 outcome_status 默认进入 answer checklist，不强塞 core 类别。

## Strongest challenge 3：当前 resolved ruler 会把“显式已解决”误判为 reopening

**事实：** `resolved_issues` Probe 只检查禁止文本是否存在，出现率越低越好；没有 Probe 会 `not_evaluable`，且当前 gate 会令 overall `passed=false`（`src/evaluation.ts:1059-1103`）。六案 Fact Gold 只有两个 `resolved_issue`：STR-05/F3 在 T3 首次已知且最后 relevant，STR-08/F6 在 T4 首次已知且最后 relevant；没有一个是“解决后又被后续依赖”的成熟 resolved fact。

**具体反例：** STR-05/T3 的 Oracle item 内容仍是 “Should StaticFiles follow symlinks?”，但 status 已是 `RESOLVED`（`evaluation/starlette-v1/promotion/cases/STR-05/oracle-state.json:14`）。若把该 open-form 文本设为禁止 Probe，D2 会命中并记 reopening=1，尽管结构化状态恰好明确表示已经解决。STR-08/T4 同样保留已解决问题文本（`evaluation/starlette-v1/promotion/cases/STR-08/oracle-state.json:37`）。这是指标语义错误，不是模型遗忘。

**推断：** 若首轮要把 `resolved_issue_reopening` 或 overall `passed` 当决策证据，先修尺子是真 blocker；若首轮只做可行性探索，则可以不改 core，但必须预注册该维度为 `not_evaluable` / descriptive-only，并禁止把 overall `passed=false` 解释成条件失败。真正的 answer reopening 应由回答 checklist 中的 forbidden claim 判定。

**建议：** 本 protocol 工单不必扩 core；应在 protocol 中明确当前 context 指标只能解释为 `stale_open_text_presence`，本集合无成熟 resolved context Probe。不要为制造可评值而把同 slice 的 `RESOLVED` 文本当作 reopening 样本。

## Cheaper path

**建议的下一工单单一结果：** 先完成一个 **不超过 12 slices 的 protocol canary**，而非一次性标注 75 slices。用固定规则选每案“最早的成熟历史依赖 slice + terminal slice”；没有合格成熟依赖时保留 `not_evaluable`，不得人工替换成更好看的 slice。工单内只做：

1. 对全部 83 facts / 75 slices 生成确定性的资格与覆盖清单（类别、provenance、supersession、距当前 slice 的 age、current-task/最新事件重合、不可评原因）；
2. 对固定 canary 同时写 context Probe 和 answer required/forbidden/Critical-Miss checklist；静态验证共同 lexical anchor、来源和 slice 资格；
3. 预注册逐项输出、盲化人工判定和仲裁规则；不运行 evaluator/模型、不改 core、不计算复杂总分；
4. 独立 QA 通过后，原子式正式 freeze canonical-data identity 与 protocol identity/hash；紧邻首次远端调用再做 append-only contamination eligibility scan。该 scan 只影响“是否允许运行”，不静默改写 frozen 数据或 protocol。

**真正阻塞首次模型运行：** 冻结且 QA 接受的 data/protocol identity；预先固定的 slice 资格与 answer checklist；每个 exact Probe 的共同 anchor 证据或明确不可评；对 resolved/overall gate 的非决策性声明（否则先修尺子）；运行前污染复扫；固定模型版本、prompt、sampling、条件顺序/盲化、捕获格式与重复策略。

**可后置：** 75-slice 全覆盖、补 medium、model judge、复杂总分、第二个远端模型、host/provider 集成，以及在不解释 resolved gate 时的 core 修尺子。

0 medium 因而是首轮外推限制和必须披露的 selection bias，不是小规模可行性 canary 的 blocker；若要作跨 tier 或总体效果结论，则会升级为测量 blocker。

首次 GPT-5.6-terra non-sol 工单最小可做固定 canary 上 D0/D1/D2 每格一次的配对**可行性**运行，不做效果/泛化结论且禁止失败后自适应重试；若要提出稳健比较，至少预注册两个完整重复、全部报告而非 best-of。重复不能消除 0 medium、case 内 slices 相关性或表示偏差。

## Falsification

### 可推翻拟议主控判断的证据

- protocol 只冻结 context Probe，answer required/forbidden/Critical-Miss 在看到输出后才定义或发生变化；这会证明“先 protocol、后实验”没有实际封闭事后调整。
- 机械要求 75/75 有 Probe，且大量 Probe 来自当前/最新事件，或 Oracle-only 措辞被当作 D0/D1/D2 公平的 exact 语义尺子；这会证明 mapping 数量替代了构念有效性。
- 同 slice 的 `RESOLVED` 文本被计为 reopening，或无成熟 resolved Probe 时仍用 overall `passed` 做条件判定；这会直接反驳“当前 protocol 足以支持可信首次比较”。
- protocol QA 后仍改变 canonical facts / Oracle 内容而不更新 data+protocol identity，或污染复扫结果未成为运行 eligibility 记录；这会反驳“冻结”声明。

### 会让我撤回上述反对的证据

- 在模型输出前，有机器可审计的 75-slice 资格清单；固定 canary 选择不依赖测得结果，且每个入选项都有 provenance、supersession、age、task-dependency 与不可评理由。
- 每个 exact Probe 都展示无需改写数据即可在 D0 原始历史与 D2 Oracle 投影中成立的共同 lexical anchor；否则明确转 answer checklist，不计 context miss。
- answer required/forbidden/Critical-Miss checklist 与人工盲化判定规则同 Probe 一起冻结；两名 reviewer 对 canary 独立判定并留仲裁记录，不使用第二模型兜底。
- resolved context metric 明确降为 descriptive/not-evaluable，overall `passed` 不作决策；或者 core 在独立工单中证明它能读取状态/时序且不会惩罚显式 `RESOLVED`。
- 独立 QA 后 data+protocol 以固定 hash 原子 freeze，首次远端调用前污染复扫有可审计结果；首轮只作预注册可行性结论，后续重复与尺度扩展不反向改 rubric。

### 可推翻本审查保留意见的更强结果

若全量静态审计证明绝大多数合格历史依赖项天然存在语义充分、两种表示共享且非近期复制的 exact anchors；并且预注册 adjudication 显示 answer checklist 在条件盲化下有高一致性、resolved 维度有真实的跨-slice 成熟样本，那么 12-slice canary 与 diagnostic-only 限制就可撤回，直接扩大 protocol 具备证据基础。当前材料尚无这些证据。
