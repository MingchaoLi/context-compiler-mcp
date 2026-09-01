export const CONTEXT_PRESSURE_POLICY_VERSION = "rc-context-pressure-policy-v1" as const;
export const CONTEXT_PRESSURE_SHADOW_START_BPS = 5_000;
export const CONTEXT_PRESSURE_HIGH_BPS = 8_000;
export const CONTEXT_PRESSURE_MIN_LONG_SAVINGS_BPS = 2_000;
export const CONTEXT_PRESSURE_MIN_VISIBLE_INTERACTIONS = 30;

const BPS = 10_000;
const IDENTITY = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/u;

export type ContextPressureMode = "OFF" | "SHADOW" | "ON";
export type ContextPressureState = "SHORT_ACTIVE" | "PROMOTING" | "LONG_ACTIVE" | "FALLBACK";
export type ContextPressureSessionPhase = Exclude<ContextPressureState, "FALLBACK">;
export type ContextPressureDispatch = "NATIVE" | "SHORT_REPLACE" | "LONG_REPLACE" | "SHADOW_ONLY";
export type ContextPressurePromotionAction = "NONE" | "START" | "RETRY";
export type ContextPressureBand = "LOW" | "GRADUAL" | "HIGH" | "HARD_LIMIT";
export type ContextPressureResetReason = "NEW_SESSION" | "GENERATION_RESET" | "LINEAGE_RESET" | "MANUAL_OFF";
export type ContextPressureVerification =
  | "VERIFIED"
  | "MISSING"
  | "UNKNOWN"
  | "UNAVAILABLE"
  | "TIMEOUT"
  | "CONFLICT";

export type ContextPressureReasonCode =
  | "MODE_OFF"
  | "SHORT_BELOW_PRESSURE"
  | "SHORT_UNAVAILABLE"
  | "SHADOW_OBSERVATION"
  | "PROMOTION_START_REQUIRED"
  | "PROMOTION_IN_PROGRESS"
  | "PROMOTION_RETRYABLE_FAILURE"
  | "LONG_VERIFIED"
  | "LONG_OBSERVE_ONLY"
  | "LONG_CANDIDATE_NOT_READY"
  | "LONG_CANDIDATE_UNAVAILABLE"
  | "LONG_BENEFIT_INSUFFICIENT"
  | "LONG_COMPARISON_MISMATCH"
  | "CAPACITY_BOUNDARY_UNKNOWN"
  | "RESERVE_SAFETY_BASELINE_USED"
  | "SCOPE_CONFLICT"
  | "POLICY_CONFLICT"
  | "PROMOTION_CONFLICT"
  | "BINDING_CONFLICT"
  | "RECEIPT_CONFLICT"
  | "COVERAGE_CONFLICT"
  | "FRONTIER_CONFLICT"
  | "LONG_GATE_CONFLICT"
  | "REBUILD_REQUIRED"
  | "MIN_SPINE_NOT_PRESERVED"
  | "MIN_SPINE_OVERRIDDEN_BY_HARD_LIMIT"
  | "HIGH_PRESSURE_SAFE_FALLBACK";

const CONTEXT_PRESSURE_REASON_CODES: ReadonlySet<ContextPressureReasonCode> = new Set([
  "MODE_OFF",
  "SHORT_BELOW_PRESSURE",
  "SHORT_UNAVAILABLE",
  "SHADOW_OBSERVATION",
  "PROMOTION_START_REQUIRED",
  "PROMOTION_IN_PROGRESS",
  "PROMOTION_RETRYABLE_FAILURE",
  "LONG_VERIFIED",
  "LONG_OBSERVE_ONLY",
  "LONG_CANDIDATE_NOT_READY",
  "LONG_CANDIDATE_UNAVAILABLE",
  "LONG_BENEFIT_INSUFFICIENT",
  "LONG_COMPARISON_MISMATCH",
  "CAPACITY_BOUNDARY_UNKNOWN",
  "RESERVE_SAFETY_BASELINE_USED",
  "SCOPE_CONFLICT",
  "POLICY_CONFLICT",
  "PROMOTION_CONFLICT",
  "BINDING_CONFLICT",
  "RECEIPT_CONFLICT",
  "COVERAGE_CONFLICT",
  "FRONTIER_CONFLICT",
  "LONG_GATE_CONFLICT",
  "REBUILD_REQUIRED",
  "MIN_SPINE_NOT_PRESERVED",
  "MIN_SPINE_OVERRIDDEN_BY_HARD_LIMIT",
  "HIGH_PRESSURE_SAFE_FALLBACK",
]);

export interface ContextPressureScope {
  readonly host_instance_id: string;
  readonly session_id: string;
  readonly working_store_generation: number;
  readonly lineage_id: string;
}

