import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { lstat, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { StateReducer } from "../../../src/reducer.js";
import { SqliteRawHistoryStore, estimateTokens, type JsonObject, type RawEvent } from "../../../src/raw-store.js";
import { SqliteContextStateStore } from "../../../src/state-store.js";
import {
  StrictStateExtractor,
  type ExtractorInput,
  type ExtractorResult,
  type ExtractorTransport,
} from "../../../src/extractor.js";
import type { ContextItem, StateDelta, StateRelation } from "../../../src/state-types.js";

const THIS_DIRECTORY = dirname(fileURLToPath(import.meta.url));
export const DEFAULT_REPOSITORY_ROOT = join(THIS_DIRECTORY, "../../..");
const DEFAULT_FIXTURE_ROOT = join(THIS_DIRECTORY, "..");
const EVENT_STREAM_PATH = "source/event-stream.jsonl";
const RUN_CONTRACT_PATH = "st02/contract/run-contract.json";
const RESPONSE_CONTRACT_PATH = "st02/contract/response-contract.json";
const FIXED_EVENT_STREAM_REPOSITORY_PATH =
  "evaluation/state-replay-v0.1/source/event-stream.jsonl";
const EMPTY_DELTA_TEXT = JSON.stringify({
  new_goals: [],
  updated_goals: [],
  new_constraints: [],
  updated_constraints: [],
  new_decisions: [],
  resolved_questions: [],
  new_open_questions: [],
  rejected_alternatives: [],
  supersessions: [],
  new_relations: [],
});
const EVENT_KEYS = [
  "schema_version",
  "case_id",
  "session_id",
  "selected_seq",
  "event_id",
  "source_ordinal",
  "role",
  "event_type",
  "occurred_at",
  "content",
  "actor",
  "source_id",
  "source_url",
  "source_content_sha256",
] as const;
const RESPONSE_KEYS = ["schema_version", "packet_id", "raw_response"] as const;
const METADATA_KEYS = [
  "schema_version",
  "packet_id",
  "capture_ordinal",
  "event_id",
  "prompt_sha256",
  "raw_response_sha256",
  "model",
  "reasoning_effort",
  "fork_turns",
  "fresh_session",
  "attempt",
  "tools_enabled",
  "network_access",
  "repository_access",
  "started_at",
  "completed_at",
  "transport_status",
] as const;

export const ACCEPTED_ST02_SOURCE = Object.freeze({
  st01_qa_commit: "daa012c4d6f09919e798edc3771cf090bd5dd188",
  st01_builder_commit: "826eb4760fe8df557a2aa7d07225bc1986579281",
  st01_data_commit: "79da83d95aeac7162c95714f4f6f5eff1f9e0608",
  st01_data_parent: "aeed861b3e3c538fbf6aa1393a5745fb4d61490b",
  canonical_source_commit: "4b974538d76d0e0d8a5ac17c5662533b714ef00e",
  event_stream_git_blob: "9b4b18c77a5496278325429be2df6aaf767281e9",
  event_stream_sha256: "a35771410cd027a70e439add43a268529826def666c14421b629e79a47c0a4e1",
});

export const ACCEPTED_ST02_CONTRACT_SOURCE = Object.freeze({
  commit: "8d31cb6fc06b6b99bc141258539deb51b46d2d1b",
  parent: "daa012c4d6f09919e798edc3771cf090bd5dd188",
  files: Object.freeze([
    Object.freeze({
      path: "st02/contract/run-contract.json",
      blob: "536e11f6ca9dc3cf91d7c761a99e9afb6564b13e",
      sha256: "7a78f885c177cbd1a89458fe8694dffee51647e8ab7797992188049e97b8e502",
    }),
    Object.freeze({
      path: "st02/contract/response-contract.json",
      blob: "96bb261c615e72f69580c338c3ccdc1450ec2dd6",
      sha256: "be4a39e39ad0822b60bdce11936e6a1bf144094f068d857ed0a00231a50269dd",
    }),
  ]),
});

type JsonRecord = Record<string, any>;

export interface StateReplayEvent extends JsonRecord {
  schema_version: "state_replay_event/v1";
  case_id: string;
  session_id: string;
  selected_seq: number;
  event_id: string;
  source_ordinal: number;
  role: "user";
  event_type: string;
  occurred_at: string;
  content: string;
  actor: string;
  source_id: string;
  source_url: string;
  source_content_sha256: string;
}

export interface StateReplayResponse {
  schema_version: "state_replay_st02_response/v1";
  packet_id: string;
  raw_response: string;
}

export interface StateReplayCaptureMetadata extends JsonRecord {
  schema_version: "state_replay_st02_capture_metadata/v1";
  packet_id: string;
  capture_ordinal: number;
  event_id: string;
  prompt_sha256: string;
  raw_response_sha256: string;
  model: "gpt-5.6-terra";
  reasoning_effort: "medium";
  fork_turns: "none";
  fresh_session: true;
  attempt: 1;
  tools_enabled: false;
  network_access: false;
  repository_access: false;
  started_at: string;
  completed_at: string;
  transport_status: "completed" | "failed";
}

export interface StateReplayPacket extends JsonRecord {
  schema_version: "state_replay_st02_packet/v1";
  packet_id: string;
  capture_ordinal: number;
  event_id: string;
  case_id: string;
  previous_predicted_revision: number;
  previous_response_chain_sha256: string;
  extractor_input: ExtractorInput;
  prompt: string;
  prompt_sha256: string;
  remote_session: JsonRecord;
}

export interface ReplayObservation extends JsonRecord {
  packet_id: string;
  event_id: string;
  extractor_attempts: number;
  extractor_fallback_used: boolean;
  extractor_error_codes: string[];
  reducer_rejected: boolean;
  reducer_error_name: string | null;
  previous_revision: number;
  next_revision: number;
  state_unchanged_on_rejection: boolean | null;
}

export interface SourceOnlyResult extends JsonRecord {
  schema_version: "state_replay_st02_source_only/v1";
  status: "next_packet_ready_no_model_called" | "response_prefix_complete_no_scoring";
  processed_response_count: number;
  model_call_count: 0;
  scoring_run_count: 0;
  observations: ReplayObservation[];
  next_packet?: StateReplayPacket;
}

export interface SourceOnlyOptions {
  fixture_root?: string;
  /** Focused-test-only stale revision injection; official source-only calls omit it. */
  test_expected_revision_by_event?: Readonly<Record<string, number>>;
}

interface Fixture {
  events: StateReplayEvent[];
  runContract: JsonRecord;
  responseContract: JsonRecord;
}

class StateReplayContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StateReplayContractError";
  }
}

