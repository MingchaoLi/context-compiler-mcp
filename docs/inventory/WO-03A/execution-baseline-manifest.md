# WO-03A Execution Baseline Manifest

Status: FROZEN FOR BUILDER IMPLEMENTATION

```text
repository_path: /path/to/context-compiler-mcp
branch: main
source_baseline_HEAD: 94f18b702b7eceda9e8afac7cc3d88abddbfb7da
planning_authority_commit: 94f18b702b7eceda9e8afac7cc3d88abddbfb7da
expected_parent: 8204ccc484cdc2a36218dc5f4a350f5d1c607f50
worktree_status_at_freeze: clean
worktree_clean_at_freeze: true
submodule_revisions: none
wo02_fixed_candidate: a03a059d9c0823d0500f42659e6be891558f12be
wo02_qa_commit: 8204ccc484cdc2a36218dc5f4a350f5d1c607f50
implementation_started_at: 2026-08-24T09:39:36Z
```

## Clean policy

The pre-freeze command
`git status --porcelain=v1 --untracked-files=all` produced no output. After this
manifest is created, only paths authorized by
`docs/work-orders/WO-03A-shared-revision-stream-transaction-substrate.md` may
differ from the source baseline.

Any unrecorded change to source, schema, tests, configuration, dependencies,
evaluation content, official artifacts, or a non-WO-03A path invalidates this
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

- the WO-02 fixed candidate and Independent re-QA acceptance are ancestors;
- Architecture Contract v3.1.1 and Umbrella Plan v3.1.1 are repository authority;
- PROJECT_STATE and ROADMAP identify WO-03A as the unique next work order;
- the WO-03A work order declares CAN READ, CAN CHANGE, MUST NOT CHANGE,
  MUST PRESERVE, dependencies, crash cases, acceptance, and QA handoff;
- WO-03A authorizes only the shared namespace/stream/revision/transaction
  substrate, not WO-03B/WO-04 business behavior or Host/provider integration.

## Baseline identity rule

This manifest fixes the source and repository-authority world described by
WO-03A. Builder documentation and source commits produce a later candidate HEAD;
they do not redefine this baseline. Independent QA must verify the baseline,
planning commit, changed-path allowlist, and absence of silent session/revision
reinterpretation.
