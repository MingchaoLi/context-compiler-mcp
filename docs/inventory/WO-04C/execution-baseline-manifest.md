# WO-04C Execution Baseline Manifest

Status: FROZEN FOR TRANSACTION COMPOSITION GATE / BUILDER

```text
repository_path: /path/to/context-compiler-mcp
branch: main
source_baseline_HEAD: c3a184f9c067d529e8f2908080ab72650fb59cbc
planning_authority_commit: c3a184f9c067d529e8f2908080ab72650fb59cbc
expected_parent: 0236d88e7f6e7b04ca347bc0bdddbdbfa7582dc1
worktree_status_at_freeze: clean
worktree_clean_at_freeze: true
submodule_revisions: none
wo03a_fixed_candidate: c93072dc5e4b5c89464b003e716bbb688b072b89
wo03a_qa_commit: f02c5e12ee0931d4a23a999fa2dc2c0dbb977940
wo03b_builder_candidate: 24b7ba6971be2d8dc761368ecb66722ff053f4ea
wo03b_qa_commit: 92e72eb785b2670068597376bccfd1136e3c6952
wo04a_fixed_candidate: 98e02ef898587b013ad588cf7ab2f182afa276e3
wo04a_qa_commit: 74d39636e112054f7a4ea2b9a2e1be0b3728cdd7
wo04b_second_fixed_candidate: 8758f68bf4c6b604ae37fad13d15ca7e98c08bfc
wo04b_qa_commit: 0236d88e7f6e7b04ca347bc0bdddbdbfa7582dc1
baseline_frozen_at: 2026-08-24T13:45:23Z
```

## Clean policy

The freeze command
`git status --porcelain=v1 --untracked-files=all` produced no output, and
`git submodule status` also produced no output. After this manifest is created,
only paths authorized by
`docs/work-orders/WO-04C-semantic-takeover-enrichment-frontier-compaction.md`
may differ from the source baseline.

Any unrecorded source, schema, test, config, dependency, evaluation, official
artifact, accepted dependency or non-WO-04C path change invalidates this
baseline. The Builder must stop or establish a new explicit baseline; it may not
silently absorb unrelated work.

## Relevant configuration fingerprint

```text
ef2c9f996d6d43b9b1f76d3c34e765eb77d96f31720ca1a9ba9e8baf332dcb9f  package.json
519fdcf4b874886466032343c25c5e5973679ef5e0ffc3dec5bf32cba3447d88  package-lock.json
189da4e3b0f7c2b3771fb5aee021b68df401630d369ed0425812fbcac4702559  tsconfig.json
```

Aggregate fingerprint in the listed order remains:

```text
16908aa48dfcb5881dc23c9c7c0420053d305fcc08fc59ddb9ad65ba29c7be4d
```

## Frozen tree and direct dependency identities

```text
root_tree: ee7eef07bc10d88a7dc92bfd47ce3f4b2fd6f4af
src_tree: b9981b10138f0791f877dcfdb9c1cc3c9e8c936e
test_tree: 8e13ebba3affcf0e64d090c24e85fc471271824f
evaluation_tree: ff8ca5cddcffd3e36da9f91172c5ec6cdac4b88f

revision_substrate_blob: 48ce24758ebca11d6254e0fa79469564f605af16
ledger_hot_raw_blob: f318aafcb9314bf0eff77815e38d0d575a12a870
canonical_state_blob: ed1afa6ff0f6d2d0f03943e2cdf127f2b085a51e
canonical_fact_relation_blob: 2dc303c041cee00639bb5c69ca9c0e280dc36ec4
core_blob: 91ae696c812e79776332dfc5b08960d27675140c
index_blob: acdf200f0ca543df64c3d72b8d97286e8ef133e8

revision_substrate_test_blob: 1cfe3a3809d72aaaa16a0c4864a46028dc5330b8
ledger_hot_raw_test_blob: 89f085878d96368e65bf5f6dde3e6c42e695fe3b
canonical_state_test_blob: 754c9524bc4566edcf369cde030155c6dd709450
canonical_fact_relation_test_blob: 4cb192894f9f8262b10b4346fe7ea05ea7715812
core_boundary_test_blob: 9900d835e8fbc4fb2c5cc3f2c1c69c4f29f1e7be
mcp_service_blob: c8e3dbc21ab197a87dfbd8b84503c274ccb29fbf
mcp_service_test_blob: 23fc141dec1f7ebb6b9a6dcd80bc17060763146b

package_json_blob: fcbb8ca932a6a85820c446471cf2a314fa51d373
package_lock_blob: b097160ed22f10b29a31e1ac5b6e734c172316d5
tsconfig_blob: 729fa066a1e6837ae3eb8394bb1aa6017f321dba
```

## Repository authority gate

At `source_baseline_HEAD`:

- WO-03A/03B/04A/04B accepted candidates and QA commits are ancestors;
- Contract v3.1.1 and Umbrella v3.1.1 are repository authority;
- PROJECT_STATE and ROADMAP identify WO-04C as the unique next work order;
- the WO-04C work order declares dependencies, read/change/prohibition,
  Transaction Composition Gate, crash cases, acceptance and QA boundaries;
- `src/revision-substrate.ts` and `src/ledger-hot-raw.ts` are frozen and may only
  be read;
- WO-04A/04B owner files may change only if the pre-source Composition Gate
  freezes a behavior-preserving Core-private transaction/read seam in the exact
  candidate allowlist;
- no Snapshot, Working Context, Host/provider/network, MCP, retrieval or legacy
  migration behavior is authorized.

## Transaction Composition hold point

This baseline authorizes only the next pre-source proof first:

```text
frozen TAKEOVER_FRONTIER capability
+ WO-04A / WO-04B owner transaction lifecycles
→ exact composition model or explicit blocker
```

No source implementation may begin until the architecture and transaction map
freeze the exact Takeover/Enrichment grammar, coverage proof, canonical authority
reference/proposal model, Compaction Artifact identity, required-proposal
fail-closed semantics and transaction order.

If the frozen substrate cannot satisfy the selected semantics, the Builder must
stop and record a bounded substrate-extension proposal. This manifest does not
authorize manual stream-vector updates, nested transactions, cross-connection
commit choreography, duplicate writers or source changes to the substrate.

## Baseline identity rule

This manifest fixes the repository/source world for WO-04C at `c3a184f9...`.
The manifest commit and later authorized architecture/source/handoff commits
create delivery candidates; they do not redefine the baseline. Independent QA
must verify this exact baseline, routed paths, dependency blobs, Composition Gate
resolution, exact vector/coverage/artifact semantics and absence of prohibited
Snapshot/Host/MCP behavior.
