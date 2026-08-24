# WO-04C Downstream Architecture Adjustment Register

Status: OPEN FOR USER SYNC — RECORDED INPUTS ARE NOT YET PROMOTED

WO-04C source baseline:
`c3a184f9c067d529e8f2908080ab72650fb59cbc`

## Purpose and promotion rule

本登记只在 WO-04C source 开始前收集用户明确同步的后续架构调整，并逐项判定其对
WO-04C 的影响。它不是 Architecture Contract、Umbrella Plan 或未来 Child WO 的替代品。

用户确认本轮同步结束后：

1. 先冻结每项的 `WO-04C impact` 与 routing；
2. 若任何项改变 WO-04C source/schema/test/config/official contract，则停止并重新评估
   work order 与 baseline；
3. 若全部为 downstream-only，则保持当前 WO-04C baseline，开始 04C Builder；
4. downstream 输入在独立的后续 docs/work-order authority 步骤中再 promotion 到
   Contract/Umbrella/WO-05+，不得混入 WO-04C source candidate。

---

## DA-01 — Raw Retention 与 Targeted Evidence Recovery 分离

**用户状态：** 已要求记录为后续方案调整。

**登记状态：** RECORDED / DOWNSTREAM CANDIDATE / NOT YET PROMOTED

**WO-04C impact：** NONE — 不改变当前 source/schema/test allowlist 或工期估算。

**Routing：** WO-05 ContextSnapshot、WO-06 Evidence Scope + Ripple、后续
Verification/Host orchestration；不进入 WO-04C。

### Accepted direction

四层必须分开：

```text
Raw Retention / Replay Guarantee
-> Targeted Evidence Recovery
-> immutable EvidenceBundle
-> Working Context / Snapshot Projection
```

任何 Authority 更新都是另一条显式路径：

```text
recovered evidence
-> explicit Proposal
-> owner Validation
-> separate Authority Commit
```

Recovery 不得直接或隐式修改 State、Fact、Relation、Frontier 或 Takeover authority。

### WO-04C preservation requirement

WO-04C 只需继续满足已经冻结的底线：

- Semantic Takeover 成功后不删除或更新 canonical Raw Event；
- Compaction Artifact 是 covered range 的不可变内容绑定，不替代 Raw Ledger；
- Frontier 只改变 Hot Raw projection boundary，不改变历史 Raw 的存在性；
- WO-04C 不实现 Historical Evidence query、Working Context injection、Ripple 或 recovery
  orchestration。

因此 DA-01 不要求重开 Transaction Composition Gate。

### Proposed downstream v1

Recovery 保持低能力、provider-neutral，并冻结为：

```text
explicit closed trigger
-> Level 0 exact provenance fetch
-> if insufficient, at most one bounded historical search
-> optional bounded one-hop Ripple
-> immutable EvidenceBundle
-> Working Context only
```

硬边界：

- `bounded`：固定 max attempts、candidate budget、scope expansions 与 ripple depth；
- `read-only`：Recovery transaction 不写任何 authority；
- `non-authoritative`：命中只是 Evidence，不因相关性得分获得 Authority；
- `snapshot-bound`：请求与结果绑定 explicit scope、`ledger_as_of_revision`、Snapshot/
  Attempt identity、trigger reason、search horizon 与 policy identity；
- `provenance-first`：优先从 State/Fact/Relation/Artifact exact refs 取 Raw；
- `no hidden model`：Core 不调用 provider/extractor/embedding service。

建议的 closed trigger reason：

```text
EXPLICIT_HISTORY_REFERENCE
PROVENANCE_DETAIL_REQUEST
REQUIRED_FIELD_MISSING
VERIFIED_FAILURE
```

Core 只消费显式 trigger，不自行解释模型回答是否失败。`VERIFIED_FAILURE` 后是否再次调用
模型属于后续 Host/Verification orchestration，不属于 Core Recovery authority。

### Retrieval and Ripple constraint

Level 1 默认使用 bounded lexical/BM25；只有 caller 为 query 与全部 candidates 提供同
space、同维、合法 Dense 时才允许可选 Dense leg，否则整体稳定退化为 lexical-only。
禁止远端 embedding、无限 query reformulation、recursive search 或全库无界扩散。

Event Ripple 可优先用于 Recovery 的 Seed/Anchor 后一跳扩展，但本登记不静默改写当前
Contract 中 Normal path 的 bounded 1-hop Ripple。若未来要把 Ripple 严格收窄为
Recovery-only，必须单独修改上层 Architecture Contract，而不能由 WO-06 实现暗改。

### Wording correction

没有自动 Recovery 时，历史 Raw 不是“永久不可见”；准确含义是：

> 已越过 Frontier 的 Raw 不会自动重新进入 Working Context，但仍保留为审计、exact
> replay 与未来显式 Evidence query 的事实源。
