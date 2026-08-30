import {
  SqliteRawHistoryStore,
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
      throw new Error("databasePath must not be empty");
    }
    this.#raw = new SqliteRawHistoryStore(databasePath);
    this.#state = new SqliteContextStateStore(databasePath);
    this.#recall = new SqliteHistoryRecallStore(databasePath);
  }

  listSessions(input: SessionListInput): SessionListResult {
    this.#assertOpen();
    return this.#raw.listSessions(input);
  }

  getSession(sessionId: string): SessionSummary | undefined {
    this.#assertOpen();
    return this.#raw.getSession(sessionId);
  }

  getState(sessionId: string): ReadStateProjection {
    this.#assertOpen();
    return {
      session_id: sessionId,
      items: this.#state.getItems(sessionId),
      relations: this.#state.getSessionRelations(sessionId),
      revision: this.#state.getRevision(sessionId),
    };
  }

  recallExact(query: ExactRecallQuery): ExactRecallResult {
    this.#assertOpen();
    return this.#recall.recallExact(query);
  }

  recallKeyword(query: KeywordRecallQuery): KeywordRecallHit[] {
    this.#assertOpen();
    return this.#recall.recallKeyword(query);
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
    if (this.#closed) throw new Error("query surface is closed");
  }
}
