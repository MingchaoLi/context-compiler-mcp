import type { RawEvent } from "./raw-store.js";
import type {
  ContextItem,
  ContextItemStatus,
  ContextItemType,
  NewItemDelta,
  RelationType,
  StateDelta,
  StateRelation,
} from "./state-types.js";

export type ExtractorErrorCode =
  | "INVALID_INPUT"
  | "INVALID_JSON"
  | "INVALID_SCHEMA"
  | "INVALID_REFERENCE"
  | "CONFLICT"
  | "TRANSPORT_FAILURE";

export interface ExtractorInput {
  session_id: string;
  active_state: ContextItem[];
  state_relations: StateRelation[];
  recent_context: RawEvent[];
  newest_events: RawEvent[];
}

export interface ExtractorTransportOptions {
  signal?: AbortSignal;
}

export interface ExtractorTransport {
  complete(prompt: string, options: ExtractorTransportOptions): Promise<string>;
}

export interface ExtractorResult {
  delta: StateDelta;
  attempts: number;
  fallback_used: boolean;
  error_codes: ExtractorErrorCode[];
}

export interface StrictStateExtractorOptions {
  maxAttempts?: number;
}

export class ExtractorValidationError extends Error {
  constructor(readonly code: ExtractorErrorCode) {
    super(code);
    this.name = "ExtractorValidationError";
  }
}

interface ValidationContext {
  stateById: Map<string, ContextItem>;
  rawById: Map<string, RawEvent>;
  relationKeys: Set<string>;
}

