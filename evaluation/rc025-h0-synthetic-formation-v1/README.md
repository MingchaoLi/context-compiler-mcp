# RC025 H0 synthetic Formation skeleton

This directory is an Evaluation-owned, disposable contract fixture. It composes a fake Core port, a fake Adapter
port, and a deterministic injected interpreter to exercise the frozen RC025 one-batch Formation lifecycle. It is not
imported by the product package, exported from the package root, wired to a Host, or backed by a product store.

The fixture uses only literal sanitized synthetic observations. Each run starts from fresh in-process state with a
separate receipt journal and canonical synthetic-memory region. The fake Core assigns batch, attempt, family,
revision, relation, and current-card identities. The fake Adapter can only invoke its supplied deterministic script
once and normalize the closed action envelope. No external service, private history, credential, or durable product
state participates.

The bound limits profile is `RC025_H0_LIMITS_V1`: at most 8 source Events, 2,048 estimated serialized-input units
under `CC_ESTIMATE_TOKENS_JS_UTF16_CODE_UNITS_DIV4_V1`, 8 Fact actions, 2 Experience actions, one attempt, and
16,384 serialized action bytes. Candidate projection is separately capped at 6 Fact cards and 2 Experience cards,
with scope and privacy filtering before relevance.

The executable focused test covers H0-01 through H0-18, the 24-cell lifecycle fault matrix, crash after claim, exact
replay, atomic failure, closed domains, limits, candidate filtering, current-card opacity, and deterministic identity
reconstruction.

Claim ceiling: `SYNTHETIC_OFFLINE_FORMATION_SKELETON_ONLY`. Passing this fixture is not a product Core or Adapter
implementation, QA verdict, integration result, deployment, completion, or `ACTIVE` authorization.
