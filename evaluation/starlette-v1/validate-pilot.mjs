#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCHEMA_VERSION = "starlette-pilot/v1";
const MODEL_INPUT_VERSION = "starlette-model-input/v1";
const CASE_FILES = [
  "manifest.json",
  "events.json",
  "tasks.json",
  "fact-gold.json",
  "oracle-state.json",
  "decision-references.json",
  "outcome-anchors.json",
];
const INPUT_FILES = ["events.json", "tasks.json"];
const NON_INPUT_FILES = [
  "fact-gold.json",
  "oracle-state.json",
  "decision-references.json",
  "outcome-anchors.json",
];
const EVENT_SOURCE_KIND = {
  issue_body: "issue",
  issue_comment: "issue_comment",
  pull_request_body: "pull_request",
  pull_request_comment: "pull_request_comment",
  pull_request_review: "pull_request_review",
  issue_state: "issue_state_event",
};

export class PilotValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "PilotValidationError";
  }
}

function fail(path, message) {
  throw new PilotValidationError(`${path}: ${message}`);
}

function object(value, path) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    fail(path, "expected object");
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) fail(path, "expected plain object");
  return value;
}

function exact(value, keys, path) {
  const target = object(value, path);
  const actual = Object.keys(target).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    fail(path, `expected keys ${expected.join(",")}; got ${actual.join(",")}`);
  }
  return target;
}

function string(value, path, { nullable = false } = {}) {
  if (nullable && value === null) return value;
  if (typeof value !== "string" || value.length === 0) fail(path, "expected non-empty string");
  return value;
}

function integer(value, path, minimum = 0) {
  if (!Number.isInteger(value) || value < minimum) fail(path, `expected integer >= ${minimum}`);
  return value;
}

function number(value, path, minimum, maximum) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum || value > maximum) {
    fail(path, `expected number in [${minimum}, ${maximum}]`);
  }
  return value;
}

function bool(value, path) {
  if (typeof value !== "boolean") fail(path, "expected boolean");
  return value;
}

function array(value, path) {
  if (!Array.isArray(value)) fail(path, "expected array");
  return value;
}

function enumValue(value, allowed, path) {
  if (!allowed.includes(value)) fail(path, `expected one of ${allowed.join(",")}`);
  return value;
}

function iso(value, path) {
  string(value, path);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value) || Number.isNaN(Date.parse(value))) {
    fail(path, "expected UTC ISO timestamp");
  }
  return value;
}

function nullableIso(value, path) {
  if (value === null) return value;
  return iso(value, path);
}

function sha256(value, path) {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value)) fail(path, "expected SHA-256 hex");
  return value;
}

function uniqueStrings(value, path) {
  const values = array(value, path).map((entry, index) => string(entry, `${path}[${index}]`));
  if (new Set(values).size !== values.length) fail(path, "duplicate value");
  return values;
}

function requirePrefix(id, segmentId, path) {
  if (!id.startsWith(`${segmentId}/`)) fail(path, `id must belong to ${segmentId}`);
}

function source(value, path) {
  const target = exact(value, [
    "source_id", "kind", "repository", "number", "database_id", "node_id", "url", "commit_sha",
  ], path);
  string(target.source_id, `${path}.source_id`);
  enumValue(target.kind, [
    "issue", "issue_comment", "pull_request", "pull_request_comment", "pull_request_review",
    "issue_state_event", "merge_commit",
  ], `${path}.kind`);
  if (target.repository !== "Kludex/starlette") fail(`${path}.repository`, "expected Kludex/starlette");
  if (target.number !== null) integer(target.number, `${path}.number`, 1);
  if (target.database_id !== null && !(typeof target.database_id === "string" || Number.isInteger(target.database_id))) {
    fail(`${path}.database_id`, "expected string, integer, or null");
  }
  if (target.node_id !== null) string(target.node_id, `${path}.node_id`);
  string(target.url, `${path}.url`);
  if (target.commit_sha !== null && !/^[a-f0-9]{40}$/.test(target.commit_sha)) {
    fail(`${path}.commit_sha`, "expected Git SHA-1 or null");
  }
  return target;
}

