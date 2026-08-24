# WO-02 Execution Baseline Manifest

Status: FROZEN FOR BUILDER IMPLEMENTATION

```text
repository_path: /Users/lmc/Documents/agent长期记忆/context-compiler-mcp
branch: main
source_baseline_HEAD: 8285c8a63dcc471009bdaf90b96b5fb26e6804b8
planning_authority_commit: 8285c8a63dcc471009bdaf90b96b5fb26e6804b8
expected_parent: c264d5f5debd207278deacb703fa8e64f2b66c0c
worktree_status_at_freeze: clean
worktree_clean_at_freeze: true
submodule_revisions: none
wo01_accepted_candidate: ac6056c8c0ba2057866642d6785c1aee272af81b
wo01_qa_commit: c264d5f5debd207278deacb703fa8e64f2b66c0c
implementation_started_at: 2026-08-24T08:56:47Z
```

## Clean policy

The pre-freeze command
`git status --porcelain=v1 --untracked-files=all` produced no output. After this
manifest is created, only paths authorized by
`docs/work-orders/WO-02-core-host-authority-boundary.md` may differ from the source
baseline.

Any unrecorded change to source, schema, tests, configuration, dependencies,
evaluation content, official artifacts, or a non-WO-02 path invalidates the
baseline and requires the Builder to stop or establish a new execution baseline.

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

- WO-01 fixed candidate and fresh Independent QA acceptance are ancestors.
- Architecture Contract v3.1.1 and Umbrella Plan v3.1.1 are repository authority.
- PROJECT_STATE and ROADMAP identify WO-02 as the unique next work order.
- `WO-02-core-host-authority-boundary.md` declares CAN READ, CAN CHANGE,
  MUST NOT CHANGE, MUST PRESERVE, dependencies, crash cases, acceptance, and QA
  handoff.
- WO-02 is behavior-preserving and does not authorize WO-03A+ runtime behavior,
  Host/provider integration, network access, or sibling-repository reads.

## Baseline identity rule

This manifest freezes the source and repository-authority world described by
WO-02. Builder documentation and source commits produce a later candidate HEAD;
they do not redefine this baseline. Independent QA must verify both the baseline
identity and every changed path/behavior against the WO-02 allowlist.
