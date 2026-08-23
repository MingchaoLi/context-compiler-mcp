# WO-DS-06 独立 Data QA — Starlette STR-06 source/Gold checkpoint

日期：2026-08-23

结论：**FAIL（P0）— 不接受 STR-06 checkpoint/schema gate。** 机械结构、16 个切片、来源链的大部分语义边界以及本地回归检查均可复现，但三个登记 source 中有三个与 GitHub 官方 REST 不一致：PR #1366 的当前 body SHA/updated_at 错误；两个 Issue close state event 将 REST 为 null 的 commit_id 伪写为 merge SHA。这使 source ledger、两项 canonical state SHA、checkpoint hash 和后续 Gold/Oracle provenance 均不是对登记公开来源的忠实快照。

本报告不修改工单、PROJECT_STATE 或 ROADMAP；它们必须继续保持 IMPLEMENTED — PENDING NEW INDEPENDENT DATA QA / pending。也不接受 promotion、freeze、Probe、D0/D1/D2、远端模型、aggregate 或任何效果结论。

## 固定基线与范围

- 开始时分支为 main，HEAD 精确为 a03564aa29c129415e6d00bf6ce17d6389f5aed3，父提交为 4d0a14afff12a3e5a4ff1274373d4d82d3bba9af，工作树 clean。
- 完整候选差异为 17 个 DS-06 文档、checkpoint 七文件、wrapper/hash、validator 与聚焦测试；没有 src、package/lockfile、runner、provider、model、host、MCP、promotion payload、旧 pilot/canary 或旧 hash 改动。git diff --check 通过。
- 全程未运行 runEvaluationSuiteV2、D0/D1/D2、远端模型、FIPS 本地重放或任何 provider/network model 调用。仅对 GitHub 官方公开 REST 做只读 source audit。

## P0：官方 REST source metadata/body 与登记值不一致

### 可复现事实

直接读取官方 REST：

- https://api.github.com/repos/Kludex/starlette/pulls/1366
- https://api.github.com/repos/Kludex/starlette/issues/events/5784383679
- https://api.github.com/repos/Kludex/starlette/issues/events/5890858859
- https://api.github.com/repos/Kludex/starlette/issues/events/5893584617

得到以下严格不一致。

| 登记事件 | 官方 REST 值 | 候选值 | 影响 |
|---|---|---|---|
| E6, PR #1366 | updated_at 为 2021-12-17T13:02:34Z；body 为 Closes #1365 后带空格；SHA-256 为 c55947b12c1a8966322d5133ca71e127ec71b2116462b927caa247be2d7529ce | 2021-12-17T13:02:33Z；SHA 为 f5ef0a628d5bc6f73e2bfa1b4b855c6c36f3e490a70f8e02d3b1676b8e72a914 | events.json 的 source_updated_at/source_content_sha256 不忠实；后一个 SHA 实为 #1410 当前 body 的值。 |
| E7, state 5784383679 | event=closed，actor=adriangb，created_at=2021-12-17T12:37:33Z，commit_id=null；canonical subset SHA-256 为 e833bb040fa00a72c1c579e28d382d340301cbfb2d896db9560ff31448413b73 | commit_sha=0aef1724cfafbe23f846979d427a5a173667f6b7；SHA 为 699cfa012d29203c4b4eb6007f57d34bf2f4e806e909de590bd35017f42ccd62 | close state 被混入同时间 merge 的 SHA，不能再称为该 REST event 的 canonical subset。 |
| E16, state 5893584617 | event=closed，actor=Kludex，created_at=2022-01-14T09:40:19Z，commit_id=null；canonical subset SHA-256 为 db911a1b28a53c264e5fc2451f0284aa0bf14b68cec7e52ad0117eeb40a3ef5f | commit_sha=7d79ad96d5aaee71f16ac9f4e41072e81d18ab86；SHA 为 8ca129fbc4138b9fc098db0336b4e0ab56d30b5fd73663180226d87c043d7462 | 同样把 PR merge 关系写进没有 commit pointer 的 close event。 |

E13 的 reopened event 5890858859 与官方 REST 一致：commit_id=null，canonical SHA 为 2f0a0eb72975129ab3613762832ad1cbc0bc63b26eb1fe4079cf4c0aaef4e66c。

这不是仅格式问题。validator 和聚焦测试把 E7/E16 的错误 SHA 固化为所谓 canonical REST contract，因而会主动拒绝真实 REST payload、接受伪造 payload。不能以 merge 恰好发生在相同时间为由把两个不同 resource 混成一个 canonical source。

## 独立通过的来源与语义核验

