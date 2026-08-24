# WO-04B Fact / Relation Schema and Transaction Map

Source baseline: `eb7a45bdfa09cd468581145e6270a22a471cf2f6`

Pre-source contract commit:
`4471ce3` (`docs: freeze WO-04B grammar and baseline`)

## Reused frozen authorities

| Authority | Owner | WO-04B use | Mutation policy |
| --- | --- | --- | --- |
| Explicit namespace/stream and five-component vector | `src/revision-substrate.ts` | Same-scope identity and observed high-water snapshot | Read only; every component remains unchanged |
| Canonical Raw Event | `src/ledger-hot-raw.ts` | Fact/Relation provenance and `RAW_EVENT` endpoint existence | Read only; event revision must be no later than observed Ledger high-water |
| Canonical State | `src/canonical-state.ts` | `STATE_ITEM` endpoint existence at exact observed State revision | Read only; legacy State never qualifies |
| Legacy State/Relation | `src/state-store.ts`, `src/reducer.ts` | Compatibility regression only | No read, backfill, mirror or write from the new authority |

Fact/Relation revisions are object/domain revisions. The new writer does not call
any WO-03A commit capability and does not insert or update
`cc_revision_streams` / `cc_revision_commits`.

## Additive schema owner

`src/canonical-fact-relation.ts` exclusively owns:

```text
cc_canonical_fact_relation_schema
cc_canonical_fact_relation_commits
cc_canonical_fact_revisions
cc_canonical_relation_revisions
```

Each table has exact normalized `sqlite_master.sql` and exact column-order
validation. All four tables have no-update and no-delete triggers. The singleton
schema completion row is written last inside the migration transaction.

### Fact revision key

```text
(namespace, stream_id, fact_id, fact_revision)
```

Rows bind stable Fact identity, immutable statement/origin/metadata, the four
orthogonal status fields, monotonic Raw reference sets, authority commit ID,
observed vector, complete projection hash and timestamp. Revisions are positive
and contiguous per scoped Fact.

### Relation revision key

```text
(namespace, stream_id, relation_id, relation_revision)
```

Rows bind stable endpoints/type/origin/confidence/metadata, status, monotonic Raw
provenance, authority commit ID, observed vector, complete projection hash and
timestamp. Revisions are positive and contiguous per scoped Relation.

### Domain commit key

```text
(namespace, stream_id, authority_commit_id)
```

The append-only marker stores policy hash, exact normalized request bytes and
SHA-256, observed five-component vector, previous/current object-revision maps,
complete result and timestamp. Object rows have composite foreign keys to the
marker and are unique per commit/object identity.

## Writer map

```text
ContextCompilerCore.commitCanonicalFactsAndRelations
→ no-getter plain-data guard
→ exact grammar / NFC / Cc / bounds / lexical normalization
→ SqliteCanonicalFactRelationStore.commit
→ BEGIN IMMEDIATE
→ existing identity: verify marker + rows + reconstructed request transition
→ new identity: verify code-owned policy
→ read observed WO-03A vector without materializing a stream
→ load current Fact/Relation objects
→ apply exact per-object CAS and deterministic transitions
→ validate same-scope Raw/Fact/State endpoints, reason edges, active-edge
  uniqueness and bounded SUPERSEDES/DEPENDS_ON acyclicity
→ insert domain marker, Fact revisions and Relation revisions
→ re-read and require the five-component vector byte-equivalent
→ COMMIT
→ one-snapshot marker/row/request/result revalidation before return
```

No other production writer owns the new tables. The package root hides the
Store/migration; Core owns the Store in a JavaScript private field; MCP has no
route to the library writer.

## Reader map

| Reader | Snapshot and binding |
| --- | --- |
| Current scope | One `BEGIN` reads live vector, latest Fact/Relation row per object and unique domain markers; validates hashes, request/result reconstruction, event bounds, endpoints, graph and reason invariants |
| Exact Fact revision | One `BEGIN` reads the exact row, its domain marker, original request, previous Fact revision and live vector |
| Exact Relation revision | One `BEGIN` reads the exact row, marker, original request, previous Relation revision and live vector |
| Exact domain commit | One `BEGIN` reconstructs every changed row from request + previous object revision, validates maps/result/vector, and requires historical vector component-wise no later than live |
| Absent scope | Explicit empty Fact/Relation projection + zero vector; no row materialized |

Request reconstruction closes coordinated row/result replacement. Request-only
replacement is detected by reduction from the changed proposal to unchanged
rows. Observed-vector replacement is bounded by each referenced Raw Event and
the live vector. Exact retry validates stored authority before comparing request
identity, so corruption cannot be downgraded to a benign conflict.

## Policy and graph map

- Fact axes remain separate: origin, verification, lifecycle and record status.
- `contested`, `superseded` and `retracted` require active incoming
  `CONTRADICTS`, `SUPERSEDES` and `RETRACTS` reason edges respectively.
- An active dispute does not automatically change a verified Fact.
- Fact statement/origin/metadata are immutable; Fact and Relation provenance is
  lexical, unique and monotonic.
- Relation endpoint/type pairing is code-owned. Same-scope `RAW_EVENT`, `FACT`
  and exact-revision `STATE_ITEM` are the only endpoint authorities.
- Active semantic edge tuples are unique; self-edges and bounded cycles fail the
  whole batch.
- `model_inferred` requires confidence `[0,1]`; every other origin forbids it.

## Crash / conflict map

| Failure or race | Required durable result |
| --- | --- |
| invalid grammar/policy shape | zero mutation |
| missing/cross-scope/after-high-water provenance | zero domain row/marker |
| object CAS/transition/reason/endpoint/graph failure | zero domain row/marker |
| marker, Fact or Relation insert failure | total rollback |
| real deferred-FK COMMIT failure | total rollback; no object revision consumed |
| exact retry | original result; no second marker or row |
| same-object same-base race | at most one distinct winner |
| concurrent exact retry | both receive revision 1; one row/marker |
| disjoint object commits | SQLite serialization; independent object revisions remain contiguous |
| row/request/result/vector substitution | `CORRUPT_DATA`; never accepted authority |
| fresh/legacy concurrent first-open | one exact completed schema; no legacy backfill |
| partial collision / forged completion | constructor `STORAGE_FAILURE` |

## Compatibility and prohibited-path proof target

Builder/QA compare the baseline to the candidate and require no diff in:

- frozen `src/revision-substrate.ts`, `src/ledger-hot-raw.ts`,
  `src/canonical-state.ts` and their direct tests;
- legacy State/Relation source and tests except allowlisted Core boundary tests;
- MCP service/server/protocol, exact nine commands and Host adapter;
- package/config/dependencies, evaluator and official artifacts.

No Takeover/Enrichment, Frontier, Compaction Artifact, Snapshot, Promotion,
background worker, provider/network or Host behavior is present.
