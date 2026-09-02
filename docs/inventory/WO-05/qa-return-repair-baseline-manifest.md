# WO-05 QA-return Repair Baseline Manifest

Status: FROZEN FOR BOUNDED PROJECTION-RECEIPT GATE ADDENDUM / APPEND-ONLY REPAIR

```text
repository_path: /path/to/context-compiler-mcp
branch: main
repair_source_baseline_HEAD: 32e2e13248f72eecfbac54ecfd91db29e7d7111b
gate_reopen_planning_authority: 32e2e13248f72eecfbac54ecfd91db29e7d7111b
repair_source_baseline_parent: 9be0333abdff97c24dcb418abcb42eced8a2b298
baseline_commit_expected_parent: 32e2e13248f72eecfbac54ecfd91db29e7d7111b
original_wo05_source_baseline: 0dbff6a8a148f37fcabef7accf7f71d057e1a90f
original_execution_baseline_commit: 18a2ab3dc02657200e5d96eec3bfc9a715c316e6
original_pre_source_gate_commit: 0c5d2970ef319f2fd19b04648e1c34756abb0f3c
returned_builder_candidate: c8c37b4beb230d2c37017b9c9d65aefa7e180eaa
qa_return_commit: 88e8da7c9cee348643f3c3f698af4e8e46cf3e09
qa_return_status_commit: 9be0333abdff97c24dcb418abcb42eced8a2b298
worktree_status_at_freeze: clean
worktree_clean_at_freeze: true
submodule_revisions: none
repair_baseline_frozen_at: 2026-08-25T01:47:57Z
```

## Baseline meaning

This is an append-only repair baseline, not an acceptance of the returned Builder candidate.
It fixes the exact repository world after:

```text
WO-05 Builder candidate c8c37b4
  -> Independent QA FAIL/RETURN 88e8da7
  -> repository return status 9be0333
  -> bounded Gate-reopen planning authority 32e2e13
```

The blocking counterexample is repository authority at the QA report path. The repair may close only
that bounded historical Fact/Relation projection information gap and must preserve the returned
candidate, QA report and status commits unchanged in ancestry.

At freeze, both commands produced no output:

```text
git status --porcelain=v1 --untracked-files=all
git submodule status
```

## Frozen tree and relevant blobs

```text
root_tree: 5722ff9470479c2583dad24b49ebd1c844d282ec
src_tree: 59265ad34c7ded7c4d8a805238ee3bcc13ff8875
test_tree: 3760aabc8a8fae25dcaed84059f6f9d5fddff55f
evaluation_tree: ff8ca5cddcffd3e36da9f91172c5ec6cdac4b88f

context_snapshot_blob: e261591372053f299f3403cb876c8ac54d3589d3
canonical_fact_relation_blob: eed02cae5686d7f64137c261ebc8a3ec36ce48f5
context_snapshot_test_blob: b91139c43bab1eb652427af0b55721b46e3e660e
wo05_qa_return_blob: d373c7be730d07f1524cdef3eb198cced9c6523c
original_gate_architecture_blob: c0334bc4c95e25573966e60a4bdd1ea06cd7ceea
original_gate_schema_map_blob: b6e4155069236ab7c577f484443bd6c2e2ae93b2

package_json_blob: fcbb8ca932a6a85820c446471cf2a314fa51d373
package_lock_blob: b097160ed22f10b29a31e1ac5b6e734c172316d5
tsconfig_blob: 729fa066a1e6837ae3eb8394bb1aa6017f321dba
```

Relevant byte fingerprints:

```text
ef2c9f996d6d43b9b1f76d3c34e765eb77d96f31720ca1a9ba9e8baf332dcb9f  package.json
519fdcf4b874886466032343c25c5e5973679ef5e0ffc3dec5bf32cba3447d88  package-lock.json
189da4e3b0f7c2b3771fb5aee021b68df401630d369ed0425812fbcac4702559  tsconfig.json
34cc2a37eb2c693ec0abd0ea0f3672537d9d6915873e94d9e40909fde70f1272  src/context-snapshot.ts
cc2dd5fe8d3f97a63364871ff63d0830dd658447c006be1675522f9bba0a95ae  src/canonical-fact-relation.ts
0aaf1fd7b5f5d822488ab0579567cbcfa8a28b53706a85f26dfbbf5f074b3f6b  test/context-snapshot.test.ts
092d977feff2905548e15f56b86d1643d58f570717915c88e9450d34bba8d686  docs/qa/WO-05-context-snapshot-contract.md
6de8e4ec974940476ba92c00f5e31b89671b4ed6de1b8203bd4a1b06f78349ec  docs/architecture/WO-05-context-snapshot-contract.md
4c2326125839c650d25323dedc546cd68c6f84e89227f9f06647cc576d4f4fae  docs/inventory/WO-05/snapshot-composition-schema-map.md
32d5da0a6a204b4c2e310cd287669d598b64a9f2138e2a78bb0a1c30ecdb7105  docs/work-orders/WO-05-context-snapshot-contract.md
3160600d1ccad0a1da82e56512b5f5c8c4a8393529d022cc00c35694ab7fb345  docs/PROJECT_STATE.md
b8c7f4bc9fb6eaa5a50151fe6e45c7b896a18211392dd1cc7403b6efa500edf2  docs/ROADMAP.md
```

## Repair hold point

This baseline authorizes docs-only mechanical inventory and one bounded Gate Addendum first:

```text
Fact/Relation Authority owner
  -> capture complete canonical historical projection witness
  -> same SQLite transaction as Snapshot freeze
  -> owner-local axis-neutral immutable receipt
  -> receipt-first exact replay and dependency-graph reconstruction
```

Before source/schema/test changes, the Gate Addendum must freeze:

- owner and exact table/row/trigger lifecycle;
- complete projection materialization grammar and canonical hash identity;
- Snapshot reference grammar without sixth global revision axis;
- same-handle capture/read seams and transaction order;
- exact retry, concurrent same-ID, rollback, orphan, migration and reopen behavior;
- receipt-first replay and coordinated omission rejection;
- exact repair source/test/doc allowlist.

The Gate may reject the proposed receipt design if the mechanical owner/schema audit shows it would
create a duplicate Fact/Relation authority writer, require nested/cross-connection transactions,
weaken fail-closed behavior or widen the runtime boundary. In that case source remains stopped.

## Hard exclusions

This baseline does not authorize:

- a hash stored only inside the mutable Snapshot Manifest;
- a Snapshot-owned construction or repair of Fact/Relation receipt content;
- selected-only rather than complete projection capture;
- a sixth global revision axis or shared revision-substrate change;
- rewriting the returned candidate or QA report;
- WO-06/07, Host/UI/Tauri/Harness/Cordis/ACP, provider/model/network/credentials;
- MCP, frozen v0, retrieval, Summary, Extractor, evaluation, dependency or configuration changes.

Any source/schema/test/config change before the Gate Addendum commit, or any later change outside its
exact allowlist, invalidates this repair baseline and requires an explicit stop.
