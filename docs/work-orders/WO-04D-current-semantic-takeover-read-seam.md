# WO-04D — Current Semantic Takeover Read Seam
## Context Compiler Core

**状态：** BUILDER COMPLETE / AWAITING INDEPENDENT QA<br>
**类型：** Accepted owner read-seam correctness fix  
**依赖：** WO-04C Builder `6642e4c04f4b7a5ff684c0399e4f83be075724f5` + QA
`d33f52281e2af857c16a79768c7d3fcde816da42`  
**阻塞对象：** WO-05 ContextSnapshot Contract

## 1. Bounded result

修正 Core-private `readCurrentSemanticTakeoverInsideCore` 的“current”读取语义：最新
Takeover 由 live `takeover_commit_revision` 轴唯一标识；Takeover 提交后发生的 Raw、State、
Fact/Relation 等合法后续轴推进，不得使该最新 Takeover/Artifact 被误判为损坏。

```text
latest committed Takeover vector <= live vector
+ exact same takeover_commit_revision
+ exact owner/marker/artifact proof
→ current semantic Takeover + Artifact at the live world
```

本工单不改变 Takeover/Enrichment/Frontier 的任何写入、CAS、coverage、Artifact hash、schema、
revision substrate 或公开 API。

## 2. Failure evidence

在 WO-05 source spike 中机械复现：

```text
append Raw E1
commit Takeover covering E1       # takeover axis = 1
append new user Raw E2             # ledger advances; takeover axis remains 1
readCurrentSemanticTakeoverInsideCore
→ CORRUPT_DATA
```

原因是 accepted read seam 找到 takeover-axis revision 1 的唯一 commit 后，仍要求该 commit 的
完整五轴 `current_revision_vector` 与 live vector 全等。后续合法 Ledger advance 必然破坏该
全等关系。该条件把“最新 Takeover identity”错误收紧为“此后任何轴都没有前进”。

## 3. Execution baseline

任何 source/test 修改前，必须单独新增并提交：

```text
docs/inventory/WO-04D/execution-baseline-manifest.md
```

Manifest 固定 branch、planning authority、source baseline HEAD、expected parent、clean status、
WO-04C accepted Builder/QA、WO-05 blocker、root/src/test/config fingerprints 与 freeze time。

## 4. Exact read contract

若 live `takeover_commit_revision === 0`：

- 不得存在同 scope stray Takeover commit；
- 返回 live vector，不返回 Takeover/Artifact。

若 live `takeover_commit_revision > 0`：

- 所有候选仍通过现有 exact `readSemanticTakeoverInsideCore` owner proof；
- 必须恰有一个候选的 `current_revision_vector.takeover_commit_revision` 等于 live
  `takeover_commit_revision`；
- live vector 必须 component-wise at-or-after 该候选提交 vector；
- 返回的顶层 `revision_vector` 是 live vector；嵌套 Takeover 保留其历史提交 vector；
- Artifact 仍由现有 exact owner read/hash binding 证明。

不得按时间、rowid、lexical ID 或最大表行猜测 latest。缺失、多个匹配、axis regression、
owner/marker/artifact mismatch 仍必须 fail closed。

## 5. CAN READ

- `src/semantic-takeover.ts` 中 current/exact read 与 vector helper；
- `test/semantic-takeover.test.ts` 中直接相关 fixture 与 accepted regression；
- WO-04C work order、architecture、handoff、QA；
- WO-05 work order与 pre-source Snapshot composition contract 中 blocker 相关段落；
- `docs/PROJECT_STATE.md`、`docs/ROADMAP.md`。

## 6. CAN CHANGE

```text
src/semantic-takeover.ts
test/semantic-takeover.test.ts
docs/inventory/WO-04D/execution-baseline-manifest.md
docs/handoffs/WO-04D-current-semantic-takeover-read-seam.md
docs/work-orders/WO-04D-current-semantic-takeover-read-seam.md
docs/work-orders/WO-05-context-snapshot-contract.md
docs/PROJECT_STATE.md
docs/ROADMAP.md
```

## 7. PROHIBITED

- 修改任何 schema、migration、trigger 或持久化 row grammar；
- 修改 Takeover/Enrichment/Frontier/Artifact 写入、CAS、coverage 或 hash policy；
- 修改 revision substrate、transaction coordinator、Ledger/State/Fact/Relation owner；
- 修改 Core/MCP/package/config/evaluation、Host/provider 或 frozen v0；
- 借机增加 Snapshot 行为、Retrieval、Extractor、scope inference 或远端模型；
- 网络、production DB、destructive commands。

## 8. Acceptance criteria

- [x] standalone Execution Baseline 已在 source/test 前冻结；
- [x] 原复现链路在后续 Raw advance 后返回同一个 latest Takeover/Artifact；
- [x] 返回顶层 vector 精确等于 live vector，嵌套 Takeover 提交 vector 保持历史值；
- [x] zero-takeover、stray/missing/duplicate、vector regression 继续 fail closed；
- [x] exact read/replay/reopen/tamper 与现有 writer 行为无回归；
- [x] schema/migration/trigger 与 public package/MCP surface 无变化；
- [x] focused tests、`npm test`、`npm run build` 通过；
- [x] Builder handoff 已写，且 Builder 不自批；
- [ ] Independent QA 在物理分离任务中给出 PASS/FAIL。

## 9. Required checks

```bash
npx vitest run test/semantic-takeover.test.ts
npm test
npm run build
git diff --check
```

## 10. Stop conditions

若修复需要改写入、schema、revision substrate、第二 owner、请求/结果 grammar 或 public surface，
立即停止并重新裁定；不得扩大本工单。
