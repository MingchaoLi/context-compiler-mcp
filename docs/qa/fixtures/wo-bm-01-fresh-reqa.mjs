import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const CANDIDATE = "f1b183e309ae3c1ac502d6b0eca704f9f9c4d5c0";
const BASELINE = "d18e4d48717030f441f3a2e17e5c786cfa00c699";
const AJV_ROOT = process.env.WO_BM01_AJV_ROOT;
const require = createRequire(import.meta.url);

function loadDependency(name) {
  if (AJV_ROOT) {
    return require(join(AJV_ROOT, "node_modules", name));
  }
  return require(name);
}

const Ajv2020 = loadDependency("ajv/dist/2020").default;
const addFormats = loadDependency("ajv-formats");

function fail(message) {
  throw new Error(message);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function approx(actual, expected, label, tolerance = 1e-9) {
  assert(Math.abs(actual - expected) <= tolerance, `${label}: ${actual} != ${expected}`);
}

function json(path) {
  return JSON.parse(readFileSync(join(ROOT, path), "utf8"));
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

// This covers the I-JSON values used by the QA fixtures. RFC 8785 remains the
// normative production algorithm; the fixture deliberately avoids numeric edge cases.
function jcs(value) {
  if (value === null || typeof value === "boolean" || typeof value === "string") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    assert(Number.isFinite(value), "non-finite number is not I-JSON");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(jcs).join(",")}]`;
  assert(typeof value === "object", `unsupported JCS value: ${typeof value}`);
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${jcs(value[key])}`).join(",")}}`;
}

function frameSegment(tag, payload) {
  const header = Buffer.alloc(9);
  header.writeUInt8(tag, 0);
  header.writeBigUInt64BE(BigInt(payload.length), 1);
  return Buffer.concat([header, payload]);
}

function requestFrame(metadata, prompt, envelope, prefix) {
  return Buffer.concat([
    Buffer.from("5243515346310000", "hex"),
    frameSegment(1, Buffer.from(jcs(metadata), "utf8")),
    frameSegment(2, prompt),
    frameSegment(3, Buffer.from(jcs(envelope), "utf8")),
    frameSegment(4, prefix),
    Buffer.from([0]),
  ]);
}

function parseRequestFrame(frame) {
  assert(frame.subarray(0, 8).toString("hex") === "5243515346310000", "bad frame magic");
  let offset = 8;
  const segments = [];
  for (const expectedTag of [1, 2, 3, 4]) {
    const tag = frame.readUInt8(offset);
    const length = Number(frame.readBigUInt64BE(offset + 1));
    assert(tag === expectedTag, `frame tag ${tag} != ${expectedTag}`);
    offset += 9;
    segments.push(frame.subarray(offset, offset + length));
    offset += length;
  }
  assert(offset === frame.length - 1 && frame.readUInt8(offset) === 0, "bad frame final boundary");
  return segments;
}

function clone(value) {
  return structuredClone(value);
}

function walkSchema(node, pointer, violations) {
  if (!node || typeof node !== "object") return;
  if (node.type === "object" && node.additionalProperties !== false) {
    violations.push(pointer);
  }
  if (Array.isArray(node)) {
    node.forEach((child, index) => walkSchema(child, `${pointer}/${index}`, violations));
    return;
  }
  for (const [key, child] of Object.entries(node)) {
    walkSchema(child, `${pointer}/${key}`, violations);
  }
}

const schemaDir = join(ROOT, "evaluation/ripplecontext-long-v1/spec/schemas");
const schemaPaths = readdirSync(schemaDir)
  .filter((name) => name.endsWith(".schema.json"))
  .sort()
  .map((name) => relative(ROOT, join(schemaDir, name)));
const planPaths = [
  "evaluation/ripplecontext-long-v1/spec/case-taxonomy.json",
  "evaluation/ripplecontext-long-v1/spec/chapter-plan.json",
  "evaluation/ripplecontext-long-v1/spec/cost-plan.json",
  "evaluation/ripplecontext-long-v1/spec/stage-plan.json",
];

assert(schemaPaths.length === 8, `expected 8 schemas, got ${schemaPaths.length}`);
for (const path of [...schemaPaths, ...planPaths]) json(path);

const ajv = new Ajv2020({ strict: true, allErrors: true, validateFormats: true });
addFormats(ajv);
const schemas = new Map();
for (const path of schemaPaths) {
  const schema = json(path);
  assert(schema.$schema === "https://json-schema.org/draft/2020-12/schema", `${path}: wrong draft`);
  const violations = [];
  walkSchema(schema, "#", violations);
  assert(violations.length === 0, `${path}: open object schemas at ${violations.join(", ")}`);
  ajv.addSchema(schema);
  assert(ajv.getSchema(schema.$id), `${path}: strict compile did not register schema`);
  schemas.set(path, schema);
}

const taxonomy = json(planPaths[0]);
const chapterPlan = json(planPaths[1]);
const costPlan = json(planPaths[2]);
const stagePlan = json(planPaths[3]);

assert(taxonomy.case_families.length === 21, "case-family count");
assert(taxonomy.failure_families.length === 15, "failure-family count");
const failureIds = new Set(taxonomy.failure_families.map((item) => item.id));
for (const family of taxonomy.case_families) {
  assert(family.minimum_event_count > 0, `${family.id}: zero event denominator`);
  assert(family.minimum_query_count > 0, `${family.id}: zero query denominator`);
  for (const id of family.failure_family_ids) assert(failureIds.has(id), `${family.id}: missing ${id}`);
}

assert(chapterPlan.chapters.length === 40, "chapter count");
assert(chapterPlan.query_cutoff_groups.length === 12, "cutoff-group count");
assert(chapterPlan.chapters.reduce((sum, item) => sum + item.target_characters, 0) === 260000, "target chars");
assert(chapterPlan.chapters.reduce((sum, item) => sum + item.minimum_characters, 0) === 220000, "min chars");
assert(chapterPlan.chapters.reduce((sum, item) => sum + item.maximum_characters, 0) === 300000, "max chars");
assert(chapterPlan.query_cutoff_groups.reduce((sum, item) => sum + item.planned_query_count, 0) === 72, "query count");
assert(chapterPlan.chapters.filter((item) => item.generation_reasoning === "low").length === 28, "low chapters");
assert(chapterPlan.chapters.filter((item) => item.generation_reasoning === "medium").length === 12, "medium chapters");
for (const slot of chapterPlan.long_range_slots) {
  const anchor = Number(slot.anchor_chapter_id.slice(2));
  const revival = Number(slot.revival_chapter_id.slice(2));
  assert(revival - anchor === slot.minimum_gap && slot.minimum_gap >= 12, `${slot.slot_id}: gap mismatch`);
}

assert(stagePlan.stages.length === 9, "stage count");
assert(stagePlan.stages.map((item) => item.ordinal).join(",") === "1,2,3,4,5,6,7,8,9", "stage ordinals");
assert(stagePlan.stages[2].stage === "GOLD" && stagePlan.stages[3].stage === "GENERATION", "Gold-before-prose order");
assert(stagePlan.stages[4].stage === "SURFACE_MAPPING_BASE_VALIDATION" && stagePlan.stages[5].stage === "QUERY_SURFACING", "surface-before-query order");
assert(stagePlan.generation_repair_policy.maximum_mechanical_repair_attempts_per_chapter === 1, "repair cap");
assert(stagePlan.generation_repair_policy.original_failed_output_eligible === false, "failed output eligibility");
assert(stagePlan.generation_repair_policy.candidate_selection_allowed === false, "candidate selection");
assert(stagePlan.generation_repair_policy.semantic_inconsistency_action.includes("FRESH_REGENERATE"), "semantic fresh regeneration");
for (const stage of stagePlan.stages) {
  if ("fallback" in stage) assert(stage.fallback === "NONE_STOP_AND_REPORT", `${stage.stage}: fallback drift`);
}
const solCalls = costPlan.stage_estimates
  .filter((item) => item.model === "gpt-5.6-sol")
  .reduce((sum, item) => sum + (item.planned_calls ?? 0), 0);
assert(solCalls === 22 && costPlan.totals.planned_sol_calls === 22, "Sol call count");
assert(costPlan.totals.planned_terra_initial_calls === 40, "Terra initial count");
assert(costPlan.totals.planned_terra_repair_calls_default === 0, "default repair count");
assert(costPlan.totals.planned_luna_calls_default === 0, "default Luna count");

const pricing = costPlan.pricing_reference;
assert(pricing.accessed_at === "2026-08-27", "price access date not frozen");
assert(pricing.models["gpt-5.6-sol"].input === 4 && pricing.models["gpt-5.6-sol"].output === 20, "Sol rates");
const longTier = pricing.gpt_5_6_sol_long_context_tier;
assert(longTier.trigger === "REQUEST_INPUT_TOKENS_GREATER_THAN_272000", "threshold rule");
assert(longTier.scope === "ENTIRE_REQUEST", "long-context scope");
assert(longTier.input_price_multiplier === 2 && longTier.output_price_multiplier === 1.5, "tier multipliers");
assert(longTier.threshold_includes_all_request_input === true, "threshold input scope");
assert(costPlan.prohibited_cost_behaviors.includes("gpt-5.6-terra_to_gpt-5.6-sol_automatic_upgrade"), "Terra auto-upgrade not forbidden");
assert(costPlan.prohibited_cost_behaviors.includes("gpt-5.6-luna_to_gpt-5.6-sol_automatic_upgrade"), "Luna auto-upgrade not forbidden");

const requests = costPlan.query_surfacing_request_estimates.requests;
assert(requests.length === 12, "query-surfacing request count");
let requestInputLow = 0;
let requestInputHigh = 0;
let requestCostLow = 0;
let requestCostHigh = 0;
let longHighCount = 0;
for (const request of requests) {
  const expectedLowTier = request.input_tokens_low > 272000 ? "LONG_CONTEXT" : "BASE";
  const expectedHighTier = request.input_tokens_high > 272000 ? "LONG_CONTEXT" : "BASE";
  assert(request.tier_low === expectedLowTier, `${request.cutoff_group_id}: low tier`);
  assert(request.tier_high === expectedHighTier, `${request.cutoff_group_id}: high tier`);
  if (expectedHighTier === "LONG_CONTEXT") longHighCount += 1;
  const lowInputMultiplier = request.tier_low === "LONG_CONTEXT" ? 2 : 1;
  const lowOutputMultiplier = request.tier_low === "LONG_CONTEXT" ? 1.5 : 1;
  const highInputMultiplier = request.tier_high === "LONG_CONTEXT" ? 2 : 1;
  const highOutputMultiplier = request.tier_high === "LONG_CONTEXT" ? 1.5 : 1;
  const expectedLow = (request.input_tokens_low * 4 * lowInputMultiplier + 1500 * 20 * lowOutputMultiplier) / 1_000_000;
  const expectedHigh = (request.input_tokens_high * 4 * highInputMultiplier + 2500 * 20 * highOutputMultiplier) / 1_000_000;
  approx(request.cost_low, expectedLow, `${request.cutoff_group_id}: low cost`);
  approx(request.cost_high, expectedHigh, `${request.cutoff_group_id}: high cost`);
  requestInputLow += request.input_tokens_low;
  requestInputHigh += request.input_tokens_high;
  requestCostLow += request.cost_low;
  requestCostHigh += request.cost_high;
}
assert(longHighCount === 5, "high-bound long-context request count");
assert(requests.filter((item) => item.tier_high === "LONG_CONTEXT").map((item) => item.cutoff_group_id).join(",") === "QCG-08,QCG-09,QCG-10,QCG-11,QCG-12", "long-context groups");
assert(requestInputLow === 2200000 && requestInputHigh === 3200000, "query-surfacing input sums");
approx(requestCostLow, 9.16, "query-surfacing low total");
approx(requestCostHigh, 21.551, "query-surfacing high total");

const stageCostLow = costPlan.stage_estimates.reduce((sum, item) => sum + item.list_price_cost_low, 0);
const stageCostHigh = costPlan.stage_estimates.reduce((sum, item) => sum + item.list_price_cost_high, 0);
approx(stageCostLow, 16.98, "generation total low");
approx(stageCostHigh, 32.491, "generation total high");
approx(costPlan.totals.reserved_cost_low, stageCostLow * 1.25, "reserve low");
approx(costPlan.totals.reserved_cost_high, stageCostHigh * 1.25, "reserve high");
approx(costPlan.mechanical_repair_contingency.maximum_additional_list_price_cost_low, 40 * 0.116, "repair low");
approx(costPlan.mechanical_repair_contingency.maximum_additional_list_price_cost_high, 40 * 0.154, "repair high");

const zeroHash = "0".repeat(64);
const brief = {
  brief_version: "brief/1",
  surface_language: "zh-CN",
  answer_neutral: true,
  subject_refs: [{
    entity_id: "ENT-0001",
    role: "SUBJECT",
    label_kind: "CANONICAL_NAME",
    surface_label: "甲站",
    normalized_surface_label_sha256: zeroHash,
  }],
  information_need_kind: "STATUS",
  focus_description: "询问该主体在可见截止点的状态",
  relationship_direction: "NOT_APPLICABLE",
  as_of_perspective: "CURRENT_AT_VISIBLE_CUTOFF",
  output_shape: { form: "SINGLE_FREE_TEXT", requested_components: ["STATUS_FINDING"], maximum_subquestions: 1 },
};
const envelope = {
  schema_version: "rc-synth-long-query-surface-envelope/1.1.0",
  canonical_json_policy: "RFC8785_JCS_VALUE_UTF8_NO_TERMINATOR_JSON_FILE_LF_V1",
  brief_order: "ASCII_QUERY_ID_ASCENDING",
  dataset_id: "rc-synth-long-zh-v1.0.0",
  query_plan_version: "query-plan/1",
  cutoff_group_id: "QCG-01",
  visible_prefix_sha256: zeroHash,
  raw_query_plan_included: false,
  evaluator_control_gold_included: false,
  briefs: [{ query_id: "Q-0001", query_surface_brief: brief, query_surface_brief_sha256: sha256(Buffer.from(jcs(brief))) }],
};
const queryPlanSchema = schemas.get("evaluation/ripplecontext-long-v1/spec/schemas/query-plan.schema.json");
const validateEnvelope = ajv.getSchema(`${queryPlanSchema.$id}#/$defs/querySurfaceEnvelope`);
assert(validateEnvelope(envelope), `valid safe envelope rejected: ${ajv.errorsText(validateEnvelope.errors)}`);
const leakedEnvelope = clone(envelope);
leakedEnvelope.briefs[0].expected_action = "ANSWER";
assert(!validateEnvelope(leakedEnvelope), "safe envelope accepted expected_action injection");
const leakedBriefEnvelope = clone(envelope);
leakedBriefEnvelope.briefs[0].query_surface_brief.current_truth = "负责人已辞职";
assert(!validateEnvelope(leakedBriefEnvelope), "safe brief accepted current_truth injection");

