import { createHash } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  CANONICAL_FACT_RELATION_POLICY_HASH,
  CanonicalFactRelationError,
  applyCanonicalFactRelationInsideCore,
  normalizeCanonicalFactRelationInputInsideCore,
  readCanonicalFactRelationAuthorityInsideCore,
  readCanonicalFactRelationCommitInsideCore,
  readCanonicalFactRelationProjectionInsideCore,
  type CanonicalFactLifecycleStatus,
  type CanonicalFactOrigin,
  type CanonicalFactRecordStatus,
  type CanonicalFactRelationCommitResult,
  type CanonicalFactRelationProjection,
  type CanonicalFactVerificationStatus,
  type CanonicalRelationEndpoint,
  type CanonicalRelationType,
  type CommittedCanonicalFact,
  type CommittedCanonicalRelation,
  type NormalizedCanonicalFactRelationCommitInput,
} from "./canonical-fact-relation.js";
import {
  CANONICAL_STATE_ITEM_KINDS,
  CANONICAL_STATE_POLICY_HASH,
  CanonicalStateError,
  applyCanonicalStateInsideCore,
  normalizeCanonicalStateInputInsideCore,
  readCanonicalStateAuthorityInsideCore,
  readCanonicalStateProjectionInsideCore,
  type CanonicalStateItem,
  type CanonicalStateItemKind,
  type CanonicalStateItemStatus,
  type CanonicalStateProjection,
  type CommittedCanonicalStateRevision,
  type NormalizedCanonicalStateCommitInputInsideCore,
} from "./canonical-state.js";
import { initializeSqliteConnection } from "./sqlite-initialization.js";
import {
  LedgerHotRawError,
  readLedgerRawEventReceiptsInsideCore,
  type LedgerRawEvent,
  type LedgerRawEventReceiptInsideCore,
  type RawSourceKind,
} from "./ledger-hot-raw.js";
import type { JsonObject, JsonValue } from "./raw-store.js";
import {
  AUTHORITY_NAMESPACE,
  SHADOW_NAMESPACE_PREFIX,
  RevisionSubstrateError,
  SqliteRevisionSubstrate,
  commitStateRevisionInsideCore,
  type RevisionScope,
  type RevisionVector,
} from "./revision-substrate.js";

export const SEMANTIC_FORMATION_SCHEMA_VERSION = 1;
export const SEMANTIC_FORMATION_POLICY_VERSION = "semantic-formation/v1";
export const SEMANTIC_CAPABILITIES = ["FACT", "RELATION", "STATE"] as const;
export const SEMANTIC_PRODUCER_KINDS = [
  "HOST_NATIVE",
  "LOCAL_MODEL",
  "REMOTE_MODEL",
  "RULE",
] as const;
export const SEMANTIC_PROPOSAL_DISPOSITIONS = ["ABSTAINED", "PROPOSED"] as const;

export type SemanticCapability = (typeof SEMANTIC_CAPABILITIES)[number];
export type SemanticProducerKind = (typeof SEMANTIC_PRODUCER_KINDS)[number];
export type SemanticProposalDisposition = (typeof SEMANTIC_PROPOSAL_DISPOSITIONS)[number];
export type SemanticFormationErrorCode =
  | "INVALID_INPUT"
  | "NOT_FOUND"
  | "CONFLICT"
  | "ATTESTATION_REJECTED"
  | "CORRUPT_DATA"
  | "STORAGE_FAILURE"
  | "CLOSED";

export interface SemanticAttestationRefV1 {
  receipt_ref: string;
  event_id: string;
}

export interface SemanticRawEvidenceReceiptV1 extends RevisionScope {
  schema_version: 1;
  event_id: string;
  ledger_revision: number;
  event_hash: string;
  marker_request_fingerprint: string;
  marker_current: RevisionVector;
  receipt_hash: string;
}

export interface SemanticAttestationChallengeV1 {
  schema_version: 1;
  receipt_ref: string;
  evidence_receipt: SemanticRawEvidenceReceiptV1;
}

export interface SemanticAttestationVerificationV1 extends RevisionScope {
  schema_version: 1;
  receipt_ref: string;
  authority_id: string;
  authority_class: "DIRECT_HUMAN_ATTESTED";
  event_id: string;
  event_receipt_hash: string;
  issued_at: string;
}

export interface SemanticAttestationAuthority {
  verify(
    challenge: SemanticAttestationChallengeV1
  ): SemanticAttestationVerificationV1 | null;
}

export interface SemanticPreparationRequestV1 {
  schema_version: 1;
  scope: RevisionScope;
  source_event_ids: string[];
  requested_capabilities: SemanticCapability[];
  attestation_refs: SemanticAttestationRefV1[];
}

export interface SemanticRawEvidenceV1 {
  event: LedgerRawEvent;
  receipt: SemanticRawEvidenceReceiptV1;
  authority_class: "DIRECT_HUMAN_ATTESTED" | "UNATTESTED";
  attestation_refs: string[];
}

export interface SemanticFactViewV1 {
  fact_id: string;
  fact_revision: number;
  statement: string;
  epistemic_origin: CanonicalFactOrigin;
  verification_status: CanonicalFactVerificationStatus;
  lifecycle_status: CanonicalFactLifecycleStatus;
  record_status: CanonicalFactRecordStatus;
  provenance_event_ids: string[];
  verification_event_ids: string[];
  metadata: JsonObject;
}

export interface SemanticRelationViewV1 {
  relation_id: string;
  relation_revision: number;
  source: CanonicalRelationEndpoint;
  relation_type: CanonicalRelationType;
  target: CanonicalRelationEndpoint;
  origin: CanonicalFactOrigin;
  provenance_event_ids: string[];
  status: "active" | "retracted";
  metadata: JsonObject;
}

export interface SemanticContractConstraintsV1 {
  schema_version: 1;
  state_policy_hash: string;
  fact_relation_policy_hash: string;
  state_operations: ["CREATE", "REVISE", "TRANSITION"];
  fact_operations: ["ASSERT", "TRANSITION"];
  relation_operations: ["CREATE", "RETRACT"];
  producer_kinds: SemanticProducerKind[];
  create_identity: "CORE_DERIVED_SHA256";
  relation_new_state_endpoint: "FORBIDDEN_V1";
}

export interface SemanticInterpretationPreparationV1 extends RevisionScope {
  schema_version: 1;
  preparation_id: string;
  observed_revision_vector: RevisionVector;
  source_events: SemanticRawEvidenceV1[];
  current_projection: {
    state_items: CanonicalStateItem[];
    facts: SemanticFactViewV1[];
    relations: SemanticRelationViewV1[];
  };
  requested_capabilities: SemanticCapability[];
  verified_attestations: SemanticAttestationVerificationV1[];
  contract_constraints: SemanticContractConstraintsV1;
  projection_hash: string;
  created_at: string;
}

interface SemanticOperationEvidence {
  source_event_ids: string[];
  attestation_refs?: string[];
}

export interface SemanticStateCreateOperationV1 extends SemanticOperationEvidence {
  op: "CREATE";
  kind: CanonicalStateItemKind;
  content: string;
  metadata: JsonObject;
}

export interface SemanticStateReviseOperationV1 extends SemanticOperationEvidence {
  op: "REVISE";
  item_id: string;
  content: string;
  metadata: JsonObject;
}

export interface SemanticStateTransitionOperationV1 extends SemanticOperationEvidence {
  op: "TRANSITION";
  item_id: string;
  status: CanonicalStateItemStatus;
}

export type SemanticStateOperationV1 =
  | SemanticStateCreateOperationV1
  | SemanticStateReviseOperationV1
  | SemanticStateTransitionOperationV1;

export interface SemanticFactAssertOperationV1 extends SemanticOperationEvidence {
  op: "ASSERT";
  statement: string;
  metadata: JsonObject;
}

export interface SemanticFactTransitionOperationV1 extends SemanticOperationEvidence {
  op: "TRANSITION";
  fact_id: string;
  expected_fact_revision: number;
  lifecycle_status: CanonicalFactLifecycleStatus;
  record_status: CanonicalFactRecordStatus;
}

export type SemanticFactOperationV1 =
  | SemanticFactAssertOperationV1
  | SemanticFactTransitionOperationV1;

export type SemanticRelationEndpointSelectorV1 =
  | { kind: "RAW_EVENT"; event_id: string }
  | { kind: "FACT"; fact_id: string; fact_revision: number }
  | { kind: "STATE_ITEM"; item_id: string }
  | { kind: "PROPOSED_FACT"; fact_operation_index: number };

export interface SemanticRelationCreateOperationV1 extends SemanticOperationEvidence {
  op: "CREATE";
  source: SemanticRelationEndpointSelectorV1;
  relation_type: CanonicalRelationType;
  target: SemanticRelationEndpointSelectorV1;
  metadata: JsonObject;
}

export interface SemanticRelationRetractOperationV1 extends SemanticOperationEvidence {
  op: "RETRACT";
  relation_id: string;
  expected_relation_revision: number;
}

export type SemanticRelationOperationV1 =
  | SemanticRelationCreateOperationV1
  | SemanticRelationRetractOperationV1;

export interface SemanticProposalProducerV1 {
  kind: SemanticProducerKind;
  implementation_id: string;
  implementation_version: string;
  policy_version: string;
}

export interface SemanticProposalDiagnosticsV1 {
  rule_ids?: string[];
  confidence?: number;
  abstain_reason?: string;
}

export interface CanonicalSemanticProposalDraftV1 {
  schema_version: 1;
  scope: RevisionScope;
  preparation_id: string;
  producer: SemanticProposalProducerV1;
  observed: {
    revision_vector: RevisionVector;
    source_event_ids: string[];
  };
  disposition: SemanticProposalDisposition;
  changes: {
    state: SemanticStateOperationV1[];
    facts: SemanticFactOperationV1[];
    relations: SemanticRelationOperationV1[];
  };
  diagnostics?: SemanticProposalDiagnosticsV1;
}

export interface CanonicalSemanticProposalV1 extends CanonicalSemanticProposalDraftV1 {
  proposal_id: string;
}

export interface SemanticProposalApplyResultV1 extends RevisionScope {
  schema_version: 1;
  proposal_id: string;
  preparation_id: string;
  disposition: SemanticProposalDisposition;
  producer: SemanticProposalProducerV1;
  diagnostics?: SemanticProposalDiagnosticsV1;
  source_event_ids: string[];
  attestation_refs: string[];
  previous_revision_vector: RevisionVector;
  current_revision_vector: RevisionVector;
  state_commit?: CommittedCanonicalStateRevision;
  fact_relation_commit?: CanonicalFactRelationCommitResult;
  created_at: string;
}

export class SemanticFormationError extends Error {
  constructor(readonly code: SemanticFormationErrorCode) {
    super(code);
    this.name = "SemanticFormationError";
  }
}

const MAX_IDENTIFIER = 500;
const MAX_RECEIPT_REF = 2_000;
const MAX_TEXT = 10_000;
const MAX_EVENTS = 100;
const MAX_STATE_OPS = 100;
const MAX_FACT_OPS = 100;
const MAX_RELATION_OPS = 200;
const MAX_RULE_IDS = 100;
const MAX_PROJECTION_OBJECTS = 10_000;
const MAX_PREPARATION_BYTES = 4 * 1024 * 1024;
const MAX_PROPOSAL_BYTES = 2 * 1024 * 1024;
const MAX_JSON_STRING = MAX_PREPARATION_BYTES;
const ID_HASH_PATTERN = /^[a-f0-9]{64}$/u;

const POLICY_DESCRIPTOR: JsonObject = {
  policy_version: SEMANTIC_FORMATION_POLICY_VERSION,
  schema_version: SEMANTIC_FORMATION_SCHEMA_VERSION,
  evidence: "existing-canonical-raw-row-plus-ledger-marker-receipt",
  preparation: "immutable-five-axis-plus-projection-hash",
  proposal: "explicit-state-fact-relation-lanes",
  producer: "audit-only-no-authority",
  create_identity: "core-derived-sha256-scope-content-durable-events",
  attestation: "external-authority-capability-exact-raw-receipt-binding",
  replay: "proposal-preparation-and-event-terminal-uniqueness",
  transaction: "state-substrate-or-axis-neutral-single-handle",
  new_state_relation_endpoint: "forbidden-v1",
  context: "accepted-canonical-objects-only",
};

export const SEMANTIC_FORMATION_POLICY_HASH = sha256(canonicalJson(POLICY_DESCRIPTOR));

const CONTRACT_CONSTRAINTS: SemanticContractConstraintsV1 = {
  schema_version: 1,
  state_policy_hash: CANONICAL_STATE_POLICY_HASH,
  fact_relation_policy_hash: CANONICAL_FACT_RELATION_POLICY_HASH,
  state_operations: ["CREATE", "REVISE", "TRANSITION"],
  fact_operations: ["ASSERT", "TRANSITION"],
  relation_operations: ["CREATE", "RETRACT"],
  producer_kinds: [...SEMANTIC_PRODUCER_KINDS],
  create_identity: "CORE_DERIVED_SHA256",
  relation_new_state_endpoint: "FORBIDDEN_V1",
};

interface NormalizedPreparationRequest extends SemanticPreparationRequestV1 {
  request_json: string;
  request_fingerprint: string;
}

interface NormalizedProposal extends CanonicalSemanticProposalV1 {
  proposal_json: string;
  proposal_fingerprint: string;
  derived_proposal_id: string;
}

interface DomainPlan {
  state?: NormalizedCanonicalStateCommitInputInsideCore;
  factRelation?: NormalizedCanonicalFactRelationCommitInput;
  attestationRefs: string[];
}

interface PreparationRow extends Record<string, unknown> {
  namespace: string;
  stream_id: string;
  preparation_id: string;
  request_fingerprint: string;
  request_json: string;
  preparation_hash: string;
  preparation_json: string;
  created_at: string;
}

interface ProposalRow extends Record<string, unknown> {
  namespace: string;
  stream_id: string;
  proposal_id: string;
  preparation_id: string;
  request_fingerprint: string;
  request_json: string;
  previous_revision_vector_json: string;
  current_revision_vector_json: string;
  state_commit_id: string | null;
  fact_relation_commit_id: string | null;
  result_hash: string;
  result_json: string;
  created_at: string;
}

interface StreamRow extends Record<string, unknown> {
  namespace: string;
  stream_id: string;
  ledger_revision: number;
  state_revision: number;
  raw_frontier_revision: number;
  frontier_position: number;
  takeover_commit_revision: number;
}

