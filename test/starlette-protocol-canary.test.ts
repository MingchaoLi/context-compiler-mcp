// @vitest-environment node

import { cp, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { validateProtocolPreflight } from "../evaluation/starlette-v1/protocol-canary/protocol-preflight.js";
// Protocol utilities intentionally remain outside the publishable src/ package.
// @ts-expect-error JavaScript fixture utilities have no declaration files.
import { deriveEligibilityInventory } from "../evaluation/starlette-v1/protocol-canary/derive-eligibility.mjs";
// @ts-expect-error JavaScript fixture utilities have no declaration files.
import {
  loadProtocolCanary,
  validateProtocolCanary,
  validateProtocolDocuments,
} from "../evaluation/starlette-v1/protocol-canary/validate-protocol-canary.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "evaluation", "starlette-v1");
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

async function copiedRoot(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "context-compiler-starlette-protocol-"));
  temporaryDirectories.push(directory);
  await cp(ROOT, directory, { recursive: true });
  return directory;
}

describe("Starlette preregistered protocol canary", () => {
  it("accepts the 83-fact, 75-slice inventory and fixed twelve-slice protocol", async () => {
    await expect(validateProtocolCanary(ROOT)).resolves.toEqual({
      schema_version: "starlette-protocol-canary-validation/v1",
      status: "protocol_canary_not_frozen",
      case_count: 6,
      fact_count: 83,
      full_inventory_slice_count: 75,
      fact_slice_assignment_count: 499,
      selected_slice_count: 12,
      context_probe_count: 8,
      not_exactly_scorable_dependency_count: 19,
      answer_required_item_count: 42,
      answer_forbidden_item_count: 16,
      resolved_context_probe_count: 0,
      evaluation_run_count: 0,
      model_call_count: 0,
      effect_metrics_generated: false,
    });
  });

  it("rebuilds the committed eligibility inventory exactly", async () => {
    const { inventory } = await loadProtocolCanary(ROOT);
    await expect(deriveEligibilityInventory(ROOT)).resolves.toEqual(inventory);
    expect(inventory.slices.filter((slice: any) => slice.canary_role !== "not_selected").map((slice: any) => slice.slice_id)).toEqual([
      "STR-07/T4", "STR-07/T10", "STR-08/T3", "STR-08/T4", "STR-05/T7", "STR-05/T9",
      "STR-06/T4", "STR-06/T16", "STR-01/T4", "STR-01/T18", "STR-04/T4", "STR-04/T18",
    ]);
  });

  it("statically parses the canary through the real evaluator v2 parser without a run", async () => {
    await expect(validateProtocolPreflight(ROOT)).resolves.toEqual({
      schema_version: "starlette-protocol-preflight/v1",
      status: "protocol_canary_parser_compatible",
      evaluator_case_count: 12,
      projected_history_turn_count: 101,
      context_probe_count: 8,
      resolved_context_probe_count: 0,
      evaluation_run_count: 0,
      model_call_count: 0,
      effect_metrics_generated: false,
    });
  });

  it.each([
    ["Oracle-only anchor", (protocol: any) => { protocol.selected_slices[1].context_probes.constraints[0].text = "Route and Mount path strings support URI templating rather than arbitrary embedded regex."; }],
    ["raw-only anchor", (protocol: any) => { protocol.selected_slices[1].context_probes.constraints[0].text = "support URI templating rather than general regex"; }],
    ["current-input repetition", (protocol: any) => { protocol.selected_slices[1].context_probes.open_questions.push({id:"STR-07/T10/P-CURRENT",text:"documentation",fact_ids:["STR-07/F10"],raw_event_ids:["STR-07/E7"],context_item_ids:["STR-07/I8"],code_identifier_exception:true,interpretation:"mutation"}); }],
    ["latest-event repetition", (protocol: any) => { const probe = protocol.selected_slices[1].context_probes.constraints[1]; probe.text = "redirect"; probe.code_identifier_exception = true; }],
    ["resolved context Probe", (protocol: any) => { protocol.selected_slices[1].context_probes.resolved_issues.push(structuredClone(protocol.selected_slices[1].context_probes.constraints[0])); }],
    ["future answer fact", (protocol: any) => { const item = protocol.selected_slices[2].answer_checklist.required_items[0]; item.fact_ids = ["STR-08/F4"]; item.provenance_event_ids = ["STR-08/E4"]; }],
    ["dangling critical id", (protocol: any) => { protocol.selected_slices[0].answer_checklist.critical_miss_ids.push("STR-07/T4/UNKNOWN"); }],
    ["zero-width anchor", (protocol: any) => { protocol.selected_slices[1].context_probes.constraints[0].text = "URI\u200B templating"; }],
    ["invalid code exception", (protocol: any) => { protocol.selected_slices[1].context_probes.constraints[0].code_identifier_exception = true; }],
    ["silent dependency omission", (protocol: any) => { protocol.selected_slices[0].not_exactly_scorable = []; }],
    ["authorization escalation", (protocol: any) => { protocol.authorization.model_run_authorized = true; }],
    ["unknown protocol field", (protocol: any) => { protocol.unregistered_gate = true; }],
  ])("rejects %s before any evaluator or model run", async (_label, mutation) => {
    const { inventory, protocol } = await loadProtocolCanary(ROOT);
    const changed = structuredClone(protocol);
    mutation(changed);
    await expect(validateProtocolDocuments(ROOT, inventory, changed)).rejects.toThrow();
  });

  it("rejects coordinated protocol and hash rewriting against the code-fixed contract", async () => {
    const root = await copiedRoot();
    const protocolPath = join(root, "protocol-canary", "protocol.json");
    const hashPath = join(root, "protocol-canary", "protocol-hashes.json");
    const protocol = JSON.parse(await readFile(protocolPath, "utf8"));
    protocol.reporting_policy.weighted_composite_score_authorized = true;
    await writeFile(protocolPath, `${JSON.stringify(protocol, null, 2)}\n`, "utf8");
    const hashes = JSON.parse(await readFile(hashPath, "utf8"));
    hashes.files.find((entry: any) => entry.path.endsWith("protocol.json")).sha256 = "0".repeat(64);
    await writeFile(hashPath, `${JSON.stringify(hashes, null, 2)}\n`, "utf8");
    await expect(validateProtocolCanary(root)).rejects.toThrow(/fixed protocol candidate hash changed/);
  });

  it("rejects a protocol fixture exposed through a symlink", async () => {
    const root = await copiedRoot();
    const target = join(root, "protocol-canary", "eligibility-inventory.json");
    const saved = join(root, "protocol-canary", "eligibility-inventory-saved.json");
    await cp(target, saved);
    await rm(target);
    await symlink(saved, target);
    await expect(validateProtocolCanary(root)).rejects.toThrow(/expected regular file/);
  });
});
