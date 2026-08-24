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
