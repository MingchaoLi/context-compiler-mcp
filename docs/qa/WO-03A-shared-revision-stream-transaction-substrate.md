# WO-03A Independent QA

**Verdict: REJECTED**
**QA date:** 2026-08-24
**Builder candidate:** `37765798c9be061d3dfe38adc7484d691a3f1ea8`
**Source baseline / planning authority:** `94f18b702b7eceda9e8afac7cc3d88abddbfb7da`

WO-03A must return to Builder. The candidate has four independently reproduced
acceptance blockers: the public Core instance leaks the generic mutation path and
SQLite transaction handle at runtime; stored marker validation accepts a
coordinated CAS-descriptor substitution as exact replay; the schema completion
check accepts a forged/incomplete substrate without its required constraints or
immutable triggers; and Unicode C1 control characters are accepted in scope
identifiers. Passing repository tests do not exercise these counterexamples.

## 1. Pinned repository facts

- Repository and workdir: `/Users/lmc/Documents/agent长期记忆/context-compiler-mcp`.
- Branch was `main`; `HEAD` was exactly
  `37765798c9be061d3dfe38adc7484d691a3f1ea8` before the QA write.
- `HEAD^` was exactly
  `94f18b702b7eceda9e8afac7cc3d88abddbfb7da`; the planning authority parent was
  `8204ccc484cdc2a36218dc5f4a350f5d1c607f50`.
- The worktree was clean before QA diagnostics and remained clean after focused
  tests, full tests, and build; generated `dist` output remained ignored.
- `source_baseline..candidate` contains exactly the nine work-order allowlisted
  paths:
  - four WO-03A architecture/inventory/handoff documents;
  - `src/core.ts`, `src/index.ts`, and new `src/revision-substrate.ts`;
  - `test/core-boundary.test.ts` and new `test/revision-substrate.test.ts`.
- No package/config/dependency, existing schema/migration owner, Raw, State,
  Recall, telemetry, evaluation, or official-artifact path changed. No submodule
  exists.
- The handoff hashes for the three changed source files and the frozen hashes for
  `package.json`, `package-lock.json`, and `tsconfig.json` matched the actual
  candidate bytes.

## 2. Independently confirmed behavior

The following implementation facts were traced to source and independently
exercised. They are not sufficient for acceptance because of the blockers below.

- Every substrate API requires explicit `{ namespace, stream_id }`; the module
  contains no `session_id` fallback or Host/provider identity lookup. Authority
  and shadow rows use a composite scope key.
- The ledger, State, Raw Frontier, and takeover-order axes are stored separately;
  frontier position is separate from the four axes. State CAS and Frontier
  revision-plus-position double-CAS are performed before the callback.
- Frontier position cannot regress or exceed the same-scope ledger position.
  Revisions are validated as non-negative safe integers, and increment at
  `Number.MAX_SAFE_INTEGER` fails closed.
- `commit_id` remains distinct from the per-scope
  `takeover_commit_revision`; `TAKEOVER_FRONTIER` updates takeover ordering and
  the double-CASed frontier in one transaction.
- Normal mutation flow uses `BEGIN IMMEDIATE` and one connection for callback
  rows, the full-vector CAS, marker insertion, and commit. Injected callback and
  marker failures roll back in the candidate tests.
- Fresh/legacy first-open tests cover concurrent initialization, idempotent
  reopen, and no legacy-session backfill. Current v0 Raw/State writers do not
  silently advance or reinterpret the new revision substrate.
- Package-root exports omit `SqliteRevisionSubstrate`, mutation helpers, the
  callback context, and `DatabaseSync`. MCP still advertises the accepted nine
  commands in the accepted order, and the MCP source itself does not call the
  new mutation helpers.
- No WO-03B Hot Raw or WO-04 semantic State/Fact/Takeover business behavior was
  introduced.

## 3. Blocking counterexamples

### B1 — public Core leaks generic mutation and SQLite context

**Required contract:** WO-03A acceptance requires that Host/MCP cannot call a
generic authority mutation or access the SQLite context.

