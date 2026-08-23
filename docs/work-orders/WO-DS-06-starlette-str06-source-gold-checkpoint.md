# WO-DS-06 — Starlette STR-06 source/Gold checkpoint

状态：ACCEPTED — CHECKPOINT/SCHEMA GATE ONLY

## 背景与单一结果

WO-DS-05 已独立接受 STR-08/05/04 的 promotion audit，但 collection 仍为 `promotion_candidate_not_frozen`。关键节点对抗审查明确要求把首次制作 STR-06 与旧三案 promotion 分离；本工单只完成一个结果：

> 在全六案共同 evidence cutoff 下，把 STR-06 的公开来源、时间增量、Current Task、Fact Gold、人工 Oracle-State、Decision Reference 与 Outcome Anchor 制作为一个可独立 QA 的单案 checkpoint，并严格限定“无仓库 regression test、未本地复现 FIPS、merge/close 不证明所有 FIPS 环境成功”的证据上界。

本工单不把 STR-06 加入 promotion collection，不接受或冻结该案。checkpoint 通过独立 QA 后，主控再决定是否另开 promotion/freeze 工单。

## 固定身份与时间边界

- collection：`starlette-v1`；
- case id：`STR-06`；
- repository：`Kludex/starlette`，历史 `encode/starlette` 视为同一仓库；
- 主 source number：Issue #1365、PR #1366、PR #1410；
- 共同 `evidence_cutoff_at`：`2026-08-23T03:00:00Z`，不得滚动；
- contamination rule：`starlette-contamination-rule/v1`；
- 只引用 DS-05 已接受的 `promotion/contamination-snapshot.json` 及其固定 hash，不覆盖、重写或冒充新 rescan；
- 不得按任何 checkpoint、D0/D1/D2 或模型结果替换注册案例。

## 最小上下文路由

只读取：

- `AGENTS.md`、`docs/PROJECT_STATE.md`、`docs/ROADMAP.md` 与本工单；
- `docs/evaluation/starlette-v1-candidate-survey.md` 的 STR-06 段；
- `docs/adversarial-reviews/AR-2026-08-23-post-ds04-wiring.md` 中 STR-06/canonical-derived 边界；
- WO-DS-02/03 的 schema、validator、最终 QA 中直接影响时间切片/future leakage 的部分；
- WO-DS-05 最终 promotion/QA 中共同 cutoff、污染 snapshot 与 hash 边界；
- `evaluation/starlette-v1/` 下 schema validator、投影函数、collection plan、accepted snapshot；
- Issue #1365、PR #1366/#1410 及其 timestamped comment/review/timeline/commit 的公开 GitHub 主来源。

默认不读取原始需求归档、旧 aiohttp/HTTPX 数据、其他候选的未制作来源、D2/model 输出、宿主代码或同级项目。

## Source checkpoint 规则

先建立 source ledger，再写 Gold。每个纳入事件必须保存可复核的：

- `source_id`、kind、repository/number、database id、node id、URL、commit SHA；
- actor、`occurred_at`、适用时的 `source_updated_at` 与内容 SHA-256；
- 只包含该时点可证明的增量 summary。

必须逐项核对 Issue #1365、PR #1366/#1410 的创建、相关 timestamped 讨论/review、merge/close/reopen state。可变 Issue/PR body 只能使用创建时可由 immutable title/timeline/initial commit 证明的内容；当前 body digest 仅用于变化探测，不能把后编辑说明反写到早期事件。

每个纳入 event 必须产生新事实、约束、判断、状态或方案变化；重复确认、机器人噪声、无信息 state 和只复述前文的评论应进入 `excluded_sources`，并说明原因。所有纳入 event 按真实时间排序且不晚于共同 cutoff。

## Increment、tier 与切片

不得沿用 survey 的 projected medium 作为结论。对纳入 event 逐项机械判断 `information_increment_event_ids`：

- 3–4 个增量为 short；
- 5–8 个为 medium；
- 9 个及以上为 long。

单一连续 lineage 才使用一个 segment；若公开证据显示两个修复不属于同一语义问题，必须停下并记录 split finding，不得为保留推荐案强拼。

