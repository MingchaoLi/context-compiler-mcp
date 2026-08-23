import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { JsonObject, JsonValue, RawEvent, RawEventRole } from "./raw-store.js";

export const EXPERIENCE_LEDGER_KINDS = [
  "EVENT",
  "ACTION",
  "OUTCOME",
  "FEEDBACK",
  "CANDIDATE_EXPERIENCE",
  "CONTEXT_COMPILE",
  "RETRIEVAL_HIT",
] as const;

export type ExperienceLedgerKind = (typeof EXPERIENCE_LEDGER_KINDS)[number];

export interface ExperienceLedgerInput {
  session_id: string;
  kind: ExperienceLedgerKind;
  source_key: string;
  payload: JsonObject;
  occurred_at?: string;
  raw_event_ids?: string[];
  parent_ledger_ids?: string[];
}

export interface ExperienceLedgerRecord {
  id: string;
  session_id: string;
  seq: number;
  kind: ExperienceLedgerKind;
  occurred_at: string;
  source_key: string;
  raw_event_ids: string[];
  parent_ledger_ids: string[];
  payload: JsonObject;
}

export type ExperienceLedgerErrorCode =
  | "INVALID_INPUT"
  | "CONFLICT"
  | "NOT_FOUND"
  | "CLOSED";

export class ExperienceLedgerError extends Error {
  constructor(readonly code: ExperienceLedgerErrorCode, message: string) {
    super(message);
    this.name = "ExperienceLedgerError";
  }
}

export interface ExperienceLedgerStore {
  append(input: ExperienceLedgerInput): ExperienceLedgerRecord;
  getRecord(id: string): ExperienceLedgerRecord | undefined;
  getSessionRecords(sessionId: string): ExperienceLedgerRecord[];
  close(): void;
}

/**
 * Append-only research ledger for replayable Event -> Action -> Outcome / Feedback data.
 * It deliberately performs no Experience extraction, scoring, promotion, or mutation.
 */
export class SqliteExperienceLedgerStore implements ExperienceLedgerStore {
  private readonly database: DatabaseSync;
  private closed = false;

  constructor(databasePath: string) {
    if (typeof databasePath !== "string" || databasePath.length === 0) {
      throw new ExperienceLedgerError("INVALID_INPUT", "databasePath must not be empty");
    }
    if (databasePath !== ":memory:") mkdirSync(dirname(databasePath), { recursive: true });

    this.database = new DatabaseSync(databasePath);
    configureDatabase(this.database, databasePath);
    migrateExperienceLedger(this.database);
  }

  append(input: ExperienceLedgerInput): ExperienceLedgerRecord {
    this.assertOpen();
    const normalized = normalizeInput(input);

    this.database.exec("BEGIN IMMEDIATE;");
    try {
      const record = appendExperienceLedgerRecord(this.database, normalized);
      this.database.exec("COMMIT;");
      return record;
    } catch (error) {
      rollback(this.database);
      throw error;
    }
  }

  getRecord(id: string): ExperienceLedgerRecord | undefined {
    this.assertOpen();
    validateNonEmptyString(id, "ledger id");
    const row = this.database
      .prepare("SELECT * FROM experience_ledger WHERE id = ?")
      .get(id) as LedgerRow | undefined;
    return row ? rowToRecord(row) : undefined;
  }

  getSessionRecords(sessionId: string): ExperienceLedgerRecord[] {
    this.assertOpen();
    validateNonEmptyString(sessionId, "session_id");
    const rows = this.database
      .prepare("SELECT * FROM experience_ledger WHERE session_id = ? ORDER BY seq ASC")
      .all(sessionId) as LedgerRow[];
    return rows.map(rowToRecord);
  }

  close(): void {
    if (this.closed) return;
    this.database.close();
    this.closed = true;
  }

  private assertOpen(): void {
    if (this.closed) throw new ExperienceLedgerError("CLOSED", "Experience ledger is closed");
  }
}

interface NormalizedLedgerInput {
  session_id: string;
  kind: ExperienceLedgerKind;
  source_key: string;
  occurred_at?: string;
  raw_event_ids: string[];
  parent_ledger_ids: string[];
  payload: JsonObject;
  payload_json: string;
}

