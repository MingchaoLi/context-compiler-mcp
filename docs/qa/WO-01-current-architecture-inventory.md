# WO-01 Independent QA — Current Architecture Inventory

Result: **REJECTED**

- QA date: 2026-08-24
- Repository: `/Users/lmc/Documents/agent长期记忆/context-compiler-mcp`
- Branch at handoff: `main`
- Source baseline HEAD: `f618ed4af4b40bc51b5b3eb8fc19bf1e61c51f52`
- Source baseline parent: `b27b5300f3a6acba84d09f55e43fc93feeaf80f0`
- Pinned delivery HEAD: `d53a8879acb8568be14dc5706efea01ec5e50732`
- Delivery parent: `f618ed4af4b40bc51b5b3eb8fc19bf1e61c51f52`

This review is independent of the Builder conclusion. It validates the fixed
repository candidate and returns failures to the Builder without modifying any
Builder artifact or production implementation.

## Facts fixed before QA write

- `git rev-parse HEAD` returned the exact requested delivery HEAD
  `d53a8879acb8568be14dc5706efea01ec5e50732` before this file existed.
- The branch was `main` and the worktree was clean.
- The delivery is one commit whose only parent is the declared source baseline.
- The source baseline has the declared expected parent `b27b5300...`.
- `source_baseline_HEAD..delivery_HEAD` contains only eleven new files under
  `docs/inventory/WO-01/**` and the one Builder handoff at
  `docs/handoffs/WO-01-current-architecture-inventory.md`.
- No `src/`, `test/`, schema, configuration, dependency, or `evaluation/` path
  changed in the candidate. All new candidate files have regular-file mode
  `100644`.
- The baseline tree independently recounts to 467 tracked files: 19 `src/`, 34
  `test/`, 292 `evaluation/`, 115 `docs/`, and 7 repository-root files.
- The three recorded configuration SHA-256 values and their aggregate fingerprint
  reproduce exactly. No submodule revision is present.
- `ad94f9350482be37f1a38538cf6b624fb69a2b9a` is independently the last commit
  touching `src/` before the source baseline.

## Representative semantic recheck

The following Builder findings are supported by current source and representative
tests:

- **Raw / ledger:** `SqliteRawHistoryStore.ingest()` allocates a per-session
  sequence inside `BEGIN IMMEDIATE`, inserts append-only Raw, appends the reserved
  `EVENT` mirror on the same SQLite connection, and commits both together. The
  reopen, source retry, append-only trigger, and injected mirror failure tests
  support durability, idempotency, and rollback claims.
- **State:** preparation captures revision, selected Raw, visible State, relations,
  an immutable snapshot, and a SHA-256 fingerprint without advancing the State
  revision. Apply parses the complete delta before mutation, then revalidates the
  snapshot and expected revision inside the reducer transaction. State rollback,
  stale revision, empty delta, immutable preparation, and concurrent-update tests
  support the recorded authority and local crash behavior.
- **Retrieval / Context:** operational compilation uses a fixed recent-user-turn
  window and a bounded preceding candidate window. BM25 is in memory; Dense is used
  only with complete compatible caller-provided vectors; verified-failure recovery
  expands the bounded policy. Assembly performs recursive `DEPENDS_ON` closure and
  persists no compiled Context body. These are not Raw Frontier, Event Ripple, or
  an immutable Attempt Snapshot.
- **Compile telemetry:** the service opens a ledger `BEGIN IMMEDIATE` boundary
  before State/Raw/Ledger reads and appends the compile trace plus all hit rows
  before committing. The rollback and cross-process first-origin tests support the
  writer-fence and all-or-none telemetry claims. Generic public `ACTION` and
  `OUTCOME` rows remain research records without a formal action lifecycle.
- **Response / delivery:** the MCP server serializes the synchronous service result
  directly into `CallToolResult`. There is no response, outbox, delivery attempt,
  acknowledgement, lease, or reconciliation table/symbol in `src/`. The sequence
  diagram correctly marks Main Agent, external Tool Executor, live verification,
  and durable delivery as `NOT PRESENT`.
- **Identity / leakage / Unknown:** current Raw and ledger sequences, State revision,
  source keys, operation-scoped compile identity, and preparation fingerprints are
  useful primitives but do not form the target shared revision substrate. Runtime
  imports are provider-neutral. `DSH_HOME` is a bounded legacy configuration
  fallback. Host-side tool, compaction, and delivery behavior correctly remains
  `UNKNOWN` because sibling host repositories were out of scope.

The required writer/reader classes, representative runtime sequences, required
crash-gap rows, identity classes, Core/Host questions, and final conclusion format
are present. No fictional target runtime flow was found in the current sequence.

## Blocking deviations

### 1. Child-WO routing contradicts the repository-authoritative Umbrella Plan

**Fact:** `docs/inventory/WO-01/v3.1.1-gap-analysis.md` assigns:

