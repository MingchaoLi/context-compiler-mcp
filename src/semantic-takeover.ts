import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import {
  CANONICAL_FACT_RELATION_POLICY_HASH,
  applyCanonicalFactRelationInsideCore,
  assertCanonicalFactRelationCommitAbsentInsideCore,
  normalizeCanonicalFactRelationInputInsideCore,
  readCanonicalFactRelationAuthorityInsideCore,
  readCanonicalFactRelationCommitInsideCore,
  type CanonicalFactReferenceInsideCore,
  type CanonicalFactRelationCommitInput,
  type CanonicalFactRelationCommitInsideCore,
  type CanonicalFactRelationCommitResult,
  type CanonicalFactRelationAuthorityInsideCore,
  type CanonicalRelationReferenceInsideCore,
  type CommittedCanonicalFact,
  type CommittedCanonicalRelation,
  type NormalizedCanonicalFactRelationCommitInput,
} from "./canonical-fact-relation.js";
import {
  CANONICAL_STATE_POLICY_HASH,
  readCanonicalStateAuthorityInsideCore,
  type CommittedCanonicalStateRevision,
} from "./canonical-state.js";
import type { JsonObject, JsonValue } from "./raw-store.js";
import {
  AUTHORITY_NAMESPACE,
  SHADOW_NAMESPACE_PREFIX,
  type RevisionCommitRecord,
  type RevisionScope,
  type RevisionVector,
} from "./revision-substrate.js";

export const SEMANTIC_AUTHORITY_SCHEMA_VERSION = 1;
export const SEMANTIC_TAKEOVER_POLICY_VERSION = "semantic-takeover/v1";
export const SEMANTIC_TAKEOVER_COVERAGE_DISPOSITIONS = [
  "canonicalized",
  "artifact_only",
] as const;
export const SEMANTIC_TAKEOVER_ARTIFACT_ONLY_REASONS = [
  "no_semantic_delta",
  "duplicate_evidence",
  "non_authority_context",
] as const;

export type SemanticTakeoverCoverageDisposition =
  (typeof SEMANTIC_TAKEOVER_COVERAGE_DISPOSITIONS)[number];
export type SemanticTakeoverArtifactOnlyReason =
  (typeof SEMANTIC_TAKEOVER_ARTIFACT_ONLY_REASONS)[number];
export type SemanticTakeoverErrorCode =
  | "INVALID_INPUT"
  | "NOT_FOUND"
  | "CONFLICT"
  | "STORAGE_FAILURE"
  | "CORRUPT_DATA"
  | "CLOSED";

export interface SemanticStateAuthorityRef {
  state_revision: number;
  state_commit_id: string;
  state_hash: string;
  required_item_ids: string[];
}

export interface SemanticFactRef extends CanonicalFactReferenceInsideCore {}

export interface SemanticRelationRef extends CanonicalRelationReferenceInsideCore {}

export interface SemanticTakeoverCoverage {
  ledger_revision: number;
  event_id: string;
  disposition: SemanticTakeoverCoverageDisposition;
  state_item_refs: string[];
  fact_refs: SemanticFactRef[];
  relation_refs: SemanticRelationRef[];
  artifact_only_reason?: SemanticTakeoverArtifactOnlyReason;
}

export interface CompactionArtifactInput {
  artifact_id: string;
  expected_artifact_hash: string;
  generator_version: string;
  body: JsonValue;
}

export interface SemanticTakeoverCommitInput {
  scope: RevisionScope;
  takeover_commit_id: string;
  ledger_base_revision: number;
  covered_raw_range: { start: number; end: number };
  expected_frontier_revision: number;
  expected_frontier_position: number;
  state_authority_ref: SemanticStateAuthorityRef | null;
  existing_fact_refs: SemanticFactRef[];
  existing_relation_refs: SemanticRelationRef[];
  fact_relation_apply?: CanonicalFactRelationCommitInput;
  coverage: SemanticTakeoverCoverage[];
  compaction_artifact: CompactionArtifactInput;
  policy_hash: string;
  provenance_event_ids: string[];
}

export interface SemanticEnrichmentSourceEventRef {
  ledger_revision: number;
  event_id: string;
}

export interface SemanticEnrichmentCommitInput {
  scope: RevisionScope;
  enrichment_commit_id: string;
  source_event_refs: SemanticEnrichmentSourceEventRef[];
  state_authority_ref: SemanticStateAuthorityRef | null;
  existing_fact_refs: SemanticFactRef[];
  existing_relation_refs: SemanticRelationRef[];
  fact_relation_apply: CanonicalFactRelationCommitInput;
  policy_hash: string;
  provenance_event_ids: string[];
}

export interface SemanticAuthorityManifest {
  state_authority_ref: SemanticStateAuthorityRef | null;
  fact_refs: SemanticFactRef[];
  relation_refs: SemanticRelationRef[];
  fact_relation_authority_commit_id?: string;
}

export interface SemanticTakeoverCommit extends RevisionScope {
  takeover_commit_id: string;
  policy_hash: string;
  ledger_base_revision: number;
  covered_raw_range: { start: number; end: number };
  previous_revision_vector: RevisionVector;
  current_revision_vector: RevisionVector;
  previous_state_revision: number;
  new_state_revision: number;
  authority_manifest: SemanticAuthorityManifest;
  coverage: SemanticTakeoverCoverage[];
  artifact_id: string;
  artifact_hash: string;
  created_at: string;
}

export interface SemanticEnrichmentCommit extends RevisionScope {
  enrichment_commit_id: string;
  policy_hash: string;
  observed_revision_vector: RevisionVector;
  source_event_refs: SemanticEnrichmentSourceEventRef[];
  authority_manifest: SemanticAuthorityManifest;
  created_at: string;
}

export interface CompactionArtifact extends RevisionScope {
  artifact_id: string;
  artifact_hash: string;
  covered_raw_range: { start: number; end: number };
  generator_version: string;
  policy_hash: string;
  provenance_event_ids: string[];
  body: JsonValue;
  descriptor: JsonObject;
  created_at: string;
}

export interface CurrentSemanticTakeoverAuthority extends RevisionScope {
  revision_vector: RevisionVector;
  takeover?: SemanticTakeoverCommit;
  artifact?: CompactionArtifact;
}

export class SemanticTakeoverError extends Error {
  constructor(readonly code: SemanticTakeoverErrorCode) {
    super(code);
    this.name = "SemanticTakeoverError";
  }
}

export interface NormalizedSemanticTakeoverInput extends SemanticTakeoverCommitInput {
  request: JsonObject;
  normalized_fact_relation_apply?: NormalizedCanonicalFactRelationCommitInput;
  artifact_descriptor: JsonObject;
  artifact_hash: string;
}

export interface NormalizedSemanticEnrichmentInput extends SemanticEnrichmentCommitInput {
  request: JsonObject;
  normalized_fact_relation_apply: NormalizedCanonicalFactRelationCommitInput;
}

interface RawEventRow extends Record<string, unknown> {
  namespace: string;
  stream_id: string;
  ledger_revision: number;
  event_id: string;
  source_kind: string;
  source_id: string;
  source_session_id: string | null;
  payload_json: string;
  occurred_at: string | null;
  created_at: string;
}

interface SemanticTakeoverRow extends Record<string, unknown> {
  namespace: string;
  stream_id: string;
  takeover_commit_id: string;
  policy_hash: string;
  request_fingerprint: string;
  request_json: string;
  previous_revision_vector_json: string;
  current_revision_vector_json: string;
  authority_manifest_json: string;
  coverage_json: string;
  artifact_id: string;
  artifact_hash: string;
  result_json: string;
  created_at: string;
}

interface SemanticEnrichmentRow extends Record<string, unknown> {
  namespace: string;
  stream_id: string;
  enrichment_commit_id: string;
  policy_hash: string;
  request_fingerprint: string;
  request_json: string;
  observed_revision_vector_json: string;
  source_event_refs_json: string;
  authority_manifest_json: string;
  result_json: string;
  created_at: string;
}

interface CompactionArtifactRow extends Record<string, unknown> {
  namespace: string;
  stream_id: string;
  artifact_id: string;
  artifact_hash: string;
  covered_raw_range_json: string;
  generator_version: string;
  policy_hash: string;
  provenance_event_ids_json: string;
  descriptor_json: string;
  body_json: string;
  created_at: string;
}

interface SubstrateMarkerRow extends Record<string, unknown> {
  operation: string;
  kind: string;
  request_fingerprint: string;
  request_json: string;
  previous_json: string;
  current_json: string;
  result_json: string;
}

interface StreamRow extends Record<string, unknown> {
  namespace: string;
  stream_id: string;
  ledger_revision: number;
  state_revision: number;
  raw_frontier_revision: number;
  frontier_position: number;
  takeover_commit_revision: number;
}

interface ValidatedRawEvent extends RevisionScope {
  ledger_revision: number;
  event_id: string;
  payload: JsonValue;
}

const MAX_IDENTIFIER_LENGTH = 500;
const MAX_GENERATOR_VERSION_LENGTH = 500;
const MAX_EVENT_REFS = 10_000;
const MAX_AUTHORITY_REFS = 10_000;
const MAX_ARTIFACT_BODY_BYTES = 10_000_000;
const MAX_JSON_DEPTH = 32;
const MAX_JSON_KEYS = 10_000;
const MAX_SAFE_REVISION = Number.MAX_SAFE_INTEGER;
const HASH_PATTERN = /^[a-f0-9]{64}$/u;

const POLICY_DESCRIPTOR: JsonObject = {
  artifact_hash: "sha256-canonical-json-v1",
  coverage: "canonicalized|artifact_only-v1",
  enrichment_transition: "axis-neutral-fact-relation-only",
  fact_relation_policy_hash: CANONICAL_FACT_RELATION_POLICY_HASH,
  semantic_policy_version: SEMANTIC_TAKEOVER_POLICY_VERSION,
  state_mode: "exact-reference-only-no-axis-advance",
  state_policy_hash: CANONICAL_STATE_POLICY_HASH,
  takeover_transition: "TAKEOVER_FRONTIER",
};

export const SEMANTIC_TAKEOVER_POLICY_HASH = sha256(canonicalJson(POLICY_DESCRIPTOR));

