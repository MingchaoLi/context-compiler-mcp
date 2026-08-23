# WO-DS-05 独立 Data QA — Starlette 三案 promotion audit

日期：2026-08-23

结论：**FAIL（P1）— 不接受三案 promotion audit。** 本结论不否定候选当前 21 个副本、31 个来源或 DS-02/03/04 的既有语义 QA；也不授权 freeze、STR-06、Probe、D0/D1/D2、远端模型、aggregate 或效果结论。

## 固定候选与范围

- 分支为 `main`；开始时工作树 clean；Builder candidate 为 `2dd87a6d761dc252c4dc142bab092d086806d521`，父/审计基线为 `4c6e740cddc794e90a310f4c3ee60e739e339fe7`，候选 HEAD 与指定值一致。
- 完整 `4c6e740..2dd87a6` 差异为 36 个允许的 docs、`evaluation/starlette-v1/` promotion fixture/validator/loader 和聚焦测试文件；`git diff --check` 通过。没有 `src/`、MCP、依赖/lockfile、provider、模型、host/UI、旧 pilot/canary fixture/hash 或旧 `contamination-scan.json` 修改。对保护路径的 `git diff --exit-code` 通过。
- 以下所有变异和回归均在 `/private/tmp` 的候选临时副本中运行；候选实现未被写入。结束前本仓库工作树保持 clean。

## 当前候选中已独立复现的事实

- `STR-08/05/04` 的 7×3 文件均是普通文件、没有 symlink。逐对 `cmp` 与独立 SHA-256 重算得到 **21/21 byte-identical**；`promotion-diff.json` 的 case、文件、old/new 路径、hash 和 `byte_identical_relocation` 顺序均与文件系统重建值一致。
- `promotion-hashes.json` 的 25 项（collection、snapshot、source re-audit、diff、21 文件）按文件系统独立重建一致；collection 保持六案注册顺序、三案/剩余子集、共同 cutoff `2026-08-23T03:00:00Z`、`promotion_candidate_not_frozen`、`evaluation_ready:false` 与 `model_run_authorized:false`。
- 已分别运行 pilot、canary 和 promotion validator；promotion 正常路径报告 6 registered / 3 promoted / 21 relocation files / 31 source re-audits / 31 slices，且没有 confirmed contamination。真实接线通过直接静态导入的 `parseEvaluationSuiteV2`（未调用 `runEvaluationSuiteV2`），保持恰好 **31 slices / 226 projected history turns**；lookalike parser 注入被拒绝。
- 重新只读访问 GitHub REST 的 31 个登记对象：database id、node id、actor、发生时间和正文 SHA-256（3 个 state 使用 `{id,node_id,event,actor,created_at,commit_id}` canonical SHA）均为 **31/31** 匹配。三个 review（STR-05/E8、STR-04/E6、STR-04/E12）用 `submitted_at` 复核，未将不存在的 `updated_at` 当字段。8 个可变 Issue/PR body 的当前 `updated_at` 与 fixture 一致；其 summary 均保持创建标题/明确 limitation，当前 body digest 只作后续变化探测，不能作为创建时正文快照。31 个 `occurred_at` 均不晚于共同 cutoff。
- 污染 snapshot 的六案 source number、固定规则、cutoff 与独立 `scan_observed_at` 均与 preregistration 一致。未认证 GitHub code-search API 实测返回 401 `Requires authentication`，因此不能将有限 exact-path/web-index 检索写成 absence proof。固定 `Uniyalsumit/CT_PROJECT@c11a9ce` 的 `benchmark.py` 第 45 项实际 reference 为 FastAPI PR #15745；RAGAS CSV 的 #2349 只在 retrieved context，故 STR-04 仍只能按既有规则分类为 `context_only_retrieval_noise`，不能冒充 task/Gold/answer reuse。
- 临时实体依赖副本中，`test/starlette-promotion.test.ts` 10/10、`npm test` 14 files / 293 tests、`npm run test:protocol` 8/8、`npm run build` 均通过。任务专用 `/private/tmp/context-compiler-ds05-npm-cache` 的真实 `npm pack --dry-run --json` 产生 50 项发布文件，未包含 `evaluation/`、Starlette fixture/promotion 或 validation/wiring scripts；既有九工具 production boundary 未扩大。

## P1：协调重写可同时改过 source、diff 与所有 hash 后被 validator 接受

工单要求 promotion hash 拒绝内容、路径、顺序、状态、hash、漏项、重复项及协调重写。普通攻击确实被拒绝：集合 case/order/cutoff/status、diff path/order/change class/漏项/重复/未知字段、hash 篡改、snapshot 无证据的 `confirmed`、source-reaudit 未知字段与 symlink 均得到 `PromotionValidationError`。

但以下最小协调攻击在临时副本中被 **接受**：

1. 同时修改 `pilot/STR-08/tasks.json` 与 `promotion/cases/STR-08/tasks.json`，在 T1 Current Task 追加不含未来 Gold/Outcome 的普通要求，保持两个文件字节相同且 case schema 有效；
2. 重建 `pilot-hashes.json` 的 source hash；更新 promotion diff 中该文件的 old/new SHA-256；更新 collection 对 promotion diff 的 SHA；再重建 25 项 `promotion-hashes.json`；
3. 调用未修改的 `validatePromotion(tempRoot)`。

