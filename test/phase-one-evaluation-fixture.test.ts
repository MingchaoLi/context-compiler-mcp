import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
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

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
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

function rewriteCoordinatedFixture(
  root: string,
  mutateCorpus: (corpus: any) => void
): void {
  const copiedFixtureDirectory = join(root, "evaluation", "phase-one-synthetic-v1");
  mkdirSync(copiedFixtureDirectory, { recursive: true });
  const names = [
    "corpus.json",
    "oracle.json",
    "renderer.json",
    "run-manifest-fixtures.json",
    "freeze.json",
    "run-offline.mjs",
  ];
  for (const name of names) {
    copyFileSync(join(fixtureDirectory, name), join(copiedFixtureDirectory, name));
  }

  const writeCanonicalJson = (name: string, value: unknown): void => {
    writeFileSync(join(copiedFixtureDirectory, name), `${canonicalize(value)}\n`);
  };
  const descriptor = (name: string): { file: string; value: string } => {
    const file = readFileSync(join(copiedFixtureDirectory, name));
    return { file: sha256(file), value: sha256(file.subarray(0, file.length - 1)) };
  };

  const corpus = loadJsonFrom(copiedFixtureDirectory, "corpus.json");
  mutateCorpus(corpus);
  writeCanonicalJson("corpus.json", corpus);

  const renderer = loadJsonFrom(copiedFixtureDirectory, "renderer.json");
  renderer.case_renderings = corpus.cases.map((corpusCase: any) => {
    const rendered = renderCase(corpusCase);
    return {
      case_id: corpusCase.case_id,
      d0_history_utf8_bytes: Buffer.byteLength(rendered.history, "utf8"),
      full_packet_utf8_bytes: Buffer.byteLength(rendered.full, "utf8"),
      full_packet_sha256: sha256(rendered.full),
      declared_context_units: rendered.full.length === 0 ? 0 : Math.max(1, Math.ceil(rendered.full.length / 4)),
      evidence_status: "ESTIMATED",
    };
  });
  writeCanonicalJson("renderer.json", renderer);

  const corpusDigest = descriptor("corpus.json");
  const oracleDigest = descriptor("oracle.json");
  const rendererDigest = descriptor("renderer.json");
  const fixtures = loadJsonFrom(copiedFixtureDirectory, "run-manifest-fixtures.json");
  for (const manifest of [fixtures.template, fixtures.positive_control.manifest]) {
    manifest.workload.corpus_file_sha256 = corpusDigest.file;
    manifest.workload.corpus_value_sha256 = corpusDigest.value;
    manifest.workload.oracle_file_sha256 = oracleDigest.file;
    manifest.workload.oracle_value_sha256 = oracleDigest.value;
    manifest.workload.renderer_file_sha256 = rendererDigest.file;
    manifest.workload.renderer_value_sha256 = rendererDigest.value;
    manifest.workload.case_bindings.forEach((binding: any, index: number) => {
      binding.current_input_sha256 = sha256(corpus.cases[index].current_input);
    });
  }
  const manifestWithoutRunId = { ...fixtures.positive_control.manifest };
  delete manifestWithoutRunId.run_id;
  fixtures.positive_control.manifest.run_id = `RUN-SHA256-${sha256(canonicalize(manifestWithoutRunId))}`;
  writeCanonicalJson("run-manifest-fixtures.json", fixtures);

  const freeze = loadJsonFrom(copiedFixtureDirectory, "freeze.json");
  const roles = new Map(freeze.files.map((item: any) => [item.path, item.role]));
  const valueNames = new Set(["corpus.json", "oracle.json", "renderer.json", "run-manifest-fixtures.json"]);
  freeze.files = names
    .filter((name) => name !== "freeze.json")
    .map((name) => {
      const path = `evaluation/phase-one-synthetic-v1/${name}`;
      const file = readFileSync(join(copiedFixtureDirectory, name));
      return {
        path,
        role: roles.get(path),
        file_sha256: sha256(file),
        value_sha256_or_NOT_APPLICABLE: valueNames.has(name)
          ? sha256(file.subarray(0, file.length - 1))
          : "NOT_APPLICABLE",
      };
    })
    .sort((left, right) => left.path.localeCompare(right.path));
  freeze.fixture_bundle_sha256 = sha256(canonicalize(
    freeze.files.map(({ path, file_sha256 }: any) => ({ path, sha256: file_sha256 }))
  ));
  writeCanonicalJson("freeze.json", freeze);
}

function loadJsonFrom(directory: string, name: string): any {
  return JSON.parse(readFileSync(join(directory, name), "utf8"));
}

