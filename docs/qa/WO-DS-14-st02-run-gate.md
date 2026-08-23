# WO-DS-14 / ST-02 独立 Run-Gate QA

日期：2026-08-23

最终结论：**PASS — 仅接受 ST-02 Run-Gate；尚未调用模型，只有主控可另行授权固定一次 30-step official capture**

固定 re-QA Builder candidate：`a4c336d7f2e421c507e926fe333e5a1f4e5dbd06`

固定前置 contract candidate：`8d31cb6fc06b6b99bc141258539deb51b46d2d1b`

首次 QA docs commit / re-QA 直接父：`cc9594831023b523705e34c47b414ac02ce46a20`

## 独立 re-QA 接受记录

首次两个 P1 已由 append-only 修复关闭。前置 `8d31cb6…` 的两份合同成为当前 runtime 之外的固定 Git trust root；runtime 在解析任一当前合同 JSON 前，先校验固定 commit/parent/path/blob/SHA-256，并要求当前普通非 symlink 文件与 Git blob 逐字节相同。默认项目根也已从 `st02/` 正确上溯到仓库根；真实无参数 CLI 不依赖调用方 cwd。

### 首次 P1 原样重放

- Git-object identity 独立重算：`8d31cb6…` 的 parent 精确为 `daa012c…`；run contract blob 为 `536e11f6ca9dc3cf91d7c761a99e9afb6564b13e`、SHA-256 为 `7a78f885c177cbd1a89458fe8694dffee51647e8ab7797992188049e97b8e502`；response contract blob 为 `96bb261c615e72f69580c338c3ccdc1450ec2dd6`、SHA-256 为 `be4a39e39ad0822b60bdce11936e6a1bf144094f068d857ed0a00231a50269dd`。两份 current bytes 与固定 blob 相同且均为 regular file。
- 在隔离 bundle 中同步开启 run contract 的 model/capture/QA authorization 并修改 runtime 对应期望值，仍在任何 current contract JSON parse 前报 `accepted_st02_contract...run-contract.json: current bytes differ from fixed 8d31cb6 Git blob`。
- 同步把 response contract 的 `manual_repair` 与 runtime 期望值改为 `true`，同样先在 response contract 固定 Git-object boundary 拒绝。把 current contract 改成 invalid JSON 也先报 anchor mismatch，而不是进入 JSON parser；两份合同换成 symlink 均由 regular-file guard 拒绝。
- 无参数真实 CLI 分别从仓库根、`/private/tmp` 与新建临时目录三种 cwd 执行，三次都返回 `STR-08/E1`、`model_call_count:0`、`scoring_run_count:0`。首次“项目父目录不是 Git repo”的失败不再复现。

### 完整零模型边界复验

- 在物理上只有 `source/ + st02/contract/`、完全没有 `gold/` 的隔离 fixture 中，首 packet 与 canonical fixture 完全相同；runtime/CLI 没有 Gold、semantic item、checkpoint、Oracle/future/outcome、provider 或 evaluator 读取路径。
- 30 个合成 response prefix 按 STR-08 4 步、STR-07 10 步、STR-06 16 步完整重放；每个 prefix 从空 SQLite 重放两次，next packet/prompt 相同。每步只含 Previous Predicted State、空 recent context 与一个 Current Raw Event；跨 case 不串线。
- opaque raw/state ID、event-derived item/relation timestamp、response chain 均确定；合成 lifecycle 路径保留 `COMPLETED`、`SUPERSEDED`、`RESOLVED`、`REJECTED` tombstone 与既有非 `DERIVED_FROM` 的 `DEPENDS_ON` relation。
- 真实 `StrictStateExtractor(maxAttempts:1)` 对 invalid JSON/schema/reference 分别返回 `INVALID_JSON`、`INVALID_SCHEMA`、`INVALID_REFERENCE` 并使用 empty Delta fallback；state/revision 不变且不误记为 reducer rejection。stale revision 仍单列 `StateRevisionConflictError`，reducer rollback 后 state fingerprint/revision 不变。
- response/metadata 的 packet/order/model/hash/unknown/Unicode 与 symlink 攻击均拒绝；Unicode raw response 逐字符保留后交给 strict extractor，metadata 不进入 prompt。
- `packets/`、`capture/`、`internal/` 仍各只有一个中文 README；没有回答、capture、内部评分或 symlink。ST-02 model/provider/evaluator 调用为 0。

