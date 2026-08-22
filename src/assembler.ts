import { estimateTokens, type JsonObject, type RawEvent } from "./raw-store.js";
import type {
  ContextItem,
  ContextItemStatus,
  ContextItemType,
  RelationType,
  StateRelation,
} from "./state-types.js";

const ITEM_TYPES: readonly ContextItemType[] = [
  "GOAL",
  "CONSTRAINT",
  "DECISION",
  "OPEN_QUESTION",
  "REJECTED_ALTERNATIVE",
];
const RELATION_TYPES: readonly RelationType[] = [
  "SUPERSEDES",
  "DEPENDS_ON",
  "RESOLVED_BY",
  "REJECTS",
  "DERIVED_FROM",
];
const ROLES: readonly RawEvent["role"][] = ["system", "user", "assistant", "tool"];

export interface ContextAssemblerInput {
  session_id: string;
  context_items: ContextItem[];
  state_relations: StateRelation[];
  raw_events: RawEvent[];
  current_input: string;
  token_budget?: number;
  recent_raw_window_turns?: number;
}

export interface CompactHistoricalNote {
  id: string;
  type: "DECISION" | "REJECTED_ALTERNATIVE";
  status: "SUPERSEDED" | "REJECTED";
  content: string;
  reason?: string;
  reopen_if?: string;
  provenance_handles: string[];
}

export interface ClosureEdge {
  source_id: string;
  target_id: string;
}

export interface DependencyPath {
  item_id: string;
  path: string[];
}

export interface ContextDebugManifest {
  kept_state_ids: string[];
  suppressed_state_ids: string[];
  kept_raw_event_ids: string[];
  dependency_edges: ClosureEdge[];
  dependency_paths: DependencyPath[];
  recent_seq_range: { start: number; end: number } | null;
  token_budget: number | null;
  token_budget_used: number;
  budget_exceeded: boolean;
  budget_overage: number;
  token_estimator: "character_count_divided_by_four";
}

export interface ContextMetrics {
  d0_full_tokens: number;
  d1_recent_tokens: number;
  d2_compiled_tokens: number;
  d1_reduction_ratio: number;
  d2_reduction_ratio: number;
  token_estimator: "character_count_divided_by_four";
}

export interface CompiledContext {
  session_id: string;
  current_input: string;
  active_goals: ContextItem[];
  active_constraints: ContextItem[];
  active_decisions: ContextItem[];
  open_questions: ContextItem[];
  dependency_items: ContextItem[];
  compact_historical_notes: CompactHistoricalNote[];
  recent_conversation: RawEvent[];
  rendered_context: string;
  budget_exceeded: boolean;
  budget_overage: number;
  debug_manifest: ContextDebugManifest;
  metrics: ContextMetrics;
}

export class ContextAssemblerValidationError extends Error {
  readonly code = "INVALID_ASSEMBLER_INPUT";

  constructor(message: string) {
    super(message);
    this.name = "ContextAssemblerValidationError";
  }
}

interface ValidatedInput {
  sessionId: string;
  items: ContextItem[];
  relations: StateRelation[];
  rawEvents: RawEvent[];
  currentInput: string;
  tokenBudget: number | undefined;
  recentTurns: number;
}

