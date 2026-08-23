#!/usr/bin/env node

import { createHash } from "node:crypto";
import { lstat, readFile, readdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { fileURLToPath } from "node:url";
import { projectModelInput, validateCaseBundle } from "./validate-pilot.mjs";

const VERSION = "starlette-str01-checkpoint/v1";
const CASE_ID = "STR-01";
const STATUS = "checkpoint_not_frozen";
const CUTOFF = "2026-08-23T03:00:00Z";
const SOURCE_NUMBERS = [495, 500, 1692];
const CASE_FILES = [
  "manifest.json", "events.json", "tasks.json", "fact-gold.json", "oracle-state.json",
  "decision-references.json", "outcome-anchors.json",
];
const HASH_PATHS = ["str01-checkpoint.json", ...CASE_FILES.map((name) => `checkpoint/STR-01/${name}`)];
const SNAPSHOT_PATH = "promotion/contamination-snapshot.json";
const SNAPSHOT_SHA256 = "02361a573d0bcab37c0e617ddc4e5feb0cb44b93174d6ea029ae94c622527eb1";
const EMPTY_PROBES = Object.freeze({ constraints: [], decisions: [], resolved_issues: [], open_questions: [] });
const PARSER_ONLY_THRESHOLDS = Object.freeze({
  minimum_d2_token_reduction_ratio: 0,
  minimum_d2_constraint_retention: 0,
  minimum_d2_decision_continuity: 0,
  maximum_d2_resolved_issue_reopening: 0,
  minimum_d2_open_question_continuity: 0,
  minimum_d2_recall_recovery: 0,
  maximum_d2_mean_latency_ms: 0,
});

const SOURCE_EVENTS = [
  ["STR-01/E1","issue_body","gh:issue:495","issue","438578988","MDU6SXNzdWU0Mzg1Nzg5ODg=",495,"2019-04-30T02:19:41Z","2023-06-01T18:57:30Z","yihuang",null,"9c7736e9812922e6f6038f0a0954c2d82c88d9836ae6670c5782151d03db85bc"],
  ["STR-01/E2","issue_comment","gh:issue-comment:488205460","issue_comment","488205460","MDEyOklzc3VlQ29tbWVudDQ4ODIwNTQ2MA==",495,"2019-05-01T03:55:29Z","2019-05-01T04:19:25Z","blueyed",null,"499cb19835e0f4f526c4b90b40d045707009024db30fa89031c8b7266b800b62"],
  ["STR-01/E3","pull_request_body","gh:pr:500","pull_request","275466541","MDExOlB1bGxSZXF1ZXN0Mjc1NDY2NTQx",500,"2019-05-02T18:15:50Z","2019-05-20T14:15:54Z","ricardomomm","d388e06d16db09931e424db6ba767317393da17b","2d60eb17002477ee519f9e96e3d82168771b66a2f647bcfdfd55e91a2f124223"],
  ["STR-01/E4","pull_request_comment","gh:pr-comment:494006150","pull_request_comment","494006150","MDEyOklzc3VlQ29tbWVudDQ5NDAwNjE1MA==",500,"2019-05-20T14:15:53Z","2019-05-20T14:15:53Z","lovelydinosaur",null,"9193cd799ce494d0133e7f8a6a1f0294e91f4fa4ea9404414ca4bcb1dbb9122e"],
  ["STR-01/E5","issue_comment","gh:issue-comment:494008175","issue_comment","494008175","MDEyOklzc3VlQ29tbWVudDQ5NDAwODE3NQ==",495,"2019-05-20T14:20:46Z","2019-05-20T14:20:46Z","lovelydinosaur",null,"c542549559de27c3f1adfaf3b4e7ac862f2620685d4cd5c3c5679c1d6ae6229f"],
  ["STR-01/E6","issue_comment","gh:issue-comment:886876930","issue_comment","886876930","IC_kwDOCELT_M403KsC",495,"2021-07-26T17:08:46Z","2021-07-26T17:14:10Z","four43",null,"026674190ddfa016cd9d9c1d5c9182a489ec21f045c0bb3640ad4ae2299358af"],
  ["STR-01/E7","issue_comment","gh:issue-comment:1101403203","issue_comment","1101403203","IC_kwDOCELT_M5BphRD",495,"2022-04-18T13:19:37Z","2022-04-18T13:19:37Z","heyfavour",null,"aa53170cbb28d9f2298a12ed2e2f625341ff16e65f6f39b78e45b97badbcf1f4"],
  ["STR-01/E8","pull_request_body","gh:pr:1692","pull_request","967628660","PR_kwDOCELT_M45rNd0",1692,"2022-06-15T03:13:28Z","2023-10-30T15:44:14Z","adriangb",null,"09aaf24f68e660634770138b6d72973f600b896eb53ac1b6db64dd1b89018b89"],
  ["STR-01/E9","pull_request_comment","gh:pr-comment:1236394572","pull_request_comment","1236394572","IC_kwDOCELT_M5JseJM",1692,"2022-09-04T18:44:02Z","2022-09-04T18:51:53Z","adriangb",null,"bc75a09baf827f6b92ba2e590c29fd78538b8fad99a4676fb5d86eaf1b365c05"],
  ["STR-01/E10","issue_state","gh:issue-event:7329871772","issue_state_event","7329871772","RTE_lADOCELT_M5LyzvtzwAAAAG05Pec",1692,"2022-09-06T12:16:46Z",null,"adriangb",null,"c995a11d6793d10334fe87f8d707614f50b8c40b07579bafa417b708d8a3f4f1"],
  ["STR-01/E11","pull_request_comment","gh:pr-comment:1265515733","pull_request_comment","1265515733","IC_kwDOCELT_M5LbjzV",1692,"2022-10-03T14:19:41Z","2022-10-03T14:19:41Z","adriangb",null,"71e2f14bb33622396a0ba74d50fde03eed19eaeb7a96feb29d256f38c4d04196"],
  ["STR-01/E12","pull_request_comment","gh:pr-comment:1266401636","pull_request_comment","1266401636","IC_kwDOCELT_M5Le8Fk",1692,"2022-10-04T05:03:33Z","2022-10-04T05:03:33Z","adriangb",null,"fdf41537345dafc2af15d7547cccfdb1b7d8936fbd0cd599d12b406241fb8001"],
  ["STR-01/E13","issue_comment","gh:issue-comment:1522359931","issue_comment","1522359931","IC_kwDOCELT_M5avV57",495,"2023-04-25T20:15:26Z","2023-04-25T20:22:57Z","bricker",null,"b6925423f26241c117964b0fa27485710ae07e8ac50d780bf9991eb25770e645"],
  ["STR-01/E14","pull_request_comment","gh:pr-review-comment:1184692481","pull_request_comment","1184692481","PRRC_kwDOCELT_M5GnPkB",1692,"2023-05-04T08:19:59Z","2023-05-04T08:24:38Z","Kludex","ec382274541720a688131053ec7247c4c5965f8d","c48a9f24616a2ddf6926ab8b2bcffa553ac5af738b9be327798511b8a4b3fe69"],
  ["STR-01/E15","pull_request_comment","gh:pr-comment:1535152681","pull_request_comment","1535152681","IC_kwDOCELT_M5bgJIp",1692,"2023-05-04T17:31:47Z","2023-05-04T17:31:47Z","adriangb",null,"6ac66ca9ee2004e747eed0cebc0f198fa7865ffb0c08a65a90d95a613ca0ca44"],
  ["STR-01/E16","pull_request_review","gh:pr-review:1456104075","pull_request_review","1456104075","PRR_kwDOCELT_M5WymKL",1692,"2023-06-01T18:52:32Z","2023-06-01T18:52:32Z","Kludex","68efb83cf38784be7e89e0583923dca2055b733b","7e7d8d032c5b63bee32bd4bd9898bf2f154133a7d8e87ec46a616100d4a8e62d"],
  ["STR-01/E17","issue_state","gh:issue-event:9406862296","issue_state_event","9406862296","ME_lADOCELT_M5LyzvtzwAAAAIwsVPY",1692,"2023-06-01T18:57:28Z",null,"adriangb","554b9e21f6161a6d83b4ebb90909282114266317","0f6d165e08ed4f384c68f79d99dba45aa6aa1f76d89272ed38e65e79c488977e"],
  ["STR-01/E18","issue_state","gh:issue-event:9406862724","issue_state_event","9406862724","CE_lADOCELT_M4aJC8szwAAAAIwsVWE",495,"2023-06-01T18:57:30Z",null,"adriangb",null,"34d027004c787a23f8036d189456a425635cc66de0b48d0436d5b44f200823ed"],
];

const TIMELINE_CANONICAL = [
  ["STR-01/E10", { id: 7329871772, node_id: "RTE_lADOCELT_M5LyzvtzwAAAAG05Pec", event: "renamed", actor: "adriangb", created_at: "2022-09-06T12:16:46Z", commit_id: null, rename: { from: "Reuse Request's body buffer for downstream ASGI apps", to: "Reuse Request's body buffer for call_next in BaseHTTPMiddleware" } }, "c995a11d6793d10334fe87f8d707614f50b8c40b07579bafa417b708d8a3f4f1"],
  ["STR-01/E17", { id: 9406862296, node_id: "ME_lADOCELT_M5LyzvtzwAAAAIwsVPY", event: "merged", actor: "adriangb", created_at: "2023-06-01T18:57:28Z", commit_id: "554b9e21f6161a6d83b4ebb90909282114266317" }, "0f6d165e08ed4f384c68f79d99dba45aa6aa1f76d89272ed38e65e79c488977e"],
  ["STR-01/E18", { id: 9406862724, node_id: "CE_lADOCELT_M4aJC8szwAAAAIwsVWE", event: "closed", actor: "adriangb", created_at: "2023-06-01T18:57:30Z", commit_id: null }, "34d027004c787a23f8036d189456a425635cc66de0b48d0436d5b44f200823ed"],
];

export class Str01CheckpointValidationError extends Error {
  constructor(message) { super(message); this.name = "Str01CheckpointValidationError"; }
}

function fail(path, message) { throw new Str01CheckpointValidationError(`${path}: ${message}`); }
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
function exactArray(value, expected, path) {
  if (!isDeepStrictEqual(value, expected)) fail(path, `expected ${JSON.stringify(expected)}`);
  return value;
}
function falseValue(value, path) { if (value !== false) fail(path, "must remain false"); }
function sha256(value, path) {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value)) fail(path, "expected SHA-256 hex");
  return value;
}
function normalize(value) {
  return value.normalize("NFKC").toLocaleLowerCase("en-US").replace(/[\p{Cf}\p{Cc}]+/gu, "")
    .replace(/[\p{P}\p{S}]+/gu, " ").replace(/\s+/g, " ").trim();
}
async function readRegular(path) {
  try {
    const metadata = await lstat(path);
    if (!metadata.isFile() || metadata.isSymbolicLink()) fail(path, "expected regular file");
    return readFile(path);
  } catch (error) {
    if (error instanceof Str01CheckpointValidationError) throw error;
    fail(path, error instanceof Error ? error.message : "unable to read file");
  }
}
async function readJson(path) {
  try { return JSON.parse((await readRegular(path)).toString("utf8")); }
  catch (error) {
    if (error instanceof Str01CheckpointValidationError) throw error;
    fail(path, error instanceof Error ? error.message : "invalid JSON");
  }
}
async function hashFile(path) { return createHash("sha256").update(await readRegular(path)).digest("hex"); }
function hashCanonical(value) { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }

