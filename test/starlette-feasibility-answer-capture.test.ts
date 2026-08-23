// @vitest-environment node

import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
// @ts-expect-error JavaScript fixture utility has no declaration file.
import {
  TRUSTED_CAPTURE_SOURCE,
  validateFeasibilityCapture,
} from "../evaluation/starlette-v1/runs/feasibility-01/validate-capture.mjs";

const REPOSITORY_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const execFileAsync = promisify(execFile);
const temporaryDirectories: string[] = [];
let importCounter = 0;

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

async function sha256File(path: string): Promise<string> {
  return createHash("sha256").update(await readFile(path)).digest("hex");
}

async function importCopiedValidator(root: string): Promise<any> {
  const path = join(root, "evaluation/starlette-v1/runs/feasibility-01/validate-capture.mjs");
  return import(`${pathToFileURL(path).href}?attack=${importCounter++}`);
}

describe("Starlette feasibility-01 answer capture", () => {
  it("accepts exactly 36 unscored fresh-session captures in frozen order", async () => {
    await expect(validateFeasibilityCapture(REPOSITORY_ROOT)).resolves.toEqual({
      schema_version: "starlette-answer-capture-validation/v1",
      status: "capture_valid_unscored_pending_independent_qa",
      accepted_git_source_commit: "18a332fd06d7ebdfc8c0007ae1e9250db14c82cf",
      git_object_anchor_verified: true,
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
    captureHashes.current_payload_files.find((entry: any) => entry.path === "raw-responses.jsonl").sha256 = await sha256File(responsePath);
    await writeFile(captureHashPath, `${JSON.stringify(captureHashes, null, 2)}\n`, "utf8");
    await expect(validateFeasibilityCapture(root, { anchor_repository_root: REPOSITORY_ROOT })).rejects.toThrow(
      /accepted_git_source\.raw_responses: current bytes differ from fixed capture-source Git blob/,
    );
  });

  it("rejects mutation of the accepted DS-11 answer-input freeze", async () => {
    const root = await copiedRepository();
    const inputPath = join(root, "evaluation/starlette-v1/freeze/v1/answer-inputs.jsonl");
    const input = await readFile(inputPath, "utf8");
    await writeFile(inputPath, input.replace("Opaque packet:", "Changed packet:"), "utf8");
    await expect(validateFeasibilityCapture(root, { anchor_repository_root: REPOSITORY_ROOT })).rejects.toThrow(
      /answer-inputs\.jsonl: fixed value changed/,
    );
  });

  it("rejects a capture artifact exposed through a symlink", async () => {
    const root = await copiedRepository();
    const runRoot = join(root, "evaluation/starlette-v1/runs/feasibility-01");
    const target = join(runRoot, "raw-responses.jsonl");
    const saved = join(runRoot, "raw-responses-saved.jsonl");
    await cp(target, saved);
    await rm(target);
    await symlink(saved, target);
    await expect(validateFeasibilityCapture(root, { anchor_repository_root: REPOSITORY_ROOT })).rejects.toThrow(/expected regular file/);
  });

  it("rejects coordinated raw, record hash, current hash, validator constant, and capture-hash rewriting at the Git-object anchor", async () => {
    const root = await copiedRepository();
    const runRoot = join(root, "evaluation/starlette-v1/runs/feasibility-01");
    const responsePath = join(runRoot, "raw-responses.jsonl");
    const records = (await readFile(responsePath, "utf8")).trimEnd().split("\n").map((line) => JSON.parse(line));
    records[0].raw_assistant_output += " ";
    records[0].response_sha256 = createHash("sha256").update(records[0].raw_assistant_output).digest("hex");
    await writeFile(responsePath, `${records.map((entry) => JSON.stringify(entry)).join("\n")}\n`, "utf8");

    const captureHashPath = join(runRoot, "capture-hashes.json");
    const captureHashes = JSON.parse(await readFile(captureHashPath, "utf8"));
    const rewrittenRawHash = await sha256File(responsePath);
    captureHashes.status = "coordinated-bootstrap-mutated";
    captureHashes.accepted_git_source_contract.files.find((entry: any) => entry.path.endsWith("raw-responses.jsonl")).sha256 = rewrittenRawHash;
    captureHashes.current_payload_files.find((entry: any) => entry.path === "raw-responses.jsonl").sha256 = rewrittenRawHash;
    await writeFile(captureHashPath, `${JSON.stringify(captureHashes, null, 2)}\n`, "utf8");

    const validatorPath = join(runRoot, "validate-capture.mjs");
    const validator = (await readFile(validatorPath, "utf8"))
      .replace(
        'const CAPTURE_HASH_STATUS = "captured_unscored_pending_independent_qa";',
        'const CAPTURE_HASH_STATUS = "coordinated-bootstrap-mutated";',
      )
      .replace(
        `raw_responses_sha256: "${TRUSTED_CAPTURE_SOURCE.raw_responses_sha256}"`,
        `raw_responses_sha256: "${rewrittenRawHash}"`,
      );
    await writeFile(validatorPath, validator, "utf8");
    const attacked = await importCopiedValidator(root);
    await expect(attacked.validateFeasibilityCapture(root, { anchor_repository_root: REPOSITORY_ROOT })).rejects.toThrow(
      /accepted_git_source\.raw_responses\.sha256: fixed value changed/,
    );
  });

  it("rejects coordinated run purpose, status, authorization, boundaries, validator, and capture-hash rewriting at the Git-object anchor", async () => {
    const root = await copiedRepository();
    const runRoot = join(root, "evaluation/starlette-v1/runs/feasibility-01");
    const manifestPath = join(runRoot, "run-manifest.json");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    manifest.purpose = "coordinated-bootstrap-purpose";
    manifest.status = "coordinated-bootstrap-status";
    manifest.authorization = { automatic_metrics_authorized: true };
    manifest.collection_boundaries.evaluator_run_count = 1;
    manifest.collection_boundaries.answers_are_unscored_artifacts = false;
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

    const captureHashPath = join(runRoot, "capture-hashes.json");
    const captureHashes = JSON.parse(await readFile(captureHashPath, "utf8"));
    const rewrittenManifestHash = await sha256File(manifestPath);
    captureHashes.accepted_git_source_contract.files.find((entry: any) => entry.path.endsWith("run-manifest.json")).sha256 = rewrittenManifestHash;
    captureHashes.current_payload_files.find((entry: any) => entry.path === "run-manifest.json").sha256 = rewrittenManifestHash;
    await writeFile(captureHashPath, `${JSON.stringify(captureHashes, null, 2)}\n`, "utf8");

    const validatorPath = join(runRoot, "validate-capture.mjs");
    const validator = (await readFile(validatorPath, "utf8"))
      .replace(
        'const RUN_MANIFEST_STATUS = "captured_unscored_pending_independent_qa";',
        'const RUN_MANIFEST_STATUS = "coordinated-bootstrap-status";',
      )
      .replace(
        'const RUN_MANIFEST_PURPOSE = "single_repetition_feasibility_answer_collection_only";',
        'const RUN_MANIFEST_PURPOSE = "coordinated-bootstrap-purpose";',
      )
      .replace('"status_counts", "transport_metadata", "collection_boundaries", "interpretation_limits",', '"status_counts", "transport_metadata", "collection_boundaries", "interpretation_limits", "authorization",')
      .replace(
        `run_manifest_sha256: "${TRUSTED_CAPTURE_SOURCE.run_manifest_sha256}"`,
        `run_manifest_sha256: "${rewrittenManifestHash}"`,
      );
    await writeFile(validatorPath, validator, "utf8");
    const attacked = await importCopiedValidator(root);
    await expect(attacked.validateFeasibilityCapture(root, { anchor_repository_root: REPOSITORY_ROOT })).rejects.toThrow(
      /accepted_git_source\.run_manifest\.sha256: fixed value changed/,
    );
  });

  it("exposes the fixed code identity and independently verifies the trusted capture-source lineage and blobs", async () => {
    expect(TRUSTED_CAPTURE_SOURCE).toEqual({
      commit: "18a332fd06d7ebdfc8c0007ae1e9250db14c82cf",
      parent: "b99bb4fefe0284f26f00271b3c32839b0cddfd43",
      raw_responses_path: "evaluation/starlette-v1/runs/feasibility-01/raw-responses.jsonl",
      raw_responses_sha256: "1b574d4c1843a283d088cc641523855e78135516545a264c4fe48d5e059a4910",
      run_manifest_path: "evaluation/starlette-v1/runs/feasibility-01/run-manifest.json",
      run_manifest_sha256: "674ab5a80074c7ce52f76c1491ba1ce428a133fdf14212445f68a3a9f90c9ed0",
    });
    const validatorSource = await readFile(
      join(REPOSITORY_ROOT, "evaluation/starlette-v1/runs/feasibility-01/validate-capture.mjs"),
      "utf8",
    );
    const anchorCallIndex = validatorSource.indexOf("await validateAcceptedGitSource(anchorRepositoryRoot, runRoot);");
    const currentJsonReadIndex = validatorSource.indexOf("const [packetManifest, records, runManifest, captureHashes]");
    expect(anchorCallIndex).toBeGreaterThan(-1);
    expect(currentJsonReadIndex).toBeGreaterThan(anchorCallIndex);
    expect(validatorSource).toContain('execFileAsync("git", ["-C", repositoryRoot, ...args]');
    expect(validatorSource).toContain("shell: false");
    const { stdout: lineage } = await execFileAsync(
      "git",
      ["-C", REPOSITORY_ROOT, "rev-list", "--parents", "-n", "1", TRUSTED_CAPTURE_SOURCE.commit],
      { encoding: "utf8", shell: false },
    );
    expect(lineage.trim()).toBe(`${TRUSTED_CAPTURE_SOURCE.commit} ${TRUSTED_CAPTURE_SOURCE.parent}`);
    for (const [path, expected] of [
      [TRUSTED_CAPTURE_SOURCE.raw_responses_path, TRUSTED_CAPTURE_SOURCE.raw_responses_sha256],
      [TRUSTED_CAPTURE_SOURCE.run_manifest_path, TRUSTED_CAPTURE_SOURCE.run_manifest_sha256],
    ]) {
      const { stdout } = await execFileAsync(
        "git",
        ["-C", REPOSITORY_ROOT, "cat-file", "blob", `${TRUSTED_CAPTURE_SOURCE.commit}:${path}`],
        { encoding: "buffer", maxBuffer: 2 * 1024 * 1024, shell: false },
      );
      expect(createHash("sha256").update(stdout).digest("hex")).toBe(expected);
    }
    const captureHashes = JSON.parse(await readFile(
      join(REPOSITORY_ROOT, "evaluation/starlette-v1/runs/feasibility-01/capture-hashes.json"),
      "utf8",
    ));
    expect(captureHashes.self_attestation_exclusions).toEqual(["capture-hashes.json", "validate-capture.mjs"]);
    expect(captureHashes.current_payload_files.map((entry: any) => entry.path)).not.toContain("validate-capture.mjs");
  });

  it("does not allow callers to inject substitute anchor bytes or a repository without the fixed commit", async () => {
    const root = await copiedRepository();
    await expect(validateFeasibilityCapture(root, { anchor_repository_root: root })).rejects.toThrow(
      /accepted_git_source\.commit: fixed Git object unavailable/,
    );
    await expect(validateFeasibilityCapture(root, {
      anchor_repository_root: REPOSITORY_ROOT,
      anchor_bytes: Buffer.from("replacement"),
    } as any)).rejects.toThrow(/only anchor_repository_root may be configured/);
  });
});
