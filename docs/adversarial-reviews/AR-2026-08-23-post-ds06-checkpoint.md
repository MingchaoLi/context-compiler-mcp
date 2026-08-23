# AR-2026-08-23 — DS-06 checkpoint 后推进顺序审查

日期：2026-08-23

审查对象：已接受 source candidate `f4931ad35cc7e4a844bb40ceb397aaf07842616d`；QA docs baseline `eb8caa579ee6c23b5195f4af305bdc005f183f92`

审查范围：只读核对项目状态、路线图、DS-06 工单/报告/QA、DS-05 promotion 的直接依赖以及既有 post-DS04 对抗结论；未运行 D0/D1/D2、模型或网络检索。除本记录外未修改项目文件。

## Verdict

`Challenge`

挑战把 STR-06 单案 promotion（A）或 Probe/answer rubric（C）当作下一步 blocker。建议选择 B，但进一步限定为：**下一工单只制作 STR-07 source/Gold checkpoint，不以补 medium 配额为目标，也不 promotion STR-06。** 随后单独制作 STR-01，再把 STR-06/07/01 一次性 promotion。

DS-06 的真正新证据是 STR-06 从 projected medium 变为 16-increment long，并证明现有 schema 能表达“merge/close、真实失败、reopen、有限单环境成功、残余不确定性”。它没有创造必须立刻复制七文件或扩 promotion validator 的依赖。空 Probe 继续阻塞首次效果运行，但不阻塞剩余 canonical data 制作。

## Facts

- DS-06 独立 re-QA 在固定 source candidate `f4931ad…` 接受 16/16 source、increment、slice 与 Gold/Oracle 边界；状态仍为 `checkpoint_not_frozen`、`promotion_authorized:false`、`evaluation_ready:false`、`model_run_authorized:false`：`docs/qa/WO-DS-06-starlette-str06-source-gold-checkpoint.md:73-96`。
- STR-06 manifest 机械登记 16 个 information increment，tier 为 long：`evaluation/starlette-v1/checkpoint/STR-06/manifest.json:7-15`。报告明确说明若压缩 E8–E12 会丢掉能力边界、验证阻塞和真实失败这一关键反转：`docs/evaluation/starlette-v1-str06-checkpoint.md:48`。
- 当前已审计的固定六案子集为 STR-08 short、STR-05 long、STR-04 long、STR-06 long；STR-07/01 尚未制作。因此当前实际分布是 1 short / 0 medium / 3 long，不是旧预计 2/1/3。DS-06 报告已明确禁止为了补 medium 少计 STR-06 或换案：同文件 `:75`。
- DS-05 promotion collection 只有 STR-08/05/04，仍为 `promotion_candidate_not_frozen`，剩余 STR-07/06/01，且 `evaluation_ready:false`、`model_run_authorized:false`：`evaluation/starlette-v1/promotion/collection.json:3-8,48-49`。
- DS-05 的 promotion 不是简单状态翻转：21 个 byte-identical relocation 之外，还维护 collection、diff、source re-audit、snapshot、25 项 hash，并在首次 QA FAIL 后把 21 项 accepted path/order/SHA 固定进 validator 代码合同：`docs/evaluation/starlette-v1-three-case-promotion.md:14-18,34`、`docs/qa/WO-DS-05-starlette-three-case-promotion-audit.md:48-58`。
- DS-06 checkpoint hash 可与普通 payload 协调重算；当前可信锚点是固定 Git candidate 与独立 source audit。QA 只要求**未来 promotion 时**把七文件 path/order/SHA 固定进不可自举改写的合同：`docs/qa/WO-DS-06-starlette-str06-source-gold-checkpoint.md:87`。
- 既有对抗审查已证明空 Probe/Gold→Probe 与 answer evaluation 是效果运行前 blocker，而不是 canonical source-data promotion blocker：`docs/adversarial-reviews/AR-2026-08-23-post-ds04-wiring.md:29-42,71-75`。

