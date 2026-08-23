# WO-DS-09 独立 Data QA — Starlette 六案 canonical-data promotion candidate

日期：2026-08-23

结论：**PASS — 接受六案 canonical-data freeze candidate。** 本次接受固定 Builder candidate `4b974538d76d0e0d8a5ac17c5662533b714ef00e`，仅接受六案 canonical source data 的 promotion candidate；它仍是 `promotion_candidate_not_frozen`，**不是**正式 frozen、`evaluation_ready` 或模型运行授权。

## 固定边界与范围

- 起始 `main`/`HEAD` 精确为 `4b974538d76d0e0d8a5ac17c5662533b714ef00e`，父提交精确为 `f4f18b77a3bf55bc91d1958463bde2ed97aa1257`，开始工作树 clean；结束前再次确认 clean。
- 完整 `f4f18b77..4b974538` diff 为 37 个 DS-09 docs、`evaluation/starlette-v1/` promotion fixture/validator/preflight 与聚焦测试文件。`git diff --check` 通过。
- diff 未触及 `src/`、package/runtime/lockfile、MCP、provider、host/UI；未改任何 pilot/canary/checkpoint accepted payload 或 hash、旧 `promotion/contamination-snapshot.json`、旧 `source-reaudit.json` 或既有 QA 记录。新增的仅为 STR-07/08/05/06/01/04 的 promotion 副本、freeze-candidate snapshot 与 source-acceptance ledger 等工单允许内容。
- 未运行 `runEvaluationSuiteV2`、D0/D1/D2、Probe、回答模型、provider/network/credential/host/UI 或任何效果实验。新增 preflight 静态导入真实 `parseEvaluationSuiteV2`；没有可注入替代 parser 的参数。

## 固定 accepted-source 合同与 relocation

我没有信任当前 JSON 自举锚点，而是直接从固定 Git object 重建六案、七文件顺序和 SHA-256：

| case | 固定 Git candidate | accepted path | event/slice | files |
| --- | --- | --- | ---: | ---: |
| STR-07 | `8f51bf4f9308d124ace63c5c8ca755373105c71f` | `checkpoint/STR-07` | 10 / 10 | 7 |
| STR-08 | `32600eb6b7caf3fbe339e1103d3293f0b7e33103` | `pilot/STR-08` | 4 / 4 | 7 |
| STR-05 | `32600eb6b7caf3fbe339e1103d3293f0b7e33103` | `pilot/STR-05` | 9 / 9 | 7 |
| STR-06 | `f4931ad35cc7e4a844bb40ceb397aaf07842616d` | `checkpoint/STR-06` | 16 / 16 | 7 |
| STR-01 | `454565b863cf7e9470e7ac8079febf2a5c0d42d9` | `checkpoint/STR-01` | 18 / 18 | 7 |
| STR-04 | `32600eb6b7caf3fbe339e1103d3293f0b7e33103` | `canary/STR-04` | 18 / 18 | 7 |

- 固定 Git blob、当前 accepted source 与 `promotion/cases/` 三方逐字节相同：**42/42**；所有 source 与 promotion 文件均为普通文件，非 symlink。
- 独立重建的 `promotion-diff.json` 为 canonical 顺序的 **42** 项，所有 `old_path`/`new_path`/SHA 和 `byte_identical_relocation` 完全一致。
- 独立重建 `promotion-hashes.json` 的 **46** 项（collection、freeze snapshot、source ledger、diff、42 副本）完全一致。
- `source-acceptance-ledger.json` 固定正确 QA 路径和 candidate，明确 `live_source_reaudit_performed:false`；汇总精确为 6 cases / 75 source events / 75 slices / 42 files，六案 `semantic_payload_change_required:false`，总 semantic change 为 0。它没有把继承的单案 QA 冒称为本轮 75-source live re-audit。

## 对抗复验

在仓库内创建并清除的临时副本中，原样重放 DS-05 首轮协调重写，且分别攻击 STR-07、STR-06、STR-01：同步改 accepted `tasks.json` 与 promotion copy、相应 pilot/canary/checkpoint hash、完整 42 项 diff、collection 的 diff hash 引用和完整 46 项 promotion hash。STR-08、STR-07、STR-06、STR-01 四次均在代码内固定的 accepted-source contract 处拒绝（`accepted source differs from fixed ... contract`）。source ledger 无语义/计数变化，故不应重写。

另独立验证以下 14 类攻击均拒绝：漏项、重复项、路径、顺序、collection status、cutoff、tier、unknown field、accepted source candidate、`remaining_case_ids`、`evaluation_ready:true`、`model_run_authorized:true`、promotion hash 篡改、promotion symlink。该合同不依赖可随 fixture 一同改写的 hash manifest。

