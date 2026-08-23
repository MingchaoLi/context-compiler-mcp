# Starlette v1 无模型接线冒烟报告

日期：2026-08-23

结论：**Builder 已完成 DS-04 candidate，等待新的独立 QA；这不是数据集 freeze，也不是 D2 效果证据。**

## 验证结果

- 正式六案索引固定为 STR-07/08/05/06/01/04，禁止依据 dry-run、D0/D1/D2 或模型结果换案；
- 预计分层明确不是配额；STR-01/06/07 后续可按真实信息增量透明改层，但不能换案或少计；
- 冒烟子集固定为已接受但未冻结的 STR-08、STR-05、STR-04；
- 三案共 31 个真实 slice 全部且只映射一次；累计投影 226 个历史 turn；
- 每个 slice 的 exact evidence prefix、Current Task、`recent_raw_window_turns` 与对应 Oracle-State 被确定性组装为 evaluator v2 case；
- 全部 31 个单 case 和完整 suite 均通过 `parseEvaluationSuiteV2`；
- 既有 evaluator 输入/报告版本保持 `2`；没有调用 `runEvaluationSuiteV2`，没有创建临时数据库或运行远端模型。

严格解析成功后的结构摘要为：

```json
{
  "schema_version": "starlette-wiring-smoke-report/v1",
  "status": "wiring_compatible",
  "collection_status": "planned_not_frozen",
  "evaluator_input_version": 2,
  "evaluator_report_version": 2,
  "registered_case_count": 6,
  "smoke_case_count": 3,
  "evaluator_case_count": 31,
  "projected_history_turn_count": 226,
  "model_call_count": 0,
  "evaluation_run_count": 0,
  "effect_metrics_generated": false
}
```

构造函数本身不返回 `wiring_compatible`；该状态只在 collection plan、accepted fixture/hash、确定性映射、evaluator v2 版本和严格 parser 全部核对后产生。接线校验还会先向 parser 注入一个未知字段反例；只有收到 `INVALID_INPUT` 且有效 suite 原样解析，才接受该回调，普通 no-op/宽松 parser 不能制造兼容状态。

## 映射边界

每个 `RawEvent.content` 是既有 `projectModelInput` 六字段的稳定 JSON：`id`、`role`、`event_type`、`occurred_at`、`actor`、`summary`。其余 raw 字段只由这些投影字段和当前 task 的 segment 确定性派生：连续 `seq`、UTC 毫秒时间、字符数除四 token 估计、稳定 `source_event_id`，`metadata` 固定为空对象。

Fact Gold、Decision Reference、Outcome Anchor、GitHub source/node/database id、URL、body/hash、`source_updated_at` 和审计说明不进入 raw/current input。Oracle-State 只进入 evaluator 的 `context_items` / `state_relations`，并将时间规范化为 evaluator 要求的 UTC 毫秒格式；所有 `source_refs` 仍必须指向该 slice 可见的 raw event。

空 Probe 和全零 threshold 只是 `parseEvaluationSuiteV2` 所需的 parser-only 占位输入。它们没有被执行，不表示成功样本，也没有产生 `not_evaluable` aggregate、threshold failure 或 `passed`。

## 反例

聚焦测试证明以下变化会在执行前被拒绝：

- 改换六案 id、调换顺序或把 `planned_not_frozen` 改成 frozen；
- 删除早期 slice 中间 event，使 exact prefix 不再匹配；
- 把 Oracle `source_refs` 指向当前 slice 不可见的 event；
- evaluator v2 报告版本不再是 `2`。
- parser 回调是 no-op 或接受未知字段。

测试同时逐项确认 raw content 恰好只有六个投影字段，结构摘要不含 `passed`、`aggregate` 或 `threshold_failures`。

## 能证明与不能证明的事项

本冒烟能证明当前 pilot/canary 两种目录布局可以在不改 core 的情况下进入 evaluator v2 严格输入合同；它降低的是完成其余三案后才发现接线缺口的风险。

它不能证明：

- STR-04/05/08 已正式冻结；
- STR-01/06/07 的真实 tier 或 schema 兼容性；
- Oracle-State 等于运行时 extractor 产物；
- Probe/Gold/critical miss 的最终评价映射已经完成；
- D2 相比 D1 有效果、成本合理或达到任何决策门。

下一步仍需新的独立 QA。只有 QA PASS，才允许另开共同 cutoff 的 promotion/freeze 工单。
