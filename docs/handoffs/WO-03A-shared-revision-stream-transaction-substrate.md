# WO-03A Builder Handoff — Shared Revision / Stream / Transaction Substrate

Status: **BUILDER FIX COMPLETE / AWAITING INDEPENDENT RE-QA**<br>
Work order:
`docs/work-orders/WO-03A-shared-revision-stream-transaction-substrate.md`<br>
Source baseline HEAD: `94f18b702b7eceda9e8afac7cc3d88abddbfb7da`<br>
Planning authority commit: `94f18b702b7eceda9e8afac7cc3d88abddbfb7da`<br>
Expected parent: `8204ccc484cdc2a36218dc5f4a350f5d1c607f50`<br>
Builder candidate HEAD: the commit containing this handoff; Independent QA must
resolve and pin that exact commit before review.

Original Builder candidate:
`37765798c9be061d3dfe38adc7484d691a3f1ea8`<br>
Independent QA rejection commit:
`99ab4445d7568c2b89c2550af739a1a49766adc2`<br>
Fixed candidate HEAD: the append-only commit containing this updated handoff;
Independent re-QA must resolve and pin that exact commit before review.

## Append-only QA-return fix

Independent QA confirmed the baseline, allowlist, main transaction path,
four-axis behavior, current compatibility, focused 18-test run, full 486-test
run, and build, but rejected the original candidate with four reproducible
contract counterexamples. This fix closes exactly those findings:

1. Core now owns the substrate in a JavaScript private field. Substrate mutation
   uses a module-private WeakMap capability backed by a JavaScript private
   method, so runtime reflection over public Core/substrate instances exposes no
   substrate property or generic mutation symbol/SQLite callback path.
2. Stored descriptor validation now binds descriptor scope, commit ID,
   operation, and kind to marker columns and binds State/Frontier CAS plus next
   position to the persisted previous/current vectors. A coordinated descriptor
   plus fingerprint substitution fails `CORRUPT_DATA`.
3. Reopen validates normalized `sqlite_master` SQL for every schema table and
   immutable trigger, in addition to column order and version. A same-name fake
   completion lacking PK/FK/CHECK/NOT NULL or real trigger bodies fails closed.
4. Scope validation rejects the complete Unicode `Cc` control category,
   including C1 U+0085 and U+009F, before mutation.

Regression coverage reproduces all four QA attacks. The retained rejection is
an audit commit; this Builder fix is append-only and does not rewrite it.

## Bounded result

WO-03A delivers the common Core-owned substrate required by later routed domain
writers:

- explicit `(namespace, stream_id)` scope with isolated `authority` and
  `shadow:<experiment_id>` storage;
- four independent per-scope revision axes plus a non-axis frontier position;
- one SQLite `BEGIN IMMEDIATE` transaction protocol for callback rows, vector
  CAS, immutable commit marker, and result replay;
- internally fingerprinted, byte-exact normalized request replay;
- State expected-revision CAS, Frontier revision/position double-CAS, separate
  takeover commit identity/order, and atomic takeover-plus-frontier primitive;
- transactional additive migration with a version/completion proof;
- Core lifecycle ownership and a read-only scoped vector query.

This candidate does not implement WO-03B Hot Raw behavior, WO-04 semantic
State/Fact/Relation or Takeover policy, snapshots, workers, shadow routing,
promotion, provider selection, or Host integration.

## Execution baseline

`docs/inventory/WO-03A/execution-baseline-manifest.md` froze a clean `main`
worktree at the planning authority commit before source implementation. It pins
the accepted WO-02 candidate and QA ancestry, no submodules, configuration
fingerprints, and the authorized change policy.

No repository-authority, source, schema, test, configuration, dependency,
evaluation, or official-artifact drift occurred outside the WO-03A allowlist.

## Delivered paths

```text
docs/architecture/WO-03A-shared-revision-stream-transaction-substrate.md
docs/handoffs/WO-03A-shared-revision-stream-transaction-substrate.md
docs/inventory/WO-03A/execution-baseline-manifest.md
docs/inventory/WO-03A/substrate-schema-transaction-map.md
src/core.ts
src/index.ts
src/revision-substrate.ts
test/core-boundary.test.ts
test/revision-substrate.test.ts
```

No other path is part of the Builder candidate.

## Schema and migration fingerprint

Original candidate source fingerprints before the rejection:

