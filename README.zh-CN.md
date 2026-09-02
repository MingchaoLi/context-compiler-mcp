[English](README.md) | [简体中文](README.zh-CN.md)

# RippleContext

**面向长期运行 AI Agent 的本地 Context 与 Experience 层。**

RippleContext 希望为用户提供一个不依附于单一 Agent 或 Session 的 Context 层。它在本地保留原始证据，
维护现在仍然有效的状态，并为当前使用的 Agent 编译有界 Context。

> [!WARNING]
> **Experimental Research Preview — Not Production Ready。** 这是一个可以运行但仍未完成的研究实现，
> 不是生产级记忆服务、已证明的安全边界或已验证的跨 Host 上下文缩减方案。

公开项目名是 **RippleContext**。package、executable、MCP server 和 repository 继续保留兼容技术名
**`context-compiler-mcp`**。

## 我们想做什么

### 短期目标

我们希望给用户一个本地、由用户掌握，并且不被单一 Agent 或 Session 锁定的 Context 辅助系统。
当工作转移到新 Session，乃至未来切换到另一个 Agent 或 Host 时，重要的久远事件、当前有效状态和支持证据
不必从零开始重新建立。

当前 Core 已支持显式的跨 Session read scope。无缝的跨 Agent、跨 Host continuity 仍然依赖 adapter
和具体 Host 能力，目前尚未完整实现。

### 长期方向

随着个人数字历史不断增长，我们希望探索一个由用户掌握的 Context 与 Experience 层，持续整理来自不同
Agent、设备、应用和其他来源的事件。

目标不是简单地永久保存所有内容，而是逐渐能够区分：

- 发生过什么；
- 什么现在仍然有效；
- 什么已经失效或被取代；
- 哪些 Action–Outcome–Feedback 序列可能形成可复用 Experience；
- 需要时如何回到原始证据。

这是研究方向，不表示跨设备同步、通用来源整合或 automatic Experience Formation 已经实现。

## 我们已经做到什么

RippleContext 仍是 Research Preview，但主要的本地数据与 Context 链路已经可以运行：

- **本地 append-only 历史：** SQLite Raw Event 存储，具有按 Session 排序和 source-event 幂等语义。
- **显式当前 State：** typed Goal、Constraint、Decision、Open Question 和 Rejected Alternative，
  以及确定性的 lifecycle 和 relation 更新。
- **跨 Session scope：** 调用方可以声明有 frozen ancestor frontier 和当前 write Session 的有序
  read scope。
- **有界 Context compilation：** current input、active State、dependency closure、最近完整用户轮次、
  有界 BM25 recall，以及可选的 caller-supplied Dense vector。
- **可追溯证据：** 派生 State 保留 source event 链接；可以按 Event、范围或 headline 精确恢复证据。
- **本地 MCP 访问：** 提供精确九个工具和窄化、脱敏公开结果的 stdio server。
- **Canonical integrity primitives：** revisioned Raw、State、Fact、Relation、immutable Snapshot、
  provenance 和 exact replay。

存储、事务、revision、幂等、replay、provenance 和 Snapshot 边界已经具有较多 deterministic 与
adversarial QA 覆盖。这是 implementation correctness 证据，不是跨 Host 产品质量证明。

### 开发评测证据：更少的回答输入与接近的有界质量

我们使用维护者自己的真实长期聊天历史，构造了六个冻结 Case 的有界开发评测。由于来源历史属于私密数据，
对话、回答、日志和数据库不会公开；这里只公开聚合结果和解释边界。

比较中的 `RC Raw-only` 只使用 Raw history retrieval 与 compilation，**没有**启用计划中的
Semantic Formation、State/Fact/Relation Formation 或小模型 fallback。

#### Codex Compaction vs RC Raw-only

原始 run 中五个共同有效 Case：

| 指标 | Codex Compaction | RC Raw-only |
| --- | ---: | ---: |
| Gold 保留 | 16/19 | 15.5/19 |
| 质量中位数 | 4.25 | 3.75 |
| 回答阶段输入 token | 208,354 | 122,407 |
| stale resurrection Case | 0/5 | 0/5 |
| negative transfer Case | 0/5 | 1/5 |

