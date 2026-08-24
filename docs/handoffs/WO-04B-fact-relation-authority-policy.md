# WO-04B Builder Handoff — Fact / Relation Authority + Policy

Status: **APPEND-ONLY BUILDER FIX COMPLETE / AWAITING FRESH INDEPENDENT RE-QA**<br>
Work order: `docs/work-orders/WO-04B-fact-relation-authority-policy.md`<br>
Source baseline / planning authority:
`eb7a45bdfa09cd468581145e6270a22a471cf2f6`<br>
Expected parent: `74d39636e112054f7a4ea2b9a2e1be0b3728cdd7`<br>
Pre-source baseline/grammar commit: `4471ce3`<br>
Original Builder candidate: `3cecddd004fa7ab4df3eba6d4df9a7d63baf04c0`<br>
Independent QA rejection:
`4dccaa824d47e2abda3333536dc54df0dcbe7f33`<br>
Fixed Builder candidate HEAD: the append-only commit containing this handoff;<br>
WO-04A fixed candidate / QA:
`98e02ef898587b013ad588cf7ab2f182afa276e3` /
`74d39636e112054f7a4ea2b9a2e1be0b3728cdd7`<br>
Independent re-QA must resolve and pin the fixed candidate before review.

## Bounded result

WO-04B delivers one additive Core authority path:

- explicit namespace/stream and stable `authority_commit_id`;
- strict closed FactProposal / RelationProposal batch grammar;
- code-owned `canonical-fact-relation/v1` policy and Registry;
- append-only per-object Fact and Relation revisions;
- atomic domain marker + Fact/Relation rows with exact replay;
- same-scope committed canonical Raw Event provenance;
- typed same-scope Raw Event / Fact / Canonical State Item endpoints;
- current/exact durable readers and close/reopen recovery;
- Core library methods without changing the nine-command MCP port.

Fact/Relation revisions are object/domain revisions. The writer does not call a
WO-03A commit operation and leaves Ledger, State, Raw Frontier revision,
Frontier position and Takeover revision unchanged.

The candidate does not migrate legacy `state_relations`, enter current compile /
retrieval/assembly, implement Takeover/Enrichment/Frontier/Compaction/Snapshot,
add Host/provider/network behavior, or begin WO-04C/WO-05.

## Append-only QA return and bounded fix

The first Independent QA passed the declared focused/full suites and every
non-State attack, but rejected the original candidate on one blocker. WO-04B
treated a canonical State row plus locally recomputed `state_hash` as sufficient
`STATE_ITEM` authority. QA coordinated a State-row/hash replacement while
leaving the accepted WO-04A substrate marker unchanged. Frozen WO-04A correctly
returned `CORRUPT_DATA`, while the original WO-04B candidate accepted and
persisted a Relation to the forged item.

The append-only fix changes only the WO-04B owner and its focused regression:

- no second connection or nested Store is opened; the exact observed State is
  reconstructed inside the existing WO-04B SQLite transaction snapshot;
- the verifier checks the complete State row grammar/canonical bytes/hash,
  frozen WO-04A policy, proposal-provenance union, exact
  `STATE / CANONICAL_STATE_COMMIT_V1` marker, request/fingerprint, complete
  result, previous/current vector binding, Raw high-water and deterministic
  reduction from the previous State snapshot;
- the marker's current vector must be component-wise no later than WO-04B's
  observed vector, while only State advances between its previous/current
  vectors; and
- stored commits containing a `STATE_ITEM` re-run the same proof, so current,
  exact Fact, exact Relation, exact commit, replay and reopen all fail closed on
  the QA counterexample.

The regression first proves a legitimate State-linked Relation works, then
reproduces QA's coordinated row/hash replacement. Both frozen WO-04A and fixed
WO-04B return `CORRUPT_DATA`; an attempted forged Fact/Relation batch leaves the
existing one marker, one Fact and one Relation unchanged and leaves all five
WO-03A axes byte-equivalent. `src/canonical-state.ts` remains byte-identical to
the accepted WO-04A source.

## Execution baseline and exact paths

The clean baseline manifest froze `main` at `eb7a45b...`, including dependency
ancestry, config hashes and frozen WO-03A/03B/04A blobs. Commit `4471ce3` then
recorded the complete grammar, policy descriptor and fixed policy hash before
source implementation began.

The candidate contains exactly these nine authorized paths relative to the
source baseline:

```text
docs/architecture/WO-04B-fact-relation-authority-policy.md
docs/handoffs/WO-04B-fact-relation-authority-policy.md
docs/inventory/WO-04B/execution-baseline-manifest.md
docs/inventory/WO-04B/fact-relation-schema-transaction-map.md
src/canonical-fact-relation.ts
src/core.ts
src/index.ts
test/canonical-fact-relation.test.ts
test/core-boundary.test.ts
```

