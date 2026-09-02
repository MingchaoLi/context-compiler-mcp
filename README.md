[English](README.md) | [简体中文](README.zh-CN.md)

# RippleContext

**RippleContext aims to put users—not any single AI agent—in control of long-term context.**

**Short term.** We want useful context to continue across Sessions and, as Host integrations mature,
across Agents. Changing tools should not mean reconstructing months of important decisions,
constraints, unfinished work, and supporting evidence from scratch.

**Long term.** We want to explore how events from Agents, devices, applications, and other personal
data sources can become an evolving, user-owned Context and Experience layer—one that can distinguish
what happened, what still holds now, and which Experience patterns may be reusable.

**Today.** This repository is an experimental, local-first implementation of the storage, State,
lifecycle, provenance, recall, and context-compilation foundations for that direction.

> [!WARNING]
> **Experimental Research Preview — Not Production Ready.** This is a working but incomplete research
> implementation. It is not a production memory service, a proven security boundary, or a validated
> cross-host context-reduction solution.

The public project name is **RippleContext**. The package, executable, MCP server, and repository retain
the compatibility name **`context-compiler-mcp`**.

## Why RippleContext exists

Imagine working with one Agent for months. Over time, you accumulate important decisions, long-lived
constraints, failed approaches, and unfinished work. When you move to another Agent, you should not
have to explain everything again—or pour the entire chat history into a new Context.

What needs to continue is more specific:

- decisions and constraints that still apply;
- goals and questions that remain unfinished;
- old State that has been rejected, resolved, or superseded;
- Experience that may be worth reusing;
- the original evidence when exact recovery is needed.

The core problem is simple: **history is not current State**.

Agent histories accumulate information that was once valid. Basic retrieval can bring an old decision,
expired constraint, or abandoned plan back into a current decision without knowing whether it still
holds.

RippleContext keeps what happened as append-only local evidence, maintains what still holds as typed
State, tracks how information is revised or superseded, and compiles bounded, relevant,
evidence-linked Context when an Agent needs to act.

```text
What happened
      ↓
What still holds now
      ↓
What evidence supports it
      ↓
What this decision needs
```

**The goal is not merely to help Agents remember more. It is to let useful Context continue with the
user while reducing the risk of acting on information that is no longer valid.**

The current Core supports explicit multi-Session read scopes. Seamless cross-Agent and cross-Host
continuity still depends on adapters and Host capabilities and is not complete. Cross-device sync,
universal source integration, and automatic Experience Formation remain research directions.

## What works today

RippleContext is still a Research Preview, but the main local data and context path is runnable:

- **Local append-only history:** SQLite Raw Event storage with per-Session ordering and source-event
  idempotency.
- **Explicit current State:** typed Goals, Constraints, Decisions, Open Questions, and Rejected
  Alternatives with deterministic lifecycle and relation updates.
- **Cross-Session scope:** callers can declare an ordered read scope with frozen ancestor frontiers and
  a current write Session.
- **Bounded context compilation:** current input, active State, dependency closure, recent complete
  user turns, bounded BM25 recall, and optional caller-supplied Dense vectors.
- **Traceable evidence:** derived State remains linked to source events; exact evidence can be recovered
  by Event, range, or headline.
- **Local MCP access:** a stdio server with exactly nine tools and a narrow, sanitized public result.
- **Canonical integrity primitives:** revisioned Raw, State, Fact, Relation, immutable snapshots,
  provenance, and exact replay.

The storage, transaction, revision, idempotency, replay, provenance, and snapshot boundaries have
substantial deterministic and adversarial QA coverage. This is evidence for implementation
correctness—not proof of product-level quality across Hosts.

### Development evidence: less answer input with comparable bounded quality

We ran a bounded development evaluation over six frozen cases derived from the maintainer's real,
long-running chat history. Because that source history is private, the conversations, answers, logs,
and databases are not published. The aggregate results and their limitations are summarized here.

`RC Raw-only` in these comparisons used Raw history retrieval and compilation only. It did **not** use
the planned Semantic Formation path, State/Fact/Relation Formation, or a small-model fallback.

#### Codex Compaction vs RC Raw-only

Original run, five common valid cases:

| Metric | Codex Compaction | RC Raw-only |
| --- | ---: | ---: |
| Gold retained | 16/19 | 15.5/19 |
| Quality median | 4.25 | 3.75 |
| Answer-stage input tokens | 208,354 | 122,407 |
| Stale resurrection cases | 0/5 | 0/5 |
| Negative-transfer cases | 0/5 | 1/5 |