interface LedgerRow extends Record<string, unknown> {
  id: string;
  session_id: string;
  seq: number;
  kind: ExperienceLedgerKind;
  occurred_at: string;
  source_key: string;
  raw_event_ids_json: string;
  parent_ledger_ids_json: string;
  payload_json: string;
}

interface RawEventRow extends Record<string, unknown> {
  id: string;
  session_id: string;
  seq: number;
  source_event_id: string | null;
  role: RawEventRole;
  content: string;
  event_type: string;
  created_at: string;
  token_count: number;
  metadata_json: string;
}

const RAW_EVENT_SOURCE_PREFIX = "raw-event/";

/** Internal shared migration used by both ledger and raw stores. */
export function migrateExperienceLedger(database: DatabaseSync): void {
  database.exec("BEGIN IMMEDIATE;");
  try {
    database.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY CHECK (length(id) > 0),
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS experience_ledger (
        id TEXT PRIMARY KEY CHECK (length(id) > 0),
        session_id TEXT NOT NULL REFERENCES sessions(id),
        seq INTEGER NOT NULL CHECK (seq > 0),
        kind TEXT NOT NULL CHECK (kind IN (
          'EVENT', 'ACTION', 'OUTCOME', 'FEEDBACK', 'CANDIDATE_EXPERIENCE',
          'CONTEXT_COMPILE', 'RETRIEVAL_HIT'
        )),
        occurred_at TEXT NOT NULL,
        source_key TEXT NOT NULL CHECK (length(source_key) > 0),
        raw_event_ids_json TEXT NOT NULL DEFAULT '[]'
          CHECK (json_valid(raw_event_ids_json) AND json_type(raw_event_ids_json) = 'array'),
        parent_ledger_ids_json TEXT NOT NULL DEFAULT '[]'
          CHECK (json_valid(parent_ledger_ids_json) AND json_type(parent_ledger_ids_json) = 'array'),
        payload_json TEXT NOT NULL DEFAULT '{}'
          CHECK (json_valid(payload_json) AND json_type(payload_json) = 'object'),
        UNIQUE (session_id, seq),
        UNIQUE (session_id, source_key)
      );

      CREATE INDEX IF NOT EXISTS idx_experience_ledger_session_seq
        ON experience_ledger(session_id, seq);

      CREATE TRIGGER IF NOT EXISTS experience_ledger_prevent_update
      BEFORE UPDATE ON experience_ledger
      BEGIN
        SELECT RAISE(ABORT, 'experience_ledger is append-only');
      END;

      CREATE TRIGGER IF NOT EXISTS experience_ledger_prevent_delete
      BEFORE DELETE ON experience_ledger
      BEGIN
        SELECT RAISE(ABORT, 'experience_ledger is append-only');
      END;
    `);

    const rawTable = database
      .prepare("SELECT 1 AS present FROM sqlite_master WHERE type = 'table' AND name = 'raw_events'")
      .get() as { present: number } | undefined;
    if (rawTable) {
      const rows = database
        .prepare("SELECT * FROM raw_events ORDER BY session_id, seq, id")
        .all() as RawEventRow[];
      for (const row of rows) {
        const event = rawRowToEvent(row);
        const existing = findBySourceKey(database, event.session_id, rawMirrorSourceKey(event.id));
        if (existing) {
          assertRawMirrorCompatible(existing, event);
        } else {
          appendRawEventMirrorInsideTransaction(database, event, true);
        }
      }
    }
    database.exec("COMMIT;");
  } catch (error) {
    rollback(database);
    throw error;
  }
}

/** Internal raw-store hook. The caller must own the current SQLite transaction. */
export function appendRawEventMirrorInsideTransaction(
  database: DatabaseSync,
  event: RawEvent,
  migrationBackfill: boolean
): ExperienceLedgerRecord {
  const normalized = normalizeInput({
    session_id: event.session_id,
    kind: "EVENT",
    source_key: rawMirrorSourceKey(event.id),
    occurred_at: event.created_at,
    raw_event_ids: [event.id],
    parent_ledger_ids: [],
    payload: rawMirrorPayload(event, migrationBackfill),
  }, true);
  return appendExperienceLedgerRecord(database, normalized, rawMirrorId(event.id));
}

/** Internal raw-store retry guard. It accepts either migration or live mirrors. */
export function assertRawEventMirrorInsideTransaction(
  database: DatabaseSync,
  event: RawEvent
): ExperienceLedgerRecord {
  const row = findBySourceKey(database, event.session_id, rawMirrorSourceKey(event.id));
  if (!row) throw new Error(`Raw event ${event.id} is missing its EVENT ledger mirror`);
  assertRawMirrorCompatible(row, event);
  return rowToRecord(row);
}

function appendExperienceLedgerRecord(
  database: DatabaseSync,
  input: NormalizedLedgerInput,
  fixedId?: string
): ExperienceLedgerRecord {
  const existing = findBySourceKey(database, input.session_id, input.source_key);
  if (existing) {
    assertCompatibleRetry(existing, input);
    return rowToRecord(existing);
  }

  requireReferences(database, input);
  const occurredAt = input.occurred_at ?? new Date().toISOString();
  database
    .prepare("INSERT OR IGNORE INTO sessions (id, created_at) VALUES (?, ?)")
    .run(input.session_id, occurredAt);
  const next = database
    .prepare(
      "SELECT COALESCE(MAX(seq), 0) + 1 AS next_seq FROM experience_ledger WHERE session_id = ?"
    )
    .get(input.session_id) as { next_seq: number };
  const id = fixedId ?? randomUUID();
  database
    .prepare(
      `INSERT INTO experience_ledger (
         id, session_id, seq, kind, occurred_at, source_key,
         raw_event_ids_json, parent_ledger_ids_json, payload_json
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      id,
      input.session_id,
      next.next_seq,
      input.kind,
      occurredAt,
      input.source_key,
      JSON.stringify(input.raw_event_ids),
      JSON.stringify(input.parent_ledger_ids),
      input.payload_json
    );
  const inserted = database
    .prepare("SELECT * FROM experience_ledger WHERE id = ?")
    .get(id) as LedgerRow | undefined;
  if (!inserted) throw new Error("Experience ledger insert did not produce a readable row");
  return rowToRecord(inserted);
}

function requireReferences(database: DatabaseSync, input: NormalizedLedgerInput): void {
  for (const rawEventId of input.raw_event_ids) {
    const raw = database
      .prepare("SELECT 1 AS present FROM raw_events WHERE id = ? AND session_id = ?")
      .get(rawEventId, input.session_id) as { present: number } | undefined;
    if (!raw) {
      throw new ExperienceLedgerError(
        "NOT_FOUND",
        `Raw event ${rawEventId} does not exist in session ${input.session_id}`
      );
    }
  }
  for (const parentId of input.parent_ledger_ids) {
    const parent = database
      .prepare("SELECT 1 AS present FROM experience_ledger WHERE id = ? AND session_id = ?")
      .get(parentId, input.session_id) as { present: number } | undefined;
    if (!parent) {
      throw new ExperienceLedgerError(
        "NOT_FOUND",
        `Parent ledger record ${parentId} does not exist in session ${input.session_id}`
      );
    }
  }
}

function normalizeInput(input: ExperienceLedgerInput, rawMirror = false): NormalizedLedgerInput {
  if (!isPlainObject(input)) invalid("ledger input must be a plain object");
  assertExactKeys(input, ["session_id", "kind", "source_key", "payload"], [
    "occurred_at", "raw_event_ids", "parent_ledger_ids",
  ]);
  validateNonEmptyString(input.session_id, "session_id");
  if (!EXPERIENCE_LEDGER_KINDS.includes(input.kind)) invalid("unsupported ledger kind");
  validateNonEmptyString(input.source_key, "source_key");
  if (!rawMirror && input.source_key.startsWith(RAW_EVENT_SOURCE_PREFIX)) {
    invalid(`source_key prefix ${RAW_EVENT_SOURCE_PREFIX} is reserved for raw mirrors`);
  }
  if (input.occurred_at !== undefined) {
    if (rawMirror) {
      if (typeof input.occurred_at !== "string") invalid("occurred_at must be a string");
    } else {
      validateNonEmptyString(input.occurred_at, "occurred_at");
    }
  }
  const rawEventIds = normalizeIdList(input.raw_event_ids, "raw_event_ids");
  const parentLedgerIds = normalizeIdList(input.parent_ledger_ids, "parent_ledger_ids");
  const payload = normalizeJsonObject(input.payload, "payload");
  return {
    session_id: input.session_id,
    kind: input.kind,
    source_key: input.source_key,
    ...(input.occurred_at === undefined ? {} : { occurred_at: input.occurred_at }),
    raw_event_ids: rawEventIds,
    parent_ledger_ids: parentLedgerIds,
    payload,
    payload_json: JSON.stringify(payload),
  };
}

function normalizeIdList(value: string[] | undefined, label: string): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) {
    invalid(`${label} must be an array`);
  }
  const normalized: string[] = [];
  const seen = new Set<string>();
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor?.enumerable || !("value" in descriptor)) {
      invalid(`${label} must contain only enumerable data values`);
    }
    const id = descriptor.value;
    validateNonEmptyString(id, `${label}[${index}]`);
    if (seen.has(id)) invalid(`${label} must not contain duplicates`);
    seen.add(id);
    normalized.push(id);
  }
  for (const key of Reflect.ownKeys(value)) {
    if (key === "length") continue;
    if (typeof key !== "string" || !/^(0|[1-9]\d*)$/.test(key) || Number(key) >= value.length) {
      invalid(`${label} must not contain non-index properties`);
    }
  }
  return normalized;
}

