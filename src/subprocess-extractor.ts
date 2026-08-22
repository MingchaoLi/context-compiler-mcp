import { spawn, type ChildProcess } from "node:child_process";
import type { ExtractorTransport, ExtractorTransportOptions } from "./extractor.js";

export const DEFAULT_EXTRACTOR_TIMEOUT_MS = 30_000;
export const DEFAULT_EXTRACTOR_MAX_REQUEST_BYTES = 1_048_576;
export const DEFAULT_EXTRACTOR_MAX_OUTPUT_BYTES = 1_048_576;

const MAX_EXTRACTOR_TIMEOUT_MS = 300_000;
const MAX_EXTRACTOR_BUFFER_BYTES = 16_777_216;
const MAX_EXECUTABLE_LENGTH = 4_096;
const MAX_ARGUMENT_COUNT = 128;
const MAX_ARGUMENT_LENGTH = 4_096;

export type SubprocessExtractorErrorCode =
  | "INVALID_INPUT"
  | "CLOSED"
  | "SPAWN_FAILURE"
  | "WRITE_FAILURE"
  | "TIMEOUT"
  | "REQUEST_LIMIT"
  | "OUTPUT_LIMIT"
  | "PROCESS_FAILURE"
  | "INVALID_RESPONSE"
  | "ABORTED";

export class SubprocessExtractorError extends Error {
  constructor(readonly code: SubprocessExtractorErrorCode) {
    super(code);
    this.name = "SubprocessExtractorError";
  }
}

export interface JsonSubprocessExtractorOptions {
  executable: string;
  args?: string[];
  timeout_ms?: number;
  max_request_bytes?: number;
  max_output_bytes?: number;
}

interface NormalizedOptions {
  executable: string;
  args: string[];
  timeoutMs: number;
  maxRequestBytes: number;
  maxOutputBytes: number;
}

/**
 * One isolated child per completion. The child owns any provider/network logic;
 * this transport only exchanges a strict local JSON envelope over stdio.
 */
export class JsonSubprocessExtractorTransport implements ExtractorTransport {
  private readonly executable: string;
  private readonly args: string[];
  private readonly timeoutMs: number;
  private readonly maxRequestBytes: number;
  private readonly maxOutputBytes: number;
  private readonly activeRuns = new Set<Promise<void>>();
  private readonly activeTerminators = new Set<(code: SubprocessExtractorErrorCode) => void>();
  private closed = false;

  constructor(options: JsonSubprocessExtractorOptions) {
    const normalized = parseConstructorOptions(options);
    this.executable = normalized.executable;
    this.args = normalized.args;
    this.timeoutMs = normalized.timeoutMs;
    this.maxRequestBytes = normalized.maxRequestBytes;
    this.maxOutputBytes = normalized.maxOutputBytes;
  }

  async complete(promptValue: string, optionsValue: ExtractorTransportOptions): Promise<string> {
    const prompt = parsePrompt(promptValue);
    const signal = parseTransportOptions(optionsValue);
    if (this.closed) return Promise.reject(new SubprocessExtractorError("CLOSED"));
    if (signal?.aborted) return Promise.reject(new SubprocessExtractorError("ABORTED"));

    if (Buffer.byteLength(prompt, "utf8") > this.maxRequestBytes) {
      return Promise.reject(new SubprocessExtractorError("REQUEST_LIMIT"));
    }
    const request = JSON.stringify({ version: 1, prompt });
    if (Buffer.byteLength(request, "utf8") > this.maxRequestBytes) {
      return Promise.reject(new SubprocessExtractorError("REQUEST_LIMIT"));
    }

    let child: ChildProcess;
    try {
      child = spawn(this.executable, this.args, {
        shell: false,
        windowsHide: true,
        stdio: ["pipe", "pipe", "ignore"],
      });
    } catch {
      return Promise.reject(new SubprocessExtractorError("SPAWN_FAILURE"));
    }

    let terminate!: (code: SubprocessExtractorErrorCode) => void;
    const operation = new Promise<string>((resolve, reject) => {
      let settled = false;
      let forcedCode: SubprocessExtractorErrorCode | undefined;
      let outputBytes = 0;
      const output: Buffer[] = [];
      const timeout = setTimeout(() => terminate("TIMEOUT"), this.timeoutMs);
      timeout.unref();

      const cleanup = (): void => {
        clearTimeout(timeout);
        signal?.removeEventListener("abort", onAbort);
        this.activeTerminators.delete(terminate);
      };
      const rejectOnce = (code: SubprocessExtractorErrorCode): void => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(new SubprocessExtractorError(code));
      };
      const resolveOnce = (value: string): void => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(value);
      };
      terminate = (code): void => {
        if (settled || forcedCode !== undefined) return;
        forcedCode = code;
        try {
          if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
        } catch {
          rejectOnce(code);
        }
      };
      const onAbort = (): void => terminate("ABORTED");
      this.activeTerminators.add(terminate);
      signal?.addEventListener("abort", onAbort, { once: true });

      child.once("error", () => rejectOnce(forcedCode ?? "SPAWN_FAILURE"));
      child.stdin?.once("error", () => terminate("WRITE_FAILURE"));
      child.stdout?.on("data", (chunk: Buffer | string) => {
        if (settled || forcedCode !== undefined) return;
        const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        outputBytes += bytes.length;
        if (outputBytes > this.maxOutputBytes) {
          terminate("OUTPUT_LIMIT");
          return;
        }
        output.push(bytes);
      });
      child.once("close", (code, closeSignal) => {
        if (forcedCode !== undefined) {
          rejectOnce(forcedCode);
          return;
        }
        if (code !== 0 || closeSignal !== null) {
          rejectOnce("PROCESS_FAILURE");
          return;
        }
        try {
          resolveOnce(parseResponseEnvelope(Buffer.concat(output).toString("utf8")));
        } catch {
          rejectOnce("INVALID_RESPONSE");
        }
      });

      try {
        child.stdin?.end(request, "utf8");
      } catch {
        terminate("WRITE_FAILURE");
      }
    });

    const observed = operation.then(() => undefined, () => undefined);
    this.activeRuns.add(observed);
    return operation.finally(() => this.activeRuns.delete(observed));
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    for (const terminate of [...this.activeTerminators]) terminate("CLOSED");
    await Promise.allSettled([...this.activeRuns]);
  }
}

