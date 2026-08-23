# Context Compiler MCP collaboration rules

Repository files and Git history are the source of truth. Chat history is not.

Before changing code:

1. Read `docs/PROJECT_STATE.md` and `docs/ROADMAP.md`.
2. Read exactly one current work order under `docs/work-orders/`.
3. Read only the architecture, decisions, and source files routed by that work order.
4. If acceptance criteria are missing, update the work order before implementation.

## Boundaries

- This repository owns the model-independent Context Compiler core and its MCP service.
- Do not import desktop UI, application-host, orchestration-framework, messaging, or packaging code.
- Host adapters belong in their host repositories. Legacy environment compatibility may remain when a work order explicitly preserves it, but it must not become a code dependency.
- No model provider is selected here. A future optional `ExtractorTransport` may be supplied from outside.
- Never put credentials, raw private conversations, database files, logs, or generated build output in Git.

## Delivery and QA

- One work order must produce one bounded result.
- Implementers write `docs/handoffs/<WORK-ORDER>.md` and must not approve their own work.
- Independent QA writes `docs/qa/<WORK-ORDER>.md`. A failure returns to the implementation branch for a new append-only fix commit.
- Preserve unrelated changes and filtered history; do not rewrite published commits.
- Run the work order's checks, plus at least `npm test` and `npm run build` for source changes.

## 对抗审查

- 独立 QA 验证实现是否满足当前工单；对抗审查质疑工单目标、依赖顺序、所谓 blocker 和投入是否值得。两者不能互相替代。
- 到达关键节点时，主控可以申请一次独立对抗审查。典型节点包括：完成一个路线图阶段、准备引入宿主/供应商依赖、准备扩大运行时边界，或连续多个工单均由同一 Builder 路径推进之后。
- 对抗审查默认只读，不接管实现、不修改工单、不自动推翻已经通过的 QA，也不因 `Challenge` 结论自动阻塞项目。
- 审查必须区分事实、推断和建议，给出具体反例、更小验证路径及双方可被证伪的条件。
- 审查记录写入 `docs/adversarial-reviews/`。主控负责决定是接受风险、补充证据，还是另开一个有界工单。
