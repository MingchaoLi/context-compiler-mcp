import { DatabaseSync } from "node:sqlite";
import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Worker } from "node:worker_threads";
import { afterEach, describe, expect, it } from "vitest";
import {
  CANONICAL_FACT_RELATION_POLICY_HASH,
  CANONICAL_STATE_POLICY_HASH,
  CONTEXT_ASSEMBLER_VERSION_HASH,
  CONTEXT_SNAPSHOT_POLICY_HASH,
  ContextCompilerCore,
  ContextCompilerCoreError,
  SEMANTIC_TAKEOVER_POLICY_HASH,
  type ContextSnapshotFreezeInput,
  type RevisionScope,
} from "../src/index.js";
import {
  ContextSnapshotError,
  SqliteContextSnapshotStore,
} from "../src/context-snapshot.js";
import { SqliteRevisionSubstrate } from "../src/revision-substrate.js";

const HASH = "0".repeat(64);

function canonicalJson(value: unknown): string {
  const normalize = (candidate: unknown): unknown => {
    if (Array.isArray(candidate)) return candidate.map(normalize);
    if (candidate !== null && typeof candidate === "object") {
      return Object.fromEntries(Object.entries(candidate).sort(([left], [right]) =>
        left < right ? -1 : left > right ? 1 : 0).map(([key, entry]) => [key, normalize(entry)]));
    }
    return candidate;
  };
  return JSON.stringify(normalize(value));
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

describe("WO-05 ContextSnapshot", () => {
  let directory: string | undefined;
  let core: ContextCompilerCore | undefined;

  afterEach(async () => {
    try { core?.close(); } catch { /* an individual test may already close it */ }
    core = undefined;
    if (directory !== undefined) await rm(directory, { recursive: true, force: true });
    directory = undefined;
  });

  async function createCore(): Promise<{ databasePath: string; scope: RevisionScope }> {
    directory = await mkdtemp(join(tmpdir(), "context-snapshot-"));
    const databasePath = join(directory, "context.db");
    core = new ContextCompilerCore(databasePath);
    return { databasePath, scope: { namespace: "authority", stream_id: "snapshot-stream" } };
  }

  function freezeInput(
    scope: RevisionScope,
    currentInputEventId: string,
    overrides: Partial<ContextSnapshotFreezeInput> = {}
  ): ContextSnapshotFreezeInput {
    if (core === undefined) throw new Error("core not initialized");
    return {
      schema_version: 1,
      scope,
      snapshot_id: "snapshot-1",
      operation_id: "operation-1",
      attempt_id: "attempt-1",
      expected_revision_vector: core.getRevisionVector(scope),
      current_input_event_id: currentInputEventId,
      required_state_item_ids: [],
      required_raw_event_ids: [],
      required_fact_refs: [],
      required_relation_refs: [],
      host_manifest_digest: HASH,
      external_content_hashes: [],
      hard_token_capacity: 10_000,
      policy_hash: CONTEXT_SNAPSHOT_POLICY_HASH,
      ...overrides,
    };
  }

  it("freezes current Authority, dependency closure, Hot Raw and an Attempt atomically", async () => {
    const { scope } = await createCore();
    const stateSource = core!.appendRawSourceProjection({
      scope,
      event_id: "event-state",
      source_kind: "user_input",
      source_id: "source-state",
      payload: { content: "Keep the constraint and goal." },
    });
    const state = core!.commitCanonicalState({
      scope,
      state_commit_id: "state-1",
      commit_mode: "immediate_authority",
      expected_state_revision: 0,
      proposal: {
        schema_version: 1,
        upsert_items: [
          {
            item_id: "constraint-1",
            kind: "CONSTRAINT",
            content: "Never drop this constraint",
            status: "ACTIVE",
            source_event_ids: [stateSource.event_id],
            metadata: {},
          },
          {
            item_id: "goal-1",
            kind: "GOAL",
            content: "Build the deterministic snapshot",
            status: "ACTIVE",
            source_event_ids: [stateSource.event_id],
            metadata: {},
          },
          {
            item_id: "rejected-1",
            kind: "REJECTED_ALTERNATIVE",
            content: "Do not keep this in default context",
            status: "REJECTED",
            source_event_ids: [stateSource.event_id],
            metadata: {},
          },
        ],
      },
      policy_hash: CANONICAL_STATE_POLICY_HASH,
      provenance_event_ids: [stateSource.event_id],
    });
    const factSource = core!.appendRawSourceProjection({
      scope,
      event_id: "event-fact",
      source_kind: "tool_result",
      source_id: "source-fact",
      payload: { content: "The snapshot transaction is local." },
    });
    const authority = core!.commitCanonicalFactsAndRelations({
      scope,
      authority_commit_id: "fact-relation-1",
      policy_hash: CANONICAL_FACT_RELATION_POLICY_HASH,
      fact_proposals: [{
        op: "CREATE",
        fact_id: "fact-1",
        statement: "The snapshot transaction is local",
        epistemic_origin: "tool_observed",
        verification_status: "corroborated",
        lifecycle_status: "active",
        record_status: "live",
        provenance_event_ids: [factSource.event_id],
        verification_event_ids: [],
        metadata: {},
      }],
      relation_proposals: [{
        op: "CREATE",
        relation_id: "dependency-1",
        source: { type: "STATE_ITEM", id: "goal-1" },
        relation_type: "DEPENDS_ON",
        target: { type: "FACT", id: "fact-1" },
        origin: "user_asserted",
        provenance_event_ids: [factSource.event_id],
        status: "active",
        metadata: {},
      }],
    });
    const current = core!.appendRawSourceProjection({
      scope,
      event_id: "event-current",
      source_kind: "user_input",
      source_id: "source-current",
      payload: { content: "Freeze it now." },
    });

    const input = freezeInput(scope, current.event_id, {
      required_raw_event_ids: [factSource.event_id],
      external_content_hashes: [
        { stable_ref: "z-file", content_hash: "2".repeat(64) },
        { stable_ref: "a-file", content_hash: "1".repeat(64) },
      ],
    });
    const snapshot = core!.freezeContextSnapshot(input);

    expect(snapshot.manifest.state_revision).toBe(state.state_revision);
    expect(snapshot.manifest.selected_state_refs.map(({ item_id }) => item_id)).toEqual([
      "constraint-1",
      "goal-1",
    ]);
    expect(snapshot.manifest.selected_state_refs[0]!.inclusion_reasons).toEqual([
      "CURRENT_AUTHORITY",
      "HARD_CONSTRAINT",
    ]);
    expect(snapshot.manifest.excluded_state_refs.map(({ item_id }) => item_id)).toEqual([
      "rejected-1",
    ]);
    expect(snapshot.manifest.selected_fact_refs).toEqual([expect.objectContaining({
      fact_id: authority.facts[0]!.fact_id,
      inclusion_reasons: ["DEPENDENCY_CLOSURE"],
    })]);
    expect(snapshot.manifest.selected_relation_refs).toEqual([expect.objectContaining({
      relation_id: authority.relations[0]!.relation_id,
      inclusion_reasons: ["DEPENDENCY_CLOSURE"],
    })]);
    expect(snapshot.manifest.dependency_paths).toEqual([{
      root: { type: "STATE_ITEM", id: "goal-1" },
      target: { type: "FACT", id: "fact-1" },
      relation_ids: ["dependency-1"],
    }]);
    expect(snapshot.manifest.external_content_hashes.map(({ stable_ref }) => stable_ref)).toEqual([
      "a-file",
      "z-file",
    ]);
    expect(snapshot.manifest.assembler_version_hash).toBe(CONTEXT_ASSEMBLER_VERSION_HASH);
    expect(snapshot.working_context).toContain("Never drop this constraint");
    expect(snapshot.working_context).toContain("The snapshot transaction is local");
    expect(snapshot.working_context.match(/Freeze it now\./gu)).toHaveLength(1);
    expect(snapshot.attempt_started).toMatchObject({
      operation_id: "operation-1",
      attempt_id: "attempt-1",
      snapshot_id: "snapshot-1",
      snapshot_manifest_hash: snapshot.manifest_hash,
    });
    expect(core!.readContextSnapshot(scope, "snapshot-1")).toEqual(snapshot);
    expect(core!.readContextAttemptStarted(scope, "attempt-1")).toEqual(
      snapshot.attempt_started
    );

    const explicitlyRequiredHistory = core!.freezeContextSnapshot({
      ...input,
      snapshot_id: "snapshot-required-history",
      operation_id: "operation-required-history",
      attempt_id: "attempt-required-history",
      required_state_item_ids: ["rejected-1"],
    });
    expect(explicitlyRequiredHistory.manifest.selected_state_refs).toContainEqual({
      item_id: "rejected-1",
      kind: "REJECTED_ALTERNATIVE",
      status: "REJECTED",
      inclusion_reasons: ["EXPLICIT_REQUIRED"],
    });
    expect(explicitlyRequiredHistory.working_context).toContain(
      "[rejected-1] (REJECTED_ALTERNATIVE/REJECTED)"
    );

    core!.commitCanonicalFactsAndRelations({
      scope,
      authority_commit_id: "fact-relation-after-snapshot",
      policy_hash: CANONICAL_FACT_RELATION_POLICY_HASH,
      fact_proposals: [{
        op: "REVISE",
        fact_id: "fact-1",
        expected_fact_revision: 1,
        verification_status: "corroborated",
        lifecycle_status: "active",
        record_status: "live",
        provenance_event_ids: [current.event_id, factSource.event_id],
        verification_event_ids: [current.event_id],
      }],
      relation_proposals: [],
    });
    expect(core!.readContextSnapshot(scope, "snapshot-1")).toEqual(snapshot);
    expect(core!.freezeContextSnapshot(input)).toEqual(snapshot);
  });

  it("keeps a dependency edge whose target is already a current Authority root", async () => {
    const { scope } = await createCore();
    const source = core!.appendRawSourceProjection({
      scope,
      event_id: "event-root-dependency",
      source_kind: "user_input",
      source_id: "source-root-dependency",
      payload: { content: "Goal A depends on Goal B." },
    });
    core!.commitCanonicalState({
      scope,
      state_commit_id: "state-root-dependency",
      commit_mode: "immediate_authority",
      expected_state_revision: 0,
      proposal: {
        schema_version: 1,
        upsert_items: [
          {
            item_id: "goal-a",
            kind: "GOAL",
            content: "Deliver Goal A",
            status: "ACTIVE",
            source_event_ids: [source.event_id],
            metadata: {},
          },
          {
            item_id: "goal-b",
            kind: "GOAL",
            content: "Deliver Goal B",
            status: "ACTIVE",
            source_event_ids: [source.event_id],
            metadata: {},
          },
        ],
      },
      policy_hash: CANONICAL_STATE_POLICY_HASH,
      provenance_event_ids: [source.event_id],
    });
    core!.commitCanonicalFactsAndRelations({
      scope,
      authority_commit_id: "relation-root-dependency",
      policy_hash: CANONICAL_FACT_RELATION_POLICY_HASH,
      fact_proposals: [],
      relation_proposals: [{
        op: "CREATE",
        relation_id: "goal-a-depends-on-goal-b",
        source: { type: "STATE_ITEM", id: "goal-a" },
        relation_type: "DEPENDS_ON",
        target: { type: "STATE_ITEM", id: "goal-b" },
        origin: "user_asserted",
        provenance_event_ids: [source.event_id],
        status: "active",
        metadata: {},
      }],
    });
    const current = core!.appendRawSourceProjection({
      scope,
      event_id: "event-root-dependency-current",
      source_kind: "user_input",
      source_id: "source-root-dependency-current",
      payload: { content: "Continue with Goal A." },
    });

    const snapshot = core!.freezeContextSnapshot(freezeInput(scope, current.event_id));

    expect(snapshot.manifest.selected_relation_refs).toEqual([expect.objectContaining({
      relation_id: "goal-a-depends-on-goal-b",
      inclusion_reasons: ["DEPENDENCY_CLOSURE"],
    })]);
    expect(snapshot.manifest.dependency_paths).toEqual([{
      root: { type: "STATE_ITEM", id: "goal-a" },
      target: { type: "STATE_ITEM", id: "goal-b" },
      relation_ids: ["goal-a-depends-on-goal-b"],
    }]);
    expect(snapshot.working_context).toContain(
      "[goal-a-depends-on-goal-b@1] STATE_ITEM:goal-a -DEPENDS_ON-> STATE_ITEM:goal-b"
    );
  });

  it("normalizes permutation for exact replay and returns the original after later commits", async () => {
    const { scope } = await createCore();
    const first = core!.appendRawSourceProjection({
      scope,
      event_id: "event-a",
      source_kind: "user_input",
      source_id: "source-a",
      payload: { content: "First" },
    });
    const second = core!.appendRawSourceProjection({
      scope,
      event_id: "event-b",
      source_kind: "tool_result",
      source_id: "source-b",
      payload: { content: "Second" },
    });
    const current = core!.appendRawSourceProjection({
      scope,
      event_id: "event-c",
      source_kind: "user_input",
      source_id: "source-c",
      payload: { content: "Current" },
    });
    const input = freezeInput(scope, current.event_id, {
      required_raw_event_ids: [second.event_id, first.event_id],
      external_content_hashes: [
        { stable_ref: "b", content_hash: "2".repeat(64) },
        { stable_ref: "a", content_hash: "1".repeat(64) },
      ],
    });
    const frozen = core!.freezeContextSnapshot(input);
    core!.appendRawSourceProjection({
      scope,
      event_id: "event-later",
      source_kind: "tool_result",
      source_id: "source-later",
      payload: { content: "Later" },
    });
    core!.commitCanonicalState({
      scope,
      state_commit_id: "state-after-snapshot",
      commit_mode: "immediate_authority",
      expected_state_revision: 0,
      proposal: {
        schema_version: 1,
        upsert_items: [{
          item_id: "goal-after-snapshot",
          kind: "GOAL",
          content: "This later State belongs to a later Attempt",
          status: "ACTIVE",
          source_event_ids: [first.event_id],
          metadata: {},
        }],
      },
      policy_hash: CANONICAL_STATE_POLICY_HASH,
      provenance_event_ids: [first.event_id],
    });
    const replay = core!.freezeContextSnapshot({
      ...input,
      required_raw_event_ids: [...input.required_raw_event_ids].reverse(),
      external_content_hashes: [...input.external_content_hashes].reverse(),
    });
    expect(replay).toEqual(frozen);
    expect(replay.working_context).not.toContain("Later");
    expect(replay.working_context).not.toContain("This later State belongs to a later Attempt");

    expect(() => core!.freezeContextSnapshot({
      ...input,
      snapshot_id: "snapshot-new",
      attempt_id: "attempt-new",
    })).toThrow(expect.objectContaining({ code: "CONFLICT" }));
  });

  it("keeps a pre-Takeover Snapshot exact after a later Frontier advance", async () => {
    const { scope } = await createCore();
    const current = core!.appendRawSourceProjection({
      scope,
      event_id: "event-before-later-takeover",
      source_kind: "user_input",
      source_id: "source-before-later-takeover",
      payload: { content: "Freeze before this Event is taken over." },
    });
    const frozen = core!.freezeContextSnapshot(freezeInput(scope, current.event_id));
    const body = { summary: "Later artifact must not enter the old Snapshot." };
    const descriptor = {
      artifact_schema: "compaction-artifact/v1",
      namespace: scope.namespace,
      stream_id: scope.stream_id,
      covered_raw_range: { start: 1, end: 1 },
      generator_version: "snapshot-test/v1",
      policy_hash: SEMANTIC_TAKEOVER_POLICY_HASH,
      provenance_event_ids: [current.event_id],
      body,
    };
    core!.commitSemanticTakeover({
      scope,
      takeover_commit_id: "later-takeover",
      ledger_base_revision: 1,
      covered_raw_range: { start: 1, end: 1 },
      expected_frontier_revision: 0,
      expected_frontier_position: 0,
      state_authority_ref: null,
      existing_fact_refs: [],
      existing_relation_refs: [],
      coverage: [{
        ledger_revision: 1,
        event_id: current.event_id,
        disposition: "artifact_only",
        state_item_refs: [],
        fact_refs: [],
        relation_refs: [],
        artifact_only_reason: "no_semantic_delta",
      }],
      compaction_artifact: {
        artifact_id: "later-artifact",
        expected_artifact_hash: sha256(canonicalJson(descriptor)),
        generator_version: "snapshot-test/v1",
        body,
      },
      policy_hash: SEMANTIC_TAKEOVER_POLICY_HASH,
      provenance_event_ids: [current.event_id],
    });

    const replay = core!.readContextSnapshot(scope, frozen.manifest.snapshot_id);
    expect(replay).toEqual(frozen);
    expect(replay.manifest.current_takeover_ref).toBeNull();
    expect(replay.working_context).not.toContain(body.summary);
  });

  it("serializes concurrent exact freeze retries into one Snapshot and Attempt", async () => {
    const { databasePath, scope } = await createCore();
    const current = core!.appendRawSourceProjection({
      scope,
      event_id: "event-concurrent-freeze",
      source_kind: "user_input",
      source_id: "source-concurrent-freeze",
      payload: { content: "Freeze exactly once." },
    });
    const input = freezeInput(scope, current.event_id);
    core!.close();
    core = undefined;

    const results = await runConcurrentFreeze(databasePath, input);
    expect(results).toEqual([
      expect.objectContaining({ ok: true }),
      expect.objectContaining({ ok: true }),
    ]);
    expect(results[0]!.manifest_hash).toBe(results[1]!.manifest_hash);
    expect(results[0]!.created_at).toBe(results[1]!.created_at);

    const database = new DatabaseSync(databasePath);
    try {
      expect(database.prepare("SELECT COUNT(*) AS n FROM cc_context_snapshots").get())
        .toEqual({ n: 1 });
      expect(database.prepare("SELECT COUNT(*) AS n FROM cc_context_attempt_starts").get())
        .toEqual({ n: 1 });
    } finally {
      database.close();
    }
  });

  it("keeps an exact Raw endpoint labelled in deterministic dependency closure", async () => {
    const { scope } = await createCore();
    const source = core!.appendRawSourceProjection({
      scope,
      event_id: "event-raw-endpoint",
      source_kind: "user_input",
      source_id: "source-raw-endpoint",
      payload: { content: "Raw endpoint evidence" },
    });
    core!.commitCanonicalState({
      scope,
      state_commit_id: "state-raw-endpoint",
      commit_mode: "immediate_authority",
      expected_state_revision: 0,
      proposal: {
        schema_version: 1,
        upsert_items: [{
          item_id: "goal-raw-endpoint",
          kind: "GOAL",
          content: "Preserve the Raw dependency identity",
          status: "ACTIVE",
          source_event_ids: [source.event_id],
          metadata: {},
        }],
      },
      policy_hash: CANONICAL_STATE_POLICY_HASH,
      provenance_event_ids: [source.event_id],
    });
    const authority = core!.commitCanonicalFactsAndRelations({
      scope,
      authority_commit_id: "relation-raw-endpoint",
      policy_hash: CANONICAL_FACT_RELATION_POLICY_HASH,
      fact_proposals: [],
      relation_proposals: [{
        op: "CREATE",
        relation_id: "derived-from-raw",
        source: { type: "STATE_ITEM", id: "goal-raw-endpoint" },
        relation_type: "DERIVED_FROM",
        target: { type: "RAW_EVENT", id: source.event_id },
        origin: "user_asserted",
        provenance_event_ids: [source.event_id],
        status: "active",
        metadata: {},
      }],
    });
    const current = core!.appendRawSourceProjection({
      scope,
      event_id: "event-raw-endpoint-current",
      source_kind: "user_input",
      source_id: "source-raw-endpoint-current",
      payload: { content: "Freeze the Raw dependency." },
    });

    const snapshot = core!.freezeContextSnapshot(freezeInput(scope, current.event_id, {
      required_relation_refs: [{
        relation_id: authority.relations[0]!.relation_id,
        relation_revision: authority.relations[0]!.relation_revision,
      }],
    }));
    expect(snapshot.manifest.selected_relation_refs).toEqual([{
      relation_id: authority.relations[0]!.relation_id,
      relation_revision: authority.relations[0]!.relation_revision,
      relation_hash: authority.relations[0]!.relation_hash,
      inclusion_reasons: ["EXPLICIT_REQUIRED"],
    }]);
    expect(snapshot.manifest.dependency_paths).toEqual([]);
    expect(snapshot.working_context).toContain(
      "STATE_ITEM:goal-raw-endpoint -DERIVED_FROM-> RAW_EVENT:event-raw-endpoint"
    );
  });

  it("trims Hot Raw as a newest contiguous whole-event suffix", async () => {
    const { scope } = await createCore();
    core!.appendRawSourceProjection({
      scope,
      event_id: "event-old-too-large",
      source_kind: "tool_result",
      source_id: "source-old-too-large",
      payload: { content: "A".repeat(1_000) },
    });
    const newestOptional = core!.appendRawSourceProjection({
      scope,
      event_id: "event-newest-optional",
      source_kind: "tool_result",
      source_id: "source-newest-optional",
      payload: { content: "B".repeat(50) },
    });
    const current = core!.appendRawSourceProjection({
      scope,
      event_id: "event-current-trim",
      source_kind: "user_input",
      source_id: "source-current-trim",
      payload: { content: "Assemble the bounded suffix." },
    });

    const snapshot = core!.freezeContextSnapshot(freezeInput(scope, current.event_id, {
      hard_token_capacity: 220,
    }));
    expect(snapshot.manifest.hot_raw_event_refs.map(({ event_id }) => event_id)).toEqual([
      newestOptional.event_id,
      current.event_id,
    ]);
    expect(snapshot.manifest.hot_raw_event_refs[0]!.inclusion_reasons).toEqual([
      "HOT_RAW_SUFFIX",
    ]);
    expect(snapshot.working_context).toContain("B".repeat(50));
    expect(snapshot.working_context).not.toContain("A".repeat(100));
    expect(snapshot.manifest.working_context_estimated_tokens).toBeLessThanOrEqual(220);
  });

  it("rejects non-canonical request grammar without writing a freeze receipt", async () => {
    const { databasePath, scope } = await createCore();
    const current = core!.appendRawSourceProjection({
      scope,
      event_id: "event-invalid-input",
      source_kind: "user_input",
      source_id: "source-invalid-input",
      payload: { content: "Validate the closed grammar." },
    });
    const valid = freezeInput(scope, current.event_id);
    const invalidInputs: unknown[] = [
      { ...valid, schema_version: 2 },
      { ...valid, policy_hash: "f".repeat(64) },
      { ...valid, hard_token_capacity: 0 },
      { ...valid, required_raw_event_ids: [current.event_id, current.event_id] },
      {
        ...valid,
        external_content_hashes: [
          { stable_ref: "same", content_hash: "1".repeat(64) },
          { stable_ref: "same", content_hash: "2".repeat(64) },
        ],
      },
      { ...valid, unexpected_key: true },
    ];
    for (const invalidInput of invalidInputs) {
      expect(() => core!.freezeContextSnapshot(invalidInput as ContextSnapshotFreezeInput))
        .toThrow(expect.objectContaining({ code: "INVALID_INPUT" }));
    }

    const tool = core!.appendRawSourceProjection({
      scope,
      event_id: "event-tool-not-current-input",
      source_kind: "tool_result",
      source_id: "source-tool-not-current-input",
      payload: { content: "Not a user input." },
    });
    expect(() => core!.freezeContextSnapshot(freezeInput(scope, tool.event_id)))
      .toThrow(expect.objectContaining({ code: "CONFLICT" }));

    const database = new DatabaseSync(databasePath);
    try {
      expect(database.prepare("SELECT COUNT(*) AS n FROM cc_context_snapshots").get())
        .toEqual({ n: 0 });
      expect(database.prepare("SELECT COUNT(*) AS n FROM cc_context_attempt_starts").get())
        .toEqual({ n: 0 });
    } finally {
      database.close();
    }
  });

  it("preserves accepted Raw payload strings outside strict semantic input grammar", async () => {
    const { scope } = await createCore();
    const current = core!.appendRawSourceProjection({
      scope,
      event_id: "event-raw-payload-compatibility",
      source_kind: "user_input",
      source_id: "source-raw-payload-compatibility",
      payload: { content: "e\u0301\u0000", "e\u0301": "raw\u0001" },
    });

    const snapshot = core!.freezeContextSnapshot(freezeInput(scope, current.event_id));
    expect(snapshot.working_context).toContain("e\u0301\\u0000");
    expect(snapshot.working_context).toContain('"e\u0301":"raw\\u0001"');
    expect(core!.readContextSnapshot(scope, snapshot.manifest.snapshot_id)).toEqual(snapshot);
  });

  it("fails mandatory overflow without leaving a Snapshot or Attempt", async () => {
    const { databasePath, scope } = await createCore();
    const current = core!.appendRawSourceProjection({
      scope,
      event_id: "event-large",
      source_kind: "user_input",
      source_id: "source-large",
      payload: { content: "x".repeat(2_000) },
    });
    expect(() => core!.freezeContextSnapshot(freezeInput(scope, current.event_id, {
      hard_token_capacity: 1,
    }))).toThrow(expect.objectContaining({ code: "BUDGET_INSUFFICIENT" }));
    const database = new DatabaseSync(databasePath);
    try {
      expect(database.prepare("SELECT COUNT(*) AS n FROM cc_context_snapshots").get()).toEqual({ n: 0 });
      expect(database.prepare("SELECT COUNT(*) AS n FROM cc_context_attempt_starts").get())
        .toEqual({ n: 0 });
    } finally {
      database.close();
    }
  });

  it("rejects cross-scope refs and snapshot/attempt identity substitution", async () => {
    const { scope } = await createCore();
    const other = { namespace: "authority", stream_id: "other-stream" };
    const foreign = core!.appendRawSourceProjection({
      scope: other,
      event_id: "foreign-event",
      source_kind: "user_input",
      source_id: "foreign-source",
      payload: { content: "Foreign" },
    });
    const current = core!.appendRawSourceProjection({
      scope,
      event_id: "local-event",
      source_kind: "user_input",
      source_id: "local-source",
      payload: { content: "Local" },
    });
    expect(() => core!.freezeContextSnapshot(freezeInput(scope, current.event_id, {
      required_raw_event_ids: [foreign.event_id],
    }))).toThrow(expect.objectContaining({ code: "CONFLICT" }));

    const frozen = core!.freezeContextSnapshot(freezeInput(scope, current.event_id));
    expect(() => core!.freezeContextSnapshot(freezeInput(scope, current.event_id, {
      snapshot_id: "snapshot-substitution",
    }))).toThrow(expect.objectContaining({ code: "CONFLICT" }));
    expect(() => core!.freezeContextSnapshot(freezeInput(scope, current.event_id, {
      attempt_id: "attempt-substitution",
    }))).toThrow(expect.objectContaining({ code: "CONFLICT" }));
    expect(() => core!.freezeContextSnapshot({
      ...freezeInput(scope, current.event_id),
      operation_id: "changed-operation",
    })).toThrow(expect.objectContaining({ code: "CONFLICT" }));
    expect(core!.readContextSnapshot(scope, frozen.manifest.snapshot_id)).toEqual(frozen);
  });

  it("rolls back Snapshot and Attempt when COMMIT fails after both inserts", async () => {
    const { databasePath, scope } = await createCore();
    const current = core!.appendRawSourceProjection({
      scope,
      event_id: "event-commit-failure",
      source_kind: "user_input",
      source_id: "source-commit-failure",
      payload: { content: "Must roll back" },
    });
    const database = new DatabaseSync(databasePath);
    try {
      database.exec("PRAGMA foreign_keys = ON;");
      database.exec(`CREATE TABLE cc_test_missing_parent (id TEXT PRIMARY KEY);
        CREATE TABLE cc_test_deferred_child (
          parent_id TEXT REFERENCES cc_test_missing_parent(id) DEFERRABLE INITIALLY DEFERRED
        );
        CREATE TRIGGER cc_test_fail_snapshot_commit
          AFTER INSERT ON cc_context_attempt_starts
          BEGIN INSERT INTO cc_test_deferred_child(parent_id) VALUES ('missing'); END;`);
    } finally {
      database.close();
    }

    expect(() => core!.freezeContextSnapshot(freezeInput(scope, current.event_id)))
      .toThrow(expect.objectContaining({ code: "STORAGE_FAILURE" }));
    const verifier = new DatabaseSync(databasePath);
    try {
      expect(verifier.prepare("SELECT COUNT(*) AS n FROM cc_context_snapshots").get())
        .toEqual({ n: 0 });
      expect(verifier.prepare("SELECT COUNT(*) AS n FROM cc_context_attempt_starts").get())
        .toEqual({ n: 0 });
      expect(verifier.prepare("SELECT COUNT(*) AS n FROM cc_test_deferred_child").get())
        .toEqual({ n: 0 });
    } finally {
      verifier.close();
    }
  });

  it("keeps rows immutable and validates reopen", async () => {
    const { databasePath, scope } = await createCore();
    const current = core!.appendRawSourceProjection({
      scope,
      event_id: "event-reopen",
      source_kind: "user_input",
      source_id: "source-reopen",
      payload: { content: "Persist me" },
    });
    const frozen = core!.freezeContextSnapshot(freezeInput(scope, current.event_id));
    const database = new DatabaseSync(databasePath);
    try {
      expect(() => database.prepare(
        "UPDATE cc_context_snapshots SET working_context_text = ? WHERE snapshot_id = ?"
      ).run("tampered", frozen.manifest.snapshot_id)).toThrow();
      expect(() => database.prepare(
        "DELETE FROM cc_context_attempt_starts WHERE attempt_id = ?"
      ).run(frozen.attempt_started.attempt_id)).toThrow();
    } finally {
      database.close();
    }
    core!.close();
    core = new ContextCompilerCore(databasePath);
    expect(core.readContextSnapshot(scope, frozen.manifest.snapshot_id)).toEqual(frozen);
  });

  it("renders and binds the exact current Takeover Artifact without reviving compacted Raw", async () => {
    const { scope } = await createCore();
    const compacted = core!.appendRawSourceProjection({
      scope,
      event_id: "event-compacted",
      source_kind: "user_input",
      source_id: "source-compacted",
      payload: { content: "This Raw will be taken over." },
    });
    const body = { summary: `Exact compacted context ${"x".repeat(5_000)}` };
    const descriptor = {
      artifact_schema: "compaction-artifact/v1",
      namespace: scope.namespace,
      stream_id: scope.stream_id,
      covered_raw_range: { start: 1, end: 1 },
      generator_version: "snapshot-test/v1",
      policy_hash: SEMANTIC_TAKEOVER_POLICY_HASH,
      provenance_event_ids: [compacted.event_id],
      body,
    };
    const takeover = core!.commitSemanticTakeover({
      scope,
      takeover_commit_id: "takeover-1",
      ledger_base_revision: 1,
      covered_raw_range: { start: 1, end: 1 },
      expected_frontier_revision: 0,
      expected_frontier_position: 0,
      state_authority_ref: null,
      existing_fact_refs: [],
      existing_relation_refs: [],
      coverage: [{
        ledger_revision: 1,
        event_id: compacted.event_id,
        disposition: "artifact_only",
        state_item_refs: [],
        fact_refs: [],
        relation_refs: [],
        artifact_only_reason: "no_semantic_delta",
      }],
      compaction_artifact: {
        artifact_id: "artifact-1",
        expected_artifact_hash: sha256(canonicalJson(descriptor)),
        generator_version: "snapshot-test/v1",
        body,
      },
      policy_hash: SEMANTIC_TAKEOVER_POLICY_HASH,
      provenance_event_ids: [compacted.event_id],
    });
    const current = core!.appendRawSourceProjection({
      scope,
      event_id: "event-after-takeover",
      source_kind: "user_input",
      source_id: "source-current",
      payload: { content: "Use the compacted context." },
    });
    const omitted = core!.freezeContextSnapshot(freezeInput(scope, current.event_id, {
      snapshot_id: "snapshot-artifact-omitted",
      operation_id: "operation-artifact-omitted",
      attempt_id: "attempt-artifact-omitted",
      hard_token_capacity: 300,
    }));
    expect(omitted.manifest.current_artifact_ref).toEqual(expect.objectContaining({
      artifact_id: "artifact-1",
      included_in_working_context: false,
      inclusion_reasons: [],
    }));
    expect(omitted.working_context).not.toContain(canonicalJson(body));
    expect(core!.readContextSnapshot(scope, omitted.manifest.snapshot_id)).toEqual(omitted);

    const snapshot = core!.freezeContextSnapshot(freezeInput(scope, current.event_id));

    expect(snapshot.manifest.current_takeover_ref).toMatchObject({
      takeover_commit_id: takeover.takeover_commit_id,
      artifact_id: takeover.artifact_id,
      artifact_hash: takeover.artifact_hash,
    });
    expect(snapshot.manifest.current_artifact_ref).toMatchObject({
      artifact_id: "artifact-1",
      included_in_working_context: true,
    });
    expect(snapshot.working_context).toContain(canonicalJson(body));
    expect(snapshot.working_context).not.toContain("This Raw will be taken over.");
  });

  it("fails stored reads closed when a bound Raw owner row disappears", async () => {
    const { databasePath, scope } = await createCore();
    const current = core!.appendRawSourceProjection({
      scope,
      event_id: "event-missing-after-freeze",
      source_kind: "user_input",
      source_id: "source-missing-after-freeze",
      payload: { content: "This exact Raw is bound." },
    });
    const frozen = core!.freezeContextSnapshot(freezeInput(scope, current.event_id));
    const database = new DatabaseSync(databasePath);
    try {
      database.exec("DROP TRIGGER cc_ledger_raw_events_no_delete;");
      database.prepare(
        `DELETE FROM cc_ledger_raw_events
         WHERE namespace = ? AND stream_id = ? AND event_id = ?`
      ).run(scope.namespace, scope.stream_id, current.event_id);
      database.exec(`CREATE TRIGGER cc_ledger_raw_events_no_delete
        BEFORE DELETE ON cc_ledger_raw_events
        BEGIN
          SELECT RAISE(ABORT, 'ledger raw events are append-only');
        END;`);
    } finally {
      database.close();
    }

    expect(() => core!.readContextSnapshot(scope, frozen.manifest.snapshot_id))
      .toThrow(expect.objectContaining({ code: "CORRUPT_DATA" }));
    expect(() => core!.readContextAttemptStarted(scope, frozen.attempt_started.attempt_id))
      .toThrow(expect.objectContaining({ code: "CORRUPT_DATA" }));
  });

  it("fails closed when body and every local hash binding are laundered together", async () => {
    const { databasePath, scope } = await createCore();
    const current = core!.appendRawSourceProjection({
      scope,
      event_id: "event-body-tamper",
      source_kind: "user_input",
      source_id: "source-body-tamper",
      payload: { content: "Owner-backed body" },
    });
    const frozen = core!.freezeContextSnapshot(freezeInput(scope, current.event_id));
    core!.close();
    core = undefined;

    const database = new DatabaseSync(databasePath);
    try {
      const row = database.prepare(
        "SELECT manifest_json FROM cc_context_snapshots WHERE snapshot_id = ?"
      ).get(frozen.manifest.snapshot_id) as { manifest_json: string };
      const manifest = JSON.parse(row.manifest_json) as Record<string, unknown>;
      const forgedBody = `${frozen.working_context}\n- forged authority`;
      const forgedBodyHash = sha256(forgedBody);
      manifest.working_context_hash = forgedBodyHash;
      manifest.working_context_estimated_tokens = Math.ceil(forgedBody.length / 4);
      const forgedManifestJson = canonicalJson(manifest);
      const forgedManifestHash = sha256(forgedManifestJson);

      database.exec(`DROP TRIGGER cc_context_snapshots_no_update;
        DROP TRIGGER cc_context_attempt_starts_no_update;`);
      database.prepare(
        `UPDATE cc_context_snapshots
         SET manifest_json = ?, manifest_hash = ?, working_context_text = ?, working_context_hash = ?
         WHERE namespace = ? AND stream_id = ? AND snapshot_id = ?`
      ).run(
        forgedManifestJson,
        forgedManifestHash,
        forgedBody,
        forgedBodyHash,
        scope.namespace,
        scope.stream_id,
        frozen.manifest.snapshot_id
      );
      database.prepare(
        `UPDATE cc_context_attempt_starts SET snapshot_manifest_hash = ?
         WHERE namespace = ? AND stream_id = ? AND attempt_id = ?`
      ).run(forgedManifestHash, scope.namespace, scope.stream_id, frozen.attempt_started.attempt_id);
      database.exec(`CREATE TRIGGER cc_context_snapshots_no_update
        BEFORE UPDATE ON cc_context_snapshots
        BEGIN SELECT RAISE(ABORT, 'context snapshots are immutable'); END;
        CREATE TRIGGER cc_context_attempt_starts_no_update
        BEFORE UPDATE ON cc_context_attempt_starts
        BEGIN SELECT RAISE(ABORT, 'context attempt starts are immutable'); END;`);
    } finally {
      database.close();
    }

    core = new ContextCompilerCore(databasePath);
    expect(() => core!.readContextSnapshot(scope, frozen.manifest.snapshot_id))
      .toThrow(expect.objectContaining({ code: "CORRUPT_DATA" }));
  });

  it("rebuilds policy selection and rejects a manifest-only reason forgery", async () => {
    const { databasePath, scope } = await createCore();
    const source = core!.appendRawSourceProjection({
      scope,
      event_id: "event-manifest-policy-source",
      source_kind: "user_input",
      source_id: "source-manifest-policy-source",
      payload: { content: "Keep this goal current." },
    });
    core!.commitCanonicalState({
      scope,
      state_commit_id: "state-manifest-policy",
      commit_mode: "immediate_authority",
      expected_state_revision: 0,
      proposal: {
        schema_version: 1,
        upsert_items: [{
          item_id: "goal-manifest-policy",
          kind: "GOAL",
          content: "Keep the Snapshot policy exact",
          status: "ACTIVE",
          source_event_ids: [source.event_id],
          metadata: {},
        }],
      },
      policy_hash: CANONICAL_STATE_POLICY_HASH,
      provenance_event_ids: [source.event_id],
    });
    const current = core!.appendRawSourceProjection({
      scope,
      event_id: "event-manifest-policy-current",
      source_kind: "user_input",
      source_id: "source-manifest-policy-current",
      payload: { content: "Freeze the exact policy projection." },
    });
    const frozen = core!.freezeContextSnapshot(freezeInput(scope, current.event_id));
    core!.close();
    core = undefined;

    const database = new DatabaseSync(databasePath);
    try {
      const row = database.prepare(
        "SELECT manifest_json FROM cc_context_snapshots WHERE snapshot_id = ?"
      ).get(frozen.manifest.snapshot_id) as { manifest_json: string };
      const manifest = JSON.parse(row.manifest_json) as {
        selected_state_refs: Array<{ inclusion_reasons: string[] }>;
      } & Record<string, unknown>;
      manifest.selected_state_refs[0]!.inclusion_reasons = [
        "CURRENT_AUTHORITY",
        "EXPLICIT_REQUIRED",
      ];
      const forgedManifestJson = canonicalJson(manifest);
      const forgedManifestHash = sha256(forgedManifestJson);

      database.exec(`DROP TRIGGER cc_context_snapshots_no_update;
        DROP TRIGGER cc_context_attempt_starts_no_update;`);
      database.prepare(
        `UPDATE cc_context_snapshots SET manifest_json = ?, manifest_hash = ?
         WHERE namespace = ? AND stream_id = ? AND snapshot_id = ?`
      ).run(
        forgedManifestJson,
        forgedManifestHash,
        scope.namespace,
        scope.stream_id,
        frozen.manifest.snapshot_id
      );
      database.prepare(
        `UPDATE cc_context_attempt_starts SET snapshot_manifest_hash = ?
         WHERE namespace = ? AND stream_id = ? AND attempt_id = ?`
      ).run(forgedManifestHash, scope.namespace, scope.stream_id, frozen.attempt_started.attempt_id);
      database.exec(`CREATE TRIGGER cc_context_snapshots_no_update
        BEFORE UPDATE ON cc_context_snapshots
        BEGIN SELECT RAISE(ABORT, 'context snapshots are immutable'); END;
        CREATE TRIGGER cc_context_attempt_starts_no_update
        BEFORE UPDATE ON cc_context_attempt_starts
        BEGIN SELECT RAISE(ABORT, 'context attempt starts are immutable'); END;`);
    } finally {
      database.close();
    }

    core = new ContextCompilerCore(databasePath);
    expect(() => core!.readContextSnapshot(scope, frozen.manifest.snapshot_id))
      .toThrow(expect.objectContaining({ code: "CORRUPT_DATA" }));
  });

  it("fails closed on a partial migration collision", async () => {
    directory = await mkdtemp(join(tmpdir(), "context-snapshot-migration-"));
    const databasePath = join(directory, "context.db");
    const substrate = new SqliteRevisionSubstrate(databasePath);
    substrate.close();
    const database = new DatabaseSync(databasePath);
    try {
      database.exec("CREATE TABLE cc_context_snapshots (snapshot_id TEXT PRIMARY KEY);");
    } finally {
      database.close();
    }
    expect(() => new SqliteContextSnapshotStore(databasePath))
      .toThrow(expect.objectContaining({ code: "CORRUPT_DATA" }));
  });

  it("keeps the Snapshot store private from the package root and policy identity exact", async () => {
    const root = await import("../src/index.js") as Record<string, unknown>;
    expect(root.SqliteContextSnapshotStore).toBeUndefined();
    expect(CONTEXT_SNAPSHOT_POLICY_HASH).toBe(
      "038a11d2f29dd9b112f69657e89f069c188b521911509f07c189af128b860c05"
    );
    expect(CONTEXT_ASSEMBLER_VERSION_HASH).toBe(
      "e66825b13a057ae9648a83068e330c8025729fd77723bdd199d7cc4bd9ef888a"
    );
    expect(ContextSnapshotError).toBeDefined();
    expect(ContextCompilerCoreError).toBeDefined();
  });
});

interface ConcurrentFreezeResult {
  ok: boolean;
  manifest_hash?: string;
  created_at?: string;
  code?: string;
}

function runConcurrentFreeze(
  databasePath: string,
  input: ContextSnapshotFreezeInput
): Promise<ConcurrentFreezeResult[]> {
  const barrier = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT);
  const script = `
    const { parentPort, workerData } = require("node:worker_threads");
    const { join } = require("node:path");
    const { pathToFileURL } = require("node:url");
    (async () => {
      const api = await import(pathToFileURL(join(workerData.root, "dist", "core.js")).href);
      const core = new api.ContextCompilerCore(workerData.databasePath);
      const view = new Int32Array(workerData.barrier);
      Atomics.add(view, 0, 1);
      Atomics.notify(view, 0);
      while (Atomics.load(view, 0) < 2) Atomics.wait(view, 0, 1);
      try {
        const snapshot = core.freezeContextSnapshot(workerData.input);
        parentPort.postMessage({
          ok: true,
          manifest_hash: snapshot.manifest_hash,
          created_at: snapshot.manifest.created_at,
        });
      } catch (error) {
        parentPort.postMessage({ ok: false, code: error && error.code });
      } finally {
        core.close();
      }
    })().catch((error) => parentPort.postMessage({
      ok: false,
      code: String(error && (error.code ? error.code + ":" + error.message : error.message || error)),
    }));
  `;
  return Promise.all([0, 1].map(() => new Promise<ConcurrentFreezeResult>((resolve, reject) => {
    const worker = new Worker(script, {
      eval: true,
      workerData: {
        root: process.cwd(),
        databasePath,
        input,
        barrier,
      },
    });
    worker.once("message", resolve);
    worker.once("error", reject);
    worker.once("exit", (exitCode) => {
      if (exitCode !== 0) reject(new Error(`ContextSnapshot worker exited ${exitCode}`));
    });
  })));
}