const TOP_LEVEL_KEYS = [
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

export class StrictStateExtractor {
  private readonly maxAttempts: number;

  constructor(
    private readonly transport: ExtractorTransport,
    options: StrictStateExtractorOptions = {}
  ) {
    this.maxAttempts = options.maxAttempts ?? 2;
    if (!Number.isSafeInteger(this.maxAttempts) || this.maxAttempts < 1 || this.maxAttempts > 3) {
      throw new Error("maxAttempts must be an integer between 1 and 3");
    }
  }

  async extract(input: ExtractorInput, signal?: AbortSignal): Promise<ExtractorResult> {
    throwIfAborted(signal);
    validateExtractorInput(input);
    const errorCodes: ExtractorErrorCode[] = [];

    for (let attempt = 1; attempt <= this.maxAttempts; attempt += 1) {
      throwIfAborted(signal);

      let response: string;
      try {
        response = await this.transport.complete(buildPrompt(input, errorCodes.at(-1)), {
          ...(signal === undefined ? {} : { signal }),
        });
      } catch {
        if (signal?.aborted) throw abortReason(signal);
        errorCodes.push("TRANSPORT_FAILURE");
        continue;
      }

      throwIfAborted(signal);
      try {
        const delta = parseStrictStateDelta(response, input);
        return {
          delta,
          attempts: attempt,
          fallback_used: false,
          error_codes: [...errorCodes],
        };
      } catch (error) {
        if (!(error instanceof ExtractorValidationError)) throw error;
        errorCodes.push(error.code);
      }
    }

    return {
      delta: createEmptyStateDelta(),
      attempts: this.maxAttempts,
      fallback_used: true,
      error_codes: [...errorCodes],
    };
  }
}

export function createEmptyStateDelta(): StateDelta {
  return {
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
  };
}

export function parseStrictStateDelta(response: string, input: ExtractorInput): StateDelta {
  const context = validateExtractorInput(input);
  if (typeof response !== "string") fail("INVALID_SCHEMA");

  let parsed: unknown;
  try {
    parsed = JSON.parse(response);
  } catch {
    fail("INVALID_JSON");
  }

  return parseStateDeltaPayload(parsed, input, context);
}

export function parseStrictStateDeltaPayload(
  payload: unknown,
  input: ExtractorInput
): StateDelta {
  return parseStateDeltaPayload(payload, input, validateExtractorInput(input));
}

function parseStateDeltaPayload(
  parsed: unknown,
  input: ExtractorInput,
  context: ValidationContext
): StateDelta {

  const root = requireRecord(parsed, "INVALID_SCHEMA");
  requireExactKeys(root, TOP_LEVEL_KEYS, "INVALID_SCHEMA");

  const updatedItemIds = new Set<string>();
  const resolvedQuestionIds = new Set<string>();
  const supersededDecisionIds = new Set<string>();
  const supersedingDecisionIds = new Set<string>();
  const resolvedByDecisionIds = new Set<string>();

  const newGoals = requireArray(root.new_goals, "INVALID_SCHEMA").map((entry) =>
    parseNewItem(entry, context)
  );
  const updatedGoals = requireArray(root.updated_goals, "INVALID_SCHEMA").map((entry) => {
    const object = requireRecord(entry, "INVALID_SCHEMA");
    requireAllowedKeys(object, ["id", "content", "status"], "INVALID_SCHEMA");
    requirePresentKeys(object, ["id"], "INVALID_SCHEMA");
    if (!("content" in object) && !("status" in object)) fail("INVALID_SCHEMA");
    const id = requireId(object.id, "INVALID_SCHEMA");
    registerUnique(updatedItemIds, id);
    const item = requireStateReference(context, id, "GOAL");
    if (item.status !== "ACTIVE") fail("INVALID_REFERENCE");
    const content = optionalContent(object);
    const status = optionalExactEnum(object, "status", ["COMPLETED"] as const);
    if (content === item.content && status === undefined) fail("CONFLICT");
    return { id, ...(content === undefined ? {} : { content }), ...(status === undefined ? {} : { status }) };
  });
  const newConstraints = requireArray(root.new_constraints, "INVALID_SCHEMA").map((entry) =>
    parseNewItem(entry, context)
  );
  const updatedConstraints = requireArray(root.updated_constraints, "INVALID_SCHEMA").map(
    (entry) => {
      const object = requireRecord(entry, "INVALID_SCHEMA");
      requireAllowedKeys(object, ["id", "content", "status"], "INVALID_SCHEMA");
      requirePresentKeys(object, ["id"], "INVALID_SCHEMA");
      if (!("content" in object) && !("status" in object)) fail("INVALID_SCHEMA");
      const id = requireId(object.id, "INVALID_SCHEMA");
      registerUnique(updatedItemIds, id);
      const item = requireStateReference(context, id, "CONSTRAINT");
      if (item.status !== "ACTIVE") fail("INVALID_REFERENCE");
      const content = optionalContent(object);
      const status = optionalExactEnum(object, "status", ["SUPERSEDED"] as const);
      if (content === item.content && status === undefined) fail("CONFLICT");
      return {
        id,
        ...(content === undefined ? {} : { content }),
        ...(status === undefined ? {} : { status }),
      };
    }
  );
  const newDecisions = requireArray(root.new_decisions, "INVALID_SCHEMA").map((entry) => {
    const object = requireRecord(entry, "INVALID_SCHEMA");
    requireAllowedKeys(
      object,
      ["content", "reason", "supersedes", "reopen_if", "source_refs"],
      "INVALID_SCHEMA"
    );
    requirePresentKeys(object, ["content"], "INVALID_SCHEMA");
    const supersedes = optionalIdArray(object, "supersedes");
    for (const id of supersedes ?? []) {
      requireActiveDecision(context, id);
      registerUnique(supersededDecisionIds, id);
    }
    return {
      content: requireContent(object.content, "INVALID_SCHEMA"),
      ...optionalStringField(object, "reason"),
      ...(supersedes === undefined ? {} : { supersedes }),
      ...optionalStringField(object, "reopen_if"),
      ...optionalSourceRefs(object, context),
    };
  });
  const resolvedQuestions = requireArray(root.resolved_questions, "INVALID_SCHEMA").map((entry) => {
    const object = requireRecord(entry, "INVALID_SCHEMA");
    requireAllowedKeys(object, ["id", "resolved_by"], "INVALID_SCHEMA");
    requirePresentKeys(object, ["id"], "INVALID_SCHEMA");
    const id = requireId(object.id, "INVALID_SCHEMA");
    registerUnique(resolvedQuestionIds, id);
    const question = requireStateReference(context, id, "OPEN_QUESTION");
    if (question.status !== "OPEN") fail("INVALID_REFERENCE");
    const resolvedBy = optionalId(object, "resolved_by");
    if (resolvedBy !== undefined) {
      requireActiveDecision(context, resolvedBy);
      resolvedByDecisionIds.add(resolvedBy);
    }
    return { id, ...(resolvedBy === undefined ? {} : { resolved_by: resolvedBy }) };
  });
  const newOpenQuestions = requireArray(root.new_open_questions, "INVALID_SCHEMA").map((entry) =>
    parseNewItem(entry, context)
  );
  const rejectedAlternatives = requireArray(root.rejected_alternatives, "INVALID_SCHEMA").map(
    (entry) => {
      const object = requireRecord(entry, "INVALID_SCHEMA");
      requireAllowedKeys(
        object,
        ["content", "reason", "reopen_if", "source_refs", "rejects"],
        "INVALID_SCHEMA"
      );
      requirePresentKeys(object, ["content"], "INVALID_SCHEMA");
      const rejects = optionalIdArray(object, "rejects");
      for (const id of rejects ?? []) requireAnyStateReference(context, id);
      return {
        content: requireContent(object.content, "INVALID_SCHEMA"),
        ...optionalStringField(object, "reason"),
        ...optionalStringField(object, "reopen_if"),
        ...optionalSourceRefs(object, context),
        ...(rejects === undefined ? {} : { rejects }),
      };
    }
  );
  const supersessions = requireArray(root.supersessions, "INVALID_SCHEMA").map((entry) => {
    const object = requireRecord(entry, "INVALID_SCHEMA");
    requireExactKeys(object, ["superseded_id", "superseding_id"], "INVALID_SCHEMA");
    const supersededId = requireId(object.superseded_id, "INVALID_SCHEMA");
    const supersedingId = requireId(object.superseding_id, "INVALID_SCHEMA");
    if (supersededId === supersedingId) fail("CONFLICT");
    requireActiveDecision(context, supersededId);
    requireActiveDecision(context, supersedingId);
    registerUnique(supersededDecisionIds, supersededId);
    supersedingDecisionIds.add(supersedingId);
    return { superseded_id: supersededId, superseding_id: supersedingId };
  });
  const newRelationKeys = new Set<string>();
  const newRelations = requireArray(root.new_relations, "INVALID_SCHEMA").map((entry) => {
    const object = requireRecord(entry, "INVALID_SCHEMA");
    requireExactKeys(object, ["source_id", "relation_type", "target_id"], "INVALID_SCHEMA");
    const sourceId = requireId(object.source_id, "INVALID_SCHEMA");
    const relationType = requireExactEnum(
      object.relation_type,
      ["DEPENDS_ON", "REJECTS", "DERIVED_FROM"] as const,
      "INVALID_SCHEMA"
    );
    const targetId = requireId(object.target_id, "INVALID_SCHEMA");
    if (sourceId === targetId) fail("CONFLICT");
    const source = requireAnyStateReference(context, sourceId);
    if (relationType === "DERIVED_FROM") {
      requireRawReference(context, targetId);
    } else {
      requireAnyStateReference(context, targetId);
    }
    if (relationType === "REJECTS" && source.type !== "REJECTED_ALTERNATIVE") {
      fail("INVALID_REFERENCE");
    }
    const key = relationKey(input.session_id, sourceId, relationType, targetId);
    if (context.relationKeys.has(key)) fail("CONFLICT");
    registerUnique(newRelationKeys, key);
    return { source_id: sourceId, relation_type: relationType, target_id: targetId };
  });

  for (const id of supersedingDecisionIds) {
    if (supersededDecisionIds.has(id)) fail("CONFLICT");
  }
  for (const id of resolvedByDecisionIds) {
    if (supersededDecisionIds.has(id)) fail("CONFLICT");
  }

  return {
    new_goals: newGoals,
    updated_goals: updatedGoals,
    new_constraints: newConstraints,
    updated_constraints: updatedConstraints,
    new_decisions: newDecisions,
    resolved_questions: resolvedQuestions,
    new_open_questions: newOpenQuestions,
    rejected_alternatives: rejectedAlternatives,
    supersessions,
    new_relations: newRelations,
  };
}

function validateExtractorInput(input: ExtractorInput): ValidationContext {
  const root = requireRecord(input, "INVALID_INPUT");
  requireExactKeys(
    root,
    ["session_id", "active_state", "state_relations", "recent_context", "newest_events"],
    "INVALID_INPUT"
  );
  const sessionId = requireId(root.session_id, "INVALID_INPUT");
  const stateById = new Map<string, ContextItem>();
  for (const entry of requireArray(root.active_state, "INVALID_INPUT")) {
    const item = validateInputStateItem(entry, sessionId);
    if (stateById.has(item.id)) fail("INVALID_INPUT");
    stateById.set(item.id, item);
  }

  const rawById = new Map<string, RawEvent>();
  const rawSeqs = new Set<number>();
  for (const field of ["recent_context", "newest_events"] as const) {
    for (const entry of requireArray(root[field], "INVALID_INPUT")) {
      const event = validateInputRawEvent(entry, sessionId);
      if (rawById.has(event.id)) fail("INVALID_INPUT");
      if (rawSeqs.has(event.seq)) fail("INVALID_INPUT");
      rawById.set(event.id, event);
      rawSeqs.add(event.seq);
    }
  }

  const context: ValidationContext = { stateById, rawById, relationKeys: new Set<string>() };
  for (const entry of requireArray(root.state_relations, "INVALID_INPUT")) {
    const relation = validateInputRelation(entry, sessionId, context);
    const key = relationKey(
      relation.session_id,
      relation.source_id,
      relation.relation_type,
      relation.target_id
    );
    if (context.relationKeys.has(key)) fail("INVALID_INPUT");
    context.relationKeys.add(key);
  }
  return context;
}

function validateInputStateItem(value: unknown, sessionId: string): ContextItem {
  const object = requireRecord(value, "INVALID_INPUT");
  requireExactKeys(
    object,
    [
      "id",
      "session_id",
      "type",
      "content",
      "status",
      "confidence",
      "created_at",
      "updated_at",
      "source_refs",
      "metadata",
    ],
    "INVALID_INPUT"
  );
  if (object.session_id !== sessionId) fail("INVALID_INPUT");
  const type = requireExactEnum(object.type, ITEM_TYPES, "INVALID_INPUT");
  const status = requireStatus(type, object.status, "INVALID_INPUT");
  const confidence = requireFiniteNumber(object.confidence, "INVALID_INPUT");
  if (confidence < 0 || confidence > 1) fail("INVALID_INPUT");
  requireJsonObject(object.metadata, "INVALID_INPUT");
  return {
    id: requireId(object.id, "INVALID_INPUT"),
    session_id: sessionId,
    type,
    content: requireContent(object.content, "INVALID_INPUT"),
    status,
    confidence,
    created_at: requireId(object.created_at, "INVALID_INPUT"),
    updated_at: requireId(object.updated_at, "INVALID_INPUT"),
    source_refs: requireIdArray(object.source_refs, "INVALID_INPUT"),
    metadata: object.metadata as ContextItem["metadata"],
  };
}

function validateInputRawEvent(value: unknown, sessionId: string): RawEvent {
  const object = requireRecord(value, "INVALID_INPUT");
  requireAllowedKeys(
    object,
    [
      "id",
      "session_id",
      "seq",
      "role",
      "content",
      "event_type",
      "created_at",
      "token_count",
      "metadata",
      "source_event_id",
    ],
    "INVALID_INPUT"
  );
  requirePresentKeys(
    object,
    [
      "id",
      "session_id",
      "seq",
      "role",
      "content",
      "event_type",
      "created_at",
      "token_count",
      "metadata",
    ],
    "INVALID_INPUT"
  );
  if (object.session_id !== sessionId) fail("INVALID_INPUT");
  const seq = requireFiniteNumber(object.seq, "INVALID_INPUT");
  const tokenCount = requireFiniteNumber(object.token_count, "INVALID_INPUT");
  if (!Number.isSafeInteger(seq) || seq < 1 || !Number.isSafeInteger(tokenCount) || tokenCount < 0) {
    fail("INVALID_INPUT");
  }
  requireJsonObject(object.metadata, "INVALID_INPUT");
  const sourceEventId = optionalId(object, "source_event_id", "INVALID_INPUT");
  return {
    id: requireId(object.id, "INVALID_INPUT"),
    session_id: sessionId,
    seq,
    role: requireExactEnum(
      object.role,
      ["system", "user", "assistant", "tool"] as const,
      "INVALID_INPUT"
    ),
    content: requireString(object.content, "INVALID_INPUT"),
    event_type: requireId(object.event_type, "INVALID_INPUT"),
    created_at: requireId(object.created_at, "INVALID_INPUT"),
    token_count: tokenCount,
    metadata: object.metadata as RawEvent["metadata"],
    ...(sourceEventId === undefined ? {} : { source_event_id: sourceEventId }),
  };
}

function validateInputRelation(
  value: unknown,
  sessionId: string,
  context: ValidationContext
): StateRelation {
  const object = requireRecord(value, "INVALID_INPUT");
  requireExactKeys(
    object,
    ["session_id", "source_id", "relation_type", "target_id", "created_at"],
    "INVALID_INPUT"
  );
  if (object.session_id !== sessionId) fail("INVALID_INPUT");
  const sourceId = requireId(object.source_id, "INVALID_INPUT");
  const targetId = requireId(object.target_id, "INVALID_INPUT");
  if (sourceId === targetId) fail("INVALID_INPUT");
  const type = requireExactEnum(object.relation_type, RELATION_TYPES, "INVALID_INPUT");
  const source = requireAnyStateReference(context, sourceId, "INVALID_INPUT");
  if (type === "DERIVED_FROM") {
    requireRawReference(context, targetId, "INVALID_INPUT");
  } else {
    const target = requireAnyStateReference(context, targetId, "INVALID_INPUT");
    if (type === "SUPERSEDES") {
      if (
        source.type !== "DECISION" ||
        target.type !== "DECISION" ||
        target.status !== "SUPERSEDED"
      ) fail("INVALID_INPUT");
    }
    if (type === "RESOLVED_BY") {
      if (
        source.type !== "OPEN_QUESTION" ||
        source.status !== "RESOLVED" ||
        target.type !== "DECISION"
      ) fail("INVALID_INPUT");
    }
    if (type === "REJECTS" && source.type !== "REJECTED_ALTERNATIVE") {
      fail("INVALID_INPUT");
    }
  }
  return {
    session_id: sessionId,
    source_id: sourceId,
    relation_type: type,
    target_id: targetId,
    created_at: requirePersistedTimestamp(object.created_at),
  };
}

function requirePersistedTimestamp(value: unknown): string {
  const timestamp = requireId(value, "INVALID_INPUT");
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(timestamp)) {
    fail("INVALID_INPUT");
  }
  const parsed = new Date(timestamp);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString() !== timestamp) {
    fail("INVALID_INPUT");
  }
  return timestamp;
}

