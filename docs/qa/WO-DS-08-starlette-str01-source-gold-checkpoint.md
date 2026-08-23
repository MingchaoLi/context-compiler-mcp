# WO-DS-08 独立 Data QA — Starlette STR-01 source/Gold checkpoint

日期：2026-08-23

结论：**PASS — STR-01 checkpoint/schema gate accepted**

本 QA 固定审计候选 `454565b863cf7e9470e7ac8079febf2a5c0d42d9`，父提交为
`4ad8b49c2aabc1d29884a7df36f12f64c859615e`。开始与结束时工作树均 clean；候选相对父提交仅含 DS-08 的数据、校验器、聚焦测试和文档，不含 core、provider、host、MCP、UI、模型或依赖改动。

## 独立来源复核

使用 GitHub 官方 REST API、Issue 页面、PR commits/files 与 timeline 重新核对全部 18 个登记来源。15 条带正文来源的 `database_id`、`node_id`、actor、创建/更新时间、commit 关联和当前正文 SHA-256 均与 `events.json`/validator 的 source contract 一致；三条 state event 的 canonical JSON SHA 也一致：

| 范围 | 已复核的关键事实 |
| --- | --- |
| Issue #495（E1、E2、E5–E7、E13、E18） | E1 的公开页面仍展示 middleware/endpoint 两次 `request.form()` 后阻塞的最小复现；可见 timeline 的 100 条记录没有 `edited` event。当前 Issue body SHA 仅作为变化探测，不把 close 时 `updated_at` 当创建正文时间。E2、E5–E7、E13 的正文 SHA 和时间逐项匹配；E18 close 的 canonical SHA 为 `34d027…823ed`。 |
| PR #500（E3、E4） | REST 显示 `created_at=2019-05-02T18:15:50Z`、`closed_at=2019-05-20T14:15:53Z`、`merged_at:null`。commit 序列准确为初始 `d388e06…`（tree `c40d110…`）和最终 head `22ee2d4…`（tree `33b857…`）；仅改 `starlette/requests.py` 与 `tests/test_requests.py`。因此 API 的 `merge_commit_sha` 没有被作为 delivered 证据。E4 的 punt 与 E5 的不可逆 streaming 约束是不同来源、不同新增信息。 |
| PR #1692（E8–E17） | 当前 PR body SHA、标题及 2023 force-push 后的 commit list 与登记值一致，但 E8 摘要只记录“候选打开”，没有回填它们。timeline 复核到两次 rename：`7329869865`（`buffer request stream…` → downstream ASGI apps）和 E10 `7329871772`（→ `call_next in BaseHTTPMiddleware`，canonical SHA `c995a1…f4f1`）。E14 review `1184692481` 的 original commit 为 `ec382274…`，而非最终 head；E16 approval 指向 `68efb83…`。最终 four-file diff、final head `68efb83…`（tree `44e267…`）及 merge commit `554b9e21…`（相同 tree）均匹配。E17 canonical SHA 为 `0f6d16…977e`。 |

E9–E15 的 comment/review 内容分别支持 downstream receive/disconnect TODO、narrow boundary、endpoint/exception-handler non-goal、行为矩阵、持续 hang、multi-chunk review counterexample 与 rework/test 报告。E16、E17、E18 的顺序为 approval、merge、Issue close（间隔两秒），没有合并成一个“已解决”事件。

GitHub 网页/API 当前可用；没有遇到 rate limit。Issue/PR 正文仍可能在 GitHub 外部被历史重写，故本 QA 不把“当前正文可见”误报为绝对历史不变性证明：早期 E8 继续只用其可审计的创建事实，E1 的最小复现同时由公开 Issue 页面和无 `edited` 的可见 timeline 支撑。

## 数据、时间与泄漏审计

