# WO-04B Independent QA — Fact / Relation Authority Policy

**Verdict: REJECTED**

**QA date:** 2026-08-24

**Builder candidate:** `3cecddd004fa7ab4df3eba6d4df9a7d63baf04c0`

**Candidate parent / pre-source grammar commit:**
`4471ce3a075d4faa337c5cde4d47b1a356ceddf3`

**Source baseline / planning authority:**
`eb7a45bdfa09cd468581145e6270a22a471cf2f6`

**Baseline parent / accepted WO-04A QA:**
`74d39636e112054f7a4ea2b9a2e1be0b3728cdd7`

**Frozen WO-04A fixed candidate:**
`98e02ef898587b013ad588cf7ab2f182afa276e3`

WO-04B must return to Builder. The candidate passes its declared focused and
full suites, policy reconstruction, Fact/Relation domain rules, transaction
rollback, concurrency, migration, tamper, validation and compatibility checks.
However, an independent temporary-database attack proved that WO-04B can accept
and durably reference a `STATE_ITEM` from a Canonical State revision which the
frozen WO-04A authority itself rejects as `CORRUPT_DATA`. That violates the
required exact-revision Canonical State Item authority boundary.

## 1. Pinned repository facts

- Repository and command workdir were
  `/Users/lmc/Documents/agent长期记忆/context-compiler-mcp` for every shell
  command.
- Before the QA write, branch was `main`, `HEAD` was exactly the Builder
  candidate, `HEAD^` was exactly the pre-source commit, `HEAD^^` was exactly the
  planning authority, and `HEAD^^^` was exactly the accepted WO-04A QA. The
  worktree was clean and no submodule exists.
- The planning authority descends from the accepted WO-04A QA and the frozen
  WO-04A implementation is present in the pinned ancestry.
- `source_baseline..candidate` contains exactly the nine allowlisted paths:
  - `docs/architecture/WO-04B-fact-relation-authority-policy.md`;
  - `docs/handoffs/WO-04B-fact-relation-authority-policy.md`;
  - `docs/inventory/WO-04B/execution-baseline-manifest.md`;
  - `docs/inventory/WO-04B/fact-relation-schema-transaction-map.md`;
  - new `src/canonical-fact-relation.ts`;
  - `src/core.ts` and `src/index.ts`;
  - new `test/canonical-fact-relation.test.ts`;
  - `test/core-boundary.test.ts`.
- `baseline..pre-source` contains only the architecture and execution-baseline
  manifest. `pre-source..candidate` contains the updated architecture and the
  remaining seven paths, exactly eight paths total.
- Frozen WO-03A/03B/04A source, schema and direct tests, legacy State/Relation,
  Raw, Recall, Experience/telemetry, MCP, package/config/dependencies,
  evaluation, official artifacts, PROJECT_STATE, ROADMAP and work order have no
  diff from the planning authority.
- Independently calculated SHA-256 values matched the handoff and baseline:
  - `8ed26897...c9d4` — `src/canonical-fact-relation.ts`;
  - `89192861...d3b` — `src/core.ts`;
  - `2c467acb...c761` — `src/index.ts`;
  - frozen `9ab332bb...c9599` — `src/revision-substrate.ts`;
  - frozen `2210d543...02eda2` — `src/ledger-hot-raw.ts`;
  - frozen `740a4c37...f281` — `src/canonical-state.ts`.
- QA used no sibling Host repository, network, remote model, credential,
  production database or destructive command. Every write probe used a newly
  created SQLite file below the system temporary directory.

## 2. Independently confirmed behavior

The following evidence passed but cannot override the blocker in section 3.

### 2.1 Frozen grammar, policy and domain rules

- QA reconstructed the unchanged pre-source policy descriptor from canonical
  JSON and SHA-256. The result was exactly
  `f9dc4c757d8ae4a558d29ecebd494323b5a8de55b78312b2423a14db0a4fb570`,
  matching the exported code-owned policy hash and the Builder handoff.
