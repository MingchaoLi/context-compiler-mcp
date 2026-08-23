# AR-2026-08-24 — WO-V0-15 冻结返回最终复核

日期：2026-08-24  
固定基线：`main` / `69b803bc94903bef277759df1d38c466485e80ae`；source candidate `7567ac1219db65886bdc157af969c51a379a9fb9`；其父 `4ccb4a2d1e3fc51ce4e2aa960e97c26f4ea6af4e`；开始时工作树 clean。  
边界：只读检查 AGENTS、WO、最终 QA、STATE / ROADMAP、D-015、上一 AR 与必要源码/测试；未调用网络、模型或历史实验，未修改代码、数据、工单或冻结状态。动态反例只使用 `/private/tmp` 临时 harness，并在提交前清理。

## Verdict

**Challenge。** 上一 AR 的原始 public v1 source-less late update 反例已经关闭，current snapshot 的 14/15 turn 边界也成立；但修复放宽 eligibility 后暴露一个新的 **P1 pre-baseline telemetry gap**：首个可信 telemetry baseline 前已存在且真实命中过的 ACTIVE item，仍可在第 15 轮被当成“整个生命周期 zero-hit”而 dormant。最终 QA 的“没有新的 P0/P1/P2”以及完整 never-hit correctness 已收口，因此属于过度宣称。

## Facts

- 独立 public API 重放：先建立 telemetry、再创建 Goal、跨旧阈值后用 `prepare_state_update / apply_state_delta` v1 无新 `DERIVED_FROM` 更新 content。新 snapshot 的首个 compile 得到 `dormancy_enabled:false` 且 Goal 留在前台；插入两个中间 compile 后，新 baseline 后 14 个用户轮次仍不 dormant，第 15 个轮次才 dormant。authoritative Goal 始终为更新后的 ACTIVE。原 P1 与 snapshot baseline 不被中间 compile 重置的边界均已关闭。
- source candidate 只改 state-snapshot dormant logic、相应测试、handoff 与冻结文档；没有新增 provider、PACE、Graph DB、ontology、模型、MCP 工具或 retrieval 调参。
- `src/operational-context.ts:557-596` 以最新可信 trace 的 `state_revision + state_sha256` 匹配当前 snapshot，并取同 snapshot 连续尾部首 trace 作年龄 baseline；不匹配时全量 fail-open。
- `src/operational-context.ts:535-540` 同时把 item eligibility 从旧的“provenance 在 telemetry baseline 后”改成 `lastProvenanceSeq > 0 && <= snapshot baseline raw seq`，没有另行保留 session 首个 telemetry baseline 之前的未知历史边界。
- 新 service 回归 `test/operational-context-service.test.ts:198-301` 的三类 mutation 都先在 empty state 建 telemetry baseline，再创建两个 item；因此没有覆盖“item 先存在/命中，telemetry 后开始”的路径。

## Strongest challenge

### 1. P1：pre-baseline 未记录命中被当成整个生命周期 zero-hit

**具体反例。** 在新 session 中先通过真实 public v1 prepare/apply 创建 ACTIVE Goal；此时尚无 operation-id telemetry。用无 `operation_id`、与 Goal 内容相关的 `compile_context` 查询，调用合法、Goal 被前台命中且 compile read-only，因此 ledger 没有该 state hit。随后用无关 query + `operation_id` 建立首个可信 baseline；再增加用户轮次。独立结果为：第 14 轮 `dormant_state_ids=[]`，第 15 轮包含该 Goal，`telemetry_complete:true`，而 `get_state` 仍为 ACTIVE。系统把已经发生但按合同不可观测的 pre-baseline hit 当成 zero-hit。

**证据位置。** `src/mcp-service.ts:245-290` 只在已有可信 baseline 后拒绝无 id compile，baseline 前仍允许 read-only；`src/operational-context.ts:535-540` 只要求 provenance 位于当前 snapshot baseline 以内；D-015 `docs/DECISIONS.md:71-73` 与 WO dormant 条款要求完整 telemetry、整个生命周期 hit 为零，并要求既有/缺证据状态 fail-open。

