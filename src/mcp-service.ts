import { dirname, join } from "node:path";
import { performance } from "node:perf_hooks";
import {
  ContextAssemblerValidationError,
  assembleContext,
  type CompiledContext,
} from "./assembler.js";
import {
  HistoryRecallError,
  SqliteHistoryRecallStore,
  type ExactRecallQuery,
  type HistoryHeadlineInput,
  type KeywordRecallQuery,
} from "./recall.js";
import {
  SqliteRawHistoryStore,
  estimateTokens,
  type RawEventInput,
} from "./raw-store.js";
import { SqliteContextStateStore } from "./state-store.js";

export const CONTEXT_COMPILER_SERVICE_VERSION = "0.1.0";
export const CONTEXT_COMPILER_CAPABILITIES = [
  "health",
  "ingest_event",
  "compile_context",
  "get_state",
  "create_headline",
  "recall_exact",
  "recall_keyword",
] as const;

export type ContextCompilerToolName = (typeof CONTEXT_COMPILER_CAPABILITIES)[number];
export type ContextCompilerErrorCode =
  | "INVALID_INPUT"
  | "NOT_FOUND"
  | "CONFLICT"
  | "STORAGE_FAILURE"
  | "INTERNAL_FAILURE";

export interface ContextCompilerToolSuccess {
  ok: true;
  result: unknown;
}

export interface ContextCompilerToolFailure {
  ok: false;
  error: { code: ContextCompilerErrorCode };
}

export type ContextCompilerToolResponse = ContextCompilerToolSuccess | ContextCompilerToolFailure;

export interface CompileContextMetrics {
  full_context_tokens: number;
  compiled_context_tokens: number;
  recent_window_tokens: number;
  active_state_tokens: number;
  retrieved_tokens: 0;
  compile_latency_ms: number;
  extractor_latency_ms: 0;
  active_state_items: number;
  suppressed_items: number;
}

export interface CompileContextResult {
  context: CompiledContext;
  metrics: CompileContextMetrics;
}

export class ContextCompilerServiceError extends Error {
  constructor(readonly code: ContextCompilerErrorCode) {
    super(code);
    this.name = "ContextCompilerServiceError";
  }
}

export function resolveContextCompilerDatabasePath(
  environment: NodeJS.ProcessEnv = process.env
): string {
  const explicit = environment.CONTEXT_COMPILER_DB_PATH;
  if (typeof explicit === "string" && explicit.length > 0) return explicit;
  const dshHome = environment.DSH_HOME;
  if (typeof dshHome === "string" && dshHome.length > 0) {
    return join(dshHome, "sessions", "context-compiler.db");
  }
  throw new ContextCompilerServiceError("INVALID_INPUT");
}

export class ContextCompilerMcpService {
  private readonly rawStore: SqliteRawHistoryStore;
  private readonly stateStore: SqliteContextStateStore;
  private readonly recallStore: SqliteHistoryRecallStore;
  private closed = false;

  constructor(databasePath: string) {
    if (typeof databasePath !== "string" || databasePath.length === 0) {
      throw new ContextCompilerServiceError("INVALID_INPUT");
    }
    // Resolve the parent eagerly without exposing the value in any error.
    void dirname(databasePath);
    let rawStore: SqliteRawHistoryStore | undefined;
    let stateStore: SqliteContextStateStore | undefined;
    let recallStore: SqliteHistoryRecallStore | undefined;
    try {
      rawStore = new SqliteRawHistoryStore(databasePath);
      stateStore = new SqliteContextStateStore(databasePath);
      recallStore = new SqliteHistoryRecallStore(databasePath);
    } catch {
      try { recallStore?.close(); } catch { /* preserve stable startup failure */ }
      try { stateStore?.close(); } catch { /* preserve stable startup failure */ }
      try { rawStore?.close(); } catch { /* preserve stable startup failure */ }
      throw new ContextCompilerServiceError("STORAGE_FAILURE");
    }
    this.rawStore = rawStore;
    this.stateStore = stateStore;
    this.recallStore = recallStore;
  }

  call(tool: ContextCompilerToolName, input: unknown): ContextCompilerToolResponse {
    if (this.closed) return failure("STORAGE_FAILURE");
    try {
      assertPlainData(input, "tool input");
      switch (tool) {
        case "health":
          assertKeys(input, [], []);
          return success({
            version: CONTEXT_COMPILER_SERVICE_VERSION,
            capabilities: [...CONTEXT_COMPILER_CAPABILITIES],
            ready: true,
          });
        case "ingest_event":
          return success(this.ingest(input));
        case "compile_context":
          return success(this.compile(input));
        case "get_state":
          return success(this.getState(input));
        case "create_headline":
          return success(this.createHeadline(input));
        case "recall_exact":
          return success(this.recallExact(input));
        case "recall_keyword":
          return success(this.recallKeyword(input));
      }
    } catch (error) {
      return failure(classifyError(error));
    }
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    let failed = false;
    for (const store of [this.recallStore, this.stateStore, this.rawStore]) {
      try {
        store.close();
      } catch {
        failed = true;
      }
    }
    if (failed) throw new ContextCompilerServiceError("STORAGE_FAILURE");
  }

