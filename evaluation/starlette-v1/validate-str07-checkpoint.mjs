#!/usr/bin/env node

import { createHash } from "node:crypto";
import { lstat, readFile, readdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { fileURLToPath } from "node:url";
import { projectModelInput, validateCaseBundle } from "./validate-pilot.mjs";

const VERSION = "starlette-str07-checkpoint/v1";
const CASE_ID = "STR-07";
const STATUS = "checkpoint_not_frozen";
const CUTOFF = "2026-08-23T03:00:00Z";
const SOURCE_NUMBERS = [1008, 1010];
const CASE_FILES = [
  "manifest.json",
  "events.json",
  "tasks.json",
  "fact-gold.json",
  "oracle-state.json",
  "decision-references.json",
  "outcome-anchors.json",
];
const HASH_PATHS = ["str07-checkpoint.json", ...CASE_FILES.map((name) => `checkpoint/STR-07/${name}`)];
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
  ["STR-07/E1", "issue_body", "gh:issue:1008", "issue", "664629026", "MDU6SXNzdWU2NjQ2MjkwMjY=", 1008, "2020-07-23T16:55:59Z", "2020-09-30T03:52:35Z", "curtiscook", null, "e114337b8d296fb0a16bba8f7b296a8bb277ffc7add026ae98874c2272b287d8"],
  ["STR-07/E2", "issue_comment", "gh:issue-comment:663614196", "issue_comment", "663614196", "MDEyOklzc3VlQ29tbWVudDY2MzYxNDE5Ng==", 1008, "2020-07-24T16:09:35Z", "2020-07-24T16:13:54Z", "JulienRobitaille", null, "ad2150900577884ff09bee465347276c5709741c4ff2cdf7fc8c60de91cc1b1c"],
  ["STR-07/E3", "pull_request_body", "gh:pr:1010", "pull_request", "456633530", "MDExOlB1bGxSZXF1ZXN0NDU2NjMzNTMw", 1010, "2020-07-25T16:11:00Z", "2020-10-27T14:43:28Z", "JulienRobitaille", "503e95931b3be47fb606069698cc1d6558c91f33", "4608ca940e215aa4ef9e77edda7569dfaa9995b50736314ee5ffb625da83be62"],
  ["STR-07/E4", "pull_request_comment", "gh:pr-comment:664182957", "pull_request_comment", "664182957", "MDEyOklzc3VlQ29tbWVudDY2NDE4Mjk1Nw==", 1010, "2020-07-27T07:55:26Z", "2020-07-27T07:55:26Z", "lovelydinosaur", null, "d0ddd7f93f544af2e6e2f70e4d850e939e1eac9b85535aad04526045625e221a"],
  ["STR-07/E5", "issue_comment", "gh:issue-comment:664573918", "issue_comment", "664573918", "MDEyOklzc3VlQ29tbWVudDY2NDU3MzkxOA==", 1008, "2020-07-27T18:48:24Z", "2020-07-27T18:48:24Z", "tarioch", null, "5197f96143655c0a947a04c666ecdbfe498c3336770f9ea96ac4c04c81af852e"],
  ["STR-07/E6", "issue_comment", "gh:issue-comment:664875431", "issue_comment", "664875431", "MDEyOklzc3VlQ29tbWVudDY2NDg3NTQzMQ==", 1008, "2020-07-28T08:46:28Z", "2020-07-28T08:46:28Z", "lovelydinosaur", null, "f6292e5371f3501bf236beb345629a66e58b370c9d6a39f4b62c5fdbd0212f05"],
  ["STR-07/E7", "issue_comment", "gh:issue-comment:664972962", "issue_comment", "664972962", "MDEyOklzc3VlQ29tbWVudDY2NDk3Mjk2Mg==", 1008, "2020-07-28T10:55:54Z", "2020-07-28T10:55:54Z", "curtiscook", null, "f859bc3bda00bf79338bef6889be6f93f2debe2c43bf8485434761a10926ca6b"],
  ["STR-07/E8", "issue_comment", "gh:issue-comment:664992297", "issue_comment", "664992297", "MDEyOklzc3VlQ29tbWVudDY2NDk5MjI5Nw==", 1008, "2020-07-28T11:44:32Z", "2020-07-28T11:44:32Z", "lovelydinosaur", null, "d26bb48af5327eda9df73f07db03300289eb1b5707db6b700026977fa129d850"],
  ["STR-07/E9", "issue_comment", "gh:issue-comment:665152933", "issue_comment", "665152933", "MDEyOklzc3VlQ29tbWVudDY2NTE1MjkzMw==", 1008, "2020-07-28T16:50:20Z", "2020-07-28T16:50:20Z", "tarioch", null, "7fc55a94acb526de28ed823b5aaf6145532873dd932ca9b2e56a0414f2149b9c"],
  ["STR-07/E10", "issue_comment", "gh:issue-comment:666997766", "issue_comment", "666997766", "MDEyOklzc3VlQ29tbWVudDY2Njk5Nzc2Ng==", 1008, "2020-07-31T08:16:35Z", "2020-07-31T08:16:56Z", "curtiscook", null, "4dfc2fa12b33aa06c62dbd0177aac276285476977d5a5aea3a36639cd4589e89"],
];

