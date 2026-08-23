# WO-DS-03 交接 — STR-04 long/open canary

日期：2026-08-23

状态：**IMPLEMENTED — PENDING NEW INDEPENDENT DATA QA**

## 当前交付

- `evaluation/starlette-v1/canary/STR-04/`：七类分离文件，18 events / 18 slices / 18 information increments；
- `canary-hashes.json`：`canary_not_frozen` 字节固定；
- `validate-pilot.mjs`：long/tier/increment 机械合同、canary 校验、字段级 `projectModelInput`；
- 三个 pilot manifest：补齐 increment ids，STR-05 从 medium 更正为 long，pilot 仍未冻结；
- 聚焦测试：tier、increment、projection allowlist、非输入隔离、前缀、语义检测边界和 hash 篡改；
- 中文 canary 报告、工单/状态/路线图更新。

没有修改 `src/`、MCP、依赖、evaluator、assembler/retrieval policy 或 provider 接口；没有运行 D0/D1/D2、远端模型、aggregate 或 PASS rate。

## 首轮 QA 历史

首轮 Builder 候选 `57279d1` 因 RAGAS context-only 命中错误关闭 gate。独立 QA 提交 `cf600f3` 判定 FAIL：任务 reference 实为 FastAPI PR #15745，#2349 不是任务、Gold 或答案。修复提交 `a364da4` 接受该结论，恢复 STR-04 `no_public_hit_found` 后才制作 canary。该历史保留，不能把检索噪声重新写成 confirmed。

第二轮候选 `1d7b2d0` 又被独立 QA 退回：T13 把 `closed`/`commit_id:null` 过度解释成原需求 `RESOLVED` 和 Mount 已交付。当前修复把 T13 限定为 tracker closed、语义 `DEFERRED`，延续最后已知的评估状态；F14 改为 `outcome_status`，并增加 null-commit hash 与“不产生 resolved/delivered Oracle”反例。

## 新 QA 必查

- 固定新的 Builder candidate、父提交和 clean worktree，确认 diff 不含 core/model/provider；
- 从 Issue #685、PR #1286/#1649/#2349 的固定 GitHub 主来源重建 18 个 event 的 id、时间、actor、创建标题、comment/review body hash 和三个状态事件；
- 主动攻击 E13 关闭、E14 scope challenge、E15 重开以及 #1649/#2349 partial capability 是否被 Gold/Oracle 错写成最终解决；
- 逐项判断 18 个 `information_increment_event_ids` 是否真有新增语义；发现重复时按实际数量重分类，不得保 long；
- 审计所有 18 个 Current Task，尤其 T1、T13、T14、T18 的语义 future leakage；复现测试中 validator 会放行但人工应拒绝的同义反例；
- 验证 projection 的每个 turn 精确只有六个允许字段，且 source metadata、Gold、Oracle、Decision、Outcome、hash/merge SHA 不可见；
- 重放 tier/increment/projection/hash mutation，核对 pilot 与 canary 两套 hash 状态；
- 复核 contamination 中 RAGAS 命中仍是 context-only 噪声，以及没有新增 task/patch 级命中；
- 运行 pilot validator、canary validator、focused test、`npm test`、protocol、build 与 `git diff --check`。

## Builder 自检

- pilot validator：3 cases / 4 segments / 25 events / 25 slices，hash verified；
- canary validator：1 case / 1 segment / 18 events / 18 slices / 18 increments，hash verified；
- `npx vitest run test/starlette-pilot.test.ts`：33/33；
- `npm test`：12 files / 275 tests；
- `npm run test:protocol`：8/8；
- `npm run build`、`git diff --check`：通过。

实现者不批准本工单。新的独立 data QA PASS 前，不能批量冻结其余五案或启动模型实验。
