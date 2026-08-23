# WO-DS-02 独立 data QA

日期：2026-08-23

结论：**FAIL — 不接受 schema pilot；更不接受正式数据集或任何 D2 效果结论。**

## 固定候选与范围

- branch：`main`；开始时工作树 clean；候选 HEAD：`7424b308635489ff2d6c814a231c14d905242476`；父提交：`a46137fd85fda2fbb28a1e5886e567617da135e0`。
- 本 QA 只审计 WO-DS-02 所允许的 schema/pilot/validator、路由文档与 `src/evaluation.ts` 的 D1 合同；未运行 D0/D1/D2、远端模型或正式 freeze。
- 候选 diff 仅包含 docs、`evaluation/starlette-v1/` 与聚焦测试；没有 `src/`、package runtime、依赖、MCP、model 或 D0--D2 变更。`git diff --check HEAD^ HEAD` 通过。

## 阻塞项

### P0：STR-02A/E4 将 PR #1715 创建后的内容写回创建时 slice

`STR-02A/E4` 的 source 是 PR #1715 body，`occurred_at` 为 `2022-06-29T23:11:14Z`，但 GitHub 主来源显示该 body 的 `updated_at` 为 `2022-09-24T05:29:09Z`。当前 body 自己保留了创建时“draft / 尚未加 tests”的删除线说明，随后才写成非 draft 并列出 fixes；对应 immutable merge commit 是 `040d8c86b09f34be49e8c253d97a588973bc7308`，发生在 `2022-09-24T05:29:08Z`。

然而 E4 的输入 summary 写为“... **and records tests** for related cancellation and deadlock cases”。这不是创建时可由当前可变 body 安全证明的信息，且 merge commit 发生在 E4/T4 cutoff 之后。E4 进而作为 `STR-02A/F4` 和 `STR-02A/T4` 的 provenance。此为已复现的 future leakage，而不只是无法证明 absence 的风险。

可复现主来源：

- <https://api.github.com/repos/Kludex/starlette/pulls/1715>
- <https://github.com/Kludex/starlette/commit/040d8c86b09f34be49e8c253d97a588973bc7308>

同类审计还发现 PR body 事件 `STR-05/E2`、`STR-05/E5`、`STR-02B/E2`、`STR-02B/E5` 均有晚于 `occurred_at` 的 `source_updated_at`。并非都已证明泄露，但在没有 cutoff 时点 immutable diff/commit 或 timestamped comment 的情况下，不能将后写正文、标题或当前 diff 的信息作为早期 summary/Gold/Oracle 的依据。

### P0：validator 的“Outcome/Gold 不进输入”测试产生假阳性

独立调用 `validateCaseBundle` 时，以下篡改被 **接受**：

1. 将 `STR-08/T1.current_task` 设为未来 Gold `STR-08/F4.statement`（“Use TestClient as a context manager to activate startup and shutdown.”）；
2. 将同一 `current_task` 设为 `STR-08/O1.summary`（Outcome Anchor 的关闭/无需变更结论）；
3. 将 `STR-08/E1.source_updated_at` 设为早于 `occurred_at` 一秒。

这证明 validator 只检查当前 slice 所列 Gold 的原样文本，且只以 manifest 的 `input_files` 名称测试 Outcome 隔离；它不会扫描任何未来 Gold、Outcome Anchor 文本或不可能的 source 更新时序。故 `test/starlette-pilot.test.ts` 的“Outcome Anchor file mixed into input boundary”并未证明 Outcome 内容不能通过 `tasks.json` 混入模型输入，也未证明 Current Task 不会复述未来答案。

这直接违反工单要求的 validator 必须拒绝 future leakage、Outcome Anchor 混入输入与 Current Task 复述 Gold；同时使现有 10 项聚焦测试不能作为严格输入隔离的充分证据。

## 已通过但不足以抵消 FAIL 的核查

- GitHub 主来源逐项抽查/核对了 25 个纳入 event 的 URL、database/node id、创建时间、actor、英文 summary 与保存的 digest/merge SHA；25 个保存的 `source_content_sha256` 都与当前 API body 的 SHA-256 一致。稳定 Issue comment、review 的元数据与保守转述一致；四条 Outcome merge SHA（#1377、#1715、#1683、#2620）与 API/commit 时间一致。当前正文 digest 只能识别以后变化，不能把可变正文倒推为创建时证据；可变 Issue/PR body 是本报告 P0 的边界。
- 所有 25 个 `available_event_ids` 均是所属 segment 的严格前缀；Gold/Oracle 的现有引用均在 cutoff 前；Decision Reference/Outcome Anchor 在独立非输入文件，且实际数据没有跨 segment source ref。`STR-02A` 五节点、`STR-02B` 七节点；#2516 对 #1715 的引用只作为历史引用，现象、reproducer、被拒绝方案和 patch 边界不同，`split_required` 与两个 medium 分类合理。
- 15 条 contamination 记录均应用同一规则。`STR-02/03/11/12/15` 的 GitHub 固定提交 benchmark/agent/LLM task 直接复用可复现；STR-01 的 notebook 命中只是无关应用源码注释，STR-06 的命中是带原注释的 vendored/copied source，均未显示修复/eval task 语义，故不应列 confirmed。所有 `no_public_hit_found` 均仅表达扫描未命中，未声称绝对不存在。STR-07/08、05/06、01/04 的后续最小集由预注册污染规则和候选 tier 得出；候选中无 D2/model 输出或 aggregate 文件。
- 基线 validator 通过：3 cases / 4 segments / 25 events / 25 slices，hash verified。独立攻击对 future available event、future Gold provenance、manifest Outcome input、duplicate id、time reversal、unknown field、cross-segment fact、当前可见 Gold 原样复述均被拒绝；聚焦测试也覆盖 hash tamper。
- `npx vitest run test/starlette-pilot.test.ts`：10/10；`npm test`：12 files / 252 tests；`npm run test:protocol`：8/8；`npm run build`：均通过。

