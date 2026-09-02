# WO-04A Independent QA — Canonical State Revision Commit

**Verdict: REJECTED**

**QA date:** 2026-08-24

**Builder candidate:** `d35970a3d8b75e2d17a7f3d24c7dd179f664086a`

**Source baseline / planning authority:**
`4e7758ac459c879944c624eb27ffefcfb24a2aec`

**Frozen WO-03A candidate / QA:**
`c93072dc5e4b5c89464b003e716bbb688b072b89` /
`f02c5e12ee0931d4a23a999fa2dc2c0dbb977940`

**Frozen WO-03B candidate / QA:**
`24b7ba6971be2d8dc761368ecb66722ff053f4ea` /
`92e72eb785b2670068597376bccfd1136e3c6952`

WO-04A must return to Builder. Most bounded behavior and every declared test
suite passed, but two independent acceptance blockers remain. First, the
Canonical State reader does not bind the persisted State row and all revision
vector axes back to the marker's normalized domain request; coordinated
temporary-database substitutions were accepted by latest/exact reads and, in
two attacks, by exact replay. Second, a policy substitution on an existing
`state_commit_id` returns `INVALID_INPUT` instead of the work order's required
stable `CONFLICT`.

## 1. Pinned repository facts

- Repository and command workdir were
  `/path/to/context-compiler-mcp`.
- Before the QA write, branch was `main`, `HEAD` was exactly the Builder
  candidate, `HEAD^` was exactly the planning authority, the planning authority
  parent was exactly the accepted WO-03B QA commit, and the worktree was clean.
- Both frozen WO-03A commits and both frozen WO-03B commits are ancestors of the
  candidate. No submodule exists.
- `source_baseline..candidate` contains exactly the nine allowlisted paths:
  - `docs/architecture/WO-04A-canonical-state-revision-commit.md`;
  - `docs/handoffs/WO-04A-canonical-state-revision-commit.md`;
  - `docs/inventory/WO-04A/execution-baseline-manifest.md`;
  - `docs/inventory/WO-04A/state-authority-schema-transaction-map.md`;
  - new `src/canonical-state.ts`;
  - `src/core.ts` and `src/index.ts`;
  - new `test/canonical-state.test.ts`;
  - `test/core-boundary.test.ts`.
- Frozen WO-03A/03B source, schema tests and architecture/inventory paths have
  no diff. Legacy State implementation/tests, Raw, Recall, Experience/telemetry,
  MCP, evaluation, package/config/dependencies, PROJECT_STATE, ROADMAP, work
  order and official artifacts have no diff from the planning authority.
- Independently calculated source/config SHA-256 values matched the handoff and
  baseline, including:
  - `715e147c...b5d13` — `src/canonical-state.ts`;
  - `be290a18...cca15` — `src/core.ts`;
  - `03ac90bf...76128` — `src/index.ts`;
  - frozen `9ab332bb...c9599` — `src/revision-substrate.ts`;
  - frozen `2210d543...02eda2` — `src/ledger-hot-raw.ts`.
- No network, remote model, credential, production database, sibling Host
  repository or destructive command was used. All mutation probes used newly
  created SQLite files below the system temporary directory.

## 2. Independently confirmed behavior

These results passed but do not override the blockers in section 3.

### 2.1 Policy, grammar, reduction and hashes

- QA independently rebuilt the frozen plain-data policy descriptor, canonical
  JSON and SHA-256. The result was exactly
  `67c043ba4001150ccc4bb3f5630de99604970401bf418f5f33b3d524aeb0c52e`,
  matching the exported Core-owned hash.
- An unsorted five-kind proposal normalized items and Event refs lexically. The
  independently hashed complete State matched the persisted `state_hash`.
- Initial states and transitions were reproduced for Goal, Constraint,
  Decision, Open Question and Rejected Alternative. The Open Question sequence
  `OPEN → DEFERRED → OPEN → RESOLVED`, terminal regression rejection and
  same-status terminal content/provenance update matched the frozen grammar.
