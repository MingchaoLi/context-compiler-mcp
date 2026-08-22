import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { z } from "zod";
import { assembleContext } from "./assembler.js";
import {
  SqliteHistoryRecallStore,
  type HistoryHeadlineInput,
} from "./recall.js";
import {
  estimateTokens,
  SqliteRawHistoryStore,
  type JsonObject,
  type JsonValue,
  type RawEvent,
} from "./raw-store.js";
import type { ContextItem, StateRelation } from "./state-types.js";

export const EVALUATION_REPORT_VERSION = 1 as const;

export type EvaluationErrorCode = "INVALID_INPUT" | "RUNTIME_FAILURE";

export class EvaluationError extends Error {
  readonly code: EvaluationErrorCode;

  constructor(code: EvaluationErrorCode) {
    super(code === "INVALID_INPUT" ? "Evaluation input is invalid" : "Evaluation failed");
    this.name = "EvaluationError";
    this.code = code;
  }
}

export interface EvaluationRecallQuery {
  query: string;
  expected_event_seqs: number[];
  limit?: number;
}

export interface EvaluationProbes {
  constraints: string[];
  decisions: string[];
  resolved_issues: string[];
  open_questions: string[];
}

export interface EvaluationCase {
  id: string;
  session_id: string;
  raw_events: RawEvent[];
  context_items: ContextItem[];
  state_relations: StateRelation[];
  current_input: string;
  recent_raw_window_turns: number;
  token_budget?: number;
  headlines: HistoryHeadlineInput[];
  recall_queries: EvaluationRecallQuery[];
  probes: EvaluationProbes;
}

export interface EvaluationThresholds {
  minimum_d2_token_reduction_ratio: number;
  minimum_d2_constraint_retention: number;
  minimum_d2_decision_continuity: number;
  maximum_d2_resolved_issue_reopening: number;
  minimum_d2_open_question_continuity: number;
  minimum_d2_recall_recovery: number;
  maximum_d2_mean_latency_ms: number;
}

export interface EvaluationSuite {
  version: 1;
  cases: EvaluationCase[];
  thresholds: EvaluationThresholds;
}

export interface EvaluationRate {
  matched: number;
  total: number;
  rate: number;
}

export interface EvaluationDimensionResult {
  estimated_tokens: number;
  token_reduction_ratio: number;
  constraint_retention: EvaluationRate;
  decision_continuity: EvaluationRate;
  resolved_issue_reopening: EvaluationRate;
  open_question_continuity: EvaluationRate;
  recall_recovery: EvaluationRate;
  latency_ms: number;
}

export interface EvaluationCaseResult {
  id: string;
  dimensions: {
    d0: EvaluationDimensionResult;
    d1: EvaluationDimensionResult;
    d2: EvaluationDimensionResult;
  };
}

export interface EvaluationAggregateDimension {
  estimated_tokens_total: number;
  token_reduction_ratio: number;
  constraint_retention: EvaluationRate;
  decision_continuity: EvaluationRate;
  resolved_issue_reopening: EvaluationRate;
  open_question_continuity: EvaluationRate;
  recall_recovery: EvaluationRate;
  latency_ms: {
    total: number;
    mean: number;
    maximum: number;
  };
}

export type EvaluationThresholdFailure =
  | "D2_TOKEN_REDUCTION"
  | "D2_CONSTRAINT_RETENTION"
  | "D2_DECISION_CONTINUITY"
  | "D2_RESOLVED_ISSUE_REOPENING"
  | "D2_OPEN_QUESTION_CONTINUITY"
  | "D2_RECALL_RECOVERY"
  | "D2_MEAN_LATENCY";

export interface EvaluationReport {
  version: 1;
  token_estimator: "character_count_divided_by_four";
  case_count: number;
  cases: EvaluationCaseResult[];
  aggregate: {
    d0: EvaluationAggregateDimension;
    d1: EvaluationAggregateDimension;
    d2: EvaluationAggregateDimension;
  };
  thresholds: EvaluationThresholds;
  threshold_failures: EvaluationThresholdFailure[];
  passed: boolean;
}

const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.null(),
    z.boolean(),
    z.number().finite(),
    z.string(),
    z.array(jsonValueSchema),
    z.record(z.string(), jsonValueSchema),
  ])
);
const jsonObjectSchema: z.ZodType<JsonObject> = z.record(z.string(), jsonValueSchema);
const safeInteger = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const positiveSafeInteger = safeInteger.min(1);
const nonBlank = z.string().refine((value) => value.trim().length > 0);
const canonicalTimestamp = z.string().refine((value) => {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) return false;
  return !Number.isNaN(Date.parse(value)) && new Date(value).toISOString() === value;
});

