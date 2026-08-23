# AR-2026-08-24 — WO-V0-15 telemetry 线性化最终返回复核

日期：2026-08-24  
固定基线：`main` / `e90c05f0cc091bdef6f4943dca9277bd992db635`；source candidate `ad94f9350482be37f1a38538cf6b624fb69a2b9a`；其父 `9883747fcffdc6bdc6d01da31363ee3edf6f47d1`；开始时工作树 clean。  
边界：只读检查 AGENTS、当前 WO、最终 QA、STATE / ROADMAP、D-015、前两份终局 AR、修复 diff 及必要源码/测试；未调用网络、模型或历史实验，未修改代码、数据、工单或冻结状态。独立动态 harness 只写 `/private/tmp`，已在提交前清理。

## Verdict

**Agree with reservations。** 两类原 P1 与后续跨实例 TOCTOU 均已由独立非空反例关闭；本轮没有发现新 P0/P1，也没有发现死锁、半提交 trace 或 busy 后不可恢复。`ACCEPTED / FROZEN` 可以维持。保留意见是：完整 compile 现在持有数据库级 writer boundary，真实长历史下的同宿主延迟/可用性尚未测量；该风险应由下一阶段真实使用观察，不是继续扩建 Context 基础设施的理由。

## Facts

- **P1-1 原样复验关闭。** telemetry origin 后创建 Goal，跨旧阈值再用真实 public v1 `prepare_state_update / apply_state_delta` 做无新 `DERIVED_FROM` 的 late content update：新 snapshot 首 compile `dormancy_enabled:false`；插入两个中间 compile 后，第 14 个用户轮次仍 active，第 15 个才 dormant；State Store 始终为更新后的 ACTIVE。
- **P1-2 原样复验关闭。** telemetry origin 前创建 Goal并执行合法、read-only、无 `operation_id` 的相关 query，确认 Goal 实际被选中；建立 origin 后跨 15 轮，Goal 仍 active、`dormant_state_ids=[]`。global-origin creation/provenance 双门不再把未知早期 hit 当零。
- `src/experience-ledger.ts:158-175` 在同一 ledger SQLite connection 上以 `BEGIN IMMEDIATE` 包住 operation、commit/rollback；nested boundary fail-closed。`src/mcp-service.ts:242-294` 把 state/raw/ledger 读取、deterministic assembly、trace/hits append 全部放进该 boundary。
- 独立同步调度未复用 Builder fixture：A 分别在 raw-read 后及 trace append 前暂停；B 的 raw ingest、public state apply 与 no-id compile 在 200 ms 观察窗内均未完成。A commit 后 writer 才完成、no-id 稳定 `INVALID_INPUT`；A rollback 后 no-id 成功且保持 read-only。另一已打开服务的 health/get_state 在该 SQLite writer lock 期间仍为亚毫秒级读取。
- 在 `RETRIEVAL_HIT` insert 注入失败时，先插入的 trace 与 hit 一并回滚为零；移除故障后相同 operation 成功，最终恰好一 trace/一 hit。外部 writer 锁使 compile 在约 5.34 s 后有界返回 `STORAGE_FAILURE`；释放锁后同一 operation 在同一服务实例成功，没有残留 boundary。
- source candidate 没有新增 schema、MCP 工具、算法、provider、PACE、Graph DB、ontology、权重调参、Gold/evaluation 或 Experience Formation；九工具与 package dependency 边界未变。

## Strongest challenge

### 1. 非阻塞：correctness 的代价是全数据库、跨 session 的同步 writer serialization

**事实。** `BEGIN IMMEDIATE` 是数据库级 writer boundary，而非 session-local lock；连 baseline 前本应 read-only 的无 id compile 也必须取得它。boundary 内的 `src/raw-store.ts:184-189` 和 `src/experience-ledger.ts:149-155` 会读取该 session 的全部 raw/ledger rows，之后才做 assembly；候选窗口虽有界，读取和 ledger validation 并未随 N 有界。`PRAGMA busy_timeout` 固定 5 秒（`src/sqlite-initialization.ts:17`）。

