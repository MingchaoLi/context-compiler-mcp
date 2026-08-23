# WO-DS-08 — Starlette STR-01 source/Gold checkpoint

状态：IMPLEMENTED — PENDING NEW INDEPENDENT DATA QA

## 背景与唯一结果

WO-DS-07 已独立接受 STR-07 checkpoint/schema gate。当前已审计分布为 1 short / 0 medium / 4 long；关键节点对抗审查要求先补完 STR-01，再一次性考虑 STR-06/07/01 promotion，避免重复搬运 collection/hash/validator。

本工单只交付一个结果：

> 在既有共同 evidence cutoff 下，把 STR-01（Issue #495、未合并 PR #500、最终 PR #1692）的公开来源、真实信息增量、严格时间切片、Fact Gold、人工 Oracle-State、Decision Reference 与 Outcome Anchor 制作为可独立 QA 的单案 checkpoint。

survey 的“约 10 节点/long”只是预计。不得为了满足预计节点数或分层而合并、拆分、遗漏真实增量；最终 tier 必须按 `3–4 short / 5–8 medium / 9+ long` 机械重算并如实披露。

## 固定范围

- case id：`STR-01`；
- repository：`Kludex/starlette`，历史 `encode/starlette` 视为同一仓库；
- 主线：Issue #495、closed-unmerged PR #500、merged PR #1692；
- evidence cutoff：`2026-08-23T03:00:00Z`；
- contamination snapshot：只引用 WO-DS-05 已接受的版本化 snapshot/path/hash，不事后收窄、扩大或重写扫描规则；
- 状态：checkpoint 使用 `checkpoint_not_frozen`，case 沿用既有 `canary_not_frozen` schema；
- 授权位必须保持 `promotion_authorized:false`、`evaluation_ready:false`、`model_run_authorized:false`。

## 最小上下文路由

实现者除根 `AGENTS.md`、`docs/PROJECT_STATE.md`、`docs/ROADMAP.md` 与本工单外，只读取：

- `docs/evaluation/starlette-v1-candidate-survey.md` 的 STR-01、selection bias、future leakage 段；
- `docs/adversarial-reviews/AR-2026-08-23-post-ds06-checkpoint.md`；
- `evaluation/starlette-v1/checkpoint/STR-06/`、`STR-07/` 及各自 wrapper/validator/test，作为长案 checkpoint、严格来源合同和泄漏反例参考；
- `evaluation/starlette-v1/promotion/contamination-snapshot.json` 中 STR-01 登记项。

默认不读取原始需求归档、旧 aiohttp/HTTPX 数据、其他未路由 work order 或宿主仓库。

## 来源审计与增量边界

必须重新访问 GitHub 官方公开来源并逐项记录 database/node id、actor、`created_at`、`updated_at`、正文 SHA、commit/tree SHA 或 canonical state SHA。至少审计：

- Issue #495 的创建、能够改变诊断/约束/状态的 comments，以及最终 tracker close；
- PR #500 的创建、两次 commit、file/test diff、维护者搁置说明和 closed-unmerged 状态；
- PR #1692 的创建、两次 title narrowing、force-push/commit 序列、一般评论、正式 review、行级 review、最终 file/test diff、approval、merge；
- 最终 merge commit与 Issue #495 close 的时间先后关系。

可变 Issue/PR body 只能把创建时可由 immutable title、initial commit、patch 或 timestamped timeline 证明的内容写进早期 summary；当前 body digest 只用于变化探测。PR #1692 在 2023 年发生 force-push，当前 commit list 不得伪装成 2022 年创建时已有；当前标题也不得反写到两次 rename 以前。匿名 API 限流、timeline 噪声和 outcome 后的无关 cross-reference 不是证据缺失或新信息增量。

每个保留事件必须增加新事实、约束、判断、状态、方案或验证结果。重复 use case、礼貌催促、只复述 workaround、旁支 response-body/exception-handler 讨论、mention/subscription 和 outcome 后评论进入 `excluded_sources` 并写明理由。

## 必须保持的语义边界

- 初始 hang 与同一 scope 上出现不同 `Request`/receive 路径有关，但早期证据不能提前宣称最终实现；
- “stream 可能已不可逆消费，应避免”是当时约束，不等于所有 buffered-body 复用都被永久否决；
- PR #500 把 body 缓存在 scope 并添加重复创建 `Request` 的测试，但维护者因 streaming 行为未厘清而搁置，patch 从未 merge/deliver；
- `Request.body()`/`json()` 的缓存路径与 `form()`/stream 消费行为必须区分；多年 workaround 不能写成 repository-supported fix；
- PR #1692 最终只在 `BaseHTTPMiddleware.call_next` 路径复用已缓存 body；middleware 调用 `stream()` 后下游只收到空 body，以避免等待；
- #1692 明确不解决 endpoint 先消费后 middleware/exception handler 再读等需要向上游传递信息的场景；不能写成通用 body replay；
- 2023-05-04 review 发现多 chunk 情况下过早标记 stream consumed 的 bug，后续 commit/test 才修正；不得把修正反写进 review 前切片；
- approval、merge、tests delivered 与 Issue close 是不同状态。Issue close 只证明 tracker/目标范围被接受，不证明所有 request-body ownership 场景已解决。

## 时间切片与防泄漏

按每个已审计增量生成 `T1…Tn`；每个 `available_event_ids` 必须是严格真实前缀。Current Task 只能问当时最合理的诊断、约束、已否决方向、风险、验证或下一步，尤其不得直接复述未来答案：

