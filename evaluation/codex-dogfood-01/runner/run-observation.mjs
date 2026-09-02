#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";
import { Worker } from "node:worker_threads";

import { ContextCompilerMcpService } from "../../../dist/mcp-service.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const BASELINE = "b7f00cefe809b1ffe9fac7d5e7885f7a7fdec8ed";
const HISTORY_BASE = "afff9367b2c46917e6f6a3483fc493966be63dc6";
const RECENT_TURNS = 3;
const EXPECTED_COMMITS = 123;
const DATABASE_PATH = process.argv[2];
if (typeof DATABASE_PATH !== "string" || DATABASE_PATH.length === 0) {
  throw new Error("usage: run-observation.mjs <absolute-temporary-database-path>");
}

function readJson(path) {
  return JSON.parse(readFileSync(resolve(ROOT, path), "utf8"));
}

function git(args) {
  const result = spawnSync("git", args, { cwd: ROOT, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(`git ${args[0]} failed`);
  return result.stdout.trimEnd();
}

function loadCommits() {
  const lines = git([
    "log", "--reverse", "--format=%H%x09%aI%x09%s", `${HISTORY_BASE}..${BASELINE}`
  ]).split("\n").filter(Boolean);
  const commits = lines.map((line) => {
    const first = line.indexOf("\t");
    const second = line.indexOf("\t", first + 1);
    if (first < 0 || second < 0) throw new Error("invalid git outcome row");
    return {
      sha: line.slice(0, first),
      created_at: new Date(line.slice(first + 1, second)).toISOString(),
      subject: line.slice(second + 1)
    };
  });
  if (commits.length !== EXPECTED_COMMITS || commits.at(-1)?.sha !== BASELINE) {
    throw new Error("fixed git outcome trace mismatch");
  }
  return commits;
}

function tool(service, name, input) {
  const response = service.call(name, input);
  if (!response.ok) throw new Error(`${name} failed: ${response.error.code}`);
  return response.result;
}

function emptyDelta() {
  return {
    new_goals: [], updated_goals: [], new_constraints: [], updated_constraints: [],
    new_decisions: [], resolved_questions: [], new_open_questions: [],
    rejected_alternatives: [], supersessions: [], new_relations: []
  };
}

function applyDelta(service, sessionId, newestIds, delta) {
  const prepared = tool(service, "prepare_state_update", {
    session_id: sessionId,
    newest_event_ids: newestIds
  });
  return tool(service, "apply_state_delta", {
    session_id: sessionId,
    preparation_token: prepared.preparation_token,
    fingerprint: prepared.fingerprint,
    expected_revision: prepared.expected_revision,
    delta
  });
}

function directiveTimestamp(commitTime, offset) {
  return new Date(Date.parse(commitTime) + offset + 1).toISOString();
}

function seedSession(service, sessionId, commits, directiveData) {
  const byAnchor = new Map();
  for (const directive of directiveData.directives) {
    const rows = byAnchor.get(directive.after_commit) ?? [];
    rows.push(directive);
    byAnchor.set(directive.after_commit, rows);
  }
  const rawIds = [];
  const directiveIds = {};
  const usedDirectives = new Set();
  for (const commit of commits) {
    const commitEvent = tool(service, "ingest_event", {
      session_id: sessionId,
      role: "tool",
      event_type: "git_commit",
      content: `Git outcome ${commit.sha.slice(0, 12)}: ${commit.subject}`,
      created_at: commit.created_at,
      source_event_id: `git:${commit.sha}`,
      metadata: { source_kind: "git_outcome_trace", commit_sha: commit.sha }
    });
    rawIds.push(commitEvent.id);
    const directives = byAnchor.get(commit.sha) ?? [];
    directives.forEach((directive, index) => {
      const event = tool(service, "ingest_event", {
        session_id: sessionId,
        role: "user",
        event_type: "host_directive_summary",
        content: directive.summary,
        created_at: directiveTimestamp(commit.created_at, index),
        source_event_id: `directive:${directive.directive_id}`,
        metadata: {
          source_kind: "retrospective_sanitized_reconstruction",
          directive_id: directive.directive_id,
          after_commit: directive.after_commit
        }
      });
      rawIds.push(event.id);
      directiveIds[directive.directive_id] = event.id;
      usedDirectives.add(directive.directive_id);
    });
  }
  if (usedDirectives.size !== directiveData.directives.length) {
    throw new Error("directive anchor missing from fixed Git outcome trace");
  }

  const newestIds = rawIds.slice(-100);
  const first = applyDelta(service, sessionId, newestIds, {
    ...emptyDelta(),
    new_constraints: [
      {
        content: "Only /path/to/context-compiler-mcp may be read or written; the core must not import sibling host repositories.",
        source_refs: [directiveIds.D18, directiveIds.D20]
      },
      {
        content: "WO-V0-15 remains frozen; this dogfood may observe, capture, evaluate, and report only, without changing Context algorithms, weights, dormant policy, ontology, or storage.",
        source_refs: [directiveIds.D20]
      },
      {
        content: "The local stdio MCP surface remains exactly nine tools.",
        source_refs: [directiveIds.D19]
      }
    ],
    new_decisions: [
      {
        content: "Continue the Starlette feasibility route and wait for two condition-blind human reviewers before selecting the next phase.",
        reason: "Historical DS-11/DS-13 route",
        source_refs: [directiveIds.D16]
      }
    ],
    new_open_questions: [
      {
        content: "Does the full-database compile writer boundary create material lock, busy, or latency cost under real long history and multiple sessions?",
        source_refs: [directiveIds.D19]
      }
    ],
    rejected_alternatives: [
      {
        content: "Do not add PACE-style paging or multi-granularity summaries to frozen v0.",
        reason: "Research backlog only",
        reopen_if: "A separate post-freeze research work order is approved",
        source_refs: [directiveIds.D15]
      },
      {
        content: "Do not introduce Graph DB or Experience Formation into the frozen infrastructure.",
        reason: "SQLite ledger is sufficient for data accumulation",
        reopen_if: "Real Experience experiments produce a concrete requirement",
        source_refs: [directiveIds.D15, directiveIds.D18]
      },
      {
        content: "Do not implement Formal Host Mode in this dogfood observation.",
        reason: "Host integration requires a separate explicit work order",
        reopen_if: "A bounded host-adapter work order is approved",
        source_refs: [directiveIds.D18, directiveIds.D20]
      }
    ]
  });
  const oldDecision = first.created.find((item) => item.type === "DECISION");
  if (!oldDecision) throw new Error("historical decision was not created");

  const second = applyDelta(service, sessionId, newestIds, {
    ...emptyDelta(),
    new_goals: [
      {
        content: "Complete Codex Long-Conversation Dogfood-01 as observation-only evidence, then stop without modifying frozen core.",
        source_refs: [directiveIds.D20]
      }
    ],
    new_decisions: [
      {
        content: "WO-V0-15 is ACCEPTED/FROZEN; the next phase is real long-term use and Event-Action-Outcome/Feedback data accumulation for future Experience Formation research.",
        reason: "DS-14 sealed the old feasibility route and WO-V0-15 froze the infrastructure",
        supersedes: [oldDecision.id],
        source_refs: [directiveIds.D17, directiveIds.D18, directiveIds.D19, directiveIds.D20]
      }
    ]
  });

  return {
    raw_event_ids: rawIds,
    directive_event_ids: directiveIds,
    historical_decision_id: oldDecision.id,
    current_decision_id: second.created.find((item) => item.type === "DECISION")?.id ?? null,
    state_revision: second.revision
  };
}

function compositeInput(protocol) {
  return [
    protocol.instructions,
    ...protocol.probes.map((probe) => `${probe.id}: ${probe.question}`)
  ].join("\n");
}

function contextContains(context, needle) {
  const values = [
    ...context.active_goals, ...context.active_constraints, ...context.active_decisions,
    ...context.open_questions, ...(context.rejected_alternatives ?? []),
    ...context.recent_conversation, ...(context.retrieved_history ?? [])
  ].map((entry) => entry.content ?? "");
  return values.some((value) => value.includes(needle));
}

function compactStateItem(item) {
  return {
    id: item.id,
    type: item.type,
    status: item.status,
    content: item.content,
    source_refs: item.source_refs
  };
}

function compactRawEvent(event) {
  return {
    id: event.id,
    seq: event.seq,
    role: event.role,
    event_type: event.event_type,
    content: event.content,
    source_event_id: event.source_event_id
  };
}

function compactOperationalDebug(debug) {
  if (debug === undefined) return undefined;
  return {
    mode: debug.mode,
    dense_availability: debug.dense_availability,
    candidate_turn_count: debug.candidate_turn_count,
    candidate_seq_start: debug.candidate_seq_start,
    candidate_seq_end: debug.candidate_seq_end,
    retrieval_limit: debug.retrieval_limit,
    retrieved_event_ids: debug.retrieved_event_ids,
    retrieved_tokens: debug.retrieved_tokens,
    telemetry_complete: debug.telemetry_complete,
    dormancy_enabled: debug.dormancy_enabled,
    dormant_state_ids: debug.dormant_state_ids,
    reactivated_state_ids: debug.reactivated_state_ids,
    compile_trace_seq: debug.compile_trace_seq
  };
}

function compactContext(context) {
  return {
    session_id: context.session_id,
    current_input: context.current_input,
    active_goals: context.active_goals.map(compactStateItem),
    active_constraints: context.active_constraints.map(compactStateItem),
    active_decisions: context.active_decisions.map(compactStateItem),
    open_questions: context.open_questions.map(compactStateItem),
    rejected_alternatives: (context.rejected_alternatives ?? []).map(compactStateItem),
    compact_historical_notes: context.compact_historical_notes,
    recent_conversation: context.recent_conversation.map(compactRawEvent),
    retrieved_history: (context.retrieved_history ?? []).map(compactRawEvent),
    operational_debug: compactOperationalDebug(context.operational_debug)
  };
}

function compactCompile(observed) {
  return {
    wall_latency_ms: observed.wall_latency_ms,
    context: compactContext(observed.context),
    metrics: observed.metrics
  };
}

function compactPair(pair) {
  return {
    startup_ms: pair.ready.map((entry) => entry.startup_ms),
    calls: pair.results.map((entry) => ({
      startup_ms: entry.startup_ms,
      call_ms: entry.call_ms,
      ok: entry.response.ok,
      error_code: entry.response.error_code ?? null,
      service_compile_latency_ms: entry.response.metrics?.compile_latency_ms ?? null,
      compile_trace_seq: entry.response.compile_trace_seq ?? null,
      ingested_seq: entry.response.seq ?? null
    }))
  };
}

function compile(service, sessionId, operationId, currentInput, extra = {}) {
  const started = performance.now();
  const result = tool(service, "compile_context", {
    session_id: sessionId,
    current_input: currentInput,
    recent_raw_window_turns: RECENT_TURNS,
    operation_id: operationId,
    ...extra
  });
  return { wall_latency_ms: performance.now() - started, ...result };
}

function launchWorker(databasePath, control, action, input) {
  const worker = new Worker(new URL("./latency-worker.mjs", import.meta.url), {
    workerData: { database_path: databasePath, control, action, input }
  });
  let readyResolve;
  let resultResolve;
  let reject;
  const ready = new Promise((resolveReady, rejectReady) => {
    readyResolve = resolveReady;
    reject = rejectReady;
  });
  const result = new Promise((resolveResult, rejectResult) => {
    resultResolve = resolveResult;
    worker.once("error", rejectResult);
  });
  worker.on("message", (message) => {
    if (message.kind === "ready") readyResolve(message);
    if (message.kind === "result") resultResolve(message);
  });
  worker.once("error", reject);
  return { worker, ready, result };
}

async function runPair(databasePath, left, right) {
  const controlBuffer = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT);
  const control = new Int32Array(controlBuffer);
  const a = launchWorker(databasePath, controlBuffer, left.action, left.input);
  const b = launchWorker(databasePath, controlBuffer, right.action, right.input);
  const ready = await Promise.all([a.ready, b.ready]);
  Atomics.store(control, 0, 1);
  Atomics.notify(control, 0, 2);
  const results = await Promise.all([a.result, b.result]);
  await Promise.all([a.worker.terminate(), b.worker.terminate()]);
  return { ready, results };
}

async function main() {
  if (git(["rev-parse", `${BASELINE}^{commit}`]) !== BASELINE) throw new Error("baseline missing");
  const commits = loadCommits();
  const directiveData = readJson("evaluation/codex-dogfood-01/host-data/directive-summaries.json");
  const protocol = readJson("evaluation/codex-dogfood-01/protocol/composite-request.json");
  if (directiveData.data_kind !== "retrospective_sanitized_reconstruction" ||
      directiveData.raw_private_conversation_included !== false ||
      directiveData.directives.length !== 20) {
    throw new Error("invalid directive reconstruction");
  }

  const service = new ContextCompilerMcpService(DATABASE_PATH);
  const sessionA = "codex-dogfood-01-primary";
  const sessionB = "codex-dogfood-01-secondary";
  const sessionCold = "codex-dogfood-01-cold";
  const seededA = seedSession(service, sessionA, commits, directiveData);

  const broad = compile(
    service, sessionA, "dg01-broad-composite", compositeInput(protocol)
  );
  const normalRecall = compile(
    service, sessionA, "dg01-recall-normal", "legacy DB fallback 的名称是什么？"
  );
  const failure = tool(service, "ingest_event", {
    session_id: sessionA,
    role: "user",
    event_type: "verified_failure",
    content: "Verified failure: the preceding normal bounded compile did not recover the requested legacy database fallback fact.",
    source_event_id: "dg01:verified-failure:legacy-fallback",
    metadata: { source_kind: "dogfood_observation_feedback", related_operation_id: "dg01-recall-normal" }
  });
  const recovery = compile(
    service,
    sessionA,
    "dg01-recall-recovery",
    "legacy DB fallback 的名称是什么？",
    { context_policy: { recovery_failure_event_id: failure.id } }
  );
  const nextStep = compile(
    service,
    sessionA,
    "dg01-next-step-authority",
    "当前下一阶段唯一重心是什么？不要恢复已被 supersede 的旧 Starlette／双真人盲评路线。"
  );

  const warmSequential = [];
  for (let index = 1; index <= 5; index += 1) {
    const observed = compile(
      service,
      sessionA,
      `dg01-warm-${index}`,
      "报告当前冻结状态和下一阶段，不修改 core。"
    );
    warmSequential.push({
      run: index,
      wall_latency_ms: observed.wall_latency_ms,
      service_compile_latency_ms: observed.metrics.compile_latency_ms,
      ok: true
    });
  }

  const seededB = seedSession(service, sessionB, commits, directiveData);
  const seededCold = seedSession(service, sessionCold, commits, directiveData);

  const concurrentCompile = [];
  for (let index = 1; index <= 5; index += 1) {
    concurrentCompile.push(await runPair(
      DATABASE_PATH,
      {
        action: "compile",
        input: {
          session_id: sessionA,
          current_input: "并发观察：当前冻结状态。",
          recent_raw_window_turns: RECENT_TURNS,
          operation_id: `dg01-concurrent-a-${index}`
        }
      },
      {
        action: "compile",
        input: {
          session_id: sessionB,
          current_input: "并发观察：当前冻结状态。",
          recent_raw_window_turns: RECENT_TURNS,
          operation_id: `dg01-concurrent-b-${index}`
        }
      }
    ));
  }

  const compileIngestCompetition = [];
  for (let index = 1; index <= 5; index += 1) {
    compileIngestCompetition.push(await runPair(
      DATABASE_PATH,
      {
        action: "compile",
        input: {
          session_id: sessionA,
          current_input: "写竞争观察：当前冻结状态。",
          recent_raw_window_turns: RECENT_TURNS,
          operation_id: `dg01-compete-compile-${index}`
        }
      },
      {
        action: "ingest",
        input: {
          session_id: sessionB,
          role: "tool",
          event_type: "latency_observation_marker",
          content: `Concurrent ingest observation marker ${index}`,
          source_event_id: `dg01:competition-ingest:${index}`,
          metadata: { source_kind: "dogfood_latency_observation" }
        }
      }
    ));
  }

  const coldOpenStarted = performance.now();
  const coldService = new ContextCompilerMcpService(DATABASE_PATH);
  const coldOpenMs = performance.now() - coldOpenStarted;
  const coldCompile = compile(
    coldService,
    sessionCold,
    "dg01-cold-compile",
    "冷连接观察：当前冻结状态。"
  );
  coldService.close();

  const state = tool(service, "get_state", { session_id: sessionA });
  service.close();

  const report = {
    schema_version: 1,
    observation_id: "codex-long-conversation-dogfood-01",
    input_contract_commit: git(["rev-parse", "HEAD"]),
    source_candidate: "ad94f9350482be37f1a38538cf6b624fb69a2b9a",
    observation_baseline: BASELINE,
    host_data: {
      git_outcome_trace_count: commits.length,
      directive_reconstruction_count: directiveData.directives.length,
      raw_private_conversation_included: false,
      primary_raw_event_count_before_feedback: seededA.raw_event_ids.length,
      typed_state_kind: "oracle_typed_state_compiled_upper_bound",
      primary_state_revision: seededA.state_revision,
      historical_decision_id: seededA.historical_decision_id,
      current_decision_id: seededA.current_decision_id,
      secondary_raw_event_count: seededB.raw_event_ids.length,
      cold_raw_event_count: seededCold.raw_event_ids.length
    },
    broad_composite: compactCompile(broad),
    targeted_recall: {
      normal: {
        metrics: normalRecall.metrics,
        operational_debug: compactOperationalDebug(normalRecall.context.operational_debug),
        dsh_home_present: contextContains(normalRecall.context, "DSH_HOME"),
        recent_conversation: normalRecall.context.recent_conversation,
        retrieved_history: normalRecall.context.retrieved_history ?? []
      },
      verified_failure_event_id: failure.id,
      recovery: {
        metrics: recovery.metrics,
        operational_debug: compactOperationalDebug(recovery.context.operational_debug),
        dsh_home_present: contextContains(recovery.context, "DSH_HOME"),
        recent_conversation: recovery.context.recent_conversation,
        retrieved_history: recovery.context.retrieved_history ?? []
      }
    },
    authority_diagnostic: {
      context: compactContext(nextStep.context),
      metrics: nextStep.metrics,
      old_route_raw_present: contextContains(nextStep.context, "condition-blind"),
      current_route_state_present: contextContains(nextStep.context, "Event-Action-Outcome/Feedback")
    },
    state_audit: {
      revision: state.revision,
      items: state.items.map(compactStateItem),
      lifecycle_relations: state.relations.filter((relation) => relation.relation_type !== "DERIVED_FROM"),
      relation_counts: Object.fromEntries(
        [...new Set(state.relations.map((relation) => relation.relation_type))]
          .sort()
          .map((relationType) => [
            relationType,
            state.relations.filter((relation) => relation.relation_type === relationType).length
          ])
      )
    },
    latency_observation: {
      environment: {
        node: process.version,
        platform: process.platform,
        arch: process.arch,
        scope: "single_machine_smoke_not_sla"
      },
      cold_service_open_ms: coldOpenMs,
      cold_compile_wall_ms: coldCompile.wall_latency_ms,
      cold_compile_service_ms: coldCompile.metrics.compile_latency_ms,
      warm_sequential: warmSequential,
      concurrent_two_session_pairs: concurrentCompile.map(compactPair),
      compile_ingest_competition_pairs: compileIngestCompetition.map(compactPair)
    }
  };
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

await main();
