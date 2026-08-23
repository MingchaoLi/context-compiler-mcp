# WO-DS-03 交接 — STR-04 long/open canary 门禁关闭

日期：2026-08-23

状态：**RETURNED BY INDEPENDENT DATA QA — GATE-CLOSED 判断不成立**

## 交付

- 在实现前将 STR-05 按机械增量规则从 medium 更正为 long，撤回旧 2/2/2 分层声明；
- 完成 STR-04 固定来源的一手时间线预审，确认其具备 long/open 证据链；
- 对 Issue #685、PR #1286/#1649/#2349 的精确公开路径做同日 contamination 复扫；
- 将 `Uniyalsumit/CT_PROJECT` 中固定提交的 RAGAS evaluation artifact 记录为 STR-04 `confirmed`；
- 更新 `contamination-scan.json` 及对应 `pilot_not_frozen` hash；
- 输出中文门禁报告，并停止 fixture/projection/model 工作。

没有修改 `src/`、MCP、依赖、evaluator、assembler/retrieval policy 或 provider 接口；没有创建 STR-04 fixture，也没有运行远端模型。

## Builder 判断

预注册规则明确把“同一 issue 或 fix 出现在 LLM/evaluation task”列为 confirmed。公开 CSV 的 retrieved contexts 含 PR #2349，同行脚本又明确构建并评分 question/answer/context 数据集，因此不能把它降级为普通 release-note 引用。按工单 Gate，发现 confirmed 后必须停止且不得自动替换。

## QA 必查

- 固定 branch、候选 HEAD、父提交和 clean worktree；
- 直接读取固定提交 `c11a9ce...` 的 CSV、`ragas_dataset.py` 与 `ragas_eval.py`，确认 #2349 位于真实 evaluation context，而不是只凭路径或仓库名判断；
- 对照 `contamination-scan.json.rule`，判断该证据是否必然为 confirmed；
- 主动挑战较窄解释：“问题并非直接要求修复 #685/#2349，所以只是无关 context”；若接受此解释，必须说明为何不构成事后改规则；
- 核对 STR-05 的 9 个事件是否都是真实信息增量，能否存在不造假的 medium 解释；
- 确认没有 STR-04 fixture、projection、D0/D1/D2、模型输出或 reserve 替换；
- 运行 validator、聚焦测试、全量单测、protocol、build 和 `git diff --check`，确认 contamination hash 更新没有破坏已接受 pilot。

## Builder 自检

- `node evaluation/starlette-v1/validate-pilot.mjs`：通过；仍为 3 cases / 4 segments / 25 events / 25 slices，hash verified；confirmed 列表新增 STR-04；
- `npx vitest run test/starlette-pilot.test.ts`：21/21；
- `npm test`：12 files / 263 tests；
- `npm run test:protocol`：8/8；
- `npm run build`、`git diff --check`：通过；
- diff 不含 `src/`、依赖、canary fixture、projection 或模型输出。

实现者不批准 gate closed。独立 QA 前，不得恢复 STR-04、改规则豁免该命中、自动换样或启动模型实验。

## QA 退回后的处置

独立 QA 在提交 `cf600f3` 中证明该 RAGAS 题的 `ground_truth_ref` 是 FastAPI PR #15745，#2349 只属于未被答案使用的 retrieved-context 噪声，不满足原规则的 task/patch 复用限定。主控接受退回，恢复 STR-04 `no_public_hit_found` 并继续原 canary；本交接保留为首轮错误判断的审计记录。