按每个已审计增量事件生成 `T1…Tn`。每个 task 的 `available_event_ids` 必须是该 segment 的严格时间前缀；Current Task 只问当时最合理的诊断、约束、已排除方向、未解决问题或下一步，不得复述 Fact Gold、未来 Decision、Outcome 内容/标识或最终答案。

## Gold 与 Oracle 上界

Fact Gold 只能表达 provenance 已支持的事实，至少分离：

- Issue 报告的 FIPS 异常与当时可见调用路径；
- #1366 采用的代码方向及其 repository acceptance/merge；
- 后续 reopen/state 或 timestamped evidence 证明第一次方向不足，撤销早先“已解决”状态；
- #1410 的 compatibility-wrapper 代码变化及其 repository acceptance/merge/close；
- 仓库没有随这两个 PR 纳入 regression test 的可观察事实；
- 最终平台行为仍缺少本地 FIPS 重放与跨环境证明。

不得写入以下断言：

- “#1366/#1410 的 merge 证明 FIPS 行为已经通过”；
- “存在仓库 regression test”；
- “Builder/QA 已在 FIPS 环境复现或验证”；
- “所有 Python/OpenSSL/FIPS 组合均已解决”；
- 仅从 issue close 推断语义问题永久 resolved。

每项 Fact Gold 必须有可见 provenance 和必要的 `superseded_at_event_id`。Oracle-State 是人工 typed-state 上界，必须逐 slice 只引用当时可见 event；Issue state、repo acceptance、行为验证与 residual uncertainty 必须作为不同 item/status 表达，不能把 merge/close 投影成无证据的 `RESOLVED`。

Decision Reference 只记录真实后续动作且明确答案不唯一。Outcome Anchor 可以记录两次 patch/merge、文件变化和 tracker state；每个 anchor 必须显式写出没有 regression test/FIPS 行为验证的 limitation。

## 目录、状态与 hash

新增 `evaluation/starlette-v1/checkpoint/STR-06/`，沿用现有七文件 schema：

- `manifest.json`；
- `events.json`、`tasks.json`；
- `fact-gold.json`、`oracle-state.json`；
- `decision-references.json`、`outcome-anchors.json`。

允许使用既有 schema 的 `canary_not_frozen` case 状态以避免扩展 schema；checkpoint 级状态由独立 `str06-checkpoint.json` 表达为 `checkpoint_not_frozen`。wrapper 至少记录共同 cutoff、source number、case path/status、已接受 contamination snapshot path/hash、`promotion_authorized:false`、`evaluation_ready:false`、`model_run_authorized:false` 及 outcome limitations。

新增 `str06-checkpoint-hashes.json` 覆盖 wrapper 与七个文件。该 hash 只是固定待 QA candidate 内容，不是可自行宣称 accepted 的外部锚点；若 checkpoint 通过，后续 promotion validator 必须把 QA 接受提交中的七文件 path/order/SHA 固定为不可由 fixture 自举重写的合同。

不得修改 DS-05 promotion collection、21 个 promoted payload、promotion hash、旧 pilot/canary/hashes 或污染 snapshot。

## 可执行验证

新增有界 checkpoint validator/test，至少验证：

- wrapper identity、共同 cutoff、source number、snapshot reference、状态与三项禁止授权字段；
- 七文件为普通文件、严格 schema、单案 id/segment、时间顺序、event/task/slice 一一对应；
- increment count 与实际 tier 一致；
- 所有 evidence 不晚于 cutoff，Current Task 无 future leakage；
- Gold/Oracle provenance 只引用当前前缀，supersession/state 语义一致；
- Outcome Anchor 明确 `regression_test_present:false`、`fips_runtime_verified:false` 或等价严格字段/limitation，且不能用 merge/close冒充行为成功；
- snapshot path/hash 与 DS-05 accepted 文件匹配；
- checkpoint hash 拒绝内容、路径、顺序、状态、漏项、重复、unknown field 与 symlink；
- `projectModelInput` 每个 slice 只含六个白名单历史字段与 Current Task，四类非输入文件不进入投影。

独立人工 QA 还必须重新访问所有登记 source，逐项复核 source metadata/body/canonical state hash，并构造 merge→verified、close→resolved、future Gold/Outcome 复述、伪造 test 与低计 increment 的反例。机械 validator 不能替代语义 QA。

## 允许交付

