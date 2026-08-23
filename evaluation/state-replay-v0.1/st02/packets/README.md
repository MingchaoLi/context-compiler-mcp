# ST-02 packets

本目录预留给独立 Run-Gate QA 接受后的一次 official run packet。当前 Builder 只实现 source-only packet runtime；尚未落盘任何 packet，也没有调用模型。

packet 只能包含上一步 Predicted Typed State、当前一个 standardized Raw Event、`recent_context: []`、`newest_events: [current]` 以及由真实 `StrictStateExtractor` 生成的 prompt。不得包含 Gold、未来事件或旧 raw history。
