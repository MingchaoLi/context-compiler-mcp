import {
  CLAIM_CEILING,
  RC025_H0_LIMITS_V1,
  type AttemptReceipt,
  type CandidateCard,
  type CurrentExperienceCard,
  type FormationActionSet,
  type FormationInput,
  type OutcomeReceipt,
  type OutcomeStatus,
  type SealedBatch,
} from "./contract.js";
import { jcs, opaqueRef, sha256Jcs } from "./identity.js";
import {
  addEvidence,
  cloneMemory,
  type CanonicalSyntheticMemory,
  type ExperienceRevision,
  type FactRevision,
  type SyntheticRelation,
  type SyntheticState,
} from "./synthetic-state.js";

export interface CommitSummary {
  status: OutcomeStatus;
  reason: string;
  fact_family_refs: string[];
  experience_family_refs: string[];
}

const REACHED_LIMIT_DOMAIN = new Set([
  "MAX_SOURCE_EVENTS",
  "MAX_SERIALIZED_INPUT_TOKENS",
  "MAX_OUTPUT_FACT_ACTIONS",
  "MAX_OUTPUT_EXPERIENCE_ACTIONS",
  "MAX_TOTAL_SERIALIZED_ACTION_BYTES",
]);

function requireRecord<T>(value: T | undefined, code: string): T {
  if (value === undefined || value === null || value === "") throw new Error(code);
  return value;
}

function unique(values: readonly string[]): boolean {
  return new Set(values).size === values.length;
}

function currentFactRevisionExists(memory: CanonicalSyntheticMemory, revisionRef: string): boolean {
  return Object.values(memory.facts).some((family) => family.current_revision_ref === revisionRef);
}

function relationCycle(relations: readonly SyntheticRelation[]): boolean {
  const edges = new Map<string, string[]>();
  for (const relation of relations) {
    const list = edges.get(relation.from_ref) ?? [];
    list.push(relation.to_ref);
    edges.set(relation.from_ref, list);
  }
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (node: string): boolean => {
    if (visiting.has(node)) return true;
    if (visited.has(node)) return false;
    visiting.add(node);
    for (const next of edges.get(node) ?? []) if (visit(next)) return true;
    visiting.delete(node);
    visited.add(node);
    return false;
  };
  return [...edges.keys()].some(visit);
}

export class FakeCorePort {
  readonly state: SyntheticState;

  constructor(state: SyntheticState) {
    this.state = state;
  }

  sealBatch(input: FormationInput): SealedBatch {
    if (input.source_events.length !== input.source_event_refs.length) throw new Error("SOURCE_REF_MISMATCH");
    if (input.source_events.length > RC025_H0_LIMITS_V1.max_source_events) throw new Error("LIMIT_REJECTED");
    if (!unique(input.source_event_refs)) throw new Error("DUPLICATE_EVIDENCE_REF");
    for (let index = 0; index < input.source_events.length; index += 1) {
      const event = input.source_events[index];
      if (
        event.evidence_ref !== input.source_event_refs[index] ||
        event.scope_ref !== input.scope_ref ||
        event.scope_revision !== input.scope_revision
      ) throw new Error("SCOPE_REJECTED");
    }
    const limitsProfileRef = sha256Jcs(RC025_H0_LIMITS_V1);
    const sealedInputProjection = {
      operation_ref: input.operation_ref,
      source_events: input.source_events,
      source_event_refs: input.source_event_refs,
      cutoff: input.cutoff,
      session_ref: input.session_ref,
      context_ref: input.context_ref,
      scope_ref: input.scope_ref,
      scope_revision: input.scope_revision,
    };
    const sealedInputSha = sha256Jcs(sealedInputProjection);
    const batchIdentity = {
      operation_ref: input.operation_ref,
      source_event_refs: input.source_event_refs,
      cutoff: input.cutoff,
      session_ref: input.session_ref,
      context_ref: input.context_ref,
      scope_ref: input.scope_ref,
      scope_revision: input.scope_revision,
      limits_profile_ref: limitsProfileRef,
      sealed_input_sha256: sealedInputSha,
    };
    const sealed: SealedBatch = {
      ...batchIdentity,
      source_events: structuredClone(input.source_events),
      source_event_refs: [...input.source_event_refs],
      batch_ref: opaqueRef("rc025-h0-batch", batchIdentity),
    };
    const previous = this.state.receipts.batches[sealed.batch_ref];
    if (previous !== undefined && jcs(previous) !== jcs(sealed)) throw new Error("BATCH_IDENTITY_COLLISION");
    this.state.receipts.batches[sealed.batch_ref] = structuredClone(sealed);
    addEvidence(this.state, input.source_events);
    return sealed;
  }

