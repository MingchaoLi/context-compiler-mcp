// @vitest-environment node

import { createHash } from "node:crypto";
import { cp, lstat, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
// @ts-expect-error JavaScript fixture utility has no declaration file.
import {
  TRUSTED_RESULT_SOURCE,
  TRUSTED_RUNNER_SOURCE,
  validateDs13Results,
} from "../evaluation/starlette-v1/results/feasibility-01/validate-results.mjs";

const REPOSITORY_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const RESULT_RELATIVE_ROOT = "evaluation/starlette-v1/results/feasibility-01";
const RESULT_ROOT = join(REPOSITORY_ROOT, RESULT_RELATIVE_ROOT);
const temporaryDirectories: string[] = [];
let importCounter = 0;

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

async function copiedArtifactRoot(): Promise<string> {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "context-compiler-ds13-result-"));
  temporaryDirectories.push(temporaryRoot);
  const artifactRoot = join(temporaryRoot, "feasibility-01");
  await cp(RESULT_ROOT, artifactRoot, { recursive: true });
  return artifactRoot;
}

async function copiedEvaluationTree(): Promise<{ repositoryRoot: string; artifactRoot: string }> {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "context-compiler-ds13-bootstrap-"));
  temporaryDirectories.push(temporaryRoot);
  const evaluationRoot = join(temporaryRoot, "evaluation/starlette-v1");
  await cp(join(REPOSITORY_ROOT, "evaluation/starlette-v1"), evaluationRoot, { recursive: true });
  return { repositoryRoot: temporaryRoot, artifactRoot: join(evaluationRoot, "results/feasibility-01") };
}

async function sha256File(target: string): Promise<string> {
  return createHash("sha256").update(await readFile(target)).digest("hex");
}

