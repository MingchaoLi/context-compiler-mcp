# WO-DS-07 独立 Data QA — Starlette STR-07 source/Gold checkpoint

日期：2026-08-23

结论：**PASS — 只接受 STR-07 source/Gold checkpoint/schema gate。** 此接受固定 Builder source candidate `8f51bf4f9308d124ace63c5c8ca755373105c71f`，不表示 promotion/freeze、六案完成、Probe/answer rubric、D0/D1/D2、远端模型、aggregate 或任何效果结论获授权。checkpoint 仍为 `checkpoint_not_frozen`，case 仍为 `canary_not_frozen`，且 `promotion_authorized:false`、`evaluation_ready:false`、`model_run_authorized:false`。

## 固定基线、范围与执行边界

- 开始时分支为 `main`；HEAD 和 `main` 都精确为 `8f51bf4f9308d124ace63c5c8ca755373105c71f`，父提交为 `7d99be62d54a0eaa6dcaaffd52a72b789ab67489`，工作树 clean。结束时工作树亦 clean。
- 完整候选差异为 DS-07 文档、STR-07 checkpoint 七文件、wrapper/hash、validator 与聚焦测试。受保护范围 diff 对 `src/`、package/lockfile、tsconfig、promotion、旧 pilot/canary、旧 fixture/hash、provider、host、MCP 均为空；没有 core 或运行时边界改动。
- 全程没有运行 `runEvaluationSuiteV2`、D0/D1/D2、远端模型、aggregate 或 PASS rate。GitHub 官方 REST 仅作只读来源审计。

## GitHub 官方来源复验

逐项读取 Issue、PR、Issue/PR comment、PR commits/files、Issue events/timeline。10/10 登记来源的 database id、node id、actor、`created_at`、`updated_at` 与当前正文 SHA-256 均同 `events.json` / validator 的 source contract 一致：

| Event | REST resource | actor / created_at | SHA-256 |
|---|---|---|---|
| E1 | Issue #1008, `664629026` | curtiscook / 2020-07-23T16:55:59Z | `e114337b8d296fb0a16bba8f7b296a8bb277ffc7add026ae98874c2272b287d8` |
| E2 | comment `663614196` | JulienRobitaille / 2020-07-24T16:09:35Z | `ad2150900577884ff09bee465347276c5709741c4ff2cdf7fc8c60de91cc1b1c` |
| E3 | PR #1010, `456633530` | JulienRobitaille / 2020-07-25T16:11:00Z | `4608ca940e215aa4ef9e77edda7569dfaa9995b50736314ee5ffb625da83be62` |
| E4 | PR comment `664182957` | lovelydinosaur / 2020-07-27T07:55:26Z | `d0ddd7f93f544af2e6e2f70e4d850e939e1eac9b85535aad04526045625e221a` |
| E5 | comment `664573918` | tarioch / 2020-07-27T18:48:24Z | `5197f96143655c0a947a04c666ecdbfe498c3336770f9ea96ac4c04c81af852e` |
| E6 | comment `664875431` | lovelydinosaur / 2020-07-28T08:46:28Z | `f6292e5371f3501bf236beb345629a66e58b370c9d6a39f4b62c5fdbd0212f05` |
| E7 | comment `664972962` | curtiscook / 2020-07-28T10:55:54Z | `f859bc3bda00bf79338bef6889be6f93f2debe2c43bf8485434761a10926ca6b` |
| E8 | comment `664992297` | lovelydinosaur / 2020-07-28T11:44:32Z | `d26bb48af5327eda9df73f07db03300289eb1b5707db6b700026977fa129d850` |
| E9 | comment `665152933` | tarioch / 2020-07-28T16:50:20Z | `7fc55a94acb526de28ed823b5aaf6145532873dd932ca9b2e56a0414f2149b9c` |
| E10 | comment `666997766` | curtiscook / 2020-07-31T08:16:35Z | `4dfc2fa12b33aa06c62dbd0177aac276285476977d5a5aea3a36639cd4589e89` |

Issue #1008 的当前 `updated_at=2020-09-30T03:52:35Z`、PR #1010 的当前 `updated_at=2020-10-27T14:43:28Z` 与登记值匹配；两者的正文摘要均没有把可变的当前正文反写为早期事实。E1 仅保留原始 404/两种 slash 表现，E3 的 special-case/test 结论可由 PR title、唯一 initial commit 和 patch/file list 证明。

