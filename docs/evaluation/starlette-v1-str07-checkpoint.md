# Starlette v1 STR-07 source/Gold checkpoint

日期：2026-08-23

状态：**IMPLEMENTED — PENDING NEW INDEPENDENT DATA QA**

本报告只记录 STR-07 的公开来源、事件增量、时间切片与 Gold/Oracle 上界。没有 promotion/freeze，没有 Probe、D0/D1/D2、远端模型、aggregate 或 Context Compiler policy 修改。

## 结论

Survey 预计 STR-07 约 4 个节点/short；逐条审计后必须保留 10 个真实信息增量，因此机械分层为 **long**。这些增量不能安全压成 4 个：未合并 patch、maintainer rejection、`/.*` 的第二类受影响用例、公开 API 边界、redirect/CORS 约束、revert 再考虑、wildcard workaround 验证和 dual-route workaround 分别改变了当时合理的判断。

这使已审计预注册子集的实际分布变为 1 short / 0 medium / 4 long。该分布是 selection-bias 限制，不是换案、拆链或漏计的授权。

## 来源台账

| Event | 时间 | 官方来源 | 新增信息 |
|---|---|---|---|
| E1 | 2020-07-23 16:55:59Z | Issue #1008 | 升级后 `/?` 不再同时服务空/root slash，返回 404 |
| E2 | 2020-07-24 16:09:35Z | comment 663614196 | 将变化定位到 0.13.5 的 path regex metacharacter escaping |
| E3 | 2020-07-25 16:11:00Z | PR #1010 / commit `503e9593…` | 提议 special-case 末尾 `?`，并在未合并 patch 内加入两种 slash 测试 |
| E4 | 2020-07-27 07:55:26Z | PR comment 664182957 | 维护者否决 optional regex 方向，建议 canonical route + redirect |
| E5 | 2020-07-27 18:48:24Z | comment 664573918 | `/.*` SPA wildcard 也受影响，证明范围不只 root slash |
| E6 | 2020-07-28 08:46:28Z | comment 664875431 | 明确公开 API 是 URI templating，不支持 general regex；给出 path converter/redirect |
| E7 | 2020-07-28 10:55:54Z | comment 664972962 | 307 对 root 用例不等价：可能丢 CORS header，并涉及 breaking/version/docs |
| E8 | 2020-07-28 11:44:32Z | comment 664992297 | 维护者承认 revert 后以更大版本和文档重发值得考虑，但未承诺执行 |
| E9 | 2020-07-28 16:50:20Z | comment 665152933 | SPA 报告者确认 path-converter 方案有效 |
| E10 | 2020-07-31 08:16:35Z | comment 666997766 | 提供显式注册 slash/no-slash 两个 route 的无 redirect workaround |

10 条 source 的 database/node id、actor、created/updated time 与正文 SHA-256 已按 GitHub 官方 REST 核对。Issue 当前 body hash 仅作为变化探测；E1 summary 只采用创建时可证实的原始报告。PR 当前 body/`updated_at` 同样只作变化探测；E3 的 patch/test 结论来自创建前已存在的 initial commit 与官方 PR file list。

PR #1010 的 REST 边界为：`closed_at=2020-07-27T07:55:29Z`、`merged_at=null`。它只含 `starlette/routing.py` 与 `tests/test_routing.py` 的未合并改动。API 返回的 `merge_commit_sha=a331feb9…` 不是 merged 证据，不进入 event source 或 delivered Gold。

## 排除项

- comment 664868573 只重复 Issue 与 PR 的关系；
- comment 664980668 重复 undocumented regex，并主要是沟通语气；
- comment 664990984 的 revert/version/docs 提议已被紧随其后的 included maintainer response 引用，后者才改变 decision state；
- comment 664996905 只增加旧 workaround 的外部 provenance 并重复 docs 诉求；
- 666411308–666455277 的 TestClient 分支包含误读和复现修正，没有形成 durable STR-07 决策；
- comment 701141122、PR comment 717292974 均在登记窗口后重复 workaround 或回到被拒绝的 regex 实现面；
- mentions、subscriptions、cross-references、head-ref deletion 为关系/通知噪声。

Issue close 与 E6 同秒，但普通 REST/timeline 没有提供可独立固定的 close-event canonical resource；因此不把 tracker close 再复制成一个 input increment。它只作为 Outcome Anchor，避免为抬高 tier 重复计数。

## Gold、Oracle 与 Outcome 上界

- PR #1010 是已提出后被否决、且最终未合并的方案；其 patch 内测试不是 repository-delivered regression test；
- E6 确定 general regex 不属于 Route/Mount path-string API，但不等于所有依赖旧行为的用例已经解决；
- E7 使 redirect 方案获得新的 CORS/round-trip 限制；
- E8 只把 revert/release/docs 重新变为 open question，未产生新 patch 或承诺；
- E9 只验证 wildcard SPA 的 path-converter workaround；
- E10 的 dual-route 方案可解决 operational root-path 问题，因此最终 Oracle 只把该问题标 `RESOLVED`，并由显式 workaround `RESOLVED_BY`；release/docs 问题保持 `DEFERRED`。

Fact Gold 不使用 `resolved_issue`。两个 Outcome Anchor 分别登记 PR closed-unmerged 与 Issue tracker close/design resolution，均明确没有 merged patch/test，Issue close 也不证明所有 redirect/CORS 用例解决。

## 防 future leakage

10 个 task 都只使用严格前缀。除通用 Gold/Outcome/Decision 规范化检查外，checkpoint validator 额外拒绝：

- E6 前出现 URI templating、path converter 或“general regex 不受支持”的答案；
- E7 前出现 CORS；
- E8 前出现 revert；
- E10 前出现 dual-route/同时注册两个 route；
- 任意 Current Task 出现 closed-unmerged、`merged_at:null` 或未合并测试未进入仓库的 Outcome 答案。

模型输入仍只有 `events.json`、`tasks.json` 的六字段历史投影与 Current Task。Gold、Oracle、Decision、Outcome、source metadata 和 hash 不进入输入。

## 机械校验

- wrapper：`checkpoint_not_frozen`；case：`canary_not_frozen`；
- 10 events / 10 increments / 10 slices / 55 projected turns；
- 10 source contracts、2 Outcome Anchors、8 项 checkpoint hash；
- 聚焦测试覆盖 tier、来源、未合并 PR、tracker close、同义 future answer、投影隔离、hash/path/order/status/snapshot/symlink；
- 真实 evaluator v2 parser 静态接受全部 10 slices；只调用 parser，模型调用数与 evaluation run 数均为 0。

当前 hash 只固定待 QA candidate，不是不可协调重写的 accepted-source 外部合同。只有新的独立 Data QA 固定 Git candidate、重访 10 个来源并 PASS 后，checkpoint/schema gate 才可接受；PASS 后仍不得 promotion/freeze 或运行模型。
