# Research: 接入真实 LLM Provider

**Branch**: `001-llm-provider-integration` | **Date**: 2026-07-31

本文件记录 Phase 0 的关键技术决策。所有 `NEEDS CLARIFICATION` 已在 `/speckit-clarify` 阶段解决。

---

## R1. HTTP 客户端选型

**Decision**: 使用 Java 21 自带的 `java.net.http.HttpClient`（JDK 11+ 内置）。

**Rationale**:
- 项目宪法原则 I（Java-Native Agent OS Core）要求避免不必要的新框架。
- `pom.xml` 当前未引入任何 HTTP 客户端依赖（无 Spring WebClient、无 OkHttp、无 Apache HttpClient）。
- JDK HttpClient 支持同步 + 异步、连接池、超时配置，完全满足本需求。
- 不增加 `pom.xml` 依赖，符合宪法原则 V（运维简洁）。

**Alternatives considered**:
- **Spring `RestTemplate` / `WebClient`**: 需要确认是否已随 `spring-boot-starter-web` 可用。`RestTemplate` 可用但偏向同步 REST 模板；`WebClient` 需要 `spring-boot-starter-webflux`（响应式栈，与宪法原则 I 的"同步执行"导向冲突）。HttpClient 更直接、无额外依赖。
- **OkHttp / Apache HttpClient**: 需要新增 `pom.xml` 依赖，增加运维复杂度，无必要收益。

---

## R2. Anthropic-compatible Messages 协议请求格式

**Decision**: 向 `${LLM_BASE_URL}/v1/messages` 发送 `POST`，请求体遵循 Anthropic Messages API：

```json
{
  "model": "<LLM_MODEL 或 claude-opus-4-8>",
  "max_tokens": 1024,
  "system": "<可选 system prompt>",
  "messages": [
    {"role": "user", "content": "<用户输入>"}
  ]
}
```

请求头：
```
x-api-key: <LLM_API_KEY>
anthropic-version: 2023-06-01
content-type: application/json
```

**Rationale**:
- `/speckit-clarify` Session 2026-07-31 确认使用 Anthropic-compatible Messages 协议。
- 中转站（relay/proxy）通常按 Anthropic 官方协议透传，因此请求格式与 Anthropic 官方 API 一致。
- `max_tokens` 是 Anthropic Messages API 必填字段；本 feature 取保守默认值 1024（足够中文短回复）。
- `anthropic-version: 2023-06-01` 是 Anthropic 官方稳定版本头。

**Response 解析**:
```json
{
  "id": "msg_...",
  "type": "message",
  "role": "assistant",
  "model": "claude-opus-4-8",
  "content": [{"type": "text", "text": "<生成内容>"}],
  "stop_reason": "end_turn",
  "usage": {"input_tokens": N, "output_tokens": M}
}
```

提取 `content[0].text` 作为生成结果。

**Alternatives considered**:
- **OpenAI-compatible 协议**（`/v1/chat/completions`）：被 clarify 阶段否决（用户选择 B = Anthropic-compatible）。
- **自定义协议**：被 clarify 阶段否决。

---

## R3. 配置项绑定

**Decision**: 新增 `LlmProviderProperties`（`@ConfigurationProperties(prefix = "oryxos.provider.llm")`），绑定三个环境变量：

| 环境变量 | 配置键 | 默认值 | 必填 |
|----------|--------|--------|------|
| `LLM_API_KEY` | `oryxos.provider.llm.api-key` | 无 | 是（真实 provider 启用时） |
| `LLM_BASE_URL` | `oryxos.provider.llm.base-url` | 无 | 是（真实 provider 启用时） |
| `LLM_MODEL` | `oryxos.provider.llm.model` | `claude-opus-4-8` | 否 |

`application.yml` 新增：
```yaml
oryxos:
  provider:
    default-provider: ${ORYXOS_PROVIDER:mock}
    llm:
      api-key: ${LLM_API_KEY:}
      base-url: ${LLM_BASE_URL:}
      model: ${LLM_MODEL:claude-opus-4-8}
```

**Rationale**:
- Spring Boot 的 relaxed binding 自动把 `LLM_API_KEY` 映射到 `oryxos.provider.llm.api-key`。
- 保留 `oryxos.provider.default-provider`（默认 `mock`）作为 provider 选择开关：`mock` 用 `MockChatProvider`，`anthropic`（或 `llm`）用真实 provider。
- 凭证只在 `LlmProviderProperties` 内存中持有，不进入日志。

**Alternatives considered**:
- 直接读 `System.getenv()`：绕过 Spring 配置体系，不利于测试和文档化。采用 `@ConfigurationProperties` 更符合 Spring Boot 习惯。

---

## R4. Provider 选择与 ReactLoop 接线

**Decision**: 引入一个简单的 provider 选择逻辑（不引入完整 registry）：

- 当 `oryxos.provider.default-provider = anthropic`（或 `llm`）时，Spring 注入 `AnthropicProvider` 作为 `ChatProvider` bean。
- 当为 `mock` 时，保持现状注入 `MockChatProvider`。
- 用 Spring `@ConditionalOnProperty` 实现互斥，避免同时存在两个 `ChatProvider` bean 导致注入歧义。

`ReactLoop` 构造签名不变（仍注入单个 `ChatProvider`），只是注入的实例根据配置切换。

**Rationale**:
- 现状 `ReactLoop` 直接注入唯一 `ChatProvider` bean，最小改动。
- 不引入 `ProviderRegistry` 复杂度（宪法原则 V），因为本 feature 只有两个 provider。
- `@ConditionalOnProperty` 是 Spring Boot 原生机制，无需新代码。

