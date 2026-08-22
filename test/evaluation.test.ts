// @vitest-environment node

import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  EvaluationError,
  normalizeEvaluationText,
  parseEvaluationSuite,
  runEvaluationSuite,
  type EvaluationCase,
  type EvaluationSuite,
} from "../src/evaluation.js";
import { EVALUATION_CLI_EXIT, runEvaluationCli } from "../src/evaluation-cli.js";
import { SqliteHistoryRecallStore } from "../src/recall.js";
import { estimateTokens, SqliteRawHistoryStore, type RawEvent } from "../src/raw-store.js";
import type { ContextItem } from "../src/state-types.js";

const TIME = "2026-08-23T00:00:00.000Z";
const SESSION = "evaluation-session";
const temporaryDirectories: string[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(temporaryDirectories.splice(0).map((directory) =>
    rm(directory, { recursive: true, force: true })
  ));
});

function raw(id: string, seq: number, role: RawEvent["role"], content: string): RawEvent {
  return {
    id,
    session_id: SESSION,
    seq,
    role,
    content,
    event_type: "message",
    created_at: `2026-08-23T00:00:0${seq}.000Z`,
    token_count: estimateTokens(content),
    metadata: { fixture: true },
    source_event_id: `source-${id}`,
  };
}

function item(
  id: string,
  type: ContextItem["type"],
  status: ContextItem["status"],
  content: string,
  sourceRef: string
): ContextItem {
  return {
    id,
    session_id: SESSION,
    type,
    content,
    status,
    confidence: 1,
    created_at: TIME,
    updated_at: TIME,
    source_refs: [sourceRef],
    metadata: {},
  };
}

function evaluationCase(id = "case-a"): EvaluationCase {
  const filler = "Historical implementation detail that is no longer required in the active prompt. ".repeat(12);
  return {
    id,
    session_id: SESSION,
    raw_events: [
      raw("event-1", 1, "user", `Should the legacy port remain open? ${filler}`),
      raw("event-2", 2, "assistant", `No, the legacy port is resolved and closed. ${filler}`),
      raw("event-3", 3, "user", `Constraint: Never expose credentials. Decision: Use SQLite WAL. ${filler}`),
      raw("event-4", 4, "assistant", `Acknowledged the durable storage decision. ${filler}`),
      raw("event-5", 5, "user", "How should preparation records be compacted?"),
      raw("event-6", 6, "assistant", "Measure retention before selecting a policy."),
    ],
    context_items: [
      item("constraint-1", "CONSTRAINT", "ACTIVE", "Never expose credentials", "event-3"),
      item("decision-1", "DECISION", "ACTIVE", "Use SQLite WAL", "event-3"),
      item("resolved-1", "OPEN_QUESTION", "RESOLVED", "Should the legacy port remain open?", "event-1"),
      item("open-1", "OPEN_QUESTION", "OPEN", "How should preparation records be compacted?", "event-5"),
    ],
    state_relations: [],
    current_input: "Continue with the evaluation plan.",
    recent_raw_window_turns: 1,
    token_budget: 300,
    headlines: [{
      session_id: SESSION,
      event_start_seq: 1,
      event_end_seq: 2,
      headline: "Legacy port question resolved",
      keywords: ["legacy", "port", "resolved"],
      created_at: TIME,
    }],
    recall_queries: [{ query: "legacy port", expected_event_seqs: [1, 2] }],
    probes: {
      constraints: ["Never expose credentials"],
      decisions: ["Use SQLite WAL"],
      resolved_issues: ["Should the legacy port remain open?"],
      open_questions: ["How should preparation records be compacted?"],
    },
  };
}

function suite(): EvaluationSuite {
  return {
    version: 1,
    cases: [evaluationCase()],
    thresholds: {
      minimum_d2_token_reduction_ratio: 0.1,
      minimum_d2_constraint_retention: 1,
      minimum_d2_decision_continuity: 1,
      maximum_d2_resolved_issue_reopening: 0,
      minimum_d2_open_question_continuity: 1,
      minimum_d2_recall_recovery: 1,
      maximum_d2_mean_latency_ms: 1_000,
    },
  };
}

