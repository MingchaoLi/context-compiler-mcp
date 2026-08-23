# WO-DS-05 交接 — Starlette 三案 promotion audit

日期：2026-08-23

状态：**IMPLEMENTED — PENDING NEW INDEPENDENT DATA QA**

## 当前交付

- 全六案共同 evidence cutoff 固定为 `2026-08-23T03:00:00Z`，与 `scan_observed_at` 分离；
- STR-08/05/04 的 21 个 accepted 文件以逐字节一致副本进入 `promotion/cases/`；
- `promotion-diff.json` 逐项记录 old/new path、SHA-256 和 `byte_identical_relocation`；
- `contamination-snapshot.json` 用固定规则覆盖六案全部 source number，并保留查询能力限制与 STR-04 RAGAS context-only 排除；
- `source-reaudit.json` 记录 31 个来源复核和 3 个 review 无 `updated_at` 的限制；
- `promotion-hashes.json` 覆盖 collection、snapshot、source audit、diff 与 21 个副本；
- promotion validator、真实 evaluator v2 parser 接线验证器和聚焦反例测试；
- 中文报告、目录说明、工单、项目状态与路线图更新。

没有修改 `src/`、MCP、依赖、evaluator/retrieval/assembler policy、provider 接口、旧 pilot/canary fixture/hash 或旧污染快照。没有制作 STR-01/06/07，没有运行 D0/D1/D2、回答模型、aggregate、PASS rate 或任何效果实验。

## 独立 QA 必查

- 固定 Builder candidate、父提交 `4c6e740cddc794e90a310f4c3ee60e739e339fe7` 和 clean worktree，确认差异只属于 DS-05；
- 确认旧 pilot/canary、旧 hash 与原 contamination snapshot 相对父提交逐字节未变；确认 21 个 promotion 文件都是普通文件而非 symlink，并逐项重算 old/new SHA-256；
- 从文件系统独立重建 21 项 promotion diff 与 25 项 promotion hash，攻击路径、顺序、状态、cutoff、hash、case id、change class 和漏项/重复项；
- 复核 collection 的六案顺序、三案 promotion/remaining 子集、accepted candidate、`promotion_candidate_not_frozen`、`evaluation_ready:false`、`model_run_authorized:false`；
- 独立重新访问 STR-08/05/04 的 31 个登记来源，核对 immutable id、actor、时间、正文 hash、review `submitted_at` 和 state canonical hash；不得把当前可变 body 当作创建时快照；
- 对固定六案重新审视污染查询、source number 与规则语义，尤其确认 STR-04 RAGAS 只为 context-only noise；核查 `no_public_hit_found` 没有被夸大为 absence proof；
- 确认 `evidence_cutoff_at` 与 `scan_observed_at` 分离，cutoff 后 event 没有进入 case payload；
- 对 copied bundle 运行既有严格 case validator；确认 promotion 接线仍恰好为 31 slices / 226 turns，并由静态导入的真实 `parseEvaluationSuiteV2` 解析；尝试注入 lookalike parser 应失败；
- 静态与运行时确认没有调用 `runEvaluationSuiteV2`、provider、network、credential、host/UI 或模型，摘要没有效果指标；
- 用独立临时 npm cache 运行真实 pack，确认 promotion/evaluation 数据与脚本不进入发布包；运行聚焦、全量、protocol、build 与 `git diff --check`。

## Builder 自检

- `node evaluation/starlette-v1/validate-promotion.mjs`：3 promoted / 21 byte-identical files / 31 sources / 31 slices / hashes verified；
- `npx vitest run test/starlette-promotion.test.ts`：10/10；
- `npm test`：14 files / 293 tests；
- `npm run test:protocol`：8/8；
- `npm run build`、`git diff --check`：通过；
- `npm --cache /private/tmp/context-compiler-ds05-npm-cache pack --dry-run --json`：50-entry tarball，未包含 Starlette/evaluation 文件。

实现者不批准本工单。只有新的独立 data QA PASS 才能接受 promotion audit；接受后仍保持 `promotion_candidate_not_frozen`，下一步只允许单独处理 STR-06 source/Gold checkpoint。
