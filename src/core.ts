import { dirname } from "node:path";
import { performance } from "node:perf_hooks";
import {
  ContextAssemblerValidationError,
  type CompiledContext,
} from "./assembler.js";
import {
  appendContextCompileTraceInsideService,
  ExperienceLedgerError,
  SqliteExperienceLedgerStore,
  withCompileTelemetryBoundaryInsideService,
  type ExperienceLedgerInput,
  type ExperienceLedgerRecord,
} from "./experience-ledger.js";
import {
  OperationalContextError,
  compileOperationalContext,
  hasTrustedContextCompileBaseline,
  type ContextPolicyInput,
} from "./operational-context.js";
import {
  HistoryRecallError,
  SqliteHistoryRecallStore,
  type ExactRecallQuery,
  type HistoryHeadlineInput,
  type KeywordRecallQuery,
} from "./recall.js";
import {
  LedgerHotRawError,
  SqliteLedgerHotRawStore,
  type HotRawProjection,
  type LedgerRawEvent,
  type RawSourceProjectionInput,
} from "./ledger-hot-raw.js";
import {
  CanonicalStateError,
  SqliteCanonicalStateStore,
  type CanonicalStateCommitInput,
  type CanonicalStateProjection,
  type CommittedCanonicalStateRevision,
} from "./canonical-state.js";
import {
  CanonicalFactRelationError,
  SqliteCanonicalFactRelationStore,
  type CanonicalFactRelationCommitInput,
  type CanonicalFactRelationCommitResult,
  type CanonicalFactRelationProjection,
  type CommittedCanonicalFact,
  type CommittedCanonicalRelation,
} from "./canonical-fact-relation.js";
import { SqliteAuthorityTransactionCoordinator } from "./authority-transaction-coordinator.js";
import {
  ContextSnapshotError,
  SqliteContextSnapshotStore,
  type ContextAttemptStarted,
  type ContextSnapshot,
  type ContextSnapshotFreezeInput,
} from "./context-snapshot.js";
import {
  SemanticTakeoverError,
  type CompactionArtifact,
  type CurrentSemanticTakeoverAuthority,
  type SemanticEnrichmentCommit,
  type SemanticEnrichmentCommitInput,
  type SemanticTakeoverCommit,
  type SemanticTakeoverCommitInput,
} from "./semantic-takeover.js";
import {
  SemanticFormationError,
  SqliteSemanticFormationStore,
  type CanonicalSemanticProposalV1,
  type SemanticAttestationAuthority,
  type SemanticInterpretationPreparationV1,
  type SemanticPreparationRequestV1,
  type SemanticProposalApplyResultV1,
} from "./semantic-formation.js";
import {
  CaseFormationError,
  RuntimeRawEvidenceProjector,
  SqliteCaseFormationStore,
  type CaseConclusionCommitInputV1,
  type CaseFormationAbstainInputV1,
  type CaseFormationFinalizationReceiptV1,
  type CaseFormationReadRequestV1,
  type CaseFormationReadResultV1,
  type RuntimeRawEvidenceProjectionRequestV1,
  type RuntimeRawEvidenceProjectionResultV1,
} from "./case-formation.js";
import {
  EXACT_RAW_RECEIPT_LOOKUP_CAPABILITY_NAME,
  EXACT_RAW_RECEIPT_LOOKUP_VERSION,
  SqliteRawHistoryStore,
  RawEventTimestampError,
  RawReceiptLookupInputError,
  estimateTokens,
  normalizeDenseEmbedding,
  type DenseEmbedding,
  type RawEventInput,
  type RawReceiptLookupInput,
  type RawReceiptLookupPort,
  type RawReceiptLookupResult,
} from "./raw-store.js";
import {
  RevisionSubstrateError,
  SqliteRevisionSubstrate,
  type RevisionScope,
  type RevisionVector,
} from "./revision-substrate.js";
import { SqliteContextStateStore } from "./state-store.js";
import { StateRevisionSnapshotError } from "./state-store.js";
import { StateUpdateCoordinator, StateUpdateError } from "./state-update.js";
import {
  SessionScopeValidationError,
  assertCoreSessionNamespace,
  cloneSessionScope,
  isSingleSessionScope,
  normalizeSessionScope,
  overlayScopedState,
  singleSessionScope,
  type SessionRef,
  type SessionScope,
} from "./session-scope.js";

export const CONTEXT_COMPILER_CORE_VERSION = "0.1.0";
export const CONTEXT_COMPILER_COMMANDS = [
  "health",
  "ingest_event",
  "compile_context",
  "get_state",
  "prepare_state_update",
  "apply_state_delta",
  "create_headline",
  "recall_exact",
  "recall_keyword",
] as const;

export type ContextCompilerCommandName = (typeof CONTEXT_COMPILER_COMMANDS)[number];
export type ContextCompilerCoreErrorCode =
  | "INVALID_INPUT"
  | "NOT_FOUND"
  | "CONFLICT"
  | "BUDGET_INSUFFICIENT"
  | "CORRUPT_DATA"
  | "STORAGE_FAILURE"
  | "INTERNAL_FAILURE";

export interface ContextCompilerCoreSuccess {
  ok: true;
  result: unknown;
}

export interface ContextCompilerCoreFailure {
  ok: false;
  error: { code: ContextCompilerCoreErrorCode };
}

export type ContextCompilerCoreResponse =
  | ContextCompilerCoreSuccess
  | ContextCompilerCoreFailure;

export interface CompileContextMetrics {
  full_context_tokens: number;
  compiled_context_tokens: number;
  recent_window_tokens: number;
  active_state_tokens: number;
  retrieved_tokens: number;
  compile_latency_ms: number;
  extractor_latency_ms: 0;
  active_state_items: number;
  suppressed_items: number;
}

export interface CompileContextResult {
  context: CompiledContext;
  metrics: CompileContextMetrics;
}

export interface SessionFrontier {
  session: SessionRef;
  raw_sequence: number;
  state_revision: number;
}

export interface ContextCompilerCommandPort {
  call(
    command: ContextCompilerCommandName,
    input: unknown
  ): ContextCompilerCoreResponse;
  close(): void;
}

