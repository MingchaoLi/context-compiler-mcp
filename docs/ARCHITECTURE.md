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

prepare_state_update
  -> validate current continuous raw suffix
  -> persist immutable snapshot identity + fingerprint
  -> return bounded provider-neutral extractor input

apply_state_delta
  -> parse complete untrusted delta before mutation
  -> revalidate preparation fingerprint + state revision in one SQLite transaction
  -> apply all deterministic reducer transitions or none

compile_context
  -> active state + dependency closure
  -> recent raw window + current input
  -> compiled snapshot + metrics

create_headline / recall_*
  -> immutable headline index
  -> exact raw evidence recovery

offline evaluation fixture
  -> D0 complete raw transcript
  -> D1 bounded recent transcript
  -> D2 existing assembler + labeled headline recall
  -> aggregate quality, reduction, and latency thresholds

explicit optional runtime update
  -> durable prepare
  -> one local JSON extractor child (provider owned outside core)
  -> strict State Delta validation
  -> atomic apply
```

## Modules

- `raw-store.ts`: durable raw evidence and token estimator.
- `state-types.ts`, `state-store.ts`, `reducer.ts`: explicit typed state and code-owned transitions.
- `state-update.ts`: durable preparation snapshots and revision-guarded atomic State Delta application.
- `extractor.ts`: provider-neutral transport interface and strict delta validation. No runtime provider is configured.
- `assembler.ts`: deterministic build-up assembly and debug manifest.
- `recall.ts`: headline storage, FTS keyword lookup, and exact evidence recovery.
- `evaluation.ts`, `evaluation-cli.ts`: strict provider-neutral D0/D1/D2 fixtures, metrics, thresholds, and JSON CLI. Evaluation uses isolated temporary databases and makes no model or network call.
- `subprocess-extractor.ts`: bounded one-shot local JSON transport. It invokes no shell and owns no provider, network, or credential configuration.
- `runtime-state-update.ts`: explicit library-only prepare/extract/apply composition. It is not called by compile, ingest, recall, or MCP dispatch.
- `mcp-service.ts`: sanitized nine-tool library service.
- `mcp-server.ts`: protocol schemas, stdio lifecycle, and protocol-pure process entry point.

## Boundaries and invariants

- Raw evidence is append-only; suppression never deletes it.
- A model may propose a delta, but code validates and owns the transition.
- Preparation identities are immutable; raw events may be appended after preparation, but prepared evidence and the expected state revision must still validate at apply time.
- Active constraints are assembled from known-active state, not guessed from pruning.
- Compact representations retain provenance and exact evidence remains recoverable.
- Compiler failure must be containable by an external host; this package never controls a host's fallback policy.
- The core performs no network requests and contains no UI or application-host imports.
