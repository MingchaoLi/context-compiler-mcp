import { isDeepStrictEqual } from "node:util";
import {
  EVALUATION_REPORT_VERSION_V2,
  parseEvaluationSuiteV2,
} from "../../src/evaluation.js";
// The pure fixture builder intentionally remains outside the publishable src/ package.
// @ts-expect-error JavaScript fixture utility has no declaration file.
import { buildWiringSmoke, WiringSmokeError } from "./wiring-smoke.mjs";

const SMOKE_REPORT_VERSION = "starlette-wiring-smoke-report/v1";

function fail(message: string): never {
  throw new WiringSmokeError(message);
}

/**
 * Verify the deterministic fixture mapping with the repository's real v2
 * parser. No parser or report-version dependency is injectable by callers.
 */
export async function validateWiringSmoke(
  root: string,
  value: any,
  ...unexpectedArguments: unknown[]
): Promise<Record<string, string | number | boolean>> {
  if (unexpectedArguments.length > 0) fail("parser injection is not supported");
  if (EVALUATION_REPORT_VERSION_V2 !== 2) fail("evaluator v2 report contract changed");

  const expected = await buildWiringSmoke(root);
  if (!isDeepStrictEqual(value?.plan, expected.plan)) fail("collection plan mapping changed");
  if (!isDeepStrictEqual(value?.suite, expected.suite)) fail("slice-to-evaluator mapping changed");

  const parsed = parseEvaluationSuiteV2(value.suite);
  if (!isDeepStrictEqual(parsed, value.suite)) fail("evaluator v2 parser changed the input");

  const projectedHistoryTurnCount = value.suite.cases.reduce(
    (sum: number, entry: any) => sum + entry.raw_events.length,
    0
  );
  return {
    schema_version: SMOKE_REPORT_VERSION,
    status: "wiring_compatible",
    collection_status: value.plan.status,
    evaluator_input_version: value.suite.version,
    evaluator_report_version: EVALUATION_REPORT_VERSION_V2,
    registered_case_count: value.plan.registered_cases.length,
    smoke_case_count: value.plan.smoke_case_ids.length,
    evaluator_case_count: value.suite.cases.length,
    projected_history_turn_count: projectedHistoryTurnCount,
    model_call_count: 0,
    evaluation_run_count: 0,
    effect_metrics_generated: false,
  };
}
