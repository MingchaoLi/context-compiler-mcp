# WO-01 Builder Handoff — Current Architecture Inventory

Status: **BUILDER FIX COMPLETE / AWAITING INDEPENDENT RE-QA**<br>
Work order: `docs/work-orders/WO-01-current-architecture-inventory.md`<br>
Source baseline HEAD: `f618ed4af4b40bc51b5b3eb8fc19bf1e61c51f52`<br>
Expected parent: `b27b5300f3a6acba84d09f55e43fc93feeaf80f0`<br>
Original delivery HEAD: `d53a8879acb8568be14dc5706efea01ec5e50732`<br>
Independent QA return commit: `3cde42dace9dd5773525731d35f907b9d5752424`<br>
Fixed candidate HEAD: the commit containing this updated handoff; Independent re-QA
must resolve and pin that commit before review.

## Bounded result

The Builder inventoried the frozen source baseline without changing production
implementation, schema, tests, configuration, dependencies, runtime flags, or
official artifacts. The result describes the current repository rather than
assuming target v3.1.1 capabilities exist.

The Builder conclusion is:

- current architecture: **partially coupled**;
- the v3.1.1 subject architecture and implementation order are sufficiently clear;
- the smallest safe next child work order is **WO-02**;
- WO-02 must not start until this work order passes independent QA and receives
  explicit authorization.

## Append-only QA-return fix

Independent QA rejected the original delivery for two bounded documentation
defects. This fix preserves the rejection record and changes no production path:

1. `v3.1.1-gap-analysis.md` now transcribes the exact Umbrella Child Work Order
   Registry. It separates WO-03A shadow namespace substrate, WO-09 isolation tests,
   and WO-10 shadow routing/dogfood; it marks unassigned background authority as
   `UNASSIGNED / UNKNOWN` rather than inventing ownership.
2. `persistence-transaction-map.md` and `crash-gap-matrix.md` now distinguish the
   explicitly transactional Raw/Experience/Recall migrations from State schema
   initialization, whose multi-statement `database.exec()` has no outer transaction
   and can leave compatible partial DDL for a later idempotent reopen to complete.

The original source baseline and delivery identity remain fixed. The QA return is
an audit commit, and this Builder change is a new append-only fixed candidate rather
than an amendment or redefinition of the original delivery.

## Execution baseline

The frozen manifest is
`docs/inventory/WO-01/execution-baseline-manifest.md`. It records:

- repository path and `main` branch;
- source baseline and expected parent;
- clean starting worktree and no submodules;
- configuration fingerprints;
- inventory start time; and
- the repository-authority Gate.

Normal WO-01 documentation is not permitted to redefine that source baseline.

## Delivered artifacts

Required WO-01 maps and analyses:

1. `docs/inventory/WO-01/current-architecture-inventory.md`
2. `docs/inventory/WO-01/current-runtime-sequence.md`
3. `docs/inventory/WO-01/data-writer-reader-map.md`
4. `docs/inventory/WO-01/persistence-transaction-map.md`
5. `docs/inventory/WO-01/revision-identity-inventory.md`
6. `docs/inventory/WO-01/crash-gap-matrix.md`
7. `docs/inventory/WO-01/core-host-leakage-map.md`
8. `docs/inventory/WO-01/v3.1.1-gap-analysis.md`
9. `docs/inventory/WO-01/phase1-recommendation.md`

Supporting audit evidence:

- `docs/inventory/WO-01/execution-baseline-manifest.md`
- `docs/inventory/WO-01/inspection-ledger.md`

## Inspection method and coverage

- Stage A mechanically indexed all 467 tracked files, entrypoints, schemas,
  migrations, exports/imports, and test topology.
- Stage B deeply inspected the repository authority, routed architecture contracts,
  runtime/storage paths, representative behavioral tests, and official evidence
  manifests listed in the inspection ledger.
- Stage C inspected only the three commits needed to establish the current authority
  import and source provenance: `f618ed4`, `b27b530`, and `ad94f93`.
- Paths not deeply inspected and the reason for each exclusion are recorded in
  `inspection-ledger.md`.
- Sibling host repositories were neither read nor modified.

## Highest-risk findings

1. Generic Experience Ledger `ACTION`/`OUTCOME` records are research evidence, not
   a durable Operation/Attempt/Action side-effect lifecycle.
2. Public low-level stores/reducer surfaces plus distributed schema ownership leave
   mutation authority insufficiently enclosed.
3. Current session/turn identity, fixed recent-N assembly, and store-local revisions
   cannot substitute for Raw Frontier, immutable Context Snapshot, or the target
   shared revision substrate.

Reusable foundations include atomic Raw/Event mirroring, deterministic
revision-guarded State transitions, provider-neutral runtime boundaries, bounded
retrieval, and replay-oriented tests.

## Builder checks

Checks performed on the candidate documentation:

- branch, source baseline HEAD, expected parent, and configuration hashes rechecked;
- required deliverable existence and final conclusion format checked;
- worktree paths checked against the WO-01 allowlist;
- source/schema/test/config/official artifacts checked for baseline drift;
- Markdown whitespace checked with `git diff --check` after staging;
- staged path set and staged diff summary checked before commit.

`npm test` and `npm run build` were not run. This is a documentation-only inventory
with no source change, and both commands can generate build/cache or temporary
database artifacts; WO-01 permits such diagnostics only in an isolated copy. No
runtime diagnostic was needed to establish the documented facts.

No remote model, network access, destructive command, production database, or
external host repository was used.

## Independent QA requirements

Independent QA must perform its own review and append a fresh re-QA section to
`docs/qa/WO-01-current-architecture-inventory.md`. The Builder does not approve this
work or overwrite the retained rejection.

At minimum, QA should:

1. pin and record the exact fixed candidate HEAD containing this updated handoff;
2. verify the source baseline is exactly
   `f618ed4af4b40bc51b5b3eb8fc19bf1e61c51f52`;
3. verify the original `source_baseline_HEAD..original_delivery_HEAD` still contains
   only `docs/inventory/WO-01/**` and this handoff, the next commit is the retained
   QA return, and `QA_return..fixed_candidate_HEAD` changes only the three corrected
   inventory documents plus this handoff;
4. independently confirm every capability route against the exact Umbrella
   Registry rather than the Builder summary;
5. reproduce or otherwise confirm the State initialization partial-DDL behavior
   and its documented recovery limit;
6. independently trace representative Raw, State, retrieval, ledger, and response
   claims to source and tests;
7. confirm absent capabilities are labeled `NOT PRESENT` or `UNKNOWN`, rather than
   inferred from target architecture;
8. confirm the Mermaid sequence contains no fictional Main Agent, external Tool
   Executor, live verification, or Outbox flow;
9. confirm all required crash gaps, writer/reader classes, identity classes, and
   Core/Host leakage questions are covered; and
10. accept or reject WO-01 without relying on the Builder's recommendation.

## Known limits retained for later work

- No external host implementation was inspected, so host-side capabilities remain
  unknown rather than globally absent.
- WO-01 did not select the final namespace/stream schema, revision allocator,
  transaction substrate, snapshot schema, retriever, graph technology, or verifier.
- Audit Ripple remains a non-normative research observation and did not expand or
  block the work order.
- No WO-02 or WO-03A implementation has begun.
