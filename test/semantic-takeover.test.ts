import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { SqliteAuthorityTransactionCoordinator } from
  "../src/authority-transaction-coordinator.js";
import {
  CANONICAL_FACT_RELATION_POLICY_HASH,
  SqliteCanonicalFactRelationStore,
} from "../src/canonical-fact-relation.js";
import {
  CANONICAL_STATE_POLICY_HASH,
  SqliteCanonicalStateStore,
} from "../src/canonical-state.js";
import { SqliteLedgerHotRawStore } from "../src/ledger-hot-raw.js";
import { SqliteRevisionSubstrate } from "../src/revision-substrate.js";
import {
  SEMANTIC_TAKEOVER_POLICY_HASH,
  SemanticTakeoverError,
  type SemanticEnrichmentCommitInput,
  type SemanticTakeoverCommitInput,
} from "../src/semantic-takeover.js";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("WO-04C semantic Takeover / Enrichment domain", () => {
  it("freezes the exact policy hash", () => {
    expect(SEMANTIC_TAKEOVER_POLICY_HASH).toBe(
      "dc1432f8e65911fb114c87921f14e6b3111b23dcd03278a5d13f7c4632e54467"
    );
  });

  it("commits, replays, reads and reopens one artifact-only contiguous Takeover", () => {
    const database = databasePath();
    const opened = openStores(database);
    const scope = { namespace: "authority", stream_id: "artifact-only" };
    append(opened, scope, "event-1");
    append(opened, scope, "event-2");
    const input = takeoverInput(scope, "takeover-1", ["event-1", "event-2"]);
    const committed = opened.coordinator.commitTakeover(input);
    expect(committed).toMatchObject({
      takeover_commit_id: "takeover-1",
      covered_raw_range: { start: 1, end: 2 },
      previous_state_revision: 0,
      new_state_revision: 0,
      previous_revision_vector: {
        ledger_revision: 2,
        raw_frontier_revision: 0,
        frontier_position: 0,
        takeover_commit_revision: 0,
      },
      current_revision_vector: {
        ledger_revision: 2,
        raw_frontier_revision: 1,
        frontier_position: 2,
        takeover_commit_revision: 1,
      },
    });
    expect(opened.coordinator.commitTakeover(input)).toEqual(committed);
    expect(opened.coordinator.readTakeover(scope, "takeover-1")).toEqual(committed);
    expect(opened.coordinator.readArtifact(scope, "artifact-takeover-1")).toMatchObject({
      artifact_hash: committed.artifact_hash,
      provenance_event_ids: ["event-1", "event-2"],
      covered_raw_range: { start: 1, end: 2 },
    });
    expect(opened.coordinator.readCurrent(scope)).toMatchObject({
      revision_vector: committed.current_revision_vector,
      takeover: { takeover_commit_id: "takeover-1" },
      artifact: { artifact_id: "artifact-takeover-1" },
    });
    expect(opened.hot.rebuild(scope).events).toEqual([]);
    closeStores(opened);

    const reopened = openStores(database);
    expect(reopened.coordinator.readTakeover(scope, "takeover-1")).toEqual(committed);
    expect(reopened.hot.rebuild(scope).events).toEqual([]);
    closeStores(reopened);
  });

  it("keeps the latest Takeover current after a later Raw axis advance", () => {
    const database = databasePath();
    const opened = openStores(database);
    const scope = { namespace: "authority", stream_id: "later-raw" };
    append(opened, scope, "event-1");
    const committed = opened.coordinator.commitTakeover(
      takeoverInput(scope, "takeover-before-later-raw", ["event-1"])
    );
    append(opened, scope, "event-2");
    const live = opened.substrate.getRevisionVector(scope);

    expect(live).toMatchObject({
      ledger_revision: 2,
      frontier_position: 1,
      takeover_commit_revision: 1,
    });
    expect(opened.coordinator.readCurrent(scope)).toEqual({
      ...scope,
      revision_vector: live,
      takeover: committed,
      artifact: opened.coordinator.readArtifact(scope, committed.artifact_id),
    });
    expect(committed.current_revision_vector).toMatchObject({
      ledger_revision: 1,
      frontier_position: 1,
      takeover_commit_revision: 1,
    });
    expect(opened.hot.rebuild(scope).events.map(({ event_id }) => event_id)).toEqual(["event-2"]);
    closeStores(opened);

    const reopened = openStores(database);
    expect(reopened.coordinator.readCurrent(scope)).toMatchObject({
      revision_vector: live,
      takeover: {
        takeover_commit_id: committed.takeover_commit_id,
        current_revision_vector: committed.current_revision_vector,
      },
      artifact: { artifact_id: committed.artifact_id },
    });
    closeStores(reopened);
  });

  it("atomically applies owner-validated Fact authority and proves coverage", () => {
    const opened = openStores(databasePath());
    const scope = { namespace: "authority", stream_id: "fact-apply" };
    append(opened, scope, "event-1");
    append(opened, scope, "event-2");
    const input = takeoverInput(scope, "takeover-fact", ["event-1", "event-2"]);
    input.fact_relation_apply = {
      scope,
      authority_commit_id: "knowledge-in-takeover",
      policy_hash: CANONICAL_FACT_RELATION_POLICY_HASH,
      fact_proposals: [{
        op: "CREATE",
        fact_id: "fact-1",
        statement: "A durable fact",
        epistemic_origin: "user_asserted",
        verification_status: "unverified",
        lifecycle_status: "active",
        record_status: "live",
        provenance_event_ids: ["event-1"],
        verification_event_ids: [],
        metadata: {},
      }],
      relation_proposals: [],
    };
    input.coverage[0] = {
      ledger_revision: 1,
      event_id: "event-1",
      disposition: "canonicalized",
      state_item_refs: [],
      fact_refs: [{ fact_id: "fact-1", fact_revision: 1 }],
      relation_refs: [],
    };
    refreshArtifactHash(input);
    const committed = opened.coordinator.commitTakeover(input);
    expect(committed.authority_manifest).toEqual({
      state_authority_ref: null,
      fact_refs: [{ fact_id: "fact-1", fact_revision: 1 }],
      relation_refs: [],
      fact_relation_authority_commit_id: "knowledge-in-takeover",
    });
    expect(opened.knowledge.readFactRevision(scope, "fact-1", 1)).toMatchObject({
      authority_commit_id: "knowledge-in-takeover",
      observed_revision_vector: committed.previous_revision_vector,
    });
    closeStores(opened);
  });

  it("uses exact committed State authority without advancing the State axis", () => {
    const opened = openStores(databasePath());
    const scope = { namespace: "authority", stream_id: "state-ref" };
    append(opened, scope, "event-1");
    const state = opened.state.commit({
      scope,
      state_commit_id: "state-1",
      commit_mode: "lazy_historical",
      expected_state_revision: 0,
      proposal: {
        schema_version: 1,
        upsert_items: [{
          item_id: "goal-1",
          kind: "GOAL",
          content: "Preserve the goal",
          status: "ACTIVE",
          source_event_ids: ["event-1"],
          metadata: {},
        }],
      },
      policy_hash: CANONICAL_STATE_POLICY_HASH,
      provenance_event_ids: ["event-1"],
    });
    append(opened, scope, "event-2");
    const input = takeoverInput(scope, "takeover-state", ["event-1", "event-2"]);
    input.state_authority_ref = {
      state_revision: 1,
      state_commit_id: "state-1",
      state_hash: state.state_hash,
      required_item_ids: ["goal-1"],
    };
    input.coverage[0] = {
      ledger_revision: 1,
      event_id: "event-1",
      disposition: "canonicalized",
      state_item_refs: ["goal-1"],
      fact_refs: [],
      relation_refs: [],
    };
    refreshArtifactHash(input);
    const committed = opened.coordinator.commitTakeover(input);
    expect(committed.previous_state_revision).toBe(1);
    expect(committed.new_state_revision).toBe(1);
    expect(opened.substrate.getRevisionVector(scope).state_revision).toBe(1);
    closeStores(opened);
  });

  it("commits non-contiguous Enrichment without advancing any primary axis", () => {
    const opened = openStores(databasePath());
    const scope = { namespace: "authority", stream_id: "enrichment" };
    append(opened, scope, "event-1");
    append(opened, scope, "event-2");
    append(opened, scope, "event-3");
    const before = opened.substrate.getRevisionVector(scope);
    const input: SemanticEnrichmentCommitInput = {
      scope,
      enrichment_commit_id: "enrichment-1",
      source_event_refs: [
        { ledger_revision: 1, event_id: "event-1" },
        { ledger_revision: 3, event_id: "event-3" },
      ],
      state_authority_ref: null,
      existing_fact_refs: [],
      existing_relation_refs: [],
      fact_relation_apply: {
        scope,
        authority_commit_id: "knowledge-enrichment",
        policy_hash: CANONICAL_FACT_RELATION_POLICY_HASH,
        fact_proposals: [{
          op: "CREATE",
          fact_id: "historical-fact",
          statement: "Non-contiguous evidence",
          epistemic_origin: "user_asserted",
          verification_status: "corroborated",
          lifecycle_status: "active",
          record_status: "live",
          provenance_event_ids: ["event-1", "event-3"],
          verification_event_ids: ["event-3"],
          metadata: {},
        }],
        relation_proposals: [],
      },
      policy_hash: SEMANTIC_TAKEOVER_POLICY_HASH,
      provenance_event_ids: ["event-1", "event-3"],
    };
    const committed = opened.coordinator.commitEnrichment(input);
    expect(committed).toMatchObject({
      enrichment_commit_id: "enrichment-1",
      observed_revision_vector: before,
      authority_manifest: {
        fact_refs: [{ fact_id: "historical-fact", fact_revision: 1 }],
        fact_relation_authority_commit_id: "knowledge-enrichment",
      },
    });
    expect(opened.coordinator.commitEnrichment(input)).toEqual(committed);
    expect(opened.coordinator.readEnrichment(scope, "enrichment-1")).toEqual(committed);
    const substituted = structuredClone(input);
    substituted.fact_relation_apply.policy_hash = "f".repeat(64);
    expect(() => opened.coordinator.commitEnrichment(substituted))
      .toThrowError(code("CONFLICT"));
    expect(opened.coordinator.readEnrichment(scope, "enrichment-1")).toEqual(committed);
    expect(opened.substrate.getRevisionVector(scope)).toEqual(before);
    closeStores(opened);
  });

  it("rejects holes, stale CAS, bad coverage and replay substitution without mutation", () => {
    const opened = openStores(databasePath());
    const scope = { namespace: "authority", stream_id: "fail-closed" };
    append(opened, scope, "event-1");
    append(opened, scope, "event-2");
    const baseline = opened.substrate.getRevisionVector(scope);
    const hole = takeoverInput(scope, "hole", ["event-1", "event-2"]);
    hole.covered_raw_range.start = 2;
    refreshArtifactHash(hole);
    expect(() => opened.coordinator.commitTakeover(hole)).toThrowError(code("CONFLICT"));

    const stale = takeoverInput(scope, "stale", ["event-1", "event-2"]);
    stale.expected_frontier_revision = 1;
    expect(() => opened.coordinator.commitTakeover(stale)).toThrowError(code("CONFLICT"));

    const afterLedger = takeoverInput(
      scope,
      "after-ledger",
      ["event-1", "event-2", "event-3"]
    );
    expect(() => opened.coordinator.commitTakeover(afterLedger))
      .toThrowError(code("INVALID_INPUT"));

    const omitted = takeoverInput(scope, "omitted", ["event-1", "event-2"]);
    omitted.coverage.pop();
    refreshArtifactHash(omitted);
    expect(() => opened.coordinator.commitTakeover(omitted))
      .toThrowError(code("CONFLICT"));

    const wrongOrder = takeoverInput(scope, "wrong-order", ["event-1", "event-2"]);
    wrongOrder.coverage.reverse();
    refreshArtifactHash(wrongOrder);
    expect(() => opened.coordinator.commitTakeover(wrongOrder))
      .toThrowError(code("CONFLICT"));

    const badCoverage = takeoverInput(scope, "bad-coverage", ["event-1", "event-2"]);
    badCoverage.coverage[1]!.event_id = "event-1";
    refreshArtifactHash(badCoverage);
    expect(() => opened.coordinator.commitTakeover(badCoverage))
      .toThrowError(code("CONFLICT"));
    expect(opened.substrate.getRevisionVector(scope)).toEqual(baseline);

    const valid = takeoverInput(scope, "valid", ["event-1", "event-2"]);
    const committed = opened.coordinator.commitTakeover(valid);
    const substituted = structuredClone(valid);
    substituted.compaction_artifact.body = { summary: "replacement" };
    refreshArtifactHash(substituted);
    expect(() => opened.coordinator.commitTakeover(substituted))
      .toThrowError(code("CONFLICT"));
    expect(opened.coordinator.readTakeover(scope, "valid")).toEqual(committed);
    closeStores(opened);
  });

  it("separates new invalid policy or artifact hashes from replay substitution", () => {
    const opened = openStores(databasePath());
    const scope = { namespace: "authority", stream_id: "hash-policy" };
    append(opened, scope, "event-1");
    const baseline = opened.substrate.getRevisionVector(scope);

    const mismatchedHash = takeoverInput(scope, "mismatched-hash", ["event-1"]);
    mismatchedHash.compaction_artifact.expected_artifact_hash = "f".repeat(64);
    expect(() => opened.coordinator.commitTakeover(mismatchedHash))
      .toThrowError(code("INVALID_INPUT"));

    const unsupportedPolicy = takeoverInput(scope, "unsupported-policy", ["event-1"]);
    unsupportedPolicy.policy_hash = "f".repeat(64);
    refreshArtifactHash(unsupportedPolicy);
    expect(() => opened.coordinator.commitTakeover(unsupportedPolicy))
      .toThrowError(code("INVALID_INPUT"));
    expect(opened.substrate.getRevisionVector(scope)).toEqual(baseline);

    const valid = takeoverInput(scope, "stable-identity", ["event-1"]);
    const committed = opened.coordinator.commitTakeover(valid);
    const hashSubstitution = structuredClone(valid);
    hashSubstitution.compaction_artifact.expected_artifact_hash = "f".repeat(64);
    expect(() => opened.coordinator.commitTakeover(hashSubstitution))
      .toThrowError(code("CONFLICT"));
    const policySubstitution = structuredClone(valid);
    policySubstitution.policy_hash = "f".repeat(64);
    refreshArtifactHash(policySubstitution);
    expect(() => opened.coordinator.commitTakeover(policySubstitution))
      .toThrowError(code("CONFLICT"));
    expect(opened.coordinator.readTakeover(scope, "stable-identity")).toEqual(committed);
    closeStores(opened);
  });

  it("requires Takeover and Enrichment owner applies to create a fresh authority commit", () => {
    const database = databasePath();
    const opened = openStores(database);
    const scope = { namespace: "authority", stream_id: "fresh-owner-apply" };
    append(opened, scope, "event-1");
    const ownerInput = factApply(scope, "existing-owner", "existing-fact", ["event-1"]);
    opened.knowledge.commit(ownerInput);
    const baseline = opened.substrate.getRevisionVector(scope);

    const takeover = takeoverInput(scope, "reuse-takeover", ["event-1"]);
    takeover.fact_relation_apply = structuredClone(ownerInput);
    takeover.coverage[0] = {
      ledger_revision: 1,
      event_id: "event-1",
      disposition: "canonicalized",
      state_item_refs: [],
      fact_refs: [{ fact_id: "existing-fact", fact_revision: 1 }],
      relation_refs: [],
    };
    refreshArtifactHash(takeover);
    expect(() => opened.coordinator.commitTakeover(takeover))
      .toThrowError(code("CONFLICT"));

    const enrichment: SemanticEnrichmentCommitInput = {
      scope,
      enrichment_commit_id: "reuse-enrichment",
      source_event_refs: [{ ledger_revision: 1, event_id: "event-1" }],
      state_authority_ref: null,
      existing_fact_refs: [],
      existing_relation_refs: [],
      fact_relation_apply: structuredClone(ownerInput),
      policy_hash: SEMANTIC_TAKEOVER_POLICY_HASH,
      provenance_event_ids: ["event-1"],
    };
    expect(() => opened.coordinator.commitEnrichment(enrichment))
      .toThrowError(code("CONFLICT"));
    expect(opened.substrate.getRevisionVector(scope)).toEqual(baseline);
    const audit = new DatabaseSync(database);
    expect(audit.prepare(
      "SELECT COUNT(*) AS count FROM cc_semantic_takeover_commits"
    ).get()).toEqual({ count: 0 });
    expect(audit.prepare(
      "SELECT COUNT(*) AS count FROM cc_semantic_enrichment_commits"
    ).get()).toEqual({ count: 0 });
    audit.close();
    closeStores(opened);
  });

  it("preserves accepted Raw payload grammar while rejecting unsafe Artifact input", () => {
    const opened = openStores(databasePath());
    const scope = { namespace: "authority", stream_id: "raw-grammar" };
    opened.hot.append({
      scope,
      event_id: "event-1",
      source_kind: "user_input",
      source_id: "source-event-1",
      payload: { content: "e\u0301\u0000", "e\u0301": "raw\u0001" },
    });
    const baseline = opened.substrate.getRevisionVector(scope);
    const unsafeBodies: unknown[] = [
      { summary: "e\u0301" },
      { summary: "bad\u0000" },
      new Date("2026-08-25T00:00:00.000Z"),
      Object.assign([], { 1: "sparse" }),
    ];
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    unsafeBodies.push(cyclic);
    const accessor: Record<string, unknown> = {};
    Object.defineProperty(accessor, "summary", {
      enumerable: true,
      get: () => "must-not-run",
    });
    unsafeBodies.push(accessor);
    for (const [index, body] of unsafeBodies.entries()) {
      const invalidInput = takeoverInput(scope, `unsafe-${index}`, ["event-1"]);
      invalidInput.compaction_artifact.body = body as never;
      expect(() => opened.coordinator.commitTakeover(invalidInput))
        .toThrowError(code("INVALID_INPUT"));
    }
    const overflow = takeoverInput(scope, "overflow", ["event-1"]);
    overflow.ledger_base_revision = Number.MAX_SAFE_INTEGER + 1;
    expect(() => opened.coordinator.commitTakeover(overflow))
      .toThrowError(code("INVALID_INPUT"));
    expect(opened.substrate.getRevisionVector(scope)).toEqual(baseline);

    const valid = takeoverInput(scope, "raw-compatible", ["event-1"]);
    const committed = opened.coordinator.commitTakeover(valid);
    expect(opened.coordinator.readTakeover(scope, "raw-compatible")).toEqual(committed);
    closeStores(opened);
  });

  it("keeps after-range Raw hot and rejects missing or cross-scope coverage", () => {
    const database = databasePath();
    const opened = openStores(database);
    const scope = { namespace: "authority", stream_id: "after-range" };
    append(opened, scope, "event-1");
    append(opened, scope, "event-2");
    append(opened, scope, "event-3");
    const input = takeoverInput(scope, "partial-ledger", ["event-1", "event-2"]);
    input.ledger_base_revision = 3;
    const committed = opened.coordinator.commitTakeover(input);
    expect(committed.covered_raw_range).toEqual({ start: 1, end: 2 });
    expect(opened.hot.rebuild(scope).events.map((event) => event.event_id))
      .toEqual(["event-3"]);

    const missingScope = { namespace: "authority", stream_id: "missing-raw" };
    append(opened, missingScope, "missing-1");
    append(opened, missingScope, "missing-2");
    const tamper = new DatabaseSync(database);
    tamper.exec("DROP TRIGGER cc_ledger_raw_events_no_delete");
    tamper.prepare(
      `DELETE FROM cc_ledger_raw_events
       WHERE namespace = ? AND stream_id = ? AND ledger_revision = 2`
    ).run(missingScope.namespace, missingScope.stream_id);
    tamper.close();
    expect(() => opened.coordinator.commitTakeover(
      takeoverInput(missingScope, "missing", ["missing-1", "missing-2"])
    )).toThrowError(code("CONFLICT"));

    const localScope = { namespace: "authority", stream_id: "local" };
    const foreignScope = { namespace: "authority", stream_id: "foreign" };
    append(opened, localScope, "local-1");
    append(opened, foreignScope, "foreign-1");
    const crossScope = takeoverInput(localScope, "cross-scope", ["foreign-1"]);
    expect(() => opened.coordinator.commitTakeover(crossScope))
      .toThrowError(code("CONFLICT"));
    expect(opened.substrate.getRevisionVector(localScope)).toMatchObject({
      raw_frontier_revision: 0,
      frontier_position: 0,
      takeover_commit_revision: 0,
    });
    closeStores(opened);
  });

  it("keeps authority and shadow Takeover identities physically isolated", () => {
    const opened = openStores(databasePath());
    const authority = { namespace: "authority", stream_id: "scope-isolation" };
    const shadow = { namespace: "shadow:experiment", stream_id: "scope-isolation" };
    append(opened, authority, "event-1");
    append(opened, shadow, "event-1");
    const authorityCommit = opened.coordinator.commitTakeover(
      takeoverInput(authority, "same-takeover-id", ["event-1"])
    );
    expect(opened.coordinator.readCurrent(shadow)).toMatchObject({
      revision_vector: {
        ledger_revision: 1,
        frontier_position: 0,
        takeover_commit_revision: 0,
      },
    });
    expect(() => opened.coordinator.readTakeover(shadow, "same-takeover-id"))
      .toThrowError(code("NOT_FOUND"));
    const shadowCommit = opened.coordinator.commitTakeover(
      takeoverInput(shadow, "same-takeover-id", ["event-1"])
    );
    expect(authorityCommit.namespace).toBe("authority");
    expect(shadowCommit.namespace).toBe("shadow:experiment");
    expect(opened.coordinator.readTakeover(authority, "same-takeover-id"))
      .toEqual(authorityCommit);
    expect(opened.coordinator.readTakeover(shadow, "same-takeover-id"))
      .toEqual(shadowCommit);
    closeStores(opened);
  });

  it("fails exact reads when bound Raw or Artifact evidence disappears", () => {
    const database = databasePath();
    const opened = openStores(database);
    const rawScope = { namespace: "authority", stream_id: "bound-raw" };
    const artifactScope = { namespace: "authority", stream_id: "bound-artifact" };
    append(opened, rawScope, "raw-1");
    append(opened, artifactScope, "artifact-1");
    opened.coordinator.commitTakeover(takeoverInput(rawScope, "raw-takeover", ["raw-1"]));
    opened.coordinator.commitTakeover(
      takeoverInput(artifactScope, "artifact-takeover", ["artifact-1"])
    );

    const tamper = new DatabaseSync(database);
    tamper.exec("DROP TRIGGER cc_ledger_raw_events_no_delete");
    tamper.prepare(
      "DELETE FROM cc_ledger_raw_events WHERE namespace = ? AND stream_id = ?"
    ).run(rawScope.namespace, rawScope.stream_id);
    tamper.exec("DROP TRIGGER cc_compaction_artifacts_no_delete");
    tamper.prepare(
      "DELETE FROM cc_compaction_artifacts WHERE namespace = ? AND stream_id = ?"
    ).run(artifactScope.namespace, artifactScope.stream_id);
    tamper.close();

    expect(() => opened.coordinator.readTakeover(rawScope, "raw-takeover"))
      .toThrowError(code("CORRUPT_DATA"));
    expect(() => opened.coordinator.readTakeover(artifactScope, "artifact-takeover"))
      .toThrowError(code("CORRUPT_DATA"));
    closeStores(opened);
  });

  it("rolls back owner objects, Artifact, domain row, vector and marker together", () => {
    const database = databasePath();
    const opened = openStores(database);
    const scope = { namespace: "authority", stream_id: "rollback" };
    append(opened, scope, "event-1");
    const input = takeoverInput(scope, "rollback-takeover", ["event-1"]);
    input.fact_relation_apply = {
      scope,
      authority_commit_id: "rollback-knowledge",
      policy_hash: CANONICAL_FACT_RELATION_POLICY_HASH,
      fact_proposals: [{
        op: "CREATE",
        fact_id: "rolled-back-fact",
        statement: "Must not survive",
        epistemic_origin: "user_asserted",
        verification_status: "unverified",
        lifecycle_status: "active",
        record_status: "live",
        provenance_event_ids: ["event-1"],
        verification_event_ids: [],
        metadata: {},
      }],
      relation_proposals: [],
    };
    input.coverage[0] = {
      ledger_revision: 1,
      event_id: "event-1",
      disposition: "canonicalized",
      state_item_refs: [],
      fact_refs: [{ fact_id: "rolled-back-fact", fact_revision: 1 }],
      relation_refs: [],
    };
    refreshArtifactHash(input);
    const injection = new DatabaseSync(database);
    injection.exec(`CREATE TRIGGER fail_artifact BEFORE INSERT ON cc_compaction_artifacts
      BEGIN SELECT RAISE(ABORT, 'artifact fail'); END`);
    injection.close();
    expect(() => opened.coordinator.commitTakeover(input))
      .toThrowError(code("STORAGE_FAILURE"));
    expect(opened.substrate.getRevisionVector(scope)).toMatchObject({
      ledger_revision: 1,
      raw_frontier_revision: 0,
      frontier_position: 0,
      takeover_commit_revision: 0,
    });
    expect(opened.knowledge.readCurrent(scope).facts).toEqual([]);
    const audit = new DatabaseSync(database);
    expect(audit.prepare(
      "SELECT COUNT(*) AS count FROM cc_semantic_takeover_commits"
    ).get()).toEqual({ count: 0 });
    expect(audit.prepare(
      "SELECT COUNT(*) AS count FROM cc_compaction_artifacts"
    ).get()).toEqual({ count: 0 });
    expect(audit.prepare(
      "SELECT COUNT(*) AS count FROM cc_revision_commits WHERE commit_id = 'rollback-takeover'"
    ).get()).toEqual({ count: 0 });
    audit.close();
    closeStores(opened);
  });

  it("rolls back an Enrichment owner apply when its domain marker insert fails", () => {
    const database = databasePath();
    const opened = openStores(database);
    const scope = { namespace: "authority", stream_id: "enrichment-rollback" };
    append(opened, scope, "event-1");
    const baseline = opened.substrate.getRevisionVector(scope);
    const input: SemanticEnrichmentCommitInput = {
      scope,
      enrichment_commit_id: "enrichment-rollback",
      source_event_refs: [{ ledger_revision: 1, event_id: "event-1" }],
      state_authority_ref: null,
      existing_fact_refs: [],
      existing_relation_refs: [],
      fact_relation_apply: factApply(
        scope,
        "enrichment-owner-rollback",
        "enrichment-fact-rollback",
        ["event-1"]
      ),
      policy_hash: SEMANTIC_TAKEOVER_POLICY_HASH,
      provenance_event_ids: ["event-1"],
    };
    const injection = new DatabaseSync(database);
    injection.exec(`CREATE TRIGGER fail_enrichment BEFORE INSERT
      ON cc_semantic_enrichment_commits
      BEGIN SELECT RAISE(ABORT, 'enrichment fail'); END`);
    injection.close();
    expect(() => opened.coordinator.commitEnrichment(input))
      .toThrowError(code("STORAGE_FAILURE"));
    expect(opened.substrate.getRevisionVector(scope)).toEqual(baseline);
    expect(opened.knowledge.readCurrent(scope).facts).toEqual([]);
    const audit = new DatabaseSync(database);
    expect(audit.prepare(
      `SELECT COUNT(*) AS count FROM cc_canonical_fact_relation_commits
       WHERE authority_commit_id = 'enrichment-owner-rollback'`
    ).get()).toEqual({ count: 0 });
    expect(audit.prepare(
      "SELECT COUNT(*) AS count FROM cc_semantic_enrichment_commits"
    ).get()).toEqual({ count: 0 });
    audit.close();
    closeStores(opened);
  });
});

