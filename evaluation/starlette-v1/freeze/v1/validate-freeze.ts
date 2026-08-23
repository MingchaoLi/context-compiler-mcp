import { createHash } from "node:crypto";
import { lstat, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";
// @ts-expect-error JavaScript fixture utility has no declaration file.
import { validateProtocolCanary } from "../../protocol-canary/validate-protocol-canary.mjs";
import { generateRunInputs } from "./generate-run-inputs.js";

const FIXED_RULE = "Mark confirmed only when a public repository explicitly reuses the same Starlette issue or fix as an LLM, agent, benchmark, code-repair, or evaluation task, or highly copies that task or patch. Ordinary downstream references, vendored source, production workarounds, repository names that merely contain agent or SWE, and retrieved-context noise unrelated to the task, Gold, or answer do not count.";
const CASE_ORDER = Object.freeze(["STR-07", "STR-08", "STR-05", "STR-06", "STR-01", "STR-04"]);
const SLICE_ORDER = Object.freeze([
  "STR-07/T4", "STR-07/T10", "STR-08/T3", "STR-08/T4",
  "STR-05/T7", "STR-05/T9", "STR-06/T4", "STR-06/T16",
  "STR-01/T4", "STR-01/T18", "STR-04/T4", "STR-04/T18",
]);
const SOURCE_NUMBERS = Object.freeze({
  "STR-07": Object.freeze([1008, 1010]),
  "STR-08": Object.freeze([1298]),
  "STR-05": Object.freeze([1083, 1377, 1683]),
  "STR-06": Object.freeze([1365, 1366, 1410]),
  "STR-01": Object.freeze([495, 500, 1692]),
  "STR-04": Object.freeze([685, 1286, 1649, 2349]),
});
const FILE_CONTRACT = Object.freeze([
  Object.freeze({ path: "freeze/v1/generate-run-inputs.ts", sha256: "88d020cbccbff17b1cae8a1b52ba67c9c2c59d023fdeaa11187feed835412868" }),
  Object.freeze({ path: "freeze/v1/answer-inputs.jsonl", sha256: "503441186a90efe93a93b04e53b350737877bfb941f48eb91e610144a3a52675" }),
  Object.freeze({ path: "freeze/v1/packet-manifest.json", sha256: "74d45b359b15087e1858face1076113809f2938be7599bf8e79b054b1b54d982" }),
  Object.freeze({ path: "freeze/v1/contamination-snapshot-pre-run.json", sha256: "9ad86c9acee5071dadc210d20fe6bd09e1c90de13c82ddcc3bedea5883469659" }),
  Object.freeze({ path: "freeze/v1/run-contract.json", sha256: "7cafe30a138c056da46b0f629e97fb2b0d2bcb096a8111db5ff90594206be85b" }),
  Object.freeze({ path: "freeze/v1/freeze-manifest.json", sha256: "58b5fb95f230645e0a47fcd97695668f1ce74241a8a75214992c9e6c55d7d6bc" }),
  Object.freeze({ path: "freeze/v1/freeze-hashes.json", sha256: "ad1661dcf2875b49354c04a33065afd4c70a83d1951ebda2f3aa29c4bf1247db" }),
]);
const PROMOTION_HASH = "c216719f1745601786ad53f50bbaed6c5e7b0a8e8d9d6612cfb79b9c103ff51b";
const PROTOCOL_HASH = "fde44511237c1a16d317131122461461c788b175b102592f22d6a656cfd6e99a";
const PRIOR_SCAN_HASH = "d3fe578e8f9b70eaba48ae24d4fdb13615104b27de11ca7d5b2ae3906fd98dd2";
const FORBIDDEN_CONTROL = /[\p{Cf}\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u;

export class FreezeValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FreezeValidationError";
  }
}

function fail(path: string, message: string): never {
  throw new FreezeValidationError(`${path}: ${message}`);
}

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function object(value: unknown, path: string): Record<string, any> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) fail(path, "expected object");
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) fail(path, "expected plain object");
  return value as Record<string, any>;
}