function parseConstructorOptions(value: unknown): NormalizedOptions {
  const record = requireExactRecord(
    value,
    ["executable"],
    ["args", "timeout_ms", "max_request_bytes", "max_output_bytes"]
  );
  const executable = boundedNonBlankString(record.executable, MAX_EXECUTABLE_LENGTH);
  const args = record.args === undefined ? [] : parseArguments(record.args);
  return {
    executable,
    args,
    timeoutMs: optionalBoundedInteger(
      record.timeout_ms,
      1,
      MAX_EXTRACTOR_TIMEOUT_MS,
      DEFAULT_EXTRACTOR_TIMEOUT_MS
    ),
    maxRequestBytes: optionalBoundedInteger(
      record.max_request_bytes,
      1,
      MAX_EXTRACTOR_BUFFER_BYTES,
      DEFAULT_EXTRACTOR_MAX_REQUEST_BYTES
    ),
    maxOutputBytes: optionalBoundedInteger(
      record.max_output_bytes,
      1,
      MAX_EXTRACTOR_BUFFER_BYTES,
      DEFAULT_EXTRACTOR_MAX_OUTPUT_BYTES
    ),
  };
}

function parseArguments(value: unknown): string[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) invalid();
  if (value.length > MAX_ARGUMENT_COUNT) invalid();
  const result: string[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor?.enumerable || !("value" in descriptor)) invalid();
    if (typeof descriptor.value !== "string" || descriptor.value.length > MAX_ARGUMENT_LENGTH) {
      invalid();
    }
    result.push(descriptor.value);
  }
  for (const key of Reflect.ownKeys(value)) {
    if (key === "length") continue;
    if (typeof key !== "string" || !/^(0|[1-9]\d*)$/.test(key) || Number(key) >= value.length) {
      invalid();
    }
  }
  return result;
}

function parsePrompt(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) invalid();
  return value;
}

function parseTransportOptions(value: unknown): AbortSignal | undefined {
  const record = requireExactRecord(value, [], ["signal"]);
  if (record.signal === undefined) return undefined;
  if (!(record.signal instanceof AbortSignal)) invalid();
  return record.signal;
}

function parseResponseEnvelope(source: string): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(source) as unknown;
  } catch {
    invalid();
  }
  const record = requireExactRecord(parsed, ["version", "delta"], []);
  if (record.version !== 1 || !isPlainObject(record.delta)) invalid();
  return JSON.stringify(record.delta);
}

function requireExactRecord(
  value: unknown,
  required: readonly string[],
  optional: readonly string[]
): Record<string, unknown> {
  if (!isPlainObject(value)) invalid();
  const allowed = new Set([...required, ...optional]);
  const record: Record<string, unknown> = {};
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string" || !allowed.has(key)) invalid();
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor?.enumerable || !("value" in descriptor)) invalid();
    record[key] = descriptor.value;
  }
  for (const key of required) if (!Object.hasOwn(record, key)) invalid();
  return record;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function boundedNonBlankString(value: unknown, maximum: number): string {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > maximum) invalid();
  return value;
}

function optionalBoundedInteger(
  value: unknown,
  minimum: number,
  maximum: number,
  fallback: number
): number {
  if (value === undefined) return fallback;
  if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum) {
    invalid();
  }
  return value as number;
}

function invalid(): never {
  throw new SubprocessExtractorError("INVALID_INPUT");
}
