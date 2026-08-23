#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validatePromotion } from "../validate-promotion.mjs";

export const CASE_ORDER = Object.freeze(["STR-07", "STR-08", "STR-05", "STR-06", "STR-01", "STR-04"]);
export const SELECTED_SLICES = Object.freeze([
  "STR-07/T4", "STR-07/T10",
  "STR-08/T3", "STR-08/T4",
  "STR-05/T7", "STR-05/T9",
  "STR-06/T4", "STR-06/T16",
  "STR-01/T4", "STR-01/T18",
  "STR-04/T4", "STR-04/T18",
]);

export const TASK_DEPENDENCY_FACTS = Object.freeze({
  "STR-07/T4": Object.freeze(["STR-07/F1"]),
  "STR-07/T10": Object.freeze(["STR-07/F7", "STR-07/F8", "STR-07/F9"]),
  "STR-08/T3": Object.freeze(["STR-08/F1"]),
  "STR-08/T4": Object.freeze(["STR-08/F2"]),
  "STR-05/T7": Object.freeze(["STR-05/F4", "STR-05/F5"]),
  "STR-05/T9": Object.freeze(["STR-05/F4", "STR-05/F6", "STR-05/F7"]),
  "STR-06/T4": Object.freeze(["STR-06/F1"]),
  "STR-06/T16": Object.freeze(["STR-06/F7", "STR-06/F10", "STR-06/F12"]),
  "STR-01/T4": Object.freeze(["STR-01/F1"]),
  "STR-01/T18": Object.freeze(["STR-01/F4", "STR-01/F5", "STR-01/F9", "STR-01/F10", "STR-01/F11", "STR-01/F15"]),
  "STR-04/T4": Object.freeze(["STR-04/F1"]),
  "STR-04/T18": Object.freeze(["STR-04/F2", "STR-04/F4", "STR-04/F15", "STR-04/F16"]),
});

const CORE_CONTEXT_CATEGORIES = new Set(["constraint", "decision", "open_question"]);
const EXPECTED_FACT_COUNT = 83;
const EXPECTED_SLICE_COUNT = 75;
const EXPECTED_ASSIGNMENT_COUNT = 499;
const SOURCE_IDENTITY = Object.freeze({
  accepted_builder_candidate: "4b974538d76d0e0d8a5ac17c5662533b714ef00e",
  promotion_hashes_path: "promotion-hashes.json",
  promotion_hashes_sha256: "c216719f1745601786ad53f50bbaed6c5e7b0a8e8d9d6612cfb79b9c103ff51b",
  collection_path: "promotion/collection.json",
  collection_sha256: "ae6ae7446e5e102a12e45124f4ab2658ba40974ec7c4251a1d39f178fd91cfeb",
});

function normalizeExact(value) {
  return value
    .normalize("NFKC")
    .replace(/[\p{Cf}\p{Cc}]/gu, "")
    .toLocaleLowerCase("en-US")
    .replace(/\s+/gu, " ")
    .trim();
}

