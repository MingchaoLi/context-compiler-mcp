# PH1-CORE-REL-01 Module-owner Planning Handoff

Status: `PLANNING GATE COMPLETE / BUILDER NOT STARTED / NOT A QA DISPOSITION`

## Exact planning context

- Role: Core Module Owner.
- Task Capsule: `PH1-CORE-REL-01-MODULE-PLAN` materialized v1.0.0.
- Worktree: isolated `codex/ph1-core-rel-01`.
- Exact planning baseline: `f07257044e458d2edaad7821a95e3f9b9d18d63b`.
- Baseline parent: `4f5ca568d344d48f7f8f178b3ef3f975cc0ad13c`.
- Planning Gate: the single docs-only commit containing this handoff, the frozen work order and the module plan;
  the controller must resolve and transmit its exact SHA before any Builder activation.

The task cold-started from Git, repository authority files, the unique current work order, the materialized Capsule
and its two required phase-one architecture artifacts. No chat summary or accepted branch was treated as an
integrated baseline.

## Reference evidence disposition

The three required reconciliations were resolved as immutable Git objects and found outside baseline ancestry:

- Query: `1b3bae4d6e69ab9dcefb60d1429929162023b833`, accepted source
  `9eca7397077233b83b4ff1ad2f1ab19d981e615f`.
- Provisioner: `553ebdd32512387accf385ca8163c1e2f5394642`, accepted final source fix
  `b2486d23fbf436dd62e8bb55876a472821725efe`.
- Exact receipt: `a85eab8eb69dab73042a0434398345f89dbd5179`, accepted final source fix
  `d6584124d827f8e287635fe0009bd76236c9040f`.

No merge, cherry-pick, rebase, ref movement, patch application, source copy or branch-union claim occurred. The
planning docs explicitly require manual behavior reconciliation onto the exact baseline.

## Frozen result

The smallest design is one existing `context-compiler-mcp@0.1.0` package with:

- unchanged baseline package root, exact-nine MCP, ingest, compile and offline evaluation;
- additive package-root exact Raw receipt v1 and isolated provisioner v1;
- one least-privilege `context-compiler-mcp/query` subpath whose only runtime export is `CoreReadQuery`; and
- exact commit/tarball SHA-256 artifact identity without publish, install or deployment.

No composite facade, tenth MCP tool, Host adapter, provider, new dependency, lock change, evaluation change or
existing-schema mutation is planned.

## Exact later implementation allowlist

Production/package:

- `package.json`;
- `src/index.ts`;
- `src/core.ts`;
- `src/raw-store.ts`;
- `src/revision-substrate.ts`;
- `src/ledger-hot-raw.ts`;
- new `src/isolated-context-provisioner.ts`; and
- new `src/query.ts`.

Tests:

- `test/raw-store.test.ts`;
- `test/core-boundary.test.ts`;
- new `test/isolated-context-provisioner.test.ts`; and
- new `test/query.test.ts`.

Later Builder handoff: `docs/handoffs/PH1-CORE-REL-01.md`. Everything else, especially lockfile, MCP source,
evaluation source/artifacts, existing schema documents, README and generated output, is immutable. The provisioner
registry DDL is confined to its new owner file.

## Builder Gate summary

One temporary Builder may be activated only by the controller after accepting this Planning Gate. The Builder must
complete the frozen S0–S6 slices, make one initial bounded source commit, run focused/full/build/dry-pack/actual-pack
checks, freeze the tarball SHA-256 and create a direct-child docs-only handoff. It cannot self-approve.

The required integration test walks a disposable target through provision, empty query, explicit-time ingest,
exact receipt, recall, compile and offline evaluation v2, then covers replay/collision/restart/corruption/
unavailability/privacy. Existing exact-nine MCP and baseline exports must remain unchanged except for the exact
additive root symbols and `./query` export.

## UNKNOWN / CR record

- Accepted query prose conflicts with accepted source/QA on missing `getSession`; the plan preserves the tested
  `undefined` signature and requires a separate CR for explicit `NOT_FOUND`.
- Query state is the existing Context-State/get_state projection, not canonical authority or ContextSnapshot.
- No phase-one semver/publish decision exists; package remains private `0.1.0` and is bound by commit plus tar SHA.
- No common error envelope was selected; each accepted surface keeps its local failure contract and must pass
  payload/path/SQL/trace sanitization checks.

Any contrary requirement, extra path, existing-schema migration, tenth tool or Host/provider/install/network/live
action stops implementation and requires a Change Request.

## Planning-attempt verification

- Only the three Capsule-allowlisted documentation paths are changed.
- No source, test, schema, package or lock file is changed.
- No Builder, Module QA or Submission QA has started.
- Module-owner planning is not implementation acceptance and not a governance selection decision.