function databasePath(): string {
  const directory = mkdtempSync(join(tmpdir(), "context-compiler-04c-"));
  temporaryDirectories.push(directory);
  return join(directory, "context.db");
}

function openStores(database: string) {
  const substrate = new SqliteRevisionSubstrate(database);
  return {
    substrate,
    hot: new SqliteLedgerHotRawStore(database, substrate),
    state: new SqliteCanonicalStateStore(database, substrate),
    knowledge: new SqliteCanonicalFactRelationStore(database),
    coordinator: new SqliteAuthorityTransactionCoordinator(database, substrate),
  };
}

function closeStores(opened: ReturnType<typeof openStores>): void {
  opened.coordinator.close();
  opened.knowledge.close();
  opened.state.close();
  opened.hot.close();
  opened.substrate.close();
}

function append(
  opened: ReturnType<typeof openStores>,
  scope: { namespace: string; stream_id: string },
  eventId: string
): void {
  opened.hot.append({
    scope,
    event_id: eventId,
    source_kind: "user_input",
    source_id: `source-${eventId}`,
    payload: { content: eventId },
  });
}

function takeoverInput(
  scope: { namespace: string; stream_id: string },
  takeoverCommitId: string,
  eventIds: string[]
): SemanticTakeoverCommitInput {
  const input: SemanticTakeoverCommitInput = {
    scope,
    takeover_commit_id: takeoverCommitId,
    ledger_base_revision: eventIds.length,
    covered_raw_range: { start: 1, end: eventIds.length },
    expected_frontier_revision: 0,
    expected_frontier_position: 0,
    state_authority_ref: null,
    existing_fact_refs: [],
    existing_relation_refs: [],
    coverage: eventIds.map((eventId, index) => ({
      ledger_revision: index + 1,
      event_id: eventId,
      disposition: "artifact_only",
      state_item_refs: [],
      fact_refs: [],
      relation_refs: [],
      artifact_only_reason: "no_semantic_delta",
    })),
    compaction_artifact: {
      artifact_id: `artifact-${takeoverCommitId}`,
      expected_artifact_hash: "0".repeat(64),
      generator_version: "test-generator/v1",
      body: { summary: takeoverCommitId },
    },
    policy_hash: SEMANTIC_TAKEOVER_POLICY_HASH,
    provenance_event_ids: [...eventIds],
  };
  refreshArtifactHash(input);
  return input;
}