export class Str07CheckpointValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "Str07CheckpointValidationError";
  }
}

function fail(path, message) {
  throw new Str07CheckpointValidationError(`${path}: ${message}`);
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

function exactArray(value, expected, path) {
  if (!isDeepStrictEqual(value, expected)) fail(path, `expected ${JSON.stringify(expected)}`);
  return value;
}

function falseValue(value, path) {
  if (value !== false) fail(path, "must remain false");
}

function sha256(value, path) {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value)) fail(path, "expected SHA-256 hex");
  return value;
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

async function readRegular(path) {
  try {
    const metadata = await lstat(path);
    if (!metadata.isFile() || metadata.isSymbolicLink()) fail(path, "expected regular file");
    return readFile(path);
  } catch (error) {
    if (error instanceof Str07CheckpointValidationError) throw error;
    fail(path, error instanceof Error ? error.message : "unable to read file");
  }
}

async function readJson(path) {
  try {
    return JSON.parse((await readRegular(path)).toString("utf8"));
  } catch (error) {
    if (error instanceof Str07CheckpointValidationError) throw error;
    fail(path, error instanceof Error ? error.message : "invalid JSON");
  }
}

async function hashFile(path) {
  return createHash("sha256").update(await readRegular(path)).digest("hex");
}

export async function computeStr07CheckpointHashEntries(root) {
  const targetRoot = resolve(root);
  return Promise.all(HASH_PATHS.map(async (path) => ({ path, sha256: await hashFile(join(targetRoot, path)) })));
}

export async function loadStr07Checkpoint(root) {
  const targetRoot = resolve(root);
  const caseRoot = join(targetRoot, "checkpoint", CASE_ID);
  exactArray((await readdir(caseRoot)).sort(), [...CASE_FILES].sort(), "checkpoint/STR-07 directory");
  const values = await Promise.all(CASE_FILES.map((name) => readJson(join(caseRoot, name))));
  return {
    root: targetRoot,
    wrapper: await readJson(join(targetRoot, "str07-checkpoint.json")),
    hashes: await readJson(join(targetRoot, "str07-checkpoint-hashes.json")),
    contaminationSnapshot: await readJson(join(targetRoot, SNAPSHOT_PATH)),
    bundle: {
      manifest: values[0], events: values[1], tasks: values[2], factGold: values[3], oracleState: values[4],
      decisionReferences: values[5], outcomeAnchors: values[6],
    },
  };
}

export function buildStr07StaticEvaluationSuite(bundle) {
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
          return {
            id: turn.id,
            session_id: task.segment_id,
            seq: index + 1,
            role: turn.role,
            content,
            event_type: turn.event_type,
            created_at: new Date(turn.occurred_at).toISOString(),
            token_count: Math.max(1, Math.ceil(content.length / 4)),
            metadata: {},
            source_event_id: `starlette-v1:${turn.id}`,
          };
        }),
        context_items: oracle.items.map((item) => ({
          ...structuredClone(item),
          created_at: new Date(item.created_at).toISOString(),
          updated_at: new Date(item.updated_at).toISOString(),
        })),
        state_relations: oracle.relations.map((relation) => ({
          ...structuredClone(relation),
          created_at: new Date(relation.created_at).toISOString(),
        })),
        current_input: projection.current_task,
        recent_raw_window_turns: task.recent_raw_window_turns,
        headlines: [],
        recall_queries: [],
        probes: structuredClone(EMPTY_PROBES),
      };
    }),
    thresholds: structuredClone(PARSER_ONLY_THRESHOLDS),
  };
}

