import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { Worker } from "node:worker_threads";
import { afterEach, describe, expect, it } from "vitest";
import { SqliteAuthorityTransactionCoordinator } from
  "../src/authority-transaction-coordinator.js";
import {
  CANONICAL_FACT_RELATION_POLICY_HASH,
  SqliteCanonicalFactRelationStore,
} from "../src/canonical-fact-relation.js";
import { SqliteCanonicalStateStore } from "../src/canonical-state.js";
import { SqliteLedgerHotRawStore } from "../src/ledger-hot-raw.js";
import { SqliteRevisionSubstrate } from "../src/revision-substrate.js";
import {
  SEMANTIC_TAKEOVER_POLICY_HASH,
  SemanticTakeoverError,
  type SemanticEnrichmentCommitInput,
  type SemanticTakeoverCommitInput,
} from "../src/semantic-takeover.js";

const temporaryDirectories: string[] = [];
const root = join(import.meta.dirname, "..");

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("WO-04C authority transaction coordinator", () => {
  it("keeps same-base losers fail-closed and disjoint scopes independent", () => {
    const database = databasePath();
    const first = open(database);
    const secondSubstrate = new SqliteRevisionSubstrate(database);
    const second = new SqliteAuthorityTransactionCoordinator(database, secondSubstrate);
    const scopeA = { namespace: "authority", stream_id: "race-a" };
    const scopeB = { namespace: "authority", stream_id: "race-b" };
    append(first, scopeA, "a-1");
    append(first, scopeB, "b-1");
    const winner = input(scopeA, "winner", "a-1");
    const loser = input(scopeA, "loser", "a-1");
    const other = input(scopeB, "other", "b-1");
    expect(first.coordinator.commitTakeover(winner).current_revision_vector)
      .toMatchObject({ frontier_position: 1, takeover_commit_revision: 1 });
    expect(() => second.commitTakeover(loser)).toThrowError(code("CONFLICT"));
    expect(second.commitTakeover(other).current_revision_vector)
      .toMatchObject({ frontier_position: 1, takeover_commit_revision: 1 });
    expect(first.substrate.getRevisionVector(scopeA).frontier_position).toBe(1);
    expect(first.substrate.getRevisionVector(scopeB).frontier_position).toBe(1);
    second.close();
    secondSubstrate.close();
    close(first);
  });

  it("allows only one real concurrent same-base Takeover winner", async () => {
    const database = databasePath();
    const opened = open(database);
    const scope = { namespace: "authority", stream_id: "worker-race" };
    append(opened, scope, "event-1");
    close(opened);
    const contenders = [
      input(scope, "worker-a", "event-1"),
      input(scope, "worker-b", "event-1"),
    ];
    const results = await concurrentTakeovers(database, contenders);
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.filter((result) => result.code === "CONFLICT")).toHaveLength(1);
    const audit = new DatabaseSync(database);
    expect(audit.prepare(
      "SELECT COUNT(*) AS count FROM cc_semantic_takeover_commits"
    ).get()).toEqual({ count: 1 });
    expect(audit.prepare(
      "SELECT COUNT(*) AS count FROM cc_compaction_artifacts"
    ).get()).toEqual({ count: 1 });
    expect(audit.prepare(
      `SELECT raw_frontier_revision, frontier_position, takeover_commit_revision
       FROM cc_revision_streams WHERE namespace = ? AND stream_id = ?`
    ).get(scope.namespace, scope.stream_id)).toEqual({
      raw_frontier_revision: 1,
      frontier_position: 1,
      takeover_commit_revision: 1,
    });
    audit.close();
  });

  it("collapses concurrent exact Enrichment retries to one owner/domain commit", async () => {
    const database = databasePath();
    const opened = open(database);
    const scope = { namespace: "authority", stream_id: "enrichment-worker-race" };
    append(opened, scope, "event-1");
    const baseline = opened.substrate.getRevisionVector(scope);
    close(opened);
    const enrichment = enrichmentInput(scope, "same-enrichment", "event-1");
    const results = await concurrentEnrichments(database, [enrichment, enrichment]);
    expect(results).toEqual([{ ok: true }, { ok: true }]);
    const audit = new DatabaseSync(database);
    expect(audit.prepare(
      "SELECT COUNT(*) AS count FROM cc_semantic_enrichment_commits"
    ).get()).toEqual({ count: 1 });
    expect(audit.prepare(
      "SELECT COUNT(*) AS count FROM cc_canonical_fact_relation_commits"
    ).get()).toEqual({ count: 1 });
    expect(audit.prepare(
      "SELECT COUNT(*) AS count FROM cc_canonical_fact_revisions"
    ).get()).toEqual({ count: 1 });
    audit.close();
    const reopened = open(database);
    expect(reopened.substrate.getRevisionVector(scope)).toEqual(baseline);
    expect(reopened.coordinator.readEnrichment(scope, "same-enrichment"))
      .toMatchObject({ enrichment_commit_id: "same-enrichment" });
    close(reopened);
  });

  it("serializes fresh and unrelated legacy concurrent first-open", async () => {
    for (const legacy of [false, true]) {
      const database = databasePath();
      if (legacy) {
        const seed = new DatabaseSync(database);
        seed.exec("CREATE TABLE unrelated_legacy (id TEXT PRIMARY KEY)");
        seed.close();
      }
      expect(await concurrentOpen(database)).toEqual([{ ok: true }, { ok: true }]);
      const audit = new DatabaseSync(database);
      expect(audit.prepare(
        "SELECT version FROM cc_semantic_authority_schema"
      ).get()).toEqual({ version: 1 });
      if (legacy) {
        expect(audit.prepare(
          "SELECT COUNT(*) AS count FROM unrelated_legacy"
        ).get()).toEqual({ count: 0 });
      }
      audit.close();
    }
  });

  it("returns zero current authority without materializing an absent scope", () => {
    const database = databasePath();
    const opened = open(database);
    const scope = { namespace: "authority", stream_id: "absent" };
    expect(opened.coordinator.readCurrent(scope)).toEqual({
      ...scope,
      revision_vector: {
        ...scope,
        ledger_revision: 0,
        state_revision: 0,
        raw_frontier_revision: 0,
        frontier_position: 0,
        takeover_commit_revision: 0,
      },
    });
    const audit = new DatabaseSync(database);
    expect(audit.prepare(
      "SELECT COUNT(*) AS count FROM cc_revision_streams WHERE stream_id = 'absent'"
    ).get()).toEqual({ count: 0 });
    audit.close();
    close(opened);
  });

  it("fails closed on partial collision and forged completion", () => {
    const partialDatabase = databasePath();
    const partialSubstrate = new SqliteRevisionSubstrate(partialDatabase);
    partialSubstrate.close();
    const partial = new DatabaseSync(partialDatabase);
    partial.exec("CREATE TABLE cc_semantic_takeover_commits (forged TEXT)");
    partial.close();
    const substrateForPartial = new SqliteRevisionSubstrate(partialDatabase);
    expect(() => new SqliteAuthorityTransactionCoordinator(
      partialDatabase,
      substrateForPartial
    )).toThrowError(code("STORAGE_FAILURE"));
    substrateForPartial.close();

    const forgedDatabase = databasePath();
    const forgedSubstrate = new SqliteRevisionSubstrate(forgedDatabase);
    forgedSubstrate.close();
    const forged = new DatabaseSync(forgedDatabase);
    forged.exec(`CREATE TABLE cc_semantic_authority_schema (
      version INTEGER PRIMARY KEY CHECK (version > 0), completed_at TEXT NOT NULL
    )`);
    forged.prepare(
      "INSERT INTO cc_semantic_authority_schema (version, completed_at) VALUES (1, ?)"
    ).run(new Date().toISOString());
    forged.close();
    const substrateForForged = new SqliteRevisionSubstrate(forgedDatabase);
    expect(() => new SqliteAuthorityTransactionCoordinator(
      forgedDatabase,
      substrateForForged
    )).toThrowError(code("STORAGE_FAILURE"));
    substrateForForged.close();
  });

  it("protects all WO-04C rows with immutable triggers", () => {
    const database = databasePath();
    const opened = open(database);
    const scope = { namespace: "authority", stream_id: "immutable" };
    append(opened, scope, "event-1");
    opened.coordinator.commitTakeover(input(scope, "immutable-takeover", "event-1"));
    const audit = new DatabaseSync(database);
    for (const statement of [
      "UPDATE cc_semantic_takeover_commits SET artifact_hash = artifact_hash",
      "DELETE FROM cc_semantic_takeover_commits",
      "UPDATE cc_compaction_artifacts SET artifact_hash = artifact_hash",
      "DELETE FROM cc_compaction_artifacts",
      "UPDATE cc_semantic_authority_schema SET version = version",
      "DELETE FROM cc_semantic_authority_schema",
    ]) {
      expect(() => audit.exec(statement)).toThrow();
    }
    audit.close();
    close(opened);
  });

  it("detects coordinated domain substitution on exact read", () => {
    const database = databasePath();
    const opened = open(database);
    const scope = { namespace: "authority", stream_id: "tamper" };
    append(opened, scope, "event-1");
    opened.coordinator.commitTakeover(input(scope, "tamper-takeover", "event-1"));
    const audit = new DatabaseSync(database);
    audit.exec("DROP TRIGGER cc_semantic_takeover_commits_no_update");
    audit.prepare(
      `UPDATE cc_semantic_takeover_commits SET artifact_hash = ?
       WHERE namespace = ? AND stream_id = ? AND takeover_commit_id = ?`
    ).run("f".repeat(64), scope.namespace, scope.stream_id, "tamper-takeover");
    audit.close();
    expect(() => opened.coordinator.readTakeover(scope, "tamper-takeover"))
      .toThrowError(code("CORRUPT_DATA"));
    close(opened);
  });

  it("rolls back marker, domain and Artifact rows on a deferred COMMIT failure", () => {
    const database = databasePath();
    const opened = open(database);
    const scope = { namespace: "authority", stream_id: "commit-failure" };
    append(opened, scope, "event-1");
    const injection = new DatabaseSync(database);
    injection.exec(`
      PRAGMA foreign_keys = ON;
      CREATE TABLE commit_failure_parent (id INTEGER PRIMARY KEY);
      CREATE TABLE commit_failure_child (
        id INTEGER PRIMARY KEY,
        parent_id INTEGER NOT NULL,
        FOREIGN KEY (parent_id) REFERENCES commit_failure_parent(id)
          DEFERRABLE INITIALLY DEFERRED
      );
      CREATE TRIGGER fail_semantic_commit AFTER INSERT ON cc_compaction_artifacts
      BEGIN
        INSERT INTO commit_failure_child (id, parent_id) VALUES (1, 999);
      END;
    `);
    injection.close();
    expect(() => opened.coordinator.commitTakeover(
      input(scope, "commit-failure", "event-1")
    )).toThrowError(code("STORAGE_FAILURE"));
    expect(opened.substrate.getRevisionVector(scope)).toMatchObject({
      ledger_revision: 1,
      raw_frontier_revision: 0,
      frontier_position: 0,
      takeover_commit_revision: 0,
    });
    const audit = new DatabaseSync(database);
    expect(audit.prepare(
      "SELECT COUNT(*) AS count FROM cc_revision_commits WHERE commit_id = 'commit-failure'"
    ).get()).toEqual({ count: 0 });
    for (const table of [
      "cc_semantic_takeover_commits",
      "cc_compaction_artifacts",
      "commit_failure_child",
    ]) {
      expect(audit.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get())
        .toEqual({ count: 0 });
    }
    audit.close();
    close(opened);
  });
});

