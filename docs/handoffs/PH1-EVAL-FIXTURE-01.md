# PH1-EVAL-FIXTURE-01 Builder handoff

Status: `READY FOR FRESH EVALUATION MODULE QA / BUILDER DOES NOT APPROVE`

## Exact lineage

- Planning Gate / source parent: `8cf8ca7c24d34fe3c6b591dc721937992ea67c76`.
- Bounded source candidate: `1fe5da5da858cff5c1ed31d6b9163dce1dc67892`.
- The handoff commit is the direct child of that source candidate and changes only this handoff plus the append-only
  implementation receipt in `docs/work-orders/PH1-EVAL-FIXTURE-01.md`. Its exact SHA is reported after commit because
  a commit cannot contain its own identity.
- Materialized Builder capsule: `PH1-EVAL-FIXTURE-01-BUILDER`, version `1.0.0`.

## Delivered source paths

The source candidate changes exactly:

```text
evaluation/phase-one-synthetic-v1/corpus.json
evaluation/phase-one-synthetic-v1/oracle.json
evaluation/phase-one-synthetic-v1/renderer.json
evaluation/phase-one-synthetic-v1/run-manifest-fixtures.json
evaluation/phase-one-synthetic-v1/freeze.json
evaluation/phase-one-synthetic-v1/run-offline.mjs
test/phase-one-evaluation-fixture.test.ts
```

No `src/**`, existing evaluation artifact, package/lock/config/schema, database, build output, QA report, result
artifact, or governance file changed.

## Frozen population and controls

- Corpus id: `rc-phase-one-synthetic-v1`; selection: `ALL_CASES`.
- Cases: exactly the six WO-fixed ASCII-ordered ids, with one exact primary-category count each.
- Opaque ids: 11 sequential `FX-Fdddd`, 11 sequential `FX-Sdddd`, and 3 sequential `FX-Qdddd`.
- Corpus/oracle: ordinary, separate public files; the corpus has no evaluator-control role fields. All prose is newly
  hand-authored synthetic content. C05's one filler record uses only deterministic local ASCII repetition and yields
  exactly 39,332 reference-history UTF-8 bytes.
- Arms: exactly `D0_FULL_AUTHORIZED_FIXTURE`, `D1_HOST_NATIVE_BOUNDED`, and
  `D2_RIPPLECONTEXT_COMPILED`; positive conformance matrix: 18 cells. It is
  `REFERENCE_FIXTURE_NOT_A_HOST`, not Host evidence.
- Invalid controls: all 14 WO-frozen codes reproduce one-for-one. Missing, unknown, unsupported, unobservable,
  invalid, and genuine zero-denominator states remain distinct; no result contains weights, scalar score/rank/winner,
  or overall `passed` authority.

## Exact digest receipts

| Artifact | File SHA-256 | Value SHA-256 |
| --- | --- | --- |
| corpus | `db8e13339f57434b06f83018886edd32e7227c70c80b9eaed23b63f647d46636` | `003f36c13653f27b7f036cd97100d37b16d3dd4b9eb81e52945c79d5235daaad` |
| oracle | `efd8f9864e7625293a8aae416a10b6e352b98958468a74e342e03fff88d2f7ce` | `0682e11d36800aaac049d900d696f2666448b738ac187c47c09b1693ae297a18` |
| renderer | `d0b861f404e473557847a7a7ea25457e8825c6a31d83cc2e1eecb7c2809f87f7` | `4d61bd32d95b525832862bc967019ac422cf0db56ace3bf78ca963f59faf2e1f` |
| manifest controls | `77bdaa3e8c565efad3f7ef12197f0aa39a3f5e633facb1e49f9ec5325fa6b866` | `c76810e5e6cce4f633924e462acca3dd9a634e19d0b0d9245536523efb91d529` |
| offline runner | `756a4bbc413622b1173e2e95ac1e3e23a8e39d84840dc887a2c36c8f82a9bb1f` | `NOT_APPLICABLE` |

- Fixture bundle SHA-256: `728bf406b9c4653d6a487938c23c1de5014c9b2c3357e42c9ebee5c19ef3743b`.
- Exact `freeze.json` file SHA-256:
  `808fbc1daf2466e78d3e5b641dcb4057b3cb394c0bf437c4edf1f36b0eea75a1`.
- Positive run id:
  `RUN-SHA256-5b061c46627e651da35d788decc11cfe5500dc2440451021db67f9367468f947`.
- Byte-identical external replay file SHA-256:
  `2e898fe21ec607727241993c5dd260ebe205edfcdf3daf9e280d746110772b39`.
- Normalized result value SHA-256:
  `30c2f54f61ba5071b0d9a1c465ca7eddb54657f09d090055f6e101b83032c893`.

## Builder checks

- Focused: `vitest run test/phase-one-evaluation-fixture.test.ts` — 6/6 passed.
- Runner: `validate`, internal two-fresh-directory replay, and two external invocation byte comparison — passed.
- Existing estimator identity: reconstructed for all six renderer packets through the public `estimateTokens` test;
  passed.
- Build: `npm run build` — passed.
- Final full suite: 38 test files passed / 1 skipped; 593 tests passed / 1 skipped.
- First full-suite run: 591 passed / 2 failed / 1 skipped. One failure was the previously recorded concurrent
  ContextSnapshot cleanup/lock race; the other came from the allowed local `node_modules` symlink becoming a
  non-directory in the package-only copy and forcing an unavailable offline-cache lookup. No product source changed.
  Targeted reruns passed 24/24 and 17/17; an ignored local real copy of the already-present dependencies replaced the
  symlink, and the complete second suite passed.
- `git diff --check`, exact source/docs path allowlists, ordinary-file checks, canonical JSON/final-LF validation,
  independent exact replay comparison, and public-control credential/URL/local-path scans — passed.

## Boundaries for QA

No model, provider, network, install, private/real conversation, QA-only/hidden evidence, measured Host run, billing
claim, scalar winner, package/API promotion, or Core authority/retrieval/ranking change occurred. Module QA must fix
the exact source candidate above, independently reconstruct all bytes/digests/matrix/missingness, and write its own
QA-only commit. Governance Submission QA remains a later controller-owned gate and is not implied by this handoff.
