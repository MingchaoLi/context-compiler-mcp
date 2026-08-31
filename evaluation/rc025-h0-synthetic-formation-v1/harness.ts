import {
  CLAIM_CEILING,
  RC025_H0_LIMITS_V1,
  type AttemptReceipt,
  type FaultKind,
  type FormationActionSet,
  type FormationInput,
  type LifecyclePort,
  type RunObservation,
  type SealedBatch,
  type StepObservation,
} from "./contract.js";
import { FakeAdapterPort, type InjectedInterpreter } from "./fake-adapter-port.js";
import { FakeCorePort, type CommitSummary } from "./fake-core-port.js";
import { estimateTokens, jcs } from "./identity.js";
import { addEvidence, canonicalMemorySha, type SyntheticState } from "./synthetic-state.js";

export interface FaultSelection {
  port: LifecyclePort;
  kind: FaultKind;
}

export interface HarnessOptions {
  fault?: FaultSelection;
  crash_after_claim?: boolean;
}

class PortFailure extends Error {
  constructor(
    readonly port: LifecyclePort,
    readonly kind: FaultKind,
    message: string,
  ) {
    super(message);
  }
}

export class SyntheticFormationHarness {
  readonly core: FakeCorePort;
  readonly adapter: FakeAdapterPort;

  constructor(state: SyntheticState, interpreter: InjectedInterpreter) {
    this.core = new FakeCorePort(state);
    this.adapter = new FakeAdapterPort(interpreter);
  }

