// @vitest-environment node

import { createHash } from "node:crypto";
import { cp, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import {
  ACCEPTED_EMPTY_STATE_SCORING_CONTRACT,
  runEmptyStateScoring,
} from "../evaluation/state-replay-v0.1/st02/internal/empty-state-scorer.js";

const REPOSITORY_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const FIXTURE_ROOT = join(REPOSITORY_ROOT, "evaluation/state-replay-v0.1");
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

async function copiedFixture(): Promise<string> {
  const temporary = await mkdtemp(join(tmpdir(), "context-compiler-st02-score-"));
  temporaryDirectories.push(temporary);
  const fixture = join(temporary, "state-replay-v0.1");
  await cp(FIXTURE_ROOT, fixture, { recursive: true });
  return fixture;
}

describe("WO-DS-14 ST-02 empty-state outcome scorer", () => {
  it("replays the fixed capture and reproduces the committed raw report", async () => {
    const report = await runEmptyStateScoring(REPOSITORY_ROOT);
    const committed = JSON.parse(await readFile(join(FIXTURE_ROOT, "st02/internal/empty-state-report.json"), "utf8"));
    expect(report).toEqual(committed);
    expect(report.status).toBe("official_st02_scored_pending_independent_qa");
    expect(report.execution_boundaries).toMatchObject({
      scoring_run_count: 1,
      model_call_count: 0,
      provider_call_count: 0,
      network_call_count: 0,
      evaluator_run_count: 0,
      new_remote_session_count: 0,
      matcher_run_count: 0,
      generic_semantic_matcher_implemented: false,
      aggregate_score: null,
      threshold: null,
      architecture_winner: null,
    });
  });

  it("keeps 12/16/2 primary outcomes mutually exclusive and all step/case arithmetic closed", async () => {
    const report = await runEmptyStateScoring(REPOSITORY_ROOT);
    expect(report.primary_outcomes).toEqual({
      mutually_exclusive: true,
      total: 30,
      counts: {
        parse_failure_with_empty_fallback: 12,
        strict_valid_empty_on_gold_nonempty: 16,
        strict_valid_empty_true_negative: 2,
      },
      sum_equals_total: true,
    });
    expect(report.cases.map((entry: any) => [entry.case_id, entry.step_count])).toEqual([
      ["STR-08", 4],
      ["STR-07", 10],
      ["STR-06", 16],
    ]);
    expect(report.cases.flatMap((entry: any) => entry.steps)).toHaveLength(30);
    for (const caseReport of report.cases) {
      expect(Object.values(caseReport.primary_outcomes).reduce((total: number, value: any) => total + value, 0)).toBe(caseReport.step_count);
    }
  });

  it("reports non-vacuous recall and structured zero-denominator precision/matcher states", async () => {
    const report = await runEmptyStateScoring(REPOSITORY_ROOT);
    expect(report.state_metrics.unique_recall).toEqual({
      general: { numerator: 0, denominator: 35, rate: 0 },
      critical: { numerator: 0, denominator: 29, rate: 0 },
    });
    expect(report.state_metrics.checkpoint_weighted_recall).toMatchObject({
      general: { numerator: 0, denominator: 253, rate: 0 },
      critical: { numerator: 0, denominator: 192, rate: 0 },
    });
    expect(report.state_metrics.precision.general).toMatchObject({ status: "not_evaluable_zero_predicted_items", denominator: 0, rate: null });
    expect(report.state_metrics.precision.critical).toMatchObject({ status: "not_evaluable_zero_predicted_items", denominator: 0, rate: null });
    expect(report.state_metrics.matcher).toMatchObject({
      status: "short_circuited_empty_left_set",
      opportunity_count: 0,
      unmatched_predicted_count: 0,
      ambiguous_match_count: 0,
    });
  });

  it("does not turn inherited lifecycle/relationship absence or E13 into separate vacuous successes", async () => {
    const report = await runEmptyStateScoring(REPOSITORY_ROOT);
    expect(report.downstream_outcomes.supersession).toMatchObject({
      gold_result_realized: { numerator: 0, denominator: 6, rate: 0 },
      capability_eligible_count: 0,
      capability_status: "not_evaluable_precondition_absent",
      additional_primary_extractor_error_count: 0,
    });
    expect(report.downstream_outcomes.resolution).toMatchObject({
      gold_result_realized: { numerator: 0, denominator: 7, rate: 0 },
      capability_eligible_count: 0,
      capability_status: "not_evaluable_precondition_absent",
      additional_primary_extractor_error_count: 0,
    });
    for (const key of ["stale_activation", "wrong_reactivation", "dependency_inconsistency", "provenance_failure"]) {
      expect(report.downstream_outcomes[key].eligible_count).toBe(0);
      expect(report.downstream_outcomes[key].status).toMatch(/^not_evaluable/);
    }
    const e13 = report.cases.flatMap((entry: any) => entry.steps).find((step: any) => step.event_id === "STR-06/E13");
    expect(e13).toMatchObject({
      primary_outcome: "strict_valid_empty_true_negative",
      downstream_gold_outcome: {
        wrong_reactivation: {
          incident_count: 0,
          eligible_count: 0,
          status: "not_evaluable_no_predicted_tombstone",
          interpretation: "empty_true_negative_only",
        },
      },
    });
  });

  it("anchors the separately committed scoring contract before capture/Gold parsing", async () => {
    expect(ACCEPTED_EMPTY_STATE_SCORING_CONTRACT).toEqual({
      commit: "00a71dd55ab3fafb844fb44dfb584f1d8f7008f8",
      parent: "4415f4bafb6d76fecde26ddef1e0060c6a666f84",
      blob: "c461cad2fd310e044dce844c15cd481c3ac7d346",
      sha256: "b406bd5198801d9968fb9c78597f60489e73efc84866151cd2a61be1d72be9c9",
    });
    const source = await readFile(join(FIXTURE_ROOT, "st02/internal/empty-state-scorer.ts"), "utf8");
    expect(source.indexOf("await validateScoringContractAnchor(repositoryRoot, fixtureRoot)")).toBeLessThan(source.indexOf("const contract = parseJson"));
    expect(source.indexOf("await validateFixedTree(repositoryRoot, fixtureRoot, captureTrust.commit")).toBeLessThan(source.indexOf("const semantic = parseJson"));
    expect(source).not.toContain("semantic matcher");
    expect(source).not.toContain("feasibility-01/");
  });

  it("rejects coordinated capture response/metadata/replay/manifest rewrites before parsing", async () => {
    const fixture = await copiedFixture();
    const responsePath = join(fixture, "st02/capture/responses/pkt_0aaac79f6e5179a3b24d3b18.json");
    const response = JSON.parse(await readFile(responsePath, "utf8"));
    response.raw_response = `${response.raw_response} `;
    await writeFile(responsePath, `${JSON.stringify(response)}\n`, "utf8");
    const metadataPath = join(fixture, "st02/capture/metadata/pkt_0aaac79f6e5179a3b24d3b18.json");
    const metadata = JSON.parse(await readFile(metadataPath, "utf8"));
    metadata.raw_response_sha256 = createHash("sha256").update(response.raw_response).digest("hex");
    await writeFile(metadataPath, `${JSON.stringify(metadata)}\n`, "utf8");
    for (const name of ["source-only-replay.json", "run-manifest.json"]) {
      const target = join(fixture, `st02/capture/${name}`);
      const value = JSON.parse(await readFile(target, "utf8"));
      value.coordinated_rewrite = true;
      await writeFile(target, `${JSON.stringify(value)}\n`, "utf8");
    }
    await expect(runEmptyStateScoring(REPOSITORY_ROOT, { fixture_root: fixture })).rejects.toThrow(/capture\.artifacts.*current bytes differ from fixed Git blob/);
  });

  it("rejects scoring-contract and Gold coordinated rewrites despite internally changed denominators", async () => {
    const contractFixture = await copiedFixture();
    const contractPath = join(contractFixture, "st02/internal/scoring-contract.json");
    const contract = JSON.parse(await readFile(contractPath, "utf8"));
    contract.fixed_denominators.gold_unique_items = 34;
    await writeFile(contractPath, `${JSON.stringify(contract, null, 2)}\n`, "utf8");
    await expect(runEmptyStateScoring(REPOSITORY_ROOT, { fixture_root: contractFixture })).rejects.toThrow(/scoring_contract\.current/);

    const goldFixture = await copiedFixture();
    const semanticPath = join(goldFixture, "gold/semantic-items.json");
    const semantic = JSON.parse(await readFile(semanticPath, "utf8"));
    semantic.items[1].key = semantic.items[0].key;
    semantic.items[0].unknown = true;
    await writeFile(semanticPath, `${JSON.stringify(semantic, null, 2)}\n`, "utf8");
    const deltaPath = join(goldFixture, "gold/gold-deltas.jsonl");
    const deltas = (await readFile(deltaPath, "utf8")).trimEnd().split("\n");
    deltas.pop();
    await writeFile(deltaPath, `${deltas.join("\n")}\n`, "utf8");
    await expect(runEmptyStateScoring(REPOSITORY_ROOT, { fixture_root: goldFixture })).rejects.toThrow(/gold\.artifacts.*current bytes differ from fixed Git blob/);
  });

  it("rejects missing, extra, duplicate-path, symlink and non-NFC/unknown filesystem entries", async () => {
    const missing = await copiedFixture();
    await rm(join(missing, "st02/packets/001-pkt_0aaac79f6e5179a3b24d3b18.json"));
    await expect(runEmptyStateScoring(REPOSITORY_ROOT, { fixture_root: missing })).rejects.toThrow(/current file path allowlist differs/);

    const extra = await copiedFixture();
    await writeFile(join(extra, "st02/capture/unknown.json"), "{}\n", "utf8");
    await expect(runEmptyStateScoring(REPOSITORY_ROOT, { fixture_root: extra })).rejects.toThrow(/current file path allowlist differs/);

    const duplicate = await copiedFixture();
    await cp(join(duplicate, "st02/packets/001-pkt_0aaac79f6e5179a3b24d3b18.json"), join(duplicate, "st02/packets/duplicate-pkt_0aaac79f6e5179a3b24d3b18.json"));
    await expect(runEmptyStateScoring(REPOSITORY_ROOT, { fixture_root: duplicate })).rejects.toThrow(/current file path allowlist differs/);

    const linked = await copiedFixture();
    const linkedTarget = join(linked, "st02/capture/responses/pkt_0aaac79f6e5179a3b24d3b18.json");
    const linkedSaved = `${linkedTarget}.saved`;
    await cp(linkedTarget, linkedSaved);
    await rm(linkedTarget);
    await symlink(linkedSaved, linkedTarget);
    await expect(runEmptyStateScoring(REPOSITORY_ROOT, { fixture_root: linked })).rejects.toThrow(/symlink is forbidden/);

    const unicode = await copiedFixture();
    await writeFile(join(unicode, "st02/capture/e\u0301.json"), "{}\n", "utf8");
    await expect(runEmptyStateScoring(REPOSITORY_ROOT, { fixture_root: unicode })).rejects.toThrow(/NFC-normalized Unicode/);
  });
});
