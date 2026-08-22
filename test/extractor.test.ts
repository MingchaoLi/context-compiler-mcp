// @vitest-environment node

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  ExtractorValidationError,
  StrictStateExtractor,
  createEmptyStateDelta,
  parseStrictStateDelta,
  type ExtractorInput,
  type ExtractorTransport,
} from "../src/extractor.js";
import { StateReducer } from "../src/reducer.js";
import { SqliteRawHistoryStore, type RawEvent } from "../src/raw-store.js";
import { SqliteContextStateStore } from "../src/state-store.js";
import type { ContextItem, StateDelta, StateRelation } from "../src/state-types.js";

const timestamp = "2026-08-22T00:00:00.000Z";

function item(
  id: string,
  type: ContextItem["type"],
  status: ContextItem["status"],
  content = id
): ContextItem {
  return {
    id,
    session_id: "session-a",
    type,
    content,
    status,
    confidence: 1,
    created_at: timestamp,
    updated_at: timestamp,
    source_refs: [],
    metadata: {},
  };
}

function raw(id: string, seq: number): RawEvent {
  return {
    id,
    session_id: "session-a",
    seq,
    role: "user",
    content: `raw ${id}`,
    event_type: "message",
    created_at: timestamp,
    token_count: 2,
    metadata: {},
  };
}

const baseInput: ExtractorInput = {
  session_id: "session-a",
  active_state: [
    item("goal-1", "GOAL", "ACTIVE", "Ship v0"),
    item("constraint-1", "CONSTRAINT", "ACTIVE", "Keep raw history"),
    item("decision-old", "DECISION", "ACTIVE", "Old plan"),
    item("decision-new", "DECISION", "ACTIVE", "New plan"),
    item("decision-other", "DECISION", "ACTIVE", "Other plan"),
    item("decision-retired", "DECISION", "SUPERSEDED", "Retired plan"),
    item("question-1", "OPEN_QUESTION", "OPEN", "Which plan?"),
    item("rejected-1", "REJECTED_ALTERNATIVE", "REJECTED", "Delete history"),
  ],
  state_relations: [
    {
      session_id: "session-a",
      source_id: "decision-new",
      relation_type: "DEPENDS_ON",
      target_id: "constraint-1",
      created_at: timestamp,
    },
  ],
  recent_context: [raw("raw-1", 1)],
  newest_events: [raw("raw-2", 2)],
};

function cloneInput(): ExtractorInput {
  return structuredClone(baseInput);
}

function validDelta(): StateDelta {
  return {
    new_goals: [{ content: "New goal", source_refs: ["raw-1"] }],
    updated_goals: [{ id: "goal-1", status: "COMPLETED" }],
    new_constraints: [{ content: "New constraint", source_refs: ["raw-2"] }],
    updated_constraints: [{ id: "constraint-1", content: "Keep every raw event" }],
    new_decisions: [{
      content: "Use tested plan",
      reason: "Passed",
      reopen_if: "Tests change",
      source_refs: ["raw-2"],
      supersedes: ["decision-old"],
    }],
    resolved_questions: [{ id: "question-1", resolved_by: "decision-new" }],
    new_open_questions: [{ content: "What budget?", source_refs: ["raw-1"] }],
    rejected_alternatives: [{
      content: "Use retired plan",
      reason: "Already superseded",
      source_refs: ["raw-1"],
      rejects: ["decision-retired"],
    }],
    supersessions: [{
      superseded_id: "decision-other",
      superseding_id: "decision-new",
    }],
    new_relations: [{
      source_id: "goal-1",
      relation_type: "DEPENDS_ON",
      target_id: "constraint-1",
    }],
  };
}

function response(overrides: Partial<StateDelta> = {}): string {
  return JSON.stringify({ ...validDelta(), ...overrides });
}