function validateWrapper(value) {
  const wrapper = exact(value, [
    "schema_version", "status", "case_id", "evidence_cutoff_at", "source_numbers", "case",
    "contamination_snapshot", "promotion_authorized", "evaluation_ready", "model_run_authorized", "outcome_assertions",
  ], "str07-checkpoint.json");
  if (wrapper.schema_version !== VERSION || wrapper.status !== STATUS || wrapper.case_id !== CASE_ID) {
    fail("str07-checkpoint.json", "checkpoint identity changed");
  }
  if (wrapper.evidence_cutoff_at !== CUTOFF) fail("str07-checkpoint.json.evidence_cutoff_at", "cutoff changed");
  exactArray(wrapper.source_numbers, SOURCE_NUMBERS, "str07-checkpoint.json.source_numbers");
  const caseRef = exact(wrapper.case, ["path", "status", "file_count"], "str07-checkpoint.json.case");
  if (caseRef.path !== "checkpoint/STR-07" || caseRef.status !== "canary_not_frozen" || caseRef.file_count !== 7) {
    fail("str07-checkpoint.json.case", "case registration changed");
  }
  const snapshot = exact(wrapper.contamination_snapshot, ["path", "sha256", "rule_version", "result_status"], "str07-checkpoint.json.contamination_snapshot");
  if (
    snapshot.path !== SNAPSHOT_PATH || snapshot.sha256 !== SNAPSHOT_SHA256 ||
    snapshot.rule_version !== "starlette-contamination-rule/v1" || snapshot.result_status !== "no_public_hit_found"
  ) fail("str07-checkpoint.json.contamination_snapshot", "accepted snapshot reference changed");
  falseValue(wrapper.promotion_authorized, "str07-checkpoint.json.promotion_authorized");
  falseValue(wrapper.evaluation_ready, "str07-checkpoint.json.evaluation_ready");
  falseValue(wrapper.model_run_authorized, "str07-checkpoint.json.model_run_authorized");
  const assertions = exact(wrapper.outcome_assertions, [
    "pr_patch_merged", "repository_regression_test_delivered", "issue_close_proves_all_use_cases", "general_regex_is_supported_api",
  ], "str07-checkpoint.json.outcome_assertions");
  for (const key of Object.keys(assertions)) falseValue(assertions[key], `str07-checkpoint.json.outcome_assertions.${key}`);
}

function validateSnapshot(value) {
  const snapshot = object(value, SNAPSHOT_PATH);
  if (
    snapshot.schema_version !== "starlette-contamination-snapshot/v1" ||
    snapshot.rule_version !== "starlette-contamination-rule/v1" || snapshot.evidence_cutoff_at !== CUTOFF
  ) fail(SNAPSHOT_PATH, "snapshot identity or cutoff changed");
  const result = snapshot.results?.find?.((entry) => entry?.candidate_id === CASE_ID);
  if (!result || !isDeepStrictEqual(result.source_numbers, SOURCE_NUMBERS) || result.status !== "no_public_hit_found") {
    fail(SNAPSHOT_PATH, "STR-07 contamination gate is not the accepted no-public-hit snapshot");
  }
}

function validateSourceEvents(bundle) {
  for (const [index, expected] of SOURCE_EVENTS.entries()) {
    const [eventId, eventType, sourceId, kind, databaseId, nodeId, number, occurredAt, updatedAt, actor, commitSha, contentSha] = expected;
    const event = bundle.events.events[index];
    if (!event || event.id !== eventId || event.ordinal !== index + 1 || event.event_type !== eventType) {
      fail(eventId, "source event identity or order changed");
    }
    const actual = [
      event.source.source_id, event.source.kind, event.source.database_id, event.source.node_id, event.source.number,
      event.occurred_at, event.source_updated_at, event.actor, event.source.commit_sha, event.source_content_sha256,
    ];
    const contract = [sourceId, kind, databaseId, nodeId, number, occurredAt, updatedAt, actor, commitSha, contentSha];
    if (!isDeepStrictEqual(actual, contract)) fail(eventId, "audited GitHub source contract changed");
  }
}

function validateTaskLeakage(bundle) {
  for (const [index, task] of bundle.tasks.tasks.entries()) {
    const ordinal = index + 1;
    const text = normalize(task.current_task);
    const forbidden = [];
    if (ordinal < 6) forbidden.push(/uri templating/, /path converter/, /general regex (?:was|is|has) (?:never|not)/);
    if (ordinal < 7) forbidden.push(/cors/);
    if (ordinal < 8) forbidden.push(/revert/);
    if (ordinal < 10) forbidden.push(/dual route/, /register (?:both|two) route/, /stack (?:both|two) route/);
    forbidden.push(/closed without merge/, /merged at null/, /tests? (?:never|did not) enter(?:ed)? the repository/);
    if (forbidden.some((pattern) => pattern.test(text))) fail(task.id, "Current Task contains future or Outcome answer content");
  }
}