在这次有界 run 中，RC 使用少约 **41.3% 的回答阶段输入 token**，同时保留 Codex
**96.875%** 的 Gold 分数。它的质量中位数低 0.5，并仍有一个 negative-transfer Case。

#### Pi Native vs RC Raw-only

后续 post-hoc Pi Native supplement 中五个共同有效 Case：

| 指标 | RC Raw-only | Pi Native |
| --- | ---: | ---: |
| 有效回答 | 5/5 | 5/5 |
| 补充盲评 Gold | 14/19 | 15.5/19 |
| 质量中位数 | 3.25 | 3.25 |
| Critical-false Case | 2/5 | 5/5 |
| stale-resurrection Case | 0/5 | 4/5 |
| negative-transfer Case | 1/5 | 3/5 |
| 回答阶段输入 token | 122,407 | 2,723,763 |
| 最长 Case（C06） | 完成 | Context overflow |

在五个共同 Case 中，RC 的回答阶段输入少约 **95.5%**。Pi Native 在补充盲评中覆盖了更多 Gold，
但也带回了更多矛盾或已失效内容。最长 Case 中 RC 完成运行，而 Pi Native 的回答请求和
overflow-compaction recovery 都超过了容量。

这些结果有希望，但边界很窄：

- Pi run 是更晚执行的 post-hoc development supplement，存在时间漂移风险；
- supplement 不是 Independent QA、hidden holdout 或最终资格；
- Pi 结果总体分类为 `PARTIAL`；
- Codex 的 compaction-generation usage 不可观测，因此 41.3% 只是回答阶段输入比较，
  不是严格的端到端成本比较；
- Pi token 在 Pi provider boundary 观察，不是精确 provider HTTP payload；
- 五个共同 Case 不能证明稳健性、一般化或跨 Host final-input 收益。

公开证据说明：

- [脱敏评测方案](docs/qa/WO-DG-02-private-history-evaluation-protocol.md)
- [脱敏聚合结果](docs/qa/WO-DG-02-private-history-evaluation-results.md)

## 我们怎么理解和实现这个问题

RippleContext 不把每一段被记住的内容都视为同样有效，而是关注一个事件的 lifecycle：

```text
发生了一件事
      ↓
Raw Event
保留原始来源
      ↓
Fact / State
表示它对“现在”意味着什么
      ↓
Lifecycle
后续证据可能更新、解决、否定或取代它
      ↓
Action → Outcome → Feedback
形成潜在 Experience 的研究数据
      ↓
Context Compilation
为当前任务选择有界、当前有效且可追溯的 Context
      ↓
Agent / Host
```

实现遵循几个原则：

- **历史不等于当前事实。**
- **Relevant 不一定表示现在仍然 Valid。**
- **Summary 不是 Authority boundary。**
- **派生 State 应继续连接原始证据。**
- **外部 extractor 可以提出 State Delta，但 deterministic Core 代码负责校验并 apply transition。**
- **前台 suppress 或 compact 不得删除 authoritative Raw history。**
- **Experience 不只是一次对话摘要，而是关于可复用 Action–Outcome–Feedback 结构的研究假设。**

Raw history、typed State、lifecycle、provenance、Snapshot、deterministic compilation 和
append-only Experience Ledger 数据面目前已经存在。Automatic Experience Formation、promotion 和
learned behavior 尚未实现。

## 我们准备继续做什么

近期方向包括：

- 更简单的本地安装和配置；
- 不同 Agent 与 Host 的快速、有界接入；
- 开展 `Pi + RC Semantic` pilot，验证能否保留更广覆盖，同时减少 Pi Native 的旧状态复活、
  负迁移和容量成本；
- 基于真实 Action–Outcome–Feedback 记录的 Experience Formation 与 promotion 实验；
- 更强的跨 Session 与跨 Host continuity；
- 本地诊断能力和更简单的 UI；
- 更多真实长期 dogfood，以及可审计的 quality–token frontier；
- 长期探索具备隐私边界的跨设备、跨来源整理。

这些是方向，不是已经交付的功能或 release 承诺。长期目标不是让用户手动管理一个 memory database，
而是让 Context 层逐渐退到后台。

## 5 分钟 Quickstart

### 环境要求

- Node.js 24 或更高版本
- npm

### Clone 和 build