In this bounded run, RC retained **96.875%** of the Codex Gold score while using about **41.3% fewer
answer-stage input tokens**. Its quality median was 0.5 lower, and one negative-transfer case remained.

#### Pi Native vs RC Raw-only

Later post-hoc Pi Native supplement, five common valid cases:

| Metric | RC Raw-only | Pi Native |
| --- | ---: | ---: |
| Valid answers | 5/5 | 5/5 |
| Supplemental blind-review Gold | 14/19 | 15.5/19 |
| Quality median | 3.25 | 3.25 |
| Critical-false cases | 2/5 | 5/5 |
| Stale-resurrection cases | 0/5 | 4/5 |
| Negative-transfer cases | 1/5 | 3/5 |
| Answer-stage input tokens | 122,407 | 2,723,763 |
| Longest case (C06) | completed | context overflow |

RC used about **95.5% fewer answer-stage input tokens** in the five common cases. Pi Native covered more
Gold in the supplemental blind review, but also brought back more contradictory or stale material. In
the longest case, RC completed while Pi Native's answer request and overflow-compaction recovery both
exceeded capacity.

These results are promising but deliberately narrow:

- the Pi run was a later, post-hoc development supplement with temporal-drift risk;
- the supplement was not Independent QA, a hidden holdout, or final qualification;
- the Pi result was classified `PARTIAL`;
- Codex compaction-generation usage was not observable, so the 41.3% result is answer-stage input, not
  a strict end-to-end cost comparison;
- Pi token values were observed at Pi's provider boundary, not from the exact provider HTTP payload;
- five common cases cannot establish robustness, generalization, or a cross-Host final-input claim.

Public evidence notes:

- [Sanitized evaluation protocol](docs/qa/WO-DG-02-private-history-evaluation-protocol.md)
- [Sanitized aggregate results](docs/qa/WO-DG-02-private-history-evaluation-results.md)

## How we approach the problem

Instead of treating every remembered fragment as equally current, RippleContext follows the lifecycle
of an event:

```text
Something happens
      ↓
Raw Event
retain the original source
      ↓
Fact / State
represent what it means for the present
      ↓
Lifecycle
later evidence may update, resolve, reject, or supersede it
      ↓
Action → Outcome → Feedback
research data for possible Experience
      ↓
Context Compilation
select bounded, current, traceable context for this task
      ↓
Agent / Host
```

Several principles guide the implementation:

- **History is not current truth.**
- **Relevant does not necessarily mean valid now.**
- **A summary is not an authority boundary.**
- **Derived State should remain connected to original evidence.**
- **An external extractor may propose a State Delta, but deterministic Core code validates and applies
  the transition.**
- **Foreground suppression or compaction must not delete authoritative Raw history.**
- **Experience is more than a conversation summary; it is a research hypothesis about reusable
  Action–Outcome–Feedback structure.**

Raw history, typed State, lifecycle, provenance, snapshots, deterministic compilation, and the
append-only Experience Ledger data plane exist today. Automatic Experience Formation, promotion, and
learned behavior do not.

## What we plan to explore next

Near-term directions include:

- simpler local installation and setup;
- faster, bounded onboarding for different Agents and Hosts;
- a `Pi + RC Semantic` pilot that tests whether broader coverage can be retained without Pi Native's
  stale resurrection, negative transfer, and capacity cost;
- Experience Formation and promotion experiments over real Action–Outcome–Feedback records;
- stronger cross-Session and cross-Host continuity;
- local diagnostics and a simpler UI;
- more real long-running dogfood and an auditable quality–token frontier;
- eventually, privacy-preserving cross-device and cross-source organization.

These are directions, not shipped features or release commitments. The long-term goal is for users not
to have to manage a memory database manually; the context layer should gradually recede into the
background.

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
perform automatic State extraction.

### Generic stdio MCP configuration

MCP configuration syntax differs by Host, but the process definition is:

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
- No Host currently has a formally validated compiler mode from this Core repository. Host adapters
  and deployment behavior live elsewhere.
- Append or context injection is not history replacement. `SHORT_REPLACE` and `LONG_REPLACE` are
  provider-neutral router suggestions, not proof that a Host replaced native history.
- The Core does not own the final provider request. The project has **not** demonstrated cross-Host
  reduction of final model-input tokens.
- `compile_context` and `ingest_event` do not implicitly call an extractor, model, provider, or
  network, and they do not implicitly evolve State.
- Dense retrieval requires caller-supplied vectors with complete compatible coverage. Its semantic
  benefit, broader Context benefit, and Experience Formation benefit remain unvalidated.