describe("deterministic D0/D1/D2 evaluation", () => {
  it("measures reduction, continuity, reopening, recovery, and latency for all dimensions", () => {
    const report = runEvaluationSuite(suite());
    const { d0, d1, d2 } = report.cases[0]!.dimensions;

    expect(report).toMatchObject({ version: 1, case_count: 1, passed: true });
    expect(report.threshold_failures).toEqual([]);
    expect(d0.token_reduction_ratio).toBe(0);
    expect(d1.constraint_retention.rate).toBe(0);
    expect(d1.decision_continuity.rate).toBe(0);
    expect(d1.open_question_continuity.rate).toBe(1);
    expect(d0.resolved_issue_reopening.rate).toBe(1);
    expect(d2).toMatchObject({
      constraint_retention: { matched: 1, total: 1, rate: 1 },
      decision_continuity: { matched: 1, total: 1, rate: 1 },
      resolved_issue_reopening: { matched: 0, total: 1, rate: 0 },
      open_question_continuity: { matched: 1, total: 1, rate: 1 },
      recall_recovery: { matched: 2, total: 2, rate: 1 },
    });
    expect(d2.token_reduction_ratio).toBeGreaterThan(0.1);
    expect(d0.latency_ms).toBeGreaterThanOrEqual(0);
    expect(d1.latency_ms).toBeGreaterThanOrEqual(0);
    expect(d2.latency_ms).toBeGreaterThanOrEqual(0);
  });

  it("uses the shared deterministic token approximation and normalized exact containment", () => {
    const input = suite();
    const report = runEvaluationSuite(input);
    const transcript = [
      ...input.cases[0]!.raw_events.map((event) => `[seq:${event.seq} ${event.role}] ${event.content}`),
      `[current user] ${input.cases[0]!.current_input}`,
    ].join("\n");
    expect(report.cases[0]!.dimensions.d0.estimated_tokens).toBe(estimateTokens(transcript));
    expect(normalizeEvaluationText("Ａ  \n B")).toBe("A B");
  });

  it("defines vacuous positive rates as one and empty reopening as zero", () => {
    const input = suite();
    input.cases[0]!.probes = {
      constraints: [], decisions: [], resolved_issues: [], open_questions: [],
    };
    input.cases[0]!.recall_queries = [];
    input.thresholds.minimum_d2_token_reduction_ratio = 0;
    const report = runEvaluationSuite(input);
    expect(report.aggregate.d2.constraint_retention).toEqual({ matched: 0, total: 0, rate: 1 });
    expect(report.aggregate.d2.decision_continuity.rate).toBe(1);
    expect(report.aggregate.d2.open_question_continuity.rate).toBe(1);
    expect(report.aggregate.d2.recall_recovery.rate).toBe(1);
    expect(report.aggregate.d2.resolved_issue_reopening.rate).toBe(0);
    expect(report.passed).toBe(true);
  });

  it("isolates cases even when session IDs and headline ranges collide", () => {
    const input = suite();
    const second = evaluationCase("case-b");
    second.headlines[0]!.headline = "A different isolated headline";
    input.cases.push(second);
    const report = runEvaluationSuite(input);
    expect(report.case_count).toBe(2);
    expect(report.cases.map(({ id }) => id)).toEqual(["case-a", "case-b"]);
    expect(report.aggregate.d2.recall_recovery).toEqual({ matched: 4, total: 4, rate: 1 });
    expect(report.aggregate.d2.estimated_tokens_total).toBe(
      report.cases[0]!.dimensions.d2.estimated_tokens * 2
    );
  });

  it("performs only the declared raw/headline setup writes before evaluation", () => {
    const rawWrites = vi.spyOn(SqliteRawHistoryStore.prototype, "ingest");
    const headlineWrites = vi.spyOn(SqliteHistoryRecallStore.prototype, "createHeadline");
    const input = suite();
    runEvaluationSuite(input);
    expect(rawWrites).toHaveBeenCalledTimes(input.cases[0]!.raw_events.length);
    expect(headlineWrites).toHaveBeenCalledTimes(input.cases[0]!.headlines.length);
  });

  it("does not mutate the submitted fixture", () => {
    const input = suite();
    const before = structuredClone(input);
    runEvaluationSuite(input);
    expect(input).toEqual(before);
  });

  it("reports stable aggregate threshold failures", () => {
    const input = suite();
    input.thresholds.minimum_d2_token_reduction_ratio = 1;
    input.thresholds.minimum_d2_recall_recovery = 1;
    input.cases[0]!.recall_queries[0]!.query = "not-indexed";
    const report = runEvaluationSuite(input);
    expect(report.passed).toBe(false);
    expect(report.threshold_failures).toEqual(["D2_TOKEN_REDUCTION", "D2_RECALL_RECOVERY"]);
  });
});

