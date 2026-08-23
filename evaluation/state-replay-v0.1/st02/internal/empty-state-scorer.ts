import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { lstat, readdir, readFile } from "node:fs/promises";
import { dirname, join, posix, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";
import { buildNextPacketFromCapture } from "../runtime.js";

const THIS_DIRECTORY = dirname(fileURLToPath(import.meta.url));
export const DEFAULT_REPOSITORY_ROOT = join(THIS_DIRECTORY, "../../../..");
const DEFAULT_FIXTURE_ROOT = join(THIS_DIRECTORY, "../..");
const REPOSITORY_FIXTURE_ROOT = "evaluation/state-replay-v0.1";
const SCORING_CONTRACT_PATH = "st02/internal/scoring-contract.json";
const FIXED_SCORING_CONTRACT_REPOSITORY_PATH = `${REPOSITORY_FIXTURE_ROOT}/${SCORING_CONTRACT_PATH}`;
const FORBIDDEN_CONTROL = /[\p{Cf}\u0000-\u001f\u007f]/u;
const DELTA_ARRAY_KEYS = [
  "new_goals",
  "updated_goals",
  "new_constraints",
  "updated_constraints",
  "new_decisions",
  "resolved_questions",
  "new_open_questions",
  "rejected_alternatives",
  "supersessions",
  "new_relations",
] as const;

export const ACCEPTED_EMPTY_STATE_SCORING_CONTRACT = Object.freeze({
  commit: "00a71dd55ab3fafb844fb44dfb584f1d8f7008f8",
  parent: "4415f4bafb6d76fecde26ddef1e0060c6a666f84",
  blob: "c461cad2fd310e044dce844c15cd481c3ac7d346",
  sha256: "b406bd5198801d9968fb9c78597f60489e73efc84866151cd2a61be1d72be9c9",
});

type JsonRecord = Record<string, any>;

interface TreeEntry {
  repositoryPath: string;
  relativePath: string;
  blob: string;
}

interface ScoringOptions {
  fixture_root?: string;
}

export class EmptyStateScoringError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EmptyStateScoringError";
  }
}

function fail(path: string, message: string): never {
  throw new EmptyStateScoringError(`${path}: ${message}`);
}

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function gitBuffer(repositoryRoot: string, args: readonly string[]): Promise<Buffer> {
  return new Promise((resolvePromise, rejectPromise) => {
    execFile(
      "git",
      ["-C", repositoryRoot, ...args],
      { encoding: "buffer", maxBuffer: 32 * 1024 * 1024 },
      (error, stdout) => {
        if (error) rejectPromise(error);
        else resolvePromise(Buffer.from(stdout));
      },
    );
  });
}

async function gitText(repositoryRoot: string, args: readonly string[]): Promise<string> {
  return (await gitBuffer(repositoryRoot, args)).toString("utf8").trim();
}

function assertSafeText(value: string, path: string): void {
  if (value !== value.normalize("NFC")) fail(path, "must use NFC-normalized Unicode");
  if (FORBIDDEN_CONTROL.test(value)) fail(path, "contains forbidden Unicode/control characters");
}

function assertSafeRelativePath(value: string, path: string): void {
  assertSafeText(value, path);
  if (value.length === 0 || value.startsWith("/") || value.includes("\\")) fail(path, "unsafe relative path");
  if (posix.normalize(value) !== value || value.split("/").some((part) => part === "." || part === ".." || part.length === 0)) {
    fail(path, "non-canonical relative path");
  }
}

async function readRegularFile(path: string): Promise<Buffer> {
  const stat = await lstat(path).catch(() => fail(path, "missing file"));
  if (!stat.isFile() || stat.isSymbolicLink()) fail(path, "expected regular non-symlink file");
  return readFile(path);
}

async function validateCommit(repositoryRoot: string, commit: string, parent: string, path: string): Promise<void> {
  const resolved = await gitText(repositoryRoot, ["rev-parse", `${commit}^{commit}`]).catch(() => fail(path, "fixed commit unavailable"));
  if (resolved !== commit) fail(path, "fixed commit identity changed");
  const actualParent = await gitText(repositoryRoot, ["show", "-s", "--format=%P", commit]);
  if (actualParent !== parent) fail(path, "fixed parent changed");
}

async function validateScoringContractAnchor(repositoryRoot: string, fixtureRoot: string): Promise<Buffer> {
  const fixed = ACCEPTED_EMPTY_STATE_SCORING_CONTRACT;
  await validateCommit(repositoryRoot, fixed.commit, fixed.parent, "scoring_contract.commit");
  const blob = await gitText(repositoryRoot, ["rev-parse", `${fixed.commit}:${FIXED_SCORING_CONTRACT_REPOSITORY_PATH}`]);
  if (blob !== fixed.blob) fail("scoring_contract.blob", "fixed blob changed");
  const fixedBytes = await gitBuffer(repositoryRoot, ["cat-file", "blob", blob]);
  if (sha256(fixedBytes) !== fixed.sha256) fail("scoring_contract.sha256", "fixed bytes changed");
  const currentBytes = await readRegularFile(join(fixtureRoot, SCORING_CONTRACT_PATH));
  if (!currentBytes.equals(fixedBytes)) fail("scoring_contract.current", "current bytes differ from fixed scoring-contract Git blob");
  return currentBytes;
}

