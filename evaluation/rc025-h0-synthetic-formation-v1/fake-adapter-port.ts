import type {
  AttemptReceipt,
  ExperienceAction,
  FactAction,
  FormationActionSet,
  SealedBatch,
  CandidateCard,
  LimitsProfile,
} from "./contract.js";
import { exactKeys } from "./identity.js";

export interface InterpreterRequest {
  sealed_batch: SealedBatch;
  attempt_receipt: AttemptReceipt;
  candidate_cards: CandidateCard[];
  limits_profile: LimitsProfile;
}

export type InjectedInterpreter = (request: InterpreterRequest) => unknown;

function record(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("INVALID_ACTION_RECORD");
  }
  return value as Record<string, unknown>;
}

function string(value: unknown): asserts value is string {
  if (typeof value !== "string" || value.length === 0) throw new Error("INVALID_ACTION_STRING");
}

function stringArray(value: unknown): asserts value is string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || item.length === 0)) {
    throw new Error("INVALID_ACTION_STRING_ARRAY");
  }
}

function normalizeFactAction(value: unknown): FactAction {
  const action = record(value);
  string(action.kind);
  if (action.kind === "SUPPORT_EXISTING") {
    exactKeys(action, ["kind", "family_ref", "family_revision_ref", "evidence_refs"]);
    string(action.family_ref);
    string(action.family_revision_ref);
    stringArray(action.evidence_refs);
  } else if (action.kind === "CREATE_FACT" || action.kind === "KEEP_SEPARATE") {
    exactKeys(action, [
      "kind",
      "proposal_handle",
      "proposition",
      "subject_ref",
      "object_ref",
      "polarity",
      "temporal_scope",
      "applicability",
      "evidence_refs",
    ]);
    for (const key of [
      "proposal_handle",
      "proposition",
      "subject_ref",
      "object_ref",
      "temporal_scope",
      "applicability",
    ]) string(action[key]);
    stringArray(action.evidence_refs);
  } else if (action.kind === "SUPERSEDE_CURRENT" || action.kind === "CONTRADICT_CURRENT") {
    exactKeys(action, [
      "kind",
      "proposal_handle",
      "family_ref",
      "family_revision_ref",
      "proposition",
      "subject_ref",
      "object_ref",
      "polarity",
      "temporal_scope",
      "applicability",
      "evidence_refs",
    ]);
    for (const key of [
      "proposal_handle",
      "family_ref",
      "family_revision_ref",
      "proposition",
      "subject_ref",
      "object_ref",
      "temporal_scope",
      "applicability",
    ]) string(action[key]);
    stringArray(action.evidence_refs);
  } else if (action.kind === "NO_CHANGE") {
    exactKeys(action, ["kind"], ["family_ref"]);
    if (action.family_ref !== undefined) string(action.family_ref);
  } else {
    throw new Error("INVALID_ACTION_KIND");
  }
  if (action.polarity !== undefined && !["POSITIVE", "NEGATIVE", "NEUTRAL"].includes(String(action.polarity))) {
    throw new Error("INVALID_POLARITY");
  }
  return structuredClone(action) as unknown as FactAction;
}

function normalizeExperienceAction(value: unknown): ExperienceAction {
  const action = record(value);
  string(action.kind);
  if (action.kind === "CREATE_EXPERIENCE" || action.kind === "KEEP_SEPARATE") {
    exactKeys(action, [
      "kind",
      "proposal_handle",
      "situation",
      "applicability",
      "action_taken",
      "observed_result",
      "temporal_scope",
      "personal_scope",
      "supporting_fact_refs",
      "evidence_refs",
    ]);
    for (const key of [
      "proposal_handle",
      "situation",
      "applicability",
      "action_taken",
      "observed_result",
      "temporal_scope",
      "personal_scope",
    ]) string(action[key]);
    stringArray(action.supporting_fact_refs);
    stringArray(action.evidence_refs);
  } else if (action.kind === "NO_CHANGE") {
    exactKeys(action, ["kind"], ["family_ref"]);
    if (action.family_ref !== undefined) string(action.family_ref);
  } else {
    throw new Error("INVALID_ACTION_KIND");
  }
  return structuredClone(action) as unknown as ExperienceAction;
}

export class FakeAdapterPort {
  readonly #interpreter: InjectedInterpreter;
  #callCount = 0;

  constructor(interpreter: InjectedInterpreter) {
    this.#interpreter = interpreter;
  }

  get callCount(): number {
    return this.#callCount;
  }

  formOnce(request: InterpreterRequest): unknown {
    this.#callCount += 1;
    return this.#interpreter(structuredClone(request));
  }

  normalizeActionSet(value: unknown): FormationActionSet {
    const envelope = record(value);
    exactKeys(
      envelope,
      [
        "batch_ref",
        "attempt_ref",
        "coverage",
        "experience_disposition",
        "fact_actions",
        "experience_actions",
      ],
      ["reached_limit_set", "observed_counts"],
    );
    string(envelope.batch_ref);
    string(envelope.attempt_ref);
    const coverage = envelope.coverage;
    if (coverage !== "COMPLETE" && coverage !== "PARTIAL" && coverage !== "UNKNOWN") {
      throw new Error("INVALID_COVERAGE");
    }
    const experienceDisposition = envelope.experience_disposition;
    if (experienceDisposition !== "PROPOSED" && experienceDisposition !== "NO_EXPERIENCE") {
      throw new Error("INVALID_EXPERIENCE_DISPOSITION");
    }
    if (!Array.isArray(envelope.fact_actions) || !Array.isArray(envelope.experience_actions)) {
      throw new Error("INVALID_ACTION_ARRAY");
    }
    const factActions = envelope.fact_actions.map(normalizeFactAction);
    const experienceActions = envelope.experience_actions.map(normalizeExperienceAction);
    if (envelope.coverage === "PARTIAL") {
      stringArray(envelope.reached_limit_set);
      const counts = record(envelope.observed_counts);
      exactKeys(counts, [
        "source_events",
        "serialized_input_tokens",
        "fact_actions",
        "experience_actions",
        "serialized_action_bytes",
      ]);
      if (Object.values(counts).some((item) => !Number.isSafeInteger(item) || Number(item) < 0)) {
        throw new Error("INVALID_OBSERVED_COUNTS");
      }
    } else if (envelope.reached_limit_set !== undefined || envelope.observed_counts !== undefined) {
      throw new Error("INVALID_COVERAGE_DETAILS");
    }
    if (envelope.coverage === "UNKNOWN" && (factActions.length !== 0 || experienceActions.length !== 0)) {
      throw new Error("UNKNOWN_WITH_ACTIONS");
    }
    if (envelope.experience_disposition === "NO_EXPERIENCE" && experienceActions.length !== 0) {
      throw new Error("NO_EXPERIENCE_WITH_ACTION");
    }
    if (envelope.experience_disposition === "PROPOSED" && experienceActions.length === 0) {
      throw new Error("PROPOSED_WITHOUT_EXPERIENCE");
    }
    return {
      batch_ref: envelope.batch_ref,
      attempt_ref: envelope.attempt_ref,
      coverage,
      experience_disposition: experienceDisposition,
      fact_actions: factActions,
      experience_actions: experienceActions,
      ...(envelope.reached_limit_set === undefined
        ? {}
        : { reached_limit_set: structuredClone(envelope.reached_limit_set) as string[] }),
      ...(envelope.observed_counts === undefined
        ? {}
        : {
            observed_counts: structuredClone(envelope.observed_counts) as FormationActionSet["observed_counts"],
          }),
    };
  }
}
