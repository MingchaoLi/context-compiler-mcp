# WO-DS-01 — Starlette 真实轨迹候选筛选

状态：COMPLETED — CANDIDATE SURVEY ONLY

交接：`docs/handoffs/WO-DS-01-starlette-candidate-survey.md`

候选报告：`docs/evaluation/starlette-v1-candidate-survey.md`

## 结果

基于 `Kludex/starlette` 的公开 GitHub 历史，形成约 15 条真实软件工程轨迹候选清单，并在不运行 D0/D1/D2、不查看 Context Compiler 表现的前提下，推荐其中 6–10 条进入后续独立冻结工单。

本工单只完成候选筛选与适用性分析，不生成最终 fixture、时间切片、Gold、模型回答或综合评分。

`encode/starlette` 视为同一项目的历史仓库引用；所有交付统一记录当前仓库标识 `Kludex/starlette`，同时保留原始来源 URL。

## 预注册筛选规则

本节必须先于候选研究提交到 Git，后续不得根据 D2 表现修改。

### 必须条件

每条候选必须同时满足：

1. 至少 3 个具有信息增量的真实时间节点，而不是同一事实的重复讨论；
2. 节点可由公开 Issue、Discussion、PR、review、commit 或 test result 的稳定标识与时间戳排序；
3. 至少包含一种可观察状态变化：假设被修正、方案被否决、约束持续有效、问题 resolved/unresolved 转换，或远期证据改变当前判断；
4. 在至少一个中间节点能够构造只依赖当时信息的开发任务；
5. Fact Gold 能够由公开证据支持，不需要猜测维护者的私有意图。

### 优先条件

- Issue/Discussion 与 PR、commit、regression test 形成连续链；
- 存在失败或被否决的尝试；
- 旧问题已解决且后续不应重开，或长期未解决且后续仍需保持 open；
- 新证据必须结合较早历史才能正确解释；
- 有明确 Outcome Anchor，但不要求每条候选都有完整 patch。

### 排除条件

- Issue 后单个 commit 直接修复，且没有中间判断变化；
- 只有单条维护者回复；
- 主要是文档、格式、拼写、发布或机械依赖更新；
- 时间顺序或跨链接关系无法可靠确认；
- 依赖大量外部私有环境；
- Gold 只能以“复刻开发者下一条回复”定义；
- 与另一候选实质属于同一根因链，导致重复采样。

## 预注册评分

评分只基于公开历史证据，不使用 D2 输出：

- 证据链完整度：0–2；
- 状态变化强度：0–2；
- provenance 可追溯性：0–2；
- 中间任务与 Fact Gold 可构造性：0–2；
- Outcome Anchor：0–1；
- 对私有/外部环境的独立性：0–1。

总分 0–10。推荐冻结通常要求至少 7 分；低于 7 分只能作为明确标注的备选或反偏差短链，不能为了数量进入推荐集。

## 预注册分层

按具有信息增量的节点数量分层，时间跨度只作为辅助说明：

- `short`：3–4 个节点；D1 理论上可能已经足够；
- `medium`：5–8 个节点；包含至少一次明确状态变化或远期依赖；
- `long`：9 个及以上节点；包含跨较长历史的反转、否决或 resolved/unresolved 连续性。

推荐冻结集目标为 6–10 条，并尽量每层至少 2 条。若公开证据不足以满足该分布，必须如实报告，不得降低 provenance 或 Gold 标准补齐。

## 候选记录字段

每条候选至少记录：

- 稳定候选 id；
- Issue / Discussion / PR / commit / test 的公开标识和直接 URL；
- 时间范围；
- 主要问题；
- 可观察状态变化；
- 是否存在最终 patch、regression test、review/acceptance 或其他 Outcome Anchor；
- 预计可切分的信息增量节点数量及 `short|medium|long`；
- 六项预注册评分与总分；
- 适用或不适用原因；
- selection bias 与 future leakage 风险；
- `recommended | reserve | reject` 建议。

## 防偏差与泄漏边界

- 候选筛选阶段允许查看完整公开历史，以判断证据质量，但不得把后期证据反写成早期节点已有事实。
- Outcome Anchor 与早期可见证据必须在后续冻结工单中物理分离。
- 本工单不得运行 assembler、evaluator、D0/D1/D2 或远端回答模型；候选去留不得依据 Context Compiler 表现。
- 不以旧 aiohttp / HTTPX 实验数据指导 Starlette 选样。
- 同时保留短、中、长轨迹，不能只挑 D2 天生占优的长链。
- 真实开发者下一步只作为 Decision Reference，不是唯一正确答案。

## 允许上下文

只读取：

- `AGENTS.md`；
- `docs/PROJECT_STATE.md`；
- `docs/ROADMAP.md`；
- 本工单；
- `Kludex/starlette` / `encode/starlette` 的公开 GitHub Issue、Discussion、PR、commit、review、test 与仓库内相关公开文件。

不得读取原始需求归档、同级项目、宿主代码、D2 运行结果或其他私有数据。

## 交付

- `docs/evaluation/starlette-v1-candidate-survey.md`：约 15 条候选、评分、适用性、推荐冻结集及偏差/泄漏风险；
- `docs/handoffs/WO-DS-01-starlette-candidate-survey.md`：来源范围、检索限制、结果与后续冻结输入；
- 更新 `docs/PROJECT_STATE.md` 与 `docs/ROADMAP.md`，但不得把候选清单描述为已冻结数据集。

## 验收

- 候选数量约 15 条，每条都有至少一个可直接核查的公开主来源；
- 推荐 6–10 条，并明确 short/medium/long 分布；
- 每条都有预注册评分、适用性与风险说明；
- 不包含 fixture、Gold 断言、hash freeze、模型输出或 core 修改；
- 所有关键事实能够追溯到 GitHub 主来源，时间与跨链接不依赖搜索摘要；
- `git diff --check` 通过，工作树不含下载仓库、缓存、凭据、日志或生成物。

这是研究交付，不做实现者自我 QA。候选集进入冻结前，后续 WO-DS-02 必须进行独立数据审计；若本工单发现明显选择判断争议，应保留为 finding，不扩大本工单。

## 明确不做

- 最终轨迹冻结、标准化事件、时间切片、Fact Gold、Decision Reference 或 hash；
- D0/D1/D2 生成、answer quality 运行、Critical Miss 评分；
- evaluator/core/retrieval/assembler/extractor 修改；
- Formal Host Mode、自动 Headline、隐式状态更新、provider SDK 或网络能力接入；
- 数学权重、综合分数或 Decision Gate。
