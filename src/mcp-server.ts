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
  ContextCompilerToolResponse,
} from "./mcp-service.js";
import { acquireSqliteExperimentalWarningFilter } from "./sqlite-warning.js";

export { acquireSqliteExperimentalWarningFilter } from "./sqlite-warning.js";

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
const denseEmbeddingSchema = objectSchema({
  vector_space_id: nonBlank,
  values: {
    type: "array", minItems: 1, maxItems: 4096,
    items: { type: "number" },
  },
}, ["vector_space_id", "values"]);
const contextPolicySchema = objectSchema({
  candidate_turn_multiplier: { type: "integer", minimum: 1, maximum: 100 },
  recovery_candidate_turn_multiplier: { type: "integer", minimum: 1, maximum: 100 },
  dormancy_turn_multiplier: { type: "integer", minimum: 1, maximum: 100 },
  retrieval_limit: { type: "integer", minimum: 1, maximum: 100 },
  recovery_retrieval_limit: { type: "integer", minimum: 1, maximum: 100 },
  bm25_weight: { type: "number", minimum: 0, maximum: 1 },
  dense_weight: { type: "number", minimum: 0, maximum: 1 },
  recovery_failure_event_id: identifier,
}, []);

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
    dense_embedding: denseEmbeddingSchema,
  }, ["session_id", "role", "content"])),
  tool("compile_context", "Compile a bounded context snapshot; operation_id enables append-only trace", objectSchema({
    session_id: sessionId,
    current_input: nonBlank,
    token_budget: { type: "integer", minimum: 0 },
    recent_raw_window_turns: { type: "integer", minimum: 1, maximum: 100 },
    operation_id: identifier,
    dense_query: denseEmbeddingSchema,
    context_policy: contextPolicySchema,
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
    const toolName = name as ContextCompilerToolName;
    const internal = service.call(toolName, request.params.arguments ?? {});
    const result = projectPublicToolResponse(toolName, internal);
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

function response(value: unknown, isError: boolean): CallToolResult {
  return { content: [{ type: "text", text: JSON.stringify(value) }], ...(isError ? { isError: true } : {}) };
}

interface PublicCompileContextResult {
  context: {
    session_id: string;
    rendered_context: string;
    budget_exceeded: boolean;
    budget_overage: number;
  };
  metrics: PublicCompileContextMetrics;
}

interface PublicCompileContextMetrics {
  full_context_tokens: number;
  compiled_context_tokens: number;
  recent_window_tokens: number;
  active_state_tokens: number;
  retrieved_tokens: number;
  compile_latency_ms: number;
  extractor_latency_ms: number;
  active_state_items: number;
  suppressed_items: number;
}

function projectPublicToolResponse(
  name: ContextCompilerToolName,
  responseValue: unknown
): ContextCompilerToolResponse {
  if (name !== "compile_context") return responseValue as ContextCompilerToolResponse;
  try {
    const envelope = plainRecord(responseValue);
    if (!booleanField(envelope, "ok")) return responseValue as ContextCompilerToolResponse;
    return { ok: true, result: projectPublicCompileContext(dataField(envelope, "result")) };
  } catch {
    return { ok: false, error: { code: "INTERNAL_FAILURE" } };
  }
}

function projectPublicCompileContext(value: unknown): PublicCompileContextResult {
  const result = plainRecord(value);
  const context = plainRecord(dataField(result, "context"));
  const metrics = plainRecord(dataField(result, "metrics"));
  return {
    context: {
      session_id: stringField(context, "session_id"),
      rendered_context: stringField(context, "rendered_context"),
      budget_exceeded: booleanField(context, "budget_exceeded"),
      budget_overage: nonNegativeSafeIntegerField(context, "budget_overage"),
    },
    metrics: {
      full_context_tokens: nonNegativeSafeIntegerField(metrics, "full_context_tokens"),
      compiled_context_tokens: nonNegativeSafeIntegerField(metrics, "compiled_context_tokens"),
      recent_window_tokens: nonNegativeSafeIntegerField(metrics, "recent_window_tokens"),
      active_state_tokens: nonNegativeSafeIntegerField(metrics, "active_state_tokens"),
      retrieved_tokens: nonNegativeSafeIntegerField(metrics, "retrieved_tokens"),
      compile_latency_ms: nonNegativeFiniteNumberField(metrics, "compile_latency_ms"),
      extractor_latency_ms: nonNegativeFiniteNumberField(metrics, "extractor_latency_ms"),
      active_state_items: nonNegativeSafeIntegerField(metrics, "active_state_items"),
      suppressed_items: nonNegativeSafeIntegerField(metrics, "suppressed_items"),
    },
  };
}

function plainRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error();
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) throw new Error();
  return value as Record<string, unknown>;
}

function dataField(value: Record<string, unknown>, key: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (!descriptor?.enumerable || !("value" in descriptor)) throw new Error();
  return descriptor.value;
}

function stringField(value: Record<string, unknown>, key: string): string {
  const field = dataField(value, key);
  if (typeof field !== "string") throw new Error();
  return field;
}

function booleanField(value: Record<string, unknown>, key: string): boolean {
  const field = dataField(value, key);
  if (typeof field !== "boolean") throw new Error();
  return field;
}

function nonNegativeSafeIntegerField(value: Record<string, unknown>, key: string): number {
  const field = dataField(value, key);
  if (!Number.isSafeInteger(field) || (field as number) < 0) throw new Error();
  return field as number;
}

function nonNegativeFiniteNumberField(value: Record<string, unknown>, key: string): number {
  const field = dataField(value, key);
  if (typeof field !== "number" || !Number.isFinite(field) || field < 0 || Object.is(field, -0)) {
    throw new Error();
  }
  return field;
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
