# Project state

Updated: 2026-08-25

## Current approved baseline

- Append-only SQLite raw-event storage with per-session sequencing and source-event idempotency.
- Typed context state, SQLite state storage, strict State Delta parsing, and deterministic reducer primitives.
- Durable provider-neutral `prepare_state_update` and atomic `apply_state_delta` operations with immutable snapshot fingerprints and revision guards.
- Build-up context assembly from active state, dependency closure, recent raw evidence, and current input.
- Immutable history headlines plus exact and keyword recall.
- Strict versioned offline D0/D1/D2 evaluation with deterministic metrics, aggregate thresholds, and a package-safe JSON CLI.
- A local stdio MCP service with stable sanitized errors and exactly nine tools.
- Node.js `>=24`; official MCP SDK and Zod are runtime dependencies.
- Standalone package identity: `context-compiler-mcp`.

## Latest delivery status

WO-PUB-02 Raw Timestamp Compatibility 状态为 **BUILDER FIX COMPLETE / PENDING FRESH INDEPENDENT
RE-QA**，implementation baseline `b9b2dedebf97c6d9c66369af4aaab70904f73fe9` 后的首次 candidate
`462e35f58bb1bdd0b4f50dc833aa6925097b8292` 已被 QA
`64f787606b18d138c67b880ec43a1bd198629680` 退回：历史十位小数被拒、sub-ms instant 被截断合并、非法
stored timestamp 可穿透 `recall_exact`。append-only fix 支持完整 RFC 3339 `1*DIGIT` 历史精度，用完整
significant fraction 比较 idempotent instant，并统一 Raw Store 与 event/range/headline/keyword recall validator。
新 writer 仍只接受公开 1–3 位小数并 canonicalize；历史 bytes 不 UPDATE/backfill。Focused 111/111、全量
584 passed / 1 skipped、构建与 production-only package 已通过；等待 fresh re-QA。范围未扩大到 schema
migration、event size、user-turn/role、import、Retrieval、State 或 Natural QA holdout。

WO-PUB-01 Public MCP Result Boundary 已完成，状态为 **ACCEPTED / COMPLETE**。Builder source
candidate `4643a4761a7c2b91837a198c2f7ebc340fcb8511` 的首次 Independent QA
`6dbedcc417e5391b9023d6e251baa397b7fae2d9` 通过全部功能、协议、production-only package 与回归
检查，但因四处 implementation baseline 完整 SHA 无法解析而退回；append-only fixed candidate
`642b456f53a18a4bbce2276bf5d3b44f406fd9cb` 已由 fresh Independent re-QA
`764a5c0b477bb059a21f7d4a3208d01bc41aa2ec` 接受。实际 implementation baseline 为
`7a79ac631c4dd402b3cc157961e5844349d5c496`。stdio MCP
`compile_context` 以逐字段构造的
closed-world public DTO 返回最终 `rendered_context`、预算结果与九项有限聚合 metrics；
`operational_debug`、`debug_manifest`、candidate/ranking/score、trace/telemetry identity、内部
raw/state/path 清单与未来未 promotion 字段不会穿透。Core/library 完整结果、retrieval/State/数据库、
九工具 input/error 合同均保持不变。focused protocol 15/15、全量 571 passed / 1 skipped 与构建通过；
托管 `context-compiler-mcp 0.1.0` 已在 `2026-08-25T15:38:00+08:00`—`15:41:45+08:00`
由研发侧重连；clean ordinary-user connection 确认九工具可见且 `health.ready=true`，持久存储未清理。

WO-DA-01 Current Authority / Snapshot + Rolling Summary Adjustment Record 已完成，状态为
**ACCEPTED / COMPLETE**。planning baseline 为 clean `main`
`0a2d4437bc2b80714ae819654e5f41aab7a1a41e`。它只对账 DA-12 已由 accepted WO-05
promotion 的精确范围，并新增 DA-15，把 Rolling Summary 登记为 immutable、non-authoritative、
Raw-anchored future experimental candidate。Builder record 已冻结 unknown fail-closed、exact active
`DEPENDS_ON` closure、Manifest/Attempt/as-of/budget/opaque Host 边界，以及 A0 additive baseline
与后续固定预算 replacement Gate。首个 candidate `871e526` 因工单一处 planning-baseline
事实使用现在时被 QA commit `f219c4f` 退回；append-only fixed candidate `d66df126` 已由 fresh
Independent re-QA commit `5289a308` 接受，format-only QA commit 为 `244f37d5`。完整链仅为
docs-only，不修改 source/schema/test/config，不实现 Summary，不启动 WO-06/07、Host/provider/
model/network/MCP 或 Canonical State v2。

