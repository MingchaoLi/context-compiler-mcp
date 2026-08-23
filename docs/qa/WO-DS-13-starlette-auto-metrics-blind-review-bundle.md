# WO-DS-13 独立 Data / Result QA：自动指标与人工盲评包

日期：2026-08-23

结论：**PASS — 仅接受自动 diagnostic artifact 与空白 condition-blind review bundle。** 这不是 36 条回答的语义评分、不是人工 Correctness Gate 通过，也不构成 D2 优于 D1、Context Reduction 或 Operational Stability 的结论。

## 固定边界、范围与不可变输入

- 开始时分支为 `main`，`HEAD=259b19246bc46a93c4b10dcaa09360a86b7937fb`、`HEAD^=a0889f0597aed9053dcc9b84026644ed94e2ed0f` 均精确匹配，工作树 clean。完整实现链基线 `c3b47065cdc8583feafd5d1716b3ce53aa2de75c`、官方 artifact source `f721fd1159e6802d29132939c8114377f3faefa4`、opt-in runner safety `a0889f0597aed9053dcc9b84026644ed94e2ed0f` 都是当前候选的祖先。
- 本候选相对父提交仅改 5 个 DS-13 handoff/WO、结果 README/validator 与 focused test 文件（815 additions、1 deletion）。完整链上 `f721..a088` 只收紧 generator 的 opt-in skip；官方 artifact 本身没有变化。没有 `src/`、core、retrieval、assembler、evaluator policy、frozen canonical/protocol、raw capture、model/provider/host/MCP/PACE 或 package/runtime 改动。
- 我以 Node `execFile("git", args, { shell:false })` 直接读取固定 Git objects，重算并比较当前字节：`f721` 的 17 个 official artifact、`a088` 的 runner、`18a` 的 raw capture，以及 DS-11 `8b6512098072a1c4af661a82a45bde2ee1ae7876` 的 answer input、packet manifest、protocol，共 22 个路径。全部 regular file、非 symlink，Git object 与 current bytes 相同；相应 parent 链也精确成立。

## 自动结果与运行次数

- 当前原件 `validate-results.mjs` PASS：固定 source 为 `f721`、12 evaluator cases、8 lexical Probe/3 slices、36 answers/36 review items、`evaluation_run_count:1`、`model_call_count:0`、`semantic_score_count:0`。
- `CONTEXT_COMPILER_DS13_OFFICIAL_OUTPUT` 未设置。我没有运行 official generator，也没有设置该变量。`a088` 中 generator 的唯一 `runEvaluationSuiteV2` 调用受该 opt-in 环境变量保护，完整回归中对应测试被 skip，故没有产生第二次 official evaluator run。
- 在 `/private/tmp` 的隔离、非 canonical replay 中，我直接从 frozen suite 调用 evaluator 一次，只比较排除 latency 的确定性投影；其 token、Probe、delta/ratio 与 official report 全等。它未写入仓库、未覆盖结果，也不被称为第二份 official result。官方“恰好一次”是由已锚定 artifact/run record 与固定 source code 给出的 candidate-bounded 证据，不应扩大为独立远端执行平台审计证明。
- 独立重算为 D0/D1/D2 tokens `7767/2911/4578`；D2 相对 D1 为 `+1667`、`1.572655`；D0/D2 的 8 exact Probe 均为 `8/8`，D1 为 `0/8`。resolved context 是 `not_evaluable`，overall `passed:false` 也不是语义或效果决策；latency 仅为一次本机 observation。

## 盲评边界与机械一一对应

我没有阅读、评价或填充 36 条回答的语义。独立从 fixed raw、packet、protocol 与 frozen suite 重建 anonymous order、item、internal key 和 rubric provenance，结果为：36 个 unique review item 精确对应 36 条 accepted raw answer；42 required、16 forbidden、38 critical 均一一映射。两份 reviewer form 与 adjudication template 的所有 judgment/reason/comment 均为空。

`public-review/` 与 `internal-audit/` 在路径和 hash 清单上物理分开；公开 item 不含 condition、packet、canonical case/slice/rubric/fact/provenance、token 或 context-format 标识。A 仅可导出 `shared/ + reviewer-a/`、B 仅可导出 `shared/ + reviewer-b/`，adjudicator 仅在两份结果返回前持有空白模板。此 QA 验证仓库内导出源、匿名 id/order 和 threat model；真实交付/access control 仍必须由后续两名人类 reviewer 的外部流程满足，不能由仓库布局替代。

## 对抗复验

我在隔离副本实际攻击 answer、canonical rubric、condition mapping、swap、duplicate、omission、order、review-id、future field、unknown field、Unicode Cf（零宽）与 Cc（BEL）；所有 regular-file 改写均在正常 current JSON parse 前，被固定 `f721` Git blob byte contract 拒绝。public review-item symlink 也被 regular-file guard 拒绝。

重点 P1 协调攻击同时改写 answer、public item hash、public hash manifest、artifact hash manifest 与 validator 常量/代码。动态载入攻击副本后，首先报 `accepted_git_source.artifact-hashes.json.sha256: fixed value changed`；因而不能以 hash/validator 自举吸收官方结果。validator 的 source/parent/path/hash、unknown-key、symlink 与 Unicode 边界也 fail-closed。它只在通过信任锚后才解析当前 JSON，不存在替代 parser、runner、model、provider、network 或语义评分路径。

## 复归检查

- `node evaluation/starlette-v1/results/feasibility-01/validate-results.mjs`：PASS。
- `npx vitest run test/starlette-feasibility-results.test.ts`：7/7 PASS；独立 focused replay/映射/攻击测试均在临时文件中执行后删除。
- `npm test`：22 files / 383 tests PASS，1 个受 opt-in 保护的 official generator test skipped；`npm run test:protocol`：8/8 PASS；`npm run build`：PASS；`git diff --check`：PASS。
- 隔离 cache 的 `npm pack --dry-run --json --ignore-scripts`：50 files，SHA-1 `f20e56e75c6b6aa9d7362627101771a6c2ca4510`；包内无 `evaluation/`、`docs/`、`test/`。

## 判定与返回边界

- P0：无。
- P1：无。
- P2：无。

接受范围严格限于固定 candidate 的 automatic diagnostic 与空白 blind bundle 完整性。三项 Gate 仍分别为 `semantic_correctness_gate:pending_human_review`、`context_reduction_interpretation:pending_correctness_gate`、`operational_stability_gate:not_evaluated_by_this_work_order`。下一外部 blocker 是两名真实、彼此 condition-blind 的人类 reviewer 独立完成表单；在此之前不得解盲、评分、把 lexical 8/8 当作 12-slice semantic correctness，或声明 D2 优于 D1。0 medium、单次 capture、人工 Oracle-State upper bound 与受限公开索引继续限制任何稳健性、一般化或 provider comparison 解释。