export interface ContextPressureSource {
  readonly identity: string;
  readonly version: string;
  readonly trusted: true;
}

export interface ContextPressureCapacityInput {
  readonly current_full_request_tokens: number | null;
  readonly current_token_source: ContextPressureSource | null;
  readonly model_context_window_tokens: number | null;
  readonly model_window_source: ContextPressureSource | null;
  readonly reserved_output_tokens: number | null;
  readonly safety_margin_tokens: number | null;
  readonly reserve_safety_source: ContextPressureSource | null;
  readonly conservative_reserve_safety_baseline?: Readonly<{
    readonly version: string;
    readonly source: ContextPressureSource;
    readonly reserved_output_tokens: number;
    readonly safety_margin_tokens: number;
  }> | null;
}

export interface ContextPressurePolicy {
  readonly policy_version: typeof CONTEXT_PRESSURE_POLICY_VERSION;
  readonly absolute_long_threshold_tokens?: number | null;
}

export type ContextPressureShortInput =
  | Readonly<{
    readonly status: "VERIFIED";
    readonly full_request_tokens: number;
    readonly comparison_id: string;
  }>
  | Readonly<{
    readonly status: Exclude<ContextPressureVerification, "VERIFIED">;
    readonly reason: string;
  }>;

export type ContextPressurePromotionStatus =
  | "NOT_STARTED"
  | "IN_PROGRESS"
  | "RECEIPT_COMPLETE"
  | "UNAVAILABLE"
  | "TIMEOUT"
  | "CONFLICT";

export interface ContextPressureLongGates {
  readonly session_binding: ContextPressureVerification;
  readonly prefix_receipt: ContextPressureVerification;
  readonly coverage: ContextPressureVerification;
  readonly frontier: ContextPressureVerification;
  readonly semantic_spine: ContextPressureVerification;
  readonly current_causal_trace: ContextPressureVerification;
  readonly critical_information: ContextPressureVerification;
  readonly budget: ContextPressureVerification;
}

export type ContextPressureLongCandidate =
  | Readonly<{
    readonly status: "READY";
    readonly shadow_kind: "REAL" | "SIMULATED";
    readonly full_request_tokens: number;
    readonly comparison_id: string;
    readonly total_user_visible_interactions: number;
    readonly preserved_user_visible_interactions: number;
    readonly gates: ContextPressureLongGates;
  }>
  | Readonly<{
    readonly status: "NOT_READY" | "UNAVAILABLE" | "TIMEOUT" | "CONFLICT";
    readonly reason: string;
  }>;

export interface ContextPressureSessionState {
  readonly scope: ContextPressureScope;
  readonly policy_version: typeof CONTEXT_PRESSURE_POLICY_VERSION;
  readonly phase: ContextPressureSessionPhase;
  readonly rebuild_required: boolean;
  readonly blocking_reason: ContextPressureReasonCode | null;
}

export interface ContextPressureRouterInput {
  readonly scope: ContextPressureScope;
  readonly mode: ContextPressureMode;
  readonly policy: ContextPressurePolicy;
  readonly capacity: ContextPressureCapacityInput;
  readonly native_comparison_id: string;
  readonly short: ContextPressureShortInput;
  readonly promotion_status: ContextPressurePromotionStatus;
  readonly long_candidate: ContextPressureLongCandidate;
  readonly previous_state?: ContextPressureSessionState | null;
  readonly reset_reason?: ContextPressureResetReason | null;
}

export interface ContextPressureEvidence {
  readonly usable_input_window_tokens: number | null;
  readonly context_pressure_bps: number | null;
  readonly pressure_band: ContextPressureBand | null;
  readonly absolute_long_threshold_tokens: number | null;
  readonly baseline_full_request_tokens: number | null;
  readonly candidate_full_request_tokens: number | null;
  readonly candidate_savings_bps: number | null;
  readonly min_user_visible_interactions: typeof CONTEXT_PRESSURE_MIN_VISIBLE_INTERACTIONS;
  readonly shadow_start_bps: typeof CONTEXT_PRESSURE_SHADOW_START_BPS;
  readonly high_pressure_bps: typeof CONTEXT_PRESSURE_HIGH_BPS;
  readonly min_long_savings_bps: typeof CONTEXT_PRESSURE_MIN_LONG_SAVINGS_BPS;
  readonly capacity_sources: Readonly<{
    readonly current_tokens: string | null;
    readonly model_window: string | null;
    readonly reserve_safety: string | null;
  }>;
  readonly missing_inputs: readonly string[];
  readonly conflicts: readonly string[];
}

