# DS-08 接受后的六案 promotion 关键节点对抗审查

日期：2026-08-23

角色：独立 Adversarial Reviewer

固定基线：`main` / `519acc1dd593fbd41934e39a70f819f86bb524fb` / clean

## Verdict

**Agree with reservations（有保留同意）。**

**事实：** STR-06、07、01 已分别在固定 Git candidate `f4931ad…`、`8f51bf4…`、`454565b…` 完成来源、increment/tier、Task 及 Gold/Oracle 人工 QA；三案仍是 `checkpoint_not_frozen`，且明示禁止 promotion/model run：`docs/qa/WO-DS-06-starlette-str06-source-gold-checkpoint.md:73-93`、`docs/qa/WO-DS-07-starlette-str07-source-gold-checkpoint.md:5-52`、`docs/qa/WO-DS-08-starlette-str01-source-gold-checkpoint.md:26-59`。旧三案 collection 只含 STR-08/05/04，状态为 `promotion_candidate_not_frozen`、`evaluation_ready:false`、`model_run_authorized:false`：`evaluation/starlette-v1/promotion/collection.json:4-8,48-49`。上次对抗审查预先给出“STR-07 → STR-01 → 新三案一次 promotion”，现在这一条件已满足：`docs/adversarial-reviews/AR-2026-08-23-post-ds06-checkpoint.md:60-65`。

**推断：** 一次性 promotion 现在比单案 promotion、Probe-first 或长期保留混合路径更小：它一次关闭三个 accepted-source 合同和单一 collection layout，不必再重复改 collection/diff/hash/validator。但 Builder 交付只能称 **six-case promotion candidate / canonical-data freeze candidate**，在独立 QA 接受前不得称 `frozen`；即使 canonical data 后续明确冻结，也仍不等于 `evaluation_ready`。

**建议：** 下一工单的单一结果定义为“六案 canonical-data freeze candidate，状态仍为 `promotion_candidate_not_frozen`”；不同时设计 Probe/answer rubric，不运行模型，不声称直接 freeze 或可评估。

## Strongest challenge

### 1. “六案 promotion”可接受，“六案已 frozen/可评”不可由此推出

**事实：** 现有 wiring 只验证 fixture 可被 evaluator v2 严格 parser 消费，返回值明示 `evaluation_run_count:0`、`model_call_count:0`、`effect_metrics_generated:false`：`evaluation/starlette-v1/validate-promotion-wiring.ts:20-50`。DS-05 PASS 也只证明旧三案 31 slices / 226 turns 的静态接线：`docs/qa/WO-DS-05-starlette-three-case-promotion-audit.md:48-59`。

**具体反例：** 新工单可以字节不变地复制 21 个新文件，让六案 parser 全部 PASS，然后把 collection 标为 `frozen`/`evaluation_ready:true`。由于 Probe/answer rubric 仍不存在，该 collection 仍无法生成可解释效果；parser PASS 只证明形状兼容，不证明 Gold→Probe/答案映射。

**推断/建议：** 不拒绝 promotion，但拒绝状态越权。Probe/answer protocol 是首次模型效果运行的 blocker，不是 byte-identical canonical promotion 的 blocker。

### 2. `1 short / 0 medium / 5 long` 不阻塞 promotion，但阻塞 tier-balanced 和普遍 aggregate 结论

**事实：** STR-08 只有 4 个 short slice；STR-05/04/06/07/01 分别有 9/18/16/10/18 个 long slice，全集将是 75 slices，其中 71/75（94.7%）属于 long，medium 为 0：`evaluation/starlette-v1/promotion/cases/STR-08/manifest.json:7-16`、`evaluation/starlette-v1/promotion/cases/STR-05/manifest.json:7-16`、`evaluation/starlette-v1/promotion/cases/STR-04/manifest.json:7-16`、`docs/qa/WO-DS-06-starlette-str06-source-gold-checkpoint.md:83-93`、`docs/qa/WO-DS-07-starlette-str07-source-gold-checkpoint.md:38-49`、`docs/qa/WO-DS-08-starlette-str01-source-gold-checkpoint.md:26-30`。

**具体反例：** 若 D2 在五个 long case 上均提升 10 个百分点，在唯一 short case 上退化 30 点，case 均值仍显示约 +3.3 点；slice-weighted aggregate 还会更强地被 long 主导。这不能支持“medium 有效”、“tier 间稳定”或“Starlette 一般性改善”。

**推断/建议：** 0 medium 是测量范围限制，不是复制/固定已预注册六案的 blocker。但首次 protocol 必须预注册 case-level 报告、`medium: not represented/not evaluable`、禁止 tier-balanced 声明，并将 pooled aggregate 限定为描述性附加项。不得为补配额换案或强拆 lineage。

### 3. 静态语义盲区不足以拒绝 clean promotion，但 accepted-source 锚定和污染边界是硬验收条件

