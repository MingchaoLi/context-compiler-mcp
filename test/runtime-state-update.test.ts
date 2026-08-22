// @vitest-environment node

import { DatabaseSync } from "node:sqlite";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createEmptyStateDelta, type ExtractorTransport } from "../src/extractor.js";
import { StateReducer } from "../src/reducer.js";
import { SqliteRawHistoryStore } from "../src/raw-store.js";
import {
  RuntimeStateUpdater,
  RuntimeStateUpdateError,
  run_state_update,
} from "../src/runtime-state-update.js";
import { SqliteContextStateStore } from "../src/state-store.js";
import { JsonSubprocessExtractorTransport } from "../src/subprocess-extractor.js";

const worker = join(process.cwd(), "test", "fixtures", "extractor-worker.mjs");

describe("provider-neutral runtime state updater", () => {
  let temporaryDirectory: string;
  let databasePath: string;
  let rawStore: SqliteRawHistoryStore;
  let stateStore: SqliteContextStateStore;
  const transports = new Set<JsonSubprocessExtractorTransport>();

  beforeEach(async () => {
    temporaryDirectory = await mkdtemp(join(tmpdir(), "context-compiler-runtime-update-"));
    databasePath = join(temporaryDirectory, "context-compiler.db");
    rawStore = new SqliteRawHistoryStore(databasePath);
    stateStore = new SqliteContextStateStore(databasePath);
  });

  afterEach(async () => {
    await Promise.allSettled([...transports].map((transport) => transport.close()));
    stateStore.close();
    rawStore.close();
    await rm(temporaryDirectory, { recursive: true, force: true });
  });

  function transport(mode: string, timeout = 1_000): JsonSubprocessExtractorTransport {
    const created = new JsonSubprocessExtractorTransport({
      executable: process.execPath,
      args: [worker, mode],
      timeout_ms: timeout,
    });
    transports.add(created);
    return created;
  }

  function newest(content = "runtime evidence") {
    return rawStore.ingest({ session_id: "session-a", role: "user", content });
  }

  it("composes prepare, strict extraction, and one atomic non-empty apply", async () => {
    const event = newest();
    const result = await run_state_update(
      stateStore,
      transport("goal"),
      { session_id: "session-a", newest_event_ids: [event.id] }
    );

    expect(result).toMatchObject({
      expected_revision: 0,
      extraction: { attempts: 1, fallback_used: false, error_codes: [] },
      application: { changed: true, revision: 1 },
    });
    expect(result.preparation_token).toMatch(/^[0-9a-f-]{36}$/);
    expect(result.fingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(stateStore.getItems("session-a")).toMatchObject([{
      type: "GOAL", status: "ACTIVE", content: "Runtime-created goal",
    }]);
  });

  it("passes a legal empty delta through apply and remains idempotent", async () => {
    const event = newest();
    const updater = new RuntimeStateUpdater(stateStore, transport("empty"));
    const first = await updater.updateState({ session_id: "session-a", newest_event_ids: [event.id] });
    const second = await updater.updateState({ session_id: "session-a", newest_event_ids: [event.id] });
    expect(first.application).toMatchObject({ changed: false, revision: 0, created: [], updated: [] });
    expect(second.application).toMatchObject({ changed: false, revision: 0, created: [], updated: [] });
    expect(stateStore.getItems("session-a")).toEqual([]);
  });

  it.each(["invalid-delta", "nonzero", "malformed"])(
    "returns EXTRACTION_FAILED and no state mutation for %s",
    async (mode) => {
      const event = newest();
      const updater = new RuntimeStateUpdater(stateStore, transport(mode), { max_attempts: 1 });
      await expect(updater.updateState({
        session_id: "session-a", newest_event_ids: [event.id],
      })).rejects.toEqual(expect.objectContaining({ code: "EXTRACTION_FAILED" }));
      expect(stateStore.getRevision("session-a")).toBe(0);
      expect(stateStore.getItems("session-a")).toEqual([]);
    }
  );

  it("does not apply before a delayed extraction completes", async () => {
    const event = newest();
    const operation = new RuntimeStateUpdater(stateStore, transport("delayed-goal"))
      .updateState({ session_id: "session-a", newest_event_ids: [event.id] });
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(stateStore.getRevision("session-a")).toBe(0);
    expect(stateStore.getItems("session-a")).toEqual([]);
    await operation;
    expect(stateStore.getRevision("session-a")).toBe(1);
  });

  it("allows raw evidence appended after preparation", async () => {
    const event = newest("prepared");
    const operation = new RuntimeStateUpdater(stateStore, transport("delayed-goal"))
      .updateState({ session_id: "session-a", newest_event_ids: [event.id] });
    await new Promise((resolve) => setTimeout(resolve, 40));
    const appended = newest("appended after preparation");
    const result = await operation;
    expect(result.application.revision).toBe(1);
    expect(rawStore.getSessionEvents("session-a").map(({ id }) => id)).toEqual([event.id, appended.id]);
  });

  it("returns a stable conflict when state changes during extraction", async () => {
    const event = newest();
    const operation = new RuntimeStateUpdater(stateStore, transport("delayed-goal"))
      .updateState({ session_id: "session-a", newest_event_ids: [event.id] });
    await new Promise((resolve) => setTimeout(resolve, 40));
    new StateReducer(stateStore).apply("session-a", {
      ...createEmptyStateDelta(),
      new_constraints: [{ content: "Concurrent state" }],
    });
    await expect(operation).rejects.toEqual(expect.objectContaining({ code: "CONFLICT" }));
    expect(stateStore.getRevision("session-a")).toBe(1);
    expect(stateStore.getItems("session-a")).toMatchObject([{
      type: "CONSTRAINT", content: "Concurrent state",
    }]);
  });

  it("allows exactly one of two concurrent updates at one revision", async () => {
    const event = newest();
    const sharedTransport = transport("delayed-goal");
    const first = new RuntimeStateUpdater(stateStore, sharedTransport).updateState({
      session_id: "session-a", newest_event_ids: [event.id],
    });
    const second = new RuntimeStateUpdater(stateStore, sharedTransport).updateState({
      session_id: "session-a", newest_event_ids: [event.id],
    });
    const results = await Promise.allSettled([first, second]);
    expect(results.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
    const rejected = results.find(({ status }) => status === "rejected");
    expect(rejected).toMatchObject({ status: "rejected", reason: { code: "CONFLICT" } });
    expect(stateStore.getRevision("session-a")).toBe(1);
    expect(stateStore.getItems("session-a")).toHaveLength(1);
  });

  it("maps pre-abort and mid-flight abort without applying state", async () => {
    const event = newest();
    const pre = new AbortController();
    pre.abort();
    await expect(new RuntimeStateUpdater(stateStore, transport("goal")).updateState(
      { session_id: "session-a", newest_event_ids: [event.id] }, pre.signal
    )).rejects.toEqual(expect.objectContaining({ code: "ABORTED" }));

    const active = new AbortController();
    const operation = new RuntimeStateUpdater(stateStore, transport("timeout", 5_000)).updateState(
      { session_id: "session-a", newest_event_ids: [event.id] }, active.signal
    );
    setTimeout(() => active.abort(), 30);
    await expect(operation).rejects.toEqual(expect.objectContaining({ code: "ABORTED" }));
    expect(stateStore.getRevision("session-a")).toBe(0);
    expect(stateStore.getItems("session-a")).toEqual([]);
  });

  it("transport close during extraction leaves no applied state", async () => {
    const event = newest();
    const childTransport = transport("timeout", 5_000);
    const operation = new RuntimeStateUpdater(stateStore, childTransport).updateState({
      session_id: "session-a", newest_event_ids: [event.id],
    });
    await new Promise((resolve) => setTimeout(resolve, 30));
    await childTransport.close();
    await expect(operation).rejects.toEqual(expect.objectContaining({ code: "EXTRACTION_FAILED" }));
    expect(stateStore.getRevision("session-a")).toBe(0);
  });

  it("copies exact input before awaiting the transport", async () => {
    const event = newest();
    let release!: (value: string) => void;
    const complete = vi.fn<ExtractorTransport["complete"]>().mockImplementation(() =>
      new Promise<string>((resolve) => { release = resolve; })
    );
    const submitted = { session_id: "session-a", newest_event_ids: [event.id] };
    const operation = new RuntimeStateUpdater(stateStore, { complete }).updateState(submitted);
    submitted.session_id = "mutated-session";
    submitted.newest_event_ids[0] = "mutated-event";
    release(JSON.stringify(createEmptyStateDelta()));
    const result = await operation;
    expect(result.application).toMatchObject({ changed: false, revision: 0 });
    expect(complete).toHaveBeenCalledTimes(1);
  });

  it("rejects unknown/accessor/prototype input before preparation or transport", async () => {
    const event = newest();
    const complete = vi.fn<ExtractorTransport["complete"]>();
    const updater = new RuntimeStateUpdater(stateStore, { complete });
    const cases: unknown[] = [
      { session_id: "session-a", newest_event_ids: [event.id], extra: true },
      Object.assign(Object.create(null), { session_id: "session-a", newest_event_ids: [event.id] }),
    ];
    let accessed = false;
    const accessor = { session_id: "session-a", newest_event_ids: [event.id] } as any;
    Object.defineProperty(accessor, "extra", {
      enumerable: true, get() { accessed = true; return "PRIVATE"; },
    });
    cases.push(accessor);
    for (const input of cases) {
      await expect(updater.updateState(input as never)).rejects.toEqual(
        expect.objectContaining({ code: "INVALID_INPUT" })
      );
    }
    expect(accessed).toBe(false);
    expect(complete).not.toHaveBeenCalled();
    expect(preparationCount()).toBe(0);
  });

  it.each([0, 4, 1.5])("rejects invalid max_attempts=%s before state work", (maxAttempts) => {
    expect(() => new RuntimeStateUpdater(
      stateStore,
      { complete: vi.fn() },
      { max_attempts: maxAttempts }
    )).toThrowError(expect.objectContaining({ code: "INVALID_INPUT" }));
    expect(preparationCount()).toBe(0);
  });

  it("exposes only stable runtime error codes", () => {
    expect(new RuntimeStateUpdateError("EXTRACTION_FAILED").message).toBe("EXTRACTION_FAILED");
  });

  function preparationCount(): number {
    const audit = new DatabaseSync(databasePath);
    try {
      return (audit.prepare("SELECT COUNT(*) AS count FROM state_update_preparations").get() as {
        count: number;
      }).count;
    } finally {
      audit.close();
    }
  }
});
