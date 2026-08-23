# ST-02 capture

本目录当前没有 response 或模型 metadata。独立 Run-Gate QA 接受前不得创建 official capture。

未来每步 response 与 metadata 必须分别保存到 `responses/<packet_id>.json` 与 `metadata/<packet_id>.json`，并严格遵守 `contract/response-contract.json`。response 文件中的 `raw_response` 字符串原样保留 transport text，包括不能通过 strict parser 的文本；不得人工修复。