```text
ce297f950c8e4f819772a8718872633bb883ac63e962898fad67fa5e29d386bd  src/revision-substrate.ts
9e5e7b9158f6ae129eb511477ab1774a6df20f036217a937aef20553af8563b7  src/core.ts
f5d9c57a895ec863ce4b66ea28590d2f78a0ff255d57fe027a6cc59244994a78  src/index.ts
```

The SHA-256 of the final `migrateRevisionSubstrate` function source fragment
(lines 405–513 at handoff generation) is:

```text
b7fd5f8098b9851b6c8229291caf493de90dc052f3bb4ead3fbf20a34261d552
```

Fixed-candidate source fingerprints after the QA-return changes:

```text
9ab332bbf3c53555cafb9d90c6709e6c371ccf8bb3ccc68afe48be85697c9599  src/revision-substrate.ts
2c0a0e8e1dd41c8221c0cf44804876b5ca6e58ab1f1b0272c19f73fe28f57453  src/core.ts
f5d9c57a895ec863ce4b66ea28590d2f78a0ff255d57fe027a6cc59244994a78  src/index.ts
```

Fixed schema-definition and migration-function source-fragment fingerprints:

```text
648cef491a043ac4357646427457535b08f0702b510364e0106e7b7ae3dd1821  schema definitions
7756f0b2f849ea22430e89e6689e9cf7535e80db6188c08ad162aedca26ee9b2  migration function
```

Schema version is `1`. Its objects are:

```text
cc_revision_substrate_schema
cc_revision_streams
cc_revision_commits
cc_revision_commits_no_update
cc_revision_commits_no_delete
cc_revision_schema_no_update
cc_revision_schema_no_delete
```

The migration is additive and does not alter/backfill legacy tables. DDL,
exact schema SQL validation, and the completion row share one transaction; a
substrate-name collision or forged completion fails closed.

## Scope and axis contract

Scope is always explicit plain data. `authority` and non-blank
`shadow:<experiment_id>` are the only namespace forms. `stream_id` remains an
opaque continuity identity. There is no Host/provider lookup, session alias, or
legacy backfill.

The persisted vector is:

```text
ledger_revision
state_revision
raw_frontier_revision
frontier_position          # not an axis
takeover_commit_revision
```

An absent scope reads as zero without materializing a row. Every successful
operation advances only its selected axis, except the explicit combined
`TAKEOVER_FRONTIER` primitive, which advances takeover order and frontier
revision together. All values are scoped safe integers and overflow fails
closed.

## Transaction, marker, and replay contract

Every mutation validates input before `BEGIN IMMEDIATE`, then resolves exact
replay or executes a single transaction containing:

```text
scope row ensure
→ current vector read and operation-specific CAS
→ Core-internal domain callback on the same SQLite connection
→ callback result normalization
→ full-vector compare-and-swap
→ immutable commit marker
→ COMMIT
```

The marker primary key is `(namespace, stream_id, commit_id)`. Its canonical
request descriptor binds scope, commit ID, operation, kind, request, and relevant
expected/next CAS fields. The substrate stores both descriptor bytes and its
internally computed SHA-256. Exact replay compares operation, kind, fingerprint,
and canonical bytes, returns the original marker/result, does not rerun the
callback, and does not advance a revision. Any substitution conflicts.

Callback, result-normalization, vector-CAS, marker, or commit failure rolls back
all callback rows and substrate writes. Marker reads recompute the fingerprint,
bind descriptor identity fields to marker columns, and validate CAS fields
against the stored transition; inconsistency fails as `CORRUPT_DATA`.

## Boundary and compatibility proof

- The stable package root exports read types/constants and the substrate error,
  but not the SQLite substrate class, mutation helpers, or transaction context.
- `ContextCompilerCore` owns the fifth SQLite resource in a JavaScript private
  field and exposes only `getRevisionVector(scope)` beyond its accepted
  command/research surface. Reflection reveals no substrate or generic mutation
  method/symbol.
- MCP continues to expose exactly these nine commands in accepted order:
  `health`, `ingest_event`, `compile_context`, `get_state`,
  `prepare_state_update`, `apply_state_delta`, `create_headline`,
  `recall_exact`, `recall_keyword`.
- Current `ingest_event` deliberately leaves the new ledger axis at zero. This
  proves no silent `session_id → stream_id` reinterpretation.
- Baseline diffs for Raw, Experience, State, State update, Reducer, Recall, MCP,
  evaluator, package, lockfile, and TypeScript config are empty.
- Evaluation and official-artifact regression suites remain green.

