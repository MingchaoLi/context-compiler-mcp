# WO-DS-14 / ST-01 独立 QA — Reducer Conformance

日期：2026-08-23

最终结论：**PASS — ST-01 仅此 Gate 已接受；ST-02 run contract 尚未冻结，模型仍未授权**

固定 re-QA Builder candidate：`826eb4760fe8df557a2aa7d07225bc1986579281`

固定修正后 data commit：`79da83d95aeac7162c95714f4f6f5eff1f9e0608`

首次 QA docs commit：`aeed861b3e3c538fbf6aa1393a5745fb4d61490b`

## 独立 re-QA 接受记录

首次 P1 已由两个 append-only 提交关闭。修正后的 Gold 不再把同一步新 item ID 限制伪装成后续事件的 dependency：STR-07/S7、STR-06/S8、STR-06/S16 中三条无当前事件依据的 `DEPENDS_ON` 已删除；Builder 额外删除 STR-06/S12 的 question → non-security relation 也是合理收缩，因为 E12 只确认 probe 错误与修改承诺，并不足以建立该依赖。

当前只保留四条 `DEPENDS_ON`。QA 独立将其 step/event、source/target 语义与 Current Raw Event 对齐，结果如下：

- STR-08/S3：lifespan question → same-loop constraint；E3 的 `blocking portal` 与 `client loop` 直接把启动/关闭方式连接到应用 loop 约束。
- STR-06/S6：FIPS-fix question → non-security ETag constraint；前态明确 ETag 不要求 security-grade hash，E6 当前 PR 又直接以 `usedforsecurity` + `hashlib.md5` 实现 compatibility path，二者共同支持该依赖。
- STR-06/S10：cross-environment question → explicit target test constraint；E10 明示 requested verification 仍 unavailable，直接支持该依赖继续成立。
- STR-06/S16：limited-scope decision → limited-evidence constraint；E16 明示 limited reporter evidence 且 `does not prove` current master / every FIPS environment。

四条 justification 与 Gold 关系一一对应、没有重复或漏项，所有预注册 anchors 均存在于同一步当前事件。独立攻击确认 wrong/delayed event、无依据 anchor、justification omission、duplicate 与 unknown field 全部拒绝；Gold/checkpoint/anchor 的协调字节改写仍会先在固定 Git-object boundary fail-closed。lexical anchor 只能防止时间错位，不能自行证明关系语义，因此本次接受仍依赖上述独立人工 source/target 审计，不能把 validator 当语义 oracle。

### re-QA 工程证据

- 身份：`main`、HEAD `826eb476…`、直接父 `79da83d…`、首次 QA `aeed861…` 在父链；开始及提交前工作树干净。
- Git objects：从修正后 data commit 独立重算 9 个固定 blob；SHA-256 与 runner 常量、当前 bytes 全部一致。三个 promotion `events.json` 仍锚定 `4b974538…`，SHA-256 为 STR-08 `63ddd24b…`、STR-07 `3997eb86…`、STR-06 `5c6987c0…`。
- 独立 ledger：30/30 created/status/source-ref/relation/revision 增量零差异；最终 revision 为 STR-08 = 4、STR-07 = 10、STR-06 = 14。28 个 non-empty 与 STR-06/E7、E13 两个 empty true negative 保持不变。
- reducer：30/30 strict Delta、30/30 checkpoint；2 次 fresh SQLite canonical replay 一致，SHA-256 `9ba9f5c94c33d2a48a92478d907e4ba0bc455357ed4bc8f3fcd94c02bb0a1910`。
- coverage：35 items；DERIVED_FROM 53、SUPERSEDES 6、RESOLVED_BY 3、REJECTS 3、DEPENDS_ON 4；3 completed goals、6 superseded decisions、7 resolved questions、4 rejected alternatives。
- lifecycle：E16 的 cross-environment question 保持 OPEN；E13 没有把已负向解决的 first-probe question 重新激活。same-event path-converter dependency 与四个其他零分母类别明确为 `not_evaluable`，不进入成功分子。
- stale revision：1/1 在 callback/mutation 前 fail-closed；state/revision 不变。
- focused：7/7 PASS；全量：390 PASS / 1 个既有 opt-in official runner SKIP；protocol：8/8 PASS；build 与 `git diff --check` PASS。
- 隔离真实 pack：50 files，SHA-1 `f20e56e75c6b6aa9d7362627101771a6c2ca4510`，不包含 `evaluation/`、`docs/` 或 `test/`。
- `feasibility-01` result/run 相对 DS-13 accepted commit 无字节差异；没有运行 official evaluator。model/provider/network/evaluator 调用均为 0。
- 环境：Darwin 25.5.0 arm64，Node.js 25.6.1，npm 11.9.0；Windows 与 exact Node.js 24 仍未单独复跑。

