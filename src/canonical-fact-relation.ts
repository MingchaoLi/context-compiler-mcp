import { createHash } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { JsonObject, JsonValue } from "./raw-store.js";
import {
  CANONICAL_STATE_COMMIT_MODES,
  CANONICAL_STATE_ITEM_KINDS,
  CANONICAL_STATE_POLICY_HASH,
  type CanonicalState,
  type CanonicalStateCommitMode,
  type CanonicalStateItem,
  type CanonicalStateItemKind,
  type CanonicalStateItemStatus,
  type CanonicalStateProposal,
  type CommittedCanonicalStateRevision,
} from "./canonical-state.js";
import {
  AUTHORITY_NAMESPACE,
  SHADOW_NAMESPACE_PREFIX,
  type RevisionScope,
  type RevisionVector,
} from "./revision-substrate.js";
import { initializeSqliteConnection } from "./sqlite-initialization.js";

export const CANONICAL_FACT_RELATION_SCHEMA_VERSION = 1;
export const CANONICAL_FACT_RELATION_POLICY_VERSION = "canonical-fact-relation/v1";
export const CANONICAL_FACT_ORIGINS = [
  "user_asserted",
  "tool_observed",
  "host_observed",
  "imported",
  "model_inferred",
] as const;
export const CANONICAL_FACT_VERIFICATION_STATUSES = [
  "unverified",
  "corroborated",
  "verified",
  "contested",
  "disconfirmed",
] as const;
export const CANONICAL_FACT_LIFECYCLE_STATUSES = [
  "active",
  "superseded",
  "retracted",
] as const;
export const CANONICAL_FACT_RECORD_STATUSES = ["live", "archived"] as const;
export const CANONICAL_RELATION_ENDPOINT_TYPES = [
  "RAW_EVENT",
  "FACT",
  "STATE_ITEM",
] as const;
export const CANONICAL_RELATION_TYPES = [
  "SUPPORTS",
  "CONTRADICTS",
  "SUPERSEDES",
  "RETRACTS",
  "DERIVED_FROM",
  "DEPENDS_ON",
  "RESOLVES",
] as const;
export const CANONICAL_RELATION_STATUSES = ["active", "retracted"] as const;

export type CanonicalFactOrigin = (typeof CANONICAL_FACT_ORIGINS)[number];
export type CanonicalFactVerificationStatus =
  (typeof CANONICAL_FACT_VERIFICATION_STATUSES)[number];
export type CanonicalFactLifecycleStatus =
  (typeof CANONICAL_FACT_LIFECYCLE_STATUSES)[number];
export type CanonicalFactRecordStatus = (typeof CANONICAL_FACT_RECORD_STATUSES)[number];
export type CanonicalRelationEndpointType =
  (typeof CANONICAL_RELATION_ENDPOINT_TYPES)[number];
export type CanonicalRelationType = (typeof CANONICAL_RELATION_TYPES)[number];
export type CanonicalRelationStatus = (typeof CANONICAL_RELATION_STATUSES)[number];
export type CanonicalFactRelationErrorCode =
  | "INVALID_INPUT"
  | "NOT_FOUND"
  | "CONFLICT"
  | "STORAGE_FAILURE"
  | "CORRUPT_DATA"
  | "CLOSED";

export interface CanonicalRelationEndpoint {
  type: CanonicalRelationEndpointType;
  id: string;
}

export interface CreateCanonicalFactProposal {
  op: "CREATE";
  fact_id: string;
  statement: string;
  epistemic_origin: CanonicalFactOrigin;
  verification_status: CanonicalFactVerificationStatus;
  lifecycle_status: "active";
  record_status: "live";
  provenance_event_ids: string[];
  verification_event_ids: string[];
  metadata: JsonObject;
}

export interface ReviseCanonicalFactProposal {
  op: "REVISE";
  fact_id: string;
  expected_fact_revision: number;
  verification_status: CanonicalFactVerificationStatus;
  lifecycle_status: CanonicalFactLifecycleStatus;
  record_status: CanonicalFactRecordStatus;
  provenance_event_ids: string[];
  verification_event_ids: string[];
}

export type CanonicalFactProposal =
  | CreateCanonicalFactProposal
  | ReviseCanonicalFactProposal;

export interface CreateCanonicalRelationProposal {
  op: "CREATE";
  relation_id: string;
  source: CanonicalRelationEndpoint;
  relation_type: CanonicalRelationType;
  target: CanonicalRelationEndpoint;
  origin: CanonicalFactOrigin;
  provenance_event_ids: string[];
  confidence?: number;
  status: "active";
  metadata: JsonObject;
}

export interface ReviseCanonicalRelationProposal {
  op: "REVISE";
  relation_id: string;
  expected_relation_revision: number;
  status: CanonicalRelationStatus;
  provenance_event_ids: string[];
}

export type CanonicalRelationProposal =
  | CreateCanonicalRelationProposal
  | ReviseCanonicalRelationProposal;

export interface CanonicalFactRelationCommitInput {
  scope: RevisionScope;
  authority_commit_id: string;
  policy_hash: string;
  fact_proposals: CanonicalFactProposal[];
  relation_proposals: CanonicalRelationProposal[];
}

export interface CommittedCanonicalFact extends RevisionScope {
  fact_id: string;
  fact_revision: number;
  authority_commit_id: string;
  statement: string;
  epistemic_origin: CanonicalFactOrigin;
  verification_status: CanonicalFactVerificationStatus;
  lifecycle_status: CanonicalFactLifecycleStatus;
  record_status: CanonicalFactRecordStatus;
  provenance_event_ids: string[];
  verification_event_ids: string[];
  metadata: JsonObject;
  observed_revision_vector: RevisionVector;
  fact_hash: string;
  created_at: string;
}

export interface CommittedCanonicalRelation extends RevisionScope {
  relation_id: string;
  relation_revision: number;
  authority_commit_id: string;
  source: CanonicalRelationEndpoint;
  relation_type: CanonicalRelationType;
  target: CanonicalRelationEndpoint;
  origin: CanonicalFactOrigin;
  provenance_event_ids: string[];
  confidence?: number;
  status: CanonicalRelationStatus;
  metadata: JsonObject;
  observed_revision_vector: RevisionVector;
  relation_hash: string;
  created_at: string;
}

export interface CanonicalFactRelationCommitResult extends RevisionScope {
  authority_commit_id: string;
  policy_hash: string;
  observed_revision_vector: RevisionVector;
  facts: CommittedCanonicalFact[];
  relations: CommittedCanonicalRelation[];
  created_at: string;
}

export interface CanonicalFactRelationProjection extends RevisionScope {
  revision_vector: RevisionVector;
  policy_hash: string;
  facts: CommittedCanonicalFact[];
  relations: CommittedCanonicalRelation[];
}

export class CanonicalFactRelationError extends Error {
  constructor(readonly code: CanonicalFactRelationErrorCode) {
    super(code);
    this.name = "CanonicalFactRelationError";
  }
}

const MAX_IDENTIFIER_LENGTH = 500;
const MAX_STATEMENT_LENGTH = 10_000;
const MAX_METADATA_STRING_LENGTH = 10_000;
const MAX_METADATA_DEPTH = 8;
const MAX_METADATA_KEYS = 100;
const MAX_FACT_PROPOSALS = 100;
const MAX_RELATION_PROPOSALS = 200;
const MAX_OBJECT_EVENT_IDS = 1_000;
const MAX_GRAPH_NODES = 10_000;
const MAX_SAFE_REVISION = Number.MAX_SAFE_INTEGER;
const MAX_STATE_CONTENT_LENGTH = 10_000;
const MAX_STATE_UPSERT_ITEMS = 100;
const MAX_STATE_ITEM_EVENT_IDS = 100;
const MAX_STATE_COMMIT_EVENT_IDS = 1_000;

const POLICY_DESCRIPTOR: JsonValue = {
  bounds: {
    batch_fact_proposals: MAX_FACT_PROPOSALS,
    batch_relation_proposals: MAX_RELATION_PROPOSALS,
    graph_nodes: MAX_GRAPH_NODES,
    identifier: MAX_IDENTIFIER_LENGTH,
    metadata_depth: MAX_METADATA_DEPTH,
    metadata_keys: MAX_METADATA_KEYS,
    metadata_string: MAX_METADATA_STRING_LENGTH,
    object_event_ids: MAX_OBJECT_EVENT_IDS,
    statement: MAX_STATEMENT_LENGTH,
  },
  duplicate_active_edge: "conflict",
  empty_batch: "invalid",
  endpoint_types: [...CANONICAL_RELATION_ENDPOINT_TYPES],
  fact: {
    epistemic_origins: [...CANONICAL_FACT_ORIGINS],
    immutable_fields: ["statement", "epistemic_origin", "metadata"],
    initial_lifecycle_status: "active",
    initial_record_status: "live",
    lifecycle_transitions: ["active>superseded", "active>retracted"],
    reason_relations: {
      contested: "CONTRADICTS",
      retracted: "RETRACTS",
      superseded: "SUPERSEDES",
    },
    record_transitions: ["live>archived", "archived>live"],
    reference_policy: "same-scope-committed-raw-lexical-unique-monotonic",
    verification_requires_refs: ["verified", "disconfirmed"],
    verification_statuses: [...CANONICAL_FACT_VERIFICATION_STATUSES],
    verification_transitions: [
      "unverified>corroborated",
      "unverified>verified",
      "unverified>contested",
      "unverified>disconfirmed",
      "corroborated>verified",
      "corroborated>contested",
      "corroborated>disconfirmed",
      "verified>disconfirmed",
      "contested>corroborated",
      "contested>verified",
      "contested>disconfirmed",
      "disconfirmed>corroborated",
      "disconfirmed>verified",
    ],
  },
  normalization: "nfc-no-unicode-cc-lexical-unique-arrays",
  object_delete: "forbidden",
  policy_version: CANONICAL_FACT_RELATION_POLICY_VERSION,
  reduced_no_op: "conflict",
  relation: {
    confidence_policy:
      "required-model-inferred-otherwise-forbidden-finite-zero-to-one",
    immutable_fields: [
      "source",
      "relation_type",
      "target",
      "origin",
      "confidence",
      "metadata",
    ],
    pairings: {
      CONTRADICTS: ["RAW_EVENT>FACT", "FACT>FACT"],
      DEPENDS_ON: [
        "FACT>FACT",
        "FACT>STATE_ITEM",
        "STATE_ITEM>FACT",
        "STATE_ITEM>STATE_ITEM",
      ],
      DERIVED_FROM: [
        "FACT>RAW_EVENT",
        "FACT>FACT",
        "FACT>STATE_ITEM",
        "STATE_ITEM>RAW_EVENT",
        "STATE_ITEM>FACT",
        "STATE_ITEM>STATE_ITEM",
      ],
      RESOLVES: [
        "RAW_EVENT>FACT",
        "RAW_EVENT>STATE_ITEM",
        "FACT>FACT",
        "FACT>STATE_ITEM",
        "STATE_ITEM>FACT",
        "STATE_ITEM>STATE_ITEM",
      ],
      RETRACTS: ["RAW_EVENT>FACT", "FACT>FACT"],
      SUPERSEDES: ["FACT>FACT"],
      SUPPORTS: ["RAW_EVENT>FACT", "FACT>FACT"],
    },
    provenance_policy: "same-scope-committed-raw-lexical-unique-monotonic",
    status_transitions: ["active>retracted"],
    statuses: [...CANONICAL_RELATION_STATUSES],
    types: [...CANONICAL_RELATION_TYPES],
  },
  schema_version: CANONICAL_FACT_RELATION_SCHEMA_VERSION,
  scope: "explicit-same-scope-only-no-promotion",
  vector: "observe-five-components-no-advance",
};

export const CANONICAL_FACT_RELATION_POLICY_HASH = sha256(canonicalJson(POLICY_DESCRIPTOR));

