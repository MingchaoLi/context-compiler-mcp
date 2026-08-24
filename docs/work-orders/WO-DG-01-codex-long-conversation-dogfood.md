# WO-DG-01 — Codex Long-Conversation Dogfood-01

状态：PLANNED / OBSERVATION ONLY

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

### A — Codex 原生长会话

- 同一模型从当前主线程原生继承上下文。
- 禁止读取 repo、调用工具或接收 B / C 内容。
- 一次回答 12 个预注册探针；记录原始回答、condition、置信度，不自评分。

### B — 冻结 v0 compile_context

- 独立 fresh model session，不继承当前线程。
- 只接收一次真实 compile_context 输出与相同 12 个探针。
- Recent Raw 固定 N=3；normal multiplier=5、recovery multiplier=8、dormancy multiplier=15，均只作为冻结配置，不调参。
- Dense 不由 core 生成；本轮 broad comparison 固定 BM25-only，以免把未校准向量引入主比较。
- 另做 narrow normal / verified-failure targeted recovery，观察远期 `DSH_HOME` evidence 是否只在 recovery 中恢复。
- 编译上下文、trace 与回答分开保存；回答模型不得看到 C 的 required / forbidden key。

### C — Deterministic Ground Truth

- 12 个探针逐项记录 required facts、forbidden claims、critical 标记和 Git/path provenance。
- 自动评分只做预注册的 normalized lexical assertion；任何同义但不能机械确认的项标记 `manual_required`，不得默认为通过。
- authority 冲突以冻结文档/accepted QA/较新 decision 为准，不以 A 或 B 的多数意见为准。

## 宿主数据

- Git event stream：从 `afff9367b2c46917e6f6a3483fc493966be63dc6` 后到 observation baseline 的 123 个真实提交，记录 commit SHA、author time 与 subject；运行时读 Git object，不复制整份日志为新的 Gold。
- directive stream：只保存当前长会话中已经发生的去敏工程指令摘要，并以 `after_commit` 锚定顺序；不得保存逐字私聊。
- typed state：人工、显式、可审计地从 accepted docs 建立，专门用于观察 upper-bound host integration；必须标记 `oracle_typed_state`，不声称 extractor 已生成。
- Experience Ledger：只观察 compile trace / retrieval hit；本工单不生成 Candidate Experience。

## 探针覆盖

至少覆盖：长期 Constraint、Decision supersession、RejectedAlternative reopening、远期 targeted recovery、无关旧信息激活、authoritative state 与宿主旧记忆冲突、A/B correctness/omission/pollution/context cost，以及全数据库 writer boundary 的 long-history / multi-session / concurrent latency。

## 性能观察

- 至少使用完整 123-commit + directive stream。
- 单 session 顺序 compile、两 session 并发 compile、compile 与 ingest 竞争各报告 raw latency；不设 PASS threshold。
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
- normal 与 targeted recovery 的远期证据差异来自真实 compile_context debug / event ids。
- latency 记录运行环境、样本数、原始值与失败数，不建立新门槛。
- 最终报告不声称 v0 优于 Codex、不声称 Codex App 内部 compaction 机制已被检查、不声称 Experience Formation 已验证。
- 独立 QA PASS 前状态保持 `PENDING`；任何 correctness P0/P1 只记录并返回，不在本工单修复。

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

