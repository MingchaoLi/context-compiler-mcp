# Starlette v1 STR-06 source/Gold checkpoint 报告

日期：2026-08-23

结论：**Builder 已完成 DS-06 candidate，等待新的独立 Data QA；STR-06 经真实信息增量审计为 long，不是 survey 预计的 medium。** 当前交付只是 `checkpoint_not_frozen`，没有进入 promotion collection，也没有授权 freeze、Probe、D0/D1/D2 或远端模型。

## 固定边界

- case：STR-06；主来源为 Issue #1365、PR #1366 与 PR #1410；
- 共同 `evidence_cutoff_at`：`2026-08-23T03:00:00Z`；
- contamination：只引用 DS-05 已接受的 `promotion/contamination-snapshot.json`，SHA-256 为 `02361a573d0bcab37c0e617ddc4e5feb0cb44b93174d6ea029ae94c622527eb1`；没有重扫或覆盖该 snapshot；
- checkpoint 沿用七文件 schema，只有 `events.json` 与 `tasks.json` 可进入模型输入；Gold、人工 Oracle-State、Decision Reference 与 Outcome Anchor 继续物理隔离；
- 没有修改 DS-05 promotion、旧 pilot/canary/hash、`src/`、evaluator、provider、MCP 或 package runtime。

## Source ledger 与信息增量

公开 GitHub 主来源形成一个连续 lineage。保留 16 个事件，逐项均改变事实、约束、判断、tracker 状态、方案或验证状态；因此机械规则得到 `16 >= 9 → long`。

| Event | 时间 | 来源 | 新增信息 |
|---|---|---|---|
| E1 | 2021-12-14 22:20:55Z | Issue #1365 | RHEL 8 FIPS、Python 3.8.8、Starlette 0.16.0 的 FileResponse ETag MD5 `ValueError` 与调用路径 |
| E2 | 2021-12-14 23:19:25Z | comment 994130888 | 先审 Django-style `usedforsecurity` 兼容；算法替换另行讨论 |
| E3 | 2021-12-15 07:15:31Z | comment 994408439 | 质疑 ETag 必须使用安全 hash 的前提 |
| E4 | 2021-12-15 11:46:36Z | comment 994713435 | 报告者撤回安全 hash 要求，转向 wrapper/monkey patch |
| E5 | 2021-12-15 12:51:28Z | comment 994762247 | 明确提出 `usedforsecurity=False`，同时留下 3.9+ 初始假设 |
| E6 | 2021-12-15 15:50:58Z | PR #1366 | 第一版 compatibility helper 实现进入 review；初始 patch 无 test file |
| E7 | 2021-12-17 12:37:33Z | closed event 5784383679 | #1366 merge 后 tracker 关闭；只证明 repository/tracker acceptance |
| E8 | 2021-12-17 15:46:32Z | comment 996824650 | RHEL backport 反驳简单 3.9+ 边界；跨版本仍不确定 |
| E9 | 2021-12-17 15:53:09Z | comment 996829182 | 维护者要求 Python 3.6/master 实测，不接受纯推断 |
| E10 | 2022-01-11 13:16:25Z | comment 1009954811 | 客户暂时关闭 FIPS，验证仍无法完成 |
| E11 | 2022-01-13 22:22:24Z | comment 1012564053 | 真实 FIPS 运行推翻首次 closure：能力探针的 `usedforsecurity=True` 自身触发 `ValueError` |
| E12 | 2022-01-13 22:26:10Z | comment 1012568198 | 第一 PR 作者确认 probe bug，并决定提交小修 |
| E13 | 2022-01-13 22:26:11Z | reopened event 5890858859 | Issue 因首次方向失败重开 |
| E14 | 2022-01-13 22:27:18Z | PR #1410 | 第二版把 probe 改为 `usedforsecurity=False`；patch 仅改 `_compat.py`、无 repo test |
| E15 | 2022-01-13 22:50:40Z | comment 1012588046 | 报告者确认一个改过 probe 的 commit 在一个 FIPS 系统工作，但因 FastAPI 限制未测 current master |
| E16 | 2022-01-14 09:40:19Z | closed event 5893584617 | #1410 merge 后 tracker 再关闭；仍不等于跨环境行为证明 |

三个 state event 使用 `{id,node_id,event,actor,created_at,commit_id}` canonical subset 计算 SHA-256；close/reopen/close 的 commit id 分别为 `0aef1724...`、`null`、`7d79ad96...`。评论正文保留独立时间与内容 hash；Issue/PR body 的当前 hash 只用于变化探测，creation summary 限制在创建时 title、初始 commit 与当时可见 patch。

## 排除与歧义处置

