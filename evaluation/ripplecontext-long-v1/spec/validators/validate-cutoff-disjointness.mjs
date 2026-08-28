import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const EVENT_ID = /^EV-[0-9]{6}$/;
const EVENT_TOKEN = /EV-[0-9]{6}/g;
export const VALIDATOR_VERSION = "rc-synth-long-cutoff-disjointness-validator/1.0.0";
const VISIBLE_ROOTS = [
  "local_entity_state",
  "relationship_state_snapshot",
  "unresolved_open_thread_ledger",
];
const FUTURE_CODES = ["OMIT_OPAQUE_EVENT", "NO_FORWARD_REFERENCE", "PRESERVE_CUTOFF_STATE"];

export class BoundaryValidationError extends Error {
  constructor(code, message) {
    super(`${code}: ${message}`);
    this.name = "BoundaryValidationError";
    this.code = code;
  }
}

function fail(code, message) {
  throw new BoundaryValidationError(code, message);
}

function assert(condition, code, message) {
  if (!condition) fail(code, message);
}

function canonicalValue(value) {
  if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") {
    assert(Number.isFinite(value), "NON_IJSON_NUMBER", "non-finite JSON number");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalValue).join(",")}]`;
  assert(value && typeof value === "object", "NON_JSON_VALUE", `unsupported value type ${typeof value}`);
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalValue(value[key])}`).join(",")}}`;
}

export function jcsBytes(value) {
  return Buffer.from(canonicalValue(value), "utf8");
}

export function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

export function hashJcs(value) {
  return sha256(jcsBytes(value));
}

function unique(values, code, label) {
  assert(new Set(values).size === values.length, code, `${label} contains a duplicate`);
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function normalizeAliasMap(value = {}) {
  const map = new Map();
  for (const [alias, canonical] of Object.entries(value)) {
    assert(EVENT_ID.test(alias) && EVENT_ID.test(canonical), "INVALID_EVENT_ALIAS_HINT", `${alias} -> ${canonical}`);
    map.set(alias, canonical);
  }
  return map;
}

export function createEventOrderIndex(entries, options = {}) {
  assert(Array.isArray(entries) && entries.length > 0, "EMPTY_EVENT_ORDER_INDEX", "event order index is empty");
  const sorted = entries.map((entry) => ({
    event_id: entry.event_id,
    stream_seq: entry.stream_seq,
    corpus_unit_id: entry.corpus_unit_id,
  })).sort((a, b) => a.stream_seq - b.stream_seq);
  const ids = sorted.map((entry) => entry.event_id);
  const seqs = sorted.map((entry) => entry.stream_seq);
  unique(ids, "DUPLICATE_EVENT_ID", "event order index");
  unique(seqs, "DUPLICATE_STREAM_SEQ", "event order index");
  for (const entry of sorted) {
    assert(EVENT_ID.test(entry.event_id), "INVALID_CANONICAL_EVENT_ID", String(entry.event_id));
    assert(Number.isSafeInteger(entry.stream_seq) && entry.stream_seq >= 1, "INVALID_STREAM_SEQ", String(entry.stream_seq));
    assert(/^CH[0-9]{3}\.S[0-9]{2}$/.test(entry.corpus_unit_id), "INVALID_CORPUS_UNIT_ID", String(entry.corpus_unit_id));
  }
  const byId = new Map(sorted.map((entry) => [entry.event_id, entry]));
  const bySeq = new Map(sorted.map((entry) => [entry.stream_seq, entry]));
  return {
    entries: sorted,
    byId,
    bySeq,
    sha256: hashJcs(sorted),
    eventGraphVersion: options.eventGraphVersion ?? "event-graph/fixture",
    timelineVersion: options.timelineVersion ?? "timeline/fixture",
    forbiddenAliases: normalizeAliasMap(options.forbiddenAliases),
  };
}

export function buildEventOrderIndex(eventsAsset, timelineAsset, forbiddenAliases = {}) {
  assert(eventsAsset.event_order_policy?.event_aliases_allowed === false, "EVENT_ALIAS_POLICY_DRIFT", "events must forbid aliases");
  const firstDisclosure = new Map();
  for (const item of timelineAsset.disclosure_index ?? []) {
    if (!item.first_disclosure) continue;
    assert(!firstDisclosure.has(item.event_id), "DUPLICATE_FIRST_DISCLOSURE", item.event_id);
    firstDisclosure.set(item.event_id, item);
  }
  const entries = (eventsAsset.events ?? []).map((event) => {
    const disclosure = firstDisclosure.get(event.event_id);
    assert(disclosure, "MISSING_FIRST_DISCLOSURE", event.event_id);
    assert(disclosure.stream_seq === event.stream_seq, "DISCLOSURE_STREAM_SEQ_MISMATCH", event.event_id);
    return { event_id: event.event_id, stream_seq: event.stream_seq, corpus_unit_id: disclosure.corpus_unit_id };
  });
  assert(firstDisclosure.size === entries.length, "DISCLOSURE_EVENT_COVERAGE_MISMATCH", "first-disclosure set differs from Event set");
  const index = createEventOrderIndex(entries, {
    eventGraphVersion: eventsAsset.event_graph_version,
    timelineVersion: timelineAsset.timeline_version,
    forbiddenAliases,
  });
  assert(eventsAsset.event_order_index_sha256 === index.sha256, "EVENT_ORDER_HASH_MISMATCH", "events.json hash differs");
  assert(timelineAsset.event_order_index_sha256 === index.sha256, "EVENT_ORDER_HASH_MISMATCH", "timeline.json hash differs");
  assert(timelineAsset.event_graph_version === eventsAsset.event_graph_version, "EVENT_GRAPH_VERSION_MISMATCH", "timeline/events versions differ");
  return index;
}

function resolveCanonicalEvent(index, eventId, pointer) {
  assert(typeof eventId === "string" && EVENT_ID.test(eventId), "NON_CANONICAL_EVENT_REFERENCE", `${pointer}: ${eventId}`);
  if (index.forbiddenAliases.has(eventId)) {
    fail("EVENT_ALIAS_FORBIDDEN", `${pointer}: ${eventId} aliases ${index.forbiddenAliases.get(eventId)}`);
  }
  const entry = index.byId.get(eventId);
  assert(entry, "EVENT_REF_UNRESOLVED_OR_ALIAS", `${pointer}: ${eventId}`);
  return entry;
}

function cutoffHash(cutoff) {
  return hashJcs(cutoff);
}

function validateCutoff(cutoff, cutoffSha256, index, expectedChapter, expectedId) {
  assert(cutoff.comparison_policy === "INTEGER_STREAM_SEQ_INCLUSIVE_CUTOFF_V1", "CUTOFF_POLICY_MISMATCH", cutoff.cutoff_id);
  assert(cutoff.event_order_index_sha256 === index.sha256, "CUTOFF_ORDER_HASH_MISMATCH", cutoff.cutoff_id);
  assert(cutoff.cutoff_id === expectedId, "CUTOFF_ID_MISMATCH", `${cutoff.cutoff_id} != ${expectedId}`);
  if (expectedChapter !== null) {
    assert(cutoff.generation_chapter_id === expectedChapter, "CUTOFF_CHAPTER_MISMATCH", cutoff.cutoff_id);
  }
  assert(cutoffSha256 === cutoffHash(cutoff), "CUTOFF_HASH_MISMATCH", cutoff.cutoff_id);
  if (cutoff.visible_through_stream_seq === 0) {
    assert(cutoff.visible_through_event_id === null && cutoff.visible_through_corpus_unit_id === null,
      "ZERO_CUTOFF_IDENTITY_MISMATCH", cutoff.cutoff_id);
    return;
  }
  const entry = index.bySeq.get(cutoff.visible_through_stream_seq);
  assert(entry, "CUTOFF_STREAM_SEQ_UNRESOLVED", String(cutoff.visible_through_stream_seq));
  assert(entry.event_id === cutoff.visible_through_event_id, "CUTOFF_EVENT_ID_MISMATCH", cutoff.cutoff_id);
  assert(entry.corpus_unit_id === cutoff.visible_through_corpus_unit_id, "CUTOFF_CORPUS_UNIT_MISMATCH", cutoff.cutoff_id);
}

function chapterOrdinal(id) {
  const match = /^CH([0-9]{3})(?:\.S[0-9]{2})?$/.exec(id);
  assert(match, "INVALID_CHAPTER_ID", String(id));
  return Number(match[1]);
}

function latestEntryMatching(index, predicate) {
  const matching = index.entries.filter(predicate);
  return matching.length === 0 ? null : matching.at(-1);
}

function validateGenerationCutoffPosition(cutoff, index) {
  const generationChapter = chapterOrdinal(cutoff.generation_chapter_id);
  const expected = latestEntryMatching(index,
    (entry) => chapterOrdinal(entry.corpus_unit_id) < generationChapter);
  if (expected === null) {
    assert(generationChapter === 1 && cutoff.visible_through_stream_seq === 0,
      "GENERATION_CUTOFF_NOT_EXACT_PRIOR_PREFIX", cutoff.cutoff_id);
    return;
  }
  assert(cutoff.visible_through_stream_seq === expected.stream_seq,
    "GENERATION_CUTOFF_NOT_EXACT_PRIOR_PREFIX", `${cutoff.cutoff_id}: expected ${expected.event_id}`);
}

function validateQueryCutoffPosition(cutoff, index) {
  const queryAfterChapter = chapterOrdinal(cutoff.query_occurs_after_chapter_id);
  const expected = latestEntryMatching(index,
    (entry) => chapterOrdinal(entry.corpus_unit_id) <= queryAfterChapter);
  assert(expected, "QUERY_CUTOFF_EMPTY_PREFIX", cutoff.cutoff_id);
  assert(cutoff.visible_through_stream_seq === expected.stream_seq,
    "QUERY_CUTOFF_NOT_EXACT_PREFIX", `${cutoff.cutoff_id}: expected ${expected.event_id}`);
}

function visiblePayload(bundle) {
  return {
    local_entity_state: bundle.local_entity_state,
    relationship_state_snapshot: bundle.relationship_state_snapshot,
    unresolved_open_thread_ledger: bundle.unresolved_open_thread_ledger,
    necessary_prior_summary: bundle.necessary_prior_summary,
    relevant_prior_snippets: bundle.relevant_prior_snippets,
  };
}

function appendSourceOccurrences(records, root, occurrences) {
  records.forEach((record, recordIndex) => {
    const ids = record.source_event_ids ?? [];
    unique(ids, "DUPLICATE_VISIBLE_EVENT_REFERENCE", `${root}/${recordIndex}/source_event_ids`);
    ids.forEach((eventId, eventIndex) => occurrences.push({
      json_pointer: `/${root}/${recordIndex}/source_event_ids/${eventIndex}`,
      event_id: eventId,
    }));
  });
}

export function deriveVisibleEventReferenceProjection(bundle) {
  const occurrences = [];
  for (const root of VISIBLE_ROOTS) appendSourceOccurrences(bundle[root] ?? [], root, occurrences);
  const summaryIds = bundle.necessary_prior_summary?.source_event_ids ?? [];
  unique(summaryIds, "DUPLICATE_VISIBLE_EVENT_REFERENCE", "/necessary_prior_summary/source_event_ids");
  summaryIds.forEach((eventId, index) => occurrences.push({
    json_pointer: `/necessary_prior_summary/source_event_ids/${index}`,
    event_id: eventId,
  }));
  appendSourceOccurrences(bundle.relevant_prior_snippets ?? [], "relevant_prior_snippets", occurrences);
  const canonicalEventIds = [...new Set(occurrences.map((item) => item.event_id))].sort();
  return {
    schema_version: "rc-synth-long-visible-event-reference-projection/1.0.0",
    derivation: "FIXED_VISIBLE_SOURCE_EVENT_PATHS_WITH_JSON_POINTERS_V1",
    event_alias_policy: "CANONICAL_EVENT_ID_ONLY_ALIASES_FORBIDDEN",
    visible_payload_sha256: hashJcs(visiblePayload(bundle)),
    reference_occurrences: occurrences,
    canonical_event_ids: canonicalEventIds,
    canonical_event_ids_sha256: hashJcs(canonicalEventIds),
  };
}

export function deriveFutureProjection(eventIds) {
  const ids = [...eventIds].sort();
  unique(ids, "DUPLICATE_FUTURE_EVENT_REFERENCE", "opaque future IDs");
  return {
    schema_version: "rc-synth-long-future-constraint-projection/1.0.0",
    derivation: "OPAQUE_EVENT_IDS_TO_GENERIC_PROHIBITIONS_V1",
    opaque_future_event_ids: ids,
    source_future_event_ids_sha256: hashJcs(ids),
    prohibition_rules: ids.flatMap((eventId) => FUTURE_CODES.map((prohibitionCode) => ({
      opaque_future_event_id: eventId,
      prohibition_code: prohibitionCode,
    }))),
  };
}

function assertEqualJcs(actual, expected, code, label) {
  assert(canonicalValue(actual) === canonicalValue(expected), code, label);
}

function eventTokens(value, pointer = "", output = []) {
  if (typeof value === "string") {
    for (const token of value.match(EVENT_TOKEN) ?? []) output.push({ pointer, event_id: token });
  } else if (Array.isArray(value)) {
    value.forEach((item, index) => eventTokens(item, `${pointer}/${index}`, output));
  } else if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) eventTokens(item, `${pointer}/${key}`, output);
  }
  return output;
}

function allowedContinuityTokenPointers(bundle, visibleProjection) {
  const allowed = new Map();
  if (bundle.cutoff.visible_through_event_id !== null) {
    allowed.set("/cutoff/visible_through_event_id", bundle.cutoff.visible_through_event_id);
  }
  visibleProjection.reference_occurrences.forEach((item) => allowed.set(item.json_pointer, item.event_id));
  visibleProjection.reference_occurrences.forEach((item, index) => {
    allowed.set(`/visible_event_reference_projection/reference_occurrences/${index}/event_id`, item.event_id);
  });
  visibleProjection.canonical_event_ids.forEach((eventId, index) => {
    allowed.set(`/visible_event_reference_projection/canonical_event_ids/${index}`, eventId);
  });
  const future = bundle.future_negative_constraints.projection;
  future.opaque_future_event_ids.forEach((eventId, index) => {
    allowed.set(`/future_negative_constraints/projection/opaque_future_event_ids/${index}`, eventId);
  });
  future.prohibition_rules.forEach((rule, index) => {
    allowed.set(`/future_negative_constraints/projection/prohibition_rules/${index}/opaque_future_event_id`, rule.opaque_future_event_id);
  });
  return allowed;
}

export function validateContinuityBoundary(bundle, index) {
  assert(bundle.schema_version === "rc-synth-long-continuity-bundle/1.2.0", "CONTINUITY_SCHEMA_VERSION_MISMATCH", String(bundle.schema_version));
  assert(bundle.cutoff.event_graph_version === index.eventGraphVersion, "EVENT_GRAPH_VERSION_MISMATCH", bundle.cutoff.cutoff_id);
  assert(bundle.cutoff.timeline_version === index.timelineVersion, "TIMELINE_VERSION_MISMATCH", bundle.cutoff.cutoff_id);
  validateCutoff(bundle.cutoff, bundle.cutoff_sha256, index, bundle.chapter_id, `GCUT-${bundle.chapter_id}`);
  validateGenerationCutoffPosition(bundle.cutoff, index);

  const visibleProjection = deriveVisibleEventReferenceProjection(bundle);
  assertEqualJcs(bundle.visible_event_reference_projection, visibleProjection,
    "VISIBLE_REFERENCE_PROJECTION_MISMATCH", bundle.chapter_id);
  assert(bundle.visible_event_reference_projection_sha256 === hashJcs(visibleProjection),
    "VISIBLE_REFERENCE_PROJECTION_HASH_MISMATCH", bundle.chapter_id);

  const declaredFuture = bundle.future_negative_constraints.projection;
  const expectedFuture = deriveFutureProjection(declaredFuture.opaque_future_event_ids);
  assertEqualJcs(declaredFuture, expectedFuture, "FUTURE_REFERENCE_PROJECTION_MISMATCH", bundle.chapter_id);
  assert(bundle.future_negative_constraints.projection_sha256 === hashJcs(expectedFuture),
    "FUTURE_REFERENCE_PROJECTION_HASH_MISMATCH", bundle.chapter_id);

  const visibleEntries = visibleProjection.canonical_event_ids.map((eventId) =>
    resolveCanonicalEvent(index, eventId, "/visible_event_reference_projection/canonical_event_ids"));
  const futureEntries = expectedFuture.opaque_future_event_ids.map((eventId) =>
    resolveCanonicalEvent(index, eventId, "/future_negative_constraints/projection/opaque_future_event_ids"));
  const futureSet = new Set(futureEntries.map((entry) => entry.event_id));
  const intersection = visibleEntries.map((entry) => entry.event_id).filter((eventId) => futureSet.has(eventId));
  assert(intersection.length === 0, "VISIBLE_FUTURE_EVENT_INTERSECTION", intersection.join(","));

  for (const entry of visibleEntries) {
    assert(entry.stream_seq <= bundle.cutoff.visible_through_stream_seq,
      "VISIBLE_EVENT_AFTER_CUTOFF", `${entry.event_id}@${entry.stream_seq}`);
    assert(chapterOrdinal(entry.corpus_unit_id) < chapterOrdinal(bundle.chapter_id),
      "VISIBLE_EVENT_NOT_IN_PRIOR_CHAPTER", `${entry.event_id}@${entry.corpus_unit_id}`);
  }
  for (const entry of futureEntries) {
    assert(entry.stream_seq > bundle.cutoff.visible_through_stream_seq,
      "FUTURE_EVENT_AT_OR_BEFORE_CUTOFF", `${entry.event_id}@${entry.stream_seq}`);
    assert(chapterOrdinal(entry.corpus_unit_id) > chapterOrdinal(bundle.chapter_id),
      "FUTURE_EVENT_NOT_AFTER_GENERATION_CHAPTER", `${entry.event_id}@${entry.corpus_unit_id}`);
  }
  for (const [indexNumber, snippet] of (bundle.relevant_prior_snippets ?? []).entries()) {
    const maxSeq = Math.max(...snippet.source_event_ids.map((eventId) =>
      resolveCanonicalEvent(index, eventId, `/relevant_prior_snippets/${indexNumber}/source_event_ids`).stream_seq));
    assert(snippet.latest_visible_stream_seq === maxSeq,
      "SNIPPET_LATEST_STREAM_SEQ_MISMATCH", `/relevant_prior_snippets/${indexNumber}`);
  }

  const allowed = allowedContinuityTokenPointers(bundle, visibleProjection);
  for (const token of eventTokens(bundle)) {
    assert(allowed.get(token.pointer) === token.event_id,
      "UNCLASSIFIED_OR_ALIASED_EVENT_TOKEN", `${token.pointer}: ${token.event_id}`);
  }
  return { visible_event_ids: visibleEntries.map((entry) => entry.event_id), future_event_ids: [...futureSet] };
}

function listEntries(index, ids, pointer) {
  const resolved = ids.map((eventId) => resolveCanonicalEvent(index, eventId, pointer));
  return [...new Map(resolved.map((entry) => [entry.event_id, entry])).values()];
}

export function validateQueryPlanBoundaries(queryPlanAsset, index) {
  assert(queryPlanAsset.event_graph_version === index.eventGraphVersion, "EVENT_GRAPH_VERSION_MISMATCH", "query-plan");
  assert(queryPlanAsset.timeline_version === index.timelineVersion, "TIMELINE_VERSION_MISMATCH", "query-plan");
  assert(queryPlanAsset.event_order_index_sha256 === index.sha256, "EVENT_ORDER_HASH_MISMATCH", "query-plan");
  for (const plan of queryPlanAsset.query_plans) {
    assert(plan.cutoff.event_order_index_sha256 === index.sha256, "CUTOFF_ORDER_HASH_MISMATCH", plan.query_id);
    validateCutoff(plan.cutoff, plan.cutoff_sha256, index, null, `QCUT-${plan.query_id}`);
    validateQueryCutoffPosition(plan.cutoff, index);
    const visibleIds = [
      ...plan.formation_target_event_ids,
      ...plan.required_evidence_sets.flatMap((set) => set.event_ids),
      ...plan.forbidden_evidence.filter((item) => item.reason !== "FUTURE").map((item) => item.event_id),
    ];
    const futureIds = [
      ...plan.explicit_future_event_ids,
      ...plan.forbidden_evidence.filter((item) => item.reason === "FUTURE").map((item) => item.event_id),
    ];
    const visibleEntries = listEntries(index, visibleIds, `${plan.query_id}/visible`);
    const futureEntries = listEntries(index, futureIds, `${plan.query_id}/future`);
    const futureSet = new Set(futureEntries.map((entry) => entry.event_id));
    const intersection = visibleEntries.map((entry) => entry.event_id).filter((eventId) => futureSet.has(eventId));
    assert(intersection.length === 0, "QUERY_VISIBLE_FUTURE_EVENT_INTERSECTION", `${plan.query_id}:${intersection.join(",")}`);
    for (const entry of visibleEntries) {
      assert(entry.stream_seq <= plan.cutoff.visible_through_stream_seq,
        "QUERY_VISIBLE_EVENT_AFTER_CUTOFF", `${plan.query_id}:${entry.event_id}`);
    }
    for (const entry of futureEntries) {
      assert(entry.stream_seq > plan.cutoff.visible_through_stream_seq,
        "QUERY_FUTURE_EVENT_AT_OR_BEFORE_CUTOFF", `${plan.query_id}:${entry.event_id}`);
    }
    const explicitFuture = new Set(plan.explicit_future_event_ids);
    for (const item of plan.forbidden_evidence.filter((entry) => entry.reason === "FUTURE")) {
      assert(explicitFuture.has(item.event_id), "FUTURE_FORBIDDEN_NOT_EXPLICIT", `${plan.query_id}:${item.event_id}`);
    }
  }
  return { query_count: queryPlanAsset.query_plans.length };
}

function finalizeBundle(bundle) {
  bundle.cutoff_sha256 = cutoffHash(bundle.cutoff);
  bundle.visible_event_reference_projection = deriveVisibleEventReferenceProjection(bundle);
  bundle.visible_event_reference_projection_sha256 = hashJcs(bundle.visible_event_reference_projection);
  bundle.future_negative_constraints.projection = deriveFutureProjection(
    bundle.future_negative_constraints.projection.opaque_future_event_ids,
  );
  bundle.future_negative_constraints.projection_sha256 = hashJcs(bundle.future_negative_constraints.projection);
  return bundle;
}

function clone(value) {
  return structuredClone(value);
}

function fixtureBase(fixture, index) {
  const zeroHash = "0".repeat(64);
  const cutoffEntry = index.byId.get(fixture.base.cutoff_event_id);
  assert(cutoffEntry, "FIXTURE_CUTOFF_EVENT_MISSING", fixture.base.cutoff_event_id);
  const bundle = {
    schema_version: "rc-synth-long-continuity-bundle/1.2.0",
    dataset_id: "rc-synth-long-zh-v1.0.0",
    corpus_version: "corpus/fixture",
    bundle_version: "bundle/fixture",
    canonical_json_policy: "RFC8785_JCS_VALUE_UTF8_NO_TERMINATOR_JSON_FILE_LF_V1",
    chapter_id: fixture.base.chapter_id,
    cutoff: {
      schema_version: "rc-synth-long-generation-cutoff/1.0.0",
      cutoff_id: `GCUT-${fixture.base.chapter_id}`,
      comparison_policy: "INTEGER_STREAM_SEQ_INCLUSIVE_CUTOFF_V1",
      event_graph_version: index.eventGraphVersion,
      timeline_version: index.timelineVersion,
      event_order_index_sha256: index.sha256,
      generation_chapter_id: fixture.base.chapter_id,
      visible_through_stream_seq: cutoffEntry.stream_seq,
      visible_through_event_id: cutoffEntry.event_id,
      visible_through_corpus_unit_id: cutoffEntry.corpus_unit_id,
    },
    cutoff_sha256: zeroHash,
    immutable_input_hashes: { world_bible: zeroHash, style_bible: zeroHash, alias_name_registry: zeroHash, chapter_event_plan: zeroHash },
    local_entity_state: [{ entity_id: "ENT-0001", state_ref_ids: ["STATE-0001"], snapshot_text: "cutoff-visible state", source_event_ids: [fixture.base.visible_event_id] }],
    relationship_state_snapshot: [],
    unresolved_open_thread_ledger: [{ thread_id: "THREAD-0001", thread_kind: "CLUE", safe_summary: "cutoff-visible clue", source_event_ids: [fixture.base.visible_event_id] }],
    necessary_prior_summary: { text: "cutoff-visible summary", text_sha256: zeroHash, source_event_ids: [fixture.base.visible_event_id], token_estimate: 3 },
    relevant_prior_snippets: [],
    visible_event_reference_projection: {},
    visible_event_reference_projection_sha256: zeroHash,
    future_negative_constraints: { projection: { opaque_future_event_ids: [fixture.base.future_event_id] }, projection_sha256: zeroHash },
    budget: { maximum_input_tokens: 1000, prior_summary_tokens: 3, prior_snippet_count: 0 },
    forbidden_inputs: ["PRIOR_FULL_CORPUS", "FUTURE_CHAPTER_PLAN", "QUERY_PLAN", "QUERY_ORACLE", "EVALUATOR_CONTROL_GOLD"],
  };
  bundle.necessary_prior_summary.text_sha256 = sha256(Buffer.from(bundle.necessary_prior_summary.text, "utf8"));
  return finalizeBundle(bundle);
}

function applyFixtureMutation(base, mutation) {
  const bundle = clone(base);
  if (mutation.kind === "NONE") return finalizeBundle(bundle);
  if (mutation.kind === "ADD_EVENT_TO_LOCAL_STATE") {
    bundle.local_entity_state[0].source_event_ids.push(mutation.event_id);
  } else if (mutation.kind === "ADD_ALIAS_TO_NESTED_REPEATED_VISIBLE_LISTS") {
    bundle.unresolved_open_thread_ledger[0].source_event_ids.push(mutation.alias_event_id);
    bundle.necessary_prior_summary.source_event_ids.push(mutation.alias_event_id);
  } else {
    fail("UNKNOWN_FIXTURE_MUTATION", mutation.kind);
  }
  return finalizeBundle(bundle);
}

export function materializeFixtureCases(fixture) {
  const index = createEventOrderIndex(fixture.event_order_index, {
    eventGraphVersion: fixture.event_graph_version,
    timelineVersion: fixture.timeline_version,
    forbiddenAliases: fixture.forbidden_event_aliases,
  });
  const base = fixtureBase(fixture, index);
  return {
    index,
    cases: fixture.cases.map((testCase) => ({
      ...testCase,
      candidate: applyFixtureMutation(base, testCase.mutation),
    })),
  };
}

export function runFixtureFile(fixture) {
  const materialized = materializeFixtureCases(fixture);
  const results = [];
  for (const testCase of materialized.cases) {
    let errorCode = null;
    try {
      validateContinuityBoundary(testCase.candidate, materialized.index);
    } catch (error) {
      if (!(error instanceof BoundaryValidationError)) throw error;
      errorCode = error.code;
    }
    const valid = errorCode === null;
    assert(valid === testCase.expected_valid, "FIXTURE_EXPECTATION_MISMATCH", testCase.case_id);
    assert(errorCode === (testCase.expected_error_code ?? null), "FIXTURE_ERROR_CODE_MISMATCH",
      `${testCase.case_id}: ${errorCode} != ${testCase.expected_error_code ?? null}`);
    results.push({ case_id: testCase.case_id, valid, error_code: errorCode });
  }
  return results;
}

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    assert(key?.startsWith("--") && argv[index + 1], "INVALID_ARGUMENTS", argv.join(" "));
    args[key.slice(2)] = argv[index + 1];
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args["self-test"]) {
    const fixture = readJson(args["self-test"]);
    console.log(JSON.stringify({ validator_version: VALIDATOR_VERSION, fixture_schema_version: fixture.schema_version, results: runFixtureFile(fixture) }, null, 2));
    return;
  }
  assert(args.events && args.timeline && (args.continuity || args["query-plan"]), "INVALID_ARGUMENTS",
    "use --events FILE --timeline FILE with --continuity FILE and/or --query-plan FILE");
  const aliases = args["event-aliases"] ? readJson(args["event-aliases"]) : {};
  const index = buildEventOrderIndex(readJson(args.events), readJson(args.timeline), aliases);
  const result = { event_order_index_sha256: index.sha256 };
  if (args.continuity) result.continuity = validateContinuityBoundary(readJson(args.continuity), index);
  if (args["query-plan"]) result.query_plan = validateQueryPlanBoundaries(readJson(args["query-plan"]), index);
  console.log(JSON.stringify(result, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
