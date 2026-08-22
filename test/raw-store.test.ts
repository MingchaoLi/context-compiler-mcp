// @vitest-environment node

import { DatabaseSync } from "node:sqlite";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SqliteRawHistoryStore, type JsonObject } from "../src/raw-store.js";

describe("SqliteRawHistoryStore", () => {
  let temporaryDirectory: string;
  let databasePath: string;
  let store: SqliteRawHistoryStore | undefined;

  beforeEach(async () => {
    temporaryDirectory = await mkdtemp(join(tmpdir(), "tuantuan-raw-store-"));
    databasePath = join(temporaryDirectory, "context-compiler.db");
  });

  afterEach(async () => {
    store?.close();
    await rm(temporaryDirectory, { recursive: true, force: true });
  });

  it("commits events to disk and recovers them after reopening", async () => {
    store = new SqliteRawHistoryStore(databasePath);
    const createdAt = "2026-08-22T08:30:00.000Z";
    const first = store.ingest({
      session_id: "session-a",
      source_event_id: "harness-event-1",
      role: "user",
      content: "Keep the raw evidence intact.",
      event_type: "message",
      created_at: createdAt,
      token_count: 7,
      metadata: { provenance: "dsh-session", attempt: 1 },
    });
    const second = store.ingest({
      session_id: "session-a",
      source_event_id: "harness-event-2",
      role: "assistant",
      content: "Stored.",
    });

    expect(first.seq).toBe(1);
    expect(second.seq).toBe(2);
    expect((await stat(databasePath)).size).toBeGreaterThan(0);

    store.close();
    store = new SqliteRawHistoryStore(databasePath);

    expect(store.getSessionEvents("session-a")).toEqual([first, second]);
    expect(store.getEvent(first.id)).toMatchObject({
      created_at: createdAt,
      token_count: 7,
      metadata: { provenance: "dsh-session", attempt: 1 },
    });
  });

  it("keeps sequences independent per session and deduplicates identical source retries", () => {
    store = new SqliteRawHistoryStore(databasePath);
    const metadata: JsonObject = {
      payload: {
        blocks: [
          { type: "text", text: "first delivery" },
          { type: "tool-result", ok: true, values: [1, 2, null] },
        ],
      },
    };
    const first = store.ingest({
      session_id: "session-a",
      source_event_id: "event-1",
      role: "user",
      content: "first delivery",
      metadata,
    });
    const retry = store.ingest({
      session_id: "session-a",
      source_event_id: "event-1",
      role: "user",
      content: "first delivery",
      metadata,
    });
    const otherSession = store.ingest({
      session_id: "session-b",
      source_event_id: "event-1",
      role: "user",
      content: "same source id in a different session",
      metadata,
    });

    expect(retry).toEqual(first);
    expect(otherSession.seq).toBe(1);

    store.close();
    store = new SqliteRawHistoryStore(databasePath);
    expect(store.getEvent(first.id)).toEqual(first);
    expect(store.getSessionEvents("session-a")).toEqual([first]);

    expect(() =>
      store?.ingest({
        session_id: "session-a",
        source_event_id: "event-1",
        role: "user",
        content: "first delivery",
        metadata: { payload: { blocks: [{ type: "text", text: "conflict" }] } },
      })
    ).toThrow(/conflicts with existing raw evidence/);
    expect(store.getEvent(first.id)).toEqual(first);
  });

  it("rejects update and delete even through a separate database connection", () => {
    store = new SqliteRawHistoryStore(databasePath);
    const event = store.ingest({
      session_id: "session-a",
      role: "user",
      content: "source evidence",
    });
    store.close();
    store = undefined;

    const direct = new DatabaseSync(databasePath);
    try {
      expect(() =>
        direct.prepare("UPDATE raw_events SET content = ? WHERE id = ?").run("suppressed", event.id)
      ).toThrow(/append-only/);
      expect(() => direct.prepare("DELETE FROM raw_events WHERE id = ?").run(event.id)).toThrow(
        /append-only/
      );
    } finally {
      direct.close();
    }

    store = new SqliteRawHistoryStore(databasePath);
    expect(store.getEvent(event.id)?.content).toBe("source evidence");
  });

  it.each([
    ["undefined", { value: undefined }],
    ["NaN", { value: Number.NaN }],
    ["Infinity", { value: Number.POSITIVE_INFINITY }],
    ["negative Infinity", { nested: { value: Number.NEGATIVE_INFINITY } }],
    ["Date", { value: new Date("2026-08-22T00:00:00.000Z") }],
    ["BigInt", { nested: { value: 1n } }],
  ])("rejects non-lossless metadata containing %s before consuming a sequence", (_label, metadata) => {
    store = new SqliteRawHistoryStore(databasePath);

    expect(() =>
      store?.ingest({
        session_id: "session-a",
        role: "tool",
        content: "invalid metadata",
        metadata: metadata as never,
      })
    ).toThrow(/metadata/);

    const valid = store.ingest({
      session_id: "session-a",
      role: "tool",
      content: "valid metadata",
      metadata: {
        array: [1, "two", false, null, { nested: ["value"] }],
        object: { depth: { enabled: true } },
      },
    });
    expect(valid.seq).toBe(1);
  });
});