export async function computeStr01CheckpointHashEntries(root) {
  const targetRoot = resolve(root);
  return Promise.all(HASH_PATHS.map(async (path) => ({ path, sha256: await hashFile(join(targetRoot, path)) })));
}

export async function loadStr01Checkpoint(root) {
  const targetRoot = resolve(root);
  const caseRoot = join(targetRoot, "checkpoint", CASE_ID);
  exactArray((await readdir(caseRoot)).sort(), [...CASE_FILES].sort(), "checkpoint/STR-01 directory");
  const values = await Promise.all(CASE_FILES.map((name) => readJson(join(caseRoot, name))));
  return {
    root: targetRoot,
    wrapper: await readJson(join(targetRoot, "str01-checkpoint.json")),
    hashes: await readJson(join(targetRoot, "str01-checkpoint-hashes.json")),
    contaminationSnapshot: await readJson(join(targetRoot, SNAPSHOT_PATH)),
    bundle: { manifest: values[0], events: values[1], tasks: values[2], factGold: values[3], oracleState: values[4], decisionReferences: values[5], outcomeAnchors: values[6] },
  };
}

export function buildStr01StaticEvaluationSuite(bundle) {
  return {
    version: 2,
    cases: bundle.tasks.tasks.map((task) => {
      const projection = projectModelInput(bundle, task.id);
      const oracle = bundle.oracleState.states.find(({ slice_id }) => slice_id === task.id);
      if (!oracle) fail(task.id, "missing Oracle-State slice");
      return {
        id: task.id,
        session_id: task.segment_id,
        raw_events: projection.history_turns.map((turn, index) => {
          const content = JSON.stringify(turn);
          return { id: turn.id, session_id: task.segment_id, seq: index + 1, role: turn.role, content, event_type: turn.event_type, created_at: new Date(turn.occurred_at).toISOString(), token_count: Math.max(1, Math.ceil(content.length / 4)), metadata: {}, source_event_id: `starlette-v1:${turn.id}` };
        }),
        context_items: oracle.items.map((item) => ({ ...structuredClone(item), created_at: new Date(item.created_at).toISOString(), updated_at: new Date(item.updated_at).toISOString() })),
        state_relations: oracle.relations.map((relation) => ({ ...structuredClone(relation), created_at: new Date(relation.created_at).toISOString() })),
        current_input: projection.current_task,
        recent_raw_window_turns: task.recent_raw_window_turns,
        headlines: [], recall_queries: [], probes: structuredClone(EMPTY_PROBES),
      };
    }),
    thresholds: structuredClone(PARSER_ONLY_THRESHOLDS),
  };
}

