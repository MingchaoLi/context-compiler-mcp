// @vitest-environment node

import { cp, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
// The checkpoint validator intentionally remains outside the publishable src/ package.
// @ts-expect-error JavaScript fixture utility has no declaration file.
import {
  loadStr06Checkpoint,
  validateStr06Checkpoint,
} from "../evaluation/starlette-v1/validate-str06-checkpoint.mjs";
import { hashIssueStateEvent, projectModelInput } from "../evaluation/starlette-v1/validate-pilot.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "evaluation", "starlette-v1");
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

async function copiedRoot(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "context-compiler-starlette-str06-"));
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

describe("Starlette STR-06 source/Gold checkpoint", () => {
  it("accepts one not-frozen long checkpoint with sixteen audited increments", async () => {
    await expect(validateStr06Checkpoint(ROOT)).resolves.toEqual({
      schema_version: "starlette-str06-checkpoint/v1",
      status: "checkpoint_not_frozen",
      case_id: "STR-06",
      tier: "long",
      event_count: 16,
      information_increment_count: 16,
      slice_count: 16,
      source_number_count: 3,
      state_canonical_hash_count: 3,
      outcome_anchor_count: 2,
      projection_turn_count: 136,
      promotion_authorized: false,
      evaluation_ready: false,
      model_run_authorized: false,
      hashes_verified: true,
    });
  });

  it("projects exact prefixes with only the six event fields", async () => {
    const { bundle } = await loadStr06Checkpoint(ROOT);
    const early = projectModelInput(bundle, "STR-06/T3");
    expect(early.history_turns.map((turn: any) => turn.id)).toEqual(["STR-06/E1", "STR-06/E2", "STR-06/E3"]);
    const final = projectModelInput(bundle, "STR-06/T16");
    expect(final.history_turns).toHaveLength(16);
    for (const turn of final.history_turns) {
      expect(Object.keys(turn)).toEqual(["id", "role", "event_type", "occurred_at", "actor", "summary"]);
    }
    const projected = JSON.stringify(final);
    expect(projected).not.toContain(bundle.factGold.facts[0].statement);
    expect(projected).not.toContain(bundle.oracleState.states[0].items[0].content);
    expect(projected).not.toContain(bundle.outcomeAnchors.anchors[0].source.commit_sha);
  });

  it("pins all three state events to canonical REST subsets", async () => {
    const { bundle } = await loadStr06Checkpoint(ROOT);
    const expected = [
      ["STR-06/E7", 5784383679, "closed", null],
      ["STR-06/E13", 5890858859, "reopened", null],
      ["STR-06/E16", 5893584617, "closed", null],
    ];
    for (const [eventId, id, state, commitId] of expected) {
      const event = bundle.events.events.find((entry: any) => entry.id === eventId);
      expect(hashIssueStateEvent({
        id,
        node_id: event.source.node_id,
        event: state,
        actor: event.actor,
        created_at: event.occurred_at,
        commit_id: commitId,
      })).toBe(event.source_content_sha256);
    }
  });

  it("rejects merge SHAs injected into null-commit close events", async () => {
    for (const [eventId, mergeSha] of [
      ["STR-06/E7", "0aef1724cfafbe23f846979d427a5a173667f6b7"],
      ["STR-06/E16", "7d79ad96d5aaee71f16ac9f4e41072e81d18ab86"],
    ]) {
      const root = await copiedRoot();
      await mutateJson(root, "checkpoint/STR-06/events.json", (value) => {
        value.events.find((entry: any) => entry.id === eventId).source.commit_sha = mergeSha;
      });
      await expect(validateStr06Checkpoint(root)).rejects.toThrow(/state canonical contract changed/);
    }
  });

  it("rejects lowering the mechanically audited long tier", async () => {
    const root = await copiedRoot();
    await mutateJson(root, "checkpoint/STR-06/manifest.json", (value) => {
      value.tier = "medium";
      value.segments[0].classification = "medium";
      value.segments[0].information_increment_event_ids = value.segments[0].information_increment_event_ids.slice(0, 8);
    });
    await expect(validateStr06Checkpoint(root)).rejects.toThrow(/every retained event must remain an audited increment|expected one long segment/);
  });

  it("rejects cutoff, status, promotion, evaluation, and model authorization changes", async () => {
    const root = await copiedRoot();
    await mutateJson(root, "str06-checkpoint.json", (value) => {
      value.status = "frozen";
      value.evidence_cutoff_at = "2026-08-24T03:00:00Z";
      value.promotion_authorized = true;
      value.evaluation_ready = true;
      value.model_run_authorized = true;
    });
    await expect(validateStr06Checkpoint(root)).rejects.toThrow(/checkpoint identity changed|cutoff changed|must remain false/);
  });

  it("rejects a changed accepted contamination snapshot or wrapper reference", async () => {
    const root = await copiedRoot();
    await mutateJson(root, "promotion/contamination-snapshot.json", (value) => {
      value.results.find((entry: any) => entry.candidate_id === "STR-06").status = "confirmed";
    });
    await expect(validateStr06Checkpoint(root)).rejects.toThrow(/snapshot hash changed|contamination gate/);
  });

  it("rejects content, hash path/order, missing, duplicate, and unknown-field mutations", async () => {
    const cases: Array<(root: string) => Promise<void>> = [
      (root) => mutateJson(root, "checkpoint/STR-06/tasks.json", (value) => { value.tasks[0].current_task += " Extra."; }),
      (root) => mutateJson(root, "str06-checkpoint-hashes.json", (value) => { value.files.reverse(); }),
      (root) => mutateJson(root, "str06-checkpoint-hashes.json", (value) => { value.files.pop(); }),
      (root) => mutateJson(root, "str06-checkpoint-hashes.json", (value) => { value.files[1] = value.files[0]; }),
      (root) => mutateJson(root, "str06-checkpoint.json", (value) => { value.unregistered_policy = true; }),
    ];
    for (const mutation of cases) {
      const root = await copiedRoot();
      await mutation(root);
      await expect(validateStr06Checkpoint(root)).rejects.toThrow();
    }
  });

  it("rejects a case payload exposed through a symlink", async () => {
    const root = await copiedRoot();
    const target = join(root, "checkpoint", "STR-06", "tasks.json");
    const saved = join(root, "checkpoint", "STR-06", "tasks-saved.json");
    await cp(target, saved);
    await rm(target);
    await symlink(saved, target);
    await expect(validateStr06Checkpoint(root)).rejects.toThrow(/directory|expected regular file/);
  });

  it("rejects merge-to-verified and close-to-resolved semantic shortcuts", async () => {
    const first = await copiedRoot();
    await mutateJson(first, "checkpoint/STR-06/oracle-state.json", (value) => {
      value.states.find((entry: any) => entry.slice_id === "STR-06/T7").items.find((item: any) => item.id === "STR-06/I6").status = "RESOLVED";
    });
    await expect(validateStr06Checkpoint(first)).rejects.toThrow(/first tracker close must remain behavior-unverified/);

    const second = await copiedRoot();
    await mutateJson(second, "checkpoint/STR-06/fact-gold.json", (value) => {
      value.facts.find((entry: any) => entry.id === "STR-06/F16").category = "resolved_issue";
    });
    await expect(validateStr06Checkpoint(second)).rejects.toThrow(/must not be encoded as semantic resolution/);
  });

  it("rejects future Gold or Outcome content copied into an early Current Task", async () => {
    const goldRoot = await copiedRoot();
    const gold = JSON.parse(await readFile(join(goldRoot, "checkpoint", "STR-06", "fact-gold.json"), "utf8"));
    await mutateJson(goldRoot, "checkpoint/STR-06/tasks.json", (tasks) => {
      tasks.tasks[0].current_task = gold.facts.at(-1).statement;
    });
    await expect(validateStr06Checkpoint(goldRoot)).rejects.toThrow(/Current Task repeats Fact Gold/);

    const outcomeRoot = await copiedRoot();
    const outcome = JSON.parse(await readFile(join(outcomeRoot, "checkpoint", "STR-06", "outcome-anchors.json"), "utf8"));
    await mutateJson(outcomeRoot, "checkpoint/STR-06/tasks.json", (tasks) => {
      tasks.tasks[0].current_task = outcome.anchors[1].summary;
    });
    await expect(validateStr06Checkpoint(outcomeRoot)).rejects.toThrow(/Outcome Anchor content/);
  });

  it("rejects invented regression tests or removal of FIPS limitations", async () => {
    const wrapperRoot = await copiedRoot();
    await mutateJson(wrapperRoot, "str06-checkpoint.json", (value) => {
      value.outcome_assertions.regression_test_present = true;
      value.outcome_assertions.fips_runtime_verified = true;
    });
    await expect(validateStr06Checkpoint(wrapperRoot)).rejects.toThrow(/must remain false/);

    const anchorRoot = await copiedRoot();
    await mutateJson(anchorRoot, "checkpoint/STR-06/outcome-anchors.json", (value) => {
      value.anchors[1].limitations = "The merge proves all target behavior.";
    });
    await expect(validateStr06Checkpoint(anchorRoot)).rejects.toThrow(/outcome limitation/);
  });
});
