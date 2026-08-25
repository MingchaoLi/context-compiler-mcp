# WO-DA-01 — Current Authority / Snapshot + Rolling Summary Adjustment Record

**状态：** PLANNED / NOT STARTED
**类型：** docs-only downstream decision reconciliation
**Planning baseline:** `0a2d4437bc2b80714ae819654e5f41aab7a1a41e` on `main`, clean
**依赖：** WO-05 fixed candidate `fa7677101c145ffdbfca8bff0864ed992fa9a9b9` + fresh
Independent re-QA `c3f691bb4a6b8f65822ba2b3410d05d93c5cbd9e`

## 1. Bounded result

本工单只完成两项用户已接受 downstream direction 的最终 repository 记录：

1. 对账 DA-12 与 accepted WO-05，明确 Current Authority Projection / ContextSnapshot 已
   promotion 的精确范围；
2. 新增 Rolling Summary 的 future experimental candidate，明确其尚未实现、未 promotion，
   以及未来实验、provenance、immutability 与 Snapshot binding 边界。

本工单不修改 source/schema/test/config/package/evaluation/official artifact，不实现 Summary，
不重开 WO-05，不启动 WO-06/07，不修改 Architecture Contract v3.1.1 或 Umbrella v3.1.1。

## 2. Repository facts to preserve

- Canonical State v1 是完整 Authority；terminal/deferred/rejected history 不因一次 Context
  projection 消失。
- accepted WO-05 已交付纯确定性的 Current Authority Projection、exact active
  `DEPENDS_ON` transitive closure、Frontier-bound Hot Raw、固定 priority buckets、immutable
  Snapshot/Attempt binding 与 owner-side Fact/Relation historical receipt。
- WO-05 Snapshot v2 是 Core execution-input freeze，不是远端 provider 请求日志或完整证明。
- WO-05 没有 Summary producer、Summary schema、Summary writer、Summary GC 或 Summary
  placement policy。
- Compaction Artifact 是 Raw coverage/provenance proof，不是 Rolling Summary。
- downstream adjustment register 当前停在 DA-14；DA-12 仍写 `NOT YET PROMOTED`，与已接受
  WO-05 的实际状态需要 docs-only 对账。

## 3. Current Authority / ContextSnapshot decision

最终记录必须冻结三层：

```text
Complete Canonical State Authority
  -> pure deterministic Current Authority Projection
  -> ContextSnapshot placement + dependency closure + budget
```

并明确：

- Projection 对 unknown kind/status/policy fail closed；不得用开放式 `else exclude` 吞掉未来
  Authority。当前 accepted path 依赖 Canonical State owner 的 closed kind/status/policy validation；
  任何 future State policy/version 必须显式扩展 projection policy 并重新 Gate。
- dependency 由同一 frozen world 的 exact active `DEPENDS_ON` Authority graph 做确定性闭包；
  不把依赖缩成自由文本 `required_context` 或未经证明的一跳。
- Snapshot Manifest 继续绑定 exact refs/revisions/policy/config/hash、closed inclusion/placement
  reasons、AttemptStarted、as-of concurrency boundary 与 mandatory-overflow failure；不得增加
  open score、模型自由文本解释或未版本化 heuristic。
- Core 只冻结 Working Context、external content hashes 与 opaque Host manifest digest；不得声称
  仅凭 Snapshot 可以证明远端 provider 最终请求的完整 bytes、provider-private system state、
  transport mutation 或实际发送结果。
- DA-12 的 promotion 只覆盖 accepted WO-05 current projection/Snapshot contract；Canonical
  State v2、persistent HOT/COLD、Retrieval、Summary、Host integration 均未 promotion。

## 4. Rolling Summary future candidate

新增登记项必须保持：

```text
Rolling Summary
  = immutable
  + non-authoritative
  + Raw-anchored
  + derived projection
```

禁止：

- Summary-only Authority provenance；
- recursive summary 作为唯一事实源；
- 原地更新既有 Summary instance；
- Summary 写入或修改 State/Fact/Relation/Frontier/Takeover；
- 把 Summary 与 Compaction Artifact 混同；
- 在本工单创建 schema、writer、producer、GC/retention 或 Snapshot runtime slot。

未来若 Snapshot 使用 Summary：

- 必须绑定 exact immutable instance ID、exact Raw coverage/refs、generator/policy identity 与
  content hash；