const SCHEMA_OBJECTS = [
  {
    type: "table",
    name: "cc_semantic_formation_schema",
    sql: `CREATE TABLE cc_semantic_formation_schema (
      version INTEGER PRIMARY KEY CHECK (version = 1),
      completed_at TEXT NOT NULL
    )`,
  },
  {
    type: "table",
    name: "cc_semantic_preparations",
    sql: `CREATE TABLE cc_semantic_preparations (
      namespace TEXT NOT NULL,
      stream_id TEXT NOT NULL,
      preparation_id TEXT NOT NULL CHECK (
        length(preparation_id) = 71 AND substr(preparation_id, 1, 7) = 'sfprep-'
      ),
      request_fingerprint TEXT NOT NULL CHECK (length(request_fingerprint) = 64),
      request_json TEXT NOT NULL CHECK (json_valid(request_json)),
      preparation_hash TEXT NOT NULL CHECK (length(preparation_hash) = 64),
      preparation_json TEXT NOT NULL CHECK (json_valid(preparation_json)),
      created_at TEXT NOT NULL,
      PRIMARY KEY (namespace, stream_id, preparation_id),
      FOREIGN KEY (namespace, stream_id)
        REFERENCES cc_revision_streams(namespace, stream_id)
    )`,
  },
  {
    type: "table",
    name: "cc_semantic_proposal_commits",
    sql: `CREATE TABLE cc_semantic_proposal_commits (
      namespace TEXT NOT NULL,
      stream_id TEXT NOT NULL,
      proposal_id TEXT NOT NULL CHECK (
        length(proposal_id) = 71 AND substr(proposal_id, 1, 7) = 'sfprop-'
      ),
      preparation_id TEXT NOT NULL,
      request_fingerprint TEXT NOT NULL CHECK (length(request_fingerprint) = 64),
      request_json TEXT NOT NULL CHECK (json_valid(request_json)),
      previous_revision_vector_json TEXT NOT NULL CHECK (
        json_valid(previous_revision_vector_json)
      ),
      current_revision_vector_json TEXT NOT NULL CHECK (
        json_valid(current_revision_vector_json)
      ),
      state_commit_id TEXT,
      fact_relation_commit_id TEXT,
      result_hash TEXT NOT NULL CHECK (length(result_hash) = 64),
      result_json TEXT NOT NULL CHECK (json_valid(result_json)),
      created_at TEXT NOT NULL,
      PRIMARY KEY (namespace, stream_id, proposal_id),
      UNIQUE (namespace, stream_id, preparation_id),
      FOREIGN KEY (namespace, stream_id, preparation_id)
        REFERENCES cc_semantic_preparations(namespace, stream_id, preparation_id)
    )`,
  },
  {
    type: "table",
    name: "cc_semantic_proposal_events",
    sql: `CREATE TABLE cc_semantic_proposal_events (
      namespace TEXT NOT NULL,
      stream_id TEXT NOT NULL,
      event_id TEXT NOT NULL,
      proposal_id TEXT NOT NULL,
      preparation_id TEXT NOT NULL,
      PRIMARY KEY (namespace, stream_id, event_id),
      FOREIGN KEY (namespace, stream_id, proposal_id)
        REFERENCES cc_semantic_proposal_commits(namespace, stream_id, proposal_id)
        DEFERRABLE INITIALLY DEFERRED
    )`,
  },
  ...[
    ["cc_semantic_formation_schema_no_update", "cc_semantic_formation_schema", "UPDATE",
      "semantic formation schema is immutable"],
    ["cc_semantic_formation_schema_no_delete", "cc_semantic_formation_schema", "DELETE",
      "semantic formation schema is append-only"],
    ["cc_semantic_preparations_no_update", "cc_semantic_preparations", "UPDATE",
      "semantic preparations are immutable"],
    ["cc_semantic_preparations_no_delete", "cc_semantic_preparations", "DELETE",
      "semantic preparations are append-only"],
    ["cc_semantic_proposal_commits_no_update", "cc_semantic_proposal_commits", "UPDATE",
      "semantic proposal commits are immutable"],
    ["cc_semantic_proposal_commits_no_delete", "cc_semantic_proposal_commits", "DELETE",
      "semantic proposal commits are append-only"],
    ["cc_semantic_proposal_events_no_update", "cc_semantic_proposal_events", "UPDATE",
      "semantic proposal event bindings are immutable"],
    ["cc_semantic_proposal_events_no_delete", "cc_semantic_proposal_events", "DELETE",
      "semantic proposal event bindings are append-only"],
  ].map(([name, table, operation, message]) => ({
    type: "trigger",
    name: name!,
    sql: `CREATE TRIGGER ${name} BEFORE ${operation} ON ${table}
      BEGIN SELECT RAISE(ABORT, '${message}'); END`,
  })),
] as const;

/** @internal Fixed Core-owned Semantic Formation preparation/apply coordinator. */
export class SqliteSemanticFormationStore {
  readonly #database: DatabaseSync;
  readonly #revisionSubstrate: SqliteRevisionSubstrate;
  #closed = false;
  #transactionOpen = false;

  constructor(databasePath: string, revisionSubstrate: SqliteRevisionSubstrate) {
    if (typeof databasePath !== "string" || databasePath.length === 0 ||
        !(revisionSubstrate instanceof SqliteRevisionSubstrate)) invalid();
    let database: DatabaseSync | undefined;
    try {
      if (databasePath !== ":memory:") mkdirSync(dirname(databasePath), { recursive: true });
      database = new DatabaseSync(databasePath);
      initializeSqliteConnection(database, databasePath, () => migrateSemanticFormation(database!));
      this.#database = database;
      this.#revisionSubstrate = revisionSubstrate;
    } catch (error) {
      try { database?.close(); } catch { /* preserve startup failure */ }
      if (error instanceof SemanticFormationError && error.code === "INVALID_INPUT") throw error;
      throw new SemanticFormationError("STORAGE_FAILURE");
    }
  }

