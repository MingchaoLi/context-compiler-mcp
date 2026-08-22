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
