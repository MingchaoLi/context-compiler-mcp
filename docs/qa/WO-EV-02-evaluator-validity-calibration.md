# WO-EV-02 独立 QA — Evaluator v2 测量有效性校准

日期：2026-08-23

## 结论

`FAIL — RETURN TO IMPLEMENTATION`

候选的大部分行为与工单一致，但 version 2 严格输入与 provenance 合同仍有两个可复现缺陷，其中一个会允许无法追溯到 raw evidence 的 Probe 来源进入评估。WO-EV-02 必须保持 `IMPLEMENTED — PENDING INDEPENDENT QA`；本次 QA 不修改实现、不更新接受状态，也不开始 Starlette 或后续工单。

## 固定候选

- 分支：`main`
- HEAD：`7e84fc8e72ebe544749b5acd811a00b589eb9d4d`
- HEAD^：`9e14c4d095f0dfc4720c5ca96336b647c26056d2`
- 开始验证时工作树干净。

## Findings

### P1 — `context_item` provenance 可以绕过 raw `source_refs` 追溯

`src/evaluation.ts:304` 的 v2 共用 `contextItemSchema` 允许空 `source_refs`；`validateSuiteReferencesV2` 只验证 Probe 指向的 item id 存在，没有要求该 item 至少包含一个合法 raw source ref。因而一个 Probe 可以引用 `source_refs: []` 的 `context_item` 并通过 `parseEvaluationSuiteV2`，违反“指向 `context_item` 的来源必须继续能够追溯到合法 raw `source_refs`”的核心合同。

在仓库根目录可复现：

```sh
node --input-type=module -e '
import {readFileSync} from "node:fs";
import {parseEvaluationSuiteV2} from "./dist/index.js";
const value=JSON.parse(readFileSync("test/fixtures/evaluation-v2-calibration.json","utf8"));
const c=value.cases[2];
c.context_items.find(x=>x.id==="cost-constraint").source_refs=[];
value.cases=[c];
console.log(parseEvaluationSuiteV2(value).cases[0].context_items.find(x=>x.id==="cost-constraint").source_refs);
'
```

实际输出 `[]`，没有抛出 `INVALID_INPUT`。这不是只存在于非 JSON 对象的库级边缘：空数组可以直接出现在 JSON fixture 中。它使 v2 的来源约束不足以证明 Probe 可追溯到本 case 的 raw evidence，因此阻断接受。

### P2 — 非枚举 unknown data field 被严格 parser 接受

`assertPlainEvaluationData` 会遍历 `Reflect.ownKeys`，但对普通对象的数据 descriptor 没有要求 `enumerable: true`。随后 Zod 严格对象忽略非枚举 unknown field，导致含未知字段的输入被接受。version 2 合同要求 unknown field 在执行前拒绝，且公共 parser/runner 明确接受 `unknown`，所以不能只以 JSON CLI 无法表达非枚举属性排除该路径。

在仓库根目录可复现：

```sh
node --input-type=module -e '
import {readFileSync} from "node:fs";
import {parseEvaluationSuiteV2} from "./dist/index.js";
const value=JSON.parse(readFileSync("test/fixtures/evaluation-v2-calibration.json","utf8"));
Object.defineProperty(value,"hidden_unknown",{value:1,enumerable:false});
parseEvaluationSuiteV2(value);
console.log("ACCEPTED");
'
```

实际输出 `ACCEPTED`，没有抛出 `INVALID_INPUT`。

## 其余验证结果

### Version 1 兼容

- 从 `HEAD^` 独立导出并构建父候选，用父/当前真实 `dist/evaluation-cli.js` 运行同一个 `evaluation-suite.json`。
- 两者退出码均为 `0`、stderr 均为空；去除非确定性的实测 latency 数值后，完整 version 1 JSON 报告逐字段一致。
- version 1 parser、runner、rate 空分母语义、阈值 failure code/order 与既有测试保持不变；CLI 的 v1 分派没有被 v2 静默改写。

### Version 2 strict/plain-data 与 provenance

- enumerable unknown、accessor、custom prototype、sparse array、symbol key、cycle、重复 Probe id、重复 provenance、缺失 provenance 均在运行前返回稳定 `INVALID_INPUT`。
- accessor 反例中的 getter 调用次数为 `0`；错误对象和 CLI 输出均不含 `PRIVATE-EVIDENCE`。
- 上述拒绝路径前后没有新增 `context-compiler-evaluation-v2-*` 临时目录。
- Probe kind 只能是 `raw_event | context_item`，未知 source id 正确拒绝，`current_input` 没有合法 provenance kind。
- 但 P1 与 P2 仍使严格输入/provenance 验收不成立。

### `not_evaluable`、aggregate 与 failure 稳定性

