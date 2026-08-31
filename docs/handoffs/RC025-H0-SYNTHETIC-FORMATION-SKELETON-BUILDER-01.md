# RC025-H0-SYNTHETIC-FORMATION-SKELETON-BUILDER-01 handoff

## Delivery identity

- Role: temporary bounded Builder
- Task capsule: `RC025-H0-SYNTHETIC-FORMATION-SKELETON-BUILDER-01@1.0.0`
- Capsule SHA-256: `5ad5a2a4c1d9fbf14d3fa3011b68b1439ebf7bc0da691f71e99c1b5520425111`
- Approved plan / exact parent P: `62ea8438f9e9e26903a38447d9aadf0d4d588cf6`
- Source candidate S: `3c7f3d4c1128fec1d0c9f5c9633dd10bd3c9326d`
- S sole parent: `62ea8438f9e9e26903a38447d9aadf0d4d588cf6`
- S tree: `90f92a4306f25b193f1d73edfae711975dc07743`
- Handoff H: reported in the post-commit issuer return envelope because a file cannot embed its own final blob, tree,
  or commit identity
- H required sole parent: `3c7f3d4c1128fec1d0c9f5c9633dd10bd3c9326d`
- H required sole changed path: `docs/handoffs/RC025-H0-SYNTHETIC-FORMATION-SKELETON-BUILDER-01.md`
- Return route: Chief Architect thread `01a05126-4b8e-75b3-b6bc-a866a635bad5`
- Claim ceiling: `SYNTHETIC_OFFLINE_FORMATION_SKELETON_ONLY`

## Bounded result

The candidate adds one Evaluation-owned disposable Formation skeleton. Fixture-local types mirror the frozen public
port meanings without package export. A fake Core assigns and verifies synthetic batch, attempt, family, revision,
relation, receipt, and current-card identities; filters candidates scope/privacy-first; enforces all H0 bounds; and
performs whole-change validation before one canonical-memory replacement. A fake Adapter invokes exactly one injected
deterministic script and normalizes the closed action, coverage, and Experience-disposition domains. The harness
executes the exact eight-port lifecycle, fault injection, durable post-claim failure, crash-after-claim, and replay.

The source is synthetic and offline only. It introduces no product Core or Adapter port, package-root export, Host
wiring, public API, product store, provider/model call, credential, external request, deployment, integration, or
`ACTIVE` behavior.

## Exact S paths and blobs

| Path | Git blob |
| --- | --- |
| `evaluation/rc025-h0-synthetic-formation-v1/README.md` | `6aa323568a0ef62caef8817dddb5689c11e04689` |
| `evaluation/rc025-h0-synthetic-formation-v1/contract.ts` | `54fcdb14a61dacec9e81202a021c22a57b88ca6a` |
| `evaluation/rc025-h0-synthetic-formation-v1/fake-adapter-port.ts` | `9629cba2dbaf07d28dfa2cf10ff18af4e7698eb2` |
| `evaluation/rc025-h0-synthetic-formation-v1/fake-core-port.ts` | `8ca22e5f09f9dbac61a558a3b23d716dbdc1c503` |
| `evaluation/rc025-h0-synthetic-formation-v1/harness.ts` | `85f4b27a8e06829ac9e8648dcc184ba1562e6930` |
| `evaluation/rc025-h0-synthetic-formation-v1/identity.ts` | `f53859e18f73c3240e9202bdbd2b2cf2bb127dce` |
| `evaluation/rc025-h0-synthetic-formation-v1/scenarios.ts` | `4c8ad4ef6b6c4a363667ea82fd0771ada6be7649` |
| `evaluation/rc025-h0-synthetic-formation-v1/synthetic-state.ts` | `fb02c5c81fca8a42dbf88ef51ed879334680421a` |
| `test/rc025-h0-synthetic-formation-skeleton.test.ts` | `598cc5530ae5d98c9b1bf82291cf5514fc9b6cae` |

All nine entries are ordinary mode `100644` files. No other path changed in S.

## Executable coverage