**Source fact:** `ContextCompilerCore` is exported from the package root and
stores the substrate in a TypeScript `private` field named
`revisionSubstrate`. The emitted JavaScript retains that ordinary own property.
The substrate's mutation method uses a discoverable prototype `Symbol`, not a
JavaScript private field or an unforgeable capability inaccessible from the
Core instance.

**Independent attack:** importing only `ContextCompilerCore` from
`dist/index.js`, QA inspected the public instance with `Reflect.ownKeys`, obtained
`core.revisionSubstrate`, found the prototype symbol whose description is
`commitRevisionInsideCore`, and invoked it directly. The callback received a
working `DatabaseSync`, created and inserted a domain table row, and the generic
`LEDGER` mutation advanced the authority vector from 0 to 1.

**Result:** the attack reported `mutation_symbol_discovered: true`,
`sqliteHandleObserved: true`, and an accepted generic mutation with
`ledger_revision: 1`. This directly falsifies the Core/Host boundary acceptance
claim; package-root export omission alone does not close the runtime path.

### B2 — coordinated CAS descriptor substitution is accepted as exact replay

**Required contract:** operation, kind, request, and operation-specific CAS are
part of the exact normalized replay descriptor; malformed or inconsistent stored
markers must fail closed.

**Source fact:** `commitFromRow` canonicalizes `request_json`, recomputes its
SHA-256, and validates the transition selected by the marker row's `operation`.
It does not validate descriptor fields inside `request_json` against the marker
key/columns or validate descriptor CAS values against `previous_json` and
`current_json`.

**Independent attack:** QA created a valid `STATE` marker with
`expected_state_revision: 0`, then in an isolated temporary database replaced
the stored descriptor with `expected_state_revision: 99` and replaced its
fingerprint with the matching SHA-256. After restoring the required trigger name
with different semantics, reopen succeeded. `getCommit` accepted the marker,
and a retry carrying the substituted CAS value 99 returned the original state-1
record without running the callback.

**Result:** constructor accepted, `getCommit` accepted, replay accepted, and
`callbackCount` remained 0. An impossible CAS substitution therefore becomes an
"exact" replay instead of `CORRUPT_DATA`/`CONFLICT`.

### B3 — the completion proof accepts an incomplete/colliding schema

**Required contract:** additive migration must have a transactional completion
proof; collision and partial completion must fail closed.

**Source fact:** `validateSubstrateSchema` checks only column names/order, the
presence of four trigger names, and one version row. It does not validate table
SQL, composite primary keys, the marker foreign key, revision/frontier checks,
or the update/delete behavior of the named triggers.

**Independent attack:** QA constructed an isolated database containing all
three expected table names and columns, version `1`, and four correctly named
but no-op INSERT triggers. The tables intentionally had no PK, FK, NOT NULL, or
CHECK constraints, and `cc_revision_streams` contained two rows with the same
`(authority, duplicate)` scope.

**Result:** `new SqliteRevisionSubstrate(path)` accepted the forged completion
state and returned one of the duplicate vectors. The completion row therefore
does not prove the substrate invariants, and same-name collisions can masquerade
as a completed migration.

### B4 — Unicode C1 control characters are writable scope identifiers

**Required contract:** the work order requires empty, blank, oversized, control-
character, non-plain, and unsupported scope values to be rejected before write.

**Source fact:** `validateIdentifier` rejects only U+0000–U+001F and U+007F.
The Builder architecture narrows this to "ASCII control characters", but the
work order does not authorize that narrowing.

**Independent attack:** U+001F and U+007F were rejected as `INVALID_INPUT`, but
U+0085 and U+009F (Unicode general category `Cc`) were both accepted as
`stream_id` characters. Independent in-memory mutations for both identifiers
committed successfully and each allocated `ledger_revision: 1`.

**Result:** invalid-scope validation does not meet the work-order contract.

## 4. Commands and results

- Candidate pin/allowlist:
  `git status --short --branch`, `git rev-parse HEAD`, `git rev-parse HEAD^`,
  `git rev-parse --abbrev-ref HEAD`, and
  `git diff --name-status 94f18b7..3776579` — exact branch/chain, clean tree, nine
  allowlisted paths.
