# WO-DS-03 — Starlette long/open canary 与冻结就绪门

状态：PLANNED

## 背景与对抗审查处置

WO-DS-02 只接受了 short/medium schema pilot。随后独立对抗审查 `AR-2026-08-23-starlette-schema-pilot.md` 判定为 `Challenge`：现有 validator 没有覆盖 long 顶层 tier、没有可执行的信息增量计数规则、模型输入仍缺少字段级 projection，且字面 validator 不能证明语义上无 future leakage。

本工单接受该挑战，不直接批量冻结六案。只用一个未参与 pilot、截至截止日仍 open 的 `STR-04` 作为 canary；canary 通过独立 data QA 后，才允许另开剩余五案的批量 freeze 工单。

## 单一结果

在不运行模型、不修改 Context Compiler core 的前提下：

1. 把 `STR-04` 规范化为一个 long/open canary；
2. 将 long tier、信息增量节点和字段级模型输入 projection 变成可执行合同；
3. 对 canary 做冻结日 contamination 复扫、hash 固定和人工语义泄漏审计；
4. 证明或否定当前 schema 是否足以继续批量冻结剩余五案。

本工单不以“通过 canary”为预设结论。若证据不足、污染确认或 schema 需要超出本工单的重新设计，交付应是明确 FAIL/gate closed，而不是改样或改 Gold。

## 路由上下文

只读取：

- `AGENTS.md`；
- `docs/PROJECT_STATE.md`、`docs/ROADMAP.md`；
- 本工单；
- `docs/evaluation/starlette-v1-candidate-survey.md`；
- `docs/adversarial-reviews/AR-2026-08-23-starlette-schema-pilot.md`；
- WO-DS-02 的 schema 报告、handoff、最终 QA；
- `evaluation/starlette-v1/README.md`、`validate-pilot.mjs`、现有三个 pilot manifest/data 与聚焦测试，仅用于复用已接受合同；
- `Kludex/starlette` / `encode/starlette` 中与 Issue #685、PR #1286、#1649、#2349 及其直接评论、review、commit、test、状态事件相关的公开 GitHub 主来源；
- 与 STR-04 精确 source path 的公开 contamination 检索结果。

不得读取原始需求归档、同级项目、宿主代码、旧 aiohttp/HTTPX 数据或任何 D2/model 输出。

## Long 与信息增量合同

每个 segment 必须显式列出 `information_increment_event_ids`。这些 id 必须：

- 属于该 segment 的 `event_ids`；
- 按真实事件顺序排列且不重复；
- 每项引入新的事实、状态、已否决方案、约束、未解决问题或 Outcome 证据；
- 不把纯状态同步、重复确认、格式变更或无新增语义的评论计数。

层级按信息增量数机械定义：

- short：3–4；
- medium：5–8；
- long：至少 9。

单 segment manifest 的顶层 tier 必须与 segment classification 一致；`boundary_audit` 只允许多 segment pilot。现有 STR-08、STR-05、STR-02A/B 必须补齐该字段；若逐事件审计证明原分类与机械规则冲突，必须透明改层并撤回旧分层声明，不得通过漏计真实增量维持配额。

## 预检修订（2026-08-23，实施前）

在开始修改 schema 前，对现有 pilot 逐项应用上述机械规则，发现 `STR-05` 的 9 个事件分别引入：问题、首个实现、暂时解决、回退重开、第二次实现、安全约束、opt-in 设计、评审风险问题、作者接受设计。没有可诚实排除的纯同步事件，因此 `STR-05` 必须从 `medium` 改为 `long`。

该发现推翻了原“正式最小集 2 short / 2 medium / 2 long”的分层声明，但不推翻已接受的 schema pilot；pilot 的作用是验证文件隔离和时间边界，不是固定样本配额。本工单据此增加以下约束：

- 不为维持 2/2/2 而少计 `STR-05`，也不自动从 reserve 替换案例；
- DS-03 仍可检验 long canary、增量合同和模型投影；
- 即使 STR-04 canary 通过，进入其余五案前也必须重新预注册分层，不能沿用旧 2/2/2；
- 后续效果报告必须按实际 tier、component 与 outcome 分开披露，不把配额平衡误写为代表性。

