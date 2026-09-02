import { execFileSync, spawn, spawnSync } from "node:child_process";
import {
  chmodSync, cpSync, existsSync, mkdtempSync, mkdirSync, readFileSync, renameSync,
  rmSync, symlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Worker } from "node:worker_threads";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  acquireSqliteExperimentalWarningFilter,
  createContextCompilerMcpServer,
  runContextCompilerMcpServer,
} from "../src/mcp-server.js";
import { ContextCompilerMcpService } from "../src/mcp-service.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const serverEntry = join(root, "dist", "mcp-server.js");
const temporaryRoot = mkdtempSync(join(tmpdir(), "context-compiler-mcp-protocol-"));
const databasePath = join(temporaryRoot, "protocol.db");

beforeAll(() => {
  execFileSync(process.execPath, [
    join(root, "node_modules", "typescript", "bin", "tsc"),
    "-p", join(root, "tsconfig.json"),
  ], { cwd: root, stdio: "pipe" });
});

afterAll(() => rmSync(temporaryRoot, { recursive: true, force: true }));

describe("Context Compiler stdio MCP protocol", () => {
  it("opens synchronized fresh DBs from independent Raw stores, services, and stdio processes", async () => {
    for (let index = 0; index < 10; index += 1) {
      const freshRaw = join(temporaryRoot, `fresh-raw-${index}.db`);
      const rawResults = await runFreshDatabaseBarrier("raw_open", freshRaw);
      expect(rawResults).toEqual([{ type: "result", ok: true }, { type: "result", ok: true }]);

      const freshService = join(temporaryRoot, `fresh-service-${index}.db`);
      const serviceResults = await runFreshDatabaseBarrier("service_health", freshService);
      expect(serviceResults.every((result) => result.ok &&
        result.response?.ok && result.response.result?.ready === true)).toBe(true);
    }

    for (let index = 0; index < 5; index += 1) {
      const freshStdio = join(temporaryRoot, `fresh-stdio-${index}.db`);
      const connections = await Promise.all([
        connect(serverEntry, freshStdio),
        connect(serverEntry, freshStdio),
      ]);
      try {
        const health = await Promise.all(connections.map((connection) =>
          connection.client.callTool({ name: "health", arguments: {} })
        ));
        expect(health.map(parse).every((response: any) =>
          response.ok && response.result.ready === true
        )).toBe(true);
      } finally {
        await Promise.all(connections.map(close));
      }
    }
  }, 15_000);

  it("atomically upgrades legacy raw schemas across independent stores, services, and stdio", async () => {
    for (let index = 0; index < 10; index += 1) {
      const legacyRaw = join(temporaryRoot, `legacy-raw-${index}.db`);
      const fixtureId = `legacy-raw-${index}`;
      createLegacyRawDatabase(legacyRaw, fixtureId);
      expect(await runFreshDatabaseBarrier("raw_open", legacyRaw)).toEqual([
        { type: "result", ok: true },
        { type: "result", ok: true },
      ]);
      assertLegacyMigration(legacyRaw, fixtureId);

      const legacyService = join(temporaryRoot, `legacy-service-${index}.db`);
      const serviceFixtureId = `legacy-service-${index}`;
      createLegacyRawDatabase(legacyService, serviceFixtureId);
      const serviceResults = await runFreshDatabaseBarrier("service_health", legacyService);
      expect(serviceResults.every((result) => result.ok &&
        result.response?.ok && result.response.result?.ready === true)).toBe(true);
      assertLegacyMigration(legacyService, serviceFixtureId);
    }

    for (let index = 0; index < 5; index += 1) {
      const legacyStdio = join(temporaryRoot, `legacy-stdio-${index}.db`);
      const fixtureId = `legacy-stdio-${index}`;
      createLegacyRawDatabase(legacyStdio, fixtureId);
      const stdioResults = await runFreshDatabaseBarrier("stdio_health", legacyStdio);
      expect(stdioResults.every((result) => result.ok &&
        result.response?.ok && result.response.result?.ready === true)).toBe(true);
      assertLegacyMigration(legacyStdio, fixtureId);
    }
  }, 15_000);

  it("preserves preinitialized same-source and same-operation concurrency", async () => {
    const rawDatabase = join(temporaryRoot, "preinitialized-raw-concurrency.db");
    await runFreshDatabaseBarrier("raw_open", rawDatabase);
    const rawResults = await runFreshDatabaseBarrier("raw_ingest", rawDatabase);
    expect(rawResults.every((result) => result.ok)).toBe(true);
    expect(new Set(rawResults.map((result) => result.event_id)).size).toBe(1);
    const rawAudit = new DatabaseSync(rawDatabase);
    expect(rawAudit.prepare("SELECT COUNT(*) AS count FROM raw_events").get()).toEqual({ count: 1 });
    expect(rawAudit.prepare("SELECT COUNT(*) AS count FROM experience_ledger WHERE kind = 'EVENT'").get())
      .toEqual({ count: 1 });
    rawAudit.close();

    const compileDatabase = join(temporaryRoot, "preinitialized-compile-concurrency.db");
    const setup = await connect(serverEntry, compileDatabase);
    try {
      for (let index = 1; index <= 3; index += 1) {
        expect(parse(await setup.client.callTool({
          name: "ingest_event",
          arguments: {
            session_id: "concurrent-compile",
            role: "user",
            content: index === 1 ? "old needle" : `turn ${index}`,
            source_event_id: `compile-source-${index}`,
          },
        }))).toMatchObject({ ok: true });
      }
    } finally {
      await close(setup);
    }
    const compileResults = await runFreshDatabaseBarrier("service_compile", compileDatabase);
    expect(compileResults.every((result) => result.ok && result.response?.ok)).toBe(true);
    expect(new Set(compileResults.map((result) =>
      result.response.result.context.operational_debug.compile_trace_id
    )).size).toBe(1);
    const compileAudit = new DatabaseSync(compileDatabase);
    expect(compileAudit.prepare(
      "SELECT COUNT(*) AS count FROM experience_ledger WHERE kind = 'CONTEXT_COMPILE'"
    ).get()).toEqual({ count: 1 });
    expect(compileAudit.prepare(
      "SELECT COUNT(*) AS count FROM experience_ledger WHERE kind = 'RETRIEVAL_HIT'"
    ).get()).toEqual({ count: 1 });
    compileAudit.close();
  });

  it("linearizes first trace commit before a competing service write and no-id compile", async () => {
    const database = join(temporaryRoot, "compile-boundary-commit.db");
    const sessionId = "compile-boundary-commit";
    seedCompileBoundaryDatabase(database, sessionId);

    const interleaving = await runCompileTelemetryBoundaryInterleaving(
      database, sessionId, false
    );
    expect(interleaving.blocked_before_release).toBe(true);
    expect(interleaving.trace_count_before_release).toBe(0);
    expect(interleaving.origin.response).toMatchObject({ ok: true });
    expect(interleaving.contender.no_id_response).toEqual({
      ok: false, error: { code: "INVALID_INPUT" },
    });
    expect(interleaving.contender.state).toMatchObject({
      revision: 1,
      items: [{ content: "post-boundary durable goal", status: "ACTIVE" }],
    });

    const audit = new DatabaseSync(database);
    const trace = audit.prepare(
      "SELECT payload_json FROM experience_ledger WHERE kind = 'CONTEXT_COMPILE'"
    ).get() as { payload_json: string };
    expect(JSON.parse(trace.payload_json)).toMatchObject({
      operation_id: "first-origin-commit",
      raw_boundary_max_seq: 1,
      state_revision: 0,
      selected_state_ids: [],
    });
    expect(audit.prepare(
      "SELECT COUNT(*) AS count FROM raw_events WHERE session_id = ?"
    ).get(sessionId)).toEqual({ count: 2 });
    audit.close();

    const verifier = new ContextCompilerMcpService(database);
    const goalId = interleaving.contender.state.items[0].id as string;
    expect(verifier.call("compile_context", {
      session_id: sessionId,
      current_input: "zzzz-unrelated-current-query",
      recent_raw_window_turns: 1,
      operation_id: "post-commit-snapshot",
    })).toMatchObject({
      ok: true,
      result: { context: { dormant_state_ids: [], operational_debug: { dormancy_enabled: false } } },
    });
    addUserTurns(verifier, sessionId, 3, 17);
    expect(verifier.call("compile_context", {
      session_id: sessionId,
      current_input: "zzzz-unrelated-current-query",
      recent_raw_window_turns: 1,
      operation_id: "post-commit-threshold",
    })).toMatchObject({
      ok: true,
      result: { context: { active_goals: [], dormant_state_ids: [goalId] } },
    });
    verifier.close();
  });

  it("rolls back a failed first trace before a competing service proceeds", async () => {
    const database = join(temporaryRoot, "compile-boundary-rollback.db");
    const sessionId = "compile-boundary-rollback";
    seedCompileBoundaryDatabase(database, sessionId);

    const interleaving = await runCompileTelemetryBoundaryInterleaving(
      database, sessionId, true
    );
    expect(interleaving.blocked_before_release).toBe(true);
    expect(interleaving.trace_count_before_release).toBe(0);
    expect(interleaving.origin.response).toEqual({
      ok: false, error: { code: "STORAGE_FAILURE" },
    });
    expect(interleaving.contender.no_id_response).toMatchObject({
      ok: true,
      result: { context: { active_goals: [{ content: "post-boundary durable goal" }] } },
    });

    const audit = new DatabaseSync(database);
    expect(audit.prepare(
      "SELECT COUNT(*) AS count FROM experience_ledger WHERE kind IN ('CONTEXT_COMPILE','RETRIEVAL_HIT')"
    ).get()).toEqual({ count: 0 });
    expect(audit.prepare(
      "SELECT COUNT(*) AS count FROM raw_events WHERE session_id = ?"
    ).get(sessionId)).toEqual({ count: 2 });
    audit.close();

    const verifier = new ContextCompilerMcpService(database);
    const goalId = interleaving.contender.state.items[0].id as string;
    expect(verifier.call("compile_context", {
      session_id: sessionId,
      current_input: "zzzz-unrelated-current-query",
      recent_raw_window_turns: 1,
      operation_id: "first-origin-after-rollback",
    })).toMatchObject({
      ok: true,
      result: { context: { active_goals: [{ id: goalId }], dormant_state_ids: [] } },
    });
    addUserTurns(verifier, sessionId, 3, 17);
    expect(verifier.call("compile_context", {
      session_id: sessionId,
      current_input: "zzzz-unrelated-current-query",
      recent_raw_window_turns: 1,
      operation_id: "rollback-origin-threshold",
    })).toMatchObject({
      ok: true,
      result: { context: { active_goals: [{ id: goalId }], dormant_state_ids: [] } },
    });
    verifier.close();
  });

  it("initializes, lists exactly nine tools, calls each tool, and keeps stdout protocol-pure", async () => {
    const connection = await connect(serverEntry, databasePath);
    try {
      const listed = await connection.client.listTools();
      expect(connection.client.getServerVersion()).toEqual({
        name: "context-compiler-mcp",
        version: "0.1.0",
      });
      expect(listed.tools.map((tool) => tool.name)).toEqual([
        "health", "ingest_event", "compile_context", "get_state",
        "prepare_state_update", "apply_state_delta",
        "create_headline", "recall_exact", "recall_keyword",
      ]);
      const ingestTimestampSchema = listed.tools.find((tool) => tool.name === "ingest_event")
        ?.inputSchema.properties?.created_at;
      expect(ingestTimestampSchema).toEqual({
        type: "string",
        format: "date-time",
        pattern: "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d{1,3})?(?:Z|[+-]\\d{2}:\\d{2})$",
      });
      const headlineSchema = listed.tools.find((tool) => tool.name === "create_headline")
        ?.inputSchema.properties?.created_at;
      expect(headlineSchema).toEqual({
        type: "string",
        format: "date-time",
        pattern: "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{3}Z$",
      });
      const prepareSchema = listed.tools.find((tool) => tool.name === "prepare_state_update")
        ?.inputSchema as any;
      expect(prepareSchema).toMatchObject({
        additionalProperties: false,
        required: ["session_id", "newest_event_ids"],
        properties: {
          newest_event_ids: { minItems: 1, maxItems: 100, uniqueItems: true },
        },
      });
      const applySchema = listed.tools.find((tool) => tool.name === "apply_state_delta")
        ?.inputSchema as any;
      expect(applySchema).toMatchObject({
        additionalProperties: false,
        required: [
          "session_id", "preparation_token", "fingerprint", "expected_revision", "delta",
        ],
        properties: { delta: { additionalProperties: false } },
      });
      expect(
        applySchema.properties.delta.properties.new_goals.items.additionalProperties
      ).toBe(false);
      expect(parse(await connection.client.callTool({ name: "health", arguments: {} }))).toMatchObject({ ok: true, result: { ready: true } });
      const event = parse(await connection.client.callTool({
        name: "ingest_event",
        arguments: { session_id: "proto", role: "user", content: "protocol durable", source_event_id: "p-1" },
      })) as any;
      expect(event.ok).toBe(true);
      const prepared = parse(await connection.client.callTool({
        name: "prepare_state_update",
        arguments: { session_id: "proto", newest_event_ids: [event.result.id] },
      })) as any;
      expect(prepared).toMatchObject({
        ok: true,
        result: { expected_revision: 0, extractor_input: { newest_events: [{ id: event.result.id }] } },
      });
      expect(parse(await connection.client.callTool({
        name: "apply_state_delta",
        arguments: {
          session_id: "proto",
          preparation_token: prepared.result.preparation_token,
          fingerprint: prepared.result.fingerprint,
          expected_revision: prepared.result.expected_revision,
          delta: { ...emptyDelta(), new_goals: [{ content: "Protocol state", source_refs: [event.result.id] }] },
        },
      }))).toMatchObject({ ok: true, result: { changed: true, revision: 1 } });
      expect(parse(await connection.client.callTool({
        name: "compile_context", arguments: { session_id: "proto", current_input: "continue" },
      }))).toMatchObject({
        ok: true,
        result: {
          context: {
            session_id: "proto",
            rendered_context: expect.stringContaining("Protocol state"),
            budget_exceeded: false,
            budget_overage: 0,
          },
          metrics: { retrieved_tokens: 0, extractor_latency_ms: 0 },
        },
      });
      expect(parse(await connection.client.callTool({
        name: "get_state", arguments: { session_id: "proto" },
      }))).toMatchObject({ ok: true, result: { revision: 1 } });
      const headline = parse(await connection.client.callTool({
        name: "create_headline",
        arguments: { session_id: "proto", event_start_seq: 1, event_end_seq: 1, headline: "Protocol durable", keywords: ["protocol"] },
      })) as any;
      expect(headline.ok).toBe(true);
      expect(parse(await connection.client.callTool({
        name: "create_headline",
        arguments: {
          session_id: "proto", event_start_seq: 1, event_end_seq: 1,
          headline: "Protocol durable", keywords: ["protocol"], created_at: "not-an-iso-date",
        },
      }))).toEqual({ ok: false, error: { code: "INVALID_INPUT" } });
      expect(parse(await connection.client.callTool({
        name: "recall_exact",
        arguments: { kind: "headline_id", session_id: "proto", headline_id: headline.result.id },
      }))).toMatchObject({ ok: true, result: { found: true } });
      expect(parse(await connection.client.callTool({
        name: "recall_keyword", arguments: { session_id: "proto", query: "protocol OR *", limit: 5 },
      }))).toMatchObject({ ok: true, result: [{ events: [{ id: event.result.id }] }] });
      expect(connection.stderr.join("")).toBe("");
    } finally {
      await close(connection);
    }
  });

  it("returns sanitized tool errors, preserves long sessions, and survives restart", async () => {
    let connection = await connect(serverEntry, databasePath);
    const longSession = "会".repeat(5000);
    try {
      const invalid = await connection.client.callTool({
        name: "recall_keyword", arguments: { session_id: "proto", query: "private-query", limit: 21 },
      });
      expect(invalid.isError).toBe(true);
      expect(parse(invalid)).toEqual({ ok: false, error: { code: "INVALID_INPUT" } });
      expect(JSON.stringify(invalid)).not.toContain("private-query");
      for (const session_id of ["   ", "x".repeat(501), longSession]) {
        expect(parse(await connection.client.callTool({
          name: "ingest_event", arguments: { session_id, role: "user", content: "long" },
        }))).toMatchObject({ ok: true });
        expect(parse(await connection.client.callTool({
          name: "compile_context", arguments: { session_id, current_input: "again" },
        }))).toMatchObject({ ok: true, result: { context: { session_id } } });
      }
    } finally {
      await close(connection);
    }
    connection = await connect(serverEntry, databasePath);
    try {
      expect(parse(await connection.client.callTool({
        name: "recall_keyword", arguments: { session_id: "proto", query: "protocol" },
      }))).toMatchObject({ ok: true, result: [{ headline: { headline: "Protocol durable" } }] });
      expect(parse(await connection.client.callTool({
        name: "compile_context", arguments: { session_id: longSession, current_input: "again" },
      }))).toMatchObject({
        ok: true,
        result: { context: { rendered_context: expect.stringContaining("long") } },
      });
    } finally {
      await close(connection);
    }
  });

  it("projects compile_context to a closed public DTO while preserving internal diagnostics", async () => {
    const database = join(temporaryRoot, "public-result-boundary.db");
    const sessionId = "public-result-boundary";
    const service = new ContextCompilerMcpService(database);
    const oldUser = service.call("ingest_event", {
      session_id: sessionId,
      role: "user",
      content: "old alpha evidence",
      dense_embedding: { vector_space_id: "public-v1", values: [1, 0] },
    }) as any;
    expect(oldUser.ok).toBe(true);
    expect(service.call("ingest_event", {
      session_id: sessionId,
      role: "assistant",
      content: "old beta response",
      dense_embedding: { vector_space_id: "public-v1", values: [0, 1] },
    })).toMatchObject({ ok: true });
    const recentUser = service.call("ingest_event", {
      session_id: sessionId,
      role: "user",
      content: "recent turn",
      dense_embedding: { vector_space_id: "public-v1", values: [1, 0] },
    }) as any;
    expect(recentUser.ok).toBe(true);
    const prepared = service.call("prepare_state_update", {
      session_id: sessionId,
      newest_event_ids: [recentUser.result.id],
    }) as any;
    expect(prepared.ok).toBe(true);
    expect(service.call("apply_state_delta", {
      session_id: sessionId,
      preparation_token: prepared.result.preparation_token,
      fingerprint: prepared.result.fingerprint,
      expected_revision: prepared.result.expected_revision,
      delta: {
        ...emptyDelta(),
        new_goals: [{ content: "Internal state remains available", source_refs: [recentUser.result.id] }],
      },
    })).toMatchObject({ ok: true, result: { changed: true } });

    const internal = service.call("compile_context", {
      session_id: sessionId,
      current_input: "alpha",
      recent_raw_window_turns: 1,
      operation_id: "internal-control",
      dense_query: { vector_space_id: "public-v1", values: [1, 0] },
    }) as any;
    expect(internal).toMatchObject({
      ok: true,
      result: {
        context: {
          active_goals: [{ content: "Internal state remains available" }],
          retrieved_history: [{ id: oldUser.result.id }],
          operational_debug: {
            candidate_event_ids: expect.any(Array),
            score_rows: expect.any(Array),
            compile_trace_id: expect.any(String),
          },
          debug_manifest: { kept_raw_event_ids: expect.any(Array) },
        },
      },
    });
    const expectedRendered = internal.result.context.rendered_context;
    service.close();

    const connection = await connect(serverEntry, database);
    try {
      const publicResponse = parse(await connection.client.callTool({
        name: "compile_context",
        arguments: {
          session_id: sessionId,
          current_input: "alpha",
          recent_raw_window_turns: 1,
          operation_id: "public-projection",
          dense_query: { vector_space_id: "public-v1", values: [1, 0] },
        },
      })) as any;
      expect(publicResponse.ok).toBe(true);
      expect(Object.keys(publicResponse.result).sort()).toEqual(["context", "metrics"]);
      expect(Object.keys(publicResponse.result.context)).toEqual([
        "session_id", "rendered_context", "budget_exceeded", "budget_overage",
      ]);
      expect(Object.keys(publicResponse.result.metrics)).toEqual([
        "full_context_tokens", "compiled_context_tokens", "recent_window_tokens",
        "active_state_tokens", "retrieved_tokens", "compile_latency_ms",
        "extractor_latency_ms", "active_state_items", "suppressed_items",
      ]);
      expect(publicResponse.result.context).toEqual({
        session_id: sessionId,
        rendered_context: expectedRendered,
        budget_exceeded: false,
        budget_overage: 0,
      });
      const publicKeys = collectKeys(publicResponse);
      for (const key of FORBIDDEN_PUBLIC_COMPILE_KEYS) expect(publicKeys).not.toContain(key);
    } finally {
      await close(connection);
    }

    const audit = new DatabaseSync(database);
    expect(audit.prepare(
      "SELECT COUNT(*) AS count FROM experience_ledger WHERE kind = 'CONTEXT_COMPILE'"
    ).get()).toEqual({ count: 2 });
    audit.close();
  });

  it("accepts the history-only compile option without adding a tool or widening the public result", async () => {
    const database = join(temporaryRoot, "history-only-protocol.db");
    const connection = await connect(serverEntry, database);
    const sessionId = "history-only-protocol";
    const currentInput = "CURRENT_PROTOCOL_QUERY_779 needle";
    try {
      const listed = await connection.client.listTools();
      expect(listed.tools.filter(({ name }) => name === "compile_context")).toHaveLength(1);
      expect((listed.tools.find(({ name }) => name === "compile_context")?.inputSchema as any)
        .properties.include_current_input).toEqual({ type: "boolean" });

      for (const [index, content] of ["old needle evidence", "middle turn", "recent turn"].entries()) {
        expect(parse(await connection.client.callTool({
          name: "ingest_event",
          arguments: {
            session_id: sessionId,
            role: "user",
            content,
            source_event_id: `history-only-source-${index}`,
          },
        }))).toMatchObject({ ok: true });
      }

      const compiled = parse(await connection.client.callTool({
        name: "compile_context",
        arguments: {
          session_id: sessionId,
          current_input: currentInput,
          include_current_input: false,
          recent_raw_window_turns: 1,
          operation_id: "history-only-protocol-operation",
        },
      })) as any;
      expect(compiled.ok).toBe(true);
      expect(Object.keys(compiled.result.context)).toEqual([
        "session_id", "rendered_context", "budget_exceeded", "budget_overage",
      ]);
      expect(compiled.result.context.rendered_context).toContain("old needle evidence");
      expect(compiled.result.context.rendered_context).not.toContain("## Current User Input");
      expect(compiled.result.context.rendered_context).not.toContain(currentInput);

      expect(parse(await connection.client.callTool({
        name: "compile_context",
        arguments: {
          session_id: sessionId,
          current_input: "different query",
          include_current_input: false,
          recent_raw_window_turns: 1,
          operation_id: "history-only-protocol-operation",
        },
      }))).toEqual({ ok: false, error: { code: "CONFLICT" } });
    } finally {
      await close(connection);
    }
  });

  it("projects future scoped fields away and fails closed on malformed scoped success", async () => {
    const raw = {
      id: "fake-event",
      session_id: "fake",
      seq: 1,
      role: "user",
      content: "safe raw",
      event_type: "message",
      created_at: "2026-08-26T00:00:00.000Z",
      token_count: 2,
      metadata: { safe: true },
      source_event_id: "fake-source",
      dense_embedding: { vector_space_id: "fake-space", values: [1, 0] },
      future_raw_secret: "must not pass through",
    };
    const headline = {
      id: "fake-headline",
      session_id: "fake",
      event_start_seq: 1,
      event_end_seq: 1,
      headline: "safe headline",
      keywords: ["safe"],
      created_at: "2026-08-26T00:00:00.000Z",
      future_headline_secret: "must not pass through",
    };
    const fakeService = {
      call(name: string, input: any) {
        if (name === "ingest_event") {
          return input.content === "malformed"
            ? { ok: true, result: { ...raw, metadata: undefined } }
            : { ok: true, result: raw };
        }
        if (name === "recall_exact") {
          return input.event_id === "malformed"
            ? { ok: true, result: { kind: "event_id", found: true, event: { ...raw, seq: 0 } } }
            : { ok: true, result: { kind: "event_id", found: true, event: raw } };
        }
        if (name === "recall_keyword") {
          return input.query === "malformed"
            ? { ok: true, result: [{ headline, rank: Number.NaN, events: [raw] }] }
            : { ok: true, result: [{ headline, rank: -1, events: [raw], future_hit_secret: true }] };
        }
        if (name !== "compile_context") return { ok: false, error: { code: "INVALID_INPUT" } };
        if (input.current_input === "malformed") {
          return {
            ok: true,
            result: {
              context: { session_id: "fake", budget_exceeded: false, budget_overage: 0 },
              metrics: publicMetrics(),
            },
          };
        }
        return {
          ok: true,
          result: {
            context: {
              session_id: "fake",
              rendered_context: "safe working context",
              budget_exceeded: false,
              budget_overage: 0,
              operational_debug: { score_rows: [{ combined_score: 1 }] },
              debug_manifest: { kept_raw_event_ids: ["private"] },
              future_secret: "must not pass through",
            },
            metrics: { ...publicMetrics(), future_metric: 7 },
            future_result: { candidate_event_ids: ["private"] },
          },
        };
      },
      close() {},
    } as unknown as ContextCompilerMcpService;
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const server = createContextCompilerMcpServer(fakeService);
    const client = new Client({ name: "public-projection-test", version: "1.0.0" });
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    try {
      const projected = parse(await client.callTool({
        name: "compile_context", arguments: { session_id: "fake", current_input: "ok" },
      })) as any;
      expect(projected).toEqual({
        ok: true,
        result: {
          context: {
            session_id: "fake",
            rendered_context: "safe working context",
            budget_exceeded: false,
            budget_overage: 0,
          },
          metrics: publicMetrics(),
        },
      });
      const projectedIngest = parseStructured(await client.callTool({
        name: "ingest_event", arguments: { session_id: "fake", role: "user", content: "ok" },
      })) as any;
      expect(collectKeys(projectedIngest)).not.toContain("future_raw_secret");
      expect(projectedIngest.result.dense_embedding).toEqual({
        vector_space_id: "fake-space", values: [1, 0],
      });
      const projectedExact = parseStructured(await client.callTool({
        name: "recall_exact",
        arguments: { session_id: "fake", kind: "event_id", event_id: "ok" },
      })) as any;
      expect(collectKeys(projectedExact)).not.toContain("future_raw_secret");
      expect(collectKeys(projectedExact)).not.toContain("dense_embedding");
      const projectedKeyword = parseStructured(await client.callTool({
        name: "recall_keyword", arguments: { session_id: "fake", query: "ok" },
      })) as any;
      expect(collectKeys(projectedKeyword)).not.toContain("future_hit_secret");
      expect(collectKeys(projectedKeyword)).not.toContain("future_headline_secret");
      expect(collectKeys(projectedKeyword)).not.toContain("dense_embedding");

      for (const request of [
        { name: "compile_context", arguments: { session_id: "fake", current_input: "malformed" } },
        { name: "ingest_event", arguments: { session_id: "fake", role: "user", content: "malformed" } },
        {
          name: "recall_exact",
          arguments: { session_id: "fake", kind: "event_id", event_id: "malformed" },
        },
        { name: "recall_keyword", arguments: { session_id: "fake", query: "malformed" } },
      ]) {
        const malformed = await client.callTool(request);
        expect(malformed.isError).toBe(true);
        expect(malformed.structuredContent).toBeUndefined();
        expect(parse(malformed)).toEqual({ ok: false, error: { code: "INTERNAL_FAILURE" } });
      }
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("publishes four closed output schemas and value-identical structured success results", async () => {
    const database = join(temporaryRoot, "public-result-schema-v1.db");
    const losslessMetadata = JSON.parse(
      '{"__proto__":{"retained":true},"nested":{"__proto__":{"retained":"nested"}},"constructor":{"prototype":"data"}}'
    ) as Record<string, unknown>;
    const connection = await connect(serverEntry, database);
    try {
      const listed = await connection.client.listTools();
      expect(listed.tools.filter((tool) => tool.outputSchema !== undefined).map((tool) => tool.name))
        .toEqual(["ingest_event", "compile_context", "recall_exact", "recall_keyword"]);
      for (const tool of listed.tools) {
        if (tool.outputSchema === undefined) continue;
        expect(tool.outputSchema).toMatchObject({
          type: "object",
          additionalProperties: false,
          required: ["ok", "result"],
          properties: { ok: { const: true } },
        });
        expect((tool.outputSchema as any).$defs).toMatchObject({
          ingested_raw_event: { additionalProperties: false },
          recalled_raw_event: { additionalProperties: false },
          compile_context_result: { additionalProperties: false },
        });
      }

      const ingestedCall = await connection.client.callTool({
        name: "ingest_event",
        arguments: {
          session_id: "public-result-schema-v1",
          role: "user",
          content: "public schema durable event",
          source_event_id: "public-schema-source-1",
          metadata: losslessMetadata,
          dense_embedding: { vector_space_id: "public-schema-space", values: [1, 0] },
        },
      });
      const ingested = parseStructured(ingestedCall) as any;
      expect(ingested.result).toMatchObject({
        seq: 1,
        source_event_id: "public-schema-source-1",
        dense_embedding: { vector_space_id: "public-schema-space", values: [1, 0] },
      });
      expect(Object.prototype.hasOwnProperty.call(ingested.result.metadata, "__proto__")).toBe(true);
      expect(Object.prototype.hasOwnProperty.call(ingested.result.metadata.nested, "__proto__")).toBe(true);
      expect(JSON.stringify(ingested.result.metadata)).toBe(JSON.stringify(losslessMetadata));

      const compileCall = await connection.client.callTool({
        name: "compile_context",
        arguments: { session_id: "public-result-schema-v1", current_input: "continue" },
      });
      expect(parseStructured(compileCall)).toMatchObject({
        ok: true,
        result: { context: { session_id: "public-result-schema-v1" } },
      });

      const headlineCall = await connection.client.callTool({
        name: "create_headline",
        arguments: {
          session_id: "public-result-schema-v1",
          event_start_seq: 1,
          event_end_seq: 1,
          headline: "public schema headline",
          keywords: ["public-schema-keyword"],
        },
      });
      expect(headlineCall.structuredContent).toBeUndefined();
      const headline = parse(headlineCall) as any;

      for (const argumentsValue of [
        { session_id: "public-result-schema-v1", kind: "event_id", event_id: ingested.result.id },
        {
          session_id: "public-result-schema-v1", kind: "seq_range",
          event_start_seq: 1, event_end_seq: 1,
        },
        {
          session_id: "public-result-schema-v1", kind: "headline_id",
          headline_id: headline.result.id,
        },
        { session_id: "public-result-schema-v1", kind: "event_id", event_id: "missing" },
      ]) {
        const recalled = parseStructured(await connection.client.callTool({
          name: "recall_exact", arguments: argumentsValue,
        })) as any;
        expect(recalled.ok).toBe(true);
        expect(collectKeys(recalled)).not.toContain("dense_embedding");
        if (recalled.result.found) {
          const events = recalled.result.event === undefined
            ? recalled.result.events
            : [recalled.result.event];
          for (const event of events) {
            expect(Object.prototype.hasOwnProperty.call(event.metadata, "__proto__")).toBe(true);
            expect(Object.prototype.hasOwnProperty.call(event.metadata.nested, "__proto__")).toBe(true);
            expect(JSON.stringify(event.metadata)).toBe(JSON.stringify(losslessMetadata));
          }
        }
      }

      const keyword = parseStructured(await connection.client.callTool({
        name: "recall_keyword",
        arguments: {
          session_id: "public-result-schema-v1", query: "public-schema-keyword", limit: 20,
        },
      })) as any;
      expect(keyword).toMatchObject({ ok: true, result: [{ headline: { id: headline.result.id } }] });
      expect(collectKeys(keyword)).not.toContain("dense_embedding");
      expect(JSON.stringify(keyword.result[0].events[0].metadata)).toBe(JSON.stringify(losslessMetadata));

      const invalid = await connection.client.callTool({
        name: "recall_exact",
        arguments: { session_id: "public-result-schema-v1", kind: "event_id" },
      });
      expect(invalid.isError).toBe(true);
      expect(invalid.structuredContent).toBeUndefined();
      expect(parse(invalid)).toEqual({ ok: false, error: { code: "INVALID_INPUT" } });

      const health = await connection.client.callTool({ name: "health", arguments: {} });
      expect(health.structuredContent).toBeUndefined();
    } finally {
      await close(connection);
    }
  });

  it("keeps Raw append order independent from source time and replays legacy timestamp bytes", async () => {
    const database = join(temporaryRoot, "raw-timestamp-compatibility.db");
    const sessionId = "raw-timestamp-compatibility";
    let connection = await connect(serverEntry, database);
    try {
      const first = parse(await connection.client.callTool({
        name: "ingest_event",
        arguments: {
          session_id: sessionId,
          source_event_id: "newer-source-time",
          role: "user",
          content: "append first with newer source time",
          created_at: "2026-08-02T00:00:00Z",
        },
      })) as any;
      const second = parse(await connection.client.callTool({
        name: "ingest_event",
        arguments: {
          session_id: sessionId,
          source_event_id: "older-source-time",
          role: "assistant",
          content: "append second with older source time",
          created_at: "2026-08-01T08:00:00+08:00",
        },
      })) as any;
      expect(first).toMatchObject({
        ok: true,
        result: { seq: 1, created_at: "2026-08-02T00:00:00.000Z" },
      });
      expect(second).toMatchObject({
        ok: true,
        result: { seq: 2, created_at: "2026-08-01T00:00:00.000Z" },
      });
      const compiled = parse(await connection.client.callTool({
        name: "compile_context",
        arguments: { session_id: sessionId, current_input: "continue" },
      })) as any;
      expect(compiled.ok).toBe(true);
      const rendered = compiled.result.context.rendered_context as string;
      expect(rendered.indexOf("append first with newer source time"))
        .toBeLessThan(rendered.indexOf("append second with older source time"));

      const invalid = await connection.client.callTool({
        name: "ingest_event",
        arguments: {
          session_id: sessionId,
          role: "user",
          content: "invalid time must not persist",
          created_at: "2026-02-30T00:00:00Z",
        },
      });
      expect(invalid.isError).toBe(true);
      expect(parse(invalid)).toEqual({ ok: false, error: { code: "INVALID_INPUT" } });

      const appendedLeap = parse(await connection.client.callTool({
        name: "ingest_event",
        arguments: {
          session_id: "raw-timestamp-leap-writer",
          role: "user",
          content: "new leap second append",
          created_at: "2017-01-01T07:59:60+08:00",
        },
      })) as any;
      expect(appendedLeap).toMatchObject({
        ok: true,
        result: { seq: 1, created_at: "2016-12-31T23:59:60.000Z" },
      });
      expect(parse(await connection.client.callTool({
        name: "compile_context",
        arguments: { session_id: "raw-timestamp-leap-writer", current_input: "continue" },
      }))).toMatchObject({ ok: true });
    } finally {
      await close(connection);
    }

    const legacyId = "legacy-raw-timestamp-event";
    const legacyTimestamp = "2025-12-31T23:59:59Z";
    const preciseId = "precise-raw-timestamp-event";
    const preciseTimestamp = "2025-12-31T23:59:59.1239999990Z";
    const leapId = "leap-second-raw-event";
    const leapTimestamp = "2016-12-31T23:59:60Z";
    const direct = new DatabaseSync(database);
    expect(direct.prepare(
      "SELECT COUNT(*) AS count FROM raw_events WHERE session_id = ?"
    ).get(sessionId)).toEqual({ count: 2 });
    direct.prepare(
      `INSERT INTO raw_events (
         id, session_id, seq, source_event_id, role, content,
         event_type, created_at, token_count, metadata_json, dense_embedding_json
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      legacyId,
      sessionId,
      3,
      "legacy-source-event",
      "user",
      "legacy append-only timestamp bytes",
      "message",
      legacyTimestamp,
      9,
      "{}",
      null
    );
    direct.prepare(
      `INSERT INTO raw_events (
         id, session_id, seq, source_event_id, role, content,
         event_type, created_at, token_count, metadata_json, dense_embedding_json
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      preciseId,
      sessionId,
      4,
      "precise-source-event",
      "assistant",
      "high precision append-only timestamp bytes",
      "message",
      preciseTimestamp,
      10,
      "{}",
      null
    );
    direct.prepare(
      `INSERT INTO raw_events (
         id, session_id, seq, source_event_id, role, content,
         event_type, created_at, token_count, metadata_json, dense_embedding_json
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      leapId,
      sessionId,
      5,
      "leap-second-source-event",
      "user",
      "historical leap second timestamp bytes",
      "message",
      leapTimestamp,
      9,
      "{}",
      null
    );
    direct.close();

    connection = await connect(serverEntry, database);
    let expectedRendered: string;
    try {
      const legacyRetry = parse(await connection.client.callTool({
        name: "ingest_event",
        arguments: {
          session_id: sessionId,
          source_event_id: "legacy-source-event",
          role: "user",
          content: "legacy append-only timestamp bytes",
          event_type: "message",
          created_at: legacyTimestamp,
          token_count: 9,
          metadata: {},
        },
      })) as any;
      expect(legacyRetry).toMatchObject({
        ok: true,
        result: { id: legacyId, seq: 3, created_at: legacyTimestamp },
      });
      const conflictingPrecision = await connection.client.callTool({
        name: "ingest_event",
        arguments: {
          session_id: sessionId,
          source_event_id: "precise-source-event",
          role: "assistant",
          content: "high precision append-only timestamp bytes",
          event_type: "message",
          created_at: "2025-12-31T23:59:59.123Z",
          token_count: 10,
          metadata: {},
        },
      });
      expect(conflictingPrecision.isError).toBe(true);
      expect(parse(conflictingPrecision)).toEqual({ ok: false, error: { code: "CONFLICT" } });
      const leapRetry = parse(await connection.client.callTool({
        name: "ingest_event",
        arguments: {
          session_id: sessionId,
          source_event_id: "leap-second-source-event",
          role: "user",
          content: "historical leap second timestamp bytes",
          event_type: "message",
          created_at: "2017-01-01T07:59:60.000+08:00",
          token_count: 9,
          metadata: {},
        },
      })) as any;
      expect(leapRetry).toMatchObject({
        ok: true,
        result: { id: leapId, seq: 5, created_at: leapTimestamp },
      });
      const leapFoldConflict = await connection.client.callTool({
        name: "ingest_event",
        arguments: {
          session_id: sessionId,
          source_event_id: "leap-second-source-event",
          role: "user",
          content: "historical leap second timestamp bytes",
          event_type: "message",
          created_at: "2017-01-01T00:00:00Z",
          token_count: 9,
          metadata: {},
        },
      });
      expect(leapFoldConflict.isError).toBe(true);
      expect(parse(leapFoldConflict)).toEqual({ ok: false, error: { code: "CONFLICT" } });
      const compiled = parse(await connection.client.callTool({
        name: "compile_context",
        arguments: { session_id: sessionId, current_input: "replay legacy" },
      })) as any;
      expect(compiled.ok).toBe(true);
      expectedRendered = compiled.result.context.rendered_context;
      expect(expectedRendered).toContain("legacy append-only timestamp bytes");
      expect(expectedRendered).toContain("high precision append-only timestamp bytes");
      expect(expectedRendered).toContain("historical leap second timestamp bytes");
      const recalled = parse(await connection.client.callTool({
        name: "recall_exact",
        arguments: { session_id: sessionId, kind: "event_id", event_id: legacyId },
      })) as any;
      expect(recalled).toMatchObject({
        ok: true,
        result: { found: true, event: { id: legacyId, seq: 3, created_at: legacyTimestamp } },
      });
      const recalledPrecise = parse(await connection.client.callTool({
        name: "recall_exact",
        arguments: { session_id: sessionId, kind: "event_id", event_id: preciseId },
      })) as any;
      expect(recalledPrecise).toMatchObject({
        ok: true,
        result: { found: true, event: { id: preciseId, seq: 4, created_at: preciseTimestamp } },
      });
      const recalledLeap = parse(await connection.client.callTool({
        name: "recall_exact",
        arguments: { session_id: sessionId, kind: "event_id", event_id: leapId },
      })) as any;
      expect(recalledLeap).toMatchObject({
        ok: true,
        result: { found: true, event: { id: leapId, seq: 5, created_at: leapTimestamp } },
      });
    } finally {
      await close(connection);
    }

    connection = await connect(serverEntry, database);
    try {
      const replayed = parse(await connection.client.callTool({
        name: "compile_context",
        arguments: { session_id: sessionId, current_input: "replay legacy" },
      })) as any;
      expect(replayed).toMatchObject({ ok: true });
      expect(replayed.result.context.rendered_context).toBe(expectedRendered!);
    } finally {
      await close(connection);
    }

    const audit = new DatabaseSync(database);
    expect(audit.prepare(
      "SELECT seq, created_at FROM raw_events WHERE session_id = ? ORDER BY seq"
    ).all(sessionId)).toEqual([
      { seq: 1, created_at: "2026-08-02T00:00:00.000Z" },
      { seq: 2, created_at: "2026-08-01T00:00:00.000Z" },
      { seq: 3, created_at: legacyTimestamp },
      { seq: 4, created_at: preciseTimestamp },
      { seq: 5, created_at: leapTimestamp },
    ]);
    expect(audit.prepare(
      "SELECT occurred_at FROM experience_ledger WHERE source_key = ?"
    ).get(`raw-event/${legacyId}`)).toEqual({ occurred_at: legacyTimestamp });
    audit.close();

    const corrupted = new DatabaseSync(database);
    corrupted.prepare(
      `INSERT INTO raw_events (
         id, session_id, seq, source_event_id, role, content,
         event_type, created_at, token_count, metadata_json, dense_embedding_json
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      "invalid-historical-timestamp",
      sessionId,
      6,
      "invalid-historical-source",
      "user",
      "invalid historical timestamp must fail closed",
      "message",
      "2026-02-30T00:00:00Z",
      10,
      "{}",
      null
    );
    corrupted.close();

    connection = await connect(serverEntry, database);
    try {
      const rejectedRecall = await connection.client.callTool({
        name: "recall_exact",
        arguments: {
          session_id: sessionId,
          kind: "event_id",
          event_id: "invalid-historical-timestamp",
        },
      });
      expect(rejectedRecall.isError).toBe(true);
      expect(parse(rejectedRecall)).toEqual({ ok: false, error: { code: "STORAGE_FAILURE" } });
      const rejectedReplay = await connection.client.callTool({
        name: "compile_context",
        arguments: { session_id: sessionId, current_input: "reject corrupt replay" },
      });
      expect(rejectedReplay.isError).toBe(true);
      expect(parse(rejectedReplay)).toEqual({ ok: false, error: { code: "INVALID_INPUT" } });
    } finally {
      await close(connection);
    }
  });

  it("starts from an npm package with only declared runtime dependencies", async () => {
    const packagedRoot = join(temporaryRoot, "packaged");
    const npmCache = join(temporaryRoot, "npm-cache");
    mkdirSync(packagedRoot, { recursive: true });
    const packed = JSON.parse(execFileSync(npmCommand(), [
      "pack", "--json", "--ignore-scripts", "--cache", npmCache,
      "--pack-destination", packagedRoot,
    ], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] })) as Array<{
      filename: string;
    }>;
    expect(packed).toHaveLength(1);
    const archive = join(packagedRoot, packed[0]!.filename);
    execFileSync("tar", ["-xzf", archive, "-C", packagedRoot], { stdio: "pipe" });
    const packageRoot = join(packagedRoot, "package");
    cpSync(join(root, "package-lock.json"), join(packageRoot, "package-lock.json"));
    cpSync(join(root, "node_modules"), join(packageRoot, "node_modules"), { recursive: true });
    execFileSync(npmCommand(), [
      "prune", "--omit=dev", "--ignore-scripts", "--offline", "--no-audit", "--no-fund",
      "--cache", npmCache,
    ], { cwd: packageRoot, stdio: "pipe" });
    const packageMetadata = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8")) as {
      name?: string;
    };
    expect(packageMetadata.name).toBe("context-compiler-mcp");
    expect(existsSync(join(packageRoot, "node_modules", "@modelcontextprotocol", "sdk"))).toBe(true);
    expect(existsSync(join(packageRoot, "node_modules", "zod"))).toBe(true);
    expect(existsSync(join(packageRoot, "node_modules", "vitest"))).toBe(false);
    expect(existsSync(join(packageRoot, "node_modules", "typescript"))).toBe(false);
    const packagedDatabase = join(temporaryRoot, "packaged.db");
    const connection = await connect(
      join(packageRoot, "dist", "mcp-server.js"), packagedDatabase, packageRoot
    );
    try {
      expect(parse(await connection.client.callTool({ name: "health", arguments: {} }))).toMatchObject({ ok: true, result: { ready: true } });
      expect(parse(await connection.client.callTool({
        name: "ingest_event",
        arguments: {
          session_id: "packaged-timestamp",
          role: "user",
          content: "packaged newer time",
          created_at: "2026-08-02T00:00:00Z",
        },
      }))).toMatchObject({ ok: true, result: { seq: 1, created_at: "2026-08-02T00:00:00.000Z" } });
      expect(parse(await connection.client.callTool({
        name: "ingest_event",
        arguments: {
          session_id: "packaged-timestamp",
          role: "assistant",
          content: "packaged older time",
          created_at: "2026-08-01T00:00:00Z",
        },
      }))).toMatchObject({ ok: true, result: { seq: 2, created_at: "2026-08-01T00:00:00.000Z" } });
      expect(parse(await connection.client.callTool({
        name: "compile_context",
        arguments: { session_id: "packaged-timestamp", current_input: "continue" },
      }))).toMatchObject({ ok: true, result: { context: { session_id: "packaged-timestamp" } } });
      expect(connection.stderr.join("")).toBe("");
    } finally {
      await close(connection);
    }

    if (process.platform !== "win32") {
      const applicationRoot = join(packagedRoot, "application");
      const applicationModules = join(applicationRoot, "node_modules");
      const installedPackage = join(applicationModules, "context-compiler-mcp");
      const binDirectory = join(applicationModules, ".bin");
      mkdirSync(binDirectory, { recursive: true });
      renameSync(packageRoot, installedPackage);
      const evaluationEntry = join(installedPackage, "dist", "evaluation-cli.js");
      chmodSync(evaluationEntry, 0o755);
      const evaluationBin = join(binDirectory, "context-compiler-eval");
      symlinkSync("../context-compiler-mcp/dist/evaluation-cli.js", evaluationBin);

      const validEvaluation = spawnSync(evaluationBin, [
        join(root, "test", "fixtures", "evaluation-suite.json"),
      ], { cwd: applicationRoot, encoding: "utf8" });
      expect(validEvaluation.status).toBe(0);
      expect(validEvaluation.stderr).toBe("");
      expect(JSON.parse(validEvaluation.stdout)).toMatchObject({ version: 1, passed: true });

      const calibratedEvaluation = spawnSync(evaluationBin, [
        join(root, "test", "fixtures", "evaluation-v2-calibration.json"),
      ], { cwd: applicationRoot, encoding: "utf8" });
      expect(calibratedEvaluation.status).toBe(0);
      expect(calibratedEvaluation.stderr).toBe("");
      expect(JSON.parse(calibratedEvaluation.stdout)).toMatchObject({
        version: 2,
        passed: true,
        cases: [
          {
            id: "calibration-empty-probes",
            dimensions: {
              d2: { constraint_retention: { status: "not_evaluable", rate: null } },
            },
          },
          {
            id: "calibration-current-input-contamination",
            dimensions: {
              d1: { constraint_retention: { status: "evaluable", matched: 0 } },
              d2: { constraint_retention: { status: "evaluable", matched: 0 } },
            },
          },
          {
            id: "calibration-d2-cost",
            d2_vs_d1_tokens: { status: "evaluable" },
          },
        ],
      });
      const calibratedReport = JSON.parse(calibratedEvaluation.stdout) as {
        cases: Array<{ d2_vs_d1_tokens: { ratio: number | null } }>;
      };
      expect(calibratedReport.cases[2]!.d2_vs_d1_tokens.ratio).toBeGreaterThan(1);

      const missingEvaluation = spawnSync(evaluationBin, [
        join(applicationRoot, "missing-evaluation-suite.json"),
      ], { cwd: applicationRoot, encoding: "utf8" });
      expect(missingEvaluation.status).toBe(4);
      expect(missingEvaluation.stdout).toBe("");
      expect(JSON.parse(missingEvaluation.stderr)).toEqual({
        version: 1, passed: false, error: { code: "RUNTIME_FAILURE" },
      });

      const packagedApi = await import(
        pathToFileURL(join(installedPackage, "dist", "index.js")).href
      ) as typeof import("../src/index.js");
      const runtimeDatabase = join(temporaryRoot, "packaged-runtime.db");
      const packagedRawStore = new packagedApi.SqliteRawHistoryStore(runtimeDatabase);
      const packagedStateStore = new packagedApi.SqliteContextStateStore(runtimeDatabase);
      const packagedTransport = new packagedApi.JsonSubprocessExtractorTransport({
        executable: process.execPath,
        args: [join(root, "test", "fixtures", "extractor-worker.mjs"), "goal"],
      });
      try {
        const runtimeEvent = packagedRawStore.ingest({
          session_id: "packaged-runtime",
          role: "user",
          content: "create packaged runtime state",
        });
        const runtimeResult = await packagedApi.runStateUpdate(
          packagedStateStore,
          packagedTransport,
          { session_id: "packaged-runtime", newest_event_ids: [runtimeEvent.id] }
        );
        expect(runtimeResult).toMatchObject({
          extraction: { fallback_used: false },
          application: { changed: true, revision: 1 },
        });
      } finally {
        await packagedTransport.close();
        packagedStateStore.close();
        packagedRawStore.close();
      }
    }
  }, 60_000);

  it("fails startup without a database environment using only a stable diagnostic", async () => {
    const child = spawn(process.execPath, [serverEntry], {
      cwd: temporaryRoot,
      env: {},
      stdio: ["pipe", "pipe", "pipe"],
    });
    const stdout: string[] = [];
    const stderr: string[] = [];
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => stdout.push(String(chunk)));
    child.stderr.on("data", (chunk) => stderr.push(String(chunk)));
    const exitCode = await new Promise<number | null>((resolvePromise, rejectPromise) => {
      child.once("error", rejectPromise);
      child.once("close", resolvePromise);
    });
    expect(exitCode).toBe(1);
    expect(stdout.join("")).toBe("");
    expect(stderr.join("")).toBe("CONTEXT_COMPILER_STARTUP_FAILURE\n");
  });

  it("filters only the exact SQLite warning and restores emitWarning on every in-process path", async () => {
    const original = process.emitWarning;
    const forwarded: Array<{ warning: string | Error; arguments_: unknown[] }> = [];
    const spy = ((warning: string | Error, ...arguments_: unknown[]) => {
      forwarded.push({ warning, arguments_ });
    }) as typeof process.emitWarning;
    process.emitWarning = spy;
    try {
      const missingPair = InMemoryTransport.createLinkedPair();
      await expect(runContextCompilerMcpServer({}, missingPair[0])).rejects.toThrow();
      expect(process.emitWarning).toBe(spy);

      const invalidDatabaseDirectory = join(temporaryRoot, "database-directory");
      mkdirSync(invalidDatabaseDirectory, { recursive: true });
      const constructionPair = InMemoryTransport.createLinkedPair();
      await expect(runContextCompilerMcpServer(
        { CONTEXT_COMPILER_DB_PATH: invalidDatabaseDirectory }, constructionPair[0]
      )).rejects.toThrow();
      expect(process.emitWarning).toBe(spy);

      const failingTransport = {
        async start() {
          process.emitWarning(
            "SQLite is an experimental feature and might change at any time",
            "ExperimentalWarning"
          );
          process.emitWarning("security-sentinel", "SecurityWarning");
          throw new Error("connect failure");
        },
        async send() {},
        async close() { this.onclose?.(); },
        onclose: undefined as (() => void) | undefined,
        onerror: undefined as ((error: Error) => void) | undefined,
        onmessage: undefined as ((message: any) => void) | undefined,
      };
      await expect(runContextCompilerMcpServer(
        { CONTEXT_COMPILER_DB_PATH: join(temporaryRoot, "connect-failure.db") },
        failingTransport
      )).rejects.toThrow("connect failure");
      expect(process.emitWarning).toBe(spy);
      expect(forwarded.map((entry) => entry.warning)).toContain("security-sentinel");
      expect(forwarded.map((entry) => entry.warning)).not.toContain(
        "SQLite is an experimental feature and might change at any time"
      );

      const sigintBeforeClientClose = new Set(process.listeners("SIGINT"));
      const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
      await runContextCompilerMcpServer(
        { CONTEXT_COMPILER_DB_PATH: join(temporaryRoot, "client-close.db") },
        serverTransport
      );
      const inProcessClient = new Client({ name: "lifecycle-test", version: "1.0.0" });
      await inProcessClient.connect(clientTransport);
      expect((await inProcessClient.listTools()).tools).toHaveLength(9);
      await inProcessClient.close();
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 0));
      expect(process.emitWarning).toBe(spy);
      expect(process.listeners("SIGINT").every((listener) => sigintBeforeClientClose.has(listener))).toBe(true);

      for (const signal of ["SIGINT", "SIGTERM"] as const) {
        const listenersBefore = new Set(process.listeners(signal));
        const [serverTransport] = InMemoryTransport.createLinkedPair();
        const originalStart = serverTransport.start.bind(serverTransport);
        serverTransport.start = async () => {
          process.emitWarning("lifecycle-sentinel", "DeprecationWarning");
          await originalStart();
        };
        await runContextCompilerMcpServer(
          { CONTEXT_COMPILER_DB_PATH: join(temporaryRoot, `${signal}.db`) },
          serverTransport
        );
        expect(process.emitWarning).toBe(spy);
        const signalHandler = process.listeners(signal).find((listener) => !listenersBefore.has(listener));
        expect(signalHandler).toBeDefined();
        signalHandler?.(signal);
        await new Promise((resolvePromise) => setTimeout(resolvePromise, 0));
        expect(process.listeners(signal).every((listener) => listenersBefore.has(listener))).toBe(true);
        expect(process.emitWarning).toBe(spy);
      }
      process.emitWarning("after-lifecycle", "DeprecationWarning");
      expect(forwarded.map((entry) => entry.warning)).toEqual(expect.arrayContaining([
        "security-sentinel", "lifecycle-sentinel", "after-lifecycle",
      ]));
    } finally {
      process.emitWarning = original;
    }
  });

  it("coordinates overlapping warning-filter leases regardless of runner completion order", async () => {
    const original = process.emitWarning;
    const forwarded: string[] = [];
    const spy = ((warning: string | Error) => {
      forwarded.push(typeof warning === "string" ? warning : warning.message);
    }) as typeof process.emitWarning;
    const listenerBaselines = {
      SIGINT: new Set(process.listeners("SIGINT")),
      SIGTERM: new Set(process.listeners("SIGTERM")),
      beforeExit: new Set(process.listeners("beforeExit")),
    };
    process.emitWarning = spy;
    try {
      for (const completionOrder of [[0, 1], [1, 0]] as const) {
        const first = delayedInMemoryTransport();
        const second = delayedInMemoryTransport();
        const firstRun = runContextCompilerMcpServer(
          { CONTEXT_COMPILER_DB_PATH: join(temporaryRoot, `overlap-${completionOrder.join("")}-a.db`) },
          first.transport
        );
        await first.started;
        const filterIdentity = process.emitWarning;
        expect(filterIdentity).not.toBe(spy);
        const secondRun = runContextCompilerMcpServer(
          { CONTEXT_COMPILER_DB_PATH: join(temporaryRoot, `overlap-${completionOrder.join("")}-b.db`) },
          second.transport
        );
        await second.started;
        expect(process.emitWarning).toBe(filterIdentity);
        const forwardedBefore = forwarded.filter((value) => value === "overlap-forwarded").length;
        emitWarningSentinels();
        expect(forwarded.filter((value) => value === "overlap-forwarded")).toHaveLength(
          forwardedBefore + 1
        );

        const runs = [firstRun, secondRun] as const;
        const controls = [first, second] as const;
        controls[completionOrder[0]].release();
        await runs[completionOrder[0]];
        expect(process.emitWarning).toBe(filterIdentity);
        emitWarningSentinels();
        expect(forwarded.filter((value) => value === "overlap-forwarded")).toHaveLength(
          forwardedBefore + 2
        );
        controls[completionOrder[1]].release();
        await runs[completionOrder[1]];
        expect(process.emitWarning).toBe(spy);
        await Promise.all([first.transport.close(), second.transport.close()]);
        await new Promise((resolvePromise) => setTimeout(resolvePromise, 0));
      }

      const success = delayedInMemoryTransport();
      const successRun = runContextCompilerMcpServer(
        { CONTEXT_COMPILER_DB_PATH: join(temporaryRoot, "overlap-success.db") },
        success.transport
      );
      await success.started;
      const mixedFilterIdentity = process.emitWarning;
      const failing = failingStartTransport("mixed connect failure");
      await expect(runContextCompilerMcpServer(
        { CONTEXT_COMPILER_DB_PATH: join(temporaryRoot, "overlap-failure.db") },
        failing
      )).rejects.toThrow("mixed connect failure");
      expect(process.emitWarning).toBe(mixedFilterIdentity);
      success.release();
      await successRun;
      expect(process.emitWarning).toBe(spy);
      await success.transport.close();

      const threeRunners = [
        delayedInMemoryTransport(), delayedInMemoryTransport(), delayedInMemoryTransport(),
      ] as const;
      const threeRuns = threeRunners.map((control, index) => runContextCompilerMcpServer(
        { CONTEXT_COMPILER_DB_PATH: join(temporaryRoot, `overlap-three-${index}.db`) },
        control.transport
      ));
      await Promise.all(threeRunners.map((control) => control.started));
      const threeRunnerIdentity = process.emitWarning;
      expect(threeRunnerIdentity).not.toBe(spy);
      for (const index of [1, 0]) {
        threeRunners[index].release();
        await threeRuns[index];
        expect(process.emitWarning).toBe(threeRunnerIdentity);
      }
      threeRunners[2].release();
      await threeRuns[2];
      expect(process.emitWarning).toBe(spy);
      await Promise.all(threeRunners.map((control) => control.transport.close()));

      const eightReleases = Array.from(
        { length: 8 },
        () => acquireSqliteExperimentalWarningFilter()
      );
      const eightLeaseIdentity = process.emitWarning;
      const releaseOrder = [3, 0, 6, 1, 7, 2, 5, 4];
      for (const [position, index] of releaseOrder.entries()) {
        eightReleases[index]!();
        eightReleases[index]!();
        expect(process.emitWarning).toBe(
          position === releaseOrder.length - 1 ? spy : eightLeaseIdentity
        );
      }

      await new Promise((resolvePromise) => setTimeout(resolvePromise, 0));
      for (const [event, baseline] of Object.entries(listenerBaselines) as Array<
        [keyof typeof listenerBaselines, Set<(...arguments_: any[]) => void>]
      >) {
        const listeners = process.listeners(event);
        expect(listeners).toHaveLength(baseline.size);
        expect(listeners.every((listener) => baseline.has(listener))).toBe(true);
      }
    } finally {
      process.emitWarning = original;
    }
  });

  it("preserves chained and plain external warning replacements without recursion", () => {
    const original = process.emitWarning;
    const forwarded: string[] = [];
    const spy = ((warning: string | Error) => {
      forwarded.push(typeof warning === "string" ? warning : warning.message);
    }) as typeof process.emitWarning;
    process.emitWarning = spy;
    try {
      const releaseA = acquireSqliteExperimentalWarningFilter();
      const releaseB = acquireSqliteExperimentalWarningFilter();
      const capturedFilter = process.emitWarning;
      const chained = ((warning: string | Error, ...arguments_: unknown[]) => {
        Reflect.apply(capturedFilter, process, [warning, ...arguments_]);
      }) as typeof process.emitWarning;
      process.emitWarning = chained;

      const releaseC = acquireSqliteExperimentalWarningFilter();
      expect(process.emitWarning).toBe(chained);
      emitExternalWarningSet();
      expect(forwarded).toEqual(["external-security", "external-deprecation"]);
      releaseB();
      releaseB();
      expect(process.emitWarning).toBe(chained);
      emitExternalWarningSet();
      expect(forwarded).toEqual([
        "external-security", "external-deprecation",
        "external-security", "external-deprecation",
      ]);
      releaseC();
      releaseA();
      expect(process.emitWarning).toBe(chained);

      process.emitWarning = spy;
      const plainReleaseA = acquireSqliteExperimentalWarningFilter();
      const plainReleaseB = acquireSqliteExperimentalWarningFilter();
      const plainForwarded: string[] = [];
      const plain = ((warning: string | Error) => {
        plainForwarded.push(typeof warning === "string" ? warning : warning.message);
      }) as typeof process.emitWarning;
      process.emitWarning = plain;
      const plainReleaseC = acquireSqliteExperimentalWarningFilter();
      expect(process.emitWarning).toBe(plain);
      process.emitWarning("plain-security", "SecurityWarning");
      expect(plainForwarded).toEqual(["plain-security"]);
      plainReleaseB();
      plainReleaseC();
      expect(process.emitWarning).toBe(plain);
      plainReleaseA();
      expect(process.emitWarning).toBe(plain);
    } finally {
      process.emitWarning = original;
    }
  });

  it("allows only one conflicting non-empty apply across independent server processes", async () => {
    const concurrentDatabase = join(temporaryRoot, "concurrent-apply.db");
    const first = await connect(serverEntry, concurrentDatabase);
    const second = await connect(serverEntry, concurrentDatabase);
    try {
      const ingested = parse(await first.client.callTool({
        name: "ingest_event",
        arguments: { session_id: "concurrent", role: "user", content: "race source" },
      })) as any;
      const eventId = ingested.result.id as string;
      const prepared = await Promise.all([first, second].map(async (connection) => {
        const result = parse(await connection.client.callTool({
          name: "prepare_state_update",
          arguments: { session_id: "concurrent", newest_event_ids: [eventId] },
        })) as any;
        expect(result).toMatchObject({ ok: true, result: { expected_revision: 0 } });
        return result.result;
      }));

      const results = await Promise.all([first, second].map(async (connection, index) =>
        parse(await connection.client.callTool({
          name: "apply_state_delta",
          arguments: {
            session_id: "concurrent",
            preparation_token: prepared[index].preparation_token,
            fingerprint: prepared[index].fingerprint,
            expected_revision: prepared[index].expected_revision,
            delta: {
              ...emptyDelta(),
              new_goals: [{ content: `winner-${index}`, source_refs: [eventId] }],
            },
          },
        })) as any
      ));

      expect(results.filter((result) => result.ok)).toHaveLength(1);
      expect(results.filter((result) => !result.ok)).toEqual([
        { ok: false, error: { code: "CONFLICT" } },
      ]);
      expect(parse(await first.client.callTool({
        name: "get_state", arguments: { session_id: "concurrent" },
      }))).toMatchObject({ ok: true, result: { revision: 1, items: [{ type: "GOAL" }] } });
    } finally {
      await Promise.all([close(first), close(second)]);
    }
  });

});

