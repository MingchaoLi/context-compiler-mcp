# PH1-CORE-REL-01 — Phase-one Core public package reconciliation

Status: `FROZEN MODULE-OWNER PLANNING GATE / BUILDER NOT STARTED`

## 1. Authority and exact baseline

- Accepted product Target: `RippleContext-governance@7129e453fbb08648250bfbd15da93596c635ddbe`.
- Accepted Target task: `PH1-CORE-REL-01` in `PHASE1-BOUNDED-TASK-DAG-V1`.
- Materialized Task Capsule: `PH1-CORE-REL-01-MODULE-PLAN`, version `1.0.0`.
- Requirement refs: `REQ-RC-005/rev-001`, `REQ-RC-010/rev-001`,
  `REQ-RC-011/rev-001`, `REQ-RC-012/rev-001`.
- Exact Core planning and source-content baseline:
  `f07257044e458d2edaad7821a95e3f9b9d18d63b`.
- Baseline parent: `4f5ca568d344d48f7f8f178b3ef3f975cc0ad13c`.
- The commit containing this work order, the module implementation plan and the module-plan handoff is the
  docs-only Module-owner Planning Gate. Its exact SHA must be supplied to a Builder only by the controller after
  this planning task is accepted. A Builder source candidate must descend from that Planning Gate while reconciling
  source behavior against the exact content baseline above. This document does not itself activate implementation.

Repository Git/docs and the accepted governance Target are authority. Chat history, dirty primary worktrees and
accepted branch tips are not authority.

## 2. Reference-only accepted evidence

The following objects exist and are explicitly **not ancestors** of the planning baseline. They are accepted
behavior evidence only. No branch containing them may be merged, cherry-picked, rebased, copied wholesale or
treated as an integrated package.

| Capability | Accepted reconciliation | Direct parent | Accepted source evidence | Accepted QA evidence | Merge base with planning baseline |
|---|---|---|---|---|---|
| read-only query | `1b3bae4d6e69ab9dcefb60d1429929162023b833` | `7483c016c58e95fd3ca0975e312dca8ce96bdb33` | `9eca7397077233b83b4ff1ad2f1ab19d981e615f` | `7483c016c58e95fd3ca0975e312dca8ce96bdb33` | `f07257044e458d2edaad7821a95e3f9b9d18d63b` |
| isolated provisioner | `553ebdd32512387accf385ca8163c1e2f5394642` | `e67c3af8008d0a53426195f538383b722b9d18f2` | final fix `b2486d23fbf436dd62e8bb55876a472821725efe` | `f7deca9773879d271884bdc4c94eb880aade2d41` | `f07257044e458d2edaad7821a95e3f9b9d18d63b` |
| exact Raw receipt | `a85eab8eb69dab73042a0434398345f89dbd5179` | `db0b6b9443a557200369218277f76d213681c936` | final fix `d6584124d827f8e287635fe0009bd76236c9040f` | `db0b6b9443a557200369218277f76d213681c936` | `a5ec6baeda06c48a9553d1230bf03d39dcc2dfee` |

The Builder must manually reconcile only the selected public behavior onto the exact planning baseline. A diff
between two accepted branches is not a design and must not be applied as a patch.

## 3. Product objective and claim ceiling

Produce one versioned, independently packable `context-compiler-mcp` Core artifact containing compatible public
provision, ingest/exact-receipt, read-only query, `compile_context` and offline-evaluation surfaces. The artifact
remains model-independent, Host-neutral and locally testable.

This work order proves only a package candidate in fresh synthetic/disposable storage. It does not prove or
authorize publishing, installation, deployment, an ACTIVE/live connection, Adapter/Host composition, real/private
data migration, production-database upgrade, provider/model/network behavior, roster completion or product-wide
evaluation results.

## 4. Exact baseline public inventory

At `f07257044e458d2edaad7821a95e3f9b9d18d63b`:

- npm identity is private package `context-compiler-mcp@0.1.0`, Node `>=24`, ESM, `main=dist/index.js`,
  `types=dist/index.d.ts` and `files=["dist", "README.md"]`;
