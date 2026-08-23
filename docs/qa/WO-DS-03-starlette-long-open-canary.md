# WO-DS-03 独立 data QA

日期：2026-08-23

结论：**FAIL — 不接受“STR-04 已确认污染、canary gate 必须关闭”的结论。** 本结论不批准 STR-04 fixture、模型实验、reserve 替换或任何 core 改动；只要求把污染规则的现有语义与记录对齐后再决定如何继续。

## 固定候选与审计范围

- 分支：`main`；开始时工作树 clean；候选：`57279d1ff8914de403f9992c38ec565e88c4b78d`；父提交：`7537f5c5bef7faa6e90ed5ff77a81a9fc876a4b5`。
- 候选差异只涉及 DS-03 文档、`contamination-scan.json` 与其 hash；没有 `src/`、依赖、MCP、validator、canary fixture、projection、模型输出或 reserve 替换。目录仍只有三个 DS-02 pilot case。
- 我直接读取了固定外部提交 `Uniyalsumit/CT_PROJECT@c11a9ce776b73670789a8757c033ff11b115fa42` 的 `ragas_results_test.csv`、`ragas_dataset.py`、`ragas_eval.py` 与 `benchmark.py`，并抽查了 STR-04 的 GitHub Issue/PR 元数据和 STR-05 的原始评论、评审、状态事件。

## 阻塞项

### P0：把“检索上下文偶然包含 #2349”扩大成“同一 fix 被作为 evaluation task 复用”，不符合已冻结规则

事实：固定 CSV 确实是 RAGAS 输出；其 `Tell me about router changes.` 行的 `retrieved_contexts` 中确实有 Starlette 0.33.0 release-note 片段，明确链接 PR #2349。`ragas_dataset.py` 将 `ask(q)` 取得的 answer/documents 存入 question/answer/contexts；`ragas_eval.py` 又以 `faithfulness` 与 `answer_relevancy` 对该数据集评分。因此“#2349 曾进入一个公开 LLM/RAGAS 的 retrieved context”已证实。

但同一固定提交的 `benchmark.py` 将该第 45 条列为 `category: ambiguous`，问题只是 `Tell me about router changes.`，其 `ground_truth_ref` 为 **`PR #15745 -- VERIFY`**，而不是 #2349、#685 或 STR-04 的任何固定来源。CSV 中的生成答案也没有把 #2349 当作该问题的参考答案或修复任务；#2349 只是多个检索文档中的一个 release-note 条目。

已冻结 `contamination-scan.json.rule` 的触发条件是“公开仓库**显式复用同一 Starlette issue 或 fix 作为** LLM、agent、benchmark、code-repair 或 evaluation **task**，或高度复制该 task/patch”。这与“某个泛化问题的一次检索上下文包含该 fix”不同。Builder 文档把条件改述成“任何固定 lineage source 出现在 LLM/RAGAS evaluation artifact 即 sufficient”，漏掉了既有规则的 `as ... task` 限定。现有一手证据不能证明 #2349 是该评测任务、Gold、预期答案或 patch；因此也不能证明它影响了该行答案。

结论是对既有规则的直接适用，而不是事后收窄：规则在 DS-02 时已写成 task/patch 复用；同一扫描当时也排除了无评测任务语义的普通下游、vendored 和 workaround 命中。若现在仅因命中发生在 RAGAS 文件中就改为 `confirmed`，才是扩大判定口径。该事实可以作为公开交叉引用和未来更严格污染定义的候选证据，但不足以导出当前 `confirmed` 或 gate closed。

可复现主来源：

- <https://github.com/Uniyalsumit/CT_PROJECT/blob/c11a9ce776b73670789a8757c033ff11b115fa42/evaluation/benchmark.py>
- <https://github.com/Uniyalsumit/CT_PROJECT/blob/c11a9ce776b73670789a8757c033ff11b115fa42/evaluation/results/ragas_results_test.csv>
- <https://github.com/Uniyalsumit/CT_PROJECT/blob/c11a9ce776b73670789a8757c033ff11b115fa42/evaluation/ragas_dataset.py>
- <https://github.com/Uniyalsumit/CT_PROJECT/blob/c11a9ce776b73670789a8757c033ff11b115fa42/evaluation/ragas_eval.py>

