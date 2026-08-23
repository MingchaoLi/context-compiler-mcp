import { describe, expect, it } from "vitest";
import {
  compileOperationalContext,
  type ContextItem,
  type ExperienceLedgerRecord,
  type RawEvent,
  type StateRelation,
} from "../src/index.js";

const SESSION = "operational";

describe("bounded operational context policy", () => {
  it("keeps the exact recent N turns separate and uses normal 5x versus recovery 8x candidates", () => {
    const events = Array.from({ length: 9 }, (_, index) => raw(
      index + 1,
      index === 0 ? "ancient needle" : index === 8 ? "verified failure" : `turn ${index + 1}`,
      index === 8 ? "verified_failure" : "message"
    ));
    const normal = compileOperationalContext(base(events, { current_input: "needle", recent_raw_window_turns: 1 }));
    expect(normal.context.recent_conversation.map(({ id }) => id)).toEqual(["e9"]);
    expect(normal.context.retrieved_history).toEqual([]);
    expect(normal.context.operational_debug).toMatchObject({
      mode: "normal",
      candidate_turn_count: 5,
      candidate_event_ids: ["e4", "e5", "e6", "e7", "e8"],
    });

    const recovery = compileOperationalContext(base(events, {
      current_input: "needle",
      recent_raw_window_turns: 1,
      context_policy: { recovery_failure_event_id: "e9" },
    }));
    expect(recovery.context.recent_conversation.map(({ id }) => id)).toEqual(["e9"]);
    expect(recovery.context.retrieved_history?.map(({ id }) => id)).toEqual(["e1"]);
    expect(recovery.context.operational_debug).toMatchObject({
      mode: "targeted_recovery", candidate_turn_count: 8, retrieval_limit: 16,
    });
    expect(new Set([
      ...recovery.context.recent_conversation.map(({ id }) => id),
      ...(recovery.context.retrieved_history ?? []).map(({ id }) => id),
    ]).size).toBe(2);
  });

  it("uses reproducible BM25 + Dense ranking and falls the whole dense leg back", () => {
    const events = [
      raw(1, "alpha", "message", { vector_space_id: "vs-v1", values: [1, 0] }),
      raw(2, "beta", "message", { vector_space_id: "vs-v1", values: [0, 1] }),
      raw(3, "recent"),
    ];
    const hybrid = compileOperationalContext(base(events, {
      current_input: "alpha",
      recent_raw_window_turns: 1,
      dense_query: { vector_space_id: "vs-v1", values: [0, 1] },
      context_policy: { bm25_weight: 0.2, dense_weight: 0.8 },
    }));
    expect(hybrid.context.operational_debug?.dense_availability).toBe("hybrid");
    expect(hybrid.context.retrieved_history?.map(({ id }) => id)).toEqual(["e2", "e1"]);

    const partialEvents = events.map((event) => event.id === "e2"
      ? { ...event, dense_embedding: undefined }
      : event);
    const partial = compileOperationalContext(base(partialEvents, {
      current_input: "alpha",
      recent_raw_window_turns: 1,
      dense_query: { vector_space_id: "vs-v1", values: [0, 1] },
    }));
    expect(partial.context.operational_debug?.dense_availability)
      .toBe("dense_unavailable_partial_coverage");
    expect(partial.context.retrieved_history?.map(({ id }) => id)).toEqual(["e1"]);

    const zero = compileOperationalContext(base(events, {
      current_input: "alpha", recent_raw_window_turns: 1,
      dense_query: { vector_space_id: "vs-v1", values: [0, 0] },
    }));
    expect(zero.context.operational_debug?.dense_availability)
      .toBe("dense_unavailable_query_zero_norm");
    expect(zero.context.retrieved_history?.map(({ id }) => id)).toEqual(["e1"]);

    const wrongSpace = compileOperationalContext(base(events, {
      current_input: "alpha", recent_raw_window_turns: 1,
      dense_query: { vector_space_id: "other-v2", values: [0, 1] },
    }));
    expect(wrongSpace.context.operational_debug?.dense_availability)
      .toBe("dense_unavailable_space_mismatch");
    const wrongDimension = compileOperationalContext(base(events, {
      current_input: "alpha", recent_raw_window_turns: 1,
      dense_query: { vector_space_id: "vs-v1", values: [0, 1, 0] },
    }));
    expect(wrongDimension.context.operational_debug?.dense_availability)
      .toBe("dense_unavailable_dimension_mismatch");

    const tie = compileOperationalContext(base(events, {
      current_input: "not-present", recent_raw_window_turns: 1,
      dense_query: { vector_space_id: "vs-v1", values: [1, 1] },
      context_policy: { bm25_weight: 0, dense_weight: 1 },
    }));
    expect(tie.context.retrieved_history?.map(({ id }) => id)).toEqual(["e2", "e1"]);
  });

  it("rejects invalid recovery references and strict policy/vector shapes", () => {
    const events = [raw(1, "ordinary"), raw(2, "recent")];
    expect(() => compileOperationalContext(base(events, {
      context_policy: { recovery_failure_event_id: "e1" },
    }))).toThrow(/verified_failure/);
    expect(() => compileOperationalContext(base(events, {
      context_policy: { bm25_weight: 0, dense_weight: 0 },
    }))).toThrow(/positive sum/);
    expect(() => compileOperationalContext(base(events, {
      dense_query: { vector_space_id: "v", values: [-0] },
    }))).toThrow(/finite lossless/);
  });
});