interface CompileBoundaryWorkerResult {
  type: "origin_result" | "contender_result";
  response?: any;
  event_id?: string;
  no_id_response?: any;
  state?: any;
}

function seedCompileBoundaryDatabase(database: string, sessionId: string): void {
  const service = new ContextCompilerMcpService(database);
  try {
    expect(service.call("ingest_event", {
      session_id: sessionId,
      role: "user",
      content: "initial boundary evidence",
      source_event_id: `${sessionId}-initial-source`,
    })).toMatchObject({ ok: true, result: { seq: 1 } });
  } finally {
    service.close();
  }
}

function addUserTurns(
  service: ContextCompilerMcpService,
  sessionId: string,
  first: number,
  last: number
): void {
  for (let index = first; index <= last; index += 1) {
    expect(service.call("ingest_event", {
      session_id: sessionId,
      role: "user",
      content: `timeline ${index}`,
      source_event_id: `${sessionId}-timeline-${index}`,
    })).toMatchObject({ ok: true, result: { seq: index } });
  }
}

async function runCompileTelemetryBoundaryInterleaving(
  database: string,
  sessionId: string,
  rollback: boolean
): Promise<{
  origin: CompileBoundaryWorkerResult;
  contender: CompileBoundaryWorkerResult;
  blocked_before_release: boolean;
  trace_count_before_release: number;
}> {
  const boundary = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT * 6);
  const view = new Int32Array(boundary);
  const workerEntry = join(root, "test", "fixtures", "compile-telemetry-boundary-worker.mjs");
  const originWorker = new Worker(workerEntry, {
    workerData: {
      root,
      database,
      session_id: sessionId,
      kind: "origin",
      operation_id: rollback ? "first-origin-rollback" : "first-origin-commit",
      rollback,
      boundary,
    },
    execArgv: ["--no-warnings"],
  });
  const contenderWorker = new Worker(workerEntry, {
    workerData: { root, database, session_id: sessionId, kind: "contender", boundary },
    execArgv: ["--no-warnings"],
  });
  const originResult = boundaryWorkerResult(originWorker, "origin_result");
  const contenderStarted = boundaryWorkerMessage(contenderWorker, "contender_started");
  const contenderResult = boundaryWorkerResult(contenderWorker, "contender_result");
  const originExit = boundaryWorkerExit(originWorker);
  const contenderExit = boundaryWorkerExit(contenderWorker);
  let released = false;
  try {
    await waitForAtomicValue(view, 1, 1);
    const audit = new DatabaseSync(database);
    const traceCountBeforeRelease = (audit.prepare(
      "SELECT COUNT(*) AS count FROM experience_ledger WHERE kind = 'CONTEXT_COMPILE'"
    ).get() as { count: number }).count;
    audit.close();

    Atomics.store(view, 2, 1);
    Atomics.notify(view, 2);
    await contenderStarted;
    await waitForAtomicValue(view, 4, 1);
    await new Promise<void>((resolvePromise) => setTimeout(resolvePromise, 100));
    const blockedBeforeRelease = Atomics.load(view, 5) === 0;
    Atomics.store(view, 3, 1);
    Atomics.notify(view, 3);
    released = true;
    const [origin, contender] = await Promise.all([originResult, contenderResult]);
    await Promise.all([originExit, contenderExit]);
    return {
      origin,
      contender,
      blocked_before_release: blockedBeforeRelease,
      trace_count_before_release: traceCountBeforeRelease,
    };
  } finally {
    if (!released) {
      Atomics.store(view, 2, 1);
      Atomics.notify(view, 2);
      Atomics.store(view, 3, 1);
      Atomics.notify(view, 3);
    }
    await Promise.allSettled([originWorker.terminate(), contenderWorker.terminate()]);
  }
}