- Empty proposal returned `INVALID_INPUT`; a non-empty reduced no-op returned
  `CONFLICT`. Neither advanced State. An absent scope returned the explicit zero
  State/vector without materializing a stream row.

### 2.2 Explicit scope and provenance

- Legacy Raw UUID, legacy session text, legacy Raw sequence text, a missing
  Event and a cross-scope canonical Event all failed provenance as `CONFLICT`.
  No implicit legacy/session/sequence identity or backfill was observed.
- Same-scope canonical Event references succeeded; authority/shadow and
  same-named streams remained isolated.
- Duplicate/unused top-level provenance failed, the top-level list normalized
  to the exact per-item union, and removal of an existing item reference failed
  as `CONFLICT`. Adding a new same-scope committed Event preserved old refs and
  advanced State normally.
- After a later revision, retrying the original exact request returned the
  original historical revision rather than advancing again.

### 2.3 Transaction, concurrency and overflow

QA independently injected failures at all four required writer boundaries:

1. State revision row insert;
2. revision-vector update/CAS;
3. immutable marker insert; and
4. the actual SQLite `COMMIT` through a deferred foreign-key violation.

Every injection returned `STORAGE_FAILURE` and left zero Canonical State rows,
zero State markers and State axis zero. After removing the injector, the next
commit received revision 1, proving no failed revision was consumed.

Two simultaneous distinct proposals at the same base produced one revision-1
winner and one `CONFLICT`. Two simultaneous exact retries at base 1 both
returned revision 2 with the same `created_at`; audit found one row and one
marker. Forcing the State axis to `Number.MAX_SAFE_INTEGER` made the next commit
fail `CONFLICT` before adding a State row or marker.

### 2.4 Migration, reads and reopen

- Two independent workers concurrently opened both fresh and legacy databases;
  all opens succeeded and the singleton schema version was 1. Sequential
  idempotent reopens also succeeded.
- The legacy database retained one `context_items` row but had zero Canonical
  State rows and zero revision-stream rows after initialization: there was no
  legacy State backfill.
- A same-name partial table collision failed construction and left no completion
  table. A forged version-1 completion with expected names/columns but missing
  constraints and using no-op trigger bodies also failed construction.
- During an independent 60-commit worker series, a reader made 741 latest-State
  observations. Projection revision, vector State revision and item count were
  equal in every observation; no torn observation occurred. Exact revision 1
  remained stable after revision 60 and was byte-identical after close/reopen.

### 2.5 Validation and compatibility boundaries

- QA mechanically enumerated all 65 Unicode general-category `Cc` code points,
  including U+0085 and U+009F. Together with non-NFC identity/content/metadata,
  accessor, cycle, exotic prototype, sparse array, symbol, extra key, implicit
  namespace, negative zero, infinity and every declared bound attack, all 84
  attempts returned `INVALID_INPUT` before State mutation. The accessor was not
  evaluated; State row/marker counts and the State axis remained zero.
- Runtime reflection found no Canonical Store or substrate value among public
  Core own keys/symbols. A direct Store had no own keys/symbols and exposed only
  `constructor`, `commit`, `readLatest`, `readRevision` and `close` on its
  prototype. Package root exposed no Store, migration, substrate, generic
  writer, SQLite handle or transaction capability.
- Core/MCP command and capability enumeration remained the accepted same nine
  names in order. Independent legacy prepare/apply/get produced legacy revision
  1 and its Goal remained the assembly source after a separate Canonical State
  commit; Canonical content did not enter legacy `get_state` or compiled context,
  and legacy session text did not materialize a canonical scope.
- Static inspection found the expected read of same-scope
  `cc_ledger_raw_events` but no Fact/Relation authority, Frontier mutation,
  Takeover/Enrichment, Compaction/Snapshot, Host/provider or network behavior.

## 3. Acceptance blockers

### B1 — Canonical State row/request/vector marker binding is incomplete

**Required contract:** persisted proposal/complete State/hash/provenance must be
independently reconstructable and bound to the immutable exact-replay marker.
Latest/exact reads and replay must fail closed on coordinated State row, hash,
marker request/result or previous/current descriptor substitution.