function normalizeJsonObject(value: JsonObject, path: string): JsonObject {
  if (!isPlainObject(value)) invalid(`${path} must be a plain JSON object`);
  return normalizeJsonValue(value, new Set<object>(), path) as JsonObject;
}

function normalizeJsonValue(value: unknown, ancestors: Set<object>, path: string): JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value) || Object.is(value, -0)) invalid(`${path} contains a lossy number`);
    return value;
  }
  if (typeof value !== "object") invalid(`${path} contains a non-JSON value`);
  if (ancestors.has(value)) invalid(`${path} contains a cycle`);

  if (Array.isArray(value)) {
    if (Object.getPrototypeOf(value) !== Array.prototype) invalid(`${path} contains a non-plain array`);
    ancestors.add(value);
    const result: JsonValue[] = [];
    for (let index = 0; index < value.length; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (!descriptor?.enumerable || !("value" in descriptor)) {
        invalid(`${path} contains a sparse or accessor array value`);
      }
      result.push(normalizeJsonValue(descriptor.value, ancestors, `${path}[${index}]`));
    }
    for (const key of Reflect.ownKeys(value)) {
      if (key === "length") continue;
      if (typeof key !== "string" || !/^(0|[1-9]\d*)$/.test(key) || Number(key) >= value.length) {
        invalid(`${path} contains a non-index array property`);
      }
    }
    ancestors.delete(value);
    return result;
  }

  if (!isPlainObject(value)) invalid(`${path} contains a non-plain object`);
  ancestors.add(value);
  const result: JsonObject = {};
  for (const key of Reflect.ownKeys(value).sort((left, right) => {
    const leftKey = String(left);
    const rightKey = String(right);
    return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
  })) {
    if (typeof key !== "string") invalid(`${path} contains a symbol key`);
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor?.enumerable || !("value" in descriptor)) {
      invalid(`${path}.${key} must be an enumerable data property`);
    }
    result[key] = normalizeJsonValue(descriptor.value, ancestors, `${path}.${key}`);
  }
  ancestors.delete(value);
  return result;
}

