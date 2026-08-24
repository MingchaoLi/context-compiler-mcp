# WO-04D Independent QA — Current Semantic Takeover Read Seam

Status: **ACCEPTED / PASS**

## Fixed candidate

```text
repository: /Users/lmc/Documents/agent长期记忆/context-compiler-mcp
branch: main
candidate: 39334f94cb1c5ac37587cc261b261b427d2ba1b6
parent / Execution Baseline: fcca8554d0bd6f0deeb0e4ab5d5f17676dcf8e39
source / planning baseline: b22f1d9e4035c55b55b90f38967a8015437c1d19
environment: Darwin 25.5.0 arm64; Node.js v25.6.1; npm 11.9.0; SQLite via node:sqlite
```

Independent QA resolved the abbreviated candidate to the full hash above and verified exact `main`
HEAD, exact first parent, `b22f1d9 -> fcca855 -> 39334f9` ancestry and an empty
`git status --porcelain=v1 --untracked-files=all` before review. The Execution Baseline commit has
exact parent `b22f1d9` and adds only
`docs/inventory/WO-04D/execution-baseline-manifest.md`; it has no source, test, package or config
drift.

## Decision

The fixed candidate satisfies the bounded WO-04D current-read contract. Latest Takeover identity
remains exact and owner-proved, while legal later component advances no longer invalidate the
historical Takeover. No blocker was reproduced. This acceptance covers only the WO-04D Core-private
read-seam correction; it does not approve or implement WO-05 Snapshot behavior, Host/provider work,
retrieval changes or any other later work order.

## Candidate surface

Relative to the fixed parent, the candidate changes exactly six authorized paths:

```text
docs/PROJECT_STATE.md
docs/ROADMAP.md
docs/handoffs/WO-04D-current-semantic-takeover-read-seam.md
docs/work-orders/WO-04D-current-semantic-takeover-read-seam.md
src/semantic-takeover.ts
test/semantic-takeover.test.ts
```

The production delta is exactly one predicate line in
`readCurrentSemanticTakeoverInsideCore`:

```diff
- sameVector(matched.current_revision_vector, vector)
+ vectorAtOrAfter(vector, matched.current_revision_vector)
```

No schema, migration, trigger, writer, transaction coordinator, request/result grammar, package-root
or Core public surface, MCP, package/dependency or TypeScript configuration changed. Current hashes
match the frozen handoff evidence:

```text
d63b63a62b62d469dbef4ec85815fa2c4c81cd6c394288debe2846428b1ceee1  src/semantic-takeover.ts
61b143811669b8b3a8643cc3b541a5e0f6cee97a88ecb9aa43a4472eaefe8909  test/semantic-takeover.test.ts
ef2c9f996d6d43b9b1f76d3c34e765eb77d96f31720ca1a9ba9e8baf332dcb9f  package.json
519fdcf4b874886466032343c25c5e5973679ef5e0ffc3dec5bf32cba3447d88  package-lock.json
189da4e3b0f7c2b3771fb5aee021b68df401630d369ed0425812fbcac4702559  tsconfig.json
```

## Independent static verification

The source call chain establishes the exact contract mechanically:

- A live zero Takeover axis still queries for any same-scope stray Takeover row, fails closed if one
  exists, and otherwise returns the live zero vector without materializing authority.
- A positive live axis enumerates only same-scope Takeover identities. Every row is passed through
  `readSemanticTakeoverInsideCore`; no timestamp, rowid, lexical ID or table-order heuristic selects
  latest.
- The exact owner read continues to prove normalized request/fingerprint, immutable result bytes,
  the frozen Takeover transition, exact substrate marker, committed Raw range, complete State and
  Fact/Relation owner authority, one-to-one coverage and exact Artifact descriptor/hash binding.
- A candidate matches only when its historical `takeover_commit_revision` equals the live axis.
  Missing match fails; a second exact-owner match at the same axis fails immediately.
- `vectorAtOrAfter(live, historical)` checks scope plus Ledger, State, Raw Frontier, Frontier position
  and Takeover components independently. Thus any component regression remains corruption. The
  equality used for latest identity is not weakened because the preceding axis match is exact.
- The top-level result clones the live vector. The nested Takeover is cloned from its immutable
  historical result, and the Artifact is reread through its exact owner seam.

Consequently zero, stray, missing, duplicate, component regression and owner/marker/Artifact tamper
remain fail closed, while later legal Raw/State/Fact/Relation component advances are admitted.

## Independent dynamic verification

All database-writing diagnostics used newly created temporary SQLite databases. No network, remote
model, credential, production database, destructive command, sibling Host repository or isolated
WO-05 stash was used.

### Required suites

```text
npx vitest run test/semantic-takeover.test.ts
PASS — 1 file; 15 tests

npm test
PASS — 36 files passed, 1 skipped; 545 tests passed, 1 skipped

npm run build
PASS — tsc -p tsconfig.json

git diff --check
PASS
```

The skipped test is the pre-existing official feasibility result generator and is unrelated to
WO-04D.

### Independent current-read probe

An additional no-repository-write diagnostic built fresh stores and independently exercised eight
scenarios:

```text
Takeover E1 -> append Raw E2 -> read current       PASS
Hot Raw after Frontier 1                           [E2]
close/reopen current + Hot Raw                     PASS
zero Takeover authority                            PASS
zero-axis stray Takeover row                       CORRUPT_DATA
missing latest Takeover row                        CORRUPT_DATA
two exact-owner rows matching the same latest axis CORRUPT_DATA
live component regression                          CORRUPT_DATA
Artifact hash tamper                               CORRUPT_DATA
missing substrate owner marker                     CORRUPT_DATA
```

The normal path returned top-level Ledger revision `2` and Takeover revision `1`, while its nested
Takeover retained historical Ledger revision `1` and Takeover revision `1`. The same distinction and
Hot Raw `[E2]` survived reopen.

## Limitations and hygiene note

- QA ran on Node.js v25.6.1, which satisfies the declared `>=24` engine. Exact Node.js 24 and Windows
  were not separately rerun.
- The required clean-worktree `git diff --check` command passed. An additional parent-to-candidate
  range audit reports Markdown trailing spaces used in the Builder handoff and a blank line at EOF.
  This is a non-functional documentation-hygiene issue; it does not alter source, tests or the bounded
  read contract and is not treated as a WO-04D blocker.

## Acceptance

**ACCEPTED / PASS.** Candidate `39334f94cb1c5ac37587cc261b261b427d2ba1b6` meets the fixed
WO-04D acceptance criteria. No Builder source/test/work-order/handoff/planning file was modified by
Independent QA.
