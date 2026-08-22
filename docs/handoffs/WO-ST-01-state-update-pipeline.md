# WO-ST-01 implementation handoff

Date: 2026-08-23
Status: implementation candidate; independent QA required

## Result

The standalone library and stdio MCP service now expose provider-neutral `prepare_state_update` and `apply_state_delta` operations. The candidate server lists exactly nine tools. No extractor provider, network call, host adapter, automatic headline generation, evaluation runner, or formal host mode was added.

## Contract implemented

- Preparation accepts one session and 1–100 unique ordered raw-event IDs. The events must be continuous and end at the session's current raw suffix while the SQLite write lock is held.
- Preparation stores an immutable random token plus a SHA-256 fingerprint over the expected state revision, visible state, relevant relations/provenance, and selected newest events. It does not advance state revision or modify raw evidence.
- Apply requires the session, token, fingerprint, expected revision, and complete untrusted ten-array State Delta.
- The full Delta is parsed by the existing strict parser before mutation begins. Unknown fields, malformed arrays, illegal references, and reducer-incompatible conflicts are rejected with stable sanitized codes.
- Apply uses `BEGIN IMMEDIATE`, re-reads the immutable preparation, rebuilds the fingerprint, and checks the expected revision in the same transaction as reducer execution.
- Raw events appended after preparation are allowed. Changed prepared evidence, direct state drift, or a committed competing state update produces `CONFLICT`.
- Empty valid Deltas leave revision unchanged and can be retried. A successful non-empty Delta advances revision once, so its retry is a stable conflict.
- Preparation records and raw evidence are protected against update/delete at the SQLite boundary.

## Main changes

- Added `src/state-update.ts` with the coordinator, public library operations, strict runtime input validation, snapshot construction, fingerprinting, and stable error categories.
- Added immutable preparation storage, prepared raw reads, and revision-guarded transaction support to `src/state-store.ts`.
- Added reducer execution inside an already-open guarded transaction without changing the existing `StateReducer.apply` behavior.
- Added strict object-payload parsing through the existing State Delta parser.
- Added exact nested MCP JSON schemas and service routing for the two new tools.
- Added focused state-update tests, service coverage, real nine-tool stdio calls, and a two-process conflicting-apply race.
- Updated README, architecture, decision register, project state, roadmap, and the work-order status.

## Verification

- `npm ci --no-audit --no-fund` — passed; 146 packages restored from the lockfile.
- `npm test` — passed; 8 files, 166 tests.
- `npm run build` — passed.
- `npm run test:protocol` — passed; 8 protocol tests, including real calls to all nine tools, production-only packaged isolation, child shutdown, and two independent MCP processes racing the same revision.
- `npm pack --dry-run --json --ignore-scripts --cache .cache/npm-pack` — passed; 35 expected package entries, including the new runtime module and declarations.
- `npm ls --omit=dev --all` — passed; only the declared MCP SDK and Zod runtime roots are present. The SDK's optional `@cfworker/json-schema` dependency remains intentionally unmet.
- `git diff --check` — passed.
- Source/test/package host-import scan — no matches.
- Credential-pattern scan — no credential material found.
- Generated/database/log scan — `dist`, `.cache`, and `node_modules` remain ignored and untracked; no tracked database, sidecar, log, tarball, or generated output was added.

## Independent QA focus

- Re-run the full and protocol suites from a clean dependency installation and inspect the exact two new JSON schemas.
- Reconfirm cross-session, duplicate, reordered, gapped, stale, malformed, tampered, and post-prepare-append behavior.
- Reconfirm the two-process race produces exactly one successful non-empty update at the prepared revision.
- Inspect the package from a real `npm pack` archive and production-only dependency tree.
- Write the independent result under `docs/qa/`; the implementer has not approved this candidate.

## Remaining risks and gaps

- This run used Node.js 25.6.1 on macOS. The Node 24 and Windows matrix was not separately rerun.
- Immutable preparation records currently have no retention/compaction policy; one requires a separate bounded work order if storage growth becomes material.
- Runtime extractor transport, automatic state evolution, automatic headline generation, ST-02 evaluation, and formal host mode remain absent by design.
