import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  CASE_FORMATION_CONTRACT_VERSION,
  CASE_FORMATION_READ_CONTRACT_VERSION,
  CASE_FORMATION_SESSION_SCOPE_VERSION,
  RUNTIME_RAW_EVIDENCE_PROJECTION_CONTRACT,
  CaseFormationError,
  ContextCompilerCore,
  computeRawIngestFingerprint,
  createCanonicalSemanticProposalV1,
  type CaseConclusionChangeType,
  type CaseConclusionCommitInputV1,
  type CaseSessionScopeV1,
  type RuntimeRawReceiptRefV1,
} from "../src/index.js";

const temporaryPaths: string[] = [];

afterEach(() => {
  for (const path of temporaryPaths.splice(0)) rmSync(path, { recursive: true, force: true });
});

function createCore(): ContextCompilerCore {
  const directory = mkdtempSync(join(tmpdir(), "rc-case-formation-"));
  temporaryPaths.push(directory);
  return new ContextCompilerCore(join(directory, "core.db"));
}

function singleScope(sessionId: string): CaseSessionScopeV1 {
  return {
    contract_version: CASE_FORMATION_SESSION_SCOPE_VERSION,
    write_session: { namespace: "authority", session_id: sessionId },
    read_scope: [{
      session: { namespace: "authority", session_id: sessionId },
      frontier: { kind: "CURRENT" },
      precedence: 0,
    }],
  };
}

function ingest(
  core: ContextCompilerCore,
  sessionId: string,
  sourceEventId: string,
  content: string,
  offset: number,
): RuntimeRawReceiptRefV1 {
  const input = {
    session_id: sessionId,
    role: "user" as const,
    content,
    event_type: "pi.runtime.user_message",
    created_at: new Date(Date.UTC(2026, 8, 1, 0, 0, offset)).toISOString(),
    metadata: { runtime_turn_id: `turn-${offset}` },
    source_event_id: sourceEventId,
  };
  const response = core.call("ingest_event", input);
  if (!response.ok) throw new Error(response.error.code);
  const raw = response.result as { id: string; seq: number };
  return {
    raw_event_id: raw.id,
    raw_sequence: raw.seq,
    ingest_fingerprint: computeRawIngestFingerprint(input),
  };
}

function semanticResult(
  core: ContextCompilerCore,
  sessionId: string,
  raw: RuntimeRawReceiptRefV1 | RuntimeRawReceiptRefV1[],
  disposition: "PROPOSED" | "ABSTAINED" = "PROPOSED",
) {
  const raws = Array.isArray(raw) ? raw : [raw];
  const projected = core.projectRuntimeRawEvidence({
    contract: RUNTIME_RAW_EVIDENCE_PROJECTION_CONTRACT,
    schema_version: 1,
    scope: { namespace: "authority", stream_id: sessionId },
    ordered_raw_receipts: raws,
  });
  const sourceEventIds = projected.ordered_event_refs.map((ref) => ref.event_id);
  const preparation = core.prepareSemanticInterpretation({
    schema_version: 1,
    scope: { namespace: "authority", stream_id: sessionId },
    source_event_ids: sourceEventIds,
    requested_capabilities: [],
    attestation_refs: [],
  });
  const proposal = createCanonicalSemanticProposalV1({
    schema_version: 1,
    scope: { namespace: "authority", stream_id: sessionId },
    preparation_id: preparation.preparation_id,
    producer: {
      kind: "RULE",
      implementation_id: "case-test-rule",
      implementation_version: "v1",
      policy_version: "case-test-policy-v1",
    },
    observed: {
      revision_vector: preparation.observed_revision_vector,
      source_event_ids: sourceEventIds,
    },
    disposition,
    changes: { state: [], facts: [], relations: [] },
    ...(disposition === "ABSTAINED" ? { diagnostics: { abstain_reason: "raw-only" } } : {}),
  });
  return { result: core.applyCanonicalSemanticProposal(proposal), sourceEventIds };
}

