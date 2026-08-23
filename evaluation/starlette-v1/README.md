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
