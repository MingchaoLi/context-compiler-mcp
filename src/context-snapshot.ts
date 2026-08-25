import { createHash } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  CANONICAL_FACT_RELATION_POLICY_HASH,
  CanonicalFactRelationError,
  readCanonicalFactRelationAuthorityInsideCore,
  readCanonicalFactRelationProjectionInsideCore,
  type CanonicalFactRelationProjection,
  type CanonicalRelationEndpoint,
  type CommittedCanonicalFact,
  type CommittedCanonicalRelation,
} from "./canonical-fact-relation.js";
import {
  CANONICAL_STATE_POLICY_HASH,
  CanonicalStateError,
  readCanonicalStateAuthorityInsideCore,
  readCanonicalStateProjectionInsideCore,
  type CanonicalStateItem,
  type CanonicalStateProjection,
} from "./canonical-state.js";
import {
  LedgerHotRawError,
  readLedgerHotRawInsideCore,
  readLedgerRawEventsInsideCore,
  type LedgerRawEvent,
} from "./ledger-hot-raw.js";
import type { JsonObject, JsonValue } from "./raw-store.js";
import {
  type RevisionScope,
  type RevisionVector,
} from "./revision-substrate.js";
import {
  SemanticTakeoverError,
  readCompactionArtifactInsideCore,
  readCurrentSemanticTakeoverInsideCore,
  readSemanticTakeoverInsideCore,
  type CompactionArtifact,
  type CurrentSemanticTakeoverAuthority,
} from "./semantic-takeover.js";
import { initializeSqliteConnection } from "./sqlite-initialization.js";

export const CONTEXT_SNAPSHOT_SCHEMA_VERSION = 1;
export const CONTEXT_SNAPSHOT_POLICY_VERSION = "context-snapshot/v1";
export const CURRENT_AUTHORITY_PROJECTION_VERSION = "current-authority-hot-raw/v1";
export const CONTEXT_ASSEMBLER_VERSION = "priority-bucket-whole-object/v1";
export const TOKEN_ESTIMATOR_VERSION = "character-count-divided-by-four/v1";
export const CONTEXT_ASSEMBLER_VERSION_HASH =
  "e66825b13a057ae9648a83068e330c8025729fd77723bdd199d7cc4bd9ef888a";

export const CONTEXT_SNAPSHOT_INCLUSION_REASONS = [
  "CURRENT_AUTHORITY",
  "CURRENT_INPUT",
  "CURRENT_TAKEOVER_ARTIFACT",
  "DEPENDENCY_CLOSURE",
  "EXPLICIT_REQUIRED",
  "HARD_CONSTRAINT",
  "HOT_RAW_SUFFIX",
] as const;

export type ContextSnapshotInclusionReason =
  (typeof CONTEXT_SNAPSHOT_INCLUSION_REASONS)[number];

export type ContextSnapshotErrorCode =
  | "INVALID_INPUT"
  | "NOT_FOUND"
  | "CONFLICT"
  | "BUDGET_INSUFFICIENT"
  | "STORAGE_FAILURE"
  | "CORRUPT_DATA"
  | "CLOSED";

export interface ContextSnapshotFactRefInput {
  fact_id: string;
  fact_revision: number;
}

export interface ContextSnapshotRelationRefInput {
  relation_id: string;
  relation_revision: number;
}

export interface ExternalContentHash {
  stable_ref: string;
  content_hash: string;
}

export interface ContextSnapshotFreezeInput {
  schema_version: 1;
  scope: RevisionScope;
  snapshot_id: string;
  operation_id: string;
  attempt_id: string;
  expected_revision_vector: RevisionVector;
  current_input_event_id: string;
  required_state_item_ids: string[];
  required_raw_event_ids: string[];
  required_fact_refs: ContextSnapshotFactRefInput[];
  required_relation_refs: ContextSnapshotRelationRefInput[];
  host_manifest_digest: string;
  external_content_hashes: ExternalContentHash[];
  hard_token_capacity: number;
  policy_hash: string;
}

export interface SnapshotStateRef {
  item_id: string;
  kind: CanonicalStateItem["kind"];
  status: CanonicalStateItem["status"];
  inclusion_reasons: ContextSnapshotInclusionReason[];
}

export interface SnapshotExcludedStateRef {
  item_id: string;
  kind: CanonicalStateItem["kind"];
  status: CanonicalStateItem["status"];
  exclusion_reason: "DEFAULT_NOT_CURRENT";
}

export interface SnapshotFactRef {
  fact_id: string;
  fact_revision: number;
  fact_hash: string;
  inclusion_reasons: ContextSnapshotInclusionReason[];
}

export interface SnapshotRelationRef {
  relation_id: string;
  relation_revision: number;
  relation_hash: string;
  inclusion_reasons: ContextSnapshotInclusionReason[];
}

export interface SnapshotRawEventRef {
  ledger_revision: number;
  event_id: string;
  inclusion_reasons: ContextSnapshotInclusionReason[];
}

export interface SnapshotDependencyPath {
  root: CanonicalRelationEndpoint;
  target: CanonicalRelationEndpoint;
  relation_ids: string[];
}

export interface SnapshotTakeoverRef {
  takeover_commit_id: string;
  takeover_commit_revision: number;
  artifact_id: string;
  artifact_hash: string;
}

export interface SnapshotArtifactRef {
  artifact_id: string;
  artifact_hash: string;
  included_in_working_context: boolean;
  inclusion_reasons: ContextSnapshotInclusionReason[];
}

export interface ContextSnapshotManifest extends RevisionScope {
  schema_version: 1;
  snapshot_id: string;
  operation_id: string;
  attempt_id: string;
  ledger_as_of_revision: number;
  state_revision: number;
  raw_frontier_revision: number;
  frontier_position: number;
  takeover_commit_revision: number;
  state_hash: string;
  state_policy_hash: string;
  fact_relation_policy_hash: string;
  selected_state_refs: SnapshotStateRef[];
  excluded_state_refs: SnapshotExcludedStateRef[];
  selected_fact_refs: SnapshotFactRef[];
  selected_relation_refs: SnapshotRelationRef[];
  dependency_paths: SnapshotDependencyPath[];
  hot_raw_event_refs: SnapshotRawEventRef[];
  hot_raw_hash: string;
  required_raw_event_refs: SnapshotRawEventRef[];
  current_takeover_ref: SnapshotTakeoverRef | null;
  current_artifact_ref: SnapshotArtifactRef | null;
  evidence_bundle_id: null;
  evidence_event_refs: [];
  evidence_relation_paths: [];
  policy_hash: string;
  config_hash: string;
  projection_version: string;
  assembler_version_hash: string;
  current_input_event_id: string;
  current_input_hash: string;
  host_manifest_digest: string;
  external_content_hashes: ExternalContentHash[];
  working_context_hash: string;
  working_context_estimated_tokens: number;
  hard_token_capacity: number;
  created_at: string;
}

export interface ContextAttemptStarted extends RevisionScope {
  schema_version: 1;
  operation_id: string;
  attempt_id: string;
  snapshot_id: string;
  snapshot_manifest_hash: string;
  created_at: string;
}

export interface ContextSnapshot {
  manifest_hash: string;
  manifest: ContextSnapshotManifest;
  working_context: string;
  attempt_started: ContextAttemptStarted;
}

export class ContextSnapshotError extends Error {
  constructor(readonly code: ContextSnapshotErrorCode) {
    super(code);
    this.name = "ContextSnapshotError";
  }
}

const MAX_IDENTIFIER_LENGTH = 500;
const MAX_STABLE_REF_LENGTH = 2_000;
const MAX_REQUIRED_STATE_IDS = 1_000;
const MAX_REQUIRED_RAW_REFS = 1_000;
const MAX_REQUIRED_FACT_REFS = 1_000;
const MAX_REQUIRED_RELATION_REFS = 2_000;
const MAX_EXTERNAL_CONTENT_REFS = 100;
const MAX_HARD_TOKEN_CAPACITY = 1_000_000;
const MAX_MANIFEST_REFS = 100_000;
const MAX_SAFE_REVISION = Number.MAX_SAFE_INTEGER;
const HASH_PATTERN = /^[0-9a-f]{64}$/u;

const POLICY_DESCRIPTOR: JsonValue = {
  assembler_version: CONTEXT_ASSEMBLER_VERSION,
  assembly: {
    buckets: [
      "P0_CURRENT_INPUT_CONSTRAINT_REQUIRED_CLOSURE",
      "P1_ALL_CURRENT_STATE_HOT_RAW_SUFFIX",
      "P2_CURRENT_COMPACTION_ARTIFACT_IF_FITS",
      "P3_EMPTY",
    ],
    estimator: TOKEN_ESTIMATOR_VERSION,
    mandatory_overflow: "BUDGET_INSUFFICIENT_NO_SNAPSHOT",
    trim: "lowest-bucket-first-whole-object-no-partial",
  },
  attempt: "same-transaction-immutable-start-receipt",
  body: "persisted-immutable-utf8-text",
  bounds: {
    external_content_refs: MAX_EXTERNAL_CONTENT_REFS,
    hard_token_capacity: MAX_HARD_TOKEN_CAPACITY,
    identifier: MAX_IDENTIFIER_LENGTH,
    required_fact_refs: MAX_REQUIRED_FACT_REFS,
    required_raw_refs: MAX_REQUIRED_RAW_REFS,
    required_relation_refs: MAX_REQUIRED_RELATION_REFS,
    required_state_ids: MAX_REQUIRED_STATE_IDS,
    stable_ref: MAX_STABLE_REF_LENGTH,
  },
  current_authority: {
    default_excluded: [
      "CONSTRAINT/SUPERSEDED",
      "DECISION/SUPERSEDED",
      "GOAL/COMPLETED",
      "GOAL/SUPERSEDED",
      "OPEN_QUESTION/DEFERRED",
      "OPEN_QUESTION/RESOLVED",
      "REJECTED_ALTERNATIVE/REJECTED",
    ],
    default_selected: [
      "CONSTRAINT/ACTIVE",
      "DECISION/ACTIVE",
      "GOAL/ACTIVE",
      "OPEN_QUESTION/OPEN",
    ],
    placement: "all-current-included-no-persistent-hot-cold",
  },
  dedup: "exact-authority-identity-no-display-dedup",
  dependencies: {
    closure: "deterministic-transitive-state-fact",
    relation: "active-DEPENDS_ON-current-object-graph",
  },
  evidence: "empty-wo05-reserved-contract-fields",
  external_content: "stable-ref-plus-sha256",
  host: "opaque-digest-only",
  hot_raw: {
    current_input: "exact-user-input-event-single-render",
    eligibility: "frontier-position-exclusive-to-ledger-as-of-inclusive",
    projection: "identity-full-event-canonical-json",
    selection: "latest-contiguous-whole-event-suffix-after-required",
  },
  inclusion_reasons: [...CONTEXT_SNAPSHOT_INCLUSION_REASONS],
  input_world: "begin-immediate-exact-five-axis-cas",
  normalization: "nfc-no-unicode-cc-lexical-unique-sorted-inputs",
  policy_version: CONTEXT_SNAPSHOT_POLICY_VERSION,
  projection_version: CURRENT_AUTHORITY_PROJECTION_VERSION,
  retry: "exact-request-replay-id-substitution-conflict",
  schema_version: CONTEXT_SNAPSHOT_SCHEMA_VERSION,
  scope: "explicit-only-no-host-inference",
  unknown: "fail-closed",
};

export const CONTEXT_SNAPSHOT_POLICY_HASH = sha256(canonicalJson(POLICY_DESCRIPTOR));