const rawEventSchema: z.ZodType<RawEvent> = z.strictObject({
  id: nonBlank,
  session_id: z.string().min(1),
  seq: positiveSafeInteger,
  role: z.enum(["system", "user", "assistant", "tool"]),
  content: z.string(),
  event_type: nonBlank,
  created_at: canonicalTimestamp,
  token_count: safeInteger,
  metadata: jsonObjectSchema,
  source_event_id: nonBlank.optional(),
});

const contextItemSchema: z.ZodType<ContextItem> = z.strictObject({
  id: nonBlank,
  session_id: z.string().min(1),
  type: z.enum(["GOAL", "CONSTRAINT", "DECISION", "OPEN_QUESTION", "REJECTED_ALTERNATIVE"]),
  content: z.string().min(1),
  status: z.enum([
    "ACTIVE",
    "COMPLETED",
    "SUPERSEDED",
    "OPEN",
    "RESOLVED",
    "DEFERRED",
    "REJECTED",
  ]),
  confidence: z.number().finite().min(0).max(1),
  created_at: canonicalTimestamp,
  updated_at: canonicalTimestamp,
  source_refs: z.array(nonBlank),
  metadata: jsonObjectSchema,
});

const stateRelationSchema: z.ZodType<StateRelation> = z.strictObject({
  session_id: z.string().min(1),
  source_id: nonBlank,
  relation_type: z.enum(["SUPERSEDES", "DEPENDS_ON", "RESOLVED_BY", "REJECTS", "DERIVED_FROM"]),
  target_id: nonBlank,
  created_at: canonicalTimestamp,
});

const headlineSchema: z.ZodType<HistoryHeadlineInput> = z.strictObject({
  session_id: z.string().min(1),
  event_start_seq: positiveSafeInteger,
  event_end_seq: positiveSafeInteger,
  headline: nonBlank.refine((value) => value.length <= 500),
  keywords: z.array(nonBlank.refine((value) => value.length <= 100)).min(1).max(32),
  created_at: canonicalTimestamp.optional(),
});

const recallQuerySchema: z.ZodType<EvaluationRecallQuery> = z.strictObject({
  query: nonBlank.refine((value) => value.length <= 500),
  expected_event_seqs: z.array(positiveSafeInteger).min(1),
  limit: z.number().int().min(1).max(20).optional(),
});

const probesSchema: z.ZodType<EvaluationProbes> = z.strictObject({
  constraints: z.array(nonBlank),
  decisions: z.array(nonBlank),
  resolved_issues: z.array(nonBlank),
  open_questions: z.array(nonBlank),
});

const evaluationCaseSchema: z.ZodType<EvaluationCase> = z.strictObject({
  id: nonBlank,
  session_id: z.string().min(1),
  raw_events: z.array(rawEventSchema).min(1),
  context_items: z.array(contextItemSchema),
  state_relations: z.array(stateRelationSchema),
  current_input: nonBlank,
  recent_raw_window_turns: z.number().int().min(1).max(100),
  token_budget: safeInteger.optional(),
  headlines: z.array(headlineSchema),
  recall_queries: z.array(recallQuerySchema),
  probes: probesSchema,
});

const ratio = z.number().finite().min(0).max(1);
const thresholdsSchema: z.ZodType<EvaluationThresholds> = z.strictObject({
  minimum_d2_token_reduction_ratio: ratio,
  minimum_d2_constraint_retention: ratio,
  minimum_d2_decision_continuity: ratio,
  maximum_d2_resolved_issue_reopening: ratio,
  minimum_d2_open_question_continuity: ratio,
  minimum_d2_recall_recovery: ratio,
  maximum_d2_mean_latency_ms: z.number().finite().min(0),
});

const evaluationSuiteSchema: z.ZodType<EvaluationSuite> = z.strictObject({
  version: z.literal(EVALUATION_REPORT_VERSION),
  cases: z.array(evaluationCaseSchema).min(1),
  thresholds: thresholdsSchema,
});