## Inferences

- 立即 promotion STR-06 的独立收益只有“把已接受 Git 锚点再表达为 promotion relocation/validator 合同”。它不增加 source、Gold、tier、Probe 或模型实验信息，也不能把 4/6 collection 变成 evaluation-ready。
- 延后 promotion 不使 STR-06 失去锚定：source candidate 和 QA docs commit 已固定。待 STR-07/01 也接受后，一次固定三个 accepted-source 合同可少做两轮 collection/diff/hash/validator 版本迁移和重复 QA。
- 0 medium 是样本设计限制，不是继续制作 blocker。它禁止 medium-tier 结论和把总体 aggregate 当一般性估计；它不授权事后换案、漏计 increment 或把 long 强拆为 medium。
- STR-07 是下一案中成本和边际信息的较优选择：survey 预计 4 个节点/short，终局是无 patch 的设计决定，能先增加第二个 short，并攻击“最终答案很短时 Current Task 同义泄漏”的风险。STR-01 预计 long，而当前已有三个已审计 long，下一步边际分层信息较低。

## Strongest challenge

### 1. 单案 promotion 是可延后的状态搬运，不是继续数据制作的 blocker

**具体反例：** 新工单把 STR-06 七文件 byte-identical 复制到 `promotion/cases/STR-06`，更新 collection、promotion diff/hash，并把 `f4931ad…` 的七项 SHA 写入 validator。所有 promotion 测试可以 PASS；结果仍只有 4/6 case、0 medium、空 Probe、`evaluation_ready:false`，既不能运行可信实验，也没有检验 STR-07/01 的来源或 schema。下一案加入时还要再次修改同一 collection、hash 与固定合同。

这不否定最终 promotion 的必要性；它只说明“现在单独做”没有足够增量价值。DS-06 QA 所说的 accepted-source contract 是**promotion 的验收条件**，不是制作下一案的技术前置。Git candidate 已提供不可变锚点。

**何时 A 才会成为 blocker：** 若后续 case loader/validator 只能安全读取 promotion 目录、无法以固定 Git candidate/path/SHA 读取 accepted checkpoint，或延后会导致无法证明 STR-06 payload 身份。当前没有这类证据。

### 2. STR-06 变 long 暴露 selection bias，但“补 medium”会制造更坏的适应性选样

**具体反例：** 为恢复 2/1/3，把 STR-06 的 E8–E12 视为重复并降回 medium。机械文件、hash 和 tier 可以内部自洽，但会删除 RHEL backport 反证、验证要求、验证阻塞和真实 FIPS 失败，导致首次 merge 看起来比实际更可靠。DS-06 已直接证明这五段是关键推理反转，故该路径不诚实。

另一个反例是看到 0 medium 后换入一个 survey 标为 medium 的 reserve。STR-05/06 已连续证明 survey 节点估计会在逐事件审计后变 long；新候选仍可能不是 medium，而且换样条件是在看到正式候选实际分层后才启用，会把长度平衡凌驾于固定 case/provenance 规则。

最小处置不是“修复”样本，而是预注册最终报告：实际 tier 按 case 披露；medium 为 `not represented/not evaluable`；overall aggregate 只作描述，不能作为一般化 gate。若 medium 覆盖是核心决策所必需，应在运行模型前另开 v2 扩样工单，而不是改写 v1 六案。

### 3. 现在做 Probe/answer rubric 会在不完整 outcome 类型上过早定型

**具体反例：** STR-06 Gold 同时包含真实失败、tracker/repository acceptance、有限单环境成功和跨环境不确定性。现有 evaluator Probe 只有 constraint/decision/resolved issue/open question 四类。若现在为了“可评”把第二次 close 映射成 `resolved_issues`，D2 只要不重开它就可能得高分；但正确 Gold 恰恰要求保留未验证 current-master/跨环境问题。机械 Probe 指标会奖励错误的确定性。

