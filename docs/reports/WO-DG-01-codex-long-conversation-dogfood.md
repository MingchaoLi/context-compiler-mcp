# Codex Long-Conversation Dogfood-01 报告

日期：2026-08-24  
状态：OBSERVATION COMPLETE — PENDING INDEPENDENT QA

## 结论摘要

这次 dogfood 没有证明冻结 v0 优于 Codex 原生长会话管理，也没有发现足以重开 WO-V0-15 core 的 correctness blocker。

在唯一一个复合请求中，A（Codex 原生继承上下文，最小 repo refresh 后）和 B（人工 Oracle-State + 冻结 `compile_context` upper bound）经独立语义复核均有 10/12 项完整回答。A 有 2 项 partial、0 miss；B 有 1 项 partial、1 项 miss。B 的唯一 miss 是远期 `DSH_HOME`：12 题合并成 broad query 时没有召回该事实，模型正确回答“未知”；同一事实由 narrow query 在一次可验证失败后的 targeted recovery 中成功恢复。

因此，本轮最可信的结论不是“谁赢”，而是：typed State 对强制约束、当前 Decision、supersede 与 rejected 状态提供了稳定、显式的 authority；bounded retrieval 的收益高度依赖 query 形态，复合 broad query 仍可能漏掉远期关键事实，失败后的 targeted recovery 可以补回，但会同时带入少量无关历史。

## 实验边界