WO-05 ContextSnapshot Contract 的 Builder candidate
`c8c37b4beb230d2c37017b9c9d65aefa7e180eaa` 已被 Independent QA report commit
`88e8da7` 裁决为 **FAIL / RETURN TO IMPLEMENTATION**。新的 Core-private Snapshot owner 在单连接
`BEGIN IMMEDIATE` 中读取并证明 exact Ledger/State/Fact/Relation/Takeover world，确定性
组装 Current Authority + Frontier-bound Hot Raw，然后原子写入 immutable
ContextSnapshot + AttemptStarted receipt。Snapshot axis-neutral；不推进五轴，不推断
scope，不引入 semantic ranker/dedup、Retrieval/Summary、Host/provider/model/network 或 MCP
新工具。Independent focused 为 71/71，全量为 564 passed / 1 skipped，构建与
candidate diff check 通过；但 QA 证明可协调删除 `DEPENDS_ON` 闭包选入的
Relation + Fact + path + body，更新本地 Snapshot/Attempt 哈希并恢复 triggers 后仍被
stored read 接受。根因是历史读只以 Manifest 已列 refs 重建图，没有独立的完整
Fact/Relation as-of 投影证明。QA-return repair baseline 已由 standalone commit `9200d53`
固定；bounded pre-source Gate Addendum 现已冻结 `canonical-fact-relation` owner 的 additive
immutable complete-projection receipt、Snapshot v2 receipt ID/hash binding、同事务 capture、
receipt-first replay、幂等/并发/rollback/orphan/migration 与 S0–S5。机械审计确认现有 exact
object revisions 和同 handle transaction 足够，无需 substrate extension，也不增加第六全局轴。
append-only Builder fix 已完成：Snapshot v2 只绑定 owner receipt ID/hash，stored replay 从完整
receipt graph 重建 expected closure；S0–S5、focused 76 tests、全量 569 passed / 1 skipped 与
build 均通过。fixed candidate `fa7677101c145ffdbfca8bff0864ed992fa9a9b9` 已由 fresh
Independent re-QA commit `c3f691bb4a6b8f65822ba2b3410d05d93c5cbd9e` 接受，状态为
**ACCEPTED / COMPLETE**。QA 独立协调删除攻击正确返回 `CORRUPT_DATA`，后续同五轴
Fact/Relation 写入后的旧 Snapshot exact replay 保持稳定；rollback、migration、orphan、
tamper、concurrency、package-root privacy 与全量 569 passed / 1 skipped 均通过。一次并发
test helper 在 worker exit 前 resolve 的收尾锁竞争已如实记录；针对性 10/10 与全量复跑通过，
不构成本工单 correctness blocker。

WO-04C Semantic Takeover / Enrichment + Frontier + Compaction Artifact 已在 Builder
candidate `6642e4c04f4b7a5ff684c0399e4f83be075724f5` 通过 Independent QA，QA
commit 为 `d33f52281e2af857c16a79768c7d3fcde816da42`，状态为 **ACCEPTED /
COMPLETE**。Core-private 组合事务协调器复用 frozen substrate 的单连接 callback，
State v1 只引用 exact committed authority，Fact/Relation 通过 owner same-handle seam
原子 apply，Enrichment axis-neutral。连续 Frontier double-CAS、完整 coverage、immutable
Compaction Artifact、exact replay/reopen/tamper、并发冲突与 Hot Raw 重建均通过独立验证；
Focused 为 50/50，全量为 544 passed、1 skipped，构建通过。共享 substrate、Host/provider/
MCP、Snapshot/Working Context 与 frozen v0 均无漂移。下一顺序只能是先建立 WO-05
ContextSnapshot Contract 的有界工单与独立 Execution Baseline。

WO-04B Fact / Relation Authority + Policy 继续冻结在第二个 append-only fixed candidate
`8758f68bf4c6b604ae37fad13d15ca7e98c08bfc` 与 fresh Independent re-QA commit
`0236d88e7f6e7b04ca347bc0bdddbdbfa7582dc1`。显式 scope 的 Fact/Relation authority
具有严格四轴 Fact policy、typed Relation Registry、append-only object revisions、原子
domain commit、exact replay 与 same-scope Raw/Fact/State endpoint authority。

WO-04A Canonical State Revision Commit 已在 append-only 修复候选 `98e02ef898587b013ad588cf7ab2f182afa276e3` 通过 fresh Independent re-QA，QA commit 为 `74d39636e112054f7a4ea2b9a2e1be0b3728cdd7`，状态为 **ACCEPTED / COMPLETE**。原 Builder candidate `d35970a3d8b75e2d17a7f3d24c7dd179f664086a` 与 QA rejection `3359f002ab4d206617815942aaee4eb9e9706685` 完整保留。显式 scope 的 proposal-validated Canonical State 现在具有稳定 commit identity、完整状态快照/hash、State axis `+1`、same-scope committed Raw provenance、exact replay 与 fail-closed marker/read binding；re-QA 复现并关闭三个协调替换反例和 policy substitution 分类缺口。Focused 为 40/40，全量为 508 passed、1 skipped，构建通过；WO-03A/03B、legacy State、MCP exact-nine 与 frozen v0 均无漂移。

WO-03B Ledger High-water + Hot Raw Replay 继续冻结在 Builder candidate `24b7ba6971be2d8dc761368ecb66722ff053f4ea` 与 Independent QA commit `92e72eb785b2670068597376bccfd1136e3c6952`。显式 authority/shadow scope 的 canonical Raw Source projection 可原子追加 canonical Raw Event 并推进 scope-bound Ledger high-water；Hot Raw 从同一 read snapshot 中按 committed Frontier 重建，支持 cross-session provenance、exact replay、并发连续分配、legacy 无回填和 crash/no-push reopen。