const futureIds = ["EV-000999"];
const futureProjection = {
  schema_version: "rc-synth-long-future-constraint-projection/1.0.0",
  derivation: "OPAQUE_EVENT_IDS_TO_GENERIC_PROHIBITIONS_V1",
  opaque_future_event_ids: futureIds,
  source_future_event_ids_sha256: sha256(Buffer.from(jcs(futureIds))),
  prohibition_rules: [
    { opaque_future_event_id: "EV-000999", prohibition_code: "OMIT_OPAQUE_EVENT" },
    { opaque_future_event_id: "EV-000999", prohibition_code: "NO_FORWARD_REFERENCE" },
    { opaque_future_event_id: "EV-000999", prohibition_code: "PRESERVE_CUTOFF_STATE" },
  ],
};
const continuity = {
  schema_version: "rc-synth-long-continuity-bundle/1.1.0",
  dataset_id: "rc-synth-long-zh-v1.0.0",
  corpus_version: "corpus/1",
  bundle_version: "bundle/1",
  canonical_json_policy: "RFC8785_JCS_VALUE_UTF8_NO_TERMINATOR_JSON_FILE_LF_V1",
  chapter_id: "CH001",
  immutable_input_hashes: { world_bible: zeroHash, style_bible: zeroHash, alias_name_registry: zeroHash, chapter_event_plan: zeroHash },
  local_entity_state: [],
  relationship_state_snapshot: [],
  unresolved_open_thread_ledger: [],
  necessary_prior_summary: { text: "", text_sha256: sha256(Buffer.alloc(0)), source_event_ids: [], token_estimate: 0 },
  relevant_prior_snippets: [],
  future_negative_constraints: { projection: futureProjection, projection_sha256: sha256(Buffer.from(jcs(futureProjection))) },
  budget: { maximum_input_tokens: 1000, prior_summary_tokens: 0, prior_snippet_count: 0 },
  forbidden_inputs: ["PRIOR_FULL_CORPUS", "FUTURE_CHAPTER_PLAN", "QUERY_PLAN", "QUERY_ORACLE", "EVALUATOR_CONTROL_GOLD"],
};
const continuitySchema = schemas.get("evaluation/ripplecontext-long-v1/spec/schemas/continuity-bundle.schema.json");
const validateContinuity = ajv.getSchema(continuitySchema.$id);
assert(validateContinuity(continuity), `valid continuity fixture rejected: ${ajv.errorsText(validateContinuity.errors)}`);
const futureFactInjection = clone(continuity);
futureFactInjection.future_negative_constraints.projection.future_fact = "负责人将在后续辞职";
assert(!validateContinuity(futureFactInjection), "future projection accepted future_fact injection");
const futureRuleInjection = clone(continuity);
futureRuleInjection.future_negative_constraints.projection.prohibition_rules[0].future_fact = "负责人将在后续辞职";
assert(!validateContinuity(futureRuleInjection), "future rule accepted future_fact injection");

