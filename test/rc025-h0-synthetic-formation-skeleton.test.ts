import { lstatSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  CLAIM_CEILING,
  LIFECYCLE_PORTS,
  RC025_H0_LIMITS_V1,
  TOKENIZER_REF,
  type CandidateCard,
  type FaultKind,
} from "../evaluation/rc025-h0-synthetic-formation-v1/contract.js";
import { FakeAdapterPort } from "../evaluation/rc025-h0-synthetic-formation-v1/fake-adapter-port.js";
import { FakeCorePort } from "../evaluation/rc025-h0-synthetic-formation-v1/fake-core-port.js";
import { SyntheticFormationHarness } from "../evaluation/rc025-h0-synthetic-formation-v1/harness.js";
import { jcs, opaqueRef, sha256Jcs } from "../evaluation/rc025-h0-synthetic-formation-v1/identity.js";
import {
  SYNTHETIC_SCENARIOS,
  scenarioById,
} from "../evaluation/rc025-h0-synthetic-formation-v1/scenarios.js";
import { createSyntheticState, seedFactFamily } from "../evaluation/rc025-h0-synthetic-formation-v1/synthetic-state.js";

describe("RC025 H0 synthetic Formation scenarios", () => {
  it("freezes the exact H0 limits and lifecycle", () => {
    expect(RC025_H0_LIMITS_V1).toEqual({
      limits_profile_id: "RC025_H0_LIMITS_V1",
      max_source_events: 8,
      max_serialized_input_tokens: 2048,
      max_output_fact_actions: 8,
      max_output_experience_actions: 2,
      model_attempt_limit: 1,
      tokenizer_ref: TOKENIZER_REF,
      max_total_serialized_action_bytes: 16384,
    });
    expect(LIFECYCLE_PORTS).toEqual([
      "SEAL_BATCH",
      "READ_ELIGIBLE_FAMILY_CARDS",
      "CLAIM_ATTEMPT",
      "FORM_ONCE",
      "NORMALIZE_ACTION_SET",
      "VALIDATE_AND_COMMIT_ACTION_SET",
      "MAINTAIN_CURRENT_EXPERIENCE_CARD",
      "READ_OUTCOME",
    ]);
  });

  it("contains exactly H0-01 through H0-18", () => {
    expect(SYNTHETIC_SCENARIOS.map((scenario) => scenario.id)).toEqual(
      Array.from({ length: 18 }, (_, index) => `H0-${String(index + 1).padStart(2, "0")}`),
    );
  });

  it("freezes deterministic H0-01 identity, receipt, card, and state hashes", () => {
    const scenario = scenarioById("H0-01");
    const state = createSyntheticState();
    const observation = new SyntheticFormationHarness(state, scenario.interpreter).run(scenario.input);
    expect({
      batch_ref: observation.sealed_batch?.batch_ref,
      sealed_input_sha256: observation.sealed_batch?.sealed_input_sha256,
      limits_profile_ref: observation.sealed_batch?.limits_profile_ref,
      attempt_ref: observation.attempt_receipt?.attempt_ref,
      outcome_sha256: sha256Jcs(observation.outcome_receipt),
      card_sha256: sha256Jcs(observation.current_cards[0]),
      receipts_sha256: sha256Jcs(state.receipts),
      canonical_pre_sha256: observation.canonical_pre_sha256,
      canonical_post_sha256: observation.canonical_post_sha256,
    }).toEqual({
      batch_ref: "rc025-h0-batch:sha256:c4c8d899248bd92a3abc6e4d5f16624540224e40fd67923c2131443bdd3b35c3",
      sealed_input_sha256: "29451f51414892a4c75abb66ce7269b7c9fb64df5b8a95c0fca09518d7ec9fe1",
      limits_profile_ref: "74e1985ab1e630cf9cb109cd90195b934c433e1d8d2d1c319152dc1f9d9fdc0e",
      attempt_ref: "rc025-h0-attempt:c4c8d899248bd92a3abc6e4d5f16624540224e40fd67923c2131443bdd3b35c3:1",
      outcome_sha256: "0b8472516b8e7c5b8367fa9ad7141c8cb17fc78458ca6dc55d9aeec9f08cd088",
      card_sha256: "d045a772bdd34b3ffa1a462d1c528d72243a48676857b8ecc0b195f70934f764",
      receipts_sha256: "ee64b65ff0e435c4ccf354de93c3d0b0e208d5fc4215f8f9f9d891191e06dff6",
      canonical_pre_sha256: "18922a949c1e0d2330f125bd714f2f893398a4c3839389b3c71c964493479b6b",
      canonical_post_sha256: "7b1b0cfb0c2918f3548da8b75a7fd2193f2ba55a25af3d8f85e000b2018ed92d",
    });
    expect(observation.outcome_receipt?.status).toBe("COMMITTED_COMPLETE");
  });

  for (const scenario of SYNTHETIC_SCENARIOS) {
    it(`${scenario.id}: ${scenario.purpose}`, () => {
      const state = createSyntheticState();
      scenario.setup(state);
      const harness = new SyntheticFormationHarness(state, scenario.interpreter);
      const observations = Array.from({ length: scenario.signal_count }, () => harness.run(scenario.input));
      const first = observations[0];

      expect(first.claim_ceiling).toBe(CLAIM_CEILING);
      expect(first.sealed_batch).not.toBeNull();
      expect(first.sealed_batch?.operation_ref).toBe(scenario.input.operation_ref);
      expect(first.sealed_batch?.source_event_refs).toEqual(scenario.input.source_event_refs);
      expect(first.sealed_batch?.cutoff).toBe(scenario.input.cutoff);
      expect(first.sealed_batch?.session_ref).toBe(scenario.input.session_ref);
      expect(first.sealed_batch?.context_ref).toBe(scenario.input.context_ref);
      expect(first.sealed_batch?.scope_ref).toBe(scenario.input.scope_ref);
      expect(first.sealed_batch?.scope_revision).toBe(scenario.input.scope_revision);
      expect(first.sealed_batch?.limits_profile_ref).toBe(sha256Jcs(RC025_H0_LIMITS_V1));
      expect(first.attempt_receipt?.operation_ref).toBe(scenario.input.operation_ref);
      expect(first.attempt_receipt?.batch_ref).toBe(first.sealed_batch?.batch_ref);
      expect(first.outcome_receipt?.attempt_ref).toBe(first.attempt_receipt?.attempt_ref);
      expect(first.outcome_receipt?.status).toBe(scenario.expected_status);
      expect(first.outcome_receipt?.claim_ceiling).toBe(CLAIM_CEILING);
      expect(first.outcome_receipt).toMatchObject({
        truth_verdict_withheld: true,
        current_task_applicability_verdict_withheld: true,
        utility_verdict_withheld: true,
        ranking_verdict_withheld: true,
      });
      expect(first.interpreter_call_count).toBe(1);
      expect(first.canonical_post_sha256 === first.canonical_pre_sha256).toBe(!scenario.expected_mutation);
      expect(Object.keys(state.memory.facts).length).toBeGreaterThanOrEqual(scenario.expected_min_fact_families);
      expect(Object.keys(state.memory.experiences).length).toBeGreaterThanOrEqual(scenario.expected_min_experience_families);
      expect(Object.keys(state.memory.relations).length).toBeGreaterThanOrEqual(scenario.expected_relation_count);
      expect(first.current_cards).toHaveLength(scenario.expected_card_count);
      for (const card of first.current_cards) {
        expect(card).toMatchObject({
          qualification: "UNVERIFIED_NON_AUTHORITATIVE",
          evidence_bodies_included: false,
          claim_ceiling: CLAIM_CEILING,
        });
        const cardBytes = jcs(card);
        for (const event of scenario.input.source_events) expect(cardBytes).not.toContain(event.body);
        expect(cardBytes).not.toContain("truth_verdict");
        expect(cardBytes).not.toContain("utility");
        expect(cardBytes).not.toContain("ranking");
      }
      expect(first.steps.map((step) => step.port)).toEqual(
        scenario.expected_status === "FAILED"
          ? LIFECYCLE_PORTS.slice(0, LIFECYCLE_PORTS.indexOf("VALIDATE_AND_COMMIT_ACTION_SET") + 1)
          : LIFECYCLE_PORTS,
      );

      if (scenario.id === "H0-03") {
        expect(first.presented_candidates.map((card) => card.family_ref)).toEqual(["synthetic-eligible-family"]);
      }
      if (scenario.id === "H0-11") {
        expect(first.outcome_receipt?.reached_limit_set).toEqual([
          "MAX_OUTPUT_FACT_ACTIONS",
          "MAX_OUTPUT_EXPERIENCE_ACTIONS",
        ]);
        expect(first.outcome_receipt?.observed_counts).toMatchObject({
          source_events: 8,
          fact_actions: 8,
          experience_actions: 2,
        });
      }

      expect(observations.reduce((sum, observation) => sum + observation.interpreter_call_count, 0)).toBe(1);
      for (const replay of observations.slice(1)) {
        expect(replay.replayed).toBe(true);
        expect(replay.sealed_batch?.batch_ref).toBe(first.sealed_batch?.batch_ref);
        expect(replay.attempt_receipt?.attempt_ref).toBe(first.attempt_receipt?.attempt_ref);
        expect(replay.outcome_receipt).toEqual(first.outcome_receipt);
        expect(replay.canonical_pre_sha256).toBe(replay.canonical_post_sha256);
      }
    });
  }
});