const SEMANTIC_SCHEMA_OBJECTS = [
  {
    type: "table" as const,
    name: "cc_semantic_authority_schema",
    sql: `CREATE TABLE cc_semantic_authority_schema (
      version INTEGER PRIMARY KEY CHECK (version > 0),
      completed_at TEXT NOT NULL
    )`,
  },
  {
    type: "table" as const,
    name: "cc_semantic_takeover_commits",
    sql: `CREATE TABLE cc_semantic_takeover_commits (
      namespace TEXT NOT NULL,
      stream_id TEXT NOT NULL,
      takeover_commit_id TEXT NOT NULL,
      policy_hash TEXT NOT NULL,
      request_fingerprint TEXT NOT NULL,
      request_json TEXT NOT NULL CHECK (json_valid(request_json)),
      previous_revision_vector_json TEXT NOT NULL CHECK (json_valid(previous_revision_vector_json)),
      current_revision_vector_json TEXT NOT NULL CHECK (json_valid(current_revision_vector_json)),
      authority_manifest_json TEXT NOT NULL CHECK (json_valid(authority_manifest_json)),
      coverage_json TEXT NOT NULL CHECK (json_valid(coverage_json)),
      artifact_id TEXT NOT NULL,
      artifact_hash TEXT NOT NULL,
      result_json TEXT NOT NULL CHECK (json_valid(result_json)),
      created_at TEXT NOT NULL,
      PRIMARY KEY (namespace, stream_id, takeover_commit_id),
      FOREIGN KEY (namespace, stream_id)
        REFERENCES cc_revision_streams(namespace, stream_id)
    )`,
  },
  {
    type: "table" as const,
    name: "cc_semantic_enrichment_commits",
    sql: `CREATE TABLE cc_semantic_enrichment_commits (
      namespace TEXT NOT NULL,
      stream_id TEXT NOT NULL,
      enrichment_commit_id TEXT NOT NULL,
      policy_hash TEXT NOT NULL,
      request_fingerprint TEXT NOT NULL,
      request_json TEXT NOT NULL CHECK (json_valid(request_json)),
      observed_revision_vector_json TEXT NOT NULL CHECK (json_valid(observed_revision_vector_json)),
      source_event_refs_json TEXT NOT NULL CHECK (json_valid(source_event_refs_json)),
      authority_manifest_json TEXT NOT NULL CHECK (json_valid(authority_manifest_json)),
      result_json TEXT NOT NULL CHECK (json_valid(result_json)),
      created_at TEXT NOT NULL,
      PRIMARY KEY (namespace, stream_id, enrichment_commit_id),
      FOREIGN KEY (namespace, stream_id)
        REFERENCES cc_revision_streams(namespace, stream_id)
    )`,
  },
  {
    type: "table" as const,
    name: "cc_compaction_artifacts",
    sql: `CREATE TABLE cc_compaction_artifacts (
      namespace TEXT NOT NULL,
      stream_id TEXT NOT NULL,
      artifact_id TEXT NOT NULL,
      artifact_hash TEXT NOT NULL,
      covered_raw_range_json TEXT NOT NULL CHECK (json_valid(covered_raw_range_json)),
      generator_version TEXT NOT NULL,
      policy_hash TEXT NOT NULL,
      provenance_event_ids_json TEXT NOT NULL CHECK (json_valid(provenance_event_ids_json)),
      descriptor_json TEXT NOT NULL CHECK (json_valid(descriptor_json)),
      body_json TEXT NOT NULL CHECK (json_valid(body_json)),
      created_at TEXT NOT NULL,
      PRIMARY KEY (namespace, stream_id, artifact_id),
      FOREIGN KEY (namespace, stream_id)
        REFERENCES cc_revision_streams(namespace, stream_id)
    )`,
  },
  ...[
    ["cc_semantic_authority_schema", "semantic authority schema markers"],
    ["cc_semantic_takeover_commits", "semantic Takeover commits"],
    ["cc_semantic_enrichment_commits", "semantic Enrichment commits"],
    ["cc_compaction_artifacts", "compaction Artifacts"],
  ].flatMap(([table, label]) => [
    {
      type: "trigger" as const,
      name: `${table}_no_update`,
      sql: `CREATE TRIGGER ${table}_no_update
        BEFORE UPDATE ON ${table}
        BEGIN
          SELECT RAISE(ABORT, '${label} are immutable');
        END`,
    },
    {
      type: "trigger" as const,
      name: `${table}_no_delete`,
      sql: `CREATE TRIGGER ${table}_no_delete
        BEFORE DELETE ON ${table}
        BEGIN
          SELECT RAISE(ABORT, '${label} are append-only');
        END`,
    },
  ]),
] as const;

export function normalizeSemanticTakeoverInput(
  value: unknown
): NormalizedSemanticTakeoverInput {
  const input = readObjectShape(value, [
    "scope",
    "takeover_commit_id",
    "ledger_base_revision",
    "covered_raw_range",
    "expected_frontier_revision",
    "expected_frontier_position",
    "state_authority_ref",
    "existing_fact_refs",
    "existing_relation_refs",
    "coverage",
    "compaction_artifact",
    "policy_hash",
    "provenance_event_ids",
  ], ["fact_relation_apply"]);
  const scope = normalizeScope(input.scope);
  const takeoverCommitId = validateIdentifier(input.takeover_commit_id);
  const ledgerBaseRevision = validateRevision(input.ledger_base_revision);
  const coveredRawRange = normalizeRange(input.covered_raw_range);
  const expectedFrontierRevision = validateRevision(input.expected_frontier_revision);
  const expectedFrontierPosition = validateRevision(input.expected_frontier_position);
  const stateAuthorityRef = input.state_authority_ref === null
    ? null
    : normalizeStateAuthorityRef(input.state_authority_ref);
  const existingFactRefs = normalizeFactRefs(input.existing_fact_refs);
  const existingRelationRefs = normalizeRelationRefs(input.existing_relation_refs);
  const coverage = normalizeCoverage(input.coverage);
  const policyHash = validateHash(input.policy_hash);
  const provenanceEventIds = normalizeOrderedIdentifiers(
    input.provenance_event_ids,
    1,
    MAX_EVENT_REFS
  );
  const artifactInput = normalizeArtifactInput(input.compaction_artifact);
  let normalizedApply: NormalizedCanonicalFactRelationCommitInput | undefined;
  let apply: CanonicalFactRelationCommitInput | undefined;
  if (input.fact_relation_apply !== undefined) {
    normalizedApply = normalizeCanonicalFactRelationInputInsideCore(
      input.fact_relation_apply
    );
    if (!sameScope(normalizedApply.scope, scope)) invalid();
    apply = cloneFactRelationInput(normalizedApply);
  }
  const descriptor: JsonObject = {
    artifact_schema: "compaction-artifact/v1",
    namespace: scope.namespace,
    stream_id: scope.stream_id,
    covered_raw_range: rangeAsJson(coveredRawRange),
    generator_version: artifactInput.generator_version,
    policy_hash: policyHash,
    provenance_event_ids: [...provenanceEventIds],
    body: cloneJson(artifactInput.body),
  };
  const artifactHash = sha256(canonicalJson(descriptor));

  const normalized: SemanticTakeoverCommitInput = {
    scope,
    takeover_commit_id: takeoverCommitId,
    ledger_base_revision: ledgerBaseRevision,
    covered_raw_range: coveredRawRange,
    expected_frontier_revision: expectedFrontierRevision,
    expected_frontier_position: expectedFrontierPosition,
    state_authority_ref: cloneStateRef(stateAuthorityRef),
    existing_fact_refs: existingFactRefs.map(cloneFactRef),
    existing_relation_refs: existingRelationRefs.map(cloneRelationRef),
    ...(apply === undefined ? {} : { fact_relation_apply: apply }),
    coverage: coverage.map(cloneCoverage),
    compaction_artifact: cloneArtifactInput(artifactInput),
    policy_hash: policyHash,
    provenance_event_ids: [...provenanceEventIds],
  };
  return {
    ...normalized,
    request: takeoverInputAsJson(normalized),
    ...(normalizedApply === undefined
      ? {}
      : { normalized_fact_relation_apply: normalizedApply }),
    artifact_descriptor: descriptor,
    artifact_hash: artifactHash,
  };
}

export function normalizeSemanticEnrichmentInput(
  value: unknown
): NormalizedSemanticEnrichmentInput {
  const input = readExactObject(value, [
    "scope",
    "enrichment_commit_id",
    "source_event_refs",
    "state_authority_ref",
    "existing_fact_refs",
    "existing_relation_refs",
    "fact_relation_apply",
    "policy_hash",
    "provenance_event_ids",
  ]);
  const scope = normalizeScope(input.scope);
  const enrichmentCommitId = validateIdentifier(input.enrichment_commit_id);
  const sourceEventRefs = normalizeSourceEventRefs(input.source_event_refs);
  const stateAuthorityRef = input.state_authority_ref === null
    ? null
    : normalizeStateAuthorityRef(input.state_authority_ref);
  const existingFactRefs = normalizeFactRefs(input.existing_fact_refs);
  const existingRelationRefs = normalizeRelationRefs(input.existing_relation_refs);
  const normalizedApply = normalizeCanonicalFactRelationInputInsideCore(
    input.fact_relation_apply
  );
  if (!sameScope(normalizedApply.scope, scope)) invalid();
  const policyHash = validateHash(input.policy_hash);
  const provenanceEventIds = normalizeOrderedIdentifiers(
    input.provenance_event_ids,
    1,
    MAX_EVENT_REFS
  );
  if (!sameStrings(
    provenanceEventIds,
    sourceEventRefs.map((ref) => ref.event_id)
  )) invalid();
  const normalized: SemanticEnrichmentCommitInput = {
    scope,
    enrichment_commit_id: enrichmentCommitId,
    source_event_refs: sourceEventRefs.map(cloneSourceEventRef),
    state_authority_ref: cloneStateRef(stateAuthorityRef),
    existing_fact_refs: existingFactRefs.map(cloneFactRef),
    existing_relation_refs: existingRelationRefs.map(cloneRelationRef),
    fact_relation_apply: cloneFactRelationInput(normalizedApply),
    policy_hash: policyHash,
    provenance_event_ids: [...provenanceEventIds],
  };
  return {
    ...normalized,
    request: enrichmentInputAsJson(normalized),
    normalized_fact_relation_apply: normalizedApply,
  };
}

export function migrateSemanticAuthority(database: DatabaseSync): void {
  database.exec("BEGIN IMMEDIATE;");
  try {
    if (sqliteObjectExists(database, "table", "cc_semantic_authority_schema")) {
      validateSemanticSchema(database);
      assertSemanticSchemaVersion(database);
      database.exec("COMMIT;");
      return;
    }
    for (const object of SEMANTIC_SCHEMA_OBJECTS.slice(1)) {
      if (sqliteObjectExists(database, object.type, object.name)) corrupt();
    }
    database.exec(SEMANTIC_SCHEMA_OBJECTS.map(({ sql }) => `${sql};`).join("\n"));
    validateSemanticSchema(database);
    database.prepare(
      "INSERT INTO cc_semantic_authority_schema (version, completed_at) VALUES (?, ?)"
    ).run(SEMANTIC_AUTHORITY_SCHEMA_VERSION, new Date().toISOString());
    assertSemanticSchemaVersion(database);
    database.exec("COMMIT;");
  } catch (error) {
    rollback(database);
    throw error;
  }
}

