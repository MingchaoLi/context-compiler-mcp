#!/usr/bin/env node

import { createHash } from "node:crypto";
import { lstat, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";
import { validatePromotion } from "../validate-promotion.mjs";
import {
  CASE_ORDER,
  SELECTED_SLICES,
  TASK_DEPENDENCY_FACTS,
  deriveEligibilityInventory,
} from "./derive-eligibility.mjs";

const STATUS = "protocol_canary_not_frozen";
const SOURCE_IDENTITY = Object.freeze({
  accepted_builder_candidate: "4b974538d76d0e0d8a5ac17c5662533b714ef00e",
  promotion_hashes_path: "promotion-hashes.json",
  promotion_hashes_sha256: "c216719f1745601786ad53f50bbaed6c5e7b0a8e8d9d6612cfb79b9c103ff51b",
  collection_path: "promotion/collection.json",
  collection_sha256: "ae6ae7446e5e102a12e45124f4ab2658ba40974ec7c4251a1d39f178fd91cfeb",
  eligibility_inventory_path: "protocol-canary/eligibility-inventory.json",
  eligibility_inventory_sha256: "1ddc5961a12d510caf97274710ac783d7631ea27b2fbf335f870471064a27d65",
});
const FILE_CONTRACT = Object.freeze([
  Object.freeze({ path: "protocol-canary/derive-eligibility.mjs", sha256: "f4a1581624906f022ffa85cb35b339e3180e396aa8255668554af5443f5759a3" }),
  Object.freeze({ path: "protocol-canary/eligibility-inventory.json", sha256: "1ddc5961a12d510caf97274710ac783d7631ea27b2fbf335f870471064a27d65" }),
  Object.freeze({ path: "protocol-canary/protocol.json", sha256: "21fc57bb02a67868965475dab82347fb5abde0fb2eb2a0c8fd3b71f24c58c3f0" }),
]);
const METRICS = Object.freeze(["constraints", "decisions", "resolved_issues", "open_questions"]);
const METRIC_FACT_CATEGORY = Object.freeze({ constraints: "constraint", decisions: "decision", open_questions: "open_question" });
const REASON_CODES = new Set([
  "no_shared_lexical_anchor",
  "shared_anchor_too_generic",
  "answer_only_category",
  "representation_punctuation_mismatch",
]);
const RETENTION_ROLES = new Set([
  "historical_dependency",
  "recent_or_current_correctness",
  "current_correctness_control",
]);
const FORBIDDEN_CONTROL = /[\p{Cf}\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u;

export class ProtocolCanaryValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "ProtocolCanaryValidationError";
  }
}

function fail(path, message) {
  throw new ProtocolCanaryValidationError(`${path}: ${message}`);
}

function object(value, path) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) fail(path, "expected object");
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) fail(path, "expected plain object");
  return value;
}

function exact(value, keys, path) {
  const target = object(value, path);
  const actual = Object.keys(target).sort();
  const expected = [...keys].sort();
  if (!isDeepStrictEqual(actual, expected)) fail(path, `expected keys ${expected.join(",")}; got ${actual.join(",")}`);
  return target;
}

function array(value, path) {
  if (!Array.isArray(value)) fail(path, "expected array");
  return value;
}

function string(value, path) {
  if (typeof value !== "string" || value.length === 0 || FORBIDDEN_CONTROL.test(value)) fail(path, "expected non-empty clean string");
  return value;
}

function bool(value, path) {
  if (typeof value !== "boolean") fail(path, "expected boolean");
  return value;
}

function integer(value, path, minimum = 0) {
  if (!Number.isSafeInteger(value) || value < minimum) fail(path, `expected integer >= ${minimum}`);
  return value;
}

function sha256(value, path) {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value)) fail(path, "expected SHA-256 hex");
  return value;
}

function uniqueStrings(value, path) {
  const result = array(value, path).map((entry, index) => string(entry, `${path}[${index}]`));
  if (new Set(result).size !== result.length) fail(path, "duplicate value");
  return result;
}

