import type { ContextItem, StateRelation } from "./state-types.js";

export const SESSION_SCOPE_CONTRACT_VERSION = "ripplecontext-session-scope/v1" as const;
export const SCOPE_OVERLAY_KEY_METADATA = "ripplecontext_scope_key" as const;
export const CORE_SESSION_NAMESPACE = "authority" as const;

export interface SessionRef {
  namespace: string;
  session_id: string;
}

export type SessionReadFrontier =
  | { kind: "CURRENT" }
  | { kind: "FROZEN"; raw_sequence: number; state_revision: number };

export interface SessionScopeEntry {
  session: SessionRef;
  frontier: SessionReadFrontier;
  precedence: number;
}

export interface SessionScope {
  contract_version: typeof SESSION_SCOPE_CONTRACT_VERSION;
  write_session: SessionRef;
  read_scope: SessionScopeEntry[];
}

export interface ScopedStateEntry {
  scope_entry: SessionScopeEntry;
  items: ContextItem[];
  relations: StateRelation[];
}

export interface ScopedStateProjection {
  items: ContextItem[];
  relations: StateRelation[];
  revisions: Array<{ session_id: string; revision: number }>;
}

export class SessionScopeValidationError extends Error {
  constructor() {
    super("Invalid Session Scope");
    this.name = "SessionScopeValidationError";
  }
}

const MAX_IDENTIFIER_LENGTH = 500;
const MAX_SCOPE_DEPTH = 64;

export function singleSessionScope(sessionId: string): SessionScope {
  // Legacy single-session Core calls historically accept every non-empty text
  // identity (including whitespace and long ids). Keep that compatibility
  // surface separate from the stricter explicit multi-Session contract.
  if (typeof sessionId !== "string" || sessionId.length === 0) invalid();
  const session: SessionRef = { namespace: "authority", session_id: sessionId };
  return {
    contract_version: SESSION_SCOPE_CONTRACT_VERSION,
    write_session: { ...session },
    read_scope: [{ session: { ...session }, frontier: { kind: "CURRENT" }, precedence: 0 }],
  };
}

export function normalizeSessionScope(value: unknown): SessionScope {
  const scope = exactObject(value, ["contract_version", "write_session", "read_scope"]);
  if (scope.contract_version !== SESSION_SCOPE_CONTRACT_VERSION || !Array.isArray(scope.read_scope)) invalid();
  const writeSession = normalizeSessionRef(scope.write_session);
  const values = arrayValues(scope.read_scope);
  if (values.length < 1 || values.length > MAX_SCOPE_DEPTH) invalid();
  const entries = values.map((entryValue, index) => {
    const entry = exactObject(entryValue, ["session", "frontier", "precedence"]);
    const session = normalizeSessionRef(entry.session);
    if (entry.precedence !== index) invalid();
    const frontierObject = exactObject(
      entry.frontier,
      ownDataValue(entry.frontier, "kind") === "CURRENT"
        ? ["kind"]
        : ["kind", "raw_sequence", "state_revision"],
    );
    let frontier: SessionReadFrontier;
    if (frontierObject.kind === "CURRENT") {
      frontier = { kind: "CURRENT" };
    } else if (
      frontierObject.kind === "FROZEN" &&
      isRevision(frontierObject.raw_sequence) &&
      isRevision(frontierObject.state_revision)
    ) {
      frontier = {
        kind: "FROZEN",
        raw_sequence: frontierObject.raw_sequence,
        state_revision: frontierObject.state_revision,
      };
    } else {
      invalid();
    }
    if (index < values.length - 1 && frontier.kind !== "FROZEN") invalid();
    if (index === values.length - 1 && frontier.kind !== "CURRENT") invalid();
    return { session, frontier, precedence: index } satisfies SessionScopeEntry;
  });
  const identities = new Set(entries.map(({ session }) => sessionIdentity(session)));
  if (identities.size !== entries.length) invalid();
  const leaf = entries.at(-1)!.session;
  if (sessionIdentity(leaf) !== sessionIdentity(writeSession)) invalid();
  return {
    contract_version: SESSION_SCOPE_CONTRACT_VERSION,
    write_session: { ...writeSession },
    read_scope: entries.map((entry) => cloneEntry(entry)),
  };
}

export function isSingleSessionScope(scope: SessionScope): boolean {
  return scope.read_scope.length === 1;
}

/**
 * The current SQLite authority plane predates namespace columns. Reject every
 * other namespace instead of silently aliasing two logical identities.
 */
export function assertCoreSessionNamespace(scope: SessionScope): void {
  if (scope.read_scope.some((entry) => entry.session.namespace !== CORE_SESSION_NAMESPACE) ||
      scope.write_session.namespace !== CORE_SESSION_NAMESPACE) invalid();
}