### re-QA 工程证据

- focused：8/8 PASS；全量：398 PASS / 1 个既有 opt-in official runner SKIP；protocol：8/8 PASS。
- build、ST-02 runtime/CLI 独立 TypeScript no-emit、candidate diff check：PASS。
- 真实 pack：50 files，SHA-1 `f20e56e75c6b6aa9d7362627101771a6c2ca4510`；不包含 `evaluation/`、`docs/` 或 `test/`。protocol suite 已验证 production-only package 与声明依赖。
- `feasibility-01` 固定 Git-object validator 仍通过；candidate 未修改其 accepted artifact、`src/` 或 package surface，也没有重跑 official evaluator。
- 环境：macOS / arm64，Node.js 25.6.1，npm 11.9.0；Windows 与 exact Node.js 24 未单独复跑。

### 接受边界与下一步

本次只接受 fixed current-event-only run contract、source-only packet/replay runtime、capture shape 和唯一一次 future run 的机械边界。它不接受 Extractor correctness、真实错误分布、Context Reduction、Operational Stability、最终回答质量或架构胜负。

QA 没有调用模型。Run-Gate PASS 也不自动启动 official run；只有主控可以另行授权按固定 order 执行恰好一次 30-step GPT-5.6-terra non-sol / medium / fresh `fork_turns:none` capture。授权前仍不得生成真实 response/capture；运行完成后必须提交原始结果并重新进行独立 QA，然后按工单停止。

## 首次 QA 返回记录（保留）

固定 Builder candidate：`8d31cb6fc06b6b99bc141258539deb51b46d2d1b`

固定直接父 / ST-01 re-QA：`daa012c4d6f09919e798edc3771cf090bd5dd188`

## 首次结论摘要

source-only replay 的大部分局部工程性质成立：在完全没有 `gold/` 的隔离 fixture 中可以生成与仓库 fixture 相同的首 packet；30 个合成 response prefix 按冻结顺序重放两次得到逐字节相同 prompt；输入只含 Previous Predicted State、一个 Current Raw Event、空 recent context，并保留 lifecycle tombstone 与既有非 `DERIVED_FROM` relation。真实 `StrictStateExtractor(maxAttempts:1)` 对 invalid JSON/schema/reference 都走 empty Delta fallback；stale revision 的 reducer rejection 单列且 state/revision 不变。单点 contract/source/response/metadata 攻击也大多 fail-closed。

但 Run-Gate 有两个 P1 阻塞缺陷：ST-02 两份合同在 JSON parse 前没有固定 Git-object anchor，合同与同提交 validator 常量可协调改写并被接受；无参数 source-only CLI 又把项目根解析成项目父目录，实际无法运行。测试全过不能覆盖这两个执行边界，因此本轮不能授权唯一一次 official capture。

## 身份、范围与隔离

- QA 开始时为 `main`，HEAD、直接父与交接固定值精确一致，工作树干净；候选只增加 ST-02 contract/runtime/CLI/test/handoff/README 并更新工单 checkpoint。
- 完整读取根 `AGENTS.md`、`PROJECT_STATE.md`、`ROADMAP.md`、唯一当前工单与 Builder handoff。
- 本 QA 没有调用模型、provider、answer-quality evaluator 或 assembler，没有写真实 packet/response/capture/internal artifact，也没有进入 ST-02 semantic evaluator。
- `packets/`、`capture/`、`internal/` 各只有一个中文 `README.md`；没有 symlink 或其他文件。
- 候选相对父提交没有修改 `src/`、`package.json`、`package-lock.json` 或 `feasibility-01`。DS-13 Git-object validator 仍通过，accepted source 为 `f721fd1…`，模型调用与语义评分计数均为 0。

## 已通过的独立检查

### source-only 输入与确定性