## 已通过但不足以抵消 FAIL 的核查

- `Issue #685` 仍为 open（创建于 2019-10-22）；PR #1286 未合并而关闭；#1649、#2349 分别在 2022-09-21、2023-12-01 合并。该范围可支持 long/open 的来源预审，且不能把两个 partial capability 当作 #685 已解决。
- STR-05 的九个 event 都是信息增量：问题、首个实现、已合并状态、回退重开、第二个实现、安全约束、默认关闭的 opt-in 设计、评审未定/替代方案要求、作者接受 opt-in 修改。原始 GitHub 评论、review 与状态事件均与该判定一致；没有诚实的 medium（5--8）计数。因此从 medium 改为 long、撤回旧 2/2/2 声明是正确的，且独立于本 P0。
- `node evaluation/starlette-v1/validate-pilot.mjs` 通过：3 cases / 4 segments / 25 events / 25 slices，hash verified（候选当前会把 STR-04 列为 confirmed，但这正是 P0）。
- `npx vitest run test/starlette-pilot.test.ts`：21/21；`npm test`：12 files / 263 tests；`npm run test:protocol`：8/8；`npm run build` 与 `git diff --check` 均通过。

## 返回条件

1. 维持当前预注册规则时，将 STR-04 从 `confirmed` 改回有限的 `no_public_hit_found`（可在 notes 中记录该 context-only cross-reference 及其局限），更新 hash，并撤销由此推导出的 `GATE CLOSED` 状态；随后按 WO-DS-03 原先范围继续其 long/increment/projection canary，仍不得自动换 reserve 或运行模型。
2. 若主控希望采用“任意固定来源出现在 LLM evaluation context 即 confirmed”的更严格定义，必须新建并预注册一项**统一**污染规则变更，重扫全部 15 个候选，再重新决定 STR-04；不得只对这个不利命中追溯扩大定义。
3. 在任选一条路径产生新的 append-only Builder 提交后，重新进行独立 data QA。此前不接受 gate closed，也不将本次 RAGAS 命中误写成 #2349 专属评测任务。

## Re-QA（候选 `1d7b2d0d4032659c7b08cca3adadb296802840ce`）

日期：2026-08-23

结论：**仍为 FAIL — 不接受 STR-04 canary/schema gate。** 本轮实现正确恢复了 context-only 污染分类，且大部分来源、分层、投影与机械合同通过；但关键关闭→反驳→重开的中间 Oracle 状态把“GitHub issue 被关闭”过度解释为“原始需求已解决、Mount 已交付”，与本工单的 partial-capability 边界冲突。

### 固定候选与范围

- 分支：`main`；开始时工作树 clean；候选为 `1d7b2d0d4032659c7b08cca3adadb296802840ce`，父提交为 `a364da46ed5b96ecba9d794d6dea863eb3223738`。
- diff 限于 `evaluation/starlette-v1/`、聚焦测试和中文 docs；没有 `src/`、依赖、MCP、provider、evaluator/retrieval/assembler policy 改动，也没有 D0/D1/D2、远端模型、aggregate、PASS rate 或 reserve 替换。

### P0：T13 Oracle 将“关闭”写成“原始问题已解决/ Mount 已交付”

`STR-04/E13` 的公开 GitHub state event（id `7433573738`，`2022-09-21T19:02:43Z`，actor `adriangb`）仅陈述 Issue #685 `closed`；其 canonical event payload 的 `commit_id` 为 `null`。在可见 evidence 中，#1649 只有此前的创建与 review，实际 merge 刻意隔离在 Outcome Anchor `O2`，不能倒灌进这一时点。

然而 `oracle-state.json` 的 `STR-04/T13` 同时写入：

- `I1`：`OPEN_QUESTION/RESOLVED`，内容为“How can middleware obtain routing information?”；
- `I9`：`DECISION/ACTIVE`，内容为“Treat Mount middleware as the current delivered direction.”

