# WO-PUB-03 Builder Handoff — Versioned Public Result Schemas

Status: BUILDER CANDIDATE / AWAITING FRESH INDEPENDENT QA

Gate commit: `34a72bb44d9eafef5b69b584347cf34362663465`

Source candidate: `75bebf90a8a09aa110df685c8c371cd214d66d33`

Source parent: `34a72bb44d9eafef5b69b584347cf34362663465`

Planning baseline: `2f3e590c24a35e1bc89deffbc3a5c6056078adfa`

Normative schema SHA-256:
`b3f6da99cc2b3be8e932a72e5e411ca2aad30c8c86df5df859f356a4e6e52d39`

## Candidate surface

The Gate-to-source range changes exactly:

- `src/mcp-server.ts`;
- `test/mcp-protocol.test.ts`.

No package, lockfile, README, Core command/storage/schema, database migration, runtime, Host, Adapter,
deployment or R8 path changed.

## Delivered result

- Exactly `ingest_event`, `compile_context`, `recall_exact`, and `recall_keyword` publish a closed
  `outputSchema` through `tools/list`.
- Each published output root and every embedded `$defs` entry is mechanically equal to the corresponding
  definition in the frozen repository JSON Schema authority.
- Successful calls for those four tools return `structuredContent` parsed from the same serialized bytes as
  legacy `content[0].text`; the two representations are therefore value-identical.
- Errors retain the existing `isError` plus code-only text envelope and do not return `structuredContent`.
- The other five tools publish no `outputSchema` and return no `structuredContent`.
- The four scoped result projections are closed and deterministic. Future internal fields are discarded;
  malformed success values fail closed as `INTERNAL_FAILURE`.
- Ingest success may publish the existing optional Dense value. Exact and keyword recall always project Raw
  without Dense. Generic metadata remains caller-owned JSON.
- Tool count, order, names, descriptions, input schemas and existing result/query semantics are unchanged.

## Builder verification

- output-schema vs frozen JSON authority deep comparison: PASS;
- real MCP client automatic output-schema validation: PASS;
- focused `npm run test:protocol`: 17/17 PASS;
- full `npm test`: 37 files PASS, 1 file skipped; 587 tests PASS, 1 skipped;
- `npm run build`: PASS;
- production-only `npm pack --dry-run --json` with isolated npm cache: PASS, 83 files;
- `git diff --check`: PASS;
- source candidate worktree after commit: clean.

No model, provider, network, credential, QA-only artifact, QA Case/Gold/Evidence/mapping or deployment was
used. Builder does not approve this candidate.

## Independent QA focus

Fresh QA should pin the exact source candidate and independently verify:

1. ancestry and the exact two-path Gate-to-source surface;
2. exact-nine tool/name/order/input-schema stability and output schema on only the four scoped tools;
3. byte-parsed equality of legacy text JSON and `structuredContent` for all success variants;
4. event/range/headline missing and found variants, keyword bounds, Dense ingest/recall separation and
   compile closed projection;
5. future-field discard plus malformed success and error-envelope fail-closed behavior;
6. production-only package, full regression, build and diff hygiene.
