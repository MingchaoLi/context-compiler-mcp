// @vitest-environment node

import { DatabaseSync } from "node:sqlite";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  EXACT_RAW_RECEIPT_LOOKUP_STATUSES,
  RAW_INGEST_FINGERPRINT_VERSION,
  RawReceiptLookupInputError,
  SqliteRawHistoryStore,
  computeRawIngestFingerprint,
  getExactRawReceiptLookupCapability,
  type JsonObject,
  type RawIngestFingerprintInput,
} from "../src/raw-store.js";

describe("SqliteRawHistoryStore", () => {
  let temporaryDirectory: string;
  let databasePath: string;
  let store: SqliteRawHistoryStore | undefined;

  beforeEach(async () => {
    temporaryDirectory = await mkdtemp(join(tmpdir(), "context-compiler-raw-store-"));
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
      source_event_id: "source-event-1",
      role: "user",
      content: "Keep the raw evidence intact.",
      event_type: "message",
      created_at: createdAt,
      token_count: 7,
      metadata: { provenance: "dsh-session", attempt: 1 },
    });
    const second = store.ingest({
      session_id: "session-a",
      source_event_id: "source-event-2",
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

  it("canonicalizes independent source times without imposing timestamp order on append seq", () => {
    store = new SqliteRawHistoryStore(databasePath);
    const newer = store.ingest({
      session_id: "timestamp-domain",
      source_event_id: "timestamp-1",
      role: "user",
      content: "appended first",
      created_at: "2026-08-02T00:00:00Z",
    });
    const older = store.ingest({
      session_id: "timestamp-domain",
      source_event_id: "timestamp-2",
      role: "assistant",
      content: "appended second with older source time",
      created_at: "2026-08-01T08:00:00+08:00",
    });
    const equal = store.ingest({
      session_id: "timestamp-domain",
      source_event_id: "timestamp-3",
      role: "user",
      content: "same source instant",
      created_at: "2026-08-01T00:00:00.000Z",
    });
    const future = store.ingest({
      session_id: "timestamp-domain",
      source_event_id: "timestamp-4",
      role: "assistant",
      content: "future source time",
      created_at: "2099-01-01T00:00:00Z",
    });
    const retry = store.ingest({
      session_id: "timestamp-domain",
      source_event_id: "timestamp-1",
      role: "user",
      content: "appended first",
      created_at: "2026-08-02T00:00:00.000Z",
    });

    expect([newer.seq, older.seq, equal.seq, future.seq]).toEqual([1, 2, 3, 4]);
    expect([newer.created_at, older.created_at, equal.created_at, future.created_at]).toEqual([
      "2026-08-02T00:00:00.000Z",
      "2026-08-01T00:00:00.000Z",
      "2026-08-01T00:00:00.000Z",
      "2099-01-01T00:00:00.000Z",
    ]);
    expect(retry).toEqual(newer);

    const expected = [newer, older, equal, future];
    store.close();
    store = new SqliteRawHistoryStore(databasePath);
    expect(store.getSessionEvents("timestamp-domain")).toEqual(expected);
  });

  it.each([
    "not-a-time",
    "2026-02-30T00:00:00Z",
    "2025-02-29T00:00:00Z",
    "2026-08-01 00:00:00Z",
    "2026-08-01T24:00:00Z",
    "2026-08-01T00:00:61Z",
    "2026-08-01T00:00:60Z",
    "2026-08-01T00:00:00+24:00",
    "2026-08-01T00:00:00.1234Z",
  ])("rejects invalid source timestamp %s before consuming a sequence", (createdAt) => {
    store = new SqliteRawHistoryStore(databasePath);
    expect(() => store?.ingest({
      session_id: "invalid-timestamp",
      role: "user",
      content: "must not persist",
      created_at: createdAt,
    })).toThrow(/RFC 3339 timestamp/);
    expect(store.getSessionEvents("invalid-timestamp")).toEqual([]);
    expect(store.ingest({
      session_id: "invalid-timestamp",
      role: "user",
      content: "valid append",
      created_at: "2026-08-01T00:00:00Z",
    }).seq).toBe(1);
  });

  it("preserves exact historical sub-millisecond identity across idempotent retries", () => {
    const preciseNonzero = `2025-12-31T23:59:59.123${"9".repeat(125)}Z`;
    const preciseZeroTail = `2026-01-01T07:59:59.123${"0".repeat(125)}+08:00`;
    store = new SqliteRawHistoryStore(databasePath);
    store.ingest({
      session_id: "precise-timestamp",
      role: "user",
      content: "initialize session",
    });
    store.close();

    const direct = new DatabaseSync(databasePath);
    for (const [id, seq, sourceId, createdAt] of [
      ["precise-nonzero", 2, "precise-nonzero-source", preciseNonzero],
      ["precise-zero-tail", 3, "precise-zero-tail-source", preciseZeroTail],
    ] as const) {
      direct.prepare(
        `INSERT INTO raw_events (
           id, session_id, seq, source_event_id, role, content,
           event_type, created_at, token_count, metadata_json, dense_embedding_json
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        id,
        "precise-timestamp",
        seq,
        sourceId,
        "user",
        `historical ${sourceId}`,
        "message",
        createdAt,
        4,
        "{}",
        null
      );
    }
    direct.close();

    store = new SqliteRawHistoryStore(databasePath);
    expect(store.getSessionEvents("precise-timestamp").slice(1).map((event) => event.created_at)).toEqual([
      preciseNonzero,
      preciseZeroTail,
    ]);
    expect(() => store?.ingest({
      session_id: "precise-timestamp",
      source_event_id: "precise-nonzero-source",
      role: "user",
      content: "historical precise-nonzero-source",
      event_type: "message",
      created_at: "2025-12-31T23:59:59.123Z",
      token_count: 4,
      metadata: {},
    })).toThrow(/conflicts with existing raw evidence/);
    expect(store.ingest({
      session_id: "precise-timestamp",
      source_event_id: "precise-zero-tail-source",
      role: "user",
      content: "historical precise-zero-tail-source",
      event_type: "message",
      created_at: "2025-12-31T23:59:59.123Z",
      token_count: 4,
      metadata: {},
    })).toMatchObject({
      id: "precise-zero-tail",
      seq: 3,
      created_at: preciseZeroTail,
    });
  });

  it("replays month-end RFC 3339 leap seconds without folding them into the next minute", () => {
    store = new SqliteRawHistoryStore(databasePath);
    const canonical = store.ingest({
      session_id: "leap-second",
      source_event_id: "canonical-leap-source",
      role: "user",
      content: "canonical leap second",
      created_at: "2017-01-01T07:59:60+08:00",
    });
    expect(canonical).toMatchObject({
      seq: 1,
      created_at: "2016-12-31T23:59:60.000Z",
    });
    store.close();

    const direct = new DatabaseSync(databasePath);
    direct.prepare(
      `INSERT INTO raw_events (
         id, session_id, seq, source_event_id, role, content,
         event_type, created_at, token_count, metadata_json, dense_embedding_json
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      "historical-leap",
      "leap-second",
      2,
      "historical-leap-source",
      "assistant",
      "historical leap second",
      "message",
      "2016-12-31T23:59:60Z",
      5,
      "{}",
      null
    );
    direct.close();

    store = new SqliteRawHistoryStore(databasePath);
    expect(store.getSessionEvents("leap-second")[1]).toMatchObject({
      id: "historical-leap",
      created_at: "2016-12-31T23:59:60Z",
    });
    expect(store.ingest({
      session_id: "leap-second",
      source_event_id: "historical-leap-source",
      role: "assistant",
      content: "historical leap second",
      event_type: "message",
      created_at: "2017-01-01T07:59:60.000+08:00",
      token_count: 5,
      metadata: {},
    })).toMatchObject({ id: "historical-leap", created_at: "2016-12-31T23:59:60Z" });
    expect(() => store?.ingest({
      session_id: "leap-second",
      source_event_id: "historical-leap-source",
      role: "assistant",
      content: "historical leap second",
      event_type: "message",
      created_at: "2017-01-01T00:00:00Z",
      token_count: 5,
      metadata: {},
    })).toThrow(/conflicts with existing raw evidence/);
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

  it.each([
    ["null", null],
    ["array", ["root"]],
    ["string", "root"],
    ["number", 42],
    ["boolean", true],
  ])("rejects %s metadata roots without creating raw history", (_label, metadata) => {
    store = new SqliteRawHistoryStore(databasePath);

    expect(() =>
      store?.ingest({
        session_id: "session-a",
        role: "user",
        content: "invalid metadata root",
        metadata: metadata as never,
      })
    ).toThrow(/metadata must be a JSON object/);
    expect(store.getSessionEvents("session-a")).toEqual([]);

    const valid = store.ingest({
      session_id: "session-a",
      role: "user",
      content: "valid metadata root",
    });
    expect(valid.seq).toBe(1);
    expect(store.getEvent(valid.id)).toEqual(valid);

    store.close();
    store = new SqliteRawHistoryStore(databasePath);
    expect(store.getSessionEvents("session-a")).toEqual([valid]);
  });

  it("reconciles an exact receipt without disclosing Raw fields and survives reopen", () => {
    const input: RawIngestFingerprintInput = {
      session_id: "receipt-session",
      source_event_id: "source/receipt-1",
      role: "tool",
      content: "synthetic-private-shaped-payload\r\nsecond-byte-line",
      event_type: "tool_result",
      created_at: "2026-08-28T18:30:00.125+08:00",
      token_count: 13,
      metadata: { synthetic: true, nested: { ordinal: 1 } },
      dense_embedding: { vector_space_id: "fixture-v1", values: [0.25, -0.5] },
    };
    const fingerprint = computeRawIngestFingerprint(input);
    store = new SqliteRawHistoryStore(databasePath);
    const event = store.ingest(input);
    const found = store.lookupRawReceipt({
      session_id: input.session_id,
      source_event_id: input.source_event_id,
      ingest_fingerprint: fingerprint,
    });
    expect(found).toEqual({
      capability: "exact_raw_receipt_lookup",
      version: 1,
      status: "FOUND_EXACT",
      ingest_fingerprint: fingerprint,
      receipt: {
        id: event.id,
        session_id: input.session_id,
        seq: event.seq,
        source_event_id: input.source_event_id,
      },
    });
    expect(Reflect.ownKeys(found)).toEqual([
      "capability", "version", "status", "ingest_fingerprint", "receipt",
    ]);
    expect(JSON.stringify(found)).not.toMatch(
      /synthetic-private-shaped-payload|metadata|dense_embedding|created_at|event_type|content|sql|trace|path/iu
    );

    store.close();
    store = new SqliteRawHistoryStore(databasePath);
    expect(store.lookupRawReceipt({
      session_id: input.session_id,
      source_event_id: input.source_event_id,
      ingest_fingerprint: fingerprint,
    })).toEqual(found);
    expect(store.lookupRawReceipt({
      session_id: input.session_id,
      source_event_id: "missing-source",
      ingest_fingerprint: fingerprint,
    }).status).toBe("NOT_FOUND");
    expect(store.lookupRawReceipt({
      session_id: input.session_id,
      source_event_id: input.source_event_id,
      ingest_fingerprint: computeRawIngestFingerprint({ ...input, content: "other bytes" }),
    }).status).toBe("IDENTITY_COLLISION");
  });

  it("binds every ingest field while preserving equivalent timestamp identity", () => {
    const base: RawIngestFingerprintInput = {
      session_id: "fingerprint-session",
      source_event_id: "fingerprint-source",
      role: "user",
      content: "line-one\r\nline-two",
      created_at: "2026-08-28T18:30:00.120+08:00",
    };
    const fingerprint = computeRawIngestFingerprint(base);
    expect(fingerprint).toMatch(
      new RegExp(`^${RAW_INGEST_FINGERPRINT_VERSION}:[0-9a-f]{64}$`, "u")
    );
    expect(computeRawIngestFingerprint({
      ...base,
      created_at: "2026-08-28T10:30:00.12Z",
      event_type: "message",
      token_count: 5,
      metadata: {},
    })).toBe(fingerprint);
    for (const changed of [
      { ...base, session_id: "other-session" },
      { ...base, source_event_id: "other-source" },
      { ...base, role: "assistant" as const },
      { ...base, content: "line-one\nline-two" },
      { ...base, event_type: "other" },
      { ...base, created_at: "2026-08-28T10:30:00.121Z" },
      { ...base, token_count: 99 },
      { ...base, metadata: { key: "value" } },
      { ...base, dense_embedding: { vector_space_id: "fixture-v1", values: [1] } },
    ]) {
      expect(computeRawIngestFingerprint(changed)).not.toBe(fingerprint);
    }
  });

  it("publishes a frozen closed capability and rejects hostile proof graphs", () => {
    const capability = getExactRawReceiptLookupCapability();
    expect(capability).toEqual({
      capability: "exact_raw_receipt_lookup",
      version: 1,
      fingerprint_version: RAW_INGEST_FINGERPRINT_VERSION,
      requires_explicit_created_at: true,
      statuses: [
        "FOUND_EXACT", "NOT_FOUND", "IDENTITY_COLLISION", "CORRUPT_DATA", "UNAVAILABLE",
      ],
    });
    expect(capability.statuses).toBe(EXACT_RAW_RECEIPT_LOOKUP_STATUSES);
    expect(Object.isFrozen(capability)).toBe(true);
    expect(Object.isFrozen(capability.statuses)).toBe(true);
    expect(() => computeRawIngestFingerprint({
      session_id: "session",
      source_event_id: "source",
      role: "user",
      content: "missing explicit timestamp",
    } as RawIngestFingerprintInput)).toThrow(RawReceiptLookupInputError);

    store = new SqliteRawHistoryStore(databasePath);
    let trapCount = 0;
    const proxy = new Proxy({
      session_id: "session",
      source_event_id: "source",
      ingest_fingerprint: `${RAW_INGEST_FINGERPRINT_VERSION}:${"0".repeat(64)}`,
    }, {
      ownKeys() {
        trapCount += 1;
        throw new Error("private trap");
      },
    });
    expect(() => store!.lookupRawReceipt(proxy)).toThrow(RawReceiptLookupInputError);
    expect(trapCount).toBe(0);
  });

  it("returns CORRUPT_DATA for coordinated Raw tamper", () => {
    const input: RawIngestFingerprintInput = {
      session_id: "tamper-session",
      source_event_id: "tamper-source",
      role: "user",
      content: "original synthetic bytes",
      created_at: "2026-08-28T10:00:00.000Z",
      metadata: { proof: "original" },
    };
    const fingerprint = computeRawIngestFingerprint(input);
    store = new SqliteRawHistoryStore(databasePath);
    store.ingest(input);
    const direct = new DatabaseSync(databasePath);
    direct.exec("DROP TRIGGER raw_events_prevent_update;");
    direct.exec("UPDATE raw_events SET content = 'tampered' WHERE source_event_id = 'tamper-source';");
    direct.close();
    expect(store.lookupRawReceipt({
      session_id: input.session_id,
      source_event_id: input.source_event_id,
      ingest_fingerprint: fingerprint,
    })).toEqual({
      capability: "exact_raw_receipt_lookup",
      version: 1,
      status: "CORRUPT_DATA",
    });
  });

  it("returns UNAVAILABLE instead of leaking storage failures", () => {
    store = new SqliteRawHistoryStore(databasePath);
    const proof = {
      session_id: "unavailable-session",
      source_event_id: "unavailable-source",
      ingest_fingerprint: `${RAW_INGEST_FINGERPRINT_VERSION}:${"0".repeat(64)}`,
    };
    const direct = new DatabaseSync(databasePath);
    direct.exec("DROP TABLE raw_events;");
    direct.close();
    expect(store.lookupRawReceipt(proof)).toEqual({
      capability: "exact_raw_receipt_lookup",
      version: 1,
      status: "UNAVAILABLE",
    });
    store.close();
    expect(store.lookupRawReceipt(proof).status).toBe("UNAVAILABLE");
  });
});
