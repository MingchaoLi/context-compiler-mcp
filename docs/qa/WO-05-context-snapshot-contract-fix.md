# WO-05 Fresh Independent Re-QA — Owner Projection Receipt Fix

Status: **ACCEPTED / PASS**

Reviewed candidate: `fa7677101c145ffdbfca8bff0864ed992fa9a9b9`<br>
Functional fix commit: `c7e89760e4bec26486dc42bd214981744a978a4f`<br>
Repair Gate / Builder parent: `dcb0baff1936029779b5f7837f03b467eb4b14bb`<br>
Review date: 2026-08-25

## Verdict

The append-only fix is accepted. Independent static review, isolated-database attacks and the full
regression demonstrate that exact Snapshot replay no longer uses Manifest-selected Fact/Relation refs
to prove their own completeness. The authority chain is now:

```text
Fact/Relation-owner immutable complete-projection receipt
  -> complete historical Fact/Relation graph
  -> deterministic roots and active DEPENDS_ON closure
  -> expected Manifest selected refs and dependency paths
  -> rebuilt Working Context/body/hash comparison
```

The returned coordinated omission now fails `CORRUPT_DATA`, including after later axis-neutral writes.
The receipt, Snapshot and Attempt are created/read back in one Snapshot-owned SQLite transaction and
roll back together. No sixth global revision axis, second Fact/Relation writer, package-root receipt
capability, Host/provider/model/network/MCP behavior or frozen-v0 change was introduced.

This report approves only the bounded WO-05 repair. It does not approve WO-06/07, Host integration,
Retrieval/Summary/Extractor work or any sibling repository change.

## Repository and candidate pinning

Facts independently observed before QA wrote this report:

- branch: `main`;
- initial `HEAD`: `fa7677101c145ffdbfca8bff0864ed992fa9a9b9`;
- direct parent: `c7e89760e4bec26486dc42bd214981744a978a4f`;
- functional fix parent: `dcb0baff1936029779b5f7837f03b467eb4b14bb`;
- initial worktree: clean;
- repair baseline `9200d539c06698543542e027c28d2491f3bfbc91`, source baseline
  `32e2e13248f72eecfbac54ecfd91db29e7d7111b`, returned candidate
  `c8c37b4beb230d2c37017b9c9d65aefa7e180eaa` and prior QA return
  `88e8da7c9cee348643f3c3f698af4e8e46cf3e09` are all candidate ancestors;
- no submodules were present;
- `git diff --check dcb0baf..fa76771` passed.

Relative to the repair Gate, the candidate changes exactly the authorized eight paths:

```text
docs/PROJECT_STATE.md
docs/ROADMAP.md
docs/handoffs/WO-05-context-snapshot-contract-fix.md
docs/work-orders/WO-05-context-snapshot-contract.md
src/canonical-fact-relation.ts
src/context-snapshot.ts
test/canonical-fact-relation.test.ts
test/context-snapshot.test.ts
```

There is no diff to the shared substrate, Ledger, State, Takeover, transaction coordinator, assembler,
operational context, Core/package root, MCP, dependency/config, evaluation or official-artifact paths.

## Independently recomputed identities

The policy hashes were recomputed from the exact one-line canonical JSON bytes in the frozen Gate,
not read back from source constants:

```text
canonical Fact/Relation projection receipt v1
610102fa139bcfb34c1a0bea0ff177ac3f1d7238bf2949a9f27ab4b13ae5b93b

ContextSnapshot v2
279ceac17c144e99a39a041c5814f6b2e0643ecfc5ef6afe5a57f8d4bace8d6a
```

Candidate file fingerprints independently matched the Builder handoff:

```text
bdd63602eff78bad678714bfc1bb572dcff47f3d71973d753a980ea4f9c55db6  src/canonical-fact-relation.ts
fb4b8c9dbd8ec9f5b25f04b37b9e1e4393247fe11a37cad11043cfb48fd464ef  src/context-snapshot.ts
4b0c195f65f90d74e7a8d101e90ab32c187fbba8b7bc9ed9948dc23125e01ede  test/canonical-fact-relation.test.ts
94f50de5342a967d88a61fda13c51b82e4e5b750c891a4c069212deb23a240c9  test/context-snapshot.test.ts
```

Frozen files also matched the handoff, including revision substrate `9ab332bb...599`, semantic
Takeover `d63b63a6...ee1`, coordinator `298efbe6...23f`, assembler `8e783cc3...3e3`, operational
context `4d2d537f...e58`, package manifests and `tsconfig.json`.

## Independent contract review

### Fact/Relation owner receipt

Facts:

- the additive sub-schema and its four immutability triggers are defined and migrated exclusively in
  `canonical-fact-relation`;
- receipt identity is derived from canonical explicit scope plus subject Snapshot ID;
- payload arrays contain full latest canonical Fact and Relation objects, exact revision/commit
  identities, policy hashes, observed five-axis vector and capture timestamp;