async function rewriteJson(target: string, mutate: (value: any) => void): Promise<void> {
  const value = JSON.parse(await readFile(target, "utf8"));
  mutate(value);
  await writeFile(target, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

describe("Starlette feasibility-01 automatic results and blind bundle", () => {
  it("accepts the anchored official diagnostic and 36 blank review items", async () => {
    await expect(validateDs13Results(REPOSITORY_ROOT)).resolves.toEqual({
      schema_version: "starlette_feasibility_result_validation/v1",
      status: "automatic_diagnostic_and_blank_review_bundle_valid_pending_independent_qa",
      accepted_git_source_commit: "f721fd1159e6802d29132939c8114377f3faefa4",
      git_object_anchor_verified: true,
      evaluator_case_count: 12,
      lexical_probe_count: 8,
      lexical_probe_slice_count: 3,
      answer_count: 36,
      review_item_count: 36,
      evaluation_run_count: 1,
      model_call_count: 0,
      semantic_score_count: 0,
      semantic_correctness_gate: "pending_human_review",
      context_reduction_interpretation: "pending_correctness_gate",
      operational_stability_gate: "not_evaluated_by_this_work_order",
    });
  });

  it("anchors every official artifact to the single source commit before parsing current JSON", async () => {
    expect(TRUSTED_RESULT_SOURCE.commit).toBe("f721fd1159e6802d29132939c8114377f3faefa4");
    expect(TRUSTED_RESULT_SOURCE.parent).toBe("c3b47065cdc8583feafd5d1716b3ce53aa2de75c");
    expect(TRUSTED_RESULT_SOURCE.files).toHaveLength(17);
    expect(TRUSTED_RUNNER_SOURCE).toEqual({
      commit: "a0889f0597aed9053dcc9b84026644ed94e2ed0f",
      parent: "f721fd1159e6802d29132939c8114377f3faefa4",
      files: [{ path: "generate-official-results.test.ts", sha256: "a8240c523e4de4d29d6ba7ed2fd1898828c03b29cc22b912b022693a64fe3e4a" }],
    });
    const source = await readFile(join(RESULT_ROOT, "validate-results.mjs"), "utf8");
    expect(source.indexOf("await validateTrustedSources(normalizedRepositoryRoot, resultRoot, anchorRepositoryRoot);")).toBeLessThan(
      source.indexOf("const resultFiles = await walkFiles(resultRoot);"),
    );
    expect(source).toContain('execFileAsync("git", ["-C", repositoryRoot, ...args]');
    expect(source).toContain("shell: false");
  });

  it("rejects answer, rubric, mapping, order, id, unknown-field and Unicode mutations", async () => {
    const attacks: Array<(artifactRoot: string) => Promise<void>> = [
      async (root) => {
        const target = join(root, "public-review/shared/review-items.jsonl");
        const lines = (await readFile(target, "utf8")).trimEnd().split("\n").map(JSON.parse);
        lines[0].answer += " changed";
        await writeFile(target, `${lines.map(JSON.stringify).join("\n")}\n`, "utf8");
      },
      async (root) => {
        const target = join(root, "public-review/shared/review-items.jsonl");
        const lines = (await readFile(target, "utf8")).trimEnd().split("\n").map(JSON.parse);
        lines[0].criteria[0].text += " changed";
        await writeFile(target, `${lines.map(JSON.stringify).join("\n")}\n`, "utf8");
      },
      async (root) => rewriteJson(join(root, "internal-audit/review-key.json"), (value) => { value.entries[0].condition = "d1"; }),
      async (root) => {
        const target = join(root, "public-review/shared/review-items.jsonl");
        const lines = (await readFile(target, "utf8")).trimEnd().split("\n");
        [lines[0], lines[1]] = [lines[1]!, lines[0]!];
        await writeFile(target, `${lines.join("\n")}\n`, "utf8");
      },
      async (root) => {
        const target = join(root, "public-review/shared/review-items.jsonl");
        const lines = (await readFile(target, "utf8")).trimEnd().split("\n").map(JSON.parse);
        lines[0].review_id = "review_00000000000000000000";
        await writeFile(target, `${lines.map(JSON.stringify).join("\n")}\n`, "utf8");
      },
      async (root) => rewriteJson(join(root, "boundary-manifest.json"), (value) => { value.unknown = true; }),
      async (root) => {
        const target = join(root, "public-review/shared/review-items.jsonl");
        const lines = (await readFile(target, "utf8")).trimEnd().split("\n").map(JSON.parse);
        lines[0].answer += "\u200b";
        await writeFile(target, `${lines.map(JSON.stringify).join("\n")}\n`, "utf8");
      },
    ];
    for (const attack of attacks) {
      const artifactRoot = await copiedArtifactRoot();
      await attack(artifactRoot);
      await expect(validateDs13Results(REPOSITORY_ROOT, { artifact_root: artifactRoot })).rejects.toThrow(/current bytes differ from fixed Git blob/);
    }
  });

  it("rejects a symlinked public artifact", async () => {
    const artifactRoot = await copiedArtifactRoot();
    const target = join(artifactRoot, "public-review/shared/review-items.jsonl");
    const saved = join(artifactRoot, "public-review/shared/review-items-saved.jsonl");
    await cp(target, saved);
    await rm(target);
    await symlink(saved, target);
    await expect(validateDs13Results(REPOSITORY_ROOT, { artifact_root: artifactRoot })).rejects.toThrow(/expected regular non-symlink file/);
  });

  it("rejects coordinated answer/hash/validator self-bootstrap at the fixed Git source", async () => {
    const { repositoryRoot, artifactRoot } = await copiedEvaluationTree();
    const itemsPath = join(artifactRoot, "public-review/shared/review-items.jsonl");
    const items = (await readFile(itemsPath, "utf8")).trimEnd().split("\n").map(JSON.parse);
    items[0].answer += " coordinated";
    await writeFile(itemsPath, `${items.map(JSON.stringify).join("\n")}\n`, "utf8");

    const publicHashesPath = join(artifactRoot, "public-review/public-hashes.json");
    await rewriteJson(publicHashesPath, (value) => {
      value.files.find((entry: any) => entry.path === "public-review/shared/review-items.jsonl").sha256 = "__ITEM_HASH__";
    });
    const itemHash = await sha256File(itemsPath);
    await rewriteJson(publicHashesPath, (value) => {
      value.files.find((entry: any) => entry.path === "public-review/shared/review-items.jsonl").sha256 = itemHash;
    });
    const publicHash = await sha256File(publicHashesPath);
    const artifactHashesPath = join(artifactRoot, "artifact-hashes.json");
    await rewriteJson(artifactHashesPath, (value) => {
      value.files.find((entry: any) => entry.path === "public-review/shared/review-items.jsonl").sha256 = itemHash;
      value.files.find((entry: any) => entry.path === "public-review/public-hashes.json").sha256 = publicHash;
    });
    const artifactHash = await sha256File(artifactHashesPath);

    const validatorPath = join(artifactRoot, "validate-results.mjs");
    const validator = (await readFile(validatorPath, "utf8"))
      .replace("85e055f6bb3e9c66c93fa5a55c73890e531d2f28de409356b5422b3198f2e1c7", artifactHash)
      .replace("0fa773770395096bff7b1881dfb8f69748061c4695f917d42c4712c87f9ab521", publicHash)
      .replace("6ef794ac55fc8294f55879e33b44466d51f1673c09040e4d994436617067e2fb", itemHash);
    await writeFile(validatorPath, validator, "utf8");
    const attacked = await import(`${pathToFileURL(validatorPath).href}?attack=${importCounter++}`);
    await expect(attacked.validateDs13Results(REPOSITORY_ROOT, {
      artifact_root: artifactRoot,
      anchor_repository_root: REPOSITORY_ROOT,
    })).rejects.toThrow(/accepted_git_source\.artifact-hashes\.json\.sha256: fixed value changed/);
    expect(repositoryRoot).not.toBe(REPOSITORY_ROOT);
  });

  it("contains one official evaluator call and no scoring or model runner", async () => {
    const generator = await readFile(join(RESULT_ROOT, "generate-official-results.test.ts"), "utf8");
    const validator = await readFile(join(RESULT_ROOT, "validate-results.mjs"), "utf8");
    expect(generator.match(/runEvaluationSuiteV2\(/g)).toHaveLength(1);
    expect(validator).not.toContain("runEvaluationSuiteV2(");
    expect(`${generator}\n${validator}`).not.toMatch(/model[_-]?judge|semantic[_-]?retriever|Evidence Paging|glimpse\(|ContextScorer/iu);
  });

  it("keeps every committed result artifact as a regular file", async () => {
    for (const entry of [...TRUSTED_RESULT_SOURCE.files, ...TRUSTED_RUNNER_SOURCE.files]) {
      const stat = await lstat(join(RESULT_ROOT, entry.path));
      expect(stat.isFile()).toBe(true);
      expect(stat.isSymbolicLink()).toBe(false);
    }
  });
});