function buildPrompt(input: ExtractorInput, previousError?: ExtractorErrorCode): string {
  return [
    "Extract only task-state changes. Return exactly one JSON object and no markdown.",
    "Use exactly the ten arrays in required_shape. Unknown fields are forbidden.",
    previousError === undefined ? undefined : `repair_error_code=${previousError}`,
    JSON.stringify({
      required_shape: createEmptyStateDelta(),
      contracts: {
        updated_goals_status: "COMPLETED only",
        updated_constraints_status: "SUPERSEDED only",
        resolved_by: "same-session ACTIVE Decision only",
        supersession: "different same-session ACTIVE Decisions only",
        explicit_relations: ["DEPENDS_ON", "REJECTS", "DERIVED_FROM"],
      },
      input,
    }),
  ]
    .filter((line): line is string => line !== undefined)
    .join("\n");
}

function parseNewItem(value: unknown, context: ValidationContext): NewItemDelta {
  const object = requireRecord(value, "INVALID_SCHEMA");
  requireAllowedKeys(object, ["content", "source_refs"], "INVALID_SCHEMA");
  requirePresentKeys(object, ["content"], "INVALID_SCHEMA");
  return {
    content: requireContent(object.content, "INVALID_SCHEMA"),
    ...optionalSourceRefs(object, context),
  };
}