export function cloneSessionScope(scope: SessionScope): SessionScope {
  return {
    contract_version: SESSION_SCOPE_CONTRACT_VERSION,
    write_session: { ...scope.write_session },
    read_scope: scope.read_scope.map((entry) => cloneEntry(entry)),
  };
}

export function overlayScopedState(
  entries: readonly ScopedStateEntry[],
  visibleRawIds: ReadonlySet<string>,
): ScopedStateProjection {
  const winners = new Map<string, { item: ContextItem; precedence: number }>();
  const revisions: Array<{ session_id: string; revision: number }> = [];
  for (const entry of entries) {
    const seen = new Set<string>();
    for (const item of entry.items) {
      const key = overlayKey(item);
      if (seen.has(key)) invalid();
      seen.add(key);
      const existing = winners.get(key);
      if (existing === undefined || entry.scope_entry.precedence > existing.precedence) {
        winners.set(key, { item: cloneItem(item), precedence: entry.scope_entry.precedence });
      }
    }
    revisions.push({
      session_id: entry.scope_entry.session.session_id,
      revision: entry.scope_entry.frontier.kind === "FROZEN"
        ? entry.scope_entry.frontier.state_revision
        : -1,
    });
  }
  const items = [...winners.values()].map(({ item }) => item);
  const itemIds = new Set(items.map(({ id }) => id));
  const sourceSessions = new Map(items.map((item) => [item.id, item.session_id]));
  const relations = entries.flatMap((entry) => entry.relations)
    .filter((relation) => {
      if (!itemIds.has(relation.source_id) || sourceSessions.get(relation.source_id) !== relation.session_id) return false;
      return relation.relation_type === "DERIVED_FROM"
        ? visibleRawIds.has(relation.target_id)
        : itemIds.has(relation.target_id);
    })
    .map((relation) => ({ ...relation }));
  items.sort(compareItems);
  relations.sort((left, right) =>
    compareText(left.source_id, right.source_id) ||
    compareText(left.relation_type, right.relation_type) ||
    compareText(left.target_id, right.target_id));
  return { items, relations, revisions };
}

function overlayKey(item: ContextItem): string {
  const value = item.metadata[SCOPE_OVERLAY_KEY_METADATA];
  if (value === undefined) return `id\0${item.id}`;
  if (typeof value !== "string" || value.length < 1 || value.length > MAX_IDENTIFIER_LENGTH) invalid();
  return `key\0${item.type}\0${value}`;
}

function normalizeSessionRef(value: unknown): SessionRef {
  const ref = exactObject(value, ["namespace", "session_id"]);
  return {
    namespace: identifier(ref.namespace),
    session_id: identifier(ref.session_id),
  };
}

function exactObject(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) invalid();
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) invalid();
  const ownKeys = Reflect.ownKeys(value);
  if (ownKeys.length !== keys.length) invalid();
  const expected = new Set(keys);
  for (const key of ownKeys) {
    if (typeof key !== "string" || !expected.has(key)) invalid();
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor?.enumerable || !("value" in descriptor)) invalid();
  }
  return value as Record<string, unknown>;
}

function arrayValues(value: unknown[]): unknown[] {
  if (Object.getPrototypeOf(value) !== Array.prototype) invalid();
  const result: unknown[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor?.enumerable || !("value" in descriptor)) invalid();
    result.push(descriptor.value);
  }
  for (const key of Reflect.ownKeys(value)) {
    if (key === "length") continue;
    if (typeof key !== "string" || !/^(0|[1-9][0-9]*)$/u.test(key) || Number(key) >= value.length) invalid();
  }
  return result;
}

function ownDataValue(value: unknown, key: string): unknown {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  return descriptor !== undefined && "value" in descriptor ? descriptor.value : undefined;
}

function identifier(value: unknown): string {
  if (
    typeof value !== "string" || value.length < 1 || value.length > MAX_IDENTIFIER_LENGTH ||
    value.trim().length < 1 || /\p{Cc}/u.test(value) || value !== value.normalize("NFC")
  ) invalid();
  return value;
}

function isRevision(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function sessionIdentity(ref: SessionRef): string {
  return `${ref.namespace}\0${ref.session_id}`;
}

function cloneEntry(entry: SessionScopeEntry): SessionScopeEntry {
  return {
    session: { ...entry.session },
    frontier: entry.frontier.kind === "CURRENT"
      ? { kind: "CURRENT" }
      : { ...entry.frontier },
    precedence: entry.precedence,
  };
}

function cloneItem(item: ContextItem): ContextItem {
  return {
    ...item,
    source_refs: [...item.source_refs],
    metadata: structuredClone(item.metadata),
  };
}

function compareItems(left: ContextItem, right: ContextItem): number {
  return compareText(left.created_at, right.created_at) || compareText(left.id, right.id);
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function invalid(): never {
  throw new SessionScopeValidationError();
}
