# WO-02 — Core / Host + Authority Boundary Refactor
## Long-term Agent / Context Compiler

**状态：** PLANNED / NOT STARTED — EXECUTION BASELINE NOT YET FROZEN<br>
**类型：** Behavior-preserving boundary refactor<br>
**依赖：** WO-01 accepted fixed candidate
`ac6056c8c0ba2057866642d6785c1aee272af81b` and independent QA commit
`c264d5f5debd207278deacb703fa8e64f2b66c0c`<br>
**目标：** 在不新增 Runtime 行为的前提下，冻结 Core / Host 责任边界、当前
Authority / Mutation Matrix 与稳定宿主适配接口，并把未来宿主从 Store、Reducer
和 SQLite 细节中隔离出来。

---

# 1. Result

本工单只交付一个有界结果：

```text
current canonical data
→ named authority / owner
→ one stable Core command/query surface
→ MCP and future Hosts depend on that surface
→ low-level implementation remains compatibility-only
```

这是 **Wrap Before Split**，不是微服务拆分，也不是 v3.1.1 新 Runtime
能力实现。

---

# 2. Execution Baseline Gate

实现开始前必须新增：

```text
docs/inventory/WO-02/execution-baseline-manifest.md
```

至少固定：

```text
repository_path
branch
source_baseline_HEAD
expected_parent / base reference
worktree_status
worktree_clean
submodule_revisions
relevant_config_fingerprint
wo01_accepted_candidate
wo01_qa_commit
implementation_started_at
```

硬 Gate：

- 当前分支、HEAD 和 parent 已精确记录；
- tracked 与相关 untracked worktree 满足 clean policy；
- WO-01 的 Builder fix 与 Independent QA acceptance 已在祖先链中；
- Contract v3.1.1、Umbrella v3.1.1 和本 WO 已进入 repository authority；
- PROJECT_STATE / ROADMAP 唯一下一工单均指向 WO-02；
- source / schema / test / config / official artifact 在 Builder 执行期间不得发生
  未记录漂移。

---

# 3. DEPENDENCIES

- `docs/architecture/LT-Agent-Architecture-Contract-2026-08-24-v3.1.1.md`
  的顶层原则、Core / Host Responsibility Boundary 与关键不变量；
- `docs/architecture/Umbrella-Implementation-Plan-2026-08-24-v3.1.1.md`
  的 WO-02 Registry 与 Shared Change-Surface Rule；
- WO-01 accepted inventory、writer/reader map、persistence map、Core/Host
  leakage map 和 Phase 1 recommendation；
- 当前九工具 MCP 与全部 v0 accepted/frozen behavior。

---

# 4. CAN READ

按最小上下文与 call-chain 路由读取：

- `src/index.ts`
- `src/mcp-server.ts`
- `src/mcp-service.ts`
- `src/raw-store.ts`
- `src/experience-ledger.ts`
- `src/state-store.ts`
- `src/state-update.ts`
- `src/reducer.ts`
- `src/state-types.ts`
- `src/recall.ts`
- `src/operational-context.ts`
- `src/assembler.ts`
- `src/runtime-state-update.ts`
- `src/subprocess-extractor.ts`
- `src/evaluation.ts`
- `src/sqlite-initialization.ts`
- 与上述边界直接对应的测试、package config 和 accepted WO-01 文档。

不读取任何同级 Host 仓库。未知 Host 能力继续标为 Unknown。

---

# 5. CAN CHANGE

只允许为稳定边界、兼容委托和证明性测试所必需的变更：

```text
src/core.ts                         # 新稳定 Core composition/command/query surface
src/mcp-service.ts                  # 改为 Host/MCP adapter，委托给 Core
src/index.ts                        # 导出稳定 Core surface，保留兼容出口
src/runtime-state-update.ts         # 仅在需要改为稳定 Core 委托时
test/core-boundary.test.ts          # 新边界/所有权/兼容性证明
test/mcp-service.test.ts            # 若现有服务合同需直接回归
test/mcp-protocol.test.ts           # 仅九工具/协议兼容回归所需
test/fixtures/compile-telemetry-boundary-worker.mjs
                                     # 仅将既有内部并发注入点迁至 Core owner
docs/architecture/WO-02-core-host-authority-boundary.md
docs/inventory/WO-02/**
docs/handoffs/WO-02-core-host-authority-boundary.md
```

