# WO-04C Independent QA — Semantic Takeover / Enrichment / Frontier / Compaction

Status: **ACCEPTED / PASS**

## Fixed candidate

```text
repository: /path/to/context-compiler-mcp
branch: main
candidate: 6642e4c04f4b7a5ff684c0399e4f83be075724f5
parent: 31345f9d0ec160342ccc90919e7468e9f0dd3993
source baseline: c3a184f9c067d529e8f2908080ab72650fb59cbc
execution-baseline commit: 6b77ed06b250176fd9cff16b35ab1c3d4701c9a2
environment: Node.js v25.6.1; npm 11.9.0; SQLite via node:sqlite
```

Before review, Independent QA verified `main`, exact candidate HEAD, exact first
parent, baseline ancestry and an empty
`git status --porcelain=v1 --untracked-files=all`. No candidate identity or
cleanliness blocker was present.

## Result

The fixed candidate satisfies the WO-04C acceptance contract. No blocker was
reproduced. The candidate is accepted for the bounded Core-owned Semantic
Takeover / Enrichment / Frontier / Compaction authority result only. This PASS
does not authorize WO-05, Snapshot/Working Context, Host/provider integration,
automatic extraction, scheduling, retrieval changes or Raw deletion.

## Candidate surface and frozen baseline

The candidate changes exactly ten paths relative to the fixed parent:

```text
docs/handoffs/WO-04C-semantic-takeover-enrichment-frontier-compaction.md
src/authority-transaction-coordinator.ts
src/canonical-fact-relation.ts
src/canonical-state.ts
src/core.ts
src/index.ts
src/semantic-takeover.ts
test/authority-transaction-coordinator.test.ts
test/core-boundary.test.ts
test/semantic-takeover.test.ts
```

This is an exact subset of the frozen maximum Builder allowlist and contains no
additional source/test/schema/config path. Independent diff checks against the
source baseline found no change to the frozen substrate, Raw replay, package,
TypeScript configuration, MCP implementation/tests or evaluation tree.

Recomputed current file fingerprints were:

```text
9ab332bbf3c53555cafb9d90c6709e6c371ccf8bb3ccc68afe48be85697c9599  src/revision-substrate.ts
2210d5436daada36e34af3c8c4c03575c53ac499eadb662a2fd3bff90002eda2  src/ledger-hot-raw.ts
ef2c9f996d6d43b9b1f76d3c34e765eb77d96f31720ca1a9ba9e8baf332dcb9f  package.json
519fdcf4b874886466032343c25c5e5973679ef5e0ffc3dec5bf32cba3447d88  package-lock.json
189da4e3b0f7c2b3771fb5aee021b68df401630d369ed0425812fbcac4702559  tsconfig.json
```

The candidate adds no network/provider/credential dependency and does not
change accepted legacy, retrieval, evaluation or official-artifact behavior.

## Independent static verification

The mechanical call chain was independently checked against source rather than
accepted from the Builder handoff:

- Takeover enters the frozen `commitTakeoverFrontierInsideCore` capability. Its
  single `BEGIN IMMEDIATE` callback handle performs Raw/State/Fact/Relation,
  Artifact and semantic-domain work before the frozen full-vector CAS and
  substrate marker commit.
- The frozen transition changes only `raw_frontier_revision +1`, exact
  `frontier_position`, and `takeover_commit_revision +1`. Ledger and State axes
  remain equal across the Takeover.
- Canonical State is exact-reference-only. The same-handle State owner seam
  validates the complete `1..observed` authority chain; no State apply seam is
  exposed to WO-04C.
- Fact/Relation normalization, apply, object revision allocation, validation
  and exact reads remain in the accepted owner. The coordinator has no generic
  SQL/table/callback surface and does not create a second domain writer.
- Enrichment uses one coordinator-owned `BEGIN IMMEDIATE`, requires a fresh
  Fact/Relation owner commit, checks the complete five-axis vector for equality
  before COMMIT, and never calls a Frontier/Takeover mutation primitive.
- Coverage is one-to-one and in Ledger order. A canonicalized disposition must
  resolve to same-scope source-bound exact State/Fact/Relation authority; an
  artifact-only disposition has no authority refs and requires one closed
  reason.
- Exact Takeover reads bind domain request/result, substrate request/result,
  previous/current vectors, complete Raw range, State chain, Fact/Relation
  owner commits and objects, coverage, Artifact descriptor/hash and live vector
  in one read snapshot.
