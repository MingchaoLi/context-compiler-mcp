#!/usr/bin/env node

import { createHash } from "node:crypto";
import { lstat, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";
import {
  validateCanary,
  validateCaseBundle,
  validatePilot,
} from "./validate-pilot.mjs";

const PROMOTION_VERSION = "starlette-promotion/v1";
const DIFF_VERSION = "starlette-promotion-diff/v1";
const SNAPSHOT_VERSION = "starlette-contamination-snapshot/v1";
const SOURCE_REAUDIT_VERSION = "starlette-source-reaudit/v1";
const RULE_VERSION = "starlette-contamination-rule/v1";
const RULE_TEXT = "Mark confirmed only when a public repository explicitly reuses the same Starlette issue or fix as an LLM, agent, benchmark, code-repair, or evaluation task, or highly copies that task or patch. Ordinary downstream references, vendored source, production workarounds, repository names that merely contain agent or SWE, and retrieved-context noise unrelated to the task, Gold, or answer do not count.";
const CUTOFF = "2026-08-23T03:00:00Z";
const REGISTERED_CASES = ["STR-07", "STR-08", "STR-05", "STR-06", "STR-01", "STR-04"];
const PROMOTED_CASES = ["STR-08", "STR-05", "STR-04"];
const REMAINING_CASES = ["STR-07", "STR-06", "STR-01"];
const CASE_FILES = [
  "manifest.json",
  "events.json",
  "tasks.json",
  "fact-gold.json",
  "oracle-state.json",
  "decision-references.json",
  "outcome-anchors.json",
];
const SOURCE_PATHS = {
  "STR-08": "pilot/STR-08",
  "STR-05": "pilot/STR-05",
  "STR-04": "canary/STR-04",
};
const ACCEPTED_STATUSES = {
  "STR-08": "pilot_not_frozen",
  "STR-05": "pilot_not_frozen",
  "STR-04": "canary_not_frozen",
};
const ACCEPTED_SOURCE_COMMIT = "32600eb6b7caf3fbe339e1103d3293f0b7e33103";
const ACCEPTED_SOURCE_CONTRACT = [
  { case_id: "STR-08", path: "pilot/STR-08/manifest.json", sha256: "7b58e7620f0f6b572976cd47cfbbc37661e29268509d13a88f27669533e35baf" },
  { case_id: "STR-08", path: "pilot/STR-08/events.json", sha256: "63ddd24b005790b0d8d9236580a685a8bde0572d3702668e7a255b70906e2831" },
  { case_id: "STR-08", path: "pilot/STR-08/tasks.json", sha256: "b43aa97419bc86f30f1b6d1aa32e31177469cd89217dd600837ba0e731e7be7d" },
  { case_id: "STR-08", path: "pilot/STR-08/fact-gold.json", sha256: "2ae67a067ef16bd8e12b546b65b9e00e5324f0e683e37ab2809c4b2a5f089ae9" },
  { case_id: "STR-08", path: "pilot/STR-08/oracle-state.json", sha256: "aad76971651ef204b4af7ed1ab5b84525efa01d42a84bca4a98137058aa76db9" },
  { case_id: "STR-08", path: "pilot/STR-08/decision-references.json", sha256: "3e86bdc7f73060fd54420e1f2da952108d79b474f23e99c75d0a9bb288328453" },
  { case_id: "STR-08", path: "pilot/STR-08/outcome-anchors.json", sha256: "c5a7784635c63d136506019a54363fb9dcd921478d219e75c15707cb70c57682" },
  { case_id: "STR-05", path: "pilot/STR-05/manifest.json", sha256: "3aa84d2523bb4d99ce6d6bb5c48d528920426234d1693afffe1d5c1638a20b2e" },
  { case_id: "STR-05", path: "pilot/STR-05/events.json", sha256: "49cbe96c411fd42246aba51ddf67d4a90d51ca52970481fccc6026bceecdd402" },
  { case_id: "STR-05", path: "pilot/STR-05/tasks.json", sha256: "8c0662a4e26ac5ff53d575499a1eaba5168f61ddbb268545db5ad874cfef6beb" },
  { case_id: "STR-05", path: "pilot/STR-05/fact-gold.json", sha256: "ef98d0a9c50a3e9325620958f393463a6a4e049eabea0436862f55d9762adedd" },
  { case_id: "STR-05", path: "pilot/STR-05/oracle-state.json", sha256: "94a6f2028f7ce2978a0580f626ef312abd67ef169b92c9bc472251fb3f4a22b2" },
  { case_id: "STR-05", path: "pilot/STR-05/decision-references.json", sha256: "66bcafefbb013df839350e352c1d46836714e8aaf2ec004bda9bb8c1940480b1" },
  { case_id: "STR-05", path: "pilot/STR-05/outcome-anchors.json", sha256: "13547990dc52b322b44fbe3559916d8a63fc53ed0fc69b5fb626615b7b3d90fe" },
  { case_id: "STR-04", path: "canary/STR-04/manifest.json", sha256: "19b436786ce401b3f3e385297d6bd58c4e8bacd905f9fb1e4c179b51aecb0f1d" },
  { case_id: "STR-04", path: "canary/STR-04/events.json", sha256: "00833cbfbf0d3a6cea2bd5615c5f353db31c3e200274fd58c4ea2f6710828154" },
  { case_id: "STR-04", path: "canary/STR-04/tasks.json", sha256: "8f69ae4c11546b4fee84a27da3dbc173d231b146ab7b6a5d6cc51b67e4af8104" },
  { case_id: "STR-04", path: "canary/STR-04/fact-gold.json", sha256: "50150ff6202365832096a4c6eff1592be22540c7694e6ecfd86a080ba02cbffa" },
  { case_id: "STR-04", path: "canary/STR-04/oracle-state.json", sha256: "be179bf0c2a42a6bad5a9bf0cfca37da433c8a9cb733fd3bb765fbedd5568e3b" },
  { case_id: "STR-04", path: "canary/STR-04/decision-references.json", sha256: "26d9da7b00e0c50ed4bb3e62866723e2d6af4e509b82516c6905914db3b08549" },
  { case_id: "STR-04", path: "canary/STR-04/outcome-anchors.json", sha256: "4e71438bb8d138f2973541e8fc3f8170d44942fc3dab8cc5e136525f819f7a1a" },
];
const EXPECTED_SOURCE_NUMBERS = {
  "STR-07": [1008, 1010],
  "STR-08": [1298],
  "STR-05": [1083, 1377, 1683],
  "STR-06": [1365, 1366, 1410],
  "STR-01": [495, 500, 1692],
  "STR-04": [685, 1286, 1649, 2349],
};

export class PromotionValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "PromotionValidationError";
  }
}

