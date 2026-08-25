import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { Worker } from "node:worker_threads";
import { afterEach, describe, expect, it } from "vitest";
import {
  CANONICAL_FACT_RELATION_POLICY_HASH,
  CANONICAL_FACT_RELATION_PROJECTION_RECEIPT_POLICY_HASH,
  CanonicalFactRelationError,
  SqliteCanonicalFactRelationStore,
  type CanonicalFactRelationCommitInput,
  type CreateCanonicalFactProposal,
  type CreateCanonicalRelationProposal,
} from "../src/canonical-fact-relation.js";
import {
  CANONICAL_STATE_POLICY_HASH,
  SqliteCanonicalStateStore,
} from "../src/canonical-state.js";
import { SqliteLedgerHotRawStore } from "../src/ledger-hot-raw.js";
import { SqliteRevisionSubstrate } from "../src/revision-substrate.js";

const root = join(import.meta.dirname, "..");
const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("WO-04B canonical Fact / Relation authority", () => {
  it("commits, exactly replays, reads and reopens without advancing any primary axis", () => {
    const database = databasePath();
    const opened = openStore(database);
    const scope = { namespace: "authority", stream_id: "knowledge" };
    expect(opened.knowledge.readCurrent(scope)).toEqual({
      ...scope,
      revision_vector: zeroVector(scope),
      policy_hash: CANONICAL_FACT_RELATION_POLICY_HASH,
      facts: [],
      relations: [],
    });
    appendEvent(opened, scope, "event-1");
    appendEvent(opened, scope, "event-2");
    const before = opened.substrate.getRevisionVector(scope);
    const input = commitInput(scope, "knowledge-1", [
      createFact("fact-1", "The build passed", "event-1"),
    ], [
      createRelation(
        "relation-1",
        { type: "RAW_EVENT", id: "event-2" },
        "SUPPORTS",
        { type: "FACT", id: "fact-1" },
        "event-2"
      ),
    ]);
    const committed = opened.knowledge.commit(input);
    expect(committed).toMatchObject({
      authority_commit_id: "knowledge-1",
      observed_revision_vector: before,
      facts: [{ fact_id: "fact-1", fact_revision: 1 }],
      relations: [{ relation_id: "relation-1", relation_revision: 1 }],
    });
    expect(opened.knowledge.commit(input)).toEqual(committed);
    expect(opened.knowledge.readCommit(scope, "knowledge-1")).toEqual(committed);
    expect(opened.knowledge.readFactRevision(scope, "fact-1", 1)).toEqual(
      committed.facts[0]
    );
    expect(opened.knowledge.readRelationRevision(scope, "relation-1", 1)).toEqual(
      committed.relations[0]
    );
    expect(opened.knowledge.readCurrent(scope)).toMatchObject({
      revision_vector: before,
      facts: [{ fact_id: "fact-1", fact_revision: 1 }],
      relations: [{ relation_id: "relation-1", relation_revision: 1 }],
    });
    expect(opened.substrate.getRevisionVector(scope)).toEqual(before);
    closeStore(opened);

    const reopened = openStore(database);
    expect(reopened.knowledge.readCommit(scope, "knowledge-1")).toEqual(committed);
    expect(reopened.substrate.getRevisionVector(scope)).toEqual(before);
    closeStore(reopened);
  });

  it("enforces orthogonal Fact axes and requires typed reason Relations", () => {
    const opened = openStore(databasePath());
    const scope = { namespace: "authority", stream_id: "fact-policy" };
    for (const id of ["event-1", "event-2", "event-3", "event-4"]) {
      appendEvent(opened, scope, id);
    }
    const missingReason = createFact("fact-contested", "Claim", "event-1");
    missingReason.verification_status = "contested";
    expect(() => opened.knowledge.commit(
      commitInput(scope, "missing-reason", [missingReason], [])
    )).toThrowError(code("CONFLICT"));

    const contested = opened.knowledge.commit(commitInput(scope, "contested", [
      missingReason,
    ], [
      createRelation(
        "contradiction",
        { type: "RAW_EVENT", id: "event-2" },
        "CONTRADICTS",
        { type: "FACT", id: "fact-contested" },
        "event-2"
      ),
    ]));
    expect(contested.facts[0]).toMatchObject({
      epistemic_origin: "user_asserted",
      verification_status: "contested",
      lifecycle_status: "active",
      record_status: "live",
    });

    const verified = createFact("fact-verified", "Verified claim", "event-3");
    verified.verification_status = "verified";
    verified.verification_event_ids = ["event-3"];
    opened.knowledge.commit(commitInput(scope, "verified", [verified], [
      createRelation(
        "verified-dispute",
        { type: "RAW_EVENT", id: "event-4" },
        "CONTRADICTS",
        { type: "FACT", id: "fact-verified" },
        "event-4"
      ),
    ]));
    expect(opened.knowledge.readCurrent(scope).facts.find(
      (fact) => fact.fact_id === "fact-verified"
    )?.verification_status).toBe("verified");

    expect(() => opened.knowledge.commit(commitInput(scope, "orphan", [], [{
      op: "REVISE",
      relation_id: "contradiction",
      expected_relation_revision: 1,
      status: "retracted",
      provenance_event_ids: ["event-2"],
    }]))).toThrowError(code("CONFLICT"));
    expect(opened.knowledge.readRelationRevision(scope, "contradiction", 1).status)
      .toBe("active");
    closeStore(opened);
  });

  it("preserves immutable Fact identity while allowing monotonic evidence and legal axes", () => {
    const opened = openStore(databasePath());
    const scope = { namespace: "authority", stream_id: "fact-revisions" };
    appendEvent(opened, scope, "event-1");
    appendEvent(opened, scope, "event-2");
    opened.knowledge.commit(commitInput(scope, "create", [
      createFact("fact-1", "Immutable statement", "event-1"),
    ], []));
    const revised = opened.knowledge.commit(commitInput(scope, "revise", [{
      op: "REVISE",
      fact_id: "fact-1",
      expected_fact_revision: 1,
      verification_status: "corroborated",
      lifecycle_status: "active",
      record_status: "archived",
      provenance_event_ids: ["event-1", "event-2"],
      verification_event_ids: ["event-2"],
    }], []));
    expect(revised.facts[0]).toMatchObject({
      fact_revision: 2,
      statement: "Immutable statement",
      epistemic_origin: "user_asserted",
      verification_status: "corroborated",
      lifecycle_status: "active",
      record_status: "archived",
      provenance_event_ids: ["event-1", "event-2"],
    });
    expect(() => opened.knowledge.commit(commitInput(scope, "regress", [{
      op: "REVISE",
      fact_id: "fact-1",
      expected_fact_revision: 2,
      verification_status: "verified",
      lifecycle_status: "active",
      record_status: "live",
      provenance_event_ids: ["event-2"],
      verification_event_ids: ["event-2"],
    }], []))).toThrowError(code("CONFLICT"));
    expect(opened.knowledge.readCurrent(scope).facts[0]?.fact_revision).toBe(2);
    closeStore(opened);
  });

  it("validates endpoint authority, active-edge uniqueness and bounded acyclic graphs", () => {
    const opened = openStore(databasePath());
    const scope = { namespace: "authority", stream_id: "relations" };
    appendEvent(opened, scope, "event-1");
    appendEvent(opened, scope, "event-2");
    opened.state.commit({
      scope,
      state_commit_id: "state-1",
      commit_mode: "immediate_authority",
      expected_state_revision: 0,
      proposal: {
        schema_version: 1,
        upsert_items: [{
          item_id: "state-item",
          kind: "GOAL",
          content: "State endpoint",
          status: "ACTIVE",
          source_event_ids: ["event-1"],
          metadata: {},
        }],
      },
      policy_hash: CANONICAL_STATE_POLICY_HASH,
      provenance_event_ids: ["event-1"],
    });
    appendEvent(opened, scope, "event-3");
    opened.state.commit({
      scope,
      state_commit_id: "state-2",
      commit_mode: "immediate_authority",
      expected_state_revision: 1,
      proposal: {
        schema_version: 1,
        upsert_items: [{
          item_id: "state-item-2",
          kind: "GOAL",
          content: "Later State endpoint",
          status: "ACTIVE",
          source_event_ids: ["event-3"],
          metadata: {},
        }],
      },
      policy_hash: CANONICAL_STATE_POLICY_HASH,
      provenance_event_ids: ["event-3"],
    });
    opened.knowledge.commit(commitInput(scope, "base", [
      createFact("fact-a", "A", "event-1"),
      createFact("fact-b", "B", "event-2"),
    ], [
      createRelation(
        "depends-a-b",
        { type: "FACT", id: "fact-a" },
        "DEPENDS_ON",
        { type: "FACT", id: "fact-b" },
        "event-1"
      ),
      createRelation(
        "depends-state-a",
        { type: "STATE_ITEM", id: "state-item" },
        "DEPENDS_ON",
        { type: "FACT", id: "fact-a" },
        "event-1"
      ),
    ]));
    expect(() => opened.knowledge.commit(commitInput(scope, "duplicate", [], [
      createRelation(
        "duplicate-edge",
        { type: "FACT", id: "fact-a" },
        "DEPENDS_ON",
        { type: "FACT", id: "fact-b" },
        "event-2"
      ),
    ]))).toThrowError(code("CONFLICT"));
    expect(() => opened.knowledge.commit(commitInput(scope, "cycle", [], [
      createRelation(
        "depends-b-a",
        { type: "FACT", id: "fact-b" },
        "DEPENDS_ON",
        { type: "FACT", id: "fact-a" },
        "event-2"
      ),
    ]))).toThrowError(code("CONFLICT"));
    expect(() => opened.knowledge.commit(commitInput(scope, "missing-endpoint", [], [
      createRelation(
        "missing",
        { type: "FACT", id: "fact-a" },
        "SUPPORTS",
        { type: "FACT", id: "missing" },
        "event-1"
      ),
    ]))).toThrowError(code("CONFLICT"));
    expect(opened.knowledge.readCurrent(scope).relations).toHaveLength(2);
    closeStore(opened);
  });

  it("rejects State Item authority when WO-04A rejects the coordinated State row", () => {
    const database = databasePath();
    const scope = { namespace: "authority", stream_id: "state-authority-binding" };
    const opened = openStore(database);
    appendEvent(opened, scope, "event-1");
    opened.state.commit({
      scope,
      state_commit_id: "state-1",
      commit_mode: "immediate_authority",
      expected_state_revision: 0,
      proposal: {
        schema_version: 1,
        upsert_items: [{
          item_id: "real-state-item",
          kind: "GOAL",
          content: "Real State endpoint",
          status: "ACTIVE",
          source_event_ids: ["event-1"],
          metadata: wideCanonicalStateMetadata(),
        }],
      },
      policy_hash: CANONICAL_STATE_POLICY_HASH,
      provenance_event_ids: ["event-1"],
    });
    const legitimateInput = commitInput(scope, "legitimate", [
      createFact("fact-real", "Legitimate State relation", "event-1"),
    ], [
      createRelation(
        "relation-real",
        { type: "STATE_ITEM", id: "real-state-item" },
        "DEPENDS_ON",
        { type: "FACT", id: "fact-real" },
        "event-1"
      ),
    ]);
    opened.knowledge.commit(legitimateInput);
    const beforeTamper = opened.substrate.getRevisionVector(scope);
    closeStore(opened);

    const audit = new DatabaseSync(database);
    const stateTrigger = dropTrigger(audit, "cc_canonical_state_revisions_no_update");
    const row = audit.prepare(
      `SELECT state_json FROM cc_canonical_state_revisions
       WHERE namespace = ? AND stream_id = ? AND state_revision = 1`
    ).get(scope.namespace, scope.stream_id) as { state_json: string };
    const state = JSON.parse(row.state_json) as {
      schema_version: 1;
      items: Array<Record<string, unknown>>;
    };
    state.items.push({
      item_id: "zz-forged-state-item",
      kind: "GOAL",
      content: "Forged State endpoint",
      status: "ACTIVE",
      source_event_ids: ["event-1"],
      metadata: {},
    });
    const stateJson = canonicalJson(state);
    audit.prepare(
      `UPDATE cc_canonical_state_revisions SET state_json = ?, state_hash = ?
       WHERE namespace = ? AND stream_id = ? AND state_revision = 1`
    ).run(stateJson, sha256(stateJson), scope.namespace, scope.stream_id);
    audit.exec(`${stateTrigger};`);
    audit.close();

    const challenged = openStore(database);
    expect(() => challenged.state.readLatest(scope)).toThrowError(code("CORRUPT_DATA"));
    expect(() => challenged.knowledge.readCurrent(scope))
      .toThrowError(code("CORRUPT_DATA"));
    expect(() => challenged.knowledge.readFactRevision(scope, "fact-real", 1))
      .toThrowError(code("CORRUPT_DATA"));
    expect(() => challenged.knowledge.readRelationRevision(scope, "relation-real", 1))
      .toThrowError(code("CORRUPT_DATA"));
    expect(() => challenged.knowledge.readCommit(scope, "legitimate"))
      .toThrowError(code("CORRUPT_DATA"));
    expect(() => challenged.knowledge.commit(legitimateInput))
      .toThrowError(code("CORRUPT_DATA"));
    const inconsistentAuthorityInput = commitInput(scope, "inconsistent-authority", [
      createFact("fact-forged", "Must not persist", "event-1"),
    ], [
      createRelation(
        "relation-forged",
        { type: "STATE_ITEM", id: "zz-forged-state-item" },
        "DEPENDS_ON",
        { type: "FACT", id: "fact-forged" },
        "event-1"
      ),
    ]);
    expect(() => challenged.knowledge.commit(inconsistentAuthorityInput))
      .toThrowError(code("CORRUPT_DATA"));
    expect(challenged.substrate.getRevisionVector(scope)).toEqual(beforeTamper);

    const laterState = challenged.state.commit({
      scope,
      state_commit_id: "state-2",
      commit_mode: "immediate_authority",
      expected_state_revision: 1,
      proposal: {
        schema_version: 1,
        upsert_items: [{
          item_id: "later-legitimate-item",
          kind: "GOAL",
          content: "A later legitimate item",
          status: "ACTIVE",
          source_event_ids: ["event-1"],
          metadata: {},
        }],
      },
      policy_hash: CANONICAL_STATE_POLICY_HASH,
      provenance_event_ids: ["event-1"],
    });
    expect(laterState.state.items.some(
      (item) => item.item_id === "zz-forged-state-item"
    )).toBe(true);
    expect(challenged.state.readLatest(scope).state.items.some(
      (item) => item.item_id === "zz-forged-state-item"
    )).toBe(true);
    const afterStateAdvance = challenged.substrate.getRevisionVector(scope);
    expect(afterStateAdvance.state_revision).toBe(2);
    expect(() => challenged.knowledge.readCurrent(scope))
      .toThrowError(code("CORRUPT_DATA"));
    expect(() => challenged.knowledge.commit(inconsistentAuthorityInput))
      .toThrowError(code("CORRUPT_DATA"));
    expect(challenged.substrate.getRevisionVector(scope)).toEqual(afterStateAdvance);

    const after = new DatabaseSync(database);
    expect(after.prepare(
      "SELECT COUNT(*) AS count FROM cc_canonical_fact_relation_commits"
    ).get()).toEqual({ count: 1 });
    expect(after.prepare(
      "SELECT COUNT(*) AS count FROM cc_canonical_fact_revisions"
    ).get()).toEqual({ count: 1 });
    expect(after.prepare(
      "SELECT COUNT(*) AS count FROM cc_canonical_relation_revisions"
    ).get()).toEqual({ count: 1 });
    after.close();
    closeStore(challenged);

    const reopened = openStore(database);
    expect(() => reopened.knowledge.readCurrent(scope))
      .toThrowError(code("CORRUPT_DATA"));
    closeStore(reopened);
  });

  it("classifies exact identity substitution before new-identity policy rejection", () => {
    const database = databasePath();
    const opened = openStore(database);
    const scope = { namespace: "authority", stream_id: "identity" };
    appendEvent(opened, scope, "event-1");
    const input = commitInput(scope, "commit-1", [
      createFact("fact-1", "Identity", "event-1"),
    ], []);
    opened.knowledge.commit(input);
    const vector = opened.substrate.getRevisionVector(scope);
    expect(() => opened.knowledge.commit({ ...input, policy_hash: "0".repeat(64) }))
      .toThrowError(code("CONFLICT"));
    expect(() => opened.knowledge.commit({
      ...input,
      authority_commit_id: "new-identity",
      policy_hash: "0".repeat(64),
    })).toThrowError(code("INVALID_INPUT"));
    expect(opened.substrate.getRevisionVector(scope)).toEqual(vector);
    const audit = new DatabaseSync(database);
    expect(audit.prepare(
      "SELECT COUNT(*) AS count FROM cc_canonical_fact_relation_commits"
    ).get()).toEqual({ count: 1 });
    expect(audit.prepare(
      "SELECT COUNT(*) AS count FROM cc_canonical_fact_revisions"
    ).get()).toEqual({ count: 1 });
    audit.close();
    closeStore(opened);
  });

  it("enforces origin-specific confidence without conflating it with verification", () => {
    const opened = openStore(databasePath());
    const scope = { namespace: "authority", stream_id: "confidence" };
    appendEvent(opened, scope, "event-1");
    opened.knowledge.commit(commitInput(scope, "fact", [
      createFact("fact", "Confidence target", "event-1"),
    ], []));
    const inferred = createRelation(
      "inferred",
      { type: "RAW_EVENT", id: "event-1" },
      "SUPPORTS",
      { type: "FACT", id: "fact" },
      "event-1"
    );
    inferred.origin = "model_inferred";
    expect(() => opened.knowledge.commit(commitInput(scope, "missing-confidence", [], [
      inferred,
    ]))).toThrowError(code("INVALID_INPUT"));
    const observed = createRelation(
      "observed",
      { type: "RAW_EVENT", id: "event-1" },
      "SUPPORTS",
      { type: "FACT", id: "fact" },
      "event-1"
    );
    observed.confidence = 0.5;
    expect(() => opened.knowledge.commit(commitInput(scope, "forbidden-confidence", [], [
      observed,
    ]))).toThrowError(code("INVALID_INPUT"));
    inferred.confidence = 0.75;
    expect(opened.knowledge.commit(commitInput(scope, "valid-confidence", [], [
      inferred,
    ])).relations[0]).toMatchObject({
      origin: "model_inferred",
      confidence: 0.75,
      status: "active",
    });
    expect(opened.knowledge.readCurrent(scope).facts[0]?.verification_status).toBe("unverified");
    closeStore(opened);
  });

  it("rejects cross-scope/missing provenance and strict malformed input before mutation", () => {
    const database = databasePath();
    const opened = openStore(database);
    const scope = { namespace: "authority", stream_id: "validation" };
    const other = { namespace: "authority", stream_id: "other" };
    appendEvent(opened, other, "other-event");
    expect(() => opened.knowledge.commit(commitInput(scope, "cross", [
      createFact("fact", "Cross", "other-event"),
    ], []))).toThrowError(code("CONFLICT"));
    appendEvent(opened, scope, "event-a");
    appendEvent(opened, scope, "event-b");
    const unsorted = createFact("fact", "Unsorted", "event-a");
    unsorted.provenance_event_ids = ["event-b", "event-a"];
    expect(() => opened.knowledge.commit(commitInput(scope, "unsorted", [unsorted], [])))
      .toThrowError(code("INVALID_INPUT"));
    const cc = createFact("bad\u0085id", "Cc", "event-a");
    expect(() => opened.knowledge.commit(commitInput(scope, "cc", [cc], [])))
      .toThrowError(code("INVALID_INPUT"));
    const nonNfc = createFact("fact-nfc", "e\u0301", "event-a");
    expect(() => opened.knowledge.commit(commitInput(scope, "nfc", [nonNfc], [])))
      .toThrowError(code("INVALID_INPUT"));
    let getterCalls = 0;
    const accessor = createFact("fact-accessor", "Accessor", "event-a");
    Object.defineProperty(accessor, "metadata", {
      enumerable: true,
      get() { getterCalls += 1; return {}; },
    });
    expect(() => opened.knowledge.commit(commitInput(scope, "accessor", [accessor], [])))
      .toThrowError(code("INVALID_INPUT"));
    expect(getterCalls).toBe(0);
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    const cycle = createFact("fact-cycle", "Cycle", "event-a");
    cycle.metadata = cyclic as never;
    expect(() => opened.knowledge.commit(commitInput(scope, "metadata-cycle", [cycle], [])))
      .toThrowError(code("INVALID_INPUT"));
    const audit = new DatabaseSync(database);
    expect(audit.prepare(
      "SELECT COUNT(*) AS count FROM cc_canonical_fact_relation_commits"
    ).get()).toEqual({ count: 0 });
    audit.close();
    closeStore(opened);
  });

  it("rolls back marker and object rows for writer and deferred-COMMIT failures", () => {
    const database = databasePath();
    const opened = openStore(database);
    const scope = { namespace: "authority", stream_id: "rollback" };
    appendEvent(opened, scope, "event-1");
    const cases = [
      `CREATE TRIGGER qa_fail BEFORE INSERT ON cc_canonical_fact_revisions
       BEGIN SELECT RAISE(ABORT, 'fact fail'); END`,
      `CREATE TABLE qa_parent (id INTEGER PRIMARY KEY);
       CREATE TABLE qa_child (
         id INTEGER PRIMARY KEY,
         parent_id INTEGER,
         FOREIGN KEY (parent_id) REFERENCES qa_parent(id)
           DEFERRABLE INITIALLY DEFERRED
       );
       CREATE TRIGGER qa_fail AFTER INSERT ON cc_canonical_fact_relation_commits
       BEGIN INSERT INTO qa_child (id, parent_id) VALUES (1, 999); END`,
    ];
    for (const [index, ddl] of cases.entries()) {
      const audit = new DatabaseSync(database);
      audit.exec("PRAGMA foreign_keys = ON;");
      audit.exec(ddl);
      audit.close();
      expect(() => opened.knowledge.commit(commitInput(scope, `failed-${index}`, [
        createFact(`fact-${index}`, "Failure", "event-1"),
      ], []))).toThrowError(code("STORAGE_FAILURE"));
      const after = new DatabaseSync(database);
      expect(after.prepare(
        "SELECT COUNT(*) AS count FROM cc_canonical_fact_relation_commits"
      ).get()).toEqual({ count: 0 });
      expect(after.prepare(
        "SELECT COUNT(*) AS count FROM cc_canonical_fact_revisions"
      ).get()).toEqual({ count: 0 });
      after.exec("DROP TRIGGER qa_fail;");
      after.exec("DROP TABLE IF EXISTS qa_child;");
      after.exec("DROP TABLE IF EXISTS qa_parent;");
      after.close();
    }
    expect(opened.knowledge.commit(commitInput(scope, "success", [
      createFact("success", "Success", "event-1"),
    ], [])).facts[0]?.fact_revision).toBe(1);
    closeStore(opened);
  });

  it("rejects coordinated row/result, request and observed-vector substitutions", () => {
    for (const attack of ["row-result", "request", "vector"] as const) {
      const database = databasePath();
      const opened = openStore(database);
      const scope = { namespace: "authority", stream_id: `attack-${attack}` };
      appendEvent(opened, scope, "event-1");
      const input = commitInput(scope, "commit", [
        createFact("fact", "Original", "event-1"),
      ], []);
      opened.knowledge.commit(input);
      closeStore(opened);

      const audit = new DatabaseSync(database);
      const factTrigger = dropTrigger(audit, "cc_canonical_fact_revisions_no_update");
      const commitTrigger = dropTrigger(
        audit,
        "cc_canonical_fact_relation_commits_no_update"
      );
      const marker = audit.prepare(
        `SELECT request_json, observed_revision_vector_json, result_json
         FROM cc_canonical_fact_relation_commits
         WHERE namespace = ? AND stream_id = ? AND authority_commit_id = 'commit'`
      ).get(scope.namespace, scope.stream_id) as {
        request_json: string;
        observed_revision_vector_json: string;
        result_json: string;
      };
      const result = JSON.parse(marker.result_json) as Record<string, unknown>;
      const facts = result.facts as Array<Record<string, unknown>>;
      const fact = facts[0] as Record<string, unknown>;
      if (attack === "row-result") {
        fact.statement = "Tampered";
        const payload = { ...fact };
        delete payload.fact_hash;
        fact.fact_hash = sha256(canonicalJson(payload));
        audit.prepare(
          `UPDATE cc_canonical_fact_revisions
           SET statement = ?, fact_hash = ?
           WHERE namespace = ? AND stream_id = ? AND fact_id = 'fact'`
        ).run("Tampered", fact.fact_hash, scope.namespace, scope.stream_id);
        audit.prepare(
          `UPDATE cc_canonical_fact_relation_commits SET result_json = ?
           WHERE namespace = ? AND stream_id = ? AND authority_commit_id = 'commit'`
        ).run(canonicalJson(result), scope.namespace, scope.stream_id);
      } else if (attack === "request") {
        const request = JSON.parse(marker.request_json) as Record<string, unknown>;
        const proposals = request.fact_proposals as Array<Record<string, unknown>>;
        (proposals[0] as Record<string, unknown>).statement = "Tampered request";
        const requestJson = canonicalJson(request);
        audit.prepare(
          `UPDATE cc_canonical_fact_relation_commits
           SET request_json = ?, request_fingerprint = ?
           WHERE namespace = ? AND stream_id = ? AND authority_commit_id = 'commit'`
        ).run(requestJson, sha256(requestJson), scope.namespace, scope.stream_id);
      } else {
        const observed = JSON.parse(marker.observed_revision_vector_json) as Record<string, unknown>;
        observed.ledger_revision = 0;
        const observedJson = canonicalJson(observed);
        result.observed_revision_vector = observed;
        fact.observed_revision_vector = observed;
        const payload = { ...fact };
        delete payload.fact_hash;
        fact.fact_hash = sha256(canonicalJson(payload));
        audit.prepare(
          `UPDATE cc_canonical_fact_revisions
           SET observed_revision_vector_json = ?, fact_hash = ?
           WHERE namespace = ? AND stream_id = ? AND fact_id = 'fact'`
        ).run(observedJson, fact.fact_hash, scope.namespace, scope.stream_id);
        audit.prepare(
          `UPDATE cc_canonical_fact_relation_commits
           SET observed_revision_vector_json = ?, result_json = ?
           WHERE namespace = ? AND stream_id = ? AND authority_commit_id = 'commit'`
        ).run(observedJson, canonicalJson(result), scope.namespace, scope.stream_id);
      }
      audit.exec(`${factTrigger};`);
      audit.exec(`${commitTrigger};`);
      audit.close();

      const challenged = openStore(database);
      expect(() => challenged.knowledge.readCurrent(scope))
        .toThrowError(code("CORRUPT_DATA"));
      expect(() => challenged.knowledge.readFactRevision(scope, "fact", 1))
        .toThrowError(code("CORRUPT_DATA"));
      expect(() => challenged.knowledge.commit(input))
        .toThrowError(code("CORRUPT_DATA"));
      closeStore(challenged);
    }
  });

  it("fails closed on row tampering and incompatible partial/forged schema", () => {
    const database = databasePath();
    const opened = openStore(database);
    const scope = { namespace: "authority", stream_id: "tamper" };
    appendEvent(opened, scope, "event-1");
    opened.knowledge.commit(commitInput(scope, "commit", [
      createFact("fact", "Original", "event-1"),
    ], []));
    closeStore(opened);
    const audit = new DatabaseSync(database);
    const trigger = audit.prepare(
      `SELECT sql FROM sqlite_master
       WHERE type = 'trigger' AND name = 'cc_canonical_fact_revisions_no_update'`
    ).get() as { sql: string };
    audit.exec("DROP TRIGGER cc_canonical_fact_revisions_no_update;");
    audit.prepare(
      "UPDATE cc_canonical_fact_revisions SET statement = ? WHERE fact_id = ?"
    ).run("Tampered", "fact");
    audit.exec(`${trigger.sql};`);
    audit.close();
    const reopened = openStore(database);
    expect(() => reopened.knowledge.readCurrent(scope)).toThrowError(code("CORRUPT_DATA"));
    expect(() => reopened.knowledge.readFactRevision(scope, "fact", 1))
      .toThrowError(code("CORRUPT_DATA"));
    closeStore(reopened);

    const partial = databasePath();
    const partialDb = new DatabaseSync(partial);
    partialDb.exec("CREATE TABLE cc_canonical_fact_revisions (id TEXT);");
    partialDb.close();
    expect(() => new SqliteCanonicalFactRelationStore(partial))
      .toThrowError(code("STORAGE_FAILURE"));

    const forged = databasePath();
    const forgedDb = new DatabaseSync(forged);
    forgedDb.exec(
      "CREATE TABLE cc_canonical_fact_relation_schema (version INTEGER PRIMARY KEY);"
    );
    forgedDb.prepare(
      "INSERT INTO cc_canonical_fact_relation_schema (version) VALUES (1)"
    ).run();
    forgedDb.close();
    expect(() => new SqliteCanonicalFactRelationStore(forged))
      .toThrowError(code("STORAGE_FAILURE"));

    const partialReceipt = databasePath();
    const partialReceiptDb = new DatabaseSync(partialReceipt);
    partialReceiptDb.exec(
      "CREATE TABLE cc_canonical_fact_relation_projection_receipts (id TEXT);"
    );
    partialReceiptDb.close();
    expect(() => new SqliteCanonicalFactRelationStore(partialReceipt))
      .toThrowError(code("STORAGE_FAILURE"));

    const receiptTriggerTamper = databasePath();
    const receiptOpened = openStore(receiptTriggerTamper);
    closeStore(receiptOpened);
    const receiptAudit = new DatabaseSync(receiptTriggerTamper);
    receiptAudit.exec(
      "DROP TRIGGER cc_canonical_fact_relation_projection_receipts_no_update;"
    );
    receiptAudit.close();
    expect(() => new SqliteCanonicalFactRelationStore(receiptTriggerTamper))
      .toThrowError(code("STORAGE_FAILURE"));
  });

  it("serializes concurrent same-object creates and exact retries", async () => {
    const database = databasePath();
    const opened = openStore(database);
    const scope = { namespace: "authority", stream_id: "concurrent" };
    appendEvent(opened, scope, "event-1");
    closeStore(opened);
    const distinct = await concurrentCommits(database, ["commit-a", "commit-b"]);
    expect(distinct.filter((result) => result.ok)).toHaveLength(1);
    expect(distinct.filter((result) => result.code === "CONFLICT")).toHaveLength(1);
    const audit = new DatabaseSync(database);
    expect(audit.prepare(
      "SELECT COUNT(*) AS count FROM cc_canonical_fact_revisions WHERE fact_id = 'fact'"
    ).get()).toEqual({ count: 1 });
    audit.close();

    const retryDatabase = databasePath();
    const retryOpened = openStore(retryDatabase);
    appendEvent(retryOpened, scope, "event-1");
    closeStore(retryOpened);
    const retries = await concurrentCommits(retryDatabase, ["same", "same"]);
    expect(retries.every((result) => result.ok && result.revision === 1)).toBe(true);
    const retryAudit = new DatabaseSync(retryDatabase);
    expect(retryAudit.prepare(
      "SELECT COUNT(*) AS count FROM cc_canonical_fact_revisions WHERE fact_id = 'fact'"
    ).get()).toEqual({ count: 1 });
    retryAudit.close();
  });

  it("initializes fresh and unrelated legacy databases concurrently", async () => {
    for (const legacy of [false, true]) {
      const database = databasePath();
      if (legacy) {
        const seed = new DatabaseSync(database);
        seed.exec("CREATE TABLE sessions (session_id TEXT PRIMARY KEY);");
        seed.close();
      }
      const results = await concurrentOpen(database);
      expect(results).toEqual([{ ok: true }, { ok: true }]);
      const audit = new DatabaseSync(database);
      expect(audit.prepare(
        "SELECT version FROM cc_canonical_fact_relation_schema"
      ).get()).toEqual({ version: 1 });
      expect(audit.prepare(
        "SELECT version FROM cc_canonical_fact_relation_projection_receipt_schema"
      ).get()).toEqual({ version: 1 });
      expect(CANONICAL_FACT_RELATION_PROJECTION_RECEIPT_POLICY_HASH).toBe(
        "610102fa139bcfb34c1a0bea0ff177ac3f1d7238bf2949a9f27ab4b13ae5b93b"
      );
      expect(audit.prepare(
        `SELECT COUNT(*) AS count FROM sqlite_master
         WHERE name LIKE 'cc_canonical_fact_relation%'
            OR name LIKE 'cc_canonical_fact_revisions%'
            OR name LIKE 'cc_canonical_relation_revisions%'`
      ).get()).toEqual({ count: 18 });
      if (legacy) {
        expect(audit.prepare(
          "SELECT COUNT(*) AS count FROM sessions"
        ).get()).toEqual({ count: 0 });
      }
      audit.close();
    }
  });
});

