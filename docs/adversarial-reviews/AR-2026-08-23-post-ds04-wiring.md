# AR-2026-08-23 — DS-04 wiring smoke 后冻结顺序审查

日期：2026-08-23

审查对象：`main` 固定 clean baseline `c6261bd65b89fd703aa7282a01c3050c6f92a2b2`

审查范围：只读核对 DS-04 的工单、报告、handoff、QA、collection plan 与 wiring 工具，以及既有对抗审查和 DS-01/02/03 中直接影响 freeze 顺序的结论；未运行 D0/D1/D2、模型或网络检索。除本记录外未修改项目文件。

## Verdict

`Challenge`

同意 DS-04 已关闭“现有 STR-04/05/08 能进入 evaluator v2 严格 parser”的接线风险；也同意下一阶段应进入共同 cutoff 与 promotion audit。挑战把“三个旧案 promotion”和“新制 STR-06 source/Gold checkpoint”放入同一个只在末尾接受/退回的工单。

建议下一工单只有一个结果：在一个精确 evidence cutoff 下完成 STR-04/05/08 的 promotion audit，产出逐文件 promotion diff、版本化 contamination snapshot 与新 hash；集合仍不得声称六案完整。STR-06 应是后续独立工单。Probe/Gold 和 answer-eval 的缺口是真实的，但在明确“canonical data 与派生评价协议分层”的前提下，它是模型/效果运行前 blocker，不是这次 source-data promotion blocker。

## Facts

- DS-04 最终 QA 只接受 parser wiring，明确不接受 promotion/freeze、D0/D1/D2、模型回答或效果解释：`docs/qa/WO-DS-04-starlette-no-model-wiring-smoke.md:64,87`。
- wiring 构造器把同 slice Oracle-State 映射到 `context_items/state_relations`，但把四类 Probe 全部置空：`evaluation/starlette-v1/wiring-smoke.mjs:14-19,126-143`。它没有读取 Fact Gold；DS-04 报告也明确承认 Probe/Gold/critical-miss 映射尚未完成：`docs/evaluation/starlette-v1-wiring-smoke.md:42-44,67`。
- evaluator v2 Probe 只有 `constraints/decisions/resolved_issues/open_questions` 四类，并要求文本和 provenance：`src/evaluation.ts:143-160`。`evaluateCaseV2` 对 D0/D1/D2 的**历史上下文**做 substring presence 测量，不调用答案模型：`src/evaluation.ts:670-730,865-901`。
- collection plan 仍为 `planned_not_frozen`，STR-04/05/08 是 `audited_not_frozen`，STR-06 仍为 projected medium：`evaluation/starlette-v1/collection-plan.json:3-10`。pilot/canary hash 也仍分别为 `pilot_not_frozen`、`canary_not_frozen`。
- 仓库规则要求一个工单产生一个有界结果：`AGENTS.md:22`。旧案 promotion 的主要问题是复制/合法元数据变化与共同 cutoff；STR-06 则需要首次逐来源、增量、Task、Gold/Oracle 和 Outcome 语义审计，失败面不同。
- STR-06 的已知主来源是 Issue #1365、PR #1366/#1410。现有 survey 明确记录没有仓库 regression test、FIPS 环境难以本地重放，Gold 只能声明公开异常、调用路径和 merge/acceptance，不能猜测平台最终成功：`docs/evaluation/starlette-v1-candidate-survey.md:87-94`。
- 当前 contamination snapshot 的 `scan_date` 为 `2026-08-23T03:00:00Z`，并明确 GitHub 索引搜索不能证明 absence：`evaluation/starlette-v1/contamination-scan.json:3,188`。

## Inferences

