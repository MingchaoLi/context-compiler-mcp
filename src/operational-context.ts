import { createHash } from "node:crypto";
import {
  assembleContext,
  type CompiledContext,
  type ContextAssemblerInput,
} from "./assembler.js";
import type {
  ContextCompileHitInput,
  ExperienceLedgerRecord,
} from "./experience-ledger.js";
import {
  estimateTokens,
  normalizeDenseEmbedding,
  type DenseEmbedding,
  type JsonObject,
  type JsonValue,
  type RawEvent,
} from "./raw-store.js";
import type { ContextItem, StateRelation } from "./state-types.js";

export const OPERATIONAL_CONTEXT_POLICY_VERSION = "operational-context-v1";

export interface ContextPolicyInput {
  candidate_turn_multiplier?: number;
  recovery_candidate_turn_multiplier?: number;
  dormancy_turn_multiplier?: number;
  retrieval_limit?: number;
  recovery_retrieval_limit?: number;
  bm25_weight?: number;
  dense_weight?: number;
  recovery_failure_event_id?: string;
}

export interface ResolvedContextPolicy {
  candidate_turn_multiplier: number;
  recovery_candidate_turn_multiplier: number;
  dormancy_turn_multiplier: number;
  retrieval_limit: number;
  recovery_retrieval_limit: number;
  bm25_weight: number;
  dense_weight: number;
  recovery_failure_event_id: string | null;
}

export type DenseAvailability =
  | "hybrid"
  | "dense_unavailable_query_missing"
  | "dense_unavailable_no_candidates"
  | "dense_unavailable_partial_coverage"
  | "dense_unavailable_space_mismatch"
  | "dense_unavailable_dimension_mismatch"
  | "dense_unavailable_query_zero_norm"
  | "dense_unavailable_candidate_zero_norm"
  | "dense_unavailable_numeric";

export interface OperationalRetrievalScore {
  event_id: string;
  seq: number;
  bm25_raw: number;
  bm25_normalized: number;
  dense_cosine: number | null;
  dense_nonnegative: number | null;
  combined_score: number;
  selected: boolean;
}

export interface OperationalContextDebug extends JsonObject {
  policy_version: string;
  mode: "normal" | "targeted_recovery";
  dense_availability: DenseAvailability;
  candidate_turn_count: number;
  candidate_seq_start: number | null;
  candidate_seq_end: number | null;
  candidate_event_ids: string[];
  retrieval_limit: number;
  score_rows: JsonValue[];
  retrieved_event_ids: string[];
  retrieved_tokens: number;
  telemetry_baseline_seq: number | null;
  telemetry_baseline_raw_seq: number | null;
  telemetry_complete: boolean;
  dormancy_enabled: boolean;
  dormant_state_ids: string[];
  reactivated_state_ids: string[];
  dependency_rescued_state_ids: string[];
}

export interface OperationalContextInput {
  session_id: string;
  context_items: ContextItem[];
  state_relations: StateRelation[];
  raw_events: RawEvent[];
  current_input: string;
  include_current_input?: boolean;
  state_revision: number;
  token_budget?: number;
  recent_raw_window_turns?: number;
  context_policy?: ContextPolicyInput;
  dense_query?: DenseEmbedding;
  operation_id?: string;
  ledger_records?: ExperienceLedgerRecord[];
}

export interface OperationalContextResult {
  context: CompiledContext;
  policy: ResolvedContextPolicy;
  trace_payload: JsonObject;
  trace_raw_event_ids: string[];
  hits: ContextCompileHitInput[];
}

export class OperationalContextError extends Error {
  readonly code = "INVALID_OPERATIONAL_CONTEXT";

  constructor(message: string) {
    super(message);
    this.name = "OperationalContextError";
  }
}

const DEFAULT_POLICY: ResolvedContextPolicy = {
  candidate_turn_multiplier: 5,
  recovery_candidate_turn_multiplier: 8,
  dormancy_turn_multiplier: 15,
  retrieval_limit: 8,
  recovery_retrieval_limit: 16,
  bm25_weight: 0.6,
  dense_weight: 0.4,
  recovery_failure_event_id: null,
};