interface OpenedStore {
  database: string;
  substrate: SqliteRevisionSubstrate;
  hot: SqliteLedgerHotRawStore;
  state: SqliteCanonicalStateStore;
  knowledge: SqliteCanonicalFactRelationStore;
}

function databasePath(): string {
  const directory = mkdtempSync(join(tmpdir(), "cc-wo04b-"));
  temporaryDirectories.push(directory);
  return join(directory, "context.sqlite");
}

function openStore(database: string): OpenedStore {
  const substrate = new SqliteRevisionSubstrate(database);
  const hot = new SqliteLedgerHotRawStore(database, substrate);
  const state = new SqliteCanonicalStateStore(database, substrate);
  const knowledge = new SqliteCanonicalFactRelationStore(database);
  return { database, substrate, hot, state, knowledge };
}

function closeStore(opened: OpenedStore): void {
  opened.knowledge.close();
  opened.state.close();
  opened.hot.close();
  opened.substrate.close();
}

function appendEvent(opened: OpenedStore, scope: RevisionScope, eventId: string): void {
  opened.hot.append({
    scope,
    event_id: eventId,
    source_kind: "external_observation",
    source_id: `source-${eventId}`,
    payload: { event_id: eventId },
  });
}

function createFact(
  factId: string,
  statement: string,
  eventId: string
): CreateCanonicalFactProposal {
  return {
    op: "CREATE",
    fact_id: factId,
    statement,
    epistemic_origin: "user_asserted",
    verification_status: "unverified",
    lifecycle_status: "active",
    record_status: "live",
    provenance_event_ids: [eventId],
    verification_event_ids: [],
    metadata: {},
  };
}

