# PH1-EVAL-FIXTURE-01 module-plan handoff

Status: `READY FOR PLANNING GATE REVIEW / BUILDER NOT STARTED`

## Exact lineage

- Worktree: `/Users/lmc/Documents/agent长期记忆/.worktrees/ph1-eval-fixture-01`
- Branch: `codex/ph1-eval-fixture-01`
- Gate parent / Core planning baseline: `f07257044e458d2edaad7821a95e3f9b9d18d63b`
- Product authority: `RippleContext-governance@7129e453fbb08648250bfbd15da93596c635ddbe`
- Materialized capsule: `PH1-EVAL-FIXTURE-01-MODULE-PLAN`, version `1.0.0`
- The exact commit containing this handoff is the docs-only planning Gate; its SHA is reported by the Module Owner
  after commit because a commit cannot contain its own identity.

## Delivered paths

Exactly three planning paths are delivered:

- `docs/work-orders/PH1-EVAL-FIXTURE-01.md`
- `docs/modules/evaluation-fixtures/implementation.md`
- `docs/handoffs/PH1-EVAL-FIXTURE-01-MODULE-PLAN.md`

The controller-precreated untracked work-order skeleton is included in the Gate. No corpus, source, test, schema,
package, lockfile, QA, result, or generated build file is included.

## Frozen plan

- Public dataset identity: `rc-phase-one-synthetic-v1`.
- Exactly six ASCII-ordered cases, one for each accepted primary category: relevant+distractor,
  stale+superseded, conflict+provenance, missing+uncertain, long-context pressure, safe fallback.
- Corpus and oracle are physically separate. Corpus fact ids are opaque and arm-neutral; required/prohibited/
  qualification roles exist only in the public evaluator-control oracle and are not a hidden holdout.
- Arms are exactly `D0_FULL_AUTHORIZED_FIXTURE`, `D1_HOST_NATIVE_BOUNDED`, and
  `D2_RIPPLECONTEXT_COMPILED`; D0 is a fixture reference and generic MCP is not a Host.
- Reference renderer is `RC_PHASE1_FACT_LINES_V1`. Declared units use
  `CC_ESTIMATE_TOKENS_JS_UTF16_CODE_UNITS_DIV4_V1`, tied to the exact accepted Core estimator and always labeled
  `ESTIMATED`, never billing/provider tokens.
- Canonical JSON and hashes use the already accepted RFC-8785/no-LF value versus final-LF file distinction.
  Bundle and run-id preimages are exact and non-self-referential.
- Missingness is fail-honest: empty denominator is `NOT_EVALUABLE`; unobserved is `UNKNOWN` or
  `INPUT_UNOBSERVABLE`; unsupported and invalid remain separate; none becomes zero or substitutes another cell.
- No weights, scalar score/rank/winner, overall `passed` authority, billing claim, Host completion, model call, or
  measured run is authorized.

## Exact later Builder allowlist

After a controller activates a new implementation capsule at this Gate, the Builder may change only:

```text
evaluation/phase-one-synthetic-v1/corpus.json
evaluation/phase-one-synthetic-v1/oracle.json
evaluation/phase-one-synthetic-v1/renderer.json
evaluation/phase-one-synthetic-v1/run-manifest-fixtures.json
evaluation/phase-one-synthetic-v1/freeze.json
evaluation/phase-one-synthetic-v1/run-offline.mjs
test/phase-one-evaluation-fixture.test.ts
docs/work-orders/PH1-EVAL-FIXTURE-01.md
docs/handoffs/PH1-EVAL-FIXTURE-01.md
```

The work-order edit is an append-only implementation receipt only. `src/**`, current evaluation assets,
`docs/qa/**`, schema/package/lock/config/database/build/log files, and governance repository files are not Builder
paths.

## Builder and QA route

1. B1 authors only the six public synthetic cases, separate oracle, renderer profile, and manifest controls without a
   model/network/private source.
2. B2 implements the fixture-local dependency-free validator/replay plus focused adversarial tests; public evaluator
   v2 remains unchanged.
3. B3 freezes exact digests, runs focused replay plus `npm test`, `npm run build`, diff/allowlist checks, and writes the
   implementation handoff. It performs no measured Host run.
4. Fresh independent Evaluation Module QA fixes the exact Builder candidate and independently reconstructs bytes,
   ids, denominators, renderer, digests, replay, invalid controls, arm neutrality, no-private-data, and no-drift.
5. Controller-materialized governance Submission QA then freezes exact public corpus/oracle/renderer/manifest/
   runner/freeze/bundle digests. Only that later acceptance can unblock measured Host tasks.

Builder self-tests, Module Owner review, and Module QA are not Submission QA.

## Authority receipts

- Fairness blob: `243636ae70d5e4f0b90c9f77eeea0b48def2eb25`; exact-file SHA-256
  `07a79307c7ae452132b12ed98b13b45d6502c4126f1c25cf32c2560ab14e297b`.
- Target-manifest blob: `7f2e350b0947e49f295e06f63f4a61d4ab56ab52`; exact-file SHA-256
  `eecc6f6a1e6077a34751c36fc04cf810ac1f4db5c183340d6bc8c69e40a3d9bd`.
- Current evaluator v2 source blob: `802d4444136b231a65469b3d159cf54d36c4c732`; exact-file SHA-256
  `1c8585fb3c20f2fac423afd6c28b2065dd23b5917df3aa41181c5efe5f56e2d9`.
- Existing estimator source blob: `6d950cea32f9ab5bc55ee44d64e9f3d174a54b76`; exact-file SHA-256
  `70394a0a44974d94e1c1a767c387ffadc4a00db8375177d1dcd1b1867445c2fc`.
- Accepted BM SPEC tree: `a6821960a4d057bf376a0a4afb518b5f34482dae`; contract doc SHA-256
  `b9bffde8bc1c46891cbd3f661beeb6eeff9087e26e047d22205fac152bdc9130`.

## UNKNOWN / CR summary

- Official Host roster, measured Host/runtime/package/boundary/lane/repetition/resource fields, final-input/provider
  observability, future artifact hashes, and exact governance Submission-QA task/report path remain UNKNOWN.
- Evaluator v2 versus accepted fairness mismatch is closed by preserving v2 and planning a fixture-local vector
  validator only; no public API/source promotion occurs.
- Any natural-language semantic scorer, hidden holdout, model/provider/network use, scalar weights, billing conversion,
  changed tokenizer, expanded population, new path, or measured run requires a new Change Request and Gate.

## Planning checks

The Module Owner must report after committing:

- exact Gate commit and parent;
- exact changed paths;
- `git diff --check` result;
- docs-only/path-allowlist result;
- clean worktree result.

`npm test` and `npm run build` are not required for this docs-only Gate and have not been used to imply source
acceptance. They are mandatory for the later implementation candidate.
