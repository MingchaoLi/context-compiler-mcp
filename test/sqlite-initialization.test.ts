import { describe, expect, it } from "vitest";
import { retrySafeInitializationBusy } from "../src/sqlite-initialization.js";

describe("bounded SQLite initialization retry", () => {
  it.each([
    { code: "ERR_SQLITE_ERROR", errcode: 5, errstr: "database is locked" },
    { code: "ERR_SQLITE_ERROR", errcode: 6, errstr: "database table is locked" },
    { code: "SQLITE_BUSY", errcode: undefined },
    { code: "SQLITE_LOCKED_SHAREDCACHE", errcode: undefined },
  ])("retries only a safe busy/locked initialization error", (sqliteError) => {
    let attempts = 0;
    retrySafeInitializationBusy(() => {
      attempts += 1;
      if (attempts < 3) throw Object.assign(new Error(sqliteError.errstr), sqliteError);
    });
    expect(attempts).toBe(3);
  });

  it.each([
    Object.assign(new Error("duplicate column name"), { code: "ERR_SQLITE_ERROR", errcode: 1 }),
    Object.assign(new Error("database disk image is malformed"), { code: "ERR_SQLITE_ERROR", errcode: 11 }),
    Object.assign(new Error("schema validation failed"), { code: "SCHEMA_FAILURE" }),
  ])("does not retry schema, ALTER, corruption, or non-busy failures", (failure) => {
    let attempts = 0;
    expect(() => retrySafeInitializationBusy(() => {
      attempts += 1;
      throw failure;
    })).toThrow(failure);
    expect(attempts).toBe(1);
  });
});
