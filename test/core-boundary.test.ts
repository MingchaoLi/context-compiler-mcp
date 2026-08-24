import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import * as publicSurface from "../src/index.js";
import {
  CONTEXT_COMPILER_COMMANDS,
  CANONICAL_FACT_RELATION_POLICY_HASH,
  CANONICAL_STATE_POLICY_HASH,
  SEMANTIC_TAKEOVER_POLICY_HASH,
  ContextCompilerCore,
  ContextCompilerCoreError,
  ContextCompilerMcpService,
  createEmptyStateDelta,
  type ContextCompilerCommandName,
  type ContextCompilerCommandPort,
  type ContextCompilerCoreResponse,
} from "../src/index.js";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("ContextCompilerCore boundary", () => {
  it("does not expose a generic revision writer on the package root", () => {
    expect("SqliteRevisionSubstrate" in publicSurface).toBe(false);
    expect("commitLedgerRevisionInsideCore" in publicSurface).toBe(false);
    expect("commitStateRevisionInsideCore" in publicSurface).toBe(false);
    expect("compareAndAdvanceFrontierInsideCore" in publicSurface).toBe(false);
    expect("SqliteLedgerHotRawStore" in publicSurface).toBe(false);
    expect("migrateLedgerHotRaw" in publicSurface).toBe(false);
    expect("SqliteCanonicalStateStore" in publicSurface).toBe(false);
    expect("migrateCanonicalState" in publicSurface).toBe(false);
    expect("SqliteCanonicalFactRelationStore" in publicSurface).toBe(false);
    expect("migrateCanonicalFactRelation" in publicSurface).toBe(false);
    expect("SqliteAuthorityTransactionCoordinator" in publicSurface).toBe(false);
    expect("migrateSemanticAuthority" in publicSurface).toBe(false);
    expect("executeSemanticTakeoverInsideCore" in publicSurface).toBe(false);
    expect("executeSemanticEnrichmentInsideCore" in publicSurface).toBe(false);
    expect("readCanonicalStateAuthorityInsideCore" in publicSurface).toBe(false);
    expect("applyCanonicalFactRelationInsideCore" in publicSurface).toBe(false);

    const core = new ContextCompilerCore(databasePath());
    const ownValues = Reflect.ownKeys(core).map((key) => Reflect.get(core, key));
    expect(Reflect.ownKeys(core)).not.toContain("revisionSubstrate");
    expect(ownValues.some((value) =>
      typeof value === "object" && value !== null &&
      value.constructor?.name === "SqliteRevisionSubstrate"
    )).toBe(false);
    expect(ownValues.some((value) =>
      typeof value === "object" && value !== null &&
      value.constructor?.name === "SqliteLedgerHotRawStore"
    )).toBe(false);
    expect(ownValues.some((value) =>
      typeof value === "object" && value !== null &&
      value.constructor?.name === "SqliteCanonicalStateStore"
    )).toBe(false);
    expect(ownValues.some((value) =>
      typeof value === "object" && value !== null &&
      value.constructor?.name === "SqliteCanonicalFactRelationStore"
    )).toBe(false);
    expect(ownValues.some((value) =>
      typeof value === "object" && value !== null &&
      value.constructor?.name === "SqliteAuthorityTransactionCoordinator"
    )).toBe(false);
    expect(ownValues.some((value) =>
      typeof value === "object" && value !== null &&
      Reflect.ownKeys(Object.getPrototypeOf(value)).some((key) =>
        typeof key === "symbol" && key.description === "commitRevisionInsideCore"
      )
    )).toBe(false);
    core.close();
  });

  it("covers current commands and research records without Store imports", () => {
    const core = new ContextCompilerCore(databasePath());
    expect(unwrap(core.call("health", {}))).toEqual({
      version: "0.1.0",
      capabilities: [...CONTEXT_COMPILER_COMMANDS],
      ready: true,
    });
    expect(core.getRevisionVector({
      namespace: "authority",
      stream_id: "core-session",
    })).toEqual({
      namespace: "authority",
      stream_id: "core-session",
      ledger_revision: 0,
      state_revision: 0,
      raw_frontier_revision: 0,
      frontier_position: 0,
      takeover_commit_revision: 0,
    });

    const event = unwrap(core.call("ingest_event", {
      session_id: "core-session",
      role: "user",
      content: "preserve the authority boundary",
      source_event_id: "event-1",
    })) as { id: string };
    expect(core.getRevisionVector({
      namespace: "authority",
      stream_id: "core-session",
    }).ledger_revision).toBe(0);
    const canonicalEvent = core.appendRawSourceProjection({
      scope: { namespace: "authority", stream_id: "canonical-stream" },
      event_id: "canonical-event-1",
      source_kind: "user_input",
      source_id: "core-event-source",
      source_session_id: "core-session",
      payload: { content: "explicit projection" },
    });
    expect(canonicalEvent.ledger_revision).toBe(1);
    expect(core.getRevisionVector({
      namespace: "authority",
      stream_id: "core-session",
    }).ledger_revision).toBe(0);
    expect(core.rebuildHotRaw({
      namespace: "authority",
      stream_id: "canonical-stream",
    })).toMatchObject({
      ledger_high_water: 1,
      events: [{
        event_id: "canonical-event-1",
        source_session_id: "core-session",
      }],
    });
    const canonicalState = core.commitCanonicalState({
      scope: { namespace: "authority", stream_id: "canonical-stream" },
      state_commit_id: "canonical-state-1",
      commit_mode: "immediate_authority",
      expected_state_revision: 0,
      proposal: {
        schema_version: 1,
        upsert_items: [{
          item_id: "canonical-goal",
          kind: "GOAL",
          content: "Preserve explicit authority",
          status: "ACTIVE",
          source_event_ids: ["canonical-event-1"],
          metadata: {},
        }],
      },
      policy_hash: CANONICAL_STATE_POLICY_HASH,
      provenance_event_ids: ["canonical-event-1"],
    });
    expect(canonicalState.state_revision).toBe(1);
    expect(core.readCanonicalState({
      namespace: "authority", stream_id: "canonical-stream",
    })).toMatchObject({
      state_revision: 1,
      state: { items: [{ item_id: "canonical-goal" }] },
    });
    expect(core.readCanonicalStateRevision({
      namespace: "authority", stream_id: "canonical-stream",
    }, 1)).toEqual(canonicalState);
    const knowledgeVector = core.getRevisionVector({
      namespace: "authority", stream_id: "canonical-stream",
    });
    const knowledge = core.commitCanonicalFactsAndRelations({
      scope: { namespace: "authority", stream_id: "canonical-stream" },
      authority_commit_id: "canonical-knowledge-1",
      policy_hash: CANONICAL_FACT_RELATION_POLICY_HASH,
      fact_proposals: [{
        op: "CREATE",
        fact_id: "canonical-fact",
        statement: "The explicit authority boundary is preserved",
        epistemic_origin: "tool_observed",
        verification_status: "corroborated",
        lifecycle_status: "active",
        record_status: "live",
        provenance_event_ids: ["canonical-event-1"],
        verification_event_ids: ["canonical-event-1"],
        metadata: {},
      }],
      relation_proposals: [{
        op: "CREATE",
        relation_id: "canonical-relation",
        source: { type: "STATE_ITEM", id: "canonical-goal" },
        relation_type: "DEPENDS_ON",
        target: { type: "FACT", id: "canonical-fact" },
        origin: "tool_observed",
        provenance_event_ids: ["canonical-event-1"],
        status: "active",
        metadata: {},
      }],
    });
    expect(knowledge).toMatchObject({
      authority_commit_id: "canonical-knowledge-1",
      observed_revision_vector: knowledgeVector,
      facts: [{ fact_id: "canonical-fact", fact_revision: 1 }],
      relations: [{ relation_id: "canonical-relation", relation_revision: 1 }],
    });
    expect(core.getRevisionVector({
      namespace: "authority", stream_id: "canonical-stream",
    })).toEqual(knowledgeVector);
    expect(core.readCanonicalFactsAndRelations({
      namespace: "authority", stream_id: "canonical-stream",
    })).toMatchObject({
      revision_vector: knowledgeVector,
      facts: [{ fact_id: "canonical-fact" }],
      relations: [{ relation_id: "canonical-relation" }],
    });
    expect(core.readCanonicalFactRevision({
      namespace: "authority", stream_id: "canonical-stream",
    }, "canonical-fact", 1)).toEqual(knowledge.facts[0]);
    expect(core.readCanonicalRelationRevision({
      namespace: "authority", stream_id: "canonical-stream",
    }, "canonical-relation", 1)).toEqual(knowledge.relations[0]);
    expect(core.readCanonicalFactRelationCommit({
      namespace: "authority", stream_id: "canonical-stream",
    }, "canonical-knowledge-1")).toEqual(knowledge);

    const semanticScope = { namespace: "authority", stream_id: "canonical-stream" };
    const semanticBody = { summary: "Core library-only semantic Takeover" };
    const semanticDescriptor = {
      artifact_schema: "compaction-artifact/v1",
      namespace: semanticScope.namespace,
      stream_id: semanticScope.stream_id,
      covered_raw_range: { start: 1, end: 1 },
      generator_version: "core-boundary-test/v1",
      policy_hash: SEMANTIC_TAKEOVER_POLICY_HASH,
      provenance_event_ids: ["canonical-event-1"],
      body: semanticBody,
    };
    const semanticTakeover = core.commitSemanticTakeover({
      scope: semanticScope,
      takeover_commit_id: "core-semantic-takeover-1",
      ledger_base_revision: 1,
      covered_raw_range: { start: 1, end: 1 },
      expected_frontier_revision: 0,
      expected_frontier_position: 0,
      state_authority_ref: {
        state_revision: 1,
        state_commit_id: "canonical-state-1",
        state_hash: canonicalState.state_hash,
        required_item_ids: ["canonical-goal"],
      },
      existing_fact_refs: [{ fact_id: "canonical-fact", fact_revision: 1 }],
      existing_relation_refs: [{
        relation_id: "canonical-relation",
        relation_revision: 1,
      }],
      coverage: [{
        ledger_revision: 1,
        event_id: "canonical-event-1",
        disposition: "canonicalized",
        state_item_refs: ["canonical-goal"],
        fact_refs: [{ fact_id: "canonical-fact", fact_revision: 1 }],
        relation_refs: [{ relation_id: "canonical-relation", relation_revision: 1 }],
      }],
      compaction_artifact: {
        artifact_id: "core-artifact-1",
        expected_artifact_hash: createHash("sha256")
          .update(canonicalJson(semanticDescriptor), "utf8").digest("hex"),
        generator_version: "core-boundary-test/v1",
        body: semanticBody,
      },
      policy_hash: SEMANTIC_TAKEOVER_POLICY_HASH,
      provenance_event_ids: ["canonical-event-1"],
    });
    expect(core.readSemanticTakeover(
      semanticScope, "core-semantic-takeover-1"
    )).toEqual(semanticTakeover);
    expect(core.readCompactionArtifact(semanticScope, "core-artifact-1")).toMatchObject({
      artifact_hash: semanticTakeover.artifact_hash,
      covered_raw_range: { start: 1, end: 1 },
    });
    expect(core.readCurrentSemanticTakeover(semanticScope)).toMatchObject({
      takeover: { takeover_commit_id: "core-semantic-takeover-1" },
      revision_vector: {
        state_revision: 1,
        frontier_position: 1,
        takeover_commit_revision: 1,
      },
    });
    expect(core.rebuildHotRaw(semanticScope).events).toEqual([]);

    core.appendRawSourceProjection({
      scope: semanticScope,
      event_id: "canonical-event-2",
      source_kind: "tool_result",
      source_id: "core-event-source-2",
      payload: { content: "non-contiguous enrichment evidence" },
    });
    const beforeEnrichment = core.getRevisionVector(semanticScope);
    const semanticEnrichment = core.commitSemanticEnrichment({
      scope: semanticScope,
      enrichment_commit_id: "core-semantic-enrichment-1",
      source_event_refs: [
        { ledger_revision: 1, event_id: "canonical-event-1" },
        { ledger_revision: 2, event_id: "canonical-event-2" },
      ],
      state_authority_ref: {
        state_revision: 1,
        state_commit_id: "canonical-state-1",
        state_hash: canonicalState.state_hash,
        required_item_ids: ["canonical-goal"],
      },
      existing_fact_refs: [],
      existing_relation_refs: [],
      fact_relation_apply: {
        scope: semanticScope,
        authority_commit_id: "core-enrichment-authority-1",
        policy_hash: CANONICAL_FACT_RELATION_POLICY_HASH,
        fact_proposals: [{
          op: "CREATE",
          fact_id: "core-enrichment-fact",
          statement: "Enrichment stays axis-neutral",
          epistemic_origin: "tool_observed",
          verification_status: "corroborated",
          lifecycle_status: "active",
          record_status: "live",
          provenance_event_ids: ["canonical-event-1", "canonical-event-2"],
          verification_event_ids: ["canonical-event-2"],
          metadata: {},
        }],
        relation_proposals: [],
      },
      policy_hash: SEMANTIC_TAKEOVER_POLICY_HASH,
      provenance_event_ids: ["canonical-event-1", "canonical-event-2"],
    });
    expect(core.readSemanticEnrichment(
      semanticScope, "core-semantic-enrichment-1"
    )).toEqual(semanticEnrichment);
    expect(core.getRevisionVector(semanticScope)).toEqual(beforeEnrichment);

    const prepared = unwrap(core.call("prepare_state_update", {
      session_id: "core-session",
      newest_event_ids: [event.id],
    })) as {
      preparation_token: string;
      fingerprint: string;
      expected_revision: number;
    };
    expect(unwrap(core.call("apply_state_delta", {
      session_id: "core-session",
      preparation_token: prepared.preparation_token,
      fingerprint: prepared.fingerprint,
      expected_revision: prepared.expected_revision,
      delta: createEmptyStateDelta(),
    }))).toMatchObject({ changed: false, revision: 0 });
    expect(unwrap(core.call("get_state", { session_id: "core-session" }))).toMatchObject({
      session_id: "core-session",
      revision: 0,
      items: [],
      relations: [],
    });
    expect(core.getRevisionVector({
      namespace: "authority", stream_id: "core-session",
    }).state_revision).toBe(0);

    const headline = unwrap(core.call("create_headline", {
      session_id: "core-session",
      event_start_seq: 1,
      event_end_seq: 1,
      headline: "Authority boundary",
      keywords: ["authority", "boundary"],
    })) as { id: string };
    expect(unwrap(core.call("recall_exact", {
      session_id: "core-session",
      kind: "headline_id",
      headline_id: headline.id,
    }))).toMatchObject({ found: true, events: [{ id: event.id }] });
    expect(unwrap(core.call("recall_keyword", {
      session_id: "core-session",
      query: "authority",
    }))).toHaveLength(1);

    unwrap(core.call("compile_context", {
      session_id: "core-session",
      current_input: "What is the boundary?",
      operation_id: "compile-1",
    }));
    const action = core.appendExperienceRecord({
      session_id: "core-session",
      kind: "ACTION",
      source_key: "research/action-1",
      raw_event_ids: [event.id],
      payload: { note: "research only" },
    });
    expect(action.kind).toBe("ACTION");
    expect(core.getExperienceRecords("core-session").map((record) => record.kind)).toEqual([
      "EVENT",
      "CONTEXT_COMPILE",
      "ACTION",
    ]);

    expect(() => core.appendExperienceRecord({
      session_id: "core-session",
      kind: "ACTION",
      source_key: "context-compile/forged",
      payload: {},
    })).toThrowError(expect.objectContaining<Partial<ContextCompilerCoreError>>({
      code: "INVALID_INPUT",
    }));

    core.close();
    core.close();
    expect(core.call("health", {})).toEqual({
      ok: false,
      error: { code: "STORAGE_FAILURE" },
    });
    expect(() => core.getExperienceRecords("core-session")).toThrowError(
      expect.objectContaining<Partial<ContextCompilerCoreError>>({ code: "STORAGE_FAILURE" })
    );
    expect(() => core.getRevisionVector({
      namespace: "authority",
      stream_id: "core-session",
    })).toThrowError(
      expect.objectContaining<Partial<ContextCompilerCoreError>>({ code: "STORAGE_FAILURE" })
    );
    expect(() => core.appendRawSourceProjection({
      scope: { namespace: "authority", stream_id: "closed" },
      event_id: "closed-event",
      source_kind: "file",
      source_id: "closed",
      payload: {},
    })).toThrowError(
      expect.objectContaining<Partial<ContextCompilerCoreError>>({ code: "STORAGE_FAILURE" })
    );
    expect(() => core.rebuildHotRaw({
      namespace: "authority", stream_id: "closed",
    })).toThrowError(
      expect.objectContaining<Partial<ContextCompilerCoreError>>({ code: "STORAGE_FAILURE" })
    );
    expect(() => core.readCanonicalState({
      namespace: "authority", stream_id: "closed",
    })).toThrowError(
      expect.objectContaining<Partial<ContextCompilerCoreError>>({ code: "STORAGE_FAILURE" })
    );
  });

  it("keeps the MCP service as a lifecycle-owning command adapter", () => {
    const calls: Array<{ command: ContextCompilerCommandName; input: unknown }> = [];
    let closeCount = 0;
    const port: ContextCompilerCommandPort = {
      call(command, input) {
        calls.push({ command, input });
        return { ok: true, result: { delegated: command } };
      },
      close() {
        closeCount += 1;
      },
    };
    const service = new ContextCompilerMcpService(port);
    expect(service.call("get_state", { session_id: "adapter" })).toEqual({
      ok: true,
      result: { delegated: "get_state" },
    });
    expect(calls).toEqual([{
      command: "get_state",
      input: { session_id: "adapter" },
    }]);
    service.close();
    service.close();
    expect(closeCount).toBe(1);
    expect(service.call("health", {})).toEqual({
      ok: false,
      error: { code: "STORAGE_FAILURE" },
    });
  });
});

function databasePath(): string {
  const directory = mkdtempSync(join(tmpdir(), "context-compiler-core-boundary-"));
  temporaryDirectories.push(directory);
  return join(directory, "context.db");
}

function unwrap(response: ContextCompilerCoreResponse): unknown {
  if (!response.ok) throw new Error(response.error.code);
  return response.result;
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${canonicalJson((value as Record<string, unknown>)[key])}`
    ).join(",")}}`;
  }
  return JSON.stringify(value);
}
