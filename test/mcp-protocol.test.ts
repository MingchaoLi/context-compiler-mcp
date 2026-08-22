import { execFileSync, spawn } from "node:child_process";
import {
  cpSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync,
} from "node:fs";
import { cp, rename, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runContextCompilerMcpServer } from "../src/mcp-server.js";
import { copyCompilerDistribution } from "../../scripts/prepare-sidecar.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const serverEntry = join(root, "context-compiler", "dist", "mcp-server.js");
const temporaryRoot = mkdtempSync(join(tmpdir(), "context-compiler-mcp-protocol-"));
const databasePath = join(temporaryRoot, "protocol.db");

beforeAll(() => {
  execFileSync(process.execPath, [
    join(root, "node_modules", "typescript", "bin", "tsc"),
    "-p", join(root, "context-compiler", "tsconfig.json"),
  ], { cwd: root, stdio: "pipe" });
});

afterAll(() => rmSync(temporaryRoot, { recursive: true, force: true }));

describe("Context Compiler stdio MCP protocol", () => {
  it("initializes, lists exactly seven tools, calls each tool, and keeps stdout protocol-pure", async () => {
    const connection = await connect(serverEntry, databasePath);
    try {
      const listed = await connection.client.listTools();
      expect(listed.tools.map((tool) => tool.name)).toEqual([
        "health", "ingest_event", "compile_context", "get_state",
        "create_headline", "recall_exact", "recall_keyword",
      ]);
      const headlineSchema = listed.tools.find((tool) => tool.name === "create_headline")
        ?.inputSchema.properties?.created_at;
      expect(headlineSchema).toEqual({
        type: "string",
        format: "date-time",
        pattern: "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{3}Z$",
      });
      expect(parse(await connection.client.callTool({ name: "health", arguments: {} }))).toMatchObject({ ok: true, result: { ready: true } });
      const event = parse(await connection.client.callTool({
        name: "ingest_event",
        arguments: { session_id: "proto", role: "user", content: "protocol durable", source_event_id: "p-1" },
      })) as any;
      expect(event.ok).toBe(true);
      expect(parse(await connection.client.callTool({
        name: "compile_context", arguments: { session_id: "proto", current_input: "continue" },
      }))).toMatchObject({ ok: true, result: { metrics: { retrieved_tokens: 0, extractor_latency_ms: 0 } } });
      expect(parse(await connection.client.callTool({
        name: "get_state", arguments: { session_id: "proto" },
      }))).toMatchObject({ ok: true, result: { revision: 0 } });
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

  it("starts from a self-contained packaged harness layout without root dependency resolution", async () => {
    const packagedRoot = join(temporaryRoot, "packaged", "harness");
    const packagedDist = join(packagedRoot, "context-compiler-dist");
    mkdirSync(packagedRoot, { recursive: true });
    cpSync(join(root, "context-compiler", "dist"), packagedDist, { recursive: true });
    cpSync(join(root, "node_modules"), join(packagedRoot, "node_modules"), { recursive: true });
    const packagedDatabase = join(temporaryRoot, "packaged.db");
    const connection = await connect(join(packagedDist, "mcp-server.js"), packagedDatabase, packagedRoot);
    try {
      expect(parse(await connection.client.callTool({ name: "health", arguments: {} }))).toMatchObject({ ok: true, result: { ready: true } });
      expect(connection.stderr.join("")).toBe("");
    } finally {
      await close(connection);
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
      expect((await inProcessClient.listTools()).tools).toHaveLength(7);
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

  it("restores the prior sidecar dist and cleans staging paths after copy or rename failure", async () => {
    const copyRoot = join(temporaryRoot, "copy-failure");
    const source = join(copyRoot, "source");
    const destination = join(copyRoot, "context-compiler-dist");
    mkdirSync(source, { recursive: true });
    mkdirSync(destination, { recursive: true });
    writeFileSync(join(source, "marker"), "new");
    writeFileSync(join(destination, "marker"), "old");

    await expect(copyCompilerDistribution(source, destination, {
      cp: async (from: string, to: string, options: Parameters<typeof cp>[2]) => {
        await cp(from, to, options);
        throw new Error("injected cp failure");
      },
      rename,
      rm,
    })).rejects.toThrow("injected cp failure");
    expect(readFileSync(join(destination, "marker"), "utf8")).toBe("old");
    expect(stagingEntries(copyRoot)).toEqual([]);

    await expect(copyCompilerDistribution(source, destination, {
      cp,
      rename: async () => { throw new Error("injected backup failure"); },
      rm,
    })).rejects.toThrow("injected backup failure");
    expect(readFileSync(join(destination, "marker"), "utf8")).toBe("old");
    expect(stagingEntries(copyRoot)).toEqual([]);

    let renameCalls = 0;
    await expect(copyCompilerDistribution(source, destination, {
      cp,
      rename: async (from: string, to: string) => {
        renameCalls += 1;
        if (renameCalls === 2) throw new Error("injected promotion failure");
        await rename(from, to);
      },
      rm,
    })).rejects.toThrow("injected promotion failure");
    expect(readFileSync(join(destination, "marker"), "utf8")).toBe("old");
    expect(stagingEntries(copyRoot)).toEqual([]);

    renameCalls = 0;
    await expect(copyCompilerDistribution(source, destination, {
      cp,
      rename: async (from: string, to: string) => {
        renameCalls += 1;
        if (renameCalls >= 2) throw new Error("injected publish and restore failure");
        await rename(from, to);
      },
      rm,
    })).rejects.toThrow("injected publish and restore failure");
    expect(readFileSync(join(destination, "marker"), "utf8")).toBe("old");
    expect(stagingEntries(copyRoot)).toEqual([]);

    await copyCompilerDistribution(source, destination);
    expect(readFileSync(join(destination, "marker"), "utf8")).toBe("new");
    expect(stagingEntries(copyRoot)).toEqual([]);
  });
});

function stagingEntries(directory: string): string[] {
  return readdirSync(directory).filter((entry) =>
    entry.startsWith("context-compiler-dist.tmp-") || entry.startsWith("context-compiler-dist.old-")
  );
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