function fail(path: string, message: string): never {
  throw new StateReplayContractError(`${path}: ${message}`);
}

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function stableId(namespace: string, value: string): string {
  return `${namespace}_${sha256(`state-replay-v0.1|${namespace}|${value}`).slice(0, 24)}`;
}

export function packetIdForEvent(eventId: string): string {
  return stableId("pkt", eventId);
}

function rawIdForEvent(eventId: string): string {
  return stableId("evt", `${ACCEPTED_ST02_SOURCE.st01_data_commit}|${eventId}`);
}

function stateIdForOrdinal(caseId: string, ordinal: number): string {
  return stableId("sti", `${caseId}|${ordinal}`);
}

function requirePlainRecord(value: unknown, path: string): JsonRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    fail(path, "expected plain JSON object");
  }
  if (Object.getPrototypeOf(value) !== Object.prototype) fail(path, "expected ordinary prototype");
  return value as JsonRecord;
}

function exactKeys(value: JsonRecord, keys: readonly string[], path: string): void {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    fail(path, `expected exact keys ${expected.join(",")}; received ${actual.join(",")}`);
  }
}

function exactJson(value: JsonRecord, expected: JsonRecord, path: string): void {
  exactKeys(value, Object.keys(expected), path);
  if (JSON.stringify(value) !== JSON.stringify(expected)) fail(path, "fixed JSON contract changed");
}

function requireString(value: unknown, path: string): string {
  if (typeof value !== "string" || value.length === 0) fail(path, "expected non-empty string");
  return value;
}

function requireTimestamp(value: unknown, path: string): string {
  const text = requireString(value, path);
  const date = new Date(text);
  if (Number.isNaN(date.valueOf()) || date.toISOString() !== text) fail(path, "expected canonical timestamp");
  return text;
}

function parseJson(text: string, path: string): JsonRecord {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    fail(path, "invalid JSON");
  }
  return requirePlainRecord(parsed, path);
}

