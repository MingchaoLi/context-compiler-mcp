# WO-05 Architecture — ContextSnapshot Contract

Status: PRE-SOURCE SNAPSHOT COMPOSITION GATE FROZEN

## 1. Decision

WO-05 使用一个新的 Core-private `context-snapshot` owner。它拥有自己的 additive schema、
`BEGIN IMMEDIATE` transaction、immutable Snapshot/Attempt rows、exact read/replay 与错误映射；
它不拥有 Ledger、State、Fact、Relation、Takeover 或 revision stream。

```text
SqliteContextSnapshotStore
  BEGIN IMMEDIATE on one SQLite handle
    read exact live five-axis vector
    read/prove Raw through Ledger owner seam
    read/prove State through State owner seam
    read/prove current Fact/Relation through Fact/Relation owner seam
    read/prove current Takeover/Artifact through accepted semantic seam
    deterministic project + assemble
    insert immutable ContextSnapshot
    insert immutable AttemptStarted receipt
  COMMIT
```

The accepted WO-03A substrate is sufficient. Snapshot is axis-neutral and does not require a sixth
revision axis or generic transaction capability. If implementation needs manual stream-vector writes,
nested transactions, cross-connection choreography or a second domain writer, this decision is invalid
and source work must stop.

## 2. Ownership and code shape

`src/context-snapshot.ts` owns:

- Snapshot/Attempt request normalization and stable errors;
- v1 schema/migration/validation/immutability triggers;
- transaction lifecycle and exact retry/collision handling;
- Current Authority projection, dependency closure and Hot Raw selection;
- priority-bucket whole-object assembly and rendering;
- Manifest/body canonicalization, hashing, persistence and exact reads.

Accepted domain modules retain read/write unity for their own data. WO-05 may add only these
behavior-preserving Core-private, caller-handle read seams:

```text
ledger-hot-raw
  read exact event(s) and as-of Hot Raw on caller-owned transaction

canonical-state
  read exact latest State projection, including revision zero, on caller-owned transaction

canonical-fact-relation
  read/prove latest object projection on caller-owned transaction
```

Existing `readCurrentSemanticTakeoverInsideCore` already provides the required same-handle semantic
read. None of these seams opens/commits/rolls back a transaction, mutates an axis or appears at package
root. The existing `assembler.ts` and `operational-context.ts` remain frozen compatibility paths; WO-05
does not modify or call them.

`ContextCompilerCore` may expose library-only:

```text
freezeContextSnapshot(input)
readContextSnapshot(scope, snapshot_id)
readContextAttemptStarted(scope, attempt_id)
```

These are not MCP commands. MCP remains exact-nine.

## 3. Frozen request grammar

`ContextSnapshotFreezeInput v1` is an exact-key plain-data object:

```text
schema_version: 1
scope: { namespace, stream_id }
snapshot_id
operation_id
attempt_id
expected_revision_vector: complete same-scope five-axis vector
current_input_event_id
required_state_item_ids: lexical-unique array
required_raw_event_ids: lexical-unique array
required_fact_refs: [{ fact_id, fact_revision }]
required_relation_refs: [{ relation_id, relation_revision }]
host_manifest_digest: lowercase sha256
external_content_hashes: [{ stable_ref, content_hash }]
hard_token_capacity: integer 1..1_000_000
policy_hash: exact CONTEXT_SNAPSHOT_POLICY_HASH
```

All identifiers are NFC, nonblank, control-character-free and at most 500 characters. External stable
refs are at most 2,000 characters. Closed array bounds are:

```text
required_state_item_ids <= 1,000
required_raw_event_ids <= 1,000
required_fact_refs <= 1,000
required_relation_refs <= 2,000
external_content_hashes <= 100
```

Arrays are normalized into stable lexical order before request fingerprinting. Duplicate refs,
cross-scope vector, unknown/additional keys, sparse/custom arrays, non-plain objects, invalid Unicode,
invalid hashes and out-of-range values are invalid input. Core never infers project/task/session scope.

`current_input_event_id` must resolve to one same-scope committed `user_input` Raw Event satisfying:

```text
frontier_position < event.ledger_revision <= ledger_as_of_revision
```

