# WO-04C Builder Handoff — Semantic Takeover / Enrichment / Frontier / Compaction

Status: **BUILDER COMPLETE / AWAITING INDEPENDENT QA**<br>
Work order: `docs/work-orders/WO-04C-semantic-takeover-enrichment-frontier-compaction.md`<br>
Source baseline: `c3a184f9c067d529e8f2908080ab72650fb59cbc`<br>
Execution-baseline commit: `6b77ed06b250176fd9cff16b35ab1c3d4701c9a2`<br>
Pre-source Composition Gate commit: `cf049f2`<br>
Builder parent: `31345f9d0ec160342ccc90919e7468e9f0dd3993`<br>
Builder candidate: the commit containing this handoff. Independent QA must resolve and pin
the exact candidate commit before review.

## Bounded result

WO-04C delivers one Core-owned authority composition path:

- contiguous Semantic Takeover from `frontier_position + 1` through one exact Raw range;
- atomic `TAKEOVER_FRONTIER` vector transition, domain row, optional new Fact/Relation
  revisions, immutable Compaction Artifact and substrate marker;
- exact-reference-only Canonical State authority with no State-axis advance;
- non-contiguous Semantic Enrichment that must create at least one new Fact/Relation
  revision and leaves all five primary axes unchanged;
- exact Takeover, Enrichment, Artifact and current Frontier/Takeover reads;
- additive versioned persistence, immutable guards, fail-closed migration and replay; and
- Core library-only methods without changing the accepted nine-command MCP port.

The candidate does not add Snapshot/Working Context behavior, Host/provider/model/network
integration, a background compaction scheduler, retrieval changes, automatic extraction or
Raw deletion. It does not begin WO-05.

## Composition and ownership

`SqliteAuthorityTransactionCoordinator` is the only fixed cross-domain composition entry and
is held in a JavaScript private field by `ContextCompilerCore`. It does not escape the package
root or Core reflection boundary.

Takeover uses the frozen WO-03A `commitTakeoverFrontierInsideCore` callback and its single
SQLite handle:

```text
strict normalization
→ frozen substrate BEGIN IMMEDIATE + double CAS
→ exact contiguous Raw range and State-chain proof
→ optional Fact/Relation owner same-handle apply
→ exact final authority and one-to-one coverage proof
→ immutable Artifact + Takeover domain row
→ frozen vector/marker write
→ COMMIT
→ one-snapshot exact cross-domain read
```

Enrichment uses one coordinator-owned `BEGIN IMMEDIATE` transaction, never calls a Frontier
or Takeover primitive, applies a fresh Fact/Relation owner batch, persists its own immutable
domain identity, verifies the vector remains byte-equivalent, commits and performs one-snapshot
exact readback.

Canonical State remains reference-only in v1. The new Core-private State seam verifies every
revision from `1..observed`, including deterministic reduction, Raw provenance, frozen policy,
substrate request/fingerprint/result and adjacent vector bindings. Canonical Fact/Relation keeps
its accepted public writer behavior while exposing only Core-private same-handle normalize,
apply and exact-read seams; policy, schema, reducer, object revisions and validation remain with
that owner. No second State or Fact/Relation writer was introduced.

## Frozen grammar, policy and persistence

```text
semantic_policy_version: semantic-takeover/v1
semantic_policy_hash: dc1432f8e65911fb114c87921f14e6b3111b23dcd03278a5d13f7c4632e54467
semantic_schema_version: 1
takeover_operation: TAKEOVER_FRONTIER
takeover_kind: SEMANTIC_TAKEOVER_COMMIT_V1
state_mode: exact-reference-only-no-axis-advance
enrichment_transition: axis-neutral-fact-relation-only
artifact_hash: sha256(canonical JSON descriptor)
```

The additive schema owns:

```text
cc_semantic_authority_schema
cc_semantic_takeover_commits
cc_semantic_enrichment_commits
cc_compaction_artifacts
```

All four tables have update/delete rejection triggers. Migration is completion-last under
`BEGIN IMMEDIATE`, validates exact schema SQL/columns and fails closed on partial collision or
forged completion. Unrelated legacy tables are not backfilled.

Each covered Raw revision has exactly one same-order coverage disposition. `canonicalized`
must point to source-bound exact State/Fact/Relation authority; `artifact_only` must have no
authority refs and one closed reason. Missing, duplicate, wrong-order, cross-scope or
after-ledger evidence cannot advance the Frontier.

Artifact identity/hash binds scope, exact range, generator version, semantic policy,
provenance Event IDs and canonical body. Existing-identity normalized substitution is stable
`CONFLICT`; a new unsupported policy or mismatched expected Artifact hash is `INVALID_INPUT`.

## Builder change surface

Relative to the Builder parent `31345f9`, the candidate changes exactly these authorized paths:

```text
docs/handoffs/WO-04C-semantic-takeover-enrichment-frontier-compaction.md
src/authority-transaction-coordinator.ts
src/semantic-takeover.ts
src/canonical-state.ts
src/canonical-fact-relation.ts
src/core.ts
src/index.ts
test/authority-transaction-coordinator.test.ts
test/semantic-takeover.test.ts
test/core-boundary.test.ts
```

The Execution Baseline and pre-source Composition Gate are earlier standalone commits. The
docs-only downstream-adjustment register chain through `31345f9` did not alter source, schema,
tests, configuration, dependencies or official artifacts before Builder implementation.

Frozen dependency/config fingerprints remain:

