// @vitest-environment node

import { Worker } from "node:worker_threads";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  ISOLATED_CONTEXT_PROVISIONER_CONTRACT_VERSION,
  IsolatedContextProvisioner,
  IsolatedContextProvisionerError,
  SqliteRawHistoryStore,
  type IsolatedContextProvisionRequest,
  type IsolatedContextProvisionerErrorCode,
} from "../src/index.js";
import { SqliteLedgerHotRawStore } from "../src/ledger-hot-raw.js";
import { SqliteRevisionSubstrate } from "../src/revision-substrate.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const distEntry = join(root, "dist", "index.js");
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

describe("PH1 isolated Context provisioner", () => {
  it("creates native empty targets and replays one payload-free receipt after restart", () => {
    const database = databasePath();
    const request = provisionRequest("create-replay");
    const provisioner = new IsolatedContextProvisioner(database);
    expect(provisioner.preflight()).toEqual({
      capability: "isolated_context_provisioner",
      contract_version: ISOLATED_CONTEXT_PROVISIONER_CONTRACT_VERSION,
      schema_version: 1,
      ready: true,
      exact_operation_lookup: true,
      exact_identity_lookup: true,
      exact_idempotency: true,
      close_empty_supported: false,
    });
    const created = provisioner.provision(request);
    const replay = provisioner.provision(request);
    expect(created).toMatchObject({
      capability: "isolated_context_provisioner",
      contract_version: ISOLATED_CONTEXT_PROVISIONER_CONTRACT_VERSION,
      schema_version: 1,
      operation_id: "create-replay",
      revision: 1,
      status: "OPEN",
      disposition: "CREATED",
      scope: { namespace: "authority" },
    });
    expect(new Set([created.context_id, created.stream_id, created.session_id]).size).toBe(3);
    expect(created.scope.stream_id).toBe(created.stream_id);
    expect(replay).toEqual({ ...created, scope: { ...created.scope }, disposition: "EXISTS" });
    expect(Object.keys(created).sort()).toEqual([
      "capability", "context_id", "contract_version", "created_at", "disposition",
      "operation_id", "receipt_fingerprint", "request_fingerprint", "revision",
      "schema_version", "scope", "session_id", "status", "stream_id",
    ]);
    expect(JSON.stringify(created)).not.toMatch(/content|payload|database|path|sql/iu);
    provisioner.close();

    const audit = new DatabaseSync(database);
    expect(audit.prepare("SELECT COUNT(*) AS count FROM sessions").get()).toEqual({ count: 1 });
    expect(audit.prepare("SELECT COUNT(*) AS count FROM raw_events").get()).toEqual({ count: 0 });
    expect(audit.prepare(
      `SELECT ledger_revision, state_revision, raw_frontier_revision,
              frontier_position, takeover_commit_revision
       FROM cc_revision_streams`
    ).get()).toEqual({
      ledger_revision: 0,
      state_revision: 0,
      raw_frontier_revision: 0,
      frontier_position: 0,
      takeover_commit_revision: 0,
    });
    audit.close();

    const reopened = new IsolatedContextProvisioner(database);
    expect(reopened.lookupByOperation(created.operation_id)).toEqual({
      ...created, scope: { ...created.scope }, disposition: "EXISTS",
    });
    expect(reopened.lookupByIdentity({
      contract_version: ISOLATED_CONTEXT_PROVISIONER_CONTRACT_VERSION,
      context_id: created.context_id,
      stream_id: created.stream_id,
      session_id: created.session_id,
      scope: { ...created.scope },
    })).toEqual({ ...created, scope: { ...created.scope }, disposition: "EXISTS" });
    reopened.close();
  });

  it("rejects operation and identity substitution without mutation", () => {
    const database = databasePath();
    const provisioner = new IsolatedContextProvisioner(database);
    const receipt = provisioner.provision(provisionRequest("collision"));
    expect(() => provisioner.provision({
      ...provisionRequest("collision"), namespace: "shadow:other",
    })).toThrowError(code("OPERATION_COLLISION"));
    expect(() => provisioner.lookupByIdentity({
      contract_version: ISOLATED_CONTEXT_PROVISIONER_CONTRACT_VERSION,
      context_id: receipt.context_id,
      stream_id: receipt.stream_id,
      session_id: receipt.session_id,
      scope: { namespace: "shadow:other", stream_id: receipt.stream_id },
    })).toThrowError(code("IDENTITY_COLLISION"));
    expect(() => provisioner.lookupByIdentity({
      contract_version: ISOLATED_CONTEXT_PROVISIONER_CONTRACT_VERSION,
      context_id: "ctx_missing",
      stream_id: "stream_missing",
      session_id: "session_missing",
      scope: { namespace: "authority", stream_id: "stream_missing" },
    })).toThrowError(code("NOT_FOUND"));
    expect(counts(database)).toEqual({ provisions: 1, sessions: 1, streams: 1 });
    provisioner.close();
  });

  it("keeps the immutable receipt valid after authorized Raw and canonical Raw writes", () => {
    const database = databasePath();
    const provisioner = new IsolatedContextProvisioner(database);
    const receipt = provisioner.provision(provisionRequest("subsequent-writes"));
    const raw = new SqliteRawHistoryStore(database);
    raw.ingest({ session_id: receipt.session_id, role: "user", content: "fresh disposable" });
    raw.close();
    const substrate = new SqliteRevisionSubstrate(database);
    const hotRaw = new SqliteLedgerHotRawStore(database, substrate);
    hotRaw.append({
      scope: receipt.scope,
      event_id: "canonical-1",
      source_kind: "user_input",
      source_id: "source-1",
      source_session_id: receipt.session_id,
      payload: { synthetic: true },
    });
    hotRaw.close();
    substrate.close();
    expect(provisioner.lookupByOperation(receipt.operation_id)).toEqual({
      ...receipt, scope: { ...receipt.scope }, disposition: "EXISTS",
    });
    provisioner.close();
  });

  it("rolls back failures on either side of registry insertion", () => {
    const beforeDatabase = databasePath();
    const before = new IsolatedContextProvisioner(beforeDatabase);
    const beforeTrigger = new DatabaseSync(beforeDatabase);
    beforeTrigger.exec(`CREATE TRIGGER qa_fail_before_session
      BEFORE INSERT ON sessions BEGIN SELECT RAISE(ABORT, 'qa-before'); END;`);
    beforeTrigger.close();
    expect(() => before.provision(provisionRequest("fail-before")))
      .toThrowError(code("STORAGE_UNAVAILABLE"));
    expect(counts(beforeDatabase)).toEqual({ provisions: 0, sessions: 0, streams: 0 });
    before.close();

    const afterDatabase = databasePath();
    const after = new IsolatedContextProvisioner(afterDatabase);
    const afterTrigger = new DatabaseSync(afterDatabase);
    afterTrigger.exec(`CREATE TRIGGER qa_fail_after_registry
      AFTER INSERT ON cc_isolated_context_provisions
      BEGIN SELECT RAISE(ABORT, 'qa-after'); END;`);
    afterTrigger.close();
    expect(() => after.provision(provisionRequest("fail-after")))
      .toThrowError(code("STORAGE_UNAVAILABLE"));
    expect(counts(afterDatabase)).toEqual({ provisions: 0, sessions: 0, streams: 0 });
    after.close();
  });

  it("linearizes identical and differing worker creates", async () => {
    const identicalDatabase = databasePath();
    const identical = await Promise.all([
      workerProvision(identicalDatabase, provisionRequest("worker-identical")),
      workerProvision(identicalDatabase, provisionRequest("worker-identical")),
    ]);
    expect(identical.map((result) => result.disposition).sort()).toEqual(["CREATED", "EXISTS"]);
    expect(new Set(identical.map((result) => result.receipt_fingerprint)).size).toBe(1);
    expect(counts(identicalDatabase)).toEqual({ provisions: 1, sessions: 1, streams: 1 });

    const differingDatabase = databasePath();
    const differing = await Promise.all([
      workerProvision(differingDatabase, provisionRequest("worker-different")),
      workerProvision(differingDatabase, {
        ...provisionRequest("worker-different"), namespace: "shadow:qa",
      }),
    ]);
    expect(differing.filter((result) => result.disposition === "CREATED")).toHaveLength(1);
    expect(differing.filter((result) => result.code === "OPERATION_COLLISION")).toHaveLength(1);
    expect(counts(differingDatabase)).toEqual({ provisions: 1, sessions: 1, streams: 1 });
  });

  it("rejects hostile input and stored receipt tamper with finite errors", () => {
    const database = databasePath();
    const provisioner = new IsolatedContextProvisioner(database);
    for (const value of [
      null,
      {},
      { ...provisionRequest("bad-extra"), extra: true },
      { ...provisionRequest("bad-namespace"), namespace: "user-world" },
      { ...provisionRequest("bad-control"), operation_id: "bad\u0000id" },
    ]) {
      expect(() => provisioner.provision(value as IsolatedContextProvisionRequest))
        .toThrowError(code("INVALID_REQUEST"));
    }
    let trapCount = 0;
    const proxy = new Proxy(provisionRequest("proxy"), {
      ownKeys() {
        trapCount += 1;
        throw new Error("private-proxy-trap");
      },
    });
    expect(() => provisioner.provision(proxy)).toThrowError(code("INVALID_REQUEST"));
    expect(trapCount).toBe(0);
    const receipt = provisioner.provision(provisionRequest("tamper"));
    provisioner.close();

    const tamper = new DatabaseSync(database);
    tamper.exec("DROP TRIGGER cc_isolated_context_provisions_no_update;");
    tamper.prepare(
      "UPDATE cc_isolated_context_provisions SET receipt_fingerprint = ? WHERE operation_id = ?"
    ).run("0".repeat(64), receipt.operation_id);
    tamper.exec(`CREATE TRIGGER cc_isolated_context_provisions_no_update
      BEFORE UPDATE ON cc_isolated_context_provisions
      BEGIN SELECT RAISE(ABORT, 'isolated context provisions are immutable'); END;`);
    tamper.close();
    const corrupted = new IsolatedContextProvisioner(database);
    expect(() => corrupted.lookupByOperation(receipt.operation_id))
      .toThrowError(code("CORRUPT_DATA"));
    expect(() => corrupted.preflight()).toThrowError(code("CORRUPT_DATA"));
    corrupted.close();
  });

  it("revalidates dependency triggers on every public operation", () => {
    for (const trigger of ["cc_revision_commits_no_update", "cc_ledger_raw_events_no_update"]) {
      const database = databasePath();
      const provisioner = new IsolatedContextProvisioner(database);
      const request = provisionRequest(`trigger-${trigger}`);
      const receipt = provisioner.provision(request);
      const direct = new DatabaseSync(database);
      direct.exec(`DROP TRIGGER ${trigger};`);
      direct.close();
      expect(() => provisioner.preflight()).toThrowError(code("CORRUPT_DATA"));
      expect(() => provisioner.provision(request)).toThrowError(code("CORRUPT_DATA"));
      expect(() => provisioner.lookupByOperation(receipt.operation_id))
        .toThrowError(code("CORRUPT_DATA"));
      provisioner.close();
    }
  });

  it("keeps source and built package-root surfaces equivalent and close idempotent", async () => {
    const production = await import(pathToFileURL(distEntry).href);
    expect(production.ISOLATED_CONTEXT_PROVISIONER_CONTRACT_VERSION)
      .toBe(ISOLATED_CONTEXT_PROVISIONER_CONTRACT_VERSION);
    expect(typeof production.IsolatedContextProvisioner).toBe("function");
    const packed = new production.IsolatedContextProvisioner(databasePath());
    expect(packed.provision(provisionRequest("dist-parity")))
      .toMatchObject({ disposition: "CREATED", status: "OPEN" });
    packed.close();
    packed.close();
    expect(() => packed.lookupByOperation("dist-parity"))
      .toThrowError(expect.objectContaining({ code: "STORAGE_UNAVAILABLE" }));
  });
});