- binaries are `context-compiler-mcp -> dist/mcp-server.js` and
  `context-compiler-eval -> dist/evaluation-cli.js`;
- the MCP/Core command surface is exactly, in order: `health`, `ingest_event`, `compile_context`, `get_state`,
  `prepare_state_update`, `apply_state_delta`, `create_headline`, `recall_exact`, `recall_keyword`;
- package root exports the full existing library, including Raw ingest/store, current Context State, recall,
  `ContextCompilerCore`, compile, canonical authority/private-owner library surfaces, and offline evaluation v1/v2;
- `compile_context` remains the accepted legacy bounded `CompiledContext` path and is not canonical
  `ContextSnapshot`;
- offline evaluation is already exposed through package-root `runEvaluationSuite` / `runEvaluationSuiteV2` and
  the `context-compiler-eval` binary; and
- there is no `exports` map, `./query` subpath, isolated provisioner or exact Raw receipt lookup on this baseline.

No baseline behavior may be relabeled as stronger canonical Snapshot, Host integration or semantic-quality
evidence.

## 5. Frozen reconciled public surface

The implementation adds no composite facade and no tenth MCP tool. One package contains these independently
versioned surfaces:

1. **Existing package root, preserved.** All baseline runtime/type exports retain identity and semantics.
2. **Existing ingest/compile/evaluation, preserved.** `ContextCompilerCore.call("ingest_event", ...)`,
   `ContextCompilerCore.call("compile_context", ...)`, evaluation v1/v2 functions and both binaries remain
   compatible.
3. **Exact Raw receipt, additive at package root.** Reconcile the accepted v1 capability, canonical fingerprint
   helper, closed five-status result and `ContextCompilerCore.lookupRawReceipt` without changing the command port.
   Exact identity is `session_id + source_event_id`; fingerprint construction requires explicit `created_at`.
4. **Isolated provisioner, additive at package root.** Reconcile accepted
   `IsolatedContextProvisioner` contract `isolated-context-provisioner/v1`: preflight, provision, operation lookup,
   identity lookup and object close. Provision creates one Core-owned Context identity, empty native Raw session,
   zero-vector revision stream and immutable payload-free registry receipt in one transaction. It adds no
   close/delete/recycle lifecycle.
5. **Read-only query, additive subpath only.** Add package export `context-compiler-mcp/query`. Its sole runtime
   export is `CoreReadQuery`; it provides `listSessions`, `getSession`, `getState`, `recallExact`,
   `recallKeyword` and `close`. It must not re-export a writer, Store, authority owner, DB path or schema.
6. **Package export map.** Add only `.`, `./query` and `./package.json`. `.` must continue to resolve the existing
   `dist/index.js` / `dist/index.d.ts`; deep internal package subpaths become non-public.

Package `name`, `version`, `private`, `type`, binaries, `files`, engines, dependencies and lock identity stay
unchanged. Exact candidate commit plus packed tarball SHA-256 supplies phase-one artifact identity; this work order
does not authorize a semver bump or publication.

## 6. Frozen compatibility and ownership invariants

- MCP remains exactly nine tools with unchanged order, input schemas, result schemas and sanitized error codes.
- Existing Raw receipt bytes, idempotency, timestamp compatibility, recall, EVENT mirror and append-only behavior
  do not drift.
- Existing State/Fact/Relation/Authority/revision/Frontier/Snapshot/takeover/retrieval/ranking/evaluation and
  frozen-v0 behavior do not drift.
- Query `getState` preserves the accepted existing `get_state`/Context-State projection. It must not be advertised
  as canonical State authority or `ContextSnapshot`.
- Provisioning never adopts a caller-supplied session or pre-existing stream, never uses a Raw sentinel, and is
  axis-neutral. Only its additive internal registry schema may be created.
- Exact receipt lookup is read-only and never enumerates or returns Raw payload, metadata, timestamp, DB path,
  SQL, trace, stack or private content.
