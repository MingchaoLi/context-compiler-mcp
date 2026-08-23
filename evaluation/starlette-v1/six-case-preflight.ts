import { isDeepStrictEqual } from "node:util";
import { parseEvaluationSuiteV2 } from "../../src/evaluation.js";
// Fixture utilities intentionally remain outside the publishable src/ package.
// @ts-expect-error JavaScript fixture utilities have no declaration files.
import { projectModelInput } from "./validate-pilot.mjs";
// @ts-expect-error JavaScript fixture utilities have no declaration files.
import { loadPromotionBundles, validatePromotion } from "./validate-promotion.mjs";
// @ts-expect-error JavaScript fixture utilities have no declaration files.
import { loadStr06Checkpoint, validateStr06Checkpoint } from "./validate-str06-checkpoint.mjs";
// @ts-expect-error JavaScript fixture utilities have no declaration files.
import { loadStr07Checkpoint, validateStr07Checkpoint } from "./validate-str07-checkpoint.mjs";
// @ts-expect-error JavaScript fixture utilities have no declaration files.
import { loadStr01Checkpoint, validateStr01Checkpoint } from "./validate-str01-checkpoint.mjs";

const CASE_ORDER = Object.freeze(["STR-07", "STR-08", "STR-05", "STR-06", "STR-01", "STR-04"]);
const EXPECTED_SLICE_COUNT = 75;
const EXPECTED_PROJECTED_HISTORY_TURN_COUNT = 588;

const EMPTY_PROBES = Object.freeze({
  constraints: Object.freeze([]),
  decisions: Object.freeze([]),
  resolved_issues: Object.freeze([]),
  open_questions: Object.freeze([]),
});

const PARSER_ONLY_THRESHOLDS = Object.freeze({
  minimum_d2_token_reduction_ratio: 0,
  minimum_d2_constraint_retention: 0,
  minimum_d2_decision_continuity: 0,
  maximum_d2_resolved_issue_reopening: 0,
  minimum_d2_open_question_continuity: 0,
  minimum_d2_recall_recovery: 0,
  maximum_d2_mean_latency_ms: 0,
});

export class SixCasePreflightError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SixCasePreflightError";
  }
}

function fail(message: string): never {
  throw new SixCasePreflightError(message);
}

function canonicalTimestamp(value: string): string {
  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.valueOf())) fail(`invalid timestamp: ${value}`);
  return timestamp.toISOString();
}

function estimateTokens(value: string): number {
  return value.length === 0 ? 0 : Math.max(1, Math.ceil(value.length / 4));
}

function normalizeOracleState(state: any): { items: any[]; relations: any[] } {
  return {
    items: state.items.map((item: any) => ({
      ...structuredClone(item),
      created_at: canonicalTimestamp(item.created_at),
      updated_at: canonicalTimestamp(item.updated_at),
    })),
    relations: state.relations.map((relation: any) => ({
      ...structuredClone(relation),
      created_at: canonicalTimestamp(relation.created_at),
    })),
  };
}

function buildEvaluationCase(bundle: any, task: any): any {
  const projection = projectModelInput(bundle, task.id);
  const oracle = bundle.oracleState.states.find((candidate: any) => candidate.slice_id === task.id);
  if (!oracle) fail(`missing Oracle-State for ${task.id}`);
  const normalizedOracle = normalizeOracleState(oracle);
  return {
    id: task.id,
    session_id: task.segment_id,
    raw_events: projection.history_turns.map((turn: any, index: number) => {
      const content = JSON.stringify(turn);
      return {
        id: turn.id,
        session_id: task.segment_id,
        seq: index + 1,
        role: turn.role,
        content,
        event_type: turn.event_type,
        created_at: canonicalTimestamp(turn.occurred_at),
        token_count: estimateTokens(content),
        metadata: {},
        source_event_id: `starlette-v1:${turn.id}`,
      };
    }),
    context_items: normalizedOracle.items,
    state_relations: normalizedOracle.relations,
    current_input: projection.current_task,
    recent_raw_window_turns: task.recent_raw_window_turns,
    headlines: [],
    recall_queries: [],
    probes: structuredClone(EMPTY_PROBES),
  };
}

