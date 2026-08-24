# WO-02 Builder Handoff — Core / Host Authority Boundary

Status: **BUILDER COMPLETE / AWAITING INDEPENDENT QA**<br>
Work order: `docs/work-orders/WO-02-core-host-authority-boundary.md`<br>
Source baseline HEAD: `8285c8a63dcc471009bdaf90b96b5fb26e6804b8`<br>
Planning authority commit: `8285c8a63dcc471009bdaf90b96b5fb26e6804b8`<br>
Expected parent: `c264d5f5debd207278deacb703fa8e64f2b66c0c`<br>
Builder candidate HEAD: the commit containing this handoff; Independent QA must
resolve and pin that exact commit before review.

## Bounded result

WO-02 delivered the behavior-preserving Wrap Before Split boundary:

- `ContextCompilerCore` now owns current Store composition, lifecycle, command
  validation/orchestration, and internal compile telemetry mutation;
- `ContextCompilerCommandPort` is the stable dependency for MCP and future Host
  adapters;
- `ContextCompilerMcpService` is a thin lifecycle-owning adapter and retains
  Host-owned database environment compatibility;
- exactly nine accepted commands, response/error shapes, database behavior, and
  package exports remain compatible;
- current and absent authority classes are assigned in the Authority / Mutation
  Matrix without implementing a later work order.

This candidate does not implement WO-03A or any later Runtime capability.

## Baseline and repository authority

The frozen manifest is
`docs/inventory/WO-02/execution-baseline-manifest.md`. It records a clean `main`
worktree at `8285c8a63dcc471009bdaf90b96b5fb26e6804b8`, no submodules, the WO-01
accepted/QA ancestry, and unchanged package/lock/TypeScript configuration hashes.

During full regression, the accepted compile-telemetry concurrency fixture was
found to inject failures through private Store fields formerly owned by the MCP
service. Before modifying that previously unlisted fixture, the Builder amended
the work-order allowlist with the exact call-chain reason. The fixture now creates
a Core explicitly and injects the same commit/rollback boundary at the new owner;
production interfaces and assertions are unchanged.

The two high-concurrency startup protocol cases also received an explicit
15-second test timeout. They pass standalone in approximately 2.6 and 3.3 seconds,
but exceeded the prior 5-second default while running beside the repository's
heavy parallel evaluation suite. No assertion, iteration count, barrier, or
production timeout was weakened.

## Delivered paths

```text
docs/architecture/WO-02-core-host-authority-boundary.md
docs/handoffs/WO-02-core-host-authority-boundary.md
docs/inventory/WO-02/authority-mutation-matrix.md
docs/inventory/WO-02/execution-baseline-manifest.md
docs/work-orders/WO-02-core-host-authority-boundary.md
src/core.ts
src/index.ts
src/mcp-service.ts
test/core-boundary.test.ts
test/fixtures/compile-telemetry-boundary-worker.mjs
test/mcp-protocol.test.ts
```

No schema, migration, algorithm, reducer, Store implementation, evaluator,
configuration, dependency, official artifact, runtime flag, or Host path changed.

## Stable and compatibility surfaces

Stable:

- `ContextCompilerCore`;
- `ContextCompilerCommandPort`;
- the nine `CONTEXT_COMPILER_COMMANDS` and their current input/result contracts;
- Core research-ledger append/read library methods;
- explicit lifecycle ownership and idempotent close.

Compatibility/implementation-only:

- public Store, Reducer, extractor, compiler, and evaluator exports retained by
  `src/index.ts`;
- current MCP service names, constants, and types aliased to the Core contract;
- legacy `DSH_HOME` and current `CONTEXT_COMPILER_DB_PATH` resolution in the Host
  adapter.

Future Host adapters must not import the compatibility-only Store/Reducer/SQLite
surface.

## Preservation evidence

- Core boundary tests exercise health, Raw ingest, State prepare/apply/read,
  Headline/FTS recall, Context compile, research ledger access, reserved telemetry
  rejection, lifecycle, and adapter delegation.
- Existing MCP service tests pass without modification.
- Existing protocol tests prove exactly nine tools, sanitized errors, restart,
  package execution, concurrent schema startup/migration, Raw/Event idempotency,
  State conflict handling, and compile telemetry commit/rollback boundaries.
- Import scans show `src/mcp-service.ts` has no Store/Reducer/compiler/MCP-server
  imports and `src/core.ts` has no MCP server, provider, network, Host environment,
  UI, or sibling-project imports.
- Baseline diffs show no changes to package config, Store/schema source,
  evaluation source, or official artifacts.

## Builder checks

Final checks on the candidate worktree:

```text
npm test
  PASS — 30 files passed, 1 skipped; 477 tests passed, 1 skipped

npm run build
  PASS — tsc -p tsconfig.json

focused protocol/Core/service run
  PASS — 3 files, 22 tests

git diff --check
  PASS

exact command count/export parity
  PASS — nine commands in accepted order

forbidden import scans
  PASS — no matches
```

The first full-suite diagnostic exposed the moved private fixture injection and
the parallel-load timeout described above. Both were resolved within the amended
allowlist; the final full suite is green.

No remote model, network, credential, production database, destructive command,
or sibling Host repository was used or accessed.

## Known limits retained

- State schema initialization still has the WO-01 partial-DDL risk. Core closes
  successfully opened resources, but WO-02 does not introduce a new global schema
  transaction.
- Generic research `ACTION`/`OUTCOME` records are not a formal execution journal.
- Low-level exports remain callable for package compatibility until a separately
  authorized convergence/removal work order.
- No external Host implementation was inspected; Host-specific behavior remains
  unknown rather than inferred.
- ToolResult, Operation/Action authority, Verification, Response/Outbox,
  background mutation, Shadow Mode, shared namespace/stream revision, Raw
  Frontier, Takeover, Fact, and Snapshot remain unimplemented.

## Independent QA requirements

The Builder does not approve this candidate. Independent QA must:

1. pin the exact candidate commit containing this handoff and verify the fixed
   source baseline and ancestry;
2. verify every changed path is in the original or explicitly amended WO-02
   allowlist;
3. independently trace representative Raw/Event, State, Headline/FTS, compile
   telemetry, and research ledger calls from adapter/Core to physical writer;
4. verify the Authority / Mutation Matrix names transaction, validation,
   retry/idempotency, Host allowance/prohibition, compatibility path, and future
   owner for every required class;
5. confirm MCP exposes exactly nine unchanged tools and the adapter has no direct
   Store/Reducer/SQLite dependency;
6. confirm Core has no MCP/Host/provider/network/UI dependency and reserved
   telemetry cannot be forged through public research append;
7. reproduce `npm test`, `npm run build`, and the focused boundary/protocol tests;
8. inspect the test-fixture ownership move and timeout adjustment to ensure neither
   hides a production behavior regression;
9. verify config, schemas, algorithms, evaluation logic, and official artifacts
   are unchanged; and
10. write a separate `docs/qa/WO-02-core-host-authority-boundary.md` acceptance or
    rejection. QA must not begin WO-03A.
