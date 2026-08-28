# WO-RF-02 Builder Handoff

Status: BUILDER RESULT ACCEPTED / COMPLETE

## Pinned append-only candidate

- planning baseline / direct parent: `a5ec6baeda06c48a9553d1230bf03d39dcc2dfee`
- docs-only Builder candidate: `2dc823e0497d37bac4d08e4d78c841f2a7946c56`
- work order: `docs/work-orders/WO-RF-02-legacy-compiled-context-boundary.md`

Immediately before this handoff was added, `main` pointed to the Builder candidate and `git status --short`
was empty. The candidate is a direct child of the planning baseline.

## Exact candidate paths

The baseline-to-candidate diff contains exactly four Markdown paths:

- `README.md`
- `docs/PROJECT_STATE.md`
- `docs/ROADMAP.md`
- `docs/work-orders/WO-RF-02-legacy-compiled-context-boundary.md`

There is no `src/`, `test/`, package/lockfile, schema, database, runtime, deployment, Host/Adapter or frozen-artifact
change.

## Delivered clarification

The public README now distinguishes two existing package-root library surfaces:

- legacy `CompiledContext` remains a bounded compatibility output from `assembleContext` / `renderCompiledContext`
  and the library `ContextCompilerCore.call("compile_context", …)` path; and
- canonical `ContextSnapshot` remains the separate WO-05 persisted contract reached through the existing
  package-root types/constants and `freezeContextSnapshot` / `readContextSnapshot` /
  `readContextAttemptStarted` methods.

The README explicitly records that `CompiledContext` does not prove the complete revision vector, exact
evidence/as-of, immutable manifest, AttemptStarted receipt or Authority closure. It cannot be advertised,
serialized or consumed as a canonical Snapshot. The Snapshot row separately marks Host consumption, deployment,
MCP exposure, provider/model selection and release wiring as `NOT_PROVEN`.

## Reconciliation boundary

Commit `a85eab8eb69dab73042a0434398345f89dbd5179` is resolvable and records accepted WO-PUB-04 reconciliation on
`codex/wo-pub-04-exact-raw-receipt-lookup`, but it is not an ancestor of the planning baseline or Builder
candidate. The candidate does not merge, cherry-pick or advertise that branch's exact Raw receipt lookup.

## Checks run

- exact candidate parent and four-path inventory: PASS
- `git diff --check` for baseline-to-candidate: PASS
- all seven new relative Markdown link targets: PASS
- terminology search for `CompiledContext`, `ContextSnapshot`, `NOT_PROVEN` and the reconciliation SHA: PASS
- production/runtime path exclusion: PASS
- model benchmark: not run; irrelevant to a Markdown-only boundary clarification

## Independent QA request

Fresh QA should use this handoff commit as its direct parent, independently verify the candidate identities and
path set, compare claims to the routed package exports/source and WO-05/WO-PUB-01 authority, check every relative
link and forbidden extrapolation, and add only
`docs/qa/WO-RF-02-legacy-compiled-context-boundary.md`. QA must not approve deployment, a new API, a new MCP tool,
WO-PUB-04 main availability, or legacy/canonical implementation convergence.

Fresh Independent QA commit `4f5ca568d344d48f7f8f178b3ef3f975cc0ad13c` returned **PASS** for the
fixed candidate and all eight work-order acceptance criteria. That acceptance does not broaden this handoff's
scope or authorize any excluded capability.
