# WO-04B — Canonical Fact / Relation Authority and Policy

Status: FROZEN BUILDER INPUT — SOURCE IMPLEMENTATION NOT YET STARTED

## 1. Scope and ownership

WO-04B adds one Core-owned, model/provider-independent Canonical Fact / Relation
authority. Proposal producers remain untrusted. Only the policy validator and
transactional authority commit create durable objects.

This authority is additive. It neither reads from nor writes to legacy
`context_items` / `state_relations`, and its results do not enter the current MCP,
compile, retrieval or assembly paths.

Fact and Relation revisions are object/domain revisions. A commit MUST NOT use
any WO-03A mutation operation and MUST leave this vector unchanged:

```text
ledger_revision
state_revision
raw_frontier_revision
frontier_position
takeover_commit_revision
```

The commit records the vector observed in its own SQLite transaction. It does
not create a revision-stream row when the scope has no primary-axis history.

## 2. Stable public grammar

### 2.1 Batch commit

```ts
interface CanonicalFactRelationCommitInput {
  scope: { namespace: string; stream_id: string };
  authority_commit_id: string;
  policy_hash: string;
  fact_proposals: CanonicalFactProposal[];
  relation_proposals: CanonicalRelationProposal[];
}
```

The two proposal arrays MUST already be strictly ascending by their stable
object ID. Duplicate IDs and non-lexical order are `INVALID_INPUT`. At least one
array must be non-empty. A normalized batch that produces no object revision is
`CONFLICT`.

### 2.2 Fact proposals

```ts
type FactOrigin =
  | "user_asserted"
  | "tool_observed"
  | "host_observed"
  | "imported"
  | "model_inferred";

type VerificationStatus =
  | "unverified"
  | "corroborated"
  | "verified"
  | "contested"
  | "disconfirmed";

type FactLifecycleStatus = "active" | "superseded" | "retracted";
type FactRecordStatus = "live" | "archived";

interface CreateFactProposal {
  op: "CREATE";
  fact_id: string;
  statement: string;
  epistemic_origin: FactOrigin;
  verification_status: VerificationStatus;
  lifecycle_status: "active";
  record_status: "live";
  provenance_event_ids: string[];
  verification_event_ids: string[];
  metadata: JsonObject;
}

interface ReviseFactProposal {
  op: "REVISE";
  fact_id: string;
  expected_fact_revision: number;
  verification_status: VerificationStatus;
  lifecycle_status: FactLifecycleStatus;
  record_status: FactRecordStatus;
  provenance_event_ids: string[];
  verification_event_ids: string[];
}
```

Caller never supplies `fact_revision`, a hash, marker or timestamp. `CREATE`
requires absent identity and implicitly expects revision zero. `REVISE` requires
the exact current positive object revision. Statement, epistemic origin and
metadata are immutable for one `fact_id`. A corrected statement is a new Fact
plus a typed reason Relation.

Every Fact requires at least one same-scope committed canonical Raw Event in
`provenance_event_ids`. Both reference arrays are strict lexical unique sets and
are monotonic across revisions. `verified` and `disconfirmed` require at least
one verification Event.

### 2.3 Relation proposals

```ts
type RelationEndpointType = "RAW_EVENT" | "FACT" | "STATE_ITEM";
type RelationType =
  | "SUPPORTS"
  | "CONTRADICTS"
  | "SUPERSEDES"
  | "RETRACTS"
  | "DERIVED_FROM"
  | "DEPENDS_ON"
  | "RESOLVES";
type RelationStatus = "active" | "retracted";

interface RelationEndpoint {
  type: RelationEndpointType;
  id: string;
}

interface CreateRelationProposal {
  op: "CREATE";
  relation_id: string;
  source: RelationEndpoint;
  relation_type: RelationType;
  target: RelationEndpoint;
  origin: FactOrigin;
  provenance_event_ids: string[];
  confidence?: number;
  status: "active";
  metadata: JsonObject;
}

interface ReviseRelationProposal {
  op: "REVISE";
  relation_id: string;
  expected_relation_revision: number;
  status: RelationStatus;
  provenance_event_ids: string[];
}
```

