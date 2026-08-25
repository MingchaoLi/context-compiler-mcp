# WO-05 Builder Handoff — ContextSnapshot Contract

Status: **BUILDER COMPLETE / AWAITING INDEPENDENT QA**<br>
Work order: `docs/work-orders/WO-05-context-snapshot-contract.md`<br>
Planning/source baseline: `0dbff6a8a148f37fcabef7accf7f71d057e1a90f`<br>
Execution-baseline commit: `18a2ab3dc02657200e5d96eec3bfc9a715c316e6`<br>
Pre-source Composition Gate commit: `0c5d2970ef319f2fd19b04648e1c34756abb0f3c`<br>
Accepted blocker fix: WO-04D Builder `39334f94cb1c5ac37587cc261b261b427d2ba1b6`
+ QA `583cefaf12308229b3f3daa24982777bb884922b`<br>
Builder parent: `d21f90b4fc6992c8b63d12800a1c0ae00af5e738`<br>
Builder candidate: the commit containing this handoff; Independent QA must resolve and pin its exact
hash before review.

## Bounded result

WO-05 adds one Core-owned, model/Host-independent freeze path:

```text
explicit scope + exact five-axis vector + Current Input + exact required refs
→ deterministic Current Authority and dependency projection
→ deterministic Frontier-bound Hot Raw suffix
→ priority-bucket whole-object assembly
→ immutable ContextSnapshot + AttemptStarted in one SQLite transaction
```

The Snapshot owner is axis-neutral. It does not mutate Ledger, Frontier, State, Fact, Relation,
Takeover or the shared revision stream. It does not call the frozen v0 assembler/operational-context
path, add an MCP command, infer scope, invoke an Extractor/model/network, implement Retrieval/Summary,
or begin WO-06/07.

## Ownership and transaction

`SqliteContextSnapshotStore` is Core-private and owns only additive Snapshot schema, request
normalization, projection/assembly, immutable persistence and exact reads. A new freeze performs:

```text
normalize + request fingerprint
→ BEGIN IMMEDIATE
→ exact Snapshot/Attempt collision or replay inspection
→ exact expected-vector CAS
→ same-handle Ledger/State/Fact/Relation/Takeover owner reads
→ deterministic selection, closure, assembly and budget gate
→ unchanged-vector proof
→ INSERT immutable Snapshot
→ INSERT immutable AttemptStarted
→ exact policy/body/owner readback
→ COMMIT
```

The exact readback happens before COMMIT, so a deferred-FK COMMIT failure still rolls back both rows.
Replay lookup precedes live-vector equality; an exact retry returns the original after later Raw,
State, Fact/Relation or Takeover advances. ID/request substitution is `CONFLICT`; stored authority,
schema, ref, body or manifest corruption is `CORRUPT_DATA`.

Accepted owner modules gained only caller-handle, transaction-lifecycle-free read seams:

- Ledger: exact historical Frontier-bound Hot Raw and exact as-of Raw refs;
- State: exact latest projection, including proven revision zero;
- Fact/Relation: complete current object projection with commit/object binding proof.

The WO-04D current-semantic correction remains the only change to the Takeover owner and is an
accepted ancestor, not part of this candidate.

## Frozen projection and assembly behavior

The candidate preserves the frozen hashes:

```text
CONTEXT_SNAPSHOT_POLICY_HASH
  038a11d2f29dd9b112f69657e89f069c188b521911509f07c189af128b860c05
CONTEXT_ASSEMBLER_VERSION_HASH
  e66825b13a057ae9648a83068e330c8025729fd77723bdd199d7cc4bd9ef888a
```

Current `GOAL/ACTIVE`, `CONSTRAINT/ACTIVE`, `DECISION/ACTIVE` and `OPEN_QUESTION/OPEN` State is
selected by exact ID. Terminal/deferred/rejected State is excluded unless explicitly required for the
one Snapshot. Active Constraints are pinned. Active `DEPENDS_ON` closure is deterministic over exact
State/Fact identity; a dependency edge remains present even when both endpoints were already selected
roots. No semantic dedup, score, ranker or persistent HOT/COLD state exists.

Current Input is one exact same-scope `user_input` Event inside the frozen Hot range and renders once.
Required Raw can predate Frontier and renders in P0. Remaining Hot Raw is the newest contiguous
whole-Event suffix that fits. The exact current Compaction Artifact is P2 and is either included whole
or recorded as budget-omitted. Mandatory overflow returns `BUDGET_INSUFFICIENT` and leaves no
Snapshot/Attempt.

Stored reads prove exact schema/triggers, request, owner refs and vector monotonicity, then rebuild the
deterministic selection, dependency paths, Hot suffix, body and complete Manifest. This rejects both
body-plus-hash laundering and manifest-only inclusion-reason laundering while preserving exact old
Snapshots after later axis-neutral Fact/Relation commits.

## Persistence and public boundary

The additive owner schema is:

```text
cc_context_snapshot_schema
cc_context_snapshots
cc_context_attempt_starts
six exact update/delete rejection triggers
```

Migration is completion-last and rejects partial collisions or schema/trigger substitution. Snapshot
body and canonical Manifest bytes are persisted immutably. AttemptStarted is a same-transaction
one-to-one freeze receipt, not an Operation/Action lifecycle writer.

`ContextCompilerCore` exposes library-only:

```text
freezeContextSnapshot
readContextSnapshot
readContextAttemptStarted
```

The package root exports only stable constants, plain public types and `ContextSnapshotError`; it does
not export `SqliteContextSnapshotStore`, migrations, same-handle owner seams, SQLite handles or generic
transaction capability. MCP remains exact-nine.