function commitInput(
  scope: CaseSessionScopeV1,
  raw: RuntimeRawReceiptRefV1,
  sourceEventIds: string[],
  semanticProposalId: string,
  changeType: CaseConclusionChangeType,
  expectedHead: string | null,
  cycle: string,
): CaseConclusionCommitInputV1 {
  return {
    contract: CASE_FORMATION_CONTRACT_VERSION,
    schema_version: 1,
    session_scope: scope,
    case_id: "PI-001-F",
    anchor_id: "anchor-f",
    episode_id: `episode-${cycle}`,
    reopen_cycle_id: cycle,
    expected_head_revision_id: expectedHead,
    change_type: changeType,
    classification: "SEALED",
    conclusion: changeType === "REVOKE" ? null : `${changeType} conclusion`,
    open_questions: changeType === "REVOKE" ? ["replacement pending"] : [],
    repo_anchors: [{ kind: "FILE", value: "PI-001-F.md" }],
    outcomes: [{
      kind: "TEST_RESULT",
      status: "PASS",
      source_event_id: sourceEventIds[0]!,
      summary: "focused tests passed",
    }],
    user_feedback: [],
    reuse_evidence: [],
    ordered_raw_receipts: [raw],
    source_event_ids: sourceEventIds,
    semantic_proposal_id: semanticProposalId,
    producer: {
      kind: "RULE",
      implementation_id: "case-test-rule",
      implementation_version: "v1",
      policy_version: "case-test-policy-v1",
    },
    confidence: 0.95,
    experience: { status: "NOT_FORMED", reason_code: "NO_REUSE_FEEDBACK" },
  };
}

