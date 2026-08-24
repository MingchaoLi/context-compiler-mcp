import { parentPort, workerData } from "node:worker_threads";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const boundary = new Int32Array(workerData.boundary);
const moduleUrl = pathToFileURL(join(workerData.root, "dist", "index.js")).href;
const { ContextCompilerCore, ContextCompilerMcpService } = await import(moduleUrl);

const emptyDelta = () => ({
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
});

const unwrap = (response, label) => {
  if (!response.ok) throw new Error(`${label}:${response.error.code}`);
  return response.result;
};

let service;
try {
  const core = new ContextCompilerCore(workerData.database);
  service = new ContextCompilerMcpService(core);
  if (workerData.kind === "origin") {
    const ledgerStore = core.ledgerStore;
    const appendSymbol = Object.getOwnPropertySymbols(Object.getPrototypeOf(ledgerStore))
      .find((symbol) => symbol.description === "appendContextCompileTrace");
    if (appendSymbol === undefined) throw new Error("compile trace hook not found");
    const append = ledgerStore[appendSymbol];
    Object.defineProperty(ledgerStore, appendSymbol, {
      configurable: true,
      value(input) {
        Atomics.store(boundary, 1, 1);
        Atomics.notify(boundary, 1);
        Atomics.wait(boundary, 3, 0);
        if (workerData.rollback) throw new Error("injected first trace rollback");
        return append.call(this, input);
      },
    });
    Atomics.wait(boundary, 0, 0);
    const response = service.call("compile_context", {
      session_id: workerData.session_id,
      current_input: "establish telemetry origin",
      recent_raw_window_turns: 1,
      operation_id: workerData.operation_id,
    });
    parentPort.postMessage({ type: "origin_result", response });
  } else if (workerData.kind === "contender") {
    const rawStore = core.rawStore;
    const ingest = rawStore.ingest;
    rawStore.ingest = function (input) {
      Atomics.store(boundary, 4, 1);
      Atomics.notify(boundary, 4);
      return ingest.call(this, input);
    };
    Atomics.store(boundary, 0, 1);
    Atomics.notify(boundary, 0);
    Atomics.wait(boundary, 2, 0);
    parentPort.postMessage({ type: "contender_started" });
    const event = unwrap(service.call("ingest_event", {
      session_id: workerData.session_id,
      role: "user",
      content: "post-boundary goal evidence",
      source_event_id: `${workerData.session_id}-goal-source`,
    }), "ingest");
    const prepared = unwrap(service.call("prepare_state_update", {
      session_id: workerData.session_id,
      newest_event_ids: [event.id],
    }), "prepare");
    unwrap(service.call("apply_state_delta", {
      session_id: workerData.session_id,
      preparation_token: prepared.preparation_token,
      fingerprint: prepared.fingerprint,
      expected_revision: prepared.expected_revision,
      delta: {
        ...emptyDelta(),
        new_goals: [{ content: "post-boundary durable goal", source_refs: [event.id] }],
      },
    }), "apply");
    const noIdResponse = service.call("compile_context", {
      session_id: workerData.session_id,
      current_input: "post-boundary durable goal",
      recent_raw_window_turns: 1,
    });
    const state = unwrap(
      service.call("get_state", { session_id: workerData.session_id }),
      "get_state"
    );
    parentPort.postMessage({
      type: "contender_result",
      event_id: event.id,
      no_id_response: noIdResponse,
      state,
    });
    Atomics.store(boundary, 5, 1);
    Atomics.notify(boundary, 5);
  } else {
    throw new Error(`unsupported worker kind ${workerData.kind}`);
  }
} catch (error) {
  parentPort.postMessage({
    type: "worker_error",
    error: {
      name: error instanceof Error ? error.name : "Error",
      message: error instanceof Error ? error.message : String(error),
    },
  });
} finally {
  try { service?.close(); } catch { /* the result already captures the primary failure */ }
}
