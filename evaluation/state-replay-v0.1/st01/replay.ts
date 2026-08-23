import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { lstat, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual, promisify } from "node:util";
import { StateReducer } from "../../../src/reducer.js";
import { SqliteRawHistoryStore, estimateTokens, type RawEvent } from "../../../src/raw-store.js";
import {
  SqliteContextStateStore,
  StateRevisionConflictError,
} from "../../../src/state-store.js";
import type {
  ContextItem,
  ContextItemStatus,
  ContextItemType,
  StateDelta,
  StateRelation,
} from "../../../src/state-types.js";
import { parseStrictStateDeltaPayload, type ExtractorInput } from "../../../src/extractor.js";
// @ts-expect-error Existing accepted JavaScript validator has no declaration file.
import { validateDs13Results } from "../../starlette-v1/results/feasibility-01/validate-results.mjs";

const execFileAsync = promisify(execFile);
const THIS_DIRECTORY = dirname(fileURLToPath(import.meta.url));
export const DEFAULT_REPOSITORY_ROOT = join(THIS_DIRECTORY, "../../../..");
const REPLAY_ROOT = "evaluation/state-replay-v0.1";
const FORBIDDEN_CONTROL = /[\p{Cf}\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u;
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

export const TRUSTED_DS14_DATA_SOURCE = Object.freeze({
  commit: "23b52e8b4ff92ea1966f16de793395950a443590",
  parent: "a9536133fda43f0a40623d8f7a34da352e273dfc",
  files: Object.freeze([
    Object.freeze({ path: "README.md", sha256: "ea960d5d1a7166ab3872f60f71c1c5277132f9e828c410b9572de9d7c06641f4" }),
    Object.freeze({ path: "source/baseline-seal.json", sha256: "c033a6a3bf865fbfee534c827c9c5904593ad7634162284a6bbbae49c4732398" }),
    Object.freeze({ path: "source/selection.json", sha256: "4845e52a27ad181ff16fdd5989f4aa7ddfc19e5c8e58a3f16f54144e02b7fca9" }),
    Object.freeze({ path: "source/event-stream.jsonl", sha256: "a35771410cd027a70e439add43a268529826def666c14421b629e79a47c0a4e1" }),
    Object.freeze({ path: "gold/gate0-expressibility.json", sha256: "f8484ca44196c629cbb568a4711d220647c37c6d6c5bf9109febca8f3289c931" }),
    Object.freeze({ path: "gold/semantic-items.json", sha256: "10d8790e81335f823a813b85d1a039810880a2d62fbcd152cbdc72806f0d29d1" }),
    Object.freeze({ path: "gold/gold-deltas.jsonl", sha256: "8ee790edca920c9d843f1acd4c87638e42f6346bf666cc7f4f3f3cfdc2583e53" }),
    Object.freeze({ path: "gold/gold-state-checkpoints.jsonl", sha256: "bd046d91379e3d674ec189f88fffc8c11fde517609f9aac0954aa18b5ba9c775" }),
    Object.freeze({ path: "gold/transition-coverage.json", sha256: "38a557511d4775a959ab69b7c410c879bb18abb3c8714dd5141ee36291d405c9" }),
  ]),
});

type JsonRecord = Record<string, any>;

interface Fixture {
  root: string;
  seal: JsonRecord;
  selection: JsonRecord;
  events: JsonRecord[];
  items: JsonRecord[];
  itemsByKey: Map<string, JsonRecord>;
  deltas: JsonRecord[];
  checkpoints: JsonRecord[];
  gate0: JsonRecord;
  coverage: JsonRecord;
}

interface ExpectedItem {
  key: string;
  type: ContextItemType;
  content: string;
  status: ContextItemStatus;
  confidence: number;
  source_event_ids: string[];
  metadata: JsonRecord;
}

interface CanonicalState {
  revision: number;
  items: ExpectedItem[];
  relations: string[];
}

interface ExpectedAccumulator {
  items: Map<string, ExpectedItem>;
  relations: Set<string>;
}

interface ReplayResult {
  canonical_steps: Array<{ step_id: string; state: CanonicalState }>;
  final_states: Record<string, CanonicalState>;
  strict_delta_count: number;
  empty_delta_count: number;
  checkpoint_match_count: number;
  no_op_match_count: number;
  created_item_count: number;
  lifecycle_provenance_count: number;
  stale_revision_fail_closed_count: number;
  relation_counts: Record<string, number>;
}

export class StateReplayConformanceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StateReplayConformanceError";
  }
}