function assertCompatibleRetry(existing: LedgerRow, input: NormalizedLedgerInput): void {
  if (
    existing.kind !== input.kind ||
    existing.raw_event_ids_json !== JSON.stringify(input.raw_event_ids) ||
    existing.parent_ledger_ids_json !== JSON.stringify(input.parent_ledger_ids) ||
    existing.payload_json !== input.payload_json ||
    (input.occurred_at !== undefined && existing.occurred_at !== input.occurred_at)
  ) {
    throw new ExperienceLedgerError(
      "CONFLICT",
      `source_key ${input.source_key} conflicts with an existing ledger record`
    );
  }
}

function assertRawMirrorCompatible(row: LedgerRow, event: RawEvent): void {
  const record = rowToRecord(row);
  const payload = record.payload;
  const expectedBase = rawMirrorPayload(event, false);
  const migrationBackfill = payload.migration_backfill;
  if (
    row.id !== rawMirrorId(event.id) ||
    record.kind !== "EVENT" ||
    record.occurred_at !== event.created_at ||
    JSON.stringify(record.raw_event_ids) !== JSON.stringify([event.id]) ||
    record.parent_ledger_ids.length !== 0 ||
    typeof migrationBackfill !== "boolean" ||
    JSON.stringify({ ...payload, migration_backfill: false }) !== JSON.stringify(expectedBase)
  ) {
    throw new ExperienceLedgerError(
      "CONFLICT",
      `Raw event ${event.id} conflicts with its EVENT ledger mirror`
    );
  }
}

