import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  ContextCompilerMcpService,
  createEmptyStateDelta,
  ExperienceLedgerError,
  RuntimeStateUpdater,
  StateReducer,
  SqliteContextStateStore,
  SqliteExperienceLedgerStore,
  SqliteRawHistoryStore,
} from "../src/index.js";

const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe("operational compile MCP integration", () => {
  it("persists caller Dense vectors and rejects malformed or conflicting retries", () => {
    const database = databasePath();
    let store = new SqliteRawHistoryStore(database);
    const event = store.ingest({
      session_id: "dense", role: "user", content: "vectorized", source_event_id: "source",
      dense_embedding: { vector_space_id: "embedding-v1", values: [0, 1, 0.25] },
    });
    expect(event.dense_embedding).toEqual({ vector_space_id: "embedding-v1", values: [0, 1, 0.25] });
    store.close();
    store = new SqliteRawHistoryStore(database);
    expect(store.getEvent(event.id)?.dense_embedding).toEqual(event.dense_embedding);
    expect(() => store.ingest({
      session_id: "dense", role: "user", content: "vectorized", source_event_id: "source",
      dense_embedding: { vector_space_id: "embedding-v2", values: [0, 1, 0.25] },
    })).toThrow(/conflicts with existing raw evidence/);
    expect(() => store.ingest({
      session_id: "dense", role: "user", content: "bad",
      dense_embedding: { vector_space_id: "v", values: [Number.NaN] },
    })).toThrow(/finite lossless/);
    store.close();
  });

  it("migrates a pre-Dense raw table without rewriting legacy rows", () => {
    const database = databasePath();
    const direct = new DatabaseSync(database);
    direct.exec(`
      CREATE TABLE sessions (id TEXT PRIMARY KEY, created_at TEXT NOT NULL);
      CREATE TABLE raw_events (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL REFERENCES sessions(id),
        seq INTEGER NOT NULL,
        source_event_id TEXT,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        event_type TEXT NOT NULL,
        created_at TEXT NOT NULL,
        token_count INTEGER NOT NULL,
        metadata_json TEXT NOT NULL DEFAULT '{}',
        UNIQUE (session_id, seq),
        UNIQUE (session_id, source_event_id)
      );
      INSERT INTO sessions VALUES ('legacy', '2026-08-24T00:00:00.000Z');
      INSERT INTO raw_events VALUES (
        'legacy-event', 'legacy', 1, 'legacy-source', 'user', 'preserve bytes',
        'message', '2026-08-24T00:00:00.000Z', 3, '{"legacy":true}'
      );
    `);
    direct.close();
    const store = new SqliteRawHistoryStore(database);
    expect(store.getEvent("legacy-event")).toMatchObject({
      content: "preserve bytes", metadata: { legacy: true },
    });
    expect(store.getEvent("legacy-event")?.dense_embedding).toBeUndefined();
    store.close();
    const audit = new DatabaseSync(database);
    expect((audit.prepare("PRAGMA table_info(raw_events)").all() as Array<{ name: string }>)
      .map(({ name }) => name)).toContain("dense_embedding_json");
    expect(audit.prepare(
      "SELECT content, metadata_json, dense_embedding_json FROM raw_events WHERE id = 'legacy-event'"
    ).get()).toEqual({ content: "preserve bytes", metadata_json: '{"legacy":true}', dense_embedding_json: null });
    audit.close();
  });

  it("keeps no-operation compiles read-only and atomically idempotent-traces operation compiles", () => {
    const database = databasePath();
    const service = new ContextCompilerMcpService(database);
    for (let index = 1; index <= 9; index += 1) {
      unwrap(service.call("ingest_event", {
        session_id: "trace", role: "user",
        content: index === 1 ? "old needle" : `raw ${index}`,
        source_event_id: `source-${index}`,
      }));
    }
    const state = new SqliteContextStateStore(database);
    const beforeRevision = state.getRevision("trace");
    state.close();
    const ledger = new SqliteExperienceLedgerStore(database);
    const raw = new SqliteRawHistoryStore(database);
    const beforeRaw = raw.getSessionEvents("trace");
    const mirrorCount = ledger.getSessionRecords("trace").length;

    const noTrace = unwrap(service.call("compile_context", {
      session_id: "trace", current_input: "needle", recent_raw_window_turns: 1,
    })) as any;
    expect(noTrace.context.retrieved_history.map(({ id }: { id: string }) => id)).toEqual([]);
    expect(noTrace.context.operational_debug.dormancy_enabled).toBe(false);
    expect(ledger.getSessionRecords("trace")).toHaveLength(mirrorCount);

    const request = {
      session_id: "trace", current_input: "PRIVATE_CURRENT_TEXT_91 needle",
      recent_raw_window_turns: 1, operation_id: "compile-op-1",
      context_policy: { candidate_turn_multiplier: 8, retrieval_limit: 2 },
    };
    const first = unwrap(service.call("compile_context", request)) as any;
    const afterFirst = ledger.getSessionRecords("trace");
    const trace = afterFirst.find((record) => record.kind === "CONTEXT_COMPILE")!;
    expect(first.context.operational_debug.compile_trace_id).toBe(trace.id);
    expect(first.context.retrieved_history.map(({ id }: { id: string }) => id)).toEqual([beforeRaw[0]!.id]);
    expect(afterFirst.filter((record) => record.kind === "RETRIEVAL_HIT")).toHaveLength(1);
    expect(JSON.stringify(trace.payload)).not.toContain("PRIVATE_CURRENT_TEXT_91");
    expect(Object.keys(trace.payload).sort()).toEqual([
      "current_input_sha256", "dense_availability", "dormant_state_ids", "hit_count",
      "hits_sha256", "mode", "normalized_input_sha256", "operation_id", "policy",
      "policy_version", "raw_boundary_max_seq", "raw_event_count", "raw_sha256",
      "reactivated_state_ids", "recent_event_ids", "result_sha256", "retrieved_event_ids",
      "selected_state_ids", "state_revision", "state_sha256",
    ]);

    const retry = unwrap(service.call("compile_context", request)) as any;
    expect(retry.context.operational_debug.compile_trace_id).toBe(trace.id);
    expect(ledger.getSessionRecords("trace")).toHaveLength(afterFirst.length);
    expect(service.call("compile_context", { ...request, current_input: "different" }))
      .toEqual({ ok: false, error: { code: "CONFLICT" } });
    expect(service.call("compile_context", {
      session_id: "trace", current_input: "needle", recent_raw_window_turns: 1,
    })).toEqual({ ok: false, error: { code: "INVALID_INPUT" } });

    expect(raw.getSessionEvents("trace")).toEqual(beforeRaw);
    const stateAfter = new SqliteContextStateStore(database);
    expect(stateAfter.getRevision("trace")).toBe(beforeRevision);
    stateAfter.close();
    raw.close();
    ledger.close();
    service.close();
  });

  it("rejects baseline-following no-id compiles before any raw/state/ledger mutation", () => {
    const database = databasePath();
    const service = new ContextCompilerMcpService(database);
    const first = unwrap(service.call("ingest_event", {
      session_id: "telemetry-gap", role: "user", content: "baseline",
    })) as { id: string };
    unwrap(service.call("compile_context", {
      session_id: "telemetry-gap", current_input: "start", recent_raw_window_turns: 1,
      operation_id: "baseline",
    }));
    const second = unwrap(service.call("ingest_event", {
      session_id: "telemetry-gap", role: "user", content: "durable goal evidence",
    })) as { id: string };
    const state = new SqliteContextStateStore(database);
    new StateReducer(state).apply("telemetry-gap", {
      ...createEmptyStateDelta(),
      new_goals: [{ content: "durable goal", source_refs: [second.id] }],
    });
    state.close();
    for (let index = 3; index <= 17; index += 1) {
      unwrap(service.call("ingest_event", {
        session_id: "telemetry-gap", role: "user", content: `turn ${index}`,
      }));
    }
    const audit = new DatabaseSync(database);
    const before = {
      raw: audit.prepare("SELECT COUNT(*) AS count FROM raw_events WHERE session_id = ?")
        .get("telemetry-gap"),
      ledger: audit.prepare("SELECT COUNT(*) AS count FROM experience_ledger WHERE session_id = ?")
        .get("telemetry-gap"),
      revision: audit.prepare("SELECT revision FROM context_state_revisions WHERE session_id = ?")
        .get("telemetry-gap"),
    };
    expect(first.id).not.toBe(second.id);
    expect(service.call("compile_context", {
      session_id: "telemetry-gap", current_input: "durable goal", recent_raw_window_turns: 1,
    })).toEqual({ ok: false, error: { code: "INVALID_INPUT" } });
    expect({
      raw: audit.prepare("SELECT COUNT(*) AS count FROM raw_events WHERE session_id = ?")
        .get("telemetry-gap"),
      ledger: audit.prepare("SELECT COUNT(*) AS count FROM experience_ledger WHERE session_id = ?")
        .get("telemetry-gap"),
      revision: audit.prepare("SELECT revision FROM context_state_revisions WHERE session_id = ?")
        .get("telemetry-gap"),
    }).toEqual(before);
    audit.close();
    service.close();
  });

  it("keeps pre-origin public v1 items active despite an unobserved no-id hit and later update", () => {
    const database = databasePath();
    const service = new ContextCompilerMcpService(database);
    const sessionId = "pre-origin-v1";
    const createdAt = unwrap(service.call("ingest_event", {
      session_id: sessionId, role: "user", content: "create state before telemetry",
    })) as { id: string };
    applyPublicV1Delta(service, sessionId, createdAt.id, {
      ...createEmptyStateDelta(),
      new_goals: [
        { content: "prebaseline alpha objective", source_refs: [createdAt.id] },
        { content: "prebaseline beta objective", source_refs: [createdAt.id] },
      ],
    });
    const createdState = unwrap(service.call("get_state", {
      session_id: sessionId,
    })) as { items: Array<{ id: string; content: string; status: string }> };
    const [alphaId, betaId] = createdState.items.map(({ id }) => id);

    const unobservedHit = unwrap(service.call("compile_context", {
      session_id: sessionId,
      current_input: "prebaseline alpha beta objective",
      recent_raw_window_turns: 1,
    })) as any;
    expect(new Set(unobservedHit.context.active_goals.map(({ id }: { id: string }) => id)))
      .toEqual(new Set([alphaId, betaId]));
    const ledgerBeforeOrigin = new SqliteExperienceLedgerStore(database);
    expect(ledgerBeforeOrigin.getSessionRecords(sessionId)
      .filter(({ kind }) => kind === "CONTEXT_COMPILE" || kind === "RETRIEVAL_HIT"))
      .toEqual([]);
    ledgerBeforeOrigin.close();

    const origin = unwrap(service.call("compile_context", {
      session_id: sessionId,
      current_input: "zzzz-unrelated-current-query",
      recent_raw_window_turns: 1,
      operation_id: "pre-origin-baseline",
    })) as any;
    expect(origin.context.dormant_state_ids).toEqual([]);

    let latestEventId = createdAt.id;
    for (let index = 2; index <= 16; index += 1) {
      latestEventId = (unwrap(service.call("ingest_event", {
        session_id: sessionId, role: "user", content: `timeline ${index}`,
      })) as { id: string }).id;
    }
    const atOriginThreshold = unwrap(service.call("compile_context", {
      session_id: sessionId,
      current_input: "zzzz-unrelated-current-query",
      recent_raw_window_turns: 1,
      operation_id: "pre-origin-at-threshold",
    })) as any;
    expect(atOriginThreshold.context.operational_debug.dormancy_enabled).toBe(true);
    expect(atOriginThreshold.context.dormant_state_ids).toEqual([]);
    expect(new Set(atOriginThreshold.context.active_goals.map(({ id }: { id: string }) => id)))
      .toEqual(new Set([alphaId, betaId]));

    applyPublicV1Delta(service, sessionId, latestEventId, {
      ...createEmptyStateDelta(),
      updated_goals: [{ id: betaId!, content: "late source-less beta revision" }],
    });
    const updatedBaseline = unwrap(service.call("compile_context", {
      session_id: sessionId,
      current_input: "zzzz-unrelated-current-query",
      recent_raw_window_turns: 1,
      operation_id: "pre-origin-updated-baseline",
    })) as any;
    expect(updatedBaseline.context.operational_debug.dormancy_enabled).toBe(false);
    expect(updatedBaseline.context.dormant_state_ids).toEqual([]);

    for (let index = 17; index <= 31; index += 1) {
      unwrap(service.call("ingest_event", {
        session_id: sessionId, role: "user", content: `timeline ${index}`,
      }));
    }
    const afterUpdateThreshold = unwrap(service.call("compile_context", {
      session_id: sessionId,
      current_input: "zzzz-unrelated-current-query",
      recent_raw_window_turns: 1,
      operation_id: "pre-origin-updated-at-threshold",
    })) as any;
    expect(afterUpdateThreshold.context.operational_debug.dormancy_enabled).toBe(true);
    expect(afterUpdateThreshold.context.dormant_state_ids).toEqual([]);
    expect(new Set(afterUpdateThreshold.context.active_goals.map(({ id }: { id: string }) => id)))
      .toEqual(new Set([alphaId, betaId]));
    const finalState = unwrap(service.call("get_state", {
      session_id: sessionId,
    })) as { items: Array<{ id: string; content: string; status: string }> };
    expect(finalState.items.find(({ id }) => id === betaId)).toMatchObject({
      content: "late source-less beta revision", status: "ACTIVE",
    });
    service.close();
  });

  it("allows a post-origin v2-created zero-hit item to dormant only after its snapshot threshold", async () => {
    const database = databasePath();
    const service = new ContextCompilerMcpService(database);
    const sessionId = "post-origin-v2";
    unwrap(service.call("ingest_event", {
      session_id: sessionId, role: "user", content: "telemetry origin",
    }));
    unwrap(service.call("compile_context", {
      session_id: sessionId,
      current_input: "zzzz-unrelated-current-query",
      recent_raw_window_turns: 1,
      operation_id: "v2-origin",
    }));
    const creationEvent = unwrap(service.call("ingest_event", {
      session_id: sessionId, role: "user", content: "strict v2 creation evidence",
    })) as { id: string };
    const stateStore = new SqliteContextStateStore(database);
    try {
      const updater = new RuntimeStateUpdater(stateStore, {
        async complete() {
          return JSON.stringify({
            ...createEmptyStateDelta(),
            new_goals: [{
              content: "v2 post-origin dormant candidate",
              source_refs: [creationEvent.id],
            }],
          });
        },
      });
      await expect(updater.updateState({
        session_id: sessionId,
        newest_event_ids: [creationEvent.id],
      })).resolves.toMatchObject({
        extraction: { contract_version: 2 },
        application: { changed: true, revision: 1 },
      });
    } finally {
      stateStore.close();
    }
    const createdState = unwrap(service.call("get_state", {
      session_id: sessionId,
    })) as { items: Array<{ id: string; status: string }> };
    const goalId = createdState.items[0]!.id;
    const snapshotBaseline = unwrap(service.call("compile_context", {
      session_id: sessionId,
      current_input: "zzzz-unrelated-current-query",
      recent_raw_window_turns: 1,
      operation_id: "v2-snapshot-baseline",
    })) as any;
    expect(snapshotBaseline.context.operational_debug.dormancy_enabled).toBe(false);
    expect(snapshotBaseline.context.dormant_state_ids).toEqual([]);

    for (let index = 3; index <= 9; index += 1) {
      unwrap(service.call("ingest_event", {
        session_id: sessionId, role: "user", content: `timeline ${index}`,
      }));
    }
    const middle = unwrap(service.call("compile_context", {
      session_id: sessionId,
      current_input: "zzzz-unrelated-current-query",
      recent_raw_window_turns: 1,
      operation_id: "v2-middle-compile",
    })) as any;
    expect(middle.context.dormant_state_ids).toEqual([]);

    for (let index = 10; index <= 16; index += 1) {
      unwrap(service.call("ingest_event", {
        session_id: sessionId, role: "user", content: `timeline ${index}`,
      }));
    }
    const belowThreshold = unwrap(service.call("compile_context", {
      session_id: sessionId,
      current_input: "zzzz-unrelated-current-query",
      recent_raw_window_turns: 1,
      operation_id: "v2-below-threshold",
    })) as any;
    expect(belowThreshold.context.dormant_state_ids).toEqual([]);
    expect(belowThreshold.context.active_goals.map(({ id }: { id: string }) => id))
      .toEqual([goalId]);

    unwrap(service.call("ingest_event", {
      session_id: sessionId, role: "user", content: "timeline 17",
    }));
    const atThreshold = unwrap(service.call("compile_context", {
      session_id: sessionId,
      current_input: "zzzz-unrelated-current-query",
      recent_raw_window_turns: 1,
      operation_id: "v2-at-threshold",
    })) as any;
    expect(atThreshold.context.dormant_state_ids).toEqual([goalId]);
    expect(atThreshold.context.active_goals).toEqual([]);
    expect(unwrap(service.call("get_state", { session_id: sessionId }))).toMatchObject({
      items: [{ id: goalId, status: "ACTIVE" }],
    });
    service.close();
  });

  it("rebaselines source-less public v1 content, status, and relation updates before dormancy", () => {
    for (const mutationKind of ["content", "status", "relation"] as const) {
      const database = databasePath();
      const service = new ContextCompilerMcpService(database);
      const sessionId = `v1-late-${mutationKind}`;
      const first = unwrap(service.call("ingest_event", {
        session_id: sessionId, role: "user", content: "empty state baseline",
      })) as { id: string };
      const emptyBaseline = unwrap(service.call("compile_context", {
        session_id: sessionId,
        current_input: "zzzz-unrelated-current-query",
        recent_raw_window_turns: 1,
        operation_id: `${mutationKind}-empty-baseline`,
      })) as any;
      expect(emptyBaseline.context.operational_debug.dormancy_enabled).toBe(false);

      const createdAt = unwrap(service.call("ingest_event", {
        session_id: sessionId, role: "user", content: "create durable state",
      })) as { id: string };
      expect(first.id).not.toBe(createdAt.id);
      applyPublicV1Delta(service, sessionId, createdAt.id, {
        ...createEmptyStateDelta(),
        new_goals: [
          { content: "primary durable objective", source_refs: [createdAt.id] },
          { content: "secondary dormant candidate", source_refs: [createdAt.id] },
        ],
      });
      const createdState = unwrap(service.call("get_state", {
        session_id: sessionId,
      })) as { items: Array<{ id: string; status: string }> };
      const [primaryId, secondaryId] = createdState.items.map(({ id }) => id);
      expect(primaryId).toBeDefined();
      expect(secondaryId).toBeDefined();
      const createdBaseline = unwrap(service.call("compile_context", {
        session_id: sessionId,
        current_input: "zzzz-unrelated-current-query",
        recent_raw_window_turns: 1,
        operation_id: `${mutationKind}-created-baseline`,
      })) as any;
      expect(createdBaseline.context.dormant_state_ids).toEqual([]);
      expect(createdBaseline.context.operational_debug.dormancy_enabled).toBe(false);

      let latestEventId = createdAt.id;
      for (let index = 3; index <= 17; index += 1) {
        latestEventId = (unwrap(service.call("ingest_event", {
          session_id: sessionId, role: "user", content: `timeline ${index}`,
        })) as { id: string }).id;
      }
      const delta = createEmptyStateDelta();
      if (mutationKind === "content") {
        delta.updated_goals = [{ id: primaryId!, content: "late revised objective" }];
      } else if (mutationKind === "status") {
        delta.updated_goals = [{ id: primaryId!, status: "COMPLETED" }];
      } else {
        delta.new_relations = [{
          source_id: primaryId!, relation_type: "DEPENDS_ON", target_id: secondaryId!,
        }];
      }
      applyPublicV1Delta(service, sessionId, latestEventId, delta);
      const activeIds = mutationKind === "status"
        ? [secondaryId!]
        : [primaryId!, secondaryId!];

      const firstAfterMutation = unwrap(service.call("compile_context", {
        session_id: sessionId,
        current_input: "zzzz-unrelated-current-query",
        recent_raw_window_turns: 1,
        operation_id: `${mutationKind}-new-snapshot-baseline`,
      })) as any;
      expect(firstAfterMutation.context.operational_debug.dormancy_enabled).toBe(false);
      expect(firstAfterMutation.context.dormant_state_ids).toEqual([]);
      expect(new Set(firstAfterMutation.context.active_goals.map(({ id }: { id: string }) => id)))
        .toEqual(new Set(activeIds));

      for (let index = 18; index <= 31; index += 1) {
        unwrap(service.call("ingest_event", {
          session_id: sessionId, role: "user", content: `timeline ${index}`,
        }));
      }
      const belowThreshold = unwrap(service.call("compile_context", {
        session_id: sessionId,
        current_input: "zzzz-unrelated-current-query",
        recent_raw_window_turns: 1,
        operation_id: `${mutationKind}-below-threshold`,
      })) as any;
      expect(belowThreshold.context.operational_debug.dormancy_enabled).toBe(true);
      expect(belowThreshold.context.dormant_state_ids).toEqual([]);
      expect(new Set(belowThreshold.context.active_goals.map(({ id }: { id: string }) => id)))
        .toEqual(new Set(activeIds));

      unwrap(service.call("ingest_event", {
        session_id: sessionId, role: "user", content: "timeline 32",
      }));
      const atThreshold = unwrap(service.call("compile_context", {
        session_id: sessionId,
        current_input: "zzzz-unrelated-current-query",
        recent_raw_window_turns: 1,
        operation_id: `${mutationKind}-at-threshold`,
      })) as any;
      expect(atThreshold.context.operational_debug.dormancy_enabled).toBe(true);
      expect(new Set(atThreshold.context.dormant_state_ids)).toEqual(new Set(activeIds));
      expect(atThreshold.context.active_goals).toEqual([]);
      service.close();
    }
  });

  it("does not let public ledger append forge a compile baseline", () => {
    const database = databasePath();
    const service = new ContextCompilerMcpService(database);
    unwrap(service.call("ingest_event", {
      session_id: "forged", role: "user", content: "raw",
    }));
    const ledger = new SqliteExperienceLedgerStore(database);
    expect(() => ledger.append({
      session_id: "forged", kind: "CONTEXT_COMPILE", source_key: "context-compile/forged",
      payload: { policy_version: "operational-context-v1", raw_boundary_max_seq: 1 },
    } as never)).toThrowError(expect.objectContaining<Partial<ExperienceLedgerError>>({
      code: "INVALID_INPUT",
    }));
    expect(service.call("compile_context", {
      session_id: "forged", current_input: "raw", recent_raw_window_turns: 1,
    }).ok).toBe(true);
    ledger.close();
    service.close();
  });

  it("classifies malformed persisted ledger rows as STORAGE_FAILURE", () => {
    const database = databasePath();
    const service = new ContextCompilerMcpService(database);
    unwrap(service.call("ingest_event", {
      session_id: "corrupt", role: "user", content: "raw",
    }));
    const direct = new DatabaseSync(database);
    direct.prepare(`
      INSERT INTO experience_ledger (
        id, session_id, seq, kind, occurred_at, source_key,
        raw_event_ids_json, parent_ledger_ids_json, payload_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      "corrupt-row", "corrupt", 2, "ACTION", "2026-08-24T00:00:00.000Z", "corrupt/row",
      "[1]", "[]", "{}"
    );
    direct.close();
    expect(service.call("compile_context", {
      session_id: "corrupt", current_input: "valid request",
    })).toEqual({ ok: false, error: { code: "STORAGE_FAILURE" } });
    service.close();
  });

  it("rolls back all compile ledger rows when a hit insert fails and changes no raw/state", () => {
    const database = databasePath();
    const service = new ContextCompilerMcpService(database);
    for (let index = 1; index <= 3; index += 1) {
      unwrap(service.call("ingest_event", {
        session_id: "rollback", role: "user", content: index === 1 ? "needle" : `turn ${index}`,
      }));
    }
    const direct = new DatabaseSync(database);
    direct.exec(`
      CREATE TRIGGER fail_compile_hit
      BEFORE INSERT ON experience_ledger
      WHEN NEW.kind = 'RETRIEVAL_HIT'
      BEGIN
        SELECT RAISE(ABORT, 'injected retrieval hit failure');
      END;
    `);
    const rawBefore = direct.prepare("SELECT COUNT(*) AS count FROM raw_events").get();
    const revisionBefore = direct.prepare(
      "SELECT COALESCE(revision, 0) AS revision FROM context_state_revisions WHERE session_id = ?"
    ).get("rollback") ?? { revision: 0 };
    expect(service.call("compile_context", {
      session_id: "rollback", current_input: "needle", recent_raw_window_turns: 1,
      operation_id: "will-rollback", context_policy: { candidate_turn_multiplier: 2 },
    })).toEqual({ ok: false, error: { code: "STORAGE_FAILURE" } });
    expect(direct.prepare(
      "SELECT COUNT(*) AS count FROM experience_ledger WHERE kind IN ('CONTEXT_COMPILE','RETRIEVAL_HIT')"
    ).get()).toEqual({ count: 0 });
    expect(direct.prepare("SELECT COUNT(*) AS count FROM raw_events").get()).toEqual(rawBefore);
    expect(direct.prepare(
      "SELECT COALESCE(revision, 0) AS revision FROM context_state_revisions WHERE session_id = ?"
    ).get("rollback") ?? { revision: 0 }).toEqual(revisionBefore);
    direct.close();
    service.close();
  });

  it("rejects partial policy, Dense, and recovery misuse with stable INVALID_INPUT", () => {
    const service = new ContextCompilerMcpService(databasePath());
    const ordinary = unwrap(service.call("ingest_event", {
      session_id: "invalid", role: "user", content: "ordinary",
    })) as { id: string };
    const invalid = [
      service.call("ingest_event", {
        session_id: "invalid", role: "user", content: "x",
        dense_embedding: { vector_space_id: "v", values: [] },
      }),
      service.call("compile_context", {
        session_id: "invalid", current_input: "q", dense_query: { vector_space_id: "v", values: [Infinity] },
      }),
      service.call("compile_context", {
        session_id: "invalid", current_input: "q", context_policy: { extra: 1 },
      }),
      service.call("compile_context", {
        session_id: "invalid", current_input: "q",
        context_policy: { recovery_failure_event_id: ordinary.id },
      }),
    ];
    expect(invalid).toEqual(invalid.map(() => ({ ok: false, error: { code: "INVALID_INPUT" } })));
    service.close();
  });
});

function databasePath(): string {
  const directory = mkdtempSync(join(tmpdir(), "context-operational-"));
  directories.push(directory);
  return join(directory, "context.db");
}

function unwrap(response: ReturnType<ContextCompilerMcpService["call"]>): unknown {
  if (!response.ok) throw new Error(response.error.code);
  return response.result;
}

function applyPublicV1Delta(
  service: ContextCompilerMcpService,
  sessionId: string,
  newestEventId: string,
  delta: unknown
): void {
  const prepared = unwrap(service.call("prepare_state_update", {
    session_id: sessionId,
    newest_event_ids: [newestEventId],
  })) as {
    preparation_token: string;
    fingerprint: string;
    expected_revision: number;
  };
  expect(unwrap(service.call("apply_state_delta", {
    session_id: sessionId,
    preparation_token: prepared.preparation_token,
    fingerprint: prepared.fingerprint,
    expected_revision: prepared.expected_revision,
    delta,
  }))).toMatchObject({ changed: true, revision: prepared.expected_revision + 1 });
}
