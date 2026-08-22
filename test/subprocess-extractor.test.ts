// @vitest-environment node

import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  JsonSubprocessExtractorTransport,
  SubprocessExtractorError,
  type JsonSubprocessExtractorOptions,
  type SubprocessExtractorErrorCode,
} from "../src/subprocess-extractor.js";

const worker = join(process.cwd(), "test", "fixtures", "extractor-worker.mjs");
const temporaryDirectories: string[] = [];
const transports = new Set<JsonSubprocessExtractorTransport>();

afterEach(async () => {
  await Promise.allSettled([...transports].map((transport) => transport.close()));
  transports.clear();
  await Promise.all(temporaryDirectories.splice(0).map((directory) =>
    rm(directory, { recursive: true, force: true })
  ));
});

function createTransport(
  mode: string,
  overrides: Partial<JsonSubprocessExtractorOptions> = {},
  extraArgs: string[] = []
): JsonSubprocessExtractorTransport {
  const transport = new JsonSubprocessExtractorTransport({
    executable: process.execPath,
    args: [worker, mode, ...extraArgs],
    timeout_ms: 1_000,
    ...overrides,
  });
  transports.add(transport);
  return transport;
}

async function expectCode(
  operation: Promise<unknown>,
  code: SubprocessExtractorErrorCode
): Promise<void> {
  await expect(operation).rejects.toEqual(expect.objectContaining({
    name: "SubprocessExtractorError",
    code,
    message: code,
  }));
}