function optionalSourceRefs(object: Record<string, unknown>, context: ValidationContext) {
  const refs = optionalIdArray(object, "source_refs");
  if (refs === undefined) return {};
  for (const ref of refs) requireRawReference(context, ref);
  return { source_refs: refs };
}

function requireStateReference(
  context: ValidationContext,
  id: string,
  type: ContextItemType,
  code: ExtractorErrorCode = "INVALID_REFERENCE"
): ContextItem {
  const item = context.stateById.get(id);
  if (!item || item.type !== type) fail(code);
  return item;
}

function requireAnyStateReference(
  context: ValidationContext,
  id: string,
  code: ExtractorErrorCode = "INVALID_REFERENCE"
): ContextItem {
  const item = context.stateById.get(id);
  if (!item) fail(code);
  return item;
}

function requireActiveDecision(
  context: ValidationContext,
  id: string,
  code: ExtractorErrorCode = "INVALID_REFERENCE"
): ContextItem {
  const item = requireStateReference(context, id, "DECISION", code);
  if (item.status !== "ACTIVE") fail(code);
  return item;
}

function requireRawReference(
  context: ValidationContext,
  id: string,
  code: ExtractorErrorCode = "INVALID_REFERENCE"
): RawEvent {
  const event = context.rawById.get(id);
  if (!event) fail(code);
  return event;
}