WO-03A Shared Revision / Stream / Transaction Substrate 继续冻结在 fixed Builder candidate `c93072dc5e4b5c89464b003e716bbb688b072b89` 与 Independent re-QA commit `f02c5e12ee0931d4a23a999fa2dc2c0dbb977940`。WO-03B 没有修改该 substrate，也没有推进 Frontier、映射 legacy session/seq、改变现有 Raw/State/Recall/MCP/evaluation，或引入 Host/provider 依赖。

Umbrella WO-04 的三个有界子工单 WO-04A/04B/04C 均已完成并通过独立 QA。WO-04C
Execution Baseline commit `6b77ed06b250176fd9cff16b35ab1c3d4701c9a2`、source world
`c3a184f9c067d529e8f2908080ab72650fb59cbc`、Builder candidate 与 QA commit 均已固定。
WO-05 ContextSnapshot Contract 的 standalone baseline
commit `18a2ab3dc02657200e5d96eec3bfc9a715c316e6` 固定 source world
`0dbff6a8a148f37fcabef7accf7f71d057e1a90f`。Gate 选择新的 Core-private
`context-snapshot` owner：在单连接 `BEGIN IMMEDIATE` 中复用 accepted domain owner 的只读
same-handle seam，确定性投影/组装后原子写 immutable Snapshot + AttemptStarted receipt；
Snapshot axis-neutral，existing v0 assembler/operational context 与 shared substrate 均冻结不变。
source spike 随后证明 accepted current-semantic read seam 在 Takeover 后合法 Raw advance 时
错误要求完整五轴向量全等并返回 `CORRUPT_DATA`；该 source 草稿当时已隔离。
WO-04D Current Semantic Takeover Read Seam 已在 fixed candidate
`39334f94cb1c5ac37587cc261b261b427d2ba1b6` 由 Independent QA commit
`583cefaf12308229b3f3daa24982777bb884922b`
接受，状态为 **ACCEPTED / COMPLETE**。standalone Execution Baseline commit 为
`fcca8554d0bd6f0deeb0e4ab5d5f17676dcf8e39`；Builder 生产 delta 仅把 latest Takeover 的
完整向量全等改为 live component-wise at-or-after 历史提交向量，并新增后续 Raw advance +
Hot Raw + reopen 回归。focused 15/15、全量 545 passed / 1 skipped、构建通过；任何
writer/schema/public surface 均未变化。WO-05 随后恢复草稿并完成 Builder，物理分离的
Independent QA 现已在 fixed candidate `fa76771` 上接受 WO-05。

跨 Agent 转述对抗观察显示，显式矛盾较易被一致性检查发现，静默删除既有约束更难仅靠当前模型上下文可靠识别。v3.1.1 仅把 `Revision / Structural Diff` 与未来 `Audit Ripple` 的分工作为非规范研究观察记录；它不是 blocker，不扩大 WO-01，也不授权新的 Relation/Retrieval/Context 行为。

WO-DG-01 已由独立 QA 接受并完成。它保持 WO-V0-15 `ACCEPTED / FROZEN`，比较 A=最小 repo refresh 后的当前 Codex 原生继承、B=人工 Oracle-State 的冻结 v0 `compile_context` upper bound、C=固定 Git/docs/QA Ground Truth。独立语义复核为 A `10 pass / 2 partial / 0 miss`、B `10 pass / 1 partial / 1 miss`；B 的 P09/DSH_HOME broad miss 在 verified-failure targeted recovery 中恢复。D0/D1/D2 原始 tokens 为 `3056/710/1511`，D2 比 D0 少约 50.6%、比 D1 多约 112.8%。没有修改 core、权重、dormant、ontology、storage 或 Experience Formation；宿主 opaque compaction 仍不可检查，A 的真实输入 token 与 compaction latency仍为 `not_observable`。QA 另记录报告的一处非阻塞尾随空白；不影响观测结论。

WO-V0-15 的全部历史返回与接受证据继续 append-only 保留。第六个 compile telemetry 线性化 fix 已在固定 source candidate `ad94f9350482be37f1a38538cf6b624fb69a2b9a` 通过独立 re-QA，关闭首 trace 提交前跨实例 no-id compile 穿越 origin 的 TOCTOU P1；当前状态恢复为 **ACCEPTED / FROZEN**。完整 state/raw/ledger 读取、assembly、首 trace/hits 与 commit 处于同一可回滚 `BEGIN IMMEDIATE` boundary，竞争 raw/state writer 与 no-id compile 只能落在 origin 一侧。Windows 和 exact Node.js 24 仍未单独复跑。Dense retrieval、Context 语义收益与 Experience Formation 效果都未评估。

WO-EV-02 passed independent re-QA on 2026-08-23 at fixed source candidate `93b71dde1c660feb2671d974cbb6eedb3b58340a`. The accepted evaluator v2 preserves version 1 reproduction, rejects non-plain or untraceable Probe inputs before execution, represents empty rates explicitly as `not_evaluable`, excludes `current_input` from historical matching while retaining it in cost/latency inputs, and reports raw D2-vs-D1 token cost without adding a gate. The first QA return and append-only fix are retained in the QA report. The package and real stdio MCP were verified production-only with exactly nine tools. The QA matrix exercised macOS 26.5.1 / Darwin 25.5.0 arm64 with Node.js 25.6.1 and npm 11.9.0; Windows and exact Node.js 24 remain unverified.