// Fresh attack: the same Event can be declared opaque/future in the closed
// projection and simultaneously be admitted as a current structured source.
// This needs no prose interpretation and should be mechanically impossible.
const structuredFutureLeak = clone(continuity);
structuredFutureLeak.local_entity_state.push({
  entity_id: "ENT-0001",
  state_ref_ids: ["STATE-0001"],
  snapshot_text: "负责人将在后续辞职",
  source_event_ids: ["EV-000999"],
});
const structuredFutureLeakAccepted = validateContinuity(structuredFutureLeak);

const jcsFixture = { z: "甲", a: [true, null, 1, "Ａ\r\nx"], "€": "€" };
const expectedJcs = "{\"a\":[true,null,1,\"Ａ\\r\\nx\"],\"z\":\"甲\",\"€\":\"€\"}";
assert(jcs(jcsFixture) === expectedJcs, "JCS fixture mismatch");
assert(jcs(JSON.parse("{\"surface_label\":\"甲\"}")) === jcs(JSON.parse("{\"surface_label\":\"\\u7532\"}")), "equivalent JSON values did not canonicalize equally");
assert(sha256(Buffer.from(jcs({ a: 1, b: 2 }))) !== sha256(Buffer.from(jcs({ a: "1", b: 2 }))), "distinct JCS values collided in fixture");
const normalized = "Ａ\r\nx\rY".replace(/\r\n?/g, "\n").normalize("NFKC");
assert(normalized === "A\nx\nY", "NFKC/newline fixture mismatch");
assert(process.versions.unicode === "17.0", `runtime Unicode version ${process.versions.unicode} != 17.0`);

