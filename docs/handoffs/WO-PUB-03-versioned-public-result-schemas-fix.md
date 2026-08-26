# WO-PUB-03 Builder Fix Handoff — Versioned Public Result Schemas

Status: **FIXED CANDIDATE / READY FOR FRESH INDEPENDENT RE-QA**

Gate commit: `34a72bb44d9eafef5b69b584347cf34362663465`

Original source candidate: `75bebf90a8a09aa110df685c8c371cd214d66d33`

Returned Independent QA: `ef3943c1d0a56c41b2da1c57c3e77c0a1d1d1013`

Fixed source candidate: `0f3bcb0d6414e447408612a919cb9a287a5e9c50`

Normative schema SHA-256:
`b3f6da99cc2b3be8e932a72e5e411ca2aad30c8c86df5df859f356a4e6e52d39`

## Bounded fix

The returned P1 showed that assignment into an ordinary object invoked the inherited `__proto__` setter and
silently removed a legal caller-owned JSON data key from public Raw metadata. The fixed candidate preserves the
existing plain-object result while creating every cloned member through an own enumerable data descriptor. It
therefore preserves root and nested `__proto__`, `constructor`, and other legal JSON member names without invoking
setters or accessors.

The fix changes only:

- `src/mcp-server.ts`;
- `test/mcp-protocol.test.ts`.

It does not change the frozen output schemas, tool list, input schemas, Raw/storage/query semantics, error codes,
database, package exports, Core internals, Host/Harness boundaries, deployment, or R8.

## Verification

- focused MCP protocol tests: **17/17 PASS**;
- full `npm test`: **587 passed / 1 skipped**;
- `npm run build`: **PASS**;
- isolated-cache production `npm pack --dry-run --json`: **PASS**, 83 files, no bundled dependencies;
- `git diff --check`: **PASS**.

The focused public stdio test now exercises lossless root and nested `__proto__` metadata through ingest success,
event/range/headline recall, keyword recall, legacy text JSON, and equal structured content. Fresh Independent QA
must independently repeat the returned counterexample and the original Gate acceptance matrix.

Builder does not approve this candidate. No deployment is authorized by this handoff.
