import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  appendRawEventMirrorInsideTransaction,
  assertRawEventMirrorInsideTransaction,
  migrateExperienceLedger,
} from "./experience-ledger.js";
import { initializeSqliteConnection } from "./sqlite-initialization.js";

export type JsonValue = null | boolean | number | string | JsonValue[] | JsonObject;
export interface JsonObject {
  [key: string]: JsonValue;
}

export type RawEventRole = "system" | "user" | "assistant" | "tool";

export interface DenseEmbedding {
  vector_space_id: string;
  values: number[];
}

export interface RawEventInput {
  session_id: string;
  role: RawEventRole;
  content: string;
  event_type?: string;
  created_at?: string;
  token_count?: number;
  metadata?: JsonObject;
  /** Stable event id supplied by the event source, when available. */
  source_event_id?: string;
  /** Optional caller-produced vector. The core never generates embeddings. */
  dense_embedding?: DenseEmbedding;
}

export interface RawEvent {
  id: string;
  session_id: string;
  seq: number;
  role: RawEventRole;
  content: string;
  event_type: string;
  created_at: string;
  token_count: number;
  metadata: JsonObject;
  source_event_id?: string;
  dense_embedding?: DenseEmbedding;
}

export interface RawHistoryStore {
  ingest(input: RawEventInput): RawEvent;
  getEvent(id: string): RawEvent | undefined;
  getSessionEvents(sessionId: string): RawEvent[];
  close(): void;
}

export class RawEventTimestampError extends Error {
  constructor() {
    super("created_at must be a valid RFC 3339 timestamp");
    this.name = "RawEventTimestampError";
  }
}

const RAW_EVENT_WRITE_TIMESTAMP_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(Z|([+-])(\d{2}):(\d{2}))$/u;
const RAW_EVENT_COMPATIBLE_TIMESTAMP_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?(Z|([+-])(\d{2}):(\d{2}))$/u;

interface ParsedRawEventTimestamp {
  canonical_milliseconds: string;
  exact_instant_identity: string;
}

/**
 * Validate one independent source/event timestamp and canonicalize it for a new append.
 * Durable stream order is carried by RawEvent.seq, never by this wall/source time.
 */
export function normalizeRawEventTimestamp(value: unknown): string {
  return parseRawEventTimestamp(value, RAW_EVENT_WRITE_TIMESTAMP_PATTERN).canonical_milliseconds;
}

/** Validate historical writer-produced timestamp bytes without rewriting them. */
export function validateCompatibleRawEventTimestamp(value: unknown): string {
  parseRawEventTimestamp(value, RAW_EVENT_COMPATIBLE_TIMESTAMP_PATTERN);
  return value as string;
}

function parseRawEventTimestamp(value: unknown, pattern: RegExp): ParsedRawEventTimestamp {
  if (typeof value !== "string") throw new RawEventTimestampError();
  const match = pattern.exec(value);
  if (match === null) throw new RawEventTimestampError();
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  const fraction = match[7] ?? "";
  const offsetHour = match[10] === undefined ? 0 : Number(match[10]);
  const offsetMinute = match[11] === undefined ? 0 : Number(match[11]);
  if (
    month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month) ||
    hour > 23 || minute > 59 || second > 60 || offsetHour > 23 || offsetMinute > 59
  ) {
    throw new RawEventTimestampError();
  }
  const leapSecond = second === 60;
  const millisecond = Number(fraction.padEnd(3, "0").slice(0, 3));
  const local = new Date(0);
  local.setUTCFullYear(year, month - 1, day);
  local.setUTCHours(hour, minute, leapSecond ? 59 : second, 0);
  const offsetSign = match[9] === "-" ? -1 : 1;
  const offsetMilliseconds = offsetSign * (offsetHour * 60 + offsetMinute) * 60_000;
  const utcSecondInstant = new Date(local.getTime() - offsetMilliseconds);
  const utcSecond = utcSecondInstant.toISOString();
  if (leapSecond && !isUtcMonthEndLeapSecond(utcSecondInstant)) {
    throw new RawEventTimestampError();
  }
  const canonical = leapSecond
    ? `${utcSecond.slice(0, 17)}60.${String(millisecond).padStart(3, "0")}Z`
    : new Date(local.getTime() - offsetMilliseconds + millisecond).toISOString();
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(canonical)) {
    throw new RawEventTimestampError();
  }
  const significantFraction = fraction.replace(/0+$/u, "");
  return {
    canonical_milliseconds: canonical,
    exact_instant_identity: `${leapSecond ? "leap" : "regular"}/${utcSecond.slice(0, 19)}Z/${significantFraction}`,
  };
}

