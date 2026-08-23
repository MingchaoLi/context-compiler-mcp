# AR-2026-08-23 — Starlette schema pilot 后对抗审查

日期：2026-08-23

审查对象：WO-DS-02 接受提交 `2f8fe94168e7bda42ac5c28a88631e7a197f19db`

审查方式：独立 reviewer 在固定 clean baseline 上只读审查工单、pilot 数据、validator、聚焦测试、交接与独立 QA；另用内存 mutation 攻击 validator。除本记录外未修改项目文件，也未运行 D0/D1/D2 或模型。

## Verdict

`Challenge`

不挑战 WO-DS-02 的 schema/pilot QA PASS；挑战把该 PASS 外推为“schema 已足以直接批量冻结 STR-07/08、STR-05/06、STR-01/04 六案”。独立 QA 明确只接受三案例 pilot，并明确不接受正式 freeze。现有 pilot 没有 long 案例，validator 仍是 pilot 专用实现，而且只能证明结构与字面内容边界，不能机械证明语义上没有 future leakage。

六案可继续保留为预注册候选，不需要重新选样；但在投入六案批量制作前，应先用一个未见过的 long/open 案例完成 schema canary。

## Strongest challenge

### 1. QA PASS 没有覆盖 long tier，现有 validator 也不能直接验证正式六案

**事实**

- QA 结论写明只接受 schema/pilot，不接受正式 freeze、D2 或模型实验；`pilot_not_frozen` 保持不变。
- pilot 只有 STR-08 short、STR-05 medium，以及拆分后的 STR-02A/B 两个 medium segment，没有 long segment。
- `validatePilot` 硬编码只接受 `STR-02`、`STR-05`、`STR-08` 三个目录；manifest 顶层 `tier` 只允许 `short | medium | boundary_audit`，不允许 `long`：`evaluation/starlette-v1/validate-pilot.mjs:147-175,607-614`。
- validator 不校验顶层 tier、segment classification 与信息增量节点数的一致性。内存反例把 4-event STR-08 改成顶层 `medium`、segment `long` 后，`validateCaseBundle` 仍接受。
- 当前 STR-05 实际含 9 个 evidence event，却标为 medium；原候选分层规则把 9 个及以上信息增量节点定义为 long。schema 没有字段区分“原子 evidence event”与“计入 tier 的信息增量节点”，因此 QA 不能机械证明 2/2/2。

**推断**

pilot 证明了 schema 能描述三个已制作案例，不证明它无需调整即可描述 STR-01/04 的 long、partial-resolution/open 状态。若下一工单必须先扩展 tier、重写 hard-coded case list 或解释 event count 与增量节点 count 的差异，那么“现有 schema 已足以批量 freeze”就是过度外推。

**具体失败路径**

按六案计划制作 `STR-04`，如实写 `tier: long`；当前 validator 在读取 manifest 时即拒绝。若为通过检查而写成 `medium`，则 hash 可以稳定、测试可以全绿，但 2/2/2 分层声明已失真。

### 2. “机械证明无 future leakage”承诺过强

**事实**

- `validateTaskContentBoundaries` 只对 Gold、Outcome 与未来 Decision Reference 做 NFKC/大小写/标点/空白规范化后的 substring 检查，不能识别语义改写：`evaluation/starlette-v1/validate-pilot.mjs:346-397`。
- 已执行的最小内存反例把 `STR-08/T1.current_task` 改为：`Run the client inside a with block so lifespan startup and shutdown hooks execute, and avoid changing TestClient internals.`。它语义上直接给出未来 F4/Outcome，但不是原文包含；`validateCaseBundle` 返回 accepted。
- 文件级边界把整个 `events.json` 列为输入文件，但尚未生成或冻结字段级模型投影。事件包含审计元数据 `source_updated_at` 和 digest，其中多个 `source_updated_at` 晚于当前 slice cutoff。
- 当前输入 summary 自身也包含未来观察，例如 STR-08/E1 在 2021-10-04 cutoff 已写入“its later-edited body”，STR-05/STR-02 也有同类 “later body ... not visible” 表述。validator 接受这些记录，因为它检查引用时间与字面答案，不判断 summary 的语义时间边界。
- hash 只能证明字节未变，不能证明 summary 正确、任务没有语义提示或 audit-only 字段不会进入模型输入。

**推断**

现有 validator 能证明的是结构完整性、时间前缀、provenance 可达性和若干字面泄漏防线，不是“无 future leakage”。在字段级 render contract 尚未固定时批量 hash freeze，可能把未来编辑时间或策展者的后见说明一起冻结，之后即使 D0/D1/D2 都使用同一错误输入，也不会被 validator 或 hash 发现。