export function compileOperationalContext(input: OperationalContextInput): OperationalContextResult {
  const policy = resolveContextPolicy(input.context_policy);
  const recentTurns = input.recent_raw_window_turns ?? 8;
  const denseQuery = input.dense_query === undefined
    ? undefined
    : normalizeDenseEmbedding(input.dense_query, "dense_query");
  const operationId = normalizeOperationId(input.operation_id);
  const rawEvents = [...input.raw_events].sort((left, right) => left.seq - right.seq || compareText(left.id, right.id));
  const recovery = resolveRecovery(policy.recovery_failure_event_id, rawEvents);
  const candidateMultiplier = recovery
    ? policy.recovery_candidate_turn_multiplier
    : policy.candidate_turn_multiplier;
  const retrievalLimit = recovery ? policy.recovery_retrieval_limit : policy.retrieval_limit;
  const windows = selectOperationalWindows(rawEvents, recentTurns, recentTurns * candidateMultiplier);
  const retrieval = rankCandidates(windows.candidates, input.current_input, denseQuery, policy, retrievalLimit);
  const ledgerRecords = excludeCurrentOperation(input.ledger_records ?? [], operationId);
  const stateFingerprint = sha256(stableJson({
    revision: input.state_revision,
    items: input.context_items,
    relations: input.state_relations,
  }));
  const placement = placeDormantState({
    items: input.context_items,
    relations: input.state_relations,
    rawEvents,
    query: input.current_input,
    recentTurns,
    multiplier: policy.dormancy_turn_multiplier,
    operationId,
    ledgerRecords,
    sessionId: input.session_id,
    stateRevision: input.state_revision,
    stateFingerprint,
  });

  const assemblerInput: ContextAssemblerInput = {
    session_id: input.session_id,
    context_items: input.context_items,
    state_relations: input.state_relations,
    raw_events: rawEvents,
    current_input: input.current_input,
    ...(input.include_current_input === undefined
      ? {}
      : { include_current_input: input.include_current_input }),
    ...(input.token_budget === undefined ? {} : { token_budget: input.token_budget }),
    recent_raw_window_turns: recentTurns,
    operational: {
      retrieved_raw_event_ids: retrieval.selected.map((event) => event.id),
      dormant_state_ids: placement.requestedDormantIds,
      reactivated_state_ids: placement.reactivatedIds,
    },
  };
  const context = assembleContext(assemblerInput);
  const actualDormant = context.dormant_state_ids ?? [];
  const dormantSet = new Set(actualDormant);
  const dependencyRescued = placement.requestedDormantIds.filter((id) => !dormantSet.has(id));
  const retrievedTokens = estimateTokens(
    (context.retrieved_history ?? []).map((event) => event.content).join("\n")
  );
  const debug: OperationalContextDebug = {
    policy_version: OPERATIONAL_CONTEXT_POLICY_VERSION,
    mode: recovery ? "targeted_recovery" : "normal",
    dense_availability: retrieval.denseAvailability,
    candidate_turn_count: windows.candidateTurnCount,
    candidate_seq_start: windows.candidates[0]?.seq ?? null,
    candidate_seq_end: windows.candidates.at(-1)?.seq ?? null,
    candidate_event_ids: windows.candidates.map((event) => event.id),
    retrieval_limit: retrievalLimit,
    score_rows: retrieval.scores.map((score) => ({ ...score })),
    retrieved_event_ids: retrieval.selected.map((event) => event.id),
    retrieved_tokens: retrievedTokens,
    telemetry_baseline_seq: placement.baselineLedgerSeq,
    telemetry_baseline_raw_seq: placement.baselineRawSeq,
    telemetry_complete: placement.telemetryComplete,
    dormancy_enabled: placement.dormancyEnabled,
    dormant_state_ids: actualDormant,
    reactivated_state_ids: placement.reactivatedIds,
    dependency_rescued_state_ids: dependencyRescued,
  };
  context.operational_debug = debug;

  const hits: ContextCompileHitInput[] = [];
  for (const event of retrieval.selected) {
    hits.push({
      subject_kind: "RAW_EVENT",
      subject_id: event.id,
      reason: "RETRIEVED_HISTORY",
      raw_event_ids: [event.id],
    });
  }
  const retrievedIdSet = new Set(retrieval.selected.map((event) => event.id));
  const derivedRefsByItem = new Map<string, string[]>();
  for (const relation of input.state_relations) {
    if (relation.relation_type !== "DERIVED_FROM") continue;
    const refs = derivedRefsByItem.get(relation.source_id) ?? [];
    refs.push(relation.target_id);
    derivedRefsByItem.set(relation.source_id, refs);
  }
  for (const item of input.context_items.filter(isActiveRoot)) {
    const refs = uniqueSorted([...item.source_refs, ...(derivedRefsByItem.get(item.id) ?? [])]);
    if (refs.some((id) => retrievedIdSet.has(id))) {
      hits.push({ subject_kind: "STATE_ITEM", subject_id: item.id, reason: "RETRIEVED_HISTORY" });
    }
  }
  const reactivatedSet = new Set(placement.reactivatedIds);
  for (const id of placement.queryMatchedIds) {
    hits.push({
      subject_kind: "STATE_ITEM",
      subject_id: id,
      reason: reactivatedSet.has(id) ? "REACTIVATED" : "CURRENT_QUERY",
    });
  }
  for (const id of dependencyRescued) {
    hits.push({ subject_kind: "STATE_ITEM", subject_id: id, reason: "DEPENDENCY_RESCUE" });
  }

  const policyJson = resolvedPolicyJson(policy);
  const recentIds = context.recent_conversation.map((event) => event.id);
  const retrievedIds = (context.retrieved_history ?? []).map((event) => event.id);
  const rawBoundary = rawEvents.at(-1)?.seq ?? 0;
  const normalizedInputFingerprint = sha256(stableJson({
    current_input: input.current_input,
    include_current_input: input.include_current_input ?? true,
    recent_raw_window_turns: recentTurns,
    token_budget: input.token_budget ?? null,
    context_policy: policyJson,
    dense_query: denseQuery === undefined ? null : denseQuery,
  }));
  const rawFingerprint = sha256(stableJson(rawEvents));
  const resultFingerprint = sha256(stableJson({
    recent_event_ids: recentIds,
    retrieved_event_ids: retrievedIds,
    kept_state_ids: context.debug_manifest.kept_state_ids,
    dormant_state_ids: actualDormant,
    reactivated_state_ids: placement.reactivatedIds,
  }));
  const canonicalHits = canonicalizeTraceHits(hits);
  const tracePayload: JsonObject = {
    policy_version: OPERATIONAL_CONTEXT_POLICY_VERSION,
    operation_id: operationId ?? "",
    normalized_input_sha256: normalizedInputFingerprint,
    current_input_sha256: sha256(input.current_input),
    state_revision: input.state_revision,
    state_sha256: stateFingerprint,
    raw_boundary_max_seq: rawBoundary,
    raw_event_count: rawEvents.length,
    raw_sha256: rawFingerprint,
    result_sha256: resultFingerprint,
    policy: policyJson,
    mode: recovery ? "targeted_recovery" : "normal",
    dense_availability: retrieval.denseAvailability,
    recent_event_ids: recentIds,
    retrieved_event_ids: retrievedIds,
    selected_state_ids: [...context.debug_manifest.kept_state_ids],
    dormant_state_ids: actualDormant,
    reactivated_state_ids: placement.reactivatedIds,
    hit_count: canonicalHits.length,
    hits_sha256: sha256(stableJson(canonicalHits)),
  };
  return {
    context,
    policy,
    trace_payload: tracePayload,
    trace_raw_event_ids: uniqueSorted([...recentIds, ...retrievedIds]),
    hits,
  };
}

