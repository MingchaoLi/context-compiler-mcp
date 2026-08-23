import { createHash } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { assembleContext, type CompiledContext } from "../../../../src/assembler.js";
import { buildProtocolCanarySuite } from "../../protocol-canary/protocol-preflight.js";

const CONDITIONS = Object.freeze(["d0", "d1", "d2"] as const);
const SYSTEM_INSTRUCTION = "You are a software engineer continuing a historical Starlette issue at the exact time represented by the supplied snapshot. Use only the supplied context. Do not browse the web, inspect a repository, call tools, or assume later events. Answer the Current User Input in English within 250 words. Clearly distinguish known facts, unresolved questions, and the smallest justified next step. Return exactly one JSON object with one string field named answer and no surrounding markdown.";
const RESPONSE_CONTRACT = Object.freeze({
  format: "single_json_object",
  exact_keys: Object.freeze(["answer"]),
  answer_language: "English",
  maximum_words: 250,
  markdown_wrapper_allowed: false,
});
const SOURCE_IDENTITY = Object.freeze({
  canonical_data_qa_commit: "2012961d9409f6c957d344c5432a701a1c15f8e7",
  protocol_qa_commit: "44c9756b041601fa7f287c834157439ac77fec3f",
  promotion_hashes_sha256: "c216719f1745601786ad53f50bbaed6c5e7b0a8e8d9d6612cfb79b9c103ff51b",
  protocol_hashes_sha256: "fde44511237c1a16d317131122461461c788b175b102592f22d6a656cfd6e99a",
});

type Condition = typeof CONDITIONS[number];

