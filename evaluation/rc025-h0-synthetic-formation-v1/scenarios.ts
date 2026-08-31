import type {
  CandidateCard,
  FormationActionSet,
  FormationInput,
  OutcomeStatus,
  SyntheticEvent,
} from "./contract.js";
import type { InjectedInterpreter, InterpreterRequest } from "./fake-adapter-port.js";
import { jcs } from "./identity.js";
import {
  seedExperienceFamily,
  seedFactFamily,
  type SyntheticState,
} from "./synthetic-state.js";

export interface SyntheticScenario {
  id: `H0-${string}`;
  purpose: string;
  input: FormationInput;
  setup: (state: SyntheticState) => void;
  interpreter: InjectedInterpreter;
  signal_count: number;
  expected_status: OutcomeStatus;
  expected_mutation: boolean;
  expected_min_fact_families: number;
  expected_min_experience_families: number;
  expected_card_count: number;
  expected_relation_count: number;
}

const SCOPE_REF = "synthetic-scope-alpha";
const SCOPE_REVISION = 7;

function events(id: string, count = 2): SyntheticEvent[] {
  return Array.from({ length: count }, (_, index) => ({
    evidence_ref: `synthetic-evidence-${id.toLowerCase()}-${index + 1}`,
    body: `Synthetic laboratory observation ${id}-${index + 1}`,
    provenance_ref: `synthetic-provenance-${id.toLowerCase()}-${index + 1}`,
    scope_ref: SCOPE_REF,
    scope_revision: SCOPE_REVISION,
  }));
}

function input(id: string, eventCount = 2, candidates: CandidateCard[] = []): FormationInput {
  const sourceEvents = events(id, eventCount);
  return {
    operation_ref: `synthetic-operation-${id.toLowerCase()}`,
    source_events: sourceEvents,
    source_event_refs: sourceEvents.map((event) => event.evidence_ref),
    cutoff: `synthetic-cutoff-${id.toLowerCase()}`,
    session_ref: `synthetic-session-${id.toLowerCase()}`,
    context_ref: `synthetic-context-${id.toLowerCase()}`,
    scope_ref: SCOPE_REF,
    scope_revision: SCOPE_REVISION,
    candidates,
  };
}

function fact(handle: string, evidenceRef: string) {
  return {
    kind: "CREATE_FACT" as const,
    proposal_handle: handle,
    proposition: `Synthetic proposition ${handle}`,
    subject_ref: "synthetic-subject",
    object_ref: `synthetic-object-${handle}`,
    polarity: "POSITIVE" as const,
    temporal_scope: "synthetic-present",
    applicability: "synthetic-lab",
    evidence_refs: [evidenceRef],
  };
}

function experience(handle: string, factHandles: string[], evidenceRef: string, kind: "CREATE_EXPERIENCE" | "KEEP_SEPARATE" = "CREATE_EXPERIENCE") {
  return {
    kind,
    proposal_handle: handle,
    situation: `Synthetic situation ${handle}`,
    applicability: "synthetic-lab",
    action_taken: `Synthetic action ${handle}`,
    observed_result: `Synthetic observed result ${handle}`,
    temporal_scope: "synthetic-present",
    personal_scope: "synthetic-person",
    supporting_fact_refs: factHandles,
    evidence_refs: [evidenceRef],
  };
}