## Current foundation status

WO-V0-15 保留 A/B/C checkpoint、全部 QA/对抗返回、历史接受与重开记录；state-snapshot、global-origin 和 compile origin 跨实例线性化反例均已关闭。A/B/C 现统一恢复冻结，后续默认只允许有独立复现证据的 correctness 修复。

首轮 telemetry、特殊 JSON、Dense 极值、persisted-row 错误分类和 Runtime v2 错误合同，以及后续 fresh DB 初始化与 legacy raw ALTER 两项竞争，均已在独立动态反例中关闭。完整证据与返回链保留在 `docs/qa/WO-V0-15-experience-ready-foundation-freeze.md`。

WO-DS-02 的 Starlette schema 与三案例 pilot 已在第二次独立 re-QA 于 2026-08-23 接受，固定候选为 `2a65c85b1fc9554b24971e8ed20551eef3b53d39`。交付包含 3 个目录、4 个独立 segment、25 个时间有序 evidence event/slice；Gold、人工 Oracle-State、Decision Reference 与 Outcome Anchor 和输入物理隔离，pilot hash 明确保持 `pilot_not_frozen`。`STR-02` 已按证据拆成两个 medium segment，不再视为单一 long 根因链。

WO-DS-03 已在第二次独立 re-QA 于 2026-08-23 接受，固定候选为 `32600eb6b7caf3fbe339e1103d3293f0b7e33103`。STR-04 long/open canary 有 1 个 segment、18 events/slices/increments、七类文件隔离、`canary_not_frozen` hash 与字段级模型投影。首轮 RAGAS context-only 误判已由独立 QA 退回：该题 reference 是 FastAPI PR #15745；命中只作为限定风险保留。T13 tracker close 与 semantic resolution 已分离，不能将 Mount partial capability 冒充 #685 已解决。

同一预检还证明 STR-05 的 9 个 pilot event 都是真实信息增量，必须从 medium 更正为 long。由此，先前 STR-07/08、STR-05/06、STR-01/04 的 2/2/2 声明已经失效；正式 freeze 不能沿用该配额或把 STR-04 当未污染样本。尚未运行 D0/D1/D2、远端模型、aggregate 或 PASS rate。

WO-DS-04 已在独立 re-QA 于 2026-08-23 接受，固定候选为 `c727b68bac28b158a3d6a045adfb00b552c22723`。正式六案预注册保持 STR-07/08/05/06/01/04，不得按任何 dry-run 或模型结果换案；2 short / 1 medium / 3 long 仅为预计分布。接线冒烟把已接受的 STR-08/05/04 共 31 个 slice、226 个投影历史 turn 确定性构造成 evaluator v2 严格 parser 可消费输入；没有调用 `runEvaluationSuiteV2` 或远端模型，也没有产生效果指标。该接受仅为 wiring smoke gate；数据集仍是 `planned_not_frozen`，pilot/canary 状态不变，未授权 promotion/freeze、D0/D1/D2 或任何效果解释。

WO-DS-05 已在独立 re-QA 于 2026-08-23 接受，固定候选为 `fb85572031711bc8337121fb307b5ffae81086f3`。全六案共同 `evidence_cutoff_at` 固定为 `2026-08-23T03:00:00Z`；STR-08/05/04 的 21 个 accepted 文件以 byte-identical relocation 进入独立 promotion 目录，31 个登记来源轻量复核没有要求语义改动。版本化污染 snapshot 覆盖固定六案，但因 GitHub code search 认证限制，`no_public_hit_found` 只是一项有限的 as-of 结论。首轮 QA 退回的协调重写 P1 已由代码内固定 21 个 accepted 路径/顺序/SHA 合同关闭。collection 仍是 `promotion_candidate_not_frozen`、`evaluation_ready:false`、`model_run_authorized:false`；这不是完整六案 freeze 或模型运行授权，下一步仅允许另开 STR-06 source/Gold checkpoint。

WO-DS-06 已在独立 re-QA 于 2026-08-23 接受，固定 source candidate 为 f4931ad35cc7e4a844bb40ceb397aaf07842616d。首轮 QA 发现的 E6 current-body digest/updated_at 与 E7/E16 REST null-commit canonical P0 已被 append-only 修正，并由官方 REST 逐项重验。STR-06 保留 16 个真实 information increment/slice，机械分层为 long；checkpoint 分离两次 patch/merge、tracker close/reopen、真实 FIPS 失败、有限单环境成功与残余跨环境不确定性。两个 PR 均没有 repository regression test，Builder/QA 也没有本地 FIPS replay。此次只接受 checkpoint/schema gate：状态仍为 checkpoint_not_frozen，没有进入 promotion collection，promotion_authorized:false、evaluation_ready:false、model_run_authorized:false，未授权 D0/D1/D2 或远端模型。

DS-06 接受后的第四次关键节点对抗审查记录为 `docs/adversarial-reviews/AR-2026-08-23-post-ds06-checkpoint.md`，结论为 `Challenge`。主控接受其更小路径：不单独 promotion STR-06、不提前实现 Probe，先以 WO-DS-07 制作 STR-07 source/Gold checkpoint，再单独制作 STR-01，最后一次性 promotion 新三案。当前实际已审计分布为 1 short / 0 medium / 3 long；缺少 medium 必须披露，但不授权换案、漏计或强拆 lineage。