- PR #500 最终不会合并；
- #1692 最终缩小到 `call_next`；
- multi-chunk review 会发现 bug；
- 最终测试、approval、merge SHA 或 Issue close。

后编辑 PR body/title、最终 patch/test、Outcome Anchor、未来 Gold/Decision Reference 均不得进入较早任务或投影历史。

## Gold、Oracle 与 Outcome 边界

- Fact Gold 每项必须有当前前缀内 provenance，并在判断被后续证据修正时使用 `superseded_at_event_id`；
- 必须分别建模“问题已复现”“宽缓存方案已提出但搁置”“streaming 约束仍有效”“narrow proposal 尚待证明”“review 已发现 bug”“修正/测试已提交”“repository 已接受并交付”；
- Oracle-State 不得把 workaround、PR 创建、approval 或 tracker close 提前投影成 `RESOLVED`/delivered；
- Decision Reference 只记录真实后续动作，Agent 可以提出其他合理验证路径；
- Outcome Anchor 必须保留 PR #500 closed-unmerged、PR #1692 最终 patch、回归测试、approval、merge commit 与 Issue close，同时明确 #1692 的非目标。

## 与 STR-02 的组件重叠

STR-01 与 STR-02 都涉及 `BaseHTTPMiddleware`，但任务维度不同：STR-01 是 request-body ownership/receive replay；STR-02 是 disconnect/background lifecycle 与 `No response returned`。source ledger、manifest 和最终报告必须明确该相关性，不能把两案当成独立同分布样本，也不能因此删除其中一案。

## 交付物

- `evaluation/starlette-v1/checkpoint/STR-01/` 七文件；
- `evaluation/starlette-v1/str01-checkpoint.json`；
- `evaluation/starlette-v1/str01-checkpoint-hashes.json`；
- `evaluation/starlette-v1/validate-str01-checkpoint.mjs`；
- `test/starlette-str01-checkpoint.test.ts`；
- `docs/evaluation/starlette-v1-str01-checkpoint.md`；
- `docs/handoffs/WO-DS-08-starlette-str01-source-gold-checkpoint.md`。

同步更新 `evaluation/starlette-v1/README.md`、本工单、`docs/PROJECT_STATE.md`、`docs/ROADMAP.md`，但在 QA PASS 前只能写待验收状态。

## 验证与独立 QA

Builder 至少执行：checkpoint validator、聚焦反例、真实 `parseEvaluationSuiteV2` 静态解析所有 slice、`npm test`、`npm run test:protocol`、`npm run build`、`git diff --check`、受保护范围 diff 与真实 `npm pack --dry-run --json` 隔离。

聚焦反例至少覆盖：

- tier 少计、cutoff/status/授权位变化；
- PR #500 被伪写成 merged/delivered 或 streaming 语义已解决；
- #1692 当前 body/title/commit list 反写到创建时；
- #1692 被伪写成通用 replay 或修复 endpoint/exception-handler 回读；
- multi-chunk bug/test/fix、approval/merge/Issue close 进入过早 Current Task/Gold/Oracle；
- Issue close 被伪写成所有 body ownership 场景已解决；
- 内容、hash path/order、漏项、重复、unknown field、symlink、snapshot 漂移；
- 投影夹带 source/Gold/Oracle/Decision/Outcome 非输入字段。

实现者提交 handoff 但不得批准自己。新的独立 Data QA 必须固定 Builder candidate 与父提交，从头访问登记 source、重算信息增量/tier、检查 Gold/Oracle/Outcome 语义与 future leakage，并运行全部本地检查。FAIL 只提交 QA 报告并返回 append-only 修复；PASS 也只接受 checkpoint/schema gate。

## 明确不做

- 不把 STR-06/07/01 加入 promotion collection；
- 不创建 Probe、answer rubric、Critical Miss 评分或 runner；
- 不运行 D0/D1/D2、远端 GPT-5.6、aggregate 或 PASS rate；
- 不修改 evaluator、retrieval、assembler、Context Compiler core、provider、host、MCP 或依赖；
- 不因 0 medium 事后换案、拆链、漏计或调 D2 policy；
- 不把 source audit 发现的新架构或污染规则需求顺手实现，只登记 finding。

## 验收边界

只有独立 QA PASS，STR-01 source/Gold checkpoint 才接受。PASS 仍不表示 STR-01 promoted/frozen、六案完整、Probe/answer rubric 就绪、`evaluation_ready` 或可运行模型；下一步只能另开工单一次性 promotion STR-06/07/01，再在关键节点申请对抗审查。

## Builder 实现结果

2026-08-23 已完成待验收候选：保留 18 个真实信息增量与 18 个严格前缀 slice，机械分层为 long。候选严格分开 PR #500 closed-unmerged、不可逆 streaming constraint、body/form cache 差异、receive queue hang、PR #1692 current-body 限制、`call_next` 窄化、endpoint-first 非目标、multi-chunk review bug、修正/补测、approval、merge 与 tracker close。

新增七文件 checkpoint、wrapper、八项 hash、严格 validator、13 项聚焦反例、中文 source ledger 与 handoff；真实 evaluator v2 parser 静态接受 18 slices / 171 raw turns。Builder 自检通过聚焦 13/13、全量 333、protocol 8/8、build、diff check 与真实 50-entry npm pack 隔离。没有修改 promotion、旧 fixture、core、runner/provider/host/MCP，也没有创建 Probe、运行 D0/D1/D2 或远端模型。实现者不接受本工单，必须由新的独立 Data QA 固定 Builder candidate 后决定 PASS/FAIL。
