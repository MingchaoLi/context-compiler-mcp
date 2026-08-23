// @vitest-environment node

import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
// The pilot validator intentionally remains outside the publishable src/ package.
// @ts-expect-error JavaScript fixture utility has no declaration file.
import { loadPilot, validateCaseBundle, validatePilot } from "../evaluation/starlette-v1/validate-pilot.mjs";

const PILOT_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "evaluation", "starlette-v1");
const temporaryDirectories: string[] = [];
let loaded: Awaited<ReturnType<typeof loadPilot>>;

beforeAll(async () => {
  loaded = await loadPilot(PILOT_ROOT);
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

  it("rejects an Outcome Anchor identifier copied into Current Task", () => {
    const candidate = bundle("STR-08");
    candidate.tasks.tasks[0].current_task = `Use ${candidate.outcomeAnchors.anchors[0].id} as the answer.`;
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

  it("rejects a future Decision Reference copied into Current Task", () => {
    const candidate = bundle("STR-08");
    candidate.tasks.tasks[0].current_task = candidate.decisionReferences.references[0].description;
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
});