- Consumers may use only documented package exports. No Core private storage/schema bypass or Host-owned authority
  is introduced.
- No new runtime or development dependency is allowed. `package-lock.json` must be byte-identical to the planning
  baseline.

## 7. Exact implementation write allowlist

After controller activation, a temporary Builder may change exactly these production/package paths:

- `package.json` — only the three-entry export map;
- `src/index.ts` — additive accepted exact-receipt and provisioner exports only;
- `src/core.ts` — exact-receipt port/method only; command surface unchanged;
- `src/raw-store.ts` — exact receipt/fingerprint, read-only session queries, and internal transaction/schema seams
  required by the accepted provisioner;
- `src/revision-substrate.ts` — internal transaction-aware migration and exact live validator only;
- `src/ledger-hot-raw.ts` — internal transaction-aware migration and exact live validator only;
- new `src/isolated-context-provisioner.ts` — accepted provisioner v1 owner; and
- new `src/query.ts` — accepted read-only query subpath.

The only test paths the Builder may add/change are:

- `test/raw-store.test.ts`;
- `test/core-boundary.test.ts`;
- new `test/isolated-context-provisioner.test.ts`; and
- new `test/query.test.ts`.

The Builder handoff path is `docs/handoffs/PH1-CORE-REL-01.md`. No other source, test, fixture, schema document,
evaluation artifact, package metadata, lockfile or documentation path is writable. Existing
`test/mcp-protocol.test.ts`, `test/evaluation.test.ts`, `src/evaluation.ts`, MCP sources,
`src/sqlite-initialization.ts`, `src/experience-ledger.ts`, `tsconfig.json` and `README.md` are run/read-only.

The additive provision registry DDL must live only in new `src/isolated-context-provisioner.ts`; no existing table
or column and no standalone schema file may change. If implementation requires any path or schema behavior beyond
this exact allowlist, the Builder stops and raises a Change Request before editing.

## 8. Implementation slices

The Builder works these slices in one temporary worktree, then creates one bounded source commit:

1. **S0 — baseline guard:** verify exact parent/Gate, clean tree, evidence object existence/non-ancestry and frozen
   public export/command/package inventories.
2. **S1 — shared Raw seam:** manually reconcile accepted fingerprint/lookup and session-list/get behavior into the
   baseline Raw owner; add only the provisioner-required internal migration/live-validation seams. Prove existing
   ingest and receipt bytes are unchanged.
3. **S2 — provision owner:** add the accepted v1 owner and internal registry composition; prove atomic zero-payload
   creation, replay/restart, identity/operation collisions and live dependency validation.
4. **S3 — Core/root surface:** add exact receipt to `ContextCompilerCore` and additive package-root exports; retain
   the exact-nine command port and all baseline exports.
5. **S4 — query/package subpath:** add `CoreReadQuery`, bounded keyset session reads and the minimal export map;
   prove `./query` runtime exports exactly one class and blocks private deep imports.
6. **S5 — coexistence/adversarial tests:** exercise one provisioned target through preflight, empty query,
   explicit-time ingest, exact receipt, read-only recall, compile and offline evaluation; then exercise retry,
   collision, corruption/unavailability and forbidden-field/error leakage.
7. **S6 — artifact freeze:** run all checks, produce one source commit, generate a disposable packed tarball and
   SHA-256, then create a direct-child docs-only Builder handoff. The tarball/build output is evidence only and
   must not enter Git.

No intermediate branch commit may import an accepted branch. A QA RETURN is preserved append-only and requires a
controller-approved bounded fix; rejected commits are never rewritten.

## 9. Builder checks and evidence

The handoff must record exact commands, counts, commit identities and failures/retries for:

- `git diff --check` and an exact changed-path allowlist check against the Planning Gate;
- focused Vitest on the four writable test files;
- existing `test/mcp-protocol.test.ts`, `test/evaluation.test.ts` and the relevant existing Raw/Core compatibility
  tests without editing them;
