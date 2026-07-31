# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 仓库结构

本仓库同时包含产品文档和 Java 实现：

- `code/` —— OryxOS Java 应用（Maven 工程）。所有构建、运行、测试命令都在此目录下执行。
- `docs/` —— 中文产品文档：`DemandAnalysis.md`（需求）、`IndustryResearch.md`（业界调研）、`oryxos.md`（项目定位）、`VisionAndRoadmap.md`（愿景与路线）。
- `specs/` —— Spec Kit 的 feature 规格/计划/任务（如 `specs/001-llm-provider-integration/`）。
- `.specify/` —— Spec Kit 配置、模板，以及项目宪法 `.specify/memory/constitution.md`（治理原则）。
- `.claude/skills/` —— Spec Kit 的 slash 命令技能（`/speckit-*`）。

当任务提到"规格"或"宪法"时，指 `specs/` 和 `.specify/memory/constitution.md`，不是本文件。

## 构建、测试、运行

所有命令都在 `code/` 下执行（仓库未签入 Maven Wrapper，使用系统 Maven）：

```bash
mvn test                 # 运行测试套件
mvn package              # 构建 target/oryxos-0.1.0-SNAPSHOT.jar
mvn -Dtest=AgentLoaderTest test              # 运行单个测试类
mvn -Dtest=ToolRegistryTest#testName test    # 运行单个测试方法
```

运行应用（`mvn package` 之后）：

```bash
java -jar target/oryxos-0.1.0-SNAPSHOT.jar init                    # 初始化 .oryxos/ 工作区（幂等）
java -jar target/oryxos-0.1.0-SNAPSHOT.jar status
java -jar target/oryxos-0.1.0-SNAPSHOT.jar profile create demo     # 生成 .oryxos/agents/demo/AGENT.md
java -jar target/oryxos-0.1.0-SNAPSHOT.jar chat --profile demo --message "ping"
java -jar target/oryxos-0.1.0-SNAPSHOT.jar serve                   # 在 :8080 启动 REST API
```

`serve` 为 Web 模式；其他首参均为 picocli CLI 命令。`OryxOsApplication` 根据首参选择模式：`serve` → 正常 Spring Boot Web 上下文；其他 → `WebApplicationType.NONE` + picocli。两者共用同一个 jar。

涉及文件系统的测试会把 `ORYXOS_WORKSPACE` / `ORYXOS_SQLITE_PATH` 重定向到 `target/test-workspaces/...`，新增集成测试时请照此处理。

## 架构

OryxOS 是基于 Java 21 / Spring Boot 3.x 的 Agent 运行时。目标端到端链路为 **Agent（markdown）→ AgentLoader → AgentService → ReactLoop → ChatProvider + Tools**，数据落 SQLite，对外通过 REST + CLI 暴露。注意：这条链路里多处仍是骨架（见下文"当前缺口"）。

### Agent 定义格式

一个 Agent 是一个目录 `.oryxos/agents/<name>/AGENT.md`：YAML **frontmatter**（即 `Profile`：provider、model、tools、skills、mcp_servers、channels、bootstrap、settings）+ markdown **正文**（任务指令）。`AgentLoader.load(name)` 把 frontmatter 解析为 `Profile`，并返回 `AgentDefinition(profile, instructions)`。默认模板位于 `code/src/main/resources/templates/`。`WorkspaceService.initWorkspace()` 幂等，绝不覆盖已存在文件。

### 运行时包（`code/src/main/java/com/oryxos/`）

- `agent/` —— `AgentService`（CLI `chat` 与 `POST /api/v1/agents/{name}/invoke` 的统一编排入口）、`AgentLoader`、`AgentDefinition`、`Profile`。
- `react/` —— `ReactLoop`：组装 system prompt、调用 `ChatProvider`、通过 `AuditRepository` 记录 LLM 调用、返回 `ReactResult`。
- `provider/` —— `ChatProvider` 接口（`name()`、`chat(model, messages)`）。目前仅有 `MockChatProvider`。
- `tool/` —— `Tool` 接口 + `ToolRegistry`（自动收集所有 `Tool` Spring Bean，按 `name()` 索引）。内置工具在 `tool/builtin/`（文件/shell/http/memory）。`tool/sandbox/SandboxPolicy` 统一做白名单校验。
- `session/` —— `SessionService`/`SessionRepository` 把对话历史持久化到 SQLite。
- `storage/` —— `SqliteConfig` + `AuditRepository`（LLM 调用 / 工具调用的审计记录）。
- `memory/` —— 基于 `MEMORY.md` 的长期记忆 + `save_memory`/`recall_memory` 工具。
- `workspace/` —— 工作区初始化、模板拷贝、Profile 脚手架。
- `cli/` —— picocli 命令（`OryxosCommand` 为根命令；含 `chat`、`serve`、`init`、`status`、`profile`、`provider`、`tool`、`session`、`gateway`）。
- `api/` —— Spring MVC REST 控制器，路径前缀 `/api/v1/*`（`SystemController`、`AgentController`、`SessionController`、`ToolController`、`ProfileController`、`MemoryController`）。
- `common/` —— `OryxException`、`ErrorCode`、`JsonUtils`。

### 两条入口汇聚到 AgentService