export function assembleContext(input: ContextAssemblerInput): CompiledContext {
  const validated = validateInput(input);
  const itemsById = new Map(validated.items.map((item) => [item.id, item]));
  const activeGoals = selectItems(validated.items, "GOAL", "ACTIVE");
  const activeConstraints = selectItems(validated.items, "CONSTRAINT", "ACTIVE");
  const activeDecisions = selectItems(validated.items, "DECISION", "ACTIVE");
  const openQuestions = selectItems(validated.items, "OPEN_QUESTION", "OPEN");
  const roots = [...activeGoals, ...activeConstraints, ...activeDecisions, ...openQuestions];
  const closure = dependencyClosure(roots, validated.relations, itemsById);
  const rootIds = new Set(roots.map((item) => item.id));
  const dependencyItems = [...closure.ids]
    .filter((id) => !rootIds.has(id))
    .map((id) => itemsById.get(id)!)
    .sort(compareItems);
  const recentConversation = selectRecentTurns(validated.rawEvents, validated.recentTurns);

  const mandatory: RenderableContext = {
    activeGoals,
    activeConstraints,
    activeDecisions,
    openQuestions,
    dependencyItems,
    historicalNotes: [],
    recentConversation,
    currentInput: validated.currentInput,
  };
  const optionalCandidates = validated.items
    .filter(
      (item): item is ContextItem & {
        type: "DECISION" | "REJECTED_ALTERNATIVE";
        status: "SUPERSEDED" | "REJECTED";
      } =>
        !closure.ids.has(item.id) &&
        ((item.type === "DECISION" && item.status === "SUPERSEDED") ||
          (item.type === "REJECTED_ALTERNATIVE" && item.status === "REJECTED"))
    )
    .sort(compareOptionalItems);

  let historicalNotes: CompactHistoricalNote[] = [];
  let rendered = renderSections(mandatory);
  for (const item of optionalCandidates) {
    const note = toHistoricalNote(item);
    const candidateNotes = [...historicalNotes, note];
    const candidateRendered = renderSections({ ...mandatory, historicalNotes: candidateNotes });
    if (
      validated.tokenBudget === undefined ||
      estimateTokens(candidateRendered) <= validated.tokenBudget
    ) {
      historicalNotes = candidateNotes;
      rendered = candidateRendered;
    }
  }

  const keptStateIds = [
    ...activeGoals,
    ...activeConstraints,
    ...activeDecisions,
    ...openQuestions,
    ...dependencyItems,
  ]
    .map((item) => item.id)
    .concat(historicalNotes.map((note) => note.id));
  const keptSet = new Set(keptStateIds);
  const suppressedStateIds = validated.items
    .map((item) => item.id)
    .filter((id) => !keptSet.has(id))
    .sort(compareText);
  const d2Tokens = estimateTokens(rendered);
  const budgetOverage =
    validated.tokenBudget === undefined ? 0 : Math.max(0, d2Tokens - validated.tokenBudget);
  const d0Tokens = estimateTokens(renderTranscript(validated.rawEvents, validated.currentInput));
  const d1Tokens = estimateTokens(renderTranscript(recentConversation, validated.currentInput));

  return {
    session_id: validated.sessionId,
    current_input: validated.currentInput,
    active_goals: cloneItems(activeGoals),
    active_constraints: cloneItems(activeConstraints),
    active_decisions: cloneItems(activeDecisions),
    open_questions: cloneItems(openQuestions),
    dependency_items: cloneItems(dependencyItems),
    compact_historical_notes: historicalNotes.map(cloneNote),
    recent_conversation: recentConversation.map(cloneRawEvent),
    rendered_context: rendered,
    budget_exceeded: budgetOverage > 0,
    budget_overage: budgetOverage,
    debug_manifest: {
      kept_state_ids: [...keptStateIds],
      suppressed_state_ids: suppressedStateIds,
      kept_raw_event_ids: recentConversation.map((event) => event.id),
      dependency_edges: closure.edges.map((edge) => ({ ...edge })),
      dependency_paths: closure.paths.map((path) => ({
        item_id: path.item_id,
        path: [...path.path],
      })),
      recent_seq_range:
        recentConversation.length === 0
          ? null
          : {
              start: recentConversation[0]!.seq,
              end: recentConversation[recentConversation.length - 1]!.seq,
            },
      token_budget: validated.tokenBudget ?? null,
      token_budget_used: d2Tokens,
      budget_exceeded: budgetOverage > 0,
      budget_overage: budgetOverage,
      token_estimator: "character_count_divided_by_four",
    },
    metrics: {
      d0_full_tokens: d0Tokens,
      d1_recent_tokens: d1Tokens,
      d2_compiled_tokens: d2Tokens,
      d1_reduction_ratio: reductionRatio(d0Tokens, d1Tokens),
      d2_reduction_ratio: reductionRatio(d0Tokens, d2Tokens),
      token_estimator: "character_count_divided_by_four",
    },
  };
}

