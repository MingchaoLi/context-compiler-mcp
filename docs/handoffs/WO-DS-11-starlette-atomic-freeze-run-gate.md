# WO-DS-11 交接 — Starlette 原子 freeze 与首次运行 gate

日期：2026-08-23

状态：**IMPLEMENTED — PENDING NEW INDEPENDENT QA**

## 交付结果

- append-only `freeze/v1/freeze-manifest.json` 展开固定 46 个 canonical-data 文件与 3 个 protocol 文件，并记录 DS-09/DS-10 Builder+QA Git 身份；
- 固定 case 顺序、12-slice 顺序、101 projected turns、8 Probe、42 required、16 forbidden、38 critical；
- 旧 promotion/protocol candidate bytes 没有改写；只有独立 QA PASS 后才由 wrapper 生效为 `frozen_by_manifest`；
- 使用不变 `starlette-contamination-rule/v1` 对六案追加 pre-run 公开索引复扫，没有观察到 qualified task-level reuse；
- 生成 12 × D0/D1/D2 × 1 共 36 个 opaque answer-input packet，内部 mapping 与 prompt/context hash 物理分离；
- D0/D1 复用 evaluator transcript renderer；D2 调用真实 `assembleContext`，无 headline/recall；
- 固定 GPT-5.6-terra non-sol、medium effort、36 个 `fork_turns:none` fresh session、每 cell 一次且禁止 adaptive retry/best-of；
- 本工单没有调用模型或 `runEvaluationSuiteV2`，没有 answer、效果指标或 PASS rate。

## 固定身份

- DS-09 canonical-data Builder：`4b974538d76d0e0d8a5ac17c5662533b714ef00e`；
- DS-09 QA：`2012961d9409f6c957d344c5432a701a1c15f8e7`；
- DS-10 protocol Builder：`bc78c42505c34ae6f3220db49b2e5a5af905d0eb`；
- DS-10 QA：`44c9756b041601fa7f287c834157439ac77fec3f`；
- promotion hash manifest：`c216719f1745601786ad53f50bbaed6c5e7b0a8e8d9d6612cfb79b9c103ff51b`；
- protocol hash manifest：`fde44511237c1a16d317131122461461c788b175b102592f22d6a656cfd6e99a`；
- prior contamination snapshot：`d3fe578e8f9b70eaba48ae24d4fdb13615104b27de11ca7d5b2ae3906fd98dd2`。

`freeze-hashes.json` 固定 generator、36-input JSONL、packet manifest、pre-run snapshot、run contract 与 freeze manifest。validator 另在代码中固定该 hash manifest，自举重写不能只靠同步重算 JSON 吸收。

## 污染复扫

观察时间固定为 `2026-08-23T08:58:06Z`。每案均执行 legacy/current exact path 与 benchmark/eval/LLM/agent/repair/dataset qualifier 组合；没有新增 confirmed。

保留限制：

- GitHub code-search API/UI 在当前工具中不可用；
- `no_public_hit_found` 只是受限 web-index 的 as-of observation，不证明绝对不存在污染；
- STR-05 release note、STR-01 下游说明、STR-04 RAGAS context-only noise/普通引用/canonical test 继续按原规则排除；
- STR-08 的 OpenReview 搜索命中只是 PDF 行号 `1298` 的数字碰撞，不是 Starlette Issue #1298。

任一未来 direct task-level reuse 只关闭 blind eligibility，不授权换案、改 Gold 或重做 protocol。

## 36 个 packet

`answer-inputs.jsonl` 只暴露：

- opaque `packet_id`；
- 条件无关系统说明；
- historical snapshot；
- 单一 JSON response contract；
- prompt hash。

`packet-manifest.json` 才保存 case/slice/condition/repetition、context hash、字符/token 估算、raw/state item 数与固定执行顺序。每个 slice 三条件的 Current Task hash 必须一致；运行顺序按 `sha256(starlette-v1-run-order/v1|packet_id)` 排序，禁止依据输出调整。