It is rendered once as P0 Current Input even though its ref remains part of selected Hot Raw identity.

## 4. Frozen policy identity

```text
CONTEXT_SNAPSHOT_SCHEMA_VERSION = 1
CONTEXT_SNAPSHOT_POLICY_VERSION = context-snapshot/v1
CURRENT_AUTHORITY_PROJECTION_VERSION = current-authority-hot-raw/v1
CONTEXT_ASSEMBLER_VERSION = priority-bucket-whole-object/v1
TOKEN_ESTIMATOR_VERSION = character-count-divided-by-four/v1
CONTEXT_ASSEMBLER_VERSION_HASH = e66825b13a057ae9648a83068e330c8025729fd77723bdd199d7cc4bd9ef888a
CONTEXT_SNAPSHOT_POLICY_HASH = 038a11d2f29dd9b112f69657e89f069c188b521911509f07c189af128b860c05
```

The exact canonical policy bytes are:

```json
{"assembler_version":"priority-bucket-whole-object/v1","assembly":{"buckets":["P0_CURRENT_INPUT_CONSTRAINT_REQUIRED_CLOSURE","P1_ALL_CURRENT_STATE_HOT_RAW_SUFFIX","P2_CURRENT_COMPACTION_ARTIFACT_IF_FITS","P3_EMPTY"],"estimator":"character-count-divided-by-four/v1","mandatory_overflow":"BUDGET_INSUFFICIENT_NO_SNAPSHOT","trim":"lowest-bucket-first-whole-object-no-partial"},"attempt":"same-transaction-immutable-start-receipt","body":"persisted-immutable-utf8-text","bounds":{"external_content_refs":100,"hard_token_capacity":1000000,"identifier":500,"required_fact_refs":1000,"required_raw_refs":1000,"required_relation_refs":2000,"required_state_ids":1000,"stable_ref":2000},"current_authority":{"default_excluded":["CONSTRAINT/SUPERSEDED","DECISION/SUPERSEDED","GOAL/COMPLETED","GOAL/SUPERSEDED","OPEN_QUESTION/DEFERRED","OPEN_QUESTION/RESOLVED","REJECTED_ALTERNATIVE/REJECTED"],"default_selected":["CONSTRAINT/ACTIVE","DECISION/ACTIVE","GOAL/ACTIVE","OPEN_QUESTION/OPEN"],"placement":"all-current-included-no-persistent-hot-cold"},"dedup":"exact-authority-identity-no-display-dedup","dependencies":{"closure":"deterministic-transitive-state-fact","relation":"active-DEPENDS_ON-current-object-graph"},"evidence":"empty-wo05-reserved-contract-fields","external_content":"stable-ref-plus-sha256","host":"opaque-digest-only","hot_raw":{"current_input":"exact-user-input-event-single-render","eligibility":"frontier-position-exclusive-to-ledger-as-of-inclusive","projection":"identity-full-event-canonical-json","selection":"latest-contiguous-whole-event-suffix-after-required"},"inclusion_reasons":["CURRENT_AUTHORITY","CURRENT_INPUT","CURRENT_TAKEOVER_ARTIFACT","DEPENDENCY_CLOSURE","EXPLICIT_REQUIRED","HARD_CONSTRAINT","HOT_RAW_SUFFIX"],"input_world":"begin-immediate-exact-five-axis-cas","normalization":"nfc-no-unicode-cc-lexical-unique-sorted-inputs","policy_version":"context-snapshot/v1","projection_version":"current-authority-hot-raw/v1","retry":"exact-request-replay-id-substitution-conflict","schema_version":1,"scope":"explicit-only-no-host-inference","unknown":"fail-closed"}
```

The assembler hash is SHA-256 over UTF-8 bytes of the exact assembler version string. The policy hash
is SHA-256 over the exact canonical JSON above. `config_hash` is SHA-256 over canonical JSON of:

```json
{"hard_token_capacity":<normalized integer>,"token_estimator":"character-count-divided-by-four/v1"}
```

No provider/model-dependent branch or raw soft target is enabled in v1.

## 5. Current Authority and dependency projection

At the exact frozen State revision, default selected items are:

