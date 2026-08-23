# Starlette v1 schema pilot

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
- `STR-05`：一个 medium segment；
- `STR-02`：经证据审计拆为 `STR-02A` 与 `STR-02B`，任何 slice 都不得跨 segment；
- `pilot-hashes.json` 只证明 hash/freeze 机制可工作，状态固定为 `pilot_not_frozen`；
- `contamination-scan.json` 对 15 条候选使用同一规则，`no_public_hit_found` 不代表绝对无污染。

公开 Issue/PR body 可能在创建后被编辑，而 GitHub 常规 API 不提供完整历史正文。事件同时保存 `source_updated_at` 与当前正文 SHA-256；该 digest 只用于发现当前来源继续变化，不代表创建时正文快照。对于 `source_updated_at > occurred_at` 的 body event，summary 仅采用 GitHub timeline 可核对的创建时标题；后续正文、diff、测试和 merge 信息必须等到 timestamped comment、review 或 Outcome Anchor 才能出现。

## 校验

```bash
node evaluation/starlette-v1/validate-pilot.mjs
```

校验器严格拒绝未知字段、重复/跨 segment 引用、`event_type`/`source.kind` 错配、`source_updated_at < occurred_at`、时间逆序、非前缀 evidence、未来 Gold/Oracle provenance、Current Task 规范化包含任意时点 Gold、Outcome 内容/标识或 cutoff 后 Decision Reference，以及 hash 篡改。
