#!/usr/bin/env node

import { createHash } from "node:crypto";
import { lstatSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import { dirname, posix, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const BASELINE = "b7f00cefe809b1ffe9fac7d5e7885f7a7fdec8ed";
const SOURCE_CONTRACT = Object.freeze([
  Object.freeze({ path: "docs/PROJECT_STATE.md", blob_sha: "057240d62073614fbd4085af2cafd112c1d7cb8f" }),
  Object.freeze({ path: "docs/ROADMAP.md", blob_sha: "c105a85e5fc0b7d1983f90239de5f3f012553b80" }),
  Object.freeze({ path: "docs/REQUIREMENTS_V0.md", blob_sha: "2efd9c738f79ce1f7f9e63958f27dac4b4fe87e6" }),
  Object.freeze({ path: "docs/DECISIONS.md", blob_sha: "60663e5b92e0be1cb813af4e0acf6f9787f87456" }),
  Object.freeze({ path: "docs/qa/WO-V0-15-experience-ready-foundation-freeze.md", blob_sha: "ce04781fe6102d6feef7b7003ec0d84b86d2d457" }),
  Object.freeze({ path: "docs/adversarial-reviews/AR-2026-08-24-post-v0-15-linearization-final.md", blob_sha: "142bf41ee300b48ab45ec3f39818870b7fa26ad5" }),
  Object.freeze({ path: "src/mcp-service.ts", blob_sha: "70aacaa397af11480598476629f43b449ca7b3a6" })
]);
const EXPECTED_PAYLOAD_SHA256 = Object.freeze({
  "evaluation/codex-dogfood-01/protocol/composite-request.json": "f988f885ad099a2a9fbab5e1c72b4db7e6dfae91c2f94af03babbb19bc6b1abd",
  "evaluation/codex-dogfood-01/internal-ground-truth/ground-truth.json": "42cd9aba0700dfdc7ba8b132dac3c5694c18829535d04171a5a9bd8a92f6df39"
});
const EXPECTED_FILES = Object.freeze([
  "evaluation/codex-dogfood-01/protocol/composite-request.json",
  "evaluation/codex-dogfood-01/internal-ground-truth/ground-truth.json",
  "evaluation/codex-dogfood-01/internal-ground-truth/README.md",
  "evaluation/codex-dogfood-01/internal-ground-truth/validate-ground-truth.mjs",
  "evaluation/codex-dogfood-01/internal-ground-truth/hash-manifest.json"
]);
const MANIFEST_FILES = Object.freeze(EXPECTED_FILES.filter((path) => !path.endsWith("/hash-manifest.json")));
const decoder = new TextDecoder("utf-8", { fatal: true });

function fail(message) {
  throw new Error(message);
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function gitBlobSha(bytes) {
  return createHash("sha1")
    .update(Buffer.from(`blob ${bytes.length}\0`, "utf8"))
    .update(bytes)
    .digest("hex");
}

function exactKeys(value, keys, label) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) fail(`${label}: expected object`);
  const actual = Object.keys(value);
  if (actual.length !== keys.length || actual.some((key, index) => key !== keys[index])) {
    fail(`${label}: unknown, missing, or reordered field`);
  }
}

function nonEmptyString(value, label) {
  if (typeof value !== "string" || value.length === 0 || value !== value.normalize("NFC")) {
    fail(`${label}: expected non-empty NFC string`);
  }
}

function uniqueStrings(values, label) {
  if (!Array.isArray(values) || values.length === 0) fail(`${label}: expected non-empty array`);
  const seen = new Set();
  for (const [index, value] of values.entries()) {
    nonEmptyString(value, `${label}[${index}]`);
    if (seen.has(value)) fail(`${label}: duplicate value`);
    seen.add(value);
  }
}

function normalizeLexical(value) {
  return value.normalize("NFC").toLocaleLowerCase("en-US").replace(/[\p{P}\p{Z}\p{S}]+/gu, "");
}

function decodeNfc(bytes, label) {
  let text;
  try {
    text = decoder.decode(bytes);
  } catch {
    fail(`${label}: invalid UTF-8`);
  }
  if (text !== text.normalize("NFC")) fail(`${label}: text is not NFC`);
  if (text.startsWith("\uFEFF")) fail(`${label}: BOM is forbidden`);
  return text;
}

function parseCanonicalJson(bytes, label) {
  const text = decodeNfc(bytes, label);
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    fail(`${label}: invalid JSON`);
  }
  const canonical = `${JSON.stringify(value, null, 2)}\n`;
  if (text !== canonical) {
    fail(`${label}: non-canonical JSON, reordered representation, or duplicate object key`);
  }
  return value;
}

