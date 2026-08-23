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

`compile_context` remains read-only: it assembles known state and recent raw evidence but does not call a model or mutate state. State evolution is an explicit two-step operation. `prepare_state_update` returns a bounded, fingerprinted extractor snapshot; an external caller may obtain a candidate State Delta elsewhere and pass it to `apply_state_delta`, which strictly validates and atomically applies it against the prepared state revision. The package does not select a model or provider. Automatic extraction from MCP/compile and automatic headline generation are not runtime features.

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

The provider-neutral evaluation runner compares a versioned JSON fixture across D0 full raw context, D1 recent context, and D2 compiled context. Version 1 remains available for exact historical reproduction. Version 2 requires provenance-bound Probe objects, represents empty denominators as `not_evaluable`, measures historical continuity without treating `current_input` as retained history, and reports raw D2-vs-D1 token delta/ratio alongside the existing D2-vs-D0 reduction. Probe matching still uses Unicode NFKC plus collapsed whitespace and exact containment; it is not a semantic model judgment or a remote-model call.

```sh
npm run evaluate -- /absolute/path/evaluation-suite.json
```

The CLI dispatches version 1 or version 2 from the root `version` field and writes the matching JSON report to stdout. Exit `0` means all aggregate thresholds passed, `2` means evaluation completed but a threshold failed or a required v2 metric was wholly `not_evaluable`, `3` means invalid input, and `4` means a sanitized runtime failure. Evaluation creates isolated temporary SQLite databases only for loading fixture evidence and exercising the existing headline recall implementation; it performs no model or network call and does not alter the nine-tool MCP protocol. The deterministic v2 ruler calibration fixture is `test/fixtures/evaluation-v2-calibration.json`; it is not Context Compiler effectiveness evidence.

## Optional local extractor runtime

Library callers may explicitly compose the accepted state-update pipeline with a local provider adapter process. The core starts the executable directly with `shell: false`, sends one `{ "version": 1, "prompt": string }` request, and accepts one `{ "version": 1, "delta": object }` response. The child owns any model SDK, network use, and credentials; none are selected or configured by this package.

```js
import {
  JsonSubprocessExtractorTransport,
  RuntimeStateUpdater,
  SqliteContextStateStore,
} from "context-compiler-mcp";

const store = new SqliteContextStateStore("/absolute/path/context-compiler.db");
const transport = new JsonSubprocessExtractorTransport({
  executable: "/absolute/path/provider-adapter",
  args: ["--stdio-once"],
});
const updater = new RuntimeStateUpdater(store, transport);
const result = await updater.updateState({
  session_id: "session-id",
  newest_event_ids: ["ordered-current-suffix-event-id"],
});
await transport.close();
store.close();
```

The runtime updater performs explicit prepare → strict extract → atomic apply. It is never invoked implicitly, and the MCP server remains exactly nine tools.

## Project facts

- [Current state](docs/PROJECT_STATE.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Decisions](docs/DECISIONS.md)
- [Roadmap](docs/ROADMAP.md)
- [v0 requirements index](docs/REQUIREMENTS_V0.md)
- [Migration provenance](docs/MIGRATION.md)

The archived original brief is intentionally not part of the normal agent reading path; use the concise requirements index first.