export function parseEvaluationSuite(value: unknown): EvaluationSuite {
  const parsed = evaluationSuiteSchema.safeParse(value);
  if (!parsed.success) throw invalidInput();
  try {
    validateSuiteReferences(parsed.data);
    return parsed.data;
  } catch {
    throw invalidInput();
  }
}

export function normalizeEvaluationText(value: string): string {
  return value.normalize("NFKC").replace(/\s+/gu, " ").trim();
}

export function runEvaluationSuite(value: unknown): EvaluationReport {
  const suite = parseEvaluationSuite(value);
  const temporaryRoot = mkdtempSync(join(tmpdir(), "context-compiler-evaluation-"));
  try {
    const cases = suite.cases.map((evaluationCase, index) =>
      evaluateCase(evaluationCase, join(temporaryRoot, `case-${index}.db`))
    );
    const aggregate = aggregateCases(cases);
    const thresholdFailures = evaluateThresholds(aggregate.d2, suite.thresholds);
    return {
      version: EVALUATION_REPORT_VERSION,
      token_estimator: "character_count_divided_by_four",
      case_count: cases.length,
      cases,
      aggregate,
      thresholds: { ...suite.thresholds },
      threshold_failures: thresholdFailures,
      passed: thresholdFailures.length === 0,
    };
  } catch (error) {
    if (error instanceof EvaluationError) throw error;
    throw new EvaluationError("RUNTIME_FAILURE");
  } finally {
    try {
      rmSync(temporaryRoot, { recursive: true, force: true });
    } catch {
      // Temporary cleanup cannot change an already computed evaluation result.
    }
  }
}

function validateSuiteReferences(suite: EvaluationSuite): void {
  assertUnique(suite.cases.map(({ id }) => id));
  for (const evaluationCase of suite.cases) {
    assembleContext({
      session_id: evaluationCase.session_id,
      context_items: evaluationCase.context_items,
      state_relations: evaluationCase.state_relations,
      raw_events: evaluationCase.raw_events,
      current_input: evaluationCase.current_input,
      recent_raw_window_turns: evaluationCase.recent_raw_window_turns,
      ...(evaluationCase.token_budget === undefined
        ? {}
        : { token_budget: evaluationCase.token_budget }),
    });

    const rawEvents = [...evaluationCase.raw_events].sort((left, right) => left.seq - right.seq);
    for (let index = 0; index < rawEvents.length; index += 1) {
      if (rawEvents[index]!.seq !== index + 1) throw invalidInput();
    }
    assertUnique(rawEvents.flatMap((event) =>
      event.source_event_id === undefined ? [] : [event.source_event_id]
    ));
    assertUnique(evaluationCase.headlines.map((headline) =>
      `${headline.event_start_seq}\u0000${headline.event_end_seq}`
    ));
    for (const headline of evaluationCase.headlines) {
      if (
        headline.session_id !== evaluationCase.session_id ||
        headline.event_start_seq > headline.event_end_seq ||
        headline.event_end_seq - headline.event_start_seq >= 200 ||
        headline.event_end_seq > rawEvents.length
      ) {
        throw invalidInput();
      }
      assertUnique(headline.keywords);
    }
    for (const query of evaluationCase.recall_queries) {
      assertUnique(query.expected_event_seqs.map(String));
      if (query.expected_event_seqs.some((sequence) => sequence > rawEvents.length)) {
        throw invalidInput();
      }
    }
    assertUnique(evaluationCase.probes.constraints);
    assertUnique(evaluationCase.probes.decisions);
    assertUnique(evaluationCase.probes.resolved_issues);
    assertUnique(evaluationCase.probes.open_questions);
  }
}

function assertUnique(values: readonly string[]): void {
  if (new Set(values).size !== values.length) throw invalidInput();
}

