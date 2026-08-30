import { execFileSync, spawnSync } from "node:child_process";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { estimateTokens } from "../src/raw-store.js";

const fixtureDirectory = fileURLToPath(
  new URL("../evaluation/phase-one-synthetic-v1/", import.meta.url)
);
const runnerPath = join(fixtureDirectory, "run-offline.mjs");
const caseIds = [
  "PH1-C01-RELEVANT-DISTRACTOR",
  "PH1-C02-STALE-SUPERSEDED",
  "PH1-C03-CONFLICT-PROVENANCE",
  "PH1-C04-MISSING-UNCERTAIN",
  "PH1-C05-LONG-CONTEXT",
  "PH1-C06-SAFE-FALLBACK",
];
const invalidCodes = [
  "INVALID_MANIFEST_CHANGED",
  "INVALID_FIXTURE_DIGEST",
  "INVALID_ORACLE_DIGEST",
  "INVALID_RENDERER_DIGEST",
  "INVALID_CASE_SET",
  "INVALID_CUTOFF_OR_ORDER",
  "INVALID_CROSS_LANE_STATE",
  "INVALID_UNAUTHORIZED_ACCESS",
  "INVALID_MISSING_ARTIFACT",
  "INVALID_ORACLE_EXPOSURE",
  "INVALID_TIMEOUT",
  "INVALID_CRASH",
  "INVALID_REPLAY_MISMATCH",
  "INVALID_RETRY_EXCEEDED",
];

function run(command: "validate" | "replay", cwd = fixtureDirectory): Buffer {
  return execFileSync(process.execPath, [runnerPath, command], { cwd });
}

function parseRunnerOutput(command: "validate" | "replay", cwd = fixtureDirectory): any {
  return JSON.parse(run(command, cwd).toString("utf8"));
}

function canonicalize(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "boolean" || typeof value === "number" || typeof value === "string") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalize(record[key])}`)
    .join(",")}}`;
}

function loadJson(name: string): any {
  return JSON.parse(readFileSync(join(fixtureDirectory, name), "utf8"));
}

function renderCase(corpusCase: any): { history: string; full: string } {
  const history = corpusCase.sources
    .filter((source: any) => source.stream_seq <= corpusCase.common_cutoff.visible_through_stream_seq)
    .sort((left: any, right: any) => left.stream_seq - right.stream_seq || left.fact_id.localeCompare(right.fact_id))
    .map(
      (source: any) =>
        `[${source.fact_id}|${source.source_id}|${source.source_class}|${source.epistemic_marker}] ${source.text}\n`
    )
    .join("");
  return { history, full: `${history}[CURRENT_INPUT] ${corpusCase.current_input}\n` };
}

function assertNoScalarAuthority(value: unknown): void {
  if (Array.isArray(value)) {
    value.forEach(assertNoScalarAuthority);
    return;
  }
  if (value === null || typeof value !== "object") return;
  for (const [key, nested] of Object.entries(value)) {
    expect(["score", "rank", "winner", "passed", "weights"]).not.toContain(key);
    assertNoScalarAuthority(nested);
  }
}