Caller never supplies `relation_revision`, a hash, marker or timestamp.
Endpoints, type, origin, confidence and metadata are immutable for one
`relation_id`. Provenance refs are non-empty, lexical, unique, same-scope
committed canonical Raw Events and monotonic across revisions.

`model_inferred` requires finite confidence in `[0,1]`. Every other origin
forbids `confidence`, so absence and zero cannot be confused.

## 3. Deterministic Fact policy

Initial lifecycle is `active`; initial record status is `live`.

Allowed verification transitions:

```text
unverified   → corroborated | verified | contested | disconfirmed
corroborated → verified | contested | disconfirmed
verified     → disconfirmed
contested    → corroborated | verified | disconfirmed
disconfirmed → corroborated | verified
```

The same value is permitted only when another allowed field or reference set
actually changes. A reduced no-op is `CONFLICT`.

Allowed lifecycle transitions:

```text
active → superseded | retracted
```

`superseded` and `retracted` are terminal. Allowed record transitions are
`live ↔ archived`; archiving never changes lifecycle or verification.

The final graph in the transaction MUST satisfy:

- each `contested` Fact has an active incoming `CONTRADICTS` Relation;
- each `superseded` Fact has an active incoming `SUPERSEDES` Relation from a
  different Fact;
- each `retracted` Fact has an active incoming `RETRACTS` Relation;
- retracting a Relation may not orphan one of those required conditions.

An active `CONTRADICTS` Relation does not automatically downgrade a `verified`
Fact. This implements the Contract rule that mere dispute of objectively
verified evidence is represented by Relation rather than overloaded status.

## 4. Deterministic Relation registry

All endpoints are implicit members of the Relation's exact scope. Cross-scope
and cross-namespace endpoints are invalid in WO-04B.

| Relation type | Allowed source → target |
|---|---|
| `SUPPORTS` | `RAW_EVENT → FACT`, `FACT → FACT` |
| `CONTRADICTS` | `RAW_EVENT → FACT`, `FACT → FACT` |
| `SUPERSEDES` | `FACT → FACT` |
| `RETRACTS` | `RAW_EVENT → FACT`, `FACT → FACT` |
| `DERIVED_FROM` | `FACT → RAW_EVENT/FACT/STATE_ITEM`, `STATE_ITEM → RAW_EVENT/FACT/STATE_ITEM` |
| `DEPENDS_ON` | `FACT/STATE_ITEM → FACT/STATE_ITEM` |
| `RESOLVES` | `RAW_EVENT/FACT/STATE_ITEM → FACT/STATE_ITEM` |

All self-edges are invalid, including objects of different endpoint types with
the same textual ID only when source and target type also match. Every active
edge tuple `(source.type, source.id, relation_type, target.type, target.id)` is
unique per scope; a second identity for the same active tuple is `CONFLICT`.

Active `SUPERSEDES` Fact graphs and active `DEPENDS_ON` Fact/State-item graphs
must be acyclic. Validation is bounded to 10,000 graph nodes per commit; crossing
the bound is `INVALID_INPUT`, never partial acceptance.

Endpoint existence is checked in the same commit transaction:

- `RAW_EVENT`: a committed `cc_ledger_raw_events` row at or below observed
  `ledger_revision`;
- `FACT`: the current committed Fact, including a Fact created earlier in the
  same normalized batch;
- `STATE_ITEM`: an item in the exact Canonical State revision named by observed
  `state_revision`.

An observed zero State revision has no State item endpoints. Legacy State is
never an endpoint authority.

## 5. Normalization and bounds

Every public Core method first applies the existing no-getter plain-data guard.
The domain validator then enforces exact keys, ordinary objects/arrays, no
accessors, no cycles, no exotic prototypes, no sparse arrays, NFC strings and
no Unicode general-category `Cc` code point.

Identifiers are non-empty, lexical bytes after NFC validation, and at most 500
UTF-16 code units. Statements and metadata strings are at most 10,000 code
units. Metadata is JSON-only, at most depth 8 and at most 100 object keys at any
level. One batch has at most 100 Fact proposals and 200 Relation proposals; one
object revision has at most 1,000 provenance or verification Event IDs.

Canonical JSON recursively sorts object keys and preserves already-validated
array order. SHA-256 is lowercase hexadecimal over UTF-8 canonical JSON bytes.

