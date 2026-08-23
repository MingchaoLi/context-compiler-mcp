# WO-DS-11 — Starlette data+protocol 原子 freeze 与首次运行 gate

状态：IN PROGRESS — freeze/run-contract only，禁止模型调用

## 背景

WO-DS-09 已接受六案 canonical-data freeze candidate；WO-DS-10 已在独立 QA commit `44c9756b041601fa7f287c834157439ac77fec3f` 接受 `protocol_canary_not_frozen`。DS-09 后对抗审查要求下一步先原子冻结 data identity 与 protocol identity，再紧邻首次远端调用做 append-only contamination rescan，并预注册模型、prompt、条件顺序、捕获与失败策略。

本工单只完成这一 run-ready gate，不生成任何模型回答、不运行 evaluator、不评分。它不修改 Context Compiler core，也不把理想 Oracle-State 冒充自动 extractor 输出。

## 单一结果

> 以一个 append-only freeze manifest 原子锁定 DS-09 canonical data、DS-10 protocol 与 36 个盲化 D0/D1/D2 answer-input packet；使用不变污染规则做首次调用前复扫；固定 GPT-5.6-terra non-sol 单次 feasibility 运行合同。独立 QA PASS 后，下一工单才可按该合同发起模型会话。

## 固定输入

- branch：`main`；
- DS-09 canonical-data Builder candidate：`4b974538d76d0e0d8a5ac17c5662533b714ef00e`；
- DS-09 QA commit：`2012961d9409f6c957d344c5432a701a1c15f8e7`；
- DS-10 protocol Builder candidate：`bc78c42505c34ae6f3220db49b2e5a5af905d0eb`；
- DS-10 QA commit：`44c9756b041601fa7f287c834157439ac77fec3f`；
- `promotion-hashes.json` SHA-256：`c216719f1745601786ad53f50bbaed6c5e7b0a8e8d9d6612cfb79b9c103ff51b`；
- `protocol-canary/protocol-hashes.json` SHA-256：`fde44511237c1a16d317131122461461c788b175b102592f22d6a656cfd6e99a`；
- 固定 6 cases / 12 slices / 101 projected history turns / 8 context Probe / 42 required / 16 forbidden；
- 固定条件：D0 full raw history、D1 existing recent complete-user-turn window、D2 existing assembler + 人工 Oracle-State + recent raw；无 headline、无 recall query。

任何 canonical data、Gold、Oracle、task、Probe、rubric、slice 或条件定义改变都必须失败，不能通过重建 freeze hash 吸收。

## Append-only 原子 freeze

在 `evaluation/starlette-v1/freeze/v1/` 新增 freeze wrapper，不改写 promotion/protocol 原文件状态。manifest 必须：

- 将上述固定 data/protocol bytes 声明为同一个 freeze identity；
- 固定 promotion/protocol hash manifest 的路径与 SHA，并独立展开所有被引用 canonical file SHA；
- 固定 Builder/QA Git commit 链、case/slice 顺序和数量；
- 明示 underlying legacy 文件仍写 candidate 状态，但其 bytes 由本 wrapper `frozen_by_manifest`；
- `canonical_payload_mutation_authorized:false`、`protocol_mutation_authorized:false`、`case_reselection_authorized:false`；
- Builder candidate 的 freeze 只有在独立 QA 接受后生效；本文件本身不授权本工单内模型调用。

后续 evaluator、protocol 或 Context Compiler 改动不得静默重算 frozen Gold/packet；只能新建版本。

## Pre-run contamination eligibility rescan

追加 `contamination-snapshot-pre-run.json`，引用且不覆盖 DS-09 freeze-candidate snapshot SHA `d3fe578e8f9b70eaba48ae24d4fdb13615104b27de11ca7d5b2ae3906fd98dd2`。

- 规则与文本必须精确保持 `starlette-contamination-rule/v1`；
- 覆盖固定六案全部 source number；
- 使用当前可用公开 web index，逐案至少执行 exact legacy/current path + benchmark/eval/LLM/agent/repair/dataset qualifier；
- 保留 query、观察时间、能力限制、direct evidence、excluded hit 与 notes；
- `confirmed` 必须有直接 public task-level reuse；普通 release note、下游引用、canonical source 与 STR-04 RAGAS context-only noise 不计；
- `no_public_hit_found` 只是 as-of observation，不是 absence proof；
- 任一 `confirmed` 不得换案/改 Gold，只将 `blind_eligibility:false` 并阻止下一工单模型运行；
- 无法获得 GitHub code-search API/UI 必须如实披露，不能以 rate limit 证明 absence。

## 36 个 answer-input packet

固定 12 slices × D0/D1/D2 × 1 repetition，共 36 个 packet；本工单只生成输入，不调用模型。

每个 packet 必须包含：

- opaque `packet_id`，prompt 内不出现 case/slice/condition 标签；
- 固定、条件无关的系统任务说明；
- 由真实现有代码生成的 condition context 与同一 Current Task；
- `context_sha256`、`prompt_sha256`、字符数和 `character_count_divided_by_four` 估计 token；
- 内部 manifest 才保存 packet→case/slice/condition/repetition 映射；
- D0/D1 必须沿用 evaluator 的 transcript rendering；D2 必须调用真实 `assembleContext` 并使用 `rendered_context`；不得为让 D2 更好而手工改写；
- packet 不得包含 Fact Gold、answer rubric、Decision Reference、Outcome Anchor 或 future event；D2 只允许当时 Oracle-State、relations、recent raw 与 Current Task；
- 36 个 prompt 逐字节 hash，固定运行顺序使用预注册 SHA-256 排序，不按输出调整。

