# WO-DA-01 Append-only Fix Handoff — Planning-baseline Tense

Status: **FIX COMPLETE / AWAITING FRESH INDEPENDENT RE-QA**

Returned candidate: `871e5267a0afd3385b9812af98f7648f0a89c5b7`

QA return: `f219c4f71347e34e4f776341ea4518b5d8bc7b0e`

QA formatting commit / fix parent: `d2e7053e3fcfe2592f18ad6fa996dde5bb42b27e`

Fixed candidate: the commit containing this handoff; fresh QA must resolve and pin the exact hash.

## Bounded fix

The returned work order stated in present tense that the downstream register still ended at DA-14 and
DA-12 still said `NOT YET PROMOTED`, while the same candidate had already added DA-15 and reconciled
DA-12.

The fix changes that sentence to an explicitly historical fact about planning baseline
`0a2d4437bc2b80714ae819654e5f41aab7a1a41e` and records the append-only QA return. No DA-12,
DA-15, architecture, register, project-state, roadmap or runtime contract changed.

## Fixed surface

Relative to fix parent `d2e7053e3fcfe2592f18ad6fa996dde5bb42b27e`:

```text
docs/handoffs/WO-DA-01-projection-summary-adjustment-record-fix.md
docs/work-orders/WO-DA-01-projection-summary-adjustment-record.md
```

The work-order fingerprint after the fix is:

```text
ce5516dab16790735b73c17f08e28e7ac1aba197e6f2bb205cff92203409a482  docs/work-orders/WO-DA-01-projection-summary-adjustment-record.md
```

## Preserved candidate facts

- original six-path Builder candidate remains `871e5267a0afd3385b9812af98f7648f0a89c5b7`;
- DA-12 remains promoted only for accepted WO-05 Current Authority Projection / ContextSnapshot;
- DA-15 remains not implemented and not promoted;
- all Summary restrictions and A0/A1/R0/R1 ordering are unchanged;
- source/schema/test/config/package/evaluation/official artifacts remain unchanged;
- first QA passed every substantive contract check and returned only the stale present-tense fact.

## Verification

```text
git diff --check
PASS

stale present-tense statement
REMOVED — the statement is now explicitly planning-baseline history

runtime/config delta
NONE
```

Fresh Independent re-QA must review the complete fixed chain, verify the work order no longer asserts
the stale fact as current state, and confirm that the fix did not modify or broaden any accepted design
contract. Builder does not approve this fix.
