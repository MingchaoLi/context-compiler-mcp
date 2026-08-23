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
import { validateStr06Checkpoint } from "./validate-str06-checkpoint.mjs";
import { validateStr07Checkpoint } from "./validate-str07-checkpoint.mjs";
import { validateStr01Checkpoint } from "./validate-str01-checkpoint.mjs";

const PROMOTION_VERSION = "starlette-promotion/v1";
const DIFF_VERSION = "starlette-promotion-diff/v1";
const SNAPSHOT_VERSION = "starlette-contamination-snapshot/v1";
const SOURCE_ACCEPTANCE_LEDGER_VERSION = "starlette-source-acceptance-ledger/v1";
const RULE_VERSION = "starlette-contamination-rule/v1";
const RULE_TEXT = "Mark confirmed only when a public repository explicitly reuses the same Starlette issue or fix as an LLM, agent, benchmark, code-repair, or evaluation task, or highly copies that task or patch. Ordinary downstream references, vendored source, production workarounds, repository names that merely contain agent or SWE, and retrieved-context noise unrelated to the task, Gold, or answer do not count.";
const CUTOFF = "2026-08-23T03:00:00Z";
const REGISTERED_CASES = ["STR-07", "STR-08", "STR-05", "STR-06", "STR-01", "STR-04"];
const PROMOTED_CASES = [...REGISTERED_CASES];
const REMAINING_CASES = [];
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
  "STR-07": "checkpoint/STR-07",
  "STR-08": "pilot/STR-08",
  "STR-05": "pilot/STR-05",
  "STR-06": "checkpoint/STR-06",
  "STR-01": "checkpoint/STR-01",
  "STR-04": "canary/STR-04",
};
const ACCEPTED_STATUSES = {
  "STR-07": "checkpoint_not_frozen",
  "STR-08": "pilot_not_frozen",
  "STR-05": "pilot_not_frozen",
  "STR-06": "checkpoint_not_frozen",
  "STR-01": "checkpoint_not_frozen",
  "STR-04": "canary_not_frozen",
};
const ACCEPTED_SOURCE_COMMITS = {
  "STR-07": "8f51bf4f9308d124ace63c5c8ca755373105c71f",
  "STR-08": "32600eb6b7caf3fbe339e1103d3293f0b7e33103",
  "STR-05": "32600eb6b7caf3fbe339e1103d3293f0b7e33103",
  "STR-06": "f4931ad35cc7e4a844bb40ceb397aaf07842616d",
  "STR-01": "454565b863cf7e9470e7ac8079febf2a5c0d42d9",
  "STR-04": "32600eb6b7caf3fbe339e1103d3293f0b7e33103",
};
const ACCEPTED_QA_REPORTS = {
  "STR-07": "docs/qa/WO-DS-07-starlette-str07-source-gold-checkpoint.md",
  "STR-08": "docs/qa/WO-DS-02-starlette-schema-pilot.md",
  "STR-05": "docs/qa/WO-DS-02-starlette-schema-pilot.md",
  "STR-06": "docs/qa/WO-DS-06-starlette-str06-source-gold-checkpoint.md",
  "STR-01": "docs/qa/WO-DS-08-starlette-str01-source-gold-checkpoint.md",
  "STR-04": "docs/qa/WO-DS-03-starlette-long-open-canary.md",
};
const EXPECTED_TIERS = {
  "STR-07": "long", "STR-08": "short", "STR-05": "long",
  "STR-06": "long", "STR-01": "long", "STR-04": "long",
};
const EXPECTED_SLICE_COUNTS = {
  "STR-07": 10, "STR-08": 4, "STR-05": 9, "STR-06": 16, "STR-01": 18, "STR-04": 18,
};
const SNAPSHOT_PATH = "promotion/contamination-snapshot-freeze-candidate.json";
const PRIOR_SNAPSHOT_PATH = "promotion/contamination-snapshot.json";
const PRIOR_SNAPSHOT_SHA256 = "02361a573d0bcab37c0e617ddc4e5feb0cb44b93174d6ea029ae94c622527eb1";
const ACCEPTANCE_LEDGER_PATH = "promotion/source-acceptance-ledger.json";
const ACCEPTED_SOURCE_CONTRACT = [
  { case_id: "STR-07", path: "checkpoint/STR-07/manifest.json", sha256: "50be99952568fa0c1d8842f21eaa2cc1f75ccde589168ca57c809128252692e2" },
  { case_id: "STR-07", path: "checkpoint/STR-07/events.json", sha256: "3997eb8605f3b666eb0bc722e15279b0e680b5ea9130fb41a244d2bcbba30111" },
  { case_id: "STR-07", path: "checkpoint/STR-07/tasks.json", sha256: "d3cbd14605d0994be5d493e7257e4d79cf61a44cc7373ebfeea7820e697e2040" },
  { case_id: "STR-07", path: "checkpoint/STR-07/fact-gold.json", sha256: "159391d3b9985a2148d36650f8e30dfe7dc7bcfa383fd1e11f6cf61df02baa8a" },
  { case_id: "STR-07", path: "checkpoint/STR-07/oracle-state.json", sha256: "ffda91eda4f11e0d5e451824d2723f1029ba329a65a92486c246b234c1fc1ff8" },
  { case_id: "STR-07", path: "checkpoint/STR-07/decision-references.json", sha256: "31e8993a52d42c3853d2e8c40ce15130bfb53c260c602429baa247ec832ce1a5" },
  { case_id: "STR-07", path: "checkpoint/STR-07/outcome-anchors.json", sha256: "a728b56bc371a548973875f90f55234fcc52b47fa1245111d343d390512c8aa3" },
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
  { case_id: "STR-06", path: "checkpoint/STR-06/manifest.json", sha256: "57db1709992d1931e35cb166bbbaa88722c5ccc6e8f1b1fbc331445a8923154b" },
  { case_id: "STR-06", path: "checkpoint/STR-06/events.json", sha256: "5c6987c02ec7e22e819ca7f856a041866439bb217b734c6252a92cc367002efd" },
  { case_id: "STR-06", path: "checkpoint/STR-06/tasks.json", sha256: "9f3b6a743f94b7f421401680505b43f8810b268e46875ba1858ed4efebe834e5" },
  { case_id: "STR-06", path: "checkpoint/STR-06/fact-gold.json", sha256: "06366e47427a337ab81877bf20cbc5c93eb7669ad8685fbe4d1cbabf45eb593b" },
  { case_id: "STR-06", path: "checkpoint/STR-06/oracle-state.json", sha256: "a432b420dcd7437c936b991f3c551564f1f66f8b889910a8f91c6c0c46e6bca4" },
  { case_id: "STR-06", path: "checkpoint/STR-06/decision-references.json", sha256: "10fdaf1976b85d8a999ec33956894120189af131ff252e10be5b30943b2e85d1" },
  { case_id: "STR-06", path: "checkpoint/STR-06/outcome-anchors.json", sha256: "98da239df9e97d05ba56b9c8a98bf7dad15b4954ac3787b057b98769d3258ff6" },
  { case_id: "STR-01", path: "checkpoint/STR-01/manifest.json", sha256: "521ab26db11326f774b25af85b39fa986d064a86a3bff527948a2c529d98715a" },
  { case_id: "STR-01", path: "checkpoint/STR-01/events.json", sha256: "6b469975f50ccdf546dd94f23fc16c4a71e8cd22ef0bfa38e61f59dc3f594483" },
  { case_id: "STR-01", path: "checkpoint/STR-01/tasks.json", sha256: "7b29b509fc964e62e314fa7cfabb55e8c6625084e4bfbf165dc817232dae3741" },
  { case_id: "STR-01", path: "checkpoint/STR-01/fact-gold.json", sha256: "46901de933704a0a1487e94aea21e903fc26db27d0eb3ed031c7423fbdf5a87b" },
  { case_id: "STR-01", path: "checkpoint/STR-01/oracle-state.json", sha256: "ad8c0c18e1ef1c48b1d74905e22f7edb29f035d574db76f06e62f67d406c8bd3" },
  { case_id: "STR-01", path: "checkpoint/STR-01/decision-references.json", sha256: "ab0c0b3ecbb8389bbe49477405bf6c10ee298dbb987401adab5459272cc4a8fb" },
  { case_id: "STR-01", path: "checkpoint/STR-01/outcome-anchors.json", sha256: "ae2883e0a72473f34077f9b09b38e03c788360ebc20c2b126560d62bc14d66f3" },
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
    "promoted_case_ids", "remaining_case_ids", "tier_distribution", "contamination_rule_version",
    "contamination_snapshot", "source_acceptance_ledger", "promotion_diff", "cases",
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
  const tiers = exact(target.tier_distribution, [
    "case_counts", "slice_counts", "medium_status", "tier_balanced_claim_authorized",
    "pooled_aggregate_status",
  ], `${path}.tier_distribution`);
  const caseCounts = exact(tiers.case_counts, ["short", "medium", "long"], `${path}.tier_distribution.case_counts`);
  const sliceCounts = exact(tiers.slice_counts, ["short", "medium", "long"], `${path}.tier_distribution.slice_counts`);
  if (
    integer(caseCounts.short, `${path}.tier_distribution.case_counts.short`) !== 1 ||
    integer(caseCounts.medium, `${path}.tier_distribution.case_counts.medium`) !== 0 ||
    integer(caseCounts.long, `${path}.tier_distribution.case_counts.long`) !== 5 ||
    integer(sliceCounts.short, `${path}.tier_distribution.slice_counts.short`) !== 4 ||
    integer(sliceCounts.medium, `${path}.tier_distribution.slice_counts.medium`) !== 0 ||
    integer(sliceCounts.long, `${path}.tier_distribution.slice_counts.long`) !== 71 ||
    tiers.medium_status !== "not_represented_not_evaluable" ||
    bool(tiers.tier_balanced_claim_authorized, `${path}.tier_distribution.tier_balanced_claim_authorized`) !== false ||
    tiers.pooled_aggregate_status !== "descriptive_only_not_authorized"
  ) fail(`${path}.tier_distribution`, "audited tier limitation changed");
  if (target.contamination_rule_version !== RULE_VERSION) fail(`${path}.contamination_rule_version`, "rule changed");
  for (const [key, expectedPath] of [
    ["contamination_snapshot", SNAPSHOT_PATH],
    ["source_acceptance_ledger", ACCEPTANCE_LEDGER_PATH],
    ["promotion_diff", "promotion/promotion-diff.json"],
  ]) {
    const ref = exact(target[key], ["path", "sha256"], `${path}.${key}`);
    if (ref.path !== expectedPath) fail(`${path}.${key}.path`, "metadata path changed");
    sha256(ref.sha256, `${path}.${key}.sha256`);
  }
  const cases = array(target.cases, `${path}.cases`);
  if (cases.length !== PROMOTED_CASES.length) fail(`${path}.cases`, "expected six promoted cases");
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
      item.accepted_candidate_commit !== ACCEPTED_SOURCE_COMMITS[caseId] ||
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
  if (prior.path !== PRIOR_SNAPSHOT_PATH || prior.sha256 !== PRIOR_SNAPSHOT_SHA256) {
    fail(`${path}.prior_snapshot`, "prior snapshot changed");
  }
  if (target.snapshot_id !== `starlette-v1-freeze-candidate-${target.scan_observed_at}`) fail(`${path}.snapshot_id`, "snapshot id/time mismatch");
  if (target.rule !== RULE_TEXT) fail(`${path}.rule`, "contamination rule text changed");
  const capabilities = exact(target.search_capabilities, [
    "github_code_search_api", "github_public_code_search_ui", "web_index_exact_path_search",
  ], `${path}.search_capabilities`);
  if (
    capabilities.github_code_search_api !== "unavailable_in_current_tooling" ||
    capabilities.github_public_code_search_ui !== "unavailable_in_current_tooling" ||
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

function validateSourceAcceptanceLedger(value, bundles, path) {
  const target = exact(value, [
    "schema_version", "collection_id", "evidence_cutoff_at", "basis",
    "live_source_reaudit_performed", "cases", "summary", "limitations",
  ], path);
  if (target.schema_version !== SOURCE_ACCEPTANCE_LEDGER_VERSION || target.collection_id !== "starlette-v1") {
    fail(path, "source acceptance ledger identity changed");
  }
  if (target.evidence_cutoff_at !== CUTOFF) fail(`${path}.evidence_cutoff_at`, "evidence cutoff changed");
  if (target.basis !== "independent_data_qa_and_fixed_git_candidates") fail(`${path}.basis`, "acceptance basis changed");
  if (bool(target.live_source_reaudit_performed, `${path}.live_source_reaudit_performed`) !== false) {
    fail(`${path}.live_source_reaudit_performed`, "DS-09 must not claim a live source re-audit");
  }
  const cases = array(target.cases, `${path}.cases`);
  if (cases.length !== PROMOTED_CASES.length) fail(`${path}.cases`, "expected six accepted cases");
  let eventCount = 0;
  let sliceCount = 0;
  let fileCount = 0;
  for (const [index, entry] of cases.entries()) {
    const casePath = `${path}.cases[${index}]`;
    const item = exact(entry, [
      "case_id", "accepted_path", "accepted_status", "accepted_candidate_commit", "qa_report_path",
      "event_count", "slice_count", "file_count", "semantic_payload_change_required",
    ], casePath);
    const caseId = PROMOTED_CASES[index];
    const bundle = bundles.get(caseId);
    if (
      item.case_id !== caseId || item.accepted_path !== SOURCE_PATHS[caseId] ||
      item.accepted_status !== ACCEPTED_STATUSES[caseId] ||
      item.accepted_candidate_commit !== ACCEPTED_SOURCE_COMMITS[caseId] ||
      item.qa_report_path !== ACCEPTED_QA_REPORTS[caseId]
    ) fail(casePath, "accepted source registration changed");
    if (
      integer(item.event_count, `${casePath}.event_count`) !== bundle.events.events.length ||
      integer(item.slice_count, `${casePath}.slice_count`) !== bundle.tasks.tasks.length ||
      integer(item.file_count, `${casePath}.file_count`) !== CASE_FILES.length
    ) fail(casePath, "accepted source counts changed");
    if (bool(item.semantic_payload_change_required, `${casePath}.semantic_payload_change_required`) !== false) {
      fail(`${casePath}.semantic_payload_change_required`, "metadata-only promotion must remain false");
    }
    eventCount += item.event_count;
    sliceCount += item.slice_count;
    fileCount += item.file_count;
  }
  const summary = exact(target.summary, [
    "accepted_case_count", "source_event_count", "slice_count", "promotion_file_count",
    "semantic_payload_change_count",
  ], `${path}.summary`);
  if (
    integer(summary.accepted_case_count, `${path}.summary.accepted_case_count`) !== PROMOTED_CASES.length ||
    integer(summary.source_event_count, `${path}.summary.source_event_count`) !== eventCount ||
    integer(summary.slice_count, `${path}.summary.slice_count`) !== sliceCount ||
    integer(summary.promotion_file_count, `${path}.summary.promotion_file_count`) !== fileCount ||
    integer(summary.semantic_payload_change_count, `${path}.summary.semantic_payload_change_count`) !== 0
  ) fail(`${path}.summary`, "source acceptance counts changed");
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
    if (oldHash !== accepted.sha256) {
      fail(accepted.path, `accepted source differs from fixed ${ACCEPTED_SOURCE_COMMITS[accepted.case_id]} contract`);
    }
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
    SNAPSHOT_PATH,
    ACCEPTANCE_LEDGER_PATH,
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
  await Promise.all([
    validatePilot(targetRoot), validateCanary(targetRoot), validateStr06Checkpoint(targetRoot),
    validateStr07Checkpoint(targetRoot), validateStr01Checkpoint(targetRoot),
  ]);
  const [collection, snapshot, acceptanceLedger, diff, hashes, bundles] = await Promise.all([
    readJson(join(targetRoot, "promotion/collection.json")),
    readJson(join(targetRoot, SNAPSHOT_PATH)),
    readJson(join(targetRoot, ACCEPTANCE_LEDGER_PATH)),
    readJson(join(targetRoot, "promotion/promotion-diff.json")),
    readJson(join(targetRoot, "promotion-hashes.json")),
    loadPromotionBundles(targetRoot),
  ]);
  const collectionData = validateCollection(collection, "promotion/collection.json");
  const snapshotData = validateSnapshot(snapshot, SNAPSHOT_PATH);
  if (await hashFile(join(targetRoot, PRIOR_SNAPSHOT_PATH)) !== PRIOR_SNAPSHOT_SHA256) {
    fail(PRIOR_SNAPSHOT_PATH, "prior promotion snapshot changed");
  }
  const sourceData = validateSourceAcceptanceLedger(acceptanceLedger, bundles, ACCEPTANCE_LEDGER_PATH);
  const caseResults = PROMOTED_CASES.map((caseId) => validateCaseBundle(bundles.get(caseId), caseId));
  for (const [index, result] of caseResults.entries()) {
    const caseId = PROMOTED_CASES[index];
    if (
      bundles.get(caseId).manifest.tier !== EXPECTED_TIERS[caseId] ||
      result.slices !== EXPECTED_SLICE_COUNTS[caseId]
    ) fail(`promotion/cases/${caseId}/manifest.json`, "audited tier or slice count changed");
  }
  const diffEntries = await expectedDiffEntries(targetRoot);
  validateDiff(diff, diffEntries, "promotion/promotion-diff.json");
  for (const [key, relativePath] of [
    ["contamination_snapshot", SNAPSHOT_PATH],
    ["source_acceptance_ledger", ACCEPTANCE_LEDGER_PATH],
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
    source_acceptance_event_count: sourceData.summary.source_event_count,
    slice_count: caseResults.reduce((sum, result) => sum + result.slices, 0),
    short_case_count: 1,
    medium_case_count: 0,
    long_case_count: 5,
    medium_evaluable: false,
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