**Alternatives considered**:
- **ProviderRegistry 模式**：按 name 查找 provider。更通用，但本 feature 只有 mock + anthropic 两个，过度设计。留给后续多 provider feature。
- **限定符（@Qualifier）**：需要硬编码 bean 名，不如 `@ConditionalOnProperty` 配置驱动。

---

## R5. 默认中文输出

**Decision**: 修改 `ReactLoop` 的 system prompt，在原有英文 prompt 基础上追加中文输出指令：

```
You are running inside OryxOS. Available tools: [...]
默认使用中文回答用户。除非用户明确要求其他语言，否则所有面向用户的回复必须使用中文。
```

**Rationale**:
- FR-003 / FR-004 要求默认中文、尊重用户指定语言。
- 通过 system prompt 引导是最简单、不侵入模型选择的方式。
- 用户在 message 中明确要求英文时，模型会遵循（FR-004）。

**Alternatives considered**:
- 在 `AnthropicProvider` 里强制注入 `system` 字段：与 ReactLoop 已有的 system prompt 职责重叠，分散关注点。集中在 ReactLoop 更清晰。

---

## R6. 错误处理与中文反馈

**Decision**: `AnthropicProvider` 把 HTTP/网络错误映射为带中文消息的 `OryxException`（复用 `common/OryxException` + `ErrorCode`）：

| 场景 | 触发条件 | 中文消息（示例） | HTTP 状态/异常 |
|------|----------|------------------|----------------|
| 凭证缺失 | `LLM_API_KEY` 为空 | "未配置 LLM 访问凭证（LLM_API_KEY），请设置后重试。" | 启动/调用前置校验 |
| 凭证无效 | 401 / 403 | "LLM 访问凭证无效或已过期，请检查 LLM_API_KEY。" | 401/403 |
| 服务不可用 | 5xx / 连接失败 | "LLM 服务暂时不可用，请稍后重试。" | 5xx/IOException |
| 超时 | 读取超时 | "LLM 请求超时，请稍后重试或缩短输入。" | HttpTimeoutException |
| 速率限制 | 429 | "LLM 请求过于频繁，请稍后重试。" | 429 |
| 空响应 | content 为空 | "模型未返回有效内容，请重试或调整问题。" | 200 但 content 空 |

**Rationale**:
- FR-005 / FR-007 / FR-009 要求区分失败类型并给中文反馈。
- 复用 `OryxException` 保持错误处理一致性，不引入新异常体系。
- 凭证值**绝不**进入异常消息或日志（FR-006）。

**`ChatResponse` 扩展**:
新增 `status` 枚举（`SUCCESS` / `CONFIG_ERROR` / `SERVICE_ERROR` / `INVALID_INPUT`）和可选 `errorMessage`，让调用方能区分成功与失败（FR-009）。

**Alternatives considered**:
- 抛异常让上层捕获：丢失结构化状态，难以在 REST 响应里返回可验证状态。改为在 `ChatResponse` 里带 status + 中文消息，上层（AgentService / Controller）决定如何呈现。

---

## R7. 凭证安全与审计

**Decision**:
- `LLM_API_KEY` 只存在 `LlmProviderProperties` 内存字段，`AnthropicProvider` 设置请求头时使用。
- 日志（`AuditRepository.recordLlmCall`）只记录 provider name、model、耗时，**不**记录 key、不记录完整请求/响应体。
- 异常消息只描述问题类别，不含 key 片段。
- 如果需要在测试中打印请求体用于调试，使用专门的 debug 日志级别，并对 `Authorization` / `x-api-key` 头脱敏。

**Rationale**:
- 宪法原则 III 的硬性要求（FR-006，SC-004）。
- 现有 `AuditRepository.recordLlmCall(sessionId, provider, model, durationMs)` 已经不含敏感字段，保持不变即可。

---

## R8. 测试策略

**Decision**: 三层测试：

1. **单元测试 `AnthropicProviderTest`**：用一个可注入的 `HttpClient`（或通过 `protected` 方法包装以便子类覆盖），mock 返回 200/401/429/5xx/超时，断言 `ChatResponse.status` 和中文错误消息。不发起真实网络请求。
2. **配置测试 `LlmProviderPropertiesTest`**：验证环境变量→配置绑定、默认 model。
3. **集成验证（quickstart）**：用真实凭证手动跑 `chat --profile demo --message "你好"`，确认返回非固定中文内容。

**Rationale**:
- 宪法原则 IV 要求 Provider 变更必须有自动化测试。
- 单元测试覆盖错误分支，不依赖外部服务（CI 友好）。
- 真实调用作为 quickstart 手动验证，避免测试套件依赖网络和真实凭证。

**Alternatives considered**:
- **WireMock** 启动 mock HTTP server：更真实但需要新增 `pom.xml` 测试依赖。本 feature 用可注入 HttpClient + 手写 stub 更轻量。

---

## 已解决的 NEEDS CLARIFICATION 汇总

| 原疑问 | 决议来源 | 结论 |
|--------|----------|------|
| 接入范围 | clarify 2026-07-30 | 只替换现有 mock/占位调用点 |
| 配置约定 | clarify 2026-07-30 | `LLM_API_KEY` + `LLM_BASE_URL` |
| 接口协议 | clarify 2026-07-31 | Anthropic-compatible Messages |
| 模型名 | clarify 2026-07-31 | `LLM_MODEL`，默认 `claude-opus-4-8` |

无遗留 `NEEDS CLARIFICATION`。
