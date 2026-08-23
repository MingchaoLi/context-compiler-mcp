#!/usr/bin/env node

import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { lstat, readFile, readdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";
import { promisify } from "node:util";
import { loadPromotionBundles } from "../../validate-promotion.mjs";
import { loadProtocolCanary, validateProtocolCanary } from "../../protocol-canary/validate-protocol-canary.mjs";
import { validateFeasibilityCapture } from "../../runs/feasibility-01/validate-capture.mjs";

const execFileAsync = promisify(execFile);
const RESULT_RELATIVE_ROOT = "evaluation/starlette-v1/results/feasibility-01";
const RAW_RESPONSES_PATH = "evaluation/starlette-v1/runs/feasibility-01/raw-responses.jsonl";
const PACKET_MANIFEST_PATH = "evaluation/starlette-v1/freeze/v1/packet-manifest.json";
const ANSWER_INPUTS_PATH = "evaluation/starlette-v1/freeze/v1/answer-inputs.jsonl";
const PROTOCOL_PATH = "evaluation/starlette-v1/protocol-canary/protocol.json";
const REVIEW_ID_DOMAIN = "starlette-v1-feasibility-review-id/v1|fixed-pre-registered-domain";
const REVIEW_ORDER_DOMAIN = "starlette-v1-feasibility-review-order/v1|fixed-pre-registered-domain";
const CRITERION_ID_DOMAIN = "starlette-v1-feasibility-criterion-id/v1|fixed-pre-registered-domain";
const FORBIDDEN_CONTROL = /[\p{Cf}\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u;
const PUBLIC_METADATA_LEAK = /\b(?:d0|d1|d2|condition|provenance|assembler|raw-window)\b|pkt_[a-f0-9]{20}|STR-[0-9]{2}\/[A-Z][0-9]+|"(?:packet_id|case_id|slice_id|canonical_criterion_id|fact_ids|provenance_event_ids|context_sha256|context_estimated_tokens)"/iu;
const EXPECTED_COUNTS = Object.freeze({ cases: 6, slices: 12, turns: 101, probes: 8, answers: 36, required: 42, forbidden: 16, critical: 38 });

export const TRUSTED_RESULT_SOURCE = Object.freeze({
  commit: "f721fd1159e6802d29132939c8114377f3faefa4",
  parent: "c3b47065cdc8583feafd5d1716b3ce53aa2de75c",
  files: Object.freeze([
    Object.freeze({ path: "artifact-hashes.json", sha256: "85e055f6bb3e9c66c93fa5a55c73890e531d2f28de409356b5422b3198f2e1c7" }),
    Object.freeze({ path: "boundary-manifest.json", sha256: "6eff2b83c1c5c560601f443970efa5a0a657e78f41baf98a617a1ec34ff941d2" }),
    Object.freeze({ path: "internal-audit/automatic-report.json", sha256: "e574ceb0b7d6e9bca401b34e3da26a9462e6fe3731f16ad427ece04956b7e420" }),
    Object.freeze({ path: "internal-audit/automatic-summary.json", sha256: "0d9b8bbbeca6e0ee8f4f7d0a3ba2b340756f6376fb68a867f877a38fac40635f" }),
    Object.freeze({ path: "internal-audit/canonical-criteria.jsonl", sha256: "d8ace7df3005aa8a79aba4904c3b5726e273757a6fa9c7a670b5f2335aaa726d" }),
    Object.freeze({ path: "internal-audit/internal-hashes.json", sha256: "30ea9ac93183fa484f075e6e44d039842347cd0652a93c2fbb7bbf7a259cb78d" }),
    Object.freeze({ path: "internal-audit/latency-observation.json", sha256: "788e702120dadd47dc8578e79c9bff0a6e0cb222a21f46a16eb344e98d9fb00f" }),
    Object.freeze({ path: "internal-audit/review-key.json", sha256: "ccd0e48c9981a58ebdbbd1ed1069a0cecc2e7d90216a1e516c7861aca968ab41" }),
    Object.freeze({ path: "public-review/adjudicator/README.md", sha256: "8cb78ebde22258a20fc26c7f1ba5785cc5d71648d733226bf23938d5b807dcce" }),
    Object.freeze({ path: "public-review/adjudicator/adjudication-template.jsonl", sha256: "6bb2b39afae5e32190d6c862ef5061c196cdbab7adda7e80e2beec6a7e735cd1" }),
    Object.freeze({ path: "public-review/public-hashes.json", sha256: "0fa773770395096bff7b1881dfb8f69748061c4695f917d42c4712c87f9ab521" }),
    Object.freeze({ path: "public-review/reviewer-a/README.md", sha256: "1411b3f70815089a7e435d8fab08a8aaa857044b0c8112e166c7a58513dfe13f" }),
    Object.freeze({ path: "public-review/reviewer-a/reviewer-form.jsonl", sha256: "80c119505d47bd1364f401324567e87036af69beeeaed474e18e0e14459203ed" }),
    Object.freeze({ path: "public-review/reviewer-b/README.md", sha256: "94f27707b28e215b7007921b82a399e1ae06e4a0bbcb916e3a78465ad1730a2b" }),
    Object.freeze({ path: "public-review/reviewer-b/reviewer-form.jsonl", sha256: "16a9fa1823634348dca17c83b5fc2612b23c51cb557c41e882639dfab1be3be5" }),
    Object.freeze({ path: "public-review/shared/README.md", sha256: "51320ee2d7dd9b93456f09bd11795c5dad1e542a46ccb4e49cf71f1ff3db1afb" }),
    Object.freeze({ path: "public-review/shared/review-items.jsonl", sha256: "6ef794ac55fc8294f55879e33b44466d51f1673c09040e4d994436617067e2fb" }),
  ]),
});

export const TRUSTED_RUNNER_SOURCE = Object.freeze({
  commit: "a0889f0597aed9053dcc9b84026644ed94e2ed0f",
  parent: "f721fd1159e6802d29132939c8114377f3faefa4",
  files: Object.freeze([
    Object.freeze({ path: "generate-official-results.test.ts", sha256: "a8240c523e4de4d29d6ba7ed2fd1898828c03b29cc22b912b022693a64fe3e4a" }),
  ]),
});

const TRUSTED_INPUT_SOURCES = Object.freeze([
  Object.freeze({
    commit: "18a332fd06d7ebdfc8c0007ae1e9250db14c82cf",
    parent: "b99bb4fefe0284f26f00271b3c32839b0cddfd43",
    files: Object.freeze([
      Object.freeze({ path: RAW_RESPONSES_PATH, sha256: "1b574d4c1843a283d088cc641523855e78135516545a264c4fe48d5e059a4910" }),
    ]),
  }),
  Object.freeze({
    commit: "8b6512098072a1c4af661a82a45bde2ee1ae7876",
    parent: "a2d68b851d178db20dc3abfb17b2d3eda8d66d3c",
    files: Object.freeze([
      Object.freeze({ path: ANSWER_INPUTS_PATH, sha256: "503441186a90efe93a93b04e53b350737877bfb941f48eb91e610144a3a52675" }),
      Object.freeze({ path: PACKET_MANIFEST_PATH, sha256: "74d45b359b15087e1858face1076113809f2938be7599bf8e79b054b1b54d982" }),
      Object.freeze({ path: PROTOCOL_PATH, sha256: "21fc57bb02a67868965475dab82347fb5abde0fb2eb2a0c8fd3b71f24c58c3f0" }),
    ]),
  }),
]);

const PUBLIC_HASH_PATHS = Object.freeze([
  "public-review/shared/review-items.jsonl", "public-review/shared/README.md",
  "public-review/reviewer-a/reviewer-form.jsonl", "public-review/reviewer-a/README.md",
  "public-review/reviewer-b/reviewer-form.jsonl", "public-review/reviewer-b/README.md",
  "public-review/adjudicator/adjudication-template.jsonl", "public-review/adjudicator/README.md",
]);
const INTERNAL_HASH_PATHS = Object.freeze([
  "internal-audit/review-key.json", "internal-audit/canonical-criteria.jsonl",
  "internal-audit/automatic-report.json", "internal-audit/automatic-summary.json",
  "internal-audit/latency-observation.json",
]);
const ARTIFACT_HASH_PATHS = Object.freeze([
  "boundary-manifest.json", ...PUBLIC_HASH_PATHS, "public-review/public-hashes.json",
  ...INTERNAL_HASH_PATHS, "internal-audit/internal-hashes.json",
]);
const EXPECTED_RESULT_FILES = Object.freeze([
  ...TRUSTED_RESULT_SOURCE.files.map(({ path }) => path),
  ...TRUSTED_RUNNER_SOURCE.files.map(({ path }) => path),
  "README.md",
  "validate-results.mjs",
].sort());

export class Ds13ResultValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "Ds13ResultValidationError";
  }
}

