#!/usr/bin/env node

import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type CallToolResult,
  type Tool,
} from "@modelcontextprotocol/sdk/types.js";
import type {
  ContextCompilerMcpService,
  ContextCompilerToolName,
} from "./mcp-service.js";

const CONTEXT_COMPILER_SERVICE_VERSION = "0.1.0";
const CONTEXT_COMPILER_CAPABILITIES: readonly ContextCompilerToolName[] = [
  "health", "ingest_event", "compile_context", "get_state",
  "prepare_state_update", "apply_state_delta",
  "create_headline", "recall_exact", "recall_keyword",
];

const sessionId = { type: "string", minLength: 1 } as const;
const nonBlank = { type: "string", minLength: 1, pattern: "\\S" } as const;
const positiveInteger = { type: "integer", minimum: 1 } as const;
const identifier = { ...nonBlank, maxLength: 500 } as const;
const identifierArray = {
  type: "array",
  uniqueItems: true,
  items: identifier,
} as const;

const newItemDeltaSchema = objectSchema({
  content: nonBlank,
  source_refs: identifierArray,
}, ["content"]);
const updatedGoalSchema = {
  ...objectSchema({
    id: identifier,
    content: nonBlank,
    status: { const: "COMPLETED" },
  }, ["id"]),
  anyOf: [{ required: ["content"] }, { required: ["status"] }],
};
const updatedConstraintSchema = {
  ...objectSchema({
    id: identifier,
    content: nonBlank,
    status: { const: "SUPERSEDED" },
  }, ["id"]),
  anyOf: [{ required: ["content"] }, { required: ["status"] }],
};
const stateDeltaSchema = objectSchema({
  new_goals: { type: "array", items: newItemDeltaSchema },
  updated_goals: { type: "array", items: updatedGoalSchema },
  new_constraints: { type: "array", items: newItemDeltaSchema },
  updated_constraints: { type: "array", items: updatedConstraintSchema },
  new_decisions: {
    type: "array",
    items: objectSchema({
      content: nonBlank,
      reason: { type: "string" },
      supersedes: identifierArray,
      reopen_if: { type: "string" },
      source_refs: identifierArray,
    }, ["content"]),
  },
  resolved_questions: {
    type: "array",
    items: objectSchema({ id: identifier, resolved_by: identifier }, ["id"]),
  },
  new_open_questions: { type: "array", items: newItemDeltaSchema },
  rejected_alternatives: {
    type: "array",
    items: objectSchema({
      content: nonBlank,
      reason: { type: "string" },
      reopen_if: { type: "string" },
      source_refs: identifierArray,
      rejects: identifierArray,
    }, ["content"]),
  },
  supersessions: {
    type: "array",
    items: objectSchema({
      superseded_id: identifier,
      superseding_id: identifier,
    }, ["superseded_id", "superseding_id"]),
  },
  new_relations: {
    type: "array",
    items: objectSchema({
      source_id: identifier,
      relation_type: { type: "string", enum: ["DEPENDS_ON", "REJECTS", "DERIVED_FROM"] },
      target_id: identifier,
    }, ["source_id", "relation_type", "target_id"]),
  },
}, [
  "new_goals", "updated_goals", "new_constraints", "updated_constraints",
  "new_decisions", "resolved_questions", "new_open_questions",
  "rejected_alternatives", "supersessions", "new_relations",
]);