  readEligibleFamilyCards(input: FormationInput): CandidateCard[] {
    const eligible = input.candidates
      .filter(
        (card) =>
          card.scope_ref === input.scope_ref &&
          card.scope_revision === input.scope_revision &&
          card.privacy === "PRESENTABLE",
      )
      .sort((left, right) => right.relevance - left.relevance || left.family_ref.localeCompare(right.family_ref));
    const facts = eligible.filter((card) => card.family_kind === "FACT").slice(0, 6);
    const experiences = eligible.filter((card) => card.family_kind === "EXPERIENCE").slice(0, 2);
    return [...facts, ...experiences].slice(0, 8).map((card) => structuredClone(card));
  }

  claimAttempt(sealed: SealedBatch): { receipt: AttemptReceipt; created: boolean } {
    const existing = this.state.receipts.attempts[sealed.batch_ref];
    if (existing !== undefined) return { receipt: structuredClone(existing), created: false };
    const batchDigest = sealed.batch_ref.replace("rc025-h0-batch:sha256:", "");
    const receipt: AttemptReceipt = {
      batch_ref: sealed.batch_ref,
      attempt_ref: `rc025-h0-attempt:${batchDigest}:1`,
      attempt_number: 1,
      operation_ref: sealed.operation_ref,
      status: "CLAIMED",
    };
    this.state.receipts.attempts[sealed.batch_ref] = structuredClone(receipt);
    return { receipt, created: true };
  }

  existingOutcome(batchRef: string): OutcomeReceipt | null {
    return structuredClone(this.state.receipts.outcomes[batchRef] ?? null);
  }