function fail(path, message) {
  throw new PromotionValidationError(`${path}: ${message}`);
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
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    fail(path, `expected keys ${expected.join(",")}; got ${actual.join(",")}`);
  }
  return target;
}

function string(value, path) {
  if (typeof value !== "string" || value.length === 0) fail(path, "expected non-empty string");
  return value;
}

function bool(value, path) {
  if (typeof value !== "boolean") fail(path, "expected boolean");
  return value;
}

function integer(value, path, minimum = 0) {
  if (!Number.isInteger(value) || value < minimum) fail(path, `expected integer >= ${minimum}`);
  return value;
}

function array(value, path) {
  if (!Array.isArray(value)) fail(path, "expected array");
  return value;
}

function iso(value, path) {
  string(value, path);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(value) || Number.isNaN(Date.parse(value))) {
    fail(path, "expected UTC ISO timestamp");
  }
  return value;
}

function sha256(value, path) {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value)) fail(path, "expected SHA-256 hex");
  return value;
}

function exactArray(value, expected, path) {
  const target = array(value, path);
  if (!isDeepStrictEqual(target, expected)) fail(path, `expected ${JSON.stringify(expected)}`);
  return target;
}

function uniqueStrings(value, path) {
  const values = array(value, path).map((entry, index) => string(entry, `${path}[${index}]`));
  if (new Set(values).size !== values.length) fail(path, "duplicate value");
  return values;
}