The internal mutation helpers are a repository-module contract for future
Core-owned domain writers. They are not a stable Host/MCP API or a security
sandbox.

## Builder verification

Final verification completed at `2026-08-24T09:59:45Z`:

```text
npm test
  PASS — 31 files passed, 1 skipped; 486 tests passed, 1 skipped

npm run build
  PASS — tsc -p tsconfig.json

focused revision/Core/MCP service run
  PASS — 3 files, 18 tests

git diff --check
  PASS

exact command enumeration
  PASS — nine commands in accepted order

prohibited baseline-path diff
  PASS — package/config, existing Stores, MCP, evaluator unchanged
```

Focused adversarial cases cover authority/shadow and stream isolation, axis
independence, exact replay and substitution, marker immutability/corruption,
Frontier double-CAS, takeover ID/order, callback and marker rollback, invalid
plain-data/scope/overflow, legacy no-backfill, collision rollback, concurrent
fresh/legacy initialization, and one-winner two-connection State CAS.

No remote model, network, credential, production database, destructive command,
or sibling Host repository was used or accessed. Generated build output was not
added to the candidate.

## Post-rejection fix verification

Final fix verification completed at `2026-08-24T10:25:33Z`:

```text
npm test
  PASS — 31 files passed, 1 skipped; 487 tests passed, 1 skipped

npm run build
  PASS — tsc -p tsconfig.json

focused revision/Core/MCP service run
  PASS — 3 files, 19 tests

B1 public-Core/substrate reflection replay
  PASS — no owned substrate, database field, internal transaction method, or mutation symbol

B2 coordinated State CAS descriptor + fingerprint substitution
  PASS — reopen validates schema; marker read/replay fails CORRUPT_DATA; callback count 0

B3 same-name incomplete completion schema
  PASS — constructor fails closed

B4 U+0085 / U+009F scope mutation
  PASS — INVALID_INPUT before vector allocation

git diff --check
  PASS

prohibited-path and retained-QA diff
  PASS — no package/config/existing Store/MCP/evaluator/QA-record change
```

The append-only fix changes exactly these seven authorized paths relative to
the rejection commit:

```text
docs/architecture/WO-03A-shared-revision-stream-transaction-substrate.md
docs/handoffs/WO-03A-shared-revision-stream-transaction-substrate.md
docs/inventory/WO-03A/substrate-schema-transaction-map.md
src/core.ts
src/revision-substrate.ts
test/core-boundary.test.ts
test/revision-substrate.test.ts
```

The QA rejection record remains byte-identical. Re-QA, not the Builder, decides
whether B1–B4 are closed.

## Known risks and deferred work

- Schema version 1 does not implement future-version upgrades.
- Schema validation verifies exact normalized table/trigger SQL, expected column
  layout, and the single completion version; full-system crash recovery remains
  a later responsibility.
- Shadow support is storage isolation only; no routing, comparison, or promotion.
- Current v0 business writers remain intentionally separate. WO-03B/WO-04 must
  choose explicit scope and domain invariants rather than infer a mapping.
- The Core-internal callback is trusted in-repository code; business-level
  authorization and proposal/coverage correctness belong to the consuming work
  order.
- Full crash matrix, Snapshot, Operation/Action/ToolResult, Verification/Outbox,
  worker, and recovery semantics are not implemented.

## Independent QA requirements

The Builder does not approve this candidate. Independent QA must:

1. resolve and pin the exact commit containing this handoff and verify baseline,
   planning authority, WO-02 ancestry, branch, and clean candidate worktree;
2. verify the candidate path set is exactly the allowlisted nine paths above;
3. attack namespace/stream isolation, invalid scope, and any implicit session or
   Host identity mapping;
4. attack axis coupling, safe-integer overflow, cross-scope allocation, State
   CAS, and Frontier revision/position confusion;
5. reproduce two-connection races, first-open migration, schema collision, and
   callback/marker rollback;
6. attempt commit-ID request/kind/operation/CAS substitution and confirm exact
   replay never reruns a callback or advances an axis;
7. verify takeover ID is distinct from per-scope takeover order and the combined
   primitive is atomic;
8. inspect package-root/MCP/Core boundaries for a generic authority mutation or
   SQLite-handle leak;
9. reproduce focused tests, `npm test`, `npm run build`, `git diff --check`, exact
   nine commands, and prohibited-drift checks; and
10. write only
    `docs/qa/WO-03A-shared-revision-stream-transaction-substrate.md` in a
    separate QA commit. QA must not implement or begin WO-03B/WO-04.
