import { isDeepStrictEqual } from "node:util";
import { parseEvaluationSuiteV2 } from "../../../src/evaluation.js";
// Fixture utilities intentionally remain outside the publishable src/ package.
// @ts-expect-error JavaScript fixture utilities have no declaration files.
import { projectModelInput } from "../validate-pilot.mjs";
// @ts-expect-error JavaScript fixture utilities have no declaration files.
import { loadPromotionBundles } from "../validate-promotion.mjs";
// @ts-expect-error JavaScript fixture utilities have no declaration files.
import { loadProtocolCanary, validateProtocolCanary } from "./validate-protocol-canary.mjs";

const EXPECTED_SELECTED_SLICE_COUNT = 12;
const EXPECTED_PROJECTED_HISTORY_TURN_COUNT = 101;
const EXPECTED_CONTEXT_PROBE_COUNT = 8;

const PARSER_ONLY_THRESHOLDS = Object.freeze({
  minimum_d2_token_reduction_ratio: 0,
  minimum_d2_constraint_retention: 0,
  minimum_d2_decision_continuity: 0,
  maximum_d2_resolved_issue_reopening: 0,
  minimum_d2_open_question_continuity: 0,
  minimum_d2_recall_recovery: 0,
  maximum_d2_mean_latency_ms: 0,
});

export class ProtocolPreflightError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProtocolPreflightError";
  }
}

function fail(message: string): never {
  throw new ProtocolPreflightError(message);
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

function evaluatorProbe(probe: any): any {
  return {
    id: probe.id,
    text: probe.text,
    provenance: [
      ...probe.raw_event_ids.map((id: string) => ({ kind: "raw_event", id })),
      ...probe.context_item_ids.map((id: string) => ({ kind: "context_item", id })),
    ],
  };
}

function buildEvaluationCase(bundle: any, task: any, protocolSlice: any): any {
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
    probes: {
      constraints: protocolSlice.context_probes.constraints.map(evaluatorProbe),
      decisions: protocolSlice.context_probes.decisions.map(evaluatorProbe),
      resolved_issues: [],
      open_questions: protocolSlice.context_probes.open_questions.map(evaluatorProbe),
    },
  };
}

export async function buildProtocolCanarySuite(root: string): Promise<any> {
  await validateProtocolCanary(root);
  const [{ protocol }, bundles] = await Promise.all([
    loadProtocolCanary(root),
    loadPromotionBundles(root),
  ]);
  const cases = protocol.selected_slices.map((selection: any) => {
    const caseId = selection.slice_id.split("/")[0];
    const bundle = bundles.get(caseId);
    if (!bundle) fail(`missing promoted bundle ${caseId}`);
    const task = bundle.tasks.tasks.find((candidate: any) => candidate.id === selection.slice_id);
    if (!task) fail(`missing task ${selection.slice_id}`);
    return buildEvaluationCase(bundle, task, selection);
  });
  if (cases.length !== EXPECTED_SELECTED_SLICE_COUNT) fail("selected slice count changed");
  const projectedHistoryTurnCount = cases.reduce((sum: number, entry: any) => sum + entry.raw_events.length, 0);
  if (projectedHistoryTurnCount !== EXPECTED_PROJECTED_HISTORY_TURN_COUNT) fail("projected history turn count changed");
  const contextProbeCount = cases.reduce(
    (sum: number, entry: any) => sum + entry.probes.constraints.length + entry.probes.decisions.length + entry.probes.open_questions.length,
    0,
  );
  if (contextProbeCount !== EXPECTED_CONTEXT_PROBE_COUNT) fail("context Probe count changed");
  const suite = {
    version: 2,
    cases,
    thresholds: structuredClone(PARSER_ONLY_THRESHOLDS),
  };
  const parsed = parseEvaluationSuiteV2(suite);
  if (!isDeepStrictEqual(parsed, suite)) fail("evaluator v2 parser changed protocol canary input");
  return { suite, projected_history_turn_count: projectedHistoryTurnCount, context_probe_count: contextProbeCount };
}

export async function validateProtocolPreflight(root: string): Promise<Record<string, string | number | boolean>> {
  const result = await buildProtocolCanarySuite(root);
  return {
    schema_version: "starlette-protocol-preflight/v1",
    status: "protocol_canary_parser_compatible",
    evaluator_case_count: result.suite.cases.length,
    projected_history_turn_count: result.projected_history_turn_count,
    context_probe_count: result.context_probe_count,
    resolved_context_probe_count: 0,
    evaluation_run_count: 0,
    model_call_count: 0,
    effect_metrics_generated: false,
  };
}
