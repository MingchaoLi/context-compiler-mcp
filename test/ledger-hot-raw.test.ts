import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { Worker } from "node:worker_threads";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  LedgerHotRawError,
  SqliteLedgerHotRawStore,
} from "../src/ledger-hot-raw.js";
import { SqliteRawHistoryStore } from "../src/raw-store.js";
import {
  SqliteRevisionSubstrate,
  compareAndAdvanceFrontierInsideCore,
} from "../src/revision-substrate.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const temporaryDirectories: string[] = [];

beforeAll(() => {
  execFileSync(process.execPath, [
    join(root, "node_modules", "typescript", "bin", "tsc"),
    "-p", join(root, "tsconfig.json"),
  ], { cwd: root, stdio: "pipe" });
});

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("WO-03B ledger high-water and Hot Raw replay", () => {
  it("appends scoped canonical Raw Events and supports cross-session provenance", () => {
    const opened = openStore(databasePath());
    const authority = { namespace: "authority", stream_id: "project" };
    const shadow = { namespace: "shadow:experiment-1", stream_id: "project" };
    const first = opened.store.append({
      scope: authority,
      event_id: "event-a",
      source_kind: "user_input",
      source_id: "message-a",
      source_session_id: "chat-a",
      payload: { text: "first" },
      occurred_at: "2026-08-24T10:00:00.000Z",
    });
    const second = opened.store.append({
      scope: authority,
      event_id: "event-b",
      source_kind: "tool_result",
      source_id: "tool-b",
      source_session_id: "chat-b",
      payload: { ok: true },
    });
    const shadowEvent = opened.store.append({
      scope: shadow,
      event_id: "event-shadow",
      source_kind: "external_observation",
      source_id: "observation-shadow",
      payload: null,
    });

    expect(first.ledger_revision).toBe(1);
    expect(second.ledger_revision).toBe(2);
    expect(shadowEvent.ledger_revision).toBe(1);
    const rebuilt = opened.store.rebuild(authority);
    expect(rebuilt.ledger_high_water).toBe(2);
    expect(rebuilt.events.map((event) => event.source_session_id)).toEqual([
      "chat-a", "chat-b",
    ]);
    expect(rebuilt.events.map((event) => event.event_id)).toEqual(["event-a", "event-b"]);
    expect(opened.store.rebuild(shadow)).toMatchObject({
      ledger_high_water: 1,
      events: [{ event_id: "event-shadow", ledger_revision: 1 }],
    });
    expect(opened.store.rebuild({
      namespace: "authority",
      stream_id: "absent",
    })).toMatchObject({ ledger_high_water: 0, events: [] });
    closeStore(opened);
  });

  it("replays exact Event input and rejects every identity or payload substitution", () => {
    const opened = openStore(databasePath());
    const scope = { namespace: "authority", stream_id: "replay" };
    const input = {
      scope,
      event_id: "stable-event",
      source_kind: "file" as const,
      source_id: "file-1",
      source_session_id: "chat-a",
      payload: { b: 2, a: 1 },
      occurred_at: "2026-08-24T10:00:00.000Z",
    };
    const first = opened.store.append(input);
    const replay = opened.store.append({
      ...input,
      scope: { stream_id: "replay", namespace: "authority" },
      payload: { a: 1, b: 2 },
    });
    expect(replay).toEqual(first);
    expect(opened.substrate.getRevisionVector(scope).ledger_revision).toBe(1);

    for (const replacement of [
      { ...input, source_kind: "user_input" as const },
      { ...input, source_id: "file-2" },
      { ...input, source_session_id: "chat-b" },
      { ...input, payload: { a: 9, b: 2 } },
      { ...input, occurred_at: "2026-08-24T10:00:01.000Z" },
    ]) {
      expect(() => opened.store.append(replacement)).toThrowError(code("CONFLICT"));
    }
    const otherScope = opened.store.append({
      ...input,
      scope: { namespace: "authority", stream_id: "other" },
    });
    expect(otherScope.ledger_revision).toBe(1);
    expect(opened.substrate.getRevisionVector({
      namespace: "authority", stream_id: "other",
    }).ledger_revision).toBe(1);
    closeStore(opened);
  });

  it("rolls back Event rows, ledger allocation, and markers when the domain insert fails", () => {
    const database = databasePath();
    const opened = openStore(database);
    const scope = { namespace: "authority", stream_id: "rollback" };
    const failure = new DatabaseSync(database);
    failure.exec(`
      CREATE TRIGGER fail_hot_raw_insert
      BEFORE INSERT ON cc_ledger_raw_events
      WHEN NEW.source_id = 'fail'
      BEGIN
        SELECT RAISE(ABORT, 'injected hot raw failure');
      END;
    `);
    failure.close();
    expect(() => opened.store.append({
      scope,
      event_id: "failed-event",
      source_kind: "file",
      source_id: "fail",
      payload: {},
    })).toThrowError(code("STORAGE_FAILURE"));
    expect(opened.substrate.getRevisionVector(scope).ledger_revision).toBe(0);
    expect(opened.substrate.getCommit(scope, "failed-event")).toBeUndefined();
    expect(opened.store.rebuild(scope).events).toEqual([]);

    const markerScope = { namespace: "authority", stream_id: "marker-rollback" };
    const markerFailure = new DatabaseSync(database);
    markerFailure.exec(`
      CREATE TRIGGER fail_hot_raw_marker
      BEFORE INSERT ON cc_revision_commits
      WHEN NEW.kind = 'RAW_EVENT_APPEND' AND NEW.stream_id = 'marker-rollback'
      BEGIN
        SELECT RAISE(ABORT, 'injected hot raw marker failure');
      END;
    `);
    markerFailure.close();
    expect(() => opened.store.append({
      scope: markerScope,
      event_id: "marker-failed-event",
      source_kind: "file",
      source_id: "marker-pass",
      payload: {},
    })).toThrowError(code("STORAGE_FAILURE"));
    expect(opened.substrate.getRevisionVector(markerScope).ledger_revision).toBe(0);
    expect(opened.substrate.getCommit(markerScope, "marker-failed-event")).toBeUndefined();
    expect(opened.store.rebuild(markerScope).events).toEqual([]);

    const success = opened.store.append({
      scope,
      event_id: "next-event",
      source_kind: "file",
      source_id: "pass",
      payload: {},
    });
    expect(success.ledger_revision).toBe(1);
    closeStore(opened);
  });

  it("rebuilds only committed post-Frontier Events without mutating Frontier", () => {
    const opened = openStore(databasePath());
    const scope = { namespace: "authority", stream_id: "frontier" };
    for (let revision = 1; revision <= 3; revision += 1) {
      opened.store.append({
        scope,
        event_id: `event-${revision}`,
        source_kind: "external_observation",
        source_id: `source-${revision}`,
        payload: { revision },
      });
    }
    compareAndAdvanceFrontierInsideCore(opened.substrate, {
      scope,
      commit_id: "frontier-test-only",
      kind: "FRONTIER_TEST_ONLY",
      expected_frontier_revision: 0,
      expected_frontier_position: 0,
      next_frontier_position: 2,
      request: { test_only: true },
    });
    const before = opened.substrate.getRevisionVector(scope);
    const rebuilt = opened.store.rebuild(scope);
    const after = opened.substrate.getRevisionVector(scope);
    expect(rebuilt.ledger_high_water).toBe(3);
    expect(rebuilt.revision_vector).toEqual(before);
    expect(rebuilt.events.map((event) => event.ledger_revision)).toEqual([3]);
    expect(after).toEqual(before);
    closeStore(opened);
  });

  it("recovers the complete Hot Raw tail after close/reopen with no push state", () => {
    const database = databasePath();
    const scope = { namespace: "authority", stream_id: "crash-gap" };
    const first = openStore(database);
    first.store.append({
      scope,
      event_id: "durable-before-close",
      source_kind: "tool_result",
      source_id: "tool-call-1",
      payload: { durable: true },
    });
    closeStore(first);

    const reopened = openStore(database);
    expect(reopened.store.rebuild(scope)).toMatchObject({
      ledger_high_water: 1,
      events: [{ event_id: "durable-before-close", payload: { durable: true } }],
    });
    closeStore(reopened);
  });

  it("rejects invalid identity, timestamps, and non-plain payload before allocation", () => {
    const opened = openStore(databasePath());
    const scope = { namespace: "authority", stream_id: "validation" };
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    let getterCalls = 0;
    const accessor = Object.defineProperty({}, "secret", {
      enumerable: true,
      get() {
        getterCalls += 1;
        return "not read";
      },
    });
    const exotic: unknown[] = [];
    Object.defineProperty(exotic, "4294967295", { enumerable: true, value: true });
    const base = {
      scope,
      event_id: "event",
      source_kind: "user_input",
      source_id: "source",
      payload: {},
    };
    for (const invalidInput of [
      { ...base, scope: { namespace: "authority", stream_id: "c1-\u0085" } },
      { ...base, event_id: "event-\u009f" },
      { ...base, source_id: " " },
      { ...base, occurred_at: "not-an-iso-timestamp" },
      { ...base, payload: cyclic },
      { ...base, payload: accessor },
      { ...base, payload: exotic },
      { ...base, extra: true },
    ]) {
      expect(() => opened.store.append(invalidInput as never)).toThrowError(
        code("INVALID_INPUT")
      );
    }
    expect(getterCalls).toBe(0);
    expect(opened.substrate.getRevisionVector(scope).ledger_revision).toBe(0);
    expect(opened.store.rebuild(scope).events).toEqual([]);
    closeStore(opened);
  });

  it("fails closed at ledger overflow without inserting an Event or marker", () => {
    const database = databasePath();
    const scope = { namespace: "authority", stream_id: "overflow" };
    const first = openStore(database);
    first.store.append({
      scope,
      event_id: "initial",
      source_kind: "file",
      source_id: "initial",
      payload: {},
    });
    closeStore(first);

    const forceMax = new DatabaseSync(database);
    forceMax.prepare(
      `UPDATE cc_revision_streams SET ledger_revision = ?
       WHERE namespace = ? AND stream_id = ?`
    ).run(Number.MAX_SAFE_INTEGER, scope.namespace, scope.stream_id);
    forceMax.close();
    const reopened = openStore(database);
    expect(() => reopened.store.append({
      scope,
      event_id: "overflow-event",
      source_kind: "file",
      source_id: "overflow",
      payload: {},
    })).toThrowError(code("CONFLICT"));
    expect(reopened.substrate.getCommit(scope, "overflow-event")).toBeUndefined();
    const audit = new DatabaseSync(database);
    expect(audit.prepare(
      "SELECT COUNT(*) AS count FROM cc_ledger_raw_events WHERE namespace = ? AND stream_id = ?"
    ).get(scope.namespace, scope.stream_id)).toEqual({ count: 1 });
    audit.close();
    closeStore(reopened);
  });

  it("serializes concurrent append/retry and produces one consistent high-water", async () => {
    const database = databasePath();
    const initialized = openStore(database);
    closeStore(initialized);
    const scope = { namespace: "authority", stream_id: "concurrent" };
    const distinct = await runConcurrentAppends(database, ["event-a", "event-b"]);
    expect(distinct.every((result) => result.ok)).toBe(true);
    expect(distinct.map((result) => result.ledger_revision).sort()).toEqual([1, 2]);

    const same = await runConcurrentAppends(database, ["same-event", "same-event"], scope);
    expect(same.every((result) => result.ok)).toBe(true);
    expect(new Set(same.map((result) => result.ledger_revision))).toEqual(new Set([3]));
    const audit = openStore(database);
    const rebuilt = audit.store.rebuild(scope);
    expect(rebuilt.ledger_high_water).toBe(3);
    expect(rebuilt.events.map((event) => event.ledger_revision)).toEqual([1, 2, 3]);
    expect(rebuilt.events.filter((event) => event.event_id === "same-event")).toHaveLength(1);
    closeStore(audit);
  });

  it("reads vector high-water and Event rows from one snapshot during concurrent appends", async () => {
    const database = databasePath();
    const initialized = openStore(database);
    closeStore(initialized);
    const scope = { namespace: "authority", stream_id: "snapshot" };
    const reader = openStore(database);
    let completed = false;
    const series = runAppendSeries(database, scope, 30).then((result) => {
      completed = true;
      return result;
    });
    let observations = 0;
    while (!completed) {
      const projection = reader.store.rebuild(scope);
      expect(projection.events).toHaveLength(projection.ledger_high_water);
      if (projection.events.length > 0) {
        expect(projection.events.at(-1)?.ledger_revision).toBe(projection.ledger_high_water);
      }
      observations += 1;
      await new Promise<void>((resolvePromise) => setImmediate(resolvePromise));
    }
    expect(await series).toEqual({ ok: true, ledger_revision: 30 });
    const final = reader.store.rebuild(scope);
    expect(final.ledger_high_water).toBe(30);
    expect(final.events).toHaveLength(30);
    expect(observations).toBeGreaterThan(0);
    closeStore(reader);
  });

  it("initializes fresh/legacy databases concurrently and rejects schema collisions", async () => {
    const fresh = databasePath();
    expect(await runConcurrentOpen(fresh)).toEqual([{ ok: true }, { ok: true }]);

    const legacy = databasePath();
    const raw = new SqliteRawHistoryStore(legacy);
    raw.ingest({ session_id: "legacy", role: "user", content: "legacy only" });
    raw.close();
    expect(await runConcurrentOpen(legacy)).toEqual([{ ok: true }, { ok: true }]);
    const legacyAudit = new DatabaseSync(legacy);
    expect(legacyAudit.prepare("SELECT COUNT(*) AS count FROM raw_events").get())
      .toEqual({ count: 1 });
    expect(legacyAudit.prepare("SELECT COUNT(*) AS count FROM cc_ledger_raw_events").get())
      .toEqual({ count: 0 });
    legacyAudit.close();

    const collisionPath = databasePath();
    const substrate = new SqliteRevisionSubstrate(collisionPath);
    const collision = new DatabaseSync(collisionPath);
    collision.exec("CREATE TABLE cc_ledger_raw_events (wrong TEXT);");
    collision.close();
    expect(() => new SqliteLedgerHotRawStore(collisionPath, substrate)).toThrowError(
      code("STORAGE_FAILURE")
    );
    expect(substrate.getRevisionVector({
      namespace: "authority", stream_id: "collision",
    }).ledger_revision).toBe(0);
    substrate.close();

    const forgedPath = databasePath();
    const forgedSubstrate = new SqliteRevisionSubstrate(forgedPath);
    const forged = new DatabaseSync(forgedPath);
    forged.exec(`
      CREATE TABLE cc_ledger_hot_raw_schema (version INTEGER, completed_at TEXT);
      CREATE TABLE cc_ledger_raw_events (
        namespace TEXT, stream_id TEXT, ledger_revision INTEGER, event_id TEXT,
        source_kind TEXT, source_id TEXT, source_session_id TEXT,
        payload_json TEXT, occurred_at TEXT, created_at TEXT
      );
      CREATE TRIGGER cc_ledger_raw_events_no_update
        AFTER INSERT ON cc_ledger_raw_events BEGIN SELECT 1; END;
      CREATE TRIGGER cc_ledger_raw_events_no_delete
        AFTER INSERT ON cc_ledger_raw_events BEGIN SELECT 1; END;
      CREATE TRIGGER cc_ledger_hot_raw_schema_no_update
        AFTER INSERT ON cc_ledger_hot_raw_schema BEGIN SELECT 1; END;
      CREATE TRIGGER cc_ledger_hot_raw_schema_no_delete
        AFTER INSERT ON cc_ledger_hot_raw_schema BEGIN SELECT 1; END;
      INSERT INTO cc_ledger_hot_raw_schema (version, completed_at) VALUES (1, 'forged');
    `);
    forged.close();
    expect(() => new SqliteLedgerHotRawStore(forgedPath, forgedSubstrate)).toThrowError(
      code("STORAGE_FAILURE")
    );
    forgedSubstrate.close();
  });
});

