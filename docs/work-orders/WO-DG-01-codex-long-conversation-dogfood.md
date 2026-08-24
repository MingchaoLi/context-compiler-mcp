# WO-DG-01 — Codex Long-Conversation Dogfood-01

状态：PROTOCOL AMENDED / GROUND TRUTH FREEZE PENDING

## 目标

直接以当前 Context Compiler 独立项目在 Codex 中形成的超长真实会话与 123 个迁移后 Git 提交为第一批宿主数据，观察 Codex 原生长会话管理与冻结版 v0 的 State / Retrieval / Ledger 之间的实际关系。

本工单不以“v0 赢过 Codex 原生 Context”为成功条件，也不把 Codex 当唯一 judge。Ground Truth 必须来自固定 Git、冻结文档、decision record、QA / adversarial artifact；主观回答只作补充。

## 冻结边界

- WO-V0-15 保持 `ACCEPTED / FROZEN`。
- 只允许 observation、capture、deterministic evaluation、独立 QA 和报告。
- 不修改 `src/`、MCP 工具、Context 算法、BM25 / Dense 权重、5/8/15 参数、dormant 规则、ontology、SQLite schema 或 Experience Formation。
- 不引入 PACE、Graph DB、provider、embedding 生成器、宿主 adapter 或 Formal Host Mode。
- correctness finding 只记录并升级；不得在本工单修复。
- 原始私密对话、宿主 opaque compaction、数据库、日志、凭据和临时文件不得进入 Git。只提交去敏的 directive summaries、模型回答、hash、provenance 与聚合观察。

## 可观察边界

官方 OpenAI 文档只证明 Responses compaction 面向长流程续接，产物 opaque、设计上不供内部解析。因此：

- A 只观察“当前 Codex 线程继承上下文能否回答冻结探针”，不宣称看见宿主内部 compaction 表示，也不宣称 Codex App 必然使用某个公开 API endpoint。
- B 使用固定 source candidate `ad94f9350482be37f1a38538cf6b624fb69a2b9a` 的真实 `ContextCompilerMcpService.compile_context`，输入是当前项目 Git 历史与去敏 directive summary；不把人工 Oracle-State 冒充 extractor output。
- C 固定在 observation baseline `b7f00cefe809b1ffe9fac7d5e7885f7a7fdec8ed` 的仓库事实。
- A 输入 token、宿主内部 summary 字节和宿主 compaction latency 当前不可观察，必须记为 `not_observable`，不得由回答长度反推。

## 三条路径

### A — Codex 原生长会话（最小 repo refresh 后）

- condition 固定命名为 `A_native_host_after_minimal_repo_refresh`：它在 C/Gold 落盘前只执行一次，但当时主线程已经按项目规则读取 `AGENTS.md`、`PROJECT_STATE.md` 与 `ROADMAP.md`，因此不是 pure pre-task compaction probe。
- 当前 collaboration boundary 不暴露 A 的精确 runtime model id 或 input tokens；记录为 `inherited_current_codex_model / not_observable`，不得假称与 B 是严格同模型控制实验。
- 禁止读取 repo、调用工具或接收 B / C 内容。
- 一次回答固定顺序的 12 个预注册探针；这是 **1 个复合请求**，12 项不是独立样本。记录原始回答、condition、置信度，不自评分、不重跑。
- 只能报告该条件下 observable answer correctness / omission；任何结果原因都记为 `not_attributable_to_opaque_compaction`。

### B — 冻结 v0 compile_context

- 独立 fresh `gpt-5.6-sol` / medium / `fork_turns:none` session，不继承当前线程；一次、无 retry/follow-up/best-of。
- 只接收一次真实 compile_context 输出与相同顺序的 12 个探针，12 题整体也是唯一 `current_input` 与一个复合样本。
- Recent Raw 固定 N=3；normal multiplier=5、recovery multiplier=8、dormancy multiplier=15，均只作为冻结配置，不调参。
- Dense 不由 core 生成；本轮 broad comparison 固定 BM25-only，以免把未校准向量引入主比较。
- 另做 narrow normal / verified-failure targeted recovery，观察远期 `DSH_HOME` evidence 是否只在 recovery 中恢复；该部分只作 context diagnostic，不新增模型回答，也不混入 A/B correctness。
- 编译上下文、trace 与回答分开保存；回答模型不得看到 C 的 required / forbidden key。

### C — Deterministic Ground Truth

- 12 个探针逐项记录 required facts、forbidden claims、critical 标记和 Git/path provenance。
- C/Gold 必须由 `fork_turns:none`、未见 A/B capture 的独立路径仅从 baseline Git object/docs 生成，先提交并 hash；主控在 C freeze 后才可把既有 A capture 落盘。
- 自动评分只做预注册的 normalized lexical assertion；任何同义但不能机械确认的项标记 `manual_required`，不得默认为通过。
- authority 冲突以冻结文档/accepted QA/较新 decision 为准，不以 A 或 B 的多数意见为准。

