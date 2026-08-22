#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  EvaluationError,
  EVALUATION_REPORT_VERSION,
  runEvaluationSuite,
  type EvaluationErrorCode,
} from "./evaluation.js";

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
    const report = runEvaluationSuite(input);
    io.stdout(`${JSON.stringify(report)}\n`);
    return report.passed ? EVALUATION_CLI_EXIT.passed : EVALUATION_CLI_EXIT.thresholdFailed;
  } catch (error) {
    return writeError(error instanceof EvaluationError ? error.code : "RUNTIME_FAILURE", io);
  }
}

function writeError(code: EvaluationErrorCode, io: EvaluationCliIo): number {
  io.stderr(`${JSON.stringify({
    version: EVALUATION_REPORT_VERSION,
    passed: false,
    error: { code },
  })}\n`);
  return code === "INVALID_INPUT"
    ? EVALUATION_CLI_EXIT.invalidInput
    : EVALUATION_CLI_EXIT.runtimeFailure;
}

const invokedPath = process.argv[1];
if (invokedPath !== undefined && import.meta.url === pathToFileURL(resolve(invokedPath)).href) {
  process.exitCode = runEvaluationCli(process.argv.slice(2));
}