- Automatic headline generation is not implemented.
- The private-history evaluation above is development evidence, not a public reproducible benchmark.
  The source records cannot be published without exposing private conversations.
- Legacy `CompiledContext` and canonical `ContextSnapshot` are separate library surfaces.
  `CompiledContext` must not be treated as if it carries the canonical Snapshot's exact
  revision/evidence/attempt/authority guarantees.
- Windows and an exact Node.js 24 runtime have not been separately verified.

## Architecture

| Concept | Role |
| --- | --- |
| **Raw Event** | Append-only source history for replay and evidence recovery. |
| **State** | Typed claims about what is currently active, such as Goals, Constraints, Decisions, and Open Questions. |
| **Lifecycle** | Explicit transitions such as supersede, resolve, and reject; code owns and validates them. |
| **Provenance** | Links from derived State or Context back to source evidence and revision identity. |
| **Experience** | Append-only Action, Outcome, Feedback, and candidate-experience records; automatic formation is future research. |
| **CompiledContext** | The compatibility-oriented bounded output used by the current compiler and public MCP projection. |
| **ContextSnapshot** | A separate canonical library contract for immutable scope/as-of/manifest/attempt evidence and exact replay. It is not an MCP tool or proof of Host consumption. |
| **Deterministic authority boundary** | An external extractor may propose a State Delta; Core code strictly validates and atomically applies it. |

Start with the [architecture overview](docs/ARCHITECTURE.md). The canonical Snapshot boundary is
specified separately in the
[ContextSnapshot contract](docs/architecture/WO-05-context-snapshot-contract.md). Current accepted
scope and unresolved gaps are recorded in [PROJECT_STATE](docs/PROJECT_STATE.md).

## Research, QA, and design history

This repository intentionally retains evidence of how the design evolved:

- [Work Orders](docs/work-orders/) record bounded implementation and research scopes.
- [QA findings](docs/qa/) include accepted results, returns, and reproduced counterexamples.
- [Adversarial reviews](docs/adversarial-reviews/) challenge assumptions and investment order.
- [Evaluation artifacts](evaluation/) preserve public fixtures, diagnostics, and interpretation limits.
- [Decisions](docs/DECISIONS.md) and the [Roadmap](docs/ROADMAP.md) identify current and historical
  boundaries.

### Selected QA evidence

These records are useful entry points into the repository's validation history. They are not one
cumulative benchmark: several reports rerun the same regression suites, so their test counts should
not be added together.

- **Long-conversation dogfood:** [WO-DG-01](docs/qa/WO-DG-01-codex-long-conversation-dogfood.md)
  independently checks a sanitized real-use observation, targeted recovery, arithmetic, and reported
  misses without promoting it into a general Host claim.
- **Bounded private-history comparison:** [protocol](docs/qa/WO-DG-02-private-history-evaluation-protocol.md)
  and [aggregate results](docs/qa/WO-DG-02-private-history-evaluation-results.md) document the Codex,
  Pi Native, and RC Raw-only development comparison used above.
- **Snapshot integrity:** the [returned omission attack](docs/qa/WO-05-context-snapshot-contract.md)
  and [accepted fix](docs/qa/WO-05-context-snapshot-contract-fix.md) show how a coordinated provenance
  failure was reproduced and then closed with an owner-bound projection receipt.
- **Foundation freeze:** [WO-V0-15](docs/qa/WO-V0-15-experience-ready-foundation-freeze.md) preserves
  multiple append-only FAIL → fix → re-QA cycles covering transactions, idempotency, replay, migration,
  concurrency, telemetry completeness, and production packaging.
- **Atomic State updates:** [WO-ST-01](docs/qa/WO-ST-01-state-update-pipeline.md) exercises strict
  preparation, atomic apply, revision conflicts, rollback, retry behavior, and real stdio packaging.
- **Public MCP privacy boundary:** the [initial return](docs/qa/WO-PUB-01-public-mcp-result-boundary.md)
  and [accepted fix](docs/qa/WO-PUB-01-public-mcp-result-boundary-fix.md) verify the closed public result
  allowlist while retaining internal diagnostics and telemetry.
- **Evaluator validity:** [WO-EV-02](docs/qa/WO-EV-02-evaluator-validity-calibration.md) retains its
  initial provenance/parser failures and the subsequent Independent re-QA that closed them, including
  `not_evaluable` and current-input isolation checks.

Failed reports remain public because they are part of the evidence. For paired records, follow the fix
or final re-QA section for the current disposition.

Some earlier designs were revised after experiments or QA counterexamples. These records are valuable
research provenance, but not every historical document is current authority.

## License

[Apache License 2.0](LICENSE)