interface RenderableContext {
  activeGoals: ContextItem[];
  activeConstraints: ContextItem[];
  activeDecisions: ContextItem[];
  openQuestions: ContextItem[];
  dependencyItems: ContextItem[];
  historicalNotes: CompactHistoricalNote[];
  recentConversation: RawEvent[];
  currentInput: string;
}

export function renderCompiledContext(context: CompiledContext): string {
  return renderSections({
    activeGoals: context.active_goals,
    activeConstraints: context.active_constraints,
    activeDecisions: context.active_decisions,
    openQuestions: context.open_questions,
    dependencyItems: context.dependency_items,
    historicalNotes: context.compact_historical_notes,
    recentConversation: context.recent_conversation,
    currentInput: context.current_input,
  });
}

function renderSections(context: RenderableContext): string {
  return [
    renderItemSection("Current Goal", context.activeGoals),
    renderItemSection("Active Constraints", context.activeConstraints),
    renderItemSection("Active Decisions", context.activeDecisions),
    renderItemSection("Open Questions", context.openQuestions),
    renderItemSection("Dependency Context", context.dependencyItems),
    renderNoteSection(context.historicalNotes),
    renderConversation(context.recentConversation),
    `## Current User Input\n${context.currentInput}`,
  ].join("\n\n");
}

function renderItemSection(title: string, items: ContextItem[]): string {
  const body = items.length === 0
    ? "[none]"
    : items.map((item) => `- [${item.id}] (${item.status}) ${item.content}`).join("\n");
  return `## ${title}\n${body}`;
}

function renderNoteSection(notes: CompactHistoricalNote[]): string {
  const body = notes.length === 0
    ? "[none]"
    : notes.map((note) => {
        const details = [
          note.reason === undefined ? "" : ` reason=${note.reason}`,
          note.reopen_if === undefined ? "" : ` reopen_if=${note.reopen_if}`,
          note.provenance_handles.length === 0
            ? ""
            : ` provenance=${note.provenance_handles.join(",")}`,
        ].join("");
        return `- [${note.id}] (${note.status}) ${note.content}${details}`;
      }).join("\n");
  return `## Relevant Historical Notes\n${body}`;
}

function renderConversation(events: RawEvent[]): string {
  const body = events.length === 0
    ? "[none]"
    : events.map((event) => `- [seq:${event.seq} ${event.role}] ${event.content}`).join("\n");
  return `## Recent Conversation\n${body}`;
}

function renderTranscript(events: RawEvent[], currentInput: string): string {
  const lines = events.map((event) => `[seq:${event.seq} ${event.role}] ${event.content}`);
  lines.push(`[current user] ${currentInput}`);
  return lines.join("\n");
}