export function resolveContextPolicy(value: ContextPolicyInput | undefined): ResolvedContextPolicy {
  if (value === undefined) return { ...DEFAULT_POLICY };
  if (!isPlainObject(value)) throw new OperationalContextError("context_policy must be a plain object");
  const allowed = new Set([
    "candidate_turn_multiplier", "recovery_candidate_turn_multiplier",
    "dormancy_turn_multiplier", "retrieval_limit", "recovery_retrieval_limit",
    "bm25_weight", "dense_weight", "recovery_failure_event_id",
  ]);
  assertDataKeys(value, allowed, "context_policy");
  const policy: ResolvedContextPolicy = {
    candidate_turn_multiplier: integer(value.candidate_turn_multiplier, 1, 100, DEFAULT_POLICY.candidate_turn_multiplier, "candidate_turn_multiplier"),
    recovery_candidate_turn_multiplier: integer(value.recovery_candidate_turn_multiplier, 1, 100, DEFAULT_POLICY.recovery_candidate_turn_multiplier, "recovery_candidate_turn_multiplier"),
    dormancy_turn_multiplier: integer(value.dormancy_turn_multiplier, 1, 100, DEFAULT_POLICY.dormancy_turn_multiplier, "dormancy_turn_multiplier"),
    retrieval_limit: integer(value.retrieval_limit, 1, 100, DEFAULT_POLICY.retrieval_limit, "retrieval_limit"),
    recovery_retrieval_limit: integer(value.recovery_retrieval_limit, 1, 100, DEFAULT_POLICY.recovery_retrieval_limit, "recovery_retrieval_limit"),
    bm25_weight: weight(value.bm25_weight, DEFAULT_POLICY.bm25_weight, "bm25_weight"),
    dense_weight: weight(value.dense_weight, DEFAULT_POLICY.dense_weight, "dense_weight"),
    recovery_failure_event_id: optionalId(value.recovery_failure_event_id, "recovery_failure_event_id"),
  };
  if (policy.bm25_weight + policy.dense_weight <= 0) {
    throw new OperationalContextError("bm25_weight and dense_weight must have a positive sum");
  }
  return policy;
}

interface WindowSelection {
  candidates: RawEvent[];
  candidateTurnCount: number;
}

function selectOperationalWindows(
  events: RawEvent[],
  recentTurnCount: number,
  candidateTurnCount: number
): WindowSelection {
  const userIndexes = events
    .map((event, index) => ({ event, index }))
    .filter(({ event }) => event.role === "user")
    .map(({ index }) => index);
  if (userIndexes.length === 0) return { candidates: [], candidateTurnCount: 0 };
  const recentStartOrdinal = Math.max(0, userIndexes.length - recentTurnCount);
  const recentStart = userIndexes[recentStartOrdinal]!;
  const candidateStartOrdinal = Math.max(0, recentStartOrdinal - candidateTurnCount);
  const candidateStart = userIndexes[candidateStartOrdinal]!;
  return {
    candidates: events.slice(candidateStart, recentStart),
    candidateTurnCount: recentStartOrdinal - candidateStartOrdinal,
  };
}

interface RetrievalResult {
  selected: RawEvent[];
  scores: OperationalRetrievalScore[];
  denseAvailability: DenseAvailability;
}

function rankCandidates(
  candidates: RawEvent[],
  query: string,
  denseQuery: DenseEmbedding | undefined,
  policy: ResolvedContextPolicy,
  limit: number
): RetrievalResult {
  const queryTerms = tokenize(query);
  const documents = candidates.map((event) => tokenize(event.content));
  const bm25Raw = bm25Scores(documents, queryTerms);
  const maximumBm25 = Math.max(0, ...bm25Raw);
  const dense = denseScores(candidates, denseQuery);
  const weightSum = policy.bm25_weight + policy.dense_weight;
  const scores = candidates.map((event, index): OperationalRetrievalScore => {
    const normalizedBm25 = maximumBm25 === 0 ? 0 : bm25Raw[index]! / maximumBm25;
    const cosine = dense.scores?.[index] ?? null;
    const nonnegative = cosine === null ? null : Math.max(0, cosine);
    const combined = dense.availability === "hybrid"
      ? (policy.bm25_weight * normalizedBm25 + policy.dense_weight * nonnegative!) / weightSum
      : normalizedBm25;
    return {
      event_id: event.id,
      seq: event.seq,
      bm25_raw: finiteScore(bm25Raw[index]!),
      bm25_normalized: finiteScore(normalizedBm25),
      dense_cosine: cosine === null ? null : finiteScore(cosine),
      dense_nonnegative: nonnegative === null ? null : finiteScore(nonnegative),
      combined_score: finiteScore(combined),
      selected: false,
    };
  });
  const ordered = [...scores].sort((left, right) =>
    right.combined_score - left.combined_score ||
    right.bm25_normalized - left.bm25_normalized ||
    (right.dense_nonnegative ?? -1) - (left.dense_nonnegative ?? -1) ||
    right.seq - left.seq ||
    compareText(left.event_id, right.event_id)
  );
  const selectedIds = new Set(ordered
    .filter((score) => score.combined_score > 0)
    .slice(0, limit)
    .map((score) => score.event_id));
  for (const score of scores) score.selected = selectedIds.has(score.event_id);
  const selected = ordered
    .filter((score) => selectedIds.has(score.event_id))
    .map((score) => candidates.find((event) => event.id === score.event_id)!);
  return { selected, scores, denseAvailability: dense.availability };
}

