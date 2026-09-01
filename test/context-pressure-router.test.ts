import { describe, expect, it } from "vitest";

import {
  CONTEXT_PRESSURE_POLICY_VERSION,
  routeContextPressure,
  type ContextPressureLongGates,
  type ContextPressureRouterInput,
  type ContextPressureSessionState,
} from "../src/index.js";

const trusted = (identity: string) => ({ identity, version: "v1", trusted: true as const });
const verifiedGates = (): ContextPressureLongGates => ({
  session_binding: "VERIFIED",
  prefix_receipt: "VERIFIED",
  coverage: "VERIFIED",
  frontier: "VERIFIED",
  semantic_spine: "VERIFIED",
  current_causal_trace: "VERIFIED",
  critical_information: "VERIFIED",
  budget: "VERIFIED",
});

function fixture(overrides: Partial<ContextPressureRouterInput> = {}): ContextPressureRouterInput {
  return {
    scope: {
      host_instance_id: "host-1",
      session_id: "session-1",
      working_store_generation: 1,
      lineage_id: "lineage-1",
    },
    mode: "ON",
    policy: {
      policy_version: CONTEXT_PRESSURE_POLICY_VERSION,
      absolute_long_threshold_tokens: null,
    },
    capacity: {
      current_full_request_tokens: 600,
      current_token_source: trusted("provider-tokenizer"),
      model_context_window_tokens: 1_200,
      model_window_source: trusted("provider-model-window"),
      reserved_output_tokens: 100,
      safety_margin_tokens: 100,
      reserve_safety_source: trusted("provider-reserve"),
    },
    native_comparison_id: "request-1",
    short: { status: "VERIFIED", full_request_tokens: 400, comparison_id: "request-1" },
    promotion_status: "NOT_STARTED",
    long_candidate: { status: "NOT_READY", reason: "receipt pending" },
    ...overrides,
  };
}

function readyLong(overrides: Record<string, unknown> = {}) {
  return {
    status: "READY" as const,
    shadow_kind: "REAL" as const,
    full_request_tokens: 320,
    comparison_id: "request-1",
    total_user_visible_interactions: 40,
    preserved_user_visible_interactions: 30,
    gates: verifiedGates(),
    ...overrides,
  };
}