async function readJson(path) {
  try {
    const metadata = await lstat(path);
    if (!metadata.isFile() || metadata.isSymbolicLink()) fail(path, "expected regular file");
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    fail(path, error instanceof Error ? error.message : "unable to read JSON");
  }
}

async function hashFile(path) {
  const metadata = await lstat(path);
  if (!metadata.isFile() || metadata.isSymbolicLink()) fail(path, "expected regular file");
  return createHash("sha256").update(await readFile(path)).digest("hex");
}

async function readRegularFile(path) {
  const metadata = await lstat(path);
  if (!metadata.isFile() || metadata.isSymbolicLink()) fail(path, "expected regular file");
  return readFile(path);
}

async function loadCase(root, relativePath) {
  const values = await Promise.all(CASE_FILES.map((name) => readJson(join(root, relativePath, name))));
  return {
    manifest: values[0],
    events: values[1],
    tasks: values[2],
    factGold: values[3],
    oracleState: values[4],
    decisionReferences: values[5],
    outcomeAnchors: values[6],
  };
}

function validateCollection(value, path) {
  const target = exact(value, [
    "schema_version", "collection_id", "status", "evidence_cutoff_at", "registered_case_ids",
    "promoted_case_ids", "remaining_case_ids", "contamination_rule_version",
    "contamination_snapshot", "source_reaudit", "promotion_diff", "cases",
    "evaluation_ready", "model_run_authorized",
  ], path);
  if (target.schema_version !== PROMOTION_VERSION || target.collection_id !== "starlette-v1") {
    fail(path, "collection identity changed");
  }
  if (target.status !== "promotion_candidate_not_frozen") fail(`${path}.status`, "promotion status changed");
  if (target.evidence_cutoff_at !== CUTOFF) fail(`${path}.evidence_cutoff_at`, "evidence cutoff changed");
  exactArray(target.registered_case_ids, REGISTERED_CASES, `${path}.registered_case_ids`);
  exactArray(target.promoted_case_ids, PROMOTED_CASES, `${path}.promoted_case_ids`);
  exactArray(target.remaining_case_ids, REMAINING_CASES, `${path}.remaining_case_ids`);
  if (target.contamination_rule_version !== RULE_VERSION) fail(`${path}.contamination_rule_version`, "rule changed");
  for (const [key, expectedPath] of [
    ["contamination_snapshot", "promotion/contamination-snapshot.json"],
    ["source_reaudit", "promotion/source-reaudit.json"],
    ["promotion_diff", "promotion/promotion-diff.json"],
  ]) {
    const ref = exact(target[key], ["path", "sha256"], `${path}.${key}`);
    if (ref.path !== expectedPath) fail(`${path}.${key}.path`, "metadata path changed");
    sha256(ref.sha256, `${path}.${key}.sha256`);
  }
  const cases = array(target.cases, `${path}.cases`);
  if (cases.length !== PROMOTED_CASES.length) fail(`${path}.cases`, "expected three promoted cases");
  for (const [index, entry] of cases.entries()) {
    const casePath = `${path}.cases[${index}]`;
    const item = exact(entry, [
      "case_id", "accepted_path", "accepted_status", "accepted_candidate_commit",
      "promotion_path", "promotion_status",
    ], casePath);
    const caseId = PROMOTED_CASES[index];
    if (
      item.case_id !== caseId || item.accepted_path !== SOURCE_PATHS[caseId] ||
      item.accepted_status !== ACCEPTED_STATUSES[caseId] ||
      item.accepted_candidate_commit !== ACCEPTED_SOURCE_COMMIT ||
      item.promotion_path !== `promotion/cases/${caseId}` ||
      item.promotion_status !== "promoted_not_frozen"
    ) fail(casePath, "case promotion registration changed");
  }
  if (bool(target.evaluation_ready, `${path}.evaluation_ready`) !== false) fail(`${path}.evaluation_ready`, "must remain false");
  if (bool(target.model_run_authorized, `${path}.model_run_authorized`) !== false) fail(`${path}.model_run_authorized`, "must remain false");
  return target;
}

