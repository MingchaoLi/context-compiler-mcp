# WO-DA-01 Fresh Independent QA — Projection / Snapshot + Rolling Summary Record

Status: **FAIL / RETURN TO IMPLEMENTATION**

Reviewed candidate: `871e5267a0afd3385b9812af98f7648f0a89c5b7`<br>
Direct parent / planning authority: `49c180d865a0a7a1abef05a6aceaaf4c8a3fae7b`<br>
Planning baseline: `0a2d4437bc2b80714ae819654e5f41aab7a1a41e`<br>
Review date: 2026-08-25

## Verdict

The bounded design direction is internally sound and matches the accepted WO-05 authority, but the
candidate cannot be accepted as the repository's final adjustment record because its current work order
retains a contradictory present-tense repository fact.

The candidate has already:

- reconciled DA-12 as promoted only for the accepted WO-05 Current Authority Projection /
  ContextSnapshot scope; and
- added DA-15 as a recorded, not-implemented, not-promoted Rolling Summary experiment.

However, `docs/work-orders/WO-DA-01-projection-summary-adjustment-record.md` section 2 still states:

> downstream adjustment register 当前停在 DA-14；DA-12 仍写 `NOT YET PROMOTED`

That statement is false at the reviewed candidate and directly conflicts with the candidate's register,
architecture record, project state and roadmap. Repository files are the source of truth, and this work
order's sole deliverable is a coherent docs-only authority reconciliation. The stale statement must be
qualified as a planning-baseline fact or updated to the post-candidate repository state in an append-only
Builder fix. Independent QA must then review the new fixed candidate.

QA did not modify any Builder-owned file.

## Repository and candidate facts

Facts observed before this QA report was created:

- branch: `main`;
- candidate `HEAD`: `871e5267a0afd3385b9812af98f7648f0a89c5b7`;
- direct parent: `49c180d865a0a7a1abef05a6aceaaf4c8a3fae7b`;
- planning authority parent: `0a2d4437bc2b80714ae819654e5f41aab7a1a41e`;
- initial worktree: clean;
- planning baseline, accepted WO-05 fixed candidate
  `fa7677101c145ffdbfca8bff0864ed992fa9a9b9`, and fresh WO-05 QA
  `c3f691bb4a6b8f65822ba2b3410d05d93c5cbd9e` are candidate ancestors;
- `git diff --check 49c180d..871e526` passed.

Relative to the direct parent, the candidate changes exactly the six authorized docs paths:

```text
docs/PROJECT_STATE.md
docs/ROADMAP.md
docs/architecture/WO-DA-01-projection-summary-adjustment-record.md
docs/handoffs/WO-DA-01-projection-summary-adjustment-record.md
docs/inventory/WO-04C/downstream-adjustment-register.md
docs/work-orders/WO-DA-01-projection-summary-adjustment-record.md
```

There is no source, schema, test, config, package, evaluation or official-artifact delta.

## Independently recomputed fingerprints

Candidate docs:

```text
f7a430b4f80696d2c59c56a8c3985873d257913f75fcd4aeebd49e6783fe9904  docs/architecture/WO-DA-01-projection-summary-adjustment-record.md
7d70841ed33246d79d39e45d6665e9d7576ccf4ed1ecd3170d5a31a6f7d1f7e3  docs/inventory/WO-04C/downstream-adjustment-register.md
0172f34a725fa6428fd5cef28104ee965c2de5873565e74607bd53ec441381a2  docs/work-orders/WO-DA-01-projection-summary-adjustment-record.md
f10ca812e07565f52e6c2d3bbc3a34c17f4a57b95e516cf7540196f9331c3336  docs/handoffs/WO-DA-01-projection-summary-adjustment-record.md
1c28c95291e3f5185175bdcdc6b4762a86829df99eb9b3c8fe8ae734d74c6ada  docs/PROJECT_STATE.md
21c8f7862d86cb3beae27702c613fbbdcb5fd96b8aa2ccf6f8f099029bf7c7e5  docs/ROADMAP.md
```

Frozen runtime/config files:

