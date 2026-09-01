import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import {
  CONTEXT_COMPILER_COMMANDS,
  ContextCompilerCore,
  ContextCompilerCoreError,
  SemanticFormationError,
  createCanonicalSemanticProposalV1,
  parseCanonicalSemanticProposalV1,
  parseSemanticPreparationRequestV1,
  type CanonicalSemanticProposalDraftV1,
  type CanonicalSemanticProposalV1,
  type RevisionScope,
  type SemanticAttestationAuthority,
  type SemanticAttestationChallengeV1,
  type SemanticInterpretationPreparationV1,
  type SemanticProducerKind,
} from "../src/index.js";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("WO-SF-01 Semantic Formation public contract", () => {
  it("prepares existing Raw evidence and atomically applies and replays all three explicit lanes", () => {
    const database = databasePath();
    const core = new ContextCompilerCore(database);
    const scope = scoped("three-lanes");
    append(core, scope, "event-1", "Remember that the release color is blue");

    const preparation = prepare(core, scope, ["event-1"]);
    expect(preparation).toMatchObject({
      schema_version: 1,
      observed_revision_vector: { ledger_revision: 1, state_revision: 0 },
      source_events: [{
        event: { event_id: "event-1", source_kind: "user_input" },
        authority_class: "UNATTESTED",
        attestation_refs: [],
      }],
      current_projection: { state_items: [], facts: [], relations: [] },
    });
    expect(preparation.source_events[0]?.receipt.receipt_hash).toMatch(/^[a-f0-9]{64}$/u);
    expect(core.readSemanticInterpretationPreparation(
      scope,
      preparation.preparation_id
    )).toEqual(preparation);

    const proposal = proposalFor(preparation, {
      state: [{
        op: "CREATE",
        kind: "GOAL",
        content: "Remember the release color",
        metadata: { visibility: "public" },
        source_event_ids: ["event-1"],
      }],
      facts: [{
        op: "ASSERT",
        statement: "The release color is blue",
        metadata: { topic: "release" },
        source_event_ids: ["event-1"],
      }],
      relations: [{
        op: "CREATE",
        source: { kind: "RAW_EVENT", event_id: "event-1" },
        relation_type: "SUPPORTS",
        target: { kind: "PROPOSED_FACT", fact_operation_index: 0 },
        metadata: {},
        source_event_ids: ["event-1"],
      }],
    });
    const committed = core.applyCanonicalSemanticProposal(proposal);
    expect(committed).toMatchObject({
      proposal_id: proposal.proposal_id,
      previous_revision_vector: { ledger_revision: 1, state_revision: 0 },
      current_revision_vector: { ledger_revision: 1, state_revision: 1 },
      state_commit: { state_revision: 1, state: { items: [{ status: "ACTIVE" }] } },
      fact_relation_commit: {
        facts: [{ fact_revision: 1, verification_status: "unverified" }],
        relations: [{ relation_revision: 1, status: "active" }],
      },
    });
    expect(core.applyCanonicalSemanticProposal(proposal)).toEqual(committed);
    expect(core.readCanonicalSemanticProposalResult(scope, proposal.proposal_id))
      .toEqual(committed);
    expect(core.readCanonicalState(scope).state.items).toHaveLength(1);
    expect(core.readCanonicalFactsAndRelations(scope)).toMatchObject({
      facts: [{ statement: "The release color is blue" }],
      relations: [{ relation_type: "SUPPORTS" }],
    });
    expect(CONTEXT_COMPILER_COMMANDS).toHaveLength(9);
    core.close();

    const reopened = new ContextCompilerCore(database);
    expect(reopened.readCanonicalSemanticProposalResult(scope, proposal.proposal_id))
      .toEqual(committed);
    expect(reopened.getRevisionVector(scope).state_revision).toBe(1);
    reopened.close();
  });

  it("supports legal State/Fact/Relation transitions through a fresh preparation", () => {
    const core = new ContextCompilerCore(databasePath());
    const scope = scoped("transitions");
    append(core, scope, "event-create", "Create records");
    const firstPreparation = prepare(core, scope, ["event-create"]);
    const firstProposal = proposalFor(firstPreparation, {
      state: [{
        op: "CREATE", kind: "GOAL", content: "Ship", metadata: {},
        source_event_ids: ["event-create"],
      }],
      facts: [{
        op: "ASSERT", statement: "Ship is planned", metadata: {},
        source_event_ids: ["event-create"],
      }],
      relations: [{
        op: "CREATE",
        source: { kind: "RAW_EVENT", event_id: "event-create" },
        relation_type: "SUPPORTS",
        target: { kind: "PROPOSED_FACT", fact_operation_index: 0 },
        metadata: {},
        source_event_ids: ["event-create"],
      }],
    });
    const first = core.applyCanonicalSemanticProposal(firstProposal);
    const itemId = first.state_commit!.proposal.upsert_items[0]!.item_id;
    const factId = first.fact_relation_commit!.facts[0]!.fact_id;
    const relationId = first.fact_relation_commit!.relations[0]!.relation_id;

    append(core, scope, "event-transition", "Complete and archive");
    const secondPreparation = prepare(core, scope, ["event-transition"]);
    const transitioned = core.applyCanonicalSemanticProposal(proposalFor(secondPreparation, {
      state: [{
        op: "TRANSITION", item_id: itemId, status: "COMPLETED",
        source_event_ids: ["event-transition"],
      }],
      facts: [{
        op: "TRANSITION", fact_id: factId, expected_fact_revision: 1,
        lifecycle_status: "active", record_status: "archived",
        source_event_ids: ["event-transition"],
      }],
      relations: [{
        op: "RETRACT", relation_id: relationId, expected_relation_revision: 1,
        source_event_ids: ["event-transition"],
      }],
    }));
    expect(transitioned.state_commit?.state.items[0]?.status).toBe("COMPLETED");
    expect(transitioned.fact_relation_commit?.facts[0]).toMatchObject({
      fact_revision: 2,
      lifecycle_status: "active",
      record_status: "archived",
    });
    expect(transitioned.fact_relation_commit?.relations[0]).toMatchObject({
      relation_revision: 2,
      status: "retracted",
    });

    append(core, scope, "event-revise", "Clarify the goal");
    const thirdPreparation = prepare(core, scope, ["event-revise"]);
    const revised = core.applyCanonicalSemanticProposal(proposalFor(thirdPreparation, {
      state: [{
        op: "REVISE", item_id: itemId, content: "Ship the stable release", metadata: {},
        source_event_ids: ["event-revise"],
      }],
      facts: [],
      relations: [],
    }));
    expect(revised.state_commit?.state.items[0]).toMatchObject({
      item_id: itemId,
      content: "Ship the stable release",
      status: "COMPLETED",
    });
    expect(core.applyCanonicalSemanticProposal(firstProposal)).toEqual(first);
    core.close();
  });

  it("treats ABSTAINED and empty PROPOSED as terminal idempotent results", () => {
    for (const disposition of ["ABSTAINED", "PROPOSED"] as const) {
      const core = new ContextCompilerCore(databasePath());
      const scope = scoped(`empty-${disposition.toLowerCase()}`);
      append(core, scope, "event-1", "No durable semantic change");
      const preparation = prepare(core, scope, ["event-1"], []);
      const proposal = proposalFor(preparation, { state: [], facts: [], relations: [] }, {
        disposition,
        diagnostics: disposition === "ABSTAINED"
          ? { abstain_reason: "insufficient durable signal", confidence: 0.1 }
          : undefined,
      });
      const first = core.applyCanonicalSemanticProposal(proposal);
      expect(first).toMatchObject({
        disposition,
        previous_revision_vector: preparation.observed_revision_vector,
        current_revision_vector: preparation.observed_revision_vector,
      });
      expect(first.state_commit).toBeUndefined();
      expect(first.fact_relation_commit).toBeUndefined();
      expect(core.applyCanonicalSemanticProposal(proposal)).toEqual(first);

      const secondPreparation = core.prepareSemanticInterpretation({
        schema_version: 1,
        scope,
        source_event_ids: ["event-1"],
        requested_capabilities: ["FACT"],
        attestation_refs: [],
      });
      const competing = proposalFor(secondPreparation, { state: [], facts: [], relations: [] }, {
        producerKind: "REMOTE_MODEL",
      });
      expect(() => core.applyCanonicalSemanticProposal(competing))
        .toThrowError(coreCode("CONFLICT"));
      core.close();
    }
  });

  it("rejects coordinated replacement of proposal-derived stored result fields after reopen", () => {
    const database = databasePath();
    const core = new ContextCompilerCore(database);
    const scope = scoped("result-binding-tamper");
    append(core, scope, "event-1", "No semantic changes, but retain the audit result");
    const preparation = prepare(core, scope, ["event-1"], []);
    const proposal = proposalFor(
      preparation,
      { state: [], facts: [], relations: [] },
      { disposition: "PROPOSED", producerKind: "RULE", confidence: 0.25 }
    );
    const accepted = core.applyCanonicalSemanticProposal(proposal);
    expect(accepted).toMatchObject({
      disposition: "PROPOSED",
      producer: { kind: "RULE" },
      diagnostics: { confidence: 0.25 },
    });
    core.close();

    const tamper = new DatabaseSync(database);
    tamper.exec("DROP TRIGGER cc_semantic_proposal_commits_no_update");
    const row = tamper.prepare(
      `SELECT result_json FROM cc_semantic_proposal_commits
       WHERE namespace = ? AND stream_id = ? AND proposal_id = ?`
    ).get(scope.namespace, scope.stream_id, proposal.proposal_id) as {
      result_json: string;
    };
    const replacement = JSON.parse(row.result_json) as {
      disposition: string;
      producer: { kind: string };
      diagnostics: { confidence: number };
    };
    replacement.disposition = "ABSTAINED";
    replacement.producer.kind = "REMOTE_MODEL";
    replacement.diagnostics.confidence = 0.99;
    const replacementJson = JSON.stringify(replacement);
    tamper.prepare(
      `UPDATE cc_semantic_proposal_commits
       SET result_json = ?, result_hash = ?
       WHERE namespace = ? AND stream_id = ? AND proposal_id = ?`
    ).run(
      replacementJson,
      sha256Text(replacementJson),
      scope.namespace,
      scope.stream_id,
      proposal.proposal_id
    );
    tamper.exec(`CREATE TRIGGER cc_semantic_proposal_commits_no_update
      BEFORE UPDATE ON cc_semantic_proposal_commits
      BEGIN SELECT RAISE(ABORT, 'semantic proposal commits are immutable'); END`);
    tamper.close();

    const reopened = new ContextCompilerCore(database);
    expect(() => reopened.readCanonicalSemanticProposalResult(
      scope,
      proposal.proposal_id
    )).toThrowError(coreCode("CORRUPT_DATA"));
    reopened.close();
  });

  it("requires exact external attestation binding and never promotes user_input by attribution", () => {
    const core = new ContextCompilerCore(databasePath());
    const scope = scoped("attestation");
    append(core, scope, "event-1", "I directly attest this preference");
    const unattested = prepare(core, scope, ["event-1"]);
    expect(unattested.source_events[0]?.authority_class).toBe("UNATTESTED");

    const authority: SemanticAttestationAuthority = {
      verify(challenge: SemanticAttestationChallengeV1) {
        return {
          schema_version: 1,
          receipt_ref: challenge.receipt_ref,
          authority_id: "external-human-authority",
          authority_class: "DIRECT_HUMAN_ATTESTED",
          namespace: challenge.evidence_receipt.namespace,
          stream_id: challenge.evidence_receipt.stream_id,
          event_id: challenge.evidence_receipt.event_id,
          event_receipt_hash: challenge.evidence_receipt.receipt_hash,
          issued_at: "2026-08-27T12:00:00.000Z",
        };
      },
    };
    const attested = core.prepareSemanticInterpretation({
      schema_version: 1,
      scope,
      source_event_ids: ["event-1"],
      requested_capabilities: ["FACT"],
      attestation_refs: [{ receipt_ref: "human-receipt-1", event_id: "event-1" }],
    }, authority);
    expect(attested.source_events[0]).toMatchObject({
      authority_class: "DIRECT_HUMAN_ATTESTED",
      attestation_refs: ["human-receipt-1"],
    });
    const result = core.applyCanonicalSemanticProposal(proposalFor(attested, {
      state: [],
      facts: [{
        op: "ASSERT",
        statement: "The user prefers direct evidence",
        metadata: {},
        source_event_ids: ["event-1"],
        attestation_refs: ["human-receipt-1"],
      }],
      relations: [],
    }));
    expect(result.fact_relation_commit?.facts[0]?.metadata).toEqual({
      semantic_formation: {
        authority_class: "DIRECT_HUMAN_ATTESTED",
        attestation_refs: ["human-receipt-1"],
      },
    });

    const badScope = scoped("bad-attestation");
    append(core, badScope, "event-bad", "Bad proof");
    expect(() => core.prepareSemanticInterpretation({
      schema_version: 1,
      scope: badScope,
      source_event_ids: ["event-bad"],
      requested_capabilities: [],
      attestation_refs: [{ receipt_ref: "bad", event_id: "event-bad" }],
    }, {
      verify(challenge) {
        return {
          schema_version: 1,
          receipt_ref: challenge.receipt_ref,
          authority_id: "external-human-authority",
          authority_class: "DIRECT_HUMAN_ATTESTED",
          namespace: challenge.evidence_receipt.namespace,
          stream_id: challenge.evidence_receipt.stream_id,
          event_id: challenge.evidence_receipt.event_id,
          event_receipt_hash: "0".repeat(64),
          issued_at: "2026-08-27T12:00:00.000Z",
        };
      },
    })).toThrowError(coreCode("INVALID_INPUT"));
    core.close();
  });

  it("fails closed on stale revision, missing evidence, wrong scope, cross-scope replay and privilege fields", () => {
    const core = new ContextCompilerCore(databasePath());
    const scope = scoped("negative-bindings");
    append(core, scope, "event-1", "First event");
    const preparation = prepare(core, scope, ["event-1"], []);
    const proposal = proposalFor(preparation, { state: [], facts: [], relations: [] });
    append(core, scope, "event-2", "Revision moved");
    expect(() => core.applyCanonicalSemanticProposal(proposal))
      .toThrowError(coreCode("CONFLICT"));
    expect(() => core.readCanonicalSemanticProposalResult(scope, proposal.proposal_id))
      .toThrowError(coreCode("NOT_FOUND"));
    expect(() => prepare(core, scope, ["missing-event"]))
      .toThrowError(coreCode("CONFLICT"));
    expect(() => prepare(core, scoped("other-scope"), ["event-1"]))
      .toThrowError(coreCode("CONFLICT"));

    const crossed = {
      ...proposal,
      scope: scoped("other-scope"),
      observed: {
        ...proposal.observed,
        revision_vector: {
          ...proposal.observed.revision_vector,
          stream_id: "other-scope",
        },
      },
    };
    expect(() => core.applyCanonicalSemanticProposal(
      crossed as CanonicalSemanticProposalV1
    )).toThrowError(coreCode("INVALID_INPUT"));

    expect(() => parseCanonicalSemanticProposalV1({
      ...proposal,
      producer: { ...proposal.producer, authority_namespace: "authority" },
    })).toThrowError(semanticCode("INVALID_INPUT"));
    expect(() => parseSemanticPreparationRequestV1({
      schema_version: 1,
      scope,
      source_event_ids: ["event-1"],
      requested_capabilities: [],
      attestation_refs: [],
      hidden_revision: 2,
    })).toThrowError(semanticCode("INVALID_INPUT"));
    core.close();
  });

  it("preserves durable event identity for equal text and rejects illegal transitions", () => {
    const core = new ContextCompilerCore(databasePath());
    const scope = scoped("identity-transition");
    append(core, scope, "event-a", "Same durable text");
    append(core, scope, "event-b", "Same durable text");
    const preparation = prepare(core, scope, ["event-a", "event-b"], ["FACT"]);
    const result = core.applyCanonicalSemanticProposal(proposalFor(preparation, {
      state: [],
      facts: [
        { op: "ASSERT", statement: "Same fact text", metadata: {}, source_event_ids: ["event-a"] },
        { op: "ASSERT", statement: "Same fact text", metadata: {}, source_event_ids: ["event-b"] },
      ],
      relations: [],
    }));
    expect(result.fact_relation_commit?.facts).toHaveLength(2);
    expect(new Set(result.fact_relation_commit?.facts.map((fact) => fact.fact_id)).size).toBe(2);

    const transitionScope = scoped("illegal-transition");
    append(core, transitionScope, "event-create", "Create goal");
    const created = core.applyCanonicalSemanticProposal(proposalFor(
      prepare(core, transitionScope, ["event-create"], ["STATE"]),
      {
        state: [{
          op: "CREATE", kind: "GOAL", content: "Goal", metadata: {},
          source_event_ids: ["event-create"],
        }],
        facts: [],
        relations: [],
      }
    ));
    const itemId = created.state_commit!.state.items[0]!.item_id;
    append(core, transitionScope, "event-invalid", "Invalid transition");
    const invalidTransition = proposalFor(
      prepare(core, transitionScope, ["event-invalid"], ["STATE"]),
      {
        state: [{
          op: "TRANSITION", item_id: itemId, status: "RESOLVED",
          source_event_ids: ["event-invalid"],
        }],
        facts: [],
        relations: [],
      }
    );
    expect(() => core.applyCanonicalSemanticProposal(invalidTransition))
      .toThrowError(coreCode("INVALID_INPUT"));
    expect(core.readCanonicalState(transitionScope).state.items[0]?.status).toBe("ACTIVE");
    core.close();
  });

  it("rolls back all lanes on injected failure and reconstructs the successful retry after restart", () => {
    for (const stage of [
      "FACT_RELATION",
      "PROPOSAL_RESULT",
      "STATE_MARKER",
      "DEFERRED_COMMIT",
    ] as const) {
      assertAtomicFailure(stage);
    }

    const database = databasePath();
    const { core, scope, proposal } = atomicCandidate(database, "atomic-restart");
    const committed = core.applyCanonicalSemanticProposal(proposal);
    expect(committed.current_revision_vector.state_revision).toBe(1);
    core.close();
    const reopened = new ContextCompilerCore(database);
    expect(reopened.readCanonicalSemanticProposalResult(scope, proposal.proposal_id))
      .toEqual(committed);
    expect(reopened.readCanonicalState(scope).state.items).toHaveLength(1);
    expect(reopened.readCanonicalFactsAndRelations(scope).facts).toHaveLength(1);
    reopened.close();
  });

  it("detects a mismatched Raw receipt and gives every producer kind the same authority-neutral result", () => {
    const database = databasePath();
    const core = new ContextCompilerCore(database);
    const tamperScope = scoped("receipt-tamper");
    append(core, tamperScope, "event-1", "Original payload");
    const tamper = new DatabaseSync(database);
    tamper.exec("DROP TRIGGER cc_ledger_raw_events_no_update");
    tamper.prepare(
      `UPDATE cc_ledger_raw_events SET payload_json = ?
       WHERE namespace = ? AND stream_id = ? AND event_id = ?`
    ).run(JSON.stringify({ text: "Substituted payload" }),
      tamperScope.namespace, tamperScope.stream_id, "event-1");
    tamper.exec(`CREATE TRIGGER cc_ledger_raw_events_no_update
      BEFORE UPDATE ON cc_ledger_raw_events
      BEGIN SELECT RAISE(ABORT, 'ledger raw events are immutable'); END`);
    tamper.close();
    expect(() => prepare(core, tamperScope, ["event-1"]))
      .toThrowError(coreCode("CORRUPT_DATA"));

    for (const kind of ["RULE", "LOCAL_MODEL", "REMOTE_MODEL", "HOST_NATIVE"] as const) {
      const scope = scoped(`producer-${kind.toLowerCase()}`);
      append(core, scope, "event-1", "Producer-neutral evidence");
      const preparation = prepare(core, scope, ["event-1"], ["FACT"]);
      const result = core.applyCanonicalSemanticProposal(proposalFor(preparation, {
        state: [],
        facts: [{
          op: "ASSERT", statement: "Producer-neutral fact", metadata: {},
          source_event_ids: ["event-1"],
        }],
        relations: [],
      }, { producerKind: kind, confidence: 0.99 }));
      expect(result.fact_relation_commit?.facts[0]).toMatchObject({
        verification_status: "unverified",
        lifecycle_status: "active",
        record_status: "live",
      });
      expect(result.fact_relation_commit?.facts[0]?.metadata).toEqual({
        semantic_formation: { authority_class: "UNATTESTED", attestation_refs: [] },
      });
    }
    core.close();
  });
});

