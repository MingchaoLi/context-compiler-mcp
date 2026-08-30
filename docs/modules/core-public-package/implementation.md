# Core public package — PH1-CORE-REL-01 implementation plan

Status: `FROZEN MODULE PLAN / NO BUILDER ACTIVATION`

## Module mission

The Core public package remains one model-independent npm artifact. Phase one is a bounded behavioral
reconciliation: preserve the exact baseline package while manually adding the three selected accepted capabilities
from reference-only Git evidence. It is not a branch integration exercise and does not create Host, UI,
orchestration, provider or deployment ownership in Core.

Planning baseline: `f07257044e458d2edaad7821a95e3f9b9d18d63b`.

## Public-surface map

| Consumer surface | Entry point after reconciliation | Frozen meaning | Explicit non-meaning |
|---|---|---|---|
| full Core library | `context-compiler-mcp` | baseline root exports plus accepted provisioner and exact receipt capability | not a Console-safe least-privilege surface |
| read-only consumer | `context-compiler-mcp/query` | `CoreReadQuery` only; session list/get, existing Context-State read and recall | no write, Store, authority, schema, DB path or canonical Snapshot |
| Raw ingest | `ContextCompilerCore.call("ingest_event", input)` | existing exact-nine command semantics and existing public ingest receipt | no new MCP tool and no bulk/import surface |
| exact receipt | root helper/capability plus `ContextCompilerCore.lookupRawReceipt` | restart-safe proof by exact source identity and explicit-time fingerprint | no enumeration, payload read or inferred success |
| compile | `ContextCompilerCore.call("compile_context", input)` and existing MCP tool | existing legacy bounded `CompiledContext` behavior | not `ContextSnapshot` and no semantic-gain claim |
| offline evaluation | root v1/v2 evaluation functions and `context-compiler-eval` bin | existing deterministic synthetic/offline evaluator | no provider call, live Host run or whole-product verdict |
| isolated provision | root `IsolatedContextProvisioner` v1 | atomic Core-owned empty target plus payload-free immutable receipt | no close/delete/recycle, binding, Migration Manifest or Host authorization |

There is deliberately no new all-in-one class. Coexistence is proven by package-level tests, not by creating a
second authority or wrapping the existing command port.

## Internal ownership and dependency direction

```text
package root
  ├─ existing ContextCompilerCore ──> Raw/State/Recall/... owners
  │                                └─> exact receipt read port (Raw owner)
  ├─ IsolatedContextProvisioner ───> internal Raw + revision + hot-Raw schema seams
  ├─ evaluation v1/v2 (unchanged)
  └─ ./query: CoreReadQuery ────────> read-only Raw/State/Recall methods
```

Only owner modules touch SQLite. `CoreReadQuery` may construct existing Stores internally but exports none.
`IsolatedContextProvisioner` owns only its additive registry and composes accepted owner migrations/validators in
one transaction. Exact receipt proof remains owned by Raw. `ContextCompilerCore` maps the Raw read port to the full
library surface without adding it to the nine-command MCP port.

## Selected behavior to reconcile

### Exact Raw receipt v1

- Public constants: `RAW_INGEST_FINGERPRINT_VERSION`,
  `EXACT_RAW_RECEIPT_LOOKUP_CAPABILITY_NAME`, `EXACT_RAW_RECEIPT_LOOKUP_VERSION`,
  `EXACT_RAW_RECEIPT_LOOKUP_STATUSES`.
- Public helpers/types: `computeRawIngestFingerprint`, `getExactRawReceiptLookupCapability`, the closed capability,
  input/receipt/port/result/status types and `RawReceiptLookupInputError`.
- Closed ordinary outcomes: `FOUND_EXACT`, `NOT_FOUND`, `IDENTITY_COLLISION`, `CORRUPT_DATA`, `UNAVAILABLE`.
- `FOUND_EXACT` adds only `ingest_fingerprint` and receipt `{id, session_id, seq, source_event_id}`.
- Caller proof requires explicit `created_at` and `source_event_id`; fingerprint binds every existing Raw ingest
  idempotency field while preserving exact content bytes and accepted timestamp equivalence.
- Raw row, receipt coordinates and accepted EVENT mirror must agree in one completed read snapshot. Hostile or
  unstable public object graphs fail before lookup; no live re-read of caller-owned values is allowed.

### Isolated provisioner v1

- Request is exactly `{contract_version:"isolated-context-provisioner/v1", operation_id, namespace}`.
- Core deterministically derives `context_id`, `stream_id` and `session_id` with separate versioned domain tags.
- One `BEGIN IMMEDIATE` creates the native session, zero-vector `cc_revision_streams` row and immutable provision
  registry binding; no Raw or semantic payload row is created and no axis advances.
- Same operation/request replays exact immutable fields with `EXISTS`; changed request or any partial identity
  reuse fails closed.
- Every public operation revalidates the provision registry and exact dependency-owner tables, constraints,
  indexes, triggers, versions, native bindings, hashes and foreign keys.