function createRelation(
  relationId: string,
  source: CreateCanonicalRelationProposal["source"],
  relationType: CreateCanonicalRelationProposal["relation_type"],
  target: CreateCanonicalRelationProposal["target"],
  eventId: string
): CreateCanonicalRelationProposal {
  return {
    op: "CREATE",
    relation_id: relationId,
    source,
    relation_type: relationType,
    target,
    origin: "tool_observed",
    provenance_event_ids: [eventId],
    status: "active",
    metadata: {},
  };
}

function commitInput(
  scope: RevisionScope,
  commitId: string,
  facts: CanonicalFactRelationCommitInput["fact_proposals"],
  relations: CanonicalFactRelationCommitInput["relation_proposals"]
): CanonicalFactRelationCommitInput {
  return {
    scope,
    authority_commit_id: commitId,
    policy_hash: CANONICAL_FACT_RELATION_POLICY_HASH,
    fact_proposals: facts,
    relation_proposals: relations,
  };
}

function zeroVector(scope: RevisionScope) {
  return {
    ...scope,
    ledger_revision: 0,
    state_revision: 0,
    raw_frontier_revision: 0,
    frontier_position: 0,
    takeover_commit_revision: 0,
  };
}

function wideCanonicalStateMetadata(): Record<string, number> {
  return Object.fromEntries(
    Array.from({ length: 101 }, (_, index) => [`state-key-${index}`, index])
  );
}

