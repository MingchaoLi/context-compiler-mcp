import { parentPort, workerData } from "node:worker_threads";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const barrier = new Int32Array(workerData.barrier);
parentPort.postMessage({ type: "ready" });
Atomics.wait(barrier, 0, 0);

let store;
let client;
try {
  const library = await import(pathToFileURL(join(workerData.root, "dist", "index.js")).href);
  if (workerData.kind === "raw_open") {
    store = new library.SqliteRawHistoryStore(workerData.database);
    parentPort.postMessage({ type: "result", ok: true });
  } else if (workerData.kind === "service_health") {
    store = new library.ContextCompilerMcpService(workerData.database);
    parentPort.postMessage({
      type: "result",
      ok: true,
      response: store.call("health", {}),
    });
  } else if (workerData.kind === "raw_ingest") {
    store = new library.SqliteRawHistoryStore(workerData.database);
    const event = store.ingest({
      session_id: "concurrent-raw",
      role: "user",
      content: "same source payload",
      source_event_id: "same-source",
    });
    parentPort.postMessage({ type: "result", ok: true, event_id: event.id });
  } else if (workerData.kind === "service_compile") {
    store = new library.ContextCompilerMcpService(workerData.database);
    parentPort.postMessage({
      type: "result",
      ok: true,
      response: store.call("compile_context", {
        session_id: "concurrent-compile",
        current_input: "needle",
        recent_raw_window_turns: 1,
        operation_id: "same-operation",
      }),
    });
  } else if (workerData.kind === "stdio_health") {
    const [{ Client }, { StdioClientTransport }] = await Promise.all([
      import("@modelcontextprotocol/sdk/client/index.js"),
      import("@modelcontextprotocol/sdk/client/stdio.js"),
    ]);
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [join(workerData.root, "dist", "mcp-server.js")],
      cwd: workerData.root,
      env: { CONTEXT_COMPILER_DB_PATH: workerData.database },
      stderr: "pipe",
    });
    client = new Client({ name: "legacy-startup-worker", version: "1.0.0" });
    await client.connect(transport);
    const response = await client.callTool({ name: "health", arguments: {} });
    const content = response.content;
    if (!Array.isArray(content) || content.length !== 1 || content[0]?.type !== "text") {
      throw new Error("Expected one JSON text content item");
    }
    parentPort.postMessage({
      type: "result",
      ok: true,
      response: JSON.parse(content[0].text),
    });
  } else {
    throw new Error(`Unknown worker kind ${workerData.kind}`);
  }
} catch (error) {
  parentPort.postMessage({
    type: "result",
    ok: false,
    error: {
      name: error instanceof Error ? error.name : "UnknownError",
      message: error instanceof Error ? error.message : "unknown",
      code: typeof error === "object" && error !== null && "code" in error ? error.code : null,
    },
  });
} finally {
  try {
    await client?.close();
  } catch {
    // The result already records the constructor/operation outcome.
  }
  try {
    store?.close();
  } catch {
    // The result already records the constructor/operation outcome.
  }
}