WO-DS-07 已在独立 Data QA 于 2026-08-23 接受，固定 source candidate 为 `8f51bf4f9308d124ace63c5c8ca755373105c71f`。Issue #1008 与 closed-unmerged PR #1010 的 10 个 information increment/slice 经 GitHub 官方 REST 逐项重验，机械分层为 long，已审计分布为 1 short / 0 medium / 4 long。候选严格区分未合并 patch/test、公开 URI-template API、redirect/CORS 限制、path-converter 与 dual-route workaround，以及仍未决的 revert/release/docs；此次仅接受 checkpoint/schema gate，保持 checkpoint_not_frozen、未 promotion、promotion_authorized:false、evaluation_ready:false、model_run_authorized:false，未授权 D0/D1/D2 或远端模型。

WO-DS-08 已在独立 Data QA 于 2026-08-23 接受，固定 source candidate 为 `454565b863cf7e9470e7ac8079febf2a5c0d42d9`。STR-01（Issue #495、closed-unmerged PR #500、merged PR #1692）的 18 个真实增量/slice 经 GitHub 官方 REST、PR commit/files 与 timeline 重审，机械为 long，使已审计分布为 1 short / 0 medium / 5 long。checkpoint 严格分离宽 scope-body 缓存被搁置、streaming 约束、body/form 差异、receive hang、`call_next` 窄化、endpoint-first 非目标、multi-chunk review bug、补测修正、approval、merge 与 Issue close。此次只接受 checkpoint/schema gate：仍为 checkpoint_not_frozen，未 promotion STR-06/07/01，未创建 Probe，且 promotion_authorized:false、evaluation_ready:false、model_run_authorized:false；未授权 D0/D1/D2 或远端模型。下一步只能另开一次性 promotion STR-06/07/01 工单并申请关键节点独立对抗审查。

DS-08 接受后的关键节点对抗审查记录为 `docs/adversarial-reviews/AR-2026-08-23-post-ds08-checkpoint.md`，结论为 `Agree with reservations`。主控接受其最小路径并已建立 WO-DS-09：先做六案 75 slices / 588 turns 不落盘静态 preflight，再一次性将 STR-06/07/01 以 byte-identical relocation 纳入 promotion。该工单的目标仅是 `promotion_candidate_not_frozen` 的 canonical-data freeze candidate，不是 frozen、Probe/evaluation ready 或模型运行授权。

WO-DS-09 已在独立 Data QA 于 2026-08-23 接受为六案 canonical-data freeze candidate，固定 Builder candidate 为 `4b974538d76d0e0d8a5ac17c5662533b714ef00e`。六案 75 slices / 588 projected turns 先通过不落盘真实 evaluator v2 parser preflight；STR-06/07/01 的 21 个 accepted 文件随后逐字节复制，使 promotion 共 42 个固定副本。四个固定 Data-QA candidate 的 42 项 accepted-source path/order/SHA 已独立重建，并经协调改写攻击复验；新的 full contamination snapshot 追加而不覆盖旧 snapshot，来源 ledger 明示没有把继承 QA 冒充本次 live re-audit。实际分布为 1 short / **0 medium** / 5 long（slice 为 4/0/71）；collection 仍为 `promotion_candidate_not_frozen`、`evaluation_ready:false`、`model_run_authorized:false`。本接受不是正式 freeze、Probe、D0/D1/D2 或模型运行授权。

DS-09 后关键节点对抗审查 `docs/adversarial-reviews/AR-2026-08-23-post-ds09-protocol.md` 结论为 `Agree with reservations`。主控接受其更小路径并建立 WO-DS-10：只制作不超过 12 slices 的预注册 protocol canary，同时生成 83 facts / 75 slices 的完整资格清单；context Probe 与 answer required/forbidden/Critical-Miss checklist 必须同冻。现有 resolved context 尺子固定为 diagnostic/not-evaluable，overall `passed` 不作决策。本工单禁止 evaluator/model 运行、core 修改与正式 freeze。

WO-DS-10 已在独立 Data QA 于 2026-08-23 接受为 `protocol_canary_not_frozen`，固定 Builder candidate 为 `bc78c42505c34ae6f3220db49b2e5a5af905d0eb`。protocol 从固定六案数据独立重建并复验 83 facts / 75 slices / 499 assignments，固定 12 slices / 101 projected turns；仅有 8 个共同 exact lexical-anchor Probe，19 个 task dependency 明确 `not_exactly_scorable`，答案 rubric 为 42 required / 16 forbidden。接受没有改动 promotion payload、`src/` 或 package surface；canonical collection 仍为 `promotion_candidate_not_frozen`，且 `formal_freeze_authorized:false`、`evaluation_ready:false`、`evaluator_run_authorized:false`、`model_run_authorized:false`，runner/model/effect count 均为 0。0 medium 仍是外推限制；这不是 Probe 实验、正式 freeze、D0/D1/D2 或模型运行授权。

DS-10 接受后已建立 WO-DS-11，只做 data+protocol 原子 freeze、append-only pre-run contamination rescan 与 36 个盲化 D0/D1/D2 input packet/GPT-5.6-terra non-sol feasibility 运行合同。该工单本身禁止 evaluator/model 调用；只有新的独立 QA PASS，下一工单才可按固定 order 发起恰好 36 个 fresh session。语义评分仍要求两名 condition-blind 人类 reviewer，不能由第二模型替代。

