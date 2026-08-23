# Starlette v1 STR-01 source/Gold checkpoint

日期：2026-08-23

状态：**IMPLEMENTED — PENDING NEW INDEPENDENT DATA QA**

本报告只记录 STR-01 的公开来源、事件增量、时间切片与 Gold/Oracle 上界。没有 promotion/freeze，没有 Probe、D0/D1/D2、远端模型、aggregate 或 Context Compiler policy 修改。

## 结论

Survey 预计 STR-01 约 10 个节点/long；逐项审计后保留 18 个真实信息增量，机械分层仍为 **long**。不能把以下状态合并成一个节点：早期 ownership 诊断、PR #500 提案、maintainer punt、不可逆 streaming 约束、body/form 路径差异、receive queue hang、PR #1692 新候选、下游 receive/disconnect TODO、标题窄化、明确非目标、窄方案价值争议、四年后仍无错误挂起、multi-chunk 反例、修正/补测、approval、merge 和 tracker close。

当前已审计预注册子集的实际分布因此变为 1 short / 0 medium / 5 long。该分布和 STR-01/02 的 `BaseHTTPMiddleware` 组件相关性必须在最终报告披露，不能倒逼删事件、拆 lineage 或换案例。

## 来源台账

| Event | 时间 | 官方来源 | 新增信息 |
|---|---|---|---|
| E1 | 2019-04-30 02:19:41Z | Issue #495 | middleware 与 endpoint 两次 `request.form()` 后请求阻塞 |
| E2 | 2019-05-01 03:55:29Z | comment 488205460 | middleware/routing 使用不同 `Request` 路径，共享 receive；要求回归测试 |
| E3 | 2019-05-02 18:15:50Z | PR #500 / commit `d388e06d…` | body 写入 ASGI scope，新建 `Request` 重读；patch 内一项测试 |
| E4 | 2019-05-20 14:15:53Z | PR comment 494006150 | 因 streaming 行为未定义而 punt；PR 同时 closed-unmerged |
| E5 | 2019-05-20 14:20:46Z | comment 494008175 | streamed data 可能不可逆消费，middleware body read 应尽量避免 |
| E6 | 2021-07-26 17:08:46Z | comment 886876930 | `body()/json()` cache 与 `form()` underlying stream 的行为不同 |
| E7 | 2022-04-18 13:19:37Z | comment 1101403203 | receive 是队列；middleware 消耗后下游等待空队列而 hang |
| E8 | 2022-06-15 03:13:28Z | PR #1692 creation | 新候选打开；不把当前 body/title/commit list 回填成创建时实现 |
| E9 | 2022-09-04 18:44:02Z | PR comment 1236394572 | 必须保留下游 receive replacement；相关测试和 disconnect 仍为 TODO |
| E10 | 2022-09-06 12:16:46Z | rename event 7329871772 | 标题从 downstream ASGI apps 窄化到 `BaseHTTPMiddleware.call_next` |
| E11 | 2022-10-03 14:19:41Z | PR comment 1265515733 | 明确不解决 endpoint-first、middleware-after 或 exception-handler reread |
| E12 | 2022-10-04 05:03:33Z | PR comment 1266401636 | before/after matrix：只改善 middleware-first → endpoint，是否值得合并仍未决 |
| E13 | 2023-04-25 20:15:26Z | comment 1522359931 | 四年后仍为无错误 hang；HMAC 可接受 buffering tradeoff，但 hack 非生产方案 |
| E14 | 2023-05-04 08:19:59Z | review comment 1184692481 / original commit `ec382274…` | `more_body`/multi-chunk 无测试，当前 state machine 可能过早标 consumed |
| E15 | 2023-05-04 17:31:47Z | PR comment 1535152681 | 作者确认真实 bug，报告 rework 并新增大量测试；确切最终逻辑留给 merge patch 锚定 |
| E16 | 2023-06-01 18:52:32Z | review 1456104075 / head `68efb83c…` | 维护者正式 approval |
| E17 | 2023-06-01 18:57:28Z | merge event 9406862296 | merge commit `554b9e21…`，patch 与回归测试进入仓库 |
| E18 | 2023-06-01 18:57:30Z | Issue close event 9406862724 | #495 tracker 在 merge 后两秒关闭，不扩张到所有 reread 顺序 |

18 条 source 的 database/node id、actor、created/updated time、正文 SHA-256、original review commit 或 canonical timeline SHA 已按 GitHub 官方 REST/timeline 核对。Issue #495 的官方页面 structured record 给出 `datePublished=2019-04-30T02:19:41Z`、相同 bodyVersion，且没有 content-edit record；即便如此，紧随其后的评论仍作为 ownership 诊断的独立锚点。E10/E17/E18 分别使用固定 JSON 子集生成 SHA；伪造 rename、merge SHA 或 null-commit close 会被 validator 拒绝。

## 两个 PR 的行为边界

PR #500：

