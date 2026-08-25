# WO-PUB-01 — Public MCP Result Boundary

状态：BUILDER FIX COMPLETE / PENDING FRESH INDEPENDENT RE-QA

Implementation baseline：`7a79ac631c4dd402b3cc157961e5844349d5c496`

Returned candidate：`4643a4761a7c2b91837a198c2f7ebc340fcb8511`

QA return：`6dbedcc417e5391b9023d6e251baa397b7fae2d9`

## 背景

外部 Black-box QA 仅通过公开 MCP 输入/输出观察 `context-compiler-mcp`。在固定构建
`main@9f6bffff59ef13f9cf07c71dc188916af01aadfb` 上，公开 `compile_context` 成功响应会原样返回
Core 的 `operational_debug` 与 `debug_manifest`，其中包括候选事件 ID、候选序号范围、分项排名、
选择标记、内部 telemetry identity、kept/suppressed state/raw ID 与 dependency path。

这些字段曾作为 WO-V0-15 内部可复算与 QA 诊断合同的一部分被冻结，但不属于普通 MCP 用户完成
“取得最终 Working Context”所必需的公开结果。当前 Host/Black-box 信息边界明确禁止向普通调用方
暴露候选列表、ranking/score、内部 manifest、telemetry identity 或诊断路径，因此必须在不改 Core
算法的前提下建立稳定、显式的公开结果投影。

## 单一结果

> 仅在 stdio MCP `compile_context` 出口把内部 `CompileContextResult` 投影为 closed-world public DTO；
> Core、library service、持久 telemetry 与现有检索/State 行为保持不变。

## 固定公开成功结果

`compile_context` 的公开 MCP 成功 envelope 保持：

```json
{
  "ok": true,
  "result": {
    "context": {
      "session_id": "...",
      "rendered_context": "...",
      "budget_exceeded": false,
      "budget_overage": 0
    },
    "metrics": {
      "full_context_tokens": 0,
      "compiled_context_tokens": 0,
      "recent_window_tokens": 0,
      "active_state_tokens": 0,
      "retrieved_tokens": 0,
      "compile_latency_ms": 0,
      "extractor_latency_ms": 0,
      "active_state_items": 0,
      "suppressed_items": 0
    }
  }
}
```

公开 `context` 只允许上述四个字段；公开 `metrics` 只允许上述九个有限数值聚合。投影必须逐字段构造
新对象，禁止复制后 delete、spread 未知字段或未来新增字段自动穿透。unknown internal result shape 必须
fail-closed 为现有 sanitized `INTERNAL_FAILURE`，不得部分返回。

失败 envelope、九工具名称和全部 input schema 保持不变。其他八个工具的成功结果保持不变。

## 必须关闭的公开字段

公开 `compile_context` JSON 的任何层级均不得出现：

- `operational_debug`、`debug_manifest`、内部 `context.metrics`；
- candidate ID / seq range / score rows / BM25 / Dense / combined score / selected 标记；
- compile trace / retrieval-hit ledger identity、telemetry baseline identity；
- kept/suppressed raw/state IDs、dependency edges/path；
- dormant/reactivated/dependency-rescued identity 列表；
- 未来 Core 新增但未由本工单公开 promotion 的字段。

`rendered_context` 是本工具的公开功能输出，可以包含确定性选中的 Working Context 正文；本工单不改变
其内容、选择逻辑、顺序或 token 语义。

## Ownership 与兼容

- 投影 owner 是 MCP server adapter，不是 Core，也不是 retrieval/assembler owner。
- `ContextCompilerCore.call("compile_context", ...)` 与 `ContextCompilerMcpService.call(...)` 继续返回
  完整内部结果，供 library caller、现有 deterministic QA 与 telemetry composition 使用。
- stdio `CallTool` handler 只对 `compile_context` 成功结果应用 public projection；失败结果原样保留现有
  sanitized envelope。
- 不新增工具、启动参数、环境变量、数据库字段或 package dependency。

## 路由文件

实施前只读取：

- `docs/architecture/LT-Agent-Architecture-Contract-2026-08-24-v3.1.1.md` 中 Host opaque result 边界；
- `docs/architecture/Umbrella-Implementation-Plan-2026-08-24-v3.1.1.md` 中 Stable Host Adapter/API 边界；
- `docs/inventory/WO-04C/downstream-adjustment-register.md` 中 DA-12；
- `src/core.ts` 的 compile result 类型；
- `src/mcp-service.ts`；
- `src/mcp-server.ts`；
- `test/mcp-protocol.test.ts` 及其直接 stdio fixture。

允许修改：

- `src/mcp-server.ts`；
- `test/mcp-protocol.test.ts` 和必要的直接 stdio fixture；
- README 的公开输出说明；
- `docs/PROJECT_STATE.md` 与 `docs/ROADMAP.md` 的当前交付状态；
- 本工单 Builder handoff。

## 验收

1. 真实 stdio `tools/call compile_context` 在普通、检索命中、带 `operation_id`、Dense 与 State 非空场景
   均只返回精确 allowlist。
2. 对公开响应做 recursive key audit，候选、score、manifest、trace、telemetry、raw/state internal IDs 均
   不可见；`rendered_context` 内容与内部 service 同输入结果逐字节一致。
3. 内部 `ContextCompilerMcpService.call` 仍保留完整 debug/manifest，且带 `operation_id` 的 durable trace
   与幂等/并发行为不变。
4. unknown/extra internal compile result field 不会自动进入 MCP 响应；畸形内部成功结果 fail-closed 为
   `INTERNAL_FAILURE`。
5. 其他八个工具、九工具顺序与 input schema、错误 envelope、stdio stdout purity 保持不变。
6. focused protocol tests、`npm test`、`npm run build` 与 `git diff --check` 全部通过。
7. Builder 写独立 handoff；fresh Independent QA 在固定 candidate 上执行真实 stdio、production-only pack、
   recursive forbidden-key audit 与 future-field injection 反例。

## 明确不做

- 不修改 retrieval/ranking/score、Recent Raw、State、Dormant、Recovery 或 Context Assembly 算法；
- 不修 `created_at`、event size、role/user-turn、导入 adapter 或自动 State 演进；
- 不修改数据库/schema/telemetry payload，不删除已有记录；
- 不访问或请求任何 QA Case、Gold、Raw Evidence、hidden holdout 或 QA artifact；
- 不增加 Formal Host Mode、网络 endpoint、模型/provider 或宿主仓库依赖。
