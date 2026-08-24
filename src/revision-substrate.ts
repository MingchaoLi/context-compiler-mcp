import { createHash } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { initializeSqliteConnection } from "./sqlite-initialization.js";
import type { JsonValue } from "./raw-store.js";

export const REVISION_SUBSTRATE_SCHEMA_VERSION = 1;
export const AUTHORITY_NAMESPACE = "authority";
export const SHADOW_NAMESPACE_PREFIX = "shadow:";

export type RevisionCommitOperation =
  | "LEDGER"
  | "STATE"
  | "FRONTIER"
  | "TAKEOVER"
  | "TAKEOVER_FRONTIER";

export type RevisionSubstrateErrorCode =
  | "INVALID_INPUT"
  | "CONFLICT"
  | "STORAGE_FAILURE"
  | "CORRUPT_DATA"
  | "CLOSED";

export interface RevisionScope {
  namespace: string;
  stream_id: string;
}

export interface RevisionVector extends RevisionScope {
  ledger_revision: number;
  state_revision: number;
  raw_frontier_revision: number;
  frontier_position: number;
  takeover_commit_revision: number;
}

interface BaseRevisionCommitInput {
  scope: RevisionScope;
  commit_id: string;
  kind: string;
  request: JsonValue;
}

export interface LedgerRevisionCommitInput extends BaseRevisionCommitInput {}

export interface StateRevisionCommitInput extends BaseRevisionCommitInput {
  expected_state_revision: number;
}

export interface FrontierRevisionCommitInput extends BaseRevisionCommitInput {
  expected_frontier_revision: number;
  expected_frontier_position: number;
  next_frontier_position: number;
}

export interface TakeoverRevisionCommitInput extends BaseRevisionCommitInput {}

export interface TakeoverFrontierCommitInput extends FrontierRevisionCommitInput {}

export interface RevisionCommitRecord {
  namespace: string;
  stream_id: string;
  commit_id: string;
  operation: RevisionCommitOperation;
  kind: string;
  request_fingerprint: string;
  previous: RevisionVector;
  current: RevisionVector;
  result: JsonValue;
  created_at: string;
}

/** @internal Only Core-owned domain writers may receive this SQLite context. */
export interface RevisionTransactionContext {
  readonly scope: RevisionScope;
  readonly previous: RevisionVector;
  readonly current: RevisionVector;
  readonly database: DatabaseSync;
}

export type RevisionTransactionOperation = (
  context: RevisionTransactionContext
) => JsonValue;

