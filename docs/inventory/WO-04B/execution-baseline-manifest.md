# WO-04B Execution Baseline Manifest

Status: FROZEN FOR BUILDER IMPLEMENTATION

```text
repository_path: /path/to/context-compiler-mcp
branch: main
source_baseline_HEAD: eb7a45bdfa09cd468581145e6270a22a471cf2f6
planning_authority_commit: eb7a45bdfa09cd468581145e6270a22a471cf2f6
expected_parent: 74d39636e112054f7a4ea2b9a2e1be0b3728cdd7
worktree_status_at_freeze: clean
worktree_clean_at_freeze: true
submodule_revisions: none
wo03a_fixed_candidate: c93072dc5e4b5c89464b003e716bbb688b072b89
wo03a_qa_commit: f02c5e12ee0931d4a23a999fa2dc2c0dbb977940
wo03b_fixed_candidate: 24b7ba6971be2d8dc761368ecb66722ff053f4ea
wo03b_qa_commit: 92e72eb785b2670068597376bccfd1136e3c6952
wo04a_fixed_candidate: 98e02ef898587b013ad588cf7ab2f182afa276e3
wo04a_qa_commit: 74d39636e112054f7a4ea2b9a2e1be0b3728cdd7
implementation_started_at: 2026-08-24T12:03:53Z
```

## Clean policy

The pre-freeze command
`git status --porcelain=v1 --untracked-files=all` produced no output. After this
manifest is created, only paths authorized by
`docs/work-orders/WO-04B-fact-relation-authority-policy.md` may differ from the
source baseline.

Any unrecorded change to source, schema, tests, configuration, dependencies,
evaluation content, official artifacts, accepted WO-03A/03B/04A paths, or a
non-WO-04B path invalidates this baseline and requires the Builder to stop or
establish a new execution baseline.

## Relevant configuration fingerprint

```text
ef2c9f996d6d43b9b1f76d3c34e765eb77d96f31720ca1a9ba9e8baf332dcb9f  package.json
519fdcf4b874886466032343c25c5e5973679ef5e0ffc3dec5bf32cba3447d88  package-lock.json
189da4e3b0f7c2b3771fb5aee021b68df401630d369ed0425812fbcac4702559  tsconfig.json
```

Aggregate fingerprint in the listed order:

```text
16908aa48dfcb5881dc23c9c7c0420053d305fcc08fc59ddb9ad65ba29c7be4d
```

## Frozen tree and direct dependency identities

```text
root_tree: d54ba980db9dde99893d7b40d017db895eb5d724
src_tree: f2217aa884ee7e53b1c9cdda6cb8ddc1220c8f3a
test_tree: a3dfae3eaaf49e615717cc71713433ca8b04aa9c
evaluation_tree: ff8ca5cddcffd3e36da9f91172c5ec6cdac4b88f
revision_substrate_blob: 48ce24758ebca11d6254e0fa79469564f605af16
ledger_hot_raw_blob: f318aafcb9314bf0eff77815e38d0d575a12a870
canonical_state_blob: ed1afa6ff0f6d2d0f03943e2cdf127f2b085a51e
revision_substrate_test_blob: 1cfe3a3809d72aaaa16a0c4864a46028dc5330b8
ledger_hot_raw_test_blob: 89f085878d96368e65bf5f6dde3e6c42e695fe3b
canonical_state_test_blob: 754c9524bc4566edcf369cde030155c6dd709450
mcp_service_blob: c8e3dbc21ab197a87dfbd8b84503c274ccb29fbf
mcp_service_test_blob: 23fc141dec1f7ebb6b9a6dcd80bc17060763146b
package_json_blob: fcbb8ca932a6a85820c446471cf2a314fa51d373
package_lock_blob: b097160ed22f10b29a31e1ac5b6e734c172316d5
tsconfig_blob: 729fa066a1e6837ae3eb8394bb1aa6017f321dba
```

## Repository authority gate

At `source_baseline_HEAD`:

- WO-03A, WO-03B and WO-04A fixed candidates and QA commits are ancestors;
- Contract v3.1.1 and Umbrella v3.1.1 are repository authority;
- PROJECT_STATE and ROADMAP identify WO-04B as the unique next work order;
- the WO-04B work order declares read/change/prohibition, dependencies, crash,
  acceptance and QA boundaries;
- WO-04B may read but not modify the frozen WO-03A revision substrate, WO-03B
  canonical Raw/Hot Raw implementation, or WO-04A Canonical State authority;
- Fact/Relation object revisions must leave all WO-03A vector axes unchanged;
- no legacy takeover, Frontier/Takeover/Enrichment/Compaction/Snapshot,
  Host/provider/network or MCP expansion is authorized.

## Baseline identity rule

This manifest fixes the repository-authority and source world for WO-04B.
Builder source/docs commits create a later candidate HEAD; they do not redefine
this baseline. Independent QA must verify this baseline, exact routed candidate
paths, frozen WO-03A/03B/04A bytes, legacy State/MCP compatibility, unchanged
five-component revision vectors for every Fact/Relation commit, and the absence
of Frontier/Takeover/Enrichment/Compaction behavior.
