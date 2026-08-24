# WO-04D Execution Baseline Manifest

Frozen at: `2026-08-24T23:32:01Z`  
Repository: `/Users/lmc/Documents/agent长期记忆/context-compiler-mcp`  
Branch: `main`

## Git authority

```text
planning_authority_HEAD: b22f1d9e4035c55b55b90f38967a8015437c1d19
source_baseline_HEAD:     b22f1d9e4035c55b55b90f38967a8015437c1d19
source_baseline_parent:   0c5d2970ef319f2fd19b04648e1c34756abb0f3c
expected_baseline_commit_parent: b22f1d9e4035c55b55b90f38967a8015437c1d19
worktree_status: clean
submodules: none
```

This standalone baseline commit may add only this manifest. Any source/test/config change before this
manifest enters repository authority invalidates the Gate.

## Accepted dependency authority

```text
WO-04C Builder: 6642e4c04f4b7a5ff684c0399e4f83be075724f5
WO-04C QA:      d33f52281e2af857c16a79768c7d3fcde816da42
WO-05 Gate:     0c5d2970ef319f2fd19b04648e1c34756abb0f3c
WO-04D plan:    b22f1d9e4035c55b55b90f38967a8015437c1d19
```

WO-05 source work is paused. Its uncommitted draft is recoverably isolated outside the worktree as
`stash@{0}: codex-wo05-wip-before-wo04d`; it is not part of this source baseline and must not be applied
until WO-04D receives Independent QA acceptance.

## Fingerprints at source baseline

```text
repository root tree: 1141a7de813b7c62b303986a9235c36c0423826b
src tree:             0846e7d5af3f6d37f1e65c401f751c851a0515a2
test tree:            d8d87e2aa6b636252f72b1481bf789f7c177b1e3

AGENTS.md:         5ba90e3269e864fec0998e6687f8a2d10bf6d315
package.json:      fcbb8ca932a6a85820c446471cf2a314fa51d373
package-lock.json: b097160ed22f10b29a31e1ac5b6e734c172316d5
tsconfig.json:     729fa066a1e6837ae3eb8394bb1aa6017f321dba
```

## Maximum change surface

```text
src/semantic-takeover.ts
test/semantic-takeover.test.ts
docs/handoffs/WO-04D-current-semantic-takeover-read-seam.md
docs/work-orders/WO-04D-current-semantic-takeover-read-seam.md
docs/work-orders/WO-05-context-snapshot-contract.md
docs/PROJECT_STATE.md
docs/ROADMAP.md
```

Schema, migration, trigger, package/config, revision substrate, writer semantics, MCP, frozen v0,
Host/provider and WO-05 source remain outside the authorized surface.

