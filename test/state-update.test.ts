// @vitest-environment node

import { DatabaseSync } from "node:sqlite";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  SqliteContextStateStore,
  SqliteRawHistoryStore,
  StateReducer,
  StateUpdateCoordinator,
  StateUpdateError,
  apply_state_delta,
  createEmptyStateDelta,
  prepare_state_update,
  type StateDelta,
} from "../src/index.js";

describe("model-independent State Delta pipeline", () => {
  let temporaryDirectory: string;
  let databasePath: string;
  let rawStore: SqliteRawHistoryStore | undefined;
  let stateStore: SqliteContextStateStore | undefined;
  let coordinator: StateUpdateCoordinator;

  beforeEach(async () => {
    temporaryDirectory = await mkdtemp(join(tmpdir(), "context-compiler-state-update-"));
    databasePath = join(temporaryDirectory, "context-compiler.db");
    rawStore = new SqliteRawHistoryStore(databasePath);
    stateStore = new SqliteContextStateStore(databasePath);
    coordinator = new StateUpdateCoordinator(stateStore);
  });

  afterEach(async () => {
    stateStore?.close();
    rawStore?.close();
    await rm(temporaryDirectory, { recursive: true, force: true });
  });

  it("prepares a durable bounded snapshot without changing state revision", () => {
    const historical = rawStore!.ingest({
      session_id: "session-a", role: "user", content: "Historical evidence",
    });
    const newest = rawStore!.ingest({
      session_id: "session-a", role: "assistant", content: "Newest evidence",
    });
    const reducer = new StateReducer(stateStore!);
    const goal = reducer.apply("session-a", delta({
      new_goals: [{ content: "Ship ST-01", source_refs: [historical.id] }],
    })).created[0]!;
    const rawBeforePrepare = rawStore!.getSessionEvents("session-a");

    const prepared = prepare_state_update(stateStore!, {
      session_id: "session-a",
      newest_event_ids: [newest.id],
    });

    expect(prepared).toMatchObject({
      expected_revision: 1,
      extractor_input: {
        session_id: "session-a",
        active_state: [{ id: goal.id }],
        recent_context: [{ id: historical.id }],
        newest_events: [{ id: newest.id }],
      },
    });
    expect(prepared.preparation_token).toMatch(/^[0-9a-f-]{36}$/);
    expect(prepared.fingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(stateStore!.getRevision("session-a")).toBe(1);
    expect(rawStore!.getSessionEvents("session-a")).toEqual(rawBeforePrepare);

    rawStore!.ingest({
      session_id: "session-a", role: "user", content: "Appended after preparation",
    });
    stateStore!.close();
    stateStore = new SqliteContextStateStore(databasePath);

    const first = apply_state_delta(stateStore, {
      session_id: "session-a",
      preparation_token: prepared.preparation_token,
      fingerprint: prepared.fingerprint,
      expected_revision: prepared.expected_revision,
      delta: createEmptyStateDelta(),
    });
    const retry = apply_state_delta(stateStore, {
      session_id: "session-a",
      preparation_token: prepared.preparation_token,
      fingerprint: prepared.fingerprint,
      expected_revision: prepared.expected_revision,
      delta: createEmptyStateDelta(),
    });
    expect(first).toMatchObject({ changed: false, revision: 1, created: [], updated: [] });
    expect(retry).toEqual(first);
  });

  it("atomically applies one non-empty delta and makes its retry a stable conflict", () => {
    const newest = rawStore!.ingest({
      session_id: "session-a", role: "user", content: "Create a durable goal",
    });
    const prepared = coordinator.prepareStateUpdate({
      session_id: "session-a", newest_event_ids: [newest.id],
    });
    const candidate = delta({
      new_goals: [{ content: "Durable goal", source_refs: [newest.id] }],
    });
    const beforeRaw = rawStore!.getSessionEvents("session-a");

    const applied = coordinator.applyStateDelta({
      session_id: "session-a",
      preparation_token: prepared.preparation_token,
      fingerprint: prepared.fingerprint,
      expected_revision: prepared.expected_revision,
      delta: candidate,
    });

    expect(applied).toMatchObject({ changed: true, revision: 1 });
    expect(applied.created).toMatchObject([{
      type: "GOAL", status: "ACTIVE", content: "Durable goal", source_refs: [newest.id],
    }]);
    expect(rawStore!.getSessionEvents("session-a")).toEqual(beforeRaw);
    expect(() => coordinator.applyStateDelta({
      session_id: "session-a",
      preparation_token: prepared.preparation_token,
      fingerprint: prepared.fingerprint,
      expected_revision: prepared.expected_revision,
      delta: candidate,
    })).toThrowError(expect.objectContaining({ code: "CONFLICT" }));
    expect(stateStore!.getItems("session-a")).toHaveLength(1);
    expect(stateStore!.getRevision("session-a")).toBe(1);
  });

  it("rejects cross-session, reordered, duplicated, gapped, stale, and unknown evidence", () => {
    const events = ["one", "two", "three"].map((content) => rawStore!.ingest({
      session_id: "session-a", role: "user", content,
    }));
    const foreign = rawStore!.ingest({
      session_id: "session-b", role: "user", content: "foreign",
    });
    const cases: Array<[unknown, "INVALID_INPUT" | "CONFLICT"]> = [
      [{ session_id: "session-a", newest_event_ids: [] }, "INVALID_INPUT"],
      [{
        session_id: "session-a",
        newest_event_ids: Array.from({ length: 101 }, (_, index) => `event-${index}`),
      }, "INVALID_INPUT"],
      [{ session_id: "session-a", newest_event_ids: [foreign.id] }, "CONFLICT"],
      [{ session_id: "session-a", newest_event_ids: [events[2]!.id, events[1]!.id] }, "CONFLICT"],
      [{ session_id: "session-a", newest_event_ids: [events[2]!.id, events[2]!.id] }, "INVALID_INPUT"],
      [{ session_id: "session-a", newest_event_ids: [events[0]!.id, events[2]!.id] }, "CONFLICT"],
      [{ session_id: "session-a", newest_event_ids: [events[0]!.id, events[1]!.id] }, "CONFLICT"],
      [{ session_id: "session-a", newest_event_ids: ["missing-event"] }, "CONFLICT"],
      [{ session_id: "session-a", newest_event_ids: [events[2]!.id], extra: true }, "INVALID_INPUT"],
    ];

    for (const [input, code] of cases) {
      expect(() => coordinator.prepareStateUpdate(input)).toThrowError(
        expect.objectContaining({ code })
      );
    }
    expect(stateStore!.getRevision("session-a")).toBe(0);
    expect(stateStore!.getItems("session-a")).toEqual([]);
  });

  it("rejects malformed and tampered apply identities and deltas with stable codes", () => {
    const newest = rawStore!.ingest({
      session_id: "session-a", role: "user", content: "candidate source",
    });
    const prepared = coordinator.prepareStateUpdate({
      session_id: "session-a", newest_event_ids: [newest.id],
    });
    const base = {
      session_id: "session-a",
      preparation_token: prepared.preparation_token,
      fingerprint: prepared.fingerprint,
      expected_revision: prepared.expected_revision,
      delta: createEmptyStateDelta(),
    };
    const invalidCases: Array<[unknown, string]> = [
      [{ ...base, extra: true }, "INVALID_INPUT"],
      [{ ...base, session_id: "session-b" }, "CONFLICT"],
      [{ ...base, fingerprint: "0".repeat(64) }, "CONFLICT"],
      [{ ...base, expected_revision: 1 }, "CONFLICT"],
      [{ ...base, preparation_token: "missing-token" }, "NOT_FOUND"],
      [{ ...base, delta: { ...createEmptyStateDelta(), unknown: [] } }, "INVALID_INPUT"],
      [{ ...base, delta: { new_goals: [] } }, "INVALID_INPUT"],
      [{ ...base, delta: delta({ new_goals: [{ content: "Goal", source_refs: ["missing"] }] }) }, "CONFLICT"],
    ];
    for (const [input, code] of invalidCases) {
      expect(() => coordinator.applyStateDelta(input)).toThrowError(
        expect.objectContaining({ code })
      );
    }

    let accessed = false;
    const accessorDelta = createEmptyStateDelta() as StateDelta & { hidden?: string };
    Object.defineProperty(accessorDelta, "hidden", {
      enumerable: true,
      get() { accessed = true; return "private"; },
    });
    expect(() => coordinator.applyStateDelta({ ...base, delta: accessorDelta })).toThrowError(
      expect.objectContaining({ code: "INVALID_INPUT" })
    );
    expect(accessed).toBe(false);
    expect(stateStore!.getRevision("session-a")).toBe(0);
  });

  it("detects stale state before mutation and rolls back all candidate transitions", () => {
    const newest = rawStore!.ingest({
      session_id: "session-a", role: "user", content: "prepared source",
    });
    const prepared = coordinator.prepareStateUpdate({
      session_id: "session-a", newest_event_ids: [newest.id],
    });
    new StateReducer(stateStore!).apply("session-a", delta({
      new_constraints: [{ content: "Concurrent change" }],
    }));

    expect(() => coordinator.applyStateDelta({
      session_id: "session-a",
      preparation_token: prepared.preparation_token,
      fingerprint: prepared.fingerprint,
      expected_revision: prepared.expected_revision,
      delta: delta({
        new_goals: [{ content: "Must not commit", source_refs: [newest.id] }],
      }),
    })).toThrowError(expect.objectContaining({ code: "CONFLICT" }));
    expect(stateStore!.getItems("session-a")).toMatchObject([{
      type: "CONSTRAINT", content: "Concurrent change",
    }]);
    expect(stateStore!.getRevision("session-a")).toBe(1);
  });

  it("keeps preparation rows immutable at the SQLite boundary", () => {
    const newest = rawStore!.ingest({
      session_id: "session-a", role: "user", content: "immutable preparation",
    });
    const prepared = coordinator.prepareStateUpdate({
      session_id: "session-a", newest_event_ids: [newest.id],
    });
    stateStore!.close();
    stateStore = undefined;

    const direct = new DatabaseSync(databasePath);
    try {
      expect(() => direct.prepare(
        "UPDATE state_update_preparations SET fingerprint = ? WHERE preparation_token = ?"
      ).run("0".repeat(64), prepared.preparation_token)).toThrow(/immutable/);
      expect(() => direct.prepare(
        "DELETE FROM state_update_preparations WHERE preparation_token = ?"
      ).run(prepared.preparation_token)).toThrow(/immutable/);
    } finally {
      direct.close();
    }
  });
});

function delta(overrides: Partial<StateDelta> = {}): StateDelta {
  return { ...createEmptyStateDelta(), ...overrides };
}