**Source fact:** `#assertMarkerBinding` selects only `operation`, `kind`,
`previous_json`, `current_json` and `result_json`. It does not select or validate
`request_json`/`request_fingerprint`, and it does not reconstruct the expected
normalized domain request from the persisted State row. For previous/current
vectors it compares only the State revisions; the ledger, Frontier and takeover
axes are parsed but not bound to the State commit, the live vector or provenance
position.

QA reproduced three attacks after a valid revision-1 commit. In each isolated
database QA saved the exact immutable-trigger SQL, temporarily removed only the
relevant update trigger, made the substitution, restored the exact original
trigger, closed, and reopened. Constructor schema validation therefore saw the
expected exact schema before the challenged read/replay.

1. **Coordinated row/result substitution.** QA changed the State row's
   `proposal_json`, `state_json` and matching SHA-256, and changed the marker
   `result_json` to the same replacement. Marker `request_json` and its
   fingerprint were left byte-identical and still contained `original
   authority`, not `tampered authority`. Reopened `readLatest`, exact revision
   read and an exact retry of the original proposal all returned the tampered
   authority content successfully.
2. **Marker request descriptor substitution.** QA changed the proposal inside
   marker `request_json` and recomputed its valid fingerprint, while leaving the
   State row and marker result unchanged. Reopened latest and exact reads
   accepted the row; only retry returned `CONFLICT`. Reads therefore accept a
   marker whose authority request describes a different proposal.
3. **Previous/current vector substitution.** QA changed both historical marker
   vectors' `ledger_revision` from 1 to 0 while preserving the structurally
   valid State transition `0 → 1`. The referenced canonical Raw Event is at
   ledger revision 1, so this descriptor places the provenance after the State
   commit. Reopened latest read, exact read and exact replay all accepted it.

These are not malformed JSON/hash attacks: all replacement bytes were canonical,
hashes were recomputed, frozen substrate structural validation still passed, and
the exact schema was restored before reopen. The Canonical State domain owner
must bind its row/proposal/policy/provenance and all relevant transaction vectors
to the marker request/result; accepting coordinated replacement violates the
work order's fail-closed read and replay acceptance.

### B2 — existing-identity policy substitution is not a stable conflict

**Required contract:** for an existing scoped `state_commit_id`, any
mode/expected/proposal/policy/provenance substitution must return stable
`CONFLICT`. The Builder handoff repeats this claim.

**Independent attack:** after committing `state-a`, QA retried that exact
identity with one field changed at a time. Mode, expected revision, proposal and
same-scope provenance substitutions all returned `CONFLICT`. Replacing only
`policy_hash` with another well-shaped 64-character lowercase hash returned
`INVALID_INPUT`.

**Source fact:** `normalizeCommitInput` rejects any non-current policy hash before
the frozen substrate can look up the existing commit marker and classify the
request as an identity substitution.

The operation remains mutation-free, but its stable error contract differs from
the work order and handoff. A new identity with an unsupported policy may remain
`INVALID_INPUT`; an existing identity with a changed normalized request must be
classified consistently as the required replay conflict.

## 4. Commands and results

- Pin/allowlist/ancestry: `git status --short --branch`, `git rev-parse HEAD
  HEAD^`, ancestor checks, submodule status and
  `git diff --name-status 4e7758a..d35970a` — PASS; exact chain, clean tree and
  nine authorized paths.
- Focused run:
  `./node_modules/.bin/vitest run test/canonical-state.test.ts
  test/revision-substrate.test.ts test/ledger-hot-raw.test.ts
  test/core-boundary.test.ts test/mcp-service.test.ts --reporter=verbose` — PASS,
  5 files and 39 tests.
- Full suite: `npm test` — PASS, 33 files passed and 1 skipped; 507 tests passed
  and 1 skipped.
- Build: `npm run build` — PASS (`tsc -p tsconfig.json`).
- Candidate whitespace audit:
  `git diff --check 4e7758a..d35970a` — PASS.
