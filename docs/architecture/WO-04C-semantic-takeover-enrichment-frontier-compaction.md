# WO-04C — Semantic Takeover / Enrichment + Frontier + Compaction Artifact

Status: PRE-SOURCE ARCHITECTURE FROZEN

## 1. Decision

WO-04C 采用“一个组合事务协调器 + 多个领域 Authority Owner”，而不是把所有
schema、policy 和 reducer 合并成一个通用读写 Store。

```text
ContextCompilerCore
  -> SqliteAuthorityTransactionCoordinator       Core-private composition owner
       -> frozen Revision Substrate              vector/CAS/marker transaction owner
       -> Canonical State owner seam              exact read/authority proof only
       -> Canonical Fact/Relation owner seam      exact read + domain apply
       -> Semantic Takeover domain functions      coverage/artifact/commit rows
```

组合路径的连接选择、同快照读取、写入顺序、回滚和重放统一由
`src/authority-transaction-coordinator.ts` 收口。领域模块继续拥有各自 grammar、policy、
hash、reducer、object revision 与 integrity proof。协调器不是通用 SQL writer，也不允许
Host、MCP 或 package root 获得 `DatabaseSync`、transaction handle、callback 或 Store。

## 2. Why the split is bounded

冻结的 WO-03A 已经规定 `TAKEOVER_FRONTIER` 自己开启 `BEGIN IMMEDIATE`，并只推进：

```text
raw_frontier_revision + 1
frontier_position = covered_raw_range.end
takeover_commit_revision + 1
```

它不推进 `state_revision`。WO-04A 的 standalone State writer 和 WO-04B 的 standalone
Fact/Relation writer 当前也各自拥有 transaction lifecycle。因此 WO-04C 不建立第二套
revision writer，也不嵌套事务：Takeover 的协调器在冻结 substrate callback 内使用同一个
`DatabaseSync`；Enrichment 因不推进任何一级轴，由协调器在自己的单连接
`BEGIN IMMEDIATE` 中完成。

这使“读写能力归一”准确落在跨领域组合层，同时保留领域所有权，避免形成能绕过
State/Fact/Relation policy 的 God Module。

## 3. Exact module ownership

### `src/authority-transaction-coordinator.ts`

Core-private，且是 WO-04C 唯一组合入口。它负责：

- 持有 frozen `SqliteRevisionSubstrate` 引用和一条私有 SQLite connection；
- 初始化/验证 WO-04C additive schema；
- Takeover 调用唯一的 `commitTakeoverFrontierInsideCore`；
- 在 substrate callback 的同一 handle 内编排 Raw/State/Fact/Relation/Artifact；
- Enrichment 的 `BEGIN IMMEDIATE` / `COMMIT` / `ROLLBACK`；
- WO-04C current/exact reads 的单一 read snapshot；
- 把 domain/substrate 错误稳定映射为 WO-04C error。

它只提供固定的 Takeover、Enrichment 与四类 read 方法。禁止接受任意 SQL、任意表名、
任意 callback 或 operation discriminator。

### `src/semantic-takeover.ts`

拥有 WO-04C public grammar、normalization、policy descriptor/hash、coverage proof、
Compaction Artifact canonical bytes/hash、additive schema、domain row apply/read 与 integrity
binding。它不自行开启组合 transaction，也不直接更新 `cc_revision_streams`。

### `src/canonical-state.ts`

继续拥有 Canonical State grammar/reducer/hash/marker authority。新增的唯一 seam 是
Core-private same-handle exact authority reader；它验证从 revision `1..observed` 的完整
State chain，并返回不可变 authority reference。WO-04B 改为复用该 seam，现有 public/
domain behavior 不变。WO-04C 不获得 State apply capability。

### `src/canonical-fact-relation.ts`

继续拥有 Fact 四轴、Relation Registry、endpoint policy、object revisions 与 domain marker。
新增 Core-private same-handle `read`/`apply` seam；standalone Store 只成为保持既有 API 的
transaction wrapper。seam 不接受未规范化输入，不能改变一级 revision vector。

### Frozen modules

`src/revision-substrate.ts` 与 `src/ledger-hot-raw.ts` 保持 byte-for-byte 不变。WO-04C 只在
同一 callback connection 内读取 `cc_ledger_raw_events` 的冻结 schema，不新增 Raw writer，
也不改变 Hot Raw rebuild。

## 4. SemanticTakeoverCommit v1 grammar

输入为 exact-key plain data，至少包含：