- H0-01 through H0-18 each bind exact operation, ordered Evidence, cutoff, session/context, scope/revision, limits,
  sealed input, batch, attempt, family, outcome, canonical pre/post, call-count, card-opacity, and claim-ceiling
  observations.
- The exact 24 cells cover `TIMEOUT`, `CANCELLED`, and `FAILED` at each of the eight lifecycle ports.
- Separate cases cover crash immediately after claim and exact replay with no second call or identity/state
  amplification.
- Closed-domain attacks cover unknown fields/enums, model-assigned Authority keys, mismatched batch/attempt,
  duplicate/missing Evidence, missing/unpresented/cross-scope/stale family state, self/duplicate/cyclic relations,
  structurally invalid Experience support, and whole-change rollback.
- Limit checks cover source count, exact serialized input units, Fact count, Experience count, serialized action bytes,
  truthful `PARTIAL`, explicit `UNKNOWN`, and the 6-Fact/2-Experience candidate cap.
- Compact current cards contain only opaque Evidence refs and explicit non-authority qualification; no Evidence body,
  truth, current-task applicability, Utility, or ranking verdict is present.

## Frozen deterministic H0-01 receipts

| Receipt | SHA-256 / exact ref |
| --- | --- |
| limits profile | `74e1985ab1e630cf9cb109cd90195b934c433e1d8d2d1c319152dc1f9d9fdc0e` |
| sealed input | `29451f51414892a4c75abb66ce7269b7c9fb64df5b8a95c0fca09518d7ec9fe1` |
| batch | `rc025-h0-batch:sha256:c4c8d899248bd92a3abc6e4d5f16624540224e40fd67923c2131443bdd3b35c3` |
| attempt | `rc025-h0-attempt:c4c8d899248bd92a3abc6e4d5f16624540224e40fd67923c2131443bdd3b35c3:1` |
| outcome JCS | `0b8472516b8e7c5b8367fa9ad7141c8cb17fc78458ca6dc55d9aeec9f08cd088` |
| first card JCS | `d045a772bdd34b3ffa1a462d1c528d72243a48676857b8ecc0b195f70934f764` |
| receipt journal JCS | `ee64b65ff0e435c4ccf354de93c3d0b0e208d5fc4215f8f9f9d891191e06dff6` |
| canonical pre-state | `18922a949c1e0d2330f125bd714f2f893398a4c3839389b3c71c964493479b6b` |
| canonical post-state | `7b1b0cfb0c2918f3548da8b75a7fd2193f2ba55a25af3d8f85e000b2018ed92d` |

The focused test independently reconstructs and fixes these exact values.

## Builder self-checks

- Capsule SHA, clean detached baseline, plan event, plan capsule, Architecture `APPROVE`, and every required
  commit/blob/file hash: `PASS`.
- Strict fixture-local TypeScript check (`tsc --noEmit --strict` over the seven `.ts` fixture sources): `PASS`.
- Focused test `test/rc025-h0-synthetic-formation-skeleton.test.ts`: `58 passed / 58`.
- Full `npm test`: `676 passed / 1 skipped / 677 total`; the skipped case is the repository's pre-existing
  `generate-official-results` test.
- `npm run build`: `PASS`.
- `git diff --check`: `PASS`.
- Exact nine-path source allowlist and ordinary-file/mode check: `PASS`.
- Product/config/package/lock/schema/Requirement/Architecture/interface/work-order/QA no-drift: `PASS`.
- Runtime-import, external-I/O, environment-memory, absolute-path, symlink, private-body, credential, and offline scan:
  `PASS`; no forbidden path or dependency was found.
- Verification reused an already-installed local dependency tree with no install or download; the temporary copy was
  removed before commit and is not an artifact.
- Worktree was clean immediately after S. Final clean state and exact H commit/tree/blob are reported in the issuer
  return envelope after H exists.

These are Builder self-checks only. This handoff makes no Module-QA, Submission-QA, Integration-QA, `ACCEPT`,
`RETURN`, integration, completion, deployment, or `ACTIVE` verdict or claim.