- `created_at=2019-05-02T18:15:50Z`、`closed_at=2019-05-20T14:15:53Z`、`merged_at=null`；
- 两个 commit，最终 head `22ee2d4d…`；
- 只改 `starlette/requests.py` 与 `tests/test_requests.py`；
- 测试证明同 scope 的新 `Request` 可读取缓存 body，但没有定义 stream 已部分/全部消费时的 contract；
- REST 的 `merge_commit_sha=bf31568b…` 不是 merged/delivered 证据。

PR #1692：

- `created_at=2022-06-15T03:13:28Z`，2023 年发生多次 force-push；当前 commit list 不能倒灌到创建切片；
- 2022-09-06 两次 rename 后才得到最终 `call_next` 标题；
- 最终 head `68efb83c…`，approval 后 merge 为 `554b9e21…`；
- 最终改 `starlette/middleware/base.py`、`starlette/requests.py`、`tests/middleware/test_base.py`、`tests/test_requests.py`；
- `_CachedRequest` 在 middleware 调 `body()` 时把缓存 bytes 交给 downstream；middleware 已把 `stream()` 消费完时，下游只获 empty body，避免继续等待；
- `Request.stream()` 只有在 `more_body` 为 false 时才标 consumed；测试包含 interleaved multi-chunk、disconnect、downstream receive replacement 与多种 middleware/endpoint read order。

以上只证明 narrow call path。作者在 E11/E12 明确说明 endpoint-first 后 middleware/exception handler 再读仍不支持；merge/close 不撤销该限制。

## Gold、Oracle 与 Outcome 上界

- PR #500 是已提出后被 punt 的 broad scope-cache alternative；其 test 不是 repository-delivered regression test；
- streamed-body 不可逆消费、body/form 行为差异和 receive queue exhaustion 都保留为 durable constraint；
- E8 只表示候选打开。E10 才确定 `call_next` 窄边界，E11/E12 才确定非目标；
- E14 的 multi-chunk question 在 E15 后可标 `RESOLVED`，同时把“stream 一启动就标 consumed”保留为 `REJECTED_ALTERNATIVE`；
- E16 只表示 review acceptance，不能提前把 repository delivery 标 `COMPLETED`；E17 后 narrow goal 才完成；
- E18 只增加 tracker state。最终 Oracle 仍保留 streaming 约束和 unsupported upstream reread，不能因 close 删除。

四个 Outcome Anchor 分别登记 PR #500 closed-unmerged、PR #1692 merged patch、final regression tests 与 Issue #495 close。Fact Gold 不使用 `resolved_issue`，避免把 tracker close 变成 universal semantic resolution。

## 防 future leakage

18 个 task 都只使用严格前缀。除共用 Gold/Outcome/Decision 规范化检查外，checkpoint validator 额外拒绝：

- E4 前出现 punt/closed-unmerged；
- E6 前出现 body/json 与 form/stream 的最终区分；
- E10 前出现最终 `call_next` 窄标题；
- E11 前出现 endpoint-first/exception-handler 非目标；
- E14 前出现 multi-chunk/`more_body` 反例；
- E15 前出现 bug 已修、`more_body=false` 后标 consumed；
- E16/E17/E18 前分别出现 approval、merge/delivered、Issue close；
- 任意早期 task 复述未来 Gold/Outcome 的原文或 Unicode 规范化变体。

模型输入仍只有 `events.json`、`tasks.json` 的六字段历史投影与 Current Task。source metadata、hash、Gold、Oracle、Decision 与 Outcome 不进入输入。

## 排除项与已知限制

- 早期提问 comment 488205151 被后续 source inspection 替代；
- 多个 logging/FastAPI route/response-body workaround 不改变 Starlette ownership contract；
- 将同一个 `Request` 存进 scope 的 2022 提议重复 PR #500 broad direction，且未 merge；
- PR #1692 的抽象“实现令人困惑”、review 催促和 ContextVar 分支不构成 STR-01 新增量；
- outcome 后的澄清和 GitHub timeline cross-reference 不进入轨迹。当前 timeline 含自动化工具产生的下游引用，本工单没有把它们当作“无污染”的更强证明，也没有重写 DS-05 已接受的 contamination v1 规则；若要扩大污染定义，必须另开工单统一重扫六案。

## 机械校验

- wrapper：`checkpoint_not_frozen`；case：`canary_not_frozen`；
- 18 events / 18 increments / 18 slices / 171 projected turns；
- 18 source contracts、3 个 canonical timeline hash、4 个 Outcome Anchor、8 项 checkpoint hash；
- 聚焦测试 13/13，覆盖 tier、来源、两个 PR 的 delivery 边界、non-goals、multi-chunk、同义 future answer、投影隔离、hash/path/order/status/snapshot/symlink；
- 真实 evaluator v2 parser 静态接受全部 18 slices；只调用 parser，模型调用与 evaluation run 均为 0。

当前 hash 只固定待 QA candidate，不是 accepted-source 外部合同。新的独立 Data QA 必须固定 Git candidate、重访 18 个来源并独立判断增量/tier/Gold/Oracle；PASS 后也仍不得 promotion/freeze 或运行模型。
