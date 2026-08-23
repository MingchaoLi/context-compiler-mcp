# Starlette v1 schema pilot 与 long/open canary

本目录是 `WO-DS-02` 的 schema 校准产物，不是最终冻结评估集，也不是 Context Compiler 效果证据。

## 输入边界

每个原子 GitHub evidence event 映射为一个 `user` 历史轮次；`Current Task` 是独立当前输入。后续 D1 必须沿用 evaluator 已有的“最近 N 个完整 user turn”语义，因此在这里等价为每个 segment 内最后 N 个完整 evidence event。

只有 `events.json` 和 `tasks.json` 可以生成模型输入。以下文件物理隔离且禁止进入 D0/D1/D2 输入：

- `fact-gold.json`：带 provenance 的时点事实；
- `oracle-state.json`：人工 typed-state 上界，不是 extractor 输出；
- `decision-references.json`：真实后续动作，但不定义唯一正确答案；
- `outcome-anchors.json`：最终 patch、test、merge 或关闭事件。

`manifest.json` 记录 source 纳入/排除、segment 边界和该隔离合同。

## Pilot 状态

- `STR-08`：一个 short segment；
- `STR-05`：最初标为 medium；WO-DS-03 按 9 个真实信息增量机械更正为 long；
- `STR-02`：经证据审计拆为 `STR-02A` 与 `STR-02B`，任何 slice 都不得跨 segment；
- `pilot-hashes.json` 只证明 hash/freeze 机制可工作，状态固定为 `pilot_not_frozen`；
- `contamination-scan.json` 对 15 条候选使用同一规则，`no_public_hit_found` 不代表绝对无污染。

WO-DS-03 另增加 `canary/STR-04`：一个 `canary_not_frozen` 的 long/open 候选，含 18 个 event、18 个 slice 和 18 个显式信息增量。它只用于证明 schema 能否承载 long/open 与部分交付边界，不是正式数据集。

每个 segment 的 `information_increment_event_ids` 必须是 `event_ids` 的有序子集。3–4 个为 short、5–8 个为 medium、9 个及以上为 long；单 segment 顶层 tier 必须与之相同，多 segment 才能使用 `boundary_audit`。

公开 Issue/PR body 可能在创建后被编辑，而 GitHub 常规 API 不提供完整历史正文。事件同时保存 `source_updated_at` 与当前正文 SHA-256；该 digest 只用于发现当前来源继续变化，不代表创建时正文快照。对于 `source_updated_at > occurred_at` 的 body event，summary 仅采用 GitHub timeline 可核对的创建时标题；后续正文、diff、测试和 merge 信息必须等到 timestamped comment、review 或 Outcome Anchor 才能出现。

## 校验

```bash
node evaluation/starlette-v1/validate-pilot.mjs
node evaluation/starlette-v1/validate-pilot.mjs --canary
```

校验器严格拒绝未知字段、重复/跨 segment 引用、`event_type`/`source.kind` 错配、`source_updated_at < occurred_at`、时间逆序、非前缀 evidence、未来 Gold/Oracle provenance、Current Task 规范化包含任意时点 Gold、Outcome 内容/标识或 cutoff 后 Decision Reference，以及 hash 篡改。内容规范化会移除 Unicode format/control 字符，并同时比较保留词边界与压缩词边界的形式，防止零宽字符、WORD JOINER 和 bidi control 绕过。

`projectModelInput(bundle, sliceId)` 是后续 evaluator 的字段级输入投影。输出的每个 history turn 只有 `id`、`role`、`event_type`、`occurred_at`、`actor`、`summary`，Current Task 单独输出；source metadata、hash 和四类非输入文件不会进入投影。该函数与 validator 不能机械判断语义同义泄漏，仍需独立人工审计。

## DS-04 无模型接线冒烟

`collection-plan.json` 预注册正式六案 STR-07/08/05/06/01/04，禁止按任何试运行结果换案；其中的 tier 只是预计或已审计但未冻结状态，不是配额。`wiring-smoke.mjs` 只使用已接受的 STR-08/05/04，把 31 个 slice 映射成 evaluator v2 parser 可消费的内存输入；`validate-wiring-smoke.ts` 直接静态导入真实 evaluator v2 parser 和版本常量，不允许调用方注入替代 parser。

冒烟不会调用 `runEvaluationSuiteV2` 或远端模型，也不会输出 token、retention、latency、aggregate 或 PASS rate。它只验证集合索引、字段白名单、时间前缀、Oracle provenance 和既有 evaluator v2 版本合同；不能作为正式 freeze 或 D2 效果证据。

## DS-05 三案 promotion audit

