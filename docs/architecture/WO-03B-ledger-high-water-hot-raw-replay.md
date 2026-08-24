# WO-03B Ledger High-water + Hot Raw Replay

Status: BUILDER DESIGN — AWAITING INDEPENDENT QA

Authority baseline:
`06d736a0a8a7ab3cfb03228b345898ac4a57a658`

## 1. Bounded result

WO-03B adds the first canonical Raw Event projection on the accepted WO-03A
substrate:

```text
explicit Raw Source projection
→ append-only scoped Raw Event
→ ledger_revision / durable high-water
+ committed frontier_position
→ reconstructible Hot Raw tail
```

It does not change the WO-03A allocator, CAS, marker, schema, or private
capability. It does not advance Frontier or implement semantic takeover, Facts,
State policy, Compaction Artifacts, snapshots, retrieval policy, push workers,
or Host integration.

## 2. Explicit input and identity

The Core library method accepts:

```ts
interface RawSourceProjectionInput {
  scope: { namespace: string; stream_id: string };
  event_id: string;
  source_kind: "user_input" | "tool_result" | "file" | "external_observation";
  source_id: string;
  source_session_id?: string;
  payload: JsonValue;
  occurred_at?: string;
}
```

Scope follows the frozen `authority` / non-blank `shadow:<experiment_id>` and
opaque stream contract. `event_id` is the stable idempotency identity within the
composite scope. `source_session_id`, when present, is provenance only: it is
stored in the Event but is never read as stream identity or used to allocate a
revision. Multiple source sessions can therefore append to the same logical
stream, and equal event IDs can remain isolated in different scopes.

Identifiers must be NFC, non-blank, bounded, and free of Unicode `Cc` control
characters. `occurred_at` must be an exact UTC ISO timestamp. Payload accepts
only canonical plain JSON: dense ordinary arrays and enumerable data properties
on ordinary or null-prototype objects; cycles, accessors, symbols, exotic arrays,
non-finite values, and negative zero fail before mutation.

## 3. Persistence model

Schema version 1 is owned by `src/ledger-hot-raw.ts`:

- `cc_ledger_hot_raw_schema` is the immutable version/completion proof;
- `cc_ledger_raw_events` stores canonical append-only projections;
- update/delete triggers protect both Event and schema records.

Each Event stores:

```text
namespace + stream_id + ledger_revision       primary order
namespace + stream_id + event_id              scoped stable identity
source_kind + source_id + source_session_id?  source provenance
payload_json + occurred_at? + created_at       immutable source projection
```

The Event table has a composite foreign key to the accepted
`cc_revision_streams` scope row. Reopen validates exact column order, one schema
version, and whitespace-normalized `sqlite_master` SQL for every table and
trigger, including PK/UNIQUE/FK/CHECK/NOT NULL clauses and trigger bodies.

Migration uses `BEGIN IMMEDIATE`; the completion row is inserted last in the
same transaction. A pre-completion same-name object or a forged/incomplete
completion fails closed. Legacy `raw_events` is not read, altered, or backfilled.

## 4. Atomic append and replay

`SqliteLedgerHotRawStore.append` normalizes all input before calling the frozen
`commitLedgerRevisionInsideCore` primitive. The resulting single substrate
transaction performs:

```text
BEGIN IMMEDIATE
→ exact scoped marker replay check
→ read current scope vector and compute ledger_revision + 1
→ reject a duplicate scoped event_id
→ insert cc_ledger_raw_events at the new ledger_revision
→ full-vector CAS
→ append immutable RAW_EVENT_APPEND marker
→ COMMIT
```

The marker descriptor binds scope, event ID, source kind/ID, optional source
session, canonical payload, and optional occurrence time. `created_at` is a
first-commit result field and is replayed from the marker; the callback is not
rerun. Same scoped event + exact normalized input returns the original Event.
Any input substitution conflicts. Same event ID in another scope is independent.

Event insert, vector CAS, marker, or commit failure rolls back the domain row,
revision allocation, and marker. The next successful Event therefore consumes
the next actual ledger revision rather than leaving a failed-write gap.

## 5. Ledger high-water

For one explicit scope:

```text
ledger_high_water = revision_vector.ledger_revision
```

The caller cannot supply or override this number. The Event written by a
successful append receives exactly the new scoped ledger revision. Different
scopes use the already-frozen independent allocator; their numeric values have
no cross-scope ordering meaning. Safe-integer exhaustion fails before the Event
callback and leaves no row or marker.

## 6. Hot Raw rebuild

`rebuildHotRaw(scope)` opens one SQLite deferred read transaction. Its first read
establishes a snapshot containing the scope vector/high-water; the second read
selects canonical Events satisfying:

```text
frontier_position < event.ledger_revision <= ledger_high_water
```

Events are returned in ascending ledger order together with the complete scope,
full revision vector, and high-water. If a concurrent append commits after the
snapshot is established, both its revision and Event remain outside the current
result and appear together on the next rebuild. An absent scope returns the zero
vector and empty Events without materializing a row.

No fixed recent-N, chat-turn boundary, headline, retrieval score, or process
memory is an authority boundary. The only rebuild facts are durable Events and
the committed Frontier vector.

## 7. Crash gap and push

Push state is not implemented because it is not a correctness dependency. Once
the append transaction commits, closing or losing the process before any
notification cannot lose Hot Raw: reopen reads the durable vector, Frontier, and
Event rows. This is the bounded WO-03B ingest-crash-gap proof.

Future push/worker paths may accelerate invalidation only. They must not become
an alternate ledger, high-water, or Event authority.

## 8. Frontier boundary

WO-03B only reads `raw_frontier_revision` and `frontier_position`. Tests use the
accepted WO-03A Frontier primitive solely to arrange a non-zero committed test
fixture, then prove rebuild filters earlier Events and leaves the vector
byte/shape equal before and after the read.

Production WO-03B source contains no Frontier or Takeover mutation import/call.
Contiguous semantic coverage and Frontier advancement remain WO-04.

## 9. Core and adapter boundary

`ContextCompilerCore` owns the Hot Raw store in a JavaScript private field and
exposes two domain-specific library methods:

```text
appendRawSourceProjection(input)
rebuildHotRaw(scope)
```

They are deliberately absent from `ContextCompilerCommandPort` and the MCP
adapter, so the accepted nine tools are unchanged. The package root exports the
input/result types, fixed source-kind registry, schema version, and stable domain
error, but not the SQLite store or migration function.

The existing `ingest_event(session_id, ...)` path remains the v0 compatibility
writer and does not advance this ledger. No code assumes that equal
`source_session_id`, legacy `session_id`, Raw seq, or Experience seq is a stream
or ledger revision.

## 10. Compatibility and deferred work

- Existing Raw/Event mirror, State, Recall, compile telemetry, evaluation,
  package/config, and official artifacts are unchanged.
- No legacy row is projected automatically. A future explicit migration would
  require its own bounded work order and identity policy.
- Hot Raw is a rebuild result, not a new authoritative cache table.
- A ledger can later contain non-Raw event kinds; rebuild orders only canonical
  Raw projections present in the selected ledger range and does not require
  their revisions to be numerically contiguous with non-Raw records.
- Semantic completeness, safe-prefix coverage, Frontier advancement, compaction,
  retention, and Snapshot binding remain WO-04/WO-05+.
