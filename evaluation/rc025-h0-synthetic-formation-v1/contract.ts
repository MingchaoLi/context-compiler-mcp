export const CLAIM_CEILING = "SYNTHETIC_OFFLINE_FORMATION_SKELETON_ONLY" as const;

export const TOKENIZER_REF =
  "CC_ESTIMATE_TOKENS_JS_UTF16_CODE_UNITS_DIV4_V1" as const;

export const RC025_H0_LIMITS_V1 = Object.freeze({
  limits_profile_id: "RC025_H0_LIMITS_V1",
  max_source_events: 8,
  max_serialized_input_tokens: 2048,
  max_output_fact_actions: 8,
  max_output_experience_actions: 2,
  model_attempt_limit: 1,
  tokenizer_ref: TOKENIZER_REF,
  max_total_serialized_action_bytes: 16384,
});

export type LimitsProfile = typeof RC025_H0_LIMITS_V1;

export const LIFECYCLE_PORTS = [
  "SEAL_BATCH",
  "READ_ELIGIBLE_FAMILY_CARDS",
  "CLAIM_ATTEMPT",
  "FORM_ONCE",
  "NORMALIZE_ACTION_SET",
  "VALIDATE_AND_COMMIT_ACTION_SET",
  "MAINTAIN_CURRENT_EXPERIENCE_CARD",
  "READ_OUTCOME",
] as const;

export type LifecyclePort = (typeof LIFECYCLE_PORTS)[number];
export type FaultKind = "TIMEOUT" | "CANCELLED" | "FAILED";
export type Coverage = "COMPLETE" | "PARTIAL" | "UNKNOWN";
export type ExperienceDisposition = "PROPOSED" | "NO_EXPERIENCE";
export type ActionKind =
  | "SUPPORT_EXISTING"
  | "CREATE_FACT"
  | "SUPERSEDE_CURRENT"
  | "CONTRADICT_CURRENT"
  | "CREATE_EXPERIENCE"
  | "KEEP_SEPARATE"
  | "NO_CHANGE";

export type OutcomeStatus =
  | "COMMITTED_COMPLETE"
  | "COMMITTED_FACTS_ONLY"
  | "COMMITTED_PARTIAL"
  | "NO_CHANGE"
  | "FAILED"
  | "UNKNOWN";

export interface SyntheticEvent {
  evidence_ref: string;
  body: string;
  provenance_ref: string;
  scope_ref: string;
  scope_revision: number;
}

export interface CandidateCard {
  family_ref: string;
  family_kind: "FACT" | "EXPERIENCE";
  current_revision_ref: string | null;
  short_label: string;
  subject_ref: string;
  object_ref: string;
  polarity: "POSITIVE" | "NEGATIVE" | "NEUTRAL";
  temporal_scope: string;
  applicability: string;
  scope_ref: string;
  scope_revision: number;
  privacy: "PRESENTABLE" | "PRIVATE";
  relevance: number;
}

export interface FormationInput {
  operation_ref: string;
  source_events: readonly SyntheticEvent[];
  source_event_refs: readonly string[];
  cutoff: string;
  session_ref: string;
  context_ref: string;
  scope_ref: string;
  scope_revision: number;
  candidates: readonly CandidateCard[];
}

export interface SealedBatch {
  operation_ref: string;
  source_events: readonly SyntheticEvent[];
  source_event_refs: readonly string[];
  cutoff: string;
  session_ref: string;
  context_ref: string;
  scope_ref: string;
  scope_revision: number;
  limits_profile_ref: string;
  sealed_input_sha256: string;
  batch_ref: string;
}

export interface AttemptReceipt {
  batch_ref: string;
  attempt_ref: string;
  attempt_number: 1;
  operation_ref: string;
  status: "CLAIMED" | "TERMINAL";
}

export interface FactAction {
  kind:
    | "SUPPORT_EXISTING"
    | "CREATE_FACT"
    | "SUPERSEDE_CURRENT"
    | "CONTRADICT_CURRENT"
    | "KEEP_SEPARATE"
    | "NO_CHANGE";
  proposal_handle?: string;
  family_ref?: string;
  family_revision_ref?: string;
  proposition?: string;
  subject_ref?: string;
  object_ref?: string;
  polarity?: "POSITIVE" | "NEGATIVE" | "NEUTRAL";
  temporal_scope?: string;
  applicability?: string;
  evidence_refs?: string[];
}

export interface ExperienceAction {
  kind: "CREATE_EXPERIENCE" | "KEEP_SEPARATE" | "NO_CHANGE";
  proposal_handle?: string;
  family_ref?: string;
  family_revision_ref?: string;
  situation?: string;
  applicability?: string;
  action_taken?: string;
  observed_result?: string;
  temporal_scope?: string;
  personal_scope?: string;
  supporting_fact_refs?: string[];
  evidence_refs?: string[];
}

export interface FormationActionSet {
  batch_ref: string;
  attempt_ref: string;
  coverage: Coverage;
  experience_disposition: ExperienceDisposition;
  fact_actions: FactAction[];
  experience_actions: ExperienceAction[];
  reached_limit_set?: string[];
  observed_counts?: {
    source_events: number;
    serialized_input_tokens: number;
    fact_actions: number;
    experience_actions: number;
    serialized_action_bytes: number;
  };
}

export interface CurrentExperienceCard {
  family_ref: string;
  revision_ref: string;
  situation: string;
  applicability: string;
  action_taken: string;
  observed_result: string;
  temporal_scope: string;
  personal_scope: string;
  qualification: "UNVERIFIED_NON_AUTHORITATIVE";
  evidence_refs: string[];
  evidence_bodies_included: false;
  claim_ceiling: typeof CLAIM_CEILING;
}

export interface OutcomeReceipt {
  operation_ref: string;
  batch_ref: string;
  attempt_ref: string;
  status: OutcomeStatus;
  reason: string;
  reached_limit_set: string[];
  observed_counts: FormationActionSet["observed_counts"] | null;
  fact_family_refs: string[];
  experience_family_refs: string[];
  claim_ceiling: typeof CLAIM_CEILING;
  truth_verdict_withheld: true;
  current_task_applicability_verdict_withheld: true;
  utility_verdict_withheld: true;
  ranking_verdict_withheld: true;
}

export interface StepObservation {
  port: LifecyclePort;
  canonical_pre_sha256: string;
  canonical_post_sha256: string;
  result: "OK" | FaultKind | "CRASH_AFTER_CLAIM";
}

export interface RunObservation {
  sealed_batch: SealedBatch | null;
  presented_candidates: CandidateCard[];
  attempt_receipt: AttemptReceipt | null;
  outcome_receipt: OutcomeReceipt | null;
  current_cards: CurrentExperienceCard[];
  steps: StepObservation[];
  interpreter_call_count: number;
  canonical_pre_sha256: string;
  canonical_post_sha256: string;
  replayed: boolean;
  claim_ceiling: typeof CLAIM_CEILING;
}