function factApply(
  scope: { namespace: string; stream_id: string },
  authorityCommitId: string,
  factId: string,
  eventIds: string[]
) {
  return {
    scope,
    authority_commit_id: authorityCommitId,
    policy_hash: CANONICAL_FACT_RELATION_POLICY_HASH,
    fact_proposals: [{
      op: "CREATE" as const,
      fact_id: factId,
      statement: "Fresh authority is required",
      epistemic_origin: "user_asserted" as const,
      verification_status: "unverified" as const,
      lifecycle_status: "active" as const,
      record_status: "live" as const,
      provenance_event_ids: [...eventIds],
      verification_event_ids: [],
      metadata: {},
    }],
    relation_proposals: [],
  };
}

function refreshArtifactHash(input: SemanticTakeoverCommitInput): void {
  input.compaction_artifact.expected_artifact_hash = createHash("sha256").update(
    canonicalJson({
      artifact_schema: "compaction-artifact/v1",
      namespace: input.scope.namespace,
      stream_id: input.scope.stream_id,
      covered_raw_range: input.covered_raw_range,
      generator_version: input.compaction_artifact.generator_version,
      policy_hash: input.policy_hash,
      provenance_event_ids: input.provenance_event_ids,
      body: input.compaction_artifact.body,
    }),
    "utf8"
  ).digest("hex");
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

function code(expected: string) {
  return expect.objectContaining<Partial<SemanticTakeoverError>>({ code: expected as never });
}