## 字段级模型输入 projection

新增可执行、可测试的 projection，只允许把 cutoff 前 event 映射为后续 evaluator 所需的 raw user turns，并单独输出 Current Task。模型可见 event 只能包含：

- 稳定 event id；
- `role`；
- `event_type`；
- `occurred_at`；
- `actor`；
- cutoff 时可证明的 `summary`。

不得进入模型输入：

- `source_updated_at`；
- `source_content_sha256` / fixture hash；
- GitHub node/database id、merge SHA 或审计说明；
- Gold、Oracle、Decision Reference、Outcome Anchor；
- “当前正文后来被编辑”“后续信息不可见”等策展者后见说明。

validator 只可被描述为结构、时间前缀、provenance 和规范化字面边界防线；不得声称它机械证明语义无泄漏。语义改写必须由独立人工 source audit 处理。

## STR-04 canary 边界

预注册主线固定为 Issue #685 与 PR #1286、#1649、#2349。必须区分：

- 原始 APM/route-name 需求；
- 全局 middleware 先于 routing 的架构约束；
- #1286 的候选方向与关闭；
- #1649 交付 Mount middleware 后造成的暂时关闭与 scope-creep 纠正；
- #2349 的 Route/WebSocketRoute middleware 是部分能力，且不能冒充 #685 的最终解决；
- 截止日仍 open 的原问题。

需要至少 9 个可审计信息增量节点，否则 canary gate 失败；不得为了 long 配额合并重复评论或加入无关事件。

## Contamination 与 freeze

- 在任何 D2/model 运行前，按 WO-DS-02 已冻结规则对 STR-04 的全部精确 source path 做同日复扫；
- `no_public_hit_found` 仍只表示未发现公开复用；
- 若发现 `confirmed`，停止 canary，不从 reserve 中自动替换；
- 保存规范化文件 hash 和来源截止时间；hash 只证明字节冻结，不证明 Gold 正确或绝对无污染。

## 允许实现

- `evaluation/starlette-v1/` 下 long/increment/projection 所需的最小 validator 扩展；
- `evaluation/starlette-v1/canary/STR-04/` 的七类分离数据；
- canary hash/manifest、字段 projection 与聚焦测试；
- 中文 canary 报告、handoff、项目状态与路线图更新。

不得修改 `src/`、package runtime、MCP、依赖、retrieval/assembler/evaluator policy 或 provider 接口。

## 验收

- STR-04 至少 9 个真实信息增量节点，long/open 状态可由 provenance 重建；
- #1649/#2349 只作为 partial capability / Outcome Anchor，不把 #685 误标 resolved；
- manifest 的 tier/increment 规则机械可验；现有 pilot 按同一规则透明补齐增量 id，`STR-05` 改为 long，旧 2/2/2 声明撤回；
- projection 的正例只含允许字段，反例证明 audit metadata、Gold/Oracle/Decision/Outcome 不可进入；
- Current Task 不字面或语义复述未来答案；人工审计必须列出至少一个 validator 会放行但人工拒绝的同义泄漏反例；
- contamination 同日复扫完成且结论有限定；
- canary hash 固定，现有 pilot 仍保持 `pilot_not_frozen`；
- 不运行 D0/D1/D2、远端模型、aggregate 或 PASS rate；
- validator、聚焦测试、`npm test`、protocol、build 与 `git diff --check` 通过；
- 实现提交 handoff 后，由新的独立 data QA 固定候选并做 source、语义泄漏、projection、increment 与 hash 审计。

## Gate

只有独立 QA PASS 且确认 canary 没有要求新的 schema 合同变更，才允许另开剩余五案 freeze 工单。QA FAIL、确认污染、少于 9 个信息增量或字段 projection 仍泄漏后见信息，均保持 gate closed。

## 明确不做

- 规范化 STR-01、STR-05/06、STR-07/08 的正式冻结副本；
- 批量六案 freeze；
- D0/D1/D2 上下文运行或远端 GPT-5.6 回答；
- 自动语义泄漏检测、绝对训练污染证明或统计代表性声明；
- Context Compiler 新能力、Formal Host Mode、provider SDK、自动 headline 或综合数学总分。
