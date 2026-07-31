# Implementation Plan: 接入真实 LLM Provider

**Branch**: `001-llm-provider-integration` | **Date**: 2026-07-31 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-llm-provider-integration/spec.md`

## Summary

将 OryxOS 现有的 `MockChatProvider` 替换为真实 LLM 调用实现。通过环境变量 `LLM_API_KEY`、`LLM_BASE_URL`、`LLM_MODEL`（默认 `claude-opus-4-8`）配置中转站凭证，使用 Anthropic-compatible Messages 协议（`/v1/messages`）发起真实模型调用。不改动 ReactLoop 的循环结构、不新增依赖框架，只完成 `ChatProvider` 接口的生产实现和相关错误处理。

## Technical Context

**Language/Version**: Java 21

**Primary Dependencies**: Spring Boot 3.3.6（Spring MVC + Actuator + JDBC）；picocli 4.7.6；SnakeYAML；SQLite JDBC 3.46.1.0；Spring Boot Test（JUnit 5）

**Storage**: SQLite（`.oryxos/sessions/oryxos.db`）；本 feature 不新增表或字段

**Testing**: `mvn test`（JUnit 5 + Spring Boot Test）

**Target Platform**: JVM（Linux / macOS / Windows），单节点部署

**Project Type**: Agent OS runtime（CLI + REST API，同一个 jar）

**Performance Goals**: 95% 的普通中文生成请求在 10 秒内返回（SC-001）

**Constraints**: 不引入新的框架依赖；使用 Java 21 自带 `java.net.http.HttpClient`；凭证不得出现在日志/错误输出/用户可见内容中

**Scale/Scope**: 单节点 10 并发 Session；本 feature 不改动并发模型

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| 原则 | 状态 | 说明 |
|------|------|------|
| I. Java-Native Agent OS Core | ✅ 通过 | 只修改 Provider 层实现，不引入新框架；Java 21 HttpClient 为 JDK 内置 |
| II. Markdown-Declared Agent Portability | ✅ 通过 | 不修改 AGENT.md 格式或 Agent 定义约定 |
| III. Security, Privacy, and Auditability | ✅ 通过 | API Key 通过环境变量注入，不出现在日志/错误消息中；LLM 调用继续落 AuditRepository |
| IV. Testable Vertical Slices | ✅ 通过 | US1/US2/US3 各有独立测试路径（单元测试 + API 冒烟 + 集成验证） |
| V. Operational Simplicity and Observability | ✅ 通过 | 不新增数据库/队列/集群；配置继续通过环境变量；错误信息使用中文 |

## Project Structure

### Documentation (this feature)

```text
specs/001-llm-provider-integration/
├── plan.md          # 本文件
├── research.md      # Phase 0：技术决策记录
├── data-model.md    # Phase 1：数据模型（本 feature 不新增实体）
├── quickstart.md    # Phase 1：端到端验证指南
└── contracts/       # Phase 1：接口契约
    └── llm-provider-api.md
```

### Source Code（涉及的文件变更）

```text
code/src/main/java/com/oryxos/
├── provider/
│   ├── ChatProvider.java          # 不变（接口）
│   ├── ChatMessage.java           # 不变（record）
│   ├── ChatResponse.java          # 变更：新增 status/error 字段
│   ├── MockChatProvider.java      # 不变（保留，供 mock provider 回退）
│   └── AnthropicProvider.java     # 新增：真实 LLM 调用实现
├── provider/
│   └── LlmProviderProperties.java # 新增：LLM_API_KEY / LLM_BASE_URL / LLM_MODEL 绑定
└── react/
    └── ReactLoop.java             # 变更：注入 provider 选择逻辑 + 中文 system prompt

code/src/main/resources/
└── application.yml                # 变更：新增 oryxos.provider.llm.* 配置

code/src/test/java/com/oryxos/
└── provider/
    ├── AnthropicProviderTest.java # 新增：单元测试（mock HttpClient + 正常/错误场景）
    └── LlmProviderPropertiesTest.java # 新增：配置绑定测试
```

**Structure Decision**: 采用现有 Maven 单项目结构，在 `com.oryxos.provider` 包下新增文件，不引入新模块。

## Complexity Tracking

无宪法违规需要记录。