function validateCaseSemantics(bundle) {
  const result = validateCaseBundle(bundle, CASE_ID);
  if (bundle.manifest.pilot_status !== "canary_not_frozen") fail("manifest.json.pilot_status", "checkpoint case status changed");
  if (bundle.manifest.tier !== "long" || bundle.manifest.segments.length !== 1) fail("manifest.json", "expected one long segment");
  const segment = bundle.manifest.segments[0];
  const eventIds = bundle.events.events.map(({ id }) => id);
  if (!isDeepStrictEqual(segment.information_increment_event_ids, eventIds)) {
    fail("manifest.json.segments[0].information_increment_event_ids", "every retained event must remain an audited increment");
  }
  if (eventIds.length !== 10 || bundle.tasks.tasks.length !== 10 || segment.slice_ids.length !== 10) {
    fail("checkpoint/STR-07", "expected ten events and one slice per increment");
  }
  for (const event of bundle.events.events) {
    if (Date.parse(event.occurred_at) > Date.parse(CUTOFF)) fail(`${event.id}.occurred_at`, "evidence exceeds cutoff");
  }
  exactArray([...new Set(bundle.events.events.map(({ source }) => source.number))].sort((a, b) => a - b), SOURCE_NUMBERS, "events.json source numbers");
  validateSourceEvents(bundle);
  validateTaskLeakage(bundle);

  if (bundle.factGold.facts.some(({ category }) => category === "resolved_issue")) {
    fail("fact-gold.json", "tracker close must not be encoded as semantic resolution");
  }
  const requiredFacts = [
    ["STR-07/F4", "rejected_alternative", "STR-07/E4"],
    ["STR-07/F7", "constraint", "STR-07/E6"],
    ["STR-07/F9", "constraint", "STR-07/E7"],
    ["STR-07/F10", "open_question", "STR-07/E8"],
    ["STR-07/F12", "decision", "STR-07/E10"],
  ];
  for (const [id, category, firstKnown] of requiredFacts) {
    const fact = bundle.factGold.facts.find((entry) => entry.id === id);
    if (!fact || fact.category !== category || fact.first_known_at_event_id !== firstKnown) {
      fail("fact-gold.json", `required evidence boundary missing for ${id}`);
    }
  }
  const proposal = bundle.factGold.facts.find(({ id }) => id === "STR-07/F3");
  if (!proposal || proposal.superseded_at_event_id !== "STR-07/E4") fail("STR-07/F3", "unmerged proposal supersession missing");

  const stateAt = (sliceId) => bundle.oracleState.states.find(({ slice_id }) => slice_id === sliceId);
  for (const sliceId of ["STR-07/T4", "STR-07/T6", "STR-07/T8"]) {
    const state = stateAt(sliceId);
    if (!state || state.items.some(({ status }) => status === "RESOLVED" || status === "COMPLETED")) {
      fail(`oracle-state.json ${sliceId}`, "maintainer rejection or tracker close cannot resolve all use cases");
    }
  }
  const finalState = stateAt("STR-07/T10");
  if (!finalState.items.some(({ id, status }) => id === "STR-07/I1" && status === "RESOLVED")) {
    fail("oracle-state.json STR-07/T10", "explicit dual-route workaround must resolve only the operational root-path question");
  }
  if (!finalState.items.some(({ id, status }) => id === "STR-07/I8" && status === "DEFERRED")) {
    fail("oracle-state.json STR-07/T10", "release and documentation uncertainty must remain deferred");
  }
  if (!finalState.relations.some(({ source_id, relation_type, target_id }) =>
    source_id === "STR-07/I1" && relation_type === "RESOLVED_BY" && target_id === "STR-07/I9")) {
    fail("oracle-state.json STR-07/T10", "operational resolution must come from the explicit workaround");
  }

  if (bundle.outcomeAnchors.anchors.length !== 2) fail("outcome-anchors.json", "expected exactly two outcome anchors");
  const prOutcome = bundle.outcomeAnchors.anchors.find(({ id }) => id === "STR-07/O1");
  if (
    !prOutcome || prOutcome.kind !== "design_resolution" || prOutcome.source.commit_sha !== null ||
    !/merged_at null/i.test(prOutcome.limitations) || !/never entered the repository/i.test(prOutcome.limitations)
  ) fail("STR-07/O1", "closed-unmerged PR boundary missing");
  const issueOutcome = bundle.outcomeAnchors.anchors.find(({ id }) => id === "STR-07/O2");
  if (!issueOutcome || issueOutcome.kind !== "issue_closed" || !/no .*patch or regression test was merged/i.test(issueOutcome.limitations)) {
    fail("STR-07/O2", "tracker closure limitation missing");
  }

  for (const task of bundle.tasks.tasks) {
    const projection = projectModelInput(bundle, task.id);
    exactArray(Object.keys(projection), ["schema_version", "history_turns", "current_task"], `${task.id} projection envelope`);
    if (projection.history_turns.length !== task.available_event_ids.length) fail(task.id, "projection prefix length changed");
    for (const turn of projection.history_turns) {
      exactArray(Object.keys(turn), ["id", "role", "event_type", "occurred_at", "actor", "summary"], `${task.id} projected turn`);
    }
    const projectionText = JSON.stringify(projection);
    for (const forbidden of [
      bundle.events.events[0].source.node_id,
      bundle.events.events[0].source_content_sha256,
      bundle.factGold.facts[0].statement,
      bundle.oracleState.states[0].items[0].content,
      bundle.decisionReferences.references[0].id,
      bundle.outcomeAnchors.anchors[0].summary,
    ]) if (projectionText.includes(forbidden)) fail(task.id, "non-input artifact leaked into projection");
  }
  return result;
}

