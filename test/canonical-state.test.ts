import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { Worker } from "node:worker_threads";
import { afterEach, describe, expect, it } from "vitest";
import {
  CANONICAL_STATE_POLICY_HASH,
  CanonicalStateError,
  SqliteCanonicalStateStore,
} from "../src/canonical-state.js";
import { SqliteLedgerHotRawStore } from "../src/ledger-hot-raw.js";
import { SqliteRawHistoryStore } from "../src/raw-store.js";
import { SqliteRevisionSubstrate } from "../src/revision-substrate.js";
import { SqliteContextStateStore } from "../src/state-store.js";

const root = join(import.meta.dirname, "..");
const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("WO-04A canonical State authority", () => {
  it("commits, replays and reopens one scoped immutable State revision", () => {
    const database = databasePath();
    const opened = openStore(database);
    const scope = { namespace: "authority", stream_id: "project-a" };
    expect(opened.state.readLatest(scope)).toMatchObject({
      state_revision: 0,
      state: { schema_version: 1, items: [] },
      policy_hash: CANONICAL_STATE_POLICY_HASH,
      provenance_event_ids: [],
    });
    expect(opened.substrate.getRevisionVector(scope).state_revision).toBe(0);
    appendEvent(opened, scope, "event-1");
    const input = commitInput(scope, "state-1", 0, "event-1", "goal-1");
    const committed = opened.state.commit(input);
    expect(committed).toMatchObject({
      state_revision: 1,
      previous_state_revision: 0,
      state_commit_id: "state-1",
      state: { items: [{ item_id: "goal-1", status: "ACTIVE" }] },
    });
    expect(opened.state.commit(input)).toEqual(committed);
    expect(opened.state.readRevision(scope, 1)).toEqual(committed);
    expect(opened.state.readLatest(scope)).toMatchObject({
      state_revision: 1,
      state_hash: committed.state_hash,
      commit: { state_commit_id: "state-1", previous_state_revision: 0 },
    });
    expect(opened.substrate.getRevisionVector(scope)).toMatchObject({
      ledger_revision: 1,
      state_revision: 1,
      raw_frontier_revision: 0,
      frontier_position: 0,
      takeover_commit_revision: 0,
    });
    closeStore(opened);

    const reopened = openStore(database);
    expect(reopened.state.readRevision(scope, 1)).toEqual(committed);
    expect(reopened.state.readLatest(scope).state).toEqual(committed.state);
    closeStore(reopened);
  });

  it("enforces deterministic transitions, monotonic provenance and scoped replay", () => {
    const opened = openStore(databasePath());
    const scope = { namespace: "authority", stream_id: "transitions" };
    appendEvent(opened, scope, "event-a");
    appendEvent(opened, scope, "event-b");
    opened.state.commit(commitInput(scope, "state-a", 0, "event-a", "goal"));

    const update = commitInput(scope, "state-b", 1, "event-b", "goal");
    update.provenance_event_ids = ["event-b", "event-a"];
    update.proposal.upsert_items[0] = {
      ...update.proposal.upsert_items[0]!,
      content: "Goal completed",
      status: "COMPLETED",
      source_event_ids: ["event-b", "event-a"],
      metadata: { reason: "done" },
    };
    const second = opened.state.commit(update);
    expect(second.state_revision).toBe(2);
    expect(second.provenance_event_ids).toEqual(["event-a", "event-b"]);
    expect(second.state.items[0]).toMatchObject({
      status: "COMPLETED",
      source_event_ids: ["event-a", "event-b"],
    });

    expect(opened.state.commit(update)).toEqual(second);
    expect(() => opened.state.commit({ ...update, expected_state_revision: 2 }))
      .toThrowError(code("CONFLICT"));
    expect(() => opened.state.commit({ ...update, commit_mode: "lazy_historical" }))
      .toThrowError(code("CONFLICT"));
    appendEvent(opened, scope, "event-c");
    const regress = commitInput(scope, "state-c", 2, "event-c", "goal");
    regress.provenance_event_ids = ["event-a", "event-b", "event-c"];
    regress.proposal.upsert_items[0] = {
      ...regress.proposal.upsert_items[0]!,
      status: "ACTIVE",
      source_event_ids: ["event-a", "event-b", "event-c"],
    };
    expect(() => opened.state.commit(regress)).toThrowError(code("CONFLICT"));
    expect(opened.substrate.getRevisionVector(scope).state_revision).toBe(2);
    closeStore(opened);
  });

  it("isolates authority/shadow and same-named streams with scoped Event identity", () => {
    const opened = openStore(databasePath());
    const scopes = [
      { namespace: "authority", stream_id: "same" },
      { namespace: "shadow:experiment", stream_id: "same" },
      { namespace: "authority", stream_id: "other" },
    ];
    for (const [index, scope] of scopes.entries()) {
      appendEvent(opened, scope, "shared-event");
      const committed = opened.state.commit(
        commitInput(scope, "shared-state", 0, "shared-event", `item-${index}`)
      );
      expect(committed.state_revision).toBe(1);
    }
    expect(scopes.map((scope) => opened.state.readLatest(scope).state.items[0]?.item_id))
      .toEqual(["item-0", "item-1", "item-2"]);
    closeStore(opened);
  });

  it("rejects missing, cross-scope, duplicate and unused provenance before State mutation", () => {
    const opened = openStore(databasePath());
    const scope = { namespace: "authority", stream_id: "provenance" };
    const other = { namespace: "authority", stream_id: "other-provenance" };
    appendEvent(opened, other, "other-event");
    const missing = commitInput(scope, "missing", 0, "missing-event", "goal");
    expect(() => opened.state.commit(missing)).toThrowError(code("CONFLICT"));
    const cross = commitInput(scope, "cross", 0, "other-event", "goal");
    expect(() => opened.state.commit(cross)).toThrowError(code("CONFLICT"));
    appendEvent(opened, scope, "event-1");
    const duplicate = commitInput(scope, "duplicate", 0, "event-1", "goal");
    duplicate.provenance_event_ids = ["event-1", "event-1"];
    expect(() => opened.state.commit(duplicate)).toThrowError(code("INVALID_INPUT"));
    const unused = commitInput(scope, "unused", 0, "event-1", "goal");
    unused.provenance_event_ids = ["event-1", "unused-event"];
    expect(() => opened.state.commit(unused)).toThrowError(code("INVALID_INPUT"));
    expect(opened.substrate.getRevisionVector(scope).state_revision).toBe(0);
    const audit = new DatabaseSync(databasePathFrom(opened));
    expect(audit.prepare(
      "SELECT COUNT(*) AS count FROM cc_canonical_state_revisions WHERE stream_id = 'provenance'"
    ).get()).toEqual({ count: 0 });
    audit.close();
    closeStore(opened);
  });

  it("rolls back the State row, vector and marker at every injected writer boundary", () => {
    const database = databasePath();
    const opened = openStore(database);
    const scope = { namespace: "authority", stream_id: "rollback" };
    appendEvent(opened, scope, "event-1");
    const injectors = [
      `CREATE TRIGGER fail_state BEFORE INSERT ON cc_canonical_state_revisions
       BEGIN SELECT RAISE(ABORT, 'state fail'); END`,
      `CREATE TRIGGER fail_state BEFORE UPDATE ON cc_revision_streams
       BEGIN SELECT RAISE(ABORT, 'vector fail'); END`,
      `CREATE TRIGGER fail_state BEFORE INSERT ON cc_revision_commits
       WHEN NEW.kind = 'CANONICAL_STATE_COMMIT_V1'
       BEGIN SELECT RAISE(ABORT, 'marker fail'); END`,
      `CREATE TABLE qa_deferred_parent (id INTEGER PRIMARY KEY);
       CREATE TABLE qa_deferred_child (
         id INTEGER PRIMARY KEY,
         parent_id INTEGER,
         FOREIGN KEY (parent_id) REFERENCES qa_deferred_parent(id)
           DEFERRABLE INITIALLY DEFERRED
       );
       CREATE TRIGGER fail_state AFTER INSERT ON cc_canonical_state_revisions
       BEGIN INSERT INTO qa_deferred_child (id, parent_id) VALUES (1, 999); END`,
    ];
    for (const [index, ddl] of injectors.entries()) {
      const audit = new DatabaseSync(database);
      audit.exec(ddl);
      audit.close();
      expect(() => opened.state.commit(
        commitInput(scope, `failed-${index}`, 0, "event-1", `goal-${index}`)
      )).toThrowError(code("STORAGE_FAILURE"));
      const after = new DatabaseSync(database);
      expect(after.prepare("SELECT COUNT(*) AS count FROM cc_canonical_state_revisions").get())
        .toEqual({ count: 0 });
      expect(after.prepare(
        "SELECT COUNT(*) AS count FROM cc_revision_commits WHERE operation = 'STATE'"
      ).get()).toEqual({ count: 0 });
      expect(after.prepare(
        "SELECT state_revision FROM cc_revision_streams WHERE namespace = ? AND stream_id = ?"
      ).get(scope.namespace, scope.stream_id)).toEqual({ state_revision: 0 });
      after.exec("DROP TRIGGER fail_state;");
      after.exec("DROP TABLE IF EXISTS qa_deferred_child;");
      after.exec("DROP TABLE IF EXISTS qa_deferred_parent;");
      after.close();
    }
    expect(opened.state.commit(commitInput(scope, "success", 0, "event-1", "goal"))
      .state_revision).toBe(1);
    closeStore(opened);
  });

  it("serializes concurrent same-base proposals and exact retries", async () => {
    const database = databasePath();
    const initialized = openStore(database);
    const scope = { namespace: "authority", stream_id: "concurrent" };
    appendEvent(initialized, scope, "event-a");
    appendEvent(initialized, scope, "event-b");
    appendEvent(initialized, scope, "event-same");
    closeStore(initialized);

    const distinct = await runConcurrentCommits(database, [
      { commitId: "state-a", eventId: "event-a", itemId: "item-a" },
      { commitId: "state-b", eventId: "event-b", itemId: "item-b" },
    ]);
    expect(distinct.filter((result) => result.ok)).toHaveLength(1);
    expect(distinct.filter((result) => result.code === "CONFLICT")).toHaveLength(1);
    const opened = openStore(database);
    expect(opened.state.readLatest(scope).state_revision).toBe(1);
    closeStore(opened);

    const same = await runConcurrentCommits(database, [
      { commitId: "state-same", eventId: "event-same", itemId: "item-same", expected: 1 },
      { commitId: "state-same", eventId: "event-same", itemId: "item-same", expected: 1 },
    ]);
    expect(same.every((result) => result.ok && result.state_revision === 2)).toBe(true);
    const audit = new DatabaseSync(database);
    expect(audit.prepare(
      "SELECT COUNT(*) AS count FROM cc_canonical_state_revisions WHERE state_commit_id = 'state-same'"
    ).get()).toEqual({ count: 1 });
    audit.close();
  });

  it("reads vector and complete State from one snapshot during concurrent commits", async () => {
    const database = databasePath();
    const initialized = openStore(database);
    closeStore(initialized);
    const reader = openStore(database);
    const scope = { namespace: "authority", stream_id: "snapshot" };
    let completed = false;
    const series = runCommitSeries(database, 20).then((result) => {
      completed = true;
      return result;
    });
    let observations = 0;
    while (!completed) {
      const projection = reader.state.readLatest(scope);
      expect(projection.state.items).toHaveLength(projection.state_revision);
      expect(projection.revision_vector.state_revision).toBe(projection.state_revision);
      observations += 1;
      await new Promise<void>((resolvePromise) => setImmediate(resolvePromise));
    }
    expect(await series).toEqual({ ok: true, state_revision: 20 });
    const final = reader.state.readLatest(scope);
    expect(final.state_revision).toBe(20);
    expect(final.state.items).toHaveLength(20);
    expect(observations).toBeGreaterThan(0);
    closeStore(reader);
  });

  it("keeps legacy State separate and migration fail-closed", async () => {
    const legacy = databasePath();
    const raw = new SqliteRawHistoryStore(legacy);
    const event = raw.ingest({ session_id: "legacy", role: "user", content: "legacy" });
    raw.close();
    const legacyState = new SqliteContextStateStore(legacy);
    legacyState.transaction("legacy", () => {
      legacyState.createItem({
        session_id: "legacy",
        type: "GOAL",
        content: "legacy goal",
        status: "ACTIVE",
        source_refs: [event.id],
      });
    });
    legacyState.close();
    expect(await runConcurrentOpen(legacy)).toEqual([{ ok: true }, { ok: true }]);
    const opened = openStore(legacy);
    expect(opened.state.readLatest({ namespace: "authority", stream_id: "legacy" }))
      .toMatchObject({ state_revision: 0, state: { items: [] } });
    closeStore(opened);
    const audit = new DatabaseSync(legacy);
    expect(audit.prepare("SELECT COUNT(*) AS count FROM context_items").get()).toEqual({ count: 1 });
    expect(audit.prepare("SELECT COUNT(*) AS count FROM cc_canonical_state_revisions").get())
      .toEqual({ count: 0 });
    audit.close();

    const collision = databasePath();
    const substrate = new SqliteRevisionSubstrate(collision);
    const collisionDb = new DatabaseSync(collision);
    collisionDb.exec("CREATE TABLE cc_canonical_state_revisions (wrong TEXT);");
    collisionDb.close();
    expect(() => new SqliteCanonicalStateStore(collision, substrate))
      .toThrowError(code("STORAGE_FAILURE"));
    substrate.close();

    const forged = databasePath();
    const forgedSubstrate = new SqliteRevisionSubstrate(forged);
    const forgedDb = new DatabaseSync(forged);
    forgedDb.exec(`
      CREATE TABLE cc_canonical_state_schema (version INTEGER, completed_at TEXT);
      CREATE TABLE cc_canonical_state_revisions (
        namespace TEXT, stream_id TEXT, state_revision INTEGER, state_commit_id TEXT,
        commit_mode TEXT, previous_state_revision INTEGER, proposal_json TEXT,
        state_json TEXT, state_hash TEXT, policy_hash TEXT,
        provenance_event_ids_json TEXT, created_at TEXT
      );
      CREATE TRIGGER cc_canonical_state_revisions_no_update
        AFTER INSERT ON cc_canonical_state_revisions BEGIN SELECT 1; END;
      CREATE TRIGGER cc_canonical_state_revisions_no_delete
        AFTER INSERT ON cc_canonical_state_revisions BEGIN SELECT 1; END;
      CREATE TRIGGER cc_canonical_state_schema_no_update
        AFTER INSERT ON cc_canonical_state_schema BEGIN SELECT 1; END;
      CREATE TRIGGER cc_canonical_state_schema_no_delete
        AFTER INSERT ON cc_canonical_state_schema BEGIN SELECT 1; END;
      INSERT INTO cc_canonical_state_schema VALUES (1, 'forged');
    `);
    forgedDb.close();
    expect(() => new SqliteCanonicalStateStore(forged, forgedSubstrate))
      .toThrowError(code("STORAGE_FAILURE"));
    forgedSubstrate.close();
  });

  it("binds the immutable State row to the frozen substrate marker", () => {
    const database = databasePath();
    const opened = openStore(database);
    const scope = { namespace: "authority", stream_id: "binding" };
    appendEvent(opened, scope, "event-1");
    opened.state.commit(commitInput(scope, "state-1", 0, "event-1", "goal"));
    const audit = new DatabaseSync(database);
    audit.exec("DROP TRIGGER cc_canonical_state_revisions_no_update;");
    audit.prepare(
      `UPDATE cc_canonical_state_revisions SET created_at = ?
       WHERE namespace = ? AND stream_id = ? AND state_revision = 1`
    ).run("2000-01-01T00:00:00.000Z", scope.namespace, scope.stream_id);
    audit.close();
    expect(() => opened.state.readLatest(scope)).toThrowError(code("CORRUPT_DATA"));
    closeStore(opened);
  });

  it("rejects invalid/no-op/control/exotic/overflow input without advancing State", () => {
    const database = databasePath();
    const opened = openStore(database);
    const scope = { namespace: "authority", stream_id: "invalid" };
    appendEvent(opened, scope, "event-1");
    const base = commitInput(scope, "state-1", 0, "event-1", "goal");

    expect(() => opened.state.commit({ ...base, policy_hash: "0".repeat(64) }))
      .toThrowError(code("INVALID_INPUT"));
    expect(() => opened.state.commit({
      ...base,
      proposal: { schema_version: 1, upsert_items: [] },
      provenance_event_ids: [],
    })).toThrowError(code("INVALID_INPUT"));
    expect(() => opened.state.commit({
      ...base,
      state_commit_id: "bad\u0085id",
    })).toThrowError(code("INVALID_INPUT"));
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(() => opened.state.commit({
      ...base,
      proposal: {
        ...base.proposal,
        upsert_items: [{ ...base.proposal.upsert_items[0]!, metadata: cyclic as never }],
      },
    })).toThrowError(code("INVALID_INPUT"));
    let accessed = false;
    const accessor = Object.create(null) as Record<string, unknown>;
    Object.defineProperty(accessor, "x", {
      enumerable: true,
      get() { accessed = true; return 1; },
    });
    expect(() => opened.state.commit({
      ...base,
      proposal: {
        ...base.proposal,
        upsert_items: [{ ...base.proposal.upsert_items[0]!, metadata: accessor as never }],
      },
    })).toThrowError(code("INVALID_INPUT"));
    expect(accessed).toBe(false);
    expect(() => opened.state.commit({ ...base, expected_state_revision: Number.MAX_SAFE_INTEGER }))
      .toThrowError(code("CONFLICT"));
    expect(opened.substrate.getRevisionVector(scope).state_revision).toBe(0);

    const first = opened.state.commit(base);
    const noOp = commitInput(scope, "state-no-op", 1, "event-1", "goal");
    noOp.proposal.upsert_items[0] = { ...first.state.items[0]! };
    expect(() => opened.state.commit(noOp)).toThrowError(code("CONFLICT"));
    expect(opened.substrate.getRevisionVector(scope).state_revision).toBe(1);
    expect(() => opened.state.readRevision(scope, 2)).toThrowError(code("NOT_FOUND"));

    const overflowScope = { namespace: "authority", stream_id: "overflow" };
    appendEvent(opened, overflowScope, "overflow-event");
    const audit = new DatabaseSync(database);
    audit.prepare(
      `UPDATE cc_revision_streams SET state_revision = ?
       WHERE namespace = ? AND stream_id = ?`
    ).run(Number.MAX_SAFE_INTEGER, overflowScope.namespace, overflowScope.stream_id);
    audit.close();
    expect(() => opened.state.commit(commitInput(
      overflowScope,
      "overflow-state",
      Number.MAX_SAFE_INTEGER,
      "overflow-event",
      "overflow-goal"
    ))).toThrowError(code("CONFLICT"));
    const overflowAudit = new DatabaseSync(database);
    expect(overflowAudit.prepare(
      `SELECT COUNT(*) AS count FROM cc_canonical_state_revisions
       WHERE namespace = ? AND stream_id = ?`
    ).get(overflowScope.namespace, overflowScope.stream_id)).toEqual({ count: 0 });
    expect(overflowAudit.prepare(
      `SELECT COUNT(*) AS count FROM cc_revision_commits
       WHERE namespace = ? AND stream_id = ? AND operation = 'STATE'`
    ).get(overflowScope.namespace, overflowScope.stream_id)).toEqual({ count: 0 });
    overflowAudit.close();
    closeStore(opened);
  });
});