function envelope(
  request: InterpreterRequest,
  factActions: FormationActionSet["fact_actions"],
  experienceActions: FormationActionSet["experience_actions"],
  coverage: FormationActionSet["coverage"] = "COMPLETE",
): FormationActionSet {
  const result: FormationActionSet = {
    batch_ref: request.sealed_batch.batch_ref,
    attempt_ref: request.attempt_receipt.attempt_ref,
    coverage,
    experience_disposition: experienceActions.length === 0 ? "NO_EXPERIENCE" : "PROPOSED",
    fact_actions: factActions,
    experience_actions: experienceActions,
  };
  if (coverage === "PARTIAL") {
    result.reached_limit_set = ["MAX_OUTPUT_FACT_ACTIONS", "MAX_OUTPUT_EXPERIENCE_ACTIONS"];
    result.observed_counts = {
      source_events: request.sealed_batch.source_event_refs.length,
      serialized_input_tokens: Math.max(
        1,
        Math.ceil(jcs({ sealed_batch: request.sealed_batch, candidate_cards: request.candidate_cards, limits_profile: request.limits_profile }).length / 4),
      ),
      fact_actions: factActions.length,
      experience_actions: experienceActions.length,
      serialized_action_bytes: 0,
    };
    for (let index = 0; index < 8; index += 1) {
      const bytes = Buffer.byteLength(jcs(result), "utf8");
      if (result.observed_counts.serialized_action_bytes === bytes) break;
      result.observed_counts.serialized_action_bytes = bytes;
    }
  }
  return result;
}

function completeInterpreter(factCount = 2, experienceCount = 1, separate = false): InjectedInterpreter {
  return (request) => {
    const factActions = Array.from({ length: factCount }, (_, index) =>
      fact(`fact-${index + 1}`, request.sealed_batch.source_event_refs[index % request.sealed_batch.source_event_refs.length]),
    );
    const experienceActions = Array.from({ length: experienceCount }, (_, index) =>
      experience(
        `experience-${index + 1}`,
        ["fact-1", "fact-2"],
        request.sealed_batch.source_event_refs[index % request.sealed_batch.source_event_refs.length],
        separate ? "KEEP_SEPARATE" : "CREATE_EXPERIENCE",
      ),
    );
    return envelope(request, factActions, experienceActions);
  };
}

function factsOnlyInterpreter(factCount = 2): InjectedInterpreter {
  return (request) => envelope(
    request,
    Array.from({ length: factCount }, (_, index) =>
      fact(`fact-${index + 1}`, request.sealed_batch.source_event_refs[index % request.sealed_batch.source_event_refs.length]),
    ),
    [],
  );
}

function noChangeInterpreter(request: InterpreterRequest): FormationActionSet {
  return envelope(request, [{ kind: "NO_CHANGE" }], []);
}

function seededFact(): { card: CandidateCard; setup: (state: SyntheticState) => void } {
  const familyRef = "synthetic-existing-fact-family";
  const revisionRef = "synthetic-existing-fact-revision-1";
  let card: CandidateCard | null = null;
  return {
    get card() {
      return card ?? {
        family_ref: familyRef,
        family_kind: "FACT",
        current_revision_ref: revisionRef,
        short_label: "Synthetic fact candidate",
        subject_ref: "synthetic-subject",
        object_ref: "synthetic-object",
        polarity: "POSITIVE",
        temporal_scope: "synthetic-present",
        applicability: "synthetic-lab",
        scope_ref: SCOPE_REF,
        scope_revision: SCOPE_REVISION,
        privacy: "PRESENTABLE",
        relevance: 10,
      };
    },
    setup(state) {
      card = seedFactFamily(state, familyRef, revisionRef, SCOPE_REF, SCOPE_REVISION);
    },
  };
}

function seededExperience(stateValue: "UNAMBIGUOUS" | "CONFLICT" | "UNKNOWN" = "UNAMBIGUOUS") {
  const familyRef = `synthetic-existing-experience-family-${stateValue.toLowerCase()}`;
  const revisionRef = `synthetic-existing-experience-revision-${stateValue.toLowerCase()}-1`;
  return {
    card: {
      family_ref: familyRef,
      family_kind: "EXPERIENCE" as const,
      current_revision_ref: revisionRef,
      short_label: "Synthetic experience candidate",
      subject_ref: "synthetic-subject",
      object_ref: "synthetic-outcome",
      polarity: "POSITIVE" as const,
      temporal_scope: "synthetic-present",
      applicability: "synthetic-lab",
      scope_ref: SCOPE_REF,
      scope_revision: SCOPE_REVISION,
      privacy: "PRESENTABLE" as const,
      relevance: 9,
    },
    setup(state: SyntheticState) {
      seedExperienceFamily(state, familyRef, revisionRef, SCOPE_REF, SCOPE_REVISION, stateValue);
    },
  };
}