function dependencyClosure(
  roots: ContextItem[],
  relations: StateRelation[],
  itemsById: Map<string, ContextItem>
): { ids: Set<string>; edges: ClosureEdge[]; paths: DependencyPath[] } {
  const adjacency = new Map<string, string[]>();
  for (const relation of relations) {
    if (relation.relation_type !== "DEPENDS_ON") continue;
    const targets = adjacency.get(relation.source_id) ?? [];
    targets.push(relation.target_id);
    adjacency.set(relation.source_id, targets);
  }
  for (const targets of adjacency.values()) targets.sort(compareText);

  const rootIds = new Set(roots.map((item) => item.id));
  const ids = new Set(rootIds);
  const rootsSorted = [...roots].sort(compareItems);
  const queue = rootsSorted.map((item) => ({ id: item.id, path: [item.id] }));
  const pathsById = new Map(queue.map((entry) => [entry.id, entry.path]));
  const edgeKeys = new Set<string>();
  const edges: ClosureEdge[] = [];
  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index]!;
    for (const target of adjacency.get(current.id) ?? []) {
      const edgeKey = `${current.id}\u0000${target}`;
      if (!edgeKeys.has(edgeKey)) {
        edgeKeys.add(edgeKey);
        edges.push({ source_id: current.id, target_id: target });
      }
      if (ids.has(target)) continue;
      ids.add(target);
      const path = [...current.path, target];
      pathsById.set(target, path);
      queue.push({ id: target, path });
    }
  }
  edges.sort((left, right) =>
    compareText(left.source_id, right.source_id) || compareText(left.target_id, right.target_id)
  );
  const paths = [...ids]
    .filter((id) => !rootIds.has(id))
    .sort(compareText)
    .map((id) => ({ item_id: id, path: [...pathsById.get(id)!] }));
  for (const id of ids) {
    if (!itemsById.has(id)) throw new ContextAssemblerValidationError("relation target is missing");
  }
  return { ids, edges, paths };
}

function selectRecentTurns(events: RawEvent[], turnCount: number): RawEvent[] {
  const userIndexes = events
    .map((event, index) => ({ event, index }))
    .filter(({ event }) => event.role === "user")
    .map(({ index }) => index);
  if (userIndexes.length === 0) return [];
  const start = userIndexes[Math.max(0, userIndexes.length - turnCount)]!;
  return events.slice(start);
}

function selectItems(
  items: ContextItem[],
  type: ContextItemType,
  status: ContextItemStatus
): ContextItem[] {
  return items.filter((item) => item.type === type && item.status === status).sort(compareItems);
}

function compareItems(left: ContextItem, right: ContextItem): number {
  return compareText(left.updated_at, right.updated_at) || compareText(left.id, right.id);
}

