# WO-04C Transaction Composition and Schema Map

Status: PRE-SOURCE GATE RESOLVED

Baseline: `c3a184f9c067d529e8f2908080ab72650fb59cbc`

Baseline manifest commit: `6b77ed06b250176fd9cff16b35ab1c3d4701c9a2`

## 1. Mechanical current call-chain

### Frozen substrate

```text
commitTakeoverFrontierInsideCore
-> CORE_COMMIT_CAPABILITIES WeakMap
-> SqliteRevisionSubstrate.#commitInsideCore
-> BEGIN IMMEDIATE
-> read exact existing marker or current vector
-> compute TAKEOVER_FRONTIER next vector
   raw_frontier_revision +1
   frontier_position := requested end
   takeover_commit_revision +1
   ledger_revision unchanged
   state_revision unchanged
-> callback({ previous, current, database: same DatabaseSync })
-> full-vector CAS update
-> insert cc_revision_commits marker
-> COMMIT
```

Evidence: `src/revision-substrate.ts` defines the five-axis
`RevisionTransactionContext`, rejects nested transactions on one substrate instance, and computes
`TAKEOVER_FRONTIER` without advancing State.

### Existing State writer

```text
SqliteCanonicalStateStore.commit
-> normalize
-> commitStateRevisionInsideCore
-> substrate-owned BEGIN IMMEDIATE
-> State owner callback reads/reduces/inserts State row
-> substrate advances State + inserts marker
-> COMMIT
```

It cannot be invoked inside Takeover: doing so would enter the same substrate while its transaction
is open and must conflict. It also represents a different legal vector transition.

### Existing Fact/Relation writer

```text
SqliteCanonicalFactRelationStore.commit
-> normalize
-> its own DatabaseSync BEGIN IMMEDIATE
-> read vector/current objects/State chain
-> validate/apply object revisions + domain marker
-> require vector unchanged
-> COMMIT
```

It cannot be invoked from the Takeover callback because it opens a second connection/transaction;
that would either lock/conflict or create forbidden cross-connection choreography.

### Existing Raw reader

`SqliteLedgerHotRawStore.rebuild` owns a separate deferred read transaction. It is correct for a
standalone Hot Raw projection but cannot establish the Takeover callback snapshot. The coordinator
therefore reads the frozen `cc_ledger_raw_events` rows directly on the callback handle and applies the
same scope/range/canonical-row grammar; it does not change or duplicate the Raw writer.

## 2. Selected Takeover composition

```text
Core.commitSemanticTakeover(normalized input)
-> SqliteAuthorityTransactionCoordinator.commitTakeover
-> frozen commitTakeoverFrontierInsideCore
-> substrate BEGIN IMMEDIATE
-> exact substrate identity replay/conflict
-> compute previous/current TAKEOVER_FRONTIER vector
-> coordinator callback on substrate DatabaseSync
   1. validate ledger base, direct-successor range and policy
   2. read exact contiguous Raw rows [start,end]
   3. read/validate exact State authority chain at previous.state_revision
   4. read exact existing Fact/Relation refs
   5. optionally apply one normalized Fact/Relation owner batch
   6. validate final authority manifest and one disposition per Raw Event
   7. canonicalize/hash/insert immutable Compaction Artifact
   8. insert immutable Takeover domain row/result
   9. require live vector still equals callback previous
-> substrate full-vector CAS to callback current
-> substrate immutable marker/result
-> COMMIT
-> coordinator reopens one read snapshot and verifies domain/marker/artifact/authority binding
```

There is one write transaction, one SQLite handle and one revision allocator. Callback failure or
COMMIT failure rolls back Fact/Relation revisions, both domain markers, Artifact, vector and substrate
marker. The caller never supplies the new vector.

Exact replay is decided first by the frozen substrate marker. The callback does not rerun. The
coordinator must then verify that stored substrate result, Takeover row, Fact/Relation domain result
and Artifact all agree byte-for-byte; missing or coordinated malformed rows are `CORRUPT_DATA`.

## 3. Selected State semantics

WO-04C v1 is `exact-reference-only-no-axis-advance` for State.

```text
callback previous.state_revision == callback current.state_revision
Takeover previous_state_revision == Takeover new_state_revision
state_authority_ref == exact authority at that revision (or null only for zero)
```

The same-handle State owner seam owns the complete `1..observed` chain proof. WO-04C cannot call the
standalone State commit and does not receive a State apply seam. A request that requires a new State
revision must first use the accepted standalone WO-04A authority path and then build Takeover from a
fresh snapshot, or wait for a separately authorized combined substrate transition.

This choice satisfies current Contract fields while preserving the frozen legal transition. It is
also the precise stop condition for future functional changes: atomic State+Frontier is a substrate
extension, not an implementation detail inside WO-04C.

