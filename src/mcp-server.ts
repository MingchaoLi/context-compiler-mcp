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
  ContextCompilerErrorCode,
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

const jsonValueSchema = {
  oneOf: [
    { type: "null" },
    { type: "boolean" },
    { type: "number" },
    { type: "string" },
    { type: "array", items: { $ref: "#/$defs/json_value" } },
    { $ref: "#/$defs/json_object" },
  ],
} as const;
const jsonObjectSchema = {
  type: "object",
  additionalProperties: { $ref: "#/$defs/json_value" },
} as const;
const compatibleRawTimestampSchema = {
  type: "string",
  pattern: "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:(?:[0-5]\\d|60)(?:\\.\\d+)?(?:Z|[+-]\\d{2}:\\d{2})$",
} as const;
const rawEventProperties = {
  id: { type: "string", minLength: 1 },
  session_id: { type: "string", minLength: 1 },
  seq: positiveInteger,
  role: { type: "string", enum: ["system", "user", "assistant", "tool"] },
  content: { type: "string" },
  event_type: { type: "string", minLength: 1 },
  created_at: compatibleRawTimestampSchema,
  token_count: { type: "integer", minimum: 0 },
  metadata: { $ref: "#/$defs/json_object" },
  source_event_id: { type: "string", minLength: 1 },
} as const;
const ingestedRawEventSchema = objectSchema({
  ...rawEventProperties,
  dense_embedding: { $ref: "#/$defs/dense_embedding" },
}, [
  "id", "session_id", "seq", "role", "content", "event_type", "created_at", "token_count",
  "metadata",
]);
const recalledRawEventSchema = {
  $comment: "Recall intentionally does not publish dense_embedding.",
  ...objectSchema(rawEventProperties, [
    "id", "session_id", "seq", "role", "content", "event_type", "created_at", "token_count",
    "metadata",
  ]),
};
const headlineSchema = objectSchema({
  id: { type: "string", minLength: 1 },
  session_id: { type: "string", minLength: 1 },
  event_start_seq: positiveInteger,
  event_end_seq: positiveInteger,
  headline: { type: "string", minLength: 1, maxLength: 500 },
  keywords: {
    type: "array", minItems: 1, maxItems: 32, uniqueItems: true,
    items: { type: "string", minLength: 1, maxLength: 100 },
  },
  created_at: {
    type: "string",
    pattern: "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{3}Z$",
  },
}, [
  "id", "session_id", "event_start_seq", "event_end_seq", "headline", "keywords", "created_at",
]);
const publicResultDefinitions: Record<string, object> = {
  json_value: jsonValueSchema,
  json_object: jsonObjectSchema,
  dense_embedding: denseEmbeddingSchema,
  ingested_raw_event: ingestedRawEventSchema,
  recalled_raw_event: recalledRawEventSchema,
  headline: headlineSchema,
  recall_event_found: objectSchema({
    kind: { const: "event_id" },
    found: { const: true },
    event: { $ref: "#/$defs/recalled_raw_event" },
  }, ["kind", "found", "event"]),
  recall_event_missing: objectSchema({
    kind: { const: "event_id" },
    found: { const: false },
  }, ["kind", "found"]),
  recall_range_found: objectSchema({
    kind: { const: "seq_range" },
    found: { const: true },
    events: {
      type: "array", minItems: 1, maxItems: 1000,
      items: { $ref: "#/$defs/recalled_raw_event" },
    },
  }, ["kind", "found", "events"]),
  recall_range_missing: objectSchema({
    kind: { const: "seq_range" },
    found: { const: false },
    events: { type: "array", maxItems: 0 },
  }, ["kind", "found", "events"]),
  recall_headline_found: objectSchema({
    kind: { const: "headline_id" },
    found: { const: true },
    headline: { $ref: "#/$defs/headline" },
    events: {
      type: "array", minItems: 1, maxItems: 200,
      items: { $ref: "#/$defs/recalled_raw_event" },
    },
  }, ["kind", "found", "headline", "events"]),
  recall_headline_missing: objectSchema({
    kind: { const: "headline_id" },
    found: { const: false },
    events: { type: "array", maxItems: 0 },
  }, ["kind", "found", "events"]),
  recall_exact_result: {
    oneOf: [
      { $ref: "#/$defs/recall_event_found" },
      { $ref: "#/$defs/recall_event_missing" },
      { $ref: "#/$defs/recall_range_found" },
      { $ref: "#/$defs/recall_range_missing" },
      { $ref: "#/$defs/recall_headline_found" },
      { $ref: "#/$defs/recall_headline_missing" },
    ],
  },
  keyword_hit: objectSchema({
    headline: { $ref: "#/$defs/headline" },
    rank: { type: "number" },
    events: {
      type: "array", minItems: 1, maxItems: 200,
      items: { $ref: "#/$defs/recalled_raw_event" },
    },
  }, ["headline", "rank", "events"]),
  compile_context: objectSchema({
    session_id: { type: "string", minLength: 1 },
    rendered_context: { type: "string" },
    budget_exceeded: { type: "boolean" },
    budget_overage: { type: "integer", minimum: 0 },
  }, ["session_id", "rendered_context", "budget_exceeded", "budget_overage"]),
  compile_metrics: objectSchema({
    full_context_tokens: { type: "integer", minimum: 0 },
    compiled_context_tokens: { type: "integer", minimum: 0 },
    recent_window_tokens: { type: "integer", minimum: 0 },
    active_state_tokens: { type: "integer", minimum: 0 },
    retrieved_tokens: { type: "integer", minimum: 0 },
    compile_latency_ms: { type: "number", minimum: 0 },
    extractor_latency_ms: { type: "number", minimum: 0 },
    active_state_items: { type: "integer", minimum: 0 },
    suppressed_items: { type: "integer", minimum: 0 },
  }, [
    "full_context_tokens", "compiled_context_tokens", "recent_window_tokens", "active_state_tokens",
    "retrieved_tokens", "compile_latency_ms", "extractor_latency_ms", "active_state_items",
    "suppressed_items",
  ]),
  compile_context_result: objectSchema({
    context: { $ref: "#/$defs/compile_context" },
    metrics: { $ref: "#/$defs/compile_metrics" },
  }, ["context", "metrics"]),
};

