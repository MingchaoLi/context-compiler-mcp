# WO-DS-05 — Starlette 三案 promotion audit 与共同 evidence cutoff

状态：IMPLEMENTED — PENDING NEW INDEPENDENT DATA QA

## 背景与对抗审查处置

WO-DS-04 已证明 STR-04/05/08 的 31 个 slice 可以确定性进入真实 evaluator v2 parser，但没有冻结数据、映射 Probe 或运行效果实验。

关键节点对抗审查 `AR-2026-08-23-post-ds04-wiring.md` 判定为 `Challenge`：旧三案 promotion 与首次制作 STR-06 是不同失败面，不应塞进一个只在末尾接受/退回的工单；`evidence_cutoff_at` 也必须与不断变化的 `scan_observed_at` 分离。本工单接受该拆分，只处理已经独立接受的 STR-04/05/08。

## 单一结果

在不修改三案语义 payload、不制作 STR-06、不运行 evaluator/model 的前提下：

> 固定全六案共享的 evidence cutoff，并对 STR-04/05/08 建立可机械复验的 promotion 副本、逐文件来源→promotion diff、版本化 contamination snapshot 与 promotion hash。

本工单不以三案都可 promotion 为预设。若新来源审计要求语义改动、污染规则命中 confirmed 或复制/hash 不能证明字节一致，必须明确保持对应 gate closed，不得静默清理、换案或改 Gold。

## 固定集合与时间

- collection id：`starlette-v1`；
- 注册 case id 与顺序保持：STR-07、STR-08、STR-05、STR-06、STR-01、STR-04；
- 本工单 promotion 子集与顺序：STR-08、STR-05、STR-04；
- 全六案共享 `evidence_cutoff_at`：`2026-08-23T03:00:00Z`；
- 任何发生在该 cutoff 之后的 Issue/comment/review/commit/state 事件不得进入 Starlette v1 canonical evidence；
- `scan_observed_at` 是本次公开污染检索完成时间，必须独立记录，不得反向改变 evidence cutoff；
- 后续 rescan 追加新 snapshot，不覆盖本次 promotion payload/hash。

不得依据 promotion、污染扫描、未来 D0/D1/D2 或模型结果替换注册案例。确认污染只改变 eligibility/disclosure；任何替换必须另行预注册，不能在本工单内发生。

## 路由上下文

只读取：

- `AGENTS.md`；
- `docs/PROJECT_STATE.md`、`docs/ROADMAP.md`；
- 本工单；
- `docs/adversarial-reviews/AR-2026-08-23-post-ds04-wiring.md`；
- WO-DS-02/03/04 的最终报告、handoff 与 QA 中和 STR-04/05/08 接受边界直接相关的部分；
- `evaluation/starlette-v1/` 下 collection plan、contamination、pilot/canary、hash、validator、wiring 与聚焦测试；
- STR-04/05/08 已登记 source path 的公开 GitHub 主来源，以及固定六案 source number 的公开 contamination 精确检索结果。

不得读取原始需求归档、同级项目、宿主代码、旧 aiohttp/HTTPX 数据、D2/model 输出或 STR-01/06/07 尚未制作的 Gold/Oracle。

## Promotion 目录与状态

新增独立 `evaluation/starlette-v1/promotion/`，不得修改或删除旧 pilot/canary 文件与 hash。

promotion collection manifest 至少固定：

- schema/version、collection id、`promotion_candidate_not_frozen`；
- 六案注册顺序、三案 promotion 子集、三个 remaining case；
- 固定 `evidence_cutoff_at`；
- contamination rule version 与 snapshot 路径/hash；
- 每个 promoted case 的原 accepted 路径/状态/候选提交与 promotion 路径；
- 明确 `evaluation_ready: false`、`model_run_authorized: false`。

三案 promotion 目录复制原 accepted case 的七个文件。旧 manifest 作为 accepted source metadata 保持字节不变；promotion 状态只由新的 collection manifest 表达，不能把其中的 `pilot_not_frozen` / `canary_not_frozen` 偷改成 frozen。

## 逐文件 promotion diff

对三案的七个文件逐项记录：

- `case_id`、文件名；
- `old_path`、`old_sha256`；
- `new_path`、`new_sha256`；
- `change_class`。

本工单允许的正常分类只有 `byte_identical_relocation`，即 21 个旧/新 SHA-256 完全相同。若任一文件必须改变，必须改标为 `source_reaudit_change`，列出字段 diff、新来源与原因，并保持该 case promotion gate closed；不得把语义变化伪装成 `promotion_metadata_only`。

collection manifest、contamination snapshot、promotion diff 和 promotion hash 是新增 promotion metadata，不与旧文件伪造 old/new 对应关系。

## Contamination snapshot v1

规则版本固定为 `starlette-contamination-rule/v1`，语义沿用已接受规则：只有公开仓库把同一 Starlette issue/fix 明确复用为 LLM、agent、benchmark、code-repair 或 evaluation task，或高度复制任务/patch，才标 `confirmed`；普通下游引用、vendored source、生产 workaround、仅仓库名包含 agent/SWE、或与任务/Gold 无关的 retrieved-context 噪声不计。

本次 snapshot 必须：

