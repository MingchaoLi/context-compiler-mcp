// @vitest-environment node

import { cp, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
// The checkpoint validator intentionally remains outside the publishable src/ package.
// @ts-expect-error JavaScript fixture utility has no declaration file.
import {
  buildStr01StaticEvaluationSuite,
  loadStr01Checkpoint,
  validateStr01Checkpoint,
} from "../evaluation/starlette-v1/validate-str01-checkpoint.mjs";
import { projectModelInput } from "../evaluation/starlette-v1/validate-pilot.mjs";
import { parseEvaluationSuiteV2 } from "../src/evaluation.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "evaluation", "starlette-v1");
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

async function copiedRoot(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "context-compiler-starlette-str01-"));
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

describe("Starlette STR-01 source/Gold checkpoint", () => {
  it("accepts one not-frozen long checkpoint with eighteen audited increments", async () => {
    await expect(validateStr01Checkpoint(ROOT)).resolves.toEqual({
      schema_version: "starlette-str01-checkpoint/v1",
      status: "checkpoint_not_frozen",
      case_id: "STR-01",
      tier: "long",
      event_count: 18,
      information_increment_count: 18,
      slice_count: 18,
      source_number_count: 3,
      audited_source_count: 18,
      state_canonical_hash_count: 3,
      outcome_anchor_count: 4,
      projection_turn_count: 171,
      promotion_authorized: false,
      evaluation_ready: false,
      model_run_authorized: false,
      hashes_verified: true,
    });
  });

  it("projects exact prefixes with only the six event fields", async () => {
    const { bundle } = await loadStr01Checkpoint(ROOT);
    expect(projectModelInput(bundle, "STR-01/T4").history_turns.map((turn: any) => turn.id)).toEqual([
      "STR-01/E1", "STR-01/E2", "STR-01/E3", "STR-01/E4",
    ]);
    const final = projectModelInput(bundle, "STR-01/T18");
    expect(final.history_turns).toHaveLength(18);
    for (const turn of final.history_turns) {
      expect(Object.keys(turn)).toEqual(["id", "role", "event_type", "occurred_at", "actor", "summary"]);
    }
    const projected = JSON.stringify(final);
    expect(projected).not.toContain(bundle.factGold.facts[0].statement);
    expect(projected).not.toContain(bundle.oracleState.states[0].items[0].content);
    expect(projected).not.toContain(bundle.outcomeAnchors.anchors[0].summary);
  });

  it("statically parses all eighteen slices through the real evaluator v2 parser", async () => {
    const { bundle } = await loadStr01Checkpoint(ROOT);
    const suite = buildStr01StaticEvaluationSuite(bundle);
    expect(() => parseEvaluationSuiteV2(suite)).not.toThrow();
    expect(suite.cases).toHaveLength(18);
    expect(suite.cases.reduce((sum: number, entry: any) => sum + entry.raw_events.length, 0)).toBe(171);
  });

  it("pins all sources, the rejected initial commit, review commit, approval head, and merge commit", async () => {
    const { bundle } = await loadStr01Checkpoint(ROOT);
    expect(bundle.events.events).toHaveLength(18);
    expect(bundle.events.events[2].source.commit_sha).toBe("d388e06d16db09931e424db6ba767317393da17b");
    expect(bundle.events.events[7].source.commit_sha).toBeNull();
    expect(bundle.events.events[13].source.commit_sha).toBe("ec382274541720a688131053ec7247c4c5965f8d");
    expect(bundle.events.events[15].source.commit_sha).toBe("68efb83cf38784be7e89e0583923dca2055b733b");
    expect(bundle.events.events[16].source.commit_sha).toBe("554b9e21f6161a6d83b4ebb90909282114266317");
  });

  it("rejects lowering the mechanically audited long tier or omitting increments", async () => {
    const root = await copiedRoot();
    await mutateJson(root, "checkpoint/STR-01/manifest.json", (value) => {
      value.tier = "medium";
      value.segments[0].classification = "medium";
      value.segments[0].information_increment_event_ids = value.segments[0].information_increment_event_ids.slice(0, 8);
    });
    await expect(validateStr01Checkpoint(root)).rejects.toThrow(/every retained event|expected one long/);
  });

  it("rejects cutoff, status, promotion, evaluation, and model authorization changes", async () => {
    const root = await copiedRoot();
    await mutateJson(root, "str01-checkpoint.json", (value) => {
      value.status = "frozen";
      value.evidence_cutoff_at = "2026-08-24T03:00:00Z";
      value.promotion_authorized = true;
      value.evaluation_ready = true;
      value.model_run_authorized = true;
    });
    await expect(validateStr01Checkpoint(root)).rejects.toThrow(/checkpoint identity changed|cutoff changed|must remain false/);
  });

  it("rejects a changed accepted contamination snapshot", async () => {
    const root = await copiedRoot();
    await mutateJson(root, "promotion/contamination-snapshot.json", (value) => {
      value.results.find((entry: any) => entry.candidate_id === "STR-01").status = "confirmed";
    });
    await expect(validateStr01Checkpoint(root)).rejects.toThrow(/snapshot hash changed|contamination gate/);
  });

  it("rejects content, hash order, missing, duplicate, unknown-field, and symlink mutations", async () => {
    const cases: Array<(root: string) => Promise<void>> = [
      (root) => mutateJson(root, "checkpoint/STR-01/tasks.json", (value) => { value.tasks[0].current_task += " Extra."; }),
      (root) => mutateJson(root, "str01-checkpoint-hashes.json", (value) => { value.files.reverse(); }),
      (root) => mutateJson(root, "str01-checkpoint-hashes.json", (value) => { value.files.pop(); }),
      (root) => mutateJson(root, "str01-checkpoint-hashes.json", (value) => { value.files[1] = value.files[0]; }),
      (root) => mutateJson(root, "str01-checkpoint.json", (value) => { value.unregistered_policy = true; }),
    ];
    for (const mutation of cases) {
      const root = await copiedRoot();
      await mutation(root);
      await expect(validateStr01Checkpoint(root)).rejects.toThrow();
    }
    const symlinkRoot = await copiedRoot();
    const target = join(symlinkRoot, "checkpoint", "STR-01", "tasks.json");
    const saved = join(symlinkRoot, "checkpoint", "STR-01", "tasks-saved.json");
    await cp(target, saved);
    await rm(target);
    await symlink(saved, target);
    await expect(validateStr01Checkpoint(symlinkRoot)).rejects.toThrow(/directory|expected regular file/);
  });

  it("rejects rewriting PR 500 as merged or repository-delivered", async () => {
    const wrapperRoot = await copiedRoot();
    await mutateJson(wrapperRoot, "str01-checkpoint.json", (value) => {
      value.outcome_assertions.pr500_patch_merged = true;
      value.outcome_assertions.pr500_repository_test_delivered = true;
    });
    await expect(validateStr01Checkpoint(wrapperRoot)).rejects.toThrow(/must remain false/);

    const anchorRoot = await copiedRoot();
    await mutateJson(anchorRoot, "checkpoint/STR-01/outcome-anchors.json", (value) => {
      value.anchors[0].source.commit_sha = "bf31568b25a00bdfaebcd5e1f2eb9ba1ea4882d7";
      value.anchors[0].limitations = "The patch and test merged into Starlette.";
    });
    await expect(validateStr01Checkpoint(anchorRoot)).rejects.toThrow(/PR 500 closed-unmerged boundary/);
  });

  it("rejects turning PR 1692 into general replay or treating tracker close as universal resolution", async () => {
    const wrapperRoot = await copiedRoot();
    await mutateJson(wrapperRoot, "str01-checkpoint.json", (value) => {
      value.outcome_assertions.pr1692_is_general_body_replay = true;
      value.outcome_assertions.endpoint_first_reread_supported = true;
      value.outcome_assertions.exception_handler_reread_supported = true;
      value.outcome_assertions.issue_close_proves_all_body_ownership_cases = true;
    });
    await expect(validateStr01Checkpoint(wrapperRoot)).rejects.toThrow(/must remain false/);

    const stateRoot = await copiedRoot();
    await mutateJson(stateRoot, "checkpoint/STR-01/oracle-state.json", (value) => {
      value.states.at(-1).items.find((item: any) => item.id === "STR-01/I10").status = "SUPERSEDED";
    });
    await expect(validateStr01Checkpoint(stateRoot)).rejects.toThrow(/final durable state missing/);
  });

  it("rejects current PR body, final title, and outcome facts backfilled into early tasks", async () => {
    for (const answer of [
      "Reuse the body buffer for call_next in BaseHTTPMiddleware.",
      "Endpoint-first and exception-handler rereads require information upstream.",
      "The multi-chunk bug is fixed by marking consumed only when more_body is false.",
      "The corrected final head was formally approved.",
      "The merged patch is repository-delivered as 554b9e2.",
    ]) {
      const root = await copiedRoot();
      await mutateJson(root, "checkpoint/STR-01/tasks.json", (tasks) => { tasks.tasks[0].current_task = answer; });
      await expect(validateStr01Checkpoint(root)).rejects.toThrow(/future or Outcome answer content/);
    }
  });

  it("rejects future Gold or Outcome text copied into an early Current Task", async () => {
    const goldRoot = await copiedRoot();
    const gold = JSON.parse(await readFile(join(goldRoot, "checkpoint", "STR-01", "fact-gold.json"), "utf8"));
    await mutateJson(goldRoot, "checkpoint/STR-01/tasks.json", (tasks) => { tasks.tasks[0].current_task = gold.facts.at(-1).statement; });
    await expect(validateStr01Checkpoint(goldRoot)).rejects.toThrow(/Current Task repeats Fact Gold/);

    const outcomeRoot = await copiedRoot();
    const outcome = JSON.parse(await readFile(join(outcomeRoot, "checkpoint", "STR-01", "outcome-anchors.json"), "utf8"));
    await mutateJson(outcomeRoot, "checkpoint/STR-01/tasks.json", (tasks) => { tasks.tasks[0].current_task = outcome.anchors[1].summary; });
    await expect(validateStr01Checkpoint(outcomeRoot)).rejects.toThrow(/Outcome Anchor content/);
  });

  it("rejects mutable creation data and canonical timeline rewrites", async () => {
    const creationRoot = await copiedRoot();
    await mutateJson(creationRoot, "checkpoint/STR-01/events.json", (value) => {
      value.events[7].summary = "PR 1692 opens with the final call_next design, complete tests, and merge-ready implementation.";
    });
    await expect(validateStr01Checkpoint(creationRoot)).rejects.toThrow(/checkpoint content hash mismatch|source event/);

    const stateRoot = await copiedRoot();
    await mutateJson(stateRoot, "checkpoint/STR-01/events.json", (value) => {
      value.events[16].source.commit_sha = null;
      value.events[16].source_content_sha256 = "0".repeat(64);
    });
    await expect(validateStr01Checkpoint(stateRoot)).rejects.toThrow(/source contract|canonical timeline/);
  });
});