function exactArray(value, expected, path) {
  const result = array(value, path);
  if (!isDeepStrictEqual(result, expected)) fail(path, `expected ${JSON.stringify(expected)}`);
  return result;
}

function assertCleanStrings(value, path) {
  if (typeof value === "string") {
    string(value, path);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertCleanStrings(entry, `${path}[${index}]`));
    return;
  }
  if (value !== null && typeof value === "object") {
    for (const [key, entry] of Object.entries(value)) {
      string(key, `${path}.<key>`);
      assertCleanStrings(entry, `${path}.${key}`);
    }
  }
}

async function readJson(path) {
  try {
    const metadata = await lstat(path);
    if (!metadata.isFile() || metadata.isSymbolicLink()) fail(path, "expected regular file");
    const parsed = JSON.parse(await readFile(path, "utf8"));
    assertCleanStrings(parsed, path);
    return parsed;
  } catch (error) {
    if (error instanceof ProtocolCanaryValidationError) throw error;
    fail(path, error instanceof Error ? error.message : "unable to read JSON");
  }
}

async function hashFile(path) {
  const metadata = await lstat(path);
  if (!metadata.isFile() || metadata.isSymbolicLink()) fail(path, "expected regular file");
  return createHash("sha256").update(await readFile(path)).digest("hex");
}

function normalizeExact(value) {
  return value.normalize("NFKC").toLocaleLowerCase("en-US").replace(/\s+/gu, " ").trim();
}

function exactContains(haystack, needle) {
  const normalized = normalizeExact(needle);
  return normalized.length > 0 && normalizeExact(haystack).includes(normalized);
}

function validateSourceIdentity(value, path) {
  const target = exact(value, Object.keys(SOURCE_IDENTITY), path);
  if (!isDeepStrictEqual(target, SOURCE_IDENTITY)) fail(path, "canonical source identity changed");
  return target;
}

function factMaps(bundle) {
  return {
    facts: new Map(bundle.factGold.facts.map((fact) => [fact.id, fact])),
    slices: new Map(bundle.factGold.slices.map((slice) => [slice.slice_id, slice])),
    tasks: new Map(bundle.tasks.tasks.map((task) => [task.id, task])),
    events: new Map(bundle.events.events.map((event) => [event.id, event])),
    states: new Map(bundle.oracleState.states.map((state) => [state.slice_id, state])),
  };
}