const noSetup = () => {};

function makeScenario(
  id: SyntheticScenario["id"],
  purpose: string,
  formationInput: FormationInput,
  interpreter: InjectedInterpreter,
  overrides: Partial<Omit<SyntheticScenario, "id" | "purpose" | "input" | "interpreter">> = {},
): SyntheticScenario {
  return {
    id,
    purpose,
    input: formationInput,
    setup: noSetup,
    interpreter,
    signal_count: 1,
    expected_status: "COMMITTED_COMPLETE",
    expected_mutation: true,
    expected_min_fact_families: 2,
    expected_min_experience_families: 1,
    expected_card_count: 1,
    expected_relation_count: 0,
    ...overrides,
  };
}

const fact07 = seededFact();
const fact08 = seededFact();
const fact09 = seededFact();
const exp09 = seededExperience();
const exp15 = seededExperience("CONFLICT");

const crossScopeCard: CandidateCard = {
  ...seededFact().card,
  family_ref: "synthetic-cross-scope-family",
  scope_ref: "synthetic-scope-beta",
  relevance: 100,
};
const privateCard: CandidateCard = {
  ...seededFact().card,
  family_ref: "synthetic-private-family",
  privacy: "PRIVATE",
  relevance: 99,
};
const eligibleCard: CandidateCard = {
  ...seededFact().card,
  family_ref: "synthetic-eligible-family",
  relevance: 1,
};

