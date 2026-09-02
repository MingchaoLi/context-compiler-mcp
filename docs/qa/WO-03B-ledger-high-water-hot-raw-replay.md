# WO-03B Independent QA — Ledger High-water + Hot Raw Replay

**Verdict: ACCEPTED**

**QA date:** 2026-08-24

**Builder candidate:** `24b7ba6971be2d8dc761368ecb66722ff053f4ea`

**Source baseline / planning authority:**
`06d736a0a8a7ab3cfb03228b345898ac4a57a658`

**Frozen WO-03A candidate:** `c93072dc5e4b5c89464b003e716bbb688b072b89`

**WO-03A Independent QA:** `f02c5e12ee0931d4a23a999fa2dc2c0dbb977940`

The candidate satisfies the bounded WO-03B acceptance contract. Independent
source tracing and adversarial temporary-database probes reproduced explicit
scope isolation, scoped Event replay, atomic row/revision/marker commit,
concurrent allocation, fail-closed migration, consistent Hot Raw rebuild,
read-only Frontier use, crash-without-push recovery, and the required Core/MCP
boundaries. No acceptance blocker remains.

## 1. Pinned repository facts

- Repository and command workdir were
  `/path/to/context-compiler-mcp`.
- Before the QA write, branch was `main`, `HEAD` was exactly the Builder
  candidate, `HEAD^` was exactly the planning authority, and the worktree was
  clean. The accepted WO-03A candidate and QA commits are in the pinned ancestry.
- `source_baseline..candidate` contains exactly the nine allowlisted paths:
  - `docs/architecture/WO-03B-ledger-high-water-hot-raw-replay.md`;
  - `docs/handoffs/WO-03B-ledger-high-water-hot-raw-replay.md`;
  - `docs/inventory/WO-03B/execution-baseline-manifest.md`;
  - `docs/inventory/WO-03B/ledger-schema-replay-map.md`;
  - `src/core.ts`, `src/index.ts`, and new `src/ledger-hot-raw.ts`;
  - `test/core-boundary.test.ts` and new `test/ledger-hot-raw.test.ts`.
- The frozen WO-03A architecture/inventory/handoff, substrate source, and
  substrate test have no diff from `c93072d..candidate`. Existing Raw, State,
  Recall, Experience/telemetry, MCP, evaluation, package/config/dependency,
  PROJECT_STATE, ROADMAP, work order, and official-artifact paths have no diff
  from the planning authority.
- Independently calculated SHA-256 values matched the handoff:
  - `2210d543...02eda2` — `src/ledger-hot-raw.ts`;
  - `46147984...f6974f` — `src/core.ts`;
  - `db4b828e...c0e407` — `src/index.ts`;
  - `9ab332bb...c9599` — frozen `src/revision-substrate.ts`.
- No submodule exists. QA used no sibling Host repository, network, remote
  model, credential, production database, or destructive command.

## 2. Independent acceptance evidence

### 2.1 Explicit scope, provenance, and Event identity

Source tracing found no implicit session/Host route: every canonical append and
rebuild accepts an explicit `{ namespace, stream_id }`, while
`source_session_id` is stored only in the normalized request and Event row.

An independent Core probe first called current `ingest_event` for
`legacy-session`, then projected a canonical Event into explicit stream
`explicit-project` with the same text as provenance. Only `explicit-project`
materialized a revision row at ledger revision 1; `legacy-session` remained a
zero vector before and after. The legacy `raw_events` row and new canonical
ledger row each remained in their separate owner table.

Direct Store attacks confirmed:

- an exact normalized retry returned the original byte-equivalent Event and
  kept the ledger at revision 1;
- substituting source kind, source ID, source session, payload, or occurrence
  time for that scoped `event_id` returned `CONFLICT`;
- equal `event_id` values in another stream, and in authority versus shadow,
  independently received revision 1;
- two provenance sessions appended to one explicit stream and received that
  stream's revisions 1 and 2; and
- missing/invalid explicit scope failed as `INVALID_INPUT` without creating a
  scope, Event, or marker.

### 2.2 Atomic append, replay, concurrency, and overflow

The append call delegates allocation to the frozen WO-03A transaction callback.
The callback inserts the Event using the callback's transaction connection;
the same `BEGIN IMMEDIATE` transaction then performs full-vector CAS, writes the
immutable normalized marker/result, and commits.

QA independently injected four distinct failures in isolated databases:

1. a `BEFORE INSERT` Event trigger failure;
2. a `BEFORE INSERT` marker trigger failure;
3. a `BEFORE UPDATE` revision-vector/CAS write failure; and
4. a deferred foreign-key violation that fails the actual `COMMIT`.

Every attack returned `STORAGE_FAILURE` and left no Event, no marker, and a
zero ledger vector. Removing the injector and retrying a new Event allocated
revision 1, proving that no failed path consumed a revision. The schema's exact
primary/unique/foreign-key constraints and immutable update/delete triggers are
also part of the validated completion definition.