二者的 provenance 分别是 `E1,E13` 与 `E10,E13`。关闭事件只能证明当时的 tracker 状态，不能证明原始 global APM/route-name 需求已被实质解决，也不能从 `E10`（PR 开启）与一个无 commit 指针的关闭 event 推出 Mount patch 已交付。两小时后的 `E14` 才由 maintainer 明确说明 #1649 只解决了另一类 per-Mount 问题、没有解决原始 global middleware use case；`E15` 随即重新打开 issue。

这不是模型可采用的不同合理决策，而是 Oracle/Gold 上界的事实性过度断言：会把正确的“当前被关闭但尚无解决证明”的回答当作遗漏，并人为制造 resolved-issue reopening 信号。它也直接违背 WO-DS-03 验收中的“#1649/#2349 只作为 partial capability / Outcome Anchor，不把 #685 误标 resolved”。validator 通过是预期的：它验证 timestamp/provenance 前缀，不能证明 source reference 的因果蕴含。

最小复现（无文件写入）：`loadCanary()` 后打印 `oracleState.states[12]`，再调用 `validateCaseBundle(bundle, "STR-04")`；validator 接受这个 `RESOLVED/current delivered` Oracle。直接 API 查询 `issues/685/events` 中 id `7433573738` 可复现其仅有的 closed state 与 null `commit_id`。

可复现主来源：

- <https://api.github.com/repos/Kludex/starlette/issues/685/events>
- <https://github.com/Kludex/starlette/issues/685#event-7433573738>
- <https://github.com/Kludex/starlette/issues/685#issuecomment-1254245484>

### 已通过的独立核查

- 直接从 GitHub API 重建全部 18 个 event。E1--E8、E10--E12、E14、E16--E18 的 database id、node id、时间、actor 和 body SHA-256 均与 fixture 一致；E9/E13/E15 的 canonical `{id,node_id,event,actor,created_at,commit_id}` SHA-256 均一致。#2349 的创建时标题以 immutable initial commit `bf47454026d3794a96de40793c83a56290bd62d5` 的 `Add middleware per route` 交叉核对；#1649 初始 commit 也与创建标题一致。
- 18 个 information increments 均有新增语义：需求、顺序边界、指标需求、Route/Mount 方向、首个实现、prefix 替代、替代反驳、#1464 分支、未合并关闭、Mount 分支、错误处理约束、先前分支评审结论、Issue 关闭、scope 反驳、Issue 重开、低接触 APM 约束、workaround/框架 feature 分流、Route/WebSocketRoute 新分支。18 个计数因此支持 `long`。STR-05 的九个 event 也均有独立新增语义，故保持 long，旧 2/2/2 撤回正确。
- 所有 18 个 Task 都是严格 event 前缀；T13/T14/T15 没有直接拷贝未来 Gold/Outcome。#1649/#2349 merge 均在 Outcome Anchor，T14 以后“partial capability”只在 E14 的 scope challenge 出现后进入 Gold/Oracle。唯一 P0 是 T13 把 closed state 语义上夸大为 resolved/delivered。
- `projectModelInput` 在全部 18 个 slice 上都只产生 `id`、`role`、`event_type`、`occurred_at`、`actor`、`summary`，并单列 Current Task；遍历验证了严格前缀。source node/database id、URL、body hash，以及 Fact Gold、Oracle、Decision Reference、Outcome Anchor 的值均不在 T18 projection。tier 不匹配、segment 外 increment、未知 `audit_note`、canary hash 篡改均被拒绝。
- 复现了文档明确承认的人工边界：将 T1 改为“Assume later work supplies route-scoped hooks; explain why that still leaves zero-touch instrumentation incomplete.”会被 validator 接受，虽然它语义泄漏未来 partial-capability 结论；这已被测试作为“必须人工拒绝”的反例记录，未被错误宣称为自动检测能力。
- 重新核对 `Uniyalsumit/CT_PROJECT@c11a9ce`：#2349 仍只在 question `Tell me about router changes.` 的 retrieved context；其 `benchmark.py` ground truth 是 FastAPI PR #15745，故 `no_public_hit_found` 的 context-only 排除理由正确。尝试追加同日 GitHub code search 时，在 #685 与 #1286 两个普通下游命中后触发 GitHub search rate limit；因此本 QA 不把该有限重试误写成完整 absence proof，采用候选已有的同日扫描记录与固定 RAGAS source audit。
- `node evaluation/starlette-v1/validate-pilot.mjs`：3 cases / 4 segments / 25 events / 25 slices；`node evaluation/starlette-v1/validate-pilot.mjs --canary`：1 case / 1 segment / 18 events / 18 slices / 18 increments；两者 hash verified。`npx vitest run test/starlette-pilot.test.ts`：31/31；`npm test`：12 files / 273 tests；`npm run test:protocol`：8/8；`npm run build` 与 candidate `git diff --check` 均通过。

