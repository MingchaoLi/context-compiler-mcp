import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { initializeSqliteConnection } from "./sqlite-initialization.js";
import type { JsonValue } from "./raw-store.js";
import {
  AUTHORITY_NAMESPACE,
  SHADOW_NAMESPACE_PREFIX,
  RevisionSubstrateError,
  SqliteRevisionSubstrate,
  commitLedgerRevisionInsideCore,
  type RevisionScope,
  type RevisionVector,
} from "./revision-substrate.js";

export const LEDGER_HOT_RAW_SCHEMA_VERSION = 1;
export const RAW_SOURCE_KINDS = [
  "user_input",
  "tool_result",
  "file",
  "external_observation",
] as const;

export type RawSourceKind = (typeof RAW_SOURCE_KINDS)[number];
export type LedgerHotRawErrorCode =
  | "INVALID_INPUT"
  | "CONFLICT"
  | "STORAGE_FAILURE"
  | "CORRUPT_DATA"
  | "CLOSED";

export interface RawSourceProjectionInput {
  scope: RevisionScope;
  event_id: string;
  source_kind: RawSourceKind;
  source_id: string;
  source_session_id?: string;
  payload: JsonValue;
  occurred_at?: string;
}

export interface LedgerRawEvent extends RevisionScope {
  ledger_revision: number;
  event_id: string;
  source_kind: RawSourceKind;
  source_id: string;
  source_session_id?: string;
  payload: JsonValue;
  occurred_at?: string;
  created_at: string;
}

export interface HotRawProjection extends RevisionScope {
  ledger_high_water: number;
  revision_vector: RevisionVector;
  events: LedgerRawEvent[];
}

export class LedgerHotRawError extends Error {
  constructor(readonly code: LedgerHotRawErrorCode) {
    super(code);
    this.name = "LedgerHotRawError";
  }
}

interface NormalizedRawSourceInput {
  scope: RevisionScope;
  event_id: string;
  source_kind: RawSourceKind;
  source_id: string;
  source_session_id?: string;
  payload: JsonValue;
  occurred_at?: string;
  request: Record<string, JsonValue>;
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

interface EventRow extends Record<string, unknown> {
  namespace: string;
  stream_id: string;
  ledger_revision: number;
  event_id: string;
  source_kind: string;
  source_id: string;
  source_session_id: string | null;
  payload_json: string;
  occurred_at: string | null;
  created_at: string;
}

const MAX_SCOPE_IDENTIFIER_LENGTH = 500;
const MAX_EVENT_ID_LENGTH = 500;
const MAX_SOURCE_ID_LENGTH = 2000;
const MAX_SAFE_REVISION = Number.MAX_SAFE_INTEGER;

const HOT_RAW_SCHEMA_OBJECTS = [
  {
    type: "table",
    name: "cc_ledger_hot_raw_schema",
    sql: `CREATE TABLE cc_ledger_hot_raw_schema (
      version INTEGER PRIMARY KEY CHECK (version > 0),
      completed_at TEXT NOT NULL
    )`,
  },
  {
    type: "table",
    name: "cc_ledger_raw_events",
    sql: `CREATE TABLE cc_ledger_raw_events (
      namespace TEXT NOT NULL,
      stream_id TEXT NOT NULL,
      ledger_revision INTEGER NOT NULL CHECK (
        ledger_revision > 0 AND ledger_revision <= 9007199254740991
      ),
      event_id TEXT NOT NULL CHECK (length(event_id) > 0 AND length(event_id) <= 500),
      source_kind TEXT NOT NULL CHECK (
        source_kind IN ('user_input','tool_result','file','external_observation')
      ),
      source_id TEXT NOT NULL CHECK (length(source_id) > 0 AND length(source_id) <= 2000),
      source_session_id TEXT,
      payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
      occurred_at TEXT,
      created_at TEXT NOT NULL,
      PRIMARY KEY (namespace, stream_id, ledger_revision),
      UNIQUE (namespace, stream_id, event_id),
      FOREIGN KEY (namespace, stream_id)
        REFERENCES cc_revision_streams(namespace, stream_id)
    )`,
  },
  {
    type: "trigger",
    name: "cc_ledger_raw_events_no_update",
    sql: `CREATE TRIGGER cc_ledger_raw_events_no_update
      BEFORE UPDATE ON cc_ledger_raw_events
      BEGIN
        SELECT RAISE(ABORT, 'ledger raw events are immutable');
      END`,
  },
  {
    type: "trigger",
    name: "cc_ledger_raw_events_no_delete",
    sql: `CREATE TRIGGER cc_ledger_raw_events_no_delete
      BEFORE DELETE ON cc_ledger_raw_events
      BEGIN
        SELECT RAISE(ABORT, 'ledger raw events are append-only');
      END`,
  },
  {
    type: "trigger",
    name: "cc_ledger_hot_raw_schema_no_update",
    sql: `CREATE TRIGGER cc_ledger_hot_raw_schema_no_update
      BEFORE UPDATE ON cc_ledger_hot_raw_schema
      BEGIN
        SELECT RAISE(ABORT, 'ledger hot raw schema markers are immutable');
      END`,
  },
  {
    type: "trigger",
    name: "cc_ledger_hot_raw_schema_no_delete",
    sql: `CREATE TRIGGER cc_ledger_hot_raw_schema_no_delete
      BEFORE DELETE ON cc_ledger_hot_raw_schema
      BEGIN
        SELECT RAISE(ABORT, 'ledger hot raw schema markers are append-only');
      END`,
  },
] as const;

/** @internal Core-owned canonical Raw Event projection and Hot Raw reader. */
export class SqliteLedgerHotRawStore {
  readonly #database: DatabaseSync;
  readonly #revisionSubstrate: SqliteRevisionSubstrate;
  #closed = false;

