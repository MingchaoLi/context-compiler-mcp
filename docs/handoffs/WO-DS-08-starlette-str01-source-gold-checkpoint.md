# WO-DS-08 交接 — Starlette STR-01 source/Gold checkpoint

日期：2026-08-23

状态：**IMPLEMENTED — PENDING NEW INDEPENDENT DATA QA**

## 当前交付

- 新增 `checkpoint/STR-01` 七文件，覆盖 Issue #495、closed-unmerged PR #500、merged PR #1692 的 18 个信息增量与 18 个严格时间切片；
- 机械分层为 long；当前实际已审计分布变为 1 short / 0 medium / 5 long，不为分层配额删除事件；
- 固定 18 个 GitHub source contract、3 个 canonical timeline hash、八项 candidate hash、4 个 Outcome Anchor；
- Fact Gold/Oracle 分离 broad scope cache、streaming constraint、body/form 路径、receive hang、`call_next` 窄化、明确非目标、multi-chunk review bug、修正/补测、approval/merge/close；
- 新增严格 validator 与 13 项聚焦测试，真实 evaluator v2 parser 静态解析 18 slices / 171 raw turns；
- 引用 DS-05 已接受 contamination snapshot/hash，不修改 promotion collection 或任何旧 fixture/hash。

没有修改 `src/`、MCP、依赖、evaluator/retrieval/assembler policy、provider、host、STR-06/07 或旧 pilot/canary/promotion。没有创建 Probe/answer rubric，没有运行 D0/D1/D2、远端 GPT-5.6、aggregate 或 PASS rate。

## 关键证据边界

- PR #500 `merged_at:null`；scope-cache patch 和单项 test 均未进入仓库，API `merge_commit_sha` 不是 delivered 证明；
- PR #1692 当前 body/title/commit list 是 outcome-era 可变数据。E8 创建 summary 不使用其最终内容；E10 timestamped rename 才确立 `call_next` 窄边界；
- E11/E12 明确 endpoint-first、middleware-after 和 exception-handler reread 非目标。E17 merge 与 E18 close 不扩大该边界；
- E14 review 使用 original commit `ec382274…`，指出 `more_body`/multi-chunk 反例；E15 后才允许 Gold/Oracle 记录 bug 修正和新增测试；
- E16 approval 不等于 delivery；E17 merge 才使 narrow goal `COMPLETED`；E18 只增加 tracker state；
- STR-01 与 STR-02 共享 `BaseHTTPMiddleware` 组件但任务不同，最终效果报告必须披露相关性。

## 独立 Data QA 必查

- 固定 Builder candidate、父提交与 clean worktree，确认差异只属于 DS-08 允许范围；
- 逐项重访 18 个登记 source，复核 metadata/time/body SHA、PR #500 commits/files/`merged_at:null`、PR #1692 timeline/review original commit/final files/approval/merge；
- 独立攻击 18 条是否都是真实信息增量，特别是 E4/E5、E8/E9/E10、E16/E17/E18 是否被重复计数；机械重算 tier；
- 检查 E8 current body/title/force-push 信息是否泄漏，E10/E17/E18 canonical hash 是否真实；
- 攻击 Gold/Oracle：PR #500→delivered、PR #1692→general replay、E14 前→multi-chunk 已知、approval→merge、Issue close→all resolved 均必须失败；
- 逐 task 人工攻击同义/Unicode future leakage，并确认 Gold/Oracle/Decision/Outcome/source metadata 不进入投影；
- 重建八项 hash，攻击 content/path/order/status/漏项/重复/unknown/symlink/snapshot；
- 确认 18 slices / 171 projected turns、每 turn 六字段，并通过真实 evaluator v2 parser；
- 运行 focused、full、protocol、build、diff check、受保护范围 diff 与真实 npm pack 隔离。

## Builder 自检

- `node evaluation/starlette-v1/validate-str01-checkpoint.mjs evaluation/starlette-v1`：通过；
- `npx vitest run test/starlette-str01-checkpoint.test.ts`：13/13；
- 真实 `parseEvaluationSuiteV2`：18/18 slices、171 turns 静态通过，未调用 runner/model；
- `npm test`：17 files / 333 tests；`npm run test:protocol`：8/8；`npm run build`：通过；
- `git diff --check`：通过；
- 项目内隔离 npm cache 的真实 `npm pack --dry-run --json`：50 files，shasum `f20e56e75c6b6aa9d7362627101771a6c2ca4510`，不含 evaluation/checkpoint/docs/STR-01 test；缓存已删除；
- 没有模型调用、效果指标或数据集 freeze。

实现者不批准本工单。只有新的独立 Data QA PASS 才能接受 STR-01 checkpoint/schema gate；接受后仍保持 `checkpoint_not_frozen`、`promotion_authorized:false`、`evaluation_ready:false`、`model_run_authorized:false`。下一步只能另开一次性 promotion STR-06/07/01 工单，并在该关键节点申请对抗审查。
