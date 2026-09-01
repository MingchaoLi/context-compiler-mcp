import { createHash } from "node:crypto";

export const ROLLING_SUMMARY_POLICY_VERSION = "rc-rolling-summary-policy-v1" as const;
export const ROLLING_SUMMARY_PROMPT_VERSION = "rc-rolling-summary-prompt-v1" as const;
export const ROLLING_SUMMARY_SNAPSHOT_VERSION = "rc-rolling-summary-snapshot-v1" as const;
export const DEFAULT_ROLLING_SUMMARY_RECENT_TURNS = 6;

const DEFAULT_MAX_SUMMARY_TOKENS = 2_048;
const MAX_SUMMARY_OUTPUT_CHARACTERS = 65_536;
const MAX_TIMEOUT_MS = 120_000;
const IDENTITY = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/u;

export type RollingSummaryJsonValue =
  | null
  | boolean
  | number
  | string
  | readonly RollingSummaryJsonValue[]
  | { readonly [key: string]: RollingSummaryJsonValue };

export type RollingSummaryMessageRole = "user" | "assistant" | "tool";

export type RollingSummaryToolAssociation =
  | Readonly<{
    kind: "assistant_tool_calls";
    tool_call_ids: readonly string[];
  }>
  | Readonly<{
    kind: "tool_result";
    tool_call_id: string;
    tool_name: string;
    is_error: boolean;
  }>
  | null;

export interface NormalizedRollingSummaryMessage {
  readonly message_id: string;
  readonly role: RollingSummaryMessageRole;
  readonly content: RollingSummaryJsonValue;
  readonly tool: RollingSummaryToolAssociation;
}

export interface NormalizedRollingSummaryTurn {
  readonly host_instance_id: string;
  readonly session_id: string;
  readonly working_store_generation: number;
  readonly turn_id: string;
  readonly ordinal: number;
  readonly messages: readonly NormalizedRollingSummaryMessage[];
}

export interface NormalizedRollingSummaryCurrentTurn {
  readonly messages: readonly NormalizedRollingSummaryMessage[];
}

export interface RollingSummaryGeneratorIdentity {
  readonly model_identity: string;
  readonly prompt_version: string;
  readonly policy_version: typeof ROLLING_SUMMARY_POLICY_VERSION;
}

export interface RollingSummarySnapshot {
  readonly schema_version: typeof ROLLING_SUMMARY_SNAPSHOT_VERSION;
  readonly summary_id: string;
  readonly host_instance_id: string;
  readonly session_id: string;
  readonly working_store_generation: number;
  readonly covered_turn_ids: readonly string[];
  readonly covered_turn_ordinals: readonly number[];
  readonly content: string;
  readonly content_hash: string;
  readonly generator: RollingSummaryGeneratorIdentity;
  readonly estimated_tokens: number;
  readonly created_at: string;
}

export interface RollingSummaryModelRequest {
  readonly request_id: string;
  readonly prompt_version: string;
  readonly instructions: string;
  readonly host_instance_id: string;
  readonly session_id: string;
  readonly working_store_generation: number;
  readonly covered_turns: readonly NormalizedRollingSummaryTurn[];
}

export interface RollingSummaryModelResponse {
  readonly content: string;
}

export interface SummaryModelPort {
  generate(
    request: RollingSummaryModelRequest,
    options: Readonly<{ signal: AbortSignal }>,
  ): RollingSummaryModelResponse | Promise<RollingSummaryModelResponse>;
}

export interface RollingSummaryContext {
  readonly system_prompt: string | null;
  readonly tools: readonly RollingSummaryJsonValue[];
  readonly summary: Readonly<{
    role: "system";
    content: string;
    summary_id: string;
    content_hash: string;
  }>;
  readonly recent_turns: readonly NormalizedRollingSummaryTurn[];
  readonly current_turn: NormalizedRollingSummaryCurrentTurn;
}

