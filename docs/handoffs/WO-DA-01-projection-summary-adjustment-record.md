# WO-DA-01 Builder Handoff — Projection / Snapshot + Rolling Summary Record

Status: **BUILDER RECORD COMPLETE / AWAITING INDEPENDENT QA**

Work order: `docs/work-orders/WO-DA-01-projection-summary-adjustment-record.md`

Planning baseline: `0a2d4437bc2b80714ae819654e5f41aab7a1a41e`

Planning authority / Builder parent: `49c180d865a0a7a1abef05a6aceaaf4c8a3fae7b`

Builder candidate: the commit containing this handoff; Independent QA must resolve and pin its exact
hash before review.

## Bounded result

This docs-only Builder result performs two repository-authority actions:

1. reconciles DA-12 as promoted only for the accepted WO-05 deterministic Current Authority
   Projection / ContextSnapshot contract; and
2. records DA-15 Rolling Summary as an accepted future experiment direction that is not implemented or
   promoted.

No runtime behavior, source, schema, test, config, package, evaluation or official artifact changed.

## DA-12 reconciliation

The final record preserves:

```text
Complete Canonical State v1
  -> pure deterministic Current Authority Projection
  -> ContextSnapshot placement + exact dependency closure + budget
```

It explicitly freezes:

- unknown/illegal kind, status or policy fails closed; no open-ended `else exclude`;
- dependency is deterministic transitive closure over exact active `DEPENDS_ON` Authority from the
  Fact/Relation owner historical receipt, not free-text `required_context` or an assumed one-hop rule;
- Manifest exact refs/revisions/policies/config/hashes, closed reasons, AttemptStarted, as-of boundary
  and mandatory-overflow failure remain accepted WO-05 Authority;
- Core freezes Working Context and opaque Host/external digests, not the complete final provider request;
- State v2, persistent placement, Retrieval, Summary and Host integration remain unpromoted.

## DA-15 candidate

Rolling Summary is recorded only as an immutable, non-authoritative, Raw-anchored derived projection.
The record prohibits Summary-only Authority provenance, recursive-only lineage, in-place mutation,
Authority/Frontier mutation and confusion with Compaction Artifact.

A future Snapshot must bind an exact immutable Summary instance/content hash plus exact Raw coverage,
generator and policy identity. Expanded coverage regenerates from full Raw into a new instance.

Experiment order is frozen as:

```text
A0 = Current Input + Frontier-bound Hot Raw + Current Authority
A1 = A0 + additive exact immutable Raw-anchored Summary

only after bounded A1 benefit:
R0/R1 = same fixed token budget without/with explicit Summary replacement
```

Generation, storage, Snapshot integration and GC/retention remain separate future work orders.

## Exact Builder surface

Relative to Builder parent `49c180d865a0a7a1abef05a6aceaaf4c8a3fae7b`, the candidate changes
exactly:

```text
docs/PROJECT_STATE.md
docs/ROADMAP.md
docs/architecture/WO-DA-01-projection-summary-adjustment-record.md
docs/handoffs/WO-DA-01-projection-summary-adjustment-record.md
docs/inventory/WO-04C/downstream-adjustment-register.md
docs/work-orders/WO-DA-01-projection-summary-adjustment-record.md
```

No sibling repository was read.

## Builder fingerprints

```text
f7a430b4f80696d2c59c56a8c3985873d257913f75fcd4aeebd49e6783fe9904  docs/architecture/WO-DA-01-projection-summary-adjustment-record.md
7d70841ed33246d79d39e45d6665e9d7576ccf4ed1ecd3170d5a31a6f7d1f7e3  docs/inventory/WO-04C/downstream-adjustment-register.md
0172f34a725fa6428fd5cef28104ee965c2de5873565e74607bd53ec441381a2  docs/work-orders/WO-DA-01-projection-summary-adjustment-record.md
1c28c95291e3f5185175bdcdc6b4762a86829df99eb9b3c8fe8ae734d74c6ada  docs/PROJECT_STATE.md
21c8f7862d86cb3beae27702c613fbbdcb5fd96b8aa2ccf6f8f099029bf7c7e5  docs/ROADMAP.md
```

Frozen runtime/config fingerprints:

```text
fb4b8c9dbd8ec9f5b25f04b37b9e1e4393247fe11a37cad11043cfb48fd464ef  src/context-snapshot.ts
09cb38cd30b2d4dee2684f4c3fefbe5fb2e01bcf8a0faf7204efbea93fd0e663  src/canonical-state.ts
bdd63602eff78bad678714bfc1bb572dcff47f3d71973d753a980ea4f9c55db6  src/canonical-fact-relation.ts
d63b63a62b62d469dbef4ec85815fa2c4c81cd6c394288debe2846428b1ceee1  src/semantic-takeover.ts
ef2c9f996d6d43b9b1f76d3c34e765eb77d96f31720ca1a9ba9e8baf332dcb9f  package.json
519fdcf4b874886466032343c25c5e5973679ef5e0ffc3dec5bf32cba3447d88  package-lock.json
189da4e3b0f7c2b3771fb5aee021b68df401630d369ed0425812fbcac4702559  tsconfig.json
```

## Builder verification

```text
git diff --check
PASS

exact path audit relative to 49c180d
PASS — six authorized docs paths only

mechanical required/prohibited phrase audit
PASS

source/schema/test/config/package/evaluation/official artifact delta
NONE
```

No `npm test` or build was required because the candidate is docs-only. Builder does not approve this
record.

## Independent QA requirements

Independent QA must:

1. pin candidate/parent/baseline/accepted WO-05 ancestry and initial clean state;
2. verify exactly six Builder paths and independently recompute the fingerprints;
3. distinguish accepted WO-05 runtime facts from future downstream direction;
4. prove DA-12 is not over-promoted to State v2/placement/Retrieval/Summary/Host;
5. compare three-layer, fail-closed, exact closure, Manifest/Attempt/budget and provider-boundary text
   against accepted WO-05/Contract/Umbrella;
6. verify DA-15 contains every immutability, Raw anchor, no-mutation, no-Artifact-confusion and exact
   Snapshot binding restriction;
7. verify A0/A1 then R0/R1 order and that A0 is canonical rather than frozen-v0 recent-N;
8. verify no runtime/config/test/evaluation/official artifact change; and
9. write only `docs/qa/WO-DA-01-projection-summary-adjustment-record.md` with ACCEPTED or FAIL.