function fail(path, message) {
  throw new Ds13ResultValidationError(`${path}: ${message}`);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function git(repositoryRoot, args, encoding = "utf8") {
  try {
    const { stdout } = await execFileAsync("git", ["-C", repositoryRoot, ...args], {
      encoding,
      maxBuffer: 4 * 1024 * 1024,
      shell: false,
    });
    return stdout;
  } catch {
    fail("git", "fixed Git-object source could not be read");
  }
}

async function regularBytes(path, label) {
  const stat = await lstat(path).catch(() => fail(label, "missing file"));
  if (!stat.isFile() || stat.isSymbolicLink()) fail(label, "expected regular non-symlink file");
  return readFile(path);
}

async function validateGitSource(repositoryRoot, source, currentRoot, resultRelative = false) {
  const lineage = String(await git(repositoryRoot, ["rev-list", "--parents", "-n", "1", source.commit])).trim();
  if (lineage !== `${source.commit} ${source.parent}`) fail("accepted_git_source.lineage", "fixed value changed");
  for (const entry of source.files) {
    const gitPath = resultRelative ? `${RESULT_RELATIVE_ROOT}/${entry.path}` : entry.path;
    const blob = await git(repositoryRoot, ["cat-file", "blob", `${source.commit}:${gitPath}`], "buffer");
    if (sha256(blob) !== entry.sha256) fail(`accepted_git_source.${entry.path}.sha256`, "fixed value changed");
    const currentPath = resultRelative ? join(currentRoot, entry.path) : join(repositoryRoot, entry.path);
    const current = await regularBytes(currentPath, entry.path);
    if (!Buffer.from(blob).equals(current)) fail(`accepted_git_source.${entry.path}`, "current bytes differ from fixed Git blob");
  }
}

async function validateTrustedSources(repositoryRoot, resultRoot, anchorRepositoryRoot) {
  await validateGitSource(anchorRepositoryRoot, TRUSTED_RESULT_SOURCE, resultRoot, true);
  await validateGitSource(anchorRepositoryRoot, TRUSTED_RUNNER_SOURCE, resultRoot, true);
  for (const source of TRUSTED_INPUT_SOURCES) await validateGitSource(anchorRepositoryRoot, source, repositoryRoot, false);
}

function object(value, path) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) fail(path, "expected object");
  return value;
}