export type RollingSummaryTokenCountInput =
  | Readonly<{
    kind: "summary_content";
    model_identity: string;
    content: string;
  }>
  | Readonly<{
    kind: "short_context";
    model_identity: string;
    context: RollingSummaryContext;
  }>;

export interface RollingSummaryTokenCounterPort {
  countTokens(
    input: RollingSummaryTokenCountInput,
    options: Readonly<{ signal: AbortSignal }>,
  ): number | null | Promise<number | null>;
}

export interface RollingSummaryCompileInput {
  readonly host_instance_id: string;
  readonly session_id: string;
  readonly working_store_generation: number;
  readonly completed_turns: readonly NormalizedRollingSummaryTurn[];
  readonly current_turn: NormalizedRollingSummaryCurrentTurn;
  readonly system_prompt?: string | null;
  readonly tools?: readonly RollingSummaryJsonValue[];
  readonly previous_snapshot?: RollingSummarySnapshot | null;
  readonly native_context_tokens: number;
  readonly summary_model_identity: string;
  readonly context_model_identity: string;
  readonly prompt_version?: string;
  readonly recent_turn_count?: number;
  readonly max_summary_tokens?: number;
  readonly timeout_ms: number;
  readonly signal?: AbortSignal;
}

export type RollingSummaryFallbackReason =
  | "INVALID_INPUT"
  | "NO_COVERED_TURNS"
  | "COVERAGE_INVALID"
  | "TOOL_CHAIN_INVALID"
  | "SNAPSHOT_INVALID"
  | "MODEL_FAILED"
  | "MODEL_TIMEOUT"
  | "MODEL_ABORTED"
  | "MODEL_OUTPUT_EMPTY"
  | "MODEL_OUTPUT_INVALID"
  | "TOKEN_COUNT_UNKNOWN"
  | "SUMMARY_TOKEN_BUDGET_EXCEEDED"
  | "NO_TOKEN_BENEFIT";

export type RollingSummaryCompileResult =
  | Readonly<{
    status: "READY";
    snapshot: RollingSummarySnapshot;
    context: RollingSummaryContext;
    generated: boolean;
    native_context_tokens: number;
    short_context_tokens: number;
    token_savings: number;
  }>
  | Readonly<{
    status: "FALLBACK";
    reason: RollingSummaryFallbackReason;
    generated: boolean;
    native_context_tokens: number | null;
    short_context_tokens: number | null;
  }>;

export type RollingSummaryCoverageValidation =
  | Readonly<{ status: "VALID" }>
  | Readonly<{ status: "INVALID"; reason: "COVERAGE_INVALID" | "TOOL_CHAIN_INVALID" }>;

const SUMMARY_INSTRUCTIONS = [
  "Create a compact working summary from every covered complete turn.",
  "Preserve the current goal, confirmed conclusions, constraints, completed work and results, unresolved questions, and explicit next steps.",
  "Preserve exact identifiers, paths, numbers, errors, and tool results that may still be needed.",
  "Treat later corrections as authoritative and do not present superseded conclusions as current.",
  "Do not invent facts and do not summarize any turn outside the supplied ordered coverage.",
].join("\n");

interface NormalizedCompileInput {
  readonly host_instance_id: string;
  readonly session_id: string;
  readonly working_store_generation: number;
  readonly completed_turns: readonly NormalizedRollingSummaryTurn[];
  readonly current_turn: NormalizedRollingSummaryCurrentTurn;
  readonly system_prompt: string | null;
  readonly tools: readonly RollingSummaryJsonValue[];
  readonly previous_snapshot: RollingSummarySnapshot | null;
  readonly native_context_tokens: number;
  readonly summary_model_identity: string;
  readonly context_model_identity: string;
  readonly prompt_version: string;
  readonly recent_turn_count: number;
  readonly max_summary_tokens: number;
  readonly timeout_ms: number;
  readonly signal: AbortSignal | undefined;
}

