# WO-05 Execution Baseline Manifest

Status: FROZEN FOR SNAPSHOT COMPOSITION GATE / BUILDER

```text
repository_path: /path/to/context-compiler-mcp
branch: main
source_baseline_HEAD: 0dbff6a8a148f37fcabef7accf7f71d057e1a90f
planning_authority_commit: 0dbff6a8a148f37fcabef7accf7f71d057e1a90f
source_baseline_parent: aa8f8a2101be5d675cb1e75ce70af9d55d377ffe
baseline_commit_expected_parent: 0dbff6a8a148f37fcabef7accf7f71d057e1a90f
worktree_status_at_freeze: clean
worktree_clean_at_freeze: true
submodule_revisions: none
wo03b_builder_candidate: 24b7ba6971be2d8dc761368ecb66722ff053f4ea
wo03b_qa_commit: 92e72eb785b2670068597376bccfd1136e3c6952
wo04a_fixed_candidate: 98e02ef898587b013ad588cf7ab2f182afa276e3
wo04a_qa_commit: 74d39636e112054f7a4ea2b9a2e1be0b3728cdd7
wo04b_second_fixed_candidate: 8758f68bf4c6b604ae37fad13d15ca7e98c08bfc
wo04b_qa_commit: 0236d88e7f6e7b04ca347bc0bdddbdbfa7582dc1
wo04c_builder_candidate: 6642e4c04f4b7a5ff684c0399e4f83be075724f5
wo04c_qa_commit: d33f52281e2af857c16a79768c7d3fcde816da42
baseline_frozen_at: 2026-08-24T17:03:20Z
```

## Clean policy

At freeze, both commands produced no output:

```text
git status --porcelain=v1 --untracked-files=all
git submodule status
```

After this manifest is committed, only paths later frozen by
`docs/work-orders/WO-05-context-snapshot-contract.md` and its pre-source
Snapshot Composition Gate may differ from the source baseline. Any unrecorded
source, schema, test, config, dependency, evaluation, official artifact,
accepted dependency or non-WO-05 path change invalidates this baseline. The
Builder must stop or establish a new explicit baseline; it may not silently
absorb unrelated work.

## Relevant configuration fingerprint

```text
ef2c9f996d6d43b9b1f76d3c34e765eb77d96f31720ca1a9ba9e8baf332dcb9f  package.json
519fdcf4b874886466032343c25c5e5973679ef5e0ffc3dec5bf32cba3447d88  package-lock.json
189da4e3b0f7c2b3771fb5aee021b68df401630d369ed0425812fbcac4702559  tsconfig.json
```

## Frozen tree and direct dependency identities