function fail(path: string, message: string): never {
  throw new StateReplayConformanceError(`${path}: ${message}`);
}

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${stableJson(object[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function assertClean(value: unknown, path: string): void {
  if (typeof value === "string") {
    if (FORBIDDEN_CONTROL.test(value)) fail(path, "contains forbidden Unicode format/control characters");
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertClean(entry, `${path}[${index}]`));
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, entry] of Object.entries(value)) {
      assertClean(key, `${path}.key`);
      assertClean(entry, `${path}.${key}`);
    }
  }
}

async function regularText(path: string): Promise<string> {
  const stat = await lstat(path).catch(() => fail(path, "missing file"));
  if (!stat.isFile() || stat.isSymbolicLink()) fail(path, "expected regular non-symlink file");
  return readFile(path, "utf8");
}

async function readJson(path: string): Promise<JsonRecord> {
  let value: unknown;
  try {
    value = JSON.parse(await regularText(path));
  } catch {
    fail(path, "invalid JSON");
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(path, "expected object root");
  assertClean(value, path);
  return value as JsonRecord;
}

async function readJsonl(path: string): Promise<JsonRecord[]> {
  const text = await regularText(path);
  if (!text.endsWith("\n") || text.trimEnd().length === 0) fail(path, "must be non-empty and newline terminated");
  return text.trimEnd().split("\n").map((line, index) => {
    let value: unknown;
    try {
      value = JSON.parse(line);
    } catch {
      fail(`${path}:${index + 1}`, "invalid JSON");
    }
    if (!value || typeof value !== "object" || Array.isArray(value)) fail(`${path}:${index + 1}`, "expected object");
    assertClean(value, `${path}:${index + 1}`);
    return value as JsonRecord;
  });
}

function exactKeys(value: JsonRecord, keys: readonly string[], path: string): void {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (!isDeepStrictEqual(actual, expected)) fail(path, `exact keys changed: ${actual.join(",")}`);
}

async function git(repositoryRoot: string, args: string[], encoding: BufferEncoding | "buffer" = "utf8"): Promise<string | Buffer> {
  try {
    const result = await execFileAsync("git", ["-C", repositoryRoot, ...args], {
      encoding: encoding === "buffer" ? "buffer" : encoding,
      shell: false,
      maxBuffer: 4 * 1024 * 1024,
    });
    return result.stdout as string | Buffer;
  } catch {
    fail("git", "fixed Git object could not be read");
  }
}

async function validateSourceGitAnchor(repositoryRoot: string, selection: JsonRecord): Promise<void> {
  const source = selection.source_git;
  const lineage = String(await git(repositoryRoot, ["rev-list", "--parents", "-n", "1", source.commit])).trim();
  if (lineage !== `${source.commit} ${source.parent}`) fail("selection.source_git", "lineage changed");
  for (const entry of source.files) {
    const blob = await git(repositoryRoot, ["cat-file", "blob", `${source.commit}:${entry.path}`], "buffer") as Buffer;
    if (sha256(blob) !== entry.sha256) fail(entry.path, "fixed Git blob hash changed");
    const current = await readFile(join(repositoryRoot, entry.path));
    if (!blob.equals(current)) fail(entry.path, "current source differs from fixed Git blob");
  }
}

async function validateFixtureGitAnchor(repositoryRoot: string, fixtureRoot: string): Promise<void> {
  const source = TRUSTED_DS14_DATA_SOURCE;
  const lineage = String(await git(repositoryRoot, ["rev-list", "--parents", "-n", "1", source.commit])).trim();
  if (lineage !== `${source.commit} ${source.parent}`) fail("accepted_ds14_data.lineage", "fixed value changed");
  for (const entry of source.files) {
    const gitPath = `${REPLAY_ROOT}/${entry.path}`;
    const blob = await git(repositoryRoot, ["cat-file", "blob", `${source.commit}:${gitPath}`], "buffer") as Buffer;
    if (sha256(blob) !== entry.sha256) fail(`accepted_ds14_data.${entry.path}.sha256`, "fixed value changed");
    const stat = await lstat(join(fixtureRoot, entry.path)).catch(() => fail(entry.path, "missing file"));
    if (!stat.isFile() || stat.isSymbolicLink()) fail(entry.path, "expected regular non-symlink file");
    const current = await readFile(join(fixtureRoot, entry.path));
    if (!blob.equals(current)) fail(`accepted_ds14_data.${entry.path}`, "current bytes differ from fixed Git blob");
  }
}

function projectedSourceEvent(source: JsonRecord, caseId: string, selectedSeq: number): JsonRecord {
  return {
    schema_version: "state_replay_event/v1",
    case_id: caseId,
    session_id: `state-replay/${caseId}`,
    selected_seq: selectedSeq,
    event_id: source.id,
    source_ordinal: source.ordinal,
    role: source.role,
    event_type: source.event_type,
    occurred_at: new Date(source.occurred_at).toISOString(),
    content: source.summary,
    actor: source.actor,
    source_id: source.source.source_id,
    source_url: source.source.url,
    source_content_sha256: source.source_content_sha256,
  };
}

async function loadFixture(repositoryRoot: string, fixtureRoot?: string): Promise<Fixture> {
  const root = fixtureRoot ?? join(repositoryRoot, REPLAY_ROOT);
  // Fixed Git-object trust is checked before any current fixture JSON is parsed.
  await validateFixtureGitAnchor(repositoryRoot, root);
  const [seal, selection, events, semantic, deltas, checkpoints, gate0, coverage] = await Promise.all([
    readJson(join(root, "source/baseline-seal.json")),
    readJson(join(root, "source/selection.json")),
    readJsonl(join(root, "source/event-stream.jsonl")),
    readJson(join(root, "gold/semantic-items.json")),
    readJsonl(join(root, "gold/gold-deltas.jsonl")),
    readJsonl(join(root, "gold/gold-state-checkpoints.jsonl")),
    readJson(join(root, "gold/gate0-expressibility.json")),
    readJson(join(root, "gold/transition-coverage.json")),
  ]);

  exactKeys(seal, ["schema_version", "status", "sealed_at", "ds13_qa_commit", "official_artifact_commit", "official_runner_commit", "result_root", "run_root", "interpretation", "prohibited_actions"], "baseline-seal.json");
  if (seal.status !== "sealed_oracle_state_feasibility_baseline_semantics_not_evaluated") fail("baseline-seal.status", "changed");
  if (selection.counts.selected_event_count !== 30 || events.length !== 30 || deltas.length !== 30 || checkpoints.length !== 30) fail("fixture.counts", "expected 30 event/delta/checkpoint records");
  if (selection.counts.empty_gold_delta_count !== 2) fail("selection.counts.empty_gold_delta_count", "expected two true negatives");
  if (gate0.status !== "passed_with_declared_representation_limits" || gate0.events.length !== 30) fail("gate0", "expressibility audit incomplete");
  if (gate0.input_representation !== "independently_accepted_standardized_real_event_summary_with_source_hash") fail("gate0.input_representation", "claim changed");
  if (semantic.status !== "preregistered_before_model_run" || !Array.isArray(semantic.items)) fail("semantic-items", "invalid registry");

  const items = semantic.items as JsonRecord[];
  const itemsByKey = new Map<string, JsonRecord>();
  for (const [index, item] of items.entries()) {
    exactKeys(item, ["key", "case_id", "type", "content", "creation_event_id", "critical", "required_anchors", "metadata"], `semantic-items[${index}]`);
    if (itemsByKey.has(item.key)) fail(`semantic-items[${index}].key`, "duplicate");
    if (!Array.isArray(item.required_anchors) || item.required_anchors.length === 0) fail(`semantic-items[${index}].required_anchors`, "must be non-empty");
    itemsByKey.set(item.key, item);
  }
  if (itemsByKey.size !== 35) fail("semantic-items.count", "expected 35 items");

  await validateSourceGitAnchor(repositoryRoot, selection);
  const projected: JsonRecord[] = [];
  for (const caseEntry of selection.cases) {
    const sourcePath = join(repositoryRoot, `evaluation/starlette-v1/promotion/cases/${caseEntry.case_id}/events.json`);
    const source = await readJson(sourcePath);
    const sourceEvents = source.events as JsonRecord[];
    if (!isDeepStrictEqual(sourceEvents.map((entry) => entry.id), caseEntry.selected_event_ids)) fail(`${caseEntry.case_id}.selection`, "not a complete ordered trajectory");
    if (!isDeepStrictEqual(caseEntry.omitted_event_ids, [])) fail(`${caseEntry.case_id}.omitted_event_ids`, "must be empty");
    sourceEvents.forEach((entry, index) => projected.push(projectedSourceEvent(entry, caseEntry.case_id, index + 1)));
  }
  if (!isDeepStrictEqual(projected, events)) fail("event-stream.jsonl", "does not exactly project the anchored source events");
  if (!isDeepStrictEqual(events.map((entry) => entry.event_id), deltas.map((entry) => entry.event_id))) fail("gold-deltas.order", "must match event stream");
  if (!isDeepStrictEqual(events.map((entry) => entry.event_id), checkpoints.map((entry) => entry.event_id))) fail("checkpoints.order", "must match event stream");
  if (!isDeepStrictEqual(events.map((entry) => entry.event_id), gate0.events.map((entry: JsonRecord) => entry.event_id))) fail("gate0.order", "must match event stream");

  return { root, seal, selection, events, items, itemsByKey, deltas, checkpoints, gate0, coverage };
}

function initialStatus(type: ContextItemType): ContextItemStatus {
  if (type === "OPEN_QUESTION") return "OPEN";
  if (type === "REJECTED_ALTERNATIVE") return "REJECTED";
  return "ACTIVE";
}

function newItemPayload(item: JsonRecord, rawId: string): JsonRecord {
  return { content: item.content, source_refs: [rawId] };
}

function decisionPayload(item: JsonRecord, rawId: string, supersedes: string[]): JsonRecord {
  const payload = { ...newItemPayload(item, rawId), supersedes };
  if (item.metadata.reason !== undefined) Object.assign(payload, { reason: item.metadata.reason });
  if (item.metadata.reopen_if !== undefined) Object.assign(payload, { reopen_if: item.metadata.reopen_if });
  return payload;
}

function rejectedPayload(item: JsonRecord, rawId: string, rejects: string[]): JsonRecord {
  const payload = { ...newItemPayload(item, rawId), rejects };
  if (item.metadata.reason !== undefined) Object.assign(payload, { reason: item.metadata.reason });
  if (item.metadata.reopen_if !== undefined) Object.assign(payload, { reopen_if: item.metadata.reopen_if });
  return payload;
}

function requireRuntimeId(runtimeByKey: Map<string, string>, key: string, path: string): string {
  const value = runtimeByKey.get(key);
  if (!value) fail(path, `unknown or same-step symbolic key ${key}`);
  return value;
}

function materializeDelta(
  record: JsonRecord,
  currentRawId: string,
  runtimeByKey: Map<string, string>,
  rawByEventId: Map<string, string>,
  itemsByKey: Map<string, JsonRecord>,
): StateDelta {
  exactKeys(record, ["schema_version", "step_id", "case_id", "event_id", ...DELTA_ARRAY_KEYS], record.step_id);
  const item = (key: string): JsonRecord => {
    const value = itemsByKey.get(key);
    if (!value || value.case_id !== record.case_id) fail(record.step_id, `unknown/cross-case item ${key}`);
    return value;
  };
  const runtime = (key: string): string => requireRuntimeId(runtimeByKey, key, record.step_id);
  return {
    new_goals: record.new_goals.map((entry: JsonRecord) => newItemPayload(item(entry.key), currentRawId)),
    updated_goals: record.updated_goals.map((entry: JsonRecord) => ({ id: runtime(entry.key), ...(entry.content === undefined ? {} : { content: entry.content }), ...(entry.status === undefined ? {} : { status: entry.status }) })),
    new_constraints: record.new_constraints.map((entry: JsonRecord) => newItemPayload(item(entry.key), currentRawId)),
    updated_constraints: record.updated_constraints.map((entry: JsonRecord) => ({ id: runtime(entry.key), ...(entry.content === undefined ? {} : { content: entry.content }), ...(entry.status === undefined ? {} : { status: entry.status }) })),
    new_decisions: record.new_decisions.map((entry: JsonRecord) => decisionPayload(item(entry.key), currentRawId, entry.supersedes.map(runtime))),
    resolved_questions: record.resolved_questions.map((entry: JsonRecord) => ({ id: runtime(entry.key), ...(entry.resolved_by === undefined ? {} : { resolved_by: runtime(entry.resolved_by) }) })),
    new_open_questions: record.new_open_questions.map((entry: JsonRecord) => newItemPayload(item(entry.key), currentRawId)),
    rejected_alternatives: record.rejected_alternatives.map((entry: JsonRecord) => rejectedPayload(item(entry.key), currentRawId, entry.rejects.map(runtime))),
    supersessions: record.supersessions.map((entry: JsonRecord) => ({ superseded_id: runtime(entry.superseded_key), superseding_id: runtime(entry.superseding_key) })),
    new_relations: record.new_relations.map((entry: JsonRecord) => ({
      source_id: runtime(entry.source_key),
      relation_type: entry.relation_type,
      target_id: entry.relation_type === "DERIVED_FROM"
        ? requireRuntimeId(rawByEventId, entry.target_event_id, record.step_id)
        : runtime(entry.target_key),
    })),
  } as StateDelta;
}

function expectedCreatedKeys(delta: JsonRecord): string[] {
  return [
    ...delta.new_goals,
    ...delta.new_constraints,
    ...delta.new_decisions,
    ...delta.new_open_questions,
    ...delta.rejected_alternatives,
  ].map((entry: JsonRecord) => entry.key);
}

function applyExpectedCheckpoint(
  accumulator: ExpectedAccumulator,
  checkpoint: JsonRecord,
  itemsByKey: Map<string, JsonRecord>,
): CanonicalState {
  exactKeys(checkpoint, ["schema_version", "step_id", "case_id", "event_id", "expected_revision", "expected_created_keys", "expected_status_changes", "expected_source_ref_additions", "expected_relations_added"], checkpoint.step_id);
  for (const key of checkpoint.expected_created_keys as string[]) {
    if (accumulator.items.has(key)) fail(checkpoint.step_id, `checkpoint recreates ${key}`);
    const definition = itemsByKey.get(key);
    if (!definition || definition.case_id !== checkpoint.case_id) fail(checkpoint.step_id, `checkpoint unknown key ${key}`);
    accumulator.items.set(key, {
      key,
      type: definition.type,
      content: definition.content,
      status: initialStatus(definition.type),
      confidence: 1,
      source_event_ids: [],
      metadata: structuredClone(definition.metadata),
    });
  }
  for (const [key, status] of checkpoint.expected_status_changes as Array<[string, ContextItemStatus]>) {
    const entry = accumulator.items.get(key);
    if (!entry) fail(checkpoint.step_id, `status change references unknown ${key}`);
    entry.status = status;
  }
  for (const [key, eventId] of checkpoint.expected_source_ref_additions as Array<[string, string]>) {
    const entry = accumulator.items.get(key);
    if (!entry) fail(checkpoint.step_id, `source ref references unknown ${key}`);
    if (entry.source_event_ids.includes(eventId)) fail(checkpoint.step_id, `duplicate source ref ${key}/${eventId}`);
    entry.source_event_ids.push(eventId);
  }
  for (const relation of checkpoint.expected_relations_added as string[]) {
    if (accumulator.relations.has(relation)) fail(checkpoint.step_id, `duplicate relation ${relation}`);
    accumulator.relations.add(relation);
  }
  return {
    revision: checkpoint.expected_revision,
    items: [...accumulator.items.values()].map((entry) => structuredClone(entry)).sort((left, right) => left.key.localeCompare(right.key)),
    relations: [...accumulator.relations].sort(),
  };
}

function canonicalActualState(
  stateStore: SqliteContextStateStore,
  sessionId: string,
  runtimeByKey: Map<string, string>,
  rawByEventId: Map<string, string>,
): CanonicalState {
  const keyByRuntime = new Map([...runtimeByKey].map(([key, runtime]) => [runtime, key]));
  const eventByRaw = new Map([...rawByEventId].map(([eventId, runtime]) => [runtime, eventId]));
  const items = stateStore.getItems(sessionId).map((entry) => {
    const key = keyByRuntime.get(entry.id);
    if (!key) fail(sessionId, `unmapped runtime item ${entry.id}`);
    if (new Date(entry.created_at).toISOString() !== entry.created_at || new Date(entry.updated_at).toISOString() !== entry.updated_at) fail(key, "non-canonical timestamp");
    if (new Date(entry.updated_at).valueOf() < new Date(entry.created_at).valueOf()) fail(key, "updated_at precedes created_at");
    return {
      key,
      type: entry.type,
      content: entry.content,
      status: entry.status,
      confidence: entry.confidence,
      source_event_ids: entry.source_refs.map((id) => eventByRaw.get(id) ?? fail(key, `unknown raw source ${id}`)),
      metadata: structuredClone(entry.metadata),
    } satisfies ExpectedItem;
  }).sort((left, right) => left.key.localeCompare(right.key));
  const relations = stateStore.getSessionRelations(sessionId).map((entry) => {
    if (new Date(entry.created_at).toISOString() !== entry.created_at) fail(sessionId, "non-canonical relation timestamp");
    const source = keyByRuntime.get(entry.source_id) ?? fail(sessionId, "unmapped relation source");
    const target = entry.relation_type === "DERIVED_FROM"
      ? eventByRaw.get(entry.target_id) ?? fail(sessionId, "unmapped raw relation target")
      : keyByRuntime.get(entry.target_id) ?? fail(sessionId, "unmapped state relation target");
    return `${source}|${entry.relation_type}|${target}`;
  }).sort();
  return { revision: stateStore.getRevision(sessionId), items, relations };
}

function extractorInput(stateStore: SqliteContextStateStore, sessionId: string, raw: RawEvent): ExtractorInput {
  return {
    session_id: sessionId,
    active_state: stateStore.getItems(sessionId),
    state_relations: stateStore.getSessionRelations(sessionId).filter((entry) => entry.relation_type !== "DERIVED_FROM"),
    recent_context: [],
    newest_events: [raw],
  };
}

function countDeltaOperations(delta: JsonRecord): number {
  return DELTA_ARRAY_KEYS.reduce((sum, key) => sum + delta[key].length, 0);
}

async function replayOnce(fixture: Fixture, exerciseStale: boolean): Promise<ReplayResult> {
  const temporaryDirectory = await mkdtemp(join(tmpdir(), "context-compiler-st01-"));
  const databasePath = join(temporaryDirectory, "state-replay.db");
  const rawStore = new SqliteRawHistoryStore(databasePath);
  const stateStore = new SqliteContextStateStore(databasePath);
  const reducer = new StateReducer(stateStore);
  const runtimeByCase = new Map<string, Map<string, string>>();
  const rawByCase = new Map<string, Map<string, string>>();
  const expectedByCase = new Map<string, ExpectedAccumulator>();
  const canonicalSteps: Array<{ step_id: string; state: CanonicalState }> = [];
  const finalStates: Record<string, CanonicalState> = {};
  let strictDeltaCount = 0;
  let emptyDeltaCount = 0;
  let checkpointMatchCount = 0;
  let noOpMatchCount = 0;
  let createdItemCount = 0;
  let lifecycleProvenanceCount = 0;
  let staleRevisionFailClosedCount = 0;

  try {
    for (let index = 0; index < fixture.events.length; index += 1) {
      const event = fixture.events[index];
      const deltaRecord = fixture.deltas[index];
      const checkpoint = fixture.checkpoints[index];
      if (event.event_id !== deltaRecord.event_id || event.event_id !== checkpoint.event_id) fail(event.event_id, "fixture order mismatch");
      const sessionId = event.session_id as string;
      const runtimeByKey = runtimeByCase.get(event.case_id) ?? new Map<string, string>();
      const rawByEventId = rawByCase.get(event.case_id) ?? new Map<string, string>();
      const expected = expectedByCase.get(event.case_id) ?? { items: new Map<string, ExpectedItem>(), relations: new Set<string>() };
      runtimeByCase.set(event.case_id, runtimeByKey);
      rawByCase.set(event.case_id, rawByEventId);
      expectedByCase.set(event.case_id, expected);

      const raw = rawStore.ingest({
        session_id: sessionId,
        role: event.role,
        content: event.content,
        event_type: event.event_type,
        created_at: event.occurred_at,
        token_count: estimateTokens(event.content),
        source_event_id: `state-replay-v0.1:${event.event_id}`,
        metadata: {
          event_id: event.event_id,
          source_ordinal: event.source_ordinal,
          actor: event.actor,
          source_id: event.source_id,
          source_url: event.source_url,
          source_content_sha256: event.source_content_sha256,
          representation: "standardized_real_event_summary",
        },
      });
      rawByEventId.set(event.event_id, raw.id);
      const materialized = materializeDelta(deltaRecord, raw.id, runtimeByKey, rawByEventId, fixture.itemsByKey);
      const parsed = parseStrictStateDeltaPayload(materialized, extractorInput(stateStore, sessionId, raw));
      if (!isDeepStrictEqual(parsed, materialized)) fail(deltaRecord.step_id, "strict parser changed materialized Gold Delta");
      strictDeltaCount += 1;

      const beforeState = canonicalActualState(stateStore, sessionId, runtimeByKey, rawByEventId);
      const previousRevision = stateStore.getRevision(sessionId);
      const result = reducer.applyAtRevision(sessionId, parsed, previousRevision, () => undefined);
      const createdKeys = expectedCreatedKeys(deltaRecord);
      if (!isDeepStrictEqual(createdKeys, checkpoint.expected_created_keys)) fail(checkpoint.step_id, "checkpoint created-key order differs from Gold Delta");
      if (result.created.length !== createdKeys.length) fail(checkpoint.step_id, "reducer created count changed");
      result.created.forEach((created, createdIndex) => {
        const key = createdKeys[createdIndex];
        const definition = fixture.itemsByKey.get(key) ?? fail(checkpoint.step_id, `unknown created key ${key}`);
        if (created.type !== definition.type || created.content !== definition.content) fail(checkpoint.step_id, `created order/content mismatch for ${key}`);
        runtimeByKey.set(key, created.id);
      });
      createdItemCount += result.created.length;

      const expectedState = applyExpectedCheckpoint(expected, checkpoint, fixture.itemsByKey);
      const actualState = canonicalActualState(stateStore, sessionId, runtimeByKey, rawByEventId);
      if (!isDeepStrictEqual(actualState, expectedState)) {
        fail(checkpoint.step_id, `actual state differs from independently declared checkpoint\nactual=${stableJson(actualState)}\nexpected=${stableJson(expectedState)}`);
      }
      checkpointMatchCount += 1;
      canonicalSteps.push({ step_id: checkpoint.step_id, state: actualState });
      finalStates[event.case_id] = actualState;

      const operationCount = countDeltaOperations(deltaRecord);
      if (operationCount === 0) {
        emptyDeltaCount += 1;
        if (result.revision !== previousRevision || !isDeepStrictEqual(beforeState, actualState)) fail(checkpoint.step_id, "empty delta mutated state/revision");
        noOpMatchCount += 1;
      } else if (result.revision !== previousRevision + 1) {
        fail(checkpoint.step_id, "non-empty delta did not advance exactly one revision");
      }

      const currentProvenanceKeys = new Set((checkpoint.expected_source_ref_additions as Array<[string, string]>).filter(([, eventId]) => eventId === event.event_id).map(([key]) => key));
      for (const key of checkpoint.expected_created_keys as string[]) {
        if (!currentProvenanceKeys.has(key)) fail(checkpoint.step_id, `new item ${key} lacks current-event provenance`);
      }
      for (const [key] of checkpoint.expected_status_changes as Array<[string, string]>) {
        if (!currentProvenanceKeys.has(key)) fail(checkpoint.step_id, `lifecycle change ${key} lacks current-event provenance`);
        lifecycleProvenanceCount += 1;
      }
    }

    if (exerciseStale) {
      const sessionId = "state-replay/STR-08";
      const runtimeByKey = runtimeByCase.get("STR-08")!;
      const rawByEventId = rawByCase.get("STR-08")!;
      const before = canonicalActualState(stateStore, sessionId, runtimeByKey, rawByEventId);
      let snapshotCallbackCalled = false;
      try {
        reducer.applyAtRevision(sessionId, {
          new_goals: [{ content: "This stale mutation must never be applied.", source_refs: [rawByEventId.get("STR-08/E4")!] }],
          updated_goals: [], new_constraints: [], updated_constraints: [], new_decisions: [], resolved_questions: [], new_open_questions: [], rejected_alternatives: [], supersessions: [], new_relations: [],
        }, before.revision - 1, () => { snapshotCallbackCalled = true; });
        fail("stale_revision", "mutation unexpectedly applied");
      } catch (error) {
        if (!(error instanceof StateRevisionConflictError)) throw error;
      }
      const after = canonicalActualState(stateStore, sessionId, runtimeByKey, rawByEventId);
      if (snapshotCallbackCalled || !isDeepStrictEqual(before, after)) fail("stale_revision", "did not fail before callback/mutation");
      staleRevisionFailClosedCount = 1;
    }
  } finally {
    stateStore.close();
    rawStore.close();
    await rm(temporaryDirectory, { recursive: true, force: true });
  }

  const relationCounts: Record<string, number> = { DERIVED_FROM: 0, SUPERSEDES: 0, RESOLVED_BY: 0, REJECTS: 0, DEPENDS_ON: 0 };
  for (const state of Object.values(finalStates)) {
    for (const relation of state.relations) {
      const type = relation.split("|")[1];
      relationCounts[type] = (relationCounts[type] ?? 0) + 1;
    }
  }
  return {
    canonical_steps: canonicalSteps,
    final_states: finalStates,
    strict_delta_count: strictDeltaCount,
    empty_delta_count: emptyDeltaCount,
    checkpoint_match_count: checkpointMatchCount,
    no_op_match_count: noOpMatchCount,
    created_item_count: createdItemCount,
    lifecycle_provenance_count: lifecycleProvenanceCount,
    stale_revision_fail_closed_count: staleRevisionFailClosedCount,
    relation_counts: relationCounts,
  };
}

export async function runSt01Conformance(
  repositoryRoot = DEFAULT_REPOSITORY_ROOT,
  options: { fixture_root?: string } = {},
): Promise<JsonRecord> {
  const fixture = await loadFixture(repositoryRoot, options.fixture_root);
  const sealed = await validateDs13Results(repositoryRoot);
  if (sealed.status !== "automatic_diagnostic_and_blank_review_bundle_valid_pending_independent_qa") fail("baseline-seal", "DS-13 fixed artifact validation failed");

  const first = await replayOnce(fixture, true);
  const second = await replayOnce(fixture, false);
  if (!isDeepStrictEqual(first.canonical_steps, second.canonical_steps)) fail("determinism", "fresh-database canonical replay differs");

  const expected = fixture.coverage.expected_counts;
  if (first.strict_delta_count !== expected.event_steps || first.checkpoint_match_count !== expected.event_steps) fail("coverage.event_steps", "count mismatch");
  if (first.empty_delta_count !== expected.empty_delta_true_negatives || first.no_op_match_count !== expected.empty_delta_true_negatives) fail("coverage.empty_delta", "count mismatch");
  if (first.created_item_count !== expected.created_items) fail("coverage.created_items", "count mismatch");
  if (first.stale_revision_fail_closed_count !== expected.stale_revision_fail_closed_mutations) fail("coverage.stale_revision", "count mismatch");
  if (!isDeepStrictEqual(first.relation_counts, expected.relations)) fail("coverage.relations", `count mismatch ${stableJson(first.relation_counts)}`);

  const finalItems = Object.values(first.final_states).flatMap((state) => state.items);
  const statusCount = (type: ContextItemType, status: ContextItemStatus): number => finalItems.filter((entry) => entry.type === type && entry.status === status).length;
  if (statusCount("GOAL", "COMPLETED") !== expected.completed_goals) fail("coverage.completed_goals", "count mismatch");
  if (statusCount("DECISION", "SUPERSEDED") !== expected.superseded_decisions) fail("coverage.superseded_decisions", "count mismatch");
  if (statusCount("OPEN_QUESTION", "RESOLVED") !== expected.resolved_questions) fail("coverage.resolved_questions", "count mismatch");
  if (statusCount("REJECTED_ALTERNATIVE", "REJECTED") !== expected.rejected_alternatives) fail("coverage.rejected_alternatives", "count mismatch");

  const canonicalSha256 = sha256(stableJson(first.canonical_steps));
  return {
    schema_version: "state_replay_st01_report/v1",
    status: "st01_reducer_conformance_passed_pending_independent_qa",
    scope: "standardized_real_event_summary_to_gold_delta_reducer_conformance",
    baseline: {
      feasibility_01: "sealed_oracle_state_feasibility_only",
      answer_semantic_gain: "not_evaluated",
      official_artifact_rerun_count: 0,
      official_artifact_modified: false,
    },
    gate0: {
      status: fixture.gate0.status,
      event_count: fixture.gate0.counts.event_count,
      strict_expressible_count: fixture.gate0.counts.strict_expressible_count,
      same_step_reference_limit_count: fixture.gate0.counts.same_step_reference_limit_count,
      input_representation: fixture.gate0.input_representation,
    },
    counts: {
      case_count: 3,
      event_step_count: first.strict_delta_count,
      non_empty_delta_count: first.strict_delta_count - first.empty_delta_count,
      empty_delta_true_negative_count: first.empty_delta_count,
      strict_delta_valid_count: first.strict_delta_count,
      checkpoint_match_count: first.checkpoint_match_count,
      deterministic_fresh_replay_count: 2,
      created_item_count: first.created_item_count,
      lifecycle_transition_with_current_provenance_count: first.lifecycle_provenance_count,
      stale_revision_fail_closed_count: first.stale_revision_fail_closed_count,
      model_call_count: 0,
      provider_call_count: 0,
      network_call_count: 0,
      evaluator_run_count: 0,
    },
    relation_counts: first.relation_counts,
    final_status_counts: {
      completed_goals: statusCount("GOAL", "COMPLETED"),
      superseded_decisions: statusCount("DECISION", "SUPERSEDED"),
      resolved_questions: statusCount("OPEN_QUESTION", "RESOLVED"),
      rejected_alternatives: statusCount("REJECTED_ALTERNATIVE", "REJECTED"),
    },
    invariants: {
      strict_schema: { eligible: 30, passed: 30, status: "passed" },
      expected_state_checkpoint: { eligible: 30, passed: 30, status: "passed" },
      deterministic_replay: { eligible: 1, passed: 1, status: "passed" },
      empty_delta_no_mutation: { eligible: 2, passed: 2, status: "passed" },
      stale_revision_fail_closed: { eligible: 1, passed: 1, status: "passed" },
      relation_types: Object.fromEntries(Object.entries(first.relation_counts).map(([type, count]) => [type, { eligible: count, passed: count, status: count === 0 ? "not_evaluable" : "passed" }])),
      excluded_zero_denominators: fixture.coverage.not_evaluable_as_success,
    },
    canonical_replay_sha256: canonicalSha256,
    st02_authorized: false,
    next_gate: "independent_st01_qa",
    claims_not_made: [
      "verbatim_raw_github_body_extraction",
      "extractor_correctness",
      "context_reduction",
      "answer_quality",
      "architecture_winner",
      "PACE_or_evidence_paging",
    ],
  };
}
