# WO-02 Independent QA — Core / Host Authority Boundary

Date: 2026-08-24
Result: **REJECTED**
QA role: Independent QA; no Builder artifact was repaired or approved by its
author.

## Pinned candidate

```text
branch:                         main
source_baseline_HEAD:           8285c8a63dcc471009bdaf90b96b5fb26e6804b8
planning_authority_commit:      8285c8a63dcc471009bdaf90b96b5fb26e6804b8
planning_authority_parent:      c264d5f5debd207278deacb703fa8e64f2b66c0c
builder_candidate_HEAD:         c3c82099bf28eb2f865021a9329138325feb1d26
builder_candidate_parent:       8285c8a63dcc471009bdaf90b96b5fb26e6804b8
worktree_before_QA_write:       clean
submodules:                     none
```

Git independently confirmed both parent links, the baseline-to-candidate ancestry,
the `main` branch, commit object identities, and an empty tracked/untracked
worktree before this record was written.

The planning-authority layer changes only `docs/PROJECT_STATE.md`,
`docs/ROADMAP.md`, and the new WO-02 work order. The Builder layer changes eleven
paths, all within the original WO allowlist or the work-order amendment for
`test/fixtures/compile-telemetry-boundary-worker.mjs`. The amendment records the
fixture's owner-migration call chain; its diff moves the same private failure
injection from the service-owned Store reference to the Core-owned Store reference.

## Independently verified facts

### Stable boundary and representative mutation traces

The candidate does create a model- and Host-independent `ContextCompilerCore` and
turns `ContextCompilerMcpService` into a command-port adapter. Representative
traces were followed to their physical writers rather than accepted from the
handoff:

- MCP requests are filtered by the unchanged server tool registry, passed to
  `ContextCompilerMcpService.call`, delegated to `ContextCompilerCore.call`, and
  only then reach a selected Store.
- `ingest_event` reaches `SqliteRawHistoryStore.ingest`. Input normalization occurs
  before `BEGIN IMMEDIATE`; the Raw row and internal `EVENT` ledger mirror are
  written before the same commit and roll back together. Existing
  `source_event_id` retry compatibility remains in that transaction.
- `prepare_state_update` reaches `StateUpdateCoordinator` and records the immutable
  fingerprint/expected-revision envelope in a State transaction. `apply_state_delta`
  revalidates preparation identity, current evidence fingerprint, and expected
  revision before `StateReducer.applyAtRevision`; the existing State transaction
  and revision allocation are unchanged.
- `create_headline` reaches `SqliteHistoryRecallStore.createHeadline`; the Headline
  row and FTS projection remain inside the same `BEGIN IMMEDIATE`/commit/rollback
  boundary. Exact and keyword recall remain reads.
- `compile_context` keeps all State/Raw/ledger reads, deterministic assembly, the
  reserved `CONTEXT_COMPILE` trace, and `RETRIEVAL_HIT` records inside the existing
  database-wide telemetry boundary. The worker fixture injects at the same
  physical trace and Raw commit boundaries after ownership moved to Core.
- `appendExperienceRecord` reaches the public research-ledger append path and
  retains `(session_id, source_key)` retry/idempotency. Reserved kinds and
  `context-compile/` or `retrieval-hit/` prefixes are rejected, so public research
  append cannot forge internal telemetry. Research `ACTION` remains an observation,
  not a formal execution journal.

Core construction owns the four current Stores. Its failure path closes every
successfully constructed Store, its normal close attempts every Store and reports
a stable storage failure if any close fails, and repeated Core/service close is
idempotent. The WO-01 State schema partial-DDL risk remains documented and was not
silently changed.

### MCP, dependency direction, and compatibility

- The built package independently reported exactly nine commands in the accepted
  order, and the service capability list was identical:
  `health`, `ingest_event`, `compile_context`, `get_state`,
  `prepare_state_update`, `apply_state_delta`, `create_headline`, `recall_exact`,
  and `recall_keyword`.
- Full stdio protocol regression passed tool schemas, return shapes, sanitized
  errors, restart/lifecycle behavior, production-only package execution, and
  exactly-nine enumeration.
- `src/mcp-service.ts` imports only `node:path` and `./core.js`; it has no direct
  Store, Reducer, compiler, SQLite, or MCP-server dependency.
- `src/core.ts` imports current compiler/Store/coordinator modules but no MCP
  server, Host implementation, provider SDK, network client, UI, delivery code,
  environment resolver, or sibling-project code.
- `src/index.ts` retains all previous exports and adds the Core surface; no prior
  package-root export was deleted. Existing MCP service names and types remain
  aliases over the structurally compatible Core contract.
- The optional extractor path remains explicit proposal-only behavior. No provider,
  network, credential, Host, or `host_manifest` implementation was added.

### No prohibited drift

The baseline-to-candidate diff does not change `package.json`, `package-lock.json`,
`tsconfig.json`, any Store/schema/migration source, reducer, State algorithm,
assembler/retrieval algorithm, runtime updater, extractor, evaluator, evaluation
tree, sealed evidence, or official artifact. The three configuration SHA-256
values exactly match the Execution Baseline Manifest. `git diff --check` passed.