- Source tracing and focused execution confirmed exact proposal keys,
  NFC/no-`Cc` lexical normalization, bounds, immutable Fact
  statement/origin/metadata, monotonic Raw references, independent origin /
  verification / lifecycle / record axes and their declared transitions.
- The final-graph validator requires active incoming `CONTRADICTS`,
  `SUPERSEDES` and `RETRACTS` reasons for contested, superseded and retracted
  Facts. Retracting a reason edge cannot orphan its target, and a dispute does
  not automatically change an already verified Fact.
- The code-owned Relation Registry implements the exact seven relation types and
  directed endpoint pairings. Same-scope Raw/Fact checks, tuple uniqueness,
  self-edge rejection, bounded `SUPERSEDES`/`DEPENDS_ON` cycle rejection, and
  origin-specific confidence rules passed. Legacy and cross-scope objects did
  not qualify; there is no Promotion fallback.
- An independent strict-input probe enumerated all 65 Unicode general-category
  `Cc` code points and observed 65 `INVALID_INPUT` results. Non-NFC, accessor,
  cycle, exotic prototype, sparse array, extra key and bounds attacks also
  returned `INVALID_INPUT`; the accessor getter count remained zero. Empty
  batch was `INVALID_INPUT`, a reduced non-empty no-op was `CONFLICT`, only the
  one valid commit was persisted, and the five-axis vector remained unchanged.

### 2.2 Marker integrity and exact replay

QA independently reproduced three coordinated substitutions in separate
temporary databases, restoring the exact immutable-trigger SQL before each
challenged reopen:

1. Fact/Relation row hashes plus marker result were replaced while preserving
   original request bytes and fingerprint;
2. marker request bytes plus fingerprint were replaced while preserving rows
   and result; and
3. observed vector plus rows/results were lowered so ledger high-water preceded
   the provenance Event.

For all three attacks, current projection, exact Fact read, exact Relation read,
exact commit read and replay of the original request returned `CORRUPT_DATA`.
Source tracing also confirmed binding of scope, authority commit ID, operation,
policy, normalized request/fingerprint, previous/current object maps,
created-at, result, rows and hashes. Existing-identity policy substitution is a
stable `CONFLICT`; a new identity with an unsupported well-shaped policy is
`INVALID_INPUT` without mutation.

### 2.3 Atomicity, vectors, races and reopen

Independent probes injected failures at four distinct boundaries:

1. domain marker insert;
2. Fact revision insert;
3. Relation revision insert; and
4. the actual SQLite `COMMIT` through a deferred foreign-key violation.

Every failure returned `STORAGE_FAILURE`, left zero marker/Fact/Relation rows,
and left all five WO-03A vector components byte-equivalent. Successful commits,
failed validation, exact replay and races likewise never mutated any vector
component; WO-04B only observes the vector.

Two simultaneous distinct creates of the same object produced one revision-1
winner and one `CONFLICT`. Two simultaneous exact retries both returned the
same revision-1 result while audit found one row. Two simultaneous commits to
disjoint objects both succeeded with object revision 1, so no object-local gap
was introduced. Current/exact reads and ordinary close/reopen were stable in
the uncorrupted cases.

### 2.4 Migration and public boundaries

- Two independent workers concurrently opened both a fresh database and an
  unrelated legacy database. Both opens succeeded, the singleton version was
  1, all 12 exact schema objects existed, and domain row count was zero. The
  seeded legacy `sessions` row remained one: no legacy backfill occurred.
- A same-name partial table and a forged version-1 completion both failed
  constructor open as `STORAGE_FAILURE`. Source validation compares normalized
  full `sqlite_master.sql`, exact columns and exact singleton version.
