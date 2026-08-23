// @vitest-environment node

import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
// The pilot validator intentionally remains outside the publishable src/ package.
// @ts-expect-error JavaScript fixture utility has no declaration file.
import {
  hashIssueStateEvent, loadCanary, loadPilot, projectModelInput, validateCanary, validateCaseBundle, validatePilot,
} from "../evaluation/starlette-v1/validate-pilot.mjs";

const PILOT_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "evaluation", "starlette-v1");
const temporaryDirectories: string[] = [];
let loaded: Awaited<ReturnType<typeof loadPilot>>;
let canary: Awaited<ReturnType<typeof loadCanary>>;

beforeAll(async () => {
  loaded = await loadPilot(PILOT_ROOT);
  canary = await loadCanary(PILOT_ROOT);
});

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

function bundle(caseId: string): any {
  return structuredClone(loaded.cases.find((entry: any) => entry.caseId === caseId)!.bundle);
}

describe("Starlette schema pilot", () => {
  it("accepts the three pilot directories, four independent segments, and pilot hashes", async () => {
    await expect(validatePilot(PILOT_ROOT)).resolves.toMatchObject({
      pilot_status: "pilot_not_frozen",
      case_count: 3,
      segment_count: 4,
      event_count: 25,
      slice_count: 25,
      hashes_verified: true,
    });
  });

  it("rejects a future event in Available Evidence", () => {
    const candidate = bundle("STR-08");
    candidate.tasks.tasks[0].available_event_ids.push("STR-08/E2");
    expect(() => validateCaseBundle(candidate, "STR-08")).toThrow(/exact segment prefix/);
  });

  it("rejects future Fact Gold provenance", () => {
    const candidate = bundle("STR-08");
    candidate.factGold.slices[0].fact_ids.push("STR-08/F2");
    expect(() => validateCaseBundle(candidate, "STR-08")).toThrow(/future Gold provenance/);
  });

  it("rejects an Outcome Anchor file mixed into the input boundary", () => {
    const candidate = bundle("STR-05");
    candidate.manifest.input_files.push("outcome-anchors.json");
    expect(() => validateCaseBundle(candidate, "STR-05")).toThrow(/input boundary changed/);
  });

  it("rejects Outcome Anchor content copied into Current Task", () => {
    const candidate = bundle("STR-08");
    candidate.tasks.tasks[0].current_task = candidate.outcomeAnchors.anchors[0].summary;
    expect(() => validateCaseBundle(candidate, "STR-08")).toThrow(/Outcome Anchor content/);
  });

  it("rejects zero-width Outcome Anchor content copied into Current Task", () => {
    const candidate = bundle("STR-08");
    candidate.tasks.tasks[0].current_task = candidate.outcomeAnchors.anchors[0].summary.replaceAll(" ", "\u2060");
    expect(() => validateCaseBundle(candidate, "STR-08")).toThrow(/Outcome Anchor content/);
  });

  it("rejects an Outcome Anchor identifier copied into Current Task", () => {
    const candidate = bundle("STR-08");
    candidate.tasks.tasks[0].current_task = `Use ${candidate.outcomeAnchors.anchors[0].id} as the answer.`;
    expect(() => validateCaseBundle(candidate, "STR-08")).toThrow(/Outcome Anchor identifier/);
  });

  it("rejects a zero-width Outcome Anchor identifier copied into Current Task", () => {
    const candidate = bundle("STR-08");
    const disguised = candidate.outcomeAnchors.anchors[0].id.split("").join("\u200b");
    candidate.tasks.tasks[0].current_task = `Use ${disguised} as the answer.`;
    expect(() => validateCaseBundle(candidate, "STR-08")).toThrow(/Outcome Anchor identifier/);
  });

  it("rejects duplicate evidence IDs", () => {
    const candidate = bundle("STR-08");
    candidate.events.events[1].id = candidate.events.events[0].id;
    expect(() => validateCaseBundle(candidate, "STR-08")).toThrow(/duplicate event id/);
  });

  it("rejects time reversal inside a segment", () => {
    const candidate = bundle("STR-08");
    candidate.events.events[1].occurred_at = "2021-10-03T00:00:00Z";
    expect(() => validateCaseBundle(candidate, "STR-08")).toThrow(/time reversal/);
  });

  it("rejects a source_updated_at value before occurred_at", () => {
    const candidate = bundle("STR-08");
    candidate.events.events[0].source_updated_at = "2021-10-03T15:33:45Z";
    expect(() => validateCaseBundle(candidate, "STR-08")).toThrow(/cannot precede occurred_at/);
  });

  it("rejects an event type and source kind mismatch", () => {
    const candidate = bundle("STR-08");
    candidate.events.events[0].source.kind = "issue_comment";
    expect(() => validateCaseBundle(candidate, "STR-08")).toThrow(/does not match event_type/);
  });

  it("rejects unknown fields", () => {
    const candidate = bundle("STR-08");
    candidate.manifest.unregistered_policy = true;
    expect(() => validateCaseBundle(candidate, "STR-08")).toThrow(/expected keys/);
  });

  it("rejects cross-case Oracle provenance", () => {
    const candidate = bundle("STR-08");
    candidate.oracleState.states[0].items[0].source_refs = ["STR-05/E1"];
    expect(() => validateCaseBundle(candidate, "STR-08")).toThrow(/oracle provenance must be visible/);
  });

  it("rejects a Current Task that repeats Fact Gold", () => {
    const candidate = bundle("STR-08");
    candidate.tasks.tasks[0].current_task = candidate.factGold.facts[0].statement;
    expect(() => validateCaseBundle(candidate, "STR-08")).toThrow(/Current Task repeats Fact Gold/);
  });

  it("rejects a Current Task that repeats future Fact Gold", () => {
    const candidate = bundle("STR-08");
    candidate.tasks.tasks[0].current_task = candidate.factGold.facts.at(-1).statement.toUpperCase().replaceAll(" ", "  ");
    expect(() => validateCaseBundle(candidate, "STR-08")).toThrow(/Current Task repeats Fact Gold/);
  });

  it("rejects a zero-width Current Task that repeats future Fact Gold", () => {
    const candidate = bundle("STR-08");
    candidate.tasks.tasks[0].current_task = candidate.factGold.facts.at(-1).statement.replaceAll(" ", "\u200b");
    expect(() => validateCaseBundle(candidate, "STR-08")).toThrow(/Current Task repeats Fact Gold/);
  });

  it("rejects a control-character Current Task that repeats future Fact Gold", () => {
    const candidate = bundle("STR-08");
    candidate.tasks.tasks[0].current_task = candidate.factGold.facts.at(-1).statement.split("").join("\u0000");
    expect(() => validateCaseBundle(candidate, "STR-08")).toThrow(/Current Task repeats Fact Gold/);
  });

  it("rejects a future Decision Reference copied into Current Task", () => {
    const candidate = bundle("STR-08");
    candidate.tasks.tasks[0].current_task = candidate.decisionReferences.references[0].description;
    expect(() => validateCaseBundle(candidate, "STR-08")).toThrow(/future Decision Reference/);
  });

  it("rejects a bidi-control future Decision Reference copied into Current Task", () => {
    const candidate = bundle("STR-08");
    candidate.tasks.tasks[0].current_task = candidate.decisionReferences.references[0].description.replaceAll(" ", "\u202a\u202c");
    expect(() => validateCaseBundle(candidate, "STR-08")).toThrow(/future Decision Reference/);
  });

  it("rejects content-preserving hash tampering", async () => {
    const directory = await mkdtemp(join(tmpdir(), "context-compiler-starlette-pilot-"));
    temporaryDirectories.push(directory);
    await cp(PILOT_ROOT, directory, { recursive: true });
    const tasksPath = join(directory, "pilot", "STR-08", "tasks.json");
    const content = await readFile(tasksPath, "utf8");
    await writeFile(tasksPath, `${content}\n`, "utf8");
    await expect(validatePilot(directory)).rejects.toThrow(/pilot content hash mismatch/);
  });

  it("classifies every pilot segment from explicit information increments", () => {
    expect(bundle("STR-08").manifest.segments[0]).toMatchObject({ classification: "short" });
    expect(bundle("STR-05").manifest).toMatchObject({ tier: "long" });
    expect(bundle("STR-05").manifest.segments[0]).toMatchObject({ classification: "long" });
    expect(bundle("STR-02").manifest.segments.map((segment: any) => segment.classification)).toEqual(["medium", "medium"]);
  });

  it("rejects an increment outside the segment event list", () => {
    const candidate = bundle("STR-08");
    candidate.manifest.segments[0].information_increment_event_ids[3] = "STR-08/E99";
    expect(() => validateCaseBundle(candidate, "STR-08")).toThrow(/increment must belong/);
  });

  it("rejects a classification that disagrees with increment count", () => {
    const candidate = bundle("STR-05");
    candidate.manifest.tier = "medium";
    candidate.manifest.segments[0].classification = "medium";
    expect(() => validateCaseBundle(candidate, "STR-05")).toThrow(/expected long for 9 increments/);
  });
});

