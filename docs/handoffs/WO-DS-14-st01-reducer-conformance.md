# WO-DS-14 / ST-01 交接 — Reducer Conformance

日期：2026-08-23

状态：**REIMPLEMENTED — PENDING INDEPENDENT RE-QA; ST-02 NOT AUTHORIZED**

## 单一交付结果

本阶段把三个 Starlette 轨迹的全部 30 个已接受标准化事件摘要整理为时间 Event Stream，并以人工 Gold Delta 与独立 Expected State checkpoint ledger 驱动现有 strict parser、SQLite state store 与同一 deterministic reducer。没有调用模型、provider、network、D0/D1/D2 evaluator 或 assembler，也没有修改 `src/`、MCP/package surface、PACE/Evidence/Experience 范围。

旧 `feasibility-01` 已通过固定 DS-13 Git-object validator 直接封存：没有重跑或修改 official artifact/capture，也不再等待或填写双真人盲评；其回答语义收益保持 `not_evaluated`。

## 对抗审查导致的设计修订

最初工单只选 17 个 transition-rich 事件。预实现对抗审查指出它跳过 STR-06 首次 close 与 reopen、强制每步 non-empty，可能把非单调历史压成容易轨迹。Builder 接受该挑战并在 data freeze 前修改为：

- STR-08 E1–E4、STR-07 E1–E10、STR-06 E1–E16，完整 30 事件；
- STR-06/E7 tracker close 与 E13 tracker reopen 是两个预注册 empty-delta true negative；
- empty Delta 必须保持 revision/state 不变，不能进入 transition 成功分子；
- Gate-0 为每个事件记录 expressibility、当前摘要 entailment、同事件引用限制与 Gold leakage 风险；
- 输入明确称为带原来源 hash 的标准化真实事件摘要，不冒充 verbatim GitHub body extraction。

首次独立 QA 返回后，修正后的数据与 Gold 已再次单独提交并固定为 Git object `79da83d95aeac7162c95714f4f6f5eff1f9e0608`，父为 QA 提交 `aeed861b3e3c538fbf6aa1393a5745fb4d61490b`。runner 在解析任何当前 fixture JSON 前读取该提交的 9 个固定 blobs，并要求当前字节一致；协调改写 Gold/checkpoint/hash 不能成为新的 trust root。

## 首次独立 QA 返回与修复

首次 QA 确认 reducer、strict schema、checkpoint、provenance、stale revision 与全部机械回放均通过，但拒绝接受 ST-01 的测量合同：3 条 `DEPENDS_ON` 因同一步新 item 无 runtime ID 而被延后写入后续 Delta，后续当前事件却不能直接支持这些关系，未来会把结构限制误记为 Extractor miss。

Builder 接受该 P1，并做最小数据修复：

- 删除 STR-07/E7 延后的 path-converter → URI-template 依赖，原始同事件关系明确列为 `not_evaluable`；
- 删除 STR-06/E8、E12、E16 中没有当前事件直接依据的 probe → non-security 依赖；
- 只保留 4 条当前事件直接支持的 `DEPENDS_ON`；
- Gate-0 为全部 4 条依赖冻结 step/event/source/target 与当前事件 lexical anchors；
- runner 要求 Gold 依赖与 justification 一一对应且锚点确实存在于同一步事件，focused test 覆盖错误事件与无依据锚点；
- checkpoint、coverage 与 Git-object trust anchor 同步人工重建，未修改 item、lifecycle 或其他 relation。

## ST-01 原始结果

- Gate-0：30/30 strict-expressible，6 个 same-step reference 限制显式披露；
- strict Gold Delta：30/30；其中 28 non-empty、2 empty true negative；
- Expected State checkpoint：30/30；
- fresh SQLite replay：2 次 canonical output 一致；
- created items：35；
- lifecycle transition 有当前事件 provenance：16；
- relation：DERIVED_FROM 53、SUPERSEDES 6、RESOLVED_BY 3、REJECTS 3、DEPENDS_ON 4；
- final lifecycle：3 completed goals、6 superseded decisions、7 resolved questions、4 rejected alternatives；
- stale expected revision：1/1 在 snapshot callback 与 mutation 前 fail-closed，revision/state 不变；
- canonical replay SHA-256：`9ba9f5c94c33d2a48a92478d907e4ba0bc455357ed4bc8f3fcd94c02bb0a1910`；
- model/provider/network/evaluator calls：全部 0。

