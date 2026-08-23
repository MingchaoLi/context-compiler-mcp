import { execFileSync, spawn, spawnSync } from "node:child_process";
import {
  chmodSync, cpSync, existsSync, mkdtempSync, mkdirSync, readFileSync, renameSync,
  rmSync, symlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  acquireSqliteExperimentalWarningFilter,
  runContextCompilerMcpServer,
} from "../src/mcp-server.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const serverEntry = join(root, "dist", "mcp-server.js");
const temporaryRoot = mkdtempSync(join(tmpdir(), "context-compiler-mcp-protocol-"));
const databasePath = join(temporaryRoot, "protocol.db");

beforeAll(() => {
  execFileSync(process.execPath, [
    join(root, "node_modules", "typescript", "bin", "tsc"),
    "-p", join(root, "tsconfig.json"),
  ], { cwd: root, stdio: "pipe" });
});

afterAll(() => rmSync(temporaryRoot, { recursive: true, force: true }));

describe("Context Compiler stdio MCP protocol", () => {
  it("initializes, lists exactly nine tools, calls each tool, and keeps stdout protocol-pure", async () => {
    const connection = await connect(serverEntry, databasePath);
    try {
      const listed = await connection.client.listTools();
      expect(connection.client.getServerVersion()).toEqual({
        name: "context-compiler-mcp",
        version: "0.1.0",
      });
      expect(listed.tools.map((tool) => tool.name)).toEqual([
        "health", "ingest_event", "compile_context", "get_state",
        "prepare_state_update", "apply_state_delta",
        "create_headline", "recall_exact", "recall_keyword",
      ]);
      const headlineSchema = listed.tools.find((tool) => tool.name === "create_headline")
        ?.inputSchema.properties?.created_at;
      expect(headlineSchema).toEqual({
        type: "string",
        format: "date-time",
        pattern: "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{3}Z$",
      });
      const prepareSchema = listed.tools.find((tool) => tool.name === "prepare_state_update")
        ?.inputSchema as any;
      expect(prepareSchema).toMatchObject({
        additionalProperties: false,
        required: ["session_id", "newest_event_ids"],
        properties: {
          newest_event_ids: { minItems: 1, maxItems: 100, uniqueItems: true },
        },
      });
      const applySchema = listed.tools.find((tool) => tool.name === "apply_state_delta")
        ?.inputSchema as any;
      expect(applySchema).toMatchObject({
        additionalProperties: false,
        required: [
          "session_id", "preparation_token", "fingerprint", "expected_revision", "delta",
        ],
        properties: { delta: { additionalProperties: false } },
      });
      expect(
        applySchema.properties.delta.properties.new_goals.items.additionalProperties
      ).toBe(false);
      expect(parse(await connection.client.callTool({ name: "health", arguments: {} }))).toMatchObject({ ok: true, result: { ready: true } });
      const event = parse(await connection.client.callTool({
        name: "ingest_event",
        arguments: { session_id: "proto", role: "user", content: "protocol durable", source_event_id: "p-1" },
      })) as any;
      expect(event.ok).toBe(true);
      const prepared = parse(await connection.client.callTool({
        name: "prepare_state_update",
        arguments: { session_id: "proto", newest_event_ids: [event.result.id] },
      })) as any;
      expect(prepared).toMatchObject({
        ok: true,
        result: { expected_revision: 0, extractor_input: { newest_events: [{ id: event.result.id }] } },
      });
      expect(parse(await connection.client.callTool({
        name: "apply_state_delta",
        arguments: {
          session_id: "proto",
          preparation_token: prepared.result.preparation_token,
          fingerprint: prepared.result.fingerprint,
          expected_revision: prepared.result.expected_revision,
          delta: { ...emptyDelta(), new_goals: [{ content: "Protocol state", source_refs: [event.result.id] }] },
        },
      }))).toMatchObject({ ok: true, result: { changed: true, revision: 1 } });
      expect(parse(await connection.client.callTool({
        name: "compile_context", arguments: { session_id: "proto", current_input: "continue" },
      }))).toMatchObject({
        ok: true,
        result: {
          context: { active_goals: [{ content: "Protocol state" }] },
          metrics: { retrieved_tokens: 0, extractor_latency_ms: 0 },
        },
      });
      expect(parse(await connection.client.callTool({
        name: "get_state", arguments: { session_id: "proto" },
      }))).toMatchObject({ ok: true, result: { revision: 1 } });
      const headline = parse(await connection.client.callTool({
        name: "create_headline",
        arguments: { session_id: "proto", event_start_seq: 1, event_end_seq: 1, headline: "Protocol durable", keywords: ["protocol"] },
      })) as any;
      expect(headline.ok).toBe(true);
      expect(parse(await connection.client.callTool({
        name: "create_headline",
        arguments: {
          session_id: "proto", event_start_seq: 1, event_end_seq: 1,
          headline: "Protocol durable", keywords: ["protocol"], created_at: "not-an-iso-date",
        },
      }))).toEqual({ ok: false, error: { code: "INVALID_INPUT" } });
      expect(parse(await connection.client.callTool({
        name: "recall_exact",
        arguments: { kind: "headline_id", session_id: "proto", headline_id: headline.result.id },
      }))).toMatchObject({ ok: true, result: { found: true } });
      expect(parse(await connection.client.callTool({
        name: "recall_keyword", arguments: { session_id: "proto", query: "protocol OR *", limit: 5 },
      }))).toMatchObject({ ok: true, result: [{ events: [{ id: event.result.id }] }] });
      expect(connection.stderr.join("")).toBe("");
    } finally {
      await close(connection);
    }
  });

  it("returns sanitized tool errors, preserves long sessions, and survives restart", async () => {
    let connection = await connect(serverEntry, databasePath);
    const longSession = "会".repeat(5000);
    try {
      const invalid = await connection.client.callTool({
        name: "recall_keyword", arguments: { session_id: "proto", query: "private-query", limit: 21 },
      });
      expect(invalid.isError).toBe(true);
      expect(parse(invalid)).toEqual({ ok: false, error: { code: "INVALID_INPUT" } });
      expect(JSON.stringify(invalid)).not.toContain("private-query");
      for (const session_id of ["   ", "x".repeat(501), longSession]) {
        expect(parse(await connection.client.callTool({
          name: "ingest_event", arguments: { session_id, role: "user", content: "long" },
        }))).toMatchObject({ ok: true });
        expect(parse(await connection.client.callTool({
          name: "compile_context", arguments: { session_id, current_input: "again" },
        }))).toMatchObject({ ok: true, result: { context: { session_id } } });
      }
    } finally {
      await close(connection);
    }
    connection = await connect(serverEntry, databasePath);
    try {
      expect(parse(await connection.client.callTool({
        name: "recall_keyword", arguments: { session_id: "proto", query: "protocol" },
      }))).toMatchObject({ ok: true, result: [{ headline: { headline: "Protocol durable" } }] });
      expect(parse(await connection.client.callTool({
        name: "compile_context", arguments: { session_id: longSession, current_input: "again" },
      }))).toMatchObject({ ok: true, result: { context: { recent_conversation: [{ content: "long" }] } } });
    } finally {
      await close(connection);
    }
  });

  it("starts from an npm package with only declared runtime dependencies", async () => {
    const packagedRoot = join(temporaryRoot, "packaged");
    const npmCache = join(temporaryRoot, "npm-cache");
    mkdirSync(packagedRoot, { recursive: true });
    const packed = JSON.parse(execFileSync(npmCommand(), [
      "pack", "--json", "--ignore-scripts", "--cache", npmCache,
      "--pack-destination", packagedRoot,
    ], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] })) as Array<{
      filename: string;
    }>;
    expect(packed).toHaveLength(1);
    const archive = join(packagedRoot, packed[0]!.filename);
    execFileSync("tar", ["-xzf", archive, "-C", packagedRoot], { stdio: "pipe" });
    const packageRoot = join(packagedRoot, "package");
    cpSync(join(root, "package-lock.json"), join(packageRoot, "package-lock.json"));
    cpSync(join(root, "node_modules"), join(packageRoot, "node_modules"), { recursive: true });
    execFileSync(npmCommand(), [
      "prune", "--omit=dev", "--ignore-scripts", "--offline", "--no-audit", "--no-fund",
      "--cache", npmCache,
    ], { cwd: packageRoot, stdio: "pipe" });
    const packageMetadata = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8")) as {
      name?: string;
    };
    expect(packageMetadata.name).toBe("context-compiler-mcp");
    expect(existsSync(join(packageRoot, "node_modules", "@modelcontextprotocol", "sdk"))).toBe(true);
    expect(existsSync(join(packageRoot, "node_modules", "zod"))).toBe(true);
    expect(existsSync(join(packageRoot, "node_modules", "vitest"))).toBe(false);
    expect(existsSync(join(packageRoot, "node_modules", "typescript"))).toBe(false);
    const packagedDatabase = join(temporaryRoot, "packaged.db");
    const connection = await connect(
      join(packageRoot, "dist", "mcp-server.js"), packagedDatabase, packageRoot
    );
    try {
      expect(parse(await connection.client.callTool({ name: "health", arguments: {} }))).toMatchObject({ ok: true, result: { ready: true } });
      expect(connection.stderr.join("")).toBe("");
    } finally {
      await close(connection);
    }

    if (process.platform !== "win32") {
      const applicationRoot = join(packagedRoot, "application");
      const applicationModules = join(applicationRoot, "node_modules");
      const installedPackage = join(applicationModules, "context-compiler-mcp");
      const binDirectory = join(applicationModules, ".bin");
      mkdirSync(binDirectory, { recursive: true });
      renameSync(packageRoot, installedPackage);
      const evaluationEntry = join(installedPackage, "dist", "evaluation-cli.js");
      chmodSync(evaluationEntry, 0o755);
      const evaluationBin = join(binDirectory, "context-compiler-eval");
      symlinkSync("../context-compiler-mcp/dist/evaluation-cli.js", evaluationBin);

      const validEvaluation = spawnSync(evaluationBin, [
        join(root, "test", "fixtures", "evaluation-suite.json"),
      ], { cwd: applicationRoot, encoding: "utf8" });
      expect(validEvaluation.status).toBe(0);
      expect(validEvaluation.stderr).toBe("");
      expect(JSON.parse(validEvaluation.stdout)).toMatchObject({ version: 1, passed: true });

      const calibratedEvaluation = spawnSync(evaluationBin, [
        join(root, "test", "fixtures", "evaluation-v2-calibration.json"),
      ], { cwd: applicationRoot, encoding: "utf8" });
      expect(calibratedEvaluation.status).toBe(0);
      expect(calibratedEvaluation.stderr).toBe("");
      expect(JSON.parse(calibratedEvaluation.stdout)).toMatchObject({
        version: 2,
        passed: true,
        cases: [
          {
            id: "calibration-empty-probes",
            dimensions: {
              d2: { constraint_retention: { status: "not_evaluable", rate: null } },
            },
          },
          {
            id: "calibration-current-input-contamination",
            dimensions: {
              d1: { constraint_retention: { status: "evaluable", matched: 0 } },
              d2: { constraint_retention: { status: "evaluable", matched: 0 } },
            },
          },
          {
            id: "calibration-d2-cost",
            d2_vs_d1_tokens: { status: "evaluable" },
          },
        ],
      });
      const calibratedReport = JSON.parse(calibratedEvaluation.stdout) as {
        cases: Array<{ d2_vs_d1_tokens: { ratio: number | null } }>;
      };
      expect(calibratedReport.cases[2]!.d2_vs_d1_tokens.ratio).toBeGreaterThan(1);

      const missingEvaluation = spawnSync(evaluationBin, [
        join(applicationRoot, "missing-evaluation-suite.json"),
      ], { cwd: applicationRoot, encoding: "utf8" });
      expect(missingEvaluation.status).toBe(4);
      expect(missingEvaluation.stdout).toBe("");
      expect(JSON.parse(missingEvaluation.stderr)).toEqual({
        version: 1, passed: false, error: { code: "RUNTIME_FAILURE" },
      });

      const packagedApi = await import(
        pathToFileURL(join(installedPackage, "dist", "index.js")).href
      ) as typeof import("../src/index.js");
      const runtimeDatabase = join(temporaryRoot, "packaged-runtime.db");
      const packagedRawStore = new packagedApi.SqliteRawHistoryStore(runtimeDatabase);
      const packagedStateStore = new packagedApi.SqliteContextStateStore(runtimeDatabase);
      const packagedTransport = new packagedApi.JsonSubprocessExtractorTransport({
        executable: process.execPath,
        args: [join(root, "test", "fixtures", "extractor-worker.mjs"), "goal"],
      });
      try {
        const runtimeEvent = packagedRawStore.ingest({
          session_id: "packaged-runtime",
          role: "user",
          content: "create packaged runtime state",
        });
        const runtimeResult = await packagedApi.runStateUpdate(
          packagedStateStore,
          packagedTransport,
          { session_id: "packaged-runtime", newest_event_ids: [runtimeEvent.id] }
        );
        expect(runtimeResult).toMatchObject({
          extraction: { fallback_used: false },
          application: { changed: true, revision: 1 },
        });
      } finally {
        await packagedTransport.close();
        packagedStateStore.close();
        packagedRawStore.close();
      }
    }
  }, 60_000);

  it("fails startup without a database environment using only a stable diagnostic", async () => {
    const child = spawn(process.execPath, [serverEntry], {
      cwd: temporaryRoot,
      env: {},
      stdio: ["pipe", "pipe", "pipe"],
    });
    const stdout: string[] = [];
    const stderr: string[] = [];
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => stdout.push(String(chunk)));
    child.stderr.on("data", (chunk) => stderr.push(String(chunk)));
    const exitCode = await new Promise<number | null>((resolvePromise, rejectPromise) => {
      child.once("error", rejectPromise);
      child.once("close", resolvePromise);
    });
    expect(exitCode).toBe(1);
    expect(stdout.join("")).toBe("");
    expect(stderr.join("")).toBe("CONTEXT_COMPILER_STARTUP_FAILURE\n");
  });

  it("filters only the exact SQLite warning and restores emitWarning on every in-process path", async () => {
    const original = process.emitWarning;
    const forwarded: Array<{ warning: string | Error; arguments_: unknown[] }> = [];
    const spy = ((warning: string | Error, ...arguments_: unknown[]) => {
      forwarded.push({ warning, arguments_ });
    }) as typeof process.emitWarning;
    process.emitWarning = spy;
    try {
      const missingPair = InMemoryTransport.createLinkedPair();
      await expect(runContextCompilerMcpServer({}, missingPair[0])).rejects.toThrow();
      expect(process.emitWarning).toBe(spy);

      const invalidDatabaseDirectory = join(temporaryRoot, "database-directory");
      mkdirSync(invalidDatabaseDirectory, { recursive: true });
      const constructionPair = InMemoryTransport.createLinkedPair();
      await expect(runContextCompilerMcpServer(
        { CONTEXT_COMPILER_DB_PATH: invalidDatabaseDirectory }, constructionPair[0]
      )).rejects.toThrow();
      expect(process.emitWarning).toBe(spy);

      const failingTransport = {
        async start() {
          process.emitWarning(
            "SQLite is an experimental feature and might change at any time",
            "ExperimentalWarning"
          );
          process.emitWarning("security-sentinel", "SecurityWarning");
          throw new Error("connect failure");
        },
        async send() {},
        async close() { this.onclose?.(); },
        onclose: undefined as (() => void) | undefined,
        onerror: undefined as ((error: Error) => void) | undefined,
        onmessage: undefined as ((message: any) => void) | undefined,
      };
      await expect(runContextCompilerMcpServer(
        { CONTEXT_COMPILER_DB_PATH: join(temporaryRoot, "connect-failure.db") },
        failingTransport
      )).rejects.toThrow("connect failure");
      expect(process.emitWarning).toBe(spy);
      expect(forwarded.map((entry) => entry.warning)).toContain("security-sentinel");
      expect(forwarded.map((entry) => entry.warning)).not.toContain(
        "SQLite is an experimental feature and might change at any time"
      );

      const sigintBeforeClientClose = new Set(process.listeners("SIGINT"));
      const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
      await runContextCompilerMcpServer(
        { CONTEXT_COMPILER_DB_PATH: join(temporaryRoot, "client-close.db") },
        serverTransport
      );
      const inProcessClient = new Client({ name: "lifecycle-test", version: "1.0.0" });
      await inProcessClient.connect(clientTransport);
      expect((await inProcessClient.listTools()).tools).toHaveLength(9);
      await inProcessClient.close();
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 0));
      expect(process.emitWarning).toBe(spy);
      expect(process.listeners("SIGINT").every((listener) => sigintBeforeClientClose.has(listener))).toBe(true);

      for (const signal of ["SIGINT", "SIGTERM"] as const) {
        const listenersBefore = new Set(process.listeners(signal));
        const [serverTransport] = InMemoryTransport.createLinkedPair();
        const originalStart = serverTransport.start.bind(serverTransport);
        serverTransport.start = async () => {
          process.emitWarning("lifecycle-sentinel", "DeprecationWarning");
          await originalStart();
        };
        await runContextCompilerMcpServer(
          { CONTEXT_COMPILER_DB_PATH: join(temporaryRoot, `${signal}.db`) },
          serverTransport
        );
        expect(process.emitWarning).toBe(spy);
        const signalHandler = process.listeners(signal).find((listener) => !listenersBefore.has(listener));
        expect(signalHandler).toBeDefined();
        signalHandler?.(signal);
        await new Promise((resolvePromise) => setTimeout(resolvePromise, 0));
        expect(process.listeners(signal).every((listener) => listenersBefore.has(listener))).toBe(true);
        expect(process.emitWarning).toBe(spy);
      }
      process.emitWarning("after-lifecycle", "DeprecationWarning");
      expect(forwarded.map((entry) => entry.warning)).toEqual(expect.arrayContaining([
        "security-sentinel", "lifecycle-sentinel", "after-lifecycle",
      ]));
    } finally {
      process.emitWarning = original;
    }
  });

  it("coordinates overlapping warning-filter leases regardless of runner completion order", async () => {
    const original = process.emitWarning;
    const forwarded: string[] = [];
    const spy = ((warning: string | Error) => {
      forwarded.push(typeof warning === "string" ? warning : warning.message);
    }) as typeof process.emitWarning;
    const listenerBaselines = {
      SIGINT: new Set(process.listeners("SIGINT")),
      SIGTERM: new Set(process.listeners("SIGTERM")),
      beforeExit: new Set(process.listeners("beforeExit")),
    };
    process.emitWarning = spy;
    try {
      for (const completionOrder of [[0, 1], [1, 0]] as const) {
        const first = delayedInMemoryTransport();
        const second = delayedInMemoryTransport();
        const firstRun = runContextCompilerMcpServer(
          { CONTEXT_COMPILER_DB_PATH: join(temporaryRoot, `overlap-${completionOrder.join("")}-a.db`) },
          first.transport
        );
        await first.started;
        const filterIdentity = process.emitWarning;
        expect(filterIdentity).not.toBe(spy);
        const secondRun = runContextCompilerMcpServer(
          { CONTEXT_COMPILER_DB_PATH: join(temporaryRoot, `overlap-${completionOrder.join("")}-b.db`) },
          second.transport
        );
        await second.started;
        expect(process.emitWarning).toBe(filterIdentity);
        const forwardedBefore = forwarded.filter((value) => value === "overlap-forwarded").length;
        emitWarningSentinels();
        expect(forwarded.filter((value) => value === "overlap-forwarded")).toHaveLength(
          forwardedBefore + 1
        );

        const runs = [firstRun, secondRun] as const;
        const controls = [first, second] as const;
        controls[completionOrder[0]].release();
        await runs[completionOrder[0]];
        expect(process.emitWarning).toBe(filterIdentity);
        emitWarningSentinels();
        expect(forwarded.filter((value) => value === "overlap-forwarded")).toHaveLength(
          forwardedBefore + 2
        );
        controls[completionOrder[1]].release();
        await runs[completionOrder[1]];
        expect(process.emitWarning).toBe(spy);
        await Promise.all([first.transport.close(), second.transport.close()]);
        await new Promise((resolvePromise) => setTimeout(resolvePromise, 0));
      }

      const success = delayedInMemoryTransport();
      const successRun = runContextCompilerMcpServer(
        { CONTEXT_COMPILER_DB_PATH: join(temporaryRoot, "overlap-success.db") },
        success.transport
      );
      await success.started;
      const mixedFilterIdentity = process.emitWarning;
      const failing = failingStartTransport("mixed connect failure");
      await expect(runContextCompilerMcpServer(
        { CONTEXT_COMPILER_DB_PATH: join(temporaryRoot, "overlap-failure.db") },
        failing
      )).rejects.toThrow("mixed connect failure");
      expect(process.emitWarning).toBe(mixedFilterIdentity);
      success.release();
      await successRun;
      expect(process.emitWarning).toBe(spy);
      await success.transport.close();

      const threeRunners = [
        delayedInMemoryTransport(), delayedInMemoryTransport(), delayedInMemoryTransport(),
      ] as const;
      const threeRuns = threeRunners.map((control, index) => runContextCompilerMcpServer(
        { CONTEXT_COMPILER_DB_PATH: join(temporaryRoot, `overlap-three-${index}.db`) },
        control.transport
      ));
      await Promise.all(threeRunners.map((control) => control.started));
      const threeRunnerIdentity = process.emitWarning;
      expect(threeRunnerIdentity).not.toBe(spy);
      for (const index of [1, 0]) {
        threeRunners[index].release();
        await threeRuns[index];
        expect(process.emitWarning).toBe(threeRunnerIdentity);
      }
      threeRunners[2].release();
      await threeRuns[2];
      expect(process.emitWarning).toBe(spy);
      await Promise.all(threeRunners.map((control) => control.transport.close()));

      const eightReleases = Array.from(
        { length: 8 },
        () => acquireSqliteExperimentalWarningFilter()
      );
      const eightLeaseIdentity = process.emitWarning;
      const releaseOrder = [3, 0, 6, 1, 7, 2, 5, 4];
      for (const [position, index] of releaseOrder.entries()) {
        eightReleases[index]!();
        eightReleases[index]!();
        expect(process.emitWarning).toBe(
          position === releaseOrder.length - 1 ? spy : eightLeaseIdentity
        );
      }

      await new Promise((resolvePromise) => setTimeout(resolvePromise, 0));
      for (const [event, baseline] of Object.entries(listenerBaselines) as Array<
        [keyof typeof listenerBaselines, Set<(...arguments_: any[]) => void>]
      >) {
        const listeners = process.listeners(event);
        expect(listeners).toHaveLength(baseline.size);
        expect(listeners.every((listener) => baseline.has(listener))).toBe(true);
      }
    } finally {
      process.emitWarning = original;
    }
  });

  it("preserves chained and plain external warning replacements without recursion", () => {
    const original = process.emitWarning;
    const forwarded: string[] = [];
    const spy = ((warning: string | Error) => {
      forwarded.push(typeof warning === "string" ? warning : warning.message);
    }) as typeof process.emitWarning;
    process.emitWarning = spy;
    try {
      const releaseA = acquireSqliteExperimentalWarningFilter();
      const releaseB = acquireSqliteExperimentalWarningFilter();
      const capturedFilter = process.emitWarning;
      const chained = ((warning: string | Error, ...arguments_: unknown[]) => {
        Reflect.apply(capturedFilter, process, [warning, ...arguments_]);
      }) as typeof process.emitWarning;
      process.emitWarning = chained;

      const releaseC = acquireSqliteExperimentalWarningFilter();
      expect(process.emitWarning).toBe(chained);
      emitExternalWarningSet();
      expect(forwarded).toEqual(["external-security", "external-deprecation"]);
      releaseB();
      releaseB();
      expect(process.emitWarning).toBe(chained);
      emitExternalWarningSet();
      expect(forwarded).toEqual([
        "external-security", "external-deprecation",
        "external-security", "external-deprecation",
      ]);
      releaseC();
      releaseA();
      expect(process.emitWarning).toBe(chained);

      process.emitWarning = spy;
      const plainReleaseA = acquireSqliteExperimentalWarningFilter();
      const plainReleaseB = acquireSqliteExperimentalWarningFilter();
      const plainForwarded: string[] = [];
      const plain = ((warning: string | Error) => {
        plainForwarded.push(typeof warning === "string" ? warning : warning.message);
      }) as typeof process.emitWarning;
      process.emitWarning = plain;
      const plainReleaseC = acquireSqliteExperimentalWarningFilter();
      expect(process.emitWarning).toBe(plain);
      process.emitWarning("plain-security", "SecurityWarning");
      expect(plainForwarded).toEqual(["plain-security"]);
      plainReleaseB();
      plainReleaseC();
      expect(process.emitWarning).toBe(plain);
      plainReleaseA();
      expect(process.emitWarning).toBe(plain);
    } finally {
      process.emitWarning = original;
    }
  });

  it("allows only one conflicting non-empty apply across independent server processes", async () => {
    const concurrentDatabase = join(temporaryRoot, "concurrent-apply.db");
    const first = await connect(serverEntry, concurrentDatabase);
    const second = await connect(serverEntry, concurrentDatabase);
    try {
      const ingested = parse(await first.client.callTool({
        name: "ingest_event",
        arguments: { session_id: "concurrent", role: "user", content: "race source" },
      })) as any;
      const eventId = ingested.result.id as string;
      const prepared = await Promise.all([first, second].map(async (connection) => {
        const result = parse(await connection.client.callTool({
          name: "prepare_state_update",
          arguments: { session_id: "concurrent", newest_event_ids: [eventId] },
        })) as any;
        expect(result).toMatchObject({ ok: true, result: { expected_revision: 0 } });
        return result.result;
      }));

      const results = await Promise.all([first, second].map(async (connection, index) =>
        parse(await connection.client.callTool({
          name: "apply_state_delta",
          arguments: {
            session_id: "concurrent",
            preparation_token: prepared[index].preparation_token,
            fingerprint: prepared[index].fingerprint,
            expected_revision: prepared[index].expected_revision,
            delta: {
              ...emptyDelta(),
              new_goals: [{ content: `winner-${index}`, source_refs: [eventId] }],
            },
          },
        })) as any
      ));

      expect(results.filter((result) => result.ok)).toHaveLength(1);
      expect(results.filter((result) => !result.ok)).toEqual([
        { ok: false, error: { code: "CONFLICT" } },
      ]);
      expect(parse(await first.client.callTool({
        name: "get_state", arguments: { session_id: "concurrent" },
      }))).toMatchObject({ ok: true, result: { revision: 1, items: [{ type: "GOAL" }] } });
    } finally {
      await Promise.all([close(first), close(second)]);
    }
  });

});