describe("evaluation fixture validation", () => {
  it.each([
    ["unknown root field", (value: any) => { value.extra = true; }],
    ["unknown nested field", (value: any) => { value.cases[0].probes.extra = true; }],
    ["empty cases", (value: any) => { value.cases = []; }],
    ["duplicate case ID", (value: any) => { value.cases.push(structuredClone(value.cases[0])); }],
    ["duplicate raw ID", (value: any) => { value.cases[0].raw_events[1].id = "event-1"; }],
    ["gapped sequence", (value: any) => { value.cases[0].raw_events[1].seq = 9; }],
    ["missing state provenance", (value: any) => { value.cases[0].context_items[0].source_refs = ["missing"]; }],
    ["invalid headline range", (value: any) => { value.cases[0].headlines[0].event_end_seq = 99; }],
    ["missing recall sequence", (value: any) => { value.cases[0].recall_queries[0].expected_event_seqs = [99]; }],
    ["invalid threshold", (value: any) => { value.thresholds.minimum_d2_constraint_retention = 2; }],
  ])("rejects %s before execution", (_label, mutate) => {
    const input: any = structuredClone(suite());
    mutate(input);
    expect(() => parseEvaluationSuite(input)).toThrowError(
      expect.objectContaining({ code: "INVALID_INPUT", message: "Evaluation input is invalid" })
    );
  });

  it("does not echo private fixture values in validation failures", () => {
    const privateValue = "PRIVATE-EVIDENCE-DO-NOT-ECHO";
    let caught: unknown;
    try {
      parseEvaluationSuite({ version: 1, cases: privateValue, thresholds: {} });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(EvaluationError);
    expect(JSON.stringify(caught)).not.toContain(privateValue);
  });
});

describe("evaluation CLI", () => {
  async function fixtureFile(value: unknown): Promise<string> {
    const directory = await mkdtemp(join(tmpdir(), "context-compiler-eval-cli-"));
    temporaryDirectories.push(directory);
    const path = join(directory, "suite.json");
    await writeFile(path, JSON.stringify(value), "utf8");
    return path;
  }

  function capture() {
    const stdout: string[] = [];
    const stderr: string[] = [];
    return {
      stdout,
      stderr,
      io: { stdout: (text: string) => stdout.push(text), stderr: (text: string) => stderr.push(text) },
    };
  }

  it("returns zero with machine-readable JSON for a passing real fixture", async () => {
    const path = await fixtureFile(suite());
    const output = capture();
    expect(runEvaluationCli([path], output.io)).toBe(EVALUATION_CLI_EXIT.passed);
    expect(output.stderr).toEqual([]);
    expect(JSON.parse(output.stdout.join(""))).toMatchObject({ version: 1, passed: true });
  });

  it("uses a distinct exit for aggregate threshold failure", async () => {
    const input = suite();
    input.thresholds.minimum_d2_token_reduction_ratio = 1;
    const path = await fixtureFile(input);
    const output = capture();
    expect(runEvaluationCli([path], output.io)).toBe(EVALUATION_CLI_EXIT.thresholdFailed);
    expect(JSON.parse(output.stdout.join(""))).toMatchObject({
      passed: false,
      threshold_failures: ["D2_TOKEN_REDUCTION"],
    });
  });

  it("sanitizes malformed JSON, invalid arguments, and missing-file failures", async () => {
    const malformed = await fixtureFile("placeholder");
    await writeFile(malformed, "{PRIVATE-MALFORMED", "utf8");

    const invalidJson = capture();
    expect(runEvaluationCli([malformed], invalidJson.io)).toBe(EVALUATION_CLI_EXIT.invalidInput);
    expect(invalidJson.stderr.join("")).not.toContain("PRIVATE-MALFORMED");
    expect(JSON.parse(invalidJson.stderr.join(""))).toEqual({
      version: 1, passed: false, error: { code: "INVALID_INPUT" },
    });

    const invalidArgs = capture();
    expect(runEvaluationCli([], invalidArgs.io)).toBe(EVALUATION_CLI_EXIT.invalidInput);

    const missing = capture();
    expect(runEvaluationCli([join(tmpdir(), "definitely-missing-evaluation-suite.json")], missing.io))
      .toBe(EVALUATION_CLI_EXIT.runtimeFailure);
    expect(JSON.parse(missing.stderr.join(""))).toEqual({
      version: 1, passed: false, error: { code: "RUNTIME_FAILURE" },
    });
  });
});