  prepare(
    input: SemanticPreparationRequestV1,
    authority?: SemanticAttestationAuthority
  ): SemanticInterpretationPreparationV1 {
    this.#assertOpen();
    const normalized = normalizePreparationRequest(input);
    const verifications = this.#verifyAttestations(normalized, authority);
    if (this.#transactionOpen) conflict();
    try {
      this.#database.exec("BEGIN IMMEDIATE;");
      this.#transactionOpen = true;
      const observed = readVector(this.#database, normalized.scope);
      const receipts = readLedgerRawEventReceiptsInsideCore(
        this.#database,
        normalized.scope,
        normalized.source_event_ids,
        observed
      );
      assertVerificationBindings(verifications, normalized.attestation_refs, receipts);
      const state = readCanonicalStateProjectionInsideCore(
        this.#database,
        normalized.scope,
        observed
      );
      const factsAndRelations = readCanonicalFactRelationProjectionInsideCore(
        this.#database,
        normalized.scope,
        observed
      );
      const objectCount = state.state.items.length + factsAndRelations.facts.length +
        factsAndRelations.relations.length;
      if (objectCount > MAX_PROJECTION_OBJECTS) invalid();
      const projection = publicProjection(state, factsAndRelations);
      const sourceEvents = publicEvidence(receipts, verifications);
      const identityBase: JsonObject = {
        request: parseJson(normalized.request_json) as JsonObject,
        observed_revision_vector: vectorAsJson(observed),
        source_events: sourceEvents.map(evidenceAsJson),
        current_projection: projectionAsJson(projection),
        verified_attestations: verifications.map(attestationAsJson),
        contract_constraints: constraintsAsJson(CONTRACT_CONSTRAINTS),
      };
      const preparationId = `sfprep-${sha256(canonicalJson(identityBase))}`;
      const existing = readPreparationRow(this.#database, normalized.scope, preparationId);
      if (existing !== undefined) {
        if (existing.request_json !== normalized.request_json ||
            storedHash(existing.request_fingerprint) !== normalized.request_fingerprint) conflict();
        const replay = readPreparationInsideCore(this.#database, normalized.scope, preparationId);
        this.#database.exec("COMMIT;");
        this.#transactionOpen = false;
        return replay;
      }
      const createdAt = new Date().toISOString();
      const projectionHash = sha256(canonicalJson(projectionAsJson(projection)));
      const preparation: SemanticInterpretationPreparationV1 = {
        schema_version: 1,
        ...normalized.scope,
        preparation_id: preparationId,
        observed_revision_vector: cloneVector(observed),
        source_events: sourceEvents,
        current_projection: projection,
        requested_capabilities: [...normalized.requested_capabilities],
        verified_attestations: verifications.map(cloneAttestation),
        contract_constraints: cloneConstraints(CONTRACT_CONSTRAINTS),
        projection_hash: projectionHash,
        created_at: createdAt,
      };
      const preparationJson = canonicalJson(preparationAsJson(preparation));
      if (Buffer.byteLength(preparationJson, "utf8") > MAX_PREPARATION_BYTES) invalid();
      this.#database.prepare(
        `INSERT INTO cc_semantic_preparations (
           namespace, stream_id, preparation_id, request_fingerprint, request_json,
           preparation_hash, preparation_json, created_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        normalized.scope.namespace,
        normalized.scope.stream_id,
        preparationId,
        normalized.request_fingerprint,
        normalized.request_json,
        sha256(preparationJson),
        preparationJson,
        createdAt
      );
      const result = readPreparationInsideCore(this.#database, normalized.scope, preparationId);
      this.#database.exec("COMMIT;");
      this.#transactionOpen = false;
      return result;
    } catch (error) {
      rollback(this.#database);
      throw mapError(error);
    } finally {
      this.#transactionOpen = false;
    }
  }

  readPreparation(
    scope: RevisionScope,
    preparationId: string
  ): SemanticInterpretationPreparationV1 {
    this.#assertOpen();
    const normalizedScope = normalizeScope(scope);
    const normalizedId = validatePrefixedHash(preparationId, "sfprep-");
    return this.#readTransaction(() =>
      readPreparationInsideCore(this.#database, normalizedScope, normalizedId));
  }

  apply(proposalInput: CanonicalSemanticProposalV1): SemanticProposalApplyResultV1 {
    this.#assertOpen();
    const proposal = normalizeProposal(proposalInput, false);
    const existing = this.#readTransaction(() =>
      readProposalRow(this.#database, proposal.scope, proposal.proposal_id));
    if (existing !== undefined) {
      if (existing.request_json !== proposal.proposal_json ||
          storedHash(existing.request_fingerprint) !== proposal.proposal_fingerprint) conflict();
      return this.readResult(proposal.scope, proposal.proposal_id);
    }
    if (proposal.proposal_id !== proposal.derived_proposal_id) invalid();
    const preparation = this.readPreparation(proposal.scope, proposal.preparation_id);
    assertProposalPreparationBinding(proposal, preparation);
    let plan: DomainPlan;
    try {
      plan = buildDomainPlan(proposal, preparation);
    } catch (error) {
      throw mapError(error);
    }
    if (plan.state !== undefined) {
      try {
        commitStateRevisionInsideCore(
          this.#revisionSubstrate,
          {
            scope: plan.state.scope,
            commit_id: plan.state.state_commit_id,
            kind: "CANONICAL_STATE_COMMIT_V1",
            expected_state_revision: plan.state.expected_state_revision,
            request: plan.state.request,
          },
          ({ previous, current, database }) => {
            assertProposalEventsAvailable(database, proposal);
            if (!sameVector(previous, preparation.observed_revision_vector)) conflict();
            assertCurrentFactRelationProjection(
              database,
              preparation,
              previous
            );
            const stateCommit = applyCanonicalStateInsideCore(
              database,
              plan.state!,
              previous,
              current
            );
            const factRelationCommit = plan.factRelation === undefined
              ? undefined
              : applyCanonicalFactRelationInsideCore(database, plan.factRelation, previous);
            const result = buildApplyResult(
              proposal,
              preparation,
              plan,
              previous,
              current,
              stateCommit,
              factRelationCommit
            );
            insertProposalInsideCore(database, proposal, result, plan);
            return committedStateAsMarkerJson(stateCommit);
          }
        );
      } catch (error) {
        throw mapError(error);
      }
      return this.readResult(proposal.scope, proposal.proposal_id);
    }
    if (this.#transactionOpen) conflict();
    try {
      this.#database.exec("BEGIN IMMEDIATE;");
      this.#transactionOpen = true;
      const replay = readProposalRow(this.#database, proposal.scope, proposal.proposal_id);
      if (replay !== undefined) {
        if (replay.request_json !== proposal.proposal_json ||
            storedHash(replay.request_fingerprint) !== proposal.proposal_fingerprint) conflict();
        const result = readResultInsideCore(this.#database, proposal.scope, proposal.proposal_id);
        this.#database.exec("COMMIT;");
        this.#transactionOpen = false;
        return result;
      }
      const observed = readVector(this.#database, proposal.scope);
      assertProposalEventsAvailable(this.#database, proposal);
      if (!sameVector(observed, preparation.observed_revision_vector)) conflict();
      assertCurrentFactRelationProjection(this.#database, preparation, observed);
      const factRelationCommit = plan.factRelation === undefined
        ? undefined
        : applyCanonicalFactRelationInsideCore(this.#database, plan.factRelation, observed);
      const result = buildApplyResult(
        proposal,
        preparation,
        plan,
        observed,
        observed,
        undefined,
        factRelationCommit
      );
      insertProposalInsideCore(this.#database, proposal, result, plan);
      if (!sameVector(readVector(this.#database, proposal.scope), observed)) corrupt();
      const persisted = readResultInsideCore(this.#database, proposal.scope, proposal.proposal_id);
      this.#database.exec("COMMIT;");
      this.#transactionOpen = false;
      return persisted;
    } catch (error) {
      rollback(this.#database);
      throw mapError(error);
    } finally {
      this.#transactionOpen = false;
    }
  }

  readResult(scope: RevisionScope, proposalId: string): SemanticProposalApplyResultV1 {
    this.#assertOpen();
    const normalizedScope = normalizeScope(scope);
    const normalizedId = validatePrefixedHash(proposalId, "sfprop-");
    return this.#readTransaction(() =>
      readResultInsideCore(this.#database, normalizedScope, normalizedId));
  }

  close(): void {
    if (this.#closed) return;
    if (this.#transactionOpen) conflict();
    try {
      this.#database.close();
      this.#closed = true;
    } catch {
      storageFailure();
    }
  }

  #verifyAttestations(
    request: NormalizedPreparationRequest,
    authority?: SemanticAttestationAuthority
  ): SemanticAttestationVerificationV1[] {
    if (request.attestation_refs.length === 0) return [];
    if (authority === undefined || typeof authority.verify !== "function") attestationRejected();
    let receipts: LedgerRawEventReceiptInsideCore[];
    try {
      this.#database.exec("BEGIN;");
      const observed = readVector(this.#database, request.scope);
      receipts = readLedgerRawEventReceiptsInsideCore(
        this.#database,
        request.scope,
        request.source_event_ids,
        observed
      );
      this.#database.exec("COMMIT;");
    } catch (error) {
      rollback(this.#database);
      throw mapError(error);
    }
    const byEvent = new Map(receipts.map((receipt) => [receipt.event.event_id, receipt]));
    return request.attestation_refs.map((ref) => {
      const receipt = byEvent.get(ref.event_id);
      if (receipt === undefined) attestationRejected();
      const challenge: SemanticAttestationChallengeV1 = {
        schema_version: 1,
        receipt_ref: ref.receipt_ref,
        evidence_receipt: publicReceipt(receipt),
      };
      let value: SemanticAttestationVerificationV1 | null;
      try {
        value = authority.verify(cloneChallenge(challenge));
      } catch {
        attestationRejected();
      }
      if (value === null) attestationRejected();
      const verified = normalizeAttestation(value);
      if (
        verified.receipt_ref !== ref.receipt_ref ||
        verified.namespace !== request.scope.namespace ||
        verified.stream_id !== request.scope.stream_id ||
        verified.event_id !== ref.event_id ||
        verified.event_receipt_hash !== receipt.receipt_hash
      ) {
        attestationRejected();
      }
      return verified;
    });
  }

  #readTransaction<T>(operation: () => T): T {
    if (this.#transactionOpen) conflict();
    try {
      this.#database.exec("BEGIN;");
      this.#transactionOpen = true;
      const result = operation();
      this.#database.exec("COMMIT;");
      return result;
    } catch (error) {
      rollback(this.#database);
      throw mapError(error);
    } finally {
      this.#transactionOpen = false;
    }
  }

  #assertOpen(): void {
    if (this.#closed) throw new SemanticFormationError("CLOSED");
  }
}

export function createCanonicalSemanticProposalV1(
  draft: CanonicalSemanticProposalDraftV1
): CanonicalSemanticProposalV1 {
  const normalizedDraft = normalizeProposalDraft(draft);
  const proposalId = `sfprop-${sha256(canonicalJson(proposalDraftAsJson(normalizedDraft)))}`;
  return parseCanonicalSemanticProposalV1({ ...normalizedDraft, proposal_id: proposalId });
}

export function parseSemanticPreparationRequestV1(
  value: unknown
): SemanticPreparationRequestV1 {
  const normalized = normalizePreparationRequest(value);
  return {
    schema_version: 1,
    scope: { ...normalized.scope },
    source_event_ids: [...normalized.source_event_ids],
    requested_capabilities: [...normalized.requested_capabilities],
    attestation_refs: normalized.attestation_refs.map((ref) => ({ ...ref })),
  };
}

export function parseCanonicalSemanticProposalV1(
  value: unknown
): CanonicalSemanticProposalV1 {
  const proposal = normalizeProposal(value, true);
  return cloneProposal(proposal);
}

/** @internal Core-owned formation consumers may verify one immutable result in their transaction. */
export function readSemanticProposalResultInsideCore(
  database: DatabaseSync,
  scope: RevisionScope,
  proposalId: string
): SemanticProposalApplyResultV1 {
  return readResultInsideCore(database, normalizeScope(scope), validatePrefixedHash(proposalId, "sfprop-"));
}

function normalizePreparationRequest(value: unknown): NormalizedPreparationRequest {
  const object = readExactObject(value, [
    "schema_version", "scope", "source_event_ids", "requested_capabilities",
    "attestation_refs",
  ]);
  if (object.schema_version !== 1) invalid();
  const scope = normalizeScope(object.scope);
  const sourceEventIds = normalizeIdentifierSet(object.source_event_ids, 1, MAX_EVENTS);
  const requestedCapabilities = normalizeEnumSet(
    object.requested_capabilities,
    SEMANTIC_CAPABILITIES,
    0,
    SEMANTIC_CAPABILITIES.length
  ) as SemanticCapability[];
  const attestationRefs = normalizeAttestationRefs(object.attestation_refs, sourceEventIds);
  const request: SemanticPreparationRequestV1 = {
    schema_version: 1,
    scope,
    source_event_ids: sourceEventIds,
    requested_capabilities: requestedCapabilities,
    attestation_refs: attestationRefs,
  };
  const requestJson = canonicalJson(preparationRequestAsJson(request));
  return {
    ...request,
    request_json: requestJson,
    request_fingerprint: sha256(requestJson),
  };
}

function normalizeProposal(value: unknown, requireDerivedId: boolean): NormalizedProposal {
  const object = readExactObject(value, [
    "schema_version", "proposal_id", "scope", "preparation_id", "producer",
    "observed", "disposition", "changes", "diagnostics",
  ], [
    "schema_version", "proposal_id", "scope", "preparation_id", "producer",
    "observed", "disposition", "changes",
  ]);
  const proposalId = validatePrefixedHash(object.proposal_id, "sfprop-");
  const draft = normalizeProposalDraft({
    schema_version: object.schema_version,
    scope: object.scope,
    preparation_id: object.preparation_id,
    producer: object.producer,
    observed: object.observed,
    disposition: object.disposition,
    changes: object.changes,
    ...(object.diagnostics === undefined ? {} : { diagnostics: object.diagnostics }),
  });
  const draftJson = canonicalJson(proposalDraftAsJson(draft));
  const derived = `sfprop-${sha256(draftJson)}`;
  if (requireDerivedId && proposalId !== derived) invalid();
  const proposal: CanonicalSemanticProposalV1 = { ...draft, proposal_id: proposalId };
  const proposalJson = canonicalJson(proposalAsJson(proposal));
  if (Buffer.byteLength(proposalJson, "utf8") > MAX_PROPOSAL_BYTES) invalid();
  return {
    ...proposal,
    proposal_json: proposalJson,
    proposal_fingerprint: sha256(proposalJson),
    derived_proposal_id: derived,
  };
}

function normalizeProposalDraft(value: unknown): CanonicalSemanticProposalDraftV1 {
  const object = readExactObject(value, [
    "schema_version", "scope", "preparation_id", "producer", "observed",
    "disposition", "changes", "diagnostics",
  ], [
    "schema_version", "scope", "preparation_id", "producer", "observed",
    "disposition", "changes",
  ]);
  if (object.schema_version !== 1) invalid();
  const scope = normalizeScope(object.scope);
  const preparationId = validatePrefixedHash(object.preparation_id, "sfprep-");
  const producer = normalizeProducer(object.producer);
  const observedObject = readExactObject(object.observed, [
    "revision_vector", "source_event_ids",
  ]);
  const observed = {
    revision_vector: normalizeVector(observedObject.revision_vector, scope),
    source_event_ids: normalizeIdentifierSet(observedObject.source_event_ids, 1, MAX_EVENTS),
  };
  const disposition = object.disposition;
  if (typeof disposition !== "string" ||
      !SEMANTIC_PROPOSAL_DISPOSITIONS.includes(disposition as SemanticProposalDisposition)) {
    invalid();
  }
  const changesObject = readExactObject(object.changes, ["state", "facts", "relations"]);
  const changes = {
    state: normalizeStateOperations(changesObject.state),
    facts: normalizeFactOperations(changesObject.facts),
    relations: normalizeRelationOperations(changesObject.relations),
  };
  if (disposition === "ABSTAINED" &&
      (changes.state.length > 0 || changes.facts.length > 0 || changes.relations.length > 0)) {
    invalid();
  }
  const diagnostics = object.diagnostics === undefined
    ? undefined
    : normalizeDiagnostics(object.diagnostics);
  return {
    schema_version: 1,
    scope,
    preparation_id: preparationId,
    producer,
    observed,
    disposition: disposition as SemanticProposalDisposition,
    changes,
    ...(diagnostics === undefined ? {} : { diagnostics }),
  };
}

function normalizeProducer(value: unknown): SemanticProposalProducerV1 {
  const object = readExactObject(value, [
    "kind", "implementation_id", "implementation_version", "policy_version",
  ]);
  if (typeof object.kind !== "string" ||
      !SEMANTIC_PRODUCER_KINDS.includes(object.kind as SemanticProducerKind)) invalid();
  return {
    kind: object.kind as SemanticProducerKind,
    implementation_id: validateIdentifier(object.implementation_id),
    implementation_version: validateIdentifier(object.implementation_version),
    policy_version: validateIdentifier(object.policy_version),
  };
}

function normalizeDiagnostics(value: unknown): SemanticProposalDiagnosticsV1 {
  const object = readExactObject(value, ["rule_ids", "confidence", "abstain_reason"], []);
  const result: SemanticProposalDiagnosticsV1 = {};
  if (object.rule_ids !== undefined) {
    result.rule_ids = normalizeIdentifierSet(object.rule_ids, 0, MAX_RULE_IDS);
  }
  if (object.confidence !== undefined) {
    if (typeof object.confidence !== "number" || !Number.isFinite(object.confidence) ||
        object.confidence < 0 || object.confidence > 1 || Object.is(object.confidence, -0)) {
      invalid();
    }
    result.confidence = object.confidence;
  }
  if (object.abstain_reason !== undefined) {
    result.abstain_reason = validateText(object.abstain_reason, MAX_RECEIPT_REF);
  }
  return result;
}

function normalizeStateOperations(value: unknown): SemanticStateOperationV1[] {
  const array = readDenseArray(value, MAX_STATE_OPS);
  return array.map((entry) => {
    const discriminator = readDiscriminator(entry);
    if (discriminator === "CREATE") {
      const object = readExactObject(entry, [
        "op", "kind", "content", "metadata", "source_event_ids", "attestation_refs",
      ], ["op", "kind", "content", "metadata", "source_event_ids"]);
      if (typeof object.kind !== "string" ||
          !CANONICAL_STATE_ITEM_KINDS.includes(object.kind as CanonicalStateItemKind)) invalid();
      return {
        op: "CREATE",
        kind: object.kind as CanonicalStateItemKind,
        content: validateText(object.content, MAX_TEXT),
        metadata: normalizeMetadata(object.metadata),
        ...normalizeOperationEvidence(object),
      };
    }
    if (discriminator === "REVISE") {
      const object = readExactObject(entry, [
        "op", "item_id", "content", "metadata", "source_event_ids", "attestation_refs",
      ], ["op", "item_id", "content", "metadata", "source_event_ids"]);
      return {
        op: "REVISE",
        item_id: validateIdentifier(object.item_id),
        content: validateText(object.content, MAX_TEXT),
        metadata: normalizeMetadata(object.metadata),
        ...normalizeOperationEvidence(object),
      };
    }
    if (discriminator === "TRANSITION") {
      const object = readExactObject(entry, [
        "op", "item_id", "status", "source_event_ids", "attestation_refs",
      ], ["op", "item_id", "status", "source_event_ids"]);
      if (typeof object.status !== "string") invalid();
      return {
        op: "TRANSITION",
        item_id: validateIdentifier(object.item_id),
        status: object.status as CanonicalStateItemStatus,
        ...normalizeOperationEvidence(object),
      };
    }
    invalid();
  });
}

function normalizeFactOperations(value: unknown): SemanticFactOperationV1[] {
  const array = readDenseArray(value, MAX_FACT_OPS);
  return array.map((entry) => {
    const discriminator = readDiscriminator(entry);
    if (discriminator === "ASSERT") {
      const object = readExactObject(entry, [
        "op", "statement", "metadata", "source_event_ids", "attestation_refs",
      ], ["op", "statement", "metadata", "source_event_ids"]);
      return {
        op: "ASSERT",
        statement: validateText(object.statement, MAX_TEXT),
        metadata: normalizeMetadata(object.metadata),
        ...normalizeOperationEvidence(object),
      };
    }
    if (discriminator === "TRANSITION") {
      const object = readExactObject(entry, [
        "op", "fact_id", "expected_fact_revision", "lifecycle_status", "record_status",
        "source_event_ids", "attestation_refs",
      ], [
        "op", "fact_id", "expected_fact_revision", "lifecycle_status", "record_status",
        "source_event_ids",
      ]);
      if (!Number.isSafeInteger(object.expected_fact_revision) ||
          (object.expected_fact_revision as number) < 1) invalid();
      if (typeof object.lifecycle_status !== "string" ||
          !["active", "superseded", "retracted"].includes(object.lifecycle_status)) invalid();
      if (typeof object.record_status !== "string" ||
          !["live", "archived"].includes(object.record_status)) invalid();
      return {
        op: "TRANSITION",
        fact_id: validateIdentifier(object.fact_id),
        expected_fact_revision: object.expected_fact_revision as number,
        lifecycle_status: object.lifecycle_status as CanonicalFactLifecycleStatus,
        record_status: object.record_status as CanonicalFactRecordStatus,
        ...normalizeOperationEvidence(object),
      };
    }
    invalid();
  });
}

function normalizeRelationOperations(value: unknown): SemanticRelationOperationV1[] {
  const array = readDenseArray(value, MAX_RELATION_OPS);
  return array.map((entry) => {
    const discriminator = readDiscriminator(entry);
    if (discriminator === "CREATE") {
      const object = readExactObject(entry, [
        "op", "source", "relation_type", "target", "metadata", "source_event_ids",
        "attestation_refs",
      ], ["op", "source", "relation_type", "target", "metadata", "source_event_ids"]);
      if (typeof object.relation_type !== "string" || ![
        "SUPPORTS", "CONTRADICTS", "SUPERSEDES", "RETRACTS", "DERIVED_FROM",
        "DEPENDS_ON", "RESOLVES",
      ].includes(object.relation_type)) invalid();
      return {
        op: "CREATE",
        source: normalizeRelationEndpointSelector(object.source),
        relation_type: object.relation_type as CanonicalRelationType,
        target: normalizeRelationEndpointSelector(object.target),
        metadata: normalizeMetadata(object.metadata),
        ...normalizeOperationEvidence(object),
      };
    }
    if (discriminator === "RETRACT") {
      const object = readExactObject(entry, [
        "op", "relation_id", "expected_relation_revision", "source_event_ids",
        "attestation_refs",
      ], ["op", "relation_id", "expected_relation_revision", "source_event_ids"]);
      if (!Number.isSafeInteger(object.expected_relation_revision) ||
          (object.expected_relation_revision as number) < 1) invalid();
      return {
        op: "RETRACT",
        relation_id: validateIdentifier(object.relation_id),
        expected_relation_revision: object.expected_relation_revision as number,
        ...normalizeOperationEvidence(object),
      };
    }
    invalid();
  });
}

function normalizeRelationEndpointSelector(value: unknown): SemanticRelationEndpointSelectorV1 {
  const base = readExactObject(value, [
    "kind", "event_id", "fact_id", "fact_revision", "item_id", "fact_operation_index",
  ], ["kind"]);
  switch (base.kind) {
    case "RAW_EVENT":
      assertOnlyPresent(base, ["kind", "event_id"]);
      return { kind: "RAW_EVENT", event_id: validateIdentifier(base.event_id) };
    case "FACT":
      assertOnlyPresent(base, ["kind", "fact_id", "fact_revision"]);
      if (!Number.isSafeInteger(base.fact_revision) || (base.fact_revision as number) < 1) invalid();
      return {
        kind: "FACT",
        fact_id: validateIdentifier(base.fact_id),
        fact_revision: base.fact_revision as number,
      };
    case "STATE_ITEM":
      assertOnlyPresent(base, ["kind", "item_id"]);
      return { kind: "STATE_ITEM", item_id: validateIdentifier(base.item_id) };
    case "PROPOSED_FACT":
      assertOnlyPresent(base, ["kind", "fact_operation_index"]);
      if (!Number.isSafeInteger(base.fact_operation_index) ||
          (base.fact_operation_index as number) < 0) invalid();
      return { kind: "PROPOSED_FACT", fact_operation_index: base.fact_operation_index as number };
    default: invalid();
  }
}

function normalizeOperationEvidence(
  object: Record<string, unknown>
): Pick<SemanticOperationEvidence, "source_event_ids" | "attestation_refs"> {
  const sourceEventIds = normalizeIdentifierSet(object.source_event_ids, 1, MAX_EVENTS);
  const attestationRefs = object.attestation_refs === undefined
    ? undefined
    : normalizeTextSet(object.attestation_refs, 0, MAX_EVENTS, MAX_RECEIPT_REF);
  return {
    source_event_ids: sourceEventIds,
    ...(attestationRefs === undefined ? {} : { attestation_refs: attestationRefs }),
  };
}

function assertProposalPreparationBinding(
  proposal: NormalizedProposal,
  preparation: SemanticInterpretationPreparationV1
): void {
  if (!sameScope(proposal.scope, preparation) ||
      proposal.preparation_id !== preparation.preparation_id ||
      !sameVector(proposal.observed.revision_vector, preparation.observed_revision_vector) ||
      !sameStrings(proposal.observed.source_event_ids,
        preparation.source_events.map((entry) => entry.event.event_id).sort())) conflict();
  const requested = new Set(preparation.requested_capabilities);
  if ((proposal.changes.state.length > 0 && !requested.has("STATE")) ||
      (proposal.changes.facts.length > 0 && !requested.has("FACT")) ||
      (proposal.changes.relations.length > 0 && !requested.has("RELATION"))) invalid();
}

function buildDomainPlan(
  proposal: NormalizedProposal,
  preparation: SemanticInterpretationPreparationV1
): DomainPlan {
  const eventMap = new Map(preparation.source_events.map((entry) => [entry.event.event_id, entry]));
  const attestationMap = new Map(
    preparation.verified_attestations.map((entry) => [entry.receipt_ref, entry])
  );
  const stateMap = new Map(
    preparation.current_projection.state_items.map((item) => [item.item_id, cloneStateItem(item)])
  );
  const factMap = new Map(preparation.current_projection.facts.map((fact) => [fact.fact_id, fact]));
  const relationMap = new Map(
    preparation.current_projection.relations.map((relation) => [relation.relation_id, relation])
  );
  const usedAttestations = new Set<string>();
  const seenState = new Set<string>();
  const stateItems: CanonicalStateItem[] = [];
  for (const operation of proposal.changes.state) {
    const evidence = validateOperationEvidence(operation, eventMap, attestationMap);
    evidence.attestationRefs.forEach((ref) => usedAttestations.add(ref));
    if (operation.op === "CREATE") {
      const itemId = deriveObjectId("sfi-", {
        scope: scopeAsJson(proposal.scope),
        kind: operation.kind,
        content: operation.content,
        source_event_ids: operation.source_event_ids,
        attestation_refs: evidence.attestationRefs,
        metadata: operation.metadata,
      });
      if (seenState.has(itemId) || stateMap.has(itemId)) conflict();
      seenState.add(itemId);
      stateItems.push({
        item_id: itemId,
        kind: operation.kind,
        content: operation.content,
        status: initialStateStatus(operation.kind),
        source_event_ids: [...operation.source_event_ids],
        metadata: authorityMetadata(operation.metadata, evidence.attestationRefs),
      });
      continue;
    }
    const current = stateMap.get(operation.item_id);
    if (current === undefined || seenState.has(operation.item_id)) conflict();
    seenState.add(operation.item_id);
    stateItems.push({
      ...current,
      content: operation.op === "REVISE" ? operation.content : current.content,
      status: operation.op === "TRANSITION" ? operation.status : current.status,
      source_event_ids: unionStrings(current.source_event_ids, operation.source_event_ids),
      metadata: operation.op === "REVISE"
        ? authorityMetadata(operation.metadata, evidence.attestationRefs)
        : mergeAuthorityMetadata(current.metadata, evidence.attestationRefs),
    });
  }
  stateItems.sort((left, right) => compareText(left.item_id, right.item_id));
  const state = stateItems.length === 0 ? undefined : normalizeCanonicalStateInputInsideCore({
    scope: proposal.scope,
    state_commit_id: deriveObjectId("sfs-", { proposal_id: proposal.proposal_id }),
    commit_mode: "immediate_authority",
    expected_state_revision: preparation.observed_revision_vector.state_revision,
    proposal: { schema_version: 1, upsert_items: stateItems },
    policy_hash: CANONICAL_STATE_POLICY_HASH,
    provenance_event_ids: uniqueSorted(stateItems.flatMap((item) => item.source_event_ids)),
  });

  const factProposals: Array<Record<string, unknown>> = [];
  const proposedFactIds = new Map<number, string>();
  const seenFacts = new Set<string>();
  proposal.changes.facts.forEach((operation, index) => {
    const evidence = validateOperationEvidence(operation, eventMap, attestationMap);
    evidence.attestationRefs.forEach((ref) => usedAttestations.add(ref));
    if (operation.op === "ASSERT") {
      const factId = deriveObjectId("sff-", {
        scope: scopeAsJson(proposal.scope),
        statement: operation.statement,
        source_event_ids: operation.source_event_ids,
        attestation_refs: evidence.attestationRefs,
        metadata: operation.metadata,
      });
      if (seenFacts.has(factId) || factMap.has(factId)) conflict();
      seenFacts.add(factId);
      proposedFactIds.set(index, factId);
      factProposals.push({
        op: "CREATE",
        fact_id: factId,
        statement: operation.statement,
        epistemic_origin: deriveOrigin(operation.source_event_ids, eventMap),
        verification_status: "unverified",
        lifecycle_status: "active",
        record_status: "live",
        provenance_event_ids: [...operation.source_event_ids],
        verification_event_ids: [],
        metadata: authorityMetadata(operation.metadata, evidence.attestationRefs),
      });
      return;
    }
    const current = factMap.get(operation.fact_id);
    if (current === undefined || current.fact_revision !== operation.expected_fact_revision ||
        seenFacts.has(operation.fact_id)) conflict();
    seenFacts.add(operation.fact_id);
    factProposals.push({
      op: "REVISE",
      fact_id: operation.fact_id,
      expected_fact_revision: operation.expected_fact_revision,
      verification_status: current.verification_status,
      lifecycle_status: operation.lifecycle_status,
      record_status: operation.record_status,
      provenance_event_ids: unionStrings(current.provenance_event_ids, operation.source_event_ids),
      verification_event_ids: [...current.verification_event_ids],
    });
  });

  const relationProposals: Array<Record<string, unknown>> = [];
  const seenRelations = new Set<string>();
  for (const operation of proposal.changes.relations) {
    const evidence = validateOperationEvidence(operation, eventMap, attestationMap);
    evidence.attestationRefs.forEach((ref) => usedAttestations.add(ref));
    if (operation.op === "CREATE") {
      const source = resolveRelationEndpoint(
        operation.source,
        eventMap,
        stateMap,
        factMap,
        proposedFactIds
      );
      const target = resolveRelationEndpoint(
        operation.target,
        eventMap,
        stateMap,
        factMap,
        proposedFactIds
      );
      const relationId = deriveObjectId("sfr-", {
        scope: scopeAsJson(proposal.scope),
        source: endpointAsJson(source),
        relation_type: operation.relation_type,
        target: endpointAsJson(target),
        source_event_ids: operation.source_event_ids,
        attestation_refs: evidence.attestationRefs,
        metadata: operation.metadata,
      });
      if (seenRelations.has(relationId) || relationMap.has(relationId)) conflict();
      seenRelations.add(relationId);
      relationProposals.push({
        op: "CREATE",
        relation_id: relationId,
        source,
        relation_type: operation.relation_type,
        target,
        origin: deriveOrigin(operation.source_event_ids, eventMap),
        provenance_event_ids: [...operation.source_event_ids],
        status: "active",
        metadata: authorityMetadata(operation.metadata, evidence.attestationRefs),
      });
      continue;
    }
    const current = relationMap.get(operation.relation_id);
    if (current === undefined || current.relation_revision !== operation.expected_relation_revision ||
        seenRelations.has(operation.relation_id)) conflict();
    seenRelations.add(operation.relation_id);
    relationProposals.push({
      op: "REVISE",
      relation_id: operation.relation_id,
      expected_relation_revision: operation.expected_relation_revision,
      status: "retracted",
      provenance_event_ids: unionStrings(current.provenance_event_ids, operation.source_event_ids),
    });
  }
  factProposals.sort((left, right) => compareText(
    left.fact_id as string,
    right.fact_id as string
  ));
  relationProposals.sort((left, right) => compareText(
    left.relation_id as string,
    right.relation_id as string
  ));
  const factRelation = factProposals.length === 0 && relationProposals.length === 0
    ? undefined
    : normalizeCanonicalFactRelationInputInsideCore({
      scope: proposal.scope,
      authority_commit_id: deriveObjectId("sffr-", { proposal_id: proposal.proposal_id }),
      policy_hash: CANONICAL_FACT_RELATION_POLICY_HASH,
      fact_proposals: factProposals,
      relation_proposals: relationProposals,
    });
  return {
    ...(state === undefined ? {} : { state }),
    ...(factRelation === undefined ? {} : { factRelation }),
    attestationRefs: [...usedAttestations].sort(),
  };
}

function validateOperationEvidence(
  operation: SemanticOperationEvidence,
  events: Map<string, SemanticRawEvidenceV1>,
  attestations: Map<string, SemanticAttestationVerificationV1>
): { attestationRefs: string[] } {
  for (const eventId of operation.source_event_ids) {
    if (!events.has(eventId)) invalid();
  }
  const refs = operation.attestation_refs ?? [];
  for (const ref of refs) {
    const attestation = attestations.get(ref);
    if (attestation === undefined || !operation.source_event_ids.includes(attestation.event_id)) {
      invalid();
    }
  }
  return { attestationRefs: [...refs] };
}

function resolveRelationEndpoint(
  selector: SemanticRelationEndpointSelectorV1,
  events: Map<string, SemanticRawEvidenceV1>,
  states: Map<string, CanonicalStateItem>,
  facts: Map<string, SemanticFactViewV1>,
  proposedFacts: Map<number, string>
): CanonicalRelationEndpoint {
  switch (selector.kind) {
    case "RAW_EVENT":
      if (!events.has(selector.event_id)) invalid();
      return { type: "RAW_EVENT", id: selector.event_id };
    case "STATE_ITEM":
      if (!states.has(selector.item_id)) conflict();
      return { type: "STATE_ITEM", id: selector.item_id };
    case "FACT": {
      const fact = facts.get(selector.fact_id);
      if (fact === undefined || fact.fact_revision !== selector.fact_revision) conflict();
      return { type: "FACT", id: selector.fact_id };
    }
    case "PROPOSED_FACT": {
      const factId = proposedFacts.get(selector.fact_operation_index);
      if (factId === undefined) invalid();
      return { type: "FACT", id: factId };
    }
  }
}

function assertCurrentFactRelationProjection(
  database: DatabaseSync,
  preparation: SemanticInterpretationPreparationV1,
  observed: RevisionVector
): void {
  const current = readCanonicalFactRelationProjectionInsideCore(
    database,
    { namespace: preparation.namespace, stream_id: preparation.stream_id },
    observed
  );
  const currentHash = sha256(canonicalJson({
    facts: current.facts.map((fact) => factViewAsJson(factView(fact))),
    relations: current.relations.map((relation) => relationViewAsJson(relationView(relation))),
  }));
  const preparedHash = sha256(canonicalJson({
    facts: preparation.current_projection.facts.map(factViewAsJson),
    relations: preparation.current_projection.relations.map(relationViewAsJson),
  }));
  if (currentHash !== preparedHash) conflict();
}

function buildApplyResult(
  proposal: NormalizedProposal,
  preparation: SemanticInterpretationPreparationV1,
  plan: DomainPlan,
  previous: RevisionVector,
  current: RevisionVector,
  stateCommit?: CommittedCanonicalStateRevision,
  factRelationCommit?: CanonicalFactRelationCommitResult,
  createdAt = new Date().toISOString()
): SemanticProposalApplyResultV1 {
  return {
    schema_version: 1,
    ...proposal.scope,
    proposal_id: proposal.proposal_id,
    preparation_id: preparation.preparation_id,
    disposition: proposal.disposition,
    producer: { ...proposal.producer },
    ...(proposal.diagnostics === undefined ? {} : { diagnostics: cloneDiagnostics(proposal.diagnostics) }),
    source_event_ids: [...proposal.observed.source_event_ids],
    attestation_refs: [...plan.attestationRefs],
    previous_revision_vector: cloneVector(previous),
    current_revision_vector: cloneVector(current),
    ...(stateCommit === undefined ? {} : { state_commit: cloneStateCommit(stateCommit) }),
    ...(factRelationCommit === undefined
      ? {}
      : { fact_relation_commit: cloneFactRelationCommit(factRelationCommit) }),
    created_at: createdAt,
  };
}

function insertProposalInsideCore(
  database: DatabaseSync,
  proposal: NormalizedProposal,
  result: SemanticProposalApplyResultV1,
  plan: DomainPlan
): void {
  const existing = readProposalRow(database, proposal.scope, proposal.proposal_id);
  if (existing !== undefined) {
    if (existing.request_json !== proposal.proposal_json ||
        storedHash(existing.request_fingerprint) !== proposal.proposal_fingerprint) conflict();
    return;
  }
  const resultJson = canonicalJson(resultAsJson(result));
  database.prepare(
    `INSERT INTO cc_semantic_proposal_commits (
       namespace, stream_id, proposal_id, preparation_id, request_fingerprint,
       request_json, previous_revision_vector_json, current_revision_vector_json,
       state_commit_id, fact_relation_commit_id, result_hash, result_json, created_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    proposal.scope.namespace,
    proposal.scope.stream_id,
    proposal.proposal_id,
    proposal.preparation_id,
    proposal.proposal_fingerprint,
    proposal.proposal_json,
    canonicalJson(vectorAsJson(result.previous_revision_vector)),
    canonicalJson(vectorAsJson(result.current_revision_vector)),
    plan.state?.state_commit_id ?? null,
    plan.factRelation?.authority_commit_id ?? null,
    sha256(resultJson),
    resultJson,
    result.created_at
  );
  const insertEvent = database.prepare(
    `INSERT INTO cc_semantic_proposal_events (
       namespace, stream_id, event_id, proposal_id, preparation_id
     ) VALUES (?, ?, ?, ?, ?)`
  );
  for (const eventId of proposal.observed.source_event_ids) {
    insertEvent.run(
      proposal.scope.namespace,
      proposal.scope.stream_id,
      eventId,
      proposal.proposal_id,
      proposal.preparation_id
    );
  }
}

function assertProposalEventsAvailable(
  database: DatabaseSync,
  proposal: NormalizedProposal
): void {
  const preparationOwner = database.prepare(
    `SELECT proposal_id FROM cc_semantic_proposal_commits
     WHERE namespace = ? AND stream_id = ? AND preparation_id = ?`
  ).get(
    proposal.scope.namespace,
    proposal.scope.stream_id,
    proposal.preparation_id
  ) as { proposal_id: string } | undefined;
  if (preparationOwner !== undefined && preparationOwner.proposal_id !== proposal.proposal_id) {
    conflict();
  }
  const readEventOwner = database.prepare(
    `SELECT proposal_id FROM cc_semantic_proposal_events
     WHERE namespace = ? AND stream_id = ? AND event_id = ?`
  );
  for (const eventId of proposal.observed.source_event_ids) {
    const owner = readEventOwner.get(
      proposal.scope.namespace,
      proposal.scope.stream_id,
      eventId
    ) as { proposal_id: string } | undefined;
    if (owner !== undefined && owner.proposal_id !== proposal.proposal_id) conflict();
  }
}

function readPreparationInsideCore(
  database: DatabaseSync,
  scope: RevisionScope,
  preparationId: string
): SemanticInterpretationPreparationV1 {
  const row = readPreparationRow(database, scope, preparationId);
  if (row === undefined) notFound();
  if (row.namespace !== scope.namespace || row.stream_id !== scope.stream_id ||
      row.preparation_id !== preparationId ||
      storedHash(row.request_fingerprint) !== sha256(row.request_json) ||
      storedHash(row.preparation_hash) !== sha256(row.preparation_json)) corrupt();
  const request = normalizePreparationRequest(parseStoredJson(row.request_json));
  if (request.request_json !== row.request_json || !sameScope(request.scope, scope)) corrupt();
  const preparation = parseStoredPreparation(row.preparation_json);
  if (preparation.preparation_id !== preparationId || !sameScope(preparation, scope) ||
      preparation.created_at !== storedTimestamp(row.created_at) ||
      !sameStrings(preparation.requested_capabilities, request.requested_capabilities) ||
      !sameStrings(
        preparation.source_events.map((entry) => entry.event.event_id).sort(),
        request.source_event_ids
      )) corrupt();
  const live = readVector(database, scope);
  if (!vectorAtOrAfter(live, preparation.observed_revision_vector)) corrupt();
  const receipts = readLedgerRawEventReceiptsInsideCore(
    database,
    scope,
    request.source_event_ids,
    preparation.observed_revision_vector
  );
  const evidence = publicEvidence(receipts, preparation.verified_attestations);
  if (canonicalJson(evidence.map(evidenceAsJson)) !==
      canonicalJson(preparation.source_events.map(evidenceAsJson))) corrupt();
  if (preparation.observed_revision_vector.state_revision > 0) {
    const authority = readCanonicalStateAuthorityInsideCore(
      database,
      scope,
      preparation.observed_revision_vector.state_revision,
      preparation.observed_revision_vector
    );
    if (canonicalJson(authority.committed.state.items.map(stateItemAsJson)) !==
        canonicalJson(preparation.current_projection.state_items.map(stateItemAsJson))) corrupt();
  } else if (preparation.current_projection.state_items.length !== 0) {
    corrupt();
  }
  const facts = preparation.current_projection.facts.map((fact) => ({
    fact_id: fact.fact_id,
    fact_revision: fact.fact_revision,
  }));
  const relations = preparation.current_projection.relations.map((relation) => ({
    relation_id: relation.relation_id,
    relation_revision: relation.relation_revision,
  }));
  const exact = readCanonicalFactRelationAuthorityInsideCore(
    database,
    scope,
    facts,
    relations,
    preparation.observed_revision_vector
  );
  if (canonicalJson(exact.facts.map((fact) => factViewAsJson(factView(fact)))) !==
      canonicalJson(preparation.current_projection.facts.map(factViewAsJson)) ||
      canonicalJson(exact.relations.map((relation) => relationViewAsJson(relationView(relation)))) !==
      canonicalJson(preparation.current_projection.relations.map(relationViewAsJson))) corrupt();
  const projectionHash = sha256(canonicalJson(projectionAsJson(preparation.current_projection)));
  if (preparation.projection_hash !== projectionHash) corrupt();
  const identityBase: JsonObject = {
    request: parseJson(request.request_json) as JsonObject,
    observed_revision_vector: vectorAsJson(preparation.observed_revision_vector),
    source_events: preparation.source_events.map(evidenceAsJson),
    current_projection: projectionAsJson(preparation.current_projection),
    verified_attestations: preparation.verified_attestations.map(attestationAsJson),
    contract_constraints: constraintsAsJson(preparation.contract_constraints),
  };
  if (preparation.preparation_id !== `sfprep-${sha256(canonicalJson(identityBase))}`) corrupt();
  return clonePreparation(preparation);
}

function readResultInsideCore(
  database: DatabaseSync,
  scope: RevisionScope,
  proposalId: string
): SemanticProposalApplyResultV1 {
  const row = readProposalRow(database, scope, proposalId);
  if (row === undefined) notFound();
  if (row.namespace !== scope.namespace || row.stream_id !== scope.stream_id ||
      row.proposal_id !== proposalId ||
      storedHash(row.request_fingerprint) !== sha256(row.request_json) ||
      storedHash(row.result_hash) !== sha256(row.result_json)) corrupt();
  const proposal = normalizeProposal(parseStoredJson(row.request_json), true);
  if (proposal.proposal_json !== row.request_json || !sameScope(proposal.scope, scope) ||
      row.preparation_id !== proposal.preparation_id) corrupt();
  const preparation = readPreparationInsideCore(database, scope, proposal.preparation_id);
  let plan: DomainPlan;
  try {
    assertProposalPreparationBinding(proposal, preparation);
    plan = buildDomainPlan(proposal, preparation);
  } catch {
    corrupt();
  }
  const previous = parseStoredVector(row.previous_revision_vector_json, scope);
  const current = parseStoredVector(row.current_revision_vector_json, scope);
  if (!sameVector(previous, preparation.observed_revision_vector) ||
      !sameVector(current, expectedResultVector(previous, plan)) ||
      !vectorAtOrAfter(readVector(database, scope), current)) corrupt();
  const eventRows = database.prepare(
    `SELECT event_id, proposal_id, preparation_id FROM cc_semantic_proposal_events
     WHERE namespace = ? AND stream_id = ? AND proposal_id = ? ORDER BY event_id`
  ).all(scope.namespace, scope.stream_id, proposalId) as Array<{
    event_id: string;
    proposal_id: string;
    preparation_id: string;
  }>;
  if (!sameStrings(
    eventRows.map((entry) => storedIdentifier(entry.event_id)),
    proposal.observed.source_event_ids
  ) || eventRows.some((entry) =>
    entry.proposal_id !== proposalId || entry.preparation_id !== preparation.preparation_id)) {
    corrupt();
  }
  let stateCommit: CommittedCanonicalStateRevision | undefined;
  if (plan.state === undefined) {
    if (row.state_commit_id !== null) corrupt();
  } else {
    if (row.state_commit_id !== plan.state.state_commit_id) corrupt();
    stateCommit = readCanonicalStateAuthorityInsideCore(
      database,
      scope,
      current.state_revision,
      current
    ).committed;
    if (stateCommit.state_commit_id !== plan.state.state_commit_id ||
        stateCommit.previous_state_revision !== previous.state_revision ||
        stateCommit.commit_mode !== plan.state.commit_mode ||
        stateCommit.policy_hash !== plan.state.policy_hash ||
        canonicalJson(stateCommit.proposal.upsert_items.map(stateItemAsJson)) !==
          canonicalJson(plan.state.proposal.upsert_items.map(stateItemAsJson)) ||
        !sameStrings(stateCommit.provenance_event_ids, plan.state.provenance_event_ids)) {
      corrupt();
    }
  }
  let factRelationCommit: CanonicalFactRelationCommitResult | undefined;
  if (plan.factRelation === undefined) {
    if (row.fact_relation_commit_id !== null) corrupt();
  } else {
    if (row.fact_relation_commit_id !== plan.factRelation.authority_commit_id) corrupt();
    let owner: ReturnType<typeof readCanonicalFactRelationCommitInsideCore>;
    try {
      owner = readCanonicalFactRelationCommitInsideCore(
        database,
        scope,
        plan.factRelation.authority_commit_id
      );
    } catch {
      corrupt();
    }
    if (canonicalJson(owner.input.request) !== canonicalJson(plan.factRelation.request)) corrupt();
    factRelationCommit = owner.result;
    if (!sameVector(factRelationCommit.observed_revision_vector, previous)) corrupt();
  }
  const expected = buildApplyResult(
    proposal,
    preparation,
    plan,
    previous,
    current,
    stateCommit,
    factRelationCommit,
    storedTimestamp(row.created_at)
  );
  let stored: SemanticProposalApplyResultV1;
  try {
    stored = parseStoredResult(row.result_json);
  } catch {
    corrupt();
  }
  const expectedJson = canonicalJson(resultAsJson(expected));
  if (row.result_json !== expectedJson || canonicalJson(resultAsJson(stored)) !== expectedJson) {
    corrupt();
  }
  return cloneApplyResult(expected);
}

function parseStoredVector(json: string, scope: RevisionScope): RevisionVector {
  try {
    return normalizeVector(parseStoredJson(json), scope);
  } catch {
    corrupt();
  }
}

function expectedResultVector(previous: RevisionVector, plan: DomainPlan): RevisionVector {
  if (plan.state === undefined) return cloneVector(previous);
  if (!Number.isSafeInteger(previous.state_revision + 1)) corrupt();
  return { ...previous, state_revision: previous.state_revision + 1 };
}

function publicProjection(
  state: CanonicalStateProjection,
  factsAndRelations: CanonicalFactRelationProjection
): SemanticInterpretationPreparationV1["current_projection"] {
  return {
    state_items: state.state.items.map(cloneStateItem),
    facts: factsAndRelations.facts.map(factView),
    relations: factsAndRelations.relations.map(relationView),
  };
}

function publicEvidence(
  receipts: LedgerRawEventReceiptInsideCore[],
  verifications: SemanticAttestationVerificationV1[]
): SemanticRawEvidenceV1[] {
  const byEvent = new Map<string, string[]>();
  for (const verification of verifications) {
    const refs = byEvent.get(verification.event_id) ?? [];
    refs.push(verification.receipt_ref);
    byEvent.set(verification.event_id, refs);
  }
  return receipts.map((receipt) => {
    const refs = (byEvent.get(receipt.event.event_id) ?? []).sort();
    return {
      event: cloneRawEvent(receipt.event),
      receipt: publicReceipt(receipt),
      authority_class: refs.length === 0 ? "UNATTESTED" : "DIRECT_HUMAN_ATTESTED",
      attestation_refs: refs,
    };
  });
}

function publicReceipt(receipt: LedgerRawEventReceiptInsideCore): SemanticRawEvidenceReceiptV1 {
  return {
    schema_version: 1,
    namespace: receipt.event.namespace,
    stream_id: receipt.event.stream_id,
    event_id: receipt.event.event_id,
    ledger_revision: receipt.event.ledger_revision,
    event_hash: receipt.event_hash,
    marker_request_fingerprint: receipt.marker_request_fingerprint,
    marker_current: cloneVector(receipt.marker_current),
    receipt_hash: receipt.receipt_hash,
  };
}

function assertVerificationBindings(
  verifications: SemanticAttestationVerificationV1[],
  refs: SemanticAttestationRefV1[],
  receipts: LedgerRawEventReceiptInsideCore[]
): void {
  if (verifications.length !== refs.length) attestationRejected();
  const receiptByEvent = new Map(receipts.map((entry) => [entry.event.event_id, entry]));
  verifications.forEach((verification, index) => {
    const ref = refs[index];
    const receipt = receiptByEvent.get(verification.event_id);
    if (ref === undefined || receipt === undefined ||
        verification.receipt_ref !== ref.receipt_ref ||
        verification.event_id !== ref.event_id ||
        verification.event_receipt_hash !== receipt.receipt_hash) attestationRejected();
  });
}

function normalizeAttestation(value: unknown): SemanticAttestationVerificationV1 {
  const object = readExactObject(value, [
    "schema_version", "receipt_ref", "authority_id", "authority_class", "namespace",
    "stream_id", "event_id", "event_receipt_hash", "issued_at",
  ]);
  if (object.schema_version !== 1 || object.authority_class !== "DIRECT_HUMAN_ATTESTED") {
    attestationRejected();
  }
  const scope = normalizeScope({ namespace: object.namespace, stream_id: object.stream_id });
  return {
    schema_version: 1,
    ...scope,
    receipt_ref: validateText(object.receipt_ref, MAX_RECEIPT_REF),
    authority_id: validateIdentifier(object.authority_id),
    authority_class: "DIRECT_HUMAN_ATTESTED",
    event_id: validateIdentifier(object.event_id),
    event_receipt_hash: validateHash(object.event_receipt_hash),
    issued_at: validateTimestamp(object.issued_at),
  };
}

function normalizeAttestationRefs(
  value: unknown,
  sourceEventIds: string[]
): SemanticAttestationRefV1[] {
  const array = readDenseArray(value, MAX_EVENTS);
  const refs = array.map((entry) => {
    const object = readExactObject(entry, ["receipt_ref", "event_id"]);
    const eventId = validateIdentifier(object.event_id);
    if (!sourceEventIds.includes(eventId)) invalid();
    return {
      receipt_ref: validateText(object.receipt_ref, MAX_RECEIPT_REF),
      event_id: eventId,
    };
  }).sort((left, right) =>
    compareText(left.receipt_ref, right.receipt_ref) || compareText(left.event_id, right.event_id));
  for (let index = 1; index < refs.length; index += 1) {
    if (refs[index - 1]?.receipt_ref === refs[index]?.receipt_ref) invalid();
  }
  return refs;
}

function deriveOrigin(
  eventIds: string[],
  events: Map<string, SemanticRawEvidenceV1>
): CanonicalFactOrigin {
  const kinds = new Set(eventIds.map((id) => events.get(id)?.event.source_kind));
  if (kinds.has(undefined)) invalid();
  if (kinds.size === 1 && kinds.has("user_input")) return "user_asserted";
  if (kinds.size === 1 && kinds.has("tool_result")) return "tool_observed";
  if (kinds.size === 1 && kinds.has("file")) return "imported";
  return "host_observed";
}

function authorityMetadata(value: JsonObject, attestationRefs: string[]): JsonObject {
  if (Object.prototype.hasOwnProperty.call(value, "semantic_formation")) invalid();
  return normalizeMetadata({
    ...cloneJsonObject(value),
    semantic_formation: {
      authority_class: attestationRefs.length === 0
        ? "UNATTESTED"
        : "DIRECT_HUMAN_ATTESTED",
      attestation_refs: [...attestationRefs],
    },
  });
}

function mergeAuthorityMetadata(value: JsonObject, attestationRefs: string[]): JsonObject {
  const cloned = cloneJsonObject(value);
  const existing = cloned.semantic_formation;
  const existingRefs = typeof existing === "object" && existing !== null && !Array.isArray(existing) &&
      Array.isArray(existing.attestation_refs)
    ? existing.attestation_refs.filter((entry): entry is string => typeof entry === "string")
    : [];
  const refs = unionStrings(existingRefs, attestationRefs);
  delete cloned.semantic_formation;
  return authorityMetadata(cloned, refs);
}

function initialStateStatus(kind: CanonicalStateItemKind): CanonicalStateItemStatus {
  switch (kind) {
    case "GOAL":
    case "CONSTRAINT":
    case "DECISION": return "ACTIVE";
    case "OPEN_QUESTION": return "OPEN";
    case "REJECTED_ALTERNATIVE": return "REJECTED";
  }
}

function migrateSemanticFormation(database: DatabaseSync): void {
  database.exec("BEGIN IMMEDIATE;");
  try {
    if (sqliteObjectExists(database, "table", "cc_semantic_formation_schema")) {
      validateSchema(database, false);
      database.exec("COMMIT;");
      return;
    }
    for (const object of SCHEMA_OBJECTS.slice(1)) {
      if (sqliteObjectExists(database, object.type, object.name)) corrupt();
    }
    database.exec(SCHEMA_OBJECTS.map((entry) => `${entry.sql};`).join("\n"));
    validateSchema(database, true);
    database.prepare(
      "INSERT INTO cc_semantic_formation_schema (version, completed_at) VALUES (1, ?)"
    ).run(new Date().toISOString());
    validateSchema(database, false);
    database.exec("COMMIT;");
  } catch (error) {
    rollback(database);
    throw error;
  }
}

function validateSchema(database: DatabaseSync, allowIncomplete: boolean): void {
  const columns: Record<string, string[]> = {
    cc_semantic_formation_schema: ["version", "completed_at"],
    cc_semantic_preparations: [
      "namespace", "stream_id", "preparation_id", "request_fingerprint", "request_json",
      "preparation_hash", "preparation_json", "created_at",
    ],
    cc_semantic_proposal_commits: [
      "namespace", "stream_id", "proposal_id", "preparation_id", "request_fingerprint",
      "request_json", "previous_revision_vector_json", "current_revision_vector_json",
      "state_commit_id", "fact_relation_commit_id", "result_hash", "result_json", "created_at",
    ],
    cc_semantic_proposal_events: [
      "namespace", "stream_id", "event_id", "proposal_id", "preparation_id",
    ],
  };
  for (const [table, expected] of Object.entries(columns)) {
    const actual = database.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
    if (actual.length !== expected.length ||
        actual.some((entry, index) => entry.name !== expected[index])) corrupt();
  }
  for (const expected of SCHEMA_OBJECTS) {
    const row = database.prepare(
      "SELECT type, name, sql FROM sqlite_master WHERE type = ? AND name = ?"
    ).get(expected.type, expected.name) as {
      type: string;
      name: string;
      sql: string | null;
    } | undefined;
    if (row?.type !== expected.type || row.name !== expected.name ||
        typeof row.sql !== "string" || normalizeSchemaSql(row.sql) !== normalizeSchemaSql(expected.sql)) {
      corrupt();
    }
  }
  const versions = database.prepare(
    "SELECT version FROM cc_semantic_formation_schema ORDER BY version"
  ).all() as Array<{ version: number }>;
  if ((!allowIncomplete && versions.length !== 1) || versions.length > 1 ||
      (versions.length === 1 && versions[0]?.version !== 1)) corrupt();
}

function readPreparationRow(
  database: DatabaseSync,
  scope: RevisionScope,
  preparationId: string
): PreparationRow | undefined {
  return database.prepare(
    `SELECT namespace, stream_id, preparation_id, request_fingerprint, request_json,
            preparation_hash, preparation_json, created_at
     FROM cc_semantic_preparations
     WHERE namespace = ? AND stream_id = ? AND preparation_id = ?`
  ).get(scope.namespace, scope.stream_id, preparationId) as PreparationRow | undefined;
}

function readProposalRow(
  database: DatabaseSync,
  scope: RevisionScope,
  proposalId: string
): ProposalRow | undefined {
  return database.prepare(
    `SELECT namespace, stream_id, proposal_id, preparation_id, request_fingerprint,
            request_json, previous_revision_vector_json, current_revision_vector_json,
            state_commit_id, fact_relation_commit_id, result_hash, result_json, created_at
     FROM cc_semantic_proposal_commits
     WHERE namespace = ? AND stream_id = ? AND proposal_id = ?`
  ).get(scope.namespace, scope.stream_id, proposalId) as ProposalRow | undefined;
}

function readVector(database: DatabaseSync, scopeValue: RevisionScope): RevisionVector {
  const scope = normalizeScope({
    namespace: scopeValue.namespace,
    stream_id: scopeValue.stream_id,
  });
  const row = database.prepare(
    `SELECT namespace, stream_id, ledger_revision, state_revision,
            raw_frontier_revision, frontier_position, takeover_commit_revision
     FROM cc_revision_streams WHERE namespace = ? AND stream_id = ?`
  ).get(scope.namespace, scope.stream_id) as StreamRow | undefined;
  if (row === undefined) conflict();
  return normalizeVector(row, scope);
}

function normalizeVector(value: unknown, scopeValue: RevisionScope): RevisionVector {
  const scope = normalizeScope({
    namespace: scopeValue.namespace,
    stream_id: scopeValue.stream_id,
  });
  const object = readExactObject(value, [
    "namespace", "stream_id", "ledger_revision", "state_revision",
    "raw_frontier_revision", "frontier_position", "takeover_commit_revision",
  ]);
  if (object.namespace !== scope.namespace || object.stream_id !== scope.stream_id) invalid();
  const numbers = [
    object.ledger_revision, object.state_revision, object.raw_frontier_revision,
    object.frontier_position, object.takeover_commit_revision,
  ];
  if (numbers.some((entry) => !Number.isSafeInteger(entry) || (entry as number) < 0) ||
      (object.frontier_position as number) > (object.ledger_revision as number)) invalid();
  return {
    ...scope,
    ledger_revision: object.ledger_revision as number,
    state_revision: object.state_revision as number,
    raw_frontier_revision: object.raw_frontier_revision as number,
    frontier_position: object.frontier_position as number,
    takeover_commit_revision: object.takeover_commit_revision as number,
  };
}

function parseStoredPreparation(json: string): SemanticInterpretationPreparationV1 {
  const object = readExactObject(parseStoredJson(json), [
    "schema_version", "namespace", "stream_id", "preparation_id",
    "observed_revision_vector", "source_events", "current_projection",
    "requested_capabilities", "verified_attestations", "contract_constraints",
    "projection_hash", "created_at",
  ]);
  if (object.schema_version !== 1) corrupt();
  const scope = storedScope(object.namespace, object.stream_id);
  const sourceEvents = readDenseArray(object.source_events, MAX_EVENTS).map(parseEvidence);
  const projectionObject = readExactObject(object.current_projection, [
    "state_items", "facts", "relations",
  ]);
  const stateItems = readDenseArray(projectionObject.state_items, MAX_PROJECTION_OBJECTS)
    .map(parseStateItem);
  const facts = readDenseArray(projectionObject.facts, MAX_PROJECTION_OBJECTS).map(parseFactView);
  const relations = readDenseArray(projectionObject.relations, MAX_PROJECTION_OBJECTS)
    .map(parseRelationView);
  const attestations = readDenseArray(object.verified_attestations, MAX_EVENTS)
    .map(normalizeAttestation);
  const constraints = parseConstraints(object.contract_constraints);
  const preparation: SemanticInterpretationPreparationV1 = {
    schema_version: 1,
    ...scope,
    preparation_id: validatePrefixedHash(object.preparation_id, "sfprep-"),
    observed_revision_vector: normalizeVector(object.observed_revision_vector, scope),
    source_events: sourceEvents,
    current_projection: { state_items: stateItems, facts, relations },
    requested_capabilities: normalizeEnumSet(
      object.requested_capabilities,
      SEMANTIC_CAPABILITIES,
      0,
      SEMANTIC_CAPABILITIES.length
    ) as SemanticCapability[],
    verified_attestations: attestations,
    contract_constraints: constraints,
    projection_hash: validateHash(object.projection_hash),
    created_at: validateTimestamp(object.created_at),
  };
  if (canonicalJson(preparationAsJson(preparation)) !== json) corrupt();
  return preparation;
}

function parseStoredResult(json: string): SemanticProposalApplyResultV1 {
  const object = readExactObject(parseStoredJson(json), [
    "schema_version", "namespace", "stream_id", "proposal_id", "preparation_id",
    "disposition", "producer", "diagnostics", "source_event_ids", "attestation_refs",
    "previous_revision_vector", "current_revision_vector", "state_commit",
    "fact_relation_commit", "created_at",
  ], [
    "schema_version", "namespace", "stream_id", "proposal_id", "preparation_id",
    "disposition", "producer", "source_event_ids", "attestation_refs",
    "previous_revision_vector", "current_revision_vector", "created_at",
  ]);
  if (object.schema_version !== 1 || typeof object.disposition !== "string" ||
      !SEMANTIC_PROPOSAL_DISPOSITIONS.includes(object.disposition as SemanticProposalDisposition)) {
    corrupt();
  }
  const scope = storedScope(object.namespace, object.stream_id);
  const result: SemanticProposalApplyResultV1 = {
    schema_version: 1,
    ...scope,
    proposal_id: validatePrefixedHash(object.proposal_id, "sfprop-"),
    preparation_id: validatePrefixedHash(object.preparation_id, "sfprep-"),
    disposition: object.disposition as SemanticProposalDisposition,
    producer: normalizeProducer(object.producer),
    ...(object.diagnostics === undefined ? {} : { diagnostics: normalizeDiagnostics(object.diagnostics) }),
    source_event_ids: normalizeIdentifierSet(object.source_event_ids, 1, MAX_EVENTS),
    attestation_refs: normalizeTextSet(object.attestation_refs, 0, MAX_EVENTS, MAX_RECEIPT_REF),
    previous_revision_vector: normalizeVector(object.previous_revision_vector, scope),
    current_revision_vector: normalizeVector(object.current_revision_vector, scope),
    ...(object.state_commit === undefined
      ? {}
      : { state_commit: parseStateCommit(object.state_commit, scope) }),
    ...(object.fact_relation_commit === undefined
      ? {}
      : { fact_relation_commit: parseFactRelationCommit(object.fact_relation_commit, scope) }),
    created_at: validateTimestamp(object.created_at),
  };
  if (canonicalJson(resultAsJson(result)) !== json) corrupt();
  return result;
}

function parseEvidence(value: unknown): SemanticRawEvidenceV1 {
  const object = readExactObject(value, [
    "event", "receipt", "authority_class", "attestation_refs",
  ]);
  const event = parseRawEvent(object.event);
  const receipt = parseReceipt(object.receipt, event);
  if (object.authority_class !== "UNATTESTED" &&
      object.authority_class !== "DIRECT_HUMAN_ATTESTED") corrupt();
  const refs = normalizeTextSet(object.attestation_refs, 0, MAX_EVENTS, MAX_RECEIPT_REF);
  if ((refs.length === 0) !== (object.authority_class === "UNATTESTED")) corrupt();
  return {
    event,
    receipt,
    authority_class: object.authority_class,
    attestation_refs: refs,
  };
}

function parseRawEvent(value: unknown): LedgerRawEvent {
  const object = readExactObject(value, [
    "namespace", "stream_id", "ledger_revision", "event_id", "source_kind",
    "source_id", "source_session_id", "payload", "occurred_at", "created_at",
  ], [
    "namespace", "stream_id", "ledger_revision", "event_id", "source_kind",
    "source_id", "payload", "created_at",
  ]);
  const scope = storedScope(object.namespace, object.stream_id);
  if (!Number.isSafeInteger(object.ledger_revision) || (object.ledger_revision as number) < 1 ||
      typeof object.source_kind !== "string" || ![
        "user_input", "tool_result", "file", "external_observation",
      ].includes(object.source_kind)) corrupt();
  return {
    ...scope,
    ledger_revision: object.ledger_revision as number,
    event_id: storedIdentifier(object.event_id),
    source_kind: object.source_kind as RawSourceKind,
    source_id: validateText(object.source_id, MAX_RECEIPT_REF),
    ...(object.source_session_id === undefined
      ? {}
      : { source_session_id: storedIdentifier(object.source_session_id) }),
    payload: normalizeJsonValue(object.payload),
    ...(object.occurred_at === undefined ? {} : { occurred_at: validateTimestamp(object.occurred_at) }),
    created_at: validateTimestamp(object.created_at),
  };
}

function parseReceipt(value: unknown, event: LedgerRawEvent): SemanticRawEvidenceReceiptV1 {
  const object = readExactObject(value, [
    "schema_version", "namespace", "stream_id", "event_id", "ledger_revision",
    "event_hash", "marker_request_fingerprint", "marker_current", "receipt_hash",
  ]);
  if (object.schema_version !== 1 || object.namespace !== event.namespace ||
      object.stream_id !== event.stream_id || object.event_id !== event.event_id ||
      object.ledger_revision !== event.ledger_revision) corrupt();
  return {
    schema_version: 1,
    namespace: event.namespace,
    stream_id: event.stream_id,
    event_id: event.event_id,
    ledger_revision: event.ledger_revision,
    event_hash: validateHash(object.event_hash),
    marker_request_fingerprint: validateHash(object.marker_request_fingerprint),
    marker_current: normalizeVector(object.marker_current, event),
    receipt_hash: validateHash(object.receipt_hash),
  };
}

function parseStateItem(value: unknown): CanonicalStateItem {
  const object = readExactObject(value, [
    "item_id", "kind", "content", "status", "source_event_ids", "metadata",
  ]);
  if (typeof object.kind !== "string" ||
      !CANONICAL_STATE_ITEM_KINDS.includes(object.kind as CanonicalStateItemKind) ||
      typeof object.status !== "string") corrupt();
  return {
    item_id: storedIdentifier(object.item_id),
    kind: object.kind as CanonicalStateItemKind,
    content: validateText(object.content, MAX_TEXT),
    status: object.status as CanonicalStateItemStatus,
    source_event_ids: normalizeIdentifierSet(object.source_event_ids, 1, 1_000),
    metadata: normalizeMetadata(object.metadata),
  };
}

function parseFactView(value: unknown): SemanticFactViewV1 {
  const object = readExactObject(value, [
    "fact_id", "fact_revision", "statement", "epistemic_origin", "verification_status",
    "lifecycle_status", "record_status", "provenance_event_ids", "verification_event_ids",
    "metadata",
  ]);
  if (!Number.isSafeInteger(object.fact_revision) || (object.fact_revision as number) < 1 ||
      typeof object.epistemic_origin !== "string" || ![
        "user_asserted", "tool_observed", "host_observed", "imported", "model_inferred",
      ].includes(object.epistemic_origin) || typeof object.verification_status !== "string" ||
      !["unverified", "corroborated", "verified", "contested", "disconfirmed"]
        .includes(object.verification_status) || typeof object.lifecycle_status !== "string" ||
      !["active", "superseded", "retracted"].includes(object.lifecycle_status) ||
      typeof object.record_status !== "string" || !["live", "archived"].includes(object.record_status)) {
    corrupt();
  }
  return {
    fact_id: storedIdentifier(object.fact_id),
    fact_revision: object.fact_revision as number,
    statement: validateText(object.statement, MAX_TEXT),
    epistemic_origin: object.epistemic_origin as CanonicalFactOrigin,
    verification_status: object.verification_status as CanonicalFactVerificationStatus,
    lifecycle_status: object.lifecycle_status as CanonicalFactLifecycleStatus,
    record_status: object.record_status as CanonicalFactRecordStatus,
    provenance_event_ids: normalizeIdentifierSet(object.provenance_event_ids, 1, 1_000),
    verification_event_ids: normalizeIdentifierSet(object.verification_event_ids, 0, 1_000),
    metadata: normalizeMetadata(object.metadata),
  };
}

function parseRelationView(value: unknown): SemanticRelationViewV1 {
  const object = readExactObject(value, [
    "relation_id", "relation_revision", "source", "relation_type", "target", "origin",
    "provenance_event_ids", "status", "metadata",
  ]);
  if (!Number.isSafeInteger(object.relation_revision) || (object.relation_revision as number) < 1 ||
      typeof object.relation_type !== "string" || typeof object.origin !== "string" ||
      typeof object.status !== "string") corrupt();
  return {
    relation_id: storedIdentifier(object.relation_id),
    relation_revision: object.relation_revision as number,
    source: parseCanonicalEndpoint(object.source),
    relation_type: object.relation_type as CanonicalRelationType,
    target: parseCanonicalEndpoint(object.target),
    origin: object.origin as CanonicalFactOrigin,
    provenance_event_ids: normalizeIdentifierSet(object.provenance_event_ids, 1, 1_000),
    status: object.status as "active" | "retracted",
    metadata: normalizeMetadata(object.metadata),
  };
}

function parseCanonicalEndpoint(value: unknown): CanonicalRelationEndpoint {
  const object = readExactObject(value, ["type", "id"]);
  if (typeof object.type !== "string" || !["RAW_EVENT", "FACT", "STATE_ITEM"]
    .includes(object.type)) corrupt();
  return { type: object.type as CanonicalRelationEndpoint["type"], id: storedIdentifier(object.id) };
}

function parseConstraints(value: unknown): SemanticContractConstraintsV1 {
  if (canonicalJson(normalizeJsonValue(value)) !== canonicalJson(constraintsAsJson(CONTRACT_CONSTRAINTS))) {
    corrupt();
  }
  return cloneConstraints(CONTRACT_CONSTRAINTS);
}

function parseStateCommit(value: unknown, scope: RevisionScope): CommittedCanonicalStateRevision {
  const object = readExactObject(value, [
    "namespace", "stream_id", "state_revision", "state_commit_id", "commit_mode",
    "previous_state_revision", "proposal", "state", "state_hash", "policy_hash",
    "provenance_event_ids", "created_at",
  ]);
  if (object.namespace !== scope.namespace || object.stream_id !== scope.stream_id) corrupt();
  return normalizeStateCommitJson(object, scope);
}

function parseFactRelationCommit(
  value: unknown,
  scope: RevisionScope
): CanonicalFactRelationCommitResult {
  const object = readExactObject(value, [
    "namespace", "stream_id", "authority_commit_id", "policy_hash",
    "observed_revision_vector", "facts", "relations", "created_at",
  ]);
  if (object.namespace !== scope.namespace || object.stream_id !== scope.stream_id ||
      object.policy_hash !== CANONICAL_FACT_RELATION_POLICY_HASH) corrupt();
  return {
    ...scope,
    authority_commit_id: storedIdentifier(object.authority_commit_id),
    policy_hash: CANONICAL_FACT_RELATION_POLICY_HASH,
    observed_revision_vector: normalizeVector(object.observed_revision_vector, scope),
    facts: readDenseArray(object.facts, MAX_FACT_OPS).map((entry) => parseCommittedFact(entry, scope)),
    relations: readDenseArray(object.relations, MAX_RELATION_OPS)
      .map((entry) => parseCommittedRelation(entry, scope)),
    created_at: validateTimestamp(object.created_at),
  };
}

function parseCommittedFact(value: unknown, scope: RevisionScope): CommittedCanonicalFact {
  const object = readExactObject(value, [
    "namespace", "stream_id", "fact_id", "fact_revision", "authority_commit_id",
    "statement", "epistemic_origin", "verification_status", "lifecycle_status",
    "record_status", "provenance_event_ids", "verification_event_ids", "metadata",
    "observed_revision_vector", "fact_hash", "created_at",
  ]);
  const view = parseFactView({
    fact_id: object.fact_id,
    fact_revision: object.fact_revision,
    statement: object.statement,
    epistemic_origin: object.epistemic_origin,
    verification_status: object.verification_status,
    lifecycle_status: object.lifecycle_status,
    record_status: object.record_status,
    provenance_event_ids: object.provenance_event_ids,
    verification_event_ids: object.verification_event_ids,
    metadata: object.metadata,
  });
  return {
    ...scope,
    ...view,
    authority_commit_id: storedIdentifier(object.authority_commit_id),
    observed_revision_vector: normalizeVector(object.observed_revision_vector, scope),
    fact_hash: validateHash(object.fact_hash),
    created_at: validateTimestamp(object.created_at),
  };
}

function parseCommittedRelation(value: unknown, scope: RevisionScope): CommittedCanonicalRelation {
  const object = readExactObject(value, [
    "namespace", "stream_id", "relation_id", "relation_revision", "authority_commit_id",
    "source", "relation_type", "target", "origin", "provenance_event_ids", "status",
    "metadata", "observed_revision_vector", "relation_hash", "created_at", "confidence",
  ], [
    "namespace", "stream_id", "relation_id", "relation_revision", "authority_commit_id",
    "source", "relation_type", "target", "origin", "provenance_event_ids", "status",
    "metadata", "observed_revision_vector", "relation_hash", "created_at",
  ]);
  const view = parseRelationView({
    relation_id: object.relation_id,
    relation_revision: object.relation_revision,
    source: object.source,
    relation_type: object.relation_type,
    target: object.target,
    origin: object.origin,
    provenance_event_ids: object.provenance_event_ids,
    status: object.status,
    metadata: object.metadata,
  });
  return {
    ...scope,
    ...view,
    authority_commit_id: storedIdentifier(object.authority_commit_id),
    ...(object.confidence === undefined ? {} : { confidence: object.confidence as number }),
    observed_revision_vector: normalizeVector(object.observed_revision_vector, scope),
    relation_hash: validateHash(object.relation_hash),
    created_at: validateTimestamp(object.created_at),
  };
}

function normalizeStateCommitJson(
  object: Record<string, unknown>,
  scope: RevisionScope
): CommittedCanonicalStateRevision {
  const proposalObject = readExactObject(object.proposal, ["schema_version", "upsert_items"]);
  const stateObject = readExactObject(object.state, ["schema_version", "items"]);
  if (proposalObject.schema_version !== 1 || stateObject.schema_version !== 1 ||
      !Number.isSafeInteger(object.state_revision) || (object.state_revision as number) < 1 ||
      !Number.isSafeInteger(object.previous_state_revision) ||
      object.policy_hash !== CANONICAL_STATE_POLICY_HASH ||
      typeof object.commit_mode !== "string") corrupt();
  return {
    ...scope,
    state_revision: object.state_revision as number,
    state_commit_id: storedIdentifier(object.state_commit_id),
    commit_mode: object.commit_mode as CommittedCanonicalStateRevision["commit_mode"],
    previous_state_revision: object.previous_state_revision as number,
    proposal: {
      schema_version: 1,
      upsert_items: readDenseArray(proposalObject.upsert_items, MAX_STATE_OPS).map(parseStateItem),
    },
    state: {
      schema_version: 1,
      items: readDenseArray(stateObject.items, MAX_PROJECTION_OBJECTS).map(parseStateItem),
    },
    state_hash: validateHash(object.state_hash),
    policy_hash: CANONICAL_STATE_POLICY_HASH,
    provenance_event_ids: normalizeIdentifierSet(object.provenance_event_ids, 1, 1_000),
    created_at: validateTimestamp(object.created_at),
  };
}

function preparationRequestAsJson(value: SemanticPreparationRequestV1): JsonObject {
  return {
    schema_version: 1,
    scope: scopeAsJson(value.scope),
    source_event_ids: [...value.source_event_ids],
    requested_capabilities: [...value.requested_capabilities],
    attestation_refs: value.attestation_refs.map((entry) => ({ ...entry })),
  };
}

function preparationAsJson(value: SemanticInterpretationPreparationV1): JsonObject {
  return {
    schema_version: 1,
    namespace: value.namespace,
    stream_id: value.stream_id,
    preparation_id: value.preparation_id,
    observed_revision_vector: vectorAsJson(value.observed_revision_vector),
    source_events: value.source_events.map(evidenceAsJson),
    current_projection: projectionAsJson(value.current_projection),
    requested_capabilities: [...value.requested_capabilities],
    verified_attestations: value.verified_attestations.map(attestationAsJson),
    contract_constraints: constraintsAsJson(value.contract_constraints),
    projection_hash: value.projection_hash,
    created_at: value.created_at,
  };
}

function evidenceAsJson(value: SemanticRawEvidenceV1): JsonObject {
  return {
    event: rawEventAsJson(value.event),
    receipt: receiptAsJson(value.receipt),
    authority_class: value.authority_class,
    attestation_refs: [...value.attestation_refs],
  };
}

function rawEventAsJson(value: LedgerRawEvent): JsonObject {
  return {
    namespace: value.namespace,
    stream_id: value.stream_id,
    ledger_revision: value.ledger_revision,
    event_id: value.event_id,
    source_kind: value.source_kind,
    source_id: value.source_id,
    ...(value.source_session_id === undefined ? {} : { source_session_id: value.source_session_id }),
    payload: cloneJson(value.payload),
    ...(value.occurred_at === undefined ? {} : { occurred_at: value.occurred_at }),
    created_at: value.created_at,
  };
}

function receiptAsJson(value: SemanticRawEvidenceReceiptV1): JsonObject {
  return {
    schema_version: 1,
    namespace: value.namespace,
    stream_id: value.stream_id,
    event_id: value.event_id,
    ledger_revision: value.ledger_revision,
    event_hash: value.event_hash,
    marker_request_fingerprint: value.marker_request_fingerprint,
    marker_current: vectorAsJson(value.marker_current),
    receipt_hash: value.receipt_hash,
  };
}

function projectionAsJson(
  value: SemanticInterpretationPreparationV1["current_projection"]
): JsonObject {
  return {
    state_items: value.state_items.map(stateItemAsJson),
    facts: value.facts.map(factViewAsJson),
    relations: value.relations.map(relationViewAsJson),
  };
}

function stateItemAsJson(value: CanonicalStateItem): JsonObject {
  return {
    item_id: value.item_id,
    kind: value.kind,
    content: value.content,
    status: value.status,
    source_event_ids: [...value.source_event_ids],
    metadata: cloneJsonObject(value.metadata),
  };
}

function factViewAsJson(value: SemanticFactViewV1): JsonObject {
  return {
    fact_id: value.fact_id,
    fact_revision: value.fact_revision,
    statement: value.statement,
    epistemic_origin: value.epistemic_origin,
    verification_status: value.verification_status,
    lifecycle_status: value.lifecycle_status,
    record_status: value.record_status,
    provenance_event_ids: [...value.provenance_event_ids],
    verification_event_ids: [...value.verification_event_ids],
    metadata: cloneJsonObject(value.metadata),
  };
}

function relationViewAsJson(value: SemanticRelationViewV1): JsonObject {
  return {
    relation_id: value.relation_id,
    relation_revision: value.relation_revision,
    source: { ...value.source },
    relation_type: value.relation_type,
    target: { ...value.target },
    origin: value.origin,
    provenance_event_ids: [...value.provenance_event_ids],
    status: value.status,
    metadata: cloneJsonObject(value.metadata),
  };
}

function endpointAsJson(value: CanonicalRelationEndpoint): JsonObject {
  return { type: value.type, id: value.id };
}

function attestationAsJson(value: SemanticAttestationVerificationV1): JsonObject {
  return {
    schema_version: 1,
    receipt_ref: value.receipt_ref,
    authority_id: value.authority_id,
    authority_class: value.authority_class,
    namespace: value.namespace,
    stream_id: value.stream_id,
    event_id: value.event_id,
    event_receipt_hash: value.event_receipt_hash,
    issued_at: value.issued_at,
  };
}

function constraintsAsJson(value: SemanticContractConstraintsV1): JsonObject {
  return {
    schema_version: 1,
    state_policy_hash: value.state_policy_hash,
    fact_relation_policy_hash: value.fact_relation_policy_hash,
    state_operations: [...value.state_operations],
    fact_operations: [...value.fact_operations],
    relation_operations: [...value.relation_operations],
    producer_kinds: [...value.producer_kinds],
    create_identity: value.create_identity,
    relation_new_state_endpoint: value.relation_new_state_endpoint,
  };
}

function proposalDraftAsJson(value: CanonicalSemanticProposalDraftV1): JsonObject {
  return {
    schema_version: 1,
    scope: scopeAsJson(value.scope),
    preparation_id: value.preparation_id,
    producer: { ...value.producer },
    observed: {
      revision_vector: vectorAsJson(value.observed.revision_vector),
      source_event_ids: [...value.observed.source_event_ids],
    },
    disposition: value.disposition,
    changes: {
      state: value.changes.state.map(operationAsJson),
      facts: value.changes.facts.map(operationAsJson),
      relations: value.changes.relations.map(operationAsJson),
    },
    ...(value.diagnostics === undefined ? {} : { diagnostics: diagnosticsAsJson(value.diagnostics) }),
  };
}

function proposalAsJson(value: CanonicalSemanticProposalV1): JsonObject {
  return { ...proposalDraftAsJson(value), proposal_id: value.proposal_id };
}

function operationAsJson(value: SemanticStateOperationV1 | SemanticFactOperationV1 |
  SemanticRelationOperationV1): JsonObject {
  return normalizeJsonValue(value) as JsonObject;
}

function diagnosticsAsJson(value: SemanticProposalDiagnosticsV1): JsonObject {
  return {
    ...(value.rule_ids === undefined ? {} : { rule_ids: [...value.rule_ids] }),
    ...(value.confidence === undefined ? {} : { confidence: value.confidence }),
    ...(value.abstain_reason === undefined ? {} : { abstain_reason: value.abstain_reason }),
  };
}

function resultAsJson(value: SemanticProposalApplyResultV1): JsonObject {
  return {
    schema_version: 1,
    namespace: value.namespace,
    stream_id: value.stream_id,
    proposal_id: value.proposal_id,
    preparation_id: value.preparation_id,
    disposition: value.disposition,
    producer: { ...value.producer },
    ...(value.diagnostics === undefined ? {} : { diagnostics: diagnosticsAsJson(value.diagnostics) }),
    source_event_ids: [...value.source_event_ids],
    attestation_refs: [...value.attestation_refs],
    previous_revision_vector: vectorAsJson(value.previous_revision_vector),
    current_revision_vector: vectorAsJson(value.current_revision_vector),
    ...(value.state_commit === undefined
      ? {}
      : { state_commit: committedStateAsMarkerJson(value.state_commit) }),
    ...(value.fact_relation_commit === undefined
      ? {}
      : { fact_relation_commit: factRelationCommitAsJson(value.fact_relation_commit) }),
    created_at: value.created_at,
  };
}

function committedStateAsMarkerJson(value: CommittedCanonicalStateRevision): JsonObject {
  return {
    namespace: value.namespace,
    stream_id: value.stream_id,
    state_revision: value.state_revision,
    state_commit_id: value.state_commit_id,
    commit_mode: value.commit_mode,
    previous_state_revision: value.previous_state_revision,
    proposal: {
      schema_version: 1,
      upsert_items: value.proposal.upsert_items.map(stateItemAsJson),
    },
    state: { schema_version: 1, items: value.state.items.map(stateItemAsJson) },
    state_hash: value.state_hash,
    policy_hash: value.policy_hash,
    provenance_event_ids: [...value.provenance_event_ids],
    created_at: value.created_at,
  };
}

function factRelationCommitAsJson(value: CanonicalFactRelationCommitResult): JsonObject {
  return {
    namespace: value.namespace,
    stream_id: value.stream_id,
    authority_commit_id: value.authority_commit_id,
    policy_hash: value.policy_hash,
    observed_revision_vector: vectorAsJson(value.observed_revision_vector),
    facts: value.facts.map(committedFactAsJson),
    relations: value.relations.map(committedRelationAsJson),
    created_at: value.created_at,
  };
}

function committedFactAsJson(value: CommittedCanonicalFact): JsonObject {
  return {
    namespace: value.namespace,
    stream_id: value.stream_id,
    fact_id: value.fact_id,
    fact_revision: value.fact_revision,
    authority_commit_id: value.authority_commit_id,
    statement: value.statement,
    epistemic_origin: value.epistemic_origin,
    verification_status: value.verification_status,
    lifecycle_status: value.lifecycle_status,
    record_status: value.record_status,
    provenance_event_ids: [...value.provenance_event_ids],
    verification_event_ids: [...value.verification_event_ids],
    metadata: cloneJsonObject(value.metadata),
    observed_revision_vector: vectorAsJson(value.observed_revision_vector),
    fact_hash: value.fact_hash,
    created_at: value.created_at,
  };
}

function committedRelationAsJson(value: CommittedCanonicalRelation): JsonObject {
  return {
    namespace: value.namespace,
    stream_id: value.stream_id,
    relation_id: value.relation_id,
    relation_revision: value.relation_revision,
    authority_commit_id: value.authority_commit_id,
    source: { ...value.source },
    relation_type: value.relation_type,
    target: { ...value.target },
    origin: value.origin,
    provenance_event_ids: [...value.provenance_event_ids],
    ...(value.confidence === undefined ? {} : { confidence: value.confidence }),
    status: value.status,
    metadata: cloneJsonObject(value.metadata),
    observed_revision_vector: vectorAsJson(value.observed_revision_vector),
    relation_hash: value.relation_hash,
    created_at: value.created_at,
  };
}

function factView(value: CommittedCanonicalFact): SemanticFactViewV1 {
  return {
    fact_id: value.fact_id,
    fact_revision: value.fact_revision,
    statement: value.statement,
    epistemic_origin: value.epistemic_origin,
    verification_status: value.verification_status,
    lifecycle_status: value.lifecycle_status,
    record_status: value.record_status,
    provenance_event_ids: [...value.provenance_event_ids],
    verification_event_ids: [...value.verification_event_ids],
    metadata: cloneJsonObject(value.metadata),
  };
}

function relationView(value: CommittedCanonicalRelation): SemanticRelationViewV1 {
  return {
    relation_id: value.relation_id,
    relation_revision: value.relation_revision,
    source: { ...value.source },
    relation_type: value.relation_type,
    target: { ...value.target },
    origin: value.origin,
    provenance_event_ids: [...value.provenance_event_ids],
    status: value.status,
    metadata: cloneJsonObject(value.metadata),
  };
}

function normalizeScope(value: unknown): RevisionScope {
  const object = readExactObject(value, ["namespace", "stream_id"]);
  const namespace = validateIdentifier(object.namespace);
  if (namespace !== AUTHORITY_NAMESPACE &&
      !(namespace.startsWith(SHADOW_NAMESPACE_PREFIX) &&
        namespace.slice(SHADOW_NAMESPACE_PREFIX.length).trim().length > 0)) invalid();
  return { namespace, stream_id: validateIdentifier(object.stream_id) };
}

function normalizeMetadata(value: unknown): JsonObject {
  const normalized = normalizeJsonValue(value);
  if (normalized === null || typeof normalized !== "object" || Array.isArray(normalized)) invalid();
  return normalized;
}

function normalizeJsonValue(value: unknown, ancestors = new Set<object>()): JsonValue {
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "string") {
    if (value.length > MAX_JSON_STRING || value !== value.normalize("NFC") || /\p{Cc}/u.test(value)) {
      invalid();
    }
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value) || Object.is(value, -0)) invalid();
    return value;
  }
  if (typeof value !== "object" || ancestors.has(value)) invalid();
  const prototype = Object.getPrototypeOf(value);
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      if (prototype !== Array.prototype) invalid();
      assertDenseArray(value);
      return value.map((entry) => normalizeJsonValue(entry, ancestors));
    }
    if (prototype !== Object.prototype && prototype !== null) invalid();
    const result: JsonObject = {};
    const keys = Reflect.ownKeys(value);
    if (keys.some((key) => typeof key !== "string")) invalid();
    for (const key of (keys as string[]).sort()) {
      validateText(key, MAX_IDENTIFIER);
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor?.enumerable || !("value" in descriptor)) invalid();
      Object.defineProperty(result, key, {
        configurable: true,
        enumerable: true,
        writable: true,
        value: normalizeJsonValue(descriptor.value, ancestors),
      });
    }
    return result;
  } finally {
    ancestors.delete(value);
  }
}