export class RollingSummaryCompiler {
  constructor(
    private readonly summaryModel: SummaryModelPort,
    private readonly tokenCounter: RollingSummaryTokenCounterPort,
    private readonly now: () => string = () => new Date().toISOString(),
  ) {
    if (typeof summaryModel?.generate !== "function") throw new TypeError("summaryModel.generate is required");
    if (typeof tokenCounter?.countTokens !== "function") throw new TypeError("tokenCounter.countTokens is required");
    if (typeof now !== "function") throw new TypeError("now must be a function");
  }

  async compile(input: RollingSummaryCompileInput): Promise<RollingSummaryCompileResult> {
    let normalized: NormalizedCompileInput;
    try {
      normalized = normalizeCompileInput(input);
    } catch {
      return fallback("INVALID_INPUT", null, false);
    }

    const coverage = validateRollingSummaryCoverage(normalized.completed_turns, {
      host_instance_id: normalized.host_instance_id,
      session_id: normalized.session_id,
      working_store_generation: normalized.working_store_generation,
    });
    if (coverage.status === "INVALID") {
      return fallback(coverage.reason, normalized.native_context_tokens, false);
    }
    if (!validateCurrentTurn(normalized.current_turn)) {
      return fallback("TOOL_CHAIN_INVALID", normalized.native_context_tokens, false);
    }

    const split = Math.max(0, normalized.completed_turns.length - normalized.recent_turn_count);
    const coveredTurns = normalized.completed_turns.slice(0, split);
    const recentTurns = normalized.completed_turns.slice(split);
    if (coveredTurns.length === 0) {
      return fallback("NO_COVERED_TURNS", normalized.native_context_tokens, false);
    }

    const generator: RollingSummaryGeneratorIdentity = deepFreeze({
      model_identity: normalized.summary_model_identity,
      prompt_version: normalized.prompt_version,
      policy_version: ROLLING_SUMMARY_POLICY_VERSION,
    });
    const expectedSummaryId = summaryIdentity(normalized, coveredTurns, generator);
    const prior = normalized.previous_snapshot;
    let snapshot: RollingSummarySnapshot;
    let generated = false;

    if (prior !== null && sameCoverage(prior.covered_turn_ids, coveredTurns)) {
      if (!validateRollingSummarySnapshot(prior, {
        host_instance_id: normalized.host_instance_id,
        session_id: normalized.session_id,
        working_store_generation: normalized.working_store_generation,
        covered_turns: coveredTurns,
        generator,
        summary_id: expectedSummaryId,
      })) {
        return fallback("SNAPSHOT_INVALID", normalized.native_context_tokens, false);
      }
      snapshot = prior;
    } else {
      if (prior !== null && !isCoveragePrefix(prior.covered_turn_ids, coveredTurns)) {
        return fallback("SNAPSHOT_INVALID", normalized.native_context_tokens, false);
      }
      const generatedResult = await this.generateSnapshot(
        normalized,
        coveredTurns,
        generator,
        expectedSummaryId,
      );
      if (generatedResult.status === "FALLBACK") return generatedResult;
      snapshot = generatedResult.snapshot;
      generated = true;
    }

    if (snapshot.estimated_tokens > normalized.max_summary_tokens) {
      return fallback("SUMMARY_TOKEN_BUDGET_EXCEEDED", normalized.native_context_tokens, generated);
    }
    const context = assembleRollingSummaryContext({
      system_prompt: normalized.system_prompt,
      tools: normalized.tools,
      snapshot,
      recent_turns: recentTurns,
      current_turn: normalized.current_turn,
    });
    const signal = normalized.signal ?? new AbortController().signal;
    const shortTokens = await safeCountTokens(this.tokenCounter, {
      kind: "short_context",
      model_identity: normalized.context_model_identity,
      context,
    }, signal);
    if (shortTokens === null) {
      return fallback("TOKEN_COUNT_UNKNOWN", normalized.native_context_tokens, generated);
    }
    if (shortTokens >= normalized.native_context_tokens) {
      return deepFreeze({
        status: "FALLBACK",
        reason: "NO_TOKEN_BENEFIT",
        generated,
        native_context_tokens: normalized.native_context_tokens,
        short_context_tokens: shortTokens,
      });
    }
    return deepFreeze({
      status: "READY",
      snapshot,
      context,
      generated,
      native_context_tokens: normalized.native_context_tokens,
      short_context_tokens: shortTokens,
      token_savings: normalized.native_context_tokens - shortTokens,
    });
  }