### 返回条件

1. 将 T13 Oracle 限定为可由 E13 证明的 tracker state（例如“issue currently closed”，或在 typed state 中标为 `DEFERRED`），不得把原始问题设为 `RESOLVED`，也不得把 Mount 写成 current delivered direction；保留 Fact Gold `F14` 的“currently closed”即可衡量后续 reopen。
2. 为该反例添加聚焦测试：E13 state event 的 `commit_id: null` 不能单独生成 “original need resolved” 或 “Mount delivered” Oracle；T14/E14 后才可出现 partial-capability 结论。
3. 更新 canary hash 后，在新的 append-only Builder fix 提交上重新进行独立 QA。通过前不更新 WO/PROJECT_STATE/ROADMAP 为 accepted，不批量 freeze，也不运行模型。

## 第二次 Re-QA（候选 `32600eb6b7caf3fbe339e1103d3293f0b7e33103`）

日期：2026-08-23

结论：**PASS — 只接受 DS-03 的 long/open canary 与 schema gate；不接受正式 freeze、D0/D1/D2、远端模型、aggregate 或效果结论。** 候选父提交为本 QA 的 `e294eb4d2a47458b21f0b5f6589a630a7ea92605`，开始时工作树 clean。

- 原样复现 T13 P0：F14 已为 `outcome_status`；T13 的 open question 为 `DEFERRED`，明确 tracker closed 但语义未证实；没有 `RESOLVED`，也没有 Mount delivered direction。Mount 仅延续 E12 的“Evaluate ... narrower capability”状态，E14 之后才出现 partial-capability scope 结论。
- `hashIssueStateEvent()` 对 E13 的固定 canonical payload（`commit_id: null`）产生保存的 SHA-256；人为填入 #1649 merge SHA 会改变 hash。新增两个聚焦测试均通过。Fact Gold/Oracle 的改动仅限这个 P0，events、tasks、manifest、Decision Reference、Outcome Anchor 和 contamination scan 相对于前一候选没有无关变化；canary hash 只更新了 Gold/Oracle 两项。
- 复跑前轮来源/增量/Task/投影审计：18 个已直接核对的一手 event 与三条 state canonical hash 保持不变，18 个真实增量仍为 long，STR-05 的 9 个仍为 long；全部 18 个投影严格等于 evidence prefix、每 turn 只有六个允许字段，source metadata/hash 与四类非输入 artifact 不出现。tier、increment、unknown field、hash mutation 均被拒绝。
- RAGAS 记录仍是 PR #2349 的 context-only retrieved chunk，固定 benchmark reference 是 FastAPI PR #15745；维持有限 `no_public_hit_found` 正确。语义同义 future leakage 仍会被字面 validator 放行，且继续在测试/文档中明确为必须人工审计的已知边界，并未被误称解决。
- `node evaluation/starlette-v1/validate-pilot.mjs`：3 cases / 4 segments / 25 events / 25 slices；`node evaluation/starlette-v1/validate-pilot.mjs --canary`：1 case / 1 segment / 18 events / 18 slices / 18 increments；两者 hash verified。focused 33/33，`npm test` 12 files / 275 tests，protocol 8/8，build 和 candidate diff check 均通过。

本次接受不改变 `pilot_not_frozen` 或 `canary_not_frozen`，也不授权自动替补案例、批量 freeze 或模型运行。若要继续，必须先以新的工单预注册其余样本的实际分层、组件权重和污染规则。
