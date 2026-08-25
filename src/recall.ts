import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  validateCompatibleRawEventTimestamp,
  type JsonObject,
  type RawEvent,
  type RawEventRole,
} from "./raw-store.js";
import { initializeSqliteConnection } from "./sqlite-initialization.js";

export type HistoryRecallErrorCode =
  | "INVALID_INPUT"
  | "RAW_SCHEMA_MISSING"
  | "RANGE_NOT_FOUND"
  | "HEADLINE_CONFLICT"
  | "STORE_CLOSED"
  | "STORAGE_FAILURE";

export type HistoryRecallErrorCategory = "validation" | "not_found" | "conflict" | "state" | "storage";

export class HistoryRecallError extends Error {
  readonly code: HistoryRecallErrorCode;
  readonly category: HistoryRecallErrorCategory;

  constructor(
    code: HistoryRecallErrorCode,
    category: HistoryRecallErrorCategory,
    message: string
  ) {
    super(message);
    this.name = "HistoryRecallError";
    this.code = code;
    this.category = category;
  }
}

export interface HistoryHeadlineInput {
  session_id: string;
  event_start_seq: number;
  event_end_seq: number;
  headline: string;
  keywords: string[];
  created_at?: string;
}

export interface HistoryHeadline {
  id: string;
  session_id: string;
  event_start_seq: number;
  event_end_seq: number;
  headline: string;
  keywords: string[];
  created_at: string;
}

export interface EventIdRecallQuery {
  kind: "event_id";
  session_id: string;
  event_id: string;
}

export interface SeqRangeRecallQuery {
  kind: "seq_range";
  session_id: string;
  event_start_seq: number;
  event_end_seq: number;
}

export interface HeadlineIdRecallQuery {
  kind: "headline_id";
  session_id: string;
  headline_id: string;
}

export type ExactRecallQuery = EventIdRecallQuery | SeqRangeRecallQuery | HeadlineIdRecallQuery;

export interface EventIdRecallResult {
  kind: "event_id";
  found: boolean;
  event?: RawEvent;
}

export interface SeqRangeRecallResult {
  kind: "seq_range";
  found: boolean;
  events: RawEvent[];
}

export interface HeadlineIdRecallResult {
  kind: "headline_id";
  found: boolean;
  headline?: HistoryHeadline;
  events: RawEvent[];
}

export type ExactRecallResult = EventIdRecallResult | SeqRangeRecallResult | HeadlineIdRecallResult;

export interface KeywordRecallQuery {
  session_id: string;
  query: string;
  limit?: number;
}

export interface KeywordRecallHit {
  headline: HistoryHeadline;
  rank: number;
  events: RawEvent[];
}

interface HeadlineRow extends Record<string, unknown> {
  id: string;
  session_id: string;
  event_start_seq: number;
  event_end_seq: number;
  headline: string;
  keywords_json: string;
  created_at: string;
}

interface RankedHeadlineRow extends HeadlineRow {
  rank: number;
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

const MAX_HEADLINE_EVENTS = 200;
const MAX_EXACT_RANGE = 1_000;
const MAX_KEYWORD_RESULTS = 20;
const MAX_IDENTIFIER_LENGTH = 500;
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

/**
 * Durable, model-free headline storage and bounded recall over WO-CC-01 raw evidence.
 */
export class SqliteHistoryRecallStore {
  private readonly database: DatabaseSync;
  private closed = false;

  constructor(databasePath: string) {
    if (typeof databasePath !== "string" || databasePath.length === 0) {
      throw invalidInput("databasePath must be a non-empty string");
    }

    let database: DatabaseSync | undefined;
    try {
      if (databasePath !== ":memory:") mkdirSync(dirname(databasePath), { recursive: true });
      database = new DatabaseSync(databasePath);
      initializeSqliteConnection(database, databasePath, () => {
        if (!hasRawSchema(database!)) {
          throw new HistoryRecallError(
            "RAW_SCHEMA_MISSING",
            "state",
            "History recall requires the raw history schema"
          );
        }
        migrate(database!);
      });
      this.database = database;
    } catch (error) {
      if (error instanceof HistoryRecallError) throw error;
      try {
        database?.close();
      } catch {
        // Constructor still returns only the stable public storage error below.
      }
      throw storageFailure();
    }
  }

