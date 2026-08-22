// @vitest-environment node

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  ContextAssemblerValidationError,
  assembleContext,
  renderCompiledContext,
  type ContextAssemblerInput,
} from "../src/assembler.js";
import { StateReducer } from "../src/reducer.js";
import { estimateTokens, SqliteRawHistoryStore, type RawEvent } from "../src/raw-store.js";
import { SqliteContextStateStore } from "../src/state-store.js";
import { EMPTY_STATE_DELTA, type ContextItem, type StateDelta, type StateRelation } from "../src/state-types.js";

const SESSION = "session-a";
const TIME = "2026-08-22T00:00:00.000Z";

function raw(id: string, seq: number, role: RawEvent["role"], content = `${role}-${seq}`): RawEvent {
  return {
    id,
    session_id: SESSION,
    seq,
    role,
    content,
    event_type: "message",
    created_at: TIME,
    token_count: 1,
    metadata: {},
  };
}

function item(
  id: string,
  type: ContextItem["type"],
  status: ContextItem["status"],
  overrides: Partial<ContextItem> = {}
): ContextItem {
  return {
    id,
    session_id: SESSION,
    type,
    content: `${type.toLowerCase()} ${id}`,
    status,
    confidence: 1,
    created_at: TIME,
    updated_at: TIME,
    source_refs: [],
    metadata: {},
    ...overrides,
  };
}

function relation(
  sourceId: string,
  relationType: StateRelation["relation_type"],
  targetId: string
): StateRelation {
  return {
    session_id: SESSION,
    source_id: sourceId,
    relation_type: relationType,
    target_id: targetId,
    created_at: TIME,
  };
}

function input(overrides: Partial<ContextAssemblerInput> = {}): ContextAssemblerInput {
  return {
    session_id: SESSION,
    context_items: [],
    state_relations: [],
    raw_events: [],
    current_input: "What should happen next?",
    ...overrides,
  };
}

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