function exact(value: unknown, keys: readonly string[], path: string): Record<string, any> {
  const target = object(value, path);
  const actual = Object.keys(target).sort();
  const expected = [...keys].sort();
  if (!isDeepStrictEqual(actual, expected)) fail(path, `expected keys ${expected.join(",")}; got ${actual.join(",")}`);
  return target;
}

function array(value: unknown, path: string): any[] {
  if (!Array.isArray(value)) fail(path, "expected array");
  return value;
}

function string(value: unknown, path: string): string {
  if (typeof value !== "string" || value.length === 0 || FORBIDDEN_CONTROL.test(value)) fail(path, "expected non-empty clean string");
  return value;
}

function bool(value: unknown, path: string): boolean {
  if (typeof value !== "boolean") fail(path, "expected boolean");
  return value;
}

function integer(value: unknown, path: string, minimum = 0): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum) fail(path, `expected integer >= ${minimum}`);
  return value as number;
}

function assertCleanStrings(value: unknown, path: string): void {
  if (typeof value === "string") {
    string(value, path);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertCleanStrings(entry, `${path}[${index}]`));
    return;
  }
  if (value !== null && typeof value === "object") {
    for (const [key, entry] of Object.entries(value)) {
      string(key, `${path}.<key>`);
      assertCleanStrings(entry, `${path}.${key}`);
    }
  }
}

async function regularFile(path: string): Promise<Buffer> {
  const metadata = await lstat(path);
  if (!metadata.isFile() || metadata.isSymbolicLink()) fail(path, "expected regular file");
  return readFile(path);
}

async function readJson(path: string): Promise<any> {
  const raw = await regularFile(path);
  let value: unknown;
  try {
    value = JSON.parse(raw.toString("utf8"));
  } catch {
    fail(path, "invalid JSON");
  }
  assertCleanStrings(value, path);
  return value;
}

async function hashFile(path: string): Promise<string> {
  return sha256(await regularFile(path));
}

function exactValue(actual: unknown, expected: unknown, path: string): void {
  if (!isDeepStrictEqual(actual, expected)) fail(path, "fixed value changed");
}

function validateSnapshot(snapshot: any): void {
  const path = "freeze/v1/contamination-snapshot-pre-run.json";
  const target = exact(snapshot, [
    "schema_version", "snapshot_id", "rule_version", "evidence_cutoff_at", "scan_observed_at",
    "prior_snapshot", "rule", "search_capabilities", "results", "model_run_gate", "limitations",
  ], path);
  exactValue(target.schema_version, "starlette-contamination-snapshot/v1", `${path}.schema_version`);
  exactValue(target.rule_version, "starlette-contamination-rule/v1", `${path}.rule_version`);
  exactValue(target.rule, FIXED_RULE, `${path}.rule`);
  exactValue(target.model_run_gate, "eligible_pending_independent_qa", `${path}.model_run_gate`);
  const observedAt = string(target.scan_observed_at, `${path}.scan_observed_at`);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(observedAt) || Number.isNaN(new Date(observedAt).valueOf())) fail(path, "scan time is not canonical UTC");
  const prior = exact(target.prior_snapshot, ["path", "sha256"], `${path}.prior_snapshot`);
  exactValue(prior, {
    path: "promotion/contamination-snapshot-freeze-candidate.json",
    sha256: PRIOR_SCAN_HASH,
  }, `${path}.prior_snapshot`);
  const capabilities = exact(target.search_capabilities, [
    "github_code_search_api", "github_public_code_search_ui", "web_index_exact_path_search",
  ], `${path}.search_capabilities`);
  exactValue(capabilities, {
    github_code_search_api: "unavailable_in_current_tooling",
    github_public_code_search_ui: "unavailable_in_current_tooling",
    web_index_exact_path_search: "completed_with_index_limitations",
  }, `${path}.search_capabilities`);
  const results = array(target.results, `${path}.results`);
  if (results.length !== CASE_ORDER.length) fail(`${path}.results`, "expected six cases");
  results.forEach((entry, index) => {
    const item = exact(entry, [
      "candidate_id", "source_numbers", "queries", "status", "eligibility",
      "blind_eligibility", "direct_evidence", "excluded_hits", "notes",
    ], `${path}.results[${index}]`);
    const caseId = CASE_ORDER[index]!;
    exactValue(item.candidate_id, caseId, `${path}.results[${index}].candidate_id`);
    exactValue(item.source_numbers, SOURCE_NUMBERS[caseId as keyof typeof SOURCE_NUMBERS], `${path}.results[${index}].source_numbers`);
    if (array(item.queries, `${path}.results[${index}].queries`).length < 2) fail(path, "each case needs legacy/current queries");
    item.queries.forEach((query: unknown, queryIndex: number) => string(query, `${path}.results[${index}].queries[${queryIndex}]`));
    exactValue(item.status, "no_public_hit_found", `${path}.results[${index}].status`);
    exactValue(item.eligibility, "eligible_as_of_snapshot", `${path}.results[${index}].eligibility`);
    if (!bool(item.blind_eligibility, `${path}.results[${index}].blind_eligibility`)) fail(path, "blind eligibility must remain true");
    if (array(item.direct_evidence, `${path}.results[${index}].direct_evidence`).length !== 0) fail(path, "unexpected direct evidence");
    array(item.excluded_hits, `${path}.results[${index}].excluded_hits`);
    string(item.notes, `${path}.results[${index}].notes`);
  });
  if (!string(target.limitations, `${path}.limitations`).includes("not absence proof")) fail(path, "index limitation disclosure removed");
}