STR-07 的无 patch 设计终局和 STR-01 的失败 PR→窄边界实现尚未进入 canonical Gold。此时写 adapter/rubric 很可能在后两类出现后改版。更便宜路径是先完成六案，再做一次 Fact Gold 类型覆盖表，明确哪些事实映射到 context-retention Probe、哪些只进入 answer rubric、哪些是 critical miss；随后才实现 runner。空 Probe 因此阻塞模型实验，不阻塞 STR-07/01 数据制作。

## Cheaper path

1. **下一工单：STR-07 source/Gold checkpoint only。** 沿用固定 `evidence_cutoff_at` 和 contamination snapshot；机械审计真实 increment/tier、设计决定、无 patch Outcome 与短答案同义泄漏。不得为 short 配额少计，也不得修改 promotion、Probe、runner 或模型。
2. STR-07 独立 QA 后，再以同样边界制作 STR-01 checkpoint；若任一案需要新 schema，才开局部 schema gate，不预先扩通用 validator。
3. 三个新案全部接受后，单次 promotion STR-06/07/01：一次性固定三个 accepted Git candidate/path/order/SHA，更新 collection/diff/hash，并做最终全集 contamination snapshot。避免每案一次 relocation/collection rehash。
4. 六案 canonical data 完成并报告实际 tier 后，另开 evaluation-protocol 工单：先做 Gold 类型覆盖与 Probe/answer-rubric 映射，不调用远端模型；只有协议独立 QA 后才实现/运行 answer runner 或 GPT-5.6。

**当前 blocker：** STR-07/01 逐案 source、increment、Task、Gold/Oracle 和 future-leakage 人工审计；最终 promotion 时的 accepted-source 固定合同；模型运行前的 Probe/answer protocol 与 pre-run contamination snapshot。

**不是当前 blocker：** STR-06 立即 relocation、精确 short/medium/long 配额、每案扩一次 promotion validator、完整最终架构、answer runner、provider 或远端模型。

## Falsification

### 可推翻 A/C 作为下一步判断的证据

- STR-06 单案 promotion 后 collection 仍为 4/6、无 Probe 且不可运行，却要求再次为 STR-07/01 重写相同 collection/hash/validator；
- 为补 medium 必须漏掉 STR-06 已审计 increment、强拆连续 lineage 或按 observed tier 换案；
- Probe adapter 将 STR-06 的 tracker close/有限成功映射成 resolved behavior，或在 STR-07/01 加入后必须改变已冻结的 Gold/critical-miss 语义；
- 单案 promotion、Probe 或 runner 工作没有发现任何新 source/Gold/schema 事实，只增加状态与基础设施。

### 可推翻本审查 Challenge 的证据

- 后续数据制作工具只能消费 promotion 目录，且不能通过固定 Git commit/path/SHA 安全引用 STR-06 checkpoint；立即 promotion 因而是可复现技术 blocker，而非状态偏好；
- 单案 promotion 可在不新增/改动通用 validator、collection schema 或重复 source QA 的情况下完成，并显著降低后续三案总成本；
- 对现有四案做最小 Gold 类型覆盖已经证明 canonical schema 缺字段，若不先修就会迫使 STR-07/01 重写；此时应先做有界 schema/rubric canary，但仍不需要远端模型；
- STR-07 主来源在固定 cutoff 下不足、确认污染或引入比 STR-01 更大的新 schema 风险，而 STR-01 有更低成本和更高边际验证价值。

若这些证据成立，本审查撤回对 A、C 或 STR-07 优先顺序的相应反对。

## Residual uncertainty

STR-07/01 尚未制作，survey 节点数只是估计；不能保证 STR-07 最终仍为 short，也不能预断 STR-01 的 schema 成本。当前六案最终分布很可能是 2 short / 0 medium / 4 long，但只有两案逐事件 QA 后才能成为事实。没有 Probe 映射或模型输出，无法判断任何 D2 效果；当前 macOS/Node.js 25 证据也不能外推 Windows 或精确 Node.js 24。