  validateAndCommit(
    sealed: SealedBatch,
    attempt: AttemptReceipt,
    cards: readonly CandidateCard[],
    actionSet: FormationActionSet,
    serializedInputTokens: number,
  ): CommitSummary {
    if (actionSet.batch_ref !== sealed.batch_ref || actionSet.attempt_ref !== attempt.attempt_ref) {
      throw new Error("RESULT_IDENTITY_MISMATCH");
    }
    if (actionSet.fact_actions.length > RC025_H0_LIMITS_V1.max_output_fact_actions) {
      throw new Error("FACT_ACTION_LIMIT_REJECTED");
    }
    if (actionSet.experience_actions.length > RC025_H0_LIMITS_V1.max_output_experience_actions) {
      throw new Error("EXPERIENCE_ACTION_LIMIT_REJECTED");
    }
    const serializedActionBytes = Buffer.byteLength(jcs(actionSet), "utf8");
    if (serializedActionBytes > RC025_H0_LIMITS_V1.max_total_serialized_action_bytes) {
      throw new Error("ACTION_PAYLOAD_LIMIT_REJECTED");
    }
    if (actionSet.coverage === "UNKNOWN") {
      return { status: "UNKNOWN", reason: "INDETERMINATE_COVERAGE", fact_family_refs: [], experience_family_refs: [] };
    }
    if (actionSet.coverage === "PARTIAL") {
      const reached = requireRecord(actionSet.reached_limit_set, "PARTIAL_LIMITS_MISSING");
      const counts = requireRecord(actionSet.observed_counts, "PARTIAL_COUNTS_MISSING");
      if (!unique(reached) || reached.length === 0 || reached.some((item) => !REACHED_LIMIT_DOMAIN.has(item))) {
        throw new Error("PARTIAL_LIMITS_INVALID");
      }
      if (
        counts.source_events !== sealed.source_event_refs.length ||
        counts.serialized_input_tokens !== serializedInputTokens ||
        counts.fact_actions !== actionSet.fact_actions.length ||
        counts.experience_actions !== actionSet.experience_actions.length ||
        counts.serialized_action_bytes !== serializedActionBytes
      ) throw new Error("PARTIAL_COUNTS_UNTRUTHFUL");
    }
    const presented = new Map(cards.map((card) => [card.family_ref, card]));
    const candidate = cloneMemory(this.state.memory);
    const factFamilies: string[] = [];
    const experienceFamilies: string[] = [];
    const proposalRevisionRefs = new Map<string, string>();
    const actionHandles = [
      ...actionSet.fact_actions.map((item) => item.proposal_handle).filter((item): item is string => item !== undefined),
      ...actionSet.experience_actions.map((item) => item.proposal_handle).filter((item): item is string => item !== undefined),
    ];
    if (!unique(actionHandles)) throw new Error("DUPLICATE_PROPOSAL_HANDLE");

    const validateEvidence = (refs: string[] | undefined): string[] => {
      const values = requireRecord(refs, "EVIDENCE_MISSING");
      if (!unique(values) || values.length === 0) throw new Error("EVIDENCE_INVALID");
      for (const ref of values) {
        const evidence = candidate.evidence[ref];
        if (
          evidence === undefined ||
          !sealed.source_event_refs.includes(ref) ||
          evidence.scope_ref !== sealed.scope_ref ||
          evidence.scope_revision !== sealed.scope_revision
        ) throw new Error("EVIDENCE_INVALID");
      }
      return [...values].sort();
    };

    const newFactRevision = (action: FormationActionSet["fact_actions"][number], revisionRef: string): FactRevision => ({
      revision_ref: revisionRef,
      proposition: requireRecord(action.proposition, "FACT_MEANING_MISSING"),
      subject_ref: requireRecord(action.subject_ref, "FACT_SUBJECT_MISSING"),
      object_ref: requireRecord(action.object_ref, "FACT_OBJECT_MISSING"),
      polarity: requireRecord(action.polarity, "FACT_POLARITY_MISSING"),
      temporal_scope: requireRecord(action.temporal_scope, "FACT_TIME_MISSING"),
      applicability: requireRecord(action.applicability, "FACT_APPLICABILITY_MISSING"),
      evidence_refs: validateEvidence(action.evidence_refs),
    });

    const addRelation = (kind: SyntheticRelation["kind"], fromRef: string, toRef: string): void => {
      if (fromRef === toRef) throw new Error("SELF_RELATION");
      if (Object.values(candidate.relations).some((item) => item.kind === kind && item.from_ref === fromRef && item.to_ref === toRef)) {
        throw new Error("DUPLICATE_RELATION");
      }
      const relation: SyntheticRelation = {
        relation_ref: opaqueRef("rc025-h0-relation", { kind, from_ref: fromRef, to_ref: toRef }),
        kind,
        from_ref: fromRef,
        to_ref: toRef,
      };
      candidate.relations[relation.relation_ref] = relation;
      if (relationCycle(Object.values(candidate.relations))) throw new Error("RELATION_CYCLE");
    };

    for (const action of actionSet.fact_actions) {
      if (action.kind === "NO_CHANGE") continue;
      if (action.kind === "SUPPORT_EXISTING") {
        const familyRef = requireRecord(action.family_ref, "FAMILY_REF_MISSING");
        const card = presented.get(familyRef);
        const family = candidate.facts[familyRef];
        if (card?.family_kind !== "FACT" || family === undefined) throw new Error("UNPRESENTED_FAMILY_REF");
        if (action.family_revision_ref !== card.current_revision_ref || action.family_revision_ref !== family.current_revision_ref) {
          throw new Error("FAMILY_STATE_INVALID");
        }
        const revision = family.revisions.find((item) => item.revision_ref === family.current_revision_ref);
        if (revision === undefined) throw new Error("FAMILY_STATE_INVALID");
        revision.evidence_refs = [...new Set([...revision.evidence_refs, ...validateEvidence(action.evidence_refs)])].sort();
        factFamilies.push(familyRef);
        continue;
      }
      const handle = requireRecord(action.proposal_handle, "PROPOSAL_HANDLE_MISSING");
      if (action.kind === "SUPERSEDE_CURRENT") {
        const familyRef = requireRecord(action.family_ref, "FAMILY_REF_MISSING");
        const card = presented.get(familyRef);
        const family = candidate.facts[familyRef];
        if (card?.family_kind !== "FACT" || family === undefined) throw new Error("UNPRESENTED_FAMILY_REF");
        if (action.family_revision_ref !== card.current_revision_ref || action.family_revision_ref !== family.current_revision_ref) {
          throw new Error("FAMILY_STATE_INVALID");
        }
        const oldRevision = family.current_revision_ref;
        const revisionRef = opaqueRef("rc025-h0-fact-revision", { batch_ref: sealed.batch_ref, handle });
        family.revisions.push(newFactRevision(action, revisionRef));
        family.current_revision_ref = revisionRef;
        addRelation("SUPERSEDES", revisionRef, oldRevision);
        proposalRevisionRefs.set(handle, revisionRef);
        factFamilies.push(familyRef);
        continue;
      }
      const targetFamilyRef = action.kind === "CONTRADICT_CURRENT"
        ? requireRecord(action.family_ref, "FAMILY_REF_MISSING")
        : null;
      if (targetFamilyRef !== null && (presented.get(targetFamilyRef)?.family_kind !== "FACT" || candidate.facts[targetFamilyRef] === undefined)) {
        throw new Error("UNPRESENTED_FAMILY_REF");
      }
      if (
        targetFamilyRef !== null &&
        (action.family_revision_ref !== presented.get(targetFamilyRef)?.current_revision_ref ||
          action.family_revision_ref !== candidate.facts[targetFamilyRef].current_revision_ref)
      ) throw new Error("FAMILY_STATE_INVALID");
      const familyRef = opaqueRef("rc025-h0-fact-family", { batch_ref: sealed.batch_ref, handle });
      const revisionRef = opaqueRef("rc025-h0-fact-revision", { batch_ref: sealed.batch_ref, handle });
      if (candidate.facts[familyRef] !== undefined) throw new Error("DUPLICATE_FAMILY_REF");
      candidate.facts[familyRef] = {
        family_ref: familyRef,
        scope_ref: sealed.scope_ref,
        scope_revision: sealed.scope_revision,
        revisions: [newFactRevision(action, revisionRef)],
        current_revision_ref: revisionRef,
      };
      proposalRevisionRefs.set(handle, revisionRef);
      factFamilies.push(familyRef);
      if (targetFamilyRef !== null) {
        addRelation("CONTRADICTS", revisionRef, candidate.facts[targetFamilyRef].current_revision_ref);
        for (const card of cards.filter((item) => item.family_kind === "EXPERIENCE")) {
          const experience = candidate.experiences[card.family_ref];
          if (experience !== undefined) experience.representative_state = "CONFLICT";
        }
      }
    }

    for (const action of actionSet.experience_actions) {
      if (action.kind === "NO_CHANGE") continue;
      const handle = requireRecord(action.proposal_handle, "PROPOSAL_HANDLE_MISSING");
      const supports = requireRecord(action.supporting_fact_refs, "EXPERIENCE_SUPPORT_MISSING")
        .map((ref) => proposalRevisionRefs.get(ref) ?? ref);
      if (!unique(supports) || supports.length < 2 || supports.some((ref) => !currentFactRevisionExists(candidate, ref))) {
        throw new Error("EXPERIENCE_SUPPORT_INVALID");
      }
      const familyRef = opaqueRef("rc025-h0-experience-family", { batch_ref: sealed.batch_ref, handle });
      const revisionRef = opaqueRef("rc025-h0-experience-revision", { batch_ref: sealed.batch_ref, handle });
      if (candidate.experiences[familyRef] !== undefined) throw new Error("DUPLICATE_FAMILY_REF");
      const revision: ExperienceRevision = {
        revision_ref: revisionRef,
        situation: requireRecord(action.situation, "EXPERIENCE_SITUATION_MISSING"),
        applicability: requireRecord(action.applicability, "EXPERIENCE_APPLICABILITY_MISSING"),
        action_taken: requireRecord(action.action_taken, "EXPERIENCE_ACTION_MISSING"),
        observed_result: requireRecord(action.observed_result, "EXPERIENCE_RESULT_MISSING"),
        temporal_scope: requireRecord(action.temporal_scope, "EXPERIENCE_TIME_MISSING"),
        personal_scope: requireRecord(action.personal_scope, "EXPERIENCE_SCOPE_MISSING"),
        supporting_fact_refs: supports,
        evidence_refs: validateEvidence(action.evidence_refs),
      };
      candidate.experiences[familyRef] = {
        family_ref: familyRef,
        scope_ref: sealed.scope_ref,
        scope_revision: sealed.scope_revision,
        revisions: [revision],
        current_revision_ref: revisionRef,
        representative_state: action.kind === "KEEP_SEPARATE" ? "UNKNOWN" : "UNAMBIGUOUS",
      };
      experienceFamilies.push(familyRef);
    }

    this.state.memory = candidate;
    const changed = factFamilies.length > 0 || experienceFamilies.length > 0;
    const status: OutcomeStatus = !changed
      ? "NO_CHANGE"
      : actionSet.coverage === "PARTIAL"
        ? "COMMITTED_PARTIAL"
        : actionSet.experience_disposition === "NO_EXPERIENCE"
          ? "COMMITTED_FACTS_ONLY"
          : "COMMITTED_COMPLETE";
    return {
      status,
      reason: status === "COMMITTED_FACTS_ONLY" ? "COMPLETE_FACTS_WITH_NO_EXPERIENCE" : "VALIDATED_ATOMIC_CHANGE",
      fact_family_refs: [...new Set(factFamilies)].sort(),
      experience_family_refs: [...new Set(experienceFamilies)].sort(),
    };
  }

