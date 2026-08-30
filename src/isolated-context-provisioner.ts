import { createHash } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { isProxy } from "node:util/types";
import {
  LEDGER_HOT_RAW_SCHEMA_VERSION,
  LedgerHotRawError,
  migrateLedgerHotRawInsideTransaction,
  validateLedgerHotRawSchema,
} from "./ledger-hot-raw.js";
import {
  RawHistorySchemaError,
  migrateRawHistoryStoreInsideTransaction,
  validateRawHistorySchema,
} from "./raw-store.js";
import {
  AUTHORITY_NAMESPACE,
  REVISION_SUBSTRATE_SCHEMA_VERSION,
  SHADOW_NAMESPACE_PREFIX,
  RevisionSubstrateError,
  migrateRevisionSubstrateInsideTransaction,
  validateRevisionSubstrateSchema,
  type RevisionScope,
} from "./revision-substrate.js";
import { initializeSqliteConnection } from "./sqlite-initialization.js";

export const ISOLATED_CONTEXT_PROVISIONER_CAPABILITY =
  "isolated_context_provisioner" as const;
export const ISOLATED_CONTEXT_PROVISIONER_CONTRACT_VERSION =
  "isolated-context-provisioner/v1" as const;
export const ISOLATED_CONTEXT_PROVISIONER_SCHEMA_VERSION = 1 as const;

export type IsolatedContextProvisionerErrorCode =
  | "INVALID_REQUEST"
  | "UNSUPPORTED_VERSION"
  | "OPERATION_COLLISION"
  | "IDENTITY_COLLISION"
  | "NOT_FOUND"
  | "LEGACY_STORAGE"
  | "CORRUPT_DATA"
  | "STORAGE_UNAVAILABLE"
  | "CONCURRENT_CONFLICT";

export interface IsolatedContextProvisionRequest {
  contract_version: typeof ISOLATED_CONTEXT_PROVISIONER_CONTRACT_VERSION;
  operation_id: string;
  namespace: IsolatedContextProvisionNamespace;
}

export type IsolatedContextProvisionNamespace =
  | typeof AUTHORITY_NAMESPACE
  | `${typeof SHADOW_NAMESPACE_PREFIX}${string}`;

export interface IsolatedContextProvisionIdentity {
  contract_version: typeof ISOLATED_CONTEXT_PROVISIONER_CONTRACT_VERSION;
  context_id: string;
  stream_id: string;
  session_id: string;
  scope: RevisionScope;
}

export type IsolatedContextProvisionDisposition = "CREATED" | "EXISTS";

export interface IsolatedContextProvisionReceipt {
  capability: typeof ISOLATED_CONTEXT_PROVISIONER_CAPABILITY;
  contract_version: typeof ISOLATED_CONTEXT_PROVISIONER_CONTRACT_VERSION;
  schema_version: typeof ISOLATED_CONTEXT_PROVISIONER_SCHEMA_VERSION;
  operation_id: string;
  request_fingerprint: string;
  context_id: string;
  stream_id: string;
  session_id: string;
  scope: RevisionScope;
  revision: 1;
  status: "OPEN";
  created_at: string;
  receipt_fingerprint: string;
  disposition: IsolatedContextProvisionDisposition;
}

export interface IsolatedContextProvisionerCapability {
  capability: typeof ISOLATED_CONTEXT_PROVISIONER_CAPABILITY;
  contract_version: typeof ISOLATED_CONTEXT_PROVISIONER_CONTRACT_VERSION;
  schema_version: typeof ISOLATED_CONTEXT_PROVISIONER_SCHEMA_VERSION;
  ready: true;
  exact_operation_lookup: true;
  exact_identity_lookup: true;
  exact_idempotency: true;
  close_empty_supported: false;
}

export class IsolatedContextProvisionerError extends Error {
  constructor(readonly code: IsolatedContextProvisionerErrorCode) {
    super(code);
    this.name = "IsolatedContextProvisionerError";
  }
}

interface NormalizedRequest {
  contract_version: typeof ISOLATED_CONTEXT_PROVISIONER_CONTRACT_VERSION;
  operation_id: string;
  namespace: string;
  requestJson: string;
  requestFingerprint: string;
}

interface NormalizedIdentity extends IsolatedContextProvisionIdentity {}