const ingestEventOutputSchema = publicSuccessOutputSchema({
  $ref: "#/$defs/ingested_raw_event",
});
const recallExactOutputSchema = publicSuccessOutputSchema({
  $ref: "#/$defs/recall_exact_result",
});
const recallKeywordOutputSchema = {
  $comment: "rank is the existing public literal FTS hit rank, not compile_context candidate telemetry.",
  ...publicSuccessOutputSchema({
    type: "array", maxItems: 20, items: { $ref: "#/$defs/keyword_hit" },
  }),
};
const compileContextOutputSchema = publicSuccessOutputSchema({
  $ref: "#/$defs/compile_context_result",
});

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
    created_at: {
      type: "string",
      format: "date-time",
      pattern: "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d{1,3})?(?:Z|[+-]\\d{2}:\\d{2})$",
    },
    token_count: { type: "integer", minimum: 0 },
    metadata: { type: "object" },
    source_event_id: { type: "string", minLength: 1 },
    dense_embedding: denseEmbeddingSchema,
  }, ["session_id", "role", "content"]), ingestEventOutputSchema),
  tool("compile_context", "Compile a bounded context snapshot; operation_id enables append-only trace", objectSchema({
    session_id: sessionId,
    current_input: nonBlank,
    token_budget: { type: "integer", minimum: 0 },
    recent_raw_window_turns: { type: "integer", minimum: 1, maximum: 100 },
    operation_id: identifier,
    dense_query: denseEmbeddingSchema,
    context_policy: contextPolicySchema,
  }, ["session_id", "current_input"]), compileContextOutputSchema),
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
  }, recallExactOutputSchema),
  tool("recall_keyword", "Search headlines using literal FTS tokens", objectSchema({
    session_id: sessionId,
    query: { ...nonBlank, maxLength: 500 },
    limit: { type: "integer", minimum: 1, maximum: 20 },
  }, ["session_id", "query"]), recallKeywordOutputSchema),
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
    return response(result, !result.ok, result.ok && isPublicResultTool(toolName));
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

function response(value: unknown, isError: boolean, includeStructuredContent = false): CallToolResult {
  const text = JSON.stringify(value);
  return {
    content: [{ type: "text", text }],
    ...(includeStructuredContent
      ? { structuredContent: JSON.parse(text) as Record<string, unknown> }
      : {}),
    ...(isError ? { isError: true } : {}),
  };
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
  if (!isPublicResultTool(name)) return responseValue as ContextCompilerToolResponse;
  try {
    const envelope = plainRecord(responseValue);
    if (!booleanField(envelope, "ok")) return projectPublicFailure(envelope);
    const value = dataField(envelope, "result");
    switch (name) {
      case "ingest_event":
        return { ok: true, result: projectPublicRawEvent(value, true) };
      case "recall_exact":
        return { ok: true, result: projectPublicExactRecall(value) };
      case "recall_keyword":
        return { ok: true, result: projectPublicKeywordRecall(value) };
      case "compile_context":
        return { ok: true, result: projectPublicCompileContext(value) };
    }
    throw new Error();
  } catch {
    return { ok: false, error: { code: "INTERNAL_FAILURE" } };
  }
}