function validateProbe(probe, path, metric, context) {
  const target = exact(probe, [
    "id", "text", "fact_ids", "raw_event_ids", "context_item_ids",
    "code_identifier_exception", "interpretation",
  ], path);
  const id = string(target.id, `${path}.id`);
  const text = string(target.text, `${path}.text`);
  const factIds = uniqueStrings(target.fact_ids, `${path}.fact_ids`);
  const rawEventIds = uniqueStrings(target.raw_event_ids, `${path}.raw_event_ids`);
  const contextItemIds = uniqueStrings(target.context_item_ids, `${path}.context_item_ids`);
  const codeIdentifierException = bool(target.code_identifier_exception, `${path}.code_identifier_exception`);
  string(target.interpretation, `${path}.interpretation`);
  if (factIds.length === 0 || rawEventIds.length === 0 || contextItemIds.length === 0) fail(path, "probe needs fact, raw, and context provenance");
  if (exactContains(context.task.current_task, text)) fail(`${path}.text`, "anchor repeats current task");
  const latestEvent = context.maps.events.get(context.task.cutoff_event_id);
  if (exactContains(latestEvent.summary, text)) fail(`${path}.text`, "anchor repeats latest event");
  if (metric === "resolved_issues") fail(path, "resolved probes are diagnostic-not-evaluable in this protocol");
  const expectedCategory = METRIC_FACT_CATEGORY[metric];
  const factProvenance = new Set();
  for (const factId of factIds) {
    const fact = context.maps.facts.get(factId);
    if (!fact || fact.category !== expectedCategory) fail(`${path}.fact_ids`, `fact ${factId} does not map to ${metric}`);
    if (!context.inventorySlice.technically_mature_fact_ids.includes(factId)) fail(`${path}.fact_ids`, `${factId} is not technically mature`);
    if (!context.selection.task_dependency_fact_ids.includes(factId)) fail(`${path}.fact_ids`, `${factId} is not a preregistered task dependency`);
    fact.provenance_event_ids.forEach((eventId) => factProvenance.add(eventId));
  }
  const firstRecentIndex = context.task.available_event_ids.length - context.task.recent_raw_window_turns;
  const outsideRecent = new Set(context.task.available_event_ids.slice(0, firstRecentIndex));
  const stateItems = new Map(context.state.items.map((item) => [item.id, item]));
  for (const eventId of rawEventIds) {
    const event = context.maps.events.get(eventId);
    if (!event || !outsideRecent.has(eventId)) fail(`${path}.raw_event_ids`, `${eventId} is not an available pre-D1 event`);
    if (!factProvenance.has(eventId)) fail(`${path}.raw_event_ids`, `${eventId} is not provenance of the mapped facts`);
    if (!exactContains(event.summary, text)) fail(`${path}.text`, `not found in raw event ${eventId}`);
  }
  for (const itemId of contextItemIds) {
    const item = stateItems.get(itemId);
    if (!item) fail(`${path}.context_item_ids`, `${itemId} is not in the slice Oracle state`);
    if (!exactContains(item.content, text)) fail(`${path}.text`, `not found in context item ${itemId}`);
    if (!Array.isArray(item.source_refs) || item.source_refs.length === 0 || item.source_refs.some((ref) => !context.task.available_event_ids.includes(ref))) {
      fail(`${path}.context_item_ids`, `${itemId} has untraceable source refs`);
    }
    if (!item.source_refs.some((ref) => factProvenance.has(ref))) fail(`${path}.context_item_ids`, `${itemId} is not traceable to the mapped facts`);
  }
  const normalized = normalizeExact(text);
  const words = normalized.split(/\s+/u);
  if (codeIdentifierException) {
    if (words.length !== 1 || !/^[A-Za-z_][A-Za-z0-9_.]*$/.test(text)) fail(`${path}.code_identifier_exception`, "invalid code identifier exception");
  } else if (words.length < 2 || normalized.length < 12) {
    fail(`${path}.text`, "anchor is too short or generic");
  }
  return { id, factIds };
}

function validateAnswerItem(item, path, kind, context) {
  const textKey = kind === "required" ? "criterion" : "claim";
  const target = exact(item, ["id", "fact_ids", textKey, "retention_role", "provenance_event_ids"], path);
  const id = string(target.id, `${path}.id`);
  const factIds = uniqueStrings(target.fact_ids, `${path}.fact_ids`);
  const provenance = uniqueStrings(target.provenance_event_ids, `${path}.provenance_event_ids`);
  string(target[textKey], `${path}.${textKey}`);
  if (!RETENTION_ROLES.has(target.retention_role)) fail(`${path}.retention_role`, "unsupported retention role");
  if (factIds.length === 0 || provenance.length === 0) fail(path, "answer item needs facts and provenance");
  const activeFacts = new Set(context.goldSlice.fact_ids);
  const allowedProvenance = new Set();
  for (const factId of factIds) {
    const fact = context.maps.facts.get(factId);
    if (!fact || !activeFacts.has(factId)) fail(`${path}.fact_ids`, `${factId} is not active at this slice`);
    fact.provenance_event_ids.forEach((eventId) => allowedProvenance.add(eventId));
  }
  for (const eventId of provenance) {
    if (!context.task.available_event_ids.includes(eventId)) fail(`${path}.provenance_event_ids`, `${eventId} is future or unavailable`);
    if (!allowedProvenance.has(eventId)) fail(`${path}.provenance_event_ids`, `${eventId} is not provenance of the referenced facts`);
  }
  const mature = new Set(context.inventorySlice.technically_mature_fact_ids);
  if (target.retention_role === "historical_dependency" && factIds.some((factId) => !mature.has(factId))) {
    fail(`${path}.retention_role`, "historical dependency references a recent/current fact");
  }
  if (target.retention_role !== "historical_dependency" && factIds.every((factId) => mature.has(factId))) {
    fail(`${path}.retention_role`, "recent/current control contains only mature facts");
  }
  return id;
}