## Dynamic verification

All dynamic checks used repository tests and their isolated temporary directories;
no production database was opened.

```text
focused Core/service/protocol:
  3 files passed; 22 tests passed

npm test:
  30 files passed, 1 skipped
  477 tests passed, 1 skipped

npm run build:
  PASS — tsc -p tsconfig.json
```

The two protocol tests amended from the default five-second timeout to fifteen
seconds were separately reviewed. Their diffs change only the per-test timeout;
iteration counts, barriers, assertions, production timeouts, and failure behavior
are unchanged. They completed in approximately 2.5 and 3.0 seconds in the focused
run, and approximately 6.0 and 5.6 seconds under the full parallel suite. This is
consistent with parallel-suite load and does not conceal an observed product
regression.

## Acceptance blockers

### B1 — Future authority routing contradicts the Umbrella Registry

The required Authority / Mutation Matrix is not a safe authority input for later
work orders. Its `Future WO owner` column contains several stale or invented routes:

- Raw Frontier/takeover is assigned to `WO-03B/03C`; no WO-03C exists, and
  Semantic Takeover belongs to WO-04.
- State item/relation evolution is assigned to `WO-03A/03E`; no WO-03E exists, and
  semantic State/Fact/Relation authority belongs to WO-04 after the WO-03A
  substrate.
- compiled Context Snapshot is assigned to `WO-03E`; the Registry assigns the
  immutable ContextSnapshot contract to WO-05.
- research-ledger evolution toward formal Operation/Action and the absent
  ToolResult/Operation-Action journal are assigned to WO-05; the Registry assigns
  Operation/Attempt/Action and ToolResult durability to WO-07.
- optional extractor takeover is assigned to `WO-03C/03D`; neither work order
  exists, and Semantic Takeover/Enrichment belongs to WO-04.
- Response/Outbox is assigned to WO-06; it belongs to WO-08.
- Background mutation and Shadow comparison are combined and assigned to
  `WO-07/WO-08`. Background Maintenance has no allocated Child WO and must remain
  `UNASSIGNED / UNKNOWN`. Shadow is split across WO-03A substrate, WO-09
  verification-only isolation tests, and WO-10 routing/dogfood evidence.

These conflicts are mechanical: Umbrella Registry sections WO-03A through WO-10
state the owners directly, and its document-authority rule forbids a lower-level
artifact from redefining them. The failure is material because WO-02 explicitly
requires future ownership for missing authority and is the dependency input to
WO-03A and later work.

### B2 — Session authority is not named or fully owned

For mutable `sessions` rows, the matrix states only “Implicit in mutation
commands,” “Current Store schema/writers,” and “Selected Store transaction.” It
does not name one logical authority/internal writer, identify the actual
`INSERT OR IGNORE` idempotency owner, or explicitly describe retry ownership.
This does not satisfy the WO acceptance requirement that every current mutable
table/artifact have one named authority plus explicit transaction, validation,
and retry/idempotency ownership. Multiple current physical Store writers may be
recorded as implementation facts, but the logical Core authority and each
physical/idempotency role still need to be explicit.

## Decision and return path

The source refactor, protocol compatibility, transaction preservation, fixture
move, timeout amendment, tests, and build passed this review. No production-source
counterexample was found. Nevertheless, the mandatory Authority / Mutation Matrix
fails two acceptance requirements and conflicts with the authoritative Umbrella
Registry, so the fixed candidate cannot be accepted as a correct WO-03A planning
input.

The Builder candidate is **REJECTED**. Return it for an append-only fix commit that
corrects the matrix ownership routes and names the session authority/idempotency
roles. Independent QA must then pin the new fixed candidate and re-check the
bounded documentation change. QA did not modify Builder source, tests, work order,
handoff, architecture, inventory, project state, or roadmap, and did not start
WO-03A.

## Execution boundary

Representative commands included `cat`/`sed`/`nl`/`rg` over the routed repository
files, `git rev-parse`, `git show`, ancestry checks, layered `git diff` and
`git diff --check`, configuration hashing, import/export scans, the focused Vitest
run, `npm test`, `npm run build`, and a built-package command parity probe.

No network, remote model, production database, destructive command, credential,
sibling Host repository, or external Host source was accessed.

## Fresh append-only independent re-QA — 2026-08-24

### Result: ACCEPTED

The original **REJECTED** record above is retained verbatim. Fresh independent
re-QA accepts the append-only fixed candidate:

```text
source_baseline / planning_authority: 8285c8a63dcc471009bdaf90b96b5fb26e6804b8
original_builder_candidate:           c3c82099bf28eb2f865021a9329138325feb1d26
retained_QA_rejection:                b9239360ffe5ded5567d1b7fb736db1b2e1fcc2e
fixed_builder_candidate:              a03a059d9c0823d0500f42659e6be891558f12be
fixed_candidate_parent:               b9239360ffe5ded5567d1b7fb736db1b2e1fcc2e
branch_at_re-QA:                      main
worktree_before_re-QA_write:          clean
```

