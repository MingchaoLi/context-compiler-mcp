import { dirname } from "node:path";
import { performance } from "node:perf_hooks";
import {
  ContextAssemblerValidationError,
  type CompiledContext,
} from "./assembler.js";
import {
  appendContextCompileTraceInsideService,
  ExperienceLedgerError,
  SqliteExperienceLedgerStore,
  withCompileTelemetryBoundaryInsideService,
  type ExperienceLedgerInput,
  type ExperienceLedgerRecord,
} from "./experience-ledger.js";
import {
  OperationalContextError,
  compileOperationalContext,
  hasTrustedContextCompileBaseline,
  type ContextPolicyInput,
} from "./operational-context.js";
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
  normalizeDenseEmbedding,
  type DenseEmbedding,
  type RawEventInput,
} from "./raw-store.js";
import { SqliteContextStateStore } from "./state-store.js";
import { StateUpdateCoordinator, StateUpdateError } from "./state-update.js";

export const CONTEXT_COMPILER_CORE_VERSION = "0.1.0";
export const CONTEXT_COMPILER_COMMANDS = [
  "health",
  "ingest_event",
  "compile_context",
  "get_state",
  "prepare_state_update",
  "apply_state_delta",
  "create_headline",
  "recall_exact",
  "recall_keyword",
] as const;

export type ContextCompilerCommandName = (typeof CONTEXT_COMPILER_COMMANDS)[number];
export type ContextCompilerCoreErrorCode =
  | "INVALID_INPUT"
  | "NOT_FOUND"
  | "CONFLICT"
  | "STORAGE_FAILURE"
  | "INTERNAL_FAILURE";

export interface ContextCompilerCoreSuccess {
  ok: true;
  result: unknown;
}

export interface ContextCompilerCoreFailure {
  ok: false;
  error: { code: ContextCompilerCoreErrorCode };
}

export type ContextCompilerCoreResponse =
  | ContextCompilerCoreSuccess
  | ContextCompilerCoreFailure;

export interface CompileContextMetrics {
  full_context_tokens: number;
  compiled_context_tokens: number;
  recent_window_tokens: number;
  active_state_tokens: number;
  retrieved_tokens: number;
  compile_latency_ms: number;
  extractor_latency_ms: 0;
  active_state_items: number;
  suppressed_items: number;
}

export interface CompileContextResult {
  context: CompiledContext;
  metrics: CompileContextMetrics;
}

export interface ContextCompilerCommandPort {
  call(
    command: ContextCompilerCommandName,
    input: unknown
  ): ContextCompilerCoreResponse;
  close(): void;
}

export class ContextCompilerCoreError extends Error {
  constructor(readonly code: ContextCompilerCoreErrorCode) {
    super(code);
    this.name = "ContextCompilerCoreError";
  }
}

/**
 * Model- and Host-independent composition root for the current Context Compiler.
 * MCP and future Host adapters depend on this surface rather than Store, Reducer,
 * or SQLite implementation classes.
 */
export class ContextCompilerCore implements ContextCompilerCommandPort {
  private readonly rawStore: SqliteRawHistoryStore;
  private readonly stateStore: SqliteContextStateStore;
  private readonly stateUpdate: StateUpdateCoordinator;
  private readonly recallStore: SqliteHistoryRecallStore;
  private readonly ledgerStore: SqliteExperienceLedgerStore;
  private closed = false;

  constructor(databasePath: string) {
    if (typeof databasePath !== "string" || databasePath.length === 0) {
      throw new ContextCompilerCoreError("INVALID_INPUT");
    }
    void dirname(databasePath);
    let rawStore: SqliteRawHistoryStore | undefined;
    let stateStore: SqliteContextStateStore | undefined;
    let recallStore: SqliteHistoryRecallStore | undefined;
    let ledgerStore: SqliteExperienceLedgerStore | undefined;
    try {
      rawStore = new SqliteRawHistoryStore(databasePath);
      stateStore = new SqliteContextStateStore(databasePath);
      recallStore = new SqliteHistoryRecallStore(databasePath);
      ledgerStore = new SqliteExperienceLedgerStore(databasePath);
    } catch {
      try { recallStore?.close(); } catch { /* preserve stable startup failure */ }
      try { ledgerStore?.close(); } catch { /* preserve stable startup failure */ }
      try { stateStore?.close(); } catch { /* preserve stable startup failure */ }
      try { rawStore?.close(); } catch { /* preserve stable startup failure */ }
      throw new ContextCompilerCoreError("STORAGE_FAILURE");
    }
    this.rawStore = rawStore;
    this.stateStore = stateStore;
    this.stateUpdate = new StateUpdateCoordinator(stateStore);
    this.recallStore = recallStore;
    this.ledgerStore = ledgerStore;
  }

