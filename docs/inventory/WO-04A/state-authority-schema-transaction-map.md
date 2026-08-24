# WO-04A State Authority Schema / Transaction Map

Source baseline: `4e7758ac459c879944c624eb27ffefcfb24a2aec`

## Reused frozen primitives

| Primitive | Owner | 04A use | Mutation policy |
| --- | --- | --- | --- |
| Explicit namespace/stream and State axis | `src/revision-substrate.ts` | Scope, expected revision, `+1` | Read/use only; frozen bytes |
| Callback + immutable commit marker | `src/revision-substrate.ts` | Atomic domain row/axis/marker and exact replay | Read/use only; frozen bytes |
| Canonical Raw Event | `src/ledger-hot-raw.ts` | Same-scope committed provenance existence | Read table only; frozen bytes |
| Legacy State prepare/reducer/store | `src/state-update.ts`, `src/reducer.ts`, `src/state-store.ts` | Compatibility reference and regression oracle | No reuse as canonical identity/schema/writer |

## Additive schema owner

`src/canonical-state.ts` exclusively owns:

- `cc_canonical_state_schema`;
- `cc_canonical_state_revisions`;
- immutable row and completion-marker triggers.

The revision row is keyed by `(namespace, stream_id, state_revision)` and has a
same-scope unique `state_commit_id`. It has a composite foreign key to
`cc_revision_streams`. No trigger, backfill or view touches legacy State tables.

## Writer map

```text
ContextCompilerCore.commitCanonicalState
→ strict pre-transaction normalization/policy check
→ SqliteCanonicalStateStore.commit
→ frozen commitStateRevisionInsideCore
→ new-policy identity check + same-connection Raw provenance/high-water checks
→ previous State read + reduction + row insert
→ frozen vector CAS + marker + COMMIT
```

No other production writer owns the new tables. Root exports do not include the
Store/migration, and MCP does not route to the writer.

## Reader map

- latest: one `BEGIN` snapshot reads `cc_revision_streams.state_revision` and the
  matching immutable revision row;
- exact: one `BEGIN` snapshot reads live vector + scoped revision + marker;
- both reconstruct marker `request_json`/fingerprint from the State row, compare
  marker result, require non-State axes unchanged across the State transition,
  bound provenance Event revisions to marker Ledger high-water, and require the
  historical vector to be no later than the live vector;
- zero: returns canonical empty State without writing a stream row;
- no reader interprets `session_id`, legacy State revision, legacy relation, Raw
  sequence or Experience sequence as canonical identity.

## Crash and conflict map

| Failure point | Required durable result |
| --- | --- |
| normalization/policy/provenance shape | zero mutation |
| missing/cross-scope Raw Event | zero State row/axis/marker |
| reduction/transition/no-op failure | zero State row/axis/marker |
| State row insert | rollback row/axis/marker |
| revision-vector CAS/update | rollback row/axis/marker |
| marker insert | rollback row/axis/marker |
| actual SQLite COMMIT | rollback row/axis/marker |
| exact retry | original revision, no second row/advance |
| concurrent same-base commit | at most one success; loser conflicts |
| reopen | exact immutable bytes/hash/revision recoverable |
| coordinated row/result or marker request/vector substitution | corrupt/conflict; never accepted authority |

## Frozen-path proof target

Builder/QA compare source baseline to candidate and require no diff in:

- `src/revision-substrate.ts`, `test/revision-substrate.test.ts`;
- `src/ledger-hot-raw.ts`, `test/ledger-hot-raw.test.ts`;
- legacy State source/tests except the allowlisted Core boundary test;
- MCP service/server/tests, package/config, evaluation and official artifacts.
