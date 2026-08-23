# Starlette v1 六案 canonical-data promotion candidate

日期：2026-08-23

结论：**DS-09 Builder candidate 已形成，等待新的独立 Data QA。当前只是一份 `promotion_candidate_not_frozen` 的 canonical-data freeze candidate，不是正式 freeze、evaluation ready 或 D2 效果证据。**

## 先验证，再复制

在写入新 promotion 副本前，`six-case-preflight.ts` 使用 DS-05 已接受三案与 DS-06/07/08 checkpoint 组成内存全集。真实 `parseEvaluationSuiteV2` 接受固定六案、75 个 slice、588 个 projected history turn；没有调用 `runEvaluationSuiteV2`、回答模型或 effect metric。

这个 fail-fast gate 证明现有案例在统一 layout 前已经形状兼容；若它失败，本工单不会通过复制、rehash 或改 collection 掩盖 wiring 问题。

## 固定 accepted source

| case | tier | slices | projected turns | accepted path | 固定 candidate |
| --- | --- | ---: | ---: | --- | --- |
| STR-07 | long | 10 | 55 | `checkpoint/STR-07` | `8f51bf4f9308d124ace63c5c8ca755373105c71f` |
| STR-08 | short | 4 | 10 | `pilot/STR-08` | `32600eb6b7caf3fbe339e1103d3293f0b7e33103` |
| STR-05 | long | 9 | 45 | `pilot/STR-05` | `32600eb6b7caf3fbe339e1103d3293f0b7e33103` |
| STR-06 | long | 16 | 136 | `checkpoint/STR-06` | `f4931ad35cc7e4a844bb40ceb397aaf07842616d` |
| STR-01 | long | 18 | 171 | `checkpoint/STR-01` | `454565b863cf7e9470e7ac8079febf2a5c0d42d9` |
| STR-04 | long | 18 | 171 | `canary/STR-04` | `32600eb6b7caf3fbe339e1103d3293f0b7e33103` |

六案 source path 相对各自固定 Git candidate 均无 diff。promotion 共 42 个七文件副本，逐文件 SHA-256 与 accepted source 完全相同；`promotion-diff.json` 不允许其他 change class。

validator 的 42 项 accepted-source 合同位于代码常量，不来自可与 fixture 一起重写的 JSON。测试分别复刻旧 pilot 和三个 checkpoint 的协调改写：即使同步重建 accepted hash、promotion copy、diff、collection 引用与 promotion hash，仍必须在固定 source contract 处失败。任何语义 byte change 都要退回单案 Data QA。

## Collection 与可解释性边界

- canonical case 顺序：STR-07、STR-08、STR-05、STR-06、STR-01、STR-04；
- `promoted_case_ids` 为完整六案，`remaining_case_ids` 为空；
- case 分层：1 short / 0 medium / 5 long；
- slice 分层：4 short / 0 medium / 71 long；
- medium：`not_represented_not_evaluable`；
- 禁止 tier-balanced 结论；未来 pooled aggregate 也只能是描述性附加项；
- `evaluation_ready:false`、`model_run_authorized:false`。

75 个 slice 中 94.7% 来自 long 案例。这不阻塞预注册数据的字节固定，但会阻止把未来结果外推到 medium 或一般 Starlette 任务，也不能让 slice-weighted aggregate 掩盖唯一 short 案例的退化。

## 污染 snapshot 与来源 ledger

`contamination-snapshot-freeze-candidate.json` 引用并保留 DS-05 snapshot 的 path/SHA，扫描时间与固定 evidence cutoff 分离。本次四组公开 web-index 精确路径查询没有产生符合既定规则的 confirmed hit；GitHub code-search API/UI 在当前工具中不可用，索引还产生无关数字碰撞，因此 `no_public_hit_found` 不是 absence proof。STR-04 的 RAGAS context-only 排除仍保留，首次模型调用前必须追加 eligibility rescan。

`source-acceptance-ledger.json` 明确设置 `live_source_reaudit_performed:false`。它只登记已独立接受的 candidate、QA 报告、事件/slice/file 数，不把继承证据伪装为本轮 75-source live audit。

## 未授权事项

本工单没有 Probe、Fact-Gold adapter、答案 rubric、critical-miss judge、模型 provider 或运行结果；没有修改 `src/`、evaluator/retrieval/assembler policy、MCP、宿主或依赖。独立 QA 接受后也仍不得称正式 frozen/evaluation ready，不得运行 D0/D1/D2 或远端模型。