- Package root exports only the intended Fact/Relation constants, types and
  stable error, not the Store, migration, SQLite handle or generic writer. The
  Core-owned Store is a JavaScript private field and is not visible through
  instance/prototype reflection as a Store or substrate capability.
- Runtime enumeration returned exactly the accepted nine commands in their
  existing order. The MCP service adds no Fact/Relation command and the full
  MCP protocol/lifecycle suite stayed green.
- Static candidate-diff audit found no Fact/Relation compile or retrieval
  takeover, Frontier/Takeover/Enrichment mutation, Compaction/Snapshot,
  Host/provider/network dependency, or change to current ingest/Raw mirror,
  legacy State/Recall/telemetry/evaluation/config/artifact behavior.

## 3. Acceptance blocker

### B1 — `STATE_ITEM` lookup bypasses frozen WO-04A authority integrity

**Required contract:** WO-04B declares the accepted WO-04A Canonical State
identity/read path as the optional Relation endpoint authority. Architecture,
transaction map and handoff all say that a `STATE_ITEM` must come from the exact
Canonical State revision named by the observed `state_revision`; legacy or
uncommitted row-shaped data is not authority.

**Source fact:** `readCanonicalStateItemIds` in
`src/canonical-fact-relation.ts` reads only `state_json` and `state_hash` from
`cc_canonical_state_revisions`, verifies the hash over that JSON, and collects
each object's `item_id`. It neither reconstructs a complete Canonical State
item nor verifies the frozen WO-04A revision marker, normalized request,
proposal reduction, result, policy, provenance or previous/current State-vector
binding. By contrast, frozen `SqliteCanonicalStateStore.readLatest/readRevision`
calls `#readCommittedInsideTransaction`, which validates the complete row,
marker binding and deterministic reduction before treating the revision as
authority.

**Independent counterexample:** in a new temporary database QA:

1. committed a legitimate canonical Raw Event and a legitimate WO-04A State
   revision containing item `real`;
2. saved and temporarily removed only the exact State no-update trigger;
3. appended `{ "item_id": "zz-forged" }` to the State row, recomputed the
   row's canonical `state_hash`, left the original WO-04A marker/request/result
   untouched, and restored the exact original trigger SQL; and
4. reopened/challenged both domain owners.

The frozen WO-04A `readLatest(scope)` returned `CORRUPT_DATA`, proving the
revision was not valid Canonical State authority. Nevertheless WO-04B accepted
a Fact plus `DEPENDS_ON` Relation targeting
`{ type: "STATE_ITEM", id: "zz-forged" }`. WO-04B current projection, exact
Fact read, exact Relation read, exact commit read and close/reopen projection all
accepted the forged endpoint. The five-axis vector stayed unchanged, so the
result is not caused by revision allocation or an external race.

This is a cross-domain authority-confusion failure: matching a locally
recomputed row hash is weaker than the frozen WO-04A authority proof. A
coordinated State-row replacement can therefore become durable Fact/Relation
authority even though the State owner fails closed on it. The Builder fix must
make the exact observed State revision pass the frozen 04A domain integrity
contract in the same read/write snapshot before any State Item endpoint can
qualify, without introducing a TOCTOU window. QA does not prescribe or implement
the repair.

## 4. Commands and results

- Pin/allowlist/ancestry: `git status --short --branch`, `git rev-parse HEAD
  HEAD^ HEAD^^ HEAD^^^`, ancestor checks, submodule status, and scoped
  `git diff --name-status` — PASS; exact chain, clean tree, two-path pre-source
  commit, eight-path final Builder commit and nine authorized paths overall.
- Focused run: `npx vitest run test/canonical-fact-relation.test.ts
  test/canonical-state.test.ts test/revision-substrate.test.ts
  test/ledger-hot-raw.test.ts test/core-boundary.test.ts
  test/mcp-service.test.ts` — PASS, 6 files and 52 tests.
- Full suite: `npm test` — PASS, 34 files passed and 1 skipped; 520 tests passed
  and 1 skipped. No timeout occurred.
