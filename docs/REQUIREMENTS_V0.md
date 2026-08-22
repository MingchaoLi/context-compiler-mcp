# Context Compiler v0 requirements index

This file is the default requirements entry point. The full historical brief is archived at `archive/ORIGINAL_IMPLEMENTATION_BRIEF.md`; load it only when a work order needs original detail or wording.

## Objective

Keep remote-model working context bounded as conversation history grows, while preserving correctness, provenance, and exact recovery. Correctness and recoverability take priority over maximum token reduction.

## Required design

- Persist every raw event before compacting or suppressing it.
- Represent active task state as `Goal`, `Constraint`, `Decision`, `OpenQuestion`, and `RejectedAlternative` items with explicit lifecycle states and provenance.
- Let an extractor propose only a structured State Delta; validate strictly and apply transitions deterministically in code.
- Assemble working context from active state, required dependencies, historical handles when selected, recent raw evidence, and current input.
- Never delete source evidence because of a semantic guess.
- Support immutable headlines, literal-safe search, and exact raw recall.
- Keep the model interface replaceable; another expensive remote reasoning pass must not be required by context management.
- Keep compiler failure recoverable by a host-selected safe fallback.

## v0 exclusions

Do not implement experience extraction, intuition, autonomous long-term memory, graph databases, provider training/distillation, semantic retrieval, a background autonomous agent, or broad host-framework rewrites.

## Required evaluation

Compare D0 full context, D1 recent-window baseline, and D2 compiled context. Report context token reduction, constraint retention, decision continuity, resolved-issue reopening, open-question continuity, recall recovery, and local compile latency. Include historical recovery and failure/fallback cases.

## Current mapping

- Durable raw store: implemented.
- Typed state, strict parser, deterministic reducer: implemented as library primitives.
- Context assembly: implemented.
- Headline and exact/keyword recall: implemented as explicit tools.
- Seven-tool local MCP service: implemented.
- Automatic state evolution: planned in ST-01.
- Evaluation runner: planned in ST-02.
- Runtime extractor provider: deferred to ST-03.
- Formal host compiler mode: deferred until the above are accepted.