function readExactObject(
  value: unknown,
  allowedKeys: readonly string[],
  requiredKeys: readonly string[] = allowedKeys
): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) invalid();
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) invalid();
  const allowed = new Set(allowedKeys);
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string" || !allowed.has(key)) invalid();
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor?.enumerable || !("value" in descriptor)) invalid();
  }
  for (const key of requiredKeys) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) invalid();
  }
  return value as Record<string, unknown>;
}

function readDenseArray(value: unknown, maximum: number): unknown[] {
  if (!Array.isArray(value) || value.length > maximum) invalid();
  assertDenseArray(value);
  return value;
}

function assertDenseArray(value: unknown[]): void {
  if (Object.getPrototypeOf(value) !== Array.prototype) invalid();
  for (const key of Reflect.ownKeys(value)) {
    if (key === "length") continue;
    if (typeof key !== "string" || !/^(0|[1-9][0-9]*)$/u.test(key)) invalid();
    const index = Number(key);
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!Number.isSafeInteger(index) || index < 0 || index >= value.length ||
        !descriptor?.enumerable || !("value" in descriptor)) invalid();
  }
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.prototype.hasOwnProperty.call(value, index)) invalid();
  }
}

function readDiscriminator(value: unknown): string {
  if (typeof value !== "object" || value === null || Array.isArray(value)) invalid();
  const descriptor = Object.getOwnPropertyDescriptor(value, "op");
  if (!descriptor?.enumerable || !("value" in descriptor) || typeof descriptor.value !== "string") {
    invalid();
  }
  return descriptor.value;
}

