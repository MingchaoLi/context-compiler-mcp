# WO-DA-01 Architecture Adjustment Record

Status: **BUILDER RECORD / AWAITING INDEPENDENT QA**

Planning baseline: `0a2d4437bc2b80714ae819654e5f41aab7a1a41e`

Planning authority commit: `49c180d865a0a7a1abef05a6aceaaf4c8a3fae7b`

Accepted runtime authority:

- WO-05 fixed candidate `fa7677101c145ffdbfca8bff0864ed992fa9a9b9`;
- WO-05 fresh Independent re-QA `c3f691bb4a6b8f65822ba2b3410d05d93c5cbd9e`.

This record reconciles one already accepted runtime decision and records one future experiment. It does
not define a new runtime schema, writer, policy hash, public method, MCP tool or Host/provider behavior.

## 1. Authority levels

The repository now distinguishes three authority levels for this record:

```text
accepted runtime fact
  WO-05 Current Authority Projection / ContextSnapshot v2 behavior

accepted downstream direction
  the restrictions and experimental order recorded here

future unpromoted capability
  Rolling Summary production/storage/Snapshot integration
```

An accepted downstream direction is not executable behavior. Only a separately bounded implementation
work order plus Independent QA may promote the future capability.

## 2. Current Authority and ContextSnapshot reconciliation

### 2.1 Three layers remain separate

```text
Layer 1 — Complete Canonical State Authority v1
  exact immutable revision containing current and historical/terminal items

Layer 2 — Current Authority Projection
  pure deterministic view at one exact State revision and policy

Layer 3 — ContextSnapshot
  placement + exact dependency closure + budget + immutable Attempt binding
```

Projection absence is view-local. It never deletes Authority, changes lifecycle, rewrites provenance or
proves that a historical item never existed.

### 2.2 Closed policy and unknown handling

The accepted projection selects only the closed current combinations:

```text
GOAL/ACTIVE
CONSTRAINT/ACTIVE
DECISION/ACTIVE
OPEN_QUESTION/OPEN
```

Known terminal/deferred/rejected combinations remain in complete Canonical State and are default-
excluded from the current view unless an exact required ref includes them for one Snapshot.

Unknown kind, unknown status, illegal kind/status combination, unknown State policy or unknown
projection policy must fail closed. A projection implementation must not express the contract as an
open-ended `else exclude`. The accepted WO-05 path is valid because Canonical State owner parsing first
proves the closed v1 grammar/policy and Snapshot binds the exact State/projection policy. A future State
kind/status/policy may not inherit exclusion behavior: it requires an explicit projection policy version,
fixtures, migration/replay decision and Independent QA before use.

### 2.3 Dependency means exact authority closure

Dependency inclusion is derived from the complete historical Fact/Relation owner receipt captured in
the frozen Snapshot transaction:

```text
exact selected roots
  -> exact current active DEPENDS_ON Relation authority graph
  -> deterministic transitive State/Fact closure and exact paths
```

It is not a free-text `required_context` hint, a model explanation or a silently frozen one-hop rule.
Explicit required refs are an additional closed inclusion obligation; they do not replace closure and do
not change the included object's Authority.

### 2.4 Snapshot remains an execution-input freeze

The accepted Manifest/Attempt contract continues to bind:

- explicit namespace/stream, Snapshot/Operation/Attempt identities;
- exact Ledger/State/Frontier/Takeover revisions and as-of boundary;
- owner-side complete Fact/Relation projection receipt identity/hash;
- exact selected/excluded Authority, Raw, Fact, Relation and dependency-path refs;
- closed inclusion/placement reasons;
- projection, assembler, policy and config identities/hashes;
- Current Input, Working Context and external content hashes;
- immutable AttemptStarted binding;
- deterministic whole-object assembly and mandatory-overflow no-Snapshot failure.

Open relevance scores, learned ranking weights and free-form model importance explanations are not
Manifest authority.

The Core freezes Working Context plus an opaque Host manifest digest and stable external content
hashes. It does not, by itself, prove the final provider request bytes, provider-private system state,
transport-time mutation, credentials, delivery result or Host orchestration decisions. Those facts remain
Host/provider-owned and Unknown here.

### 2.5 Exact promotion scope

DA-12 is reconciled as promoted only for accepted WO-05 Layer 2/Layer 3 behavior. This does not promote:

- Canonical State v2/event log/materialized current view;
- persistent HOT/COLD or Dormant lifecycle;
- Retrieval/Evidence/Ripple;
- Rolling Summary;
- Host/provider integration;
- semantic ranker/dedup or adaptive budget policy.

## 3. Rolling Summary candidate

### 3.1 Candidate authority

Rolling Summary is recorded only as:

```text
immutable + non-authoritative + Raw-anchored derived projection
```

No Summary instance, schema, producer, store, GC policy or runtime Snapshot slot exists or is authorized
by this record.

### 3.2 Trust and mutation boundaries

A future Summary must never be:

- the only Authority provenance for State/Fact/Relation;
- the only source used to produce another Summary across expanded coverage;
- updated in place;
- allowed to mutate State, Fact, Relation, Frontier, Takeover or Raw;
- treated as Compaction Artifact coverage/provenance proof;
- promoted by appearing in one Working Context.

The trust root remains exact canonical Raw Events and accepted Authority owner records.

### 3.3 Immutable identity and regeneration

If a future Snapshot includes Summary, the Summary binding must include at least:

```text
summary_instance_id
exact scope
exact Raw coverage and/or lexical exact Raw refs
generator identity/version
policy/config identity
content hash
created_at
```

The Snapshot must bind the exact immutable instance and content hash. Missing Raw anchors, hash/policy
substitution, mutable content or recursive-only lineage fail closed.

When coverage expands, generation reads the complete Raw coverage and creates a new immutable Summary
instance. It may use an old Summary only as non-authoritative optimization input if the full Raw coverage
is still independently read and bound; it cannot chain `old summary + new segment` as the sole source.

### 3.4 Assembly placement

Summary is optional, non-authoritative context. It cannot evict or outrank:

- Current Input;
- Current Authority and Hard Constraints;
- explicit required Authority/Raw/Evidence;
- exact dependency closure;
- Frontier-bound Hot Raw obligations defined by the active Snapshot policy.

No persistent placement writer or automatic Summary inclusion is approved.

## 4. Experiment order

The first comparison uses the same frozen canonical world:

```text
A0 baseline
  Current Input
  + Frontier-bound Hot Raw
  + Current Authority

A1 additive screen
  A0
  + one exact immutable Raw-anchored Summary instance
```

The A0 baseline is not frozen-v0 recent-N and does not silently add Retrieval or old Summary content.

The additive screen measures at minimum:

```text
constraint / decision / open-question continuity
historical detail distortion and false claims
exact Raw recovery ability
context tokens and latency
Summary generation tokens / latency / model calls
cumulative distortion under expanding coverage
additional schema/policy/fixture complexity
```

Only if A1 demonstrates a pre-registered bounded benefit without correctness regression may a later work
order compare fixed-budget replacement:

```text
R0 = fixed token budget without Summary replacement
R1 = same fixed token budget with an explicit versioned Summary replacement policy
```

Generation, storage, Snapshot schema/policy integration and GC/retention are separate later decisions.
They are not bundled into the additive screen and are not authorized until the evidence Gate passes.

## 5. Non-goals and unresolved work

This record does not resolve Scope/Task Binding, create DA-16, implement WO-06/07, select a provider,
run a model, modify frozen v0, or change accepted runtime code. Scope/Task Binding remains a separate
unadjudicated downstream item.