const prompt = Buffer.from("你只生成问题。\n", "utf8");
const prefix = Buffer.from("第一章\n甲站。\n", "utf8");
const metadata = {
  schema_version: "rc-query-surface-request-metadata/1.0.0",
  dataset_id: envelope.dataset_id,
  cutoff_group_id: envelope.cutoff_group_id,
  model: "gpt-5.6-sol",
  reasoning: "medium",
  tool_policy: "NO_TOOLS",
  output_contract: "QUERY_ID_AND_QUERY_TEXT_JSON_ONLY",
  query_surface_runner_version: "runner/1",
  channel_policy: "SEGMENT_02_INSTRUCTION_03_CONTROL_DATA_04_VISIBLE_CORPUS_NO_EXTRA_CONTENT_V1",
  surface_prompt_path: "contract/prompts/query-surface-v1.txt",
  surface_prompt_version: "prompt/1",
  surface_prompt_sha256: sha256(prompt),
  surface_prompt_bytes: prompt.length,
  safe_envelope_schema_version: envelope.schema_version,
  safe_envelope_sha256: sha256(Buffer.from(jcs(envelope))),
  safe_envelope_bytes: Buffer.byteLength(jcs(envelope)),
  visible_prefix_sha256: sha256(prefix),
  visible_prefix_bytes: prefix.length,
  frame_policy_id: "RC_QUERY_SURFACE_REQUEST_FRAME_V1",
};
const frame = requestFrame(metadata, prompt, envelope, prefix);
const decodedSegments = parseRequestFrame(frame);
assert(decodedSegments[0].equals(Buffer.from(jcs(metadata))), "metadata segment mismatch");
assert(decodedSegments[1].equals(prompt), "prompt segment mismatch");
assert(decodedSegments[2].equals(Buffer.from(jcs(envelope))), "envelope segment mismatch");
assert(decodedSegments[3].equals(prefix), "prefix segment mismatch");
const changedEnvelope = clone(envelope);
changedEnvelope.briefs[0].query_id = "Q-0002";
assert(sha256(frame) !== sha256(requestFrame(metadata, prompt, changedEnvelope, prefix)), "distinct framed envelope did not change frame hash");
assert(frame.subarray(0, 8).toString("hex") === "5243515346310000" && frame.at(-1) === 0, "frame boundary mismatch");