function validateManifest(value, expectedCaseId, path) {
  const target = exact(value, [
    "schema_version", "case_id", "title", "repository", "historical_repository_aliases", "tier",
    "pilot_status", "segments", "boundary_decision", "included_source_ids", "excluded_sources",
    "input_files", "non_input_files", "source_body_history_limitations",
  ], path);
  if (target.schema_version !== SCHEMA_VERSION) fail(`${path}.schema_version`, "unsupported version");
  if (target.case_id !== expectedCaseId) fail(`${path}.case_id`, `expected ${expectedCaseId}`);
  string(target.title, `${path}.title`);
  if (target.repository !== "Kludex/starlette") fail(`${path}.repository`, "expected Kludex/starlette");
  const aliases = uniqueStrings(target.historical_repository_aliases, `${path}.historical_repository_aliases`);
  if (!aliases.includes("encode/starlette")) fail(`${path}.historical_repository_aliases`, "missing encode/starlette");
  enumValue(target.tier, ["short", "medium", "long", "boundary_audit"], `${path}.tier`);
  enumValue(target.pilot_status, ["pilot_not_frozen", "canary_not_frozen"], `${path}.pilot_status`);
  string(target.source_body_history_limitations, `${path}.source_body_history_limitations`);
  const segmentIds = new Set();
  const segments = array(target.segments, `${path}.segments`).map((entry, index) => {
    const segmentPath = `${path}.segments[${index}]`;
    const segment = exact(entry, [
      "id", "classification", "boundary", "event_ids", "information_increment_event_ids", "slice_ids",
    ], segmentPath);
    const id = string(segment.id, `${segmentPath}.id`);
    if (segmentIds.has(id)) fail(`${segmentPath}.id`, "duplicate segment id");
    segmentIds.add(id);
    enumValue(segment.classification, ["short", "medium", "long"], `${segmentPath}.classification`);
    enumValue(segment.boundary, ["independent", "split_from_composite"], `${segmentPath}.boundary`);
    const eventIds = uniqueStrings(segment.event_ids, `${segmentPath}.event_ids`);
    eventIds.forEach((eventId) => requirePrefix(eventId, id, `${segmentPath}.event_ids`));
    const increments = uniqueStrings(segment.information_increment_event_ids, `${segmentPath}.information_increment_event_ids`);
    let previousIndex = -1;
    for (const incrementId of increments) {
      const eventIndex = eventIds.indexOf(incrementId);
      if (eventIndex < 0) fail(`${segmentPath}.information_increment_event_ids`, "increment must belong to event_ids");
      if (eventIndex <= previousIndex) fail(`${segmentPath}.information_increment_event_ids`, "increments must follow event order");
      previousIndex = eventIndex;
    }
    if (increments.length < 3) fail(`${segmentPath}.information_increment_event_ids`, "at least three increments required");
    const expectedClassification = increments.length <= 4 ? "short" : increments.length <= 8 ? "medium" : "long";
    if (segment.classification !== expectedClassification) {
      fail(`${segmentPath}.classification`, `expected ${expectedClassification} for ${increments.length} increments`);
    }
    uniqueStrings(segment.slice_ids, `${segmentPath}.slice_ids`).forEach((sliceId) => requirePrefix(sliceId, id, `${segmentPath}.slice_ids`));
    return segment;
  });
  if (segments.length === 0) fail(`${path}.segments`, "expected at least one segment");
  if (segments.length === 1 && target.tier !== segments[0].classification) {
    fail(`${path}.tier`, "single-segment tier must match segment classification");
  }
  if (segments.length > 1 && target.tier !== "boundary_audit") {
    fail(`${path}.tier`, "multi-segment case must use boundary_audit");
  }
  const decision = exact(target.boundary_decision, ["status", "rationale", "falsification"], `${path}.boundary_decision`);
  enumValue(decision.status, ["single_case", "split_required"], `${path}.boundary_decision.status`);
  string(decision.rationale, `${path}.boundary_decision.rationale`);
  string(decision.falsification, `${path}.boundary_decision.falsification`);
  if ((decision.status === "split_required") !== (segments.length > 1)) {
    fail(`${path}.boundary_decision.status`, "split_required must have multiple segments and single_case exactly one");
  }
  uniqueStrings(target.included_source_ids, `${path}.included_source_ids`);
  const excludedIds = new Set();
  for (const [index, entry] of array(target.excluded_sources, `${path}.excluded_sources`).entries()) {
    const excludedPath = `${path}.excluded_sources[${index}]`;
    const excluded = exact(entry, ["source_id", "url", "reason"], excludedPath);
    string(excluded.source_id, `${excludedPath}.source_id`);
    string(excluded.url, `${excludedPath}.url`);
    string(excluded.reason, `${excludedPath}.reason`);
    if (excludedIds.has(excluded.source_id)) fail(`${excludedPath}.source_id`, "duplicate excluded source");
    excludedIds.add(excluded.source_id);
  }
  if (JSON.stringify(target.input_files) !== JSON.stringify(INPUT_FILES)) fail(`${path}.input_files`, "input boundary changed");
  if (JSON.stringify(target.non_input_files) !== JSON.stringify(NON_INPUT_FILES)) fail(`${path}.non_input_files`, "non-input boundary changed");
  return { target, segmentIds };
}