function expectedDirectories(entries: readonly TreeEntry[]): Set<string> {
  const result = new Set<string>([""]);
  for (const entry of entries) {
    const parts = entry.relativePath.split("/");
    for (let length = 1; length < parts.length; length += 1) result.add(parts.slice(0, length).join("/"));
  }
  return result;
}

async function currentTreePaths(root: string): Promise<{ files: string[]; directories: string[] }> {
  const rootStat = await lstat(root).catch(() => fail(root, "missing directory"));
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) fail(root, "expected physical non-symlink directory");
  const files: string[] = [];
  const directories: string[] = [""];
  const visit = async (relative: string): Promise<void> => {
    const absolute = relative.length === 0 ? root : join(root, ...relative.split("/"));
    const entries = await readdir(absolute, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    const names = new Set<string>();
    for (const entry of entries) {
      assertSafeText(entry.name, `${absolute}.entry`);
      if (names.has(entry.name)) fail(absolute, `duplicate directory entry ${entry.name}`);
      names.add(entry.name);
      const child = relative.length === 0 ? entry.name : `${relative}/${entry.name}`;
      assertSafeRelativePath(child, `${absolute}.entry`);
      if (entry.isSymbolicLink()) fail(join(root, ...child.split("/")), "symlink is forbidden");
      if (entry.isDirectory()) {
        directories.push(child);
        await visit(child);
      } else if (entry.isFile()) {
        files.push(child);
      } else {
        fail(join(root, ...child.split("/")), "unknown filesystem entry type");
      }
    }
  };
  await visit("");
  return { files: files.sort(), directories: directories.sort() };
}

async function validateFixedTree(
  repositoryRoot: string,
  fixtureRoot: string,
  commit: string,
  repositoryPath: string,
  expectedTree: string,
  label: string,
): Promise<Map<string, Buffer>> {
  assertSafeRelativePath(repositoryPath, `${label}.repository_path`);
  const actualTree = await gitText(repositoryRoot, ["rev-parse", `${commit}:${repositoryPath}`]);
  if (actualTree !== expectedTree) fail(`${label}.tree`, "fixed tree changed");
  const raw = await gitBuffer(repositoryRoot, ["ls-tree", "-r", "-z", "--full-tree", commit, "--", repositoryPath]);
  const records = raw.toString("utf8").split("\0").filter((entry) => entry.length > 0);
  const entries: TreeEntry[] = records.map((record, index) => {
    const tab = record.indexOf("\t");
    if (tab < 0) fail(`${label}.ls_tree[${index}]`, "missing path separator");
    const header = record.slice(0, tab).split(" ");
    const path = record.slice(tab + 1);
    if (header.length !== 3 || header[0] !== "100644" || header[1] !== "blob" || !/^[a-f0-9]{40}$/.test(header[2])) {
      fail(`${label}.ls_tree[${index}]`, "only regular 100644 blobs are allowed");
    }
    const prefix = `${repositoryPath}/`;
    if (!path.startsWith(prefix)) fail(`${label}.ls_tree[${index}]`, "path escaped fixed tree");
    const relativePath = path.slice(prefix.length);
    assertSafeRelativePath(relativePath, `${label}.ls_tree[${index}].path`);
    return { repositoryPath: path, relativePath, blob: header[2] };
  });
  if (entries.length === 0) fail(label, "fixed tree is empty");
  const expectedFiles = entries.map((entry) => entry.relativePath).sort();
  if (new Set(expectedFiles).size !== expectedFiles.length) fail(label, "duplicate fixed paths");
  const currentRoot = join(fixtureRoot, ...repositoryPath.slice(`${REPOSITORY_FIXTURE_ROOT}/`.length).split("/"));
  const current = await currentTreePaths(currentRoot);
  if (!isDeepStrictEqual(current.files, expectedFiles)) fail(label, "current file path allowlist differs from fixed Git tree");
  if (!isDeepStrictEqual(current.directories, [...expectedDirectories(entries)].sort())) {
    fail(label, "current directory allowlist differs from fixed Git tree");
  }
  const buffers = new Map<string, Buffer>();
  for (const entry of entries) {
    const fixedBytes = await gitBuffer(repositoryRoot, ["cat-file", "blob", entry.blob]);
    const currentBytes = await readRegularFile(join(currentRoot, ...entry.relativePath.split("/")));
    if (!currentBytes.equals(fixedBytes)) fail(`${label}.${entry.relativePath}`, "current bytes differ from fixed Git blob");
    buffers.set(entry.relativePath, currentBytes);
  }
  return buffers;
}