- Candidate whitespace audit:
  `git diff --check 94f18b7..3776579` — PASS.
- Focused test run:
  `./node_modules/.bin/vitest run test/revision-substrate.test.ts test/core-boundary.test.ts test/mcp-service.test.ts --reporter=verbose`
  — PASS, 3 files and 18 tests.
- Full suite: `npm test` — PASS, 31 files passed and 1 skipped; 486 tests passed
  and 1 skipped.
- Build: `npm run build` — PASS.
- Exactly-nine runtime check against `dist/index.js` — PASS; command and
  capability counts were both 9 and referenced the same accepted ordered list.
- Static drift/import/export audits used `git diff --name-only`, `git diff
  --numstat`, `rg`, and SHA-256 comparison — PASS for the candidate allowlist,
  prohibited-path drift, no implicit substrate session mapping, and recorded
  fingerprints.
- Four attack probes used only Node's local `DatabaseSync`, `:memory:` or
  `mkdtempSync` paths under the system temporary directory. No production
  database, network, remote model, sibling repository, or destructive command
  was used.

## 5. Disposition

**REJECTED.** Return WO-03A to Builder in an append-only fix commit. Builder must
close B1–B4 and add regression coverage for each counterexample. QA did not
modify Builder source, tests, architecture, inventory, handoff, work order,
PROJECT_STATE, or ROADMAP, and did not start WO-03B or WO-04.

---

## 6. Independent re-QA — fixed candidate

**Re-QA verdict: ACCEPTED**

**Re-QA date:** 2026-08-24

**Fixed Builder candidate:** `c93072dc5e4b5c89464b003e716bbb688b072b89`

**Fixed candidate parent / retained QA rejection:**
`99ab4445d7568c2b89c2550af739a1a49766adc2`

The original `REJECTED` record above remains the historical verdict for Builder
candidate `37765798c9be061d3dfe38adc7484d691a3f1ea8`. This append-only re-QA
independently accepts only the fixed candidate pinned above.

### 6.1 Fixed chain and change-scope facts

- Branch was `main`; pre-write `HEAD` was exactly the fixed candidate, `HEAD^`
  was exactly the retained QA rejection, and the worktree was clean.
- `99ab444..c93072d` is one append-only Builder fix commit and changes exactly
  the seven paths listed in the updated handoff:
  - `docs/architecture/WO-03A-shared-revision-stream-transaction-substrate.md`;
  - `docs/handoffs/WO-03A-shared-revision-stream-transaction-substrate.md`;
  - `docs/inventory/WO-03A/substrate-schema-transaction-map.md`;
  - `src/core.ts` and `src/revision-substrate.ts`;
  - `test/core-boundary.test.ts` and `test/revision-substrate.test.ts`.
- The retained QA file's Git blob was
  `5f7d16b351ba11f71e78f30a0ada05398099143c` at both the rejection and fixed
  candidate commits. Builder did not edit the rejection record.
- The fixed source SHA-256 values independently matched the handoff:
  `9ab332bb...c9599` for `src/revision-substrate.ts`,
  `2c0a0e8e...f57453` for `src/core.ts`, and the unchanged
  `f5d9c57a...44994a78` for `src/index.ts`.
- Package/config/dependency, existing Raw/State/Recall/Experience/MCP/schema
  owners, evaluation, official artifacts, PROJECT_STATE, ROADMAP, work order,
  and every non-authorized path were unchanged by the fix.

### 6.2 B1–B4 closure evidence

#### B1 — Core/substrate runtime reflection boundary: CLOSED

`ContextCompilerCore` now owns the substrate in JavaScript private field
`#revisionSubstrate`. Direct substrate storage, transaction state, and mutation
are JavaScript private; Core-only mutation helpers reach the private method via
a module-private `WeakMap` capability.

Independent reflection from the public root found:

- no `revisionSubstrate` property and no `SqliteRevisionSubstrate` value among
  `Reflect.ownKeys(core)` values;
