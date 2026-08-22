import { createHash, randomUUID } from "node:crypto";
import {
  ExtractorValidationError,
  parseStrictStateDeltaPayload,
  type ExtractorInput,
} from "./extractor.js";
import { StateReducer, type ReducerResult } from "./reducer.js";
import type { RawEvent } from "./raw-store.js";
import {
  SqliteContextStateStore,
  StateRevisionConflictError,
  type StateUpdatePreparationRecord,
} from "./state-store.js";
import type { ContextItem, StateDelta } from "./state-types.js";

export const MAX_PREPARED_NEWEST_EVENTS = 100;

export type StateUpdateErrorCode =
  | "INVALID_INPUT"
  | "NOT_FOUND"
  | "CONFLICT"
  | "STORAGE_FAILURE";

export interface PrepareStateUpdateInput {
  session_id: string;
  newest_event_ids: string[];
}

export interface PrepareStateUpdateResult {
  preparation_token: string;
  fingerprint: string;
  expected_revision: number;
  extractor_input: ExtractorInput;
}

export interface ApplyStateDeltaInput {
  session_id: string;
  preparation_token: string;
  fingerprint: string;
  expected_revision: number;
  delta: unknown;
}

export interface ApplyStateDeltaResult extends ReducerResult {
  preparation_token: string;
  fingerprint: string;
  changed: boolean;
}

interface SnapshotEnvelope {
  schema_version: 1;
  session_id: string;
  expected_revision: number;
  newest_event_ids: string[];
  extractor_input: ExtractorInput;
}

export class StateUpdateError extends Error {
  constructor(readonly code: StateUpdateErrorCode) {
    super(code);
    this.name = "StateUpdateError";
  }
}

export class StateUpdateCoordinator {
  private readonly reducer: StateReducer;

  constructor(private readonly store: SqliteContextStateStore) {
    this.reducer = new StateReducer(store);
  }

  prepareStateUpdate(inputValue: unknown): PrepareStateUpdateResult {
    const input = parsePrepareInput(inputValue);
    const preparationToken = randomUUID();

    try {
      return this.store.transaction(input.session_id, () => {
        const expectedRevision = this.store.getRevision(input.session_id);
        const extractorInput = captureExtractorInput(
          this.store,
          input.session_id,
          input.newest_event_ids,
          true
        );
        const envelope: SnapshotEnvelope = {
          schema_version: 1,
          session_id: input.session_id,
          expected_revision: expectedRevision,
          newest_event_ids: [...input.newest_event_ids],
          extractor_input: extractorInput,
        };
        const snapshotJson = JSON.stringify(envelope);
        const fingerprint = fingerprintOf(snapshotJson);
        this.store.insertStateUpdatePreparation({
          preparation_token: preparationToken,
          session_id: input.session_id,
          expected_revision: expectedRevision,
          newest_event_ids: [...input.newest_event_ids],
          fingerprint,
          snapshot_json: snapshotJson,
          created_at: new Date().toISOString(),
        });
        return {
          preparation_token: preparationToken,
          fingerprint,
          expected_revision: expectedRevision,
          extractor_input: extractorInput,
        };
      }).value;
    } catch (error) {
      throw mapCoordinatorFailure(error);
    }
  }

  applyStateDelta(inputValue: unknown): ApplyStateDeltaResult {
    const input = parseApplyInput(inputValue);
    let record: StateUpdatePreparationRecord;
    try {
      const found = this.store.getStateUpdatePreparation(input.preparation_token);
      if (found === undefined) throw new StateUpdateError("NOT_FOUND");
      record = found;
    } catch (error) {
      throw mapCoordinatorFailure(error);
    }

    assertPreparationIdentity(record, input);
    const envelope = parseStoredEnvelope(record);
    let delta: StateDelta;
    try {
      delta = parseStrictStateDeltaPayload(input.delta, envelope.extractor_input);
    } catch (error) {
      throw mapDeltaFailure(error);
    }
    const changed = !isEmptyDelta(delta);

    try {
      if (this.store.getRevision(input.session_id) !== input.expected_revision) {
        throw new StateUpdateError("CONFLICT");
      }
    } catch (error) {
      throw mapCoordinatorFailure(error);
    }

    try {
      const result = this.reducer.applyAtRevision(
        input.session_id,
        delta,
        input.expected_revision,
        () => {
          const currentRecord = this.store.getStateUpdatePreparation(input.preparation_token);
          if (currentRecord === undefined) throw new StateUpdateError("NOT_FOUND");
          assertPreparationIdentity(currentRecord, input);
          const currentExtractorInput = captureExtractorInput(
            this.store,
            input.session_id,
            currentRecord.newest_event_ids,
            false
          );
          const currentEnvelope: SnapshotEnvelope = {
            schema_version: 1,
            session_id: input.session_id,
            expected_revision: input.expected_revision,
            newest_event_ids: [...currentRecord.newest_event_ids],
            extractor_input: currentExtractorInput,
          };
          if (fingerprintOf(JSON.stringify(currentEnvelope)) !== currentRecord.fingerprint) {
            throw new StateUpdateError("CONFLICT");
          }
        }
      );
      return {
        preparation_token: input.preparation_token,
        fingerprint: input.fingerprint,
        changed,
        ...result,
      };
    } catch (error) {
      throw mapCoordinatorFailure(error);
    }
  }
}