function validateSnapshot(value, path) {
  const target = exact(value, [
    "schema_version", "snapshot_id", "rule_version", "evidence_cutoff_at", "scan_observed_at",
    "prior_snapshot", "rule", "search_capabilities", "results", "limitations",
  ], path);
  if (target.schema_version !== SNAPSHOT_VERSION || target.rule_version !== RULE_VERSION) fail(path, "snapshot identity changed");
  string(target.snapshot_id, `${path}.snapshot_id`);
  if (target.evidence_cutoff_at !== CUTOFF) fail(`${path}.evidence_cutoff_at`, "evidence cutoff changed");
  iso(target.scan_observed_at, `${path}.scan_observed_at`);
  if (Date.parse(target.scan_observed_at) < Date.parse(CUTOFF)) fail(`${path}.scan_observed_at`, "scan predates cutoff");
  const prior = exact(target.prior_snapshot, ["path", "sha256"], `${path}.prior_snapshot`);
  if (prior.path !== "contamination-scan.json" || prior.sha256 !== "4397c5d7c0d9ea5cd729d1131c12960167f951619d1caf623bab988a0746a87f") {
    fail(`${path}.prior_snapshot`, "prior snapshot changed");
  }
  if (target.snapshot_id !== `starlette-v1-promotion-${target.scan_observed_at}`) fail(`${path}.snapshot_id`, "snapshot id/time mismatch");
  if (target.rule !== RULE_TEXT) fail(`${path}.rule`, "contamination rule text changed");
  const capabilities = exact(target.search_capabilities, [
    "github_code_search_api", "github_public_code_search_ui", "web_index_exact_path_search",
  ], `${path}.search_capabilities`);
  if (
    capabilities.github_code_search_api !== "unavailable_requires_authentication" ||
    capabilities.github_public_code_search_ui !== "unavailable_requires_sign_in" ||
    capabilities.web_index_exact_path_search !== "completed_with_index_limitations"
  ) fail(`${path}.search_capabilities`, "search capability disclosure changed");
  const results = array(target.results, `${path}.results`);
  if (results.length !== REGISTERED_CASES.length) fail(`${path}.results`, "expected six registered cases");
  for (const [index, entry] of results.entries()) {
    const resultPath = `${path}.results[${index}]`;
    const item = exact(entry, [
      "candidate_id", "source_numbers", "queries", "status", "eligibility",
      "direct_evidence", "excluded_hits", "notes",
    ], resultPath);
    const caseId = REGISTERED_CASES[index];
    if (item.candidate_id !== caseId) fail(`${resultPath}.candidate_id`, "case order changed");
    exactArray(item.source_numbers, EXPECTED_SOURCE_NUMBERS[caseId], `${resultPath}.source_numbers`);
    if (uniqueStrings(item.queries, `${resultPath}.queries`).length < 2) fail(`${resultPath}.queries`, "at least two query descriptions required");
    if (!["confirmed", "no_public_hit_found"].includes(item.status)) fail(`${resultPath}.status`, "unsupported status");
    const evidence = array(item.direct_evidence, `${resultPath}.direct_evidence`);
    for (const [evidenceIndex, evidenceEntry] of evidence.entries()) {
      const evidencePath = `${resultPath}.direct_evidence[${evidenceIndex}]`;
      const direct = exact(evidenceEntry, ["repository", "path", "url", "reason"], evidencePath);
      for (const key of ["repository", "path", "url", "reason"]) string(direct[key], `${evidencePath}.${key}`);
    }
    const excluded = array(item.excluded_hits, `${resultPath}.excluded_hits`);
    for (const [excludedIndex, excludedEntry] of excluded.entries()) {
      const excludedPath = `${resultPath}.excluded_hits[${excludedIndex}]`;
      const hit = exact(excludedEntry, ["url", "classification", "reason"], excludedPath);
      for (const key of ["url", "classification", "reason"]) string(hit[key], `${excludedPath}.${key}`);
    }
    if (
      caseId === "STR-04" && !excluded.some((hit) =>
        hit.url.includes("Uniyalsumit/CT_PROJECT") && hit.classification === "context_only_retrieval_noise"
      )
    ) fail(`${resultPath}.excluded_hits`, "STR-04 RAGAS context-only exclusion missing");
    if ((item.status === "confirmed") !== (evidence.length > 0)) fail(resultPath, "status/evidence mismatch");
    const expectedEligibility = item.status === "confirmed" ? "disclosed_not_blind_eligible" : "eligible_as_of_snapshot";
    if (item.eligibility !== expectedEligibility) fail(`${resultPath}.eligibility`, "eligibility/status mismatch");
    string(item.notes, `${resultPath}.notes`);
  }
  string(target.limitations, `${path}.limitations`);
  return target;
}