function provisionRequest(operationId: string): IsolatedContextProvisionRequest {
  return {
    contract_version: ISOLATED_CONTEXT_PROVISIONER_CONTRACT_VERSION,
    operation_id: operationId,
    namespace: "authority",
  };
}

function databasePath(): string {
  const directory = mkdtempSync(join(tmpdir(), "isolated-context-provisioner-"));
  temporaryDirectories.push(directory);
  return join(directory, "core.db");
}

function code(expected: IsolatedContextProvisionerErrorCode): Error {
  return new IsolatedContextProvisionerError(expected);
}

function counts(databasePathValue: string): {
  provisions: number; sessions: number; streams: number;
} {
  const database = new DatabaseSync(databasePathValue);
  const result = {
    provisions: Number((database.prepare(
      "SELECT COUNT(*) AS count FROM cc_isolated_context_provisions"
    ).get() as { count: number }).count),
    sessions: Number((database.prepare("SELECT COUNT(*) AS count FROM sessions").get() as {
      count: number;
    }).count),
    streams: Number((database.prepare("SELECT COUNT(*) AS count FROM cc_revision_streams").get() as {
      count: number;
    }).count),
  };
  database.close();
  return result;
}

function workerProvision(
  database: string,
  request: IsolatedContextProvisionRequest
): Promise<Record<string, string>> {
  const entry = pathToFileURL(distEntry).href;
  return new Promise((resolvePromise, rejectPromise) => {
    const worker = new Worker(`
      import { parentPort, workerData } from "node:worker_threads";
      try {
        process.argv[1] = workerData.entryPath;
        const { IsolatedContextProvisioner } = await import(workerData.entry);
        const owner = new IsolatedContextProvisioner(workerData.database);
        const receipt = owner.provision(workerData.request);
        owner.close();
        parentPort.postMessage({
          disposition: receipt.disposition,
          receipt_fingerprint: receipt.receipt_fingerprint,
        });
      } catch (error) {
        parentPort.postMessage({ code: error?.code ?? "UNKNOWN" });
      }
    `, {
      eval: true,
      type: "module",
      workerData: { database, request, entry, entryPath: distEntry },
    });
    worker.once("message", (message) => resolvePromise(message as Record<string, string>));
    worker.once("error", rejectPromise);
    worker.once("exit", (exitCode) => {
      if (exitCode !== 0) rejectPromise(new Error(`worker exited ${exitCode}`));
    });
  });
}