export function estimateTokens(text: string): number {
  if (text.length === 0) return 0;
  return Math.max(1, Math.ceil(text.length / 4));
}

/**
 * Durable append-only storage for raw Context Compiler evidence.
 *
 * The class deliberately exposes no mutation or deletion API. SQLite triggers
 * enforce the same invariant for every connection, so later projection state
 * transitions cannot accidentally rewrite or remove source evidence.
 */
export class SqliteRawHistoryStore implements RawHistoryStore {
  private readonly database: DatabaseSync;
  private closed = false;

  constructor(databasePath: string) {
    if (databasePath.length === 0) throw new Error("databasePath must not be empty");
    if (databasePath !== ":memory:") mkdirSync(dirname(databasePath), { recursive: true });

    const database = new DatabaseSync(databasePath);
    try {
      initializeSqliteConnection(database, databasePath, () => {
        migrate(database);
        migrateExperienceLedger(database);
      });
    } catch (error) {
      try { database.close(); } catch { /* preserve the initialization error */ }
      throw error;
    }
    this.database = database;
  }

  ingest(input: RawEventInput): RawEvent {
    this.assertOpen();
    validateInput(input);

    // Validate and normalize before BEGIN so rejected metadata cannot consume a
    // sequence number. The normalized value is both persisted and returned.
    const metadata = input.metadata === undefined ? {} : normalizeMetadata(input.metadata);
    const metadataJson = JSON.stringify(metadata);
    const eventType = input.event_type ?? "message";
    const createdAt = normalizeRawEventTimestamp(input.created_at ?? new Date().toISOString());
    const tokenCount = input.token_count ?? estimateTokens(input.content);
    const sourceEventId = input.source_event_id ?? null;
    const denseEmbedding = input.dense_embedding === undefined
      ? undefined
      : normalizeDenseEmbedding(input.dense_embedding, "dense_embedding");
    const denseEmbeddingJson = denseEmbedding === undefined ? null : JSON.stringify(denseEmbedding);

    this.database.exec("BEGIN IMMEDIATE;");
    try {
      this.database
        .prepare("INSERT OR IGNORE INTO sessions (id, created_at) VALUES (?, ?)")
        .run(input.session_id, createdAt);

      if (sourceEventId !== null) {
        const existing = this.database
          .prepare("SELECT * FROM raw_events WHERE session_id = ? AND source_event_id = ?")
          .get(input.session_id, sourceEventId) as DatabaseRow | undefined;
        if (existing) {
          assertCompatibleRetry(
            existing,
            input,
            eventType,
            createdAt,
            metadataJson,
            denseEmbeddingJson
          );
          assertRawEventMirrorInsideTransaction(this.database, rowToEvent(existing));
          this.database.exec("COMMIT;");
          return rowToEvent(existing);
        }
      }

      const sequence = this.database
        .prepare(
          "SELECT COALESCE(MAX(seq), 0) + 1 AS next_seq FROM raw_events WHERE session_id = ?"
        )
        .get(input.session_id) as { next_seq: number };
      const id = randomUUID();

      this.database
        .prepare(
          `INSERT INTO raw_events (
             id, session_id, seq, source_event_id, role, content,
             event_type, created_at, token_count, metadata_json, dense_embedding_json
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          id,
          input.session_id,
          sequence.next_seq,
          sourceEventId,
          input.role,
          input.content,
          eventType,
          createdAt,
          tokenCount,
          metadataJson,
          denseEmbeddingJson
        );
      const event: RawEvent = {
        id,
        session_id: input.session_id,
        seq: sequence.next_seq,
        role: input.role,
        content: input.content,
        event_type: eventType,
        created_at: createdAt,
        token_count: tokenCount,
        metadata,
        ...(sourceEventId === null ? {} : { source_event_id: sourceEventId }),
        ...(denseEmbedding === undefined ? {} : { dense_embedding: denseEmbedding }),
      };
      appendRawEventMirrorInsideTransaction(this.database, event, false);
      this.database.exec("COMMIT;");
      return event;
    } catch (error) {
      rollback(this.database);
      throw error;
    }
  }

  getEvent(id: string): RawEvent | undefined {
    this.assertOpen();
    const row = this.database.prepare("SELECT * FROM raw_events WHERE id = ?").get(id) as
      | DatabaseRow
      | undefined;
    return row ? rowToEvent(row) : undefined;
  }

  getSessionEvents(sessionId: string): RawEvent[] {
    this.assertOpen();
    const rows = this.database
      .prepare("SELECT * FROM raw_events WHERE session_id = ? ORDER BY seq ASC")
      .all(sessionId) as DatabaseRow[];
    return rows.map(rowToEvent);
  }

  close(): void {
    if (this.closed) return;
    this.database.close();
    this.closed = true;
  }

  private assertOpen(): void {
    if (this.closed) throw new Error("Raw history store is closed");
  }
}

interface DatabaseRow extends Record<string, unknown> {
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
  dense_embedding_json: string | null;
}

function migrate(database: DatabaseSync): void {
  database.exec("BEGIN IMMEDIATE;");
  try {
    database.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY CHECK (length(id) > 0),
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS raw_events (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL REFERENCES sessions(id),
        seq INTEGER NOT NULL CHECK (seq > 0),
        source_event_id TEXT,
        role TEXT NOT NULL CHECK (role IN ('system', 'user', 'assistant', 'tool')),
        content TEXT NOT NULL,
        event_type TEXT NOT NULL CHECK (length(event_type) > 0),
        created_at TEXT NOT NULL,
        token_count INTEGER NOT NULL CHECK (token_count >= 0),
        metadata_json TEXT NOT NULL DEFAULT '{}',
        dense_embedding_json TEXT,
        UNIQUE (session_id, seq),
        UNIQUE (session_id, source_event_id)
      );

      CREATE INDEX IF NOT EXISTS idx_raw_events_session_seq
        ON raw_events(session_id, seq);

      CREATE TRIGGER IF NOT EXISTS raw_events_prevent_update
      BEFORE UPDATE ON raw_events
      BEGIN
        SELECT RAISE(ABORT, 'raw_events is append-only');
      END;

      CREATE TRIGGER IF NOT EXISTS raw_events_prevent_delete
      BEFORE DELETE ON raw_events
      BEGIN
        SELECT RAISE(ABORT, 'raw_events is append-only');
      END;
    `);
    const columns = database.prepare("PRAGMA table_info(raw_events)").all() as Array<{ name: string }>;
    if (!columns.some((column) => column.name === "dense_embedding_json")) {
      database.exec("ALTER TABLE raw_events ADD COLUMN dense_embedding_json TEXT;");
    }
    database.exec("COMMIT;");
  } catch (error) {
    rollback(database);
    throw error;
  }
}

function validateInput(input: RawEventInput): void {
  if (input.session_id.length === 0) throw new Error("session_id must not be empty");
  if (input.event_type !== undefined && input.event_type.length === 0) {
    throw new Error("event_type must not be empty");
  }
  if (input.source_event_id !== undefined && input.source_event_id.length === 0) {
    throw new Error("source_event_id must not be empty");
  }
  if (input.dense_embedding !== undefined) {
    normalizeDenseEmbedding(input.dense_embedding, "dense_embedding");
  }
  if (
    input.token_count !== undefined &&
    (!Number.isSafeInteger(input.token_count) || input.token_count < 0)
  ) {
    throw new Error("token_count must be a non-negative safe integer");
  }
}

function normalizeMetadata(metadata: JsonObject): JsonObject {
  if (typeof metadata !== "object" || metadata === null || Array.isArray(metadata)) {
    throw new Error("metadata must be a JSON object");
  }
  assertJsonValue(metadata, new Set<object>(), "metadata");
  return JSON.parse(JSON.stringify(metadata)) as JsonObject;
}

function assertJsonValue(value: unknown, ancestors: Set<object>, path: string): void {
  if (value === null || typeof value === "string" || typeof value === "boolean") return;
  if (typeof value === "number") {
    if (!Number.isFinite(value) || Object.is(value, -0)) {
      throw new Error(`${path} must contain only lossless JSON numbers`);
    }
    return;
  }
  if (typeof value !== "object") throw new Error(`${path} must contain only JSON values`);
  if (ancestors.has(value)) throw new Error(`${path} must not contain cycles`);

  const prototype = Object.getPrototypeOf(value);
  if (Array.isArray(value)) {
    ancestors.add(value);
    for (let index = 0; index < value.length; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (!descriptor) throw new Error(`${path} must not contain sparse arrays`);
      if (!descriptor.enumerable || !("value" in descriptor)) {
        throw new Error(`${path}[${index}] must be an enumerable JSON data property`);
      }
      assertJsonValue(descriptor.value, ancestors, `${path}[${index}]`);
    }
    for (const key of Reflect.ownKeys(value)) {
      if (key === "length") continue;
      if (typeof key !== "string" || !/^(0|[1-9]\d*)$/.test(key) || Number(key) >= value.length) {
        throw new Error(`${path} must not contain non-index array properties`);
      }
    }
    ancestors.delete(value);
    return;
  }
  if (prototype !== Object.prototype && prototype !== null) {
    throw new Error(`${path} must contain only plain JSON objects`);
  }

  ancestors.add(value);
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string") throw new Error(`${path} must not contain symbol keys`);
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor?.enumerable || !("value" in descriptor)) {
      throw new Error(`${path}.${key} must be an enumerable JSON data property`);
    }
    assertJsonValue(descriptor.value, ancestors, `${path}.${key}`);
  }
  ancestors.delete(value);
}