function validateWrapper(value) {
  const wrapper = exact(value, ["schema_version","status","case_id","evidence_cutoff_at","source_numbers","case","contamination_snapshot","promotion_authorized","evaluation_ready","model_run_authorized","outcome_assertions"], "str01-checkpoint.json");
  if (wrapper.schema_version !== VERSION || wrapper.status !== STATUS || wrapper.case_id !== CASE_ID) fail("str01-checkpoint.json", "checkpoint identity changed");
  if (wrapper.evidence_cutoff_at !== CUTOFF) fail("str01-checkpoint.json.evidence_cutoff_at", "cutoff changed");
  exactArray(wrapper.source_numbers, SOURCE_NUMBERS, "str01-checkpoint.json.source_numbers");
  const caseRef = exact(wrapper.case, ["path","status","file_count"], "str01-checkpoint.json.case");
  if (caseRef.path !== "checkpoint/STR-01" || caseRef.status !== "canary_not_frozen" || caseRef.file_count !== 7) fail("str01-checkpoint.json.case", "case registration changed");
  const snapshot = exact(wrapper.contamination_snapshot, ["path","sha256","rule_version","result_status"], "str01-checkpoint.json.contamination_snapshot");
  if (snapshot.path !== SNAPSHOT_PATH || snapshot.sha256 !== SNAPSHOT_SHA256 || snapshot.rule_version !== "starlette-contamination-rule/v1" || snapshot.result_status !== "no_public_hit_found") fail("str01-checkpoint.json.contamination_snapshot", "accepted snapshot reference changed");
  falseValue(wrapper.promotion_authorized, "str01-checkpoint.json.promotion_authorized");
  falseValue(wrapper.evaluation_ready, "str01-checkpoint.json.evaluation_ready");
  falseValue(wrapper.model_run_authorized, "str01-checkpoint.json.model_run_authorized");
  const assertions = exact(wrapper.outcome_assertions, ["pr500_patch_merged","pr500_repository_test_delivered","pr1692_is_general_body_replay","endpoint_first_reread_supported","exception_handler_reread_supported","issue_close_proves_all_body_ownership_cases"], "str01-checkpoint.json.outcome_assertions");
  for (const key of Object.keys(assertions)) falseValue(assertions[key], `str01-checkpoint.json.outcome_assertions.${key}`);
}