  private ingest(value: unknown): unknown {
    const input = readObject(value, ["session_id", "role", "content"], [
      "event_type", "created_at", "token_count", "metadata", "source_event_id",
    ]);
    requireNonEmptyString(input.session_id);
    requireEnum(input.role, ["system", "user", "assistant", "tool"]);
    requireString(input.content);
    optionalNonEmptyString(input.event_type);
    optionalString(input.created_at);
    optionalNonNegativeSafeInteger(input.token_count);
    optionalNonEmptyString(input.source_event_id);
    if (input.metadata !== undefined) requirePlainObject(input.metadata);
    try {
      return this.rawStore.ingest(input as unknown as RawEventInput);
    } catch (error) {
      if (error instanceof Error && error.message.includes("conflicts with existing raw evidence")) {
        throw new ContextCompilerServiceError("CONFLICT");
      }
      throw new ContextCompilerServiceError("STORAGE_FAILURE");
    }
  }

  private compile(value: unknown): CompileContextResult {
    const input = readObject(value, ["session_id", "current_input"], [
      "token_budget", "recent_raw_window_turns",
    ]);
    const sessionId = requireNonEmptyString(input.session_id);
    const currentInput = requireNonBlankString(input.current_input);
    optionalIntegerInRange(input.token_budget, 0, Number.MAX_SAFE_INTEGER);
    optionalIntegerInRange(input.recent_raw_window_turns, 1, 100);

    const startedAt = performance.now();
    const assemblerSessionId = sessionId.trim().length === 0 ? "__context_compiler_whitespace_session__" : sessionId;
    let context: CompiledContext;
    try {
      context = assembleContext({
        session_id: assemblerSessionId,
        context_items: this.stateStore.getItems(sessionId).map((item) => ({ ...item, session_id: assemblerSessionId })),
        state_relations: this.stateStore.getSessionRelations(sessionId).map((relation) => ({ ...relation, session_id: assemblerSessionId })),
        raw_events: this.rawStore.getSessionEvents(sessionId).map((event) => ({ ...event, session_id: assemblerSessionId })),
        current_input: currentInput,
        ...(input.token_budget === undefined ? {} : { token_budget: input.token_budget as number }),
        ...(input.recent_raw_window_turns === undefined
          ? {}
          : { recent_raw_window_turns: input.recent_raw_window_turns as number }),
      });
    } catch (error) {
      if (error instanceof ContextAssemblerValidationError) throw error;
      throw new ContextCompilerServiceError("STORAGE_FAILURE");
    }
    if (assemblerSessionId !== sessionId) restoreSessionId(context, assemblerSessionId, sessionId);
    const activeItems = [
      ...context.active_goals,
      ...context.active_constraints,
      ...context.active_decisions,
      ...context.open_questions,
      ...context.dependency_items,
    ];
    const compileLatency = Math.max(0, performance.now() - startedAt);
    return {
      context,
      metrics: {
        full_context_tokens: context.metrics.d0_full_tokens,
        compiled_context_tokens: context.metrics.d2_compiled_tokens,
        recent_window_tokens: context.metrics.d1_recent_tokens,
        active_state_tokens: estimateTokens(activeItems.map((item) => item.content).join("\n")),
        retrieved_tokens: 0,
        compile_latency_ms: Number.isFinite(compileLatency) ? compileLatency : 0,
        extractor_latency_ms: 0,
        active_state_items: activeItems.length,
        suppressed_items: context.debug_manifest.suppressed_state_ids.length,
      },
    };
  }

  private getState(value: unknown): unknown {
    const input = readObject(value, ["session_id"], []);
    const sessionId = requireNonEmptyString(input.session_id);
    try {
      return {
        session_id: sessionId,
        items: this.stateStore.getItems(sessionId),
        relations: this.stateStore.getSessionRelations(sessionId),
        revision: this.stateStore.getRevision(sessionId),
      };
    } catch {
      throw new ContextCompilerServiceError("STORAGE_FAILURE");
    }
  }

  private createHeadline(value: unknown): unknown {
    const input = readObject(value, [
      "session_id", "event_start_seq", "event_end_seq", "headline", "keywords",
    ], ["created_at"]);
    try {
      return this.recallStore.createHeadline(input as unknown as HistoryHeadlineInput);
    } catch (error) {
      throw mapRecallError(error);
    }
  }