describe("provider-neutral Context Pressure Router", () => {
  it("implements OFF, low SHADOW, and low ON dispatch without side effects", () => {
    expect(routeContextPressure(fixture({ mode: "OFF" }))).toMatchObject({
      state: "FALLBACK", dispatch: "NATIVE", reason_code: "MODE_OFF", session_state: null,
    });
    expect(routeContextPressure(fixture({
      mode: "SHADOW",
      capacity: { ...fixture().capacity, current_full_request_tokens: 499 },
    }))).toMatchObject({ state: "SHORT_ACTIVE", dispatch: "SHADOW_ONLY", promotion_action: "NONE" });
    expect(routeContextPressure(fixture({
      capacity: { ...fixture().capacity, current_full_request_tokens: 499 },
    }))).toMatchObject({ state: "SHORT_ACTIVE", dispatch: "SHORT_REPLACE" });
  });

  it("uses exact 50% and 80% boundaries and never lets high pressure bypass safety", () => {
    const gradual = routeContextPressure(fixture({
      capacity: { ...fixture().capacity, current_full_request_tokens: 500 },
    }));
    expect(gradual).toMatchObject({
      state: "PROMOTING", dispatch: "SHORT_REPLACE", promotion_action: "START",
      evidence: { context_pressure_bps: 5_000, pressure_band: "GRADUAL" },
    });
    const high = routeContextPressure(fixture({
      capacity: { ...fixture().capacity, current_full_request_tokens: 800 },
      promotion_status: "RECEIPT_COMPLETE",
      long_candidate: { status: "NOT_READY", reason: "coverage pending" },
    }));
    expect(high).toMatchObject({ state: "PROMOTING", dispatch: "SHORT_REPLACE" });
    expect(high.reason_codes).toContain("HIGH_PRESSURE_SAFE_FALLBACK");
  });

  it("allows an explicit absolute threshold to enter PROMOTING below 50%", () => {
    const result = routeContextPressure(fixture({
      policy: { policy_version: CONTEXT_PRESSURE_POLICY_VERSION, absolute_long_threshold_tokens: 300 },
      capacity: { ...fixture().capacity, current_full_request_tokens: 400 },
    }));
    expect(result).toMatchObject({ state: "PROMOTING", promotion_action: "START" });
    expect(result.evidence.context_pressure_bps).toBe(4_000);
  });

  it("uses a trusted versioned conservative reserve/safety baseline", () => {
    const result = routeContextPressure(fixture({
      capacity: {
        ...fixture().capacity,
        reserved_output_tokens: null,
        safety_margin_tokens: null,
        reserve_safety_source: null,
        conservative_reserve_safety_baseline: {
          version: "baseline-v2",
          source: trusted("deployment-safety"),
          reserved_output_tokens: 100,
          safety_margin_tokens: 100,
        },
      },
    }));
    expect(result.reason_codes).toContain("RESERVE_SAFETY_BASELINE_USED");
    expect(result.evidence.capacity_sources.reserve_safety).toBe("deployment-safety@v1:baseline-v2");
  });

  it("requires credible current tokens, model window, and reserve boundaries", () => {
    for (const capacity of [
      { ...fixture().capacity, current_token_source: null },
      { ...fixture().capacity, model_context_window_tokens: null },
      { ...fixture().capacity, reserve_safety_source: null },
    ]) {
      const result = routeContextPressure(fixture({ capacity }));
      expect(result).toMatchObject({ state: "FALLBACK", dispatch: "NATIVE", reason_code: "CAPACITY_BOUNDARY_UNKNOWN" });
      expect(result.history_eviction_permitted).toBe(false);
    }
  });

  it("does not wait for promotion and preserves the safe C SHORT baseline", () => {
    expect(routeContextPressure(fixture({ promotion_status: "IN_PROGRESS" }))).toMatchObject({
      state: "PROMOTING", dispatch: "SHORT_REPLACE", promotion_action: "NONE",
    });
    expect(routeContextPressure(fixture({
      promotion_status: "TIMEOUT",
      short: { status: "UNAVAILABLE", reason: "C timeout" },
    }))).toMatchObject({ state: "FALLBACK", dispatch: "NATIVE", promotion_action: "RETRY" });
  });

  it("permits LONG only for a real same-request candidate with every gate VERIFIED and exactly 20% savings", () => {
    const result = routeContextPressure(fixture({
      promotion_status: "RECEIPT_COMPLETE",
      long_candidate: readyLong(),
    }));
    expect(result).toMatchObject({
      state: "LONG_ACTIVE",
      dispatch: "LONG_REPLACE",
      history_eviction_permitted: true,
      reason_code: "LONG_VERIFIED",
      evidence: { baseline_full_request_tokens: 400, candidate_full_request_tokens: 320, candidate_savings_bps: 2_000 },
    });
  });

  it("rejects less than 20% benefit, mismatched comparisons, simulated shadow, and any unverified gate", () => {
    const cases = [
      readyLong({ full_request_tokens: 321 }),
      readyLong({ comparison_id: "other-request" }),
      readyLong({ shadow_kind: "SIMULATED" }),
      readyLong({ gates: { ...verifiedGates(), coverage: "MISSING" } }),
    ];
    for (const long_candidate of cases) {
      const result = routeContextPressure(fixture({ promotion_status: "RECEIPT_COMPLETE", long_candidate }));
      expect(result.dispatch).toBe("SHORT_REPLACE");
      expect(result.history_eviction_permitted).toBe(false);
      expect(result.state).not.toBe("LONG_ACTIVE");
    }
  });

  it("keeps SHADOW observational after a fully verified real candidate", () => {
    const result = routeContextPressure(fixture({
      mode: "SHADOW",
      promotion_status: "RECEIPT_COMPLETE",
      long_candidate: readyLong({ full_request_tokens: 400 }),
    }));
    expect(result).toMatchObject({
      state: "PROMOTING", dispatch: "SHADOW_ONLY", history_eviction_permitted: false,
      reason_code: "LONG_OBSERVE_ONLY",
    });
  });

  it("enforces 30 user-visible interactions but permits an explicit hard-limit override", () => {
    const unsafe = routeContextPressure(fixture({
      promotion_status: "RECEIPT_COMPLETE",
      long_candidate: readyLong({ preserved_user_visible_interactions: 29 }),
    }));
    expect(unsafe).toMatchObject({ dispatch: "SHORT_REPLACE", reason_code: "MIN_SPINE_NOT_PRESERVED" });

    const hard = routeContextPressure(fixture({
      capacity: { ...fixture().capacity, current_full_request_tokens: 1_000 },
      promotion_status: "RECEIPT_COMPLETE",
      long_candidate: readyLong({ preserved_user_visible_interactions: 29 }),
    }));
    expect(hard).toMatchObject({ state: "LONG_ACTIVE", dispatch: "LONG_REPLACE" });
    expect(hard.reason_codes).toContain("MIN_SPINE_OVERRIDDEN_BY_HARD_LIMIT");
  });

  it("keeps session transitions one-way across token drops", () => {
    const promoting = routeContextPressure(fixture({ promotion_status: "IN_PROGRESS" })).session_state!;
    const stillPromoting = routeContextPressure(fixture({
      capacity: { ...fixture().capacity, current_full_request_tokens: 100 },
      previous_state: promoting,
      promotion_status: "IN_PROGRESS",
    }));
    expect(stillPromoting.session_state?.phase).toBe("PROMOTING");

    const long = routeContextPressure(fixture({
      promotion_status: "RECEIPT_COMPLETE", long_candidate: readyLong(),
    })).session_state!;
    const stillLong = routeContextPressure(fixture({
      capacity: { ...fixture().capacity, current_full_request_tokens: 100 },
      previous_state: long,
      promotion_status: "RECEIPT_COMPLETE",
      long_candidate: readyLong(),
    }));
    expect(stillLong).toMatchObject({ state: "LONG_ACTIVE", session_state: { phase: "LONG_ACTIVE" } });

    const requestLocalFallback = routeContextPressure(fixture({
      capacity: { ...fixture().capacity, current_full_request_tokens: 100 },
      previous_state: long,
      promotion_status: "TIMEOUT",
    }));
    expect(requestLocalFallback).toMatchObject({
      state: "FALLBACK",
      dispatch: "SHORT_REPLACE",
      session_state: { phase: "LONG_ACTIVE", rebuild_required: false },
    });
  });

  it("makes retryable failures request-local and conflicts sticky until explicit reset", () => {
    const retry = routeContextPressure(fixture({ promotion_status: "UNAVAILABLE" }));
    expect(retry).toMatchObject({ state: "FALLBACK", promotion_action: "RETRY", session_state: { rebuild_required: false } });
    expect(routeContextPressure(fixture({ previous_state: retry.session_state, promotion_status: "IN_PROGRESS" }))).toMatchObject({
      state: "PROMOTING",
    });

    const conflict = routeContextPressure(fixture({ promotion_status: "CONFLICT" }));
    expect(conflict).toMatchObject({ state: "FALLBACK", session_state: { rebuild_required: true } });
    const blocked = routeContextPressure(fixture({
      previous_state: conflict.session_state,
      promotion_status: "RECEIPT_COMPLETE",
      long_candidate: readyLong(),
    }));
    expect(blocked).toMatchObject({ state: "FALLBACK", history_eviction_permitted: false });
    const rebuilt = routeContextPressure(fixture({
      previous_state: conflict.session_state,
      reset_reason: "GENERATION_RESET",
      promotion_status: "NOT_STARTED",
    }));
    expect(rebuilt).toMatchObject({ state: "PROMOTING", session_state: { rebuild_required: false } });
  });

  it("fails closed on exact scope drift unless reset is explicit", () => {
    const previous: ContextPressureSessionState = {
      scope: { ...fixture().scope, lineage_id: "old-lineage" },
      policy_version: CONTEXT_PRESSURE_POLICY_VERSION,
      phase: "PROMOTING",
      rebuild_required: false,
      blocking_reason: null,
    };
    expect(routeContextPressure(fixture({ previous_state: previous }))).toMatchObject({
      state: "FALLBACK", reason_code: "SCOPE_CONFLICT", session_state: { rebuild_required: true },
    });
  });

  it("fails closed on malformed runtime values and makes C generation/coverage conflict rebuild-required", () => {
    expect(routeContextPressure(null as unknown as ContextPressureRouterInput)).toMatchObject({
      state: "FALLBACK", dispatch: "NATIVE", reason_code: "POLICY_CONFLICT",
    });
    expect(routeContextPressure(fixture({
      promotion_status: "INVALID" as never,
      long_candidate: readyLong(),
    }))).toMatchObject({ state: "FALLBACK", dispatch: "NATIVE", reason_code: "POLICY_CONFLICT" });
    expect(() => routeContextPressure(fixture({
      capacity: {} as never,
    }))).not.toThrow();
    expect(routeContextPressure(fixture({
      mode: "OFF",
      promotion_status: "INVALID" as never,
      long_candidate: null as never,
    }))).toMatchObject({ dispatch: "NATIVE", reason_code: "MODE_OFF", session_state: null });
    expect(routeContextPressure(fixture({
      previous_state: {
        scope: fixture().scope,
        policy_version: CONTEXT_PRESSURE_POLICY_VERSION,
        phase: "PROMOTING",
        rebuild_required: true,
        blocking_reason: "INJECTED_REASON" as never,
      },
    }))).toMatchObject({ state: "FALLBACK", dispatch: "NATIVE", reason_code: "POLICY_CONFLICT" });
    const conflict = routeContextPressure(fixture({
      short: { status: "CONFLICT", reason: "working generation mismatch" },
    }));
    expect(conflict).toMatchObject({
      state: "FALLBACK", dispatch: "NATIVE", reason_code: "COVERAGE_CONFLICT",
      session_state: { rebuild_required: true },
    });
  });

  it("is deterministic, immutable, and preserves the LONG safety invariant over a property matrix", () => {
    for (const mode of ["OFF", "SHADOW", "ON"] as const) {
      for (const tokens of [0, 499, 500, 799, 800, 1_000]) {
        for (const benefit of [0, 1_999, 2_000, 5_000]) {
          for (const coverage of ["VERIFIED", "MISSING", "CONFLICT"] as const) {
            const baseline = 400;
            const candidateTokens = Math.max(0, baseline - Math.floor((baseline * benefit) / 10_000));
            const value = fixture({
              mode,
              capacity: { ...fixture().capacity, current_full_request_tokens: tokens },
              promotion_status: "RECEIPT_COMPLETE",
              long_candidate: readyLong({
                full_request_tokens: candidateTokens,
                gates: { ...verifiedGates(), coverage },
              }),
            });
            const first = routeContextPressure(value);
            const second = routeContextPressure(value);
            expect(second).toEqual(first);
            expect(Object.isFrozen(first)).toBe(true);
            if (first.dispatch === "LONG_REPLACE") {
              expect(mode).toBe("ON");
              expect(coverage).toBe("VERIFIED");
              expect(benefit).toBeGreaterThanOrEqual(2_000);
              expect(first.history_eviction_permitted).toBe(true);
            } else {
              expect(first.history_eviction_permitted).toBe(false);
            }
          }
        }
      }
    }
  });
});
