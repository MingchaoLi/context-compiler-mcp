// @vitest-environment node

import { createHash } from "node:crypto";
import { lstat, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { arch, platform, release } from "node:os";
import { dirname, isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";
import { runEvaluationSuiteV2 } from "../../../../src/evaluation.js";
import { buildProtocolCanarySuite } from "../../protocol-canary/protocol-preflight.js";

const REPOSITORY_ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const OUTPUT_ENVIRONMENT_VARIABLE = "CONTEXT_COMPILER_DS13_OFFICIAL_OUTPUT";
const RAW_RESPONSES_PATH = join(REPOSITORY_ROOT, "evaluation/starlette-v1/runs/feasibility-01/raw-responses.jsonl");
const PACKET_MANIFEST_PATH = join(REPOSITORY_ROOT, "evaluation/starlette-v1/freeze/v1/packet-manifest.json");
const PROTOCOL_PATH = join(REPOSITORY_ROOT, "evaluation/starlette-v1/protocol-canary/protocol.json");
const RAW_RESPONSES_SHA256 = "1b574d4c1843a283d088cc641523855e78135516545a264c4fe48d5e059a4910";
const PROTOCOL_SHA256 = "21fc57bb02a67868965475dab82347fb5abde0fb2eb2a0c8fd3b71f24c58c3f0";
const REVIEW_ID_DOMAIN = "starlette-v1-feasibility-review-id/v1|fixed-pre-registered-domain";
const REVIEW_ORDER_DOMAIN = "starlette-v1-feasibility-review-order/v1|fixed-pre-registered-domain";
const CRITERION_ID_DOMAIN = "starlette-v1-feasibility-criterion-id/v1|fixed-pre-registered-domain";
const EXPECTED_COUNTS = Object.freeze({ cases: 6, slices: 12, turns: 101, probes: 8, answers: 36, required: 42, forbidden: 16, critical: 38 });

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

async function readJson(path: string): Promise<any> {
  return JSON.parse(await readFile(path, "utf8"));
}

async function readJsonl(path: string): Promise<any[]> {
  return (await readFile(path, "utf8")).trimEnd().split("\n").map((line) => JSON.parse(line));
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function writeJsonl(path: string, values: unknown[]): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${values.map((value) => JSON.stringify(value)).join("\n")}\n`, "utf8");
}

async function fileEntry(root: string, relativePath: string): Promise<{ path: string; sha256: string }> {
  const path = join(root, relativePath);
  const stat = await lstat(path);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`generated artifact is not a regular file: ${relativePath}`);
  return { path: relativePath, sha256: sha256(await readFile(path)) };
}

function anonymousReviewId(packetId: string): string {
  return `review_${sha256(`${REVIEW_ID_DOMAIN}|${packetId}`).slice(0, 20)}`;
}

function anonymousCriterionId(reviewId: string, canonicalId: string): string {
  return `criterion_${sha256(`${CRITERION_ID_DOMAIN}|${reviewId}|${canonicalId}`).slice(0, 16)}`;
}

function reviewOrderKey(reviewId: string): string {
  return sha256(`${REVIEW_ORDER_DOMAIN}|${reviewId}`);
}

function withoutLatency(report: any): any {
  return {
    version: report.version,
    token_estimator: report.token_estimator,
    case_count: report.case_count,
    cases: report.cases.map((entry: any) => ({
      id: entry.id,
      dimensions: Object.fromEntries(Object.entries(entry.dimensions).map(([name, dimension]: [string, any]) => [
        name,
        Object.fromEntries(Object.entries(dimension).filter(([key]) => key !== "latency_ms")),
      ])),
      d2_vs_d1_tokens: entry.d2_vs_d1_tokens,
    })),
    aggregate: Object.fromEntries(Object.entries(report.aggregate).map(([name, dimension]: [string, any]) => [
      name,
      Object.fromEntries(Object.entries(dimension).filter(([key]) => key !== "latency_ms")),
    ])),
    d2_vs_d1_tokens: report.d2_vs_d1_tokens,
    thresholds: report.thresholds,
    threshold_failures: report.threshold_failures,
    passed: report.passed,
  };
}

test("生成唯一一次 DS-13 official evaluator artifact 与盲审包", async () => {
  const outputRoot = process.env[OUTPUT_ENVIRONMENT_VARIABLE];
  if (!outputRoot || !isAbsolute(outputRoot) || !outputRoot.startsWith("/private/tmp/context-compiler-ds13-official.")) {
    throw new Error(`${OUTPUT_ENVIRONMENT_VARIABLE} must be a unique absolute /private/tmp/context-compiler-ds13-official.* path`);
  }
  await mkdir(outputRoot, { recursive: true });
  if ((await readdir(outputRoot)).length !== 0) throw new Error("official output directory must be empty");

  const [rawBytes, protocolBytes, rawRecords, packetManifest, protocol, built] = await Promise.all([
    readFile(RAW_RESPONSES_PATH),
    readFile(PROTOCOL_PATH),
    readJsonl(RAW_RESPONSES_PATH),
    readJson(PACKET_MANIFEST_PATH),
    readJson(PROTOCOL_PATH),
    buildProtocolCanarySuite(join(REPOSITORY_ROOT, "evaluation/starlette-v1")),
  ]);
  expect(sha256(rawBytes)).toBe(RAW_RESPONSES_SHA256);
  expect(sha256(protocolBytes)).toBe(PROTOCOL_SHA256);
  expect(built.suite.cases).toHaveLength(EXPECTED_COUNTS.slices);
  expect(built.projected_history_turn_count).toBe(EXPECTED_COUNTS.turns);
  expect(built.context_probe_count).toBe(EXPECTED_COUNTS.probes);
  expect(rawRecords).toHaveLength(EXPECTED_COUNTS.answers);

  // This is the sole official evaluator invocation. Do not add another call in this file.
  const report = runEvaluationSuiteV2(built.suite);
  const observedAt = new Date().toISOString();
  const packetsById = new Map(packetManifest.packets.map((entry: any) => [entry.packet_id, entry]));
  const slicesById = new Map(protocol.selected_slices.map((entry: any) => [entry.slice_id, entry]));
  const casesById = new Map(built.suite.cases.map((entry: any) => [entry.id, entry]));
  const executionIndexByPacket = new Map(rawRecords.map((entry: any) => [entry.packet_id, entry.execution_index]));
  const reviewItems: any[] = [];
  const reviewKey: any[] = [];
  const canonicalCriteria = new Map<string, any>();

  for (const record of rawRecords) {
    const packet: any = packetsById.get(record.packet_id);
    if (!packet) throw new Error(`missing packet for ${record.packet_id}`);
    const slice: any = slicesById.get(packet.slice_id);
    const evaluationCase: any = casesById.get(packet.slice_id);
    if (!slice || !evaluationCase) throw new Error(`missing frozen slice for ${packet.slice_id}`);
    if (record.parse_status !== "valid_response_format" || record.cell_status !== "captured") throw new Error("unaccepted raw answer");
    const parsedAnswer = JSON.parse(record.raw_assistant_output);
    if (Object.keys(parsedAnswer).length !== 1 || typeof parsedAnswer.answer !== "string") throw new Error("raw answer contract changed");
    const reviewId = anonymousReviewId(record.packet_id);
    const canonicalEntries = [
      ...slice.answer_checklist.required_items.map((entry: any) => ({ ...entry, type: "required", text: entry.criterion })),
      ...slice.answer_checklist.forbidden_items.map((entry: any) => ({ ...entry, type: "forbidden", text: entry.claim })),
    ];
    const criteria = canonicalEntries.map((entry: any) => {
      canonicalCriteria.set(entry.id, {
        canonical_criterion_id: entry.id,
        slice_id: packet.slice_id,
        type: entry.type,
        text: entry.text,
        fact_ids: entry.fact_ids,
        provenance_event_ids: entry.provenance_event_ids,
        retention_role: entry.retention_role,
        critical: slice.answer_checklist.critical_miss_ids.includes(entry.id),
      });
      return {
        criterion_id: anonymousCriterionId(reviewId, entry.id),
        type: entry.type,
        text: entry.text,
        critical: slice.answer_checklist.critical_miss_ids.includes(entry.id),
      };
    });
    reviewItems.push({
      schema_version: "starlette_blind_review_item/v1",
      review_id: reviewId,
      task: evaluationCase.current_input,
      answer: parsedAnswer.answer,
      criteria,
      judgment_contract: {
        required: ["met", "missed", "uncertain"],
        forbidden: ["not_asserted", "asserted", "uncertain"],
        comments: "optional",
      },
    });
    reviewKey.push({
      review_id: reviewId,
      review_order_key: reviewOrderKey(reviewId),
      execution_index: executionIndexByPacket.get(record.packet_id),
      packet_id: record.packet_id,
      case_id: packet.case_id,
      slice_id: packet.slice_id,
      condition: packet.condition,
      repetition: packet.repetition,
      prompt_sha256: record.prompt_sha256,
      response_sha256: record.response_sha256,
      criteria: canonicalEntries.map((entry: any) => ({
        criterion_id: anonymousCriterionId(reviewId, entry.id),
        canonical_criterion_id: entry.id,
      })),
    });
  }

  reviewItems.sort((left, right) => reviewOrderKey(left.review_id).localeCompare(reviewOrderKey(right.review_id)));
  reviewKey.sort((left, right) => left.review_order_key.localeCompare(right.review_order_key));
  const reviewIds = reviewItems.map((entry) => entry.review_id);
  expect(new Set(reviewIds).size).toBe(EXPECTED_COUNTS.answers);
  expect(reviewKey.map((entry) => entry.review_id)).toEqual(reviewIds);
  expect(canonicalCriteria.size).toBe(EXPECTED_COUNTS.required + EXPECTED_COUNTS.forbidden);
  expect([...canonicalCriteria.values()].filter((entry) => entry.type === "required")).toHaveLength(EXPECTED_COUNTS.required);
  expect([...canonicalCriteria.values()].filter((entry) => entry.type === "forbidden")).toHaveLength(EXPECTED_COUNTS.forbidden);
  expect([...canonicalCriteria.values()].filter((entry) => entry.critical)).toHaveLength(EXPECTED_COUNTS.critical);

  const blankForm = (reviewerSlot: "a" | "b") => reviewItems.map((item) => ({
    schema_version: "starlette_blind_review_form/v1",
    reviewer_slot: reviewerSlot,
    review_id: item.review_id,
    criteria: item.criteria.map((criterion: any) => ({ criterion_id: criterion.criterion_id, judgment: null })),
    comments: null,
  }));
  const adjudicationTemplate = reviewItems.map((item) => ({
    schema_version: "starlette_blind_adjudication/v1",
    review_id: item.review_id,
    criteria: item.criteria.map((criterion: any) => ({
      criterion_id: criterion.criterion_id,
      reviewer_a_judgment: null,
      reviewer_b_judgment: null,
      adjudicated_judgment: null,
      adjudication_reason: null,
    })),
    comments: null,
  }));

  const deterministicReport = withoutLatency(report);
  const automaticSummary = {
    schema_version: "starlette_feasibility_automatic_summary/v1",
    source_identity: {
      atomic_freeze_qa_commit: "8b6512098072a1c4af661a82a45bde2ee1ae7876",
      answer_capture_source_commit: "18a332fd06d7ebdfc8c0007ae1e9250db14c82cf",
      answer_capture_qa_commit: "30e44261c119e03390fd1b7d5af6b480fe2d5180",
      raw_responses_sha256: RAW_RESPONSES_SHA256,
      protocol_sha256: PROTOCOL_SHA256,
    },
    counts: {
      case_count: EXPECTED_COUNTS.cases,
      slice_count: EXPECTED_COUNTS.slices,
      projected_history_turn_count: EXPECTED_COUNTS.turns,
      context_probe_count: EXPECTED_COUNTS.probes,
      answer_count: EXPECTED_COUNTS.answers,
      required_criterion_count: EXPECTED_COUNTS.required,
      forbidden_criterion_count: EXPECTED_COUNTS.forbidden,
      critical_criterion_count: EXPECTED_COUNTS.critical,
      evaluation_run_count: 1,
      model_call_count: 0,
      semantic_score_count: 0,
    },
    lexical_diagnostic_coverage: "3/12 slices, 8 probes",
    semantic_correctness_gate: "pending_human_review",
    context_reduction_interpretation: "pending_correctness_gate",
    operational_stability_gate: "not_evaluated_by_this_work_order",
    evaluator_passed: report.passed,
    evaluator_passed_interpretation: "non_decision_diagnostic",
    resolved_context_metric: "not_evaluable_diagnostic_only",
    d2_uses_human_oracle_state_upper_bound: true,
    deterministic_report: deterministicReport,
  };
  const latencyObservation = {
    schema_version: "starlette_feasibility_latency_observation/v1",
    status: "single_machine_observation_not_operational_stability_evidence",
    observed_at: observedAt,
    environment: {
      node: process.version,
      platform: platform(),
      arch: arch(),
      os_release: release(),
    },
    per_case: report.cases.map((entry: any) => ({
      id: entry.id,
      d0_latency_ms: entry.dimensions.d0.latency_ms,
      d1_latency_ms: entry.dimensions.d1.latency_ms,
      d2_latency_ms: entry.dimensions.d2.latency_ms,
    })),
    aggregate: {
      d0: report.aggregate.d0.latency_ms,
      d1: report.aggregate.d1.latency_ms,
      d2: report.aggregate.d2.latency_ms,
    },
  };
  const boundaryManifest = {
    schema_version: "starlette_feasibility_result_boundary/v1",
    status: "automatic_diagnostic_and_blank_review_bundle_pending_independent_qa",
    official_run_observed_at: observedAt,
    official_evaluation_run_count: 1,
    model_call_count: 0,
    semantic_score_count: 0,
    roots: { public_review: "public-review", internal_audit: "internal-audit" },
    reviewer_exports: {
      reviewer_a: ["public-review/shared", "public-review/reviewer-a"],
      reviewer_b: ["public-review/shared", "public-review/reviewer-b"],
      adjudicator: ["public-review/shared", "public-review/adjudicator"],
    },
    threat_model: {
      reviewer_repository_access_allowed: false,
      reviewer_raw_capture_access_allowed: false,
      reviewer_internal_audit_access_allowed: false,
      reviewer_automatic_report_access_allowed: false,
      reviewer_other_form_access_allowed: false,
      whole_public_review_directory_is_a_reviewer_export: false,
    },
    gates: {
      lexical_diagnostic_coverage: "3/12 slices, 8 probes",
      semantic_correctness_gate: "pending_human_review",
      context_reduction_interpretation: "pending_correctness_gate",
      operational_stability_gate: "not_evaluated_by_this_work_order",
    },
  };

  const sharedReadme = `# Starlette 人工盲评共享材料\n\n本目录只包含随机顺序的匿名任务、回答与预注册判定项。评审者不得访问项目仓库、原始采集、内部映射、自动报告或另一名评审者的表单，也不得尝试反查实验分组。\n\nrequired 项填写 met / missed / uncertain；forbidden 项填写 not_asserted / asserted / uncertain。comments 可选。任何 uncertain 或两名评审者的分歧都留给后续人工裁决。不要改变判定项，也不要在评分完成前请求解盲。\n`;
  const reviewerReadme = (slot: "A" | "B") => `# Reviewer ${slot} 独立表单\n\n只编辑本目录的 reviewer-form.jsonl。保持 review_id、criterion_id、顺序与 JSONL 结构不变，只把 judgment 的 null 替换为允许值，并可填写 comments。不要查看或索取另一名评审者的表单。\n`;
  const adjudicatorReadme = `# 人工裁决空白模板\n\n只有两份独立评分均已返回后才使用本模板。对 uncertain 或分歧项填写 adjudicated_judgment 与 adjudication_reason；本目录不包含任何实验分组映射。\n`;

  await writeJson(join(outputRoot, "boundary-manifest.json"), boundaryManifest);
  await writeJsonl(join(outputRoot, "public-review/shared/review-items.jsonl"), reviewItems);
  await writeFile(join(outputRoot, "public-review/shared/README.md"), sharedReadme, "utf8");
  await writeJsonl(join(outputRoot, "public-review/reviewer-a/reviewer-form.jsonl"), blankForm("a"));
  await writeFile(join(outputRoot, "public-review/reviewer-a/README.md"), reviewerReadme("A"), "utf8");
  await writeJsonl(join(outputRoot, "public-review/reviewer-b/reviewer-form.jsonl"), blankForm("b"));
  await writeFile(join(outputRoot, "public-review/reviewer-b/README.md"), reviewerReadme("B"), "utf8");
  await writeJsonl(join(outputRoot, "public-review/adjudicator/adjudication-template.jsonl"), adjudicationTemplate);
  await writeFile(join(outputRoot, "public-review/adjudicator/README.md"), adjudicatorReadme, "utf8");
  await writeJson(join(outputRoot, "internal-audit/review-key.json"), {
    schema_version: "starlette_feasibility_review_key/v1",
    status: "internal_do_not_export_to_reviewers",
    blinding_domains: { review_id: REVIEW_ID_DOMAIN, review_order: REVIEW_ORDER_DOMAIN, criterion_id: CRITERION_ID_DOMAIN },
    entries: reviewKey,
  });
  await writeJsonl(join(outputRoot, "internal-audit/canonical-criteria.jsonl"), [...canonicalCriteria.values()].sort((a, b) => a.canonical_criterion_id.localeCompare(b.canonical_criterion_id)));
  await writeJson(join(outputRoot, "internal-audit/automatic-report.json"), report);
  await writeJson(join(outputRoot, "internal-audit/automatic-summary.json"), automaticSummary);
  await writeJson(join(outputRoot, "internal-audit/latency-observation.json"), latencyObservation);

  const publicPaths = [
    "public-review/shared/review-items.jsonl", "public-review/shared/README.md",
    "public-review/reviewer-a/reviewer-form.jsonl", "public-review/reviewer-a/README.md",
    "public-review/reviewer-b/reviewer-form.jsonl", "public-review/reviewer-b/README.md",
    "public-review/adjudicator/adjudication-template.jsonl", "public-review/adjudicator/README.md",
  ];
  const internalPaths = [
    "internal-audit/review-key.json", "internal-audit/canonical-criteria.jsonl",
    "internal-audit/automatic-report.json", "internal-audit/automatic-summary.json",
    "internal-audit/latency-observation.json",
  ];
  await writeJson(join(outputRoot, "public-review/public-hashes.json"), {
    schema_version: "starlette_feasibility_public_hashes/v1",
    status: "blank_group_blind_bundle_pending_independent_qa",
    algorithm: "sha256",
    files: await Promise.all(publicPaths.map((path) => fileEntry(outputRoot, path))),
  });
  await writeJson(join(outputRoot, "internal-audit/internal-hashes.json"), {
    schema_version: "starlette_feasibility_internal_hashes/v1",
    status: "internal_do_not_export_to_reviewers",
    algorithm: "sha256",
    files: await Promise.all(internalPaths.map((path) => fileEntry(outputRoot, path))),
  });
  const allPaths = [
    "boundary-manifest.json", ...publicPaths, "public-review/public-hashes.json",
    ...internalPaths, "internal-audit/internal-hashes.json",
  ];
  await writeJson(join(outputRoot, "artifact-hashes.json"), {
    schema_version: "starlette_feasibility_artifact_hashes/v1",
    status: "official_artifact_pending_independent_qa",
    algorithm: "sha256",
    files: await Promise.all(allPaths.map((path) => fileEntry(outputRoot, path))),
  });

  expect((await readdir(outputRoot)).sort()).toEqual(["artifact-hashes.json", "boundary-manifest.json", "internal-audit", "public-review"]);
});