- 只复制 `source/event-stream.jsonl` 与两份 ST-02 contract 到不含 `gold/`、semantic/checkpoint/future/outcome 文件的临时 fixture，首 packet 与仓库 fixture 完全相同。
- runtime/CLI 静态导入只到现有 raw/state store、`StrictStateExtractor` 和 `StateReducer`；没有 Gold、semantic item、checkpoint、Oracle-State、future/outcome、provider、network 或 evaluator 读取路径。
- 独立合成 30 个 response prefix，顺序精确为 STR-08 4 步、STR-07 10 步、STR-06 16 步；每个 prefix 从空 SQLite 重放两次，next packet 与 prompt 逐字节相同。
- 每一步 `recent_context:[]`、`newest_events` 恰好一个 current event；跨 case state/relation 不串线；raw/state ID 均为稳定 opaque hash，state/relation 时间来自对应 current event，不暴露 SQLite 随机 ID 或 wall-clock。
- 合成 lifecycle 路径在后续 packet 中同时保留 `COMPLETED`、`SUPERSEDED`、`RESOLVED`、`REJECTED` tombstone，并保留一条既有 `DEPENDS_ON`，证明输入不是只投影 ACTIVE item。
- 30 个 response 处理结束只返回 `response_prefix_complete_no_scoring`，`model_call_count:0`、`scoring_run_count:0`。

### extractor、reducer 与 capture 边界

- 真实 `StrictStateExtractor` prompt 被实际 capture transport 捕获，`maxAttempts:1`；invalid JSON、unknown schema field、unknown opaque provenance reference 分别报告 `INVALID_JSON`、`INVALID_SCHEMA`、`INVALID_REFERENCE`，均 fallback 为 empty Delta，revision/state 不变且未误记为 reducer rejection。
- focused stale-revision 注入报告 `StateRevisionConflictError`，reducer rejection 单列，前后 state fingerprint 与 revision 不变。
- 普通单点攻击均拒绝：authorization/model/accepted identity、order swap/omission/duplicate、contract unknown/Unicode、source byte/Unicode、source/contract symlink、response packet/unknown、metadata packet/order/model/hash/unknown/Unicode、response symlink。
- Unicode raw response 按合同逐字符保留，再由 strict extractor 正常判为 invalid JSON；metadata 没有进入 prompt。

## 阻塞缺陷

### P1 — ST-02 contract 与 validator 可协调改写，违反不可自证 Gate

工单第 127–134 行明确要求：ST-02 run contract 自己锚定固定 Git object，validator 不能只依赖同一提交中可共同改写的 JSON/hash/源码常量，并须在隔离副本重放协调改写。

当前实现不满足：

- `ACCEPTED_ST02_SOURCE` 只固定 ST-01/canonical/event-stream 身份，没有 run contract、response contract 或 runtime 身份（`runtime.ts:75–83`）。
- `validateSourceAnchor()` 在 parse 前只读取并比较 `79da83d…` 的 Event Stream blob（`runtime.ts:277–295`）。
- `loadFixture()` 随后直接读取当前两份 contract，先 parse，再与同一 `runtime.ts` 中的常量比较（`runtime.ts:467–474`；期望常量位于 `332–465`）。
- runtime 不校验当前 HEAD、candidate commit、两份 contract 的 Git blob/SHA 或 current bytes 与固定 contract object 一致。

独立动态反例已复现：在隔离 fixture 中把 `model_authorized`、`official_capture_authorized`、`qa_may_call_model` 全改为 `true`，同时只改 bundle 中对应 validator 常量与 `next_authority`，保留 Event Stream 不变；`buildNextPacket()` 成功返回 `STR-08/E1`。现有 focused test 只改 JSON、不协调修改 validator，因此会通过但不能证伪该反例。

QA 在本次会话外部固定 `8d31cb6…` 只能证明所审候选当前字节，不能让 runtime 在未来 official run 时自行 fail-closed；尤其 official run 必然发生在后续提交之后。把“QA 知道候选 hash”视为 runtime 的 contract anchor，会直接绕过工单的跨提交不可自证要求。

### P1 — 无参数 source-only CLI 的默认 repository root 错一层

`runtime.ts:19` 从 `evaluation/state-replay-v0.1/st02/` 上溯 `../../../..`，实际得到项目父目录 `/Users/lmc/Documents/agent长期记忆`，而项目根应只上溯 `../../..`。`run-source-only.ts:6` 在无参数时直接采用这个默认值。

