# WO-DG-01 独立 QA — Codex Long-Conversation Dogfood-01

日期：2026-08-24
QA 基线：`761eead96a6f9f70f969d7775e05b919e37bd814`
直接父提交：`05da8cd0107c954c1c19b3f5909328bd356dc87f`
结论：**PASS / ACCEPTED / COMPLETE**

## 范围与冻结边界

本次仅独立核查 WO-DG-01 的 observation、capture、C Ground Truth、报告与验证器；没有调用或重跑 A/B 模型，没有改动 `src/`、package surface、权重、dormant、storage、既有 frozen evaluation/Gold 或 WO-V0-15 状态。

候选相对直接父提交只增加 DG-01 evaluation、报告和状态文档；未见本工单引入的 core 或 package 改动。`git status --short` 在 QA 开始和提交前均为空。

## 隔离、来源与算术复核

- C Ground Truth 已在 `986d9db50463d07e021699c359b76005e6450223` 冻结，A 输入/capture 后在 `ed9250934bfaeb4ee1fbda6d5eacd29830d9cbda` 落盘，B packet/observation 后在 `05da8cd0107c954c1c19b3f5909328bd356dc87f` 落盘。C 的 `capture_visibility:none`、`created_from_model_output:false` 和固定 baseline Git blob/hash 均由 C validator 复核；Git 提交顺序也不允许 C 读取后续 A/B 文件。
- A 明示为最小 repo refresh 后的唯一复合回答、禁工具、无 retry，且 `input_tokens`、宿主 compaction 表示/延迟为不可观察，原因标为 `not_attributable_to_opaque_compaction`。这只能支持该条件下的 observable answer，不支持对 opaque compaction 的因果解释。
- B 的 capture 记录 `fork_turns:none`、`gpt-5.6-sol`/medium、一次 packet delivery、delivery 后零工具调用、`repo_evidence_lookup:false`、`ground_truth_visible:false`。它只看 oracle typed-state compiled packet，不是 extractor 或端到端宿主集成证据。
- 固定 Git 区间独立计数为 123 commits，directive reconstruction 为 20，首 session feedback 前 Raw Event 为 143；数据明确是 Git outcome trace 加 retrospective sanitized reconstruction，不是原始 host event stream。
- state revision 为 2，包含 1 Goal、3 ACTIVE Constraint、1 ACTIVE Decision、1 OPEN OpenQuestion、3 Rejected Alternative、1 SUPERSEDED historical Decision；relation audit 为 16 `DERIVED_FROM` 和 1 `SUPERSEDES`。旧 DS-11/13 路线同时作为 raw historical evidence 出现时，ACTIVE Decision 仍选择较新的 sealed/frozen real-use authority。
- broad D0/D1/D2 为 `3056/710/1511`：D2 比 D0 少 1545（50.6%），比 D1 多 801（112.8%）。automatic lexical 为 A `3/21`、B `4/21`，没有空 probe、零分母或 aggregate PASS；独立语义复核仍是唯一复合请求中的 A `10 pass / 2 partial / 0 miss`、B `10 pass / 1 partial / 1 miss`，不被外推成 12 个独立样本。
- ledger aggregate 为 EVENT 435、CONTEXT_COMPILE 25、RETRIEVAL_HIT 38，ACTION/OUTCOME/FEEDBACK/CANDIDATE_EXPERIENCE 均为 0；不能由此评价 Experience Formation。

## 关键反例与观测复核

- normal narrow retrieval 只有 PACE evidence、21 retrieved tokens、`DSH_HOME=false`；写入 verified failure 后的 targeted recovery 有 DSH_HOME directive 和相关 migration evidence、91 retrieved tokens、`DSH_HOME=true`，但 PACE 仍被带入。两次 Recent Raw 边界不同，不能将 1228 对 868 compiled tokens 解释为 recovery 天然更便宜。
- P09 是 B broad composite 对 DSH_HOME 的 critical miss，且 B 如实回答未知；它是 bounded broad retrieval 的实验级失败和后续 observation 基线，不是 core correctness P1：B 使用人工 Oracle state、该事实不在 broad packet、targeted recovery 可在冻结行为下恢复，且报告没有把它伪称为 extractor/端到端成功或失败。WO 冻结边界也不授权在本单修权重或算法。
- writer smoke 原始样本及失败数一致：warm 5 次中位 3.368 ms；两 session 5 对/10 calls 的 conventional median 为约 13.163 ms；compile/ingest 竞争各 5 次中位为 7.762/12.866 ms；全部 20 个 pair calls 成功、失败数 0。它们只是在 macOS arm64/Node 25.6.1 的本机 smoke，不是 SLA、p95/p99、跨平台或同一 stdio host 可用性证据。
- 在仅用于 QA 的临时 clone 中，C validator 原样拒绝：协调改写 payload+manifest+validator hash 后的 frozen header 不匹配、删除 Gold 的 missing filesystem path、未知/重复 JSON 表示的 payload hash mismatch，以及 Gold symlink；observation validator 也拒绝 ledger-audit symlink。临时 clone 已删除，未触碰仓库交付物。

## 验证

- `node evaluation/codex-dogfood-01/internal-ground-truth/validate-ground-truth.mjs` — PASS
- `node evaluation/codex-dogfood-01/validate-observation.mjs` — PASS
- `npm test` — 475 passed / 1 existing opt-in skipped
- `npm run test:protocol` — 13/13 passed，包括 production-only package 场景
- `npm run build` — PASS
- `npm pack --dry-run --json` — 以隔离的临时 npm cache PASS；默认 cache 因本机既有 root-owned 文件报 EPERM，属环境问题，不是包边界失败。
- source/package/frozen evaluation boundary diff — 本工单未见禁止改动。

## 缺陷与解释边界

- P0：无。
- P1：无。
- P2：`git diff --check 05da8cd..761eead` 指出 `docs/reports/WO-DG-01-codex-long-conversation-dogfood.md` 第 3 行有一处尾随空白；不影响 Markdown 语义、capture/hash 或验收结论，但 Builder handoff 的“diff --check PASS”不能按当前候选复现。依本次 QA PASS 的写入限制未改动报告。

报告正确保留以下边界：不得把 A 的回答外推为宿主 opaque compaction 已检查或可归因；不得把 B 的 oracle typed state 外推为 extractor、Formal Host Mode 或端到端 v0；不得把不同模型/envelope 的 A/B 成本作 apples-to-apples 比较；不得从单个复合请求、retrospective directive reconstruction、BM25-only、未实际检验 dormant 或本机 writer smoke 推出一般化结论。报告也没有把 v0 宣称为优于 Codex。
