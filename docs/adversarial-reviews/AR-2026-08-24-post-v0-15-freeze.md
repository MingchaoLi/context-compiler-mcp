# AR-2026-08-24 — WO-V0-15 冻结后终局对抗审查

日期：2026-08-24  
固定审查基线：`main` / `87f6d49097234726aff973d54271f238e7ce8340`，父提交 `76169d8f99e6c0fbe7d99a640cd8d21c033cdf9e`，开始时工作树 clean。  
边界：只读检查 WO、最终 QA、PROJECT_STATE / ROADMAP、D-015 及必要源码/测试；未运行网络、模型或历史实验，未修改冻结状态、代码、数据、工单或状态文档。

## Verdict

**Challenge。** 冻结边界与大部分最小机制是克制且可核对的，也没有发现 PACE、Graph DB、复杂 ontology 或调参扩张；但存在一个可由当前公开兼容接口触发的 **P1 dormant false-positive**。因此“ACCEPTED / FROZEN”尚不能作为 dormant correctness 已收口的证据。在此 P1 之外，Dense 效果、Context / State 语义效果和 Experience Formation 效果均未被证明；当前文档大体正确地把它们标为未评估。

## Facts

- Recent Raw 按最近完整用户轮次独立选择；raw `content` 被 clone 后原样进入 `recent_conversation`，没有摘要或 token-budget 淘汰。渲染只增加序号/角色标签，不改正文；`retrieved_history` 是另一区域。
- suppress / dormant 只改变本次前台 placement，不写 authoritative state，不更新或删除后台 raw；raw 与 ledger 的 append-only trigger、EVENT 同事务 mirror 已由最终 QA 覆盖。
- BM25、caller-supplied Dense、Dense 整腿退化与数值稳定性已有机械测试；5 / 8 / 15、limit、weights 都保留为有界可配置参数。D-015、PROJECT_STATE、ROADMAP 和最终 QA 均未把这些测试说成相关性或效果证明。
- targeted recovery 只接受同 session、已存在且 `event_type === "verified_failure"` 的 raw 引用；代码验证的是调用方标签与引用合法性，不验证“失败”语义是否真实。
- public ledger 只允许 ACTION / OUTCOME / FEEDBACK / CANDIDATE_EXPERIENCE；EVENT 与 compile/hit trace 保留给内部写入。same-session、existing parent/raw refs 和 append-only 可支持后续重放 Event→Action→Outcome/Feedback→Candidate 的调用方记录，但不会校验因果链、提炼 Experience 或 promotion。
- 未发现 provider、PACE、Graph DB、learned retrieval、复杂 ontology 或权重调参实现；MCP 仍为九工具，ledger 新能力保持 library-only。
- 最终 QA 在 source candidate `76169d8...` 上关闭了先前三轮已知问题并明确 Dense / Experience Formation 效果未评估；但它没有覆盖下面的公开 v1 update 反例。`docs/REQUIREMENTS_V0.md` 仍称 Checkpoint C “等待独立 QA”，是一个非阻塞的状态陈旧点。

## Strongest challenge

### 1. P1：合法的晚近 v1 更新会被当成“之后无 update”，刚更新的 ACTIVE Goal 可被 dormant

**具体反例。** 在同一 session：先用带 `operation_id` 的 compile 建立可信 telemetry baseline；turn 2 通过有 current-event provenance 的路径创建 ACTIVE Goal；推进到 turn 17；再通过仍被 WO 明确保留兼容的 public `prepare_state_update` / `apply_state_delta` v1 路径更新该 Goal 内容，但不增加 `DERIVED_FROM`；随后用无关 query 和 `operation_id` compile。实际结果是 `get_state` 仍返回刚更新、ACTIVE 的 Goal，而 compiled `active_goals` 为空，Goal id 出现在 `dormant_state_ids`。

**证据位置。** `src/state-update.ts:115-133` 的 public apply 仍调用 `parseStrictStateDeltaPayload`；`src/extractor.ts:220-257` 明确把它与强制 current-event provenance 的 v2 parser 分开。`src/operational-context.ts:469-525` 的 dormant eligibility 只取 item / DERIVED_FROM 的 raw seq 与 turn，并未使用 `ContextItem.updated_at` 或任何“状态后来被更新但缺 current-event provenance”的 fail-open 信号。现有 `test/operational-context.test.ts:221-238` 所谓 updated item 只是直接构造 `source_refs:["e17"]`，未走被承诺兼容的 public v1 update。

