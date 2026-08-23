// @vitest-environment node

import { createHash } from "node:crypto";
import { cp, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { validatePromotionWiring } from "../evaluation/starlette-v1/validate-promotion-wiring.js";
// The promotion validator intentionally remains outside the publishable src/ package.
// @ts-expect-error JavaScript fixture utility has no declaration file.
import {
  computePromotionHashEntries,
  validatePromotion,
} from "../evaluation/starlette-v1/validate-promotion.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "evaluation", "starlette-v1");
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

async function copiedRoot(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "context-compiler-starlette-promotion-"));
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

async function sha256File(path: string): Promise<string> {
  return createHash("sha256").update(await readFile(path)).digest("hex");
}

describe("Starlette three-case promotion audit", () => {
  it("accepts a not-frozen three-case promotion with twenty-one identical files", async () => {
    await expect(validatePromotion(ROOT)).resolves.toEqual({
      schema_version: "starlette-promotion/v1",
      status: "promotion_candidate_not_frozen",
      registered_case_count: 6,
      promoted_case_count: 3,
      remaining_case_count: 3,
      relocation_file_count: 21,
      byte_identical_file_count: 21,
      source_reaudit_count: 31,
      slice_count: 31,
      contamination_confirmed: [],
      evaluation_ready: false,
      model_run_authorized: false,
      hashes_verified: true,
    });
  });

  it("reads promotion copies into the same strict evaluator v2 wiring", async () => {
    await expect(validatePromotionWiring(ROOT)).resolves.toEqual({
      schema_version: "starlette-promotion-wiring/v1",
      status: "promotion_wiring_compatible",
      promotion_status: "promotion_candidate_not_frozen",
      evaluator_case_count: 31,
      projected_history_turn_count: 226,
      evaluation_run_count: 0,
      model_call_count: 0,
      effect_metrics_generated: false,
    });
  });

  it("rejects case selection, cutoff, freeze, and model authorization changes", async () => {
    const root = await copiedRoot();
    await mutateJson(root, "promotion/collection.json", (value) => {
      value.registered_case_ids[0] = "STR-09";
      value.evidence_cutoff_at = "2026-08-24T03:00:00Z";
      value.status = "frozen";
      value.model_run_authorized = true;
    });
    await expect(validatePromotion(root)).rejects.toThrow();
  });

  it("rejects a promotion payload that is no longer byte-identical", async () => {
    const root = await copiedRoot();
    const path = join(root, "promotion/cases/STR-08/tasks.json");
    await writeFile(path, `${await readFile(path, "utf8")}\n`, "utf8");
    await expect(validatePromotion(root)).rejects.toThrow(/promotion copy differs from fixed accepted-source contract/);
  });

  it("rejects a byte-identical promotion payload exposed through a symlink", async () => {
    const root = await copiedRoot();
    const target = join(root, "promotion/cases/STR-08/tasks.json");
    const saved = join(root, "promotion/cases/STR-08/tasks-saved.json");
    await cp(target, saved);
    await rm(target);
    await symlink(saved, target);
    await expect(validatePromotion(root)).rejects.toThrow(/expected regular file/);
  });

  it("rejects coordinated accepted-source, copy, diff, and hash rewrites", async () => {
    const root = await copiedRoot();
    const acceptedPath = "pilot/STR-08/tasks.json";
    const promotionPath = "promotion/cases/STR-08/tasks.json";
    for (const path of [acceptedPath, promotionPath]) {
      await mutateJson(root, path, (value) => {
        value.tasks[0].current_task += " Also identify one immediate investigation step.";
      });
    }
    const rewrittenHash = await sha256File(join(root, acceptedPath));
    await mutateJson(root, "pilot-hashes.json", (value) => {
      value.files.find((entry: any) => entry.path === acceptedPath).sha256 = rewrittenHash;
    });
    await mutateJson(root, "promotion/promotion-diff.json", (value) => {
      const entry = value.entries.find((candidate: any) => candidate.old_path === acceptedPath);
      entry.old_sha256 = rewrittenHash;
      entry.new_sha256 = rewrittenHash;
    });
    const rewrittenDiffHash = await sha256File(join(root, "promotion/promotion-diff.json"));
    await mutateJson(root, "promotion/collection.json", (value) => {
      value.promotion_diff.sha256 = rewrittenDiffHash;
    });
    const rewrittenPromotionHashes = await computePromotionHashEntries(root);
    await writeFile(join(root, "promotion-hashes.json"), `${JSON.stringify({
      schema_version: "starlette-promotion/v1",
      status: "promotion_candidate_not_frozen",
      algorithm: "sha256",
      files: rewrittenPromotionHashes,
    }, null, 2)}\n`, "utf8");

    await expect(validatePromotion(root)).rejects.toThrow(/accepted source differs from fixed/);
  });

  it("rejects a promotion diff that disguises a change class", async () => {
    const root = await copiedRoot();
    await mutateJson(root, "promotion/promotion-diff.json", (value) => {
      value.entries[0].change_class = "promotion_metadata_only";
    });
    await expect(validatePromotion(root)).rejects.toThrow(/promotion diff does not match filesystem/);
  });

  it("rejects contamination status without direct evidence", async () => {
    const root = await copiedRoot();
    await mutateJson(root, "promotion/contamination-snapshot.json", (value) => {
      value.results[0].status = "confirmed";
      value.results[0].eligibility = "disclosed_not_blind_eligible";
    });
    await expect(validatePromotion(root)).rejects.toThrow(/status\/evidence mismatch/);
  });

  it("rejects removal of the accepted STR-04 RAGAS context-only exclusion", async () => {
    const root = await copiedRoot();
    await mutateJson(root, "promotion/contamination-snapshot.json", (value) => {
      value.results.find((entry: any) => entry.candidate_id === "STR-04").excluded_hits.shift();
    });
    await expect(validatePromotion(root)).rejects.toThrow(/RAGAS context-only exclusion missing/);
  });

  it("rejects a source re-audit that silently requires semantic changes", async () => {
    const root = await copiedRoot();
    await mutateJson(root, "promotion/source-reaudit.json", (value) => {
      value.cases[0].semantic_payload_change_required = true;
      value.summary.semantic_payload_change_count = 1;
    });
    await expect(validatePromotion(root)).rejects.toThrow(/metadata-only promotion must remain false/);
  });

  it("rejects promotion hash tampering and any wiring dependency injection", async () => {
    const root = await copiedRoot();
    await mutateJson(root, "promotion-hashes.json", (value) => {
      value.files[0].sha256 = "0".repeat(64);
    });
    await expect(validatePromotion(root)).rejects.toThrow(/promotion content hash mismatch/);
    await expect(validatePromotionWiring(ROOT, { parseSuite: () => undefined })).rejects.toThrow(
      /promotion wiring injection is not supported/
    );
  });
});
