# WO-03A Shared Revision / Stream / Transaction Substrate

Status: BUILDER DESIGN — AWAITING INDEPENDENT QA

Authority baseline:
`94f18b702b7eceda9e8afac7cc3d88abddbfb7da`

## 1. Bounded result

WO-03A adds one Core-owned SQLite substrate for future domain writers. It fixes
the persistence and transaction meaning of:

```text
(namespace, stream_id)
→ ledger_revision
→ state_revision
→ raw_frontier_revision + frontier_position
→ takeover_commit_revision
→ immutable, exact-replay commit markers
```

It does not migrate a current `session_id`, Raw `seq`, Experience `seq`, or
State revision into these meanings. It also does not implement Hot Raw selection,
semantic State/Fact/Relation writes, Takeover policy, snapshots, shadow routing,
or promotion.

## 2. Scope contract

Every read and mutation takes an explicit plain-data scope:

```ts
interface RevisionScope {
  namespace: string;
  stream_id: string;
}
```

Accepted namespaces are exactly `authority` and `shadow:<experiment_id>`, where
the shadow suffix is non-blank. Both identifiers must be NFC strings, non-empty,
non-whitespace, at most 500 code units, and free of ASCII control characters.
`stream_id` is an opaque logical-continuity identifier. No code path reads Host
identity or provides a `session_id` fallback.

The composite primary key `(namespace, stream_id)` is the allocation boundary.
Consequently, equal numeric revisions from different scopes have no ordering
relationship.

## 3. Revision vector and legal transitions

An absent scope reads as a zero vector without inserting a row. A successful
first mutation creates the stream row inside the same transaction.

| Operation | Required expectation | Axes advanced | Additional invariant |
| --- | --- | --- | --- |
| `LEDGER` | none | `ledger_revision + 1` | no other axis changes |
| `STATE` | current `state_revision` | `state_revision + 1` | stale expected value conflicts |
| `FRONTIER` | current frontier revision and position | `raw_frontier_revision + 1`; set position | position cannot regress or exceed ledger revision |
| `TAKEOVER` | none | `takeover_commit_revision + 1` | commit ID remains the idempotency identity |
| `TAKEOVER_FRONTIER` | current frontier revision and position | frontier revision and takeover revision each `+ 1`; set position | both changes are one transaction |

All revisions and positions are non-negative JavaScript safe integers. Increment
at `Number.MAX_SAFE_INTEGER` fails closed. `frontier_position` is not a revision
axis and is constrained by `frontier_position <= ledger_revision`.

## 4. Persistence model

The additive schema is owned by `src/revision-substrate.ts`:

- `cc_revision_substrate_schema` is the version/completion proof. Version `1` is
  inserted only after all tables and immutable triggers validate.
- `cc_revision_streams` stores one current vector per composite scope.
- `cc_revision_commits` stores one marker per
  `(namespace, stream_id, commit_id)`.
- update/delete triggers make commit and schema markers append-only.

Each commit marker stores the operation, kind, SHA-256 fingerprint, full
canonical request descriptor, previous/current vectors, canonical result, and
timestamp. The stored descriptor binds scope, commit ID, operation, kind,
normalized request, and operation-specific expected CAS values.

No legacy table is altered or backfilled. The substrate uses the existing shared
SQLite connection initialization policy (`foreign_keys=ON`, busy timeout,
`synchronous=FULL`, WAL for file databases) without changing its owner.

## 5. Common transaction protocol

Every mutation follows the same single-connection protocol:

```text
validate and canonicalize input before mutation
→ BEGIN IMMEDIATE
→ find an existing scoped commit marker
   → exact descriptor replay: COMMIT read transaction and return stored result
   → conflicting descriptor: ROLLBACK and CONFLICT
→ insert-or-observe the scoped zero vector
→ read and validate the current vector
→ compute the one legal transition and validate CAS
→ invoke the Core-internal domain callback with the same DatabaseSync handle
→ normalize the callback result
→ full-vector compare-and-swap update
→ append the immutable marker
→ COMMIT
```

Callback failure, CAS failure, marker failure, or commit failure rolls back the
domain rows, vector allocation, frontier position, and marker together. The
substrate rejects a nested substrate transaction on the same instance.

The callback context is intentionally available only from the internal module;
the stable package root and the MCP command port expose neither the SQLite handle
nor a generic mutation operation.

## 6. Exact replay and corruption behavior

Input accepts only canonicalizable plain JSON data: finite numbers other than
negative zero, dense ordinary arrays, and enumerable data properties on ordinary
or null-prototype objects. Cycles, symbols, accessors, sparse/exotic arrays, class
instances, unknown input keys, and unsupported values fail before `BEGIN`.

Object keys are sorted recursively. Exact replay requires all three to agree:

1. operation and kind;
2. internally computed SHA-256 descriptor fingerprint;
3. canonical descriptor bytes stored in the marker.

The callback is not rerun on replay. The stored fingerprint is recomputed on
read, previous/current vectors are validated against the operation transition,
and malformed or inconsistent marker content produces `CORRUPT_DATA`.

## 7. Migration and concurrency

Migration runs under `BEGIN IMMEDIATE`. If the version table is absent, any
pre-existing substrate table or trigger name is treated as a collision and the
transaction rolls back. If the completion table exists, the expected columns,
required triggers, and single supported version must validate before use.

SQLite busy/locked initialization races use the existing bounded retry policy.
Two independent connections can therefore open a fresh or legacy database
concurrently, while revision CAS is serialized and revalidated inside the write
transaction. Tests prove that two State writers with the same expected revision
produce one winner and one stable conflict.

## 8. Core and adapter boundary

`ContextCompilerCore` owns the substrate lifecycle alongside the current Stores
and exposes only `getRevisionVector(scope)` as a read query. Root exports contain
the read types, constants, and stable error type, but not
`SqliteRevisionSubstrate`, mutation helpers, or a database context. MCP remains a
thin adapter over exactly the existing nine commands.

The internal mutation helpers are a repository-module boundary for later Core
domain writers, not a new Host API or security sandbox. A future consumer must be
implemented in a routed Core work order and must supply an explicit scope.

## 9. Compatibility and deferred convergence

Current Raw/Event, Experience, State, Headline/FTS, Recall, compile telemetry,
evaluation, and protocol paths retain their accepted behavior. In particular,
current `ingest_event` does not advance the new ledger axis. Silent convergence
would require guessing that a v0 session is a v3.1.1 stream and is therefore
forbidden.

WO-03B and WO-04 must explicitly choose their domain rows, scope routing, and
business validation before using these primitives. Numeric revision equality
must never be used to bridge old and new authorities or different scopes.

## 10. Known limits

- Schema version 1 supports additive initialization only; no upgrade from a
  future substrate version is implemented.
- Shadow support is isolated storage only.
- The callback is trusted Core-internal code. Domain-specific authorization and
  invariants remain the responsibility of the consuming work order.
- Full-system crash matrices, snapshots, workers, and recovery orchestration are
  deferred to their routed work orders.