- 18 条 retained event 都有独立的诊断、约束、候选、状态或验证增量；尤其 E4/E5、E8/E9/E10、E16/E17/E18 分别保留。机械重算为 18 increments，因此 tier 正确为 `long`。
- T1–T18 的 `available_event_ids` 是严格真实前缀；18 个 Gold slice 和 18 个 Oracle slice 的全部 provenance/source refs 均在对应前缀内。投影总数为 `1+…+18=171`。
- 人工逐条复读 18 个 Current Task：没有把 #500 未合并、#1692 的最终 `call_next` 实现、multi-chunk 修正、approval、merge SHA 或 tracker close 提前当作已知答案。E10 后才讨论 narrow boundary；E11/E12 后才讨论明确 non-goal；E14 后才提出 multi-chunk；E15 后才讨论 rework。
- Fact Gold、Oracle、Decision Reference 与 Outcome Anchor 物理分离。最终 Oracle 仅在 E17 后将 narrow goal 标为 `COMPLETED`，继续保持 streamed-body 和 endpoint-first/exception-handler 限制；E18 只改变 tracker 语义。没有 `resolved_issue` Fact，也没有把 #500 test、approval 或 Issue close 写成 repository delivery/通用 replay。
- `projectModelInput` 的每个 history turn 仅含 `id`、`role`、`event_type`、`occurred_at`、`actor`、`summary` 六字段；真实 `parseEvaluationSuiteV2` 静态解析 18/18 slices。没有调用 runner 或任何模型。

## 对抗检查

- checkpoint hash、内容、path/order、漏项、重复、unknown field、symlink、status、tier、increment、snapshot 漂移与 canonical state 的反例均由 validator/聚焦测试拒绝；八项 hash 和已接受 contamination snapshot SHA `02361a…27eb1` 重建一致。
- `no_public_hit_found` 保持 DS-05 的限定 as-of 结论，没有扩大为 absence proof，也没有改写扫描规则或 snapshot。
- 向 early Current Task 插入 Unicode/zero-width 版未来 Fact Gold，及零宽版 “formally approved”，均被 NFKC/control-character 规范化后的检查拒绝。
- 将“项目已接受并发布有限的 BaseHTTPMiddleware downstream-replay 行为”这一语义同义句插入 T1，并在临时副本重算 hash 后，静态 validator 会接受。`evaluation/starlette-v1/README.md` 已明确其不能机械判定语义同义；本 QA 因此人工复读所有实际 task，而不是把该 checker 当作语义证明。该已知自动化盲区记为 P2，不构成当前 clean payload 的 future-leak finding。

## 验证结果

```text
node evaluation/starlette-v1/validate-str01-checkpoint.mjs evaluation/starlette-v1  PASS
npx vitest run test/starlette-str01-checkpoint.test.ts                              13/13 PASS
npm test                                                                            17 files, 333/333 PASS
npm run test:protocol                                                               8/8 PASS
npm run build                                                                       PASS
git diff --check                                                                    PASS
npm pack --dry-run --json（隔离 cache）                                             50 files, sha f20e56e75c6b6aa9d7362627101771a6c2ca4510
```

打包清单不含 `evaluation/`、`docs/` 或 `test/`。结束时再次确认工作树 clean。

## 缺陷分级与接受边界

- P0：无。
- P1：无。
- P2：静态 lexical/normalized guard 不能等价于语义同义泄漏判定；当前 README 已披露，且本次人工任务审计未发现泄漏。若未来希望把该风险降级，需新的有界工单设计可复现的人工/语义审计合同，不能在本 checkpoint 中暗改输入或扩张模型授权。

此次通过**只**接受 STR-01 的 source/Gold checkpoint/schema gate。它仍是 `checkpoint_not_frozen` / case `canary_not_frozen`，且 `promotion_authorized:false`、`evaluation_ready:false`、`model_run_authorized:false`。没有 promotion/freeze，没有 Probe、D0/D1/D2、远端模型、aggregate 或 PASS rate 授权；后续只能另开一次性 STR-06/07/01 promotion 工单，并在关键节点申请独立对抗审查。
