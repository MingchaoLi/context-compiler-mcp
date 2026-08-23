// @vitest-environment node

import { cp, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { generateRunInputs } from "../evaluation/starlette-v1/freeze/v1/generate-run-inputs.js";
import { validateAtomicFreeze } from "../evaluation/starlette-v1/freeze/v1/validate-freeze.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "evaluation", "starlette-v1");
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

async function copiedRoot(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "context-compiler-starlette-freeze-"));
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

async function mutateJsonl(root: string, mutation: (value: any[]) => void): Promise<void> {
  const path = join(root, "freeze/v1/answer-inputs.jsonl");
  const value = (await readFile(path, "utf8")).trimEnd().split("\n").map((line) => JSON.parse(line));
  mutation(value);
  await writeFile(path, `${value.map((entry) => JSON.stringify(entry)).join("\n")}\n`, "utf8");
}

describe("Starlette atomic data, protocol, and answer-input freeze candidate", () => {
  it("accepts the fixed append-only candidate without running a model or evaluator", async () => {
    await expect(validateAtomicFreeze(ROOT)).resolves.toEqual({
      schema_version: "starlette-atomic-freeze-validation/v1",
      status: "freeze_candidate_valid_pending_independent_qa",
      canonical_file_count: 46,
      protocol_file_count: 3,
      case_count: 6,
      slice_count: 12,
      packet_count: 36,
      blind_eligible_case_count: 6,
      model_call_count: 0,
      evaluation_run_count: 0,
      model_run_authorized: false,
    });
  });

  it("rebuilds exactly 36 opaque packets from the real D0/D1 renderer and D2 assembler", async () => {
    const generated = await generateRunInputs(ROOT);
    expect(generated.answerInputs).toHaveLength(36);
    expect(generated.packetManifest.packets).toHaveLength(36);
    expect(generated.packetManifest.execution_order).toHaveLength(36);
    expect(new Set(generated.packetManifest.execution_order)).toHaveLength(36);
    expect(generated.packetManifest.packets.filter((entry: any) => entry.condition === "d2")).toHaveLength(12);
    expect(generated.packetManifest.packets.filter((entry: any) => entry.oracle_state_upper_bound)).toHaveLength(12);
    for (const packet of generated.answerInputs) {
      expect(packet.packet_id).toMatch(/^pkt_[a-f0-9]{20}$/);
      expect(packet.user_prompt).not.toMatch(/STR-\d{2}\/T\d+|\b(?:case_id|slice_id|condition)\b\s*[:=]/iu);
      expect(packet.user_prompt).not.toMatch(/Fact Gold|Decision Reference|Outcome Anchor|answer_checklist|required_items|forbidden_items/iu);
    }
  });

  it.each([
    ["confirmed contamination", async (root: string) => mutateJson(root, "freeze/v1/contamination-snapshot-pre-run.json", (value) => {
      value.results[0].status = "confirmed";
      value.results[0].blind_eligibility = false;
      value.results[0].direct_evidence = [{ url: "https://example.invalid/task", classification: "task_reuse" }];
    })],
    ["sol model substitution", async (root: string) => mutateJson(root, "freeze/v1/run-contract.json", (value) => {
      value.transport.model_alias = "gpt-5.6-sol";
    })],
    ["adaptive retry", async (root: string) => mutateJson(root, "freeze/v1/run-contract.json", (value) => {
      value.attempt_policy.adaptive_retry_allowed = true;
      value.attempt_policy.attempts_per_cell = 2;
    })],
    ["model authorization", async (root: string) => mutateJson(root, "freeze/v1/freeze-manifest.json", (value) => {
      value.authorization.model_run_authorized_by_this_manifest = true;
      value.authorization.model_calls_in_builder_work_order = 36;
    })],
    ["case reselection", async (root: string) => mutateJson(root, "freeze/v1/freeze-manifest.json", (value) => {
      value.selection.slice_order[0] = "STR-07/T5";
    })],
    ["packet condition swap", async (root: string) => mutateJson(root, "freeze/v1/packet-manifest.json", (value) => {
      [value.packets[0].condition, value.packets[1].condition] = [value.packets[1].condition, value.packets[0].condition];
    })],
    ["packet omission", async (root: string) => mutateJson(root, "freeze/v1/packet-manifest.json", (value) => {
      value.packets.pop();
      value.execution_order.pop();
      value.counts.packet_count = 35;
    })],
    ["condition label leak", async (root: string) => mutateJsonl(root, (value) => {
      value[0].user_prompt = `Condition: D2\n${value[0].user_prompt}`;
    })],
    ["zero-width prompt leak", async (root: string) => mutateJsonl(root, (value) => {
      value[0].user_prompt = `Con\u200Bdition: D2\n${value[0].user_prompt}`;
    })],
    ["unknown freeze field", async (root: string) => mutateJson(root, "freeze/v1/freeze-manifest.json", (value) => {
      value.rewrite_allowed = true;
    })],
  ])("rejects %s before model/evaluator execution", async (_label, mutation) => {
    const root = await copiedRoot();
    await mutation(root);
    await expect(validateAtomicFreeze(root)).rejects.toThrow(/fixed freeze file contract changed/);
  });

  it("rejects coordinated protocol, protocol-hash, and freeze-wrapper rewriting", async () => {
    const root = await copiedRoot();
    await mutateJson(root, "protocol-canary/protocol.json", (value) => {
      value.authorization.model_run_authorized = true;
    });
    await mutateJson(root, "protocol-canary/protocol-hashes.json", (value) => {
      value.files.find((entry: any) => entry.path.endsWith("protocol.json")).sha256 = "0".repeat(64);
    });
    await mutateJson(root, "freeze/v1/freeze-manifest.json", (value) => {
      value.protocol.expanded_files.find((entry: any) => entry.path.endsWith("protocol.json")).sha256 = "0".repeat(64);
      value.protocol.hash_manifest_sha256 = "0".repeat(64);
    });
    await expect(validateAtomicFreeze(root)).rejects.toThrow(/fixed protocol candidate hash changed/);
  });

  it("rejects a frozen packet file exposed through a symlink", async () => {
    const root = await copiedRoot();
    const target = join(root, "freeze/v1/answer-inputs.jsonl");
    const saved = join(root, "freeze/v1/answer-inputs-saved.jsonl");
    await cp(target, saved);
    await rm(target);
    await symlink(saved, target);
    await expect(validateAtomicFreeze(root)).rejects.toThrow(/expected regular file/);
  });
});