function boundaryWorkerResult(
  worker: Worker,
  expectedType: CompileBoundaryWorkerResult["type"]
): Promise<CompileBoundaryWorkerResult> {
  return new Promise((resolvePromise, rejectPromise) => {
    worker.on("message", (message: { type?: string; error?: { message?: string } }) => {
      if (message.type === expectedType) resolvePromise(message as CompileBoundaryWorkerResult);
      if (message.type === "worker_error") {
        rejectPromise(new Error(message.error?.message ?? "compile boundary worker failed"));
      }
    });
    worker.once("error", rejectPromise);
  });
}

function boundaryWorkerMessage(worker: Worker, expectedType: string): Promise<void> {
  return new Promise((resolvePromise, rejectPromise) => {
    worker.on("message", (message: { type?: string; error?: { message?: string } }) => {
      if (message.type === expectedType) resolvePromise();
      if (message.type === "worker_error") {
        rejectPromise(new Error(message.error?.message ?? "compile boundary worker failed"));
      }
    });
    worker.once("error", rejectPromise);
  });
}

function boundaryWorkerExit(worker: Worker): Promise<void> {
  return new Promise((resolvePromise, rejectPromise) => {
    worker.once("exit", (code) => {
      if (code === 0) resolvePromise();
      else rejectPromise(new Error(`Compile boundary worker exited ${code}`));
    });
  });
}