function validateSnapshot(value) {
  const snapshot = object(value, SNAPSHOT_PATH);
  if (snapshot.schema_version !== "starlette-contamination-snapshot/v1" || snapshot.rule_version !== "starlette-contamination-rule/v1" || snapshot.evidence_cutoff_at !== CUTOFF) fail(SNAPSHOT_PATH, "snapshot identity or cutoff changed");
  const result = snapshot.results?.find?.((entry) => entry?.candidate_id === CASE_ID);
  if (!result || !isDeepStrictEqual(result.source_numbers, SOURCE_NUMBERS) || result.status !== "no_public_hit_found") fail(SNAPSHOT_PATH, "STR-01 contamination gate is not the accepted no-public-hit snapshot");
}

function validateSourceEvents(bundle) {
  for (const [index, expected] of SOURCE_EVENTS.entries()) {
    const [eventId,eventType,sourceId,kind,databaseId,nodeId,number,occurredAt,updatedAt,actor,commitSha,contentSha] = expected;
    const event = bundle.events.events[index];
    if (!event || event.id !== eventId || event.ordinal !== index + 1 || event.event_type !== eventType) fail(eventId, "source event identity or order changed");
    const actual = [event.source.source_id,event.source.kind,event.source.database_id,event.source.node_id,event.source.number,event.occurred_at,event.source_updated_at,event.actor,event.source.commit_sha,event.source_content_sha256];
    const contract = [sourceId,kind,databaseId,nodeId,number,occurredAt,updatedAt,actor,commitSha,contentSha];
    if (!isDeepStrictEqual(actual, contract)) fail(eventId, "audited GitHub source contract changed");
  }
  for (const [eventId, canonical, expectedHash] of TIMELINE_CANONICAL) {
    const event = bundle.events.events.find(({ id }) => id === eventId);
    if (!event || event.source_content_sha256 !== expectedHash || hashCanonical(canonical) !== expectedHash) fail(eventId, "canonical timeline contract changed");
  }
}