function isPublicResultTool(name: ContextCompilerToolName): boolean {
  return name === "ingest_event" || name === "recall_exact" ||
    name === "recall_keyword" || name === "compile_context";
}

function projectPublicFailure(
  value: Record<string, unknown>
): ContextCompilerToolResponse {
  const error = plainRecord(dataField(value, "error"));
  const code = stringField(error, "code");
  if (![
    "INVALID_INPUT", "NOT_FOUND", "CONFLICT", "BUDGET_INSUFFICIENT", "CORRUPT_DATA",
    "STORAGE_FAILURE", "INTERNAL_FAILURE",
  ].includes(code)) throw new Error();
  return { ok: false, error: { code: code as ContextCompilerErrorCode } };
}

interface PublicRawEvent {
  id: string;
  session_id: string;
  seq: number;
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  event_type: string;
  created_at: string;
  token_count: number;
  metadata: Record<string, unknown>;
  source_event_id?: string;
  dense_embedding?: { vector_space_id: string; values: number[] };
}

interface PublicHeadline {
  id: string;
  session_id: string;
  event_start_seq: number;
  event_end_seq: number;
  headline: string;
  keywords: string[];
  created_at: string;
}

function projectPublicRawEvent(value: unknown, includeDense: boolean): PublicRawEvent {
  const event = plainRecord(value);
  const role = stringField(event, "role");
  if (role !== "system" && role !== "user" && role !== "assistant" && role !== "tool") {
    throw new Error();
  }
  const projected: PublicRawEvent = {
    id: nonEmptyStringField(event, "id"),
    session_id: nonEmptyStringField(event, "session_id"),
    seq: positiveSafeIntegerField(event, "seq"),
    role,
    content: stringField(event, "content"),
    event_type: nonEmptyStringField(event, "event_type"),
    created_at: compatibleTimestampField(event, "created_at"),
    token_count: nonNegativeSafeIntegerField(event, "token_count"),
    metadata: jsonObjectField(event, "metadata"),
  };
  const sourceEventId = optionalStringField(event, "source_event_id");
  if (sourceEventId !== undefined) projected.source_event_id = requireNonEmpty(sourceEventId);
  if (includeDense) {
    const dense = optionalDataField(event, "dense_embedding");
    if (dense !== undefined) projected.dense_embedding = projectDenseEmbedding(dense);
  }
  return projected;
}

function projectDenseEmbedding(value: unknown): { vector_space_id: string; values: number[] } {
  const dense = plainRecord(value);
  const values = arrayField(dense, "values");
  if (values.length < 1 || values.length > 4096) throw new Error();
  return {
    vector_space_id: requireNonBlank(nonEmptyStringField(dense, "vector_space_id")),
    values: values.map(finiteNumber),
  };
}

function projectPublicHeadline(value: unknown): PublicHeadline {
  const headline = plainRecord(value);
  const keywords = arrayField(headline, "keywords");
  if (keywords.length < 1 || keywords.length > 32) throw new Error();
  const projectedKeywords = keywords.map((keyword) => {
    if (typeof keyword !== "string" || keyword.length < 1 || keyword.length > 100) throw new Error();
    return keyword;
  });
  if (new Set(projectedKeywords).size !== projectedKeywords.length) throw new Error();
  const text = nonEmptyStringField(headline, "headline");
  if (text.length > 500) throw new Error();
  return {
    id: nonEmptyStringField(headline, "id"),
    session_id: nonEmptyStringField(headline, "session_id"),
    event_start_seq: positiveSafeIntegerField(headline, "event_start_seq"),
    event_end_seq: positiveSafeIntegerField(headline, "event_end_seq"),
    headline: text,
    keywords: projectedKeywords,
    created_at: millisecondTimestampField(headline, "created_at"),
  };
}

function projectPublicExactRecall(value: unknown): unknown {
  const result = plainRecord(value);
  const kind = stringField(result, "kind");
  const found = booleanField(result, "found");
  if (kind === "event_id") {
    return found
      ? { kind, found, event: projectPublicRawEvent(dataField(result, "event"), false) }
      : { kind, found };
  }
  const events = projectRawEventArray(dataField(result, "events"), kind === "seq_range" ? 1000 : 200);
  if (kind === "seq_range") {
    if (found === (events.length === 0)) throw new Error();
    return { kind, found, events };
  }
  if (kind === "headline_id") {
    if (!found) {
      if (events.length !== 0) throw new Error();
      return { kind, found, events };
    }
    if (events.length === 0) throw new Error();
    return {
      kind,
      found,
      headline: projectPublicHeadline(dataField(result, "headline")),
      events,
    };
  }
  throw new Error();
}