const goldSchema = schemas.get("evaluation/ripplecontext-long-v1/spec/schemas/gold.schema.json");
const goldReaders = goldSchema.properties.prohibited_reader_classes;
assert(goldReaders.minItems === 5 && goldReaders.maxItems === 5 && goldReaders.uniqueItems === true, "Gold reader set cardinality");
assert(goldReaders.items.enum.includes("ANSWER_BLIND_QUERY_SURFACE_MODEL"), "query-surface reader missing from Gold");
assert(goldSchema.properties.created_before_corpus.const === true, "Gold-before-corpus flag");
assert(queryPlanSchema.properties.created_before_corpus.const === true, "query-plan-before-corpus flag");
assert(queryPlanSchema.properties.final_query_text_frozen_here.const === false, "query text frozen too early");

const eventsSchema = schemas.get("evaluation/ripplecontext-long-v1/spec/schemas/events.schema.json");
const endpoint = eventsSchema.$defs.endpoint;
assert(endpoint.additionalProperties === false && endpoint.required.join(",") === "ref_type,ref_id", "relation endpoint shape");
const requiredEvidence = queryPlanSchema.$defs.requiredEvidenceSet;
const forbiddenEvidence = queryPlanSchema.$defs.forbiddenEvidence;
assert(requiredEvidence.additionalProperties === false && requiredEvidence.required.includes("supports_semantic_unit_ids"), "required evidence shape");
assert(forbiddenEvidence.additionalProperties === false && forbiddenEvidence.required.includes("forbidden_usage"), "forbidden evidence shape");
const manifestSchema = schemas.get("evaluation/ripplecontext-long-v1/spec/schemas/manifest.schema.json");
assert(manifestSchema.$defs.coverage.properties.unmapped_required_event_count.const === 0, "required Event coverage");
assert(manifestSchema.$defs.coverage.properties.unmapped_semantic_unit_count.const === 0, "semantic-unit coverage");
assert(manifestSchema.$defs.chapterEntry.properties.generation_attempt_count.maximum === 2, "manifest attempt cap");
assert(manifestSchema.$defs.chapterEntry.properties.invalid_generation_call_ids.maxItems === 1, "manifest invalid-attempt cap");
assert(manifestSchema.$defs.callEntry.properties.selection_policy.const === "NO_CANDIDATE_SELECTION", "manifest selection policy");