- Build: `npm run build` — PASS (`tsc -p tsconfig.json`).
- Candidate whitespace audit:
  `git diff --check eb7a45b..3cecddd` — PASS.
- Frozen WO-03A/03B/04A, legacy State/Relation, Raw/Recall/telemetry, MCP,
  evaluation/artifact and package/config scoped diffs — PASS with no output.
- Runtime exact-nine/root/private-boundary and static prohibited-behavior audits
  — PASS.
- Independent policy, strict-input, tamper A/B/C, rollback, concurrency,
  migration, State-authority and reopen probes — PASS except for B1 above. All
  diagnostic database files were isolated under the system temporary directory.

## 5. Disposition

**REJECTED.** Return WO-04B to Builder for an append-only fix and a regression
test that reproduces B1. A row/hash pair rejected by frozen WO-04A reads must not
qualify as Canonical State Item endpoint authority for commit, current/exact
reads, replay or reopen.

QA did not modify Builder source, tests, architecture, inventory, handoff, work
order, PROJECT_STATE, ROADMAP or artifacts, did not implement a fix, and did not
begin WO-04C or WO-05.

---

# Fresh Independent re-QA — fixed candidate `467bfb5f`

Reviewed on 2026-08-24. The original `REJECTED` record above remains the verdict
for Builder candidate `3cecddd004fa7ab4df3eba6d4df9a7d63baf04c0` and is retained
without modification. This section independently reviews the append-only fixed
Builder candidate.

## 6. Re-QA verdict

**REJECTED.** Fixed candidate
`467bfb5f0797abe668c9cfa087c65a6ad96c1a84` closes the original direct B1
counterexample at the exact observed State revision, but its authority proof is
not revision-chain closed. A corrupted earlier State row can be incorporated
into a later WO-04A revision with a valid new marker; WO-04B then accepts the
injected State Item through new commit, current, exact, replay and reopen paths.

This violates the re-QA requirement that a State row/revision-marker mismatch
remain fail-closed across the new-commit path and cannot be accepted merely
because a later revision deterministically reduces from the corrupted row/hash.

## 7. Candidate, ancestry and frozen-path facts

- The worktree was clean before re-QA writes. Branch was `main`; `HEAD` was
  exactly fixed candidate `467bfb5f...`, its parent was the preserved QA
  rejection `4dccaa82...`, and original Builder candidate `3cecddd0...` was the
  next Builder ancestor.
- `4dccaa82..467bfb5f` contains exactly the required five paths:
  - `docs/architecture/WO-04B-fact-relation-authority-policy.md`;
  - `docs/handoffs/WO-04B-fact-relation-authority-policy.md`;
  - `docs/inventory/WO-04B/fact-relation-schema-transaction-map.md`;
  - `src/canonical-fact-relation.ts`; and
  - `test/canonical-fact-relation.test.ts`.
- The WO-03A/03B/04A implementation and QA commits are all ancestors. The
  planning-baseline scoped audit found no drift in frozen substrate, Raw, State,
  their direct tests, legacy State/Relation, MCP, package/config, evaluator,
  official artifacts, PROJECT_STATE, ROADMAP or the work order.
- SHA-256 independently matched the fixed handoff:
  - `18afdd3fbf88a829233a68b7115a9d1768e1f280d8f55c81d44c085d449fb587`
    for `src/canonical-fact-relation.ts`;
  - `740a4c374d0a5e4df6ca6d9345620b6c3b23f984e91d3e00200dc23ad2cff281`
    for frozen `src/canonical-state.ts`.
- Rebuilding the pre-source policy descriptor as canonical JSON produced
  `f9dc4c757d8ae4a558d29ecebd494323b5a8de55b78312b2423a14db0a4fb570`,
  equal to the runtime code-owned policy hash.

## 8. Confirmed fixed behavior and retained regression evidence

