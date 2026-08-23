import type { DatabaseSync } from "node:sqlite";

const INITIALIZATION_RETRY_DELAYS_MS = [5, 10, 20, 40, 80, 160, 320] as const;
const WAIT_BUFFER = new Int32Array(new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT));

/**
 * Configure and initialize one SQLite connection without leaking a safe fresh-DB
 * busy/locked race to callers. Only SQLite BUSY/LOCKED is retried; every other
 * schema, ALTER, corruption, validation, or I/O error is returned unchanged.
 */
export function initializeSqliteConnection(
  database: DatabaseSync,
  databasePath: string,
  initializeSchema: () => void
): void {
  database.exec("PRAGMA foreign_keys = ON;");
  database.exec("PRAGMA busy_timeout = 5000;");
  database.exec("PRAGMA synchronous = FULL;");
  if (databasePath !== ":memory:") {
    retrySafeInitializationBusy(() => database.exec("PRAGMA journal_mode = WAL;"));
  }
  retrySafeInitializationBusy(initializeSchema);
}

export function retrySafeInitializationBusy(operation: () => void): void {
  for (let attempt = 0; ; attempt += 1) {
    try {
      operation();
      return;
    } catch (error) {
      const delay = INITIALIZATION_RETRY_DELAYS_MS[attempt];
      if (delay === undefined || !isSqliteBusyOrLocked(error)) throw error;
      Atomics.wait(WAIT_BUFFER, 0, 0, delay);
    }
  }
}

function isSqliteBusyOrLocked(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const candidate = error as { code?: unknown; errcode?: unknown };
  if (candidate.errcode === 5 || candidate.errcode === 6) {
    return candidate.code === "ERR_SQLITE_ERROR" || candidate.code === undefined;
  }
  return typeof candidate.code === "string" &&
    (candidate.code === "SQLITE_BUSY" || candidate.code.startsWith("SQLITE_BUSY_") ||
     candidate.code === "SQLITE_LOCKED" || candidate.code.startsWith("SQLITE_LOCKED_"));
}
