import { createHash } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { JsonObject, JsonValue } from "./raw-store.js";
import {
  AUTHORITY_NAMESPACE,
  SHADOW_NAMESPACE_PREFIX,
  RevisionSubstrateError,
  SqliteRevisionSubstrate,
  commitStateRevisionInsideCore,
  type RevisionScope,
  type RevisionVector,
} from "./revision-substrate.js";
import { initializeSqliteConnection } from "./sqlite-initialization.js";

export const CANONICAL_STATE_SCHEMA_VERSION = 1;
export const CANONICAL_STATE_POLICY_VERSION = "canonical-state/v1";
export const CANONICAL_STATE_COMMIT_MODES = [
  "immediate_authority",
  "lazy_historical",
  "targeted_on_demand",
] as const;
export const CANONICAL_STATE_ITEM_KINDS = [
  "GOAL",
  "CONSTRAINT",
  "DECISION",
  "OPEN_QUESTION",
  "REJECTED_ALTERNATIVE",
] as const;

export type CanonicalStateCommitMode = (typeof CANONICAL_STATE_COMMIT_MODES)[number];
export type CanonicalStateItemKind = (typeof CANONICAL_STATE_ITEM_KINDS)[number];
export type CanonicalStateItemStatus =
  | "ACTIVE"
  | "COMPLETED"
  | "SUPERSEDED"
  | "OPEN"
  | "DEFERRED"
  | "RESOLVED"
  | "REJECTED";
export type CanonicalStateErrorCode =
  | "INVALID_INPUT"
  | "NOT_FOUND"
  | "CONFLICT"
  | "STORAGE_FAILURE"
  | "CORRUPT_DATA"
  | "CLOSED";

export interface CanonicalStateItem {
  item_id: string;
  kind: CanonicalStateItemKind;
  content: string;
  status: CanonicalStateItemStatus;
  source_event_ids: string[];
  metadata: JsonObject;
}

export interface CanonicalState {
  schema_version: 1;
  items: CanonicalStateItem[];
}

export interface CanonicalStateProposal {
  schema_version: 1;
  upsert_items: CanonicalStateItem[];
}

export interface CanonicalStateCommitInput {
  scope: RevisionScope;
  state_commit_id: string;
  commit_mode: CanonicalStateCommitMode;
  expected_state_revision: number;
  proposal: CanonicalStateProposal;
  policy_hash: string;
  provenance_event_ids: string[];
}

export interface CommittedCanonicalStateRevision extends RevisionScope {
  state_revision: number;
  state_commit_id: string;
  commit_mode: CanonicalStateCommitMode;
  previous_state_revision: number;
  proposal: CanonicalStateProposal;
  state: CanonicalState;
  state_hash: string;
  policy_hash: string;
  provenance_event_ids: string[];
  created_at: string;
}

export interface CanonicalStateProjection extends RevisionScope {
  revision_vector: RevisionVector;
  state_revision: number;
  state: CanonicalState;
  state_hash: string;
  policy_hash: string;
  provenance_event_ids: string[];
  commit?: {
    state_commit_id: string;
    commit_mode: CanonicalStateCommitMode;
    previous_state_revision: number;
    created_at: string;
  };
}

export class CanonicalStateError extends Error {
  constructor(readonly code: CanonicalStateErrorCode) {
    super(code);
    this.name = "CanonicalStateError";
  }
}

interface NormalizedCanonicalStateCommitInput extends CanonicalStateCommitInput {
  request: Record<string, JsonValue>;
}

interface StreamRow extends Record<string, unknown> {
  namespace: string;
  stream_id: string;
  ledger_revision: number;
  state_revision: number;
  raw_frontier_revision: number;
  frontier_position: number;
  takeover_commit_revision: number;
}

interface StateRevisionRow extends Record<string, unknown> {
  namespace: string;
  stream_id: string;
  state_revision: number;
  state_commit_id: string;
  commit_mode: string;
  previous_state_revision: number;
  proposal_json: string;
  state_json: string;
  state_hash: string;
  policy_hash: string;
  provenance_event_ids_json: string;
  created_at: string;
}

interface CommitBindingRow extends Record<string, unknown> {
  operation: string;
  kind: string;
  request_fingerprint: string;
  request_json: string;
  previous_json: string;
  current_json: string;
  result_json: string;
}

const MAX_IDENTIFIER_LENGTH = 500;
const MAX_CONTENT_LENGTH = 10_000;
const MAX_METADATA_STRING_LENGTH = 10_000;
const MAX_UPSERT_ITEMS = 100;
const MAX_ITEM_EVENT_IDS = 100;
const MAX_COMMIT_EVENT_IDS = 1_000;
const MAX_SAFE_REVISION = Number.MAX_SAFE_INTEGER;

const POLICY_DESCRIPTOR: JsonValue = {
  version: CANONICAL_STATE_POLICY_VERSION,
  schema_version: CANONICAL_STATE_SCHEMA_VERSION,
  commit_modes: [...CANONICAL_STATE_COMMIT_MODES],
  item_kinds: [...CANONICAL_STATE_ITEM_KINDS],
  initial_status: {
    GOAL: "ACTIVE",
    CONSTRAINT: "ACTIVE",
    DECISION: "ACTIVE",
    OPEN_QUESTION: "OPEN",
    REJECTED_ALTERNATIVE: "REJECTED",
  },
  transitions: {
    GOAL: ["ACTIVE>COMPLETED", "ACTIVE>SUPERSEDED"],
    CONSTRAINT: ["ACTIVE>SUPERSEDED"],
    DECISION: ["ACTIVE>SUPERSEDED"],
    OPEN_QUESTION: [
      "OPEN>DEFERRED",
      "OPEN>RESOLVED",
      "DEFERRED>OPEN",
      "DEFERRED>RESOLVED",
    ],
    REJECTED_ALTERNATIVE: [],
  },
  normalization: "lexical-item-and-event-id",
  provenance: "same-scope-committed-raw-exact-union-monotonic-per-item",
  delete_policy: "forbidden",
  empty_proposal: "invalid",
  reduced_no_op: "conflict",
  string_policy: "nfc-no-unicode-cc",
  bounds: {
    identifier: MAX_IDENTIFIER_LENGTH,
    content: MAX_CONTENT_LENGTH,
    upsert_items: MAX_UPSERT_ITEMS,
    item_event_ids: MAX_ITEM_EVENT_IDS,
    commit_event_ids: MAX_COMMIT_EVENT_IDS,
  },
};