async function waitForAtomicValue(
  view: Int32Array,
  index: number,
  expected: number
): Promise<void> {
  const deadline = Date.now() + 10_000;
  while (Atomics.load(view, index) !== expected) {
    if (Date.now() >= deadline) throw new Error(`Timed out waiting for boundary index ${index}`);
    await new Promise<void>((resolvePromise) => setTimeout(resolvePromise, 5));
  }
}

type FreshWorkerKind =
  | "raw_open"
  | "service_health"
  | "raw_ingest"
  | "service_compile"
  | "stdio_health";

interface FreshWorkerResult {
  type: "result";
  ok: boolean;
  response?: any;
  event_id?: string;
  error?: { name: string; message: string; code: unknown };
}

async function runFreshDatabaseBarrier(
  kind: FreshWorkerKind,
  database: string
): Promise<FreshWorkerResult[]> {
  const barrier = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT);
  const view = new Int32Array(barrier);
  const workerEntry = join(root, "test", "fixtures", "fresh-db-startup-worker.mjs");
  const workers = [0, 1].map(() => new Worker(workerEntry, {
    workerData: { root, database, kind, barrier },
    execArgv: ["--no-warnings"],
  }));
  const tasks = workers.map((worker) => {
    let readyResolve!: () => void;
    let resultResolve!: (result: FreshWorkerResult) => void;
    const ready = new Promise<void>((resolvePromise) => { readyResolve = resolvePromise; });
    const result = new Promise<FreshWorkerResult>((resolvePromise, rejectPromise) => {
      resultResolve = resolvePromise;
      worker.once("error", rejectPromise);
    });
    const exited = new Promise<void>((resolvePromise, rejectPromise) => {
      worker.once("exit", (code) => {
        if (code === 0) resolvePromise();
        else rejectPromise(new Error(`Fresh DB worker exited ${code}`));
      });
    });
    worker.on("message", (message: { type?: string }) => {
      if (message.type === "ready") readyResolve();
      if (message.type === "result") resultResolve(message as FreshWorkerResult);
    });
    return { ready, result, exited };
  });
  await Promise.all(tasks.map(({ ready }) => ready));
  Atomics.store(view, 0, 1);
  Atomics.notify(view, 0, workers.length);
  const results = await Promise.all(tasks.map(({ result }) => result));
  await Promise.all(tasks.map(({ exited }) => exited));
  return results;
}

