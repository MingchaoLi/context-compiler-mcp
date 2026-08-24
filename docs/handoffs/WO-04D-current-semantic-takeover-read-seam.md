# WO-04D Builder Handoff — Current Semantic Takeover Read Seam

Status: **BUILDER COMPLETE / AWAITING INDEPENDENT QA**  
Work order: `docs/work-orders/WO-04D-current-semantic-takeover-read-seam.md`  
Source baseline / planning authority: `b22f1d9e4035c55b55b90f38967a8015437c1d19`  
Execution-baseline commit: `fcca8554d0bd6f0deeb0e4ab5d5f17676dcf8e39`  
Builder parent: `fcca8554d0bd6f0deeb0e4ab5d5f17676dcf8e39`  
Builder candidate: the commit containing this handoff; Independent QA must resolve and pin its exact
hash before review.

## Bounded result

WO-04D corrects one Core-private current-read predicate. The latest Takeover identity remains the
exact live `takeover_commit_revision`, while the matching Takeover's historical commit vector is now
required to be component-wise at or before the live vector rather than byte-equal to it.

```diff
- sameVector(matched.current_revision_vector, live)
+ vectorAtOrAfter(live, matched.current_revision_vector)
```

Candidate selection is unchanged: every row is still read through the existing exact
`readSemanticTakeoverInsideCore` owner proof, and exactly one candidate must match the live Takeover
axis. Artifact retrieval remains exact and owner-bound. The returned top-level vector is live; the
nested Takeover retains its immutable historical vectors.

## Failure closed

The new regression executes the formerly impossible normal chain:

```text
Raw E1 → Takeover E1 → Raw E2 → readCurrent
```

It proves:

- live Ledger advances to 2 while Takeover axis remains 1;
- current read returns the same exact Takeover and Artifact;
- nested Takeover vector remains Ledger 1 / Takeover 1;
- E2 remains the only Hot Raw Event after Frontier 1; and
- close/reopen returns the same live/current binding.

Existing zero-axis, stray/missing identity, exact read/replay, migration, immutability, composite
tamper, rollback, COMMIT failure and concurrency coverage remains active in the focused/full suites.

## Exact change surface

Relative to Builder parent `fcca855`, the candidate changes exactly:

```text
src/semantic-takeover.ts
test/semantic-takeover.test.ts
docs/handoffs/WO-04D-current-semantic-takeover-read-seam.md
docs/work-orders/WO-04D-current-semantic-takeover-read-seam.md
docs/PROJECT_STATE.md
docs/ROADMAP.md
```

Production source delta is one predicate line. There is no schema, migration, trigger, writer,
request/result grammar, revision substrate, package/config, Core/MCP, Host/provider, frozen v0 or
WO-05 source change.

Candidate fingerprints before commit:

```text
d63b63a62b62d469dbef4ec85815fa2c4c81cd6c394288debe2846428b1ceee1  src/semantic-takeover.ts
61b143811669b8b3a8643cc3b541a5e0f6cee97a88ecb9aa43a4472eaefe8909  test/semantic-takeover.test.ts
ef2c9f996d6d43b9b1f76d3c34e765eb77d96f31720ca1a9ba9e8baf332dcb9f  package.json
519fdcf4b874886466032343c25c5e5973679ef5e0ffc3dec5bf32cba3447d88  package-lock.json
189da4e3b0f7c2b3771fb5aee021b68df401630d369ed0425812fbcac4702559  tsconfig.json
```

## Verification evidence

Completed on 2026-08-25 using isolated temporary SQLite databases:

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

No network, remote model, credential, production DB, destructive command or sibling Host repository
was used.

## Independent QA requirements

The Builder does not approve this candidate. Independent QA should:

1. pin exact candidate/parent/baseline and verify the six-path candidate surface;
2. inspect the one-line production delta and prove no schema/writer/public boundary changed;
3. independently reproduce Takeover → later Raw → current read, Hot Raw and reopen behavior;
4. verify the top-level live vector and nested immutable commit vector are distinct as specified;
5. challenge missing/duplicate/latest-axis/regression/tamper cases and require fail closed;
6. rerun focused tests, full tests, build and `git diff --check`; and
7. issue PASS/FAIL in a physically separate QA task.