Static tracing confirms that fixed WO-04B uses its existing `DatabaseSync` and
the caller's `BEGIN IMMEDIATE`/`BEGIN` transaction. It opens no second State
Store, connection or transaction. For the exact observed State revision it now
checks complete row grammar and canonical bytes, State hash and frozen policy,
proposal/provenance union, the exact `STATE / CANONICAL_STATE_COMMIT_V1` marker,
request bytes/fingerprint, complete result, previous/current vectors, State-only
`+1`, Raw provenance high-water and deterministic reduction.

An independent temporary-database replay of the original B1 attack passed the
intended fixed boundary:

- a valid WO-04A State with **101 metadata keys** successfully backed a legitimate
  State-linked Relation, proving WO-04B's separate 100-key metadata limit was not
  applied to accepted WO-04A State metadata;
- after appending a forged item to revision 1, recomputing only `state_hash`,
  preserving the original marker and restoring the exact update trigger,
  WO-04A current and WO-04B new commit/current/exact Fact/exact Relation/exact
  domain commit/replay/reopen all returned `CORRUPT_DATA`;
- the rejected forged batch left the one pre-existing domain marker, Fact row and
  Relation row unchanged, and all five revision-vector components were
  byte-equivalent.

The original QA's other green evidence also remained green: Fact four-axis and
reason invariants, Relation pairings/confidence/endpoint isolation, policy
classification, strict input/Cc/NFC/accessor/cycle/bounds checks, atomic rollback,
concurrency, migration, coordinated Fact/Relation substitutions, root/private
boundary and exact-nine MCP. Runtime enumeration returned the same nine commands
in order; no Store/migration/generic writer was exported or recoverable by Core
own-key reflection.

## 9. Acceptance blocker

### B2 — a new WO-04A revision launders a corrupted predecessor into WO-04B authority

**Required contract:** when any State row disagrees with its immutable revision
marker, the mismatch must remain fail-closed across new commit, current, exact,
replay and reopen. WO-04B must not accept a `STATE_ITEM` that entered the observed
State through such a corrupted predecessor.

**Source facts:** frozen WO-04A new-commit reduction loads the previous revision
through `#readStateInsideTransaction` (`src/canonical-state.ts:325-327`). That
helper validates only the previous `state_json` and recomputed `state_hash`
(`src/canonical-state.ts:529-544`), not the previous revision marker. The fixed
WO-04B verifier validates the exact observed revision's row and marker, but its
deterministic reduction likewise loads the predecessor through
`readCanonicalStateSnapshot` (`src/canonical-fact-relation.ts:1622-1629`), which
again checks only canonical State bytes and hash
(`src/canonical-fact-relation.ts:1635-1652`). The proof therefore stops at the
observed revision and does not prove its State ancestry.

**Independent counterexample:** QA created a fresh temporary database and:

1. committed one canonical Raw Event and valid WO-04A State revision 1;
2. temporarily removed only the State no-update trigger, appended item
   `zz-forged` to revision 1, recomputed the canonical State hash, preserved its
   original marker, restored the exact trigger SQL, closed and reopened;
3. confirmed WO-04A current/exact/replay and WO-04B current/new commit all
   returned `CORRUPT_DATA` before laundering;
4. submitted a distinct valid WO-04A commit at expected revision 1 that added an
   unrelated legitimate item. It succeeded as State revision 2 and preserved
   `zz-forged` from the row-shaped predecessor;
5. after reopen, WO-04A current, exact revision 2 and exact replay all accepted
   revision 2 and returned `zz-forged`; and
6. committed a new WO-04B Fact plus `DEPENDS_ON` Relation whose source was
   `{ type: "STATE_ITEM", id: "zz-forged" }`.