function requireRecord(
  value: unknown,
  code: ExtractorErrorCode
): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) fail(code);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype) fail(code);
  const result = value as Record<string, unknown>;
  for (const key of Reflect.ownKeys(result)) {
    if (typeof key !== "string") fail(code);
    const descriptor = Object.getOwnPropertyDescriptor(result, key);
    if (!descriptor?.enumerable || !("value" in descriptor)) fail(code);
  }
  return result;
}

function requireArray(value: unknown, code: ExtractorErrorCode): unknown[] {
  if (!Array.isArray(value)) fail(code);
  if (Object.getPrototypeOf(value) !== Array.prototype) fail(code);
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor?.enumerable || !("value" in descriptor)) fail(code);
  }
  for (const key of Reflect.ownKeys(value)) {
    if (key === "length") continue;
    if (typeof key !== "string" || !/^(0|[1-9]\d*)$/.test(key) || Number(key) >= value.length) {
      fail(code);
    }
  }
  return value;
}

function requireExactKeys(
  object: Record<string, unknown>,
  keys: readonly string[],
  code: ExtractorErrorCode
): void {
  requireAllowedKeys(object, keys, code);
  requirePresentKeys(object, keys, code);
}

function requireAllowedKeys(
  object: Record<string, unknown>,
  keys: readonly string[],
  code: ExtractorErrorCode
): void {
  const allowed = new Set(keys);
  for (const key of Object.keys(object)) if (!allowed.has(key)) fail(code);
}