WO-DS-11 已在独立 Data / Run-Gate QA 于 2026-08-23 接受 atomic data+protocol+answer-input freeze，固定 Builder candidate 为 `a2d68b851d178db20dc3abfb17b2d3eda8d66d3c`。append-only wrapper 展开固定 46 个 canonical-data 文件、3 个 protocol 文件、12 slices 与 36 个 opaque answer-input packet，并使其固定 bytes 为 `frozen_by_manifest`；D0/D1 沿用 evaluator transcript 语义，D2 调用真实 assembler 但使用人工 Oracle-State，故只代表 typed-state upper bound。pre-run contamination rescan 在受限公开 web index 中没有新增 qualified task-level reuse，但 GitHub code-search API/UI 不可用，不能作 absence proof。本工单仍保持 `model_call_count:0`、`evaluation_run_count:0`、`answer_artifact_count:0`；下一工单最多可收集 36 次未评分 GPT-5.6-terra non-sol / medium / fresh `fork_turns:none` session，每 cell 单次、无 adaptive retry，语义评分仍须两名 condition-blind 人类。0 medium、单次 repetition、Oracle upper-bound 和公开索引限制阻止 D2 优于 D1、稳健性或一般化结论。

WO-DS-12 已在独立 re-QA 于 2026-08-23 接受为 **unscored capture integrity only**，固定 Builder fix candidate 为 `3c172bb62e5e640d00d513e31ede6249ac9d5cba`。首轮 QA 的 raw/run/hash/validator 协调自举 P1 已由 append-only 修复关闭：无 shell Git object anchor 直接读取 capture source commit `18a332fd06d7ebdfc8c0007ae1e9250db14c82cf` 的固定父链、path、blob/SHA，并在 current JSON 解析前要求 raw/run bytes 相同；capture-hashes 不再自证 validator，manifest authorization-absence 与所有未评分 boundaries 严格固定。raw/run bytes 没有改变，因此没有新模型 session、retry 或回答。36 条 artifacts 仍只是 36 valid / 0 invalid 的未评分 capture；未运行 evaluator、自动 context/cost 或语义评分。下一工单才可做自动结果和 condition-blind review bundle，且仍缺两名真实人类评分。0 medium、单次 repetition、人工 Oracle-State upper bound 与公开索引限制继续阻止 D2 优于 D1、稳健性、一般化或 provider comparison 结论。

2026-08-23 架构同步当时冻结 v0 边界：核心为 State Compilation，authoritative Active State 不参与普通 semantic relevance competition；Evidence Paging 与 Experience abstraction 后置。2026-08-24 的 D-015 已用用户明确要求的 bounded BM25 + caller-Dense / dormant 收口 supersede 其中“禁止任何 semantic retrieval / 所有 ACTIVE root 永驻前台”的绝对表述，但没有授权 PACE、多级调页、Context 调参研究或 Experience Formation 实现。

WO-DS-13 已在独立 Data / Result QA 于 2026-08-23 接受为 **automatic diagnostic + blank blind-review bundle only**，固定 Builder candidate 为 `259b19246bc46a93c4b10dcaa09360a86b7937fb`。固定 `f721fd1159e6802d29132939c8114377f3faefa4` official artifact 记录 evaluator run 1、model call 0、semantic score 0；自动结果为 D0/D1/D2 tokens `7767/2911/4578`、D2-vs-D1 `+1667/1.572655`、8 exact lexical Probes 为 D0/D2 8/8、D1 0/8。36-item public/internal 物理隔离盲评包及 A/B/adjudication 空白表均已 mechanical QA；没有人类判断、解盲或 answer semantic score。该 `feasibility-01` 已由 WO-DS-14 直接封存为 Oracle-State feasibility baseline，不再等待或填写双真人盲评；answer semantic gain 永久保持 `not_evaluated`。此 baseline 不支持 D2 优于 D1、稳健性、一般化或 provider comparison 结论。

WO-DS-14 / ST-01 已在首次独立 QA 返回后，于 2026-08-23 在固定修复候选 `826eb4760fe8df557a2aa7d07225bc1986579281` 通过独立 re-QA。修复后的 data Git object 为 `79da83d95aeac7162c95714f4f6f5eff1f9e0608`：30 个 Starlette standardized event summary 对应 30 个 strict Gold Delta / checkpoint，28 non-empty 与 2 empty true negative；两次 fresh SQLite replay 确定一致，4 条保留 dependency 均经 current-event justification 与人工 source/target 审计。首次 QA 发现的 delayed dependency P1 已通过删除无依据关系、显式 `not_evaluable` 和 append-only anchor 关闭。该次接受只覆盖 reducer conformance；在当时 ST-02 run contract、packet/capture 与模型调用尚未创建或授权，后续状态见下一段。