function validateTaskLeakage(bundle) {
  for (const [index, task] of bundle.tasks.tasks.entries()) {
    const ordinal = index + 1;
    const text = normalize(task.current_task);
    const forbidden = [];
    if (ordinal < 4) forbidden.push(/punt/, /closed unmerged/, /streaming contract.*undefined/);
    if (ordinal < 6) forbidden.push(/form.*stream consumed/, /body.*json.*cached/);
    if (ordinal < 8) forbidden.push(/pr 1692/);
    if (ordinal < 10) forbidden.push(/reuse.*body buffer.*call next/, /narrow.*call next/);
    if (ordinal < 11) forbidden.push(/endpoint first/, /exception handler.*reread/, /information.*upstream/);
    if (ordinal < 14) forbidden.push(/multi chunk/, /more body/);
    if (ordinal < 15) forbidden.push(/bug.*fixed/, /mark.*consum.*more body.*false/);
    if (ordinal < 16) forbidden.push(/formally approved/, /approval.*final head/);
    if (ordinal < 17) forbidden.push(/554b9e2/, /repository delivered/, /merged patch/);
    if (ordinal < 18) forbidden.push(/issue 495.*closed/, /tracker.*closed/);
    if (forbidden.some((pattern) => pattern.test(text))) fail(task.id, "Current Task contains future or Outcome answer content");
  }
}