export const SYNTHETIC_SCENARIOS: readonly SyntheticScenario[] = [
  makeScenario("H0-01", "several Facts and one qualified Experience share one atomic attempt", input("H0-01"), completeInterpreter()),
  makeScenario("H0-02", "complete Facts plus explicit no-Experience is a complete Fact-only outcome", input("H0-02"), factsOnlyInterpreter(), {
    expected_status: "COMMITTED_FACTS_ONLY", expected_min_experience_families: 0, expected_card_count: 0,
  }),
  makeScenario("H0-03", "scope and privacy filtering precede relevance and bounded selection", input("H0-03", 2, [crossScopeCard, privateCard, eligibleCard]), factsOnlyInterpreter(), {
    expected_status: "COMMITTED_FACTS_ONLY", expected_min_experience_families: 0, expected_card_count: 0,
  }),
  makeScenario("H0-04", "Experience uses two current Fact projections and exact opaque Evidence", input("H0-04"), completeInterpreter()),
  makeScenario("H0-05", "repeated closure exit and demand signals replay one receipt", input("H0-05"), completeInterpreter(), { signal_count: 3 }),
  makeScenario("H0-06", "Fact projection family actions and plural Experience output share one call", input("H0-06"), completeInterpreter(3, 2), {
    expected_min_fact_families: 3, expected_min_experience_families: 2, expected_card_count: 2,
  }),
  makeScenario("H0-07", "later compatible Evidence supports one presented family", input("H0-07", 2, [fact07.card]), (request) =>
    envelope(request, [{
      kind: "SUPPORT_EXISTING", family_ref: fact07.card.family_ref,
      family_revision_ref: fact07.card.current_revision_ref as string,
      evidence_refs: [request.sealed_batch.source_event_refs[0]],
    }], []), {
      setup: fact07.setup, expected_status: "COMMITTED_FACTS_ONLY", expected_min_fact_families: 1,
      expected_min_experience_families: 0, expected_card_count: 0,
    }),
  makeScenario("H0-08", "narrower applicability creates an append-only current revision", input("H0-08", 2, [fact08.card]), (request) =>
    envelope(request, [{
      ...fact("narrowed-fact", request.sealed_batch.source_event_refs[0]), kind: "SUPERSEDE_CURRENT", family_ref: fact08.card.family_ref,
      family_revision_ref: fact08.card.current_revision_ref as string,
      applicability: "synthetic-lab-narrow",
    }], []), {
      setup: fact08.setup, expected_status: "COMMITTED_FACTS_ONLY", expected_min_fact_families: 1,
      expected_min_experience_families: 0, expected_card_count: 0, expected_relation_count: 1,
    }),
  makeScenario("H0-09", "conflicting Evidence creates a visible branch and conflict representative", input("H0-09", 2, [fact09.card, exp09.card]), (request) =>
    envelope(request, [{
      ...fact("conflicting-fact", request.sealed_batch.source_event_refs[0]), kind: "CONTRADICT_CURRENT", family_ref: fact09.card.family_ref,
      family_revision_ref: fact09.card.current_revision_ref as string,
      polarity: "NEGATIVE",
    }], []), {
      setup(state) { fact09.setup(state); exp09.setup(state); }, expected_status: "COMMITTED_FACTS_ONLY",
      expected_min_fact_families: 2, expected_min_experience_families: 1, expected_card_count: 0, expected_relation_count: 1,
    }),
  makeScenario("H0-10", "indeterminate Experience remains separate with no fabricated card", input("H0-10"), completeInterpreter(2, 1, true), {
    expected_card_count: 0,
  }),
  makeScenario("H0-11", "simultaneous bounds produce truthful bounded PARTIAL coverage", input("H0-11", 8), (request) => {
    const facts = Array.from({ length: 8 }, (_, index) => fact(`fact-${index + 1}`, request.sealed_batch.source_event_refs[index]));
    const experiences = [
      experience("experience-1", ["fact-1", "fact-2"], request.sealed_batch.source_event_refs[0]),
      experience("experience-2", ["fact-3", "fact-4"], request.sealed_batch.source_event_refs[1]),
    ];
    return envelope(request, facts, experiences, "PARTIAL");
  }, { expected_status: "COMMITTED_PARTIAL", expected_min_fact_families: 8, expected_min_experience_families: 2, expected_card_count: 2 }),
  makeScenario("H0-12", "invalid missing Evidence rejects the whole intended change", input("H0-12"), (request) =>
    envelope(request, [fact("invalid-fact", "synthetic-evidence-not-presented")], []), {
      expected_status: "FAILED", expected_mutation: false, expected_min_fact_families: 0,
      expected_min_experience_families: 0, expected_card_count: 0,
    }),
  makeScenario("H0-13", "an unambiguous current Experience emits one bounded card", input("H0-13"), completeInterpreter()),
  makeScenario("H0-14", "first-card projection keeps Evidence bodies opaque", input("H0-14"), completeInterpreter()),
  makeScenario("H0-15", "a conflicted representative emits no usable card", input("H0-15", 2, [exp15.card]), noChangeInterpreter, {
    setup: exp15.setup, expected_status: "NO_CHANGE", expected_mutation: false, expected_min_fact_families: 0,
    expected_min_experience_families: 1, expected_card_count: 0,
  }),
  makeScenario("H0-16", "receipts and cards withhold truth applicability Utility and ranking", input("H0-16"), completeInterpreter()),
  makeScenario("H0-17", "absent lazy-demand and invalidation edges do not block first read", input("H0-17"), factsOnlyInterpreter(), {
    expected_status: "COMMITTED_FACTS_ONLY", expected_min_experience_families: 0, expected_card_count: 0,
  }),
  makeScenario("H0-18", "sanitized synthetic execution stays local and deterministic", input("H0-18"), completeInterpreter()),
];

export function scenarioById(id: SyntheticScenario["id"]): SyntheticScenario {
  const scenario = SYNTHETIC_SCENARIOS.find((item) => item.id === id);
  if (scenario === undefined) throw new Error("UNKNOWN_SYNTHETIC_SCENARIO");
  return scenario;
}