interface OpenedStore {
  database: string;
  substrate: SqliteRevisionSubstrate;
  hotRaw: SqliteLedgerHotRawStore;
  state: SqliteCanonicalStateStore;
}

function openStore(database: string): OpenedStore {
  const substrate = new SqliteRevisionSubstrate(database);
  let hotRaw: SqliteLedgerHotRawStore | undefined;
  try {
    hotRaw = new SqliteLedgerHotRawStore(database, substrate);
    return {
      database,
      substrate,
      hotRaw,
      state: new SqliteCanonicalStateStore(database, substrate),
    };
  } catch (error) {
    hotRaw?.close();
    substrate.close();
    throw error;
  }
}

function closeStore(opened: OpenedStore): void {
  opened.state.close();
  opened.hotRaw.close();
  opened.substrate.close();
}

function appendEvent(opened: OpenedStore, scope: RevisionScope, eventId: string): void {
  opened.hotRaw.append({
    scope,
    event_id: eventId,
    source_kind: "external_observation",
    source_id: `source-${eventId}`,
    payload: { event_id: eventId },
  });
}

function commitInput(
  scope: RevisionScope,
  commitId: string,
  expected: number,
  eventId: string,
  itemId: string
) {
  return {
    scope,
    state_commit_id: commitId,
    commit_mode: "immediate_authority" as const,
    expected_state_revision: expected,
    proposal: {
      schema_version: 1 as const,
      upsert_items: [{
        item_id: itemId,
        kind: "GOAL" as const,
        content: "Keep the canonical boundary",
        status: "ACTIVE" as const,
        source_event_ids: [eventId],
        metadata: {},
      }],
    },
    policy_hash: CANONICAL_STATE_POLICY_HASH,
    provenance_event_ids: [eventId],
  };
}