function createLegacyRawDatabase(database: string, fixtureId: string): void {
  const direct = new DatabaseSync(database);
  try {
    direct.exec(`
      CREATE TABLE sessions (
        id TEXT PRIMARY KEY,
        created_at TEXT NOT NULL
      );
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
    `);
    direct.prepare("INSERT INTO sessions (id, created_at) VALUES (?, ?)")
      .run(fixtureId, "2026-08-24T00:00:00.000Z");
    direct.prepare(`
      INSERT INTO raw_events (
        id, session_id, seq, source_event_id, role, content,
        event_type, created_at, token_count, metadata_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      `${fixtureId}-event`, fixtureId, 1, `${fixtureId}-source`, "user", "preserve bytes",
      "message", "2026-08-24T00:00:00.000Z", 3, '{"legacy":true}'
    );
  } finally {
    direct.close();
  }
}

function assertLegacyMigration(database: string, fixtureId: string): void {
  const audit = new DatabaseSync(database);
  try {
    const columns = audit.prepare("PRAGMA table_info(raw_events)").all() as Array<{
      cid: number;
      name: string;
      type: string;
      notnull: number;
      dflt_value: string | null;
      pk: number;
    }>;
    expect(columns.filter(({ name }) => name === "dense_embedding_json")).toEqual([{
      cid: 10,
      name: "dense_embedding_json",
      type: "TEXT",
      notnull: 0,
      dflt_value: null,
      pk: 0,
    }]);
    expect(audit.prepare(`
      SELECT id, session_id, seq, source_event_id, role, content,
             event_type, created_at, token_count, metadata_json, dense_embedding_json
      FROM raw_events
    `).all()).toEqual([{
      id: `${fixtureId}-event`,
      session_id: fixtureId,
      seq: 1,
      source_event_id: `${fixtureId}-source`,
      role: "user",
      content: "preserve bytes",
      event_type: "message",
      created_at: "2026-08-24T00:00:00.000Z",
      token_count: 3,
      metadata_json: '{"legacy":true}',
      dense_embedding_json: null,
    }]);
    expect(audit.prepare(`
      SELECT name FROM sqlite_master
      WHERE type = 'trigger' AND tbl_name = 'raw_events'
      ORDER BY name
    `).all()).toEqual([
      { name: "raw_events_prevent_delete" },
      { name: "raw_events_prevent_update" },
    ]);
    expect(audit.prepare(`
      SELECT session_id, seq, kind, source_key, raw_event_ids_json
      FROM experience_ledger
      ORDER BY seq
    `).all()).toEqual([{
      session_id: fixtureId,
      seq: 1,
      kind: "EVENT",
      source_key: `raw-event/${fixtureId}-event`,
      raw_event_ids_json: `["${fixtureId}-event"]`,
    }]);
  } finally {
    audit.close();
  }
}

function emptyDelta() {
  return {
    new_goals: [],
    updated_goals: [],
    new_constraints: [],
    updated_constraints: [],
    new_decisions: [],
    resolved_questions: [],
    new_open_questions: [],
    rejected_alternatives: [],
    supersessions: [],
    new_relations: [],
  };
}

const FORBIDDEN_PUBLIC_COMPILE_KEYS = [
  "operational_debug",
  "debug_manifest",
  "candidate_turn_count",
  "candidate_seq_start",
  "candidate_seq_end",
  "candidate_event_ids",
  "score_rows",
  "bm25_raw",
  "bm25_normalized",
  "dense_cosine",
  "dense_nonnegative",
  "combined_score",
  "selected",
  "retrieved_event_ids",
  "telemetry_baseline_seq",
  "telemetry_baseline_raw_seq",
  "compile_trace_id",
  "compile_trace_seq",
  "retrieval_hit_ledger_ids",
  "kept_state_ids",
  "suppressed_state_ids",
  "kept_raw_event_ids",
  "dependency_edges",
  "dependency_paths",
  "dormant_state_ids",
  "reactivated_state_ids",
  "dependency_rescued_state_ids",
  "future_secret",
  "future_metric",
  "future_result",
] as const;

function collectKeys(value: unknown, result: string[] = []): string[] {
  if (Array.isArray(value)) {
    for (const item of value) collectKeys(item, result);
    return result;
  }
  if (typeof value !== "object" || value === null) return result;
  for (const [key, child] of Object.entries(value)) {
    result.push(key);
    collectKeys(child, result);
  }
  return result;
}

function publicMetrics() {
  return {
    full_context_tokens: 1,
    compiled_context_tokens: 2,
    recent_window_tokens: 3,
    active_state_tokens: 4,
    retrieved_tokens: 5,
    compile_latency_ms: 6,
    extractor_latency_ms: 0,
    active_state_items: 7,
    suppressed_items: 8,
  };
}

function npmCommand(): string {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

function emitWarningSentinels(): void {
  process.emitWarning(
    "SQLite is an experimental feature and might change at any time",
    "ExperimentalWarning"
  );
  process.emitWarning("overlap-forwarded", "SecurityWarning");
}

function emitExternalWarningSet(): void {
  process.emitWarning(
    "SQLite is an experimental feature and might change at any time",
    "ExperimentalWarning"
  );
  process.emitWarning("external-security", "SecurityWarning");
  process.emitWarning("external-deprecation", "DeprecationWarning");
}

function delayedInMemoryTransport(): {
  transport: InMemoryTransport;
  started: Promise<void>;
  release: () => void;
} {
  const [transport] = InMemoryTransport.createLinkedPair();
  const originalStart = transport.start.bind(transport);
  let markStarted!: () => void;
  let releaseStart!: () => void;
  const started = new Promise<void>((resolvePromise) => { markStarted = resolvePromise; });
  const gate = new Promise<void>((resolvePromise) => { releaseStart = resolvePromise; });
  transport.start = async () => {
    markStarted();
    await gate;
    await originalStart();
  };
  return { transport, started, release: releaseStart };
}

function failingStartTransport(message: string) {
  return {
    async start() { throw new Error(message); },
    async send() {},
    async close() { this.onclose?.(); },
    onclose: undefined as (() => void) | undefined,
    onerror: undefined as ((error: Error) => void) | undefined,
    onmessage: undefined as ((message: any) => void) | undefined,
  };
}

interface Connection {
  client: Client;
  transport: StdioClientTransport;
  stderr: string[];
  pid: number;
}

async function connect(entry: string, database: string, cwd = temporaryRoot): Promise<Connection> {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [entry],
    cwd,
    env: { CONTEXT_COMPILER_DB_PATH: database },
    stderr: "pipe",
  });
  const stderr: string[] = [];
  transport.stderr?.setEncoding("utf8");
  transport.stderr?.on("data", (chunk) => stderr.push(String(chunk)));
  const client = new Client({ name: "context-compiler-test", version: "1.0.0" });
  try {
    await client.connect(transport);
  } catch (error) {
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 20));
    throw new Error(`${error instanceof Error ? error.message : String(error)}; stderr=${stderr.join("")}`);
  }
  const pid = transport.pid;
  if (pid === null) throw new Error("MCP child has no pid");
  return { client, transport, stderr, pid };
}

async function close(connection: Connection): Promise<void> {
  await connection.client.close();
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try { process.kill(connection.pid, 0); } catch { return; }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 10));
  }
  throw new Error(`MCP child ${connection.pid} remained alive after close`);
}

function parse(result: Awaited<ReturnType<Client["callTool"]>>): unknown {
  const content = result.content;
  if (!Array.isArray(content) || content.length !== 1 || content[0]?.type !== "text") {
    throw new Error("Expected one JSON text content item");
  }
  return JSON.parse(content[0].text);
}

function parseStructured(result: Awaited<ReturnType<Client["callTool"]>>): unknown {
  const parsed = parse(result);
  expect(result.structuredContent).toEqual(parsed);
  return parsed;
}
