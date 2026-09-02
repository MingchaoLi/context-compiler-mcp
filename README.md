[English](README.md) | [简体中文](README.zh-CN.md)

# RippleContext

**Local-first context and experience infrastructure for long-running AI agents.**

RippleContext does more than store what happened. It provides a model-independent core for tracking
what is still true, how that state changed, and which raw evidence supports it. The repository includes
a local SQLite data plane, a TypeScript/JavaScript library, and a stdio MCP server.

> [!WARNING]
> **Experimental Research Preview — Not Production Ready.** This is a working but incomplete research
> implementation. It is not a production memory service, a proven security boundary, or a validated
> cross-host context-reduction solution.

The public project name is **RippleContext**. The package, executable, MCP server, and repository retain
the compatibility name **`context-compiler-mcp`**.

## The problem

Long-running agents accumulate more history than is useful in every model call:

- conversations and tool results keep growing;
- an old decision can reappear after it has been superseded;
- information can remain easy to retrieve even after it is no longer valid;
- “relevant in the past” is not the same as “authoritative now”;
- adding more history or another summary does not by itself establish current truth.

A basic memory search might find both an original decision and the later evidence that replaced it.
The difficult part is not only finding related text. It is preserving the lifecycle of the decision,
identifying which version is current, and retaining a path back to the evidence.

## What RippleContext does

```text
Raw history (append-only and traceable)
                 ↓
       explicit state updates
                 ↓
current state + lifecycle + provenance
                 ↓
 bounded context compilation and recall
                 ↓
          host / agent
```

RippleContext separates traceable history from current working state:

- raw events remain append-only and can be recovered as evidence;
- typed state can change through explicit, validated lifecycle transitions;
- derived state remains linked to source evidence; Core/library compilation retains internal
  provenance diagnostics, while the public MCP result is intentionally narrower;
- context compilation combines current input, active state, recent raw events, and bounded recall;
- host integration remains a separate responsibility, so actual delivery to a model depends on the host.

The long-term research direction includes learning from Action, Outcome, and Feedback records. The
repository already provides an append-only Experience Ledger data plane, but automatic Experience
Formation, promotion, and learned behavior are not implemented.

## Why this is different from a basic memory store

> Basic memory retrieval asks: **What from the past is relevant?**
>
> RippleContext additionally asks: **Is it still valid now, what superseded it, and what evidence
> supports it?**

This does not make ordinary history, summaries, or retrieval unnecessary. RippleContext treats them as
different layers: raw history is evidence, retrieval finds candidates, and explicit state/lifecycle
rules determine what can be treated as current.

## What works today

The current repository implements and tests:

- **Local append-only history:** SQLite raw-event storage with per-session ordering and source-event
  idempotency.
- **Explicit current state:** typed Goals, Constraints, Decisions, Open Questions, and Rejected
  Alternatives with deterministic lifecycle and relation updates.
- **Safe state-update boundaries:** immutable preparation snapshots and strict, atomic application of
  externally produced State Deltas.
- **Bounded context compilation:** current input, active state, dependency closure, recent complete
  user turns, bounded BM25 recall, and optional caller-supplied Dense vectors.
- **Traceable evidence recall:** exact recovery by event, range, or headline, plus literal keyword
  search over stored headlines.
- **Canonical authority primitives:** revisioned Raw, State, Fact, Relation, provenance, replay, and a
  separate library-only canonical `ContextSnapshot` contract.
- **Local MCP access:** a stdio server with exactly nine tools and sanitized public results.
- **Offline research evaluation:** versioned, provider-neutral D0/D1/D2 fixtures and deterministic
  measurement. These are research diagnostics, not proof of general effectiveness.

The Core does not select a model provider and makes no network request. An optional library transport
can call a local extractor subprocess, but that process owns its provider, network, and credentials.

## 5-minute quickstart

### Requirements

- Node.js 24 or newer
- npm

### Clone and build

```sh
git clone https://github.com/MingchaoLi/context-compiler-mcp.git
cd context-compiler-mcp
npm install --no-audit --no-fund
npm run build
```

### Ingest one event and compile context

The following smoke path uses the MCP client already installed as a project dependency. It starts the
stdio server, writes one local event, compiles context for a follow-up question, and prints the public
results.

```sh
mkdir -p .ripplecontext-local

node --input-type=module <<'EOF'
import { resolve } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const transport = new StdioClientTransport({
  command: process.execPath,
  args: [resolve("dist/mcp-server.js")],
  env: {
    ...process.env,
    CONTEXT_COMPILER_DB_PATH: resolve(".ripplecontext-local/quickstart.db"),
  },
  stderr: "inherit",
});

const client = new Client({
  name: "ripplecontext-quickstart",
  version: "1.0.0",
});

await client.connect(transport);

try {
  const ingest = await client.callTool({
    name: "ingest_event",
    arguments: {
      session_id: "readme-quickstart",
      role: "user",
      content: "The deployment target is a local research environment.",
      source_event_id: "quickstart-1",
    },
  });

  const compile = await client.callTool({
    name: "compile_context",
    arguments: {
      session_id: "readme-quickstart",
      current_input: "What is the deployment target?",
    },
  });

  const read = (result) =>
    result.structuredContent ?? JSON.parse(result.content[0].text);

  console.log(JSON.stringify({
    ingest: read(ingest),
    compile: read(compile),
  }, null, 2));
} finally {
  await client.close();
}
EOF
```