const TOOLS: Tool[] = [
  tool("health", "Report local Context Compiler readiness", objectSchema({}, [])),
  tool("ingest_event", "Append one immutable raw event", objectSchema({
    session_id: sessionId,
    role: { type: "string", enum: ["system", "user", "assistant", "tool"] },
    content: { type: "string" },
    event_type: { type: "string", minLength: 1 },
    created_at: { type: "string" },
    token_count: { type: "integer", minimum: 0 },
    metadata: { type: "object" },
    source_event_id: { type: "string", minLength: 1 },
  }, ["session_id", "role", "content"])),
  tool("compile_context", "Compile a read-only bounded context snapshot", objectSchema({
    session_id: sessionId,
    current_input: nonBlank,
    token_budget: { type: "integer", minimum: 0 },
    recent_raw_window_turns: { type: "integer", minimum: 1, maximum: 100 },
  }, ["session_id", "current_input"])),
  tool("get_state", "Read session state and revision", objectSchema({ session_id: sessionId }, ["session_id"])),
  tool("prepare_state_update", "Prepare a bounded immutable extractor snapshot", objectSchema({
    session_id: sessionId,
    newest_event_ids: {
      type: "array", minItems: 1, maxItems: 100, uniqueItems: true,
      items: identifier,
    },
  }, ["session_id", "newest_event_ids"])),
  tool("apply_state_delta", "Strictly validate and atomically apply a prepared State Delta", objectSchema({
    session_id: sessionId,
    preparation_token: { ...nonBlank, maxLength: 200 },
    fingerprint: { type: "string", pattern: "^[a-f0-9]{64}$" },
    expected_revision: { type: "integer", minimum: 0 },
    delta: stateDeltaSchema,
  }, ["session_id", "preparation_token", "fingerprint", "expected_revision", "delta"])),
  tool("create_headline", "Create an immutable headline over a raw event range", objectSchema({
    session_id: sessionId,
    event_start_seq: positiveInteger,
    event_end_seq: positiveInteger,
    headline: { ...nonBlank, maxLength: 500 },
    keywords: {
      type: "array", minItems: 1, maxItems: 32, uniqueItems: true,
      items: { ...nonBlank, maxLength: 100 },
    },
    created_at: {
      type: "string",
      format: "date-time",
      pattern: "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{3}Z$",
    },
  }, ["session_id", "event_start_seq", "event_end_seq", "headline", "keywords"])),
  tool("recall_exact", "Recall raw evidence by event, range, or headline", {
    type: "object",
    oneOf: [
      objectSchema({ session_id: sessionId, kind: { const: "event_id" }, event_id: { ...nonBlank, maxLength: 500 } }, ["session_id", "kind", "event_id"]),
      objectSchema({ session_id: sessionId, kind: { const: "seq_range" }, event_start_seq: positiveInteger, event_end_seq: positiveInteger }, ["session_id", "kind", "event_start_seq", "event_end_seq"]),
      objectSchema({ session_id: sessionId, kind: { const: "headline_id" }, headline_id: { ...nonBlank, maxLength: 500 } }, ["session_id", "kind", "headline_id"]),
    ],
  }),
  tool("recall_keyword", "Search headlines using literal FTS tokens", objectSchema({
    session_id: sessionId,
    query: { ...nonBlank, maxLength: 500 },
    limit: { type: "integer", minimum: 1, maximum: 20 },
  }, ["session_id", "query"])),
];

export function createContextCompilerMcpServer(service: ContextCompilerMcpService): Server {
  const server = new Server(
    { name: "context-compiler-mcp", version: CONTEXT_COMPILER_SERVICE_VERSION },
    { capabilities: { tools: {} } }
  );
  server.setRequestHandler(ListToolsRequestSchema, () => ({ tools: TOOLS.map(cloneTool) }));
  server.setRequestHandler(CallToolRequestSchema, (request): CallToolResult => {
    const name = request.params.name;
    if (!CONTEXT_COMPILER_CAPABILITIES.includes(name as ContextCompilerToolName)) {
      return response({ ok: false, error: { code: "INVALID_INPUT" } }, true);
    }
    const result = service.call(name as ContextCompilerToolName, request.params.arguments ?? {});
    return response(result, !result.ok);
  });
  return server;
}

