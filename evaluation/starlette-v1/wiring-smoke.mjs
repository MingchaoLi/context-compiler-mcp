import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { isDeepStrictEqual } from "node:util";
import {
  loadCanary,
  loadPilot,
  projectModelInput,
  validateCanary,
  validatePilot,
} from "./validate-pilot.mjs";

const COLLECTION_PLAN_VERSION = "starlette-collection-plan/v1";
const EXPECTED_EVALUATOR_VERSION = 2;
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
const EXPECTED_COLLECTION_PLAN = Object.freeze({
  schema_version: COLLECTION_PLAN_VERSION,
  status: "planned_not_frozen",
  registered_cases: Object.freeze([
    Object.freeze({ case_id: "STR-07", projected_tier: "short", tier_status: "projected_not_a_quota" }),
    Object.freeze({ case_id: "STR-08", projected_tier: "short", tier_status: "audited_not_frozen" }),
    Object.freeze({ case_id: "STR-05", projected_tier: "long", tier_status: "audited_not_frozen" }),
    Object.freeze({ case_id: "STR-06", projected_tier: "medium", tier_status: "projected_not_a_quota" }),
    Object.freeze({ case_id: "STR-01", projected_tier: "long", tier_status: "projected_not_a_quota" }),
    Object.freeze({ case_id: "STR-04", projected_tier: "long", tier_status: "audited_not_frozen" }),
  ]),
  smoke_case_ids: Object.freeze(["STR-08", "STR-05", "STR-04"]),
  selection_policy: Object.freeze({
    allow_result_based_replacement: false,
    allow_transparent_tier_reclassification: true,
    tier_distribution_is_quota: false,
  }),
});

export class WiringSmokeError extends Error {
  constructor(message) {
    super(message);
    this.name = "WiringSmokeError";
  }
}

function fail(message) {
  throw new WiringSmokeError(message);
}

function clone(value) {
  return structuredClone(value);
}

function canonicalTimestamp(value) {
  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.valueOf())) fail(`invalid timestamp: ${value}`);
  return timestamp.toISOString();
}

function estimateTokens(value) {
  if (value.length === 0) return 0;
  return Math.max(1, Math.ceil(value.length / 4));
}

async function readJson(path) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    fail(`unable to read JSON: ${path}`);
  }
}

export function validateCollectionPlan(value) {
  if (!isDeepStrictEqual(value, EXPECTED_COLLECTION_PLAN)) {
    fail("collection plan differs from the preregistered six-case contract");
  }
  return clone(value);
}

function rawEventFromTurn(turn, sessionId, sequence) {
  const content = JSON.stringify({
    id: turn.id,
    role: turn.role,
    event_type: turn.event_type,
    occurred_at: turn.occurred_at,
    actor: turn.actor,
    summary: turn.summary,
  });
  return {
    id: turn.id,
    session_id: sessionId,
    seq: sequence,
    role: turn.role,
    content,
    event_type: turn.event_type,
    created_at: canonicalTimestamp(turn.occurred_at),
    token_count: estimateTokens(content),
    metadata: {},
    source_event_id: `starlette-v1:${turn.id}`,
  };
}

function normalizeOracleState(state) {
  return {
    items: state.items.map((item) => ({
      ...clone(item),
      created_at: canonicalTimestamp(item.created_at),
      updated_at: canonicalTimestamp(item.updated_at),
    })),
    relations: state.relations.map((relation) => ({
      ...clone(relation),
      created_at: canonicalTimestamp(relation.created_at),
    })),
  };
}

function buildEvaluationCase(bundle, task) {
  const projection = projectModelInput(bundle, task.id);
  const oracle = bundle.oracleState.states.find((candidate) => candidate.slice_id === task.id);
  if (!oracle) fail(`missing Oracle-State for ${task.id}`);
  const normalizedOracle = normalizeOracleState(oracle);
  return {
    id: task.id,
    session_id: task.segment_id,
    raw_events: projection.history_turns.map((turn, index) =>
      rawEventFromTurn(turn, task.segment_id, index + 1)
    ),
    context_items: normalizedOracle.items,
    state_relations: normalizedOracle.relations,
    current_input: projection.current_task,
    recent_raw_window_turns: task.recent_raw_window_turns,
    headlines: [],
    recall_queries: [],
    probes: clone(EMPTY_PROBES),
  };
}

async function loadAcceptedSmokeCases(root) {
  await Promise.all([validatePilot(root), validateCanary(root)]);
  const [pilot, canary] = await Promise.all([loadPilot(root), loadCanary(root)]);
  const byId = new Map(pilot.cases.map(({ caseId, bundle }) => [caseId, bundle]));
  byId.set(canary.case.caseId, canary.case.bundle);
  return byId;
}

async function assembleWiringSmoke(root) {
  const targetRoot = resolve(root);
  const plan = validateCollectionPlan(await readJson(join(targetRoot, "collection-plan.json")));
  const bundles = await loadAcceptedSmokeCases(targetRoot);
  const cases = [];
  for (const caseId of plan.smoke_case_ids) {
    const bundle = bundles.get(caseId);
    if (!bundle) fail(`missing accepted smoke case: ${caseId}`);
    for (const task of bundle.tasks.tasks) cases.push(buildEvaluationCase(bundle, task));
  }
  const suite = {
    version: EXPECTED_EVALUATOR_VERSION,
    cases,
    thresholds: clone(PARSER_ONLY_THRESHOLDS),
  };
  return { plan, suite };
}

export async function buildWiringSmoke(root) {
  return assembleWiringSmoke(root);
}
