// @vitest-environment node

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { EVALUATION_REPORT_VERSION_V2, parseEvaluationSuiteV2 } from "../src/evaluation.js";
// The wiring utility intentionally remains outside the publishable src/ package.
// @ts-expect-error JavaScript fixture utility has no declaration file.
import {
  buildWiringSmoke,
  validateCollectionPlan,
  validateWiringSmoke,
} from "../evaluation/starlette-v1/wiring-smoke.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "evaluation", "starlette-v1");

describe("Starlette no-model wiring smoke", () => {
  it("locks the six-case preregistration without treating projected tiers as quotas", async () => {
    const wiring = await buildWiringSmoke(ROOT);
    expect(wiring.plan.registered_cases.map((entry: any) => entry.case_id)).toEqual([
      "STR-07", "STR-08", "STR-05", "STR-06", "STR-01", "STR-04",
    ]);
    expect(wiring.plan.smoke_case_ids).toEqual(["STR-08", "STR-05", "STR-04"]);
    expect(wiring.plan.selection_policy).toEqual({
      allow_result_based_replacement: false,
      allow_transparent_tier_reclassification: true,
      tier_distribution_is_quota: false,
    });
  });

  it("maps all 31 accepted slices once and parses every evaluator v2 case", async () => {
    const wiring = await buildWiringSmoke(ROOT);
    expect(wiring.suite.cases).toHaveLength(31);
    expect(new Set(wiring.suite.cases.map((entry: any) => entry.id)).size).toBe(31);
    for (const evaluationCase of wiring.suite.cases) {
      expect(() => parseEvaluationSuiteV2({
        version: 2,
        cases: [evaluationCase],
        thresholds: wiring.suite.thresholds,
      })).not.toThrow();
    }
    expect(() => parseEvaluationSuiteV2(wiring.suite)).not.toThrow();
  });

  it("preserves exact slice prefixes and serializes only the six projected event fields", async () => {
    const wiring = await buildWiringSmoke(ROOT);
    const early = wiring.suite.cases.find((entry: any) => entry.id === "STR-04/T3")!;
    expect(early.raw_events.map((entry: any) => entry.id)).toEqual([
      "STR-04/E1", "STR-04/E2", "STR-04/E3",
    ]);
    for (const event of early.raw_events) {
      expect(Object.keys(JSON.parse(event.content))).toEqual([
        "id", "role", "event_type", "occurred_at", "actor", "summary",
      ]);
      expect(event.metadata).toEqual({});
      expect(event.source_event_id).toBe(`starlette-v1:${event.id}`);
    }
  });

  it("rejects a changed prefix before evaluator execution", async () => {
    const wiring = await buildWiringSmoke(ROOT);
    const candidate = structuredClone(wiring);
    const target = candidate.suite.cases.find((entry: any) => entry.id === "STR-04/T3")!;
    target.raw_events.splice(1, 1);
    await expect(validateWiringSmoke(ROOT, candidate, {
      parseSuite: parseEvaluationSuiteV2,
      evaluatorReportVersion: EVALUATION_REPORT_VERSION_V2,
    })).rejects.toThrow(/slice-to-evaluator mapping changed/);
  });

  it("rejects Oracle provenance that no longer resolves to visible raw evidence", async () => {
    const wiring = await buildWiringSmoke(ROOT);
    const candidate = structuredClone(wiring.suite);
    const target = candidate.cases.find((entry: any) => entry.id === "STR-08/T2")!;
    target.context_items[0].source_refs = ["STR-08/E99"];
    expect(() => parseEvaluationSuiteV2(candidate)).toThrowError(/Evaluation input is invalid/);
  });

  it("rejects silent case replacement, reordering, and freeze-state changes", async () => {
    const wiring = await buildWiringSmoke(ROOT);
    const reordered = structuredClone(wiring.plan);
    [reordered.registered_cases[0], reordered.registered_cases[1]] = [
      reordered.registered_cases[1], reordered.registered_cases[0],
    ];
    expect(() => validateCollectionPlan(reordered)).toThrow(/preregistered six-case contract/);

    const replaced = structuredClone(wiring.plan);
    replaced.registered_cases[0].case_id = "STR-09";
    expect(() => validateCollectionPlan(replaced)).toThrow(/preregistered six-case contract/);

    const frozen = structuredClone(wiring.plan);
    frozen.status = "frozen";
    expect(() => validateCollectionPlan(frozen)).toThrow(/preregistered six-case contract/);
  });

  it("returns only structural evidence and pins the existing evaluator report version", async () => {
    const wiring = await buildWiringSmoke(ROOT);
    const summary = await validateWiringSmoke(ROOT, wiring, {
      parseSuite: parseEvaluationSuiteV2,
      evaluatorReportVersion: EVALUATION_REPORT_VERSION_V2,
    });
    expect(summary).toEqual({
      schema_version: "starlette-wiring-smoke-report/v1",
      status: "wiring_compatible",
      collection_status: "planned_not_frozen",
      evaluator_input_version: 2,
      evaluator_report_version: 2,
      registered_case_count: 6,
      smoke_case_count: 3,
      evaluator_case_count: 31,
      projected_history_turn_count: 226,
      model_call_count: 0,
      evaluation_run_count: 0,
      effect_metrics_generated: false,
    });
    expect(summary).not.toHaveProperty("passed");
    expect(summary).not.toHaveProperty("aggregate");
    expect(summary).not.toHaveProperty("threshold_failures");
  });
});
