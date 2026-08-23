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