- Takeover/Enrichment to `WO-03B`;
- Operation/Action lifecycle to `WO-06`;
- live Verification/Recovery to `WO-07`; and
- Shadow runtime/promotion isolation to `WO-09`.

**Independent evidence:** the Umbrella registry assigns Ledger High-water/Hot Raw
Replay to WO-03B, Semantic Takeover/Enrichment to WO-04, Evidence Scope/Ripple to
WO-06, Operation/Attempt/Action to WO-07, Verification/Recovery/Outbox to WO-08,
and Shadow dogfood/routing to WO-10. It additionally states that WO-09 is a
verification-only crash/concurrency/replay matrix and must not first implement
Shadow isolation or another missing capability.

**Deviation / risk:** this is not a harmless numbering typo. The gap map is a
handoff input and currently redirects capability ownership across frozen dependency
boundaries, including assigning first Shadow implementation to a work order that
explicitly forbids it. A lower-level inventory document cannot redefine the
Umbrella registry. The v3.1.1 gap analysis is therefore not reliable as a direct
implementation-routing input.

### 2. State-schema initialization crash behavior is not mapped

**Fact:** the persistence map groups all store initialization under a row saying
transactional DDL rolls back before commit. `raw-store.ts`, `experience-ledger.ts`,
and `recall.ts` explicitly open migration transactions. `state-store.ts#migrate`,
however, calls one multi-statement `database.exec()` without `BEGIN`, and
`initializeSqliteConnection()` supplies retries but no enclosing transaction.

**Independent evidence:** an isolated `:memory:` `DatabaseSync.exec()` probe ran two
DDL statements without `BEGIN`, deliberately failed the second, and observed the
first table still present:

```json
{"code":"ERR_SQLITE_ERROR","first_statement_persisted_after_second_failed":true}
```

No file or production database was created or modified by this probe.

**Deviation / risk:** a failure or crash between State DDL statements can leave a
partially initialized State schema. A later constructor may be able to complete the
idempotent `CREATE IF NOT EXISTS` sequence, but that actual partial-commit and
recovery behavior is absent from the transaction/crash map. WO-01 requires current
persistence boundaries and crash behavior, not only the transactional cases.

## Acceptance decision

Failed acceptance criteria:

- the v3.1.1 Gap Analysis must remain aligned with repository authority and be a
  reliable downstream work-order input;
- all persistence actions and current crash behavior must be described from source
  evidence; and
- the inventory must be independently reusable without correcting material routing
  or transaction assumptions first.

All other sampled areas above passed this QA review. The two failures are bounded
documentation defects; they do not assert a new production-source regression.

The candidate is **REJECTED** and returned to the Builder. The Builder should make
an append-only fix commit correcting the Child-WO routing and recording the actual
State initialization partial-DDL/recovery behavior, then provide a new fixed
delivery HEAD for independent re-QA. QA did not repair the Builder output and did
not start WO-02 or WO-03A.

## Commands and execution boundary

Representative read-only checks included:

```text
cat AGENTS.md
sed/cat docs/PROJECT_STATE.md docs/ROADMAP.md and the sole current WO-01
git rev-parse HEAD
git branch --show-current
git status --porcelain=v1 --untracked-files=all
git merge-base --is-ancestor <source> <delivery>
git log --format=... <source>..<delivery>
git diff --name-status/--summary/--numstat/--check <source>..<delivery>
git ls-tree -r --name-only <source>
shasum -a 256 package.json package-lock.json tsconfig.json
rg/nl/sed over the routed Contract, Umbrella, source, tests, and Builder artifacts
node --input-type=module -e <isolated in-memory SQLite DDL atomicity probe>
```

No network, remote model, destructive command, production database, sibling host
repository, or external host code was used. `npm test` and `npm run build` were not
run: the delivery is docs-only, representative source/test evidence was inspected,
and no artifact-producing runtime check was necessary beyond the isolated in-memory
probe.

## Fresh independent re-QA — 2026-08-24

### Result: ACCEPTED

The original **REJECTED** record above is retained verbatim. Fresh independent
re-QA accepts the append-only fixed candidate:

```text
source_baseline_HEAD:       f618ed4af4b40bc51b5b3eb8fc19bf1e61c51f52
original_delivery_HEAD:     d53a8879acb8568be14dc5706efea01ec5e50732
retained_QA_REJECTED_HEAD:  3cde42dace9dd5773525731d35f907b9d5752424
fixed_candidate_HEAD:       ac6056c8c0ba2057866642d6785c1aee272af81b
fixed_candidate_parent:     3cde42dace9dd5773525731d35f907b9d5752424
branch_at_re-QA:             main
```

Before this QA append, `HEAD`, its parent, the branch, and an empty worktree were
mechanically pinned. The fixed candidate therefore has the expected QA-return
parent and no unreviewed working-tree input.

### Facts and independent verification evidence

#### Three-layer history and allowlist

- `source_baseline_HEAD..original_delivery_HEAD` remains the original docs-only
  delivery: eleven files under `docs/inventory/WO-01/**` plus the Builder handoff.