- 记录 `evidence_cutoff_at`、`scan_observed_at`、规则版本和 prior snapshot path/hash；
- 至少覆盖固定六案全部 source number；
- 每个 case 保存 query、状态、直接证据与有限 notes；
- `no_public_hit_found` 只解释为 as-of 本 snapshot 的有限结论，不声称绝对无污染；
- 保留 STR-04 RAGAS context-only 排除理由，不得把旧 QA 已否定的命中重新算作 confirmed；
- 若出现新 confirmed，不换案、不改 Gold，明确记录该 case 对未来 blind run 的 eligibility 状态。

六案最终 freeze 时必须另做一次全集合 snapshot；首次模型运行前再追加一次 pre-run snapshot。新结果不得覆写本次 payload/hash。

## Source re-audit 边界

对 STR-04/05/08 已登记的 31 个 evidence source 做轻量复核：

- immutable comment/review/state/commit 标识、发生时间和可验证内容 hash 仍与 accepted fixture 相符；
- 对可能后编辑的 Issue/PR body，继续只使用创建时可证明标题/状态，当前 body digest 的变化不能反写为 cutoff 时正文；
- 若当前来源变化只说明 GitHub body 后续编辑，但 accepted summary 仍由 immutable title/timeline 支持，记录 limitation，不改 payload；
- 若来源变化推翻 accepted summary/Gold/Oracle，停止该 case 的 metadata-only promotion，记录 `source_reaudit_change` finding 并交回新工单；
- 不重新解释已通过 QA 的语义边界：STR-04 的 tracker close 不等于 resolved，#1649/#2349 只为 partial capability；STR-05 的 9 个 increment 仍按机械规则；STR-08 的 existing context-manager 结论不得泄漏到早期 task。

## 可执行验证

新增独立 promotion validator，至少验证：

- collection id、六案顺序、promotion/remaining 子集、cutoff、status 和禁止运行字段；
- 21 个 copied file 与 accepted source 字节/hash 完全一致；
- 每个 copied bundle 继续通过已接受 case validator；
- promotion diff 与实际 old/new path/hash/change class 完全一致；
- contamination snapshot 的 case 顺序、source numbers、规则版本、时间和 status/evidence 一致；
- promotion hash 覆盖 collection manifest、snapshot、diff 与 21 个 copied file，并拒绝内容、路径、顺序或状态篡改；
- DS-04 wiring 在读取 promotion 三案时仍生成同一 31 slices / 226 turns，并通过真实 evaluator v2 parser；允许为此扩展 loader，但不得改变 core evaluator。

## 允许实现

- `evaluation/starlette-v1/promotion/` 下 collection、三案字节副本、diff、snapshot、hash；
- `evaluation/starlette-v1/` 下最小 promotion validator/loader；
- 聚焦测试；
- 中文 promotion 报告、handoff、项目状态与路线图更新。

不得修改 `src/`、package runtime、MCP、依赖、retrieval/assembler/evaluator policy、provider 接口、旧 pilot/canary fixture/hash 或 contamination snapshot。

## 验收

- 固定六案 evidence cutoff 与 selection 不变规则可机械验证；
- STR-04/05/08 共 21 个 case 文件为 accepted source 的 byte-identical relocation；
- promotion diff、snapshot 与 hash 可从文件系统重建；
- 31 个 accepted evidence source 的轻量 re-audit 没有发现需要改语义 payload 的反证，或对失败 case 明确保持 gate closed；
- 六案 contamination snapshot 使用同一 rule version，结论有限定且不覆盖旧 snapshot；
- promotion 三案仍可生成 31 slices / 226 turns，并通过真实 evaluator v2 parser；
- collection 保持 `promotion_candidate_not_frozen`、`evaluation_ready: false`、`model_run_authorized: false`；
- 不制作 STR-01/06/07，不映射 Probe/critical miss，不运行 D0/D1/D2、远端模型或效果指标；
- 聚焦测试、`npm test`、protocol、build 与 `git diff --check` 通过；
- Builder 提交中文 handoff 后，由新的独立 data QA 固定候选复核来源、复制、diff、snapshot、hash 与模型禁区。

## Gate

只有独立 QA PASS，三案 promotion audit 才接受；接受后也只允许另开 STR-06 source/Gold checkpoint，不表示全六案 frozen 或 evaluation ready。

## Builder 实现结果

2026-08-23 已完成待验收候选：固定共同 evidence cutoff；建立覆盖固定六案的版本化污染 snapshot；轻量复核 STR-08/05/04 共 31 个来源且未发现需要修改语义 payload 的反证；将三案 21 个 accepted 文件逐字节复制到 promotion 目录并生成可重建 diff/hash；以真实 evaluator v2 parser 复验 31 slices / 226 turns。collection 仍为 `promotion_candidate_not_frozen`，`evaluation_ready` 与 `model_run_authorized` 均为 false。

Builder 自检通过 promotion 10/10、全量 293、protocol 8/8、build、diff check 和真实 50-entry npm pack 隔离。完整证据见 `docs/evaluation/starlette-v1-three-case-promotion.md` 与 `docs/handoffs/WO-DS-05-starlette-three-case-promotion-audit.md`。本结果不自行批准；等待新的独立 data QA。

## 明确不做

- 制作 STR-01、STR-06、STR-07；
- 声称完整六案 frozen；
- Probe/Fact-Gold adapter、critical-miss rubric、答案评分或 answer-model runner；
- D0/D1/D2、远端 GPT-5.6、aggregate、PASS rate 或 D2 效果解释；
- 重新挑选案例、修改 D2 policy 或 Context Compiler core；
- Formal Host Mode、provider SDK、自动 headline 或 extractor。
