import { describe, expect, it, vi } from "vitest";

import {
  DEFAULT_ROLLING_SUMMARY_RECENT_TURNS,
  RollingSummaryCompiler,
  validateRollingSummaryCoverage,
  type NormalizedRollingSummaryCurrentTurn,
  type NormalizedRollingSummaryTurn,
  type RollingSummaryModelRequest,
  type RollingSummaryTokenCountInput,
} from "../src/index.js";

function turn(ordinal: number, options: { tool?: boolean; session?: string; generation?: number } = {}): NormalizedRollingSummaryTurn {
  const messages: NormalizedRollingSummaryTurn["messages"] = options.tool
    ? [
      { message_id: `m-${ordinal}-u`, role: "user", content: `question ${ordinal}`, tool: null },
      {
        message_id: `m-${ordinal}-a`,
        role: "assistant",
        content: [{ type: "toolCall", id: `call-${ordinal}`, name: "lookup" }],
        tool: { kind: "assistant_tool_calls", tool_call_ids: [`call-${ordinal}`] },
      },
      {
        message_id: `m-${ordinal}-t`,
        role: "tool",
        content: [{ type: "text", text: `result ${ordinal}` }],
        tool: { kind: "tool_result", tool_call_id: `call-${ordinal}`, tool_name: "lookup", is_error: false },
      },
      { message_id: `m-${ordinal}-f`, role: "assistant", content: `answer ${ordinal}`, tool: null },
    ]
    : [
      { message_id: `m-${ordinal}-u`, role: "user", content: `question ${ordinal}`, tool: null },
      { message_id: `m-${ordinal}-a`, role: "assistant", content: `answer ${ordinal}`, tool: null },
    ];
  return {
    host_instance_id: "host-1",
    session_id: options.session ?? "session-1",
    working_store_generation: options.generation ?? 1,
    turn_id: `turn-${ordinal}`,
    ordinal,
    messages,
  };
}

const currentTurn: NormalizedRollingSummaryCurrentTurn = {
  messages: [
    { message_id: "current-user", role: "user", content: "current question", tool: null },
    {
      message_id: "current-assistant",
      role: "assistant",
      content: [{ type: "toolCall", id: "current-call", name: "lookup" }],
      tool: { kind: "assistant_tool_calls", tool_call_ids: ["current-call"] },
    },
  ],
};

function fixture(options: { model?: (request: RollingSummaryModelRequest) => Promise<{ content: string }> | { content: string }; shortTokens?: number | null } = {}) {
  const requests: RollingSummaryModelRequest[] = [];
  const tokenInputs: RollingSummaryTokenCountInput[] = [];
  const compiler = new RollingSummaryCompiler(
    {
      async generate(request) {
        requests.push(request);
        return options.model?.(request) ?? { content: "goal; constraints; result; next step; id=/tmp/exact" };
      },
    },
    {
      countTokens(input) {
        tokenInputs.push(input);
        return input.kind === "summary_content"
          ? 12
          : (Object.hasOwn(options, "shortTokens") ? options.shortTokens! : 80);
      },
    },
    () => "2026-09-01T00:00:00.000Z",
  );
  return { compiler, requests, tokenInputs };
}

function input(turns = Array.from({ length: 8 }, (_, index) => turn(index + 1))) {
  return {
    host_instance_id: "host-1",
    session_id: "session-1",
    working_store_generation: 1,
    completed_turns: turns,
    current_turn: currentTurn,
    system_prompt: "system",
    tools: [{ name: "lookup" }],
    native_context_tokens: 200,
    summary_model_identity: "summary-model-1",
    context_model_identity: "context-model-1",
    timeout_ms: 100,
  } as const;
}