function validateSelectedSlice(selection, path, context) {
  const target = exact(selection, [
    "slice_id", "canary_role", "task_dependency_fact_ids", "context_probes",
    "not_exactly_scorable", "answer_checklist",
  ], path);
  if (target.slice_id !== context.expectedSliceId) fail(`${path}.slice_id`, "selected slice order changed");
  if (target.canary_role !== context.inventorySlice.canary_role) fail(`${path}.canary_role`, "canary role changed");
  exactArray(target.task_dependency_fact_ids, TASK_DEPENDENCY_FACTS[target.slice_id], `${path}.task_dependency_fact_ids`);

  const probeGroups = exact(target.context_probes, METRICS, `${path}.context_probes`);
  const mappedFacts = [];
  const probeIds = [];
  for (const metric of METRICS) {
    const probes = array(probeGroups[metric], `${path}.context_probes.${metric}`);
    if (metric === "resolved_issues" && probes.length !== 0) fail(`${path}.context_probes.resolved_issues`, "must remain empty");
    for (const [index, probe] of probes.entries()) {
      const result = validateProbe(probe, `${path}.context_probes.${metric}[${index}]`, metric, { ...context, selection: target });
      probeIds.push(result.id);
      mappedFacts.push(...result.factIds);
    }
  }
  if (new Set(probeIds).size !== probeIds.length) fail(`${path}.context_probes`, "duplicate probe id");
  if (new Set(mappedFacts).size !== mappedFacts.length) fail(`${path}.context_probes`, "dependency fact mapped more than once");

  const notExactlyScorable = array(target.not_exactly_scorable, `${path}.not_exactly_scorable`);
  const nonScorableFacts = [];
  for (const [index, entry] of notExactlyScorable.entries()) {
    const entryPath = `${path}.not_exactly_scorable[${index}]`;
    const item = exact(entry, ["fact_id", "reason_code", "explanation"], entryPath);
    const factId = string(item.fact_id, `${entryPath}.fact_id`);
    if (!REASON_CODES.has(item.reason_code)) fail(`${entryPath}.reason_code`, "unsupported reason code");
    string(item.explanation, `${entryPath}.explanation`);
    nonScorableFacts.push(factId);
  }
  if (new Set(nonScorableFacts).size !== nonScorableFacts.length) fail(`${path}.not_exactly_scorable`, "duplicate fact");
  const coveredDependencies = [...mappedFacts, ...nonScorableFacts];
  if (!isDeepStrictEqual([...coveredDependencies].sort(), [...target.task_dependency_fact_ids].sort())) {
    fail(path, "task dependency facts must be exactly covered by Probe or not_exactly_scorable");
  }

  const checklist = exact(target.answer_checklist, ["required_items", "forbidden_items", "critical_miss_ids"], `${path}.answer_checklist`);
  const required = array(checklist.required_items, `${path}.answer_checklist.required_items`);
  const forbidden = array(checklist.forbidden_items, `${path}.answer_checklist.forbidden_items`);
  if (required.length === 0) fail(`${path}.answer_checklist.required_items`, "at least one required item is needed");
  const answerIds = [];
  required.forEach((item, index) => answerIds.push(validateAnswerItem(item, `${path}.answer_checklist.required_items[${index}]`, "required", context)));
  forbidden.forEach((item, index) => answerIds.push(validateAnswerItem(item, `${path}.answer_checklist.forbidden_items[${index}]`, "forbidden", context)));
  if (new Set(answerIds).size !== answerIds.length) fail(`${path}.answer_checklist`, "duplicate answer item id");
  const criticalIds = uniqueStrings(checklist.critical_miss_ids, `${path}.answer_checklist.critical_miss_ids`);
  if (criticalIds.length === 0 || criticalIds.some((id) => !answerIds.includes(id))) fail(`${path}.answer_checklist.critical_miss_ids`, "dangling or empty critical reference");
  return {
    probeIds,
    requiredCount: required.length,
    forbiddenCount: forbidden.length,
    notExactlyScorableCount: nonScorableFacts.length,
  };
}

