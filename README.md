# Context Compiler MCP

Context Compiler MCP is a local, model-independent service for durable conversation evidence, explicit context state, deterministic context assembly, and exact history recall. It stores data in SQLite and exposes a stable stdio MCP boundary.

The current server exposes exactly seven tools:

- `health`
- `ingest_event`
- `compile_context`
- `get_state`
- `create_headline`
- `recall_exact`
- `recall_keyword`

`compile_context` is currently read-only: it assembles known state and recent raw evidence but does not call a model or mutate state. State extraction and automatic headline generation are not yet runtime features.

## Requirements and setup

Node.js 24 or newer is required.

```sh
npm install --no-audit --no-fund
npm test
npm run build
```

Start the stdio server with an explicit local database path:

```sh
CONTEXT_COMPILER_DB_PATH=/absolute/path/context-compiler.db npm start
```

For compatibility with the originally approved adapter, `DSH_HOME` remains a legacy fallback and resolves to `DSH_HOME/sessions/context-compiler.db`. New integrations should set `CONTEXT_COMPILER_DB_PATH`; it always takes precedence.

The package can also be used as a TypeScript/JavaScript library through `dist/index.js` after building. It has no network or model-provider dependency.

## Project facts

- [Current state](docs/PROJECT_STATE.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Decisions](docs/DECISIONS.md)
- [Roadmap](docs/ROADMAP.md)
- [v0 requirements index](docs/REQUIREMENTS_V0.md)
- [Migration provenance](docs/MIGRATION.md)

The archived original brief is intentionally not part of the normal agent reading path; use the concise requirements index first.