```text
CONSTRAINT/ACTIVE
DECISION/ACTIVE
GOAL/ACTIVE
OPEN_QUESTION/OPEN
```

Default excluded items are the seven terminal/deferred/rejected pairs listed in the policy descriptor.
An exact `required_state_item_id` may include a default-excluded item for this Snapshot only. It does
not alter Canonical State, lifecycle or later Snapshots.

All default-selected current State is included. There is no persistent HOT/COLD, semantic relevance
competition or budget-driven hidden deletion of current Authority. If Current Input + current State +
explicit required closure already exceeds the hard capacity, freeze returns `BUDGET_INSUFFICIENT` and
writes no Snapshot/Attempt.

Dependency closure uses only current, active `DEPENDS_ON` Canonical Relations and exact current
State/Fact object versions. Direction is `source depends on target`; traversal starts from every selected
State item and explicit required State/Fact ref. Root and adjacency order are lexical; cycles terminate by
exact endpoint identity; first lexical path wins. A dependency may include a terminal State item or
non-active Fact as labelled context, but does not promote its Authority/status. Exact required Relation
refs and their endpoints are included without semantic inference.

There is no semantic merge or display dedup in v1. Same text with different exact IDs remains distinct.

## 6. Hot Raw and assembly

Eligible Hot Raw is rebuilt in the same transaction from:

```text
frontier_position < ledger_revision <= ledger_as_of_revision
```

Raw projection is identity-preserving canonical event JSON. It retains exact `(ledger_revision,
event_id)` refs and complete Event boundaries. It performs no semantic pruning, folding, topic
selection, turn-count window or payload rewriting.

Assembly is deterministic:

1. build P0 Current Input, all active Constraints, explicit required Raw/State/Fact/Relation refs and
   dependency closure;
2. add all remaining current Goal/Decision/OpenQuestion roots;
3. if mandatory rendered cost exceeds capacity, fail with no write;
4. consider non-required eligible Hot Raw newest-to-oldest; stop at the first whole Event that would not
   fit, then render the selected contiguous suffix in ascending Ledger order;
5. if remaining capacity fits the exact current Takeover Artifact body, include it as P2; otherwise omit;
6. P3 is empty in WO-05.

Explicit required historical Raw is rendered in its own P0 section and may precede Frontier. The same
Event is rendered only once at its highest inclusion obligation. The Current Input is also rendered only
once. Rendering order inside each typed section is exact ID or Ledger order, never source enumeration
order.

The token estimator is exactly:

```text
empty string -> 0
otherwise -> max(1, ceil(JavaScript string length / 4))
```

It is a deterministic provider-neutral budget unit, not a claim of exact model tokenization. Every
accepted Snapshot satisfies `estimated_tokens <= hard_token_capacity`.

## 7. Inclusion reasons

Manifest refs use only this closed vocabulary, sorted lexically per ref:

```text
CURRENT_AUTHORITY
CURRENT_INPUT
CURRENT_TAKEOVER_ARTIFACT
DEPENDENCY_CLOSURE
EXPLICIT_REQUIRED
HARD_CONSTRAINT
HOT_RAW_SUFFIX
```

Inclusion changes only one Snapshot projection. It never changes State/Fact/Relation Authority,
Frontier, placement or later Snapshot policy.

## 8. Manifest and persisted body

`ContextSnapshotManifest v1` contains at least:

```text
schema_version
snapshot_id / namespace / stream_id
operation_id / attempt_id
ledger_as_of_revision / state_revision
raw_frontier_revision / frontier_position / takeover_commit_revision
state_hash / state_policy_hash
selected_state_refs + excluded_state_refs + inclusion reasons
selected_fact_refs + selected_relation_refs + dependency_paths
hot_raw_event_refs / hot_raw_hash
required_raw_event_refs
current_takeover_ref? / current_artifact_ref?
evidence_bundle_id: null
evidence_event_refs: []
evidence_relation_paths: []
policy_hash / config_hash / projection_version / assembler_version_hash
current_input_event_id / current_input_hash
host_manifest_digest
external_content_hashes
working_context_hash / working_context_estimated_tokens / hard_token_capacity
created_at
```