  run(input: FormationInput, options: HarnessOptions = {}): RunObservation {
    addEvidence(this.core.state, input.source_events);
    const canonicalPre = canonicalMemorySha(this.core.state.memory);
    const callCountPre = this.adapter.callCount;
    const steps: StepObservation[] = [];
    let sealed: SealedBatch | null = null;
    let attempt: AttemptReceipt | null = null;
    let cards = [] as ReturnType<FakeCorePort["readEligibleFamilyCards"]>;
    let actionSet: FormationActionSet | null = null;
    let summary: CommitSummary | null = null;
    let serializedInputTokens = 0;
    let activePort: LifecyclePort = "SEAL_BATCH";

    const step = <T>(port: LifecyclePort, operation: () => T): T => {
      activePort = port;
      const pre = canonicalMemorySha(this.core.state.memory);
      try {
        if (options.fault?.port === port) {
          throw new PortFailure(port, options.fault.kind, `INJECTED_${options.fault.kind}`);
        }
        const result = operation();
        steps.push({ port, canonical_pre_sha256: pre, canonical_post_sha256: canonicalMemorySha(this.core.state.memory), result: "OK" });
        return result;
      } catch (error) {
        const kind = error instanceof PortFailure ? error.kind : "FAILED";
        steps.push({ port, canonical_pre_sha256: pre, canonical_post_sha256: canonicalMemorySha(this.core.state.memory), result: kind });
        throw error;
      }
    };

    try {
      sealed = step("SEAL_BATCH", () => this.core.sealBatch(input));
      const replayOutcome = this.core.existingOutcome(sealed.batch_ref);
      if (replayOutcome !== null) {
        return {
          sealed_batch: sealed,
          presented_candidates: [],
          attempt_receipt: structuredClone(this.core.state.receipts.attempts[sealed.batch_ref] ?? null),
          outcome_receipt: replayOutcome,
          current_cards: Object.values(this.core.state.memory.current_cards).map((card) => structuredClone(card)),
          steps,
          interpreter_call_count: this.adapter.callCount - callCountPre,
          canonical_pre_sha256: canonicalPre,
          canonical_post_sha256: canonicalMemorySha(this.core.state.memory),
          replayed: true,
          claim_ceiling: CLAIM_CEILING,
        };
      }
      cards = step("READ_ELIGIBLE_FAMILY_CARDS", () => {
        const result = this.core.readEligibleFamilyCards(input);
        serializedInputTokens = estimateTokens(
          jcs({ sealed_batch: sealed, candidate_cards: result, limits_profile: RC025_H0_LIMITS_V1 }),
        );
        if (serializedInputTokens > RC025_H0_LIMITS_V1.max_serialized_input_tokens) {
          throw new Error("SERIALIZED_INPUT_LIMIT_REJECTED");
        }
        return result;
      });
      const claim = step("CLAIM_ATTEMPT", () => this.core.claimAttempt(sealed as SealedBatch));
      attempt = claim.receipt;
      if (!claim.created) {
        const outcome = this.core.recordOutcome(
          sealed,
          attempt,
          { status: "UNKNOWN", reason: "EXISTING_NON_SUCCESS_ATTEMPT", fact_family_refs: [], experience_family_refs: [] },
          null,
        );
        return this.observe(canonicalPre, callCountPre, sealed, cards, attempt, outcome, steps, true);
      }
      if (options.crash_after_claim === true) {
        const pre = canonicalMemorySha(this.core.state.memory);
        steps[steps.length - 1] = { ...steps[steps.length - 1], canonical_post_sha256: pre };
        const outcome = this.core.recordOutcome(
          sealed,
          attempt,
          { status: "UNKNOWN", reason: "CRASH_AFTER_CLAIM", fact_family_refs: [], experience_family_refs: [] },
          null,
        );
        return this.observe(canonicalPre, callCountPre, sealed, cards, attempt, outcome, steps, false);
      }
      const raw = step("FORM_ONCE", () =>
        this.adapter.formOnce({
          sealed_batch: sealed as SealedBatch,
          attempt_receipt: attempt as AttemptReceipt,
          candidate_cards: cards,
          limits_profile: RC025_H0_LIMITS_V1,
        }),
      );
      actionSet = step("NORMALIZE_ACTION_SET", () => this.adapter.normalizeActionSet(raw));
      summary = step("VALIDATE_AND_COMMIT_ACTION_SET", () =>
        this.core.validateAndCommit(
          sealed as SealedBatch,
          attempt as AttemptReceipt,
          cards,
          actionSet as FormationActionSet,
          serializedInputTokens,
        ),
      );
      step("MAINTAIN_CURRENT_EXPERIENCE_CARD", () => this.core.maintainCurrentExperienceCards());
      const outcome = step("READ_OUTCOME", () =>
        this.core.recordOutcome(
          sealed as SealedBatch,
          attempt as AttemptReceipt,
          summary as CommitSummary,
          actionSet,
        ),
      );
      return this.observe(canonicalPre, callCountPre, sealed, cards, attempt, outcome, steps, false);
    } catch (error) {
      let outcome = sealed === null ? null : this.core.existingOutcome(sealed.batch_ref);
      if (sealed !== null && attempt !== null && outcome === null) {
        const reason = error instanceof Error ? error.message : "FAILED";
        const status = error instanceof PortFailure && error.kind !== "FAILED" ? "FAILED" : "FAILED";
        outcome = this.core.recordOutcome(
          sealed,
          attempt,
          {
            status,
            reason: `${activePort}:${reason}`,
            fact_family_refs: summary?.fact_family_refs ?? [],
            experience_family_refs: summary?.experience_family_refs ?? [],
          },
          actionSet,
        );
      }
      return this.observe(canonicalPre, callCountPre, sealed, cards, attempt, outcome, steps, false);
    }
  }

  private observe(
    canonicalPre: string,
    callCountPre: number,
    sealed: SealedBatch | null,
    cards: ReturnType<FakeCorePort["readEligibleFamilyCards"]>,
    attempt: AttemptReceipt | null,
    outcome: RunObservation["outcome_receipt"],
    steps: StepObservation[],
    replayed: boolean,
  ): RunObservation {
    return {
      sealed_batch: sealed === null ? null : structuredClone(sealed),
      presented_candidates: cards.map((card) => structuredClone(card)),
      attempt_receipt: attempt === null ? null : structuredClone(attempt),
      outcome_receipt: outcome === null ? null : structuredClone(outcome),
      current_cards: Object.values(this.core.state.memory.current_cards)
        .sort((left, right) => left.family_ref.localeCompare(right.family_ref))
        .map((card) => structuredClone(card)),
      steps: structuredClone(steps),
      interpreter_call_count: this.adapter.callCount - callCountPre,
      canonical_pre_sha256: canonicalPre,
      canonical_post_sha256: canonicalMemorySha(this.core.state.memory),
      replayed,
      claim_ceiling: CLAIM_CEILING,
    };
  }
}
