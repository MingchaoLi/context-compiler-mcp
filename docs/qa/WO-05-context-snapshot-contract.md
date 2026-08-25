# WO-05 Independent QA — ContextSnapshot Contract

Status: **FAIL / RETURN TO IMPLEMENTATION**

Reviewed Builder candidate: `c8c37b4beb230d2c37017b9c9d65aefa7e180eaa`<br>
Expected parent: `d21f90b4fc6992c8b63d12800a1c0ae00af5e738`<br>
Review date: 2026-08-25

## Verdict

The candidate is returned. A QA-authored isolated-database counterexample proves that a stored
Snapshot can silently lose a `DEPENDS_ON` Relation, its dependency Fact, its dependency path, and the
corresponding Working Context content while `readContextSnapshot` still succeeds. This violates the
frozen deterministic dependency projection and the required Manifest/body/Relation fail-closed
contract.

The passing Builder suites, full regression, build, candidate surface, hashes, transaction rollback,
and public-boundary checks do not close this omission attack.

## Blocking finding

### P0 — coordinated dependency omission is accepted as an exact stored Snapshot

Expected behavior:

- a current active `DEPENDS_ON` edge reachable from a selected State root must select the Relation and
  dependency Fact;
- the exact selected graph, Manifest, and Working Context are immutable and owner-bound;
- Manifest/body/Relation-ref tamper must fail closed on read, replay, and reopen.

QA counterexample:

1. In a fresh temporary SQLite database, append committed Raw, commit active State `goal`, commit Fact
   `fact`, and commit active Relation `depends` from `STATE_ITEM:goal` to `FACT:fact`.
2. Freeze `snapshot` with no explicit Fact or Relation refs. The original Manifest correctly contains
   one `DEPENDENCY_CLOSURE` Fact, one `DEPENDENCY_CLOSURE` Relation, and one dependency path.
3. Close Core. Without modifying any Ledger, State, Fact, Relation, Takeover, or revision owner row:
   - temporarily remove the exact Snapshot and Attempt update-rejection triggers;
   - remove `selected_fact_refs`, `selected_relation_refs`, and `dependency_paths` from the Manifest;
   - replace the Fact and Relation body lines with the canonical `[none]` sections;
   - recompute `working_context_hash`, estimated tokens, canonical `manifest_json`, `manifest_hash`, and
     the Attempt's `snapshot_manifest_hash`;
   - restore the exact frozen triggers.
4. Reopen `ContextCompilerCore` and call `readContextSnapshot(scope, "snapshot")`.

Observed result:

```json
{
  "accepted": true,
  "selected_fact_refs": [],
  "selected_relation_refs": [],
  "body_contains_fact": false
}
```

This is not a missing-hash-only probe. The forged row is internally canonical, all local hashes and
Attempt binding agree, and exact schema/trigger validation passes. The unchanged authoritative
Relation and Fact still exist in their owner tables, but the read returns a Snapshot that silently
omits them.

Static root cause:

- freeze builds adjacency from the complete current projection in `selectWorld`;
- stored validation calls `readCanonicalFactRelationAuthorityInsideCore` with only
  `manifest.selected_fact_refs` and `manifest.selected_relation_refs`;
- it then supplies only those caller-controlled listed refs as the `factRelationProjection` used to
  rebuild closure and the body (`src/context-snapshot.ts`, lines 1160–1167 and 1220–1236 at the fixed
  candidate).

Therefore removal from the Manifest also removes the object from the validation graph. Unlike State
and Raw, the validator has no independently bound complete Fact/Relation as-of projection from which
to prove that the selected dependency was omitted.

Minimum repair direction:

- give exact replay an authoritative, complete Fact/Relation as-of projection commitment/enumeration
  that is independent of the selected refs, and rebuild dependency closure from that complete frozen
  projection;
- because Fact/Relation writes are axis-neutral and later writes can occur at the same five-axis
  vector, do not substitute a read of the current projection for a historical as-of proof;
- if the accepted owner cannot expose an exact historical high-water/projection seam without a new
  sequencing or owner-side receipt contract, reopen the pre-source Gate for that bounded substrate
  decision rather than weakening fail-closed behavior;
- add a regression that performs the coordinated Relation + Fact + path + body omission above, both
  before and after a later axis-neutral Fact/Relation commit. Merely adding another hash inside the
  same mutable Manifest is not an independent proof.

No production source, work order, Gate document, or Builder handoff was modified by QA.

## Repository and candidate pinning

Independently observed before QA writes:

- branch: `main`;
- `main` and `HEAD`: `c8c37b4beb230d2c37017b9c9d65aefa7e180eaa`;
- direct parent: `d21f90b4fc6992c8b63d12800a1c0ae00af5e738`;
- initial worktree: clean;
- planning/source baseline `0dbff6a8a148f37fcabef7accf7f71d057e1a90f`, Execution Baseline
  `18a2ab3dc02657200e5d96eec3bfc9a715c316e6`, pre-source Gate
  `0c5d2970ef319f2fd19b04648e1c34756abb0f3c`, WO-04D Builder
  `39334f94cb1c5ac37587cc261b261b427d2ba1b6`, and WO-04D QA
  `583cefaf12308229b3f3daa24982777bb884922b` are all ancestors of the candidate;