WO-DS-14 / ST-02 Run-Gate 已在首次独立 QA 返回后，于 2026-08-23 在固定修复候选 `a4c336d7f2e421c507e926fe333e5a1f4e5dbd06` 通过独立 re-QA。前置 contract candidate `8d31cb6fc06b6b99bc141258539deb51b46d2d1b` 的 parent、两份 contract path/blob/SHA 与 current regular-file bytes 在任何 current JSON parse 前固定；contract + validator 协调改写和 symlink 均 fail-closed。无参数 CLI 也已从三个不同 cwd 真实复验。此次只接受 current-event-only run contract/source-only replay/capture shape；模型、provider、evaluator 与真实 capture 仍为 0。下一步只有主控可显式授权固定一次 30-step GPT-5.6-terra non-sol / medium / fresh session capture；Run-Gate PASS 不自动开始运行，也不接受 Extractor correctness、错误分布、Context Reduction、Operational Stability 或架构胜负。

WO-DS-14 已于 2026-08-23 在固定 Builder candidate `423ae7cbe777c01b31dd0ec5629b1eb3255048c0` 完成 ST-02 独立 Data / Result QA 并按工单停止。official capture 仍固定为 `bcce004f63b446d4bea4036f0ebfac771aff3137`，没有重跑或修补；QA 独立复得 12 `INVALID_SCHEMA` fallback、16 strict-valid empty on Gold-nonempty、2 strict-valid empty true negative、general / critical unique recall `0/35` / `0/29` 与 checkpoint exposure `0/253` / `0/192`。本次只接受 standardized-summary temporal replay 和 raw scoring 的完整性；ST-02 Extractor correctness 实验结果为明确失败。precision、matcher、transition capability、stale/reactivation/dependency/provenance 都因 zero eligibility 保持 `not_evaluable`；supersession / resolution 只报告 Gold 结果未实现 `0/6` / `0/7` 且为 inherited precondition absence。该结果不支持架构胜负、Operational Stability、Context Reduction 或一般化，下一阶段未授权。

DS-13 前关键节点对抗审查结论为 `Agree with reservations`：自动诊断与 blind bundle 合并仍是最小路径，但 public reviewer export 必须与 internal key/provenance/report 物理隔离；8 Probe 只覆盖 3/12 slices，只称 lexical diagnostic；official run、QA deterministic replay 与本机 latency observation 分离。三项 v0 Gate 继续 pending，未发现 PACE scope creep。

## 最新对抗审查

2026-08-23 在 ST-03 接受后完成了首次独立对抗审查，结论为 `Challenge`。该结论不否定 ST-01 至 ST-03 的实现 QA；它指出现有证据主要证明“实现符合工单”，尚不足以证明“工单顺序是验证核心假设的最小投资路径”。完整记录见 `docs/adversarial-reviews/AR-2026-08-23-post-st03.md`。

审查提出三个需要在下一次重大投入前明确处置的问题：ST-02 的空 probe、`current_input` 污染及缺少 D2 相对 D1 门槛；ST-01 是否真是首轮语义实验的技术 blocker；ST-03 的持久化 preparation 在连续抽取失败后缺少有界保留策略。WO-EV-02 已关闭空 probe 与 `current_input` 污染并显式报告 D2-vs-D1 原始成本，但按范围没有新增决策门；preparation 保留风险仍未形成实现工单。

DS-03 接受后的第二次关键节点对抗审查记录为 `docs/adversarial-reviews/AR-2026-08-23-post-ds03-canary.md`，结论为有限 `Challenge`。主控接受其更小路径：先做 DS-04 三案无模型接线冒烟，再按共同 cutoff promotion audit；未制作案例优先处理 STR-06，且所有最终案例必须逐案人工语义审计。长度/组件/outcome 混杂不阻止制作，但阻止无分层 aggregate 的一般化解释。

DS-04 接受后的第三次关键节点对抗审查记录为 `docs/adversarial-reviews/AR-2026-08-23-post-ds04-wiring.md`，结论为 `Challenge`。主控接受拆单：WO-DS-05 只固定全六案 evidence cutoff 并 promotion audit 已接受的 STR-04/05/08；STR-06 source/Gold checkpoint 另开 WO-DS-06。空 Probe/Gold→Probe 与答案评价缺口阻塞首次效果运行，但不阻塞 canonical source-data promotion。

## Current behavior

`compile_context` 不调用 extractor/model/provider/network，也不修改 raw/state。它固定保留最近 N 个完整用户轮次，并对窗口外有界候选做 BM25；只有 caller 为 query 与全部候选提供同 space/同维 Dense 时才 hybrid，否则整腿 BM25-only。可信 baseline 前无 `operation_id` 仍为 read-only；baseline 后缺 id 稳定拒绝。有 id 时只由内部 batch 向 Experience Ledger 原子追加去正文、可幂等重试且 exact-shape 的 compile/hit trace。State 变化保持显式 prepare/extract/apply；core 不生成 embedding。`CONTEXT_COMPILER_DB_PATH` 仍为独立数据库配置，`DSH_HOME` 只作 legacy fallback。

## Known gaps