interface NormalizedFreezeInput extends ContextSnapshotFreezeInput {
  request: JsonObject;
  requestJson: string;
  requestFingerprint: string;
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

interface SnapshotRow extends Record<string, unknown> {
  namespace: string;
  stream_id: string;
  snapshot_id: string;
  operation_id: string;
  attempt_id: string;
  request_fingerprint: string;
  request_json: string;
  manifest_hash: string;
  manifest_json: string;
  working_context_hash: string;
  working_context_text: string;
  created_at: string;
}

interface AttemptRow extends Record<string, unknown> {
  namespace: string;
  stream_id: string;
  attempt_id: string;
  operation_id: string;
  snapshot_id: string;
  snapshot_manifest_hash: string;
  created_at: string;
}

interface SelectedWorld {
  stateProjection: CanonicalStateProjection;
  factRelationProjection: CanonicalFactRelationProjection;
  hotRaw: LedgerRawEvent[];
  currentInput: LedgerRawEvent;
  requiredRaw: LedgerRawEvent[];
  selectedState: Map<string, Set<ContextSnapshotInclusionReason>>;
  selectedFacts: Map<string, { fact: CommittedCanonicalFact; reasons: Set<ContextSnapshotInclusionReason> }>;
  selectedRelations: Map<string, {
    relation: CommittedCanonicalRelation;
    reasons: Set<ContextSnapshotInclusionReason>;
  }>;
  dependencyPaths: SnapshotDependencyPath[];
  currentSemantic: CurrentSemanticTakeoverAuthority;
}

interface AssemblyResult {
  workingContext: string;
  selectedHotRaw: LedgerRawEvent[];
  includedArtifact?: CompactionArtifact;
}

const SNAPSHOT_SELECT = `namespace, stream_id, snapshot_id, operation_id, attempt_id,
  request_fingerprint, request_json, manifest_hash, manifest_json,
  working_context_hash, working_context_text, created_at`;
const ATTEMPT_SELECT = `namespace, stream_id, attempt_id, operation_id, snapshot_id,
  snapshot_manifest_hash, created_at`;
const EMPTY_CANONICAL_STATE_HASH = sha256(canonicalJson({ schema_version: 1, items: [] }));

const SCHEMA_OBJECTS: ReadonlyArray<{
  type: "table" | "trigger";
  name: string;
  sql: string;
}> = [
  {
    type: "table",
    name: "cc_context_snapshot_schema",
    sql: `CREATE TABLE cc_context_snapshot_schema (
      version INTEGER PRIMARY KEY CHECK (version > 0),
      completed_at TEXT NOT NULL
    )`,
  },
  {
    type: "table",
    name: "cc_context_snapshots",
    sql: `CREATE TABLE cc_context_snapshots (
      namespace TEXT NOT NULL CHECK (length(namespace) > 0 AND length(namespace) <= 500),
      stream_id TEXT NOT NULL CHECK (length(stream_id) > 0 AND length(stream_id) <= 500),
      snapshot_id TEXT NOT NULL CHECK (length(snapshot_id) > 0 AND length(snapshot_id) <= 500),
      operation_id TEXT NOT NULL CHECK (length(operation_id) > 0 AND length(operation_id) <= 500),
      attempt_id TEXT NOT NULL CHECK (length(attempt_id) > 0 AND length(attempt_id) <= 500),
      request_fingerprint TEXT NOT NULL CHECK (
        length(request_fingerprint) = 64 AND request_fingerprint NOT GLOB '*[^0-9a-f]*'
      ),
      request_json TEXT NOT NULL CHECK (json_valid(request_json)),
      manifest_hash TEXT NOT NULL CHECK (
        length(manifest_hash) = 64 AND manifest_hash NOT GLOB '*[^0-9a-f]*'
      ),
      manifest_json TEXT NOT NULL CHECK (json_valid(manifest_json)),
      working_context_hash TEXT NOT NULL CHECK (
        length(working_context_hash) = 64 AND working_context_hash NOT GLOB '*[^0-9a-f]*'
      ),
      working_context_text TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (namespace, stream_id, snapshot_id),
      UNIQUE (namespace, stream_id, attempt_id),
      FOREIGN KEY (namespace, stream_id)
        REFERENCES cc_revision_streams(namespace, stream_id)
    )`,
  },
  {
    type: "table",
    name: "cc_context_attempt_starts",
    sql: `CREATE TABLE cc_context_attempt_starts (
      namespace TEXT NOT NULL CHECK (length(namespace) > 0 AND length(namespace) <= 500),
      stream_id TEXT NOT NULL CHECK (length(stream_id) > 0 AND length(stream_id) <= 500),
      attempt_id TEXT NOT NULL CHECK (length(attempt_id) > 0 AND length(attempt_id) <= 500),
      operation_id TEXT NOT NULL CHECK (length(operation_id) > 0 AND length(operation_id) <= 500),
      snapshot_id TEXT NOT NULL CHECK (length(snapshot_id) > 0 AND length(snapshot_id) <= 500),
      snapshot_manifest_hash TEXT NOT NULL CHECK (
        length(snapshot_manifest_hash) = 64 AND
        snapshot_manifest_hash NOT GLOB '*[^0-9a-f]*'
      ),
      created_at TEXT NOT NULL,
      PRIMARY KEY (namespace, stream_id, attempt_id),
      UNIQUE (namespace, stream_id, snapshot_id),
      FOREIGN KEY (namespace, stream_id, snapshot_id)
        REFERENCES cc_context_snapshots(namespace, stream_id, snapshot_id)
        DEFERRABLE INITIALLY DEFERRED
    )`,
  },
  ...[
    ["cc_context_snapshot_schema_no_update", "cc_context_snapshot_schema", "UPDATE",
      "context snapshot schema markers are immutable"],
    ["cc_context_snapshot_schema_no_delete", "cc_context_snapshot_schema", "DELETE",
      "context snapshot schema markers are append-only"],
    ["cc_context_snapshots_no_update", "cc_context_snapshots", "UPDATE",
      "context snapshots are immutable"],
    ["cc_context_snapshots_no_delete", "cc_context_snapshots", "DELETE",
      "context snapshots are append-only"],
    ["cc_context_attempt_starts_no_update", "cc_context_attempt_starts", "UPDATE",
      "context attempt starts are immutable"],
    ["cc_context_attempt_starts_no_delete", "cc_context_attempt_starts", "DELETE",
      "context attempt starts are append-only"],
  ].map(([name, table, operation, message]) => ({
    type: "trigger" as const,
    name: name!,
    sql: `CREATE TRIGGER ${name} BEFORE ${operation} ON ${table}
      BEGIN SELECT RAISE(ABORT, '${message}'); END`,
  })),
];

/** @internal Core-owned immutable Snapshot and Attempt freeze boundary. */
export class SqliteContextSnapshotStore {
  readonly #database: DatabaseSync;
  #closed = false;
  #transactionOpen = false;

  constructor(databasePath: string) {
    if (typeof databasePath !== "string" || databasePath.length === 0) invalid();
    let database: DatabaseSync | undefined;
    try {
      if (databasePath !== ":memory:") mkdirSync(dirname(databasePath), { recursive: true });
      database = new DatabaseSync(databasePath);
      initializeSqliteConnection(database, databasePath, () => migrateContextSnapshot(database!));
      this.#database = database;
    } catch (error) {
      try { database?.close(); } catch { /* preserve stable constructor failure */ }
      if (error instanceof ContextSnapshotError && error.code === "CORRUPT_DATA") throw error;
      throw new ContextSnapshotError("STORAGE_FAILURE");
    }
  }