- Execution Baseline is a direct child of the planning/source baseline and only adds
  `docs/inventory/WO-05/execution-baseline-manifest.md`;
- the Gate is a direct child of the Execution Baseline and changes only the routed architecture,
  schema-map, work-order, and project-state/roadmap documents;
- no submodules were present.

Relative to the fixed parent, the candidate changes exactly the eleven handoff-declared authorized
paths:

```text
docs/PROJECT_STATE.md
docs/ROADMAP.md
docs/handoffs/WO-05-context-snapshot-contract.md
docs/work-orders/WO-05-context-snapshot-contract.md
src/canonical-fact-relation.ts
src/canonical-state.ts
src/context-snapshot.ts
src/core.ts
src/index.ts
src/ledger-hot-raw.ts
test/context-snapshot.test.ts
```

`git diff --check d21f90b..c8c37b4` passed. Frozen substrate, Takeover, coordinator, v0 assembler,
operational-context, MCP, package/config, and MCP test paths have no candidate diff; their SHA-256
values also match the handoff.

## Independently reproduced checks

### Policy identity

The hashes were recomputed from the frozen architecture bytes, not read back from the Builder
constants:

```text
CONTEXT_SNAPSHOT_POLICY_HASH
038a11d2f29dd9b112f69657e89f069c188b521911509f07c189af128b860c05

CONTEXT_ASSEMBLER_VERSION_HASH
e66825b13a057ae9648a83068e330c8025729fd77723bdd199d7cc4bd9ef888a
```

Both match the Gate and candidate.

### Dynamic and static matrix

- QA reran the focused direct dependency suites: **6 files passed / 71 tests passed**. The fixed
  candidate currently has 71 focused tests, although the handoff records 70.
- A separate QA-authored matrix reproduced default current State, default-excluded terminal State,
  explicit required deferred State, a terminal State selected only by dependency closure,
  root-to-root and transitive dependency paths, and rejection of an attempted active dependency
  cycle (`CONFLICT`).
- The same matrix reproduced Current Input + explicit required Raw dedup: the Current Input rendered
  once and its Hot Raw ref carried `CURRENT_INPUT` + `EXPLICIT_REQUIRED`.
- The focused suite independently reran whole-event Hot Raw suffix trimming, mandatory overflow with
  no Snapshot/Attempt rows, ID/request substitution, exact retry, true concurrent same-ID freeze,
  actual deferred-FK COMMIT failure rollback, partial migration, reopen, Artifact include/omit,
  Raw-owner loss, body/hash laundering, and inclusion-reason forgery fixtures.
- The QA matrix additionally added a later Relation commit and confirmed it did not enter the old
  Snapshot; the focused fixtures covered later Raw, State, Fact, Frontier, and Takeover changes.
- Static inspection confirmed one Snapshot owner and one `BEGIN IMMEDIATE` transaction, read-only
  same-handle domain seams, axis-neutral Snapshot writes, Snapshot-before-Attempt insertion, pre-COMMIT
  exact readback, and rollback on failure.
- Runtime/public inspection found exactly nine frozen commands and only the three intended
  library-level Core Snapshot methods. The package root did not export `SqliteContextSnapshotStore`,
  its migration, same-handle seams, SQLite handles, or generic transaction capability. Full MCP
  service/protocol tests passed.

These successes are recorded as independently rerun evidence, not as acceptance; the blocking
omission counterexample remains.

## Commands and results

```text
npx vitest run test/context-snapshot.test.ts test/semantic-takeover.test.ts \
  test/core-boundary.test.ts test/canonical-state.test.ts \
  test/canonical-fact-relation.test.ts test/ledger-hot-raw.test.ts
PASS — 6 files / 71 tests

npm test
PASS — 37 files passed, 1 skipped / 564 tests passed, 1 skipped

npm run build
PASS — tsc -p tsconfig.json

git diff --check d21f90b4fc6992c8b63d12800a1c0ae00af5e738..\
  c8c37b4beb230d2c37017b9c9d65aefa7e180eaa
PASS
```

The QA-authored coordinated dependency-omission probe produced the blocking unexpected acceptance
shown above.

## Environment and limits

- macOS / Darwin `25.5.0`, arm64;
- Node.js `v25.6.1`, npm `11.9.0`;
- all QA databases were fresh temporary files below the OS temporary directory;
- no network, remote model, credential, production database, sibling Host repository, or destructive
  repository command was used;
- exact Node.js 24 and Windows were not rerun.

The environment limits do not affect the deterministic SQLite omission counterexample.
