# State Compiler v0.1 时间回放

本目录属于 WO-DS-14，只验证：

`Raw Event → Extractor → Strict Delta → Deterministic Reducer → Typed Active State`

`source/` 保存从已接受 Starlette promotion 投影出的三个完整轨迹、30 个时间事件及来源锚点；`gold/` 保存人工编写的严格 Delta、语义状态注册表与每步 Expected State；`st01/` 保存零模型 reducer conformance；`st02/` 只有 ST-01 独立 QA 通过后才能创建。

事件内容是此前 Data QA 接受的、带原来源正文 hash 的标准化人工摘要。它属于真实仓库事件的 evidence projection，不等同于 GitHub 原始正文；因此 ST-02 只能称为 standardized-event-summary → Delta replay。

旧 `evaluation/starlette-v1/results/feasibility-01/` 已直接封存。它只代表人工 Oracle-State 的可行性 baseline，回答语义收益保持未评估；本目录不会重跑或修改它。

这里不实现 PACE、Evidence Paging、Experience、embedding、semantic retrieval 或最终回答质量评测，也不运行 D0/D1/D2 evaluator。

Gold State 是独立列举的预期语义状态，不在验证时从 Gold Delta 现场生成。运行器仅把 stable symbolic key 映射到 SQLite runtime id，并忽略 UUID 与墙钟时间后比较 canonical state。
