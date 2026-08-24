# WO-01 Phase 1 Recommendation

Status: Builder recommendation<br>
Source baseline: `f618ed4af4b40bc51b5b3eb8fc19bf1e61c51f52`

## Recommendation

Proceed next with **WO-02: Core/Host boundary and authority matrix**. No source
correctness defect discovered by WO-01 requires a prerequisite implementation work
order, and no evidence justifies expanding into a host integration or provider
selection.

WO-02 should be a behavior-preserving boundary work order. Its result should make
ownership explicit before WO-03A introduces shared revision and Raw Frontier
concepts.

## Why WO-02 is the smallest safe next step

The baseline already has durable and tested primitives, but four properties make
direct feature expansion unsafe:

1. low-level stores and the reducer are public integration surfaces;
2. schema and transaction ownership are distributed across store-specific SQLite
   connections;
3. generic ledger `ACTION`/`OUTCOME` entries can be mistaken for a formal execution
   lifecycle; and
4. session/turn identity and current revisions do not define the target namespace,
   stream, or cross-substrate revision domain.

Adding Raw Frontier, Facts, Context Snapshots, or Action lifecycle records before
settling these boundaries would multiply competing writers and ambiguous recovery
rules.

## Proposed WO-02 result

WO-02 should produce a repository-authoritative contract that:

- names the Core-owned canonical data and the only allowed writer for each current
  substrate;
- names Host-owned responsibilities without importing host code;
- defines stable command/query and adapter interfaces for future hosts;
- distinguishes research ledger records from formal future execution records;
- encloses current mutations behind explicit Core services while preserving current
  behavior;
- assigns schema initialization, migration, transaction, and crash-recovery
  ownership; and
- documents the bounded legacy `DSH_HOME` fallback as compatibility only.

## Explicit non-goals for WO-02

- No Main Agent or model-provider selection.
- No desktop UI, orchestration framework, messaging, packaging, or host code.
- No Raw Frontier, Takeover, Fact schema, Context Snapshot, Action lifecycle,
  Outbox, shadow runtime, or background-worker implementation.
- No change to retrieval quality, default recent-N behavior, or offline evaluation
  claims unless necessary to preserve compatibility under the new boundary.
- No migration that assigns target semantics to existing identifiers without an
  explicit later work order.

## Suggested acceptance outline

1. Every existing mutable table and durable artifact has exactly one named writer
   authority and explicit readers.
2. Public stable commands can perform all supported mutations without a host
   importing store internals.
3. Existing MCP behavior and replay semantics remain unchanged.
4. Core code has no host or provider dependency; adapters are dependency-inverted.
5. Schema and transaction ownership is explicit enough for WO-03A to specify a
   shared revision substrate.
6. Source changes, if any, pass the work-order checks plus `npm test` and
   `npm run build`.

## Inputs WO-02 must preserve

- Raw append plus Experience Ledger `EVENT` mirror atomicity.
- Compile writer fence and transactional retrieval trace/hit persistence.
- State prepare fingerprint/revision revalidation and retry conflict behavior.
- Headline/FTS atomicity and exact-recall fallback.
- Offline evaluation and sealed-evidence reproducibility.
- Provider-neutral Core and optional explicit local subprocess extraction.

## Handoff into WO-03A

WO-02 should leave WO-03A with an authority/mutation matrix, stable Core interfaces,
and transaction ownership—not with a guessed revision design. WO-03A should then
choose and prove namespace/stream identity, shared revision rules, Raw Frontier
position, compare-and-commit semantics, migration behavior, and replay invariants.

## Gate decision

WO-01 finds the architecture plan sufficiently clear to continue in the published
order. The Gate is **GO for independent QA of WO-01**, followed—only after
acceptance and explicit authorization—by WO-02. It is **not** authorization to start
WO-02 automatically.
