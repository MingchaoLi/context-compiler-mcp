// @vitest-environment node

import { cp, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import {
  TRUSTED_DS14_DATA_SOURCE,
  runSt01Conformance,
  validateDependencyJustifications,
} from "../evaluation/state-replay-v0.1/st01/replay.js";

const REPOSITORY_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const FIXTURE_ROOT = join(REPOSITORY_ROOT, "evaluation/state-replay-v0.1");
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((entry) => rm(entry, { recursive: true, force: true })));
});

async function copiedFixture(): Promise<string> {
  const temporary = await mkdtemp(join(tmpdir(), "context-compiler-st01-fixture-"));
  temporaryDirectories.push(temporary);
  const fixture = join(temporary, "state-replay-v0.1");
  await cp(FIXTURE_ROOT, fixture, { recursive: true });
  return fixture;
}

describe("WO-DS-14 ST-01 reducer conformance", () => {
  it("replays all 30 steps twice and matches every frozen checkpoint", async () => {
    const report = await runSt01Conformance(REPOSITORY_ROOT);
    const committed = JSON.parse(await readFile(join(FIXTURE_ROOT, "st01/report.json"), "utf8"));
    expect(report).toEqual(committed);
    expect(report.counts).toMatchObject({
      event_step_count: 30,
      non_empty_delta_count: 28,
      empty_delta_true_negative_count: 2,
      strict_delta_valid_count: 30,
      checkpoint_match_count: 30,
      deterministic_fresh_replay_count: 2,
      model_call_count: 0,
      provider_call_count: 0,
      network_call_count: 0,
      evaluator_run_count: 0,
    });
    expect(report.relation_counts).toEqual({
      DERIVED_FROM: 53,
      SUPERSEDES: 6,
      RESOLVED_BY: 3,
      REJECTS: 3,
      DEPENDS_ON: 4,
    });
    expect(report.st02_authorized).toBe(false);
  });

  it("anchors source, Gold and checkpoints to the pre-run Git object before parsing", async () => {
    expect(TRUSTED_DS14_DATA_SOURCE).toMatchObject({
      commit: "79da83d95aeac7162c95714f4f6f5eff1f9e0608",
      parent: "aeed861b3e3c538fbf6aa1393a5745fb4d61490b",
    });
    expect(TRUSTED_DS14_DATA_SOURCE.files).toHaveLength(9);
    const source = await readFile(join(FIXTURE_ROOT, "st01/replay.ts"), "utf8");
    expect(source.indexOf("await validateFixtureGitAnchor(repositoryRoot, root);")).toBeLessThan(
      source.indexOf("const [seal, selection, events, semantic, deltas, checkpoints, gate0, coverage]"),
    );
    expect(source).toContain('execFileAsync("git", ["-C", repositoryRoot, ...args]');
    expect(source).toContain("shell: false");
  });

  it("rejects coordinated Gold/checkpoint bytes even if a copied fixture remains internally consistent", async () => {
    const fixture = await copiedFixture();
    const target = join(fixture, "gold/gold-state-checkpoints.jsonl");
    const lines = (await readFile(target, "utf8")).trimEnd().split("\n");
    const first = JSON.parse(lines[0]);
    first.expected_revision = 99;
    lines[0] = JSON.stringify(first);
    await writeFile(target, `${lines.join("\n")}\n`, "utf8");
    await expect(runSt01Conformance(REPOSITORY_ROOT, { fixture_root: fixture })).rejects.toThrow(
      /accepted_ds14_data\.gold\/gold-state-checkpoints\.jsonl: current bytes differ from fixed Git blob/,
    );
  });

  it("rejects future provenance, missing lifecycle provenance, unknown fields and duplicate semantic keys at the fixed source boundary", async () => {
    const mutations: Array<{ path: string; mutate: (text: string) => string }> = [
      {
        path: "gold/gold-deltas.jsonl",
        mutate: (text) => text.replace('"new_relations":[]}', '"new_relations":[{"source_key":"s08_q_lifespan","relation_type":"DERIVED_FROM","target_event_id":"STR-08/E4"}]}'),
      },
      {
        path: "gold/gold-state-checkpoints.jsonl",
        mutate: (text) => text.replace('["s08_decision_manual_portal","STR-08/E4"],', ""),
      },
      {
        path: "gold/gold-deltas.jsonl",
        mutate: (text) => text.replace('"step_id":"STR-08/S1"', '"step_id":"STR-08/S1","unknown":true'),
      },
      {
        path: "gold/semantic-items.json",
        mutate: (text) => text.replace('"key":"s08_q_lifespan"', '"key":"s08_goal_lifespan"'),
      },
    ];
    for (const mutation of mutations) {
      const fixture = await copiedFixture();
      const target = join(fixture, mutation.path);
      await writeFile(target, mutation.mutate(await readFile(target, "utf8")), "utf8");
      await expect(runSt01Conformance(REPOSITORY_ROOT, { fixture_root: fixture })).rejects.toThrow(/accepted_ds14_data/);
    }
  });

  it("rejects a symlinked event stream before following it", async () => {
    const fixture = await copiedFixture();
    const target = join(fixture, "source/event-stream.jsonl");
    const saved = join(fixture, "source/event-stream.saved.jsonl");
    await cp(target, saved);
    await rm(target);
    await symlink(saved, target);
    await expect(runSt01Conformance(REPOSITORY_ROOT, { fixture_root: fixture })).rejects.toThrow(/expected regular non-symlink file/);
  });

  it("keeps the Extractor-side packet boundary to prior typed state plus current event", async () => {
    const source = await readFile(join(FIXTURE_ROOT, "st01/replay.ts"), "utf8");
    expect(source).toContain("recent_context: []");
    expect(source).toContain("newest_events: [raw]");
    expect(source).toContain('filter((entry) => entry.relation_type !== "DERIVED_FROM")');
    expect(source).not.toContain("StrictStateExtractor");
    expect(source).not.toContain("runEvaluationSuite");
    expect(source).not.toContain("assembleContext");
    expect(source).not.toContain("writeFile");
  });

  it("requires every scored dependency to be justified by its own current event", async () => {
    const events = (await readFile(join(FIXTURE_ROOT, "source/event-stream.jsonl"), "utf8")).trimEnd().split("\n").map(JSON.parse);
    const deltas = (await readFile(join(FIXTURE_ROOT, "gold/gold-deltas.jsonl"), "utf8")).trimEnd().split("\n").map(JSON.parse);
    const gate0 = JSON.parse(await readFile(join(FIXTURE_ROOT, "gold/gate0-expressibility.json"), "utf8"));
    expect(() => validateDependencyJustifications(events, deltas, gate0)).not.toThrow();

    const unsupported = structuredClone(gate0);
    unsupported.dependency_justifications[0].required_current_event_anchors = ["not in this current event"];
    expect(() => validateDependencyJustifications(events, deltas, unsupported)).toThrow(/not supported by current event/);

    const delayed = structuredClone(gate0);
    delayed.dependency_justifications[0].event_id = "STR-08/E4";
    expect(() => validateDependencyJustifications(events, deltas, delayed)).toThrow(/not supported by current event|exactly cover/);
  });
});
