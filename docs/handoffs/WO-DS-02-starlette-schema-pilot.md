# WO-DS-02 交接 — Starlette schema 与三案例 pilot

日期：2026-08-23

状态：**IMPLEMENTED — PENDING INDEPENDENT DATA QA**

## 交付

- `evaluation/starlette-v1/`：schema 说明、严格 validator、pilot hash、15 条 contamination 扫描；
- `pilot/STR-08`、`pilot/STR-05`、`pilot/STR-02`：每案七类分离文件；
- `test/starlette-pilot.test.ts`：10 项正反例；
- `docs/evaluation/starlette-v1-schema-pilot.md`：中文边界、偏差和后续 freeze 输入。

共 3 个目录、4 个 segment、25 个 evidence event、25 个 slice。没有修改 `src/`、package runtime、依赖、MCP 或 Context Compiler policy。

## 关键判断

1. D1 映射与现有 evaluator 一致：每个 GitHub event 是一个 `user` turn，D1 最近 N user turn 等价为最近 N evidence event。
2. `STR-02` 必须拆分。#2516 对 #1715 的引用是历史依赖，不足以证明 #919 background-task 行为与后期 No-response race 是单一根因。
3. 统一污染扫描确认 `STR-02`、`STR-03`、`STR-11`、`STR-12`、`STR-15` 已被公开评测复用。STR-02 仅保留为 schema pilot；不得进入 v1 盲评。
4. 正式 freeze 的最小未污染推荐输入变为 STR-07/08、STR-05/06、STR-01/04，恰好 2 short / 2 medium / 2 long。该集合尚未冻结。

## QA 必查

- 从 GitHub 主来源抽查每个纳入节点的 id、时间、actor、summary 与 digest/commit；
- 特别攻击可变 PR body 是否把后期解释写入早期 summary；
- 验证 STR-02 两段确实无跨段 task、Gold 或 Oracle provenance；
- 验证 Outcome/Decision Reference/Gold/Oracle 不进入 `input_files` 或 `available_event_ids`；
- 原样执行至少 9 类 validator 反例和 hash 篡改；
- 复查 15 条 contamination 的 `confirmed` 与 `no_public_hit_found` 分类，尤其 STR-01、STR-06 的可疑但被排除命中；
- 确认 pilot hash 没有被描述为正式数据 freeze；
- 确认没有 D0/D1/D2、模型回答、aggregate、PASS rate 或 core policy 变更。

## Builder 自检

- `node evaluation/starlette-v1/validate-pilot.mjs`：通过，报告 3 cases / 4 segments / 25 events / 25 slices，hash verified；
- `npx vitest run test/starlette-pilot.test.ts`：10/10；
- `npm test`：12 files / 252 tests 全部通过；
- `npm run test:protocol`：8/8；
- `npm run build`、`git diff --check`：通过；
- 外部研究仅通过公开 GitHub 主来源只读进行，没有克隆 Starlette、提交抓取缓存或原始长正文。

实现者不批准本工单。独立 data QA PASS 前，不得开始正式六案 freeze 或远端 GPT-5.6 实验。