```text
scope { namespace, stream_id }
takeover_commit_id
ledger_base_revision
covered_raw_range { start, end }
expected_frontier_revision
expected_frontier_position
state_authority_ref: null | {
  state_revision, state_commit_id, state_hash, required_item_ids[]
}
existing_fact_refs[] { fact_id, fact_revision }
existing_relation_refs[] { relation_id, relation_revision }
fact_relation_apply?: CanonicalFactRelationCommitInput
coverage[]
compaction_artifact {
  artifact_id, expected_artifact_hash, generator_version, body
}
policy_hash
provenance_event_ids[]
```

规则：

- `ledger_base_revision` 必须等于 callback `previous.ledger_revision`；
- `start = previous.frontier_position + 1`，`end >= start` 且
  `end <= previous.ledger_revision`；
- substrate 的 `next_frontier_position` 只能由规范化 `end` 得出；caller 不提供 new
  revision、marker、result hash 或 timestamp；
- Raw rows 必须正好覆盖 `[start,end]`，按 `ledger_revision` 升序，scope、Event identity、
  canonical payload 与 ledger bound 全部有效；
- `provenance_event_ids` 必须等于 covered rows 的 Event IDs，顺序同 ledger range；
- `state_authority_ref` 必须与 callback `previous.state_revision` 完全相符；零 revision 只允许
  `null`，正 revision 必须通过 owner 的完整 chain proof；
- Takeover v1 不接受 State proposal，结果中的 `previous_state_revision` 与
  `new_state_revision` 均等于同一 observed State revision；
- Fact/Relation 可引用已提交 exact revisions，也可通过一个 owner-validated apply batch 在
  同事务新增 revisions；apply 的 scope、policy 和 identity 必须被 Takeover request 绑定；
- 任何 required ref/proposal/coverage/artifact 失败，callback 抛错，substrate 回滚所有
  domain rows、Artifact、vector 与 marker。

如果未来功能要求“同一 Takeover 同时新建 State revision”，当前
`TAKEOVER_FRONTIER` transition 不足。必须停止并另开 bounded substrate extension，不能
手改 State axis、嵌套 `STATE` transaction 或先提交 State 再补 Takeover marker。

## 5. Coverage grammar

`coverage` 必须与 covered Raw rows 一一对应、同序、无重复。每项为：

```text
{
  ledger_revision,
  event_id,
  disposition: "canonicalized" | "artifact_only",
  state_item_refs[],
  fact_refs[],
  relation_refs[],
  artifact_only_reason?: "no_semantic_delta" | "duplicate_evidence" |
                         "non_authority_context"
}
```

- `canonicalized` 至少含一个 exact State item / Fact / Relation ref，且不能含
  `artifact_only_reason`；
- `artifact_only` 的三类 ref 必须全空，并必须有一个 closed reason；
- refs 必须存在于本次同事务最终 authority manifest，且其 provenance 必须覆盖当前
  Event；
- omission、duplicate、wrong order、cross-scope ref、unknown disposition/reason 或未绑定
  proposal 一律在 mutation 完成前 fail closed；
- “proposal validation failed”不是合法 coverage disposition，不能用它推进 Frontier。

因此一个 Takeover 可以没有新的 Fact/Relation proposal，但不能没有完整 range、coverage
和 immutable Artifact；它仍是有效的 Frontier authority transition，不是 no-op。

## 6. SemanticEnrichmentCommit v1 grammar

Enrichment 输入使用同一 scope、State authority ref、Fact/Relation policy 与 Event
qualification，但 `source_event_refs` 可以升序、唯一且非连续。它必须包含至少一个会产生
新 Fact 或 Relation object revision 的 apply proposal；reference-only/no-change Enrichment
为 `INVALID_INPUT`。

Enrichment transaction：

```text
normalize outside transaction
-> BEGIN IMMEDIATE on coordinator connection
-> exact scoped enrichment identity replay/conflict check
-> read one observed five-component vector
-> validate source Events + State/Fact/Relation authority
-> apply Fact/Relation owner batch
-> insert immutable enrichment marker/result
-> require five-component vector byte-equal to observed
-> COMMIT
```

它不调用任何 Frontier/Takeover substrate primitive，不写 Compaction Artifact，不推进
Ledger、State、Frontier 或 Takeover axis。失败 Takeover 中值得保留的合法子结果必须用新
`enrichment_commit_id` 和独立 Fact/Relation authority identity 重新提交；失败事务不会
泄漏任何 object row。

## 7. Compaction Artifact v1

Artifact canonical descriptor 为：

```text
{
  artifact_schema: "compaction-artifact/v1",
  namespace,
  stream_id,
  covered_raw_range,
  generator_version,
  policy_hash,
  provenance_event_ids,
  body
}
```

