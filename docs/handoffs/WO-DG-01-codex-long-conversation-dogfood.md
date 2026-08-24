# WO-DG-01 Builder Handoff

状态：OBSERVATION COMPLETE — PENDING INDEPENDENT QA

## 固定边界

- v0 source candidate：`ad94f9350482be37f1a38538cf6b624fb69a2b9a`
- observation baseline：`b7f00cefe809b1ffe9fac7d5e7885f7a7fdec8ed`
- C freeze/alignment：`986d9db50463d07e021699c359b76005e6450223` / `1fec67f635717e7a6cc5f9d6390913118919df59`
- A/host/runner input：`ed9250934bfaeb4ee1fbda6d5eacd29830d9cbda`
- relation serialization fix：`47eafe6178783d0976399fe118c37d783684c70d`
- B packet/observation：`05da8cd0107c954c1c19b3f5909328bd356dc87f`

## 结果

- A：10 pass / 2 partial / 0 miss；B：10 pass / 1 partial / 1 miss；12 项不是独立样本，无总分阈值。
- B 的 P09/DSH_HOME 为 critical miss；同一事实在 verified-failure targeted recovery 中恢复。
- Broad tokens D0/D1/D2=`3056/710/1511`；D2 比 D0 少约 50.6%，比 D1 多约 112.8%。
- normal narrow 没有 DSH_HOME，recovery 有；两者都有无关 PACE evidence。
- authority diagnostic 同时有旧 raw 与新 state，B 采用新 Decision，未重开 rejected alternative。
- Ledger aggregate：435 EVENT / 25 CONTEXT_COMPILE / 38 RETRIEVAL_HIT；无 ACTION/OUTCOME/FEEDBACK/CANDIDATE_EXPERIENCE。
- writer smoke 全部成功，但 concurrent/competition latency 高于 sequential；完整 raw 值在 observation capture。

## QA 必查

1. A 是否确实早于 C 且无工具；C 是否未见 A/B；B 是否只读 frozen packet 且不见 Gold。
2. 123 commits、20 directives、143 events、state revision/关系与 token arithmetic 是否可独立重建。
3. normal/recovery 的 DSH_HOME 与无关 PACE event 是否能从 capture 原样复得。
4. manual adjudication 是否过度宽松；尤其 P04、P09、P12。
5. lexical 3/21、4/21 是否被错误解释成 answer failure；不得创建 aggregate PASS。
6. writer 样本、失败数、中位数与本机 smoke 边界是否准确。
7. diff 必须没有 `src/`、package surface、既有 frozen evaluation/Gold 或 WO-V0-15 状态变化。

## 禁止事项

QA 不得重跑 A/B 模型、不修改 capture/Gold、不调 retrieval/dormant/Dense、不修 P09、不把本报告升级为“v0 优于 Codex”的结论。

## Builder 验证

- observation validator：PASS
- independent C validator：PASS
- `npm test`：475 PASS / 1 个既有 opt-in SKIP
- `npm run test:protocol`：13/13 PASS，包含真实 pack、production-only 与九工具验证
- `npm run build`：PASS
- `git diff --check`：PASS
- 相对 source candidate 的 `src/`、package surface、Starlette/State Replay frozen evaluation diff：空
