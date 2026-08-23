// @vitest-environment node

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { validateSixCasePreflight } from "../evaluation/starlette-v1/six-case-preflight.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "evaluation", "starlette-v1");

describe("Starlette six-case no-write preflight", () => {
  it("parses all accepted mixed-layout inputs without running evaluation or a model", async () => {
    await expect(validateSixCasePreflight(ROOT)).resolves.toEqual({
      schema_version: "starlette-six-case-preflight/v1",
      status: "mixed_verified_inputs_compatible",
      canonical_case_count: 6,
      evaluator_case_count: 75,
      projected_history_turn_count: 588,
      evaluation_run_count: 0,
      model_call_count: 0,
      effect_metrics_generated: false,
    });
  });
});
