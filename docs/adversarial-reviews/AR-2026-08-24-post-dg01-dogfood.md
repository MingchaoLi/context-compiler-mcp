# AR-2026-08-24 — WO-DG-01 终局独立对抗审查

审查基线：`main@41383a4c9f1a5a0713288ade444c749b63e61e7d`，直接父 Builder `761eead96a6f9f70f969d7775e05b919e37bd814`，工作树 clean。范围仅含 AGENTS、当前 WO、Builder 报告、QA、计划 AR 与 `evaluation/codex-dogfood-01/` 的 capture、报告和 validator；未重跑模型，未修改 core、capture、Gold、算法、权重或 storage。

两份冻结 validator 在当前基线均原样 PASS。未发现推翻 `ACCEPTED / COMPLETE` 的 P0/P1；QA 把“观测链路和 artifact 完整性已接受”与“v0 效果、宿主 compaction、Experience Formation 未证明”分得足够清楚。

## Verdict

**Agree with reservations。**

接受范围只能是：一次 retrospective、oracle-state、不同 model/envelope 的 bounded observation 已完整落盘并可复核。它不是 Codex native memory 与 v0 的受控效果比较。报告绝大多数边界写对了，但“v0 相比 A 的真实增益”这一标题仍比证据强；其中 answer-level 差异只能称局部 artifact observation。

## Facts

- A 明示为 `A_native_host_after_minimal_repo_refresh`，在回答前已读取 `AGENTS.md`、PROJECT_STATE、ROADMAP；model id、input token 与 opaque compaction 均不可观察（`captures/native-a.json`）。固定 baseline 的三份刷新材料直接含有工具数、V0 freeze、DS-14 失败、feasibility seal、Formal Host、PACE/Experience、`DSH_HOME`、迁移关闭与当前路线等至少 10/12 探针的核心答案。
- A 的真实 capture 先发生；C 由声明未见 A/B 的独立路径生成并先落盘。`1fec67f` 的 post-capture protocol-alignment 将问题改回预先发给 A 的较窄原始措辞，并把 required groups 从 39 降到 21；README 明示修订未读取 A/B 输出。Git/validator 能证明最终 bytes 与提交顺序，不能从仓库本身证明会话外的 capture visibility。
- B 是 fresh `gpt-5.6-sol`/medium/`fork_turns:none` 的一次复合回答；A 的精确 model id 不可见。B 通过一次本地 packet read 接收人工 `oracle_typed_state` compiled packet，之后零 tool call；`repo_evidence_lookup:false` 和 `ground_truth_visible:false` 是 capture 合同字段。packet、capture 与 hash 可复核，但字段本身不是宿主级非访问证明。
- automatic lexical 只确认 A `3/21`、B `4/21`；人工语义表给出 A `10 pass / 2 partial / 0 miss`、B `10 pass / 1 partial / 1 miss`。语义 JSON 没有 reviewer id、blind/randomization 或 adjudication method 字段，且与 Builder 报告同一提交落盘；独立 QA 对 P04/P09/P12 和总数进行了复核。现有 verdict 看起来并非明显宽松：P04 两路均 partial、P09 B miss、P12 A partial。
- broad D0/D1/D2 为 `3056/710/1511`；D2 比 D0 少 50.6%，但比 D1 多 112.8%。normal narrow 没有 `DSH_HOME`，verified-failure 后 targeted recovery 的 narrow context 含 `DSH_HOME`，同时仍带入无关 PACE evidence。
- authority diagnostic 同时暴露新 ACTIVE Decision、旧 SUPERSEDED Decision 与旧路线 raw evidence；但其 `current_input` 已直接写出“不要恢复已被 supersede 的旧路线”。
- writer smoke 使用共享 barrier 同步两个 worker/service，对同一 SQLite 做 5 对 concurrent compile 和 5 对 compile/ingest；全部成功、无 busy。它是 macOS arm64 / Node 25.6.1 的低样本本机观测，不是 stdio host SLA。
- 123 项是约 27 小时内的真实 Git outcome trace；20 项是 retrospective sanitized directive reconstruction。ledger 总数包含三个 session 的 raw mirror 与 compile/hit telemetry：EVENT 435、CONTEXT_COMPILE 25、RETRIEVAL_HIT 38；ACTION/OUTCOME/FEEDBACK/CANDIDATE_EXPERIENCE 全为 0。

## Strongest challenge

### 1. A 主要测到“刚刷新权威文档后的回答”，不是 native long-memory 或 compaction 保留

**具体反例。** P09 的 `DSH_HOME` 与 P12 的两类并发迁移结论都直接出现在刚刷新的 baseline PROJECT_STATE；A 即使完全遗忘更早对话仍可答对。反之，任何错误也不能在 opaque host 条件下归因为 compaction。A 的 `10 pass / 2 partial` 因此只能描述该混合 condition，不能成为 native memory baseline。

