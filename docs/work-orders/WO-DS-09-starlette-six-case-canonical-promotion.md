# WO-DS-09 — Starlette 六案 canonical-data promotion candidate

状态：IMPLEMENTED — PENDING NEW INDEPENDENT DATA QA

## 背景与对抗审查处置

WO-DS-05 已把 STR-08/05/04 以 21 个逐字节一致文件放入 promotion 目录；WO-DS-06/07/08 又分别完成 STR-06/07/01 的独立 source/Gold checkpoint 与 Data QA。DS-08 后关键节点对抗审查 `docs/adversarial-reviews/AR-2026-08-23-post-ds08-checkpoint.md` 给出 `Agree with reservations`：现在一次性 promotion 新三案是比单案重复 promotion 或 Probe-first 更小的路径，但交付只能称六案 canonical-data freeze candidate，不能直接宣称 frozen 或 evaluation ready。

本工单接受该判断。`0 medium`、空 Probe 与静态语义同义泄漏盲区不阻塞 byte-identical promotion，但分别限制后续 tier/aggregate 声明、首次模型运行和“机械证明无语义泄漏”的承诺。

## 单一结果

在不修改任何案例语义 payload、不设计 Probe/answer rubric、不运行 evaluator/model 的前提下：

> 将 STR-06/07/01 的 21 个 accepted checkpoint 文件一次性、逐字节一致地加入现有 promotion layout，固定六案 accepted-source path/order/SHA 合同，形成仍处于 `promotion_candidate_not_frozen` 的六案 canonical-data freeze candidate。

## 固定输入与顺序

- collection id：`starlette-v1`；
- 注册及 canonical 顺序：STR-07、STR-08、STR-05、STR-06、STR-01、STR-04；
- 共同 `evidence_cutoff_at`：`2026-08-23T03:00:00Z`，不得滑动；
- 旧三案 accepted source candidate：`32600eb6b7caf3fbe339e1103d3293f0b7e33103`；
- STR-06 accepted source candidate：`f4931ad35cc7e4a844bb40ceb397aaf07842616d`；
- STR-07 accepted source candidate：`8f51bf4f9308d124ace63c5c8ca755373105c71f`；
- STR-01 accepted source candidate：`454565b863cf7e9470e7ac8079febf2a5c0d42d9`；
- 各 source candidate 只作为不可由 fixture 自举改写的 accepted-source 锚点，不把 checkpoint hash 自身当最终信任根。

不得因分层、污染扫描、未来 Probe、D0/D1/D2 或模型结果换案、漏计、拆分 lineage 或改写 Gold。

## Phase 0 — 不落盘全集 preflight

在复制或重算 promotion metadata 之前，先用现有旧三案 promotion bundle 与 STR-06/07/01 checkpoint bundle 构造一次内存中的六案全集，并验证：

- 恰好 6 cases、75 slices、588 个 projected history turns；
- case 顺序与注册顺序一致；
- 所有 slice id 全局唯一，session id 必须与所属 segment 对齐；每个 slice 内 raw-event id、seq 与 source-event id 唯一且顺序连续；相邻时间切片按设计可以重复同一历史事件，但不同案例的命名空间不得碰撞；
- 每一 slice 仍由真实 `parseEvaluationSuiteV2` 静态解析；
- `evaluation_run_count: 0`、`model_call_count: 0`、`effect_metrics_generated: false`。

若此 preflight 失败，本工单停止在 wiring finding，不复制、不 rehash、不修改 collection 状态。

## Promotion 与 accepted-source 合同

- 新增 `promotion/cases/STR-06`、`STR-07`、`STR-01`，每案只复制 manifest、events、tasks、fact-gold、oracle-state、decision-references、outcome-anchors 七个文件；
- 六案共 42 个 promotion 文件全部为普通文件，不能是 symlink；
- `promotion-diff.json` 扩为 42 项，唯一允许的 change class 是 `byte_identical_relocation`，old/new SHA-256 必须完全相同；
- validator 代码内固定六案 42 项 accepted-source case/path/order/SHA 与每案 accepted candidate；同步改 accepted source、promotion copy、checkpoint/pilot/canary hash、diff、collection 与 promotion hash 后仍必须在固定 source contract 处拒绝；
- 任一 semantic byte change 都不属于本工单，必须退回对应单案 Data QA，不能通过重建 hash 吸收。

## Collection 状态与分层披露

collection 必须表达：

- `registered_case_ids` 与 `promoted_case_ids` 均为固定六案 canonical 顺序；
- `remaining_case_ids: []`；
- 六案实际 tier 分布为 1 short / 0 medium / 5 long；
- 75 slices 中 short 4、medium 0、long 71；
- `medium` 明确为 `not represented / not evaluable`，禁止声称 tier-balanced；
- pooled aggregate 未来最多是描述性附加项，不能掩盖 case-level 与 tier-level 原始结果；
- 状态仍为 `promotion_candidate_not_frozen`；
- `evaluation_ready: false`、`model_run_authorized: false`。

