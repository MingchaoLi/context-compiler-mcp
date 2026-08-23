# WO-DS-01 交接 — Starlette 真实轨迹候选筛选

日期：2026-08-23

状态：**COMPLETED — CANDIDATE SURVEY ONLY**

## 结果

在预注册规则提交 `d2224d91fe1910c03f136c9f54490eed6772915e` 之后，核对 `Kludex/starlette` 的公开 GitHub 主来源，形成 15 条候选，推荐 8 条进入后续冻结工单：

- short：STR-07、STR-08；
- medium：STR-05、STR-06；
- long：STR-01、STR-02、STR-03、STR-04。

完整记录见 `docs/evaluation/starlette-v1-candidate-survey.md`。

## 关键判断

- 高分不自动进入推荐集：STR-11 与已推荐的 BaseHTTPMiddleware 根因链重复，降为 reserve；STR-15 出现公开 `LLM-CR-EVAL` 派生任务交叉引用，因 benchmark contamination 直接 reject。
- 推荐集中保留了无代码 patch 的 short 终局，防止只选择 D2 天生有利的长链或只有合并测试的幸存案例。
- STR-04 的两个已合并 routing middleware PR 只提供部分能力，原始 APM route-name 问题仍 open；后续不得误标为 resolved。
- STR-02 的最终 patch 后仍有较晚复现评论，Outcome Anchor 只能表示已合并 patch/test，不能声称所有根因已消失。

## 边界

本工单没有运行 assembler、evaluator、D0/D1/D2 或远端模型，没有生成 fixture、Gold、时间切片或 hash，也没有修改 core。

检索通过公开 GitHub API/页面只读完成；未克隆外部仓库，未向项目写入缓存、原始抓取、凭据或日志。

## 下一工单输入

WO-DS-02 应先冻结数据 schema 与 GitHub-event→D1-turn 规则，再逐条规范化推荐 8 条。必须：

1. 分离时间可见 evidence 与 Outcome Anchor；
2. 以事件 timestamp 验证 `available_at <= Ti`；
3. 为 Fact Gold 保存稳定 provenance；
4. 对每条轨迹预先列出纳入/排除事件；
5. 在查看任何 D2 输出前完成独立 selection-bias/future-leakage 审计和 canonical hash；
6. 再次扫描公开 benchmark contamination；
7. 如果删案，按候选报告里的有条件替补顺序处理，并记录原因，不能按 D2 表现换样。

WO-DS-02 建议先使用人工 Oracle-State 构造 D2 上界；自动 Extracted-State 必须是后续独立实验，不能混入首次 Starlette v1 结论。

## 自检

- 候选：15；推荐：8；分层为 2 short / 2 medium / 4 long。
- 每条包含公开主来源、时间范围、状态变化、Outcome Anchor、节点估计、评分、风险和建议。
- 明确记录 selection bias、future leakage 与 contamination。
- 无 core/source/package/test 变更；无外部下载或生成物。
- 本交付是研究筛选，不是冻结数据集，也不构成 D2 效果证据。
