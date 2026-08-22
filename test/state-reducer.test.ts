// @vitest-environment node

import { DatabaseSync } from "node:sqlite";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { StateReducer } from "../src/reducer.js";
import { SqliteRawHistoryStore } from "../src/raw-store.js";
import { SqliteContextStateStore } from "../src/state-store.js";
import { EMPTY_STATE_DELTA, type StateDelta } from "../src/state-types.js";

function delta(overrides: Partial<StateDelta> = {}): StateDelta {
  return {
    ...EMPTY_STATE_DELTA,
    new_goals: [],
    updated_goals: [],
    new_constraints: [],
    updated_constraints: [],
    new_decisions: [],
    resolved_questions: [],
    new_open_questions: [],
    rejected_alternatives: [],
    supersessions: [],
    new_relations: [],
    ...overrides,
  };
}

describe("session-scoped transactional StateReducer", () => {
  let temporaryDirectory: string;
  let databasePath: string;
  let rawStore: SqliteRawHistoryStore | undefined;
  let stateStore: SqliteContextStateStore | undefined;
  let reducer: StateReducer;

  beforeEach(async () => {
    temporaryDirectory = await mkdtemp(join(tmpdir(), "tuantuan-state-store-"));
    databasePath = join(temporaryDirectory, "context-compiler.db");
    rawStore = new SqliteRawHistoryStore(databasePath);
    stateStore = new SqliteContextStateStore(databasePath);
    reducer = new StateReducer(stateStore);
  });

  afterEach(async () => {
    stateStore?.close();
    rawStore?.close();
    await rm(temporaryDirectory, { recursive: true, force: true });
  });

  it("creates the five v0 types in fixed order with same-session provenance", () => {
    const source = rawStore!.ingest({
      session_id: "session-a",
      role: "user",
      content: "Keep source evidence.",
    });
    const result = reducer.apply(
      "session-a",
      delta({
        new_goals: [{ content: "Ship Context Compiler", source_refs: [source.id] }],
        new_constraints: [{ content: "Never delete raw history", source_refs: [source.id] }],
        new_decisions: [{ content: "Use SQLite", source_refs: [source.id], reason: "Local" }],
        new_open_questions: [{ content: "What budget?", source_refs: [source.id] }],
        rejected_alternatives: [{
          content: "Delete old turns",
          source_refs: [source.id],
          reason: "Not recoverable",
        }],
      })
    );

    expect(result.created.map((item) => item.type)).toEqual([
      "GOAL",
      "CONSTRAINT",
      "DECISION",
      "OPEN_QUESTION",
      "REJECTED_ALTERNATIVE",
    ]);
    expect(result.created.map((item) => item.status)).toEqual([
      "ACTIVE",
      "ACTIVE",
      "ACTIVE",
      "OPEN",
      "REJECTED",
    ]);
    expect(result.relations).toHaveLength(5);
    expect(result.revision).toBe(1);
    expect(result.log.map((entry) => entry.split(" ").slice(0, 2).join(" "))).toEqual([
      "CREATE GOAL",
      "CREATE CONSTRAINT",
      "CREATE DECISION",
      "CREATE OPEN_QUESTION",
      "REJECT ALTERNATIVE",
    ]);
  });

  it("persists strict metadata and source_refs without changing their shape", () => {
    const source = rawStore!.ingest({
      session_id: "session-a",
      role: "assistant",
      content: "Decision evidence",
    });
    const inserted = stateStore!.transaction("session-a", () =>
      stateStore!.createItem({
        session_id: "session-a",
        type: "DECISION",
        content: "Use transactions",
        status: "ACTIVE",
        source_refs: [source.id],
        metadata: {
          reason: "Atomicity",
          nested: { checks: [true, 1, null, { name: "rollback" }] },
        },
      })
    ).value;

    expect(stateStore!.getItem("session-a", inserted.id)).toEqual(inserted);
    expect(stateStore!.getRevision("session-a")).toBe(1);
    stateStore!.close();
    stateStore = new SqliteContextStateStore(databasePath);
    expect(stateStore.getItem("session-a", inserted.id)).toEqual(inserted);
    expect(stateStore.getRevision("session-a")).toBe(1);
    expect(stateStore.getRelations("session-a", inserted.id)).toMatchObject([
      { relation_type: "DERIVED_FROM", target_id: source.id },
    ]);
  });

  it.each([
    ["null root", null],
    ["array root", ["invalid"]],
    ["undefined property", { value: undefined }],
    ["NaN", { value: Number.NaN }],
    ["Infinity", { value: Number.POSITIVE_INFINITY }],
    ["Date", { value: new Date("2026-08-22T00:00:00.000Z") }],
    ["BigInt", { value: 1n }],
  ])("rejects lossful state metadata containing %s", (_label, metadata) => {
    expect(() =>
      stateStore!.transaction("session-a", () =>
        stateStore!.createItem({
          session_id: "session-a",
          type: "GOAL",
          content: "Invalid metadata must roll back",
          status: "ACTIVE",
          metadata: metadata as never,
        })
      )
    ).toThrow(/metadata/);
    expect(stateStore!.getItems("session-a")).toEqual([]);
    expect(stateStore!.getRevision("session-a")).toBe(0);
  });

  it("rejects duplicate, malformed, and cross-session source_refs without partial writes", () => {
    const local = rawStore!.ingest({
      session_id: "session-a",
      role: "user",
      content: "Local source",
    });
    const foreign = rawStore!.ingest({
      session_id: "session-b",
      role: "user",
      content: "Foreign source",
    });

    expect(() =>
      reducer.apply(
        "session-a",
        delta({ new_goals: [{ content: "Duplicate", source_refs: [local.id, local.id] }] })
      )
    ).toThrow(/duplicates/);
    expect(() =>
      reducer.apply(
        "session-a",
        delta({ new_goals: [{ content: "Foreign", source_refs: [foreign.id] }] })
      )
    ).toThrow(/does not exist in session session-a/);
    expect(() =>
      reducer.apply(
        "session-a",
        delta({ new_goals: [{ content: "Malformed", source_refs: [42] as never }] })
      )
    ).toThrow(/source_refs/);
    expect(stateStore!.getItems("session-a")).toEqual([]);
    expect(stateStore!.getRevision("session-a")).toBe(0);
  });

  it("rejects invalid initial type/status combinations before persistence", () => {
    expect(() =>
      stateStore!.transaction("session-a", () =>
        stateStore!.createItem({
          session_id: "session-a",
          type: "GOAL",
          content: "Cannot begin completed",
          status: "COMPLETED",
        })
      )
    ).toThrow(/must be created with status ACTIVE/);
    expect(() =>
      stateStore!.transaction("session-a", () =>
        stateStore!.createItem({
          session_id: "session-a",
          type: "EXPERIENCE" as never,
          content: "Out of scope",
          status: "ACTIVE",
        })
      )
    ).toThrow(/Unsupported context item type/);
    expect(stateStore!.getItems("session-a")).toEqual([]);
  });

  it("does not read, update, or relate guessed IDs across sessions", () => {
    const resultA = reducer.apply("session-a", delta({ new_goals: [{ content: "Goal A" }] }));
    const resultB = reducer.apply(
      "session-b",
      delta({ new_decisions: [{ content: "Decision B" }] })
    );
    const goalA = resultA.created[0];
    const decisionB = resultB.created[0];

    expect(stateStore!.getItem("session-b", goalA.id)).toBeUndefined();
    expect(stateStore!.getRelations("session-b", goalA.id)).toEqual([]);
    expect(() =>
      reducer.apply(
        "session-b",
        delta({ updated_goals: [{ id: goalA.id, status: "COMPLETED" }] })
      )
    ).toThrow(/does not exist in session session-b/);
    expect(() =>
      reducer.apply(
        "session-b",
        delta({
          new_relations: [{
            source_id: decisionB.id,
            relation_type: "DEPENDS_ON",
            target_id: goalA.id,
          }],
        })
      )
    ).toThrow(/does not exist in session session-b/);
    expect(stateStore!.getRevision("session-b")).toBe(1);
    expect(() =>
      stateStore!.transaction("session-a", () =>
        stateStore!.createItem({
          session_id: "session-b",
          type: "GOAL",
          content: "Wrong transaction session",
          status: "ACTIVE",
        })
      )
    ).toThrow(/cannot write session session-b/);
  });

  it("resolves an OPEN question only with an optional same-session Decision", () => {
    const initial = reducer.apply(
      "session-a",
      delta({
        new_decisions: [{ content: "Use SQLite" }],
        new_open_questions: [{ content: "Which database?" }],
      })
    );
    const decision = initial.created.find((item) => item.type === "DECISION")!;
    const question = initial.created.find((item) => item.type === "OPEN_QUESTION")!;

    const resolved = reducer.apply(
      "session-a",
      delta({ resolved_questions: [{ id: question.id, resolved_by: decision.id }] })
    );
    expect(resolved.revision).toBe(2);
    expect(stateStore!.getItem("session-a", question.id)?.status).toBe("RESOLVED");
    expect(stateStore!.getRelations("session-a", question.id)).toMatchObject([
      { relation_type: "RESOLVED_BY", target_id: decision.id },
    ]);

    expect(() =>
      reducer.apply(
        "session-a",
        delta({ resolved_questions: [{ id: question.id, resolved_by: decision.id }] })
      )
    ).toThrow(/must be OPEN/);
    expect(stateStore!.getRevision("session-a")).toBe(2);
  });

  it("rolls back resolve when resolved_by is a foreign Decision", () => {
    const question = reducer.apply(
      "session-a",
      delta({ new_open_questions: [{ content: "Question A" }] })
    ).created[0];
    const foreignDecision = reducer.apply(
      "session-b",
      delta({ new_decisions: [{ content: "Decision B" }] })
    ).created[0];

    expect(() =>
      reducer.apply(
        "session-a",
        delta({ resolved_questions: [{ id: question.id, resolved_by: foreignDecision.id }] })
      )
    ).toThrow(/does not exist in session session-a/);
    expect(stateStore!.getItem("session-a", question.id)?.status).toBe("OPEN");
    expect(stateStore!.getRevision("session-a")).toBe(1);
  });

  it("supersedes only ACTIVE Decision to ACTIVE Decision and rejects repeats", () => {
    const initial = reducer.apply(
      "session-a",
      delta({ new_decisions: [{ content: "Old" }, { content: "New" }] })
    );
    const [oldDecision, newDecision] = initial.created;

    expect(
      reducer.apply(
        "session-a",
        delta({
          supersessions: [{
            superseded_id: oldDecision.id,
            superseding_id: newDecision.id,
          }],
        })
      ).revision
    ).toBe(2);
    expect(stateStore!.getItem("session-a", oldDecision.id)?.status).toBe("SUPERSEDED");
    expect(stateStore!.getRelations("session-a", newDecision.id)).toMatchObject([
      { relation_type: "SUPERSEDES", target_id: oldDecision.id },
    ]);

    expect(() =>
      reducer.apply(
        "session-a",
        delta({
          supersessions: [{
            superseded_id: oldDecision.id,
            superseding_id: newDecision.id,
          }],
        })
      )
    ).toThrow(/must be ACTIVE/);
    expect(() =>
      reducer.apply(
        "session-a",
        delta({
          supersessions: [{
            superseded_id: newDecision.id,
            superseding_id: oldDecision.id,
          }],
        })
      )
    ).toThrow(/must be ACTIVE to supersede/);
    const foreignDecision = reducer.apply(
      "session-b",
      delta({ new_decisions: [{ content: "Foreign" }] })
    ).created[0];
    expect(() =>
      reducer.apply(
        "session-a",
        delta({
          supersessions: [{
            superseded_id: newDecision.id,
            superseding_id: foreignDecision.id,
          }],
        })
      )
    ).toThrow(/does not exist in session session-a/);
    expect(stateStore!.getRevision("session-a")).toBe(2);
  });

  it("creates a RejectedAlternative tombstone and same-session REJECTS relation", () => {
    const decision = reducer.apply(
      "session-a",
      delta({ new_decisions: [{ content: "Candidate approach" }] })
    ).created[0];
    const rejected = reducer.apply(
      "session-a",
      delta({
        rejected_alternatives: [{
          content: "Candidate approach",
          reason: "Violates a constraint",
          rejects: [decision.id],
        }],
      })
    );
    const alternative = rejected.created[0];

    expect(alternative).toMatchObject({
      type: "REJECTED_ALTERNATIVE",
      status: "REJECTED",
      metadata: { reason: "Violates a constraint" },
    });
    expect(stateStore!.getRelations("session-a", alternative.id)).toMatchObject([
      { relation_type: "REJECTS", target_id: decision.id },
    ]);
    expect(rejected.revision).toBe(2);
  });

  it("completes Goals and updates Constraints once per successful delta", () => {
    const initial = reducer.apply(
      "session-a",
      delta({
        new_goals: [{ content: "Ship v0" }],
        new_constraints: [{ content: "Keep raw history" }],
      })
    );
    const goal = initial.created.find((item) => item.type === "GOAL")!;
    const constraint = initial.created.find((item) => item.type === "CONSTRAINT")!;

    const updated = reducer.apply(
      "session-a",
      delta({
        updated_goals: [{ id: goal.id, status: "COMPLETED" }],
        updated_constraints: [{ id: constraint.id, content: "Raw history stays append-only" }],
      })
    );
    expect(updated.revision).toBe(2);
    expect(stateStore!.getItem("session-a", goal.id)?.status).toBe("COMPLETED");
    expect(stateStore!.getItem("session-a", constraint.id)?.content).toBe(
      "Raw history stays append-only"
    );
  });

  it("rolls back all earlier operations and revision when a later operation fails", () => {
    expect(() =>
      reducer.apply(
        "session-a",
        delta({
          new_goals: [{ content: "Must roll back" }],
          new_constraints: [{ content: "Must also roll back" }],
          resolved_questions: [{ id: "missing-question" }],
        })
      )
    ).toThrow(/does not exist in session session-a/);
    expect(stateStore!.getItems("session-a")).toEqual([]);
    expect(stateStore!.getSessionRelations("session-a")).toEqual([]);
    expect(stateStore!.getRevision("session-a")).toBe(0);
  });

  it("keeps revision unchanged for empty deltas", () => {
    expect(reducer.apply("session-a", delta()).revision).toBe(0);
    expect(stateStore!.getItems("session-a")).toEqual([]);
    const changed = reducer.apply(
      "session-a",
      delta({ new_goals: [{ content: "One change" }] })
    );
    expect(changed.revision).toBe(1);
    expect(reducer.apply("session-a", delta()).revision).toBe(1);
  });

  it("rejects duplicate relations without adding a row or revision", () => {
    const initial = reducer.apply(
      "session-a",
      delta({
        new_constraints: [{ content: "Constraint" }],
        new_decisions: [{ content: "Decision" }],
      })
    );
    const constraint = initial.created.find((item) => item.type === "CONSTRAINT")!;
    const decision = initial.created.find((item) => item.type === "DECISION")!;
    const relation = {
      source_id: decision.id,
      relation_type: "DEPENDS_ON" as const,
      target_id: constraint.id,
    };

    expect(reducer.apply("session-a", delta({ new_relations: [relation] })).revision).toBe(2);
    expect(() =>
      reducer.apply("session-a", delta({ new_relations: [relation] }))
    ).toThrow(/already exists/);
    expect(stateStore!.getRelations("session-a", decision.id)).toHaveLength(1);
    expect(stateStore!.getRevision("session-a")).toBe(2);
  });

  it("restores items, relations, metadata, source refs, and revision after reopen", () => {
    const source = rawStore!.ingest({
      session_id: "session-a",
      role: "user",
      content: "Source",
    });
    const initial = reducer.apply(
      "session-a",
      delta({
        new_decisions: [
          { content: "Old", source_refs: [source.id] },
          { content: "New", reason: "Better", reopen_if: "Conditions change" },
        ],
      })
    );
    const [oldDecision, newDecision] = initial.created;
    reducer.apply(
      "session-a",
      delta({
        supersessions: [{
          superseded_id: oldDecision.id,
          superseding_id: newDecision.id,
        }],
      })
    );

    stateStore!.close();
    stateStore = new SqliteContextStateStore(databasePath);
    expect(stateStore.getItem("session-a", oldDecision.id)).toMatchObject({
      status: "SUPERSEDED",
      source_refs: [source.id],
    });
    expect(stateStore.getItem("session-a", newDecision.id)?.metadata).toEqual({
      reason: "Better",
      reopen_if: "Conditions change",
    });
    expect(stateStore.getRelations("session-a", newDecision.id)).toMatchObject([
      { relation_type: "SUPERSEDES", target_id: oldDecision.id },
    ]);
    expect(stateStore.getRevision("session-a")).toBe(2);
  });

  it("keeps WO-CC-01 raw events append-only after state migration and reduction", () => {
    const rawEvent = rawStore!.ingest({
      session_id: "session-a",
      role: "user",
      content: "Immutable source",
    });
    reducer.apply(
      "session-a",
      delta({ new_goals: [{ content: "State projection", source_refs: [rawEvent.id] }] })
    );

    rawStore!.close();
    rawStore = undefined;
    const direct = new DatabaseSync(databasePath);
    try {
      expect(() =>
        direct.prepare("UPDATE raw_events SET content = ? WHERE id = ?").run("changed", rawEvent.id)
      ).toThrow(/append-only/);
      expect(() =>
        direct.prepare("DELETE FROM raw_events WHERE id = ?").run(rawEvent.id)
      ).toThrow(/append-only/);
    } finally {
      direct.close();
    }
  });
});
