# Roadmap

Work proceeds in this order:

1. **ST-01 — Model-independent State Delta pipeline. IMPLEMENTED — PENDING INDEPENDENT QA.** Prepare/apply operations now use durable snapshot validation, revision checks inside the SQLite transaction, strict parsing, and atomic reducer application.
2. **ST-02 — Evaluation runner. NEXT AFTER ST-01 ACCEPTANCE.** Measure D0 full context, D1 recent window, and D2 compiled context, including token reduction, constraint retention, decision continuity, resolved-issue reopening, open-question continuity, recall recovery, and latency.
3. **ST-03 — Optional extractor transport.** Select or implement a provider only after evaluation defines the quality and latency contract. Keep the core provider-neutral.
4. **Host formal mode consideration.** Only after ST-01 through ST-03 are independently accepted may host repositories consider sending compiled context to a production model.

Automatic headline generation can be proposed as a separate bounded work order; it is not implied by ST-01.
