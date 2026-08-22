# Architecture

## Data flow

```text
event producer
  -> ingest_event
  -> append-only raw_events (SQLite)

explicit state delta
  -> strict parser
  -> deterministic reducer
  -> context_items / state_relations (SQLite)

compile_context
  -> active state + dependency closure
  -> recent raw window + current input
  -> compiled snapshot + metrics

create_headline / recall_*
  -> immutable headline index
  -> exact raw evidence recovery
```

## Modules

- `raw-store.ts`: durable raw evidence and token estimator.
- `state-types.ts`, `state-store.ts`, `reducer.ts`: explicit typed state and code-owned transitions.
- `extractor.ts`: provider-neutral transport interface and strict delta validation. No runtime provider is configured.
- `assembler.ts`: deterministic build-up assembly and debug manifest.
- `recall.ts`: headline storage, FTS keyword lookup, and exact evidence recovery.
- `mcp-service.ts`: sanitized seven-tool library service.
- `mcp-server.ts`: protocol schemas, stdio lifecycle, and protocol-pure process entry point.

## Boundaries and invariants

- Raw evidence is append-only; suppression never deletes it.
- A model may propose a delta, but code validates and owns the transition.
- Active constraints are assembled from known-active state, not guessed from pruning.
- Compact representations retain provenance and exact evidence remains recoverable.
- Compiler failure must be containable by an external host; this package never controls a host's fallback policy.
- The core performs no network requests and contains no UI or application-host imports.