describe("provider-neutral Rolling Summary", () => {
  it("defaults to six recent complete Turns and summarizes the exact older prefix", async () => {
    const test = fixture({ shortTokens: 90 });
    const result = await test.compiler.compile(input());
    expect(result.status).toBe("READY");
    if (result.status !== "READY") return;
    expect(DEFAULT_ROLLING_SUMMARY_RECENT_TURNS).toBe(6);
    expect(test.requests).toHaveLength(1);
    expect(test.requests[0]?.covered_turns.map((entry) => entry.turn_id)).toEqual(["turn-1", "turn-2"]);
    expect(result.snapshot.covered_turn_ids).toEqual(["turn-1", "turn-2"]);
    expect(result.context.recent_turns.map((entry) => entry.turn_id)).toEqual([
      "turn-3", "turn-4", "turn-5", "turn-6", "turn-7", "turn-8",
    ]);
    expect(result.context.current_turn).toEqual(currentTurn);
    expect(result.context.system_prompt).toBe("system");
    expect(result.context.tools).toEqual([{ name: "lookup" }]);
    expect(result.token_savings).toBe(110);
  });

  it("does not call the model until a complete Turn exits the recent window", async () => {
    const test = fixture();
    const result = await test.compiler.compile(input(Array.from({ length: 6 }, (_, index) => turn(index + 1))));
    expect(result).toMatchObject({ status: "FALLBACK", reason: "NO_COVERED_TURNS" });
    expect(test.requests).toHaveLength(0);
    expect(test.tokenInputs).toHaveLength(0);
  });

  it("regenerates expanded coverage from all complete covered Turns and reuses exact coverage", async () => {
    const test = fixture();
    const first = await test.compiler.compile(input(Array.from({ length: 7 }, (_, index) => turn(index + 1))));
    if (first.status !== "READY") throw new Error("first summary missing");
    const reused = await test.compiler.compile({
      ...input(Array.from({ length: 7 }, (_, index) => turn(index + 1))),
      previous_snapshot: first.snapshot,
    });
    expect(reused).toMatchObject({ status: "READY", generated: false });
    expect(test.requests).toHaveLength(1);

    const expanded = await test.compiler.compile({
      ...input(Array.from({ length: 8 }, (_, index) => turn(index + 1))),
      previous_snapshot: first.snapshot,
    });
    expect(expanded).toMatchObject({ status: "READY", generated: true });
    expect(test.requests).toHaveLength(2);
    expect(test.requests[1]?.covered_turns.map((entry) => entry.turn_id)).toEqual(["turn-1", "turn-2"]);
  });

  it("makes the snapshot identity stable and snapshots/freezes caller-owned inputs", async () => {
    const turns = Array.from({ length: 7 }, (_, index) => turn(index + 1));
    const firstTest = fixture();
    const secondTest = fixture();
    const first = await firstTest.compiler.compile(input(turns));
    const second = await secondTest.compiler.compile(input(turns));
    if (first.status !== "READY" || second.status !== "READY") throw new Error("summary missing");
    expect(first.snapshot.summary_id).toBe(second.snapshot.summary_id);
    expect(first.snapshot.content_hash).toBe(second.snapshot.content_hash);
    expect(Object.isFrozen(first.snapshot)).toBe(true);
    expect(Object.isFrozen(first.snapshot.covered_turn_ids)).toBe(true);
    expect(Object.isFrozen(first.context.recent_turns[0]?.messages)).toBe(true);
    (turns[0] as { turn_id: string }).turn_id = "caller-mutated";
    expect(first.snapshot.covered_turn_ids).toEqual(["turn-1"]);
  });

  it("fails closed for coverage gaps, duplicates, cross-session and generation changes", async () => {
    for (const turns of [
      [turn(1), turn(3), ...Array.from({ length: 5 }, (_, index) => turn(index + 4))],
      [turn(1), turn(1), ...Array.from({ length: 5 }, (_, index) => turn(index + 2))],
      [turn(1), turn(2, { session: "other" }), ...Array.from({ length: 5 }, (_, index) => turn(index + 3))],
      [turn(1), turn(2, { generation: 2 }), ...Array.from({ length: 5 }, (_, index) => turn(index + 3))],
    ]) {
      const test = fixture();
      await expect(test.compiler.compile(input(turns))).resolves.toMatchObject({
        status: "FALLBACK",
        reason: "COVERAGE_INVALID",
      });
      expect(test.requests).toHaveLength(0);
    }
  });

  it("accepts complete tool chains but rejects missing, orphaned and duplicate results", async () => {
    expect(validateRollingSummaryCoverage([turn(1, { tool: true })], {
      host_instance_id: "host-1", session_id: "session-1", working_store_generation: 1,
    })).toEqual({ status: "VALID" });

    const complete = turn(1, { tool: true });
    const missing = { ...complete, messages: complete.messages.filter((entry) => entry.role !== "tool") };
    const orphan = {
      ...complete,
      messages: complete.messages.map((entry) => entry.role === "tool"
        ? { ...entry, tool: { ...entry.tool, tool_call_id: "other" } }
        : entry),
    } as NormalizedRollingSummaryTurn;
    const duplicate = {
      ...complete,
      messages: [...complete.messages, complete.messages.find((entry) => entry.role === "tool")!],
    };
    for (const invalid of [missing, orphan, duplicate]) {
      expect(validateRollingSummaryCoverage([invalid], {
        host_instance_id: "host-1", session_id: "session-1", working_store_generation: 1,
      })).toEqual({ status: "INVALID", reason: "TOOL_CHAIN_INVALID" });
    }
  });

  it("falls back for empty/invalid model output, model failure, timeout and abort", async () => {
    const empty = fixture({ model: async () => ({ content: "   " }) });
    await expect(empty.compiler.compile(input())).resolves.toMatchObject({ reason: "MODEL_OUTPUT_EMPTY" });

    const invalid = fixture({ model: async () => ({ content: "x".repeat(65_537) }) });
    await expect(invalid.compiler.compile(input())).resolves.toMatchObject({ reason: "MODEL_OUTPUT_INVALID" });

    const failed = fixture({ model: async () => { throw new Error("provider private error"); } });
    await expect(failed.compiler.compile(input())).resolves.toMatchObject({ reason: "MODEL_FAILED" });

    const timeout = fixture({ model: () => new Promise(() => undefined) });
    await expect(timeout.compiler.compile({ ...input(), timeout_ms: 5 })).resolves.toMatchObject({ reason: "MODEL_TIMEOUT" });

    const aborted = fixture();
    const controller = new AbortController();
    controller.abort();
    await expect(aborted.compiler.compile({ ...input(), signal: controller.signal })).resolves.toMatchObject({ reason: "MODEL_ABORTED" });
  });

  it("arms external abort before a synchronous model call can abort and return a pending promise", async () => {
    const controller = new AbortController();
    const test = fixture({
      model: () => {
        controller.abort();
        return new Promise(() => undefined);
      },
    });
    const result = await Promise.race([
      test.compiler.compile({ ...input(), signal: controller.signal, timeout_ms: 10 }),
      new Promise<"HUNG">((resolve) => setTimeout(() => resolve("HUNG"), 100)),
    ]);
    expect(result).not.toBe("HUNG");
    expect(result).toMatchObject({ status: "FALLBACK", reason: "MODEL_ABORTED" });
    expect(test.requests).toHaveLength(1);
  });

  it("settles a pending model when the caller aborts after dispatch", async () => {
    const controller = new AbortController();
    const test = fixture({ model: () => new Promise(() => undefined) });
    const compiling = test.compiler.compile({ ...input(), signal: controller.signal, timeout_ms: 1_000 });
    controller.abort();
    const result = await Promise.race([
      compiling,
      new Promise<"HUNG">((resolve) => setTimeout(() => resolve("HUNG"), 100)),
    ]);
    expect(result).not.toBe("HUNG");
    expect(result).toMatchObject({ status: "FALLBACK", reason: "MODEL_ABORTED" });
    expect(test.requests).toHaveLength(1);
  });

  it("fails closed when token counts are unknown, over budget, or have no positive benefit", async () => {
    const unknown = fixture({ shortTokens: null });
    await expect(unknown.compiler.compile(input())).resolves.toMatchObject({ reason: "TOKEN_COUNT_UNKNOWN" });

    const noBenefit = fixture({ shortTokens: 200 });
    await expect(noBenefit.compiler.compile(input())).resolves.toMatchObject({
      reason: "NO_TOKEN_BENEFIT",
      short_context_tokens: 200,
    });

    const overBudgetInputs: RollingSummaryTokenCountInput[] = [];
    const overBudget = new RollingSummaryCompiler(
      { generate: () => ({ content: "summary" }) },
      { countTokens: (tokenInput) => { overBudgetInputs.push(tokenInput); return 5; } },
      () => "now",
    );
    await expect(overBudget.compile({ ...input(), max_summary_tokens: 4 })).resolves.toMatchObject({
      reason: "SUMMARY_TOKEN_BUDGET_EXCEEDED",
    });
    expect(overBudgetInputs).toHaveLength(1);
  });

  it("rejects tampered or cross-generation snapshots before model or dispatch assembly", async () => {
    const test = fixture();
    const first = await test.compiler.compile(input());
    if (first.status !== "READY") throw new Error("summary missing");
    const tampered = { ...first.snapshot, content: "tampered" };
    const result = await test.compiler.compile({ ...input(), previous_snapshot: tampered });
    expect(result).toMatchObject({ status: "FALLBACK", reason: "SNAPSHOT_INVALID" });
    expect(test.requests).toHaveLength(1);

    const changedGeneration = await test.compiler.compile({
      ...input(Array.from({ length: 8 }, (_, index) => turn(index + 1, { generation: 2 }))),
      working_store_generation: 2,
      previous_snapshot: first.snapshot,
    });
    expect(changedGeneration).toMatchObject({ status: "FALLBACK", reason: "SNAPSHOT_INVALID" });
  });

  it("does not expose hidden model output as an assistant message", async () => {
    const hidden = vi.fn(() => ({ content: "private internal summary" }));
    const test = fixture({ model: hidden });
    const result = await test.compiler.compile(input());
    if (result.status !== "READY") throw new Error("summary missing");
    expect(hidden).toHaveBeenCalledOnce();
    expect(result.context.summary.role).toBe("system");
    expect(result.context.current_turn.messages.some((message) => message.content === "private internal summary")).toBe(false);
  });
});