function code(expected: string) {
  return expect.objectContaining<Partial<CanonicalFactRelationError>>({ code: expected as never });
}

function dropTrigger(database: DatabaseSync, name: string): string {
  const row = database.prepare(
    "SELECT sql FROM sqlite_master WHERE type = 'trigger' AND name = ?"
  ).get(name) as { sql: string } | undefined;
  if (row === undefined) throw new Error(`Missing trigger ${name}`);
  database.exec(`DROP TRIGGER ${name};`);
  return row.sql;
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort().map((key) =>
    `${JSON.stringify(key)}:${canonicalJson(object[key])}`
  ).join(",")}}`;
}

interface RevisionScope {
  namespace: string;
  stream_id: string;
}

interface WorkerResult {
  ok: boolean;
  revision?: number;
  code?: string;
}

function concurrentCommits(database: string, commitIds: string[]): Promise<WorkerResult[]> {
  const barrier = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT);
  const script = `
    const { parentPort, workerData } = require("node:worker_threads");
    const { join } = require("node:path");
    const { pathToFileURL } = require("node:url");
    (async () => {
      const knowledgeModule = await import(pathToFileURL(join(
        workerData.root, "dist", "canonical-fact-relation.js"
      )).href);
      const store = new knowledgeModule.SqliteCanonicalFactRelationStore(workerData.database);
      const scope = { namespace: "authority", stream_id: "concurrent" };
      const view = new Int32Array(workerData.barrier);
      Atomics.add(view, 0, 1); Atomics.notify(view, 0);
      while (Atomics.load(view, 0) < 2) Atomics.wait(view, 0, 1);
      try {
        const result = store.commit({
          scope,
          authority_commit_id: workerData.commitId,
          policy_hash: knowledgeModule.CANONICAL_FACT_RELATION_POLICY_HASH,
          fact_proposals: [{
            op: "CREATE", fact_id: "fact", statement: "Concurrent",
            epistemic_origin: "user_asserted", verification_status: "unverified",
            lifecycle_status: "active", record_status: "live",
            provenance_event_ids: ["event-1"], verification_event_ids: [], metadata: {}
          }],
          relation_proposals: []
        });
        parentPort.postMessage({ ok: true, revision: result.facts[0].fact_revision });
      } catch (error) {
        parentPort.postMessage({ ok: false, code: error && error.code });
      } finally { store.close(); }
    })().catch((error) => parentPort.postMessage({ ok: false, code: String(error) }));
  `;
  return Promise.all(commitIds.map((commitId) => new Promise<WorkerResult>((resolve, reject) => {
    const worker = new Worker(script, {
      eval: true,
      workerData: { root, database, barrier, commitId },
    });
    let result: WorkerResult | undefined;
    worker.once("message", (message: WorkerResult) => { result = message; });
    worker.once("error", reject);
    worker.once("exit", (exitCode) => {
      if (exitCode !== 0) reject(new Error(`Commit worker exited ${exitCode}`));
      else if (result === undefined) reject(new Error("Commit worker returned no result"));
      else resolve(result);
    });
  })));
}

function concurrentOpen(database: string): Promise<WorkerResult[]> {
  const barrier = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT);
  const script = `
    const { parentPort, workerData } = require("node:worker_threads");
    const { join } = require("node:path");
    const { pathToFileURL } = require("node:url");
    (async () => {
      const knowledgeModule = await import(pathToFileURL(join(
        workerData.root, "dist", "canonical-fact-relation.js"
      )).href);
      const view = new Int32Array(workerData.barrier);
      Atomics.add(view, 0, 1); Atomics.notify(view, 0);
      while (Atomics.load(view, 0) < 2) Atomics.wait(view, 0, 1);
      const store = new knowledgeModule.SqliteCanonicalFactRelationStore(workerData.database);
      store.close();
      parentPort.postMessage({ ok: true });
    })().catch((error) => parentPort.postMessage({ ok: false, code: error && error.code }));
  `;
  return Promise.all([0, 1].map(() => new Promise<WorkerResult>((resolve, reject) => {
    const worker = new Worker(script, {
      eval: true,
      workerData: { root, database, barrier },
    });
    let result: WorkerResult | undefined;
    worker.once("message", (message: WorkerResult) => { result = message; });
    worker.once("error", reject);
    worker.once("exit", (exitCode) => {
      if (exitCode !== 0) reject(new Error(`Open worker exited ${exitCode}`));
      else if (result === undefined) reject(new Error("Open worker returned no result"));
      else resolve(result);
    });
  })));
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
