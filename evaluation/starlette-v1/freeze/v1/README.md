# Starlette v1 原子 freeze candidate

本目录是 WO-DS-11 的 append-only 冻结包装器。它不改写 DS-09 的 promotion payload 或 DS-10 的 protocol 文件；只有独立 QA 接受后，`freeze-manifest.json` 才把两者的既有 bytes 与 36 个 answer-input packet 共同声明为 `frozen_by_manifest`。

当前状态是 `freeze_candidate_pending_independent_qa`，不授权本工单调用模型或 evaluator。

## 文件

- `freeze-manifest.json`：展开并固定 46 个 canonical-data 文件、3 个 protocol 文件、Git 身份、12-slice 顺序和不可变策略；
- `contamination-snapshot-pre-run.json`：在首次模型调用前追加的六案公开索引复扫，不覆盖旧 snapshot；
- `run-contract.json`：固定 GPT-5.6-terra non-sol、medium effort、36 个 fresh session、每 cell 单次尝试、禁止自适应 retry/best-of；
- `answer-inputs.jsonl`：36 个只暴露 opaque packet id 的模型输入；
- `packet-manifest.json`：内部 packet→case/slice/condition 映射、prompt/context hash 与固定 SHA 排序运行顺序；
- `generate-run-inputs.ts`：复用 evaluator 的 D0/D1 transcript rendering，并为 D2 调用真实 `assembleContext`；
- `freeze-hashes.json` 与 `validate-freeze.ts`：固定候选 byte contract、确定性重建和前置拒绝。

## 条件边界

- D0：截止该 slice 的全部允许 raw history + Current Task；
- D1：既有“最近完整 user turn”窗口 + Current Task；
- D2：真实 assembler + 该时点人工 Oracle-State + recent raw + Current Task，无 headline、无 recall。

D2 是 typed-state upper bound，不是自动 extractor 端到端结果。输入生成器不读取 Fact Gold、answer checklist、Decision Reference 或 Outcome Anchor；条件映射只存在内部 manifest，模型输入不含 case/slice/condition 标签。

## 污染复扫限制

复扫沿用 `starlette-contamination-rule/v1`。六案在本次公开 web-index 观察中均为 `eligible_as_of_snapshot`，没有 qualified task-level reuse；但 GitHub code-search API/UI 在当前工具中不可用，所以 `no_public_hit_found` 不是 absence proof。STR-08 的一个 benchmark-looking 结果仅是 PDF 行号 `1298` 的数字碰撞，已作为 excluded hit 留痕。

## 运行与判定

本工单的 `model_call_count` 和 `evaluation_run_count` 都为 0。独立 QA PASS 后，下一工单最多按 `packet-manifest.json#execution_order` 发起 36 次全新 GPT-5.6-terra 会话，每 cell 恰好一次；技术失败不能单点重试。

模型回答在收集时仍是未评分 artifact。语义 required/forbidden/Critical-Miss 判定必须由两名 condition-blind 人类 reviewer 完成，不能用第二模型 judge 替代。单次重复只支持 feasibility 描述，不支持稳健性、一般化或确定性复现声明。

## 校验

```bash
env NODE_NO_WARNINGS=1 npx vite-node --script evaluation/starlette-v1/freeze/v1/validate-freeze.ts evaluation/starlette-v1
npx vitest run test/starlette-atomic-freeze.test.ts
```

任何 data/protocol/prompt/contract 变化必须创建新版本，不能静默重算本目录 hash。
