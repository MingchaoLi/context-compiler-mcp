// @vitest-environment node

import { DatabaseSync } from "node:sqlite";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { assembleContext } from "../src/assembler.js";
import {
  HistoryRecallError,
  SqliteHistoryRecallStore,
  type HistoryHeadlineInput,
} from "../src/recall.js";
import { SqliteRawHistoryStore, type JsonObject, type RawEvent } from "../src/raw-store.js";
import { SqliteContextStateStore } from "../src/state-store.js";

describe("SqliteHistoryRecallStore", () => {
  let temporaryDirectory: string;
  let databasePath: string;
  let rawStore: SqliteRawHistoryStore | undefined;
  let recallStore: SqliteHistoryRecallStore | undefined;
  let stateStore: SqliteContextStateStore | undefined;

  beforeEach(async () => {
    temporaryDirectory = await mkdtemp(join(tmpdir(), "tuantuan-recall-"));
    databasePath = join(temporaryDirectory, "context-compiler.db");
  });

  afterEach(async () => {
    recallStore?.close();
    stateStore?.close();
    rawStore?.close();
    await rm(temporaryDirectory, { recursive: true, force: true });
  });

  function openWithEvents(
    sessionId = "session-a",
    contents = ["first evidence", "second evidence", "third evidence"]
  ): RawEvent[] {
    rawStore = new SqliteRawHistoryStore(databasePath);
    const events = contents.map((content, index) =>
      rawStore!.ingest({
        session_id: sessionId,
        source_event_id: `${sessionId}-source-${index + 1}`,
        role: index % 2 === 0 ? "user" : "assistant",
        content,
        created_at: `2026-08-22T10:00:${String(index).padStart(2, "0")}.000Z`,
        metadata: { position: index + 1, nested: { values: [content] } },
      })
    );
    recallStore = new SqliteHistoryRecallStore(databasePath);
    return events;
  }

  function headline(overrides: Partial<HistoryHeadlineInput> = {}): HistoryHeadlineInput {
    return {
      session_id: "session-a",
      event_start_seq: 1,
      event_end_seq: 2,
      headline: "Original architecture decision",
      keywords: ["architecture", "sqlite"],
      created_at: "2026-08-22T11:00:00.000Z",
      ...overrides,
    };
  }

  it("persists headline provenance and returns an equivalent range retry", () => {
    const events = openWithEvents();
    const created = recallStore!.createHeadline(headline());
    const retried = recallStore!.createHeadline(headline({
      created_at: "2026-08-22T12:00:00.000Z",
    }));

    expect(retried).toEqual(created);
    expect(created).toMatchObject({
      session_id: "session-a",
      event_start_seq: 1,
      event_end_seq: 2,
      keywords: ["architecture", "sqlite"],
      created_at: "2026-08-22T11:00:00.000Z",
    });
    expect(recallStore!.recallExact({
      kind: "headline_id",
      session_id: "session-a",
      headline_id: created.id,
    })).toEqual({ kind: "headline_id", found: true, headline: created, events: events.slice(0, 2) });

    recallStore!.close();
    recallStore = new SqliteHistoryRecallStore(databasePath);
    expect(recallStore.recallExact({
      kind: "headline_id",
      session_id: "session-a",
      headline_id: created.id,
    })).toEqual({ kind: "headline_id", found: true, headline: created, events: events.slice(0, 2) });
  });

  it.each([
    ["headline", { headline: "changed" }],
    ["keywords", { keywords: ["changed"] }],
    ["keyword order", { keywords: ["sqlite", "architecture"] }],
  ])("rejects conflicting equivalent-range retry with changed %s", (_label, overrides) => {
    openWithEvents();
    recallStore!.createHeadline(headline());
    expect(() => recallStore!.createHeadline(headline(overrides))).toThrowError(
      expect.objectContaining({ code: "HEADLINE_CONFLICT", category: "conflict" })
    );
    expect(recallStore!.recallKeyword({ session_id: "session-a", query: "architecture" })).toHaveLength(1);
  });

  it("rejects missing, non-contiguous, oversized, and cross-session ranges without a row", () => {
    openWithEvents();
    rawStore!.ingest({ session_id: "session-b", role: "user", content: "foreign" });

    for (const input of [
      headline({ event_start_seq: 2, event_end_seq: 4 }),
      headline({ session_id: "session-b", event_start_seq: 1, event_end_seq: 2 }),
    ]) {
      expect(() => recallStore!.createHeadline(input)).toThrowError(
        expect.objectContaining({ code: "RANGE_NOT_FOUND" })
      );
    }
    expect(() => recallStore!.createHeadline(headline({ event_end_seq: 201 }))).toThrowError(
      expect.objectContaining({ code: "INVALID_INPUT" })
    );
    expect(recallStore!.recallKeyword({ session_id: "session-a", query: "architecture" })).toEqual([]);
  });

  it("rolls back both headline and FTS insertion on a transaction failure", () => {
    openWithEvents();
    const direct = new DatabaseSync(databasePath);
    direct.exec(`
      DROP TABLE history_headlines_fts;
      CREATE TABLE history_headlines_fts (
        headline_id TEXT NOT NULL,
        session_id TEXT NOT NULL,
        headline TEXT NOT NULL CHECK (headline != 'private headline'),
        keywords TEXT NOT NULL
      );
    `);
    direct.close();

    expect(() => recallStore!.createHeadline(headline({ headline: "private headline" }))).toThrowError(
      expect.objectContaining({
        code: "STORAGE_FAILURE",
        message: "History recall storage operation failed",
      })
    );
    recallStore!.close();
    recallStore = undefined;
    const audit = new DatabaseSync(databasePath);
    expect(audit.prepare("SELECT COUNT(*) AS count FROM history_headlines").get()).toEqual({ count: 0 });
    expect(audit.prepare("SELECT COUNT(*) AS count FROM history_headlines_fts").get()).toEqual({ count: 0 });
    audit.close();
  });

  it("performs exact event, closed seq range, and headline recall with explicit missing results", () => {
    const events = openWithEvents();
    const created = recallStore!.createHeadline(headline());

    expect(recallStore!.recallExact({
      kind: "event_id",
      session_id: "session-a",
      event_id: events[1].id,
    })).toEqual({ kind: "event_id", found: true, event: events[1] });
    expect(recallStore!.recallExact({
      kind: "seq_range",
      session_id: "session-a",
      event_start_seq: 2,
      event_end_seq: 3,
    })).toEqual({ kind: "seq_range", found: true, events: events.slice(1) });
    expect(recallStore!.recallExact({
      kind: "event_id",
      session_id: "session-a",
      event_id: "missing-event",
    })).toEqual({ kind: "event_id", found: false });
    expect(recallStore!.recallExact({
      kind: "seq_range",
      session_id: "session-a",
      event_start_seq: 3,
      event_end_seq: 4,
    })).toEqual({ kind: "seq_range", found: false, events: [] });
    expect(recallStore!.recallExact({
      kind: "headline_id",
      session_id: "session-a",
      headline_id: `${created.id}-missing`,
    })).toEqual({ kind: "headline_id", found: false, events: [] });
  });

  it("never leaks exact targets across sessions", () => {
    const eventsA = openWithEvents();
    const foreign = rawStore!.ingest({ session_id: "session-b", role: "user", content: "foreign" });
    const created = recallStore!.createHeadline(headline());

    expect(recallStore!.recallExact({
      kind: "event_id", session_id: "session-b", event_id: eventsA[0].id,
    })).toEqual({ kind: "event_id", found: false });
    expect(recallStore!.recallExact({
      kind: "headline_id", session_id: "session-b", headline_id: created.id,
    })).toEqual({ kind: "headline_id", found: false, events: [] });
    expect(recallStore!.recallExact({
      kind: "seq_range", session_id: "session-b", event_start_seq: 1, event_end_seq: 1,
    })).toEqual({ kind: "seq_range", found: true, events: [foreign] });
  });

  it("supports the full approved Raw Store session-id domain without cross-session leakage", () => {
    rawStore = new SqliteRawHistoryStore(databasePath);
    const sessionIds = ["s".repeat(501), "   "];
    const events = sessionIds.map((sessionId, index) => rawStore!.ingest({
      session_id: sessionId,
      role: "user",
      content: `compatible session evidence ${index}`,
    }));
    recallStore = new SqliteHistoryRecallStore(databasePath);
    const headlines = sessionIds.map((sessionId, index) => recallStore!.createHeadline({
      session_id: sessionId,
      event_start_seq: 1,
      event_end_seq: 1,
      headline: `Compatible raw session ${index}`,
      keywords: ["raw-domain", `session-${index}`],
    }));

    for (let index = 0; index < sessionIds.length; index += 1) {
      const sessionId = sessionIds[index];
      const otherSession = sessionIds[1 - index];
      expect(recallStore.recallExact({
        kind: "event_id", session_id: sessionId, event_id: events[index].id,
      })).toEqual({ kind: "event_id", found: true, event: events[index] });
      expect(recallStore.recallExact({
        kind: "seq_range", session_id: sessionId, event_start_seq: 1, event_end_seq: 1,
      })).toEqual({ kind: "seq_range", found: true, events: [events[index]] });
      expect(recallStore.recallExact({
        kind: "headline_id", session_id: sessionId, headline_id: headlines[index].id,
      })).toEqual({
        kind: "headline_id", found: true, headline: headlines[index], events: [events[index]],
      });
      expect(recallStore.recallKeyword({ session_id: sessionId, query: `session ${index}` }))
        .toEqual([expect.objectContaining({ headline: headlines[index], events: [events[index]] })]);
      expect(recallStore.recallExact({
        kind: "event_id", session_id: otherSession, event_id: events[index].id,
      })).toEqual({ kind: "event_id", found: false });
      expect(recallStore.recallExact({
        kind: "headline_id", session_id: otherSession, headline_id: headlines[index].id,
      })).toEqual({ kind: "headline_id", found: false, events: [] });
    }
  });

  it("finds headline and keyword terms immediately with complete raw evidence", () => {
    const events = openWithEvents();
    const created = recallStore!.createHeadline(headline({
      headline: "Durable context architecture",
      keywords: ["SQLite persistence", "raw provenance"],
    }));

    for (const query of ["durable", "sqlite", "provenance", "sqlite durable"]) {
      expect(recallStore!.recallKeyword({ session_id: "session-a", query })).toEqual([
        expect.objectContaining({ headline: created, rank: expect.any(Number), events: events.slice(0, 2) }),
      ]);
    }
    expect(recallStore!.recallKeyword({ session_id: "session-a", query: "absent" })).toEqual([]);
  });

  it("treats quotes, operators, punctuation, and malformed-looking text as literal tokens", () => {
    openWithEvents();
    recallStore!.createHeadline(headline({
      headline: "OR and NEAR are text",
      keywords: ["DROP TABLE", "punctuation-safe"],
    }));

    expect(recallStore!.recallKeyword({ session_id: "session-a", query: `"OR" NEAR:*` })).toHaveLength(1);
    expect(recallStore!.recallKeyword({
      session_id: "session-a",
      query: `'); DROP TABLE history_headlines; --`,
    })).toHaveLength(1);
    expect(recallStore!.recallKeyword({ session_id: "session-a", query: `"'(*):--` })).toEqual([]);
    expect(recallStore!.recallKeyword({ session_id: "session-a", query: "_ \u0301 ---" })).toEqual([]);
    expect(recallStore!.recallKeyword({ session_id: "session-a", query: "still-there" })).toEqual([]);
    expect(recallStore!.recallExact({
      kind: "seq_range", session_id: "session-a", event_start_seq: 1, event_end_seq: 1,
    }).found).toBe(true);
  });

  it("applies bounded limits, session isolation, and stable rank/id ordering", () => {
    rawStore = new SqliteRawHistoryStore(databasePath);
    for (let index = 1; index <= 25; index += 1) {
      rawStore.ingest({ session_id: "session-a", role: "user", content: `event ${index}` });
    }
    rawStore.ingest({ session_id: "session-b", role: "user", content: "foreign" });
    recallStore = new SqliteHistoryRecallStore(databasePath);
    const ids: string[] = [];
    for (let index = 1; index <= 25; index += 1) {
      ids.push(recallStore.createHeadline({
        session_id: "session-a",
        event_start_seq: index,
        event_end_seq: index,
        headline: "same common phrase",
        keywords: ["shared"],
      }).id);
    }
    recallStore.createHeadline({
      session_id: "session-b",
      event_start_seq: 1,
      event_end_seq: 1,
      headline: "same common phrase",
      keywords: ["shared"],
    });

    const defaultHits = recallStore.recallKeyword({ session_id: "session-a", query: "shared" });
    expect(defaultHits).toHaveLength(5);
    expect(recallStore.recallKeyword({ session_id: "session-a", query: "shared", limit: 20 })).toHaveLength(20);
    expect(defaultHits.map((hit) => hit.headline.id)).toEqual([...ids].sort().slice(0, 5));
    expect(defaultHits.every((hit) => hit.headline.session_id === "session-a")).toBe(true);
  });

  it("returns deep copies of headline keywords and nested raw metadata", () => {
    openWithEvents();
    const created = recallStore!.createHeadline(headline());
    const first = recallStore!.recallKeyword({ session_id: "session-a", query: "architecture" })[0];
    first.headline.keywords[0] = "mutated";
    (first.events[0].metadata.nested as JsonObject).values = ["mutated"];
    first.events.length = 0;

    const second = recallStore!.recallKeyword({ session_id: "session-a", query: "architecture" })[0];
    expect(second.headline).toEqual(created);
    expect(second.events[0].metadata).toEqual({
      position: 1,
      nested: { values: ["first evidence"] },
    });
  });

  it("recovers old raw payload after it leaves the recent window and state is resolved/superseded", () => {
    rawStore = new SqliteRawHistoryStore(databasePath);
    const questionEvidence = rawStore.ingest({ session_id: "session-a", role: "user", content: "Which database?" });
    const oldDecisionEvidence = rawStore.ingest({ session_id: "session-a", role: "assistant", content: "Use memory only" });
    const newDecisionEvidence = rawStore.ingest({ session_id: "session-a", role: "assistant", content: "Use durable SQLite" });
    for (let turn = 1; turn <= 4; turn += 1) {
      rawStore.ingest({ session_id: "session-a", role: "user", content: `later user ${turn}` });
      rawStore.ingest({ session_id: "session-a", role: "assistant", content: `later assistant ${turn}` });
    }
    stateStore = new SqliteContextStateStore(databasePath);
    const items = stateStore.transaction("session-a", () => ({
      question: stateStore!.createItem({
        session_id: "session-a", type: "OPEN_QUESTION", status: "OPEN",
        content: "Which database?", source_refs: [questionEvidence.id],
      }),
      oldDecision: stateStore!.createItem({
        session_id: "session-a", type: "DECISION", status: "ACTIVE",
        content: "Use memory only", source_refs: [oldDecisionEvidence.id],
      }),
      newDecision: stateStore!.createItem({
        session_id: "session-a", type: "DECISION", status: "ACTIVE",
        content: "Use durable SQLite", source_refs: [newDecisionEvidence.id],
      }),
    })).value;
    stateStore.transaction("session-a", () =>
      stateStore!.supersedeDecision("session-a", items.oldDecision.id, items.newDecision.id)
    );
    stateStore.transaction("session-a", () =>
      stateStore!.resolveQuestion("session-a", items.question.id, items.newDecision.id)
    );

    const rawBefore = rawStore.getSessionEvents("session-a");
    const revisionBefore = stateStore.getRevision("session-a");
    const compiled = assembleContext({
      session_id: "session-a",
      context_items: stateStore.getItems("session-a"),
      state_relations: stateStore.getSessionRelations("session-a"),
      raw_events: rawBefore,
      current_input: "recall the original discussion",
      recent_raw_window_turns: 1,
    });
    expect(compiled.recent_conversation.map((event) => event.id)).not.toContain(questionEvidence.id);
    expect(compiled.recent_conversation.map((event) => event.id)).not.toContain(oldDecisionEvidence.id);
    expect(stateStore.getItem("session-a", items.question.id)?.status).toBe("RESOLVED");
    expect(stateStore.getItem("session-a", items.oldDecision.id)?.status).toBe("SUPERSEDED");

    recallStore = new SqliteHistoryRecallStore(databasePath);
    const created = recallStore.createHeadline({
      session_id: "session-a",
      event_start_seq: 1,
      event_end_seq: 3,
      headline: "Original database discussion",
      keywords: ["database", "original decision"],
    });
    const hits = recallStore.recallKeyword({ session_id: "session-a", query: "original" });
    expect(hits[0].events.map((event) => event.content)).toEqual([
      "Which database?", "Use memory only", "Use durable SQLite",
    ]);
    expect(stateStore.getRevision("session-a")).toBe(revisionBefore);
    expect(rawStore.getSessionEvents("session-a")).toEqual(rawBefore);

    recallStore.close();
    recallStore = new SqliteHistoryRecallStore(databasePath);
    expect(recallStore.recallExact({
      kind: "headline_id", session_id: "session-a", headline_id: created.id,
    })).toMatchObject({ found: true, headline: created, events: rawBefore.slice(0, 3) });
    expect(stateStore.getRevision("session-a")).toBe(revisionBefore);
    expect(rawStore.getSessionEvents("session-a")).toEqual(rawBefore);
  });

  it("enforces append-only headline triggers without changing raw rows or state revision", () => {
    const rawBefore = openWithEvents();
    stateStore = new SqliteContextStateStore(databasePath);
    const revision = stateStore.getRevision("session-a");
    const created = recallStore!.createHeadline(headline());
    recallStore!.close();
    recallStore = undefined;
    stateStore.close();
    stateStore = undefined;
    rawStore!.close();
    rawStore = undefined;

    const direct = new DatabaseSync(databasePath);
    expect(() => direct.prepare("UPDATE history_headlines SET headline = ? WHERE id = ?").run("changed", created.id))
      .toThrow(/append-only/);
    expect(() => direct.prepare("DELETE FROM history_headlines WHERE id = ?").run(created.id))
      .toThrow(/append-only/);
    expect(direct.prepare("SELECT COUNT(*) AS count FROM raw_events").get()).toEqual({ count: rawBefore.length });
    direct.close();

    rawStore = new SqliteRawHistoryStore(databasePath);
    stateStore = new SqliteContextStateStore(databasePath);
    recallStore = new SqliteHistoryRecallStore(databasePath);
    expect(rawStore.getSessionEvents("session-a")).toEqual(rawBefore);
    expect(stateStore.getRevision("session-a")).toBe(revision);
    expect(recallStore.recallExact({
      kind: "headline_id", session_id: "session-a", headline_id: created.id,
    }).found).toBe(true);
  });

  it.each([
    ["empty session", { session_id: "" }],
    ["zero start", { event_start_seq: 0 }],
    ["reversed range", { event_start_seq: 2, event_end_seq: 1 }],
    ["blank headline", { headline: " \n " }],
    ["long headline", { headline: "h".repeat(501) }],
    ["empty keywords", { keywords: [] }],
    ["duplicate keywords", { keywords: ["same", "same"] }],
    ["blank keyword", { keywords: [" "] }],
    ["long keyword", { keywords: ["k".repeat(101)] }],
    ["bad timestamp", { created_at: "not-a-time" }],
    ["extra property", { extra: "private-input" }],
  ])("rejects invalid headline input: %s", (_label, override) => {
    openWithEvents();
    expect(() => recallStore!.createHeadline(headline(override as never))).toThrowError(
      expect.objectContaining({ code: "INVALID_INPUT", category: "validation" })
    );
  });

  it("rejects accessors, sparse/extra/subclass keyword arrays without invoking getters", () => {
    openWithEvents();
    let getterCalls = 0;
    const accessorInput = headline();
    Object.defineProperty(accessorInput, "headline", {
      enumerable: true,
      get() {
        getterCalls += 1;
        throw new Error("private getter payload");
      },
    });
    expect(() => recallStore!.createHeadline(accessorInput)).toThrowError(
      expect.objectContaining({ code: "INVALID_INPUT" })
    );
    expect(getterCalls).toBe(0);

    const sparse = ["one", , "three"];
    const extra = ["one"];
    Object.defineProperty(extra, "private", { value: "secret", enumerable: true });
    class KeywordArray extends Array<string> {}
    for (const keywords of [sparse, extra, new KeywordArray("one")]) {
      expect(() => recallStore!.createHeadline(headline({ keywords }))).toThrowError(
        expect.objectContaining({ code: "INVALID_INPUT" })
      );
    }
    expect(recallStore!.recallKeyword({ session_id: "session-a", query: "private" })).toEqual([]);
  });

  it("accepts frozen plain data and copies it before persistence", () => {
    openWithEvents();
    const input = Object.freeze({
      ...headline(),
      keywords: Object.freeze(["frozen", "plain-data"]),
    });
    const created = recallStore!.createHeadline(input as HistoryHeadlineInput);
    expect(created.keywords).toEqual(["frozen", "plain-data"]);
    expect(recallStore!.recallKeyword({ session_id: "session-a", query: "frozen" })[0].headline)
      .toEqual(created);
  });

  it.each([
    ["unknown exact kind", { kind: "unknown", session_id: "session-a" }],
    ["mixed exact kind", { kind: "event_id", session_id: "session-a", event_id: "x", headline_id: "x" }],
    ["oversized exact range", { kind: "seq_range", session_id: "session-a", event_start_seq: 1, event_end_seq: 1001 }],
    ["blank query", { session_id: "session-a", query: " " }],
    ["zero limit", { session_id: "session-a", query: "x", limit: 0 }],
    ["large limit", { session_id: "session-a", query: "x", limit: 21 }],
    ["extra query property", { session_id: "session-a", query: "x", extra: "private-query" }],
  ])("strictly rejects malformed recall descriptor: %s", (_label, query) => {
    openWithEvents();
    const operation = "kind" in query
      ? () => recallStore!.recallExact(query as never)
      : () => recallStore!.recallKeyword(query as never);
    expect(operation).toThrowError(expect.objectContaining({ code: "INVALID_INPUT" }));
  });

  it("does not invoke recall query accessors or disclose accessor/query content", () => {
    openWithEvents();
    let getterCalls = 0;
    const query = { session_id: "session-a", query: "safe" };
    Object.defineProperty(query, "query", {
      enumerable: true,
      get() {
        getterCalls += 1;
        throw new Error("private query payload");
      },
    });
    let caught: unknown;
    try {
      recallStore!.recallKeyword(query);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(HistoryRecallError);
    expect((caught as Error).message).not.toContain("private");
    expect(getterCalls).toBe(0);
  });

  it("requires the existing raw schema and sanitizes the failure", () => {
    const emptyPath = join(temporaryDirectory, "empty.db");
    const direct = new DatabaseSync(emptyPath);
    direct.close();
    expect(() => new SqliteHistoryRecallStore(emptyPath)).toThrowError(
      expect.objectContaining({
        code: "RAW_SCHEMA_MISSING",
        category: "state",
        message: "History recall requires the raw history schema",
      })
    );
  });

  it("rejects all operations after close and makes repeated close idempotent", () => {
    openWithEvents();
    recallStore!.close();
    recallStore!.close();
    expect(() => recallStore!.createHeadline(headline())).toThrowError(
      expect.objectContaining({ code: "STORE_CLOSED" })
    );
    expect(() => recallStore!.recallExact({
      kind: "seq_range", session_id: "session-a", event_start_seq: 1, event_end_seq: 1,
    })).toThrowError(expect.objectContaining({ code: "STORE_CLOSED" }));
    expect(() => recallStore!.recallKeyword({ session_id: "session-a", query: "x" }))
      .toThrowError(expect.objectContaining({ code: "STORE_CLOSED" }));
  });
});