`artifact_hash = SHA-256(UTF-8(canonical JSON(descriptor)))`。canonical JSON 沿用严格
plain-data/NFC/Cc/dense-array/finite-number 规则并递归排序 object key。`artifact_id`、
caller 的 expected hash 和 commit time 不进入 content bytes；row 仍保存并校验 identity、
expected/recomputed hash、descriptor bytes、body bytes、range、policy、provenance 和
created time。

Artifact row 与 Takeover domain row 在 substrate callback 内同时插入。相同 scope +
artifact ID 的 exact bytes 只允许同一个 Takeover replay；cross-scope reuse、range/body/
generator/policy/provenance substitution 冲突。update/delete trigger 保护 Artifact 与所有
WO-04C marker。

## 8. Policy identity

WO-04C policy version 固定为 `semantic-takeover/v1`。policy descriptor 固定绑定：

```text
state_policy_hash = 67c043ba4001150ccc4bb3f5630de99604970401bf418f5f33b3d524aeb0c52e
fact_relation_policy_hash = f9dc4c757d8ae4a558d29ecebd494323b5a8de55b78312b2423a14db0a4fb570
state_mode = exact-reference-only-no-axis-advance
takeover_transition = TAKEOVER_FRONTIER
enrichment_transition = axis-neutral-fact-relation-only
coverage = canonicalized|artifact_only-v1
artifact_hash = sha256-canonical-json-v1
```

descriptor 的 exact canonical JSON 为：

```json
{"artifact_hash":"sha256-canonical-json-v1","coverage":"canonicalized|artifact_only-v1","enrichment_transition":"axis-neutral-fact-relation-only","fact_relation_policy_hash":"f9dc4c757d8ae4a558d29ecebd494323b5a8de55b78312b2423a14db0a4fb570","semantic_policy_version":"semantic-takeover/v1","state_mode":"exact-reference-only-no-axis-advance","state_policy_hash":"67c043ba4001150ccc4bb3f5630de99604970401bf418f5f33b3d524aeb0c52e","takeover_transition":"TAKEOVER_FRONTIER"}
```

实现中的 `SEMANTIC_TAKEOVER_POLICY_HASH` 固定为
`dc1432f8e65911fb114c87921f14e6b3111b23dcd03278a5d13f7c4632e54467`，并由 focused
test 固定 literal。request、domain rows、Artifact 和 substrate marker 全部绑定该 hash；
不支持的 policy 在 identity replay 分类之后、任何新 mutation 之前稳定拒绝。

## 9. Persistence and exact reads

Additive schema version 1 精确拥有：

```text
cc_semantic_authority_schema
cc_semantic_takeover_commits
cc_semantic_enrichment_commits
cc_compaction_artifacts
immutable update/delete triggers for all four tables
```

Takeover domain row保存 request fingerprint/bytes、previous/current vector、exact State/
Fact/Relation manifest、coverage、artifact identity/hash、result 和 created time，并与同 ID 的
`TAKEOVER_FRONTIER / SEMANTIC_TAKEOVER_COMMIT_V1` substrate marker 双向一致。
Enrichment row保存 request/result、observed vector、source refs 与 Fact/Relation authority
identity。schema completion last；partial collision/forged completion fail closed；legacy 不
backfill。

四类 Core library-only read 均在 coordinator 的一个 deferred read transaction内重建：

1. exact SemanticTakeoverCommit；
2. exact SemanticEnrichmentCommit；
3. exact Compaction Artifact；
4. current scope Frontier/Takeover authority及其 bound commit/artifact。

read 必须验证 live vector 不早于历史 marker、domain row/marker request/result/hash、完整
coverage、Raw identity、State chain、Fact/Relation object/domain marker和 Artifact bytes。
缺失 scope 返回 zero/empty 且不 materialize；缺失 exact identity 返回 `NOT_FOUND`。

## 10. Public boundary and source allowlist

`ContextCompilerCore` 只新增 plain-data library methods；MCP command port 保持 exact-nine。
package root 只可导出 WO-04C policy/schema constants、plain types 和 stable domain error，
不得导出 coordinator、Store、migration、owner seam、transaction context、generic writer 或
SQLite handle。

Pre-source proof 后的 exact source/test allowlist 为：

```text
src/authority-transaction-coordinator.ts
src/semantic-takeover.ts
src/canonical-state.ts
src/canonical-fact-relation.ts
src/core.ts
src/index.ts
test/authority-transaction-coordinator.test.ts
test/semantic-takeover.test.ts
test/canonical-state.test.ts
test/canonical-fact-relation.test.ts
test/core-boundary.test.ts
```

`src/revision-substrate.ts`、`src/ledger-hot-raw.ts`、MCP、legacy、evaluation、package/config
与 official artifacts 不在 allowlist。若实现机械证明不需要某个 seam/test，Builder 可少改，
但不得扩大路径。