interface OpenedStore {
  substrate: SqliteRevisionSubstrate;
  store: SqliteLedgerHotRawStore;
}

function openStore(database: string): OpenedStore {
  const substrate = new SqliteRevisionSubstrate(database);
  try {
    return { substrate, store: new SqliteLedgerHotRawStore(database, substrate) };
  } catch (error) {
    substrate.close();
    throw error;
  }
}

function closeStore(opened: OpenedStore): void {
  opened.store.close();
  opened.substrate.close();
}

function databasePath(): string {
  const directory = mkdtempSync(join(tmpdir(), "context-compiler-hot-raw-"));
  temporaryDirectories.push(directory);
  return join(directory, "context.db");
}

function code(expected: string) {
  return expect.objectContaining<Partial<LedgerHotRawError>>({ code: expected as never });
}

interface WorkerResult {
  ok: boolean;
  ledger_revision?: number;
  code?: string;
}

function runConcurrentAppends(
  database: string,
  eventIds: string[],
  scope = { namespace: "authority", stream_id: "concurrent" }
): Promise<WorkerResult[]> {
  const barrier = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT);
  const script = `
    const { parentPort, workerData } = require("node:worker_threads");
    const { join } = require("node:path");
    const { pathToFileURL } = require("node:url");
    (async () => {
      const revision = await import(pathToFileURL(join(
        workerData.root, "dist", "revision-substrate.js"
      )).href);
      const hot = await import(pathToFileURL(join(
        workerData.root, "dist", "ledger-hot-raw.js"
      )).href);
      const substrate = new revision.SqliteRevisionSubstrate(workerData.database);
      const store = new hot.SqliteLedgerHotRawStore(workerData.database, substrate);
      const view = new Int32Array(workerData.barrier);
      Atomics.add(view, 0, 1);
      Atomics.notify(view, 0);
      while (Atomics.load(view, 0) < 2) Atomics.wait(view, 0, 1);
      try {
        const event = store.append({
          scope: workerData.scope,
          event_id: workerData.eventId,
          source_kind: "external_observation",
          source_id: "source-" + workerData.eventId,
          payload: { event_id: workerData.eventId },
        });
        parentPort.postMessage({ ok: true, ledger_revision: event.ledger_revision });
      } catch (error) {
        parentPort.postMessage({ ok: false, code: error && error.code });
      } finally {
        store.close();
        substrate.close();
      }
    })().catch((error) => parentPort.postMessage({ ok: false, code: String(error) }));
  `;
  return Promise.all(eventIds.map((eventId) => new Promise<WorkerResult>((resolvePromise, reject) => {
    const worker = new Worker(script, {
      eval: true,
      workerData: { root, database, eventId, scope, barrier },
    });
    worker.once("message", resolvePromise);
    worker.once("error", reject);
    worker.once("exit", (exitCode) => {
      if (exitCode !== 0) reject(new Error(`Append worker exited ${exitCode}`));
    });
  })));
}