- no Core prototype mutation symbol;
- no own key on a direct substrate instance;
- only `constructor`, `getRevisionVector`, `getCommit`, and `close` on the
  substrate prototype;
- no `database`/`transactionOpen` property or prototype symbol; and
- no substrate class, generic mutation helper, or transaction context on the
  package root.

The original public-Core reflection bypass could not be reproduced. MCP remains
a command-port adapter and exposes no generic revision writer.

#### B2 — stored descriptor and replay integrity: CLOSED

Stored descriptors are now re-normalized and checked against marker row scope,
commit ID, operation, kind, fingerprint, and canonical bytes. State expected
revision and Frontier expected revision/position plus next position are checked
against the persisted previous/current transition.

Independent temporary-database attacks replaced the descriptor and matching
SHA-256 for eight cases: scope, commit key, operation, kind, State CAS, Frontier
revision, Frontier position, and Frontier next position. The exact immutable
trigger was restored so schema reopen remained valid. Every marker read failed
`CORRUPT_DATA`; every applicable retry also failed `CORRUPT_DATA`; all callback
counts remained zero. A normal same-key/different-request retry independently
remained `CONFLICT` with callback count zero.

#### B3 — schema completion proof: CLOSED

Reopen now compares whitespace-normalized `sqlite_master` SQL for the three
tables and four triggers against code-owned definitions, in addition to exact
column order and the single supported version row.

Two independent temporary-database attacks failed closed as `STORAGE_FAILURE`:

- a same-name/version schema missing PK, FK, CHECK, NOT NULL, and genuine
  immutable trigger bodies; and
- an otherwise valid substrate whose update trigger was replaced by a same-name
  no-op INSERT trigger.

The original duplicate-scope/forged-completion counterexample no longer opens.
Fresh/legacy concurrent initialization and compatible idempotent reopen remain
green in the focused suite.

#### B4 — Unicode control scope validation: CLOSED

Identifier validation now rejects Unicode general category `Cc` with
`\p{Cc}`. Independent enumeration found 65 `Cc` code points (U+0000 through
U+009F ranges); mutations placing every one in `stream_id` all failed
`INVALID_INPUT` before allocation. Explicit U+0085 and U+009F shadow-namespace
mutations also failed `INVALID_INPUT`, and the untouched control vector remained
zero.

### 6.3 Regression and compatibility results

- Focused command:
  `./node_modules/.bin/vitest run test/revision-substrate.test.ts test/core-boundary.test.ts test/mcp-service.test.ts --reporter=verbose`
  — PASS, 3 files and 19 tests.
- Full suite: `npm test` — PASS, 31 files passed and 1 skipped; 487 tests passed
  and 1 skipped.
- Build: `npm run build` — PASS (`tsc -p tsconfig.json`).
- `git diff --check 99ab444..c93072d` — PASS.
- Runtime exact-nine audit — PASS: command and capability counts are both 9,
  the accepted order is unchanged, and forbidden generic root exports are
  absent.
- Prohibited-path audit — PASS. Current Raw/Event, State, Recall, Experience,
  telemetry, evaluation/artifacts, package/config, MCP service/protocol, and
  existing initialization owner have no fix-range diff.
- Focused regression retains the previously accepted four-axis isolation,
  State CAS, Frontier double-CAS, takeover identity/order and combined atomic
  transition, callback/marker rollback, exact replay, concurrent first-open,
  one-winner State race, legacy no-backfill, overflow, close, and lifecycle
  evidence.

All independent database diagnostics used only `:memory:` or `mkdtempSync`
paths under the system temporary directory. No network, remote model,
production database, sibling Host repository, destructive command, WO-03B, or
WO-04 work was used or started.

### 6.4 Re-QA disposition

**ACCEPTED.** B1–B4 are closed at fixed candidate
`c93072dc5e4b5c89464b003e716bbb688b072b89`, and no regression or remaining
WO-03A blocker was found. This acceptance does not authorize or begin WO-03B or
WO-04 and does not modify any Builder artifact.
