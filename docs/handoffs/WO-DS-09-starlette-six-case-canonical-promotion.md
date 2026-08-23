# WO-DS-09 交接 — Starlette 六案 canonical-data promotion candidate

日期：2026-08-23

状态：**IMPLEMENTED — PENDING NEW INDEPENDENT DATA QA**

## 当前交付

- Phase 0 先以旧三案 promotion + STR-06/07/01 accepted checkpoint 组成内存全集，真实 evaluator v2 parser 接受 6 案 / 75 slices / 588 projected turns；runner/model/effect metrics 均为 0；
- STR-06/07/01 的七文件各 1 份逐字节复制到 `promotion/cases/`，六案 promotion 合计 42 个普通文件；
- `promotion-diff.json` 扩为固定 canonical 顺序的 42 项 `byte_identical_relocation`；
- `validate-promotion.mjs` 在代码内固定四个 accepted candidate 的六案 path/order/SHA，不信任可与 fixture 协调重写的 JSON hash；
- `source-acceptance-ledger.json` 登记固定 Data-QA candidate，并明确 `live_source_reaudit_performed:false`；
- `contamination-snapshot-freeze-candidate.json` 追加引用旧 snapshot，没有覆盖旧 evidence/hash；
- promotion-only suite 与 Phase 0 suite 逐字段一致，仍为 75 slices / 588 turns；
- collection 固定实际 1 short / 0 medium / 5 long、slice 4 / 0 / 71，medium 明确不可评价；
- `promotion_candidate_not_frozen`、`evaluation_ready:false`、`model_run_authorized:false` 保持。

## 固定 source 合同

| case | accepted candidate | accepted path | files |
| --- | --- | --- | ---: |
| STR-07 | `8f51bf4f9308d124ace63c5c8ca755373105c71f` | `checkpoint/STR-07` | 7 |
| STR-08 | `32600eb6b7caf3fbe339e1103d3293f0b7e33103` | `pilot/STR-08` | 7 |
| STR-05 | `32600eb6b7caf3fbe339e1103d3293f0b7e33103` | `pilot/STR-05` | 7 |
| STR-06 | `f4931ad35cc7e4a844bb40ceb397aaf07842616d` | `checkpoint/STR-06` | 7 |
| STR-01 | `454565b863cf7e9470e7ac8079febf2a5c0d42d9` | `checkpoint/STR-01` | 7 |
| STR-04 | `32600eb6b7caf3fbe339e1103d3293f0b7e33103` | `canary/STR-04` | 7 |

Builder 用 Git diff 逐目录确认当前 accepted source 与上述 candidate 无差异。聚焦测试分别对旧 pilot 与 STR-07/06/01 checkpoint 做协调重写，并同步重建 source hash、promotion copy、diff、collection 引用和 promotion hash；四类攻击均在固定 source contract 处拒绝。

## 污染与解释限制

freeze-candidate snapshot 在 `2026-08-23T07:41:36Z` 对六案做四组公开 web-index 精确路径查询。未观察到符合预注册规则的新 confirmed hit，但 GitHub code-search API/UI 在当前工具中不可用且公开索引有数字碰撞；`no_public_hit_found` 只是一项有限 as-of 结果。旧 STR-04 RAGAS context-only 排除保留。首次模型调用前仍需 append-only pre-run eligibility rescan。

当前 71/75 slice 来自 long 案例。该分布不阻塞 canonical byte promotion，但 medium 不能评价，禁止 tier-balanced 或一般化 Starlette 结论；未来 pooled aggregate 也只能作为描述性附加信息。

## Builder 自检

- `node evaluation/starlette-v1/validate-promotion.mjs`：6 promoted / 42 byte-identical files / 75 source events / 75 slices / hashes verified；
- 聚焦 preflight + promotion：15/15；
- `npm test`：18 files / 337 tests；
- `npm run test:protocol`：8/8；
- `npm run build`、`git diff --check`：通过；
- `npm --cache /private/tmp/context-compiler-ds09-npm-cache pack --dry-run --json`：50-entry tarball，SHA-1 `f20e56e75c6b6aa9d7362627101771a6c2ca4510`，不含 evaluation/docs/test。

## 独立 QA 必查

- 固定 Builder candidate、父提交和 clean worktree；确认变更没有触及 `src/`、package/runtime、MCP、provider/host、accepted source payload/hash 或旧 contamination snapshot；
- 从四个固定 Git candidate 独立重建六案 42 项 source contract，并逐文件确认 promotion copy 普通文件、byte-identical；
- 复刻旧 pilot 与 STR-07/06/01 checkpoint 协调改写，连同所有可重建 hash/metadata 一起改写后仍须在代码固定合同处拒绝；
- 独立重建 42 项 diff、46 项 promotion hash、collection 引用与 tier/slice 计数；攻击 path/order/status/cutoff/tier/漏项/重复/unknown/symlink；
- 核对新 snapshot 引用旧 snapshot 固定 SHA、六案顺序/source number、规则、status/evidence/eligibility，以及搜索能力限制与 STR-04 RAGAS 排除；必要时做独立 public rescan，但不能把 rate-limit 当 absence proof；
- 验证 mixed accepted suite 与 promotion-only suite 逐字段一致、恰好 75 slices / 588 turns，并由静态导入的真实 evaluator v2 parser 消费；确认没有 `runEvaluationSuiteV2`、provider、network/model 或效果指标；
- 运行聚焦、全量、protocol、build、diff check 与隔离 pack。

实现者不批准本工单。QA PASS 也只能接受 canonical-data freeze candidate；仍不得标记 frozen/evaluation ready，不得创建/运行 Probe、D0/D1/D2 或远端模型。