describe("dormant placement is fail-open and orthogonal to lifecycle", () => {
  const events = Array.from({ length: 17 }, (_, index) => raw(index + 1, `turn ${index + 1}`));
  const baseline = compileRecord(1, 1);
  const oldGoal = item("old", "GOAL", "ACTIVE", "durable plan", ["e2"]);
  const constraint = item("constraint", "CONSTRAINT", "ACTIVE", "must retain", ["e2"]);

  it("fails open without a prior telemetry baseline and at the threshold lower boundary", () => {
    const noBaseline = compileOperationalContext(base(events, {
      context_items: [oldGoal], operation_id: "first", recent_raw_window_turns: 1,
    }));
    expect(noBaseline.context.dormant_state_ids).toEqual([]);
    expect(noBaseline.context.active_goals.map(({ id }) => id)).toEqual(["old"]);

    const below = compileOperationalContext(base(events.slice(0, 16), {
      context_items: [oldGoal], operation_id: "below", ledger_records: [baseline], recent_raw_window_turns: 1,
    }));
    expect(below.context.dormant_state_ids).toEqual([]);
  });

  it("places an eligible item dormant at age N*15 without mutating status or provenance", () => {
    const before = structuredClone(oldGoal);
    const result = compileOperationalContext(base(events, {
      context_items: [oldGoal], operation_id: "threshold", ledger_records: [baseline], recent_raw_window_turns: 1,
    }));
    expect(result.context.dormant_state_ids).toEqual(["old"]);
    expect(result.context.active_goals).toEqual([]);
    expect(oldGoal).toEqual(before);
  });

  it("fails open for missing provenance and incomplete legacy telemetry", () => {
    const noProvenance = item("no-provenance", "GOAL", "ACTIVE", "unknown origin", []);
    const malformedBaseline: ExperienceLedgerRecord = {
      ...baseline, id: "legacy-compile", source_key: "legacy-compile",
      payload: { raw_boundary_max_seq: 1 },
    };
    const missing = compileOperationalContext(base(events, {
      context_items: [noProvenance], operation_id: "missing-provenance",
      recent_raw_window_turns: 1, ledger_records: [baseline],
    }));
    expect(missing.context.dormant_state_ids).toEqual([]);
    const incomplete = compileOperationalContext(base(events, {
      context_items: [oldGoal], operation_id: "incomplete",
      recent_raw_window_turns: 1, ledger_records: [malformedBaseline],
    }));
    expect(incomplete.context.dormant_state_ids).toEqual([]);
    expect(incomplete.context.operational_debug?.telemetry_complete).toBe(false);
  });

  it("treats retrieved history as mandatory for operational token-budget accounting", () => {
    const result = compileOperationalContext(base([
      raw(1, "needle ".repeat(20)), raw(2, "recent"),
    ], {
      current_input: "needle", recent_raw_window_turns: 1, token_budget: 0,
    }));
    expect(result.context.retrieved_history?.map(({ id }) => id)).toEqual(["e1"]);
    expect(result.context.budget_exceeded).toBe(true);
    expect(result.context.metrics.d2_compiled_tokens).toBe(result.context.debug_manifest.token_budget_used);
  });

  it("keeps constraints, updated items, prior-hit items, and dependency targets active", () => {
    const updated = item("updated", "GOAL", "ACTIVE", "updated plan", ["e17"]);
    const hit = item("hit", "GOAL", "ACTIVE", "hit plan", ["e2"]);
    const dependent = item("dependent", "DECISION", "ACTIVE", "new decision", ["e17"]);
    const hitRecord: ExperienceLedgerRecord = {
      id: "hit-record", session_id: SESSION, seq: 2, kind: "RETRIEVAL_HIT",
      occurred_at: iso(2), source_key: "retrieval-hit/older/STATE_ITEM/hit/CURRENT_QUERY",
      raw_event_ids: [], parent_ledger_ids: [],
      payload: { subject_kind: "STATE_ITEM", subject_id: "hit", reason: "CURRENT_QUERY" },
    };
    const relation: StateRelation = {
      session_id: SESSION, source_id: "dependent", relation_type: "DEPENDS_ON",
      target_id: "old", created_at: iso(17),
    };
    const result = compileOperationalContext(base(events, {
      context_items: [oldGoal, constraint, updated, hit, dependent],
      state_relations: [relation], operation_id: "rescues", ledger_records: [baseline, hitRecord], recent_raw_window_turns: 1,
    }));
    expect(result.context.dormant_state_ids).toEqual([]);
    expect(result.context.active_constraints.map(({ id }) => id)).toContain("constraint");
    expect(result.context.active_goals.map(({ id }) => id)).toEqual(expect.arrayContaining(["updated", "hit"]));
    expect(result.context.dependency_items.map(({ id }) => id)).toContain("old");
    expect(result.context.operational_debug?.dependency_rescued_state_ids).toEqual(["old"]);
  });

  it("reactivates an otherwise dormant item for a lexical current-query hit", () => {
    const result = compileOperationalContext(base(events, {
      current_input: "continue the durable plan",
      context_items: [oldGoal], operation_id: "reactivate", ledger_records: [baseline], recent_raw_window_turns: 1,
    }));
    expect(result.context.dormant_state_ids).toEqual([]);
    expect(result.context.reactivated_state_ids).toEqual(["old"]);
    expect(result.context.active_goals.map(({ id }) => id)).toEqual(["old"]);
    expect(result.hits).toContainEqual(expect.objectContaining({
      subject_kind: "STATE_ITEM", subject_id: "old", reason: "REACTIVATED",
    }));
  });
});