export class ContextCompilerCoreError extends Error {
  constructor(readonly code: ContextCompilerCoreErrorCode) {
    super(code);
    this.name = "ContextCompilerCoreError";
  }
}

/**
 * Model- and Host-independent composition root for the current Context Compiler.
 * MCP and future Host adapters depend on this surface rather than Store, Reducer,
 * or SQLite implementation classes.
 */
export class ContextCompilerCore implements ContextCompilerCommandPort, RawReceiptLookupPort {
  private readonly rawStore: SqliteRawHistoryStore;
  private readonly stateStore: SqliteContextStateStore;
  private readonly stateUpdate: StateUpdateCoordinator;
  private readonly recallStore: SqliteHistoryRecallStore;
  private readonly ledgerStore: SqliteExperienceLedgerStore;
  readonly #revisionSubstrate: SqliteRevisionSubstrate;
  readonly #hotRawStore: SqliteLedgerHotRawStore;
  readonly #canonicalStateStore: SqliteCanonicalStateStore;
  readonly #canonicalFactRelationStore: SqliteCanonicalFactRelationStore;
  readonly #semanticFormationStore: SqliteSemanticFormationStore;
  readonly #runtimeRawEvidenceProjector: RuntimeRawEvidenceProjector;
  readonly #caseFormationStore: SqliteCaseFormationStore;
  readonly #authorityTransactionCoordinator: SqliteAuthorityTransactionCoordinator;
  readonly #contextSnapshotStore: SqliteContextSnapshotStore;
  private closed = false;

  constructor(databasePath: string) {
    if (typeof databasePath !== "string" || databasePath.length === 0) {
      throw new ContextCompilerCoreError("INVALID_INPUT");
    }
    void dirname(databasePath);
    let rawStore: SqliteRawHistoryStore | undefined;
    let stateStore: SqliteContextStateStore | undefined;
    let recallStore: SqliteHistoryRecallStore | undefined;
    let ledgerStore: SqliteExperienceLedgerStore | undefined;
    let revisionSubstrate: SqliteRevisionSubstrate | undefined;
    let hotRawStore: SqliteLedgerHotRawStore | undefined;
    let canonicalStateStore: SqliteCanonicalStateStore | undefined;
    let canonicalFactRelationStore: SqliteCanonicalFactRelationStore | undefined;
    let semanticFormationStore: SqliteSemanticFormationStore | undefined;
    let caseFormationStore: SqliteCaseFormationStore | undefined;
    let authorityTransactionCoordinator: SqliteAuthorityTransactionCoordinator | undefined;
    let contextSnapshotStore: SqliteContextSnapshotStore | undefined;
    try {
      rawStore = new SqliteRawHistoryStore(databasePath);
      stateStore = new SqliteContextStateStore(databasePath);
      recallStore = new SqliteHistoryRecallStore(databasePath);
      ledgerStore = new SqliteExperienceLedgerStore(databasePath);
      revisionSubstrate = new SqliteRevisionSubstrate(databasePath);
      hotRawStore = new SqliteLedgerHotRawStore(databasePath, revisionSubstrate);
      canonicalStateStore = new SqliteCanonicalStateStore(databasePath, revisionSubstrate);
      canonicalFactRelationStore = new SqliteCanonicalFactRelationStore(databasePath);
      semanticFormationStore = new SqliteSemanticFormationStore(databasePath, revisionSubstrate);
      caseFormationStore = new SqliteCaseFormationStore(databasePath, rawStore);
      authorityTransactionCoordinator = new SqliteAuthorityTransactionCoordinator(
        databasePath,
        revisionSubstrate
      );
      contextSnapshotStore = new SqliteContextSnapshotStore(databasePath);
    } catch {
      try { contextSnapshotStore?.close(); } catch { /* preserve stable startup failure */ }
      try { authorityTransactionCoordinator?.close(); } catch { /* preserve stable startup failure */ }
      try { caseFormationStore?.close(); } catch { /* preserve stable startup failure */ }
      try { semanticFormationStore?.close(); } catch { /* preserve stable startup failure */ }
      try { canonicalFactRelationStore?.close(); } catch { /* preserve stable startup failure */ }
      try { canonicalStateStore?.close(); } catch { /* preserve stable startup failure */ }
      try { hotRawStore?.close(); } catch { /* preserve stable startup failure */ }
      try { revisionSubstrate?.close(); } catch { /* preserve stable startup failure */ }
      try { recallStore?.close(); } catch { /* preserve stable startup failure */ }
      try { ledgerStore?.close(); } catch { /* preserve stable startup failure */ }
      try { stateStore?.close(); } catch { /* preserve stable startup failure */ }
      try { rawStore?.close(); } catch { /* preserve stable startup failure */ }
      throw new ContextCompilerCoreError("STORAGE_FAILURE");
    }
    this.rawStore = rawStore;
    this.stateStore = stateStore;
    this.stateUpdate = new StateUpdateCoordinator(stateStore);
    this.recallStore = recallStore;
    this.ledgerStore = ledgerStore;
    this.#revisionSubstrate = revisionSubstrate;
    this.#hotRawStore = hotRawStore;
    this.#canonicalStateStore = canonicalStateStore;
    this.#canonicalFactRelationStore = canonicalFactRelationStore;
    this.#semanticFormationStore = semanticFormationStore;
    this.#runtimeRawEvidenceProjector = new RuntimeRawEvidenceProjector(rawStore, hotRawStore);
    this.#caseFormationStore = caseFormationStore;
    this.#authorityTransactionCoordinator = authorityTransactionCoordinator;
    this.#contextSnapshotStore = contextSnapshotStore;
  }

  call(
    command: ContextCompilerCommandName,
    input: unknown
  ): ContextCompilerCoreResponse {
    if (this.closed) return failure("STORAGE_FAILURE");
    try {
      assertPlainData(input, "command input");
      switch (command) {
        case "health":
          assertKeys(input, [], []);
          return success({
            version: CONTEXT_COMPILER_CORE_VERSION,
            capabilities: [...CONTEXT_COMPILER_COMMANDS],
            ready: true,
          });
        case "ingest_event":
          return success(this.ingest(input));
        case "compile_context":
          return success(this.compile(input));
        case "get_state":
          return success(this.getState(input));
        case "prepare_state_update":
          return success(this.prepareStateUpdate(input));
        case "apply_state_delta":
          return success(this.applyStateDelta(input));
        case "create_headline":
          return success(this.createHeadline(input));
        case "recall_exact":
          return success(this.recallExact(input));
        case "recall_keyword":
          return success(this.recallKeyword(input));
      }
    } catch (error) {
      return failure(classifyError(error));
    }
  }