function validatePolicies(protocol, path) {
  const contextPolicy = exact(protocol.context_metric_policy, [
    "exact_probe_interpretation", "resolved_issues_status", "overall_passed_status",
    "evidence_outcome_rejected_default_surface", "not_exactly_scorable_counts_as_context_miss",
  ], `${path}.context_metric_policy`);
  if (
    contextPolicy.exact_probe_interpretation !== "lexical_carry_through_only" ||
    contextPolicy.resolved_issues_status !== "not_evaluable_diagnostic_only" ||
    contextPolicy.overall_passed_status !== "non_decision_diagnostic" ||
    contextPolicy.evidence_outcome_rejected_default_surface !== "answer_checklist" ||
    bool(contextPolicy.not_exactly_scorable_counts_as_context_miss, `${path}.context_metric_policy.not_exactly_scorable_counts_as_context_miss`) !== false
  ) fail(`${path}.context_metric_policy`, "context interpretation changed");

  const judging = exact(protocol.human_judging, [
    "condition_labels_hidden", "independent_reviewer_count", "allowed_item_judgments",
    "required_item_rule", "forbidden_item_rule", "critical_miss_rule", "disagreement_rule",
    "rubric_change_after_answer_allowed", "model_judge_authorized",
  ], `${path}.human_judging`);
  if (
    bool(judging.condition_labels_hidden, `${path}.human_judging.condition_labels_hidden`) !== true ||
    integer(judging.independent_reviewer_count, `${path}.human_judging.independent_reviewer_count`, 2) !== 2 ||
    !isDeepStrictEqual(judging.allowed_item_judgments, ["met", "missed", "forbidden_asserted", "not_asserted", "uncertain"]) ||
    bool(judging.rubric_change_after_answer_allowed, `${path}.human_judging.rubric_change_after_answer_allowed`) !== false ||
    bool(judging.model_judge_authorized, `${path}.human_judging.model_judge_authorized`) !== false
  ) fail(`${path}.human_judging`, "blinded human judging contract changed");
  for (const key of ["required_item_rule", "forbidden_item_rule", "critical_miss_rule", "disagreement_rule"]) string(judging[key], `${path}.human_judging.${key}`);

  const reporting = exact(protocol.reporting_policy, [
    "raw_item_results_required", "case_and_tier_results_descriptive_only", "weighted_composite_score_authorized",
    "pooled_independence_claim_authorized", "medium_tier_status", "tier_balanced_claim_authorized",
  ], `${path}.reporting_policy`);
  if (
    bool(reporting.raw_item_results_required, `${path}.reporting_policy.raw_item_results_required`) !== true ||
    bool(reporting.case_and_tier_results_descriptive_only, `${path}.reporting_policy.case_and_tier_results_descriptive_only`) !== true ||
    bool(reporting.weighted_composite_score_authorized, `${path}.reporting_policy.weighted_composite_score_authorized`) !== false ||
    bool(reporting.pooled_independence_claim_authorized, `${path}.reporting_policy.pooled_independence_claim_authorized`) !== false ||
    reporting.medium_tier_status !== "not_represented_not_evaluable" ||
    bool(reporting.tier_balanced_claim_authorized, `${path}.reporting_policy.tier_balanced_claim_authorized`) !== false
  ) fail(`${path}.reporting_policy`, "reporting limitation changed");

  const authorization = exact(protocol.authorization, [
    "formal_freeze_authorized", "evaluation_ready", "evaluator_run_authorized", "model_run_authorized",
    "evaluation_run_count", "model_call_count", "effect_metrics_generated",
  ], `${path}.authorization`);
  for (const key of ["formal_freeze_authorized", "evaluation_ready", "evaluator_run_authorized", "model_run_authorized", "effect_metrics_generated"]) {
    if (bool(authorization[key], `${path}.authorization.${key}`) !== false) fail(`${path}.authorization.${key}`, "must remain false");
  }
  if (integer(authorization.evaluation_run_count, `${path}.authorization.evaluation_run_count`) !== 0 || integer(authorization.model_call_count, `${path}.authorization.model_call_count`) !== 0) {
    fail(`${path}.authorization`, "run counts must remain zero");
  }
}