- No implicit state evolution or extractor invocation from compile/ingest/MCP.
- No automatic headline generation.
- No formal compiler mode in any host adapter.
- WO-EV-02 已完成尺子校准；真实 Starlette 轨迹和远端回答实验完成前，evaluator 仍不能充当最终决策门。
- Starlette schema pilot 与 DS-03 long/open canary 已独立接受，但均不是正式数据集 freeze 或 D2 效果证据。`pilot_not_frozen`、`canary_not_frozen` 保持；STR-02/03/11/12/15 因公开 evaluation/benchmark 复用排除，STR-04 只有有限 `no_public_hit_found`，STR-05 按机械规则属于 long。剩余样本必须重新预注册实际分层，不能沿用旧 2/2/2 或直接运行模型。
- WO-DS-04 接线冒烟已独立 re-QA 接受，但这不构成正式 promotion/freeze、D0/D1/D2、远端模型或效果解释授权；这些步骤仍需新的有界工单和独立 QA。
- WO-DS-05 三案 promotion audit 已独立 re-QA 接受；全六案共享 evidence cutoff 为 `2026-08-23T03:00:00Z`，扫描观察时间独立版本化。接受仍不是六案 freeze、`evaluation_ready` 或模型运行授权；只允许下一步另开 STR-06 source/Gold checkpoint。
- WO-DS-06 STR-06 source/Gold checkpoint 已独立 re-QA 接受为 checkpoint/schema gate；16 个增量机械归为 long。它没有 repository regression test、本地 FIPS replay 或跨环境证明，merge/close 只表示 repository/tracker acceptance。接受仍保持 checkpoint_not_frozen，未进入 promotion/freeze，且 promotion_authorized:false、evaluation_ready:false、model_run_authorized:false；下一步不得擅自扩大，必须另开有界工单决定 promotion 或剩余 STR-01/07 的制作顺序。
- WO-DS-07 STR-07 单案 source/Gold checkpoint 已独立 QA 接受：10 个增量机械归为 long，不预设 survey 的 short；仍不 promotion STR-06/07，不制作 Probe 或运行模型。其后 WO-DS-08 的 STR-01 checkpoint/schema gate 也已接受；下一步只能由新工单一次性考虑 promotion STR-06/07/01。
- WO-DS-08 STR-01 source/Gold checkpoint 已独立 QA 接受：18 个增量机械归为 long，PR #500 closed-unmerged、PR #1692 narrow merge 与 #495 tracker close 没有混写；仍为 checkpoint_not_frozen，且 promotion_authorized:false、evaluation_ready:false、model_run_authorized:false。此接受不表示 STR-01 promoted/frozen、六案完整、Probe/answer rubric 就绪或可运行 D0/D1/D2/远端模型。
- 持久化 preparation snapshot 尚无明确的有界保留策略。
- WO-DS-11 仅冻结首次 feasibility 输入与运行合同；单次 repetition、0 medium、人工 Oracle-State upper-bound、GitHub code-search 不可用与尚缺两名 condition-blind 人类评分仍限制后续解释。即使独立 QA PASS，也不能据此声明 D2 优于 D1、稳健性或一般化。
- WO-DS-12 的 36 个单次原始回答 capture 已通过独立 run-integrity re-QA，但仍没有自动 context/cost 结果或两名 condition-blind 人类语义评分；36/36 格式有效不等于答案正确或 D2 有效。
- WO-DS-13 的自动 context/cost artifact 与空白盲评包已通过独立 QA，但已由 WO-DS-14 封存为 Oracle-State feasibility baseline；不再等待双真人评分，answer semantic gain 保持 `not_evaluated`。8 lexical Probes 只覆盖 3/12 slices；0 medium、单次 capture、人工 Oracle-State upper bound、受限公开索引与单次本机 latency observation 均禁止 D2 优于 D1、稳健性或一般化结论。
- WO-DS-14 已完成并经独立 QA 接受其 reducer conformance 与 ST-02 capture/raw-scoring 完整性；ST-02 Extractor correctness 实验结果为失败。结果仅相对 accepted standardized-event-summary Gold：Predicted State 全空，unique recall 为 general `0/35`、critical `0/29`，其余 zero-eligibility capability 不可评价。它不能证明 reducer Operational Stability、其他模型/prompt、真实 raw-body 或 State Compiler 架构的一般表现；下一阶段未授权。
- WO-V0-15 的首 trace commit 前跨实例 telemetry origin TOCTOU P1 已由第六个 fix 关闭，Context / State 基础设施恢复冻结。Dense retrieval、Context 语义收益与 Experience Formation 效果仍未评估；PACE、多级摘要、glimpse/page-fault、retrieval 调参、Graph DB 与 Experience Formation 仍不实现。下一阶段只通过真实使用积累可回放的 Event–Action–Outcome / Feedback 数据。

WO-ST-01 through WO-ST-03、WO-EV-02、WO-V0-15、WO-01、WO-02、WO-03A、WO-03B、
WO-04A、WO-04B、WO-04C 与 WO-05 均已完成并经独立 QA 接受；WO-V0-15 当前为 **ACCEPTED /
FROZEN**。该 v0 行为与算法线继续冻结，不因新 canonical authority path 改写。
WO-05 ContextSnapshot Contract 的 Execution Baseline 与旧 pre-source Gate 保持为历史事实；
current-semantic owner seam blocker 已由 accepted WO-04D 关闭，首个 Builder candidate 的
Fact/Relation dependency omission attack 由 owner-side immutable complete-projection receipt 的
append-only fix 关闭，并已通过 fresh Independent re-QA。docs-only WO-DA-01 adjustment
reconciliation 也已通过 fresh re-QA；当前没有活动工单。Formal Host Mode 与 WO-06+ 均未开始，
也未由该记录隐含授权。