function databasePath(): string {
  const directory = mkdtempSync(join(tmpdir(), "context-compiler-canonical-state-"));
  temporaryDirectories.push(directory);
  return join(directory, "context.db");
}

function databasePathFrom(opened: OpenedStore): string {
  return opened.database;
}

function code(expected: string) {
  return expect.objectContaining<Partial<CanonicalStateError>>({ code: expected as never });
}

interface WorkerInput {
  commitId: string;
  eventId: string;
  itemId: string;
  expected?: number;
}

interface WorkerResult {
  ok: boolean;
  state_revision?: number;
  code?: string;
}

function runConcurrentCommits(database: string, inputs: WorkerInput[]): Promise<WorkerResult[]> {
  const barrier = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT);
  const script = workerPrelude() + `
    const opened = open(workerData.database);
    const view = new Int32Array(workerData.barrier);
    Atomics.add(view, 0, 1); Atomics.notify(view, 0);
    while (Atomics.load(view, 0) < 2) Atomics.wait(view, 0, 1);
    try {
      const result = opened.state.commit(input(
        workerData.commitId, workerData.expected, workerData.eventId, workerData.itemId
      ));
      parentPort.postMessage({ ok: true, state_revision: result.state_revision });
    } catch (error) {
      parentPort.postMessage({ ok: false, code: error && error.code });
    } finally { close(opened); }
  })().catch((error) => parentPort.postMessage({ ok: false, code: String(error) }));`;
  return Promise.all(inputs.map((inputValue) => new Promise<WorkerResult>((resolve, reject) => {
    const worker = new Worker(script, {
      eval: true,
      workerData: {
        root,
        database,
        barrier,
        ...inputValue,
        expected: inputValue.expected ?? 0,
      },
    });
    let result: WorkerResult | undefined;
    worker.once("message", (message: WorkerResult) => { result = message; });
    worker.once("error", reject);
    worker.once("exit", (exitCode) => {
      if (exitCode !== 0) reject(new Error(`Commit worker exited ${exitCode}`));
      else if (result === undefined) reject(new Error("Commit worker returned no result"));
      else resolve(result);
    });
  })));
}