  appendExperienceRecord(input: ExperienceLedgerInput): ExperienceLedgerRecord {
    this.assertOpen();
    try {
      assertPlainData(input, "experience record input");
      return this.ledgerStore.append(input);
    } catch (error) {
      throw mapExperienceLedgerError(error);
    }
  }

  getExperienceRecords(sessionId: string): ExperienceLedgerRecord[] {
    this.assertOpen();
    requireNonEmptyString(sessionId);
    try {
      return this.ledgerStore.getSessionRecords(sessionId);
    } catch {
      throw new ContextCompilerCoreError("STORAGE_FAILURE");
    }
  }

  /** Read-only package contract for restart-safe ambiguous Raw commit reconciliation. */
  lookupRawReceipt(input: RawReceiptLookupInput): RawReceiptLookupResult {
    try {
      return this.rawStore.lookupRawReceipt(input);
    } catch (error) {
      if (error instanceof ContextCompilerCoreError) throw error;
      if (error instanceof RawReceiptLookupInputError) {
        throw new ContextCompilerCoreError("INVALID_INPUT");
      }
      return {
        capability: EXACT_RAW_RECEIPT_LOOKUP_CAPABILITY_NAME,
        version: EXACT_RAW_RECEIPT_LOOKUP_VERSION,
        status: "UNAVAILABLE",
      };
    }
  }

  /** Provider-neutral read frontier used by adapters when freezing a child Scope. */
  getSessionFrontier(sessionValue: SessionRef): SessionFrontier {
    this.assertOpen();
    let scope: SessionScope;
    try {
      scope = normalizeSessionScope({
        contract_version: "ripplecontext-session-scope/v1",
        write_session: sessionValue,
        read_scope: [{ session: sessionValue, frontier: { kind: "CURRENT" }, precedence: 0 }],
      });
      assertCoreSessionNamespace(scope);
    } catch {
      throw new ContextCompilerCoreError("INVALID_INPUT");
    }
    const session = scope.write_session;
    try {
      return {
        session: { ...session },
        raw_sequence: this.rawStore.getSessionMaxSequence(session.session_id),
        state_revision: this.stateStore.getRevision(session.session_id),
      };
    } catch {
      throw new ContextCompilerCoreError("STORAGE_FAILURE");
    }
  }

  /** Read-only scope query; generic revision mutation remains Core-internal. */
  getRevisionVector(scope: RevisionScope): RevisionVector {
    this.assertOpen();
    try {
      assertPlainData(scope, "revision scope");
      return this.#revisionSubstrate.getRevisionVector(scope);
    } catch (error) {
      throw mapRevisionSubstrateError(error);
    }
  }

  /** Domain-specific Core append; not part of the MCP command port. */
  appendRawSourceProjection(input: RawSourceProjectionInput): LedgerRawEvent {
    this.assertOpen();
    try {
      assertPlainData(input, "raw source projection input");
      return this.#hotRawStore.append(input);
    } catch (error) {
      throw mapLedgerHotRawError(error);
    }
  }

  /** Rebuilds the durable Hot Raw tail without advancing Frontier authority. */
  rebuildHotRaw(scope: RevisionScope): HotRawProjection {
    this.assertOpen();
    try {
      assertPlainData(scope, "hot raw scope");
      return this.#hotRawStore.rebuild(scope);
    } catch (error) {
      throw mapLedgerHotRawError(error);
    }
  }

  /** Commits one proposal-validated Canonical State revision; not an MCP command. */
  commitCanonicalState(
    input: CanonicalStateCommitInput
  ): CommittedCanonicalStateRevision {
    this.assertOpen();
    try {
      assertPlainData(input, "canonical state commit input");
      return this.#canonicalStateStore.commit(input);
    } catch (error) {
      throw mapCanonicalStateError(error);
    }
  }

  /** Reads the latest same-scope Canonical State without changing authority. */
  readCanonicalState(scope: RevisionScope): CanonicalStateProjection {
    this.assertOpen();
    try {
      assertPlainData(scope, "canonical state scope");
      return this.#canonicalStateStore.readLatest(scope);
    } catch (error) {
      throw mapCanonicalStateError(error);
    }
  }

  /** Reads one exact immutable Canonical State revision. */
  readCanonicalStateRevision(
    scope: RevisionScope,
    stateRevision: number
  ): CommittedCanonicalStateRevision {
    this.assertOpen();
    try {
      assertPlainData(scope, "canonical state scope");
      return this.#canonicalStateStore.readRevision(scope, stateRevision);
    } catch (error) {
      throw mapCanonicalStateError(error);
    }
  }

  /** Commits one policy-validated Fact / Relation authority batch; not an MCP command. */
  commitCanonicalFactsAndRelations(
    input: CanonicalFactRelationCommitInput
  ): CanonicalFactRelationCommitResult {
    this.assertOpen();
    try {
      assertPlainData(input, "canonical fact/relation commit input");
      return this.#canonicalFactRelationStore.commit(input);
    } catch (error) {
      throw mapCanonicalFactRelationError(error);
    }
  }

  /** Reads the current same-scope Fact / Relation projection without mutation. */
  readCanonicalFactsAndRelations(
    scope: RevisionScope
  ): CanonicalFactRelationProjection {
    this.assertOpen();
    try {
      assertPlainData(scope, "canonical fact/relation scope");
      return this.#canonicalFactRelationStore.readCurrent(scope);
    } catch (error) {
      throw mapCanonicalFactRelationError(error);
    }
  }