即使本工单和独立 QA 通过，也只接受 canonical-data freeze candidate；正式 frozen 状态、Probe/answer protocol 和首次模型运行必须分别由后续工单授权。

## Freeze-time contamination snapshot

在不改变既有 `evidence_cutoff_at` 的前提下，追加一次覆盖固定六案的 full snapshot：

- 规则继续固定为 `starlette-contamination-rule/v1`，不得事后放宽或收紧；
- 新 snapshot 必须引用既有 promotion snapshot 的 path/SHA，不能覆盖历史扫描；
- `scan_observed_at` 只表示本次检索时间，不反写 canonical evidence；
- `confirmed` 必须有直接证据；普通下游引用、release note、canonical source 与 RAGAS context-only noise 继续排除；
- `no_public_hit_found` 只是一项受搜索能力限制的 as-of 结论，不是 absence proof；
- 若发现 confirmed，不换案、不改 Gold，只改变并披露 blind eligibility，且保持 model run 未授权；
- 首次模型调用前仍需另做 append-only pre-run eligibility rescan。

本工单不因 snapshot 重新做 75 个来源的完整语义 QA；来源语义接受锚点来自各固定 Data QA candidate。metadata 可记录这些 QA 锚点与 source/event 数，但不得把继承证据伪称为本次 live re-audit。

## 可执行验证

validator、wiring 与聚焦测试至少验证：

- 6 案 / 42 copied files / 42 diff entries / 75 slices / 588 turns；
- 六案 accepted-source 固定合同与 byte-identical relocation；
- collection/status/tier 分布/中等层缺失披露/禁运行字段；
- snapshot 版本链、规则、六案顺序、source number、status/evidence/eligibility；
- promotion hash 覆盖 collection、snapshot、来源接受 ledger、diff 与 42 个副本；
- 所有六案 bundle 继续通过已接受的严格 case validator；
- 真实 evaluator v2 parser 静态消费全集，且不调用 runner/model；
- 路径、顺序、重复、漏项、status、cutoff、tier、hash、symlink、unknown field、协调改写均拒绝；
- `npm test`、`npm run test:protocol`、`npm run build`、`git diff --check` 与 production pack 隔离通过。

## 允许实现

- `evaluation/starlette-v1/promotion/` 的新三案字节副本与 metadata 更新；
- `evaluation/starlette-v1/` 下 promotion validator、全六案 preflight/wiring 的最小修改；
- 聚焦测试；
- 中文评估说明、handoff、PROJECT_STATE 与 ROADMAP 更新。

不得修改 `src/`、package runtime、MCP、依赖、evaluator/retrieval/assembler policy、provider/host 接口、任何 accepted source payload/hash、旧污染 snapshot 或旧 QA 记录。

## 明确不做

- 正式标记 `frozen` 或 `evaluation_ready:true`；
- Probe、Fact-Gold adapter、critical-miss rubric、答案评分、answer-model runner；
- D0/D1/D2、远端 GPT-5.6、aggregate、PASS rate 或 D2 效果解释；
- 补 medium、换案、按结果重选案例；
- 调 D2 policy、扩展 Context Compiler core、Formal Host Mode、provider SDK、自动 headline/extractor。

## Gate

Builder 必须提交中文 handoff 且不能自批。新的独立 Data QA 固定 Builder candidate，复验 42 项 source contract、协调改写、snapshot、75/588 preflight、parser、pack 与禁运行边界。只有 QA PASS，才接受六案 canonical-data freeze candidate；接受后仍保持 `promotion_candidate_not_frozen`、`evaluation_ready:false`、`model_run_authorized:false`。

## Builder 实现结果

2026-08-23 已完成待验收候选：Phase 0 的混合 accepted layout 先通过 6 案 / 75 slices / 588 turns 静态 preflight；随后 STR-06/07/01 共 21 个文件以 byte-identical relocation 加入 promotion，使六案合计 42 个副本。collection、42 项 diff、accepted-source 代码合同、来源接受 ledger、追加式 freeze-candidate contamination snapshot 与 promotion hash 已更新；promotion-only suite 与 Phase 0 suite 逐字段一致，并由真实 evaluator v2 parser 接受。

Builder 未修改任何 accepted payload/hash、旧 contamination snapshot、`src/`、runtime、MCP、provider 或 host；没有 Probe、runner/model 调用或效果指标。当前仍等待新的独立 Data QA，Builder 不批准本工单。

Builder 自检通过：promotion validator；15 项聚焦 preflight/promotion；全量 337 项单测；protocol 8 项；build、diff check；50-entry production pack 隔离且不含 evaluation/docs/test。
