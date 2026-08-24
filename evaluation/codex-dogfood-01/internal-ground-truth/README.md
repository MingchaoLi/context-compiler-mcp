# Codex Dogfood-01 C / Ground Truth 冻结说明

这里保存 WO-DG-01 的 C 路径。C 是从固定 baseline Git object `b7f00cefe809b1ffe9fac7d5e7885f7a7fdec8ed` 的权威文档、最终 WO-V0-15 QA / AR 与必要 MCP service 源码人工整理并确定性校验的冻结事实，不来自任何模型回答。

冻结者没有看见、索取、读取或创建 A/B capture，也没有运行模型。`P01` 至 `P12` 是一个固定复合请求内的 12 个非独立 assertions；统计时样本数是 1，不是 12。

文件职责：

- `../protocol/composite-request.json`：唯一固定复合请求和 P01–P12 顺序。
- `ground-truth.json`：每项的 critical 标记、required assertion groups、forbidden claims、canonical answer，以及 baseline commit / path / blob SHA / provenance。
- `validate-ground-truth.mjs`：拒绝未知文件与字段、路径或顺序漂移、hash 漂移、重复 JSON 表示、symlink 和非 NFC 文本；并直接从固定 Git object 重建 source blob SHA。它不读取 capture，也不评分或运行模型。
- `hash-manifest.json`：冻结 payload 与 validator 的 SHA-256；manifest 自身不自哈希，其完整性由 data-only commit SHA 外部锚定。

运行：

```sh
node evaluation/codex-dogfood-01/internal-ground-truth/validate-ground-truth.mjs
```

成功输出必须是 `PASS codex-dogfood-01 C ground truth freeze`。validator 仅接受仓库根目录内的精确路径，不跟随 symlink；source contract 固定在 validator 代码常量中，并通过 `git show <baseline>:<path>` 读取 bytes 后按 Git blob 格式重算 SHA-1，不能由当前工作树文档或 C 数据自证。