describe("fault, crash, replay, and atomicity controls", () => {
  const faultKinds: FaultKind[] = ["TIMEOUT", "CANCELLED", "FAILED"];

  for (const port of LIFECYCLE_PORTS) {
    for (const kind of faultKinds) {
      it(`${kind} at ${port}`, () => {
        const scenario = scenarioById("H0-01");
        const state = createSyntheticState();
        const harness = new SyntheticFormationHarness(state, scenario.interpreter);
        const observation = harness.run(scenario.input, { fault: { port, kind } });
        const faultIndex = LIFECYCLE_PORTS.indexOf(port);

        expect(observation.steps.map((step) => step.port)).toEqual(LIFECYCLE_PORTS.slice(0, faultIndex + 1));
        expect(observation.steps.at(-1)?.result).toBe(kind);
        expect(observation.interpreter_call_count).toBe(faultIndex > LIFECYCLE_PORTS.indexOf("FORM_ONCE") ? 1 : 0);
        if (faultIndex <= LIFECYCLE_PORTS.indexOf("CLAIM_ATTEMPT")) {
          expect(observation.attempt_receipt).toBeNull();
          expect(observation.outcome_receipt).toBeNull();
        } else {
          expect(observation.attempt_receipt?.attempt_number).toBe(1);
          expect(observation.outcome_receipt?.status).toBe("FAILED");
          const stable = jcs(state.memory);
          const replay = harness.run(scenario.input);
          expect(replay.replayed).toBe(true);
          expect(replay.interpreter_call_count).toBe(0);
          expect(jcs(state.memory)).toBe(stable);
          expect(replay.attempt_receipt?.attempt_ref).toBe(observation.attempt_receipt?.attempt_ref);
          expect(replay.outcome_receipt).toEqual(observation.outcome_receipt);
        }
        const commitIndex = LIFECYCLE_PORTS.indexOf("VALIDATE_AND_COMMIT_ACTION_SET");
        if (faultIndex <= commitIndex) {
          expect(observation.canonical_post_sha256).toBe(observation.canonical_pre_sha256);
        } else {
          expect(observation.canonical_post_sha256).not.toBe(observation.canonical_pre_sha256);
        }
      });
    }
  }

  it("crash immediately after claim records UNKNOWN and exact replay never reopens the attempt", () => {
    const scenario = scenarioById("H0-01");
    const state = createSyntheticState();
    const harness = new SyntheticFormationHarness(state, scenario.interpreter);
    const crashed = harness.run(scenario.input, { crash_after_claim: true });
    expect(crashed.steps.map((step) => step.port)).toEqual(LIFECYCLE_PORTS.slice(0, 3));
    expect(crashed.outcome_receipt?.status).toBe("UNKNOWN");
    expect(crashed.outcome_receipt?.reason).toBe("CRASH_AFTER_CLAIM");
    expect(crashed.interpreter_call_count).toBe(0);
    expect(crashed.canonical_post_sha256).toBe(crashed.canonical_pre_sha256);
    const replay = harness.run(scenario.input);
    expect(replay.replayed).toBe(true);
    expect(replay.interpreter_call_count).toBe(0);
    expect(replay.attempt_receipt?.attempt_ref).toBe(crashed.attempt_receipt?.attempt_ref);
    expect(replay.outcome_receipt).toEqual(crashed.outcome_receipt);
  });

  it("invalid whole changes preserve canonical memory while the attempt remains consumed", () => {
    const scenario = scenarioById("H0-12");
    const state = createSyntheticState();
    const harness = new SyntheticFormationHarness(state, scenario.interpreter);
    const failed = harness.run(scenario.input);
    expect(failed.outcome_receipt?.status).toBe("FAILED");
    expect(failed.canonical_post_sha256).toBe(failed.canonical_pre_sha256);
    expect(harness.run(scenario.input).interpreter_call_count).toBe(0);
  });
});

