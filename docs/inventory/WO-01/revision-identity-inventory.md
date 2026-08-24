# WO-01 Revision, Cursor, and Identity Inventory

Source baseline: `f618ed4af4b40bc51b5b3eb8fc19bf1e61c51f52`

| Identity / counter | Scope | Monotonic / unique | Persisted | Reuse semantics | v3.1.1 reuse assessment |
|---|---|---|---|---|---|
| `RawEvent.id` | Global random identity | UUID uniqueness, not ordered | `raw_events.id` | Never reused | Stable object reference is reusable |
| `raw_events.seq` | `session_id` | Monotonic contiguous allocation under `BEGIN IMMEDIATE`; unique per session | Yes | Identifies Raw order in one session | Useful primitive, but not a namespace/stream `ledger_revision` and not cross-session |
| `source_event_id` | `session_id` | Unique when supplied | Yes | Exact retry returns existing Raw; changed payload conflicts | Strong ingest idempotency pattern; can inform future event identity |
| EVENT mirror ID | Raw Event | Deterministic `raw-event:<raw-id>` | Experience ledger | Same Raw maps to same mirror | Reusable object-link pattern |
| `experience_ledger.id` | Global random, except deterministic Raw mirror | UUID/deterministic identity | Yes | Never rewritten | Stable record reference is reusable |
| `experience_ledger.seq` | `session_id` | Monotonic per session under writer transaction | Yes | Ordered replay | Closest current ledger cursor, but not shared with Raw seq and lacks namespace/stream |
| `source_key` | `session_id` | Unique per session | Yes | Exact-shape idempotent retry; changed data conflicts | Strong generic idempotency primitive; semantics must be tightened per canonical object |
| `context_state_revisions.revision` | `session_id` | Monotonic on each dirty State transaction | Yes | Expected revision is a compare-and-commit guard | Reusable State CAS pattern, but lacks namespace/stream and shared allocator/commit marker |
| `preparation_token` | One State preparation | UUID | Yes | Stable immutable lookup; not consumed | Useful immutable proposal/snapshot identity, not an Attempt or ContextSnapshot ID |
| preparation `fingerprint` | Preparation JSON bytes | SHA-256 content identity | Yes | Must match exact stored/rebuilt snapshot | Reusable content-addressing pattern |
| preparation `expected_revision` | Session State | Snapshot of State revision | Yes | Apply conflicts when current revision differs | Reusable revision guard |
| `operation_id` | Session compile telemetry only | Caller supplied; uniqueness enforced indirectly by compile source key | Persisted in trace/source key | Same ID and exact compile returns same trace; different compile conflicts | Partial Operation identity only; does not cover ingest, Attempt, Action, verification, or response |
| compile trace ID/seq | Session ledger | Random ID + ledger seq | Yes | Trace retry returns original record | Useful audit identity; not a ContextSnapshot/Attempt identity |
| retrieval hit ID/seq | Session ledger | Random ID + ledger seq | Yes | Stable source tuple prevents duplicate hit | Reusable child-record idempotency pattern |
| `HistoryHeadline.id` | Global random identity | UUID | Yes | Unique range per session; same content retry returns existing | Stable derived-artifact identity, but no content hash/version/policy identity |
| Raw `dense_embedding.vector_space_id` | Caller-defined vector space | String equality only | Yes | Must match query/candidates for hybrid | Not a runtime stream identity |
| evaluator/report version | Artifact schema | Fixed constants 1/2 | Input/output artifacts | Chooses historical semantics | Schema version only, not runtime revision |
| extractor contract version | Extractor protocol | Fixed constants 1/2 | Returned in runtime result; prompt | v1 frozen, v2 explicit current-event | Protocol version only |
| policy version | Operational compiler | Fixed `operational-context-v1` | Compile trace | Exact telemetry validation | Policy identity pattern, not full config/snapshot identity |

## Missing identities

The current repository has no:

```text
namespace
stream_id
raw_frontier_revision
frontier_position
takeover_commit_id
takeover_commit_revision
fact_revision
relation_revision
snapshot_id
attempt_id
action_id
request_id
tool_call_id
delivery_id
delivery_attempt_id
claim_id / lease identity
epoch / generation
```

## Shared Revision Substrate answer

**No current construct can be directly reused as the complete v3.1.1 Shared Revision Substrate.**

The repository contains valuable primitives:

- transactionally allocated per-session sequences;
- a per-session State revision with expected-revision conflict detection;
- stable object IDs, idempotent source keys, and immutable fingerprints;
- database-wide `BEGIN IMMEDIATE` linearization tests.

They are not a shared substrate because Raw seq, Experience seq, and State revision are independently scoped, none carries `namespace + stream_id`, there is no common commit marker/allocator, and no Frontier or Takeover axes exist. WO-03A should wrap and generalize these proven patterns after WO-02 freezes ownership; WO-01 must not create that substrate.