function scoped(streamId: string): RevisionScope {
  return { namespace: "authority", stream_id: streamId };
}

function databasePath(): string {
  const directory = mkdtempSync(join(tmpdir(), "context-compiler-semantic-formation-"));
  temporaryDirectories.push(directory);
  return join(directory, "context.db");
}

function atomicCandidate(database: string, streamId: string): {
  core: ContextCompilerCore;
  scope: RevisionScope;
  proposal: CanonicalSemanticProposalV1;
} {
  const core = new ContextCompilerCore(database);
  const scope = scoped(streamId);
  append(core, scope, "event-1", "Atomic change");
  const preparation = prepare(core, scope, ["event-1"], ["STATE", "FACT"]);
  return {
    core,
    scope,
    proposal: proposalFor(preparation, {
      state: [{
        op: "CREATE", kind: "GOAL", content: "Atomic state", metadata: {},
        source_event_ids: ["event-1"],
      }],
      facts: [{
        op: "ASSERT", statement: "Atomic fact", metadata: {},
        source_event_ids: ["event-1"],
      }],
      relations: [],
    }),
  };
}

function assertAtomicFailure(
  stage: "FACT_RELATION" | "PROPOSAL_RESULT" | "STATE_MARKER" | "DEFERRED_COMMIT"
): void {
  const database = databasePath();
  const streamId = `atomic-${stage.toLowerCase().replace("_", "-")}`;
  const { core, scope, proposal } = atomicCandidate(database, streamId);
  const injection = new DatabaseSync(database);
  switch (stage) {
    case "FACT_RELATION":
      injection.exec(`CREATE TRIGGER fail_semantic_fact
        BEFORE INSERT ON cc_canonical_fact_revisions
        WHEN NEW.stream_id = '${streamId}'
        BEGIN SELECT RAISE(ABORT, 'injected fact failure'); END`);
      break;
    case "PROPOSAL_RESULT":
      injection.exec(`CREATE TRIGGER fail_semantic_result
        BEFORE INSERT ON cc_semantic_proposal_commits
        WHEN NEW.stream_id = '${streamId}'
        BEGIN SELECT RAISE(ABORT, 'injected result failure'); END`);
      break;
    case "STATE_MARKER":
      injection.exec(`CREATE TRIGGER fail_semantic_marker
        BEFORE INSERT ON cc_revision_commits
        WHEN NEW.stream_id = '${streamId}' AND NEW.kind = 'CANONICAL_STATE_COMMIT_V1'
        BEGIN SELECT RAISE(ABORT, 'injected marker failure'); END`);
      break;
    case "DEFERRED_COMMIT":
      injection.exec(`
        CREATE TABLE semantic_failure_parent (id TEXT PRIMARY KEY);
        CREATE TABLE semantic_failure_child (
          id TEXT REFERENCES semantic_failure_parent(id) DEFERRABLE INITIALLY DEFERRED
        );
        CREATE TRIGGER fail_semantic_deferred
        AFTER INSERT ON cc_semantic_proposal_events
        WHEN NEW.stream_id = '${streamId}'
        BEGIN INSERT INTO semantic_failure_child (id) VALUES ('missing'); END;
      `);
      break;
  }
  injection.close();
  expect(() => core.applyCanonicalSemanticProposal(proposal))
    .toThrowError(coreCode("STORAGE_FAILURE"));
  expect(core.getRevisionVector(scope)).toMatchObject({ ledger_revision: 1, state_revision: 0 });
  expect(core.readCanonicalState(scope).state.items).toEqual([]);
  expect(core.readCanonicalFactsAndRelations(scope)).toMatchObject({ facts: [], relations: [] });
  const audit = new DatabaseSync(database);
  for (const table of [
    "cc_canonical_state_revisions",
    "cc_canonical_fact_revisions",
    "cc_canonical_fact_relation_commits",
    "cc_semantic_proposal_commits",
    "cc_semantic_proposal_events",
  ]) {
    expect(audit.prepare(
      `SELECT COUNT(*) AS count FROM ${table} WHERE stream_id = ?`
    ).get(streamId)).toEqual({ count: 0 });
  }
  audit.close();
  core.close();
}

