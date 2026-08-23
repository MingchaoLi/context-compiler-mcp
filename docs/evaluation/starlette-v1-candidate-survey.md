# Starlette v1 真实轨迹候选筛选

日期：2026-08-23  
仓库：`Kludex/starlette`；历史 `encode/starlette` 链接视为同一仓库。  
工单：`WO-DS-01`  
研究截止：2026-08-23

## 结论

按预注册规则核对 15 条候选后，建议后续冻结工单优先处理 8 条：2 条 `short`、2 条 `medium`、4 条 `long`。该建议只依据公开证据质量、状态变化和可构造性，没有运行 D0/D1/D2、assembler、evaluator 或远端模型。

推荐集：`STR-01`、`STR-02`、`STR-03`、`STR-04`、`STR-05`、`STR-06`、`STR-07`、`STR-08`。

不应把这 8 条直接称为冻结数据集。下一工单仍需逐事件规范化、定义 D1 轮次边界、隔离 Outcome Anchor、审计 future leakage，并在 freeze 前允许因证据缺口删除案例，但不得依据 D2 表现替换案例。

## 评分说明

评分向量依次为：`证据链/状态变化/provenance/任务与Gold/Outcome Anchor/外部独立性`，总分 10。高分不自动覆盖排除条件：`STR-11` 因与另一 BaseHTTPMiddleware 根因链重复而只列 reserve，`STR-15` 即使 10 分仍因公开 benchmark contamination 建议 reject。

## 总表

| ID | 主线 | 时间范围 | 节点/层级 | 评分 | 建议 |
|---|---|---|---|---:|---|
| STR-01 | request body 在 `BaseHTTPMiddleware` 中被消费 | 2019-04-30 → 2023-06-01 | 约 10 / long | 10 | recommended |
| STR-02 | background task、disconnect 与 `No response returned` | 2020-04-28 → 2024-09-01 | 约 12 / long | 10 | recommended |
| STR-03 | Session cookie 重发导致并发覆盖 | 2023-01-27 → 2026-03-01 | 约 10 / long | 10 | recommended |
| STR-04 | middleware 获取路由信息与 per-route middleware | 2019-10-22 → 截止日仍 open | 约 10 / long | 9 | recommended |
| STR-05 | `StaticFiles` 跟随目录外 symlink | 2020-10-31 → 2023-02-04 | 约 7 / medium | 10 | recommended |
| STR-06 | FIPS 模式下 ETag/MD5 修复后重开 | 2021-12-14 → 2022-01-14 | 约 7 / medium | 9 | recommended |
| STR-07 | `/?` 路由回归其实依赖未承诺 regex 行为 | 2020-07-23 → 2020-07-31 | 约 4 / short | 9 | recommended |
| STR-08 | TestClient lifespan：手工触发方案被既有 context manager 推翻 | 2021-10-04 → 2021-10-05 | 约 4 / short | 9 | recommended |
| STR-09 | TestClient 与自定义 event loop | 2021-10-17 → 截止日仍 open | 约 10 / long | 7 | reserve |
| STR-10 | TestClient `stream=True` 长期不流式 | 2020-11-25 → 截止日仍 open | 约 8 / medium | 8 | reserve |
| STR-11 | background exception 修复引入再次抛出回归 | 2024-06-19 → 2025-04-13 | 约 9 / long | 10 | reserve |
| STR-12 | 自定义 `CapacityLimiter` 最终只交付调参文档 | 2022-07-02 → 2025-02-22 | 约 9 / long | 9 | reserve |
| STR-13 | 重复 CORS header 实为双重 CORS ownership | 2021-10-12 → 2022-01-30 | 约 6 / medium | 8 | reserve |
| STR-14 | multipart 后 contextvar 泄漏转向 asyncio/uvicorn 假设 | 2023-10-26 → 2025-01-13 | 约 6 / medium | 8 | reserve |
| STR-15 | `FileResponse` HTTP Range | 2020-05-17 → 2024-09-23 | 约 8 / medium | 10 | reject |

## 候选详情

### STR-01 — request body 在 `BaseHTTPMiddleware` 中被消费