`promotion/` 固定全六案共同 `evidence_cutoff_at=2026-08-23T03:00:00Z`，并将已接受的 STR-08/05/04 共 21 个文件以 byte-identical relocation 复制为 promotion candidate。旧 pilot/canary 文件与 hash 保持不变；新 collection 只表达 `promotion_candidate_not_frozen` / `promoted_not_frozen`，并明确禁止 evaluation/model run。

版本化 contamination snapshot 使用同一规则覆盖六案全部 source number，`scan_observed_at` 与 evidence cutoff 独立；GitHub code search 的认证限制被保留，因此 `no_public_hit_found` 不是 absence proof。source re-audit 复核三案 31 个来源，3 个 PR review 只能以 `submitted_at` 与内容 hash 代替不可用的 `updated_at`，没有发现需要修改语义 payload 的反证。

```bash
node evaluation/starlette-v1/validate-promotion.mjs
npx vitest run test/starlette-promotion.test.ts
```

promotion 接线仍为 31 slices / 226 projected turns，并由真实 evaluator v2 parser 验证。独立 QA PASS 前该候选不接受；即使通过，也不表示六案 frozen、Probe/答案评价完成或可运行远端模型。

## DS-06 STR-06 source/Gold checkpoint

`checkpoint/STR-06/` 单独制作 Issue #1365、PR #1366/#1410 的 16 个真实增量与 16 个时间切片。机械分层结果为 long，纠正 survey 的预计 medium；该结果没有写回 DS-05 promotion collection，也没有为了保留预计分布删除事件。

`str06-checkpoint.json` 保持 `checkpoint_not_frozen`，并显式禁止 promotion、evaluation 与 model run。它引用 DS-05 已接受 contamination snapshot/hash；`str06-checkpoint-hashes.json` 只固定待独立 QA candidate 的 wrapper 与七文件，不是 accepted source 外部锚点。

```bash
node evaluation/starlette-v1/validate-str06-checkpoint.mjs
npx vitest run test/starlette-str06-checkpoint.test.ts
```

validator 额外固定三个 closed/reopened state canonical subset、16 个增量与 long tier、两次 merge 的 Outcome 上界，以及“无 repository regression test、无 Builder/QA FIPS replay、无跨环境证明”。每个 slice 继续只通过 `projectModelInput` 输出六字段历史；Gold、Oracle、Decision 与 Outcome 不进入模型输入。独立 Data QA PASS 前不接受该 checkpoint；PASS 后也不表示 STR-06 promoted/frozen 或可以运行 D0/D1/D2。

## DS-07 STR-07 source/Gold checkpoint

`checkpoint/STR-07/` 覆盖 Issue #1008 与 closed-unmerged PR #1010 的 10 个真实增量、10 个 slice 和 55 个投影历史 turn。逐事件审计把 survey 的预计 short 机械更正为 long；不为补 short/medium 配额删除 maintainer rejection、redirect/CORS、revert reconsideration 或两类 workaround。

`str07-checkpoint.json` 保持 `checkpoint_not_frozen`，显式禁止 promotion/evaluation/model run。validator 固定 10 个来源合同，并拒绝把 PR API 的 `merge_commit_sha` 当成 merged patch、把 PR 内测试当成 repository regression test、把 Issue close 当成所有用例解决，或把 URI templating/path converter/CORS/revert/dual route 等未来答案写进较早 Current Task。

```bash
node evaluation/starlette-v1/validate-str07-checkpoint.mjs
npx vitest run test/starlette-str07-checkpoint.test.ts
```

真实 evaluator v2 parser 只做 10 slices 的静态输入验证，不调用 runner 或模型。独立 Data QA PASS 前不接受该 checkpoint；PASS 后仍不表示 STR-07 promoted/frozen、六案完整或可运行 D0/D1/D2。

## DS-08 STR-01 source/Gold checkpoint

`checkpoint/STR-01/` 覆盖 Issue #495、closed-unmerged PR #500 与 merged PR #1692 的 18 个真实增量、18 个 slice 和 171 个投影历史 turn。逐事件审计机械归为 long，并严格分离 broad scope-cache 被 punt、streaming constraint、body/form cache 差异、receive queue hang、`call_next` 窄化、明确 non-goal、multi-chunk review bug、补测修正、approval、merge 与 tracker close。

`str01-checkpoint.json` 保持 `checkpoint_not_frozen`，显式禁止 promotion/evaluation/model run。validator 固定 18 个 source contract 与 3 个 canonical timeline hash，并拒绝把 PR #500 当 merged/delivered、把 PR #1692 当 general replay、把 current PR body/title/force-push 结果回填创建切片、把 approval 当 merge，或把 Issue close 当所有 ownership 场景解决。