function validateEvents(value, caseId, segmentIds, path) {
  const target = exact(value, ["schema_version", "case_id", "events"], path);
  if (target.schema_version !== SCHEMA_VERSION || target.case_id !== caseId) fail(path, "case envelope mismatch");
  const ids = new Set();
  const sourceIds = new Set();
  const events = array(target.events, `${path}.events`).map((entry, index) => {
    const eventPath = `${path}.events[${index}]`;
    const event = exact(entry, [
      "id", "segment_id", "ordinal", "role", "event_type", "source", "occurred_at", "source_updated_at",
      "actor", "summary", "source_content_sha256",
    ], eventPath);
    const id = string(event.id, `${eventPath}.id`);
    const segmentId = string(event.segment_id, `${eventPath}.segment_id`);
    if (!segmentIds.has(segmentId)) fail(`${eventPath}.segment_id`, "unknown segment");
    requirePrefix(id, segmentId, `${eventPath}.id`);
    if (ids.has(id)) fail(`${eventPath}.id`, "duplicate event id");
    ids.add(id);
    integer(event.ordinal, `${eventPath}.ordinal`, 1);
    if (event.role !== "user") fail(`${eventPath}.role`, "D1 evidence must map to user role");
    enumValue(event.event_type, [
      "issue_body", "issue_comment", "pull_request_body", "pull_request_comment", "pull_request_review", "issue_state",
    ], `${eventPath}.event_type`);
    const eventSource = source(event.source, `${eventPath}.source`);
    if (eventSource.kind !== EVENT_SOURCE_KIND[event.event_type]) {
      fail(`${eventPath}.source.kind`, `does not match event_type ${event.event_type}`);
    }
    if (sourceIds.has(eventSource.source_id)) fail(`${eventPath}.source.source_id`, "duplicate included source");
    sourceIds.add(eventSource.source_id);
    const occurredAt = iso(event.occurred_at, `${eventPath}.occurred_at`);
    const sourceUpdatedAt = nullableIso(event.source_updated_at, `${eventPath}.source_updated_at`);
    if (sourceUpdatedAt !== null && Date.parse(sourceUpdatedAt) < Date.parse(occurredAt)) {
      fail(`${eventPath}.source_updated_at`, "cannot precede occurred_at");
    }
    string(event.actor, `${eventPath}.actor`);
    string(event.summary, `${eventPath}.summary`);
    sha256(event.source_content_sha256, `${eventPath}.source_content_sha256`);
    return event;
  });
  const bySegment = new Map();
  for (const event of events) {
    const entries = bySegment.get(event.segment_id) ?? [];
    entries.push(event);
    bySegment.set(event.segment_id, entries);
  }
  for (const segmentId of segmentIds) {
    const entries = bySegment.get(segmentId) ?? [];
    if (entries.length === 0) fail(`${path}.events`, `segment ${segmentId} has no events`);
    entries.forEach((event, index) => {
      if (event.ordinal !== index + 1) fail(`${path}.events`, `segment ${segmentId} ordinals must be contiguous`);
      if (index > 0 && Date.parse(entries[index - 1].occurred_at) >= Date.parse(event.occurred_at)) {
        fail(`${path}.events`, `segment ${segmentId} time reversal`);
      }
    });
  }
  return { target, events, ids, sourceIds, bySegment };
}

function validateTasks(value, caseId, eventData, path) {
  const target = exact(value, ["schema_version", "case_id", "tasks"], path);
  if (target.schema_version !== SCHEMA_VERSION || target.case_id !== caseId) fail(path, "case envelope mismatch");
  const ids = new Set();
  const tasks = array(target.tasks, `${path}.tasks`).map((entry, index) => {
    const taskPath = `${path}.tasks[${index}]`;
    const task = exact(entry, [
      "id", "segment_id", "cutoff_event_id", "available_event_ids", "recent_raw_window_turns", "current_task",
    ], taskPath);
    const id = string(task.id, `${taskPath}.id`);
    const segmentId = string(task.segment_id, `${taskPath}.segment_id`);
    requirePrefix(id, segmentId, `${taskPath}.id`);
    if (ids.has(id)) fail(`${taskPath}.id`, "duplicate slice id");
    ids.add(id);
    const segmentEvents = eventData.bySegment.get(segmentId);
    if (!segmentEvents) fail(`${taskPath}.segment_id`, "unknown segment");
    const cutoffIndex = segmentEvents.findIndex((event) => event.id === task.cutoff_event_id);
    if (cutoffIndex < 0) fail(`${taskPath}.cutoff_event_id`, "cutoff not in segment");
    const available = uniqueStrings(task.available_event_ids, `${taskPath}.available_event_ids`);
    const expected = segmentEvents.slice(0, cutoffIndex + 1).map((event) => event.id);
    if (JSON.stringify(available) !== JSON.stringify(expected)) fail(`${taskPath}.available_event_ids`, "must equal the exact segment prefix through cutoff");
    integer(task.recent_raw_window_turns, `${taskPath}.recent_raw_window_turns`, 1);
    if (task.recent_raw_window_turns > available.length) fail(`${taskPath}.recent_raw_window_turns`, "cannot exceed visible event count");
    string(task.current_task, `${taskPath}.current_task`);
    return task;
  });
  return { target, tasks, ids };
}

