# WO-01 Execution Baseline Manifest

Status: FROZEN FOR BUILDER INVENTORY

```text
repository_path: /path/to/context-compiler-mcp
branch: main
source_baseline_HEAD: f618ed4af4b40bc51b5b3eb8fc19bf1e61c51f52
expected_parent: b27b5300f3a6acba84d09f55e43fc93feeaf80f0
worktree_status_at_freeze: clean
worktree_clean_at_freeze: true
submodule_revisions: none
inventory_started_at: 2026-08-24T06:52:09Z
```

## Clean policy

The pre-freeze command `git status --porcelain=v1 --untracked-files=all` produced no output. After this manifest is created, only the following WO-01 Builder paths may differ from `source_baseline_HEAD`:

```text
docs/inventory/WO-01/**
docs/handoffs/WO-01-current-architecture-inventory.md
```

Any change to source, schema, tests, configuration, dependencies, or official artifacts invalidates this baseline and requires the inventory to stop or a new execution baseline to be established.

## Relevant configuration fingerprint

The relevant tracked build/runtime configuration set at the frozen source baseline is:

```text
ef2c9f996d6d43b9b1f76d3c34e765eb77d96f31720ca1a9ba9e8baf332dcb9f  package.json
519fdcf4b874886466032343c25c5e5973679ef5e0ffc3dec5bf32cba3447d88  package-lock.json
189da4e3b0f7c2b3771fb5aee021b68df401630d369ed0425812fbcac4702559  tsconfig.json
```

Aggregate fingerprint, calculated as `shasum -a 256 <files> | shasum -a 256` in the listed order:

```text
16908aa48dfcb5881dc23c9c7c0420053d305fcc08fc59ddb9ad65ba29c7be4d
```

## Repository authority gate

At `source_baseline_HEAD`:

- Architecture Contract v3.1.1 is repository authority.
- Umbrella Implementation Plan v3.1.1 is repository authority.
- `WO-01-current-architecture-inventory.md` is the current work order.
- The current work order is analysis/inventory only.
- Remote models, network access, destructive commands, production database mutation, and production implementation changes are prohibited.

## Baseline identity rule

This manifest freezes the code world described by WO-01. Later inventory and handoff documentation produces a `delivery_HEAD`; it does not redefine `source_baseline_HEAD`. Independent QA must verify both this identity and that `source_baseline_HEAD..delivery_HEAD` contains only the allowed WO-01 analysis paths.