Frozen WO-03A/03B/04A source/tests, legacy State/Relation implementations, MCP,
package/config/dependencies, evaluation and official artifacts are unchanged.

## Source and policy fingerprints

```text
18afdd3fbf88a829233a68b7115a9d1768e1f280d8f55c81d44c085d449fb587  src/canonical-fact-relation.ts (fixed)
891928617190d3721e7424c40429e71730e2542370102db03d899a6ddf54ad3b  src/core.ts
2c467acbc99d52936a5f72d08dfe17ece190991187e42b92f825d47d0dfec761  src/index.ts
9ab332bbf3c53555cafb9d90c6709e6c371ccf8bb3ccc68afe48be85697c9599  src/revision-substrate.ts (frozen)
2210d5436daada36e34af3c8c4c03575c53ac499eadb662a2fd3bff90002eda2  src/ledger-hot-raw.ts (frozen)
740a4c374d0a5e4df6ca6d9345620b6c3b23f984e91d3e00200dc23ad2cff281  src/canonical-state.ts (frozen)
```

```text
policy_version: canonical-fact-relation/v1
policy_hash: f9dc4c757d8ae4a558d29ecebd494323b5a8de55b78312b2423a14db0a4fb570
schema_version: 1
```

The production constant independently recomputes the exact hash of the
pre-source descriptor; caller input cannot redefine policy.

## Fact policy

One stable Fact identity has an immutable statement, epistemic origin and
metadata. Corrections therefore create a new Fact plus a typed reason Relation.
Caller does not supply revision/hash/timestamp.

The implementation keeps four fields orthogonal:

```text
epistemic_origin
verification_status
lifecycle_status
record_status
```

Verification has the frozen transition table. Lifecycle is
`active → superseded | retracted` and terminal; record visibility permits
`live ↔ archived` without changing truth/lifecycle. `verified` and
`disconfirmed` require verification evidence. Raw provenance and verification
refs are lexical, unique, same-scope and monotonic.

The final transactional graph enforces:

- contested → active incoming `CONTRADICTS`;
- superseded → active incoming `SUPERSEDES` from a different Fact;
- retracted → active incoming `RETRACTS`;
- Relation retraction cannot orphan those conditions.

An active dispute alone does not downgrade an objectively verified Fact.

## Relation Registry and authority

Registry endpoint types are `RAW_EVENT`, `FACT` and `STATE_ITEM`; the architecture
deliverable fixes every permitted directed type pairing for `SUPPORTS`,
`CONTRADICTS`, `SUPERSEDES`, `RETRACTS`, `DERIVED_FROM`, `DEPENDS_ON` and
`RESOLVES`.

All endpoints are in the Relation's explicit scope. Raw endpoints/provenance must
exist at or below observed Ledger high-water; Fact endpoints include same-batch
Facts; State Item endpoints come only from the exact observed Canonical State
revision. Legacy State and cross-scope objects never qualify.

Endpoint/type/origin/confidence/metadata are immutable per Relation identity.
Active tuple duplicates, self-edges and bounded SUPERSEDES/DEPENDS_ON cycles fail
the whole batch. `model_inferred` requires finite confidence `[0,1]`; every other
origin forbids confidence, and confidence never changes Fact verification.

## Transaction, replay and read contract

The domain transaction is:

```text
strict pre-transaction normalization
→ BEGIN IMMEDIATE
→ existing marker integrity + request identity
→ current-policy check for new identity
→ observed five-component vector read
→ current Fact/Relation load and per-object CAS
→ Raw/Fact/State endpoint + policy + graph validation
→ exact domain marker insert
→ immutable Fact/Relation row inserts
→ byte-equivalent vector recheck
→ COMMIT
→ one-snapshot marker/row/request/result verification
```

The marker binds exact request bytes/fingerprint, observed vector,
previous/current object-revision maps, complete result and policy. Readers
rebuild every changed object from the original request and exact prior object
revision, then compare persisted row/hash/result. They also require all
historical vector components no later than live and every Raw reference no later
than its recorded Ledger high-water.

This closes coordinated Fact-row/result replacement, request/fingerprint
replacement and observed-vector/row/result replacement. Latest, exact and replay
all fail closed. Existing-identity well-shaped policy substitution is stable
`CONFLICT`; a new unsupported identity is `INVALID_INPUT`, both with zero
mutation.

Fact/Relation/marker insert failures and a real deferred-FK COMMIT failure were
injected. Every case rolled back all new rows and left the five primary axes
unchanged. Same-object same-base concurrent proposals allow at most one distinct
winner; concurrent exact retry writes once and returns revision 1 to both.

## Schema, migration and public boundary

Version 1 owns four additive tables and eight immutable triggers. Migration uses
`BEGIN IMMEDIATE`, exact columns and normalized full SQL, writes completion last,
and rejects partial collision or forged completion. Concurrent fresh and
unrelated-legacy first-open both converge without backfill.