function repositoryRelative(root, absolute) {
  const rel = relative(root, absolute).split(sep).join("/");
  if (rel.length === 0 || rel.startsWith("../") || posix.isAbsolute(rel) || rel !== rel.normalize("NFC")) {
    fail(`unsafe path: ${rel}`);
  }
  return rel;
}

function collectFilesNoSymlinks(root, directory) {
  const directoryStat = lstatSync(directory);
  if (directoryStat.isSymbolicLink() || !directoryStat.isDirectory()) fail("expected real directory");
  const result = [];
  const names = readdirSync(directory).sort((a, b) => Buffer.from(a).compare(Buffer.from(b)));
  for (const name of names) {
    if (name !== name.normalize("NFC") || name === "." || name === ".." || name.includes("/") || name.includes("\\")) {
      fail(`unsafe directory entry: ${name}`);
    }
    const absolute = resolve(directory, name);
    const stat = lstatSync(absolute);
    if (stat.isSymbolicLink()) fail(`symlink forbidden: ${repositoryRelative(root, absolute)}`);
    if (stat.isDirectory()) result.push(...collectFilesNoSymlinks(root, absolute));
    else if (stat.isFile()) result.push(repositoryRelative(root, absolute));
    else fail(`non-regular file forbidden: ${repositoryRelative(root, absolute)}`);
  }
  return result;
}

function runGit(root, args) {
  const result = spawnSync("git", args, { cwd: root, encoding: null, maxBuffer: 16 * 1024 * 1024 });
  if (result.status !== 0 || result.signal !== null) fail(`git ${args[0]} failed`);
  return result.stdout;
}

function validateProtocol(protocol) {
  exactKeys(protocol, [
    "schema_version", "request_id", "sample_unit", "assertion_units",
    "assertions_are_independent_samples", "language", "instructions", "probes"
  ], "protocol");
  if (protocol.schema_version !== 1 || protocol.request_id !== "codex-dogfood-01-composite-p01-p12" ||
      protocol.sample_unit !== "one_composite_request" || protocol.assertion_units !== 12 ||
      protocol.assertions_are_independent_samples !== false || protocol.language !== "zh-CN") {
    fail("protocol: frozen header mismatch");
  }
  nonEmptyString(protocol.instructions, "protocol.instructions");
  if (!Array.isArray(protocol.probes) || protocol.probes.length !== 12) fail("protocol: expected 12 probes");
  protocol.probes.forEach((probe, index) => {
    exactKeys(probe, ["id", "order", "question"], `protocol.probes[${index}]`);
    const id = `P${String(index + 1).padStart(2, "0")}`;
    if (probe.id !== id || probe.order !== index + 1) fail(`protocol: probe order mismatch at ${id}`);
    nonEmptyString(probe.question, `${id}.question`);
  });
}