function validateIdentifiers(cases: any[]): void {
  const sliceIds = cases.map(({ id }) => id);
  if (new Set(sliceIds).size !== sliceIds.length) fail("slice ids must be globally unique");
  for (const entry of cases) {
    const namespace = entry.id.split("/")[0];
    if (entry.session_id !== namespace) fail(`${entry.id}: session id must match case namespace`);
    const ids = new Set<string>();
    const sourceIds = new Set<string>();
    entry.raw_events.forEach((event: any, index: number) => {
      if (event.session_id !== entry.session_id) fail(`${entry.id}: raw event session changed`);
      if (event.seq !== index + 1) fail(`${entry.id}: raw event sequence is not contiguous`);
      if (!event.id.startsWith(`${namespace}/`)) fail(`${entry.id}: raw event namespace collision`);
      if (ids.has(event.id) || sourceIds.has(event.source_event_id)) fail(`${entry.id}: duplicate raw event identity`);
      ids.add(event.id);
      sourceIds.add(event.source_event_id);
    });
  }
}

function assembleSixCaseSuite(available: Map<string, any>): any {
  const cases: any[] = [];
  for (const caseId of CASE_ORDER) {
    const bundle = available.get(caseId);
    if (!bundle) fail(`missing verified bundle: ${caseId}`);
    for (const task of bundle.tasks.tasks) cases.push(buildEvaluationCase(bundle, task));
  }
  if (cases.length !== EXPECTED_SLICE_COUNT) fail(`expected ${EXPECTED_SLICE_COUNT} slices; got ${cases.length}`);
  validateIdentifiers(cases);
  const actualOrder = [...new Set(cases.map(({ id }) => id.split("/")[0]))];
  if (!isDeepStrictEqual(actualOrder, CASE_ORDER)) fail("six-case order differs from preregistration");

  const suite = {
    version: 2,
    cases,
    thresholds: structuredClone(PARSER_ONLY_THRESHOLDS),
  };
  const projectedHistoryTurnCount = cases.reduce((sum, entry) => sum + entry.raw_events.length, 0);
  if (projectedHistoryTurnCount !== EXPECTED_PROJECTED_HISTORY_TURN_COUNT) {
    fail(`expected ${EXPECTED_PROJECTED_HISTORY_TURN_COUNT} projected turns; got ${projectedHistoryTurnCount}`);
  }
  const parsed = parseEvaluationSuiteV2(suite);
  if (!isDeepStrictEqual(parsed, suite)) fail("evaluator v2 parser changed six-case preflight input");
  return { suite, case_order: [...CASE_ORDER], projected_history_turn_count: projectedHistoryTurnCount };
}

export async function buildSixCasePreflight(root: string): Promise<any> {
  await Promise.all([
    validatePromotion(root),
    validateStr06Checkpoint(root),
    validateStr07Checkpoint(root),
    validateStr01Checkpoint(root),
  ]);
  const [promoted, str06, str07, str01] = await Promise.all([
    loadPromotionBundles(root),
    loadStr06Checkpoint(root),
    loadStr07Checkpoint(root),
    loadStr01Checkpoint(root),
  ]);
  const available = new Map<string, any>(promoted);
  available.set("STR-06", str06.bundle);
  available.set("STR-07", str07.bundle);
  available.set("STR-01", str01.bundle);

  return assembleSixCaseSuite(available);
}

export async function buildSixCasePromotionSuite(root: string): Promise<any> {
  await validatePromotion(root);
  const promoted = await loadPromotionBundles(root);
  if (!isDeepStrictEqual([...promoted.keys()], CASE_ORDER)) fail("promotion bundle order differs from canonical order");
  return assembleSixCaseSuite(promoted);
}

export async function validateSixCasePreflight(root: string): Promise<Record<string, string | number | boolean>> {
  const result = await buildSixCasePreflight(root);
  return {
    schema_version: "starlette-six-case-preflight/v1",
    status: "mixed_verified_inputs_compatible",
    canonical_case_count: result.case_order.length,
    evaluator_case_count: result.suite.cases.length,
    projected_history_turn_count: result.projected_history_turn_count,
    evaluation_run_count: 0,
    model_call_count: 0,
    effect_metrics_generated: false,
  };
}
