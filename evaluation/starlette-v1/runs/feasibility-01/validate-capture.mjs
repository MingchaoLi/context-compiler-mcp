import { createHash } from "node:crypto";
import { lstat, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";

const RAW_RESPONSES_SHA256 = "1b574d4c1843a283d088cc641523855e78135516545a264c4fe48d5e059a4910";
const RUN_MANIFEST_SHA256 = "674ab5a80074c7ce52f76c1491ba1ce428a133fdf14212445f68a3a9f90c9ed0";
const FIXED_SOURCE_FILES = Object.freeze([
  Object.freeze({ path: "docs/qa/WO-DS-11-starlette-atomic-freeze-run-gate.md", sha256: "b7f6413520f98fa470702b9b901b8dbd05f3bbd71a5cec0c9618d8c101f9c8f5" }),
  Object.freeze({ path: "evaluation/starlette-v1/freeze/v1/generate-run-inputs.ts", sha256: "88d020cbccbff17b1cae8a1b52ba67c9c2c59d023fdeaa11187feed835412868" }),
  Object.freeze({ path: "evaluation/starlette-v1/freeze/v1/answer-inputs.jsonl", sha256: "503441186a90efe93a93b04e53b350737877bfb941f48eb91e610144a3a52675" }),
  Object.freeze({ path: "evaluation/starlette-v1/freeze/v1/packet-manifest.json", sha256: "74d45b359b15087e1858face1076113809f2938be7599bf8e79b054b1b54d982" }),
  Object.freeze({ path: "evaluation/starlette-v1/freeze/v1/contamination-snapshot-pre-run.json", sha256: "9ad86c9acee5071dadc210d20fe6bd09e1c90de13c82ddcc3bedea5883469659" }),
  Object.freeze({ path: "evaluation/starlette-v1/freeze/v1/run-contract.json", sha256: "7cafe30a138c056da46b0f629e97fb2b0d2bcb096a8111db5ff90594206be85b" }),
  Object.freeze({ path: "evaluation/starlette-v1/freeze/v1/freeze-manifest.json", sha256: "58b5fb95f230645e0a47fcd97695668f1ce74241a8a75214992c9e6c55d7d6bc" }),
  Object.freeze({ path: "evaluation/starlette-v1/freeze/v1/freeze-hashes.json", sha256: "ad1661dcf2875b49354c04a33065afd4c70a83d1951ebda2f3aa29c4bf1247db" }),
  Object.freeze({ path: "evaluation/starlette-v1/promotion-hashes.json", sha256: "c216719f1745601786ad53f50bbaed6c5e7b0a8e8d9d6612cfb79b9c103ff51b" }),
  Object.freeze({ path: "evaluation/starlette-v1/protocol-canary/protocol-hashes.json", sha256: "fde44511237c1a16d317131122461461c788b175b102592f22d6a656cfd6e99a" }),
]);
const RESPONSE_KEYS = Object.freeze([
  "schema_version", "execution_index", "packet_id", "prompt_sha256", "attempt_number",
  "requested_model_alias", "requested_model_family_constraint", "requested_reasoning_effort",
  "fork_turns", "collaboration_session_id", "started_at", "ended_at", "raw_assistant_output",
  "response_sha256", "parse_status", "cell_status", "tool_use_observed", "network_use_observed",
  "repository_access_observed", "external_information_use_observed", "temperature",
  "sampling_parameters", "seed", "backend_build", "billed_tokens",
]);

export class CaptureValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "CaptureValidationError";
  }
}

function fail(path, message) {
  throw new CaptureValidationError(`${path}: ${message}`);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function regularFile(path) {
  const metadata = await lstat(path);
  if (!metadata.isFile() || metadata.isSymbolicLink()) fail(path, "expected regular file");
  return readFile(path);
}

async function hashFile(path) {
  return sha256(await regularFile(path));
}

async function readJson(path) {
  let value;
  try {
    value = JSON.parse((await regularFile(path)).toString("utf8"));
  } catch {
    fail(path, "invalid JSON");
  }
  return value;
}

async function readJsonl(path) {
  const raw = (await regularFile(path)).toString("utf8");
  if (!raw.endsWith("\n")) fail(path, "missing final newline");
  const lines = raw.trimEnd().split("\n");
  return lines.map((line, index) => {
    try {
      return JSON.parse(line);
    } catch {
      fail(`${path}:${index + 1}`, "invalid JSON line");
    }
  });
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

function exactValue(actual, expected, path) {
  if (!isDeepStrictEqual(actual, expected)) fail(path, "fixed value changed");
}

function utc(value, path) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(value) || Number.isNaN(Date.parse(value))) {
    fail(path, "expected canonical second-precision UTC timestamp");
  }
  return Date.parse(value);
}