export interface ContextPressureDecision {
  readonly state: ContextPressureState;
  readonly dispatch: ContextPressureDispatch;
  readonly promotion_action: ContextPressurePromotionAction;
  readonly run_long_shadow: boolean;
  readonly history_eviction_permitted: boolean;
  readonly reason_code: ContextPressureReasonCode;
  readonly reason_codes: readonly ContextPressureReasonCode[];
  readonly previous_phase: ContextPressureSessionPhase | null;
  readonly session_state: ContextPressureSessionState | null;
  readonly policy_version: typeof CONTEXT_PRESSURE_POLICY_VERSION;
  readonly evidence: ContextPressureEvidence;
}

interface CapacityEvaluation {
  readonly valid: boolean;
  readonly currentTokens: number | null;
  readonly usableWindow: number | null;
  readonly pressureBps: number | null;
  readonly band: ContextPressureBand | null;
  readonly reserveSource: string | null;
  readonly usedBaseline: boolean;
  readonly missing: readonly string[];
}

/**
 * Pure, provider-neutral PI-001-D router. It never calls a model, storage,
 * compile, ingest, provider, or deletion API.
 */
export function routeContextPressure(input: ContextPressureRouterInput): ContextPressureDecision {
  if (!isRecord(input) || !isRecord(input.scope) || !isRecord(input.policy) || !isRecord(input.capacity)) {
    return untypedInvalidDecision();
  }
  if (!validScope(input.scope) || !validPolicy(input.policy) || !validMode(input.mode)) {
    return invalidDecision(input, "POLICY_CONFLICT", ["input"]);
  }
  if (input.mode === "OFF") {
    return decision(input, {
      state: "FALLBACK",
      dispatch: "NATIVE",
      promotionAction: "NONE",
      runLongShadow: false,
      historyEvictionPermitted: false,
      reasons: ["MODE_OFF"],
      sessionState: null,
      capacity: evaluateCapacity(input.capacity),
    });
  }
  if (!validReset(input.reset_reason) || !validPromotionStatus(input.promotion_status) ||
      !validShortInput(input.short) || !validLongCandidateShape(input.long_candidate) ||
      (input.previous_state != null && !validSessionState(input.previous_state))) {
    return invalidDecision(input, "POLICY_CONFLICT", ["input_shape"]);
  }

  const previous = input.previous_state ?? null;
  const reset = input.reset_reason ?? null;
  if (previous !== null && reset === null && !sameScope(previous.scope, input.scope)) {
    return conflictDecision(input, "SCOPE_CONFLICT", ["scope"]);
  }
  if (previous !== null && reset === null && previous.policy_version !== input.policy.policy_version) {
    return conflictDecision(input, "POLICY_CONFLICT", ["policy_version"]);
  }
  if (previous !== null && reset === null && previous.rebuild_required) {
    return conflictDecision(input, previous.blocking_reason ?? "REBUILD_REQUIRED", ["rebuild_required"]);
  }

  const previousPhase = reset === null ? previous?.phase ?? null : null;
  if (input.short.status === "CONFLICT") {
    return conflictDecision(input, "COVERAGE_CONFLICT", ["short_context"], evaluateCapacity(input.capacity),
      previousPhase ?? "SHORT_ACTIVE", "NATIVE");
  }
  const capacity = evaluateCapacity(input.capacity);
  if (!capacity.valid) {
    return decision(input, {
      state: "FALLBACK",
      dispatch: "NATIVE",
      promotionAction: "NONE",
      runLongShadow: false,
      historyEvictionPermitted: false,
      reasons: ["CAPACITY_BOUNDARY_UNKNOWN"],
      sessionState: previousPhase === null ? null : sessionState(input.scope, previousPhase, false, null),
      capacity,
    });
  }

  const thresholdReached = previousPhase === "PROMOTING" || previousPhase === "LONG_ACTIVE" ||
    capacity.pressureBps! >= CONTEXT_PRESSURE_SHADOW_START_BPS ||
    (input.policy.absolute_long_threshold_tokens != null &&
      capacity.currentTokens! >= input.policy.absolute_long_threshold_tokens);
  const extraCapacityReasons: ContextPressureReasonCode[] = capacity.usedBaseline
    ? ["RESERVE_SAFETY_BASELINE_USED"]
    : [];

  if (!thresholdReached) {
    const dispatch: ContextPressureDispatch = input.mode === "SHADOW"
      ? "SHADOW_ONLY"
      : safeBaseline(input);
    return decision(input, {
      state: "SHORT_ACTIVE",
      dispatch,
      promotionAction: "NONE",
      runLongShadow: false,
      historyEvictionPermitted: false,
      reasons: [
        input.mode === "SHADOW" ? "SHADOW_OBSERVATION" :
          dispatch === "SHORT_REPLACE" ? "SHORT_BELOW_PRESSURE" : "SHORT_UNAVAILABLE",
        ...extraCapacityReasons,
      ],
      sessionState: sessionState(input.scope, "SHORT_ACTIVE", false, null),
      capacity,
    });
  }

  const retainedPhase: ContextPressureSessionPhase = previousPhase === "LONG_ACTIVE"
    ? "LONG_ACTIVE"
    : "PROMOTING";
  const baseline = input.mode === "SHADOW" ? "SHADOW_ONLY" : safeBaseline(input);

  if (input.promotion_status === "CONFLICT") {
    return conflictDecision(input, "PROMOTION_CONFLICT", ["promotion_status"], capacity, retainedPhase, baseline);
  }
  if (input.promotion_status === "NOT_STARTED") {
    return decision(input, {
      state: retainedPhase === "LONG_ACTIVE" ? "FALLBACK" : "PROMOTING",
      dispatch: baseline,
      promotionAction: "START",
      runLongShadow: true,
      historyEvictionPermitted: false,
      reasons: ["PROMOTION_START_REQUIRED", ...highPressureReason(capacity), ...extraCapacityReasons],
      sessionState: sessionState(input.scope, retainedPhase, false, null),
      capacity,
    });
  }
  if (input.promotion_status === "IN_PROGRESS") {
    return decision(input, {
      state: retainedPhase === "LONG_ACTIVE" ? "FALLBACK" : "PROMOTING",
      dispatch: baseline,
      promotionAction: "NONE",
      runLongShadow: true,
      historyEvictionPermitted: false,
      reasons: ["PROMOTION_IN_PROGRESS", ...highPressureReason(capacity), ...extraCapacityReasons],
      sessionState: sessionState(input.scope, retainedPhase, false, null),
      capacity,
    });
  }
  if (input.promotion_status === "UNAVAILABLE" || input.promotion_status === "TIMEOUT") {
    return decision(input, {
      state: "FALLBACK",
      dispatch: baseline,
      promotionAction: "RETRY",
      runLongShadow: false,
      historyEvictionPermitted: false,
      reasons: ["PROMOTION_RETRYABLE_FAILURE", ...highPressureReason(capacity), ...extraCapacityReasons],
      sessionState: sessionState(input.scope, retainedPhase, false, null),
      capacity,
    });
  }

  const candidate = evaluateLongCandidate(input, capacity);
  if (candidate.conflicts.length > 0) {
    return conflictDecision(input, candidate.conflictReason, candidate.conflicts, capacity, retainedPhase, baseline);
  }
  if (!candidate.ready) {
    return decision(input, {
      state: candidate.retryable || retainedPhase === "LONG_ACTIVE" ? "FALLBACK" : "PROMOTING",
      dispatch: baseline,
      promotionAction: candidate.retryable ? "RETRY" : "NONE",
      runLongShadow: true,
      historyEvictionPermitted: false,
      reasons: [candidate.reason, ...highPressureReason(capacity), ...extraCapacityReasons],
      sessionState: sessionState(input.scope, retainedPhase, false, null),
      capacity,
      candidateTokens: candidate.candidateTokens,
      candidateSavingsBps: candidate.savingsBps,
      missing: candidate.missing,
    });
  }

  if (input.mode === "SHADOW") {
    return decision(input, {
      state: retainedPhase === "LONG_ACTIVE" ? "FALLBACK" : "PROMOTING",
      dispatch: "SHADOW_ONLY",
      promotionAction: "NONE",
      runLongShadow: true,
      historyEvictionPermitted: false,
      reasons: ["LONG_OBSERVE_ONLY", ...candidate.extraReasons, ...extraCapacityReasons],
      sessionState: sessionState(input.scope, retainedPhase, false, null),
      capacity,
      candidateTokens: candidate.candidateTokens,
      candidateSavingsBps: candidate.savingsBps,
    });
  }

  return decision(input, {
    state: "LONG_ACTIVE",
    dispatch: "LONG_REPLACE",
    promotionAction: "NONE",
    runLongShadow: false,
    historyEvictionPermitted: true,
    reasons: ["LONG_VERIFIED", ...candidate.extraReasons, ...extraCapacityReasons],
    sessionState: sessionState(input.scope, "LONG_ACTIVE", false, null),
    capacity,
    candidateTokens: candidate.candidateTokens,
    candidateSavingsBps: candidate.savingsBps,
  });
}