const candidateHead = execFileSync("git", ["rev-parse", CANDIDATE], { cwd: ROOT, encoding: "utf8" }).trim();
assert(candidateHead === CANDIDATE, "candidate does not resolve exactly");
const changedPaths = execFileSync("git", ["diff", "--name-only", `${BASELINE}..${CANDIDATE}`], { cwd: ROOT, encoding: "utf8" })
  .trim().split("\n").filter(Boolean);
const forbiddenPrefixes = ["src/", "test/", "tests/", "package.json", "package-lock.json"];
for (const path of changedPaths) {
  assert(!forbiddenPrefixes.some((prefix) => path === prefix || path.startsWith(prefix)), `forbidden candidate path: ${path}`);
}
const datasetPaths = execFileSync("git", ["ls-tree", "-r", "--name-only", CANDIDATE, "evaluation/ripplecontext-long-v1"], { cwd: ROOT, encoding: "utf8" })
  .trim().split("\n").filter(Boolean);
assert(datasetPaths.length === 12 && datasetPaths.every((path) => path.startsWith("evaluation/ripplecontext-long-v1/spec/")), "downstream dataset artifact exists");

console.log(JSON.stringify({
  candidate: CANDIDATE,
  json_parsed: 12,
  schemas_strict_compiled: schemaPaths.length,
  nested_object_schemas_closed: true,
  taxonomy: { case_families: 21, failure_families: 15 },
  plan: { chapters: 40, target_characters: 260000, cutoff_groups: 12, queries: 72, stages: 9 },
  calls: { sol: 22, terra_initial: 40, repair_default: 0, luna_default: 0 },
  cost: { query_surface_low: requestCostLow, query_surface_high: requestCostHigh, total_low: stageCostLow, total_high: stageCostHigh, reserve_low: costPlan.totals.reserved_cost_low, reserve_high: costPlan.totals.reserved_cost_high },
  original_blockers: { long_context_pricing_reconstructed: true, hash_domains_and_frame_reconstructed: true, closed_future_projection_injections_rejected: true, gold_reader_exact_set: true },
  runtime_unicode_version: process.versions.unicode,
  qa_finding: { structured_future_source_event_accepted_by_continuity_schema: structuredFutureLeakAccepted },
}, null, 2));

if (structuredFutureLeakAccepted) {
  console.error("BLOCKER: continuity Schema accepts EV-000999 simultaneously as opaque future and current local_entity_state source; no bundle cutoff/disjointness contract closes this structured leakage.");
  process.exitCode = 1;
}