function array(value, path) {
  if (!Array.isArray(value)) fail(path, "expected array");
  return value;
}

function cleanString(value, path, allowEmpty = false) {
  if (typeof value !== "string" || (!allowEmpty && value.length === 0) || FORBIDDEN_CONTROL.test(value)) fail(path, "expected clean string");
  return value;
}

function assertCleanStrings(value, path) {
  if (typeof value === "string") {
    cleanString(value, path, true);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertCleanStrings(entry, `${path}[${index}]`));
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, entry] of Object.entries(value)) {
      cleanString(key, `${path}.key`);
      assertCleanStrings(entry, `${path}.${key}`);
    }
  }
}

async function readJson(path, label) {
  try {
    const target = JSON.parse(await readFile(path, "utf8"));
    assertCleanStrings(target, label);
    return target;
  } catch (error) {
    if (error instanceof Ds13ResultValidationError) throw error;
    fail(label, "invalid JSON");
  }
}

async function readJsonl(path, label) {
  const text = await readFile(path, "utf8").catch(() => fail(label, "missing file"));
  if (!text.endsWith("\n") || text.trimEnd().length === 0) fail(label, "expected newline-terminated non-empty JSONL");
  return text.trimEnd().split("\n").map((line, index) => {
    try {
      const target = JSON.parse(line);
      assertCleanStrings(target, `${label}:${index + 1}`);
      return target;
    } catch (error) {
      if (error instanceof Ds13ResultValidationError) throw error;
      fail(`${label}:${index + 1}`, "invalid JSONL record");
    }
  });
}

async function walkFiles(root, relative = "") {
  const entries = await readdir(join(root, relative), { withFileTypes: true }).catch(() => fail(relative || ".", "missing directory"));
  const files = [];
  for (const entry of entries) {
    const entryRelative = relative ? `${relative}/${entry.name}` : entry.name;
    if (entry.isSymbolicLink()) fail(entryRelative, "symlink is forbidden");
    if (entry.isDirectory()) files.push(...await walkFiles(root, entryRelative));
    else if (entry.isFile()) files.push(entryRelative);
    else fail(entryRelative, "expected regular file or directory");
  }
  return files.sort();
}