function runManifestNearMiss(mutator: (fixtures: any) => void): string {
  const root = mkdtempSync(join(tmpdir(), "rc-phase-one-near-miss-"));
  const copiedFixtureDirectory = join(root, "evaluation", "phase-one-synthetic-v1");
  mkdirSync(copiedFixtureDirectory, { recursive: true });
  try {
    for (const name of [
      "corpus.json",
      "oracle.json",
      "renderer.json",
      "run-manifest-fixtures.json",
      "run-offline.mjs",
    ]) {
      copyFileSync(join(fixtureDirectory, name), join(copiedFixtureDirectory, name));
    }
    const manifestPath = join(copiedFixtureDirectory, "run-manifest-fixtures.json");
    const fixtures = JSON.parse(readFileSync(manifestPath, "utf8"));
    mutator(fixtures);
    writeFileSync(manifestPath, `${canonicalize(fixtures)}\n`);
    const result = spawnSync(
      process.execPath,
      [join(copiedFixtureDirectory, "run-offline.mjs"), "freeze"],
      { cwd: root, encoding: "utf8" }
    );
    expect(result.status).toBe(1);
    return JSON.parse(result.stderr).error.code;
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

describe("phase-one public synthetic evaluation fixture", () => {
  it("validates the frozen six-case bundle and all fourteen invalid controls", () => {
    const receipt = parseRunnerOutput("validate");
    expect(receipt.case_count).toBe(6);
    expect(receipt.corpus_id).toBe("rc-phase-one-synthetic-v1");
    expect(receipt.invalid_control_count).toBe(14);
    expect(receipt.freeze_file_sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(receipt.fixture_bundle_sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("replays byte-identically from unrelated fresh working directories", () => {
    const firstDirectory = mkdtempSync(join(tmpdir(), "rc-phase-one-cwd-a-"));
    const secondDirectory = mkdtempSync(join(tmpdir(), "rc-phase-one-cwd-b-"));
    try {
      const first = run("replay", firstDirectory);
      const second = run("replay", secondDirectory);
      expect(first.equals(second)).toBe(true);
      const parsed = JSON.parse(first.toString("utf8"));
      expect(parsed.replay_status).toBe("BYTE_IDENTICAL");
      expect(parsed.normalized_result_value_sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(parsed.normalized_result_file_sha256).toMatch(/^[0-9a-f]{64}$/);
    } finally {
      rmSync(firstDirectory, { recursive: true, force: true });
      rmSync(secondDirectory, { recursive: true, force: true });
    }
  });

  it("keeps the corpus arm-neutral and the evaluator-control oracle physically separate", () => {
    const corpusText = readFileSync(join(fixtureDirectory, "corpus.json"), "utf8");
    const corpus = JSON.parse(corpusText);
    const oracle = loadJson("oracle.json");
    expect(corpus.cases.map((item: any) => item.case_id)).toEqual(caseIds);
    expect(oracle.cases.map((item: any) => item.case_id)).toEqual(caseIds);
    expect(corpusText).not.toContain("required_fact_ids");
    expect(corpusText).not.toContain("supported_fact_ids");
    expect(corpusText).not.toContain("prohibitions");
    expect(corpusText).not.toContain("qualification_labels");
    expect(corpusText).not.toContain("fallback_expected");
    expect(corpusText).not.toContain("EVALUATOR_CONTROL");
    expect(oracle.classification).toBe("PUBLIC_SYNTHETIC_EVALUATOR_CONTROL_NOT_HIDDEN_HOLDOUT");
    expect(new Set(corpus.cases.map((item: any) => item.primary_category)).size).toBe(6);
  });

  it("reconstructs every renderer byte count, digest shape, and frozen estimator unit", () => {
    const corpus = loadJson("corpus.json");
    const renderer = loadJson("renderer.json");
    expect(renderer.renderer_id).toBe("RC_PHASE1_FACT_LINES_V1");
    expect(renderer.tokenizer_id).toBe("CC_ESTIMATE_TOKENS_JS_UTF16_CODE_UNITS_DIV4_V1");
    for (let index = 0; index < corpus.cases.length; index += 1) {
      const rendered = renderCase(corpus.cases[index]);
      const receipt = renderer.case_renderings[index];
      expect(receipt.case_id).toBe(corpus.cases[index].case_id);
      expect(receipt.d0_history_utf8_bytes).toBe(Buffer.byteLength(rendered.history, "utf8"));
      expect(receipt.full_packet_utf8_bytes).toBe(Buffer.byteLength(rendered.full, "utf8"));
      expect(receipt.declared_context_units).toBe(estimateTokens(rendered.full));
      expect(receipt.full_packet_sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(receipt.evidence_status).toBe("ESTIMATED");
    }
    expect(renderer.case_renderings[4].d0_history_utf8_bytes).toBeGreaterThanOrEqual(32768);
  });

  it("preserves zero denominators and unknown, unobservable, unsupported, and invalid states", () => {
    const result = parseRunnerOutput("replay").normalized_result;
    const cell = (caseId: string, armId: string) =>
      result.cells.find((item: any) => item.case_id === caseId && item.arm_id === armId);
    expect(cell(caseIds[3], "D0_FULL_AUTHORIZED_FIXTURE").required_fact_recall).toEqual({
      status: "NOT_EVALUABLE",
      numerator: 0,
      denominator: 0,
      rate: null,
    });
    expect(cell(caseIds[0], "D2_RIPPLECONTEXT_COMPILED").packet_status).toBe("UNKNOWN");
    expect(cell(caseIds[2], "D2_RIPPLECONTEXT_COMPILED").packet_status).toBe("UNSUPPORTED");
    expect(cell(caseIds[3], "D2_RIPPLECONTEXT_COMPILED").packet_status).toBe("INPUT_UNOBSERVABLE");
    expect(cell(caseIds[0], "D1_HOST_NATIVE_BOUNDED").supported_precision).toMatchObject({
      status: "EVALUABLE",
      numerator: 1,
      denominator: 2,
    });
    const d1 = result.aggregates.find((item: any) => item.arm_id === "D1_HOST_NATIVE_BOUNDED");
    expect(d1.safe_fallback_rate).toMatchObject({ status: "UNKNOWN", numerator: null, denominator: null });
    expect(result.metric_status_counts.INVALID_RUN).toBe(14);
    expect(result.invalid_controls.map((item: any) => item.error_code)).toEqual(invalidCodes);
    assertNoScalarAuthority(result);
  });

  it("fails independent digest, cutoff, lane, and oracle-exposure near misses closed", () => {
    expect(runManifestNearMiss((fixtures) => {
      fixtures.positive_control.manifest.workload.corpus_value_sha256 = "0".repeat(64);
    })).toBe("INVALID_FIXTURE_DIGEST");
    expect(runManifestNearMiss((fixtures) => {
      fixtures.positive_control.manifest.workload.case_bindings[0].visible_through_stream_seq = 1;
    })).toBe("INVALID_CUTOFF_OR_ORDER");
    expect(runManifestNearMiss((fixtures) => {
      fixtures.positive_control.observations[1].authorization_lane = "UNEQUAL_ARM_LANE";
    })).toBe("INVALID_CROSS_LANE_STATE");
    expect(runManifestNearMiss((fixtures) => {
      fixtures.positive_control.manifest.execution.explicit_exclusions = [
        "FUTURE_OR_CUTOFF_HIDDEN_INPUT",
        "PRIVATE_OR_REAL_DATA",
      ];
    })).toBe("INVALID_ORACLE_EXPOSURE");
  });
});
