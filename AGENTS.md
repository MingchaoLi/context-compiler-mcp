# Context Compiler Core 扁平化协作规则

Repository files and Git history are the source of truth. Chat history is not.

开始任务前：

1. Read `docs/PROJECT_STATE.md` and `docs/ROADMAP.md`.
2. Read the current Chinese mailbox task or task document and its referenced public Architecture/Interface.
3. Read only the source and evidence required by that task.
4. If Requirement or a public protocol is undefined, return one bounded question; Module Owner decides undefined internal implementation details.

普通任务不要求 work order、Task Capsule、逐提交 manifest、reconciliation、`integration/*` 或每模块 Submission QA。历史工单只保留功能范围和证据价值，其旧流程条款不再用于新路由。

## 上下文纪律

- 把上下文当作工作记忆，不把仓库整体倾倒进上下文；上下文更多不天然更好。
- 优先使用定向搜索、窄范围读取、当前 Authority、确定性过滤与生命周期清理，而不是穷举探索。
- 继续取证前，先写清尚未解决的问题以及回答它所需的最小证据。
- 不得仅因仍有上下文容量而继续调查。
- 除非具体歧义要求，不重复读取已经检查过的范围。
- 优先读取当前实现与生效合同；已取代计划、历史工单和过期设计讨论默认排除。
- 源码默认按小范围定向读取（通常不超过约 120 行）；只有确需连续语境时才扩展。明确要求完整读取的 Authority、指令文件与当前合同仍须完整读取。
- Shell 与测试输出默认裁剪；只有诊断具体失败时使用详细输出。
- 新获取证据累计约 30K tokens 后，停止继续取证并重新判断任务是否已经可以回答。**停止并决策，不是停止后再总结。**
- 优先删除无关、重复、已关闭或已取代材料，而不是依赖模型压缩。
- 只有保留内容仍与决策相关、且很可能复用时才使用压缩。
- 优化目标是正确性、决策相关信息密度、请求次数、延迟与信息保真，而不是单独追求 Token 减少。
- 这些是默认调查预算，不是正确性上限；只有具体未决问题确实需要更多证据时才超出。

## Boundaries

- This repository owns the model-independent Context Compiler core and its MCP service.
- Do not import desktop UI, application-host, orchestration-framework, messaging, or packaging code.
- Host adapters belong in their host repositories. Legacy environment compatibility may remain when the current task or public Architecture explicitly preserves it, but it must not become a code dependency.
- No model provider is selected here. A future optional `ExtractorTransport` may be supplied from outside.
- Never put credentials, raw private conversations, database files, logs, or generated build output in Git.

## 交付与 QA

- 默认直线流程：`接到任务 → 模块设计 → 一次架构评审 → 开发 → 独立 Module QA → 合入 main → main smoke → 完成`。
- Builder 不得批准自己的实现；Module Owner 负责组织独立 Module QA。
- QA RETURN 留在同一模块任务中连续修复，由同一独立 QA 定点复核失败项和必要回归；不得创建新的 Fresh re-QA 路线。
- Module QA PASS 后，Module Owner 在 expected-old 与工作树安全条件满足时直接合入 `refs/heads/main` 并执行 main smoke。
- 只有 `main` 包含已测试实现且 main smoke 通过才算模块完成；候选分支、`integration/*`、handoff 或 reconciliation 均不算完成。
- 所有必要模块完成后只执行一次独立 Golden Path QA 和有限本地安全检查。
- Preserve unrelated changes and filtered history; do not rewrite published commits.
- Run the task's focused checks, plus at least `npm test` and `npm run build` for source changes.

## 对抗审查

- 独立 QA 验证实现是否满足当前任务与公共合同；对抗审查质疑任务目标、依赖顺序、所谓 blocker 和投入是否值得。两者不能互相替代。
- 到达关键节点时，主控可以申请一次独立对抗审查。典型节点包括：完成一个路线图阶段、准备引入宿主/供应商依赖、准备扩大运行时边界，或连续多个任务均由同一 Builder 路径推进之后。
- 对抗审查默认只读，不接管实现、不修改任务或公共合同、不自动推翻已经通过的 QA，也不因 `Challenge` 结论自动阻塞项目。
- 审查必须区分事实、推断和建议，给出具体反例、更小验证路径及双方可被证伪的条件。
- 审查记录写入 `docs/adversarial-reviews/`。主控负责决定是接受风险、补充证据，还是投递一个有界任务。