async function validateHashManifest(resultRoot, relativePath, schemaVersion, status, expectedPaths) {
  const manifest = await readJson(join(resultRoot, relativePath), relativePath);
  if (manifest.schema_version !== schemaVersion || manifest.status !== status || manifest.algorithm !== "sha256") fail(relativePath, "manifest identity changed");
  const files = array(manifest.files, `${relativePath}.files`);
  if (!isDeepStrictEqual(files.map(({ path }) => path), expectedPaths)) fail(relativePath, "path order changed");
  for (const [index, entry] of files.entries()) {
    const target = object(entry, `${relativePath}.files[${index}]`);
    if (!/^[a-f0-9]{64}$/.test(target.sha256)) fail(`${relativePath}.files[${index}].sha256`, "invalid SHA-256");
    const current = await regularBytes(join(resultRoot, target.path), target.path);
    if (sha256(current) !== target.sha256) fail(target.path, "hash mismatch");
  }
}

function round(value) {
  return Number(value.toFixed(6));
}

function reductionRatio(baseline, candidate) {
  return baseline === 0 ? 0 : round(1 - candidate / baseline);
}

function tokenComparison(d1, d2) {
  return d1 === 0
    ? { status: "not_evaluable", d1_estimated_tokens: 0, d2_estimated_tokens: d2, delta: d2, ratio: null }
    : { status: "evaluable", d1_estimated_tokens: d1, d2_estimated_tokens: d2, delta: d2 - d1, ratio: round(d2 / d1) };
}

function stripLatency(report) {
  return {
    version: report.version,
    token_estimator: report.token_estimator,
    case_count: report.case_count,
    cases: report.cases.map((entry) => ({
      id: entry.id,
      dimensions: Object.fromEntries(Object.entries(entry.dimensions).map(([name, dimension]) => [
        name,
        Object.fromEntries(Object.entries(dimension).filter(([key]) => key !== "latency_ms")),
      ])),
      d2_vs_d1_tokens: entry.d2_vs_d1_tokens,
    })),
    aggregate: Object.fromEntries(Object.entries(report.aggregate).map(([name, dimension]) => [
      name,
      Object.fromEntries(Object.entries(dimension).filter(([key]) => key !== "latency_ms")),
    ])),
    d2_vs_d1_tokens: report.d2_vs_d1_tokens,
    thresholds: report.thresholds,
    threshold_failures: report.threshold_failures,
    passed: report.passed,
  };
}

