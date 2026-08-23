# WO-DS-13 交接 — Starlette 自动诊断与人工盲评包

日期：2026-08-23

状态：**IMPLEMENTED — PENDING INDEPENDENT QA**

## 单一交付结果

本工单对冻结的 12-slice evaluator-v2 suite 生成了唯一一次 official 自动结果，并把 WO-DS-12 已接受的 36 条未评分回答转换为 public/internal 物理隔离的人工盲评包。没有再次调用模型，没有语义评分，没有修改 core、evaluator policy、frozen data/protocol/input/raw answer，也没有引入 PACE / Evidence Paging / Experience。

official artifact source commit 为 `f721fd1159e6802d29132939c8114377f3faefa4`，其父为 DS-13 计划/对抗审查边界 commit `c3b47065cdc8583feafd5d1716b3ce53aa2de75c`。一次性 runner 在普通全量测试中默认 skip 的 append-only 安全提交为 `a0889f0597aed9053dcc9b84026644ed94e2ed0f`；它没有改动任何 official artifact 或指标。

## 自动原始结果

| 条件 | estimated tokens | 相对 D0 reduction | exact lexical Probe |
|---|---:|---:|---:|
| D0 | 7,767 | 0 | 8/8 |
| D1 | 2,911 | 62.5209% | 0/8 |
| D2 Oracle-State upper bound | 4,578 | 41.0583% | 8/8 |

D2 相对 D1 增加 1,667 estimated tokens，ratio 为 `1.572655`。这说明当前 D2 upper bound 在被测 lexical anchors 上恢复了 D1 丢失的信息，但上下文成本也明显高于简单 recent window；是否值得必须等待人工语义 Correctness Gate，不能由 8 个 Probe 自动决定。

8 个 Probe 只覆盖 3/12 slices：5 个 constraint、2 个 decision、1 个 open question。D0/D2 为 8/8，D1 为 0/8；resolved context 与 recall 都是 `not_evaluable`。evaluator 返回 `passed:false`，failure 为 resolved not-evaluable、recall not-evaluable 与零 latency threshold；本项目把它固定解释为 `non_decision_diagnostic`，不当作效果失败或成功。

Gate 状态保持：

- `lexical_diagnostic_coverage: 3/12 slices, 8 probes`；
- `semantic_correctness_gate: pending_human_review`；
- `context_reduction_interpretation: pending_correctness_gate`；
- `operational_stability_gate: not_evaluated_by_this_work_order`。

本机单次 latency 环境为 Node v25.6.1 / Darwin 25.5.0 arm64。D0/D1/D2 mean 分别为 0.007080 / 0.002865 / 0.077427 ms；只保存为 observation，不作为跨平台 Operational Stability 证据。

固定 artifact SHA-256：

- `artifact-hashes.json`：`85e055f6bb3e9c66c93fa5a55c73890e531d2f28de409356b5422b3198f2e1c7`；
- `internal-audit/automatic-report.json`：`e574ceb0b7d6e9bca401b34e3da26a9462e6fe3731f16ad427ece04956b7e420`；
- `public-review/shared/review-items.jsonl`：`6ef794ac55fc8294f55879e33b44466d51f1673c09040e4d994436617067e2fb`。

## 人工盲评包

36 个 review item 按固定 blinding domain 的 SHA-256 顺序排列。每项只含 opaque `review_id`、Current Task、原始 answer、匿名 criteria 与允许判断值；42 个 required、16 个 forbidden、38 个 critical canonical criteria 只在 `internal-audit/` 保存映射。两份 reviewer form 和 adjudication template 均为空白，Builder、validator 与 QA 都不填分数。

实际导出边界：

- Reviewer A：只给 `public-review/shared/ + public-review/reviewer-a/`；
- Reviewer B：只给 `public-review/shared/ + public-review/reviewer-b/`；
- Adjudicator：两份独立评分返回后才给 `public-review/shared/ + public-review/adjudicator/`；
- 不给任一 reviewer 整个 `public-review/`、仓库、raw capture、packet manifest、automatic report、internal key/provenance 或另一 reviewer 表单。