function evaluateCase(input: EvaluationCase, databasePath: string): EvaluationCaseResult {
  const rawStore = new SqliteRawHistoryStore(databasePath);
  let recallStore: SqliteHistoryRecallStore | undefined;
  try {
    for (const event of [...input.raw_events].sort((left, right) => left.seq - right.seq)) {
      rawStore.ingest({
        session_id: input.session_id,
        role: event.role,
        content: event.content,
        event_type: event.event_type,
        created_at: event.created_at,
        token_count: event.token_count,
        metadata: event.metadata,
        source_event_id: event.source_event_id ?? `evaluation-event:${event.id}`,
      });
    }
    recallStore = new SqliteHistoryRecallStore(databasePath);
    for (const headline of input.headlines) recallStore.createHeadline(headline);

    const orderedEvents = [...input.raw_events].sort((left, right) => left.seq - right.seq);
    const recentEvents = selectRecentTurns(orderedEvents, input.recent_raw_window_turns);

    const d0Started = performance.now();
    const d0Text = renderTranscript(orderedEvents, input.current_input);
    const d0 = measureDimension(
      d0Text,
      estimateTokens(d0Text),
      0,
      input.probes,
      recallFromSequences(input.recall_queries, new Set(orderedEvents.map(({ seq }) => seq))),
      performance.now() - d0Started
    );

    const d1Started = performance.now();
    const d1Text = renderTranscript(recentEvents, input.current_input);
    const d1 = measureDimension(
      d1Text,
      estimateTokens(d1Text),
      reductionRatio(d0.estimated_tokens, estimateTokens(d1Text)),
      input.probes,
      recallFromSequences(input.recall_queries, new Set(recentEvents.map(({ seq }) => seq))),
      performance.now() - d1Started
    );

    const d2Started = performance.now();
    const compiled = assembleContext({
      session_id: input.session_id,
      context_items: input.context_items,
      state_relations: input.state_relations,
      raw_events: input.raw_events,
      current_input: input.current_input,
      recent_raw_window_turns: input.recent_raw_window_turns,
      ...(input.token_budget === undefined ? {} : { token_budget: input.token_budget }),
    });
    const d2Recall = recallWithStore(input, recallStore);
    const d2 = measureDimension(
      compiled.rendered_context,
      compiled.metrics.d2_compiled_tokens,
      reductionRatio(d0.estimated_tokens, compiled.metrics.d2_compiled_tokens),
      input.probes,
      d2Recall,
      performance.now() - d2Started
    );
    return { id: input.id, dimensions: { d0, d1, d2 } };
  } finally {
    recallStore?.close();
    rawStore.close();
  }
}

function selectRecentTurns(events: RawEvent[], turnCount: number): RawEvent[] {
  const userIndexes = events
    .map((event, index) => ({ event, index }))
    .filter(({ event }) => event.role === "user")
    .map(({ index }) => index);
  if (userIndexes.length === 0) return [];
  return events.slice(userIndexes[Math.max(0, userIndexes.length - turnCount)]!);
}

function renderTranscript(events: RawEvent[], currentInput: string): string {
  return [
    ...events.map((event) => `[seq:${event.seq} ${event.role}] ${event.content}`),
    `[current user] ${currentInput}`,
  ].join("\n");
}

function recallFromSequences(
  queries: readonly EvaluationRecallQuery[],
  available: ReadonlySet<number>
): EvaluationRate {
  let matched = 0;
  let total = 0;
  for (const query of queries) {
    for (const sequence of query.expected_event_seqs) {
      total += 1;
      if (available.has(sequence)) matched += 1;
    }
  }
  return rate(matched, total, 1);
}

function recallWithStore(
  input: EvaluationCase,
  recallStore: SqliteHistoryRecallStore
): EvaluationRate {
  let matched = 0;
  let total = 0;
  for (const query of input.recall_queries) {
    const hits = recallStore.recallKeyword({
      session_id: input.session_id,
      query: query.query,
      ...(query.limit === undefined ? {} : { limit: query.limit }),
    });
    const sequences = new Set(hits.flatMap((hit) => hit.events.map(({ seq }) => seq)));
    for (const expected of query.expected_event_seqs) {
      total += 1;
      if (sequences.has(expected)) matched += 1;
    }
  }
  return rate(matched, total, 1);
}

function measureDimension(
  text: string,
  estimatedTokens: number,
  tokenReductionRatio: number,
  probes: EvaluationProbes,
  recallRecovery: EvaluationRate,
  latencyMs: number
): EvaluationDimensionResult {
  const normalized = normalizeEvaluationText(text);
  return {
    estimated_tokens: estimatedTokens,
    token_reduction_ratio: round(tokenReductionRatio),
    constraint_retention: presenceRate(normalized, probes.constraints, 1),
    decision_continuity: presenceRate(normalized, probes.decisions, 1),
    resolved_issue_reopening: presenceRate(normalized, probes.resolved_issues, 0),
    open_question_continuity: presenceRate(normalized, probes.open_questions, 1),
    recall_recovery: recallRecovery,
    latency_ms: round(Math.max(0, latencyMs)),
  };
}