The WO-04B commit succeeded. Current projection, exact Fact, exact Relation,
exact domain commit, exact replay and close/reopen all accepted the forged
endpoint. Audit found one new domain marker, one Fact row and one Relation row.
The five-component vector was byte-identical immediately before and after the
WO-04B commit; the failure is authority-chain validation, not WO-04B revision
allocation or TOCTOU.

## 10. Commands and results

- Focused run: `npx vitest run test/canonical-fact-relation.test.ts
  test/canonical-state.test.ts test/revision-substrate.test.ts
  test/ledger-hot-raw.test.ts test/core-boundary.test.ts
  test/mcp-service.test.ts` — PASS, **6 files / 53 tests**.
- Full suite: `npm test` — PASS, **34 files passed, 1 skipped; 521 tests passed,
  1 skipped**.
- Build: `npm run build` — PASS (`tsc -p tsconfig.json`).
- `git diff --check` for both the fixed commit and the overall Builder candidate
  — PASS.
- Exact five-path fix allowlist, overall routed allowlist, ancestry, source/config
  hashes, frozen/prohibited paths, policy hash, root/private and exact-nine audits
  — PASS.
- Independent direct-B1/101-key and revision-chain laundering probes used only
  fresh SQLite files below the system temporary directory. QA used no network,
  remote model, production data, credential, sibling Host repository or
  destructive command.

## 11. Disposition

**REJECTED.** Return WO-04B to Builder for an append-only fix. WO-04B must, in
the same SQLite transaction/read snapshot, validate the complete Canonical State
authority chain revision by revision from `1` through the exact observed
`state_revision`: every row grammar/canonical bytes/hash/policy/provenance,
matching marker request/fingerprint/result/vector, Raw bound and deterministic
reduction must agree. The frozen `src/canonical-state.ts` must remain unchanged.

QA does not prescribe or implement the repair. It modified only this append-only
QA record, did not modify Builder paths, PROJECT_STATE, ROADMAP or the work order,
and did not begin WO-04C or WO-05.

---

# Second fresh Independent re-QA — second fixed candidate `8758f68b`

Reviewed on 2026-08-24. The two `REJECTED` records above remain the immutable
verdicts for candidates `3cecddd004fa7ab4df3eba6d4df9a7d63baf04c0` and
`467bfb5f0797abe668c9cfa087c65a6ad96c1a84`. This section independently reviews
the second append-only fixed Builder candidate.

## 12. Re-QA verdict

**ACCEPTED.** Candidate `8758f68bf4c6b604ae37fad13d15ca7e98c08bfc`
closes B2 while retaining the direct B1 fix and the original green evidence.
Within the same WO-04B SQLite transaction snapshot, the implementation validates
every Canonical State authority revision from `1` through the exact observed
`state_revision`. A corrupted predecessor, a direct row/marker mismatch, or an
adjacent marker-vector regression now keeps WO-04B fail-closed across new
commit, current, exact Fact, exact Relation, exact domain commit, replay and
reopen paths without adding domain rows or changing any primary revision axis.

## 13. Candidate, chain and frozen-path facts

- The worktree was clean before re-QA writes. `HEAD` was exactly
  `8758f68bf4c6b604ae37fad13d15ca7e98c08bfc` and `HEAD^` was exactly the
  preserved re-QA rejection
  `599da5005a414f46c0f621618a4d5da87afc36c9`. The first fixed candidate
  `467bfb5f0797abe668c9cfa087c65a6ad96c1a84` remains an ancestor.
- `599da500..8758f68b` changes exactly the permitted five Builder paths:
  architecture, handoff, transaction map, `src/canonical-fact-relation.ts` and
  `test/canonical-fact-relation.test.ts`.
- The accepted WO-03A/03B/04A implementation and QA commits remain ancestors.
  Scoped frozen/prohibited-path checks found no change to the revision
  substrate, Raw owner, frozen State owner, legacy State/Relation, MCP,
  package/config, evaluation/artifacts, PROJECT_STATE, ROADMAP or work order.