function assertOnlyPresent(value: Record<string, unknown>, keys: string[]): void {
  const present = Object.keys(value).filter((key) => value[key] !== undefined).sort();
  const expected = [...keys].sort();
  if (!sameStrings(present, expected)) invalid();
}

function normalizeIdentifierSet(value: unknown, minimum: number, maximum: number): string[] {
  return normalizeTextSet(value, minimum, maximum, MAX_IDENTIFIER);
}

function normalizeTextSet(
  value: unknown,
  minimum: number,
  maximum: number,
  textMaximum: number
): string[] {
  const array = readDenseArray(value, maximum);
  if (array.length < minimum) invalid();
  const strings = array.map((entry) => validateText(entry, textMaximum)).sort();
  for (let index = 1; index < strings.length; index += 1) {
    if (strings[index - 1] === strings[index]) invalid();
  }
  return strings;
}

function normalizeEnumSet(
  value: unknown,
  allowed: readonly string[],
  minimum: number,
  maximum: number
): string[] {
  const strings = normalizeTextSet(value, minimum, maximum, MAX_IDENTIFIER);
  if (strings.some((entry) => !allowed.includes(entry))) invalid();
  return strings;
}

function validateIdentifier(value: unknown): string {
  return validateText(value, MAX_IDENTIFIER);
}

