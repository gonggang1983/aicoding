# Data Model: 接入真实 LLM Provider

**Branch**: `001-llm-provider-integration` | **Date**: 2026-07-31

本 feature 不新增数据库表或持久化实体。SQLite schema（`sessions`、`tool_invocations`、`llm_calls`、`agent_executions`）保持不变。本文件记录**代码层**的数据结构变更（record / 配置类）。

---

## 变更：`ChatResponse` record

**当前**:
```java
public record ChatResponse(String content, String provider, String model) {}
```

**变更后**（新增 `status` 与 `errorMessage`，保持向后兼容）:
```java
public record ChatResponse(
    String content,        // 生成内容（失败时可为空）
    String provider,       // provider 名称，如 "anthropic"
    String model,          // 模型名，如 "claude-opus-4-8"
    Status status,         // SUCCESS / CONFIG_ERROR / SERVICE_ERROR / INVALID_INPUT
    String errorMessage    // 失败时的中文消息（成功时为 null）
) {
    public enum Status { SUCCESS, CONFIG_ERROR, SERVICE_ERROR, INVALID_INPUT }

    // 兼容旧调用的便捷工厂方法
    public static ChatResponse success(String content, String provider, String model) { ... }
    public static ChatResponse error(Status status, String provider, String model, String errorMessage) { ... }
}
```

**校验规则**:
- `status == SUCCESS` 时 `content` 不应为空（除非模型返回空，此时应为 `SERVICE_ERROR` + 中文消息）。
- `status != SUCCESS` 时 `errorMessage` 不应为空，且必须为中文（FR-005）。

**关系**: 由 `AnthropicProvider` / `MockChatProvider` 构造，由 `ReactLoop` / `AgentService` 消费。

---

## 新增：`LlmProviderProperties` 配置类

```java
@ConfigurationProperties(prefix = "oryxos.provider.llm")
public record LlmProviderProperties(
    String apiKey,    // 来自 LLM_API_KEY
    String baseUrl,   // 来自 LLM_BASE_URL
    String model      // 来自 LLM_MODEL，默认 claude-opus-4-8
) {
    public boolean isConfigured() {
        return apiKey != null && !apiKey.isBlank()
            && baseUrl != null && !baseUrl.isBlank();
    }
}
```

**校验规则**:
- `model` 为空时由配置层兜底为 `claude-opus-4-8`（FR-011）。
- `isConfigured()` 用于 provider 选择与启动期友好提示，**不**抛异常（保持 mock 回退能力）。

---

## 不变：`ChatMessage` record

```java
public record ChatMessage(String role, String content) {}
```

`role` ∈ {`system`, `user`, `assistant`}。`AnthropicProvider` 把 `system` 角色单独映射到 Anthropic 请求的顶层 `system` 字段，其余作为 `messages` 数组。

---

## 不变：`ChatProvider` 接口

```java
public interface ChatProvider {
    String name();
    ChatResponse chat(String model, List<ChatMessage> messages);
}
```

`AnthropicProvider` 实现此接口；`model` 参数优先于 `LlmProviderProperties.model`（由 ReactLoop 决定传入哪个，通常用 profile 里配置的 model 或配置默认值）。

---

## 不变：审计记录（`llm_calls` 表）

`AuditRepository.recordLlmCall(sessionId, provider, model, durationMs)` 签名不变。本 feature **不**记录请求体/响应体/凭证，符合 FR-006 / SC-004。后续若需记录 token 用量，作为独立 feature 处理。

---

## 状态机：单次 LLM 调用状态流转

```
[发起调用]
   │
   ├─ LLM_API_KEY 或 LLM_BASE_URL 缺失 → CONFIG_ERROR（中文提示）
   ├─ 输入为空/空白 → INVALID_INPUT（中文提示，FR-008）
   ├─ HTTP 401/403 → CONFIG_ERROR（凭证无效）
   ├─ HTTP 429 → SERVICE_ERROR（限流）
   ├─ HTTP 5xx / 连接失败 / 超时 → SERVICE_ERROR（服务不可用）
   ├─ 200 但 content 空 → SERVICE_ERROR（未生成有效内容）
   └─ 200 且 content 非空 → SUCCESS
```

此状态映射驱动 `ChatResponse.status`，对应 spec 的 Key Entity "调用状态"。