- SHA-256 independently matched the handoff:
  - `94df2a331ac6e1a1ec6a01890d702e67e7e3dcce39dd226c2aa370d93c8ba28a`
    for `src/canonical-fact-relation.ts`;
  - `740a4c374d0a5e4df6ca6d9345620b6c3b23f984e91d3e00200dc23ad2cff281`
    for unchanged `src/canonical-state.ts`.
- Recomputing the architecture policy descriptor as canonical JSON retained
  `f9dc4c757d8ae4a558d29ecebd494323b5a8de55b78312b2423a14db0a4fb570`,
  equal to the code-owned/runtime policy hash.

## 14. Same-snapshot State authority-chain verification

Static tracing and runtime fault injection agree on the following boundary:

- WO-04B begins its existing read or `BEGIN IMMEDIATE` write transaction, reads
  the observed five-axis vector, and calls the State authority verifier using
  the same private `DatabaseSync`. There is no State Store construction, second
  connection, nested transaction or post-transaction authority lookup, so the
  chain proof and Fact/Relation decision share one SQLite snapshot.
- The verifier iterates monotonically from State revision `1` through the exact
  observed revision. For each revision it validates complete row grammar and
  canonical JSON bytes, State hash, frozen State policy, exact proposal/state
  shapes, provenance union, the matching `STATE / CANONICAL_STATE_COMMIT_V1`
  marker, marker request bytes/fingerprint, marker result, previous/current
  vectors, State-only `+1`, Raw provenance high-water, event-reference bound and
  deterministic reduction from the already verified predecessor.
- For every adjacent pair, the later marker's `previous.state_revision` equals
  the preceding marker's `current.state_revision`, and every component of the
  later `previous` vector is at or after the preceding `current` vector. Legal
  Ledger/other-axis progress between State commits is allowed; regression is
  rejected. Every marker current vector is also bounded by the observed vector.
- The verified final State snapshot, not an unverified row-shaped endpoint, is
  the only source of `STATE_ITEM` authority used by Relation validation.

## 15. Independent negative and positive probes

### 15.1 B2 predecessor laundering remains fail-closed

QA reproduced the original B2 sequence in a fresh temporary SQLite database:

1. committed one Raw Event, a valid State revision 1, and one legitimate
   State-linked Fact/Relation domain commit;
2. appended `zz-forged` to revision 1, recomputed only its canonical State hash,
   preserved the original marker and restored the exact no-update trigger;
3. confirmed direct WO-04A current and WO-04B current/exact Fact/exact
   Relation/exact domain commit/replay/new commit rejected the mismatch;
4. confirmed unchanged frozen WO-04A could nevertheless create and read State
   revision 2 whose reduction retained `zz-forged`; and
5. challenged the second fixed WO-04B again at observed State revision 2.

After the State advance, WO-04B current, exact Fact, exact Relation, exact domain
commit, replay, new commit and close/reopen current/exact commit all returned
`CORRUPT_DATA`. The pre-existing counts remained exactly one domain commit, one
Fact revision and one Relation revision. The five-axis vector remained exactly
`ledger=1, state=2, raw_frontier=0, frontier_position=0, takeover=0` before and
after all WO-04B challenges.

This independently proves that a valid observed endpoint marker can no longer
launder an invalid predecessor into WO-04B authority.

### 15.2 Adjacent marker-vector regression is rejected

QA created two otherwise valid State revisions after Ledger had reached 2, plus
one legitimate domain commit. It then changed only revision 2's marker
`previous/current.ledger_revision` from 2 to 1 and restored the exact immutable
trigger. Frozen WO-04A still read revision 2, isolating the cross-revision link
rather than a per-row grammar failure.

Second-fixed WO-04B returned `CORRUPT_DATA` for current, exact Fact, exact
Relation, exact domain commit, replay, new commit and reopen. Domain/Fact/Relation
counts stayed `1/1/1`, and the full vector stayed `ledger=2, state=2, 0/0/0`.
This demonstrates component-wise no-regression enforcement across adjacent
State markers.