function requirePresentKeys(
  object: Record<string, unknown>,
  keys: readonly string[],
  code: ExtractorErrorCode
): void {
  for (const key of keys) if (!Object.hasOwn(object, key)) fail(code);
}

function requireId(value: unknown, code: ExtractorErrorCode): string {
  if (typeof value !== "string" || value.trim().length === 0) fail(code);
  return value;
}

function requireContent(value: unknown, code: ExtractorErrorCode): string {
  if (typeof value !== "string" || value.trim().length === 0) fail(code);
  return value;
}

function requireString(value: unknown, code: ExtractorErrorCode): string {
  if (typeof value !== "string") fail(code);
  return value;
}

function requireFiniteNumber(value: unknown, code: ExtractorErrorCode): number {
  if (typeof value !== "number" || !Number.isFinite(value) || Object.is(value, -0)) fail(code);
  return value;
}

function requireExactEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
  code: ExtractorErrorCode
): T {
  if (typeof value !== "string" || !allowed.includes(value as T)) fail(code);
  return value as T;
}

function requireStatus(
  type: ContextItemType,
  value: unknown,
  code: ExtractorErrorCode
): ContextItemStatus {
  const statuses: Record<ContextItemType, readonly ContextItemStatus[]> = {
    GOAL: ["ACTIVE", "COMPLETED", "SUPERSEDED"],
    CONSTRAINT: ["ACTIVE", "SUPERSEDED"],
    DECISION: ["ACTIVE", "SUPERSEDED"],
    OPEN_QUESTION: ["OPEN", "RESOLVED", "DEFERRED"],
    REJECTED_ALTERNATIVE: ["REJECTED"],
  };
  return requireExactEnum(value, statuses[type], code);
}

