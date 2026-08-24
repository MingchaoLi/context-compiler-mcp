import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import * as publicSurface from "../src/index.js";
import {
  CONTEXT_COMPILER_COMMANDS,
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
