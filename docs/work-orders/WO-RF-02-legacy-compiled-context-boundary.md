# WO-RF-02 — Legacy CompiledContext / Canonical ContextSnapshot Boundary

Status: DOCS CANDIDATE COMPLETE / AWAITING INDEPENDENT QA

Planning baseline: `a5ec6baeda06c48a9553d1230bf03d39dcc2dfee`

## Objective

Clarify one existing compatibility boundary in the smallest public authority location:

- legacy `CompiledContext` is a bounded context assembly output;
- canonical `ContextSnapshot` is a distinct persisted revision/evidence/attempt/authority contract; and
- no caller may advertise or consume the former as proof of the latter.

The clarification must identify both existing public library entry points, their guarantees and their
`NOT_PROVEN` boundaries without publishing a new API.

## Authority reconciliation

Current repository authority is clean `main` at the planning baseline. Accepted WO-PUB-04 reconciliation
`a85eab8eb69dab73042a0434398345f89dbd5179` is a valid commit on
`codex/wo-pub-04-exact-raw-receipt-lookup`, but `git merge-base --is-ancestor` proves it is not an ancestor of the
planning baseline. This work order therefore does not merge, cherry-pick, restate or advertise that branch's
exact Raw receipt lookup as a current-main capability.

## Routed files

Only these files are routed for this docs-only candidate:

- `AGENTS.md`
- `README.md`
- `docs/PROJECT_STATE.md`
- `docs/ROADMAP.md`
- this work order
- `docs/architecture/WO-05-context-snapshot-contract.md`
- `docs/work-orders/WO-PUB-01-public-mcp-result-boundary.md`
- `src/assembler.ts` (read-only contract evidence)
- `src/context-snapshot.ts` (read-only contract evidence)
- `src/core.ts` (read-only public-method evidence)
- `src/index.ts` (read-only package-root export evidence)
- `package.json` (read-only package entry evidence)
- `docs/handoffs/WO-RF-02-legacy-compiled-context-boundary.md`
- `docs/qa/WO-RF-02-legacy-compiled-context-boundary.md`

No private data, QA-only Case/Gold/payload, hidden holdout, database or deployed runtime is routed.

## Acceptance criteria

1. The public README calls `CompiledContext` a legacy compatibility surface and a bounded context output.
2. The README explicitly says `CompiledContext` is not canonical `ContextSnapshot` and does not prove complete
   revision vector, exact evidence/as-of, immutable manifest, AttemptStarted receipt or Authority closure.
3. The README links the actual package-root/library entries and existing contract authority for both types.
4. The `ContextSnapshot` description remains limited to the accepted WO-05 contract and does not claim Host
   consumption, deployment, MCP exposure, provider/model selection or release wiring.
5. The stdio MCP remains exactly nine tools; the clarification publishes no new API, schema or capability.
6. Candidate paths contain Markdown only. There is no change to `src/`, `test/`, package/lockfile, schema,
   database, runtime, deployment, Host/Adapter or frozen artifacts.
7. All relative Markdown links resolve, terminology is consistent, and `git diff --check` passes.
8. Independent QA records PASS before repository status changes to `ACCEPTED / COMPLETE`.

## Non-goals and stop conditions

- No legacy/canonical implementation merge, conversion helper, migration or database rewrite.
- No API, MCP tool, schema, runtime, test-logic, deployment-policy or capability-scope change.
- No adoption of non-main WO-PUB-04 source or release claim.
- Stop if the worktree becomes dirty from another actor, an active work order conflicts, or the docs-only
  append-only chain cannot be preserved.