function gitBuffer(repositoryRoot: string, args: readonly string[]): Promise<Buffer> {
  return new Promise((resolvePromise, rejectPromise) => {
    execFile(
      "git",
      ["-C", repositoryRoot, ...args],
      { encoding: "buffer", maxBuffer: 10 * 1024 * 1024 },
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

async function readRegularFile(path: string): Promise<Buffer> {
  const stat = await lstat(path);
  if (!stat.isFile() || stat.isSymbolicLink()) fail(path, "expected regular non-symlink file");
  return readFile(path);
}

async function validateSourceAnchor(repositoryRoot: string, fixtureRoot: string): Promise<Buffer> {
  const dataCommit = await gitText(repositoryRoot, ["rev-parse", `${ACCEPTED_ST02_SOURCE.st01_data_commit}^{commit}`]);
  if (dataCommit !== ACCEPTED_ST02_SOURCE.st01_data_commit) fail("source.commit", "fixed data commit unavailable");
  const parent = await gitText(repositoryRoot, ["show", "-s", "--format=%P", dataCommit]);
  if (parent !== ACCEPTED_ST02_SOURCE.st01_data_parent) fail("source.parent", "fixed data parent changed");
  const blob = await gitText(repositoryRoot, [
    "rev-parse",
    `${dataCommit}:${FIXED_EVENT_STREAM_REPOSITORY_PATH}`,
  ]);
  if (blob !== ACCEPTED_ST02_SOURCE.event_stream_git_blob) fail("source.blob", "fixed event blob changed");
  const fixedBytes = await gitBuffer(repositoryRoot, ["cat-file", "blob", blob]);
  if (sha256(fixedBytes) !== ACCEPTED_ST02_SOURCE.event_stream_sha256) {
    fail("source.sha256", "fixed event bytes changed");
  }
  const currentPath = join(fixtureRoot, EVENT_STREAM_PATH);
  const currentBytes = await readRegularFile(currentPath);
  if (!currentBytes.equals(fixedBytes)) fail(currentPath, "current bytes differ from fixed 79da83d Git blob");
  return currentBytes;
}

async function validateContractAnchor(repositoryRoot: string, fixtureRoot: string): Promise<void> {
  const source = ACCEPTED_ST02_CONTRACT_SOURCE;
  const commit = await gitText(repositoryRoot, ["rev-parse", `${source.commit}^{commit}`]);
  if (commit !== source.commit) fail("accepted_st02_contract.commit", "fixed contract commit unavailable");
  const parent = await gitText(repositoryRoot, ["show", "-s", "--format=%P", commit]);
  if (parent !== source.parent) fail("accepted_st02_contract.parent", "fixed contract parent changed");
  for (const entry of source.files) {
    const repositoryPath = `evaluation/state-replay-v0.1/${entry.path}`;
    const blob = await gitText(repositoryRoot, ["rev-parse", `${commit}:${repositoryPath}`]);
    if (blob !== entry.blob) fail(`accepted_st02_contract.${entry.path}.blob`, "fixed contract blob changed");
    const fixedBytes = await gitBuffer(repositoryRoot, ["cat-file", "blob", blob]);
    if (sha256(fixedBytes) !== entry.sha256) {
      fail(`accepted_st02_contract.${entry.path}.sha256`, "fixed contract digest changed");
    }
    const currentBytes = await readRegularFile(join(fixtureRoot, entry.path));
    if (!currentBytes.equals(fixedBytes)) {
      fail(`accepted_st02_contract.${entry.path}`, "current bytes differ from fixed 8d31cb6 Git blob");
    }
  }
}

function parseEvents(bytes: Buffer, order: readonly unknown[]): StateReplayEvent[] {
  const text = bytes.toString("utf8");
  if (!text.endsWith("\n")) fail(EVENT_STREAM_PATH, "must end with one newline");
  const lines = text.trimEnd().split("\n");
  if (lines.length !== 30) fail(EVENT_STREAM_PATH, "expected exactly 30 events");
  const events = lines.map((line, index) => {
    const path = `${EVENT_STREAM_PATH}:${index + 1}`;
    const event = parseJson(line, path) as StateReplayEvent;
    exactKeys(event, EVENT_KEYS, path);
    if (event.schema_version !== "state_replay_event/v1") fail(path, "schema version changed");
    if (event.role !== "user") fail(path, "only accepted user-role source events are allowed");
    if (!Number.isSafeInteger(event.selected_seq) || event.selected_seq < 1) fail(path, "invalid selected_seq");
    if (!Number.isSafeInteger(event.source_ordinal) || event.source_ordinal < 1) fail(path, "invalid source_ordinal");
    requireTimestamp(event.occurred_at, `${path}.occurred_at`);
    for (const key of ["case_id", "session_id", "event_id", "event_type", "content", "actor", "source_id", "source_url"] as const) {
      requireString(event[key], `${path}.${key}`);
    }
    if (!/^[a-f0-9]{64}$/.test(event.source_content_sha256)) fail(path, "invalid source digest");
    return event;
  });
  const actualOrder = events.map((event) => event.event_id);
  if (JSON.stringify(actualOrder) !== JSON.stringify(order)) fail(EVENT_STREAM_PATH, "event order differs from run contract");
  const seen = new Set<string>();
  const nextByCase = new Map<string, number>();
  for (const event of events) {
    if (seen.has(event.event_id)) fail(event.event_id, "duplicate event id");
    seen.add(event.event_id);
    const expected = nextByCase.get(event.case_id) ?? 1;
    if (event.selected_seq !== expected) fail(event.event_id, `expected selected_seq ${expected}`);
    nextByCase.set(event.case_id, expected + 1);
    if (event.session_id !== `state-replay/${event.case_id}`) fail(event.event_id, "session/case mismatch");
  }
  return events;
}

function validateRunContract(contract: JsonRecord): readonly string[] {
  exactKeys(contract, [
    "schema_version",
    "status",
    "authorization",
    "accepted_identities",
    "input_boundary",
    "remote_session",
    "extractor",
    "reducer",
    "capture",
    "interpretation",
    "step_order",
  ], RUN_CONTRACT_PATH);
  if (contract.schema_version !== "state_replay_st02_run_contract/v1") fail(RUN_CONTRACT_PATH, "schema version changed");
  if (contract.status !== "source_only_contract_pending_independent_run_gate_qa") fail(RUN_CONTRACT_PATH, "run-gate status changed");
  const authorization = requirePlainRecord(contract.authorization, `${RUN_CONTRACT_PATH}.authorization`);
  if (JSON.stringify(authorization) !== JSON.stringify({
    model_authorized: false,
    official_capture_authorized: false,
    qa_may_call_model: false,
    next_authority: "independent_run_gate_qa_then_controller_decision",
  })) fail(`${RUN_CONTRACT_PATH}.authorization`, "model authorization boundary changed");
  const identities = requirePlainRecord(contract.accepted_identities, `${RUN_CONTRACT_PATH}.accepted_identities`);
  exactJson(identities, {
    st01_qa_commit: ACCEPTED_ST02_SOURCE.st01_qa_commit,
    st01_builder_commit: ACCEPTED_ST02_SOURCE.st01_builder_commit,
    st01_data_commit: ACCEPTED_ST02_SOURCE.st01_data_commit,
    canonical_source_commit: ACCEPTED_ST02_SOURCE.canonical_source_commit,
    event_stream_git_blob: ACCEPTED_ST02_SOURCE.event_stream_git_blob,
    event_stream_sha256: ACCEPTED_ST02_SOURCE.event_stream_sha256,
  }, `${RUN_CONTRACT_PATH}.accepted_identities`);
  exactJson(requirePlainRecord(contract.input_boundary, `${RUN_CONTRACT_PATH}.input_boundary`), {
    previous_predicted_typed_state: true,
    current_standardized_raw_event_only: true,
    include_lifecycle_tombstones: true,
    include_existing_non_provenance_state_relations: true,
    recent_context: [],
    newest_events_cardinality: 1,
    historical_raw_events: false,
    oracle_state: false,
    future_events: false,
    outcome_or_decision_reference: false,
  }, `${RUN_CONTRACT_PATH}.input_boundary`);
  const remote = requirePlainRecord(contract.remote_session, `${RUN_CONTRACT_PATH}.remote_session`);
  const expectedRemote: JsonRecord = {
    model: "gpt-5.6-terra",
    model_family: "gpt-5.6-non-sol",
    reasoning_effort: "medium",
    fork_turns: "none",
    fresh_session_per_step: true,
    attempts_per_step: 1,
    adaptive_retry: false,
    best_of: false,
    tools_enabled: false,
    network_access: false,
    repository_access: false,
    maximum_concurrency: 3,
  };
  exactJson(remote, expectedRemote, `${RUN_CONTRACT_PATH}.remote_session`);
  const extractor = requirePlainRecord(contract.extractor, `${RUN_CONTRACT_PATH}.extractor`);
  exactJson(extractor, {
    implementation: "StrictStateExtractor",
    max_attempts: 1,
    invalid_json_schema_or_reference: "empty_delta_fallback",
    manual_repair: false,
  }, `${RUN_CONTRACT_PATH}.extractor`);
  const reducer = requirePlainRecord(contract.reducer, `${RUN_CONTRACT_PATH}.reducer`);
  exactJson(reducer, {
    implementation: "StateReducer",
    expected_revision: "previous_predicted_state_revision",
    rejection: "record_extractor_produced_invalid_transition_and_keep_state_unchanged",
    manual_repair: false,
  }, `${RUN_CONTRACT_PATH}.reducer`);
  exactJson(requirePlainRecord(contract.capture, `${RUN_CONTRACT_PATH}.capture`), {
    official_run_count: 1,
    packet_count: 30,
    raw_response_per_step: true,
    response_and_metadata_physically_separate: true,
    qa_remote_session_count: 0,
    builder_judge_model_call_count: 0,
  }, `${RUN_CONTRACT_PATH}.capture`);
  exactJson(requirePlainRecord(contract.interpretation, `${RUN_CONTRACT_PATH}.interpretation`), {
    aggregate_threshold: null,
    weighted_score: null,
    architecture_winner: null,
    context_reduction_priority: "secondary",
    answer_quality_evaluation: false,
    pace_evidence_experience_scope: false,
  }, `${RUN_CONTRACT_PATH}.interpretation`);
  if (!Array.isArray(contract.step_order) || contract.step_order.length !== 30 || contract.step_order.some((entry: unknown) => typeof entry !== "string")) {
    fail(`${RUN_CONTRACT_PATH}.step_order`, "expected 30 string event ids");
  }
  return contract.step_order as string[];
}

function validateResponseContract(contract: JsonRecord): void {
  exactKeys(contract, ["schema_version", "status", "response_file", "metadata_file", "invalid_response_policy", "replay"], RESPONSE_CONTRACT_PATH);
  if (contract.schema_version !== "state_replay_st02_response_contract/v1") fail(RESPONSE_CONTRACT_PATH, "schema version changed");
  if (contract.status !== "frozen_shape_pending_independent_run_gate_qa") fail(RESPONSE_CONTRACT_PATH, "run-gate status changed");
  const response = requirePlainRecord(contract.response_file, `${RESPONSE_CONTRACT_PATH}.response_file`);
  const metadata = requirePlainRecord(contract.metadata_file, `${RESPONSE_CONTRACT_PATH}.metadata_file`);
  exactJson(response, {
    directory: "capture/responses",
    filename: "<packet_id>.json",
    encoding: "utf8",
    format: "one_plain_json_object_per_file",
    exact_keys: [...RESPONSE_KEYS],
    schema_version_value: "state_replay_st02_response/v1",
    raw_response_semantics: "exact_transport_text_encoded_as_a_json_string_without_repair",
  }, `${RESPONSE_CONTRACT_PATH}.response_file`);
  exactJson(metadata, {
    directory: "capture/metadata",
    filename: "<packet_id>.json",
    encoding: "utf8",
    format: "one_plain_json_object_per_file",
    exact_keys: [...METADATA_KEYS],
    schema_version_value: "state_replay_st02_capture_metadata/v1",
  }, `${RESPONSE_CONTRACT_PATH}.metadata_file`);
  const invalid = requirePlainRecord(contract.invalid_response_policy, `${RESPONSE_CONTRACT_PATH}.invalid_response_policy`);
  exactJson(invalid, {
    preserve_raw_response_text: true,
    do_not_force_response_text_to_parse_as_json: true,
    strict_extractor_max_attempts: 1,
    fallback: "empty_delta",
    manual_repair: false,
  }, `${RESPONSE_CONTRACT_PATH}.invalid_response_policy`);
  exactJson(requirePlainRecord(contract.replay, `${RESPONSE_CONTRACT_PATH}.replay`), {
    order: "run-contract.step_order",
    response_hash: "sha256(utf8(raw_response))",
    prompt_hash_must_match_packet: true,
    metadata_is_not_model_input: true,
  }, `${RESPONSE_CONTRACT_PATH}.replay`);
}

async function loadFixture(repositoryRoot: string, fixtureRootValue?: string): Promise<Fixture> {
  const fixtureRoot = resolve(fixtureRootValue ?? DEFAULT_FIXTURE_ROOT);
  const eventBytes = await validateSourceAnchor(repositoryRoot, fixtureRoot);
  // Contract Git objects and current bytes are fixed before either current JSON document is parsed.
  await validateContractAnchor(repositoryRoot, fixtureRoot);
  const runContract = parseJson((await readRegularFile(join(fixtureRoot, RUN_CONTRACT_PATH))).toString("utf8"), RUN_CONTRACT_PATH);
  const responseContract = parseJson((await readRegularFile(join(fixtureRoot, RESPONSE_CONTRACT_PATH))).toString("utf8"), RESPONSE_CONTRACT_PATH);
  const order = validateRunContract(runContract);
  validateResponseContract(responseContract);
  return { events: parseEvents(eventBytes, order), runContract, responseContract };
}

class PromptTransport implements ExtractorTransport {
  prompt: string | undefined;

  constructor(private readonly response: string) {}

  async complete(prompt: string): Promise<string> {
    if (this.prompt !== undefined) fail("transport", "more than one attempt was requested");
    this.prompt = prompt;
    return this.response;
  }
}

class ReplayMachine {
  private readonly rawStore: SqliteRawHistoryStore;
  private readonly stateStore: SqliteContextStateStore;
  private readonly reducer: StateReducer;
  private readonly actualRawByPublic = new Map<string, string>();
  private readonly publicRawByActual = new Map<string, string>();
  private readonly actualItemByPublic = new Map<string, string>();
  private readonly publicItemByActual = new Map<string, string>();
  private readonly itemOrdinalByCase = new Map<string, number>();
  private readonly createdAtByActualItem = new Map<string, string>();
  private readonly updatedAtByActualItem = new Map<string, string>();
  private readonly relationAtByPublicKey = new Map<string, string>();
  private readonly temporaryDirectory: string;

  private constructor(temporaryDirectory: string) {
    this.temporaryDirectory = temporaryDirectory;
    const databasePath = join(temporaryDirectory, "source-only-replay.db");
    this.rawStore = new SqliteRawHistoryStore(databasePath);
    this.stateStore = new SqliteContextStateStore(databasePath);
    this.reducer = new StateReducer(this.stateStore);
  }

  static async create(): Promise<ReplayMachine> {
    return new ReplayMachine(await mkdtemp(join(tmpdir(), "context-compiler-st02-source-only-")));
  }

  async close(): Promise<void> {
    this.stateStore.close();
    this.rawStore.close();
    await rm(this.temporaryDirectory, { recursive: true, force: true });
  }

  private publicRaw(event: StateReplayEvent): RawEvent {
    return {
      id: rawIdForEvent(event.event_id),
      session_id: event.session_id,
      seq: event.selected_seq,
      role: event.role,
      content: event.content,
      event_type: event.event_type,
      created_at: event.occurred_at,
      token_count: estimateTokens(event.content),
      metadata: {
        event_id: event.event_id,
        source_ordinal: event.source_ordinal,
        actor: event.actor,
        source_id: event.source_id,
        source_url: event.source_url,
        source_content_sha256: event.source_content_sha256,
        representation: "standardized_real_event_summary",
      },
      source_event_id: `state-replay-v0.1:${event.event_id}`,
    };
  }

  private ingest(event: StateReplayEvent): { publicRaw: RawEvent; actualRawId: string } {
    const projected = this.publicRaw(event);
    const actual = this.rawStore.ingest({
      session_id: event.session_id,
      role: event.role,
      content: event.content,
      event_type: event.event_type,
      created_at: event.occurred_at,
      token_count: projected.token_count,
      metadata: projected.metadata,
      source_event_id: projected.source_event_id,
    });
    this.actualRawByPublic.set(projected.id, actual.id);
    this.publicRawByActual.set(actual.id, projected.id);
    return { publicRaw: projected, actualRawId: actual.id };
  }

  private projectItem(item: ContextItem): ContextItem {
    const publicId = this.publicItemByActual.get(item.id) ?? fail("state_projection", `unmapped state id ${item.id}`);
    const createdAt = this.createdAtByActualItem.get(item.id) ?? fail("state_projection", `missing deterministic created_at for ${publicId}`);
    const updatedAt = this.updatedAtByActualItem.get(item.id) ?? createdAt;
    return {
      id: publicId,
      session_id: item.session_id,
      type: item.type,
      content: item.content,
      status: item.status,
      confidence: item.confidence,
      created_at: createdAt,
      updated_at: updatedAt,
      source_refs: item.source_refs.map((id) => this.publicRawByActual.get(id) ?? fail("state_projection", `unmapped raw id ${id}`)),
      metadata: structuredClone(item.metadata),
    };
  }

  private publicRelationKey(relation: StateRelation): string {
    const source = this.publicItemByActual.get(relation.source_id) ?? fail("relation_projection", "unmapped source");
    const target = relation.relation_type === "DERIVED_FROM"
      ? this.publicRawByActual.get(relation.target_id) ?? fail("relation_projection", "unmapped raw target")
      : this.publicItemByActual.get(relation.target_id) ?? fail("relation_projection", "unmapped state target");
    return `${relation.session_id}|${source}|${relation.relation_type}|${target}`;
  }

  private projectRelation(relation: StateRelation): StateRelation {
    const key = this.publicRelationKey(relation);
    const [, sourceId, relationType, targetId] = key.split("|");
    return {
      session_id: relation.session_id,
      source_id: sourceId,
      relation_type: relationType as StateRelation["relation_type"],
      target_id: targetId,
      created_at: this.relationAtByPublicKey.get(key) ?? fail("relation_projection", `missing deterministic timestamp for ${key}`),
    };
  }

  private extractorInput(event: StateReplayEvent, raw: RawEvent): ExtractorInput {
    const activeState = this.stateStore.getItems(event.session_id)
      .map((item) => this.projectItem(item))
      .sort((left, right) => left.id.localeCompare(right.id));
    const stateRelations = this.stateStore.getSessionRelations(event.session_id)
      .filter((relation) => relation.relation_type !== "DERIVED_FROM")
      .map((relation) => this.projectRelation(relation))
      .sort((left, right) => this.publicRelationKeyFromProjected(left).localeCompare(this.publicRelationKeyFromProjected(right)));
    return {
      session_id: event.session_id,
      active_state: activeState,
      state_relations: stateRelations,
      recent_context: [],
      newest_events: [raw],
    };
  }

  private publicRelationKeyFromProjected(relation: StateRelation): string {
    return `${relation.session_id}|${relation.source_id}|${relation.relation_type}|${relation.target_id}`;
  }

  private actualItem(publicId: string): string {
    return this.actualItemByPublic.get(publicId) ?? fail("delta", `unknown opaque state id ${publicId}`);
  }

  private actualRaw(publicId: string): string {
    return this.actualRawByPublic.get(publicId) ?? fail("delta", `unknown opaque raw id ${publicId}`);
  }

  private translateDelta(delta: StateDelta): StateDelta {
    const sourceRefs = (refs: string[] | undefined): string[] | undefined => refs?.map((id) => this.actualRaw(id));
    return {
      new_goals: delta.new_goals.map((entry) => ({ ...entry, ...(entry.source_refs === undefined ? {} : { source_refs: sourceRefs(entry.source_refs) }) })),
      updated_goals: delta.updated_goals.map((entry) => ({ ...entry, id: this.actualItem(entry.id) })),
      new_constraints: delta.new_constraints.map((entry) => ({ ...entry, ...(entry.source_refs === undefined ? {} : { source_refs: sourceRefs(entry.source_refs) }) })),
      updated_constraints: delta.updated_constraints.map((entry) => ({ ...entry, id: this.actualItem(entry.id) })),
      new_decisions: delta.new_decisions.map((entry) => ({
        ...entry,
        ...(entry.source_refs === undefined ? {} : { source_refs: sourceRefs(entry.source_refs) }),
        ...(entry.supersedes === undefined ? {} : { supersedes: entry.supersedes.map((id) => this.actualItem(id)) }),
      })),
      resolved_questions: delta.resolved_questions.map((entry) => ({
        ...entry,
        id: this.actualItem(entry.id),
        ...(entry.resolved_by === undefined ? {} : { resolved_by: this.actualItem(entry.resolved_by) }),
      })),
      new_open_questions: delta.new_open_questions.map((entry) => ({ ...entry, ...(entry.source_refs === undefined ? {} : { source_refs: sourceRefs(entry.source_refs) }) })),
      rejected_alternatives: delta.rejected_alternatives.map((entry) => ({
        ...entry,
        ...(entry.source_refs === undefined ? {} : { source_refs: sourceRefs(entry.source_refs) }),
        ...(entry.rejects === undefined ? {} : { rejects: entry.rejects.map((id) => this.actualItem(id)) }),
      })),
      supersessions: delta.supersessions.map((entry) => ({
        superseded_id: this.actualItem(entry.superseded_id),
        superseding_id: this.actualItem(entry.superseding_id),
      })),
      new_relations: delta.new_relations.map((entry) => ({
        source_id: this.actualItem(entry.source_id),
        relation_type: entry.relation_type,
        target_id: entry.relation_type === "DERIVED_FROM" ? this.actualRaw(entry.target_id) : this.actualItem(entry.target_id),
      })),
    };
  }

  private stateFingerprint(sessionId: string): string {
    const state = {
      revision: this.stateStore.getRevision(sessionId),
      items: this.stateStore.getItems(sessionId).map((item) => this.projectItem(item)).sort((a, b) => a.id.localeCompare(b.id)),
      relations: this.stateStore.getSessionRelations(sessionId)
        .filter((relation) => relation.relation_type !== "DERIVED_FROM")
        .map((relation) => this.projectRelation(relation))
        .sort((a, b) => this.publicRelationKeyFromProjected(a).localeCompare(this.publicRelationKeyFromProjected(b))),
    };
    return sha256(JSON.stringify(state));
  }

  async packet(event: StateReplayEvent, captureOrdinal: number, responseChainSha256: string): Promise<{ packet: StateReplayPacket; actualRawId: string }> {
    const { publicRaw, actualRawId } = this.ingest(event);
    const input = this.extractorInput(event, publicRaw);
    const transport = new PromptTransport(EMPTY_DELTA_TEXT);
    const extractor = new StrictStateExtractor(transport, { maxAttempts: 1 });
    await extractor.extract(input);
    const prompt = transport.prompt ?? fail(event.event_id, "StrictStateExtractor did not call capture transport");
    return {
      packet: {
        schema_version: "state_replay_st02_packet/v1",
        packet_id: packetIdForEvent(event.event_id),
        capture_ordinal: captureOrdinal,
        event_id: event.event_id,
        case_id: event.case_id,
        previous_predicted_revision: this.stateStore.getRevision(event.session_id),
        previous_response_chain_sha256: responseChainSha256,
        extractor_input: input,
        prompt,
        prompt_sha256: sha256(prompt),
        remote_session: {
          model: "gpt-5.6-terra",
          reasoning_effort: "medium",
          fork_turns: "none",
          fresh_session: true,
          attempt: 1,
          tools_enabled: false,
          network_access: false,
          repository_access: false,
        },
      },
      actualRawId,
    };
  }

  async applyResponse(
    event: StateReplayEvent,
    packet: StateReplayPacket,
    response: StateReplayResponse,
    expectedRevisionOverride?: number,
  ): Promise<ReplayObservation> {
    const input = packet.extractor_input;
    const transport = new PromptTransport(response.raw_response);
    const extractor = new StrictStateExtractor(transport, { maxAttempts: 1 });
    const extracted: ExtractorResult = await extractor.extract(input);
    if (transport.prompt !== packet.prompt) fail(response.packet_id, "response replay prompt differs from packet prompt");
    const previousRevision = this.stateStore.getRevision(event.session_id);
    const beforeFingerprint = this.stateFingerprint(event.session_id);
    let reducerRejected = false;
    let reducerErrorName: string | null = null;
    try {
      const translated = this.translateDelta(extracted.delta);
      const result = this.reducer.applyAtRevision(
        event.session_id,
        translated,
        expectedRevisionOverride ?? previousRevision,
        () => undefined,
      );
      let nextOrdinal = this.itemOrdinalByCase.get(event.case_id) ?? 0;
      for (const item of result.created) {
        nextOrdinal += 1;
        const publicId = stateIdForOrdinal(event.case_id, nextOrdinal);
        this.actualItemByPublic.set(publicId, item.id);
        this.publicItemByActual.set(item.id, publicId);
        this.createdAtByActualItem.set(item.id, event.occurred_at);
        this.updatedAtByActualItem.set(item.id, event.occurred_at);
      }
      this.itemOrdinalByCase.set(event.case_id, nextOrdinal);
      for (const item of result.updated) this.updatedAtByActualItem.set(item.id, event.occurred_at);
      for (const relation of result.relations) {
        if (relation.relation_type === "DERIVED_FROM") continue;
        this.relationAtByPublicKey.set(this.publicRelationKey(relation), event.occurred_at);
      }
    } catch (error) {
      reducerRejected = true;
      reducerErrorName = error instanceof Error ? error.name : "NonErrorThrow";
    }
    const nextRevision = this.stateStore.getRevision(event.session_id);
    const afterFingerprint = this.stateFingerprint(event.session_id);
    return {
      packet_id: packet.packet_id,
      event_id: event.event_id,
      extractor_attempts: extracted.attempts,
      extractor_fallback_used: extracted.fallback_used,
      extractor_error_codes: [...extracted.error_codes],
      reducer_rejected: reducerRejected,
      reducer_error_name: reducerErrorName,
      previous_revision: previousRevision,
      next_revision: nextRevision,
      state_unchanged_on_rejection: reducerRejected ? beforeFingerprint === afterFingerprint : null,
    };
  }
}

function validateResponse(value: unknown, expectedPacket: StateReplayPacket): StateReplayResponse {
  const response = requirePlainRecord(value, expectedPacket.packet_id) as StateReplayResponse;
  exactKeys(response, RESPONSE_KEYS, expectedPacket.packet_id);
  if (response.schema_version !== "state_replay_st02_response/v1") fail(expectedPacket.packet_id, "response schema changed");
  if (response.packet_id !== expectedPacket.packet_id) fail(expectedPacket.packet_id, "response packet mismatch");
  if (typeof response.raw_response !== "string") fail(expectedPacket.packet_id, "raw_response must be a string");
  return response;
}

function validateCaptureMetadata(value: unknown, packet: StateReplayPacket, response: StateReplayResponse): StateReplayCaptureMetadata {
  const metadata = requirePlainRecord(value, `${packet.packet_id}.metadata`) as StateReplayCaptureMetadata;
  exactKeys(metadata, METADATA_KEYS, `${packet.packet_id}.metadata`);
  if (metadata.schema_version !== "state_replay_st02_capture_metadata/v1" || metadata.packet_id !== packet.packet_id || metadata.capture_ordinal !== packet.capture_ordinal || metadata.event_id !== packet.event_id) {
    fail(`${packet.packet_id}.metadata`, "capture identity mismatch");
  }
  if (metadata.prompt_sha256 !== packet.prompt_sha256 || metadata.raw_response_sha256 !== sha256(response.raw_response)) fail(`${packet.packet_id}.metadata`, "capture digest mismatch");
  if (metadata.model !== "gpt-5.6-terra" || metadata.reasoning_effort !== "medium" || metadata.fork_turns !== "none" || metadata.fresh_session !== true || metadata.attempt !== 1 || metadata.tools_enabled !== false || metadata.network_access !== false || metadata.repository_access !== false) {
    fail(`${packet.packet_id}.metadata`, "remote session policy mismatch");
  }
  const started = requireTimestamp(metadata.started_at, `${packet.packet_id}.metadata.started_at`);
  const completed = requireTimestamp(metadata.completed_at, `${packet.packet_id}.metadata.completed_at`);
  if (completed < started) fail(`${packet.packet_id}.metadata`, "completed_at precedes started_at");
  if (metadata.transport_status !== "completed" && metadata.transport_status !== "failed") fail(`${packet.packet_id}.metadata`, "invalid transport status");
  return metadata;
}

async function sourceOnlyReplay(
  repositoryRoot: string,
  fixture: Fixture,
  responseProvider: (packet: StateReplayPacket) => Promise<StateReplayResponse | undefined>,
  options: SourceOnlyOptions,
): Promise<SourceOnlyResult> {
  const machine = await ReplayMachine.create();
  const observations: ReplayObservation[] = [];
  let chain = sha256("");
  try {
    for (let index = 0; index < fixture.events.length; index += 1) {
      const event = fixture.events[index];
      const { packet } = await machine.packet(event, index + 1, chain);
      const responseValue = await responseProvider(packet);
      if (responseValue === undefined) {
        return {
          schema_version: "state_replay_st02_source_only/v1",
          status: "next_packet_ready_no_model_called",
          processed_response_count: observations.length,
          model_call_count: 0,
          scoring_run_count: 0,
          observations,
          next_packet: packet,
        };
      }
      const response = validateResponse(responseValue, packet);
      observations.push(await machine.applyResponse(
        event,
        packet,
        response,
        options.test_expected_revision_by_event?.[event.event_id],
      ));
      chain = sha256(`${chain}\n${packet.packet_id}\n${sha256(response.raw_response)}`);
    }
    return {
      schema_version: "state_replay_st02_source_only/v1",
      status: "response_prefix_complete_no_scoring",
      processed_response_count: observations.length,
      model_call_count: 0,
      scoring_run_count: 0,
      observations,
    };
  } finally {
    await machine.close();
  }
}

export async function buildNextPacket(
  repositoryRoot = DEFAULT_REPOSITORY_ROOT,
  responses: readonly StateReplayResponse[] = [],
  options: SourceOnlyOptions = {},
): Promise<SourceOnlyResult> {
  const fixture = await loadFixture(repositoryRoot, options.fixture_root);
  let index = 0;
  const result = await sourceOnlyReplay(repositoryRoot, fixture, async () => responses[index++], options);
  if (responses.length > result.processed_response_count) fail("responses", "response prefix extends past the fixed event stream");
  return result;
}

export async function buildNextPacketFromCapture(
  repositoryRoot = DEFAULT_REPOSITORY_ROOT,
  captureRootValue = join(DEFAULT_FIXTURE_ROOT, "st02/capture"),
  options: Omit<SourceOnlyOptions, "test_expected_revision_by_event"> = {},
): Promise<SourceOnlyResult> {
  const fixture = await loadFixture(repositoryRoot, options.fixture_root);
  const captureRoot = resolve(captureRootValue);
  return sourceOnlyReplay(repositoryRoot, fixture, async (packet) => {
    const responsePath = join(captureRoot, "responses", `${packet.packet_id}.json`);
    let responseBytes: Buffer;
    try {
      responseBytes = await readRegularFile(responsePath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
      throw error;
    }
    const response = validateResponse(parseJson(responseBytes.toString("utf8"), responsePath), packet);
    const metadataPath = join(captureRoot, "metadata", `${packet.packet_id}.json`);
    const metadata = parseJson((await readRegularFile(metadataPath)).toString("utf8"), metadataPath);
    validateCaptureMetadata(metadata, packet, response);
    return response;
  }, options);
}