function compareOptionalItems(left: ContextItem, right: ContextItem): number {
  return compareText(right.updated_at, left.updated_at) || compareText(left.id, right.id);
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function toHistoricalNote(
  item: ContextItem & {
    type: "DECISION" | "REJECTED_ALTERNATIVE";
    status: "SUPERSEDED" | "REJECTED";
  }
): CompactHistoricalNote {
  const reason = typeof item.metadata.reason === "string" ? item.metadata.reason : undefined;
  const reopenIf =
    typeof item.metadata.reopen_if === "string" ? item.metadata.reopen_if : undefined;
  return {
    id: item.id,
    type: item.type,
    status: item.status,
    content: item.content,
    ...(reason === undefined ? {} : { reason }),
    ...(reopenIf === undefined ? {} : { reopen_if: reopenIf }),
    provenance_handles: [...item.source_refs].sort(compareText),
  };
}

function reductionRatio(d0: number, candidate: number): number {
  if (d0 === 0) return 0;
  const ratio = 1 - candidate / d0;
  return Number.isFinite(ratio) ? ratio : 0;
}

function validateInput(input: ContextAssemblerInput): ValidatedInput {
  if (!isPlainObject(input)) invalid("input must be a plain object");
  assertExactKeys(input, [
    "session_id",
    "context_items",
    "state_relations",
    "raw_events",
    "current_input",
    "token_budget",
    "recent_raw_window_turns",
  ], "input");
  const sessionId = nonBlankString(input.session_id, "session_id");
  const currentInput = nonBlankString(input.current_input, "current_input");
  const tokenBudget = optionalSafeInteger(input.token_budget, 0, Number.MAX_SAFE_INTEGER, "token_budget");
  const recentTurns = optionalSafeInteger(
    input.recent_raw_window_turns,
    1,
    100,
    "recent_raw_window_turns"
  ) ?? 8;
  if (!Array.isArray(input.context_items)) invalid("context_items must be an array");
  if (!Array.isArray(input.state_relations)) invalid("state_relations must be an array");
  if (!Array.isArray(input.raw_events)) invalid("raw_events must be an array");
  assertArrayShape(input.context_items, "context_items");
  assertArrayShape(input.state_relations, "state_relations");
  assertArrayShape(input.raw_events, "raw_events");

  const rawEvents = input.raw_events.map((event, index) => validateRawEvent(event, sessionId, index));
  const rawIds = uniqueMap(rawEvents, (event) => event.id, "raw event id");
  uniqueMap(rawEvents, (event) => String(event.seq), "raw event seq");
  rawEvents.sort((left, right) => left.seq - right.seq);
  const items = input.context_items.map((item, index) =>
    validateContextItem(item, sessionId, rawIds, index)
  );
  const itemIds = uniqueMap(items, (item) => item.id, "state item id");
  const relations = input.state_relations.map((relation, index) =>
    validateRelation(relation, sessionId, itemIds, rawIds, index)
  );
  uniqueMap(
    relations,
    (relation) => `${relation.source_id}\u0000${relation.relation_type}\u0000${relation.target_id}`,
    "relation tuple"
  );
  relations.sort((left, right) =>
    compareText(left.source_id, right.source_id) ||
    compareText(left.relation_type, right.relation_type) ||
    compareText(left.target_id, right.target_id) ||
    compareText(left.created_at, right.created_at)
  );
  return { sessionId, items, relations, rawEvents, currentInput, tokenBudget, recentTurns };
}

function validateContextItem(
  value: unknown,
  sessionId: string,
  rawIds: Map<string, RawEvent>,
  index: number
): ContextItem {
  const path = `context_items[${index}]`;
  if (!isPlainObject(value)) invalid(`${path} must be a plain object`);
  assertExactKeys(value, [
    "id", "session_id", "type", "content", "status", "confidence", "created_at",
    "updated_at", "source_refs", "metadata",
  ], path);
  if (value.session_id !== sessionId) invalid(`${path} belongs to another session`);
  const type = enumValue(value.type, ITEM_TYPES, `${path}.type`);
  const status = nonBlankString(value.status, `${path}.status`) as ContextItemStatus;
  if (!validStatus(type, status)) invalid(`${path}.status is invalid for its type`);
  if (typeof value.content !== "string" || value.content.length === 0) {
    invalid(`${path}.content must be a non-empty string`);
  }
  if (typeof value.confidence !== "number" || !Number.isFinite(value.confidence) ||
      Object.is(value.confidence, -0) || value.confidence < 0 || value.confidence > 1) {
    invalid(`${path}.confidence is invalid`);
  }
  if (!Array.isArray(value.source_refs)) invalid(`${path}.source_refs must be an array`);
  const sourceRefs = value.source_refs.map((ref, refIndex) =>
    nonBlankString(ref, `${path}.source_refs[${refIndex}]`)
  );
  uniqueMap(sourceRefs, (ref) => ref, `${path} source ref`);
  for (const ref of sourceRefs) if (!rawIds.has(ref)) invalid(`${path} source ref is missing`);
  validateJsonObject(value.metadata, `${path}.metadata`);
  return {
    id: nonBlankString(value.id, `${path}.id`),
    session_id: sessionId,
    type,
    content: value.content,
    status,
    confidence: value.confidence,
    created_at: isoTimestamp(value.created_at, `${path}.created_at`),
    updated_at: isoTimestamp(value.updated_at, `${path}.updated_at`),
    source_refs: [...sourceRefs],
    metadata: cloneJson(value.metadata as JsonObject),
  };
}

function validateRawEvent(value: unknown, sessionId: string, index: number): RawEvent {
  const path = `raw_events[${index}]`;
  if (!isPlainObject(value)) invalid(`${path} must be a plain object`);
  assertExactKeys(value, [
    "id", "session_id", "seq", "role", "content", "event_type", "created_at",
    "token_count", "metadata", "source_event_id",
  ], path);
  if (value.session_id !== sessionId) invalid(`${path} belongs to another session`);
  if (!Number.isSafeInteger(value.seq) || (value.seq as number) < 1) invalid(`${path}.seq is invalid`);
  if (!Number.isSafeInteger(value.token_count) || (value.token_count as number) < 0) {
    invalid(`${path}.token_count is invalid`);
  }
  validateJsonObject(value.metadata, `${path}.metadata`);
  const sourceEventId = value.source_event_id === undefined
    ? undefined
    : nonBlankString(value.source_event_id, `${path}.source_event_id`);
  return {
    id: nonBlankString(value.id, `${path}.id`),
    session_id: sessionId,
    seq: value.seq as number,
    role: enumValue(value.role, ROLES, `${path}.role`),
    content: typeof value.content === "string" ? value.content : invalid(`${path}.content is invalid`),
    event_type: nonBlankString(value.event_type, `${path}.event_type`),
    created_at: isoTimestamp(value.created_at, `${path}.created_at`),
    token_count: value.token_count as number,
    metadata: cloneJson(value.metadata as JsonObject),
    ...(sourceEventId === undefined ? {} : { source_event_id: sourceEventId }),
  };
}

function validateRelation(
  value: unknown,
  sessionId: string,
  itemIds: Map<string, ContextItem>,
  rawIds: Map<string, RawEvent>,
  index: number
): StateRelation {
  const path = `state_relations[${index}]`;
  if (!isPlainObject(value)) invalid(`${path} must be a plain object`);
  assertExactKeys(value, ["session_id", "source_id", "relation_type", "target_id", "created_at"], path);
  if (value.session_id !== sessionId) invalid(`${path} belongs to another session`);
  const sourceId = nonBlankString(value.source_id, `${path}.source_id`);
  const targetId = nonBlankString(value.target_id, `${path}.target_id`);
  const relationType = enumValue(value.relation_type, RELATION_TYPES, `${path}.relation_type`);
  if (!itemIds.has(sourceId)) invalid(`${path} source is missing`);
  if (sourceId === targetId) invalid(`${path} must not target itself`);
  if (relationType === "DERIVED_FROM" ? !rawIds.has(targetId) : !itemIds.has(targetId)) {
    invalid(`${path} target is missing`);
  }
  return {
    session_id: sessionId,
    source_id: sourceId,
    relation_type: relationType,
    target_id: targetId,
    created_at: isoTimestamp(value.created_at, `${path}.created_at`),
  };
}

function validStatus(type: ContextItemType, status: ContextItemStatus): boolean {
  const statuses: Record<ContextItemType, readonly ContextItemStatus[]> = {
    GOAL: ["ACTIVE", "COMPLETED", "SUPERSEDED"],
    CONSTRAINT: ["ACTIVE", "SUPERSEDED"],
    DECISION: ["ACTIVE", "SUPERSEDED"],
    OPEN_QUESTION: ["OPEN", "RESOLVED", "DEFERRED"],
    REJECTED_ALTERNATIVE: ["REJECTED"],
  };
  return statuses[type].includes(status);
}

function assertExactKeys(value: Record<string, unknown>, allowed: readonly string[], path: string): void {
  const allowedSet = new Set(allowed);
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string" || !allowedSet.has(key)) invalid(`${path} contains an unknown field`);
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor?.enumerable || !("value" in descriptor)) invalid(`${path} must contain data fields only`);
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function nonBlankString(value: unknown, path: string): string {
  if (typeof value !== "string" || value.trim().length === 0) invalid(`${path} must be a non-blank string`);
  return value;
}

function optionalSafeInteger(
  value: unknown,
  minimum: number,
  maximum: number,
  path: string
): number | undefined {
  if (value === undefined) return undefined;
  if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum) {
    invalid(`${path} must be a safe integer from ${minimum} to ${maximum}`);
  }
  return value as number;
}