## Collection、preflight 与运行边界

- collection 的注册和 promotion 顺序均为 STR-07、STR-08、STR-05、STR-06、STR-01、STR-04，`remaining_case_ids: []`，共同 cutoff 保持 `2026-08-23T03:00:00Z`。
- tier 为 1 short / 0 medium / 5 long；slice 为 4 / 0 / 71。`medium_status` 是 `not_represented_not_evaluable`，tier-balanced claim 为 false，pooled aggregate 仅为 descriptive-only、未授权。
- 混合 accepted suite 与 promotion-only suite 由 wiring 逐字段 `deepStrictEqual` 比较，均为恰好 6 canonical cases、75 evaluator cases、588 projected history turns；slice id 全局唯一，session/namespace 对齐，slice 内 raw-event/source-event 唯一且 seq 连续。两种 suite 都由真实 evaluator v2 parser 静态 parse。
- validator 输出 `evaluation_run_count:0`、`model_call_count:0`、`effect_metrics_generated:false`；没有 runner、effect metric 或模型副作用。

## Freeze-candidate contamination snapshot

- 新 snapshot 的 prior path 固定为 `promotion/contamination-snapshot.json`，其 SHA-256 `02361a573d0bcab37c0e617ddc4e5feb0cb44b93174d6ea029ae94c622527eb1` 经本地重算一致；旧 snapshot 相对父提交未变。
- 规则文本/version 与 cutoff 均与旧 snapshot 完全一致。六案顺序和 source numbers 与 collection/ledger 一致；所有结果当前为 `no_public_hit_found` / `eligible_as_of_snapshot`，无 `confirmed`、无 direct evidence。validator 要求一旦 `confirmed` 必须有 direct evidence 且 eligibility 改为 `disclosed_not_blind_eligible`。
- STR-04 的 `Uniyalsumit/CT_PROJECT` RAGAS 条目仍是 `context_only_retrieval_noise`，并与旧 snapshot 的 exclusion 字节级相同；新 snapshot 明确称其为 carried-forward 分类，**没有**伪装成本轮新观察。
- 我另做四组受限公开精确路径 web-index 查询。可见结果主要是无关数字碰撞，没有可直接核实为六案 task/Gold/answer reuse 的结果；这只支持“检索有索引限制”的能力披露，绝不支持 absence proof。对 GitHub code-search API/UI 的工具访问也不可用（API URL 被安全策略拒绝、UI cache miss），故不能把不可访问写成未命中或验证过的认证状态。

### P2 限制（不阻断本工单）

1. snapshot 保存六案的 query 描述和能力限制，但没有可复放的每次检索原始响应/执行日志；因此 Builder handoff 的“**四组**查询”次数无法独立证明。它没有影响本 snapshot 的限定语义，亦没有把旧 RAGAS exclusion 冒充新发现。任何后续正式 freeze 或首次模型调用前的 append-only rescan 应保留可审计的查询分组、时间与结果证据；仍不得将空结果表述为无污染证明。
2. 已知的静态语义同义泄漏盲区仍是 P2；本工单只验证 accepted source 的 byte-identical relocation，未把这个限制降格，也未新增模型授权。

P0：无。P1：无。上述 P2 均已披露且不扩大本次 canonical-data promotion 的范围。

## 执行结果

```text
node evaluation/starlette-v1/validate-promotion.mjs                         PASS
npx vitest run test/starlette-six-case-preflight.test.ts test/starlette-promotion.test.ts
                                                                           2 files / 15 tests PASS
npm test                                                                  18 files / 337 tests PASS
npm run test:protocol                                                     8 / 8 PASS
npm run build                                                             PASS
git diff --check                                                          PASS
npm --cache /private/tmp/context-compiler-ds09-qa-npm-cache pack --dry-run --json --ignore-scripts
                                                                           50 files PASS
```

production tarball SHA-1 为 `f20e56e75c6b6aa9d7362627101771a6c2ca4510`，内容不含 `evaluation/`、`docs/` 或 `test/`。

## 接受边界

WO-DS-09 至此仅接受为“六案 canonical-data freeze candidate accepted”。仍明确保持：`promotion_candidate_not_frozen`、`evaluation_ready:false`、`model_run_authorized:false`、0 medium；未完成正式 freeze，未创建/运行 Probe，未执行 D0/D1/D2 或任何模型，未产生 aggregate、PASS rate 或效果结论。正式 freeze、Gold→Probe/answer protocol、pre-run eligibility rescan 和首个模型运行均须另开工单并独立 QA。