post-capture alignment 是合理的 input-envelope 修正，且没有证据表明 C 看见答案；但 39→21 required groups 的事实意味着最终评分合同不是 repository-level pre-run freeze。它应称 blind post-capture Gold，而不是用“预注册”暗示所有评分细节在 A 前已冻结。

**建议。** 不重跑、不重判本轮 A。继续保留 `after_minimal_repo_refresh` 与 `not_attributable`；任何未来 native-memory 主张需在 repo refresh 前冻结 request/Gold/hash，并把 refresh 与 inherited-history 作为分离条件。

### 2. B 与人工 adjudication 不支持 answer-level“真实增益”

**具体反例。** P12 的 B pass/A partial 可能来自不同模型，也可能来自 oracle recent/state 中已人工汇总的迁移结论；当前实验无法归因给 compile_context。对 authority，oracle 直接编码新 Decision 和旧 Decision lifecycle，而 diagnostic query 又提示不要恢复旧路线；模型选择新路线只证明该 packet 可被照读，不证明无提示时的 authority resolution 或旧状态不会错误激活。

B 的一次 packet local-read 与冻结 hash 最多支持“该回答按声明由冻结 packet 产生”这一 artifact-level claim；它不足以证明与 A 同模型、同 context budget、同工具 envelope，也不足以隔离 oracle curation。人工语义 verdict 基本合理，但 artifact 缺少 reviewer/blinding provenance；它适合解释 12 个 assertion，不应变成效果统计或“独立样本”。

**建议。** 将报告“v0 相比 A 的真实增益”按事实理解为：typed labels 可见、P12 在 B answer 中更完整、recovery context 含所需证据；不得理解为 v0 提升 answer correctness。QA 已通过限制性文字实质保留了这个边界，因此该措辞是 P2 解释保留，不推翻接受。

### 3. P09、authority、token 与 writer/ledger 证据都只到局部机制观测

**具体反例。** P09 的 broad miss 是本次 BM25-only 复合 query 的 critical experimental miss；targeted recovery 改成 narrow query、扩大窗口后找回 evidence，但没有第二次模型回答，所以只能称 context recovery，不能称 answer 修复或端到端成功。它也不是 frozen core P1：`DSH_HOME` 不是被遗漏的 ACTIVE Constraint，且冻结 recovery 合同确实返回了对应 raw evidence。

authority 的成功含提示答案，D2 又是 D1 的 2.13 倍；两者均阻止“typed state 以更低成本解决冲突”的组合结论。writer 双峰延迟与零失败只与全库 writer serialization 相容，不证明因果、p95/p99、同一 stdio 进程可用性或跨平台表现。三 session 的 435 EVENT 是同一重建数据的 mirror 计数，不是 435 个独立真实体验；零 Action/Outcome/Feedback 已正确阻止把 ledger 称作 EAO 或 Experience。

**建议。** P09 保留为 future observation baseline；D2-vs-D0 与 D2-vs-D1 必须继续并列。writer 和 ledger 不建立 Gate，也不因本轮结果重开 core。

## Cheaper path

不存在值得为本轮追加的 rerun、调参或评分修补；接受 bounded artifact 并停止最便宜。若下一步要验证“增益”，不要扩大 DG-01：另取 3–4 个 prospective 真实 operation，在任何 repo refresh 前冻结探针/Gold，记录实际 Event → Action → Outcome/Feedback，并尽可能固定同一 model/envelope。若只研究 authority，先用不提示正确路线的 neutral/adversarial query 做一个小 canary；无需 PACE、Dense 调参、Graph DB 或新 judge。

## Falsification

### 会推翻本次接受的证据

- 证明 C/Gold 作者实际看过 A/B 输出后选择 required/forbidden key，或 A/B 并非相同逐字 12 题；这会破坏当前隔离合同。
- 冻结 hash、baseline Git blobs、B packet/context 或 raw latency 样本无法由独立 validator 重建；当前两 validator 均 PASS，暂未出现该证据。
- 报告/状态把 `10/12`、targeted recovery、writer 零失败或 ledger EVENT 计数升级成 v0 优于 native host、compaction 因果、SLA 或 Experience Formation 效果；这将越过 QA 接受边界。

### 会让我撤回保留的证据

- A 在 pre-refresh 条件下按预先 hash 的 request/Gold 重复，且 A/B 使用可核验的同 model、同 inference envelope；这会显著降低 refresh 与 model confounding。
- condition-blind reviewer protocol、原始 verdict 与 disagreement/adjudication 记录可审计，并在多个 prospective operation 上复现；这会支持 answer-level比较。
- neutral authority query 在多个真实 supersession 案例中仍选择新 authority，或 repeated recovery 在冻结触发条件下稳定恢复关键 evidence；这会把目前的提示性/单例诊断提升为更可信机制证据。

## Residual uncertainty

本轮只覆盖 macOS arm64 / Node 25.6.1 的一次复合回答和低样本本机 writer smoke；不得推断 Windows、精确 Node 24、其他模型、其他 host、长期稳定性或真实 compaction 行为。
