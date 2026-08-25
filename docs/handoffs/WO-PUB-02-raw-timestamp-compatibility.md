# WO-PUB-02 Builder Handoff — Raw Timestamp Compatibility

Status: **BUILDER FIX COMPLETE / AWAITING FRESH INDEPENDENT RE-QA**

Planning baseline: `db760a8bc8dfa8bc07f16469b5fa3252a4fc9d90`

Implementation baseline: `b9b2dedebf97c6d9c66369af4aaab70904f73fe9`

Returned candidate: `462e35f58bb1bdd0b4f50dc833aa6925097b8292`

Independent QA return: `64f787606b18d138c67b880ec43a1bd198629680`

Fixed candidate: the commit containing this corrected handoff. Fresh Independent re-QA must resolve and
pin its exact hash before review.

## Bounded result

The public failure was a timestamp representation-domain mismatch, not an inter-event monotonicity check:
the previous Raw writer accepted and stored arbitrary string bytes, while the compile reader accepted only
UTC millisecond `Date.toISOString()` form. A valid RFC 3339 seconds-only or numeric-offset source time could
therefore be ingested but rejected on compile/replay.

The repaired contract is:

```text
new ingest_event.created_at
  RFC 3339 seconds / 1-3 fractional digits / Z or numeric offset
  -> validate one timestamp
  -> canonical UTC milliseconds for the new append

historical append-only Raw
  parseable RFC 3339 seconds / 1*DIGIT fractional seconds / Z or numeric offset
  -> validate one timestamp
  -> preserve stored bytes exactly; never UPDATE/backfill

append and replay order
  -> positive unique session-local seq only
```

Reverse, equal, late, offset-equivalent and future-skew source times are legal. Invalid calendar/time values
fail before a new append and stored invalid values fail closed on Raw Store, compile and every recall row
shape. An exact idempotent retry compares UTC whole-second plus the complete significant fractional value;
it never truncates sub-millisecond digits or rewrites a historical timestamp. Trailing fractional zeros and
equivalent offsets remain the same instant.

The public `ingest_event.created_at` input schema is refined to `format: date-time` plus the frozen RFC 3339
pattern. This is the only input-schema value change. Nine-tool identity/order, all other input schemas, public
result allowlists and sanitized error envelopes remain unchanged.

## Append-only compatibility evidence

The real stdio test appends a newer source time before an older offset source time, compiles in `seq` order,
and rejects an invalid new calendar timestamp without consuming a row. It then inserts a synthetic legacy
Raw row using append-only INSERT with seconds-only timestamp bytes, closes and reopens the service, performs
an idempotent retry, compiles, exact-recalls and reopens again. The legacy timestamp and rendered context are
byte-stable. A ten-digit fraction remains readable while a distinct millisecond-only retry conflicts. A later
append-only row containing an invalid historical calendar value is rejected by compile and public exact
recall; unit coverage closes event/range/headline/keyword recall shapes.

The test performs no Raw UPDATE/backfill/delete. The existing ledger mirror preserves the same legacy source
time bytes. No database schema, migration version, revision axis, Frontier, Takeover, State, Fact/Relation,
Snapshot, retrieval/ranking, event-size, user-turn/role or import behavior changes.

## Exact Builder change surface

The Builder implementation surface across the returned candidate plus append-only fix changes exactly these
fourteen paths relative to implementation baseline `b9b2dedebf97c6d9c66369af4aaab70904f73fe9`:

```text
README.md
docs/PROJECT_STATE.md
docs/ROADMAP.md
docs/work-orders/WO-PUB-02-raw-timestamp-compatibility.md
docs/handoffs/WO-PUB-02-raw-timestamp-compatibility.md
src/raw-store.ts
src/assembler.ts
src/core.ts
src/mcp-server.ts
test/raw-store.test.ts
test/assembler.test.ts
test/mcp-protocol.test.ts
src/recall.ts
test/recall.test.ts
```

The full append-only baseline-to-fixed-candidate range additionally contains the independent QA return report
`docs/qa/WO-PUB-02-raw-timestamp-compatibility.md`, for fifteen total paths. The direct fix range from QA return
`64f787606b18d138c67b880ec43a1bd198629680` to the fixed candidate changes exactly eleven paths: the five
Builder authority/public docs, `src/core.ts`, `src/raw-store.ts`, new routed `src/recall.ts`, and the three
corresponding tests. It does not alter the passing first-candidate assembler or MCP schema implementation.

No package, dependency, configuration, database schema, evaluation/official artifact, external QA material,
Host or sibling-repository path is changed.

## Builder verification

```text
npm exec vitest run test/raw-store.test.ts test/assembler.test.ts test/recall.test.ts test/mcp-protocol.test.ts
PASS — 4 files / 111 tests

npm test
PASS — 37 files passed, 1 skipped / 584 tests passed, 1 skipped

npm run build
PASS — tsc -p tsconfig.json

git diff --check
PASS
```

The production-only npm package stdio test is part of the focused and full runs and proves reverse source
times compile successfully with only declared runtime dependencies. All tests use synthetic temporary data.
No Natural Case, Gold, Evidence, required point, must-not-claim, hidden holdout, QA artifact, model, provider,
network, credential or sibling Host source was read.

## Independent QA requirements

The Builder does not approve this candidate. Fresh Independent QA must at minimum:

1. pin fixed candidate, implementation baseline, QA return, fourteen-path Builder surface, fifteen-path full
   append-only range and exact eleven-path fix range;
2. independently prove writer normalization and reverse/equal/late/offset/future time acceptance in `seq` order;
3. create a historical row only by append-only INSERT, then prove reopen, idempotent retry, compile, Hot Raw,
   exact recall and second replay preserve its timestamp/body bytes without UPDATE/backfill;
4. prove invalid new and stored timestamps fail closed without weakening existing Raw integrity checks;
5. compare parent/candidate `tools/list` and prove only `ingest_event.created_at` has the declared schema refinement;
6. prove public result-boundary allowlists, nine-tool order, all other inputs/errors and stdout purity remain intact;
7. run from a production-only package and repeat focused/full/build/diff checks; and
8. write and commit a separate QA report.

The currently hosted public process remains unchanged until this candidate passes Independent QA.

## Append-only QA-return correction

First Independent QA passed the declared common timestamp matrix, schema diff, package, build and all
Builder tests, but returned the candidate on three synthetic historical counterexamples:

1. a distinct `.123999999Z` historical instant was accepted as an idempotent `.123Z` retry;
2. invalid stored time crossed public `recall_exact` as a successful event; and
3. a valid ten-digit RFC 3339 fraction was rejected by compile.

The fix removes the hidden historical precision ceiling, preserves full significant-fraction identity,
and validates stored Raw timestamps in Raw Store plus event/range/headline/keyword recall readers. Tests use
ten-digit public stdio evidence and over-100-character unit precision, including non-zero conflict and
zero-tail equivalence. No existing commit or Raw row is rewritten.