```sh
git clone https://github.com/MingchaoLi/context-compiler-mcp.git
cd context-compiler-mcp
npm install --no-audit --no-fund
npm run build
```

### 写入一条事件并编译 Context

下面的 smoke path 使用项目依赖中已经安装的 MCP client。它会启动 stdio server、写入一条本地事件、
为后续问题编译 Context，并打印公开结果。

```sh
mkdir -p .ripplecontext-local

node --input-type=module <<'EOF'
import { resolve } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const transport = new StdioClientTransport({
  command: process.execPath,
  args: [resolve("dist/mcp-server.js")],
  env: {
    ...process.env,
    CONTEXT_COMPILER_DB_PATH: resolve(".ripplecontext-local/quickstart.db"),
  },
  stderr: "inherit",
});

const client = new Client({
  name: "ripplecontext-quickstart",
  version: "1.0.0",
});

await client.connect(transport);

try {
  const ingest = await client.callTool({
    name: "ingest_event",
    arguments: {
      session_id: "readme-quickstart",
      role: "user",
      content: "The deployment target is a local research environment.",
      source_event_id: "quickstart-1",
    },
  });

  const compile = await client.callTool({
    name: "compile_context",
    arguments: {
      session_id: "readme-quickstart",
      current_input: "What is the deployment target?",
    },
  });

  const read = (result) =>
    result.structuredContent ?? JSON.parse(result.content[0].text);

  console.log(JSON.stringify({
    ingest: read(ingest),
    compile: read(compile),
  }, null, 2));
} finally {
  await client.close();
}
EOF
```

`compile.result.context.rendered_context` 应在 `Recent Conversation` 下包含刚才写入的句子。
这证明了本地事件存储和有界 compilation 的最短闭环；它不会执行 automatic State extraction。

### 通用 stdio MCP 配置

不同 Host 的 MCP 配置语法不同，但进程定义如下：

```json
{
  "mcpServers": {
    "ripplecontext": {
      "command": "node",
      "args": ["/absolute/path/to/context-compiler-mcp/dist/mcp-server.js"],
      "env": {
        "CONTEXT_COMPILER_DB_PATH": "/absolute/path/to/ripplecontext.db"
      }
    }
  }
}
```

新集成应使用 `CONTEXT_COMPILER_DB_PATH`。`DSH_HOME/sessions/context-compiler.db` 仅保留为
legacy fallback。

Server 精确提供以下九个工具：

| 用途 | MCP tools |
| --- | --- |
| Readiness | `health` |
| Raw history | `ingest_event` |
| Context | `compile_context` |
| State | `get_state`、`prepare_state_update`、`apply_state_delta` |
| Evidence recall | `create_headline`、`recall_exact`、`recall_keyword` |

## 当前限制

- RippleContext 是 experimental、未完成且 not production ready 的 Research Preview。
- 当前没有任何 Host 拥有由本 Core 仓库正式验证的 compiler mode。Host adapter 和 deployment behavior
  位于其他仓库。
- Append 或 Context injection 不等于 history replacement。`SHORT_REPLACE` 和
  `LONG_REPLACE` 是 provider-neutral router suggestion，不证明某个 Host 已替换 native history。
- Core 不拥有最终 provider request。本项目**没有证明跨 Host 的最终模型输入 token reduction**。
- `compile_context` 和 `ingest_event` 不会隐式调用 extractor、model、provider 或 network，
  也不会隐式演进 State。
- Dense retrieval 需要 caller 提供完整兼容覆盖的 vector。它的 semantic benefit、更广泛的 Context
  benefit 和 Experience Formation benefit 尚未验证。
- Automatic headline generation 尚未实现。
- 上述私有历史评测属于 development evidence，不是公开可复现 benchmark。来源记录不能在不泄露
  私密对话的情况下公开。
- Legacy `CompiledContext` 与 canonical `ContextSnapshot` 是两个独立的 library surface。
  不得把 `CompiledContext` 当作具备 canonical Snapshot 的 exact
  revision/evidence/attempt/authority 保证。
- Windows 和精确 Node.js 24 runtime 尚未单独验证。

## Architecture