  freeze(input: ContextSnapshotFreezeInput): ContextSnapshot {
    this.#assertOpen();
    const normalized = normalizeFreezeInput(input);
    if (this.#transactionOpen) conflict();
    try {
      this.#database.exec("BEGIN IMMEDIATE;");
      this.#transactionOpen = true;
      const existingSnapshot = this.#readSnapshotRow(normalized.scope, normalized.snapshot_id);
      const existingAttempt = this.#readAttemptRow(normalized.scope, normalized.attempt_id);
      if (existingSnapshot !== undefined || existingAttempt !== undefined) {
        if (existingSnapshot !== undefined &&
            existingSnapshot.attempt_id !== normalized.attempt_id) conflict();
        if (existingAttempt !== undefined &&
            existingAttempt.snapshot_id !== normalized.snapshot_id) conflict();
        if (existingSnapshot === undefined || existingAttempt === undefined) corrupt();
        if (existingSnapshot.request_json !== normalized.requestJson ||
            existingSnapshot.request_fingerprint !== normalized.requestFingerprint ||
            existingAttempt.operation_id !== normalized.operation_id) conflict();
        const replay = this.#readSnapshotInsideTransaction(
          normalized.scope,
          normalized.snapshot_id
        );
        this.#database.exec("COMMIT;");
        this.#transactionOpen = false;
        return replay;
      }

      const observed = readVector(this.#database, normalized.scope, "CONFLICT");
      if (!sameVector(observed, normalized.expected_revision_vector)) conflict();
      const stateProjection = readCanonicalStateProjectionInsideCore(
        this.#database,
        normalized.scope,
        observed
      );
      const factRelationProjection = readCanonicalFactRelationProjectionInsideCore(
        this.#database,
        normalized.scope,
        observed
      );
      const hotProjection = readLedgerHotRawInsideCore(
        this.#database,
        normalized.scope,
        observed
      );
      const currentSemantic = readCurrentSemanticTakeoverInsideCore(
        this.#database,
        normalized.scope
      );
      if (!sameVector(currentSemantic.revision_vector, observed)) corrupt();

      const currentInput = hotProjection.events.find(
        (event) => event.event_id === normalized.current_input_event_id
      );
      if (currentInput === undefined || currentInput.source_kind !== "user_input") conflict();
      const requiredRaw = readLedgerRawEventsInsideCore(
        this.#database,
        normalized.scope,
        normalized.required_raw_event_ids,
        observed.ledger_revision
      );
      const selected = selectWorld(
        this.#database,
        normalized,
        stateProjection,
        factRelationProjection,
        hotProjection.events,
        currentInput,
        requiredRaw,
        currentSemantic,
        observed
      );
      const assembly = assembleWorld(selected, normalized.hard_token_capacity);
      if (!sameVector(readVector(this.#database, normalized.scope, "CORRUPT_DATA"), observed)) {
        corrupt();
      }
      const createdAt = new Date().toISOString();
      const manifest = buildManifest(normalized, selected, assembly, observed, createdAt);
      const manifestJson = canonicalJson(manifestAsJson(manifest));
      const manifestHash = sha256(manifestJson);
      const workingContextHash = sha256(assembly.workingContext);
      if (manifest.working_context_hash !== workingContextHash) corrupt();

      this.#database.prepare(
        `INSERT INTO cc_context_snapshots (
           namespace, stream_id, snapshot_id, operation_id, attempt_id,
           request_fingerprint, request_json, manifest_hash, manifest_json,
           working_context_hash, working_context_text, created_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        normalized.scope.namespace,
        normalized.scope.stream_id,
        normalized.snapshot_id,
        normalized.operation_id,
        normalized.attempt_id,
        normalized.requestFingerprint,
        normalized.requestJson,
        manifestHash,
        manifestJson,
        workingContextHash,
        assembly.workingContext,
        createdAt
      );
      this.#database.prepare(
        `INSERT INTO cc_context_attempt_starts (
           namespace, stream_id, attempt_id, operation_id, snapshot_id,
           snapshot_manifest_hash, created_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).run(
        normalized.scope.namespace,
        normalized.scope.stream_id,
        normalized.attempt_id,
        normalized.operation_id,
        normalized.snapshot_id,
        manifestHash,
        createdAt
      );
      const result = this.#readSnapshotInsideTransaction(
        normalized.scope,
        normalized.snapshot_id
      );
      this.#database.exec("COMMIT;");
      this.#transactionOpen = false;
      return result;
    } catch (error) {
      rollback(this.#database);
      throw mapSnapshotError(error);
    } finally {
      this.#transactionOpen = false;
    }
  }

  read(scopeValue: RevisionScope, snapshotIdValue: string): ContextSnapshot {
    this.#assertOpen();
    const scope = normalizeScope(scopeValue);
    const snapshotId = validateIdentifier(snapshotIdValue);
    if (this.#transactionOpen) conflict();
    try {
      this.#database.exec("BEGIN;");
      this.#transactionOpen = true;
      const result = this.#readSnapshotInsideTransaction(scope, snapshotId);
      this.#database.exec("COMMIT;");
      return result;
    } catch (error) {
      rollback(this.#database);
      throw mapSnapshotError(error);
    } finally {
      this.#transactionOpen = false;
    }
  }

  readAttempt(scopeValue: RevisionScope, attemptIdValue: string): ContextAttemptStarted {
    this.#assertOpen();
    const scope = normalizeScope(scopeValue);
    const attemptId = validateIdentifier(attemptIdValue);
    if (this.#transactionOpen) conflict();
    try {
      this.#database.exec("BEGIN;");
      this.#transactionOpen = true;
      const row = this.#readAttemptRow(scope, attemptId);
      if (row === undefined) notFound();
      const snapshot = this.#readSnapshotInsideTransaction(scope, storedIdentifier(row.snapshot_id));
      if (row.attempt_id !== snapshot.attempt_started.attempt_id ||
          row.operation_id !== snapshot.attempt_started.operation_id ||
          row.snapshot_id !== snapshot.attempt_started.snapshot_id ||
          row.snapshot_manifest_hash !== snapshot.attempt_started.snapshot_manifest_hash ||
          row.created_at !== snapshot.attempt_started.created_at) corrupt();
      this.#database.exec("COMMIT;");
      return cloneAttempt(snapshot.attempt_started);
    } catch (error) {
      rollback(this.#database);
      throw mapSnapshotError(error);
    } finally {
      this.#transactionOpen = false;
    }
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

  #readSnapshotInsideTransaction(scope: RevisionScope, snapshotId: string): ContextSnapshot {
    validateSchema(this.#database);
    assertCurrentSchemaVersion(this.#database);
    const row = this.#readSnapshotRow(scope, snapshotId);
    if (row === undefined) notFound();
    const normalized = parseStoredRequest(row.request_json);
    if (!sameScope(normalized.scope, scope) || normalized.snapshot_id !== snapshotId ||
        storedHash(row.request_fingerprint) !== sha256(row.request_json) ||
        row.request_json !== normalized.requestJson) corrupt();
    const manifest = parseStoredManifest(row.manifest_json);
    const manifestJson = canonicalJson(manifestAsJson(manifest));
    const manifestHash = storedHash(row.manifest_hash);
    const bodyHash = storedHash(row.working_context_hash);
    if (row.manifest_json !== manifestJson || manifestHash !== sha256(manifestJson) ||
        bodyHash !== sha256(storedString(row.working_context_text)) ||
        manifest.working_context_hash !== bodyHash ||
        manifest.working_context_estimated_tokens !== estimateTokens(row.working_context_text) ||
        manifest.working_context_estimated_tokens > manifest.hard_token_capacity ||
        row.namespace !== scope.namespace || row.stream_id !== scope.stream_id ||
        row.snapshot_id !== manifest.snapshot_id || row.operation_id !== manifest.operation_id ||
        row.attempt_id !== manifest.attempt_id || row.created_at !== manifest.created_at) corrupt();
    assertManifestRequestBinding(manifest, normalized);

    const attemptRow = this.#readAttemptRow(scope, manifest.attempt_id);
    if (attemptRow === undefined || attemptRow.operation_id !== manifest.operation_id ||
        attemptRow.snapshot_id !== manifest.snapshot_id ||
        storedHash(attemptRow.snapshot_manifest_hash) !== manifestHash ||
        attemptRow.created_at !== manifest.created_at) corrupt();
    const attempt: ContextAttemptStarted = {
      schema_version: 1,
      ...scope,
      operation_id: storedIdentifier(attemptRow.operation_id),
      attempt_id: storedIdentifier(attemptRow.attempt_id),
      snapshot_id: storedIdentifier(attemptRow.snapshot_id),
      snapshot_manifest_hash: storedHash(attemptRow.snapshot_manifest_hash),
      created_at: storedTimestamp(attemptRow.created_at),
    };
    try {
      validateManifestAuthority(
        this.#database,
        manifest,
        normalized,
        storedString(row.working_context_text)
      );
    } catch (error) {
      rethrowStoredAuthorityError(error);
    }
    return {
      manifest_hash: manifestHash,
      manifest: cloneManifest(manifest),
      working_context: row.working_context_text,
      attempt_started: attempt,
    };
  }

  #readSnapshotRow(scope: RevisionScope, snapshotId: string): SnapshotRow | undefined {
    return this.#database.prepare(
      `SELECT ${SNAPSHOT_SELECT} FROM cc_context_snapshots
       WHERE namespace = ? AND stream_id = ? AND snapshot_id = ?`
    ).get(scope.namespace, scope.stream_id, snapshotId) as SnapshotRow | undefined;
  }

  #readAttemptRow(scope: RevisionScope, attemptId: string): AttemptRow | undefined {
    return this.#database.prepare(
      `SELECT ${ATTEMPT_SELECT} FROM cc_context_attempt_starts
       WHERE namespace = ? AND stream_id = ? AND attempt_id = ?`
    ).get(scope.namespace, scope.stream_id, attemptId) as AttemptRow | undefined;
  }

  #assertOpen(): void {
    if (this.#closed) throw new ContextSnapshotError("CLOSED");
  }
}

function selectWorld(
  database: DatabaseSync,
  input: NormalizedFreezeInput,
  stateProjection: CanonicalStateProjection,
  factRelationProjection: CanonicalFactRelationProjection,
  hotRaw: LedgerRawEvent[],
  currentInput: LedgerRawEvent,
  requiredRaw: LedgerRawEvent[],
  currentSemantic: CurrentSemanticTakeoverAuthority,
  observed: RevisionVector
): SelectedWorld {
  const items = new Map(stateProjection.state.items.map((item) => [item.item_id, item]));
  const currentFacts = new Map(factRelationProjection.facts.map((fact) => [fact.fact_id, fact]));
  const currentRelations = new Map(
    factRelationProjection.relations.map((relation) => [relation.relation_id, relation])
  );
  const selectedState = new Map<string, Set<ContextSnapshotInclusionReason>>();
  const selectedFacts = new Map<string, {
    fact: CommittedCanonicalFact;
    reasons: Set<ContextSnapshotInclusionReason>;
  }>();
  const selectedRelations = new Map<string, {
    relation: CommittedCanonicalRelation;
    reasons: Set<ContextSnapshotInclusionReason>;
  }>();

  for (const item of stateProjection.state.items) {
    if (!isCurrentItem(item)) continue;
    addReason(selectedState, item.item_id, "CURRENT_AUTHORITY");
    if (item.kind === "CONSTRAINT") addReason(selectedState, item.item_id, "HARD_CONSTRAINT");
  }
  for (const itemId of input.required_state_item_ids) {
    if (!items.has(itemId)) conflict();
    addReason(selectedState, itemId, "EXPLICIT_REQUIRED");
  }

  const requiredAuthority = readCanonicalFactRelationAuthorityInsideCore(
    database,
    input.scope,
    input.required_fact_refs,
    input.required_relation_refs,
    observed
  );
  for (const fact of requiredAuthority.facts) addFact(selectedFacts, fact, "EXPLICIT_REQUIRED");
  for (const relation of requiredAuthority.relations) {
    addRelation(selectedRelations, relation, "EXPLICIT_REQUIRED");
  }

  const roots: CanonicalRelationEndpoint[] = [
    ...[...selectedState.keys()].map((id) => ({ type: "STATE_ITEM" as const, id })),
    ...requiredAuthority.facts.map((fact) => ({ type: "FACT" as const, id: fact.fact_id })),
  ];
  for (const relation of requiredAuthority.relations) {
    roots.push({ ...relation.source }, { ...relation.target });
    includeEndpoint(relation.source, items, currentFacts, selectedState, selectedFacts,
      "EXPLICIT_REQUIRED");
    includeEndpoint(relation.target, items, currentFacts, selectedState, selectedFacts,
      "EXPLICIT_REQUIRED");
  }

  const adjacency = new Map<string, CommittedCanonicalRelation[]>();
  for (const relation of currentRelations.values()) {
    if (relation.status !== "active" || relation.relation_type !== "DEPENDS_ON") continue;
    const key = endpointKey(relation.source);
    const values = adjacency.get(key) ?? [];
    values.push(relation);
    adjacency.set(key, values);
  }
  for (const values of adjacency.values()) values.sort(compareRelationsForClosure);
  const queue = uniqueEndpoints(roots).map((root) => ({
    endpoint: root,
    root,
    relationIds: [] as string[],
  }));
  const visited = new Set(queue.map(({ endpoint }) => endpointKey(endpoint)));
  const dependencyPaths: SnapshotDependencyPath[] = [];
  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index]!;
    for (const relation of adjacency.get(endpointKey(current.endpoint)) ?? []) {
      const target = relation.target;
      const key = endpointKey(target);
      addRelation(selectedRelations, relation, "DEPENDENCY_CLOSURE");
      const relationIds = [...current.relationIds, relation.relation_id];
      dependencyPaths.push({
        root: { ...current.root },
        target: { ...target },
        relation_ids: relationIds,
      });
      if (visited.has(key)) continue;
      visited.add(key);
      includeEndpoint(target, items, currentFacts, selectedState, selectedFacts,
        "DEPENDENCY_CLOSURE");
      queue.push({ endpoint: { ...target }, root: { ...current.root }, relationIds });
    }
  }
  dependencyPaths.sort(compareDependencyPaths);

  return {
    stateProjection,
    factRelationProjection,
    hotRaw,
    currentInput,
    requiredRaw,
    selectedState,
    selectedFacts,
    selectedRelations,
    dependencyPaths,
    currentSemantic,
  };
}

function assembleWorld(world: SelectedWorld, capacity: number): AssemblyResult {
  const mandatory = renderWorkingContext(world, [], undefined);
  if (estimateTokens(mandatory) > capacity) budgetInsufficient();
  const requiredIds = new Set(world.requiredRaw.map((event) => event.event_id));
  requiredIds.add(world.currentInput.event_id);
  const candidates = world.hotRaw.filter((event) => !requiredIds.has(event.event_id));
  let selected: LedgerRawEvent[] = [];
  for (let index = candidates.length - 1; index >= 0; index -= 1) {
    const candidate = [candidates[index]!, ...selected];
    const rendered = renderWorkingContext(world, candidate, undefined);
    if (estimateTokens(rendered) > capacity) break;
    selected = candidate;
  }
  let workingContext = renderWorkingContext(world, selected, undefined);
  let includedArtifact: CompactionArtifact | undefined;
  if (world.currentSemantic.artifact !== undefined) {
    const withArtifact = renderWorkingContext(world, selected, world.currentSemantic.artifact);
    if (estimateTokens(withArtifact) <= capacity) {
      workingContext = withArtifact;
      includedArtifact = world.currentSemantic.artifact;
    }
  }
  if (estimateTokens(workingContext) > capacity) corrupt();
  return { workingContext, selectedHotRaw: selected, includedArtifact };
}

function renderWorkingContext(
  world: SelectedWorld,
  selectedHotRaw: LedgerRawEvent[],
  artifact: CompactionArtifact | undefined
): string {
  const stateItems = new Map(world.stateProjection.state.items.map((item) => [item.item_id, item]));
  const selectedItems = [...world.selectedState.keys()].map((id) => stateItems.get(id)!).filter(Boolean);
  const roots = (kind: CanonicalStateItem["kind"], status: CanonicalStateItem["status"]) =>
    selectedItems.filter((item) => item.kind === kind && item.status === status).sort(compareStateItems);
  const rootIds = new Set([
    ...roots("CONSTRAINT", "ACTIVE"),
    ...roots("GOAL", "ACTIVE"),
    ...roots("DECISION", "ACTIVE"),
    ...roots("OPEN_QUESTION", "OPEN"),
  ].map((item) => item.item_id));
  const dependencyState = selectedItems.filter((item) => !rootIds.has(item.item_id))
    .sort(compareStateItems);
  const requiredIds = new Set(world.requiredRaw.map((event) => event.event_id));
  requiredIds.add(world.currentInput.event_id);
  const requiredRaw = world.requiredRaw.filter((event) => event.event_id !== world.currentInput.event_id);
  const hot = selectedHotRaw.filter((event) => !requiredIds.has(event.event_id));
  const sections = [
    renderRawSection("Current Input", [world.currentInput]),
    renderStateSection("Active Constraints", roots("CONSTRAINT", "ACTIVE")),
    renderStateSection("Active Goals", roots("GOAL", "ACTIVE")),
    renderStateSection("Active Decisions", roots("DECISION", "ACTIVE")),
    renderStateSection("Open Questions", roots("OPEN_QUESTION", "OPEN")),
    renderStateSection("Required and Dependency State", dependencyState),
    renderFactSection([...world.selectedFacts.values()].map(({ fact }) => fact)),
    renderRelationSection([...world.selectedRelations.values()].map(({ relation }) => relation)),
    renderRawSection("Required Raw Evidence", requiredRaw),
    renderRawSection("Hot Raw", hot),
    renderArtifactSection(artifact),
  ];
  return sections.join("\n\n");
}

function renderStateSection(title: string, items: CanonicalStateItem[]): string {
  const body = items.length === 0 ? "[none]" : items.sort(compareStateItems)
    .map((item) => `- [${item.item_id}] (${item.kind}/${item.status}) ${item.content}`)
    .join("\n");
  return `## ${title}\n${body}`;
}

function renderFactSection(facts: CommittedCanonicalFact[]): string {
  const body = facts.length === 0 ? "[none]" : facts.sort(compareFacts)
    .map((fact) => `- [${fact.fact_id}@${fact.fact_revision}] ` +
      `(${fact.verification_status}/${fact.lifecycle_status}/${fact.record_status}) ${fact.statement}`)
    .join("\n");
  return `## Required Facts\n${body}`;
}

function renderRelationSection(relations: CommittedCanonicalRelation[]): string {
  const body = relations.length === 0 ? "[none]" : relations.sort(compareRelations)
    .map((relation) => `- [${relation.relation_id}@${relation.relation_revision}] ` +
      `${endpointKey(relation.source)} -${relation.relation_type}-> ${endpointKey(relation.target)} ` +
      `(${relation.status})`)
    .join("\n");
  return `## Dependency Relations\n${body}`;
}

function renderRawSection(title: string, events: LedgerRawEvent[]): string {
  const body = events.length === 0 ? "[none]" : [...events].sort(compareRawEvents)
    .map((event) => `- [ledger:${event.ledger_revision} ${event.event_id} ` +
      `${event.source_kind}/${event.source_id}] ${canonicalRawJson(event.payload)}`)
    .join("\n");
  return `## ${title}\n${body}`;
}

function renderArtifactSection(artifact: CompactionArtifact | undefined): string {
  const body = artifact === undefined ? "[none]" :
    `- [${artifact.artifact_id} ${artifact.artifact_hash}] ${canonicalJson(artifact.body)}`;
  return `## Compaction Artifact\n${body}`;
}

function buildManifest(
  input: NormalizedFreezeInput,
  world: SelectedWorld,
  assembly: AssemblyResult,
  observed: RevisionVector,
  createdAt: string
): ContextSnapshotManifest {
  const stateItems = new Map(world.stateProjection.state.items.map((item) => [item.item_id, item]));
  const selectedStateRefs = [...world.selectedState.entries()].sort(([left], [right]) =>
    compareText(left, right)).map(([id, reasons]) => {
      const item = stateItems.get(id);
      if (item === undefined) corrupt();
      return {
        item_id: id,
        kind: item.kind,
        status: item.status,
        inclusion_reasons: sortedReasons(reasons),
      };
    });
  const selectedIds = new Set(selectedStateRefs.map(({ item_id }) => item_id));
  const excludedStateRefs = world.stateProjection.state.items.filter((item) =>
    !selectedIds.has(item.item_id)).sort(compareStateItems).map((item) => ({
      item_id: item.item_id,
      kind: item.kind,
      status: item.status,
      exclusion_reason: "DEFAULT_NOT_CURRENT" as const,
    }));
  const selectedFactRefs = [...world.selectedFacts.values()].sort(({ fact: left }, { fact: right }) =>
    compareFacts(left, right)).map(({ fact, reasons }) => ({
      fact_id: fact.fact_id,
      fact_revision: fact.fact_revision,
      fact_hash: fact.fact_hash,
      inclusion_reasons: sortedReasons(reasons),
    }));
  const selectedRelationRefs = [...world.selectedRelations.values()]
    .sort(({ relation: left }, { relation: right }) => compareRelations(left, right))
    .map(({ relation, reasons }) => ({
      relation_id: relation.relation_id,
      relation_revision: relation.relation_revision,
      relation_hash: relation.relation_hash,
      inclusion_reasons: sortedReasons(reasons),
    }));
  const hotSelectedIds = new Set([
    world.currentInput.event_id,
    ...assembly.selectedHotRaw.map((event) => event.event_id),
    ...world.requiredRaw.filter((event) =>
      event.ledger_revision > observed.frontier_position).map((event) => event.event_id),
  ]);
  const selectedHotEvents = world.hotRaw.filter((event) => hotSelectedIds.has(event.event_id));
  const requiredIds = new Set(input.required_raw_event_ids);
  const hotRawEventRefs = selectedHotEvents.map((event) => ({
    ledger_revision: event.ledger_revision,
    event_id: event.event_id,
    inclusion_reasons: sortedReasons(new Set<ContextSnapshotInclusionReason>([
      ...(event.event_id === world.currentInput.event_id ? ["CURRENT_INPUT" as const] : []),
      ...(requiredIds.has(event.event_id) ? ["EXPLICIT_REQUIRED" as const] : []),
      ...(assembly.selectedHotRaw.some(({ event_id }) => event_id === event.event_id)
        ? ["HOT_RAW_SUFFIX" as const] : []),
    ])),
  }));
  const requiredRawEventRefs = world.requiredRaw.map((event) => ({
    ledger_revision: event.ledger_revision,
    event_id: event.event_id,
    inclusion_reasons: ["EXPLICIT_REQUIRED" as const],
  }));
  const takeover = world.currentSemantic.takeover;
  const artifact = world.currentSemantic.artifact;
  const includedArtifact = assembly.includedArtifact !== undefined;
  const configHash = sha256(canonicalJson({
    hard_token_capacity: input.hard_token_capacity,
    token_estimator: TOKEN_ESTIMATOR_VERSION,
  }));
  return {
    schema_version: 1,
    ...input.scope,
    snapshot_id: input.snapshot_id,
    operation_id: input.operation_id,
    attempt_id: input.attempt_id,
    ledger_as_of_revision: observed.ledger_revision,
    state_revision: observed.state_revision,
    raw_frontier_revision: observed.raw_frontier_revision,
    frontier_position: observed.frontier_position,
    takeover_commit_revision: observed.takeover_commit_revision,
    state_hash: world.stateProjection.state_hash,
    state_policy_hash: world.stateProjection.policy_hash,
    fact_relation_policy_hash: world.factRelationProjection.policy_hash,
    selected_state_refs: selectedStateRefs,
    excluded_state_refs: excludedStateRefs,
    selected_fact_refs: selectedFactRefs,
    selected_relation_refs: selectedRelationRefs,
    dependency_paths: world.dependencyPaths.map(cloneDependencyPath),
    hot_raw_event_refs: hotRawEventRefs,
    hot_raw_hash: sha256(canonicalRawJson(selectedHotEvents.map(rawEventAsJson))),
    required_raw_event_refs: requiredRawEventRefs,
    current_takeover_ref: takeover === undefined ? null : {
      takeover_commit_id: takeover.takeover_commit_id,
      takeover_commit_revision: takeover.current_revision_vector.takeover_commit_revision,
      artifact_id: takeover.artifact_id,
      artifact_hash: takeover.artifact_hash,
    },
    current_artifact_ref: artifact === undefined ? null : {
      artifact_id: artifact.artifact_id,
      artifact_hash: artifact.artifact_hash,
      included_in_working_context: includedArtifact,
      inclusion_reasons: includedArtifact ? ["CURRENT_TAKEOVER_ARTIFACT"] : [],
    },
    evidence_bundle_id: null,
    evidence_event_refs: [],
    evidence_relation_paths: [],
    policy_hash: CONTEXT_SNAPSHOT_POLICY_HASH,
    config_hash: configHash,
    projection_version: CURRENT_AUTHORITY_PROJECTION_VERSION,
    assembler_version_hash: CONTEXT_ASSEMBLER_VERSION_HASH,
    current_input_event_id: world.currentInput.event_id,
    current_input_hash: sha256(canonicalRawJson(rawEventAsJson(world.currentInput))),
    host_manifest_digest: input.host_manifest_digest,
    external_content_hashes: input.external_content_hashes.map((entry) => ({ ...entry })),
    working_context_hash: sha256(assembly.workingContext),
    working_context_estimated_tokens: estimateTokens(assembly.workingContext),
    hard_token_capacity: input.hard_token_capacity,
    created_at: createdAt,
  };
}

function validateManifestAuthority(
  database: DatabaseSync,
  manifest: ContextSnapshotManifest,
  input: NormalizedFreezeInput,
  workingContext: string
): void {
  const scope = { namespace: manifest.namespace, stream_id: manifest.stream_id };
  const frozen = manifestVector(manifest);
  const live = readVector(database, scope, "CORRUPT_DATA");
  if (!vectorAtOrAfter(live, frozen)) corrupt();

  let stateProjection: CanonicalStateProjection;
  if (manifest.state_revision === 0) {
    if (manifest.state_hash !== EMPTY_CANONICAL_STATE_HASH ||
        manifest.state_policy_hash !== CANONICAL_STATE_POLICY_HASH ||
        manifest.selected_state_refs.length !== 0 || manifest.excluded_state_refs.length !== 0) {
      corrupt();
    }
    stateProjection = {
      ...scope,
      revision_vector: frozen,
      state_revision: 0,
      state: { schema_version: 1, items: [] },
      state_hash: manifest.state_hash,
      policy_hash: manifest.state_policy_hash,
      provenance_event_ids: [],
    };
  } else {
    const authority = readCanonicalStateAuthorityInsideCore(
      database,
      scope,
      manifest.state_revision,
      frozen
    );
    if (authority.committed.state_hash !== manifest.state_hash ||
        authority.committed.policy_hash !== manifest.state_policy_hash) corrupt();
    stateProjection = {
      ...scope,
      revision_vector: frozen,
      state_revision: manifest.state_revision,
      state: authority.committed.state,
      state_hash: authority.committed.state_hash,
      policy_hash: authority.committed.policy_hash,
      provenance_event_ids: authority.committed.provenance_event_ids,
      commit: {
        state_commit_id: authority.committed.state_commit_id,
        commit_mode: authority.committed.commit_mode,
        previous_state_revision: authority.committed.previous_state_revision,
        created_at: authority.committed.created_at,
      },
    };
  }
  validateStateRefs(manifest, stateProjection, input);

  const historicalHotRaw = readLedgerHotRawInsideCore(database, scope, frozen).events;

  const allRawIds = [...new Set([
    manifest.current_input_event_id,
    ...manifest.hot_raw_event_refs.map(({ event_id }) => event_id),
    ...manifest.required_raw_event_refs.map(({ event_id }) => event_id),
  ])].sort(compareText);
  const rawEvents = readLedgerRawEventsInsideCore(
    database,
    scope,
    allRawIds,
    manifest.ledger_as_of_revision
  );
  const rawById = new Map(rawEvents.map((event) => [event.event_id, event]));
  const currentInput = rawById.get(manifest.current_input_event_id);
  if (currentInput === undefined || currentInput.source_kind !== "user_input" ||
      currentInput.ledger_revision <= manifest.frontier_position ||
      currentInput.ledger_revision > manifest.ledger_as_of_revision ||
      sha256(canonicalRawJson(rawEventAsJson(currentInput))) !== manifest.current_input_hash) corrupt();
  for (const ref of [...manifest.hot_raw_event_refs, ...manifest.required_raw_event_refs]) {
    const event = rawById.get(ref.event_id);
    if (event === undefined || event.ledger_revision !== ref.ledger_revision) corrupt();
  }
  const hotEvents = manifest.hot_raw_event_refs.map((ref) => rawById.get(ref.event_id)!);
  if (sha256(canonicalRawJson(hotEvents.map(rawEventAsJson))) !== manifest.hot_raw_hash) corrupt();
  assertRawRefPolicy(manifest, input, historicalHotRaw);

  const authority = readCanonicalFactRelationAuthorityInsideCore(
    database,
    scope,
    manifest.selected_fact_refs.map(({ fact_id, fact_revision }) => ({ fact_id, fact_revision })),
    manifest.selected_relation_refs.map(({ relation_id, relation_revision }) => ({
      relation_id,
      relation_revision,
    })),
    frozen
  );
  if (manifest.fact_relation_policy_hash !== CANONICAL_FACT_RELATION_POLICY_HASH) corrupt();
  for (const ref of manifest.selected_fact_refs) {
    const fact = authority.facts.find((candidate) => candidate.fact_id === ref.fact_id &&
      candidate.fact_revision === ref.fact_revision);
    if (fact?.fact_hash !== ref.fact_hash) corrupt();
  }
  for (const ref of manifest.selected_relation_refs) {
    const relation = authority.relations.find((candidate) =>
      candidate.relation_id === ref.relation_id &&
      candidate.relation_revision === ref.relation_revision);
    if (relation?.relation_hash !== ref.relation_hash) corrupt();
  }

  let currentSemantic: CurrentSemanticTakeoverAuthority;
  if (manifest.current_takeover_ref === null) {
    if (manifest.takeover_commit_revision !== 0 || manifest.current_artifact_ref !== null) corrupt();
    currentSemantic = { ...scope, revision_vector: frozen };
  } else {
    const takeover = readSemanticTakeoverInsideCore(
      database,
      scope,
      manifest.current_takeover_ref.takeover_commit_id
    );
    if (takeover.current_revision_vector.takeover_commit_revision !==
        manifest.current_takeover_ref.takeover_commit_revision ||
        takeover.artifact_id !== manifest.current_takeover_ref.artifact_id ||
        takeover.artifact_hash !== manifest.current_takeover_ref.artifact_hash ||
        manifest.takeover_commit_revision !==
          manifest.current_takeover_ref.takeover_commit_revision) corrupt();
    if (takeover.current_revision_vector.raw_frontier_revision !==
          manifest.raw_frontier_revision ||
        takeover.current_revision_vector.frontier_position !== manifest.frontier_position ||
        !vectorAtOrAfter(frozen, takeover.current_revision_vector)) corrupt();
    const artifact = readCompactionArtifactInsideCore(
      database,
      scope,
      manifest.current_takeover_ref.artifact_id
    );
    if (manifest.current_artifact_ref === null ||
        artifact.artifact_hash !== manifest.current_artifact_ref.artifact_hash ||
        artifact.artifact_id !== manifest.current_artifact_ref.artifact_id) corrupt();
    currentSemantic = { ...scope, revision_vector: frozen, takeover, artifact };
  }
  if (manifest.policy_hash !== CONTEXT_SNAPSHOT_POLICY_HASH ||
      manifest.projection_version !== CURRENT_AUTHORITY_PROJECTION_VERSION ||
      manifest.assembler_version_hash !== CONTEXT_ASSEMBLER_VERSION_HASH ||
      manifest.config_hash !== sha256(canonicalJson({
        hard_token_capacity: input.hard_token_capacity,
        token_estimator: TOKEN_ESTIMATOR_VERSION,
      }))) corrupt();

  const requiredRaw = manifest.required_raw_event_refs.map((ref) => rawById.get(ref.event_id)!);
  const world = selectWorld(
    database,
    input,
    stateProjection,
    {
      ...scope,
      revision_vector: frozen,
      policy_hash: manifest.fact_relation_policy_hash,
      facts: authority.facts,
      relations: authority.relations,
    },
    historicalHotRaw,
    currentInput,
    requiredRaw,
    currentSemantic,
    frozen
  );
  const rebuilt = assembleWorld(world, manifest.hard_token_capacity);
  const rebuiltManifest = buildManifest(
    input,
    world,
    rebuilt,
    frozen,
    manifest.created_at
  );
  if (rebuilt.workingContext !== workingContext ||
      canonicalJson(manifestAsJson(rebuiltManifest)) !==
        canonicalJson(manifestAsJson(manifest))) corrupt();
}

function validateStateRefs(
  manifest: ContextSnapshotManifest,
  projection: CanonicalStateProjection,
  input: NormalizedFreezeInput
): void {
  const items = new Map(projection.state.items.map((item) => [item.item_id, item]));
  const ids = new Set<string>();
  for (const ref of manifest.selected_state_refs) {
    const item = items.get(ref.item_id);
    if (item === undefined || item.kind !== ref.kind || item.status !== ref.status ||
        ids.has(ref.item_id)) corrupt();
    ids.add(ref.item_id);
    validateReasons(ref.inclusion_reasons);
    if (isCurrentItem(item) !== ref.inclusion_reasons.includes("CURRENT_AUTHORITY") ||
        (item.kind === "CONSTRAINT" && item.status === "ACTIVE") !==
          ref.inclusion_reasons.includes("HARD_CONSTRAINT") ||
        (input.required_state_item_ids.includes(item.item_id) &&
          !ref.inclusion_reasons.includes("EXPLICIT_REQUIRED"))) corrupt();
  }
  for (const ref of manifest.excluded_state_refs) {
    const item = items.get(ref.item_id);
    if (item === undefined || item.kind !== ref.kind || item.status !== ref.status ||
        ref.exclusion_reason !== "DEFAULT_NOT_CURRENT" || ids.has(ref.item_id)) corrupt();
    ids.add(ref.item_id);
  }
  if (ids.size !== items.size) corrupt();
  assertStoredSorted(manifest.selected_state_refs.map(({ item_id }) => item_id));
  assertStoredSorted(manifest.excluded_state_refs.map(({ item_id }) => item_id));
  for (const item of projection.state.items) {
    if ((isCurrentItem(item) || input.required_state_item_ids.includes(item.item_id)) &&
        !manifest.selected_state_refs.some((ref) => ref.item_id === item.item_id)) corrupt();
  }
}

function assertRawRefPolicy(
  manifest: ContextSnapshotManifest,
  input: NormalizedFreezeInput,
  historicalHotRaw: LedgerRawEvent[]
): void {
  assertSortedUniqueRawRefs(manifest.hot_raw_event_refs);
  assertSortedUniqueRawRefs(manifest.required_raw_event_refs);
  const requiredIds = [...manifest.required_raw_event_refs.map(({ event_id }) => event_id)]
    .sort(compareText);
  if (canonicalJson(requiredIds) !== canonicalJson(input.required_raw_event_ids) ||
      manifest.required_raw_event_refs.some((ref) =>
        canonicalJson(ref.inclusion_reasons) !== canonicalJson(["EXPLICIT_REQUIRED"]))) corrupt();
  const hotById = new Map(historicalHotRaw.map((event) => [event.event_id, event]));
  const hotRefsById = new Map(manifest.hot_raw_event_refs.map((ref) => [ref.event_id, ref]));
  const currentRef = hotRefsById.get(manifest.current_input_event_id);
  if (currentRef === undefined || !currentRef.inclusion_reasons.includes("CURRENT_INPUT")) corrupt();
  const requiredSet = new Set(input.required_raw_event_ids);
  for (const ref of manifest.hot_raw_event_refs) {
    if (!hotById.has(ref.event_id) ||
        (ref.event_id === manifest.current_input_event_id) !==
          ref.inclusion_reasons.includes("CURRENT_INPUT") ||
        (requiredSet.has(ref.event_id) !== ref.inclusion_reasons.includes("EXPLICIT_REQUIRED"))) {
      corrupt();
    }
  }
}

function assertSortedUniqueRawRefs(refs: SnapshotRawEventRef[]): void {
  const ids = new Set<string>();
  let previousRevision = 0;
  for (const ref of refs) {
    validateReasons(ref.inclusion_reasons);
    if (ids.has(ref.event_id) || ref.ledger_revision <= previousRevision) corrupt();
    ids.add(ref.event_id);
    previousRevision = ref.ledger_revision;
  }
}

function assertManifestRequestBinding(
  manifest: ContextSnapshotManifest,
  input: NormalizedFreezeInput
): void {
  if (!sameScope(manifest, input.scope) || manifest.snapshot_id !== input.snapshot_id ||
      manifest.operation_id !== input.operation_id || manifest.attempt_id !== input.attempt_id ||
      manifest.current_input_event_id !== input.current_input_event_id ||
      manifest.host_manifest_digest !== input.host_manifest_digest ||
      manifest.hard_token_capacity !== input.hard_token_capacity ||
      canonicalJson(manifest.external_content_hashes) !==
        canonicalJson(input.external_content_hashes) ||
      !input.required_fact_refs.every((required) =>
        manifest.selected_fact_refs.some((ref) => ref.fact_id === required.fact_id &&
          ref.fact_revision === required.fact_revision &&
          ref.inclusion_reasons.includes("EXPLICIT_REQUIRED"))) ||
      !input.required_relation_refs.every((required) =>
        manifest.selected_relation_refs.some((ref) => ref.relation_id === required.relation_id &&
          ref.relation_revision === required.relation_revision &&
          ref.inclusion_reasons.includes("EXPLICIT_REQUIRED"))) ||
      !sameVector(manifestVector(manifest), input.expected_revision_vector) ||
      manifest.evidence_bundle_id !== null || manifest.evidence_event_refs.length !== 0 ||
      manifest.evidence_relation_paths.length !== 0) corrupt();
}

function parseManifest(value: JsonValue): ContextSnapshotManifest {
  const object = readExactObject(value, [
    "schema_version", "namespace", "stream_id", "snapshot_id", "operation_id", "attempt_id",
    "ledger_as_of_revision", "state_revision", "raw_frontier_revision", "frontier_position",
    "takeover_commit_revision", "state_hash", "state_policy_hash", "fact_relation_policy_hash",
    "selected_state_refs", "excluded_state_refs", "selected_fact_refs", "selected_relation_refs",
    "dependency_paths", "hot_raw_event_refs", "hot_raw_hash", "required_raw_event_refs",
    "current_takeover_ref", "current_artifact_ref", "evidence_bundle_id", "evidence_event_refs",
    "evidence_relation_paths", "policy_hash", "config_hash", "projection_version",
    "assembler_version_hash", "current_input_event_id", "current_input_hash",
    "host_manifest_digest", "external_content_hashes", "working_context_hash",
    "working_context_estimated_tokens", "hard_token_capacity", "created_at",
  ]);
  if (object.schema_version !== 1 || object.evidence_bundle_id !== null) corrupt();
  const scope = storedScope(object.namespace, object.stream_id);
  const manifest: ContextSnapshotManifest = {
    schema_version: 1,
    ...scope,
    snapshot_id: storedIdentifier(object.snapshot_id),
    operation_id: storedIdentifier(object.operation_id),
    attempt_id: storedIdentifier(object.attempt_id),
    ledger_as_of_revision: storedRevision(object.ledger_as_of_revision),
    state_revision: storedRevision(object.state_revision),
    raw_frontier_revision: storedRevision(object.raw_frontier_revision),
    frontier_position: storedRevision(object.frontier_position),
    takeover_commit_revision: storedRevision(object.takeover_commit_revision),
    state_hash: storedHash(object.state_hash),
    state_policy_hash: storedHash(object.state_policy_hash),
    fact_relation_policy_hash: storedHash(object.fact_relation_policy_hash),
    selected_state_refs: parseStateRefs(object.selected_state_refs),
    excluded_state_refs: parseExcludedStateRefs(object.excluded_state_refs),
    selected_fact_refs: parseFactRefs(object.selected_fact_refs),
    selected_relation_refs: parseRelationRefs(object.selected_relation_refs),
    dependency_paths: parseDependencyPaths(object.dependency_paths),
    hot_raw_event_refs: parseRawRefs(object.hot_raw_event_refs),
    hot_raw_hash: storedHash(object.hot_raw_hash),
    required_raw_event_refs: parseRawRefs(object.required_raw_event_refs),
    current_takeover_ref: parseTakeoverRef(object.current_takeover_ref),
    current_artifact_ref: parseArtifactRef(object.current_artifact_ref),
    evidence_bundle_id: null,
    evidence_event_refs: parseEmptyArray(object.evidence_event_refs),
    evidence_relation_paths: parseEmptyArray(object.evidence_relation_paths),
    policy_hash: storedHash(object.policy_hash),
    config_hash: storedHash(object.config_hash),
    projection_version: storedString(object.projection_version),
    assembler_version_hash: storedHash(object.assembler_version_hash),
    current_input_event_id: storedIdentifier(object.current_input_event_id),
    current_input_hash: storedHash(object.current_input_hash),
    host_manifest_digest: storedHash(object.host_manifest_digest),
    external_content_hashes: parseExternalContentHashes(object.external_content_hashes),
    working_context_hash: storedHash(object.working_context_hash),
    working_context_estimated_tokens: storedRevision(object.working_context_estimated_tokens),
    hard_token_capacity: storedPositiveInteger(object.hard_token_capacity, MAX_HARD_TOKEN_CAPACITY),
    created_at: storedTimestamp(object.created_at),
  };
  if (manifest.frontier_position > manifest.ledger_as_of_revision) corrupt();
  return manifest;
}

function parseStateRefs(value: unknown): SnapshotStateRef[] {
  return parseArray(value, MAX_MANIFEST_REFS).map((entry) => {
    const object = readExactObject(entry, ["item_id", "kind", "status", "inclusion_reasons"]);
    const kind = storedString(object.kind) as CanonicalStateItem["kind"];
    const status = storedString(object.status) as CanonicalStateItem["status"];
    if (![
      "GOAL", "CONSTRAINT", "DECISION", "OPEN_QUESTION", "REJECTED_ALTERNATIVE",
    ].includes(kind) || ![
      "ACTIVE", "COMPLETED", "SUPERSEDED", "OPEN", "DEFERRED", "RESOLVED", "REJECTED",
    ].includes(status)) corrupt();
    return {
      item_id: storedIdentifier(object.item_id),
      kind,
      status,
      inclusion_reasons: parseReasons(object.inclusion_reasons),
    };
  });
}

function parseExcludedStateRefs(value: unknown): SnapshotExcludedStateRef[] {
  return parseArray(value, MAX_MANIFEST_REFS).map((entry) => {
    const object = readExactObject(entry, ["item_id", "kind", "status", "exclusion_reason"]);
    const parsed = parseStateRefs([{
      item_id: object.item_id,
      kind: object.kind,
      status: object.status,
      inclusion_reasons: ["CURRENT_AUTHORITY"],
    }])[0]!;
    if (object.exclusion_reason !== "DEFAULT_NOT_CURRENT") corrupt();
    return {
      item_id: parsed.item_id,
      kind: parsed.kind,
      status: parsed.status,
      exclusion_reason: "DEFAULT_NOT_CURRENT",
    };
  });
}

function parseFactRefs(value: unknown): SnapshotFactRef[] {
  const refs = parseArray(value, MAX_MANIFEST_REFS).map((entry) => {
    const object = readExactObject(entry,
      ["fact_id", "fact_revision", "fact_hash", "inclusion_reasons"]);
    return {
      fact_id: storedIdentifier(object.fact_id),
      fact_revision: storedPositiveRevision(object.fact_revision),
      fact_hash: storedHash(object.fact_hash),
      inclusion_reasons: parseReasons(object.inclusion_reasons),
    };
  });
  assertStoredSorted(refs.map((ref) => `${ref.fact_id}\u0000${ref.fact_revision}`));
  return refs;
}

function parseRelationRefs(value: unknown): SnapshotRelationRef[] {
  const refs = parseArray(value, MAX_MANIFEST_REFS).map((entry) => {
    const object = readExactObject(entry,
      ["relation_id", "relation_revision", "relation_hash", "inclusion_reasons"]);
    return {
      relation_id: storedIdentifier(object.relation_id),
      relation_revision: storedPositiveRevision(object.relation_revision),
      relation_hash: storedHash(object.relation_hash),
      inclusion_reasons: parseReasons(object.inclusion_reasons),
    };
  });
  assertStoredSorted(refs.map((ref) => `${ref.relation_id}\u0000${ref.relation_revision}`));
  return refs;
}

function parseRawRefs(value: unknown): SnapshotRawEventRef[] {
  return parseArray(value, MAX_MANIFEST_REFS).map((entry) => {
    const object = readExactObject(entry, ["ledger_revision", "event_id", "inclusion_reasons"]);
    return {
      ledger_revision: storedPositiveRevision(object.ledger_revision),
      event_id: storedIdentifier(object.event_id),
      inclusion_reasons: parseReasons(object.inclusion_reasons),
    };
  });
}

function parseDependencyPaths(value: unknown): SnapshotDependencyPath[] {
  const paths = parseArray(value, MAX_MANIFEST_REFS).map((entry) => {
    const object = readExactObject(entry, ["root", "target", "relation_ids"]);
    return {
      root: parseEndpoint(object.root),
      target: parseEndpoint(object.target),
      relation_ids: parseStoredIdentifiers(object.relation_ids, MAX_MANIFEST_REFS),
    };
  });
  const keys = paths.map((path) =>
    `${endpointKey(path.root)}\u0000${endpointKey(path.target)}\u0000${path.relation_ids.join("\u0000")}`);
  assertStoredSorted(keys);
  return paths;
}

function parseTakeoverRef(value: unknown): SnapshotTakeoverRef | null {
  if (value === null) return null;
  const object = readExactObject(value, [
    "takeover_commit_id", "takeover_commit_revision", "artifact_id", "artifact_hash",
  ]);
  return {
    takeover_commit_id: storedIdentifier(object.takeover_commit_id),
    takeover_commit_revision: storedPositiveRevision(object.takeover_commit_revision),
    artifact_id: storedIdentifier(object.artifact_id),
    artifact_hash: storedHash(object.artifact_hash),
  };
}

function parseArtifactRef(value: unknown): SnapshotArtifactRef | null {
  if (value === null) return null;
  const object = readExactObject(value, [
    "artifact_id", "artifact_hash", "included_in_working_context", "inclusion_reasons",
  ]);
  if (typeof object.included_in_working_context !== "boolean") corrupt();
  const reasons = object.included_in_working_context
    ? parseReasons(object.inclusion_reasons)
    : parseEmptyArray(object.inclusion_reasons);
  if (canonicalJson(reasons) !== canonicalJson(
    object.included_in_working_context ? ["CURRENT_TAKEOVER_ARTIFACT"] : []
  )) corrupt();
  return {
    artifact_id: storedIdentifier(object.artifact_id),
    artifact_hash: storedHash(object.artifact_hash),
    included_in_working_context: object.included_in_working_context,
    inclusion_reasons: reasons,
  };
}

function normalizeFreezeInput(value: unknown): NormalizedFreezeInput {
  const object = readExactObject(value, [
    "schema_version", "scope", "snapshot_id", "operation_id", "attempt_id",
    "expected_revision_vector", "current_input_event_id", "required_state_item_ids",
    "required_raw_event_ids", "required_fact_refs", "required_relation_refs",
    "host_manifest_digest", "external_content_hashes", "hard_token_capacity", "policy_hash",
  ]);
  if (object.schema_version !== 1) invalid();
  const scope = normalizeScope(object.scope);
  const expected = normalizeVector(object.expected_revision_vector, scope);
  const requiredStateIds = normalizeIdentifierArray(
    object.required_state_item_ids,
    MAX_REQUIRED_STATE_IDS
  );
  const requiredRawIds = normalizeIdentifierArray(
    object.required_raw_event_ids,
    MAX_REQUIRED_RAW_REFS
  );
  const requiredFactRefs = normalizeFactRefInputs(object.required_fact_refs);
  const requiredRelationRefs = normalizeRelationRefInputs(object.required_relation_refs);
  const external = normalizeExternalContentHashes(object.external_content_hashes);
  const hardCapacity = positiveInteger(object.hard_token_capacity, MAX_HARD_TOKEN_CAPACITY);
  const policyHash = validateHash(object.policy_hash);
  if (policyHash !== CONTEXT_SNAPSHOT_POLICY_HASH) invalid();
  const normalized: ContextSnapshotFreezeInput = {
    schema_version: 1,
    scope,
    snapshot_id: validateIdentifier(object.snapshot_id),
    operation_id: validateIdentifier(object.operation_id),
    attempt_id: validateIdentifier(object.attempt_id),
    expected_revision_vector: expected,
    current_input_event_id: validateIdentifier(object.current_input_event_id),
    required_state_item_ids: requiredStateIds,
    required_raw_event_ids: requiredRawIds,
    required_fact_refs: requiredFactRefs,
    required_relation_refs: requiredRelationRefs,
    host_manifest_digest: validateHash(object.host_manifest_digest),
    external_content_hashes: external,
    hard_token_capacity: hardCapacity,
    policy_hash: policyHash,
  };
  const request = freezeRequestAsJson(normalized);
  const requestJson = canonicalJson(request);
  return {
    ...normalized,
    request,
    requestJson,
    requestFingerprint: sha256(requestJson),
  };
}

function parseStoredRequest(json: string): NormalizedFreezeInput {
  const value = parseStoredJson(json);
  try {
    return normalizeFreezeInput(value);
  } catch {
    corrupt();
  }
}

function parseStoredManifest(json: string): ContextSnapshotManifest {
  const value = parseStoredJson(json);
  try {
    return parseManifest(value);
  } catch {
    corrupt();
  }
}

function freezeRequestAsJson(input: ContextSnapshotFreezeInput): JsonObject {
  return {
    schema_version: 1,
    scope: { ...input.scope },
    snapshot_id: input.snapshot_id,
    operation_id: input.operation_id,
    attempt_id: input.attempt_id,
    expected_revision_vector: vectorAsJson(input.expected_revision_vector),
    current_input_event_id: input.current_input_event_id,
    required_state_item_ids: [...input.required_state_item_ids],
    required_raw_event_ids: [...input.required_raw_event_ids],
    required_fact_refs: input.required_fact_refs.map((ref) => ({ ...ref })),
    required_relation_refs: input.required_relation_refs.map((ref) => ({ ...ref })),
    host_manifest_digest: input.host_manifest_digest,
    external_content_hashes: input.external_content_hashes.map((entry) => ({ ...entry })),
    hard_token_capacity: input.hard_token_capacity,
    policy_hash: input.policy_hash,
  };
}

function normalizeFactRefInputs(value: unknown): ContextSnapshotFactRefInput[] {
  const refs = parseArray(value, MAX_REQUIRED_FACT_REFS).map((entry) => {
    const object = readExactObject(entry, ["fact_id", "fact_revision"]);
    return {
      fact_id: validateIdentifier(object.fact_id),
      fact_revision: positiveRevision(object.fact_revision),
    };
  }).sort((left, right) => compareText(left.fact_id, right.fact_id) ||
    left.fact_revision - right.fact_revision);
  assertUnique(refs.map((ref) => `${ref.fact_id}\u0000${ref.fact_revision}`));
  return refs;
}

function normalizeRelationRefInputs(value: unknown): ContextSnapshotRelationRefInput[] {
  const refs = parseArray(value, MAX_REQUIRED_RELATION_REFS).map((entry) => {
    const object = readExactObject(entry, ["relation_id", "relation_revision"]);
    return {
      relation_id: validateIdentifier(object.relation_id),
      relation_revision: positiveRevision(object.relation_revision),
    };
  }).sort((left, right) => compareText(left.relation_id, right.relation_id) ||
    left.relation_revision - right.relation_revision);
  assertUnique(refs.map((ref) => `${ref.relation_id}\u0000${ref.relation_revision}`));
  return refs;
}

function normalizeExternalContentHashes(value: unknown): ExternalContentHash[] {
  const entries = parseArray(value, MAX_EXTERNAL_CONTENT_REFS).map((entry) => {
    const object = readExactObject(entry, ["stable_ref", "content_hash"]);
    return {
      stable_ref: validateText(object.stable_ref, MAX_STABLE_REF_LENGTH),
      content_hash: validateHash(object.content_hash),
    };
  }).sort((left, right) => compareText(left.stable_ref, right.stable_ref));
  assertUnique(entries.map(({ stable_ref }) => stable_ref));
  return entries;
}

function parseExternalContentHashes(value: unknown): ExternalContentHash[] {
  try {
    return normalizeExternalContentHashes(value);
  } catch {
    corrupt();
  }
}

function normalizeIdentifierArray(value: unknown, maximum: number): string[] {
  const ids = parseArray(value, maximum).map(validateIdentifier).sort(compareText);
  assertUnique(ids);
  return ids;
}

function parseStoredIdentifiers(value: unknown, maximum: number): string[] {
  try {
    return normalizeIdentifierArray(value, maximum);
  } catch {
    corrupt();
  }
}

function normalizeScope(value: unknown): RevisionScope {
  const object = readExactObject(value, ["namespace", "stream_id"]);
  return {
    namespace: validateIdentifier(object.namespace),
    stream_id: validateIdentifier(object.stream_id),
  };
}

function normalizeVector(value: unknown, scope: RevisionScope): RevisionVector {
  const object = readExactObject(value, [
    "namespace", "stream_id", "ledger_revision", "state_revision",
    "raw_frontier_revision", "frontier_position", "takeover_commit_revision",
  ]);
  const vector: RevisionVector = {
    namespace: validateIdentifier(object.namespace),
    stream_id: validateIdentifier(object.stream_id),
    ledger_revision: revision(object.ledger_revision),
    state_revision: revision(object.state_revision),
    raw_frontier_revision: revision(object.raw_frontier_revision),
    frontier_position: revision(object.frontier_position),
    takeover_commit_revision: revision(object.takeover_commit_revision),
  };
  if (!sameScope(vector, scope) || vector.frontier_position > vector.ledger_revision) invalid();
  return vector;
}

function readVector(
  database: DatabaseSync,
  scope: RevisionScope,
  missingCode: "CONFLICT" | "CORRUPT_DATA"
): RevisionVector {
  const row = database.prepare(
    `SELECT namespace, stream_id, ledger_revision, state_revision,
            raw_frontier_revision, frontier_position, takeover_commit_revision
     FROM cc_revision_streams WHERE namespace = ? AND stream_id = ?`
  ).get(scope.namespace, scope.stream_id) as StreamRow | undefined;
  if (row === undefined) {
    if (missingCode === "CONFLICT") conflict();
    corrupt();
  }
  try {
    return normalizeVector(row, scope);
  } catch {
    corrupt();
  }
}

export function migrateContextSnapshot(database: DatabaseSync): void {
  database.exec("BEGIN IMMEDIATE;");
  try {
    if (sqliteObjectExists(database, "table", "cc_context_snapshot_schema")) {
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
      "INSERT INTO cc_context_snapshot_schema (version, completed_at) VALUES (?, ?)"
    ).run(CONTEXT_SNAPSHOT_SCHEMA_VERSION, new Date().toISOString());
    assertCurrentSchemaVersion(database);
    database.exec("COMMIT;");
  } catch (error) {
    rollback(database);
    throw error;
  }
}

function validateSchema(database: DatabaseSync): void {
  assertTableColumns(database, "cc_context_snapshot_schema", ["version", "completed_at"]);
  assertTableColumns(database, "cc_context_snapshots", [
    "namespace", "stream_id", "snapshot_id", "operation_id", "attempt_id",
    "request_fingerprint", "request_json", "manifest_hash", "manifest_json",
    "working_context_hash", "working_context_text", "created_at",
  ]);
  assertTableColumns(database, "cc_context_attempt_starts", [
    "namespace", "stream_id", "attempt_id", "operation_id", "snapshot_id",
    "snapshot_manifest_hash", "created_at",
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
    "SELECT version FROM cc_context_snapshot_schema ORDER BY version"
  ).all() as Array<{ version: number }>;
  if (rows.length !== 1 || rows[0]?.version !== CONTEXT_SNAPSHOT_SCHEMA_VERSION) corrupt();
}

function assertTableColumns(database: DatabaseSync, table: string, expected: string[]): void {
  const rows = database.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (rows.length !== expected.length || rows.some((row, index) => row.name !== expected[index])) {
    corrupt();
  }
}

function sqliteObjectExists(
  database: DatabaseSync,
  type: "table" | "trigger",
  name: string
): boolean {
  return database.prepare(
    "SELECT 1 FROM sqlite_master WHERE type = ? AND name = ?"
  ).get(type, name) !== undefined;
}

function normalizeSchemaSql(value: string): string {
  return value.replace(/\s+/gu, " ").replace(/\s*([(),;])\s*/gu, "$1").trim();
}

function isCurrentItem(item: CanonicalStateItem): boolean {
  return (item.kind === "GOAL" && item.status === "ACTIVE") ||
    (item.kind === "CONSTRAINT" && item.status === "ACTIVE") ||
    (item.kind === "DECISION" && item.status === "ACTIVE") ||
    (item.kind === "OPEN_QUESTION" && item.status === "OPEN");
}

function includeEndpoint(
  endpoint: CanonicalRelationEndpoint,
  stateItems: Map<string, CanonicalStateItem>,
  facts: Map<string, CommittedCanonicalFact>,
  selectedState: Map<string, Set<ContextSnapshotInclusionReason>>,
  selectedFacts: Map<string, { fact: CommittedCanonicalFact; reasons: Set<ContextSnapshotInclusionReason> }>,
  reason: ContextSnapshotInclusionReason
): void {
  if (endpoint.type === "STATE_ITEM") {
    if (!stateItems.has(endpoint.id)) corrupt();
    addReason(selectedState, endpoint.id, reason);
    return;
  }
  if (endpoint.type === "FACT") {
    const fact = facts.get(endpoint.id);
    if (fact === undefined) corrupt();
    addFact(selectedFacts, fact, reason);
    return;
  }
  if (endpoint.type === "RAW_EVENT") return;
  corrupt();
}

function addReason(
  target: Map<string, Set<ContextSnapshotInclusionReason>>,
  key: string,
  reason: ContextSnapshotInclusionReason
): void {
  const reasons = target.get(key) ?? new Set<ContextSnapshotInclusionReason>();
  reasons.add(reason);
  target.set(key, reasons);
}

function addFact(
  target: Map<string, { fact: CommittedCanonicalFact; reasons: Set<ContextSnapshotInclusionReason> }>,
  fact: CommittedCanonicalFact,
  reason: ContextSnapshotInclusionReason
): void {
  const key = `${fact.fact_id}\u0000${fact.fact_revision}`;
  const entry = target.get(key) ?? { fact, reasons: new Set<ContextSnapshotInclusionReason>() };
  if (entry.fact.fact_hash !== fact.fact_hash) corrupt();
  entry.reasons.add(reason);
  target.set(key, entry);
}

function addRelation(
  target: Map<string, {
    relation: CommittedCanonicalRelation;
    reasons: Set<ContextSnapshotInclusionReason>;
  }>,
  relation: CommittedCanonicalRelation,
  reason: ContextSnapshotInclusionReason
): void {
  const key = `${relation.relation_id}\u0000${relation.relation_revision}`;
  const entry = target.get(key) ?? {
    relation,
    reasons: new Set<ContextSnapshotInclusionReason>(),
  };
  if (entry.relation.relation_hash !== relation.relation_hash) corrupt();
  entry.reasons.add(reason);
  target.set(key, entry);
}

function endpointKey(endpoint: CanonicalRelationEndpoint): string {
  return `${endpoint.type}:${endpoint.id}`;
}

function parseEndpoint(value: unknown): CanonicalRelationEndpoint {
  const object = readExactObject(value, ["type", "id"]);
  if (object.type !== "RAW_EVENT" && object.type !== "FACT" && object.type !== "STATE_ITEM") {
    corrupt();
  }
  return { type: object.type, id: storedIdentifier(object.id) };
}

function uniqueEndpoints(values: CanonicalRelationEndpoint[]): CanonicalRelationEndpoint[] {
  const map = new Map<string, CanonicalRelationEndpoint>();
  for (const value of values) map.set(endpointKey(value), { ...value });
  return [...map.values()].sort((left, right) => compareText(endpointKey(left), endpointKey(right)));
}

function sortedReasons(
  values: Set<ContextSnapshotInclusionReason>
): ContextSnapshotInclusionReason[] {
  return [...values].sort(compareText);
}

function parseReasons(value: unknown): ContextSnapshotInclusionReason[] {
  const reasons = parseArray(value, CONTEXT_SNAPSHOT_INCLUSION_REASONS.length)
    .map((entry) => {
      if (typeof entry !== "string" ||
          !CONTEXT_SNAPSHOT_INCLUSION_REASONS.includes(entry as ContextSnapshotInclusionReason)) {
        corrupt();
      }
      return entry as ContextSnapshotInclusionReason;
    });
  validateReasons(reasons);
  return reasons;
}

function validateReasons(reasons: ContextSnapshotInclusionReason[]): void {
  if (reasons.length === 0) corrupt();
  const sorted = [...reasons].sort(compareText);
  if (canonicalJson(sorted) !== canonicalJson(reasons)) corrupt();
  assertStoredUnique(reasons);
}

function parseEmptyArray(value: unknown): [] {
  const values = parseArray(value, 0);
  if (values.length !== 0) corrupt();
  return [];
}

function compareStateItems(left: CanonicalStateItem, right: CanonicalStateItem): number {
  return compareText(left.item_id, right.item_id);
}

function compareFacts(left: CommittedCanonicalFact, right: CommittedCanonicalFact): number {
  return compareText(left.fact_id, right.fact_id) || left.fact_revision - right.fact_revision;
}

function compareRelations(
  left: CommittedCanonicalRelation,
  right: CommittedCanonicalRelation
): number {
  return compareText(left.relation_id, right.relation_id) ||
    left.relation_revision - right.relation_revision;
}

function compareRelationsForClosure(
  left: CommittedCanonicalRelation,
  right: CommittedCanonicalRelation
): number {
  return compareText(endpointKey(left.target), endpointKey(right.target)) ||
    compareRelations(left, right);
}

function compareRawEvents(left: LedgerRawEvent, right: LedgerRawEvent): number {
  return left.ledger_revision - right.ledger_revision || compareText(left.event_id, right.event_id);
}

function compareDependencyPaths(left: SnapshotDependencyPath, right: SnapshotDependencyPath): number {
  return compareText(endpointKey(left.root), endpointKey(right.root)) ||
    compareText(endpointKey(left.target), endpointKey(right.target)) ||
    compareText(left.relation_ids.join("\u0000"), right.relation_ids.join("\u0000"));
}

function estimateTokens(value: string): number {
  if (value.length === 0) return 0;
  return Math.max(1, Math.ceil(value.length / 4));
}

function rawEventAsJson(event: LedgerRawEvent): JsonObject {
  return {
    namespace: event.namespace,
    stream_id: event.stream_id,
    ledger_revision: event.ledger_revision,
    event_id: event.event_id,
    source_kind: event.source_kind,
    source_id: event.source_id,
    ...(event.source_session_id === undefined ? {} : {
      source_session_id: event.source_session_id,
    }),
    payload: cloneRawJson(event.payload),
    ...(event.occurred_at === undefined ? {} : { occurred_at: event.occurred_at }),
    created_at: event.created_at,
  };
}

function manifestAsJson(manifest: ContextSnapshotManifest): JsonObject {
  return normalizeJsonValue(manifest) as JsonObject;
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

function manifestVector(manifest: ContextSnapshotManifest): RevisionVector {
  return {
    namespace: manifest.namespace,
    stream_id: manifest.stream_id,
    ledger_revision: manifest.ledger_as_of_revision,
    state_revision: manifest.state_revision,
    raw_frontier_revision: manifest.raw_frontier_revision,
    frontier_position: manifest.frontier_position,
    takeover_commit_revision: manifest.takeover_commit_revision,
  };
}

function sameVector(left: RevisionVector, right: RevisionVector): boolean {
  return left.namespace === right.namespace && left.stream_id === right.stream_id &&
    left.ledger_revision === right.ledger_revision &&
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

function sameScope(left: RevisionScope, right: RevisionScope): boolean {
  return left.namespace === right.namespace && left.stream_id === right.stream_id;
}

function cloneDependencyPath(value: SnapshotDependencyPath): SnapshotDependencyPath {
  return {
    root: { ...value.root },
    target: { ...value.target },
    relation_ids: [...value.relation_ids],
  };
}

function cloneManifest(manifest: ContextSnapshotManifest): ContextSnapshotManifest {
  return parseManifest(manifestAsJson(manifest));
}

function cloneAttempt(attempt: ContextAttemptStarted): ContextAttemptStarted {
  return { ...attempt };
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(normalizeJsonValue(value));
}

function canonicalRawJson(value: JsonValue): string {
  return JSON.stringify(normalizeRawJsonValue(value));
}

function normalizeRawJsonValue(
  value: JsonValue,
  ancestors = new Set<object>()
): JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
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
      return value.map((entry) => normalizeRawJsonValue(entry, ancestors));
    }
    if (prototype !== Object.prototype && prototype !== null) corrupt();
    const result: Record<string, JsonValue> = {};
    const keys = Reflect.ownKeys(value);
    if (keys.some((key) => typeof key !== "string")) corrupt();
    for (const key of (keys as string[]).sort()) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor?.enumerable || !("value" in descriptor)) corrupt();
      result[key] = normalizeRawJsonValue(descriptor.value as JsonValue, ancestors);
    }
    return result;
  } finally {
    ancestors.delete(value);
  }
}

function cloneRawJson(value: JsonValue): JsonValue {
  return normalizeRawJsonValue(value);
}

function normalizeJsonValue(
  value: unknown,
  ancestors = new Set<object>()
): JsonValue {
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "string") {
    if (value !== value.normalize("NFC") || /\p{Cc}/u.test(value)) invalid();
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value) || Object.is(value, -0)) invalid();
    return value;
  }
  if (typeof value !== "object" || ancestors.has(value)) invalid();
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      assertDensePlainArray(value);
      return value.map((entry) => normalizeJsonValue(entry, ancestors));
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) invalid();
    const result: Record<string, JsonValue> = {};
    const keys = Reflect.ownKeys(value);
    if (keys.some((key) => typeof key !== "string")) invalid();
    for (const key of (keys as string[]).sort()) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor?.enumerable || !("value" in descriptor)) invalid();
      result[key] = normalizeJsonValue(descriptor.value, ancestors);
    }
    return result;
  } finally {
    ancestors.delete(value);
  }
}