function validateGroundTruth(groundTruth, protocol) {
  exactKeys(groundTruth, [
    "schema_version", "ground_truth_id", "baseline_git_object", "request_id", "sample_unit",
    "assertion_units", "assertions_are_independent_samples", "created_from_model_output",
    "capture_visibility", "probes"
  ], "ground_truth");
  if (groundTruth.schema_version !== 1 || groundTruth.ground_truth_id !== "codex-dogfood-01-c-v1" ||
      groundTruth.baseline_git_object !== BASELINE || groundTruth.request_id !== protocol.request_id ||
      groundTruth.sample_unit !== "one_composite_request" || groundTruth.assertion_units !== 12 ||
      groundTruth.assertions_are_independent_samples !== false ||
      groundTruth.created_from_model_output !== false || groundTruth.capture_visibility !== "none") {
    fail("ground_truth: frozen header mismatch");
  }
  if (!Array.isArray(groundTruth.probes) || groundTruth.probes.length !== 12) {
    fail("ground_truth: expected 12 probes");
  }
  const groupIds = new Set();
  groundTruth.probes.forEach((probe, index) => {
    const id = `P${String(index + 1).padStart(2, "0")}`;
    exactKeys(probe, [
      "id", "order", "critical", "required_assertion_groups", "forbidden_claims",
      "canonical_answer", "sources"
    ], `ground_truth.probes[${index}]`);
    if (probe.id !== id || probe.order !== index + 1 || protocol.probes[index].id !== id) {
      fail(`ground_truth: probe order mismatch at ${id}`);
    }
    if (typeof probe.critical !== "boolean") fail(`${id}: critical must be boolean`);
    if (!Array.isArray(probe.required_assertion_groups) || probe.required_assertion_groups.length === 0) {
      fail(`${id}: empty required assertion groups`);
    }
    probe.required_assertion_groups.forEach((group, groupIndex) => {
      exactKeys(group, ["id", "description", "any_of"], `${id}.groups[${groupIndex}]`);
      const expectedGroupId = `${id}-G${String(groupIndex + 1).padStart(2, "0")}`;
      if (group.id !== expectedGroupId || groupIds.has(group.id)) fail(`${id}: duplicate or reordered group id`);
      groupIds.add(group.id);
      nonEmptyString(group.description, `${group.id}.description`);
      uniqueStrings(group.any_of, `${group.id}.any_of`);
    });
    uniqueStrings(probe.forbidden_claims, `${id}.forbidden_claims`);
    nonEmptyString(probe.canonical_answer, `${id}.canonical_answer`);
    const normalizedAnswer = normalizeLexical(probe.canonical_answer);
    for (const group of probe.required_assertion_groups) {
      if (!group.any_of.some((assertion) => normalizedAnswer.includes(normalizeLexical(assertion)))) {
        fail(`${group.id}: canonical answer does not satisfy its own required group`);
      }
    }
    for (const claim of probe.forbidden_claims) {
      if (normalizedAnswer.includes(normalizeLexical(claim))) {
        fail(`${id}: canonical answer contains forbidden claim`);
      }
    }
    if (!Array.isArray(probe.sources) || probe.sources.length === 0) fail(`${id}: missing provenance`);
    const seenSources = new Set();
    for (const [sourceIndex, source] of probe.sources.entries()) {
      exactKeys(source, ["baseline_commit", "path", "blob_sha", "provenance"], `${id}.sources[${sourceIndex}]`);
      if (source.baseline_commit !== BASELINE) fail(`${id}: source baseline mismatch`);
      nonEmptyString(source.path, `${id}.source.path`);
      nonEmptyString(source.blob_sha, `${id}.source.blob_sha`);
      nonEmptyString(source.provenance, `${id}.source.provenance`);
      const contract = SOURCE_CONTRACT.find((entry) => entry.path === source.path);
      if (!contract || contract.blob_sha !== source.blob_sha) fail(`${id}: source outside contract or hash mismatch`);
      if (seenSources.has(source.path)) fail(`${id}: duplicate source path`);
      seenSources.add(source.path);
    }
  });
}