### 接受边界与下一步

本结论只接受 ST-01 的 standardized-event-summary + Gold Delta reducer conformance。它不接受 Extractor correctness、Context Reduction、Operational Stability、最终回答质量或架构胜负，也不证明 verbatim GitHub raw-body extraction。

ST-02 仍没有 run contract、packet、capture 或模型授权。下一步只能由后续 Builder 另行冻结 ST-02 run contract；QA 本轮没有创建 `st02/`、没有调用模型，也没有提前进入 PACE、Evidence Paging 或 Experience。

## 首次 QA 返回记录（保留）

固定 Builder candidate：`d3550bae18f7b2f1822c1c8bd6c1a78fe8fd1ea6`

固定父提交 / ST-01 data commit：`23b52e8b4ff92ea1966f16de793395950a443590`

## 结论摘要

Reducer conformance 的机械工程结果全部通过：30 个 Gold Delta 可被 strict parser 接受，30 个 reducer 输出与冻结 checkpoint ledger 一致，两次 fresh SQLite replay 确定性一致，empty Delta、stale revision、schema、provenance、关系端点和 Git-object seal 均未发现 reducer 实现缺陷。

但 Gate-0 人工语义审计发现一个 P1：三条 `DEPENDS_ON` 并非由其所在步骤的 Current Raw Event 支持，而是因为 strict delta 不能在同一步引用新 item，被人为顺延到后续事件。这样会把 schema 表达限制伪装成时间上的 Gold Delta，并在 ST-02 中对严格遵守 `Previous State + Current Raw Event` 的 Extractor 产生结构性误判。当前 Gold 不能作为 ST-02 run contract 的冻结依据，因此本轮不能接受 ST-01 Gate，也不得启动模型。

## 身份与范围

- QA 开始时分支为 `main`，HEAD、父提交均与交接固定值一致，工作树干净；候选提交后没有 source 修正提交。
- 完整读取根 `AGENTS.md`、`docs/PROJECT_STATE.md`、`docs/ROADMAP.md`、唯一当前工单和 Builder handoff。
- 候选相对 data commit 只新增 ST-01 runner/report/test/handoff，并改动工单状态；相对 DS-13 accepted commit 没有改动 `src/`、package surface、`feasibility-01` result/run bytes。
- 本 QA 没有创建 `st02/`，没有调用模型/provider/network/evaluator，也没有运行 official feasibility evaluator。

## 独立数据与 Git-object 复核

QA 没有复用 Builder 的 hash 报告作为结论，直接从 Git object 重算：

