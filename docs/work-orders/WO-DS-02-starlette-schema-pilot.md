# WO-DS-02 — Starlette 数据 schema 与三案例 pilot

状态：IMPLEMENTED — PENDING INDEPENDENT DATA QA

## 结果

为 Starlette v1 建立可审计的数据 schema，并只规范化三个哨兵案例：

- `STR-08`：short，验证 D1 理论上足够及“停止不必要实现”的 Gold；
- `STR-05`：medium，验证 fix→reopen→refix 与 Outcome Anchor 隔离；
- `STR-02`：复合候选，验证逐事件边界并决定保持 composite 或拆分。

同时对 WO-DS-01 的全部 15 条候选应用统一的公开 benchmark contamination 扫描规则。

本工单是 schema/pilot，不是完整数据集 freeze，不运行 D0/D1/D2 或远端回答模型。

## 路由上下文

只读取：

- `AGENTS.md`；
- `docs/PROJECT_STATE.md`；
- `docs/ROADMAP.md`；
- 本工单；
- `docs/evaluation/starlette-v1-candidate-survey.md`；
- `docs/handoffs/WO-DS-01-starlette-candidate-survey.md`；
- `docs/adversarial-reviews/AR-2026-08-23-starlette-candidate-survey.md`；
- `src/evaluation.ts`、`src/assembler.ts`、`src/state-types.ts`，仅用于兼容现有 D1、typed state 与 assembler 合同；
- `Kludex/starlette` / `encode/starlette` 中与 STR-08、STR-05、STR-02 及 contamination 扫描直接相关的公开 GitHub 主来源。

不得读取原始需求归档、同级项目、宿主代码、旧 aiohttp/HTTPX 数据或任何 D2 运行结果。

## Schema 文件边界

每个 pilot 案例使用独立目录，并至少分离：

- `manifest.json`：案例元数据、纳入/排除 source、层级与 cutoff；
- `events.json`：按真实时间排序的标准化 evidence event；
- `tasks.json`：只含 slice id、cutoff 与 Current Task；
- `fact-gold.json`：当时已可确认的事实及 provenance；
- `oracle-state.json`：人工从 `<= Ti` evidence 构造的 typed state，只供后续 D2 上界；
- `decision-references.json`：真实后续动作，只用于合理性参考，不进入模型输入；
- `outcome-anchors.json`：最终 patch/test/review/acceptance，和早期 evidence 物理分离。

pilot 根目录可包含 schema 说明、严格 validator 与非最终 pilot hash 清单。Hash 只验证 schema/freeze 机制，不得把三个案例描述为最终冻结数据集。

## GitHub event → D1 turn 映射

在制作数据前固定以下映射：

1. 一个纳入的原子 GitHub Issue body、comment、Discussion reply、PR body、review、commit、merge 或 test result 对应一个标准化 evidence event；
2. 每个 event 映射为一个 `user` raw-history turn，内容包含 source type、actor、timestamp 与不引入未来信息的英文事实性转述；
3. 不合成无来源 assistant 消息，不把多个不同 timestamp 的事件合成一轮；
4. Current Task 始终是独立的当前输入，不进入历史事件；
5. D1 在后续实验中按现有 evaluator 的最近完整 user-turn 定义，从 `<= Ti` event 中取最近 N 个完整 event；
6. Outcome Anchor、Decision Reference、Fact Gold 和 Oracle-State 都不是 D1 历史输入。

如果现有 evaluator 的实际 D1 选择语义与上述映射冲突，记录为 finding 并停止扩展数据；本工单不得修改 evaluator 或 core policy 适配案例。

## Evidence 与 provenance

每个 event 至少保存：

- 稳定本地 event id；
- source kind、仓库、Issue/PR/comment/review/commit 标识；
- 直接 URL、GitHub node/database id（可获得时）；
- `occurred_at`、`source_updated_at`（可获得时）、actor；
- 标准化英文 summary；
- 对公开 source body/diff metadata 的 digest 或 immutable commit SHA，以识别后续编辑。

不在 Git 中保存完整 GitHub 抓取、缓存或大段原文。标准化 summary 必须是可核查转述，不得把后续结论写回早期 event。

## Slice 合同

- 每个 slice 的 `cutoff_event_id` 必须存在；Available Evidence 只能引用 `occurred_at <= cutoff` 的 event。
- Current Task 只能依赖当时状态，不得完整复述 Fact Gold、最终修复或后续 decision。
- 每条 Fact Gold 包含稳定 id、事实类型、statement、`first_known_at`、可选 `superseded_at` 和至少一个 provenance event。
- Fact Gold provenance 必须在该 slice 的 Available Evidence 中；已 superseded 的事实不得继续当作当前事实。
- Oracle-State 明确标记 `mode: oracle`；每个 item 的 `source_refs` 只能指向该 slice 可见 event。
- Decision Reference 可以指向 cutoff 后的真实事件，但必须与模型输入分离，且不能定义唯一正确答案。
- Outcome Anchor 必须记录真实时间；发生前不得出现在早期 evidence、task、Gold 或 Oracle-State。
- validator 必须拒绝 future leakage、未知字段、重复 id、时间逆序、缺失 provenance、跨案例引用、Gold 被 Current Task 原样包含、Outcome Anchor 混入输入及 hash 不匹配。