function validateAutomaticReport(report, summary, latency) {
  if (report.version !== 2 || report.case_count !== EXPECTED_COUNTS.slices || report.token_estimator !== "character_count_divided_by_four") fail("automatic-report.json", "identity changed");
  if (report.passed !== false || !isDeepStrictEqual(report.threshold_failures, [
    "D2_RESOLVED_ISSUE_REOPENING_NOT_EVALUABLE", "D2_RECALL_RECOVERY_NOT_EVALUABLE", "D2_MEAN_LATENCY",
  ])) fail("automatic-report.json", "overall non-decision result changed");
  const expectedTokens = { d0: 7767, d1: 2911, d2: 4578 };
  for (const dimensionName of ["d0", "d1", "d2"]) {
    const dimensions = report.cases.map((entry) => entry.dimensions[dimensionName]);
    const aggregate = report.aggregate[dimensionName];
    const tokenTotal = dimensions.reduce((sum, entry) => sum + entry.estimated_tokens, 0);
    if (tokenTotal !== aggregate.estimated_tokens_total || tokenTotal !== expectedTokens[dimensionName]) fail(`automatic-report.aggregate.${dimensionName}`, "token total changed");
    const expectedReduction = dimensionName === "d0" ? 0 : reductionRatio(expectedTokens.d0, expectedTokens[dimensionName]);
    if (aggregate.token_reduction_ratio !== expectedReduction) fail(`automatic-report.aggregate.${dimensionName}`, "reduction arithmetic changed");
    const latencyValues = dimensions.map((entry) => entry.latency_ms);
    if (latencyValues.some((value) => typeof value !== "number" || !Number.isFinite(value) || value < 0)) fail(`automatic-report.${dimensionName}.latency`, "invalid latency");
    if (aggregate.latency_ms.total !== round(latencyValues.reduce((sum, value) => sum + value, 0))) fail(`automatic-report.aggregate.${dimensionName}.latency`, "latency total mismatch");
  }
  for (const entry of report.cases) {
    if (!isDeepStrictEqual(entry.d2_vs_d1_tokens, tokenComparison(entry.dimensions.d1.estimated_tokens, entry.dimensions.d2.estimated_tokens))) fail(`automatic-report.${entry.id}`, "D2-vs-D1 arithmetic changed");
  }
  if (!isDeepStrictEqual(report.d2_vs_d1_tokens, tokenComparison(expectedTokens.d1, expectedTokens.d2))) fail("automatic-report.d2_vs_d1_tokens", "aggregate arithmetic changed");
  const expectedRates = {
    d0: { constraints: [5, 5], decisions: [2, 2], open: [1, 1] },
    d1: { constraints: [0, 5], decisions: [0, 2], open: [0, 1] },
    d2: { constraints: [5, 5], decisions: [2, 2], open: [1, 1] },
  };
  for (const dimensionName of ["d0", "d1", "d2"]) {
    const aggregate = report.aggregate[dimensionName];
    for (const [field, pair] of [["constraint_retention", expectedRates[dimensionName].constraints], ["decision_continuity", expectedRates[dimensionName].decisions], ["open_question_continuity", expectedRates[dimensionName].open]]) {
      const [matched, total] = pair;
      if (!isDeepStrictEqual(aggregate[field], { status: "evaluable", matched, total, rate: round(matched / total) })) fail(`automatic-report.aggregate.${dimensionName}.${field}`, "lexical diagnostic changed");
    }
    const notEvaluable = { status: "not_evaluable", matched: 0, total: 0, rate: null };
    if (!isDeepStrictEqual(aggregate.resolved_issue_reopening, notEvaluable) || !isDeepStrictEqual(aggregate.recall_recovery, notEvaluable)) fail(`automatic-report.aggregate.${dimensionName}`, "not-evaluable state changed");
  }
  if (!isDeepStrictEqual(summary.deterministic_report, stripLatency(report))) fail("automatic-summary.json", "deterministic report differs from official report");
  if (!isDeepStrictEqual(summary.counts, {
    case_count: 6, slice_count: 12, projected_history_turn_count: 101, context_probe_count: 8,
    answer_count: 36, required_criterion_count: 42, forbidden_criterion_count: 16,
    critical_criterion_count: 38, evaluation_run_count: 1, model_call_count: 0, semantic_score_count: 0,
  })) fail("automatic-summary.json.counts", "fixed counts changed");
  if (!isDeepStrictEqual(summary.source_identity, {
    atomic_freeze_qa_commit: "8b6512098072a1c4af661a82a45bde2ee1ae7876",
    answer_capture_source_commit: "18a332fd06d7ebdfc8c0007ae1e9250db14c82cf",
    answer_capture_qa_commit: "30e44261c119e03390fd1b7d5af6b480fe2d5180",
    raw_responses_sha256: "1b574d4c1843a283d088cc641523855e78135516545a264c4fe48d5e059a4910",
    protocol_sha256: "21fc57bb02a67868965475dab82347fb5abde0fb2eb2a0c8fd3b71f24c58c3f0",
  })) fail("automatic-summary.json.source_identity", "fixed source identity changed");
  if (summary.lexical_diagnostic_coverage !== "3/12 slices, 8 probes" || summary.semantic_correctness_gate !== "pending_human_review" || summary.context_reduction_interpretation !== "pending_correctness_gate" || summary.operational_stability_gate !== "not_evaluated_by_this_work_order" || summary.evaluator_passed_interpretation !== "non_decision_diagnostic" || summary.resolved_context_metric !== "not_evaluable_diagnostic_only") fail("automatic-summary.json", "Gate boundary changed");
  if (latency.status !== "single_machine_observation_not_operational_stability_evidence" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(latency.observed_at)) fail("latency-observation.json", "latency boundary changed");
  const expectedPerCase = report.cases.map((entry) => ({ id: entry.id, d0_latency_ms: entry.dimensions.d0.latency_ms, d1_latency_ms: entry.dimensions.d1.latency_ms, d2_latency_ms: entry.dimensions.d2.latency_ms }));
  if (!isDeepStrictEqual(latency.per_case, expectedPerCase) || !isDeepStrictEqual(latency.aggregate, { d0: report.aggregate.d0.latency_ms, d1: report.aggregate.d1.latency_ms, d2: report.aggregate.d2.latency_ms })) fail("latency-observation.json", "latency values differ from official report");
}