- coverage 扩大时从完整 Raw coverage 重生一个新 instance，不允许只用旧 Summary 链式改写；
- missing Raw anchor、hash/policy mismatch 或 recursive-only lineage 必须 fail closed；
- Summary 只能进入 non-authoritative optional/conditional bucket，不得挤掉 Current Input、
  Current Authority、required dependency/evidence 或 Frontier-bound Hot Raw hard obligations。

实验顺序必须是：

```text
A0 = Current Input + Frontier-bound Hot Raw + Current Authority
A1 = A0 + additive immutable Raw-anchored Summary

only if A1 shows bounded benefit:
R0 = fixed token-budget baseline without Summary replacement
R1 = same fixed token budget with explicit Summary replacement policy
```

A0 不能用 frozen v0 recent-N 冒充 canonical baseline。先测 correctness/continuity、recovery、
context tokens、latency、generation cost、cumulative distortion 与 test complexity；只有增益通过
预注册阈值和 Independent QA 后，才允许另开生成、存储、Snapshot schema/policy、GC/retention
工单。

## 5. Routed reads

只允许读取：

- `AGENTS.md`；
- `docs/PROJECT_STATE.md`、`docs/ROADMAP.md`；
- 本工单；
- `docs/inventory/WO-04C/downstream-adjustment-register.md`；
- `docs/architecture/WO-05-context-snapshot-contract.md`；
- `docs/work-orders/WO-05-context-snapshot-contract.md`；
- `docs/handoffs/WO-05-context-snapshot-contract.md`；
- `docs/qa/WO-05-context-snapshot-contract-fix.md`；
- Architecture Contract v3.1.1 §4.6–4.9；
- Umbrella Plan v3.1.1 WO-05 与 dependency graph。

未知 Host/provider 事实保持 Unknown；禁止读取同级宿主仓库。

## 6. Exact change allowlist

```text
docs/work-orders/WO-DA-01-projection-summary-adjustment-record.md
docs/architecture/WO-DA-01-projection-summary-adjustment-record.md
docs/inventory/WO-04C/downstream-adjustment-register.md
docs/handoffs/WO-DA-01-projection-summary-adjustment-record.md
docs/PROJECT_STATE.md
docs/ROADMAP.md
```

Independent QA 只能另新增：

```text
docs/qa/WO-DA-01-projection-summary-adjustment-record.md
```

## 7. Prohibited

- source/schema/test/config/package/evaluation/official artifact 变化；
- Summary producer/storage/schema/runtime implementation；
- WO-06 Evidence/Ripple、WO-07 Operation/Action、Host/provider/model/network/MCP 行为；
- State v2、persistent placement、Retrieval、adaptive budget、learned/LLM ranker；
- 修改 accepted WO-05 source/policy/schema/hash 或把本记录称为新的运行时 acceptance；
- 自动开始任何后续实现工单。

## 8. Acceptance

- [ ] planning baseline/branch/clean/ancestor facts 精确。
- [ ] DA-12 精确标记为只在 accepted WO-05 projection/Snapshot 范围 promotion。
- [ ] 三层模型、unknown fail-closed、exact active `DEPENDS_ON` closure 被明确冻结。
- [ ] Manifest/Attempt/as-of/budget/opaque Host 边界与 accepted WO-05 一致。
- [ ] Rolling Summary 独立登记为 future experimental candidate / not implemented / not promoted。
- [ ] Summary immutability、Raw anchoring、non-authority、no mutation/no Artifact confusion 完整。
- [ ] A0/A1 additive screening 与后续 fixed-budget replacement ablation 顺序完整。
- [ ] A0 使用 canonical Current Input + Frontier-bound Hot Raw + Current Authority。
- [ ] source/schema/test/config/package/evaluation/official artifact 零变化。
- [ ] Builder handoff 存在且不自批；fresh Independent QA 单独裁决。
- [ ] `git diff --check`、exact path audit 与禁止项机械搜索通过。

## 9. Builder / QA separation

Builder 只写本工单允许的最终记录与 handoff，不得写 `PASS`。Independent QA 必须固定候选、
重算路径与相关文件 hashes，逐项对照 accepted WO-05/Contract/Umbrella，并单独提交 QA report。
QA failure 必须 append-only 返回本工单修复，不能边 QA 边修改 Builder 文档。