describe("deterministic Context Assembler", () => {
  it("retains mandatory active state at zero budget and reports the exact overage", () => {
    const constraint = item("constraint", "CONSTRAINT", "ACTIVE");
    const compiled = assembleContext(input({ context_items: [constraint], token_budget: 0 }));

    expect(compiled.active_constraints).toEqual([constraint]);
    expect(compiled.budget_exceeded).toBe(true);
    expect(compiled.budget_overage).toBe(compiled.metrics.d2_compiled_tokens);
    expect(compiled.debug_manifest.budget_exceeded).toBe(true);
    expect(compiled.debug_manifest.budget_overage).toBe(compiled.metrics.d2_compiled_tokens);
    expect(compiled.debug_manifest.kept_state_ids).toContain("constraint");
  });

  it("follows multi-hop and cyclic DEPENDS_ON edges in source-to-target direction", () => {
    const goal = item("goal", "GOAL", "ACTIVE");
    const oldDecision = item("old", "DECISION", "SUPERSEDED");
    const completedGoal = item("completed", "GOAL", "COMPLETED");
    const unrelated = item("unrelated", "CONSTRAINT", "SUPERSEDED");
    const compiled = assembleContext(input({
      context_items: [unrelated, completedGoal, oldDecision, goal],
      state_relations: [
        relation("goal", "DEPENDS_ON", "old"),
        relation("old", "DEPENDS_ON", "completed"),
        relation("completed", "DEPENDS_ON", "goal"),
        relation("unrelated", "DEPENDS_ON", "goal"),
        relation("goal", "REJECTS", "unrelated"),
      ],
    }));

    expect(compiled.dependency_items.map(({ id }) => id)).toEqual(["completed", "old"]);
    expect(compiled.debug_manifest.dependency_edges).toEqual([
      { source_id: "completed", target_id: "goal" },
      { source_id: "goal", target_id: "old" },
      { source_id: "old", target_id: "completed" },
    ]);
    expect(compiled.debug_manifest.suppressed_state_ids).toEqual(["unrelated"]);
  });

  it("selects the last N complete user turns and excludes pre-user orphan events", () => {
    const events = [
      raw("orphan", 1, "system"),
      raw("u1", 2, "user"),
      raw("a1", 3, "assistant"),
      raw("t1", 4, "tool"),
      raw("u2", 5, "user"),
      raw("a2", 6, "assistant"),
      raw("u3", 7, "user"),
      raw("a3", 8, "assistant"),
    ];
    const compiled = assembleContext(input({
      raw_events: [events[7]!, events[1]!, events[4]!, events[0]!, events[6]!, events[2]!, events[5]!, events[3]!],
      recent_raw_window_turns: 2,
    }));

    expect(compiled.recent_conversation.map(({ id }) => id)).toEqual(["u2", "a2", "u3", "a3"]);
    expect(compiled.debug_manifest.recent_seq_range).toEqual({ start: 5, end: 8 });
    expect(compiled.metrics.d0_full_tokens).toBeGreaterThan(compiled.metrics.d1_recent_tokens);
  });

  it("returns no recent events when the snapshot contains no user turn", () => {
    const compiled = assembleContext(input({ raw_events: [raw("s", 1, "system"), raw("a", 2, "assistant")] }));
    expect(compiled.recent_conversation).toEqual([]);
    expect(compiled.debug_manifest.recent_seq_range).toBeNull();
  });

  it("admits whole optional tombstones newest-first only while budget remains", () => {
    const older = item("a-old", "REJECTED_ALTERNATIVE", "REJECTED", {
      content: "A very long old rejected alternative that must never be partially truncated.",
      updated_at: "2026-08-20T00:00:00.000Z",
      source_refs: ["u1"],
      metadata: { reason: "too risky", reopen_if: "risk disappears", extra: "not copied" },
    });
    const newer = item("z-new", "DECISION", "SUPERSEDED", {
      content: "New history.",
      updated_at: "2026-08-21T00:00:00.000Z",
      source_refs: ["u1"],
      metadata: { reason: "replaced" },
    });
    const snapshot = input({ context_items: [older, newer], raw_events: [raw("u1", 1, "user")] });
    const mandatoryTokens = assembleContext({ ...snapshot, token_budget: 0 }).metrics.d2_compiled_tokens;
    const onlyNewTokens = assembleContext({
      ...snapshot,
      token_budget: Number.MAX_SAFE_INTEGER,
      context_items: [newer],
    }).metrics.d2_compiled_tokens;
    const budget = mandatoryTokens + (onlyNewTokens - assembleContext({
      ...snapshot,
      token_budget: 0,
      context_items: [],
    }).metrics.d2_compiled_tokens);
    const compiled = assembleContext({ ...snapshot, token_budget: budget });

    expect(compiled.compact_historical_notes).toEqual([{
      id: "z-new",
      type: "DECISION",
      status: "SUPERSEDED",
      content: "New history.",
      reason: "replaced",
      provenance_handles: ["u1"],
    }]);
    expect(compiled.debug_manifest.suppressed_state_ids).toEqual(["a-old"]);
    expect(compiled.rendered_context).not.toContain("partially truncated");
  });

  it("uses updated_at descending and id ascending for optional history", () => {
    const notes = [
      item("b", "DECISION", "SUPERSEDED", { updated_at: "2026-08-21T00:00:00.000Z" }),
      item("a", "REJECTED_ALTERNATIVE", "REJECTED", { updated_at: "2026-08-21T00:00:00.000Z" }),
      item("c", "DECISION", "SUPERSEDED", { updated_at: "2026-08-20T00:00:00.000Z" }),
    ];
    expect(assembleContext(input({ context_items: notes })).compact_historical_notes.map(({ id }) => id))
      .toEqual(["a", "b", "c"]);
  });

  it("selects 8k optional notes with exact incremental budget accounting", () => {
    const notes = Array.from({ length: 8_000 }, (_, index) =>
      item(`history-${String(index).padStart(5, "0")}`, "DECISION", "SUPERSEDED", {
        content: `Historical choice ${index}`,
      })
    );
    const firstFourHundred = assembleContext(input({ context_items: notes.slice(0, 400) }));
    const compiled = assembleContext(input({
      context_items: notes,
      token_budget: firstFourHundred.metrics.d2_compiled_tokens,
    }));
    const unlimited = assembleContext(input({ context_items: notes }));

    expect(compiled.compact_historical_notes).toHaveLength(400);
    expect(compiled.rendered_context).toBe(firstFourHundred.rendered_context);
    expect(compiled.metrics.d2_compiled_tokens).toBe(estimateTokens(compiled.rendered_context));
    expect(unlimited.compact_historical_notes).toHaveLength(8_000);
    expect(unlimited.metrics.d2_compiled_tokens).toBe(estimateTokens(unlimited.rendered_context));
  });

  it.each(["returning", "throwing"])(
    "rejects a %s source_refs property accessor without invoking it",
    (kind) => {
      let getterCalls = 0;
      const secret = "SECRET_SOURCE_REFS_ACCESSOR";
      const malicious = item("goal", "GOAL", "ACTIVE");
      Object.defineProperty(malicious, "source_refs", {
        enumerable: true,
        get() {
          getterCalls += 1;
          if (kind === "throwing") throw new Error(secret);
          return [secret];
        },
      });

      let caught: unknown;
      try {
        assembleContext(input({ context_items: [malicious] }));
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(ContextAssemblerValidationError);
      expect((caught as Error).message).not.toContain(secret);
      expect(getterCalls).toBe(0);
    }
  );

  it.each(["returning", "throwing"])(
    "rejects a %s source_refs array entry accessor without invoking it",
    (kind) => {
      let getterCalls = 0;
      const secret = "SECRET_SOURCE_REFS_ENTRY";
      const sourceRefs = ["placeholder"];
      Object.defineProperty(sourceRefs, "0", {
        enumerable: true,
        get() {
          getterCalls += 1;
          if (kind === "throwing") throw new Error(secret);
          return secret;
        },
      });
      const malicious = item("goal", "GOAL", "ACTIVE", { source_refs: sourceRefs });

      let caught: unknown;
      try {
        assembleContext(input({ context_items: [malicious] }));
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(ContextAssemblerValidationError);
      expect((caught as Error).message).not.toContain(secret);
      expect(getterCalls).toBe(0);
    }
  );

  it("rejects source_refs extra fields and array subclasses", () => {
    const withExtra = [] as string[] & { extra?: string };
    withExtra.extra = "not-an-index";
    class SourceRefArray extends Array<string> {}

    expect(() => assembleContext(input({
      context_items: [item("extra", "GOAL", "ACTIVE", { source_refs: withExtra })],
    }))).toThrow(ContextAssemblerValidationError);
    expect(() => assembleContext(input({
      context_items: [item("subclass", "GOAL", "ACTIVE", { source_refs: new SourceRefArray() })],
    }))).toThrow(ContextAssemblerValidationError);
  });

  it.each(["returning", "throwing"])(
    "rejects a %s nested metadata array accessor without invoking it",
    (kind) => {
      let getterCalls = 0;
      const secret = "SECRET_METADATA_ENTRY";
      const nested = ["placeholder"];
      Object.defineProperty(nested, "0", {
        enumerable: true,
        get() {
          getterCalls += 1;
          if (kind === "throwing") throw new Error(secret);
          return secret;
        },
      });
      const malicious = item("goal", "GOAL", "ACTIVE", { metadata: { nested } });

      let caught: unknown;
      try {
        assembleContext(input({ context_items: [malicious] }));
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(ContextAssemblerValidationError);
      expect((caught as Error).message).not.toContain(secret);
      expect(getterCalls).toBe(0);
    }
  );

  it("rejects nested metadata array subclasses and extra fields", () => {
    class MetadataArray extends Array<string> {}
    const withExtra = [] as string[] & { extra?: string };
    withExtra.extra = "not-json";
    expect(() => assembleContext(input({
      context_items: [item("subclass", "GOAL", "ACTIVE", { metadata: { nested: new MetadataArray() } })],
    }))).toThrow(ContextAssemblerValidationError);
    expect(() => assembleContext(input({
      context_items: [item("extra", "GOAL", "ACTIVE", { metadata: { nested: withExtra } })],
    }))).toThrow(ContextAssemblerValidationError);
  });

  it("rejects non-standard top-level snapshot arrays", () => {
    class ItemArray extends Array<ContextItem> {}
    expect(() => assembleContext(input({ context_items: new ItemArray() })))
      .toThrow(ContextAssemblerValidationError);
  });

  it("is deeply deterministic across input order and does not mutate frozen inputs", () => {
    const events = [raw("u", 1, "user"), raw("a", 2, "assistant")];
    const goal = item("goal", "GOAL", "ACTIVE");
    const dependency = item("dependency", "CONSTRAINT", "SUPERSEDED");
    const first = input({
      context_items: [goal, dependency],
      state_relations: [relation("goal", "DEPENDS_ON", "dependency")],
      raw_events: events,
    });
    const frozen = Object.freeze({
      ...first,
      context_items: Object.freeze(first.context_items.map((entry) => Object.freeze(entry))),
      state_relations: Object.freeze(first.state_relations.map((entry) => Object.freeze(entry))),
      raw_events: Object.freeze(first.raw_events.map((entry) => Object.freeze(entry))),
    }) as unknown as ContextAssemblerInput;
    const result = assembleContext(frozen);
    const shuffled = assembleContext(input({
      context_items: [dependency, goal],
      state_relations: [...first.state_relations].reverse(),
      raw_events: [...events].reverse(),
    }));

    expect(assembleContext(frozen)).toEqual(result);
    expect(shuffled).toEqual(result);
  });

  it("renders fixed sections without implicit object strings or undefined values", () => {
    const compiled = assembleContext(input());
    expect(renderCompiledContext(compiled)).toBe(compiled.rendered_context);
    expect(compiled.rendered_context).toContain("## Current Goal\n[none]");
    expect(compiled.rendered_context).toContain("## Active Constraints");
    expect(compiled.rendered_context).toContain("## Active Decisions");
    expect(compiled.rendered_context).toContain("## Open Questions");
    expect(compiled.rendered_context).toContain("## Relevant Historical Notes");
    expect(compiled.rendered_context).toContain("## Recent Conversation");
    expect(compiled.rendered_context).toContain("## Current User Input");
    expect(compiled.rendered_context).not.toMatch(/undefined|\[object Object\]/);
    expect(Number.isFinite(compiled.metrics.d1_reduction_ratio)).toBe(true);
    expect(Number.isFinite(compiled.metrics.d2_reduction_ratio)).toBe(true);
  });

  it.each([
    ["blank session", { session_id: " " }],
    ["blank current input", { current_input: "\n" }],
    ["negative budget", { token_budget: -1 }],
    ["fractional budget", { token_budget: 1.5 }],
    ["zero turn window", { recent_raw_window_turns: 0 }],
    ["oversized turn window", { recent_raw_window_turns: 101 }],
    ["cross-session item", { context_items: [{ ...item("goal", "GOAL", "ACTIVE"), session_id: "other" }] }],
    ["cross-session raw", { raw_events: [{ ...raw("u", 1, "user"), session_id: "other" }] }],
    ["duplicate item", { context_items: [item("goal", "GOAL", "ACTIVE"), item("goal", "GOAL", "ACTIVE")] }],
    ["duplicate raw id", { raw_events: [raw("u", 1, "user"), raw("u", 2, "user")] }],
    ["duplicate raw seq", { raw_events: [raw("u1", 1, "user"), raw("u2", 1, "user")] }],
  ])("rejects %s with a stable validation error", (_label, overrides) => {
    expect(() => assembleContext(input(overrides as Partial<ContextAssemblerInput>)))
      .toThrow(ContextAssemblerValidationError);
  });

  it("rejects duplicate relation tuples and missing endpoints", () => {
    const goal = item("goal", "GOAL", "ACTIVE");
    const dependency = item("dependency", "GOAL", "COMPLETED");
    const edge = relation("goal", "DEPENDS_ON", "dependency");
    expect(() => assembleContext(input({ context_items: [goal, dependency], state_relations: [edge, edge] })))
      .toThrow(/relation tuple is duplicated/);
    expect(() => assembleContext(input({ context_items: [goal], state_relations: [relation("goal", "DEPENDS_ON", "missing")] })))
      .toThrow(/target is missing/);
    expect(() => assembleContext(input({ context_items: [goal], state_relations: [relation("missing", "DEPENDS_ON", "goal")] })))
      .toThrow(/source is missing/);
  });
});

describe("Assembler with real WO-CC-02 stores", () => {
  let temporaryDirectory: string | undefined;

  afterEach(async () => {
    if (temporaryDirectory !== undefined) await rm(temporaryDirectory, { recursive: true, force: true });
  });

  it("compiles a persisted snapshot without changing raw payloads or state revision", async () => {
    temporaryDirectory = await mkdtemp(join(tmpdir(), "context-compiler-assembler-"));
    const databasePath = join(temporaryDirectory, "context.db");
    const rawStore = new SqliteRawHistoryStore(databasePath);
    const stateStore = new SqliteContextStateStore(databasePath);
    const reducer = new StateReducer(stateStore);
    try {
      const source = rawStore.ingest({
        session_id: SESSION,
        source_event_id: "source-user",
        role: "user",
        content: "Preserve this exact raw payload.",
        metadata: { immutable: true },
      });
      const created = reducer.apply(SESSION, delta({
        new_decisions: [
          { content: "Old choice", source_refs: [source.id] },
          { content: "Final choice", source_refs: [source.id] },
        ],
        new_open_questions: [{ content: "Which choice?", source_refs: [source.id] }],
      })).created;
      const oldDecision = created[0]!;
      const finalDecision = created[1]!;
      const question = created[2]!;
      reducer.apply(SESSION, delta({
        supersessions: [{ superseded_id: oldDecision.id, superseding_id: finalDecision.id }],
        resolved_questions: [{ id: question.id, resolved_by: finalDecision.id }],
      }));
      const rawBefore = rawStore.getSessionEvents(SESSION);
      const revisionBefore = stateStore.getRevision(SESSION);

      const compiled = assembleContext({
        session_id: SESSION,
        context_items: stateStore.getItems(SESSION),
        state_relations: stateStore.getSessionRelations(SESSION),
        raw_events: rawBefore,
        current_input: "Continue from persisted state.",
      });

      expect(compiled.active_decisions.map(({ id }) => id)).toEqual([finalDecision.id]);
      expect(compiled.compact_historical_notes.map(({ id }) => id)).toContain(oldDecision.id);
      expect(compiled.debug_manifest.suppressed_state_ids).toContain(question.id);
      expect(rawStore.getSessionEvents(SESSION)).toEqual(rawBefore);
      expect(rawStore.getEvent(source.id)?.content).toBe("Preserve this exact raw payload.");
      expect(stateStore.getRevision(SESSION)).toBe(revisionBefore);
    } finally {
      stateStore.close();
      rawStore.close();
    }
  });
});