function strictResponseStatus(raw) {
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return "invalid_response_format";
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return "invalid_response_format";
  if (!isDeepStrictEqual(Object.keys(parsed), ["answer"]) || typeof parsed.answer !== "string") return "invalid_response_format";
  const words = parsed.answer.trim().length === 0 ? 0 : parsed.answer.trim().split(/\s+/u).length;
  return words <= 250 ? "valid_response_format" : "invalid_response_format";
}

async function validateCaptureHashes(runRoot, value) {
  const target = exact(value, ["schema_version", "status", "algorithm", "files"], "capture-hashes.json");
  exactValue(target.schema_version, "starlette-answer-capture-hashes/v1", "capture-hashes.json.schema_version");
  exactValue(target.status, "captured_unscored_pending_independent_qa", "capture-hashes.json.status");
  exactValue(target.algorithm, "sha256", "capture-hashes.json.algorithm");
  const expectedPaths = ["README.md", "raw-responses.jsonl", "run-manifest.json", "validate-capture.mjs"];
  if (!Array.isArray(target.files) || !isDeepStrictEqual(target.files.map((entry) => entry.path), expectedPaths)) {
    fail("capture-hashes.json.files", "fixed file order changed");
  }
  for (const entry of target.files) {
    if (!/^[a-f0-9]{64}$/.test(entry.sha256)) fail(`capture-hashes.json.files.${entry.path}`, "invalid SHA-256");
    exactValue(await hashFile(join(runRoot, entry.path)), entry.sha256, `capture-hashes.json.files.${entry.path}`);
  }
}