- `npm test`;
- `npm run build`;
- `npm pack --dry-run --json`;
- one actual `npm pack --json --pack-destination <disposable-temp>` plus tarball SHA-256 and package manifest;
- source-tree and extracted-package runtime/type export probes for `.`, `./query`, `./package.json`, both bins and
  forbidden internal subpaths;
- exact baseline-root export preservation plus the frozen additive export set;
- exact-nine names/order/schema and no MCP source diff;
- `package-lock.json`, dependency, existing schema, evaluation source/artifact and binary identity checks; and
- scans proving no Host/UI/Adapter/provider/network import and no private payload/path/SQL/trace fields in public
  receipts/results/errors.

The coexistence test must at minimum prove: provision `CREATED`; restart/operation/identity replay `EXISTS`; empty
session visible through query; exact lookup `NOT_FOUND` before ingest; explicit-`created_at` ingest followed by
`FOUND_EXACT`; same ingest retry idempotency; different proof `IDENTITY_COLLISION`; query recall; existing
`compile_context` success; and an offline synthetic evaluation v2 result. All storage is fresh and disposable.

## 10. Acceptance and independent QA route

The Builder may deliver one initial bounded source commit and one direct-child docs-only handoff, but may not write
QA, mark ACCEPT or start a second task.

Fresh independent Core Module QA must start from the exact handoff in a new clean worktree, freeze its own attack
matrix from this public contract, and may write only `docs/qa/PH1-CORE-REL-01.md`. It must independently verify the
exact source commit, path boundary, public/private exports, artifact SHA-256, package-root privacy, coexistence,
idempotency/collision/restart/concurrency, sanitized fail-closed behavior, exact-nine MCP, full tests/build/pack and
reference-evidence non-extrapolation. Module Owner review and Builder self-tests are not acceptance.

Only after Core Module QA records ACCEPT may Governance Submission QA consume the exact package tarball/digest,
public contract, Builder handoff and Module-QA verdict. Submission QA verifies manifest identity, the Core claim
ceiling and absence of branch-union claims; it does not inspect private data, activate a Host or convert a package
candidate into deployment/integration acceptance.

## 11. UNKNOWN and Change Requests

These points are frozen rather than inferred:

| ID | Fact / ambiguity | Conservative disposition for this task | Falsifier / CR trigger |
|---|---|---|---|
| `U-QUERY-01` | The accepted query work-order prose says missing `getSession` is explicit `NOT_FOUND`, while accepted source, handoff and QA expose `SessionSummary \| undefined`. | Preserve the QA-tested source signature and record the prose mismatch; do not invent an error union. | Governance requires explicit `NOT_FOUND` or a common result envelope: open a separate interface CR before Builder edit. |
| `U-QUERY-02` | Query prose uses “canonical state”, but accepted source reads the existing `SqliteContextStateStore`/`get_state` projection. | Preserve existing Context-State projection and label it honestly; no canonical authority/Snapshot claim. | Any request for canonical authority or `ContextSnapshot` query is a new scoped CR. |
| `U-PKG-01` | The Target says “versioned, independently packable” but does not authorize publishability or a new semver. | Keep `context-compiler-mcp@0.1.0`, `private:true`; bind artifact by exact commit and tarball SHA-256. | A required semver bump, registry publish or `private:false` is a package/release CR. |
| `U-ERR-01` | The selected surfaces have different accepted failure shapes; no common Core-wide error envelope is selected. | Preserve each accepted surface-local contract and mechanically prove payload/path/SQL/trace sanitization. | Any required unified error DTO or changed query error API is a public-interface CR. |

No listed UNKNOWN authorizes scope expansion. If the conservative disposition cannot pass the acceptance checks,
the Builder stops; it does not weaken proof or silently choose a new contract.

## 12. Current planning-attempt write allowlist

This Module-owner Planning Gate changes only:

- `docs/work-orders/PH1-CORE-REL-01.md`;
- `docs/modules/core-public-package/implementation.md`; and
- `docs/handoffs/PH1-CORE-REL-01-MODULE-PLAN.md`.

No source, test, schema, package, lock, build output or Builder task is created by this planning attempt.