`HEAD`, its single parent, every retained commit in the chain, ancestry, branch,
and an empty tracked/untracked worktree were mechanically pinned before this
append.

### Fixed-candidate scope

`retained_QA_rejection..fixed_builder_candidate` modifies exactly two Builder
documents:

```text
docs/handoffs/WO-02-core-host-authority-boundary.md
docs/inventory/WO-02/authority-mutation-matrix.md
```

The retained QA file is unchanged in the fixed candidate. No source, test,
schema/migration, configuration, dependency, evaluation, sealed evidence, or
official artifact changed. The `src`, `test`, and `evaluation` Git tree object IDs
are byte-identical between the original Builder candidate and the fixed candidate,
and `git diff --check` passes for the documentation fix.

### B1 closure — Umbrella Registry ownership

The fixed Authority / Mutation Matrix was compared directly with the authoritative
Umbrella Child Work Order Registry:

- no WO-03C, WO-03D, or WO-03E route remains in the matrix;
- WO-03A owns namespace/stream/revision/transaction and shadow namespace
  substrate;
- WO-03B owns ledger high-water and Hot Raw replay;
- WO-04 owns semantic State/Fact/Relation authority, Takeover/Enrichment,
  contiguous Frontier behavior, and Compaction Artifact identity;
- immutable ContextSnapshot and replay identity are assigned to WO-05;
- formal Operation/Attempt/Action and ToolResult durability are assigned to
  WO-07;
- Verification/recovery, objective Outcome/Feedback eventization, Response, and
  Outbox are assigned to WO-08;
- Background mutation is a separate row and remains `UNASSIGNED / UNKNOWN` because
  the current Registry allocates no Child WO;
- Shadow is explicitly split into WO-03A substrate, WO-09 verification-only
  isolation tests, and WO-10 routing/dogfood/comparison evidence.

Compile/hit telemetry evolution, evaluation changes, artifact rewriting, and
other unallocated research-record migration also remain `UNASSIGNED / UNKNOWN`
rather than inventing a work-order owner. The matrix now follows the Umbrella
authority hierarchy and is safe as a routing input for later planning.

### B2 closure — session authority and physical writers

The corrected `sessions` row was checked against the unchanged implementation:

- `ContextCompilerCore` is named as the single logical mutation-command authority;
  low-level Store exports are explicitly compatibility paths rather than future
  Host contracts.
- The actual internal physical ensure-session writers are identified: Raw ingest,
  State preparation/item/revision writes, and Experience Ledger append. Recall
  does not create a parallel session authority.
- Raw ingest performs `INSERT OR IGNORE` after its `BEGIN IMMEDIATE`; State
  `ensureSession` is reachable only inside the selected State transaction; public
  ledger append uses its own `BEGIN IMMEDIATE`, while internal EVENT/telemetry
  append inherits the enclosing Raw or telemetry transaction.
- Core/coordinator input validation and the selected Store validation occur before
  or inside the owned mutation path. Every Store defines the shared session id as
  non-empty `TEXT PRIMARY KEY`; SQLite primary-key uniqueness plus
  `INSERT OR IGNORE` owns physical idempotency.
- Retry ownership remains with the selected existing command contract:
  `source_event_id` compatibility for Raw, preparation/fingerprint/expected
  revision for State, and `(session_id, source_key)` compatibility for the ledger.

The row therefore distinguishes the single logical authority from multiple
current implementation writers while naming transaction, validation,
idempotency, retry, Host prohibition, and compatibility responsibilities. B2 is
closed without changing schema or runtime behavior.

### Regression and dynamic-test decision

The original Independent QA already ran, on the byte-identical source/test tree:

```text
focused Core/service/protocol: 3 files passed; 22 tests passed
npm test:                     30 files passed, 1 skipped;
                              477 tests passed, 1 skipped
npm run build:                PASS — tsc -p tsconfig.json
```

That QA also independently verified exactly nine MCP tools, protocol/error and
lifecycle compatibility, public exports, adapter/Core import boundaries,
representative adapter-to-Core-to-writer transactions, the private fixture move,
and the two 15-second timeout changes. The rejection was limited to B1 and B2
documentation defects.

This re-QA did not rerun runtime tests or build. The risk basis is mechanical:
the return fix changes only the two documents above, while `src`, `test`, package
configuration, and evaluation artifacts are byte-identical to the already tested
candidate. Repeating artifact-producing checks cannot exercise either corrected
documentation claim and would add no new behavior-preservation evidence.

### Decision

Both retained rejection blockers are closed, no new acceptance-blocking deviation
was found, and the fixed candidate is **ACCEPTED** for WO-02. State partial-DDL,
compatibility-only low-level exports, unallocated Background authority, and
unimplemented WO-03A+ capabilities remain explicitly recorded limits; acceptance
does not claim they are implemented or authorize QA to begin WO-03A.

Fresh re-QA used only read-only Git/diff/tree comparisons and routed repository
source/document inspection before this QA append. No network, remote model,
production database, destructive command, sibling Host repository, or external
Host source was accessed.
