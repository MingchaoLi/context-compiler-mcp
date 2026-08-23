// @vitest-environment node

import { createHash } from "node:crypto";
import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
// @ts-expect-error JavaScript fixture utility has no declaration file.
import { validateFeasibilityCapture } from "../evaluation/starlette-v1/runs/feasibility-01/validate-capture.mjs";

const REPOSITORY_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

async function copiedRepository(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "context-compiler-starlette-answer-capture-"));
  temporaryDirectories.push(root);
  await mkdir(join(root, "evaluation"), { recursive: true });
  await mkdir(join(root, "docs/qa"), { recursive: true });
  await cp(join(REPOSITORY_ROOT, "evaluation/starlette-v1"), join(root, "evaluation/starlette-v1"), { recursive: true });
  await cp(
    join(REPOSITORY_ROOT, "docs/qa/WO-DS-11-starlette-atomic-freeze-run-gate.md"),
    join(root, "docs/qa/WO-DS-11-starlette-atomic-freeze-run-gate.md"),
  );
  return root;
}

describe("Starlette feasibility-01 answer capture", () => {
  it("accepts exactly 36 unscored fresh-session captures in frozen order", async () => {
    await expect(validateFeasibilityCapture(REPOSITORY_ROOT)).resolves.toEqual({
      schema_version: "starlette-answer-capture-validation/v1",
      status: "capture_valid_unscored_pending_independent_qa",
      packet_count: 36,
      session_count: 36,
      attempt_count: 36,
      captured_count: 36,
      invalid_response_format_count: 0,
      technical_failure_count: 0,
      external_information_use_observed_count: 0,
      evaluator_run_count: 0,
      semantic_scoring_performed: false,
    });
  });

  it("rejects swapped response order even if the capture hash manifest is rewritten", async () => {
    const root = await copiedRepository();
    const runRoot = join(root, "evaluation/starlette-v1/runs/feasibility-01");
    const responsePath = join(runRoot, "raw-responses.jsonl");
    const lines = (await readFile(responsePath, "utf8")).trimEnd().split("\n");
    [lines[0], lines[1]] = [lines[1]!, lines[0]!];
    await writeFile(responsePath, `${lines.join("\n")}\n`, "utf8");
    const captureHashPath = join(runRoot, "capture-hashes.json");
    const captureHashes = JSON.parse(await readFile(captureHashPath, "utf8"));
    captureHashes.files.find((entry: any) => entry.path === "raw-responses.jsonl").sha256 = createHash("sha256")
      .update(await readFile(responsePath))
      .digest("hex");
    await writeFile(captureHashPath, `${JSON.stringify(captureHashes, null, 2)}\n`, "utf8");
    await expect(validateFeasibilityCapture(root)).rejects.toThrow(/raw-responses\.jsonl: fixed value changed/);
  });

  it("rejects mutation of the accepted DS-11 answer-input freeze", async () => {
    const root = await copiedRepository();
    const inputPath = join(root, "evaluation/starlette-v1/freeze/v1/answer-inputs.jsonl");
    const input = await readFile(inputPath, "utf8");
    await writeFile(inputPath, input.replace("Opaque packet:", "Changed packet:"), "utf8");
    await expect(validateFeasibilityCapture(root)).rejects.toThrow(/answer-inputs\.jsonl: fixed value changed/);
  });

  it("rejects a capture artifact exposed through a symlink", async () => {
    const root = await copiedRepository();
    const runRoot = join(root, "evaluation/starlette-v1/runs/feasibility-01");
    const target = join(runRoot, "raw-responses.jsonl");
    const saved = join(runRoot, "raw-responses-saved.jsonl");
    await cp(target, saved);
    await rm(target);
    await symlink(saved, target);
    await expect(validateFeasibilityCapture(root)).rejects.toThrow(/expected regular file/);
  });
});
