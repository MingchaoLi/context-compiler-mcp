import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  CONTEXT_COMPILER_CAPABILITIES,
  ContextCompilerMcpService,
  SqliteContextStateStore,
  SqliteHistoryRecallStore,
  resolveContextCompilerDatabasePath,
} from "../src/index.js";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("ContextCompilerMcpService", () => {
  it("resolves the explicit and DSH_HOME database contracts without fallback", () => {
    expect(resolveContextCompilerDatabasePath({ CONTEXT_COMPILER_DB_PATH: "/explicit.db" })).toBe("/explicit.db");
    expect(resolveContextCompilerDatabasePath({ DSH_HOME: "/dsh" })).toBe(join("/dsh", "sessions", "context-compiler.db"));
    expect(() => resolveContextCompilerDatabasePath({})).toThrowError("INVALID_INPUT");
  });

  it("supports all service operations, idempotency, read-only compile, and stable metrics", () => {
    const database = databasePath();
    const service = new ContextCompilerMcpService(database);
    expect(unwrap(service.call("health", {}))).toEqual({
      version: "0.1.0", capabilities: [...CONTEXT_COMPILER_CAPABILITIES], ready: true,
    });

    const raw = unwrap(service.call("ingest_event", {
      session_id: "session", role: "user", content: "keep the answer short",
      source_event_id: "source-1", metadata: { nested: [true, null, 4] },
    })) as { id: string; seq: number };
    expect(unwrap(service.call("ingest_event", {
      session_id: "session", role: "user", content: "keep the answer short",
      source_event_id: "source-1", metadata: { nested: [true, null, 4] },
    }))).toMatchObject({ id: raw.id, seq: 1 });
    expect(service.call("ingest_event", {
      session_id: "session", role: "user", content: "different", source_event_id: "source-1",
    })).toEqual({ ok: false, error: { code: "CONFLICT" } });

    const state = new SqliteContextStateStore(database);
    state.transaction("session", () => state.createItem({
      session_id: "session", type: "GOAL", content: "ship safely", status: "ACTIVE",
      source_refs: [raw.id],
    }));
    const revision = state.getRevision("session");
    state.close();

    const compiled = unwrap(service.call("compile_context", {
      session_id: "session", current_input: "What next?", token_budget: 1000,
    })) as { context: Record<string, any>; metrics: Record<string, number> };
    expect(compiled.context.active_goals).toHaveLength(1);
    expect(compiled.metrics.full_context_tokens).toBe(compiled.context.metrics.d0_full_tokens);
    expect(compiled.metrics.compiled_context_tokens).toBe(compiled.context.metrics.d2_compiled_tokens);
    expect(compiled.metrics.recent_window_tokens).toBe(compiled.context.metrics.d1_recent_tokens);
    expect(compiled.metrics.retrieved_tokens).toBe(0);
    expect(compiled.metrics.extractor_latency_ms).toBe(0);
    expect(Object.values(compiled.metrics).every((metric) => Number.isFinite(metric) && metric >= 0)).toBe(true);
    const snapshot = unwrap(service.call("get_state", { session_id: "session" })) as any;
    expect(snapshot.revision).toBe(revision);
    expect(snapshot.items).toHaveLength(1);

    const headline = unwrap(service.call("create_headline", {
      session_id: "session", event_start_seq: 1, event_end_seq: 1,
      headline: "Answer constraints", keywords: ["answer", "short"],
    })) as { id: string };
    expect(unwrap(service.call("recall_exact", {
      kind: "headline_id", session_id: "session", headline_id: headline.id,
    }))).toMatchObject({ found: true, events: [{ id: raw.id }] });
    expect(unwrap(service.call("recall_keyword", {
      session_id: "session", query: "answer OR * ", limit: 5,
    }))).toHaveLength(1);
    expect((unwrap(service.call("get_state", { session_id: "session" })) as any).revision).toBe(revision);
    service.close();
    service.close();
  });

  it("preserves whitespace, Unicode, 501-character, and 5000-character session domains", () => {
    const service = new ContextCompilerMcpService(databasePath());
    for (const session_id of ["   ", "会话-🦋", "x".repeat(501), "界".repeat(5000)]) {
      expect(service.call("ingest_event", { session_id, role: "user", content: "x" }).ok).toBe(true);
      expect(service.call("get_state", { session_id }).ok).toBe(true);
      expect(service.call("compile_context", { session_id, current_input: "go" }).ok).toBe(true);
    }
    service.close();
  });

  it("restores only documented session fields without rewriting user-controlled magic values", () => {
    const database = databasePath();
    const service = new ContextCompilerMcpService(database);
    const magic = "__context_compiler_whitespace_session__";
    const userMetadata = {
      session_id: magic,
      nested: { session_id: magic, value: [{ session_id: magic }] },
    };
    const event = unwrap(service.call("ingest_event", {
      session_id: "   ", role: "user", content: magic, metadata: userMetadata,
    })) as { id: string };
    unwrap(service.call("ingest_event", {
      session_id: magic, role: "user", content: "real magic session",
    }));
    const state = new SqliteContextStateStore(database);
    state.transaction("   ", () => state.createItem({
      session_id: "   ", type: "GOAL", status: "ACTIVE", content: magic,
      source_refs: [event.id], metadata: userMetadata,
    }));
    state.close();

    const compiled = unwrap(service.call("compile_context", {
      session_id: "   ", current_input: magic,
    })) as any;
    expect(compiled.context.session_id).toBe("   ");
    expect(compiled.context.current_input).toBe(magic);
    expect(compiled.context.active_goals[0]).toMatchObject({
      session_id: "   ", content: magic, metadata: userMetadata,
    });
    expect(compiled.context.recent_conversation[0]).toMatchObject({
      session_id: "   ", content: magic, metadata: userMetadata,
    });
    expect(unwrap(service.call("compile_context", {
      session_id: magic, current_input: "isolation",
    }))).toMatchObject({
      context: {
        session_id: magic,
        recent_conversation: [{ session_id: magic, content: "real magic session" }],
      },
    });
    service.close();
  });

  it("rejects malformed and accessor-like shapes before access and returns only stable codes", () => {
    const service = new ContextCompilerMcpService(databasePath());
    let accessed = false;
    const accessor = {} as Record<string, unknown>;
    Object.defineProperty(accessor, "session_id", { enumerable: true, get() { accessed = true; return "secret"; } });
    expect(service.call("get_state", accessor)).toEqual({ ok: false, error: { code: "INVALID_INPUT" } });
    expect(accessed).toBe(false);
    const failures = [
      service.call("health", { extra: true }),
      service.call("recall_keyword", { session_id: "s", query: "q", limit: 21 }),
      service.call("recall_exact", { kind: "seq_range", session_id: "s", event_start_seq: 1, event_end_seq: 1001 }),
      service.call("create_headline", { session_id: "s", event_start_seq: 1, event_end_seq: 201, headline: "h", keywords: ["k"] }),
    ];
    expect(failures.every((result) => !result.ok && Object.keys(result.error).join() === "code")).toBe(true);
    service.close();
  });

  it("persists raw evidence and headlines across service restarts with session isolation", () => {
    const database = databasePath();
    let service = new ContextCompilerMcpService(database);
    const event = unwrap(service.call("ingest_event", { session_id: "a", role: "user", content: "durable" })) as any;
    unwrap(service.call("ingest_event", { session_id: "b", role: "user", content: "other" }));
    const headline = unwrap(service.call("create_headline", {
      session_id: "a", event_start_seq: 1, event_end_seq: 1, headline: "Durable note", keywords: ["durable"],
    })) as any;
    service.close();
    service = new ContextCompilerMcpService(database);
    expect(unwrap(service.call("recall_exact", { kind: "event_id", session_id: "a", event_id: event.id }))).toMatchObject({ found: true });
    expect(unwrap(service.call("recall_exact", { kind: "headline_id", session_id: "b", headline_id: headline.id }))).toEqual({ kind: "headline_id", found: false, events: [] });
    expect(unwrap(service.call("recall_keyword", { session_id: "a", query: "durable" }))).toHaveLength(1);
    expect(unwrap(service.call("recall_keyword", { session_id: "b", query: "durable" }))).toHaveLength(0);
    service.close();
  });

  it("matches direct core recall results", () => {
    const database = databasePath();
    const service = new ContextCompilerMcpService(database);
    const event = unwrap(service.call("ingest_event", { session_id: "same", role: "assistant", content: "literal recall" })) as any;
    unwrap(service.call("create_headline", { session_id: "same", event_start_seq: 1, event_end_seq: 1, headline: "Literal recall", keywords: ["literal"] }));
    const direct = new SqliteHistoryRecallStore(database);
    expect(unwrap(service.call("recall_exact", { kind: "event_id", session_id: "same", event_id: event.id }))).toEqual(direct.recallExact({ kind: "event_id", session_id: "same", event_id: event.id }));
    expect(unwrap(service.call("recall_keyword", { session_id: "same", query: "literal" }))).toEqual(direct.recallKeyword({ session_id: "same", query: "literal" }));
    direct.close();
    service.close();
  });
});

function databasePath(): string {
  const directory = mkdtempSync(join(tmpdir(), "context-compiler-mcp-service-"));
  temporaryDirectories.push(directory);
  return join(directory, "context.db");
}

function unwrap(response: ReturnType<ContextCompilerMcpService["call"]>): unknown {
  if (!response.ok) throw new Error(response.error.code);
  return response.result;
}