function validateText(value: unknown, maximum: number): string {
  if (typeof value !== "string" || value.length === 0 || value.length > maximum ||
      value.trim().length === 0 || value !== value.normalize("NFC") || /\p{Cc}/u.test(value)) {
    invalid();
  }
  return value;
}

function validatePrefixedHash(value: unknown, prefix: "sfprep-" | "sfprop-"): string {
  if (typeof value !== "string" || value.length !== prefix.length + 64 ||
      !value.startsWith(prefix) || !ID_HASH_PATTERN.test(value.slice(prefix.length))) invalid();
  return value;
}

function validateHash(value: unknown): string {
  if (typeof value !== "string" || !ID_HASH_PATTERN.test(value)) invalid();
  return value;
}

function validateTimestamp(value: unknown): string {
  if (typeof value !== "string" || value.length > 100) invalid();
  try {
    if (new Date(value).toISOString() !== value) invalid();
  } catch {
    invalid();
  }
  return value;
}

function deriveObjectId(prefix: string, descriptor: JsonObject): string {
  return `${prefix}${sha256(canonicalJson(descriptor))}`;
}

function scopeAsJson(scope: RevisionScope): JsonObject {
  return { namespace: scope.namespace, stream_id: scope.stream_id };
}

function vectorAsJson(vector: RevisionVector): JsonObject {
  return {
    namespace: vector.namespace,
    stream_id: vector.stream_id,
    ledger_revision: vector.ledger_revision,
    state_revision: vector.state_revision,
    raw_frontier_revision: vector.raw_frontier_revision,
    frontier_position: vector.frontier_position,
    takeover_commit_revision: vector.takeover_commit_revision,
  };
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(normalizeJsonValue(value));
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function parseStoredJson(json: string): JsonValue {
  try {
    const value = normalizeJsonValue(JSON.parse(json));
    if (canonicalJson(value) !== json) corrupt();
    return value;
  } catch (error) {
    if (error instanceof SemanticFormationError && error.code === "CORRUPT_DATA") throw error;
    corrupt();
  }
}

function parseJson(json: string): JsonValue {
  return normalizeJsonValue(JSON.parse(json));
}

function storedScope(namespace: unknown, streamId: unknown): RevisionScope {
  try {
    return normalizeScope({ namespace, stream_id: streamId });
  } catch {
    corrupt();
  }
}

function storedIdentifier(value: unknown): string {
  try {
    return validateIdentifier(value);
  } catch {
    corrupt();
  }
}

function storedHash(value: unknown): string {
  try {
    return validateHash(value);
  } catch {
    corrupt();
  }
}

function storedTimestamp(value: unknown): string {
  try {
    return validateTimestamp(value);
  } catch {
    corrupt();
  }
}

function cloneJson(value: JsonValue): JsonValue {
  return normalizeJsonValue(value);
}

function cloneJsonObject(value: JsonObject): JsonObject {
  return normalizeMetadata(value);
}

function cloneVector(value: RevisionVector): RevisionVector {
  return { ...value };
}

function cloneStateItem(value: CanonicalStateItem): CanonicalStateItem {
  return {
    ...value,
    source_event_ids: [...value.source_event_ids],
    metadata: cloneJsonObject(value.metadata),
  };
}

function cloneRawEvent(value: LedgerRawEvent): LedgerRawEvent {
  return { ...value, payload: cloneJson(value.payload) };
}

function cloneAttestation(
  value: SemanticAttestationVerificationV1
): SemanticAttestationVerificationV1 {
  return { ...value };
}

function cloneChallenge(value: SemanticAttestationChallengeV1): SemanticAttestationChallengeV1 {
  return {
    schema_version: 1,
    receipt_ref: value.receipt_ref,
    evidence_receipt: {
      ...value.evidence_receipt,
      marker_current: cloneVector(value.evidence_receipt.marker_current),
    },
  };
}

function cloneConstraints(value: SemanticContractConstraintsV1): SemanticContractConstraintsV1 {
  return {
    ...value,
    state_operations: [...value.state_operations],
    fact_operations: [...value.fact_operations],
    relation_operations: [...value.relation_operations],
    producer_kinds: [...value.producer_kinds],
  };
}

function clonePreparation(
  value: SemanticInterpretationPreparationV1
): SemanticInterpretationPreparationV1 {
  return parseStoredPreparation(canonicalJson(preparationAsJson(value)));
}

function cloneProposal(value: CanonicalSemanticProposalV1): CanonicalSemanticProposalV1 {
  const normalized = normalizeProposal(proposalAsJson(value), true);
  return {
    schema_version: 1,
    proposal_id: normalized.proposal_id,
    scope: { ...normalized.scope },
    preparation_id: normalized.preparation_id,
    producer: { ...normalized.producer },
    observed: {
      revision_vector: cloneVector(normalized.observed.revision_vector),
      source_event_ids: [...normalized.observed.source_event_ids],
    },
    disposition: normalized.disposition,
    changes: {
      state: normalized.changes.state.map((entry) => cloneJson(entry as unknown as JsonValue) as
        unknown as SemanticStateOperationV1),
      facts: normalized.changes.facts.map((entry) => cloneJson(entry as unknown as JsonValue) as
        unknown as SemanticFactOperationV1),
      relations: normalized.changes.relations.map((entry) => cloneJson(entry as unknown as JsonValue) as
        unknown as SemanticRelationOperationV1),
    },
    ...(normalized.diagnostics === undefined
      ? {}
      : { diagnostics: cloneDiagnostics(normalized.diagnostics) }),
  };
}

function cloneDiagnostics(value: SemanticProposalDiagnosticsV1): SemanticProposalDiagnosticsV1 {
  return {
    ...(value.rule_ids === undefined ? {} : { rule_ids: [...value.rule_ids] }),
    ...(value.confidence === undefined ? {} : { confidence: value.confidence }),
    ...(value.abstain_reason === undefined ? {} : { abstain_reason: value.abstain_reason }),
  };
}

function cloneStateCommit(value: CommittedCanonicalStateRevision): CommittedCanonicalStateRevision {
  return normalizeStateCommitJson(committedStateAsMarkerJson(value), value);
}

function cloneFactRelationCommit(
  value: CanonicalFactRelationCommitResult
): CanonicalFactRelationCommitResult {
  return parseFactRelationCommit(factRelationCommitAsJson(value), value);
}

function cloneApplyResult(value: SemanticProposalApplyResultV1): SemanticProposalApplyResultV1 {
  return parseStoredResult(canonicalJson(resultAsJson(value)));
}

function unionStrings(left: string[], right: string[]): string[] {
  return uniqueSorted([...left, ...right]);
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort();
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((entry, index) => entry === right[index]);
}

function sameScope(left: RevisionScope, right: RevisionScope): boolean {
  return left.namespace === right.namespace && left.stream_id === right.stream_id;
}

function sameVector(left: RevisionVector, right: RevisionVector): boolean {
  return sameScope(left, right) && left.ledger_revision === right.ledger_revision &&
    left.state_revision === right.state_revision &&
    left.raw_frontier_revision === right.raw_frontier_revision &&
    left.frontier_position === right.frontier_position &&
    left.takeover_commit_revision === right.takeover_commit_revision;
}

function vectorAtOrAfter(live: RevisionVector, historical: RevisionVector): boolean {
  return sameScope(live, historical) && live.ledger_revision >= historical.ledger_revision &&
    live.state_revision >= historical.state_revision &&
    live.raw_frontier_revision >= historical.raw_frontier_revision &&
    live.frontier_position >= historical.frontier_position &&
    live.takeover_commit_revision >= historical.takeover_commit_revision;
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function sqliteObjectExists(
  database: DatabaseSync,
  type: string,
  name: string
): boolean {
  return database.prepare(
    "SELECT 1 FROM sqlite_master WHERE type = ? AND name = ?"
  ).get(type, name) !== undefined;
}

function normalizeSchemaSql(value: string): string {
  return value.trim().replace(/\s+/gu, " ").replace(/;$/u, "");
}

function rollback(database: DatabaseSync): void {
  try { database.exec("ROLLBACK;"); } catch { /* preserve original */ }
}

function mapError(error: unknown): SemanticFormationError {
  if (error instanceof SemanticFormationError) return error;
  if (error instanceof RevisionSubstrateError || error instanceof LedgerHotRawError ||
      error instanceof CanonicalStateError || error instanceof CanonicalFactRelationError) {
    switch (error.code) {
      case "INVALID_INPUT": return new SemanticFormationError("INVALID_INPUT");
      case "NOT_FOUND": return new SemanticFormationError("NOT_FOUND");
      case "CONFLICT": return new SemanticFormationError("CONFLICT");
      case "CORRUPT_DATA": return new SemanticFormationError("CORRUPT_DATA");
      case "CLOSED": return new SemanticFormationError("CLOSED");
      case "STORAGE_FAILURE": return new SemanticFormationError("STORAGE_FAILURE");
    }
  }
  return new SemanticFormationError("STORAGE_FAILURE");
}

function invalid(): never {
  throw new SemanticFormationError("INVALID_INPUT");
}

function notFound(): never {
  throw new SemanticFormationError("NOT_FOUND");
}

function conflict(): never {
  throw new SemanticFormationError("CONFLICT");
}

function attestationRejected(): never {
  throw new SemanticFormationError("ATTESTATION_REJECTED");
}

function corrupt(): never {
  throw new SemanticFormationError("CORRUPT_DATA");
}

function storageFailure(): never {
  throw new SemanticFormationError("STORAGE_FAILURE");
}
