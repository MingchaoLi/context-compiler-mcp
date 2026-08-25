# WO-PUB-02 Second Fresh Independent Re-QA — Leap-second Compatibility Fix

Verdict: **ACCEPTED**

Reviewed second fixed candidate: `cc63a5dea5189be771292d5932ada6b6ac88083d`

Direct parent / fresh re-QA return: `beacfca3f02d58184ebbe4a89e056d11ffb6830f`

First fixed candidate: `dfe71d3e36cf6304c4cb88abc0cec9d14c01c525`

First Independent QA return: `64f787606b18d138c67b880ec43a1bd198629680`

Returned original candidate: `462e35f58bb1bdd0b4f50dc833aa6925097b8292`

Implementation baseline: `b9b2dedebf97c6d9c66369af4aaab70904f73fe9`

Review date: 2026-08-25

## Scope and independence

This was a second fresh Independent re-QA of the append-only leap-second fix. Repository files and Git
history were the only authority. The review used only synthetic temporary SQLite databases, clean Git
archives, production source/package code and public stdio MCP calls. It did not read or request any Natural
Case, Gold, Raw, Evidence, required point, must-not-claim, hidden holdout, external QA artifact, sibling Host,
model, provider, network or credential.

Before this report was written, Git checks proved:

- `main` was clean and exactly at the reviewed candidate;
- every pinned commit exists in one linear append-only chain, and the fresh re-QA return is the direct parent
  of the reviewed candidate;
- the direct second-fix range changes exactly eight declared paths;
- the direct first-fix range changes exactly eleven declared paths;
- the implementation-baseline-to-current range contains exactly fourteen Builder paths plus the two prior
  independent QA return reports, for sixteen paths total; and
- no package/dependency/configuration, database schema/migration, revision axis, State, Retrieval,
  user-turn/role, import, Host or sibling-repository path changed.

The Builder did not approve this result.

## Leap-second return condition

The prior counterexample is closed. Independent synthetic reproduction performed the following operations:

1. initialized an isolated database through real stdio `ingest_event`;
2. stopped that process and appended `2016-12-31T23:59:60Z` using only `INSERT` as the next positive unique
   Raw sequence;
3. reopened through real stdio and read the row through the Raw Store, `compile_context`, exact event recall,
   sequence-range recall, headline recall and keyword recall;
4. retried the same source id with the offset-equivalent
   `2017-01-01T07:59:60.000+08:00` and received the original row and original timestamp bytes;
5. retried the same source id with the following ordinary minute and received sanitized `CONFLICT`;
6. repeated compile after a second reopen and obtained byte-identical rendered context; and
7. audited SQLite bytes and the ledger mirror, then proved the existing Raw `UPDATE` trigger still rejects
   mutation.

Observed:

```text
historical leap replay                         PASS
Raw Store / compile                           PASS
event / range / headline / keyword recall     PASS
offset-equivalent retry                       PASS, original bytes returned
following-minute retry                        CONFLICT
second reopen / rendered body                 byte-identical
stored raw timestamp                          2016-12-31T23:59:60Z
ledger mirror occurred_at                     2016-12-31T23:59:60Z
Raw UPDATE                                    rejected as append-only
```

Fractional leap identity is also exact. A historical
`2016-12-31T23:59:60.123000000000000000Z` row accepts an offset-equivalent `.123` retry while a `.124`
retry conflicts. The leap instant remains distinct from `2017-01-01T00:00:00Z`. A non-UTC-month-end
`:60` and every tested `:61` are sanitized `INVALID_INPUT` and consume no append.

## Earlier return matrices

All earlier return conditions were independently repeated and remain closed:

- historical ten-digit and more-than-100-digit fractions replay without a hidden precision ceiling;
- a non-zero sub-millisecond historical instant conflicts with a millisecond-only retry;
- a long zero-tail fraction and an offset-equivalent millisecond retry are idempotent and return the original
  stored bytes;
- an invalid stored calendar timestamp fails closed in direct Raw Store reads and public compile, event,
  range, headline and keyword recall; no invalid Raw evidence crosses a successful public result;
- new public writer inputs with one, two and three fractional digits, seconds and numeric offsets canonicalize
  to UTC milliseconds;
- reverse, equal, late and future source times append as consecutive `seq` values, and compile renders in
  append order rather than timestamp order; and
- invalid new timestamps are rejected before append.

No replay, retry or reopen path performed Raw `UPDATE`, backfill, delete or timestamp migration.

## Public protocol and drift checks

The implementation baseline and candidate were built from separate clean Git archives and queried through
real MCP `tools/list`. Both expose the same nine tools in the same order. Removing only
`ingest_event.inputSchema.properties.created_at` makes every tool object byte-value equal. The sole declared
input-schema refinement remains:

```text
baseline:  { type: "string" }
candidate: { type: "string", format: "date-time", pattern: <declared 1-3 digit RFC 3339 pattern> }
```

Dynamic package-root inspection found 105 exports in each build with identical names. Fresh databases
initialized by the baseline and candidate had byte-value-equivalent `sqlite_master` definitions across 86
schema objects and the same `user_version`. Public calls retained sanitized closed error envelopes, stdout
remained MCP-protocol-only, and no debug/manifest/candidate/ranking/score/dependency trace crossed the public
result boundary.

Source and range inspection confirmed no change to Raw database DDL, migration versions, revision owners,
State evolution, retrieval/ranking, user-turn/orphan/role behavior, import policy or other public tool
contracts. The current user-turn boundary behavior is therefore unchanged by this timestamp-only work order.

## Commands and results

Environment:

```text
Darwin 25.5.0 arm64
Node.js v25.6.1
npm 11.9.0
```

Checks:

```text
npm exec vitest run test/raw-store.test.ts test/assembler.test.ts test/recall.test.ts test/mcp-protocol.test.ts
PASS — 4 files / 113 tests

npm test
PASS — 37 files passed, 1 skipped / 586 tests passed, 1 skipped

npm run build
PASS — tsc -p tsconfig.json

git diff --check b9b2dedebf97c6d9c66369af4aaab70904f73fe9..cc63a5dea5189be771292d5932ada6b6ac88083d
PASS
```

The focused and full protocol suites include the production-only npm-package stdio test. It prunes
development dependencies offline, starts the packaged server with declared runtime dependencies only, then
proves reverse source-time ingestion and compile success.

## Disposition

WO-PUB-02 is accepted at fixed candidate `cc63a5dea5189be771292d5932ada6b6ac88083d`.
The leap-second replay gap and both prior QA return sets are closed without rewriting historical Raw,
changing database schema, adding a time/revision axis, or altering event size, user-turn/role, import,
Retrieval, State, public result-boundary, Host or Natural QA behavior.
