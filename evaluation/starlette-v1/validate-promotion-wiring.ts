import { isDeepStrictEqual } from "node:util";
import { parseEvaluationSuiteV2 } from "../../src/evaluation.js";
// These fixture utilities intentionally remain outside the publishable src/ package.
// @ts-expect-error JavaScript fixture utilities have no declaration files.
import { loadPromotionBundles, validatePromotion } from "./validate-promotion.mjs";
// @ts-expect-error JavaScript fixture utilities have no declaration files.
import {
  buildWiringSmoke,
  buildWiringSmokeFromVerifiedBundles,
  WiringSmokeError,
} from "./wiring-smoke.mjs";

function fail(message: string): never {
  throw new WiringSmokeError(message);
}

export async function validatePromotionWiring(
  root: string,
  ...unexpectedArguments: unknown[]
): Promise<Record<string, string | number | boolean>> {
  if (unexpectedArguments.length > 0) fail("promotion wiring injection is not supported");

  const promotion = await validatePromotion(root);
  const promotionBundles = await loadPromotionBundles(root);
  const [acceptedWiring, promotionWiring] = await Promise.all([
    buildWiringSmoke(root),
    buildWiringSmokeFromVerifiedBundles(root, promotionBundles),
  ]);
  if (!isDeepStrictEqual(promotionWiring, acceptedWiring)) {
    fail("promotion wiring differs from accepted fixture wiring");
  }
  const parsed = parseEvaluationSuiteV2(promotionWiring.suite);
  if (!isDeepStrictEqual(parsed, promotionWiring.suite)) {
    fail("evaluator v2 parser changed promotion wiring input");
  }
  const projectedHistoryTurnCount = promotionWiring.suite.cases.reduce(
    (sum: number, entry: any) => sum + entry.raw_events.length,
    0
  );
  return {
    schema_version: "starlette-promotion-wiring/v1",
    status: "promotion_wiring_compatible",
    promotion_status: promotion.status,
    evaluator_case_count: promotionWiring.suite.cases.length,
    projected_history_turn_count: projectedHistoryTurnCount,
    evaluation_run_count: 0,
    model_call_count: 0,
    effect_metrics_generated: false,
  };
}