interface NormalizedCommitInput extends CanonicalFactRelationCommitInput {
  request: JsonObject;
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

interface FactRow extends Record<string, unknown> {
  namespace: string;
  stream_id: string;
  fact_id: string;
  fact_revision: number;
  authority_commit_id: string;
  statement: string;
  epistemic_origin: string;
  verification_status: string;
  lifecycle_status: string;
  record_status: string;
  provenance_event_ids_json: string;
  verification_event_ids_json: string;
  metadata_json: string;
  observed_revision_vector_json: string;
  fact_hash: string;
  created_at: string;
}

interface RelationRow extends Record<string, unknown> {
  namespace: string;
  stream_id: string;
  relation_id: string;
  relation_revision: number;
  authority_commit_id: string;
  source_type: string;
  source_id: string;
  relation_type: string;
  target_type: string;
  target_id: string;
  origin: string;
  provenance_event_ids_json: string;
  confidence: number | null;
  status: string;
  metadata_json: string;
  observed_revision_vector_json: string;
  relation_hash: string;
  created_at: string;
}

interface CommitRow extends Record<string, unknown> {
  namespace: string;
  stream_id: string;
  authority_commit_id: string;
  policy_hash: string;
  request_fingerprint: string;
  request_json: string;
  observed_revision_vector_json: string;
  previous_object_revisions_json: string;
  current_object_revisions_json: string;
  result_json: string;
  created_at: string;
}

interface CanonicalStateAuthorityRow extends Record<string, unknown> {
  namespace: string;
  stream_id: string;
  state_revision: number;
  state_commit_id: string;
  commit_mode: string;
  previous_state_revision: number;
  proposal_json: string;
  state_json: string;
  state_hash: string;
  policy_hash: string;
  provenance_event_ids_json: string;
  created_at: string;
}

interface CanonicalStateMarkerRow extends Record<string, unknown> {
  operation: string;
  kind: string;
  request_fingerprint: string;
  request_json: string;
  previous_json: string;
  current_json: string;
  result_json: string;
}

interface ObjectRevisionEntry {
  object_id: string;
  revision: number;
}

interface ObjectRevisionMap {
  facts: ObjectRevisionEntry[];
  relations: ObjectRevisionEntry[];
}

const FACT_SELECT = `namespace, stream_id, fact_id, fact_revision,
  authority_commit_id, statement, epistemic_origin, verification_status,
  lifecycle_status, record_status, provenance_event_ids_json,
  verification_event_ids_json, metadata_json, observed_revision_vector_json,
  fact_hash, created_at`;
const RELATION_SELECT = `namespace, stream_id, relation_id, relation_revision,
  authority_commit_id, source_type, source_id, relation_type, target_type,
  target_id, origin, provenance_event_ids_json, confidence, status, metadata_json,
  observed_revision_vector_json, relation_hash, created_at`;

const SCHEMA_OBJECTS: ReadonlyArray<{
  type: "table" | "trigger";
  name: string;
  sql: string;
}> = [
  {
    type: "table",
    name: "cc_canonical_fact_relation_schema",
    sql: `CREATE TABLE cc_canonical_fact_relation_schema (
      version INTEGER PRIMARY KEY CHECK (version > 0),
      completed_at TEXT NOT NULL
    )`,
  },
  {
    type: "table",
    name: "cc_canonical_fact_relation_commits",
    sql: `CREATE TABLE cc_canonical_fact_relation_commits (
      namespace TEXT NOT NULL,
      stream_id TEXT NOT NULL,
      authority_commit_id TEXT NOT NULL CHECK (
        length(authority_commit_id) > 0 AND length(authority_commit_id) <= 500
      ),
      policy_hash TEXT NOT NULL CHECK (
        policy_hash = '${CANONICAL_FACT_RELATION_POLICY_HASH}'
      ),
      request_fingerprint TEXT NOT NULL CHECK (length(request_fingerprint) = 64),
      request_json TEXT NOT NULL,
      observed_revision_vector_json TEXT NOT NULL,
      previous_object_revisions_json TEXT NOT NULL,
      current_object_revisions_json TEXT NOT NULL,
      result_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (namespace, stream_id, authority_commit_id)
    )`,
  },
  {
    type: "table",
    name: "cc_canonical_fact_revisions",
    sql: `CREATE TABLE cc_canonical_fact_revisions (
      namespace TEXT NOT NULL,
      stream_id TEXT NOT NULL,
      fact_id TEXT NOT NULL CHECK (length(fact_id) > 0 AND length(fact_id) <= 500),
      fact_revision INTEGER NOT NULL CHECK (
        fact_revision > 0 AND fact_revision <= 9007199254740991
      ),
      authority_commit_id TEXT NOT NULL,
      statement TEXT NOT NULL CHECK (length(statement) > 0 AND length(statement) <= 10000),
      epistemic_origin TEXT NOT NULL CHECK (
        epistemic_origin IN ('user_asserted','tool_observed','host_observed','imported','model_inferred')
      ),
      verification_status TEXT NOT NULL CHECK (
        verification_status IN ('unverified','corroborated','verified','contested','disconfirmed')
      ),
      lifecycle_status TEXT NOT NULL CHECK (
        lifecycle_status IN ('active','superseded','retracted')
      ),
      record_status TEXT NOT NULL CHECK (record_status IN ('live','archived')),
      provenance_event_ids_json TEXT NOT NULL,
      verification_event_ids_json TEXT NOT NULL,
      metadata_json TEXT NOT NULL,
      observed_revision_vector_json TEXT NOT NULL,
      fact_hash TEXT NOT NULL CHECK (length(fact_hash) = 64),
      created_at TEXT NOT NULL,
      PRIMARY KEY (namespace, stream_id, fact_id, fact_revision),
      UNIQUE (namespace, stream_id, authority_commit_id, fact_id),
      FOREIGN KEY (namespace, stream_id, authority_commit_id)
        REFERENCES cc_canonical_fact_relation_commits
          (namespace, stream_id, authority_commit_id)
        ON UPDATE RESTRICT ON DELETE RESTRICT
    )`,
  },
  {
    type: "table",
    name: "cc_canonical_relation_revisions",
    sql: `CREATE TABLE cc_canonical_relation_revisions (
      namespace TEXT NOT NULL,
      stream_id TEXT NOT NULL,
      relation_id TEXT NOT NULL CHECK (
        length(relation_id) > 0 AND length(relation_id) <= 500
      ),
      relation_revision INTEGER NOT NULL CHECK (
        relation_revision > 0 AND relation_revision <= 9007199254740991
      ),
      authority_commit_id TEXT NOT NULL,
      source_type TEXT NOT NULL CHECK (source_type IN ('RAW_EVENT','FACT','STATE_ITEM')),
      source_id TEXT NOT NULL CHECK (length(source_id) > 0 AND length(source_id) <= 500),
      relation_type TEXT NOT NULL CHECK (
        relation_type IN ('SUPPORTS','CONTRADICTS','SUPERSEDES','RETRACTS','DERIVED_FROM','DEPENDS_ON','RESOLVES')
      ),
      target_type TEXT NOT NULL CHECK (target_type IN ('RAW_EVENT','FACT','STATE_ITEM')),
      target_id TEXT NOT NULL CHECK (length(target_id) > 0 AND length(target_id) <= 500),
      origin TEXT NOT NULL CHECK (
        origin IN ('user_asserted','tool_observed','host_observed','imported','model_inferred')
      ),
      provenance_event_ids_json TEXT NOT NULL,
      confidence REAL,
      status TEXT NOT NULL CHECK (status IN ('active','retracted')),
      metadata_json TEXT NOT NULL,
      observed_revision_vector_json TEXT NOT NULL,
      relation_hash TEXT NOT NULL CHECK (length(relation_hash) = 64),
      created_at TEXT NOT NULL,
      PRIMARY KEY (namespace, stream_id, relation_id, relation_revision),
      UNIQUE (namespace, stream_id, authority_commit_id, relation_id),
      CHECK (
        (origin = 'model_inferred' AND confidence IS NOT NULL AND confidence >= 0 AND confidence <= 1)
        OR (origin <> 'model_inferred' AND confidence IS NULL)
      ),
      FOREIGN KEY (namespace, stream_id, authority_commit_id)
        REFERENCES cc_canonical_fact_relation_commits
          (namespace, stream_id, authority_commit_id)
        ON UPDATE RESTRICT ON DELETE RESTRICT
    )`,
  },
  ...[
    ["cc_canonical_fact_relation_commits", "canonical fact/relation commits"],
    ["cc_canonical_fact_revisions", "canonical fact revisions"],
    ["cc_canonical_relation_revisions", "canonical relation revisions"],
    ["cc_canonical_fact_relation_schema", "canonical fact/relation schema markers"],
  ].flatMap(([table, label]) => [
    {
      type: "trigger" as const,
      name: `${table}_no_update`,
      sql: `CREATE TRIGGER ${table}_no_update
        BEFORE UPDATE ON ${table}
        BEGIN
          SELECT RAISE(ABORT, '${label} are immutable');
        END`,
    },
    {
      type: "trigger" as const,
      name: `${table}_no_delete`,
      sql: `CREATE TRIGGER ${table}_no_delete
        BEFORE DELETE ON ${table}
        BEGIN
          SELECT RAISE(ABORT, '${label} are append-only');
        END`,
    },
  ]),
];

/** @internal Core-owned canonical Fact / Relation authority. */
export class SqliteCanonicalFactRelationStore {
  readonly #database: DatabaseSync;
  #closed = false;

  constructor(databasePath: string) {
    if (typeof databasePath !== "string" || databasePath.length === 0) invalid();
    let database: DatabaseSync | undefined;
    try {
      if (databasePath !== ":memory:") mkdirSync(dirname(databasePath), { recursive: true });
      database = new DatabaseSync(databasePath);
      initializeSqliteConnection(database, databasePath, () => {
        migrateCanonicalFactRelation(database!);
      });
      this.#database = database;
    } catch (error) {
      try { database?.close(); } catch { /* preserve constructor failure */ }
      if (error instanceof CanonicalFactRelationError && error.code === "INVALID_INPUT") {
        throw error;
      }
      throw new CanonicalFactRelationError("STORAGE_FAILURE");
    }
  }

