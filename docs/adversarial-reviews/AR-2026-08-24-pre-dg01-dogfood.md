# AR-2026-08-24 — WO-DG-01 计划级独立对抗审查

审查基线：`main@08b32e9c600f45f2b0796f4a40bfc4dfcb31476b`，工作树 clean。范围仅含 `AGENTS.md`、PROJECT_STATE、ROADMAP、WO-DG-01、D-014/D-015、最终 V0 QA/AR 与必要 Git object；未调用模型或网络，未实现或修改任何实验、代码、状态。

## Verdict

**Challenge（针对固定基线工单；主控已接受最小协议修订）。**

固定工单能形成一份可复算的 retrospective diagnostic，但还不能把 A 的遗漏归因为宿主 compaction，也不能把 B 的优势归因为冻结 v0。A 已在 C/Gold 落盘前单次捕获，但发生在本任务读取 `AGENTS.md`、PROJECT_STATE、ROADMAP 之后；该样本可以保留为 `A_native_host_after_minimal_repo_refresh`，不应重跑或冒充纯 pre-task native memory。继续 B/C 前的真正 blocker 是 C/Gold 对 A 输出盲化并冻结，以及把单次复合输入、模型 envelope 和结论边界写死；不是新增 Context 算法、更多模型轮次或 Experience Formation。

## Facts

- `afff9367..b7f00cef` 的 Git object 区间确有 123 个提交，首末 author time 为 2026-08-23 01:11:40 至 2026-08-24 04:02:39（约 26 小时 51 分）。按 subject 首词计，66 个 `docs`、3 个 `docs(qa)`、6 个 `qa`，即至少 75/123 是 docs/QA 类提交。这是高密度项目收口 outcome trace，不是长期、连续的宿主 Event → Action → Outcome 记录。
- WO 的 directive stream 是去敏摘要并以 `after_commit` 回填顺序；原始私密对话和 opaque compaction 均不可检查。A 的真实输入 token、summary bytes 与 compaction latency 已定义为 `not_observable`（`docs/work-orders/WO-DG-01-codex-long-conversation-dogfood.md`，“可观察边界”）。
- B 的 typed state 是从 accepted docs 人工建立的 `oracle_typed_state`，不是 extractor 输出。compile_context 又依赖 `current_input`；固定 WO 只写“一次输出 + 同一 12 探针”，没有冻结这一次 retrieval query 的逐字内容。
- D-014 与 D-015 的 authority conflict 真实存在：D-015 明文 supersede D-014 中“所有 ACTIVE Decision/OpenQuestion 永驻前台、禁止任何 semantic retrieval”的绝对表述，同时保留 Constraint 和 lifecycle 语义（`docs/DECISIONS.md`）。这适合作为预注册反例，但不能单独证明一般化。
- 最终 V0 AR 只支持本机线性化与正确性边界；同进程 host availability、长历史 writer latency 和跨环境表现没有被证明（`docs/adversarial-reviews/AR-2026-08-24-post-v0-15-linearization-final.md`）。
- 审查中主控报告：A 已在 C/Gold 落盘前捕获，但捕获前已读取上述三份最小项目文档；B 将固定为单个 12 题复合 `current_input`，同模型 `gpt-5.6-sol`、`medium`、fresh `fork_turns:none`、一次且无 retry；narrow recovery 只作 context 诊断。

## Strongest challenge

### 1. A 的可观察结果不能支持“宿主 compaction 导致遗漏”，且 C 仍有事后适配风险

**具体反例。** 若探针问“当前冻结状态”或 D-014/D-015 谁具有 authority，A 可能仅凭刚读过的 PROJECT_STATE/ROADMAP 回答正确，即使更早的 native context 已遗忘；反过来，A 答错也不能区分 opaque compaction、探针歧义、长会话注意力失败或冲突权威选择。报告交付中的“宿主 compression 影响”因此过强，最多是“该 condition 下的回答 omission/pollution，原因 `not_attributable`”。

即使 A 早于 C 捕获，若看过 A 的人再挑选 C 的 required/forbidden assertion 或词形，仍可使 lexical Gold 贴合或惩罚 A。`C 不是由模型回答生成` 不足以排除这一选择效应。

**最小可执行修订。** 不重跑 A；固定上述 condition 标签。C 必须由未见 A/B capture 的独立路径，仅从 `b7f00cef` 的预注册 SHA/path/rule 建立，并在评分前以 manifest/hash 冻结；probe 文本、required/forbidden key 和 normalizer 一并冻结。若 C 作者已见 A，应明示 `Gold adaptation risk`，自动结果只作诊断。

### 2. B 是“人工整理状态 + frozen compiler”的 upper bound，不能隔离 v0 效果

**具体反例。** 对 D-014/D-015 冲突，人工 oracle 可直接写入“D-015 supersedes D-014”，而 A 继承的是含旧决定的历史。B 命中新规则可能完全来自人工 authority resolution；它不证明 extractor、state formation 或 compiler 从真实宿主流中正确恢复了规则。相同 accepted docs 同时产生 oracle 与 C，也会结构性增加 Gold-language overlap。