function evaluateCapacity(input: ContextPressureCapacityInput): CapacityEvaluation {
  const missing: string[] = [];
  if (!validNonNegative(input.current_full_request_tokens) || !validSource(input.current_token_source)) {
    missing.push("current_full_request_tokens");
  }
  if (!validPositive(input.model_context_window_tokens) || !validSource(input.model_window_source)) {
    missing.push("model_context_window_tokens");
  }
  let reserved = input.reserved_output_tokens;
  let safety = input.safety_margin_tokens;
  let reserveSource = validSource(input.reserve_safety_source)
    ? sourceLabel(input.reserve_safety_source)
    : null;
  let usedBaseline = false;
  if (!validNonNegative(reserved) || !validNonNegative(safety) || reserveSource === null) {
    const baseline = input.conservative_reserve_safety_baseline;
    if (isRecord(baseline) && IDENTITY.test(String(baseline.version)) &&
        validSource(baseline.source) && validNonNegative(baseline.reserved_output_tokens) &&
        validNonNegative(baseline.safety_margin_tokens)) {
      reserved = baseline.reserved_output_tokens;
      safety = baseline.safety_margin_tokens;
      reserveSource = `${sourceLabel(baseline.source)}:${baseline.version}`;
      usedBaseline = true;
    } else {
      missing.push("reserve_safety_boundary");
    }
  }
  if (missing.length > 0) {
    return { valid: false, currentTokens: null, usableWindow: null, pressureBps: null, band: null, reserveSource, usedBaseline, missing };
  }
  const current = input.current_full_request_tokens!;
  const usable = input.model_context_window_tokens! - reserved! - safety!;
  if (!Number.isSafeInteger(usable) || usable <= 0) {
    return { valid: false, currentTokens: current, usableWindow: null, pressureBps: null, band: null, reserveSource, usedBaseline, missing: ["usable_input_window"] };
  }
  const pressure = ratioBps(current, usable);
  const band: ContextPressureBand = current >= usable
    ? "HARD_LIMIT"
    : pressure >= CONTEXT_PRESSURE_HIGH_BPS ? "HIGH"
      : pressure >= CONTEXT_PRESSURE_SHADOW_START_BPS ? "GRADUAL" : "LOW";
  return { valid: true, currentTokens: current, usableWindow: usable, pressureBps: pressure, band, reserveSource, usedBaseline, missing: [] };
}