实际结果是成功返回 `promotion_candidate_not_frozen`、`hashes_verified:true`。原因是 `validatePilot()`、`validateCanary()` 与 `validatePromotion()` 都只把可修改数据同可修改 hash 清单互相比较；collection 虽记录 `accepted_candidate_commit`，validator 没有将 21 个 accepted source SHA-256 固定为不可由该次重写一并替换的预期值。`source-reaudit.json` 也只列 event id 和自称的计数，不能为 source payload 提供独立锚定。

这不是“正常 hash 篡改未覆盖”的理论问题：上述实测协调变异已经改变已接受 source 与 promotion payload，却仍让 promotion validator 报告 byte-identical relocation 和 verified hashes。独立 QA 的固定 Git range 可以识别本候选没有发生此事，但不能替代工单要求的可机械 promotion gate；将来若同类重写发生，validator 会给出错误的成功信号。

## 返回条件

1. 在 validator 的不可由被验证 fixture 自举重写的固定合同中锚定全部 21 个 accepted-source 的路径、顺序与 SHA-256（并明确 DS-02/03 已接受 commit/路径），再要求 promotion old/new hash 同该固定合同匹配；不能只新增另一份可改 JSON hash 清单。
2. 新增临时副本反例：同时修改 accepted source 与 promotion copy，并同步更新 pilot/canary hash、promotion diff、collection reference 和 promotion-hashes 后，`validatePromotion` 必须拒绝。保留现有单点 path/order/status/cutoff/case/change-class/hash/漏项/重复/unknown/symlink 反例。
3. 在新的 append-only Builder fix commit 上重跑本报告的 source re-audit、污染规则限制复核、21 对字节/25 hash 重建、真实 parser wiring、production pack、focused/full/protocol/build/diff checks，再进行新的独立 Data QA。

在此之前，WO、PROJECT_STATE 与 ROADMAP 必须保持 PENDING；collection 也不得以 validator PASS 宣称可 promotion/freeze 或 evaluation ready。

## Re-QA（候选 `fb85572031711bc8337121fb307b5ffae81086f3`）

日期：2026-08-23

结论：**PASS — 接受 WO-DS-05 的三案 promotion audit。** 本次只关闭首轮 P1 的协调重写缺口；接受不表示完整六案 freeze、`evaluation_ready`、`model_run_authorized`、Probe/answer protocol、STR-06、D0/D1/D2、远端模型、aggregate 或任何效果解释获授权。下一步仅允许另开 WO-DS-06 的 STR-06 source/Gold checkpoint。

### 固定候选与 P1 复验

- 开始时 `main` HEAD 正是 `fb85572031711bc8337121fb307b5ffae81086f3`，父提交为首轮 QA docs-only commit `c9df2623d9e0052859480d31db66a3f74e944a14`，工作树 clean。完整 `4c6e740..fb85572` 差异仍无 `src/`、MCP、依赖/lockfile、provider、模型、host/UI、旧 pilot/canary/promotion payload、旧 hash 或旧 contamination snapshot 改动；fix 相对首轮候选只改 validator、聚焦测试和等待 re-QA 的 docs。
- `validate-promotion.mjs` 代码内固定 accepted candidate `32600eb6b7caf3fbe339e1103d3293f0b7e33103` 及 **21** 项 `{case_id,path,sha256}` 合同。独立逐项将合同同该 Git commit 的旧文件、当前 accepted 文件和 promotion 副本比较：路径顺序为 STR-08/05/04 各七文件，21/21 SHA 均匹配，所有文件均为普通文件。
- 首轮完整攻击已原样重放，并分别覆盖 STR-08、STR-05、STR-04：同步改 accepted task 与 promotion copy、重建相应 pilot/canary hash、promotion diff 的 old/new SHA、collection diff 引用及 25 项 promotion hash。三案均在固定 source 合同处拒绝，不能再借由 JSON hash 自举重写。path/order/status/cutoff/case id/change class/hash/漏项/重复/unknown/symlink 反例也均被拒绝；正常路径仍通过。

### 其余复验

- 独立重建仍得到 21 对 byte-identical relocation 与 25 项 promotion hash；pilot、canary、promotion validator 均通过，collection 仍为 `promotion_candidate_not_frozen`，且 `evaluation_ready:false`、`model_run_authorized:false`。真实静态导入 `parseEvaluationSuiteV2` 的 promotion wiring 仍为 31 slices / 226 projected history turns，未发现 `runEvaluationSuiteV2`、provider、network、credential 或 host/UI 调用。
- 三案 source fixture、source re-audit、污染 snapshot、RAGAS exclusion 与 cutoff 相对首轮 candidate `2dd87a6` 均逐字节未变。因此首轮同日 GitHub REST 31/31 id/node/actor/time/content SHA、3 review `submitted_at`、3 state canonical hash 和 8 个 mutable body `updated_at` 的直接核验仍适用于此 fix；31 个 payload event 仍不晚于 cutoff。本轮再次请求 GitHub REST 时服务返回 403 rate limit，故没有把该失败重述为新的 absence/source proof；`no_public_hit_found` 继续只是不完整 as-of snapshot，STR-04 的固定 RAGAS hit 仍为 context-only noise（benchmark reference 为 FastAPI PR #15745）。
- 临时实体依赖副本中：promotion focused 11/11；`npm test` 14 files / 294 tests；`npm run test:protocol` 8/8；`npm run build`；完整 range `git diff --check` 均通过。任务专用 `/private/tmp/context-compiler-ds05-reqa-npm-cache` 的真实 `npm pack --dry-run --json` 为 50 文件，未包含 evaluation/Starlette/promotion/validator/wiring 数据或脚本，既有九工具生产边界不变。
