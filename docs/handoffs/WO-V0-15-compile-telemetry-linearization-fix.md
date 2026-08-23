# WO-V0-15 Compile Telemetry 线性化修复 — Builder 交接

日期：2026-08-24

状态：**FIX IMPLEMENTED — PENDING INDEPENDENT RE-QA**

固定修复起点：`main@9883747fcffdc6bdc6d01da31363ee3edf6f47d1`，起点工作树 clean。该提交是第五个 telemetry-completeness fix 独立 re-QA 返回后的第六个 append-only correctness fix，只关闭首个 operation-id compile 检查空 telemetry 与首 trace commit 之间的跨实例 TOCTOU；未修改 API、SQLite schema、Context 策略/权重、Experience 范围、QA 报告、evaluation/Gold 或 official artifact。

## 原子协议

- 每次已通过请求参数验证的 `compile_context`，包括首 baseline 前无 `operation_id` 的 read-only compile，均先由 Experience Ledger 的同一 SQLite 连接取得 `BEGIN IMMEDIATE` writer boundary。
- 取得边界后才读取 authoritative state items/relations/revision、raw events 与 ledger telemetry，并在锁内完成 deterministic assembly。其他实例的 raw ingest、state apply、ledger append 或 compile writer boundary 无法穿越这些读取。
- 带 `operation_id` 时，trace 与全部 hits 复用当前 boundary 写入，不再嵌套 `BEGIN`；成功后和整个 compile 一起 `COMMIT`。原内部 trace helper 在没有外层 boundary 时仍保留原单事务语义。
- 无 `operation_id` 时，持锁重新读取 telemetry：若竞争的首 trace 已提交则稳定返回 `INVALID_INPUT` 并回滚空事务；若竞争的首 operation 失败回滚，则按历史 pre-baseline read-only 语义继续并提交空事务。
- assembly、trace validation、trace/hit 插入或其他稳定失败均由最外层统一 `ROLLBACK`。没有 reservation row、lease、内存 mutex、新 schema 或进程退出后的残留状态。

## 两实例同步反例

新增两个真实 `ContextCompilerMcpService` Worker 与 `SharedArrayBuffer + Atomics` barrier。A 在已取得 writer boundary、完成 state/raw/ledger 读取与 assembly、即将调用内部 append 时暂停；B 已进入真实 `SqliteRawHistoryStore.ingest`，但在 A 结束前不能完成：

1. **A commit**：暂停时数据库仍为零条 compile trace；B 的 raw/state 写入被阻塞。释放 A 后首 trace 以 `raw_boundary_max_seq:1 / state_revision:0 / selected_state_ids:[]` 提交，B 随后写入 raw seq 2 和 revision 1，竞争 no-id compile 读取已提交 baseline 并稳定 `INVALID_INPUT`。新 snapshot baseline 后第 14 轮保持 active、第 15 轮才按既有双门 dormant。
2. **A rollback**：A 在 append 前注入失败，外层事务回滚且 compile/hit 仍为零行；B 随后写入 raw/state，no-id related compile 成功且保持 read-only。之后建立的首 origin 包含该 Goal，再跨 15 轮仍保守 active，未把已发生但未记录的命中归零。

既有 trace+hits 中途失败回滚、same-operation 两连接幂等、同 id 异输入冲突、baseline 后 no-id 零写拒绝、global-origin + snapshot 双门、public v1 late update、Constraint/hit/query/dependency rescue，以及 fresh/legacy Raw/Service/stdio 并发继续通过。

## 验证结果

- focused：10 files，158/158 PASS；
- `npm test`：475 PASS / 1 个既有 opt-in SKIP；
- `npm run test:protocol`：13/13 PASS；其中真实执行 `npm pack`、production-only offline prune，并从隔离 package 启动 stdio，health ready；
- `npm run build`、`git diff --check`：PASS；
- DS-13 fixed-object validator：PASS；
- DS-14 ST-01/ST-02 contract/scorer 与 Starlette feasibility 固定复现：30/30 PASS；official artifact 未重跑或改写。

验证环境：macOS / Darwin arm64、Node.js 25.6.1、npm 11.9.0；Windows 与 exact Node.js 24 未单独复跑。

WO、PROJECT_STATE 与 ROADMAP 当前保持 `FROZEN REOPENED — PENDING INDEPENDENT RE-QA`。Builder 不批准自己的工作；只有独立 re-QA 关闭该并发反例后，主控才能恢复 Context / State 冻结并进入下一阶段。