function exactContains(haystack, needle) {
  const normalizedNeedle = normalizeExact(needle);
  return normalizedNeedle.length > 0 && normalizeExact(haystack).includes(normalizedNeedle);
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function loadCase(root, caseId) {
  const caseRoot = join(root, "promotion", "cases", caseId);
  const [events, tasks, factGold] = await Promise.all([
    readJson(join(caseRoot, "events.json")),
    readJson(join(caseRoot, "tasks.json")),
    readJson(join(caseRoot, "fact-gold.json")),
  ]);
  return { events, tasks, factGold };
}

function selectedRole(caseId, sliceId, terminalId) {
  if (!SELECTED_SLICES.includes(sliceId)) return "not_selected";
  if (sliceId === terminalId) return "terminal";
  return "earliest_mature_dependency";
}

function assert(condition, message) {
  if (!condition) throw new Error(`eligibility derivation failed: ${message}`);
}

export async function deriveEligibilityInventory(root) {
  await validatePromotion(root);
  const facts = [];
  const slices = [];

  for (const caseId of CASE_ORDER) {
    const bundle = await loadCase(root, caseId);
    const events = bundle.events.events;
    const tasks = bundle.tasks.tasks;
    const goldFacts = bundle.factGold.facts;
    const goldSlices = bundle.factGold.slices;
    const eventsById = new Map(events.map((event) => [event.id, event]));
    const eventIndexes = new Map(events.map((event, index) => [event.id, index]));
    const factsById = new Map(goldFacts.map((fact) => [fact.id, fact]));
    const slicesById = new Map(goldSlices.map((slice) => [slice.slice_id, slice]));
    const terminalId = tasks.at(-1)?.id;

    for (const fact of goldFacts) {
      facts.push({
        fact_id: fact.id,
        case_id: caseId,
        category: fact.category,
        statement: fact.statement,
        first_known_at_event_id: fact.first_known_at_event_id,
        superseded_at_event_id: fact.superseded_at_event_id,
        provenance_event_ids: [...fact.provenance_event_ids],
        context_probe_category_eligible: CORE_CONTEXT_CATEGORIES.has(fact.category),
      });
    }

    let firstMatureSliceId = null;
    for (const task of tasks) {
      const goldSlice = slicesById.get(task.id);
      assert(goldSlice !== undefined, `${task.id}: missing fact-gold slice`);
      const cutoffIndex = eventIndexes.get(task.cutoff_event_id);
      assert(cutoffIndex !== undefined, `${task.id}: unknown cutoff event`);
      const latestEvent = eventsById.get(task.cutoff_event_id);
      const firstRecentIndex = task.available_event_ids.length - task.recent_raw_window_turns;
      const assignments = goldSlice.fact_ids.map((factId) => {
        const fact = factsById.get(factId);
        assert(fact !== undefined, `${task.id}: unknown fact ${factId}`);
        const firstKnownIndex = eventIndexes.get(fact.first_known_at_event_id);
        const supersededIndex = fact.superseded_at_event_id === null
          ? null
          : eventIndexes.get(fact.superseded_at_event_id);
        assert(firstKnownIndex !== undefined, `${factId}: unknown first-known event`);
        assert(supersededIndex !== undefined || fact.superseded_at_event_id === null, `${factId}: unknown superseded event`);
        const outsideRecentWindow = firstKnownIndex < firstRecentIndex;
        const currentOverlap = exactContains(task.current_task, fact.statement);
        const latestOverlap = exactContains(latestEvent.summary, fact.statement);
        return {
          fact_id: factId,
          age_events: cutoffIndex - firstKnownIndex,
          first_known_outside_recent_window: outsideRecentWindow,
          superseded_at_or_before_cutoff: supersededIndex !== null && supersededIndex <= cutoffIndex,
          full_statement_in_current_task: currentOverlap,
          full_statement_in_latest_event: latestOverlap,
        };
      });
      assert(assignments.every((entry) => !entry.superseded_at_or_before_cutoff), `${task.id}: active slice contains superseded fact`);
      const technicallyMature = assignments
        .filter((entry) => entry.first_known_outside_recent_window && !entry.full_statement_in_current_task && !entry.full_statement_in_latest_event)
        .map((entry) => entry.fact_id);
      const recentOrCurrent = assignments
        .filter((entry) => !technicallyMature.includes(entry.fact_id))
        .map((entry) => entry.fact_id);
      const contextCategoryFacts = goldSlice.fact_ids.filter((factId) => CORE_CONTEXT_CATEGORIES.has(factsById.get(factId).category));
      const answerOnlyCategoryFacts = goldSlice.fact_ids.filter((factId) => !CORE_CONTEXT_CATEGORIES.has(factsById.get(factId).category));
      if (technicallyMature.length > 0 && firstMatureSliceId === null) firstMatureSliceId = task.id;
      const role = selectedRole(caseId, task.id, terminalId);
      const taskDependencies = TASK_DEPENDENCY_FACTS[task.id] ?? [];
      if (role === "earliest_mature_dependency") {
        assert(task.id === firstMatureSliceId, `${task.id}: is not first technically mature slice`);
        assert(taskDependencies.length > 0, `${task.id}: no task dependency facts`);
      }
      for (const factId of taskDependencies) {
        assert(technicallyMature.includes(factId), `${task.id}: dependency ${factId} is not technically mature`);
      }
      let exclusionReason = null;
      if (role === "not_selected") {
        exclusionReason = firstMatureSliceId === null
          ? "no_technically_mature_fact_yet"
          : "bounded_canary_excludes_intermediate_slice";
      }
      slices.push({
        slice_id: task.id,
        case_id: caseId,
        cutoff_event_id: task.cutoff_event_id,
        available_event_count: task.available_event_ids.length,
        recent_raw_window_turns: task.recent_raw_window_turns,
        first_recent_event_id: task.available_event_ids[firstRecentIndex],
        latest_event_id: task.cutoff_event_id,
        active_fact_ids: [...goldSlice.fact_ids],
        age_events_by_fact_id: Object.fromEntries(assignments.map((entry) => [entry.fact_id, entry.age_events])),
        outside_recent_window_fact_ids: assignments
          .filter((entry) => entry.first_known_outside_recent_window)
          .map((entry) => entry.fact_id),
        full_statement_in_current_task_fact_ids: assignments
          .filter((entry) => entry.full_statement_in_current_task)
          .map((entry) => entry.fact_id),
        full_statement_in_latest_event_fact_ids: assignments
          .filter((entry) => entry.full_statement_in_latest_event)
          .map((entry) => entry.fact_id),
        context_probe_category_fact_ids: contextCategoryFacts,
        answer_only_category_fact_ids: answerOnlyCategoryFacts,
        technically_mature_fact_ids: technicallyMature,
        recent_or_current_fact_ids: recentOrCurrent,
        canary_role: role,
        task_dependency_fact_ids: [...taskDependencies],
        selection_reason: role === "earliest_mature_dependency"
          ? "first_technically_mature_slice_with_manual_task_dependency"
          : role === "terminal"
            ? "fixed_terminal_boundary_slice"
            : exclusionReason,
      });
    }
  }

  const assignmentCount = slices.reduce((sum, slice) => sum + slice.active_fact_ids.length, 0);
  assert(facts.length === EXPECTED_FACT_COUNT, `expected ${EXPECTED_FACT_COUNT} facts; got ${facts.length}`);
  assert(slices.length === EXPECTED_SLICE_COUNT, `expected ${EXPECTED_SLICE_COUNT} slices; got ${slices.length}`);
  assert(assignmentCount === EXPECTED_ASSIGNMENT_COUNT, `expected ${EXPECTED_ASSIGNMENT_COUNT} assignments; got ${assignmentCount}`);
  assert(
    JSON.stringify(slices.filter((slice) => slice.canary_role !== "not_selected").map((slice) => slice.slice_id)) === JSON.stringify(SELECTED_SLICES),
    "selected slice order changed",
  );

  return {
    schema_version: "starlette-protocol-eligibility/v1",
    status: "protocol_canary_not_frozen",
    source_identity: { ...SOURCE_IDENTITY },
    case_order: [...CASE_ORDER],
    summary: {
      case_count: CASE_ORDER.length,
      fact_count: facts.length,
      slice_count: slices.length,
      fact_slice_assignment_count: assignmentCount,
      selected_slice_count: SELECTED_SLICES.length,
    },
    facts,
    slices,
    limitations: {
      technical_maturity_is_not_semantic_task_dependency: true,
      exact_overlap_checks_do_not_detect_paraphrase: true,
      medium_tier_represented: false,
      tier_balanced_claim_authorized: false,
    },
  };
}

const currentPath = fileURLToPath(import.meta.url);
if (resolve(process.argv[1] ?? "") === currentPath) {
  const root = resolve(process.argv[2] ?? join(dirname(currentPath), ".."));
  process.stdout.write(`${JSON.stringify(await deriveEligibilityInventory(root), null, 2)}\n`);
}