function validateRunContract(contract: any): void {
  const path = "freeze/v1/run-contract.json";
  const target = exact(contract, [
    "schema_version", "status", "purpose", "transport", "design", "attempt_policy",
    "response_contract", "capture_contract", "judging_contract", "interpretation_limits", "authorization",
  ], path);
  exactValue(target.schema_version, "starlette-answer-run-contract/v1", `${path}.schema_version`);
  exactValue(target.status, "planned_not_authorized_pending_freeze_qa", `${path}.status`);
  exactValue(target.purpose, "single_repetition_feasibility_only", `${path}.purpose`);
  const transport = target.transport;
  exactValue({
    kind: transport.kind,
    model_alias: transport.model_alias,
    model_family_constraint: transport.model_family_constraint,
    reasoning_effort: transport.reasoning_effort,
    session_count: transport.session_count,
    fresh_session_per_packet: transport.fresh_session_per_packet,
    fork_turns: transport.fork_turns,
    packets_per_session: transport.packets_per_session,
    tools_allowed: transport.tools_allowed,
    network_allowed: transport.network_allowed,
    repository_access_allowed: transport.repository_access_allowed,
  }, {
    kind: "codex_collaboration_agent_session",
    model_alias: "gpt-5.6-terra",
    model_family_constraint: "non-sol",
    reasoning_effort: "medium",
    session_count: 36,
    fresh_session_per_packet: true,
    fork_turns: "none",
    packets_per_session: 1,
    tools_allowed: false,
    network_allowed: false,
    repository_access_allowed: false,
  }, `${path}.transport`);
  exactValue(target.design.conditions, ["d0", "d1", "d2"], `${path}.design.conditions`);
  for (const [key, expected] of Object.entries({
    case_count: 6, slice_count: 12, repetitions_per_cell: 1, total_cells: 36,
  })) exactValue(target.design[key], expected, `${path}.design.${key}`);
  exactValue(target.design.execution_order_algorithm, "ascending_sha256(starlette-v1-run-order/v1|packet_id)", `${path}.design.execution_order_algorithm`);
  exactValue(target.design.condition_order_adaptation_allowed, false, `${path}.design.condition_order_adaptation_allowed`);
  exactValue(target.design.answer_or_rubric_sharing_between_sessions, false, `${path}.design.answer_or_rubric_sharing_between_sessions`);
  const attempts = target.attempt_policy;
  exactValue([attempts.attempts_per_cell, attempts.adaptive_retry_allowed, attempts.best_of_allowed, attempts.single_cell_retry_allowed], [1, false, false, false], `${path}.attempt_policy`);
  exactValue(target.response_contract, {
    format: "single_json_object", exact_keys: ["answer"], answer_language: "English",
    maximum_words: 250, markdown_wrapper_allowed: false, raw_output_rewriting_allowed: false,
  }, `${path}.response_contract`);
  exactValue(target.capture_contract.temperature, "unavailable", `${path}.capture_contract.temperature`);
  exactValue(target.capture_contract.seed, "unavailable", `${path}.capture_contract.seed`);
  exactValue(target.capture_contract.backend_build, "unavailable", `${path}.capture_contract.backend_build`);
  exactValue(target.capture_contract.billed_tokens, "unavailable", `${path}.capture_contract.billed_tokens`);
  exactValue([target.judging_contract.semantic_reviewers_required, target.judging_contract.reviewer_type, target.judging_contract.model_judge_allowed], [2, "condition_blind_human", false], `${path}.judging_contract`);
  exactValue(target.interpretation_limits.d2_typed_state_upper_bound_must_be_disclosed, true, `${path}.interpretation_limits`);
  exactValue(target.interpretation_limits.d2_automatic_extractor_end_to_end_claim_allowed, false, `${path}.interpretation_limits`);
  exactValue(target.authorization, {
    model_run_count_in_this_work_order: 0,
    model_calls_authorized_in_this_work_order: false,
    next_work_order_maximum_calls_after_independent_qa_pass: 36,
    independent_qa_pass_required: true,
  }, `${path}.authorization`);
}

