# Starlette feasibility-01 自动诊断与盲审包

本目录是 WO-DS-13 的唯一 official 结果。`generate-official-results.test.ts` 已在 2026-08-23 恰好执行一次 evaluator v2；不要再次执行它来覆盖本目录。独立 QA 只可在隔离临时目录重算确定性字段，不能产生第二份 official artifact。此次没有模型调用，也没有语义评分。

## 自动结果

- D0：7,767 estimated tokens；8/8 exact lexical Probe 命中。
- D1：2,911 estimated tokens；0/8 exact lexical Probe 命中。
- D2 Oracle-State upper bound：4,578 estimated tokens；8/8 exact lexical Probe 命中。
- D2 相对 D0 减少 41.0583%；D2 相对 D1 增加 1,667 tokens，成本为 D1 的 1.572655 倍。

这 8 个 Probe 只分布在 3/12 slices，因此只是 lexical diagnostic，不是完整 Correctness Gate。resolved context 与 recall 均为 `not_evaluable`；evaluator 的 `passed:false` 只是一项 non-decision diagnostic。D2 的上下文成本明显高于 D1，但在两名真实人类完成语义盲评前，不能解释这种额外成本是否值得，也不能声称 D2 优于 D1。

本机单次 latency 保存在 `internal-audit/latency-observation.json`，只是一条环境 observation，不是 Operational Stability Gate。

## 物理边界

- Reviewer A 只导出 `public-review/shared/` 与 `public-review/reviewer-a/`。
- Reviewer B 只导出 `public-review/shared/` 与 `public-review/reviewer-b/`。
- 两份独立评分返回后，adjudicator 才可取得 `public-review/adjudicator/`。
- `internal-audit/`、原始 capture、仓库、自动报告与另一 reviewer 表单不得提供给 reviewer。
- 不得把整个 `public-review/` 目录直接发送给任何 reviewer。

如果 reviewer 具备仓库、raw capture、internal key 或 automatic report 访问权，就不能称为 condition-blind，也不能开始正式评分。

## 验证

```bash
node evaluation/starlette-v1/results/feasibility-01/validate-results.mjs
npx vitest run test/starlette-feasibility-results.test.ts
```

`validate-results.mjs` 在读取当前结果 JSON 前，先将 official artifacts 锚定到 Git source commit `f721fd1159e6802d29132939c8114377f3faefa4`，并分别锚定 DS-11 input/protocol 与 DS-12 raw capture。hash 清单不能通过与 validator 协调改写来自举。