- STR-06 单案七文件、checkpoint wrapper/hash；
- 最小 validator/loader 与聚焦测试；
- 中文 source ledger/checkpoint 报告、handoff、工单/状态/路线图更新。

不得修改 `src/`、package runtime、MCP、依赖、evaluator/retrieval/assembler policy、provider、宿主接口或其他 case payload。

## 验收与 Gate

- 真实 source ledger、increment/tier、slice、Gold/Oracle/Decision/Outcome 均可逐项追溯；
- 所有未来信息与非输入 artifact 隔离；
- 证据上界明确，不声称 regression test、本地 FIPS 复现或跨平台行为成功；
- checkpoint validator、聚焦测试、全量测试、protocol、build、真实 pack 与 `git diff --check` 通过；
- Builder 提交中文 handoff 后，由新的独立 data QA 固定 candidate 做来源与语义验收。

只有独立 QA PASS，STR-06 source/Gold checkpoint 才接受。PASS 仍不表示该案 promoted/frozen、六案完整、Probe/answer rubric 就绪或可运行 D0/D1/D2/远端模型；下一步必须由新的有界工单决定 promotion 或剩余 STR-01/07 的制作顺序。

## 明确不做

- 修改 STR-08/05/04 或 promotion collection；
- 制作 STR-01/07；
- Probe/critical miss/answer rubric/runner；
- D0/D1/D2、远端 GPT-5.6、aggregate、PASS rate；
- 本地构造伪 FIPS 环境作为行为证据；
- Context Compiler core、Formal Host Mode、provider SDK、自动 extractor/headline。

## Builder 实现结果

2026-08-23 已完成待验收候选：按 Issue #1365、PR #1366/#1410 的公开时间线保留 16 个真实信息增量和 16 个严格前缀 slice，机械分层为 long，纠正 survey 的预计 medium。第一次 merge/close、真实 FIPS 失败、reopen、第二 patch、有限单环境成功与第二 close 分别建模；Fact Gold/Oracle 没有把 tracker state 冒充语义 resolution。

新增七文件 checkpoint、wrapper、八项 hash、严格 validator、12 项聚焦反例、中文 source ledger 报告与 handoff。两个 Outcome Anchor 均明确没有 repository regression test、Builder/QA FIPS replay 或跨环境成功证明。引用的 DS-05 contamination snapshot、promotion collection、旧 pilot/canary/hash 和 core 均未修改；没有运行 Probe、D0/D1/D2、provider 或远端模型。

首轮独立 QA 在 `a03564aa29c129415e6d00bf6ce17d6389f5aed3` 发现并拒绝来源 P0：E6 的 PR current-body 变化探测值不准确，E7/E16 又把独立 merge SHA 写入官方 REST 为 `null` 的 issue-state `commit_id`。后续 Builder 修复已纠正 E6，并把三个 state 的 `commit_id` 全部固定为 `null`；merge SHA 只保留在独立 merge/Outcome 证据，新增 merge-SHA 注入反例。

修复候选自检已通过 checkpoint validator、聚焦 12/12、全量 306、protocol 8/8、build 与 diff check。实现者不接受本工单；必须由新的独立 Data QA 固定修复 candidate，原样复验首轮返回条件并重新访问 16 个 source 后决定 PASS/FAIL。

## 独立 re-QA 接受

2026-08-23，独立 Data QA 在固定 source candidate f4931ad35cc7e4a844bb40ceb397aaf07842616d 上原样重放首轮 P0，并重新核对 16 个登记 source、两个 PR 的 initial/final patch 与 file list、16 个增量/严格前缀、Gold/Oracle、哈希攻击、真实 parser、全量测试和 production pack。E6 的 current-body digest/updated_at 与 GitHub REST 一致；E7/E13/E16 都是 commit_id:null 的 REST canonical subset，merge SHA 只保留于独立 merge/Outcome evidence；merge-SHA 注入 null state event 被拒绝。

本工单由此只接受 STR-06 source/Gold checkpoint/schema gate。它不接受该案 promotion/freeze、六案完整性、Probe/answer rubric、D0/D1/D2、远端模型、aggregate 或效果解释。checkpoint 继续为 checkpoint_not_frozen，case 继续为 canary_not_frozen，并保持 promotion_authorized:false、evaluation_ready:false、model_run_authorized:false。后续必须另开有界工单，不能依据本接受擅自扩大范围。