function anonymousReviewId(packetId) {
  return `review_${sha256(`${REVIEW_ID_DOMAIN}|${packetId}`).slice(0, 20)}`;
}

function anonymousCriterionId(reviewId, canonicalId) {
  return `criterion_${sha256(`${CRITERION_ID_DOMAIN}|${reviewId}|${canonicalId}`).slice(0, 16)}`;
}

function reviewOrderKey(reviewId) {
  return sha256(`${REVIEW_ORDER_DOMAIN}|${reviewId}`);
}

function canonicalEntries(slice) {
  return [
    ...slice.answer_checklist.required_items.map((entry) => ({ ...entry, type: "required", text: entry.criterion })),
    ...slice.answer_checklist.forbidden_items.map((entry) => ({ ...entry, type: "forbidden", text: entry.claim })),
  ];
}

async function validateReviewBundle(repositoryRoot, resultRoot, protocol, bundles) {
  const [rawRecords, packetManifest, reviewItems, reviewKeyTarget, canonicalTarget, formA, formB, adjudication] = await Promise.all([
    readJsonl(join(repositoryRoot, RAW_RESPONSES_PATH), RAW_RESPONSES_PATH),
    readJson(join(repositoryRoot, PACKET_MANIFEST_PATH), PACKET_MANIFEST_PATH),
    readJsonl(join(resultRoot, "public-review/shared/review-items.jsonl"), "review-items.jsonl"),
    readJson(join(resultRoot, "internal-audit/review-key.json"), "review-key.json"),
    readJsonl(join(resultRoot, "internal-audit/canonical-criteria.jsonl"), "canonical-criteria.jsonl"),
    readJsonl(join(resultRoot, "public-review/reviewer-a/reviewer-form.jsonl"), "reviewer-a form"),
    readJsonl(join(resultRoot, "public-review/reviewer-b/reviewer-form.jsonl"), "reviewer-b form"),
    readJsonl(join(resultRoot, "public-review/adjudicator/adjudication-template.jsonl"), "adjudication template"),
  ]);
  const packetsById = new Map(packetManifest.packets.map((entry) => [entry.packet_id, entry]));
  const slicesById = new Map(protocol.selected_slices.map((entry) => [entry.slice_id, entry]));
  const canonicalMap = new Map();
  const expectedItems = [];
  const expectedKey = [];
  for (const record of rawRecords) {
    const packet = packetsById.get(record.packet_id);
    const slice = packet && slicesById.get(packet.slice_id);
    const task = packet && bundles.get(packet.case_id)?.tasks.tasks.find((entry) => entry.id === packet.slice_id);
    if (!packet || !slice || !task) fail("review bundle", "frozen packet/slice/task mapping missing");
    const parsed = JSON.parse(record.raw_assistant_output);
    const reviewId = anonymousReviewId(record.packet_id);
    const entries = canonicalEntries(slice);
    const criteria = entries.map((entry) => {
      const canonical = {
        canonical_criterion_id: entry.id, slice_id: packet.slice_id, type: entry.type, text: entry.text,
        fact_ids: entry.fact_ids, provenance_event_ids: entry.provenance_event_ids,
        retention_role: entry.retention_role, critical: slice.answer_checklist.critical_miss_ids.includes(entry.id),
      };
      canonicalMap.set(entry.id, canonical);
      return { criterion_id: anonymousCriterionId(reviewId, entry.id), type: entry.type, text: entry.text, critical: canonical.critical };
    });
    expectedItems.push({
      schema_version: "starlette_blind_review_item/v1", review_id: reviewId, task: task.current_task,
      answer: parsed.answer, criteria,
      judgment_contract: { required: ["met", "missed", "uncertain"], forbidden: ["not_asserted", "asserted", "uncertain"], comments: "optional" },
    });
    expectedKey.push({
      review_id: reviewId, review_order_key: reviewOrderKey(reviewId), execution_index: record.execution_index,
      packet_id: record.packet_id, case_id: packet.case_id, slice_id: packet.slice_id, condition: packet.condition,
      repetition: packet.repetition, prompt_sha256: record.prompt_sha256, response_sha256: record.response_sha256,
      criteria: entries.map((entry) => ({ criterion_id: anonymousCriterionId(reviewId, entry.id), canonical_criterion_id: entry.id })),
    });
  }
  expectedItems.sort((left, right) => reviewOrderKey(left.review_id).localeCompare(reviewOrderKey(right.review_id)));
  expectedKey.sort((left, right) => left.review_order_key.localeCompare(right.review_order_key));
  if (!isDeepStrictEqual(reviewItems, expectedItems)) fail("review-items.jsonl", "does not match frozen raw answers/rubric/order");
  const expectedReviewKey = {
    schema_version: "starlette_feasibility_review_key/v1", status: "internal_do_not_export_to_reviewers",
    blinding_domains: { review_id: REVIEW_ID_DOMAIN, review_order: REVIEW_ORDER_DOMAIN, criterion_id: CRITERION_ID_DOMAIN },
    entries: expectedKey,
  };
  if (!isDeepStrictEqual(reviewKeyTarget, expectedReviewKey)) fail("review-key.json", "mapping changed");
  const expectedCanonical = [...canonicalMap.values()].sort((left, right) => left.canonical_criterion_id.localeCompare(right.canonical_criterion_id));
  if (!isDeepStrictEqual(canonicalTarget, expectedCanonical)) fail("canonical-criteria.jsonl", "canonical rubric/provenance mapping changed");
  const blankForm = (slot) => expectedItems.map((item) => ({
    schema_version: "starlette_blind_review_form/v1", reviewer_slot: slot, review_id: item.review_id,
    criteria: item.criteria.map((criterion) => ({ criterion_id: criterion.criterion_id, judgment: null })), comments: null,
  }));
  if (!isDeepStrictEqual(formA, blankForm("a")) || !isDeepStrictEqual(formB, blankForm("b"))) fail("reviewer forms", "forms are not independently blank and aligned");
  const expectedAdjudication = expectedItems.map((item) => ({
    schema_version: "starlette_blind_adjudication/v1", review_id: item.review_id,
    criteria: item.criteria.map((criterion) => ({ criterion_id: criterion.criterion_id, reviewer_a_judgment: null, reviewer_b_judgment: null, adjudicated_judgment: null, adjudication_reason: null })),
    comments: null,
  }));
  if (!isDeepStrictEqual(adjudication, expectedAdjudication)) fail("adjudication-template.jsonl", "template changed");
  if (reviewItems.length !== EXPECTED_COUNTS.answers || new Set(reviewItems.map(({ review_id }) => review_id)).size !== EXPECTED_COUNTS.answers) fail("review-items.jsonl", "review id cardinality changed");
  if (canonicalMap.size !== EXPECTED_COUNTS.required + EXPECTED_COUNTS.forbidden || expectedCanonical.filter(({ critical }) => critical).length !== EXPECTED_COUNTS.critical) fail("canonical-criteria.jsonl", "criterion count changed");
}

