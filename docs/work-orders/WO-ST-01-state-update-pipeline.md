# WO-ST-01 — Model-independent state update pipeline

Status: IMPLEMENTED — PENDING INDEPENDENT QA

Implementation handoff: `docs/handoffs/WO-ST-01-state-update-pipeline.md`

## Result

Add standalone `prepare_state_update` and `apply_state_delta` library operations and MCP tools without selecting or calling a model. An external caller can request a bounded evidence snapshot, obtain a candidate delta elsewhere, and atomically apply that delta against the prepared snapshot.

## Allowed scope

- Core types and a dedicated state-update coordinator under `src/`.
- SQLite state/raw store transaction primitives required for atomic validation.
- MCP service/server schemas for exactly the two new tools.
- Focused tests, protocol tests, documentation, and this work order's handoff.
- Dependency changes only if separately justified and approved before implementation.

No host adapters, UI, orchestration frameworks, model/network calls, automatic headlines, evaluation runner, or formal compiler mode.

## Contract

### Prepare

- Input is a session and bounded newest raw-event IDs.
- IDs are unique, ordered, continuous within that session, and must be the current suffix at preparation time.
- Return an opaque preparation token/fingerprint, expected state revision, and only the bounded data required by an external extractor.
- Preparation does not mutate state.

### Apply

- Accept the preparation identity and an untrusted delta payload.
- Allow raw events to be appended after preparation, but prove the prepared suffix evidence itself has not changed and rebuild/verify its fingerprint.
- Strictly parse the complete delta before opening mutation work.
- Check expected state revision inside the same SQLite transaction as reducer application.
- Apply all reducer transitions atomically or none.
- An empty valid delta is idempotent. Retrying a successful non-empty delta returns a stable conflict.

## Acceptance

- Library and MCP schemas are exact and reject unknown fields.
- Cross-session, reordered, duplicated, gapped, stale, malformed, and tampered preparation/apply inputs fail with sanitized stable errors.
- Concurrent independent SQLite connections cannot both commit a conflicting non-empty update at one revision.
- Raw evidence remains append-only and unchanged by both operations.
- Existing seven tools remain behavior-compatible; the server lists nine only after this work order is implemented.
- Unit, service, real stdio protocol, packaged isolation, full test, build, package dry-run, credential, generated-file, and host-import checks pass.

Implementation requires an append-only commit and independent QA; the implementer must not self-approve.
