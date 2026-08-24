import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { Worker } from "node:worker_threads";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  RevisionSubstrateError,
  SqliteRevisionSubstrate,
  commitLedgerRevisionInsideCore,
  commitStateRevisionInsideCore,
  commitTakeoverFrontierInsideCore,
  commitTakeoverRevisionInsideCore,
  compareAndAdvanceFrontierInsideCore,
} from "../src/revision-substrate.js";
import { SqliteRawHistoryStore } from "../src/raw-store.js";

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

describe("WO-03A shared revision substrate", () => {
  it("keeps four axes independent and isolates authority/shadow scopes", () => {
    const database = databasePath();
    const substrate = new SqliteRevisionSubstrate(database);
    const authority = { namespace: "authority", stream_id: "project-A" };
    const shadow = { namespace: "shadow:experiment-1", stream_id: "project-A" };

    expect(Reflect.ownKeys(substrate)).toEqual([]);
    expect(Reflect.ownKeys(SqliteRevisionSubstrate.prototype)).toEqual([
      "constructor", "getRevisionVector", "getCommit", "close",
    ]);

    expect(substrate.getRevisionVector(authority)).toEqual(vector(authority));
    expect(substrate.getRevisionVector(shadow)).toEqual(vector(shadow));

    const ledger = commitLedgerRevisionInsideCore(substrate, {
      scope: authority,
      commit_id: "ledger-1",
      kind: "TEST_LEDGER",
      request: { event: "one" },
    }, () => ({ event_id: "event-1" }));
    expect(ledger.current).toEqual(vector(authority, { ledger_revision: 1 }));

    const state = commitStateRevisionInsideCore(substrate, {
      scope: authority,
      commit_id: "state-1",
      kind: "TEST_STATE",
      expected_state_revision: 0,
      request: { delta: "one" },
    });
    expect(state.current).toEqual(vector(authority, {
      ledger_revision: 1,
      state_revision: 1,
    }));

    commitLedgerRevisionInsideCore(substrate, {
      scope: shadow,
      commit_id: "shadow-ledger-1",
      kind: "TEST_LEDGER",
      request: { event: "shadow" },
    });
    expect(substrate.getRevisionVector(authority)).toEqual(vector(authority, {
      ledger_revision: 1,
      state_revision: 1,
    }));
    expect(substrate.getRevisionVector(shadow)).toEqual(vector(shadow, {
      ledger_revision: 1,
    }));
    substrate.close();
  });

  it("replays exact requests without rerunning callbacks and rejects substitution", () => {
    const database = databasePath();
    const substrate = new SqliteRevisionSubstrate(database);
    const scope = { namespace: "authority", stream_id: "replay" };
    let callbackCount = 0;
    const first = commitLedgerRevisionInsideCore(substrate, {
      scope,
      commit_id: "same-key",
      kind: "RAW_APPEND_TEST",
      request: { z: [3, 2, 1], a: { two: 2, one: 1 } },
    }, () => {
      callbackCount += 1;
      return { stable: true };
    });
    const replay = commitLedgerRevisionInsideCore(substrate, {
      scope: { stream_id: "replay", namespace: "authority" },
      commit_id: "same-key",
      kind: "RAW_APPEND_TEST",
      request: { a: { one: 1, two: 2 }, z: [3, 2, 1] },
    }, () => {
      callbackCount += 1;
      return { stable: false };
    });
    expect(replay).toEqual(first);
    expect(callbackCount).toBe(1);
    expect(substrate.getRevisionVector(scope).ledger_revision).toBe(1);
    expect(() => commitLedgerRevisionInsideCore(substrate, {
      scope,
      commit_id: "same-key",
      kind: "RAW_APPEND_TEST",
      request: { a: { one: 1, two: 9 }, z: [3, 2, 1] },
    })).toThrowError(code("CONFLICT"));

    const tamper = new DatabaseSync(database);
    expect(() => tamper.prepare(
      "UPDATE cc_revision_commits SET request_json = ? WHERE commit_id = ?"
    ).run("{}", "same-key")).toThrow();
    tamper.exec("DROP TRIGGER cc_revision_commits_no_update;");
    tamper.prepare(
      "UPDATE cc_revision_commits SET request_json = ? WHERE commit_id = ?"
    ).run("{}", "same-key");
    tamper.close();
    expect(() => substrate.getCommit(scope, "same-key")).toThrowError(code("CORRUPT_DATA"));
    substrate.close();
  });

  it("rejects a coordinated stored CAS descriptor substitution", () => {
    const database = databasePath();
    const scope = { namespace: "authority", stream_id: "stored-descriptor" };
    const substrate = new SqliteRevisionSubstrate(database);
    commitStateRevisionInsideCore(substrate, {
      scope,
      commit_id: "state-marker",
      kind: "TEST_STATE",
      expected_state_revision: 0,
      request: { delta: "one" },
    });
    substrate.close();

    const tamperedJson = JSON.stringify({
      commit_id: "state-marker",
      expected_state_revision: 99,
      kind: "TEST_STATE",
      operation: "STATE",
      request: { delta: "one" },
      scope: { namespace: "authority", stream_id: "stored-descriptor" },
    });
    const tamperedFingerprint = createHash("sha256").update(tamperedJson).digest("hex");
    const tamper = new DatabaseSync(database);
    tamper.exec("DROP TRIGGER cc_revision_commits_no_update;");
    tamper.prepare(
      `UPDATE cc_revision_commits
       SET request_json = ?, request_fingerprint = ?
       WHERE namespace = ? AND stream_id = ? AND commit_id = ?`
    ).run(
      tamperedJson,
      tamperedFingerprint,
      scope.namespace,
      scope.stream_id,
      "state-marker"
    );
    tamper.exec(`
      CREATE TRIGGER cc_revision_commits_no_update
      BEFORE UPDATE ON cc_revision_commits
      BEGIN
        SELECT RAISE(ABORT, 'revision commit markers are immutable');
      END;
    `);
    tamper.close();

    const reopened = new SqliteRevisionSubstrate(database);
    expect(() => reopened.getCommit(scope, "state-marker")).toThrowError(
      code("CORRUPT_DATA")
    );
    let callbackCount = 0;
    expect(() => commitStateRevisionInsideCore(reopened, {
      scope,
      commit_id: "state-marker",
      kind: "TEST_STATE",
      expected_state_revision: 99,
      request: { delta: "one" },
    }, () => {
      callbackCount += 1;
      return null;
    })).toThrowError(code("CORRUPT_DATA"));
    expect(callbackCount).toBe(0);
    reopened.close();
  });

  it("double-CASes Frontier and keeps takeover identity separate from ordering", () => {
    const substrate = new SqliteRevisionSubstrate(databasePath());
    const scope = { namespace: "authority", stream_id: "frontier" };
    for (let revision = 1; revision <= 3; revision += 1) {
      commitLedgerRevisionInsideCore(substrate, {
        scope,
        commit_id: `ledger-${revision}`,
        kind: "TEST_LEDGER",
        request: { revision },
      });
    }
    const frontier = compareAndAdvanceFrontierInsideCore(substrate, {
      scope,
      commit_id: "frontier-1",
      kind: "FRONTIER_CAS_TEST",
      expected_frontier_revision: 0,
      expected_frontier_position: 0,
      next_frontier_position: 2,
      request: { covered: [1, 2] },
    });
    expect(frontier.current).toEqual(vector(scope, {
      ledger_revision: 3,
      raw_frontier_revision: 1,
      frontier_position: 2,
    }));
    expect(() => compareAndAdvanceFrontierInsideCore(substrate, {
      scope,
      commit_id: "wrong-position",
      kind: "FRONTIER_CAS_TEST",
      expected_frontier_revision: 1,
      expected_frontier_position: 1,
      next_frontier_position: 3,
      request: {},
    })).toThrowError(code("CONFLICT"));
    expect(() => compareAndAdvanceFrontierInsideCore(substrate, {
      scope,
      commit_id: "wrong-revision",
      kind: "FRONTIER_CAS_TEST",
      expected_frontier_revision: 0,
      expected_frontier_position: 2,
      next_frontier_position: 3,
      request: {},
    })).toThrowError(code("CONFLICT"));
    expect(() => compareAndAdvanceFrontierInsideCore(substrate, {
      scope,
      commit_id: "beyond-ledger",
      kind: "FRONTIER_CAS_TEST",
      expected_frontier_revision: 1,
      expected_frontier_position: 2,
      next_frontier_position: 4,
      request: {},
    })).toThrowError(code("INVALID_INPUT"));

    const takeover = commitTakeoverFrontierInsideCore(substrate, {
      scope,
      commit_id: "takeover-stable-id",
      kind: "TAKEOVER_SUBSTRATE_TEST",
      expected_frontier_revision: 1,
      expected_frontier_position: 2,
      next_frontier_position: 3,
      request: { substrate_only: true },
    });
    expect(takeover.commit_id).toBe("takeover-stable-id");
    expect(takeover.current.takeover_commit_revision).toBe(1);
    expect(takeover.current.raw_frontier_revision).toBe(2);
    expect(takeover.current.frontier_position).toBe(3);
    const ordered = commitTakeoverRevisionInsideCore(substrate, {
      scope,
      commit_id: "takeover-second-id",
      kind: "TAKEOVER_ORDER_TEST",
      request: { substrate_only: true },
    });
    expect(ordered.current.takeover_commit_revision).toBe(2);
    expect(ordered.current.raw_frontier_revision).toBe(2);
    substrate.close();
  });

  it("rolls back domain callbacks, revision allocation, and marker failures", () => {
    const database = databasePath();
    const setup = new DatabaseSync(database);
    setup.exec("CREATE TABLE domain_probe (id TEXT PRIMARY KEY);");
    setup.close();
    const substrate = new SqliteRevisionSubstrate(database);
    const scope = { namespace: "authority", stream_id: "rollback" };

    expect(() => commitLedgerRevisionInsideCore(substrate, {
      scope,
      commit_id: "callback-failure",
      kind: "ROLLBACK_TEST",
      request: {},
    }, ({ database: transaction }) => {
      transaction.prepare("INSERT INTO domain_probe (id) VALUES (?)").run("callback");
      throw new Error("injected callback failure");
    })).toThrow("injected callback failure");
    expect(substrate.getRevisionVector(scope)).toEqual(vector(scope));
    expect(substrate.getCommit(scope, "callback-failure")).toBeUndefined();

    const trigger = new DatabaseSync(database);
    trigger.exec(`
      CREATE TRIGGER fail_test_marker
      BEFORE INSERT ON cc_revision_commits
      WHEN NEW.kind = 'FAIL_MARKER_TEST'
      BEGIN
        SELECT RAISE(ABORT, 'injected marker failure');
      END;
    `);
    trigger.close();
    expect(() => commitLedgerRevisionInsideCore(substrate, {
      scope,
      commit_id: "marker-failure",
      kind: "FAIL_MARKER_TEST",
      request: {},
    }, ({ database: transaction }) => {
      transaction.prepare("INSERT INTO domain_probe (id) VALUES (?)").run("marker");
      return { inserted: true };
    })).toThrow();
    expect(substrate.getRevisionVector(scope)).toEqual(vector(scope));
    expect(substrate.getCommit(scope, "marker-failure")).toBeUndefined();
    substrate.close();

    const audit = new DatabaseSync(database);
    expect(audit.prepare("SELECT id FROM domain_probe ORDER BY id").all()).toEqual([]);
    audit.close();
  });

  it("rejects invalid scope/plain data and overflow before mutation", () => {
    const database = databasePath();
    const substrate = new SqliteRevisionSubstrate(database);
    const valid = { namespace: "authority", stream_id: "validation" };
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
    const exoticArray: unknown[] = [];
    Object.defineProperty(exoticArray, "4294967295", {
      enumerable: true,
      value: "outside array length",
    });
    for (const input of [
      { scope: { namespace: "invalid", stream_id: "x" }, commit_id: "1", kind: "TEST", request: {} },
      { scope: { namespace: "shadow:   ", stream_id: "x" }, commit_id: "1b", kind: "TEST", request: {} },
      { scope: { namespace: "authority", stream_id: " " }, commit_id: "2", kind: "TEST", request: {} },
      { scope: { namespace: "authority", stream_id: "c1-\u0085" }, commit_id: "2b", kind: "TEST", request: {} },
      { scope: { namespace: "authority", stream_id: "c1-\u009f" }, commit_id: "2c", kind: "TEST", request: {} },
      { scope: valid, commit_id: "3", kind: "TEST", request: cyclic },
      { scope: valid, commit_id: "4", kind: "TEST", request: accessor },
      { scope: valid, commit_id: "4b", kind: "TEST", request: exoticArray },
      { scope: valid, commit_id: "5", kind: "TEST", request: {}, extra: true },
    ]) {
      expect(() => commitLedgerRevisionInsideCore(substrate, input as never))
        .toThrowError(code("INVALID_INPUT"));
    }
    expect(getterCalls).toBe(0);
    expect(substrate.getRevisionVector(valid)).toEqual(vector(valid));

    commitLedgerRevisionInsideCore(substrate, {
      scope: valid,
      commit_id: "initial",
      kind: "TEST",
      request: {},
    });
    substrate.close();
    const forceMax = new DatabaseSync(database);
    forceMax.prepare(
      "UPDATE cc_revision_streams SET ledger_revision = ? WHERE namespace = ? AND stream_id = ?"
    ).run(Number.MAX_SAFE_INTEGER, valid.namespace, valid.stream_id);
    forceMax.close();
    const reopened = new SqliteRevisionSubstrate(database);
    expect(() => commitLedgerRevisionInsideCore(reopened, {
      scope: valid,
      commit_id: "overflow",
      kind: "TEST",
      request: {},
    })).toThrowError(code("CONFLICT"));
    expect(reopened.getRevisionVector(valid).ledger_revision).toBe(Number.MAX_SAFE_INTEGER);
    reopened.close();
  });

  it("adds a transactional completion marker without backfilling legacy sessions", () => {
    const database = databasePath();
    const raw = new SqliteRawHistoryStore(database);
    raw.ingest({
      session_id: "legacy-session",
      role: "user",
      content: "legacy evidence",
      source_event_id: "legacy-source",
    });
    raw.close();
    const substrate = new SqliteRevisionSubstrate(database);
    expect(substrate.getRevisionVector({
      namespace: "authority",
      stream_id: "legacy-session",
    })).toEqual(vector({ namespace: "authority", stream_id: "legacy-session" }));
    substrate.close();

    const audit = new DatabaseSync(database);
    expect(audit.prepare("SELECT COUNT(*) AS count FROM cc_revision_streams").get())
      .toEqual({ count: 0 });
    expect(audit.prepare("SELECT version FROM cc_revision_substrate_schema").all())
      .toEqual([{ version: 1 }]);
    expect(audit.prepare("SELECT COUNT(*) AS count FROM raw_events").get())
      .toEqual({ count: 1 });
    expect(() => audit.prepare(
      "UPDATE cc_revision_substrate_schema SET completed_at = completed_at"
    ).run()).toThrow();
    expect(() => audit.prepare("DELETE FROM cc_revision_substrate_schema").run()).toThrow();
    audit.close();

    const incompatible = databasePath();
    const collision = new DatabaseSync(incompatible);
    collision.exec("CREATE TABLE cc_revision_streams (wrong_column TEXT);");
    collision.close();
    expect(() => new SqliteRevisionSubstrate(incompatible)).toThrowError(
      code("STORAGE_FAILURE")
    );
    const collisionAudit = new DatabaseSync(incompatible);
    expect(collisionAudit.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'cc_revision_substrate_schema'"
    ).get()).toBeUndefined();
    expect(collisionAudit.prepare("PRAGMA table_info(cc_revision_streams)").all())
      .toMatchObject([{ name: "wrong_column" }]);
    collisionAudit.close();

    const forged = databasePath();
    const incomplete = new DatabaseSync(forged);
    incomplete.exec(`
      CREATE TABLE cc_revision_substrate_schema (version INTEGER, completed_at TEXT);
      CREATE TABLE cc_revision_streams (
        namespace TEXT, stream_id TEXT, ledger_revision INTEGER,
        state_revision INTEGER, raw_frontier_revision INTEGER,
        frontier_position INTEGER, takeover_commit_revision INTEGER,
        created_at TEXT, updated_at TEXT
      );
      CREATE TABLE cc_revision_commits (
        namespace TEXT, stream_id TEXT, commit_id TEXT, operation TEXT, kind TEXT,
        request_fingerprint TEXT, request_json TEXT, previous_json TEXT,
        current_json TEXT, result_json TEXT, created_at TEXT
      );
      CREATE TRIGGER cc_revision_commits_no_update
        AFTER INSERT ON cc_revision_commits BEGIN SELECT 1; END;
      CREATE TRIGGER cc_revision_commits_no_delete
        AFTER INSERT ON cc_revision_commits BEGIN SELECT 1; END;
      CREATE TRIGGER cc_revision_schema_no_update
        AFTER INSERT ON cc_revision_substrate_schema BEGIN SELECT 1; END;
      CREATE TRIGGER cc_revision_schema_no_delete
        AFTER INSERT ON cc_revision_substrate_schema BEGIN SELECT 1; END;
      INSERT INTO cc_revision_substrate_schema (version, completed_at)
        VALUES (1, 'forged');
    `);
    incomplete.close();
    expect(() => new SqliteRevisionSubstrate(forged)).toThrowError(code("STORAGE_FAILURE"));
  });

  it("serializes concurrent first-open migration for fresh and legacy databases", async () => {
    const fresh = databasePath();
    expect(await runConcurrentOpen(fresh)).toEqual([{ ok: true }, { ok: true }]);
    const freshAudit = new DatabaseSync(fresh);
    expect(freshAudit.prepare("SELECT version FROM cc_revision_substrate_schema").all())
      .toEqual([{ version: 1 }]);
    freshAudit.close();

    const legacy = databasePath();
    const raw = new SqliteRawHistoryStore(legacy);
    raw.ingest({ session_id: "legacy", role: "user", content: "before substrate" });
    raw.close();
    expect(await runConcurrentOpen(legacy)).toEqual([{ ok: true }, { ok: true }]);
    const legacyAudit = new DatabaseSync(legacy);
    expect(legacyAudit.prepare("SELECT COUNT(*) AS count FROM raw_events").get())
      .toEqual({ count: 1 });
    expect(legacyAudit.prepare("SELECT COUNT(*) AS count FROM cc_revision_streams").get())
      .toEqual({ count: 0 });
    legacyAudit.close();
  });

  it("allows only one concurrent State CAS winner across independent connections", async () => {
    const database = databasePath();
    const setup = new SqliteRevisionSubstrate(database);
    setup.close();
    const barrier = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT);
    const results = await Promise.all(["worker-a", "worker-b"].map((commitId) =>
      runStateCasWorker(database, commitId, barrier)
    ));
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.filter((result) => result.code === "CONFLICT")).toHaveLength(1);
    const audit = new SqliteRevisionSubstrate(database);
    expect(audit.getRevisionVector({
      namespace: "authority",
      stream_id: "concurrent",
    }).state_revision).toBe(1);
    audit.close();
  });
});

