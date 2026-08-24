import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { CanonicalFactRelationError } from "./canonical-fact-relation.js";
import { CanonicalStateError } from "./canonical-state.js";
import { initializeSqliteConnection } from "./sqlite-initialization.js";
import type { JsonValue } from "./raw-store.js";
import {
  RevisionSubstrateError,
  SqliteRevisionSubstrate,
  commitTakeoverFrontierInsideCore,
  type RevisionScope,
  type RevisionVector,
} from "./revision-substrate.js";
import {
  SemanticTakeoverError,
  executeSemanticEnrichmentInsideCore,
  executeSemanticTakeoverInsideCore,
  migrateSemanticAuthority,
  normalizeSemanticEnrichmentInput,
  normalizeSemanticTakeoverInput,
  readCompactionArtifactInsideCore,
  readCurrentSemanticTakeoverInsideCore,
  readSemanticEnrichmentInsideCore,
  readSemanticTakeoverInsideCore,
  replaySemanticEnrichmentInsideCore,
  type CompactionArtifact,
  type CurrentSemanticTakeoverAuthority,
  type SemanticEnrichmentCommit,
  type SemanticEnrichmentCommitInput,
  type SemanticTakeoverCommit,
  type SemanticTakeoverCommitInput,
} from "./semantic-takeover.js";

interface StreamRow extends Record<string, unknown> {
  namespace: string;
  stream_id: string;
  ledger_revision: number;
  state_revision: number;
  raw_frontier_revision: number;
  frontier_position: number;
  takeover_commit_revision: number;
}

/** @internal The only fixed cross-domain WO-04C transaction composition entry. */
export class SqliteAuthorityTransactionCoordinator {
  readonly #database: DatabaseSync;
  readonly #revisionSubstrate: SqliteRevisionSubstrate;
  #closed = false;
  #transactionOpen = false;

  constructor(databasePath: string, revisionSubstrate: SqliteRevisionSubstrate) {
    if (typeof databasePath !== "string" || databasePath.length === 0 ||
        !(revisionSubstrate instanceof SqliteRevisionSubstrate)) {
      throw new SemanticTakeoverError("INVALID_INPUT");
    }
    let database: DatabaseSync | undefined;
    try {
      if (databasePath !== ":memory:") mkdirSync(dirname(databasePath), { recursive: true });
      database = new DatabaseSync(databasePath);
      initializeSqliteConnection(database, databasePath, () => {
        migrateSemanticAuthority(database!);
      });
      this.#database = database;
      this.#revisionSubstrate = revisionSubstrate;
    } catch (error) {
      try { database?.close(); } catch { /* preserve stable constructor failure */ }
      if (error instanceof SemanticTakeoverError && error.code === "INVALID_INPUT") throw error;
      throw new SemanticTakeoverError("STORAGE_FAILURE");
    }
  }