async function validatePublicBoundary(resultRoot) {
  for (const relativePath of ["public-review/shared/review-items.jsonl", "public-review/shared/README.md", "public-review/reviewer-a/reviewer-form.jsonl", "public-review/reviewer-a/README.md", "public-review/reviewer-b/reviewer-form.jsonl", "public-review/reviewer-b/README.md", "public-review/adjudicator/adjudication-template.jsonl", "public-review/adjudicator/README.md", "public-review/public-hashes.json"]) {
    const content = await readFile(join(resultRoot, relativePath), "utf8");
    if (FORBIDDEN_CONTROL.test(content) || PUBLIC_METADATA_LEAK.test(content)) fail(relativePath, "public metadata leak or forbidden Unicode control");
  }
  const boundary = await readJson(join(resultRoot, "boundary-manifest.json"), "boundary-manifest.json");
  if (!isDeepStrictEqual(boundary.roots, { public_review: "public-review", internal_audit: "internal-audit" }) || boundary.official_evaluation_run_count !== 1 || boundary.model_call_count !== 0 || boundary.semantic_score_count !== 0) fail("boundary-manifest.json", "boundary/count changed");
  if (!isDeepStrictEqual(boundary.reviewer_exports, {
    reviewer_a: ["public-review/shared", "public-review/reviewer-a"],
    reviewer_b: ["public-review/shared", "public-review/reviewer-b"],
    adjudicator: ["public-review/shared", "public-review/adjudicator"],
  })) fail("boundary-manifest.json", "reviewer export boundary changed");
  if (!isDeepStrictEqual(boundary.threat_model, {
    reviewer_repository_access_allowed: false, reviewer_raw_capture_access_allowed: false,
    reviewer_internal_audit_access_allowed: false, reviewer_automatic_report_access_allowed: false,
    reviewer_other_form_access_allowed: false, whole_public_review_directory_is_a_reviewer_export: false,
  })) fail("boundary-manifest.json", "threat model changed");
  if (!isDeepStrictEqual(boundary.gates, {
    lexical_diagnostic_coverage: "3/12 slices, 8 probes", semantic_correctness_gate: "pending_human_review",
    context_reduction_interpretation: "pending_correctness_gate", operational_stability_gate: "not_evaluated_by_this_work_order",
  })) fail("boundary-manifest.json", "Gate boundary changed");
  return boundary;
}