describe("Core Case Formation", () => {
  it("projects exact E Raw receipts idempotently and rejects fingerprint substitution", () => {
    const core = createCore();
    try {
      const raw = ingest(core, "leaf", "source-one", "hello", 1);
      const request = {
        contract: RUNTIME_RAW_EVIDENCE_PROJECTION_CONTRACT,
        schema_version: 1 as const,
        scope: { namespace: "authority", stream_id: "leaf" },
        ordered_raw_receipts: [raw],
      };
      const first = core.projectRuntimeRawEvidence(request);
      expect(core.projectRuntimeRawEvidence(request)).toEqual(first);
      expect(first.ordered_event_refs[0]).toMatchObject({ ...raw, ledger_revision: 1 });
      expect(() => core.projectRuntimeRawEvidence({
        ...request,
        ordered_raw_receipts: [{
          ...raw,
          ingest_fingerprint: `raw_ingest_request_sha256_v1:${"f".repeat(64)}`,
        }],
      })).toThrowError(expect.objectContaining({ code: "CONFLICT" }));
    } finally {
      core.close();
    }
  });

  it("records explicit semantic abstention as RAW_ONLY and creates no conclusion", () => {
    const core = createCore();
    try {
      const raw = ingest(core, "leaf", "source-abstain", "ambiguous", 1);
      const semantic = semanticResult(core, "leaf", raw, "ABSTAINED");
      const input = {
        contract: CASE_FORMATION_CONTRACT_VERSION,
        schema_version: 1 as const,
        session_scope: singleScope("leaf"),
        anchor_id: "anchor-ambiguous",
        episode_id: "episode-ambiguous",
        case_id: null,
        ordered_raw_receipts: [raw],
        source_event_ids: semantic.sourceEventIds,
        semantic_proposal_id: semantic.result.proposal_id,
        producer: {
          kind: "RULE" as const,
          implementation_id: "case-test-rule",
          implementation_version: "v1",
          policy_version: "case-test-policy-v1",
        },
        reason_code: "MULTIPLE_CASE_CANDIDATES",
      };
      const receipt = core.abstainCaseFormation(input);
      expect(receipt.status).toBe("RAW_ONLY");
      expect(core.abstainCaseFormation(input)).toEqual(receipt);
      const read = core.readCaseFormation({
        contract: CASE_FORMATION_READ_CONTRACT_VERSION,
        schema_version: 1,
        session_scope: singleScope("leaf"),
      });
      expect(read.cases).toEqual([]);
      expect(read.raw_only_finalizations).toEqual([receipt]);
    } finally {
      core.close();
    }
  });

  it("forms Experience only from distinct typed outcome, feedback and reuse provenance", () => {
    const core = createCore();
    try {
      const raws = [
        ingest(core, "leaf", "source-outcome", "tool result", 1),
        ingest(core, "leaf", "source-feedback", "user accepted", 2),
        ingest(core, "leaf", "source-reuse", "reused in follow-up", 3),
      ];
      const semantic = semanticResult(core, "leaf", raws);
      const input: CaseConclusionCommitInputV1 = {
        ...commitInput(singleScope("leaf"), raws[0]!, semantic.sourceEventIds,
          semantic.result.proposal_id, "INITIAL", null, "typed-evidence"),
        ordered_raw_receipts: raws,
        outcomes: [{ kind: "ACTION_RESULT", status: "SUCCESS",
          source_event_id: semantic.sourceEventIds[0]!, summary: "action succeeded" }],
        user_feedback: [{ kind: "USER_FEEDBACK", status: "ACCEPTED",
          source_event_id: semantic.sourceEventIds[1]!, summary: "accepted" }],
        reuse_evidence: [{ kind: "REUSE_APPLICATION",
          source_event_id: semantic.sourceEventIds[2]!, summary: "applied again" }],
        experience: {
          status: "FORMED", action: "apply the change", outcome: "worked", feedback: "accepted",
          reuse_condition: "same repository anchor",
          outcome_evidence_event_ids: [semantic.sourceEventIds[0]!],
          feedback_evidence_event_ids: [semantic.sourceEventIds[1]!],
          reuse_evidence_event_ids: [semantic.sourceEventIds[2]!],
        },
      };
      const receipt = core.commitCaseConclusion(input);
      if (receipt.status !== "AUTHORITY_COMMITTED") throw new Error("expected commit");
      const read = core.readCaseFormation({
        contract: CASE_FORMATION_READ_CONTRACT_VERSION, schema_version: 1,
        session_scope: singleScope("leaf"), case_id: "PI-001-F",
      });
      expect(read.cases[0]!.effective_conclusion.experience).toMatchObject({ status: "FORMED" });
    } finally {
      core.close();
    }
  });

  it("downgrades missing or cross-typed Experience evidence to NOT_FORMED", () => {
    const core = createCore();
    try {
      for (const [index, mode] of ["same-event", "missing"] .entries()) {
        const raw = ingest(core, "leaf", `source-gate-${index}`, mode, index + 1);
        const semantic = semanticResult(core, "leaf", raw);
        const source = semantic.sourceEventIds[0]!;
        const base = commitInput(singleScope("leaf"), raw, semantic.sourceEventIds,
          semantic.result.proposal_id, index === 0 ? "INITIAL" : "AMEND",
          index === 0 ? null : core.readCaseFormation({
            contract: CASE_FORMATION_READ_CONTRACT_VERSION, schema_version: 1,
            session_scope: singleScope("leaf"), case_id: "PI-001-F",
          }).cases[0]!.effective_head_revision_id, `gate-${index}`);
        const receipt = core.commitCaseConclusion({
          ...base,
          outcomes: mode === "same-event" ? [{ kind: "ACTION_RESULT", status: "SUCCESS",
            source_event_id: source, summary: "ordinary event" }] : [],
          user_feedback: mode === "same-event" ? [{ kind: "USER_FEEDBACK", status: "ACCEPTED",
            source_event_id: source, summary: "same ordinary event" }] : [],
          reuse_evidence: mode === "same-event" ? [{ kind: "REUSE_OBSERVATION",
            source_event_id: source, summary: "same ordinary event" }] : [],
          experience: {
            status: "FORMED", action: "x", outcome: "y", feedback: "z", reuse_condition: "r",
            outcome_evidence_event_ids: mode === "same-event" ? [source] : [],
            feedback_evidence_event_ids: mode === "same-event" ? [source] : [],
            reuse_evidence_event_ids: mode === "same-event" ? [source] : [],
          },
        });
        if (receipt.status !== "AUTHORITY_COMMITTED") throw new Error("expected commit");
      }
      const read = core.readCaseFormation({
        contract: CASE_FORMATION_READ_CONTRACT_VERSION, schema_version: 1,
        session_scope: singleScope("leaf"), case_id: "PI-001-F",
      });
      expect(read.cases[0]!.revision_history.map(revision => revision.experience)).toEqual([
        { status: "NOT_FORMED", reason_code: "EXPERIENCE_EVIDENCE_TYPE_GATE_FAILED" },
        { status: "NOT_FORMED", reason_code: "EXPERIENCE_EVIDENCE_INCOMPLETE" },
      ]);
    } finally {
      core.close();
    }
  });

  it("CAS-commits and replays the complete revision action chain without erasing history", () => {
    const core = createCore();
    try {
      let head: string | null = null;
      const actions: CaseConclusionChangeType[] = [
        "INITIAL", "REAFFIRM", "AUGMENT", "AMEND", "SUPERSEDE", "REVOKE",
      ];
      for (let index = 0; index < actions.length; index += 1) {
        const raw = ingest(core, "leaf", `source-${index}`, `turn ${index}`, index + 1);
        const semantic = semanticResult(core, "leaf", raw);
        const input = commitInput(
          singleScope("leaf"), raw, semantic.sourceEventIds, semantic.result.proposal_id,
          actions[index]!, head, `cycle-${index}`,
        );
        const receipt = core.commitCaseConclusion(input);
        expect(core.commitCaseConclusion(input)).toEqual(receipt);
        if (receipt.status !== "AUTHORITY_COMMITTED") throw new Error("expected commit");
        head = receipt.revision_id;
      }
      const read = core.readCaseFormation({
        contract: CASE_FORMATION_READ_CONTRACT_VERSION,
        schema_version: 1,
        session_scope: singleScope("leaf"),
        case_id: "PI-001-F",
      });
      expect(read.cases[0]!.revision_history.map((revision) => revision.change_type)).toEqual(actions);
      expect(read.cases[0]!.effective_conclusion).toMatchObject({
        revision_id: head,
        change_type: "REVOKE",
        lifecycle: "REVOKED",
        conclusion: null,
      });
      const conflictingRaw = ingest(core, "leaf", "source-conflict", "conflict", 10);
      const conflictingSemantic = semanticResult(core, "leaf", conflictingRaw);
      expect(() => core.commitCaseConclusion(commitInput(
        singleScope("leaf"), conflictingRaw, conflictingSemantic.sourceEventIds,
        conflictingSemantic.result.proposal_id, "AMEND", "wrong-head", "cycle-conflict",
      ))).toThrowError(expect.objectContaining({ code: "CONFLICT" }));
    } finally {
      core.close();
    }
  });

  it("forms Experience only with outcome, feedback and reuse evidence", () => {
    const core = createCore();
    try {
      const raws = [
        ingest(core, "leaf", "source-exp-outcome", "validated outcome", 1),
        ingest(core, "leaf", "source-exp-feedback", "accepted feedback", 2),
        ingest(core, "leaf", "source-exp-reuse", "validated reuse", 3),
      ];
      const semantic = semanticResult(core, "leaf", raws);
      const input = commitInput(
        singleScope("leaf"), raws[0]!, semantic.sourceEventIds, semantic.result.proposal_id,
        "INITIAL", null, "cycle-exp",
      );
      input.ordered_raw_receipts = raws;
      input.outcomes = [{ kind: "TEST_RESULT", status: "PASS",
        source_event_id: semantic.sourceEventIds[0]!, summary: "passed" }];
      input.user_feedback = [{ kind: "USER_FEEDBACK", status: "ACCEPTED",
        source_event_id: semantic.sourceEventIds[1]!, summary: "accepted" }];
      input.reuse_evidence = [{ kind: "REUSE_OBSERVATION",
        source_event_id: semantic.sourceEventIds[2]!, summary: "reused" }];
      input.experience = {
        status: "FORMED",
        action: "apply exact receipt before eviction",
        outcome: "duplicate delivery remained idempotent",
        feedback: "user accepted the repaired flow",
        reuse_condition: "reuse for lineage-bound Raw synchronization",
        outcome_evidence_event_ids: [semantic.sourceEventIds[0]!],
        feedback_evidence_event_ids: [semantic.sourceEventIds[1]!],
        reuse_evidence_event_ids: [semantic.sourceEventIds[2]!],
      };
      const receipt = core.commitCaseConclusion(input);
      expect(receipt.status).toBe("AUTHORITY_COMMITTED");
      expect(core.getExperienceRecords("leaf").filter((record) =>
        record.kind === "CANDIDATE_EXPERIENCE")).toHaveLength(1);

      const otherRaw = ingest(core, "leaf", "source-invalid-exp", "missing feedback", 2);
      const otherSemantic = semanticResult(core, "leaf", otherRaw);
      const invalid = commitInput(
        singleScope("leaf"), otherRaw, otherSemantic.sourceEventIds, otherSemantic.result.proposal_id,
        "AMEND", receipt.status === "AUTHORITY_COMMITTED" ? receipt.revision_id : null, "cycle-invalid-exp",
      );
      invalid.experience = {
        status: "FORMED",
        action: "a",
        outcome: "o",
        feedback: "f",
        reuse_condition: "r",
        outcome_evidence_event_ids: otherSemantic.sourceEventIds,
        feedback_evidence_event_ids: [],
        reuse_evidence_event_ids: otherSemantic.sourceEventIds,
      };
      const invalidReceipt = core.commitCaseConclusion(invalid);
      expect(invalidReceipt.status).toBe("AUTHORITY_COMMITTED");
      expect(core.getExperienceRecords("leaf").filter((record) =>
        record.kind === "CANDIDATE_EXPERIENCE")).toHaveLength(1);
      expect(core.readCaseFormation({
        contract: CASE_FORMATION_READ_CONTRACT_VERSION, schema_version: 1,
        session_scope: singleScope("leaf"), case_id: "PI-001-F",
      }).cases[0]!.effective_conclusion.experience).toEqual({
        status: "NOT_FORMED", reason_code: "EXPERIENCE_EVIDENCE_INCOMPLETE",
      });
    } finally {
      core.close();
    }
  });

  it("allows multiple immutable checkpoints in one active reopen cycle while replaying by semantic proposal", () => {
    const core = createCore();
    try {
      const firstRaw = ingest(core, "leaf", "source-checkpoint-1", "checkpoint one", 1);
      const firstSemantic = semanticResult(core, "leaf", firstRaw);
      const firstInput = commitInput(
        singleScope("leaf"), firstRaw, firstSemantic.sourceEventIds,
        firstSemantic.result.proposal_id, "INITIAL", null, "active-cycle",
      );
      firstInput.classification = "CHECKPOINTED";
      const first = core.commitCaseConclusion(firstInput);
      if (first.status !== "AUTHORITY_COMMITTED") throw new Error("expected first checkpoint");

      const secondRaw = ingest(core, "leaf", "source-checkpoint-2", "checkpoint two", 2);
      const secondSemantic = semanticResult(core, "leaf", secondRaw);
      const secondInput = commitInput(
        singleScope("leaf"), secondRaw, secondSemantic.sourceEventIds,
        secondSemantic.result.proposal_id, "AMEND", first.revision_id, "active-cycle",
      );
      secondInput.classification = "CHECKPOINTED";
      const second = core.commitCaseConclusion(secondInput);
      expect(core.commitCaseConclusion(secondInput)).toEqual(second);
      const read = core.readCaseFormation({
        contract: CASE_FORMATION_READ_CONTRACT_VERSION,
        schema_version: 1,
        session_scope: singleScope("leaf"),
        case_id: "PI-001-F",
      });
      expect(read.cases[0]!.revision_history.map((item) => item.reopen_cycle_id)).toEqual([
        "active-cycle", "active-cycle",
      ]);
      expect(read.cases[0]!.case_activity).toBe("ACTIVE");
      expect(read.cases[0]!.effective_head_revision_id).toBe(
        second.status === "AUTHORITY_COMMITTED" ? second.revision_id : "",
      );
    } finally {
      core.close();
    }
  });

  it("reports a checkpoint after a dormant conclusion as REOPENED", () => {
    const core = createCore();
    try {
      const sealedRaw = ingest(core, "leaf", "source-sealed", "sealed", 1);
      const sealedSemantic = semanticResult(core, "leaf", sealedRaw);
      const sealed = core.commitCaseConclusion(commitInput(
        singleScope("leaf"), sealedRaw, sealedSemantic.sourceEventIds,
        sealedSemantic.result.proposal_id, "INITIAL", null, "sealed-cycle",
      ));
      if (sealed.status !== "AUTHORITY_COMMITTED") throw new Error("expected sealed conclusion");
      const reopenedRaw = ingest(core, "leaf", "source-reopened", "reopened", 2);
      const reopenedSemantic = semanticResult(core, "leaf", reopenedRaw);
      const reopenedInput = commitInput(
        singleScope("leaf"), reopenedRaw, reopenedSemantic.sourceEventIds,
        reopenedSemantic.result.proposal_id, "AMEND", sealed.revision_id, "reopened-cycle",
      );
      reopenedInput.classification = "CHECKPOINTED";
      core.commitCaseConclusion(reopenedInput);
      const read = core.readCaseFormation({
        contract: CASE_FORMATION_READ_CONTRACT_VERSION,
        schema_version: 1,
        session_scope: singleScope("leaf"),
        case_id: "PI-001-F",
      });
      expect(read.cases[0]!.case_activity).toBe("REOPENED");
      expect(read.cases[0]!.effective_conclusion.case_activity).toBe("REOPENED");
    } finally {
      core.close();
    }
  });

  it("reopens the same stable Case across a parent-to-child Session fork", () => {
    const core = createCore();
    try {
      const parentRaw = ingest(core, "parent", "source-parent", "parent", 1);
      const parentSemantic = semanticResult(core, "parent", parentRaw);
      const parentReceipt = core.commitCaseConclusion(commitInput(
        singleScope("parent"), parentRaw, parentSemantic.sourceEventIds,
        parentSemantic.result.proposal_id, "INITIAL", null, "parent-cycle",
      ));
      if (parentReceipt.status !== "AUTHORITY_COMMITTED") throw new Error("expected parent commit");
      const childRaw = ingest(core, "child", "source-child", "child", 2);
      const childSemantic = semanticResult(core, "child", childRaw);
      const childScope: CaseSessionScopeV1 = {
        contract_version: CASE_FORMATION_SESSION_SCOPE_VERSION,
        write_session: { namespace: "authority", session_id: "child" },
        read_scope: [
          {
            session: { namespace: "authority", session_id: "parent" },
            frontier: { kind: "FROZEN", raw_sequence: 1, state_revision: 0 },
            precedence: 0,
          },
          {
            session: { namespace: "authority", session_id: "child" },
            frontier: { kind: "CURRENT" },
            precedence: 1,
          },
        ],
      };
      const childInput = commitInput(
        childScope, childRaw, childSemantic.sourceEventIds, childSemantic.result.proposal_id,
        "AMEND", parentReceipt.revision_id, "child-cycle",
      );
      childInput.classification = "CHECKPOINTED";
      const childReceipt = core.commitCaseConclusion(childInput);
      const read = core.readCaseFormation({
        contract: CASE_FORMATION_READ_CONTRACT_VERSION,
        schema_version: 1,
        session_scope: childScope,
      });
      expect(read.cases[0]!.revision_history).toHaveLength(2);
      expect(read.cases[0]!.case_id).toBe("PI-001-F");
      expect(read.cases[0]!.case_activity).toBe("REOPENED");
      expect(read.cases[0]!.effective_conclusion.case_activity).toBe("REOPENED");
      expect(read.cases[0]!.effective_head_revision_id).toBe(
        childReceipt.status === "AUTHORITY_COMMITTED" ? childReceipt.revision_id : "",
      );
    } finally {
      core.close();
    }
  });
});