function bm25Scores(documents: string[][], queryTerms: string[]): number[] {
  if (documents.length === 0 || queryTerms.length === 0) return documents.map(() => 0);
  const averageLength = documents.reduce((sum, document) => sum + document.length, 0) / documents.length || 1;
  const uniqueQueryTerms = [...new Set(queryTerms)];
  const documentFrequency = new Map(uniqueQueryTerms.map((term) => [
    term,
    documents.filter((document) => document.includes(term)).length,
  ]));
  const k1 = 1.2;
  const b = 0.75;
  return documents.map((document) => {
    const frequencies = new Map<string, number>();
    for (const term of document) frequencies.set(term, (frequencies.get(term) ?? 0) + 1);
    let score = 0;
    for (const term of queryTerms) {
      const frequency = frequencies.get(term) ?? 0;
      if (frequency === 0) continue;
      const df = documentFrequency.get(term) ?? 0;
      const idf = Math.log(1 + (documents.length - df + 0.5) / (df + 0.5));
      const denominator = frequency + k1 * (1 - b + b * document.length / averageLength);
      score += idf * frequency * (k1 + 1) / denominator;
    }
    return finiteScore(score);
  });
}

function denseScores(
  candidates: RawEvent[],
  query: DenseEmbedding | undefined
): { availability: DenseAvailability; scores?: number[] } {
  if (query === undefined) return { availability: "dense_unavailable_query_missing" };
  if (candidates.length === 0) return { availability: "dense_unavailable_no_candidates" };
  if (candidates.some((event) => event.dense_embedding === undefined)) {
    return { availability: "dense_unavailable_partial_coverage" };
  }
  const embeddings = candidates.map((event) => event.dense_embedding!);
  if (embeddings.some((embedding) => embedding.vector_space_id !== query.vector_space_id)) {
    return { availability: "dense_unavailable_space_mismatch" };
  }
  if (embeddings.some((embedding) => embedding.values.length !== query.values.length)) {
    return { availability: "dense_unavailable_dimension_mismatch" };
  }
  const queryVector = scaleVector(query.values);
  if (queryVector.maxAbs === 0) return { availability: "dense_unavailable_query_zero_norm" };
  const candidateVectors = embeddings.map((embedding) => scaleVector(embedding.values));
  if (candidateVectors.some((vector) => vector.maxAbs === 0)) {
    return { availability: "dense_unavailable_candidate_zero_norm" };
  }
  if (!queryVector.valid || candidateVectors.some((vector) => !vector.valid)) {
    return { availability: "dense_unavailable_numeric" };
  }
  const scores = candidateVectors.map((candidate) => stableCosine(queryVector, candidate));
  if (scores.some((score) => !Number.isFinite(score))) {
    return { availability: "dense_unavailable_numeric" };
  }
  return {
    availability: "hybrid",
    scores,
  };
}

interface PlacementResult {
  requestedDormantIds: string[];
  reactivatedIds: string[];
  queryMatchedIds: string[];
  baselineLedgerSeq: number | null;
  baselineRawSeq: number | null;
  telemetryComplete: boolean;
  dormancyEnabled: boolean;
}