## 6. Frozen policy descriptor and identity

The exact policy descriptor is the following JSON value. Code may express the
same value as typed constants, but its canonical JSON bytes MUST match.

```policy_descriptor_json
{
  "bounds": {
    "batch_fact_proposals": 100,
    "batch_relation_proposals": 200,
    "graph_nodes": 10000,
    "identifier": 500,
    "metadata_depth": 8,
    "metadata_keys": 100,
    "metadata_string": 10000,
    "object_event_ids": 1000,
    "statement": 10000
  },
  "duplicate_active_edge": "conflict",
  "empty_batch": "invalid",
  "endpoint_types": ["RAW_EVENT", "FACT", "STATE_ITEM"],
  "fact": {
    "epistemic_origins": ["user_asserted", "tool_observed", "host_observed", "imported", "model_inferred"],
    "immutable_fields": ["statement", "epistemic_origin", "metadata"],
    "initial_lifecycle_status": "active",
    "initial_record_status": "live",
    "lifecycle_transitions": ["active>superseded", "active>retracted"],
    "reason_relations": {
      "contested": "CONTRADICTS",
      "retracted": "RETRACTS",
      "superseded": "SUPERSEDES"
    },
    "record_transitions": ["live>archived", "archived>live"],
    "reference_policy": "same-scope-committed-raw-lexical-unique-monotonic",
    "verification_requires_refs": ["verified", "disconfirmed"],
    "verification_statuses": ["unverified", "corroborated", "verified", "contested", "disconfirmed"],
    "verification_transitions": ["unverified>corroborated", "unverified>verified", "unverified>contested", "unverified>disconfirmed", "corroborated>verified", "corroborated>contested", "corroborated>disconfirmed", "verified>disconfirmed", "contested>corroborated", "contested>verified", "contested>disconfirmed", "disconfirmed>corroborated", "disconfirmed>verified"]
  },
  "normalization": "nfc-no-unicode-cc-lexical-unique-arrays",
  "object_delete": "forbidden",
  "policy_version": "canonical-fact-relation/v1",
  "reduced_no_op": "conflict",
  "relation": {
    "confidence_policy": "required-model-inferred-otherwise-forbidden-finite-zero-to-one",
    "immutable_fields": ["source", "relation_type", "target", "origin", "confidence", "metadata"],
    "pairings": {
      "CONTRADICTS": ["RAW_EVENT>FACT", "FACT>FACT"],
      "DEPENDS_ON": ["FACT>FACT", "FACT>STATE_ITEM", "STATE_ITEM>FACT", "STATE_ITEM>STATE_ITEM"],
      "DERIVED_FROM": ["FACT>RAW_EVENT", "FACT>FACT", "FACT>STATE_ITEM", "STATE_ITEM>RAW_EVENT", "STATE_ITEM>FACT", "STATE_ITEM>STATE_ITEM"],
      "RESOLVES": ["RAW_EVENT>FACT", "RAW_EVENT>STATE_ITEM", "FACT>FACT", "FACT>STATE_ITEM", "STATE_ITEM>FACT", "STATE_ITEM>STATE_ITEM"],
      "RETRACTS": ["RAW_EVENT>FACT", "FACT>FACT"],
      "SUPERSEDES": ["FACT>FACT"],
      "SUPPORTS": ["RAW_EVENT>FACT", "FACT>FACT"]
    },
    "provenance_policy": "same-scope-committed-raw-lexical-unique-monotonic",
    "status_transitions": ["active>retracted"],
    "statuses": ["active", "retracted"],
    "types": ["SUPPORTS", "CONTRADICTS", "SUPERSEDES", "RETRACTS", "DERIVED_FROM", "DEPENDS_ON", "RESOLVES"]
  },
  "schema_version": 1,
  "scope": "explicit-same-scope-only-no-promotion",
  "vector": "observe-five-components-no-advance"
}
```

Policy hash algorithm:

```text
sha256(UTF8(canonicalJson(policy_descriptor)))
```

Frozen policy hash:
`f9dc4c757d8ae4a558d29ecebd494323b5a8de55b78312b2423a14db0a4fb570`