describe("closed domains, simultaneous limits, and candidate caps", () => {
  it("rejects unknown envelope fields and enum values", () => {
    const adapter = new FakeAdapterPort(() => null);
    const base = {
      batch_ref: "synthetic-batch",
      attempt_ref: "synthetic-attempt",
      coverage: "COMPLETE",
      experience_disposition: "NO_EXPERIENCE",
      fact_actions: [],
      experience_actions: [],
    };
    expect(() => adapter.normalizeActionSet({ ...base, extra: true })).toThrow("INVALID_CLOSED_SHAPE");
    expect(() => adapter.normalizeActionSet({ ...base, coverage: "MAYBE" })).toThrow("INVALID_COVERAGE");
    expect(() => adapter.normalizeActionSet({ ...base, fact_actions: [{ kind: "CREATE_AUTHORITY" }] })).toThrow("INVALID_ACTION_KIND");
    expect(() => adapter.normalizeActionSet({
      ...base,
      fact_actions: [{
        kind: "CREATE_FACT",
        proposal_handle: "synthetic-handle",
        family_ref: "model-assigned-forbidden",
        proposition: "Synthetic proposition",
        subject_ref: "synthetic-subject",
        object_ref: "synthetic-object",
        polarity: "POSITIVE",
        temporal_scope: "synthetic-present",
        applicability: "synthetic-lab",
        evidence_refs: ["synthetic-evidence"],
      }],
    })).toThrow("INVALID_CLOSED_SHAPE");
  });

  it("rejects source, serialized-input, output-count, and payload excess before an unvalidated mutation", () => {
    const base = scenarioById("H0-01");

    const tooManyEvents = structuredClone(base.input);
    const added = Array.from({ length: 7 }, (_, index) => ({
      ...tooManyEvents.source_events[0], evidence_ref: `synthetic-over-source-${index}`,
    }));
    tooManyEvents.source_events = [...tooManyEvents.source_events, ...added];
    tooManyEvents.source_event_refs = tooManyEvents.source_events.map((event) => event.evidence_ref);
    const sourceState = createSyntheticState();
    const sourceResult = new SyntheticFormationHarness(sourceState, base.interpreter).run(tooManyEvents);
    expect(sourceResult.attempt_receipt).toBeNull();
    expect(sourceResult.canonical_pre_sha256).toBe(sourceResult.canonical_post_sha256);

    const tooLargeInput = structuredClone(base.input);
    tooLargeInput.source_events[0].body = "S".repeat(9000);
    const inputState = createSyntheticState();
    const inputResult = new SyntheticFormationHarness(inputState, base.interpreter).run(tooLargeInput);
    expect(inputResult.attempt_receipt).toBeNull();
    expect(inputResult.canonical_pre_sha256).toBe(inputResult.canonical_post_sha256);

    const overFactsState = createSyntheticState();
    const overFacts = new SyntheticFormationHarness(overFactsState, (request) => ({
      batch_ref: request.sealed_batch.batch_ref,
      attempt_ref: request.attempt_receipt.attempt_ref,
      coverage: "COMPLETE",
      experience_disposition: "NO_EXPERIENCE",
      fact_actions: Array.from({ length: 9 }, (_, index) => ({
        kind: "CREATE_FACT",
        proposal_handle: `synthetic-over-fact-${index}`,
        proposition: `Synthetic over-count proposition ${index}`,
        subject_ref: "synthetic-subject",
        object_ref: `synthetic-object-${index}`,
        polarity: "POSITIVE",
        temporal_scope: "synthetic-present",
        applicability: "synthetic-lab",
        evidence_refs: [request.sealed_batch.source_event_refs[0]],
      })),
      experience_actions: [],
    })).run(base.input);
    expect(overFacts.outcome_receipt?.status).toBe("FAILED");
    expect(overFacts.canonical_pre_sha256).toBe(overFacts.canonical_post_sha256);

    const overExperiencesState = createSyntheticState();
    const overExperiences = new SyntheticFormationHarness(overExperiencesState, (request) => ({
      batch_ref: request.sealed_batch.batch_ref,
      attempt_ref: request.attempt_receipt.attempt_ref,
      coverage: "COMPLETE",
      experience_disposition: "PROPOSED",
      fact_actions: [],
      experience_actions: Array.from({ length: 3 }, (_, index) => ({
        kind: "CREATE_EXPERIENCE",
        proposal_handle: `synthetic-over-experience-${index}`,
        situation: "Synthetic bounded situation",
        applicability: "synthetic-lab",
        action_taken: "Synthetic bounded action",
        observed_result: "Synthetic bounded result",
        temporal_scope: "synthetic-present",
        personal_scope: "synthetic-person",
        supporting_fact_refs: ["synthetic-fact-a", "synthetic-fact-b"],
        evidence_refs: [request.sealed_batch.source_event_refs[0]],
      })),
    })).run(base.input);
    expect(overExperiences.outcome_receipt?.status).toBe("FAILED");
    expect(overExperiences.canonical_pre_sha256).toBe(overExperiences.canonical_post_sha256);

    const overPayloadState = createSyntheticState();
    const overPayload = new SyntheticFormationHarness(overPayloadState, (request) => ({
      batch_ref: request.sealed_batch.batch_ref,
      attempt_ref: request.attempt_receipt.attempt_ref,
      coverage: "COMPLETE",
      experience_disposition: "NO_EXPERIENCE",
      fact_actions: [{
        kind: "CREATE_FACT",
        proposal_handle: "synthetic-over-payload",
        proposition: "P".repeat(17000),
        subject_ref: "synthetic-subject",
        object_ref: "synthetic-object",
        polarity: "POSITIVE",
        temporal_scope: "synthetic-present",
        applicability: "synthetic-lab",
        evidence_refs: [request.sealed_batch.source_event_refs[0]],
      }],
      experience_actions: [],
    })).run(base.input);
    expect(overPayload.outcome_receipt?.status).toBe("FAILED");
    expect(overPayload.canonical_pre_sha256).toBe(overPayload.canonical_post_sha256);
  });

  it("filters before relevance and caps reads at six Fact plus two Experience cards", () => {
    const base = scenarioById("H0-01");
    const state = createSyntheticState();
    const core = new FakeCorePort(state);
    const card = (index: number, family_kind: CandidateCard["family_kind"]): CandidateCard => ({
      family_ref: `synthetic-cap-${family_kind.toLowerCase()}-${index}`,
      family_kind,
      current_revision_ref: null,
      short_label: "Synthetic bounded candidate",
      subject_ref: "synthetic-subject",
      object_ref: "synthetic-object",
      polarity: "NEUTRAL",
      temporal_scope: "synthetic-present",
      applicability: "synthetic-lab",
      scope_ref: base.input.scope_ref,
      scope_revision: base.input.scope_revision,
      privacy: "PRESENTABLE",
      relevance: 100 - index,
    });
    const candidates = [
      ...Array.from({ length: 9 }, (_, index) => card(index, "FACT")),
      ...Array.from({ length: 4 }, (_, index) => card(index, "EXPERIENCE")),
      { ...card(99, "FACT"), family_ref: "synthetic-private-high", privacy: "PRIVATE" as const, relevance: 1000 },
      { ...card(98, "FACT"), family_ref: "synthetic-cross-high", scope_ref: "synthetic-other-scope", relevance: 1000 },
    ];
    const selected = core.readEligibleFamilyCards({ ...base.input, candidates });
    expect(selected).toHaveLength(8);
    expect(selected.filter((item) => item.family_kind === "FACT")).toHaveLength(6);
    expect(selected.filter((item) => item.family_kind === "EXPERIENCE")).toHaveLength(2);
    expect(selected.map((item) => item.family_ref)).not.toContain("synthetic-private-high");
    expect(selected.map((item) => item.family_ref)).not.toContain("synthetic-cross-high");
  });
});