- data commit `23b52e8…` 的 parent 精确为 `a9536133fda43f0a40623d8f7a34da352e273dfc`；9 个冻结 blob 的 SHA-256 与 runner 固定常量逐项一致，当前 bytes 的 Git blob id 也逐项一致。
- promotion source commit `4b974538d76d0e0d8a5ac17c5662533b714ef00e` 中 STR-08 / STR-07 / STR-06 三个 `events.json` 的 SHA-256 分别为 `63ddd24b…`、`3997eb86…`、`5c6987c0…`，与 selection 及当前 bytes 一致。
- 30 个 Event Stream 记录是三个 promotion event 文件的完整、有序、字段受限投影；数量为 4 + 10 + 16，没有 omission 或重排。
- data commit 先于 runner candidate，runner 在解析当前 fixture JSON 前读取固定 Git object；`report.json` 不是 trust root，现场重放结果与其逐字段一致。
- `feasibility-01` result/run 相对 DS-13 accepted commit `86a56fd…` 无字节差异；现有 DS-13 Git-object validator 现场通过。该 baseline 仍只是 Oracle-State feasibility，answer semantic gain 为 `not_evaluated`。

## 独立 checkpoint ledger

QA 另行按 Delta 语义重算每步 created key、status transition、source-ref addition、automatic/explicit relation 与 revision，没有调用 Builder 的 `applyExpectedCheckpoint` 作为 expected 生成器：

- 30/30 ledger 与冻结 checkpoint 增量一致；
- 最终 revision：STR-08 = 4、STR-07 = 10、STR-06 = 14；
- 28 个 non-empty Delta 各增加一次 revision；STR-06/E7 与 STR-06/E13 两个 empty true negative 均不增加 revision、不改变 state；
- 累计 35 个 item；relation 为 DERIVED_FROM 53、SUPERSEDES 6、RESOLVED_BY 3、REJECTS 3、DEPENDS_ON 8；
- 最终 lifecycle 为 completed goal 3、superseded decision 6、resolved question 7、rejected alternative 4；
- E16 的 `s06_q_cross_environment` 仍为 OPEN，只追加 E16 provenance，没有被 tracker close 错误解决；E11 已负向解决的 first-probe question 在 E13 reopen 时也没有错误再激活。

这证明 checkpoint 与 reducer 机械一致，但不能消除下面的 Current Event entailment 缺陷。

## 阻塞缺陷

### P1 — 同一步引用限制被转换为无当前事件依据的延迟 Gold Delta

工单 Gate-0 要求每个 Gold 操作指出其由哪一句**当前事件摘要**支持；ST-02 又明确每步只给 Extractor `Previous Typed State + Current Raw Event`。当前 fixture 有三处不满足：

1. `STR-07/S7` 在 E7 新增 `s07_decision_path_converter DEPENDS_ON s07_constraint_uri_templates`。该关系由 E6 的“URI templating + path converter”支持；E7 只讨论 307 redirect、CORS、versioning 和 documentation。Gate-0 明写 E6 因 same-step ID 限制把关系延至 E7，但 E7 本身没有该证据。
2. `STR-06/S8` 在 E8 新增 `s06_decision_first_probe DEPENDS_ON s06_constraint_nonsecurity`。E8 只讨论 Python/RHEL backport、版本不确定性和 try/except；它既没有说明 ETag 的 non-security 约束，也没有说明 first probe 依赖该约束。并且 `usedforsecurity=True` capability probe 是否“依赖”non-security ETag 本身存在定义歧义。
3. `STR-06/S16` 新增 `s06_decision_second_probe DEPENDS_ON s06_constraint_nonsecurity`。E16 只记录 PR merge、有限单系统证据与跨环境不确定性；该 relation 实际依赖 E12/E14 的 probe 语义，而不是 E16 当前事件。E16 同时添加的 `s06_decision_limit_scope DEPENDS_ON s06_constraint_limited_evidence` 有当前事件支持，二者不能合并视为同一证据。

具体反例：Extractor 在 E6 正确创建 path-converter Decision 和 URI-template Constraint，但 strict delta 因没有调用方可用的新 item ID，不能同一步输出二者关系；到 E7，它忠实地只新增 redirect/CORS Constraint 与相关 OpenQuestion。当前 evaluator 会把这种行为记为 dependency miss，虽然 Extractor 没有遗漏 E7 的任何事实。该误差来自 Gold 时间定位，不是 Extractor 错误。