**推断。** 在真实长历史或多 session 共用一个 DB 时，一个慢 compile 可延迟无关 session 的 raw/state/ledger writer；超过 5 秒会暴露可重试的 `STORAGE_FAILURE`。这可能让“够用”的 operational value 降低，但当前动态证据显示等待有界、rollback 后恢复且无死锁，尚不足以定为 P1。

**建议。** 冻结后不要立刻换 reservation schema、异步 DB、per-session lock 或重新拆 transaction。先由真实宿主在既有边界外记录 compile p50/p95/p99、DB row counts、writer wait/`STORAGE_FAILURE` 与同 operation retry 成功率；只有观测到失败预算超标才另开 correctness/operational 工单。

### 2. 非阻塞：QA 的 reader 可用性证据不能外推为同一 stdio host 始终响应

**事实。** 本轮与 QA 都证明 WAL 下另一个已打开服务的 health/get_state reader 不受 writer lock 阻塞；同时产品使用同步 `DatabaseSync`，取得 writer lock时最多同步等待约 5 秒。

**推断。** 另一个进程/事件循环可读，不等于同一被阻塞的 Node stdio 进程还能并发响应 health。最终 QA 已披露 writer latency cost，但“host availability”仍未作为同进程 SLA 验证。当前项目尚无 Formal Host Mode 或并发 SLA，因此这是解释边界，不是冻结 blocker。

**建议。** 不为此提前实现 host adapter；真实 host 接入时明确 operation-id 重试与超时策略即可。若未来宣称同进程健康检查在 writer contention 下持续响应，必须另有真实 stdio 并发证据。

### 3. 七项收口与效果声明边界保持成立

**事实。** (1) Extractor v2 是 schema/provenance/scripted correctness，不是远端语义效果；(2) Recent Raw 对象与正文原样保留并和 retrieved history 分区；(3) BM25 / caller-Dense、整腿退化及 5/8/15/weights/limit 仍只是可复算配置；(4) dormant 的 snapshot、global-origin、telemetry linearization 已关闭现有 P1；(5) recovery 只验证 same-session `verified_failure` 标签触发，不验证失败真因；(6) public ledger 仍是 append-only Event–Action–Outcome/Feedback→Candidate provenance data plane，不做因果验证或 Experience Formation；(7) scope freeze 与下一步真实数据积累未扩张。

**推断。** 最终 QA、STATE、ROADMAP 已明确 Dense、Context 语义收益和 Experience Formation 效果均未评估，没有把自动/并发测试外推为研究效果。`docs/REQUIREMENTS_V0.md:65` 仍写 Checkpoint C “等待独立 QA”，只是一个应由主控以后机械校正的非阻塞陈旧状态。

## Cheaper path

当前不存在比“维持冻结、开始真实使用数据积累”更便宜且仍必要的实现工单。不要再为假设性 contention 加 reservation table、background queue、Graph DB、PACE、ontology、模型 judge 或 retrieval 调参。唯一低成本动作是在实际宿主侧观察延迟/忙失败/重试数据；若没有真实异常，不再修改 core。

## Falsification

- **推翻本次 Agree：** 任一独立反例证明 A 持 boundary 时 B 的 raw/state/no-id 能在 A commit/rollback 前完成；trace/hit 部分提交；rollback 后 session 永久锁死；busy 耗尽后相同 operation 无法恢复；或两类 dormant P1再次产生 ACTIVE 前台遗漏。当前固定 candidate 的独立结果均相反。
- **撤回可用性保留：** 真实长期 workload 覆盖大 raw/ledger history 与多 session writer 后，仍显示 compile/writer wait 在宿主预算内、busy failure 可忽略且 retry 稳定；或者未来用更短原子协议取得同等线性化证据。
- **推翻效果边界：** 只有真实长期数据能分别证明 Dense 增量、Context / State 对后续行动的可归因收益和 Experience Formation；transaction、schema、算术或测试 PASS 不能做到。

## Residual uncertainty

macOS / Node.js 25 的动态结果不能外推为 Windows 或精确 Node.js 24。未做真实长历史负载、同一 stdio 事件循环并发或宿主 SLA 测试；这些限制已明确，不改变本轮无 P0/P1 的判断。