PR #1010 的 database/node id 为 `456633530` / `MDExOlB1bGxSZXF1ZXN0NDU2NjMzNTMw`；唯一 initial commit 是 `503e95931b3be47fb606069698cc1d6558c91f33`，其文件清单恰为 `starlette/routing.py` 与 `tests/test_routing.py`。REST 返回 `closed_at=2020-07-27T07:55:29Z`、`merged_at:null`、`merge_commit_sha=a331feb95e7c90dcf6d9c8adfcee1617c31a6426`。因此 E3 的 patch/test 只属于被提出的未合并替代方案；候选没有把 API 的 `merge_commit_sha` 误作 merged/delivered 证据。

Issue 的 REST `closed_at=2020-07-28T08:46:28Z` 与 E6 同秒。普通 events 和 enhanced timeline 都没有返回 `closed` canonical event（可见的只有 comment、mention、subscription 与 cross-reference；close 没有可登记 id/node）。O2 因而诚实地使用 `database_id:null` / `node_id:null` 的 tracker-close Outcome Anchor，明确不能证明全部 use case 解决或有 merged patch/test；它没有伪造 state-event resource，也没有为同一时刻的 E6 重复增加一个 input increment。

## 增量、时间、Gold/Oracle 对抗审查

- 10 个保留事件均是真实新增信息，故按 `9+` 机械重算为 **long**，不继承 survey 的 short 预期。特别是 E4 否决 patch/API 方向、E5 扩展到 `/.*` SPA、E6 给出 URI-template 边界与 path converter、E7 说明 CORS/redirect 限制、E8 把 revert/release/docs 变为未决、E9 仅验证 wildcard workaround、E10 给出 root 的 explicit dual-route workaround；这些不是可安全合并的同义复述。
- 排除项复读通过。E4 前后的 relationship/civility/repeated workaround 没有新判断；TestClient 分支从误读到无法稳定复现，未形成 durable routing decision；701141122 只确认既有 dual-route 建议有用；717292974 是更晚的第三方 regex monkey patch，回到已拒绝的实现面。没有漏掉必须保留的 comment。关闭状态留作 Outcome 而不膨胀 tier 是正确的。
- T1…T10 都是严格 E1…Ei 前缀。人工逐 slice 攻击 URI templating/general-regex、path converter、CORS、revert、dual-route、closed-unmerged 及未合并 test 的同义泄漏，未发现未来答案进入 Current Task。T9 仍只问 root need/所需属性；T10 才在 E10 后询问完整当前状态。
- Fact Gold 的 first-known provenance 与 supersession 均在可见前缀内。Oracle 没有把 PR close 变成 merged/delivered、没有把 Issue close 变成 all-resolved；E9 只提高 wildcard path-converter 状态，E10 才以 I9 `RESOLVED_BY` 解决 operational root-path，revert/release/docs 的 I8 仍为 `DEFERRED`。两项 Outcome Anchor 也明确无 repository-delivered regression test。

## Hash、投影与本地检查

- validator 重建并核对 8 项 SHA-256、固定 path/order、状态、cutoff、snapshot、10 event/10 slice/55 turn 合同；14 项聚焦反例覆盖少计 tier、payload/hash path/order、漏项、重复、unknown field、symlink、snapshot、authorization、closed-unmerged、Issue-close shortcut 及 future Gold/Outcome/workaround。
- 单点篡改会被拒绝。同步改 checkpoint payload 并重算同一份 pending hash manifest 理论上仍可自洽，这是 checkpoint 阶段已披露的协调重写边界，而非 source-authenticity proof；本次固定 Git candidate 与上述 REST re-audit 才是接受锚点。未来 promotion 必须把本 QA 接受提交的七文件 path/order/SHA 固定到不可由 fixture 共同改写的代码合同，不能把本 hash manifest 宣传成该防护。
- `node evaluation/starlette-v1/validate-str07-checkpoint.mjs`：10 events / 10 increments / 10 slices / 55 projected turns / 8 hashes，通过。
- `npx vitest run test/starlette-str07-checkpoint.test.ts`：14/14；`npm test`：16 files / 320 tests；`npm run test:protocol`：8/8；`npm run build` 与完整 candidate `git diff --check` 均通过。
- 聚焦测试通过真实 `dist/evaluation.js` 的 `parseEvaluationSuiteV2` 静态解析全部 10 slice/55 history turns。它只构造并 parse suite，没有 runner 或模型调用。
- 使用隔离 npm cache 的真实 `npm pack --dry-run --json --ignore-scripts` 产生 50 个发布文件、shasum `f20e56e75c6b6aa9d7362627101771a6c2ca4510`；不含 evaluation/checkpoint/docs/STR-07 test。

下一步只能由新的有界工单制作 STR-01 source/Gold checkpoint；之后才可考虑一次性 promotion STR-06/07/01。不得将本接受扩展为 freeze、collection 变更、evaluation-ready 或模型运行许可。
