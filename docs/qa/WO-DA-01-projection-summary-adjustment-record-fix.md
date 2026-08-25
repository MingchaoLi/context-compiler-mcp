# WO-DA-01 Fresh Independent Re-QA — Planning-baseline Tense Fix

Status: **ACCEPTED / PASS**

Reviewed fixed candidate: `d66df12626251cee0fd960e8b7fe96e568fb08c2`  
Direct parent: `d2e7053e3fcfe2592f18ad6fa996dde5bb42b27e`  
First QA return: `f219c4f71347e34e4f776341ea4518b5d8bc7b0e`  
Returned Builder candidate: `871e5267a0afd3385b9812af98f7648f0a89c5b7`  
Planning authority: `49c180d865a0a7a1abef05a6aceaaf4c8a3fae7b`  
Planning baseline: `0a2d4437bc2b80714ae819654e5f41aab7a1a41e`  
Review date: 2026-08-25

## Verdict

The append-only fix is accepted. The returned work order no longer describes the pre-work register as
current repository state. It now explicitly limits the DA-14 endpoint and DA-12 `NOT YET PROMOTED`
statement to planning baseline `0a2d4437...` and identifies that statement as the historical input that
the Builder candidate reconciled.

Independent Git-object inspection confirms that this historical statement is exact: at the planning
baseline the register ended at DA-14, had no DA-15, and marked DA-12 `NOT YET PROMOTED`. At the fixed
candidate the register instead marks DA-12 as promoted only for the accepted WO-05 Current Authority
Projection / ContextSnapshot scope and records DA-15 as not implemented and not promoted.

The fix also accurately records the returned Builder candidate, first QA-return commit and format-only
parent. It does not change or broaden the DA-12, DA-15, accepted WO-05, Contract, Umbrella, runtime or
future-work boundaries that passed the first Independent QA.

This acceptance is docs-only. It does not accept a Rolling Summary implementation or authorize State
v2, persistent placement, Retrieval, WO-06/07, Host/provider/model/network/MCP work or any sibling
repository change.

## Repository and ancestry pin

Facts observed before this report was created:

- branch: `main`;
- initial `HEAD`: `d66df12626251cee0fd960e8b7fe96e568fb08c2`;
- direct parent: `d2e7053e3fcfe2592f18ad6fa996dde5bb42b27e`;
- initial worktree: clean;
- planning baseline, planning authority, returned Builder candidate, first QA return and direct parent
  are all ancestors of the fixed candidate;
- the first QA return commit adds only
  `docs/qa/WO-DA-01-projection-summary-adjustment-record.md`;
- the format-only parent modifies only that first QA report;
- the fixed candidate commit adds the fix handoff and modifies the work order only.

## Exact surfaces and fingerprints

Relative to direct parent `d2e7053`, the fixed candidate changes exactly:

```text
docs/handoffs/WO-DA-01-projection-summary-adjustment-record-fix.md
docs/work-orders/WO-DA-01-projection-summary-adjustment-record.md
```

Relative to planning authority `49c180d`, the complete append-only chain retains the original six
Builder paths, adds the first QA report and the fix handoff, and modifies no other path:

```text
docs/PROJECT_STATE.md
docs/ROADMAP.md
docs/architecture/WO-DA-01-projection-summary-adjustment-record.md
docs/handoffs/WO-DA-01-projection-summary-adjustment-record-fix.md
docs/handoffs/WO-DA-01-projection-summary-adjustment-record.md
docs/inventory/WO-04C/downstream-adjustment-register.md
docs/qa/WO-DA-01-projection-summary-adjustment-record.md
docs/work-orders/WO-DA-01-projection-summary-adjustment-record.md
```

The five original non-work-order Builder records are byte-identical to returned candidate `871e526`.
The independently recomputed fixed work-order fingerprint matches the fix handoff:

```text
ce5516dab16790735b73c17f08e28e7ac1aba197e6f2bb205cff92203409a482  docs/work-orders/WO-DA-01-projection-summary-adjustment-record.md
```

Other current record fingerprints independently observed:

```text
f7a430b4f80696d2c59c56a8c3985873d257913f75fcd4aeebd49e6783fe9904  docs/architecture/WO-DA-01-projection-summary-adjustment-record.md
7d70841ed33246d79d39e45d6665e9d7576ccf4ed1ecd3170d5a31a6f7d1f7e3  docs/inventory/WO-04C/downstream-adjustment-register.md
f10ca812e07565f52e6c2d3bbc3a34c17f4a57b95e516cf7540196f9331c3336  docs/handoffs/WO-DA-01-projection-summary-adjustment-record.md
00947fe2b2d99ce8506348fc1280629d38bcd44e65c49a5aef7e1bec5b19f517  docs/handoffs/WO-DA-01-projection-summary-adjustment-record-fix.md
1c28c95291e3f5185175bdcdc6b4762a86829df99eb9b3c8fe8ae734d74c6ada  docs/PROJECT_STATE.md
21c8f7862d86cb3beae27702c613fbbdcb5fd96b8aa2ccf6f8f099029bf7c7e5  docs/ROADMAP.md
```

