# WO-ST-01 independent QA

Date: 2026-08-23

Candidate: `af0b389358715e734a2fe6fe25319aa58c46206b`

Verdict: **PASS — ACCEPTED**

## Independence and scope

This QA reviewed the implementation independently from the implementation handoff and made no implementation changes. The starting checkout was `main` at the exact candidate commit above with a clean worktree. Review remained inside the standalone provider-neutral Context Compiler repository.

Environment actually exercised:

- macOS Darwin 25.5.0 arm64
- Node.js 25.6.1
- npm 11.9.0
- SQLite 3.51.2 through `node:sqlite`

## Acceptance evidence

### Exact inputs and stable failures

- Library entry points require exact top-level prepare/apply records. The complete ten-array Delta is parsed through the strict extractor parser before `BEGIN IMMEDIATE`; unknown root and nested fields are rejected.
- The real MCP `tools/list` response contains exactly nine tools. Recursive inspection found 13 object schemas under the two new tools, all with `additionalProperties: false`; their required and allowed top-level keys match the library contracts.
- Service and protocol failures contain only stable sanitized codes. Independent negative calls confirmed `INVALID_INPUT`, `NOT_FOUND`, and `CONFLICT` without echoing submitted evidence or identifiers.

### Preparation contract

- Independent checks exercised the inclusive 100-event bound and rejected empty/over-limit inputs in the maintained suite.
- Cross-session, reordered, duplicate, gapped, stale-suffix, missing, and extra-field inputs failed with the expected stable codes.
- Preparation executes while holding a SQLite write transaction, captures the supplied IDs in caller order, checks sequence continuity and the current maximum sequence, and persists the snapshot identity and SHA-256 fingerprint without marking state dirty.
- State revision and raw evidence were unchanged by preparation. Preparation rows survived connection replacement and SQLite triggers rejected direct update and delete attempts.

### Apply, atomicity, and retry behavior

- Apply parses and reference-checks the untrusted Delta before mutation work. It then uses one `BEGIN IMMEDIATE` transaction to recheck expected revision, reload the immutable preparation, rebuild the snapshot from prepared evidence, compare the fingerprint, run the reducer, advance revision when dirty, and commit.
- Raw events appended after preparation remained allowed and preserved. Direct state drift that deliberately left revision unchanged was independently injected; fingerprint revalidation returned `CONFLICT` before reducer writes and left revision/state otherwise unchanged.
- A legal empty Delta was repeatable with structurally identical results and no revision advance. A successful non-empty Delta advanced revision exactly once; retry returned a stable `CONFLICT` and created no duplicate state.
- The real protocol race uses two independent MCP processes/SQLite connections prepared at revision 0. Exactly one non-empty apply commits, the other returns `CONFLICT`, and the final state has revision 1 with one created item.
- Raw evidence update/delete attempts were rejected by the append-only SQLite triggers. Apply and preparation left raw rows unchanged.

### Compatibility and package isolation

- The complete suite passed all existing raw store, reducer, extractor, assembler, recall, service, and protocol behavior tests. The protocol suite called all nine tools over real stdio and verified the exact list.
- A real npm archive contained 35 expected entries, including `dist/state-update.js` and its declaration, and no `src/` or `test/` paths. After production-only pruning, Vitest and TypeScript were absent while the MCP SDK and Zod remained; the extracted package successfully ran health and the prepare/apply pipeline.
- `npm ls --omit=dev --all` passed. The MCP SDK's declared optional `@cfworker/json-schema` remains unmet and is not required by this stdio service.
- Credential, generated/database/log/archive, and host/provider/network/UI import scans reported no matches in the 38-file candidate tree. `git diff --check` passed.

## Executed verification

| Check | Result |
| --- | --- |
| `npm ci --no-audit --no-fund` | PASS; 146 packages restored |
| `npm test` | PASS; 8 files, 166 tests |
| `npm run build` | PASS |
| `npm run test:protocol` | PASS; 1 file, 8 tests |
| Independent library/service boundary script | PASS; 37 assertions |
| Independent real `tools/list` schema traversal | PASS; 9 tools, 13 exact object schemas |
| Real `npm pack` plus production-only isolated execution | PASS; 35 entries; packaged prepare/apply reached revision 1 |
| `npm pack --dry-run --json --ignore-scripts` | PASS; 35 entries |
| `npm ls --omit=dev --all` | PASS |
| Credential/host-import/generated-file scans | PASS; zero matches |
| `git diff --check` | PASS |

The dedicated 8 protocol tests are a rerun of the protocol file already included in the 166-test full suite; they are not counted as eight additional distinct tests.

## Defects

- P1: 0
- P2: 0
- P3: 0

## Remaining matrix risks

- Windows was not exercised by this QA run.
- Exact Node.js 24 was not exercised; the verified runtime was Node.js 25.6.1. Therefore neither Windows nor the Node 24 matrix is approved by inference.
- Immutable preparation records have no retention/compaction policy. This is a documented follow-up risk, not an ST-01 acceptance failure.

WO-ST-01 is accepted for the exercised matrix. ST-02 may proceed without adding a provider, network, host, or UI dependency to the core.