describe("strict StateDelta parser", () => {
  it("parses the exact ten-array contract with reducer-legal migrations", () => {
    const parsed = parseStrictStateDelta(response(), cloneInput());

    expect(Object.keys(parsed)).toEqual([
      "new_goals",
      "updated_goals",
      "new_constraints",
      "updated_constraints",
      "new_decisions",
      "resolved_questions",
      "new_open_questions",
      "rejected_alternatives",
      "supersessions",
      "new_relations",
    ]);
    expect(parsed.updated_goals).toEqual([{ id: "goal-1", status: "COMPLETED" }]);
    expect(parsed.new_relations[0]).toMatchObject({ relation_type: "DEPENDS_ON" });
  });

  it.each([
    ["markdown", `\`\`\`json\n${response()}\n\`\`\``],
    ["unknown top-level", JSON.stringify({ ...validDelta(), preferences: [] })],
    [
      "missing top-level",
      JSON.stringify((({ new_relations: _removed, ...rest }) => rest)(validDelta())),
    ],
    [
      "unknown nested",
      response({ new_goals: [{ content: "Goal", personality: "friendly" } as never] }),
    ],
    ["blank content", response({ new_goals: [{ content: "   " }] })],
    ["blank id", response({ updated_goals: [{ id: " ", status: "COMPLETED" }] })],
    [
      "illegal Goal status",
      response({ updated_goals: [{ id: "goal-1", status: "SUPERSEDED" as never }] }),
    ],
    [
      "illegal Constraint status",
      response({
        updated_constraints: [{ id: "constraint-1", status: "ACTIVE" as never }],
      }),
    ],
  ])("rejects %s", (_label, value) => {
    expect(() => parseStrictStateDelta(value, cloneInput())).toThrow(ExtractorValidationError);
  });

  it("rejects wrong types, inactive references, and wrong provenance namespaces", () => {
    expect(() =>
      parseStrictStateDelta(
        response({ resolved_questions: [{ id: "goal-1", resolved_by: "decision-new" }] }),
        cloneInput()
      )
    ).toThrow(/INVALID_REFERENCE/);
    expect(() =>
      parseStrictStateDelta(
        response({
          resolved_questions: [{ id: "question-1", resolved_by: "decision-retired" }],
        }),
        cloneInput()
      )
    ).toThrow(/INVALID_REFERENCE/);
    expect(() =>
      parseStrictStateDelta(
        response({ new_goals: [{ content: "Goal", source_refs: ["decision-new"] }] }),
        cloneInput()
      )
    ).toThrow(/INVALID_REFERENCE/);
    expect(() =>
      parseStrictStateDelta(
        response({
          new_relations: [{
            source_id: "goal-1",
            relation_type: "DERIVED_FROM",
            target_id: "constraint-1",
          }],
        }),
        cloneInput()
      )
    ).toThrow(/INVALID_REFERENCE/);
    expect(() =>
      parseStrictStateDelta(
        response({
          new_relations: [{
            source_id: "goal-1",
            relation_type: "REJECTS",
            target_id: "decision-old",
          }],
        }),
        cloneInput()
      )
    ).toThrow(/INVALID_REFERENCE/);
  });

  it("rejects duplicate IDs, source refs, operations, and relations", () => {
    expect(() =>
      parseStrictStateDelta(
        response({ new_goals: [{ content: "Goal", source_refs: ["raw-1", "raw-1"] }] }),
        cloneInput()
      )
    ).toThrow(/INVALID_SCHEMA/);
    expect(() =>
      parseStrictStateDelta(
        response({
          updated_goals: [
            { id: "goal-1", status: "COMPLETED" },
            { id: "goal-1", content: "Again" },
          ],
        }),
        cloneInput()
      )
    ).toThrow(/CONFLICT/);
    expect(() =>
      parseStrictStateDelta(
        response({
          resolved_questions: [{ id: "question-1" }, { id: "question-1" }],
        }),
        cloneInput()
      )
    ).toThrow(/CONFLICT/);
    const duplicateRelation = {
      source_id: "goal-1",
      relation_type: "DEPENDS_ON" as const,
      target_id: "constraint-1",
    };
    expect(() =>
      parseStrictStateDelta(
        response({ new_relations: [duplicateRelation, duplicateRelation] }),
        cloneInput()
      )
    ).toThrow(/CONFLICT/);
    expect(() =>
      parseStrictStateDelta(
        response({
          new_relations: [{
            source_id: "decision-new",
            relation_type: "DEPENDS_ON",
            target_id: "constraint-1",
          }],
        }),
        cloneInput()
      )
    ).toThrow(/CONFLICT/);
  });

  it("rejects supersession conflicts that the ordered Reducer cannot safely apply", () => {
    expect(() =>
      parseStrictStateDelta(
        response({
          new_decisions: [
            { content: "One", supersedes: ["decision-old"] },
            { content: "Two", supersedes: ["decision-old"] },
          ],
        }),
        cloneInput()
      )
    ).toThrow(/CONFLICT/);
    expect(() =>
      parseStrictStateDelta(
        response({
          supersessions: [
            { superseded_id: "decision-other", superseding_id: "decision-new" },
            { superseded_id: "decision-new", superseding_id: "decision-old" },
          ],
        }),
        cloneInput()
      )
    ).toThrow(/CONFLICT/);
    expect(() =>
      parseStrictStateDelta(
        response({
          resolved_questions: [{ id: "question-1", resolved_by: "decision-old" }],
          new_decisions: [{ content: "Replace Old", supersedes: ["decision-old"] }],
        }),
        cloneInput()
      )
    ).toThrow(/CONFLICT/);
  });

  it("rejects no-op updates that Store would reject", () => {
    expect(() =>
      parseStrictStateDelta(
        response({ updated_goals: [{ id: "goal-1", content: "Ship v0" }] }),
        cloneInput()
      )
    ).toThrow(/CONFLICT/);
    expect(() =>
      parseStrictStateDelta(
        response({
          updated_constraints: [{ id: "constraint-1", content: "Keep raw history" }],
        }),
        cloneInput()
      )
    ).toThrow(/CONFLICT/);
  });

  it("rejects non-string response objects before schema traversal", () => {
    expect(() => parseStrictStateDelta(validDelta() as never, cloneInput())).toThrow(
      /INVALID_SCHEMA/
    );
  });

  it("produces a delta accepted by the approved Reducer and Store", async () => {
    const directory = await mkdtemp(join(tmpdir(), "context-compiler-extractor-"));
    const databasePath = join(directory, "context-compiler.db");
    const rawStore = new SqliteRawHistoryStore(databasePath);
    const stateStore = new SqliteContextStateStore(databasePath);
    const reducer = new StateReducer(stateStore);
    try {
      const rawOne = rawStore.ingest({
        session_id: "session-a",
        role: "user",
        content: "Original",
      });
      const rawTwo = rawStore.ingest({
        session_id: "session-a",
        role: "tool",
        content: "Result",
      });
      const initial = reducer.apply("session-a", {
        ...createEmptyStateDelta(),
        new_goals: [{ content: "Goal" }],
        new_constraints: [{ content: "Constraint" }],
        new_decisions: [{ content: "Old" }, { content: "New" }, { content: "Other" }],
        new_open_questions: [{ content: "Question" }],
      });
      const goal = initial.created.find((entry) => entry.type === "GOAL")!;
      const constraint = initial.created.find((entry) => entry.type === "CONSTRAINT")!;
      const decisions = initial.created.filter((entry) => entry.type === "DECISION");
      const question = initial.created.find((entry) => entry.type === "OPEN_QUESTION")!;
      const extractorInput: ExtractorInput = {
        session_id: "session-a",
        active_state: stateStore.getItems("session-a"),
        state_relations: stateStore.getSessionRelations("session-a"),
        recent_context: [rawOne],
        newest_events: [rawTwo],
      };
      const candidate: StateDelta = {
        ...createEmptyStateDelta(),
        updated_goals: [{ id: goal.id, status: "COMPLETED" }],
        updated_constraints: [{ id: constraint.id, content: "Updated constraint" }],
        new_decisions: [{
          content: "Generated replacement",
          supersedes: [decisions[0]!.id],
          source_refs: [rawTwo.id],
        }],
        resolved_questions: [{ id: question.id, resolved_by: decisions[1]!.id }],
        supersessions: [{
          superseded_id: decisions[2]!.id,
          superseding_id: decisions[1]!.id,
        }],
        new_relations: [{
          source_id: goal.id,
          relation_type: "DEPENDS_ON",
          target_id: constraint.id,
        }],
      };

      const parsed = parseStrictStateDelta(JSON.stringify(candidate), extractorInput);
      expect(() => reducer.apply("session-a", parsed)).not.toThrow();
      expect(stateStore.getRevision("session-a")).toBe(2);
    } finally {
      stateStore.close();
      rawStore.close();
      await rm(directory, { recursive: true, force: true });
    }
  });
});