function runCoordinatedCorpusRewrite(mutateCorpus: (corpus: any) => void): ReturnType<typeof spawnSync> {
  const root = mkdtempSync(join(tmpdir(), "rc-phase-one-coordinated-rewrite-"));
  try {
    rewriteCoordinatedFixture(root, mutateCorpus);
    return spawnSync(
      process.execPath,
      [join(root, "evaluation", "phase-one-synthetic-v1", "run-offline.mjs"), "validate"],
      { cwd: root, encoding: "utf8" }
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function runCoordinatedObservationRewrite(text: string): ReturnType<typeof spawnSync> {
  const root = mkdtempSync(join(tmpdir(), "rc-phase-one-observation-rewrite-"));
  const copiedFixtureDirectory = join(root, "evaluation", "phase-one-synthetic-v1");
  const copiedRunnerPath = join(copiedFixtureDirectory, "run-offline.mjs");
  try {
    rewriteCoordinatedFixture(root, () => undefined);
    const fixtures = loadJsonFrom(copiedFixtureDirectory, "run-manifest-fixtures.json");
    fixtures.positive_control.observations[1].packet_observation = { kind: "EXACT_TEXT", text };
    const manifestWithoutRunId = { ...fixtures.positive_control.manifest };
    delete manifestWithoutRunId.run_id;
    fixtures.positive_control.manifest.run_id = `RUN-SHA256-${sha256(canonicalize(manifestWithoutRunId))}`;
    writeFileSync(
      join(copiedFixtureDirectory, "run-manifest-fixtures.json"),
      `${canonicalize(fixtures)}\n`
    );

    const freeze = spawnSync(process.execPath, [copiedRunnerPath, "freeze"], {
      cwd: root,
      encoding: "utf8",
    });
    expect(freeze.status).toBe(0);
    writeFileSync(join(copiedFixtureDirectory, "freeze.json"), freeze.stdout);
    return spawnSync(process.execPath, [copiedRunnerPath, "replay"], {
      cwd: root,
      encoding: "utf8",
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
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

  it("rejects every registered qualification marker after a coordinated corpus receipt rewrite", () => {
    const benign = runCoordinatedCorpusRewrite((corpus) => {
      corpus.cases[0].sources[0].text += " Synthetic coordinated receipt control.";
    });
    expect(benign.status).toBe(0);

    const oracle = loadJson("oracle.json");
    const markers = oracle.cases.flatMap((item: any) =>
      item.qualification_labels.map(({ marker }: any) => marker)
    );
    const surfaces = [
      (corpus: any, marker: string) => { corpus.cases[0].sources[0].text += ` ${marker}`; },
      (corpus: any, marker: string) => { corpus.cases[0].current_input += ` ${marker}`; },
      (corpus: any, marker: string) => { corpus.cases[0].fallback_scenario.trigger += ` ${marker}`; },
    ];
    for (const marker of markers) {
      for (const inject of surfaces) {
        const result = runCoordinatedCorpusRewrite((corpus) => inject(corpus, marker));
        expect(result.status).toBe(1);
        expect(JSON.parse(result.stderr).error.code).toBe("INVALID_ORACLE_EXPOSURE");
      }
    }
  });

  it("recognizes fact ids only at exact ASCII delimiter-safe boundaries after coordinated rewrites", () => {
    const positive = runCoordinatedObservationRewrite("[FX-F0001]");
    expect(positive.status).toBe(0);
    const positiveCell = JSON.parse(positive.stdout).normalized_result.cells[1];
    expect(positiveCell.required_fact_recall).toEqual({
      status: "EVALUABLE",
      numerator: 1,
      denominator: 1,
      rate: 1,
    });
    expect(positiveCell.supported_precision).toEqual({
      status: "EVALUABLE",
      numerator: 1,
      denominator: 1,
      rate: 1,
    });

    const negative = runCoordinatedObservationRewrite(
      "xFX-F0001y AFX-F0001 FX-F00010 xFX-F0001 FX-F0001y -FX-F0001 FX-F0001-"
    );
    expect(negative.status).toBe(0);
    const negativeCell = JSON.parse(negative.stdout).normalized_result.cells[1];
    expect(negativeCell.required_fact_recall).toEqual({
      status: "EVALUABLE",
      numerator: 0,
      denominator: 1,
      rate: 0,
    });
    expect(negativeCell.supported_precision).toEqual({
      status: "NOT_EVALUABLE",
      numerator: 0,
      denominator: 0,
      rate: null,
    });
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