function validateHashManifest(value, path) {
  const target = exact(value, ["schema_version", "status", "algorithm", "source_identity", "files"], path);
  if (target.schema_version !== "starlette-protocol-canary-hashes/v1" || target.status !== STATUS || target.algorithm !== "sha256") fail(path, "hash manifest identity changed");
  const source = exact(target.source_identity, ["accepted_builder_candidate", "promotion_hashes_path", "promotion_hashes_sha256"], `${path}.source_identity`);
  const expectedSource = {
    accepted_builder_candidate: SOURCE_IDENTITY.accepted_builder_candidate,
    promotion_hashes_path: SOURCE_IDENTITY.promotion_hashes_path,
    promotion_hashes_sha256: SOURCE_IDENTITY.promotion_hashes_sha256,
  };
  if (!isDeepStrictEqual(source, expectedSource)) fail(`${path}.source_identity`, "hash source identity changed");
  const files = array(target.files, `${path}.files`).map((entry, index) => {
    const item = exact(entry, ["path", "sha256"], `${path}.files[${index}]`);
    return { path: string(item.path, `${path}.files[${index}].path`), sha256: sha256(item.sha256, `${path}.files[${index}].sha256`) };
  });
  if (!isDeepStrictEqual(files, FILE_CONTRACT)) fail(`${path}.files`, "fixed protocol file contract changed");
}

export async function loadProtocolCanary(root) {
  const protocolRoot = join(root, "protocol-canary");
  const [inventory, protocol, hashes] = await Promise.all([
    readJson(join(protocolRoot, "eligibility-inventory.json")),
    readJson(join(protocolRoot, "protocol.json")),
    readJson(join(protocolRoot, "protocol-hashes.json")),
  ]);
  return { inventory, protocol, hashes };
}

