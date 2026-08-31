import type {
  AttemptReceipt,
  CandidateCard,
  CurrentExperienceCard,
  OutcomeReceipt,
  SealedBatch,
  SyntheticEvent,
} from "./contract.js";
import { sha256Jcs } from "./identity.js";

export interface FactRevision {
  revision_ref: string;
  proposition: string;
  subject_ref: string;
  object_ref: string;
  polarity: "POSITIVE" | "NEGATIVE" | "NEUTRAL";
  temporal_scope: string;
  applicability: string;
  evidence_refs: string[];
}

export interface FactFamily {
  family_ref: string;
  scope_ref: string;
  scope_revision: number;
  revisions: FactRevision[];
  current_revision_ref: string;
}

export interface ExperienceRevision {
  revision_ref: string;
  situation: string;
  applicability: string;
  action_taken: string;
  observed_result: string;
  temporal_scope: string;
  personal_scope: string;
  supporting_fact_refs: string[];
  evidence_refs: string[];
}

export interface ExperienceFamily {
  family_ref: string;
  scope_ref: string;
  scope_revision: number;
  revisions: ExperienceRevision[];
  current_revision_ref: string;
  representative_state: "UNAMBIGUOUS" | "CONFLICT" | "UNKNOWN" | "NONE";
}

export interface SyntheticRelation {
  relation_ref: string;
  kind: "SUPERSEDES" | "CONTRADICTS";
  from_ref: string;
  to_ref: string;
}

export interface CanonicalSyntheticMemory {
  evidence: Record<string, SyntheticEvent>;
  facts: Record<string, FactFamily>;
  experiences: Record<string, ExperienceFamily>;
  relations: Record<string, SyntheticRelation>;
  current_cards: Record<string, CurrentExperienceCard>;
}

export interface ReceiptJournal {
  batches: Record<string, SealedBatch>;
  attempts: Record<string, AttemptReceipt>;
  outcomes: Record<string, OutcomeReceipt>;
}

export interface SyntheticState {
  receipts: ReceiptJournal;
  memory: CanonicalSyntheticMemory;
}

export function createSyntheticState(): SyntheticState {
  return {
    receipts: { batches: {}, attempts: {}, outcomes: {} },
    memory: { evidence: {}, facts: {}, experiences: {}, relations: {}, current_cards: {} },
  };
}

export function cloneMemory(memory: CanonicalSyntheticMemory): CanonicalSyntheticMemory {
  return structuredClone(memory);
}

export function canonicalMemorySha(memory: CanonicalSyntheticMemory): string {
  return sha256Jcs(memory);
}

export function addEvidence(state: SyntheticState, events: readonly SyntheticEvent[]): void {
  for (const event of events) state.memory.evidence[event.evidence_ref] = structuredClone(event);
}

export function seedFactFamily(
  state: SyntheticState,
  family_ref: string,
  revision_ref: string,
  scope_ref: string,
  scope_revision: number,
): CandidateCard {
  state.memory.facts[family_ref] = {
    family_ref,
    scope_ref,
    scope_revision,
    current_revision_ref: revision_ref,
    revisions: [
      {
        revision_ref,
        proposition: "Synthetic baseline proposition",
        subject_ref: "synthetic-subject",
        object_ref: "synthetic-object",
        polarity: "POSITIVE",
        temporal_scope: "synthetic-present",
        applicability: "synthetic-lab",
        evidence_refs: [],
      },
    ],
  };
  return {
    family_ref,
    family_kind: "FACT",
    current_revision_ref: revision_ref,
    short_label: "Synthetic fact candidate",
    subject_ref: "synthetic-subject",
    object_ref: "synthetic-object",
    polarity: "POSITIVE",
    temporal_scope: "synthetic-present",
    applicability: "synthetic-lab",
    scope_ref,
    scope_revision,
    privacy: "PRESENTABLE",
    relevance: 10,
  };
}

export function seedExperienceFamily(
  state: SyntheticState,
  family_ref: string,
  revision_ref: string,
  scope_ref: string,
  scope_revision: number,
  representativeState: ExperienceFamily["representative_state"] = "UNAMBIGUOUS",
): CandidateCard {
  state.memory.experiences[family_ref] = {
    family_ref,
    scope_ref,
    scope_revision,
    current_revision_ref: revision_ref,
    representative_state: representativeState,
    revisions: [
      {
        revision_ref,
        situation: "Synthetic baseline situation",
        applicability: "synthetic-lab",
        action_taken: "Use the synthetic checklist",
        observed_result: "Synthetic check completed",
        temporal_scope: "synthetic-present",
        personal_scope: "synthetic-person",
        supporting_fact_refs: ["synthetic-fact-rev-a", "synthetic-fact-rev-b"],
        evidence_refs: [],
      },
    ],
  };
  return {
    family_ref,
    family_kind: "EXPERIENCE",
    current_revision_ref: revision_ref,
    short_label: "Synthetic experience candidate",
    subject_ref: "synthetic-subject",
    object_ref: "synthetic-outcome",
    polarity: "POSITIVE",
    temporal_scope: "synthetic-present",
    applicability: "synthetic-lab",
    scope_ref,
    scope_revision,
    privacy: "PRESENTABLE",
    relevance: 9,
  };
}