  private async generateSnapshot(
    input: NormalizedCompileInput,
    coveredTurns: readonly NormalizedRollingSummaryTurn[],
    generator: RollingSummaryGeneratorIdentity,
    summaryId: string,
  ): Promise<
    | Readonly<{ status: "READY"; snapshot: RollingSummarySnapshot }>
    | Extract<RollingSummaryCompileResult, { status: "FALLBACK" }>
  > {
    if (input.signal?.aborted) return fallback("MODEL_ABORTED", input.native_context_tokens, false);
    const controller = new AbortController();
    const signal = input.signal === undefined
      ? controller.signal
      : AbortSignal.any([input.signal, controller.signal]);
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, input.timeout_ms);
    const request = deepFreeze({
      request_id: summaryId,
      prompt_version: input.prompt_version,
      instructions: SUMMARY_INSTRUCTIONS,
      host_instance_id: input.host_instance_id,
      session_id: input.session_id,
      working_store_generation: input.working_store_generation,
      covered_turns: coveredTurns,
    });
    let abortReject!: (reason: Error) => void;
    const onAbort = (): void => abortReject(new Error("ABORTED"));
    const aborted = new Promise<never>((_resolve, reject) => {
      abortReject = reject;
      signal.addEventListener("abort", onAbort, { once: true });
    });
    try {
      if (signal.aborted) {
        return fallback(timedOut ? "MODEL_TIMEOUT" : "MODEL_ABORTED", input.native_context_tokens, false);
      }
      const modelResult = this.summaryModel.generate(request, { signal });
      const response = await Promise.race([
        Promise.resolve(modelResult),
        aborted,
      ]);
      if (signal.aborted) {
        return fallback(timedOut ? "MODEL_TIMEOUT" : "MODEL_ABORTED", input.native_context_tokens, false);
      }
      if (response === null || typeof response !== "object" || Array.isArray(response) ||
          typeof response.content !== "string" || response.content.length > MAX_SUMMARY_OUTPUT_CHARACTERS) {
        return fallback("MODEL_OUTPUT_INVALID", input.native_context_tokens, false);
      }
      const content = response.content.trim();
      if (content.length === 0) return fallback("MODEL_OUTPUT_EMPTY", input.native_context_tokens, false);
      const estimatedTokens = await safeCountTokens(this.tokenCounter, {
        kind: "summary_content",
        model_identity: input.context_model_identity,
        content,
      }, signal);
      if (estimatedTokens === null) {
        return fallback("TOKEN_COUNT_UNKNOWN", input.native_context_tokens, false);
      }
      let createdAt: string;
      try {
        createdAt = this.now();
      } catch {
        return fallback("MODEL_OUTPUT_INVALID", input.native_context_tokens, false);
      }
      if (typeof createdAt !== "string" || createdAt.length === 0) {
        return fallback("MODEL_OUTPUT_INVALID", input.native_context_tokens, false);
      }
      return deepFreeze({
        status: "READY",
        snapshot: {
          schema_version: ROLLING_SUMMARY_SNAPSHOT_VERSION,
          summary_id: summaryId,
          host_instance_id: input.host_instance_id,
          session_id: input.session_id,
          working_store_generation: input.working_store_generation,
          covered_turn_ids: coveredTurns.map((turn) => turn.turn_id),
          covered_turn_ordinals: coveredTurns.map((turn) => turn.ordinal),
          content,
          content_hash: sha256(content),
          generator,
          estimated_tokens: estimatedTokens,
          created_at: createdAt,
        },
      });
    } catch {
      return fallback(
        signal.aborted ? (timedOut ? "MODEL_TIMEOUT" : "MODEL_ABORTED") : "MODEL_FAILED",
        input.native_context_tokens,
        false,
      );
    } finally {
      clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
    }
  }
}