  commitTakeover(input: SemanticTakeoverCommitInput): SemanticTakeoverCommit {
    this.#assertOpen();
    const normalized = normalizeSemanticTakeoverInput(input);
    try {
      const marker = commitTakeoverFrontierInsideCore(
        this.#revisionSubstrate,
        {
          scope: normalized.scope,
          commit_id: normalized.takeover_commit_id,
          kind: "SEMANTIC_TAKEOVER_COMMIT_V1",
          request: normalized.request,
          expected_frontier_revision: normalized.expected_frontier_revision,
          expected_frontier_position: normalized.expected_frontier_position,
          next_frontier_position: normalized.covered_raw_range.end,
        },
        ({ previous, current, database }) => executeSemanticTakeoverInsideCore(
          database,
          normalized,
          previous,
          current
        ) as unknown as JsonValue
      );
      return this.#readTransaction(() => readSemanticTakeoverInsideCore(
        this.#database,
        normalized.scope,
        normalized.takeover_commit_id,
        marker
      ));
    } catch (error) {
      throw mapCompositionError(error);
    }
  }

  commitEnrichment(input: SemanticEnrichmentCommitInput): SemanticEnrichmentCommit {
    this.#assertOpen();
    const normalized = normalizeSemanticEnrichmentInput(input);
    if (this.#transactionOpen) throw new SemanticTakeoverError("CONFLICT");
    try {
      this.#database.exec("BEGIN IMMEDIATE;");
      this.#transactionOpen = true;
      const replay = replaySemanticEnrichmentInsideCore(this.#database, normalized);
      if (replay !== undefined) {
        this.#database.exec("COMMIT;");
        return replay;
      }
      const observed = readVector(this.#database, normalized.scope);
      executeSemanticEnrichmentInsideCore(
        this.#database,
        normalized,
        observed
      );
      if (!sameVector(readVector(this.#database, normalized.scope), observed)) {
        throw new SemanticTakeoverError("CORRUPT_DATA");
      }
      this.#database.exec("COMMIT;");
      this.#transactionOpen = false;
      return this.#readTransaction(() => readSemanticEnrichmentInsideCore(
        this.#database,
        normalized.scope,
        normalized.enrichment_commit_id
      ));
    } catch (error) {
      rollback(this.#database);
      throw mapCompositionError(error);
    } finally {
      this.#transactionOpen = false;
    }
  }

  readTakeover(scope: RevisionScope, takeoverCommitId: string): SemanticTakeoverCommit {
    this.#assertOpen();
    try {
      return this.#readTransaction(() => readSemanticTakeoverInsideCore(
        this.#database,
        scope,
        takeoverCommitId
      ));
    } catch (error) {
      throw mapCompositionError(error);
    }
  }

  readEnrichment(
    scope: RevisionScope,
    enrichmentCommitId: string
  ): SemanticEnrichmentCommit {
    this.#assertOpen();
    try {
      return this.#readTransaction(() => readSemanticEnrichmentInsideCore(
        this.#database,
        scope,
        enrichmentCommitId
      ));
    } catch (error) {
      throw mapCompositionError(error);
    }
  }

  readArtifact(scope: RevisionScope, artifactId: string): CompactionArtifact {
    this.#assertOpen();
    try {
      return this.#readTransaction(() => readCompactionArtifactInsideCore(
        this.#database,
        scope,
        artifactId
      ));
    } catch (error) {
      throw mapCompositionError(error);
    }
  }

  readCurrent(scope: RevisionScope): CurrentSemanticTakeoverAuthority {
    this.#assertOpen();
    try {
      return this.#readTransaction(() => readCurrentSemanticTakeoverInsideCore(
        this.#database,
        scope
      ));
    } catch (error) {
      throw mapCompositionError(error);
    }
  }

  close(): void {
    if (this.#closed) return;
    if (this.#transactionOpen) throw new SemanticTakeoverError("CONFLICT");
    try {
      this.#database.close();
      this.#closed = true;
    } catch {
      throw new SemanticTakeoverError("STORAGE_FAILURE");
    }
  }

  #readTransaction<T>(operation: () => T): T {
    if (this.#transactionOpen) throw new SemanticTakeoverError("CONFLICT");
    try {
      this.#database.exec("BEGIN;");
      this.#transactionOpen = true;
      const result = operation();
      this.#database.exec("COMMIT;");
      return result;
    } catch (error) {
      rollback(this.#database);
      throw error;
    } finally {
      this.#transactionOpen = false;
    }
  }

  #assertOpen(): void {
    if (this.#closed) throw new SemanticTakeoverError("CLOSED");
  }
}

function readVector(database: DatabaseSync, scope: RevisionScope): RevisionVector {
  const row = database.prepare(
    `SELECT namespace, stream_id, ledger_revision, state_revision,
            raw_frontier_revision, frontier_position, takeover_commit_revision
     FROM cc_revision_streams
     WHERE namespace = ? AND stream_id = ?`
  ).get(scope.namespace, scope.stream_id) as StreamRow | undefined;
  if (row === undefined) throw new SemanticTakeoverError("CONFLICT");
  const numbers = [
    row.ledger_revision,
    row.state_revision,
    row.raw_frontier_revision,
    row.frontier_position,
    row.takeover_commit_revision,
  ];
  if (row.namespace !== scope.namespace || row.stream_id !== scope.stream_id ||
      numbers.some((value) => !Number.isSafeInteger(value) || value < 0) ||
      row.frontier_position > row.ledger_revision) {
    throw new SemanticTakeoverError("CORRUPT_DATA");
  }
  return {
    namespace: row.namespace,
    stream_id: row.stream_id,
    ledger_revision: row.ledger_revision,
    state_revision: row.state_revision,
    raw_frontier_revision: row.raw_frontier_revision,
    frontier_position: row.frontier_position,
    takeover_commit_revision: row.takeover_commit_revision,
  };
}

function sameVector(left: RevisionVector, right: RevisionVector): boolean {
  return left.namespace === right.namespace && left.stream_id === right.stream_id &&
    left.ledger_revision === right.ledger_revision &&
    left.state_revision === right.state_revision &&
    left.raw_frontier_revision === right.raw_frontier_revision &&
    left.frontier_position === right.frontier_position &&
    left.takeover_commit_revision === right.takeover_commit_revision;
}

function rollback(database: DatabaseSync): void {
  try { database.exec("ROLLBACK;"); } catch { /* preserve original failure */ }
}

function mapCompositionError(error: unknown): SemanticTakeoverError {
  if (error instanceof SemanticTakeoverError) return error;
  if (error instanceof RevisionSubstrateError || error instanceof CanonicalStateError ||
      error instanceof CanonicalFactRelationError) {
    switch (error.code) {
      case "INVALID_INPUT": return new SemanticTakeoverError("INVALID_INPUT");
      case "NOT_FOUND": return new SemanticTakeoverError("NOT_FOUND");
      case "CONFLICT": return new SemanticTakeoverError("CONFLICT");
      case "CORRUPT_DATA": return new SemanticTakeoverError("CORRUPT_DATA");
      case "CLOSED": return new SemanticTakeoverError("CLOSED");
      case "STORAGE_FAILURE": return new SemanticTakeoverError("STORAGE_FAILURE");
    }
  }
  return new SemanticTakeoverError("STORAGE_FAILURE");
}