  /** Reads one exact immutable Canonical Fact object revision. */
  readCanonicalFactRevision(
    scope: RevisionScope,
    factId: string,
    factRevision: number
  ): CommittedCanonicalFact {
    this.assertOpen();
    try {
      assertPlainData(scope, "canonical fact scope");
      return this.#canonicalFactRelationStore.readFactRevision(
        scope,
        factId,
        factRevision
      );
    } catch (error) {
      throw mapCanonicalFactRelationError(error);
    }
  }

  /** Reads one exact immutable Canonical Relation object revision. */
  readCanonicalRelationRevision(
    scope: RevisionScope,
    relationId: string,
    relationRevision: number
  ): CommittedCanonicalRelation {
    this.assertOpen();
    try {
      assertPlainData(scope, "canonical relation scope");
      return this.#canonicalFactRelationStore.readRelationRevision(
        scope,
        relationId,
        relationRevision
      );
    } catch (error) {
      throw mapCanonicalFactRelationError(error);
    }
  }

  /** Reads one exact immutable Fact / Relation authority commit. */
  readCanonicalFactRelationCommit(
    scope: RevisionScope,
    authorityCommitId: string
  ): CanonicalFactRelationCommitResult {
    this.assertOpen();
    try {
      assertPlainData(scope, "canonical fact/relation scope");
      return this.#canonicalFactRelationStore.readCommit(scope, authorityCommitId);
    } catch (error) {
      throw mapCanonicalFactRelationError(error);
    }
  }

  /** Freezes a provider-neutral, receipt-proven semantic interpretation read view. */
  prepareSemanticInterpretation(
    input: SemanticPreparationRequestV1,
    attestationAuthority?: SemanticAttestationAuthority
  ): SemanticInterpretationPreparationV1 {
    this.assertOpen();
    try {
      assertPlainData(input, "semantic preparation input");
      return this.#semanticFormationStore.prepare(input, attestationAuthority);
    } catch (error) {
      throw mapSemanticFormationError(error);
    }
  }

  /** Reads one exact immutable semantic interpretation preparation. */
  readSemanticInterpretationPreparation(
    scope: RevisionScope,
    preparationId: string
  ): SemanticInterpretationPreparationV1 {
    this.assertOpen();
    try {
      assertPlainData(scope, "semantic preparation scope");
      return this.#semanticFormationStore.readPreparation(scope, preparationId);
    } catch (error) {
      throw mapSemanticFormationError(error);
    }
  }

  /** Validates and atomically applies one final provider-neutral semantic proposal. */
  applyCanonicalSemanticProposal(
    proposal: CanonicalSemanticProposalV1
  ): SemanticProposalApplyResultV1 {
    this.assertOpen();
    try {
      assertPlainData(proposal, "canonical semantic proposal");
      return this.#semanticFormationStore.apply(proposal);
    } catch (error) {
      throw mapSemanticFormationError(error);
    }
  }

  /** Reads one exact immutable semantic proposal result. */
  readCanonicalSemanticProposalResult(
    scope: RevisionScope,
    proposalId: string
  ): SemanticProposalApplyResultV1 {
    this.assertOpen();
    try {
      assertPlainData(scope, "semantic proposal scope");
      return this.#semanticFormationStore.readResult(scope, proposalId);
    } catch (error) {
      throw mapSemanticFormationError(error);
    }
  }

  /** Validates E's exact legacy Raw receipts and idempotently projects canonical Formation refs. */
  projectRuntimeRawEvidence(
    input: RuntimeRawEvidenceProjectionRequestV1
  ): RuntimeRawEvidenceProjectionResultV1 {
    this.assertOpen();
    try {
      assertPlainData(input, "runtime Raw evidence projection input");
      return this.#runtimeRawEvidenceProjector.project(input);
    } catch (error) {
      throw mapCaseFormationError(error);
    }
  }

  /** CAS-commits one immutable effective-for-now conclusion and optional Experience candidate. */
  commitCaseConclusion(
    input: CaseConclusionCommitInputV1
  ): CaseFormationFinalizationReceiptV1 {
    this.assertOpen();
    try {
      assertPlainData(input, "Case conclusion input");
      return this.#caseFormationStore.commit(input);
    } catch (error) {
      throw mapCaseFormationError(error);
    }
  }

  /** Durably records an explicit RAW_ONLY disposition after semantic ABSTAINED. */
  abstainCaseFormation(
    input: CaseFormationAbstainInputV1
  ): CaseFormationFinalizationReceiptV1 {
    this.assertOpen();
    try {
      assertPlainData(input, "Case Formation abstention input");
      return this.#caseFormationStore.abstain(input);
    } catch (error) {
      throw mapCaseFormationError(error);
    }
  }

  /** Official read contract for current effective conclusions, history and provenance. */
  readCaseFormation(input: CaseFormationReadRequestV1): CaseFormationReadResultV1 {
    this.assertOpen();
    try {
      assertPlainData(input, "Case Formation read input");
      return this.#caseFormationStore.read(input);
    } catch (error) {
      throw mapCaseFormationError(error);
    }
  }

  /** Atomically commits one contiguous semantic Takeover and Frontier advance. */
  commitSemanticTakeover(input: SemanticTakeoverCommitInput): SemanticTakeoverCommit {
    this.assertOpen();
    try {
      assertPlainData(input, "semantic Takeover input");
      return this.#authorityTransactionCoordinator.commitTakeover(input);
    } catch (error) {
      throw mapSemanticTakeoverError(error);
    }
  }

  /** Commits one non-contiguous, axis-neutral semantic Enrichment. */
  commitSemanticEnrichment(
    input: SemanticEnrichmentCommitInput
  ): SemanticEnrichmentCommit {
    this.assertOpen();
    try {
      assertPlainData(input, "semantic Enrichment input");
      return this.#authorityTransactionCoordinator.commitEnrichment(input);
    } catch (error) {
      throw mapSemanticTakeoverError(error);
    }
  }

  /** Reads one exact immutable semantic Takeover commit. */
  readSemanticTakeover(
    scope: RevisionScope,
    takeoverCommitId: string
  ): SemanticTakeoverCommit {
    this.assertOpen();
    try {
      assertPlainData(scope, "semantic Takeover scope");
      return this.#authorityTransactionCoordinator.readTakeover(scope, takeoverCommitId);
    } catch (error) {
      throw mapSemanticTakeoverError(error);
    }
  }

  /** Reads one exact immutable semantic Enrichment commit. */
  readSemanticEnrichment(
    scope: RevisionScope,
    enrichmentCommitId: string
  ): SemanticEnrichmentCommit {
    this.assertOpen();
    try {
      assertPlainData(scope, "semantic Enrichment scope");
      return this.#authorityTransactionCoordinator.readEnrichment(scope, enrichmentCommitId);
    } catch (error) {
      throw mapSemanticTakeoverError(error);
    }
  }

  /** Reads one exact immutable Compaction Artifact. */
  readCompactionArtifact(scope: RevisionScope, artifactId: string): CompactionArtifact {
    this.assertOpen();
    try {
      assertPlainData(scope, "Compaction Artifact scope");
      return this.#authorityTransactionCoordinator.readArtifact(scope, artifactId);
    } catch (error) {
      throw mapSemanticTakeoverError(error);
    }
  }

  /** Reads the current same-scope Frontier/Takeover authority binding. */
  readCurrentSemanticTakeover(
    scope: RevisionScope
  ): CurrentSemanticTakeoverAuthority {
    this.assertOpen();
    try {
      assertPlainData(scope, "current semantic Takeover scope");
      return this.#authorityTransactionCoordinator.readCurrent(scope);
    } catch (error) {
      throw mapSemanticTakeoverError(error);
    }
  }

  /** Atomically freezes one deterministic immutable ContextSnapshot and Attempt receipt. */
  freezeContextSnapshot(input: ContextSnapshotFreezeInput): ContextSnapshot {
    this.assertOpen();
    try {
      assertPlainData(input, "ContextSnapshot input");
      return this.#contextSnapshotStore.freeze(input);
    } catch (error) {
      throw mapContextSnapshotError(error);
    }
  }

  /** Reads and fully validates one exact immutable ContextSnapshot. */
  readContextSnapshot(scope: RevisionScope, snapshotId: string): ContextSnapshot {
    this.assertOpen();
    try {
      assertPlainData(scope, "ContextSnapshot scope");
      return this.#contextSnapshotStore.read(scope, snapshotId);
    } catch (error) {
      throw mapContextSnapshotError(error);
    }
  }

  /** Reads the immutable AttemptStarted receipt bound to one Snapshot. */
  readContextAttemptStarted(
    scope: RevisionScope,
    attemptId: string
  ): ContextAttemptStarted {
    this.assertOpen();
    try {
      assertPlainData(scope, "ContextSnapshot attempt scope");
      return this.#contextSnapshotStore.readAttempt(scope, attemptId);
    } catch (error) {
      throw mapContextSnapshotError(error);
    }
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    let failed = false;
    for (const store of [
      this.#contextSnapshotStore,
      this.#authorityTransactionCoordinator,
      this.#caseFormationStore,
      this.#semanticFormationStore,
      this.#canonicalFactRelationStore,
      this.#canonicalStateStore,
      this.#hotRawStore,
      this.#revisionSubstrate,
      this.ledgerStore,
      this.recallStore,
      this.stateStore,
      this.rawStore,
    ]) {
      try {
        store.close();
      } catch {
        failed = true;
      }
    }
    if (failed) throw new ContextCompilerCoreError("STORAGE_FAILURE");
  }

  private assertOpen(): void {
    if (this.closed) throw new ContextCompilerCoreError("STORAGE_FAILURE");
  }

  private ingest(value: unknown): unknown {
    const input = readObject(value, ["session_id", "role", "content"], [
      "event_type", "created_at", "token_count", "metadata", "source_event_id", "dense_embedding",
    ]);
    requireNonEmptyString(input.session_id);
    requireEnum(input.role, ["system", "user", "assistant", "tool"]);
    requireString(input.content);
    optionalNonEmptyString(input.event_type);
    optionalString(input.created_at);
    optionalNonNegativeSafeInteger(input.token_count);
    optionalNonEmptyString(input.source_event_id);
    if (input.metadata !== undefined) requirePlainObject(input.metadata);
    if (input.dense_embedding !== undefined) {
      try {
        normalizeDenseEmbedding(input.dense_embedding, "dense_embedding");
      } catch {
        invalid();
      }
    }
    try {
      return this.rawStore.ingest(input as unknown as RawEventInput);
    } catch (error) {
      if (error instanceof RawEventTimestampError) {
        throw new ContextCompilerCoreError("INVALID_INPUT");
      }
      if (error instanceof Error && error.message.includes("conflicts with existing raw evidence")) {
        throw new ContextCompilerCoreError("CONFLICT");
      }
      throw new ContextCompilerCoreError("STORAGE_FAILURE");
    }
  }

  private compile(value: unknown): CompileContextResult {
    const input = readObject(value, ["session_id", "current_input"], [
      "token_budget", "recent_raw_window_turns", "operation_id", "dense_query", "context_policy",
      "session_scope",
    ]);
    const sessionId = requireNonEmptyString(input.session_id);
    const explicitSessionScope = input.session_scope !== undefined;
    let sessionScope: SessionScope;
    try {
      sessionScope = input.session_scope === undefined
        ? singleSessionScope(sessionId)
        : normalizeSessionScope(input.session_scope);
      assertCoreSessionNamespace(sessionScope);
    } catch {
      invalid();
    }
    if (sessionScope.write_session.session_id !== sessionId) invalid();
    const currentInput = requireNonBlankString(input.current_input);
    optionalIntegerInRange(input.token_budget, 0, Number.MAX_SAFE_INTEGER);
    optionalIntegerInRange(input.recent_raw_window_turns, 1, 100);
    optionalNonBlankString(input.operation_id);
    if (input.context_policy !== undefined) requirePlainObject(input.context_policy);
    let denseQuery: DenseEmbedding | undefined;
    if (input.dense_query !== undefined) {
      try {
        denseQuery = normalizeDenseEmbedding(input.dense_query, "dense_query");
      } catch {
        invalid();
      }
    }

    const startedAt = performance.now();
    const assemblerSessionId = sessionId.trim().length === 0
      ? "__context_compiler_whitespace_session__"
      : sessionId;
    let context: CompiledContext;
    try {
      context = withCompileTelemetryBoundaryInsideService(this.ledgerStore, () => {
        for (const entry of sessionScope.read_scope) {
          if (entry.frontier.kind !== "FROZEN") continue;
          if (
            this.rawStore.getSessionMaxSequence(entry.session.session_id) < entry.frontier.raw_sequence ||
            this.stateStore.getRevision(entry.session.session_id) < entry.frontier.state_revision
          ) throw new SessionScopeValidationError();
        }
        const sourceRawEvents = this.rawStore.getSessionEventsInScope(sessionScope);
        const visibleRawIds = new Set(sourceRawEvents.map(({ id }) => id));
        const scopedState = overlayScopedState(
          this.stateStore.getScopeState(sessionScope),
          visibleRawIds,
        );
        const items = scopedState.items
          .map((item) => ({ ...item, session_id: assemblerSessionId }));
        const relations = scopedState.relations
          .map((relation) => ({ ...relation, session_id: assemblerSessionId }));
        const rawEvents = sourceRawEvents
          .map((event, index) => ({ ...event, session_id: assemblerSessionId, seq: index + 1 }));
        const ledgerRecords = this.ledgerStore.getSessionRecords(sessionId);
        if (input.operation_id === undefined &&
            hasTrustedContextCompileBaseline(ledgerRecords, sessionId)) {
          throw new OperationalContextError(
            "operation_id is required after session compile telemetry has started"
          );
        }
        const operational = compileOperationalContext({
          session_id: assemblerSessionId,
          context_items: items,
          state_relations: relations,
          raw_events: rawEvents,
          current_input: currentInput,
          state_revision: this.stateStore.getRevision(sessionId),
          ...(input.token_budget === undefined ? {} : { token_budget: input.token_budget as number }),
          ...(input.recent_raw_window_turns === undefined
            ? {}
            : { recent_raw_window_turns: input.recent_raw_window_turns as number }),
          ...(input.context_policy === undefined
            ? {}
            : { context_policy: input.context_policy as unknown as ContextPolicyInput }),
          ...(denseQuery === undefined ? {} : { dense_query: denseQuery }),
          ...(input.operation_id === undefined ? {} : { operation_id: input.operation_id as string }),
          ledger_records: ledgerRecords.map((record) => ({
            ...record,
            session_id: assemblerSessionId,
          })),
        });
        const compiled = operational.context;
        if (input.operation_id !== undefined && isSingleSessionScope(sessionScope)) {
          const trace = appendContextCompileTraceInsideService(this.ledgerStore, {
            session_id: sessionId,
            operation_id: input.operation_id as string,
            payload: operational.trace_payload,
            raw_event_ids: operational.trace_raw_event_ids,
            hits: operational.hits,
          });
          compiled.operational_debug = {
            ...compiled.operational_debug,
            compile_trace_id: trace.trace.id,
            compile_trace_seq: trace.trace.seq,
            retrieval_hit_ledger_ids: trace.hits.map((record) => record.id),
          };
        }
        if (!isSingleSessionScope(sessionScope)) {
          compiled.operational_debug = {
            ...compiled.operational_debug,
            scope_telemetry: "NOT_PERSISTED_CROSS_SESSION",
          };
        }
        restoreCompiledContextProvenance(compiled, sourceRawEvents, scopedState.items);
        if (explicitSessionScope) compiled.session_scope = cloneSessionScope(sessionScope);
        return compiled;
      });
    } catch (error) {
      if (error instanceof RawEventTimestampError ||
          error instanceof ContextAssemblerValidationError ||
          error instanceof OperationalContextError ||
          error instanceof ExperienceLedgerError ||
          error instanceof SessionScopeValidationError ||
          error instanceof StateRevisionSnapshotError) throw error;
      throw new ContextCompilerCoreError("STORAGE_FAILURE");
    }
    if (assemblerSessionId !== sessionId) restoreCompiledContextSessionId(context, sessionId);
    const activeItems = [
      ...context.active_goals,
      ...context.active_constraints,
      ...context.active_decisions,
      ...context.open_questions,
      ...context.dependency_items,
    ];
    const compileLatency = Math.max(0, performance.now() - startedAt);
    return {
      context,
      metrics: {
        full_context_tokens: context.metrics.d0_full_tokens,
        compiled_context_tokens: context.metrics.d2_compiled_tokens,
        recent_window_tokens: context.metrics.d1_recent_tokens,
        active_state_tokens: estimateTokens(activeItems.map((item) => item.content).join("\n")),
        retrieved_tokens: estimateTokens(
          (context.retrieved_history ?? []).map((event) => event.content).join("\n")
        ),
        compile_latency_ms: Number.isFinite(compileLatency) ? compileLatency : 0,
        extractor_latency_ms: 0,
        active_state_items: activeItems.length,
        suppressed_items: context.debug_manifest.suppressed_state_ids.length,
      },
    };
  }

  private getState(value: unknown): unknown {
    const input = readObject(value, ["session_id"], []);
    const sessionId = requireNonEmptyString(input.session_id);
    try {
      return {
        session_id: sessionId,
        items: this.stateStore.getItems(sessionId),
        relations: this.stateStore.getSessionRelations(sessionId),
        revision: this.stateStore.getRevision(sessionId),
      };
    } catch {
      throw new ContextCompilerCoreError("STORAGE_FAILURE");
    }
  }

  private prepareStateUpdate(value: unknown): unknown {
    try {
      return this.stateUpdate.prepareStateUpdate(value);
    } catch (error) {
      throw mapStateUpdateError(error);
    }
  }

  private applyStateDelta(value: unknown): unknown {
    try {
      return this.stateUpdate.applyStateDelta(value);
    } catch (error) {
      throw mapStateUpdateError(error);
    }
  }

  private createHeadline(value: unknown): unknown {
    const input = readObject(value, [
      "session_id", "event_start_seq", "event_end_seq", "headline", "keywords",
    ], ["created_at"]);
    try {
      return this.recallStore.createHeadline(input as unknown as HistoryHeadlineInput);
    } catch (error) {
      throw mapRecallError(error);
    }
  }

  private recallExact(value: unknown): unknown {
    requirePlainObject(value);
    try {
      return this.recallStore.recallExact(value as unknown as ExactRecallQuery);
    } catch (error) {
      throw mapRecallError(error);
    }
  }

  private recallKeyword(value: unknown): unknown {
    requirePlainObject(value);
    try {
      return this.recallStore.recallKeyword(value as unknown as KeywordRecallQuery);
    } catch (error) {
      throw mapRecallError(error);
    }
  }
}