- `original_delivery_HEAD..retained_QA_REJECTED_HEAD` contains only the independent
  QA record at `docs/qa/WO-01-current-architecture-inventory.md`.
- `retained_QA_REJECTED_HEAD..fixed_candidate_HEAD` modifies only the three
  inventory documents named by the rejection and the Builder handoff:
  `v3.1.1-gap-analysis.md`, `persistence-transaction-map.md`,
  `crash-gap-matrix.md`, and the WO-01 handoff.
- Source, schema, tests, evaluation assets, configuration, and official artifacts
  are unchanged across the delivery chain. `git diff --check` passes for every
  layer.

#### v3.1.1 gap routing

The corrected gap table was checked item by item against the Umbrella Registry,
not against the Builder's conclusion:

- WO-02 owns the Core/Host authority matrix.
- WO-03A owns namespace/stream/shared revision/CAS/transaction substrate and the
  `shadow:<experiment_id>` namespace substrate.
- WO-03B owns ledger high-water, committed Frontier position, and Hot Raw replay.
- WO-04 owns State revision, Fact/Relation authority, and Semantic
  Takeover/Enrichment.
- WO-05 owns immutable `ContextSnapshot` and `AttemptStarted`.
- WO-06 owns Evidence Scope/Horizon, one-hop Ripple, and `EvidenceBundle`.
- WO-07 owns Operation/Attempt/Action, `ToolResult`, interruption, idempotency, and
  reconciliation.
- WO-08 owns live verification, bounded recovery, `ResponsePrepared`, Outbox, and
  delivery.
- WO-09 owns full crash/concurrency/replay verification, including shadow-isolation
  tests; it is explicitly verification-only and does not first implement shadow
  storage or routing.
- WO-10 owns shadow routing, side-by-side dogfood, and promotion evidence.

The shadow split is consequently explicit: substrate in WO-03A, tests in WO-09,
and routing/dogfood in WO-10. The Umbrella Registry does not allocate Background
Maintenance authority to a child work order, so the inventory correctly preserves
it as `UNASSIGNED / UNKNOWN` rather than inventing an owner.

#### State schema initialization and crash behavior

The corrected persistence and crash maps match the implementation:

- `StateStore#migrate` executes a multi-statement `CREATE ... IF NOT EXISTS` batch
  without an outer transaction.
- `initializeSqliteConnection` applies PRAGMAs and retry handling but adds no
  migration transaction.
- A fresh no-file, in-memory SQLite probe forced a later statement to fail and
  observed that the earlier DDL remained present:
  `{"code":"ERR_SQLITE_ERROR","first_statement_persisted_after_second_failed":true}`.
- On constructor failure, `StateStore` closes the connection and rethrows. A later
  compatible reopen can idempotently replay the `CREATE IF NOT EXISTS` batch and
  complete missing objects; an incompatible partial schema is not automatically
  repaired.
- No schema-version or schema-completion marker exists. The documents therefore do
  not overstate initialization as atomic or durably complete.

This accurately records the partial-DDL window, constructor failure behavior,
compatible idempotent reopen, and the absence of a completion marker.

#### Regression of the previously accepted inventory

The eight previously accepted core inventory documents are byte-identical between
the original delivery and the fixed candidate. The `src`, `test`, and `evaluation`
Git trees are also identical between the source baseline and fixed candidate.
Accordingly, the first-round source/test traces for Raw/Event atomic mirroring,
State preparation/application, retrieval and assembly, compile telemetry,
response/delivery absence, identity, crash gaps, Core/Host leakage, and Unknown
classification remain valid and were not disturbed by the bounded documentation
fix.

The corrected documents now distinguish implemented facts, gaps, and unknown or
unassigned authority sufficiently for direct use as WO-02 and WO-03A planning
inputs. Acceptance of this inventory does not authorize starting either work
order.

### Deviations, risks, and decision

No acceptance-blocking deviation remains. The documented State initialization
partial-DDL window and lack of a schema completion marker remain production risks,
but they are accurately classified as current behavior/gaps rather than silently
treated as solved. Background Maintenance ownership likewise remains deliberately
unassigned pending an explicit registry decision.

The fixed candidate is **ACCEPTED** for WO-01. This verdict accepts the inventory,
not any future implementation, host integration, or follow-on work order.

### Fresh re-QA commands and execution boundary

Representative checks included `git rev-parse`, `git branch --show-current`,
`git status --porcelain`, layered `git log`/`git diff`/`git diff --check`, Git tree
and blob comparisons, line-level `rg`/`nl`/`sed` inspection of the routed Contract,
Umbrella Registry, State migration source, helper, tests, and fixed Builder
documents, plus the isolated in-memory SQLite probe described above.

No network, remote model, destructive command, production database, sibling host
repository, or external host code was used. `npm test` and `npm run build` were not
run because the fixed candidate contains no source change and those checks were
unnecessary for this documentation-only re-QA.
