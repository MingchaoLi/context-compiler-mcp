import { createHash, randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { isProxy } from "node:util/types";
import {
  appendRawEventMirrorInsideTransaction,
  assertRawEventMirrorInsideTransaction,
  ExperienceLedgerError,
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

export const RAW_INGEST_FINGERPRINT_VERSION = "raw_ingest_request_sha256_v1";
export const EXACT_RAW_RECEIPT_LOOKUP_CAPABILITY_NAME = "exact_raw_receipt_lookup";
export const EXACT_RAW_RECEIPT_LOOKUP_VERSION = 1;
export const EXACT_RAW_RECEIPT_LOOKUP_STATUSES = Object.freeze([
  "FOUND_EXACT",
  "NOT_FOUND",
  "IDENTITY_COLLISION",
  "CORRUPT_DATA",
  "UNAVAILABLE",
] as const);

export type ExactRawReceiptLookupStatus =
  (typeof EXACT_RAW_RECEIPT_LOOKUP_STATUSES)[number];

export interface RawIngestFingerprintInput extends RawEventInput {
  created_at: string;
  source_event_id: string;
}

export interface RawReceiptLookupInput {
  session_id: string;
  source_event_id: string;
  ingest_fingerprint: string;
}

export interface ExactRawReceiptLookupCapability {
  readonly capability: typeof EXACT_RAW_RECEIPT_LOOKUP_CAPABILITY_NAME;
  readonly version: typeof EXACT_RAW_RECEIPT_LOOKUP_VERSION;
  readonly fingerprint_version: typeof RAW_INGEST_FINGERPRINT_VERSION;
  readonly requires_explicit_created_at: true;
  readonly statuses: typeof EXACT_RAW_RECEIPT_LOOKUP_STATUSES;
}

export interface RawIngestReceiptIdentity {
  id: string;
  session_id: string;
  seq: number;
  source_event_id: string;
}

interface RawReceiptLookupBase<Status extends ExactRawReceiptLookupStatus> {
  capability: typeof EXACT_RAW_RECEIPT_LOOKUP_CAPABILITY_NAME;
  version: typeof EXACT_RAW_RECEIPT_LOOKUP_VERSION;
  status: Status;
}

export interface FoundExactRawReceiptLookupResult
  extends RawReceiptLookupBase<"FOUND_EXACT"> {
  ingest_fingerprint: string;
  receipt: RawIngestReceiptIdentity;
}

export type RawReceiptLookupResult =
  | FoundExactRawReceiptLookupResult
  | RawReceiptLookupBase<"NOT_FOUND">
  | RawReceiptLookupBase<"IDENTITY_COLLISION">
  | RawReceiptLookupBase<"CORRUPT_DATA">
  | RawReceiptLookupBase<"UNAVAILABLE">;

export interface RawReceiptLookupPort {
  lookupRawReceipt(input: RawReceiptLookupInput): RawReceiptLookupResult;
}

export class RawReceiptLookupInputError extends Error {
  constructor() {
    super("Invalid exact Raw receipt lookup input");
    this.name = "RawReceiptLookupInputError";
  }
}

const EXACT_RAW_RECEIPT_LOOKUP_CAPABILITY = Object.freeze({
  capability: EXACT_RAW_RECEIPT_LOOKUP_CAPABILITY_NAME,
  version: EXACT_RAW_RECEIPT_LOOKUP_VERSION,
  fingerprint_version: RAW_INGEST_FINGERPRINT_VERSION,
  requires_explicit_created_at: true,
  statuses: EXACT_RAW_RECEIPT_LOOKUP_STATUSES,
} as const satisfies ExactRawReceiptLookupCapability);

/** Public read-only preflight; no database or exception probing is required. */
export function getExactRawReceiptLookupCapability(): ExactRawReceiptLookupCapability {
  return EXACT_RAW_RECEIPT_LOOKUP_CAPABILITY;
}

/**
 * Produce the restart-stable proof supplied to exact receipt lookup.
 * created_at is deliberately required because ingest assigns wall time when it is omitted.
 */
export function computeRawIngestFingerprint(input: RawIngestFingerprintInput): string {
  try {
    return fingerprintNormalizedRawIngest(normalizeFingerprintInput(input));
  } catch (error) {
    if (error instanceof RawReceiptLookupInputError) throw error;
    throw new RawReceiptLookupInputError();
  }
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

/** Read-only session summary: the durable session identity plus creation time. */
export interface SessionSummary {
  session_id: string;
  created_at: string;
}

export interface SessionListInput {
  limit: number;
  cursor?: string;
}

export interface SessionListResult {
  items: SessionSummary[];
  next_cursor: string | null;
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

/** @internal Exact Raw schema validation failure for Core-owned composition. */
export class RawHistorySchemaError extends Error {
  constructor() {
    super("CORRUPT_DATA");
    this.name = "RawHistorySchemaError";
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
export class SqliteRawHistoryStore implements RawHistoryStore, RawReceiptLookupPort {
  private readonly database: DatabaseSync;
  private closed = false;

  constructor(databasePath: string) {
    if (databasePath.length === 0) throw new Error("databasePath must not be empty");
    if (databasePath !== ":memory:") mkdirSync(dirname(databasePath), { recursive: true });

    const database = new DatabaseSync(databasePath);
    try {
      initializeSqliteConnection(database, databasePath, () => {
        migrateRawHistoryStore(database);
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

  listSessions(input: SessionListInput): SessionListResult {
    this.assertOpen();
    if (!Number.isSafeInteger(input.limit) || input.limit < 1 || input.limit > 100) {
      throw new Error("limit must be an integer between 1 and 100");
    }
    const afterId = input.cursor ?? "";
    if (typeof afterId !== "string" || afterId.length > 512) {
      throw new Error("cursor must be a bounded string");
    }
    const rows = this.database
      .prepare("SELECT id, created_at FROM sessions WHERE id > ? ORDER BY id ASC LIMIT ?")
      .all(afterId, input.limit + 1) as Array<{ id: string; created_at: string }>;
    const hasMore = rows.length > input.limit;
    const page = hasMore ? rows.slice(0, input.limit) : rows;
    const items = page.map((row) => ({ session_id: row.id, created_at: row.created_at }));
    const next_cursor = hasMore ? items[items.length - 1]!.session_id : null;
    return { items, next_cursor };
  }

  getSession(sessionId: string): SessionSummary | undefined {
    this.assertOpen();
    if (sessionId.length === 0) throw new Error("sessionId must not be empty");
    const row = this.database
      .prepare("SELECT id, created_at FROM sessions WHERE id = ?")
      .get(sessionId) as { id: string; created_at: string } | undefined;
    return row === undefined ? undefined : { session_id: row.id, created_at: row.created_at };
  }

  lookupRawReceipt(input: RawReceiptLookupInput): RawReceiptLookupResult {
    const normalizedInput = normalizeLookupInput(input);
    if (this.closed) return lookupStatus("UNAVAILABLE");

    try {
      this.database.exec("BEGIN;");
    } catch (error) {
      return lookupStatus(classifyLookupFailure(error, false));
    }

    try {
      const rows = this.database.prepare(
        `SELECT id, session_id, seq, source_event_id, role, content, event_type,
                created_at, token_count, metadata_json, dense_embedding_json
           FROM raw_events
          WHERE session_id = ? AND source_event_id = ?`
      ).all(normalizedInput.session_id, normalizedInput.source_event_id) as DatabaseRow[];

      if (rows.length === 0) {
        this.database.exec("COMMIT;");
        return lookupStatus("NOT_FOUND");
      }
      if (rows.length !== 1) {
        this.database.exec("COMMIT;");
        return lookupStatus("CORRUPT_DATA");
      }

      let event: RawEvent;
      let storedFingerprint: string;
      try {
        event = strictRowToEvent(
          rows[0],
          normalizedInput.session_id,
          normalizedInput.source_event_id
        );
        assertReceiptCoordinatesInsideTransaction(this.database, event);
        assertRawEventMirrorInsideTransaction(this.database, event);
        storedFingerprint = fingerprintStoredRawEvent(event);
      } catch (error) {
        rollback(this.database);
        return lookupStatus(classifyLookupFailure(error, true));
      }

      this.database.exec("COMMIT;");
      if (storedFingerprint !== normalizedInput.ingest_fingerprint) {
        return lookupStatus("IDENTITY_COLLISION");
      }
      return {
        capability: EXACT_RAW_RECEIPT_LOOKUP_CAPABILITY_NAME,
        version: EXACT_RAW_RECEIPT_LOOKUP_VERSION,
        status: "FOUND_EXACT",
        ingest_fingerprint: storedFingerprint,
        receipt: {
          id: event.id,
          session_id: event.session_id,
          seq: event.seq,
          source_event_id: event.source_event_id as string,
        },
      };
    } catch (error) {
      rollback(this.database);
      return lookupStatus(classifyLookupFailure(error, false));
    }
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

interface NormalizedRawIngestFingerprint {
  session_id: string;
  source_event_id: string;
  role: RawEventRole;
  content: string;
  event_type: string;
  created_at_identity: string;
  token_count: number;
  metadata_json: string;
  dense_embedding_json: string | null;
}

interface NormalizedRawReceiptLookupInput {
  readonly session_id: string;
  readonly source_event_id: string;
  readonly ingest_fingerprint: string;
}

function normalizeFingerprintInput(input: RawIngestFingerprintInput): NormalizedRawIngestFingerprint {
  const snapshot = snapshotExactDataObject(input, [
    "session_id", "source_event_id", "role", "content", "created_at",
  ], ["event_type", "token_count", "metadata", "dense_embedding"]);
  const sessionId = snapshot.session_id;
  const sourceEventId = snapshot.source_event_id;
  const role = snapshot.role;
  const content = snapshot.content;
  const createdAt = snapshot.created_at;
  const eventType = snapshot.event_type;
  const tokenCount = snapshot.token_count;
  const metadataInput = snapshot.metadata;
  const denseEmbeddingInput = snapshot.dense_embedding;
  if (typeof sessionId !== "string" || sessionId.length === 0 ||
      typeof sourceEventId !== "string" || sourceEventId.length === 0 ||
      typeof content !== "string" ||
      typeof role !== "string" || !["system", "user", "assistant", "tool"].includes(role)) {
    throw new RawReceiptLookupInputError();
  }
  if (eventType !== undefined &&
      (typeof eventType !== "string" || eventType.length === 0)) {
    throw new RawReceiptLookupInputError();
  }
  if (tokenCount !== undefined &&
      (!Number.isSafeInteger(tokenCount) || (tokenCount as number) < 0)) {
    throw new RawReceiptLookupInputError();
  }
  const timestamp = parseRawEventTimestamp(
    createdAt,
    RAW_EVENT_COMPATIBLE_TIMESTAMP_PATTERN
  );
  const metadata = metadataInput === undefined ? {} : normalizeMetadata(metadataInput as JsonObject);
  const denseEmbedding = denseEmbeddingInput === undefined
    ? undefined
    : normalizeDenseEmbedding(denseEmbeddingInput, "dense_embedding");
  return Object.freeze({
    session_id: sessionId,
    source_event_id: sourceEventId,
    role: role as RawEventRole,
    content,
    event_type: (eventType as string | undefined) ?? "message",
    created_at_identity: timestamp.exact_instant_identity,
    token_count: (tokenCount as number | undefined) ?? estimateTokens(content),
    metadata_json: JSON.stringify(metadata),
    dense_embedding_json: denseEmbedding === undefined ? null : JSON.stringify(denseEmbedding),
  });
}

function fingerprintNormalizedRawIngest(input: NormalizedRawIngestFingerprint): string {
  const frame = JSON.stringify([
    RAW_INGEST_FINGERPRINT_VERSION,
    input.session_id,
    input.source_event_id,
    input.role,
    input.content,
    input.event_type,
    input.created_at_identity,
    input.token_count,
    input.metadata_json,
    input.dense_embedding_json,
  ]);
  const digest = createHash("sha256").update(frame, "utf8").digest("hex");
  return `${RAW_INGEST_FINGERPRINT_VERSION}:${digest}`;
}

function fingerprintStoredRawEvent(event: RawEvent): string {
  return fingerprintNormalizedRawIngest({
    session_id: event.session_id,
    source_event_id: event.source_event_id as string,
    role: event.role,
    content: event.content,
    event_type: event.event_type,
    created_at_identity: parseRawEventTimestamp(
      event.created_at,
      RAW_EVENT_COMPATIBLE_TIMESTAMP_PATTERN
    ).exact_instant_identity,
    token_count: event.token_count,
    metadata_json: JSON.stringify(event.metadata),
    dense_embedding_json: event.dense_embedding === undefined
      ? null
      : JSON.stringify(event.dense_embedding),
  });
}

function normalizeLookupInput(input: RawReceiptLookupInput): NormalizedRawReceiptLookupInput {
  const snapshot = snapshotExactDataObject(
    input,
    ["session_id", "source_event_id", "ingest_fingerprint"],
    []
  );
  const sessionId = snapshot.session_id;
  const sourceEventId = snapshot.source_event_id;
  const ingestFingerprint = snapshot.ingest_fingerprint;
  if (
    typeof sessionId !== "string" || sessionId.length === 0 ||
    typeof sourceEventId !== "string" || sourceEventId.length === 0 ||
    typeof ingestFingerprint !== "string" ||
    !new RegExp(`^${RAW_INGEST_FINGERPRINT_VERSION}:[0-9a-f]{64}$`, "u")
      .test(ingestFingerprint)
  ) {
    throw new RawReceiptLookupInputError();
  }
  return Object.freeze({
    session_id: sessionId,
    source_event_id: sourceEventId,
    ingest_fingerprint: ingestFingerprint,
  });
}

function snapshotExactDataObject(
  value: unknown,
  required: readonly string[],
  optional: readonly string[]
): Readonly<Record<string, unknown>> {
  try {
    if (typeof value !== "object" || value === null) {
      throw new RawReceiptLookupInputError();
    }
    if (isProxy(value) || Array.isArray(value)) {
      throw new RawReceiptLookupInputError();
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new RawReceiptLookupInputError();
    }
    const allowed = new Set([...required, ...optional]);
    const descriptors = snapshotOwnDataDescriptors(value, allowed);
    for (const key of required) {
      if (!descriptors.has(key)) throw new RawReceiptLookupInputError();
    }

    const snapshot = Object.create(null) as Record<string, unknown>;
    const ancestors = new Set<object>([value]);
    for (const [key, descriptor] of descriptors) {
      Object.defineProperty(snapshot, key, {
        value: snapshotCallerValue(descriptor.value, ancestors),
        enumerable: true,
        writable: false,
        configurable: false,
      });
    }
    return Object.freeze(snapshot);
  } catch (error) {
    if (error instanceof RawReceiptLookupInputError) throw error;
    throw new RawReceiptLookupInputError();
  }
}

function snapshotOwnDataDescriptors(
  value: object,
  allowed?: ReadonlySet<string>
): Map<string, PropertyDescriptor & { value: unknown }> {
  const descriptors = new Map<string, PropertyDescriptor & { value: unknown }>();
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string" || (allowed !== undefined && !allowed.has(key))) {
      throw new RawReceiptLookupInputError();
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor?.enumerable || !hasDataDescriptorValue(descriptor)) {
      throw new RawReceiptLookupInputError();
    }
    descriptors.set(key, descriptor);
  }
  return descriptors;
}

function snapshotCallerValue(value: unknown, ancestors: Set<object>): unknown {
  if (value === null || typeof value !== "object") return value;
  if (isProxy(value) || ancestors.has(value)) throw new RawReceiptLookupInputError();

  const isArray = Array.isArray(value);
  const prototype = Object.getPrototypeOf(value);
  if (isArray) {
    if (prototype !== Array.prototype) throw new RawReceiptLookupInputError();
    const keys = Reflect.ownKeys(value);
    const descriptors = new Map<string, PropertyDescriptor & { value: unknown }>();
    let lengthDescriptor: (PropertyDescriptor & { value: unknown }) | undefined;
    for (const key of keys) {
      if (typeof key !== "string") throw new RawReceiptLookupInputError();
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (key === "length") {
        if (!hasDataDescriptorValue(descriptor) || descriptor.enumerable) {
          throw new RawReceiptLookupInputError();
        }
        lengthDescriptor = descriptor;
        continue;
      }
      if (!/^(0|[1-9]\d*)$/u.test(key) || !descriptor?.enumerable ||
          !hasDataDescriptorValue(descriptor)) {
        throw new RawReceiptLookupInputError();
      }
      descriptors.set(key, descriptor);
    }
    const length = lengthDescriptor?.value;
    if (!Number.isSafeInteger(length) || (length as number) < 0 ||
        (length as number) > 4_294_967_295) {
      throw new RawReceiptLookupInputError();
    }
    for (const key of descriptors.keys()) {
      if (Number(key) >= (length as number)) throw new RawReceiptLookupInputError();
    }
    const snapshot = new Array<unknown>(length as number);
    ancestors.add(value);
    try {
      for (let index = 0; index < (length as number); index += 1) {
        const descriptor = descriptors.get(String(index));
        if (descriptor === undefined) throw new RawReceiptLookupInputError();
        snapshot[index] = snapshotCallerValue(descriptor.value, ancestors);
      }
    } finally {
      ancestors.delete(value);
    }
    return Object.freeze(snapshot);
  }

  if (prototype !== Object.prototype && prototype !== null) {
    throw new RawReceiptLookupInputError();
  }
  const descriptors = snapshotOwnDataDescriptors(value);
  const snapshot = Object.create(null) as Record<string, unknown>;
  ancestors.add(value);
  try {
    for (const [key, descriptor] of descriptors) {
      Object.defineProperty(snapshot, key, {
        value: snapshotCallerValue(descriptor.value, ancestors),
        enumerable: true,
        writable: false,
        configurable: false,
      });
    }
  } finally {
    ancestors.delete(value);
  }
  return Object.freeze(snapshot);
}

function hasDataDescriptorValue(
  descriptor: PropertyDescriptor | undefined
): descriptor is PropertyDescriptor & { value: unknown } {
  return descriptor !== undefined && Object.prototype.hasOwnProperty.call(descriptor, "value");
}

function strictRowToEvent(
  row: DatabaseRow,
  expectedSessionId: string,
  expectedSourceEventId: string
): RawEvent {
  if (
    typeof row.id !== "string" || row.id.length === 0 ||
    typeof row.session_id !== "string" || row.session_id !== expectedSessionId ||
    typeof row.source_event_id !== "string" || row.source_event_id !== expectedSourceEventId ||
    !Number.isSafeInteger(row.seq) || row.seq <= 0 ||
    !["system", "user", "assistant", "tool"].includes(row.role) ||
    typeof row.content !== "string" ||
    typeof row.event_type !== "string" || row.event_type.length === 0 ||
    typeof row.created_at !== "string" ||
    !Number.isSafeInteger(row.token_count) || row.token_count < 0 ||
    typeof row.metadata_json !== "string" ||
    (row.dense_embedding_json !== null && typeof row.dense_embedding_json !== "string")
  ) {
    throw new Error("Malformed stored Raw event");
  }
  const event = rowToEvent(row);
  if (JSON.stringify(event.metadata) !== row.metadata_json) {
    throw new Error("Stored Raw metadata is not canonical");
  }
  if (event.dense_embedding !== undefined &&
      JSON.stringify(event.dense_embedding) !== row.dense_embedding_json) {
    throw new Error("Stored Raw dense embedding is not canonical");
  }
  return event;
}

function assertReceiptCoordinatesInsideTransaction(database: DatabaseSync, event: RawEvent): void {
  const sessions = database.prepare("SELECT id FROM sessions WHERE id = ?")
    .all(event.session_id) as Array<{ id: unknown }>;
  if (sessions.length !== 1 || sessions[0].id !== event.session_id) {
    throw new Error("Raw receipt session coordinate is corrupt");
  }
  const coordinates = database.prepare(
    "SELECT id, session_id, seq FROM raw_events WHERE id = ? OR (session_id = ? AND seq = ?)"
  ).all(event.id, event.session_id, event.seq) as Array<{
    id: unknown;
    session_id: unknown;
    seq: unknown;
  }>;
  if (coordinates.length !== 1 || coordinates[0].id !== event.id ||
      coordinates[0].session_id !== event.session_id || coordinates[0].seq !== event.seq) {
    throw new Error("Raw receipt identity coordinates are corrupt");
  }
}

function lookupStatus<Status extends Exclude<ExactRawReceiptLookupStatus, "FOUND_EXACT">>(
  status: Status
): RawReceiptLookupBase<Status> {
  return {
    capability: EXACT_RAW_RECEIPT_LOOKUP_CAPABILITY_NAME,
    version: EXACT_RAW_RECEIPT_LOOKUP_VERSION,
    status,
  };
}

function classifyLookupFailure(
  error: unknown,
  validatingStoredProof: boolean
): "CORRUPT_DATA" | "UNAVAILABLE" {
  if (error instanceof ExperienceLedgerError) {
    return error.code === "CLOSED" ? "UNAVAILABLE" : "CORRUPT_DATA";
  }
  if (typeof error === "object" && error !== null) {
    const candidate = error as { code?: unknown; errcode?: unknown; errstr?: unknown };
    const code = typeof candidate.code === "string" ? candidate.code : "";
    const detail = typeof candidate.errstr === "string" ? candidate.errstr.toLowerCase() : "";
    if (candidate.errcode === 11 || code.includes("CORRUPT") || code.includes("NOTADB") ||
        detail.includes("malformed") || detail.includes("corrupt") ||
        detail.includes("not a database")) {
      return "CORRUPT_DATA";
    }
    if (code === "ERR_SQLITE_ERROR" || code.startsWith("SQLITE_") ||
        typeof candidate.errcode === "number") {
      return "UNAVAILABLE";
    }
  }
  return validatingStoredProof ? "CORRUPT_DATA" : "UNAVAILABLE";
}

/** @internal Shared only with Core-owned storage composition. */
export function migrateRawHistoryStore(database: DatabaseSync): void {
  database.exec("BEGIN IMMEDIATE;");
  try {
    migrateRawHistoryStoreInsideTransaction(database);
    database.exec("COMMIT;");
  } catch (error) {
    rollback(database);
    throw error;
  }
}

/** @internal Caller owns the surrounding SQLite write transaction. */
export function migrateRawHistoryStoreInsideTransaction(database: DatabaseSync): void {
  const before = classifyRawSchema(database, true);
  if (before === "INVALID") throw new RawHistorySchemaError();
  if (before === "CURRENT") validateRawHistorySchema(database);
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
    validateRawHistorySchema(database);
  } catch (error) {
    throw error;
  }
}

/** @internal Exact accepted current-or-explicit-legacy Raw schema proof. */
export function validateRawHistorySchema(database: DatabaseSync): void {
  const variant = classifyRawSchema(database, false);
  if (variant !== "CURRENT" && variant !== "LEGACY") throw new RawHistorySchemaError();
  for (const expected of RAW_AUXILIARY_SCHEMA_OBJECTS) {
    const row = database.prepare(
      "SELECT type, name, sql FROM sqlite_master WHERE type = ? AND name = ?"
    ).get(expected.type, expected.name) as {
      type: string; name: string; sql: string | null;
    } | undefined;
    if (
      row?.type !== expected.type || row.name !== expected.name ||
      typeof row.sql !== "string" ||
      normalizeRawSchemaSql(row.sql) !== normalizeRawSchemaSql(expected.sql)
    ) throw new RawHistorySchemaError();
  }
  const indexes = database.prepare("PRAGMA index_list(raw_events)").all() as Array<{
    name: string; unique: number;
  }>;
  const expectedIndexes = new Map([
    ["idx_raw_events_session_seq", 0],
    ["sqlite_autoindex_raw_events_1", 1],
    ["sqlite_autoindex_raw_events_2", 1],
    ["sqlite_autoindex_raw_events_3", 1],
  ]);
  if (indexes.length !== expectedIndexes.size || indexes.some((row) =>
    expectedIndexes.get(row.name) !== row.unique)) throw new RawHistorySchemaError();
  const foreignKeys = database.prepare("PRAGMA foreign_key_list(raw_events)").all() as Array<{
    table: string; from: string; to: string; on_update: string; on_delete: string; match: string;
  }>;
  if (foreignKeys.length !== 1 || foreignKeys[0]?.table !== "sessions" ||
      foreignKeys[0].from !== "session_id" || foreignKeys[0].to !== "id" ||
      foreignKeys[0].on_update !== "NO ACTION" || foreignKeys[0].on_delete !== "NO ACTION" ||
      foreignKeys[0].match !== "NONE") throw new RawHistorySchemaError();
}

type RawSchemaVariant = "ABSENT" | "CURRENT" | "LEGACY" | "INVALID";

function classifyRawSchema(database: DatabaseSync, allowLegacyWithoutDense: boolean): RawSchemaVariant {
  const session = schemaSql(database, "table", "sessions");
  const raw = schemaSql(database, "table", "raw_events");
  if (session === undefined && raw === undefined) return "ABSENT";
  if (session === undefined || raw === undefined) return "INVALID";
  const sessionSql = normalizeRawSchemaSql(session);
  const rawSql = normalizeRawSchemaSql(raw);
  if (
    sessionSql === normalizeRawSchemaSql(CURRENT_SESSIONS_SQL) &&
    rawSql === normalizeRawSchemaSql(CURRENT_RAW_EVENTS_SQL)
  ) return "CURRENT";
  const acceptedSession = sessionSql === normalizeRawSchemaSql(CURRENT_SESSIONS_SQL) ||
    sessionSql === normalizeRawSchemaSql(LEGACY_SESSIONS_SQL);
  const acceptedDenseRaw = rawSql === normalizeRawSchemaSql(CURRENT_RAW_EVENTS_SQL) ||
    rawSql === normalizeRawSchemaSql(LEGACY_RAW_EVENTS_WITH_DENSE_SQL);
  const acceptedPreDenseRaw = rawSql ===
      normalizeRawSchemaSql(CURRENT_RAW_EVENTS_WITHOUT_DENSE_SQL) ||
    rawSql === normalizeRawSchemaSql(LEGACY_RAW_EVENTS_WITHOUT_DENSE_SQL);
  if (acceptedSession && (acceptedDenseRaw ||
      (allowLegacyWithoutDense && acceptedPreDenseRaw))) return "LEGACY";
  return "INVALID";
}

function schemaSql(
  database: DatabaseSync,
  type: "table" | "index" | "trigger",
  name: string
): string | undefined {
  const row = database.prepare(
    "SELECT sql FROM sqlite_master WHERE type = ? AND name = ?"
  ).get(type, name) as { sql: string | null } | undefined;
  return typeof row?.sql === "string" ? row.sql : undefined;
}

function normalizeRawSchemaSql(sql: string): string {
  return sql.trim()
    .replace(/\s+/gu, " ")
    .replace(/\s*([(),])\s*/gu, "$1")
    .replace(/;$/u, "");
}

const CURRENT_SESSIONS_SQL = `CREATE TABLE sessions (
  id TEXT PRIMARY KEY CHECK (length(id) > 0),
  created_at TEXT NOT NULL
)`;

const LEGACY_SESSIONS_SQL = `CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL
)`;

const CURRENT_RAW_EVENTS_SQL = `CREATE TABLE raw_events (
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
)`;

const CURRENT_RAW_EVENTS_WITHOUT_DENSE_SQL = `CREATE TABLE raw_events (
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
)`;

const LEGACY_RAW_EVENTS_WITHOUT_DENSE_SQL = `CREATE TABLE raw_events (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id),
  seq INTEGER NOT NULL,
  source_event_id TEXT,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  event_type TEXT NOT NULL,
  created_at TEXT NOT NULL,
  token_count INTEGER NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  UNIQUE (session_id, seq),
  UNIQUE (session_id, source_event_id)
)`;

const LEGACY_RAW_EVENTS_WITH_DENSE_SQL = `CREATE TABLE raw_events (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id),
  seq INTEGER NOT NULL,
  source_event_id TEXT,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  event_type TEXT NOT NULL,
  created_at TEXT NOT NULL,
  token_count INTEGER NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  dense_embedding_json TEXT,
  UNIQUE (session_id, seq),
  UNIQUE (session_id, source_event_id)
)`;

const RAW_AUXILIARY_SCHEMA_OBJECTS = [
  {
    type: "index",
    name: "idx_raw_events_session_seq",
    sql: `CREATE INDEX idx_raw_events_session_seq
      ON raw_events(session_id, seq)`,
  },
  {
    type: "trigger",
    name: "raw_events_prevent_update",
    sql: `CREATE TRIGGER raw_events_prevent_update
      BEFORE UPDATE ON raw_events
      BEGIN
        SELECT RAISE(ABORT, 'raw_events is append-only');
      END`,
  },
  {
    type: "trigger",
    name: "raw_events_prevent_delete",
    sql: `CREATE TRIGGER raw_events_prevent_delete
      BEFORE DELETE ON raw_events
      BEGIN
        SELECT RAISE(ABORT, 'raw_events is append-only');
      END`,
  },
] as const;

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