## Exact Builder change surface

Relative to Builder parent `d21f90b`, the candidate changes exactly these authorized paths:

```text
src/context-snapshot.ts
src/ledger-hot-raw.ts
src/canonical-state.ts
src/canonical-fact-relation.ts
src/core.ts
src/index.ts
test/context-snapshot.test.ts
docs/handoffs/WO-05-context-snapshot-contract.md
docs/work-orders/WO-05-context-snapshot-contract.md
docs/PROJECT_STATE.md
docs/ROADMAP.md
```

Frozen source/config fingerprints:

```text
9ab332bbf3c53555cafb9d90c6709e6c371ccf8bb3ccc68afe48be85697c9599  src/revision-substrate.ts
d63b63a62b62d469dbef4ec85815fa2c4c81cd6c394288debe2846428b1ceee1  src/semantic-takeover.ts
298efbe6b3316e6c4839354fdd41ca9ccb5d705b8f0b3e51486ea22a99be623f  src/authority-transaction-coordinator.ts
8e783cc3b4afeb66ea3defdd2c642ae93aff98345dbbe0a248334535296013e3  src/assembler.ts
4d2d537f02102f18331ebbb2374cbe91c86e647c2ab0e95bfa337bd019c52e58  src/operational-context.ts
ef2c9f996d6d43b9b1f76d3c34e765eb77d96f31720ca1a9ba9e8baf332dcb9f  package.json
519fdcf4b874886466032343c25c5e5973679ef5e0ffc3dec5bf32cba3447d88  package-lock.json
189da4e3b0f7c2b3771fb5aee021b68df401630d369ed0425812fbcac4702559  tsconfig.json
```

Builder fingerprints before candidate commit:

```text
34cc2a37eb2c693ec0abd0ea0f3672537d9d6915873e94d9e40909fde70f1272  src/context-snapshot.ts
d9e326ec7b96c77a5f957706928bdc0d58ebaebceadc10ba9cb7c8c79f389253  src/ledger-hot-raw.ts
09cb38cd30b2d4dee2684f4c3fefbe5fb2e01bcf8a0faf7204efbea93fd0e663  src/canonical-state.ts
cc2dd5fe8d3f97a63364871ff63d0830dd658447c006be1675522f9bba0a95ae  src/canonical-fact-relation.ts
37f77c47455106e67c91c7a44f2693fbf6eff7136ac8f5ca4b27f0eaccf8cde8  src/core.ts
2d711e2e454703b5563e4856fb8be0330a42936fd440c983707e1816f3e8eec0  src/index.ts
0aaf1fd7b5f5d822488ab0579567cbcfa8a28b53706a85f26dfbbf5f074b3f6b  test/context-snapshot.test.ts
```

## Verification evidence

Completed on 2026-08-25 using isolated temporary SQLite databases:

```text
npx vitest run test/context-snapshot.test.ts test/semantic-takeover.test.ts \
  test/core-boundary.test.ts test/canonical-state.test.ts \
  test/canonical-fact-relation.test.ts test/ledger-hot-raw.test.ts
PASS — 6 files; 70 tests

npm test
PASS — 37 files passed, 1 skipped; 564 tests passed, 1 skipped

npm run build
PASS — tsc -p tsconfig.json

git diff --check
PASS
```

The focused Snapshot suite has 19 tests covering exact projection/required history, dependency
closure, whole-object trim, overflow, Raw grammar compatibility, scope/ref/identity conflicts,
permutation, exact replay after later commits, real two-worker retry, true COMMIT rollback,
immutability/reopen, Takeover Artifact inclusion/omission, owner-row loss, schema collision, body/hash
laundering and manifest-only policy forgery. No network, remote model, credential, production DB,
destructive command or sibling Host repository was used.

## Known limits and stop conditions

- Snapshot is library-only in WO-05; no Host adapter or MCP command consumes it yet.
- Fact/Relation has no shared revision axis. Old Snapshot reads prove all frozen exact refs and rebuild
  their selected graph, but do not claim a complete historical enumeration of Fact/Relation objects
  omitted from the immutable Manifest.
- P3 historical retrieval and Evidence fields are empty. WO-06 must not bypass the frozen Snapshot.
- AttemptStarted is only a freeze receipt. WO-07 owns later Operation/Action lifecycle.
- Token estimation is the frozen deterministic character-count approximation, not provider tokenization.
- No automatic compaction trigger, Extractor, Summary, ranking, semantic dedup or placement policy is
  introduced.

## Independent QA requirements

The Builder does not approve this candidate. Independent QA should at minimum:

1. pin candidate/parent/baseline/Gate/WO-04D ancestry and verify the exact eleven-path surface;
2. independently recompute both frozen policy hashes and inspect package-root/Core/MCP privacy;
3. reproduce current/default-excluded/explicit-required State, dependency closure and exact Raw refs;
4. challenge budget priority, contiguous suffix, mandatory overflow and Artifact whole-object omission;
5. reproduce exact retry, ID/request substitution and a real same-base two-process race;
6. inject actual COMMIT failure and prove no Snapshot/Attempt half-commit;
7. advance Raw/State/Fact/Relation/Takeover after freeze and require old exact replay;
8. tamper request/Manifest/body/Attempt/Raw/State/Fact/Relation/Takeover/Artifact/schema/trigger bindings
   and require read/replay/reopen to fail closed;
9. verify frozen owner/v0/MCP behavior with focused/full regression and build; and
10. write a separate QA report/commit without modifying the Builder candidate.
