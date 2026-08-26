# WO-PUB-03 — Versioned Public Result Schemas

状态：PRE-SOURCE GATE FROZEN / SOURCE NOT STARTED

Planning baseline：`2f3e590c24a35e1bc89deffbc3a5c6056078adfa`

Normative schema authority：
`docs/contracts/context-compiler-public-mcp-results-v1.schema.json`

Schema SHA-256：`b3f6da99cc2b3be8e932a72e5e411ca2aad30c8c86df5df859f356a4e6e52d39`

Gate mechanical evidence：

- JSON parse + strict Ajv 2020-12 meta/schema compile：PASS；
- isolated temporary Core DB + real in-memory MCP transport：10 个 current public success/error values
  全部通过 v1 root schema；
- `npm run build`：PASS；
- `git diff --check`：PASS；
- 未读取 QA artifact，未调用网络/model，未修改或部署运行服务。

## 背景

当前 stdio MCP 已公开 Raw ingest、exact/keyword recall 与 bounded context compile 的稳定成功
结果，也只返回去敏错误码；但除 `compile_context` 的 closed-world DTO 外，精确成功字段路径、
cardinality 和错误集合尚未汇总为单一版本化的机器可读 authority。外部普通用户因此可以观察
结果，却不能只凭一个固定 public contract 机械验证所有相关输出。

## 单一结果

> 冻结现有 Raw / recall / compile 成功 DTO、已实现的 bounded cardinality 与去敏错误 envelope
> 为 repository-owned v1 public schema authority；后续 source 候选只允许发布这份既有合同，
> 不改变 Raw、State、storage、query、recall、ranking 或 compile 语义。

本 Gate 只创建工单与合同 authority。它不修改 source、test、package、MCP tools/list、运行时
响应或部署，也不授权 Host/Harness 工作。

## Gate 路由

冻结前只读取：

- `README.md`；
- `docs/architecture/LT-Agent-Architecture-Contract-2026-08-24-v3.1.1.md` 的 stable adapter / opaque Host result 边界；
- `docs/architecture/Umbrella-Implementation-Plan-2026-08-24-v3.1.1.md` 的 stable API 边界；
- `src/mcp-server.ts`；
- `src/core.ts` 的 command/result/error types；
- `src/raw-store.ts` 的 `RawEvent` public DTO；
- `src/recall.ts` 的 exact/keyword recall result types 与 bounds；
- `test/mcp-protocol.test.ts`、`test/raw-store.test.ts`、`test/recall.test.ts` 中直接证明上述公开形状的测试；
- pinned `@modelcontextprotocol/sdk` 的 `Tool.outputSchema` / `CallToolResult.structuredContent` 类型合同。

Gate 允许修改：

- 本工单；
- `docs/contracts/context-compiler-public-mcp-results-v1.schema.json`；
- `docs/PROJECT_STATE.md`；
- `docs/ROADMAP.md`。

Gate 不允许修改 source、test、README、package、lockfile、schema migration、database、runtime 或
deployment 文件。

## 待冻结的 schema authority

Gate 将选择一个 repository-owned JSON Schema 2020-12 artifact 作为规范 authority。它必须：

1. 版本化并精确描述现有 `ingest_event`、`recall_exact`、`recall_keyword`、`compile_context`
   成功 envelope；
2. 分别冻结 ingest Raw 与 recalled Raw：ingest success 保留现有可选
   `source_event_id` / `dense_embedding`，recall 保留 `source_event_id` 但必须继续省略
   `dense_embedding`，不得用一个过宽共享 schema 让未来向量自动穿透；
3. 冻结 exact recall 的三种 closed query-result variant、keyword hit 与 headline 形状；
4. 冻结 `compile_context` 的四字段 context 和九字段有限非负 metrics；
5. 冻结现有 `{ ok:false, error:{ code } }` 去敏 envelope 与七个错误码；
6. 区分 generic Core caller-owned `metadata` 与 DSH Adapter 自己的 closed public projection，
   不把 generic metadata 夸大为 Core 已去敏；
7. 记录已实现的 exact range / keyword result cardinality，不创造新限制；
8. 对所有 contract-owned object 使用 closed properties，只有 caller-owned JSON metadata 保持
   JSON object value domain；
9. 不在运行时成功 payload 中新增 contract version 字段。
10. `recall_keyword.result[*].rank` 只冻结为现有 literal FTS hit rank；它不授权
    `compile_context` candidate/ranking/score/debug 字段进入公开结果。

## 预定 source publication seam（尚未授权）

Gate 将冻结以下方向，Builder 必须等待 Gate commit/hash 经主控与 Auditor 对账后才可开始：

- `tools/list` 为上述四个工具发布与 v1 authority 同值的 `outputSchema`；
- 成功 `tools/call` 同时返回匹配 schema 的 `structuredContent`；
- 现有 `content[0].text` JSON envelope 保持逐值相同，兼容只消费 text 的客户端；
- 错误仍使用现有 `isError` + code-only text envelope，不要求错误结果伪装成成功 output schema；
- 工具数、顺序、名称和全部 input schema 保持不变。

## Source 阶段验收（Gate 后才生效）

1. 当前所有合法 Raw / recall / compile public success fixture 同时通过 v1 schema。
2. `tools/list` 仅为四个 scope 内工具增加精确 `outputSchema`；其他五工具完全不变。
3. scope 内成功调用的 `structuredContent` 与 `content[0].text` 解析值深度相等。
4. unknown/extra internal field 不得穿透 closed output；畸形投影 fail-closed 为现有
   `INTERNAL_FAILURE`。
5. seq-range 最多返回当前已实现的 1000 个 Raw events；keyword limit 继续为 1–20；本工单不改
   查询语义或 limit 默认值。
6. `compile_context` 仍只有四字段 context 与九字段有限非负 metrics，正文逐字节不变。
7. 错误 envelope 只含 frozen code；不得包含 path、content、query、stack、debug、candidate、score、
   trace 或 storage identity。
8. exactly nine tools、全部 input schema、Core/library internal results、database/schema 与 package exports
   保持不变。
9. focused protocol/schema tests、`npm test`、`npm run build`、production-only pack 与
   `git diff --check` 通过。
10. Builder 单独写 handoff；fresh Independent QA 固定 candidate 后重新做 stdio schema validation、
    legacy text compatibility、future-field injection、error leak audit 与 package 验证。

## 明确不做

- 不改变 Raw/State/Fact/Relation/Snapshot/Takeover/Authority/transaction；
- 不修改 retrieval、ranking、assembly、recall、token、timestamp 或 error classification 语义；
- 不增加工具、HTTP、Host、Harness、provider、model、network 或 credential surface；
- 不访问 QA Case、Gold、Evidence、mapping、provenance entry、payload、holdout 或 attack intent；
- 不部署或触碰 R8。
