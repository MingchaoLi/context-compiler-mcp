#!/usr/bin/env node

import { createHash } from "node:crypto";
import { lstat, readFile, readdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { fileURLToPath } from "node:url";
import {
  hashIssueStateEvent,
  projectModelInput,
  validateCaseBundle,
} from "./validate-pilot.mjs";

const VERSION = "starlette-str06-checkpoint/v1";
const CASE_ID = "STR-06";
const STATUS = "checkpoint_not_frozen";
const CUTOFF = "2026-08-23T03:00:00Z";
const SOURCE_NUMBERS = [1365, 1366, 1410];
const CASE_FILES = [
  "manifest.json",
  "events.json",
  "tasks.json",
  "fact-gold.json",
  "oracle-state.json",
  "decision-references.json",
  "outcome-anchors.json",
];
const HASH_PATHS = [
  "str06-checkpoint.json",
  ...CASE_FILES.map((name) => `checkpoint/STR-06/${name}`),
];
const SNAPSHOT_PATH = "promotion/contamination-snapshot.json";
const SNAPSHOT_SHA256 = "02361a573d0bcab37c0e617ddc4e5feb0cb44b93174d6ea029ae94c622527eb1";
const STATE_EVENTS = [
  {
    event_id: "STR-06/E7",
    id: 5784383679,
    node_id: "CE_lADOCELT_M5AZN3SzwAAAAFYxrC_",
    event: "closed",
    actor: "adriangb",
    created_at: "2021-12-17T12:37:33Z",
    commit_id: "0aef1724cfafbe23f846979d427a5a173667f6b7",
    sha256: "699cfa012d29203c4b4eb6007f57d34bf2f4e806e909de590bd35017f42ccd62",
  },
  {
    event_id: "STR-06/E13",
    id: 5890858859,
    node_id: "REE_lADOCELT_M5AZN3SzwAAAAFfH19r",
    event: "reopened",
    actor: "adriangb",
    created_at: "2022-01-13T22:26:11Z",
    commit_id: null,
    sha256: "2f0a0eb72975129ab3613762832ad1cbc0bc63b26eb1fe4079cf4c0aaef4e66c",
  },
  {
    event_id: "STR-06/E16",
    id: 5893584617,
    node_id: "CE_lADOCELT_M5AZN3SzwAAAAFfSPbp",
    event: "closed",
    actor: "Kludex",
    created_at: "2022-01-14T09:40:19Z",
    commit_id: "7d79ad96d5aaee71f16ac9f4e41072e81d18ab86",
    sha256: "8ca129fbc4138b9fc098db0336b4e0ab56d30b5fd73663180226d87c043d7462",
  },
];

export class Str06CheckpointValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "Str06CheckpointValidationError";
  }
}