export const CANONICAL_STATE_POLICY_HASH = sha256(canonicalJson(POLICY_DESCRIPTOR));

const EMPTY_CANONICAL_STATE: CanonicalState = { schema_version: 1, items: [] };
const EMPTY_CANONICAL_STATE_HASH = sha256(canonicalJson(stateAsJson(EMPTY_CANONICAL_STATE)));

const CANONICAL_STATE_SCHEMA_OBJECTS = [
  {
    type: "table",
    name: "cc_canonical_state_schema",
    sql: `CREATE TABLE cc_canonical_state_schema (
      version INTEGER PRIMARY KEY CHECK (version > 0),
      completed_at TEXT NOT NULL
    )`,
  },
  {
    type: "table",
    name: "cc_canonical_state_revisions",
    sql: `CREATE TABLE cc_canonical_state_revisions (
      namespace TEXT NOT NULL,
      stream_id TEXT NOT NULL,
      state_revision INTEGER NOT NULL CHECK (
        state_revision > 0 AND state_revision <= 9007199254740991
      ),
      state_commit_id TEXT NOT NULL CHECK (
        length(state_commit_id) > 0 AND length(state_commit_id) <= 500
      ),
      commit_mode TEXT NOT NULL CHECK (
        commit_mode IN ('immediate_authority','lazy_historical','targeted_on_demand')
      ),
      previous_state_revision INTEGER NOT NULL CHECK (
        previous_state_revision >= 0 AND previous_state_revision <= 9007199254740991
      ),
      proposal_json TEXT NOT NULL CHECK (json_valid(proposal_json)),
      state_json TEXT NOT NULL CHECK (json_valid(state_json)),
      state_hash TEXT NOT NULL CHECK (
        length(state_hash) = 64 AND state_hash NOT GLOB '*[^0-9a-f]*'
      ),
      policy_hash TEXT NOT NULL CHECK (policy_hash = '${CANONICAL_STATE_POLICY_HASH}'),
      provenance_event_ids_json TEXT NOT NULL CHECK (json_valid(provenance_event_ids_json)),
      created_at TEXT NOT NULL,
      PRIMARY KEY (namespace, stream_id, state_revision),
      UNIQUE (namespace, stream_id, state_commit_id),
      FOREIGN KEY (namespace, stream_id)
        REFERENCES cc_revision_streams(namespace, stream_id),
      CHECK (state_revision = previous_state_revision + 1)
    )`,
  },
  {
    type: "trigger",
    name: "cc_canonical_state_revisions_no_update",
    sql: `CREATE TRIGGER cc_canonical_state_revisions_no_update
      BEFORE UPDATE ON cc_canonical_state_revisions
      BEGIN
        SELECT RAISE(ABORT, 'canonical state revisions are immutable');
      END`,
  },
  {
    type: "trigger",
    name: "cc_canonical_state_revisions_no_delete",
    sql: `CREATE TRIGGER cc_canonical_state_revisions_no_delete
      BEFORE DELETE ON cc_canonical_state_revisions
      BEGIN
        SELECT RAISE(ABORT, 'canonical state revisions are append-only');
      END`,
  },
  {
    type: "trigger",
    name: "cc_canonical_state_schema_no_update",
    sql: `CREATE TRIGGER cc_canonical_state_schema_no_update
      BEFORE UPDATE ON cc_canonical_state_schema
      BEGIN
        SELECT RAISE(ABORT, 'canonical state schema markers are immutable');
      END`,
  },
  {
    type: "trigger",
    name: "cc_canonical_state_schema_no_delete",
    sql: `CREATE TRIGGER cc_canonical_state_schema_no_delete
      BEFORE DELETE ON cc_canonical_state_schema
      BEGIN
        SELECT RAISE(ABORT, 'canonical state schema markers are append-only');
      END`,
  },
] as const;

/** @internal Core-owned canonical State authority writer and reader. */
export class SqliteCanonicalStateStore {
  readonly #database: DatabaseSync;
  readonly #revisionSubstrate: SqliteRevisionSubstrate;
  #closed = false;

  constructor(databasePath: string, revisionSubstrate: SqliteRevisionSubstrate) {
    if (typeof databasePath !== "string" || databasePath.length === 0) invalid();
    if (!(revisionSubstrate instanceof SqliteRevisionSubstrate)) invalid();
    let database: DatabaseSync | undefined;
    try {
      if (databasePath !== ":memory:") mkdirSync(dirname(databasePath), { recursive: true });
      database = new DatabaseSync(databasePath);
      initializeSqliteConnection(database, databasePath, () => {
        migrateCanonicalState(database!);
      });
      this.#database = database;
      this.#revisionSubstrate = revisionSubstrate;
    } catch (error) {
      try { database?.close(); } catch { /* preserve stable constructor failure */ }
      if (error instanceof CanonicalStateError && error.code === "INVALID_INPUT") throw error;
      throw new CanonicalStateError("STORAGE_FAILURE");
    }
  }