function base(events: RawEvent[], overrides: Partial<Parameters<typeof compileOperationalContext>[0]> = {}) {
  return {
    session_id: SESSION,
    context_items: [],
    state_relations: [],
    raw_events: events,
    current_input: "continue",
    state_revision: 0,
    ...overrides,
  };
}

function raw(
  seq: number,
  content: string,
  eventType = "message",
  dense?: { vector_space_id: string; values: number[] }
): RawEvent {
  return {
    id: `e${seq}`, session_id: SESSION, seq, role: "user", content,
    event_type: eventType, created_at: iso(seq), token_count: 1, metadata: {},
    ...(dense === undefined ? {} : { dense_embedding: dense }),
  };
}

function item(
  id: string,
  type: ContextItem["type"],
  status: ContextItem["status"],
  content: string,
  sourceRefs: string[]
): ContextItem {
  return {
    id, session_id: SESSION, type, status, content, confidence: 1,
    created_at: iso(2), updated_at: iso(2), source_refs: sourceRefs, metadata: {},
  };
}

function compileRecord(seq: number, rawSeq: number): ExperienceLedgerRecord {
  return {
    id: `compile-${seq}`, session_id: SESSION, seq, kind: "CONTEXT_COMPILE",
    occurred_at: iso(seq), source_key: `context-compile/prior-${seq}`,
    raw_event_ids: [], parent_ledger_ids: [],
    payload: { policy_version: "operational-context-v1", raw_boundary_max_seq: rawSeq },
  };
}

function iso(index: number): string {
  return `2026-08-${String(index).padStart(2, "0")}T00:00:00.000Z`;
}
