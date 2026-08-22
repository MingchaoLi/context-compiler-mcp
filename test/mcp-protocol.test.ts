import { execFileSync, spawn } from "node:child_process";
import { cpSync, mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

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
});

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