function validateSourceReaudit(value, bundles, path) {
  const target = exact(value, [
    "schema_version", "repository", "evidence_cutoff_at", "observed_at", "checks",
    "cases", "summary", "limitations",
  ], path);
  if (target.schema_version !== SOURCE_REAUDIT_VERSION || target.repository !== "Kludex/starlette") fail(path, "source re-audit identity changed");
  if (target.evidence_cutoff_at !== CUTOFF) fail(`${path}.evidence_cutoff_at`, "evidence cutoff changed");
  iso(target.observed_at, `${path}.observed_at`);
  exactArray(target.checks, ["database_id", "node_id", "actor", "occurred_at", "content_sha256"], `${path}.checks`);
  const cases = array(target.cases, `${path}.cases`);
  if (cases.length !== PROMOTED_CASES.length) fail(`${path}.cases`, "expected three source re-audits");
  let sourceCount = 0;
  let reviewCount = 0;
  let stateCount = 0;
  for (const [index, entry] of cases.entries()) {
    const casePath = `${path}.cases[${index}]`;
    const item = exact(entry, [
      "case_id", "event_ids_verified", "review_submitted_at_event_ids",
      "state_canonical_hash_event_ids", "semantic_payload_change_required",
    ], casePath);
    const caseId = PROMOTED_CASES[index];
    if (item.case_id !== caseId) fail(`${casePath}.case_id`, "case order changed");
    const events = bundles.get(caseId).events.events;
    exactArray(item.event_ids_verified, events.map(({ id }) => id), `${casePath}.event_ids_verified`);
    exactArray(
      item.review_submitted_at_event_ids,
      events.filter(({ event_type }) => event_type === "pull_request_review").map(({ id }) => id),
      `${casePath}.review_submitted_at_event_ids`
    );
    exactArray(
      item.state_canonical_hash_event_ids,
      events.filter(({ event_type }) => event_type === "issue_state").map(({ id }) => id),
      `${casePath}.state_canonical_hash_event_ids`
    );
    if (bool(item.semantic_payload_change_required, `${casePath}.semantic_payload_change_required`) !== false) {
      fail(`${casePath}.semantic_payload_change_required`, "metadata-only promotion must remain false");
    }
    sourceCount += events.length;
    reviewCount += item.review_submitted_at_event_ids.length;
    stateCount += item.state_canonical_hash_event_ids.length;
  }
  const summary = exact(target.summary, [
    "source_count", "exact_match_count", "review_updated_at_unavailable_count",
    "state_canonical_hash_count", "semantic_payload_change_count",
  ], `${path}.summary`);
  if (
    integer(summary.source_count, `${path}.summary.source_count`) !== sourceCount ||
    integer(summary.exact_match_count, `${path}.summary.exact_match_count`) !== sourceCount ||
    integer(summary.review_updated_at_unavailable_count, `${path}.summary.review_updated_at_unavailable_count`) !== reviewCount ||
    integer(summary.state_canonical_hash_count, `${path}.summary.state_canonical_hash_count`) !== stateCount ||
    integer(summary.semantic_payload_change_count, `${path}.summary.semantic_payload_change_count`) !== 0
  ) fail(`${path}.summary`, "source re-audit counts changed");
  string(target.limitations, `${path}.limitations`);
  return target;
}