## 返回条件

1. 对每个 `source_updated_at > occurred_at` 的 Issue/PR body，删除所有不能由创建时 timestamped evidence 证明的内容；或将内容移至其真实后续 event，并以 cutoff 前 immutable commit/diff 或 timestamped comment 作为 provenance。尤其必须修正/拆分 `STR-02A/E4`，不得在 E4/T4 使用测试或 merge 后信息。
2. 收紧 validator：强制 `source_updated_at >= occurred_at`；将 event type 与 source kind 绑定；拒绝 `Current Task` 对任何（含未来）Gold statement、Outcome Anchor summary/标识及 cutoff 后 Decision Reference 的规范化原样混入；并为这些反例加入独立测试。文件名边界检查不能替代内容边界检查。
3. 更新 hash 后，在新的 append-only Builder fix commit 上重新运行 source audit、全部对抗篡改、focused test、`npm test`、protocol、build 和 diff check。QA 复验通过前，保持 `pilot_not_frozen`，不得启动六案 freeze 或模型实验。

## Re-QA（候选 `af4c3f09109edbedffad47a68a4ba11bf94a80b7`）

日期：2026-08-23

结论：**仍为 FAIL。** 候选 branch 为 `main`，父提交为首轮 QA commit `0226a754cb4d7cd24d2aa9d8599bb152b8835b13`，开始时工作树 clean；本段只追加独立 re-QA 结论，不改变工单、项目状态或路线图。

### 首轮 P0 的已修复部分

- 9 个可变 Issue/PR body event（STR-02A/E1,E4、STR-02B/E1,E2,E5、STR-05/E1,E2,E5、STR-08/E1）都重新与 GitHub API metadata/title 和 timeline 交叉核对。#1377 的创建时标题为 `Fix staticfiles follow symlinks outside directory`，之后才改为 `Allow ...`；#1298 后来的改名只修正 `trigggering` 拼写。其余七项无 title-rename timeline；PR #1715 的页面 timeline 还显示它在 `2022-07-02T06:39:38Z` 才标记 ready for review，支持 E4 创建时 draft 表述。
- E4 已删除 tests/merge 后信息；其 Gold、Oracle 和 Task 不再携带该测试细节。其余八项 summary 同样限定为创建时标题，或仅使用已有较早 event（STR-05/E5 的 first-revert 关系）。未发现删去的 PR body/diff/linked-history 细节残留在对应早期 Gold、Oracle 或 Current Task。
- 首轮三项最小 mutation 均已被拒绝：未来 Gold、Outcome summary、`source_updated_at < occurred_at`。Outcome identifier、cutoff 后 Decision Reference、event_type/source.kind mismatch，以及大小写/全角标识/标点/空白规范化变体也均被拒绝。

### 新 P0：Unicode zero-width 规范化绕过仍可把未来 Gold 放入输入

最小复现（无文件写入）：加载 `STR-08` bundle，将 `STR-08/T1.current_task` 设为未来 Gold `STR-08/F4.statement`，但把每个 ASCII space 替换成 U+200B ZERO WIDTH SPACE，然后调用 `validateCaseBundle(bundle, "STR-08")`。validator **接受**该 bundle，并输出 `ZERO_WIDTH_GOLD_ACCEPTED`。

根因是 `normalize()` 只删除 Unicode punctuation/symbol 和普通 whitespace；U+200B 是 Unicode format character，不会被移除。该文本在模型输入中仍是同一可见答案，故此绕过直接违反“Current Task 不复述 future Gold”及本轮“规范化绕过失败”的要求。相同规范化缺口也会影响 Outcome/Decision 的内容边界。

### 其余验证

- `node evaluation/starlette-v1/validate-pilot.mjs`：3 cases / 4 segments / 25 events / 25 slices，hash verified。
- `npx vitest run test/starlette-pilot.test.ts`：16/16；`npm test`：12 files / 258 tests；`npm run test:protocol`：8/8；`npm run build`、候选 `git diff --check HEAD^ HEAD` 均通过。

### 返回条件

将 `normalize()` 扩展为移除 Unicode format/control separators（至少 U+200B、WORD JOINER、bidi/control 变体），并对 future Gold、Outcome summary/identifier 与 future Decision Reference 分别加入 zero-width/Unicode 规范化反例。更新 hash 后在新的 append-only Builder fix commit 重跑本段所有攻击与回归；在独立 re-QA 通过前保持 PENDING 和 `pilot_not_frozen`。