function success(result: unknown): ContextCompilerCoreSuccess {
  return { ok: true, result };
}

function failure(code: ContextCompilerCoreErrorCode): ContextCompilerCoreFailure {
  return { ok: false, error: { code } };
}

function mapRecallError(error: unknown): ContextCompilerCoreError {
  if (!(error instanceof HistoryRecallError)) return new ContextCompilerCoreError("INTERNAL_FAILURE");
  switch (error.category) {
    case "validation": return new ContextCompilerCoreError("INVALID_INPUT");
    case "not_found": return new ContextCompilerCoreError("NOT_FOUND");
    case "conflict": return new ContextCompilerCoreError("CONFLICT");
    case "state":
    case "storage": return new ContextCompilerCoreError("STORAGE_FAILURE");
  }
}

function mapStateUpdateError(error: unknown): ContextCompilerCoreError {
  if (!(error instanceof StateUpdateError)) {
    return new ContextCompilerCoreError("INTERNAL_FAILURE");
  }
  return new ContextCompilerCoreError(error.code);
}

function mapExperienceLedgerError(error: unknown): ContextCompilerCoreError {
  if (!(error instanceof ExperienceLedgerError)) {
    return new ContextCompilerCoreError("INTERNAL_FAILURE");
  }
  if (error.code === "CONFLICT") return new ContextCompilerCoreError("CONFLICT");
  if (error.code === "INVALID_INPUT" || error.code === "NOT_FOUND") {
    return new ContextCompilerCoreError("INVALID_INPUT");
  }
  return new ContextCompilerCoreError("STORAGE_FAILURE");
}