- `wiring_compatible` 不等于 `evaluation_ready`。即使所有 Fact Gold 都无法诚实归入四类 Probe，当前 suite 仍会 parser PASS，因为 Probe 为空且 Fact Gold 不参与构造。
- 该缺口不要求在 canonical evidence/Task/Gold promotion 前实现 Probe adapter。Fact Gold 比四类 substring Probe 更丰富；先把二者强绑定，反而可能为现有 evaluator 丢弃事实或扭曲 Gold。必须在首次 D0/D1/D2 效果运行或模型答案解释前冻结派生映射与 answer rubric。
- 将 promotion 与 STR-06 合并不会增加共同 cutoff 的可信度，只会让 STR-06 的独立语义 FAIL 阻塞三个已经接受案例的 promotion 结论。拆单能保留 fail-fast 和独立接受边界。
- “共同 cutoff”至少包含两个不同时间：canonical evidence 的纳入截止 `evidence_cutoff_at`，以及污染检索实际观察时间 `scan_observed_at`。混成一个不断滚动的“现在”会使 hash 永远无法稳定。

## Strongest challenge

### 1. Parser PASS 没有证明 Gold→Probe，更没有证明答案可评价

**具体反例：** STR-04/05/08 的 31 个 case 全部使用空 Probe；`parseEvaluationSuiteV2` 会接受，随后 `validateWiringSmoke` 返回 `wiring_compatible`。即使再直接运行 evaluator，四类 retention 都会因 Probe 总数为零成为 `not_evaluable`；而 `evaluateCaseV2` 测的是历史上下文里是否包含 probe text，不是远端模型对 Current Task 的答案是否正确。换言之，当前 wiring 对“Gold 可否转成 Probe”“哪些 Gold 属于 critical miss”“如何评分答案”没有任何观测力。

**边界判断：** 这推翻任何“DS-04 后已 evaluation-ready”的说法，但不推翻 source-data promotion。只要下一工单明确 Probe、answer rubric 与模型 runner 是引用 frozen Gold 的版本化派生物，且不得反向改写 source/Task/Gold，本缺口可延后到六案 source data 完成之后；真实效果运行前必须关闭。

**更便宜反例：** 无需现在实现 adapter 或模型 runner。只需检查 wiring 中 `EMPTY_PROBES` 和 evaluator 的 `not_evaluable` 规则，即已证明 parser compatibility 不能替代评价映射。

### 2. 三案 promotion 与 STR-06 checkpoint 是两个可独立失败的结果

**具体反例：** 三个旧案可以保持六类语义 payload 字节不变，只更新 final path、manifest status/cutoff 与集合 hash，promotion audit 完全 PASS；同一候选中的 STR-06 却把 #1410 merge/issue close 写成“FIPS 行为已验证修复”，独立 QA 必须 FAIL。若两者同工单且只在末尾 QA，干净的 promotion 也无法独立接受，Builder 需在更大 diff 上追加修复并重跑四案审计。这正是可避免的 QA 沉没成本。

STR-06 不需要完整新 schema canary；它需要一个单案 source/Gold checkpoint。其最小 Gold/Outcome 边界是：报告的 FIPS 异常与调用路径、#1366 的代码方向和被接受事实、后续 reopen 证明首次方向不足、#1410 compatibility wrapper 的变化与 merge/close。不得声称存在 regression test、已本地复现 FIPS 或已证明所有 FIPS 环境成功。这些缺失不是制作数据的 blocker，只是更强行为结论的 blocker。

### 3. 没有版本规则的重复 contamination 复扫会让 freeze 永远后移

**具体反例：** 在 freeze QA 后一天出现新的公开 benchmark 命中。若“共同 cutoff”始终解释为最新搜索时间，就必须改 contamination 文件、hash 和 QA；下一天仍可再次变化，数据集永远没有稳定身份。反过来，若完全不记录后续命中，又会把旧 `no_public_hit_found` 误报成永久事实。

最小规则应是：

1. 一次性固定全六案共享的 `evidence_cutoff_at`；以后新公开 issue/comment 不进入 v1 canonical evidence。
2. 每次 scan 记录独立 `scan_observed_at`、规则版本和 snapshot hash；`no_public_hit_found` 只解释为 as-of 该 snapshot。
3. 六案最终 freeze 时做一次全集合扫描；首次模型运行前再做一次版本化 pre-run rescan。后续结果追加新 snapshot，不覆写 frozen payload/hash。
4. 新 confirmed hit 改变的是该 run 的 eligibility/披露，不静默换案，也不追溯伪装成原 freeze 时已知事实；是否排除该 case 必须按预注册 run policy 处理。