独立原样执行无参数 CLI 失败：

`git -C /Users/lmc/Documents/agent长期记忆 rev-parse 79da83d…^{commit}` → `fatal: not a git repository`

同一 CLI 显式传入项目根后成功生成 `STR-08/E1`，且 model/scoring 均为 0。这说明 replay 本身可用，但交付的默认入口不可用；Builder handoff 中的“source-only CLI 冒烟 PASS”无法按声明的默认用法复现。现有测试都显式传 `REPOSITORY_ROOT`，因此漏掉了该路径。

## 最小修复路径

不需要修改 core、Gold、retrieval/assembler policy，也不需要 PACE、Evidence、Experience 或新 provider：

1. 保持本候选两份 contract bytes 不变，在后续 runtime 修复中把 `8d31cb6…` 作为外部已记录的 contract source：固定其直接父、两个 contract path、Git blob 与 SHA-256，并在任何当前 contract JSON parse 前从 Git object 读取 fixed bytes，再要求 current regular-file bytes 逐字节相同。当前固定值为：
   - run contract blob `536e11f6ca9dc3cf91d7c761a99e9afb6564b13e`，SHA-256 `7a78f885c177cbd1a89458fe8694dffee51647e8ab7797992188049e97b8e502`；
   - response contract blob `96bb261c615e72f69580c338c3ccdc1450ec2dd6`，SHA-256 `be4a39e39ad0822b60bdce11936e6a1bf144094f068d857ed0a00231a50269dd`。
2. 新增协调攻击反例：同时改 contract JSON 与当前 validator 常量仍必须先在固定 `8d31cb6…` contract Git-object boundary 拒绝；不能仅把另一个可共同修改的 hash JSON 当 trust root。
3. 将 `DEFAULT_REPOSITORY_ROOT` 改为从 ST-02 目录上溯 `../../..`，并新增真实无参数 CLI 回归；测试不得总是显式传入正确项目根掩盖默认入口。
4. 修复后以 append-only Builder candidate 重新进行 Run-Gate QA；通过前不得调用模型或生成 official capture。

## 工程回归证据

- focused：7/7 PASS，但没有覆盖上述两个 P1。
- 全量：397 PASS / 1 个既有 opt-in official runner SKIP。
- protocol：8/8 PASS。
- build、candidate diff check：PASS。
- 真实 `npm pack --ignore-scripts`：50 files，SHA-1 `f20e56e75c6b6aa9d7362627101771a6c2ca4510`；不包含 `evaluation/`、`docs/` 或 `test/`。独立 production-only 前缀安装后 package exports 可加载。
- 环境：macOS / arm64，Node.js 25.6.1，npm 11.9.0；Windows 与 exact Node.js 24 未单独复跑。

## 首次 Gate 状态与测试设计挑战

- ST-01 reducer conformance 仍保持 accepted；本 QA 没有重开 ST-01。
- ST-02 Run-Gate：**FAIL / 未接受**；主控不能授权 30 个 fresh remote session，模型调用仍为 0。
- 因 official replay 尚未开始，critical state recall/precision、stale activation、missed supersession/resolution、wrong reactivation、dependency inconsistency、provenance failure 的真实错误分布尚不存在；不得用本轮 synthetic checks 构造 aggregate 或架构结论。
- vacuous pass：本轮只验证运行尺子的输入/错误路径，不能把 empty fallback、空 state 或测试通过计作 Extractor correctness。
- Gold leakage：隔离 fixture 动态证明 runtime 不需要 Gold；但 contract 自证 P1 未关闭前，这一局部通过不足以授权运行。
- 定义歧义与 evaluator 自证：Extractor error / reducer error 已在当前路径分列，但 capture 后的 semantic-key 匹配、关键遗漏定义和最终 evaluator 仍须后续独立 QA；本轮没有预判其正确性。
- 首次报告只新增 docs-only QA 记录；当时工单、`PROJECT_STATE`、`ROADMAP` 保持 pending，未进入 ST-02 official run、Context Reduction、Operational Stability 或下一阶段。该历史状态已由上方独立 re-QA 接受记录取代，但首次缺陷与证据永久保留。