describe("JsonSubprocessExtractorTransport", () => {
  it("writes and reads the exact version-1 envelopes", async () => {
    const directory = await mkdtemp(join(tmpdir(), "context-compiler-worker-audit-"));
    temporaryDirectories.push(directory);
    const auditPath = join(directory, "request.json");
    const transport = createTransport("audit", {}, [auditPath]);

    const completion = await transport.complete("provider-neutral prompt", {});

    expect(JSON.parse(completion)).toEqual(emptyDelta());
    expect(JSON.parse(await readFile(auditPath, "utf8"))).toEqual({
      version: 1,
      prompt: "provider-neutral prompt",
    });
  });

  it("ignores secret-bearing stderr while returning the valid completion", async () => {
    const completion = await createTransport("stderr").complete("PRIVATE-PROMPT", {});
    expect(JSON.parse(completion)).toEqual(emptyDelta());
    expect(completion).not.toContain("PRIVATE-WORKER-DIAGNOSTIC");
  });

  it("inherits the launcher environment without adding it to the envelope", async () => {
    const previous = process.env.CONTEXT_COMPILER_TEST_SENTINEL;
    process.env.CONTEXT_COMPILER_TEST_SENTINEL = "inherited-sentinel";
    try {
      const completion = await createTransport("environment").complete("prompt", {});
      expect(JSON.parse(completion).new_goals).toEqual([{ content: "inherited-sentinel" }]);
    } finally {
      if (previous === undefined) delete process.env.CONTEXT_COMPILER_TEST_SENTINEL;
      else process.env.CONTEXT_COMPILER_TEST_SENTINEL = previous;
    }
  });

  it.each(["malformed", "extra-envelope", "wrong-version", "wrong-shape", "double-json"])(
    "rejects %s output with one sanitized code",
    async (mode) => {
      await expectCode(
        createTransport(mode).complete("PRIVATE-EVIDENCE", {}),
        "INVALID_RESPONSE"
      );
    }
  );

  it("maps nonzero and signaled children without stderr or prompt leakage", async () => {
    await expectCode(createTransport("nonzero").complete("PRIVATE-PROMPT", {}), "PROCESS_FAILURE");
    await expectCode(createTransport("signal").complete("PRIVATE-PROMPT", {}), "PROCESS_FAILURE");
  });

  it("maps asynchronous spawn failure without exposing the executable", async () => {
    const privateExecutable = join(tmpdir(), "PRIVATE-MISSING-EXTRACTOR");
    const transport = new JsonSubprocessExtractorTransport({ executable: privateExecutable });
    transports.add(transport);
    let caught: unknown;
    try {
      await transport.complete("PRIVATE-PROMPT", {});
    } catch (error) {
      caught = error;
    }
    expect(caught).toEqual(expect.objectContaining({ code: "SPAWN_FAILURE" }));
    expect(JSON.stringify(caught)).not.toContain(privateExecutable);
    expect(JSON.stringify(caught)).not.toContain("PRIVATE-PROMPT");
  });

  it("kills and rejects an unresponsive child at the configured timeout", async () => {
    const transport = createTransport("timeout", { timeout_ms: 30 });
    await expectCode(transport.complete("prompt", {}), "TIMEOUT");
  });

  it("rejects request overflow before spawning", async () => {
    const transport = createTransport("audit", { max_request_bytes: 32 });
    await expectCode(transport.complete("x".repeat(100), {}), "REQUEST_LIMIT");
  });

  it("kills a child when stdout exceeds the configured byte bound", async () => {
    const transport = createTransport("overflow", { max_output_bytes: 100 });
    await expectCode(transport.complete("prompt", {}), "OUTPUT_LIMIT");
  });

  it("rejects pre-abort without spawning and mid-flight abort after cleanup", async () => {
    const pre = new AbortController();
    pre.abort();
    await expectCode(createTransport("audit").complete("prompt", { signal: pre.signal }), "ABORTED");

    const active = new AbortController();
    const operation = createTransport("timeout", { timeout_ms: 5_000 })
      .complete("prompt", { signal: active.signal });
    setTimeout(() => active.abort(), 20);
    await expectCode(operation, "ABORTED");
  });

  it("close kills active children, waits for them, and is idempotent", async () => {
    const transport = createTransport("timeout", { timeout_ms: 5_000 });
    const operation = transport.complete("prompt", {});
    await new Promise((resolve) => setTimeout(resolve, 20));
    await transport.close();
    await expectCode(operation, "CLOSED");
    await transport.close();
    await expectCode(transport.complete("prompt", {}), "CLOSED");
  });

  it("uses independent children for concurrent completions", async () => {
    const transport = createTransport("delayed-goal");
    const [first, second] = await Promise.all([
      transport.complete("first", {}),
      transport.complete("second", {}),
    ]);
    expect(JSON.parse(first).new_goals).toEqual([{ content: "Runtime-created goal" }]);
    expect(second).toBe(first);
  });

  it("maps a closed child stdin without leaking the submitted prompt", async () => {
    const transport = createTransport("stdin-failure", {
      timeout_ms: 500,
      max_request_bytes: 2_000_000,
    });
    let caught: unknown;
    try {
      await transport.complete("PRIVATE-PROMPT".repeat(50_000), {});
    } catch (error) {
      caught = error;
    }
    expect(caught).toEqual(expect.objectContaining({ code: "WRITE_FAILURE" }));
    expect(JSON.stringify(caught)).not.toContain("PRIVATE-PROMPT");
  });

  it.each([
    ["non-object", null],
    ["unknown field", { executable: process.execPath, extra: true }],
    ["blank executable", { executable: " " }],
    ["too many args", { executable: process.execPath, args: Array(129).fill("x") }],
    ["invalid timeout", { executable: process.execPath, timeout_ms: 0 }],
    ["invalid request bound", { executable: process.execPath, max_request_bytes: -1 }],
    ["invalid output bound", { executable: process.execPath, max_output_bytes: 20_000_000 }],
    ["prototype", Object.assign(Object.create(null), { executable: process.execPath })],
  ])("rejects invalid constructor input: %s", (_label, value) => {
    expect(() => new JsonSubprocessExtractorTransport(value as never)).toThrowError(
      expect.objectContaining({ code: "INVALID_INPUT" })
    );
  });

  it("rejects sparse/accessor constructor data without invoking accessors", () => {
    const sparse = [worker, , "audit"] as string[];
    expect(() => new JsonSubprocessExtractorTransport({
      executable: process.execPath, args: sparse,
    })).toThrowError(expect.objectContaining({ code: "INVALID_INPUT" }));

    let accessed = false;
    const options = { executable: process.execPath } as JsonSubprocessExtractorOptions & {
      extra?: string;
    };
    Object.defineProperty(options, "extra", {
      enumerable: true,
      get() { accessed = true; return "PRIVATE"; },
    });
    expect(() => new JsonSubprocessExtractorTransport(options)).toThrowError(
      expect.objectContaining({ code: "INVALID_INPUT" })
    );
    expect(accessed).toBe(false);
  });

  it("rejects invalid complete inputs before process work", async () => {
    const transport = createTransport("audit");
    await expectCode(transport.complete("" as never, {}), "INVALID_INPUT");
    await expectCode(transport.complete("prompt", { extra: true } as never), "INVALID_INPUT");
    await expectCode(transport.complete("prompt", Object.create(null)), "INVALID_INPUT");
  });
});

function emptyDelta() {
  return {
    new_goals: [], updated_goals: [], new_constraints: [], updated_constraints: [],
    new_decisions: [], resolved_questions: [], new_open_questions: [],
    rejected_alternatives: [], supersessions: [], new_relations: [],
  };
}

expect(new SubprocessExtractorError("TIMEOUT").message).toBe("TIMEOUT");
