import { parentPort, workerData } from "node:worker_threads";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const barrier = new Int32Array(workerData.barrier);
parentPort.postMessage({ type: "ready" });
Atomics.wait(barrier, 0, 0);

let store;
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
    store?.close();
  } catch {
    // The result already records the constructor/operation outcome.
  }
}
