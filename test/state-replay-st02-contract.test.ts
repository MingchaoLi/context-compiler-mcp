// @vitest-environment node

import { execFile } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import {
  ACCEPTED_ST02_CONTRACT_SOURCE,
  ACCEPTED_ST02_SOURCE,
  buildNextPacket,
  buildNextPacketFromCapture,
  type StateReplayPacket,
  type StateReplayResponse,
} from "../evaluation/state-replay-v0.1/st02/runtime.js";

const REPOSITORY_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const REPLAY_ROOT = join(REPOSITORY_ROOT, "evaluation/state-replay-v0.1");
const execFileAsync = promisify(execFile);
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

function response(packet: StateReplayPacket, rawResponse: string): StateReplayResponse {
  return {
    schema_version: "state_replay_st02_response/v1",
    packet_id: packet.packet_id,
    raw_response: rawResponse,
  };
}

function emptyDelta(): Record<string, unknown[]> {
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

async function sourceOnlyFixture(): Promise<string> {
  const temporary = await mkdtemp(join(tmpdir(), "context-compiler-st02-fixture-"));
  temporaryDirectories.push(temporary);
  const fixture = join(temporary, "state-replay-v0.1");
  await mkdir(join(fixture, "source"), { recursive: true });
  await mkdir(join(fixture, "st02/contract"), { recursive: true });
  await cp(join(REPLAY_ROOT, "source/event-stream.jsonl"), join(fixture, "source/event-stream.jsonl"));
  await cp(join(REPLAY_ROOT, "st02/contract/run-contract.json"), join(fixture, "st02/contract/run-contract.json"));
  await cp(join(REPLAY_ROOT, "st02/contract/response-contract.json"), join(fixture, "st02/contract/response-contract.json"));
  return fixture;
}

describe("WO-DS-14 ST-02 zero-model run contract", () => {
  it("fixes the accepted identities, 30-step order and single-attempt non-sol run policy", async () => {
    expect(ACCEPTED_ST02_SOURCE).toEqual({
      st01_qa_commit: "daa012c4d6f09919e798edc3771cf090bd5dd188",
      st01_builder_commit: "826eb4760fe8df557a2aa7d07225bc1986579281",
      st01_data_commit: "79da83d95aeac7162c95714f4f6f5eff1f9e0608",
      st01_data_parent: "aeed861b3e3c538fbf6aa1393a5745fb4d61490b",
      canonical_source_commit: "4b974538d76d0e0d8a5ac17c5662533b714ef00e",
      event_stream_git_blob: "9b4b18c77a5496278325429be2df6aaf767281e9",
      event_stream_sha256: "a35771410cd027a70e439add43a268529826def666c14421b629e79a47c0a4e1",
    });
    expect(ACCEPTED_ST02_CONTRACT_SOURCE).toEqual({
      commit: "8d31cb6fc06b6b99bc141258539deb51b46d2d1b",
      parent: "daa012c4d6f09919e798edc3771cf090bd5dd188",
      files: [
        {
          path: "st02/contract/run-contract.json",
          blob: "536e11f6ca9dc3cf91d7c761a99e9afb6564b13e",
          sha256: "7a78f885c177cbd1a89458fe8694dffee51647e8ab7797992188049e97b8e502",
        },
        {
          path: "st02/contract/response-contract.json",
          blob: "96bb261c615e72f69580c338c3ccdc1450ec2dd6",
          sha256: "be4a39e39ad0822b60bdce11936e6a1bf144094f068d857ed0a00231a50269dd",
        },
      ],
    });
    const contract = JSON.parse(await readFile(join(REPLAY_ROOT, "st02/contract/run-contract.json"), "utf8"));
    expect(contract.step_order).toHaveLength(30);
    expect(contract.authorization).toEqual({
      model_authorized: false,
      official_capture_authorized: false,
      qa_may_call_model: false,
      next_authority: "independent_run_gate_qa_then_controller_decision",
    });
    expect(contract.remote_session).toEqual({
      model: "gpt-5.6-terra",
      model_family: "gpt-5.6-non-sol",
      reasoning_effort: "medium",
      fork_turns: "none",
      fresh_session_per_step: true,
      attempts_per_step: 1,
      adaptive_retry: false,
      best_of: false,
      tools_enabled: false,
      network_access: false,
      repository_access: false,
      maximum_concurrency: 3,
    });
    expect(contract.extractor).toMatchObject({ max_attempts: 1, invalid_json_schema_or_reference: "empty_delta_fallback" });
    expect(contract.reducer).toMatchObject({ rejection: "record_extractor_produced_invalid_transition_and_keep_state_unchanged" });
    expect(contract.interpretation).toMatchObject({ aggregate_threshold: null, weighted_score: null, architecture_winner: null });
  });

  it("builds the actual StrictStateExtractor prompt from only prior predicted state and current event", async () => {
    const result = await buildNextPacket(REPOSITORY_ROOT);
    expect(result).toMatchObject({
      status: "next_packet_ready_no_model_called",
      processed_response_count: 0,
      model_call_count: 0,
      scoring_run_count: 0,
    });
    const packet = result.next_packet!;
    expect(packet.event_id).toBe("STR-08/E1");
    expect(packet.extractor_input.active_state).toEqual([]);
    expect(packet.extractor_input.state_relations).toEqual([]);
    expect(packet.extractor_input.recent_context).toEqual([]);
    expect(packet.extractor_input.newest_events).toHaveLength(1);
    expect(packet.extractor_input.newest_events[0].id).toMatch(/^evt_[a-f0-9]{24}$/);
    expect(packet.prompt).toMatch(/^Extract only task-state changes\./);
    const promptPayload = JSON.parse(packet.prompt.split("\n").at(-1)!);
    expect(promptPayload.input).toEqual(packet.extractor_input);
    expect(promptPayload.required_shape).toEqual(emptyDelta());
    expect(packet.prompt).not.toContain("STR-08/E2");
  });

  it("replays response prefixes from scratch to byte-identical prompts with opaque deterministic ids", async () => {
    const first = (await buildNextPacket(REPOSITORY_ROOT)).next_packet!;
    const firstDelta = emptyDelta();
    firstDelta.new_goals = [{
      content: "Investigate the reported lifecycle behavior.",
      source_refs: [first.extractor_input.newest_events[0].id],
    }];
    const firstResponse = response(first, JSON.stringify(firstDelta));
    const secondA = await buildNextPacket(REPOSITORY_ROOT, [firstResponse]);
    const secondB = await buildNextPacket(REPOSITORY_ROOT, [firstResponse]);
    expect(secondA.next_packet).toEqual(secondB.next_packet);
    expect(secondA.next_packet!.event_id).toBe("STR-08/E2");
    expect(secondA.next_packet!.extractor_input.active_state).toHaveLength(1);
    const item = secondA.next_packet!.extractor_input.active_state[0];
    expect(item.id).toMatch(/^sti_[a-f0-9]{24}$/);
    expect(item.id).not.toContain("s08_");
    expect(item.source_refs).toEqual([first.extractor_input.newest_events[0].id]);
    expect(item.created_at).toBe("2021-10-04T10:48:05.000Z");
    expect(item.updated_at).toBe("2021-10-04T10:48:05.000Z");
  });

  it("uses one-attempt invalid-response fallback and preserves state", async () => {
    const first = (await buildNextPacket(REPOSITORY_ROOT)).next_packet!;
    const firstDelta = emptyDelta();
    firstDelta.new_goals = [{ content: "Synthetic continuity state.", source_refs: [first.extractor_input.newest_events[0].id] }];
    const firstResponse = response(first, JSON.stringify(firstDelta));
    const second = (await buildNextPacket(REPOSITORY_ROOT, [firstResponse])).next_packet!;
    const invalid = response(second, "not-json-and-not-repaired");
    const third = await buildNextPacket(REPOSITORY_ROOT, [firstResponse, invalid]);
    expect(third.observations[1]).toMatchObject({
      extractor_attempts: 1,
      extractor_fallback_used: true,
      extractor_error_codes: ["INVALID_JSON"],
      reducer_rejected: false,
      previous_revision: 1,
      next_revision: 1,
    });
    expect(third.next_packet!.extractor_input.active_state).toEqual(second.extractor_input.active_state);
  });

  it("records reducer rejection separately and proves the predicted state remains unchanged", async () => {
    const first = (await buildNextPacket(REPOSITORY_ROOT)).next_packet!;
    const firstDelta = emptyDelta();
    firstDelta.new_goals = [{ content: "Synthetic reducer state.", source_refs: [first.extractor_input.newest_events[0].id] }];
    const firstResponse = response(first, JSON.stringify(firstDelta));
    const second = (await buildNextPacket(REPOSITORY_ROOT, [firstResponse])).next_packet!;
    const secondResponse = response(second, JSON.stringify(emptyDelta()));
    const third = (await buildNextPacket(REPOSITORY_ROOT, [firstResponse, secondResponse])).next_packet!;
    const thirdResponse = response(third, JSON.stringify(emptyDelta()));
    const result = await buildNextPacket(
      REPOSITORY_ROOT,
      [firstResponse, secondResponse, thirdResponse],
      { test_expected_revision_by_event: { "STR-08/E3": 0 } },
    );
    expect(result.observations[2]).toMatchObject({
      extractor_fallback_used: false,
      reducer_rejected: true,
      reducer_error_name: "StateRevisionConflictError",
      previous_revision: 1,
      next_revision: 1,
      state_unchanged_on_rejection: true,
    });
    expect(result.next_packet!.extractor_input.active_state).toEqual(third.extractor_input.active_state);
  });

  it("runs with a physical source+contract-only fixture and rejects coordinated current-source rewrite", async () => {
    const fixture = await sourceOnlyFixture();
    await expect(buildNextPacket(REPOSITORY_ROOT, [], { fixture_root: fixture })).resolves.toMatchObject({
      status: "next_packet_ready_no_model_called",
    });
    const source = join(fixture, "source/event-stream.jsonl");
    await writeFile(source, (await readFile(source, "utf8")).replace("TestClient", "ChangedClient"), "utf8");
    await expect(buildNextPacket(REPOSITORY_ROOT, [], { fixture_root: fixture })).rejects.toThrow(/current bytes differ from fixed 79da83d Git blob/);

    const contractFixture = await sourceOnlyFixture();
    const contractPath = join(contractFixture, "st02/contract/run-contract.json");
    const contract = JSON.parse(await readFile(contractPath, "utf8"));
    contract.authorization.model_authorized = true;
    contract.input_boundary.oracle_state = true;
    await writeFile(contractPath, `${JSON.stringify(contract, null, 2)}\n`, "utf8");
    await expect(buildNextPacket(REPOSITORY_ROOT, [], { fixture_root: contractFixture })).rejects.toThrow(/accepted_st02_contract/);

    const responseContractFixture = await sourceOnlyFixture();
    const responseContractPath = join(responseContractFixture, "st02/contract/response-contract.json");
    const responseContract = JSON.parse(await readFile(responseContractPath, "utf8"));
    responseContract.invalid_response_policy.manual_repair = true;
    await writeFile(responseContractPath, `${JSON.stringify(responseContract, null, 2)}\n`, "utf8");
    await expect(buildNextPacket(REPOSITORY_ROOT, [], { fixture_root: responseContractFixture })).rejects.toThrow(/accepted_st02_contract/);

    const runtimeSource = await readFile(join(REPLAY_ROOT, "st02/runtime.ts"), "utf8");
    expect(runtimeSource.indexOf("await validateContractAnchor(repositoryRoot, fixtureRoot);")).toBeLessThan(
      runtimeSource.indexOf("const runContract = parseJson"),
    );
    expect(runtimeSource).not.toContain("gold/");
    expect(runtimeSource).not.toContain("semantic-items");
    expect(runtimeSource).not.toContain("gold-deltas");
    expect(runtimeSource).not.toContain("runEvaluationSuite");
    expect(runtimeSource).not.toContain("assembleContext");
    expect(runtimeSource).not.toContain("writeFile");
  });

  it("runs the source-only CLI against the completed official capture without an explicit repository-root argument", async () => {
    const result = await execFileAsync(process.execPath, [
      join(REPOSITORY_ROOT, "node_modules/vite-node/vite-node.mjs"),
      "--script",
      join(REPLAY_ROOT, "st02/run-source-only.ts"),
    ], {
      cwd: REPOSITORY_ROOT,
      maxBuffer: 4 * 1024 * 1024,
    });
    const parsed = JSON.parse(result.stdout);
    expect(parsed).toMatchObject({
      status: "response_prefix_complete_no_scoring",
      processed_response_count: 30,
      model_call_count: 0,
      scoring_run_count: 0,
    });
    expect(parsed).not.toHaveProperty("next_packet");
  });

  it("keeps each raw response and its metadata in separate JSON files for mechanical replay", async () => {
    const packet = (await buildNextPacket(REPOSITORY_ROOT)).next_packet!;
    const rawResponse = "not-json-preserved-exactly";
    const captureRoot = await mkdtemp(join(tmpdir(), "context-compiler-st02-capture-"));
    temporaryDirectories.push(captureRoot);
    await mkdir(join(captureRoot, "responses"), { recursive: true });
    await mkdir(join(captureRoot, "metadata"), { recursive: true });
    const artifact = response(packet, rawResponse);
    await writeFile(join(captureRoot, "responses", `${packet.packet_id}.json`), `${JSON.stringify(artifact)}\n`, "utf8");
    const crypto = await import("node:crypto");
    const digest = crypto.createHash("sha256").update(rawResponse).digest("hex");
    const metadata = {
      schema_version: "state_replay_st02_capture_metadata/v1",
      packet_id: packet.packet_id,
      capture_ordinal: 1,
      event_id: "STR-08/E1",
      prompt_sha256: packet.prompt_sha256,
      raw_response_sha256: digest,
      model: "gpt-5.6-terra",
      reasoning_effort: "medium",
      fork_turns: "none",
      fresh_session: true,
      attempt: 1,
      tools_enabled: false,
      network_access: false,
      repository_access: false,
      started_at: "2026-08-23T10:00:00.000Z",
      completed_at: "2026-08-23T10:00:01.000Z",
      transport_status: "completed",
    };
    await writeFile(join(captureRoot, "metadata", `${packet.packet_id}.json`), `${JSON.stringify(metadata)}\n`, "utf8");
    const replayed = await buildNextPacketFromCapture(REPOSITORY_ROOT, captureRoot);
    expect(replayed.processed_response_count).toBe(1);
    expect(replayed.observations[0]).toMatchObject({
      extractor_fallback_used: true,
      extractor_error_codes: ["INVALID_JSON"],
    });
    expect(replayed.next_packet!.event_id).toBe("STR-08/E2");
  });
});
