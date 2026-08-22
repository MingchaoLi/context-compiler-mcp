import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

export type JsonValue = null | boolean | number | string | JsonValue[] | JsonObject;
export interface JsonObject {
  [key: string]: JsonValue;
}

export type RawEventRole = "system" | "user" | "assistant" | "tool";

export interface RawEventInput {
  session_id: string;
  role: RawEventRole;
  content: string;
  event_type?: string;
  created_at?: string;
  token_count?: number;
  metadata?: JsonObject;
  /** Stable event id supplied by the Harness event source, when available. */
  source_event_id?: string;
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
}

export interface RawHistoryStore {
  ingest(input: RawEventInput): RawEvent;
  getEvent(id: string): RawEvent | undefined;
  getSessionEvents(sessionId: string): RawEvent[];
  close(): void;
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

    this.database = new DatabaseSync(databasePath);
    this.database.exec("PRAGMA foreign_keys = ON;");
    this.database.exec("PRAGMA busy_timeout = 5000;");
    this.database.exec("PRAGMA synchronous = FULL;");
    if (databasePath !== ":memory:") this.database.exec("PRAGMA journal_mode = WAL;");
    migrate(this.database);
  }

  ingest(input: RawEventInput): RawEvent {
    this.assertOpen();
    validateInput(input);

    // Validate and normalize before BEGIN so rejected metadata cannot consume a
    // sequence number. The normalized value is both persisted and returned.
    const metadata = input.metadata === undefined ? {} : normalizeMetadata(input.metadata);
    const metadataJson = JSON.stringify(metadata);
    const eventType = input.event_type ?? "message";
    const createdAt = input.created_at ?? new Date().toISOString();
    const tokenCount = input.token_count ?? estimateTokens(input.content);
    const sourceEventId = input.source_event_id ?? null;

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
          assertCompatibleRetry(existing, input, eventType, metadataJson);
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
             event_type, created_at, token_count, metadata_json
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
          metadataJson
        );
      this.database.exec("COMMIT;");

      return {
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
      };
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
}

function migrate(database: DatabaseSync): void {
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
}

function validateInput(input: RawEventInput): void {
  if (input.session_id.length === 0) throw new Error("session_id must not be empty");
  if (input.event_type !== undefined && input.event_type.length === 0) {
    throw new Error("event_type must not be empty");
  }
  if (input.source_event_id !== undefined && input.source_event_id.length === 0) {
    throw new Error("source_event_id must not be empty");
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
  metadataJson: string
): void {
  if (
    existing.role !== input.role ||
    existing.content !== input.content ||
    existing.event_type !== eventType ||
    existing.metadata_json !== metadataJson ||
    (input.created_at !== undefined && existing.created_at !== input.created_at) ||
    (input.token_count !== undefined && existing.token_count !== input.token_count)
  ) {
    throw new Error(
      `source_event_id ${input.source_event_id} conflicts with existing raw evidence`
    );
  }
}

function rowToEvent(row: DatabaseRow): RawEvent {
  return {
    id: row.id,
    session_id: row.session_id,
    seq: row.seq,
    role: row.role,
    content: row.content,
    event_type: row.event_type,
    created_at: row.created_at,
    token_count: row.token_count,
    metadata: parseMetadata(row.metadata_json),
    ...(row.source_event_id === null ? {} : { source_event_id: row.source_event_id }),
  };
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
