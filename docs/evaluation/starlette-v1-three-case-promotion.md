# Starlette v1 三案 promotion audit 报告

日期：2026-08-23

结论：**Builder 已完成 DS-05 candidate，等待新的独立 data QA；当前只是三案 promotion 候选，不是六案 freeze、evaluation ready 或 D2 效果证据。**

## 固定边界

- 正式注册顺序仍为 STR-07/08/05/06/01/04；本工单只处理已接受的 STR-08/05/04，剩余 STR-07/06/01 不变；
- 全六案共同 `evidence_cutoff_at` 固定为 `2026-08-23T03:00:00Z`；本次公开检索的 `scan_observed_at` 为 `2026-08-23T04:20:54Z`，两者独立记录；
- collection 状态固定为 `promotion_candidate_not_frozen`，并明确 `evaluation_ready: false`、`model_run_authorized: false`；
- 没有制作 STR-06，没有映射 Probe/critical miss，没有运行 D0/D1/D2、远端模型、aggregate 或 PASS rate。

## Promotion 结果

STR-08、STR-05、STR-04 各自的 `manifest`、events、tasks、Fact Gold、Oracle-State、Decision Reference 与 Outcome Anchor 共 21 个文件，从已独立接受的 pilot/canary 目录复制到 `promotion/cases/`。逐文件 diff 全部为 `byte_identical_relocation`，旧、新 SHA-256 完全一致；旧 fixture 与旧 hash 没有修改。

promotion metadata 另行保存 collection、污染快照、source re-audit、逐文件 diff 和 25 项 promotion hash。旧 `pilot_not_frozen` / `canary_not_frozen` manifest 保持原字节；`promoted_not_frozen` 只由新 collection manifest 表达，不伪装为 frozen。

## 来源复核

通过公开 GitHub REST 重新检查三案登记的 31 个 evidence event：database id、node id、actor、发生时间和内容 SHA-256 均匹配 accepted fixture，不需要改变语义 payload。

其中 3 个 PR review 对象没有 `updated_at` 字段；复核改用 `submitted_at`、database/node id、actor 与正文 SHA-256，分别为 STR-05/E8、STR-04/E6、STR-04/E12。3 个 state event 继续用 canonical state hash 复核。可变 Issue/PR body 的当前 hash 与 `updated_at` 虽匹配，但仍只代表当前观察，不能当作创建时正文快照。

## 污染扫描

版本化 snapshot 按同一 `starlette-contamination-rule/v1` 覆盖固定六案全部 source number；本次未发现满足规则的新 confirmed task-level reuse。STR-04 的 RAGAS 命中继续分类为与任务、Gold 和答案无关的 context-only retrieval noise；普通 release note、下游说明和 Starlette 自身测试引用也不计入 evaluation reuse。

该结论有明确限制：GitHub code-search API 需要有效认证，公开 code-search UI 需要登录，本次只能补充 exact-path web-index 检索；因此 `no_public_hit_found` 只表示截至本次观察时间的有限结论，不能证明公开网络或训练数据绝对无污染。六案最终 freeze 和首次模型调用前仍必须分别追加全集合 snapshot，不得覆盖本次记录。

## 可执行验证

`validate-promotion.mjs` 从文件系统重建并验证固定集合、时间、21 项 byte-identical diff、25 项 promotion hash、accepted bundle hash、污染快照和来源复核边界。首次独立 QA 发现 accepted fixture、promotion 副本与所有可重算 hash 可以被协调改写；追加修复已在验证器代码内固定 accepted candidate `32600eb6...` 的 21 项路径、顺序与 SHA-256，不再允许被验证数据自举改写该合同，并加入完整协调重写反例。`validate-promotion-wiring.ts` 直接导入真实 evaluator v2 parser，使用 promotion 副本重建 DS-04 的 31 个 slice / 226 个投影 history turn；没有开放 parser 注入，也没有调用 evaluation runner 或模型。

Builder 自检结果：

- promotion 聚焦测试：11/11；
- 全量单元测试：14 files / 294 tests；
- 协议测试：8/8；
- build 与 `git diff --check`：通过；
- 真实 `npm pack --dry-run --json`：50 个发布文件，Starlette promotion、evaluation fixture 与验证脚本均未进入 tarball。

这些结果只能证明 promotion 复制、审计元数据和 parser 接线一致。独立 QA PASS 前不得接受 DS-05；PASS 后也只允许另开 STR-06 source/Gold checkpoint。
