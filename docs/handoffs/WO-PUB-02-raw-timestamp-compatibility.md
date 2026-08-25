# WO-PUB-02 Builder Handoff — Raw Timestamp Compatibility

Status: **SECOND BUILDER FIX COMPLETE / AWAITING FRESH INDEPENDENT RE-QA**

Planning baseline: `db760a8bc8dfa8bc07f16469b5fa3252a4fc9d90`

Implementation baseline: `b9b2dedebf97c6d9c66369af4aaab70904f73fe9`

Returned candidate: `462e35f58bb1bdd0b4f50dc833aa6925097b8292`

Independent QA return: `64f787606b18d138c67b880ec43a1bd198629680`

First fixed candidate: `dfe71d3e36cf6304c4cb88abc0cec9d14c01c525`

Fresh Independent re-QA return: `beacfca3f02d58184ebbe4a89e056d11ffb6830f`

Second fixed candidate: the commit containing this corrected handoff. Fresh Independent re-QA must resolve
and pin its exact hash before review.

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
  UTC month-end leap second :60 is an independent instant
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
UTC month-end leap seconds canonicalize as `...:60.sssZ`; their identity is distinct from the following
minute. Equivalent numeric-offset representations retry idempotently, while non-month-end `:60`, all `:61`
values and a next-minute retry fail closed.

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
recall; unit coverage closes event/range/headline/keyword recall shapes. An actual historical leap-second row
survives stdio reopen/compile/recall and offset-equivalent retry byte-exact, without folding into the next minute.

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

The full append-only baseline-to-second-fixed-candidate range additionally contains two independent QA return
reports, `docs/qa/WO-PUB-02-raw-timestamp-compatibility.md` and
`docs/qa/WO-PUB-02-raw-timestamp-compatibility-fix.md`, for sixteen total paths. The first direct fix range
`64f787606b18d138c67b880ec43a1bd198629680..dfe71d3e36cf6304c4cb88abc0cec9d14c01c525`
changed exactly eleven paths as previously recorded. The second direct fix range from
`beacfca3f02d58184ebbe4a89e056d11ffb6830f` to the second fixed candidate changes exactly eight paths: the five
Builder authority/public docs, `src/raw-store.ts`, `test/raw-store.test.ts` and `test/mcp-protocol.test.ts`.
It does not alter the accepted precision/recall fixes, assembler or MCP schema implementation.

No package, dependency, configuration, database schema, evaluation/official artifact, external QA material,
Host or sibling-repository path is changed.

## Builder verification

```text
npm exec vitest run test/raw-store.test.ts test/assembler.test.ts test/recall.test.ts test/mcp-protocol.test.ts
PASS — 4 files / 113 tests

npm test
PASS — 37 files passed, 1 skipped / 586 tests passed, 1 skipped

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

1. pin second fixed candidate, implementation baseline, both QA returns, fourteen-path Builder surface,
   sixteen-path full append-only range, exact eleven-path first fix and eight-path second fix;
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

Second fresh Independent re-QA proved all three original findings closed, then returned the first fix because
an actual RFC 3339 leap second `2016-12-31T23:59:60Z` was still rejected after append-only reopen. The second
fix models leap seconds separately from ordinary seconds, validates their UTC month-end placement, preserves
stored bytes, accepts equivalent offsets and keeps the following minute a conflicting instant. Focused tests
cover direct store, real stdio compile/recall, second reopen and invalid non-month-end forms.