interface AnswerInputPacket {
  schema_version: "starlette-answer-input/v1";
  packet_id: string;
  system_instruction: string;
  user_prompt: string;
  response_contract: typeof RESPONSE_CONTRACT;
  prompt_sha256: string;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function estimateTokens(value: string): number {
  return value.length === 0 ? 0 : Math.max(1, Math.ceil(value.length / 4));
}

function selectRecentTurns(events: any[], turnCount: number): any[] {
  const userIndexes = events
    .map((event, index) => ({ event, index }))
    .filter(({ event }) => event.role === "user")
    .map(({ index }) => index);
  if (userIndexes.length === 0) return [];
  return events.slice(userIndexes[Math.max(0, userIndexes.length - turnCount)]!);
}

function renderTranscript(events: any[], currentInput: string): string {
  return [
    ...events.map((event) => `[seq:${event.seq} ${event.role}] ${event.content}`),
    `[current user] ${currentInput}`,
  ].join("\n");
}

function conditionContext(evaluationCase: any, condition: Condition): { text: string; rawEventCount: number; stateItemCount: number; compiled?: CompiledContext } {
  if (condition === "d0") {
    return {
      text: renderTranscript(evaluationCase.raw_events, evaluationCase.current_input),
      rawEventCount: evaluationCase.raw_events.length,
      stateItemCount: 0,
    };
  }
  if (condition === "d1") {
    const recent = selectRecentTurns(evaluationCase.raw_events, evaluationCase.recent_raw_window_turns);
    return {
      text: renderTranscript(recent, evaluationCase.current_input),
      rawEventCount: recent.length,
      stateItemCount: 0,
    };
  }
  const compiled = assembleContext({
    session_id: evaluationCase.session_id,
    context_items: evaluationCase.context_items,
    state_relations: evaluationCase.state_relations,
    raw_events: evaluationCase.raw_events,
    current_input: evaluationCase.current_input,
    recent_raw_window_turns: evaluationCase.recent_raw_window_turns,
  });
  return {
    text: compiled.rendered_context,
    rawEventCount: compiled.recent_conversation.length,
    stateItemCount: compiled.debug_manifest.kept_state_ids.length,
    compiled,
  };
}

function opaquePacketId(sliceId: string, condition: Condition): string {
  return `pkt_${sha256(`starlette-v1-answer-packet/v1|fixed-blinding-domain|${sliceId}|${condition}|1`).slice(0, 20)}`;
}

function userPrompt(packetId: string, context: string): string {
  return [
    `Opaque packet: ${packetId}`,
    "Use only the historical snapshot below. It already includes the Current User Input.",
    "--- BEGIN HISTORICAL SNAPSHOT ---",
    context,
    "--- END HISTORICAL SNAPSHOT ---",
    "Return exactly {\"answer\":\"...\"}. Do not include analysis, markdown fences, citations, or extra keys.",
  ].join("\n");
}

export async function generateRunInputs(root: string): Promise<{ answerInputs: AnswerInputPacket[]; packetManifest: any }> {
  const { suite } = await buildProtocolCanarySuite(root);
  const answerInputs: AnswerInputPacket[] = [];
  const packetEntries: any[] = [];

  for (const evaluationCase of suite.cases) {
    for (const condition of CONDITIONS) {
      const packetId = opaquePacketId(evaluationCase.id, condition);
      const context = conditionContext(evaluationCase, condition);
      const prompt = userPrompt(packetId, context.text);
      const promptHash = sha256(`${SYSTEM_INSTRUCTION}\n\n${prompt}`);
      answerInputs.push({
        schema_version: "starlette-answer-input/v1",
        packet_id: packetId,
        system_instruction: SYSTEM_INSTRUCTION,
        user_prompt: prompt,
        response_contract: RESPONSE_CONTRACT,
        prompt_sha256: promptHash,
      });
      packetEntries.push({
        packet_id: packetId,
        case_id: evaluationCase.id.split("/")[0],
        slice_id: evaluationCase.id,
        condition,
        repetition: 1,
        context_sha256: sha256(context.text),
        prompt_sha256: promptHash,
        context_character_count: context.text.length,
        context_estimated_tokens: estimateTokens(context.text),
        full_prompt_character_count: SYSTEM_INSTRUCTION.length + 2 + prompt.length,
        full_prompt_estimated_tokens: estimateTokens(`${SYSTEM_INSTRUCTION}\n\n${prompt}`),
        raw_event_count: context.rawEventCount,
        state_item_count: context.stateItemCount,
        oracle_state_upper_bound: condition === "d2",
        current_input_sha256: sha256(evaluationCase.current_input),
      });
    }
  }

  answerInputs.sort((left, right) => left.packet_id.localeCompare(right.packet_id));
  const executionOrder = [...packetEntries]
    .sort((left, right) => sha256(`starlette-v1-run-order/v1|${left.packet_id}`).localeCompare(sha256(`starlette-v1-run-order/v1|${right.packet_id}`)))
    .map(({ packet_id }) => packet_id);
  const packetIds = packetEntries.map(({ packet_id }) => packet_id);
  if (new Set(packetIds).size !== packetIds.length || packetEntries.length !== 36 || answerInputs.length !== 36) {
    throw new Error("run input cardinality changed");
  }

  return {
    answerInputs,
    packetManifest: {
      schema_version: "starlette-answer-packet-manifest/v1",
      status: "frozen_input_candidate_pending_qa",
      source_identity: { ...SOURCE_IDENTITY },
      renderer_contract: {
        d0: "evaluator_full_raw_transcript_plus_current_input",
        d1: "evaluator_recent_complete_user_turn_transcript_plus_current_input",
        d2: "real_assembleContext_rendered_context_with_oracle_state_and_recent_raw",
        token_estimator: "character_count_divided_by_four",
        d2_uses_human_oracle_state_upper_bound: true,
        automatic_extractor_evaluated: false,
        headline_or_recall_used: false,
      },
      counts: {
        case_count: 6,
        slice_count: 12,
        condition_count: 3,
        repetition_count: 1,
        packet_count: 36,
      },
      packets: packetEntries,
      execution_order: executionOrder,
      generation_counters: {
        evaluation_run_count: 0,
        model_call_count: 0,
        answer_artifact_count: 0,
      },
    },
  };
}

const currentPath = fileURLToPath(import.meta.url);
if (resolve(process.argv[1] ?? "") === currentPath) {
  const root = resolve(process.argv[2] ?? join(dirname(currentPath), "../.."));
  const output = process.argv[3] ?? "all";
  const result = await generateRunInputs(root);
  if (output === "jsonl") {
    process.stdout.write(`${result.answerInputs.map((entry) => JSON.stringify(entry)).join("\n")}\n`);
  } else if (output === "manifest") {
    process.stdout.write(`${JSON.stringify(result.packetManifest, null, 2)}\n`);
  } else {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  }
}
