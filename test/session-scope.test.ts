import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  ContextCompilerCore,
  SESSION_SCOPE_CONTRACT_VERSION,
  SCOPE_OVERLAY_KEY_METADATA,
  SqliteContextStateStore,
  SqliteHistoryRecallStore,
  type SessionScope,
} from "../src/index.js";
import { CoreReadQuery } from "../src/query.js";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("provider-neutral multi-Session Scope", () => {
  it("freezes ancestor frontiers, overlays State by precedence and keeps Raw provenance", () => {
    const database = databasePath();
    const core = new ContextCompilerCore(database);
    for (let sequence = 1; sequence <= 10; sequence += 1) {
      expect(core.call("ingest_event", {
        session_id: "parent-P", role: "user", content: `parent event ${sequence}`,
        source_event_id: `p-${sequence}`,
      }).ok).toBe(true);
    }
    const state = new SqliteContextStateStore(database);
    state.transaction("parent-P", () => state.createItem({
      session_id: "parent-P", type: "DECISION", status: "ACTIVE",
      content: "parent decision at fork",
      metadata: { [SCOPE_OVERLAY_KEY_METADATA]: "deployment-decision" },
    }));
    state.close();
    const parentFrontier = core.getSessionFrontier({ namespace: "authority", session_id: "parent-P" });
    expect(parentFrontier).toMatchObject({ raw_sequence: 10, state_revision: 1 });

    expect(core.call("ingest_event", {
      session_id: "parent-P", role: "user", content: "parent event 11 must stay hidden",
      source_event_id: "p-11",
    }).ok).toBe(true);
    const parentUpdate = new SqliteContextStateStore(database);
    parentUpdate.transaction("parent-P", () => {
      const old = parentUpdate.getItems("parent-P")[0]!;
      const next = parentUpdate.createItem({
        session_id: "parent-P", type: "DECISION", status: "ACTIVE",
        content: "parent post-fork decision",
        metadata: { [SCOPE_OVERLAY_KEY_METADATA]: "parent-post-fork-only" },
      });
      parentUpdate.supersedeDecision("parent-P", old.id, next.id);
    });
    parentUpdate.close();

    expect(core.call("ingest_event", {
      session_id: "child-C", role: "user", content: "child event",
      source_event_id: "c-1",
    }).ok).toBe(true);
    const childState = new SqliteContextStateStore(database);
    childState.transaction("child-C", () => childState.createItem({
      session_id: "child-C", type: "DECISION", status: "ACTIVE",
      content: "child decision wins",
      metadata: { [SCOPE_OVERLAY_KEY_METADATA]: "deployment-decision" },
    }));
    childState.close();

    const scope = childScope(parentFrontier.raw_sequence, parentFrontier.state_revision);
    const response = core.call("compile_context", {
      session_id: "child-C",
      session_scope: scope,
      current_input: "What is the current deployment decision?",
      recent_raw_window_turns: 100,
      operation_id: "scope-compile-child-1",
    });
    expect(response.ok).toBe(true);
    if (!response.ok) return;
    const context = (response.result as any).context;
    expect(context.session_scope).toEqual(scope);
    expect(context.active_decisions.map((item: any) => [item.session_id, item.content])).toEqual([
      ["child-C", "child decision wins"],
    ]);
    expect(context.recent_conversation.map((event: any) => event.session_id)).toEqual([
      ...Array.from({ length: 10 }, () => "parent-P"),
      "child-C",
    ]);
    expect(context.recent_conversation.map((event: any) => event.content)).not.toContain(
      "parent event 11 must stay hidden"
    );
    expect(context.operational_debug.scope_telemetry).toBe("NOT_PERSISTED_CROSS_SESSION");

    const parent = core.call("compile_context", {
      session_id: "parent-P", current_input: "parent now", recent_raw_window_turns: 100,
    });
    expect(parent.ok).toBe(true);
    if (parent.ok) {
      expect((parent.result as any).context.recent_conversation.at(-1).content).toBe(
        "parent event 11 must stay hidden"
      );
      expect((parent.result as any).context.active_decisions.map((item: any) => item.content)).toEqual([
        "parent post-fork decision",
      ]);
      expect((parent.result as any).context.session_scope).toBeUndefined();
    }
    core.close();
  });

  it("restores nested ancestry and performs one global keyword ranking", () => {
    const database = databasePath();
    const core = new ContextCompilerCore(database);
    const ingest = (session_id: string, source_event_id: string, content: string) => {
      expect(core.call("ingest_event", { session_id, source_event_id, role: "user", content }).ok).toBe(true);
    };
    ingest("P", "p-1", "shared alpha parent");
    ingest("C", "c-1", "shared alpha child");
    ingest("D", "d-1", "shared alpha leaf");
    const recall = new SqliteHistoryRecallStore(database);
    recall.createHeadline({
      session_id: "P", event_start_seq: 1, event_end_seq: 1,
      headline: "alpha parent", keywords: ["alpha"],
    });
    recall.createHeadline({
      session_id: "C", event_start_seq: 1, event_end_seq: 1,
      headline: "alpha child", keywords: ["alpha"],
    });
    recall.createHeadline({
      session_id: "D", event_start_seq: 1, event_end_seq: 1,
      headline: "alpha leaf", keywords: ["alpha"],
    });
    recall.close();
    const nested: SessionScope = {
      contract_version: SESSION_SCOPE_CONTRACT_VERSION,
      write_session: { namespace: "authority", session_id: "D" },
      read_scope: [
        { session: { namespace: "authority", session_id: "P" }, frontier: { kind: "FROZEN", raw_sequence: 1, state_revision: 0 }, precedence: 0 },
        { session: { namespace: "authority", session_id: "C" }, frontier: { kind: "FROZEN", raw_sequence: 1, state_revision: 0 }, precedence: 1 },
        { session: { namespace: "authority", session_id: "D" }, frontier: { kind: "CURRENT" }, precedence: 2 },
      ],
    };
    const query = new CoreReadQuery(database);
    expect(query.getRawEventsScope(nested).map(({ session_id }) => session_id)).toEqual(["P", "C", "D"]);
    const hits = query.recallKeywordScope({ session_scope: nested, query: "alpha", limit: 3 });
    expect(hits).toHaveLength(3);
    expect(new Set(hits.map(({ headline }) => headline.session_id))).toEqual(new Set(["P", "C", "D"]));
    query.close();
    core.close();
  });

  it("fails closed for malformed order, dynamic ancestors and unavailable frontier", () => {
    const database = databasePath();
    const core = new ContextCompilerCore(database);
    expect(core.call("ingest_event", { session_id: "P", role: "user", content: "one" }).ok).toBe(true);
    const base: any = childScope(1, 0);
    const cases = [
      { ...base, read_scope: [{ ...base.read_scope[0], precedence: 1 }, base.read_scope[1]] },
      { ...base, read_scope: [{ ...base.read_scope[0], frontier: { kind: "CURRENT" } }, base.read_scope[1]] },
      { ...base, read_scope: [{ ...base.read_scope[0], frontier: { kind: "FROZEN", raw_sequence: 2, state_revision: 0 } }, base.read_scope[1]] },
      {
        ...base,
        read_scope: [
          { ...base.read_scope[0], session: { namespace: "shadow", session_id: "P" } },
          base.read_scope[1],
        ],
      },
    ];
    for (const session_scope of cases) {
      expect(core.call("compile_context", {
        session_id: "child-C", session_scope, current_input: "x",
      })).toEqual({ ok: false, error: { code: "INVALID_INPUT" } });
    }
    expect(() => core.getSessionFrontier({ namespace: "shadow", session_id: "P" }))
      .toThrowError(/INVALID_INPUT/u);
    core.close();
  });
});

function childScope(rawSequence: number, stateRevision: number): SessionScope {
  return {
    contract_version: SESSION_SCOPE_CONTRACT_VERSION,
    write_session: { namespace: "authority", session_id: "child-C" },
    read_scope: [
      {
        session: { namespace: "authority", session_id: "parent-P" },
        frontier: { kind: "FROZEN", raw_sequence: rawSequence, state_revision: stateRevision },
        precedence: 0,
      },
      {
        session: { namespace: "authority", session_id: "child-C" },
        frontier: { kind: "CURRENT" }, precedence: 1,
      },
    ],
  };
}

function databasePath(): string {
  const root = mkdtempSync(join(tmpdir(), "context-session-scope-"));
  roots.push(root);
  return join(root, "context.db");
}
