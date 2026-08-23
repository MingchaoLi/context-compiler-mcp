#!/usr/bin/env node

import { readFileSync, realpathSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { EvaluationErrorCode } from "./evaluation.js";
import { acquireSqliteExperimentalWarningFilter } from "./sqlite-warning.js";

const restoreWarnings = acquireSqliteExperimentalWarningFilter();
const evaluation = await import("./evaluation.js").finally(restoreWarnings);

export const EVALUATION_CLI_EXIT = {
  passed: 0,
  thresholdFailed: 2,
  invalidInput: 3,
  runtimeFailure: 4,
} as const;

export interface EvaluationCliIo {
  stdout: (text: string) => void;
  stderr: (text: string) => void;
}

const processIo: EvaluationCliIo = {
  stdout: (text) => process.stdout.write(text),
  stderr: (text) => process.stderr.write(text),
};

export function runEvaluationCli(
  args: readonly string[],
  io: EvaluationCliIo = processIo
): number {
  if (args.length !== 1) return writeError("INVALID_INPUT", io);

  let source: string;
  try {
    source = readFileSync(args[0]!, "utf8");
  } catch {
    return writeError("RUNTIME_FAILURE", io);
  }

  let input: unknown;
  try {
    input = JSON.parse(source) as unknown;
  } catch {
    return writeError("INVALID_INPUT", io);
  }

  try {
    const version = inputVersion(input);
    const report = version === evaluation.EVALUATION_REPORT_VERSION
      ? evaluation.runEvaluationSuite(input)
      : version === evaluation.EVALUATION_REPORT_VERSION_V2
        ? evaluation.runEvaluationSuiteV2(input)
        : undefined;
    if (report === undefined) return writeError("INVALID_INPUT", io);
    io.stdout(`${JSON.stringify(report)}\n`);
    return report.passed ? EVALUATION_CLI_EXIT.passed : EVALUATION_CLI_EXIT.thresholdFailed;
  } catch (error) {
    return writeError(
      error instanceof evaluation.EvaluationError ? error.code : "RUNTIME_FAILURE",
      io,
      inputVersion(input) === evaluation.EVALUATION_REPORT_VERSION_V2
        ? evaluation.EVALUATION_REPORT_VERSION_V2
        : evaluation.EVALUATION_REPORT_VERSION
    );
  }
}

function writeError(
  code: EvaluationErrorCode,
  io: EvaluationCliIo,
  version: 1 | 2 = evaluation.EVALUATION_REPORT_VERSION
): number {
  io.stderr(`${JSON.stringify({
    version,
    passed: false,
    error: { code },
  })}\n`);
  return code === "INVALID_INPUT"
    ? EVALUATION_CLI_EXIT.invalidInput
    : EVALUATION_CLI_EXIT.runtimeFailure;
}

function inputVersion(input: unknown): unknown {
  if (input === null || typeof input !== "object" || Array.isArray(input)) return undefined;
  const descriptor = Object.getOwnPropertyDescriptor(input, "version");
  return descriptor !== undefined && "value" in descriptor ? descriptor.value : undefined;
}

const invokedPath = process.argv[1];
if (invokedPath !== undefined && isMainModule(invokedPath)) {
  process.exitCode = runEvaluationCli(process.argv.slice(2));
}

function isMainModule(invokedPath: string): boolean {
  try {
    return realpathSync(resolve(invokedPath)) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}
