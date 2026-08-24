import { parentPort, workerData } from "node:worker_threads";
import { performance } from "node:perf_hooks";

import { ContextCompilerMcpService } from "../../../dist/mcp-service.js";

if (parentPort === null) throw new Error("latency worker requires parentPort");

const started = performance.now();
const service = new ContextCompilerMcpService(workerData.database_path);
const startupMs = performance.now() - started;
const control = new Int32Array(workerData.control);

parentPort.postMessage({ kind: "ready", startup_ms: startupMs });
Atomics.wait(control, 0, 0);

const callStarted = performance.now();
let response;
if (workerData.action === "compile") {
  response = service.call("compile_context", workerData.input);
} else if (workerData.action === "ingest") {
  response = service.call("ingest_event", workerData.input);
} else {
  throw new Error("unknown latency action");
}
const callMs = performance.now() - callStarted;

let summary;
if (response.ok && workerData.action === "compile") {
  summary = {
    ok: true,
    metrics: response.result.metrics,
    mode: response.result.context.operational_debug?.mode ?? null,
    compile_trace_seq: response.result.context.operational_debug?.compile_trace_seq ?? null
  };
} else if (response.ok) {
  summary = { ok: true, seq: response.result.seq };
} else {
  summary = { ok: false, error_code: response.error.code };
}

service.close();
parentPort.postMessage({ kind: "result", startup_ms: startupMs, call_ms: callMs, response: summary });