interface WorkerResult {
  ok: boolean;
  code?: string;
}

function databasePath(): string {
  const directory = mkdtempSync(join(tmpdir(), "context-compiler-04c-coordinator-"));
  temporaryDirectories.push(directory);
  return join(directory, "context.db");
}

function open(database: string) {
  const substrate = new SqliteRevisionSubstrate(database);
  return {
    substrate,
    hot: new SqliteLedgerHotRawStore(database, substrate),
    state: new SqliteCanonicalStateStore(database, substrate),
    knowledge: new SqliteCanonicalFactRelationStore(database),
    coordinator: new SqliteAuthorityTransactionCoordinator(database, substrate),
  };
}

function close(opened: ReturnType<typeof open>): void {
  opened.coordinator.close();
  opened.knowledge.close();
  opened.state.close();
  opened.hot.close();
  opened.substrate.close();
}

function append(
  opened: ReturnType<typeof open>,
  scope: { namespace: string; stream_id: string },
  eventId: string
): void {
  opened.hot.append({
    scope,
    event_id: eventId,
    source_kind: "user_input",
    source_id: `source-${eventId}`,
    payload: { content: eventId },
  });
}

function input(
  scope: { namespace: string; stream_id: string },
  commitId: string,
  eventId: string
): SemanticTakeoverCommitInput {
  const body = { summary: commitId };
  const range = { start: 1, end: 1 };
  const descriptor = {
    artifact_schema: "compaction-artifact/v1",
    namespace: scope.namespace,
    stream_id: scope.stream_id,
    covered_raw_range: range,
    generator_version: "coordinator-test/v1",
    policy_hash: SEMANTIC_TAKEOVER_POLICY_HASH,
    provenance_event_ids: [eventId],
    body,
  };
  return {
    scope,
    takeover_commit_id: commitId,
    ledger_base_revision: 1,
    covered_raw_range: range,
    expected_frontier_revision: 0,
    expected_frontier_position: 0,
    state_authority_ref: null,
    existing_fact_refs: [],
    existing_relation_refs: [],
    coverage: [{
      ledger_revision: 1,
      event_id: eventId,
      disposition: "artifact_only",
      state_item_refs: [],
      fact_refs: [],
      relation_refs: [],
      artifact_only_reason: "no_semantic_delta",
    }],
    compaction_artifact: {
      artifact_id: `artifact-${commitId}`,
      expected_artifact_hash: createHash("sha256")
        .update(canonicalJson(descriptor), "utf8").digest("hex"),
      generator_version: "coordinator-test/v1",
      body,
    },
    policy_hash: SEMANTIC_TAKEOVER_POLICY_HASH,
    provenance_event_ids: [eventId],
  };
}