  private recallExact(value: unknown): unknown {
    requirePlainObject(value);
    try {
      return this.recallStore.recallExact(value as unknown as ExactRecallQuery);
    } catch (error) {
      throw mapRecallError(error);
    }
  }

  private recallKeyword(value: unknown): unknown {
    requirePlainObject(value);
    try {
      return this.recallStore.recallKeyword(value as unknown as KeywordRecallQuery);
    } catch (error) {
      throw mapRecallError(error);
    }
  }
}

function success(result: unknown): ContextCompilerToolSuccess {
  return { ok: true, result };
}

function failure(code: ContextCompilerErrorCode): ContextCompilerToolFailure {
  return { ok: false, error: { code } };
}

function mapRecallError(error: unknown): ContextCompilerServiceError {
  if (!(error instanceof HistoryRecallError)) return new ContextCompilerServiceError("INTERNAL_FAILURE");
  switch (error.category) {
    case "validation": return new ContextCompilerServiceError("INVALID_INPUT");
    case "not_found": return new ContextCompilerServiceError("NOT_FOUND");
    case "conflict": return new ContextCompilerServiceError("CONFLICT");
    case "state":
    case "storage": return new ContextCompilerServiceError("STORAGE_FAILURE");
  }
}

function classifyError(error: unknown): ContextCompilerErrorCode {
  if (error instanceof ContextCompilerServiceError) return error.code;
  if (error instanceof ContextAssemblerValidationError) return "INVALID_INPUT";
  return "INTERNAL_FAILURE";
}

function readObject(
  value: unknown,
  required: readonly string[],
  optional: readonly string[]
): Record<string, unknown> {
  requirePlainObject(value);
  assertKeys(value, required, optional);
  return value;
}

function requirePlainObject(value: unknown): asserts value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) invalid();
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) invalid();
}

function assertKeys(value: unknown, required: readonly string[], optional: readonly string[]): void {
  requirePlainObject(value);
  const allowed = new Set([...required, ...optional]);
  const keys = Reflect.ownKeys(value);
  for (const key of keys) {
    if (typeof key !== "string" || !allowed.has(key)) invalid();
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor?.enumerable || !("value" in descriptor)) invalid();
  }
  for (const key of required) if (!Object.prototype.hasOwnProperty.call(value, key)) invalid();
}

function assertPlainData(value: unknown, path: string, ancestors = new Set<object>()): void {
  if (value === null || typeof value === "string" || typeof value === "boolean") return;
  if (typeof value === "number") {
    if (!Number.isFinite(value) || Object.is(value, -0)) invalid();
    return;
  }
  if (typeof value !== "object" || ancestors.has(value)) invalid();
  const prototype = Object.getPrototypeOf(value);
  if (Array.isArray(value)) {
    if (prototype !== Array.prototype) invalid();
  } else if (prototype !== Object.prototype && prototype !== null) invalid();
  ancestors.add(value);
  for (const key of Reflect.ownKeys(value)) {
    if (Array.isArray(value) && key === "length") continue;
    if (typeof key !== "string") invalid();
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor?.enumerable || !("value" in descriptor)) invalid();
    assertPlainData(descriptor.value, `${path}.${key}`, ancestors);
  }
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      if (!Object.prototype.hasOwnProperty.call(value, index)) invalid();
    }
  }
  ancestors.delete(value);
}

function requireString(value: unknown): string {
  if (typeof value !== "string") invalid();
  return value;
}
function requireNonEmptyString(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) invalid();
  return value;
}
function requireNonBlankString(value: unknown): string {
  if (typeof value !== "string" || value.trim().length === 0) invalid();
  return value;
}
function requireEnum<T extends string>(value: unknown, allowed: readonly T[]): T {
  if (typeof value !== "string" || !allowed.includes(value as T)) invalid();
  return value as T;
}
function optionalString(value: unknown): void {
  if (value !== undefined) requireString(value);
}
function optionalNonEmptyString(value: unknown): void {
  if (value !== undefined) requireNonEmptyString(value);
}
function optionalNonNegativeSafeInteger(value: unknown): void {
  if (value !== undefined && (!Number.isSafeInteger(value) || (value as number) < 0)) invalid();
}
function optionalIntegerInRange(value: unknown, minimum: number, maximum: number): void {
  if (value !== undefined &&
      (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum)) {
    invalid();
  }
}
function invalid(): never {
  throw new ContextCompilerServiceError("INVALID_INPUT");
}

function restoreSessionId(value: unknown, temporary: string, original: string): void {
  if (Array.isArray(value)) {
    for (const entry of value) restoreSessionId(entry, temporary, original);
    return;
  }
  if (typeof value !== "object" || value === null) return;
  const record = value as Record<string, unknown>;
  if (record.session_id === temporary) record.session_id = original;
  for (const entry of Object.values(record)) restoreSessionId(entry, temporary, original);
}
