# WO-DS-10 交接 — Starlette 预注册 protocol canary

日期：2026-08-23

状态：**IMPLEMENTED — PENDING NEW INDEPENDENT QA**

## 交付结果

- `derive-eligibility.mjs` 从 WO-DS-09 固定 promotion 数据确定性重建 6 cases / 83 facts / 75 slices / 499 fact-slice assignments；
- 预注册每案 earliest mature dependency + terminal，共 12 slices / 101 projected history turns；
- `protocol.json` 同时固定 context Probe 与 answer required/forbidden/Critical-Miss rubric；
- 只有 8 个 Probe 同时满足 raw + Oracle 双边 exact anchor、D1-window 外 provenance、非 Current Task/最新事件、类别与区分度合同；
- 19 个 task-dependency Fact 显式标为 `not_exactly_scorable`，没有为凑覆盖率改写数据或强塞 core metric；
- 答案协议包含 42 个 required、16 个 forbidden item；未来允许语义改写，禁止输出后改 rubric；
- 人工判定固定为两名 condition-label-blind reviewer，保留分歧并人工仲裁，不使用第二模型 judge；
- resolved context Probe 固定为空，metric 为 `not_evaluable_diagnostic_only`；overall `passed` 为 `non_decision_diagnostic`；
- 0 medium、case 内 slice 相关性、lexical-only context metric 与无综合加权分数均已披露。

## 固定身份与隔离

- accepted canonical-data Builder candidate：`4b974538d76d0e0d8a5ac17c5662533b714ef00e`；
- `promotion-hashes.json` SHA-256：`c216719f1745601786ad53f50bbaed6c5e7b0a8e8d9d6612cfb79b9c103ff51b`；
- `promotion/collection.json` SHA-256：`ae6ae7446e5e102a12e45124f4ab2658ba40974ec7c4251a1d39f178fd91cfeb`；
- eligibility inventory SHA-256：`1ddc5961a12d510caf97274710ac783d7631ea27b2fbf335f870471064a27d65`；
- protocol SHA-256：`21fc57bb02a67868965475dab82347fb5abde0fb2eb2a0c8fd3b71f24c58c3f0`；
- 没有修改 42 个 promotion case 文件、promotion metadata/hash、污染 snapshot、`src/`、依赖、runtime、MCP、provider/host 或 package publish surface。

当前仍是 `promotion_candidate_not_frozen` + `protocol_canary_not_frozen`。`formal_freeze_authorized:false`、`evaluation_ready:false`、`evaluator_run_authorized:false`、`model_run_authorized:false`；`evaluation_run_count:0`、`model_call_count:0`、`effect_metrics_generated:false`。

## Probe 与 answer 分界

Context Probe 只解释 lexical carry-through，不宣称语义记忆。映射情况：

- STR-07/T10：`URI templating`、`307 redirect`、`path converter for wildcard segments`；
- STR-01/T18：`irreversibly unavailable`、`disconnect handling`、`upstream information flow`、代码标识符 `call_next`；
- STR-04/T4：`routing information`；
- 其余选择 slice 没有合格 Probe，必须按 `not_exactly_scorable` + answer checklist 处理。

Builder 特别拒绝了三类“看似可用”锚点：STR-08 的 `event loop` 区分度不足；STR-06 的 `compatibility probe` / `compatibility-probe` 不符合 evaluator 的标点 exact 语义；STR-04/T18 的 `original global` 语义不完整。rejected alternative、evidence、outcome status 默认进入 answer rubric，不改标为 decision。

## 验证器与攻击面

`validate-protocol-canary.mjs`：

- 先复用六案 promotion 固定 source contract，再固定 promotion/protocol file SHA；
- 独立重新派生 eligibility inventory 并逐字段比较；
- 对每个 Probe 验证 Fact category、mature task dependency、Fact provenance、D1-window 外 raw anchor、Oracle item anchor/source refs、Current Task/最新事件排除、长度与 code exception；
- 对答案 item 验证 active Fact、当时可用 provenance、retention role 与 critical reference；
- 固定 resolved/overall/reporting/human judging/authorization policy。

17 项聚焦测试覆盖正常 inventory/protocol/parser，以及 Oracle-only、raw-only、Current Task/latest repetition、resolved Probe、future answer Fact、dangling critical、零宽字符、code exception 滥用、dependency omission、authorization、unknown field、coordinated protocol/hash rewrite 与 symlink。

## Builder 自检

- `node evaluation/starlette-v1/protocol-canary/validate-protocol-canary.mjs`：6 / 83 / 75 / 499 / 12；8 Probe；19 not-exact；42 required；16 forbidden；run/model count 0；
- `npx vitest run test/starlette-protocol-canary.test.ts`：17/17；
- `npm test`：19 files / 354 tests；
- `npm run test:protocol`：8/8；
- `npm run build`、`git diff --check`：通过；
- `NPM_CONFIG_CACHE=/private/tmp/context-compiler-ds10-npm-cache npm pack --json`：真实 50-entry tarball，SHA-1 `f20e56e75c6b6aa9d7362627101771a6c2ca4510`，不含 evaluation/docs/test。

系统默认 npm cache 有历史 root-owned file，第一次 pack 因 EPERM 未产生 tarball；Builder 未修改该目录，改用任务专用 `/private/tmp` cache 后真实 pack 通过。该环境问题不影响仓库或 package 内容。

## 独立 QA 必查

- 固定 Builder candidate、父提交、main/clean；确认 diff 没有 promotion payload、`src/`、package/runtime/provider/host 修改；
- 从 canonical promotion 独立重算 83/75/499、每案第一个 technically mature slice、terminal 与固定 12-slice 顺序；
- 人工逐案质疑 `task_dependency_fact_ids`：是否真的影响 Current Task，是否漏了更早合格 slice；
- 对 8 Probe 独立核对 raw/Oracle exact anchor、Fact provenance、D1-window 外位置、最新/Current Task 排除、语义方向一致；重点攻击 Oracle-only/raw-only/过短/标点/同词反义与 code exception；
- 人工审查 42 required / 16 forbidden 是否只引用当时 active facts，是否存在 future leakage、把后续 outcome 写入早期 slice、把合理不同方案错误列为 forbidden，或漏掉会改变决策的 Critical Miss；
- 重放 coordinated canonical-data/protocol rewrite、inventory/hash 自举、unknown/path/order/status/symlink 与 Unicode format/control 攻击；
- 确认真实 evaluator v2 只静态 parse 12 cases / 101 turns，没有 runner、model/provider/network 或效果输出；
- 运行聚焦、全量、protocol、build、diff check 与隔离 pack。

实现者不批准本工单。即使 QA PASS，也只接受 `protocol_canary_not_frozen`；下一步仍需单独工单原子 freeze data+protocol、追加 pre-run contamination rescan，并预注册 GPT-5.6-terra non-sol 的版本、prompt、sampling、condition order/blinding、capture 与 repetition strategy，才能授权首次模型调用。