function runConcurrentOpen(database: string): Promise<WorkerResult[]> {
  const barrier = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT);
  const script = `
    const { parentPort, workerData } = require("node:worker_threads");
    const { join } = require("node:path");
    const { pathToFileURL } = require("node:url");
    (async () => {
      const view = new Int32Array(workerData.barrier);
      Atomics.add(view, 0, 1);
      Atomics.notify(view, 0);
      while (Atomics.load(view, 0) < 2) Atomics.wait(view, 0, 1);
      const revision = await import(pathToFileURL(join(
        workerData.root, "dist", "revision-substrate.js"
      )).href);
      const hot = await import(pathToFileURL(join(
        workerData.root, "dist", "ledger-hot-raw.js"
      )).href);
      const substrate = new revision.SqliteRevisionSubstrate(workerData.database);
      const store = new hot.SqliteLedgerHotRawStore(workerData.database, substrate);
      store.close();
      substrate.close();
      parentPort.postMessage({ ok: true });
    })().catch((error) => parentPort.postMessage({
      ok: false, code: error && (error.code || error.message || String(error)),
    }));
  `;
  return Promise.all([0, 1].map(() => new Promise<WorkerResult>((resolvePromise, reject) => {
    const worker = new Worker(script, { eval: true, workerData: { root, database, barrier } });
    worker.once("message", resolvePromise);
    worker.once("error", reject);
    worker.once("exit", (exitCode) => {
      if (exitCode !== 0) reject(new Error(`Open worker exited ${exitCode}`));
    });
  })));
}