async function expectedDiffEntries(root) {
  const entries = [];
  for (const accepted of ACCEPTED_SOURCE_CONTRACT) {
    const file = accepted.path.slice(accepted.path.lastIndexOf("/") + 1);
    const newPath = `promotion/cases/${accepted.case_id}/${file}`;
    const [oldContent, newContent] = await Promise.all([
      readRegularFile(join(root, accepted.path)),
      readRegularFile(join(root, newPath)),
    ]);
    const oldHash = createHash("sha256").update(oldContent).digest("hex");
    const newHash = createHash("sha256").update(newContent).digest("hex");
    if (oldHash !== accepted.sha256) fail(accepted.path, `accepted source differs from fixed ${ACCEPTED_SOURCE_COMMIT} contract`);
    if (!oldContent.equals(newContent) || newHash !== accepted.sha256) fail(newPath, "promotion copy differs from fixed accepted-source contract");
    entries.push({
      case_id: accepted.case_id,
      file,
      old_path: accepted.path,
      old_sha256: accepted.sha256,
      new_path: newPath,
      new_sha256: accepted.sha256,
      change_class: "byte_identical_relocation",
    });
  }
  return entries;
}

function validateDiff(value, expectedEntries, path) {
  const target = exact(value, [
    "schema_version", "collection_id", "evidence_cutoff_at", "default_change_class", "entries",
  ], path);
  if (target.schema_version !== DIFF_VERSION || target.collection_id !== "starlette-v1") fail(path, "promotion diff identity changed");
  if (target.evidence_cutoff_at !== CUTOFF) fail(`${path}.evidence_cutoff_at`, "evidence cutoff changed");
  if (target.default_change_class !== "byte_identical_relocation") fail(`${path}.default_change_class`, "change class changed");
  if (!isDeepStrictEqual(target.entries, expectedEntries)) fail(`${path}.entries`, "promotion diff does not match filesystem");
  return target;
}

export async function computePromotionHashEntries(root) {
  const targetRoot = resolve(root);
  const paths = [
    "promotion/collection.json",
    "promotion/contamination-snapshot.json",
    "promotion/source-reaudit.json",
    "promotion/promotion-diff.json",
  ];
  for (const caseId of PROMOTED_CASES) {
    for (const file of CASE_FILES) paths.push(`promotion/cases/${caseId}/${file}`);
  }
  return Promise.all(paths.map(async (path) => ({ path, sha256: await hashFile(join(targetRoot, path)) })));
}

function validateHashes(value, expectedEntries, path) {
  const target = exact(value, ["schema_version", "status", "algorithm", "files"], path);
  if (
    target.schema_version !== PROMOTION_VERSION ||
    target.status !== "promotion_candidate_not_frozen" ||
    target.algorithm !== "sha256"
  ) fail(path, "promotion hash header changed");
  const files = array(target.files, `${path}.files`).map((entry, index) => {
    const item = exact(entry, ["path", "sha256"], `${path}.files[${index}]`);
    string(item.path, `${path}.files[${index}].path`);
    sha256(item.sha256, `${path}.files[${index}].sha256`);
    return item;
  });
  if (!isDeepStrictEqual(files, expectedEntries)) fail(`${path}.files`, "promotion content hash mismatch");
}