  call(
    command: ContextCompilerCommandName,
    input: unknown
  ): ContextCompilerCoreResponse {
    if (this.closed) return failure("STORAGE_FAILURE");
    try {
      assertPlainData(input, "command input");
      switch (command) {
        case "health":
          assertKeys(input, [], []);
          return success({
            version: CONTEXT_COMPILER_CORE_VERSION,
            capabilities: [...CONTEXT_COMPILER_COMMANDS],
            ready: true,
          });
        case "ingest_event":
          return success(this.ingest(input));
        case "compile_context":
          return success(this.compile(input));
        case "get_state":
          return success(this.getState(input));
        case "prepare_state_update":
          return success(this.prepareStateUpdate(input));
        case "apply_state_delta":
          return success(this.applyStateDelta(input));
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

  appendExperienceRecord(input: ExperienceLedgerInput): ExperienceLedgerRecord {
    this.assertOpen();
    try {
      assertPlainData(input, "experience record input");
      return this.ledgerStore.append(input);
    } catch (error) {
      throw mapExperienceLedgerError(error);
    }
  }

  getExperienceRecords(sessionId: string): ExperienceLedgerRecord[] {
    this.assertOpen();
    requireNonEmptyString(sessionId);
    try {
      return this.ledgerStore.getSessionRecords(sessionId);
    } catch {
      throw new ContextCompilerCoreError("STORAGE_FAILURE");
    }
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    let failed = false;
    for (const store of [this.ledgerStore, this.recallStore, this.stateStore, this.rawStore]) {
      try {
        store.close();
      } catch {
        failed = true;
      }
    }
    if (failed) throw new ContextCompilerCoreError("STORAGE_FAILURE");
  }

  private assertOpen(): void {
    if (this.closed) throw new ContextCompilerCoreError("STORAGE_FAILURE");
  }

  private ingest(value: unknown): unknown {
    const input = readObject(value, ["session_id", "role", "content"], [
      "event_type", "created_at", "token_count", "metadata", "source_event_id", "dense_embedding",
    ]);
    requireNonEmptyString(input.session_id);
    requireEnum(input.role, ["system", "user", "assistant", "tool"]);
    requireString(input.content);
    optionalNonEmptyString(input.event_type);
    optionalString(input.created_at);
    optionalNonNegativeSafeInteger(input.token_count);
    optionalNonEmptyString(input.source_event_id);
    if (input.metadata !== undefined) requirePlainObject(input.metadata);
    if (input.dense_embedding !== undefined) {
      try {
        normalizeDenseEmbedding(input.dense_embedding, "dense_embedding");
      } catch {
        invalid();
      }
    }
    try {
      return this.rawStore.ingest(input as unknown as RawEventInput);
    } catch (error) {
      if (error instanceof Error && error.message.includes("conflicts with existing raw evidence")) {
        throw new ContextCompilerCoreError("CONFLICT");
      }
      throw new ContextCompilerCoreError("STORAGE_FAILURE");
    }
  }

  private compile(value: unknown): CompileContextResult {
    const input = readObject(value, ["session_id", "current_input"], [
      "token_budget", "recent_raw_window_turns", "operation_id", "dense_query", "context_policy",
    ]);
    const sessionId = requireNonEmptyString(input.session_id);
    const currentInput = requireNonBlankString(input.current_input);
    optionalIntegerInRange(input.token_budget, 0, Number.MAX_SAFE_INTEGER);
    optionalIntegerInRange(input.recent_raw_window_turns, 1, 100);
    optionalNonBlankString(input.operation_id);
    if (input.context_policy !== undefined) requirePlainObject(input.context_policy);
    let denseQuery: DenseEmbedding | undefined;
    if (input.dense_query !== undefined) {
      try {
        denseQuery = normalizeDenseEmbedding(input.dense_query, "dense_query");
      } catch {
        invalid();
      }
    }

    const startedAt = performance.now();
    const assemblerSessionId = sessionId.trim().length === 0
      ? "__context_compiler_whitespace_session__"
      : sessionId;
    let context: CompiledContext;
    try {
      context = withCompileTelemetryBoundaryInsideService(this.ledgerStore, () => {
        const items = this.stateStore.getItems(sessionId)
          .map((item) => ({ ...item, session_id: assemblerSessionId }));
        const relations = this.stateStore.getSessionRelations(sessionId)
          .map((relation) => ({ ...relation, session_id: assemblerSessionId }));
        const rawEvents = this.rawStore.getSessionEvents(sessionId)
          .map((event) => ({ ...event, session_id: assemblerSessionId }));
        const ledgerRecords = this.ledgerStore.getSessionRecords(sessionId);
        if (input.operation_id === undefined &&
            hasTrustedContextCompileBaseline(ledgerRecords, sessionId)) {
          throw new OperationalContextError(
            "operation_id is required after session compile telemetry has started"
          );
        }
        const operational = compileOperationalContext({
          session_id: assemblerSessionId,
          context_items: items,
          state_relations: relations,
          raw_events: rawEvents,
          current_input: currentInput,
          state_revision: this.stateStore.getRevision(sessionId),
          ...(input.token_budget === undefined ? {} : { token_budget: input.token_budget as number }),
          ...(input.recent_raw_window_turns === undefined
            ? {}
            : { recent_raw_window_turns: input.recent_raw_window_turns as number }),
          ...(input.context_policy === undefined
            ? {}
            : { context_policy: input.context_policy as unknown as ContextPolicyInput }),
          ...(denseQuery === undefined ? {} : { dense_query: denseQuery }),
          ...(input.operation_id === undefined ? {} : { operation_id: input.operation_id as string }),
          ledger_records: ledgerRecords.map((record) => ({
            ...record,
            session_id: assemblerSessionId,
          })),
        });
        const compiled = operational.context;
        if (input.operation_id !== undefined) {
          const trace = appendContextCompileTraceInsideService(this.ledgerStore, {
            session_id: sessionId,
            operation_id: input.operation_id as string,
            payload: operational.trace_payload,
            raw_event_ids: operational.trace_raw_event_ids,
            hits: operational.hits,
          });
          compiled.operational_debug = {
            ...compiled.operational_debug,
            compile_trace_id: trace.trace.id,
            compile_trace_seq: trace.trace.seq,
            retrieval_hit_ledger_ids: trace.hits.map((record) => record.id),
          };
        }
        return compiled;
      });
    } catch (error) {
      if (error instanceof ContextAssemblerValidationError ||
          error instanceof OperationalContextError ||
          error instanceof ExperienceLedgerError) throw error;
      throw new ContextCompilerCoreError("STORAGE_FAILURE");
    }
    if (assemblerSessionId !== sessionId) restoreCompiledContextSessionId(context, sessionId);
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
        retrieved_tokens: estimateTokens(
          (context.retrieved_history ?? []).map((event) => event.content).join("\n")
        ),
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
      throw new ContextCompilerCoreError("STORAGE_FAILURE");
    }
  }

  private prepareStateUpdate(value: unknown): unknown {
    try {
      return this.stateUpdate.prepareStateUpdate(value);
    } catch (error) {
      throw mapStateUpdateError(error);
    }
  }

  private applyStateDelta(value: unknown): unknown {
    try {
      return this.stateUpdate.applyStateDelta(value);
    } catch (error) {
      throw mapStateUpdateError(error);
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

function success(result: unknown): ContextCompilerCoreSuccess {
  return { ok: true, result };
}

function failure(code: ContextCompilerCoreErrorCode): ContextCompilerCoreFailure {
  return { ok: false, error: { code } };
}

function mapRecallError(error: unknown): ContextCompilerCoreError {
  if (!(error instanceof HistoryRecallError)) return new ContextCompilerCoreError("INTERNAL_FAILURE");
  switch (error.category) {
    case "validation": return new ContextCompilerCoreError("INVALID_INPUT");
    case "not_found": return new ContextCompilerCoreError("NOT_FOUND");
    case "conflict": return new ContextCompilerCoreError("CONFLICT");
    case "state":
    case "storage": return new ContextCompilerCoreError("STORAGE_FAILURE");
  }
}

function mapStateUpdateError(error: unknown): ContextCompilerCoreError {
  if (!(error instanceof StateUpdateError)) {
    return new ContextCompilerCoreError("INTERNAL_FAILURE");
  }
  return new ContextCompilerCoreError(error.code);
}

function mapExperienceLedgerError(error: unknown): ContextCompilerCoreError {
  if (!(error instanceof ExperienceLedgerError)) {
    return new ContextCompilerCoreError("INTERNAL_FAILURE");
  }
  if (error.code === "CONFLICT") return new ContextCompilerCoreError("CONFLICT");
  if (error.code === "INVALID_INPUT" || error.code === "NOT_FOUND") {
    return new ContextCompilerCoreError("INVALID_INPUT");
  }
  return new ContextCompilerCoreError("STORAGE_FAILURE");
}

function classifyError(error: unknown): ContextCompilerCoreErrorCode {
  if (error instanceof ContextCompilerCoreError) return error.code;
  if (error instanceof ContextAssemblerValidationError) return "INVALID_INPUT";
  if (error instanceof OperationalContextError) return "INVALID_INPUT";
  if (error instanceof ExperienceLedgerError) return mapExperienceLedgerError(error).code;
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

function optionalNonBlankString(value: unknown): void {
  if (value !== undefined &&
      (typeof value !== "string" || value.trim().length === 0 || value.length > 500)) {
    invalid();
  }
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
  throw new ContextCompilerCoreError("INVALID_INPUT");
}

function restoreCompiledContextSessionId(context: CompiledContext, original: string): void {
  context.session_id = original;
  for (const items of [
    context.active_goals,
    context.active_constraints,
    context.active_decisions,
    context.open_questions,
    context.dependency_items,
  ]) {
    for (const item of items) item.session_id = original;
  }
  for (const event of context.recent_conversation) event.session_id = original;
  for (const event of context.retrieved_history ?? []) event.session_id = original;
}