function placeDormantState(input: {
  items: ContextItem[];
  relations: StateRelation[];
  rawEvents: RawEvent[];
  query: string;
  recentTurns: number;
  multiplier: number;
  operationId: string | undefined;
  ledgerRecords: ExperienceLedgerRecord[];
  sessionId: string;
  stateRevision: number;
  stateFingerprint: string;
}): PlacementResult {
  const telemetry = parseTelemetry(
    input.ledgerRecords,
    input.sessionId,
    input.stateRevision,
    input.stateFingerprint
  );
  const dormancyEnabled = input.operationId !== undefined && telemetry.complete && telemetry.baseline !== undefined;
  const queryTokens = new Set(tokenize(input.query));
  const queryMatchedIds = input.items
    .filter(isActiveRoot)
    .filter((item) => tokenize(item.content).some((token) => queryTokens.has(token)))
    .map((item) => item.id)
    .sort(compareText);
  if (!dormancyEnabled) {
    return {
      requestedDormantIds: [],
      reactivatedIds: [],
      queryMatchedIds,
      baselineLedgerSeq: telemetry.baseline?.seq ?? null,
      baselineRawSeq: telemetry.baseline?.rawSeq ?? null,
      telemetryComplete: telemetry.complete,
      dormancyEnabled: false,
    };
  }

  const turnByRawId = userTurnOrdinals(input.rawEvents);
  const totalTurns = Math.max(0, ...turnByRawId.values());
  const relationRefs = new Map<string, string[]>();
  const creationRefs = new Map<string, string[]>();
  const itemById = new Map(input.items.map((item) => [item.id, item]));
  for (const relation of input.relations) {
    if (relation.relation_type !== "DERIVED_FROM") continue;
    const refs = relationRefs.get(relation.source_id) ?? [];
    refs.push(relation.target_id);
    relationRefs.set(relation.source_id, refs);
    const source = itemById.get(relation.source_id);
    if (source !== undefined && relation.created_at === source.created_at) {
      const initialRefs = creationRefs.get(relation.source_id) ?? [];
      initialRefs.push(relation.target_id);
      creationRefs.set(relation.source_id, initialRefs);
    }
  }
  const rawById = new Map(input.rawEvents.map((event) => [event.id, event]));
  const matched = new Set(queryMatchedIds);
  const threshold = input.recentTurns * input.multiplier;
  const originRawSeq = telemetry.origin!.rawSeq;
  const baselineTurn = Math.max(
    0,
    ...input.rawEvents
      .filter((event) => event.seq <= telemetry.baseline!.rawSeq)
      .map((event) => turnByRawId.get(event.id) ?? 0)
  );
  const requestedDormantIds: string[] = [];
  const reactivatedIds: string[] = [];
  for (const item of input.items.filter(isActiveRoot)) {
    if (item.type === "CONSTRAINT") continue;
    // StateStore writes creation provenance relations in the same transaction
    // with the item's exact created_at. Later DERIVED_FROM updates must not be
    // allowed to manufacture post-origin creation evidence.
    const creationRefIds = uniqueSorted(creationRefs.get(item.id) ?? [])
      .filter((id) => item.source_refs.includes(id));
    const creationEvents = creationRefIds
      .map((id) => rawById.get(id))
      .filter((event): event is RawEvent => event !== undefined);
    const observedSinceTelemetryOrigin = !telemetry.origin!.selectedStateIds.has(item.id) &&
      creationRefIds.length > 0 &&
      creationEvents.length === creationRefIds.length &&
      Math.min(...creationEvents.map((event) => event.seq)) > originRawSeq;
    const provenanceIds = uniqueSorted([...(item.source_refs ?? []), ...(relationRefs.get(item.id) ?? [])]);
    const provenanceEvents = provenanceIds.map((id) => rawById.get(id)).filter((event): event is RawEvent => event !== undefined);
    const lastProvenanceSeq = Math.max(0, ...provenanceEvents.map((event) => event.seq));
    const lastTurn = Math.max(0, ...provenanceIds.map((id) => turnByRawId.get(id) ?? 0));
    const observedInSnapshot = lastProvenanceSeq > 0 &&
      lastProvenanceSeq <= telemetry.baseline!.rawSeq;
    const recencyTurn = Math.max(lastTurn, baselineTurn);
    const oldEnough = recencyTurn > 0 && totalTurns - recencyTurn >= threshold;
    const neverHit = !telemetry.hitStateIds.has(item.id);
    if (!observedSinceTelemetryOrigin || !observedInSnapshot || !oldEnough || !neverHit) continue;
    if (matched.has(item.id)) reactivatedIds.push(item.id);
    else requestedDormantIds.push(item.id);
  }
  requestedDormantIds.sort(compareText);
  reactivatedIds.sort(compareText);
  return {
    requestedDormantIds,
    reactivatedIds,
    queryMatchedIds,
    baselineLedgerSeq: telemetry.baseline!.seq,
    baselineRawSeq: telemetry.baseline!.rawSeq,
    telemetryComplete: true,
    dormancyEnabled: true,
  };
}

function parseTelemetry(
  records: ExperienceLedgerRecord[],
  expectedSessionId: string,
  stateRevision: number,
  stateFingerprint: string
): {
  complete: boolean;
  origin?: { seq: number; rawSeq: number; selectedStateIds: Set<string> };
  baseline?: { seq: number; rawSeq: number };
  hitStateIds: Set<string>;
} {
  const inspected = inspectTelemetry(records, expectedSessionId);
  if (!inspected.complete) return { complete: false, hitStateIds: new Set() };
  if (inspected.compiles.length === 0) return { complete: true, hitStateIds: new Set() };
  const originRecord = inspected.compiles[0]!;
  const origin = {
    seq: originRecord.seq,
    rawSeq: originRecord.payload.raw_boundary_max_seq as number,
    selectedStateIds: new Set(originRecord.payload.selected_state_ids as string[]),
  };
  // State mutation is authoritative even when the v1 compatibility path has no
  // current-event provenance. A new snapshot must first be observed by a
  // trusted compile; later compiles keep the first observation as its age base.
  const latest = inspected.compiles.at(-1)!;
  if (latest.payload.state_revision !== stateRevision ||
      latest.payload.state_sha256 !== stateFingerprint) {
    return { complete: true, origin, hitStateIds: new Set() };
  }
  let baselineIndex = inspected.compiles.length - 1;
  while (baselineIndex > 0) {
    const previous = inspected.compiles[baselineIndex - 1]!;
    if (previous.payload.state_revision !== stateRevision ||
        previous.payload.state_sha256 !== stateFingerprint) break;
    baselineIndex -= 1;
  }
  const baselineRecord = inspected.compiles[baselineIndex]!;
  const hitStateIds = new Set<string>();
  for (const hit of inspected.hits) {
    if (hit.payload.subject_kind === "STATE_ITEM") {
      hitStateIds.add(hit.payload.subject_id as string);
    }
  }
  return {
    complete: true,
    origin,
    baseline: { seq: baselineRecord.seq, rawSeq: baselineRecord.payload.raw_boundary_max_seq as number },
    hitStateIds,
  };
}

/** True only when at least one complete, internally-shaped compile batch is replayable. */
export function hasTrustedContextCompileBaseline(
  records: ExperienceLedgerRecord[],
  sessionId: string
): boolean {
  return inspectTelemetry(records, sessionId).trustedCompileCount > 0;
}

interface TelemetryInspection {
  complete: boolean;
  compiles: ExperienceLedgerRecord[];
  hits: ExperienceLedgerRecord[];
  trustedCompileCount: number;
}