若实现证明需要修改未列出的 source/test 文件，必须先更新本工单，说明
call-chain 与验收必要性，再继续。

Builder amendment (2026-08-24): 全量协议回归证明既有 compile telemetry
并发测试通过直接访问原 service 私有 Store 注入 commit/rollback 边界。Store
ownership 移入 Core 后，该 fixture 必须随 owner 迁移注入点；测试语义、生产
接口与故障行为不变。因此在修改 fixture 前将其加入本工单 allowlist。

---

# 6. MUST NOT CHANGE

- SQLite schema、migration 语义或 revision allocator；
- Raw/Event、State、Relation、Headline/FTS、Experience Ledger 数据语义；
- fixed recent-N、BM25、Dense、dormancy、token budget 或 Context assembly；
- State proposal/parser/reducer/revision/fingerprint 语义；
- compile telemetry writer fence、trace/hit payload 或 origin 规则；
- MCP 工具数量、名称、input/output、error contract；
- evaluator、official artifact、frozen baseline 或 evaluation claim；
- `DSH_HOME` / `CONTEXT_COMPILER_DB_PATH` 的现有兼容解析行为；
- dependency、provider、network、credential、UI、delivery 或 Host implementation；
- namespace/stream/shared revision、Raw Frontier、Takeover、Fact schema、Snapshot、
  Action lifecycle、Verification、Outbox、Shadow 或 background worker。

禁止远端模型、网络、生产数据库和 destructive command。

---

# 7. MUST PRESERVE

1. Raw append 与 Experience Ledger EVENT mirror 原子性和 source-event
   idempotency。
2. State preparation fingerprint、expected revision revalidation、empty/non-empty
   retry 行为和 reducer atomicity。
3. compile 全读取、assembly、trace/hits 的 database-wide writer fence。
4. Headline 与 FTS 原子性、exact recall 和 keyword recall 行为。
5. provider-neutral Core 与显式可选 local subprocess proposal transport。
6. MCP exactly nine tools、stable sanitized errors 和现有返回 shape。
7. current public package compatibility；不得在本工单移除现有 exports。
8. offline evaluator、sealed evidence 和 official artifacts 的 byte identity。

---

# 8. Required Authority / Mutation Matrix

必须为每项当前数据记录：

```text
canonical data / derived artifact
stable Core command or internal writer
physical writer
readers
transaction owner
validation owner
retry / idempotency owner
Host allowed input
Host forbidden mutation
legacy compatibility path
future WO owner（若当前缺失）
```

至少覆盖：

- sessions；
- Raw Event 与 EVENT mirror；
- State preparation、items、relations、State revision；
- Headline 与 FTS projection；
- compiled Context 和 compile/hit telemetry；
- generic research ACTION/OUTCOME/FEEDBACK/CANDIDATE_EXPERIENCE；
- optional Extractor proposal；
- evaluation temporary database / official artifacts；
- 当前不存在的 ToolResult、Response/Outbox 和 Background mutation。

Generic research ledger records 必须明确不是未来 Operation/Action journal。

---

# 9. Stable Core Surface

实现必须提供一个 Host/model/provider-independent 的 Core composition root：

```text
ContextCompilerCore
```

它必须：

- 接收显式 Core 配置，不读取 Host/provider identity；
- 统一拥有当前四个 Store 的生命周期；
- 为全部当前受支持的 command/query 提供稳定入口；
- 保持 compile telemetry 等 derived internal writer 不可由 Host 伪造；
- 允许 MCP service 只做 transport/input/error adaptation；
- 支持显式关闭，并保持现有 service lifecycle 行为；
- 不解释未来 `host_manifest`，不新增该 schema。

最低 command/query coverage：

```text
ingest Raw Event
compile Context
get State
prepare State update
apply State delta
create Headline
exact Recall
keyword Recall
read Experience Ledger
append current research Experience record（若现有 library behavior 继续支持）
```