function mapRevisionSubstrateError(error: unknown): ContextCompilerCoreError {
  if (!(error instanceof RevisionSubstrateError)) {
    return new ContextCompilerCoreError("INTERNAL_FAILURE");
  }
  if (error.code === "INVALID_INPUT") return new ContextCompilerCoreError("INVALID_INPUT");
  if (error.code === "CONFLICT") return new ContextCompilerCoreError("CONFLICT");
  return new ContextCompilerCoreError("STORAGE_FAILURE");
}

function mapLedgerHotRawError(error: unknown): ContextCompilerCoreError {
  if (!(error instanceof LedgerHotRawError)) {
    return new ContextCompilerCoreError("INTERNAL_FAILURE");
  }
  if (error.code === "INVALID_INPUT") return new ContextCompilerCoreError("INVALID_INPUT");
  if (error.code === "CONFLICT") return new ContextCompilerCoreError("CONFLICT");
  return new ContextCompilerCoreError("STORAGE_FAILURE");
}

function mapCanonicalStateError(error: unknown): ContextCompilerCoreError {
  if (!(error instanceof CanonicalStateError)) {
    return new ContextCompilerCoreError("INTERNAL_FAILURE");
  }
  if (error.code === "INVALID_INPUT") return new ContextCompilerCoreError("INVALID_INPUT");
  if (error.code === "NOT_FOUND") return new ContextCompilerCoreError("NOT_FOUND");
  if (error.code === "CONFLICT") return new ContextCompilerCoreError("CONFLICT");
  return new ContextCompilerCoreError("STORAGE_FAILURE");
}

