# WO-DS-06 交接 — Starlette STR-06 source/Gold checkpoint

日期：2026-08-23

状态：**IMPLEMENTED — PENDING NEW INDEPENDENT DATA QA**

## 当前交付

- 新增 `checkpoint/STR-06` 七文件，覆盖 Issue #1365、PR #1366/#1410 的 16 个真实 information increment 与 16 个严格时间切片；
- 机械分层为 long，明确纠正 survey 的 projected medium，不为维持分层配额删除有效事件；
- Fact Gold 与人工 Oracle-State 分离 tracker/repository acceptance、实际 FIPS evidence、仓库测试缺口和跨环境未验证；
- 两个 Outcome Anchor 只登记 merge patch，并明确没有 repository regression test、Builder/QA FIPS replay 或全环境证明；
- 新增 `str06-checkpoint.json`、八项 hash、严格 validator 与 12 项聚焦测试；
- 引用 DS-05 已接受 contamination snapshot/hash，不修改 promotion collection 或任何旧 fixture/hash；
- 新增中文 checkpoint 报告并更新目录说明、工单、项目状态和路线图。

没有修改 `src/`、MCP、依赖、evaluator/retrieval/assembler policy、provider、host、DS-05 promotion payload 或旧 pilot/canary。没有制作 STR-01/07，没有创建 Probe/答案评分，没有运行 D0/D1/D2、远端 GPT-5.6、aggregate 或 PASS rate。

## 关键证据边界

- 第一次 PR 的最终 wrapper 虽在实际 MD5 调用传 `usedforsecurity=False`，但 capability probe 传 True；真实 FIPS 测试在 E11 证明 probe 自身失败。这推翻首次 tracker close，不能被 survey 的短摘要覆盖；
- PR #1366/#1410 的 file list 均没有 test file；merge/close 只表示 repository/tracker acceptance；
- E15 只确认一个改过 probe 的 commit 在一个 FIPS 系统工作，并明确没有验证 current master；
- Builder 没有本地构造 FIPS 环境，不能把普通测试、merge 或 reporter 单点结果表述为跨环境成功；
- 当前 hash 只是待 QA candidate 的防漂移记录。后续 promotion 必须在代码内固定 QA 接受提交的七文件 path/order/SHA。

## 独立 Data QA 必查

- 固定 Builder candidate、父提交 `4d0a14afff12a3e5a4ff1274373d4d82d3bba9af` 与 clean worktree，确认差异仅属于 DS-06 允许范围；
- 逐项重新访问 16 个登记 source，核对 database/node id、actor、occurred/source-updated time、正文 SHA；三个 state 必须重建含 commit id 的 canonical SHA；
- 直接审计 PR #1366 与 #1410 的 initial/final patch、commit/merge SHA 和 file list，确认没有 repository test，并确认 summary 没有把后续 patch 反写到较早 slice；
- 攻击 16 个 increment：寻找重复或非增量 event；若保留数改变，按 3–4/5–8/9+ 机械重算 tier，不得以 survey 或期望分布定层；
- 对每个 task 检查严格历史前缀和语义 future leakage，特别尝试复述未来失败、reopen、第二 PR、有限成功、merge SHA、Gold/Outcome 标识及同义改写；
- 攻击 Gold/Oracle：尝试 merge→verified、close→resolved、E15→current-master/all-environment success、伪造 repository regression test；必须拒绝或形成 P0/P1 finding；
- 独立重建八项 hash，攻击内容、path/order/status/漏项/重复/unknown/symlink；确认 snapshot path/hash 与 DS-05 accepted 文件匹配；
- 确认 16 个 slice 共 136 projected turns、每 turn 六字段，四类非输入 artifact 不进入 projection；
- 静态确认没有修改/调用 promotion collection、runner、D0/D1/D2、provider、network、credential、host/UI 或模型；
- 运行聚焦、全量、protocol、build、真实 production pack 与 `git diff --check`，确认 evaluation/checkpoint 文件不进入 npm tarball。

## 首轮 QA 返回与 Builder 修复

首轮独立 QA 在 `a03564aa29c129415e6d00bf6ce17d6389f5aed3` 发现来源 P0：PR #1366 的当前 body digest/`updated_at` 不准确，E7/E16 也把独立 merge SHA 错写进官方 REST 为 `null` 的 issue-state `commit_id`。后续 Builder 修复已按 REST 更正 E6，并把三个 state 的 `commit_id` 全部固定为 `null`；两个 merge SHA 只留在独立 merge/Outcome 证据。聚焦测试新增向 E7/E16 注入 merge SHA 必须拒绝的反例。re-QA 不得继承首轮来源结论，必须原样复验返回条件。

## Builder 自检

- `node evaluation/starlette-v1/validate-str06-checkpoint.mjs`：通过；
- `npx vitest run test/starlette-str06-checkpoint.test.ts`：12/12；
- `npm test`：15 files / 306 tests；
- `npm run test:protocol`：8/8；
- `npm run build`、`git diff --check`：通过；
- 独立 `/private/tmp` npm cache 的真实 `npm pack --dry-run --json`：50 files、shasum `f20e56e75c6b6aa9d7362627101771a6c2ca4510`，没有 evaluation、checkpoint、docs 或 Starlette test 文件进入 tarball；
- 没有模型调用、效果指标或 FIPS 本地重放。

实现者不批准本工单。只有新的独立 Data QA PASS 才能接受 STR-06 checkpoint；接受后仍保持 `checkpoint_not_frozen`、`promotion_authorized:false`、`evaluation_ready:false`、`model_run_authorized:false`。
