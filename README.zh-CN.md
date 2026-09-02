[English](README.md) | [简体中文](README.zh-CN.md)

# RippleContext

**面向长期运行 AI Agent 的本地上下文与经验基础设施。**

RippleContext 不只保存“过去发生过什么”。它提供一个与模型无关的 Core，用来维护“现在什么仍然成立、
状态如何变化，以及哪些原始证据支持这些状态”。仓库包含本地 SQLite 数据面、
TypeScript/JavaScript library 和 stdio MCP server。

> [!WARNING]
> **Experimental Research Preview — Not Production Ready。** 这是一个可以运行但仍未完成的研究实现，
> 不是生产级记忆服务、已证明的安全边界或已验证的跨 Host 上下文缩减方案。

公开项目名是 **RippleContext**。package、executable、MCP server 和 repository 继续保留兼容技术名
**`context-compiler-mcp`**。

## 为什么需要它

长期运行的 Agent 会积累越来越多的历史，而这些历史不适合全部进入每一次模型调用：

- 对话和工具结果不断增长；
- 已被取代的旧决定可能重新出现；
- 已失效的信息仍然可能很容易被检索出来；
- “过去相关”不等于“现在具有权威性”；
- 加入更多历史或另一份 summary，本身不能建立 current truth。

一次基础的 memory search 可能同时找到原始决定和后来取代它的证据。困难不只在于找到相关文本，
还在于维护决定的 lifecycle、识别哪个版本当前有效，并保留返回原始证据的路径。

## RippleContext 做什么

```text
原始历史（append-only、可追溯）
                 ↓
          显式 State 更新
                 ↓
当前 State + lifecycle + provenance
                 ↓
    有界 Context compilation 与 recall
                 ↓
            Host / Agent
```

RippleContext 将可追溯历史与当前工作状态分开：

- Raw Event 保持 append-only，并可作为证据精确恢复；
- typed State 通过显式、受校验的 lifecycle transition 变化；
- 派生 State 保留来源证据链接；Core/library compilation 保留内部 provenance diagnostics，
  而公开 MCP result 有意使用更窄的投影；
- context compilation 组合 current input、active State、recent Raw Event 和有界 recall；
- Host integration 是独立职责，因此内容最终如何送入模型取决于具体 Host。

长期研究方向包括从 Action、Outcome 和 Feedback 记录中形成经验。当前仓库已经提供 append-only
Experience Ledger 数据面，但 automatic Experience Formation、promotion 和 learned behavior 尚未实现。

## 它与基础 Memory Store 有什么不同

> 基础 memory retrieval 问：**过去哪些内容相关？**
>
> RippleContext 还会问：**它现在是否仍然有效、什么取代了它，以及哪些证据支持它？**

这不表示普通历史、summary 或 retrieval 没有必要。RippleContext 将它们视为不同层：
Raw history 是证据，retrieval 用来发现候选，而显式 State/lifecycle 规则决定什么可以被视为当前有效。

## 当前已经可以做什么

当前仓库已经实现并测试：

- **本地 append-only 历史：** SQLite Raw Event 存储，具有按 Session 排序和 source-event 幂等语义。
- **显式当前 State：** typed Goal、Constraint、Decision、Open Question 和 Rejected Alternative，
  以及确定性的 lifecycle 和 relation 更新。
- **安全的 State 更新边界：** immutable preparation snapshot，以及对外部生成 State Delta 的严格、
  原子 apply。
- **有界 Context compilation：** current input、active State、dependency closure、最近完整用户轮次、
  有界 BM25 recall，以及可选的 caller-supplied Dense vector。
- **可追溯证据 recall：** 按 Event、范围或 headline 精确恢复，以及对已存 headline 的 literal keyword
  search。
- **Canonical authority primitives：** revisioned Raw、State、Fact、Relation、provenance、replay，
  以及独立、仅供 library 使用的 canonical `ContextSnapshot` contract。