interface ProvisionRow extends Record<string, unknown> {
  operation_id: string;
  request_fingerprint: string;
  request_json: string;
  context_id: string;
  namespace: string;
  stream_id: string;
  session_id: string;
  revision: number;
  status: string;
  created_at: string;
  receipt_fingerprint: string;
  receipt_json: string;
}

interface StreamRow extends Record<string, unknown> {
  namespace: string;
  stream_id: string;
  ledger_revision: number;
  state_revision: number;
  raw_frontier_revision: number;
  frontier_position: number;
  takeover_commit_revision: number;
  created_at: string;
  updated_at: string;
}

interface ImmutableReceipt {
  capability: typeof ISOLATED_CONTEXT_PROVISIONER_CAPABILITY;
  contract_version: typeof ISOLATED_CONTEXT_PROVISIONER_CONTRACT_VERSION;
  schema_version: typeof ISOLATED_CONTEXT_PROVISIONER_SCHEMA_VERSION;
  operation_id: string;
  request_fingerprint: string;
  context_id: string;
  stream_id: string;
  session_id: string;
  scope: RevisionScope;
  revision: 1;
  status: "OPEN";
  created_at: string;
}

const MAX_IDENTIFIER_LENGTH = 500;
const HASH_PATTERN = /^[0-9a-f]{64}$/u;
const CAPABILITY: IsolatedContextProvisionerCapability = {
  capability: ISOLATED_CONTEXT_PROVISIONER_CAPABILITY,
  contract_version: ISOLATED_CONTEXT_PROVISIONER_CONTRACT_VERSION,
  schema_version: ISOLATED_CONTEXT_PROVISIONER_SCHEMA_VERSION,
  ready: true,
  exact_operation_lookup: true,
  exact_identity_lookup: true,
  exact_idempotency: true,
  close_empty_supported: false,
};

const PROVISIONER_SCHEMA_OBJECTS = [
  {
    type: "table",
    name: "cc_isolated_context_provisioner_schema",
    sql: `CREATE TABLE cc_isolated_context_provisioner_schema (
      version INTEGER PRIMARY KEY CHECK (version > 0),
      completed_at TEXT NOT NULL
    )`,
  },
  {
    type: "table",
    name: "cc_isolated_context_provisions",
    sql: `CREATE TABLE cc_isolated_context_provisions (
      operation_id TEXT PRIMARY KEY CHECK (length(operation_id) > 0 AND length(operation_id) <= 500),
      request_fingerprint TEXT NOT NULL CHECK (
        length(request_fingerprint) = 64 AND request_fingerprint NOT GLOB '*[^0-9a-f]*'
      ),
      request_json TEXT NOT NULL CHECK (json_valid(request_json)),
      context_id TEXT NOT NULL UNIQUE CHECK (length(context_id) > 0 AND length(context_id) <= 500),
      namespace TEXT NOT NULL CHECK (length(namespace) > 0 AND length(namespace) <= 500),
      stream_id TEXT NOT NULL UNIQUE CHECK (length(stream_id) > 0 AND length(stream_id) <= 500),
      session_id TEXT NOT NULL UNIQUE CHECK (length(session_id) > 0 AND length(session_id) <= 500),
      revision INTEGER NOT NULL CHECK (revision = 1),
      status TEXT NOT NULL CHECK (status = 'OPEN'),
      created_at TEXT NOT NULL,
      receipt_fingerprint TEXT NOT NULL CHECK (
        length(receipt_fingerprint) = 64 AND receipt_fingerprint NOT GLOB '*[^0-9a-f]*'
      ),
      receipt_json TEXT NOT NULL CHECK (json_valid(receipt_json)),
      UNIQUE (namespace, stream_id),
      FOREIGN KEY (namespace, stream_id)
        REFERENCES cc_revision_streams(namespace, stream_id),
      FOREIGN KEY (session_id) REFERENCES sessions(id)
    )`,
  },
  {
    type: "trigger",
    name: "cc_isolated_context_provisions_no_update",
    sql: `CREATE TRIGGER cc_isolated_context_provisions_no_update
      BEFORE UPDATE ON cc_isolated_context_provisions
      BEGIN
        SELECT RAISE(ABORT, 'isolated context provisions are immutable');
      END`,
  },
  {
    type: "trigger",
    name: "cc_isolated_context_provisions_no_delete",
    sql: `CREATE TRIGGER cc_isolated_context_provisions_no_delete
      BEFORE DELETE ON cc_isolated_context_provisions
      BEGIN
        SELECT RAISE(ABORT, 'isolated context provisions are append-only');
      END`,
  },
  {
    type: "trigger",
    name: "cc_isolated_context_provisioner_schema_no_update",
    sql: `CREATE TRIGGER cc_isolated_context_provisioner_schema_no_update
      BEFORE UPDATE ON cc_isolated_context_provisioner_schema
      BEGIN
        SELECT RAISE(ABORT, 'isolated context provisioner schema is immutable');
      END`,
  },
  {
    type: "trigger",
    name: "cc_isolated_context_provisioner_schema_no_delete",
    sql: `CREATE TRIGGER cc_isolated_context_provisioner_schema_no_delete
      BEFORE DELETE ON cc_isolated_context_provisioner_schema
      BEGIN
        SELECT RAISE(ABORT, 'isolated context provisioner schema is append-only');
      END`,
  },
] as const;