function append(
  core: ContextCompilerCore,
  scope: RevisionScope,
  eventId: string,
  text: string
): void {
  core.appendRawSourceProjection({
    scope,
    event_id: eventId,
    source_kind: "user_input",
    source_id: `source-${eventId}`,
    source_session_id: "public-session",
    payload: { text },
    occurred_at: "2026-08-27T00:00:00.000Z",
  });
}

function prepare(
  core: ContextCompilerCore,
  scope: RevisionScope,
  eventIds: string[],
  capabilities: Array<"STATE" | "FACT" | "RELATION"> = ["STATE", "FACT", "RELATION"]
): SemanticInterpretationPreparationV1 {
  return core.prepareSemanticInterpretation({
    schema_version: 1,
    scope,
    source_event_ids: eventIds,
    requested_capabilities: capabilities,
    attestation_refs: [],
  });
}

function proposalFor(
  preparation: SemanticInterpretationPreparationV1,
  changes: CanonicalSemanticProposalDraftV1["changes"],
  options: {
    disposition?: "PROPOSED" | "ABSTAINED";
    producerKind?: SemanticProducerKind;
    diagnostics?: CanonicalSemanticProposalDraftV1["diagnostics"];
    confidence?: number;
  } = {}
): CanonicalSemanticProposalV1 {
  return createCanonicalSemanticProposalV1({
    schema_version: 1,
    scope: { namespace: preparation.namespace, stream_id: preparation.stream_id },
    preparation_id: preparation.preparation_id,
    producer: {
      kind: options.producerKind ?? "RULE",
      implementation_id: "fixture-interpreter",
      implementation_version: "1.0.0",
      policy_version: "fixture-policy-v1",
    },
    observed: {
      revision_vector: preparation.observed_revision_vector,
      source_event_ids: preparation.source_events.map((entry) => entry.event.event_id),
    },
    disposition: options.disposition ?? "PROPOSED",
    changes,
    ...(options.diagnostics === undefined && options.confidence === undefined
      ? {}
      : {
        diagnostics: {
          ...(options.diagnostics ?? {}),
          ...(options.confidence === undefined ? {} : { confidence: options.confidence }),
        },
      }),
  });
}

function coreCode(expected: string) {
  return expect.objectContaining<Partial<ContextCompilerCoreError>>({ code: expected as never });
}

function semanticCode(expected: string) {
  return expect.objectContaining<Partial<SemanticFormationError>>({ code: expected as never });
}

function sha256Text(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}
