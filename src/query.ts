import {
  SqliteRawHistoryStore,
  validateCompatibleRawEventTimestamp,
  type SessionListInput,
  type SessionListResult,
  type SessionSummary,
} from "./raw-store.js";
import {
  SqliteHistoryRecallStore,
  type ExactRecallQuery,
  type ExactRecallResult,
  type KeywordRecallHit,
  type KeywordRecallQuery,
} from "./recall.js";
import { SqliteContextStateStore } from "./state-store.js";
import type { ContextItem, StateRelation } from "./state-types.js";

export type {
  SessionListInput,
  SessionListResult,
  SessionSummary,
  ExactRecallQuery,
  ExactRecallResult,
  KeywordRecallHit,
  KeywordRecallQuery,
};

/** Read-only projection of the existing Context State for one session. */
export interface ReadStateProjection {
  session_id: string;
  items: ContextItem[];
  relations: StateRelation[];
  revision: number;
}

const INVALID_QUERY_INPUT = "Invalid Core read query request";
const QUERY_UNAVAILABLE = "Core read query is unavailable";
const QUERY_CLOSED = "Core read query is closed";

/**
 * Dedicated, read-only RippleContext query surface for page/Console backends.
 *
 * It exposes only enumeration and recall reads. It never exposes write,
 * authority, storage schema, database paths or credentials. This is a separate
 * package subpath from the nine-tool MCP service and the full library root.
 */
export class CoreReadQuery {
  readonly #raw: SqliteRawHistoryStore;
  readonly #state: SqliteContextStateStore;
  readonly #recall: SqliteHistoryRecallStore;
  #closed = false;

  constructor(databasePath: string) {
    if (typeof databasePath !== "string" || databasePath.length === 0) {
      throw queryFailure(INVALID_QUERY_INPUT);
    }
    let raw: SqliteRawHistoryStore | undefined;
    let state: SqliteContextStateStore | undefined;
    let recall: SqliteHistoryRecallStore | undefined;
    try {
      raw = new SqliteRawHistoryStore(databasePath);
      state = new SqliteContextStateStore(databasePath);
      recall = new SqliteHistoryRecallStore(databasePath);
    } catch {
      safeClose(raw);
      safeClose(state);
      safeClose(recall);
      throw queryFailure(QUERY_UNAVAILABLE);
    }
    this.#raw = raw;
    this.#state = state;
    this.#recall = recall;
  }

  listSessions(input: SessionListInput): SessionListResult {
    this.#assertOpen();
    const normalized = normalizeSessionListInput(input);
    return this.#read(() => normalizeSessionListResult(
      this.#raw.listSessions(normalized),
      normalized
    ));
  }

  getSession(sessionId: string): SessionSummary | undefined {
    this.#assertOpen();
    const normalizedSessionId = normalizeSessionId(sessionId);
    return this.#read(() => {
      const session = this.#raw.getSession(normalizedSessionId);
      return session === undefined ? undefined : normalizeSessionSummary(session);
    });
  }

  getState(sessionId: string): ReadStateProjection {
    this.#assertOpen();
    const normalizedSessionId = normalizeSessionId(sessionId);
    return this.#read(() => ({
      session_id: normalizedSessionId,
      items: this.#state.getItems(normalizedSessionId),
      relations: this.#state.getSessionRelations(normalizedSessionId),
      revision: this.#state.getRevision(normalizedSessionId),
    }));
  }

  recallExact(query: ExactRecallQuery): ExactRecallResult {
    this.#assertOpen();
    return this.#read(() => this.#recall.recallExact(query));
  }

  recallKeyword(query: KeywordRecallQuery): KeywordRecallHit[] {
    this.#assertOpen();
    return this.#read(() => this.#recall.recallKeyword(query));
  }

  close(): void {
    if (this.#closed) return;
    this.#closed = true;
    try {
      this.#raw.close();
    } catch {
      /* shutdown remains deterministic */
    }
    try {
      this.#state.close();
    } catch {
      /* shutdown remains deterministic */
    }
    try {
      this.#recall.close();
    } catch {
      /* shutdown remains deterministic */
    }
  }

  #assertOpen(): void {
    if (this.#closed) throw queryFailure(QUERY_CLOSED);
  }

  #read<Result>(read: () => Result): Result {
    try {
      return read();
    } catch {
      throw queryFailure(QUERY_UNAVAILABLE);
    }
  }
}

function normalizeSessionListInput(input: SessionListInput): SessionListInput {
  try {
    if (typeof input !== "object" || input === null || Array.isArray(input)) {
      throw new Error();
    }
    const limit = input.limit;
    const cursor = input.cursor;
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100 ||
        (cursor !== undefined && (typeof cursor !== "string" || cursor.length > 512))) {
      throw new Error();
    }
    return cursor === undefined ? { limit } : { limit, cursor };
  } catch {
    throw queryFailure(INVALID_QUERY_INPUT);
  }
}

function normalizeSessionId(sessionId: string): string {
  if (typeof sessionId !== "string" || sessionId.length === 0) {
    throw queryFailure(INVALID_QUERY_INPUT);
  }
  return sessionId;
}

function normalizeSessionListResult(
  result: SessionListResult,
  input: SessionListInput
): SessionListResult {
  if (typeof result !== "object" || result === null || !Array.isArray(result.items) ||
      result.items.length > input.limit ||
      (result.next_cursor !== null && typeof result.next_cursor !== "string")) {
    throw new Error();
  }
  const items = result.items.map(normalizeSessionSummary);
  if (result.next_cursor !== null &&
      (items.length === 0 || result.next_cursor !== items[items.length - 1]!.session_id)) {
    throw new Error();
  }
  return { items, next_cursor: result.next_cursor };
}

function normalizeSessionSummary(summary: SessionSummary): SessionSummary {
  if (typeof summary !== "object" || summary === null ||
      typeof summary.session_id !== "string" || summary.session_id.length === 0 ||
      typeof summary.created_at !== "string") {
    throw new Error();
  }
  validateCompatibleRawEventTimestamp(summary.created_at);
  return { session_id: summary.session_id, created_at: summary.created_at };
}

function safeClose(store: { close(): void } | undefined): void {
  try {
    store?.close();
  } catch {
    /* construction failure remains a stable query-surface failure */
  }
}

function queryFailure(message: string): Error {
  const error = new Error(message);
  Object.defineProperty(error, "name", {
    value: "CoreReadQueryError",
    configurable: false,
    enumerable: false,
    writable: false,
  });
  Object.defineProperty(error, "stack", {
    value: `CoreReadQueryError: ${message}`,
    configurable: false,
    enumerable: false,
    writable: false,
  });
  return error;
}