function validateCaseSemantics(bundle) {
  const result = validateCaseBundle(bundle, CASE_ID);
  if (bundle.manifest.pilot_status !== "canary_not_frozen") fail("manifest.json.pilot_status", "checkpoint case status changed");
  if (bundle.manifest.tier !== "long" || bundle.manifest.segments.length !== 1) fail("manifest.json", "expected one long segment");
  const segment = bundle.manifest.segments[0];
  const eventIds = bundle.events.events.map(({ id }) => id);
  if (!isDeepStrictEqual(segment.information_increment_event_ids, eventIds)) fail("manifest.json.segments[0].information_increment_event_ids", "every retained event must remain an audited increment");
  if (eventIds.length !== 18 || bundle.tasks.tasks.length !== 18 || segment.slice_ids.length !== 18) fail("checkpoint/STR-01", "expected eighteen events and one slice per increment");
  for (const event of bundle.events.events) if (Date.parse(event.occurred_at) > Date.parse(CUTOFF)) fail(`${event.id}.occurred_at`, "evidence exceeds cutoff");
  exactArray([...new Set(bundle.events.events.map(({ source }) => source.number))].sort((a,b) => a-b), SOURCE_NUMBERS, "events.json source numbers");
  validateSourceEvents(bundle);
  validateTaskLeakage(bundle);

  if (bundle.factGold.facts.some(({ category }) => category === "resolved_issue")) fail("fact-gold.json", "tracker close must not be encoded as semantic resolution");
  for (const [id, category, firstKnown, superseded] of [
    ["STR-01/F4","rejected_alternative","STR-01/E4",null],
    ["STR-01/F5","constraint","STR-01/E5",null],
    ["STR-01/F8","open_question","STR-01/E8","STR-01/E10"],
    ["STR-01/F11","constraint","STR-01/E11",null],
    ["STR-01/F12","open_question","STR-01/E12","STR-01/E16"],
    ["STR-01/F14","open_question","STR-01/E14","STR-01/E15"],
    ["STR-01/F15","rejected_alternative","STR-01/E15",null],
    ["STR-01/F18","outcome_status","STR-01/E17",null],
    ["STR-01/F19","outcome_status","STR-01/E18",null],
  ]) {
    const fact = bundle.factGold.facts.find((entry) => entry.id === id);
    if (!fact || fact.category !== category || fact.first_known_at_event_id !== firstKnown || fact.superseded_at_event_id !== superseded) fail("fact-gold.json", `required boundary missing for ${id}`);
  }

  const stateAt = (sliceId) => bundle.oracleState.states.find(({ slice_id }) => slice_id === sliceId);
  const beforeMerge = stateAt("STR-01/T16");
  if (!beforeMerge || beforeMerge.items.some(({ id, status }) => id === "STR-01/I1" && status === "COMPLETED")) fail("oracle-state.json STR-01/T16", "approval cannot mark repository delivery complete");
  const finalState = stateAt("STR-01/T18");
  for (const [id, status] of [["STR-01/I1","COMPLETED"],["STR-01/I4","REJECTED"],["STR-01/I5","ACTIVE"],["STR-01/I9","ACTIVE"],["STR-01/I10","ACTIVE"],["STR-01/I13","REJECTED"],["STR-01/I14","ACTIVE"]]) {
    if (!finalState?.items.some((item) => item.id === id && item.status === status)) fail("oracle-state.json STR-01/T18", `final durable state missing ${id}:${status}`);
  }

  if (bundle.outcomeAnchors.anchors.length !== 4) fail("outcome-anchors.json", "expected exactly four outcome anchors");
  const rejected = bundle.outcomeAnchors.anchors.find(({ id }) => id === "STR-01/O1");
  if (!rejected || rejected.kind !== "design_resolution" || rejected.source.commit_sha !== null || !/merged_at null/i.test(rejected.limitations)) fail("STR-01/O1", "PR 500 closed-unmerged boundary missing");
  const merged = bundle.outcomeAnchors.anchors.find(({ id }) => id === "STR-01/O2");
  if (!merged || merged.kind !== "patch_merged" || merged.source.commit_sha !== "554b9e21f6161a6d83b4ebb90909282114266317" || !/not general replay/i.test(merged.limitations)) fail("STR-01/O2", "narrow merged patch boundary missing");
  const tests = bundle.outcomeAnchors.anchors.find(({ id }) => id === "STR-01/O3");
  if (!tests || tests.kind !== "regression_test" || tests.artifact_urls.length !== 2 || !/do not turn explicitly unsupported/i.test(tests.limitations)) fail("STR-01/O3", "regression test boundary missing");
  const closed = bundle.outcomeAnchors.anchors.find(({ id }) => id === "STR-01/O4");
  if (!closed || closed.kind !== "issue_closed" || !/does not prove every request-body ownership order/i.test(closed.limitations)) fail("STR-01/O4", "tracker close limitation missing");

  for (const task of bundle.tasks.tasks) {
    const projection = projectModelInput(bundle, task.id);
    exactArray(Object.keys(projection), ["schema_version","history_turns","current_task"], `${task.id} projection envelope`);
    if (projection.history_turns.length !== task.available_event_ids.length) fail(task.id, "projection prefix length changed");
    for (const turn of projection.history_turns) exactArray(Object.keys(turn), ["id","role","event_type","occurred_at","actor","summary"], `${task.id} projected turn`);
    const projectionText = JSON.stringify(projection);
    for (const forbidden of [bundle.events.events[0].source.node_id,bundle.events.events[0].source_content_sha256,bundle.factGold.facts[0].statement,bundle.oracleState.states[0].items[0].content,bundle.decisionReferences.references[0].id,bundle.outcomeAnchors.anchors[0].summary]) {
      if (projectionText.includes(forbidden)) fail(task.id, "non-input artifact leaked into projection");
    }
  }
  return result;
}