**推断。** state hash 证明“当前 state bytes 是什么”，不能证明“该 item 在 telemetry 开始前从未命中”。snapshot correctness 不能替代 observation coverage。该反例会遗漏 authoritative ACTIVE state，严重度与上一 P1 相同。

### 2. QA 正确证明了返回条件，但错误外推到完整 dormant 合同

**具体反例。** QA 的 public v1 content/status/relation 动态用例都在 item 创建前先写 empty-state operation baseline；它能证明 mutation 后 snapshot rebaseline 与 14/15 算术，却天然排除了上面的 pre-baseline item/hit。

**证据位置。** `docs/qa/WO-V0-15-experience-ready-foundation-freeze.md:293-310` 记录三类 mutation 与 snapshot 攻击；新增测试的 empty baseline 在 `test/operational-context-service.test.ts:203-224`。QA 在同报告 `:330` 将证据外推为足够恢复整体冻结。

**推断。** “原反例通过”不等于“never-hit 信任根完整”。可以接受 state-snapshot fix 本身，但不能据此接受 dormant 的全部 fail-open 合同。

### 3. 七项最小收口中只有 dormant 仍是 correctness blocker，其余应保持效果边界

**事实。** (1) Extractor v2 合同有 scripted non-empty 机械证据，但没有远端语义 correctness；(2) Recent Raw 对象/正文原样保留且与 retrieved history 分区；(3) BM25 / caller-Dense 算术、整腿退化与 5/8/15 等配置边界可复算，但无效果证据；(4) dormant 存在上述 P1；(5) targeted recovery 只验证 same-session `verified_failure` 标签触发，不验证失败语义；(6) public ledger 是 append-only provenance data plane，可承载调用方 Event→Action→Outcome/Feedback→Candidate 记录，但不验证因果或形成 Experience；(7) 九工具/provider-neutral/scope freeze 与“下一步真实数据积累”边界没有发现扩张。

**推断。** 当前没有证据声称 Dense、Context / State 语义效果或 Experience Formation 已证明；QA、STATE 与 ROADMAP 对这点大体克制。snapshot 全局 rebaseline 还可能使频繁 state mutation 下 dormant 很少触发，但这是待真实数据验证的效果限制，不是另一个 correctness blocker。`docs/REQUIREMENTS_V0.md:65` 仍写 Checkpoint C “等待独立 QA”，属于非阻塞文档陈旧。

## Cheaper path

只补一个 telemetry-origin eligibility gate 与一个非空 public service 回归，不重开算法或 Experience 范围：同时保留 session 首个可信 telemetry baseline 与 current snapshot baseline；item 只有在其可证明 provenance/update 晚于 session telemetry 起点时才允许使用 snapshot 年龄。对于 telemetry 启动前已有、又无后续可信 provenance 的 item，永久 fail-open；对于上一 P1 中 telemetry 后创建、再 source-less late update 的 item，继续使用新的 snapshot baseline 与 14/15 边界。回归必须原样包含“pre-baseline 合法无 id 相关 query 命中→首 operation baseline→15 turn”，并断言仍在前台。关闭后，下一步仍只需真实使用数据，不需要 PACE、Graph DB、ontology、per-item scorer、参数调优或模型 judge。

## Falsification

- **推翻本次 Challenge：** 证明 baseline 前无 id compile 不可能命中 state，或证明 WO 的“整个生命周期 zero-hit / 既有数据 fail-open”仅指 baseline 后观察期；当前公开行为、D-015 与 WO 均不支持这两种解释。也可用最小 fix + 独立非空回归证明 pre-baseline item 永不因未知历史被 dormant，同时保留原 late-update 与 14/15 用例，本审查即撤回。
- **推翻 Builder / QA 判断：** 上述公开 API 序列已在固定 source candidate 动态产生 `telemetry_complete:true + dormant ACTIVE Goal`，因此当前已满足。
- **推翻效果保留意见：** 需要真实长期使用数据分别证明 Dense 增量、Context / State 对后续任务的可归因帮助和 Experience Formation；schema、算术、trigger、snapshot 或 append-only PASS 不足以替代。

## Residual uncertainty

本轮未发现新 P0；除 pre-baseline dormant P1 外，没有新 P1。macOS / Node.js 25 的结果不能外推为 Windows 或精确 Node.js 24 已验证。