```text
9ab332bbf3c53555cafb9d90c6709e6c371ccf8bb3ccc68afe48be85697c9599  src/revision-substrate.ts
2210d5436daada36e34af3c8c4c03575c53ac499eadb662a2fd3bff90002eda2  src/ledger-hot-raw.ts
ef2c9f996d6d43b9b1f76d3c34e765eb77d96f31720ca1a9ba9e8baf332dcb9  package.json
189da4e3b0f7c2b3771fb5aee021b68df401630d369ed0425812fbcac4702559  tsconfig.json
```

Builder source fingerprints before the candidate commit:

```text
298efbe6b3316e6c4839354fdd41ca9ccb5d705b8f0b3e51486ea22a99be623f  src/authority-transaction-coordinator.ts
da0ca2bf3d183ba20255cb0296cba5d80568ec4ed8f01cc4f48f5775515f20d7  src/semantic-takeover.ts
58c6fe5d0a6e8ae75ca6c31ccfba7b02f9d28f79c7ad3acd6a8439240e02334c  src/canonical-state.ts
3cf64b8a1c1dde8cb4ea9986ae32f52bb171223888bbce4da9cff723a8fe9245  src/canonical-fact-relation.ts
0f4d7fe4ae896c6d6d5c817e48f729f1e7e0a4461b7a1c7410eadca7cf3f886a  src/core.ts
b6b158ddc69d4aa45dc2a93ef1482384472bb3dff7d908e1dc3eda8ad08a241b  src/index.ts
```

## Verification evidence

Completed on 2026-08-25:

```text
npm run build
  PASS — tsc -p tsconfig.json

npx vitest run test/semantic-takeover.test.ts \
  test/authority-transaction-coordinator.test.ts \
  test/canonical-state.test.ts \
  test/canonical-fact-relation.test.ts \
  test/core-boundary.test.ts
  PASS — 5 files; 50 tests

npm test
  PASS — 36 files passed, 1 skipped; 544 tests passed, 1 skipped

git diff --check
  PASS

runtime command enumeration
  PASS — health, ingest_event, compile_context, get_state,
  prepare_state_update, apply_state_delta, create_headline,
  recall_exact, recall_keyword
```

Focused evidence includes:

- artifact-only Takeover, State exact refs and same-transaction Fact creation;
- contiguous range, start/end/after-ledger, stale double-CAS, omission, duplicate,
  wrong-order, missing and cross-scope coverage attacks;
- exact replay plus body/hash/policy substitution;
- after-range Hot Raw preservation and close/reopen stability;
- non-contiguous axis-neutral Enrichment, substitution and fresh-owner enforcement;
- authority/shadow isolation and absent-scope reads without materialization;
- Raw payload compatibility with accepted non-NFC/control-character payload strings while
  rejecting non-NFC/Cc/cyclic/accessor/exotic/sparse/overflow semantic input;
- immutable triggers and domain/Raw/Artifact tamper detection;
- rollback of Fact rows, Artifact, domain row, vector and marker on injected insert failure;
- rollback of all semantic rows and marker on a real deferred-foreign-key SQLite COMMIT failure;
- real two-worker same-base Takeover race with exactly one winner;
- real concurrent exact Enrichment retry with one owner/domain commit; and
- concurrent fresh/unrelated-legacy first-open migration.

All mutation diagnostics used isolated temporary databases. No network, remote model,
credential, production database, destructive command or sibling Host repository was used.

## Public boundary

The package root exports the semantic policy/schema constants, plain public types and stable
`SemanticTakeoverError`. It does not export the coordinator, migration, SQLite handle, owner
same-handle seams, internal normalize/apply/read functions or substrate capability.

`ContextCompilerCore` exposes library-only methods:

```text
commitSemanticTakeover
commitSemanticEnrichment
readSemanticTakeover
readSemanticEnrichment
readCompactionArtifact
readCurrentSemanticTakeover
```

The MCP command list, schemas and service behavior remain exact-nine and unchanged.

## Known limits and stop conditions

- State v1 is reference-only. Atomic new State inside Takeover requires a separate bounded
  substrate extension and is not implemented here.
- No automatic safe-boundary detector, compaction trigger, extractor or scheduler exists.
- Compaction Artifact is not a Snapshot Manifest and does not enter Working Context.
- Enrichment has no Frontier meaning and cannot be used to claim contiguous Raw coverage.
- Raw remains append-only; Takeover only changes the Hot Raw projection through committed
  Frontier authority.
- No implicit shadow-to-authority promotion or cross-scope authority reference is allowed.

## Independent QA requirements

The Builder does not approve this candidate. Independent QA should at minimum:

1. pin baseline, pre-source commits, Builder parent and exact candidate; verify ancestry and
   the ten-path Builder change surface;
2. independently recompute the semantic policy and Artifact hashes;
3. prove State does not advance, Enrichment changes no primary axis and Takeover performs only
   the frozen Frontier/Takeover transition;
4. reproduce coverage hole/order/scope/provenance and State/Fact/Relation ref failures with
   zero partial progress;
5. inject Artifact, owner row, marker and actual COMMIT failures and verify total rollback;
6. repeat exact-retry/substitution, same-base Takeover race and concurrent Enrichment retry;
7. tamper domain/marker/Raw/State/Fact/Relation/Artifact bindings and require current, exact,
   replay and reopen reads to fail closed;
8. challenge fresh/legacy concurrent migration, partial collision and forged completion;
9. verify after-range Hot Raw, authority/shadow isolation, absent-scope non-materialization,
   Core private ownership and exact-nine MCP behavior; and
10. rerun focused tests, `npm test`, `npm run build` and `git diff --check` without modifying
    the Builder candidate.