function runCommitSeries(database: string, count: number): Promise<WorkerResult> {
  const script = workerPrelude() + `
    const opened = open(workerData.database);
    let revision = 0;
    try {
      for (let index = 1; index <= workerData.count; index += 1) {
        const eventId = "event-" + index;
        opened.hot.append({
          scope, event_id: eventId, source_kind: "external_observation",
          source_id: "source-" + index, payload: { index }
        });
        revision = opened.state.commit(input(
          "state-" + index, index - 1, eventId, "item-" + String(index).padStart(3, "0")
        )).state_revision;
      }
      parentPort.postMessage({ ok: true, state_revision: revision });
    } catch (error) {
      parentPort.postMessage({ ok: false, code: error && error.code });
    } finally { close(opened); }
  })().catch((error) => parentPort.postMessage({ ok: false, code: String(error) }));`;
  return new Promise<WorkerResult>((resolve, reject) => {
    const worker = new Worker(script, {
      eval: true,
      workerData: { root, database, count, streamId: "snapshot" },
    });
    let result: WorkerResult | undefined;
    worker.once("message", (message: WorkerResult) => { result = message; });
    worker.once("error", reject);
    worker.once("exit", (exitCode) => {
      if (exitCode !== 0) reject(new Error(`Series worker exited ${exitCode}`));
      else if (result === undefined) reject(new Error("Series worker returned no result"));
      else resolve(result);
    });
  });
}