function enumValue<T extends string>(value: unknown, values: readonly T[], path: string): T {
  if (typeof value !== "string" || !values.includes(value as T)) invalid(`${path} is invalid`);
  return value as T;
}

function isoTimestamp(value: unknown, path: string): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) ||
      Number.isNaN(Date.parse(value)) || new Date(value).toISOString() !== value) {
    invalid(`${path} must be an ISO timestamp`);
  }
  return value;
}

function assertArrayShape(value: unknown[], path: string): void {
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.prototype.hasOwnProperty.call(value, index)) invalid(`${path} must not be sparse`);
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor?.enumerable || !("value" in descriptor)) invalid(`${path} must contain data entries only`);
  }
  for (const key of Reflect.ownKeys(value)) {
    if (key === "length") continue;
    if (typeof key !== "string" || !/^(0|[1-9]\d*)$/.test(key) || Number(key) >= value.length) {
      invalid(`${path} must not contain extra fields`);
    }
  }
}

function uniqueMap<T>(values: T[], key: (value: T) => string, label: string): Map<string, T> {
  const result = new Map<string, T>();
  for (const value of values) {
    const itemKey = key(value);
    if (result.has(itemKey)) invalid(`${label} is duplicated`);
    result.set(itemKey, value);
  }
  return result;
}