```text
fb4b8c9dbd8ec9f5b25f04b37b9e1e4393247fe11a37cad11043cfb48fd464ef  src/context-snapshot.ts
09cb38cd30b2d4dee2684f4c3fefbe5fb2e01bcf8a0faf7204efbea93fd0e663  src/canonical-state.ts
bdd63602eff78bad678714bfc1bb572dcff47f3d71973d753a980ea4f9c55db6  src/canonical-fact-relation.ts
d63b63a62b62d469dbef4ec85815fa2c4c81cd6c394288debe2846428b1ceee1  src/semantic-takeover.ts
ef2c9f996d6d43b9b1f76d3c34e765eb77d96f31720ca1a9ba9e8baf332dcb9f  package.json
519fdcf4b874886466032343c25c5e5973679ef5e0ffc3dec5bf32cba3447d88  package-lock.json
189da4e3b0f7c2b3771fb5aee021b68df401630d369ed0425812fbcac4702559  tsconfig.json
```

The Builder-listed fingerprints match. The handoff fingerprint was independently added above because a
handoff cannot self-list its final content hash without creating a recursive value.

## Contract review

### Facts that passed review

- DA-12 promotion is limited to accepted WO-05 Layer 2 Current Authority Projection and Layer 3
  ContextSnapshot behavior. State v2, persistent placement, Retrieval/Evidence, Summary, Host integration,
  semantic ranking/dedup and adaptive budget remain unpromoted.
- The three-layer model preserves complete Canonical State v1 separately from deterministic projection
  and Snapshot placement/dependency/budget decisions.
- Unknown or illegal State kind/status/policy and unknown projection policy are expressly fail-closed;
  an open-ended `else exclude` is prohibited.
- Dependency selection starts from the Fact/Relation-owner immutable complete-projection receipt and uses
  exact current active `DEPENDS_ON` authority with deterministic transitive closure. It is neither a
  free-text `required_context` hint nor a silently assumed one-hop rule.
- The record preserves exact Manifest refs/revisions/policies/config/hashes, closed inclusion/placement
  reasons, AttemptStarted binding, as-of concurrency boundary and mandatory-overflow no-Snapshot failure.
- Core is correctly limited to Working Context plus opaque Host/external digests and does not claim to
  prove final provider request bytes, provider-private state, transport mutation or delivery.
- DA-15 is explicit that Rolling Summary is immutable, non-authoritative, Raw-anchored, derived,
  not implemented and not promoted.
- DA-15 rejects Summary-only Authority provenance, recursive-only lineage, in-place mutation,
  State/Fact/Relation/Frontier/Takeover mutation and confusion with Compaction Artifact.
- A future Snapshot must bind exact Summary instance/content hash, Raw coverage/refs, generator identity
  and policy/config identity. Expanded coverage creates a new instance from complete Raw coverage.
- Experiment order is A0 canonical baseline, then A1 additive Summary screen, and only after bounded
  benefit a same-fixed-budget R0/R1 replacement ablation. Generation, storage, Snapshot integration and
  GC/retention remain separate future Gates.
- Scope/Task Binding is expressly left unadjudicated; this work order does not claim DA-16 or Host scope
  inference.

### Judgment

The design substance satisfies the user's accepted direction and does not expand WO-05, WO-06/07,
Host/provider/model/network/MCP, frozen v0 or runtime code. The single stale work-order fact is nevertheless
blocking because accepting it would leave the final repository authority internally contradictory about the
very DA-12/DA-15 reconciliation this docs-only work order exists to perform.

## Mechanical checks

```text
branch / HEAD / parent / clean / ancestry
PASS

exact candidate path audit
PASS — six authorized docs paths only

git diff --check 49c180d..871e526
PASS

source/schema/test/config/package/evaluation/official-artifact delta
NONE

required/prohibited phrase audit
PASS, except for the stale work-order repository fact described in the verdict
```

No `npm test` or `npm run build` was run because the candidate is docs-only and changes no runtime,
test, schema, package or configuration file.

## Limits

- This QA accepts no Rolling Summary implementation, product benefit, generator, store, Snapshot slot or
  retention policy; none exists in the candidate.
- DA-12 projection product benefit and DA-15 Summary benefit remain unmeasured. The record correctly
  preserves those as future evidence questions.
- Host/provider final-request behavior and Scope/Task Binding remain Unknown and out of scope.
- This report is an Independent QA return, not an adversarial architecture review and not runtime
  acceptance.

## Required bounded fix

Update only the stale section-2 work-order statement so it is unambiguously either:

1. a fact about planning baseline `0a2d4437...` / planning authority parent state; or
2. the true post-candidate state: DA-12 reconciled in the accepted WO-05 scope and DA-15 recorded as
   not implemented / not promoted.

Preserve the six-path Builder surface and all other accepted boundaries. Then create an append-only fixed
candidate and request a fresh physically separated Independent QA.
