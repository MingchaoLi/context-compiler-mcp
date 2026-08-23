# WO-DS-07 交接 — Starlette STR-07 source/Gold checkpoint

日期：2026-08-23

状态：**IMPLEMENTED — PENDING NEW INDEPENDENT DATA QA**

## 当前交付

- 新增 `checkpoint/STR-07` 七文件，覆盖 Issue #1008、PR #1010 的 10 个信息增量与 10 个严格时间切片；
- 机械分层为 long，纠正 survey 的预计 short，不为分层配额删除事件；
- 固定 10 个 GitHub source metadata/body SHA 合同、八项 candidate hash、2 个 Outcome Anchor；
- Fact Gold/Oracle 分离 unsupported regex API、未合并 patch、redirect/CORS 约束、两类 workaround 与未决 release/docs；
- 新增严格 validator 与 14 项聚焦测试，真实 evaluator v2 parser 静态解析 10 slices / 55 raw turns；
- 引用 DS-05 已接受 contamination snapshot/hash，不修改 promotion collection 或任何旧 fixture/hash。

没有修改 `src/`、MCP、依赖、evaluator/retrieval/assembler policy、provider、host、STR-06 或旧 pilot/canary/promotion。没有制作 STR-01，没有创建 Probe/answer rubric，没有运行 D0/D1/D2、远端 GPT-5.6、aggregate 或 PASS rate。

## 关键证据边界

- PR #1010 `merged_at:null`；其 routing patch 与 test 只存在于未合并 PR，API `merge_commit_sha` 不是 merged/delivered 证明；
- Issue close 与 E6 设计说明同秒，只作为 Outcome Anchor，不重复计为 input increment，也不等于所有用例语义解决；
- E9 只验证 wildcard SPA 的 path-converter workaround；E10 才给出 root slash/no-slash 的 dual-route workaround；
- 最终 Oracle 可基于 E10 解决 operational root-path 问题，但 release/version/docs 保持 `DEFERRED`；
- 当前真实已审计分布为 1 short / 0 medium / 4 long。此限制必须披露，不能倒逼改 tier。

## 独立 Data QA 必查

- 固定 Builder candidate、父提交 `7d99be6` 与 clean worktree，确认差异只属于 DS-07 允许范围；
- 逐项重访 10 个登记 source，复核 metadata/time/body SHA；独立检查 PR #1010 initial commit、file list、closed_at、`merged_at:null`；
- 攻击 E4/E5/E8/E9/E10 是否真是独立增量，机械重算 tier，不得继承 Builder 的 long；
- 检查排除的 TestClient 分支、post-scope workaround 与 issue close 是否被不当删减或重复计数；
- 逐 task 人工攻击 future leakage，特别是 URI templating、path converter、CORS、revert、dual route 与 closed-unmerged 的同义复述；
- 攻击 Gold/Oracle：PR close→merged/delivered、Issue close→all resolved、E9→root use case resolved、E10→release/docs resolved 均必须失败；
- 重建八项 hash，攻击 content/path/order/status/漏项/重复/unknown/symlink/snapshot 与协调重写边界；
- 确认 10 slices / 55 projected turns、每 turn 六字段，非输入 artifact 不进入真实 evaluator v2 parser；
- 运行 focused、full、protocol、build、diff check、受保护范围 diff 与真实 npm pack 隔离。

## Builder 自检

- `node evaluation/starlette-v1/validate-str07-checkpoint.mjs`：通过；
- `npx vitest run test/starlette-str07-checkpoint.test.ts`：14/14；
- 真实 `parseEvaluationSuiteV2`：10/10 slices、55 turns 静态通过，未调用 runner/model；
- `npm test`：16 files / 320 tests；`npm run test:protocol`：8/8；`npm run build`：通过；
- `git diff --check` 与受保护范围 diff：通过；
- 独立 `/private/tmp` npm cache 的真实 `npm pack --dry-run --json`：50 files，shasum `f20e56e75c6b6aa9d7362627101771a6c2ca4510`，不含 evaluation/checkpoint/docs/STR-07 test；
- 没有模型调用、效果指标或数据集 freeze。

实现者不批准本工单。只有新的独立 Data QA PASS 才能接受 STR-07 checkpoint/schema gate；接受后仍保持 `checkpoint_not_frozen`、`promotion_authorized:false`、`evaluation_ready:false`、`model_run_authorized:false`。