function emptyDelta() {
  return {
    new_goals: [],
    updated_goals: [],
    new_constraints: [],
    updated_constraints: [],
    new_decisions: [],
    resolved_questions: [],
    new_open_questions: [],
    rejected_alternatives: [],
    supersessions: [],
    new_relations: [],
  };
}

function npmCommand(): string {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

function emitWarningSentinels(): void {
  process.emitWarning(
    "SQLite is an experimental feature and might change at any time",
    "ExperimentalWarning"
  );
  process.emitWarning("overlap-forwarded", "SecurityWarning");
}

function emitExternalWarningSet(): void {
  process.emitWarning(
    "SQLite is an experimental feature and might change at any time",
    "ExperimentalWarning"
  );
  process.emitWarning("external-security", "SecurityWarning");
  process.emitWarning("external-deprecation", "DeprecationWarning");
}

function delayedInMemoryTransport(): {
  transport: InMemoryTransport;
  started: Promise<void>;
  release: () => void;
} {
  const [transport] = InMemoryTransport.createLinkedPair();
  const originalStart = transport.start.bind(transport);
  let markStarted!: () => void;
  let releaseStart!: () => void;
  const started = new Promise<void>((resolvePromise) => { markStarted = resolvePromise; });
  const gate = new Promise<void>((resolvePromise) => { releaseStart = resolvePromise; });
  transport.start = async () => {
    markStarted();
    await gate;
    await originalStart();
  };
  return { transport, started, release: releaseStart };
}

function failingStartTransport(message: string) {
  return {
    async start() { throw new Error(message); },
    async send() {},
    async close() { this.onclose?.(); },
    onclose: undefined as (() => void) | undefined,
    onerror: undefined as ((error: Error) => void) | undefined,
    onmessage: undefined as ((message: any) => void) | undefined,
  };
}

interface Connection {
  client: Client;
  transport: StdioClientTransport;
  stderr: string[];
  pid: number;
}

async function connect(entry: string, database: string, cwd = temporaryRoot): Promise<Connection> {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [entry],
    cwd,
    env: { CONTEXT_COMPILER_DB_PATH: database },
    stderr: "pipe",
  });
  const stderr: string[] = [];
  transport.stderr?.setEncoding("utf8");
  transport.stderr?.on("data", (chunk) => stderr.push(String(chunk)));
  const client = new Client({ name: "context-compiler-test", version: "1.0.0" });
  try {
    await client.connect(transport);
  } catch (error) {
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 20));
    throw new Error(`${error instanceof Error ? error.message : String(error)}; stderr=${stderr.join("")}`);
  }
  const pid = transport.pid;
  if (pid === null) throw new Error("MCP child has no pid");
  return { client, transport, stderr, pid };
}

async function close(connection: Connection): Promise<void> {
  await connection.client.close();
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try { process.kill(connection.pid, 0); } catch { return; }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 10));
  }
  throw new Error(`MCP child ${connection.pid} remained alive after close`);
}

function parse(result: Awaited<ReturnType<Client["callTool"]>>): unknown {
  const content = result.content;
  if (!Array.isArray(content) || content.length !== 1 || content[0]?.type !== "text") {
    throw new Error("Expected one JSON text content item");
  }
  return JSON.parse(content[0].text);
}