系统说明固定要求：只用提供的历史；不得上网、读仓库或调用工具；用英语在 250 words 内回答 Current Task；明确区分已知事实、仍未知项与下一步；返回单一 JSON object `{"answer":"..."}`。任何条件标签、Gold、rubric 或未来结果进入 prompt 都必须失败。

## GPT-5.6-terra feasibility 运行合同

下一工单只能使用：

- model alias：`gpt-5.6-terra`（non-sol）；
- reasoning effort：`medium`；
- transport：36 个新的隔离 collaboration agent session，`fork_turns:"none"`，每个 session 只接收一个 opaque packet；
- tool/network/repository use：prompt 明确禁止；若输出显示使用外部信息，该 cell 无效；
- repetition：每 cell 恰好 1 次，仅作 feasibility，不作稳健/一般化效果结论；
- sampling/temperature/seed：transport 不暴露，必须记录为 unavailable，禁止声称确定性复现；
- attempt policy：每 cell 只发起一次；技术失败标 `technical_failure`，不得单 cell adaptive retry 或 best-of；系统性失败只能另开完整 rerun 工单；
- capture：保留原始 assistant output、开始/结束时间、请求 alias/effort、packet hash、解析状态与 response SHA；不得修写模型答案；
- 运行顺序：严格使用冻结 order；新会话之间不共享答案或 rubric；
- 模型回答只作为未评分 artifact。语义 required/forbidden/Critical-Miss 仍需 DS-10 预注册的两名 condition-blind 人类 reviewer；禁止用第二模型 judge 冒充人工。

该 transport 是 Codex collaboration agent session，不是公开 provider API；没有可验证的温度、seed、精确 backend build 或 billed-token metadata。此限制不阻塞单次 feasibility 收集，但阻塞确定性复现、供应商横向比较和稳健效果声明。

## 自动 context 指标

本工单不运行指标。下一运行工单可以在冻结 12-case suite 上运行现有 evaluator v2，输出：

- D0/D1/D2 原始 context token；
- 8 exact Probe 的 constraint/decision/open-question lexical carry-through；
- D2-vs-D1 原始 token 差；
- latency；
- resolved context 继续 `not_evaluable_diagnostic_only`，overall `passed` 继续 `non_decision_diagnostic`。

不得创建加权总分或把 lexical context 指标替代 answer semantic judgment。

## Validator 与测试

至少验证：

- freeze manifest 精确锁定两个 accepted hash manifests、Git commits 与所有 canonical/protocol file SHA；
- snapshot append-only 链、规则、六案顺序/source number、status/evidence/eligibility 与检索限制；
- 36 packet / 12×3×1、opaque id/order/hash、同 slice Current Task 一致、D0/D1/D2 renderer 与 source prefix；
- D0 full、D1 recent、D2 assembler；D2 明示 Oracle-State upper-bound，不冒充 extractor；
- prompt 不含 condition label、Gold/rubric/outcome/decision reference/future event；
- run contract model/effort/fresh-session/one-attempt/no-retry/no-tools/250-word/JSON/capture/blinding 固定；
- `evaluation_run_count:0`、`model_call_count:0`、`answer_artifact_count:0`；
- coordinated data+protocol+freeze rewrite、hash 自举、packet swap/duplicate/omission/order、condition leak、future leak、authorization、unknown/path/symlink/Unicode format-control 均拒绝；
- focused、`npm test`、`npm run test:protocol`、build、diff check、production pack 隔离通过。

## 允许实现

- `evaluation/starlette-v1/freeze/v1/` 下 append-only manifest、snapshot、run contract、input packets、生成/验证脚本；
- 聚焦测试；
- 中文 README/handoff/PROJECT_STATE/ROADMAP。

不得修改 `src/`、package、MCP、provider/host、42 个 promotion payload、DS-10 protocol payload/hash、旧污染 snapshot/QA 或 retrieval/assembler policy。

## 明确不做

- 不调用 GPT-5.6-terra 或任何模型；
- 不运行 `runEvaluationSuiteV2`；
- 不生成 answer、semantic judgment、token/retention/latency result 或 PASS rate；
- 不实现 provider SDK、answer-model runner、model judge、Formal Host Mode、headline/extractor；
- 不补 medium、不换案、不改 Gold/Probe/rubric；
- 不宣称 D2 优于 D1。

## Gate

Builder 提交中文 handoff 且不能自批。独立 QA 必须固定 Builder candidate，独立重建 freeze/hash/36 packets，复核真实公开污染 scan、prompt/condition 隔离与 model contract，并验证无 runner/model/provider/network 执行路径。

只有独立 QA PASS，data+protocol freeze 才正式生效，下一工单才可引用 QA commit 授权恰好 36 次 GPT-5.6-terra feasibility session。若 scan 出现 confirmed、packet 泄漏、hash 自举或运行合同可变，必须 FAIL。