若真实 reviewer 不能满足该 access threat model，就不能开始评分，也不能声称 condition blind。

## Trust anchor 与 validator

`validate-results.mjs` 在解析当前 result JSON 前先做三层 Git-object 验证：

1. official artifacts 固定到 source commit `f721fd1…` 的 17 个 blobs；
2. opt-in runner 固定到 append-only commit `a0889f0…`；
3. raw capture 固定到 `18a332f…`，answer input / packet manifest / protocol-rubric 固定到 DS-11 QA `8b65120…`。

validator 使用 `execFile("git", args, {shell:false})` 读取固定 parent/path/blob，要求 current bytes 与 Git blob 一致。public/internal/artifact 三层 hash manifest 仍会重建，但不是 trust root。聚焦测试实证：同步修改 answer、public hash、artifact hash 和 validator hash constants 仍先在固定 source blob 拒绝；另覆盖 rubric、condition mapping、swap、review id、unknown field、Unicode U+200B 与 symlink。

## 一次性 runner 的回归处理

第一次全量 `npm test` 将文件名为 `*.test.ts` 的 official runner 也纳入发现；由于没有 `CONTEXT_COMPILER_DS13_OFFICIAL_OUTPUT`，它在调用 evaluator 前立即拒绝，因此没有第二次 evaluator 运行，也没有任何新 artifact。append-only commit `a0889f0…` 将 runner 改为无该显式环境变量时 skip。随后全量回归为 383 PASS / 1 个一次性 runner SKIP。QA 应保持默认环境，不运行该 official generator；若要复算确定性指标，应在独立临时目录写单独 noncanonical replay，不能覆盖本目录。

## Builder 自检

- result validator：12 cases / 8 Probe / 36 answers / 36 review items；Git anchors verified；1 evaluator run / 0 model call / 0 semantic score；
- focused：7/7 PASS；
- `npm test`：22 files / 383 tests PASS，official runner 1 SKIP；
- `npm run test:protocol`：8/8 PASS；
- `npm run build`、`git diff --check`：PASS；
- 独立 `/private/tmp` npm cache 的 `npm pack --dry-run --json --ignore-scripts`：50 files，SHA-1 `f20e56e75c6b6aa9d7362627101771a6c2ca4510`，包内不含 `evaluation/`、`docs/` 或 `test/`；
- 实现者不批准本工单。

## 独立 QA 必查

- 固定 Builder candidate/父提交/main/clean，并确认差异没有 `src/`、package surface、provider/host、frozen data/protocol/input/raw answer 或 PACE 机制；
- 直接从 Git objects 重算三层 source identity 与 current byte identity；
- 在隔离临时目录做一次 noncanonical evaluator replay，只比较 token、rate、delta、not-evaluable、failure 等确定性字段；不得比较 latency，也不得写回 official artifacts；
- 独立重算 7,767 / 2,911 / 4,578 token、D2-vs-D1 `+1667 / 1.572655` 与 8 Probe 的 D0=8、D1=0、D2=8；
- 核对 36 review items 与 raw answer/current task/rubric/internal key 一一对应，public bundle 不含条件/packet/canonical/provenance/context-format 元数据；
- 原样攻击协调 answer/rubric/mapping/hash/validator 自举、swap/duplicate/omission/order/review-id/unknown/symlink/Unicode control；
- 确认 A/B form 与 adjudication template 全空白、export threat model 可执行；
- 运行 validator、focused、全量、protocol、build、diff check 与隔离 pack。

即使 QA PASS，也只接受“自动诊断 artifact 与空白盲审包可交付”。在两名真实 condition-blind 人类完成独立评分并由后续 scoring 工单验收前，不解盲、不产生 condition-level answer correctness、不计算综合分数，也不声明 D2 优于 D1。