function evaluateLongCandidate(input: ContextPressureRouterInput, capacity: CapacityEvaluation): Readonly<{
  ready: boolean;
  retryable: boolean;
  reason: ContextPressureReasonCode;
  conflictReason: ContextPressureReasonCode;
  conflicts: readonly string[];
  missing: readonly string[];
  candidateTokens: number | null;
  savingsBps: number | null;
  extraReasons: readonly ContextPressureReasonCode[];
}> {
  const candidate = input.long_candidate;
  if (candidate.status === "CONFLICT") {
    return failedCandidate("LONG_GATE_CONFLICT", ["long_candidate"], false);
  }
  if (candidate.status === "UNAVAILABLE" || candidate.status === "TIMEOUT") {
    return { ...failedCandidate("LONG_CANDIDATE_UNAVAILABLE", [], true), missing: ["long_candidate"] };
  }
  if (candidate.status === "NOT_READY") {
    return { ...failedCandidate("LONG_CANDIDATE_NOT_READY", [], false), missing: ["long_candidate"] };
  }
  if (candidate.status !== "READY") {
    return { ...failedCandidate("LONG_CANDIDATE_NOT_READY", [], false), missing: ["long_candidate"] };
  }
  const conflictGates = gateEntries(candidate.gates).filter(([, value]) => value === "CONFLICT").map(([name]) => name);
  if (conflictGates.length > 0) {
    return failedCandidate(gateConflictReason(conflictGates), conflictGates, false);
  }
  const missing = gateEntries(candidate.gates).filter(([, value]) => value !== "VERIFIED").map(([name]) => name);
  if (missing.length > 0) {
    return { ...failedCandidate("LONG_CANDIDATE_NOT_READY", [], false), missing };
  }
  if (candidate.shadow_kind !== "REAL") {
    return { ...failedCandidate("LONG_CANDIDATE_NOT_READY", [], false), missing: ["real_shadow_candidate"] };
  }
  if (!validNonNegative(candidate.full_request_tokens) || !IDENTITY.test(candidate.comparison_id) ||
      !Number.isSafeInteger(candidate.total_user_visible_interactions) || candidate.total_user_visible_interactions < 0 ||
      !Number.isSafeInteger(candidate.preserved_user_visible_interactions) || candidate.preserved_user_visible_interactions < 0 ||
      candidate.preserved_user_visible_interactions > candidate.total_user_visible_interactions) {
    return { ...failedCandidate("LONG_CANDIDATE_NOT_READY", [], false), missing: ["candidate_measurement"] };
  }
  const baseline = baselineMeasurement(input);
  if (baseline === null || baseline.comparisonId !== candidate.comparison_id) {
    return {
      ...failedCandidate("LONG_COMPARISON_MISMATCH", [], false),
      missing: baseline === null ? ["baseline_measurement"] : ["comparison_id"],
      candidateTokens: candidate.full_request_tokens,
    };
  }
  const savingsBps = savingsRatioBps(baseline.tokens, candidate.full_request_tokens);
  if (savingsBps < CONTEXT_PRESSURE_MIN_LONG_SAVINGS_BPS) {
    return {
      ...failedCandidate("LONG_BENEFIT_INSUFFICIENT", [], false),
      candidateTokens: candidate.full_request_tokens,
      savingsBps,
    };
  }
  const requiredSpine = Math.min(CONTEXT_PRESSURE_MIN_VISIBLE_INTERACTIONS, candidate.total_user_visible_interactions);
  const hardLimit = capacity.band === "HARD_LIMIT";
  if (candidate.preserved_user_visible_interactions < requiredSpine && !hardLimit) {
    return {
      ...failedCandidate("MIN_SPINE_NOT_PRESERVED", [], false),
      missing: ["semantic_spine_minimum"],
      candidateTokens: candidate.full_request_tokens,
      savingsBps,
    };
  }
  return {
    ready: true,
    retryable: false,
    reason: "LONG_VERIFIED",
    conflictReason: "LONG_GATE_CONFLICT",
    conflicts: [],
    missing: [],
    candidateTokens: candidate.full_request_tokens,
    savingsBps,
    extraReasons: candidate.preserved_user_visible_interactions < requiredSpine
      ? ["MIN_SPINE_OVERRIDDEN_BY_HARD_LIMIT"]
      : [],
  };
}