function parseStoredJson(json: string): JsonValue {
  try {
    const value = normalizeJsonValue(JSON.parse(json));
    if (canonicalJson(value) !== json) corrupt();
    return value;
  } catch {
    corrupt();
  }
}

function readExactObject(value: unknown, expectedKeys: readonly string[]): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) invalid();
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) invalid();
  const keys = Reflect.ownKeys(value);
  if (keys.length !== expectedKeys.length) invalid();
  const expected = new Set(expectedKeys);
  for (const key of keys) {
    if (typeof key !== "string" || !expected.has(key)) invalid();
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor?.enumerable || !("value" in descriptor)) invalid();
  }
  return value as Record<string, unknown>;
}

function parseArray(value: unknown, maximum: number): unknown[] {
  if (!Array.isArray(value) || value.length > maximum) invalid();
  assertDensePlainArray(value);
  return value;
}

function assertDensePlainArray(value: unknown[]): void {
  if (Object.getPrototypeOf(value) !== Array.prototype) invalid();
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.prototype.hasOwnProperty.call(value, index)) invalid();
  }
  const keys = Reflect.ownKeys(value);
  if (keys.some((key) => typeof key === "symbol" ||
      (key !== "length" && !/^(0|[1-9][0-9]*)$/u.test(key as string)))) invalid();
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

