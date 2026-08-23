// @vitest-environment node

import { cp, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
// The checkpoint validator intentionally remains outside the publishable src/ package.
// @ts-expect-error JavaScript fixture utility has no declaration file.
import {
  buildStr07StaticEvaluationSuite,
  loadStr07Checkpoint,
  validateStr07Checkpoint,
} from "../evaluation/starlette-v1/validate-str07-checkpoint.mjs";
import { projectModelInput } from "../evaluation/starlette-v1/validate-pilot.mjs";
import { parseEvaluationSuiteV2 } from "../src/evaluation.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "evaluation", "starlette-v1");
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

async function copiedRoot(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "context-compiler-starlette-str07-"));
  temporaryDirectories.push(directory);
  await cp(ROOT, directory, { recursive: true });
  return directory;
}

async function mutateJson(root: string, relativePath: string, mutation: (value: any) => void): Promise<void> {
  const path = join(root, relativePath);
  const value = JSON.parse(await readFile(path, "utf8"));
  mutation(value);
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

describe("Starlette STR-07 source/Gold checkpoint", () => {
  it("accepts one not-frozen long checkpoint with ten audited increments", async () => {
    await expect(validateStr07Checkpoint(ROOT)).resolves.toEqual({
      schema_version: "starlette-str07-checkpoint/v1",
      status: "checkpoint_not_frozen",
      case_id: "STR-07",
      tier: "long",
      event_count: 10,
      information_increment_count: 10,
      slice_count: 10,
      source_number_count: 2,
      audited_source_count: 10,
      outcome_anchor_count: 2,
      projection_turn_count: 55,
      promotion_authorized: false,
      evaluation_ready: false,
      model_run_authorized: false,
      hashes_verified: true,
    });
  });

  it("projects exact prefixes with only the six event fields", async () => {
    const { bundle } = await loadStr07Checkpoint(ROOT);
    expect(projectModelInput(bundle, "STR-07/T3").history_turns.map((turn: any) => turn.id)).toEqual([
      "STR-07/E1", "STR-07/E2", "STR-07/E3",
    ]);
    const final = projectModelInput(bundle, "STR-07/T10");
    expect(final.history_turns).toHaveLength(10);
    for (const turn of final.history_turns) {
      expect(Object.keys(turn)).toEqual(["id", "role", "event_type", "occurred_at", "actor", "summary"]);
    }
    const projected = JSON.stringify(final);
    expect(projected).not.toContain(bundle.factGold.facts[0].statement);
    expect(projected).not.toContain(bundle.oracleState.states[0].items[0].content);
    expect(projected).not.toContain(bundle.outcomeAnchors.anchors[0].summary);
  });

  it("statically parses all ten slices through the real evaluator v2 parser", async () => {
    const { bundle } = await loadStr07Checkpoint(ROOT);
    const suite = buildStr07StaticEvaluationSuite(bundle);
    expect(() => parseEvaluationSuiteV2(suite)).not.toThrow();
    expect(suite.cases).toHaveLength(10);
    expect(suite.cases.reduce((sum: number, entry: any) => sum + entry.raw_events.length, 0)).toBe(55);
  });

  it("pins all ten GitHub sources and the unmerged PR initial commit", async () => {
    const { bundle } = await loadStr07Checkpoint(ROOT);
    expect(bundle.events.events.map((event: any) => event.source.source_id)).toEqual([
      "gh:issue:1008", "gh:issue-comment:663614196", "gh:pr:1010", "gh:pr-comment:664182957",
      "gh:issue-comment:664573918", "gh:issue-comment:664875431", "gh:issue-comment:664972962",
      "gh:issue-comment:664992297", "gh:issue-comment:665152933", "gh:issue-comment:666997766",
    ]);
    expect(bundle.events.events[2].source.commit_sha).toBe("503e95931b3be47fb606069698cc1d6558c91f33");
    expect(bundle.outcomeAnchors.anchors[0].source.commit_sha).toBeNull();
  });

  it("rejects lowering the mechanically audited long tier", async () => {
    const root = await copiedRoot();
    await mutateJson(root, "checkpoint/STR-07/manifest.json", (value) => {
      value.tier = "medium";
      value.segments[0].classification = "medium";
      value.segments[0].information_increment_event_ids = value.segments[0].information_increment_event_ids.slice(0, 8);
    });
    await expect(validateStr07Checkpoint(root)).rejects.toThrow(/every retained event must remain an audited increment|expected (?:one )?long/);
  });

  it("rejects cutoff, status, promotion, evaluation, and model authorization changes", async () => {
    const root = await copiedRoot();
    await mutateJson(root, "str07-checkpoint.json", (value) => {
      value.status = "frozen";
      value.evidence_cutoff_at = "2026-08-24T03:00:00Z";
      value.promotion_authorized = true;
      value.evaluation_ready = true;
      value.model_run_authorized = true;
    });
    await expect(validateStr07Checkpoint(root)).rejects.toThrow(/checkpoint identity changed|cutoff changed|must remain false/);
  });

  it("rejects a changed accepted contamination snapshot or wrapper reference", async () => {
    const root = await copiedRoot();
    await mutateJson(root, "promotion/contamination-snapshot.json", (value) => {
      value.results.find((entry: any) => entry.candidate_id === "STR-07").status = "confirmed";
    });
    await expect(validateStr07Checkpoint(root)).rejects.toThrow(/snapshot hash changed|contamination gate/);
  });

  it("rejects content, hash path/order, missing, duplicate, and unknown-field mutations", async () => {
    const cases: Array<(root: string) => Promise<void>> = [
      (root) => mutateJson(root, "checkpoint/STR-07/tasks.json", (value) => { value.tasks[0].current_task += " Extra."; }),
      (root) => mutateJson(root, "str07-checkpoint-hashes.json", (value) => { value.files.reverse(); }),
      (root) => mutateJson(root, "str07-checkpoint-hashes.json", (value) => { value.files.pop(); }),
      (root) => mutateJson(root, "str07-checkpoint-hashes.json", (value) => { value.files[1] = value.files[0]; }),
      (root) => mutateJson(root, "str07-checkpoint.json", (value) => { value.unregistered_policy = true; }),
    ];
    for (const mutation of cases) {
      const root = await copiedRoot();
      await mutation(root);
      await expect(validateStr07Checkpoint(root)).rejects.toThrow();
    }
  });

  it("rejects a case payload exposed through a symlink", async () => {
    const root = await copiedRoot();
    const target = join(root, "checkpoint", "STR-07", "tasks.json");
    const saved = join(root, "checkpoint", "STR-07", "tasks-saved.json");
    await cp(target, saved);
    await rm(target);
    await symlink(saved, target);
    await expect(validateStr07Checkpoint(root)).rejects.toThrow(/directory|expected regular file/);
  });

  it("rejects turning the closed-unmerged PR into a delivered patch", async () => {
    const wrapperRoot = await copiedRoot();
    await mutateJson(wrapperRoot, "str07-checkpoint.json", (value) => {
      value.outcome_assertions.pr_patch_merged = true;
      value.outcome_assertions.repository_regression_test_delivered = true;
    });
    await expect(validateStr07Checkpoint(wrapperRoot)).rejects.toThrow(/must remain false/);

    const outcomeRoot = await copiedRoot();
    await mutateJson(outcomeRoot, "checkpoint/STR-07/outcome-anchors.json", (value) => {
      value.anchors[0].source.commit_sha = "a331feb95e7c90dcf6d9c8adfcee1617c31a6426";
      value.anchors[0].limitations = "The patch and tests merged into the repository.";
    });
    await expect(validateStr07Checkpoint(outcomeRoot)).rejects.toThrow(/closed-unmerged PR boundary/);
  });

  it("rejects treating maintainer rejection or tracker close as full semantic resolution", async () => {
    const root = await copiedRoot();
    await mutateJson(root, "checkpoint/STR-07/oracle-state.json", (value) => {
      value.states.find((entry: any) => entry.slice_id === "STR-07/T6").items.find((item: any) => item.id === "STR-07/I1").status = "RESOLVED";
    });
    await expect(validateStr07Checkpoint(root)).rejects.toThrow(/cannot resolve all use cases/);
  });

  it("rejects future Gold or Outcome content copied into an early Current Task", async () => {
    const goldRoot = await copiedRoot();
    const gold = JSON.parse(await readFile(join(goldRoot, "checkpoint", "STR-07", "fact-gold.json"), "utf8"));
    await mutateJson(goldRoot, "checkpoint/STR-07/tasks.json", (tasks) => {
      tasks.tasks[0].current_task = gold.facts.at(-1).statement;
    });
    await expect(validateStr07Checkpoint(goldRoot)).rejects.toThrow(/Current Task repeats Fact Gold/);

    const outcomeRoot = await copiedRoot();
    const outcome = JSON.parse(await readFile(join(outcomeRoot, "checkpoint", "STR-07", "outcome-anchors.json"), "utf8"));
    await mutateJson(outcomeRoot, "checkpoint/STR-07/tasks.json", (tasks) => {
      tasks.tasks[0].current_task = outcome.anchors[0].summary;
    });
    await expect(validateStr07Checkpoint(outcomeRoot)).rejects.toThrow(/Outcome Anchor content/);
  });

  it("rejects semantic future-answer paraphrases in early Current Tasks", async () => {
    for (const answer of [
      "Use URI templating and a path converter instead of general regex.",
      "Register both routes directly so no redirect is required.",
      "Revert the escaping change in a larger release.",
    ]) {
      const root = await copiedRoot();
      await mutateJson(root, "checkpoint/STR-07/tasks.json", (tasks) => {
        tasks.tasks[0].current_task = answer;
      });
      await expect(validateStr07Checkpoint(root)).rejects.toThrow(/future or Outcome answer content/);
    }
  });

  it("rejects invented repository delivery or removal of issue-close limitations", async () => {
    const wrapperRoot = await copiedRoot();
    await mutateJson(wrapperRoot, "str07-checkpoint.json", (value) => {
      value.outcome_assertions.general_regex_is_supported_api = true;
      value.outcome_assertions.issue_close_proves_all_use_cases = true;
    });
    await expect(validateStr07Checkpoint(wrapperRoot)).rejects.toThrow(/must remain false/);

    const anchorRoot = await copiedRoot();
    await mutateJson(anchorRoot, "checkpoint/STR-07/outcome-anchors.json", (value) => {
      value.anchors[1].limitations = "Issue closure proves every routing use case is resolved.";
    });
    await expect(validateStr07Checkpoint(anchorRoot)).rejects.toThrow(/tracker closure limitation/);
  });
});