function rollback(database: DatabaseSync): void {
  try {
    database.exec("ROLLBACK;");
  } catch {
    // The original database error is the actionable failure.
  }
}

function assertCompatibleRetry(
  existing: DatabaseRow,
  input: RawEventInput,
  eventType: string,
  createdAt: string,
  metadataJson: string,
  denseEmbeddingJson: string | null
): void {
  if (
    existing.role !== input.role ||
    existing.content !== input.content ||
    existing.event_type !== eventType ||
    existing.metadata_json !== metadataJson ||
    existing.dense_embedding_json !== denseEmbeddingJson ||
    (input.created_at !== undefined && !sameRawEventInstant(existing.created_at, createdAt)) ||
    (input.token_count !== undefined && existing.token_count !== input.token_count)
  ) {
    throw new Error(
      `source_event_id ${input.source_event_id} conflicts with existing raw evidence`
    );
  }
}

function sameRawEventInstant(stored: string, canonical: string): boolean {
  try {
    return parseRawEventTimestamp(stored, RAW_EVENT_COMPATIBLE_TIMESTAMP_PATTERN).exact_instant_identity ===
      parseRawEventTimestamp(canonical, RAW_EVENT_WRITE_TIMESTAMP_PATTERN).exact_instant_identity;
  } catch {
    return false;
  }
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) {
    const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    return leap ? 29 : 28;
  }
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