function validateGold(value, caseId, tasksData, eventData, path) {
  const target = exact(value, ["schema_version", "case_id", "facts", "slices"], path);
  if (target.schema_version !== SCHEMA_VERSION || target.case_id !== caseId) fail(path, "case envelope mismatch");
  const facts = new Map();
  for (const [index, entry] of array(target.facts, `${path}.facts`).entries()) {
    const factPath = `${path}.facts[${index}]`;
    const fact = exact(entry, [
      "id", "segment_id", "category", "statement", "first_known_at_event_id", "superseded_at_event_id", "provenance_event_ids",
    ], factPath);
    string(fact.id, `${factPath}.id`);
    string(fact.segment_id, `${factPath}.segment_id`);
    requirePrefix(fact.id, fact.segment_id, `${factPath}.id`);
    if (facts.has(fact.id)) fail(`${factPath}.id`, "duplicate fact id");
    enumValue(fact.category, [
      "constraint", "decision", "resolved_issue", "open_question", "evidence", "rejected_alternative", "outcome_status",
    ], `${factPath}.category`);
    string(fact.statement, `${factPath}.statement`);
    const segmentEvents = eventData.bySegment.get(fact.segment_id);
    if (!segmentEvents) fail(`${factPath}.segment_id`, "unknown segment");
    const firstIndex = segmentEvents.findIndex((event) => event.id === fact.first_known_at_event_id);
    if (firstIndex < 0) fail(`${factPath}.first_known_at_event_id`, "unknown first-known event");
    const provenance = uniqueStrings(fact.provenance_event_ids, `${factPath}.provenance_event_ids`);
    if (provenance.length === 0) fail(`${factPath}.provenance_event_ids`, "provenance required");
    for (const ref of provenance) {
      const refIndex = segmentEvents.findIndex((event) => event.id === ref);
      if (refIndex < 0 || refIndex > firstIndex) fail(`${factPath}.provenance_event_ids`, "provenance must be visible when fact first becomes known");
    }
    if (fact.superseded_at_event_id !== null) {
      const supersededIndex = segmentEvents.findIndex((event) => event.id === fact.superseded_at_event_id);
      if (supersededIndex <= firstIndex) fail(`${factPath}.superseded_at_event_id`, "supersession must be later than first-known event");
    }
    facts.set(fact.id, fact);
  }
  const sliceIds = new Set();
  for (const [index, entry] of array(target.slices, `${path}.slices`).entries()) {
    const slicePath = `${path}.slices[${index}]`;
    const slice = exact(entry, ["slice_id", "fact_ids"], slicePath);
    string(slice.slice_id, `${slicePath}.slice_id`);
    if (sliceIds.has(slice.slice_id)) fail(`${slicePath}.slice_id`, "duplicate Gold slice");
    sliceIds.add(slice.slice_id);
    const task = tasksData.tasks.find((candidate) => candidate.id === slice.slice_id);
    if (!task) fail(`${slicePath}.slice_id`, "unknown task slice");
    const visible = new Set(task.available_event_ids);
    for (const factId of uniqueStrings(slice.fact_ids, `${slicePath}.fact_ids`)) {
      const fact = facts.get(factId);
      if (!fact) fail(`${slicePath}.fact_ids`, "unknown fact");
      if (fact.segment_id !== task.segment_id) fail(`${slicePath}.fact_ids`, "cross-segment fact");
      if (!visible.has(fact.first_known_at_event_id) || fact.provenance_event_ids.some((ref) => !visible.has(ref))) {
        fail(`${slicePath}.fact_ids`, "future Gold provenance");
      }
      if (fact.superseded_at_event_id !== null && visible.has(fact.superseded_at_event_id)) {
        fail(`${slicePath}.fact_ids`, "superseded fact remains current");
      }
    }
  }
  if (sliceIds.size !== tasksData.ids.size || [...tasksData.ids].some((id) => !sliceIds.has(id))) {
    fail(`${path}.slices`, "Gold slices must match task slices exactly");
  }
  return { target, facts };
}