## Promotion diff 边界

不应要求从 pilot/canary 到 final 的**所有文件**字节完全一致，也不应允许“复制时顺手清理”。最小审计规则：

- 默认应字节一致：`events.json`、`tasks.json`、`fact-gold.json`、`oracle-state.json`、`decision-references.json`、`outcome-anchors.json` 的语义 payload。若 source re-audit 迫使任一文件变化，必须标为 `source_reaudit_change`，列出字段 diff 与新证据，并按内容变更重新 QA，不能称 metadata-only promotion。
- 合法必须/可能变化：目录 path；manifest 的 pilot/canary status、final collection id、精确 cutoff 与 snapshot 引用；新 collection hash 中的 path/hash；版本化 contamination snapshot。旧 pilot/canary 文件与 hash 应保留不改。
- promotion manifest 应逐文件记录 `old_path`、`old_sha256`、`new_path`、`new_sha256` 和 change class，至少区分 `byte_identical_relocation`、`promotion_metadata_only`、`source_reaudit_change`。这样才能证明复用了什么、改变了什么。

## Cheaper path

1. **DS-05：只做三案 promotion audit。** 固定全六案共享的精确 `evidence_cutoff_at`；对 STR-04/05/08 生成上述逐文件 diff、as-of contamination snapshot 和新 hash，证明 source/semantic payload 是否保持不变。不得加入 STR-06、Probe、answer runner、模型或效果指标。
2. **DS-06：只做 STR-06 source/Gold checkpoint。** 沿用同一 evidence cutoff，机械审计真实 increment/tier，限定无 regression test/FIPS 不可复现的 Outcome 断言；独立 QA 后再决定其 promotion/freeze。
3. STR-01/07 和六案 canonical data 完成后，再开独立的 evaluation-protocol 工单：从 frozen Gold/Oracle 派生有 provenance 的 Probe、critical-miss 与答案 rubric。随后才有理由实现 answer runner 或调用远端 GPT-5.6。

目前没有理由在六案完成前实现 Probe adapter、answer-model runner 或远端调用。它们既不能提高 promotion source audit 的正确性，也不能修复 STR-06 的证据上界；最便宜的验证是先保留清晰的 canonical/derived 边界。

## Falsification

### 可推翻“promotion 与 STR-06 可同工单”的证据

- STR-06 首次 source audit 需要新 event/source/outcome schema，或其 Gold/Oracle 出现上述 merge→behavior 过度推断，而旧三案 promotion 本身不受影响；
- combined candidate 中 STR-06 的 FAIL 迫使三个旧案重复 hash/source/semantic QA；
- promotion diff 无法区分 metadata-only 与 semantic payload change，或共同 cutoff 被滚动 scan 时间反复改写；
- 工单把 parser PASS、空 Probe 或 `runEvaluationSuiteV2` 的历史 substring rate 当作答案质量证据。

### 可推翻本审查 Challenge 的证据

- 一个 combined 工单仍提供两个明确的中间 gate，STR-04/05/08 promotion 可在 STR-06 FAIL 时保持独立可接受，且独立 QA 证明没有增加重复审计面；
- promotion manifest 完整记录旧/新逐文件 hash 和 change class，固定 evidence cutoff 与版本化 scan 规则，并对所有 semantic payload 变化执行等同新数据的 source QA；
- STR-06 只断言 provenance 支持的 patch/acceptance/reopen/close，不声称 regression test 或 FIPS 行为已验证，且无需改变现有 schema；
- Probe/answer protocol 被明确声明为只读引用 frozen canonical Gold 的派生层，任何效果运行前另行独立冻结。

若上述证据同时成立，本审查撤回拆单反对；否则下一工单应保持 DS-05 promotion audit 的单一结果。

## Residual uncertainty

本审查未制作 STR-06，也未核对其公开主来源的新快照；因此不能预判其最终 tier 或是否会触发 source correction。没有 Probe 映射、模型答案或效果运行，不能判断未来评价协议的可判别力。当前 macOS/Node.js 25 的 QA 也不能外推 Windows 或精确 Node.js 24。