  commit(input: CanonicalStateCommitInput): CommittedCanonicalStateRevision {
    this.#assertOpen();
    const normalized = normalizeCommitInput(input);
    try {
      const record = commitStateRevisionInsideCore(
        this.#revisionSubstrate,
        {
          scope: normalized.scope,
          commit_id: normalized.state_commit_id,
          kind: "CANONICAL_STATE_COMMIT_V1",
          expected_state_revision: normalized.expected_state_revision,
          request: normalized.request,
        },
        ({ previous, current, database }) => {
          if (normalized.policy_hash !== CANONICAL_STATE_POLICY_HASH) invalid();
          const previousState = previous.state_revision === 0
            ? cloneState(EMPTY_CANONICAL_STATE)
            : this.#readStateInsideTransaction(database, normalized.scope, previous.state_revision);
          assertCommittedProvenance(
            database,
            normalized.scope,
            normalized.provenance_event_ids,
            previous.ledger_revision
          );
          const nextState = reduceState(previousState, normalized.proposal);
          if (canonicalJson(stateAsJson(nextState)) === canonicalJson(stateAsJson(previousState))) {
            conflict();
          }
          const createdAt = new Date().toISOString();
          const committed: CommittedCanonicalStateRevision = {
            ...normalized.scope,
            state_revision: current.state_revision,
            state_commit_id: normalized.state_commit_id,
            commit_mode: normalized.commit_mode,
            previous_state_revision: previous.state_revision,
            proposal: cloneProposal(normalized.proposal),
            state: cloneState(nextState),
            state_hash: sha256(canonicalJson(stateAsJson(nextState))),
            policy_hash: CANONICAL_STATE_POLICY_HASH,
            provenance_event_ids: [...normalized.provenance_event_ids],
            created_at: createdAt,
          };
          database.prepare(
            `INSERT INTO cc_canonical_state_revisions (
               namespace, stream_id, state_revision, state_commit_id, commit_mode,
               previous_state_revision, proposal_json, state_json, state_hash,
               policy_hash, provenance_event_ids_json, created_at
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          ).run(
            committed.namespace,
            committed.stream_id,
            committed.state_revision,
            committed.state_commit_id,
            committed.commit_mode,
            committed.previous_state_revision,
            canonicalJson(proposalAsJson(committed.proposal)),
            canonicalJson(stateAsJson(committed.state)),
            committed.state_hash,
            committed.policy_hash,
            canonicalJson(committed.provenance_event_ids),
            committed.created_at
          );
          return committedAsJson(committed);
        }
      );
      const replayed = parseCommittedValue(record.result);
      if (
        replayed.state_revision !== record.current.state_revision ||
        replayed.previous_state_revision !== record.previous.state_revision
      ) corrupt();
      const persisted = this.#readCommitted(replayed, replayed.state_revision);
      if (canonicalJson(committedAsJson(persisted)) !== canonicalJson(committedAsJson(replayed))) {
        corrupt();
      }
      return persisted;
    } catch (error) {
      throw mapMutationError(error);
    }
  }

  readLatest(scope: RevisionScope): CanonicalStateProjection {
    this.#assertOpen();
    const normalizedScope = normalizeScope(scope);
    try {
      this.#database.exec("BEGIN;");
      const stream = this.#database.prepare(
        `SELECT namespace, stream_id, ledger_revision, state_revision,
                raw_frontier_revision, frontier_position, takeover_commit_revision
         FROM cc_revision_streams
         WHERE namespace = ? AND stream_id = ?`
      ).get(normalizedScope.namespace, normalizedScope.stream_id) as StreamRow | undefined;
      const vector = stream === undefined
        ? zeroVector(normalizedScope)
        : vectorFromRow(stream, normalizedScope);
      let projection: CanonicalStateProjection;
      if (vector.state_revision === 0) {
        const unexpected = this.#database.prepare(
          `SELECT state_revision FROM cc_canonical_state_revisions
           WHERE namespace = ? AND stream_id = ? LIMIT 1`
        ).get(normalizedScope.namespace, normalizedScope.stream_id);
        if (unexpected !== undefined) corrupt();
        projection = zeroProjection(normalizedScope, vector);
      } else {
        const committed = this.#readCommittedInsideTransaction(
          this.#database,
          normalizedScope,
          vector.state_revision
        );
        projection = projectionFromCommitted(committed, vector);
      }
      this.#database.exec("COMMIT;");
      return projection;
    } catch (error) {
      rollback(this.#database);
      if (error instanceof CanonicalStateError) throw error;
      throw new CanonicalStateError("STORAGE_FAILURE");
    }
  }

  readRevision(scope: RevisionScope, stateRevision: number): CommittedCanonicalStateRevision {
    this.#assertOpen();
    const normalizedScope = normalizeScope(scope);
    const normalizedRevision = validatePositiveRevision(stateRevision);
    try {
      this.#database.exec("BEGIN;");
      const committed = this.#readCommitted(normalizedScope, normalizedRevision);
      this.#database.exec("COMMIT;");
      return committed;
    } catch (error) {
      rollback(this.#database);
      if (error instanceof CanonicalStateError) throw error;
      throw new CanonicalStateError("STORAGE_FAILURE");
    }
  }

  close(): void {
    if (this.#closed) return;
    try {
      this.#database.close();
      this.#closed = true;
    } catch {
      throw new CanonicalStateError("STORAGE_FAILURE");
    }
  }

  #readCommitted(
    scope: RevisionScope,
    stateRevision: number
  ): CommittedCanonicalStateRevision {
    return this.#readCommittedInsideTransaction(this.#database, scope, stateRevision);
  }

  #readCommittedInsideTransaction(
    database: DatabaseSync,
    scope: RevisionScope,
    stateRevision: number
  ): CommittedCanonicalStateRevision {
    const row = database.prepare(
      `SELECT namespace, stream_id, state_revision, state_commit_id, commit_mode,
              previous_state_revision, proposal_json, state_json, state_hash,
              policy_hash, provenance_event_ids_json, created_at
       FROM cc_canonical_state_revisions
       WHERE namespace = ? AND stream_id = ? AND state_revision = ?`
    ).get(scope.namespace, scope.stream_id, stateRevision) as StateRevisionRow | undefined;
    if (row === undefined) notFound();
    const committed = committedFromRow(row, scope);
    this.#assertMarkerBinding(database, committed);
    const previousState = committed.previous_state_revision === 0
      ? cloneState(EMPTY_CANONICAL_STATE)
      : this.#readStateInsideTransaction(database, scope, committed.previous_state_revision);
    const expected = reduceStoredState(previousState, committed.proposal);
    if (canonicalJson(stateAsJson(expected)) !== canonicalJson(stateAsJson(committed.state))) {
      corrupt();
    }
    return committed;
  }

  #assertMarkerBinding(
    database: DatabaseSync,
    committed: CommittedCanonicalStateRevision
  ): void {
    const marker = database.prepare(
      `SELECT operation, kind, request_fingerprint, request_json,
              previous_json, current_json, result_json
       FROM cc_revision_commits
       WHERE namespace = ? AND stream_id = ? AND commit_id = ?`
    ).get(
      committed.namespace,
      committed.stream_id,
      committed.state_commit_id
    ) as CommitBindingRow | undefined;
    if (marker === undefined || marker.operation !== "STATE" ||
        marker.kind !== "CANONICAL_STATE_COMMIT_V1") corrupt();
    const previous = parseStoredVector(marker.previous_json, committed);
    const current = parseStoredVector(marker.current_json, committed);
    if (
      previous.state_revision !== committed.previous_state_revision ||
      current.state_revision !== committed.state_revision ||
      current.state_revision !== previous.state_revision + 1 ||
      !sameNonStateAxes(previous, current)
    ) corrupt();
    const expectedRequest = canonicalStateMarkerRequest(committed);
    const expectedRequestJson = canonicalJson(expectedRequest);
    if (
      marker.request_json !== expectedRequestJson ||
      storedHash(marker.request_fingerprint) !== sha256(expectedRequestJson)
    ) corrupt();
    assertStoredProvenanceBound(
      database,
      committed,
      committed.provenance_event_ids,
      current.ledger_revision
    );
    const live = readLiveVector(database, committed);
    if (!vectorAtOrAfter(live, current)) corrupt();
    const result = parseStoredJson(marker.result_json);
    if (canonicalJson(result) !== canonicalJson(committedAsJson(committed))) corrupt();
  }

  #readStateInsideTransaction(
    database: DatabaseSync,
    scope: RevisionScope,
    stateRevision: number
  ): CanonicalState {
    const row = database.prepare(
      `SELECT state_json, state_hash FROM cc_canonical_state_revisions
       WHERE namespace = ? AND stream_id = ? AND state_revision = ?`
    ).get(scope.namespace, scope.stream_id, stateRevision) as {
      state_json: string;
      state_hash: string;
    } | undefined;
    if (row === undefined) corrupt();
    const state = parseStoredState(row.state_json);
    if (storedHash(row.state_hash) !== sha256(canonicalJson(stateAsJson(state)))) corrupt();
    return state;
  }

  #assertOpen(): void {
    if (this.#closed) throw new CanonicalStateError("CLOSED");
  }
}

export function migrateCanonicalState(database: DatabaseSync): void {
  database.exec("BEGIN IMMEDIATE;");
  try {
    if (sqliteObjectExists(database, "table", "cc_canonical_state_schema")) {
      validateCanonicalStateSchema(database);
      assertCurrentSchemaVersion(database);
      database.exec("COMMIT;");
      return;
    }
    for (const object of CANONICAL_STATE_SCHEMA_OBJECTS.slice(1)) {
      if (sqliteObjectExists(database, object.type, object.name)) corrupt();
    }
    database.exec(CANONICAL_STATE_SCHEMA_OBJECTS.map(({ sql }) => `${sql};`).join("\n"));
    validateCanonicalStateSchema(database);
    database.prepare(
      "INSERT INTO cc_canonical_state_schema (version, completed_at) VALUES (?, ?)"
    ).run(CANONICAL_STATE_SCHEMA_VERSION, new Date().toISOString());
    assertCurrentSchemaVersion(database);
    database.exec("COMMIT;");
  } catch (error) {
    rollback(database);
    throw error;
  }
}

function normalizeCommitInput(value: unknown): NormalizedCanonicalStateCommitInput {
  const input = readExactObject(value, [
    "scope",
    "state_commit_id",
    "commit_mode",
    "expected_state_revision",
    "proposal",
    "policy_hash",
    "provenance_event_ids",
  ]);
  const scope = normalizeScope(input.scope);
  const stateCommitId = validateIdentifier(input.state_commit_id);
  const commitMode = input.commit_mode;
  if (typeof commitMode !== "string" ||
      !CANONICAL_STATE_COMMIT_MODES.includes(commitMode as CanonicalStateCommitMode)) invalid();
  const expectedStateRevision = validateRevision(input.expected_state_revision);
  const proposal = normalizeProposal(input.proposal);
  const policyHash = input.policy_hash;
  if (typeof policyHash !== "string" || !/^[a-f0-9]{64}$/u.test(policyHash)) invalid();
  const provenanceEventIds = normalizeIdentifierArray(
    input.provenance_event_ids,
    1,
    MAX_COMMIT_EVENT_IDS
  );
  const proposalEventIds = [...new Set(
    proposal.upsert_items.flatMap((item) => item.source_event_ids)
  )].sort();
  if (!sameStrings(provenanceEventIds, proposalEventIds)) invalid();
  const request: Record<string, JsonValue> = {
    commit_mode: commitMode as CanonicalStateCommitMode,
    expected_state_revision: expectedStateRevision,
    proposal: proposalAsJson(proposal),
    policy_hash: policyHash,
    provenance_event_ids: [...provenanceEventIds],
  };
  return {
    scope,
    state_commit_id: stateCommitId,
    commit_mode: commitMode as CanonicalStateCommitMode,
    expected_state_revision: expectedStateRevision,
    proposal,
    policy_hash: policyHash,
    provenance_event_ids: provenanceEventIds,
    request,
  };
}

function normalizeProposal(value: unknown): CanonicalStateProposal {
  const proposal = readExactObject(value, ["schema_version", "upsert_items"]);
  if (proposal.schema_version !== 1 || !Array.isArray(proposal.upsert_items)) invalid();
  assertDensePlainArray(proposal.upsert_items);
  if (proposal.upsert_items.length < 1 || proposal.upsert_items.length > MAX_UPSERT_ITEMS) {
    invalid();
  }
  const items = proposal.upsert_items.map(normalizeItem).sort(compareItems);
  for (let index = 1; index < items.length; index += 1) {
    if (items[index - 1]?.item_id === items[index]?.item_id) invalid();
  }
  return { schema_version: 1, upsert_items: items };
}

function normalizeState(value: unknown): CanonicalState {
  const state = readExactObject(value, ["schema_version", "items"]);
  if (state.schema_version !== 1 || !Array.isArray(state.items)) invalid();
  assertDensePlainArray(state.items);
  const items = state.items.map(normalizeItem);
  if (items.length > MAX_SAFE_REVISION) invalid();
  const sorted = [...items].sort(compareItems);
  if (!sameItems(items, sorted)) invalid();
  for (let index = 1; index < items.length; index += 1) {
    if (items[index - 1]?.item_id === items[index]?.item_id) invalid();
  }
  return { schema_version: 1, items };
}

function normalizeItem(value: unknown): CanonicalStateItem {
  const item = readExactObject(value, [
    "item_id", "kind", "content", "status", "source_event_ids", "metadata",
  ]);
  const itemId = validateIdentifier(item.item_id);
  const kind = item.kind;
  if (typeof kind !== "string" ||
      !CANONICAL_STATE_ITEM_KINDS.includes(kind as CanonicalStateItemKind)) invalid();
  const content = validateText(item.content, MAX_CONTENT_LENGTH);
  const status = item.status;
  if (typeof status !== "string" || !isStatusForKind(kind as CanonicalStateItemKind, status)) {
    invalid();
  }
  const sourceEventIds = normalizeIdentifierArray(
    item.source_event_ids,
    1,
    MAX_ITEM_EVENT_IDS
  );
  const metadata = normalizeMetadata(item.metadata);
  return {
    item_id: itemId,
    kind: kind as CanonicalStateItemKind,
    content,
    status: status as CanonicalStateItemStatus,
    source_event_ids: sourceEventIds,
    metadata,
  };
}

function reduceState(previous: CanonicalState, proposal: CanonicalStateProposal): CanonicalState {
  const byId = new Map(previous.items.map((item) => [item.item_id, cloneItem(item)]));
  for (const next of proposal.upsert_items) {
    const existing = byId.get(next.item_id);
    if (existing === undefined) {
      if (next.status !== initialStatus(next.kind)) conflict();
      byId.set(next.item_id, cloneItem(next));
      continue;
    }
    if (existing.kind !== next.kind) conflict();
    if (!isAllowedTransition(existing.kind, existing.status, next.status)) conflict();
    if (existing.source_event_ids.some((eventId) => !next.source_event_ids.includes(eventId))) {
      conflict();
    }
    if (canonicalJson(itemAsJson(existing)) === canonicalJson(itemAsJson(next))) conflict();
    byId.set(next.item_id, cloneItem(next));
  }
  return {
    schema_version: 1,
    items: [...byId.values()].sort(compareItems),
  };
}

function reduceStoredState(
  previous: CanonicalState,
  proposal: CanonicalStateProposal
): CanonicalState {
  try {
    return reduceState(previous, proposal);
  } catch {
    corrupt();
  }
}

function initialStatus(kind: CanonicalStateItemKind): CanonicalStateItemStatus {
  switch (kind) {
    case "GOAL":
    case "CONSTRAINT":
    case "DECISION": return "ACTIVE";
    case "OPEN_QUESTION": return "OPEN";
    case "REJECTED_ALTERNATIVE": return "REJECTED";
  }
}

function isStatusForKind(kind: CanonicalStateItemKind, status: string): boolean {
  switch (kind) {
    case "GOAL": return ["ACTIVE", "COMPLETED", "SUPERSEDED"].includes(status);
    case "CONSTRAINT":
    case "DECISION": return ["ACTIVE", "SUPERSEDED"].includes(status);
    case "OPEN_QUESTION": return ["OPEN", "DEFERRED", "RESOLVED"].includes(status);
    case "REJECTED_ALTERNATIVE": return status === "REJECTED";
  }
}

function isAllowedTransition(
  kind: CanonicalStateItemKind,
  previous: CanonicalStateItemStatus,
  next: CanonicalStateItemStatus
): boolean {
  if (previous === next) return true;
  switch (kind) {
    case "GOAL": return previous === "ACTIVE" && ["COMPLETED", "SUPERSEDED"].includes(next);
    case "CONSTRAINT":
    case "DECISION": return previous === "ACTIVE" && next === "SUPERSEDED";
    case "OPEN_QUESTION":
      return (previous === "OPEN" && ["DEFERRED", "RESOLVED"].includes(next)) ||
        (previous === "DEFERRED" && ["OPEN", "RESOLVED"].includes(next));
    case "REJECTED_ALTERNATIVE": return false;
  }
}

function assertCommittedProvenance(
  database: DatabaseSync,
  scope: RevisionScope,
  eventIds: readonly string[],
  ledgerHighWater: number
): void {
  const query = database.prepare(
    `SELECT ledger_revision FROM cc_ledger_raw_events
     WHERE namespace = ? AND stream_id = ? AND event_id = ?`
  );
  for (const eventId of eventIds) {
    const row = query.get(scope.namespace, scope.stream_id, eventId) as {
      ledger_revision: number;
    } | undefined;
    if (row === undefined) conflict();
    const ledgerRevision = validateStoredRevision(row.ledger_revision, true);
    if (ledgerRevision > ledgerHighWater) conflict();
  }
}

function assertStoredProvenanceBound(
  database: DatabaseSync,
  scope: RevisionScope,
  eventIds: readonly string[],
  ledgerHighWater: number
): void {
  const query = database.prepare(
    `SELECT ledger_revision FROM cc_ledger_raw_events
     WHERE namespace = ? AND stream_id = ? AND event_id = ?`
  );
  for (const eventId of eventIds) {
    const row = query.get(scope.namespace, scope.stream_id, eventId) as {
      ledger_revision: number;
    } | undefined;
    if (row === undefined || validateStoredRevision(row.ledger_revision, true) > ledgerHighWater) {
      corrupt();
    }
  }
}

function normalizeScope(value: unknown): RevisionScope {
  const scope = readExactObject(value, ["namespace", "stream_id"]);
  const namespace = validateIdentifier(scope.namespace);
  if (
    namespace !== AUTHORITY_NAMESPACE &&
    !(namespace.startsWith(SHADOW_NAMESPACE_PREFIX) &&
      namespace.slice(SHADOW_NAMESPACE_PREFIX.length).trim().length > 0)
  ) invalid();
  return { namespace, stream_id: validateIdentifier(scope.stream_id) };
}

function validateIdentifier(value: unknown): string {
  return validateText(value, MAX_IDENTIFIER_LENGTH);
}

function validateText(value: unknown, maximum: number): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > maximum ||
    value.trim().length === 0 ||
    value !== value.normalize("NFC") ||
    /\p{Cc}/u.test(value)
  ) invalid();
  return value;
}

function validateRevision(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0 ||
      (value as number) > MAX_SAFE_REVISION) invalid();
  return value as number;
}

function validatePositiveRevision(value: unknown): number {
  const revision = validateRevision(value);
  if (revision < 1) invalid();
  return revision;
}

function normalizeIdentifierArray(value: unknown, minimum: number, maximum: number): string[] {
  if (!Array.isArray(value)) invalid();
  assertDensePlainArray(value);
  if (value.length < minimum || value.length > maximum) invalid();
  const normalized = value.map(validateIdentifier).sort();
  for (let index = 1; index < normalized.length; index += 1) {
    if (normalized[index - 1] === normalized[index]) invalid();
  }
  return normalized;
}

function normalizeMetadata(value: unknown): JsonObject {
  const normalized = normalizeJsonValue(value);
  if (normalized === null || typeof normalized !== "object" || Array.isArray(normalized)) invalid();
  return normalized;
}

function normalizeJsonValue(value: unknown, ancestors = new Set<object>()): JsonValue {
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "string") {
    if (value.length > MAX_METADATA_STRING_LENGTH || value !== value.normalize("NFC") ||
        /\p{Cc}/u.test(value)) invalid();
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value) || Object.is(value, -0)) invalid();
    return value;
  }
  if (typeof value !== "object" || ancestors.has(value)) invalid();
  const prototype = Object.getPrototypeOf(value);
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      if (prototype !== Array.prototype) invalid();
      assertDensePlainArray(value);
      return value.map((item) => normalizeJsonValue(item, ancestors));
    }
    if (prototype !== Object.prototype && prototype !== null) invalid();
    const result: JsonObject = {};
    const keys = Reflect.ownKeys(value);
    if (keys.some((key) => typeof key !== "string")) invalid();
    for (const key of (keys as string[]).sort()) {
      validateText(key, MAX_IDENTIFIER_LENGTH);
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor?.enumerable || !("value" in descriptor)) invalid();
      Object.defineProperty(result, key, {
        configurable: true,
        enumerable: true,
        writable: true,
        value: normalizeJsonValue(descriptor.value, ancestors),
      });
    }
    return result;
  } finally {
    ancestors.delete(value);
  }
}

function assertDensePlainArray(value: unknown[]): void {
  if (Object.getPrototypeOf(value) !== Array.prototype) invalid();
  for (const key of Reflect.ownKeys(value)) {
    if (key === "length") continue;
    if (typeof key !== "string" || !/^(0|[1-9][0-9]*)$/u.test(key)) invalid();
    const index = Number(key);
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!Number.isSafeInteger(index) || index < 0 || index >= value.length ||
        !descriptor?.enumerable || !("value" in descriptor)) invalid();
  }
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.prototype.hasOwnProperty.call(value, index)) invalid();
  }
}

function readExactObject(value: unknown, expectedKeys: readonly string[]): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) invalid();
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) invalid();
  const expected = new Set(expectedKeys);
  const keys = Reflect.ownKeys(value);
  if (keys.length !== expectedKeys.length) invalid();
  for (const key of keys) {
    if (typeof key !== "string" || !expected.has(key)) invalid();
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor?.enumerable || !("value" in descriptor)) invalid();
  }
  for (const key of expectedKeys) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) invalid();
  }
  return value as Record<string, unknown>;
}

function committedFromRow(
  row: StateRevisionRow,
  expectedScope: RevisionScope
): CommittedCanonicalStateRevision {
  try {
    const scope = storedScope(row.namespace, row.stream_id);
    if (scope.namespace !== expectedScope.namespace || scope.stream_id !== expectedScope.stream_id) {
      corrupt();
    }
    const revision = validateStoredRevision(row.state_revision, true);
    const previousRevision = validateStoredRevision(row.previous_state_revision);
    if (revision !== previousRevision + 1) corrupt();
    const proposal = parseStoredProposal(row.proposal_json);
    const state = parseStoredState(row.state_json);
    const stateHash = storedHash(row.state_hash);
    if (stateHash !== sha256(canonicalJson(stateAsJson(state)))) corrupt();
    const policyHash = storedHash(row.policy_hash);
    if (policyHash !== CANONICAL_STATE_POLICY_HASH) corrupt();
    const provenance = parseStoredIdentifierArray(
      row.provenance_event_ids_json,
      1,
      MAX_COMMIT_EVENT_IDS
    );
    const union = [...new Set(proposal.upsert_items.flatMap((item) => item.source_event_ids))]
      .sort();
    if (!sameStrings(provenance, union)) corrupt();
    return {
      ...scope,
      state_revision: revision,
      state_commit_id: storedIdentifier(row.state_commit_id),
      commit_mode: storedCommitMode(row.commit_mode),
      previous_state_revision: previousRevision,
      proposal,
      state,
      state_hash: stateHash,
      policy_hash: policyHash,
      provenance_event_ids: provenance,
      created_at: storedTimestamp(row.created_at),
    };
  } catch (error) {
    if (error instanceof CanonicalStateError && error.code === "CORRUPT_DATA") throw error;
    corrupt();
  }
}

function parseCommittedValue(value: JsonValue): CommittedCanonicalStateRevision {
  try {
    const object = readExactObject(value, [
      "namespace", "stream_id", "state_revision", "state_commit_id", "commit_mode",
      "previous_state_revision", "proposal", "state", "state_hash", "policy_hash",
      "provenance_event_ids", "created_at",
    ]);
    return committedFromRow({
      namespace: storedString(object.namespace),
      stream_id: storedString(object.stream_id),
      state_revision: storedNumber(object.state_revision),
      state_commit_id: storedString(object.state_commit_id),
      commit_mode: storedString(object.commit_mode),
      previous_state_revision: storedNumber(object.previous_state_revision),
      proposal_json: canonicalJson(object.proposal as JsonValue),
      state_json: canonicalJson(object.state as JsonValue),
      state_hash: storedString(object.state_hash),
      policy_hash: storedString(object.policy_hash),
      provenance_event_ids_json: canonicalJson(object.provenance_event_ids as JsonValue),
      created_at: storedString(object.created_at),
    }, {
      namespace: storedString(object.namespace),
      stream_id: storedString(object.stream_id),
    });
  } catch (error) {
    if (error instanceof CanonicalStateError && error.code === "CORRUPT_DATA") throw error;
    corrupt();
  }
}

function parseStoredProposal(json: string): CanonicalStateProposal {
  try {
    const proposal = normalizeProposal(JSON.parse(json));
    if (canonicalJson(proposalAsJson(proposal)) !== json) corrupt();
    return proposal;
  } catch (error) {
    if (error instanceof CanonicalStateError && error.code === "CORRUPT_DATA") throw error;
    corrupt();
  }
}

function parseStoredState(json: string): CanonicalState {
  try {
    const state = normalizeState(JSON.parse(json));
    if (canonicalJson(stateAsJson(state)) !== json) corrupt();
    return state;
  } catch (error) {
    if (error instanceof CanonicalStateError && error.code === "CORRUPT_DATA") throw error;
    corrupt();
  }
}

function parseStoredIdentifierArray(json: string, minimum: number, maximum: number): string[] {
  try {
    const ids = normalizeIdentifierArray(JSON.parse(json), minimum, maximum);
    if (canonicalJson(ids) !== json) corrupt();
    return ids;
  } catch (error) {
    if (error instanceof CanonicalStateError && error.code === "CORRUPT_DATA") throw error;
    corrupt();
  }
}

function parseStoredJson(json: string): JsonValue {
  try {
    const value = normalizeJsonValue(JSON.parse(json));
    if (canonicalJson(value) !== json) corrupt();
    return value;
  } catch (error) {
    if (error instanceof CanonicalStateError && error.code === "CORRUPT_DATA") throw error;
    corrupt();
  }
}

function parseStoredVector(json: string, scope: RevisionScope): RevisionVector {
  try {
    const value = parseStoredJson(json);
    const object = readExactObject(value, [
      "namespace", "stream_id", "ledger_revision", "state_revision",
      "raw_frontier_revision", "frontier_position", "takeover_commit_revision",
    ]);
    return vectorFromRow({
      namespace: storedString(object.namespace),
      stream_id: storedString(object.stream_id),
      ledger_revision: storedNumber(object.ledger_revision),
      state_revision: storedNumber(object.state_revision),
      raw_frontier_revision: storedNumber(object.raw_frontier_revision),
      frontier_position: storedNumber(object.frontier_position),
      takeover_commit_revision: storedNumber(object.takeover_commit_revision),
    }, scope);
  } catch (error) {
    if (error instanceof CanonicalStateError && error.code === "CORRUPT_DATA") throw error;
    corrupt();
  }
}

function committedAsJson(committed: CommittedCanonicalStateRevision): JsonValue {
  return {
    namespace: committed.namespace,
    stream_id: committed.stream_id,
    state_revision: committed.state_revision,
    state_commit_id: committed.state_commit_id,
    commit_mode: committed.commit_mode,
    previous_state_revision: committed.previous_state_revision,
    proposal: proposalAsJson(committed.proposal),
    state: stateAsJson(committed.state),
    state_hash: committed.state_hash,
    policy_hash: committed.policy_hash,
    provenance_event_ids: [...committed.provenance_event_ids],
    created_at: committed.created_at,
  };
}

function canonicalStateMarkerRequest(
  committed: CommittedCanonicalStateRevision
): JsonValue {
  return {
    scope: {
      namespace: committed.namespace,
      stream_id: committed.stream_id,
    },
    commit_id: committed.state_commit_id,
    operation: "STATE",
    kind: "CANONICAL_STATE_COMMIT_V1",
    request: {
      commit_mode: committed.commit_mode,
      expected_state_revision: committed.previous_state_revision,
      proposal: proposalAsJson(committed.proposal),
      policy_hash: committed.policy_hash,
      provenance_event_ids: [...committed.provenance_event_ids],
    },
    expected_state_revision: committed.previous_state_revision,
  };
}

function proposalAsJson(proposal: CanonicalStateProposal): JsonValue {
  return {
    schema_version: 1,
    upsert_items: proposal.upsert_items.map(itemAsJson),
  };
}

function stateAsJson(state: CanonicalState): JsonValue {
  return { schema_version: 1, items: state.items.map(itemAsJson) };
}

function itemAsJson(item: CanonicalStateItem): JsonValue {
  return {
    item_id: item.item_id,
    kind: item.kind,
    content: item.content,
    status: item.status,
    source_event_ids: [...item.source_event_ids],
    metadata: cloneJsonObject(item.metadata),
  };
}

function projectionFromCommitted(
  committed: CommittedCanonicalStateRevision,
  vector: RevisionVector
): CanonicalStateProjection {
  if (committed.state_revision !== vector.state_revision) corrupt();
  return {
    namespace: committed.namespace,
    stream_id: committed.stream_id,
    revision_vector: cloneVector(vector),
    state_revision: committed.state_revision,
    state: cloneState(committed.state),
    state_hash: committed.state_hash,
    policy_hash: committed.policy_hash,
    provenance_event_ids: [...committed.provenance_event_ids],
    commit: {
      state_commit_id: committed.state_commit_id,
      commit_mode: committed.commit_mode,
      previous_state_revision: committed.previous_state_revision,
      created_at: committed.created_at,
    },
  };
}

function zeroProjection(scope: RevisionScope, vector: RevisionVector): CanonicalStateProjection {
  return {
    ...scope,
    revision_vector: cloneVector(vector),
    state_revision: 0,
    state: cloneState(EMPTY_CANONICAL_STATE),
    state_hash: EMPTY_CANONICAL_STATE_HASH,
    policy_hash: CANONICAL_STATE_POLICY_HASH,
    provenance_event_ids: [],
  };
}

function cloneProposal(proposal: CanonicalStateProposal): CanonicalStateProposal {
  return { schema_version: 1, upsert_items: proposal.upsert_items.map(cloneItem) };
}

function cloneState(state: CanonicalState): CanonicalState {
  return { schema_version: 1, items: state.items.map(cloneItem) };
}

function cloneItem(item: CanonicalStateItem): CanonicalStateItem {
  return {
    ...item,
    source_event_ids: [...item.source_event_ids],
    metadata: cloneJsonObject(item.metadata),
  };
}

function cloneJsonObject(value: JsonObject): JsonObject {
  return normalizeMetadata(value);
}

function compareItems(left: CanonicalStateItem, right: CanonicalStateItem): number {
  return left.item_id < right.item_id ? -1 : left.item_id > right.item_id ? 1 : 0;
}

function sameItems(left: readonly CanonicalStateItem[], right: readonly CanonicalStateItem[]): boolean {
  return canonicalJson(left.map(itemAsJson)) === canonicalJson(right.map(itemAsJson));
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function canonicalJson(value: JsonValue): string {
  return JSON.stringify(normalizeJsonValue(value));
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function storedScope(namespace: unknown, streamId: unknown): RevisionScope {
  try {
    return normalizeScope({ namespace, stream_id: streamId });
  } catch {
    corrupt();
  }
}

function storedIdentifier(value: unknown): string {
  try {
    return validateIdentifier(value);
  } catch {
    corrupt();
  }
}

function storedCommitMode(value: unknown): CanonicalStateCommitMode {
  if (typeof value !== "string" ||
      !CANONICAL_STATE_COMMIT_MODES.includes(value as CanonicalStateCommitMode)) corrupt();
  return value as CanonicalStateCommitMode;
}

function storedHash(value: unknown): string {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/u.test(value)) corrupt();
  return value;
}

function storedTimestamp(value: unknown): string {
  if (typeof value !== "string" || value.length > 100) corrupt();
  try {
    if (new Date(value).toISOString() !== value) corrupt();
  } catch {
    corrupt();
  }
  return value;
}

function storedString(value: unknown): string {
  if (typeof value !== "string") corrupt();
  return value;
}

function storedNumber(value: unknown): number {
  if (typeof value !== "number") corrupt();
  return value;
}

function validateStoredRevision(value: unknown, positive = false): number {
  if (!Number.isSafeInteger(value) || (value as number) < (positive ? 1 : 0) ||
      (value as number) > MAX_SAFE_REVISION) corrupt();
  return value as number;
}

function vectorFromRow(row: StreamRow, expectedScope: RevisionScope): RevisionVector {
  const scope = storedScope(row.namespace, row.stream_id);
  if (scope.namespace !== expectedScope.namespace || scope.stream_id !== expectedScope.stream_id) {
    corrupt();
  }
  const vector: RevisionVector = {
    ...scope,
    ledger_revision: validateStoredRevision(row.ledger_revision),
    state_revision: validateStoredRevision(row.state_revision),
    raw_frontier_revision: validateStoredRevision(row.raw_frontier_revision),
    frontier_position: validateStoredRevision(row.frontier_position),
    takeover_commit_revision: validateStoredRevision(row.takeover_commit_revision),
  };
  if (vector.frontier_position > vector.ledger_revision) corrupt();
  return vector;
}

function zeroVector(scope: RevisionScope): RevisionVector {
  return {
    ...scope,
    ledger_revision: 0,
    state_revision: 0,
    raw_frontier_revision: 0,
    frontier_position: 0,
    takeover_commit_revision: 0,
  };
}

function cloneVector(vector: RevisionVector): RevisionVector {
  return { ...vector };
}

function sameNonStateAxes(previous: RevisionVector, current: RevisionVector): boolean {
  return previous.namespace === current.namespace &&
    previous.stream_id === current.stream_id &&
    previous.ledger_revision === current.ledger_revision &&
    previous.raw_frontier_revision === current.raw_frontier_revision &&
    previous.frontier_position === current.frontier_position &&
    previous.takeover_commit_revision === current.takeover_commit_revision;
}

function vectorAtOrAfter(live: RevisionVector, historical: RevisionVector): boolean {
  return live.namespace === historical.namespace &&
    live.stream_id === historical.stream_id &&
    live.ledger_revision >= historical.ledger_revision &&
    live.state_revision >= historical.state_revision &&
    live.raw_frontier_revision >= historical.raw_frontier_revision &&
    live.frontier_position >= historical.frontier_position &&
    live.takeover_commit_revision >= historical.takeover_commit_revision;
}

function readLiveVector(database: DatabaseSync, scope: RevisionScope): RevisionVector {
  const row = database.prepare(
    `SELECT namespace, stream_id, ledger_revision, state_revision,
            raw_frontier_revision, frontier_position, takeover_commit_revision
     FROM cc_revision_streams
     WHERE namespace = ? AND stream_id = ?`
  ).get(scope.namespace, scope.stream_id) as StreamRow | undefined;
  if (row === undefined) corrupt();
  return vectorFromRow(row, scope);
}

function validateCanonicalStateSchema(database: DatabaseSync): void {
  assertTableColumns(database, "cc_canonical_state_schema", ["version", "completed_at"]);
  assertTableColumns(database, "cc_canonical_state_revisions", [
    "namespace", "stream_id", "state_revision", "state_commit_id", "commit_mode",
    "previous_state_revision", "proposal_json", "state_json", "state_hash",
    "policy_hash", "provenance_event_ids_json", "created_at",
  ]);
  for (const expected of CANONICAL_STATE_SCHEMA_OBJECTS) {
    const row = database.prepare(
      "SELECT type, name, sql FROM sqlite_master WHERE type = ? AND name = ?"
    ).get(expected.type, expected.name) as {
      type: string;
      name: string;
      sql: string | null;
    } | undefined;
    if (
      row?.type !== expected.type ||
      row.name !== expected.name ||
      typeof row.sql !== "string" ||
      normalizeSchemaSql(row.sql) !== normalizeSchemaSql(expected.sql)
    ) corrupt();
  }
}

function assertCurrentSchemaVersion(database: DatabaseSync): void {
  const rows = database.prepare(
    "SELECT version FROM cc_canonical_state_schema ORDER BY version"
  ).all() as Array<{ version: number }>;
  if (rows.length !== 1 || rows[0]?.version !== CANONICAL_STATE_SCHEMA_VERSION) corrupt();
}

function sqliteObjectExists(
  database: DatabaseSync,
  type: "table" | "trigger",
  name: string
): boolean {
  const row = database.prepare(
    "SELECT name FROM sqlite_master WHERE type = ? AND name = ?"
  ).get(type, name) as { name: string } | undefined;
  return row?.name === name;
}

function assertTableColumns(
  database: DatabaseSync,
  table: string,
  expected: readonly string[]
): void {
  const rows = database.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (rows.length !== expected.length ||
      rows.some((row, index) => row.name !== expected[index])) corrupt();
}

function normalizeSchemaSql(sql: string): string {
  return sql.trim().replace(/\s+/gu, " ").replace(/;$/u, "");
}

function mapMutationError(error: unknown): CanonicalStateError {
  if (error instanceof CanonicalStateError) return error;
  if (error instanceof RevisionSubstrateError) {
    switch (error.code) {
      case "INVALID_INPUT": return new CanonicalStateError("INVALID_INPUT");
      case "CONFLICT": return new CanonicalStateError("CONFLICT");
      case "CORRUPT_DATA": return new CanonicalStateError("CORRUPT_DATA");
      case "CLOSED": return new CanonicalStateError("CLOSED");
      case "STORAGE_FAILURE": return new CanonicalStateError("STORAGE_FAILURE");
    }
  }
  return new CanonicalStateError("STORAGE_FAILURE");
}

function rollback(database: DatabaseSync): void {
  try { database.exec("ROLLBACK;"); } catch { /* preserve primary failure */ }
}

function invalid(): never {
  throw new CanonicalStateError("INVALID_INPUT");
}

function notFound(): never {
  throw new CanonicalStateError("NOT_FOUND");
}

function conflict(): never {
  throw new CanonicalStateError("CONFLICT");
}

function corrupt(): never {
  throw new CanonicalStateError("CORRUPT_DATA");
}