- A：`A_native_host_after_minimal_repo_refresh`。采集前只刷新 `AGENTS.md`、`PROJECT_STATE.md`、`ROADMAP.md`；一次复合回答、无工具、无重试。精确 runtime model id、宿主输入 token、内部 summary/compaction 字节均不可观察。
- B：fresh `gpt-5.6-sol` / medium / `fork_turns:none`；只读取一次冻结 packet，不见 Ground Truth，不做 repo evidence lookup、retry 或 follow-up。该 packet 是 `oracle_typed_state_compiled_upper_bound`，不是 extractor output，也不是 Formal Host Mode。
- C：由未见 A/B capture 的独立路径从 baseline `b7f00cefe809b1ffe9fac7d5e7885f7a7fdec8ed` 的 Git objects、冻结 docs、QA/AR 生成并先 hash/freeze；不是由 A/B 回答事后生成。
- 样本单位始终是 1 个复合请求中的 12 个非独立 assertions，不报告为 12 个独立样本，不设综合 PASS threshold。
- 宿主数据为 123 个真实 Git outcome commits + 20 条 retrospective sanitized directive summaries，共 143 个 Raw Events；不含原始私密对话，也不把 directive reconstruction 冒充原始 host event stream。
- [OpenAI 的公开 Responses compaction 资料](https://developers.openai.com/api/reference/java/resources/responses/methods/compact)只支持“可续接长流程、compacted item opaque”这一产品级事实；本轮不能据此断言 Codex App 使用了哪个 endpoint，也不能检查宿主内部表示。

## 已观察到的事实

### A/B 回答

| 条件 | pass | partial | miss | forbidden |
|---|---:|---:|---:|---:|
| A：native host after refresh | 10 | 2 | 0 | 0 |
| B：oracle-state compiled upper bound | 10 | 1 | 1 | 0 |

差异集中在三处：

- P04：A/B 都没有在同一回答中完整枚举冻结 key 的全部范围，均为 partial。
- P09：A 正确恢复 `DSH_HOME`；B 的 broad compiled context 没有该事实，模型明确答未知，记为 critical miss。
- P12：A 识别 fresh/legacy/backfill 类别但没有清楚表达两类并发关闭边界，记 partial；B 从 Recent Raw 的最终迁移记录中给出两类事实，记 pass。

其余关键项两路均正确：项目/宿主边界、9 工具、WO-V0-15 冻结、Extractor 失败且 Predicted State 全空、feasibility-01 不等双真人且不重跑、Formal Host 未实现、PACE/Graph/Experience 未进入 v0、writer 风险，以及新路线 supersede 旧 Starlette/盲评路线。

### State / authority

人工 typed state revision 为 2，包含 1 Goal、3 个 ACTIVE Constraint、1 个 ACTIVE Decision、1 个 OPEN OpenQuestion；3 个 RejectedAlternative 与 1 个 SUPERSEDED 历史 Decision 进入 compact historical notes。State audit 有 16 条 `DERIVED_FROM` 和 1 条 `SUPERSEDES`。

authority diagnostic 同时包含：旧 condition-blind/Starlette 路线的 retrieved raw evidence，以及新的 Event–Action–Outcome/Feedback 路线的 authoritative Decision。B 最终采用新路线，未错误恢复旧 Decision；PACE、Graph DB、Formal Host 三个 rejected alternative 也没有被重新建议。

### Context 与召回

Broad composite 的原始 token 记录为：

- D0 full：3056
- D1 recent window：710
- D2 compiled：1511
- active state：193
- retrieved：142
- compile service latency：8.024 ms；wall：8.127 ms

D2 相对 D0 少 1545 tokens（约 50.6%）；但相对 D1 多 801 tokens（约 112.8%，约 2.13 倍）。因此不能只用 D2-vs-D0 reduction 掩盖它相对简单 recent window 的额外成本。

Recent Raw 固定 N=3，但由于完整 user turn 之间夹有 Git tool events，实际保留了 26 条 raw events、710 tokens；它没有被压缩。Broad retrieval 返回 8 条，其中包含所需的 DS-14/范围事实，也包含 3 条与当前 12 题关系较弱的 DS-02 pilot QA 历史，构成可观察污染。

对 `legacy DB fallback 的名称是什么？`：

- normal：1 条 retrieved event、21 tokens，只召回无关 PACE directive，`DSH_HOME=false`；
- 写入可验证 failure 后 targeted recovery：5 条 retrieved events、91 tokens，召回 DSH_HOME directive 及相关 migration commits，`DSH_HOME=true`；但 PACE directive 仍被带入。

Recovery 的 compiled total 为 868、normal 为 1228，但两次调用之间新增 failure event 改变了 Recent Raw 边界，不能把这个差值解释为 recovery 天然更便宜。

### Ledger

临时数据库只保留 aggregate audit，不进入 Git：

- `EVENT` 435
- `CONTEXT_COMPILE` 25
- `RETRIEVAL_HIT` 38
- `ACTION / OUTCOME / FEEDBACK / CANDIDATE_EXPERIENCE` 均为 0

这证明 frozen ledger 能记录 raw mirror、compile trace 与 retrieval hit；本轮没有形成 Event–Action–Outcome/Feedback 链，不能评价 Experience Formation。

## v0 相比 A 的真实增益

增益是局部且有条件的：

1. 强制约束和当前 Decision 以 typed state 明示，不依赖 semantic competition；B 正确保持目录边界、9 工具和冻结状态。
2. 旧 Decision 与 rejected alternatives 带明确 lifecycle 标签；即使旧路线同时出现在 historical/retrieved evidence，B 仍采用新 authority。
3. P12 的并发 migration 回答比 A 更完整。
4. narrow verified-failure recovery 能把 normal 模式没有恢复的远期 DSH_HOME 重新带回 context。

但 A 本身没有出现 complete miss，且多数关键事实已正确恢复；所以本轮没有观察到 broad v0 compile 的净正确性提升。P09 反而说明一次 broad compile 不能替代反馈驱动的 targeted recovery。

## v0 引入的新问题

- Broad compiled context 是 D1 的约 2.13 倍；接在宿主自身 summary/context 后会增加重复与 token 负担，实际宿主总成本仍不可观察。
- State、Recent Raw 与 retrieved evidence 会重复表达冻结状态和下一路线；本轮没有导致冲突，但存在重复。
- BM25-only broad retrieval 带入无关 DS-02/PACE 历史，并漏掉 DSH_HOME；query dilution 与污染同时存在。
- `dormancy_enabled` 在首个 broad baseline 为 false，后续调用虽为 true但没有 dormant/reactivated item；本轮没有实际检验 dormant correctness。
- Dense 未提供，状态为 `dense_unavailable_query_missing`；不能评价 hybrid 效果。

## 宿主 context compression 的影响

能确认的只有 observable answer：A 在最小 repo refresh 后仍能回答大多数当前事实，没有采用旧 authority。不能确认这些事实来自原生 long-history、opaque compaction、三份刷新文档、模型既有知识或它们的组合。

本轮没有把 Codex 的 opaque summary/compacted item 写入 Raw Event 或 Ledger；v0 看到的是 Git outcome trace 与脱敏回顾性 directive，因此不能判断宿主 compression 是否改变了我们的原始数据。B packet 与宿主 A 也不是同模型、同 input token 的严格控制实验。

当 state 与旧 evidence 同时出现时，B 采用 ACTIVE/SUPERSEDED 标签所表达的 authority，没有观察到 authority conflict；但只有 1 个复合请求，不能外推。

## Correctness blocker 与测量挑战

- 已证实的 frozen core correctness blocker：无。
- 实验级 critical miss：`DG01-CM-01`，B broad composite 未召回 P09/DSH_HOME；这是 bounded relevance 的实际失败，不在本工单调权重或修改算法。
- 自动 lexical scorer 只确认 A `3/21`、B `4/21` required groups，而独立语义 adjudication 为 A `10 pass + 2 partial`、B `10 pass + 1 partial + 1 miss`。差异来自 frozen exact phrase key 过窄；automatic result 只能作为 lexical diagnostic，不能作为事实正确性的最终门。
- B 使用人工 Oracle-State，阻止任何 extractor/end-to-end v0 correctness 结论；A/B model identity 与输入成本也没有被控制。

## 非阻塞 performance observation

环境：macOS arm64、Node.js v25.6.1；全部只是本机 smoke，不是 SLA。

- cold service open：19.707 ms；随后 cold compile wall：2.662 ms；
- warm sequential 5 次：3.040–3.638 ms，中位 3.368 ms；
- 两 session 同步 compile 5 对/10 次：6.526–19.491 ms，中位约 13.163 ms，0 failure；
- compile 与 ingest 竞争 5 对：compile 7.582–7.846 ms，中位 7.762 ms；ingest 12.836–12.886 ms，中位 12.866 ms，0 failure。

同步 pair 中一个调用明显落在另一个之后，和全数据库 writer serialization 风险一致；样本中没有 busy/STORAGE_FAILURE。它是值得真实宿主继续记录的非阻塞延迟信号，不足以证明 p95/p99、跨平台性能或需要立即重构。

## 尚不能得出的结论

- 不能说 v0 优于或劣于 Codex 原生 Context。
- 不能把 A 的结果归因于 Codex compaction，也不能声称检查了 Codex App 内部 context 管理。
- 不能把 B 当 extractor output、正式宿主集成或端到端 State Compiler。
- 不能证明 Dense、dormancy、Experience Formation、跨平台性能或真实 E-A-O 数据质量。
- 不能从 1 个复合请求、不同模型身份和 retrospective directive stream 推出稳健性或一般化。

## 后续边界

保持 WO-V0-15 `ACCEPTED / FROZEN`。本工单只提交 observation、capture、evaluation 与报告；不修改 core。下一步若继续，只应把同类真实宿主运行中的 Event–Action–Outcome/Feedback 以独立新工单积累，保留本轮 P09 miss、污染与 writer latency 作为观测基线，不在本工单调参或补算法。