- comment 994127553 与 E2 都是初始方案调查，保留更直接记录 review boundary 的 E2；
- comment 996696543 只公布 Starlette 0.18.0，不改变兼容性判断或验证状态；
- comment 996774859 重复 E5 的 3.9+ 说法，保留其后的反证 E8；
- PR #1366 comment 996705216 的 “Worked perfectly” 发生在作者获得 merge 权限后，未说明 FIPS 测试；将它当行为成功会制造假 Gold，因此明确排除；
- 两个 cross-reference 已由直接 PR creation event 覆盖。

Survey 把 STR-06 概括为约 7 个节点/medium，并写成“#1366 用 `usedforsecurity=False` 修复”。代码级核验表明最终第一 patch 的实际 ETag 调用会传 False，但 capability probe 使用 True；后者正是后续真实失败点。若压缩掉 E8–E12 的能力边界、验证请求、验证阻塞和真实失败，就会把一个关键推理反转误降为 medium。因此本 checkpoint 不沿用 survey 分层。

## Gold、Oracle 与 Outcome 上界

Fact Gold 分离了：原始异常、ETag 非安全证明、wrapper 决策、repo/tracker acceptance、RHEL backport 约束、首次验证缺口、真实失败、被否决的 merge→verified 推理、第二 probe 决策、有限单环境成功与最终残余不确定性。首次 close fact 在 reopen 时 supersede；第二 close 仍为 `outcome_status`，没有任何 `resolved_issue` Gold。

人工 Oracle-State 在 T7 首次关闭时把行为问题标为 `DEFERRED`，不标 `RESOLVED`；T11 只把“第一 wrapper 是否有效”这个问题以负面证据解决，并拒绝把第一 merge 当行为证明；T16 再次把 tracker/repository acceptance 与 current-master、跨环境 FIPS 未验证分开。

Outcome Anchor 只登记两个 merge commit。两者均明确：

- PR file list 没有 repository regression test；
- Builder 与 QA 没有本地重放 FIPS 环境；
- E15 只支持一个改过 probe 的 commit、一个 FIPS 系统；
- merge 或 close 不能证明所有 Python/OpenSSL/FIPS 组合成功。

## Future leakage 与输入投影

每个 Ti 的 `available_event_ids` 是 E1 到 Ei 的严格前缀；16 个 Current Task 都只询问当时的诊断、约束、验证或下一步，没有后写入 #1410、merge SHA、Gold/Outcome 答案。基础 schema validator 继续拒绝未来 Gold、Outcome 内容/标识与未来 Decision Reference 的规范化复述，并移除 Unicode format/control 绕过。

`projectModelInput` 对 16 个 slice 共投影 136 个 history turn；每个 turn 只有 `id`、`role`、`event_type`、`occurred_at`、`actor`、`summary` 六字段。source id/node/hash、Gold、Oracle、Decision 与 Outcome 不进入输入。语义同义泄漏仍不能只靠字符串 validator 证明，必须由独立 Data QA 人工攻击。

## Hash、污染与选择偏差

`str06-checkpoint-hashes.json` 覆盖 wrapper 与七文件，固定待验 candidate 的内容、路径和顺序；它不是外部 accepted anchor。独立 QA PASS 后若另行 promotion，后续 validator 必须把 QA 接受提交中的七文件 SHA 固定在代码合同中，不能依赖可与数据一起重写的 JSON hash。

沿用的 contamination snapshot 对 STR-06 是有限 `no_public_hit_found`，不是 absence proof。GitHub code search 的认证限制仍存在；本工单没有把普通兼容性引用计为 benchmark reuse，也没有重挑案例。

STR-06 从 medium 更正为 long 会使当前正式注册的预计分布进一步偏长。该 finding 不阻止本 checkpoint，但阻止把旧 2 short / 1 medium / 3 long 预计当实际分层或直接做无分层 aggregate；剩余 STR-07/01 仍须按同一机械规则制作，不能为了补 medium 配额删减 STR-06 增量或换案。

## Builder 验证

- checkpoint validator：16 events / 16 increments / 16 slices / 136 projected turns / 3 canonical states / 2 Outcome Anchors；
- 聚焦反例覆盖 tier 降级、cutoff/status/授权、snapshot、内容/path/order/漏项/重复/unknown/symlink、merge→verified、close→resolved、未来 Gold/Outcome 与伪造 regression test；
- 完整单元、协议、build、真实 pack 与范围 diff 在 Builder handoff 中记录；
- 未调用 evaluator runner、D0/D1/D2、provider、远端模型或任何 host。

只有新的独立 Data QA 固定 Builder candidate、重新访问 16 个 source 并攻击语义边界后，DS-06 checkpoint 才能接受。PASS 仍不表示 STR-06 promoted/frozen 或模型运行获授权。