- 单独运行空 Probe/recall case 时，D0/D1/D2 的五类 rate 均为 `status: not_evaluable, matched: 0, total: 0, rate: null`。
- 全部必需 D2 metric 不可评估时 `passed=false`，真实 CLI 退出 `2`；failure 顺序稳定为 constraint、decision、resolved issue、open question、recall 五个 `*_NOT_EVALUABLE` code。
- 混合 case aggregate 只累计真实分母：空 case 不增加 matched/total，不产生 vacuous success 样本。

### `current_input` 边界

- 为 constraint、decision、resolved issue、open question 分别构造唯一文本。文本只在 `current_input` 出现时，D0/D1/D2 历史指标全部 `matched=0`。
- 把同一组文本放入真实历史、令 `current_input` 无关时，D0/D1/D2 四类指标全部 `matched=1`，证明排除当前输入没有误伤真实历史命中。
- D0/D1 token 与独立渲染完整 transcript（含同一 `current_input`）完全相等；D2 token 与 assembler 的完整 `d2_compiled_tokens` 完全相等，且明显大于移除 current input 后的 token 数。
- 静态边界确认 latency 计时覆盖完整 D0/D1 render 和完整 D2 assemble，再生成仅供历史匹配的 projection；没有修改 assembler/core policy。

### D2-vs-D1 成本

- calibration 三个 case 的 `(d1,d2,delta,ratio)` 分别为 `(37,89,52,2.405405)`、`(51,103,52,2.019608)`、`(34,147,113,4.323529)`；aggregate 为 `(122,339,217,2.778689)`。
- 每个 `delta === d2 - d1`，ratio 等于既有六位小数约定下的 `d2 / d1`。
- `compareEvaluationTokenCostV2(0, 7)` 返回 `not_evaluable`、`ratio:null`、`delta:7`。
- ratio 大于 1 没有增加新 gate；原始成本只被报告。Calibration fixture 的三个 case 分别校准空率、当前输入污染与成本可见性，README 明确说明它不是 D2 效果证据。

### 真实 CLI、package 与公共 API

- 真实进程矩阵：v1 pass=`0`、v2 pass=`0`、v2 not-evaluable=`2`、v2 threshold failure=`2`、v2 invalid=`3`、未知 version=`3`。
- 成功/阈值结果各输出一行 JSON 到 stdout 且 stderr 为空；invalid/未知版本 stdout 为空、stderr 各一行净化 JSON。v2 validation error 报告 `version:2`；未知版本使用兼容的 `version:1`，且不泄漏证据。
- `dist/index.js`、`dist/index.d.ts`、`dist/evaluation.d.ts` 均含 v2 常量、parser、runner、cost helper 与公共 types/declarations。
- 真实 `npm pack` 产物 `context-compiler-mcp-0.1.0.tgz`：shasum `f9f2457fb8d1b8bf95b185438474ed23a68b992a`，50 个 package entries；只含 README、package metadata 与 dist，不含 src/test/docs/node_modules/数据库/凭据文件。
- 从 tarball 解包、复制 lockfile/依赖并执行 offline `npm prune --omit=dev` 后，`@modelcontextprotocol/sdk` 与 `zod` 存在，`vitest` 与 `typescript` 不存在；`npm ls --omit=dev --all` 退出 `0`，只有 SDK 声明的 unmet optional dependency，没有 extraneous/missing 必需依赖。
- production-only tarball 的真实 eval entry 分别运行 v1 fixture（1 case）和 v2 calibration fixture（3 cases），均退出 `0`、stderr 为空。
- production-only tarball 的真实 MCP `tools/list` 精确返回九个工具：`health`、`ingest_event`、`compile_context`、`get_state`、`prepare_state_update`、`apply_state_delta`、`create_headline`、`recall_exact`、`recall_keyword`；stderr 为空。

### 范围、扫描与必需命令

- 候选没有修改 assembler/retrieval/recall/reducer/extractor/MCP 行为文件；没有新增 runtime dependency。
- 候选 diff 与 `src/package.json` 的 provider/network/credential/host/UI import/API 扫描无命中。
- tracked 生成物、`dist`、`node_modules`、数据库、日志、`.env`、凭据/private conversation 扫描无命中；tarball 同类扫描无命中。
- `npm test`：11 files、240 tests 全部通过。
- `npm run test:protocol`：1 file、8 tests 全部通过。
- `npm run build`：通过。
- `git diff --check`：通过。

验证环境为 macOS 26.5.1 / Darwin 25.5.0 arm64、Node.js 25.6.1、npm 11.9.0。本报告不从该结果推断 Windows 或精确 Node.js 24。

## 返回条件

实现分支需要用 append-only 修复提交同时关闭 P1 与 P2，并补充相应聚焦回归：

1. Probe provenance 指向 `context_item` 时，明确拒绝空 `source_refs`，并继续验证每个 ref 指向本 case raw event；
2. v2 公共 parser/runner 拒绝非枚举 unknown/data property，而不调用 getter、不泄漏值；
3. 重新运行本报告的完整矩阵后再申请独立 re-QA。