function projectPublicKeywordRecall(value: unknown): unknown[] {
  if (!Array.isArray(value) || value.length > 20) throw new Error();
  return value.map((candidate) => {
    const hit = plainRecord(candidate);
    return {
      headline: projectPublicHeadline(dataField(hit, "headline")),
      rank: finiteNumber(dataField(hit, "rank")),
      events: projectNonEmptyRawEventArray(dataField(hit, "events"), 200),
    };
  });
}

function projectRawEventArray(value: unknown, maximum: number): PublicRawEvent[] {
  if (!Array.isArray(value) || value.length > maximum) throw new Error();
  return value.map((event) => projectPublicRawEvent(event, false));
}

function projectNonEmptyRawEventArray(value: unknown, maximum: number): PublicRawEvent[] {
  const events = projectRawEventArray(value, maximum);
  if (events.length === 0) throw new Error();
  return events;
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

function optionalDataField(value: Record<string, unknown>, key: string): unknown {
  if (!Object.prototype.hasOwnProperty.call(value, key)) return undefined;
  return dataField(value, key);
}

function stringField(value: Record<string, unknown>, key: string): string {
  const field = dataField(value, key);
  if (typeof field !== "string") throw new Error();
  return field;
}

function optionalStringField(value: Record<string, unknown>, key: string): string | undefined {
  const field = optionalDataField(value, key);
  if (field === undefined) return undefined;
  if (typeof field !== "string") throw new Error();
  return field;
}

function nonEmptyStringField(value: Record<string, unknown>, key: string): string {
  return requireNonEmpty(stringField(value, key));
}

function requireNonEmpty(value: string): string {
  if (value.length === 0) throw new Error();
  return value;
}

function requireNonBlank(value: string): string {
  if (!/\S/u.test(value)) throw new Error();
  return value;
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

function positiveSafeIntegerField(value: Record<string, unknown>, key: string): number {
  const field = nonNegativeSafeIntegerField(value, key);
  if (field < 1) throw new Error();
  return field;
}

function nonNegativeFiniteNumberField(value: Record<string, unknown>, key: string): number {
  const field = dataField(value, key);
  if (typeof field !== "number" || !Number.isFinite(field) || field < 0 || Object.is(field, -0)) {
    throw new Error();
  }
  return field;
}

function finiteNumber(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error();
  return value;
}

function arrayField(value: Record<string, unknown>, key: string): unknown[] {
  const field = dataField(value, key);
  if (!Array.isArray(field)) throw new Error();
  const result: unknown[] = [];
  for (let index = 0; index < field.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(field, String(index));
    if (!descriptor?.enumerable || !("value" in descriptor)) throw new Error();
    result.push(descriptor.value);
  }
  return result;
}

function jsonObjectField(
  value: Record<string, unknown>,
  key: string
): Record<string, unknown> {
  const projected = cloneJsonValue(dataField(value, key));
  if (typeof projected !== "object" || projected === null || Array.isArray(projected)) {
    throw new Error();
  }
  return projected as Record<string, unknown>;
}

function cloneJsonValue(value: unknown): unknown {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") return finiteNumber(value);
  if (Array.isArray(value)) {
    const result: unknown[] = [];
    for (let index = 0; index < value.length; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (!descriptor?.enumerable || !("value" in descriptor)) throw new Error();
      result.push(cloneJsonValue(descriptor.value));
    }
    return result;
  }
  const record = plainRecord(value);
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(record)) {
    Object.defineProperty(result, key, {
      value: cloneJsonValue(dataField(record, key)),
      enumerable: true,
      configurable: true,
      writable: true,
    });
  }
  return result;
}

function compatibleTimestampField(value: Record<string, unknown>, key: string): string {
  const timestamp = stringField(value, key);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:(?:[0-5]\d|60)(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/u.test(timestamp)) {
    throw new Error();
  }
  return timestamp;
}

function millisecondTimestampField(value: Record<string, unknown>, key: string): string {
  const timestamp = stringField(value, key);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(timestamp)) throw new Error();
  return timestamp;
}

function publicSuccessOutputSchema(resultSchema: object): NonNullable<Tool["outputSchema"]> {
  return {
    type: "object",
    properties: {
      ok: { const: true },
      result: resultSchema,
    },
    required: ["ok", "result"],
    additionalProperties: false,
    $defs: publicResultDefinitions,
  } as NonNullable<Tool["outputSchema"]>;
}

function tool(
  name: ContextCompilerToolName,
  description: string,
  inputSchema: Tool["inputSchema"],
  outputSchema?: Tool["outputSchema"]
): Tool {
  return { name, description, inputSchema, ...(outputSchema === undefined ? {} : { outputSchema }) };
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