- Public errors remain the accepted finite provisioner error-code union. The public receipt is closed and
  payload-free. `close()` closes only the object connection.

### Read-only query subpath

- `listSessions({limit,cursor?})` uses session-id keyset order, limit `1..100`, bounded cursor and returns
  `{items,next_cursor}`.
- `getSession(sessionId)` reads only session identity/creation time and preserves accepted `undefined` on absence.
- `getState(sessionId)` is the existing Context-State goal/constraint/decision/open-question projection.
- `recallExact` and `recallKeyword` delegate to existing read-only recall semantics.
- Runtime export set for `./query` is exactly `{CoreReadQuery}`; accepted DTOs are type-only.

## Exact implementation path allowlist

| Kind | Writable path | Permitted delta |
|---|---|---|
| package | `package.json` | add only `.`, `./query`, `./package.json` export map |
| source | `src/index.ts` | additive exact-receipt and provisioner root exports |
| source | `src/core.ts` | `RawReceiptLookupPort` implementation; no command change |
| source | `src/raw-store.ts` | exact receipt/fingerprint, session list/get, provisioner-only internal schema seams |
| source | `src/revision-substrate.ts` | transaction migration seam and exact live validator, internal only |
| source | `src/ledger-hot-raw.ts` | transaction migration seam and exact live validator, internal only |
| new source | `src/isolated-context-provisioner.ts` | accepted v1 owner and its additive registry DDL |
| new source | `src/query.ts` | accepted read-only subpath |
| test | `test/raw-store.test.ts` | exact receipt/fingerprint and Raw non-regression |
| test | `test/core-boundary.test.ts` | Core/root/coexistence/privacy/package boundary |
| new test | `test/isolated-context-provisioner.test.ts` | provision contract and adversarial storage/concurrency |
| new test | `test/query.test.ts` | read-only surface, pagination, missing/closed/failure cases |

`package-lock.json` and all other paths are immutable. The internal registry DDL in the new provisioner file is
the only selected schema addition. No existing table/column, standalone schema, dependency or evaluation fixture is
writable.

## Slice plan and local completion gates

### S0 — identity guard

- Require exact clean baseline and Planning Gate ancestry.
- Resolve every evidence object and confirm it remains outside candidate ancestry.
- Capture baseline package fields, exact-nine command list, package-root export list and schema hashes.
- Stop on any unexpected worktree delta.

### S1 — Raw reconciliation

- Introduce one canonical immutable input-normalization boundary used by exact fingerprint/lookup.
- Add read-only session summary/list primitives without changing existing ingest/get-event/session-event outputs.
- Expose transaction-aware Raw migration and exact live validation only to the provisioner module.
- Focused gate: Raw receipt exact/retry/collision/corrupt/unavailable/concurrency tests plus existing Raw tests.

### S2 — provision registry composition

- Add registry DDL/trigger/version validation and deterministic identity/fingerprint framing.
- Reuse transaction-aware Raw/revision/hot-Raw seams in one outer transaction.
- Validate all dependency objects on preflight, create, replay and lookup, including live post-open tamper.
- Focused gate: create/replay/restart/lost-response, two-connection concurrency, rollback windows, collision,
  legacy/counterfeit/tamper/orphan/unavailable and zero-payload/zero-axis proofs.

### S3 — public Core/root exports

- Add only exact receipt method to `ContextCompilerCore`; do not add a `CONTEXT_COMPILER_COMMANDS` member.
- Add the exact accepted provisioner and exact-receipt symbols to `src/index.ts`.
- Compare baseline root exports and require an additive-only delta equal to the frozen symbol list.
- Focused gate: Core error mapping, root runtime/types, receipt forbidden-field recursion and exact-nine preservation.

### S4 — least-privilege query package

- Add `CoreReadQuery` and accepted DTO types.
- Add the three-entry `exports` map while retaining `main`, `types`, bins, files and package identity.
- Prove `./query` has exactly one runtime export and package-specifier deep imports of internal modules fail.
- Focused gate: page/keyset bounds, get/read/recall, no writes, closed instance and sanitized failure evidence.

### S5 — cross-surface coexistence

Use one fresh disposable database for provision/query/ingest/receipt/compile. Use a separate synthetic offline v2
evaluation input. Required assertions:

1. provision preflight is ready, create is `CREATED`, all three native identities are distinct/closed;
2. empty provisioned session is query-visible and has no event/state payload;
3. exact receipt is `NOT_FOUND` before ingest;
4. explicit-time/source-id ingest succeeds and exact proof is `FOUND_EXACT` with identical receipt coordinates;
5. exact ingest retry is idempotent and changed proof is `IDENTITY_COLLISION` without payload disclosure;
6. query exact/keyword recall sees only expected synthetic data;
7. existing `compile_context` succeeds without claiming canonical Snapshot semantics;
8. `runEvaluationSuiteV2` returns version 2 on a minimal valid synthetic suite; and
9. close/reopen preserves provision/receipt/query behavior while exact-nine and bins remain unchanged.