function validateHash(value: unknown): string {
  if (typeof value !== "string" || !HASH_PATTERN.test(value)) invalid();
  return value;
}

function revision(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0 ||
      (value as number) > MAX_SAFE_REVISION) invalid();
  return value as number;
}

function positiveRevision(value: unknown): number {
  const result = revision(value);
  if (result === 0) invalid();
  return result;
}

function positiveInteger(value: unknown, maximum: number): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1 || (value as number) > maximum) invalid();
  return value as number;
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

function storedString(value: unknown): string {
  if (typeof value !== "string") corrupt();
  return value;
}

function storedRevision(value: unknown): number {
  try {
    return revision(value);
  } catch {
    corrupt();
  }
}

function storedPositiveRevision(value: unknown): number {
  try {
    return positiveRevision(value);
  } catch {
    corrupt();
  }
}

function storedPositiveInteger(value: unknown, maximum: number): number {
  try {
    return positiveInteger(value, maximum);
  } catch {
    corrupt();
  }
}

function storedTimestamp(value: unknown): string {
  if (typeof value !== "string" || value.length > 100) corrupt();
  try {
    if (new Date(value).toISOString() !== value) corrupt();
  } catch {
    corrupt();
  }
  return value;
}

function assertUnique(values: string[]): void {
  for (let index = 1; index < values.length; index += 1) {
    if (values[index - 1] === values[index]) invalid();
  }
}