async function validateCurrentRuntimeAtCapture(repositoryRoot: string, fixtureRoot: string, captureCommit: string): Promise<void> {
  const relativePath = "st02/runtime.ts";
  const repositoryPath = `${REPOSITORY_FIXTURE_ROOT}/${relativePath}`;
  const blob = await gitText(repositoryRoot, ["rev-parse", `${captureCommit}:${repositoryPath}`]);
  const fixedBytes = await gitBuffer(repositoryRoot, ["cat-file", "blob", blob]);
  const currentBytes = await readRegularFile(join(fixtureRoot, relativePath));
  if (!currentBytes.equals(fixedBytes)) fail("capture_runtime.current", "runtime bytes differ from fixed capture Git object");
}

function parseJson(bytes: Buffer, path: string): JsonRecord {
  let value: unknown;
  try {
    value = JSON.parse(bytes.toString("utf8"));
  } catch {
    fail(path, "invalid JSON");
  }
  return plainRecord(value, path);
}

function parseJsonLines(bytes: Buffer, path: string): JsonRecord[] {
  const text = bytes.toString("utf8");
  if (!text.endsWith("\n")) fail(path, "must end with newline");
  return text.trimEnd().split("\n").map((line, index) => parseJson(Buffer.from(line), `${path}:${index + 1}`));
}

function plainRecord(value: unknown, path: string): JsonRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    fail(path, "expected plain JSON object");
  }
  return value as JsonRecord;
}

function exactKeys(value: JsonRecord, expected: readonly string[], path: string): void {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (!isDeepStrictEqual(actual, wanted)) fail(path, `expected exact keys ${wanted.join(",")}; received ${actual.join(",")}`);
}

function requireArray(value: unknown, path: string): any[] {
  if (!Array.isArray(value)) fail(path, "expected array");
  return value;
}

function requireString(value: unknown, path: string): string {
  if (typeof value !== "string" || value.length === 0) fail(path, "expected non-empty string");
  assertSafeText(value, path);
  return value;
}

function requireNonnegativeInteger(value: unknown, path: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) fail(path, "expected non-negative integer");
  return value as number;
}

function validateScoringContract(contract: JsonRecord): void {
  exactKeys(contract, ["schema_version", "status", "scope", "trust_roots", "fixed_denominators", "primary_outcome", "empty_state_scoring", "downstream_outcome", "rules"], "scoring_contract");
  if (contract.schema_version !== "state_replay_st02_empty_state_scoring_contract/v1" || contract.status !== "preregistered_after_capture_before_scoring") {
    fail("scoring_contract", "schema/status changed");
  }
  const capture = plainRecord(plainRecord(contract.trust_roots, "scoring_contract.trust_roots").capture, "scoring_contract.trust_roots.capture");
  exactKeys(capture, ["commit", "parent", "packets_tree", "capture_tree"], "scoring_contract.trust_roots.capture");
  const gold = plainRecord(contract.trust_roots.gold, "scoring_contract.trust_roots.gold");
  exactKeys(gold, ["accepted_data_commit", "parent", "gold_tree", "accepted_st01_qa_commit"], "scoring_contract.trust_roots.gold");
  for (const [key, value] of Object.entries({ ...capture, ...gold })) {
    if (!/^[a-f0-9]{40}$/.test(requireString(value, `scoring_contract.trust_roots.${key}`))) fail(`scoring_contract.trust_roots.${key}`, "invalid Git object id");
  }
}

function validateSemantic(value: JsonRecord): JsonRecord[] {
  exactKeys(value, ["schema_version", "status", "matching_rule", "items"], "gold.semantic_items");
  if (value.schema_version !== "state_replay_semantic_items/v1" || value.status !== "preregistered_before_model_run") fail("gold.semantic_items", "schema/status changed");
  const items = requireArray(value.items, "gold.semantic_items.items");
  const seen = new Set<string>();
  for (const [index, itemValue] of items.entries()) {
    const item = plainRecord(itemValue, `gold.semantic_items.items[${index}]`);
    exactKeys(item, ["key", "case_id", "type", "content", "creation_event_id", "critical", "required_anchors", "metadata"], `gold.semantic_items.items[${index}]`);
    const key = requireString(item.key, `gold.semantic_items.items[${index}].key`);
    if (seen.has(key)) fail("gold.semantic_items", `duplicate semantic key ${key}`);
    seen.add(key);
    requireString(item.case_id, `${key}.case_id`);
    requireString(item.type, `${key}.type`);
    requireString(item.content, `${key}.content`);
    requireString(item.creation_event_id, `${key}.creation_event_id`);
    if (typeof item.critical !== "boolean") fail(`${key}.critical`, "expected boolean");
    const anchors = requireArray(item.required_anchors, `${key}.required_anchors`);
    if (anchors.length === 0) fail(`${key}.required_anchors`, "empty anchors are forbidden even though matcher is short-circuited");
    for (const [anchorIndex, anchor] of anchors.entries()) requireString(anchor, `${key}.required_anchors[${anchorIndex}]`);
    plainRecord(item.metadata, `${key}.metadata`);
  }
  return items;
}