## 7. Persistence schema

Schema version 1 owns four exact objects plus immutable triggers:

```text
cc_canonical_fact_relation_schema
cc_canonical_fact_relation_commits
cc_canonical_fact_revisions
cc_canonical_relation_revisions
```

Fact row key is `(namespace, stream_id, fact_id, fact_revision)`. Relation row
key is `(namespace, stream_id, relation_id, relation_revision)`. Object revision
is positive, contiguous and unique per scoped identity. Rows contain the domain
commit ID, complete immutable projection, canonical reference/metadata bytes,
complete projection hash and timestamp.

Domain commit key is `(namespace, stream_id, authority_commit_id)`. It stores:

```text
policy_hash
request_fingerprint
request_json
observed_revision_vector_json
previous_object_revisions_json
current_object_revisions_json
result_json
created_at
```

All objects have exact `sqlite_master` SQL verification, exact column-order
verification, append-only schema completion, and no update/delete triggers.
Same-name partial schema, altered constraints/trigger body and forged completion
fail constructor open as `STORAGE_FAILURE`.

## 8. Commit algorithm

1. Core plain-data guard and complete normalization run before opening a write
   transaction. Unsupported current-policy input is allowed through lexical hash
   normalization so an existing commit identity can be classified first.
2. `BEGIN IMMEDIATE`.
3. Read existing scoped domain marker. Exact canonical request returns its
   verified stored result. Any request substitution returns `CONFLICT` without
   callback or mutation.
4. For a new identity, reject unsupported policy as `INVALID_INPUT` inside the
   transaction.
5. Read the complete five-component scope vector without materializing a stream.
6. Load exact current Fact/Relation objects and Canonical State endpoints in the
   same snapshot; validate expected object revisions, Raw/Event provenance,
   endpoint existence, transitions, graph/reason invariants and active-edge
   uniqueness.
7. Insert all new Fact revisions, Relation revisions and the exact domain marker.
   Re-read the scope vector and require byte equality.
8. `COMMIT`; a deferred SQLite COMMIT failure rolls back all domain rows and the
   marker. No object revision is consumed.
9. Return only after re-reading and verifying marker/request/result/row/hash/vector
   binding. Exact retry returns byte-equivalent domain content.

Proposal order is Fact IDs first, then Relation IDs, only to make result ordering
deterministic. Authority semantics are evaluated against one final candidate
graph, so a same-batch Relation can justify a same-batch Fact status.

## 9. Read contract

Core exposes library-only methods for:

```text
commit one Fact/Relation authority batch
read current scoped Fact/Relation projection
read exact Fact object revision
read exact Relation object revision
read exact domain commit
```

Current projection begins one SQLite read transaction and binds live vector,
current object rows and their domain markers. Exact object and commit reads also
use one snapshot and reject a historical observed vector greater than any live
vector component. Row hash, domain request, object revision transition and result
must all agree; coordinated replacement is `CORRUPT_DATA`.

Absent scope returns an explicit empty current projection plus zero vector and
does not materialize any row. Missing exact identity/revision is `NOT_FOUND`.

## 10. Error and boundary contract

Stable domain errors are:

```text
INVALID_INPUT
NOT_FOUND
CONFLICT
STORAGE_FAILURE
CORRUPT_DATA
CLOSED
```

Core maps `CORRUPT_DATA`/`CLOSED` to its existing stable storage failure class;
the MCP command port is unchanged. Package root may export policy constants,
plain public types and the domain error. It must not export the Store, migration,
database, internal apply capability, transaction handle or generic writer.

Core owns the Store through a JavaScript private field and closes it before the
frozen dependencies. Reflection cannot recover the Store or mutation surface.

## 11. Deferred boundaries

WO-04B does not implement:

- automatic extraction, detector, linker or model calls;
- Frontier or takeover revision movement;
- combined State/Fact/Relation Takeover or Enrichment commit;
- Compaction Artifact, Snapshot, Promotion or authority retrieval;
- cross-namespace Relation endpoints;
- Host routing, feature flags, MCP tools, background jobs or delivery;
- any legacy State/Relation migration or backfill.

Those remain explicit inputs to WO-04C, WO-05 or later work orders.