function assertStoredUnique(values: string[]): void {
  const sorted = [...values].sort(compareText);
  for (let index = 1; index < sorted.length; index += 1) {
    if (sorted[index - 1] === sorted[index]) corrupt();
  }
}

function assertStoredSorted(values: string[]): void {
  for (let index = 1; index < values.length; index += 1) {
    if (compareText(values[index - 1]!, values[index]!) >= 0) corrupt();
  }
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function rollback(database: DatabaseSync): void {
  try { database.exec("ROLLBACK;"); } catch { /* preserve original failure */ }
}

function mapSnapshotError(error: unknown): ContextSnapshotError {
  if (error instanceof ContextSnapshotError) return error;
  if (error instanceof LedgerHotRawError || error instanceof CanonicalStateError ||
      error instanceof CanonicalFactRelationError || error instanceof SemanticTakeoverError) {
    switch (error.code) {
      case "INVALID_INPUT": return new ContextSnapshotError("INVALID_INPUT");
      case "NOT_FOUND": return new ContextSnapshotError("NOT_FOUND");
      case "CONFLICT": return new ContextSnapshotError("CONFLICT");
      case "CORRUPT_DATA": return new ContextSnapshotError("CORRUPT_DATA");
      case "CLOSED": return new ContextSnapshotError("CLOSED");
      case "STORAGE_FAILURE": return new ContextSnapshotError("STORAGE_FAILURE");
    }
  }
  return new ContextSnapshotError("STORAGE_FAILURE");
}

function rethrowStoredAuthorityError(error: unknown): never {
  if (error instanceof ContextSnapshotError) throw error;
  if (error instanceof LedgerHotRawError || error instanceof CanonicalStateError ||
      error instanceof CanonicalFactRelationError || error instanceof SemanticTakeoverError) {
    if (error.code === "STORAGE_FAILURE" || error.code === "CLOSED") storageFailure();
    corrupt();
  }
  storageFailure();
}

function invalid(): never {
  throw new ContextSnapshotError("INVALID_INPUT");
}

function notFound(): never {
  throw new ContextSnapshotError("NOT_FOUND");
}

function conflict(): never {
  throw new ContextSnapshotError("CONFLICT");
}

function budgetInsufficient(): never {
  throw new ContextSnapshotError("BUDGET_INSUFFICIENT");
}

function corrupt(): never {
  throw new ContextSnapshotError("CORRUPT_DATA");
}

function storageFailure(): never {
  throw new ContextSnapshotError("STORAGE_FAILURE");
}