async function validateFreezeManifest(root: string, manifest: any): Promise<void> {
  const path = "freeze/v1/freeze-manifest.json";
  const target = exact(manifest, [
    "schema_version", "freeze_id", "status", "effective_state_after_qa_pass",
    "underlying_legacy_statuses_remain_candidate", "git_commit_chain", "canonical_data",
    "protocol", "selection", "pre_run_contamination", "answer_inputs", "immutability", "authorization",
  ], path);
  exactValue([target.schema_version, target.freeze_id, target.status, target.effective_state_after_qa_pass], [
    "starlette-atomic-freeze/v1", "starlette-v1-data-protocol-answer-inputs",
    "freeze_candidate_pending_independent_qa", "frozen_by_manifest",
  ], path);
  if (!bool(target.underlying_legacy_statuses_remain_candidate, `${path}.underlying_legacy_statuses_remain_candidate`)) fail(path, "legacy status disclosure changed");
  exactValue(target.git_commit_chain, {
    canonical_data_builder_candidate: "4b974538d76d0e0d8a5ac17c5662533b714ef00e",
    canonical_data_qa_commit: "2012961d9409f6c957d344c5432a701a1c15f8e7",
    protocol_builder_candidate: "bc78c42505c34ae6f3220db49b2e5a5af905d0eb",
    protocol_qa_commit: "44c9756b041601fa7f287c834157439ac77fec3f",
  }, `${path}.git_commit_chain`);
  const promotionHashes = await readJson(join(root, "promotion-hashes.json"));
  const protocolHashes = await readJson(join(root, "protocol-canary/protocol-hashes.json"));
  exactValue(target.canonical_data.hash_manifest_path, "promotion-hashes.json", `${path}.canonical_data.hash_manifest_path`);
  exactValue(target.canonical_data.hash_manifest_sha256, PROMOTION_HASH, `${path}.canonical_data.hash_manifest_sha256`);
  exactValue(target.canonical_data.expanded_files, promotionHashes.files, `${path}.canonical_data.expanded_files`);
  exactValue(target.protocol.hash_manifest_path, "protocol-canary/protocol-hashes.json", `${path}.protocol.hash_manifest_path`);
  exactValue(target.protocol.hash_manifest_sha256, PROTOCOL_HASH, `${path}.protocol.hash_manifest_sha256`);
  exactValue(target.protocol.expanded_files, protocolHashes.files, `${path}.protocol.expanded_files`);
  exactValue(target.selection.case_order, CASE_ORDER, `${path}.selection.case_order`);
  exactValue(target.selection.slice_order, SLICE_ORDER, `${path}.selection.slice_order`);
  exactValue(target.selection.counts, {
    case_count: 6, slice_count: 12, projected_history_turn_count: 101,
    context_probe_count: 8, required_answer_item_count: 42,
    forbidden_answer_item_count: 16, critical_item_count: 38,
  }, `${path}.selection.counts`);
  exactValue(target.immutability, {
    canonical_payload_mutation_authorized: false,
    protocol_mutation_authorized: false,
    case_reselection_authorized: false,
    packet_regeneration_after_freeze_authorized: false,
    new_version_required_for_change: true,
  }, `${path}.immutability`);
  exactValue(target.authorization, {
    model_calls_in_builder_work_order: 0,
    evaluator_runs_in_builder_work_order: 0,
    model_run_authorized_by_this_manifest: false,
    independent_qa_pass_required: true,
    next_work_order_maximum_model_calls_after_qa_pass: 36,
  }, `${path}.authorization`);
  for (const [section, relativePath] of [
    ["pre_run_contamination", "freeze/v1/contamination-snapshot-pre-run.json"],
    ["answer_inputs", "freeze/v1/generate-run-inputs.ts"],
  ] as const) {
    if (target[section].path && target[section].path !== relativePath) fail(`${path}.${section}.path`, "path changed");
  }
  exactValue(target.pre_run_contamination.sha256, await hashFile(join(root, "freeze/v1/contamination-snapshot-pre-run.json")), `${path}.pre_run_contamination.sha256`);
  exactValue(target.answer_inputs.generator_sha256, await hashFile(join(root, "freeze/v1/generate-run-inputs.ts")), `${path}.answer_inputs.generator_sha256`);
  exactValue(target.answer_inputs.jsonl_sha256, await hashFile(join(root, "freeze/v1/answer-inputs.jsonl")), `${path}.answer_inputs.jsonl_sha256`);
  exactValue(target.answer_inputs.packet_manifest_sha256, await hashFile(join(root, "freeze/v1/packet-manifest.json")), `${path}.answer_inputs.packet_manifest_sha256`);
  exactValue(target.answer_inputs.run_contract_sha256, await hashFile(join(root, "freeze/v1/run-contract.json")), `${path}.answer_inputs.run_contract_sha256`);
}