function fail(path, message) {
  throw new Str06CheckpointValidationError(`${path}: ${message}`);
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

async function readRegular(path) {
  try {
    const metadata = await lstat(path);
    if (!metadata.isFile() || metadata.isSymbolicLink()) fail(path, "expected regular file");
    return readFile(path);
  } catch (error) {
    if (error instanceof Str06CheckpointValidationError) throw error;
    fail(path, error instanceof Error ? error.message : "unable to read file");
  }
}

async function readJson(path) {
  try {
    return JSON.parse((await readRegular(path)).toString("utf8"));
  } catch (error) {
    if (error instanceof Str06CheckpointValidationError) throw error;
    fail(path, error instanceof Error ? error.message : "invalid JSON");
  }
}

async function hashFile(path) {
  return createHash("sha256").update(await readRegular(path)).digest("hex");
}

export async function computeStr06CheckpointHashEntries(root) {
  const targetRoot = resolve(root);
  return Promise.all(HASH_PATHS.map(async (path) => ({ path, sha256: await hashFile(join(targetRoot, path)) })));
}

export async function loadStr06Checkpoint(root) {
  const targetRoot = resolve(root);
  const caseRoot = join(targetRoot, "checkpoint", CASE_ID);
  const directoryEntries = (await readdir(caseRoot)).sort();
  exactArray(directoryEntries, [...CASE_FILES].sort(), "checkpoint/STR-06 directory");
  const values = await Promise.all(CASE_FILES.map((name) => readJson(join(caseRoot, name))));
  return {
    root: targetRoot,
    wrapper: await readJson(join(targetRoot, "str06-checkpoint.json")),
    hashes: await readJson(join(targetRoot, "str06-checkpoint-hashes.json")),
    contaminationSnapshot: await readJson(join(targetRoot, SNAPSHOT_PATH)),
    bundle: {
      manifest: values[0],
      events: values[1],
      tasks: values[2],
      factGold: values[3],
      oracleState: values[4],
      decisionReferences: values[5],
      outcomeAnchors: values[6],
    },
  };
}

function validateWrapper(value) {
  const wrapper = exact(value, [
    "schema_version", "status", "case_id", "evidence_cutoff_at", "source_numbers", "case",
    "contamination_snapshot", "promotion_authorized", "evaluation_ready", "model_run_authorized",
    "outcome_assertions",
  ], "str06-checkpoint.json");
  if (wrapper.schema_version !== VERSION || wrapper.status !== STATUS || wrapper.case_id !== CASE_ID) {
    fail("str06-checkpoint.json", "checkpoint identity changed");
  }
  if (wrapper.evidence_cutoff_at !== CUTOFF) fail("str06-checkpoint.json.evidence_cutoff_at", "cutoff changed");
  exactArray(wrapper.source_numbers, SOURCE_NUMBERS, "str06-checkpoint.json.source_numbers");
  const caseRef = exact(wrapper.case, ["path", "status", "file_count"], "str06-checkpoint.json.case");
  if (caseRef.path !== "checkpoint/STR-06" || caseRef.status !== "canary_not_frozen" || caseRef.file_count !== 7) {
    fail("str06-checkpoint.json.case", "case registration changed");
  }
  const snapshot = exact(wrapper.contamination_snapshot, [
    "path", "sha256", "rule_version", "result_status",
  ], "str06-checkpoint.json.contamination_snapshot");
  if (
    snapshot.path !== SNAPSHOT_PATH || snapshot.sha256 !== SNAPSHOT_SHA256 ||
    snapshot.rule_version !== "starlette-contamination-rule/v1" || snapshot.result_status !== "no_public_hit_found"
  ) fail("str06-checkpoint.json.contamination_snapshot", "accepted snapshot reference changed");
  falseValue(wrapper.promotion_authorized, "str06-checkpoint.json.promotion_authorized");
  falseValue(wrapper.evaluation_ready, "str06-checkpoint.json.evaluation_ready");
  falseValue(wrapper.model_run_authorized, "str06-checkpoint.json.model_run_authorized");
  const assertions = exact(wrapper.outcome_assertions, [
    "regression_test_present", "fips_runtime_verified", "cross_environment_success_proven",
    "merge_or_close_proves_behavior",
  ], "str06-checkpoint.json.outcome_assertions");
  for (const key of Object.keys(assertions)) falseValue(assertions[key], `str06-checkpoint.json.outcome_assertions.${key}`);
}

function validateSnapshot(value) {
  const snapshot = object(value, SNAPSHOT_PATH);
  if (
    snapshot.schema_version !== "starlette-contamination-snapshot/v1" ||
    snapshot.rule_version !== "starlette-contamination-rule/v1" || snapshot.evidence_cutoff_at !== CUTOFF
  ) fail(SNAPSHOT_PATH, "snapshot identity or cutoff changed");
  const result = snapshot.results?.find?.((entry) => entry?.candidate_id === CASE_ID);
  if (!result || !isDeepStrictEqual(result.source_numbers, SOURCE_NUMBERS) || result.status !== "no_public_hit_found") {
    fail(SNAPSHOT_PATH, "STR-06 contamination gate is not the accepted no-public-hit snapshot");
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
  if (eventIds.length !== 16 || bundle.tasks.tasks.length !== 16 || segment.slice_ids.length !== 16) {
    fail("checkpoint/STR-06", "expected sixteen events and one slice per increment");
  }
  for (const event of bundle.events.events) {
    if (Date.parse(event.occurred_at) > Date.parse(CUTOFF)) fail(`${event.id}.occurred_at`, "evidence exceeds cutoff");
  }
  const observedNumbers = [...new Set(bundle.events.events.map(({ source }) => source.number))].sort((a, b) => a - b);
  exactArray(observedNumbers, SOURCE_NUMBERS, "events.json source numbers");

  for (const expected of STATE_EVENTS) {
    const event = bundle.events.events.find(({ id }) => id === expected.event_id);
    if (!event || event.event_type !== "issue_state") fail(expected.event_id, "state event missing");
    const canonical = {
      id: expected.id,
      node_id: event.source.node_id,
      event: expected.event,
      actor: event.actor,
      created_at: event.occurred_at,
      commit_id: event.source.commit_sha,
    };
    if (
      event.source.database_id !== String(expected.id) || event.source.node_id !== expected.node_id ||
      event.actor !== expected.actor || event.occurred_at !== expected.created_at || event.source.commit_sha !== expected.commit_id ||
      event.source_content_sha256 !== expected.sha256 || hashIssueStateEvent(canonical) !== expected.sha256
    ) fail(expected.event_id, "state canonical contract changed");
  }

  if (bundle.factGold.facts.some(({ category }) => category === "resolved_issue")) {
    fail("fact-gold.json", "tracker close must not be encoded as semantic resolution");
  }
  const requiredFacts = [
    ["STR-06/F10", "evidence", "STR-06/E11"],
    ["STR-06/F11", "rejected_alternative", "STR-06/E11"],
    ["STR-06/F14", "evidence", "STR-06/E14"],
    ["STR-06/F17", "open_question", "STR-06/E15"],
  ];
  for (const [id, category, firstKnown] of requiredFacts) {
    const fact = bundle.factGold.facts.find((entry) => entry.id === id);
    if (!fact || fact.category !== category || fact.first_known_at_event_id !== firstKnown) {
      fail("fact-gold.json", `required evidence boundary missing for ${id}`);
    }
  }
  if (!/no repository regression test/i.test(bundle.factGold.facts.find(({ id }) => id === "STR-06/F14").statement)) {
    fail("STR-06/F14", "missing no-regression-test boundary");
  }
  if (!/unverified/i.test(bundle.factGold.facts.find(({ id }) => id === "STR-06/F17").statement)) {
    fail("STR-06/F17", "missing residual uncertainty");
  }

  const stateAt = (sliceId) => bundle.oracleState.states.find(({ slice_id }) => slice_id === sliceId);
  for (const sliceId of ["STR-06/T7", "STR-06/T13", "STR-06/T16"]) {
    const state = stateAt(sliceId);
    if (!state || state.items.some(({ type, status }) => type === "GOAL" && status === "COMPLETED")) {
      fail(`oracle-state.json ${sliceId}`, "merge or close cannot complete the behavior goal");
    }
  }
  const firstCloseState = stateAt("STR-06/T7");
  if (firstCloseState.items.some(({ status }) => status === "RESOLVED") || !firstCloseState.items.some(({ status }) => status === "DEFERRED")) {
    fail("oracle-state.json STR-06/T7", "first tracker close must remain behavior-unverified");
  }
  const finalState = stateAt("STR-06/T16");
  if (!finalState.items.some(({ type, status, content }) => type === "OPEN_QUESTION" && status === "DEFERRED" && /unverified/i.test(content))) {
    fail("oracle-state.json STR-06/T16", "final residual behavior uncertainty missing");
  }

  if (bundle.outcomeAnchors.anchors.length !== 2 || bundle.outcomeAnchors.anchors.some(({ kind }) => kind !== "patch_merged")) {
    fail("outcome-anchors.json", "expected exactly two patch merge anchors");
  }
  for (const anchor of bundle.outcomeAnchors.anchors) {
    if (!/No repository regression test/i.test(anchor.limitations) || !/did not replay.*FIPS/i.test(anchor.limitations)) {
      fail(anchor.id, "outcome limitation must disclose missing repository test and FIPS replay");
    }
  }

  for (const task of bundle.tasks.tasks) {
    const projection = projectModelInput(bundle, task.id);
    if (!isDeepStrictEqual(Object.keys(projection), ["schema_version", "history_turns", "current_task"])) {
      fail(task.id, "projection envelope changed");
    }
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
      bundle.outcomeAnchors.anchors[0].source.commit_sha,
    ]) if (projectionText.includes(forbidden)) fail(task.id, "non-input artifact leaked into projection");
  }
  return result;
}