因此 `gate0.strict_expressible_count: 30` 与 `passed_with_declared_representation_limits` 不能直接授权 ST-02。披露限制降低了解释风险，但没有消除将其计入逐步 Gold 的测量偏差。

### 最小修复路径

不需要扩展 core schema，也不需要引入 PACE 或新能力。Builder 应 append-only 修复并重新冻结 source/Gold anchor：

- 将 STR-07 path-converter dependency 移到有当前确认依据的 E9，或从逐步 Gold 中排除并标记该 timing 为 `not_evaluable`；
- 删除 STR-06 first-probe → non-security 这条语义可疑且无 E8 依据的 relation；
- 将 STR-06 second-probe → non-security 移到明确描述 `usedforsecurity=True → False` patch 的 E14，或标记为 `not_evaluable`；
- 同步人工修改 checkpoint、coverage、Gate-0 和 data Git-object anchor；不得由 runner 自动重生 expected；
- 增加 focused 反例：凡 dependency 被放在后续事件，后续事件摘要必须包含预注册 lexical/人工 evidence justification，否则拒绝；
- 重新进行独立 ST-01 QA。仍有其他 dependency 正样本，所以无需为凑正分母保留这三条关系。

## 已接受的重点语义判断

- STR-06/E7：PR merge + tracker close 不等于经过目标 FIPS 验证；empty Delta 合理。
- STR-06/E13：tracker reopen 时相关 FIPS / corrected-probe question 已经 OPEN，负向解决的 first-probe question 不应重新激活；empty Delta 合理。
- STR-08/E4、STR-07/E10：同一步新建终局 Decision 无 runtime ID，因而 resolution 缺少 `RESOLVED_BY`；Gold 没有伪造 edge，且数据明确披露，作为当前 schema coverage 限制可接受。
- STR-06/E16：repository-fix goal 与两个具体修复问题可关闭，但跨 Python/RHEL/FIPS 环境验证问题继续 OPEN；checkpoint 正确保持该区分。
- `constraint_supersession`、`goal_supersession`、`open_question_defer`、`semantic_reactivation_operation` 均为零分母 `not_evaluable`，没有进入成功分子；未发现 vacuous pass。

## 攻击与工程验证

- fixed anchor：协调修改 Gold + checkpoint + hash、future provenance、missing lifecycle provenance、wrong endpoint/type、duplicate/omission/order、unknown field、Unicode control 和 symlink 都会在 Git-object boundary 或 strict parser/store 前 fail-closed；focused suite 的复制 fixture 攻击全部通过。
- stale revision：1/1 在 snapshot callback 和 mutation 前抛出 `StateRevisionConflictError`，revision/state 不变。
- fresh replay：2 次 canonical bytes 一致，SHA-256 为 `045b2fd7b7dbdcf2dab04387627de37c7f17d03b47bd15e6de3ca1cde31a5521`。
- focused：6/6 PASS。
- `npm test`：389 PASS / 1 个既有 opt-in official runner SKIP。
- `npm run test:protocol`：8/8 PASS，包括 production-only package MCP 验证。
- `npm run build`：PASS。
- `git diff --check`：PASS。
- 隔离真实 `npm pack --ignore-scripts`：50 files，SHA-1 `f20e56e75c6b6aa9d7362627101771a6c2ca4510`；不包含 `evaluation/`、`docs/` 或 `test/`。
- 环境：macOS / Darwin 25.5.0 arm64，Node.js 25.6.1，npm 11.9.0；未单独复跑 Windows 或 exact Node.js 24。

## Gate 状态

- ST-01 reducer implementation conformance：机械证据 PASS，但 fixture Gate-0 因上述 P1 **未接受**。
- ST-02 run contract：**NOT AUTHORIZED**。
- 模型、Extractor replay、Context Reduction、Operational Stability、PACE/Evidence/Experience：均未启动。
- `PROJECT_STATE`、`ROADMAP` 与工单状态保持 pending；本 QA 只提交本 docs-only FAIL 报告。
