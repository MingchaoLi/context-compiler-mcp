# ST-02 capture

本目录保存主控在独立 Run-Gate re-QA 接受后明确授权的唯一一次 30-step official capture。运行已完成，但仍未评分：状态为 `OFFICIAL CAPTURED UNSCORED — SCORER PENDING`。

- `responses/<packet_id>.json`：逐字符保留 fresh extraction agent 的 final payload；
- `metadata/<packet_id>.json`：固定 packet/order/model/hash、UTC 时间与 transport 状态；
- `session-ledger.jsonl`：30 个唯一 collaboration task/session 身份及 0 retry 记录；
- `run-manifest.json`：授权来源、期望/实际数量、禁止边界和机械汇总；
- `source-only-replay.json`：现有 `StrictStateExtractor(maxAttempts:1)` 与同一 reducer 对 30 条 raw response 的零 Gold、零评分重放观测。

本次 30 个 transport 均完成，未重试、未人工修补。source-only 重放机械观察为 18 条 strict parse accepted、12 条 `INVALID_SCHEMA` 并 empty-delta fallback、0 reducer rejection；三条轨迹最终 revision 都保持 0。该结果不是 Gold 对比、Extractor correctness、语义收益或架构胜负结论。
