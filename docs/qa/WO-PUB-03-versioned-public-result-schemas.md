# WO-PUB-03 Independent QA — Versioned Public Result Schemas

Status: **FAIL / RETURN TO IMPLEMENTATION**

Gate commit: `34a72bb44d9eafef5b69b584347cf34362663465`

Source candidate: `75bebf90a8a09aa110df685c8c371cd214d66d33`

Builder handoff commit: `5c5e29cee51857809fc71c416aeddf71a0701c26`

Planning baseline: `2f3e590c24a35e1bc89deffbc3a5c6056078adfa`

Normative schema SHA-256:
`b3f6da99cc2b3be8e932a72e5e411ca2aad30c8c86df5df859f356a4e6e52d39`

## Verdict

The candidate passes the ordinary schema-publication, exact-surface, regression, build, and package checks,
but it changes a previously valid generic Raw metadata value at the public MCP boundary. A JSON object member
named `__proto__` is silently removed by the new recursive public projection, including at nested object
positions. The Core/library value remains intact, so this is an MCP publication regression introduced by this
candidate.

This violates the frozen requirements that generic caller-owned metadata retain the JSON object value domain,
that existing legacy text JSON remain value-identical, and that this work order not change Raw/result semantics.
The source candidate is therefore not accepted.

## Finding

### P1 — Generic JSON metadata silently loses `__proto__` data keys

`cloneJsonValue` creates an ordinary `{}` result and copies each key with assignment. For the legal JSON key
`__proto__`, that assignment invokes the inherited legacy setter instead of creating an enumerable own data
property. JSON serialization then omits the key. The same failure repeats recursively.

Independent isolated reproduction used a fresh temporary Core database and non-private synthetic metadata:

```json
{
  "__proto__": { "retained": true },
  "nested": { "__proto__": { "retained": "nested" } },
  "constructor": { "prototype": "data" }
}
```

Observed mechanically:

```text
Core ingest result metadata owns root __proto__:       true
Core ingest result metadata owns nested __proto__:     true
public recall result metadata owns root __proto__:     false
public recall result metadata owns nested __proto__:   false
public constructor/prototype data:                     retained
```

The same projector is used by `ingest_event`, `recall_exact`, and `recall_keyword`, so the defect is not
limited to one recall variant. The normative `json_object` schema intentionally permits arbitrary JSON member
names; dropping a legal member is not a closed-output sanitization operation.

Return condition: append-only source/test fix must preserve every legal caller-owned JSON data key, including
root and nested `__proto__`, without permitting accessor/prototype execution or weakening the existing
finite/plain/lossless validation. Fresh Independent re-QA must repeat both ingest and recalled-Raw public paths.

## Passing evidence

### Identity and exact surface

- Gate is an ancestor of the exact source candidate: PASS.
- Source parent is the Gate commit: PASS.
- Handoff parent is the source candidate: PASS.
- Gate-to-source delta contains exactly `src/mcp-server.ts` and `test/mcp-protocol.test.ts`: PASS.
- Gate/schema/work-order identities and hashes match repository authority: PASS.
- Worktree was clean before creation of this report: PASS.
- `git diff --check` for the source range: PASS.

### Public protocol and schema authority

- Independently built the Gate commit in an isolated temporary copy and compared runtime `tools/list`: all
  nine names, order, descriptions, and input schemas are deeply identical: PASS.
- Exactly four tools publish `outputSchema`, in existing tool order:
  `ingest_event`, `compile_context`, `recall_exact`, `recall_keyword`: PASS.
- Each of the four output roots and every embedded `$defs` entry is deeply equal to the normative schema
  authority: PASS.
- Strict Ajv 2020-12 compilation of the normative schema: PASS.
- Real in-memory MCP calls validated ten success variants against the root authority: ingest; compile; exact
  event found/missing; range found/missing; headline found/missing; keyword found/empty: 10/10 PASS.
- For those scoped successes, `structuredContent` deeply equals parsed `content[0].text`: 10/10 PASS.
- Ingest preserves its optional Dense value; exact and keyword recall omit Dense: PASS.
- A sanitized public error validates against the root authority, has `isError=true`, and has no
  `structuredContent`: PASS.

### Fail-closed and result boundary

- Independent fake-service injection across all four scoped tools discards future fields: PASS.
- Malformed successes become code-only `INTERNAL_FAILURE` with no `structuredContent`: PASS.
- Failure envelopes discard non-contract fields and retain only a frozen code: PASS.
- Existing candidate tests cover closed compile projection, Dense separation, all ordinary recall shapes,
  timestamp replay, cardinality, and production-only package execution: PASS.

### Commands

- `npm run test:protocol`: 17/17 PASS.
- `npm test`: 37 files passed, 1 skipped; 587 tests passed, 1 skipped.
- `npm run build`: PASS.
- isolated-cache `npm pack --dry-run --json`: PASS; 83 production files, no bundled dependencies.
- final pre-report worktree hygiene: clean.

## Environment and boundaries

- macOS / Darwin 25.5.0 arm64.
- Node.js `v25.6.1`; npm `11.9.0`.
- Exact Node.js 24 and Windows were not independently exercised.
- No network, model, provider, credential, QA-only artifact, Case, Gold, Evidence, mapping, deployment, or R8
  access was used.

## Final disposition

**FAIL / RETURN TO IMPLEMENTATION.** All passing evidence remains valid, but it cannot override the reproduced
lossless-metadata compatibility failure. A new append-only fixed candidate and fresh Independent re-QA are
required.