- Issue #1365 的 E1 metadata、updated_at、body SHA 均匹配官方 REST。
- E2–E5、E8–E12、E15 的十条 issue comment 的 database id、node id、actor、created_at、updated_at 和 body SHA 均匹配。
- #1410 的 E14 metadata、current body SHA 和 updated_at 均匹配；#1366 的 initial commit 04a69953c9afe3e80d77507001f1bb02dc942118、#1410 的 initial commit 8d213b9e9a3d088346c88a2f6861e207fa19dd83 均匹配。故 16 条登记 source 中有 13 条完整匹配、3 条失败。
- #1366 的初始 patch 添加 starlette/_crypto.py 并改 starlette/responses.py；最终 merge 0aef1724cfafbe23f846979d427a5a173667f6b7 的 PR file list 是 starlette/_compat.py 与 starlette/responses.py，无 test 文件。#1410 初始 patch 将 capability probe 的 usedforsecurity=True 改为 False；最终 merge 7d79ad96d5aaee71f16ac9f4e41072e81d18ab86 只改 starlette/_compat.py，也无 test 文件。
- 两个 merge SHA、PR merged_at 与两个 Outcome Anchor 的 patch-merged 上界一致；但必须作为独立 PR/commit resource 保留，不能倒写入 Issue close REST event。
- 16 个保留事件均新增问题事实、设计边界、实现、tracker 状态、验证约束、真实失败、后续改动或有限验证。计数为 16，按 9+ 规则独立重算为 long；单一连续 lineage 的边界成立。
- 人工复读 16 个 Current Task：均只问当时可见诊断、约束或下一步，未复述未来 #1410、merge SHA、Gold/Outcome 内容或最终答案。Fact Gold/Oracle 亦正确区分 repository/tracker acceptance、E11 的真实失败、E15 的单环境有限成功、无 regression test、无本地 FIPS replay 与跨环境不确定性；未把 merge/close 写成 verified/resolved。

## 机制检查与已知锚定边界

- node evaluation/starlette-v1/validate-str06-checkpoint.mjs 通过：16 events、16 increments、16 slices、136 projected turns、3 state entries、2 Outcome Anchors。
- npx vitest run test/starlette-str06-checkpoint.test.ts：11/11 通过；npm test：15 files / 305 tests 通过；npm run test:protocol：8/8 通过；npm run build 与候选 git diff --check 通过。
- 使用真实 dist/evaluation.js 的 parseEvaluationSuiteV2 对由 16 个 checkpoint slice 静态构造的 suite 全部 parse 成功：16 cases / 136 projected history turns。只调用 parser；model_call_count=0、evaluation_run_count=0，不能被表述为 evaluator 运行或效果证据。
- 独立 /private/tmp npm cache 的 npm pack --dry-run --json 产出 50 files，shasum 为 f20e56e75c6b6aa9d7362627101771a6c2ca4510；不含 evaluation、checkpoint、docs 或 Starlette fixture。
- 内容、path/order、漏项、重复、unknown field、symlink、cutoff/status/authorization 与 snapshot 的单点攻击均由现有 validator/test 拒绝。
- 但同步修改 checkpoint payload 并重算同一份 str06-checkpoint-hashes.json 后，validator 仍返回 checkpoint_not_frozen。这是 pending candidate 的可修改 hash manifest 的预期边界，不是独立 source-authenticity proof。当前固定 Git candidate 与本次独立 source audit 才是 QA 锚点；若未来 promotion，必须按工单将 QA 接受提交的七文件 path/order/SHA 固化在不可由 fixture 共同改写的代码合同中。不得把本 hash 文件单独宣传为防协调重写证明。

## 返回条件

Builder 必须在新的 append-only 实现提交中完成以下最小修正，然后由新的独立 Data QA 从头复验来源：

1. 将 E6 更新为官方 #1366 当前 body digest c55947b12c1a8966322d5133ca71e127ec71b2116462b927caa247be2d7529ce 和 source_updated_at 2021-12-17T13:02:34Z，并重写受影响的 checkpoint/hash/ledger/handoff 描述。
2. 将 E7 与 E16 的 state-event source commit_sha 改为 null，使用上述官方 null-commit canonical SHA；保持两个 merge SHA 只在独立 PR/commit 和 Outcome Anchor 证据中。E13 继续保持 null 与既有正确 SHA。
3. 使 validator 的 STATE_EVENTS 和聚焦测试断言真实 REST subset；添加至少一个反例，证明将 merge SHA 填入 E7/E16 的 null REST state event 会被拒绝。保留 merge resource 的独立核验，避免 close→merge→verified/resolved 混淆。
4. 重建八项 checkpoint hash，并更新任何受影响 facts/oracle/decision/report；不得改变已接受 promotion、旧 fixture、core、runner/provider/model/host/MCP，仍必须保持 checkpoint_not_frozen、promotion_authorized:false、evaluation_ready:false、model_run_authorized:false。
5. 在新候选上重新执行官方 16-source audit、两个 patch/merge/file-list audit、increment/tier、future-leakage、Gold/Oracle 与上述 hash/协调重写边界审查，以及 focused、npm test、protocol、build、git diff --check、16-slice static parser 和隔离 npm pack。

结束时本仓库仅有本 QA docs 文件待提交；本报告提交后工作树必须恢复 clean。
