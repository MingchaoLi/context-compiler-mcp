import { createHash } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

import {
  appendFormationExperienceInsideTransaction,
  type ExperienceLedgerRecord,
} from "./experience-ledger.js";
import {
  type RawSourceKind,
  SqliteLedgerHotRawStore,
} from "./ledger-hot-raw.js";
import {
  computeRawIngestFingerprint,
  type JsonObject,
  type JsonValue,
  type RawEvent,
  type SqliteRawHistoryStore,
} from "./raw-store.js";
import { type RevisionScope, type RevisionVector } from "./revision-substrate.js";
import {
  readSemanticProposalResultInsideCore,
  type SemanticProposalApplyResultV1,
} from "./semantic-formation.js";
import { initializeSqliteConnection } from "./sqlite-initialization.js";

export const RUNTIME_RAW_EVIDENCE_PROJECTION_CONTRACT =
  "ripplecontext-runtime-raw-evidence-projection/v1" as const;
export const CASE_FORMATION_CONTRACT_VERSION = "ripplecontext-case-formation/v1" as const;
export const CASE_FORMATION_READ_CONTRACT_VERSION =
  "ripplecontext-case-formation-read/v1" as const;
export const CASE_FORMATION_SESSION_SCOPE_VERSION =
  "ripplecontext-session-scope/v1" as const;

export const CASE_CONCLUSION_CHANGE_TYPES = [
  "INITIAL",
  "REAFFIRM",
  "AUGMENT",
  "AMEND",
  "SUPERSEDE",
  "REVOKE",
] as const;

export type CaseConclusionChangeType = (typeof CASE_CONCLUSION_CHANGE_TYPES)[number];
export type CaseEpisodeClassification = "CHECKPOINTED" | "SEALED";
export type CaseActivity = "ACTIVE" | "DORMANT" | "REOPENED";
export type CaseFormationErrorCode =
  | "INVALID_INPUT"
  | "NOT_FOUND"
  | "CONFLICT"
  | "CORRUPT_DATA"
  | "STORAGE_FAILURE"
  | "CLOSED";

export class CaseFormationError extends Error {
  constructor(readonly code: CaseFormationErrorCode) {
    super(code);
    this.name = "CaseFormationError";
  }
}

export interface RuntimeRawReceiptRefV1 {
  raw_event_id: string;
  raw_sequence: number;
  ingest_fingerprint: string;
}

export interface RuntimeRawEvidenceProjectionRequestV1 {
  contract: typeof RUNTIME_RAW_EVIDENCE_PROJECTION_CONTRACT;
  schema_version: 1;
  scope: RevisionScope;
  ordered_raw_receipts: RuntimeRawReceiptRefV1[];
}

export interface RuntimeRawEvidenceProjectionRefV1 extends RuntimeRawReceiptRefV1 {
  event_id: string;
  ledger_revision: number;
}

export interface RuntimeRawEvidenceProjectionResultV1 extends RevisionScope {
  contract: typeof RUNTIME_RAW_EVIDENCE_PROJECTION_CONTRACT;
  schema_version: 1;
  ordered_event_refs: RuntimeRawEvidenceProjectionRefV1[];
}

export interface CaseSessionRefV1 {
  namespace: string;
  session_id: string;
}

export interface CaseSessionScopeEntryV1 {
  session: CaseSessionRefV1;
  frontier:
    | { kind: "CURRENT" }
    | { kind: "FROZEN"; raw_sequence: number; state_revision: number };
  precedence: number;
}

/** Structurally identical to PI-002/003's provider-neutral SessionScope v1. */
export interface CaseSessionScopeV1 {
  contract_version: typeof CASE_FORMATION_SESSION_SCOPE_VERSION;
  write_session: CaseSessionRefV1;
  read_scope: CaseSessionScopeEntryV1[];
}

export interface CaseRepoAnchorV1 {
  kind: "FILE" | "SYMBOL" | "TEST" | "COMMIT" | "WORK_ORDER";
  value: string;
  revision?: string;
}

export type CaseOutcomeEvidenceV1 = {
  kind: "ACTION_RESULT";
  status: "SUCCESS" | "ERROR";
  source_event_id: string;
  summary: string;
} | {
  kind: "TEST_RESULT";
  status: "PASS" | "FAIL";
  source_event_id: string;
  summary: string;
};

export interface CaseUserFeedbackEvidenceV1 {
  kind: "USER_FEEDBACK";
  status: "ACCEPTED" | "REJECTED";
  source_event_id: string;
  summary: string;
}

export interface CaseReuseEvidenceV1 {
  kind: "REUSE_OBSERVATION" | "REUSE_APPLICATION";
  source_event_id: string;
  summary: string;
}

export interface CaseFormationProducerV1 {
  kind: "RULE" | "LOCAL_MODEL" | "REMOTE_MODEL";
  implementation_id: string;
  implementation_version: string;
  policy_version: string;
}

export type CaseExperienceDispositionV1 =
  | {
    status: "FORMED";
    action: string;
    outcome: string;
    feedback: string;
    reuse_condition: string;
    outcome_evidence_event_ids: string[];
    feedback_evidence_event_ids: string[];
    reuse_evidence_event_ids: string[];
  }
  | { status: "NOT_FORMED"; reason_code: string };

export interface CaseConclusionCommitInputV1 {
  contract: typeof CASE_FORMATION_CONTRACT_VERSION;
  schema_version: 1;
  session_scope: CaseSessionScopeV1;
  case_id: string;
  anchor_id: string;
  episode_id: string;
  reopen_cycle_id: string;
  expected_head_revision_id: string | null;
  change_type: CaseConclusionChangeType;
  classification: CaseEpisodeClassification;
  conclusion: string | null;
  open_questions: string[];
  repo_anchors: CaseRepoAnchorV1[];
  outcomes: CaseOutcomeEvidenceV1[];
  user_feedback: CaseUserFeedbackEvidenceV1[];
  reuse_evidence: CaseReuseEvidenceV1[];
  ordered_raw_receipts: RuntimeRawReceiptRefV1[];
  source_event_ids: string[];
  semantic_proposal_id: string;
  producer: CaseFormationProducerV1;
  confidence: number;
  experience: CaseExperienceDispositionV1;
}

export interface CaseFormationAbstainInputV1 {
  contract: typeof CASE_FORMATION_CONTRACT_VERSION;
  schema_version: 1;
  session_scope: CaseSessionScopeV1;
  anchor_id: string;
  episode_id: string;
  case_id: string | null;
  ordered_raw_receipts: RuntimeRawReceiptRefV1[];
  source_event_ids: string[];
  semantic_proposal_id: string;
  producer: CaseFormationProducerV1;
  reason_code: string;
}