const TRACE_PAYLOAD_KEYS = [
  "policy_version", "operation_id", "normalized_input_sha256", "current_input_sha256",
  "state_revision", "state_sha256", "raw_boundary_max_seq", "raw_event_count",
  "raw_sha256", "result_sha256", "policy", "mode", "dense_availability",
  "recent_event_ids", "retrieved_event_ids", "selected_state_ids", "dormant_state_ids",
  "reactivated_state_ids", "hit_count", "hits_sha256",
] as const;
const TRACE_POLICY_KEYS = [
  "candidate_turn_multiplier", "recovery_candidate_turn_multiplier", "dormancy_turn_multiplier",
  "retrieval_limit", "recovery_retrieval_limit", "bm25_weight", "dense_weight",
  "recovery_failure_event_id",
] as const;
const TRACE_HIT_PAYLOAD_KEYS = ["operation_id", "subject_kind", "subject_id", "reason"] as const;
const DENSE_AVAILABILITIES: readonly DenseAvailability[] = [
  "hybrid", "dense_unavailable_query_missing", "dense_unavailable_no_candidates",
  "dense_unavailable_partial_coverage", "dense_unavailable_space_mismatch",
  "dense_unavailable_dimension_mismatch", "dense_unavailable_query_zero_norm",
  "dense_unavailable_candidate_zero_norm", "dense_unavailable_numeric",
];

function inspectTelemetry(
  records: ExperienceLedgerRecord[],
  expectedSessionId?: string
): TelemetryInspection {
  const compiles = records
    .filter((record) => record.kind === "CONTEXT_COMPILE")
    .sort((left, right) => left.seq - right.seq);
  const hits = records
    .filter((record) => record.kind === "RETRIEVAL_HIT")
    .sort((left, right) => left.seq - right.seq);
  const structurallyValidCompiles = compiles.filter((record) =>
    isExactCompileTrace(record, expectedSessionId)
  );
  const validById = new Map(structurallyValidCompiles.map((record) => [record.id, record]));
  const structurallyValidHits = hits.filter((record) => isExactRetrievalHit(record, validById));
  const hitsByParent = new Map<string, ExperienceLedgerRecord[]>();
  for (const hit of structurallyValidHits) {
    const parentId = hit.parent_ledger_ids[0]!;
    const group = hitsByParent.get(parentId) ?? [];
    group.push(hit);
    hitsByParent.set(parentId, group);
  }

  let trustedCompileCount = 0;
  for (const compile of structurallyValidCompiles) {
    const persistedHits = hitsByParent.get(compile.id) ?? [];
    const canonicalHits = canonicalizePersistedTraceHits(persistedHits);
    if (
      compile.payload.hit_count === canonicalHits.length &&
      compile.payload.hits_sha256 === sha256(stableJson(canonicalHits)) &&
      hasExpectedTraceHitCoverage(compile, persistedHits, canonicalHits)
    ) {
      trustedCompileCount += 1;
    }
  }
  const complete = structurallyValidCompiles.length === compiles.length &&
    structurallyValidHits.length === hits.length &&
    trustedCompileCount === compiles.length;
  return {
    complete,
    compiles: complete ? structurallyValidCompiles : [],
    hits: complete ? structurallyValidHits : [],
    trustedCompileCount,
  };
}

function hasExpectedTraceHitCoverage(
  compile: ExperienceLedgerRecord,
  hits: ExperienceLedgerRecord[],
  canonicalHits: JsonValue[]
): boolean {
  if (new Set(canonicalHits.map(stableJson)).size !== canonicalHits.length) return false;
  const rawHitIds = hits
    .filter((hit) => hit.payload.subject_kind === "RAW_EVENT" &&
      hit.payload.reason === "RETRIEVED_HISTORY")
    .map((hit) => hit.payload.subject_id as string)
    .sort(compareText);
  const reactivatedIds = hits
    .filter((hit) => hit.payload.subject_kind === "STATE_ITEM" &&
      hit.payload.reason === "REACTIVATED")
    .map((hit) => hit.payload.subject_id as string)
    .sort(compareText);
  return stableJson(rawHitIds) === stableJson(uniqueSorted(
    compile.payload.retrieved_event_ids as string[]
  )) && stableJson(reactivatedIds) === stableJson(uniqueSorted(
    compile.payload.reactivated_state_ids as string[]
  ));
}

function isExactCompileTrace(
  record: ExperienceLedgerRecord,
  expectedSessionId?: string
): boolean {
  const payload = record.payload;
  if ((expectedSessionId !== undefined && record.session_id !== expectedSessionId) ||
      !isValidTelemetryRecordBase(record) ||
      !hasExactDataKeys(payload, TRACE_PAYLOAD_KEYS) ||
      record.parent_ledger_ids.length !== 0 ||
      typeof payload.operation_id !== "string" || payload.operation_id.trim().length === 0 ||
      payload.operation_id.length > 500 ||
      record.source_key !== `context-compile/${encodeURIComponent(payload.operation_id)}` ||
      payload.policy_version !== OPERATIONAL_CONTEXT_POLICY_VERSION ||
      !isSha256(payload.normalized_input_sha256) || !isSha256(payload.current_input_sha256) ||
      !isSha256(payload.state_sha256) || !isSha256(payload.raw_sha256) ||
      !isSha256(payload.result_sha256) || !isSha256(payload.hits_sha256) ||
      !isNonNegativeSafeInteger(payload.state_revision) ||
      !isNonNegativeSafeInteger(payload.raw_boundary_max_seq) ||
      !isNonNegativeSafeInteger(payload.raw_event_count) ||
      !isNonNegativeSafeInteger(payload.hit_count) ||
      (payload.mode !== "normal" && payload.mode !== "targeted_recovery") ||
      typeof payload.dense_availability !== "string" ||
      !DENSE_AVAILABILITIES.includes(payload.dense_availability as DenseAvailability) ||
      !isExactTracePolicy(payload.policy)) {
    return false;
  }
  const idLists = [
    payload.recent_event_ids, payload.retrieved_event_ids, payload.selected_state_ids,
    payload.dormant_state_ids, payload.reactivated_state_ids,
  ];
  if (!idLists.every(isStrictUniqueStringArray)) return false;
  const recent = payload.recent_event_ids as string[];
  const retrieved = payload.retrieved_event_ids as string[];
  if (recent.some((id) => retrieved.includes(id))) return false;
  return stableJson(record.raw_event_ids) === stableJson(uniqueSorted([...recent, ...retrieved]));
}