describe("H0-12 exact-ref, family-state, relation, and whole-change attacks", () => {
  const base = scenarioById("H0-01");

  const createFact = (request: Parameters<typeof base.interpreter>[0], handle = "synthetic-attack-fact") => ({
    kind: "CREATE_FACT",
    proposal_handle: handle,
    proposition: "Synthetic attack-control proposition",
    subject_ref: "synthetic-subject",
    object_ref: "synthetic-object",
    polarity: "POSITIVE",
    temporal_scope: "synthetic-present",
    applicability: "synthetic-lab",
    evidence_refs: [request.sealed_batch.source_event_refs[0]],
  });

  it("rejects mismatched batch and attempt identities", () => {
    for (const changed of ["batch", "attempt"] as const) {
      const state = createSyntheticState();
      const result = new SyntheticFormationHarness(state, (request) => ({
        batch_ref: changed === "batch" ? "synthetic-wrong-batch" : request.sealed_batch.batch_ref,
        attempt_ref: changed === "attempt" ? "synthetic-wrong-attempt" : request.attempt_receipt.attempt_ref,
        coverage: "COMPLETE",
        experience_disposition: "NO_EXPERIENCE",
        fact_actions: [createFact(request)],
        experience_actions: [],
      })).run(base.input);
      expect(result.outcome_receipt?.status).toBe("FAILED");
      expect(result.canonical_pre_sha256).toBe(result.canonical_post_sha256);
    }
  });

  it("rejects duplicate Evidence, missing family state, stale revision, and cross-scope targets", () => {
    const duplicateEvidence = new SyntheticFormationHarness(createSyntheticState(), (request) => {
      const action = createFact(request);
      action.evidence_refs = [action.evidence_refs[0], action.evidence_refs[0]];
      return {
        batch_ref: request.sealed_batch.batch_ref,
        attempt_ref: request.attempt_receipt.attempt_ref,
        coverage: "COMPLETE",
        experience_disposition: "NO_EXPERIENCE",
        fact_actions: [action],
        experience_actions: [],
      };
    }).run(base.input);
    expect(duplicateEvidence.outcome_receipt?.status).toBe("FAILED");
    expect(duplicateEvidence.canonical_pre_sha256).toBe(duplicateEvidence.canonical_post_sha256);

    const targetCard: CandidateCard = {
      family_ref: "synthetic-target-family",
      family_kind: "FACT",
      current_revision_ref: "synthetic-target-revision-1",
      short_label: "Synthetic target candidate",
      subject_ref: "synthetic-subject",
      object_ref: "synthetic-object",
      polarity: "POSITIVE",
      temporal_scope: "synthetic-present",
      applicability: "synthetic-lab",
      scope_ref: base.input.scope_ref,
      scope_revision: base.input.scope_revision,
      privacy: "PRESENTABLE",
      relevance: 10,
    };
    const support = (request: Parameters<typeof base.interpreter>[0], card: CandidateCard) => ({
      batch_ref: request.sealed_batch.batch_ref,
      attempt_ref: request.attempt_receipt.attempt_ref,
      coverage: "COMPLETE",
      experience_disposition: "NO_EXPERIENCE",
      fact_actions: [{
        kind: "SUPPORT_EXISTING",
        family_ref: card.family_ref,
        family_revision_ref: card.current_revision_ref,
        evidence_refs: [request.sealed_batch.source_event_refs[0]],
      }],
      experience_actions: [],
    });

    const missingState = new SyntheticFormationHarness(createSyntheticState(), (request) => support(request, targetCard))
      .run({ ...base.input, candidates: [targetCard] });
    expect(missingState.outcome_receipt?.status).toBe("FAILED");

    const staleState = createSyntheticState();
    seedFactFamily(staleState, targetCard.family_ref, "synthetic-current-revision-2", base.input.scope_ref, base.input.scope_revision);
    const stale = new SyntheticFormationHarness(staleState, (request) => support(request, targetCard))
      .run({ ...base.input, candidates: [targetCard] });
    expect(stale.outcome_receipt?.status).toBe("FAILED");
    expect(stale.canonical_pre_sha256).toBe(stale.canonical_post_sha256);

    const crossScope = { ...targetCard, scope_ref: "synthetic-other-scope" };
    const cross = new SyntheticFormationHarness(createSyntheticState(), (request) => support(request, crossScope))
      .run({ ...base.input, candidates: [crossScope] });
    expect(cross.presented_candidates).toEqual([]);
    expect(cross.outcome_receipt?.status).toBe("FAILED");
  });

  it("rolls back valid Fact projections when Experience support is structurally invalid", () => {
    const state = createSyntheticState();
    const result = new SyntheticFormationHarness(state, (request) => ({
      batch_ref: request.sealed_batch.batch_ref,
      attempt_ref: request.attempt_receipt.attempt_ref,
      coverage: "COMPLETE",
      experience_disposition: "PROPOSED",
      fact_actions: [createFact(request, "fact-a"), createFact(request, "fact-b")],
      experience_actions: [{
        kind: "CREATE_EXPERIENCE",
        proposal_handle: "synthetic-invalid-experience",
        situation: "Synthetic situation",
        applicability: "synthetic-lab",
        action_taken: "Synthetic action",
        observed_result: "Synthetic result",
        temporal_scope: "synthetic-present",
        personal_scope: "synthetic-person",
        supporting_fact_refs: ["fact-a"],
        evidence_refs: [request.sealed_batch.source_event_refs[0]],
      }],
    })).run(base.input);
    expect(result.outcome_receipt?.status).toBe("FAILED");
    expect(result.canonical_pre_sha256).toBe(result.canonical_post_sha256);
    expect(state.memory.facts).toEqual({});
    expect(state.memory.experiences).toEqual({});
  });

  for (const attack of ["SELF", "DUPLICATE", "CYCLE"] as const) {
    it(`rejects ${attack.toLowerCase()} relation construction atomically`, () => {
      const state = createSyntheticState();
      const core = new FakeCorePort(state);
      const sealed = core.sealBatch(base.input);
      const handle = "relation-fact";
      const futureRevision = opaqueRef("rc025-h0-fact-revision", { batch_ref: sealed.batch_ref, handle });
      const oldRevision = attack === "SELF" ? futureRevision : "synthetic-old-revision";
      const card = seedFactFamily(
        state,
        "synthetic-relation-family",
        oldRevision,
        base.input.scope_ref,
        base.input.scope_revision,
      );
      if (attack !== "SELF") {
        const fromRef = attack === "DUPLICATE" ? futureRevision : oldRevision;
        const toRef = attack === "DUPLICATE" ? oldRevision : futureRevision;
        state.memory.relations[`synthetic-existing-${attack.toLowerCase()}`] = {
          relation_ref: `synthetic-existing-${attack.toLowerCase()}`,
          kind: "SUPERSEDES",
          from_ref: fromRef,
          to_ref: toRef,
        };
      }
      const result = new SyntheticFormationHarness(state, (request) => ({
        batch_ref: request.sealed_batch.batch_ref,
        attempt_ref: request.attempt_receipt.attempt_ref,
        coverage: "COMPLETE",
        experience_disposition: "NO_EXPERIENCE",
        fact_actions: [{
          ...createFact(request, handle),
          kind: "SUPERSEDE_CURRENT",
          family_ref: card.family_ref,
          family_revision_ref: card.current_revision_ref,
        }],
        experience_actions: [],
      })).run({ ...base.input, candidates: [card] });
      expect(result.outcome_receipt?.status).toBe("FAILED");
      expect(result.canonical_pre_sha256).toBe(result.canonical_post_sha256);
    });
  }

  it("UNKNOWN consumes the one attempt but changes no canonical memory", () => {
    const state = createSyntheticState();
    const harness = new SyntheticFormationHarness(state, (request) => ({
      batch_ref: request.sealed_batch.batch_ref,
      attempt_ref: request.attempt_receipt.attempt_ref,
      coverage: "UNKNOWN",
      experience_disposition: "NO_EXPERIENCE",
      fact_actions: [],
      experience_actions: [],
    }));
    const result = harness.run(base.input);
    expect(result.outcome_receipt?.status).toBe("UNKNOWN");
    expect(result.canonical_pre_sha256).toBe(result.canonical_post_sha256);
    expect(harness.run(base.input).interpreter_call_count).toBe(0);
  });
});

describe("fixture isolation", () => {
  it("uses ordinary local files and no product or external I/O dependency", () => {
    const directory = fileURLToPath(new URL("../evaluation/rc025-h0-synthetic-formation-v1/", import.meta.url));
    const files = [
      "contract.ts",
      "identity.ts",
      "synthetic-state.ts",
      "fake-core-port.ts",
      "fake-adapter-port.ts",
      "harness.ts",
      "scenarios.ts",
      "README.md",
    ];
    for (const file of files) {
      const path = `${directory}/${file}`;
      expect(lstatSync(path).isFile()).toBe(true);
      expect(lstatSync(path).isSymbolicLink()).toBe(false);
      const source = readFileSync(path, "utf8");
      expect(source).not.toMatch(/from\s+["']\.\.\/\.\.\/src\//u);
      expect(source).not.toMatch(/node:(?:child_process|net|http|https|sqlite)/u);
      expect(source).not.toMatch(/\bfetch\s*\(/u);
      expect(source).not.toMatch(/process\.env/u);
      expect(source).not.toMatch(/\/Users\//u);
      expect(source).not.toMatch(/rc_memory/u);
    }
  });
});
