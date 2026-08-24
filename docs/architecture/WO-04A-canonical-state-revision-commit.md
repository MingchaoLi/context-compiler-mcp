# WO-04A Canonical State Revision Commit Contract

Status: BUILDER CONTRACT — source baseline
`4e7758ac459c879944c624eb27ffefcfb24a2aec`

## 1. Scope and split

WO-04A creates one additive Core authority path. It does not replace the legacy
session State path and does not implement the rest of Umbrella WO-04.

```text
04A  Canonical State Revision commit
04B  Fact / Relation Authority + policy
04C  Semantic Takeover / Enrichment + contiguous Frontier + artifact
```

WO-05 remains blocked on 04B and 04C even if 04A is accepted.

## 2. Canonical proposal grammar

The library input has exactly these keys:

```text
scope
state_commit_id
commit_mode
expected_state_revision
proposal
policy_hash
provenance_event_ids
```

`scope` is explicit `{namespace, stream_id}`. `commit_mode` is exactly one of
`immediate_authority`, `lazy_historical`, or `targeted_on_demand`; all modes use
the same validation and transaction.

`proposal` is exactly:

```text
{
  schema_version: 1,
  upsert_items: [
    {
      item_id,
      kind,
      content,
      status,
      source_event_ids,
      metadata
    }
  ]
}
```

`kind` and allowed statuses are:

| kind | initial | transitions |
| --- | --- | --- |
| `GOAL` | `ACTIVE` | `ACTIVE → COMPLETED \| SUPERSEDED`; terminal self only |
| `CONSTRAINT` | `ACTIVE` | `ACTIVE → SUPERSEDED`; terminal self only |
| `DECISION` | `ACTIVE` | `ACTIVE → SUPERSEDED`; terminal self only |
| `OPEN_QUESTION` | `OPEN` | `OPEN → DEFERRED \| RESOLVED`; `DEFERRED → OPEN \| RESOLVED`; `RESOLVED` terminal |
| `REJECTED_ALTERNATIVE` | `REJECTED` | self only |

Within a same-status update, content, metadata, or provenance must still change.
Kind and `item_id` never change. No item-delete operation exists in 04A.

Bounds are part of version 1: 1–100 upserts; identifiers 1–500 characters;
content 1–10,000 characters; at most 100 unique source Event IDs per item and
1,000 unique provenance Event IDs per commit. Identity/content/metadata strings
and metadata keys must be NFC and contain no Unicode general-category `Cc`;
plain JSON numbers must be finite and not negative zero. Accessors, symbols,
sparse arrays, exotic prototypes and cycles are invalid without evaluation.

Upserts are normalized by lexical `item_id`; source/provenance IDs are normalized
lexically. Duplicate item/Event IDs are invalid. The top-level provenance list
must equal the exact union of all per-item `source_event_ids`, so unused authority
evidence cannot be attached.

Every referenced Event must already exist in `cc_ledger_raw_events` under the
same namespace/stream. Legacy `raw_events`, session IDs and Raw sequence numbers
are not accepted as provenance.

## 3. Reduction and no-op policy

The zero State is:

```json
{"schema_version":1,"items":[]}
```

Reduction clones the previous immutable State, applies normalized upserts in
lexical `item_id` order, validates initial/transition/provenance rules, and emits
the complete State sorted by `item_id`. Existing per-item source refs are
monotonic: an update may add refs but cannot remove any previous ref.

Empty proposals are `INVALID_INPUT`. A non-empty proposal whose complete reduced
State is byte-identical to the previous State is `CONFLICT`. Neither case creates
a scope row, State row, revision or marker. Therefore every successful 04A commit
advances `state_revision` exactly once; there is no ambiguous no-op authority
revision.

## 4. Policy identity

`CANONICAL_STATE_POLICY_VERSION` is `canonical-state/v1`. The Core owns a frozen
plain-data descriptor containing schema version, grammar, bounds, status
transitions, lexical normalization, exact-union provenance, monotonic item
provenance, no-delete and reject-empty/no-op rules. Its canonical JSON SHA-256 is
`CANONICAL_STATE_POLICY_HASH`.

The caller must echo that hash so a proposal prepared against another policy
fails before mutation. The Core recomputes/owns the hash; a caller-supplied value
does not select or define policy.

## 5. Atomic authority commit

`state_commit_id` is the scoped idempotency identity. The normalized request
excludes scope/commit ID because the frozen WO-03A descriptor binds both, and
contains mode, proposal, policy hash and provenance IDs.

The frozen WO-03A State commit callback performs:

```text
check expected_state_revision
→ verify same-scope committed Raw Event refs
→ load and validate previous complete State
→ deterministic reduction
→ insert immutable cc_canonical_state_revisions row at current.state_revision
→ advance State axis + append immutable WO-03A marker
→ COMMIT
```

The State row records complete proposal and State canonical JSON, state hash,
policy hash, provenance and a transaction-local canonical commit time. Row/axis/marker/
commit failure rolls everything back. Exact normalized retry returns the stored
revision; substitution or stale expected revision is `CONFLICT`.

## 6. Migration and reads

Migration version 1 owns a completion table, immutable State table and immutable
triggers. It runs under `BEGIN IMMEDIATE`, records completion last and validates
exact normalized `sqlite_master.sql`, exact columns and exact singleton version.
Legacy State is never backfilled. Partial/colliding names and forged completion
fail closed.

Latest read fixes one SQLite read snapshot, reads the same-scope complete revision
vector and then the exact State row at `vector.state_revision`. A positive axis
without a byte-valid matching row is corrupt. Absent/zero State returns the zero
State and does not materialize the scope. Exact revision read returns `NOT_FOUND`
for an absent valid revision.

## 7. Public and compatibility boundary

The package root exports the policy/schema constants, data types and stable error,
but not the SQLite Store or migration. Core adds domain library methods only;
`ContextCompilerCommandPort`, MCP commands and Host adapter remain exactly nine.
The Store, substrate, DB and callback capability remain unreachable through Core
instance reflection.

Legacy State prepare/apply/get, reducer, assembly and retrieval continue reading
their existing session tables. Canonical State does not affect Working Context in
04A; that final authority handoff belongs to WO-05.