function validateHashManifest(value, expectedEntries) {
  const hashes = exact(value, ["schema_version","status","algorithm","files"], "str01-checkpoint-hashes.json");
  if (hashes.schema_version !== VERSION || hashes.status !== STATUS || hashes.algorithm !== "sha256") fail("str01-checkpoint-hashes.json", "hash manifest identity changed");
  if (!Array.isArray(hashes.files) || hashes.files.length !== HASH_PATHS.length) fail("str01-checkpoint-hashes.json.files", "expected eight entries");
  const actualEntries = hashes.files.map((entry,index) => {
    const item = exact(entry, ["path","sha256"], `str01-checkpoint-hashes.json.files[${index}]`);
    if (item.path !== HASH_PATHS[index]) fail(`str01-checkpoint-hashes.json.files[${index}].path`, "path or order changed");
    sha256(item.sha256, `str01-checkpoint-hashes.json.files[${index}].sha256`);
    return item;
  });
  if (!isDeepStrictEqual(actualEntries, expectedEntries)) fail("str01-checkpoint-hashes.json.files", "checkpoint content hash mismatch");
}

export async function validateStr01Checkpoint(root) {
  const loaded = await loadStr01Checkpoint(root);
  validateWrapper(loaded.wrapper);
  validateSnapshot(loaded.contaminationSnapshot);
  if (await hashFile(join(loaded.root, SNAPSHOT_PATH)) !== SNAPSHOT_SHA256) fail(SNAPSHOT_PATH, "accepted snapshot hash changed");
  const caseResult = validateCaseSemantics(loaded.bundle);
  validateHashManifest(loaded.hashes, await computeStr01CheckpointHashEntries(loaded.root));
  return {
    schema_version: VERSION, status: STATUS, case_id: CASE_ID, tier: loaded.bundle.manifest.tier,
    event_count: caseResult.events, information_increment_count: loaded.bundle.manifest.segments[0].information_increment_event_ids.length,
    slice_count: caseResult.slices, source_number_count: SOURCE_NUMBERS.length, audited_source_count: SOURCE_EVENTS.length,
    state_canonical_hash_count: TIMELINE_CANONICAL.length, outcome_anchor_count: loaded.bundle.outcomeAnchors.anchors.length,
    projection_turn_count: loaded.bundle.tasks.tasks.reduce((sum, task) => sum + task.available_event_ids.length, 0),
    promotion_authorized: false, evaluation_ready: false, model_run_authorized: false, hashes_verified: true,
  };
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : null;
if (invokedPath === fileURLToPath(import.meta.url)) {
  const requestedRoot = process.argv[2] ? resolve(process.argv[2]) : dirname(fileURLToPath(import.meta.url));
  validateStr01Checkpoint(requestedRoot)
    .then((result) => process.stdout.write(`${JSON.stringify(result)}\n`))
    .catch((error) => { process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`); process.exitCode = 1; });
}