/** @internal Executes the WO-04C domain work inside the frozen substrate callback. */
export function executeSemanticTakeoverInsideCore(
  database: DatabaseSync,
  normalized: NormalizedSemanticTakeoverInput,
  previousValue: RevisionVector,
  currentValue: RevisionVector
): SemanticTakeoverCommit {
  const previous = normalizeVector(previousValue, normalized.scope);
  const current = normalizeVector(currentValue, normalized.scope);
  if (normalized.policy_hash !== SEMANTIC_TAKEOVER_POLICY_HASH ||
      normalized.compaction_artifact.expected_artifact_hash !== normalized.artifact_hash) {
    invalid();
  }
  if (
    normalized.ledger_base_revision !== previous.ledger_revision ||
    normalized.expected_frontier_revision !== previous.raw_frontier_revision ||
    normalized.expected_frontier_position !== previous.frontier_position ||
    normalized.covered_raw_range.start !== previous.frontier_position + 1 ||
    normalized.covered_raw_range.end < normalized.covered_raw_range.start ||
    normalized.covered_raw_range.end > previous.ledger_revision ||
    current.ledger_revision !== previous.ledger_revision ||
    current.state_revision !== previous.state_revision ||
    current.raw_frontier_revision !== increment(previous.raw_frontier_revision) ||
    current.frontier_position !== normalized.covered_raw_range.end ||
    current.takeover_commit_revision !== increment(previous.takeover_commit_revision)
  ) conflict();

  const rawEvents = readRawRangeInsideCore(
    database,
    normalized.scope,
    normalized.covered_raw_range
  );
  if (!sameStrings(
    rawEvents.map((event) => event.event_id),
    normalized.provenance_event_ids
  )) conflict();
  const state = validateStateAuthorityRefInsideCore(
    database,
    normalized.scope,
    normalized.state_authority_ref,
    previous
  );

  let factRelationCommit: CanonicalFactRelationCommitResult | undefined;
  if (normalized.normalized_fact_relation_apply !== undefined) {
    assertCanonicalFactRelationCommitAbsentInsideCore(
      database,
      normalized.scope,
      normalized.normalized_fact_relation_apply.authority_commit_id
    );
    factRelationCommit = applyCanonicalFactRelationInsideCore(
      database,
      normalized.normalized_fact_relation_apply,
      previous
    );
    if (!sameVector(factRelationCommit.observed_revision_vector, previous)) conflict();
  }
  const finalFactRefs = mergeFactRefs(
    normalized.existing_fact_refs,
    factRelationCommit?.facts.map(factToRef) ?? []
  );
  const finalRelationRefs = mergeRelationRefs(
    normalized.existing_relation_refs,
    factRelationCommit?.relations.map(relationToRef) ?? []
  );
  const authority = readCanonicalFactRelationAuthorityInsideCore(
    database,
    normalized.scope,
    finalFactRefs,
    finalRelationRefs,
    previous
  );
  validateCoverage(
    normalized.coverage,
    rawEvents,
    normalized.state_authority_ref,
    state,
    authority.facts,
    authority.relations
  );

  const duplicateArtifact = database.prepare(
    `SELECT artifact_id FROM cc_compaction_artifacts
     WHERE namespace = ? AND stream_id = ? AND artifact_id = ?`
  ).get(
    normalized.scope.namespace,
    normalized.scope.stream_id,
    normalized.compaction_artifact.artifact_id
  );
  if (duplicateArtifact !== undefined) conflict();

  const createdAt = new Date().toISOString();
  const manifest: SemanticAuthorityManifest = {
    state_authority_ref: cloneStateRef(normalized.state_authority_ref),
    fact_refs: finalFactRefs.map(cloneFactRef),
    relation_refs: finalRelationRefs.map(cloneRelationRef),
    ...(factRelationCommit === undefined
      ? {}
      : { fact_relation_authority_commit_id: factRelationCommit.authority_commit_id }),
  };
  const artifact: CompactionArtifact = {
    ...normalized.scope,
    artifact_id: normalized.compaction_artifact.artifact_id,
    artifact_hash: normalized.artifact_hash,
    covered_raw_range: cloneRange(normalized.covered_raw_range),
    generator_version: normalized.compaction_artifact.generator_version,
    policy_hash: SEMANTIC_TAKEOVER_POLICY_HASH,
    provenance_event_ids: [...normalized.provenance_event_ids],
    body: cloneJson(normalized.compaction_artifact.body),
    descriptor: cloneJsonObject(normalized.artifact_descriptor),
    created_at: createdAt,
  };
  database.prepare(
    `INSERT INTO cc_compaction_artifacts (
       namespace, stream_id, artifact_id, artifact_hash,
       covered_raw_range_json, generator_version, policy_hash,
       provenance_event_ids_json, descriptor_json, body_json, created_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    artifact.namespace,
    artifact.stream_id,
    artifact.artifact_id,
    artifact.artifact_hash,
    canonicalJson(rangeAsJson(artifact.covered_raw_range)),
    artifact.generator_version,
    artifact.policy_hash,
    canonicalJson(artifact.provenance_event_ids),
    canonicalJson(artifact.descriptor),
    canonicalJson(artifact.body),
    artifact.created_at
  );

  const result: SemanticTakeoverCommit = {
    ...normalized.scope,
    takeover_commit_id: normalized.takeover_commit_id,
    policy_hash: SEMANTIC_TAKEOVER_POLICY_HASH,
    ledger_base_revision: normalized.ledger_base_revision,
    covered_raw_range: cloneRange(normalized.covered_raw_range),
    previous_revision_vector: cloneVector(previous),
    current_revision_vector: cloneVector(current),
    previous_state_revision: previous.state_revision,
    new_state_revision: current.state_revision,
    authority_manifest: cloneAuthorityManifest(manifest),
    coverage: normalized.coverage.map(cloneCoverage),
    artifact_id: artifact.artifact_id,
    artifact_hash: artifact.artifact_hash,
    created_at: createdAt,
  };
  database.prepare(
    `INSERT INTO cc_semantic_takeover_commits (
       namespace, stream_id, takeover_commit_id, policy_hash,
       request_fingerprint, request_json, previous_revision_vector_json,
       current_revision_vector_json, authority_manifest_json, coverage_json,
       artifact_id, artifact_hash, result_json, created_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    result.namespace,
    result.stream_id,
    result.takeover_commit_id,
    result.policy_hash,
    sha256(canonicalJson(normalized.request)),
    canonicalJson(normalized.request),
    canonicalJson(vectorAsJson(previous)),
    canonicalJson(vectorAsJson(current)),
    canonicalJson(authorityManifestAsJson(manifest)),
    canonicalJson(normalized.coverage.map(coverageAsJson)),
    result.artifact_id,
    result.artifact_hash,
    canonicalJson(takeoverResultAsJson(result)),
    result.created_at
  );
  return cloneTakeover(result);
}

/** @internal Executes one axis-neutral Enrichment inside a coordinator transaction. */
export function executeSemanticEnrichmentInsideCore(
  database: DatabaseSync,
  normalized: NormalizedSemanticEnrichmentInput,
  observedValue: RevisionVector
): SemanticEnrichmentCommit {
  const observed = normalizeVector(observedValue, normalized.scope);
  if (normalized.policy_hash !== SEMANTIC_TAKEOVER_POLICY_HASH) invalid();
  readRawSourceRefsInsideCore(database, normalized.scope, normalized.source_event_refs, observed);
  validateStateAuthorityRefInsideCore(
    database,
    normalized.scope,
    normalized.state_authority_ref,
    observed
  );
  assertCanonicalFactRelationCommitAbsentInsideCore(
    database,
    normalized.scope,
    normalized.normalized_fact_relation_apply.authority_commit_id
  );
  const applied = applyCanonicalFactRelationInsideCore(
    database,
    normalized.normalized_fact_relation_apply,
    observed
  );
  if (!sameVector(applied.observed_revision_vector, observed) ||
      (applied.facts.length === 0 && applied.relations.length === 0)) conflict();
  const finalFactRefs = mergeFactRefs(
    normalized.existing_fact_refs,
    applied.facts.map(factToRef)
  );
  const finalRelationRefs = mergeRelationRefs(
    normalized.existing_relation_refs,
    applied.relations.map(relationToRef)
  );
  readCanonicalFactRelationAuthorityInsideCore(
    database,
    normalized.scope,
    finalFactRefs,
    finalRelationRefs,
    observed
  );
  const createdAt = new Date().toISOString();
  const manifest: SemanticAuthorityManifest = {
    state_authority_ref: cloneStateRef(normalized.state_authority_ref),
    fact_refs: finalFactRefs.map(cloneFactRef),
    relation_refs: finalRelationRefs.map(cloneRelationRef),
    fact_relation_authority_commit_id: applied.authority_commit_id,
  };
  const result: SemanticEnrichmentCommit = {
    ...normalized.scope,
    enrichment_commit_id: normalized.enrichment_commit_id,
    policy_hash: SEMANTIC_TAKEOVER_POLICY_HASH,
    observed_revision_vector: cloneVector(observed),
    source_event_refs: normalized.source_event_refs.map(cloneSourceEventRef),
    authority_manifest: cloneAuthorityManifest(manifest),
    created_at: createdAt,
  };
  database.prepare(
    `INSERT INTO cc_semantic_enrichment_commits (
       namespace, stream_id, enrichment_commit_id, policy_hash,
       request_fingerprint, request_json, observed_revision_vector_json,
       source_event_refs_json, authority_manifest_json, result_json, created_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    result.namespace,
    result.stream_id,
    result.enrichment_commit_id,
    result.policy_hash,
    sha256(canonicalJson(normalized.request)),
    canonicalJson(normalized.request),
    canonicalJson(vectorAsJson(observed)),
    canonicalJson(result.source_event_refs.map(sourceEventRefAsJson)),
    canonicalJson(authorityManifestAsJson(manifest)),
    canonicalJson(enrichmentResultAsJson(result)),
    result.created_at
  );
  return cloneEnrichment(result);
}

/** @internal Exact replay check before any new Enrichment mutation. */
export function replaySemanticEnrichmentInsideCore(
  database: DatabaseSync,
  normalized: NormalizedSemanticEnrichmentInput
): SemanticEnrichmentCommit | undefined {
  const row = readEnrichmentRow(
    database,
    normalized.scope,
    normalized.enrichment_commit_id
  );
  if (row === undefined) return undefined;
  const expectedRequest = canonicalJson(normalized.request);
  if (row.request_json !== expectedRequest ||
      storedHash(row.request_fingerprint) !== sha256(expectedRequest)) conflict();
  return readSemanticEnrichmentInsideCore(
    database,
    normalized.scope,
    normalized.enrichment_commit_id
  );
}

/** @internal Exact cross-domain Takeover read on a caller-owned read snapshot. */
export function readSemanticTakeoverInsideCore(
  database: DatabaseSync,
  scopeValue: RevisionScope,
  takeoverCommitIdValue: string,
  expectedSubstrateRecord?: RevisionCommitRecord
): SemanticTakeoverCommit {
  const scope = normalizeScope(scopeValue);
  const takeoverCommitId = validateIdentifier(takeoverCommitIdValue);
  const row = readTakeoverRow(database, scope, takeoverCommitId);
  if (row === undefined) notFound();
  if (storedHash(row.policy_hash) !== SEMANTIC_TAKEOVER_POLICY_HASH ||
      storedHash(row.request_fingerprint) !== sha256(row.request_json)) corrupt();
  const normalized = parseStoredTakeoverInput(row.request_json);
  if (!sameScope(normalized.scope, scope) ||
      normalized.takeover_commit_id !== takeoverCommitId) corrupt();
  const previous = parseStoredVector(row.previous_revision_vector_json, scope);
  const current = parseStoredVector(row.current_revision_vector_json, scope);
  const manifest = parseStoredAuthorityManifest(row.authority_manifest_json);
  const coverage = parseStoredCoverage(row.coverage_json);
  const result = parseStoredTakeoverResult(row.result_json, scope);
  if (
    result.takeover_commit_id !== takeoverCommitId ||
    result.policy_hash !== SEMANTIC_TAKEOVER_POLICY_HASH ||
    result.created_at !== storedTimestamp(row.created_at) ||
    !sameVector(result.previous_revision_vector, previous) ||
    !sameVector(result.current_revision_vector, current) ||
    canonicalJson(authorityManifestAsJson(result.authority_manifest)) !==
      canonicalJson(authorityManifestAsJson(manifest)) ||
    canonicalJson(result.coverage.map(coverageAsJson)) !==
      canonicalJson(coverage.map(coverageAsJson)) ||
    result.artifact_id !== storedIdentifier(row.artifact_id) ||
    result.artifact_hash !== storedHash(row.artifact_hash) ||
    canonicalJson(takeoverResultAsJson(result)) !== row.result_json
  ) corrupt();

  assertTakeoverTransition(normalized, previous, current, result);
  const marker = readSubstrateMarker(database, scope, takeoverCommitId);
  if (marker === undefined || marker.operation !== "TAKEOVER_FRONTIER" ||
      marker.kind !== "SEMANTIC_TAKEOVER_COMMIT_V1") corrupt();
  const markerPrevious = parseStoredVector(marker.previous_json, scope);
  const markerCurrent = parseStoredVector(marker.current_json, scope);
  const markerRequest = canonicalJson(takeoverSubstrateRequestAsJson(normalized));
  if (
    !sameVector(markerPrevious, previous) ||
    !sameVector(markerCurrent, current) ||
    marker.request_json !== markerRequest ||
    storedHash(marker.request_fingerprint) !== sha256(markerRequest) ||
    marker.result_json !== row.result_json
  ) corrupt();
  if (expectedSubstrateRecord !== undefined) {
    if (
      expectedSubstrateRecord.commit_id !== takeoverCommitId ||
      expectedSubstrateRecord.operation !== "TAKEOVER_FRONTIER" ||
      expectedSubstrateRecord.kind !== "SEMANTIC_TAKEOVER_COMMIT_V1" ||
      !sameVector(expectedSubstrateRecord.previous, previous) ||
      !sameVector(expectedSubstrateRecord.current, current) ||
      canonicalJson(expectedSubstrateRecord.result) !== row.result_json
    ) corrupt();
  }
  const live = readLiveVector(database, scope);
  if (!vectorAtOrAfter(live, current)) corrupt();
  let rawEvents: ValidatedRawEvent[];
  try {
    rawEvents = readRawRangeInsideCore(database, scope, result.covered_raw_range);
  } catch {
    corrupt();
  }
  if (!sameStrings(
    rawEvents.map((event) => event.event_id),
    normalized.provenance_event_ids
  )) corrupt();
  const state = validateStoredStateAuthorityRefInsideCore(
    database,
    scope,
    result.authority_manifest.state_authority_ref,
    previous
  );
  let expectedFactRefs = normalized.existing_fact_refs;
  let expectedRelationRefs = normalized.existing_relation_refs;
  if (normalized.normalized_fact_relation_apply !== undefined) {
    try {
      const ownerCommit = readCanonicalFactRelationCommitInsideCore(
        database,
        scope,
        normalized.normalized_fact_relation_apply.authority_commit_id
      );
      if (canonicalJson(ownerCommit.input.request) !==
          canonicalJson(normalized.normalized_fact_relation_apply.request) ||
          !sameVector(ownerCommit.result.observed_revision_vector, previous)) corrupt();
      expectedFactRefs = mergeFactRefs(
        normalized.existing_fact_refs,
        ownerCommit.result.facts.map(factToRef)
      );
      expectedRelationRefs = mergeRelationRefs(
        normalized.existing_relation_refs,
        ownerCommit.result.relations.map(relationToRef)
      );
    } catch {
      corrupt();
    }
  }
  if (canonicalJson(expectedFactRefs.map(factRefAsJson)) !==
      canonicalJson(result.authority_manifest.fact_refs.map(factRefAsJson)) ||
      canonicalJson(expectedRelationRefs.map(relationRefAsJson)) !==
      canonicalJson(result.authority_manifest.relation_refs.map(relationRefAsJson))) {
    corrupt();
  }
  let authority: CanonicalFactRelationAuthorityInsideCore;
  try {
    authority = readCanonicalFactRelationAuthorityInsideCore(
      database,
      scope,
      result.authority_manifest.fact_refs,
      result.authority_manifest.relation_refs,
      previous
    );
  } catch {
    corrupt();
  }
  const expectedFactRelationCommitId =
    normalized.fact_relation_apply?.authority_commit_id;
  if (result.authority_manifest.fact_relation_authority_commit_id !==
      expectedFactRelationCommitId) corrupt();
  try {
    validateCoverage(
      result.coverage,
      rawEvents,
      result.authority_manifest.state_authority_ref,
      state,
      authority.facts,
      authority.relations
    );
  } catch {
    corrupt();
  }
  let artifact: CompactionArtifact;
  try {
    artifact = readCompactionArtifactInsideCore(database, scope, result.artifact_id);
  } catch {
    corrupt();
  }
  if (artifact.artifact_hash !== result.artifact_hash ||
      artifact.created_at !== result.created_at ||
      canonicalJson(artifact.descriptor) !== canonicalJson(normalized.artifact_descriptor)) {
    corrupt();
  }
  return cloneTakeover(result);
}

/** @internal Exact Enrichment read on a caller-owned read snapshot. */
export function readSemanticEnrichmentInsideCore(
  database: DatabaseSync,
  scopeValue: RevisionScope,
  enrichmentCommitIdValue: string
): SemanticEnrichmentCommit {
  const scope = normalizeScope(scopeValue);
  const enrichmentCommitId = validateIdentifier(enrichmentCommitIdValue);
  const row = readEnrichmentRow(database, scope, enrichmentCommitId);
  if (row === undefined) notFound();
  if (storedHash(row.policy_hash) !== SEMANTIC_TAKEOVER_POLICY_HASH ||
      storedHash(row.request_fingerprint) !== sha256(row.request_json)) corrupt();
  const normalized = parseStoredEnrichmentInput(row.request_json);
  if (!sameScope(normalized.scope, scope) ||
      normalized.enrichment_commit_id !== enrichmentCommitId) corrupt();
  const observed = parseStoredVector(row.observed_revision_vector_json, scope);
  const sourceRefs = parseStoredSourceEventRefs(row.source_event_refs_json);
  const manifest = parseStoredAuthorityManifest(row.authority_manifest_json);
  const result = parseStoredEnrichmentResult(row.result_json, scope);
  if (
    result.enrichment_commit_id !== enrichmentCommitId ||
    result.policy_hash !== SEMANTIC_TAKEOVER_POLICY_HASH ||
    result.created_at !== storedTimestamp(row.created_at) ||
    !sameVector(result.observed_revision_vector, observed) ||
    canonicalJson(result.source_event_refs.map(sourceEventRefAsJson)) !==
      canonicalJson(sourceRefs.map(sourceEventRefAsJson)) ||
    canonicalJson(authorityManifestAsJson(result.authority_manifest)) !==
      canonicalJson(authorityManifestAsJson(manifest)) ||
    canonicalJson(enrichmentResultAsJson(result)) !== row.result_json
  ) corrupt();
  if (canonicalJson(sourceRefs.map(sourceEventRefAsJson)) !==
      canonicalJson(normalized.source_event_refs.map(sourceEventRefAsJson)) ||
      canonicalJson(manifest.state_authority_ref === null
        ? null
        : stateRefAsJson(manifest.state_authority_ref)) !==
      canonicalJson(normalized.state_authority_ref === null
        ? null
        : stateRefAsJson(normalized.state_authority_ref))) corrupt();
  const live = readLiveVector(database, scope);
  if (!vectorAtOrAfter(live, observed)) corrupt();
  try {
    readRawSourceRefsInsideCore(database, scope, sourceRefs, observed);
  } catch {
    corrupt();
  }
  validateStoredStateAuthorityRefInsideCore(
    database,
    scope,
    manifest.state_authority_ref,
    observed
  );
  if (manifest.fact_relation_authority_commit_id !==
      normalized.fact_relation_apply.authority_commit_id) corrupt();
  let ownerCommit: CanonicalFactRelationCommitInsideCore;
  try {
    ownerCommit = readCanonicalFactRelationCommitInsideCore(
      database,
      scope,
      normalized.fact_relation_apply.authority_commit_id
    );
  } catch {
    corrupt();
  }
  if (canonicalJson(ownerCommit.input.request) !==
      canonicalJson(normalized.normalized_fact_relation_apply.request) ||
      !sameVector(ownerCommit.result.observed_revision_vector, observed)) corrupt();
  let expectedFactRefs: SemanticFactRef[];
  let expectedRelationRefs: SemanticRelationRef[];
  try {
    expectedFactRefs = mergeFactRefs(
      normalized.existing_fact_refs,
      ownerCommit.result.facts.map(factToRef)
    );
    expectedRelationRefs = mergeRelationRefs(
      normalized.existing_relation_refs,
      ownerCommit.result.relations.map(relationToRef)
    );
  } catch {
    corrupt();
  }
  if (canonicalJson(expectedFactRefs.map(factRefAsJson)) !==
      canonicalJson(manifest.fact_refs.map(factRefAsJson)) ||
      canonicalJson(expectedRelationRefs.map(relationRefAsJson)) !==
      canonicalJson(manifest.relation_refs.map(relationRefAsJson))) corrupt();
  try {
    readCanonicalFactRelationAuthorityInsideCore(
      database,
      scope,
      manifest.fact_refs,
      manifest.relation_refs,
      observed
    );
  } catch {
    corrupt();
  }
  return cloneEnrichment(result);
}

/** @internal Exact immutable Artifact read on a caller-owned read snapshot. */
export function readCompactionArtifactInsideCore(
  database: DatabaseSync,
  scopeValue: RevisionScope,
  artifactIdValue: string
): CompactionArtifact {
  const scope = normalizeScope(scopeValue);
  const artifactId = validateIdentifier(artifactIdValue);
  const row = database.prepare(
    `SELECT namespace, stream_id, artifact_id, artifact_hash,
            covered_raw_range_json, generator_version, policy_hash,
            provenance_event_ids_json, descriptor_json, body_json, created_at
     FROM cc_compaction_artifacts
     WHERE namespace = ? AND stream_id = ? AND artifact_id = ?`
  ).get(scope.namespace, scope.stream_id, artifactId) as CompactionArtifactRow | undefined;
  if (row === undefined) notFound();
  const storedScopeValue = storedScope(row.namespace, row.stream_id);
  if (!sameScope(storedScopeValue, scope)) corrupt();
  const range = parseStoredRange(row.covered_raw_range_json);
  const policyHash = storedHash(row.policy_hash);
  if (policyHash !== SEMANTIC_TAKEOVER_POLICY_HASH) corrupt();
  const provenance = parseStoredOrderedIdentifiers(
    row.provenance_event_ids_json,
    1,
    MAX_EVENT_REFS
  );
  const descriptor = parseStoredJsonObject(row.descriptor_json);
  const body = parseStoredJson(row.body_json);
  const expectedDescriptor: JsonObject = {
    artifact_schema: "compaction-artifact/v1",
    namespace: scope.namespace,
    stream_id: scope.stream_id,
    covered_raw_range: rangeAsJson(range),
    generator_version: storedText(row.generator_version, MAX_GENERATOR_VERSION_LENGTH),
    policy_hash: policyHash,
    provenance_event_ids: [...provenance],
    body: cloneJson(body),
  };
  if (canonicalJson(descriptor) !== canonicalJson(expectedDescriptor)) corrupt();
  const artifactHash = storedHash(row.artifact_hash);
  if (artifactHash !== sha256(canonicalJson(descriptor))) corrupt();
  return {
    ...scope,
    artifact_id: storedIdentifier(row.artifact_id),
    artifact_hash: artifactHash,
    covered_raw_range: range,
    generator_version: storedText(row.generator_version, MAX_GENERATOR_VERSION_LENGTH),
    policy_hash: policyHash,
    provenance_event_ids: provenance,
    body,
    descriptor,
    created_at: storedTimestamp(row.created_at),
  };
}

/** @internal Reads the exact latest committed Frontier/Takeover binding. */
export function readCurrentSemanticTakeoverInsideCore(
  database: DatabaseSync,
  scopeValue: RevisionScope
): CurrentSemanticTakeoverAuthority {
  const scope = normalizeScope(scopeValue);
  const vector = readOptionalLiveVector(database, scope);
  if (vector.takeover_commit_revision === 0) {
    const stray = database.prepare(
      `SELECT takeover_commit_id FROM cc_semantic_takeover_commits
       WHERE namespace = ? AND stream_id = ? LIMIT 1`
    ).get(scope.namespace, scope.stream_id);
    if (stray !== undefined) corrupt();
    return { ...scope, revision_vector: vector };
  }
  const rows = database.prepare(
    `SELECT takeover_commit_id FROM cc_semantic_takeover_commits
     WHERE namespace = ? AND stream_id = ?`
  ).all(scope.namespace, scope.stream_id) as Array<{ takeover_commit_id: string }>;
  let matched: SemanticTakeoverCommit | undefined;
  for (const row of rows) {
    const candidate = readSemanticTakeoverInsideCore(
      database,
      scope,
      storedIdentifier(row.takeover_commit_id)
    );
    if (candidate.current_revision_vector.takeover_commit_revision ===
        vector.takeover_commit_revision) {
      if (matched !== undefined) corrupt();
      matched = candidate;
    }
  }
  if (matched === undefined || !sameVector(matched.current_revision_vector, vector)) corrupt();
  const artifact = readCompactionArtifactInsideCore(database, scope, matched.artifact_id);
  return {
    ...scope,
    revision_vector: cloneVector(vector),
    takeover: cloneTakeover(matched),
    artifact,
  };
}

function readRawRangeInsideCore(
  database: DatabaseSync,
  scope: RevisionScope,
  range: { start: number; end: number }
): ValidatedRawEvent[] {
  const rows = database.prepare(
    `SELECT namespace, stream_id, ledger_revision, event_id, source_kind,
            source_id, source_session_id, payload_json, occurred_at, created_at
     FROM cc_ledger_raw_events
     WHERE namespace = ? AND stream_id = ?
       AND ledger_revision >= ? AND ledger_revision <= ?
     ORDER BY ledger_revision ASC`
  ).all(scope.namespace, scope.stream_id, range.start, range.end) as RawEventRow[];
  if (rows.length !== range.end - range.start + 1) conflict();
  return rows.map((row, index) => {
    const event = rawEventFromRow(row, scope);
    if (event.ledger_revision !== range.start + index) conflict();
    return event;
  });
}

function readRawSourceRefsInsideCore(
  database: DatabaseSync,
  scope: RevisionScope,
  refs: readonly SemanticEnrichmentSourceEventRef[],
  observed: RevisionVector
): ValidatedRawEvent[] {
  return refs.map((ref) => {
    if (ref.ledger_revision > observed.ledger_revision) conflict();
    const row = database.prepare(
      `SELECT namespace, stream_id, ledger_revision, event_id, source_kind,
              source_id, source_session_id, payload_json, occurred_at, created_at
       FROM cc_ledger_raw_events
       WHERE namespace = ? AND stream_id = ? AND ledger_revision = ?`
    ).get(
      scope.namespace,
      scope.stream_id,
      ref.ledger_revision
    ) as RawEventRow | undefined;
    if (row === undefined) conflict();
    const event = rawEventFromRow(row, scope);
    if (event.event_id !== ref.event_id) conflict();
    return event;
  });
}

function rawEventFromRow(row: RawEventRow, expectedScope: RevisionScope): ValidatedRawEvent {
  const scope = storedScope(row.namespace, row.stream_id);
  if (!sameScope(scope, expectedScope)) corrupt();
  if (![
    "user_input",
    "tool_result",
    "file",
    "external_observation",
  ].includes(row.source_kind)) corrupt();
  storedText(row.source_id, 2_000);
  if (row.source_session_id !== null) storedIdentifier(row.source_session_id);
  if (row.occurred_at !== null) storedTimestamp(row.occurred_at);
  storedTimestamp(row.created_at);
  return {
    ...scope,
    ledger_revision: storedPositiveRevision(row.ledger_revision),
    event_id: storedIdentifier(row.event_id),
    payload: parseStoredRawJson(row.payload_json),
  };
}

function validateStateAuthorityRefInsideCore(
  database: DatabaseSync,
  scope: RevisionScope,
  ref: SemanticStateAuthorityRef | null,
  observed: RevisionVector
): CommittedCanonicalStateRevision | undefined {
  if (observed.state_revision === 0) {
    if (ref !== null) conflict();
    return undefined;
  }
  if (ref === null || ref.state_revision !== observed.state_revision) conflict();
  const authority = readCanonicalStateAuthorityInsideCore(
    database,
    scope,
    observed.state_revision,
    observed
  ).committed;
  if (authority.state_commit_id !== ref.state_commit_id ||
      authority.state_hash !== ref.state_hash ||
      authority.policy_hash !== CANONICAL_STATE_POLICY_HASH) conflict();
  const itemIds = new Set(authority.state.items.map((item) => item.item_id));
  if (ref.required_item_ids.some((id) => !itemIds.has(id))) conflict();
  return authority;
}

function validateStoredStateAuthorityRefInsideCore(
  database: DatabaseSync,
  scope: RevisionScope,
  ref: SemanticStateAuthorityRef | null,
  observed: RevisionVector
): CommittedCanonicalStateRevision | undefined {
  try {
    return validateStateAuthorityRefInsideCore(database, scope, ref, observed);
  } catch {
    corrupt();
  }
}

function validateCoverage(
  coverage: readonly SemanticTakeoverCoverage[],
  rawEvents: readonly ValidatedRawEvent[],
  stateRef: SemanticStateAuthorityRef | null,
  state: CommittedCanonicalStateRevision | undefined,
  facts: readonly CommittedCanonicalFact[],
  relations: readonly CommittedCanonicalRelation[]
): void {
  if (coverage.length !== rawEvents.length) conflict();
  const requiredStateIds = new Set(stateRef?.required_item_ids ?? []);
  const stateById = new Map(state?.state.items.map((item) => [item.item_id, item]) ?? []);
  const factsByRef = new Map(facts.map((fact) => [factRefKey(factToRef(fact)), fact]));
  const relationsByRef = new Map(
    relations.map((relation) => [relationRefKey(relationToRef(relation)), relation])
  );
  for (let index = 0; index < coverage.length; index += 1) {
    const item = coverage[index];
    const event = rawEvents[index];
    if (item === undefined || event === undefined ||
        item.ledger_revision !== event.ledger_revision ||
        item.event_id !== event.event_id) conflict();
    if (item.disposition === "artifact_only") {
      if (item.state_item_refs.length !== 0 || item.fact_refs.length !== 0 ||
          item.relation_refs.length !== 0 || item.artifact_only_reason === undefined) {
        conflict();
      }
      continue;
    }
    if (item.artifact_only_reason !== undefined ||
        (item.state_item_refs.length === 0 && item.fact_refs.length === 0 &&
          item.relation_refs.length === 0)) conflict();
    for (const itemId of item.state_item_refs) {
      const stateItem = stateById.get(itemId);
      if (!requiredStateIds.has(itemId) || stateItem === undefined ||
          !stateItem.source_event_ids.includes(event.event_id)) conflict();
    }
    for (const ref of item.fact_refs) {
      const fact = factsByRef.get(factRefKey(ref));
      if (fact === undefined || !fact.provenance_event_ids.includes(event.event_id)) conflict();
    }
    for (const ref of item.relation_refs) {
      const relation = relationsByRef.get(relationRefKey(ref));
      if (relation === undefined ||
          !relation.provenance_event_ids.includes(event.event_id)) conflict();
    }
  }
}

function mergeFactRefs(
  existing: readonly SemanticFactRef[],
  applied: readonly SemanticFactRef[]
): SemanticFactRef[] {
  const byId = new Map<string, SemanticFactRef>();
  for (const ref of [...existing, ...applied]) {
    if (byId.has(ref.fact_id)) conflict();
    byId.set(ref.fact_id, cloneFactRef(ref));
  }
  return [...byId.values()].sort(compareFactRefs);
}

function mergeRelationRefs(
  existing: readonly SemanticRelationRef[],
  applied: readonly SemanticRelationRef[]
): SemanticRelationRef[] {
  const byId = new Map<string, SemanticRelationRef>();
  for (const ref of [...existing, ...applied]) {
    if (byId.has(ref.relation_id)) conflict();
    byId.set(ref.relation_id, cloneRelationRef(ref));
  }
  return [...byId.values()].sort(compareRelationRefs);
}

function assertTakeoverTransition(
  normalized: NormalizedSemanticTakeoverInput,
  previous: RevisionVector,
  current: RevisionVector,
  result: SemanticTakeoverCommit
): void {
  if (
    normalized.policy_hash !== SEMANTIC_TAKEOVER_POLICY_HASH ||
    normalized.compaction_artifact.expected_artifact_hash !== normalized.artifact_hash ||
    normalized.ledger_base_revision !== previous.ledger_revision ||
    normalized.expected_frontier_revision !== previous.raw_frontier_revision ||
    normalized.expected_frontier_position !== previous.frontier_position ||
    normalized.covered_raw_range.start !== previous.frontier_position + 1 ||
    normalized.covered_raw_range.end !== current.frontier_position ||
    current.ledger_revision !== previous.ledger_revision ||
    current.state_revision !== previous.state_revision ||
    current.raw_frontier_revision !== previous.raw_frontier_revision + 1 ||
    current.takeover_commit_revision !== previous.takeover_commit_revision + 1 ||
    result.previous_state_revision !== previous.state_revision ||
    result.new_state_revision !== current.state_revision ||
    result.ledger_base_revision !== previous.ledger_revision ||
    !sameRange(result.covered_raw_range, normalized.covered_raw_range) ||
    result.artifact_id !== normalized.compaction_artifact.artifact_id ||
    result.artifact_hash !== normalized.artifact_hash ||
    canonicalJson(result.coverage.map(coverageAsJson)) !==
      canonicalJson(normalized.coverage.map(coverageAsJson)) ||
    canonicalJson(result.authority_manifest.state_authority_ref === null
      ? null
      : stateRefAsJson(result.authority_manifest.state_authority_ref)) !==
      canonicalJson(normalized.state_authority_ref === null
        ? null
        : stateRefAsJson(normalized.state_authority_ref))
  ) corrupt();
}

function readTakeoverRow(
  database: DatabaseSync,
  scope: RevisionScope,
  id: string
): SemanticTakeoverRow | undefined {
  return database.prepare(
    `SELECT namespace, stream_id, takeover_commit_id, policy_hash,
            request_fingerprint, request_json, previous_revision_vector_json,
            current_revision_vector_json, authority_manifest_json, coverage_json,
            artifact_id, artifact_hash, result_json, created_at
     FROM cc_semantic_takeover_commits
     WHERE namespace = ? AND stream_id = ? AND takeover_commit_id = ?`
  ).get(scope.namespace, scope.stream_id, id) as SemanticTakeoverRow | undefined;
}

function readEnrichmentRow(
  database: DatabaseSync,
  scope: RevisionScope,
  id: string
): SemanticEnrichmentRow | undefined {
  return database.prepare(
    `SELECT namespace, stream_id, enrichment_commit_id, policy_hash,
            request_fingerprint, request_json, observed_revision_vector_json,
            source_event_refs_json, authority_manifest_json, result_json, created_at
     FROM cc_semantic_enrichment_commits
     WHERE namespace = ? AND stream_id = ? AND enrichment_commit_id = ?`
  ).get(scope.namespace, scope.stream_id, id) as SemanticEnrichmentRow | undefined;
}

function readSubstrateMarker(
  database: DatabaseSync,
  scope: RevisionScope,
  id: string
): SubstrateMarkerRow | undefined {
  return database.prepare(
    `SELECT operation, kind, request_fingerprint, request_json,
            previous_json, current_json, result_json
     FROM cc_revision_commits
     WHERE namespace = ? AND stream_id = ? AND commit_id = ?`
  ).get(scope.namespace, scope.stream_id, id) as SubstrateMarkerRow | undefined;
}

function normalizeStateAuthorityRef(value: unknown): SemanticStateAuthorityRef {
  const object = readExactObject(value, [
    "state_revision",
    "state_commit_id",
    "state_hash",
    "required_item_ids",
  ]);
  return {
    state_revision: validatePositiveRevision(object.state_revision),
    state_commit_id: validateIdentifier(object.state_commit_id),
    state_hash: validateHash(object.state_hash),
    required_item_ids: normalizeSortedIdentifiers(
      object.required_item_ids,
      0,
      MAX_AUTHORITY_REFS
    ),
  };
}

function normalizeFactRefs(value: unknown): SemanticFactRef[] {
  const values = normalizeArray(value, 0, MAX_AUTHORITY_REFS).map((entry) => {
    const object = readExactObject(entry, ["fact_id", "fact_revision"]);
    return {
      fact_id: validateIdentifier(object.fact_id),
      fact_revision: validatePositiveRevision(object.fact_revision),
    };
  }).sort(compareFactRefs);
  for (let index = 1; index < values.length; index += 1) {
    if (values[index - 1]?.fact_id === values[index]?.fact_id) invalid();
  }
  return values;
}

function normalizeRelationRefs(value: unknown): SemanticRelationRef[] {
  const values = normalizeArray(value, 0, MAX_AUTHORITY_REFS).map((entry) => {
    const object = readExactObject(entry, ["relation_id", "relation_revision"]);
    return {
      relation_id: validateIdentifier(object.relation_id),
      relation_revision: validatePositiveRevision(object.relation_revision),
    };
  }).sort(compareRelationRefs);
  for (let index = 1; index < values.length; index += 1) {
    if (values[index - 1]?.relation_id === values[index]?.relation_id) invalid();
  }
  return values;
}

function normalizeCoverage(value: unknown): SemanticTakeoverCoverage[] {
  return normalizeArray(value, 1, MAX_EVENT_REFS).map((entry) => {
    const object = readObjectShape(entry, [
      "ledger_revision",
      "event_id",
      "disposition",
      "state_item_refs",
      "fact_refs",
      "relation_refs",
    ], ["artifact_only_reason"]);
    const disposition = object.disposition;
    if (typeof disposition !== "string" ||
        !SEMANTIC_TAKEOVER_COVERAGE_DISPOSITIONS.includes(
          disposition as SemanticTakeoverCoverageDisposition
        )) invalid();
    const reason = object.artifact_only_reason;
    if (reason !== undefined && (typeof reason !== "string" ||
        !SEMANTIC_TAKEOVER_ARTIFACT_ONLY_REASONS.includes(
          reason as SemanticTakeoverArtifactOnlyReason
        ))) invalid();
    const normalized: SemanticTakeoverCoverage = {
      ledger_revision: validatePositiveRevision(object.ledger_revision),
      event_id: validateIdentifier(object.event_id),
      disposition: disposition as SemanticTakeoverCoverageDisposition,
      state_item_refs: normalizeSortedIdentifiers(
        object.state_item_refs,
        0,
        MAX_AUTHORITY_REFS
      ),
      fact_refs: normalizeFactRefs(object.fact_refs),
      relation_refs: normalizeRelationRefs(object.relation_refs),
      ...(reason === undefined
        ? {}
        : { artifact_only_reason: reason as SemanticTakeoverArtifactOnlyReason }),
    };
    if (normalized.disposition === "artifact_only") {
      if (normalized.artifact_only_reason === undefined ||
          normalized.state_item_refs.length !== 0 ||
          normalized.fact_refs.length !== 0 ||
          normalized.relation_refs.length !== 0) invalid();
    } else if (normalized.artifact_only_reason !== undefined ||
        (normalized.state_item_refs.length === 0 && normalized.fact_refs.length === 0 &&
          normalized.relation_refs.length === 0)) invalid();
    return normalized;
  });
}

function normalizeArtifactInput(value: unknown): CompactionArtifactInput {
  const object = readExactObject(value, [
    "artifact_id",
    "expected_artifact_hash",
    "generator_version",
    "body",
  ]);
  const body = normalizeJsonValue(object.body);
  if (Buffer.byteLength(canonicalJson(body), "utf8") > MAX_ARTIFACT_BODY_BYTES) invalid();
  return {
    artifact_id: validateIdentifier(object.artifact_id),
    expected_artifact_hash: validateHash(object.expected_artifact_hash),
    generator_version: validateText(object.generator_version, MAX_GENERATOR_VERSION_LENGTH),
    body,
  };
}

function normalizeRange(value: unknown): { start: number; end: number } {
  const object = readExactObject(value, ["start", "end"]);
  const start = validatePositiveRevision(object.start);
  const end = validatePositiveRevision(object.end);
  if (end < start || end - start + 1 > MAX_EVENT_REFS) invalid();
  return { start, end };
}

function normalizeSourceEventRefs(value: unknown): SemanticEnrichmentSourceEventRef[] {
  const refs = normalizeArray(value, 1, MAX_EVENT_REFS).map((entry) => {
    const object = readExactObject(entry, ["ledger_revision", "event_id"]);
    return {
      ledger_revision: validatePositiveRevision(object.ledger_revision),
      event_id: validateIdentifier(object.event_id),
    };
  }).sort((left, right) => left.ledger_revision - right.ledger_revision);
  for (let index = 1; index < refs.length; index += 1) {
    if (refs[index - 1]?.ledger_revision === refs[index]?.ledger_revision ||
        refs[index - 1]?.event_id === refs[index]?.event_id) invalid();
  }
  return refs;
}

function takeoverInputAsJson(input: SemanticTakeoverCommitInput): JsonObject {
  return {
    scope: scopeAsJson(input.scope),
    takeover_commit_id: input.takeover_commit_id,
    ledger_base_revision: input.ledger_base_revision,
    covered_raw_range: rangeAsJson(input.covered_raw_range),
    expected_frontier_revision: input.expected_frontier_revision,
    expected_frontier_position: input.expected_frontier_position,
    state_authority_ref: input.state_authority_ref === null
      ? null
      : stateRefAsJson(input.state_authority_ref),
    existing_fact_refs: input.existing_fact_refs.map(factRefAsJson),
    existing_relation_refs: input.existing_relation_refs.map(relationRefAsJson),
    ...(input.fact_relation_apply === undefined
      ? {}
      : { fact_relation_apply: normalizeJsonValue(input.fact_relation_apply) }),
    coverage: input.coverage.map(coverageAsJson),
    compaction_artifact: artifactInputAsJson(input.compaction_artifact),
    policy_hash: input.policy_hash,
    provenance_event_ids: [...input.provenance_event_ids],
  };
}

function enrichmentInputAsJson(input: SemanticEnrichmentCommitInput): JsonObject {
  return {
    scope: scopeAsJson(input.scope),
    enrichment_commit_id: input.enrichment_commit_id,
    source_event_refs: input.source_event_refs.map(sourceEventRefAsJson),
    state_authority_ref: input.state_authority_ref === null
      ? null
      : stateRefAsJson(input.state_authority_ref),
    existing_fact_refs: input.existing_fact_refs.map(factRefAsJson),
    existing_relation_refs: input.existing_relation_refs.map(relationRefAsJson),
    fact_relation_apply: normalizeJsonValue(input.fact_relation_apply),
    policy_hash: input.policy_hash,
    provenance_event_ids: [...input.provenance_event_ids],
  };
}

function takeoverSubstrateRequestAsJson(
  input: NormalizedSemanticTakeoverInput
): JsonObject {
  return {
    scope: scopeAsJson(input.scope),
    commit_id: input.takeover_commit_id,
    operation: "TAKEOVER_FRONTIER",
    kind: "SEMANTIC_TAKEOVER_COMMIT_V1",
    request: cloneJsonObject(input.request),
    expected_frontier_revision: input.expected_frontier_revision,
    expected_frontier_position: input.expected_frontier_position,
    next_frontier_position: input.covered_raw_range.end,
  };
}

function takeoverResultAsJson(result: SemanticTakeoverCommit): JsonObject {
  return {
    namespace: result.namespace,
    stream_id: result.stream_id,
    takeover_commit_id: result.takeover_commit_id,
    policy_hash: result.policy_hash,
    ledger_base_revision: result.ledger_base_revision,
    covered_raw_range: rangeAsJson(result.covered_raw_range),
    previous_revision_vector: vectorAsJson(result.previous_revision_vector),
    current_revision_vector: vectorAsJson(result.current_revision_vector),
    previous_state_revision: result.previous_state_revision,
    new_state_revision: result.new_state_revision,
    authority_manifest: authorityManifestAsJson(result.authority_manifest),
    coverage: result.coverage.map(coverageAsJson),
    artifact_id: result.artifact_id,
    artifact_hash: result.artifact_hash,
    created_at: result.created_at,
  };
}

function enrichmentResultAsJson(result: SemanticEnrichmentCommit): JsonObject {
  return {
    namespace: result.namespace,
    stream_id: result.stream_id,
    enrichment_commit_id: result.enrichment_commit_id,
    policy_hash: result.policy_hash,
    observed_revision_vector: vectorAsJson(result.observed_revision_vector),
    source_event_refs: result.source_event_refs.map(sourceEventRefAsJson),
    authority_manifest: authorityManifestAsJson(result.authority_manifest),
    created_at: result.created_at,
  };
}

function authorityManifestAsJson(manifest: SemanticAuthorityManifest): JsonObject {
  return {
    state_authority_ref: manifest.state_authority_ref === null
      ? null
      : stateRefAsJson(manifest.state_authority_ref),
    fact_refs: manifest.fact_refs.map(factRefAsJson),
    relation_refs: manifest.relation_refs.map(relationRefAsJson),
    ...(manifest.fact_relation_authority_commit_id === undefined
      ? {}
      : { fact_relation_authority_commit_id: manifest.fact_relation_authority_commit_id }),
  };
}

function coverageAsJson(coverage: SemanticTakeoverCoverage): JsonObject {
  return {
    ledger_revision: coverage.ledger_revision,
    event_id: coverage.event_id,
    disposition: coverage.disposition,
    state_item_refs: [...coverage.state_item_refs],
    fact_refs: coverage.fact_refs.map(factRefAsJson),
    relation_refs: coverage.relation_refs.map(relationRefAsJson),
    ...(coverage.artifact_only_reason === undefined
      ? {}
      : { artifact_only_reason: coverage.artifact_only_reason }),
  };
}

function stateRefAsJson(ref: SemanticStateAuthorityRef): JsonObject {
  return {
    state_revision: ref.state_revision,
    state_commit_id: ref.state_commit_id,
    state_hash: ref.state_hash,
    required_item_ids: [...ref.required_item_ids],
  };
}

function factRefAsJson(ref: SemanticFactRef): JsonObject {
  return { fact_id: ref.fact_id, fact_revision: ref.fact_revision };
}

function relationRefAsJson(ref: SemanticRelationRef): JsonObject {
  return { relation_id: ref.relation_id, relation_revision: ref.relation_revision };
}

function sourceEventRefAsJson(ref: SemanticEnrichmentSourceEventRef): JsonObject {
  return { ledger_revision: ref.ledger_revision, event_id: ref.event_id };
}

function artifactInputAsJson(input: CompactionArtifactInput): JsonObject {
  return {
    artifact_id: input.artifact_id,
    expected_artifact_hash: input.expected_artifact_hash,
    generator_version: input.generator_version,
    body: cloneJson(input.body),
  };
}

function scopeAsJson(scope: RevisionScope): JsonObject {
  return { namespace: scope.namespace, stream_id: scope.stream_id };
}

function rangeAsJson(range: { start: number; end: number }): JsonObject {
  return { start: range.start, end: range.end };
}

function vectorAsJson(vector: RevisionVector): JsonObject {
  return {
    namespace: vector.namespace,
    stream_id: vector.stream_id,
    ledger_revision: vector.ledger_revision,
    state_revision: vector.state_revision,
    raw_frontier_revision: vector.raw_frontier_revision,
    frontier_position: vector.frontier_position,
    takeover_commit_revision: vector.takeover_commit_revision,
  };
}

function parseStoredTakeoverInput(json: string): NormalizedSemanticTakeoverInput {
  try {
    const normalized = normalizeSemanticTakeoverInput(JSON.parse(json));
    if (canonicalJson(normalized.request) !== json) corrupt();
    return normalized;
  } catch (error) {
    if (error instanceof SemanticTakeoverError && error.code === "CORRUPT_DATA") throw error;
    corrupt();
  }
}

function parseStoredEnrichmentInput(json: string): NormalizedSemanticEnrichmentInput {
  try {
    const normalized = normalizeSemanticEnrichmentInput(JSON.parse(json));
    if (canonicalJson(normalized.request) !== json) corrupt();
    return normalized;
  } catch (error) {
    if (error instanceof SemanticTakeoverError && error.code === "CORRUPT_DATA") throw error;
    corrupt();
  }
}

function parseStoredAuthorityManifest(json: string): SemanticAuthorityManifest {
  try {
    const value = JSON.parse(json) as unknown;
    const object = readObjectShape(value, [
      "state_authority_ref",
      "fact_refs",
      "relation_refs",
    ], ["fact_relation_authority_commit_id"]);
    const manifest: SemanticAuthorityManifest = {
      state_authority_ref: object.state_authority_ref === null
        ? null
        : normalizeStateAuthorityRef(object.state_authority_ref),
      fact_refs: normalizeFactRefs(object.fact_refs),
      relation_refs: normalizeRelationRefs(object.relation_refs),
      ...(object.fact_relation_authority_commit_id === undefined
        ? {}
        : {
            fact_relation_authority_commit_id: validateIdentifier(
              object.fact_relation_authority_commit_id
            ),
          }),
    };
    if (canonicalJson(authorityManifestAsJson(manifest)) !== json) corrupt();
    return manifest;
  } catch (error) {
    if (error instanceof SemanticTakeoverError && error.code === "CORRUPT_DATA") throw error;
    corrupt();
  }
}

function parseStoredCoverage(json: string): SemanticTakeoverCoverage[] {
  try {
    const coverage = normalizeCoverage(JSON.parse(json));
    if (canonicalJson(coverage.map(coverageAsJson)) !== json) corrupt();
    return coverage;
  } catch (error) {
    if (error instanceof SemanticTakeoverError && error.code === "CORRUPT_DATA") throw error;
    corrupt();
  }
}

function parseStoredSourceEventRefs(json: string): SemanticEnrichmentSourceEventRef[] {
  try {
    const refs = normalizeSourceEventRefs(JSON.parse(json));
    if (canonicalJson(refs.map(sourceEventRefAsJson)) !== json) corrupt();
    return refs;
  } catch (error) {
    if (error instanceof SemanticTakeoverError && error.code === "CORRUPT_DATA") throw error;
    corrupt();
  }
}

function parseStoredTakeoverResult(
  json: string,
  expectedScope: RevisionScope
): SemanticTakeoverCommit {
  try {
    const object = readExactObject(JSON.parse(json), [
      "namespace",
      "stream_id",
      "takeover_commit_id",
      "policy_hash",
      "ledger_base_revision",
      "covered_raw_range",
      "previous_revision_vector",
      "current_revision_vector",
      "previous_state_revision",
      "new_state_revision",
      "authority_manifest",
      "coverage",
      "artifact_id",
      "artifact_hash",
      "created_at",
    ]);
    const scope = normalizeScope({
      namespace: object.namespace,
      stream_id: object.stream_id,
    });
    if (!sameScope(scope, expectedScope)) corrupt();
    const result: SemanticTakeoverCommit = {
      ...scope,
      takeover_commit_id: validateIdentifier(object.takeover_commit_id),
      policy_hash: validateHash(object.policy_hash),
      ledger_base_revision: validateRevision(object.ledger_base_revision),
      covered_raw_range: normalizeRange(object.covered_raw_range),
      previous_revision_vector: normalizeVector(object.previous_revision_vector, scope),
      current_revision_vector: normalizeVector(object.current_revision_vector, scope),
      previous_state_revision: validateRevision(object.previous_state_revision),
      new_state_revision: validateRevision(object.new_state_revision),
      authority_manifest: parseAuthorityManifestValue(object.authority_manifest),
      coverage: normalizeCoverage(object.coverage),
      artifact_id: validateIdentifier(object.artifact_id),
      artifact_hash: validateHash(object.artifact_hash),
      created_at: validateTimestamp(object.created_at),
    };
    if (canonicalJson(takeoverResultAsJson(result)) !== json) corrupt();
    return result;
  } catch (error) {
    if (error instanceof SemanticTakeoverError && error.code === "CORRUPT_DATA") throw error;
    corrupt();
  }
}

function parseStoredEnrichmentResult(
  json: string,
  expectedScope: RevisionScope
): SemanticEnrichmentCommit {
  try {
    const object = readExactObject(JSON.parse(json), [
      "namespace",
      "stream_id",
      "enrichment_commit_id",
      "policy_hash",
      "observed_revision_vector",
      "source_event_refs",
      "authority_manifest",
      "created_at",
    ]);
    const scope = normalizeScope({
      namespace: object.namespace,
      stream_id: object.stream_id,
    });
    if (!sameScope(scope, expectedScope)) corrupt();
    const result: SemanticEnrichmentCommit = {
      ...scope,
      enrichment_commit_id: validateIdentifier(object.enrichment_commit_id),
      policy_hash: validateHash(object.policy_hash),
      observed_revision_vector: normalizeVector(object.observed_revision_vector, scope),
      source_event_refs: normalizeSourceEventRefs(object.source_event_refs),
      authority_manifest: parseAuthorityManifestValue(object.authority_manifest),
      created_at: validateTimestamp(object.created_at),
    };
    if (canonicalJson(enrichmentResultAsJson(result)) !== json) corrupt();
    return result;
  } catch (error) {
    if (error instanceof SemanticTakeoverError && error.code === "CORRUPT_DATA") throw error;
    corrupt();
  }
}

function parseAuthorityManifestValue(value: unknown): SemanticAuthorityManifest {
  const object = readObjectShape(value, [
    "state_authority_ref",
    "fact_refs",
    "relation_refs",
  ], ["fact_relation_authority_commit_id"]);
  return {
    state_authority_ref: object.state_authority_ref === null
      ? null
      : normalizeStateAuthorityRef(object.state_authority_ref),
    fact_refs: normalizeFactRefs(object.fact_refs),
    relation_refs: normalizeRelationRefs(object.relation_refs),
    ...(object.fact_relation_authority_commit_id === undefined
      ? {}
      : {
          fact_relation_authority_commit_id: validateIdentifier(
            object.fact_relation_authority_commit_id
          ),
        }),
  };
}

function parseStoredVector(json: string, scope: RevisionScope): RevisionVector {
  try {
    const vector = normalizeVector(JSON.parse(json), scope);
    if (canonicalJson(vectorAsJson(vector)) !== json) corrupt();
    return vector;
  } catch (error) {
    if (error instanceof SemanticTakeoverError && error.code === "CORRUPT_DATA") throw error;
    corrupt();
  }
}

function parseStoredRange(json: string): { start: number; end: number } {
  try {
    const range = normalizeRange(JSON.parse(json));
    if (canonicalJson(rangeAsJson(range)) !== json) corrupt();
    return range;
  } catch (error) {
    if (error instanceof SemanticTakeoverError && error.code === "CORRUPT_DATA") throw error;
    corrupt();
  }
}

function parseStoredOrderedIdentifiers(
  json: string,
  minimum: number,
  maximum: number
): string[] {
  try {
    const ids = normalizeOrderedIdentifiers(JSON.parse(json), minimum, maximum);
    if (canonicalJson(ids) !== json) corrupt();
    return ids;
  } catch (error) {
    if (error instanceof SemanticTakeoverError && error.code === "CORRUPT_DATA") throw error;
    corrupt();
  }
}

function parseStoredJson(json: string): JsonValue {
  try {
    const value = normalizeJsonValue(JSON.parse(json));
    if (canonicalJson(value) !== json) corrupt();
    return value;
  } catch (error) {
    if (error instanceof SemanticTakeoverError && error.code === "CORRUPT_DATA") throw error;
    corrupt();
  }
}

function parseStoredRawJson(json: string): JsonValue {
  try {
    const value = normalizeRawJsonValue(JSON.parse(json));
    if (JSON.stringify(value) !== json) corrupt();
    return value;
  } catch (error) {
    if (error instanceof SemanticTakeoverError && error.code === "CORRUPT_DATA") throw error;
    corrupt();
  }
}

function normalizeRawJsonValue(
  value: unknown,
  ancestors = new Set<object>()
): JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value) || Object.is(value, -0)) invalid();
    return value;
  }
  if (typeof value !== "object" || ancestors.has(value)) invalid();
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      assertDensePlainArray(value);
      return value.map((entry) => normalizeRawJsonValue(entry, ancestors));
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) invalid();
    const keys = Reflect.ownKeys(value);
    if (keys.some((key) => typeof key !== "string")) invalid();
    const result: JsonObject = {};
    for (const key of (keys as string[]).sort()) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor?.enumerable || !("value" in descriptor)) invalid();
      Object.defineProperty(result, key, {
        configurable: true,
        enumerable: true,
        writable: true,
        value: normalizeRawJsonValue(descriptor.value, ancestors),
      });
    }
    return result;
  } finally {
    ancestors.delete(value);
  }
}

function parseStoredJsonObject(json: string): JsonObject {
  const value = parseStoredJson(json);
  if (value === null || typeof value !== "object" || Array.isArray(value)) corrupt();
  return value;
}

function normalizeScope(value: unknown): RevisionScope {
  const object = readExactObject(value, ["namespace", "stream_id"]);
  const namespace = validateIdentifier(object.namespace);
  if (!(namespace === AUTHORITY_NAMESPACE ||
      (namespace.startsWith(SHADOW_NAMESPACE_PREFIX) &&
        namespace.slice(SHADOW_NAMESPACE_PREFIX.length).trim().length > 0))) invalid();
  return {
    namespace,
    stream_id: validateIdentifier(object.stream_id),
  };
}

function normalizeVector(value: unknown, expectedScope: RevisionScope): RevisionVector {
  const object = readExactObject(value, [
    "namespace",
    "stream_id",
    "ledger_revision",
    "state_revision",
    "raw_frontier_revision",
    "frontier_position",
    "takeover_commit_revision",
  ]);
  const scope = normalizeScope({ namespace: object.namespace, stream_id: object.stream_id });
  if (!sameScope(scope, expectedScope)) invalid();
  const vector: RevisionVector = {
    ...scope,
    ledger_revision: validateRevision(object.ledger_revision),
    state_revision: validateRevision(object.state_revision),
    raw_frontier_revision: validateRevision(object.raw_frontier_revision),
    frontier_position: validateRevision(object.frontier_position),
    takeover_commit_revision: validateRevision(object.takeover_commit_revision),
  };
  if (vector.frontier_position > vector.ledger_revision) invalid();
  return vector;
}

function readLiveVector(database: DatabaseSync, scope: RevisionScope): RevisionVector {
  const row = database.prepare(
    `SELECT namespace, stream_id, ledger_revision, state_revision,
            raw_frontier_revision, frontier_position, takeover_commit_revision
     FROM cc_revision_streams
     WHERE namespace = ? AND stream_id = ?`
  ).get(scope.namespace, scope.stream_id) as StreamRow | undefined;
  if (row === undefined) corrupt();
  return storedVectorFromRow(row, scope);
}

function readOptionalLiveVector(database: DatabaseSync, scope: RevisionScope): RevisionVector {
  const row = database.prepare(
    `SELECT namespace, stream_id, ledger_revision, state_revision,
            raw_frontier_revision, frontier_position, takeover_commit_revision
     FROM cc_revision_streams
     WHERE namespace = ? AND stream_id = ?`
  ).get(scope.namespace, scope.stream_id) as StreamRow | undefined;
  return row === undefined ? zeroVector(scope) : storedVectorFromRow(row, scope);
}

function storedVectorFromRow(row: StreamRow, expectedScope: RevisionScope): RevisionVector {
  try {
    return normalizeVector({
      namespace: row.namespace,
      stream_id: row.stream_id,
      ledger_revision: row.ledger_revision,
      state_revision: row.state_revision,
      raw_frontier_revision: row.raw_frontier_revision,
      frontier_position: row.frontier_position,
      takeover_commit_revision: row.takeover_commit_revision,
    }, expectedScope);
  } catch {
    corrupt();
  }
}

function zeroVector(scope: RevisionScope): RevisionVector {
  return {
    ...scope,
    ledger_revision: 0,
    state_revision: 0,
    raw_frontier_revision: 0,
    frontier_position: 0,
    takeover_commit_revision: 0,
  };
}

function normalizeArray(value: unknown, minimum: number, maximum: number): unknown[] {
  if (!Array.isArray(value)) invalid();
  assertDensePlainArray(value);
  if (value.length < minimum || value.length > maximum) invalid();
  return value;
}

function normalizeSortedIdentifiers(
  value: unknown,
  minimum: number,
  maximum: number
): string[] {
  const ids = normalizeArray(value, minimum, maximum).map(validateIdentifier).sort();
  assertUniqueStrings(ids);
  return ids;
}

function normalizeOrderedIdentifiers(
  value: unknown,
  minimum: number,
  maximum: number
): string[] {
  const ids = normalizeArray(value, minimum, maximum).map(validateIdentifier);
  assertUniqueStrings([...ids].sort());
  return ids;
}

function assertUniqueStrings(values: readonly string[]): void {
  for (let index = 1; index < values.length; index += 1) {
    if (values[index - 1] === values[index]) invalid();
  }
}

function validateIdentifier(value: unknown): string {
  return validateText(value, MAX_IDENTIFIER_LENGTH);
}

function validateText(value: unknown, maximum: number): string {
  if (typeof value !== "string" || value.length === 0 || value.length > maximum ||
      value.trim().length === 0 || value !== value.normalize("NFC") || /\p{Cc}/u.test(value)) {
    invalid();
  }
  return value;
}

function validateHash(value: unknown): string {
  if (typeof value !== "string" || !HASH_PATTERN.test(value)) invalid();
  return value;
}

function validateRevision(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0 ||
      (value as number) > MAX_SAFE_REVISION) invalid();
  return value as number;
}

function validatePositiveRevision(value: unknown): number {
  const revision = validateRevision(value);
  if (revision === 0) invalid();
  return revision;
}

function validateTimestamp(value: unknown): string {
  if (typeof value !== "string" || value.length > 100) invalid();
  try {
    if (new Date(value).toISOString() !== value) invalid();
  } catch {
    invalid();
  }
  return value;
}

function readExactObject(value: unknown, required: readonly string[]): Record<string, unknown> {
  return readObjectShape(value, required, []);
}

function readObjectShape(
  value: unknown,
  required: readonly string[],
  optional: readonly string[]
): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) invalid();
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) invalid();
  const allowed = new Set([...required, ...optional]);
  const keys = Reflect.ownKeys(value);
  if (keys.length > MAX_JSON_KEYS) invalid();
  for (const key of keys) {
    if (typeof key !== "string" || !allowed.has(key)) invalid();
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor?.enumerable || !("value" in descriptor)) invalid();
  }
  for (const key of required) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) invalid();
  }
  return value as Record<string, unknown>;
}

function assertDensePlainArray(value: unknown[]): void {
  if (Object.getPrototypeOf(value) !== Array.prototype) invalid();
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.prototype.hasOwnProperty.call(value, index)) invalid();
    const descriptor = Object.getOwnPropertyDescriptor(value, index);
    if (!descriptor?.enumerable || !("value" in descriptor)) invalid();
  }
  const ownKeys = Reflect.ownKeys(value);
  if (ownKeys.some((key) => typeof key === "symbol" ||
      (key !== "length" && !/^\d+$/u.test(key as string)))) invalid();
}

function normalizeJsonValue(
  value: unknown,
  depth = 0,
  ancestors = new Set<object>()
): JsonValue {
  if (depth > MAX_JSON_DEPTH) invalid();
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "string") {
    if (value !== value.normalize("NFC") || /\p{Cc}/u.test(value)) invalid();
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value) || Object.is(value, -0)) invalid();
    return value;
  }
  if (typeof value !== "object" || ancestors.has(value)) invalid();
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      assertDensePlainArray(value);
      return value.map((entry) => normalizeJsonValue(entry, depth + 1, ancestors));
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) invalid();
    const keys = Reflect.ownKeys(value);
    if (keys.length > MAX_JSON_KEYS || keys.some((key) => typeof key !== "string")) invalid();
    const result: JsonObject = {};
    for (const key of (keys as string[]).sort()) {
      if (key !== key.normalize("NFC") || /\p{Cc}/u.test(key)) invalid();
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor?.enumerable || !("value" in descriptor)) invalid();
      Object.defineProperty(result, key, {
        configurable: true,
        enumerable: true,
        writable: true,
        value: normalizeJsonValue(descriptor.value, depth + 1, ancestors),
      });
    }
    return result;
  } finally {
    ancestors.delete(value);
  }
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(normalizeJsonValue(value));
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function cloneJson(value: JsonValue): JsonValue {
  return normalizeJsonValue(value);
}

function cloneJsonObject(value: JsonObject): JsonObject {
  const cloned = normalizeJsonValue(value);
  if (cloned === null || typeof cloned !== "object" || Array.isArray(cloned)) invalid();
  return cloned;
}

function cloneFactRelationInput(
  value: NormalizedCanonicalFactRelationCommitInput
): CanonicalFactRelationCommitInput {
  return JSON.parse(canonicalJson(value.request)) as CanonicalFactRelationCommitInput;
}

function cloneStateRef(
  ref: SemanticStateAuthorityRef | null
): SemanticStateAuthorityRef | null {
  return ref === null ? null : {
    ...ref,
    required_item_ids: [...ref.required_item_ids],
  };
}

function cloneFactRef(ref: SemanticFactRef): SemanticFactRef {
  return { ...ref };
}

function cloneRelationRef(ref: SemanticRelationRef): SemanticRelationRef {
  return { ...ref };
}

function cloneSourceEventRef(
  ref: SemanticEnrichmentSourceEventRef
): SemanticEnrichmentSourceEventRef {
  return { ...ref };
}

function cloneArtifactInput(input: CompactionArtifactInput): CompactionArtifactInput {
  return { ...input, body: cloneJson(input.body) };
}

function cloneCoverage(coverage: SemanticTakeoverCoverage): SemanticTakeoverCoverage {
  return {
    ...coverage,
    state_item_refs: [...coverage.state_item_refs],
    fact_refs: coverage.fact_refs.map(cloneFactRef),
    relation_refs: coverage.relation_refs.map(cloneRelationRef),
  };
}

function cloneAuthorityManifest(manifest: SemanticAuthorityManifest): SemanticAuthorityManifest {
  return {
    state_authority_ref: cloneStateRef(manifest.state_authority_ref),
    fact_refs: manifest.fact_refs.map(cloneFactRef),
    relation_refs: manifest.relation_refs.map(cloneRelationRef),
    ...(manifest.fact_relation_authority_commit_id === undefined
      ? {}
      : { fact_relation_authority_commit_id: manifest.fact_relation_authority_commit_id }),
  };
}

function cloneTakeover(result: SemanticTakeoverCommit): SemanticTakeoverCommit {
  return {
    ...result,
    covered_raw_range: cloneRange(result.covered_raw_range),
    previous_revision_vector: cloneVector(result.previous_revision_vector),
    current_revision_vector: cloneVector(result.current_revision_vector),
    authority_manifest: cloneAuthorityManifest(result.authority_manifest),
    coverage: result.coverage.map(cloneCoverage),
  };
}

function cloneEnrichment(result: SemanticEnrichmentCommit): SemanticEnrichmentCommit {
  return {
    ...result,
    observed_revision_vector: cloneVector(result.observed_revision_vector),
    source_event_refs: result.source_event_refs.map(cloneSourceEventRef),
    authority_manifest: cloneAuthorityManifest(result.authority_manifest),
  };
}

function cloneVector(vector: RevisionVector): RevisionVector {
  return { ...vector };
}

function cloneRange(range: { start: number; end: number }): { start: number; end: number } {
  return { ...range };
}

function factToRef(fact: CommittedCanonicalFact): SemanticFactRef {
  return { fact_id: fact.fact_id, fact_revision: fact.fact_revision };
}

function relationToRef(relation: CommittedCanonicalRelation): SemanticRelationRef {
  return { relation_id: relation.relation_id, relation_revision: relation.relation_revision };
}

function factRefKey(ref: SemanticFactRef): string {
  return `${ref.fact_id}\u0000${ref.fact_revision}`;
}

function relationRefKey(ref: SemanticRelationRef): string {
  return `${ref.relation_id}\u0000${ref.relation_revision}`;
}

function compareFactRefs(left: SemanticFactRef, right: SemanticFactRef): number {
  return left.fact_id < right.fact_id ? -1 : left.fact_id > right.fact_id ? 1 :
    left.fact_revision - right.fact_revision;
}

function compareRelationRefs(left: SemanticRelationRef, right: SemanticRelationRef): number {
  return left.relation_id < right.relation_id ? -1 : left.relation_id > right.relation_id ? 1 :
    left.relation_revision - right.relation_revision;
}

function sameScope(left: RevisionScope, right: RevisionScope): boolean {
  return left.namespace === right.namespace && left.stream_id === right.stream_id;
}

function sameVector(left: RevisionVector, right: RevisionVector): boolean {
  return canonicalJson(vectorAsJson(left)) === canonicalJson(vectorAsJson(right));
}

function sameRange(
  left: { start: number; end: number },
  right: { start: number; end: number }
): boolean {
  return left.start === right.start && left.end === right.end;
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function vectorAtOrAfter(live: RevisionVector, historical: RevisionVector): boolean {
  return sameScope(live, historical) &&
    live.ledger_revision >= historical.ledger_revision &&
    live.state_revision >= historical.state_revision &&
    live.raw_frontier_revision >= historical.raw_frontier_revision &&
    live.frontier_position >= historical.frontier_position &&
    live.takeover_commit_revision >= historical.takeover_commit_revision;
}

function increment(value: number): number {
  if (value >= MAX_SAFE_REVISION) conflict();
  return value + 1;
}

function storedScope(namespace: unknown, streamId: unknown): RevisionScope {
  try {
    return normalizeScope({ namespace, stream_id: streamId });
  } catch {
    corrupt();
  }
}

function storedIdentifier(value: unknown): string {
  try {
    return validateIdentifier(value);
  } catch {
    corrupt();
  }
}

function storedText(value: unknown, maximum: number): string {
  try {
    return validateText(value, maximum);
  } catch {
    corrupt();
  }
}

function storedHash(value: unknown): string {
  try {
    return validateHash(value);
  } catch {
    corrupt();
  }
}

function storedTimestamp(value: unknown): string {
  try {
    return validateTimestamp(value);
  } catch {
    corrupt();
  }
}

function storedPositiveRevision(value: unknown): number {
  try {
    return validatePositiveRevision(value);
  } catch {
    corrupt();
  }
}

function validateSemanticSchema(database: DatabaseSync): void {
  assertTableColumns(database, "cc_semantic_authority_schema", ["version", "completed_at"]);
  assertTableColumns(database, "cc_semantic_takeover_commits", [
    "namespace", "stream_id", "takeover_commit_id", "policy_hash",
    "request_fingerprint", "request_json", "previous_revision_vector_json",
    "current_revision_vector_json", "authority_manifest_json", "coverage_json",
    "artifact_id", "artifact_hash", "result_json", "created_at",
  ]);
  assertTableColumns(database, "cc_semantic_enrichment_commits", [
    "namespace", "stream_id", "enrichment_commit_id", "policy_hash",
    "request_fingerprint", "request_json", "observed_revision_vector_json",
    "source_event_refs_json", "authority_manifest_json", "result_json", "created_at",
  ]);
  assertTableColumns(database, "cc_compaction_artifacts", [
    "namespace", "stream_id", "artifact_id", "artifact_hash",
    "covered_raw_range_json", "generator_version", "policy_hash",
    "provenance_event_ids_json", "descriptor_json", "body_json", "created_at",
  ]);
  for (const expected of SEMANTIC_SCHEMA_OBJECTS) {
    const row = database.prepare(
      "SELECT type, name, sql FROM sqlite_master WHERE type = ? AND name = ?"
    ).get(expected.type, expected.name) as {
      type: string;
      name: string;
      sql: string | null;
    } | undefined;
    if (row?.type !== expected.type || row.name !== expected.name ||
        typeof row.sql !== "string" ||
        normalizeSchemaSql(row.sql) !== normalizeSchemaSql(expected.sql)) corrupt();
  }
}

function assertSemanticSchemaVersion(database: DatabaseSync): void {
  const rows = database.prepare(
    "SELECT version FROM cc_semantic_authority_schema ORDER BY version"
  ).all() as Array<{ version: number }>;
  if (rows.length !== 1 || rows[0]?.version !== SEMANTIC_AUTHORITY_SCHEMA_VERSION) corrupt();
}

function assertTableColumns(
  database: DatabaseSync,
  table: string,
  expected: readonly string[]
): void {
  const rows = database.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (rows.length !== expected.length ||
      rows.some((row, index) => row.name !== expected[index])) corrupt();
}

function sqliteObjectExists(
  database: DatabaseSync,
  type: "table" | "trigger",
  name: string
): boolean {
  const row = database.prepare(
    "SELECT name FROM sqlite_master WHERE type = ? AND name = ?"
  ).get(type, name) as { name: string } | undefined;
  return row?.name === name;
}

function normalizeSchemaSql(sql: string): string {
  return sql.replace(/\s+/gu, " ").replace(/\s*([(),])\s*/gu, "$1").trim();
}

function rollback(database: DatabaseSync): void {
  try { database.exec("ROLLBACK;"); } catch { /* preserve original failure */ }
}

function invalid(): never {
  throw new SemanticTakeoverError("INVALID_INPUT");
}

function notFound(): never {
  throw new SemanticTakeoverError("NOT_FOUND");
}

function conflict(): never {
  throw new SemanticTakeoverError("CONFLICT");
}

function corrupt(): never {
  throw new SemanticTakeoverError("CORRUPT_DATA");
}