function isExactTracePolicy(value: unknown): boolean {
  if (!hasExactDataKeys(value, TRACE_POLICY_KEYS)) return false;
  const policy = value as Record<string, unknown>;
  for (const key of [
    "candidate_turn_multiplier", "recovery_candidate_turn_multiplier", "dormancy_turn_multiplier",
    "retrieval_limit", "recovery_retrieval_limit",
  ]) {
    if (!Number.isSafeInteger(policy[key]) || (policy[key] as number) < 1 || (policy[key] as number) > 100) {
      return false;
    }
  }
  for (const key of ["bm25_weight", "dense_weight"]) {
    const valueAtKey = policy[key];
    if (typeof valueAtKey !== "number" || !Number.isFinite(valueAtKey) || valueAtKey < 0 || valueAtKey > 1) {
      return false;
    }
  }
  if ((policy.bm25_weight as number) + (policy.dense_weight as number) <= 0) return false;
  const recovery = policy.recovery_failure_event_id;
  return recovery === null || (typeof recovery === "string" && recovery.trim().length > 0 && recovery.length <= 500);
}

function isExactRetrievalHit(
  record: ExperienceLedgerRecord,
  compiles: Map<string, ExperienceLedgerRecord>
): boolean {
  if (!hasExactDataKeys(record.payload, TRACE_HIT_PAYLOAD_KEYS) ||
      record.parent_ledger_ids.length !== 1) return false;
  const compile = compiles.get(record.parent_ledger_ids[0]!);
  if (!compile || !isValidTelemetryRecordBase(record) ||
      record.session_id !== compile.session_id || record.seq <= compile.seq) return false;
  const operationId = record.payload.operation_id;
  const subjectKind = record.payload.subject_kind;
  const subjectId = record.payload.subject_id;
  const reason = record.payload.reason;
  if (operationId !== compile.payload.operation_id ||
      (subjectKind !== "RAW_EVENT" && subjectKind !== "STATE_ITEM") ||
      typeof subjectId !== "string" || subjectId.length === 0 ||
      (reason !== "RETRIEVED_HISTORY" && reason !== "CURRENT_QUERY" &&
       reason !== "REACTIVATED" && reason !== "DEPENDENCY_RESCUE")) return false;
  if (subjectKind === "RAW_EVENT" && reason !== "RETRIEVED_HISTORY") return false;
  const expectedSource = `retrieval-hit/${encodeURIComponent(operationId as string)}/${subjectKind}/${encodeURIComponent(subjectId)}/${reason}`;
  if (record.source_key !== expectedSource) return false;
  const expectedRawIds = subjectKind === "RAW_EVENT" ? [subjectId] : [];
  return stableJson(record.raw_event_ids) === stableJson(expectedRawIds);
}

function canonicalizeTraceHits(hits: ContextCompileHitInput[]): JsonValue[] {
  return hits.map((hit) => ({
    subject_kind: hit.subject_kind,
    subject_id: hit.subject_id,
    reason: hit.reason,
    raw_event_ids: uniqueSorted(hit.raw_event_ids ?? []),
  })).sort((left, right) => compareText(stableJson(left), stableJson(right)));
}

function canonicalizePersistedTraceHits(hits: ExperienceLedgerRecord[]): JsonValue[] {
  return hits.map((hit) => ({
    subject_kind: hit.payload.subject_kind as string,
    subject_id: hit.payload.subject_id as string,
    reason: hit.payload.reason as string,
    raw_event_ids: [...hit.raw_event_ids],
  })).sort((left, right) => compareText(stableJson(left), stableJson(right)));
}

function hasExactDataKeys(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  if (!isPlainObject(value)) return false;
  const ownKeys = Reflect.ownKeys(value);
  if (ownKeys.length !== keys.length) return false;
  const expected = new Set(keys);
  for (const key of ownKeys) {
    if (typeof key !== "string" || !expected.has(key)) return false;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor?.enumerable || !("value" in descriptor)) return false;
  }
  return keys.every((key) => Object.prototype.hasOwnProperty.call(value, key));
}

function isStrictUniqueStringArray(value: unknown): value is string[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) return false;
  const seen = new Set<string>();
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor?.enumerable || !("value" in descriptor) ||
        typeof descriptor.value !== "string" || descriptor.value.length === 0 ||
        seen.has(descriptor.value)) return false;
    seen.add(descriptor.value);
  }
  for (const key of Reflect.ownKeys(value)) {
    if (key === "length") continue;
    if (typeof key !== "string" || !/^(0|[1-9]\d*)$/.test(key) || Number(key) >= value.length) {
      return false;
    }
  }
  return true;
}

function isSha256(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}

function isNonNegativeSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function isValidTelemetryRecordBase(record: ExperienceLedgerRecord): boolean {
  return typeof record.id === "string" && record.id.length > 0 &&
    typeof record.session_id === "string" && record.session_id.length > 0 &&
    Number.isSafeInteger(record.seq) && record.seq > 0 &&
    typeof record.occurred_at === "string" && record.occurred_at.length > 0 &&
    typeof record.source_key === "string" && record.source_key.length > 0 &&
    isStrictUniqueStringArray(record.raw_event_ids) &&
    isStrictUniqueStringArray(record.parent_ledger_ids);
}

function excludeCurrentOperation(
  records: ExperienceLedgerRecord[],
  operationId: string | undefined
): ExperienceLedgerRecord[] {
  if (operationId === undefined) return records;
  const encoded = encodeURIComponent(operationId);
  const traceKey = `context-compile/${encoded}`;
  const hitPrefix = `retrieval-hit/${encoded}/`;
  const existingTrace = records.find((record) => record.source_key === traceKey);
  const cutoff = existingTrace?.seq ?? Number.POSITIVE_INFINITY;
  return records.filter((record) =>
    record.seq < cutoff && record.source_key !== traceKey && !record.source_key.startsWith(hitPrefix)
  );
}

function resolveRecovery(reference: string | null, events: RawEvent[]): boolean {
  if (reference === null) return false;
  const event = events.find((candidate) => candidate.id === reference);
  if (!event || event.event_type !== "verified_failure") {
    throw new OperationalContextError("recovery_failure_event_id must reference an existing same-session verified_failure event");
  }
  return true;
}

function userTurnOrdinals(events: RawEvent[]): Map<string, number> {
  const result = new Map<string, number>();
  let turn = 0;
  for (const event of events) {
    if (event.role === "user") turn += 1;
    if (turn > 0) result.set(event.id, turn);
  }
  return result;
}

function isActiveRoot(item: ContextItem): boolean {
  return (item.type === "GOAL" || item.type === "CONSTRAINT" || item.type === "DECISION")
    ? item.status === "ACTIVE"
    : item.type === "OPEN_QUESTION" && item.status === "OPEN";
}

function tokenize(value: string): string[] {
  return value.normalize("NFKC").toLocaleLowerCase("und").match(/[\p{L}\p{N}_]+/gu) ?? [];
}

interface ScaledVector {
  maxAbs: number;
  values: number[];
  norm: number;
  valid: boolean;
}

function scaleVector(values: number[]): ScaledVector {
  const maxAbs = values.reduce((maximum, value) => Math.max(maximum, Math.abs(value)), 0);
  if (maxAbs === 0) return { maxAbs, values: values.map(() => 0), norm: 0, valid: true };
  const scaled = values.map((value) => value / maxAbs);
  const squaredNorm = scaled.reduce((sum, value) => sum + value * value, 0);
  const norm = Math.sqrt(squaredNorm);
  return {
    maxAbs,
    values: scaled,
    norm,
    valid: Number.isFinite(norm) && norm > 0 && scaled.every(Number.isFinite),
  };
}

function stableCosine(left: ScaledVector, right: ScaledVector): number {
  const product = left.values.reduce(
    (sum, value, index) => sum + value * right.values[index]!,
    0
  );
  const cosine = product / (left.norm * right.norm);
  return Math.max(-1, Math.min(1, cosine));
}

function resolvedPolicyJson(policy: ResolvedContextPolicy): JsonObject {
  return {
    candidate_turn_multiplier: policy.candidate_turn_multiplier,
    recovery_candidate_turn_multiplier: policy.recovery_candidate_turn_multiplier,
    dormancy_turn_multiplier: policy.dormancy_turn_multiplier,
    retrieval_limit: policy.retrieval_limit,
    recovery_retrieval_limit: policy.recovery_retrieval_limit,
    bm25_weight: policy.bm25_weight,
    dense_weight: policy.dense_weight,
    recovery_failure_event_id: policy.recovery_failure_event_id,
  };
}

function stableJson(value: unknown): string {
  return JSON.stringify(sortJson(value));
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJson);
  if (!isPlainObject(value)) return value;
  const result = Object.create(null) as Record<string, unknown>;
  for (const key of Object.keys(value).sort(compareText)) {
    Object.defineProperty(result, key, {
      value: sortJson(value[key]),
      enumerable: true,
      configurable: true,
      writable: true,
    });
  }
  return result;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort(compareText);
}

function finiteScore(value: number): number {
  return Number.isFinite(value) && !Object.is(value, -0) ? value : 0;
}

function normalizeOperationId(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value.trim().length === 0 || value.length > 500) {
    throw new OperationalContextError("operation_id must be a non-blank string of at most 500 characters");
  }
  return value;
}

function integer(value: unknown, minimum: number, maximum: number, fallback: number, field: string): number {
  if (value === undefined) return fallback;
  if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum) {
    throw new OperationalContextError(`${field} must be an integer from ${minimum} to ${maximum}`);
  }
  return value as number;
}

function weight(value: unknown, fallback: number, field: string): number {
  if (value === undefined) return fallback;
  if (typeof value !== "number" || !Number.isFinite(value) || Object.is(value, -0) || value < 0 || value > 1) {
    throw new OperationalContextError(`${field} must be a finite number from 0 to 1`);
  }
  return value;
}

function optionalId(value: unknown, field: string): string | null {
  if (value === undefined) return null;
  if (typeof value !== "string" || value.trim().length === 0 || value.length > 500) {
    throw new OperationalContextError(`${field} must be a non-blank string of at most 500 characters`);
  }
  return value;
}

function assertDataKeys(value: Record<string, unknown>, allowed: Set<string>, path: string): void {
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string" || !allowed.has(key)) throw new OperationalContextError(`${path} has an unknown field`);
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor?.enumerable || !("value" in descriptor)) {
      throw new OperationalContextError(`${path} must contain data fields only`);
    }
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