零分母类别 `constraint_supersession`、`goal_supersession`、`open_question_defer`、`semantic_reactivation_operation` 以及 STR-07/E6 同事件新 item 依赖明确为 `not_evaluable`，未计入 ST-01 成功。E13 仍提供一个“tracker reopen 不应复制/激活已负向解决问题”的 ST-02 wrong-reactivation negative control，但当前 strict schema 没有直接 reactivation operation。

## 表达限制

strict delta 的新 item 没有调用方 ID；同一 delta 的其他 operation 只能引用前一步已有 item。因此：

- STR-08/E4 和 STR-07/E10 可同时创建终局 Decision 与 resolve 问题，但不能在同一步创建指向该新 Decision 的 `RESOLVED_BY`；Gold resolution 不伪造该 edge；
- 新 Decision 与新 Constraint 的同事件 `DEPENDS_ON` 只有在后续当前事件重新提供直接依据时才可延后；否则必须排除为 `not_evaluable`，不得计作后续 Extractor miss；
- 已有 item 的 lifecycle provenance 通过显式 `DERIVED_FROM current_event` 补全，store 同时追加 `source_refs`；
- STR-07/E9 与 STR-06/E16 使用前一步已有 active Decision，提供 3 个真实 `RESOLVED_BY` 正样本。

这些限制不影响当前 reducer conformance，但限制对 Extractor semantic recall 的解释，必须进入最终 challenge。

## 文件与运行

- source/Gold：`evaluation/state-replay-v0.1/source/`、`gold/`；
- runner：`evaluation/state-replay-v0.1/st01/replay.ts`；
- committed report：`evaluation/state-replay-v0.1/st01/report.json`；
- focused tests：`test/state-replay-st01.test.ts`；
- 手动只读重放：

```sh
env NODE_NO_WARNINGS=1 npx vite-node --script evaluation/state-replay-v0.1/st01/run-conformance.ts /path/to/context-compiler-mcp
```

## Builder 自检

- ST-01 focused：7/7 PASS；
- `npm test`：390 PASS / 1 个既有 opt-in official runner SKIP；
- `npm run test:protocol`：8/8 PASS；
- `npm run build`：PASS；
- `git diff --check`：PASS；
- 隔离 `/private/tmp` cache 的 `npm pack --dry-run --json --ignore-scripts`：50 files，SHA-1 `f20e56e75c6b6aa9d7362627101771a6c2ca4510`，不包含 `evaluation/`、`docs/` 或 `test/`；
- `src/`、retrieval/assembler、MCP、provider、host、PACE 范围：无改动；
- `st02_authorized:false`。

## 独立 QA 必查

- 固定 main/Builder candidate/父提交/clean，并确认修正后 data commit 精确为 `79da83d…`；
- 从 Git object 独立重建 9 个 source/Gold blobs 与三个 promotion `events.json` 来源；
- 逐项人工检查 30 个 Gate-0 entailment，尤其 E7/E13 empty、E4/E10 same-step limitation、E16 保留 cross-environment OPEN；
- 独立重放 4 条 dependency justification，确认每条仅由其同一步当前事件支持，且错误 event/anchor 必须拒绝；
- 不复用 Builder checkpoint 生成逻辑，独立重算 created/status/source_refs/relation/revision ledger；
- 原样重放 Gold/checkpoint/validator/hash 协调改写、future event、missing provenance、wrong endpoint/type、duplicate/omission/order/unknown/Unicode/symlink；
- 确认 empty delta 不变 revision/state、stale revision 在 callback/mutation 前拒绝；
- 运行 focused、全量、protocol、build、diff check 与隔离 pack；
- 确认没有模型/evaluator/network 调用，也没有触碰 `feasibility-01` official bytes。

QA PASS 只授权主控另行冻结 ST-02 run contract；QA 自身不得启动任何模型。Builder 不自批本 Gate。
