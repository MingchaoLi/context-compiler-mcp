# WO-DS-04 交接 — Starlette 无模型接线冒烟

日期：2026-08-23

状态：**IMPLEMENTED — PENDING NEW INDEPENDENT QA**

## 当前交付

- `collection-plan.json`：固定 STR-07/08/05/06/01/04，预计 tier 不作配额，禁止按结果换案；
- `wiring-smoke.mjs`：校验 pilot/canary hash 后，把 STR-08/05/04 的每个 slice 确定性转换为 evaluator v2 输入；
- `starlette-wiring-smoke.test.ts`：覆盖 31 slices、226 projected turns、parser v2、前缀/Oracle/索引反例和无效果摘要；
- 中文接线报告、工单/状态/路线图更新。

没有修改 `src/`、MCP、依赖、evaluator policy、assembler/retrieval 或 provider 接口；没有修改 STR-04/05/08 fixture、pilot/canary hash 或 contamination 记录；没有调用 `runEvaluationSuiteV2`、远端模型、aggregate 或 PASS rate。

## 独立 QA 必查

- 固定 Builder candidate、父提交和 clean worktree，确认差异只涉及 DS-04 允许文件；
- 逐字节确认既有 STR-04/05/08 fixture、`pilot-hashes.json` 与 `canary-hashes.json` 未变；
- 主动篡改六案 id/顺序、smoke 子集、freeze 状态、换案规则和 tier-quota 规则，确认全部拒绝；
- 核对 STR-08/05/04 恰好映射 4/9/18 个 slice，顺序固定且无漏项、重复或跨 segment；
- 对早期和末期 slice 重建 exact event prefix、连续 seq、UTC 毫秒时间、token 估计、stable source id 与 Current Task；
- 检查每个 raw content 恰好来自六字段 projection，非输入 artifact 不进入 raw/current input；
- 攻击 Oracle `source_refs`、关系 id、session 和未来 event，确认 `parseEvaluationSuiteV2` 在执行前拒绝；
- 静态确认接线工具没有导入或调用 `runEvaluationSuiteV2`、provider、网络、credential 或宿主代码；
- 确认构造阶段不提前声称 `wiring_compatible`，严格 parser 成功后摘要仍无 `passed`、aggregate 或任何效果指标；
- 运行聚焦测试、`npm test`、protocol、build 与 `git diff --check`。

## Builder 自检

- `npx vitest run test/starlette-wiring-smoke.test.ts`：7/7；
- 31 个单 case 与完整 suite 均通过 `parseEvaluationSuiteV2`；
- 结构计数：6 registered / 3 smoke / 31 evaluator cases / 226 projected history turns；
- `npm test`：13 files / 282 tests；
- `npm run test:protocol`：8/8；
- `npm run build`、`git diff --check`：通过。

实现者不批准本工单。新的独立 QA PASS 前，不能开始正式 promotion/freeze，也不能运行 D0/D1/D2 或远端模型。