function failedCandidate(
  reason: ContextPressureReasonCode,
  conflicts: readonly string[],
  retryable: boolean,
) {
  return {
    ready: false,
    retryable,
    reason,
    conflictReason: reason,
    conflicts,
    missing: [] as readonly string[],
    candidateTokens: null as number | null,
    savingsBps: null as number | null,
    extraReasons: [] as readonly ContextPressureReasonCode[],
  };
}

function gateEntries(gates: ContextPressureLongGates): readonly (readonly [string, ContextPressureVerification])[] {
  return [
    ["session_binding", gates.session_binding],
    ["prefix_receipt", gates.prefix_receipt],
    ["coverage", gates.coverage],
    ["frontier", gates.frontier],
    ["semantic_spine", gates.semantic_spine],
    ["current_causal_trace", gates.current_causal_trace],
    ["critical_information", gates.critical_information],
    ["budget", gates.budget],
  ];
}

function gateConflictReason(conflicts: readonly string[]): ContextPressureReasonCode {
  if (conflicts.includes("session_binding")) return "BINDING_CONFLICT";
  if (conflicts.includes("prefix_receipt")) return "RECEIPT_CONFLICT";
  if (conflicts.includes("coverage")) return "COVERAGE_CONFLICT";
  if (conflicts.includes("frontier")) return "FRONTIER_CONFLICT";
  return "LONG_GATE_CONFLICT";
}

function baselineMeasurement(input: ContextPressureRouterInput): Readonly<{ tokens: number; comparisonId: string }> | null {
  if (input.mode === "ON" && input.short.status === "VERIFIED") {
    return validNonNegative(input.short.full_request_tokens) && IDENTITY.test(input.short.comparison_id)
      ? { tokens: input.short.full_request_tokens, comparisonId: input.short.comparison_id }
      : null;
  }
  return validNonNegative(input.capacity.current_full_request_tokens) && IDENTITY.test(input.native_comparison_id)
    ? { tokens: input.capacity.current_full_request_tokens, comparisonId: input.native_comparison_id }
    : null;
}

function safeBaseline(input: ContextPressureRouterInput): ContextPressureDispatch {
  return input.short.status === "VERIFIED" ? "SHORT_REPLACE" : "NATIVE";
}

function highPressureReason(capacity: CapacityEvaluation): readonly ContextPressureReasonCode[] {
  return capacity.band === "HIGH" || capacity.band === "HARD_LIMIT"
    ? ["HIGH_PRESSURE_SAFE_FALLBACK"]
    : [];
}

function conflictDecision(
  input: ContextPressureRouterInput,
  reason: ContextPressureReasonCode,
  conflicts: readonly string[],
  capacity = evaluateCapacity(input.capacity),
  retainedPhase: ContextPressureSessionPhase = input.previous_state?.phase ?? "PROMOTING",
  dispatch: ContextPressureDispatch = safeBaseline(input),
): ContextPressureDecision {
  return decision(input, {
    state: "FALLBACK",
    dispatch,
    promotionAction: "NONE",
    runLongShadow: false,
    historyEvictionPermitted: false,
    reasons: [reason, "REBUILD_REQUIRED"],
    sessionState: sessionState(input.scope, retainedPhase, true, reason),
    capacity,
    conflicts,
  });
}