export function prepareStateUpdate(
  store: SqliteContextStateStore,
  input: unknown
): PrepareStateUpdateResult {
  return new StateUpdateCoordinator(store).prepareStateUpdate(input);
}

export function applyStateDelta(
  store: SqliteContextStateStore,
  input: unknown
): ApplyStateDeltaResult {
  return new StateUpdateCoordinator(store).applyStateDelta(input);
}

export const prepare_state_update = prepareStateUpdate;
export const apply_state_delta = applyStateDelta;

function captureExtractorInput(
  store: SqliteContextStateStore,
  sessionId: string,
  newestEventIds: readonly string[],
  requireCurrentSuffix: boolean
): ExtractorInput {
  let newestEvents: RawEvent[];
  try {
    newestEvents = store.getRawEventsByIds(sessionId, newestEventIds);
  } catch (error) {
    throw new StateUpdateError(isSqliteFailure(error) ? "STORAGE_FAILURE" : "CONFLICT");
  }
  assertContinuousOrderedEvents(newestEvents);
  if (
    requireCurrentSuffix &&
    newestEvents.at(-1)?.seq !== store.getSessionMaxRawSequence(sessionId)
  ) {
    throw new StateUpdateError("CONFLICT");
  }

  const activeState = store.getItems(sessionId).filter(isExtractorVisibleItem);
  const activeIds = new Set(activeState.map((item) => item.id));
  const newestIds = new Set(newestEventIds);
  const recentEventIds = new Set<string>();
  const stateRelations = store.getSessionRelations(sessionId).filter((relation) => {
    if (!activeIds.has(relation.source_id)) return false;
    if (relation.relation_type === "DERIVED_FROM") {
      if (!newestIds.has(relation.target_id)) recentEventIds.add(relation.target_id);
      return true;
    }
    return activeIds.has(relation.target_id);
  });
  let recentContext: RawEvent[];
  try {
    recentContext = store.getRawEventsByIds(sessionId, [...recentEventIds]);
  } catch {
    throw new StateUpdateError("STORAGE_FAILURE");
  }
  recentContext.sort((left, right) => left.seq - right.seq || left.id.localeCompare(right.id));

  return {
    session_id: sessionId,
    active_state: activeState,
    state_relations: stateRelations,
    recent_context: recentContext,
    newest_events: newestEvents,
  };
}

function isExtractorVisibleItem(item: ContextItem): boolean {
  switch (item.type) {
    case "GOAL":
    case "CONSTRAINT":
    case "DECISION":
      return item.status === "ACTIVE";
    case "OPEN_QUESTION":
      return item.status === "OPEN";
    case "REJECTED_ALTERNATIVE":
      return item.status === "REJECTED";
  }
}

function assertContinuousOrderedEvents(events: readonly RawEvent[]): void {
  if (events.length === 0) throw new StateUpdateError("INVALID_INPUT");
  for (let index = 1; index < events.length; index += 1) {
    if (events[index]!.seq !== events[index - 1]!.seq + 1) {
      throw new StateUpdateError("CONFLICT");
    }
  }
}

function parsePrepareInput(value: unknown): PrepareStateUpdateInput {
  const input = requireExactRecord(value, ["session_id", "newest_event_ids"]);
  const sessionId = requireNonEmptyString(input.session_id);
  const eventIds = requireIdArray(input.newest_event_ids, MAX_PREPARED_NEWEST_EVENTS);
  return { session_id: sessionId, newest_event_ids: eventIds };
}

function parseApplyInput(value: unknown): ApplyStateDeltaInput {
  const input = requireExactRecord(value, [
    "session_id",
    "preparation_token",
    "fingerprint",
    "expected_revision",
    "delta",
  ]);
  const sessionId = requireNonEmptyString(input.session_id);
  const preparationToken = requireNonBlankString(input.preparation_token);
  if (preparationToken.length > 200) invalid();
  const fingerprint = requireNonBlankString(input.fingerprint);
  if (!/^[a-f0-9]{64}$/.test(fingerprint)) invalid();
  if (!Number.isSafeInteger(input.expected_revision) || (input.expected_revision as number) < 0) {
    invalid();
  }
  return {
    session_id: sessionId,
    preparation_token: preparationToken,
    fingerprint,
    expected_revision: input.expected_revision as number,
    delta: input.delta,
  };
}