function validateJsonObject(value: unknown, path: string): void {
  if (!isPlainObject(value)) invalid(`${path} must be a plain JSON object`);
  validateJsonValue(value, new Set<object>(), path);
}

function validateJsonValue(value: unknown, ancestors: Set<object>, path: string): void {
  if (value === null || typeof value === "string" || typeof value === "boolean") return;
  if (typeof value === "number") {
    if (!Number.isFinite(value) || Object.is(value, -0)) invalid(`${path} contains an invalid number`);
    return;
  }
  if (typeof value !== "object" || value === null) invalid(`${path} contains a non-JSON value`);
  if (ancestors.has(value)) invalid(`${path} contains a cycle`);
  const prototype = Object.getPrototypeOf(value);
  if (!Array.isArray(value) && prototype !== Object.prototype && prototype !== null) {
    invalid(`${path} contains a non-plain object`);
  }
  ancestors.add(value);
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      if (!Object.prototype.hasOwnProperty.call(value, index)) invalid(`${path} contains a sparse array`);
      validateJsonValue(value[index], ancestors, `${path}[${index}]`);
    }
    for (const key of Reflect.ownKeys(value)) {
      if (key === "length") continue;
      if (typeof key !== "string" || !/^(0|[1-9]\d*)$/.test(key) || Number(key) >= value.length) {
        invalid(`${path} contains a non-index array field`);
      }
    }
  } else {
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key !== "string") invalid(`${path} contains a symbol field`);
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor?.enumerable || !("value" in descriptor)) invalid(`${path} contains a non-data field`);
      validateJsonValue(descriptor.value, ancestors, `${path}.${key}`);
    }
  }
  ancestors.delete(value);
}

function cloneItems(items: ContextItem[]): ContextItem[] {
  return items.map((item) => ({
    ...item,
    source_refs: [...item.source_refs],
    metadata: cloneJson(item.metadata),
  }));
}

function cloneRawEvent(event: RawEvent): RawEvent {
  return { ...event, metadata: cloneJson(event.metadata) };
}

function cloneNote(note: CompactHistoricalNote): CompactHistoricalNote {
  return { ...note, provenance_handles: [...note.provenance_handles] };
}

function cloneJson(value: JsonObject): JsonObject {
  return JSON.parse(JSON.stringify(value)) as JsonObject;
}

function invalid(message: string): never {
  throw new ContextAssemblerValidationError(message);
}
