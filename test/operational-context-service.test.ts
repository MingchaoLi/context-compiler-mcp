import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  ContextCompilerMcpService,
  createEmptyStateDelta,
  ExperienceLedgerError,
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