function normalize(value) {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("en-US")
    .replace(/[\p{Cf}\p{Cc}]+/gu, "")
    .replace(/[\p{P}\p{S}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function sourceIdentifiers(value) {
  return [value.source_id, value.database_id, value.node_id, value.url, value.commit_sha]
    .filter((entry) => entry !== null)
    .map((entry) => String(entry));
}

function rejectIncluded(taskText, candidate, path, message, minimumLength) {
  const normalized = normalize(candidate);
  const compactCandidate = normalized.replace(/\s+/g, "");
  const compactTask = taskText.replace(/\s+/g, "");
  if (normalized.length >= minimumLength && (taskText.includes(normalized) || compactTask.includes(compactCandidate))) {
    fail(path, message);
  }
}

function validateTaskContentBoundaries(tasksData, eventData, goldData, decisionData, outcomeData, path) {
  for (const [index, task] of tasksData.tasks.entries()) {
    const taskPath = `${path}.tasks[${index}].current_task`;
    const taskText = normalize(task.current_task);

    for (const fact of goldData.facts.values()) {
      rejectIncluded(taskText, fact.statement, taskPath, "Current Task repeats Fact Gold", 24);
    }

    for (const anchor of outcomeData.anchors) {
      rejectIncluded(taskText, anchor.summary, taskPath, "Current Task contains Outcome Anchor content", 24);
      for (const identifier of [anchor.id, ...sourceIdentifiers(anchor.source), ...anchor.artifact_urls]) {
        rejectIncluded(taskText, identifier, taskPath, "Current Task contains Outcome Anchor identifier", 8);
      }
    }

    const cutoff = eventData.events.find((event) => event.id === task.cutoff_event_id);
    for (const ref of decisionData.references) {
      const referenceTask = tasksData.tasks.find((candidate) => candidate.id === ref.slice_id);
      if (referenceTask.segment_id !== task.segment_id || Date.parse(ref.occurred_at) <= Date.parse(cutoff.occurred_at)) continue;
      rejectIncluded(taskText, ref.description, taskPath, "Current Task contains future Decision Reference", 24);
      for (const identifier of [ref.id, ...sourceIdentifiers(ref.source)]) {
        rejectIncluded(taskText, identifier, taskPath, "Current Task contains future Decision Reference identifier", 8);
      }
    }
  }
}

function validateOracle(value, caseId, tasksData, path) {
  const target = exact(value, ["schema_version", "case_id", "mode", "states"], path);
  if (target.schema_version !== SCHEMA_VERSION || target.case_id !== caseId) fail(path, "case envelope mismatch");
  if (target.mode !== "oracle") fail(`${path}.mode`, "oracle state must be explicit");
  const stateIds = new Set();
  for (const [index, entry] of array(target.states, `${path}.states`).entries()) {
    const statePath = `${path}.states[${index}]`;
    const state = exact(entry, ["slice_id", "session_id", "items", "relations"], statePath);
    const task = tasksData.tasks.find((candidate) => candidate.id === state.slice_id);
    if (!task) fail(`${statePath}.slice_id`, "unknown task slice");
    if (stateIds.has(state.slice_id)) fail(`${statePath}.slice_id`, "duplicate oracle slice");
    stateIds.add(state.slice_id);
    if (state.session_id !== task.segment_id) fail(`${statePath}.session_id`, "must equal segment id");
    const visible = new Set(task.available_event_ids);
    const itemIds = new Set();
    for (const [itemIndex, entryItem] of array(state.items, `${statePath}.items`).entries()) {
      const itemPath = `${statePath}.items[${itemIndex}]`;
      const item = exact(entryItem, [
        "id", "session_id", "type", "content", "status", "confidence", "created_at", "updated_at", "source_refs", "metadata",
      ], itemPath);
      requirePrefix(string(item.id, `${itemPath}.id`), task.segment_id, `${itemPath}.id`);
      if (itemIds.has(item.id)) fail(`${itemPath}.id`, "duplicate oracle item");
      itemIds.add(item.id);
      if (item.session_id !== task.segment_id) fail(`${itemPath}.session_id`, "must equal segment id");
      enumValue(item.type, ["GOAL", "CONSTRAINT", "DECISION", "OPEN_QUESTION", "REJECTED_ALTERNATIVE"], `${itemPath}.type`);
      const statuses = {
        GOAL: ["ACTIVE", "COMPLETED", "SUPERSEDED"], CONSTRAINT: ["ACTIVE", "SUPERSEDED"],
        DECISION: ["ACTIVE", "SUPERSEDED"], OPEN_QUESTION: ["OPEN", "RESOLVED", "DEFERRED"],
        REJECTED_ALTERNATIVE: ["REJECTED"],
      };
      enumValue(item.status, statuses[item.type], `${itemPath}.status`);
      string(item.content, `${itemPath}.content`);
      number(item.confidence, `${itemPath}.confidence`, 0, 1);
      iso(item.created_at, `${itemPath}.created_at`);
      iso(item.updated_at, `${itemPath}.updated_at`);
      const refs = uniqueStrings(item.source_refs, `${itemPath}.source_refs`);
      if (refs.length === 0 || refs.some((ref) => !visible.has(ref))) fail(`${itemPath}.source_refs`, "oracle provenance must be visible");
      object(item.metadata, `${itemPath}.metadata`);
      if (item.metadata.oracle !== true || item.metadata.segment_id !== task.segment_id) {
        fail(`${itemPath}.metadata`, "oracle metadata boundary missing");
      }
    }
    for (const [relationIndex, relationEntry] of array(state.relations, `${statePath}.relations`).entries()) {
      const relationPath = `${statePath}.relations[${relationIndex}]`;
      const relation = exact(relationEntry, ["session_id", "source_id", "relation_type", "target_id", "created_at"], relationPath);
      if (relation.session_id !== task.segment_id) fail(`${relationPath}.session_id`, "must equal segment id");
      if (!itemIds.has(relation.source_id) || !itemIds.has(relation.target_id)) fail(relationPath, "relation item missing from slice");
      enumValue(relation.relation_type, ["SUPERSEDES", "DEPENDS_ON", "RESOLVED_BY", "REJECTS", "DERIVED_FROM"], `${relationPath}.relation_type`);
      iso(relation.created_at, `${relationPath}.created_at`);
    }
  }
  if (stateIds.size !== tasksData.ids.size || [...tasksData.ids].some((id) => !stateIds.has(id))) {
    fail(`${path}.states`, "oracle states must match task slices exactly");
  }
  return target;
}

function validateDecisionReferences(value, caseId, tasksData, eventData, path) {
  const target = exact(value, ["schema_version", "case_id", "references"], path);
  if (target.schema_version !== SCHEMA_VERSION || target.case_id !== caseId) fail(path, "case envelope mismatch");
  const ids = new Set();
  for (const [index, entry] of array(target.references, `${path}.references`).entries()) {
    const refPath = `${path}.references[${index}]`;
    const ref = exact(entry, ["id", "slice_id", "source", "occurred_at", "description", "non_unique_answer"], refPath);
    string(ref.id, `${refPath}.id`);
    if (ids.has(ref.id)) fail(`${refPath}.id`, "duplicate decision reference");
    ids.add(ref.id);
    const task = tasksData.tasks.find((candidate) => candidate.id === ref.slice_id);
    if (!task) fail(`${refPath}.slice_id`, "unknown task slice");
    source(ref.source, `${refPath}.source`);
    iso(ref.occurred_at, `${refPath}.occurred_at`);
    const cutoff = eventData.events.find((event) => event.id === task.cutoff_event_id);
    if (Date.parse(ref.occurred_at) <= Date.parse(cutoff.occurred_at)) fail(`${refPath}.occurred_at`, "Decision Reference must follow cutoff");
    string(ref.description, `${refPath}.description`);
    bool(ref.non_unique_answer, `${refPath}.non_unique_answer`);
  }
  return { target, references: target.references };
}

function validateOutcomeAnchors(value, caseId, eventData, path) {
  const target = exact(value, ["schema_version", "case_id", "anchors"], path);
  if (target.schema_version !== SCHEMA_VERSION || target.case_id !== caseId) fail(path, "case envelope mismatch");
  const ids = new Set();
  for (const [index, entry] of array(target.anchors, `${path}.anchors`).entries()) {
    const anchorPath = `${path}.anchors[${index}]`;
    const anchor = exact(entry, ["id", "segment_id", "kind", "source", "occurred_at", "summary", "artifact_urls", "limitations"], anchorPath);
    requirePrefix(string(anchor.id, `${anchorPath}.id`), anchor.segment_id, `${anchorPath}.id`);
    if (ids.has(anchor.id)) fail(`${anchorPath}.id`, "duplicate outcome anchor");
    ids.add(anchor.id);
    enumValue(anchor.kind, ["issue_closed", "patch_merged", "regression_test", "design_resolution"], `${anchorPath}.kind`);
    const anchorSource = source(anchor.source, `${anchorPath}.source`);
    if (eventData.sourceIds.has(anchorSource.source_id)) fail(`${anchorPath}.source.source_id`, "Outcome Anchor mixed into evidence");
    iso(anchor.occurred_at, `${anchorPath}.occurred_at`);
    string(anchor.summary, `${anchorPath}.summary`);
    uniqueStrings(anchor.artifact_urls, `${anchorPath}.artifact_urls`);
    string(anchor.limitations, `${anchorPath}.limitations`);
  }
  return { target, anchors: target.anchors };
}

export function validateCaseBundle(bundle, label = bundle?.manifest?.case_id ?? "case") {
  const manifestResult = validateManifest(bundle.manifest, label, `${label}/manifest.json`);
  const eventData = validateEvents(bundle.events, label, manifestResult.segmentIds, `${label}/events.json`);
  const taskData = validateTasks(bundle.tasks, label, eventData, `${label}/tasks.json`);
  const goldData = validateGold(bundle.factGold, label, taskData, eventData, `${label}/fact-gold.json`);
  validateOracle(bundle.oracleState, label, taskData, `${label}/oracle-state.json`);
  const decisionData = validateDecisionReferences(bundle.decisionReferences, label, taskData, eventData, `${label}/decision-references.json`);
  const outcomeData = validateOutcomeAnchors(bundle.outcomeAnchors, label, eventData, `${label}/outcome-anchors.json`);
  validateTaskContentBoundaries(taskData, eventData, goldData, decisionData, outcomeData, `${label}/tasks.json`);
  const segmentEventIds = manifestResult.target.segments.flatMap((segment) => segment.event_ids);
  const segmentSliceIds = manifestResult.target.segments.flatMap((segment) => segment.slice_ids);
  if (JSON.stringify(segmentEventIds) !== JSON.stringify(eventData.events.map((event) => event.id))) {
    fail(`${label}/manifest.json.segments`, "event manifest mismatch");
  }
  if (JSON.stringify(segmentSliceIds) !== JSON.stringify(taskData.tasks.map((task) => task.id))) {
    fail(`${label}/manifest.json.segments`, "slice manifest mismatch");
  }
  if (JSON.stringify(manifestResult.target.included_source_ids) !== JSON.stringify(eventData.events.map((event) => event.source.source_id))) {
    fail(`${label}/manifest.json.included_source_ids`, "included source manifest mismatch");
  }
  return { case_id: label, segments: manifestResult.segmentIds.size, events: eventData.events.length, slices: taskData.tasks.length };
}

export function projectModelInput(bundle, sliceId) {
  const caseId = bundle?.manifest?.case_id ?? "case";
  validateCaseBundle(bundle, caseId);
  const task = bundle.tasks.tasks.find((candidate) => candidate.id === sliceId);
  if (!task) fail(`${caseId}/projection.slice_id`, "unknown task slice");
  const visible = new Set(task.available_event_ids);
  return {
    schema_version: MODEL_INPUT_VERSION,
    history_turns: bundle.events.events
      .filter((event) => event.segment_id === task.segment_id && visible.has(event.id))
      .map((event) => ({
        id: event.id,
        role: event.role,
        event_type: event.event_type,
        occurred_at: event.occurred_at,
        actor: event.actor,
        summary: event.summary,
      })),
    current_task: task.current_task,
  };
}

async function readJson(path) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    fail(path, error instanceof Error ? error.message : "unable to read JSON");
  }
}

async function loadCase(caseRoot) {
  const caseId = caseRoot.split("/").at(-1);
  const files = await Promise.all(CASE_FILES.map((name) => readJson(join(caseRoot, name))));
  return {
    caseId,
    bundle: {
      manifest: files[0], events: files[1], tasks: files[2], factGold: files[3], oracleState: files[4],
      decisionReferences: files[5], outcomeAnchors: files[6],
    },
  };
}

function validateContamination(value, path) {
  const target = exact(value, ["schema_version", "scan_date", "rule", "query_patterns", "results", "limitations"], path);
  if (target.schema_version !== SCHEMA_VERSION) fail(`${path}.schema_version`, "unsupported version");
  iso(target.scan_date, `${path}.scan_date`);
  string(target.rule, `${path}.rule`);
  const patterns = uniqueStrings(target.query_patterns, `${path}.query_patterns`);
  if (patterns.length === 0) fail(`${path}.query_patterns`, "query patterns required");
  const candidates = new Set();
  for (const [index, entry] of array(target.results, `${path}.results`).entries()) {
    const resultPath = `${path}.results[${index}]`;
    const result = exact(entry, ["candidate_id", "source_numbers", "status", "direct_evidence", "notes"], resultPath);
    string(result.candidate_id, `${resultPath}.candidate_id`);
    if (candidates.has(result.candidate_id)) fail(`${resultPath}.candidate_id`, "duplicate candidate");
    candidates.add(result.candidate_id);
    const numbers = array(result.source_numbers, `${resultPath}.source_numbers`);
    if (numbers.length === 0) fail(`${resultPath}.source_numbers`, "source number required");
    numbers.forEach((candidate, numberIndex) => integer(candidate, `${resultPath}.source_numbers[${numberIndex}]`, 1));
    enumValue(result.status, ["confirmed", "no_public_hit_found"], `${resultPath}.status`);
    const evidence = array(result.direct_evidence, `${resultPath}.direct_evidence`);
    for (const [evidenceIndex, item] of evidence.entries()) {
      const evidencePath = `${resultPath}.direct_evidence[${evidenceIndex}]`;
      const direct = exact(item, ["repository", "path", "url", "reason"], evidencePath);
      string(direct.repository, `${evidencePath}.repository`);
      string(direct.path, `${evidencePath}.path`);
      string(direct.url, `${evidencePath}.url`);
      string(direct.reason, `${evidencePath}.reason`);
    }
    if ((result.status === "confirmed") !== (evidence.length > 0)) fail(resultPath, "status/evidence mismatch");
    string(result.notes, `${resultPath}.notes`);
  }
  const expected = Array.from({ length: 15 }, (_, index) => `STR-${String(index + 1).padStart(2, "0")}`);
  if (JSON.stringify([...candidates]) !== JSON.stringify(expected)) fail(`${path}.results`, "expected ordered STR-01 through STR-15");
  string(target.limitations, `${path}.limitations`);
  return target;
}

async function hashFile(path) {
  return createHash("sha256").update(await readFile(path)).digest("hex");
}

export async function computeHashEntries(root) {
  const paths = ["contamination-scan.json"];
  const caseNames = (await readdir(join(root, "pilot"), { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  for (const caseName of caseNames) for (const file of CASE_FILES) paths.push(`pilot/${caseName}/${file}`);
  return Promise.all(paths.map(async (path) => ({ path, sha256: await hashFile(join(root, path)) })));
}

export async function computeCanaryHashEntries(root) {
  const canaryRoot = resolve(root);
  const paths = ["contamination-scan.json", ...CASE_FILES.map((name) => `canary/STR-04/${name}`)];
  return Promise.all(paths.map(async (path) => ({ path, sha256: await hashFile(join(canaryRoot, path)) })));
}

export async function loadPilot(root) {
  const pilotRoot = resolve(root);
  const caseDirectories = (await readdir(join(pilotRoot, "pilot"), { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(pilotRoot, "pilot", entry.name))
    .sort();
  const cases = await Promise.all(caseDirectories.map(loadCase));
  return {
    root: pilotRoot,
    cases,
    contamination: await readJson(join(pilotRoot, "contamination-scan.json")),
    hashes: await readJson(join(pilotRoot, "pilot-hashes.json")),
  };
}

export async function validatePilot(root, { verifyHashes = true } = {}) {
  const loaded = await loadPilot(root);
  const expectedCases = ["STR-02", "STR-05", "STR-08"];
  if (JSON.stringify(loaded.cases.map((entry) => entry.caseId)) !== JSON.stringify(expectedCases)) {
    fail("pilot", `expected case directories ${expectedCases.join(",")}`);
  }
  const caseResults = loaded.cases.map(({ caseId, bundle }) => validateCaseBundle(bundle, caseId));
  if (loaded.cases.some(({ bundle }) => bundle.manifest.pilot_status !== "pilot_not_frozen")) {
    fail("pilot", "pilot case status changed");
  }
  validateContamination(loaded.contamination, "contamination-scan.json");
  const hashes = exact(loaded.hashes, ["schema_version", "status", "algorithm", "files"], "pilot-hashes.json");
  if (hashes.schema_version !== SCHEMA_VERSION || hashes.status !== "pilot_not_frozen" || hashes.algorithm !== "sha256") {
    fail("pilot-hashes.json", "invalid pilot hash header");
  }
  const expectedEntries = await computeHashEntries(loaded.root);
  const actualEntries = array(hashes.files, "pilot-hashes.json.files").map((entry, index) => {
    const item = exact(entry, ["path", "sha256"], `pilot-hashes.json.files[${index}]`);
    string(item.path, `pilot-hashes.json.files[${index}].path`);
    sha256(item.sha256, `pilot-hashes.json.files[${index}].sha256`);
    return item;
  });
  if (verifyHashes && JSON.stringify(actualEntries) !== JSON.stringify(expectedEntries)) {
    fail("pilot-hashes.json.files", "pilot content hash mismatch");
  }
  return {
    schema_version: SCHEMA_VERSION,
    pilot_status: "pilot_not_frozen",
    case_count: caseResults.length,
    segment_count: caseResults.reduce((sum, result) => sum + result.segments, 0),
    event_count: caseResults.reduce((sum, result) => sum + result.events, 0),
    slice_count: caseResults.reduce((sum, result) => sum + result.slices, 0),
    contamination_confirmed: loaded.contamination.results.filter((result) => result.status === "confirmed").map((result) => result.candidate_id),
    hashes_verified: verifyHashes,
  };
}

export async function loadCanary(root) {
  const canaryRoot = resolve(root);
  return {
    root: canaryRoot,
    case: await loadCase(join(canaryRoot, "canary", "STR-04")),
    contamination: await readJson(join(canaryRoot, "contamination-scan.json")),
    hashes: await readJson(join(canaryRoot, "canary-hashes.json")),
  };
}

export async function validateCanary(root, { verifyHashes = true } = {}) {
  const loaded = await loadCanary(root);
  if (loaded.case.caseId !== "STR-04") fail("canary", "expected STR-04");
  const result = validateCaseBundle(loaded.case.bundle, loaded.case.caseId);
  if (loaded.case.bundle.manifest.pilot_status !== "canary_not_frozen") fail("canary", "canary status changed");
  validateContamination(loaded.contamination, "contamination-scan.json");
  const contamination = loaded.contamination.results.find((entry) => entry.candidate_id === "STR-04");
  if (!contamination || contamination.status !== "no_public_hit_found") fail("canary", "STR-04 contamination gate is not open");
  const hashes = exact(loaded.hashes, ["schema_version", "status", "algorithm", "files"], "canary-hashes.json");
  if (hashes.schema_version !== SCHEMA_VERSION || hashes.status !== "canary_not_frozen" || hashes.algorithm !== "sha256") {
    fail("canary-hashes.json", "invalid canary hash header");
  }
  const expectedEntries = await computeCanaryHashEntries(loaded.root);
  const actualEntries = array(hashes.files, "canary-hashes.json.files").map((entry, index) => {
    const item = exact(entry, ["path", "sha256"], `canary-hashes.json.files[${index}]`);
    string(item.path, `canary-hashes.json.files[${index}].path`);
    sha256(item.sha256, `canary-hashes.json.files[${index}].sha256`);
    return item;
  });
  if (verifyHashes && JSON.stringify(actualEntries) !== JSON.stringify(expectedEntries)) {
    fail("canary-hashes.json.files", "canary content hash mismatch");
  }
  return {
    schema_version: SCHEMA_VERSION,
    canary_status: "canary_not_frozen",
    case_count: 1,
    segment_count: result.segments,
    event_count: result.events,
    slice_count: result.slices,
    information_increment_count: loaded.case.bundle.manifest.segments[0].information_increment_event_ids.length,
    hashes_verified: verifyHashes,
  };
}

const modulePath = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === modulePath) {
  const defaultRoot = dirname(modulePath);
  const args = process.argv.slice(2);
  const printHashes = args.includes("--print-hashes");
  const printCanaryHashes = args.includes("--print-canary-hashes");
  const canary = args.includes("--canary");
  const requestedRoot = args.find((arg) => !arg.startsWith("--")) ?? defaultRoot;
  try {
    if (printCanaryHashes) {
      const files = await computeCanaryHashEntries(requestedRoot);
      process.stdout.write(`${JSON.stringify({ schema_version: SCHEMA_VERSION, status: "canary_not_frozen", algorithm: "sha256", files }, null, 2)}\n`);
    } else if (printHashes) {
      const files = await computeHashEntries(requestedRoot);
      process.stdout.write(`${JSON.stringify({ schema_version: SCHEMA_VERSION, status: "pilot_not_frozen", algorithm: "sha256", files }, null, 2)}\n`);
    } else if (canary) {
      process.stdout.write(`${JSON.stringify(await validateCanary(requestedRoot))}\n`);
    } else {
      process.stdout.write(`${JSON.stringify(await validatePilot(requestedRoot))}\n`);
    }
  } catch (error) {
    const message = error instanceof PilotValidationError ? error.message : "validation failed";
    process.stderr.write(`${JSON.stringify({ error: "INVALID_PILOT", message })}\n`);
    process.exitCode = 2;
  }
}
