# WO-V0-15 首轮 QA 返回修复 — Builder 交接

日期：2026-08-24

状态：**FIX IMPLEMENTED — PENDING INDEPENDENT RE-QA**

固定修复起点：`main@c625e1632de76e63d05ddfa68c787d19dc6fe2a7`，起点工作树 clean。本提交只修首轮 QA 报告列出的 correctness 问题；未修改 QA 报告、evaluation/Gold/official artifact，未调用模型或网络，也未进入 Experience Formation、PACE、provider、Graph DB 或 retrieval 调参。

## 修复结果

1. **Telemetry 信任与连续性**
   - 通用 `SqliteExperienceLedgerStore.append` 只允许 `ACTION / OUTCOME / FEEDBACK / CANDIDATE_EXPERIENCE`；`EVENT / CONTEXT_COMPILE / RETRIEVAL_HIT` 及 `raw-event/`、`context-compile/`、`retrieval-hit/` namespace 由内部原子路径保留。
   - compile trace 新增 `hit_count / hits_sha256`，replay 对 source namespace、operation、完整 payload/policy/hash/raw-state fingerprint、parent、hit shape 与 batch completeness 做 exact 验证。坏/未知 telemetry 不建立 dormant baseline。
   - 首个可信 operation trace 前，无 id MCP compile 仍为历史 read-only；baseline 后缺 id 稳定返回 `INVALID_INPUT`，且不写 ledger/raw/state，从合同层消除不可观测 hit gap。

2. **严格 JSON 无损**
   - ledger normalize 与 operational stable-sort 使用 null-prototype + data property 递归构造，合法 `__proto__ / constructor / prototype` 在顶层和嵌套均无损保留。
   - live raw mirror、legacy backfill、同 source 不同 special-key payload 冲突与 raw fingerprint 差异均有回归。

3. **Dense 数值稳定性**
   - cosine 改为每个向量先按 `maxAbs` 缩放，再计算有限 dot/norm；`1e308`、`Number.MIN_VALUE` 与多维极大数 identical vector 均产生接近 1 的有限 hybrid 分数并可召回。
   - 残余不可计算路径显式为 `dense_unavailable_numeric`，不再由 `finiteScore` 静默伪装成 hybrid 0。

4. **错误边界**
   - persisted ledger row 解码/validation 使用独立 `CORRUPT_DATA`，MCP 映射为 `STORAGE_FAILURE`；当前请求 malformed 仍为 `INVALID_INPUT`。
   - Node `node:sqlite` 的 `ERR_SQLITE_*` 被稳定识别为 storage failure，不再误归 conflict。
   - `RuntimeStateUpdateError` 的 validation、fallback/transport、abort、conflict 与 storage 路径统一携带 `contract_version: 2`；成功 extractor result 继续为 v2，legacy parser/replay 不变。

## 独立 re-QA 必测

- 重放首轮 QA 的 baseline → no-id query、public 伪 baseline、特殊 JSON live/migration/conflict/fingerprint、`[1e308]` hybrid 和 persisted-row 错误分类反例。
- 协调改写 trace shape/source/hit parent/hash，确认不能建立 baseline；真实完整 telemetry 仍有非空 dormant 分母。
- 双连接 raw mirror/compile retry、trace/hit 原子回滚、baseline 后无 id 无任何写入。
- 全量、protocol、build/diff、DS-13/14 reproduction 与真实 production-only pack/stdio。

## Builder 验证

- 首轮 QA 相关 focused 8 files：135/135 PASS；
- `npm test`：458 PASS / 1 个既有 opt-in official runner SKIP；
- `npm run test:protocol`：8/8 PASS；
- `npm run build`、`git diff --check`：PASS；
- DS-13 fixed-object validator：PASS；DS-14 ST-01/ST-02 contract/scorer：23/23 PASS，official artifact 未重跑或改写；
- 真实 `npm pack`：56 files / 118.5 kB；复制 lock+installed tree 后执行 production-only offline prune，isolated stdio 精确九工具、health、`[1e308]` hybrid operational compile 与 retrieved history 均 PASS，client 正常 close；
- 第一次显式 pack 使用用户全局 npm cache 时因其既有 root-owned cache entry 报 `EPERM`；prepack/build 已成功，随后改用 `/private/tmp` 隔离 cache 完整通过。该失败属于环境 cache 权限，不是产品代码失败。

验证环境：macOS / Darwin arm64、Node.js 25.6.1、npm 11.9.0；Windows 与 exact Node.js 24 未单独复跑。

Builder 不批准自己的工作；Context / State 仍未 frozen。