function enrichmentInput(
  scope: { namespace: string; stream_id: string },
  commitId: string,
  eventId: string
): SemanticEnrichmentCommitInput {
  return {
    scope,
    enrichment_commit_id: commitId,
    source_event_refs: [{ ledger_revision: 1, event_id: eventId }],
    state_authority_ref: null,
    existing_fact_refs: [],
    existing_relation_refs: [],
    fact_relation_apply: {
      scope,
      authority_commit_id: `${commitId}-owner`,
      policy_hash: CANONICAL_FACT_RELATION_POLICY_HASH,
      fact_proposals: [{
        op: "CREATE",
        fact_id: `${commitId}-fact`,
        statement: "Concurrent exact Enrichment retry",
        epistemic_origin: "user_asserted",
        verification_status: "unverified",
        lifecycle_status: "active",
        record_status: "live",
        provenance_event_ids: [eventId],
        verification_event_ids: [],
        metadata: {},
      }],
      relation_proposals: [],
    },
    policy_hash: SEMANTIC_TAKEOVER_POLICY_HASH,
    provenance_event_ids: [eventId],
  };
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${canonicalJson((value as Record<string, unknown>)[key])}`
    ).join(",")}}`;
  }
  return JSON.stringify(value);
}

function code(expected: string) {
  return expect.objectContaining<Partial<SemanticTakeoverError>>({ code: expected as never });
}

