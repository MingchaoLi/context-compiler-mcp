import { createHash, randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { initializeSqliteConnection } from "./sqlite-initialization.js";
import type { JsonObject, RawEvent, RawEventRole } from "./raw-store.js";
import type {
  ContextItem,
  ContextItemStatus,
  ContextItemType,
  RelationType,
  StateRelation,
} from "./state-types.js";
import {
  assertCoreSessionNamespace,
  type ScopedStateEntry,
  type SessionScope,
} from "./session-scope.js";

export interface StateItemInput {
  session_id: string;
  type: ContextItemType;
  content: string;
  status: ContextItemStatus;
  confidence?: number;
  source_refs?: string[];
  metadata?: JsonObject;
}

export interface StateItemPatch {
  content?: string;
  status?: ContextItemStatus;
  metadata?: JsonObject;
}

export interface StateTransactionResult<T> {
  value: T;
  revision: number;
}

export interface StateUpdatePreparationRecord {
  preparation_token: string;
  session_id: string;
  expected_revision: number;
  newest_event_ids: string[];
  fingerprint: string;
  snapshot_json: string;
  created_at: string;
}

export class StateRevisionConflictError extends Error {
  constructor() {
    super("Context state revision conflict");
    this.name = "StateRevisionConflictError";
  }
}

export class StateRevisionSnapshotError extends Error {
  constructor() {
    super("Requested Context State revision is unavailable");
    this.name = "StateRevisionSnapshotError";
  }
}

export interface DecisionSupersessionResult {
  updated: ContextItem;
  relation: StateRelation;
}

export interface QuestionResolutionResult {
  updated: ContextItem;
  relation?: StateRelation;
}

interface ItemRow extends Record<string, unknown> {
  id: string;
  session_id: string;
  type: ContextItemType;
  content: string;
  status: ContextItemStatus;
  confidence: number;
  created_at: string;
  updated_at: string;
  source_refs_json: string;
  metadata_json: string;
}

interface RelationRow extends Record<string, unknown> {
  session_id: string;
  source_id: string;
  relation_type: RelationType;
  target_id: string;
  created_at: string;
}

interface StateUpdatePreparationRow extends Record<string, unknown> {
  preparation_token: string;
  session_id: string;
  expected_revision: number;
  newest_event_ids_json: string;
  fingerprint: string;
  snapshot_json: string;
  created_at: string;
}

interface StateRawEventRow extends Record<string, unknown> {
  id: string;
  session_id: string;
  seq: number;
  source_event_id: string | null;
  role: RawEventRole;
  content: string;
  event_type: string;
  created_at: string;
  token_count: number;
  metadata_json: string;
}

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

export class SqliteContextStateStore {
  private readonly database: DatabaseSync;
  private closed = false;
  private transactionOpen = false;
  private transactionSessionId: string | undefined;
  private transactionDirty = false;

  constructor(databasePath: string) {
    if (typeof databasePath !== "string" || databasePath.length === 0) {
      throw new Error("databasePath must not be empty");
    }
    if (databasePath !== ":memory:") mkdirSync(dirname(databasePath), { recursive: true });

    const database = new DatabaseSync(databasePath);
    try {
      initializeSqliteConnection(database, databasePath, () => {
        migrate(database);
      });
    } catch (error) {
      try { database.close(); } catch { /* preserve the initialization error */ }
      throw error;
    }
    this.database = database;
  }

  transaction<T>(sessionId: string, operation: () => T): StateTransactionResult<T> {
    return this.runTransaction(sessionId, undefined, operation);
  }

  transactionAtRevision<T>(
    sessionId: string,
    expectedRevision: number,
    operation: () => T
  ): StateTransactionResult<T> {
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) {
      throw new Error("expected revision must be a non-negative safe integer");
    }
    return this.runTransaction(sessionId, expectedRevision, operation);
  }

  private runTransaction<T>(
    sessionId: string,
    expectedRevision: number | undefined,
    operation: () => T
  ): StateTransactionResult<T> {
    this.assertOpen();
    validateSessionId(sessionId);
    if (this.transactionOpen) throw new Error("Nested context-state transactions are not supported");

    this.database.exec("BEGIN IMMEDIATE;");
    this.transactionOpen = true;
    this.transactionSessionId = sessionId;
    this.transactionDirty = false;
    try {
      if (expectedRevision !== undefined && this.getRevision(sessionId) !== expectedRevision) {
        throw new StateRevisionConflictError();
      }
      const value = operation();
      const revision = this.transactionDirty
        ? this.advanceRevisionInsideTransaction(sessionId)
        : this.getRevision(sessionId);
      if (this.transactionDirty) this.persistRevisionSnapshotInsideTransaction(sessionId, revision);
      this.database.exec("COMMIT;");
      return { value, revision };
    } catch (error) {
      rollback(this.database);
      throw error;
    } finally {
      this.transactionOpen = false;
      this.transactionSessionId = undefined;
      this.transactionDirty = false;
    }
  }

  insertStateUpdatePreparation(record: StateUpdatePreparationRecord): void {
    this.assertTransactionSession(record.session_id);
    validateId(record.preparation_token, "preparation token");
    if (!Number.isSafeInteger(record.expected_revision) || record.expected_revision < 0) {
      throw new Error("expected revision must be a non-negative safe integer");
    }
    const newestEventIds = normalizeSourceRefs(record.newest_event_ids);
    if (!/^[a-f0-9]{64}$/.test(record.fingerprint)) {
      throw new Error("preparation fingerprint must be a SHA-256 hex digest");
    }
    parseJsonRecord(record.snapshot_json, "preparation snapshot");
    validateId(record.created_at, "preparation created_at");
    this.ensureSession(record.session_id, record.created_at);
    this.database
      .prepare(
        `INSERT INTO state_update_preparations (
           preparation_token, session_id, expected_revision, newest_event_ids_json,
           fingerprint, snapshot_json, created_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        record.preparation_token,
        record.session_id,
        record.expected_revision,
        JSON.stringify(newestEventIds),
        record.fingerprint,
        record.snapshot_json,
        record.created_at
      );
  }

  getStateUpdatePreparation(preparationToken: string): StateUpdatePreparationRecord | undefined {
    this.assertOpen();
    validateId(preparationToken, "preparation token");
    const row = this.database
      .prepare("SELECT * FROM state_update_preparations WHERE preparation_token = ?")
      .get(preparationToken) as StateUpdatePreparationRow | undefined;
    if (!row) return undefined;
    return {
      preparation_token: row.preparation_token,
      session_id: row.session_id,
      expected_revision: row.expected_revision,
      newest_event_ids: parseSourceRefs(row.newest_event_ids_json),
      fingerprint: row.fingerprint,
      snapshot_json: row.snapshot_json,
      created_at: row.created_at,
    };
  }

  getRawEventsByIds(sessionId: string, eventIds: readonly string[]): RawEvent[] {
    this.assertOpen();
    validateSessionId(sessionId);
    const events: RawEvent[] = [];
    for (const eventId of eventIds) {
      validateId(eventId, "raw event id");
      const row = this.database
        .prepare("SELECT * FROM raw_events WHERE session_id = ? AND id = ?")
        .get(sessionId, eventId) as StateRawEventRow | undefined;
      if (!row) throw new Error("Prepared raw event is unavailable");
      events.push(stateRawRowToEvent(row));
    }
    return events;
  }

  getSessionMaxRawSequence(sessionId: string): number {
    this.assertOpen();
    validateSessionId(sessionId);
    const row = this.database
      .prepare("SELECT COALESCE(MAX(seq), 0) AS max_seq FROM raw_events WHERE session_id = ?")
      .get(sessionId) as { max_seq: number };
    return row.max_seq;
  }

  createItem(input: StateItemInput): ContextItem {
    this.assertWritable(input.session_id);
    validateSessionId(input.session_id);
    validateItemType(input.type);
    validateContent(input.content);
    validateInitialStatus(input.type, input.status);

    const confidence = input.confidence ?? 1;
    if (!Number.isFinite(confidence) || Object.is(confidence, -0) || confidence < 0 || confidence > 1) {
      throw new Error("confidence must be a lossless number between 0 and 1");
    }
    const sourceRefs = normalizeSourceRefs(input.source_refs);
    const metadata = input.metadata === undefined ? {} : normalizeJsonObject(input.metadata, "metadata");
    for (const sourceRef of sourceRefs) this.requireRawEvent(input.session_id, sourceRef);

    const timestamp = new Date().toISOString();
    const item: ContextItem = {
      id: randomUUID(),
      session_id: input.session_id,
      type: input.type,
      content: input.content,
      status: input.status,
      confidence,
      created_at: timestamp,
      updated_at: timestamp,
      source_refs: [...sourceRefs],
      metadata,
    };

    this.ensureSession(input.session_id, timestamp);
    this.database
      .prepare(
        `INSERT INTO context_items (
           id, session_id, type, content, status, confidence,
           created_at, updated_at, source_refs_json, metadata_json
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        item.id,
        item.session_id,
        item.type,
        item.content,
        item.status,
        item.confidence,
        item.created_at,
        item.updated_at,
        JSON.stringify(item.source_refs),
        JSON.stringify(item.metadata)
      );
    for (const sourceRef of sourceRefs) {
      this.insertRelation(item, "DERIVED_FROM", sourceRef, timestamp);
    }
    this.transactionDirty = true;
    return cloneItem(item);
  }

  getItem(sessionId: string, id: string): ContextItem | undefined {
    this.assertOpen();
    validateSessionId(sessionId);
    validateId(id, "item id");
    const row = this.database
      .prepare("SELECT * FROM context_items WHERE session_id = ? AND id = ?")
      .get(sessionId, id) as ItemRow | undefined;
    return row ? rowToItem(row) : undefined;
  }

  requireItem(sessionId: string, id: string, expectedType?: ContextItemType): ContextItem {
    const item = this.getItem(sessionId, id);
    if (!item) throw new Error(`Context item ${id} does not exist in session ${sessionId}`);
    if (expectedType !== undefined && item.type !== expectedType) {
      throw new Error(`Context item ${id} must be ${expectedType}, received ${item.type}`);
    }
    return item;
  }

  getItems(sessionId: string): ContextItem[] {
    this.assertOpen();
    validateSessionId(sessionId);
    const rows = this.database
      .prepare("SELECT * FROM context_items WHERE session_id = ? ORDER BY created_at, id")
      .all(sessionId) as ItemRow[];
    return rows.map(rowToItem);
  }

  /** Read every Scope element at its exact current/frozen State frontier. */
  getScopeState(scope: SessionScope): ScopedStateEntry[] {
    this.assertOpen();
    assertCoreSessionNamespace(scope);
    return scope.read_scope.map((scopeEntry) => {
      const sessionId = scopeEntry.session.session_id;
      if (scopeEntry.frontier.kind === "CURRENT") {
        return {
          scope_entry: scopeEntry,
          items: this.getItems(sessionId),
          relations: this.getSessionRelations(sessionId),
        };
      }
      const projection = this.readRevisionSnapshot(sessionId, scopeEntry.frontier.state_revision);
      return { scope_entry: scopeEntry, ...projection };
    });
  }

  updateItem(
    sessionId: string,
    id: string,
    patch: StateItemPatch,
    expectedType?: ContextItemType
  ): ContextItem {
    this.assertWritable(sessionId);
    const existing = this.requireItem(sessionId, id, expectedType);
    if (patch.content === undefined && patch.status === undefined && patch.metadata === undefined) {
      throw new Error("Context item update must change content, status, or metadata");
    }

    const content = patch.content ?? existing.content;
    const status = patch.status ?? existing.status;
    const metadata =
      patch.metadata === undefined
        ? existing.metadata
        : normalizeJsonObject(patch.metadata, "metadata");
    validateContent(content);
    validateStatus(existing.type, status);
    validateTransition(existing.type, existing.status, status);
    if (existing.type === "DECISION" && status !== existing.status) {
      throw new Error("Decision status changes require supersedeDecision");
    }
    if (existing.type === "OPEN_QUESTION" && status !== existing.status) {
      throw new Error("OpenQuestion status changes require resolveQuestion");
    }

    if (
      content === existing.content &&
      status === existing.status &&
      JSON.stringify(metadata) === JSON.stringify(existing.metadata)
    ) {
      throw new Error(`Context item ${id} update is a no-op`);
    }

    return this.writeItemUpdate(existing, content, status, metadata);
  }

  resolveQuestion(
    sessionId: string,
    questionId: string,
    resolvedBy?: string
  ): QuestionResolutionResult {
    this.assertWritable(sessionId);
    return this.withDomainSavepoint(() => {
      const question = this.requireItem(sessionId, questionId, "OPEN_QUESTION");
      if (question.status !== "OPEN") {
        throw new Error(`OpenQuestion ${questionId} must be OPEN before resolution`);
      }

      let decision: ContextItem | undefined;
      if (resolvedBy !== undefined) {
        decision = this.requireItem(sessionId, resolvedBy, "DECISION");
        if (decision.status !== "ACTIVE") {
          throw new Error(`resolved_by Decision ${resolvedBy} must be ACTIVE`);
        }
      }

      const updated = this.writeItemUpdate(
        question,
        question.content,
        "RESOLVED",
        question.metadata
      );
      const relation =
        decision === undefined
          ? undefined
          : this.addRelationInternal(sessionId, updated.id, "RESOLVED_BY", decision.id);
      return { updated, ...(relation === undefined ? {} : { relation }) };
    });
  }

  supersedeDecision(
    sessionId: string,
    supersededId: string,
    supersedingId: string
  ): DecisionSupersessionResult {
    this.assertWritable(sessionId);
    return this.withDomainSavepoint(() => {
      if (supersededId === supersedingId) throw new Error("A Decision cannot supersede itself");
      const oldDecision = this.requireItem(sessionId, supersededId, "DECISION");
      const newDecision = this.requireItem(sessionId, supersedingId, "DECISION");
      if (oldDecision.status !== "ACTIVE") {
        throw new Error(`Decision ${supersededId} must be ACTIVE before supersession`);
      }
      if (newDecision.status !== "ACTIVE") {
        throw new Error(`Decision ${supersedingId} must be ACTIVE to supersede another Decision`);
      }

      const updated = this.writeItemUpdate(
        oldDecision,
        oldDecision.content,
        "SUPERSEDED",
        oldDecision.metadata
      );
      const relation = this.addRelationInternal(
        sessionId,
        newDecision.id,
        "SUPERSEDES",
        updated.id
      );
      return { updated, relation };
    });
  }

  addRelation(
    sessionId: string,
    sourceId: string,
    relationType: RelationType,
    targetId: string
  ): StateRelation {
    this.assertWritable(sessionId);
    if (relationType === "SUPERSEDES" || relationType === "RESOLVED_BY") {
      throw new Error(
        `${relationType} must be created through its atomic context-state operation`
      );
    }
    return this.addRelationInternal(sessionId, sourceId, relationType, targetId);
  }

  private addRelationInternal(
    sessionId: string,
    sourceId: string,
    relationType: RelationType,
    targetId: string
  ): StateRelation {
    validateSessionId(sessionId);
    validateRelationType(relationType);
    const source = this.requireItem(sessionId, sourceId);
    if (sourceId === targetId) throw new Error(`${relationType} relation cannot target itself`);
    validateRelationEndpoint(this.database, sessionId, source, relationType, targetId);
    const relation = this.insertRelation(source, relationType, targetId, new Date().toISOString());

    if (relationType === "DERIVED_FROM" && !source.source_refs.includes(targetId)) {
      const sourceRefs = [...source.source_refs, targetId];
      this.database
        .prepare(
          `UPDATE context_items SET source_refs_json = ?, updated_at = ?
           WHERE session_id = ? AND id = ?`
        )
        .run(JSON.stringify(sourceRefs), relation.created_at, sessionId, sourceId);
    }
    this.transactionDirty = true;
    return relation;
  }

  getRelations(sessionId: string, sourceId: string): StateRelation[] {
    this.assertOpen();
    validateSessionId(sessionId);
    validateId(sourceId, "relation source id");
    const rows = this.database
      .prepare(
        `SELECT * FROM state_relations
         WHERE session_id = ? AND source_id = ?
         ORDER BY created_at, relation_type, target_id`
      )
      .all(sessionId, sourceId) as RelationRow[];
    return rows.map(rowToRelation);
  }

  getSessionRelations(sessionId: string): StateRelation[] {
    this.assertOpen();
    validateSessionId(sessionId);
    const rows = this.database
      .prepare(
        `SELECT * FROM state_relations
         WHERE session_id = ? ORDER BY created_at, source_id, relation_type, target_id`
      )
      .all(sessionId) as RelationRow[];
    return rows.map(rowToRelation);
  }

  getRevision(sessionId: string): number {
    this.assertOpen();
    validateSessionId(sessionId);
    const row = this.database
      .prepare("SELECT revision FROM context_state_revisions WHERE session_id = ?")
      .get(sessionId) as { revision: number } | undefined;
    return row?.revision ?? 0;
  }

  private advanceRevisionInsideTransaction(sessionId: string): number {
    this.ensureSession(sessionId, new Date().toISOString());
    this.database
      .prepare(
        `INSERT INTO context_state_revisions (session_id, revision) VALUES (?, 1)
         ON CONFLICT(session_id) DO UPDATE SET revision = revision + 1`
      )
      .run(sessionId);
    return this.getRevision(sessionId);
  }

  private persistRevisionSnapshotInsideTransaction(sessionId: string, revision: number): void {
    const items = this.getItems(sessionId);
    const relations = this.getSessionRelations(sessionId);
    const snapshotJson = stateSnapshotJson(sessionId, revision, items, relations);
    const snapshotSha256 = sha256(snapshotJson);
    this.database.prepare(
      `INSERT INTO context_state_revision_snapshots (
         session_id, revision, snapshot_json, snapshot_sha256, created_at
       ) VALUES (?, ?, ?, ?, ?)`
    ).run(sessionId, revision, snapshotJson, snapshotSha256, new Date().toISOString());
  }

  private readRevisionSnapshot(
    sessionId: string,
    revision: number
  ): { items: ContextItem[]; relations: StateRelation[] } {
    validateSessionId(sessionId);
    if (!Number.isSafeInteger(revision) || revision < 0) throw new StateRevisionSnapshotError();
    if (revision === 0) return { items: [], relations: [] };
    const row = this.database.prepare(
      `SELECT snapshot_json, snapshot_sha256 FROM context_state_revision_snapshots
       WHERE session_id = ? AND revision = ?`
    ).get(sessionId, revision) as { snapshot_json: string; snapshot_sha256: string } | undefined;
    if (row === undefined || sha256(row.snapshot_json) !== row.snapshot_sha256) {
      throw new StateRevisionSnapshotError();
    }
    return parseStateSnapshot(row.snapshot_json, sessionId, revision);
  }

  close(): void {
    if (this.closed) return;
    if (this.transactionOpen) throw new Error("Cannot close context-state store in a transaction");
    this.database.close();
    this.closed = true;
  }

  private writeItemUpdate(
    existing: ContextItem,
    content: string,
    status: ContextItemStatus,
    metadata: JsonObject
  ): ContextItem {
    const updatedAt = new Date().toISOString();
    const result = this.database
      .prepare(
        `UPDATE context_items
         SET content = ?, status = ?, metadata_json = ?, updated_at = ?
         WHERE session_id = ? AND id = ?`
      )
      .run(
        content,
        status,
        JSON.stringify(metadata),
        updatedAt,
        existing.session_id,
        existing.id
      );
    if (result.changes !== 1) throw new Error(`Context item ${existing.id} changed concurrently`);
    this.transactionDirty = true;
    return cloneItem({ ...existing, content, status, metadata, updated_at: updatedAt });
  }

  private withDomainSavepoint<T>(operation: () => T): T {
    const dirtyBefore = this.transactionDirty;
    this.database.exec("SAVEPOINT context_state_domain_operation;");
    try {
      const result = operation();
      this.database.exec("RELEASE SAVEPOINT context_state_domain_operation;");
      return result;
    } catch (error) {
      try {
        this.database.exec("ROLLBACK TO SAVEPOINT context_state_domain_operation;");
        this.database.exec("RELEASE SAVEPOINT context_state_domain_operation;");
      } catch {
        // The outer transaction will still roll back if savepoint cleanup fails.
      } finally {
        this.transactionDirty = dirtyBefore;
      }
      throw error;
    }
  }

  private insertRelation(
    source: ContextItem,
    relationType: RelationType,
    targetId: string,
    createdAt: string
  ): StateRelation {
    const existing = this.database
      .prepare(
        `SELECT * FROM state_relations
         WHERE session_id = ? AND source_id = ? AND relation_type = ? AND target_id = ?`
      )
      .get(source.session_id, source.id, relationType, targetId) as RelationRow | undefined;
    if (existing) {
      throw new Error(
        `State relation ${source.id} ${relationType} ${targetId} already exists in session ${source.session_id}`
      );
    }
    this.database
      .prepare(
        `INSERT INTO state_relations
         (session_id, source_id, relation_type, target_id, created_at)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run(source.session_id, source.id, relationType, targetId, createdAt);
    const row = this.database
      .prepare(
        `SELECT * FROM state_relations
         WHERE session_id = ? AND source_id = ? AND relation_type = ? AND target_id = ?`
      )
      .get(source.session_id, source.id, relationType, targetId) as RelationRow | undefined;
    if (!row) throw new Error("State relation insert did not produce a readable row");
    return rowToRelation(row);
  }

  private requireRawEvent(sessionId: string, id: string): void {
    validateId(id, "source_ref");
    const rawTable = this.database
      .prepare("SELECT 1 AS present FROM sqlite_master WHERE type = 'table' AND name = 'raw_events'")
      .get() as { present: number } | undefined;
    if (!rawTable) throw new Error("source_refs require the WO-CC-01 raw_events schema");
    const rawEvent = this.database
      .prepare("SELECT 1 AS present FROM raw_events WHERE session_id = ? AND id = ?")
      .get(sessionId, id) as { present: number } | undefined;
    if (!rawEvent) throw new Error(`Raw event ${id} does not exist in session ${sessionId}`);
  }

  private ensureSession(sessionId: string, createdAt: string): void {
    this.database
      .prepare("INSERT OR IGNORE INTO sessions (id, created_at) VALUES (?, ?)")
      .run(sessionId, createdAt);
  }

  private assertOpen(): void {
    if (this.closed) throw new Error("Context-state store is closed");
  }

  private assertWritable(sessionId: string): void {
    this.assertTransactionSession(sessionId);
  }

  private assertTransactionSession(sessionId: string): void {
    this.assertOpen();
    if (!this.transactionOpen) throw new Error("Context-state writes require an active transaction");
    if (this.transactionSessionId !== sessionId) {
      throw new Error(
        `Transaction for session ${this.transactionSessionId} cannot write session ${sessionId}`
      );
    }
  }
}

function migrate(database: DatabaseSync): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY CHECK (length(id) > 0),
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS context_items (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES sessions(id),
      type TEXT NOT NULL CHECK (type IN (
        'GOAL', 'CONSTRAINT', 'DECISION', 'OPEN_QUESTION', 'REJECTED_ALTERNATIVE'
      )),
      content TEXT NOT NULL CHECK (length(content) > 0),
      status TEXT NOT NULL,
      confidence REAL NOT NULL DEFAULT 1 CHECK (confidence >= 0 AND confidence <= 1),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      source_refs_json TEXT NOT NULL DEFAULT '[]'
        CHECK (json_valid(source_refs_json) AND json_type(source_refs_json) = 'array'),
      metadata_json TEXT NOT NULL DEFAULT '{}'
        CHECK (json_valid(metadata_json) AND json_type(metadata_json) = 'object'),
      UNIQUE (session_id, id),
      CHECK (
        (type = 'GOAL' AND status IN ('ACTIVE', 'COMPLETED', 'SUPERSEDED')) OR
        (type = 'CONSTRAINT' AND status IN ('ACTIVE', 'SUPERSEDED')) OR
        (type = 'DECISION' AND status IN ('ACTIVE', 'SUPERSEDED')) OR
        (type = 'OPEN_QUESTION' AND status IN ('OPEN', 'RESOLVED', 'DEFERRED')) OR
        (type = 'REJECTED_ALTERNATIVE' AND status = 'REJECTED')
      )
    );

    CREATE INDEX IF NOT EXISTS idx_context_items_session_type_status
      ON context_items(session_id, type, status);

    CREATE TABLE IF NOT EXISTS state_relations (
      session_id TEXT NOT NULL,
      source_id TEXT NOT NULL,
      relation_type TEXT NOT NULL CHECK (relation_type IN (
        'SUPERSEDES', 'DEPENDS_ON', 'RESOLVED_BY', 'REJECTS', 'DERIVED_FROM'
      )),
      target_id TEXT NOT NULL CHECK (length(target_id) > 0),
      created_at TEXT NOT NULL,
      PRIMARY KEY (session_id, source_id, relation_type, target_id),
      FOREIGN KEY (session_id, source_id) REFERENCES context_items(session_id, id)
    );

    CREATE INDEX IF NOT EXISTS idx_state_relations_session_target
      ON state_relations(session_id, target_id);

    CREATE TABLE IF NOT EXISTS context_state_revisions (
      session_id TEXT PRIMARY KEY REFERENCES sessions(id),
      revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0)
    );

    CREATE TABLE IF NOT EXISTS context_state_revision_snapshots (
      session_id TEXT NOT NULL REFERENCES sessions(id),
      revision INTEGER NOT NULL CHECK (revision > 0),
      snapshot_json TEXT NOT NULL
        CHECK (json_valid(snapshot_json) AND json_type(snapshot_json) = 'object'),
      snapshot_sha256 TEXT NOT NULL CHECK (
        length(snapshot_sha256) = 64 AND snapshot_sha256 NOT GLOB '*[^0-9a-f]*'
      ),
      created_at TEXT NOT NULL,
      PRIMARY KEY (session_id, revision)
    );

    CREATE TRIGGER IF NOT EXISTS context_state_revision_snapshots_prevent_update
    BEFORE UPDATE ON context_state_revision_snapshots
    BEGIN
      SELECT RAISE(ABORT, 'context state revision snapshots are immutable');
    END;

    CREATE TRIGGER IF NOT EXISTS context_state_revision_snapshots_prevent_delete
    BEFORE DELETE ON context_state_revision_snapshots
    BEGIN
      SELECT RAISE(ABORT, 'context state revision snapshots are immutable');
    END;

    CREATE TABLE IF NOT EXISTS state_update_preparations (
      preparation_token TEXT PRIMARY KEY CHECK (length(preparation_token) > 0),
      session_id TEXT NOT NULL REFERENCES sessions(id),
      expected_revision INTEGER NOT NULL CHECK (expected_revision >= 0),
      newest_event_ids_json TEXT NOT NULL
        CHECK (json_valid(newest_event_ids_json) AND json_type(newest_event_ids_json) = 'array'),
      fingerprint TEXT NOT NULL CHECK (length(fingerprint) = 64),
      snapshot_json TEXT NOT NULL
        CHECK (json_valid(snapshot_json) AND json_type(snapshot_json) = 'object'),
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_state_update_preparations_session_created
      ON state_update_preparations(session_id, created_at);

    CREATE TRIGGER IF NOT EXISTS state_update_preparations_prevent_update
    BEFORE UPDATE ON state_update_preparations
    BEGIN
      SELECT RAISE(ABORT, 'state_update_preparations is immutable');
    END;

    CREATE TRIGGER IF NOT EXISTS state_update_preparations_prevent_delete
    BEFORE DELETE ON state_update_preparations
    BEGIN
      SELECT RAISE(ABORT, 'state_update_preparations is immutable');
    END;
  `);
  backfillCurrentStateSnapshots(database);
}

function backfillCurrentStateSnapshots(database: DatabaseSync): void {
  const revisions = database.prepare(
    `SELECT r.session_id, r.revision
     FROM context_state_revisions AS r
     LEFT JOIN context_state_revision_snapshots AS s
       ON s.session_id = r.session_id AND s.revision = r.revision
     WHERE r.revision > 0 AND s.session_id IS NULL
     ORDER BY r.session_id`
  ).all() as Array<{ session_id: string; revision: number }>;
  for (const entry of revisions) {
    const items = (database.prepare(
      "SELECT * FROM context_items WHERE session_id = ? ORDER BY created_at, id"
    ).all(entry.session_id) as ItemRow[]).map(rowToItem);
    const relations = (database.prepare(
      `SELECT * FROM state_relations WHERE session_id = ?
       ORDER BY created_at, source_id, relation_type, target_id`
    ).all(entry.session_id) as RelationRow[]).map(rowToRelation);
    const snapshotJson = stateSnapshotJson(entry.session_id, entry.revision, items, relations);
    database.prepare(
      `INSERT INTO context_state_revision_snapshots (
         session_id, revision, snapshot_json, snapshot_sha256, created_at
       ) VALUES (?, ?, ?, ?, ?)`
    ).run(entry.session_id, entry.revision, snapshotJson, sha256(snapshotJson), new Date().toISOString());
  }
}

function stateSnapshotJson(
  sessionId: string,
  revision: number,
  items: ContextItem[],
  relations: StateRelation[]
): string {
  return JSON.stringify({ session_id: sessionId, revision, items, relations });
}

function parseStateSnapshot(
  json: string,
  sessionId: string,
  revision: number
): { items: ContextItem[]; relations: StateRelation[] } {
  let value: unknown;
  try { value = JSON.parse(json); } catch { throw new StateRevisionSnapshotError(); }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new StateRevisionSnapshotError();
  }
  const record = value as Record<string, unknown>;
  if (
    record.session_id !== sessionId || record.revision !== revision ||
    !Array.isArray(record.items) || !Array.isArray(record.relations)
  ) throw new StateRevisionSnapshotError();
  const items = record.items as ContextItem[];
  const relations = record.relations as StateRelation[];
  if (
    items.some((item) => typeof item !== "object" || item === null || item.session_id !== sessionId) ||
    relations.some((relation) => typeof relation !== "object" || relation === null || relation.session_id !== sessionId)
  ) throw new StateRevisionSnapshotError();
  return { items: structuredClone(items), relations: structuredClone(relations) };
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function validateRelationEndpoint(
  database: DatabaseSync,
  sessionId: string,
  source: ContextItem,
  relationType: RelationType,
  targetId: string
): void {
  validateId(targetId, "relation target id");
  if (relationType === "DERIVED_FROM") {
    const rawTable = database
      .prepare("SELECT 1 AS present FROM sqlite_master WHERE type = 'table' AND name = 'raw_events'")
      .get() as { present: number } | undefined;
    if (!rawTable) throw new Error("DERIVED_FROM requires the WO-CC-01 raw_events schema");
    const target = database
      .prepare("SELECT 1 AS present FROM raw_events WHERE session_id = ? AND id = ?")
      .get(sessionId, targetId) as { present: number } | undefined;
    if (!target) throw new Error(`Raw event ${targetId} does not exist in session ${sessionId}`);
    return;
  }

  const targetRow = database
    .prepare("SELECT * FROM context_items WHERE session_id = ? AND id = ?")
    .get(sessionId, targetId) as ItemRow | undefined;
  if (!targetRow) throw new Error(`Relation target ${targetId} does not exist in session ${sessionId}`);
  const target = rowToItem(targetRow);

  if (relationType === "SUPERSEDES") {
    if (source.type !== "DECISION" || target.type !== "DECISION") {
      throw new Error("SUPERSEDES requires Decision source and target");
    }
    if (source.status !== "ACTIVE" || target.status !== "SUPERSEDED") {
      throw new Error("SUPERSEDES requires ACTIVE source and SUPERSEDED target Decision");
    }
  }
  if (relationType === "RESOLVED_BY") {
    if (source.type !== "OPEN_QUESTION" || target.type !== "DECISION") {
      throw new Error("RESOLVED_BY requires OpenQuestion source and Decision target");
    }
    if (source.status !== "RESOLVED") {
      throw new Error("RESOLVED_BY requires a RESOLVED OpenQuestion source");
    }
    if (target.status !== "ACTIVE") {
      throw new Error("RESOLVED_BY requires an ACTIVE Decision target");
    }
  }
  if (relationType === "REJECTS" && source.type !== "REJECTED_ALTERNATIVE") {
    throw new Error("REJECTS requires RejectedAlternative source");
  }
}

function validateInitialStatus(type: ContextItemType, status: ContextItemStatus): void {
  validateStatus(type, status);
  const initial: Record<ContextItemType, ContextItemStatus> = {
    GOAL: "ACTIVE",
    CONSTRAINT: "ACTIVE",
    DECISION: "ACTIVE",
    OPEN_QUESTION: "OPEN",
    REJECTED_ALTERNATIVE: "REJECTED",
  };
  if (status !== initial[type]) throw new Error(`${type} must be created with status ${initial[type]}`);
}

function validateStatus(type: ContextItemType, status: ContextItemStatus): void {
  const allowed: Record<ContextItemType, readonly ContextItemStatus[]> = {
    GOAL: ["ACTIVE", "COMPLETED", "SUPERSEDED"],
    CONSTRAINT: ["ACTIVE", "SUPERSEDED"],
    DECISION: ["ACTIVE", "SUPERSEDED"],
    OPEN_QUESTION: ["OPEN", "RESOLVED", "DEFERRED"],
    REJECTED_ALTERNATIVE: ["REJECTED"],
  };
  if (!allowed[type].includes(status)) throw new Error(`Status ${String(status)} is invalid for ${type}`);
}

function validateTransition(
  type: ContextItemType,
  from: ContextItemStatus,
  to: ContextItemStatus
): void {
  if (from === to) return;
  const allowed = new Set<string>([
    "GOAL:ACTIVE->COMPLETED",
    "CONSTRAINT:ACTIVE->SUPERSEDED",
    "DECISION:ACTIVE->SUPERSEDED",
    "OPEN_QUESTION:OPEN->RESOLVED",
    "OPEN_QUESTION:OPEN->DEFERRED",
  ]);
  if (!allowed.has(`${type}:${from}->${to}`)) {
    throw new Error(`Transition ${type} ${from} -> ${to} is not allowed`);
  }
}

function validateItemType(type: ContextItemType): void {
  if (!ITEM_TYPES.includes(type)) throw new Error(`Unsupported context item type ${String(type)}`);
}

function validateRelationType(type: RelationType): void {
  if (!RELATION_TYPES.includes(type)) throw new Error(`Unsupported relation type ${String(type)}`);
}

function validateSessionId(sessionId: string): void {
  if (typeof sessionId !== "string" || sessionId.length === 0) {
    throw new Error("session_id must not be empty");
  }
}

function validateContent(content: string): void {
  if (typeof content !== "string" || content.length === 0) {
    throw new Error("context item content must not be empty");
  }
}

function validateId(id: string, label: string): void {
  if (typeof id !== "string" || id.length === 0) throw new Error(`${label} must not be empty`);
}

function normalizeSourceRefs(value: string[] | undefined): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error("source_refs must be an array of IDs");
  const result: string[] = [];
  const seen = new Set<string>();
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) {
      throw new Error("source_refs must be a dense array of data properties");
    }
    validateId(descriptor.value as string, `source_refs[${index}]`);
    if (seen.has(descriptor.value as string)) throw new Error("source_refs must not contain duplicates");
    seen.add(descriptor.value as string);
    result.push(descriptor.value as string);
  }
  for (const key of Reflect.ownKeys(value)) {
    if (key === "length") continue;
    if (typeof key !== "string" || !/^(0|[1-9]\d*)$/.test(key) || Number(key) >= value.length) {
      throw new Error("source_refs must not contain non-index properties");
    }
  }
  return result;
}

