# Starlette v1 schema 与三案例 pilot

日期：2026-08-23

工单：`WO-DS-02`

状态：实现完成，等待独立 data QA

## 结论

本工单建立了一把可机械审计的“数据尺子”，没有运行 D0/D1/D2 或远端回答模型，也没有修改 Context Compiler core。

三个 pilot 目录包含 25 个原子 evidence event 与 25 个同 cutoff slice。`STR-08` 为 short；`STR-05` 最初标为 medium，后由 WO-DS-03 按 9 个真实信息增量更正为 long；原 `STR-02` 复合候选被拆成两个 medium segment。所有模型可见输入只来自 `events.json` 与 `tasks.json`，Fact Gold、人工 Oracle-State、Decision Reference、Outcome Anchor 均在独立文件中。

## D1 映射确认

现有 evaluator 的 D1 从倒数第 N 个 `user` event 开始取完整后缀。pilot 固定为：

1. 一个纳入的原子 GitHub 事件映射为一个 `user` evidence event；
2. 不生成合成 assistant turn；
3. Current Task 独立于历史；
4. 每个 slice 的 `available_event_ids` 必须等于所属 segment 从 E1 到 cutoff 的完整前缀；
5. `recent_raw_window_turns` 因而精确表示 D1 最近 N 个完整 evidence event。

实际语义与预注册映射一致，没有修改 evaluator。

## STR-02 边界判定

判定：`split_required`。

- `STR-02A`：Issue #919 到 PR #1715，关注 background task 完成时序、StreamingResponse/evaluated-response 冲突，以及以 disconnect + stream close 替换 cancellation；5 个信息增量节点，medium。
- `STR-02B`：Issue #2516 到 PR #2620，关注 client-disconnect race、四层 middleware 复现、被否决的首个修复方案与最终 non-polling 实现；7 个信息增量节点，medium。

#2516 的确把 #1715 称为“supposedly fixed”，但这只能证明历史依赖，不能证明相同根因。两段的现象、复现条件、失败方案和修复边界不同；把它们合并会让早期 slice 承担后期才出现的根因解释。只有 immutable patch/test 分析能证明一个因果缺陷同时解释两段时，才可推翻本次拆分。

## 文件隔离

每个目录固定包含：

- `manifest.json`：source、排除理由、segment 与输入边界；
- `events.json`：模型可见的时间有序 evidence；
- `tasks.json`：模型可见的 Current Task 与 cutoff；
- `fact-gold.json`：事实、首次可知时间、supersession 与 provenance；
- `oracle-state.json`：人工 typed-state 上界，显式 `mode: oracle`；
- `decision-references.json`：真实后续动作，不定义唯一正确答案；
- `outcome-anchors.json`：merge、test 或关闭结果。

Outcome 与 Decision Reference 不进入输入。PR/Issue 当前正文可能在创建后编辑，GitHub 常规 API 不提供完整历史正文；因此保存当前正文 digest 与更新时间，但 digest 只负责检测当前来源继续变化，不冒充创建时正文快照。

首次 data QA 后对全部 `source_updated_at > occurred_at` 的 body event 重新执行了标题历史审计：#1083、#1683、#2516、#2519、#2620 没有 rename event；#1298、#1377、#919、#1715 的 GitHub timeline 明确保存了旧标题与改名时间。早期 summary 已限制为创建时标题能够证明的事实；当前 body、当前 changed-files、后加测试与 merge 结果均不得反向进入该 cutoff。尤其 `STR-02A/E4` 不再包含 PR #1715 后加的测试信息。

## Contamination 扫描

统一规则只把明确的 LLM、agent、benchmark、code-repair 或 eval task 复用记为 `confirmed`；普通下游引用、vendored source、生产 workaround 与只含可疑关键词的仓库名不算。

