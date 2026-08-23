# WO-DS-07 — Starlette STR-07 source/Gold checkpoint

状态：PLANNED — NOT IMPLEMENTED

## 背景与唯一结果

WO-DS-06 已独立接受 STR-06 checkpoint/schema gate，但该案机械归为 long。关键节点对抗审查指出，立即单案 promotion 只会重复 collection/hash/validator 搬运，空 Probe 也只阻塞首次效果实验，不阻塞剩余 canonical data 制作。

本工单只交付一个结果：

> 在既有共同 evidence cutoff 下，把 STR-07（Issue #1008、未合并 PR #1010）的公开来源、真实信息增量、严格时间切片、Fact Gold、人工 Oracle-State、Decision Reference 与无合并 patch 的 Outcome Anchor 制作为可独立 QA 的单案 checkpoint。

不得为了补齐 short 配额而删减真实信息增量。survey 的“约 4 节点/short”只是预计；最终 tier 必须按 `3–4 short / 5–8 medium / 9+ long` 机械重算并如实披露。

## 固定范围

- case id：`STR-07`；
- repository：`Kludex/starlette`，历史 `encode/starlette` 视为同一仓库；
- 主线：Issue #1008 与 PR #1010；
- evidence cutoff：`2026-08-23T03:00:00Z`；
- contamination snapshot：只引用 WO-DS-05 已接受的版本化 snapshot/path/hash，不重新解释或扩大扫描规则；
- 状态：checkpoint 继续使用 `checkpoint_not_frozen`，case 可沿用既有 `canary_not_frozen` schema；
- 授权位必须保持 `promotion_authorized:false`、`evaluation_ready:false`、`model_run_authorized:false`。

## 最小上下文路由

实现者除根 `AGENTS.md`、`docs/PROJECT_STATE.md`、`docs/ROADMAP.md` 与本工单外，只读取：

- `docs/evaluation/starlette-v1-candidate-survey.md` 的 STR-07、selection bias、future leakage 段；
- `docs/adversarial-reviews/AR-2026-08-23-post-ds06-checkpoint.md`；
- `evaluation/starlette-v1/pilot/STR-08/` 与其 validator/test，作为短案七文件和泄漏边界参考；
- `evaluation/starlette-v1/checkpoint/STR-06/`、`str06-checkpoint.json`、validator/test，作为 checkpoint wrapper/hash/状态参考；
- `evaluation/starlette-v1/promotion/contamination-snapshot.json` 中 STR-07 登记项。

默认不读取原始需求归档、旧 aiohttp/HTTPX 数据、其他未路由 work order 或宿主仓库。

## 来源审计与增量边界

必须重新访问 GitHub 官方公开来源并逐项记录 database/node id、actor、`created_at`、`updated_at`、正文 SHA 或 canonical state SHA。至少审计：

- Issue #1008 的创建与相关 comments；
- PR #1010 的创建、唯一 commit、file list、maintainer comment、关闭且未合并状态；
- Issue 的设计说明、tracker close 与后续 workaround 讨论。

可变 Issue/PR body 只能把创建时可由 immutable title、initial commit、patch 或 timestamped timeline 证明的内容写进早期 summary；当前 body digest 只用于变化探测。PR 返回的 `merge_commit_sha` 不得被当成 merged patch：`merged_at:null` 才是本工单的行为边界。

每个保留事件必须增加新事实、约束、判断、状态、方案或验证结果。礼貌性回复、重复引用、未复现的旁支 TestClient 讨论、机器人/mention/subscription 噪声和只重复既有 workaround 的评论进入 `excluded_sources` 并写明理由。关闭 state 若只与同时间设计说明重复，不得为抬高 tier 重复计数；若保留，则必须说明其独立 tracker-state 信息。

## 时间切片与防泄漏

按每个已审计增量生成 `T1…Tn`；每个 `available_event_ids` 必须是严格真实前缀。Current Task 只能问当时最合理的诊断、API 边界、已否决方向、替代方案或下一步，尤其不得直接复述未来答案：

