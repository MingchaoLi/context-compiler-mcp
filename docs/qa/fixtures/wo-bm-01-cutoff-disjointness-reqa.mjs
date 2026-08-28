import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { join, relative } from "node:path";
import {
  BoundaryValidationError,
  VALIDATOR_VERSION,
  buildEventOrderIndex,
  createEventOrderIndex,
  deriveFutureProjection,
  deriveVisibleEventReferenceProjection,
  hashJcs,
  runFixtureFile,
  sha256,
  validateContinuityBoundary,
  validateQueryPlanBoundaries,
} from "../../../evaluation/ripplecontext-long-v1/spec/validators/validate-cutoff-disjointness.mjs";

const ROOT = process.cwd();
const CANDIDATE = "117611c859f9b94ce639e261e20e732d6e9d00d9";
const CANDIDATE_PARENT = "3bb15eb0b551a2d66fd227057d6a984e238ddbb4";
const EXPECTED_VALIDATOR_SHA256 = "a2e83de5b05b8193a9d5fbebfea7d8718f770e0cba5a125f690bab55aed6836c";
const EXPECTED_FIXTURE_SHA256 = "d082ffc6796466849be6d41efc0455f960b9941c4c02a3997a7fdab9eab1dad5";
const VALIDATOR_PATH = "evaluation/ripplecontext-long-v1/spec/validators/validate-cutoff-disjointness.mjs";
const FIXTURE_PATH = "evaluation/ripplecontext-long-v1/spec/fixtures/cutoff-disjointness-fixtures.json";
const AJV_ROOT = process.env.WO_BM01_AJV_ROOT;
const require = createRequire(import.meta.url);

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

function bytes(path) {
  return readFileSync(join(ROOT, path));
}

function clone(value) {
  return structuredClone(value);
}

function git(...args) {
  return execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).trim();
}

function loadDependency(name) {
  if (AJV_ROOT) return require(join(AJV_ROOT, "node_modules", name));
  return require(name);
}

