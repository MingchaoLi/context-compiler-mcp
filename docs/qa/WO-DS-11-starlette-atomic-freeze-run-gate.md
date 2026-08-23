# WO-DS-11 独立 Data / Run-Gate QA：Starlette 原子 freeze

日期：2026-08-23

结论：**PASS — 接受 atomic data+protocol+answer-input freeze。** 此接受使固定 bytes 以 wrapper 的 `frozen_by_manifest` 生效；它不在本工单内授权模型或 evaluator 调用。

## 固定候选与范围

- Builder candidate：`a2d68b851d178db20dc3abfb17b2d3eda8d66d3c`；父提交：`e2ba0ebfe5d5d6e81caf77a98a4d8a5e25350b7d`。开始时 `main`、HEAD、父提交精确匹配，工作树 clean。
- 相对父提交只有 15 个 DS-11 append-only freeze、测试和文档文件；未改 `src/`、package/runtime、MCP、provider/host、42 个 promotion payload、DS-10 protocol payload/hash 或旧 snapshot/QA。
- 固定 Git 链已独立核对：DS-09 QA `2012961d…` 的父为 data candidate `4b974538…`，DS-10 QA `44c9756…` 的父为 protocol candidate `bc78c425…`；后者的父仍为 `5e496723…`。

## 独立 byte 与 manifest 重建

直接读取固定 Git object，而不信任 freeze JSON 自举：`promotion-hashes.json` 展开的 46 个 canonical 文件均与当前文件和 `4b974538…` 三方 byte-identical；3 个 protocol 文件均与当前文件和 `bc78c425…` 三方 byte-identical。所有 49 个均为普通文件、非 symlink，且与 freeze manifest 的展开顺序和 SHA 一致。

- promotion hash manifest SHA-256：`c216719f1745601786ad53f50bbaed6c5e7b0a8e8d9d6612cfb79b9c103ff51b`；protocol hash manifest SHA-256：`fde44511237c1a16d317131122461461c788b175b102592f22d6a656cfd6e99a`。
- freeze 固定 6 cases、12 slices、101 projected history turns、8 Probe、42 required、16 forbidden、38 critical，顺序为 STR-07/08/05/06/01/04 与既有 12-slice contract。
- freeze manifest 保持 canonical/protocol/case reselection/packet regeneration 均不可授权，且 Builder work order 的 model/evaluator count 为 0。

## 36 个输入 packet 的独立审查

未调用 Builder 生成器。我从固定 promotion 事件、task、Oracle-State 和 DS-10 selection 独立重建每个 12×D0/D1/D2×1 packet：所有 36 个 context、prompt、Current Task、SHA、字符/四分之一 token 估算和 D0/D1/D2 count 均逐字节匹配。D0 是完整 raw transcript，D1 是既有完整 user-turn recent window，D2 直接调用真实 `assembleContext` 的 `rendered_context`。

逐 packet 检查通过：时间/`[seq]` 前缀连续、三条件的 Current Task hash 相同、36 个 opaque id 唯一、SHA execution order 唯一。prompt 和 system instruction 没有 case/slice/condition 标签、Fact Gold、answer rubric、Decision Reference、Outcome Anchor、未来 event id 或 Unicode format/control 字符。`answer-inputs.jsonl` 仅有 packet/prompt/response-contract 字段，未含模型 answer；`answer_artifact_count:0`。

D2 始终明确是人工 Oracle-State typed-state upper bound：没有自动 extractor、headline 或 recall，不能作为端到端 D2 或效果优于 D1 的证据。

## 污染复扫

pre-run snapshot 对六案保留与 DS-09 完全相同的 `starlette-contamination-rule/v1`、cutoff、source number 和 prior snapshot SHA `d3fe578e…`。每案含 legacy/current 两组 exact-path + benchmark/eval/LLM/agent/repair/dataset 限定查询。本 QA 又做了同样的受限 web-index 复扫：未观察到符合“公开 task-level reuse”定义的 direct evidence 或 confirmed case。

普通 Starlette release note、STR-01 downstream explanation、STR-04 RAGAS context-only / ordinary reference / canonical-source 均仍符合排除规则；STR-08 的 OpenReview 数字碰撞保持 excluded。GitHub code-search API/UI 不可用，OpenReview 页面亦要求浏览器验证；故 `no_public_hit_found` 只表示当前受限公开索引的 as-of observation，**不是**absence proof，也不改变 future direct evidence 应关闭 blind eligibility 的 gate。

## 对抗复验与执行隔离

在已清除的隔离副本中，同步篡改 canonical task、promotion hash、protocol authorization/hash、freeze manifest 与 freeze hash，仍首先被代码内固定 accepted-source contract 拒绝。packet swap/omission、condition/Unicode leakage、unknown、reselection、authorization、sol substitution、retry、symlink 和 coordinated protocol/hash/freeze rewrite 也均由 focused suite/固定 file contract 在任何执行前拒绝；hash manifest 不能自举吸收修改。

`freeze/v1` 只使用文件/crypto 工具、protocol 静态验证、真实 `assembleContext` 与 parser-compatible suite；没有 `runEvaluationSuiteV2`、answer runner、provider SDK、fetch/network 或 credential 路径。static validator 返回 `model_call_count:0`、`evaluation_run_count:0`、`model_run_authorized:false`。

## 发现与验证

- P0：无；P1：无；P2：无。
- `validate-freeze.ts`：PASS（46 canonical / 3 protocol / 6 cases / 12 slices / 36 packets；blind eligible 6；调用计数均为 0）。
- focused：14/14 PASS；`npm test`：20 files / 368 tests PASS；`npm run test:protocol`：8/8 PASS；`npm run build`、`git diff --check`：PASS。
- 隔离 `npm pack --dry-run --json --ignore-scripts`：50 files，SHA-1 `f20e56e75c6b6aa9d7362627101771a6c2ca4510`，包内不含 `evaluation/`、`docs/`、`test/`。

## 接受范围与下一门槛

下一工单最多可按冻结 `execution_order` 发起 **36 次**未评分 `gpt-5.6-terra`（non-sol、medium、`fork_turns:none`）fresh session：每 packet 一次、无 retry/best-of、无 tools/network/repository access，且必须原样 capture。模型回答仍须由两名 **condition-blind 人类** reviewer 按 DS-10 required/forbidden/Critical-Miss rubric 判定，禁止 model judge。

0 medium、单次 repetition、case 内相关性、受限 web index 与 Oracle-State upper bound 均继续限制解释；本接受不表示 D2 优于 D1、稳健性、一般化、确定性复现、provider 比较或任何已评分效果结论。
