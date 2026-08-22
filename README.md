# Context Compiler MCP

Context Compiler MCP is a local, model-independent service for durable conversation evidence, explicit context state, deterministic context assembly, and exact history recall. It stores data in SQLite and exposes a stable stdio MCP boundary.

The current server exposes exactly nine tools:

- `health`
- `ingest_event`
- `compile_context`
- `get_state`
- `prepare_state_update`
- `apply_state_delta`
- `create_headline`
- `recall_exact`
- `recall_keyword`

`compile_context` remains read-only: it assembles known state and recent raw evidence but does not call a model or mutate state. State evolution is an explicit two-step operation. `prepare_state_update` returns a bounded, fingerprinted extractor snapshot; an external caller may obtain a candidate State Delta elsewhere and pass it to `apply_state_delta`, which strictly validates and atomically applies it against the prepared state revision. The package does not select or call a model. Automatic extraction and headline generation are not runtime features.

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

## Offline evaluation

The provider-neutral evaluation runner compares a versioned JSON fixture across D0 full raw context, D1 recent context, and D2 compiled context. It reports deterministic approximate token reduction, labeled continuity/reopening/recovery rates, and measured latency. Probe matching uses Unicode NFKC plus collapsed whitespace and exact containment; it is not a semantic model judgment.

```sh
npm run evaluate -- /absolute/path/evaluation-suite.json
```

The CLI writes a versioned JSON report to stdout. Exit `0` means all aggregate thresholds passed, `2` means evaluation completed but a threshold failed, `3` means invalid input, and `4` means a sanitized runtime failure. Evaluation creates isolated temporary SQLite databases only for loading fixture evidence and exercising the existing headline recall implementation; it performs no model or network call and does not alter the nine-tool MCP protocol.

## Project facts

- [Current state](docs/PROJECT_STATE.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Decisions](docs/DECISIONS.md)
- [Roadmap](docs/ROADMAP.md)
- [v0 requirements index](docs/REQUIREMENTS_V0.md)
- [Migration provenance](docs/MIGRATION.md)

The archived original brief is intentionally not part of the normal agent reading path; use the concise requirements index first.