export async function validateFeasibilityCapture(repositoryRoot) {
  const repoRoot = resolve(repositoryRoot);
  const starletteRoot = join(repoRoot, "evaluation/starlette-v1");
  const runRoot = join(starletteRoot, "runs/feasibility-01");
  for (const entry of FIXED_SOURCE_FILES) {
    exactValue(await hashFile(join(repoRoot, entry.path)), entry.sha256, entry.path);
  }
  const freezeManifest = await readJson(join(starletteRoot, "freeze/v1/freeze-manifest.json"));
  for (const entry of [...freezeManifest.canonical_data.expanded_files, ...freezeManifest.protocol.expanded_files]) {
    exactValue(await hashFile(join(starletteRoot, entry.path)), entry.sha256, `frozen source ${entry.path}`);
  }
  exactValue(await hashFile(join(runRoot, "raw-responses.jsonl")), RAW_RESPONSES_SHA256, "raw-responses.jsonl");
  exactValue(await hashFile(join(runRoot, "run-manifest.json")), RUN_MANIFEST_SHA256, "run-manifest.json");

  const [packetManifest, records, runManifest, captureHashes] = await Promise.all([
    readJson(join(starletteRoot, "freeze/v1/packet-manifest.json")),
    readJsonl(join(runRoot, "raw-responses.jsonl")),
    readJson(join(runRoot, "run-manifest.json")),
    readJson(join(runRoot, "capture-hashes.json")),
  ]);
  if (records.length !== 36) fail("raw-responses.jsonl", "expected exactly 36 records");
  exactValue(runManifest.execution.execution_order, packetManifest.execution_order, "run-manifest.execution.execution_order");
  exactValue(records.map((entry) => entry.packet_id), packetManifest.execution_order, "raw-responses.jsonl packet order");

  const packetById = new Map(packetManifest.packets.map((packet) => [packet.packet_id, packet]));
  const sessions = new Set();
  let priorStart = -Infinity;
  const intervals = [];
  const parseCounts = { valid_response_format: 0, invalid_response_format: 0 };
  const cellCounts = { captured: 0, invalid_response_format: 0, technical_failure: 0 };
  records.forEach((entry, index) => {
    const path = `raw-responses.jsonl:${index + 1}`;
    const record = exact(entry, RESPONSE_KEYS, path);
    exactValue(record.schema_version, "starlette-answer-response/v1", `${path}.schema_version`);
    exactValue(record.execution_index, index + 1, `${path}.execution_index`);
    exactValue(record.attempt_number, 1, `${path}.attempt_number`);
    exactValue([
      record.requested_model_alias, record.requested_model_family_constraint,
      record.requested_reasoning_effort, record.fork_turns,
    ], ["gpt-5.6-terra", "non-sol", "medium", "none"], `${path}.transport`);
    const packet = packetById.get(record.packet_id);
    if (!packet) fail(`${path}.packet_id`, "unknown frozen packet");
    exactValue(record.prompt_sha256, packet.prompt_sha256, `${path}.prompt_sha256`);
    if (typeof record.collaboration_session_id !== "string" || !record.collaboration_session_id.endsWith(`/ds12_answer_${String(index + 1).padStart(3, "0")}_${record.packet_id}`)) {
      fail(`${path}.collaboration_session_id`, "session id does not bind execution index and packet");
    }
    if (sessions.has(record.collaboration_session_id)) fail(`${path}.collaboration_session_id`, "duplicate collaboration session");
    sessions.add(record.collaboration_session_id);
    const started = utc(record.started_at, `${path}.started_at`);
    const ended = utc(record.ended_at, `${path}.ended_at`);
    if (started < priorStart || ended < started) fail(path, "non-monotonic start or negative duration");
    priorStart = started;
    intervals.push({ started, ended });
    if (typeof record.raw_assistant_output !== "string") fail(`${path}.raw_assistant_output`, "expected raw string");
    exactValue(record.response_sha256, sha256(record.raw_assistant_output), `${path}.response_sha256`);
    const calculatedParse = strictResponseStatus(record.raw_assistant_output);
    exactValue(record.parse_status, calculatedParse, `${path}.parse_status`);
    const calculatedCell = calculatedParse === "valid_response_format" ? "captured" : "invalid_response_format";
    exactValue(record.cell_status, calculatedCell, `${path}.cell_status`);
    parseCounts[record.parse_status] += 1;
    cellCounts[record.cell_status] += 1;
    exactValue([
      record.tool_use_observed, record.network_use_observed,
      record.repository_access_observed, record.external_information_use_observed,
    ], [false, false, false, false], `${path}.external_use_observation`);
    exactValue([
      record.temperature, record.sampling_parameters, record.seed, record.backend_build, record.billed_tokens,
    ], ["unavailable", "unavailable", "unavailable", "unavailable", "unavailable"], `${path}.unavailable_transport_metadata`);
  });
  if (sessions.size !== 36) fail("raw-responses.jsonl", "expected 36 unique sessions");
  for (const point of [...new Set(intervals.flatMap((entry) => [entry.started, entry.ended]))]) {
    const active = intervals.filter((entry) => entry.started <= point && point < entry.ended).length;
    if (active > 2) fail("raw-responses.jsonl", "more than two answer sessions overlap");
  }
  exactValue(runManifest.status_counts, {
    captured: cellCounts.captured,
    invalid_response_format: cellCounts.invalid_response_format,
    technical_failure: cellCounts.technical_failure,
    valid_response_format: parseCounts.valid_response_format,
    external_information_use_observed: 0,
  }, "run-manifest.status_counts");
  exactValue(runManifest.execution, {
    started_at: records[0].started_at,
    ended_at: records[35].ended_at,
    execution_order_source: "evaluation/starlette-v1/freeze/v1/packet-manifest.json#execution_order",
    maximum_concurrent_answer_sessions: 2,
    requested_call_count: 36,
    completed_call_count: 36,
    unique_session_count: 36,
    attempt_count: 36,
    retry_count: 0,
    best_of_count: 0,
    execution_order: packetManifest.execution_order,
  }, "run-manifest.execution");
  exactValue(runManifest.collection_boundaries, {
    raw_outputs_rewritten: false,
    evaluator_run_count: 0,
    semantic_scoring_performed: false,
    rubric_consulted_during_collection: false,
    automatic_context_or_cost_metrics_run: false,
    answers_are_unscored_artifacts: true,
  }, "run-manifest.collection_boundaries");
  await validateCaptureHashes(runRoot, captureHashes);
  return {
    schema_version: "starlette-answer-capture-validation/v1",
    status: "capture_valid_unscored_pending_independent_qa",
    packet_count: 36,
    session_count: 36,
    attempt_count: 36,
    captured_count: cellCounts.captured,
    invalid_response_format_count: cellCounts.invalid_response_format,
    technical_failure_count: cellCounts.technical_failure,
    external_information_use_observed_count: 0,
    evaluator_run_count: 0,
    semantic_scoring_performed: false,
  };
}

const currentPath = fileURLToPath(import.meta.url);
if (resolve(process.argv[1] ?? "") === currentPath) {
  const repositoryRoot = resolve(process.argv[2] ?? join(dirname(currentPath), "../../../.."));
  try {
    process.stdout.write(`${JSON.stringify(await validateFeasibilityCapture(repositoryRoot))}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? `${error.name}: ${error.message}` : "CaptureValidationError"}\n`);
    process.exitCode = 1;
  }
}