Frozen runtime/config fingerprints remain:

```text
fb4b8c9dbd8ec9f5b25f04b37b9e1e4393247fe11a37cad11043cfb48fd464ef  src/context-snapshot.ts
09cb38cd30b2d4dee2684f4c3fefbe5fb2e01bcf8a0faf7204efbea93fd0e663  src/canonical-state.ts
bdd63602eff78bad678714bfc1bb572dcff47f3d71973d753a980ea4f9c55db6  src/canonical-fact-relation.ts
d63b63a62b62d469dbef4ec85815fa2c4c81cd6c394288debe2846428b1ceee1  src/semantic-takeover.ts
ef2c9f996d6d43b9b1f76d3c34e765eb77d96f31720ca1a9ba9e8baf332dcb9f  package.json
519fdcf4b874886466032343c25c5e5973679ef5e0ffc3dec5bf32cba3447d88  package-lock.json
189da4e3b0f7c2b3771fb5aee021b68df401630d369ed0425812fbcac4702559  tsconfig.json
```

There is no source, schema, test, config, package, evaluation or official-artifact delta relative to
the planning authority or the direct fix parent.

## Preserved contract review

The first QA's substantive PASS findings remain unchanged:

- the three layers remain complete Canonical State v1, pure deterministic Current Authority
  Projection, then ContextSnapshot placement / exact dependency closure / budget;
- unknown or illegal kind/status/policy and unknown projection policy fail closed; an open-ended
  `else exclude` is prohibited;
- dependency traversal uses the same frozen world's exact active `DEPENDS_ON` Authority graph and
  deterministic transitive closure from the owner-side historical receipt, not free-text
  `required_context` or a silently assumed one-hop rule;
- the Manifest preserves exact refs/revisions/policies/config/hashes, closed inclusion/placement
  reasons, AttemptStarted binding, the as-of concurrency boundary and mandatory-overflow no-Snapshot
  failure;
- Core freezes Working Context and opaque Host/external digests, not final provider request bytes,
  provider-private state, transport mutation or delivery;
- DA-12 promotion remains limited to accepted WO-05 Layer 2 / Layer 3 behavior. State v2, persistent
  HOT/COLD, Retrieval/Evidence, Summary, Host integration, semantic ranking/dedup and adaptive budget
  remain unpromoted;
- DA-15 remains an immutable, non-authoritative, Raw-anchored derived projection candidate that is not
  implemented or promoted;
- Summary-only Authority provenance, recursive-only lineage, in-place update,
  State/Fact/Relation/Frontier/Takeover mutation and confusion with Compaction Artifact remain
  prohibited;
- any future Snapshot Summary use must bind an exact immutable instance/content hash, exact Raw
  coverage/refs, generator identity and policy/config identity; expanded coverage regenerates a new
  instance from complete Raw coverage;
- the experiment order remains A0 canonical Current Input + Frontier-bound Hot Raw + Current Authority,
  then A1 additive Summary, and only after bounded benefit a same-fixed-budget R0/R1 replacement
  ablation. Generation, storage, Snapshot integration and GC/retention remain separate future Gates.

Architecture Contract v3.1.1 sections 4.6-4.9 continue to define Frontier-rebuilt non-recent-N Hot Raw,
Compaction Artifact identity and immutable ContextSnapshot minimum fields. Umbrella WO-05 and its
dependency graph continue to place deterministic projection/Snapshot before WO-06 and WO-07. The
adjustment record does not rewrite either authority source.

## Mechanical checks

```text
branch / HEAD / parent / clean / ancestry
PASS

fixed candidate path audit relative to d2e7053
PASS — two authorized docs paths only

complete append-only chain path audit relative to 49c180d
PASS — original six Builder docs + first QA report + fix handoff only

git diff --check d2e7053..d66df126
PASS

git diff --check 49c180d..d66df126
PASS

planning-baseline Git-object audit
PASS — DA-12 NOT YET PROMOTED; DA-15 absent; register ended at DA-14

source/schema/test/config/package/evaluation/official-artifact delta
NONE
```

No `npm test` or `npm run build` was run because the fixed candidate and complete WO-DA-01 chain are
docs-only and introduce no source, schema, test, package or configuration delta.

## Limits

- This QA accepts the internal consistency and boundedness of the final adjustment record, not product
  benefit for Current Authority Projection or Rolling Summary.
- No Summary producer, schema, writer, store, Snapshot runtime slot, retention policy or model run exists.
- Scope/Task Binding remains unadjudicated; Host/provider final-request facts remain Unknown.
- This is Independent QA for the append-only fix, not an adversarial architecture review or runtime
  acceptance.