function validateDeltaLines(lines: JsonRecord[]): void {
  const seenSteps = new Set<string>();
  for (const [index, delta] of lines.entries()) {
    const path = `gold.deltas[${index}]`;
    exactKeys(delta, ["schema_version", "step_id", "case_id", "event_id", ...DELTA_ARRAY_KEYS], path);
    if (delta.schema_version !== "state_replay_gold_delta/v1") fail(path, "schema changed");
    const step = requireString(delta.step_id, `${path}.step_id`);
    if (seenSteps.has(step)) fail(path, `duplicate step ${step}`);
    seenSteps.add(step);
    requireString(delta.case_id, `${path}.case_id`);
    requireString(delta.event_id, `${path}.event_id`);
    for (const key of DELTA_ARRAY_KEYS) requireArray(delta[key], `${path}.${key}`);
  }
}

function validateCheckpointLines(lines: JsonRecord[]): void {
  const seenSteps = new Set<string>();
  for (const [index, checkpoint] of lines.entries()) {
    const path = `gold.checkpoints[${index}]`;
    exactKeys(checkpoint, ["schema_version", "step_id", "case_id", "event_id", "expected_revision", "expected_created_keys", "expected_status_changes", "expected_source_ref_additions", "expected_relations_added"], path);
    if (checkpoint.schema_version !== "state_replay_gold_checkpoint/v1") fail(path, "schema changed");
    const step = requireString(checkpoint.step_id, `${path}.step_id`);
    if (seenSteps.has(step)) fail(path, `duplicate step ${step}`);
    seenSteps.add(step);
    requireString(checkpoint.case_id, `${path}.case_id`);
    requireString(checkpoint.event_id, `${path}.event_id`);
    requireNonnegativeInteger(checkpoint.expected_revision, `${path}.expected_revision`);
    for (const key of ["expected_created_keys", "expected_status_changes", "expected_source_ref_additions", "expected_relations_added"]) {
      requireArray(checkpoint[key], `${path}.${key}`);
    }
  }
}

function isGoldDeltaEmpty(delta: JsonRecord): boolean {
  return DELTA_ARRAY_KEYS.every((key) => delta[key].length === 0);
}

function ratio(numerator: number, denominator: number): JsonRecord {
  if (denominator <= 0) fail("ratio", "positive denominator required");
  return { numerator, denominator, rate: numerator / denominator };
}