- Schema completion is last; exact schema SQL/columns and all immutable triggers
  are validated on open. Partial collision and forged completion fail closed.

The semantic policy descriptor was independently canonicalized and hashed to:

```text
dc1432f8e65911fb114c87921f14e6b3111b23dcd03278a5d13f7c4632e54467
```

This equals both the frozen architecture literal and the runtime export. An
independent Artifact fixture using nested out-of-order object keys canonicalized
to hash:

```text
80cfe09732ce68902f8f2b0454d1cb351867882bac6835acd2716a220369c446
```

The Artifact descriptor binds schema, scope, exact covered range, generator,
semantic policy, ordered provenance and canonical body. Artifact ID and commit
time are correctly excluded from content bytes while remaining immutable row
bindings.

## Independent dynamic verification

All database-writing diagnostics used isolated temporary SQLite databases.
There was no network, remote model, credential, production database or sibling
repository access.

### Focused checks

```text
npx vitest run test/semantic-takeover.test.ts \
  test/authority-transaction-coordinator.test.ts \
  test/canonical-state.test.ts \
  test/canonical-fact-relation.test.ts \
  test/core-boundary.test.ts

PASS — 5 files; 50 tests
```

The executed cases reproduced contiguous Takeover, exact replay, reopen, Hot
Raw after-range preservation, exact State references, same-transaction
Fact/Relation apply, non-contiguous axis-neutral Enrichment, coverage/range/CAS
failures, scope isolation, migration collision, immutable guards, rollback,
real worker concurrency and public-boundary behavior.

The focused suite exercised a real deferred-foreign-key COMMIT failure triggered
after the Artifact insert. The failed COMMIT left no semantic row, Artifact,
substrate marker, deferred child row or Frontier/Takeover revision allocation.
It also exercised a two-worker same-base Takeover race with exactly one winner,
and concurrent exact Enrichment retry with exactly one owner/domain commit.

### Independent composite tamper / reopen / replay injection

Independent QA additionally constructed a Takeover containing:

```text
exact committed State ref
+ same-transaction Fact create
+ same-transaction typed Relation create
+ two-event canonicalized coverage
+ immutable Compaction Artifact
```

For each attack class, QA used a fresh isolated database, temporarily removed
the exact immutable guard, changed or removed one bound row, restored the exact
guard SQL, closed and reopened all stores, then tried both exact read and exact
retry. Every pair failed closed as `CORRUPT_DATA`:

```text
Raw                 read=CORRUPT_DATA  replay=CORRUPT_DATA
State               read=CORRUPT_DATA  replay=CORRUPT_DATA
Fact                read=CORRUPT_DATA  replay=CORRUPT_DATA
Relation            read=CORRUPT_DATA  replay=CORRUPT_DATA
Compaction Artifact read=CORRUPT_DATA  replay=CORRUPT_DATA
Semantic domain row read=CORRUPT_DATA  replay=CORRUPT_DATA
Substrate marker    read=CORRUPT_DATA  replay=CORRUPT_DATA
```

This independently confirms composite tamper propagation through owner and
cross-domain bindings rather than only standalone owner validation.

### Full regression and build

```text
npm test
PASS — 36 files passed, 1 skipped; 544 tests passed, 1 skipped

npm run build
PASS — tsc -p tsconfig.json

git diff --check
PASS
```

The skipped test is the pre-existing official feasibility result generator; it
is not a WO-04C failure.

Runtime command enumeration remained exact-nine and in the accepted order:

```text
health
ingest_event
compile_context
get_state
prepare_state_update
apply_state_delta
create_headline
recall_exact
recall_keyword
```

The MCP source/test blobs are unchanged from the execution baseline, and the
full stdio MCP protocol tests passed. Package-root and Core-reflection checks
found no coordinator, migration, same-handle owner seam, transaction capability,
generic writer or SQLite handle exposure.

## Acceptance decision

**ACCEPTED / PASS.** The candidate meets the explicit-scope, contiguous
Frontier double-CAS, transaction atomicity, exact State-reference, owner-bound
Fact/Relation, complete coverage, immutable Artifact, axis-neutral Enrichment,
replay/concurrency/migration/tamper/reopen, Hot Raw, Core-private and MCP
exact-nine requirements. No source fix or scope expansion is required.

Non-blocking environment note: QA ran on Node.js v25.6.1, which satisfies the
declared `>=24` engine; exact Node.js 24 was not separately rerun.
