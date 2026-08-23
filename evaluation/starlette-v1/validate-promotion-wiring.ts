import { isDeepStrictEqual } from "node:util";
// These fixture utilities intentionally remain outside the publishable src/ package.
// @ts-expect-error JavaScript fixture utilities have no declaration files.
import { validatePromotion } from "./validate-promotion.mjs";
import { buildSixCasePreflight, buildSixCasePromotionSuite, SixCasePreflightError } from "./six-case-preflight.js";

function fail(message: string): never {
  throw new SixCasePreflightError(message);
}

export async function validatePromotionWiring(
  root: string,
  ...unexpectedArguments: unknown[]
): Promise<Record<string, string | number | boolean>> {
  if (unexpectedArguments.length > 0) fail("promotion wiring injection is not supported");

  const promotion = await validatePromotion(root);
  const [acceptedWiring, promotionWiring] = await Promise.all([
    buildSixCasePreflight(root),
    buildSixCasePromotionSuite(root),
  ]);
  if (!isDeepStrictEqual(promotionWiring.suite, acceptedWiring.suite)) {
    fail("promotion wiring differs from accepted fixture wiring");
  }
  return {
    schema_version: "starlette-promotion-wiring/v1",
    status: "promotion_wiring_compatible",
    promotion_status: promotion.status,
    evaluator_case_count: promotionWiring.suite.cases.length,
    projected_history_turn_count: promotionWiring.projected_history_turn_count,
    evaluation_run_count: 0,
    model_call_count: 0,
    effect_metrics_generated: false,
  };
}