| 候选 | 结果 | 直接原因 |
|---|---|---|
| STR-01 | no_public_hit_found | 可疑 notebook 只是无关应用源码中的普通引用 |
| STR-02 | confirmed | TeamBench 复用 #919；repo-issue-intelligence / LLM-J 复用 #2516 链 |
| STR-03 | confirmed | knowledge-way 与 repo-issue-intelligence 明确复用 #2019 |
| STR-04 | no_public_hit_found | 无公开评测语义命中 |
| STR-05 | no_public_hit_found | 无索引命中 |
| STR-06 | no_public_hit_found | 大量命中来自带原注释的 vendored/copied source，未证明 task 复用 |
| STR-07 | no_public_hit_found | 无索引命中 |
| STR-08 | no_public_hit_found | 无索引命中 |
| STR-09 | no_public_hit_found | 命中均为普通下游 workaround |
| STR-10 | no_public_hit_found | 单个普通下游引用 |
| STR-11 | confirmed | knowledge-way、SWE-bench-Live、LLM-J 复用 #2625/#2812/#2893 链 |
| STR-12 | confirmed | knowledge-way 明确复用 #1724 |
| STR-13 | no_public_hit_found | 普通下游 CORS 引用 |
| STR-14 | no_public_hit_found | 无索引命中 |
| STR-15 | confirmed | LLM-CR-EVAL 与 LLM-J 复用 Range 任务 |

完整查询模式、直接 URL 和限制见 `evaluation/starlette-v1/contamination-scan.json`。结果只表示 2026-08-23 的公开 GitHub 扫描状态。

## 对正式 freeze 的影响

原推荐集中的 `STR-02`、`STR-03` 现在必须排除盲评。未确认污染且仍满足原候选证据门槛的最小 6 条恰好是：

- short：STR-07、STR-08；
- medium：STR-05、STR-06；
- long：STR-01、STR-04。

这只是下一工单输入，尚未冻结。删除由本工单预注册的统一污染规则触发，发生在任何 D2/model 输出之前，不是按模型表现换样。

## Selection bias 与 future leakage

1. 三案例 pilot 中最复杂的 STR-02 已确认污染，因此只校准 schema，不得转化为 D2 效果样本。
2. 正式最小集只剩两条 long，缺少额外 long holdout；报告必须披露它是 purposeful sample，不是 Starlette 缺陷的统计样本。
3. `STR-05` 的第一次 merge 是可被后续推翻的 anchor，不能当最终成功；第二次 merge 也只证明仓库接受与测试存在。
4. `STR-08` 的关闭只支持“无需代码变更”，不能伪造 regression test。
5. `STR-02A` 的 outcome 不进入 `STR-02B` 输入；后者只能依赖自己 Issue body 对旧 PR 的公开引用。
6. 当前 GitHub body digest 不是历史正文快照。若 summary 无法由 timestamped comment、状态或 immutable commit 交叉核对，应删除该节点，而不是推断原文。

## 后续门禁更新（2026-08-23）

WO-DS-03 的机械信息增量审计确认 STR-05 的 9 个事件都应计数，因此实际属于 long，旧“2/2/2”不能再作为当前 freeze 输入。一次同日扫描还发现 PR #2349 进入公开 RAGAS retrieved context；独立 QA 查明该任务 reference 是 FastAPI PR #15745，#2349 只是未被答案使用的 context-only 噪声，故 STR-04 仍为有限的 `no_public_hit_found`。详见 `starlette-v1-long-canary-gate.md` 与 DS-03 QA 报告。

## 机械验证

`validate-pilot.mjs` 严格检查 envelope、未知字段、重复 id、segment 前缀、event/source 类型绑定、source 更新时间下界、时间顺序、完整 evidence 前缀、Gold/Oracle provenance、supersession、Current Task 对任意时点 Gold、Outcome summary/标识与 cutoff 后 Decision Reference 的规范化包含，以及 SHA-256。

第二次 data QA 进一步发现 U+200B 可替换单词空格绕过普通 whitespace 规范化。修复后的比较会先移除 Unicode format/control 字符，再同时比较标准词边界和去空白压缩形式；U+200B、U+2060 与 bidi embedding/control 的视觉等价复述均有独立反例。

pilot hash 状态明确为 `pilot_not_frozen`。它只证明冻结机制可工作；独立 data QA 通过后，仍需新工单重新核查并冻结正式六案。