function validateHashManifest(value, expectedEntries) {
  const hashes = exact(value, ["schema_version", "status", "algorithm", "files"], "str07-checkpoint-hashes.json");
  if (hashes.schema_version !== VERSION || hashes.status !== STATUS || hashes.algorithm !== "sha256") {
    fail("str07-checkpoint-hashes.json", "hash manifest identity changed");
  }
  if (!Array.isArray(hashes.files) || hashes.files.length !== HASH_PATHS.length) fail("str07-checkpoint-hashes.json.files", "expected eight entries");
  const actualEntries = hashes.files.map((entry, index) => {
    const item = exact(entry, ["path", "sha256"], `str07-checkpoint-hashes.json.files[${index}]`);
    if (item.path !== HASH_PATHS[index]) fail(`str07-checkpoint-hashes.json.files[${index}].path`, "path or order changed");
    sha256(item.sha256, `str07-checkpoint-hashes.json.files[${index}].sha256`);
    return item;
  });
  if (!isDeepStrictEqual(actualEntries, expectedEntries)) fail("str07-checkpoint-hashes.json.files", "checkpoint content hash mismatch");
}

export async function validateStr07Checkpoint(root) {
  const loaded = await loadStr07Checkpoint(root);
  validateWrapper(loaded.wrapper);
  validateSnapshot(loaded.contaminationSnapshot);
  if (await hashFile(join(loaded.root, SNAPSHOT_PATH)) !== SNAPSHOT_SHA256) fail(SNAPSHOT_PATH, "accepted snapshot hash changed");
  const caseResult = validateCaseSemantics(loaded.bundle);
  validateHashManifest(loaded.hashes, await computeStr07CheckpointHashEntries(loaded.root));
  return {
    schema_version: VERSION,
    status: STATUS,
    case_id: CASE_ID,
    tier: loaded.bundle.manifest.tier,
    event_count: caseResult.events,
    information_increment_count: loaded.bundle.manifest.segments[0].information_increment_event_ids.length,
    slice_count: caseResult.slices,
    source_number_count: SOURCE_NUMBERS.length,
    audited_source_count: SOURCE_EVENTS.length,
    outcome_anchor_count: loaded.bundle.outcomeAnchors.anchors.length,
    projection_turn_count: loaded.bundle.tasks.tasks.reduce((sum, task) => sum + task.available_event_ids.length, 0),
    promotion_authorized: false,
    evaluation_ready: false,
    model_run_authorized: false,
    hashes_verified: true,
  };
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : null;
if (invokedPath === fileURLToPath(import.meta.url)) {
  const requestedRoot = process.argv[2] ? resolve(process.argv[2]) : dirname(fileURLToPath(import.meta.url));
  validateStr07Checkpoint(requestedRoot)
    .then((result) => process.stdout.write(`${JSON.stringify(result)}\n`))
    .catch((error) => {
      process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      process.exitCode = 1;
    });
}