State refs are exact within the frozen `state_revision`; Fact/Relation refs carry object revision and
object hash. Raw refs carry Ledger revision and Event ID. Artifact ref carries ID/hash. `hot_raw_hash`
hashes canonical ordered selected Hot Raw descriptors, including Current Input identity even though it is
rendered in the P0 section. `current_input_hash` hashes its canonical Raw Event descriptor.

Evidence fields are present but empty/null in WO-05. Host data is only a lowercase SHA-256 digest.
External content is only stable ref + lowercase SHA-256, sorted by stable ref. Core does not read a Host
path or interpret model/tool identity.

Working Context text is persisted as immutable UTF-8 text in v1. `working_context_hash` hashes its exact
UTF-8 bytes. Manifest canonical JSON excludes `manifest_hash`; the stored `manifest_hash` hashes the
exact canonical Manifest JSON. Snapshot ID, Attempt ID and `created_at` remain part of the Manifest.

## 9. AttemptStarted ownership

WO-05 owns only an immutable freeze receipt:

```text
AttemptStartedV1 {
  schema_version,
  namespace,
  stream_id,
  operation_id,
  attempt_id,
  snapshot_id,
  snapshot_manifest_hash,
  created_at
}
```

It is inserted in the same transaction after the Snapshot row and has an exact foreign-key/hash binding.
There is one Snapshot per Attempt and one Attempt receipt per Snapshot. WO-07 must consume this anchor;
it may append Operation/Action lifecycle records but cannot rewrite or duplicate this freeze receipt.

## 10. Transaction and replay order

Freeze order is fixed:

```text
normalize exact request and fingerprint
BEGIN IMMEDIATE
  inspect snapshot_id and attempt_id collisions
  exact compatible replay -> validate stored Snapshot/Attempt and return
  read live vector; require exact expected vector
  read/prove State, Fact/Relation, Raw, Takeover/Artifact on this handle
  project, close dependencies, assemble and enforce capacity
  re-read vector; require unchanged
  insert immutable Snapshot row
  insert immutable AttemptStarted row
COMMIT
exact persisted read
```

Replay inspection precedes live-vector equality, so an exact retry still returns the original Snapshot
after later commits. Same ID plus different normalized request is `CONFLICT`. Different Snapshot and
Attempt IDs may independently freeze the same authority world; Snapshot creation does not consume or
advance an axis.

Any missing ref, invalid current input, vector mismatch, dependency corruption, budget overflow,
constraint/hash/policy substitution, insertion/foreign-key/COMMIT failure or exact-read mismatch rolls
back both rows. There is no executable Attempt without its immutable Snapshot.

## 11. Exact read and fail-closed rules

Exact read uses one read transaction and validates:

- schema completion and exact immutable trigger definitions;
- stored request fingerprint and normalized request;
- Manifest canonical bytes/hash and Working Context bytes/hash/cost;
- Snapshot/Attempt two-way ID, operation and manifest-hash binding;
- exact Raw/State/Fact/Relation/Takeover/Artifact refs against owner proofs;
- frozen vector is component-wise at or before the current live vector;
- all closed policy/version/hash/config/inclusion-reason fields.

Unknown schema/policy/version, partial collision, row/trigger substitution, missing authority row, Raw or
body tamper, manifest ref/hash substitution, current vector regression, cross-scope reference, reopen or
replay mismatch is `CORRUPT_DATA` or `CONFLICT` according to whether stored authority or caller input is
invalid. No best-effort degraded Snapshot is returned.

## 12. Composition evidence

At source baseline `0dbff6a8a148f37fcabef7accf7f71d057e1a90f`:

- six accepted substrate/Raw/State/Fact/Relation/Takeover suites pass `66/66`;
- current owner seams already prove exact State and semantic authority on a caller-owned handle;
- Ledger and Fact/Relation class reads demonstrate the required same-snapshot validation and can be
  refactored into behavior-preserving owner seams;
- an isolated two-connection SQLite probe proved `BEGIN IMMEDIATE` blocks a late writer while the freeze
  reads, Snapshot + deferred-FK Attempt commit together, and rollback leaves neither partial row.

Therefore there is no substrate blocker. Source may begin only within the allowlist frozen by the WO and
schema map.