```text
root_tree: 957992922bc38e04c743715e633e14a27aacd5d5
src_tree: 0846e7d5af3f6d37f1e65c401f751c851a0515a2
test_tree: d8d87e2aa6b636252f72b1481bf789f7c177b1e3
evaluation_tree: ff8ca5cddcffd3e36da9f91172c5ec6cdac4b88f

revision_substrate_blob: 48ce24758ebca11d6254e0fa79469564f605af16
ledger_hot_raw_blob: f318aafcb9314bf0eff77815e38d0d575a12a870
canonical_state_blob: 9269bb35caf98481e019597a65f3f942e2810cce
canonical_fact_relation_blob: 4634d4b02481571e88480561d54f84e245f4115c
semantic_takeover_blob: 435783ab59551ade4d7293518cbfda0b9c4300bb
authority_transaction_coordinator_blob: 4b21ae300218ebd8b302313e3e62e9830a939e77
core_blob: 731dec1ba0310c843ff998b22988b6340c04f6e8
index_blob: c9084acd2aec2e564b896694bf93bb2a79d5dfc3
sqlite_initialization_blob: bc107f99b1f19517caf97fed095fbe5681c8d9b7
assembler_blob: d7e2ab487e8239c6fbf447639f2c6ce56b7aeead
operational_context_blob: b0d81abf3cc1117c2fc884703fb6fe07cd414f46
raw_store_blob: 957942bf86f1a43366030ac7e962718f7a146527
state_store_blob: 9b709b76e62df361850aa7253106c9f459738ae6
state_types_blob: 698986204c7b2dcac6afcb5d3941cc6d176db0d2

revision_substrate_test_blob: 1cfe3a3809d72aaaa16a0c4864a46028dc5330b8
ledger_hot_raw_test_blob: 89f085878d96368e65bf5f6dde3e6c42e695fe3b
canonical_state_test_blob: 754c9524bc4566edcf369cde030155c6dd709450
canonical_fact_relation_test_blob: 4cb192894f9f8262b10b4346fe7ea05ea7715812
semantic_takeover_test_blob: 2f13b205b94f39d190c0e72b622a53e890cf482e
assembler_test_blob: c1108c094e63d26c17fb026ed8850ca6264c7526
operational_context_test_blob: ea1f66a244c5de38bd5cd2312b6cf80594a98017
operational_context_service_test_blob: 08787f01ce88d07d984ea9d0c3fe5df6e34bde27
core_boundary_test_blob: ea8718aad40505d1c6b223adbc1971f4ffd9725b
mcp_service_blob: c8e3dbc21ab197a87dfbd8b84503c274ccb29fbf
mcp_service_test_blob: 23fc141dec1f7ebb6b9a6dcd80bc17060763146b

package_json_blob: fcbb8ca932a6a85820c446471cf2a314fa51d373
package_lock_blob: b097160ed22f10b29a31e1ac5b6e734c172316d5
tsconfig_blob: 729fa066a1e6837ae3eb8394bb1aa6017f321dba
```

## Repository authority gate

At `source_baseline_HEAD`:

- WO-03B/04A/04B/04C accepted candidates and QA commits are ancestors;
- Contract v3.1.1 and Umbrella v3.1.1 are repository authority;
- PROJECT_STATE and ROADMAP identify WO-05 as the unique current work order;
- the WO-05 work order declares bounded result, dependencies, baseline and
  pre-source hold points, projection/assembly invariants, read/change/prohibited
  boundaries, dynamic fixtures, acceptance and QA separation;
- source/config/test/evaluation trees contain no WO-05 implementation change;
- frozen v0, MCP exact-nine, Host/provider, Evidence/Retrieval and
  Operation/Action behavior are outside the authorized result.

## Snapshot Composition hold point

This baseline authorizes only the next pre-source proof first:

```text
accepted Ledger/Frontier/State/Fact/Relation/Takeover owners
+ current SQLite/Core/assembler boundaries
→ one consistent Snapshot world
+ immutable Manifest/Working Context
+ atomic AttemptStarted binding
or an explicit bounded substrate/ownership blocker
```

No source implementation may begin until the architecture and schema map freeze
the exact Manifest grammar, canonical bytes/hash, Current Authority and Hot Raw
projection policy, priority/budget contract, cost/config identity, transaction
order, retry/collision behavior and maximum source/test allowlist.

If the accepted substrate/owner boundaries cannot satisfy the selected semantics,
the Builder must stop and record a bounded extension proposal. This manifest does
not authorize manual stream-vector updates, nested transactions, cross-connection
commit choreography, duplicate authority writers, Host interpretation, retrieval
or source changes to frozen dependencies.

## Baseline identity rule

This manifest fixes the repository/source world for WO-05 at
`0dbff6a8a148f37fcabef7accf7f71d057e1a90f`. The manifest commit and later
authorized architecture/source/handoff commits create delivery candidates; they
do not redefine the baseline. Independent QA must verify this exact baseline,
routed paths, dependency ancestry/blobs, Composition Gate resolution, frozen
projection/manifest/transaction semantics and absence of prohibited Host/MCP/
retrieval/frozen-v0 behavior.
