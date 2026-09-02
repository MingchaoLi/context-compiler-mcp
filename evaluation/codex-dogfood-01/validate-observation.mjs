#!/usr/bin/env node

import { createHash } from "node:crypto";
import { lstatSync, readFileSync, readdirSync } from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const EVALUATION_ROOT = resolve(ROOT, "evaluation/codex-dogfood-01");
const SOURCE_CANDIDATE = "ad94f9350482be37f1a38538cf6b624fb69a2b9a";
const BASELINE = "b7f00cefe809b1ffe9fac7d5e7885f7a7fdec8ed";
const INPUT_COMMITS = Object.freeze([
  "1fec67f635717e7a6cc5f9d6390913118919df59",
  "ed9250934bfaeb4ee1fbda6d5eacd29830d9cbda",
  "47eafe6178783d0976399fe118c37d783684c70d",
  "05da8cd0107c954c1c19b3f5909328bd356dc87f"
]);
const MACOS_USER_DOCUMENTS_PREFIX = ["", "Users", "[^/\\s]+", "Documents"].join("/");
const PUBLIC_RELEASE_PATH_REPLACEMENTS = Object.freeze([
  [new RegExp(`${MACOS_USER_DOCUMENTS_PREFIX}/Codex/2026-08-30/rc-evaluation-owner/work/rc025-h0-formation-skeleton-plan-01`, "gu"), "/path/to/rc-evaluation-owner/work/rc025-h0-formation-skeleton-plan-01"],
  [new RegExp(`${MACOS_USER_DOCUMENTS_PREFIX}/[^/\\s]+/context-compiler-mcp`, "gu"), "/path/to/context-compiler-mcp"]
]);
const PAYLOADS = Object.freeze({
  "evaluation/codex-dogfood-01/protocol/composite-request.json": "dfba192a1154815ce30d789d6235fbfa49184148515f82f934352f3db6358946",
  "evaluation/codex-dogfood-01/captures/b-packet.json": "b255b509faa7a4baa7a2974f6e3d4ae6f8d8e374431e7b482343e1a9ce9bc849",
  "evaluation/codex-dogfood-01/captures/compiled-b.json": "f2d463686ad62265f2dc561c667b8fcc2be316378c25564c72882af4a8e1effe",
  "evaluation/codex-dogfood-01/captures/native-a.json": "c378788725ee73d8674a8388886d0188a92c76e49413b5e8f6954f53190a4996",
  "evaluation/codex-dogfood-01/captures/v0-observation.json": "012a5f39d139469e8a050b66d042cba3100763651e43a9b2c51e3c6a7e2c1b0b",
  "evaluation/codex-dogfood-01/host-data/directive-summaries.json": "4083d1dfc1254bb58010f27602ee0a1d6461e3cab7489b8bf11ee42fa1bc3dc9",
  "evaluation/codex-dogfood-01/reports/automatic-lexical.json": "0c08e53bfbe42825dcc634ed1cdb8b0ae5884728b997575c9aa2988f99bd9bf3",
  "evaluation/codex-dogfood-01/reports/independent-semantic-adjudication.json": "916e98223a03ebe58ef6071b70c73ed9a82fb09f84cc54dec3d935a55939cbe6",
  "evaluation/codex-dogfood-01/reports/ledger-audit.json": "417bdc5b53544d5ef1c130e95ba748de03698646771839620f5b6cdb3c4d456b",
  "evaluation/codex-dogfood-01/runner/latency-worker.mjs": "49ad5e2710b0650bf2e751f6939322a2b1888acc7df25ac859cc1d68f26508b3",
  "evaluation/codex-dogfood-01/runner/run-observation.mjs": "232262f8cc412c826966a85b1d632f1dde240baa285b860f7185e8eec2c97933",
  "evaluation/codex-dogfood-01/runner/score-captures.mjs": "5cf59676786ab772e33d9c35db0dcea357f031f810ea4287034bef9d3cbd74c3"
});
const EXPECTED_FILES = Object.freeze([
  "captures/b-packet.json",
  "captures/compiled-b.json",
  "captures/native-a.json",
  "captures/v0-observation.json",
  "host-data/directive-summaries.json",
  "internal-ground-truth/README.md",
  "internal-ground-truth/ground-truth.json",
  "internal-ground-truth/hash-manifest.json",
  "internal-ground-truth/validate-ground-truth.mjs",
  "observation-hashes.json",
  "protocol/composite-request.json",
  "reports/automatic-lexical.json",
  "reports/independent-semantic-adjudication.json",
  "reports/ledger-audit.json",
  "runner/latency-worker.mjs",
  "runner/run-observation.mjs",
  "runner/score-captures.mjs",
  "validate-observation.mjs"
]);