function mapCanonicalFactRelationError(error: unknown): ContextCompilerCoreError {
  if (!(error instanceof CanonicalFactRelationError)) {
    return new ContextCompilerCoreError("INTERNAL_FAILURE");
  }
  if (error.code === "INVALID_INPUT") return new ContextCompilerCoreError("INVALID_INPUT");
  if (error.code === "NOT_FOUND") return new ContextCompilerCoreError("NOT_FOUND");
  if (error.code === "CONFLICT") return new ContextCompilerCoreError("CONFLICT");
  return new ContextCompilerCoreError("STORAGE_FAILURE");
}

function mapSemanticFormationError(error: unknown): ContextCompilerCoreError {
  if (!(error instanceof SemanticFormationError)) {
    return new ContextCompilerCoreError("INTERNAL_FAILURE");
  }
  switch (error.code) {
    case "INVALID_INPUT":
    case "ATTESTATION_REJECTED": return new ContextCompilerCoreError("INVALID_INPUT");
    case "NOT_FOUND": return new ContextCompilerCoreError("NOT_FOUND");
    case "CONFLICT": return new ContextCompilerCoreError("CONFLICT");
    case "CORRUPT_DATA": return new ContextCompilerCoreError("CORRUPT_DATA");
    case "CLOSED":
    case "STORAGE_FAILURE": return new ContextCompilerCoreError("STORAGE_FAILURE");
  }
}

function mapCaseFormationError(error: unknown): ContextCompilerCoreError {
  if (!(error instanceof CaseFormationError)) {
    return new ContextCompilerCoreError("INTERNAL_FAILURE");
  }
  switch (error.code) {
    case "INVALID_INPUT": return new ContextCompilerCoreError("INVALID_INPUT");
    case "NOT_FOUND": return new ContextCompilerCoreError("NOT_FOUND");
    case "CONFLICT": return new ContextCompilerCoreError("CONFLICT");
    case "CORRUPT_DATA": return new ContextCompilerCoreError("CORRUPT_DATA");
    case "CLOSED":
    case "STORAGE_FAILURE": return new ContextCompilerCoreError("STORAGE_FAILURE");
  }
}

function mapSemanticTakeoverError(error: unknown): ContextCompilerCoreError {
  if (!(error instanceof SemanticTakeoverError)) {
    return new ContextCompilerCoreError("INTERNAL_FAILURE");
  }
  if (error.code === "INVALID_INPUT") return new ContextCompilerCoreError("INVALID_INPUT");
  if (error.code === "NOT_FOUND") return new ContextCompilerCoreError("NOT_FOUND");
  if (error.code === "CONFLICT") return new ContextCompilerCoreError("CONFLICT");
  return new ContextCompilerCoreError("STORAGE_FAILURE");
}

