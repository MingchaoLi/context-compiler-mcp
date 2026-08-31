import { createHash } from "node:crypto";

function assertJsonValue(value: unknown): void {
  if (value === null || typeof value === "string" || typeof value === "boolean") return;
  if (typeof value === "number") {
    if (!Number.isFinite(value) || !Number.isSafeInteger(value) || Object.is(value, -0)) {
      throw new Error("INVALID_JCS_NUMBER");
    }
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) assertJsonValue(item);
    return;
  }
  if (typeof value !== "object" || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new Error("INVALID_JCS_VALUE");
  }
  for (const item of Object.values(value as Record<string, unknown>)) {
    if (item === undefined) throw new Error("INVALID_JCS_UNDEFINED");
    assertJsonValue(item);
  }
}

export function jcs(value: unknown): string {
  assertJsonValue(value);
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(jcs).join(",")}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${jcs(object[key])}`)
    .join(",")}}`;
}

export function sha256Utf8(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function sha256Jcs(value: unknown): string {
  return sha256Utf8(jcs(value));
}

export function estimateTokens(value: string): number {
  return value.length === 0 ? 0 : Math.max(1, Math.ceil(value.length / 4));
}

export function exactKeys(
  value: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[] = [],
): void {
  const allowed = new Set([...required, ...optional]);
  const keys = Object.keys(value);
  if (required.some((key) => !Object.hasOwn(value, key)) || keys.some((key) => !allowed.has(key))) {
    throw new Error("INVALID_CLOSED_SHAPE");
  }
}

export function opaqueRef(prefix: string, value: unknown): string {
  return `${prefix}:sha256:${sha256Jcs(value)}`;
}
