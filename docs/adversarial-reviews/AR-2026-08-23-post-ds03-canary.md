# AR-2026-08-23 — DS-03 canary 接受后的冻结路径审查

日期：2026-08-23

审查对象：`main` 固定 clean baseline `6a3e3289dda409ed0d8ac5357c4fd10b4f360718`

审查范围：只读核对项目状态、路线图、DS-01 survey、上一轮 schema-pilot 对抗审查、DS-03 工单/报告/QA，以及当前 manifest、hash 与 contamination 记录；未运行模型或 D0/D1/D2，未修改代码和数据。

## Verdict

`Challenge`

同意另开 freeze 工单并预注册固定六案 `STR-07/08/05/06/01/04`，也同意不再追求旧 2/2/2。挑战的是把“STR-04 canary PASS”外推为“现有三案可直接升级、其余三案可按当前实际 2 short / 1 medium / 3 long 一次批量制作，全部完成后才 QA”。DS-03 证明了 schema 能表达一个 long/open/partial-capability 案例；它没有证明未制作案例的层级、Gold/Oracle 因果边界或最终数据集到 evaluator 的接线。

长度、组件和 outcome 混杂不阻止继续 freeze；只要原样披露，它们是小型 purposeful sample 的限制。但这些混杂阻止把未来未分层 aggregate 当作一般性效果或统计估计。

## Facts

- DS-03 最终 QA 明确保留 `pilot_not_frozen`、`canary_not_frozen`，且“不授权……批量 freeze 或模型运行”：`docs/qa/WO-DS-03-starlette-long-open-canary.md:105`。当前两个 hash 文件也分别仍是该状态：`evaluation/starlette-v1/pilot-hashes.json:3`、`evaluation/starlette-v1/canary-hashes.json:3`。
- 已机械计数的目标案例只有 STR-08 short（4 increments）、STR-05 long（9）和 STR-04 long（18）：`evaluation/starlette-v1/pilot/STR-08/manifest.json:7-15`、`evaluation/starlette-v1/pilot/STR-05/manifest.json:7-15`、`evaluation/starlette-v1/canary/STR-04/manifest.json:7-15`。
- STR-01、STR-06、STR-07 仍只有 survey 的“约 10 / 约 7 / 约 4”估计：`docs/evaluation/starlette-v1-candidate-survey.md:24,29-30`。同一 survey 明示这些节点数是工作量估计，不是已冻结切片数：同文件 `:216`。
- STR-05 已经提供一个直接先例：survey 把它估为 medium，逐事件审计后 9 个增量使其改为 long：`docs/qa/WO-DS-03-starlette-long-open-canary.md:35,80`。
- DS-03 的机械 validator 仍不能证明语义无 future leakage；报告和 QA 都保留了一个 validator 会接受、人工必须拒绝的同义改写反例：`docs/evaluation/starlette-v1-long-canary-gate.md:43`、`docs/qa/WO-DS-03-starlette-long-open-canary.md:83,102`。
- STR-06 的公开证据只有 patch/review/merge，没有仓库 regression test，且 FIPS 行为难在本地重放；survey 已限定 Gold 不能从 merge 推断平台最终成功：`docs/evaluation/starlette-v1-candidate-survey.md:91-93`。STR-07/08 的终局答案很短，survey 已警告 Current Task 不得复述 regex/URI-template 或 context-manager 结论：同文件 `:207`。
- contamination 记录的扫描时点是 `2026-08-23T03:00:00Z`，六个目标当前均为有限的 `no_public_hit_found`；记录同时声明索引搜索不能证明 absence：`evaluation/starlette-v1/contamination-scan.json:3,12-16,65-96,188`。

## Inferences

- “2 short / 1 medium / 3 long”目前是合理的**预计分布**，不是六案的当前实际分布。把它写成必须保持的配额，会在 STR-01/06/07 审计时重新制造少计或拼接信息增量的激励。
- canary PASS 足以撤销“还需先设计另一套 long schema”的 blocker，但不足以撤销逐案 source、Task、Gold/Oracle、语义泄漏和 contamination 审计。后者是数据正确性 gate，不是重复做 schema canary。
- STR-05/08 的内容可以复用，STR-04 canary 也可复用；但从 pilot/canary 到正式 freeze 不是状态字段直改。正式集合仍需固定共同 cutoff、重新复扫来源/污染、记录复用字节是否不变，并生成最终集合 hash。
- 不需要给 STR-01/06/07 各做一个完整 canary。只有某案引入当前合同无法表示的新 source/event/outcome 形态时，才应停下做局部 schema gate；每案都需要的只是独立语义审计。

## Strongest challenge

### 1. “实际 2/1/3”会把未审计估计伪装成事实

**具体反例：** STR-06 目前只是“约 7 / medium”。若规范化时，首次 PR 的方案与 merge、issue close、后续 reopen、第二 PR 的 compatibility-wrapper 约束与 acceptance 分别构成 9 个真实增量，机械合同就要求它为 long。若工单先把“1 medium”设为结果约束，Builder 可以省略一个 close/reopen 或 review increment，manifest、hash 和内部一致性检查仍可能全绿，因为 validator 不能从未纳入的外部事件证明缺失。STR-05 已经真实发生过同型的 medium→long 修正。

**证据位置：** survey `:29,216`；增量合同 `docs/work-orders/WO-DS-03-starlette-long-open-canary.md:38-53`；STR-05 修正 QA `:35,80`。

结论不是反对预注册分布，而是要求写成 `projected`，并预注册“逐案审计可改层但不得换案、不得为配额少计”的规则。

