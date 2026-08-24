#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

function readJson(path) {
  return JSON.parse(readFileSync(resolve(ROOT, path), "utf8"));
}

function fail(message) {
  throw new Error(message);
}

function normalizeLexical(value) {
  return value.normalize("NFC").toLocaleLowerCase("en-US").replace(/[\p{P}\p{Z}\p{S}]+/gu, "");
}

function validateCapture(capture, condition) {
  if (capture.condition !== condition || capture.sample_unit !== "one_composite_request" ||
      capture.assertion_units !== 12 || capture.assertions_are_independent_samples !== false ||
      !Array.isArray(capture.answers) || capture.answers.length !== 12) {
    fail(`${condition}: invalid capture header`);
  }
  const ids = capture.answers.map((answer) => answer.probe_id);
  const expected = Array.from({ length: 12 }, (_, index) => `P${String(index + 1).padStart(2, "0")}`);
  if (ids.some((id, index) => id !== expected[index]) || new Set(ids).size !== 12) {
    fail(`${condition}: missing, duplicate, or reordered answer`);
  }
  for (const answer of capture.answers) {
    if (typeof answer.answer !== "string" || answer.answer.length === 0 || answer.answer !== answer.answer.normalize("NFC")) {
      fail(`${condition}/${answer.probe_id}: invalid answer`);
    }
  }
}

function scoreAnswer(answer, truth) {
  const normalized = normalizeLexical(answer.answer);
  const requiredGroups = truth.required_assertion_groups.map((group) => {
    const matchedAssertion = group.any_of.find((assertion) => normalized.includes(normalizeLexical(assertion))) ?? null;
    return {
      group_id: group.id,
      description: group.description,
      lexically_confirmed: matchedAssertion !== null,
      matched_assertion: matchedAssertion
    };
  });
  const forbiddenMatches = truth.forbidden_claims.filter((claim) =>
    normalized.includes(normalizeLexical(claim))
  );
  const confirmed = requiredGroups.filter((group) => group.lexically_confirmed).length;
  return {
    probe_id: truth.id,
    critical: truth.critical,
    answer: answer.answer,
    required_groups: requiredGroups,
    required_groups_confirmed: confirmed,
    required_groups_total: requiredGroups.length,
    forbidden_claims_detected: forbiddenMatches,
    lexical_status: forbiddenMatches.length > 0
      ? "forbidden_claim_detected"
      : confirmed === requiredGroups.length
        ? "all_required_groups_confirmed"
        : "manual_semantic_review_required"
  };
}

function scoreCondition(capture, groundTruth) {
  const probes = groundTruth.probes.map((truth, index) => scoreAnswer(capture.answers[index], truth));
  const requiredTotal = probes.reduce((sum, probe) => sum + probe.required_groups_total, 0);
  const requiredConfirmed = probes.reduce((sum, probe) => sum + probe.required_groups_confirmed, 0);
  const critical = probes.filter((probe) => probe.critical);
  return {
    condition: capture.condition,
    sample_units: 1,
    assertion_units: 12,
    assertions_are_independent_samples: false,
    required_groups_confirmed: requiredConfirmed,
    required_groups_total: requiredTotal,
    probes_all_required_groups_confirmed: probes.filter((probe) =>
      probe.required_groups_confirmed === probe.required_groups_total && probe.forbidden_claims_detected.length === 0
    ).length,
    critical_probes_all_required_groups_confirmed: critical.filter((probe) =>
      probe.required_groups_confirmed === probe.required_groups_total && probe.forbidden_claims_detected.length === 0
    ).length,
    critical_probes_total: critical.length,
    forbidden_claims_detected: probes.reduce((sum, probe) => sum + probe.forbidden_claims_detected.length, 0),
    aggregate_pass_threshold: "not_defined",
    probes
  };
}

const groundTruth = readJson("evaluation/codex-dogfood-01/internal-ground-truth/ground-truth.json");
const native = readJson("evaluation/codex-dogfood-01/captures/native-a.json");
const compiled = readJson("evaluation/codex-dogfood-01/captures/compiled-b.json");

validateCapture(native, "A_native_host_after_minimal_repo_refresh");
validateCapture(compiled, "B_oracle_typed_state_compiled_upper_bound");
if (!Array.isArray(groundTruth.probes) || groundTruth.probes.length !== 12 ||
    groundTruth.probes.some((probe) => !Array.isArray(probe.required_assertion_groups) || probe.required_assertion_groups.length === 0)) {
  fail("ground truth contains an empty or missing probe");
}

const report = {
  schema_version: 1,
  report_id: "codex-dogfood-01-automatic-lexical-v1",
  ground_truth_id: groundTruth.ground_truth_id,
  measurement_unit: "one_composite_request_with_12_nonindependent_assertions",
  scoring_scope: "normalized_lexical_confirmation_only",
  semantic_equivalence_automatic: false,
  empty_probe_count: 0,
  vacuous_pass_possible: false,
  conditions: [
    scoreCondition(native, groundTruth),
    scoreCondition(compiled, groundTruth)
  ]
};

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