export class RevisionSubstrateError extends Error {
  constructor(readonly code: RevisionSubstrateErrorCode) {
    super(code);
    this.name = "RevisionSubstrateError";
  }
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

interface CommitRow extends Record<string, unknown> {
  namespace: string;
  stream_id: string;
  commit_id: string;
  operation: RevisionCommitOperation;
  kind: string;
  request_fingerprint: string;
  request_json: string;
  previous_json: string;
  current_json: string;
  result_json: string;
  created_at: string;
}

interface StoredCommit {
  record: RevisionCommitRecord;
  requestJson: string;
}

interface NormalizedCommitInput {
  scope: RevisionScope;
  commit_id: string;
  operation: RevisionCommitOperation;
  kind: string;
  request: JsonValue;
  requestJson: string;
  requestFingerprint: string;
  expectedStateRevision?: number;
  expectedFrontierRevision?: number;
  expectedFrontierPosition?: number;
  nextFrontierPosition?: number;
}

const MAX_IDENTIFIER_LENGTH = 500;
const MAX_KIND_LENGTH = 100;
const MAX_SAFE_REVISION = Number.MAX_SAFE_INTEGER;
type CoreCommitCapability = (
  input: unknown,
  operation: RevisionCommitOperation,
  apply: RevisionTransactionOperation
) => RevisionCommitRecord;
const CORE_COMMIT_CAPABILITIES = new WeakMap<SqliteRevisionSubstrate, CoreCommitCapability>();

const SUBSTRATE_SCHEMA_OBJECTS = [
  {
    type: "table",
    name: "cc_revision_substrate_schema",
    sql: `CREATE TABLE cc_revision_substrate_schema (
      version INTEGER PRIMARY KEY CHECK (version > 0),
      completed_at TEXT NOT NULL
    )`,
  },
  {
    type: "table",
    name: "cc_revision_streams",
    sql: `CREATE TABLE cc_revision_streams (
      namespace TEXT NOT NULL CHECK (length(namespace) > 0 AND length(namespace) <= 500),
      stream_id TEXT NOT NULL CHECK (length(stream_id) > 0 AND length(stream_id) <= 500),
      ledger_revision INTEGER NOT NULL CHECK (
        ledger_revision >= 0 AND ledger_revision <= 9007199254740991
      ),
      state_revision INTEGER NOT NULL CHECK (
        state_revision >= 0 AND state_revision <= 9007199254740991
      ),
      raw_frontier_revision INTEGER NOT NULL CHECK (
        raw_frontier_revision >= 0 AND raw_frontier_revision <= 9007199254740991
      ),
      frontier_position INTEGER NOT NULL CHECK (
        frontier_position >= 0 AND frontier_position <= 9007199254740991
      ),
      takeover_commit_revision INTEGER NOT NULL CHECK (
        takeover_commit_revision >= 0 AND takeover_commit_revision <= 9007199254740991
      ),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (namespace, stream_id),
      CHECK (frontier_position <= ledger_revision)
    )`,
  },
  {
    type: "table",
    name: "cc_revision_commits",
    sql: `CREATE TABLE cc_revision_commits (
      namespace TEXT NOT NULL,
      stream_id TEXT NOT NULL,
      commit_id TEXT NOT NULL CHECK (length(commit_id) > 0 AND length(commit_id) <= 500),
      operation TEXT NOT NULL CHECK (
        operation IN ('LEDGER','STATE','FRONTIER','TAKEOVER','TAKEOVER_FRONTIER')
      ),
      kind TEXT NOT NULL CHECK (length(kind) > 0 AND length(kind) <= 100),
      request_fingerprint TEXT NOT NULL CHECK (
        length(request_fingerprint) = 64 AND
        request_fingerprint NOT GLOB '*[^0-9a-f]*'
      ),
      request_json TEXT NOT NULL CHECK (json_valid(request_json)),
      previous_json TEXT NOT NULL CHECK (json_valid(previous_json)),
      current_json TEXT NOT NULL CHECK (json_valid(current_json)),
      result_json TEXT NOT NULL CHECK (json_valid(result_json)),
      created_at TEXT NOT NULL,
      PRIMARY KEY (namespace, stream_id, commit_id),
      FOREIGN KEY (namespace, stream_id)
        REFERENCES cc_revision_streams(namespace, stream_id)
    )`,
  },
  {
    type: "trigger",
    name: "cc_revision_commits_no_update",
    sql: `CREATE TRIGGER cc_revision_commits_no_update
      BEFORE UPDATE ON cc_revision_commits
      BEGIN
        SELECT RAISE(ABORT, 'revision commit markers are immutable');
      END`,
  },
  {
    type: "trigger",
    name: "cc_revision_commits_no_delete",
    sql: `CREATE TRIGGER cc_revision_commits_no_delete
      BEFORE DELETE ON cc_revision_commits
      BEGIN
        SELECT RAISE(ABORT, 'revision commit markers are append-only');
      END`,
  },
  {
    type: "trigger",
    name: "cc_revision_schema_no_update",
    sql: `CREATE TRIGGER cc_revision_schema_no_update
      BEFORE UPDATE ON cc_revision_substrate_schema
      BEGIN
        SELECT RAISE(ABORT, 'revision schema markers are immutable');
      END`,
  },
  {
    type: "trigger",
    name: "cc_revision_schema_no_delete",
    sql: `CREATE TRIGGER cc_revision_schema_no_delete
      BEFORE DELETE ON cc_revision_substrate_schema
      BEGIN
        SELECT RAISE(ABORT, 'revision schema markers are append-only');
      END`,
  },
] as const;

/**
 * Core-owned persistence for the v3.1.1 namespace/stream/revision substrate.
 * Mutation uses a module-private capability and JavaScript private method so
 * Host/MCP adapters cannot discover a generic writer or SQLite handle by
 * reflecting over the stable Core surface.
 */
export class SqliteRevisionSubstrate {
  readonly #database: DatabaseSync;
  #closed = false;
  #transactionOpen = false;

  constructor(databasePath: string) {
    if (typeof databasePath !== "string" || databasePath.length === 0) {
      throw new RevisionSubstrateError("INVALID_INPUT");
    }
    let database: DatabaseSync | undefined;
    try {
      if (databasePath !== ":memory:") mkdirSync(dirname(databasePath), { recursive: true });
      database = new DatabaseSync(databasePath);
      initializeSqliteConnection(database, databasePath, () => {
        migrateRevisionSubstrate(database!);
      });
      this.#database = database;
      CORE_COMMIT_CAPABILITIES.set(
        this,
        (input, operation, apply) => this.#commitInsideCore(input, operation, apply)
      );
    } catch {
      try { database?.close(); } catch { /* preserve stable constructor failure */ }
      throw new RevisionSubstrateError("STORAGE_FAILURE");
    }
  }