- owner read validates canonical bytes/hash, derived identity, scope/subject, lexical uniqueness,
  graph invariants and exact immutable object/commit bindings;
- accepted Fact/Relation v1 schema/policy and axis-neutral commit behavior remain unchanged;
- same-handle receipt functions do not open/commit/roll back transactions or advance a revision and
  are absent from the package root and Core public methods.

Judgment: this is the independent historical authority witness required by the reopened Gate, not a
Snapshot-owned selected-view hash. Snapshot cannot manufacture its content from selected refs.

### Freeze, retry and replay

Facts:

- `freeze` opens one `BEGIN IMMEDIATE`, inspects the receipt/Snapshot/Attempt triple, captures the
  complete owner receipt, derives closure from its projection, inserts Snapshot then Attempt, performs
  receipt-first exact readback and commits;
- any partial/orphan triple fails closed; exact retry occurs before live-vector comparison and replays
  the committed receipt rather than recapturing a later world;
- stored read resolves Manifest receipt ID through the Fact/Relation owner before rebuilding selection,
  paths, body, cost and hashes;
- Manifest-selected Fact/Relation refs are rebuilt comparison output, not the historical graph input;
- Snapshot v1 marker fails `CORRUPT_DATA` instead of unsafe backfill.

Judgment: transaction composition, retry identity and receipt-first replay meet the Gate without a
generic transaction framework or sixth axis.

## Adversarial matrix

Independent execution covered the frozen S0-S5 matrix and adjacent attacks:

| Case | Evidence | Result |
|---|---|---|
| S0 | QA-authored probe deleted selected Fact/Relation/path/body, recomputed Snapshot/Attempt local hashes and restored exact triggers without changing owner receipt | `CORRUPT_DATA` |
| S1 | capture, later same-vector Fact, then coordinated omission | `CORRUPT_DATA` |
| S2 | capture, later same-vector Relation, then coordinated omission | `CORRUPT_DATA` |
| S3 | capture, later same-vector Fact + Relation, exact old replay | original Manifest/body reproduced |
| S4 | QA-authored mandatory-overflow probe after receipt capture; focused deferred-COMMIT injection after all inserts | receipt/Snapshot/Attempt `0/0/0` |
| S5 | concurrent same-ID freeze plus exact retry | one identical receipt/Snapshot/Attempt triple |

The QA-authored S0 probe also committed a later Fact, independently verified that the five-axis vector
did not advance, proved the old Snapshot remained byte-stable, then applied the original coordinated
omission and observed `CORRUPT_DATA`.

Additional focused and static challenges passed for:

- full and empty receipt materialization;
- receipt hash/row tamper and exact owner-object binding;
- same-scope subject substitution, cross-scope substitution and hash substitution;
- receipt-only orphan on read and retry, and Snapshot/Attempt without a receipt;
- partial receipt schema, missing/tampered trigger and reopen;
- accepted owner v1 plus additive receipt migration while preserving existing authority;
- unsupported Snapshot v1 fail-closed migration;
- policy substitution and package-root receipt-seam privacy.

## Commands and results

```text
npx vitest run test/context-snapshot.test.ts test/semantic-takeover.test.ts \
  test/core-boundary.test.ts test/canonical-state.test.ts \
  test/canonical-fact-relation.test.ts test/ledger-hot-raw.test.ts --reporter=dot
PASS — 6 files / 76 tests

QA-authored isolated vite-node omission/replay probe
PASS — coordinated omission CORRUPT_DATA; later Fact same-vector; old replay preserved

QA-authored isolated rollback/migration/public-boundary probe
PASS — rollback 0/0/0; owner v1 + receipt v1; package-root seam private

concurrent same-ID focused repetition
PASS — 10/10 runs

npm test -- --reporter=dot
PASS — 37 files passed, 1 skipped / 569 tests passed, 1 skipped

npm run build
PASS — tsc -p tsconfig.json

git diff --check dcb0baf..fa76771
PASS
```

One earlier full-suite attempt observed `database is locked` only when the concurrent-freeze test
opened its audit handle immediately after both workers posted their success messages. The helper
resolves on worker `message` before worker `exit`; the same test then passed 10/10 focused repetitions
and the complete suite passed on the bounded rerun. This is recorded as a non-blocking test-harness
timing observation, not hidden as a clean first-run claim. No incorrect freeze result, orphan row or
lock persisted across a focused run or reopen.

## Environment and limits

- macOS / Darwin `25.5.0`, arm64;
- Node.js `v25.6.1`, npm `11.9.0`;
- QA-authored databases and scripts stayed under the OS temporary directory;
- no network, remote model, provider, credential, production database, sibling Host repository or
  destructive repository command was used;
- exact Node.js 24 and Windows were not rerun.

These environment limits do not weaken the deterministic SQLite receipt/replay evidence. The isolated
first-run audit-lock timing observation should be hardened in a future test-only change if it recurs,
but it does not block this bounded correctness acceptance.
