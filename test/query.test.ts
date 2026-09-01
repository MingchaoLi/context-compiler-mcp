// @vitest-environment node

import { writeFile } from "node:fs/promises";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CoreReadQuery } from "../src/query.js";
import {
  CASE_FORMATION_READ_CONTRACT_VERSION,
  CASE_FORMATION_SESSION_SCOPE_VERSION,
} from "../src/case-formation.js";
import { SqliteHistoryRecallStore } from "../src/recall.js";
import { SqliteRawHistoryStore } from "../src/raw-store.js";

describe("CoreReadQuery", () => {
  let temporaryDirectory: string;
  let databasePath: string;
  let readQuery: CoreReadQuery | undefined;

  beforeEach(async () => {
    temporaryDirectory = await mkdtemp(join(tmpdir(), "context-compiler-query-"));
    databasePath = join(temporaryDirectory, "context-compiler.db");
  });

  afterEach(async () => {
    readQuery?.close();
    await rm(temporaryDirectory, { recursive: true, force: true });
  });

  function seed(): void {
    const store = new SqliteRawHistoryStore(databasePath);
    store.ingest({
      session_id: "session-a",
      role: "user",
      content: "remember the synthetic launch date",
      event_type: "message",
      created_at: "2026-08-22T08:30:00.000Z",
      token_count: 5,
      metadata: {},
    });
    store.ingest({
      session_id: "session-a",
      role: "assistant",
      content: "synthetic date noted",
      event_type: "message",
      created_at: "2026-08-22T08:31:00.000Z",
      token_count: 2,
      metadata: {},
    });
    store.ingest({
      session_id: "session-b",
      role: "user",
      content: "second synthetic session",
      event_type: "message",
      created_at: "2026-08-23T09:00:00.000Z",
      token_count: 3,
      metadata: {},
    });
    store.close();
    const recall = new SqliteHistoryRecallStore(databasePath);
    recall.createHeadline({
      session_id: "session-a",
      event_start_seq: 1,
      event_end_seq: 2,
      headline: "Synthetic launch decision",
      keywords: ["launch", "synthetic"],
      created_at: "2026-08-22T08:32:00.000Z",
    });
    recall.close();
  }

  it("lists and keyset-paginates session summaries", () => {
    seed();
    readQuery = new CoreReadQuery(databasePath);
    const first = readQuery.listSessions({ limit: 1 });
    expect(first).toEqual({
      items: [{ session_id: "session-a", created_at: "2026-08-22T08:30:00.000Z" }],
      next_cursor: "session-a",
    });
    expect(readQuery.listSessions({ limit: 1, cursor: first.next_cursor! })).toEqual({
      items: [{ session_id: "session-b", created_at: "2026-08-23T09:00:00.000Z" }],
      next_cursor: null,
    });
  });

  it("preserves missing-session undefined and the existing Context-State projection", () => {
    seed();
    readQuery = new CoreReadQuery(databasePath);
    expect(readQuery.getSession("session-a")).toEqual({
      session_id: "session-a",
      created_at: "2026-08-22T08:30:00.000Z",
    });
    expect(readQuery.getSession("missing-session")).toBeUndefined();
    expect(readQuery.getState("session-a")).toEqual({
      session_id: "session-a",
      items: [],
      relations: [],
      revision: 0,
    });
  });

  it("delegates exact and keyword recall without exposing a writer", () => {
    seed();
    readQuery = new CoreReadQuery(databasePath);
    const exact = readQuery.recallExact({
      kind: "seq_range",
      session_id: "session-a",
      event_start_seq: 1,
      event_end_seq: 2,
    });
    if (exact.kind !== "seq_range") throw new Error("expected seq_range recall");
    expect(exact.events.map((event) => event.content)).toEqual([
      "remember the synthetic launch date",
      "synthetic date noted",
    ]);
    const keyword = readQuery.recallKeyword({ session_id: "session-a", query: "launch", limit: 5 });
    expect(keyword).toHaveLength(1);
    expect(keyword[0]?.events[0]?.content).toBe("remember the synthetic launch date");
    expect("ingest" in readQuery).toBe(false);
    expect("databasePath" in readQuery).toBe(false);
  });

  it("exposes Case/Conclusion through the dedicated read-only query surface", () => {
    seed();
    readQuery = new CoreReadQuery(databasePath);
    expect(readQuery.readCaseFormation({
      contract: CASE_FORMATION_READ_CONTRACT_VERSION,
      schema_version: 1,
      session_scope: {
        contract_version: CASE_FORMATION_SESSION_SCOPE_VERSION,
        write_session: { namespace: "authority", session_id: "session-a" },
        read_scope: [{
          session: { namespace: "authority", session_id: "session-a" },
          frontier: { kind: "CURRENT" }, precedence: 0,
        }],
      },
    })).toMatchObject({ cases: [], raw_only_finalizations: [] });
    expect("commitCaseConclusion" in readQuery).toBe(false);
    expect("abstainCaseFormation" in readQuery).toBe(false);
  });

  it("returns stable sanitized failures for invalid pagination", () => {
    seed();
    readQuery = new CoreReadQuery(databasePath);
    for (const operation of [
      () => readQuery!.listSessions({ limit: 0 }),
      () => readQuery!.listSessions({ limit: 101 }),
      () => readQuery!.listSessions({ limit: 1, cursor: "x".repeat(513) }),
    ]) {
      expectSanitizedFailure(operation, "Invalid Core read query request", databasePath);
    }
  });

  it("returns stable sanitized failures from every read after close", () => {
    seed();
    readQuery = new CoreReadQuery(databasePath);
    readQuery.close();
    for (const operation of [
      () => readQuery!.listSessions({ limit: 1 }),
      () => readQuery!.getSession("session-a"),
      () => readQuery!.getState("session-a"),
      () => readQuery!.recallExact({
        kind: "seq_range" as const,
        session_id: "session-a",
        event_start_seq: 1,
        event_end_seq: 2,
      }),
      () => readQuery!.recallKeyword({ session_id: "session-a", query: "launch", limit: 5 }),
      () => readQuery!.readCaseFormation({
        contract: CASE_FORMATION_READ_CONTRACT_VERSION,
        schema_version: 1,
        session_scope: {
          contract_version: CASE_FORMATION_SESSION_SCOPE_VERSION,
          write_session: { namespace: "authority", session_id: "session-a" },
          read_scope: [{
            session: { namespace: "authority", session_id: "session-a" },
            frontier: { kind: "CURRENT" }, precedence: 0,
          }],
        },
      }),
    ]) {
      expectSanitizedFailure(operation, "Core read query is closed", databasePath);
    }
  });

  it("sanitizes storage failures discovered after opening", () => {
    seed();
    readQuery = new CoreReadQuery(databasePath);
    const tamper = new DatabaseSync(databasePath);
    tamper.exec("ALTER TABLE sessions RENAME TO query_storage_marker");
    tamper.close();

    expectSanitizedFailure(
      () => readQuery!.listSessions({ limit: 1 }),
      "Core read query is unavailable",
      databasePath
    );
    expectSanitizedFailure(
      () => readQuery!.getSession("session-a"),
      "Core read query is unavailable",
      databasePath
    );
  });

  it("sanitizes constructor storage failures", async () => {
    await writeFile(databasePath, "synthetic invalid storage bytes", "utf8");
    expectSanitizedFailure(
      () => new CoreReadQuery(databasePath),
      "Core read query is unavailable",
      databasePath
    );
  });
});

function expectSanitizedFailure(
  operation: () => unknown,
  message: string,
  databasePath: string
): void {
  let failure: unknown;
  try {
    operation();
  } catch (error) {
    failure = error;
  }
  expect(failure).toBeInstanceOf(Error);
  const error = failure as Error;
  expect(error.name).toBe("CoreReadQueryError");
  expect(error.message).toBe(message);
  expect(error.stack).toBe(`CoreReadQueryError: ${message}`);
  const publicEvidence = `${error.name}\n${error.message}\n${error.stack ?? ""}`;
  for (const forbidden of [databasePath, "sessions", "query_storage_marker", "SELECT", "SQLITE", "src/query.ts", " at "]) {
    expect(publicEvidence).not.toContain(forbidden);
  }
}