**推断。** 这违反 WO 的“之后无 provenance/update”和“telemetry 不完整时 fail-open”：状态更新是 authoritative mutation，却未进入 dormant recency 的信任根。结果不是保守多留，而是从前台漏掉刚更新的 ACTIVE state。

### 2. 机制可复算不等于研究效果成立

**具体反例。** 所有 Dense 候选向量都可合法、同维、同 space，却与真实语义无关；hybrid 算术仍完全通过，而相关性可能弱于 BM25。类似地，调用方可把任意普通事件标成 `verified_failure`，或把任意已有 ledger record 设为 CANDIDATE_EXPERIENCE 的 parent；引用检查会通过，但没有证明失败归因、因果链或 Experience 已形成。

**证据位置。** WO “明确不做”、D-015、PROJECT_STATE / ROADMAP 和最终 QA 都把 Dense 与 Experience Formation 效果列为未评估；`src/operational-context.ts:836-837` 只检查 exact failure 标签，`src/experience-ledger.ts` 只冻结记录类型和引用完整性。

**推断。** 当前实现是可追溯 data plane 与可配置实验机制，不是 Context / State semantic correctness、Dense 增益或 Experience Formation 的效果证据。这是必须保留的解释边界，不是要求现在加入 judge、ontology 或调参。

### 3. “冻结后只转向真实使用”成立，但须先允许 correctness-only 返回

**具体反例。** 若把 FROZEN 解释为不得修 dormant，真实使用会系统性隐藏上述刚更新 Goal；若反过来为解释 ledger 因果而加入 ontology / Graph DB，或为 Dense 找最佳 5 / 8 / 15 与权重，则会把基础收口重新扩成 Context 研究。

**证据位置。** WO 与 ROADMAP 已明确冻结后只允许 correctness 修复，且下一阶段为真实使用与数据积累；未找到上述架构扩张的实现依赖。

**推断。** 当前真正 blocker 只有 P1 correctness 缺口。其余缺少效果证据应通过明确“不证明”来处理，不是实现更多基础设施的理由。

## Cheaper path

只开一个 dormant correctness fix，不重开 A/B/C、不调 retrieval、不增加 MCP 工具、PACE、Graph DB、ontology、模型或 Experience logic：当 item 在最近可证明 provenance 之后发生 public 状态 mutation，而系统无法把该 update 映射到可信 user turn 时，dormant 必须 fail-open。增加一个走真实 public v1 prepare/apply 的非空回归：baseline→旧 provenance create→跨阈值→晚近 source-less update→compile，断言 ACTIVE item 仍在前台；同时保留已有 v2 provenance、never-hit、dependency/Constraint、query reactivation 与 telemetry 攻击回归。独立 QA 关闭该反例后，下一步仍应是积累真实 Event–Action–Outcome / Feedback 数据，而非新的 Context 设计。状态文档的陈旧句可由主控另行机械校正，不是本修复 blocker。

## Falsification

- **推翻本次 Challenge：** 证明 source candidate 上上述顺序无法通过公开 v1 prepare/apply 被接受，或 WO 已明确废弃 source-less v1 update；两者目前均与源码和冻结兼容合同冲突。更直接的撤回条件是：correctness fix 使任何无法证明 update recency 的 item fail-open，并由上述真实 API 回归及独立 QA 证明非空关闭。
- **推翻“效果未证明”的保留意见：** 必须有冻结 protocol 下的真实长期使用数据，分别显示 Dense 相对 BM25 的增量、Context / State 对后续任务的可归因帮助，以及 Event–Action–Outcome / Feedback 到 Experience 的形成/使用结果；算术、schema、触发或 append-only PASS 不足以做到这一点。
- **推翻 ledger/recovery 边界担忧：** 后续消费者若始终把 `verified_failure` 和 parent chain 标为 caller assertion / provenance，而不是验证过的语义与因果，并且不据此宣称 Experience Formation，则该项不再构成反对。

## Residual boundary

本审查没有发现除上述 P1 外的新 P0/P1，也不反对最小 Ledger、Recent Raw、bounded hybrid 或 targeted recovery 本身。macOS / Node.js 25 的通过不能外推为 Windows 或精确 Node.js 24 已验证。