| 概念 | 作用 |
| --- | --- |
| **Raw Event** | Append-only 的来源历史，用于 replay 和 evidence recovery。 |
| **State** | 关于当前什么仍有效的 typed claim，例如 Goal、Constraint、Decision 和 Open Question。 |
| **Lifecycle** | Supersede、resolve、reject 等显式 transition；由代码拥有并校验。 |
| **Provenance** | 从派生 State 或 Context 返回来源证据与 revision identity 的链接。 |
| **Experience** | Action、Outcome、Feedback 和 candidate experience 的 append-only 记录；automatic formation 属于未来研究。 |
| **CompiledContext** | 当前 compiler 与公开 MCP projection 使用、以兼容为目标的有界 Context 输出。 |
| **ContextSnapshot** | 独立的 canonical library contract，提供 immutable scope/as-of/manifest/attempt evidence 与 exact replay；它不是 MCP tool，也不证明 Host 已消费。 |
| **Deterministic authority boundary** | 外部 extractor 可以提出 State Delta；Core 代码严格校验并原子 apply。 |

建议从 [Architecture overview](docs/ARCHITECTURE.md) 开始。Canonical Snapshot 边界另见
[ContextSnapshot contract](docs/architecture/WO-05-context-snapshot-contract.md)。
当前已接受范围与未解决缺口记录在 [PROJECT_STATE](docs/PROJECT_STATE.md)。

## Research、QA 与设计历史

本仓库有意保留设计如何演化的证据：

- [Work Orders](docs/work-orders/) 记录有界实现和研究范围。
- [QA findings](docs/qa/) 包含 accepted result、return 和已复现反例。
- [Adversarial reviews](docs/adversarial-reviews/) 质疑假设和投入顺序。
- [Evaluation artifacts](evaluation/) 保留公开 fixture、诊断结果及其解释边界。
- [Decisions](docs/DECISIONS.md) 和 [Roadmap](docs/ROADMAP.md) 标明当前及历史边界。

### 精选 QA 证据

以下记录适合作为理解仓库验证历史的入口，但它们不是一个可以累加的总 benchmark：多份报告重复运行了
同一套 regression suite，因此不能把测试数量简单相加。

- **长期对话 dogfood：** [WO-DG-01](docs/qa/WO-DG-01-codex-long-conversation-dogfood.md)
  独立核查了脱敏真实使用 observation、targeted recovery、算术和已报告 miss，没有把结果扩大成通用
  Host claim。
- **有界私有历史比较：** [评测方案](docs/qa/WO-DG-02-private-history-evaluation-protocol.md)和
  [聚合结果](docs/qa/WO-DG-02-private-history-evaluation-results.md)记录了上文使用的 Codex、Pi Native
  与 RC Raw-only development comparison。
- **Snapshot 完整性：** [首次 omission attack](docs/qa/WO-05-context-snapshot-contract.md)与
  [已接受修复](docs/qa/WO-05-context-snapshot-contract-fix.md)展示了如何复现 coordinated provenance
  缺失，并通过 owner-bound projection receipt 将其关闭。
- **Foundation freeze：** [WO-V0-15](docs/qa/WO-V0-15-experience-ready-foundation-freeze.md)以
  append-only 方式保留多轮 FAIL → fix → re-QA，覆盖 transaction、幂等、replay、migration、并发、
  telemetry completeness 和 production packaging。
- **原子 State update：** [WO-ST-01](docs/qa/WO-ST-01-state-update-pipeline.md)验证严格 prepare、原子
  apply、revision conflict、rollback、retry 和真实 stdio packaging。
- **公开 MCP 隐私边界：** [首次 return](docs/qa/WO-PUB-01-public-mcp-result-boundary.md)与
  [已接受修复](docs/qa/WO-PUB-01-public-mcp-result-boundary-fix.md)验证公开结果的 closed allowlist，
  同时保留内部 diagnostic 与 telemetry。
- **评测器有效性：** [WO-EV-02](docs/qa/WO-EV-02-evaluator-validity-calibration.md)保留最初的
  provenance/parser failure 和随后关闭问题的 Independent re-QA，包括 `not_evaluable` 与
  current-input isolation 检查。

失败报告继续公开，因为它们本身就是证据。对于成对记录，应以 fix 或最终 re-QA 小节判断当前状态。

部分早期设计在实验或 QA 反例后被修正。这些记录是有价值的研究 provenance，但并非每份历史文档都是
当前 Authority。

## License

[Apache License 2.0](LICENSE)