  maintainCurrentExperienceCards(): CurrentExperienceCard[] {
    for (const family of Object.values(this.state.memory.experiences)) {
      if (family.representative_state !== "UNAMBIGUOUS") {
        delete this.state.memory.current_cards[family.family_ref];
        continue;
      }
      const revision = family.revisions.find((item) => item.revision_ref === family.current_revision_ref);
      if (revision === undefined) throw new Error("EXPERIENCE_REPRESENTATIVE_INVALID");
      this.state.memory.current_cards[family.family_ref] = {
        family_ref: family.family_ref,
        revision_ref: revision.revision_ref,
        situation: revision.situation,
        applicability: revision.applicability,
        action_taken: revision.action_taken,
        observed_result: revision.observed_result,
        temporal_scope: revision.temporal_scope,
        personal_scope: revision.personal_scope,
        qualification: "UNVERIFIED_NON_AUTHORITATIVE",
        evidence_refs: [...revision.evidence_refs],
        evidence_bodies_included: false,
        claim_ceiling: CLAIM_CEILING,
      };
    }
    return Object.values(this.state.memory.current_cards)
      .sort((left, right) => left.family_ref.localeCompare(right.family_ref))
      .map((card) => structuredClone(card));
  }

  recordOutcome(
    sealed: SealedBatch,
    attempt: AttemptReceipt,
    summary: CommitSummary,
    actionSet: FormationActionSet | null,
  ): OutcomeReceipt {
    const existing = this.state.receipts.outcomes[sealed.batch_ref];
    if (existing !== undefined) return structuredClone(existing);
    const receipt: OutcomeReceipt = {
      operation_ref: sealed.operation_ref,
      batch_ref: sealed.batch_ref,
      attempt_ref: attempt.attempt_ref,
      status: summary.status,
      reason: summary.reason,
      reached_limit_set: [...(actionSet?.reached_limit_set ?? [])],
      observed_counts: actionSet?.observed_counts === undefined ? null : structuredClone(actionSet.observed_counts),
      fact_family_refs: [...summary.fact_family_refs],
      experience_family_refs: [...summary.experience_family_refs],
      claim_ceiling: CLAIM_CEILING,
      truth_verdict_withheld: true,
      current_task_applicability_verdict_withheld: true,
      utility_verdict_withheld: true,
      ranking_verdict_withheld: true,
    };
    this.state.receipts.outcomes[sealed.batch_ref] = structuredClone(receipt);
    this.state.receipts.attempts[sealed.batch_ref] = { ...attempt, status: "TERMINAL" };
    return receipt;
  }
}