## 宿主数据

- Git event stream：从 `afff9367b2c46917e6f6a3483fc493966be63dc6` 后到 observation baseline 的 123 个真实 **outcome trace**，记录 commit SHA、author time 与 subject；运行时读 Git object，不复制整份日志为新的 Gold，也不把 commit 冒充 user conversation turn。
- directive stream：只保存当前长会话中已经发生的 **retrospective sanitized reconstruction**，并以 `after_commit` 锚定顺序；它不是原始 host event stream，不得保存逐字私聊。
- typed state：人工、显式、可审计地从 accepted docs 建立，专门用于观察 upper-bound host integration；必须标记 `oracle_typed_state`，不声称 extractor 已生成。
- Experience Ledger：只观察 compile trace / retrieval hit；本工单不生成 Candidate Experience。

## 探针覆盖

至少覆盖：长期 Constraint、Decision supersession、RejectedAlternative reopening、远期 targeted recovery、无关旧信息激活、authoritative state 与宿主旧记忆冲突、A/B correctness/omission/pollution/context cost，以及全数据库 writer boundary 的 long-history / multi-session / concurrent latency。

## 性能观察

- 至少使用完整 123-commit + directive stream。
- 固定本机 Node/runtime、冷启动 1 次（单列）、warm 顺序 compile 5 次、两 session 并发 compile 5 对、compile 与 ingest 竞争 5 对；报告每个 raw latency、失败码与样本数，不设 PASS threshold，不一般化到其他平台。
- busy / lock / storage failure 只报告次数与样本；不优化。
- A 的宿主 input token / compaction latency 不可见；B 报告 service 自带 D0/D1/D2 token estimate 和 compile latency。两者不可直接冒充 apples-to-apples 成本。

## 交付

1. `evaluation/codex-dogfood-01/`：protocol、directive summaries、A/B captures、C Ground Truth、automatic report、latency observation、hash manifest 与 validator。
2. 中文报告 `docs/reports/WO-DG-01-codex-long-conversation-dogfood.md`，明确区分事实、真实增益、新问题、宿主 compression 影响、correctness blocker、非阻塞性能观察和尚不能得出的结论。
3. Builder handoff、独立 QA；关键节点独立对抗审查。

## 接受条件

- `git diff` 不包含 `src/`、package surface、frozen evaluation/Gold 或 WO-V0-15 状态改变。
- A/B/C 输入隔离可复核，C 不是由模型回答生成。
- 空 probe、零分母、不可观察成本均显式表示，不得 vacuous pass。
- A/B 使用同一 12 探针；B 只见 compiled context，不见 Gold。
- A/B model identity 不是严格控制变量：A model id 不可观察、B 明确 pinned；报告不得把回答差异归因为 Context 路径本身之外的单一原因。
- normal 与 targeted recovery 的远期证据差异来自真实 compile_context debug / event ids。
- latency 记录运行环境、样本数、原始值与失败数，不建立新门槛。
- 最终报告不声称 v0 优于 Codex、不声称 Codex App 内部 compaction 机制已被检查、不声称 Experience Formation 已验证。
- 独立 QA PASS 前状态保持 `PENDING`；任何 correctness P0/P1 只记录并返回，不在本工单修复。

## 计划级对抗审查处置

`docs/adversarial-reviews/AR-2026-08-24-pre-dg01-dogfood.md` 给出 `Challenge`。主控接受其测量有效性修订：

- A 降格为 minimal repo refresh 后的 observable answer condition，opaque compaction 因果一律不可归因；
- B 降格为 `oracle_typed_state compiled upper bound`，不代表 extractor 或端到端 v0；
- 123 commits 与 directive reconstruction 分别标记 outcome trace / retrospective reconstruction；
- C 由未见 A/B 的独立路径先冻结，禁止主控看过 A 后事后适配 Gold；
- authority conflict 固定为：旧 `DS-11/DS-13` 路线中的双真人盲评/继续 feasibility 记录，只是历史；较新的 `WO-DS-14` sealed baseline、`WO-V0-15` freeze 与 observation baseline `b7f00ce...` 为当前 authority。模型若采用旧路线即为错误恢复。
- A/B 成本分栏，writer latency 只称本机 smoke。

## 路由文件

只允许读取：

- `AGENTS.md`
- `docs/PROJECT_STATE.md`
- `docs/ROADMAP.md`
- 本工单
- `docs/REQUIREMENTS_V0.md`
- `docs/DECISIONS.md`
- `docs/qa/WO-V0-15-experience-ready-foundation-freeze.md`
- `docs/adversarial-reviews/AR-2026-08-24-post-v0-15-linearization-final.md`
- `src/mcp-service.ts`
- `src/operational-context.ts`
- `src/state-types.ts`
- `src/state-update.ts`
- `test/mcp-protocol.test.ts`
- 新增的 `evaluation/codex-dogfood-01/**`、handoff、QA 与报告