function invalidDecision(
  input: ContextPressureRouterInput,
  reason: ContextPressureReasonCode,
  conflicts: readonly string[],
): ContextPressureDecision {
  const scope = validScope(input.scope)
    ? input.scope
    : { host_instance_id: "invalid", session_id: "invalid", working_store_generation: 1, lineage_id: "invalid" };
  const sanitized = { ...input, scope };
  return decision(sanitized, {
    state: "FALLBACK",
    dispatch: "NATIVE",
    promotionAction: "NONE",
    runLongShadow: false,
    historyEvictionPermitted: false,
    reasons: [reason, "REBUILD_REQUIRED"],
    sessionState: sessionState(scope, "PROMOTING", true, reason),
    capacity: evaluateCapacity(input.capacity),
    conflicts,
  });
}

function untypedInvalidDecision(): ContextPressureDecision {
  return deepFreeze({
    state: "FALLBACK",
    dispatch: "NATIVE",
    promotion_action: "NONE",
    run_long_shadow: false,
    history_eviction_permitted: false,
    reason_code: "POLICY_CONFLICT",
    reason_codes: ["POLICY_CONFLICT", "REBUILD_REQUIRED"],
    previous_phase: null,
    session_state: null,
    policy_version: CONTEXT_PRESSURE_POLICY_VERSION,
    evidence: {
      usable_input_window_tokens: null,
      context_pressure_bps: null,
      pressure_band: null,
      absolute_long_threshold_tokens: null,
      baseline_full_request_tokens: null,
      candidate_full_request_tokens: null,
      candidate_savings_bps: null,
      min_user_visible_interactions: CONTEXT_PRESSURE_MIN_VISIBLE_INTERACTIONS,
      shadow_start_bps: CONTEXT_PRESSURE_SHADOW_START_BPS,
      high_pressure_bps: CONTEXT_PRESSURE_HIGH_BPS,
      min_long_savings_bps: CONTEXT_PRESSURE_MIN_LONG_SAVINGS_BPS,
      capacity_sources: { current_tokens: null, model_window: null, reserve_safety: null },
      missing_inputs: ["input"],
      conflicts: ["input_shape"],
    },
  });
}

function decision(
  input: ContextPressureRouterInput,
  value: Readonly<{
    state: ContextPressureState;
    dispatch: ContextPressureDispatch;
    promotionAction: ContextPressurePromotionAction;
    runLongShadow: boolean;
    historyEvictionPermitted: boolean;
    reasons: readonly ContextPressureReasonCode[];
    sessionState: ContextPressureSessionState | null;
    capacity: CapacityEvaluation;
    candidateTokens?: number | null;
    candidateSavingsBps?: number | null;
    missing?: readonly string[];
    conflicts?: readonly string[];
  }>,
): ContextPressureDecision {
  const baseline = baselineMeasurement(input);
  return deepFreeze({
    state: value.state,
    dispatch: value.dispatch,
    promotion_action: value.promotionAction,
    run_long_shadow: value.runLongShadow,
    history_eviction_permitted: value.historyEvictionPermitted,
    reason_code: value.reasons[0]!,
    reason_codes: [...new Set(value.reasons)],
    previous_phase: input.previous_state?.phase ?? null,
    session_state: value.sessionState,
    policy_version: CONTEXT_PRESSURE_POLICY_VERSION,
    evidence: {
      usable_input_window_tokens: value.capacity.usableWindow,
      context_pressure_bps: value.capacity.pressureBps,
      pressure_band: value.capacity.band,
      absolute_long_threshold_tokens: input.policy.absolute_long_threshold_tokens ?? null,
      baseline_full_request_tokens: baseline?.tokens ?? null,
      candidate_full_request_tokens: value.candidateTokens ?? null,
      candidate_savings_bps: value.candidateSavingsBps ?? null,
      min_user_visible_interactions: CONTEXT_PRESSURE_MIN_VISIBLE_INTERACTIONS,
      shadow_start_bps: CONTEXT_PRESSURE_SHADOW_START_BPS,
      high_pressure_bps: CONTEXT_PRESSURE_HIGH_BPS,
      min_long_savings_bps: CONTEXT_PRESSURE_MIN_LONG_SAVINGS_BPS,
      capacity_sources: {
        current_tokens: sourceLabel(input.capacity.current_token_source),
        model_window: sourceLabel(input.capacity.model_window_source),
        reserve_safety: value.capacity.reserveSource,
      },
      missing_inputs: [...new Set([...value.capacity.missing, ...(value.missing ?? [])])],
      conflicts: [...new Set(value.conflicts ?? [])],
    },
  });
}