**具体失败路径**

T1 只应看到 STR-08/E1；Current Task 却用同义表达直接建议 `with` block 并停止修改 internals。实际 validator 接受，未来模型无需从历史推理即可复述正确终局。这会制造虚高 answer quality，同时所有机械测试与 hash 仍通过。

### 3. 六案分层平衡没有消除 selection、component 与 survivorship 混杂

**事实**

- 两条 long（STR-01、STR-04）都属于 middleware 边界；两条 medium（STR-05、STR-06）都属于 StaticFiles/FileResponse，并都采用 fix→reopen→refix 轨迹；short 才是 routing 与 TestClient。
- 六案中只有 STR-04 明确保留 open；其余五条都有 merge、设计关闭或“无需实现”的可见终局。
- 六案由原推荐集在统一 contamination 排除后得到，未依据 D2 表现，因而不是 outcome cherry-pick；但它仍是 purposeful continuity sample，不是独立同分布样本。
- contamination 扫描只覆盖扫描日可索引的公开 GitHub，并依赖 exact issue path 与人工关键词检查。报告已正确使用 `no_public_hit_found`，没有声称绝对无污染。

**推断**

2/2/2 只平衡声明的长度层，不平衡组件、终局类型或任务难度。将来的 aggregate 如果显示 long 上 D2 优于 D1，无法区分是长度优势还是 middleware 特性；medium 结果也会与 reopen/refix 模式绑定。这不阻止一个小型压力实验，但阻止把六案结果推广为一般 Starlette 效果或“无污染盲评”。

绝对证明模型未见过公开 Starlette 历史不是可实现 blocker；真实 blocker 只是统一规则、冻结日复扫、明确限制和不把 `no_public_hit_found` 改写成“uncontaminated”。

## Cheaper path

在完整六案 freeze 前，只规范化一个未参与 pilot 的 canary：优先 STR-04。它同时覆盖缺失的 long tier、仍 open、两个 partial capability PR、分支式 Outcome Anchor 与 middleware component，是对 schema 外推最强而成本最低的一次检验。

canary 只需在不运行模型的前提下证明：

1. long tier 与信息增量节点计数有可执行且一致的规则；
2. 字段级模型投影明确排除 `source_updated_at`、digest 和策展审计说明，或逐项证明其在 cutoff 可见；
3. 独立人工审计能从 `<= Ti` 主来源重建 task、Gold 和 Oracle-State，且专门寻找语义改写泄漏；
4. 冻结日按既有统一规则复扫 contamination，并保留 `no_public_hit_found` 限定；
5. canary 不需要修改 schema/validator 合同后，再批量冻结余下五案。

**继续 freeze 的真实 blocker**：long/schema 不变量、模型可见字段投影、逐案 source/语义泄漏人工审计、统一冻结日 contamination 复扫。

**不是 blocker 的最终理想能力**：自动语义泄漏检测、绝对无训练污染证明、统计代表性、D0/D1/D2 或远端模型运行、自动 Extracted-State、provider、host mode、自动 headline 和最终综合 Decision Gate。

## Falsification

### 可推翻 Builder 判断的证据

- 任一 long canary 需要改变 schema、tier 语义、validator 或输入投影才能通过；
- 独立 reviewer 无法按原规则复现事件增量计数或 Gold；
- 语义同义的未来 Gold/Outcome 能进入 Current Task 或 summary，同时 validator/hash 仍通过；
- 冻结日统一扫描发现六案中的新 confirmed contamination；
- 未来结果主要随 component、terminal/open 或 reopen/refix 分层变化，而不是 D1/D2 条件变化。

当前已经存在两项直接反证：现有 validator 未覆盖 long 顶层 tier；语义等价的 STR-08 future answer 已被实际接受。因此如果 Builder 判断指“当前 schema/validator 原样即可批量冻结”，该判断已经被推翻。

### 可推翻本审查 Challenge 的证据

- STR-04 canary 在预先固定的 long 与增量节点规则下通过独立 source/Gold/semantic-leakage 审计；
- 明确的字段级 render projection 不包含未来 metadata 或后见策展说明；
- validator 只被声称为结构/字面防线，不再被当作语义无泄漏证明；
- canary 无需修改 schema 合同即可 hash freeze，且冻结日 contamination 状态仍符合统一规则；
- 六案后续报告预注册按 case/tier/component/outcome 分层披露，不把 purposeful sample 当作总体估计。

如果“另开六案工单”明确把上述 canary 设为先行 gate，并在 gate 失败时停止余下五案，则本审查不反对开工单；Challenge 仅针对无 canary 的直接批量 freeze。