现有低层 exports 在本工单中为了兼容保留，但必须在架构文档中标为
compatibility/implementation surface，不得成为未来 Host stable adapter contract。

---

# 10. Core / Host Contract

必须明确：

## Core owns

- current Event/State/Relation/Recall/Experience storage authority；
- validation、transaction、idempotency 和 deterministic assembly；
- current compile telemetry internal mutation；
- stable command/query types；
- future Core capability placeholders 只作 ownership 记录，不作实现。

## Host owns

- MCP/Chat/App transport；
- Main LLM invocation；
- external Tool Executor 与 side effects；
- heavy verification；
- user delivery；
- Host execution metadata 和 provider selection。

## Dependency direction

```text
Host / MCP adapter
    → stable Core surface
        → current stores / reducer / compiler

optional Extractor transport
    → candidate proposal
        → Core validation / authority apply
```

Core 不得 import MCP server、Host、provider 或 UI。

---

# 11. CRASH CASES

至少验证/记录：

- Core composition 在第 N 个 Store 初始化失败时，已打开资源如何关闭；
- Core/service close 重复调用的行为；
- adapter validation 失败时无 Core mutation；
- Raw/Event、State、Headline/FTS、compile telemetry 的 commit/rollback 边界不变；
- State schema partial-DDL 当前风险仍如 WO-01 所记，不在本工单暗改；
- research ledger retry 仍由 current `source_key` contract 控制；
- derived telemetry 不能经 public research append 伪造。

---

# 12. Deliverables

1. `docs/architecture/WO-02-core-host-authority-boundary.md`
2. `docs/inventory/WO-02/authority-mutation-matrix.md`
3. `docs/inventory/WO-02/execution-baseline-manifest.md`
4. stable Core source surface and behavior-preserving adapter refactor
5. focused Core boundary tests
6. `docs/handoffs/WO-02-core-host-authority-boundary.md`
7. Independent QA separately appends
   `docs/qa/WO-02-core-host-authority-boundary.md`

---

# 13. ACCEPTANCE

- [ ] Execution Baseline Gate fixed before source implementation.
- [ ] Every current mutable table/artifact has one named authority and explicit
  readers/transaction/validation/retry ownership.
- [ ] Future Hosts can perform every supported mutation through the stable Core
  surface without importing Store, Reducer, SQLite, or MCP internals.
- [ ] MCP service is an adapter over the Core surface and still exposes exactly nine
  unchanged tools.
- [ ] Core imports no MCP server, provider SDK, network client, Host, UI, delivery,
  or sibling-repository code.
- [ ] Extractor/provider output remains proposal-only and cannot mutate authority
  outside Core validation.
- [ ] Generic ACTION/OUTCOME records remain research records, not formal Action
  lifecycle authority.
- [ ] Existing public exports remain compatible; stable versus compatibility-only
  surfaces are explicit.
- [ ] No schema/migration/revision/algorithm/evaluation/official artifact change.
- [ ] State partial-DDL initialization risk is assigned to an owner but not silently
  changed.
- [ ] `npm test` and `npm run build` pass for source changes.
- [ ] Focused tests prove adapter delegation, stable Core coverage, internal
  telemetry protection, lifecycle/close behavior, and compatibility.
- [ ] Source baseline through Builder candidate contains only WO-02 allowed paths
  plus the planning authority commit identified by the manifest.
- [ ] No remote model, network, production DB, destructive command, or Host repo.
- [ ] Builder writes handoff only and does not approve its own work.
- [ ] Independent QA can reproduce the boundary and behavior-preservation claims
  without Builder explanation.

---

# 14. QA HANDOFF

Builder handoff must record：

```text
source_baseline_HEAD
planning_authority_commit
builder_candidate_HEAD
exact changed paths
authority/mutation matrix path
stable vs compatibility surface
preserved behavior proof
tests/build results
known risks / Unknowns
explicit non-implementation of WO-03A+
```

Independent QA must pin the exact Builder candidate, trace representative commands
through adapter → Core → physical writer, verify all allowlists and preserved
transactions, and write its own QA record. Builder must stop before WO-03A.