async function readJsonl(path: string): Promise<any[]> {
  const raw = (await regularFile(path)).toString("utf8");
  if (!raw.endsWith("\n")) fail(path, "JSONL must end with newline");
  const lines = raw.trimEnd().split("\n");
  const parsed = lines.map((line, index) => {
    let value: unknown;
    try {
      value = JSON.parse(line);
    } catch {
      fail(`${path}:${index + 1}`, "invalid JSON");
    }
    assertCleanStrings(value, `${path}:${index + 1}`);
    return value;
  });
  return parsed;
}

function validatePackets(answerInputs: any[], packetManifest: any): void {
  if (answerInputs.length !== 36) fail("freeze/v1/answer-inputs.jsonl", "expected 36 packets");
  const ids = answerInputs.map((entry, index) => {
    const packet = exact(entry, [
      "schema_version", "packet_id", "system_instruction", "user_prompt", "response_contract", "prompt_sha256",
    ], `freeze/v1/answer-inputs.jsonl:${index + 1}`);
    exactValue(packet.schema_version, "starlette-answer-input/v1", `answer_inputs[${index}].schema_version`);
    const packetId = string(packet.packet_id, `answer_inputs[${index}].packet_id`);
    if (!/^pkt_[a-f0-9]{20}$/.test(packetId)) fail(`answer_inputs[${index}].packet_id`, "not opaque");
    const prompt = string(packet.user_prompt, `answer_inputs[${index}].user_prompt`);
    if (/STR-\d{2}\/T\d+|\b(?:case_id|slice_id|condition)\b\s*[:=]/iu.test(prompt)) fail(`answer_inputs[${index}].user_prompt`, "case/slice/condition label leaked");
    if (/Fact Gold|Decision Reference|Outcome Anchor|answer_checklist|required_items|forbidden_items/iu.test(prompt)) fail(`answer_inputs[${index}].user_prompt`, "Gold or rubric label leaked");
    const expectedPromptHash = sha256(`${packet.system_instruction}\n\n${prompt}`);
    exactValue(packet.prompt_sha256, expectedPromptHash, `answer_inputs[${index}].prompt_sha256`);
    exactValue(packet.response_contract, {
      format: "single_json_object", exact_keys: ["answer"], answer_language: "English",
      maximum_words: 250, markdown_wrapper_allowed: false,
    }, `answer_inputs[${index}].response_contract`);
    return packetId;
  });
  if (new Set(ids).size !== ids.length) fail("freeze/v1/answer-inputs.jsonl", "duplicate packet id");
  exactValue(ids, [...ids].sort(), "freeze/v1/answer-inputs.jsonl packet order");

  const manifest = exact(packetManifest, [
    "schema_version", "status", "source_identity", "renderer_contract", "counts",
    "packets", "execution_order", "generation_counters",
  ], "freeze/v1/packet-manifest.json");
  exactValue(manifest.counts, {
    case_count: 6, slice_count: 12, condition_count: 3, repetition_count: 1, packet_count: 36,
  }, "freeze/v1/packet-manifest.json.counts");
  exactValue(manifest.generation_counters, {
    evaluation_run_count: 0, model_call_count: 0, answer_artifact_count: 0,
  }, "freeze/v1/packet-manifest.json.generation_counters");
  exactValue(manifest.renderer_contract.d2_uses_human_oracle_state_upper_bound, true, "packet-manifest.renderer_contract");
  exactValue(manifest.renderer_contract.automatic_extractor_evaluated, false, "packet-manifest.renderer_contract");
  exactValue(manifest.renderer_contract.headline_or_recall_used, false, "packet-manifest.renderer_contract");
  const packets = array(manifest.packets, "freeze/v1/packet-manifest.json.packets");
  if (packets.length !== 36) fail("freeze/v1/packet-manifest.json.packets", "expected 36 entries");
  const seenCells = new Set<string>();
  const byId = new Map<string, any>();
  for (const entry of packets) {
    const cell = `${entry.slice_id}|${entry.condition}|${entry.repetition}`;
    if (seenCells.has(cell)) fail("packet-manifest.packets", "duplicate cell");
    seenCells.add(cell);
    byId.set(entry.packet_id, entry);
    if (!SLICE_ORDER.includes(entry.slice_id)) fail("packet-manifest.packets", "unregistered slice");
    if (!["d0", "d1", "d2"].includes(entry.condition) || entry.repetition !== 1) fail("packet-manifest.packets", "invalid condition/repetition");
    exactValue(entry.case_id, entry.slice_id.split("/")[0], "packet-manifest.packets.case_id");
    exactValue(entry.oracle_state_upper_bound, entry.condition === "d2", "packet-manifest.packets.oracle_state_upper_bound");
  }
  if (seenCells.size !== 36 || byId.size !== 36) fail("packet-manifest.packets", "incomplete design");
  const order = array(manifest.execution_order, "packet-manifest.execution_order");
  const expectedOrder = [...ids].sort((left, right) =>
    sha256(`starlette-v1-run-order/v1|${left}`).localeCompare(sha256(`starlette-v1-run-order/v1|${right}`)),
  );
  exactValue(order, expectedOrder, "packet-manifest.execution_order");
  const currentBySlice = new Map<string, string>();
  for (const entry of packets) {
    const prior = currentBySlice.get(entry.slice_id);
    if (prior && prior !== entry.current_input_sha256) fail("packet-manifest.packets", "Current Task differs across conditions");
    currentBySlice.set(entry.slice_id, entry.current_input_sha256);
  }
  for (const packet of answerInputs) {
    const entry = byId.get(packet.packet_id);
    if (!entry || entry.prompt_sha256 !== packet.prompt_sha256) fail("answer-inputs", "packet manifest mapping mismatch");
    const match = packet.user_prompt.match(/--- BEGIN HISTORICAL SNAPSHOT ---\n([\s\S]*)\n--- END HISTORICAL SNAPSHOT ---/u);
    if (!match) fail("answer-inputs.user_prompt", "snapshot markers missing");
    exactValue(sha256(match[1]!), entry.context_sha256, "packet-manifest.context_sha256");
  }
}