**推断。** `123 Git commits` 可称真实 outcome trace；去敏 directive 只能称 retrospective sanitized reconstruction；二者合并仍不是当前宿主的完整原始事件流。B 结果必须标为 `oracle_typed_state compiled upper bound`，不能外推为 v0 end-to-end correctness、Experience Formation 或真实使用效果。

**最小可执行修订。** 冻结 oracle 每项的 source provenance，并报告 oracle/C 的来源重合；禁止为匹配 C 人工改写非源生 assertion。完整 prospective raw host ingestion 是未来反驳此偏差所需证据，不是本工单 blocker。

### 3. 单个 12 题复合输入与继承/fresh session 只能给一次 condition comparison，成本和延迟不可配对

**具体反例。** 若 B 用“请回答以下 12 题”作为唯一 `current_input`，BM25 会按整组词汇检索；第 12 题可能因第 1 题的 D-015 词汇召回证据。它与每题独立 retrieval 不同，12 个 probe 也不是 12 个独立样本。A 继承当前线程而 B 为 fresh fork，即使 model 名相同，system/tool/context envelope 仍不同；A token 与 compaction latency 不可见，不能计算 A/B token reduction 或 latency ratio。

**最小可执行修订。** 把逐字、顺序固定的 12 题复合文本声明为唯一 B `current_input`，将结果称“一次复合请求的 12 项评分”，不报告独立性或方差。固定 `gpt-5.6-sol`/`medium`、工具禁用、顺序、一次无 retry；分别报告 A `not_observable` 与 B 的估算/本机 compile latency。narrow recovery 只比较 compiled context，不再生成第二个结论性回答。writer-boundary 仅是固定机器、固定进程拓扑和样本数下的 raw smoke observation，不设置 correctness gate 或一般化结论。

## Cheaper path

保留唯一 A capture，不再通过重跑增加 repo-refresh 污染。在执行 B 前只增加一个 protocol-only gate：

1. 冻结 A condition 标签、12 题复合文本、B 的逐字 `current_input`、模型 envelope、顺序和 no-retry；
2. 由未见 capture 的路径从固定 baseline 生成并 hash 冻结 C，以及 D-014/D-015 的旧/新 SHA、path、原文规则；
3. 冻结 oracle provenance 和 oracle/C overlap 记录；
4. 运行一次 B、一次 context-only recovery diagnostic，以及已有范围内的本机 latency smoke。

无需把 12 题拆成 12 次调用，无需新增模型 judge、core、extractor、PACE 或 Experience 实现。若无法做到盲化 C，则更便宜且诚实的路径是只发布 A/B capture 与来源对照，不产出 correctness rate。

## Falsification

### 可推翻主控原判断的证据

- C/Gold 的作者、生成进程或选择记录接触过 A/B capture 后才确定 required/forbidden key、probe 或 normalizer；这将推翻 A/B/C 隔离并使 correctness comparison 失效。
- 报告把 A 错误写成 native compaction omission，或计算 A/B token、latency efficiency ratio；opaque 与不可观测边界足以推翻该结论。
- 报告把 oracle-B 的正确回答归为 extractor/compiler end-to-end 效果，或把 retrospective directive reconstruction 称为完整真实宿主流；现有 provenance 足以推翻该归因。

### 会让我撤回反对的证据

- 独立 reviewer 可验证：C 在不见 A/B 的条件下，仅由预注册 baseline authority 生成并先 hash 冻结；模型输入、顺序、工具策略、一次无 retry 也已冻结。
- 报告始终使用 `A_native_host_after_minimal_repo_refresh`、`cause:not_attributable`、`oracle_typed_state compiled upper bound`、`real Git outcome trace` 和 `retrospective sanitized directive reconstruction`，不作 causal、winner、efficiency 或一般化声明。满足这些条件时，本审查撤回对执行这一 bounded diagnostic 的反对。
- 若未来要撤回 oracle structural bias 或“非真实原始宿主流”的保留，则需 prospective、非 oracle 的 raw host event → state 生成和独立 Gold，而不是更多同源人工整理；该证据不属于 WO-DG-01 的继续条件。

## 主控处置

主控已接受以下最小修订：保留且不重跑已捕获 A，明确其发生在最小 repo refresh 后并将原因记为 `not_attributable`；B 固定单一 12 题复合输入、`gpt-5.6-sol`/`medium`/fresh `fork_turns:none`/一次无 retry；narrow recovery 仅作 context 诊断；Git、directive 与 oracle 分别按本审查的三种边界命名；预注册 authority SHA/path/rule 与 writer 本机样本。本 Verdict 仍为 Challenge，直到 C 的独立盲化冻结和这些 append-only 协议变更实际落盘；完成后可降为 **Agree with reservations** 并执行一次 bounded observation。