### 15.3 Legal chain, intervening Ledger progress and 101-key metadata pass

The positive control committed State revision 1 at Ledger 1, advanced Ledger to
2 with a second Raw Event, and then committed State revision 2. The marker chain
was:

- revision 1: previous `ledger=1,state=0` -> current `ledger=1,state=1`;
- revision 2: previous `ledger=2,state=1` -> current `ledger=2,state=2`.

A WO-04B Fact/Relation commit referencing a revision-1 State Item then passed
new commit, replay, current, all exact reads and close/reopen. WO-04B left the
five-axis vector unchanged. A separate legitimate State endpoint carrying 101
metadata keys also passed, confirming that WO-04B's 100-key metadata limit was
not incorrectly applied to frozen WO-04A State metadata.

## 16. Retained B1 and original green evidence

The direct B1 regression remains closed: recomputing a tampered State row/hash
without changing its marker causes frozen WO-04A and WO-04B reads to fail
closed, and WO-04B adds no domain/Fact/Relation row or axis advance. The focused
regression also preserves the intended frozen WO-04A behavior that a later
State commit may reduce the row-shaped predecessor; WO-04B now independently
rejects the resulting incomplete authority chain.

The original green evidence was rechecked and retained: Fact four-axis and
reason invariants; Relation pairings, confidence, endpoint isolation and graph
bounds; strict grammar/NFC/accessor/bounds checks; policy/error classification;
canonical request/result tamper detection; atomic rollback; concurrency;
migration; Raw provenance; current/exact/replay/reopen consistency; root/private
encapsulation; and MCP exact-nine. Runtime enumeration returned the same nine
commands in the frozen order, and no Fact/Relation Store, migration function,
generic revision writer or substrate capability was exported or recoverable by
Core own-key reflection.

## 17. Commands and results

- Focused run: `npx vitest run test/canonical-fact-relation.test.ts
  test/canonical-state.test.ts test/revision-substrate.test.ts
  test/ledger-hot-raw.test.ts test/core-boundary.test.ts
  test/mcp-service.test.ts` — PASS, **6 files / 53 tests**.
- Full suite: `npm test` — PASS, **34 files passed, 1 skipped; 521 tests passed,
  1 skipped**.
- Build: `npm run build` — PASS (`tsc -p tsconfig.json`).
- `git diff --check` for the second fix and the worktree — PASS.
- Exact parent/ancestry, five-path second-fix allowlist, overall routed
  allowlist, source/frozen hashes, policy hash, root/private, exact-nine and
  frozen/prohibited-path audits — PASS.
- Independent B2 laundering, adjacent-vector regression, legal Ledger-progress,
  direct-B1 and 101-key probes used only fresh SQLite files under the system
  temporary directory. Two preliminary QA-only adjacency fixtures stopped
  before tamper assertions (an invalid Relation pairing and a diagnostic query
  against a nonexistent ordering column); the corrected isolation probe above
  then passed. An initial exact-nine script likewise used the wrong expected
  order and was corrected against the frozen command list. None was a product
  failure or changed repository files.
- QA used no network, remote model, production data, credential, sibling Host
  repository or destructive command.

## 18. Disposition

**ACCEPTED.** WO-04B is complete at Builder candidate
`8758f68bf4c6b604ae37fad13d15ca7e98c08bfc`. The accepted implementation proves
the full State authority chain from revision `1` through the exact observed
revision within the same WO-04B SQLite snapshot, permits component-wise forward
progress between State commits, rejects regression or any broken link, and
keeps frozen `src/canonical-state.ts` unchanged.

QA modified only this append-only QA record. It did not modify Builder paths,
PROJECT_STATE, ROADMAP or the work order, did not implement a fix, and did not
begin WO-04C or WO-05.