- 主来源：[Issue #495](https://github.com/Kludex/starlette/issues/495)、[失败 PR #500](https://github.com/Kludex/starlette/pull/500)、[最终 PR #1692](https://github.com/Kludex/starlette/pull/1692)。
- 状态变化：最初确认同一请求在 middleware 与下游使用不同 `Request`/receive 路径；早期判断倾向“消费流本来就危险，应避免”；缓存 body 到 scope 的 #500 未合并；多年 workaround 和无错误挂起报告积累后，#1692 改为在 `BaseHTTPMiddleware` 的 `call_next` 路径复用 body buffer。
- Outcome Anchor：#1692 于 2023-06-01 合并，修改 `base.py`、`requests.py`，并包含 `tests/middleware/test_base.py` 与 `tests/test_requests.py`。
- 适用性：包含旧约束“流可能被真正消费”、被否决的全局缓存方向、长期 workaround 与最终边界更窄的实现；中间任务和 Fact Gold 均可由评论、PR diff/test 追溯。
- 风险：与 STR-02 同属 `BaseHTTPMiddleware`，冻结时需要证明任务维度分别是 request-body ownership 与 disconnect/background lifecycle，避免组件过度采样。
- 评分：`2/2/2/2/1/1 = 10`；`recommended`。

### STR-02 — background task、disconnect 与 `No response returned`

- 主来源：[Issue #919](https://github.com/Kludex/starlette/issues/919)、[PR #1715](https://github.com/Kludex/starlette/pull/1715)、[回归 Issue #2516](https://github.com/Kludex/starlette/issues/2516)、[未合并 PR #2519](https://github.com/Kludex/starlette/pull/2519)、[最终 PR #2620](https://github.com/Kludex/starlette/pull/2620)。
- 状态变化：#919 中不同环境的复现结论冲突，曾以 workaround、过时/重复问题收束；#1715 用 `http.disconnect` 与 stream close 替代 task cancellation 并带测试；#2516 明确指出“supposedly fixed”后 race 仍在，多层 middleware 与 client disconnect 成为新证据；#2519 未合并，#2620 改为不通过 `StreamingResponse` 轮询 disconnect。
- Outcome Anchor：#2620 于 2024-09-01 合并并修改 `tests/middleware/test_base.py`。但 #2516 后续仍有 2025 年复现评论，所以不得把该 anchor 写成“所有相关问题最终根治”。
- 适用性：非常适合测试“旧问题看似解决后，新证据是否要求重新区分根因”，也能检查已否决方案和部分 resolved 状态是否被错误概括。
- 风险：复合链边界长；冻结时必须把 #919、#1715、#2516 的时间可见性分开，不能把后期 race 解释写进 2020 年节点。
- 评分：`2/2/2/2/1/1 = 10`；`recommended`。

### STR-03 — Session cookie 重发导致并发覆盖

- 主来源：[Discussion #2018](https://github.com/Kludex/starlette/discussions/2018)、[Issue #2019](https://github.com/Kludex/starlette/issues/2019)、[失败 PR #2401](https://github.com/Kludex/starlette/pull/2401)、[失败 PR #2402](https://github.com/Kludex/starlette/pull/2402)、[最终 PR #3166](https://github.com/Kludex/starlette/pull/3166)。
- 状态变化：最初问题从“每次响应都发 Set-Cookie”演进为慢的只读响应覆盖更新 cookie 的具体竞态；简单在响应中再次 set cookie 会产生双 header；两版 persistent/refresh-window 方案未合并；对 timestamp 与稳定编码的讨论否定了直接比较签名字符串；最终 #3166 选择追踪 session access/modification。
- Outcome Anchor：#3166 于 2026-03-01 合并，含 `tests/middleware/test_session.py`。
- 适用性：旧事实、失败 workaround、长期 open 状态和最终不同解法都可追溯；时间跨度足够长，且不是 BaseHTTPMiddleware 根因。
- 风险：Issue 评论提到外部/部分非开源实现，只能作为 Decision Reference；Gold 必须仅来自 Starlette 公开 issue/PR/test。
- 评分：`2/2/2/2/1/1 = 10`；`recommended`。

### STR-04 — middleware 获取路由信息与 per-route middleware

- 主来源：[Issue #685](https://github.com/Kludex/starlette/issues/685)、[失败 PR #1286](https://github.com/Kludex/starlette/pull/1286)、[PR #1649](https://github.com/Kludex/starlette/pull/1649)、[PR #2349](https://github.com/Kludex/starlette/pull/2349)。
- 状态变化：早期架构约束是全局 middleware 先于 routing，候选方向包括预解析/缓存或 route 后 middleware；#1286 虽有批准但关闭；#1649 增加 Mount middleware 后 Issue 被关闭，随后维护者确认这是 scope creep，APM 的低改动 route-name 需求未解决并重开；#2349 增加 Route/WebSocketRoute middleware，但 PR 自己明确“不解决 #685”。
- Outcome Anchor：#1649、#2349 均有 routing tests，但只锚定部分能力；截至研究截止 Issue 仍 open。
- 适用性：是“相邻组件最终需要 ≠ 原问题已经解决”的直接反例，特别适合 open-question continuity 和 resolved issue reopening。
- 风险：不能把两个已合并 PR 当作原始 APM 需求的最终 patch；后续 freeze 应把“部分能力已交付”和“原问题仍 open”分别标注。
- 评分：`2/2/2/2/1/0 = 9`；`recommended`。

### STR-05 — `StaticFiles` 跟随目录外 symlink

- 主来源：[Issue #1083](https://github.com/Kludex/starlette/issues/1083)、[第一次 PR #1377](https://github.com/Kludex/starlette/pull/1377)、[第二次 PR #1683](https://github.com/Kludex/starlette/pull/1683)。
- 状态变化：#1377 修改代码和测试后合并并关闭 Issue；两周后 Issue 重开；#1683 明确以前一尝试为背景，经历多次 changes requested 与替代方案讨论后再次合并。
- Outcome Anchor：#1683 含 docs、`staticfiles.py` 和 `tests/test_staticfiles.py`，2023-02-04 合并并关闭 Issue。
- 适用性：时间链适中，首次“已解决”被推翻，最终仍有清晰 patch/test/review，是冻结成本较低的高质量 medium 案例。
- 风险：早期切片不能看到 #1377 合并后的 reopen 原因；后续需要核对 reopen 评论与两版测试差异。
- 评分：`2/2/2/2/1/1 = 10`；`recommended`。

### STR-06 — FIPS 模式下 ETag/MD5 修复后重开

- 主来源：[Issue #1365](https://github.com/Kludex/starlette/issues/1365)、[第一次 PR #1366](https://github.com/Kludex/starlette/pull/1366)、[第二次 PR #1410](https://github.com/Kludex/starlette/pull/1410)。
- 状态变化：#1366 用 `usedforsecurity=False` 修复并合并，Issue 随后关闭；约四周后重开，#1410 再修正 compatibility wrapper 后关闭。
- Outcome Anchor：两次 patch 与 review/merge 清晰，但 PR file list 没有测试文件；只能记录 patch/acceptance，不能声称有仓库内 regression test。
- 适用性：短于长链但有明确“首次 fix 不足”的状态反转，可检查 D2 是否无意义增加成本。
- 风险：FIPS 环境难以在本地重放；Gold 应限定为公开异常、调用路径和 merge 事实，不能凭最终成功猜测平台行为。
- 评分：`2/2/2/2/1/0 = 9`；`recommended`。

### STR-07 — `/?` 路由回归其实依赖未承诺 regex 行为

- 主来源：[Issue #1008](https://github.com/Kludex/starlette/issues/1008)、[未合并 PR #1010](https://github.com/Kludex/starlette/pull/1010)、[维护者设计说明](https://github.com/Kludex/starlette/issues/1008#issuecomment-664875431)。
- 状态变化：用户把 0.13.5 后行为视为 regression；调查将现象关联到 path regex escaping；维护者说明公开 API 是 URI templating，过去接受 regex 属于实现漏洞；回退曾被重新考虑，但最终给出 `{parameter:path}`、显式双 route 与 redirect 等替代路径。
- Outcome Anchor：没有合并 patch；真实终局是设计决定与可验证 workaround。
- 适用性：4 个核心节点即可构造，D1 理论上应足够；能防止数据集只奖励远期召回，也能测试被否决的“恢复任意 regex”方案是否重现。
- 风险：评论较多但核心信息很短，冻结时不得人为膨胀为长链。
- 评分：`2/2/2/2/0/1 = 9`；`recommended`。

### STR-08 — TestClient lifespan：手工触发方案被既有 context manager 推翻

- 主来源：[Issue #1298](https://github.com/Kludex/starlette/issues/1298)、[最终发现](https://github.com/Kludex/starlette/issues/1298#issuecomment-934634591)。
- 状态变化：初始认为 TestClient 不触发 startup/shutdown；讨论先提出 fixture 与手工 lifecycle hack；报告者随后读取现有实现，确认 `with TestClient(app)` 已提供所需语义并主动关闭。
- Outcome Anchor：没有代码 patch；既有 TestClient context-manager 行为与关闭评论构成结果锚点。
- 适用性：非常便宜的 short 反偏差案例，正确答案是保留已发现的现有能力并停止不必要实现，而不是继续扩展组件。
- 风险：与 STR-09 都涉及 TestClient/event loop；冻结时应限制 STR-08 只评价 lifespan context manager，不吸收跨 loop 争议。
- 评分：`2/2/2/2/0/1 = 9`；`recommended`。

### STR-09 — TestClient 与自定义 event loop

- 主来源：[Issue #1315](https://github.com/Kludex/starlette/issues/1315)、[失败 PR #1347](https://github.com/Kludex/starlette/pull/1347)。
- 状态变化：升级 0.14.2→0.15.0 后多种 async client 报不同 loop；“AnyIO 上游问题”与“Starlette 切换 AnyIO 改变行为”两种归因竞争；自定义 portal PR 关闭；多年 workaround 依赖 pytest、SQLAlchemy 或 NullPool；2026 年关闭建议立即被“非 pytest 用户怎么办”挑战后重开。
- Outcome Anchor：无被接受 patch，Issue 截止日仍 open。
- 适用性：open-question continuity 很强。
- 不优先原因：复现依赖 Motor/NATS/pytest/SQLAlchemy 等外部组合，Fact Gold 的组件归属不稳定；与 STR-08 同属 TestClient，先列 `reserve`。
- 评分：`1/2/2/2/0/0 = 7`；`reserve`。

### STR-10 — TestClient `stream=True` 长期不流式

- 主来源：[Issue #1102](https://github.com/Kludex/starlette/issues/1102)、[开放 PR #3258](https://github.com/Kludex/starlette/pull/3258)、[开放 PR #3355](https://github.com/Kludex/starlette/pull/3355)。
- 状态变化：最初确认 transport 会完整缓冲；多种第三方 workaround 的适用性反复变化；2023 年进一步定位到 `_TestClientTransport.handle_request` 完整执行 app；2026 年出现两条都带 test 的竞争 PR，但截至截止日均未合并。
- Outcome Anchor：只有开放 patch/test，没有 acceptance。
- 适用性：长期 unresolved 与当前竞争方案很适合连续性评价。
- 不优先原因：研究截止附近仍快速变化，freeze 后很容易产生 cutoff ambiguity；应等两条 PR 状态稳定或明确冻结到某个 pre-PR 节点。
- 评分：`2/1/2/2/0/1 = 8`；`reserve`。

### STR-11 — background exception 修复引入再次抛出回归

- 主来源：[Issue #2625](https://github.com/Kludex/starlette/issues/2625)、[失败 PR #2696](https://github.com/Kludex/starlette/pull/2696)、[合并 PR #2812](https://github.com/Kludex/starlette/pull/2812)、[回归 Issue #2893](https://github.com/Kludex/starlette/issues/2893)、[修复 PR #2911](https://github.com/Kludex/starlette/pull/2911)。
- 状态变化：异常被静默吞掉；无测试的 #2696 关闭；带 test 的 #2812 合并并关闭；新版本随后把已经处理的异常再次抛出，用户回退版本；#2911 增加检查和测试后合并。
- Outcome Anchor：#2812、#2911 均含 `tests/middleware/test_base.py`，且第二个 patch 是第一个 patch 的可观察回归修复。
- 适用性：证据极强。
- 不优先原因：与 STR-02 同属 BaseHTTPMiddleware/background lifecycle，若同时冻结会明显放大同一组件权重；在 STR-02 证据规范化失败时可作为替补。
- 评分：`2/2/2/2/1/1 = 10`；`reserve`。

### STR-12 — 自定义 `CapacityLimiter` 最终只交付调参文档

- 主来源：[Issue #1724](https://github.com/Kludex/starlette/issues/1724)、[失败文档 PR #2288](https://github.com/Kludex/starlette/pull/2288)、[合并文档 PR #2881](https://github.com/Kludex/starlette/pull/2881)。
- 状态变化：候选方案从 Starlette 为不同用途分隔 limiter、允许 route/request 传入 limiter，到反对暴露复杂 API；长期讨论 workload、GIL 与 worker 数；最终不是实现自定义 runtime component，而是记录如何调整 AnyIO 默认 limiter。
- Outcome Anchor：#2881 只修改文档和 mkdocs 配置。
- 适用性：被否决的过度工程化方向很清晰。
- 不优先原因：工单预注册要求避免主要为文档变更的轨迹；因此即使状态变化与 provenance 较强，也只列 reserve。
- 评分：`2/2/2/2/0/1 = 9`；`reserve`。

### STR-13 — 重复 CORS header 实为双重 CORS ownership

- 主来源：[Issue #1309](https://github.com/Kludex/starlette/issues/1309)、[错误关闭与重开](https://github.com/Kludex/starlette/issues/1309#issuecomment-946800626)、[最终关闭说明](https://github.com/Kludex/starlette/issues/1309#issuecomment-1025161781)。
- 状态变化：最初怀疑 `MutableHeaders.update`/大小写；维护者误把无关 PR 当作修复而关闭，立即重开；后续证据指向 Starlette 与 engine.io 同时管理 CORS；最终决定不让 Starlette middleware为另一个 middleware 的重复 header 兜底。
- Outcome Anchor：无 Starlette patch；配置 ownership 决定与关闭评论为结果。
- 适用性：包含明确错误关闭、根因转移和被否决 workaround。
- 不优先原因：主要根因跨到 python-engineio，关闭后仍有缺少最小复现的相似报告；外部独立性较弱。
- 评分：`2/2/2/2/0/0 = 8`；`reserve`。

### STR-14 — multipart 后 contextvar 泄漏转向 asyncio/uvicorn 假设

- 主来源：[Discussion #2312](https://github.com/Kludex/starlette/discussions/2312)、[Issue #2335](https://github.com/Kludex/starlette/issues/2335)、[CI reproducer 评论](https://github.com/Kludex/starlette/issues/2335#issuecomment-1894153749)。
- 状态变化：维护者最初不能复现并关闭；报告者提供概率性 CI reproducer 后重开；后续证据显示 asyncio loop/旧 Python 可复现而 uvloop/较新环境不可复现；最终转向 CPython/uvicorn 方向并关闭 Starlette Issue。
- Outcome Anchor：无 Starlette patch/test；只有外部 reproducer 和上游关联。
- 适用性：假设修正与“不应在错误仓库继续实现”很清晰。
- 不优先原因：环境敏感、最终根因仍非正式证明，且依赖外部 CI；Gold 只能保守写成“证据支持转向”，不能断言已证明 CPython 根因。
- 评分：`2/2/2/2/0/0 = 8`；`reserve`。

### STR-15 — `FileResponse` HTTP Range

- 主来源：[Issue #950](https://github.com/Kludex/starlette/issues/950)、[失败 PR #1999](https://github.com/Kludex/starlette/pull/1999)、[合并 PR #2697](https://github.com/Kludex/starlette/pull/2697)。
- 状态变化：Safari/video range 需求长期 open；中间先以第三方 response 文档绕过；#1999 含 test 但关闭；#2697 采用另一实现并带 `tests/test_responses.py` 后合并。
- Outcome Anchor：#2697 于 2024-09-23 合并并关闭 Issue。
- 原本适用性：长等待、失败 patch 与最终 patch/test 都很强。
- 排除原因：2026-08 已有多个公开 `LLM-CR-EVAL` / `LLM-CR-EVAL-TREX` 派生仓库把同一 Starlette Range 任务交叉引用到 #950，例如 [starlette-153-cr1 PR #1](https://github.com/LLM-CR-EVAL/starlette-153-cr1/pull/1) 与 [starlette-153-cr5 PR #1](https://github.com/LLM-CR-EVAL-TREX/starlette-153-cr5/pull/1)。即使这些交叉引用晚于真实修复，也会造成模型记忆、公开 benchmark 重用和实验独立性污染。
- 评分：`2/2/2/2/1/1 = 10`；因 contamination 覆盖高分，`reject`。

## 推荐冻结集与分层

| 层级 | 推荐候选 | 目的 |
|---|---|---|
| short | STR-07、STR-08 | D1 理论上应足够；验证 D2 是否只增加成本，以及能否停止已无必要的实现 |
| medium | STR-05、STR-06 | 首次修复被推翻，但事件链仍短到可高置信规范化 |
| long | STR-01、STR-02、STR-03、STR-04 | request ownership、disconnect race、session concurrency、部分解决但仍 open 四种不同连续性 |

若 DS-02 在规范化时必须删除推荐案例，替换优先顺序不是按分数机械选择：

1. STR-11 仅在 STR-02 删除后使用，避免重复 BaseHTTPMiddleware root；
2. STR-10 仅在冻结明确 cutoff 且不纳入其后 active PR 后使用；
3. STR-09 仅在外部依赖可以被公开 evidence 固定后使用；
4. STR-12/13/14 只作为保持“非代码终局/外部归因”的备选；
5. STR-15 不进入 v1 freeze。

## Selection bias findings

1. **评论数检索偏差。** 初筛从高评论公开 Issue 入手，天然偏向旧、争议大和长期 open 的轨迹。已用 STR-07/08 与 2024–2025 regression 链补核，但推荐集仍不是 Starlette bug 的统计代表样本，只是评估连续性能力的 purposeful sample。
2. **middleware 组件集中。** Starlette 高质量长链显著集中在 middleware。推荐集只保留一个复合 BaseHTTPMiddleware lifecycle 链 STR-02，并把同根的 STR-11 降为 reserve；即便如此，STR-01/03/04/05 仍涉及不同 middleware 边界，最终报告必须按组件披露，不能把 8 条当成独立同分布样本。
3. **survivorship/outcome 偏差。** 有合并 PR/test 的案例更容易标注。STR-04、07、08 特意保留未完全修复、设计关闭和“无需修复”终局；不得因 Outcome Anchor 较弱在 freeze 时全部删除。
4. **活跃截止偏差。** STR-09/10 在 2026 年仍变化，容易因截止日选择改变结果；推荐集暂不使用它们。
5. **公开 benchmark 污染。** STR-15 已被公开 LLM 评测派生仓库重复，明确排除。DS-02 还应对其余 8 条再做一次公开 benchmark 名称/交叉引用扫描。
6. **复合链主观边界。** STR-02 把“先前修复”与后续 race 合并，是为了测试 resolved→reopened 连续性，但会增加切片者自由度；后续必须预先列出纳入/排除事件，不能按回答效果调整。

## Future leakage findings

1. Issue/PR 最终状态、merge commit、review approval 与 regression test 只能作为 Outcome Anchor；在对应发生时间前不可进入 Available Evidence。
2. STR-02 的“#1715 没有完全解决 #2516 race”、STR-05/06 的 reopen、STR-11 的修复后回归都是后期事实，最容易被反写进早期 Fact Gold。
3. STR-04 的 #1649/#2349 是部分能力，不得在较早或较晚切片中错误标成“#685 已解决”。
4. STR-07/08 的最终答案很短，Current Task 尤其不能直接复述“regex 从未受支持”或“使用 context manager”，否则会把答案放进 current_input。
5. STR-03 的 #3166 发生在 2026 年；此前所有节点必须保持问题未解决，不能用最终 access/modification tracking 解释早期方案。
6. GitHub 页面今天展示的 `closed/open/merged` 是研究时的终局视图；DS-02 必须使用事件时间戳重建 Ti 状态，不能把页面当前 badge 当作早期状态。

## 检索范围与限制

- 仅使用公开 GitHub Issue/Discussion/PR、review、file list 与时间线；没有克隆 Starlette，也没有把外部仓库内容写入本项目。
- 候选事实以 GitHub 主页面/API 数据为准；搜索排序只用于发现，不用于证明。
- 没有运行 D0/D1/D2，没有查看 Context Compiler 对任何候选的输出。
- 本工单没有生成标准化事件、Gold、fixture 或 hash；节点数是进入 DS-02 的工作量估计，不是已经冻结的切片数。
