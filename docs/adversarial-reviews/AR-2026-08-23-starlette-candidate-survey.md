# AR-2026-08-23 — Starlette 候选筛选后对抗审查

日期：2026-08-23

审查对象：WO-DS-01 候选报告提交 `78f2ff2ccefc869110916561112c4a6be9c2f383`

预注册提交：`d2224d91fe1910c03f136c9f54490eed6772915e`

审查方式：独立 reviewer 只读项目路由文档、候选报告及必要的 GitHub 主来源；未修改代码或文档。

## Verdict

`Agree with reservations`

候选报告足以进入小规模 schema/pilot 审计，但不足以直接把推荐 8 条全部规范化并冻结。最需要先处理 STR-02 复合链边界、STR-11 的去重理由，以及适用于全部候选的统一 contamination 规则。

## Facts

- 预注册提交是候选报告提交的直接父提交，相隔约 9 分 46 秒；预注册后的改动只涉及工单状态与交付链接，没有改评分、分层或排除条件。
- 预注册写明 ≥3 信息增量节点、稳定 provenance、可构造 Gold 和 3/5/9 节点分层，但“通常 ≥7”“尽量每层 ≥2”“实质同根因”等表述保留裁量空间。
- 候选报告的节点数仍是估计，没有列出逐节点稳定 id、时间戳与增量说明。
- STR-07/08 的公开来源表面满足至少 3 个真实信息增量；STR-08 的链包括初始误判、fixture/手工 lifecycle 方案、手工 hack 与最终发现 context manager。
- STR-02 不是任意拼接：[#1715](https://github.com/Kludex/starlette/pull/1715) 明确关联 #919；[#2516](https://github.com/Kludex/starlette/issues/2516) 又明确称 #1715 曾被认为解决相关问题。
- 但 #2516 的后续 race 证据涉及多层 middleware、client disconnect 与更晚的 `_CachedRequest`，不等同于 #919 最初的 background task 阻塞描述。
- STR-11 的公开链是 exception swallowing → #2812 → handled exception 被再次抛出 → #2911。公开来源只能证明它与 STR-02 同属 BaseHTTPMiddleware/background lifecycle，不能证明同根因。
- STR-15 contamination 证据充分：两个公开评测派生 PR 均直接关联 #950，标题和任务与 #2697 高度一致。
- 推荐集 4 条 long 都是 middleware 主题，2 条 medium 都是“修复→重开→再修复”，8 条中只有 STR-04 明确保留 open。

## Inferences

- Git 历史证明规则先于最终报告提交，但不到十分钟的间隔、缺少检索 universe/query log 和可裁量条款，不能证明研究发现过程真正受预注册约束。
- 8 条目前只具有可构造 plausibility；逐节点 manifest、Gold 与分层仍需要下一工单验证。
- STR-02 可以作为“旧修复边界被新证据挑战”的复合轨迹，但不能在 manifest 审计前称为单一根因 long 链。
- STR-11 可以因组件配额降为 reserve，不能沿用“同根因重复”的理由。
- STR-15 应排除，但 contamination 不在原预注册排除条件中，属于合理的事后方法修正；必须统一扫描全部 15 条。
- 当前集合适合作为 continuity stress test，不是 Starlette 问题的无偏样本。组件、长度与 resolved outcome 仍可能共同有利于 D2。

## Strongest challenge

1. **预注册时间顺序成立，实质约束力未被证明。** 高分 STR-11/15 仍被裁量或规则外理由覆盖，评分不是机械选择器。
2. **STR-02 的 long 分类与 STR-11 去重理由需要重审。** #919→#1715→#2516 有公开引用桥，但未证明根因相同；STR-11 是独立 exception-propagation 回归链，只能以组件过采样解释 reserve。
3. **推荐集仍偏向 D2，且 contamination 尚未统一处理。** 四条 long 全为 middleware，两条 medium 都是 reopen/refix；两条 short 是有价值的负控制，但不足以消除总体结构偏差。

## Cheaper path

先不批量规范化 8 条。用同一 schema 只制作三个哨兵 pilot：

- STR-08：验证 short、D1 应足够和“停止实现”Gold；
- STR-05：验证 reopen/refix 与 Outcome Anchor 物理隔离；
- STR-02：强制列出所有纳入/排除事件，再判断保持复合链还是拆分。

pilot 后由独立 reviewer 只看 node manifest 重新评分全部 15 条，并统一执行 contamination 扫描。如果 schema 无需修改且 Gold/provenance 一致，再先冻结最低 6 条（2 short / 2 medium / 2 long）；额外两条 long 作为扩展或 holdout。

## Falsification

- 可推翻 Builder：独立盲评无法复现推荐；STR-02 拆分后任一子链不足 9 个增量节点；推荐案例无法形成 ≥3 个带时间戳节点或可审计 Gold；统一扫描发现其他推荐项已进入公开 benchmark；结果主要由 middleware/closed 状态解释。
- 可推翻本审查保留：独立 reviewer 在固定 manifest 上高度一致地复现选择；STR-02 能列出 ≥9 个因果连续节点；STR-11 出现直接同根因证据，或明确仅按组件配额处理；统一扫描无其他命中；三案例 pilot 无需修改 schema 且 Gold/provenance 一致。

## 主控处置

接受保留意见，不重开 WO-DS-01，也不修改预注册评分结果：

1. 更正 STR-11 的文字依据为“组件/现象配额”，不再称与 STR-02 同根因；
2. 下一工单缩小为三案例 schema pilot，不直接制作 8 条；
3. STR-02 的 composite/split 判定成为 pilot 的显式产物；
4. 对全部 15 条应用统一 contamination 扫描并记录规则；
5. pilot 后先做独立 manifest 审计；通过后另开冻结工单，最低目标 6 条，额外 long 作为扩展或 holdout。