function countsByCase<T extends { case_id: string }>(values: readonly T[], caseIds: readonly string[]): Record<string, T[]> {
  const result: Record<string, T[]> = Object.fromEntries(caseIds.map((caseId) => [caseId, []]));
  for (const value of values) {
    if (!(value.case_id in result)) fail("case_id", `unknown case ${value.case_id}`);
    result[value.case_id].push(value);
  }
  return result;
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

export async function runEmptyStateScoring(
  repositoryRootValue = DEFAULT_REPOSITORY_ROOT,
  options: ScoringOptions = {},
): Promise<JsonRecord> {
  const repositoryRoot = resolve(repositoryRootValue);
  const fixtureRoot = resolve(options.fixture_root ?? DEFAULT_FIXTURE_ROOT);

  // Trust order is intentional: the separately committed contract is anchored before parse;
  // capture and Gold trees are then closed and byte-compared before any of their JSON is parsed.
  const contractBytes = await validateScoringContractAnchor(repositoryRoot, fixtureRoot);
  const contract = parseJson(contractBytes, SCORING_CONTRACT_PATH);
  validateScoringContract(contract);
  const captureTrust = contract.trust_roots.capture as JsonRecord;
  const goldTrust = contract.trust_roots.gold as JsonRecord;
  await validateCommit(repositoryRoot, captureTrust.commit, captureTrust.parent, "capture.commit");
  const packetBuffers = await validateFixedTree(repositoryRoot, fixtureRoot, captureTrust.commit, `${REPOSITORY_FIXTURE_ROOT}/st02/packets`, captureTrust.packets_tree, "capture.packets");
  const captureBuffers = await validateFixedTree(repositoryRoot, fixtureRoot, captureTrust.commit, `${REPOSITORY_FIXTURE_ROOT}/st02/capture`, captureTrust.capture_tree, "capture.artifacts");
  await validateCurrentRuntimeAtCapture(repositoryRoot, fixtureRoot, captureTrust.commit);
  await validateCommit(repositoryRoot, goldTrust.accepted_data_commit, goldTrust.parent, "gold.commit");
  const goldBuffers = await validateFixedTree(repositoryRoot, fixtureRoot, goldTrust.accepted_data_commit, `${REPOSITORY_FIXTURE_ROOT}/gold`, goldTrust.gold_tree, "gold.artifacts");

  const semantic = parseJson(goldBuffers.get("semantic-items.json") ?? fail("gold", "semantic-items.json missing"), "gold/semantic-items.json");
  const semanticItems = validateSemantic(semantic);
  const deltas = parseJsonLines(goldBuffers.get("gold-deltas.jsonl") ?? fail("gold", "gold-deltas.jsonl missing"), "gold/gold-deltas.jsonl");
  const checkpoints = parseJsonLines(goldBuffers.get("gold-state-checkpoints.jsonl") ?? fail("gold", "gold-state-checkpoints.jsonl missing"), "gold/gold-state-checkpoints.jsonl");
  const coverage = parseJson(goldBuffers.get("transition-coverage.json") ?? fail("gold", "transition-coverage.json missing"), "gold/transition-coverage.json");
  validateDeltaLines(deltas);
  validateCheckpointLines(checkpoints);
  const packetFiles = [...packetBuffers.entries()].filter(([path]) => /^\d{3}-pkt_[a-f0-9]{24}\.json$/.test(path)).sort(([left], [right]) => left.localeCompare(right));
  const packets = packetFiles.map(([path, bytes]) => parseJson(bytes, `packets/${path}`));
  const fixedReplay = parseJson(captureBuffers.get("source-only-replay.json") ?? fail("capture", "source-only-replay.json missing"), "capture/source-only-replay.json");
  const manifest = parseJson(captureBuffers.get("run-manifest.json") ?? fail("capture", "run-manifest.json missing"), "capture/run-manifest.json");

  const fixed = contract.fixed_denominators as JsonRecord;
  const caseIds = requireArray(fixed.case_ids_in_order, "scoring_contract.fixed_denominators.case_ids_in_order").map((value, index) => requireString(value, `case_ids[${index}]`));
  const stepCount = requireNonnegativeInteger(fixed.event_steps, "fixed_denominators.event_steps");
  if (deltas.length !== stepCount || checkpoints.length !== stepCount || packets.length !== stepCount) fail("steps", "Gold/packet step count mismatch");
  if (semanticItems.length !== fixed.gold_unique_items || semanticItems.filter((item) => item.critical).length !== fixed.gold_critical_unique_items) fail("gold.semantic_items", "fixed unique denominators changed");
  if (deltas.filter((delta) => !isGoldDeltaEmpty(delta)).length !== fixed.gold_nonempty_steps || deltas.filter(isGoldDeltaEmpty).length !== fixed.gold_empty_true_negative_steps) fail("gold.deltas", "fixed empty/non-empty denominators changed");
  if (coverage.expected_counts.superseded_decisions !== fixed.gold_supersessions || coverage.expected_counts.resolved_questions !== fixed.gold_resolutions || coverage.expected_counts.relations.DEPENDS_ON !== fixed.gold_dependencies || coverage.expected_counts.relations.DERIVED_FROM !== fixed.gold_derived_from_relations) fail("gold.coverage", "fixed transition denominators changed");

  const replay = await buildNextPacketFromCapture(repositoryRoot, join(fixtureRoot, "st02/capture"), { fixture_root: fixtureRoot });
  if (!isDeepStrictEqual(replay, fixedReplay)) fail("capture.replay", "fresh no-model replay differs from fixed source-only replay");
  if (replay.status !== "response_prefix_complete_no_scoring" || replay.processed_response_count !== stepCount || replay.model_call_count !== 0 || replay.scoring_run_count !== 0) fail("capture.replay", "unexpected replay boundary");
  if (manifest.boundaries.gold_read_count !== 0 || manifest.boundaries.scoring_run_count !== 0 || manifest.boundaries.matcher_run_count !== 0 || manifest.boundaries.feasibility_artifact_read_or_write_count !== 0) fail("capture.manifest", "capture-time isolation boundary changed");

  const observations = replay.observations as JsonRecord[];
  if (observations.length !== stepCount) fail("capture.replay", "observation count mismatch");
  const itemByKey = new Map(semanticItems.map((item) => [item.key, item]));
  const createdByCase = new Map<string, Set<string>>(caseIds.map((caseId) => [caseId, new Set<string>()]));
  const criticalByCase = new Map<string, Set<string>>(caseIds.map((caseId) => [caseId, new Set<string>()]));
  const stepDetails: JsonRecord[] = [];

  for (let index = 0; index < stepCount; index += 1) {
    const packet = packets[index];
    const delta = deltas[index];
    const checkpoint = checkpoints[index];
    const observation = observations[index];
    const path = `steps[${index}]`;
    if (packet.capture_ordinal !== index + 1 || packet.event_id !== delta.event_id || checkpoint.event_id !== delta.event_id || observation.event_id !== delta.event_id || packet.case_id !== delta.case_id || checkpoint.case_id !== delta.case_id) fail(path, "packet/Gold/replay order mismatch");
    if (packet.previous_predicted_revision !== 0 || observation.previous_revision !== 0 || observation.next_revision !== 0 || packet.extractor_input.active_state.length !== 0 || packet.extractor_input.state_relations.length !== 0) fail(path, "official predicted state is not empty");
    const created = createdByCase.get(delta.case_id) ?? fail(path, "unknown case");
    const critical = criticalByCase.get(delta.case_id) ?? fail(path, "unknown case");
    const createdThisStep: string[] = checkpoint.expected_created_keys;
    for (const key of createdThisStep) {
      const item = itemByKey.get(key) ?? fail(path, `unknown created semantic key ${key}`);
      if (item.case_id !== delta.case_id || item.creation_event_id !== delta.event_id) fail(path, `semantic creation provenance mismatch for ${key}`);
      if (created.has(key)) fail(path, `semantic key created twice: ${key}`);
      created.add(key);
      if (item.critical) critical.add(key);
    }
    const goldNonempty = !isGoldDeltaEmpty(delta);
    const fallback = observation.extractor_fallback_used === true;
    const primaryOutcome = fallback
      ? "parse_failure_with_empty_fallback"
      : goldNonempty
        ? "strict_valid_empty_on_gold_nonempty"
        : "strict_valid_empty_true_negative";
    const statusChanges: any[] = checkpoint.expected_status_changes;
    const supersessions = statusChanges.filter((entry) => Array.isArray(entry) && entry[1] === "SUPERSEDED").length;
    const resolutions = statusChanges.filter((entry) => Array.isArray(entry) && entry[1] === "RESOLVED").length;
    const completedGoals = statusChanges.filter((entry) => Array.isArray(entry) && entry[1] === "COMPLETED").length;
    const dependencies = checkpoint.expected_relations_added.filter((entry: unknown) => typeof entry === "string" && entry.includes("|DEPENDS_ON|")).length;
    const derivedFrom = checkpoint.expected_relations_added.filter((entry: unknown) => typeof entry === "string" && entry.includes("|DERIVED_FROM|")).length;
    const extractorInputText = JSON.stringify(packet.extractor_input);
    stepDetails.push({
      ordinal: index + 1,
      case_id: delta.case_id,
      step_id: delta.step_id,
      event_id: delta.event_id,
      packet_id: packet.packet_id,
      primary_outcome: primaryOutcome,
      strict_parse: {
        accepted: !fallback,
        fallback_used: fallback,
        error_codes: observation.extractor_error_codes,
      },
      gold_delta: {
        non_empty: goldNonempty,
        created_keys: createdThisStep,
        critical_created_keys: createdThisStep.filter((key) => itemByKey.get(key)?.critical === true),
        supersession_count: supersessions,
        resolution_count: resolutions,
        completed_goal_count: completedGoals,
        dependency_count: dependencies,
        derived_from_count: derivedFrom,
      },
      predicted_state: {
        prior_item_count: 0,
        prior_relation_count: 0,
        previous_revision: observation.previous_revision,
        next_revision: observation.next_revision,
        reducer_rejected: observation.reducer_rejected,
      },
      checkpoint_recall: {
        general: ratio(0, created.size),
        critical: critical.size === 0 ? { status: "not_evaluable_zero_gold_critical_items", numerator: 0, denominator: 0, rate: null } : ratio(0, critical.size),
      },
      downstream_gold_outcome: {
        supersession: supersessions === 0 ? null : { realized: 0, gold: supersessions, capability_status: "not_evaluable_precondition_absent", causal_attribution: "inherited_precondition_absent" },
        resolution: resolutions === 0 ? null : { realized: 0, gold: resolutions, capability_status: "not_evaluable_precondition_absent", causal_attribution: "inherited_precondition_absent" },
        dependency: dependencies === 0 ? null : { incident_count: 0, gold: dependencies, eligible_count: 0, status: "not_evaluable_precondition_absent" },
        wrong_reactivation: delta.event_id === "STR-06/E13" ? { incident_count: 0, eligible_count: 0, status: "not_evaluable_no_predicted_tombstone", interpretation: "empty_true_negative_only" } : null,
      },
      extractor_input_cost_secondary: {
        characters: extractorInputText.length,
        token_estimate_characters_divided_by_4: extractorInputText.length === 0 ? 0 : Math.max(1, Math.ceil(extractorInputText.length / 4)),
        state_item_count: 0,
        state_relation_count: 0,
      },
    });
  }

  if ([...createdByCase.values()].some((keys) => keys.size === 0) || sum([...createdByCase.values()].map((keys) => keys.size)) !== fixed.gold_unique_items) fail("gold.checkpoints", "created keys do not exactly cover semantic registry");
  const expectedPrimary = contract.primary_outcome.expected_counts_from_frozen_capture as JsonRecord;
  const primaryCounts: Record<string, number> = Object.fromEntries(contract.primary_outcome.categories.map((category: string) => [category, 0]));
  for (const step of stepDetails) {
    if (!(step.primary_outcome in primaryCounts)) fail("primary_outcome", `unknown category ${step.primary_outcome}`);
    primaryCounts[step.primary_outcome] += 1;
  }
  if (!isDeepStrictEqual(primaryCounts, expectedPrimary) || sum(Object.values(primaryCounts)) !== stepCount) fail("primary_outcome", "mutually exclusive 12/16/2 arithmetic changed");

  const itemsByCase = countsByCase(semanticItems, caseIds);
  const detailsByCase = countsByCase(stepDetails, caseIds);
  const caseReports = caseIds.map((caseId) => {
    const items = itemsByCase[caseId];
    const criticalItems = items.filter((item) => item.critical);
    const steps = detailsByCase[caseId];
    const byPrimary: Record<string, number> = Object.fromEntries(Object.keys(primaryCounts).map((category) => [category, steps.filter((step) => step.primary_outcome === category).length]));
    const checkpointGeneralDenominator = sum(steps.map((step) => step.checkpoint_recall.general.denominator));
    const checkpointCriticalDenominator = sum(steps.map((step) => step.checkpoint_recall.critical.denominator));
    return {
      case_id: caseId,
      step_count: steps.length,
      primary_outcomes: byPrimary,
      unique_state_recall: {
        general: ratio(0, items.length),
        critical: ratio(0, criticalItems.length),
      },
      checkpoint_weighted_state_recall: {
        general: ratio(0, checkpointGeneralDenominator),
        critical: ratio(0, checkpointCriticalDenominator),
      },
      gold_transition_results: {
        supersession: { realized: 0, gold: sum(steps.map((step) => step.gold_delta.supersession_count)), causal_attribution: "inherited_precondition_absent" },
        resolution: { realized: 0, gold: sum(steps.map((step) => step.gold_delta.resolution_count)), causal_attribution: "inherited_precondition_absent" },
        dependency: { incident_count: 0, gold: sum(steps.map((step) => step.gold_delta.dependency_count)), eligible_count: 0, status: "not_evaluable" },
      },
      critical_missed_keys: criticalItems.map((item) => item.key),
      extractor_input_cost_secondary: {
        total_characters: sum(steps.map((step) => step.extractor_input_cost_secondary.characters)),
        total_token_estimate_characters_divided_by_4: sum(steps.map((step) => step.extractor_input_cost_secondary.token_estimate_characters_divided_by_4)),
      },
      steps,
    };
  });

  const checkpointGeneralDenominator = sum(stepDetails.map((step) => step.checkpoint_recall.general.denominator));
  const checkpointCriticalDenominator = sum(stepDetails.map((step) => step.checkpoint_recall.critical.denominator));
  const supersessionGold = sum(stepDetails.map((step) => step.gold_delta.supersession_count));
  const resolutionGold = sum(stepDetails.map((step) => step.gold_delta.resolution_count));
  const dependencyGold = sum(stepDetails.map((step) => step.gold_delta.dependency_count));
  if (supersessionGold !== fixed.gold_supersessions || resolutionGold !== fixed.gold_resolutions || dependencyGold !== fixed.gold_dependencies) fail("downstream", "step transition arithmetic differs from fixed denominators");
  if (stepDetails.some((step) => step.predicted_state.reducer_rejected)) fail("capture.replay", "unexpected reducer rejection");

  const invalidSteps = stepDetails.filter((step) => step.strict_parse.fallback_used);
  return {
    schema_version: "state_replay_st02_empty_state_report/v1",
    status: "official_st02_scored_pending_independent_qa",
    scope: contract.scope,
    trust_roots: {
      scoring_contract: { ...ACCEPTED_EMPTY_STATE_SCORING_CONTRACT, validated_before_parse: true },
      capture: { ...captureTrust, closed_path_and_current_bytes_validated_before_parse: true, runtime_current_bytes_match_capture_commit: true },
      gold: { ...goldTrust, closed_path_and_current_bytes_validated_before_parse: true },
    },
    execution_boundaries: {
      scoring_run_count: 1,
      model_call_count: 0,
      provider_call_count: 0,
      network_call_count: 0,
      evaluator_run_count: 0,
      new_remote_session_count: 0,
      matcher_run_count: 0,
      generic_semantic_matcher_implemented: false,
      feasibility_artifact_read_or_write_count: 0,
      core_source_change_count: 0,
      aggregate_score: null,
      threshold: null,
      architecture_winner: null,
    },
    capture_replay: {
      processed_response_count: replay.processed_response_count,
      strict_parse_accepted: stepDetails.filter((step) => step.strict_parse.accepted).length,
      strict_parse_failed: invalidSteps.length,
      error_code_counts: {
        INVALID_JSON: invalidSteps.filter((step) => step.strict_parse.error_codes.includes("INVALID_JSON")).length,
        INVALID_SCHEMA: invalidSteps.filter((step) => step.strict_parse.error_codes.includes("INVALID_SCHEMA")).length,
        INVALID_REFERENCE: invalidSteps.filter((step) => step.strict_parse.error_codes.includes("INVALID_REFERENCE")).length,
      },
      empty_delta_fallback_count: invalidSteps.length,
      reducer_rejection_count: 0,
      revision_increment_count: 0,
      predicted_item_count: 0,
      predicted_relation_count: 0,
      interpretation: "0 reducer rejection is an observation after empty fallback/empty Delta, not operational proof",
    },
    primary_outcomes: {
      mutually_exclusive: true,
      total: stepCount,
      counts: primaryCounts,
      sum_equals_total: sum(Object.values(primaryCounts)) === stepCount,
    },
    state_metrics: {
      unique_recall: {
        general: ratio(0, semanticItems.length),
        critical: ratio(0, semanticItems.filter((item) => item.critical).length),
      },
      checkpoint_weighted_recall: {
        general: ratio(0, checkpointGeneralDenominator),
        critical: ratio(0, checkpointCriticalDenominator),
        interpretation: "raw repeated checkpoint exposure only; not an aggregate score",
      },
      precision: {
        general: { status: "not_evaluable_zero_predicted_items", numerator: 0, denominator: 0, rate: null },
        critical: { status: "not_evaluable_zero_predicted_items", numerator: 0, denominator: 0, rate: null, note: "unmatched predicted items have no preregistered criticality definition" },
      },
      matcher: {
        status: "short_circuited_empty_left_set",
        opportunity_count: 0,
        unmatched_predicted_count: 0,
        ambiguous_match_count: 0,
        interpretation: "raw zero counts are absence of candidates, not matcher PASS",
      },
    },
    downstream_outcomes: {
      supersession: { gold_result_realized: ratio(0, supersessionGold), capability_eligible_count: 0, capability_status: "not_evaluable_precondition_absent", causal_attribution: "inherited_precondition_absent", additional_primary_extractor_error_count: 0 },
      resolution: { gold_result_realized: ratio(0, resolutionGold), capability_eligible_count: 0, capability_status: "not_evaluable_precondition_absent", causal_attribution: "inherited_precondition_absent", additional_primary_extractor_error_count: 0 },
      stale_activation: { incident_count: 0, eligible_count: 0, status: "not_evaluable" },
      wrong_reactivation: { incident_count: 0, eligible_count: 0, status: "not_evaluable", e13_interpretation: "strict_valid_empty_true_negative_only" },
      dependency_inconsistency: { incident_count: 0, gold_dependency_count: dependencyGold, eligible_count: 0, status: "not_evaluable_precondition_absent" },
      provenance_failure: { incident_count: 0, gold_derived_from_count: fixed.gold_derived_from_relations, eligible_count: 0, status: "not_evaluable_no_predicted_item_or_relation" },
    },
    critical_misses: {
      unique_count: semanticItems.filter((item) => item.critical).length,
      unique_keys: semanticItems.filter((item) => item.critical).map((item) => item.key),
      interpretation: "all critical accepted-Gold keys are absent from the empty Predicted State; repeated checkpoint misses are reported separately and not averaged into a score",
    },
    raw_error_distribution: {
      parse_failure_steps: invalidSteps.map((step) => ({ case_id: step.case_id, event_id: step.event_id, error_codes: step.strict_parse.error_codes })),
      reducer_rejection_steps: [],
      unmatched_predicted_count: 0,
      ambiguous_match_count: 0,
    },
    context_cost_secondary: {
      estimator: "UTF-16 JavaScript string characters / 4, rounded up per step",
      total_extractor_input_characters: sum(stepDetails.map((step) => step.extractor_input_cost_secondary.characters)),
      total_extractor_input_token_estimate: sum(stepDetails.map((step) => step.extractor_input_cost_secondary.token_estimate_characters_divided_by_4)),
      predicted_state_item_count_each_step: 0,
      interpretation: "raw extractor-input observation only; no D0/D1/D2 comparison or reduction claim",
    },
    cases: caseReports,
    test_design_challenges: [
      { kind: "vacuous_pass", finding: "precision, matcher, transition capability, stale/reactivation/dependency/provenance all have zero eligibility and remain structured not_evaluable" },
      { kind: "gold_leakage", finding: "capture was generated source-only; scoring begins only after the fixed capture tree is anchored, but Gold remains an accepted standardized-summary human scale rather than an external semantic oracle" },
      { kind: "definition_ambiguity", finding: "the preregistered lexical matcher is not exercised because the predicted left set is empty; critical precision also lacks a definition for unmatched predicted-item criticality" },
      { kind: "evaluator_self_attestation", finding: "capture, Gold, and scoring contract are anchored to three prior Git objects and current closed trees/bytes; independent QA must still attack coordinated rewrites" },
      { kind: "selection_bias", finding: "three selected Starlette trajectories and one model/prompt capture do not establish generality; short-history representation is limited and there is no provider comparison" }
    ],
    claims_not_made: [
      "D2 is better or worse than D1",
      "the reducer has operational stability because rejection count is zero",
      "the exact-anchor matcher passed",
      "wrong reactivation, dependency, stale activation, or provenance capability passed",
      "this result generalizes beyond the accepted standardized Starlette event summaries, fixed prompt contract, and one GPT-5.6-terra capture"
    ]
  };
}