- Frozen WO-03A/03B, legacy State, MCP/evaluator, package/config and artifact
  scoped diffs — PASS with no output.
- Runtime exact-nine/root/reflection and static prohibited-behavior audits —
  PASS.
- Independent policy, grammar, provenance, rollback, concurrency, overflow,
  migration, snapshot, reopen, invalid-input and compatibility probes — PASS
  except for B1 and B2 above.

## 5. Disposition

**REJECTED.** Return WO-04A to Builder for an append-only fix. Builder must bind
the complete Canonical State domain request/row/result and relevant marker
vectors so all three coordinated corruption attacks fail closed, and must make
same-identity policy substitution follow the specified stable conflict contract.
Regression tests should reproduce the exact counterexamples above.

QA did not modify Builder source, tests, architecture, inventory, handoff, work
order, PROJECT_STATE, ROADMAP or artifacts, did not implement a fix, and did not
begin WO-04B, WO-04C or WO-05.

---

# Fresh Independent re-QA — fixed candidate `98e02ef`

Reviewed at `2026-08-24T11:56:48Z` by the same Independent QA role. The original
`REJECTED` record above is retained without modification and remains the verdict
for `d35970a3d8b75e2d17a7f3d24c7dd179f664086a`; this section is a fresh review of
the append-only fixed candidate.

## 6. Re-QA verdict

**ACCEPTED.** Fixed candidate
`98e02ef898587b013ad588cf7ab2f182afa276e3` closes B1 and B2. Independent
attacks found no remaining WO-04A acceptance blocker, no regression in the
previously accepted Canonical State behavior, and no frozen or prohibited-path
drift.

## 7. Candidate and history facts

- Branch was `main`; `HEAD` was exactly fixed candidate `98e02ef...`; its parent
  was exactly retained QA rejection `3359f002...`; the next ancestors were
  original Builder candidate `d35970a...` and planning authority
  `4e7758a...`. The worktree was clean before re-QA writes and no submodule was
  present.
- `4e7758a..d35970a` remains the original nine-path Builder delivery.
  `d35970a..3359f00` contains only this QA file. `3359f00..98e02ef` contains
  exactly the five declared Builder-owned paths:
  - `docs/architecture/WO-04A-canonical-state-revision-commit.md`;
  - `docs/handoffs/WO-04A-canonical-state-revision-commit.md`;
  - `docs/inventory/WO-04A/state-authority-schema-transaction-map.md`;
  - `src/canonical-state.ts`; and
  - `test/canonical-state.test.ts`.
- Builder did not modify the retained QA rejection. The original candidate's
  execution baseline, `src/core.ts`, `src/index.ts`, Core boundary test and MCP
  paths are byte-unchanged in the fix.
- Frozen WO-03A revision substrate and tests are unchanged from `c93072d...`;
  frozen WO-03B Ledger/Hot Raw and tests are unchanged from `24b7ba6...`.
  Legacy State/Raw/Recall, MCP, evaluator, package/config, schema dependencies
  and official artifacts have no fixed-commit diff.
- Recomputed source hashes match the handoff:
  `740a4c374d0a5e4df6ca6d9345620b6c3b23f984e91d3e00200dc23ad2cff281`
  for `src/canonical-state.ts`, `9ab332bb...c9599` for the frozen revision
  substrate and `2210d543...02eda2` for frozen Ledger/Hot Raw.

## 8. Independent blocker replay and additional challenges

### 8.1 B1 coordinated-corruption attacks

Fresh no-file probes created separate SQLite databases below the system
temporary directory and independently reproduced the original attacks after
restoring the exact immutable triggers:

| Attack | latest read | exact read | original request replay |
|---|---|---|---|
| B1a: replace row proposal/State/hash and marker result, preserve request/fingerprint | `CORRUPT_DATA` | `CORRUPT_DATA` | `CORRUPT_DATA` |
| B1b: replace marker request/fingerprint, preserve State row/result | `CORRUPT_DATA` | `CORRUPT_DATA` | `CONFLICT` |
| B1c: lower previous/current Ledger high-water below the provenance Event | `CORRUPT_DATA` | `CORRUPT_DATA` | `CORRUPT_DATA` |