function validateManifest(manifest, root) {
  exactKeys(manifest, ["schema_version", "algorithm", "files"], "manifest");
  if (manifest.schema_version !== 1 || manifest.algorithm !== "sha256" || !Array.isArray(manifest.files) ||
      manifest.files.length !== MANIFEST_FILES.length) fail("manifest: frozen header mismatch");
  const seen = new Set();
  manifest.files.forEach((entry, index) => {
    exactKeys(entry, ["path", "sha256"], `manifest.files[${index}]`);
    if (entry.path !== MANIFEST_FILES[index] || seen.has(entry.path)) fail("manifest: duplicate, unknown, or reordered path");
    if (!/^[0-9a-f]{64}$/.test(entry.sha256)) fail(`manifest: invalid hash for ${entry.path}`);
    seen.add(entry.path);
    const bytes = readFileSync(resolve(root, entry.path));
    if (sha256(bytes) !== entry.sha256) fail(`manifest: hash mismatch for ${entry.path}`);
  });
}

function main() {
  const scriptPath = realpathSync(fileURLToPath(import.meta.url));
  const root = resolve(dirname(scriptPath), "../../..");
  const gitRoot = decodeNfc(runGit(root, ["rev-parse", "--show-toplevel"]), "git root").trimEnd();
  if (realpathSync(root) !== realpathSync(gitRoot)) fail("validator is not under the expected repository root");
  const commit = decodeNfc(runGit(root, ["rev-parse", "--verify", `${BASELINE}^{commit}`]), "baseline commit").trim();
  if (commit !== BASELINE) fail("baseline commit mismatch");

  const protocolDirectory = resolve(root, "evaluation/codex-dogfood-01/protocol");
  const groundTruthDirectory = resolve(root, "evaluation/codex-dogfood-01/internal-ground-truth");
  const actualFiles = [
    ...collectFilesNoSymlinks(root, protocolDirectory),
    ...collectFilesNoSymlinks(root, groundTruthDirectory)
  ].sort((a, b) => Buffer.from(a).compare(Buffer.from(b)));
  const expectedFiles = [...EXPECTED_FILES].sort((a, b) => Buffer.from(a).compare(Buffer.from(b)));
  if (actualFiles.length !== expectedFiles.length || actualFiles.some((path, index) => path !== expectedFiles[index])) {
    fail("unknown, missing, duplicate, or reordered filesystem path");
  }

  for (const source of SOURCE_CONTRACT) {
    const bytes = runGit(root, ["show", `${BASELINE}:${source.path}`]);
    if (gitBlobSha(bytes) !== source.blob_sha) fail(`baseline blob mismatch: ${source.path}`);
  }

  const protocolPath = EXPECTED_FILES[0];
  const groundTruthPath = EXPECTED_FILES[1];
  const protocolBytes = readFileSync(resolve(root, protocolPath));
  const groundTruthBytes = readFileSync(resolve(root, groundTruthPath));
  if (sha256(protocolBytes) !== EXPECTED_PAYLOAD_SHA256[protocolPath]) fail("protocol payload hash mismatch");
  if (sha256(groundTruthBytes) !== EXPECTED_PAYLOAD_SHA256[groundTruthPath]) fail("ground truth payload hash mismatch");
  const protocol = parseCanonicalJson(protocolBytes, protocolPath);
  const groundTruth = parseCanonicalJson(groundTruthBytes, groundTruthPath);
  validateProtocol(protocol);
  validateGroundTruth(groundTruth, protocol);

  for (const path of EXPECTED_FILES) decodeNfc(readFileSync(resolve(root, path)), path);
  const manifestPath = EXPECTED_FILES[4];
  validateManifest(parseCanonicalJson(readFileSync(resolve(root, manifestPath)), manifestPath), root);
  process.stdout.write("PASS codex-dogfood-01 C ground truth freeze\n");
}

try {
  main();
} catch (error) {
  process.stderr.write(`FAIL ${error instanceof Error ? error.message : "unknown validation failure"}\n`);
  process.exitCode = 1;
}