  getRevisionVector(scope: RevisionScope): RevisionVector {
    this.#assertOpen();
    const normalized = normalizeScope(scope);
    try {
      const row = this.#database.prepare(
        `SELECT namespace, stream_id, ledger_revision, state_revision,
                raw_frontier_revision, frontier_position, takeover_commit_revision
         FROM cc_revision_streams
         WHERE namespace = ? AND stream_id = ?`
      ).get(normalized.namespace, normalized.stream_id) as StreamRow | undefined;
      return row === undefined ? zeroVector(normalized) : vectorFromRow(row);
    } catch (error) {
      if (error instanceof RevisionSubstrateError) throw error;
      throw new RevisionSubstrateError("STORAGE_FAILURE");
    }
  }

  getCommit(scope: RevisionScope, commitId: string): RevisionCommitRecord | undefined {
    this.#assertOpen();
    const normalizedScope = normalizeScope(scope);
    const normalizedCommitId = validateIdentifier(commitId, "commit_id");
    try {
      const row = this.#database.prepare(
        `SELECT namespace, stream_id, commit_id, operation, kind,
                request_fingerprint, request_json, previous_json, current_json,
                result_json, created_at
         FROM cc_revision_commits
         WHERE namespace = ? AND stream_id = ? AND commit_id = ?`
      ).get(
        normalizedScope.namespace,
        normalizedScope.stream_id,
        normalizedCommitId
      ) as CommitRow | undefined;
      return row === undefined ? undefined : commitFromRow(row);
    } catch (error) {
      if (error instanceof RevisionSubstrateError) throw error;
      throw new RevisionSubstrateError("STORAGE_FAILURE");
    }
  }

  close(): void {
    if (this.#closed) return;
    if (this.#transactionOpen) throw new RevisionSubstrateError("CONFLICT");
    try {
      this.#database.close();
      this.#closed = true;
    } catch {
      throw new RevisionSubstrateError("STORAGE_FAILURE");
    }
  }

  #commitInsideCore(
    input: unknown,
    operation: RevisionCommitOperation,
    apply: RevisionTransactionOperation
  ): RevisionCommitRecord {
    this.#assertOpen();
    const normalized = normalizeCommitInput(input, operation);
    if (this.#transactionOpen) throw new RevisionSubstrateError("CONFLICT");

    try {
      this.#database.exec("BEGIN IMMEDIATE;");
      this.#transactionOpen = true;
      const existing = this.#findCommitInsideTransaction(
        normalized.scope,
        normalized.commit_id
      );
      if (existing !== undefined) {
        assertCompatibleReplay(existing.record, existing.requestJson, normalized);
        this.#database.exec("COMMIT;");
        return existing.record;
      }

      const timestamp = new Date().toISOString();
      this.#ensureStreamInsideTransaction(normalized.scope, timestamp);
      const previous = this.#readVectorInsideTransaction(normalized.scope);
      const current = computeNextVector(previous, normalized);
      const rawResult = apply({
        scope: { ...normalized.scope },
        previous: cloneVector(previous),
        current: cloneVector(current),
        database: this.#database,
      });
      const result = normalizeJsonValue(rawResult, "result");
      const resultJson = canonicalJson(result);

      const update = this.#database.prepare(
        `UPDATE cc_revision_streams
         SET ledger_revision = ?, state_revision = ?, raw_frontier_revision = ?,
             frontier_position = ?, takeover_commit_revision = ?, updated_at = ?
         WHERE namespace = ? AND stream_id = ?
           AND ledger_revision = ? AND state_revision = ?
           AND raw_frontier_revision = ? AND frontier_position = ?
           AND takeover_commit_revision = ?`
      ).run(
        current.ledger_revision,
        current.state_revision,
        current.raw_frontier_revision,
        current.frontier_position,
        current.takeover_commit_revision,
        timestamp,
        previous.namespace,
        previous.stream_id,
        previous.ledger_revision,
        previous.state_revision,
        previous.raw_frontier_revision,
        previous.frontier_position,
        previous.takeover_commit_revision
      );
      if (Number(update.changes) !== 1) throw new RevisionSubstrateError("CONFLICT");

      const record: RevisionCommitRecord = {
        namespace: normalized.scope.namespace,
        stream_id: normalized.scope.stream_id,
        commit_id: normalized.commit_id,
        operation: normalized.operation,
        kind: normalized.kind,
        request_fingerprint: normalized.requestFingerprint,
        previous: cloneVector(previous),
        current: cloneVector(current),
        result,
        created_at: timestamp,
      };
      this.#database.prepare(
        `INSERT INTO cc_revision_commits (
           namespace, stream_id, commit_id, operation, kind,
           request_fingerprint, request_json, previous_json, current_json,
           result_json, created_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        record.namespace,
        record.stream_id,
        record.commit_id,
        record.operation,
        record.kind,
        record.request_fingerprint,
        normalized.requestJson,
        canonicalJson(record.previous),
        canonicalJson(record.current),
        resultJson,
        record.created_at
      );
      this.#database.exec("COMMIT;");
      return cloneCommit(record);
    } catch (error) {
      rollback(this.#database);
      throw error;
    } finally {
      this.#transactionOpen = false;
    }
  }

  #findCommitInsideTransaction(
    scope: RevisionScope,
    commitId: string
  ): StoredCommit | undefined {
    const row = this.#database.prepare(
      `SELECT namespace, stream_id, commit_id, operation, kind,
              request_fingerprint, request_json, previous_json, current_json,
              result_json, created_at
       FROM cc_revision_commits
       WHERE namespace = ? AND stream_id = ? AND commit_id = ?`
    ).get(scope.namespace, scope.stream_id, commitId) as CommitRow | undefined;
    return row === undefined ? undefined : {
      record: commitFromRow(row),
      requestJson: row.request_json,
    };
  }

  #ensureStreamInsideTransaction(scope: RevisionScope, timestamp: string): void {
    this.#database.prepare(
      `INSERT OR IGNORE INTO cc_revision_streams (
         namespace, stream_id, ledger_revision, state_revision,
         raw_frontier_revision, frontier_position, takeover_commit_revision,
         created_at, updated_at
       ) VALUES (?, ?, 0, 0, 0, 0, 0, ?, ?)`
    ).run(scope.namespace, scope.stream_id, timestamp, timestamp);
  }

  #readVectorInsideTransaction(scope: RevisionScope): RevisionVector {
    const row = this.#database.prepare(
      `SELECT namespace, stream_id, ledger_revision, state_revision,
              raw_frontier_revision, frontier_position, takeover_commit_revision
       FROM cc_revision_streams
       WHERE namespace = ? AND stream_id = ?`
    ).get(scope.namespace, scope.stream_id) as StreamRow | undefined;
    if (row === undefined) throw new RevisionSubstrateError("CORRUPT_DATA");
    return vectorFromRow(row);
  }

  #assertOpen(): void {
    if (this.#closed) throw new RevisionSubstrateError("CLOSED");
  }
}

export function commitLedgerRevisionInsideCore(
  substrate: SqliteRevisionSubstrate,
  input: LedgerRevisionCommitInput,
  operation: RevisionTransactionOperation = () => null
): RevisionCommitRecord {
  return coreCommitCapability(substrate)(input, "LEDGER", operation);
}

export function commitStateRevisionInsideCore(
  substrate: SqliteRevisionSubstrate,
  input: StateRevisionCommitInput,
  operation: RevisionTransactionOperation = () => null
): RevisionCommitRecord {
  return coreCommitCapability(substrate)(input, "STATE", operation);
}

export function compareAndAdvanceFrontierInsideCore(
  substrate: SqliteRevisionSubstrate,
  input: FrontierRevisionCommitInput,
  operation: RevisionTransactionOperation = () => null
): RevisionCommitRecord {
  return coreCommitCapability(substrate)(input, "FRONTIER", operation);
}

export function commitTakeoverRevisionInsideCore(
  substrate: SqliteRevisionSubstrate,
  input: TakeoverRevisionCommitInput,
  operation: RevisionTransactionOperation = () => null
): RevisionCommitRecord {
  return coreCommitCapability(substrate)(input, "TAKEOVER", operation);
}

export function commitTakeoverFrontierInsideCore(
  substrate: SqliteRevisionSubstrate,
  input: TakeoverFrontierCommitInput,
  operation: RevisionTransactionOperation = () => null
): RevisionCommitRecord {
  return coreCommitCapability(substrate)(input, "TAKEOVER_FRONTIER", operation);
}

function coreCommitCapability(substrate: SqliteRevisionSubstrate): CoreCommitCapability {
  const capability = CORE_COMMIT_CAPABILITIES.get(substrate);
  if (capability === undefined) invalid();
  return capability;
}

export function migrateRevisionSubstrate(database: DatabaseSync): void {
  database.exec("BEGIN IMMEDIATE;");
  try {
    if (sqliteObjectExists(database, "table", "cc_revision_substrate_schema")) {
      validateSubstrateSchema(database);
      assertCurrentSchemaVersion(database);
      database.exec("COMMIT;");
      return;
    }
    for (const [type, name] of [
      ["table", "cc_revision_streams"],
      ["table", "cc_revision_commits"],
      ["trigger", "cc_revision_commits_no_update"],
      ["trigger", "cc_revision_commits_no_delete"],
      ["trigger", "cc_revision_schema_no_update"],
      ["trigger", "cc_revision_schema_no_delete"],
    ] as const) {
      if (sqliteObjectExists(database, type, name)) {
        throw new RevisionSubstrateError("CORRUPT_DATA");
      }
    }
    database.exec(SUBSTRATE_SCHEMA_OBJECTS.map(({ sql }) => `${sql};`).join("\n"));
    validateSubstrateSchema(database);
    database.prepare(
      "INSERT INTO cc_revision_substrate_schema (version, completed_at) VALUES (?, ?)"
    ).run(REVISION_SUBSTRATE_SCHEMA_VERSION, new Date().toISOString());
    assertCurrentSchemaVersion(database);
    database.exec("COMMIT;");
  } catch (error) {
    rollback(database);
    throw error;
  }
}

function normalizeCommitInput(
  value: unknown,
  operation: RevisionCommitOperation
): NormalizedCommitInput {
  const baseKeys = ["scope", "commit_id", "kind", "request"];
  const frontierKeys = [
    "expected_frontier_revision",
    "expected_frontier_position",
    "next_frontier_position",
  ];
  const expectedKeys = operation === "STATE"
    ? [...baseKeys, "expected_state_revision"]
    : operation === "FRONTIER" || operation === "TAKEOVER_FRONTIER"
      ? [...baseKeys, ...frontierKeys]
      : baseKeys;
  const input = readExactObject(value, expectedKeys);
  const scope = normalizeScope(input.scope);
  const commitId = validateIdentifier(input.commit_id, "commit_id");
  const kind = validateKind(input.kind);
  const request = normalizeJsonValue(input.request, "request");
  const descriptor: Record<string, JsonValue> = {
    scope: { namespace: scope.namespace, stream_id: scope.stream_id },
    commit_id: commitId,
    operation,
    kind,
    request,
  };

  const normalized: NormalizedCommitInput = {
    scope,
    commit_id: commitId,
    operation,
    kind,
    request,
    requestJson: "",
    requestFingerprint: "",
  };
  if (operation === "STATE") {
    const expected = validateRevision(input.expected_state_revision, "expected_state_revision");
    normalized.expectedStateRevision = expected;
    descriptor.expected_state_revision = expected;
  }
  if (operation === "FRONTIER" || operation === "TAKEOVER_FRONTIER") {
    const expectedRevision = validateRevision(
      input.expected_frontier_revision,
      "expected_frontier_revision"
    );
    const expectedPosition = validateRevision(
      input.expected_frontier_position,
      "expected_frontier_position"
    );
    const nextPosition = validateRevision(input.next_frontier_position, "next_frontier_position");
    normalized.expectedFrontierRevision = expectedRevision;
    normalized.expectedFrontierPosition = expectedPosition;
    normalized.nextFrontierPosition = nextPosition;
    descriptor.expected_frontier_revision = expectedRevision;
    descriptor.expected_frontier_position = expectedPosition;
    descriptor.next_frontier_position = nextPosition;
  }
  normalized.requestJson = canonicalJson(descriptor);
  normalized.requestFingerprint = fingerprint(normalized.requestJson);
  return normalized;
}

function normalizeStoredCommitDescriptor(
  value: JsonValue,
  operation: RevisionCommitOperation
): NormalizedCommitInput {
  const baseKeys = ["scope", "commit_id", "operation", "kind", "request"];
  const frontierKeys = [
    "expected_frontier_revision",
    "expected_frontier_position",
    "next_frontier_position",
  ];
  const expectedKeys = operation === "STATE"
    ? [...baseKeys, "expected_state_revision"]
    : operation === "FRONTIER" || operation === "TAKEOVER_FRONTIER"
      ? [...baseKeys, ...frontierKeys]
      : baseKeys;
  try {
    const descriptor = readExactObject(value, expectedKeys);
    if (descriptor.operation !== operation) corrupt();
    const input: Record<string, unknown> = {
      scope: descriptor.scope,
      commit_id: descriptor.commit_id,
      kind: descriptor.kind,
      request: descriptor.request,
    };
    if (operation === "STATE") {
      input.expected_state_revision = descriptor.expected_state_revision;
    }
    if (operation === "FRONTIER" || operation === "TAKEOVER_FRONTIER") {
      input.expected_frontier_revision = descriptor.expected_frontier_revision;
      input.expected_frontier_position = descriptor.expected_frontier_position;
      input.next_frontier_position = descriptor.next_frontier_position;
    }
    return normalizeCommitInput(input, operation);
  } catch {
    corrupt();
  }
}

function computeNextVector(
  previous: RevisionVector,
  input: NormalizedCommitInput
): RevisionVector {
  const current = cloneVector(previous);
  switch (input.operation) {
    case "LEDGER":
      current.ledger_revision = increment(previous.ledger_revision);
      break;
    case "STATE":
      if (previous.state_revision !== input.expectedStateRevision) conflict();
      current.state_revision = increment(previous.state_revision);
      break;
    case "FRONTIER":
      applyFrontierAdvance(previous, current, input);
      break;
    case "TAKEOVER":
      current.takeover_commit_revision = increment(previous.takeover_commit_revision);
      break;
    case "TAKEOVER_FRONTIER":
      applyFrontierAdvance(previous, current, input);
      current.takeover_commit_revision = increment(previous.takeover_commit_revision);
      break;
  }
  return current;
}

function applyFrontierAdvance(
  previous: RevisionVector,
  current: RevisionVector,
  input: NormalizedCommitInput
): void {
  if (
    previous.raw_frontier_revision !== input.expectedFrontierRevision ||
    previous.frontier_position !== input.expectedFrontierPosition
  ) conflict();
  const nextPosition = input.nextFrontierPosition;
  if (
    nextPosition === undefined ||
    nextPosition < previous.frontier_position ||
    nextPosition > previous.ledger_revision
  ) invalid();
  current.raw_frontier_revision = increment(previous.raw_frontier_revision);
  current.frontier_position = nextPosition;
}

function assertCompatibleReplay(
  existing: RevisionCommitRecord,
  storedRequestJson: string,
  input: NormalizedCommitInput
): void {
  if (
    existing.operation !== input.operation ||
    existing.kind !== input.kind ||
    existing.request_fingerprint !== input.requestFingerprint ||
    storedRequestJson !== input.requestJson
  ) conflict();
}

function normalizeScope(value: unknown): RevisionScope {
  const scope = readExactObject(value, ["namespace", "stream_id"]);
  const namespace = validateIdentifier(scope.namespace, "namespace");
  if (
    namespace !== AUTHORITY_NAMESPACE &&
    !(namespace.startsWith(SHADOW_NAMESPACE_PREFIX) &&
      namespace.slice(SHADOW_NAMESPACE_PREFIX.length).trim().length > 0)
  ) invalid();
  return {
    namespace,
    stream_id: validateIdentifier(scope.stream_id, "stream_id"),
  };
}

function validateIdentifier(value: unknown, _name: string): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > MAX_IDENTIFIER_LENGTH ||
    value.trim().length === 0 ||
    value !== value.normalize("NFC") ||
    /\p{Cc}/u.test(value)
  ) invalid();
  return value;
}

function validateKind(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > MAX_KIND_LENGTH ||
    !/^[A-Z][A-Z0-9_:-]*$/u.test(value)
  ) invalid();
  return value;
}

function validateRevision(value: unknown, _name: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) invalid();
  return value as number;
}

function increment(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) corrupt();
  if (value === MAX_SAFE_REVISION) conflict();
  return value + 1;
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

function vectorFromRow(row: StreamRow): RevisionVector {
  const scope = normalizeScope({ namespace: row.namespace, stream_id: row.stream_id });
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

function validateStoredRevision(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) corrupt();
  return value as number;
}

function commitFromRow(row: CommitRow): RevisionCommitRecord {
  const scope = normalizeScope({ namespace: row.namespace, stream_id: row.stream_id });
  if (![
    "LEDGER", "STATE", "FRONTIER", "TAKEOVER", "TAKEOVER_FRONTIER",
  ].includes(row.operation)) corrupt();
  if (!/^[0-9a-f]{64}$/u.test(row.request_fingerprint)) corrupt();
  const storedRequest = parseStoredJson(row.request_json);
  const normalizedDescriptor = normalizeStoredCommitDescriptor(storedRequest, row.operation);
  const canonicalRequest = canonicalJson(storedRequest);
  if (canonicalRequest !== row.request_json) corrupt();
  if (fingerprint(canonicalRequest) !== row.request_fingerprint) corrupt();
  const commitId = validateIdentifier(row.commit_id, "commit_id");
  const kind = validateKind(row.kind);
  if (
    normalizedDescriptor.requestJson !== row.request_json ||
    normalizedDescriptor.requestFingerprint !== row.request_fingerprint ||
    normalizedDescriptor.scope.namespace !== scope.namespace ||
    normalizedDescriptor.scope.stream_id !== scope.stream_id ||
    normalizedDescriptor.commit_id !== commitId ||
    normalizedDescriptor.kind !== kind
  ) corrupt();
  const previous = parseStoredVector(row.previous_json, scope);
  const current = parseStoredVector(row.current_json, scope);
  assertStoredTransition(previous, current, row.operation);
  assertStoredDescriptorTransition(normalizedDescriptor, previous, current);
  const result = parseStoredJson(row.result_json);
  return {
    ...scope,
    commit_id: commitId,
    operation: row.operation,
    kind,
    request_fingerprint: row.request_fingerprint,
    previous,
    current,
    result,
    created_at: validateIdentifier(row.created_at, "created_at"),
  };
}

function assertStoredDescriptorTransition(
  descriptor: NormalizedCommitInput,
  previous: RevisionVector,
  current: RevisionVector
): void {
  if (
    descriptor.operation === "STATE" &&
    descriptor.expectedStateRevision !== previous.state_revision
  ) corrupt();
  if (
    descriptor.operation === "FRONTIER" ||
    descriptor.operation === "TAKEOVER_FRONTIER"
  ) {
    if (
      descriptor.expectedFrontierRevision !== previous.raw_frontier_revision ||
      descriptor.expectedFrontierPosition !== previous.frontier_position ||
      descriptor.nextFrontierPosition !== current.frontier_position
    ) corrupt();
  }
}

function assertStoredTransition(
  previous: RevisionVector,
  current: RevisionVector,
  operation: RevisionCommitOperation
): void {
  if (previous.namespace !== current.namespace || previous.stream_id !== current.stream_id) corrupt();
  const expected = cloneVector(previous);
  switch (operation) {
    case "LEDGER":
      expected.ledger_revision = storedIncrement(previous.ledger_revision);
      break;
    case "STATE":
      expected.state_revision = storedIncrement(previous.state_revision);
      break;
    case "FRONTIER":
      expected.raw_frontier_revision = storedIncrement(previous.raw_frontier_revision);
      expected.frontier_position = current.frontier_position;
      break;
    case "TAKEOVER":
      expected.takeover_commit_revision = storedIncrement(previous.takeover_commit_revision);
      break;
    case "TAKEOVER_FRONTIER":
      expected.raw_frontier_revision = storedIncrement(previous.raw_frontier_revision);
      expected.frontier_position = current.frontier_position;
      expected.takeover_commit_revision = storedIncrement(previous.takeover_commit_revision);
      break;
  }
  if (
    current.frontier_position < previous.frontier_position ||
    current.frontier_position > current.ledger_revision ||
    canonicalJson(expected) !== canonicalJson(current)
  ) corrupt();
}

function storedIncrement(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0 || value === MAX_SAFE_REVISION) corrupt();
  return value + 1;
}

function fingerprint(canonicalRequest: string): string {
  return createHash("sha256").update(canonicalRequest).digest("hex");
}

function parseStoredVector(json: string, scope: RevisionScope): RevisionVector {
  const value = parseStoredJson(json);
  if (typeof value !== "object" || value === null || Array.isArray(value)) corrupt();
  const object = value as Record<string, JsonValue>;
  const vector = vectorFromRow({
    namespace: readStoredString(object.namespace),
    stream_id: readStoredString(object.stream_id),
    ledger_revision: readStoredNumber(object.ledger_revision),
    state_revision: readStoredNumber(object.state_revision),
    raw_frontier_revision: readStoredNumber(object.raw_frontier_revision),
    frontier_position: readStoredNumber(object.frontier_position),
    takeover_commit_revision: readStoredNumber(object.takeover_commit_revision),
  });
  if (vector.namespace !== scope.namespace || vector.stream_id !== scope.stream_id) corrupt();
  return vector;
}

function parseStoredJson(json: string): JsonValue {
  try {
    return normalizeJsonValue(JSON.parse(json), "stored_json");
  } catch (error) {
    if (error instanceof RevisionSubstrateError) throw error;
    throw new RevisionSubstrateError("CORRUPT_DATA");
  }
}

function readStoredString(value: JsonValue | undefined): string {
  if (typeof value !== "string") corrupt();
  return value;
}

function readStoredNumber(value: JsonValue | undefined): number {
  if (typeof value !== "number") corrupt();
  return value;
}

function cloneVector(vector: RevisionVector): RevisionVector {
  return { ...vector };
}

function cloneCommit(record: RevisionCommitRecord): RevisionCommitRecord {
  return {
    ...record,
    previous: cloneVector(record.previous),
    current: cloneVector(record.current),
    result: normalizeJsonValue(record.result, "result"),
  };
}

function normalizeJsonValue(
  value: unknown,
  _path: string,
  ancestors = new Set<object>()
): JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
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
      const ownKeys = Reflect.ownKeys(value);
      for (const key of ownKeys) {
        if (key === "length") continue;
        if (typeof key !== "string" || !/^(0|[1-9][0-9]*)$/u.test(key)) invalid();
        const index = Number(key);
        if (!Number.isSafeInteger(index) || index < 0 || index >= value.length) invalid();
        const descriptor = Object.getOwnPropertyDescriptor(value, key);
        if (!descriptor?.enumerable || !("value" in descriptor)) invalid();
      }
      const result: JsonValue[] = [];
      for (let index = 0; index < value.length; index += 1) {
        if (!Object.prototype.hasOwnProperty.call(value, index)) invalid();
        result.push(normalizeJsonValue(value[index], `${_path}[${index}]`, ancestors));
      }
      return result;
    }
    if (prototype !== Object.prototype && prototype !== null) invalid();
    const result: Record<string, JsonValue> = {};
    const keys = Reflect.ownKeys(value);
    if (keys.some((key) => typeof key !== "string")) invalid();
    for (const key of (keys as string[]).sort()) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor?.enumerable || !("value" in descriptor)) invalid();
      Object.defineProperty(result, key, {
        configurable: true,
        enumerable: true,
        writable: true,
        value: normalizeJsonValue(descriptor.value, `${_path}.${key}`, ancestors),
      });
    }
    return result;
  } finally {
    ancestors.delete(value);
  }
}

function canonicalJson(value: JsonValue | RevisionVector | Record<string, JsonValue>): string {
  return JSON.stringify(normalizeJsonValue(value, "canonical"));
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

function validateSubstrateSchema(database: DatabaseSync): void {
  assertTableColumns(database, "cc_revision_substrate_schema", ["version", "completed_at"]);
  assertTableColumns(database, "cc_revision_streams", [
    "namespace", "stream_id", "ledger_revision", "state_revision",
    "raw_frontier_revision", "frontier_position", "takeover_commit_revision",
    "created_at", "updated_at",
  ]);
  assertTableColumns(database, "cc_revision_commits", [
    "namespace", "stream_id", "commit_id", "operation", "kind",
    "request_fingerprint", "request_json", "previous_json", "current_json",
    "result_json", "created_at",
  ]);
  for (const expected of SUBSTRATE_SCHEMA_OBJECTS) {
    const row = database.prepare(
      "SELECT type, name, sql FROM sqlite_master WHERE type = ? AND name = ?"
    ).get(expected.type, expected.name) as {
      type: string;
      name: string;
      sql: string | null;
    } | undefined;
    if (
      row?.type !== expected.type ||
      row.name !== expected.name ||
      typeof row.sql !== "string" ||
      normalizeSchemaSql(row.sql) !== normalizeSchemaSql(expected.sql)
    ) throw new RevisionSubstrateError("CORRUPT_DATA");
  }
}

function normalizeSchemaSql(sql: string): string {
  return sql.trim().replace(/\s+/gu, " ").replace(/;$/u, "");
}

function assertCurrentSchemaVersion(database: DatabaseSync): void {
  const versions = database.prepare(
    "SELECT version FROM cc_revision_substrate_schema ORDER BY version"
  ).all() as Array<{ version: number }>;
  if (
    versions.length !== 1 ||
    versions[0]?.version !== REVISION_SUBSTRATE_SCHEMA_VERSION
  ) throw new RevisionSubstrateError("CORRUPT_DATA");
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
  if (
    rows.length !== expected.length ||
    rows.some((row, index) => row.name !== expected[index])
  ) throw new RevisionSubstrateError("CORRUPT_DATA");
}

function rollback(database: DatabaseSync): void {
  try { database.exec("ROLLBACK;"); } catch { /* preserve the primary failure */ }
}

function invalid(): never {
  throw new RevisionSubstrateError("INVALID_INPUT");
}

function conflict(): never {
  throw new RevisionSubstrateError("CONFLICT");
}

function corrupt(): never {
  throw new RevisionSubstrateError("CORRUPT_DATA");
}