D2 使用人工 Oracle-State，是“typed state 可用时”的 upper-bound 可行性比较，不是 extractor、headline 或 recall 的端到端评估。该限制已经同时写入 packet manifest、run contract、freeze manifest、README 和 prompt 解释边界。

## 运行合同

下一工单只有在独立 QA PASS 后才可执行，且最多 36 次：

- 每个 packet 新建一个 GPT-5.6-terra / medium / `fork_turns:none` 会话；
- prompt 禁止 web、repo、tool 与未来信息；
- 每 cell 只发起一次，技术失败记 `technical_failure`，不能单点重试；
- 原样保存 output、时间、requested alias/effort、packet/prompt hash、parse/cell status 与 response hash；
- temperature、sampling、seed、backend build、billed tokens 记录为 unavailable；
- 回答只作未评分 artifact；两名 condition-blind 人类 reviewer 后续独立判 required/forbidden/Critical-Miss。

一次重复只回答 feasibility，不能声明稳健性、一般化、provider 比较或确定性复现。

## Validator 与攻击面

`validate-freeze.ts` 先复用 promotion+protocol 固定 validator，再：

- 逐文件核对七项 freeze 固定 byte contract；
- 独立展开 promotion/protocol hash manifests；
- 重建 36 个 inputs 与 packet manifest 并逐字节比较；
- 核对 opaque id、12×3×1、Current Task 同一性、context/prompt hash 与固定运行顺序；
- 拒绝 condition/case/slice 标签、Gold/rubric/Decision/Outcome 标签和 Unicode format/control；
- 固定污染规则、六案 source number、eligibility、检索限制；
- 固定 non-sol model、medium、fresh session、one-attempt、capture、blind human judge 与零调用授权。

14 项聚焦测试覆盖正常重建，以及 confirmed contamination、sol substitution、adaptive retry、授权提权、换 slice、packet 调换/遗漏、条件泄漏、零宽泄漏、unknown field、canonical+protocol+freeze 协调改写与 symlink。

## Builder 自检

- atomic validator：46 canonical + 3 protocol + 6 cases + 12 slices + 36 packets；blind eligible 6；run/model count 0；
- focused：14/14；
- `npm test`：20 files / 368 tests；
- `npm run test:protocol`：8/8；
- `npm run build`、`git diff --check`：通过；
- 隔离 `npm pack --json`：真实 50-entry tarball，SHA-1 `f20e56e75c6b6aa9d7362627101771a6c2ca4510`，不含 evaluation/docs/test；
- 没有修改 `src/`、package、MCP、provider/host、promotion payload、protocol payload、旧 snapshot 或既有 hash；
- 没有 answer artifact、模型请求、evaluator 执行或效果结论。

## 独立 QA 必查

- 固定 Builder candidate、父提交、main/clean，并确认 diff 只含 DS-11 append-only freeze、测试与中文 docs；
- 从 Git object 独立重建 46+3 source/file SHA 与 Git commit chain，攻击 data+protocol+freeze 协调改写；
- 独立重建 36 inputs，逐 packet 核对真实 evaluator D0/D1 renderer、真实 assembler D2、时间前缀和同一 Current Task；
- 搜索 prompt 的 condition/case/slice、Gold、rubric、Decision、Outcome、future event、零宽/bidi 泄漏；
- 按同一 rule 复核六案公开污染检索与 excluded hit，不能把索引不足夸为 absence proof；
- 重放 packet swap/duplicate/omission/order/hash、自举、授权、unknown/path/symlink 与 Unicode 攻击；
- 确认没有 runner/model/provider/network 调用路径或 answer artifact；
- 运行 validator、focused、全量、protocol、build、diff check 和隔离 pack。

实现者不批准本工单。若 QA PASS，只表示 atomic freeze 生效并授权下一工单按合同收集最多 36 个未评分回答；不表示 D2 优于 D1，也不完成两名人类盲评。