export async function runContextCompilerMcpServer(
  environment: NodeJS.ProcessEnv = process.env,
  transport: Transport = new StdioServerTransport()
): Promise<void> {
  const restoreWarnings = acquireSqliteExperimentalWarningFilter();
  let service: ContextCompilerMcpService | undefined;
  let server: Server | undefined;
  let closed = false;
  const removeProcessListeners = (): void => {
    process.removeListener("SIGINT", onSigint);
    process.removeListener("SIGTERM", onSigterm);
    process.removeListener("beforeExit", onBeforeExit);
  };
  const shutdown = async (): Promise<void> => {
    if (closed) return;
    closed = true;
    removeProcessListeners();
    try { await server?.close(); } catch { /* transport may already be gone */ }
    try { service?.close(); } catch { /* shutdown remains deterministic */ }
  };
  const onSigint = (): void => { void shutdown(); };
  const onSigterm = (): void => { void shutdown(); };
  const onBeforeExit = (): void => { void shutdown(); };
  try {
    const serviceModule = await import("./mcp-service.js");
    service = new serviceModule.ContextCompilerMcpService(
      serviceModule.resolveContextCompilerDatabasePath(environment)
    );
    server = createContextCompilerMcpServer(service);
    transport.onclose = () => { void shutdown(); };
    process.once("SIGINT", onSigint);
    process.once("SIGTERM", onSigterm);
    process.once("beforeExit", onBeforeExit);
    await server.connect(transport);
  } catch (error) {
    await shutdown();
    throw error;
  } finally {
    restoreWarnings();
  }
}

interface WarningFilterLeaseState {
  readonly original: typeof process.emitWarning;
  readonly filtered: typeof process.emitWarning;
  readonly activeTokens: Set<symbol>;
}

let warningFilterLeaseState: WarningFilterLeaseState | undefined;

export function acquireSqliteExperimentalWarningFilter(): () => void {
  let state = warningFilterLeaseState;
  if (state === undefined) {
    const original = process.emitWarning;
    const activeTokens = new Set<symbol>();
    const created = {} as WarningFilterLeaseState;
    const filtered = (function (
      warning: string | Error,
      ...arguments_: unknown[]
    ): void {
      const message = typeof warning === "string" ? warning : warning.message;
      const options = arguments_[0];
      const type = warning instanceof Error
        ? warning.name
        : typeof options === "string"
          ? options
          : typeof options === "object" && options !== null && "type" in options
            ? (options as { type?: unknown }).type
            : undefined;
      if (
        message === "SQLite is an experimental feature and might change at any time" &&
        type === "ExperimentalWarning"
      ) return;
      Reflect.apply(created.original, process, [warning, ...arguments_]);
    }) as typeof process.emitWarning;
    Object.assign(created, {
      original,
      filtered,
      activeTokens,
    });
    state = created;
    warningFilterLeaseState = state;
    process.emitWarning = state.filtered;
  }

  const token = Symbol("sqlite-warning-filter-lease");
  state.activeTokens.add(token);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    state.activeTokens.delete(token);
    if (state.activeTokens.size !== 0) return;
    if (process.emitWarning === state.filtered) {
      process.emitWarning = state.original;
    }
    if (warningFilterLeaseState === state) warningFilterLeaseState = undefined;
  };
}

function response(value: unknown, isError: boolean): CallToolResult {
  return { content: [{ type: "text", text: JSON.stringify(value) }], ...(isError ? { isError: true } : {}) };
}

function tool(name: ContextCompilerToolName, description: string, inputSchema: Tool["inputSchema"]): Tool {
  return { name, description, inputSchema };
}

function objectSchema(
  properties: Record<string, object>,
  required: readonly string[]
): Tool["inputSchema"] {
  return { type: "object", properties, required: [...required], additionalProperties: false };
}

function cloneTool(value: Tool): Tool {
  return JSON.parse(JSON.stringify(value)) as Tool;
}

const entry = process.argv[1];
if (entry && realpathSync(entry) === realpathSync(fileURLToPath(import.meta.url))) {
  runContextCompilerMcpServer().catch(() => {
    // stderr is intentionally stable and contains no path, content, query, or credential.
    process.stderr.write("CONTEXT_COMPILER_STARTUP_FAILURE\n");
    process.exitCode = 1;
  });
}