---

## 独立 re-QA — PASS

日期：2026-08-23

结论：`PASS — INDEPENDENT RE-QA`

### 固定修复候选

- 分支：`main`
- source candidate：`93b71dde1c660feb2671d974cbb6eedb3b58340a`
- 父提交：`7e84fc8e72ebe544749b5acd811a00b589eb9d4d`
- re-QA 开始时工作树干净。

首次 FAIL 的历史记录与复现证据保留不变。修复候选以 append-only 提交关闭 P1/P2，未修改 v1、assembler、CLI、MCP 或依赖。

### 首次 Findings 关闭证据

- 原样重跑 P1 复现：把 Probe 所指 `cost-constraint.source_refs` 设为 `[]` 后，`parseEvaluationSuiteV2` 现在抛出 `EvaluationError(code=INVALID_INPUT)`，不再输出 `[]`。
- 原样重跑 P2 复现：在 suite 根对象增加非枚举 `hidden_unknown` data property 后，`parseEvaluationSuiteV2` 现在抛出 `EvaluationError(code=INVALID_INPUT)`，不再输出 `ACCEPTED`。
- 扩展矩阵确认 enumerable/non-enumerable unknown、accessor、custom prototype、sparse array、symbol、cycle、重复 Probe id、重复 provenance、缺失 provenance、空 `context_item.source_refs`、缺失 raw source ref、`current_input` provenance kind 全部在临时状态创建前返回 `INVALID_INPUT`。
- getter 调用次数为 `0`，错误不含 `PRIVATE-EVIDENCE`，各拒绝路径没有临时目录残留。

### 风险回归

- **v1 compatibility：** 从父提交独立导出并构建，对父/当前真实 CLI 运行同一个 v1 fixture；退出码均为 `0`、stderr 为空，去除实测 latency 数值后完整报告逐字段一致。
- **历史投影：** 四类 Probe 文本只在 `current_input` 出现时，D0/D1/D2 全部 `matched=0`；文本存在于真实历史且当前输入无关时，三维度四类指标全部 `matched=1`。
- **完整输入成本：** D0/D1 token 分别与独立完整 transcript 完全相等；D2 token 与 assembler 的完整 `d2_compiled_tokens` 相等，并包含 current input。latency 计时边界仍覆盖完整 render/assemble。
- **空率与 aggregate：** 空 Probe/recall case 的所有 rate 均为 `not_evaluable/rate:null`；五个 not-evaluable failure code 顺序稳定，真实 CLI 退出 `2`；混合 aggregate 不累计空 case 分母。
- **D2-vs-D1：** calibration 三案与 aggregate 的 d1/d2/delta/ratio 算术全部精确；`compareEvaluationTokenCostV2(0,7)` 返回 `not_evaluable/ratio:null`；ratio 大于 1 不形成新 gate。Calibration fixture 仍只校准尺子，不作为 D2 效果证据。
- **CLI：** v1 pass=`0`、v2 pass=`0`、v2 not-evaluable=`2`、v2 threshold failure=`2`、v2 invalid=`3`、未知 version=`3`。stdout/stderr 各保持单行、分流与净化；v2 validation error 使用 version 2，未知版本不泄漏证据。

### Package、MCP 与扫描

- 公共 JS exports 与 `.d.ts` declarations 仍完整暴露 v2 常量、parser、runner、cost helper 和类型。
- 真实 `npm pack` 生成 50-entry tarball，shasum `f20e56e75c6b6aa9d7362627101771a6c2ca4510`；不含 src/test/docs/node_modules、凭据、数据库或日志。
- tarball 解包并 offline `npm prune --omit=dev` 后，SDK/Zod 存在，Vitest/TypeScript 不存在；完整 production dependency tree 退出 `0`，无缺失必需依赖或 extraneous dependency。
- production-only 真实 eval entry 运行 v1 与 v2 fixture 均退出 `0`、stderr 为空；真实 MCP `tools/list` 精确返回既有九工具且 stderr 为空。
- fix diff 和完整 `src/package.json` 的 provider/network/credential/host/UI 扫描无命中；tracked 生成物/敏感文件扫描与 tarball 内容扫描无命中；没有新增 runtime dependency。

### 必需命令

- `npm test`：11 files、242 tests 全部通过。
- `npm run test:protocol`：1 file、8 tests 全部通过。
- `npm run build`：通过。
- `git diff --check`：通过。

验证环境仍为 macOS 26.5.1 / Darwin 25.5.0 arm64、Node.js 25.6.1、npm 11.9.0。Windows 与精确 Node.js 24 未验证，不能由本次结果推断。

WO-EV-02 在固定 source candidate `93b71dde1c660feb2671d974cbb6eedb3b58340a` 上满足工单验收，可以更新为 `ACCEPTED`。这只接受 evaluator v2 测量校准，不构成 D2 效果、真实 Starlette 轨迹或远端回答实验的证据。