The `compile.result.context.rendered_context` field should include the ingested sentence under
`Recent Conversation`. This demonstrates local event storage and bounded compilation; it does not
perform automatic state extraction.

### Generic stdio MCP configuration

MCP configuration syntax differs by host, but the process definition is:

```json
{
  "mcpServers": {
    "ripplecontext": {
      "command": "node",
      "args": ["/absolute/path/to/context-compiler-mcp/dist/mcp-server.js"],
      "env": {
        "CONTEXT_COMPILER_DB_PATH": "/absolute/path/to/ripplecontext.db"
      }
    }
  }
}
```

Use `CONTEXT_COMPILER_DB_PATH` for new integrations. `DSH_HOME/sessions/context-compiler.db` remains
a legacy fallback.

The server exposes exactly these tools:

| Purpose | MCP tools |
| --- | --- |
| Readiness | `health` |
| Raw history | `ingest_event` |
| Context | `compile_context` |
| State | `get_state`, `prepare_state_update`, `apply_state_delta` |
| Evidence recall | `create_headline`, `recall_exact`, `recall_keyword` |

## Current limitations

- RippleContext is experimental, incomplete, and not production ready.
- No Host currently has a formally validated compiler mode from this repository. Host adapters and
  deployment behavior live outside the Core.
- Append or context injection is not history replacement. `SHORT_REPLACE` and `LONG_REPLACE` are
  provider-neutral router suggestions, not proof that a Host replaced its native history.
- The Core does not own the final provider request. The project has **not** demonstrated cross-host
  reduction of final model-input tokens.
- `compile_context` and `ingest_event` do not implicitly call an extractor, model, provider, or
  network, and they do not implicitly evolve State.
- Dense retrieval requires caller-supplied vectors with complete compatible coverage. Its semantic
  benefit, broader context benefit, and Experience Formation benefit remain unvalidated.
- Automatic headline generation is not implemented.
- The offline evaluator and current dogfood records are diagnostic evidence only. They do not prove
  that D2 is better than D1, robust, generalizable, or superior to another system.
- Legacy `CompiledContext` and canonical `ContextSnapshot` are separate library surfaces.
  `CompiledContext` must not be treated as if it carries the canonical snapshot's exact
  revision/evidence/attempt/authority guarantees.
- Windows and an exact Node.js 24 runtime have not been separately verified.

## Architecture

Once the basic problem is clear, the main internal concepts are:

| Concept | Role |
| --- | --- |
| **Raw Event** | Append-only source history. It remains available for replay and evidence recovery. |
| **State** | Typed claims about what is currently active, such as goals, constraints, decisions, and open questions. |
| **Lifecycle** | Explicit transitions such as supersede, resolve, and reject; code owns and validates them. |
| **Provenance** | Links from derived state or context back to source evidence and revision identity. |
| **Experience** | Append-only research records for Action, Outcome, Feedback, and candidate experience; automatic formation is future research. |
| **CompiledContext** | The compatibility-oriented bounded context output used by the current compiler and public MCP projection. |
| **ContextSnapshot** | A separate canonical library contract for immutable scope/as-of/manifest/attempt evidence and exact replay. It is not an MCP tool or proof of Host consumption. |
| **Deterministic authority boundary** | An external extractor may propose a State Delta; Core code strictly validates and atomically applies the transition. |

Start with the [architecture overview](docs/ARCHITECTURE.md). The canonical snapshot boundary is
specified separately in the
[ContextSnapshot contract](docs/architecture/WO-05-context-snapshot-contract.md). Current accepted
scope and unresolved gaps are recorded in [PROJECT_STATE](docs/PROJECT_STATE.md).

## Research, QA, and design history

This repository intentionally retains the evidence of how the design evolved:

- [Work Orders](docs/work-orders/) record bounded implementation and research scopes.
- [QA findings](docs/qa/) include accepted results, returns, and reproduced counterexamples.
- [Adversarial reviews](docs/adversarial-reviews/) challenge assumptions and investment order.
- [Evaluation artifacts](evaluation/) preserve fixtures, diagnostics, and their interpretation limits.
- [Decisions](docs/DECISIONS.md) and the [Roadmap](docs/ROADMAP.md) identify current and historical
  boundaries.

Some earlier designs were revised after experiments or QA counterexamples. These records are useful
research provenance, but not every historical document is current authority. Most developers can
start with this README, the architecture overview, and PROJECT_STATE without reading the full archive.

## License

[Apache License 2.0](LICENSE)