Independent worker concurrency produced revisions 1 and 2 for two distinct
same-scope Events. Two concurrent exact retries both returned revision 3 with
the same stored result, while audit found one Event row, one revision advance,
and one marker for that identity. Forcing the ledger axis to
`Number.MAX_SAFE_INTEGER` made the next append fail closed as `CONFLICT`; no
Event or marker was added.

### 2.3 Migration and completion proof

Two independent workers concurrently opened both a fresh database and a legacy
Raw database. Both openers succeeded in each case, and the completion table held
exactly schema version 1. The legacy audit retained one old `raw_events` row but
had zero canonical ledger Events, revision streams, and markers: no backfill or
session reinterpretation occurred.

A same-name partial table collision failed construction as `STORAGE_FAILURE`
and left no Hot Raw completion object. A forged version-1 completion containing
the expected names/columns but missing the required PK/FK/CHECK/NOT NULL
semantics and using no-op trigger bodies also failed construction. This matches
the source's normalized full `sqlite_master.sql`, exact-column, exact-version,
and `BEGIN IMMEDIATE` completion validation.

### 2.4 Snapshot rebuild, Frontier boundary, and reopen

The rebuild source begins one SQLite read transaction, reads the complete
same-scope revision vector/high-water, and then selects ordered canonical Events
where `frontier_position < ledger_revision <= ledger_high_water` before commit.

During an independent 100-Event worker append series, the reader made 412
observations. None showed a torn vector/Event view: every observed Event range
was ordered and contiguous for this Raw-only probe, its last revision and count
matched the observed high-water, and the final projection was high-water 100
with 100 Events.

QA arranged five committed Events and, using only the frozen test helper,
advanced the fixture Frontier position to 3. Rebuild returned only revisions 4
and 5 and left every vector axis byte-equivalent before/after. Close/reopen
returned the same tail and high-water. A separate immediate-close/no-push probe
also recovered all committed canonical Events from durable rows.

Production `src/ledger-hot-raw.ts` and `src/core.ts` contain no call to a
Frontier/Takeover mutation helper or `TAKEOVER_FRONTIER`. Rebuild therefore uses
committed Frontier only as a read boundary and introduces no WO-04/WO-05
authority behavior.

### 2.5 Validation, lifecycle, and public boundaries

QA enumerated all 65 Unicode general-category `Cc` code points through an
identity field, including U+0085 and U+009F. It also attacked unsupported
namespace, absent scope, decomposed non-NFC identity, unsupported source kind,
non-canonical timestamp, cyclic/accessor/exotic/sparse JSON, and an extra input
key. All 76 attempts returned `INVALID_INPUT` before mutation; the accessor was
never invoked, and Event/marker counts and the full vector remained zero.

Runtime reflection confirmed that the public Core instance has no discoverable
new substrate/Hot Raw Store value, and a direct Store instance has no own keys
or symbols; its prototype exposes only `constructor`, `append`, `rebuild`, and
`close`. The package root exports Hot Raw types/constants/error and Core domain
methods but no SQLite Hot Raw Store, migration, revision substrate, generic
revision writer, or transaction handle.

Both `CONTEXT_COMPILER_COMMANDS` and MCP service capabilities independently
enumerated the same accepted nine names in order. Current command schemas,
errors, and lifecycle remained under the existing full regression suite.

## 3. Commands and results

- Pin/allowlist/ancestry: `git status --short --branch`, `git rev-parse HEAD
  HEAD^`, `git diff --name-status 06d736a..24b7ba6`, and frozen/prohibited-path
  scoped diffs — PASS; exact candidate, parent, ancestry, clean tree, and nine
  authorized paths.
- Focused run:
  `./node_modules/.bin/vitest run test/ledger-hot-raw.test.ts
  test/revision-substrate.test.ts test/core-boundary.test.ts
  test/mcp-service.test.ts --reporter=verbose` — PASS, 4 files and 29 tests.
- Full suite: `npm test` — PASS, 32 files passed and 1 skipped; 497 tests passed
  and 1 skipped.
- Build: `npm run build` — PASS (`tsc -p tsconfig.json`).
- Candidate whitespace audit:
  `git diff --check 06d736a..24b7ba6` — PASS.
- Runtime exact-nine/root-reflection checks and static production
  Frontier/Takeover call audit — PASS.
- Independent transaction, identity, concurrency, overflow, migration,
  snapshot, Frontier, reopen, legacy-separation, and invalid-input probes — PASS.
  Every write probe used a newly created database under the system temporary
  directory; no repository or production database was used.

## 4. Residual limits and disposition

The documented deferred limits are real but non-blocking for WO-03B: current v0
ingest is not automatically projected, push/worker acceleration is absent, Hot
Raw remains a rebuild projection, future non-Raw ledger kinds may make its Event
revisions non-contiguous, and only a later authority may decide safe Frontier
advance or semantic completeness.

**ACCEPTED.** WO-03B may return to the project controller as independently
verified. QA did not modify Builder source, tests, architecture, inventory,
handoff, work order, PROJECT_STATE, ROADMAP, or artifacts, and did not begin
WO-04 or WO-05.