function validateHashManifest(value, expectedEntries) {
  const hashes = exact(value, ["schema_version", "status", "algorithm", "files"], "str06-checkpoint-hashes.json");
  if (hashes.schema_version !== VERSION || hashes.status !== STATUS || hashes.algorithm !== "sha256") {
    fail("str06-checkpoint-hashes.json", "hash manifest identity changed");
  }
  if (!Array.isArray(hashes.files) || hashes.files.length !== HASH_PATHS.length) fail("str06-checkpoint-hashes.json.files", "expected eight entries");
  const actualEntries = hashes.files.map((entry, index) => {
    const item = exact(entry, ["path", "sha256"], `str06-checkpoint-hashes.json.files[${index}]`);
    if (item.path !== HASH_PATHS[index]) fail(`str06-checkpoint-hashes.json.files[${index}].path`, "path or order changed");
    sha256(item.sha256, `str06-checkpoint-hashes.json.files[${index}].sha256`);
    return item;
  });
  if (!isDeepStrictEqual(actualEntries, expectedEntries)) fail("str06-checkpoint-hashes.json.files", "checkpoint content hash mismatch");
}

export async function validateStr06Checkpoint(root) {
  const loaded = await loadStr06Checkpoint(root);
  validateWrapper(loaded.wrapper);
  validateSnapshot(loaded.contaminationSnapshot);
  if (await hashFile(join(loaded.root, SNAPSHOT_PATH)) !== SNAPSHOT_SHA256) fail(SNAPSHOT_PATH, "accepted snapshot hash changed");
  const caseResult = validateCaseSemantics(loaded.bundle);
  validateHashManifest(loaded.hashes, await computeStr06CheckpointHashEntries(loaded.root));
  return {
    schema_version: VERSION,
    status: STATUS,
    case_id: CASE_ID,
    tier: loaded.bundle.manifest.tier,
    event_count: caseResult.events,
    information_increment_count: loaded.bundle.manifest.segments[0].information_increment_event_ids.length,
    slice_count: caseResult.slices,
    source_number_count: SOURCE_NUMBERS.length,
    state_canonical_hash_count: STATE_EVENTS.length,
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
  validateStr06Checkpoint(requestedRoot)
    .then((result) => process.stdout.write(`${JSON.stringify(result)}\n`))
    .catch((error) => {
      process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      process.exitCode = 1;
    });
}