export async function loadPromotionBundles(root) {
  const targetRoot = resolve(root);
  const entries = await Promise.all(PROMOTED_CASES.map(async (caseId) => [
    caseId,
    await loadCase(targetRoot, `promotion/cases/${caseId}`),
  ]));
  return new Map(entries);
}

export async function validatePromotion(root) {
  const targetRoot = resolve(root);
  await Promise.all([validatePilot(targetRoot), validateCanary(targetRoot)]);
  const [collection, snapshot, sourceReaudit, diff, hashes, bundles] = await Promise.all([
    readJson(join(targetRoot, "promotion/collection.json")),
    readJson(join(targetRoot, "promotion/contamination-snapshot.json")),
    readJson(join(targetRoot, "promotion/source-reaudit.json")),
    readJson(join(targetRoot, "promotion/promotion-diff.json")),
    readJson(join(targetRoot, "promotion-hashes.json")),
    loadPromotionBundles(targetRoot),
  ]);
  const collectionData = validateCollection(collection, "promotion/collection.json");
  const snapshotData = validateSnapshot(snapshot, "promotion/contamination-snapshot.json");
  const sourceData = validateSourceReaudit(sourceReaudit, bundles, "promotion/source-reaudit.json");
  const caseResults = PROMOTED_CASES.map((caseId) => validateCaseBundle(bundles.get(caseId), caseId));
  const diffEntries = await expectedDiffEntries(targetRoot);
  validateDiff(diff, diffEntries, "promotion/promotion-diff.json");
  for (const [key, relativePath] of [
    ["contamination_snapshot", "promotion/contamination-snapshot.json"],
    ["source_reaudit", "promotion/source-reaudit.json"],
    ["promotion_diff", "promotion/promotion-diff.json"],
  ]) {
    const actual = await hashFile(join(targetRoot, relativePath));
    if (collectionData[key].sha256 !== actual) fail(`promotion/collection.json.${key}.sha256`, "referenced hash mismatch");
  }
  const expectedHashes = await computePromotionHashEntries(targetRoot);
  validateHashes(hashes, expectedHashes, "promotion-hashes.json");
  const confirmed = snapshotData.results.filter(({ status }) => status === "confirmed").map(({ candidate_id }) => candidate_id);
  return {
    schema_version: PROMOTION_VERSION,
    status: "promotion_candidate_not_frozen",
    registered_case_count: REGISTERED_CASES.length,
    promoted_case_count: PROMOTED_CASES.length,
    remaining_case_count: REMAINING_CASES.length,
    relocation_file_count: diffEntries.length,
    byte_identical_file_count: diffEntries.filter(({ change_class }) => change_class === "byte_identical_relocation").length,
    source_reaudit_count: sourceData.summary.source_count,
    slice_count: caseResults.reduce((sum, result) => sum + result.slices, 0),
    contamination_confirmed: confirmed,
    evaluation_ready: false,
    model_run_authorized: false,
    hashes_verified: true,
  };
}

const modulePath = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === modulePath) {
  const defaultRoot = dirname(modulePath);
  const args = process.argv.slice(2);
  const printHashes = args.includes("--print-hashes");
  const requestedRoot = args.find((arg) => !arg.startsWith("--")) ?? defaultRoot;
  try {
    if (printHashes) {
      const files = await computePromotionHashEntries(requestedRoot);
      process.stdout.write(`${JSON.stringify({
        schema_version: PROMOTION_VERSION,
        status: "promotion_candidate_not_frozen",
        algorithm: "sha256",
        files,
      }, null, 2)}\n`);
    } else {
      process.stdout.write(`${JSON.stringify(await validatePromotion(requestedRoot))}\n`);
    }
  } catch (error) {
    const message = error instanceof PromotionValidationError ? error.message : "validation failed";
    process.stderr.write(`${JSON.stringify({ error: "INVALID_PROMOTION", message })}\n`);
    process.exitCode = 2;
  }
}