function normalizeJsonObject(value: JsonObject, label: string): JsonObject {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be a JSON object`);
  }
  assertJsonValue(value, new Set<object>(), label);
  return JSON.parse(JSON.stringify(value)) as JsonObject;
}

function assertJsonValue(value: unknown, ancestors: Set<object>, path: string): void {
  if (value === null || typeof value === "string" || typeof value === "boolean") return;
  if (typeof value === "number") {
    if (!Number.isFinite(value) || Object.is(value, -0)) {
      throw new Error(`${path} must contain only lossless JSON numbers`);
    }
    return;
  }
  if (typeof value !== "object") throw new Error(`${path} must contain only JSON values`);
  if (ancestors.has(value)) throw new Error(`${path} must not contain cycles`);

  if (Array.isArray(value)) {
    ancestors.add(value);
    for (let index = 0; index < value.length; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (!descriptor) throw new Error(`${path} must not contain sparse arrays`);
      if (!descriptor.enumerable || !("value" in descriptor)) {
        throw new Error(`${path}[${index}] must be an enumerable JSON data property`);
      }
      assertJsonValue(descriptor.value, ancestors, `${path}[${index}]`);
    }
    for (const key of Reflect.ownKeys(value)) {
      if (key === "length") continue;
      if (typeof key !== "string" || !/^(0|[1-9]\d*)$/.test(key) || Number(key) >= value.length) {
        throw new Error(`${path} must not contain non-index array properties`);
      }
    }
    ancestors.delete(value);
    return;
  }

  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new Error(`${path} must contain only plain JSON objects`);
  }
  ancestors.add(value);
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string") throw new Error(`${path} must not contain symbol keys`);
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor?.enumerable || !("value" in descriptor)) {
      throw new Error(`${path}.${key} must be an enumerable JSON data property`);
    }
    assertJsonValue(descriptor.value, ancestors, `${path}.${key}`);
  }
  ancestors.delete(value);
}

function rowToItem(row: ItemRow): ContextItem {
  validateItemType(row.type);
  validateStatus(row.type, row.status);
  return {
    id: row.id,
    session_id: row.session_id,
    type: row.type,
    content: row.content,
    status: row.status,
    confidence: row.confidence,
    created_at: row.created_at,
    updated_at: row.updated_at,
    source_refs: parseSourceRefs(row.source_refs_json),
    metadata: parseMetadata(row.metadata_json),
  };
}

function rowToRelation(row: RelationRow): StateRelation {
  validateRelationType(row.relation_type);
  return {
    session_id: row.session_id,
    source_id: row.source_id,
    relation_type: row.relation_type,
    target_id: row.target_id,
    created_at: row.created_at,
  };
}

function stateRawRowToEvent(row: StateRawEventRow): RawEvent {
  return {
    id: row.id,
    session_id: row.session_id,
    seq: row.seq,
    role: row.role,
    content: row.content,
    event_type: row.event_type,
    created_at: row.created_at,
    token_count: row.token_count,
    metadata: parseJsonRecord(row.metadata_json, "persisted raw-event metadata"),
    ...(row.source_event_id === null ? {} : { source_event_id: row.source_event_id }),
  };
}

function parseSourceRefs(value: string): string[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch (error) {
    throw new Error("Persisted source_refs is not valid JSON", { cause: error });
  }
  return normalizeSourceRefs(parsed as string[]);
}

function parseMetadata(value: string): JsonObject {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch (error) {
    throw new Error("Persisted state metadata is not valid JSON", { cause: error });
  }
  return normalizeJsonObject(parsed as JsonObject, "persisted metadata");
}

function parseJsonRecord(value: string, label: string): JsonObject {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch (error) {
    throw new Error(`${label} is not valid JSON`, { cause: error });
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error(`${label} must be a JSON object`);
  }
  return parsed as JsonObject;
}

function cloneItem(item: ContextItem): ContextItem {
  return {
    ...item,
    source_refs: [...item.source_refs],
    metadata: JSON.parse(JSON.stringify(item.metadata)) as JsonObject,
  };
}

function rollback(database: DatabaseSync): void {
  try {
    database.exec("ROLLBACK;");
  } catch {
    // Preserve the original state-transition failure.
  }
}