export interface CaseConclusionRevisionV1 {
  contract: typeof CASE_FORMATION_CONTRACT_VERSION;
  schema_version: 1;
  scope: RevisionScope;
  case_id: string;
  revision_id: string;
  revision_number: number;
  previous_revision_id: string | null;
  reopen_cycle_id: string;
  anchor_id: string;
  episode_id: string;
  change_type: CaseConclusionChangeType;
  classification: CaseEpisodeClassification;
  lifecycle: "EFFECTIVE_FOR_NOW" | "REVOKED";
  case_activity: CaseActivity;
  conclusion: string | null;
  open_questions: string[];
  repo_anchors: CaseRepoAnchorV1[];
  outcomes: CaseOutcomeEvidenceV1[];
  user_feedback: CaseUserFeedbackEvidenceV1[];
  reuse_evidence: CaseReuseEvidenceV1[];
  ordered_raw_receipts: RuntimeRawReceiptRefV1[];
  source_event_ids: string[];
  semantic_proposal_id: string;
  semantic_result_revision_vector: RevisionVector;
  producer: CaseFormationProducerV1;
  confidence: number;
  experience:
    | (Extract<CaseExperienceDispositionV1, { status: "FORMED" }> & {
      ledger_record_id: string;
    })
    | Extract<CaseExperienceDispositionV1, { status: "NOT_FORMED" }>;
  created_at: string;
}

export type CaseFormationFinalizationReceiptV1 =
  | {
    contract: typeof CASE_FORMATION_CONTRACT_VERSION;
    schema_version: 1;
    status: "AUTHORITY_COMMITTED";
    finalization_id: string;
    scope: RevisionScope;
    case_id: string;
    revision_id: string;
    semantic_proposal_id: string;
    producer: CaseFormationProducerV1;
    confidence: number;
    source_event_ids: string[];
    created_at: string;
  }
  | {
    contract: typeof CASE_FORMATION_CONTRACT_VERSION;
    schema_version: 1;
    status: "RAW_ONLY";
    finalization_id: string;
    scope: RevisionScope;
    case_id: string | null;
    semantic_proposal_id: string;
    source_event_ids: string[];
    producer: CaseFormationProducerV1;
    reason_code: string;
    created_at: string;
  };

export interface CaseFormationReadRequestV1 {
  contract: typeof CASE_FORMATION_READ_CONTRACT_VERSION;
  schema_version: 1;
  session_scope: CaseSessionScopeV1;
  case_id?: string;
}

export interface CaseFormationCaseViewV1 {
  case_id: string;
  case_activity: CaseActivity;
  effective_head_revision_id: string;
  effective_conclusion: CaseConclusionRevisionV1;
  revision_history: CaseConclusionRevisionV1[];
}

export interface CaseFormationReadResultV1 {
  contract: typeof CASE_FORMATION_READ_CONTRACT_VERSION;
  schema_version: 1;
  session_scope: CaseSessionScopeV1;
  cases: CaseFormationCaseViewV1[];
  raw_only_finalizations: Extract<CaseFormationFinalizationReceiptV1, { status: "RAW_ONLY" }>[];
}

interface RevisionRow extends Record<string, unknown> {
  namespace: string;
  stream_id: string;
  case_id: string;
  revision_id: string;
  revision_number: number;
  reopen_cycle_id: string;
  semantic_proposal_id: string;
  request_hash: string;
  request_json: string;
  max_raw_sequence: number;
  semantic_state_revision: number;
  revision_hash: string;
  revision_json: string;
}

interface FinalizationRow extends Record<string, unknown> {
  namespace: string;
  stream_id: string;
  finalization_id: string;
  request_hash: string;
  request_json: string;
  max_raw_sequence: number;
  semantic_state_revision: number;
  receipt_hash: string;
  receipt_json: string;
}

const MAX_ID = 500;
const MAX_TEXT = 10_000;
const MAX_RAW_REFS = 500;
const MAX_OPEN_QUESTIONS = 100;
const MAX_REPO_ANCHORS = 200;
const MAX_OUTCOMES = 200;
const SHA256 = /^[a-f0-9]{64}$/u;
const RAW_INGEST_FINGERPRINT = /^raw_ingest_request_sha256_v1:[a-f0-9]{64}$/u;