function presenceRate(text: string, probes: readonly string[], emptyRate: 0 | 1): EvaluationRate {
  let matched = 0;
  for (const probe of probes) {
    if (text.includes(normalizeEvaluationText(probe))) matched += 1;
  }
  return rate(matched, probes.length, emptyRate);
}

function rate(matched: number, total: number, emptyRate: 0 | 1): EvaluationRate {
  return { matched, total, rate: total === 0 ? emptyRate : round(matched / total) };
}

function reductionRatio(d0: number, candidate: number): number {
  if (d0 === 0) return 0;
  return round(1 - candidate / d0);
}

function aggregateCases(cases: EvaluationCaseResult[]): EvaluationReport["aggregate"] {
  return {
    d0: aggregateDimension(cases.map(({ dimensions }) => dimensions.d0), undefined),
    d1: aggregateDimension(
      cases.map(({ dimensions }) => dimensions.d1),
      cases.map(({ dimensions }) => dimensions.d0)
    ),
    d2: aggregateDimension(
      cases.map(({ dimensions }) => dimensions.d2),
      cases.map(({ dimensions }) => dimensions.d0)
    ),
  };
}

function aggregateDimension(
  dimensions: EvaluationDimensionResult[],
  baselines: EvaluationDimensionResult[] | undefined
): EvaluationAggregateDimension {
  const totalTokens = dimensions.reduce((sum, value) => sum + value.estimated_tokens, 0);
  const baselineTokens = baselines?.reduce((sum, value) => sum + value.estimated_tokens, 0);
  const latencies = dimensions.map(({ latency_ms }) => latency_ms);
  return {
    estimated_tokens_total: totalTokens,
    token_reduction_ratio:
      baselineTokens === undefined ? 0 : reductionRatio(baselineTokens, totalTokens),
    constraint_retention: aggregateRates(dimensions.map(({ constraint_retention }) => constraint_retention), 1),
    decision_continuity: aggregateRates(dimensions.map(({ decision_continuity }) => decision_continuity), 1),
    resolved_issue_reopening: aggregateRates(dimensions.map(({ resolved_issue_reopening }) => resolved_issue_reopening), 0),
    open_question_continuity: aggregateRates(dimensions.map(({ open_question_continuity }) => open_question_continuity), 1),
    recall_recovery: aggregateRates(dimensions.map(({ recall_recovery }) => recall_recovery), 1),
    latency_ms: {
      total: round(latencies.reduce((sum, value) => sum + value, 0)),
      mean: round(latencies.reduce((sum, value) => sum + value, 0) / dimensions.length),
      maximum: round(Math.max(...latencies)),
    },
  };
}

function aggregateRates(values: EvaluationRate[], emptyRate: 0 | 1): EvaluationRate {
  return rate(
    values.reduce((sum, value) => sum + value.matched, 0),
    values.reduce((sum, value) => sum + value.total, 0),
    emptyRate
  );
}

function evaluateThresholds(
  d2: EvaluationAggregateDimension,
  thresholds: EvaluationThresholds
): EvaluationThresholdFailure[] {
  const failures: EvaluationThresholdFailure[] = [];
  if (d2.token_reduction_ratio < thresholds.minimum_d2_token_reduction_ratio) {
    failures.push("D2_TOKEN_REDUCTION");
  }
  if (d2.constraint_retention.rate < thresholds.minimum_d2_constraint_retention) {
    failures.push("D2_CONSTRAINT_RETENTION");
  }
  if (d2.decision_continuity.rate < thresholds.minimum_d2_decision_continuity) {
    failures.push("D2_DECISION_CONTINUITY");
  }
  if (d2.resolved_issue_reopening.rate > thresholds.maximum_d2_resolved_issue_reopening) {
    failures.push("D2_RESOLVED_ISSUE_REOPENING");
  }
  if (d2.open_question_continuity.rate < thresholds.minimum_d2_open_question_continuity) {
    failures.push("D2_OPEN_QUESTION_CONTINUITY");
  }
  if (d2.recall_recovery.rate < thresholds.minimum_d2_recall_recovery) {
    failures.push("D2_RECALL_RECOVERY");
  }
  if (d2.latency_ms.mean > thresholds.maximum_d2_mean_latency_ms) {
    failures.push("D2_MEAN_LATENCY");
  }
  return failures;
}

function round(value: number): number {
  return Number(value.toFixed(6));
}

function invalidInput(): EvaluationError {
  return new EvaluationError("INVALID_INPUT");
}