export function validateRollingSummaryCoverage(
  turns: readonly NormalizedRollingSummaryTurn[],
  scope: Readonly<{
    host_instance_id: string;
    session_id: string;
    working_store_generation: number;
  }>,
): RollingSummaryCoverageValidation {
  if (!Array.isArray(turns)) return deepFreeze({ status: "INVALID", reason: "COVERAGE_INVALID" });
  const ids = new Set<string>();
  const ordinals = new Set<number>();
  let previousOrdinal: number | undefined;
  for (const turn of turns) {
    if (!validTurnShape(turn) || turn.host_instance_id !== scope.host_instance_id ||
        turn.session_id !== scope.session_id ||
        turn.working_store_generation !== scope.working_store_generation ||
        ids.has(turn.turn_id) || ordinals.has(turn.ordinal) ||
        (previousOrdinal !== undefined && turn.ordinal !== previousOrdinal + 1)) {
      return deepFreeze({ status: "INVALID", reason: "COVERAGE_INVALID" });
    }
    if (!validateCompleteTurnMessages(turn.messages)) {
      return deepFreeze({ status: "INVALID", reason: "TOOL_CHAIN_INVALID" });
    }
    ids.add(turn.turn_id);
    ordinals.add(turn.ordinal);
    previousOrdinal = turn.ordinal;
  }
  return deepFreeze({ status: "VALID" });
}

export function validateRollingSummarySnapshot(
  snapshot: RollingSummarySnapshot,
  expected: Readonly<{
    host_instance_id: string;
    session_id: string;
    working_store_generation: number;
    covered_turns: readonly NormalizedRollingSummaryTurn[];
    generator: RollingSummaryGeneratorIdentity;
    summary_id: string;
  }>,
): boolean {
  try {
    return snapshot.schema_version === ROLLING_SUMMARY_SNAPSHOT_VERSION &&
      snapshot.summary_id === expected.summary_id &&
      snapshot.host_instance_id === expected.host_instance_id &&
      snapshot.session_id === expected.session_id &&
      snapshot.working_store_generation === expected.working_store_generation &&
      sameStringArray(snapshot.covered_turn_ids, expected.covered_turns.map((turn) => turn.turn_id)) &&
      sameNumberArray(snapshot.covered_turn_ordinals, expected.covered_turns.map((turn) => turn.ordinal)) &&
      snapshot.content.length > 0 &&
      snapshot.content_hash === sha256(snapshot.content) &&
      canonicalJson(snapshot.generator) === canonicalJson(expected.generator) &&
      Number.isSafeInteger(snapshot.estimated_tokens) && snapshot.estimated_tokens >= 0 &&
      typeof snapshot.created_at === "string" && snapshot.created_at.length > 0;
  } catch {
    return false;
  }
}

export function assembleRollingSummaryContext(input: Readonly<{
  system_prompt: string | null;
  tools: readonly RollingSummaryJsonValue[];
  snapshot: RollingSummarySnapshot;
  recent_turns: readonly NormalizedRollingSummaryTurn[];
  current_turn: NormalizedRollingSummaryCurrentTurn;
}>): RollingSummaryContext {
  return deepFreeze({
    system_prompt: input.system_prompt,
    tools: input.tools,
    summary: {
      role: "system",
      content: input.snapshot.content,
      summary_id: input.snapshot.summary_id,
      content_hash: input.snapshot.content_hash,
    },
    recent_turns: input.recent_turns,
    current_turn: input.current_turn,
  });
}