- “general regex 从未是受支持 API”；
- 使用 `/{parameter_name:path}`；
- 同时声明两个 route；
- 依赖 307 redirect；
- #1010 最终未合并/关闭。

Issue/PR 当前 badge、后续设计说明、workaround 成功反馈与终局状态不得反写进较早切片。

## Gold、Oracle 与 Outcome 边界

- Fact Gold 每项必须有当前前缀内 provenance，并在判断被后续证据修正时使用 `superseded_at_event_id`；
- 必须区分“0.13.5 行为变化”“依赖未承诺 regex 实现细节”“redirect 对 CORS/额外 round-trip 的限制”“可用 workaround”与“是否应 revert/发版说明”的不同状态；
- PR #1010 的 patch/test 是被提出但未合并的替代方案，不能写成 delivered 或 repository-accepted fix；
- Oracle-State 不得把 issue close 投影成语义 `RESOLVED`，若后续仍有 redirect/API 争议，应保留相应 open/deferred 状态；
- Decision Reference 只记录真实后续动作，答案不唯一；
- Outcome Anchor 可以登记 PR #1010 closed-unmerged、维护者设计决定与可验证 workaround，但必须明确没有合并 patch，不得伪造 regression test 已进入仓库。

## 交付物

- `evaluation/starlette-v1/checkpoint/STR-07/` 七文件；
- `evaluation/starlette-v1/str07-checkpoint.json`；
- `evaluation/starlette-v1/str07-checkpoint-hashes.json`；
- `evaluation/starlette-v1/validate-str07-checkpoint.mjs`；
- `test/starlette-str07-checkpoint.test.ts`；
- `docs/evaluation/starlette-v1-str07-checkpoint.md`；
- `docs/handoffs/WO-DS-07-starlette-str07-source-gold-checkpoint.md`。

同步更新 `evaluation/starlette-v1/README.md`、本工单、`docs/PROJECT_STATE.md`、`docs/ROADMAP.md`，但在 QA PASS 前只能写待验收状态。

## 验证与独立 QA

Builder 至少执行：checkpoint validator、聚焦反例、真实 `parseEvaluationSuiteV2` 静态解析所有 slice、`npm test`、`npm run test:protocol`、`npm run build`、`git diff --check`、受保护范围 diff 与真实 `npm pack --dry-run --json` 隔离。

聚焦反例至少覆盖：

- tier 少计、cutoff/status/授权位变化；
- PR #1010 closed-unmerged 被伪写成 merged/delivered；
- Issue close 被伪写为已解决所有 trailing-slash/CORS 争议；
- future Gold/Outcome/workaround 同义复述进入早期 Current Task；
- 当前 PR body 的后编辑信息反写创建事件；
- 内容、hash path/order、漏项、重复、unknown field、symlink、snapshot 漂移；
- 投影夹带 source/Gold/Oracle/Decision/Outcome 非输入字段。

实现者提交 handoff 但不得批准自己。新的独立 Data QA 必须固定 Builder candidate 与父提交，从头访问登记 source、重算信息增量/tier、检查 Gold/Oracle/Outcome 语义与 future leakage，并运行全部本地检查。FAIL 只提交 QA 报告并返回 append-only 修复；PASS 也只接受 checkpoint/schema gate。

## 明确不做

- 不把 STR-06/07 加入 promotion collection，不制作 STR-01；
- 不创建 Probe、answer rubric、Critical Miss 评分或 runner；
- 不运行 D0/D1/D2、远端 GPT-5.6、aggregate 或 PASS rate；
- 不修改 evaluator、retrieval、assembler、Context Compiler core、provider、host、MCP 或依赖；
- 不因 0 medium 事后换案、拆链、漏计或调 D2 policy。

## 验收边界

只有独立 QA PASS，STR-07 source/Gold checkpoint 才接受。PASS 仍不表示该案 promoted/frozen、六案完整、Probe/answer rubric 就绪、`evaluation_ready` 或可运行模型；下一步只能由新工单制作 STR-01，之后再考虑一次性 promotion STR-06/07/01。