function rawMirrorPayload(event: RawEvent, migrationBackfill: boolean): JsonObject {
  return normalizeJsonObject({
    migration_backfill: migrationBackfill,
    raw_event: {
      id: event.id,
      session_id: event.session_id,
      seq: event.seq,
      role: event.role,
      content: event.content,
      event_type: event.event_type,
      created_at: event.created_at,
      token_count: event.token_count,
      metadata: event.metadata,
      ...(event.source_event_id === undefined ? {} : { source_event_id: event.source_event_id }),
    },
  }, "raw mirror payload");
}

function rawMirrorId(rawEventId: string): string {
  return `raw-event:${rawEventId}`;
}

function rawMirrorSourceKey(rawEventId: string): string {
  return `${RAW_EVENT_SOURCE_PREFIX}${rawEventId}`;
}

function findBySourceKey(
  database: DatabaseSync,
  sessionId: string,
  sourceKey: string
): LedgerRow | undefined {
  return database
    .prepare("SELECT * FROM experience_ledger WHERE session_id = ? AND source_key = ?")
    .get(sessionId, sourceKey) as LedgerRow | undefined;
}

function rowToRecord(row: LedgerRow): ExperienceLedgerRecord {
  return {
    id: row.id,
    session_id: row.session_id,
    seq: row.seq,
    kind: row.kind,
    occurred_at: row.occurred_at,
    source_key: row.source_key,
    raw_event_ids: parseStringArray(row.raw_event_ids_json, "persisted raw_event_ids"),
    parent_ledger_ids: parseStringArray(
      row.parent_ledger_ids_json,
      "persisted parent_ledger_ids"
    ),
    payload: parsePayload(row.payload_json),
  };
}

function rawRowToEvent(row: RawEventRow): RawEvent {
  return {
    id: row.id,
    session_id: row.session_id,
    seq: row.seq,
    role: row.role,
    content: row.content,
    event_type: row.event_type,
    created_at: row.created_at,
    token_count: row.token_count,
    metadata: parsePayload(row.metadata_json),
    ...(row.source_event_id === null ? {} : { source_event_id: row.source_event_id }),
  };
}

function parseStringArray(json: string, label: string): string[] {
  try {
    const value: unknown = JSON.parse(json);
    return normalizeIdList(value as string[], label);
  } catch (error) {
    if (error instanceof ExperienceLedgerError) throw error;
    throw new Error(`${label} is not valid JSON`, { cause: error });
  }
}

function parsePayload(json: string): JsonObject {
  try {
    const value: unknown = JSON.parse(json);
    return normalizeJsonObject(value as JsonObject, "persisted payload");
  } catch (error) {
    if (error instanceof ExperienceLedgerError) throw error;
    throw new Error("Persisted ledger payload is not valid JSON", { cause: error });
  }
}

function assertExactKeys(
  value: object,
  required: readonly string[],
  optional: readonly string[]
): void {
  const allowed = new Set([...required, ...optional]);
  const keys = Reflect.ownKeys(value);
  for (const key of keys) {
    if (typeof key !== "string" || !allowed.has(key)) invalid("ledger input has unknown fields");
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor?.enumerable || !("value" in descriptor)) {
      invalid("ledger input must contain only enumerable data properties");
    }
  }
  for (const key of required) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) invalid(`ledger input is missing ${key}`);
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function validateNonEmptyString(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || value.length === 0) invalid(`${label} must not be empty`);
}

function configureDatabase(database: DatabaseSync, databasePath: string): void {
  database.exec("PRAGMA foreign_keys = ON;");
  database.exec("PRAGMA busy_timeout = 5000;");
  database.exec("PRAGMA synchronous = FULL;");
  if (databasePath !== ":memory:") database.exec("PRAGMA journal_mode = WAL;");
}

function invalid(message: string): never {
  throw new ExperienceLedgerError("INVALID_INPUT", message);
}

function rollback(database: DatabaseSync): void {
  try {
    database.exec("ROLLBACK;");
  } catch {
    // Preserve the actionable original error.
  }
}