function fail(message) {
  throw new Error(message);
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function readJson(path) {
  const bytes = readFileSync(resolve(ROOT, path));
  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  if (text !== text.normalize("NFC") || text !== `${JSON.stringify(JSON.parse(text), null, 2)}\n`) {
    fail(`${path}: non-canonical JSON or non-NFC`);
  }
  return JSON.parse(text);
}

function collectFiles(directory) {
  const result = [];
  for (const name of readdirSync(directory).sort((a, b) => Buffer.from(a).compare(Buffer.from(b)))) {
    if (name !== name.normalize("NFC")) fail("non-NFC path");
    const absolute = resolve(directory, name);
    const stat = lstatSync(absolute);
    if (stat.isSymbolicLink()) fail(`symlink forbidden: ${absolute}`);
    if (stat.isDirectory()) result.push(...collectFiles(absolute));
    else if (stat.isFile()) result.push(relative(EVALUATION_ROOT, absolute).split(sep).join("/"));
    else fail(`non-regular file: ${absolute}`);
  }
  return result;
}

function run(command, args) {
  const result = spawnSync(command, args, { cwd: ROOT, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
  if (result.status !== 0 || result.signal !== null) fail(`${command} ${args[0]} failed`);
  return result.stdout;
}

function gitBytes(commit, path) {
  const result = spawnSync("git", ["show", `${commit}:${path}`], { cwd: ROOT, encoding: null, maxBuffer: 32 * 1024 * 1024 });
  if (result.status !== 0 || result.signal !== null) fail(`git object missing: ${commit}:${path}`);
  return result.stdout;
}

function publicReleaseProjection(bytes) {
  let text = bytes.toString("utf8");
  for (const [privatePathPattern, publicPath] of PUBLIC_RELEASE_PATH_REPLACEMENTS) {
    text = text.replaceAll(privatePathPattern, publicPath);
  }
  return Buffer.from(text, "utf8");
}

function assertGitIdentity(commit, path) {
  const current = readFileSync(resolve(ROOT, path));
  if (!publicReleaseProjection(gitBytes(commit, path)).equals(current)) {
    fail(`${path}: current bytes differ from the public-release projection of ${commit}`);
  }
}

const files = collectFiles(EVALUATION_ROOT);
if (JSON.stringify(files) !== JSON.stringify(EXPECTED_FILES)) fail("unexpected, missing, or reordered evaluation file");

for (const [path, expected] of Object.entries(PAYLOADS)) {
  if (sha256(readFileSync(resolve(ROOT, path))) !== expected) fail(`${path}: SHA-256 mismatch`);
}

const manifest = readJson("evaluation/codex-dogfood-01/observation-hashes.json");
if (manifest.schema_version !== 1 || manifest.observation_id !== "codex-long-conversation-dogfood-01" ||
    manifest.source_candidate !== SOURCE_CANDIDATE || manifest.observation_baseline !== BASELINE ||
    JSON.stringify(manifest.input_contract_commits) !== JSON.stringify(INPUT_COMMITS) ||
    JSON.stringify(Object.fromEntries(manifest.payloads.map((entry) => [entry.path, entry.sha256]))) !== JSON.stringify(PAYLOADS)) {
  fail("observation manifest mismatch");
}

if (run("git", ["rev-parse", `${SOURCE_CANDIDATE}^{commit}`]).trim() !== SOURCE_CANDIDATE ||
    run("git", ["rev-parse", `${BASELINE}^{commit}`]).trim() !== BASELINE ||
    run("git", ["rev-parse", "ed9250934bfaeb4ee1fbda6d5eacd29830d9cbda^"]).trim() !== INPUT_COMMITS[0] ||
    run("git", ["rev-parse", "47eafe6178783d0976399fe118c37d783684c70d^"]).trim() !== INPUT_COMMITS[1] ||
    run("git", ["rev-parse", "05da8cd0107c954c1c19b3f5909328bd356dc87f^"]).trim() !== INPUT_COMMITS[2]) {
  fail("input commit lineage mismatch");
}
assertGitIdentity(INPUT_COMMITS[0], "evaluation/codex-dogfood-01/protocol/composite-request.json");
assertGitIdentity(INPUT_COMMITS[1], "evaluation/codex-dogfood-01/captures/native-a.json");
assertGitIdentity(INPUT_COMMITS[1], "evaluation/codex-dogfood-01/host-data/directive-summaries.json");
assertGitIdentity(INPUT_COMMITS[1], "evaluation/codex-dogfood-01/runner/latency-worker.mjs");
assertGitIdentity(INPUT_COMMITS[2], "evaluation/codex-dogfood-01/runner/run-observation.mjs");
assertGitIdentity(INPUT_COMMITS[3], "evaluation/codex-dogfood-01/captures/b-packet.json");
assertGitIdentity(INPUT_COMMITS[3], "evaluation/codex-dogfood-01/captures/v0-observation.json");

run(process.execPath, ["evaluation/codex-dogfood-01/internal-ground-truth/validate-ground-truth.mjs"]);
const protocol = readJson("evaluation/codex-dogfood-01/protocol/composite-request.json");
const native = readJson("evaluation/codex-dogfood-01/captures/native-a.json");
const packet = readJson("evaluation/codex-dogfood-01/captures/b-packet.json");
const compiled = readJson("evaluation/codex-dogfood-01/captures/compiled-b.json");
const observation = readJson("evaluation/codex-dogfood-01/captures/v0-observation.json");
const automatic = readJson("evaluation/codex-dogfood-01/reports/automatic-lexical.json");
const semantic = readJson("evaluation/codex-dogfood-01/reports/independent-semantic-adjudication.json");
const ledger = readJson("evaluation/codex-dogfood-01/reports/ledger-audit.json");

const ids = Array.from({ length: 12 }, (_, index) => `P${String(index + 1).padStart(2, "0")}`);
for (const capture of [native, compiled]) {
  if (capture.sample_unit !== "one_composite_request" || capture.assertion_units !== 12 ||
      capture.assertions_are_independent_samples !== false || capture.answers.length !== 12 ||
      capture.answers.some((answer, index) => answer.probe_id !== ids[index])) {
    fail(`${capture.condition}: capture shape mismatch`);
  }
}
if (native.condition !== "A_native_host_after_minimal_repo_refresh" || native.attempt !== 1 ||
    native.retry_count !== 0 || native.tool_use_allowed !== false || native.input_tokens !== "not_observable" ||
    native.causal_attribution !== "not_attributable_to_opaque_compaction") {
  fail("A capture boundary mismatch");
}
if (compiled.condition !== "B_oracle_typed_state_compiled_upper_bound" || compiled.model !== "gpt-5.6-sol" ||
    compiled.reasoning_effort !== "medium" || compiled.fork_turns !== "none" || compiled.attempt !== 1 ||
    compiled.retry_count !== 0 || compiled.packet_commit !== INPUT_COMMITS[3] || compiled.repo_evidence_lookup !== false ||
    compiled.ground_truth_visible !== false || compiled.packet_delivery_tool_call_count !== 1 ||
    compiled.post_delivery_tool_call_count !== 0) {
  fail("B capture boundary mismatch");
}
const composite = [protocol.instructions, ...protocol.probes.map((probe) => `${probe.id}: ${probe.question}`)].join("\n");
if (packet.input_contract_commit !== INPUT_COMMITS[2] || packet.ground_truth_visible !== false ||
    packet.request.instructions !== protocol.instructions || JSON.stringify(packet.request.probes) !== JSON.stringify(protocol.probes) ||
    packet.compiled_context.current_input !== composite ||
    JSON.stringify(packet.compiled_context) !== JSON.stringify(observation.broad_composite.context)) {
  fail("B packet/context mismatch");
}
if (observation.input_contract_commit !== INPUT_COMMITS[2] || observation.source_candidate !== SOURCE_CANDIDATE ||
    observation.observation_baseline !== BASELINE || observation.host_data.git_outcome_trace_count !== 123 ||
    observation.host_data.directive_reconstruction_count !== 20 || observation.host_data.primary_raw_event_count_before_feedback !== 143 ||
    observation.host_data.typed_state_kind !== "oracle_typed_state_compiled_upper_bound" ||
    observation.broad_composite.metrics.full_context_tokens !== 3056 ||
    observation.broad_composite.metrics.recent_window_tokens !== 710 ||
    observation.broad_composite.metrics.compiled_context_tokens !== 1511 ||
    observation.targeted_recall.normal.dsh_home_present !== false ||
    observation.targeted_recall.recovery.dsh_home_present !== true ||
    observation.authority_diagnostic.old_route_raw_present !== true ||
    observation.authority_diagnostic.current_route_state_present !== true ||
    observation.state_audit.relation_counts.DERIVED_FROM !== 16 || observation.state_audit.relation_counts.SUPERSEDES !== 1 ||
    observation.latency_observation.warm_sequential.length !== 5 ||
    observation.latency_observation.concurrent_two_session_pairs.length !== 5 ||
    observation.latency_observation.compile_ingest_competition_pairs.length !== 5) {
  fail("observation invariant mismatch");
}
const latencyCalls = [
  ...observation.latency_observation.concurrent_two_session_pairs.flatMap((pair) => pair.calls),
  ...observation.latency_observation.compile_ingest_competition_pairs.flatMap((pair) => pair.calls)
];
if (latencyCalls.some((call) => call.ok !== true || call.error_code !== null)) fail("latency call failure mismatch");

const reproducedAutomatic = JSON.parse(run(process.execPath, ["evaluation/codex-dogfood-01/runner/score-captures.mjs"]));
if (JSON.stringify(reproducedAutomatic) !== JSON.stringify(automatic) || automatic.empty_probe_count !== 0 ||
    automatic.vacuous_pass_possible !== false || automatic.conditions[0].required_groups_confirmed !== 3 ||
    automatic.conditions[1].required_groups_confirmed !== 4 ||
    automatic.conditions.some((condition) => condition.required_groups_total !== 21 || condition.aggregate_pass_threshold !== "not_defined")) {
  fail("automatic report mismatch");
}
if (semantic.overall_pass_threshold !== null || semantic.overall_pass_threshold_status !== "not_defined" ||
    semantic.adjudications.length !== 12 || semantic.adjudications.some((entry, index) => entry.probe_id !== ids[index])) {
  fail("semantic adjudication shape mismatch");
}
const counts = (condition) => Object.fromEntries(["pass", "partial", "miss", "forbidden"].map((verdict) => [
  verdict,
  semantic.adjudications.filter((entry) => entry[condition].verdict === verdict).length
]));
if (JSON.stringify(counts("A")) !== JSON.stringify({ pass: 10, partial: 2, miss: 0, forbidden: 0 }) ||
    JSON.stringify(counts("B")) !== JSON.stringify({ pass: 10, partial: 1, miss: 1, forbidden: 0 })) {
  fail("semantic adjudication arithmetic mismatch");
}
if (ledger.source_observation_sha256 !== PAYLOADS["evaluation/codex-dogfood-01/captures/v0-observation.json"] ||
    ledger.total_counts.EVENT !== 435 || ledger.total_counts.CONTEXT_COMPILE !== 25 ||
    ledger.total_counts.RETRIEVAL_HIT !== 38 || ledger.database_committed !== false ||
    ledger.research_kinds_not_observed.length !== 4) {
  fail("ledger audit mismatch");
}

process.stdout.write("PASS codex-dogfood-01 observation freeze\n");
