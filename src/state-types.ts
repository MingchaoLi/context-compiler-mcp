import type { JsonObject } from "./raw-store.js";

export type ContextItemType =
  | "GOAL"
  | "CONSTRAINT"
  | "DECISION"
  | "OPEN_QUESTION"
  | "REJECTED_ALTERNATIVE";

export type GoalStatus = "ACTIVE" | "COMPLETED" | "SUPERSEDED";
export type ConstraintStatus = "ACTIVE" | "SUPERSEDED";
export type DecisionStatus = "ACTIVE" | "SUPERSEDED";
export type OpenQuestionStatus = "OPEN" | "RESOLVED" | "DEFERRED";
export type RejectedAlternativeStatus = "REJECTED";
export type ContextItemStatus =
  | GoalStatus
  | ConstraintStatus
  | DecisionStatus
  | OpenQuestionStatus
  | RejectedAlternativeStatus;

export interface ContextItem {
  id: string;
  session_id: string;
  type: ContextItemType;
  content: string;
  status: ContextItemStatus;
  confidence: number;
  created_at: string;
  updated_at: string;
  source_refs: string[];
  metadata: JsonObject;
}

export type RelationType =
  | "SUPERSEDES"
  | "DEPENDS_ON"
  | "RESOLVED_BY"
  | "REJECTS"
  | "DERIVED_FROM";

export interface StateRelation {
  session_id: string;
  source_id: string;
  relation_type: RelationType;
  target_id: string;
  created_at: string;
}

export interface NewItemDelta {
  content: string;
  source_refs?: string[];
}

export interface StateDelta {
  new_goals: NewItemDelta[];
  updated_goals: Array<{ id: string; content?: string; status?: "COMPLETED" }>;
  new_constraints: NewItemDelta[];
  updated_constraints: Array<{
    id: string;
    content?: string;
    status?: "SUPERSEDED";
  }>;
  new_decisions: Array<
    NewItemDelta & {
      reason?: string;
      supersedes?: string[];
      reopen_if?: string;
    }
  >;
  resolved_questions: Array<{ id: string; resolved_by?: string }>;
  new_open_questions: NewItemDelta[];
  rejected_alternatives: Array<
    NewItemDelta & {
      reason?: string;
      reopen_if?: string;
      rejects?: string[];
    }
  >;
  supersessions: Array<{ superseded_id: string; superseding_id: string }>;
  new_relations: Array<{
    source_id: string;
    relation_type: "DEPENDS_ON" | "REJECTS" | "DERIVED_FROM";
    target_id: string;
  }>;
}

export const EMPTY_STATE_DELTA: StateDelta = {
  new_goals: [],
  updated_goals: [],
  new_constraints: [],
  updated_constraints: [],
  new_decisions: [],
  resolved_questions: [],
  new_open_questions: [],
  rejected_alternatives: [],
  supersessions: [],
  new_relations: [],
};