function runConcurrentOpen(database: string): Promise<WorkerResult[]> {
  const barrier = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT);
  const script = workerPrelude() + `
    const view = new Int32Array(workerData.barrier);
    Atomics.add(view, 0, 1); Atomics.notify(view, 0);
    while (Atomics.load(view, 0) < 2) Atomics.wait(view, 0, 1);
    const opened = open(workerData.database);
    close(opened);
    parentPort.postMessage({ ok: true });
  })().catch((error) => parentPort.postMessage({ ok: false, code: error && error.code }));`;
  return Promise.all([0, 1].map(() => new Promise<WorkerResult>((resolve, reject) => {
    const worker = new Worker(script, {
      eval: true,
      workerData: { root, database, barrier },
    });
    let result: WorkerResult | undefined;
    worker.once("message", (message: WorkerResult) => { result = message; });
    worker.once("error", reject);
    worker.once("exit", (exitCode) => {
      if (exitCode !== 0) reject(new Error(`Open worker exited ${exitCode}`));
      else if (result === undefined) reject(new Error("Open worker returned no result"));
      else resolve(result);
    });
  })));
}

function workerPrelude(): string {
  return `
  const { parentPort, workerData } = require("node:worker_threads");
  const { join } = require("node:path");
  const { pathToFileURL } = require("node:url");
  (async () => {
    const revisionModule = await import(pathToFileURL(join(
      workerData.root, "dist", "revision-substrate.js"
    )).href);
    const hotModule = await import(pathToFileURL(join(
      workerData.root, "dist", "ledger-hot-raw.js"
    )).href);
    const stateModule = await import(pathToFileURL(join(
      workerData.root, "dist", "canonical-state.js"
    )).href);
    const scope = {
      namespace: "authority",
      stream_id: workerData.streamId || "concurrent"
    };
    function open(database) {
      const substrate = new revisionModule.SqliteRevisionSubstrate(database);
      const hot = new hotModule.SqliteLedgerHotRawStore(database, substrate);
      const state = new stateModule.SqliteCanonicalStateStore(database, substrate);
      return { substrate, hot, state };
    }
    function close(opened) {
      opened.state.close(); opened.hot.close(); opened.substrate.close();
    }
    function input(commitId, expected, eventId, itemId) {
      return {
        scope, state_commit_id: commitId, commit_mode: "immediate_authority",
        expected_state_revision: expected,
        proposal: { schema_version: 1, upsert_items: [{
          item_id: itemId, kind: "GOAL", content: "worker " + itemId,
          status: "ACTIVE", source_event_ids: [eventId], metadata: {}
        }] },
        policy_hash: stateModule.CANONICAL_STATE_POLICY_HASH,
        provenance_event_ids: [eventId]
      };
    }
  `;
}

interface RevisionScope {
  namespace: string;
  stream_id: string;
}