function requireIdArray(value: unknown, code: ExtractorErrorCode): string[] {
  const array = requireArray(value, code);
  const seen = new Set<string>();
  return array.map((entry) => {
    const id = requireId(entry, code);
    registerUnique(seen, id, code);
    return id;
  });
}

function optionalIdArray(object: Record<string, unknown>, key: string): string[] | undefined {
  if (!Object.hasOwn(object, key)) return undefined;
  return requireIdArray(object[key], "INVALID_SCHEMA");
}

function optionalId(
  object: Record<string, unknown>,
  key: string,
  code: ExtractorErrorCode = "INVALID_SCHEMA"
): string | undefined {
  if (!Object.hasOwn(object, key)) return undefined;
  return requireId(object[key], code);
}

function optionalContent(object: Record<string, unknown>): string | undefined {
  if (!Object.hasOwn(object, "content")) return undefined;
  return requireContent(object.content, "INVALID_SCHEMA");
}

function optionalStringField(object: Record<string, unknown>, key: string) {
  if (!Object.hasOwn(object, key)) return {};
  return { [key]: requireString(object[key], "INVALID_SCHEMA") };
}

function optionalExactEnum<T extends string>(
  object: Record<string, unknown>,
  key: string,
  allowed: readonly T[]
): T | undefined {
  if (!Object.hasOwn(object, key)) return undefined;
  return requireExactEnum(object[key], allowed, "INVALID_SCHEMA");
}

function requireJsonObject(value: unknown, code: ExtractorErrorCode): void {
  const object = requireRecord(value, code);
  assertJsonValue(object, new Set<object>(), code);
}

function assertJsonValue(
  value: unknown,
  ancestors: Set<object>,
  code: ExtractorErrorCode
): void {
  if (value === null || typeof value === "string" || typeof value === "boolean") return;
  if (typeof value === "number") {
    requireFiniteNumber(value, code);
    return;
  }
  if (typeof value !== "object") fail(code);
  if (ancestors.has(value)) fail(code);
  ancestors.add(value);
  if (Array.isArray(value)) {
    for (const entry of requireArray(value, code)) assertJsonValue(entry, ancestors, code);
  } else {
    const object = requireRecord(value, code);
    for (const entry of Object.values(object)) assertJsonValue(entry, ancestors, code);
  }
  ancestors.delete(value);
}

function registerUnique(
  seen: Set<string>,
  value: string,
  code: ExtractorErrorCode = "CONFLICT"
): void {
  if (seen.has(value)) fail(code);
  seen.add(value);
}

function relationKey(
  sessionId: string,
  sourceId: string,
  relationType: RelationType,
  targetId: string
): string {
  return JSON.stringify([sessionId, sourceId, relationType, targetId]);
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw abortReason(signal);
}

function abortReason(signal: AbortSignal): unknown {
  if (signal.reason !== undefined) return signal.reason;
  return new DOMException("The operation was aborted", "AbortError");
}

function fail(code: ExtractorErrorCode): never {
  throw new ExtractorValidationError(code);
}