function concurrentTakeovers(
  database: string,
  inputs: SemanticTakeoverCommitInput[]
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
      const coordinatorModule = await import(pathToFileURL(join(
        workerData.root, "dist", "authority-transaction-coordinator.js"
      )).href);
      const substrate = new revision.SqliteRevisionSubstrate(workerData.database);
      const coordinator = new coordinatorModule.SqliteAuthorityTransactionCoordinator(
        workerData.database, substrate
      );
      const view = new Int32Array(workerData.barrier);
      Atomics.add(view, 0, 1); Atomics.notify(view, 0);
      while (Atomics.load(view, 0) < 2) Atomics.wait(view, 0, 1);
      try {
        coordinator.commitTakeover(workerData.input);
        parentPort.postMessage({ ok: true });
      } catch (error) {
        parentPort.postMessage({ ok: false, code: error && error.code });
      } finally {
        coordinator.close(); substrate.close();
      }
    })().catch((error) => parentPort.postMessage({
      ok: false, code: error && (error.code || error.message || String(error))
    }));
  `;
  return Promise.all(inputs.map((workerInput) => runWorker(script, {
    root,
    database,
    barrier,
    input: workerInput,
  })));
}

function concurrentOpen(database: string): Promise<WorkerResult[]> {
  const barrier = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT);
  const script = `
    const { parentPort, workerData } = require("node:worker_threads");
    const { join } = require("node:path");
    const { pathToFileURL } = require("node:url");
    (async () => {
      const view = new Int32Array(workerData.barrier);
      Atomics.add(view, 0, 1); Atomics.notify(view, 0);
      while (Atomics.load(view, 0) < 2) Atomics.wait(view, 0, 1);
      const revision = await import(pathToFileURL(join(
        workerData.root, "dist", "revision-substrate.js"
      )).href);
      const coordinatorModule = await import(pathToFileURL(join(
        workerData.root, "dist", "authority-transaction-coordinator.js"
      )).href);
      const substrate = new revision.SqliteRevisionSubstrate(workerData.database);
      const coordinator = new coordinatorModule.SqliteAuthorityTransactionCoordinator(
        workerData.database, substrate
      );
      coordinator.close(); substrate.close();
      parentPort.postMessage({ ok: true });
    })().catch((error) => parentPort.postMessage({
      ok: false, code: error && (error.code || error.message || String(error))
    }));
  `;
  return Promise.all([0, 1].map(() => runWorker(script, { root, database, barrier })));
}

function concurrentEnrichments(
  database: string,
  inputs: SemanticEnrichmentCommitInput[]
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
      const coordinatorModule = await import(pathToFileURL(join(
        workerData.root, "dist", "authority-transaction-coordinator.js"
      )).href);
      const substrate = new revision.SqliteRevisionSubstrate(workerData.database);
      const coordinator = new coordinatorModule.SqliteAuthorityTransactionCoordinator(
        workerData.database, substrate
      );
      const view = new Int32Array(workerData.barrier);
      Atomics.add(view, 0, 1); Atomics.notify(view, 0);
      while (Atomics.load(view, 0) < 2) Atomics.wait(view, 0, 1);
      try {
        coordinator.commitEnrichment(workerData.input);
        parentPort.postMessage({ ok: true });
      } catch (error) {
        parentPort.postMessage({ ok: false, code: error && error.code });
      } finally {
        coordinator.close(); substrate.close();
      }
    })().catch((error) => parentPort.postMessage({
      ok: false, code: error && (error.code || error.message || String(error))
    }));
  `;
  return Promise.all(inputs.map((workerInput) => runWorker(script, {
    root,
    database,
    barrier,
    input: workerInput,
  })));
}

function runWorker(script: string, workerData: object): Promise<WorkerResult> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(script, { eval: true, workerData });
    let result: WorkerResult | undefined;
    worker.once("message", (message: WorkerResult) => { result = message; });
    worker.once("error", reject);
    worker.once("exit", (exitCode) => {
      if (exitCode !== 0) reject(new Error(`WO-04C worker exited ${exitCode}`));
      else if (result === undefined) reject(new Error("WO-04C worker returned no result"));
      else resolve(result);
    });
  });
}