function isUtcMonthEndLeapSecond(value: Date): boolean {
  const year = value.getUTCFullYear();
  const month = value.getUTCMonth() + 1;
  return value.getUTCHours() === 23 && value.getUTCMinutes() === 59 && value.getUTCSeconds() === 59 &&
    value.getUTCDate() === daysInMonth(year, month);
}

function rowToEvent(row: DatabaseRow): RawEvent {
  const createdAt = validateCompatibleRawEventTimestamp(row.created_at);
  return {
    id: row.id,
    session_id: row.session_id,
    seq: row.seq,
    role: row.role,
    content: row.content,
    event_type: row.event_type,
    created_at: createdAt,
    token_count: row.token_count,
    metadata: parseMetadata(row.metadata_json),
    ...(row.source_event_id === null ? {} : { source_event_id: row.source_event_id }),
    ...(row.dense_embedding_json === null
      ? {}
      : { dense_embedding: parseDenseEmbedding(row.dense_embedding_json, "persisted dense_embedding") }),
  };
}

export function normalizeDenseEmbedding(value: unknown, path: string): DenseEmbedding {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${path} must be a plain object`);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new Error(`${path} must be a plain object`);
  }
  const record = value as Record<string, unknown>;
  const keys = Reflect.ownKeys(record);
  if (keys.length !== 2 || !keys.includes("vector_space_id") || !keys.includes("values")) {
    throw new Error(`${path} must contain exactly vector_space_id and values`);
  }
  for (const key of keys) {
    if (typeof key !== "string") throw new Error(`${path} must not contain symbol keys`);
    const descriptor = Object.getOwnPropertyDescriptor(record, key);
    if (!descriptor?.enumerable || !("value" in descriptor)) {
      throw new Error(`${path}.${key} must be an enumerable data property`);
    }
  }
  const vectorSpaceId = record.vector_space_id;
  if (typeof vectorSpaceId !== "string" || vectorSpaceId.trim().length === 0) {
    throw new Error(`${path}.vector_space_id must be non-blank`);
  }
  const values = record.values;
  if (!Array.isArray(values) || Object.getPrototypeOf(values) !== Array.prototype ||
      values.length < 1 || values.length > 4096) {
    throw new Error(`${path}.values must be a plain dense array with 1 to 4096 entries`);
  }
  const normalized: number[] = [];
  for (let index = 0; index < values.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(values, String(index));
    if (!descriptor?.enumerable || !("value" in descriptor)) {
      throw new Error(`${path}.values must not be sparse or contain accessors`);
    }
    const number = descriptor.value;
    if (typeof number !== "number" || !Number.isFinite(number) || Object.is(number, -0)) {
      throw new Error(`${path}.values[${index}] must be a finite lossless number`);
    }
    normalized.push(number);
  }
  for (const key of Reflect.ownKeys(values)) {
    if (key === "length") continue;
    if (typeof key !== "string" || !/^(0|[1-9]\d*)$/.test(key) || Number(key) >= values.length) {
      throw new Error(`${path}.values must not contain extra fields`);
    }
  }
  return { vector_space_id: vectorSpaceId, values: normalized };
}

function parseDenseEmbedding(json: string, path: string): DenseEmbedding {
  try {
    return normalizeDenseEmbedding(JSON.parse(json), path);
  } catch (error) {
    throw new Error(`${path} is invalid`, { cause: error });
  }
}

function parseMetadata(value: string): JsonObject {
  try {
    const parsed: unknown = JSON.parse(value);
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
      assertJsonValue(parsed, new Set<object>(), "persisted metadata");
      return parsed as JsonObject;
    }
  } catch (error) {
    throw new Error("Persisted raw-event metadata is not valid JSON", { cause: error });
  }
  throw new Error("Persisted raw-event metadata must be a JSON object");
}
