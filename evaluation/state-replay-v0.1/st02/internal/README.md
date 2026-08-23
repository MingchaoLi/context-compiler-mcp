# ST-02 内部零模型评分

本目录只在 official capture 完成后读取 Gold，用于机械 replay 与归因；它从不作为 Extractor 输入，`source-only` runtime 也不读取这里的任何文件。

- `scoring-contract.json`：在评分代码前单独提交的 empty-state 口径，固定 capture / Gold 信任根、分母、互斥 primary outcome 和所有零分母语义；
- `empty-state-scorer.ts`：先验证前置 scoring contract，再闭合比对固定 capture/packets 与 Gold Git tree/current bytes，最后执行 fresh 零模型 replay；
- `run-empty-state-score.ts`：只向 stdout 输出 deterministic 报告，不写文件、不调用模型；
- `empty-state-report.json`：本次 official capture 的逐 case / step 原始结果，状态为 `pending_independent_qa`。

运行：

```bash
node node_modules/vite-node/vite-node.mjs --script evaluation/state-replay-v0.1/st02/internal/run-empty-state-score.ts
```

本次三条 Predicted State 始终为空，因此没有实现通用 lexical matcher。`unmatched=0`、`ambiguous=0` 只表示没有 predicted candidate，不是 matcher PASS；general / critical precision 以及 stale activation、wrong reactivation、dependency、provenance capability 都保持结构化 `not_evaluable`。

报告不设 threshold、aggregate 或 architecture winner，也不读取/重跑 `feasibility-01`。`0 reducer rejection` 只是在 empty fallback / empty Delta 后的执行观测，不是 Operational Stability 证明。