function independentJcs(value) {
  if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") {
    assert(Number.isFinite(value), "non-finite number is outside the I-JSON domain");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(independentJcs).join(",")}]`;
  assert(value && typeof value === "object", `not a JSON value: ${typeof value}`);
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${independentJcs(value[key])}`).join(",")}}`;
}

function independentHashJcs(value) {
  return createHash("sha256").update(Buffer.from(independentJcs(value), "utf8")).digest("hex");
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
    frameSegment(1, Buffer.from(independentJcs(metadata), "utf8")),
    frameSegment(2, prompt),
    frameSegment(3, Buffer.from(independentJcs(envelope), "utf8")),
    frameSegment(4, prefix),
    Buffer.from([0]),
  ]);
}

function walkSchema(node, pointer, violations) {
  if (!node || typeof node !== "object") return;
  if (node.type === "object" && node.additionalProperties !== false) violations.push(pointer);
  if (Array.isArray(node)) {
    node.forEach((child, index) => walkSchema(child, `${pointer}/${index}`, violations));
    return;
  }
  for (const [key, child] of Object.entries(node)) walkSchema(child, `${pointer}/${key}`, violations);
}

function expectBoundaryError(label, expectedCode, operation, observed) {
  try {
    operation();
    fail(`${label}: unexpectedly accepted`);
  } catch (error) {
    if (!(error instanceof BoundaryValidationError)) throw error;
    assert(error.code === expectedCode, `${label}: ${error.code} != ${expectedCode}`);
    observed.push({ label, error_code: error.code });
  }
}

function refreshBundle(bundle) {
  bundle.cutoff_sha256 = hashJcs(bundle.cutoff);
  bundle.visible_event_reference_projection = deriveVisibleEventReferenceProjection(bundle);
  bundle.visible_event_reference_projection_sha256 = hashJcs(bundle.visible_event_reference_projection);
  bundle.future_negative_constraints.projection = deriveFutureProjection(
    bundle.future_negative_constraints.projection.opaque_future_event_ids,
  );
  bundle.future_negative_constraints.projection_sha256 = hashJcs(bundle.future_negative_constraints.projection);
  return bundle;
}

function continuityBase(index) {
  const zeroHash = "0".repeat(64);
  const cutoffEntry = index.byId.get("EV-000101");
  const bundle = {
    schema_version: "rc-synth-long-continuity-bundle/1.2.0",
    dataset_id: "rc-synth-long-zh-v1.0.0",
    corpus_version: "corpus/qa-cutoff-reqa",
    bundle_version: "bundle/qa-cutoff-reqa",
    canonical_json_policy: "RFC8785_JCS_VALUE_UTF8_NO_TERMINATOR_JSON_FILE_LF_V1",
    chapter_id: "CH011",
    cutoff: {
      schema_version: "rc-synth-long-generation-cutoff/1.0.0",
      cutoff_id: "GCUT-CH011",
      comparison_policy: "INTEGER_STREAM_SEQ_INCLUSIVE_CUTOFF_V1",
      event_graph_version: index.eventGraphVersion,
      timeline_version: index.timelineVersion,
      event_order_index_sha256: index.sha256,
      generation_chapter_id: "CH011",
      visible_through_stream_seq: cutoffEntry.stream_seq,
      visible_through_event_id: cutoffEntry.event_id,
      visible_through_corpus_unit_id: cutoffEntry.corpus_unit_id,
    },
    cutoff_sha256: zeroHash,
    immutable_input_hashes: {
      world_bible: zeroHash,
      style_bible: zeroHash,
      alias_name_registry: zeroHash,
      chapter_event_plan: zeroHash,
    },
    local_entity_state: [{
      entity_id: "ENT-0001",
      state_ref_ids: ["STATE-0001"],
      snapshot_text: "cutoff-visible state",
      source_event_ids: ["EV-000100"],
    }],
    relationship_state_snapshot: [{
      relation_id: "REL-0001",
      from_entity_id: "ENT-0001",
      to_entity_id: "ENT-0002",
      current_state: "cutoff-visible relation",
      source_event_ids: ["EV-000101"],
    }],
    unresolved_open_thread_ledger: [{
      thread_id: "THREAD-0001",
      thread_kind: "CLUE",
      safe_summary: "cutoff-visible clue",
      source_event_ids: ["EV-000100"],
    }],
    necessary_prior_summary: {
      text: "cutoff-visible summary",
      text_sha256: sha256(Buffer.from("cutoff-visible summary", "utf8")),
      source_event_ids: ["EV-000100"],
      token_estimate: 3,
    },
    relevant_prior_snippets: [],
    visible_event_reference_projection: {},
    visible_event_reference_projection_sha256: zeroHash,
    future_negative_constraints: {
      projection: { opaque_future_event_ids: ["EV-000999"] },
      projection_sha256: zeroHash,
    },
    budget: { maximum_input_tokens: 1000, prior_summary_tokens: 3, prior_snippet_count: 0 },
    forbidden_inputs: ["PRIOR_FULL_CORPUS", "FUTURE_CHAPTER_PLAN", "QUERY_PLAN", "QUERY_ORACLE", "EVALUATOR_CONTROL_GOLD"],
  };
  return refreshBundle(bundle);
}

function queryPlanBase(index) {
  const cutoff = {
    cutoff_id: "QCUT-Q-0001",
    comparison_policy: "INTEGER_STREAM_SEQ_INCLUSIVE_CUTOFF_V1",
    event_order_index_sha256: index.sha256,
    visible_through_stream_seq: 101,
    visible_through_event_id: "EV-000101",
    visible_through_corpus_unit_id: "CH010.S03",
    query_occurs_after_chapter_id: "CH010",
    query_persisted_before_answer: false,
  };
  return {
    event_graph_version: index.eventGraphVersion,
    timeline_version: index.timelineVersion,
    event_order_index_sha256: index.sha256,
    query_plans: [{
      query_id: "Q-0001",
      cutoff,
      cutoff_sha256: hashJcs(cutoff),
      formation_target_event_ids: ["EV-000100"],
      required_evidence_sets: [{ event_ids: ["EV-000101"] }],
      forbidden_evidence: [],
      explicit_future_event_ids: ["EV-000999"],
    }],
  };
}

// Verify the requested Git chain before treating the candidate as the subject of QA.
assert(git("rev-parse", "main") === CANDIDATE, "main does not name the requested candidate");
assert(git("rev-list", "--parents", "-n", "1", CANDIDATE) === `${CANDIDATE} ${CANDIDATE_PARENT}`, "candidate parent drift");
assert(git("rev-list", "--parents", "-n", "1", CANDIDATE_PARENT) === `${CANDIDATE_PARENT} 36d6466797dc5357bee2b8246075c7669350e258 469c54aa3cf8a7fccde1efbd4ac88da548484d37`, "merge ancestry drift");
for (const ancestor of [
  "f1b183e309ae3c1ac502d6b0eca704f9f9c4d5c0",
  "f361236e162a58bf211171413d6c4ada8efe30d6",
  "469c54aa3cf8a7fccde1efbd4ac88da548484d37",
]) {
  execFileSync("git", ["merge-base", "--is-ancestor", ancestor, CANDIDATE], { cwd: ROOT });
}
assert(git("show", "-s", "--format=%T", "f361236e162a58bf211171413d6c4ada8efe30d6") === git("show", "-s", "--format=%T", "c0ee2462dffefc800812ee0c7913a31faa9f441f"), "RETURN tree equivalence drift");
assert(git("show", "-s", "--format=%T", "469c54aa3cf8a7fccde1efbd4ac88da548484d37") === git("show", "-s", "--format=%T", "36d6466797dc5357bee2b8246075c7669350e258"), "format tree equivalence drift");

const candidateChangedPaths = git("diff", "--name-only", `${CANDIDATE_PARENT}..${CANDIDATE}`).split("\n").filter(Boolean);
for (const path of candidateChangedPaths) {
  assert(!["src/", "test/", "tests/"].some((prefix) => path.startsWith(prefix)), `production path changed: ${path}`);
  assert(!["package.json", "package-lock.json"].includes(path), `package path changed: ${path}`);
}
const downstreamPaths = git("ls-tree", "-r", "--name-only", CANDIDATE, "evaluation/ripplecontext-long-v1")
  .split("\n").filter(Boolean).filter((path) => !path.startsWith("evaluation/ripplecontext-long-v1/spec/"));
assert(downstreamPaths.length === 0, `downstream assets exist: ${downstreamPaths.join(",")}`);

// Freeze bindings and all current SPEC JSON.
assert(VALIDATOR_VERSION === "rc-synth-long-cutoff-disjointness-validator/1.0.0", "validator version drift");
const validatorSha256 = createHash("sha256").update(bytes(VALIDATOR_PATH)).digest("hex");
const fixtureSha256 = createHash("sha256").update(bytes(FIXTURE_PATH)).digest("hex");
assert(validatorSha256 === EXPECTED_VALIDATOR_SHA256, "validator file hash drift");
assert(fixtureSha256 === EXPECTED_FIXTURE_SHA256, "fixture file hash drift");
const frozenFixture = json(FIXTURE_PATH);
assert(frozenFixture.schema_version === "rc-synth-long-cutoff-disjointness-fixtures/1.0.0", "fixture version drift");
const frozenFixtureResults = runFixtureFile(frozenFixture);
assert(frozenFixtureResults.map((item) => `${item.valid}:${item.error_code}`).join("|") ===
  "true:null|false:VISIBLE_FUTURE_EVENT_INTERSECTION|false:EVENT_ALIAS_FORBIDDEN", "frozen fixture outcomes drift");

const schemaDir = join(ROOT, "evaluation/ripplecontext-long-v1/spec/schemas");
const schemaPaths = readdirSync(schemaDir).filter((name) => name.endsWith(".schema.json")).sort()
  .map((name) => relative(ROOT, join(schemaDir, name)));
const planPaths = [
  "evaluation/ripplecontext-long-v1/spec/case-taxonomy.json",
  "evaluation/ripplecontext-long-v1/spec/chapter-plan.json",
  "evaluation/ripplecontext-long-v1/spec/cost-plan.json",
  "evaluation/ripplecontext-long-v1/spec/stage-plan.json",
];
assert(schemaPaths.length === 8, `schema count ${schemaPaths.length}`);
for (const path of [...schemaPaths, ...planPaths, FIXTURE_PATH]) json(path);

const Ajv2020 = loadDependency("ajv/dist/2020").default;
const addFormats = loadDependency("ajv-formats");
const ajv = new Ajv2020({ strict: true, allErrors: true, validateFormats: true });
addFormats(ajv);
const schemas = new Map();
const schemaHashes = {};
for (const path of schemaPaths) {
  const schema = json(path);
  assert(schema.$schema === "https://json-schema.org/draft/2020-12/schema", `${path}: wrong draft`);
  const violations = [];
  walkSchema(schema, "#", violations);
  assert(violations.length === 0, `${path}: open object at ${violations.join(",")}`);
  ajv.addSchema(schema);
  assert(ajv.getSchema(schema.$id), `${path}: strict compilation did not register schema`);
  schemas.set(path, schema);
  schemaHashes[path.split("/").at(-1)] = createHash("sha256").update(bytes(path)).digest("hex");
}

const continuitySchema = schemas.get("evaluation/ripplecontext-long-v1/spec/schemas/continuity-bundle.schema.json");
const manifestSchema = schemas.get("evaluation/ripplecontext-long-v1/spec/schemas/manifest.schema.json");
const eventsSchema = schemas.get("evaluation/ripplecontext-long-v1/spec/schemas/events.schema.json");
const timelineSchema = schemas.get("evaluation/ripplecontext-long-v1/spec/schemas/timeline.schema.json");
const queryPlanSchema = schemas.get("evaluation/ripplecontext-long-v1/spec/schemas/query-plan.schema.json");
const queriesSchema = schemas.get("evaluation/ripplecontext-long-v1/spec/schemas/queries.schema.json");
const goldSchema = schemas.get("evaluation/ripplecontext-long-v1/spec/schemas/gold.schema.json");

for (const required of ["cutoff", "cutoff_sha256", "visible_event_reference_projection", "visible_event_reference_projection_sha256"]) {
  assert(continuitySchema.required.includes(required), `continuity missing ${required}`);
}
for (const required of ["timeline", "event_order_index_sha256", "cutoff_boundary_validator_sha256", "cutoff_boundary_fixture_sha256"]) {
  assert(manifestSchema.$defs.versions.required.includes(required), `manifest versions missing ${required}`);
}
assert(manifestSchema.$defs.versions.properties.cutoff_boundary_validator_version.const === VALIDATOR_VERSION, "manifest validator version drift");
assert(manifestSchema.$defs.versions.properties.cutoff_boundary_fixture_version.const === frozenFixture.schema_version, "manifest fixture version drift");
assert(manifestSchema.$defs.fileEntry.required.includes("sha256"), "manifest file inventory lacks SHA-256");
assert(eventsSchema.required.includes("event_order_index_sha256") && timelineSchema.required.includes("event_order_index_sha256"), "Event/timeline order hashes not required");
assert(queryPlanSchema.$defs.queryPlan.required.includes("cutoff_sha256") && queriesSchema.$defs.query.required.includes("cutoff_sha256"), "query cutoff hashes not required");

const stagePlan = json(planPaths[3]);
assert(stagePlan.cutoff_boundary_validation.program_path === VALIDATOR_PATH, "stage validator path drift");
assert(stagePlan.cutoff_boundary_validation.validator_version === VALIDATOR_VERSION, "stage validator version drift");
assert(stagePlan.cutoff_boundary_validation.fixture_path === FIXTURE_PATH, "stage fixture path drift");
assert(stagePlan.cutoff_boundary_validation.fixture_version === frozenFixture.schema_version, "stage fixture version drift");

// Independent continuity attack matrix: this does not materialize Builder fixture cases.
const index = createEventOrderIndex([
  { event_id: "EV-000050", stream_seq: 50, corpus_unit_id: "CH005.S01" },
  { event_id: "EV-000100", stream_seq: 100, corpus_unit_id: "CH010.S02" },
  { event_id: "EV-000101", stream_seq: 101, corpus_unit_id: "CH010.S03" },
  { event_id: "EV-000110", stream_seq: 110, corpus_unit_id: "CH011.S01" },
  { event_id: "EV-000999", stream_seq: 999, corpus_unit_id: "CH040.S04" },
], {
  eventGraphVersion: "event-graph/qa-independent",
  timelineVersion: "timeline/qa-independent",
  forbiddenAliases: { "EV-009999": "EV-000999" },
});
const base = continuityBase(index);
const validateContinuitySchema = ajv.getSchema(continuitySchema.$id);
assert(validateContinuitySchema(base), `independent positive continuity shape rejected: ${ajv.errorsText(validateContinuitySchema.errors)}`);
const baseResult = validateContinuityBoundary(base, index);
assert(baseResult.visible_event_ids.join(",") === "EV-000100,EV-000101", "independent positive visible set mismatch");

const observedErrors = [];

const originalLeak = clone(base);
originalLeak.local_entity_state[0].source_event_ids.push("EV-000999");
refreshBundle(originalLeak);
assert(validateContinuitySchema(originalLeak), "shape validator unexpectedly claims cross-field disjointness");
expectBoundaryError("original EV-000999 current-plus-future", "VISIBLE_FUTURE_EVENT_INTERSECTION",
  () => validateContinuityBoundary(originalLeak, index), observedErrors);

const futurePayloadInjection = clone(base);
futurePayloadInjection.future_negative_constraints.projection.future_fact = "later payload";
assert(!validateContinuitySchema(futurePayloadInjection), "continuity Schema accepted a future payload field");

const aliasNestedRepeated = clone(base);
aliasNestedRepeated.unresolved_open_thread_ledger[0].source_event_ids.push("EV-009999");
aliasNestedRepeated.relevant_prior_snippets.push({ source_event_ids: ["EV-009999"], latest_visible_stream_seq: 999 });
refreshBundle(aliasNestedRepeated);
expectBoundaryError("alias nested repeated reference", "EVENT_ALIAS_FORBIDDEN",
  () => validateContinuityBoundary(aliasNestedRepeated, index), observedErrors);

const nestedText = clone(base);
nestedText.relationship_state_snapshot[0].current_state = "nested token EV-000999";
refreshBundle(nestedText);
expectBoundaryError("nested free-text Event token", "UNCLASSIFIED_OR_ALIASED_EVENT_TOKEN",
  () => validateContinuityBoundary(nestedText, index), observedErrors);

const repeatedLeak = clone(base);
repeatedLeak.local_entity_state[0].source_event_ids.push("EV-000999");
repeatedLeak.unresolved_open_thread_ledger[0].source_event_ids.push("EV-000999");
repeatedLeak.necessary_prior_summary.source_event_ids.push("EV-000999");
refreshBundle(repeatedLeak);
expectBoundaryError("repeated cross-list future laundering", "VISIBLE_FUTURE_EVENT_INTERSECTION",
  () => validateContinuityBoundary(repeatedLeak, index), observedErrors);

const duplicateSameList = clone(base);
duplicateSameList.local_entity_state[0].source_event_ids.push("EV-000100");
expectBoundaryError("duplicate same-list visible reference", "DUPLICATE_VISIBLE_EVENT_REFERENCE",
  () => validateContinuityBoundary(duplicateSameList, index), observedErrors);

const unresolvedVisible = clone(base);
unresolvedVisible.local_entity_state[0].source_event_ids.push("EV-008888");
refreshBundle(unresolvedVisible);
expectBoundaryError("unresolved canonical-looking Event", "EVENT_REF_UNRESOLVED_OR_ALIAS",
  () => validateContinuityBoundary(unresolvedVisible, index), observedErrors);

const cutoffEventMismatch = clone(base);
cutoffEventMismatch.cutoff.visible_through_event_id = "EV-000100";
refreshBundle(cutoffEventMismatch);
expectBoundaryError("cutoff event identity mismatch", "CUTOFF_EVENT_ID_MISMATCH",
  () => validateContinuityBoundary(cutoffEventMismatch, index), observedErrors);

const cutoffUnitMismatch = clone(base);
cutoffUnitMismatch.cutoff.visible_through_corpus_unit_id = "CH010.S02";
refreshBundle(cutoffUnitMismatch);
expectBoundaryError("cutoff unit identity mismatch", "CUTOFF_CORPUS_UNIT_MISMATCH",
  () => validateContinuityBoundary(cutoffUnitMismatch, index), observedErrors);

const cutoffHashMismatch = clone(base);
cutoffHashMismatch.cutoff_sha256 = "f".repeat(64);
expectBoundaryError("cutoff hash mismatch", "CUTOFF_HASH_MISMATCH",
  () => validateContinuityBoundary(cutoffHashMismatch, index), observedErrors);

const cutoffOrderHashMismatch = clone(base);
cutoffOrderHashMismatch.cutoff.event_order_index_sha256 = "f".repeat(64);
cutoffOrderHashMismatch.cutoff_sha256 = hashJcs(cutoffOrderHashMismatch.cutoff);
expectBoundaryError("cutoff order hash mismatch", "CUTOFF_ORDER_HASH_MISMATCH",
  () => validateContinuityBoundary(cutoffOrderHashMismatch, index), observedErrors);

const cutoffNotLatestPrior = clone(base);
cutoffNotLatestPrior.cutoff.visible_through_stream_seq = 100;
cutoffNotLatestPrior.cutoff.visible_through_event_id = "EV-000100";
cutoffNotLatestPrior.cutoff.visible_through_corpus_unit_id = "CH010.S02";
cutoffNotLatestPrior.cutoff_sha256 = hashJcs(cutoffNotLatestPrior.cutoff);
expectBoundaryError("generation cutoff not exact prior prefix", "GENERATION_CUTOFF_NOT_EXACT_PRIOR_PREFIX",
  () => validateContinuityBoundary(cutoffNotLatestPrior, index), observedErrors);

const projectionHashMismatch = clone(base);
projectionHashMismatch.visible_event_reference_projection_sha256 = "f".repeat(64);
expectBoundaryError("visible projection hash mismatch", "VISIBLE_REFERENCE_PROJECTION_HASH_MISMATCH",
  () => validateContinuityBoundary(projectionHashMismatch, index), observedErrors);

const futureProjectionHashMismatch = clone(base);
futureProjectionHashMismatch.future_negative_constraints.projection_sha256 = "f".repeat(64);
expectBoundaryError("future projection hash mismatch", "FUTURE_REFERENCE_PROJECTION_HASH_MISMATCH",
  () => validateContinuityBoundary(futureProjectionHashMismatch, index), observedErrors);

const currentChapterAsFuture = clone(base);
currentChapterAsFuture.future_negative_constraints.projection = deriveFutureProjection(["EV-000110", "EV-000999"]);
currentChapterAsFuture.future_negative_constraints.projection_sha256 = hashJcs(currentChapterAsFuture.future_negative_constraints.projection);
expectBoundaryError("current-chapter Event relabeled future", "FUTURE_EVENT_NOT_AFTER_GENERATION_CHAPTER",
  () => validateContinuityBoundary(currentChapterAsFuture, index), observedErrors);

// Independent Event/timeline order reconstruction attacks.
const orderEntries = index.entries.map(({ event_id, stream_seq, corpus_unit_id }) => ({ event_id, stream_seq, corpus_unit_id }));
const orderHash = independentHashJcs(orderEntries);
assert(orderHash === index.sha256, "independent Event-order hash differs from validator hash");
const eventsAsset = {
  event_graph_version: index.eventGraphVersion,
  event_order_policy: { event_aliases_allowed: false },
  event_order_index_sha256: orderHash,
  events: orderEntries.map(({ event_id, stream_seq }) => ({ event_id, stream_seq })),
};
const timelineAsset = {
  timeline_version: index.timelineVersion,
  event_graph_version: index.eventGraphVersion,
  event_order_index_sha256: orderHash,
  disclosure_index: orderEntries.map((entry) => ({ ...entry, first_disclosure: true })),
};
assert(buildEventOrderIndex(eventsAsset, timelineAsset).sha256 === orderHash, "positive Event/timeline reconstruction failed");

const timelineSeqMismatch = clone(timelineAsset);
timelineSeqMismatch.disclosure_index[1].stream_seq = 102;
expectBoundaryError("timeline/Event sequence mismatch", "DISCLOSURE_STREAM_SEQ_MISMATCH",
  () => buildEventOrderIndex(eventsAsset, timelineSeqMismatch), observedErrors);

const timelineCoverageMismatch = clone(timelineAsset);
timelineCoverageMismatch.disclosure_index.pop();
expectBoundaryError("timeline/Event coverage mismatch", "MISSING_FIRST_DISCLOSURE",
  () => buildEventOrderIndex(eventsAsset, timelineCoverageMismatch), observedErrors);

const timelineVersionMismatch = clone(timelineAsset);
timelineVersionMismatch.event_graph_version = "event-graph/mismatch";
expectBoundaryError("timeline/Event version mismatch", "EVENT_GRAPH_VERSION_MISMATCH",
  () => buildEventOrderIndex(eventsAsset, timelineVersionMismatch), observedErrors);

const timelineHashMismatch = clone(timelineAsset);
timelineHashMismatch.event_order_index_sha256 = "f".repeat(64);
expectBoundaryError("timeline order-index hash mismatch", "EVENT_ORDER_HASH_MISMATCH",
  () => buildEventOrderIndex(eventsAsset, timelineHashMismatch), observedErrors);

// Independent Query cutoff/evidence attacks.
const queryBase = queryPlanBase(index);
assert(validateQueryPlanBoundaries(queryBase, index).query_count === 1, "positive Query boundary rejected");

const queryVisibleAfter = clone(queryBase);
queryVisibleAfter.query_plans[0].required_evidence_sets[0].event_ids = ["EV-000999"];
queryVisibleAfter.query_plans[0].explicit_future_event_ids = [];
expectBoundaryError("Query required evidence after cutoff", "QUERY_VISIBLE_EVENT_AFTER_CUTOFF",
  () => validateQueryPlanBoundaries(queryVisibleAfter, index), observedErrors);

const queryFutureAtCutoff = clone(queryBase);
queryFutureAtCutoff.query_plans[0].explicit_future_event_ids = ["EV-000101"];
expectBoundaryError("Query visible/future set intersection", "QUERY_VISIBLE_FUTURE_EVENT_INTERSECTION",
  () => validateQueryPlanBoundaries(queryFutureAtCutoff, index), observedErrors);

const queryFutureBeforeCutoff = clone(queryBase);
queryFutureBeforeCutoff.query_plans[0].required_evidence_sets[0].event_ids = ["EV-000050"];
queryFutureBeforeCutoff.query_plans[0].explicit_future_event_ids = ["EV-000101"];
expectBoundaryError("Query future set at or before cutoff", "QUERY_FUTURE_EVENT_AT_OR_BEFORE_CUTOFF",
  () => validateQueryPlanBoundaries(queryFutureBeforeCutoff, index), observedErrors);

const queryAliasRepeated = clone(queryBase);
queryAliasRepeated.query_plans[0].required_evidence_sets = [{ event_ids: ["EV-009999"] }, { event_ids: ["EV-009999"] }];
expectBoundaryError("Query nested repeated alias", "EVENT_ALIAS_FORBIDDEN",
  () => validateQueryPlanBoundaries(queryAliasRepeated, index), observedErrors);

const queryFutureForbiddenNotExplicit = clone(queryBase);
queryFutureForbiddenNotExplicit.query_plans[0].explicit_future_event_ids = [];
queryFutureForbiddenNotExplicit.query_plans[0].forbidden_evidence = [{ event_id: "EV-000999", reason: "FUTURE" }];
expectBoundaryError("Query future forbidden evidence not explicit", "FUTURE_FORBIDDEN_NOT_EXPLICIT",
  () => validateQueryPlanBoundaries(queryFutureForbiddenNotExplicit, index), observedErrors);

const queryNonFutureForbiddenAfter = clone(queryBase);
queryNonFutureForbiddenAfter.query_plans[0].explicit_future_event_ids = [];
queryNonFutureForbiddenAfter.query_plans[0].forbidden_evidence = [{ event_id: "EV-000999", reason: "STALE" }];
expectBoundaryError("Query non-future forbidden evidence after cutoff", "QUERY_VISIBLE_EVENT_AFTER_CUTOFF",
  () => validateQueryPlanBoundaries(queryNonFutureForbiddenAfter, index), observedErrors);

const queryCutoffIdentityMismatch = clone(queryBase);
queryCutoffIdentityMismatch.query_plans[0].cutoff.visible_through_event_id = "EV-000100";
queryCutoffIdentityMismatch.query_plans[0].cutoff_sha256 = hashJcs(queryCutoffIdentityMismatch.query_plans[0].cutoff);
expectBoundaryError("Query cutoff identity mismatch", "CUTOFF_EVENT_ID_MISMATCH",
  () => validateQueryPlanBoundaries(queryCutoffIdentityMismatch, index), observedErrors);

const queryCutoffNotExact = clone(queryBase);
queryCutoffNotExact.query_plans[0].cutoff.visible_through_stream_seq = 100;
queryCutoffNotExact.query_plans[0].cutoff.visible_through_event_id = "EV-000100";
queryCutoffNotExact.query_plans[0].cutoff.visible_through_corpus_unit_id = "CH010.S02";
queryCutoffNotExact.query_plans[0].cutoff_sha256 = hashJcs(queryCutoffNotExact.query_plans[0].cutoff);
expectBoundaryError("Query cutoff not exact visible prefix", "QUERY_CUTOFF_NOT_EXACT_PREFIX",
  () => validateQueryPlanBoundaries(queryCutoffNotExact, index), observedErrors);

// Prior accepted contract areas: size, lifecycle, models/fallback, pricing, canonicalization, readers, evidence, coverage.
const taxonomy = json(planPaths[0]);
const chapterPlan = json(planPaths[1]);
const costPlan = json(planPaths[2]);
assert(taxonomy.contract_version === "rc-synth-long-contract/1.0.0-draft.5", "taxonomy contract drift");
assert(taxonomy.case_families.length === 21, "case-family count");
assert(taxonomy.failure_families.length === 15, "failure-family count");
const failureIds = new Set(taxonomy.failure_families.map((item) => item.id));
for (const family of taxonomy.case_families) {
  assert(family.minimum_event_count > 0 && family.minimum_query_count > 0, `${family.id}: zero denominator`);
  for (const failureId of family.failure_family_ids) assert(failureIds.has(failureId), `${family.id}: unknown failure ${failureId}`);
}
assert(chapterPlan.chapters.length === 40, "chapter count");
assert(chapterPlan.chapters.reduce((sum, item) => sum + item.target_characters, 0) === 260000, "target characters");
assert(chapterPlan.chapters.reduce((sum, item) => sum + item.minimum_characters, 0) === 220000, "minimum characters");
assert(chapterPlan.chapters.reduce((sum, item) => sum + item.maximum_characters, 0) === 300000, "maximum characters");
assert(chapterPlan.query_cutoff_groups.length === 12, "cutoff groups");
assert(chapterPlan.query_cutoff_groups.reduce((sum, item) => sum + item.planned_query_count, 0) === 72, "query count");
assert(stagePlan.stages.length === 9 && stagePlan.stages.map((item) => item.ordinal).join(",") === "1,2,3,4,5,6,7,8,9", "stage plan");
assert(stagePlan.stages[2].stage === "GOLD" && stagePlan.stages[3].stage === "GENERATION", "Gold-before-prose order");
assert(stagePlan.generation_repair_policy.maximum_mechanical_repair_attempts_per_chapter === 1, "repair cap");
assert(stagePlan.generation_repair_policy.original_failed_output_eligible === false, "failed output eligibility");
assert(stagePlan.generation_repair_policy.candidate_selection_allowed === false, "candidate selection allowed");
assert(stagePlan.generation_repair_policy.semantic_inconsistency_action.includes("FRESH_REGENERATE"), "fresh regeneration absent");
for (const stage of stagePlan.stages) {
  if ("fallback" in stage) assert(stage.fallback === "NONE_STOP_AND_REPORT", `${stage.stage}: fallback drift`);
}

const pricing = costPlan.pricing_reference;
assert(pricing.accessed_at === "2026-08-27", "pricing date drift");
assert(pricing.models["gpt-5.6-sol"].input === 4 && pricing.models["gpt-5.6-sol"].output === 20, "Sol rates drift");
const longTier = pricing.gpt_5_6_sol_long_context_tier;
assert(longTier.trigger === "REQUEST_INPUT_TOKENS_GREATER_THAN_272000" && longTier.scope === "ENTIRE_REQUEST", "long-context trigger/scope drift");
assert(longTier.input_price_multiplier === 2 && longTier.output_price_multiplier === 1.5 && longTier.threshold_includes_all_request_input === true, "long-context multiplier drift");
assert(costPlan.prohibited_cost_behaviors.includes("gpt-5.6-terra_to_gpt-5.6-sol_automatic_upgrade"), "Terra silent upgrade not prohibited");
assert(costPlan.prohibited_cost_behaviors.includes("gpt-5.6-luna_to_gpt-5.6-sol_automatic_upgrade"), "Luna silent upgrade not prohibited");

const requests = costPlan.query_surfacing_request_estimates.requests;
let requestCostLow = 0;
let requestCostHigh = 0;
for (const request of requests) {
  const tierLow = request.input_tokens_low > 272000 ? "LONG_CONTEXT" : "BASE";
  const tierHigh = request.input_tokens_high > 272000 ? "LONG_CONTEXT" : "BASE";
  assert(request.tier_low === tierLow && request.tier_high === tierHigh, `${request.cutoff_group_id}: tier drift`);
  const expectedLow = (request.input_tokens_low * 4 * (tierLow === "LONG_CONTEXT" ? 2 : 1) + 1500 * 20 * (tierLow === "LONG_CONTEXT" ? 1.5 : 1)) / 1_000_000;
  const expectedHigh = (request.input_tokens_high * 4 * (tierHigh === "LONG_CONTEXT" ? 2 : 1) + 2500 * 20 * (tierHigh === "LONG_CONTEXT" ? 1.5 : 1)) / 1_000_000;
  approx(request.cost_low, expectedLow, `${request.cutoff_group_id}: low cost`);
  approx(request.cost_high, expectedHigh, `${request.cutoff_group_id}: high cost`);
  requestCostLow += request.cost_low;
  requestCostHigh += request.cost_high;
}
assert(requests.filter((item) => item.tier_high === "LONG_CONTEXT").map((item) => item.cutoff_group_id).join(",") === "QCG-08,QCG-09,QCG-10,QCG-11,QCG-12", "long-context group set");
approx(requestCostLow, 9.16, "query surface low total");
approx(requestCostHigh, 21.551, "query surface high total");
const stageCostLow = costPlan.stage_estimates.reduce((sum, item) => sum + item.list_price_cost_low, 0);
const stageCostHigh = costPlan.stage_estimates.reduce((sum, item) => sum + item.list_price_cost_high, 0);
approx(stageCostLow, 16.98, "generation low total");
approx(stageCostHigh, 32.491, "generation high total");
approx(costPlan.totals.reserved_cost_low, stageCostLow * 1.25, "reserve low");
approx(costPlan.totals.reserved_cost_high, stageCostHigh * 1.25, "reserve high");
assert(costPlan.totals.planned_sol_calls === 22 && costPlan.totals.planned_terra_initial_calls === 40, "model call totals");
assert(costPlan.totals.planned_terra_repair_calls_default === 0 && costPlan.totals.planned_luna_calls_default === 0, "default contingency calls");

const canonicalFixture = { z: "甲", a: [true, null, 1, "Ａ\r\nx"], "€": "€" };
assert(hashJcs(canonicalFixture) === independentHashJcs(canonicalFixture), "cross-implementation JCS mismatch");
assert(hashJcs({ a: 1, b: 2 }) !== hashJcs({ a: "1", b: 2 }), "distinct JSON values share a fixture hash");
assert(hashJcs(JSON.parse("{\"surface_label\":\"甲\"}")) === hashJcs(JSON.parse("{\"surface_label\":\"\\u7532\"}")), "equivalent JSON values hash differently");
assert("Ａ\r\nx\rY".replace(/\r\n?/g, "\n").normalize("NFKC") === "A\nx\nY", "Unicode/newline normalization drift");
assert(process.versions.unicode === "17.0", `runtime Unicode ${process.versions.unicode}`);
const frameA = requestFrame({ b: 2, a: 1 }, Buffer.from("提示\n"), { safe: true }, Buffer.from("第一章\n"));
const frameB = requestFrame({ a: 1, b: 2 }, Buffer.from("提示\n"), { safe: false }, Buffer.from("第一章\n"));
assert(frameA.subarray(0, 8).toString("hex") === "5243515346310000" && frameA.at(-1) === 0, "request frame boundaries");
assert(createHash("sha256").update(frameA).digest("hex") !== createHash("sha256").update(frameB).digest("hex"), "distinct framed requests share fixture hash");

const goldReaders = goldSchema.properties.prohibited_reader_classes;
assert(goldReaders.minItems === 5 && goldReaders.maxItems === 5 && goldReaders.uniqueItems === true, "Gold reader cardinality");
assert(goldReaders.items.enum.length === 5 && goldReaders.items.enum.includes("ANSWER_BLIND_QUERY_SURFACE_MODEL"), "Gold answer-blind reader prohibition");
assert(goldSchema.properties.created_before_corpus.const === true && queryPlanSchema.properties.created_before_corpus.const === true, "Gold/query plan pre-prose flags");
assert(queryPlanSchema.properties.final_query_text_frozen_here.const === false, "final query text frozen before prose");
assert(eventsSchema.$defs.endpoint.additionalProperties === false && eventsSchema.$defs.endpoint.required.join(",") === "ref_type,ref_id", "relation endpoint contract");
assert(queryPlanSchema.$defs.requiredEvidenceSet.required.includes("supports_semantic_unit_ids"), "required evidence shape");
assert(queryPlanSchema.$defs.forbiddenEvidence.required.includes("forbidden_usage"), "forbidden evidence shape");
assert(manifestSchema.$defs.coverage.properties.unmapped_required_event_count.const === 0, "required Event coverage");
assert(manifestSchema.$defs.coverage.properties.unmapped_semantic_unit_count.const === 0, "semantic-unit coverage");
assert(manifestSchema.$defs.chapterEntry.properties.generation_attempt_count.maximum === 2, "manifest attempt cap");
assert(manifestSchema.$defs.chapterEntry.properties.invalid_generation_call_ids.maxItems === 1, "manifest invalid-attempt cap");
assert(manifestSchema.$defs.callEntry.properties.selection_policy.const === "NO_CANDIDATE_SELECTION", "manifest selection policy");

console.log(JSON.stringify({
  candidate: CANDIDATE,
  ancestry: {
    parent: CANDIDATE_PARENT,
    required_ancestors_present: true,
    repo_side_equivalent_return_tree: true,
    repo_side_equivalent_format_tree: true,
  },
  frozen_assets: {
    validator_version: VALIDATOR_VERSION,
    validator_sha256: validatorSha256,
    fixture_version: frozenFixture.schema_version,
    fixture_sha256: fixtureSha256,
    fixture_results: frozenFixtureResults,
  },
  independent_boundary_attacks: observedErrors,
  schemas: { parsed_spec_json: 13, strict_compiled: 8, nested_objects_closed: true, sha256: schemaHashes },
  boundedness: { case_families: 21, failure_families: 15, chapters: 40, target_characters: 260000, cutoff_groups: 12, queries: 72, stages: 9 },
  cost: { query_surface_low: requestCostLow, query_surface_high: requestCostHigh, total_low: stageCostLow, total_high: stageCostHigh, reserve_low: costPlan.totals.reserved_cost_low, reserve_high: costPlan.totals.reserved_cost_high },
  regressions: { pricing: true, canonicalization_and_framing: true, gold_reader: true, evidence_and_coverage: true, invalid_run_and_fresh_regenerate: true },
  downstream_assets_present: false,
}, null, 2));