function validateFreezeHashes(value: any): void {
  const path = "freeze/v1/freeze-hashes.json";
  const target = exact(value, ["schema_version", "status", "algorithm", "source_identity", "files"], path);
  exactValue([
    target.schema_version, target.status, target.algorithm,
  ], [
    "starlette-atomic-freeze-hashes/v1", "freeze_candidate_pending_independent_qa", "sha256",
  ], path);
  exactValue(target.source_identity, {
    canonical_data_qa_commit: "2012961d9409f6c957d344c5432a701a1c15f8e7",
    protocol_qa_commit: "44c9756b041601fa7f287c834157439ac77fec3f",
  }, `${path}.source_identity`);
  exactValue(target.files, FILE_CONTRACT.filter((entry) => entry.path !== path), `${path}.files`);
}

export async function validateAtomicFreeze(root: string): Promise<Record<string, string | number | boolean>> {
  const targetRoot = resolve(root);
  await validateProtocolCanary(targetRoot);
  for (const entry of FILE_CONTRACT) {
    const actual = await hashFile(join(targetRoot, entry.path));
    if (actual !== entry.sha256) fail(entry.path, "fixed freeze file contract changed");
  }
  const [snapshot, runContract, freezeManifest, freezeHashes, packetManifest, answerInputs, generated] = await Promise.all([
    readJson(join(targetRoot, "freeze/v1/contamination-snapshot-pre-run.json")),
    readJson(join(targetRoot, "freeze/v1/run-contract.json")),
    readJson(join(targetRoot, "freeze/v1/freeze-manifest.json")),
    readJson(join(targetRoot, "freeze/v1/freeze-hashes.json")),
    readJson(join(targetRoot, "freeze/v1/packet-manifest.json")),
    readJsonl(join(targetRoot, "freeze/v1/answer-inputs.jsonl")),
    generateRunInputs(targetRoot),
  ]);
  validateSnapshot(snapshot);
  validateRunContract(runContract);
  await validateFreezeManifest(targetRoot, freezeManifest);
  validateFreezeHashes(freezeHashes);
  validatePackets(answerInputs, packetManifest);
  if (!isDeepStrictEqual(answerInputs, generated.answerInputs)) fail("freeze/v1/answer-inputs.jsonl", "not a deterministic renderer rebuild");
  if (!isDeepStrictEqual(packetManifest, generated.packetManifest)) fail("freeze/v1/packet-manifest.json", "not a deterministic renderer rebuild");
  return {
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
  };
}

const currentPath = fileURLToPath(import.meta.url);
if (resolve(process.argv[1] ?? "") === currentPath) {
  const root = resolve(process.argv[2] ?? join(dirname(currentPath), "../.."));
  try {
    process.stdout.write(`${JSON.stringify(await validateAtomicFreeze(root))}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? `${error.name}: ${error.message}` : "FreezeValidationError"}\n`);
    process.exitCode = 1;
  }
}
