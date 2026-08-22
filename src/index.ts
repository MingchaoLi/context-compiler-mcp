export {
  SqliteRawHistoryStore,
  estimateTokens,
  type JsonObject,
  type JsonValue,
  type RawEvent,
  type RawEventInput,
  type RawEventRole,
  type RawHistoryStore,
} from "./raw-store.js";

export { StateReducer, type ReducerResult } from "./reducer.js";
export {
  SqliteContextStateStore,
  type DecisionSupersessionResult,
  type QuestionResolutionResult,
  type StateItemInput,
  type StateItemPatch,
  type StateTransactionResult,
  StateRevisionConflictError,
  type StateUpdatePreparationRecord,
} from "./state-store.js";
export {
  EMPTY_STATE_DELTA,
  type ConstraintStatus,
  type ContextItem,
  type ContextItemStatus,
  type ContextItemType,
  type DecisionStatus,
  type GoalStatus,
  type NewItemDelta,
  type OpenQuestionStatus,
  type RejectedAlternativeStatus,
  type RelationType,
  type StateDelta,
  type StateRelation,
} from "./state-types.js";

export {
  ExtractorValidationError,
  StrictStateExtractor,
  createEmptyStateDelta,
  parseStrictStateDelta,
  parseStrictStateDeltaPayload,
  type ExtractorErrorCode,
  type ExtractorInput,
  type ExtractorResult,
  type ExtractorTransport,
  type ExtractorTransportOptions,
  type StrictStateExtractorOptions,
} from "./extractor.js";

export {
  MAX_PREPARED_NEWEST_EVENTS,
  StateUpdateCoordinator,
  StateUpdateError,
  apply_state_delta,
  applyStateDelta,
  prepare_state_update,
  prepareStateUpdate,
  type ApplyStateDeltaInput,
  type ApplyStateDeltaResult,
  type PrepareStateUpdateInput,
  type PrepareStateUpdateResult,
  type StateUpdateErrorCode,
} from "./state-update.js";

export {
  ContextAssemblerValidationError,
  assembleContext,
  renderCompiledContext,
  type ClosureEdge,
  type CompactHistoricalNote,
  type CompiledContext,
  type ContextAssemblerInput,
  type ContextDebugManifest,
  type ContextMetrics,
  type DependencyPath,
} from "./assembler.js";

export {
  HistoryRecallError,
  SqliteHistoryRecallStore,
  type EventIdRecallQuery,
  type EventIdRecallResult,
  type ExactRecallQuery,
  type ExactRecallResult,
  type HeadlineIdRecallQuery,
  type HeadlineIdRecallResult,
  type HistoryHeadline,
  type HistoryHeadlineInput,
  type HistoryRecallErrorCategory,
  type HistoryRecallErrorCode,
  type KeywordRecallHit,
  type KeywordRecallQuery,
  type SeqRangeRecallQuery,
  type SeqRangeRecallResult,
} from "./recall.js";

export {
  CONTEXT_COMPILER_CAPABILITIES,
  CONTEXT_COMPILER_SERVICE_VERSION,
  ContextCompilerMcpService,
  ContextCompilerServiceError,
  resolveContextCompilerDatabasePath,
  type CompileContextMetrics,
  type CompileContextResult,
  type ContextCompilerErrorCode,
  type ContextCompilerToolFailure,
  type ContextCompilerToolName,
  type ContextCompilerToolResponse,
  type ContextCompilerToolSuccess,
} from "./mcp-service.js";

export {
  createContextCompilerMcpServer,
  runContextCompilerMcpServer,
} from "./mcp-server.js";

export {
  EVALUATION_REPORT_VERSION,
  EvaluationError,
  normalizeEvaluationText,
  parseEvaluationSuite,
  runEvaluationSuite,
  type EvaluationAggregateDimension,
  type EvaluationCase,
  type EvaluationCaseResult,
  type EvaluationDimensionResult,
  type EvaluationErrorCode,
  type EvaluationProbes,
  type EvaluationRate,
  type EvaluationRecallQuery,
  type EvaluationReport,
  type EvaluationSuite,
  type EvaluationThresholdFailure,
  type EvaluationThresholds,
} from "./evaluation.js";

export {
  EVALUATION_CLI_EXIT,
  runEvaluationCli,
  type EvaluationCliIo,
} from "./evaluation-cli.js";