**事实：** DS-08 QA 已实测：向 STR-01/T1 加入未来答案的语义同义句并重算 hash，静态 validator 仍会接受；QA 靠人工复读当前 clean payload 才接受：`docs/qa/WO-DS-08-starlette-str01-source-gold-checkpoint.md:36-37,57`。DS-06/07 QA 也明示 checkpoint hash 可与 payload 协调改写，未来 promotion 必须在不可随 fixture 自举改写的合同中固定七文件 path/order/SHA：`docs/qa/WO-DS-06-starlette-str06-source-gold-checkpoint.md:83-87`、`docs/qa/WO-DS-07-starlette-str07-source-gold-checkpoint.md:45-46`。DS-05 首轮已有协调改写通过 validator 的真实 P1 反例：`docs/qa/WO-DS-05-starlette-three-case-promotion-audit.md:24-39`。

**具体反例：** 将 STR-01/T1 改为更早泄漏“项目已接受有限 downstream replay”，同时重算 checkpoint hash、promotion copy/diff/hash。如果新 promotion validator 只互相比较可改文件，它会错误 PASS；如果它硬编码固定已接受 Git candidate 中三案共 21 项 path/order/SHA，应在 accepted-source contract 处拒绝。

**事实（污染）：** 现有 snapshot 的 GitHub code-search API/UI 因认证不可用，`no_public_hit_found` 不是 absence proof，并明示要求六案 freeze 时新 full snapshot、首次 model call 前 append-only rescan：`evaluation/starlette-v1/promotion/contamination-snapshot.json:12-15,125`。

**推断/建议：** P2 对已人工接受且字节不变的 payload 不是 promotion blocker；任何 semantic byte change 则必须退回单案 Data QA。三个固定 accepted-source 合同、byte-identical diff 和全六案协调改写反例是 promotion blocker。污染的最小规则应是：`evidence_cutoff_at` 永不滑动；freeze 时记一次 full snapshot；之后的 scan 作为 append-only eligibility ledger，只改变运行资格/披露，不反复改写 frozen source data。

## Cheaper path

**存在 fail-fast 更小路径，但不存在比“一次批量 promotion”更小且同时保留单一 canonical layout/accepted-source 保证的终局。**

1. 在新工单内先用已接受的旧三案 promotion + 三个 checkpoint 做一次不落盘的全集 preflight：恰好 6 cases / 75 slices / 588 projected history turns，唯一 ID/顺序正确，真实 evaluator v2 parser 可消费，0 runner / 0 model call。失败即停，不先复制、rehash 或改 collection。
2. preflight PASS 后才一次复制 STR-06/07/01 的 21 文件，固定 `f4931ad…` / `8f51bf4…` / `454565b…` 的 path/order/SHA，扩展 diff/hash/source contract，生成 freeze-time full contamination snapshot，并保持 `evaluation_ready:false` / `model_run_authorized:false`。无检测到 source 变化时，promotion QA 不必再语义重审 75 条已逐案接受来源；只需验证固定锚点、字节一致和变化检测。
3. 六案 canonical data 被独立接受后，再单独做 Gold 类型覆盖→Probe/answer-rubric protocol；protocol QA 前不运行 D0/D1/D2。

“不复制，让 collection 长期混合引用 promotion/pilot/canary/checkpoint”省下 21 个文件，却要引入混合 loader/path/status 合同，并破坏旧三案已建立的 canonical layout；没有证据显示它总成本更低。Probe-first 同样不更便宜，因为它会在 canonical 案例身份尚未统一时产生派生协议。

## Falsification

### 足以推翻 Builder/主控判断的证据

- 六案 75 slices / 588 turns 的不落盘 preflight 不能用现有 parser 通过，或发现跨案 ID/顺序/投影冲突；此时应先停止 promotion，定界最小 wiring 问题。
- STR-06/07/01 任一 accepted path/SHA 不匹配固定 QA candidate，或 promotion 需要任何 semantic payload 改动；此时不得当作 relocation。
- 同步改写 accepted checkpoint、promotion copy、checkpoint/promotion hash/diff 后新 validator 仍 PASS；这会复现 DS-05 P1，直接否定 promotion gate。
- freeze-time full snapshot 找到按预注册规则确认的 task/Gold/answer reuse，而 collection 仍将其称 blind-eligible；或 Builder 在 Probe/rubric 缺失时把集合标为 `evaluation_ready:true`。

### 会让本审查撤回保留/反对的证据

- 新工单只交付六案 promotion/freeze candidate；六案 75/588 全集静态 preflight 通过，21 个新副本均 byte-identical，三个固定 accepted-source 合同与六案协调改写攻击全部通过独立 QA。
- collection 在 QA 前仍明示为 `promotion_candidate_not_frozen`，在 canonical-data freeze 被明确接受后仍保留 `evaluation_ready:false`、`model_run_authorized:false`。
- 完整披露 `1 short / 0 medium / 5 long`、long slice 71/75、medium 不可评与禁止普遍/tier-balanced aggregate 声明，且 freeze-time 污染 snapshot 和后续 append-only pre-run eligibility scan 各自有固定语义。

当以上证据齐备时，我会撤回对“现在一次性 promotion STR-06/07/01”的保留；对该步骤本身无需额外单案 promotion、Probe-first、runner 或远程模型证据。