Core owns `SqliteCanonicalFactRelationStore` in a JavaScript private field. Root
exports policy/schema constants, public types and stable domain error only—not
the Store, migration, SQLite connection or generic writer. MCP remains exactly
nine commands.

## Original Builder verification

Completed on 2026-08-24:

```text
npm test
  PASS — 34 files passed, 1 skipped; 520 tests passed, 1 skipped

npm run build
  PASS — tsc -p tsconfig.json

focused Fact/Relation + frozen State/substrate/Raw + Core/MCP run
  PASS — 6 files, 52 tests

isolated rerun of one pre-existing full-suite timeout
  PASS — test/starlette-promotion.test.ts, 14/14

git diff --check
  PASS

exact command enumeration
  PASS — nine accepted commands in order

root internal export/reflection check
  PASS — no Fact/Relation Store or migration

frozen/prohibited-path diffs
  PASS — WO-03A/03B/04A, legacy State/Relation, MCP/evaluator,
  package/config and official artifacts unchanged
```

The first full-suite invocation had one pre-existing Starlette promotion test
cross its 5-second per-test timeout under parallel load. That exact file passed
14/14 in isolation, and the subsequent unmodified full suite passed 520 + 1
skip. No product assertion failed.

Focused evidence covers exact replay/substitution, vector immutability,
orthogonal Fact axes and reason Relations, monotonic refs, endpoint Registry,
State Item/Raw/Fact authority, active-edge/cycle rejection, confidence policy,
scope/provenance isolation, row/marker/COMMIT rollback, concurrent commit/retry,
coordinated tamper attacks, strict invalid/Cc/non-NFC/accessor/cycle input,
fresh/legacy concurrent migration, collision/forged completion, reopen and
Core/root/MCP boundaries.

No network, remote model, credential, production database, destructive command
or sibling Host repository was used. All write diagnostics used isolated files
under the system temporary directory.

## Fixed Builder verification

Completed after the append-only QA rejection on 2026-08-24:

```text
focused Fact/Relation + frozen State/substrate/Raw + Core/MCP run
  PASS — 6 files, 53 tests

npm test
  PASS — 34 files passed, 1 skipped; 521 tests passed, 1 skipped

npm run build
  PASS — tsc -p tsconfig.json

git diff --check
  PASS
```

The new test is the exact B1 regression. It also uses valid WO-04A State
metadata with 101 object keys to prove that the reused State authority parser
does not accidentally impose WO-04B's separate 100-key Fact/Relation metadata
bound. No network, remote model, sibling Host code or non-temporary diagnostic
database was used.

## Known limits and deferred work

- No detector/extractor/linker or automatic proposal source is selected.
- Fact/Relation authority does not yet compose with State or advance Frontier.
- No cross-namespace Relation endpoint or Promotion is allowed in 04B.
- Current Fact/Relation data does not enter legacy compile/retrieval/assembly.
- No Compaction Artifact, Snapshot, Host routing, worker or background enrichment
  exists.
- Atomic Semantic Takeover/Enrichment and contiguous Frontier remain WO-04C;
  final Working Context authority remains WO-05.

## Independent QA requirements

The Builder does not approve this candidate. Independent QA must:

1. pin baseline, pre-source grammar commit and exact candidate; verify the
   nine-path allowlist and clean append-only ancestry;
2. independently reconstruct the frozen policy descriptor/hash, all Fact axes,
   transitions, Relation pairing Registry and confidence rule;
3. prove every successful batch leaves all five WO-03A vector fields unchanged;
4. attack legacy/session/cross-scope IDs, missing/after-high-water Raw evidence,
   missing Fact/State Item endpoints and shadow/authority isolation;
5. reproduce row+result, request+fingerprint and vector+row+result substitutions
   against latest, exact and replay;
6. independently reproduce the accepted-State-row/hash replacement with the
   original WO-04A marker left unchanged; require WO-04A and WO-04B commit,
   current, exact, replay and reopen reads to fail closed with zero new domain
   rows and unchanged five-axis vector;
7. inject marker/Fact/Relation/actual-COMMIT failure and verify total rollback;
8. reproduce per-object CAS winner and same-identity exact retry races;
9. challenge contested/superseded/retracted reason orphaning, verified dispute,
   duplicate edge, self-edge and cycles;
10. challenge empty/no-op/overflow, all Unicode `Cc`, non-NFC, accessor, cycle,
   exotic/sparse/extra-key and bounds input before mutation;
11. challenge fresh/legacy concurrent migration, exact SQL collision and forged
    completion;
12. rerun focused, `npm test`, `npm run build`, exact-nine/root reflection,
    `git diff --check` and frozen/prohibited-path audits;
13. append to only `docs/qa/WO-04B-fact-relation-authority-policy.md`, make a separate
    QA commit and return ACCEPTED or REJECTED without implementing fixes or
    starting WO-04C/WO-05.