const MIGRATION_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS cc_case_conclusion_revisions (
     namespace TEXT NOT NULL,
     stream_id TEXT NOT NULL,
     case_id TEXT NOT NULL,
     revision_id TEXT NOT NULL,
     revision_number INTEGER NOT NULL CHECK (revision_number > 0),
     reopen_cycle_id TEXT NOT NULL,
     semantic_proposal_id TEXT NOT NULL,
     request_hash TEXT NOT NULL,
     request_json TEXT NOT NULL CHECK (json_valid(request_json)),
     max_raw_sequence INTEGER NOT NULL CHECK (max_raw_sequence > 0),
     semantic_state_revision INTEGER NOT NULL CHECK (semantic_state_revision >= 0),
     revision_hash TEXT NOT NULL,
     revision_json TEXT NOT NULL CHECK (json_valid(revision_json)),
     PRIMARY KEY (namespace, stream_id, revision_id),
     UNIQUE (namespace, stream_id, semantic_proposal_id),
     UNIQUE (namespace, stream_id, case_id, revision_number)
   ) STRICT`,
  `CREATE INDEX IF NOT EXISTS cc_case_revision_read
     ON cc_case_conclusion_revisions
       (namespace, stream_id, case_id, max_raw_sequence, semantic_state_revision, revision_number)`,
  `CREATE TABLE IF NOT EXISTS cc_case_finalizations (
     namespace TEXT NOT NULL,
     stream_id TEXT NOT NULL,
     finalization_id TEXT NOT NULL,
     request_hash TEXT NOT NULL,
     request_json TEXT NOT NULL CHECK (json_valid(request_json)),
     max_raw_sequence INTEGER NOT NULL CHECK (max_raw_sequence > 0),
     semantic_state_revision INTEGER NOT NULL CHECK (semantic_state_revision >= 0),
     receipt_hash TEXT NOT NULL,
     receipt_json TEXT NOT NULL CHECK (json_valid(receipt_json)),
     PRIMARY KEY (namespace, stream_id, finalization_id)
   ) STRICT`,
  `CREATE INDEX IF NOT EXISTS cc_case_finalization_read
     ON cc_case_finalizations
       (namespace, stream_id, max_raw_sequence, semantic_state_revision)`,
  ...[
    ["cc_case_revisions_no_update", "cc_case_conclusion_revisions", "UPDATE"],
    ["cc_case_revisions_no_delete", "cc_case_conclusion_revisions", "DELETE"],
    ["cc_case_finalizations_no_update", "cc_case_finalizations", "UPDATE"],
    ["cc_case_finalizations_no_delete", "cc_case_finalizations", "DELETE"],
  ].map(([name, table, operation]) =>
    `CREATE TRIGGER IF NOT EXISTS ${name} BEFORE ${operation} ON ${table}
       BEGIN SELECT RAISE(ABORT, '${table} is append-only'); END`),
] as const;

export class RuntimeRawEvidenceProjector {
  constructor(
    private readonly rawStore: Pick<SqliteRawHistoryStore, "getEvent">,
    private readonly hotRawStore: Pick<SqliteLedgerHotRawStore, "append">,
  ) {}

  project(inputValue: RuntimeRawEvidenceProjectionRequestV1): RuntimeRawEvidenceProjectionResultV1 {
    const input = normalizeProjectionRequest(inputValue);
    const projected = input.ordered_raw_receipts.map((receipt) => {
      const raw = exactRaw(this.rawStore, input.scope.stream_id, receipt);
      const eventId = projectedEventId(raw.id);
      const event = this.hotRawStore.append({
        scope: input.scope,
        event_id: eventId,
        source_kind: rawSourceKind(raw),
        source_id: requiredId(raw.source_event_id),
        source_session_id: raw.session_id,
        payload: {
          contract: RUNTIME_RAW_EVIDENCE_PROJECTION_CONTRACT,
          raw_event_id: raw.id,
          raw_sequence: raw.seq,
          ingest_fingerprint: receipt.ingest_fingerprint,
        },
        occurred_at: raw.created_at,
      });
      return {
        ...receipt,
        event_id: event.event_id,
        ledger_revision: event.ledger_revision,
      };
    });
    return {
      contract: RUNTIME_RAW_EVIDENCE_PROJECTION_CONTRACT,
      schema_version: 1,
      ...input.scope,
      ordered_event_refs: projected,
    };
  }
}

export class SqliteCaseFormationStore {
  readonly #database: DatabaseSync;
  #closed = false;

  constructor(
    databasePath: string,
    private readonly rawStore: Pick<SqliteRawHistoryStore, "getEvent">,
  ) {
    if (typeof databasePath !== "string" || databasePath.length === 0 ||
        typeof rawStore?.getEvent !== "function") invalid();
    let database: DatabaseSync | undefined;
    try {
      if (databasePath !== ":memory:") mkdirSync(dirname(databasePath), { recursive: true });
      database = new DatabaseSync(databasePath);
      initializeSqliteConnection(database, databasePath, () => {
        for (const statement of MIGRATION_STATEMENTS) database!.exec(statement);
      });
      this.#database = database;
    } catch (error) {
      try { database?.close(); } catch { /* preserve startup error */ }
      if (error instanceof CaseFormationError) throw error;
      storageFailure();
    }
  }

  commit(inputValue: CaseConclusionCommitInputV1): CaseFormationFinalizationReceiptV1 {
    this.#assertOpen();
    const input = normalizeCommitInput(inputValue);
    const scope = writeScope(input.session_scope);
    const rawEvents = input.ordered_raw_receipts.map((ref) =>
      exactRaw(this.rawStore, scope.stream_id, ref));
    const maxRawSequence = Math.max(...rawEvents.map((event) => event.seq));
    try {
      this.#database.exec("BEGIN IMMEDIATE;");
      const semantic = readSemanticProposalResultInsideCore(
        this.#database,
        scope,
        input.semantic_proposal_id,
      );
      assertSemanticBinding(semantic, input.source_event_ids, "PROPOSED", input.producer);
      const requestJson = canonicalJson(commitInputAsJson(input));
      const requestHash = sha256(requestJson);
      const existingProposal = this.#database.prepare(
        `SELECT * FROM cc_case_conclusion_revisions
         WHERE namespace = ? AND stream_id = ? AND semantic_proposal_id = ?`,
      ).get(scope.namespace, scope.stream_id, input.semantic_proposal_id) as
        RevisionRow | undefined;
      if (existingProposal !== undefined) {
        if (existingProposal.request_hash !== requestHash || existingProposal.request_json !== requestJson) conflict();
        const receipt = readCommittedReceiptForRevision(
          this.#database,
          scope,
          existingProposal.revision_id,
        );
        this.#database.exec("COMMIT;");
        return receipt;
      }
      const currentHead = readEffectiveHead(this.#database, input.session_scope, input.case_id);
      const expected = input.expected_head_revision_id;
      if ((currentHead?.revision_id ?? null) !== expected) conflict();
      if ((currentHead === undefined) !== (input.change_type === "INITIAL")) conflict();
      const revisionNumber = (currentHead?.revision_number ?? 0) + 1;
      const revisionId = `conclusion-${sha256(canonicalJson({
        request: parseJson(requestJson),
        revision_number: revisionNumber,
        previous_revision_id: currentHead?.revision_id ?? null,
        semantic_result: semanticResultIdentity(semantic),
      }))}`;
      let experienceLedger: ExperienceLedgerRecord | undefined;
      if (input.experience.status === "FORMED") {
        experienceLedger = appendFormationExperienceInsideTransaction(this.#database, {
          session_id: scope.stream_id,
          kind: "CANDIDATE_EXPERIENCE",
          source_key: `case-experience/${encodeURIComponent(revisionId)}`,
          raw_event_ids: rawEvents.map((event) => event.id),
          parent_ledger_ids: [],
          payload: {
            contract: CASE_FORMATION_CONTRACT_VERSION,
            case_id: input.case_id,
            conclusion_revision_id: revisionId,
            action: input.experience.action,
            outcome: input.experience.outcome,
            feedback: input.experience.feedback,
            reuse_condition: input.experience.reuse_condition,
            outcome_evidence_event_ids: input.experience.outcome_evidence_event_ids,
            feedback_evidence_event_ids: input.experience.feedback_evidence_event_ids,
            reuse_evidence_event_ids: input.experience.reuse_evidence_event_ids,
          },
        });
      }
      const createdAt = new Date().toISOString();
      const revision: CaseConclusionRevisionV1 = {
        contract: CASE_FORMATION_CONTRACT_VERSION,
        schema_version: 1,
        scope,
        case_id: input.case_id,
        revision_id: revisionId,
        revision_number: revisionNumber,
        previous_revision_id: currentHead?.revision_id ?? null,
        reopen_cycle_id: input.reopen_cycle_id,
        anchor_id: input.anchor_id,
        episode_id: input.episode_id,
        change_type: input.change_type,
        classification: input.classification,
        lifecycle: input.change_type === "REVOKE" ? "REVOKED" : "EFFECTIVE_FOR_NOW",
        case_activity: input.classification === "SEALED"
          ? "DORMANT"
          : (currentHead?.case_activity === "DORMANT" &&
              currentHead.reopen_cycle_id !== input.reopen_cycle_id) ||
              (currentHead?.case_activity === "REOPENED" &&
                currentHead.reopen_cycle_id === input.reopen_cycle_id)
            ? "REOPENED"
            : "ACTIVE",
        conclusion: input.conclusion,
        open_questions: [...input.open_questions],
        repo_anchors: input.repo_anchors.map(cloneRepoAnchor),
        outcomes: input.outcomes.map((outcome) => ({ ...outcome })),
        user_feedback: input.user_feedback.map((feedback) => ({ ...feedback })),
        reuse_evidence: input.reuse_evidence.map((evidence) => ({ ...evidence })),
        ordered_raw_receipts: input.ordered_raw_receipts.map((ref) => ({ ...ref })),
        source_event_ids: [...input.source_event_ids],
        semantic_proposal_id: input.semantic_proposal_id,
        semantic_result_revision_vector: cloneVector(semantic.current_revision_vector),
        producer: { ...input.producer },
        confidence: input.confidence,
        experience: input.experience.status === "FORMED"
          ? { ...cloneFormedExperience(input.experience), ledger_record_id: experienceLedger!.id }
          : { ...input.experience },
        created_at: createdAt,
      };
      const revisionJson = canonicalJson(revision as unknown as JsonValue);
      this.#database.prepare(
        `INSERT INTO cc_case_conclusion_revisions (
           namespace, stream_id, case_id, revision_id, revision_number, reopen_cycle_id,
           semantic_proposal_id, request_hash, request_json, max_raw_sequence, semantic_state_revision,
           revision_hash, revision_json
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        scope.namespace,
        scope.stream_id,
        input.case_id,
        revisionId,
        revisionNumber,
        input.reopen_cycle_id,
        input.semantic_proposal_id,
        requestHash,
        requestJson,
        maxRawSequence,
        semantic.current_revision_vector.state_revision,
        sha256(revisionJson),
        revisionJson,
      );
      const finalizationId = finalizationIdFor(input.semantic_proposal_id, input.anchor_id, input.episode_id);
      const receipt: CaseFormationFinalizationReceiptV1 = {
        contract: CASE_FORMATION_CONTRACT_VERSION,
        schema_version: 1,
        status: "AUTHORITY_COMMITTED",
        finalization_id: finalizationId,
        scope,
        case_id: input.case_id,
        revision_id: revisionId,
        semantic_proposal_id: input.semantic_proposal_id,
        source_event_ids: [...input.source_event_ids],
        producer: { ...input.producer },
        confidence: input.confidence,
        created_at: createdAt,
      };
      insertFinalization(
        this.#database,
        scope,
        finalizationId,
        requestHash,
        requestJson,
        maxRawSequence,
        semantic.current_revision_vector.state_revision,
        receipt,
      );
      const persisted = readFinalization(this.#database, scope, finalizationId);
      this.#database.exec("COMMIT;");
      return persisted;
    } catch (error) {
      rollback(this.#database);
      throw mapError(error);
    }
  }

  abstain(inputValue: CaseFormationAbstainInputV1): CaseFormationFinalizationReceiptV1 {
    this.#assertOpen();
    const input = normalizeAbstainInput(inputValue);
    const scope = writeScope(input.session_scope);
    const rawEvents = input.ordered_raw_receipts.map((ref) =>
      exactRaw(this.rawStore, scope.stream_id, ref));
    const maxRawSequence = Math.max(...rawEvents.map((event) => event.seq));
    const requestJson = canonicalJson(abstainInputAsJson(input));
    const requestHash = sha256(requestJson);
    const finalizationId = finalizationIdFor(input.semantic_proposal_id, input.anchor_id, input.episode_id);
    try {
      this.#database.exec("BEGIN IMMEDIATE;");
      const replay = readFinalizationOptional(this.#database, scope, finalizationId);
      if (replay !== undefined) {
        const stored = this.#database.prepare(
          `SELECT request_hash, request_json FROM cc_case_finalizations
           WHERE namespace = ? AND stream_id = ? AND finalization_id = ?`,
        ).get(scope.namespace, scope.stream_id, finalizationId) as
          { request_hash: string; request_json: string };
        if (stored.request_hash !== requestHash || stored.request_json !== requestJson) conflict();
        this.#database.exec("COMMIT;");
        return replay;
      }
      const semantic = readSemanticProposalResultInsideCore(
        this.#database,
        scope,
        input.semantic_proposal_id,
      );
      assertSemanticBinding(semantic, input.source_event_ids, "ABSTAINED", input.producer);
      const createdAt = new Date().toISOString();
      const receipt: CaseFormationFinalizationReceiptV1 = {
        contract: CASE_FORMATION_CONTRACT_VERSION,
        schema_version: 1,
        status: "RAW_ONLY",
        finalization_id: finalizationId,
        scope,
        case_id: input.case_id,
        semantic_proposal_id: input.semantic_proposal_id,
        source_event_ids: [...input.source_event_ids],
        producer: { ...input.producer },
        reason_code: input.reason_code,
        created_at: createdAt,
      };
      insertFinalization(
        this.#database,
        scope,
        finalizationId,
        requestHash,
        requestJson,
        maxRawSequence,
        semantic.current_revision_vector.state_revision,
        receipt,
      );
      const persisted = readFinalization(this.#database, scope, finalizationId);
      this.#database.exec("COMMIT;");
      return persisted;
    } catch (error) {
      rollback(this.#database);
      throw mapError(error);
    }
  }

  read(requestValue: CaseFormationReadRequestV1): CaseFormationReadResultV1 {
    this.#assertOpen();
    const request = normalizeReadRequest(requestValue);
    try {
      this.#database.exec("BEGIN;");
      const caseIds = request.case_id === undefined
        ? visibleCaseIds(this.#database, request.session_scope)
        : [request.case_id];
      const cases = caseIds.flatMap((caseId) => {
        const history = readVisibleRevisions(this.#database, request.session_scope, caseId);
        if (history.length === 0) return [];
        const head = effectiveHeadFrom(history, request.session_scope);
        return [{
          case_id: caseId,
          case_activity: head.case_activity,
          effective_head_revision_id: head.revision_id,
          effective_conclusion: head,
          revision_history: history.map(({ revision }) => revision),
        }];
      }).sort((left, right) => compareText(left.case_id, right.case_id));
      const rawOnly = readVisibleRawOnlyFinalizations(this.#database, request.session_scope);
      const result: CaseFormationReadResultV1 = {
        contract: CASE_FORMATION_READ_CONTRACT_VERSION,
        schema_version: 1,
        session_scope: cloneSessionScope(request.session_scope),
        cases,
        raw_only_finalizations: rawOnly,
      };
      this.#database.exec("COMMIT;");
      return result;
    } catch (error) {
      rollback(this.#database);
      throw mapError(error);
    }
  }

  close(): void {
    if (this.#closed) return;
    try {
      this.#database.close();
      this.#closed = true;
    } catch {
      storageFailure();
    }
  }

  #assertOpen(): void {
    if (this.#closed) throw new CaseFormationError("CLOSED");
  }
}

interface VisibleRevision {
  revision: CaseConclusionRevisionV1;
  precedence: number;
}

function normalizeProjectionRequest(value: unknown): RuntimeRawEvidenceProjectionRequestV1 {
  const object = exactObject(value, ["contract", "schema_version", "scope", "ordered_raw_receipts"]);
  if (object.contract !== RUNTIME_RAW_EVIDENCE_PROJECTION_CONTRACT || object.schema_version !== 1) invalid();
  return {
    contract: RUNTIME_RAW_EVIDENCE_PROJECTION_CONTRACT,
    schema_version: 1,
    scope: normalizeScope(object.scope),
    ordered_raw_receipts: normalizeRawRefs(object.ordered_raw_receipts),
  };
}

function normalizeCommitInput(value: unknown): CaseConclusionCommitInputV1 {
  const object = exactObject(value, [
    "contract", "schema_version", "session_scope", "case_id", "anchor_id", "episode_id",
    "reopen_cycle_id", "expected_head_revision_id", "change_type", "classification", "conclusion",
    "open_questions", "repo_anchors", "outcomes", "user_feedback", "reuse_evidence",
    "ordered_raw_receipts", "source_event_ids",
    "semantic_proposal_id", "producer", "confidence", "experience",
  ]);
  if (object.contract !== CASE_FORMATION_CONTRACT_VERSION || object.schema_version !== 1) invalid();
  if (!CASE_CONCLUSION_CHANGE_TYPES.includes(object.change_type as CaseConclusionChangeType)) invalid();
  if (object.classification !== "CHECKPOINTED" && object.classification !== "SEALED") invalid();
  const changeType = object.change_type as CaseConclusionChangeType;
  const conclusion = object.conclusion === null ? null : text(object.conclusion);
  if ((changeType === "REVOKE") !== (conclusion === null)) invalid();
  const rawRefs = normalizeRawRefs(object.ordered_raw_receipts);
  const sourceEventIds = textSet(object.source_event_ids, 1, MAX_RAW_REFS);
  if (sourceEventIds.length !== rawRefs.length) invalid();
  const outcomes = arrayValues(object.outcomes, MAX_OUTCOMES).map(normalizeOutcome);
  const userFeedback = arrayValues(object.user_feedback, MAX_OUTCOMES).map(normalizeUserFeedback);
  const reuseEvidence = arrayValues(object.reuse_evidence, MAX_OUTCOMES).map(normalizeReuseEvidence);
  if ([...outcomes, ...userFeedback, ...reuseEvidence].some((evidence) =>
    !sourceEventIds.includes(evidence.source_event_id))) invalid();
  const experience = normalizeExperience(
    object.experience,
    sourceEventIds,
    outcomes,
    userFeedback,
    reuseEvidence,
  );
  return {
    contract: CASE_FORMATION_CONTRACT_VERSION,
    schema_version: 1,
    session_scope: normalizeSessionScope(object.session_scope),
    case_id: id(object.case_id),
    anchor_id: id(object.anchor_id),
    episode_id: id(object.episode_id),
    reopen_cycle_id: id(object.reopen_cycle_id),
    expected_head_revision_id: object.expected_head_revision_id === null
      ? null
      : id(object.expected_head_revision_id),
    change_type: changeType,
    classification: object.classification as CaseEpisodeClassification,
    conclusion,
    open_questions: textList(object.open_questions, MAX_OPEN_QUESTIONS),
    repo_anchors: arrayValues(object.repo_anchors, MAX_REPO_ANCHORS).map(normalizeRepoAnchor),
    outcomes,
    user_feedback: userFeedback,
    reuse_evidence: reuseEvidence,
    ordered_raw_receipts: rawRefs,
    source_event_ids: sourceEventIds,
    semantic_proposal_id: id(object.semantic_proposal_id),
    producer: normalizeProducer(object.producer),
    confidence: confidence(object.confidence),
    experience,
  };
}

function normalizeAbstainInput(value: unknown): CaseFormationAbstainInputV1 {
  const object = exactObject(value, [
    "contract", "schema_version", "session_scope", "anchor_id", "episode_id", "case_id",
    "ordered_raw_receipts", "source_event_ids", "semantic_proposal_id", "producer", "reason_code",
  ]);
  if (object.contract !== CASE_FORMATION_CONTRACT_VERSION || object.schema_version !== 1) invalid();
  const refs = normalizeRawRefs(object.ordered_raw_receipts);
  const sourceEventIds = textSet(object.source_event_ids, 1, MAX_RAW_REFS);
  if (refs.length !== sourceEventIds.length) invalid();
  return {
    contract: CASE_FORMATION_CONTRACT_VERSION,
    schema_version: 1,
    session_scope: normalizeSessionScope(object.session_scope),
    anchor_id: id(object.anchor_id),
    episode_id: id(object.episode_id),
    case_id: object.case_id === null ? null : id(object.case_id),
    ordered_raw_receipts: refs,
    source_event_ids: sourceEventIds,
    semantic_proposal_id: id(object.semantic_proposal_id),
    producer: normalizeProducer(object.producer),
    reason_code: id(object.reason_code),
  };
}

function normalizeReadRequest(value: unknown): CaseFormationReadRequestV1 {
  const object = exactObject(value, ["contract", "schema_version", "session_scope"], ["case_id"]);
  if (object.contract !== CASE_FORMATION_READ_CONTRACT_VERSION || object.schema_version !== 1) invalid();
  return {
    contract: CASE_FORMATION_READ_CONTRACT_VERSION,
    schema_version: 1,
    session_scope: normalizeSessionScope(object.session_scope),
    ...(object.case_id === undefined ? {} : { case_id: id(object.case_id) }),
  };
}

function normalizeSessionScope(value: unknown): CaseSessionScopeV1 {
  const object = exactObject(value, ["contract_version", "write_session", "read_scope"]);
  if (object.contract_version !== CASE_FORMATION_SESSION_SCOPE_VERSION) invalid();
  const writeSession = normalizeSessionRef(object.write_session);
  const entries = arrayValues(object.read_scope, 64).map((entryValue, index, all) => {
    const entry = exactObject(entryValue, ["session", "frontier", "precedence"]);
    if (entry.precedence !== index) invalid();
    const session = normalizeSessionRef(entry.session);
    const frontierObject = exactObject(
      entry.frontier,
      ownValue(entry.frontier, "kind") === "CURRENT"
        ? ["kind"]
        : ["kind", "raw_sequence", "state_revision"],
    );
    const frontier = frontierObject.kind === "CURRENT"
      ? { kind: "CURRENT" as const }
      : frontierObject.kind === "FROZEN" && revision(frontierObject.raw_sequence) &&
          revision(frontierObject.state_revision)
        ? {
          kind: "FROZEN" as const,
          raw_sequence: frontierObject.raw_sequence,
          state_revision: frontierObject.state_revision,
        }
        : invalid();
    if ((index === all.length - 1) !== (frontier.kind === "CURRENT")) invalid();
    return { session, frontier, precedence: index };
  });
  if (entries.length === 0 || entries.some(({ session }) => session.namespace !== "authority")) invalid();
  const identities = new Set(entries.map(({ session }) => sessionKey(session)));
  if (identities.size !== entries.length ||
      sessionKey(entries.at(-1)!.session) !== sessionKey(writeSession)) invalid();
  return {
    contract_version: CASE_FORMATION_SESSION_SCOPE_VERSION,
    write_session: writeSession,
    read_scope: entries,
  };
}

function normalizeSessionRef(value: unknown): CaseSessionRefV1 {
  const object = exactObject(value, ["namespace", "session_id"]);
  return { namespace: id(object.namespace), session_id: id(object.session_id) };
}

function normalizeScope(value: unknown): RevisionScope {
  const object = exactObject(value, ["namespace", "stream_id"]);
  const scope = { namespace: id(object.namespace), stream_id: id(object.stream_id) };
  if (scope.namespace !== "authority") invalid();
  return scope;
}

function normalizeRawRefs(value: unknown): RuntimeRawReceiptRefV1[] {
  const refs = arrayValues(value, MAX_RAW_REFS).map((item) => {
    const object = exactObject(item, ["raw_event_id", "raw_sequence", "ingest_fingerprint"]);
    if (!positiveRevision(object.raw_sequence) ||
        !RAW_INGEST_FINGERPRINT.test(String(object.ingest_fingerprint))) invalid();
    return {
      raw_event_id: id(object.raw_event_id),
      raw_sequence: object.raw_sequence as number,
      ingest_fingerprint: object.ingest_fingerprint as string,
    };
  });
  if (refs.length === 0) invalid();
  const ids = new Set<string>();
  let previous = 0;
  for (const ref of refs) {
    if (ids.has(ref.raw_event_id) || ref.raw_sequence <= previous) invalid();
    ids.add(ref.raw_event_id);
    previous = ref.raw_sequence;
  }
  return refs;
}

function normalizeRepoAnchor(value: unknown): CaseRepoAnchorV1 {
  const object = exactObject(value, ["kind", "value"], ["revision"]);
  if (!["FILE", "SYMBOL", "TEST", "COMMIT", "WORK_ORDER"].includes(String(object.kind))) invalid();
  return {
    kind: object.kind as CaseRepoAnchorV1["kind"],
    value: text(object.value),
    ...(object.revision === undefined ? {} : { revision: id(object.revision) }),
  };
}

function normalizeOutcome(value: unknown): CaseOutcomeEvidenceV1 {
  const object = exactObject(value, ["kind", "status", "source_event_id", "summary"]);
  if ((object.kind === "ACTION_RESULT" && object.status !== "SUCCESS" && object.status !== "ERROR") ||
      (object.kind === "TEST_RESULT" && object.status !== "PASS" && object.status !== "FAIL") ||
      (object.kind !== "ACTION_RESULT" && object.kind !== "TEST_RESULT")) invalid();
  const common = { source_event_id: id(object.source_event_id), summary: text(object.summary) };
  return object.kind === "ACTION_RESULT"
    ? { kind: "ACTION_RESULT", status: object.status as "SUCCESS" | "ERROR", ...common }
    : { kind: "TEST_RESULT", status: object.status as "PASS" | "FAIL", ...common };
}

function normalizeUserFeedback(value: unknown): CaseUserFeedbackEvidenceV1 {
  const object = exactObject(value, ["kind", "status", "source_event_id", "summary"]);
  if (object.kind !== "USER_FEEDBACK" ||
      (object.status !== "ACCEPTED" && object.status !== "REJECTED")) invalid();
  return {
    kind: "USER_FEEDBACK",
    status: object.status,
    source_event_id: id(object.source_event_id),
    summary: text(object.summary),
  };
}

function normalizeReuseEvidence(value: unknown): CaseReuseEvidenceV1 {
  const object = exactObject(value, ["kind", "source_event_id", "summary"]);
  if (object.kind !== "REUSE_OBSERVATION" && object.kind !== "REUSE_APPLICATION") invalid();
  return {
    kind: object.kind,
    source_event_id: id(object.source_event_id),
    summary: text(object.summary),
  };
}

function normalizeExperience(
  value: unknown,
  sourceEventIds: string[],
  outcomes: readonly CaseOutcomeEvidenceV1[],
  feedback: readonly CaseUserFeedbackEvidenceV1[],
  reuseEvidence: readonly CaseReuseEvidenceV1[],
): CaseExperienceDispositionV1 {
  const status = ownValue(value, "status");
  if (status === "NOT_FORMED") {
    const object = exactObject(value, ["status", "reason_code"]);
    return { status, reason_code: id(object.reason_code) };
  }
  const object = exactObject(value, [
    "status", "action", "outcome", "feedback", "reuse_condition",
    "outcome_evidence_event_ids", "feedback_evidence_event_ids", "reuse_evidence_event_ids",
  ]);
  if (object.status !== "FORMED") invalid();
  const lists = [
    textSet(object.outcome_evidence_event_ids, 0, MAX_RAW_REFS),
    textSet(object.feedback_evidence_event_ids, 0, MAX_RAW_REFS),
    textSet(object.reuse_evidence_event_ids, 0, MAX_RAW_REFS),
  ];
  if (lists.flat().some((eventId) => !sourceEventIds.includes(eventId))) invalid();
  if (lists.some(items => items.length === 0)) {
    return { status: "NOT_FORMED", reason_code: "EXPERIENCE_EVIDENCE_INCOMPLETE" };
  }
  const outcomeIds = new Set(outcomes.map(item => item.source_event_id));
  const feedbackIds = new Set(feedback.map(item => item.source_event_id));
  const reuseIds = new Set(reuseEvidence.map(item => item.source_event_id));
  const distinctIds = new Set(lists.flat());
  if (lists[0]!.some(eventId => !outcomeIds.has(eventId)) ||
      lists[1]!.some(eventId => !feedbackIds.has(eventId)) ||
      lists[2]!.some(eventId => !reuseIds.has(eventId)) ||
      distinctIds.size !== lists.reduce((sum, item) => sum + item.length, 0)) {
    return { status: "NOT_FORMED", reason_code: "EXPERIENCE_EVIDENCE_TYPE_GATE_FAILED" };
  }
  return {
    status: "FORMED",
    action: text(object.action),
    outcome: text(object.outcome),
    feedback: text(object.feedback),
    reuse_condition: text(object.reuse_condition),
    outcome_evidence_event_ids: lists[0]!,
    feedback_evidence_event_ids: lists[1]!,
    reuse_evidence_event_ids: lists[2]!,
  };
}

function exactRaw(
  store: Pick<SqliteRawHistoryStore, "getEvent">,
  sessionId: string,
  ref: RuntimeRawReceiptRefV1,
): RawEvent {
  const raw = store.getEvent(ref.raw_event_id);
  if (raw === undefined) notFound();
  if (raw.session_id !== sessionId || raw.seq !== ref.raw_sequence || raw.source_event_id === undefined) conflict();
  const fingerprint = computeRawIngestFingerprint({
    session_id: raw.session_id,
    role: raw.role,
    content: raw.content,
    event_type: raw.event_type,
    created_at: raw.created_at,
    metadata: raw.metadata,
    source_event_id: raw.source_event_id,
  });
  if (fingerprint !== ref.ingest_fingerprint) conflict();
  return raw;
}

function rawSourceKind(raw: RawEvent): RawSourceKind {
  if (raw.role === "user") return "user_input";
  if (raw.role === "tool") return "tool_result";
  return "external_observation";
}

function projectedEventId(rawEventId: string): string {
  return `runtime-raw-${sha256(rawEventId)}`;
}

function assertSemanticBinding(
  semantic: SemanticProposalApplyResultV1,
  sourceEventIds: string[],
  disposition: "PROPOSED" | "ABSTAINED",
  producer: CaseFormationProducerV1,
): void {
  if (semantic.disposition !== disposition ||
      canonicalJson([...semantic.source_event_ids].sort()) !== canonicalJson([...sourceEventIds].sort()) ||
      canonicalJson(semantic.producer as unknown as JsonValue) !==
        canonicalJson(producer as unknown as JsonValue)) conflict();
}

function normalizeProducer(value: unknown): CaseFormationProducerV1 {
  const object = exactObject(value, [
    "kind", "implementation_id", "implementation_version", "policy_version",
  ]);
  if (object.kind !== "RULE" && object.kind !== "LOCAL_MODEL" &&
      object.kind !== "REMOTE_MODEL") invalid();
  return {
    kind: object.kind,
    implementation_id: id(object.implementation_id),
    implementation_version: id(object.implementation_version),
    policy_version: id(object.policy_version),
  };
}

function confidence(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) invalid();
  return value;
}

function readEffectiveHead(
  database: DatabaseSync,
  scope: CaseSessionScopeV1,
  caseId: string,
): CaseConclusionRevisionV1 | undefined {
  const history = readVisibleRevisions(database, scope, caseId);
  return history.length === 0 ? undefined : effectiveHeadFrom(history, scope);
}

function effectiveHeadFrom(
  history: VisibleRevision[],
  scope: CaseSessionScopeV1,
): CaseConclusionRevisionV1 {
  for (let precedence = scope.read_scope.length - 1; precedence >= 0; precedence -= 1) {
    const matches = history
      .filter((item) => item.precedence === precedence)
      .sort((left, right) => right.revision.revision_number - left.revision.revision_number);
    if (matches.length > 0) return matches[0]!.revision;
  }
  corrupt();
}

function readVisibleRevisions(
  database: DatabaseSync,
  scope: CaseSessionScopeV1,
  caseId: string,
): VisibleRevision[] {
  const result: VisibleRevision[] = [];
  for (const entry of scope.read_scope) {
    const rows = database.prepare(
      `SELECT * FROM cc_case_conclusion_revisions
       WHERE namespace = ? AND stream_id = ? AND case_id = ?
       ORDER BY revision_number ASC`,
    ).all(entry.session.namespace, entry.session.session_id, caseId) as RevisionRow[];
    for (const row of rows) {
      if (entry.frontier.kind === "FROZEN" &&
          (row.max_raw_sequence > entry.frontier.raw_sequence ||
           row.semantic_state_revision > entry.frontier.state_revision)) continue;
      result.push({ revision: parseRevision(row), precedence: entry.precedence });
    }
  }
  return result.sort((left, right) =>
    left.revision.revision_number - right.revision.revision_number ||
    left.precedence - right.precedence ||
    compareText(left.revision.revision_id, right.revision.revision_id));
}

function visibleCaseIds(database: DatabaseSync, scope: CaseSessionScopeV1): string[] {
  const ids = new Set<string>();
  for (const entry of scope.read_scope) {
    const rows = database.prepare(
      `SELECT DISTINCT case_id, max_raw_sequence, semantic_state_revision
       FROM cc_case_conclusion_revisions WHERE namespace = ? AND stream_id = ?`,
    ).all(entry.session.namespace, entry.session.session_id) as Array<{
      case_id: string; max_raw_sequence: number; semantic_state_revision: number;
    }>;
    for (const row of rows) {
      if (entry.frontier.kind === "FROZEN" &&
          (row.max_raw_sequence > entry.frontier.raw_sequence ||
           row.semantic_state_revision > entry.frontier.state_revision)) continue;
      ids.add(row.case_id);
    }
  }
  return [...ids].sort(compareText);
}

function readVisibleRawOnlyFinalizations(
  database: DatabaseSync,
  scope: CaseSessionScopeV1,
): Extract<CaseFormationFinalizationReceiptV1, { status: "RAW_ONLY" }>[] {
  const receipts: Array<Extract<CaseFormationFinalizationReceiptV1, { status: "RAW_ONLY" }> & {
    precedence: number;
  }> = [];
  for (const entry of scope.read_scope) {
    const rows = database.prepare(
      `SELECT * FROM cc_case_finalizations WHERE namespace = ? AND stream_id = ?`,
    ).all(entry.session.namespace, entry.session.session_id) as FinalizationRow[];
    for (const row of rows) {
      if (entry.frontier.kind === "FROZEN" &&
          (row.max_raw_sequence > entry.frontier.raw_sequence ||
           row.semantic_state_revision > entry.frontier.state_revision)) continue;
      const receipt = parseFinalization(row);
      if (receipt.status === "RAW_ONLY") receipts.push({ ...receipt, precedence: entry.precedence });
    }
  }
  receipts.sort((left, right) => left.precedence - right.precedence ||
    compareText(left.created_at, right.created_at) || compareText(left.finalization_id, right.finalization_id));
  return receipts.map(({ precedence: _precedence, ...receipt }) => receipt);
}

function parseRevision(row: RevisionRow): CaseConclusionRevisionV1 {
  if (!SHA256.test(row.request_hash) || !SHA256.test(row.revision_hash) ||
      sha256(row.request_json) !== row.request_hash || sha256(row.revision_json) !== row.revision_hash) corrupt();
  const value = parseJson(row.revision_json) as unknown as CaseConclusionRevisionV1;
  if (value.revision_id !== row.revision_id || value.case_id !== row.case_id ||
      value.revision_number !== row.revision_number || value.scope.namespace !== row.namespace ||
      value.scope.stream_id !== row.stream_id) corrupt();
  return structuredClone(value);
}

function insertFinalization(
  database: DatabaseSync,
  scope: RevisionScope,
  finalizationId: string,
  requestHash: string,
  requestJson: string,
  maxRawSequence: number,
  semanticStateRevision: number,
  receipt: CaseFormationFinalizationReceiptV1,
): void {
  const receiptJson = canonicalJson(receipt as unknown as JsonValue);
  database.prepare(
    `INSERT INTO cc_case_finalizations (
       namespace, stream_id, finalization_id, request_hash, request_json,
       max_raw_sequence, semantic_state_revision, receipt_hash, receipt_json
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    scope.namespace,
    scope.stream_id,
    finalizationId,
    requestHash,
    requestJson,
    maxRawSequence,
    semanticStateRevision,
    sha256(receiptJson),
    receiptJson,
  );
}

function readFinalization(
  database: DatabaseSync,
  scope: RevisionScope,
  finalizationId: string,
): CaseFormationFinalizationReceiptV1 {
  const value = readFinalizationOptional(database, scope, finalizationId);
  if (value === undefined) corrupt();
  return value;
}

function readFinalizationOptional(
  database: DatabaseSync,
  scope: RevisionScope,
  finalizationId: string,
): CaseFormationFinalizationReceiptV1 | undefined {
  const row = database.prepare(
    `SELECT * FROM cc_case_finalizations
     WHERE namespace = ? AND stream_id = ? AND finalization_id = ?`,
  ).get(scope.namespace, scope.stream_id, finalizationId) as FinalizationRow | undefined;
  return row === undefined ? undefined : parseFinalization(row);
}

function parseFinalization(row: FinalizationRow): CaseFormationFinalizationReceiptV1 {
  if (!SHA256.test(row.request_hash) || !SHA256.test(row.receipt_hash) ||
      sha256(row.request_json) !== row.request_hash || sha256(row.receipt_json) !== row.receipt_hash) corrupt();
  const value = parseJson(row.receipt_json) as unknown as CaseFormationFinalizationReceiptV1;
  if (value.finalization_id !== row.finalization_id || value.scope.namespace !== row.namespace ||
      value.scope.stream_id !== row.stream_id ||
      (value.status !== "AUTHORITY_COMMITTED" && value.status !== "RAW_ONLY")) corrupt();
  return structuredClone(value);
}

function readCommittedReceiptForRevision(
  database: DatabaseSync,
  scope: RevisionScope,
  revisionId: string,
): CaseFormationFinalizationReceiptV1 {
  const rows = database.prepare(
    `SELECT * FROM cc_case_finalizations WHERE namespace = ? AND stream_id = ?`,
  ).all(scope.namespace, scope.stream_id) as FinalizationRow[];
  const matches = rows.map(parseFinalization).filter((receipt) =>
    receipt.status === "AUTHORITY_COMMITTED" && receipt.revision_id === revisionId);
  if (matches.length !== 1) corrupt();
  return matches[0]!;
}

function commitInputAsJson(input: CaseConclusionCommitInputV1): JsonObject {
  return structuredClone(input) as unknown as JsonObject;
}

function abstainInputAsJson(input: CaseFormationAbstainInputV1): JsonObject {
  return structuredClone(input) as unknown as JsonObject;
}

function semanticResultIdentity(result: SemanticProposalApplyResultV1): JsonObject {
  return {
    proposal_id: result.proposal_id,
    preparation_id: result.preparation_id,
    disposition: result.disposition,
    current_revision_vector: cloneVector(result.current_revision_vector) as unknown as JsonValue,
  };
}

function finalizationIdFor(proposalId: string, anchorId: string, episodeId: string): string {
  return `case-finalization-${sha256(canonicalJson({ proposal_id: proposalId, anchor_id: anchorId, episode_id: episodeId }))}`;
}

function writeScope(scope: CaseSessionScopeV1): RevisionScope {
  return { namespace: scope.write_session.namespace, stream_id: scope.write_session.session_id };
}

function cloneSessionScope(scope: CaseSessionScopeV1): CaseSessionScopeV1 {
  return {
    contract_version: CASE_FORMATION_SESSION_SCOPE_VERSION,
    write_session: { ...scope.write_session },
    read_scope: scope.read_scope.map((entry) => ({
      session: { ...entry.session },
      frontier: { ...entry.frontier },
      precedence: entry.precedence,
    })),
  };
}

function cloneRepoAnchor(anchor: CaseRepoAnchorV1): CaseRepoAnchorV1 {
  return { ...anchor };
}

function cloneFormedExperience(
  value: Extract<CaseExperienceDispositionV1, { status: "FORMED" }>,
): Extract<CaseExperienceDispositionV1, { status: "FORMED" }> {
  return {
    ...value,
    outcome_evidence_event_ids: [...value.outcome_evidence_event_ids],
    feedback_evidence_event_ids: [...value.feedback_evidence_event_ids],
    reuse_evidence_event_ids: [...value.reuse_evidence_event_ids],
  };
}

function cloneVector(vector: RevisionVector): RevisionVector {
  return { ...vector };
}

function exactObject(
  value: unknown,
  required: readonly string[],
  optional: readonly string[] = [],
): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) invalid();
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) invalid();
  const allowed = new Set([...required, ...optional]);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  for (const key of Reflect.ownKeys(descriptors)) {
    if (typeof key !== "string" || !allowed.has(key)) invalid();
    const descriptor = descriptors[key]!;
    if (!descriptor.enumerable || !("value" in descriptor)) invalid();
  }
  if (required.some((key) => !(key in descriptors))) invalid();
  return Object.fromEntries(Object.entries(descriptors).map(([key, descriptor]) => [key, descriptor.value]));
}

function arrayValues(value: unknown, maximum: number): unknown[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype ||
      value.length > maximum) invalid();
  const result: unknown[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor?.enumerable || !("value" in descriptor)) invalid();
    result.push(descriptor.value);
  }
  if (Reflect.ownKeys(value).some((key) => key !== "length" &&
      (typeof key !== "string" || !/^(0|[1-9][0-9]*)$/u.test(key) || Number(key) >= value.length))) invalid();
  return result;
}

function ownValue(value: unknown, key: string): unknown {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  return descriptor !== undefined && "value" in descriptor ? descriptor.value : undefined;
}

function textSet(value: unknown, minimum: number, maximum: number): string[] {
  const values = arrayValues(value, maximum).map(id).sort(compareText);
  if (values.length < minimum || new Set(values).size !== values.length) invalid();
  return values;
}

function textList(value: unknown, maximum: number): string[] {
  const values = arrayValues(value, maximum).map(text);
  if (new Set(values).size !== values.length) invalid();
  return values;
}

function id(value: unknown): string {
  if (typeof value !== "string" || value.length < 1 || value.length > MAX_ID ||
      value.trim().length < 1 || /\p{Cc}/u.test(value) || value !== value.normalize("NFC")) invalid();
  return value;
}

function requiredId(value: string | undefined): string {
  return id(value);
}

function text(value: unknown): string {
  if (typeof value !== "string" || value.length < 1 || value.length > MAX_TEXT ||
      value.trim().length < 1 || value !== value.normalize("NFC")) invalid();
  return value;
}

function revision(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function positiveRevision(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0;
}

function sessionKey(ref: CaseSessionRefV1): string {
  return `${ref.namespace}\0${ref.session_id}`;
}

function canonicalJson(value: JsonValue | JsonObject): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) =>
    `${JSON.stringify(key)}:${canonicalJson((value as JsonObject)[key]!)}`).join(",")}}`;
}

function parseJson(value: string): JsonValue {
  try { return JSON.parse(value) as JsonValue; } catch { return corrupt(); }
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function rollback(database: DatabaseSync): void {
  try { database.exec("ROLLBACK;"); } catch { /* preserve original error */ }
}

function mapError(error: unknown): CaseFormationError {
  if (error instanceof CaseFormationError) return error;
  if (error instanceof Error && error.message === "NOT_FOUND") return new CaseFormationError("NOT_FOUND");
  return new CaseFormationError("STORAGE_FAILURE");
}

function invalid(): never { throw new CaseFormationError("INVALID_INPUT"); }
function conflict(): never { throw new CaseFormationError("CONFLICT"); }
function notFound(): never { throw new CaseFormationError("NOT_FOUND"); }
function corrupt(): never { throw new CaseFormationError("CORRUPT_DATA"); }
function storageFailure(): never { throw new CaseFormationError("STORAGE_FAILURE"); }