### 2. 一个 long/open canary 没有覆盖各案最危险的语义误标

**具体反例 A（STR-06）：** 以 #1410 merge/issue close 为 provenance，把 Oracle 写成“FIPS ETag 已验证解决”。该记录结构、时间和 hash 都可合法，甚至可能通过 validator；但公开证据没有 regression test，也不能在本地重放 FIPS 成功，Gold 只能断言 patch/acceptance，不能断言平台行为。DS-03 自己曾出现同型错误：仅有 `closed` 且 `commit_id:null` 的 tracker event 被过度解释为原需求 resolved/delivered，机械校验通过，直到独立 QA 退回：`docs/qa/WO-DS-03-starlette-long-open-canary.md:65-67`。

**具体反例 B（STR-07）：** 在早期 Current Task 中写“按 URI template 而非 arbitrary regex 解释该 route”。这不必字面复制未来 Gold，却已经给出最终设计结论；现有 validator 的已知能力边界允许同型同义泄漏。

这证明逐案语义审计是真正的继续条件；它不证明需要三次完整 schema canary。

### 3. “五案做完再 QA”错过了一个便宜的集成失败点

**具体反例：** 当前三个已接受目标分散在 pilot/canary 两套未冻结 hash 中，DS-03 从未运行最终集合的 evaluator 接线。即使五个新增/升级案例各自都通过现有 validator，最终集合仍可能在共同 case index、freeze hash、slice 到 evaluator 输入映射或报告分层处暴露合同缺口；此时前三案之外的制作成本已经全部发生。现有证据不足以断言该缺口一定存在，但也没有端到端证据排除它。

先使用现有 STR-04/05/08 做无模型、无效果解释的 loader→`projectModelInput`→runner 输入形状 smoke，可以在制作其余案例前检验同一前提。真实模型输出或 case-level D0/D1/D2 效果不应在六案 freeze 前暴露，否则可能反向影响剩余 Task/Gold 策展。

## Cheaper path

1. 新工单先固定六个 case ID、禁止依据任何 dry-run 结果换案；把 2/1/3 标为预计分布，并允许按信息增量审计透明改层。
2. 直接以现有 accepted STR-04/05/08 作为**非冻结 fixture**做一次 deterministic/no-model 接线 smoke：只检查最终集合索引、字段投影、slice 边界、runner 可消费性和报告 schema；不生成模型回答、PASS rate 或案例效果解释。失败则先修合同，避免先制作其余三案。
3. smoke 通过后，复用但不“直接升级” STR-04/05/08：按共同 freeze cutoff 复扫 source/contamination，确认字节与已接受候选的差异，重新人工审计语义边界并写入最终 hash。
4. 新案例先做 STR-06，因为“外部环境、merge 但无 regression test”的 Outcome Anchor 是现有 canary 未覆盖的高风险语义形态；它通过局部 source/Gold checkpoint 且不需 schema 变化后，再制作 STR-07 与 STR-01。最后对六案做一次独立 data QA，再允许真实模型实验。

该路径不减少最终可信六案实验所需的数据量；它降低的是发现接线或新证据形态失败时的沉没成本。三案本身不足以支持可信 D2 效果结论，尤其缺少 medium，因此不存在用三案替代最终六案而获得同等决策证据的更便宜路径。

**继续 freeze 的 blocker：** 固定 case ID 与不按结果换案；逐案真实 increment/tier；source、Task、Gold/Oracle 与语义泄漏人工审计；共同 freeze cutoff 的 contamination 复扫与有限表述；最终 hash 和独立 data QA。

**不是 blocker：** 精确 2/1/3、统计代表性、每案一个 canary、FIPS 本地复现、绝对无训练污染证明、自动语义泄漏检测，以及正式模型/aggregate 在 freeze 前运行。

## Falsification

### 可推翻 Builder 判断的证据

- STR-01/06/07 任一逐事件审计后 tier 不符合预计 2/1/3，或为维持分层必须漏掉真实 increment；
- 任一新案例需要改变 schema、event/source/outcome 类型或模型投影才能诚实表示；
- STR-05/08/04 promotion 的共同 cutoff 复扫发现 source 变化或 confirmed contamination；
- 类似“merge/close = 行为已验证解决”或同义 future answer 的记录通过机械 validator，却在独立语义审计失败；
- 三案 no-model smoke 证明当前未冻结布局不能直接进入最终 evaluator/report contract。

### 可推翻本审查 Challenge 的证据

- 新工单把 2/1/3 明确写成预计而非配额，并允许不换案的透明改层；
- STR-04/05/08 在共同 cutoff 下完成 promotion audit，最终 hash 能证明复用范围，污染结论仍符合统一规则；
- STR-01/06/07 不改变 schema/投影合同，逐案 provenance、Gold/Oracle 与语义泄漏审计均通过，尤其 STR-06 不把 merge 冒充 FIPS 行为验证、STR-07 不在 Current Task 中提示设计终局；
- 最终六案通过独立 data QA，报告只按 case/tier/component/outcome 披露，且不把 aggregate 推广为总体估计。

若这些证据成立，本审查撤回对批量 freeze 的 Challenge；剩余意见只是不影响开工的执行顺序优化。

## Residual uncertainty

未制作的 STR-01/06/07 还没有 manifest、切片和人工 Gold，因此无法从 survey 推断其最终 tier 或实际制作成本；本审查的 STR-06 九增量路径是用于证伪配额的具体假设，不是已核实计数。尚无模型结果，不能判断 D2 效果。当前证据也不能从 macOS/Node.js 25 推断 Windows 或精确 Node.js 24 行为。