describe("StrictStateExtractor transport and fallback", () => {
  it("retries a validation failure once with only a sanitized repair code", async () => {
    const complete = vi
      .fn<ExtractorTransport["complete"]>()
      .mockResolvedValueOnce("response SECRET_VALUE is not JSON")
      .mockResolvedValueOnce(response());
    const extractor = new StrictStateExtractor({ complete });

    const result = await extractor.extract(cloneInput());

    expect(result.attempts).toBe(2);
    expect(result.fallback_used).toBe(false);
    expect(result.error_codes).toEqual(["INVALID_JSON"]);
    expect(complete).toHaveBeenCalledTimes(2);
    expect(complete.mock.calls[1]?.[0]).toContain("repair_error_code=INVALID_JSON");
    expect(complete.mock.calls[1]?.[0]).not.toContain("SECRET_VALUE");
  });

  it("retries transport failure without exposing its message", async () => {
    const complete = vi
      .fn<ExtractorTransport["complete"]>()
      .mockRejectedValueOnce(new Error("upstream SECRET_VALUE"))
      .mockResolvedValueOnce(response());
    const extractor = new StrictStateExtractor({ complete });

    const result = await extractor.extract(cloneInput());

    expect(result.error_codes).toEqual(["TRANSPORT_FAILURE"]);
    expect(JSON.stringify(result)).not.toContain("SECRET_VALUE");
    expect(complete.mock.calls[1]?.[0]).toContain("repair_error_code=TRANSPORT_FAILURE");
  });

  it("returns a fresh ten-array fallback after exhaustion", async () => {
    const complete = vi.fn<ExtractorTransport["complete"]>().mockResolvedValue("not-json");
    const extractor = new StrictStateExtractor({ complete });

    const first = await extractor.extract(cloneInput());
    first.delta.new_goals.push({ content: "mutated" });
    const second = await extractor.extract(cloneInput());

    expect(first.fallback_used).toBe(true);
    expect(second).toEqual({
      delta: createEmptyStateDelta(),
      attempts: 2,
      fallback_used: true,
      error_codes: ["INVALID_JSON", "INVALID_JSON"],
    });
    expect(first.delta.new_goals).not.toBe(second.delta.new_goals);
    expect(second.delta.new_relations).toEqual([]);
  });

  it("rejects invalid input before transport", async () => {
    const complete = vi.fn<ExtractorTransport["complete"]>();
    const extractor = new StrictStateExtractor({ complete });
    const invalid = cloneInput();
    invalid.newest_events[0]!.session_id = "session-b";

    await expect(extractor.extract(invalid)).rejects.toMatchObject({ code: "INVALID_INPUT" });
    expect(complete).not.toHaveBeenCalled();
  });

  it.each([
    ["duplicate state id", (input: ExtractorInput) => input.active_state.push(input.active_state[0]!)],
    ["duplicate raw id", (input: ExtractorInput) => input.newest_events.push(input.recent_context[0]!)],
    [
      "duplicate raw seq",
      (input: ExtractorInput) => {
        input.newest_events[0]!.seq = input.recent_context[0]!.seq;
      },
    ],
    [
      "duplicate relation",
      (input: ExtractorInput) => input.state_relations.push(input.state_relations[0]!),
    ],
  ])("rejects %s before transport", async (_label, mutate) => {
    const complete = vi.fn<ExtractorTransport["complete"]>();
    const extractor = new StrictStateExtractor({ complete });
    const invalid = cloneInput();
    mutate(invalid);

    await expect(extractor.extract(invalid)).rejects.toMatchObject({ code: "INVALID_INPUT" });
    expect(complete).not.toHaveBeenCalled();
  });

  it("accepts valid historical relation snapshots after later state transitions", async () => {
    const complete = vi
      .fn<ExtractorTransport["complete"]>()
      .mockResolvedValue(JSON.stringify(createEmptyStateDelta()));
    const extractor = new StrictStateExtractor({ complete });
    const historical = cloneInput();
    historical.active_state.push(
      item("decision-middle", "DECISION", "SUPERSEDED"),
      item("decision-latest", "DECISION", "ACTIVE"),
      item("question-resolved", "OPEN_QUESTION", "RESOLVED")
    );
    historical.state_relations.push(
      {
        session_id: "session-a",
        source_id: "decision-middle",
        relation_type: "SUPERSEDES",
        target_id: "decision-retired",
        created_at: timestamp,
      },
      {
        session_id: "session-a",
        source_id: "decision-latest",
        relation_type: "SUPERSEDES",
        target_id: "decision-middle",
        created_at: timestamp,
      },
      {
        session_id: "session-a",
        source_id: "question-resolved",
        relation_type: "RESOLVED_BY",
        target_id: "decision-middle",
        created_at: timestamp,
      }
    );

    const result = await extractor.extract(historical);

    expect(result.fallback_used).toBe(false);
    expect(complete).toHaveBeenCalledTimes(1);
  });

  it.each([
    [
      "SUPERSEDES target is not superseded",
      {
        session_id: "session-a",
        source_id: "decision-new",
        relation_type: "SUPERSEDES",
        target_id: "decision-old",
        created_at: timestamp,
      },
    ],
    [
      "RESOLVED_BY source is not resolved",
      {
        session_id: "session-a",
        source_id: "question-1",
        relation_type: "RESOLVED_BY",
        target_id: "decision-new",
        created_at: timestamp,
      },
    ],
    [
      "relation endpoint is missing",
      {
        session_id: "session-a",
        source_id: "decision-new",
        relation_type: "DEPENDS_ON",
        target_id: "missing-item",
        created_at: timestamp,
      },
    ],
    [
      "relation timestamp is not persisted ISO form",
      {
        session_id: "session-a",
        source_id: "decision-new",
        relation_type: "DEPENDS_ON",
        target_id: "constraint-1",
        created_at: "2026-08-22T00:00:00Z",
      },
    ],
  ])("rejects invalid historical %s before transport", async (_label, relation) => {
    const complete = vi.fn<ExtractorTransport["complete"]>();
    const extractor = new StrictStateExtractor({ complete });
    const invalid = cloneInput();
    invalid.state_relations = [relation as StateRelation];

    await expect(extractor.extract(invalid)).rejects.toMatchObject({ code: "INVALID_INPUT" });
    expect(complete).not.toHaveBeenCalled();
  });

  it("rejects accessor/prototype input shapes before transport", async () => {
    const complete = vi.fn<ExtractorTransport["complete"]>();
    const extractor = new StrictStateExtractor({ complete });
    const accessorInput = cloneInput() as ExtractorInput & { hidden?: string };
    Object.defineProperty(accessorInput, "hidden", { enumerable: true, get: () => "value" });

    await expect(extractor.extract(accessorInput)).rejects.toMatchObject({
      code: "INVALID_INPUT",
    });
    const prototypeInput = Object.assign(Object.create(null), cloneInput()) as ExtractorInput;
    await expect(extractor.extract(prototypeInput)).rejects.toMatchObject({
      code: "INVALID_INPUT",
    });
    expect(complete).not.toHaveBeenCalled();
  });

  it("propagates a real aborted signal and does not invoke transport", async () => {
    const complete = vi.fn<ExtractorTransport["complete"]>();
    const extractor = new StrictStateExtractor({ complete });
    const controller = new AbortController();
    controller.abort(new DOMException("Stopped", "AbortError"));

    await expect(extractor.extract(cloneInput(), controller.signal)).rejects.toMatchObject({
      name: "AbortError",
    });
    expect(complete).not.toHaveBeenCalled();
  });

  it("propagates a pre-aborted signal before validating invalid input", async () => {
    const complete = vi.fn<ExtractorTransport["complete"]>();
    const extractor = new StrictStateExtractor({ complete });
    const controller = new AbortController();
    const reason = new DOMException("Stopped before validation", "AbortError");
    controller.abort(reason);
    const invalid = cloneInput();
    invalid.session_id = " ";

    await expect(extractor.extract(invalid, controller.signal)).rejects.toBe(reason);
    expect(complete).not.toHaveBeenCalled();
  });

  it("passes the exact signal to transport", async () => {
    const complete = vi.fn<ExtractorTransport["complete"]>().mockResolvedValue(response());
    const extractor = new StrictStateExtractor({ complete });
    const controller = new AbortController();

    await extractor.extract(cloneInput(), controller.signal);

    expect(complete.mock.calls[0]?.[1].signal).toBe(controller.signal);
  });

  it("treats a forged AbortError as ordinary transport failure when signal is active", async () => {
    const forged = new Error("SECRET_VALUE");
    forged.name = "AbortError";
    const complete = vi.fn<ExtractorTransport["complete"]>().mockRejectedValue(forged);
    const extractor = new StrictStateExtractor({ complete });
    const controller = new AbortController();

    const result = await extractor.extract(cloneInput(), controller.signal);

    expect(result.fallback_used).toBe(true);
    expect(result.error_codes).toEqual(["TRANSPORT_FAILURE", "TRANSPORT_FAILURE"]);
    expect(JSON.stringify(result)).not.toContain("SECRET_VALUE");
  });

  it("propagates abort when the signal becomes aborted during transport", async () => {
    const controller = new AbortController();
    const complete = vi.fn<ExtractorTransport["complete"]>().mockImplementation(async () => {
      controller.abort(new DOMException("Stopped", "AbortError"));
      throw new Error("ordinary transport error");
    });
    const extractor = new StrictStateExtractor({ complete });

    await expect(extractor.extract(cloneInput(), controller.signal)).rejects.toMatchObject({
      name: "AbortError",
    });
    expect(complete).toHaveBeenCalledTimes(1);
  });

  it.each([0, 4, 1.5])("rejects invalid maxAttempts=%s", (maxAttempts) => {
    expect(
      () => new StrictStateExtractor({ complete: vi.fn() }, { maxAttempts })
    ).toThrow(/between 1 and 3/);
  });
});