### S6 — artifact and handoff

- Run focused, relevant read-only compatibility, full test and build checks.
- Create one bounded source commit only after the diff exactly matches the allowlist.
- Produce dry-pack JSON and an actual tarball in a disposable directory; record SHA-256 and contents, never Git-add
  generated output.
- Probe source/dist/extracted package exports and forbidden subpaths without installing, publishing or networking.
- Write `docs/handoffs/PH1-CORE-REL-01.md` in a direct-child docs-only commit.

## Public export freeze

Package root receipt additions are exactly:

- `RAW_INGEST_FINGERPRINT_VERSION`;
- `EXACT_RAW_RECEIPT_LOOKUP_CAPABILITY_NAME`;
- `EXACT_RAW_RECEIPT_LOOKUP_VERSION`;
- `EXACT_RAW_RECEIPT_LOOKUP_STATUSES`;
- `RawReceiptLookupInputError`;
- `computeRawIngestFingerprint`;
- `getExactRawReceiptLookupCapability`;
- `ExactRawReceiptLookupCapability`, `ExactRawReceiptLookupStatus`,
  `FoundExactRawReceiptLookupResult`, `RawIngestFingerprintInput`,
  `RawIngestReceiptIdentity`, `RawReceiptLookupInput`, `RawReceiptLookupPort` and
  `RawReceiptLookupResult` (type-only where applicable).

Package root provisioner additions are exactly:

- `ISOLATED_CONTEXT_PROVISIONER_CAPABILITY`;
- `ISOLATED_CONTEXT_PROVISIONER_CONTRACT_VERSION`;
- `ISOLATED_CONTEXT_PROVISIONER_SCHEMA_VERSION`;
- `IsolatedContextProvisioner`, `IsolatedContextProvisionerError`;
- `IsolatedContextProvisionDisposition`, `IsolatedContextProvisionIdentity`,
  `IsolatedContextProvisionNamespace`, `IsolatedContextProvisionReceipt`,
  `IsolatedContextProvisionRequest`, `IsolatedContextProvisionerCapability`,
  `IsolatedContextProvisionerErrorCode` (type-only where applicable).

No Query symbol is exported from package root. No internal migration/validator or Store is newly exported from
package root. Existing baseline root exports may not be removed or renamed.

## Builder verification matrix

| Area | Minimum evidence |
|---|---|
| Git boundary | exact parent/Gate; allowed paths only; reference refs remain non-ancestors; `git diff --check` |
| Raw/receipt | all five statuses, explicit timestamp, every ingest field, hostile object graph, legacy/tamper, rollback/reopen/concurrency |
| provision | full public DTO/fingerprint, exact idempotency, operation/identity collision, no payload/axis, dependency live validation |
| query | bounded pagination, absence, state/recall, read-only runtime/type exports, closed/unavailable/corrupt fail-closed |
| coexistence | provision -> query -> ingest -> exact receipt -> recall -> compile, plus offline eval v2 |
| compatibility | exact-nine schemas/order, baseline root exports, bins, package identity, Raw/State/authority/evaluation non-drift |
| package | build; dry-pack JSON; actual tar SHA-256; manifest; public/forbidden import probes; no install/publish/network |
| privacy | recursive forbidden keys and errors; no payload/path/SQL/trace/stack/private data; no deep private export |
| full regression | `npm test`; `npm run build`; existing protocol/evaluation tests; no skipped test newly introduced |

## QA and submission

Fresh Core Module QA fixes the exact source and handoff commits and independently reconstructs adversarial cases
from the work order. It must not accept a branch name, moving ref, Builder test claim or packed artifact without
checking the exact digest. It writes only `docs/qa/PH1-CORE-REL-01.md` and returns either ACCEPT or RETURN.

Governance Submission QA begins only after Module-QA ACCEPT. It consumes the public package/digest and public
evidence, verifies the manifest identity/claim ceiling, and records selection or return. It cannot treat accepted
reference branches as integrated, cannot activate a Host, and cannot upgrade fresh-disposable evidence into
production readiness.

## Frozen UNKNOWN / CR boundary

- `getSession` absence remains the accepted source/QA behavior `undefined`; explicit `NOT_FOUND` requires a new
  interface CR.
- Query state remains the existing Context-State projection, not canonical authority or ContextSnapshot; a stronger
  projection requires a new scoped work order.
- Package stays `0.1.0`, private and unpublishable by this task; release/version changes require a release CR.
- Surface-local accepted errors remain; no common envelope is invented. Failure to sanitize public evidence is a
  Builder blocker, not permission to redesign all surfaces.
- Any additional source/test/schema/package/lock path, a tenth MCP tool, migration of existing schema, Provider/
  Host dependency, or install/network/deploy/live action is an immediate stop and Change Request.