- CLI：`OryxOsApplication` → picocli `OryxosCommand` → `ChatCommand` → `AgentService.invoke(profile, message)`。
- REST：`AgentController.invoke(...)` → `AgentService.invoke(name, message)` → `AgentLoader.load` → `SessionService.create` → `ReactLoop.run` → `SessionService.appendMessage`。

`AgentService.invoke` **每次调用都新建 session**，且在模型调用**之后**才追加历史，因此当前这一轮看不到之前的对话。在假设多轮记忆可用前请记住这一点。

### 配置（`code/src/main/resources/application.yml`）

环境变量驱动，统一在 `oryxos.*` 前缀下，默认值基于 `.oryxos`：

- `ORYXOS_WORKSPACE`（默认 `.oryxos`）、`ORYXOS_SQLITE_PATH`（默认 `<workspace>/sessions/oryxos.db`）、`ORYXOS_PROVIDER`（默认 `mock`）、`ORYXOS_PORT`（默认 `8080`）。
- 沙箱白名单：`oryxos.sandbox.file.allowed-roots`、`oryxos.sandbox.shell.allowed-commands`（默认 `echo,pwd,ls`）、`oryxos.sandbox.http.allowed-domains`（默认 `httpbin.org,api.github.com`）。
- `oryxos.react.max-iterations`（默认 `10`）。

### Provider 选择（真实 LLM vs Mock）

由 `ORYXOS_PROVIDER`（→ `oryxos.provider.default-provider`）通过 `@ConditionalOnProperty` 控制，两个 `ChatProvider` Bean 互斥：

| `ORYXOS_PROVIDER` | 激活的 Bean | 行为 |
|--------------------|-------------|------|
| `mock`（默认） | `MockChatProvider` | 返回 `[mock:<model>] <消息>` 占位内容 |
| `anthropic` | `AnthropicProvider` | 真实调用 Anthropic-compatible Messages API |

`AnthropicProvider` 通过三个环境变量配置（绑定到 `LlmProviderProperties`，前缀 `oryxos.provider.llm`）：

- `LLM_API_KEY`：中转站 API Key（必填，启用真实 provider 时）
- `LLM_BASE_URL`：中转站地址（必填，不含尾部斜杠；provider 自动拼接 `/v1/messages`）
- `LLM_MODEL`：模型名（可选，默认 `claude-opus-4-8`）

`ChatResponse` 带 `Status` 枚举（`SUCCESS` / `CONFIG_ERROR` / `SERVICE_ERROR` / `INVALID_INPUT`）和中文 `errorMessage`，失败时返回中文提示而非模拟内容。凭证只存在内存和 HTTP 请求头，不进日志/异常/审计记录（`AuditRepository.recordLlmCall` 只记 provider/model/耗时）。测试通过 `LlmHttpClient` 接口（隔离 JDK `HttpClient`，便于在 Java 26 上 mock）注入 stub。

### 持久化的坑

`db/migration/V1__init.sql` 迁移脚本存在，但 **Flyway 被禁用**（`spring.flyway.enabled: false`）。`SessionRepository` 用 `CREATE TABLE IF NOT EXISTS` 自建表（`sessions`、`tool_invocations`、`llm_calls`、`agent_executions`）。修改 schema 时要**两处同步**改动（或有意重新启用 Flyway）。

## 宪法 / 治理

`.specify/memory/constitution.md` 定义了五条不可妥协的原则（Java 原生内核、markdown 声明式 Agent 可移植、默认安全/隐私/可审计、可测试的垂直切片、运维简洁可观测）。`/speckit-plan` 生成的计划会据此做 Constitution Check。违反 `MUST` 的视为阻塞性问题。完整文本与修订/版本策略见该文件。

## 当前缺口（改动运行时行为前必读）

骨架能编译，API/CLI 冒烟测试通过，但 Agent 循环尚未完成。不要假设以下功能端到端可用：

- `ReactLoop` 是**单次调用**：列出工具名、注入 agent instructions/identity prompt + 中文输出指令、调用 provider 一次，但**不**解析工具调用、**不**调用 `ToolRegistry.find(...)`、**不**观察结果、**不**按 `max_iterations` 循环。`ToolCall` 类存在但运行时未使用。
- 工具暴露**不**按 `profile.tools()` 过滤——所有已注册工具名都会被广告出去。
- Provider 选择**已接线**：`ORYXOS_PROVIDER=mock`（默认）/`anthropic` 通过 `@ConditionalOnProperty` 互斥激活 `MockChatProvider` / `AnthropicProvider`，详见上节"Provider 选择"。新增第三个 provider 需引入 registry/qualifier。
- `POST /api/v1/sessions/{id}/messages`（`SessionController`）绕过 `AgentService`/`ReactLoop`，返回硬编码的 `[mock:session] ...` 字符串。
- `ShellTool` 通过 `bash -lc` 执行，`SandboxPolicy.checkCommand` 只检查**首个空白分隔 token**，因此白名单只能视为粗粒度防护，不是硬化安全边界。
- `profile delete` 与 `gateway` 是有意留的桩。

实现真正的 ReAct 循环、Provider 选择或按 Profile 的工具裁剪时，以上即为需要改动的集成点。
