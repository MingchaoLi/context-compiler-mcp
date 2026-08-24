import { join } from "node:path";
import {
  CONTEXT_COMPILER_COMMANDS,
  CONTEXT_COMPILER_CORE_VERSION,
  ContextCompilerCore,
  ContextCompilerCoreError,
  type CompileContextMetrics,
  type CompileContextResult,
  type ContextCompilerCommandName,
  type ContextCompilerCommandPort,
  type ContextCompilerCoreErrorCode,
  type ContextCompilerCoreFailure,
  type ContextCompilerCoreResponse,
  type ContextCompilerCoreSuccess,
} from "./core.js";

export const CONTEXT_COMPILER_SERVICE_VERSION = CONTEXT_COMPILER_CORE_VERSION;
export const CONTEXT_COMPILER_CAPABILITIES = CONTEXT_COMPILER_COMMANDS;

export type ContextCompilerToolName = ContextCompilerCommandName;
export type ContextCompilerErrorCode = ContextCompilerCoreErrorCode;
export type ContextCompilerToolSuccess = ContextCompilerCoreSuccess;
export type ContextCompilerToolFailure = ContextCompilerCoreFailure;
export type ContextCompilerToolResponse = ContextCompilerCoreResponse;
export type { CompileContextMetrics, CompileContextResult };

export class ContextCompilerServiceError extends Error {
  constructor(readonly code: ContextCompilerErrorCode) {
    super(code);
    this.name = "ContextCompilerServiceError";
  }
}

/** Host-owned configuration compatibility. Core receives only the resolved path. */
export function resolveContextCompilerDatabasePath(
  environment: NodeJS.ProcessEnv = process.env
): string {
  const explicit = environment.CONTEXT_COMPILER_DB_PATH;
  if (typeof explicit === "string" && explicit.length > 0) return explicit;
  const legacyHostHome = environment.DSH_HOME;
  if (typeof legacyHostHome === "string" && legacyHostHome.length > 0) {
    return join(legacyHostHome, "sessions", "context-compiler.db");
  }
  throw new ContextCompilerServiceError("INVALID_INPUT");
}

/**
 * MCP/Host adapter over the stable Context Compiler command port. Supplying a
 * command port transfers lifecycle ownership to this adapter.
 */
export class ContextCompilerMcpService {
  private readonly core: ContextCompilerCommandPort;
  private closed = false;

  constructor(databasePathOrCore: string | ContextCompilerCommandPort) {
    if (typeof databasePathOrCore !== "string") {
      this.core = databasePathOrCore;
      return;
    }
    try {
      this.core = new ContextCompilerCore(databasePathOrCore);
    } catch (error) {
      throw mapCoreError(error);
    }
  }

  call(tool: ContextCompilerToolName, input: unknown): ContextCompilerToolResponse {
    if (this.closed) return failure("STORAGE_FAILURE");
    try {
      return this.core.call(tool, input);
    } catch (error) {
      return failure(error instanceof ContextCompilerCoreError
        ? error.code
        : "INTERNAL_FAILURE");
    }
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    try {
      this.core.close();
    } catch (error) {
      throw mapCoreError(error);
    }
  }
}

function failure(code: ContextCompilerErrorCode): ContextCompilerToolFailure {
  return { ok: false, error: { code } };
}

function mapCoreError(error: unknown): ContextCompilerServiceError {
  if (error instanceof ContextCompilerCoreError) {
    return new ContextCompilerServiceError(error.code);
  }
  return new ContextCompilerServiceError("INTERNAL_FAILURE");
}