function normalizeCompileInput(input: RollingSummaryCompileInput): NormalizedCompileInput {
  requiredIdentity(input.host_instance_id);
  requiredIdentity(input.session_id);
  requiredPositiveInteger(input.working_store_generation);
  requiredIdentity(input.summary_model_identity);
  requiredIdentity(input.context_model_identity);
  const promptVersion = input.prompt_version ?? ROLLING_SUMMARY_PROMPT_VERSION;
  requiredIdentity(promptVersion);
  const recentTurnCount = input.recent_turn_count ?? DEFAULT_ROLLING_SUMMARY_RECENT_TURNS;
  requiredPositiveInteger(recentTurnCount);
  const maxSummaryTokens = input.max_summary_tokens ?? DEFAULT_MAX_SUMMARY_TOKENS;
  requiredPositiveInteger(maxSummaryTokens);
  requiredPositiveInteger(input.timeout_ms);
  if (input.timeout_ms > MAX_TIMEOUT_MS || !Number.isSafeInteger(input.native_context_tokens) ||
      input.native_context_tokens < 0 || !Array.isArray(input.completed_turns) ||
      input.current_turn === null || typeof input.current_turn !== "object") {
    throw new TypeError("invalid rolling summary compile input");
  }
  if (input.system_prompt !== undefined && input.system_prompt !== null && typeof input.system_prompt !== "string") {
    throw new TypeError("system_prompt must be a string or null");
  }
  if (input.tools !== undefined && !Array.isArray(input.tools)) throw new TypeError("tools must be an array");
  const cloned = deepFreeze(jsonClone({
    completed_turns: input.completed_turns,
    current_turn: input.current_turn,
    tools: input.tools ?? [],
  }));
  const previous = input.previous_snapshot === undefined || input.previous_snapshot === null
    ? null
    : deepFreeze(jsonClone(input.previous_snapshot));
  return Object.freeze({
    host_instance_id: input.host_instance_id,
    session_id: input.session_id,
    working_store_generation: input.working_store_generation,
    completed_turns: cloned.completed_turns,
    current_turn: cloned.current_turn,
    system_prompt: input.system_prompt ?? null,
    tools: cloned.tools,
    previous_snapshot: previous,
    native_context_tokens: input.native_context_tokens,
    summary_model_identity: input.summary_model_identity,
    context_model_identity: input.context_model_identity,
    prompt_version: promptVersion,
    recent_turn_count: recentTurnCount,
    max_summary_tokens: maxSummaryTokens,
    timeout_ms: input.timeout_ms,
    signal: input.signal,
  });
}

function validTurnShape(turn: NormalizedRollingSummaryTurn): boolean {
  return turn !== null && typeof turn === "object" &&
    IDENTITY.test(turn.host_instance_id) && IDENTITY.test(turn.session_id) && IDENTITY.test(turn.turn_id) &&
    Number.isSafeInteger(turn.working_store_generation) && turn.working_store_generation > 0 &&
    Number.isSafeInteger(turn.ordinal) && turn.ordinal > 0 && Array.isArray(turn.messages) && turn.messages.length > 0;
}

function validateCompleteTurnMessages(messages: readonly NormalizedRollingSummaryMessage[]): boolean {
  if (!messages.some((message) => message.role === "user") ||
      !messages.some((message) => message.role === "assistant")) return false;
  const pending = new Set<string>();
  const seenCalls = new Set<string>();
  const seenResults = new Set<string>();
  for (const message of messages) {
    if (!validMessage(message)) return false;
    if (message.tool?.kind === "assistant_tool_calls") {
      if (message.role !== "assistant" || message.tool.tool_call_ids.length === 0) return false;
      for (const id of message.tool.tool_call_ids) {
        if (typeof id !== "string" || !IDENTITY.test(id) || seenCalls.has(id)) return false;
        seenCalls.add(id);
        pending.add(id);
      }
    } else if (message.tool?.kind === "tool_result") {
      const id = message.tool.tool_call_id;
      if (message.role !== "tool" || !pending.has(id) || seenResults.has(id)) return false;
      pending.delete(id);
      seenResults.add(id);
    }
  }
  return pending.size === 0;
}

