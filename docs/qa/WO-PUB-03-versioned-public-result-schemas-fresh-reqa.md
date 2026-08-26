# WO-PUB-03 Fresh Independent re-QA — Versioned Public Result Schemas

Status: **PASS / ACCEPTED**

Gate commit: `34a72bb44d9eafef5b69b584347cf34362663465`

Original source candidate: `75bebf90a8a09aa110df685c8c371cd214d66d33`

Returned Independent QA: `ef3943c1d0a56c41b2da1c57c3e77c0a1d1d1013`

Fixed source candidate: `0f3bcb0d6414e447408612a919cb9a287a5e9c50`

Fixed Builder handoff: `21175b3c1d572a03c21f13d515f7fb50d79d438a`

Planning baseline: `2f3e590c24a35e1bc89deffbc3a5c6056078adfa`

Normative schema SHA-256:
`b3f6da99cc2b3be8e932a72e5e411ca2aad30c8c86df5df859f356a4e6e52d39`

## Verdict

The append-only fixed candidate closes the returned lossless-metadata defect without changing the frozen
schemas, tool set, input contracts, Raw/storage/query semantics, or public error contract. Independent dynamic
reproduction confirmed that legal caller-owned JSON keys named `__proto__` are retained at both root and nested
metadata positions through ingest, all recalled-Raw paths, legacy text JSON, and equal structured content.

The original Gate acceptance matrix, full regression suite, build, and production-only package checks also pass.
The fixed source candidate is accepted. This QA result does not authorize deployment.

## Returned finding closure

### P1 — Generic JSON metadata silently lost `__proto__` data keys: CLOSED

The fix defines each cloned JSON object member as an own enumerable writable/configurable data property. It does
not assign through an inherited property and therefore does not invoke the legacy `__proto__` setter. Accessor
inputs remain rejected by the existing descriptor-based reads.

Fresh isolated reproduction used a new temporary Core database and this non-private synthetic value:

```json
{
  "__proto__": { "retained": true },
  "nested": { "__proto__": { "retained": "nested" } },
  "constructor": { "prototype": "data" }
}
```

Independent results:

- `ingest_event` public metadata owns root `__proto__`: PASS;
- `ingest_event` public metadata owns nested `__proto__`: PASS;
- exact event, range, and headline recall preserve both keys: 3/3 PASS;
- keyword recall preserves both keys: PASS;
- `constructor` / `prototype` remains ordinary caller data: PASS;
- serialized metadata is value-identical to the input JSON: PASS;
- each scoped success has `structuredContent` deeply equal to parsed legacy `content[0].text`: PASS.

## Identity and bounded delta

- All five pinned commits resolve to the exact full identities above: PASS.
- Gate is the direct parent of the original source candidate: PASS.
- Returned QA remains append-only in the ancestry before the fixed source candidate: PASS.
- Fixed source candidate is the direct parent of the fixed handoff: PASS.
- Fixed source delta contains exactly `src/mcp-server.ts` and `test/mcp-protocol.test.ts`: PASS.
- Fixed handoff commit contains exactly its new handoff document: PASS.
- `git diff --check` for Gate through fixed source candidate: PASS.
- Normative schema and work-order hashes match repository authority: PASS.
- Worktree was clean before creation of this report: PASS.

## Public protocol and schema authority

The Gate commit was independently exported and built in an isolated temporary directory. Its runtime
`tools/list` was compared with the fixed candidate:

- exactly nine tools, same order and names: PASS;
- all nine descriptions and input schemas deeply identical to the Gate: PASS;
- only `ingest_event`, `compile_context`, `recall_exact`, and `recall_keyword` publish `outputSchema`: PASS;
- each of the four output roots and its embedded `$defs` are deeply equal to the normative v1 authority: PASS;
- normative root and all four runtime output schemas compile with strict Ajv 2020-12: PASS.

Using a fresh temporary Core database and real in-memory MCP transport, the following values validated against
the normative root schema: ingest; compile; exact event found/missing; range found/missing; headline
found/missing; keyword found/empty. Result: **10/10 PASS**. For every scoped success, structured content equals
the parsed legacy text envelope.

Additional contract checks:

- ingest preserves optional Dense while all recalled Raw omits Dense: PASS;
- compile context remains exactly four fields and metrics exactly nine fields: PASS;
- a sanitized public error validates against the root authority, has `isError=true`, and no structured content:
  PASS;
- unscoped tools remain legacy text-only: PASS.

## Fail-closed and public result boundary

Independent fake-service injections across all four scoped tools confirmed:

- future result/Raw/headline/metric fields are projected away: PASS;
- malformed scoped successes become code-only `INTERNAL_FAILURE`: PASS;
- malformed and failure results have no structured content: PASS;
- public errors contain only a frozen error code: PASS.

No candidate/ranking/score, debug/manifest, trace, path, storage identity, or future internal field was observed
in the scoped public projections.

## Commands

- `npm run test:protocol`: **17/17 PASS**.
- `npm test`: **37 files passed, 1 skipped; 587 tests passed, 1 skipped**.
- `npm run build`: **PASS**.
- isolated-cache `npm pack --dry-run --json`: **PASS**, 83 production files, zero bundled dependencies.
- candidate/Gate diff and `git diff --check`: **PASS**.

## Environment and boundaries

- macOS / Darwin 25.5.0 arm64.
- Node.js `v25.6.1`; npm `11.9.0`.
- Exact Node.js 24 and Windows were not independently exercised.
- No network, model, provider, credential, QA-only artifact, Case, Gold, Evidence, mapping, deployment, or R8
  access was used.

## Final disposition

**PASS / ACCEPTED.** The returned P1 is independently closed and the original public-schema publication
acceptance matrix remains satisfied. WO-PUB-03 may be recorded as accepted at fixed source candidate
`0f3bcb0d6414e447408612a919cb9a287a5e9c50`; deployment remains a separate authority decision.