No attack was accepted as authority and no replay callback ran. B1b replay is
the required stable identity-substitution conflict; the reads independently
recognize that the stored marker no longer binds the State row.

QA also reconstructed the expected marker descriptor without using the reader:
scope, State commit ID, `STATE`, `CANONICAL_STATE_COMMIT_V1`, commit mode,
expected revision, normalized proposal, policy hash and exact provenance union
all matched `request_json`; SHA-256 matched `request_fingerprint`; and marker
result matched the persisted complete State revision. Previous/current vectors
advanced State exactly once while preserving Ledger, Raw Frontier, Frontier
position and Takeover axes. The provenance Event revision was at or below the
marker Ledger high-water and every historical vector component was at or below
the live vector.

### 8.2 B2 policy classification and zero mutation

After one valid commit, replacing only its well-shaped 64-hex policy hash now
returned `CONFLICT`. A new otherwise-valid identity with the same unsupported
policy returned `INVALID_INPUT`. The before/after revision vectors were
byte-equal; audit retained exactly one State row and one State marker and found
no marker for the rejected new identity. This closes B2 without moving policy
selection out of Core.

### 8.3 Snapshot, policy and regression evidence

- QA independently rebuilt the frozen descriptor and obtained
  `67c043ba4001150ccc4bb3f5630de99604970401bf418f5f33b3d524aeb0c52e`,
  equal to the exported Core-owned policy hash.
- Exact read now begins one SQLite read transaction before loading the row,
  marker and live vector. In an independent concurrent probe, one writer
  advanced from State revision 1 through 30 while a separate reader completed
  458 exact reads of revision 1; every result remained byte-stable. The final
  latest projection had revision 30, 30 items and a matching vector. Static
  ordering plus this attack found no introduced read TOCTOU.
- The fixed source diff leaves proposal/state grammar, reduction, Unicode/string
  validation, migration, transaction allocator and schema SQL unchanged except
  for the intended policy timing, provenance high-water and marker/read
  integrity checks. The independent green evidence in sections 2.1–2.5 was
  retained as a regression baseline, and focused/full tests re-exercised those
  paths on the fixed source.
- Runtime inspection returned exactly the same nine commands in order. Package
  root exports no Canonical State Store, migration, revision substrate, generic
  writer or transaction handle. Reflection exposed neither the new Store nor
  substrate from a Core instance. Static inspection found only read/compare use
  of Frontier/Takeover vector fields and no Fact/Relation authority, Frontier
  mutation, Takeover/Enrichment, Compaction/Snapshot, Host/provider or network
  behavior.

## 9. Re-QA commands and results

- Exact chain, clean status, append-only ancestry, allowlists, retained-QA
  integrity and submodule checks — PASS.
- Independent B1a/B1b/B1c, B2, complete descriptor/fingerprint/vector and
  provenance-high-water probes — PASS with the classifications recorded above.
- Independent concurrent exact-read probe — PASS, 458 stable historical reads
  during revisions 2–30. Two preliminary worker-harness invocations ended in
  harness-only ESM/exit-observer errors before making a product assertion; the
  corrected no-file probe then passed.
- Focused run:
  `npx vitest run test/canonical-state.test.ts test/revision-substrate.test.ts
  test/ledger-hot-raw.test.ts test/core-boundary.test.ts
  test/mcp-service.test.ts` — PASS, 5 files and 40 tests.
- Full suite: `npm test` — PASS, 33 files passed and 1 skipped; 508 tests passed
  and 1 skipped.
- Build: `npm run build` — PASS (`tsc -p tsconfig.json`).
- `git diff --check 4e7758a..98e02ef`, fixed-path and frozen/prohibited scoped
  diffs, source hashes, exact-nine/root/reflection and static behavior audits —
  PASS.

No network, remote model, sibling Host repository, production database or
destructive command was used. Re-QA did not modify Builder files, implement a
fix, alter PROJECT_STATE/ROADMAP/work order, or begin WO-04B, WO-04C or WO-05.