function validateCurrentTurn(turn: NormalizedRollingSummaryCurrentTurn): boolean {
  if (!Array.isArray(turn.messages) || turn.messages.length === 0 ||
      !turn.messages.some((message) => message.role === "user")) return false;
  const calls = new Set<string>();
  const results = new Set<string>();
  for (const message of turn.messages) {
    if (!validMessage(message)) return false;
    if (message.tool?.kind === "assistant_tool_calls") {
      if (message.role !== "assistant") return false;
      for (const id of message.tool.tool_call_ids) {
        if (typeof id !== "string" || !IDENTITY.test(id) || calls.has(id)) return false;
        calls.add(id);
      }
    } else if (message.tool?.kind === "tool_result") {
      const id = message.tool.tool_call_id;
      if (message.role !== "tool" || !calls.has(id) || results.has(id)) return false;
      results.add(id);
    }
  }
  return true;
}

function validMessage(message: NormalizedRollingSummaryMessage): boolean {
  if (message === null || typeof message !== "object" || !IDENTITY.test(message.message_id) ||
      (message.role !== "user" && message.role !== "assistant" && message.role !== "tool") ||
      !isJsonValue(message.content)) return false;
  if (message.tool === null) return message.role !== "tool";
  if (message.tool.kind === "assistant_tool_calls") {
    return Array.isArray(message.tool.tool_call_ids) && message.tool.tool_call_ids.length > 0;
  }
  return message.tool.kind === "tool_result" && IDENTITY.test(message.tool.tool_call_id) &&
    typeof message.tool.tool_name === "string" && typeof message.tool.is_error === "boolean";
}

function summaryIdentity(
  input: NormalizedCompileInput,
  coveredTurns: readonly NormalizedRollingSummaryTurn[],
  generator: RollingSummaryGeneratorIdentity,
): string {
  return `rs-${sha256(canonicalJson({
    host_instance_id: input.host_instance_id,
    session_id: input.session_id,
    working_store_generation: input.working_store_generation,
    covered_turns: coveredTurns,
    generator,
  }))}`;
}

async function safeCountTokens(
  counter: RollingSummaryTokenCounterPort,
  input: RollingSummaryTokenCountInput,
  signal: AbortSignal,
): Promise<number | null> {
  if (signal.aborted) return null;
  try {
    const value = await counter.countTokens(deepFreeze(input), { signal });
    return Number.isSafeInteger(value) && value !== null && value >= 0 ? value : null;
  } catch {
    return null;
  }
}

function fallback(
  reason: RollingSummaryFallbackReason,
  nativeTokens: number | null,
  generated: boolean,
): Extract<RollingSummaryCompileResult, { status: "FALLBACK" }> {
  return deepFreeze({
    status: "FALLBACK",
    reason,
    generated,
    native_context_tokens: nativeTokens,
    short_context_tokens: null,
  });
}

function isCoveragePrefix(
  ids: readonly string[],
  turns: readonly NormalizedRollingSummaryTurn[],
): boolean {
  return ids.length <= turns.length && ids.every((id, index) => turns[index]?.turn_id === id);
}

function sameCoverage(ids: readonly string[], turns: readonly NormalizedRollingSummaryTurn[]): boolean {
  return ids.length === turns.length && isCoveragePrefix(ids, turns);
}

function sameStringArray(left: readonly string[], right: readonly string[]): boolean {
  return Array.isArray(left) && left.length === right.length && left.every((value, index) => value === right[index]);
}

function sameNumberArray(left: readonly number[], right: readonly number[]): boolean {
  return Array.isArray(left) && left.length === right.length && left.every((value, index) => value === right[index]);
}

function requiredIdentity(value: string): void {
  if (typeof value !== "string" || !IDENTITY.test(value)) throw new TypeError("invalid identity");
}

function requiredPositiveInteger(value: number): void {
  if (!Number.isSafeInteger(value) || value <= 0) throw new TypeError("invalid positive integer");
}

function jsonClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function isJsonValue(value: unknown, seen = new Set<object>()): value is RollingSummaryJsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value !== "object" || seen.has(value)) return false;
  seen.add(value);
  if (Array.isArray(value)) return value.every((entry) => isJsonValue(entry, seen));
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  return Object.entries(value).every(([key, entry]) => key.length > 0 && isJsonValue(entry, seen));
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(",")}}`;
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}
