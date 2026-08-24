# WO-04A Execution Baseline Manifest

Status: FROZEN FOR BUILDER IMPLEMENTATION

```text
repository_path: /Users/lmc/Documents/agent长期记忆/context-compiler-mcp
branch: main
source_baseline_HEAD: 4e7758ac459c879944c624eb27ffefcfb24a2aec
planning_authority_commit: 4e7758ac459c879944c624eb27ffefcfb24a2aec
expected_parent: 92e72eb785b2670068597376bccfd1136e3c6952
worktree_status_at_freeze: clean
worktree_clean_at_freeze: true
submodule_revisions: none
wo03a_fixed_candidate: c93072dc5e4b5c89464b003e716bbb688b072b89
wo03a_qa_commit: f02c5e12ee0931d4a23a999fa2dc2c0dbb977940
wo03b_fixed_candidate: 24b7ba6971be2d8dc761368ecb66722ff053f4ea
wo03b_qa_commit: 92e72eb785b2670068597376bccfd1136e3c6952
implementation_started_at: 2026-08-24T11:10:50Z
```

## Clean policy

The pre-freeze command
`git status --porcelain=v1 --untracked-files=all` produced no output. After this
manifest is created, only paths authorized by
`docs/work-orders/WO-04A-canonical-state-revision-commit.md` may differ from the
source baseline.

Any unrecorded change to source, schema, tests, configuration, dependencies,
evaluation content, official artifacts, the accepted WO-03A/03B paths, or a
non-WO-04A path invalidates this baseline and requires the Builder to stop or
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

## Repository authority gate

At `source_baseline_HEAD`:

- the WO-03A fixed candidate/re-QA and WO-03B fixed candidate/QA are ancestors;
- Contract v3.1.1 and Umbrella v3.1.1 are repository authority;
- PROJECT_STATE and ROADMAP identify WO-04A as the unique next work order;
- the WO-04A work order declares the required read/change/prohibition,
  dependency, crash, acceptance, and QA boundaries;
- WO-04A may consume but not modify the frozen WO-03A revision substrate or
  WO-03B canonical Raw/Hot Raw implementation;
- no legacy State takeover, Fact/Relation, Frontier/Takeover/Enrichment,
  Host/provider/network, or MCP expansion is authorized.

## Baseline identity rule

This manifest fixes the repository-authority and source world for WO-04A.
Builder source/docs commits create a later candidate HEAD; they do not redefine
this baseline. Independent QA must verify the baseline, the exact routed
candidate paths, frozen WO-03A/03B bytes, legacy State/MCP compatibility, and
the absence of Fact/Relation/Frontier/Takeover behavior.