export async function validateProtocolDocuments(root, inventory, protocol) {
  assertCleanStrings(inventory, "protocol-canary/eligibility-inventory.json");
  assertCleanStrings(protocol, "protocol-canary/protocol.json");
  const derivedInventory = await deriveEligibilityInventory(root);
  if (!isDeepStrictEqual(inventory, derivedInventory)) fail("protocol-canary/eligibility-inventory.json", "inventory is not a deterministic rebuild");
  const target = exact(protocol, [
    "schema_version", "protocol_id", "status", "source_identity", "case_order", "selection_rule",
    "selected_slices", "context_metric_policy", "human_judging", "reporting_policy", "authorization",
  ], "protocol-canary/protocol.json");
  if (target.schema_version !== "starlette-protocol-canary/v1" || target.protocol_id !== "starlette-v1-protocol-canary" || target.status !== STATUS) {
    fail("protocol-canary/protocol.json", "protocol identity changed");
  }
  validateSourceIdentity(target.source_identity, "protocol-canary/protocol.json.source_identity");
  exactArray(target.case_order, CASE_ORDER, "protocol-canary/protocol.json.case_order");
  const rule = exact(target.selection_rule, ["per_case", "result_dependent_selection_allowed", "selected_slice_count", "full_inventory_slice_count"], "protocol-canary/protocol.json.selection_rule");
  if (
    rule.per_case !== "first_technically_mature_slice_with_manual_task_dependency_plus_terminal" ||
    bool(rule.result_dependent_selection_allowed, "protocol-canary/protocol.json.selection_rule.result_dependent_selection_allowed") !== false ||
    integer(rule.selected_slice_count, "protocol-canary/protocol.json.selection_rule.selected_slice_count") !== 12 ||
    integer(rule.full_inventory_slice_count, "protocol-canary/protocol.json.selection_rule.full_inventory_slice_count") !== 75
  ) fail("protocol-canary/protocol.json.selection_rule", "selection rule changed");

  const bundles = new Map();
  for (const caseId of CASE_ORDER) {
    const caseRoot = join(root, "promotion", "cases", caseId);
    const [events, tasks, factGold, oracleState] = await Promise.all([
      readJson(join(caseRoot, "events.json")),
      readJson(join(caseRoot, "tasks.json")),
      readJson(join(caseRoot, "fact-gold.json")),
      readJson(join(caseRoot, "oracle-state.json")),
    ]);
    bundles.set(caseId, { events, tasks, factGold, oracleState });
  }
  const inventorySlices = new Map(inventory.slices.map((slice) => [slice.slice_id, slice]));
  const selections = array(target.selected_slices, "protocol-canary/protocol.json.selected_slices");
  if (selections.length !== SELECTED_SLICES.length) fail("protocol-canary/protocol.json.selected_slices", "expected 12 slices");
  const allProbeIds = [];
  let requiredItemCount = 0;
  let forbiddenItemCount = 0;
  let notExactlyScorableCount = 0;
  for (const [index, expectedSliceId] of SELECTED_SLICES.entries()) {
    const caseId = expectedSliceId.split("/")[0];
    const bundle = bundles.get(caseId);
    const maps = factMaps(bundle);
    const task = maps.tasks.get(expectedSliceId);
    const goldSlice = maps.slices.get(expectedSliceId);
    const state = maps.states.get(expectedSliceId);
    const inventorySlice = inventorySlices.get(expectedSliceId);
    if (!task || !goldSlice || !state || !inventorySlice) fail(expectedSliceId, "missing canonical slice input");
    const result = validateSelectedSlice(selections[index], `protocol-canary/protocol.json.selected_slices[${index}]`, {
      expectedSliceId, bundle, maps, task, goldSlice, state, inventorySlice,
    });
    allProbeIds.push(...result.probeIds);
    requiredItemCount += result.requiredCount;
    forbiddenItemCount += result.forbiddenCount;
    notExactlyScorableCount += result.notExactlyScorableCount;
  }
  if (new Set(allProbeIds).size !== allProbeIds.length) fail("protocol-canary/protocol.json.selected_slices", "probe ids must be globally unique");
  validatePolicies(target, "protocol-canary/protocol.json");

  return {
    schema_version: "starlette-protocol-canary-validation/v1",
    status: STATUS,
    case_count: 6,
    fact_count: 83,
    full_inventory_slice_count: 75,
    fact_slice_assignment_count: 499,
    selected_slice_count: 12,
    context_probe_count: allProbeIds.length,
    not_exactly_scorable_dependency_count: notExactlyScorableCount,
    answer_required_item_count: requiredItemCount,
    answer_forbidden_item_count: forbiddenItemCount,
    resolved_context_probe_count: 0,
    evaluation_run_count: 0,
    model_call_count: 0,
    effect_metrics_generated: false,
  };
}

export async function validateProtocolCanary(root) {
  await validatePromotion(root);
  for (const entry of FILE_CONTRACT) {
    const actual = await hashFile(join(root, entry.path));
    if (actual !== entry.sha256) fail(entry.path, "fixed protocol candidate hash changed");
  }
  if (await hashFile(join(root, SOURCE_IDENTITY.promotion_hashes_path)) !== SOURCE_IDENTITY.promotion_hashes_sha256) fail("promotion-hashes.json", "canonical promotion identity changed");
  if (await hashFile(join(root, SOURCE_IDENTITY.collection_path)) !== SOURCE_IDENTITY.collection_sha256) fail("promotion/collection.json", "canonical collection identity changed");

  const { inventory, protocol, hashes } = await loadProtocolCanary(root);
  validateHashManifest(hashes, "protocol-canary/protocol-hashes.json");
  return validateProtocolDocuments(root, inventory, protocol);
}

const currentPath = fileURLToPath(import.meta.url);
if (resolve(process.argv[1] ?? "") === currentPath) {
  const root = resolve(process.argv[2] ?? join(dirname(currentPath), ".."));
  try {
    process.stdout.write(`${JSON.stringify(await validateProtocolCanary(root))}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? `${error.name}: ${error.message}` : "ProtocolCanaryValidationError"}\n`);
    process.exitCode = 1;
  }
}