function sessionState(
  scope: ContextPressureScope,
  phase: ContextPressureSessionPhase,
  rebuildRequired: boolean,
  blockingReason: ContextPressureReasonCode | null,
): ContextPressureSessionState {
  return {
    scope: { ...scope },
    policy_version: CONTEXT_PRESSURE_POLICY_VERSION,
    phase,
    rebuild_required: rebuildRequired,
    blocking_reason: blockingReason,
  };
}

function validPolicy(policy: ContextPressurePolicy): boolean {
  return policy?.policy_version === CONTEXT_PRESSURE_POLICY_VERSION &&
    (policy.absolute_long_threshold_tokens == null || validPositive(policy.absolute_long_threshold_tokens));
}

function validReset(value: ContextPressureResetReason | null | undefined): boolean {
  return value == null || value === "NEW_SESSION" || value === "GENERATION_RESET" ||
    value === "LINEAGE_RESET" || value === "MANUAL_OFF";
}

function validPromotionStatus(value: unknown): value is ContextPressurePromotionStatus {
  return value === "NOT_STARTED" || value === "IN_PROGRESS" || value === "RECEIPT_COMPLETE" ||
    value === "UNAVAILABLE" || value === "TIMEOUT" || value === "CONFLICT";
}

function validVerification(value: unknown): value is ContextPressureVerification {
  return value === "VERIFIED" || value === "MISSING" || value === "UNKNOWN" ||
    value === "UNAVAILABLE" || value === "TIMEOUT" || value === "CONFLICT";
}

function validShortInput(value: ContextPressureShortInput): boolean {
  if (!isRecord(value)) return false;
  if (value.status === "VERIFIED") {
    return validNonNegative(value.full_request_tokens) && IDENTITY.test(value.comparison_id);
  }
  return validVerification(value.status) && typeof value.reason === "string";
}

function validLongCandidateShape(value: ContextPressureLongCandidate): boolean {
  if (!isRecord(value)) return false;
  if (value.status !== "READY") {
    return (value.status === "NOT_READY" || value.status === "UNAVAILABLE" || value.status === "TIMEOUT" ||
      value.status === "CONFLICT") && typeof value.reason === "string";
  }
  return (value.shadow_kind === "REAL" || value.shadow_kind === "SIMULATED") &&
    isRecord(value.gates) && gateEntries(value.gates).every(([, status]) => validVerification(status));
}

function validSessionState(value: ContextPressureSessionState): boolean {
  return isRecord(value) && isRecord(value.scope) && validScope(value.scope) &&
    value.policy_version === CONTEXT_PRESSURE_POLICY_VERSION &&
    (value.phase === "SHORT_ACTIVE" || value.phase === "PROMOTING" || value.phase === "LONG_ACTIVE") &&
    typeof value.rebuild_required === "boolean" &&
    (value.blocking_reason === null || CONTEXT_PRESSURE_REASON_CODES.has(value.blocking_reason));
}

function validScope(scope: ContextPressureScope): boolean {
  return scope !== null && typeof scope === "object" && IDENTITY.test(scope.host_instance_id) &&
    IDENTITY.test(scope.session_id) && IDENTITY.test(scope.lineage_id) &&
    Number.isSafeInteger(scope.working_store_generation) && scope.working_store_generation > 0;
}

function validMode(mode: unknown): mode is ContextPressureMode {
  return mode === "OFF" || mode === "SHADOW" || mode === "ON";
}

function validSource(source: unknown): source is ContextPressureSource {
  return isRecord(source) && source.trusted === true && IDENTITY.test(String(source.identity)) &&
    IDENTITY.test(String(source.version));
}

function sourceLabel(source: unknown): string | null {
  return validSource(source) ? `${source.identity}@${source.version}` : null;
}

function validNonNegative(value: number | null): value is number {
  return value !== null && Number.isSafeInteger(value) && value >= 0;
}

function validPositive(value: number | null): value is number {
  return value !== null && Number.isSafeInteger(value) && value > 0;
}

function sameScope(left: ContextPressureScope, right: ContextPressureScope): boolean {
  return left.host_instance_id === right.host_instance_id && left.session_id === right.session_id &&
    left.working_store_generation === right.working_store_generation && left.lineage_id === right.lineage_id;
}

function ratioBps(numerator: number, denominator: number): number {
  const result = (BigInt(numerator) * BigInt(BPS)) / BigInt(denominator);
  return result > BigInt(Number.MAX_SAFE_INTEGER) ? Number.MAX_SAFE_INTEGER : Number(result);
}

function savingsRatioBps(baseline: number, candidate: number): number {
  if (baseline <= 0 || candidate >= baseline) return 0;
  return ratioBps(baseline - candidate, baseline);
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