  constructor(databasePath: string, revisionSubstrate: SqliteRevisionSubstrate) {
    if (typeof databasePath !== "string" || databasePath.length === 0) invalid();
    if (!(revisionSubstrate instanceof SqliteRevisionSubstrate)) invalid();
    let database: DatabaseSync | undefined;
    try {
      if (databasePath !== ":memory:") mkdirSync(dirname(databasePath), { recursive: true });
      database = new DatabaseSync(databasePath);
      initializeSqliteConnection(database, databasePath, () => {
        migrateLedgerHotRaw(database!);
      });
      this.#database = database;
      this.#revisionSubstrate = revisionSubstrate;
    } catch (error) {
      try { database?.close(); } catch { /* preserve stable constructor failure */ }
      if (error instanceof LedgerHotRawError && error.code === "INVALID_INPUT") throw error;
      throw new LedgerHotRawError("STORAGE_FAILURE");
    }
  }

  append(input: RawSourceProjectionInput): LedgerRawEvent {
    this.#assertOpen();
    const normalized = normalizeRawSourceInput(input);
    try {
      const record = commitLedgerRevisionInsideCore(
        this.#revisionSubstrate,
        {
          scope: normalized.scope,
          commit_id: normalized.event_id,
          kind: "RAW_EVENT_APPEND",
          request: normalized.request,
        },
        ({ current, database }) => {
          const duplicate = database.prepare(
            `SELECT event_id FROM cc_ledger_raw_events
             WHERE namespace = ? AND stream_id = ? AND event_id = ?`
          ).get(
            normalized.scope.namespace,
            normalized.scope.stream_id,
            normalized.event_id
          ) as { event_id: string } | undefined;
          if (duplicate !== undefined) conflict();
          const event: LedgerRawEvent = {
            ...normalized.scope,
            ledger_revision: current.ledger_revision,
            event_id: normalized.event_id,
            source_kind: normalized.source_kind,
            source_id: normalized.source_id,
            ...(normalized.source_session_id === undefined
              ? {}
              : { source_session_id: normalized.source_session_id }),
            payload: cloneJson(normalized.payload),
            ...(normalized.occurred_at === undefined
              ? {}
              : { occurred_at: normalized.occurred_at }),
            created_at: new Date().toISOString(),
          };
          database.prepare(
            `INSERT INTO cc_ledger_raw_events (
               namespace, stream_id, ledger_revision, event_id, source_kind,
               source_id, source_session_id, payload_json, occurred_at, created_at
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          ).run(
            event.namespace,
            event.stream_id,
            event.ledger_revision,
            event.event_id,
            event.source_kind,
            event.source_id,
            event.source_session_id ?? null,
            canonicalJson(event.payload),
            event.occurred_at ?? null,
            event.created_at
          );
          return event as unknown as JsonValue;
        }
      );
      const replayed = parseEventValue(record.result);
      const persisted = this.#readEventById(replayed, replayed.event_id);
      if (persisted === undefined || canonicalJson(eventAsJson(persisted)) !==
          canonicalJson(eventAsJson(replayed))) corrupt();
      return persisted;
    } catch (error) {
      throw mapMutationError(error);
    }
  }

  rebuild(scope: RevisionScope): HotRawProjection {
    this.#assertOpen();
    const normalizedScope = normalizeScope(scope);
    try {
      this.#database.exec("BEGIN;");
      const stream = this.#database.prepare(
        `SELECT namespace, stream_id, ledger_revision, state_revision,
                raw_frontier_revision, frontier_position, takeover_commit_revision
         FROM cc_revision_streams
         WHERE namespace = ? AND stream_id = ?`
      ).get(normalizedScope.namespace, normalizedScope.stream_id) as StreamRow | undefined;
      const vector = stream === undefined
        ? zeroVector(normalizedScope)
        : vectorFromRow(stream, normalizedScope);
      const rows = this.#database.prepare(
        `SELECT namespace, stream_id, ledger_revision, event_id, source_kind,
                source_id, source_session_id, payload_json, occurred_at, created_at
         FROM cc_ledger_raw_events
         WHERE namespace = ? AND stream_id = ?
           AND ledger_revision > ? AND ledger_revision <= ?
         ORDER BY ledger_revision ASC`
      ).all(
        normalizedScope.namespace,
        normalizedScope.stream_id,
        vector.frontier_position,
        vector.ledger_revision
      ) as EventRow[];
      const events = rows.map((row) => eventFromRow(row, normalizedScope));
      assertHotRawRange(events, vector);
      this.#database.exec("COMMIT;");
      return {
        ...normalizedScope,
        ledger_high_water: vector.ledger_revision,
        revision_vector: vector,
        events,
      };
    } catch (error) {
      rollback(this.#database);
      if (error instanceof LedgerHotRawError) throw error;
      throw new LedgerHotRawError("STORAGE_FAILURE");
    }
  }

  close(): void {
    if (this.#closed) return;
    try {
      this.#database.close();
      this.#closed = true;
    } catch {
      throw new LedgerHotRawError("STORAGE_FAILURE");
    }
  }

  #readEventById(scope: RevisionScope, eventId: string): LedgerRawEvent | undefined {
    const row = this.#database.prepare(
      `SELECT namespace, stream_id, ledger_revision, event_id, source_kind,
              source_id, source_session_id, payload_json, occurred_at, created_at
       FROM cc_ledger_raw_events
       WHERE namespace = ? AND stream_id = ? AND event_id = ?`
    ).get(scope.namespace, scope.stream_id, eventId) as EventRow | undefined;
    if (row === undefined) return undefined;
    return eventFromRow(row, { namespace: row.namespace, stream_id: row.stream_id });
  }

  #assertOpen(): void {
    if (this.#closed) throw new LedgerHotRawError("CLOSED");
  }
}

/** @internal Reads the exact Frontier-bound Hot Raw range on a caller-owned snapshot. */
export function readLedgerHotRawInsideCore(
  database: DatabaseSync,
  scopeValue: RevisionScope,
  observedValue: RevisionVector
): HotRawProjection {
  const scope = normalizeScope(scopeValue);
  const observed = vectorFromRow({
    namespace: observedValue.namespace,
    stream_id: observedValue.stream_id,
    ledger_revision: observedValue.ledger_revision,
    state_revision: observedValue.state_revision,
    raw_frontier_revision: observedValue.raw_frontier_revision,
    frontier_position: observedValue.frontier_position,
    takeover_commit_revision: observedValue.takeover_commit_revision,
  }, scope);
  const row = database.prepare(
    `SELECT namespace, stream_id, ledger_revision, state_revision,
            raw_frontier_revision, frontier_position, takeover_commit_revision
     FROM cc_revision_streams
     WHERE namespace = ? AND stream_id = ?`
  ).get(scope.namespace, scope.stream_id) as StreamRow | undefined;
  if (row === undefined || !vectorAtOrAfter(vectorFromRow(row, scope), observed)) conflict();
  const rows = database.prepare(
    `SELECT namespace, stream_id, ledger_revision, event_id, source_kind,
            source_id, source_session_id, payload_json, occurred_at, created_at
     FROM cc_ledger_raw_events
     WHERE namespace = ? AND stream_id = ?
       AND ledger_revision > ? AND ledger_revision <= ?
     ORDER BY ledger_revision ASC`
  ).all(
    scope.namespace,
    scope.stream_id,
    observed.frontier_position,
    observed.ledger_revision
  ) as EventRow[];
  const events = rows.map((eventRow) => eventFromRow(eventRow, scope));
  assertHotRawRange(events, observed);
  if (events.length !== observed.ledger_revision - observed.frontier_position ||
      events.some((event, index) =>
        event.ledger_revision !== observed.frontier_position + index + 1)) {
    corrupt();
  }
  return {
    ...scope,
    ledger_high_water: observed.ledger_revision,
    revision_vector: { ...observed },
    events,
  };
}

/** @internal Reads exact same-scope Raw Events no later than one frozen Ledger revision. */
export function readLedgerRawEventsInsideCore(
  database: DatabaseSync,
  scopeValue: RevisionScope,
  eventIdsValue: readonly string[],
  ledgerAsOfValue: number
): LedgerRawEvent[] {
  const scope = normalizeScope(scopeValue);
  const ledgerAsOf = storedRevision(ledgerAsOfValue);
  const eventIds = eventIdsValue.map((eventId) =>
    validateIdentifier(eventId, MAX_EVENT_ID_LENGTH)).sort();
  for (let index = 1; index < eventIds.length; index += 1) {
    if (eventIds[index - 1] === eventIds[index]) invalid();
  }
  const events = eventIds.map((eventId) => {
    const row = database.prepare(
      `SELECT namespace, stream_id, ledger_revision, event_id, source_kind,
              source_id, source_session_id, payload_json, occurred_at, created_at
       FROM cc_ledger_raw_events
       WHERE namespace = ? AND stream_id = ? AND event_id = ?`
    ).get(scope.namespace, scope.stream_id, eventId) as EventRow | undefined;
    if (row === undefined) conflict();
    const event = eventFromRow(row, scope);
    if (event.ledger_revision > ledgerAsOf) conflict();
    return event;
  });
  return events.sort((left, right) =>
    left.ledger_revision - right.ledger_revision ||
    (left.event_id < right.event_id ? -1 : left.event_id > right.event_id ? 1 : 0));
}

export function migrateLedgerHotRaw(database: DatabaseSync): void {
  database.exec("BEGIN IMMEDIATE;");
  try {
    migrateLedgerHotRawInsideTransaction(database);
    database.exec("COMMIT;");
  } catch (error) {
    rollback(database);
    throw error;
  }
}

/** @internal Caller owns the surrounding SQLite write transaction. */
export function migrateLedgerHotRawInsideTransaction(database: DatabaseSync): void {
  try {
    if (sqliteObjectExists(database, "table", "cc_ledger_hot_raw_schema")) {
      validateLedgerHotRawSchema(database);
      return;
    }
    for (const object of HOT_RAW_SCHEMA_OBJECTS.slice(1)) {
      if (sqliteObjectExists(database, object.type, object.name)) corrupt();
    }
    database.exec(HOT_RAW_SCHEMA_OBJECTS.map(({ sql }) => `${sql};`).join("\n"));
    validateHotRawSchemaObjects(database);
    database.prepare(
      "INSERT INTO cc_ledger_hot_raw_schema (version, completed_at) VALUES (?, ?)"
    ).run(LEDGER_HOT_RAW_SCHEMA_VERSION, new Date().toISOString());
    assertCurrentSchemaVersion(database);
  } catch (error) {
    throw error;
  }
}

/** @internal Exact live schema, trigger, constraint and version proof for Core composition. */
export function validateLedgerHotRawSchema(database: DatabaseSync): void {
  validateHotRawSchemaObjects(database);
  assertCurrentSchemaVersion(database);
}

function normalizeRawSourceInput(value: unknown): NormalizedRawSourceInput {
  const input = readExactObject(value, [
    "scope", "event_id", "source_kind", "source_id", "source_session_id",
    "payload", "occurred_at",
  ], ["scope", "event_id", "source_kind", "source_id", "payload"]);
  const scope = normalizeScope(input.scope);
  const eventId = validateIdentifier(input.event_id, MAX_EVENT_ID_LENGTH);
  const sourceKind = input.source_kind;
  if (typeof sourceKind !== "string" ||
      !RAW_SOURCE_KINDS.includes(sourceKind as RawSourceKind)) invalid();
  const sourceId = validateIdentifier(input.source_id, MAX_SOURCE_ID_LENGTH);
  const sourceSessionId = input.source_session_id === undefined
    ? undefined
    : validateIdentifier(input.source_session_id, MAX_SCOPE_IDENTIFIER_LENGTH);
  const payload = normalizeJsonValue(input.payload);
  const occurredAt = input.occurred_at === undefined
    ? undefined
    : validateTimestamp(input.occurred_at);
  const request: Record<string, JsonValue> = {
    source_kind: sourceKind as RawSourceKind,
    source_id: sourceId,
    ...(sourceSessionId === undefined ? {} : { source_session_id: sourceSessionId }),
    payload,
    ...(occurredAt === undefined ? {} : { occurred_at: occurredAt }),
  };
  return {
    scope,
    event_id: eventId,
    source_kind: sourceKind as RawSourceKind,
    source_id: sourceId,
    ...(sourceSessionId === undefined ? {} : { source_session_id: sourceSessionId }),
    payload,
    ...(occurredAt === undefined ? {} : { occurred_at: occurredAt }),
    request,
  };
}

function normalizeScope(value: unknown): RevisionScope {
  const scope = readExactObject(value, ["namespace", "stream_id"], ["namespace", "stream_id"]);
  const namespace = validateIdentifier(scope.namespace, MAX_SCOPE_IDENTIFIER_LENGTH);
  if (
    namespace !== AUTHORITY_NAMESPACE &&
    !(namespace.startsWith(SHADOW_NAMESPACE_PREFIX) &&
      namespace.slice(SHADOW_NAMESPACE_PREFIX.length).trim().length > 0)
  ) invalid();
  return {
    namespace,
    stream_id: validateIdentifier(scope.stream_id, MAX_SCOPE_IDENTIFIER_LENGTH),
  };
}

function validateIdentifier(value: unknown, maximum: number): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > maximum ||
    value.trim().length === 0 ||
    value !== value.normalize("NFC") ||
    /\p{Cc}/u.test(value)
  ) invalid();
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

function readExactObject(
  value: unknown,
  allowedKeys: readonly string[],
  requiredKeys: readonly string[]
): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) invalid();
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) invalid();
  const allowed = new Set(allowedKeys);
  const keys = Reflect.ownKeys(value);
  for (const key of keys) {
    if (typeof key !== "string" || !allowed.has(key)) invalid();
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor?.enumerable || !("value" in descriptor)) invalid();
  }
  for (const required of requiredKeys) {
    if (!Object.prototype.hasOwnProperty.call(value, required)) invalid();
  }
  return value as Record<string, unknown>;
}

function normalizeJsonValue(value: unknown, ancestors = new Set<object>()): JsonValue {
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
      const result: JsonValue[] = [];
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
        result.push(normalizeJsonValue(value[index], ancestors));
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
        value: normalizeJsonValue(descriptor.value, ancestors),
      });
    }
    return result;
  } finally {
    ancestors.delete(value);
  }
}

function canonicalJson(value: JsonValue): string {
  return JSON.stringify(normalizeJsonValue(value));
}

function cloneJson(value: JsonValue): JsonValue {
  return normalizeJsonValue(value);
}

function parseStoredJson(json: string): JsonValue {
  try {
    const value = normalizeJsonValue(JSON.parse(json));
    if (canonicalJson(value) !== json) corrupt();
    return value;
  } catch (error) {
    if (error instanceof LedgerHotRawError && error.code === "CORRUPT_DATA") throw error;
    corrupt();
  }
}

function eventFromRow(row: EventRow, expectedScope: RevisionScope): LedgerRawEvent {
  const scope = storedScope(row.namespace, row.stream_id);
  if (scope.namespace !== expectedScope.namespace || scope.stream_id !== expectedScope.stream_id) {
    corrupt();
  }
  const sourceKind = row.source_kind;
  if (!RAW_SOURCE_KINDS.includes(sourceKind as RawSourceKind)) corrupt();
  const sourceSessionId = row.source_session_id === null
    ? undefined
    : storedIdentifier(row.source_session_id, MAX_SCOPE_IDENTIFIER_LENGTH);
  const occurredAt = row.occurred_at === null ? undefined : storedTimestamp(row.occurred_at);
  return {
    ...scope,
    ledger_revision: storedRevision(row.ledger_revision, true),
    event_id: storedIdentifier(row.event_id, MAX_EVENT_ID_LENGTH),
    source_kind: sourceKind as RawSourceKind,
    source_id: storedIdentifier(row.source_id, MAX_SOURCE_ID_LENGTH),
    ...(sourceSessionId === undefined ? {} : { source_session_id: sourceSessionId }),
    payload: parseStoredJson(row.payload_json),
    ...(occurredAt === undefined ? {} : { occurred_at: occurredAt }),
    created_at: storedTimestamp(row.created_at),
  };
}

function parseEventValue(value: JsonValue): LedgerRawEvent {
  try {
    const object = readExactObject(value, [
      "namespace", "stream_id", "ledger_revision", "event_id", "source_kind",
      "source_id", "source_session_id", "payload", "occurred_at", "created_at",
    ], [
      "namespace", "stream_id", "ledger_revision", "event_id", "source_kind",
      "source_id", "payload", "created_at",
    ]);
    return eventFromRow({
      namespace: storedString(object.namespace),
      stream_id: storedString(object.stream_id),
      ledger_revision: storedNumber(object.ledger_revision),
      event_id: storedString(object.event_id),
      source_kind: storedString(object.source_kind),
      source_id: storedString(object.source_id),
      source_session_id: object.source_session_id === undefined
        ? null
        : storedString(object.source_session_id),
      payload_json: canonicalJson(object.payload as JsonValue),
      occurred_at: object.occurred_at === undefined ? null : storedString(object.occurred_at),
      created_at: storedString(object.created_at),
    }, {
      namespace: storedString(object.namespace),
      stream_id: storedString(object.stream_id),
    });
  } catch {
    corrupt();
  }
}

function eventAsJson(event: LedgerRawEvent): JsonValue {
  return {
    namespace: event.namespace,
    stream_id: event.stream_id,
    ledger_revision: event.ledger_revision,
    event_id: event.event_id,
    source_kind: event.source_kind,
    source_id: event.source_id,
    ...(event.source_session_id === undefined ? {} : { source_session_id: event.source_session_id }),
    payload: event.payload,
    ...(event.occurred_at === undefined ? {} : { occurred_at: event.occurred_at }),
    created_at: event.created_at,
  };
}

function vectorFromRow(row: StreamRow, expectedScope: RevisionScope): RevisionVector {
  const scope = storedScope(row.namespace, row.stream_id);
  if (scope.namespace !== expectedScope.namespace || scope.stream_id !== expectedScope.stream_id) {
    corrupt();
  }
  const vector: RevisionVector = {
    ...scope,
    ledger_revision: storedRevision(row.ledger_revision),
    state_revision: storedRevision(row.state_revision),
    raw_frontier_revision: storedRevision(row.raw_frontier_revision),
    frontier_position: storedRevision(row.frontier_position),
    takeover_commit_revision: storedRevision(row.takeover_commit_revision),
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

function vectorAtOrAfter(live: RevisionVector, historical: RevisionVector): boolean {
  return live.namespace === historical.namespace && live.stream_id === historical.stream_id &&
    live.ledger_revision >= historical.ledger_revision &&
    live.state_revision >= historical.state_revision &&
    live.raw_frontier_revision >= historical.raw_frontier_revision &&
    live.frontier_position >= historical.frontier_position &&
    live.takeover_commit_revision >= historical.takeover_commit_revision;
}

function assertHotRawRange(events: LedgerRawEvent[], vector: RevisionVector): void {
  let previous = vector.frontier_position;
  for (const event of events) {
    if (
      event.namespace !== vector.namespace ||
      event.stream_id !== vector.stream_id ||
      event.ledger_revision <= vector.frontier_position ||
      event.ledger_revision > vector.ledger_revision ||
      event.ledger_revision <= previous
    ) corrupt();
    previous = event.ledger_revision;
  }
}

function storedScope(namespace: unknown, streamId: unknown): RevisionScope {
  try {
    return normalizeScope({ namespace, stream_id: streamId });
  } catch {
    corrupt();
  }
}

function storedIdentifier(value: unknown, maximum: number): string {
  try {
    return validateIdentifier(value, maximum);
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

function storedRevision(value: unknown, positive = false): number {
  if (!Number.isSafeInteger(value) || (value as number) < (positive ? 1 : 0) ||
      (value as number) > MAX_SAFE_REVISION) corrupt();
  return value as number;
}

function storedString(value: unknown): string {
  if (typeof value !== "string") corrupt();
  return value;
}

function storedNumber(value: unknown): number {
  if (typeof value !== "number") corrupt();
  return value;
}

function validateHotRawSchemaObjects(database: DatabaseSync): void {
  assertTableColumns(database, "cc_ledger_hot_raw_schema", ["version", "completed_at"]);
  assertTableColumns(database, "cc_ledger_raw_events", [
    "namespace", "stream_id", "ledger_revision", "event_id", "source_kind",
    "source_id", "source_session_id", "payload_json", "occurred_at", "created_at",
  ]);
  for (const expected of HOT_RAW_SCHEMA_OBJECTS) {
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
    ) corrupt();
  }
}

function assertCurrentSchemaVersion(database: DatabaseSync): void {
  const rows = database.prepare(
    "SELECT version FROM cc_ledger_hot_raw_schema ORDER BY version"
  ).all() as Array<{ version: number }>;
  if (rows.length !== 1 || rows[0]?.version !== LEDGER_HOT_RAW_SCHEMA_VERSION) corrupt();
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

function mapMutationError(error: unknown): LedgerHotRawError {
  if (error instanceof LedgerHotRawError) return error;
  if (error instanceof RevisionSubstrateError) {
    switch (error.code) {
      case "INVALID_INPUT": return new LedgerHotRawError("INVALID_INPUT");
      case "CONFLICT": return new LedgerHotRawError("CONFLICT");
      case "CORRUPT_DATA": return new LedgerHotRawError("CORRUPT_DATA");
      case "CLOSED": return new LedgerHotRawError("CLOSED");
      case "STORAGE_FAILURE": return new LedgerHotRawError("STORAGE_FAILURE");
    }
  }
  return new LedgerHotRawError("STORAGE_FAILURE");
}

function rollback(database: DatabaseSync): void {
  try { database.exec("ROLLBACK;"); } catch { /* preserve primary failure */ }
}

function invalid(): never {
  throw new LedgerHotRawError("INVALID_INPUT");
}

function conflict(): never {
  throw new LedgerHotRawError("CONFLICT");
}

function corrupt(): never {
  throw new LedgerHotRawError("CORRUPT_DATA");
}