  commit(input: CanonicalFactRelationCommitInput): CanonicalFactRelationCommitResult {
    this.#assertOpen();
    const normalized = normalizeCommitInput(input);
    const requestJson = canonicalJson(normalized.request);
    try {
      this.#database.exec("BEGIN IMMEDIATE;");
      const existing = this.#readCommitRow(normalized.scope, normalized.authority_commit_id);
      if (existing !== undefined) {
        const result = this.#commitFromRow(existing);
        if (existing.request_json !== requestJson ||
            storedHash(existing.request_fingerprint) !== sha256(requestJson)) conflict();
        this.#database.exec("COMMIT;");
        return cloneCommitResult(result);
      }
      if (normalized.policy_hash !== CANONICAL_FACT_RELATION_POLICY_HASH) invalid();

      const observed = readVector(this.#database, normalized.scope);
      const beforeFacts = this.#loadCurrentFacts(normalized.scope);
      const beforeRelations = this.#loadCurrentRelations(normalized.scope);
      const afterFacts = new Map(beforeFacts);
      const afterRelations = new Map(beforeRelations);
      const createdAt = new Date().toISOString();
      const changedFacts: CommittedCanonicalFact[] = [];
      const changedRelations: CommittedCanonicalRelation[] = [];
      const previous: ObjectRevisionMap = { facts: [], relations: [] };
      const current: ObjectRevisionMap = { facts: [], relations: [] };

      for (const proposal of normalized.fact_proposals) {
        const prior = beforeFacts.get(proposal.fact_id);
        const next = applyFactProposal(
          normalized.scope,
          normalized.authority_commit_id,
          observed,
          createdAt,
          prior,
          proposal
        );
        assertEventRefs(
          this.#database,
          normalized.scope,
          next.provenance_event_ids,
          observed.ledger_revision,
          false
        );
        assertEventRefs(
          this.#database,
          normalized.scope,
          next.verification_event_ids,
          observed.ledger_revision,
          false
        );
        afterFacts.set(next.fact_id, next);
        changedFacts.push(next);
        previous.facts.push({ object_id: next.fact_id, revision: prior?.fact_revision ?? 0 });
        current.facts.push({ object_id: next.fact_id, revision: next.fact_revision });
      }

      for (const proposal of normalized.relation_proposals) {
        const prior = beforeRelations.get(proposal.relation_id);
        const next = applyRelationProposal(
          normalized.scope,
          normalized.authority_commit_id,
          observed,
          createdAt,
          prior,
          proposal
        );
        assertEventRefs(
          this.#database,
          normalized.scope,
          next.provenance_event_ids,
          observed.ledger_revision,
          false
        );
        afterRelations.set(next.relation_id, next);
        changedRelations.push(next);
        previous.relations.push({
          object_id: next.relation_id,
          revision: prior?.relation_revision ?? 0,
        });
        current.relations.push({ object_id: next.relation_id, revision: next.relation_revision });
      }

      validateFinalAuthority(
        this.#database,
        normalized.scope,
        observed,
        afterFacts,
        afterRelations,
        false
      );

      const result: CanonicalFactRelationCommitResult = {
        ...normalized.scope,
        authority_commit_id: normalized.authority_commit_id,
        policy_hash: CANONICAL_FACT_RELATION_POLICY_HASH,
        observed_revision_vector: cloneVector(observed),
        facts: changedFacts.map(cloneFact),
        relations: changedRelations.map(cloneRelation),
        created_at: createdAt,
      };
      const resultJson = canonicalJson(commitResultAsJson(result));
      const observedJson = canonicalJson(vectorAsJson(observed));
      this.#database.prepare(
        `INSERT INTO cc_canonical_fact_relation_commits (
           namespace, stream_id, authority_commit_id, policy_hash,
           request_fingerprint, request_json, observed_revision_vector_json,
           previous_object_revisions_json, current_object_revisions_json,
           result_json, created_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        normalized.scope.namespace,
        normalized.scope.stream_id,
        normalized.authority_commit_id,
        CANONICAL_FACT_RELATION_POLICY_HASH,
        sha256(requestJson),
        requestJson,
        observedJson,
        canonicalJson(objectRevisionMapAsJson(previous)),
        canonicalJson(objectRevisionMapAsJson(current)),
        resultJson,
        createdAt
      );
      for (const fact of changedFacts) this.#insertFact(fact);
      for (const relation of changedRelations) this.#insertRelation(relation);
      if (!sameVector(readVector(this.#database, normalized.scope), observed)) corrupt();
      this.#database.exec("COMMIT;");
      return this.readCommit(normalized.scope, normalized.authority_commit_id);
    } catch (error) {
      rollback(this.#database);
      if (error instanceof CanonicalFactRelationError) throw error;
      throw new CanonicalFactRelationError("STORAGE_FAILURE");
    }
  }

  readCurrent(scope: RevisionScope): CanonicalFactRelationProjection {
    this.#assertOpen();
    const normalized = normalizeScope(scope);
    try {
      this.#database.exec("BEGIN;");
      const vector = readVector(this.#database, normalized);
      const facts = this.#loadCurrentFacts(normalized);
      const relations = this.#loadCurrentRelations(normalized);
      this.#assertObjectBindings(facts, relations);
      validateFinalAuthority(this.#database, normalized, vector, facts, relations, true);
      const projection: CanonicalFactRelationProjection = {
        ...normalized,
        revision_vector: cloneVector(vector),
        policy_hash: CANONICAL_FACT_RELATION_POLICY_HASH,
        facts: [...facts.values()].sort(compareFacts).map(cloneFact),
        relations: [...relations.values()].sort(compareRelations).map(cloneRelation),
      };
      this.#database.exec("COMMIT;");
      return projection;
    } catch (error) {
      rollback(this.#database);
      if (error instanceof CanonicalFactRelationError) throw error;
      throw new CanonicalFactRelationError("STORAGE_FAILURE");
    }
  }

  readFactRevision(
    scope: RevisionScope,
    factId: string,
    factRevision: number
  ): CommittedCanonicalFact {
    this.#assertOpen();
    const normalized = normalizeScope(scope);
    const id = validateIdentifier(factId);
    const revision = validatePositiveRevision(factRevision);
    try {
      this.#database.exec("BEGIN;");
      const fact = this.#readFact(normalized, id, revision);
      this.#assertFactBinding(fact);
      this.#database.exec("COMMIT;");
      return cloneFact(fact);
    } catch (error) {
      rollback(this.#database);
      if (error instanceof CanonicalFactRelationError) throw error;
      throw new CanonicalFactRelationError("STORAGE_FAILURE");
    }
  }

  readRelationRevision(
    scope: RevisionScope,
    relationId: string,
    relationRevision: number
  ): CommittedCanonicalRelation {
    this.#assertOpen();
    const normalized = normalizeScope(scope);
    const id = validateIdentifier(relationId);
    const revision = validatePositiveRevision(relationRevision);
    try {
      this.#database.exec("BEGIN;");
      const relation = this.#readRelation(normalized, id, revision);
      this.#assertRelationBinding(relation);
      this.#database.exec("COMMIT;");
      return cloneRelation(relation);
    } catch (error) {
      rollback(this.#database);
      if (error instanceof CanonicalFactRelationError) throw error;
      throw new CanonicalFactRelationError("STORAGE_FAILURE");
    }
  }

  readCommit(scope: RevisionScope, authorityCommitId: string): CanonicalFactRelationCommitResult {
    this.#assertOpen();
    const normalized = normalizeScope(scope);
    const id = validateIdentifier(authorityCommitId);
    try {
      this.#database.exec("BEGIN;");
      const row = this.#readCommitRow(normalized, id);
      if (row === undefined) notFound();
      const result = this.#commitFromRow(row);
      this.#database.exec("COMMIT;");
      return cloneCommitResult(result);
    } catch (error) {
      rollback(this.#database);
      if (error instanceof CanonicalFactRelationError) throw error;
      throw new CanonicalFactRelationError("STORAGE_FAILURE");
    }
  }

  close(): void {
    if (this.#closed) return;
    try {
      this.#database.close();
      this.#closed = true;
    } catch {
      throw new CanonicalFactRelationError("STORAGE_FAILURE");
    }
  }

  #loadCurrentFacts(scope: RevisionScope): Map<string, CommittedCanonicalFact> {
    const rows = this.#database.prepare(
      `SELECT ${FACT_SELECT} FROM cc_canonical_fact_revisions AS f
       WHERE namespace = ? AND stream_id = ?
         AND fact_revision = (
           SELECT MAX(f2.fact_revision) FROM cc_canonical_fact_revisions AS f2
           WHERE f2.namespace = f.namespace AND f2.stream_id = f.stream_id
             AND f2.fact_id = f.fact_id
         )
       ORDER BY fact_id`
    ).all(scope.namespace, scope.stream_id) as FactRow[];
    const result = new Map<string, CommittedCanonicalFact>();
    for (const row of rows) {
      const fact = factFromRow(row, scope);
      if (result.has(fact.fact_id)) corrupt();
      result.set(fact.fact_id, fact);
    }
    return result;
  }

  #loadCurrentRelations(scope: RevisionScope): Map<string, CommittedCanonicalRelation> {
    const rows = this.#database.prepare(
      `SELECT ${RELATION_SELECT} FROM cc_canonical_relation_revisions AS r
       WHERE namespace = ? AND stream_id = ?
         AND relation_revision = (
           SELECT MAX(r2.relation_revision) FROM cc_canonical_relation_revisions AS r2
           WHERE r2.namespace = r.namespace AND r2.stream_id = r.stream_id
             AND r2.relation_id = r.relation_id
         )
       ORDER BY relation_id`
    ).all(scope.namespace, scope.stream_id) as RelationRow[];
    const result = new Map<string, CommittedCanonicalRelation>();
    for (const row of rows) {
      const relation = relationFromRow(row, scope);
      if (result.has(relation.relation_id)) corrupt();
      result.set(relation.relation_id, relation);
    }
    return result;
  }

  #readFact(scope: RevisionScope, id: string, revision: number): CommittedCanonicalFact {
    const row = this.#database.prepare(
      `SELECT ${FACT_SELECT} FROM cc_canonical_fact_revisions
       WHERE namespace = ? AND stream_id = ? AND fact_id = ? AND fact_revision = ?`
    ).get(scope.namespace, scope.stream_id, id, revision) as FactRow | undefined;
    if (row === undefined) notFound();
    return factFromRow(row, scope);
  }

  #readRelation(
    scope: RevisionScope,
    id: string,
    revision: number
  ): CommittedCanonicalRelation {
    const row = this.#database.prepare(
      `SELECT ${RELATION_SELECT} FROM cc_canonical_relation_revisions
       WHERE namespace = ? AND stream_id = ? AND relation_id = ? AND relation_revision = ?`
    ).get(scope.namespace, scope.stream_id, id, revision) as RelationRow | undefined;
    if (row === undefined) notFound();
    return relationFromRow(row, scope);
  }

  #readCommitRow(scope: RevisionScope, id: string): CommitRow | undefined {
    return this.#database.prepare(
      `SELECT namespace, stream_id, authority_commit_id, policy_hash,
              request_fingerprint, request_json, observed_revision_vector_json,
              previous_object_revisions_json, current_object_revisions_json,
              result_json, created_at
       FROM cc_canonical_fact_relation_commits
       WHERE namespace = ? AND stream_id = ? AND authority_commit_id = ?`
    ).get(scope.namespace, scope.stream_id, id) as CommitRow | undefined;
  }

  #commitFromRow(row: CommitRow): CanonicalFactRelationCommitResult {
    const scope = storedScope(row.namespace, row.stream_id);
    const authorityCommitId = storedIdentifier(row.authority_commit_id);
    if (storedHash(row.policy_hash) !== CANONICAL_FACT_RELATION_POLICY_HASH) corrupt();
    const request = parseStoredCommitInput(row.request_json);
    if (request.scope.namespace !== scope.namespace || request.scope.stream_id !== scope.stream_id ||
        request.authority_commit_id !== authorityCommitId ||
        request.policy_hash !== row.policy_hash) corrupt();
    if (storedHash(row.request_fingerprint) !== sha256(row.request_json)) corrupt();
    const observed = parseStoredVector(row.observed_revision_vector_json, scope);
    const previous = parseStoredObjectRevisionMap(row.previous_object_revisions_json);
    const current = parseStoredObjectRevisionMap(row.current_object_revisions_json);
    const result = parseStoredCommitResult(row.result_json, scope);
    if (result.authority_commit_id !== authorityCommitId ||
        result.policy_hash !== CANONICAL_FACT_RELATION_POLICY_HASH ||
        result.created_at !== storedTimestamp(row.created_at) ||
        !sameVector(result.observed_revision_vector, observed)) corrupt();
    assertCommitRevisionMaps(request, result, previous, current);
    let stateItems: Set<string> | undefined;
    for (let index = 0; index < result.facts.length; index += 1) {
      const fact = result.facts[index];
      const proposal = request.fact_proposals[index];
      const before = previous.facts[index];
      if (fact === undefined || proposal === undefined || before === undefined ||
          fact.authority_commit_id !== authorityCommitId ||
          fact.created_at !== result.created_at ||
          !sameVector(fact.observed_revision_vector, observed)) corrupt();
      let persisted: CommittedCanonicalFact;
      try {
        persisted = this.#readFact(scope, fact.fact_id, fact.fact_revision);
      } catch {
        corrupt();
      }
      if (canonicalJson(factAsJson(persisted)) !== canonicalJson(factAsJson(fact))) corrupt();
      let prior: CommittedCanonicalFact | undefined;
      if (before.revision > 0) {
        try {
          prior = this.#readFact(scope, fact.fact_id, before.revision);
        } catch {
          corrupt();
        }
      }
      try {
        const rebuilt = applyFactProposal(
          scope,
          authorityCommitId,
          observed,
          result.created_at,
          prior,
          proposal
        );
        if (canonicalJson(factAsJson(rebuilt)) !== canonicalJson(factAsJson(fact))) corrupt();
      } catch (error) {
        if (error instanceof CanonicalFactRelationError && error.code === "CORRUPT_DATA") {
          throw error;
        }
        corrupt();
      }
      assertEventRefs(
        this.#database,
        scope,
        fact.provenance_event_ids,
        observed.ledger_revision,
        true
      );
      assertEventRefs(
        this.#database,
        scope,
        fact.verification_event_ids,
        observed.ledger_revision,
        true
      );
    }
    for (let index = 0; index < result.relations.length; index += 1) {
      const relation = result.relations[index];
      const proposal = request.relation_proposals[index];
      const before = previous.relations[index];
      if (relation === undefined || proposal === undefined || before === undefined ||
          relation.authority_commit_id !== authorityCommitId ||
          relation.created_at !== result.created_at ||
          !sameVector(relation.observed_revision_vector, observed)) corrupt();
      let persisted: CommittedCanonicalRelation;
      try {
        persisted = this.#readRelation(scope, relation.relation_id, relation.relation_revision);
      } catch {
        corrupt();
      }
      if (canonicalJson(relationAsJson(persisted)) !== canonicalJson(relationAsJson(relation))) {
        corrupt();
      }
      let prior: CommittedCanonicalRelation | undefined;
      if (before.revision > 0) {
        try {
          prior = this.#readRelation(scope, relation.relation_id, before.revision);
        } catch {
          corrupt();
        }
      }
      try {
        const rebuilt = applyRelationProposal(
          scope,
          authorityCommitId,
          observed,
          result.created_at,
          prior,
          proposal
        );
        if (canonicalJson(relationAsJson(rebuilt)) !== canonicalJson(relationAsJson(relation))) {
          corrupt();
        }
      } catch (error) {
        if (error instanceof CanonicalFactRelationError && error.code === "CORRUPT_DATA") {
          throw error;
        }
        corrupt();
      }
      assertEventRefs(
        this.#database,
        scope,
        relation.provenance_event_ids,
        observed.ledger_revision,
        true
      );
      if (relation.source.type === "STATE_ITEM" || relation.target.type === "STATE_ITEM") {
        stateItems ??= readCanonicalStateItemIds(
          this.#database,
          scope,
          observed.state_revision,
          observed
        );
        if ((relation.source.type === "STATE_ITEM" && !stateItems.has(relation.source.id)) ||
            (relation.target.type === "STATE_ITEM" && !stateItems.has(relation.target.id))) {
          corrupt();
        }
      }
    }
    const live = readVector(this.#database, scope);
    if (!vectorAtOrAfter(live, observed)) corrupt();
    return result;
  }

  #assertObjectBindings(
    facts: Map<string, CommittedCanonicalFact>,
    relations: Map<string, CommittedCanonicalRelation>
  ): void {
    const cache = new Map<string, CanonicalFactRelationCommitResult>();
    for (const fact of facts.values()) {
      const key = `${fact.namespace}\u0000${fact.stream_id}\u0000${fact.authority_commit_id}`;
      let commit = cache.get(key);
      if (commit === undefined) {
        const row = this.#readCommitRow(fact, fact.authority_commit_id);
        if (row === undefined) corrupt();
        commit = this.#commitFromRow(row);
        cache.set(key, commit);
      }
      if (!commit.facts.some((value) => value.fact_id === fact.fact_id &&
          value.fact_revision === fact.fact_revision)) corrupt();
    }
    for (const relation of relations.values()) {
      const key = `${relation.namespace}\u0000${relation.stream_id}\u0000${relation.authority_commit_id}`;
      let commit = cache.get(key);
      if (commit === undefined) {
        const row = this.#readCommitRow(relation, relation.authority_commit_id);
        if (row === undefined) corrupt();
        commit = this.#commitFromRow(row);
        cache.set(key, commit);
      }
      if (!commit.relations.some((value) => value.relation_id === relation.relation_id &&
          value.relation_revision === relation.relation_revision)) corrupt();
    }
  }

  #assertFactBinding(fact: CommittedCanonicalFact): void {
    const row = this.#readCommitRow(fact, fact.authority_commit_id);
    if (row === undefined) corrupt();
    const commit = this.#commitFromRow(row);
    if (!commit.facts.some((value) => canonicalJson(factAsJson(value)) ===
        canonicalJson(factAsJson(fact)))) corrupt();
  }

  #assertRelationBinding(relation: CommittedCanonicalRelation): void {
    const row = this.#readCommitRow(relation, relation.authority_commit_id);
    if (row === undefined) corrupt();
    const commit = this.#commitFromRow(row);
    if (!commit.relations.some((value) => canonicalJson(relationAsJson(value)) ===
        canonicalJson(relationAsJson(relation)))) corrupt();
  }

  #insertFact(fact: CommittedCanonicalFact): void {
    this.#database.prepare(
      `INSERT INTO cc_canonical_fact_revisions (
         namespace, stream_id, fact_id, fact_revision, authority_commit_id,
         statement, epistemic_origin, verification_status, lifecycle_status,
         record_status, provenance_event_ids_json, verification_event_ids_json,
         metadata_json, observed_revision_vector_json, fact_hash, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      fact.namespace,
      fact.stream_id,
      fact.fact_id,
      fact.fact_revision,
      fact.authority_commit_id,
      fact.statement,
      fact.epistemic_origin,
      fact.verification_status,
      fact.lifecycle_status,
      fact.record_status,
      canonicalJson(fact.provenance_event_ids),
      canonicalJson(fact.verification_event_ids),
      canonicalJson(fact.metadata),
      canonicalJson(vectorAsJson(fact.observed_revision_vector)),
      fact.fact_hash,
      fact.created_at
    );
  }

  #insertRelation(relation: CommittedCanonicalRelation): void {
    this.#database.prepare(
      `INSERT INTO cc_canonical_relation_revisions (
         namespace, stream_id, relation_id, relation_revision, authority_commit_id,
         source_type, source_id, relation_type, target_type, target_id, origin,
         provenance_event_ids_json, confidence, status, metadata_json,
         observed_revision_vector_json, relation_hash, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      relation.namespace,
      relation.stream_id,
      relation.relation_id,
      relation.relation_revision,
      relation.authority_commit_id,
      relation.source.type,
      relation.source.id,
      relation.relation_type,
      relation.target.type,
      relation.target.id,
      relation.origin,
      canonicalJson(relation.provenance_event_ids),
      relation.confidence ?? null,
      relation.status,
      canonicalJson(relation.metadata),
      canonicalJson(vectorAsJson(relation.observed_revision_vector)),
      relation.relation_hash,
      relation.created_at
    );
  }

  #assertOpen(): void {
    if (this.#closed) throw new CanonicalFactRelationError("CLOSED");
  }
}

export function migrateCanonicalFactRelation(database: DatabaseSync): void {
  database.exec("BEGIN IMMEDIATE;");
  try {
    if (sqliteObjectExists(database, "table", "cc_canonical_fact_relation_schema")) {
      validateSchema(database);
      assertCurrentSchemaVersion(database);
      database.exec("COMMIT;");
      return;
    }
    for (const object of SCHEMA_OBJECTS.slice(1)) {
      if (sqliteObjectExists(database, object.type, object.name)) corrupt();
    }
    database.exec(SCHEMA_OBJECTS.map(({ sql }) => `${sql};`).join("\n"));
    validateSchema(database);
    database.prepare(
      `INSERT INTO cc_canonical_fact_relation_schema (version, completed_at)
       VALUES (?, ?)`
    ).run(CANONICAL_FACT_RELATION_SCHEMA_VERSION, new Date().toISOString());
    assertCurrentSchemaVersion(database);
    database.exec("COMMIT;");
  } catch (error) {
    rollback(database);
    throw error;
  }
}

function normalizeCommitInput(value: unknown): NormalizedCommitInput {
  const input = readExactObject(value, [
    "scope",
    "authority_commit_id",
    "policy_hash",
    "fact_proposals",
    "relation_proposals",
  ]);
  const scope = normalizeScope(input.scope);
  const authorityCommitId = validateIdentifier(input.authority_commit_id);
  const policyHash = input.policy_hash;
  if (typeof policyHash !== "string" || !/^[a-f0-9]{64}$/u.test(policyHash)) invalid();
  const facts = normalizeFactProposals(input.fact_proposals);
  const relations = normalizeRelationProposals(input.relation_proposals);
  if (facts.length === 0 && relations.length === 0) invalid();
  const request: JsonObject = {
    scope: { ...scope },
    authority_commit_id: authorityCommitId,
    policy_hash: policyHash,
    fact_proposals: facts.map(factProposalAsJson),
    relation_proposals: relations.map(relationProposalAsJson),
  };
  return {
    scope,
    authority_commit_id: authorityCommitId,
    policy_hash: policyHash,
    fact_proposals: facts,
    relation_proposals: relations,
    request,
  };
}

function normalizeFactProposals(value: unknown): CanonicalFactProposal[] {
  if (!Array.isArray(value)) invalid();
  assertDensePlainArray(value);
  if (value.length > MAX_FACT_PROPOSALS) invalid();
  const proposals = value.map(normalizeFactProposal);
  assertStrictObjectOrder(proposals.map((proposal) => proposal.fact_id));
  return proposals;
}

function normalizeFactProposal(value: unknown): CanonicalFactProposal {
  const base = readLooseDiscriminator(value, "op");
  if (base.op === "CREATE") {
    const proposal = readExactObject(value, [
      "op",
      "fact_id",
      "statement",
      "epistemic_origin",
      "verification_status",
      "lifecycle_status",
      "record_status",
      "provenance_event_ids",
      "verification_event_ids",
      "metadata",
    ]);
    const origin = normalizeOrigin(proposal.epistemic_origin);
    const verification = normalizeVerification(proposal.verification_status);
    if (proposal.lifecycle_status !== "active" || proposal.record_status !== "live") invalid();
    const provenance = normalizeIdentifierSet(proposal.provenance_event_ids, 1);
    const verificationRefs = normalizeIdentifierSet(proposal.verification_event_ids, 0);
    assertVerificationRefs(verification, verificationRefs, false);
    return {
      op: "CREATE",
      fact_id: validateIdentifier(proposal.fact_id),
      statement: validateText(proposal.statement, MAX_STATEMENT_LENGTH),
      epistemic_origin: origin,
      verification_status: verification,
      lifecycle_status: "active",
      record_status: "live",
      provenance_event_ids: provenance,
      verification_event_ids: verificationRefs,
      metadata: normalizeMetadata(proposal.metadata),
    };
  }
  if (base.op === "REVISE") {
    const proposal = readExactObject(value, [
      "op",
      "fact_id",
      "expected_fact_revision",
      "verification_status",
      "lifecycle_status",
      "record_status",
      "provenance_event_ids",
      "verification_event_ids",
    ]);
    const verification = normalizeVerification(proposal.verification_status);
    const verificationRefs = normalizeIdentifierSet(proposal.verification_event_ids, 0);
    assertVerificationRefs(verification, verificationRefs, false);
    return {
      op: "REVISE",
      fact_id: validateIdentifier(proposal.fact_id),
      expected_fact_revision: validatePositiveRevision(proposal.expected_fact_revision),
      verification_status: verification,
      lifecycle_status: normalizeLifecycle(proposal.lifecycle_status),
      record_status: normalizeRecordStatus(proposal.record_status),
      provenance_event_ids: normalizeIdentifierSet(proposal.provenance_event_ids, 1),
      verification_event_ids: verificationRefs,
    };
  }
  invalid();
}

function normalizeRelationProposals(value: unknown): CanonicalRelationProposal[] {
  if (!Array.isArray(value)) invalid();
  assertDensePlainArray(value);
  if (value.length > MAX_RELATION_PROPOSALS) invalid();
  const proposals = value.map(normalizeRelationProposal);
  assertStrictObjectOrder(proposals.map((proposal) => proposal.relation_id));
  return proposals;
}

function normalizeRelationProposal(value: unknown): CanonicalRelationProposal {
  const base = readLooseDiscriminator(value, "op");
  if (base.op === "CREATE") {
    const proposal = readObjectShape(value, [
      "op",
      "relation_id",
      "source",
      "relation_type",
      "target",
      "origin",
      "provenance_event_ids",
      "status",
      "metadata",
    ], ["confidence"]);
    const origin = normalizeOrigin(proposal.origin);
    const confidence = normalizeConfidence(origin, proposal.confidence);
    if (proposal.status !== "active") invalid();
    return {
      op: "CREATE",
      relation_id: validateIdentifier(proposal.relation_id),
      source: normalizeEndpoint(proposal.source),
      relation_type: normalizeRelationType(proposal.relation_type),
      target: normalizeEndpoint(proposal.target),
      origin,
      provenance_event_ids: normalizeIdentifierSet(proposal.provenance_event_ids, 1),
      ...(confidence === undefined ? {} : { confidence }),
      status: "active",
      metadata: normalizeMetadata(proposal.metadata),
    };
  }
  if (base.op === "REVISE") {
    const proposal = readExactObject(value, [
      "op",
      "relation_id",
      "expected_relation_revision",
      "status",
      "provenance_event_ids",
    ]);
    return {
      op: "REVISE",
      relation_id: validateIdentifier(proposal.relation_id),
      expected_relation_revision: validatePositiveRevision(proposal.expected_relation_revision),
      status: normalizeRelationStatus(proposal.status),
      provenance_event_ids: normalizeIdentifierSet(proposal.provenance_event_ids, 1),
    };
  }
  invalid();
}

function applyFactProposal(
  scope: RevisionScope,
  authorityCommitId: string,
  observed: RevisionVector,
  createdAt: string,
  previous: CommittedCanonicalFact | undefined,
  proposal: CanonicalFactProposal
): CommittedCanonicalFact {
  if (proposal.op === "CREATE") {
    if (previous !== undefined) conflict();
    const base = {
      ...scope,
      fact_id: proposal.fact_id,
      fact_revision: 1,
      authority_commit_id: authorityCommitId,
      statement: proposal.statement,
      epistemic_origin: proposal.epistemic_origin,
      verification_status: proposal.verification_status,
      lifecycle_status: proposal.lifecycle_status,
      record_status: proposal.record_status,
      provenance_event_ids: [...proposal.provenance_event_ids],
      verification_event_ids: [...proposal.verification_event_ids],
      metadata: cloneMetadata(proposal.metadata),
      observed_revision_vector: cloneVector(observed),
      created_at: createdAt,
    };
    return { ...base, fact_hash: sha256(canonicalJson(factHashPayload(base))) };
  }
  if (previous === undefined || previous.fact_revision !== proposal.expected_fact_revision) {
    conflict();
  }
  if (!isVerificationTransition(
    previous.verification_status,
    proposal.verification_status
  )) conflict();
  if (!isLifecycleTransition(previous.lifecycle_status, proposal.lifecycle_status)) conflict();
  if (!isRecordTransition(previous.record_status, proposal.record_status)) conflict();
  assertMonotonic(previous.provenance_event_ids, proposal.provenance_event_ids);
  assertMonotonic(previous.verification_event_ids, proposal.verification_event_ids);
  const unchanged = previous.verification_status === proposal.verification_status &&
    previous.lifecycle_status === proposal.lifecycle_status &&
    previous.record_status === proposal.record_status &&
    sameStrings(previous.provenance_event_ids, proposal.provenance_event_ids) &&
    sameStrings(previous.verification_event_ids, proposal.verification_event_ids);
  if (unchanged) conflict();
  if (previous.fact_revision === MAX_SAFE_REVISION) conflict();
  const base = {
    ...scope,
    fact_id: previous.fact_id,
    fact_revision: previous.fact_revision + 1,
    authority_commit_id: authorityCommitId,
    statement: previous.statement,
    epistemic_origin: previous.epistemic_origin,
    verification_status: proposal.verification_status,
    lifecycle_status: proposal.lifecycle_status,
    record_status: proposal.record_status,
    provenance_event_ids: [...proposal.provenance_event_ids],
    verification_event_ids: [...proposal.verification_event_ids],
    metadata: cloneMetadata(previous.metadata),
    observed_revision_vector: cloneVector(observed),
    created_at: createdAt,
  };
  return { ...base, fact_hash: sha256(canonicalJson(factHashPayload(base))) };
}

function applyRelationProposal(
  scope: RevisionScope,
  authorityCommitId: string,
  observed: RevisionVector,
  createdAt: string,
  previous: CommittedCanonicalRelation | undefined,
  proposal: CanonicalRelationProposal
): CommittedCanonicalRelation {
  if (proposal.op === "CREATE") {
    if (previous !== undefined) conflict();
    const base = {
      ...scope,
      relation_id: proposal.relation_id,
      relation_revision: 1,
      authority_commit_id: authorityCommitId,
      source: { ...proposal.source },
      relation_type: proposal.relation_type,
      target: { ...proposal.target },
      origin: proposal.origin,
      provenance_event_ids: [...proposal.provenance_event_ids],
      ...(proposal.confidence === undefined ? {} : { confidence: proposal.confidence }),
      status: proposal.status,
      metadata: cloneMetadata(proposal.metadata),
      observed_revision_vector: cloneVector(observed),
      created_at: createdAt,
    };
    return { ...base, relation_hash: sha256(canonicalJson(relationHashPayload(base))) };
  }
  if (previous === undefined ||
      previous.relation_revision !== proposal.expected_relation_revision) conflict();
  if (previous.status !== proposal.status &&
      !(previous.status === "active" && proposal.status === "retracted")) conflict();
  assertMonotonic(previous.provenance_event_ids, proposal.provenance_event_ids);
  if (previous.status === proposal.status &&
      sameStrings(previous.provenance_event_ids, proposal.provenance_event_ids)) conflict();
  if (previous.relation_revision === MAX_SAFE_REVISION) conflict();
  const base = {
    ...scope,
    relation_id: previous.relation_id,
    relation_revision: previous.relation_revision + 1,
    authority_commit_id: authorityCommitId,
    source: { ...previous.source },
    relation_type: previous.relation_type,
    target: { ...previous.target },
    origin: previous.origin,
    provenance_event_ids: [...proposal.provenance_event_ids],
    ...(previous.confidence === undefined ? {} : { confidence: previous.confidence }),
    status: proposal.status,
    metadata: cloneMetadata(previous.metadata),
    observed_revision_vector: cloneVector(observed),
    created_at: createdAt,
  };
  return { ...base, relation_hash: sha256(canonicalJson(relationHashPayload(base))) };
}

function validateFinalAuthority(
  database: DatabaseSync,
  scope: RevisionScope,
  observed: RevisionVector,
  facts: Map<string, CommittedCanonicalFact>,
  relations: Map<string, CommittedCanonicalRelation>,
  stored: boolean
): void {
  try {
    if (facts.size + relations.size > MAX_GRAPH_NODES) invalid();
    const stateItems = readCanonicalStateItemIds(
      database,
      scope,
      observed.state_revision,
      observed
    );
    const activeEdges = new Map<string, string>();
    for (const relation of relations.values()) {
      if (!sameVector(relation.observed_revision_vector, observed) &&
          !vectorAtOrAfter(observed, relation.observed_revision_vector)) corrupt();
      assertEventRefs(
        database,
        scope,
        relation.provenance_event_ids,
        relation.observed_revision_vector.ledger_revision,
        stored
      );
      assertPairing(relation);
      assertEndpointExists(database, scope, relation.source, facts, stateItems, observed, stored);
      assertEndpointExists(database, scope, relation.target, facts, stateItems, observed, stored);
      if (relation.source.type === relation.target.type &&
          relation.source.id === relation.target.id) invalid();
      if (relation.status === "active") {
        const key = edgeKey(relation);
        if (activeEdges.has(key)) conflict();
        activeEdges.set(key, relation.relation_id);
      }
    }
    assertAcyclic(relations, "SUPERSEDES");
    assertAcyclic(relations, "DEPENDS_ON");
    for (const fact of facts.values()) {
      assertEventRefs(
        database,
        scope,
        fact.provenance_event_ids,
        fact.observed_revision_vector.ledger_revision,
        stored
      );
      assertEventRefs(
        database,
        scope,
        fact.verification_event_ids,
        fact.observed_revision_vector.ledger_revision,
        stored
      );
      assertVerificationRefs(fact.verification_status, fact.verification_event_ids, stored);
      if (fact.verification_status === "contested" &&
          !hasIncomingReason(relations, fact.fact_id, "CONTRADICTS")) conflict();
      if (fact.lifecycle_status === "superseded" &&
          !hasIncomingReason(relations, fact.fact_id, "SUPERSEDES")) conflict();
      if (fact.lifecycle_status === "retracted" &&
          !hasIncomingReason(relations, fact.fact_id, "RETRACTS")) conflict();
    }
  } catch (error) {
    if (stored && !(error instanceof CanonicalFactRelationError &&
        error.code === "CORRUPT_DATA")) corrupt();
    throw error;
  }
}

function assertEndpointExists(
  database: DatabaseSync,
  scope: RevisionScope,
  endpoint: CanonicalRelationEndpoint,
  facts: Map<string, CommittedCanonicalFact>,
  stateItems: Set<string>,
  observed: RevisionVector,
  stored: boolean
): void {
  if (endpoint.type === "FACT") {
    if (!facts.has(endpoint.id)) stored ? corrupt() : conflict();
    return;
  }
  if (endpoint.type === "STATE_ITEM") {
    if (!stateItems.has(endpoint.id)) stored ? corrupt() : conflict();
    return;
  }
  const row = database.prepare(
    `SELECT ledger_revision FROM cc_ledger_raw_events
     WHERE namespace = ? AND stream_id = ? AND event_id = ?`
  ).get(scope.namespace, scope.stream_id, endpoint.id) as { ledger_revision: number } | undefined;
  if (row === undefined || validateStoredRevision(row.ledger_revision, true) >
      observed.ledger_revision) stored ? corrupt() : conflict();
}

function readCanonicalStateItemIds(
  database: DatabaseSync,
  scope: RevisionScope,
  stateRevision: number,
  observed: RevisionVector
): Set<string> {
  if (stateRevision === 0) return new Set();
  if (observed.state_revision !== stateRevision) corrupt();
  const committed = readCanonicalStateAuthority(database, scope, stateRevision, observed);
  return new Set(committed.state.items.map((item) => item.item_id));
}

function readCanonicalStateAuthority(
  database: DatabaseSync,
  scope: RevisionScope,
  stateRevision: number,
  observed: RevisionVector
): CommittedCanonicalStateRevision {
  const row = database.prepare(
    `SELECT namespace, stream_id, state_revision, state_commit_id, commit_mode,
            previous_state_revision, proposal_json, state_json, state_hash,
            policy_hash, provenance_event_ids_json, created_at
     FROM cc_canonical_state_revisions
     WHERE namespace = ? AND stream_id = ? AND state_revision = ?`
  ).get(
    scope.namespace,
    scope.stream_id,
    stateRevision
  ) as CanonicalStateAuthorityRow | undefined;
  if (row === undefined) corrupt();
  const committed = canonicalStateCommittedFromRow(row, scope);
  const marker = database.prepare(
    `SELECT operation, kind, request_fingerprint, request_json,
            previous_json, current_json, result_json
     FROM cc_revision_commits
     WHERE namespace = ? AND stream_id = ? AND commit_id = ?`
  ).get(
    scope.namespace,
    scope.stream_id,
    committed.state_commit_id
  ) as CanonicalStateMarkerRow | undefined;
  if (marker === undefined || marker.operation !== "STATE" ||
      marker.kind !== "CANONICAL_STATE_COMMIT_V1") corrupt();
  const previous = parseStoredVector(marker.previous_json, scope);
  const current = parseStoredVector(marker.current_json, scope);
  if (previous.state_revision !== committed.previous_state_revision ||
      current.state_revision !== committed.state_revision ||
      current.state_revision !== previous.state_revision + 1 ||
      !sameCanonicalStateNonStateAxes(previous, current) ||
      !vectorAtOrAfter(observed, current)) corrupt();

  const requestJson = canonicalStateJson(canonicalStateMarkerRequest(committed));
  if (marker.request_json !== requestJson ||
      storedHash(marker.request_fingerprint) !== sha256(requestJson)) corrupt();
  assertEventRefs(
    database,
    scope,
    committed.provenance_event_ids,
    current.ledger_revision,
    true
  );
  if (marker.result_json !== canonicalStateJson(canonicalStateCommittedAsJson(committed))) {
    corrupt();
  }

  const previousState = committed.previous_state_revision === 0
    ? ({ schema_version: 1, items: [] } as CanonicalState)
    : readCanonicalStateSnapshot(
      database,
      scope,
      committed.previous_state_revision
    );
  const reduced = reduceStoredCanonicalState(previousState, committed.proposal);
  if (canonicalStateJson(canonicalStateAsJson(reduced)) !==
      canonicalStateJson(canonicalStateAsJson(committed.state))) corrupt();
  return committed;
}

function readCanonicalStateSnapshot(
  database: DatabaseSync,
  scope: RevisionScope,
  stateRevision: number
): CanonicalState {
  const row = database.prepare(
    `SELECT state_json, state_hash FROM cc_canonical_state_revisions
     WHERE namespace = ? AND stream_id = ? AND state_revision = ?`
  ).get(scope.namespace, scope.stream_id, stateRevision) as {
    state_json: string;
    state_hash: string;
  } | undefined;
  if (row === undefined) corrupt();
  const state = parseStoredCanonicalState(row.state_json);
  if (storedHash(row.state_hash) !== sha256(canonicalStateJson(canonicalStateAsJson(state)))) {
    corrupt();
  }
  return state;
}

function canonicalStateCommittedFromRow(
  row: CanonicalStateAuthorityRow,
  expectedScope: RevisionScope
): CommittedCanonicalStateRevision {
  try {
    const scope = storedScope(row.namespace, row.stream_id);
    if (!sameScope(scope, expectedScope)) corrupt();
    const stateRevision = validateStoredRevision(row.state_revision, true);
    const previousStateRevision = validateStoredRevision(row.previous_state_revision);
    if (stateRevision !== previousStateRevision + 1) corrupt();
    const proposal = parseStoredCanonicalStateProposal(row.proposal_json);
    const state = parseStoredCanonicalState(row.state_json);
    const stateHash = storedHash(row.state_hash);
    if (stateHash !== sha256(canonicalStateJson(canonicalStateAsJson(state)))) corrupt();
    const policyHash = storedHash(row.policy_hash);
    if (policyHash !== CANONICAL_STATE_POLICY_HASH) corrupt();
    const provenanceEventIds = parseStoredCanonicalStateIdentifierArray(
      row.provenance_event_ids_json,
      1,
      MAX_STATE_COMMIT_EVENT_IDS
    );
    const proposalEventIds = [...new Set(
      proposal.upsert_items.flatMap((item) => item.source_event_ids)
    )].sort();
    if (!sameStrings(provenanceEventIds, proposalEventIds)) corrupt();
    return {
      ...scope,
      state_revision: stateRevision,
      state_commit_id: storedIdentifier(row.state_commit_id),
      commit_mode: storedCanonicalStateCommitMode(row.commit_mode),
      previous_state_revision: previousStateRevision,
      proposal,
      state,
      state_hash: stateHash,
      policy_hash: policyHash,
      provenance_event_ids: provenanceEventIds,
      created_at: storedTimestamp(row.created_at),
    };
  } catch (error) {
    if (error instanceof CanonicalFactRelationError && error.code === "CORRUPT_DATA") {
      throw error;
    }
    corrupt();
  }
}

function parseStoredCanonicalStateProposal(json: string): CanonicalStateProposal {
  try {
    const proposal = normalizeStoredCanonicalStateProposal(JSON.parse(json));
    if (canonicalStateJson(canonicalStateProposalAsJson(proposal)) !== json) corrupt();
    return proposal;
  } catch (error) {
    if (error instanceof CanonicalFactRelationError && error.code === "CORRUPT_DATA") {
      throw error;
    }
    corrupt();
  }
}

function parseStoredCanonicalState(json: string): CanonicalState {
  try {
    const state = normalizeStoredCanonicalState(JSON.parse(json));
    if (canonicalStateJson(canonicalStateAsJson(state)) !== json) corrupt();
    return state;
  } catch (error) {
    if (error instanceof CanonicalFactRelationError && error.code === "CORRUPT_DATA") {
      throw error;
    }
    corrupt();
  }
}

function normalizeStoredCanonicalStateProposal(value: unknown): CanonicalStateProposal {
  const proposal = readExactObject(value, ["schema_version", "upsert_items"]);
  if (proposal.schema_version !== 1 || !Array.isArray(proposal.upsert_items)) corrupt();
  assertDensePlainArray(proposal.upsert_items);
  if (proposal.upsert_items.length < 1 ||
      proposal.upsert_items.length > MAX_STATE_UPSERT_ITEMS) corrupt();
  const items = proposal.upsert_items.map(normalizeStoredCanonicalStateItem)
    .sort(compareCanonicalStateItems);
  for (let index = 1; index < items.length; index += 1) {
    if (items[index - 1]?.item_id === items[index]?.item_id) corrupt();
  }
  return { schema_version: 1, upsert_items: items };
}

function normalizeStoredCanonicalState(value: unknown): CanonicalState {
  const state = readExactObject(value, ["schema_version", "items"]);
  if (state.schema_version !== 1 || !Array.isArray(state.items)) corrupt();
  assertDensePlainArray(state.items);
  const items = state.items.map(normalizeStoredCanonicalStateItem);
  if (items.length > MAX_SAFE_REVISION) corrupt();
  const sorted = [...items].sort(compareCanonicalStateItems);
  if (canonicalStateJson(items.map(canonicalStateItemAsJson)) !==
      canonicalStateJson(sorted.map(canonicalStateItemAsJson))) corrupt();
  for (let index = 1; index < items.length; index += 1) {
    if (items[index - 1]?.item_id === items[index]?.item_id) corrupt();
  }
  return { schema_version: 1, items };
}

function normalizeStoredCanonicalStateItem(value: unknown): CanonicalStateItem {
  const item = readExactObject(value, [
    "item_id",
    "kind",
    "content",
    "status",
    "source_event_ids",
    "metadata",
  ]);
  const itemId = storedIdentifier(item.item_id);
  const kind = item.kind;
  if (typeof kind !== "string" ||
      !CANONICAL_STATE_ITEM_KINDS.includes(kind as CanonicalStateItemKind)) corrupt();
  const content = storedText(item.content, MAX_STATE_CONTENT_LENGTH);
  const status = item.status;
  if (typeof status !== "string" ||
      !isCanonicalStateStatus(kind as CanonicalStateItemKind, status)) corrupt();
  return {
    item_id: itemId,
    kind: kind as CanonicalStateItemKind,
    content,
    status: status as CanonicalStateItemStatus,
    source_event_ids: normalizeStoredCanonicalStateIdentifierArray(
      item.source_event_ids,
      1,
      MAX_STATE_ITEM_EVENT_IDS
    ),
    metadata: normalizeStoredCanonicalStateMetadata(item.metadata),
  };
}

function parseStoredCanonicalStateIdentifierArray(
  json: string,
  minimum: number,
  maximum: number
): string[] {
  try {
    const ids = normalizeStoredCanonicalStateIdentifierArray(
      JSON.parse(json),
      minimum,
      maximum
    );
    if (canonicalStateJson(ids) !== json) corrupt();
    return ids;
  } catch (error) {
    if (error instanceof CanonicalFactRelationError && error.code === "CORRUPT_DATA") {
      throw error;
    }
    corrupt();
  }
}

function normalizeStoredCanonicalStateIdentifierArray(
  value: unknown,
  minimum: number,
  maximum: number
): string[] {
  if (!Array.isArray(value)) corrupt();
  assertDensePlainArray(value);
  if (value.length < minimum || value.length > maximum) corrupt();
  const ids = value.map(storedIdentifier).sort();
  for (let index = 1; index < ids.length; index += 1) {
    if (ids[index - 1] === ids[index]) corrupt();
  }
  return ids;
}

function normalizeStoredCanonicalStateMetadata(value: unknown): JsonObject {
  const normalized = normalizeCanonicalStateJsonValue(value);
  if (normalized === null || typeof normalized !== "object" || Array.isArray(normalized)) {
    corrupt();
  }
  return normalized;
}

function normalizeCanonicalStateJsonValue(
  value: unknown,
  ancestors = new Set<object>()
): JsonValue {
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "string") {
    if (value.length > MAX_METADATA_STRING_LENGTH || value !== value.normalize("NFC") ||
        /\p{Cc}/u.test(value)) corrupt();
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value) || Object.is(value, -0)) corrupt();
    return value;
  }
  if (typeof value !== "object" || ancestors.has(value)) corrupt();
  const prototype = Object.getPrototypeOf(value);
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      if (prototype !== Array.prototype) corrupt();
      assertDensePlainArray(value);
      return value.map((entry) => normalizeCanonicalStateJsonValue(entry, ancestors));
    }
    if (prototype !== Object.prototype && prototype !== null) corrupt();
    const keys = Reflect.ownKeys(value);
    if (keys.some((key) => typeof key !== "string")) corrupt();
    const result: JsonObject = {};
    for (const key of (keys as string[]).sort()) {
      try { validateText(key, MAX_IDENTIFIER_LENGTH); } catch { corrupt(); }
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor?.enumerable || !("value" in descriptor)) corrupt();
      Object.defineProperty(result, key, {
        configurable: true,
        enumerable: true,
        writable: true,
        value: normalizeCanonicalStateJsonValue(descriptor.value, ancestors),
      });
    }
    return result;
  } finally {
    ancestors.delete(value);
  }
}

function reduceStoredCanonicalState(
  previous: CanonicalState,
  proposal: CanonicalStateProposal
): CanonicalState {
  try {
    const byId = new Map(
      previous.items.map((item) => [item.item_id, cloneCanonicalStateItem(item)])
    );
    for (const next of proposal.upsert_items) {
      const existing = byId.get(next.item_id);
      if (existing === undefined) {
        if (next.status !== initialCanonicalStateStatus(next.kind)) corrupt();
        byId.set(next.item_id, cloneCanonicalStateItem(next));
        continue;
      }
      if (existing.kind !== next.kind ||
          !isCanonicalStateTransition(existing.kind, existing.status, next.status) ||
          existing.source_event_ids.some((eventId) =>
            !next.source_event_ids.includes(eventId)
          ) ||
          canonicalStateJson(canonicalStateItemAsJson(existing)) ===
            canonicalStateJson(canonicalStateItemAsJson(next))) corrupt();
      byId.set(next.item_id, cloneCanonicalStateItem(next));
    }
    return {
      schema_version: 1,
      items: [...byId.values()].sort(compareCanonicalStateItems),
    };
  } catch (error) {
    if (error instanceof CanonicalFactRelationError && error.code === "CORRUPT_DATA") {
      throw error;
    }
    corrupt();
  }
}

function canonicalStateMarkerRequest(committed: CommittedCanonicalStateRevision): JsonValue {
  return {
    scope: { namespace: committed.namespace, stream_id: committed.stream_id },
    commit_id: committed.state_commit_id,
    operation: "STATE",
    kind: "CANONICAL_STATE_COMMIT_V1",
    request: {
      commit_mode: committed.commit_mode,
      expected_state_revision: committed.previous_state_revision,
      proposal: canonicalStateProposalAsJson(committed.proposal),
      policy_hash: committed.policy_hash,
      provenance_event_ids: [...committed.provenance_event_ids],
    },
    expected_state_revision: committed.previous_state_revision,
  };
}

function canonicalStateCommittedAsJson(
  committed: CommittedCanonicalStateRevision
): JsonValue {
  return {
    namespace: committed.namespace,
    stream_id: committed.stream_id,
    state_revision: committed.state_revision,
    state_commit_id: committed.state_commit_id,
    commit_mode: committed.commit_mode,
    previous_state_revision: committed.previous_state_revision,
    proposal: canonicalStateProposalAsJson(committed.proposal),
    state: canonicalStateAsJson(committed.state),
    state_hash: committed.state_hash,
    policy_hash: committed.policy_hash,
    provenance_event_ids: [...committed.provenance_event_ids],
    created_at: committed.created_at,
  };
}

function canonicalStateProposalAsJson(proposal: CanonicalStateProposal): JsonValue {
  return {
    schema_version: 1,
    upsert_items: proposal.upsert_items.map(canonicalStateItemAsJson),
  };
}

function canonicalStateAsJson(state: CanonicalState): JsonValue {
  return { schema_version: 1, items: state.items.map(canonicalStateItemAsJson) };
}

function canonicalStateItemAsJson(item: CanonicalStateItem): JsonValue {
  return {
    item_id: item.item_id,
    kind: item.kind,
    content: item.content,
    status: item.status,
    source_event_ids: [...item.source_event_ids],
    metadata: normalizeStoredCanonicalStateMetadata(item.metadata),
  };
}

function canonicalStateJson(value: JsonValue): string {
  return JSON.stringify(normalizeCanonicalStateJsonValue(value));
}

function storedCanonicalStateCommitMode(value: unknown): CanonicalStateCommitMode {
  if (typeof value !== "string" ||
      !CANONICAL_STATE_COMMIT_MODES.includes(value as CanonicalStateCommitMode)) corrupt();
  return value as CanonicalStateCommitMode;
}

function cloneCanonicalStateItem(item: CanonicalStateItem): CanonicalStateItem {
  return {
    ...item,
    source_event_ids: [...item.source_event_ids],
    metadata: normalizeStoredCanonicalStateMetadata(item.metadata),
  };
}

function compareCanonicalStateItems(
  left: CanonicalStateItem,
  right: CanonicalStateItem
): number {
  return left.item_id < right.item_id ? -1 : left.item_id > right.item_id ? 1 : 0;
}

function initialCanonicalStateStatus(kind: CanonicalStateItemKind): CanonicalStateItemStatus {
  switch (kind) {
    case "GOAL":
    case "CONSTRAINT":
    case "DECISION": return "ACTIVE";
    case "OPEN_QUESTION": return "OPEN";
    case "REJECTED_ALTERNATIVE": return "REJECTED";
  }
}

function isCanonicalStateStatus(kind: CanonicalStateItemKind, status: string): boolean {
  switch (kind) {
    case "GOAL": return ["ACTIVE", "COMPLETED", "SUPERSEDED"].includes(status);
    case "CONSTRAINT":
    case "DECISION": return ["ACTIVE", "SUPERSEDED"].includes(status);
    case "OPEN_QUESTION": return ["OPEN", "DEFERRED", "RESOLVED"].includes(status);
    case "REJECTED_ALTERNATIVE": return status === "REJECTED";
  }
}

function isCanonicalStateTransition(
  kind: CanonicalStateItemKind,
  previous: CanonicalStateItemStatus,
  next: CanonicalStateItemStatus
): boolean {
  if (previous === next) return true;
  switch (kind) {
    case "GOAL":
      return previous === "ACTIVE" && ["COMPLETED", "SUPERSEDED"].includes(next);
    case "CONSTRAINT":
    case "DECISION": return previous === "ACTIVE" && next === "SUPERSEDED";
    case "OPEN_QUESTION":
      return (previous === "OPEN" && ["DEFERRED", "RESOLVED"].includes(next)) ||
        (previous === "DEFERRED" && ["OPEN", "RESOLVED"].includes(next));
    case "REJECTED_ALTERNATIVE": return false;
  }
}

function sameCanonicalStateNonStateAxes(
  previous: RevisionVector,
  current: RevisionVector
): boolean {
  return sameScope(previous, current) &&
    previous.ledger_revision === current.ledger_revision &&
    previous.raw_frontier_revision === current.raw_frontier_revision &&
    previous.frontier_position === current.frontier_position &&
    previous.takeover_commit_revision === current.takeover_commit_revision;
}

function assertEventRefs(
  database: DatabaseSync,
  scope: RevisionScope,
  ids: readonly string[],
  highWater: number,
  stored: boolean
): void {
  const query = database.prepare(
    `SELECT ledger_revision FROM cc_ledger_raw_events
     WHERE namespace = ? AND stream_id = ? AND event_id = ?`
  );
  for (const id of ids) {
    const row = query.get(scope.namespace, scope.stream_id, id) as {
      ledger_revision: number;
    } | undefined;
    if (row === undefined || validateStoredRevision(row.ledger_revision, true) > highWater) {
      stored ? corrupt() : conflict();
    }
  }
}

function assertPairing(relation: CommittedCanonicalRelation): void {
  const pair = `${relation.source.type}>${relation.target.type}`;
  const allowed: Record<CanonicalRelationType, readonly string[]> = {
    SUPPORTS: ["RAW_EVENT>FACT", "FACT>FACT"],
    CONTRADICTS: ["RAW_EVENT>FACT", "FACT>FACT"],
    SUPERSEDES: ["FACT>FACT"],
    RETRACTS: ["RAW_EVENT>FACT", "FACT>FACT"],
    DERIVED_FROM: [
      "FACT>RAW_EVENT",
      "FACT>FACT",
      "FACT>STATE_ITEM",
      "STATE_ITEM>RAW_EVENT",
      "STATE_ITEM>FACT",
      "STATE_ITEM>STATE_ITEM",
    ],
    DEPENDS_ON: [
      "FACT>FACT",
      "FACT>STATE_ITEM",
      "STATE_ITEM>FACT",
      "STATE_ITEM>STATE_ITEM",
    ],
    RESOLVES: [
      "RAW_EVENT>FACT",
      "RAW_EVENT>STATE_ITEM",
      "FACT>FACT",
      "FACT>STATE_ITEM",
      "STATE_ITEM>FACT",
      "STATE_ITEM>STATE_ITEM",
    ],
  };
  if (!allowed[relation.relation_type].includes(pair)) invalid();
}

function edgeKey(relation: CommittedCanonicalRelation): string {
  return [
    relation.source.type,
    relation.source.id,
    relation.relation_type,
    relation.target.type,
    relation.target.id,
  ].join("\u0000");
}

function hasIncomingReason(
  relations: Map<string, CommittedCanonicalRelation>,
  factId: string,
  type: CanonicalRelationType
): boolean {
  for (const relation of relations.values()) {
    if (relation.status === "active" && relation.relation_type === type &&
        relation.target.type === "FACT" && relation.target.id === factId) return true;
  }
  return false;
}

function assertAcyclic(
  relations: Map<string, CommittedCanonicalRelation>,
  type: "SUPERSEDES" | "DEPENDS_ON"
): void {
  const graph = new Map<string, Set<string>>();
  for (const relation of relations.values()) {
    if (relation.status !== "active" || relation.relation_type !== type) continue;
    const source = `${relation.source.type}:${relation.source.id}`;
    const target = `${relation.target.type}:${relation.target.id}`;
    let edges = graph.get(source);
    if (edges === undefined) {
      edges = new Set();
      graph.set(source, edges);
    }
    edges.add(target);
  }
  if (new Set([...graph.keys(), ...[...graph.values()].flatMap((set) => [...set])]).size >
      MAX_GRAPH_NODES) invalid();
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (node: string): void => {
    if (visiting.has(node)) conflict();
    if (visited.has(node)) return;
    visiting.add(node);
    for (const target of graph.get(node) ?? []) visit(target);
    visiting.delete(node);
    visited.add(node);
  };
  for (const node of graph.keys()) visit(node);
}

function factFromRow(row: FactRow, scope: RevisionScope): CommittedCanonicalFact {
  try {
    assertStoredScope(row, scope);
    const base = {
      ...scope,
      fact_id: storedIdentifier(row.fact_id),
      fact_revision: validateStoredRevision(row.fact_revision, true),
      authority_commit_id: storedIdentifier(row.authority_commit_id),
      statement: storedText(row.statement, MAX_STATEMENT_LENGTH),
      epistemic_origin: storedOrigin(row.epistemic_origin),
      verification_status: storedVerification(row.verification_status),
      lifecycle_status: storedLifecycle(row.lifecycle_status),
      record_status: storedRecordStatus(row.record_status),
      provenance_event_ids: parseStoredIdentifierSet(row.provenance_event_ids_json, 1),
      verification_event_ids: parseStoredIdentifierSet(row.verification_event_ids_json, 0),
      metadata: parseStoredMetadata(row.metadata_json),
      observed_revision_vector: parseStoredVector(row.observed_revision_vector_json, scope),
      created_at: storedTimestamp(row.created_at),
    };
    const hash = storedHash(row.fact_hash);
    if (hash !== sha256(canonicalJson(factHashPayload(base)))) corrupt();
    assertVerificationRefs(base.verification_status, base.verification_event_ids, true);
    return { ...base, fact_hash: hash };
  } catch (error) {
    if (error instanceof CanonicalFactRelationError && error.code === "CORRUPT_DATA") throw error;
    corrupt();
  }
}

function relationFromRow(
  row: RelationRow,
  scope: RevisionScope
): CommittedCanonicalRelation {
  try {
    assertStoredScope(row, scope);
    const origin = storedOrigin(row.origin);
    const confidence = storedConfidence(origin, row.confidence);
    const base = {
      ...scope,
      relation_id: storedIdentifier(row.relation_id),
      relation_revision: validateStoredRevision(row.relation_revision, true),
      authority_commit_id: storedIdentifier(row.authority_commit_id),
      source: {
        type: storedEndpointType(row.source_type),
        id: storedIdentifier(row.source_id),
      },
      relation_type: storedRelationType(row.relation_type),
      target: {
        type: storedEndpointType(row.target_type),
        id: storedIdentifier(row.target_id),
      },
      origin,
      provenance_event_ids: parseStoredIdentifierSet(row.provenance_event_ids_json, 1),
      ...(confidence === undefined ? {} : { confidence }),
      status: storedRelationStatus(row.status),
      metadata: parseStoredMetadata(row.metadata_json),
      observed_revision_vector: parseStoredVector(row.observed_revision_vector_json, scope),
      created_at: storedTimestamp(row.created_at),
    };
    const hash = storedHash(row.relation_hash);
    if (hash !== sha256(canonicalJson(relationHashPayload(base)))) corrupt();
    const result = { ...base, relation_hash: hash };
    assertPairing(result);
    return result;
  } catch (error) {
    if (error instanceof CanonicalFactRelationError && error.code === "CORRUPT_DATA") throw error;
    corrupt();
  }
}

function parseStoredCommitInput(json: string): NormalizedCommitInput {
  try {
    const parsed = normalizeCommitInput(JSON.parse(json));
    if (canonicalJson(parsed.request) !== json) corrupt();
    return parsed;
  } catch (error) {
    if (error instanceof CanonicalFactRelationError && error.code === "CORRUPT_DATA") throw error;
    corrupt();
  }
}

function parseStoredCommitResult(
  json: string,
  scope: RevisionScope
): CanonicalFactRelationCommitResult {
  try {
    const value = parseStoredJson(json);
    const object = readExactObject(value, [
      "namespace",
      "stream_id",
      "authority_commit_id",
      "policy_hash",
      "observed_revision_vector",
      "facts",
      "relations",
      "created_at",
    ]);
    const resultScope = storedScope(object.namespace, object.stream_id);
    if (!sameScope(resultScope, scope) || !Array.isArray(object.facts) ||
        !Array.isArray(object.relations)) corrupt();
    const facts = object.facts.map((item) => factFromJson(item, scope));
    const relations = object.relations.map((item) => relationFromJson(item, scope));
    assertStrictObjectOrder(facts.map((fact) => fact.fact_id), true);
    assertStrictObjectOrder(relations.map((relation) => relation.relation_id), true);
    const result: CanonicalFactRelationCommitResult = {
      ...scope,
      authority_commit_id: storedIdentifier(object.authority_commit_id),
      policy_hash: storedHash(object.policy_hash),
      observed_revision_vector: parseVectorValue(object.observed_revision_vector, scope),
      facts,
      relations,
      created_at: storedTimestamp(object.created_at),
    };
    if (canonicalJson(commitResultAsJson(result)) !== json) corrupt();
    return result;
  } catch (error) {
    if (error instanceof CanonicalFactRelationError && error.code === "CORRUPT_DATA") throw error;
    corrupt();
  }
}

function factFromJson(value: unknown, scope: RevisionScope): CommittedCanonicalFact {
  const object = readExactObject(value, [
    "namespace", "stream_id", "fact_id", "fact_revision", "authority_commit_id",
    "statement", "epistemic_origin", "verification_status", "lifecycle_status",
    "record_status", "provenance_event_ids", "verification_event_ids", "metadata",
    "observed_revision_vector", "fact_hash", "created_at",
  ]);
  return factFromRow({
    namespace: storedString(object.namespace),
    stream_id: storedString(object.stream_id),
    fact_id: storedString(object.fact_id),
    fact_revision: storedNumber(object.fact_revision),
    authority_commit_id: storedString(object.authority_commit_id),
    statement: storedString(object.statement),
    epistemic_origin: storedString(object.epistemic_origin),
    verification_status: storedString(object.verification_status),
    lifecycle_status: storedString(object.lifecycle_status),
    record_status: storedString(object.record_status),
    provenance_event_ids_json: canonicalJson(object.provenance_event_ids as JsonValue),
    verification_event_ids_json: canonicalJson(object.verification_event_ids as JsonValue),
    metadata_json: canonicalJson(object.metadata as JsonValue),
    observed_revision_vector_json: canonicalJson(object.observed_revision_vector as JsonValue),
    fact_hash: storedString(object.fact_hash),
    created_at: storedString(object.created_at),
  }, scope);
}

function relationFromJson(value: unknown, scope: RevisionScope): CommittedCanonicalRelation {
  const object = readObjectShape(value, [
    "namespace", "stream_id", "relation_id", "relation_revision", "authority_commit_id",
    "source", "relation_type", "target", "origin", "provenance_event_ids", "status",
    "metadata", "observed_revision_vector", "relation_hash", "created_at",
  ], ["confidence"]);
  const source = readExactObject(object.source, ["type", "id"]);
  const target = readExactObject(object.target, ["type", "id"]);
  return relationFromRow({
    namespace: storedString(object.namespace),
    stream_id: storedString(object.stream_id),
    relation_id: storedString(object.relation_id),
    relation_revision: storedNumber(object.relation_revision),
    authority_commit_id: storedString(object.authority_commit_id),
    source_type: storedString(source.type),
    source_id: storedString(source.id),
    relation_type: storedString(object.relation_type),
    target_type: storedString(target.type),
    target_id: storedString(target.id),
    origin: storedString(object.origin),
    provenance_event_ids_json: canonicalJson(object.provenance_event_ids as JsonValue),
    confidence: object.confidence === undefined ? null : storedNumber(object.confidence),
    status: storedString(object.status),
    metadata_json: canonicalJson(object.metadata as JsonValue),
    observed_revision_vector_json: canonicalJson(object.observed_revision_vector as JsonValue),
    relation_hash: storedString(object.relation_hash),
    created_at: storedString(object.created_at),
  }, scope);
}

function assertCommitRevisionMaps(
  request: NormalizedCommitInput,
  result: CanonicalFactRelationCommitResult,
  previous: ObjectRevisionMap,
  current: ObjectRevisionMap
): void {
  if (request.fact_proposals.length !== result.facts.length ||
      request.relation_proposals.length !== result.relations.length ||
      previous.facts.length !== result.facts.length ||
      current.facts.length !== result.facts.length ||
      previous.relations.length !== result.relations.length ||
      current.relations.length !== result.relations.length) corrupt();
  for (let index = 0; index < result.facts.length; index += 1) {
    const proposal = request.fact_proposals[index];
    const fact = result.facts[index];
    const before = previous.facts[index];
    const after = current.facts[index];
    if (proposal === undefined || fact === undefined || before === undefined || after === undefined ||
        proposal.fact_id !== fact.fact_id || before.object_id !== fact.fact_id ||
        after.object_id !== fact.fact_id || after.revision !== fact.fact_revision ||
        after.revision !== before.revision + 1 ||
        (proposal.op === "CREATE" ? before.revision !== 0 :
          before.revision !== proposal.expected_fact_revision)) corrupt();
  }
  for (let index = 0; index < result.relations.length; index += 1) {
    const proposal = request.relation_proposals[index];
    const relation = result.relations[index];
    const before = previous.relations[index];
    const after = current.relations[index];
    if (proposal === undefined || relation === undefined || before === undefined ||
        after === undefined || proposal.relation_id !== relation.relation_id ||
        before.object_id !== relation.relation_id || after.object_id !== relation.relation_id ||
        after.revision !== relation.relation_revision || after.revision !== before.revision + 1 ||
        (proposal.op === "CREATE" ? before.revision !== 0 :
          before.revision !== proposal.expected_relation_revision)) corrupt();
  }
}

function parseStoredObjectRevisionMap(json: string): ObjectRevisionMap {
  try {
    const value = parseStoredJson(json);
    const object = readExactObject(value, ["facts", "relations"]);
    if (!Array.isArray(object.facts) || !Array.isArray(object.relations)) corrupt();
    const facts = object.facts.map(parseObjectRevisionEntry);
    const relations = object.relations.map(parseObjectRevisionEntry);
    assertStrictObjectOrder(facts.map((entry) => entry.object_id), true);
    assertStrictObjectOrder(relations.map((entry) => entry.object_id), true);
    const result = { facts, relations };
    if (canonicalJson(objectRevisionMapAsJson(result)) !== json) corrupt();
    return result;
  } catch (error) {
    if (error instanceof CanonicalFactRelationError && error.code === "CORRUPT_DATA") throw error;
    corrupt();
  }
}

function parseObjectRevisionEntry(value: unknown): ObjectRevisionEntry {
  const object = readExactObject(value, ["object_id", "revision"]);
  return {
    object_id: storedIdentifier(object.object_id),
    revision: validateStoredRevision(object.revision),
  };
}

function factProposalAsJson(proposal: CanonicalFactProposal): JsonValue {
  if (proposal.op === "CREATE") {
    return {
      op: proposal.op,
      fact_id: proposal.fact_id,
      statement: proposal.statement,
      epistemic_origin: proposal.epistemic_origin,
      verification_status: proposal.verification_status,
      lifecycle_status: proposal.lifecycle_status,
      record_status: proposal.record_status,
      provenance_event_ids: [...proposal.provenance_event_ids],
      verification_event_ids: [...proposal.verification_event_ids],
      metadata: cloneMetadata(proposal.metadata),
    };
  }
  return {
    op: proposal.op,
    fact_id: proposal.fact_id,
    expected_fact_revision: proposal.expected_fact_revision,
    verification_status: proposal.verification_status,
    lifecycle_status: proposal.lifecycle_status,
    record_status: proposal.record_status,
    provenance_event_ids: [...proposal.provenance_event_ids],
    verification_event_ids: [...proposal.verification_event_ids],
  };
}

function relationProposalAsJson(proposal: CanonicalRelationProposal): JsonValue {
  if (proposal.op === "CREATE") {
    return {
      op: proposal.op,
      relation_id: proposal.relation_id,
      source: { ...proposal.source },
      relation_type: proposal.relation_type,
      target: { ...proposal.target },
      origin: proposal.origin,
      provenance_event_ids: [...proposal.provenance_event_ids],
      ...(proposal.confidence === undefined ? {} : { confidence: proposal.confidence }),
      status: proposal.status,
      metadata: cloneMetadata(proposal.metadata),
    };
  }
  return {
    op: proposal.op,
    relation_id: proposal.relation_id,
    expected_relation_revision: proposal.expected_relation_revision,
    status: proposal.status,
    provenance_event_ids: [...proposal.provenance_event_ids],
  };
}

function factHashPayload(fact: Omit<CommittedCanonicalFact, "fact_hash">): JsonObject {
  return {
    namespace: fact.namespace,
    stream_id: fact.stream_id,
    fact_id: fact.fact_id,
    fact_revision: fact.fact_revision,
    authority_commit_id: fact.authority_commit_id,
    statement: fact.statement,
    epistemic_origin: fact.epistemic_origin,
    verification_status: fact.verification_status,
    lifecycle_status: fact.lifecycle_status,
    record_status: fact.record_status,
    provenance_event_ids: [...fact.provenance_event_ids],
    verification_event_ids: [...fact.verification_event_ids],
    metadata: cloneMetadata(fact.metadata),
    observed_revision_vector: vectorAsJson(fact.observed_revision_vector),
    created_at: fact.created_at,
  };
}

function relationHashPayload(
  relation: Omit<CommittedCanonicalRelation, "relation_hash">
): JsonObject {
  return {
    namespace: relation.namespace,
    stream_id: relation.stream_id,
    relation_id: relation.relation_id,
    relation_revision: relation.relation_revision,
    authority_commit_id: relation.authority_commit_id,
    source: { ...relation.source },
    relation_type: relation.relation_type,
    target: { ...relation.target },
    origin: relation.origin,
    provenance_event_ids: [...relation.provenance_event_ids],
    ...(relation.confidence === undefined ? {} : { confidence: relation.confidence }),
    status: relation.status,
    metadata: cloneMetadata(relation.metadata),
    observed_revision_vector: vectorAsJson(relation.observed_revision_vector),
    created_at: relation.created_at,
  };
}

function factAsJson(fact: CommittedCanonicalFact): JsonValue {
  return { ...factHashPayload(fact), fact_hash: fact.fact_hash };
}

function relationAsJson(relation: CommittedCanonicalRelation): JsonValue {
  return { ...relationHashPayload(relation), relation_hash: relation.relation_hash };
}

function commitResultAsJson(result: CanonicalFactRelationCommitResult): JsonValue {
  return {
    namespace: result.namespace,
    stream_id: result.stream_id,
    authority_commit_id: result.authority_commit_id,
    policy_hash: result.policy_hash,
    observed_revision_vector: vectorAsJson(result.observed_revision_vector),
    facts: result.facts.map(factAsJson),
    relations: result.relations.map(relationAsJson),
    created_at: result.created_at,
  };
}

function objectRevisionMapAsJson(map: ObjectRevisionMap): JsonValue {
  return {
    facts: map.facts.map((entry) => ({ ...entry })),
    relations: map.relations.map((entry) => ({ ...entry })),
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

function normalizeEndpoint(value: unknown): CanonicalRelationEndpoint {
  const object = readExactObject(value, ["type", "id"]);
  const type = object.type;
  if (typeof type !== "string" ||
      !CANONICAL_RELATION_ENDPOINT_TYPES.includes(type as CanonicalRelationEndpointType)) {
    invalid();
  }
  return { type: type as CanonicalRelationEndpointType, id: validateIdentifier(object.id) };
}

function normalizeOrigin(value: unknown): CanonicalFactOrigin {
  if (typeof value !== "string" || !CANONICAL_FACT_ORIGINS.includes(value as CanonicalFactOrigin)) {
    invalid();
  }
  return value as CanonicalFactOrigin;
}

function normalizeVerification(value: unknown): CanonicalFactVerificationStatus {
  if (typeof value !== "string" ||
      !CANONICAL_FACT_VERIFICATION_STATUSES.includes(value as CanonicalFactVerificationStatus)) {
    invalid();
  }
  return value as CanonicalFactVerificationStatus;
}

function normalizeLifecycle(value: unknown): CanonicalFactLifecycleStatus {
  if (typeof value !== "string" ||
      !CANONICAL_FACT_LIFECYCLE_STATUSES.includes(value as CanonicalFactLifecycleStatus)) invalid();
  return value as CanonicalFactLifecycleStatus;
}

function normalizeRecordStatus(value: unknown): CanonicalFactRecordStatus {
  if (typeof value !== "string" ||
      !CANONICAL_FACT_RECORD_STATUSES.includes(value as CanonicalFactRecordStatus)) invalid();
  return value as CanonicalFactRecordStatus;
}

function normalizeRelationType(value: unknown): CanonicalRelationType {
  if (typeof value !== "string" ||
      !CANONICAL_RELATION_TYPES.includes(value as CanonicalRelationType)) invalid();
  return value as CanonicalRelationType;
}

function normalizeRelationStatus(value: unknown): CanonicalRelationStatus {
  if (typeof value !== "string" ||
      !CANONICAL_RELATION_STATUSES.includes(value as CanonicalRelationStatus)) invalid();
  return value as CanonicalRelationStatus;
}

function normalizeConfidence(
  origin: CanonicalFactOrigin,
  value: unknown
): number | undefined {
  if (origin === "model_inferred") {
    if (typeof value !== "number" || !Number.isFinite(value) || Object.is(value, -0) ||
        value < 0 || value > 1) invalid();
    return value;
  }
  if (value !== undefined) invalid();
  return undefined;
}

function normalizeIdentifierSet(value: unknown, minimum: number): string[] {
  if (!Array.isArray(value)) invalid();
  assertDensePlainArray(value);
  if (value.length < minimum || value.length > MAX_OBJECT_EVENT_IDS) invalid();
  const ids = value.map(validateIdentifier);
  assertStrictObjectOrder(ids);
  return ids;
}

function validateIdentifier(value: unknown): string {
  return validateText(value, MAX_IDENTIFIER_LENGTH);
}

function validateText(value: unknown, maximum: number): string {
  if (typeof value !== "string" || value.length === 0 || value.length > maximum ||
      value.trim().length === 0 || value !== value.normalize("NFC") || /\p{Cc}/u.test(value)) {
    invalid();
  }
  return value;
}

function validatePositiveRevision(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1 ||
      (value as number) > MAX_SAFE_REVISION) invalid();
  return value as number;
}

function normalizeMetadata(value: unknown): JsonObject {
  const normalized = normalizeJsonValue(value, 0, new Set<object>(), MAX_METADATA_DEPTH);
  if (normalized === null || typeof normalized !== "object" || Array.isArray(normalized)) invalid();
  return normalized;
}

function normalizeJsonValue(
  value: unknown,
  depth = 0,
  ancestors = new Set<object>(),
  maximumDepth = Number.MAX_SAFE_INTEGER
): JsonValue {
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "string") {
    if (value.length > MAX_METADATA_STRING_LENGTH || value !== value.normalize("NFC") ||
        /\p{Cc}/u.test(value)) invalid();
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value) || Object.is(value, -0)) invalid();
    return value;
  }
  if (typeof value !== "object" || ancestors.has(value) || depth > maximumDepth) invalid();
  const prototype = Object.getPrototypeOf(value);
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      if (prototype !== Array.prototype) invalid();
      assertDensePlainArray(value);
      return value.map((entry) =>
        normalizeJsonValue(entry, depth + 1, ancestors, maximumDepth)
      );
    }
    if (prototype !== Object.prototype && prototype !== null) invalid();
    const keys = Reflect.ownKeys(value);
    if (keys.length > MAX_METADATA_KEYS || keys.some((key) => typeof key !== "string")) invalid();
    const result: JsonObject = {};
    for (const key of (keys as string[]).sort()) {
      validateText(key, MAX_IDENTIFIER_LENGTH);
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor?.enumerable || !("value" in descriptor)) invalid();
      Object.defineProperty(result, key, {
        enumerable: true,
        configurable: true,
        writable: true,
        value: normalizeJsonValue(descriptor.value, depth + 1, ancestors, maximumDepth),
      });
    }
    return result;
  } finally {
    ancestors.delete(value);
  }
}

function readExactObject(value: unknown, required: readonly string[]): Record<string, unknown> {
  return readObjectShape(value, required, []);
}

function readObjectShape(
  value: unknown,
  required: readonly string[],
  optional: readonly string[]
): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) invalid();
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) invalid();
  const allowed = new Set([...required, ...optional]);
  const keys = Reflect.ownKeys(value);
  if (keys.length < required.length || keys.length > allowed.size) invalid();
  for (const key of keys) {
    if (typeof key !== "string" || !allowed.has(key)) invalid();
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor?.enumerable || !("value" in descriptor)) invalid();
  }
  for (const key of required) if (!Object.prototype.hasOwnProperty.call(value, key)) invalid();
  return value as Record<string, unknown>;
}

function readLooseDiscriminator(value: unknown, key: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) invalid();
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) invalid();
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (!descriptor?.enumerable || !("value" in descriptor)) invalid();
  return value as Record<string, unknown>;
}

function assertDensePlainArray(value: unknown[]): void {
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

function assertStrictObjectOrder(values: readonly string[], stored = false): void {
  for (let index = 1; index < values.length; index += 1) {
    if ((values[index - 1] as string) >= (values[index] as string)) {
      stored ? corrupt() : invalid();
    }
  }
}

function assertMonotonic(previous: readonly string[], next: readonly string[]): void {
  if (previous.some((value) => !next.includes(value))) conflict();
}

function assertVerificationRefs(
  status: CanonicalFactVerificationStatus,
  refs: readonly string[],
  stored: boolean
): void {
  if (["verified", "disconfirmed"].includes(status) && refs.length === 0) {
    stored ? corrupt() : invalid();
  }
}

function isVerificationTransition(
  previous: CanonicalFactVerificationStatus,
  next: CanonicalFactVerificationStatus
): boolean {
  if (previous === next) return true;
  const allowed: Record<CanonicalFactVerificationStatus, readonly CanonicalFactVerificationStatus[]> = {
    unverified: ["corroborated", "verified", "contested", "disconfirmed"],
    corroborated: ["verified", "contested", "disconfirmed"],
    verified: ["disconfirmed"],
    contested: ["corroborated", "verified", "disconfirmed"],
    disconfirmed: ["corroborated", "verified"],
  };
  return allowed[previous].includes(next);
}

function isLifecycleTransition(
  previous: CanonicalFactLifecycleStatus,
  next: CanonicalFactLifecycleStatus
): boolean {
  return previous === next || (previous === "active" && ["superseded", "retracted"].includes(next));
}

function isRecordTransition(
  previous: CanonicalFactRecordStatus,
  next: CanonicalFactRecordStatus
): boolean {
  return previous === next || previous !== next;
}

function readVector(database: DatabaseSync, scope: RevisionScope): RevisionVector {
  const row = database.prepare(
    `SELECT namespace, stream_id, ledger_revision, state_revision,
            raw_frontier_revision, frontier_position, takeover_commit_revision
     FROM cc_revision_streams WHERE namespace = ? AND stream_id = ?`
  ).get(scope.namespace, scope.stream_id) as StreamRow | undefined;
  return row === undefined ? zeroVector(scope) : vectorFromRow(row, scope);
}

function vectorFromRow(row: StreamRow, scope: RevisionScope): RevisionVector {
  assertStoredScope(row, scope);
  const vector: RevisionVector = {
    ...scope,
    ledger_revision: validateStoredRevision(row.ledger_revision),
    state_revision: validateStoredRevision(row.state_revision),
    raw_frontier_revision: validateStoredRevision(row.raw_frontier_revision),
    frontier_position: validateStoredRevision(row.frontier_position),
    takeover_commit_revision: validateStoredRevision(row.takeover_commit_revision),
  };
  if (vector.frontier_position > vector.ledger_revision) corrupt();
  return vector;
}

function zeroVector(scope: RevisionScope): RevisionVector {
  return {
    ...scope,
    ledger_revision: 0,
    state_revision: 0,
    raw_frontier_revision: 0,
    frontier_position: 0,
    takeover_commit_revision: 0,
  };
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

function parseStoredVector(json: string, scope: RevisionScope): RevisionVector {
  return parseVectorValue(parseStoredJson(json), scope);
}

function parseVectorValue(value: unknown, scope: RevisionScope): RevisionVector {
  const object = readExactObject(value, [
    "namespace",
    "stream_id",
    "ledger_revision",
    "state_revision",
    "raw_frontier_revision",
    "frontier_position",
    "takeover_commit_revision",
  ]);
  return vectorFromRow({
    namespace: storedString(object.namespace),
    stream_id: storedString(object.stream_id),
    ledger_revision: storedNumber(object.ledger_revision),
    state_revision: storedNumber(object.state_revision),
    raw_frontier_revision: storedNumber(object.raw_frontier_revision),
    frontier_position: storedNumber(object.frontier_position),
    takeover_commit_revision: storedNumber(object.takeover_commit_revision),
  }, scope);
}

function sameVector(left: RevisionVector, right: RevisionVector): boolean {
  return canonicalJson(vectorAsJson(left)) === canonicalJson(vectorAsJson(right));
}

function vectorAtOrAfter(live: RevisionVector, historical: RevisionVector): boolean {
  return sameScope(live, historical) &&
    live.ledger_revision >= historical.ledger_revision &&
    live.state_revision >= historical.state_revision &&
    live.raw_frontier_revision >= historical.raw_frontier_revision &&
    live.frontier_position >= historical.frontier_position &&
    live.takeover_commit_revision >= historical.takeover_commit_revision;
}

function sameScope(left: RevisionScope, right: RevisionScope): boolean {
  return left.namespace === right.namespace && left.stream_id === right.stream_id;
}

function assertStoredScope(row: { namespace: unknown; stream_id: unknown }, scope: RevisionScope): void {
  const stored = storedScope(row.namespace, row.stream_id);
  if (!sameScope(stored, scope)) corrupt();
}

function storedScope(namespace: unknown, streamId: unknown): RevisionScope {
  try {
    return normalizeScope({ namespace, stream_id: streamId });
  } catch {
    corrupt();
  }
}

function storedIdentifier(value: unknown): string {
  try { return validateIdentifier(value); } catch { corrupt(); }
}

function storedText(value: unknown, maximum: number): string {
  try { return validateText(value, maximum); } catch { corrupt(); }
}

function storedOrigin(value: unknown): CanonicalFactOrigin {
  try { return normalizeOrigin(value); } catch { corrupt(); }
}

function storedVerification(value: unknown): CanonicalFactVerificationStatus {
  try { return normalizeVerification(value); } catch { corrupt(); }
}

function storedLifecycle(value: unknown): CanonicalFactLifecycleStatus {
  try { return normalizeLifecycle(value); } catch { corrupt(); }
}

function storedRecordStatus(value: unknown): CanonicalFactRecordStatus {
  try { return normalizeRecordStatus(value); } catch { corrupt(); }
}

function storedEndpointType(value: unknown): CanonicalRelationEndpointType {
  if (typeof value !== "string" ||
      !CANONICAL_RELATION_ENDPOINT_TYPES.includes(value as CanonicalRelationEndpointType)) corrupt();
  return value as CanonicalRelationEndpointType;
}

function storedRelationType(value: unknown): CanonicalRelationType {
  try { return normalizeRelationType(value); } catch { corrupt(); }
}

function storedRelationStatus(value: unknown): CanonicalRelationStatus {
  try { return normalizeRelationStatus(value); } catch { corrupt(); }
}

function storedConfidence(origin: CanonicalFactOrigin, value: unknown): number | undefined {
  try { return normalizeConfidence(origin, value === null ? undefined : value); } catch { corrupt(); }
}

function storedHash(value: unknown): string {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/u.test(value)) corrupt();
  return value;
}

function storedTimestamp(value: unknown): string {
  if (typeof value !== "string" || value.length > 100) corrupt();
  try { if (new Date(value).toISOString() !== value) corrupt(); } catch { corrupt(); }
  return value;
}

function storedString(value: unknown): string {
  if (typeof value !== "string") corrupt();
  return value;
}

function storedNumber(value: unknown): number {
  if (typeof value !== "number") corrupt();
  return value;
}

function validateStoredRevision(value: unknown, positive = false): number {
  if (!Number.isSafeInteger(value) || (value as number) < (positive ? 1 : 0) ||
      (value as number) > MAX_SAFE_REVISION) corrupt();
  return value as number;
}

function parseStoredIdentifierSet(json: string, minimum: number): string[] {
  try {
    const ids = normalizeIdentifierSet(JSON.parse(json), minimum);
    if (canonicalJson(ids) !== json) corrupt();
    return ids;
  } catch (error) {
    if (error instanceof CanonicalFactRelationError && error.code === "CORRUPT_DATA") throw error;
    corrupt();
  }
}

function parseStoredMetadata(json: string): JsonObject {
  try {
    const metadata = normalizeMetadata(JSON.parse(json));
    if (canonicalJson(metadata) !== json) corrupt();
    return metadata;
  } catch (error) {
    if (error instanceof CanonicalFactRelationError && error.code === "CORRUPT_DATA") throw error;
    corrupt();
  }
}

function parseStoredJson(json: string): JsonValue {
  try {
    const value = normalizeJsonValue(JSON.parse(json));
    if (canonicalJson(value) !== json) corrupt();
    return value;
  } catch (error) {
    if (error instanceof CanonicalFactRelationError && error.code === "CORRUPT_DATA") throw error;
    corrupt();
  }
}

function cloneFact(fact: CommittedCanonicalFact): CommittedCanonicalFact {
  return {
    ...fact,
    provenance_event_ids: [...fact.provenance_event_ids],
    verification_event_ids: [...fact.verification_event_ids],
    metadata: cloneMetadata(fact.metadata),
    observed_revision_vector: cloneVector(fact.observed_revision_vector),
  };
}

function cloneRelation(relation: CommittedCanonicalRelation): CommittedCanonicalRelation {
  return {
    ...relation,
    source: { ...relation.source },
    target: { ...relation.target },
    provenance_event_ids: [...relation.provenance_event_ids],
    metadata: cloneMetadata(relation.metadata),
    observed_revision_vector: cloneVector(relation.observed_revision_vector),
  };
}

function cloneCommitResult(
  result: CanonicalFactRelationCommitResult
): CanonicalFactRelationCommitResult {
  return {
    ...result,
    observed_revision_vector: cloneVector(result.observed_revision_vector),
    facts: result.facts.map(cloneFact),
    relations: result.relations.map(cloneRelation),
  };
}

function cloneMetadata(metadata: JsonObject): JsonObject {
  return normalizeMetadata(metadata);
}

function cloneVector(vector: RevisionVector): RevisionVector {
  return { ...vector };
}

function compareFacts(left: CommittedCanonicalFact, right: CommittedCanonicalFact): number {
  return left.fact_id < right.fact_id ? -1 : left.fact_id > right.fact_id ? 1 : 0;
}

function compareRelations(
  left: CommittedCanonicalRelation,
  right: CommittedCanonicalRelation
): number {
  return left.relation_id < right.relation_id ? -1 :
    left.relation_id > right.relation_id ? 1 : 0;
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function canonicalJson(value: JsonValue): string {
  return JSON.stringify(normalizeJsonValue(value));
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function validateSchema(database: DatabaseSync): void {
  assertTableColumns(database, "cc_canonical_fact_relation_schema", [
    "version", "completed_at",
  ]);
  assertTableColumns(database, "cc_canonical_fact_relation_commits", [
    "namespace", "stream_id", "authority_commit_id", "policy_hash",
    "request_fingerprint", "request_json", "observed_revision_vector_json",
    "previous_object_revisions_json", "current_object_revisions_json", "result_json",
    "created_at",
  ]);
  assertTableColumns(database, "cc_canonical_fact_revisions", [
    "namespace", "stream_id", "fact_id", "fact_revision", "authority_commit_id",
    "statement", "epistemic_origin", "verification_status", "lifecycle_status",
    "record_status", "provenance_event_ids_json", "verification_event_ids_json",
    "metadata_json", "observed_revision_vector_json", "fact_hash", "created_at",
  ]);
  assertTableColumns(database, "cc_canonical_relation_revisions", [
    "namespace", "stream_id", "relation_id", "relation_revision", "authority_commit_id",
    "source_type", "source_id", "relation_type", "target_type", "target_id", "origin",
    "provenance_event_ids_json", "confidence", "status", "metadata_json",
    "observed_revision_vector_json", "relation_hash", "created_at",
  ]);
  for (const expected of SCHEMA_OBJECTS) {
    const row = database.prepare(
      "SELECT type, name, sql FROM sqlite_master WHERE type = ? AND name = ?"
    ).get(expected.type, expected.name) as {
      type: string;
      name: string;
      sql: string | null;
    } | undefined;
    if (row?.type !== expected.type || row.name !== expected.name ||
        typeof row.sql !== "string" ||
        normalizeSchemaSql(row.sql) !== normalizeSchemaSql(expected.sql)) corrupt();
  }
}

function assertCurrentSchemaVersion(database: DatabaseSync): void {
  const rows = database.prepare(
    "SELECT version FROM cc_canonical_fact_relation_schema ORDER BY version"
  ).all() as Array<{ version: number }>;
  if (rows.length !== 1 || rows[0]?.version !== CANONICAL_FACT_RELATION_SCHEMA_VERSION) corrupt();
}

function sqliteObjectExists(
  database: DatabaseSync,
  type: "table" | "trigger",
  name: string
): boolean {
  const row = database.prepare(
    "SELECT name FROM sqlite_master WHERE type = ? AND name = ?"
  ).get(type, name) as { name: string } | undefined;
  return row?.name === name;
}

function assertTableColumns(
  database: DatabaseSync,
  table: string,
  expected: readonly string[]
): void {
  const rows = database.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (rows.length !== expected.length ||
      rows.some((row, index) => row.name !== expected[index])) corrupt();
}

function normalizeSchemaSql(sql: string): string {
  return sql.trim().replace(/\s+/gu, " ").replace(/;$/u, "");
}

function rollback(database: DatabaseSync): void {
  try { database.exec("ROLLBACK;"); } catch { /* preserve primary failure */ }
}

function invalid(): never {
  throw new CanonicalFactRelationError("INVALID_INPUT");
}

function notFound(): never {
  throw new CanonicalFactRelationError("NOT_FOUND");
}

function conflict(): never {
  throw new CanonicalFactRelationError("CONFLICT");
}

function corrupt(): never {
  throw new CanonicalFactRelationError("CORRUPT_DATA");
}