- **本地 MCP 访问：** 提供精确九个工具和脱敏公开结果的 stdio server。
- **离线研究评估：** versioned、provider-neutral 的 D0/D1/D2 fixture 和 deterministic measurement。
  它们是研究诊断，不是一般有效性的证明。

Core 不选择模型 provider，也不发起网络请求。可选 library transport 可以调用本地 extractor
subprocess，但该进程自行负责 provider、网络和凭据。

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
- 当前没有任何 Host 拥有由本仓库正式验证的 compiler mode。Host adapter 和 deployment behavior
  位于 Core 之外。
- Append 或 context injection 不等于 history replacement。`SHORT_REPLACE` 和
  `LONG_REPLACE` 是 provider-neutral router suggestion，不证明某个 Host 已替换 native history。
- Core 不拥有最终 provider request。本项目**没有证明跨 Host 的最终模型输入 token reduction**。
- `compile_context` 和 `ingest_event` 不会隐式调用 extractor、model、provider 或 network，
  也不会隐式演进 State。
- Dense retrieval 需要 caller 提供完整兼容覆盖的 vector。它的 semantic benefit、更广泛的 Context
  benefit 和 Experience Formation benefit 尚未验证。
- Automatic headline generation 尚未实现。
- 离线 evaluator 和当前 dogfood 记录只属于诊断证据，不证明 D2 优于 D1、稳健性、一般化，
  或优于其他系统。
- Legacy `CompiledContext` 与 canonical `ContextSnapshot` 是两个独立的 library surface。
  不得把 `CompiledContext` 当作具备 canonical Snapshot 的 exact
  revision/evidence/attempt/authority 保证。
- Windows 和精确 Node.js 24 runtime 尚未单独验证。

## Architecture

理解基本问题之后，主要内部概念如下：

| 概念 | 作用 |
| --- | --- |
| **Raw Event** | Append-only 的来源历史，可用于 replay 和 evidence recovery。 |
| **State** | 关于当前什么仍有效的 typed claim，例如 Goal、Constraint、Decision 和 Open Question。 |
| **Lifecycle** | Supersede、resolve、reject 等显式 transition；由代码拥有并校验。 |
| **Provenance** | 从派生 State 或 Context 返回来源证据与 revision identity 的链接。 |
| **Experience** | Action、Outcome、Feedback 和 candidate experience 的 append-only 研究记录；automatic formation 属于未来研究。 |
| **CompiledContext** | 当前 compiler 与公开 MCP projection 使用、以兼容为目标的有界 Context 输出。 |
| **ContextSnapshot** | 独立的 canonical library contract，提供 immutable scope/as-of/manifest/attempt evidence 与 exact replay；它不是 MCP tool，也不证明 Host 已消费。 |
| **Deterministic authority boundary** | 外部 extractor 可以提出 State Delta；Core 代码严格校验并原子 apply transition。 |

建议从 [Architecture overview](docs/ARCHITECTURE.md) 开始。Canonical Snapshot 边界另见
[ContextSnapshot contract](docs/architecture/WO-05-context-snapshot-contract.md)。
当前已接受范围与未解决缺口记录在 [PROJECT_STATE](docs/PROJECT_STATE.md)。

## Research、QA 与设计历史

本仓库有意保留设计如何演化的证据：

- [Work Orders](docs/work-orders/) 记录有界实现和研究范围。
- [QA findings](docs/qa/) 包含 accepted result、return 和已复现反例。
- [Adversarial reviews](docs/adversarial-reviews/) 质疑假设和投入顺序。
- [Evaluation artifacts](evaluation/) 保留 fixture、诊断结果及其解释边界。
- [Decisions](docs/DECISIONS.md) 和 [Roadmap](docs/ROADMAP.md) 标明当前及历史边界。

部分早期设计在实验或 QA 反例后被修正。这些记录是有价值的研究 provenance，但并非每份历史文档都是
当前 Authority。大多数开发者可以先阅读本 README、Architecture overview 和 PROJECT_STATE，
不必通读全部历史材料。

## License

[Apache License 2.0](LICENSE)
