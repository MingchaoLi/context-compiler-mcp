# WO-03B Execution Baseline Manifest

Status: FROZEN FOR BUILDER IMPLEMENTATION

```text
repository_path: /Users/lmc/Documents/agent长期记忆/context-compiler-mcp
branch: main
source_baseline_HEAD: 06d736a0a8a7ab3cfb03228b345898ac4a57a658
planning_authority_commit: 06d736a0a8a7ab3cfb03228b345898ac4a57a658
expected_parent: f02c5e12ee0931d4a23a999fa2dc2c0dbb977940
worktree_status_at_freeze: clean
worktree_clean_at_freeze: true
submodule_revisions: none
wo03a_fixed_candidate: c93072dc5e4b5c89464b003e716bbb688b072b89
wo03a_qa_commit: f02c5e12ee0931d4a23a999fa2dc2c0dbb977940
implementation_started_at: 2026-08-24T10:38:44Z
```

## Clean policy

The pre-freeze command
`git status --porcelain=v1 --untracked-files=all` produced no output. After this
manifest is created, only paths authorized by
`docs/work-orders/WO-03B-ledger-high-water-hot-raw-replay.md` may differ from the
source baseline.

Any unrecorded change to source, schema, tests, configuration, dependencies,
evaluation content, official artifacts, the accepted WO-03A substrate, or a
non-WO-03B path invalidates this baseline and requires the Builder to stop or
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

- the WO-03A fixed candidate and Independent re-QA acceptance are ancestors;
- Contract v3.1.1 and Umbrella v3.1.1 are repository authority;
- PROJECT_STATE and ROADMAP identify WO-03B as the unique next work order;
- the WO-03B work order declares all required read/change/prohibition,
  dependency, crash, acceptance, and QA boundaries;
- WO-03B may consume but not modify the frozen WO-03A revision substrate;
- no Host/provider/network or legacy session/sequence reinterpretation is
  authorized.

## Baseline identity rule

This manifest fixes the repository-authority and source world for WO-03B.
Builder source/docs commits create a later candidate HEAD; they do not redefine
this baseline. Independent QA must verify this baseline, the exact routed
candidate paths actually used, the frozen WO-03A bytes, and the absence of
legacy Raw/session backfill.