  createHeadline(input: HistoryHeadlineInput): HistoryHeadline {
    this.assertOpen();
    const normalized = sanitizeValidation(() => validateHeadlineInput(input));

    try {
      this.database.exec("BEGIN IMMEDIATE;");
      const existing = this.database
        .prepare(
          `SELECT * FROM history_headlines
           WHERE session_id = ? AND event_start_seq = ? AND event_end_seq = ?`
        )
        .get(
          normalized.session_id,
          normalized.event_start_seq,
          normalized.event_end_seq
        ) as HeadlineRow | undefined;

      if (existing) {
        const persisted = rowToHeadline(existing);
        if (
          persisted.headline !== normalized.headline ||
          !equalStrings(persisted.keywords, normalized.keywords)
        ) {
          throw new HistoryRecallError(
            "HEADLINE_CONFLICT",
            "conflict",
            "A different headline already exists for this event range"
          );
        }
        this.database.exec("COMMIT;");
        return cloneHeadline(persisted);
      }

      const expectedCount = normalized.event_end_seq - normalized.event_start_seq + 1;
      const range = this.database
        .prepare(
          `SELECT COUNT(*) AS count, MIN(seq) AS minimum, MAX(seq) AS maximum
           FROM raw_events
           WHERE session_id = ? AND seq BETWEEN ? AND ?`
        )
        .get(
          normalized.session_id,
          normalized.event_start_seq,
          normalized.event_end_seq
        ) as { count: number; minimum: number | null; maximum: number | null };
      if (
        range.count !== expectedCount ||
        range.minimum !== normalized.event_start_seq ||
        range.maximum !== normalized.event_end_seq
      ) {
        throw new HistoryRecallError(
          "RANGE_NOT_FOUND",
          "not_found",
          "The requested raw event range does not exist"
        );
      }

      const record: HistoryHeadline = {
        id: randomUUID(),
        session_id: normalized.session_id,
        event_start_seq: normalized.event_start_seq,
        event_end_seq: normalized.event_end_seq,
        headline: normalized.headline,
        keywords: [...normalized.keywords],
        created_at: normalized.created_at ?? new Date().toISOString(),
      };
      this.database
        .prepare(
          `INSERT INTO history_headlines (
             id, session_id, event_start_seq, event_end_seq,
             headline, keywords_json, created_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          record.id,
          record.session_id,
          record.event_start_seq,
          record.event_end_seq,
          record.headline,
          JSON.stringify(record.keywords),
          record.created_at
        );
      this.database
        .prepare(
          `INSERT INTO history_headlines_fts
           (headline_id, session_id, headline, keywords) VALUES (?, ?, ?, ?)`
        )
        .run(
          record.id,
          record.session_id,
          record.headline,
          record.keywords.join(" ")
        );
      this.database.exec("COMMIT;");
      return cloneHeadline(record);
    } catch (error) {
      rollback(this.database);
      if (error instanceof HistoryRecallError) throw error;
      throw storageFailure();
    }
  }

  recallExact(query: ExactRecallQuery): ExactRecallResult {
    this.assertOpen();
    const normalized = sanitizeValidation(() => validateExactQuery(query));
    try {
      if (normalized.kind === "event_id") {
        const row = this.database
          .prepare("SELECT * FROM raw_events WHERE session_id = ? AND id = ?")
          .get(normalized.session_id, normalized.event_id) as RawEventRow | undefined;
        return row
          ? { kind: "event_id", found: true, event: rowToEvent(row) }
          : { kind: "event_id", found: false };
      }

      if (normalized.kind === "seq_range") {
        const rows = this.selectRange(
          normalized.session_id,
          normalized.event_start_seq,
          normalized.event_end_seq
        );
        const expectedCount = normalized.event_end_seq - normalized.event_start_seq + 1;
        return rows.length === expectedCount
          ? { kind: "seq_range", found: true, events: rows.map(rowToEvent) }
          : { kind: "seq_range", found: false, events: [] };
      }

      const headlineRow = this.database
        .prepare("SELECT * FROM history_headlines WHERE session_id = ? AND id = ?")
        .get(normalized.session_id, normalized.headline_id) as HeadlineRow | undefined;
      if (!headlineRow) return { kind: "headline_id", found: false, events: [] };
      const headline = rowToHeadline(headlineRow);
      const events = this.selectRange(
        headline.session_id,
        headline.event_start_seq,
        headline.event_end_seq
      ).map(rowToEvent);
      if (events.length !== headline.event_end_seq - headline.event_start_seq + 1) {
        throw storageFailure();
      }
      return { kind: "headline_id", found: true, headline: cloneHeadline(headline), events };
    } catch (error) {
      if (error instanceof HistoryRecallError) throw error;
      throw storageFailure();
    }
  }

  recallKeyword(input: KeywordRecallQuery): KeywordRecallHit[] {
    this.assertOpen();
    const normalized = sanitizeValidation(() => validateKeywordQuery(input));
    const matchQuery = buildLiteralFtsQuery(normalized.query);
    if (matchQuery === undefined) return [];

    try {
      const rows = this.database
        .prepare(
          `SELECT h.*, bm25(history_headlines_fts) AS rank
           FROM history_headlines_fts
           JOIN history_headlines AS h ON h.id = history_headlines_fts.headline_id
           WHERE history_headlines_fts MATCH ?
             AND history_headlines_fts.session_id = ?
             AND h.session_id = ?
           ORDER BY rank ASC, h.id ASC
           LIMIT ?`
        )
        .all(matchQuery, normalized.session_id, normalized.session_id, normalized.limit) as
        RankedHeadlineRow[];

      return rows.map((row) => {
        const headline = rowToHeadline(row);
        const events = this.selectRange(
          headline.session_id,
          headline.event_start_seq,
          headline.event_end_seq
        ).map(rowToEvent);
        if (events.length !== headline.event_end_seq - headline.event_start_seq + 1) {
          throw storageFailure();
        }
        if (!Number.isFinite(row.rank)) throw storageFailure();
        return { headline: cloneHeadline(headline), rank: row.rank, events };
      });
    } catch (error) {
      if (error instanceof HistoryRecallError) throw error;
      throw storageFailure();
    }
  }

  close(): void {
    if (this.closed) return;
    try {
      this.database.close();
      this.closed = true;
    } catch {
      throw storageFailure();
    }
  }

  private selectRange(sessionId: string, start: number, end: number): RawEventRow[] {
    return this.database
      .prepare(
        `SELECT * FROM raw_events
         WHERE session_id = ? AND seq BETWEEN ? AND ?
         ORDER BY seq ASC`
      )
      .all(sessionId, start, end) as RawEventRow[];
  }

  private assertOpen(): void {
    if (this.closed) {
      throw new HistoryRecallError("STORE_CLOSED", "state", "History recall store is closed");
    }
  }
}

function migrate(database: DatabaseSync): void {
  database.exec("BEGIN IMMEDIATE;");
  try {
    database.exec(`
      CREATE TABLE IF NOT EXISTS history_headlines (
        id TEXT PRIMARY KEY CHECK (length(id) > 0),
        session_id TEXT NOT NULL REFERENCES sessions(id),
        event_start_seq INTEGER NOT NULL CHECK (event_start_seq > 0),
        event_end_seq INTEGER NOT NULL CHECK (
          event_end_seq >= event_start_seq AND event_end_seq - event_start_seq < ${MAX_HEADLINE_EVENTS}
        ),
        headline TEXT NOT NULL CHECK (length(trim(headline)) BETWEEN 1 AND 500),
        keywords_json TEXT NOT NULL CHECK (
          json_valid(keywords_json) AND json_type(keywords_json) = 'array'
        ),
        created_at TEXT NOT NULL,
        UNIQUE (session_id, event_start_seq, event_end_seq)
      );

      CREATE INDEX IF NOT EXISTS idx_history_headlines_session_id
        ON history_headlines(session_id, id);

      CREATE VIRTUAL TABLE IF NOT EXISTS history_headlines_fts USING fts5(
        headline_id UNINDEXED,
        session_id UNINDEXED,
        headline,
        keywords,
        tokenize = 'unicode61'
      );

      CREATE TRIGGER IF NOT EXISTS history_headlines_prevent_update
      BEFORE UPDATE ON history_headlines
      BEGIN
        SELECT RAISE(ABORT, 'history_headlines is append-only');
      END;

      CREATE TRIGGER IF NOT EXISTS history_headlines_prevent_delete
      BEFORE DELETE ON history_headlines
      BEGIN
        SELECT RAISE(ABORT, 'history_headlines is append-only');
      END;
    `);
    database.exec(`
      INSERT INTO history_headlines_fts (headline_id, session_id, headline, keywords)
      SELECT h.id, h.session_id, h.headline,
             COALESCE((
               SELECT group_concat(value, ' ') FROM json_each(h.keywords_json)
             ), '')
      FROM history_headlines AS h
      WHERE NOT EXISTS (
        SELECT 1 FROM history_headlines_fts AS f WHERE f.headline_id = h.id
      );
    `);
    database.exec("COMMIT;");
  } catch (error) {
    rollback(database);
    throw error;
  }
}

function hasRawSchema(database: DatabaseSync): boolean {
  const table = database
    .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'raw_events'")
    .get() as { sql: string | null } | undefined;
  if (!table) return false;
  const requiredColumns = new Set([
    "id",
    "session_id",
    "seq",
    "source_event_id",
    "role",
    "content",
    "event_type",
    "created_at",
    "token_count",
    "metadata_json",
  ]);
  const columns = database.prepare("PRAGMA table_info(raw_events)").all() as Array<{ name: string }>;
  for (const column of columns) requiredColumns.delete(column.name);
  return requiredColumns.size === 0;
}

function validateHeadlineInput(input: HistoryHeadlineInput): HistoryHeadlineInput {
  const values = readStrictObject(input, "headline input", [
    "session_id",
    "event_start_seq",
    "event_end_seq",
    "headline",
    "keywords",
  ], ["created_at"]);
  const sessionId = validateSessionId(values.session_id);
  const start = validatePositiveInteger(values.event_start_seq, "event_start_seq");
  const end = validatePositiveInteger(values.event_end_seq, "event_end_seq");
  if (start > end || end - start + 1 > MAX_HEADLINE_EVENTS) {
    throw invalidInput("headline event range must contain between 1 and 200 events");
  }
  const headline = validateBoundedText(values.headline, "headline", 500);
  const keywords = validateKeywords(values.keywords);
  const createdAt = values.created_at === undefined
    ? undefined
    : validateTimestamp(values.created_at, "created_at");
  return {
    session_id: sessionId,
    event_start_seq: start,
    event_end_seq: end,
    headline,
    keywords,
    ...(createdAt === undefined ? {} : { created_at: createdAt }),
  };
}

function validateExactQuery(query: ExactRecallQuery): ExactRecallQuery {
  const base = readStrictObject(query, "exact recall query", ["kind", "session_id"], [
    "event_id",
    "event_start_seq",
    "event_end_seq",
    "headline_id",
  ]);
  const kind = base.kind;
  const sessionId = validateSessionId(base.session_id);
  if (kind === "event_id") {
    requireExactKeys(base, ["kind", "session_id", "event_id"], "event_id query");
    return {
      kind,
      session_id: sessionId,
      event_id: validateIdentifier(base.event_id, "event_id"),
    };
  }
  if (kind === "seq_range") {
    requireExactKeys(
      base,
      ["kind", "session_id", "event_start_seq", "event_end_seq"],
      "seq_range query"
    );
    const start = validatePositiveInteger(base.event_start_seq, "event_start_seq");
    const end = validatePositiveInteger(base.event_end_seq, "event_end_seq");
    if (start > end || end - start + 1 > MAX_EXACT_RANGE) {
      throw invalidInput("exact sequence range must contain between 1 and 1000 events");
    }
    return { kind, session_id: sessionId, event_start_seq: start, event_end_seq: end };
  }
  if (kind === "headline_id") {
    requireExactKeys(base, ["kind", "session_id", "headline_id"], "headline_id query");
    return {
      kind,
      session_id: sessionId,
      headline_id: validateIdentifier(base.headline_id, "headline_id"),
    };
  }
  throw invalidInput("exact recall query kind is invalid");
}

function validateKeywordQuery(input: KeywordRecallQuery): Required<KeywordRecallQuery> {
  const values = readStrictObject(input, "keyword recall query", ["session_id", "query"], ["limit"]);
  const limit = values.limit === undefined ? 5 : values.limit;
  if (!Number.isSafeInteger(limit) || (limit as number) < 1 || (limit as number) > MAX_KEYWORD_RESULTS) {
    throw invalidInput("keyword recall limit must be an integer between 1 and 20");
  }
  return {
    session_id: validateSessionId(values.session_id),
    query: validateBoundedText(values.query, "query", 500),
    limit: limit as number,
  };
}

function validateKeywords(value: unknown): string[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) {
    throw invalidInput("keywords must be a standard array");
  }
  const keys = Reflect.ownKeys(value);
  if (keys.length !== value.length + 1 || !keys.includes("length")) {
    throw invalidInput("keywords must contain only dense array data properties");
  }
  if (value.length < 1 || value.length > 32) {
    throw invalidInput("keywords must contain between 1 and 32 values");
  }
  const result: string[] = [];
  const seen = new Set<string>();
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor?.enumerable || !("value" in descriptor)) {
      throw invalidInput("keywords must contain enumerable data properties");
    }
    const keyword = validateBoundedText(descriptor.value, "keyword", 100);
    if (seen.has(keyword)) throw invalidInput("keywords must be unique");
    seen.add(keyword);
    result.push(keyword);
  }
  return result;
}

function readStrictObject(
  value: unknown,
  label: string,
  required: readonly string[],
  optional: readonly string[]
): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw invalidInput(`${label} must be a plain object`);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw invalidInput(`${label} must be a plain object`);
  }
  const allowed = new Set([...required, ...optional]);
  const result: Record<string, unknown> = {};
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string" || !allowed.has(key)) {
      throw invalidInput(`${label} contains an unsupported property`);
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor?.enumerable || !("value" in descriptor)) {
      throw invalidInput(`${label} must contain enumerable data properties`);
    }
    result[key] = descriptor.value;
  }
  for (const key of required) {
    if (!Object.prototype.hasOwnProperty.call(result, key)) {
      throw invalidInput(`${label} is missing a required property`);
    }
  }
  return result;
}

function requireExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
  label: string
): void {
  const keys = Object.keys(value);
  if (keys.length !== expected.length || expected.some((key) => !keys.includes(key))) {
    throw invalidInput(`${label} contains properties for a different query kind`);
  }
}

function validateIdentifier(value: unknown, label: string): string {
  return validateBoundedText(value, label, MAX_IDENTIFIER_LENGTH);
}

function validateSessionId(value: unknown): string {
  // Match the approved WO-CC-01 Raw Store domain exactly. In particular,
  // whitespace-only and long IDs already identify valid persisted sessions.
  if (typeof value !== "string" || value.length === 0) {
    throw invalidInput("session_id must be a non-empty string");
  }
  return value;
}

function validateBoundedText(value: unknown, label: string, maximum: number): string {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > maximum) {
    throw invalidInput(`${label} must be a non-blank string of at most ${maximum} characters`);
  }
  return value;
}

function validatePositiveInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) {
    throw invalidInput(`${label} must be a positive safe integer`);
  }
  return value as number;
}

function validateTimestamp(value: unknown, label: string): string {
  if (
    typeof value !== "string" ||
    !ISO_TIMESTAMP.test(value) ||
    Number.isNaN(Date.parse(value)) ||
    new Date(value).toISOString() !== value
  ) {
    throw invalidInput(`${label} must be a canonical ISO timestamp`);
  }
  return value;
}

function buildLiteralFtsQuery(query: string): string | undefined {
  const tokens = query.match(/[\p{L}\p{N}][\p{L}\p{M}\p{N}]*/gu);
  if (!tokens) return undefined;
  const unique = [...new Set(tokens)];
  return unique.map((token) => `"${token.replaceAll('"', '""')}"`).join(" OR ");
}

function rowToHeadline(row: HeadlineRow): HistoryHeadline {
  let parsed: unknown;
  try {
    parsed = JSON.parse(row.keywords_json);
  } catch {
    throw storageFailure();
  }
  if (!Array.isArray(parsed) || parsed.some((value) => typeof value !== "string")) {
    throw storageFailure();
  }
  return {
    id: row.id,
    session_id: row.session_id,
    event_start_seq: row.event_start_seq,
    event_end_seq: row.event_end_seq,
    headline: row.headline,
    keywords: [...parsed],
    created_at: row.created_at,
  };
}

function rowToEvent(row: RawEventRow): RawEvent {
  let metadata: unknown;
  try {
    metadata = JSON.parse(row.metadata_json);
  } catch {
    throw storageFailure();
  }
  if (typeof metadata !== "object" || metadata === null || Array.isArray(metadata)) {
    throw storageFailure();
  }
  return {
    id: row.id,
    session_id: row.session_id,
    seq: row.seq,
    role: row.role,
    content: row.content,
    event_type: row.event_type,
    created_at: validateCompatibleRawEventTimestamp(row.created_at),
    token_count: row.token_count,
    metadata: metadata as JsonObject,
    ...(row.source_event_id === null ? {} : { source_event_id: row.source_event_id }),
  };
}

function cloneHeadline(headline: HistoryHeadline): HistoryHeadline {
  return { ...headline, keywords: [...headline.keywords] };
}

function equalStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function invalidInput(message: string): HistoryRecallError {
  return new HistoryRecallError("INVALID_INPUT", "validation", message);
}

function sanitizeValidation<T>(operation: () => T): T {
  try {
    return operation();
  } catch (error) {
    if (error instanceof HistoryRecallError) throw error;
    throw invalidInput("Recall input must contain plain data properties");
  }
}

function storageFailure(): HistoryRecallError {
  return new HistoryRecallError("STORAGE_FAILURE", "storage", "History recall storage operation failed");
}

function rollback(database: DatabaseSync): void {
  try {
    database.exec("ROLLBACK;");
  } catch {
    // Preserve the stable public error raised for the failed operation.
  }
}