function mapContextSnapshotError(error: unknown): ContextCompilerCoreError {
  if (!(error instanceof ContextSnapshotError)) {
    return new ContextCompilerCoreError("INTERNAL_FAILURE");
  }
  switch (error.code) {
    case "INVALID_INPUT": return new ContextCompilerCoreError("INVALID_INPUT");
    case "NOT_FOUND": return new ContextCompilerCoreError("NOT_FOUND");
    case "CONFLICT": return new ContextCompilerCoreError("CONFLICT");
    case "BUDGET_INSUFFICIENT": return new ContextCompilerCoreError("BUDGET_INSUFFICIENT");
    case "CORRUPT_DATA": return new ContextCompilerCoreError("CORRUPT_DATA");
    case "CLOSED":
    case "STORAGE_FAILURE": return new ContextCompilerCoreError("STORAGE_FAILURE");
  }
}

function classifyError(error: unknown): ContextCompilerCoreErrorCode {
  if (error instanceof ContextCompilerCoreError) return error.code;
  if (error instanceof RawEventTimestampError) return "INVALID_INPUT";
  if (error instanceof ContextAssemblerValidationError) return "INVALID_INPUT";
  if (error instanceof OperationalContextError) return "INVALID_INPUT";
  if (error instanceof ExperienceLedgerError) return mapExperienceLedgerError(error).code;
  if (error instanceof SessionScopeValidationError) return "INVALID_INPUT";
  if (error instanceof StateRevisionSnapshotError) return "CORRUPT_DATA";
  return "INTERNAL_FAILURE";
}

function readObject(
  value: unknown,
  required: readonly string[],
  optional: readonly string[]
): Record<string, unknown> {
  requirePlainObject(value);
  assertKeys(value, required, optional);
  return value;
}

function requirePlainObject(value: unknown): asserts value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) invalid();
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) invalid();
}

function assertKeys(value: unknown, required: readonly string[], optional: readonly string[]): void {
  requirePlainObject(value);
  const allowed = new Set([...required, ...optional]);
  const keys = Reflect.ownKeys(value);
  for (const key of keys) {
    if (typeof key !== "string" || !allowed.has(key)) invalid();
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor?.enumerable || !("value" in descriptor)) invalid();
  }
  for (const key of required) if (!Object.prototype.hasOwnProperty.call(value, key)) invalid();
}

function assertPlainData(value: unknown, path: string, ancestors = new Set<object>()): void {
  if (value === null || typeof value === "string" || typeof value === "boolean") return;
  if (typeof value === "number") {
    if (!Number.isFinite(value) || Object.is(value, -0)) invalid();
    return;
  }
  if (typeof value !== "object" || ancestors.has(value)) invalid();
  const prototype = Object.getPrototypeOf(value);
  if (Array.isArray(value)) {
    if (prototype !== Array.prototype) invalid();
  } else if (prototype !== Object.prototype && prototype !== null) invalid();
  ancestors.add(value);
  for (const key of Reflect.ownKeys(value)) {
    if (Array.isArray(value) && key === "length") continue;
    if (typeof key !== "string") invalid();
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor?.enumerable || !("value" in descriptor)) invalid();
    assertPlainData(descriptor.value, `${path}.${key}`, ancestors);
  }
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      if (!Object.prototype.hasOwnProperty.call(value, index)) invalid();
    }
  }
  ancestors.delete(value);
}

function requireString(value: unknown): string {
  if (typeof value !== "string") invalid();
  return value;
}

function requireNonEmptyString(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) invalid();
  return value;
}

function requireNonBlankString(value: unknown): string {
  if (typeof value !== "string" || value.trim().length === 0) invalid();
  return value;
}

function requireEnum<T extends string>(value: unknown, allowed: readonly T[]): T {
  if (typeof value !== "string" || !allowed.includes(value as T)) invalid();
  return value as T;
}

function optionalString(value: unknown): void {
  if (value !== undefined) requireString(value);
}

function optionalNonEmptyString(value: unknown): void {
  if (value !== undefined) requireNonEmptyString(value);
}

function optionalNonBlankString(value: unknown): void {
  if (value !== undefined &&
      (typeof value !== "string" || value.trim().length === 0 || value.length > 500)) {
    invalid();
  }
}

function optionalNonNegativeSafeInteger(value: unknown): void {
  if (value !== undefined && (!Number.isSafeInteger(value) || (value as number) < 0)) invalid();
}

function optionalIntegerInRange(value: unknown, minimum: number, maximum: number): void {
  if (value !== undefined &&
      (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum)) {
    invalid();
  }
}

function invalid(): never {
  throw new ContextCompilerCoreError("INVALID_INPUT");
}

function restoreCompiledContextSessionId(context: CompiledContext, original: string): void {
  context.session_id = original;
  for (const items of [
    context.active_goals,
    context.active_constraints,
    context.active_decisions,
    context.open_questions,
    context.dependency_items,
  ]) {
    for (const item of items) item.session_id = original;
  }
  for (const event of context.recent_conversation) event.session_id = original;
  for (const event of context.retrieved_history ?? []) event.session_id = original;
}

function restoreCompiledContextProvenance(
  context: CompiledContext,
  rawEvents: ReadonlyArray<{ id: string; session_id: string; seq: number }>,
  items: ReadonlyArray<{ id: string; session_id: string }>,
): void {
  const rawById = new Map(rawEvents.map((event) => [event.id, event]));
  const itemById = new Map(items.map((item) => [item.id, item]));
  for (const values of [
    context.active_goals,
    context.active_constraints,
    context.active_decisions,
    context.open_questions,
    context.dependency_items,
  ]) {
    for (const item of values) {
      const source = itemById.get(item.id);
      if (source !== undefined) item.session_id = source.session_id;
    }
  }
  for (const values of [context.recent_conversation, context.retrieved_history ?? []]) {
    for (const event of values) {
      const source = rawById.get(event.id);
      if (source !== undefined) {
        event.session_id = source.session_id;
        event.seq = source.seq;
      }
    }
  }
}
