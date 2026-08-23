# ST-02 packets

本目录保存独立 Run-Gate re-QA 接受且经主控明确授权后，唯一一次 official run 的 30 个 source-only packet。每个 packet 都在对应 fresh session 前由既有 capture prefix 从空状态机械重放生成，并在落盘后由下一次 source-only replay 验证。

packet 只能包含上一步 Predicted Typed State、当前一个 standardized Raw Event、`recent_context: []`、`newest_events: [current]` 以及由真实 `StrictStateExtractor` 生成的 prompt。不得包含 Gold、未来事件或旧 raw history。

本目录不包含 matcher、Gold 映射或评分。official response 位于物理分离的 `capture/responses/`；此次运行 0 retry、0 best-of、0 follow-up。