## 4. Selected Fact/Relation composition

The owner module is refactored without behavior change into:

```text
normalizeCanonicalFactRelationInput(value)               before transaction
readCanonicalFactRelationAuthorityInsideCore(database, refs, observed)
applyCanonicalFactRelationInsideCore(database, normalized, observed)
```

The existing standalone Store continues to open/close its own transaction and delegates to those
functions. Takeover/Enrichment call only the Core-private same-handle functions. Both paths preserve
the same policy hash, proposal grammar, final-graph validation, endpoint qualification, object
revision allocation, domain marker, exact replay and error classification.

No Fact/Relation primary revision axis exists; object/domain rows are valid inside either transaction
only when the complete five-axis observed vector is bound in their marker. For Takeover it is the
callback `previous` vector. The final Takeover marker additionally binds the resulting exact object
revision map.

## 5. Selected Enrichment composition

```text
Core.commitSemanticEnrichment(normalized input)
-> SqliteAuthorityTransactionCoordinator.commitEnrichment
-> BEGIN IMMEDIATE on coordinator connection
-> exact enrichment identity replay/conflict
-> read observed five-axis vector
-> read source Raw refs + exact State/Fact/Relation authority
-> apply required Fact/Relation batch through owner seam
-> insert immutable Enrichment row/result
-> require vector unchanged
-> COMMIT
```

No revision-substrate mutation helper is called. Enrichment requires at least one new object revision
and cannot write Artifact or claim contiguous coverage. This makes partial Takeover salvage an
explicit new commit, not a partial outcome of the failed transaction.

## 6. Read path composition

All cross-domain WO-04C reads are routed through the coordinator connection:

```text
BEGIN
-> read live vector / exact semantic row
-> verify substrate marker where applicable
-> verify Raw range/source refs
-> verify State chain through owner seam
-> verify Fact/Relation commits/objects through owner seam
-> verify Artifact canonical descriptor/hash
-> assemble immutable plain-data projection
-> COMMIT
```

Domain standalone reads remain in their owners for compatibility. A cross-domain consistent read may
not call multiple public Store methods because that would use multiple snapshots.

## 7. Additive schema ownership

| Object | Owner | Identity | Required binding |
| --- | --- | --- | --- |
| `cc_semantic_authority_schema` | semantic-takeover | singleton version | exact schema + completion last |
| `cc_semantic_takeover_commits` | semantic-takeover | scope + takeover ID | request/result, previous/current vector, authority manifest, coverage, artifact |
| `cc_semantic_enrichment_commits` | semantic-takeover | scope + enrichment ID | request/result, observed vector, source refs, Fact/Relation domain identity |
| `cc_compaction_artifacts` | semantic-takeover | scope + artifact ID | canonical descriptor/body/hash/range/generator/policy/provenance |
| `cc_revision_commits` | frozen substrate | scope + takeover ID | `TAKEOVER_FRONTIER`, CAS descriptor, previous/current, same Takeover result |
| `cc_canonical_state_revisions` | State owner | scope + State revision | read-only exact chain authority |
| `cc_canonical_*_revisions/commits` | Fact/Relation owner | scoped IDs/revisions | same-handle owner policy/apply/read |
| `cc_ledger_raw_events` | frozen Raw owner | scope + ledger revision / Event ID | read-only exact covered/source rows |

WO-04C tables and completion markers are immutable. No legacy table is altered or backfilled.

## 8. Forbidden call-chains mechanically excluded

```text
Takeover callback -> SqliteCanonicalStateStore.commit             forbidden nested substrate txn
Takeover callback -> SqliteCanonicalFactRelationStore.commit      forbidden second connection txn
Takeover callback -> SqliteLedgerHotRawStore.rebuild               forbidden second read snapshot
coordinator -> UPDATE cc_revision_streams                          forbidden manual vector writer
Enrichment -> any Frontier/Takeover revision helper                forbidden primary-axis mutation
root/MCP -> coordinator/Store/DatabaseSync/internal seam           forbidden boundary export
```

`src/revision-substrate.ts` and `src/ledger-hot-raw.ts` remain unchanged. If implementation cannot
honor this map without one of the forbidden edges, source work stops and a bounded substrate change
proposal is required.

## 9. Resolved gate and remaining stop conditions

The current frozen substrate is sufficient for WO-04C v1 because State is reference-only and
Fact/Relation revisions are axis-neutral. Source implementation may begin only on the exact allowlist
in the architecture document.

Stop and report a blocker if any accepted functional change requires:

- new State revision atomically in the Takeover transaction;
- a different primary-axis transition;
- modifying Raw append/rebuild authority;
- a generic cross-domain writer/root export;
- Host/provider/MCP/Snapshot/Working Context behavior.