function databasePath(): string {
  const directory = mkdtempSync(join(tmpdir(), "context-compiler-revision-substrate-"));
  temporaryDirectories.push(directory);
  return join(directory, "context.db");
}

function vector(
  scope: { namespace: string; stream_id: string },
  overrides: Partial<{
    ledger_revision: number;
    state_revision: number;
    raw_frontier_revision: number;
    frontier_position: number;
    takeover_commit_revision: number;
  }> = {}
) {
  return {
    ...scope,
    ledger_revision: 0,
    state_revision: 0,
    raw_frontier_revision: 0,
    frontier_position: 0,
    takeover_commit_revision: 0,
    ...overrides,
  };
}

function code(expected: string) {
  return expect.objectContaining<Partial<RevisionSubstrateError>>({ code: expected as never });
}

interface WorkerResult {
  ok: boolean;
  code?: string;
}

function runStateCasWorker(
  database: string,
  commitId: string,
  barrier: SharedArrayBuffer
): Promise<WorkerResult> {
  const script = `
    const { parentPort, workerData } = require("node:worker_threads");
    const { join } = require("node:path");
    const { pathToFileURL } = require("node:url");
    (async () => {
      const moduleUrl = pathToFileURL(join(workerData.root, "dist", "revision-substrate.js")).href;
      const revision = await import(moduleUrl);
      const substrate = new revision.SqliteRevisionSubstrate(workerData.database);
      const view = new Int32Array(workerData.barrier);
      Atomics.add(view, 0, 1);
      Atomics.notify(view, 0);
      while (Atomics.load(view, 0) < 2) Atomics.wait(view, 0, 1);
      try {
        revision.commitStateRevisionInsideCore(substrate, {
          scope: { namespace: "authority", stream_id: "concurrent" },
          commit_id: workerData.commitId,
          kind: "CONCURRENT_STATE_TEST",
          expected_state_revision: 0,
          request: { worker: workerData.commitId },
        });
        parentPort.postMessage({ ok: true });
      } catch (error) {
        parentPort.postMessage({ ok: false, code: error && error.code });
      } finally {
        substrate.close();
      }
    })().catch((error) => parentPort.postMessage({ ok: false, code: String(error) }));
  `;
  return new Promise((resolvePromise, rejectPromise) => {
    const worker = new Worker(script, {
      eval: true,
      workerData: { root, database, commitId, barrier },
    });
    worker.once("message", resolvePromise);
    worker.once("error", rejectPromise);
    worker.once("exit", (exitCode) => {
      if (exitCode !== 0) rejectPromise(new Error(`State CAS worker exited ${exitCode}`));
    });
  });
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
      const moduleUrl = pathToFileURL(join(workerData.root, "dist", "revision-substrate.js")).href;
      const revision = await import(moduleUrl);
      const substrate = new revision.SqliteRevisionSubstrate(workerData.database);
      substrate.close();
      parentPort.postMessage({ ok: true });
    })().catch((error) => parentPort.postMessage({
      ok: false,
      code: error && (error.code || error.message || String(error)),
    }));
  `;
  return Promise.all([0, 1].map(() => new Promise<WorkerResult>((resolvePromise, rejectPromise) => {
    const worker = new Worker(script, {
      eval: true,
      workerData: { root, database, barrier },
    });
    worker.once("message", resolvePromise);
    worker.once("error", rejectPromise);
    worker.once("exit", (exitCode) => {
      if (exitCode !== 0) rejectPromise(new Error(`Open worker exited ${exitCode}`));
    });
  })));
}