function parseStoredEnvelope(record: StateUpdatePreparationRecord): SnapshotEnvelope {
  if (fingerprintOf(record.snapshot_json) !== record.fingerprint) {
    throw new StateUpdateError("CONFLICT");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(record.snapshot_json);
  } catch {
    throw new StateUpdateError("STORAGE_FAILURE");
  }
  const envelope = requireExactRecord(parsed, [
    "schema_version",
    "session_id",
    "expected_revision",
    "newest_event_ids",
    "extractor_input",
  ]);
  if (
    envelope.schema_version !== 1 ||
    envelope.session_id !== record.session_id ||
    envelope.expected_revision !== record.expected_revision
  ) {
    throw new StateUpdateError("CONFLICT");
  }
  const eventIds = requireIdArray(envelope.newest_event_ids, MAX_PREPARED_NEWEST_EVENTS);
  if (!sameStrings(eventIds, record.newest_event_ids)) {
    throw new StateUpdateError("CONFLICT");
  }
  return {
    schema_version: 1,
    session_id: record.session_id,
    expected_revision: record.expected_revision,
    newest_event_ids: eventIds,
    extractor_input: envelope.extractor_input as ExtractorInput,
  };
}

function assertPreparationIdentity(
  record: StateUpdatePreparationRecord,
  input: ApplyStateDeltaInput
): void {
  if (
    record.session_id !== input.session_id ||
    record.expected_revision !== input.expected_revision ||
    record.fingerprint !== input.fingerprint
  ) {
    throw new StateUpdateError("CONFLICT");
  }
}

function isEmptyDelta(delta: StateDelta): boolean {
  return Object.values(delta).every((operations) => operations.length === 0);
}

function fingerprintOf(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function requireExactRecord(
  value: unknown,
  requiredKeys: readonly string[]
): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) invalid();
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) invalid();
  const record = value as Record<string, unknown>;
  const allowed = new Set(requiredKeys);
  for (const key of Reflect.ownKeys(record)) {
    if (typeof key !== "string" || !allowed.has(key)) invalid();
    const descriptor = Object.getOwnPropertyDescriptor(record, key);
    if (!descriptor?.enumerable || !("value" in descriptor)) invalid();
  }
  for (const key of requiredKeys) {
    if (!Object.prototype.hasOwnProperty.call(record, key)) invalid();
  }
  return record;
}

function requireIdArray(value: unknown, maximum: number): string[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) invalid();
  if (value.length < 1 || value.length > maximum) invalid();
  const result: string[] = [];
  const seen = new Set<string>();
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor?.enumerable || !("value" in descriptor)) invalid();
    const id = requireNonBlankString(descriptor.value);
    if (seen.has(id)) invalid();
    seen.add(id);
    result.push(id);
  }
  for (const key of Reflect.ownKeys(value)) {
    if (key === "length") continue;
    if (typeof key !== "string" || !/^(0|[1-9]\d*)$/.test(key) || Number(key) >= value.length) {
      invalid();
    }
  }
  return result;
}

function requireNonEmptyString(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) invalid();
  return value;
}

function requireNonBlankString(value: unknown): string {
  if (typeof value !== "string" || value.trim().length === 0) invalid();
  return value;
}

function mapDeltaFailure(error: unknown): StateUpdateError {
  if (!(error instanceof ExtractorValidationError)) return mapCoordinatorFailure(error);
  switch (error.code) {
    case "INVALID_INPUT":
    case "INVALID_JSON":
    case "INVALID_SCHEMA":
      return new StateUpdateError("INVALID_INPUT");
    case "INVALID_REFERENCE":
    case "CONFLICT":
      return new StateUpdateError("CONFLICT");
    case "TRANSPORT_FAILURE":
      return new StateUpdateError("STORAGE_FAILURE");
  }
}

function mapCoordinatorFailure(error: unknown): StateUpdateError {
  if (error instanceof StateUpdateError) return error;
  if (error instanceof StateRevisionConflictError) return new StateUpdateError("CONFLICT");
  if (isSqliteFailure(error)) {
    return new StateUpdateError("STORAGE_FAILURE");
  }
  return new StateUpdateError("CONFLICT");
}

function isSqliteFailure(error: unknown): error is { code: string } {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string" &&
    error.code.startsWith("SQLITE_")
  );
}

function invalid(): never {
  throw new StateUpdateError("INVALID_INPUT");
}