function runAppendSeries(
  database: string,
  scope: { namespace: string; stream_id: string },
  count: number
): Promise<WorkerResult> {
  const script = `
    const { parentPort, workerData } = require("node:worker_threads");
    const { join } = require("node:path");
    const { pathToFileURL } = require("node:url");
    (async () => {
      const revision = await import(pathToFileURL(join(
        workerData.root, "dist", "revision-substrate.js"
      )).href);
      const hot = await import(pathToFileURL(join(
        workerData.root, "dist", "ledger-hot-raw.js"
      )).href);
      const substrate = new revision.SqliteRevisionSubstrate(workerData.database);
      const store = new hot.SqliteLedgerHotRawStore(workerData.database, substrate);
      let ledgerRevision = 0;
      try {
        for (let index = 1; index <= workerData.count; index += 1) {
          ledgerRevision = store.append({
            scope: workerData.scope,
            event_id: "series-" + index,
            source_kind: "external_observation",
            source_id: "series-source-" + index,
            payload: { index },
          }).ledger_revision;
        }
        parentPort.postMessage({ ok: true, ledger_revision: ledgerRevision });
      } catch (error) {
        parentPort.postMessage({ ok: false, code: error && error.code });
      } finally {
        store.close();
        substrate.close();
      }
    })().catch((error) => parentPort.postMessage({ ok: false, code: String(error) }));
  `;
  return new Promise<WorkerResult>((resolvePromise, reject) => {
    const worker = new Worker(script, {
      eval: true,
      workerData: { root, database, scope, count },
    });
    worker.once("message", resolvePromise);
    worker.once("error", reject);
    worker.once("exit", (exitCode) => {
      if (exitCode !== 0) reject(new Error(`Series worker exited ${exitCode}`));
    });
  });
}