```bash
node evaluation/starlette-v1/validate-str01-checkpoint.mjs evaluation/starlette-v1
npx vitest run test/starlette-str01-checkpoint.test.ts
```

真实 evaluator v2 parser 只做 18 slices 的静态输入验证，不调用 runner 或模型。独立 Data QA PASS 前不接受该 checkpoint；PASS 后仍不表示 STR-01 promoted/frozen、六案完整或可运行 D0/D1/D2。

## DS-09 六案 canonical-data promotion candidate

`six-case-preflight.ts` 先以旧三案 promotion 与三个 accepted checkpoint 做不落盘全集预检：固定顺序 STR-07/08/05/06/01/04，共 75 slices、588 个 projected history turn，由真实 evaluator v2 parser 静态解析，runner/model/effect metrics 均为 0。preflight 通过后，STR-06/07/01 的 21 个文件才被逐字节复制到 `promotion/cases/`。

当前 promotion 目录包含六案 42 个普通文件；`promotion-diff.json` 的 42 项全部为 `byte_identical_relocation`。validator 在代码内分别固定 `32600eb6…`、`f4931ad…`、`8f51bf4…`、`454565b…` 的 accepted path/order/SHA，协调改 accepted source、checkpoint/pilot hash、副本、diff、collection 与 promotion hash 仍会拒绝。`source-acceptance-ledger.json` 只继承固定 Data-QA candidate，不冒充本次重新 live re-audit 75 个来源。

新的 `contamination-snapshot-freeze-candidate.json` 追加在 DS-05 snapshot 之后，保持旧 evidence cutoff，不覆盖旧文件。它覆盖六案，但公开索引与 GitHub code search 能力仍有限；`no_public_hit_found` 只表示本次 as-of 观察，首次模型调用前仍需 append-only rescan。

实际分布固定披露为 1 short / 0 medium / 5 long，slice 分布为 4 / 0 / 71；medium 是 `not_represented_not_evaluable`，禁止 tier-balanced 声明。collection 仍是 `promotion_candidate_not_frozen`，且 `evaluation_ready:false`、`model_run_authorized:false`。

```bash
node evaluation/starlette-v1/validate-promotion.mjs
npx vitest run test/starlette-six-case-preflight.test.ts test/starlette-promotion.test.ts
```

独立 Data QA PASS 也只接受 canonical-data freeze candidate，不等于正式 frozen、Probe/answer protocol 就绪或可运行 D0/D1/D2/远端模型。

## DS-10 预注册 protocol canary

`protocol-canary/` 在任何 evaluator/model 输出出现前固定第一版评价协议。`derive-eligibility.mjs` 从六案 promotion 数据确定性重建 83 facts、75 slices、499 个 fact-slice assignments；每案选择首个成熟历史依赖 slice 与 terminal，共 12 slices、101 个 projected history turns。

context Probe 只接受同时出现在 D1-window 外 raw event 与同 slice Oracle item、且不重复 Current Task/最新事件的共同 exact lexical anchor。当前只有 8 个 Probe 满足该合同；另有 19 个 task-dependency Fact 明确记为 `not_exactly_scorable` 并转入答案 checklist，不能计作 context miss。全部 `resolved_issues` Probe 固定为空，因为 evaluator v2 不能读取 Oracle item 的 `RESOLVED` 状态；该维度是 `not_evaluable_diagnostic_only`，overall `passed` 也不能作为条件优劣结论。

同一 protocol 同时预注册 42 个 required-answer item、16 个 forbidden-answer item 与 Critical-Miss 子集。未来答案允许语义改写，不要求复刻开发者回复；D0/D1/D2 标签必须对两名人工 reviewer 隐藏，分歧留痕并人工仲裁，不启用第二模型 judge。0 medium、case 内 slice 相关性与 exact-anchor 表示限制必须逐项披露，不生成综合加权分数。

```bash
node evaluation/starlette-v1/protocol-canary/validate-protocol-canary.mjs
npx vitest run test/starlette-protocol-canary.test.ts
```

当前状态仍为 `protocol_canary_not_frozen`；canonical data 仍是 `promotion_candidate_not_frozen`。validator 与 parser preflight 明确保持 evaluator/model run count 为 0，且 `formal_freeze_authorized:false`、`evaluation_ready:false`、`evaluator_run_authorized:false`、`model_run_authorized:false`。独立 QA PASS 后也需另开工单完成 data+protocol 原子 freeze、首次模型调用前追加污染复扫与运行参数预注册。
