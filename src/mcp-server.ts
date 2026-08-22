#!/usr/bin/env node

import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
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
  "create_headline", "recall_exact", "recall_keyword",
];

const sessionId = { type: "string", minLength: 1 } as const;
const nonBlank = { type: "string", minLength: 1, pattern: "\\S" } as const;
const positiveInteger = { type: "integer", minimum: 1 } as const;

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
  tool("create_headline", "Create an immutable headline over a raw event range", objectSchema({
    session_id: sessionId,
    event_start_seq: positiveInteger,
    event_end_seq: positiveInteger,
    headline: { ...nonBlank, maxLength: 500 },
    keywords: {
      type: "array", minItems: 1, maxItems: 32, uniqueItems: true,
      items: { ...nonBlank, maxLength: 100 },
    },
    created_at: { type: "string" },
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
    { name: "tuantuan-context-compiler", version: CONTEXT_COMPILER_SERVICE_VERSION },
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
  environment: NodeJS.ProcessEnv = process.env
): Promise<void> {
  // Node 24 currently labels node:sqlite experimental. A local stdio service
  // must not let runtime warnings contaminate its private stderr channel.
  process.emitWarning = (() => undefined) as typeof process.emitWarning;
  const { ContextCompilerMcpService, resolveContextCompilerDatabasePath } = await import("./mcp-service.js");
  const service = new ContextCompilerMcpService(resolveContextCompilerDatabasePath(environment));
  const server = createContextCompilerMcpServer(service);
  const transport = new StdioServerTransport();
  let closed = false;
  const shutdown = async (): Promise<void> => {
    if (closed) return;
    closed = true;
    try { await server.close(); } catch { /* transport may already be gone */ }
    try { service.close(); } catch { /* shutdown remains deterministic */ }
  };
  transport.onclose = () => { void shutdown(); };
  process.once("SIGINT", () => { void shutdown(); });
  process.once("SIGTERM", () => { void shutdown(); });
  process.once("beforeExit", () => { try { service.close(); } catch { /* no diagnostics */ } });
  try {
    await server.connect(transport);
  } catch (error) {
    await shutdown();
    throw error;
  }
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
