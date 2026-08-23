// @vitest-environment node

import { DatabaseSync } from "node:sqlite";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  EXPERIENCE_LEDGER_KINDS,
  PUBLIC_EXPERIENCE_LEDGER_KINDS,
  ExperienceLedgerError,
  SqliteExperienceLedgerStore,
} from "../src/experience-ledger.js";
import { SqliteRawHistoryStore } from "../src/raw-store.js";

describe("append-only Experience Ledger", () => {
  let temporaryDirectory: string;
  let databasePath: string;
  const stores: Array<{ close(): void }> = [];

  beforeEach(async () => {
    temporaryDirectory = await mkdtemp(join(tmpdir(), "context-compiler-ledger-"));
    databasePath = join(temporaryDirectory, "context-compiler.db");
  });

  afterEach(async () => {
    for (const store of stores.splice(0).reverse()) {
      try { store.close(); } catch { /* an explicit close test may already have closed it */ }
    }
    await rm(temporaryDirectory, { recursive: true, force: true });
  });

  it("atomically mirrors live raw events and preserves public RawEvent retry behavior", () => {
    const raw = track(new SqliteRawHistoryStore(databasePath));
    const first = raw.ingest({
      session_id: "session-a",
      source_event_id: "source-1",
      role: "user",
      content: "Observe the source event exactly.",
      created_at: "2026-08-24T01:00:00.000Z",
      metadata: { nested: { z: 1, a: true } },
    });
    const retry = raw.ingest({
      session_id: "session-a",
      source_event_id: "source-1",
      role: "user",
      content: "Observe the source event exactly.",
      created_at: "2026-08-24T01:00:00.000Z",
      metadata: { nested: { z: 1, a: true } },
    });
    expect(retry).toEqual(first);

    const ledger = track(new SqliteExperienceLedgerStore(databasePath));
    const records = ledger.getSessionRecords("session-a");
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      id: `raw-event:${first.id}`,
      seq: 1,
      kind: "EVENT",
      occurred_at: first.created_at,
      source_key: `raw-event/${first.id}`,
      raw_event_ids: [first.id],
      parent_ledger_ids: [],
      payload: {
        migration_backfill: false,
        raw_event: {
          id: first.id,
          session_id: first.session_id,
          seq: first.seq,
          content: first.content,
          metadata: first.metadata,
        },
      },
    });
    expect(Object.keys(first).sort()).toEqual(Object.keys(retry).sort());
  });

  it("rolls back raw evidence when an external trigger rejects its EVENT mirror", () => {
    const initial = new SqliteRawHistoryStore(databasePath);
    initial.close();
    const direct = new DatabaseSync(databasePath);
    direct.exec(`
      CREATE TRIGGER reject_live_event_mirror
      BEFORE INSERT ON experience_ledger
      WHEN NEW.kind = 'EVENT'
        AND json_extract(NEW.payload_json, '$.migration_backfill') = 0
      BEGIN
        SELECT RAISE(ABORT, 'injected ledger failure');
      END;
    `);
    direct.close();

    const raw = track(new SqliteRawHistoryStore(databasePath));
    expect(() => raw.ingest({
      session_id: "atomic",
      role: "user",
      content: "neither half may commit",
    })).toThrow(/injected ledger failure/);
    expect(raw.getSessionEvents("atomic")).toEqual([]);

    const audit = new DatabaseSync(databasePath);
    try {
      expect(audit.prepare("SELECT COUNT(*) AS count FROM raw_events").get()).toEqual({ count: 0 });
      expect(audit.prepare("SELECT COUNT(*) AS count FROM experience_ledger").get()).toEqual({ count: 0 });
    } finally {
      audit.close();
    }
  });

  it("fails a source retry when a separately tampered mirror no longer matches raw evidence", () => {
    const raw = track(new SqliteRawHistoryStore(databasePath));
    const event = raw.ingest({
      session_id: "retry-audit",
      source_event_id: "source-retry-audit",
      role: "user",
      content: "authoritative raw",
    });
    const direct = new DatabaseSync(databasePath);
    try {
      direct.exec("DROP TRIGGER experience_ledger_prevent_update;");
      direct.prepare(
        "UPDATE experience_ledger SET payload_json = ? WHERE id = ?"
      ).run('{"migration_backfill":false,"raw_event":{"content":"tampered"}}', `raw-event:${event.id}`);
    } finally {
      direct.close();
    }

    expect(() => raw.ingest({
      session_id: "retry-audit",
      source_event_id: "source-retry-audit",
      role: "user",
      content: "authoritative raw",
    })).toThrowError(expect.objectContaining<Partial<ExperienceLedgerError>>({ code: "CONFLICT" }));
    expect(raw.getSessionEvents("retry-audit")).toEqual([event]);
  });

  it("deterministically backfills only EVENT observations for a legacy raw database", () => {
    const legacy = new DatabaseSync(databasePath);
    legacy.exec(`
      PRAGMA foreign_keys = ON;
      CREATE TABLE sessions (
        id TEXT PRIMARY KEY CHECK (length(id) > 0),
        created_at TEXT NOT NULL
      );
      CREATE TABLE raw_events (
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
      INSERT INTO sessions (id, created_at) VALUES ('legacy', '2026-08-20T00:00:00.000Z');
      INSERT INTO raw_events (
        id, session_id, seq, source_event_id, role, content,
        event_type, created_at, token_count, metadata_json
      ) VALUES
        ('legacy-2', 'legacy', 2, NULL, 'assistant', 'second', 'message',
         '2026-08-20T00:02:00.000Z', 2, '{}'),
        ('legacy-1', 'legacy', 1, 'upstream-1', 'user', 'first', 'message',
         '2026-08-20T00:01:00.000Z', 2, '{"source":"legacy"}');
    `);
    legacy.close();

    let raw = new SqliteRawHistoryStore(databasePath);
    const rawBefore = raw.getSessionEvents("legacy");
    raw.close();
    let ledger = new SqliteExperienceLedgerStore(databasePath);
    const firstReplay = ledger.getSessionRecords("legacy");
    ledger.close();

    expect(firstReplay.map((record) => [record.id, record.seq, record.kind])).toEqual([
      ["raw-event:legacy-1", 1, "EVENT"],
      ["raw-event:legacy-2", 2, "EVENT"],
    ]);
    expect(firstReplay.every((record) => record.payload.migration_backfill === true)).toBe(true);
    expect(firstReplay.some((record) => record.kind !== "EVENT")).toBe(false);

    raw = new SqliteRawHistoryStore(databasePath);
    ledger = new SqliteExperienceLedgerStore(databasePath);
    stores.push(raw, ledger);
    expect(raw.getSessionEvents("legacy")).toEqual(rawBefore);
    expect(ledger.getSessionRecords("legacy")).toEqual(firstReplay);
    expect(raw.ingest({
      session_id: "legacy",
      source_event_id: "upstream-1",
      role: "user",
      content: "first",
      event_type: "message",
      created_at: "2026-08-20T00:01:00.000Z",
      token_count: 2,
      metadata: { source: "legacy" },
    })).toEqual(rawBefore[0]);
    expect(ledger.getSessionRecords("legacy")).toEqual(firstReplay);
  });

  it("supports only future-research kinds through public append with ordered replay", () => {
    const raw = track(new SqliteRawHistoryStore(databasePath));
    const event = raw.ingest({ session_id: "chain", role: "user", content: "task" });
    const ledger = track(new SqliteExperienceLedgerStore(databasePath));
    const eventMirror = ledger.getSessionRecords("chain")[0]!;

    let parent = eventMirror;
    for (const [index, kind] of PUBLIC_EXPERIENCE_LEDGER_KINDS.entries()) {
      parent = ledger.append({
        session_id: "chain",
        kind,
        source_key: `host/${kind.toLowerCase()}/${index}`,
        occurred_at: `2026-08-24T02:0${index}:00.000Z`,
        raw_event_ids: [event.id],
        parent_ledger_ids: [parent.id],
        payload: { kind, index },
      });
    }
    const replay = ledger.getSessionRecords("chain");
    expect(replay.map((record) => record.seq)).toEqual([1, 2, 3, 4, 5]);
    expect(new Set(replay.map((record) => record.kind))).toEqual(
      new Set(["EVENT", ...PUBLIC_EXPERIENCE_LEDGER_KINDS])
    );
    expect(EXPERIENCE_LEDGER_KINDS).toContain("CONTEXT_COMPILE");

    ledger.close();
    const reopened = track(new SqliteExperienceLedgerStore(databasePath));
    expect(reopened.getSessionRecords("chain")).toEqual(replay);
  });

  it("reserves raw and telemetry kinds plus their source namespaces for internal atomic APIs", () => {
    const raw = track(new SqliteRawHistoryStore(databasePath));
    raw.ingest({ session_id: "reserved", role: "user", content: "raw" });
    const ledger = track(new SqliteExperienceLedgerStore(databasePath));
    for (const input of [
      { kind: "EVENT", source_key: "host/event" },
      { kind: "CONTEXT_COMPILE", source_key: "host/compile" },
      { kind: "RETRIEVAL_HIT", source_key: "host/hit" },
      { kind: "ACTION", source_key: "raw-event/forged" },
      { kind: "ACTION", source_key: "context-compile/forged" },
      { kind: "ACTION", source_key: "retrieval-hit/forged" },
    ]) {
      expect(() => ledger.append({
        session_id: "reserved",
        payload: {},
        ...input,
      } as never)).toThrowError(expect.objectContaining<Partial<ExperienceLedgerError>>({
        code: "INVALID_INPUT",
      }));
    }
    expect(ledger.getSessionRecords("reserved")).toHaveLength(1);
  });

  it("preserves special JSON data keys in live mirrors and conflicts changed payloads", () => {
    const metadata = JSON.parse(
      '{"__proto__":{"retained":true},"nested":{"constructor":{"prototype":"data"}}}'
    );
    const raw = track(new SqliteRawHistoryStore(databasePath));
    const event = raw.ingest({
      session_id: "special-live", source_event_id: "special-source",
      role: "user", content: "special", metadata,
    });
    expect(Object.prototype.hasOwnProperty.call(event.metadata, "__proto__")).toBe(true);
    expect(JSON.stringify(event.metadata)).toBe(JSON.stringify(metadata));

    const ledger = track(new SqliteExperienceLedgerStore(databasePath));
    const mirrorMetadata = (ledger.getSessionRecords("special-live")[0]!.payload.raw_event as any).metadata;
    expect(JSON.stringify(mirrorMetadata)).toBe(JSON.stringify(metadata));
    expect(Object.getPrototypeOf(mirrorMetadata)).toBeNull();
    expect(() => raw.ingest({
      session_id: "special-live", source_event_id: "special-source",
      role: "user", content: "special",
      metadata: JSON.parse('{"__proto__":{"retained":false}}'),
    })).toThrow(/conflicts with existing raw evidence/);

    const firstPayload = JSON.parse(
      '{"__proto__":{"candidate":"A"},"nested":{"constructor":{"prototype":"A"}}}'
    );
    const secondPayload = JSON.parse(
      '{"__proto__":{"candidate":"B"},"nested":{"constructor":{"prototype":"B"}}}'
    );
    const first = ledger.append({
      session_id: "special-live", kind: "ACTION", source_key: "special/action", payload: firstPayload,
    });
    expect(JSON.stringify(first.payload)).toBe(
      '{"__proto__":{"candidate":"A"},"nested":{"constructor":{"prototype":"A"}}}'
    );
    expect(() => ledger.append({
      session_id: "special-live", kind: "ACTION", source_key: "special/action", payload: secondPayload,
    })).toThrowError(expect.objectContaining<Partial<ExperienceLedgerError>>({ code: "CONFLICT" }));
  });

  it("deterministically backfills legacy raw metadata with special JSON data keys", () => {
    const legacy = new DatabaseSync(databasePath);
    legacy.exec(`
      CREATE TABLE sessions (id TEXT PRIMARY KEY, created_at TEXT NOT NULL);
      CREATE TABLE raw_events (
        id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES sessions(id), seq INTEGER NOT NULL,
        source_event_id TEXT, role TEXT NOT NULL, content TEXT NOT NULL, event_type TEXT NOT NULL,
        created_at TEXT NOT NULL, token_count INTEGER NOT NULL, metadata_json TEXT NOT NULL DEFAULT '{}',
        UNIQUE (session_id, seq), UNIQUE (session_id, source_event_id)
      );
      INSERT INTO sessions VALUES ('legacy-special', '2026-08-24T00:00:00.000Z');
      INSERT INTO raw_events VALUES (
        'legacy-special-event', 'legacy-special', 1, NULL, 'user', 'legacy', 'message',
        '2026-08-24T00:00:00.000Z', 1,
        '{"__proto__":{"retained":true},"constructor":{"prototype":"legacy"}}'
      );
    `);
    legacy.close();

    const raw = track(new SqliteRawHistoryStore(databasePath));
    const ledger = track(new SqliteExperienceLedgerStore(databasePath));
    const event = raw.getEvent("legacy-special-event")!;
    const mirror = ledger.getSessionRecords("legacy-special")[0]!;
    expect(JSON.stringify(event.metadata)).toBe(
      '{"__proto__":{"retained":true},"constructor":{"prototype":"legacy"}}'
    );
    expect(JSON.stringify((mirror.payload.raw_event as any).metadata)).toBe(
      '{"__proto__":{"retained":true},"constructor":{"prototype":"legacy"}}'
    );
    expect(mirror.payload.migration_backfill).toBe(true);
  });

  it("makes source retries canonical and conflicts on changed content", () => {
    const raw = track(new SqliteRawHistoryStore(databasePath));
    const event = raw.ingest({ session_id: "retry", role: "tool", content: "result" });
    const firstStore = track(new SqliteExperienceLedgerStore(databasePath));
    const secondStore = track(new SqliteExperienceLedgerStore(databasePath));
    const first = firstStore.append({
      session_id: "retry",
      kind: "ACTION",
      source_key: "operation/1",
      raw_event_ids: [event.id],
      payload: { z: 1, nested: { b: true, a: "same" } },
    });
    const concurrentRetry = secondStore.append({
      session_id: "retry",
      kind: "ACTION",
      source_key: "operation/1",
      raw_event_ids: [event.id],
      payload: { nested: { a: "same", b: true }, z: 1 },
    });
    expect(concurrentRetry).toEqual(first);
    expect(firstStore.getSessionRecords("retry")).toHaveLength(2);

    expect(() => secondStore.append({
      session_id: "retry",
      kind: "ACTION",
      source_key: "operation/1",
      raw_event_ids: [event.id],
      payload: { nested: { a: "changed", b: true }, z: 1 },
    })).toThrowError(expect.objectContaining<Partial<ExperienceLedgerError>>({ code: "CONFLICT" }));
  });

  it("rejects dangling, future, and cross-session raw/parent references", () => {
    const raw = track(new SqliteRawHistoryStore(databasePath));
    const own = raw.ingest({ session_id: "a", role: "user", content: "a" });
    const foreign = raw.ingest({ session_id: "b", role: "user", content: "b" });
    const ledger = track(new SqliteExperienceLedgerStore(databasePath));
    const ownMirror = ledger.getSessionRecords("a")[0]!;
    const foreignMirror = ledger.getSessionRecords("b")[0]!;

    for (const input of [
      { raw_event_ids: ["future-raw"], parent_ledger_ids: [] },
      { raw_event_ids: [foreign.id], parent_ledger_ids: [] },
      { raw_event_ids: [own.id], parent_ledger_ids: ["future-parent"] },
      { raw_event_ids: [own.id], parent_ledger_ids: [foreignMirror.id] },
    ]) {
      expect(() => ledger.append({
        session_id: "a",
        kind: "FEEDBACK",
        source_key: `invalid/${JSON.stringify(input)}`,
        payload: {},
        ...input,
      })).toThrowError(expect.objectContaining<Partial<ExperienceLedgerError>>({ code: "NOT_FOUND" }));
    }
    expect(ledger.getSessionRecords("a")).toEqual([ownMirror]);
  });

  it.each([
    ["undefined", { value: undefined }],
    ["negative zero", { value: -0 }],
    ["NaN", { value: Number.NaN }],
    ["Date", { value: new Date("2026-08-24T00:00:00.000Z") }],
    ["BigInt", { value: 1n }],
  ])("rejects non-JSON %s payloads before consuming ledger sequence", (_label, payload) => {
    const raw = track(new SqliteRawHistoryStore(databasePath));
    raw.ingest({ session_id: "strict", role: "user", content: "raw" });
    const ledger = track(new SqliteExperienceLedgerStore(databasePath));
    expect(() => ledger.append({
      session_id: "strict",
      kind: "ACTION",
      source_key: `invalid/${_label}`,
      payload: payload as never,
    })).toThrowError(expect.objectContaining<Partial<ExperienceLedgerError>>({
      code: "INVALID_INPUT",
    }));
    expect(ledger.append({
      session_id: "strict",
      kind: "ACTION",
      source_key: "valid/after-invalid",
      payload: { valid: [true, null, 1] },
    }).seq).toBe(2);
  });

  it("rejects accessor-shaped refs and unknown input fields without invoking getters", () => {
    const raw = track(new SqliteRawHistoryStore(databasePath));
    raw.ingest({ session_id: "accessor", role: "user", content: "raw" });
    const ledger = track(new SqliteExperienceLedgerStore(databasePath));
    let accessed = false;
    const refs: string[] = [];
    Object.defineProperty(refs, "0", {
      enumerable: true,
      get() { accessed = true; return "secret"; },
    });
    Object.defineProperty(refs, "length", { value: 1 });

    expect(() => ledger.append({
      session_id: "accessor",
      kind: "ACTION",
      source_key: "accessor/refs",
      raw_event_ids: refs,
      payload: {},
    })).toThrowError(expect.objectContaining<Partial<ExperienceLedgerError>>({
      code: "INVALID_INPUT",
    }));
    expect(accessed).toBe(false);
    expect(() => ledger.append({
      session_id: "accessor",
      kind: "ACTION",
      source_key: "unknown/field",
      payload: {},
      extra: true,
    } as never)).toThrowError(expect.objectContaining<Partial<ExperienceLedgerError>>({
      code: "INVALID_INPUT",
    }));
    expect(ledger.getSessionRecords("accessor")).toHaveLength(1);
  });

  it("enforces append-only triggers for other connections and closed-state behavior", () => {
    const raw = track(new SqliteRawHistoryStore(databasePath));
    raw.ingest({ session_id: "immutable", role: "user", content: "raw" });
    const ledger = new SqliteExperienceLedgerStore(databasePath);
    const action = ledger.append({
      session_id: "immutable",
      kind: "ACTION",
      source_key: "immutable/action",
      payload: { action: "keep" },
    });
    ledger.close();
    expect(() => ledger.getRecord(action.id)).toThrowError(
      expect.objectContaining<Partial<ExperienceLedgerError>>({ code: "CLOSED" })
    );

    const direct = new DatabaseSync(databasePath);
    try {
      expect(() => direct.prepare("UPDATE experience_ledger SET payload_json = '{}' WHERE id = ?").run(action.id)).toThrow(/append-only/);
      expect(() => direct.prepare("DELETE FROM experience_ledger WHERE id = ?").run(action.id)).toThrow(/append-only/);
    } finally {
      direct.close();
    }
  });

  function track<T extends { close(): void }>(store: T): T {
    stores.push(store);
    return store;
  }
});