## STR-02 composite/split 判定

STR-02 必须先列出所有拟纳入与明确排除的事件，再回答：

1. #919→#1715 与 #2516→#2620 的桥接是同一连续决策链，还是只共享“旧修复被后续引用”的关系？
2. 如果保持 composite，是否存在至少 9 个因果连续的信息增量节点，且每个节点对后续任务仍有可解释价值？
3. 如果拆分，两段分别属于 short/medium/long 哪一层，是否仍满足 ≥3 节点与 Gold 可构造性？

判定只能依据 manifest 与公开证据，不能依据预期 D2 优势或配额需求。

## 统一 contamination 扫描

先写清并对全部 15 条一致应用规则：

- 只有公开仓库/PR/Issue 明确把同一 Starlette 问题作为 LLM、agent、benchmark、code-repair 或 eval task，或高度复制其 fix 标题/任务/patch 时，才标记 `confirmed`；
- 普通下游 bug、依赖升级、真实用户修复或无评测语义的交叉引用不算 contamination；
- 没有命中记为 `no_public_hit_found`，不能声称绝对不存在；
- 记录查询日期、查询模式、直接证据和局限；
- 扫描在 D2/model 运行前完成，后续不得只对表现不利案例追加规则。

## 允许实现

- `evaluation/starlette-v1/` 下的 schema、三案例 pilot 数据、validator 与 pilot hash；
- 聚焦 validator 测试；
- 中文 schema/pilot/contamination 报告、handoff 与项目状态更新。

机器数据字段、英文 source summary 与 Current Task 可以使用英文；说明文档尽量使用中文。

## 验收

- 三个案例目录均包含全部分离文件，所有 source 可直接核查；
- 每个 slice 可机械证明无 future leakage；
- Current Task 不原样复述 Fact Gold；
- Oracle-State 明确为人工上界且只引用当时 evidence；
- STR-02 给出可证伪 composite/split 判定；
- 全部 15 条完成统一 contamination 扫描，STR-15 的已知命中可复现；
- validator 有正例与至少以下反例：未来事件、未来 Gold provenance、Outcome Anchor 混入、重复 id、时间逆序、未知字段、跨 case 引用、Current Task 复述 Gold、hash 篡改；
- 不修改 `src/`、Context Compiler policy、MCP、依赖或 package runtime；
- 不运行模型、D0/D1/D2，不生成最终 aggregate 或 PASS rate；
- `npm test`、`npm run build`、validator、聚焦测试与 `git diff --check` 通过；真实 MCP 仍精确九工具可由既有 protocol 回归确认。

实现提交 handoff 后必须交给独立 data QA。QA 必须审计 source candidate、逐节点 manifest、三类文件隔离、STR-02 判定、统一 contamination 与篡改反例；实现者不得自我批准。

## 明确不做

- 批量规范化其余 5 条推荐案例或替补案例；
- 最终 6–10 条 hash freeze；
- D0/D1/D2 上下文生成、远端回答、Critical Miss 或评分；
- Extracted-State、extractor provider、Formal Host Mode、自动 Headline、隐式 State Update；
- core/retrieval/assembler/evaluator policy 修改；
- provider SDK、综合数学分数或 Decision Gate。

## 实现结果

- `evaluation/starlette-v1/` 已建立严格 schema、validator、pilot hash 与 15 条统一 contamination 扫描。
- 三个目录共 25 个时间有序 evidence event / slice；`STR-02` 经公开证据审计拆为 `STR-02A` 与 `STR-02B`，两段都归为 medium，任何 slice 不跨段。
- `events.json` / `tasks.json` 是唯一输入文件；Gold、人工 Oracle、Decision Reference 与 Outcome Anchor 物理隔离。
- 统一扫描确认 `STR-02`、`STR-03`、`STR-11`、`STR-12`、`STR-15` 存在公开评测复用；`no_public_hit_found` 不表示绝对不存在。
- schema pilot hash 状态固定为 `pilot_not_frozen`，不冒充最终 6–10 条冻结集。
- 聚焦 validator 反例覆盖未来 event、未来 Gold provenance、Outcome 混入、重复 id、时间逆序、未知字段、跨案例引用、task 原样复述 Gold 与 hash 篡改。

实现者自检完成后必须固定候选提交并交给独立 data QA；未通过前不得开始 6 条正式 freeze 或远端模型实验。

## 首轮 QA 退回与修复

首轮独立 data QA 结论为 FAIL：发现 `STR-02A/E4` 的创建时 slice 混入 PR #1715 后加测试，并证明 validator 接受未来 Gold、Outcome 内容及非法 source 更新时间。

Builder 已按原范围追加修复：所有创建后更新的 Issue/PR body summary 收紧到创建时标题证据；相关 Gold/Oracle/Task 同步去除不可证明细节；validator 增加 source 时间下界、event/source 类型绑定和跨全部 Gold/Outcome/未来 Decision Reference 的 Current Task 内容边界。pilot 仍未冻结、未运行模型，等待同一独立 data QA re-QA。