describe("Starlette STR-04 canary and model projection", () => {
  function canaryBundle(): any {
    return structuredClone(canary.case.bundle);
  }

  it("accepts one long/open canary with eighteen audited increments and hashes", async () => {
    await expect(validateCanary(PILOT_ROOT)).resolves.toMatchObject({
      canary_status: "canary_not_frozen",
      case_count: 1,
      segment_count: 1,
      event_count: 18,
      slice_count: 18,
      information_increment_count: 18,
      hashes_verified: true,
    });
  });

  it("projects only the six allowed event fields and a separate Current Task", () => {
    const projection = projectModelInput(canaryBundle(), "STR-04/T18");
    expect(Object.keys(projection)).toEqual(["schema_version", "history_turns", "current_task"]);
    expect(projection.history_turns).toHaveLength(18);
    for (const turn of projection.history_turns) {
      expect(Object.keys(turn)).toEqual(["id", "role", "event_type", "occurred_at", "actor", "summary"]);
    }
  });

  it("keeps audit metadata and all non-input artifacts out of projection", () => {
    const candidate = canaryBundle();
    const projectionText = JSON.stringify(projectModelInput(candidate, "STR-04/T18"));
    expect(projectionText).not.toContain(candidate.events.events[0].source.node_id);
    expect(projectionText).not.toContain(candidate.events.events[0].source_content_sha256);
    expect(projectionText).not.toContain(candidate.factGold.facts[0].statement);
    expect(projectionText).not.toContain(candidate.oracleState.states[0].items[0].content);
    expect(projectionText).not.toContain(candidate.decisionReferences.references[0].id);
    expect(projectionText).not.toContain(candidate.outcomeAnchors.anchors[0].source.commit_sha);
  });

  it("projects the exact evidence prefix for an early cutoff", () => {
    const projection = projectModelInput(canaryBundle(), "STR-04/T3");
    expect(projection.history_turns.map((turn: any) => turn.id)).toEqual(["STR-04/E1", "STR-04/E2", "STR-04/E3"]);
  });

  it("rejects unregistered audit metadata instead of projecting it", () => {
    const candidate = canaryBundle();
    candidate.events.events[0].audit_note = "future curator note";
    expect(() => projectModelInput(candidate, "STR-04/T1")).toThrow(/expected keys/);
  });

  it("documents that structural validation does not detect semantic future paraphrases", () => {
    const candidate = canaryBundle();
    candidate.tasks.tasks[0].current_task = "Assume later work supplies route-scoped hooks; explain why that still leaves zero-touch instrumentation incomplete.";
    expect(() => validateCaseBundle(candidate, "STR-04")).not.toThrow();
  });

  it("does not equate the E13 tracker close with semantic resolution or delivery", () => {
    const candidate = canaryBundle();
    const state = candidate.oracleState.states.find((entry: any) => entry.slice_id === "STR-04/T13");
    expect(state.items.some((item: any) => item.status === "RESOLVED")).toBe(false);
    expect(state.items.some((item: any) => /delivered direction/i.test(item.content))).toBe(false);
    expect(candidate.factGold.facts.find((fact: any) => fact.id === "STR-04/F14")).toMatchObject({ category: "outcome_status" });
  });

  it("pins the E13 closed-state hash with a null commit id", () => {
    const candidate = canaryBundle();
    const event = candidate.events.events.find((entry: any) => entry.id === "STR-04/E13");
    expect(hashIssueStateEvent({
      id: 7433573738,
      node_id: event.source.node_id,
      event: "closed",
      actor: event.actor,
      created_at: event.occurred_at,
      commit_id: null,
    })).toBe(event.source_content_sha256);
  });

  it("rejects canary hash tampering", async () => {
    const directory = await mkdtemp(join(tmpdir(), "context-compiler-starlette-canary-"));
    temporaryDirectories.push(directory);
    await cp(PILOT_ROOT, directory, { recursive: true });
    const tasksPath = join(directory, "canary", "STR-04", "tasks.json");
    const content = await readFile(tasksPath, "utf8");
    await writeFile(tasksPath, `${content}\n`, "utf8");
    await expect(validateCanary(directory)).rejects.toThrow(/canary content hash mismatch/);
  });
});