/** Model-independent package-root owner for atomic isolated Context provisioning. */
export class IsolatedContextProvisioner {
  readonly #database: DatabaseSync;
  #closed = false;

  constructor(databasePath: string) {
    if (typeof databasePath !== "string" || databasePath.length === 0) {
      throw new IsolatedContextProvisionerError("INVALID_REQUEST");
    }
    let database: DatabaseSync | undefined;
    try {
      if (databasePath !== ":memory:") mkdirSync(dirname(databasePath), { recursive: true });
      database = new DatabaseSync(databasePath);
      initializeSqliteConnection(database, databasePath, () => {
        migrateProvisionerComposition(database!);
      });
      this.#database = database;
    } catch (error) {
      try { database?.close(); } catch { /* preserve classified initialization failure */ }
      throw mapStorageError(error);
    }
  }

  preflight(): IsolatedContextProvisionerCapability {
    this.#assertOpen();
    try {
      this.#database.exec("BEGIN;");
      assertReady(this.#database);
      this.#database.exec("COMMIT;");
      return { ...CAPABILITY };
    } catch (error) {
      rollback(this.#database);
      throw mapStorageError(error);
    }
  }

  provision(requestValue: IsolatedContextProvisionRequest): IsolatedContextProvisionReceipt {
    this.#assertOpen();
    const request = normalizePublicInput(() => normalizeRequest(requestValue));
    try {
      this.#database.exec("BEGIN IMMEDIATE;");
      assertReady(this.#database);
      const existing = readOperationRow(this.#database, request.operation_id);
      if (existing !== undefined) {
        const receipt = receiptFromRow(this.#database, existing, "EXISTS");
        if (
          existing.request_json !== request.requestJson ||
          receipt.request_fingerprint !== request.requestFingerprint
        ) operationCollision();
        this.#database.exec("COMMIT;");
        return receipt;
      }

      const generated = deriveIdentities(request);
      assertIdentitiesUnused(this.#database, generated);
      const createdAt = new Date().toISOString();
      const immutable = immutableReceipt(request, generated, createdAt);
      const receiptJson = canonicalJson(immutable);
      const receiptFingerprint = fingerprint(
        "cc-isolated-context-receipt/v1",
        receiptJson
      );

      this.#database.prepare(
        "INSERT INTO sessions (id, created_at) VALUES (?, ?)"
      ).run(generated.session_id, createdAt);
      this.#database.prepare(
        `INSERT INTO cc_revision_streams (
           namespace, stream_id, ledger_revision, state_revision,
           raw_frontier_revision, frontier_position, takeover_commit_revision,
           created_at, updated_at
         ) VALUES (?, ?, 0, 0, 0, 0, 0, ?, ?)`
      ).run(request.namespace, generated.stream_id, createdAt, createdAt);
      this.#database.prepare(
        `INSERT INTO cc_isolated_context_provisions (
           operation_id, request_fingerprint, request_json, context_id,
           namespace, stream_id, session_id, revision, status, created_at,
           receipt_fingerprint, receipt_json
         ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, 'OPEN', ?, ?, ?)`
      ).run(
        request.operation_id,
        request.requestFingerprint,
        request.requestJson,
        generated.context_id,
        request.namespace,
        generated.stream_id,
        generated.session_id,
        createdAt,
        receiptFingerprint,
        receiptJson
      );
      const inserted = readOperationRow(this.#database, request.operation_id);
      if (inserted === undefined) corrupt();
      const receipt = receiptFromRow(this.#database, inserted, "CREATED");
      this.#database.exec("COMMIT;");
      return receipt;
    } catch (error) {
      rollback(this.#database);
      throw mapStorageError(error);
    }
  }

  lookupByOperation(operationIdValue: string): IsolatedContextProvisionReceipt {
    this.#assertOpen();
    const operationId = normalizePublicInput(() => validateIdentifier(operationIdValue));
    try {
      this.#database.exec("BEGIN;");
      assertReady(this.#database);
      const row = readOperationRow(this.#database, operationId);
      if (row === undefined) notFound();
      const receipt = receiptFromRow(this.#database, row, "EXISTS");
      this.#database.exec("COMMIT;");
      return receipt;
    } catch (error) {
      rollback(this.#database);
      throw mapStorageError(error);
    }
  }

  lookupByIdentity(
    identityValue: IsolatedContextProvisionIdentity
  ): IsolatedContextProvisionReceipt {
    this.#assertOpen();
    const identity = normalizePublicInput(() => normalizeIdentity(identityValue));
    try {
      this.#database.exec("BEGIN;");
      assertReady(this.#database);
      const exact = this.#database.prepare(
        `${PROVISION_SELECT}
         WHERE context_id = ? AND stream_id = ? AND session_id = ?
           AND namespace = ?`
      ).get(
        identity.context_id,
        identity.stream_id,
        identity.session_id,
        identity.scope.namespace
      ) as ProvisionRow | undefined;
      if (exact !== undefined) {
        const receipt = receiptFromRow(this.#database, exact, "EXISTS");
        this.#database.exec("COMMIT;");
        return receipt;
      }
      const partial = this.#database.prepare(
        `${PROVISION_SELECT}
         WHERE context_id = ? OR stream_id = ? OR session_id = ?
            OR (namespace = ? AND stream_id = ?)
         LIMIT 1`
      ).get(
        identity.context_id,
        identity.stream_id,
        identity.session_id,
        identity.scope.namespace,
        identity.scope.stream_id
      ) as ProvisionRow | undefined;
      if (partial !== undefined) identityCollision();
      notFound();
    } catch (error) {
      rollback(this.#database);
      throw mapStorageError(error);
    }
  }

  close(): void {
    if (this.#closed) return;
    try {
      this.#database.close();
      this.#closed = true;
    } catch {
      throw new IsolatedContextProvisionerError("STORAGE_UNAVAILABLE");
    }
  }

  #assertOpen(): void {
    if (this.#closed) throw new IsolatedContextProvisionerError("STORAGE_UNAVAILABLE");
  }
}

const PROVISION_SELECT = `SELECT operation_id, request_fingerprint, request_json,
  context_id, namespace, stream_id, session_id, revision, status, created_at,
  receipt_fingerprint, receipt_json
  FROM cc_isolated_context_provisions`;

function migrateProvisionerComposition(database: DatabaseSync): void {
  database.exec("BEGIN IMMEDIATE;");
  try {
    migrateRawHistoryStoreInsideTransaction(database);
    migrateRevisionSubstrateInsideTransaction(database);
    migrateLedgerHotRawInsideTransaction(database);
    migrateIsolatedContextProvisionerInsideTransaction(database);
    database.exec("COMMIT;");
  } catch (error) {
    rollback(database);
    throw error;
  }
}

function migrateIsolatedContextProvisionerInsideTransaction(database: DatabaseSync): void {
  try {
    if (sqliteObjectExists(database, "table", "cc_isolated_context_provisioner_schema")) {
      validateProvisionerSchema(database);
      assertProvisionerSchemaVersion(database);
      assertDependencySchemas(database);
      return;
    }
    for (const object of PROVISIONER_SCHEMA_OBJECTS.slice(1)) {
      if (sqliteObjectExists(database, object.type, object.name)) corrupt();
    }
    assertDependencySchemas(database);
    database.exec(PROVISIONER_SCHEMA_OBJECTS.map(({ sql }) => `${sql};`).join("\n"));
    validateProvisionerSchema(database);
    database.prepare(
      `INSERT INTO cc_isolated_context_provisioner_schema (version, completed_at)
       VALUES (?, ?)`
    ).run(ISOLATED_CONTEXT_PROVISIONER_SCHEMA_VERSION, new Date().toISOString());
    assertProvisionerSchemaVersion(database);
    assertForeignKeys(database);
  } catch (error) {
    throw error;
  }
}

function assertReady(database: DatabaseSync): void {
  validateProvisionerSchema(database);
  assertProvisionerSchemaVersion(database);
  assertDependencySchemas(database);
  assertForeignKeys(database);
  assertAllProvisionsValid(database);
}

function assertAllProvisionsValid(database: DatabaseSync): void {
  const rows = database.prepare(
    `${PROVISION_SELECT} ORDER BY operation_id`
  ).all() as ProvisionRow[];
  const identities = new Set<string>();
  for (const row of rows) {
    const receipt = receiptFromRow(database, row, "EXISTS");
    for (const identity of [receipt.context_id, receipt.stream_id, receipt.session_id]) {
      if (identities.has(identity)) corrupt();
      identities.add(identity);
    }
  }
}

function validateProvisionerSchema(database: DatabaseSync): void {
  assertTableColumns(database, "cc_isolated_context_provisioner_schema", [
    "version", "completed_at",
  ]);
  assertTableColumns(database, "cc_isolated_context_provisions", [
    "operation_id", "request_fingerprint", "request_json", "context_id",
    "namespace", "stream_id", "session_id", "revision", "status", "created_at",
    "receipt_fingerprint", "receipt_json",
  ]);
  for (const expected of PROVISIONER_SCHEMA_OBJECTS) assertSchemaObject(database, expected);
}

function assertProvisionerSchemaVersion(database: DatabaseSync): void {
  const rows = database.prepare(
    "SELECT version FROM cc_isolated_context_provisioner_schema ORDER BY version"
  ).all() as Array<{ version: number }>;
  if (rows.length !== 1) corrupt();
  if (rows[0]?.version !== ISOLATED_CONTEXT_PROVISIONER_SCHEMA_VERSION) legacy();
}

function assertDependencySchemas(database: DatabaseSync): void {
  try { validateRawHistorySchema(database); } catch { corrupt(); }
  assertDependencySchemaVersions(database);
  try {
    validateRevisionSubstrateSchema(database);
    validateLedgerHotRawSchema(database);
  } catch (error) {
    if (error instanceof RevisionSubstrateError || error instanceof LedgerHotRawError) corrupt();
    throw error;
  }
}

function assertDependencySchemaVersions(database: DatabaseSync): void {
  let revisionVersions: Array<{ version: number }>;
  let hotRawVersions: Array<{ version: number }>;
  try {
    revisionVersions = database.prepare(
      "SELECT version FROM cc_revision_substrate_schema ORDER BY version"
    ).all() as Array<{ version: number }>;
    hotRawVersions = database.prepare(
      "SELECT version FROM cc_ledger_hot_raw_schema ORDER BY version"
    ).all() as Array<{ version: number }>;
  } catch {
    corrupt();
  }
  if (revisionVersions.length !== 1 ||
      revisionVersions[0]?.version !== REVISION_SUBSTRATE_SCHEMA_VERSION ||
      hotRawVersions.length !== 1 ||
      hotRawVersions[0]?.version !== LEDGER_HOT_RAW_SCHEMA_VERSION) legacy();
}

function assertForeignKeys(database: DatabaseSync): void {
  const violations = database.prepare("PRAGMA foreign_key_check").all();
  if (violations.length !== 0) corrupt();
}

function assertSchemaObject(
  database: DatabaseSync,
  expected: (typeof PROVISIONER_SCHEMA_OBJECTS)[number]
): void {
  const row = database.prepare(
    "SELECT type, name, sql FROM sqlite_master WHERE type = ? AND name = ?"
  ).get(expected.type, expected.name) as {
    type: string; name: string; sql: string | null;
  } | undefined;
  if (
    row?.type !== expected.type || row.name !== expected.name ||
    typeof row.sql !== "string" ||
    normalizeSchemaSql(row.sql) !== normalizeSchemaSql(expected.sql)
  ) corrupt();
}

function normalizeRequest(value: unknown): NormalizedRequest {
  const request = readExactObject(value, ["contract_version", "operation_id", "namespace"]);
  if (typeof request.contract_version !== "string") invalid();
  if (request.contract_version !== ISOLATED_CONTEXT_PROVISIONER_CONTRACT_VERSION) unsupported();
  const operationId = validateIdentifier(request.operation_id);
  const namespace = validateNamespace(request.namespace);
  const canonical = {
    contract_version: ISOLATED_CONTEXT_PROVISIONER_CONTRACT_VERSION,
    namespace,
    operation_id: operationId,
  };
  const requestJson = canonicalJson(canonical);
  return {
    contract_version: ISOLATED_CONTEXT_PROVISIONER_CONTRACT_VERSION,
    operation_id: operationId,
    namespace,
    requestJson,
    requestFingerprint: fingerprint("cc-isolated-context-request/v1", requestJson),
  };
}

function normalizeIdentity(value: unknown): NormalizedIdentity {
  const identity = readExactObject(value, [
    "contract_version", "context_id", "stream_id", "session_id", "scope",
  ]);
  if (typeof identity.contract_version !== "string") invalid();
  if (identity.contract_version !== ISOLATED_CONTEXT_PROVISIONER_CONTRACT_VERSION) unsupported();
  const scopeValue = readExactObject(identity.scope, ["namespace", "stream_id"]);
  const streamId = validateIdentifier(identity.stream_id);
  const scope: RevisionScope = {
    namespace: validateNamespace(scopeValue.namespace),
    stream_id: validateIdentifier(scopeValue.stream_id),
  };
  if (scope.stream_id !== streamId) identityCollision();
  return {
    contract_version: ISOLATED_CONTEXT_PROVISIONER_CONTRACT_VERSION,
    context_id: validateIdentifier(identity.context_id),
    stream_id: streamId,
    session_id: validateIdentifier(identity.session_id),
    scope,
  };
}

function deriveIdentities(request: NormalizedRequest): {
  context_id: string; stream_id: string; session_id: string;
} {
  return {
    context_id: `ctx_${fingerprint("cc-isolated-context-identity/context/v1", request.requestFingerprint)}`,
    stream_id: `stream_${fingerprint("cc-isolated-context-identity/stream/v1", request.requestFingerprint)}`,
    session_id: `session_${fingerprint("cc-isolated-context-identity/session/v1", request.requestFingerprint)}`,
  };
}

function immutableReceipt(
  request: NormalizedRequest,
  identity: { context_id: string; stream_id: string; session_id: string },
  createdAt: string
): ImmutableReceipt {
  return {
    capability: ISOLATED_CONTEXT_PROVISIONER_CAPABILITY,
    contract_version: ISOLATED_CONTEXT_PROVISIONER_CONTRACT_VERSION,
    schema_version: ISOLATED_CONTEXT_PROVISIONER_SCHEMA_VERSION,
    operation_id: request.operation_id,
    request_fingerprint: request.requestFingerprint,
    context_id: identity.context_id,
    stream_id: identity.stream_id,
    session_id: identity.session_id,
    scope: { namespace: request.namespace, stream_id: identity.stream_id },
    revision: 1,
    status: "OPEN",
    created_at: createdAt,
  };
}

function receiptFromRow(
  database: DatabaseSync,
  row: ProvisionRow,
  disposition: IsolatedContextProvisionDisposition
): IsolatedContextProvisionReceipt {
  try {
    const storedRequest = parseCanonicalObject(row.request_json);
    const request = normalizeRequest(storedRequest);
    if (
      row.operation_id !== request.operation_id ||
      row.request_fingerprint !== request.requestFingerprint ||
      !HASH_PATTERN.test(row.request_fingerprint)
    ) corrupt();
    const derived = deriveIdentities(request);
    if (
      row.context_id !== derived.context_id || row.stream_id !== derived.stream_id ||
      row.session_id !== derived.session_id || row.namespace !== request.namespace ||
      row.revision !== 1 || row.status !== "OPEN" ||
      !validTimestamp(row.created_at)
    ) corrupt();
    const immutable = immutableReceipt(request, derived, row.created_at);
    const receiptJson = canonicalJson(immutable);
    if (row.receipt_json !== receiptJson ||
        canonicalJson(parseCanonicalObject(row.receipt_json)) !== receiptJson) corrupt();
    const expectedFingerprint = fingerprint(
      "cc-isolated-context-receipt/v1",
      receiptJson
    );
    if (row.receipt_fingerprint !== expectedFingerprint ||
        !HASH_PATTERN.test(row.receipt_fingerprint)) corrupt();
    assertNativeBindings(database, immutable);
    return {
      ...immutable,
      scope: { ...immutable.scope },
      receipt_fingerprint: expectedFingerprint,
      disposition,
    };
  } catch (error) {
    if (error instanceof IsolatedContextProvisionerError && error.code === "CORRUPT_DATA") {
      throw error;
    }
    corrupt();
  }
}

function assertNativeBindings(database: DatabaseSync, receipt: ImmutableReceipt): void {
  const session = database.prepare(
    "SELECT id, created_at FROM sessions WHERE id = ?"
  ).get(receipt.session_id) as { id: string; created_at: string } | undefined;
  if (session?.id !== receipt.session_id || session.created_at !== receipt.created_at) corrupt();
  const stream = database.prepare(
    `SELECT namespace, stream_id, ledger_revision, state_revision,
            raw_frontier_revision, frontier_position, takeover_commit_revision,
            created_at, updated_at
     FROM cc_revision_streams WHERE namespace = ? AND stream_id = ?`
  ).get(receipt.scope.namespace, receipt.stream_id) as StreamRow | undefined;
  if (
    stream?.namespace !== receipt.scope.namespace || stream.stream_id !== receipt.stream_id ||
    stream.created_at !== receipt.created_at || !validTimestamp(stream.updated_at)
  ) corrupt();
  const revisions = [
    stream.ledger_revision, stream.state_revision, stream.raw_frontier_revision,
    stream.frontier_position, stream.takeover_commit_revision,
  ];
  if (revisions.some((value) => !Number.isSafeInteger(value) || value < 0) ||
      stream.frontier_position > stream.ledger_revision) corrupt();
}

function assertIdentitiesUnused(
  database: DatabaseSync,
  identity: { context_id: string; stream_id: string; session_id: string }
): void {
  const values = [identity.context_id, identity.stream_id, identity.session_id];
  if (new Set(values).size !== values.length) identityCollision();
  const session = database.prepare(
    "SELECT id FROM sessions WHERE id IN (?, ?, ?) LIMIT 1"
  ).get(...values);
  const stream = database.prepare(
    "SELECT stream_id FROM cc_revision_streams WHERE stream_id IN (?, ?, ?) LIMIT 1"
  ).get(...values);
  const provenance = database.prepare(
    `SELECT source_session_id FROM cc_ledger_raw_events
     WHERE source_session_id IN (?, ?, ?) LIMIT 1`
  ).get(...values);
  const provision = database.prepare(
    `SELECT operation_id FROM cc_isolated_context_provisions
     WHERE context_id IN (?, ?, ?) OR stream_id IN (?, ?, ?) OR session_id IN (?, ?, ?)
     LIMIT 1`
  ).get(...values, ...values, ...values);
  if (session !== undefined || stream !== undefined || provenance !== undefined ||
      provision !== undefined) identityCollision();
}

function readOperationRow(database: DatabaseSync, operationId: string): ProvisionRow | undefined {
  return database.prepare(`${PROVISION_SELECT} WHERE operation_id = ?`).get(
    operationId
  ) as ProvisionRow | undefined;
}

function parseCanonicalObject(json: string): Record<string, unknown> {
  if (typeof json !== "string") corrupt();
  try {
    const parsed: unknown = JSON.parse(json);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) corrupt();
    if (canonicalJson(parsed) !== json) corrupt();
    return parsed as Record<string, unknown>;
  } catch (error) {
    if (error instanceof IsolatedContextProvisionerError) throw error;
    corrupt();
  }
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(normalizeJson(value));
}

function normalizeJson(value: unknown, ancestors = new Set<object>()): unknown {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value) || Object.is(value, -0)) invalid();
    return value;
  }
  if (typeof value !== "object" || isProxy(value) || ancestors.has(value)) invalid();
  const prototype = Object.getPrototypeOf(value);
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      if (prototype !== Array.prototype) invalid();
      const result: unknown[] = [];
      for (let index = 0; index < value.length; index += 1) {
        const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
        if (!descriptor?.enumerable || !("value" in descriptor)) invalid();
        result.push(normalizeJson(descriptor.value, ancestors));
      }
      for (const key of Reflect.ownKeys(value)) {
        if (key === "length") continue;
        if (typeof key !== "string" || !/^(0|[1-9][0-9]*)$/u.test(key) ||
            Number(key) >= value.length) invalid();
      }
      return result;
    }
    if (prototype !== Object.prototype && prototype !== null) invalid();
    const result: Record<string, unknown> = {};
    const keys = Reflect.ownKeys(value);
    if (keys.some((key) => typeof key !== "string")) invalid();
    for (const key of (keys as string[]).sort()) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor?.enumerable || !("value" in descriptor)) invalid();
      Object.defineProperty(result, key, {
        enumerable: true,
        configurable: true,
        writable: true,
        value: normalizeJson(descriptor.value, ancestors),
      });
    }
    return result;
  } finally {
    ancestors.delete(value);
  }
}

function readExactObject(value: unknown, expectedKeys: readonly string[]): Record<string, unknown> {
  if (typeof value !== "object" || value === null || isProxy(value) || Array.isArray(value)) invalid();
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

function validateNamespace(value: unknown): string {
  const namespace = validateIdentifier(value);
  if (
    namespace !== AUTHORITY_NAMESPACE &&
    !(namespace.startsWith(SHADOW_NAMESPACE_PREFIX) &&
      namespace.slice(SHADOW_NAMESPACE_PREFIX.length).trim().length > 0)
  ) invalid();
  return namespace;
}

function validateIdentifier(value: unknown): string {
  if (
    typeof value !== "string" || value.length === 0 ||
    value.length > MAX_IDENTIFIER_LENGTH || value.trim().length === 0 ||
    !isWellFormedUnicode(value) || value !== value.normalize("NFC") || /\p{Cc}/u.test(value)
  ) invalid();
  return value;
}

function isWellFormedUnicode(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return false;
      index += 1;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) {
      return false;
    }
  }
  return true;
}

function validTimestamp(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 100) return false;
  try { return new Date(value).toISOString() === value; } catch { return false; }
}

function fingerprint(domain: string, value: string): string {
  return createHash("sha256").update(domain).update("\0").update(value).digest("hex");
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
  if (rows.length !== expected.length || rows.some((row, index) => row.name !== expected[index])) {
    corrupt();
  }
}

function normalizeSchemaSql(sql: string): string {
  return sql.trim().replace(/\s+/gu, " ").replace(/;$/u, "");
}

function rollback(database: DatabaseSync): void {
  try { database.exec("ROLLBACK;"); } catch { /* preserve primary failure */ }
}

function mapStorageError(error: unknown): IsolatedContextProvisionerError {
  if (error instanceof IsolatedContextProvisionerError) return error;
  if (error instanceof RawHistorySchemaError) {
    return new IsolatedContextProvisionerError("CORRUPT_DATA");
  }
  if (error instanceof RevisionSubstrateError || error instanceof LedgerHotRawError) {
    if (error.code === "CORRUPT_DATA") {
      return new IsolatedContextProvisionerError("CORRUPT_DATA");
    }
    if (error.code === "CONFLICT") {
      return new IsolatedContextProvisionerError("CONCURRENT_CONFLICT");
    }
    return new IsolatedContextProvisionerError("STORAGE_UNAVAILABLE");
  }
  if (isSqliteBusyOrLocked(error)) {
    return new IsolatedContextProvisionerError("CONCURRENT_CONFLICT");
  }
  if (typeof error === "object" && error !== null) {
    const candidate = error as { code?: unknown };
    if (candidate.code === "SQLITE_CORRUPT" || candidate.code === "SQLITE_NOTADB" ||
        candidate.code === "SQLITE_SCHEMA") {
      return new IsolatedContextProvisionerError("CORRUPT_DATA");
    }
  }
  return new IsolatedContextProvisionerError("STORAGE_UNAVAILABLE");
}

function normalizePublicInput<T>(operation: () => T): T {
  try {
    return operation();
  } catch (error) {
    if (error instanceof IsolatedContextProvisionerError) throw error;
    invalid();
  }
}

function isSqliteBusyOrLocked(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const candidate = error as { code?: unknown; errcode?: unknown };
  return candidate.errcode === 5 || candidate.errcode === 6 ||
    (typeof candidate.code === "string" &&
      (candidate.code === "SQLITE_BUSY" || candidate.code.startsWith("SQLITE_BUSY_") ||
       candidate.code === "SQLITE_LOCKED" || candidate.code.startsWith("SQLITE_LOCKED_")));
}

function invalid(): never {
  throw new IsolatedContextProvisionerError("INVALID_REQUEST");
}

function unsupported(): never {
  throw new IsolatedContextProvisionerError("UNSUPPORTED_VERSION");
}

function operationCollision(): never {
  throw new IsolatedContextProvisionerError("OPERATION_COLLISION");
}

function identityCollision(): never {
  throw new IsolatedContextProvisionerError("IDENTITY_COLLISION");
}

function notFound(): never {
  throw new IsolatedContextProvisionerError("NOT_FOUND");
}

function legacy(): never {
  throw new IsolatedContextProvisionerError("LEGACY_STORAGE");
}

function corrupt(): never {
  throw new IsolatedContextProvisionerError("CORRUPT_DATA");
}
