import {
  ExtractorValidationError,
  StrictStateExtractor,
  type ExtractorResult,
  type ExtractorTransport,
} from "./extractor.js";
import { SqliteContextStateStore } from "./state-store.js";
import {
  StateUpdateCoordinator,
  StateUpdateError,
  type ApplyStateDeltaResult,
  MAX_PREPARED_NEWEST_EVENTS,
  type PrepareStateUpdateInput,
} from "./state-update.js";

export type RuntimeStateUpdateErrorCode =
  | "INVALID_INPUT"
  | "EXTRACTION_FAILED"
  | "CONFLICT"
  | "STORAGE_FAILURE"
  | "ABORTED";

export class RuntimeStateUpdateError extends Error {
  constructor(readonly code: RuntimeStateUpdateErrorCode) {
    super(code);
    this.name = "RuntimeStateUpdateError";
  }
}

export interface RuntimeStateUpdaterOptions {
  max_attempts?: number;
}

export interface RuntimeStateUpdateResult {
  preparation_token: string;
  fingerprint: string;
  expected_revision: number;
  extraction: ExtractorResult;
  application: ApplyStateDeltaResult;
}

export class RuntimeStateUpdater {
  private readonly coordinator: StateUpdateCoordinator;
  private readonly extractor: StrictStateExtractor;

  constructor(
    store: SqliteContextStateStore,
    transport: ExtractorTransport,
    options: RuntimeStateUpdaterOptions = {}
  ) {
    this.coordinator = new StateUpdateCoordinator(store);
    const maxAttempts = parseOptions(options);
    this.extractor = new StrictStateExtractor(
      transport,
      maxAttempts === undefined ? {} : { maxAttempts }
    );
  }

  async updateState(
    inputValue: PrepareStateUpdateInput,
    signal?: AbortSignal
  ): Promise<RuntimeStateUpdateResult> {
    if (signal?.aborted) throw new RuntimeStateUpdateError("ABORTED");
    const input = parseRuntimeInput(inputValue);

    let prepared;
    try {
      prepared = this.coordinator.prepareStateUpdate(input);
    } catch (error) {
      throw mapStateUpdateFailure(error);
    }

    let extraction: ExtractorResult;
    try {
      extraction = await this.extractor.extract(prepared.extractor_input, signal);
    } catch (error) {
      if (signal?.aborted) throw new RuntimeStateUpdateError("ABORTED");
      if (error instanceof ExtractorValidationError) {
        throw new RuntimeStateUpdateError("EXTRACTION_FAILED");
      }
      throw new RuntimeStateUpdateError("EXTRACTION_FAILED");
    }
    if (extraction.fallback_used) throw new RuntimeStateUpdateError("EXTRACTION_FAILED");
    if (signal?.aborted) throw new RuntimeStateUpdateError("ABORTED");

    let application: ApplyStateDeltaResult;
    try {
      application = this.coordinator.applyStateDelta({
        session_id: input.session_id,
        preparation_token: prepared.preparation_token,
        fingerprint: prepared.fingerprint,
        expected_revision: prepared.expected_revision,
        delta: extraction.delta,
      });
    } catch (error) {
      throw mapStateUpdateFailure(error);
    }

    return {
      preparation_token: prepared.preparation_token,
      fingerprint: prepared.fingerprint,
      expected_revision: prepared.expected_revision,
      extraction,
      application,
    };
  }
}

export async function runStateUpdate(
  store: SqliteContextStateStore,
  transport: ExtractorTransport,
  input: PrepareStateUpdateInput,
  options: RuntimeStateUpdaterOptions = {},
  signal?: AbortSignal
): Promise<RuntimeStateUpdateResult> {
  return new RuntimeStateUpdater(store, transport, options).updateState(input, signal);
}

export const run_state_update = runStateUpdate;

function parseOptions(value: unknown): number | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) invalid();
  if (Object.getPrototypeOf(value) !== Object.prototype) invalid();
  const record = value as Record<string, unknown>;
  for (const key of Reflect.ownKeys(record)) {
    if (key !== "max_attempts") invalid();
    const descriptor = Object.getOwnPropertyDescriptor(record, key);
    if (!descriptor?.enumerable || !("value" in descriptor)) invalid();
  }
  if (!Object.hasOwn(record, "max_attempts")) return undefined;
  if (
    !Number.isSafeInteger(record.max_attempts) ||
    (record.max_attempts as number) < 1 ||
    (record.max_attempts as number) > 3
  ) invalid();
  return record.max_attempts as number;
}

function parseRuntimeInput(value: unknown): PrepareStateUpdateInput {
  if (typeof value !== "object" || value === null || Array.isArray(value)) invalid();
  if (Object.getPrototypeOf(value) !== Object.prototype) invalid();
  const record = value as Record<string, unknown>;
  const allowed = new Set(["session_id", "newest_event_ids"]);
  for (const key of Reflect.ownKeys(record)) {
    if (typeof key !== "string" || !allowed.has(key)) invalid();
    const descriptor = Object.getOwnPropertyDescriptor(record, key);
    if (!descriptor?.enumerable || !("value" in descriptor)) invalid();
  }
  if (!Object.hasOwn(record, "session_id") || !Object.hasOwn(record, "newest_event_ids")) {
    invalid();
  }
  if (typeof record.session_id !== "string" || record.session_id.length === 0) invalid();
  const eventIds = record.newest_event_ids;
  if (!Array.isArray(eventIds) || Object.getPrototypeOf(eventIds) !== Array.prototype) invalid();
  if (eventIds.length < 1 || eventIds.length > MAX_PREPARED_NEWEST_EVENTS) invalid();
  const normalizedIds: string[] = [];
  const seen = new Set<string>();
  for (let index = 0; index < eventIds.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(eventIds, String(index));
    if (!descriptor?.enumerable || !("value" in descriptor)) invalid();
    const id = descriptor.value;
    if (typeof id !== "string" || id.trim().length === 0 || seen.has(id)) invalid();
    seen.add(id);
    normalizedIds.push(id);
  }
  for (const key of Reflect.ownKeys(eventIds)) {
    if (key === "length") continue;
    if (typeof key !== "string" || !/^(0|[1-9]\d*)$/.test(key) || Number(key) >= eventIds.length) {
      invalid();
    }
  }
  return { session_id: record.session_id, newest_event_ids: normalizedIds };
}

function mapStateUpdateFailure(error: unknown): RuntimeStateUpdateError {
  if (!(error instanceof StateUpdateError)) {
    return new RuntimeStateUpdateError("STORAGE_FAILURE");
  }
  switch (error.code) {
    case "INVALID_INPUT":
      return new RuntimeStateUpdateError("INVALID_INPUT");
    case "NOT_FOUND":
    case "CONFLICT":
      return new RuntimeStateUpdateError("CONFLICT");
    case "STORAGE_FAILURE":
      return new RuntimeStateUpdateError("STORAGE_FAILURE");
  }
}

function invalid(): never {
  throw new RuntimeStateUpdateError("INVALID_INPUT");
}