export async function validateDs13Results(repositoryRoot, options = {}) {
  const normalizedRepositoryRoot = resolve(repositoryRoot);
  const resultRoot = resolve(options.artifact_root ?? join(normalizedRepositoryRoot, RESULT_RELATIVE_ROOT));
  const anchorRepositoryRoot = resolve(options.anchor_repository_root ?? normalizedRepositoryRoot);

  // Trust anchors run before any current result JSON is parsed.
  await validateTrustedSources(normalizedRepositoryRoot, resultRoot, anchorRepositoryRoot);
  const resultFiles = await walkFiles(resultRoot);
  if (!isDeepStrictEqual(resultFiles, EXPECTED_RESULT_FILES)) fail("result directory", "file set changed");
  await validateHashManifest(resultRoot, "public-review/public-hashes.json", "starlette_feasibility_public_hashes/v1", "blank_group_blind_bundle_pending_independent_qa", PUBLIC_HASH_PATHS);
  await validateHashManifest(resultRoot, "internal-audit/internal-hashes.json", "starlette_feasibility_internal_hashes/v1", "internal_do_not_export_to_reviewers", INTERNAL_HASH_PATHS);
  await validateHashManifest(resultRoot, "artifact-hashes.json", "starlette_feasibility_artifact_hashes/v1", "official_artifact_pending_independent_qa", ARTIFACT_HASH_PATHS);

  const starletteRoot = join(normalizedRepositoryRoot, "evaluation/starlette-v1");
  await validateFeasibilityCapture(normalizedRepositoryRoot, { anchor_repository_root: anchorRepositoryRoot });
  await validateProtocolCanary(starletteRoot);
  const [{ protocol }, bundles, report, summary, latency] = await Promise.all([
    loadProtocolCanary(starletteRoot), loadPromotionBundles(starletteRoot),
    readJson(join(resultRoot, "internal-audit/automatic-report.json"), "automatic-report.json"),
    readJson(join(resultRoot, "internal-audit/automatic-summary.json"), "automatic-summary.json"),
    readJson(join(resultRoot, "internal-audit/latency-observation.json"), "latency-observation.json"),
  ]);
  const boundary = await validatePublicBoundary(resultRoot);
  if (!isDeepStrictEqual(report.cases.map(({ id }) => id), protocol.selected_slices.map(({ slice_id }) => slice_id))) fail("automatic-report.json.cases", "case order differs from frozen protocol");
  validateAutomaticReport(report, summary, latency);
  if (latency.observed_at !== boundary.official_run_observed_at) fail("latency-observation.json", "timestamp differs from boundary manifest");
  await validateReviewBundle(normalizedRepositoryRoot, resultRoot, protocol, bundles);

  return {
    schema_version: "starlette_feasibility_result_validation/v1",
    status: "automatic_diagnostic_and_blank_review_bundle_valid_pending_independent_qa",
    accepted_git_source_commit: TRUSTED_RESULT_SOURCE.commit,
    git_object_anchor_verified: true,
    evaluator_case_count: 12,
    lexical_probe_count: 8,
    lexical_probe_slice_count: 3,
    answer_count: 36,
    review_item_count: 36,
    evaluation_run_count: 1,
    model_call_count: 0,
    semantic_score_count: 0,
    semantic_correctness_gate: "pending_human_review",
    context_reduction_interpretation: "pending_correctness_gate",
    operational_stability_gate: "not_evaluated_by_this_work_order",
  };
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
  validateDs13Results(repositoryRoot)
    .then((result) => process.stdout.write(`${JSON.stringify(result)}\n`))
    .catch((error) => {
      process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      process.exitCode = 1;
    });
}
