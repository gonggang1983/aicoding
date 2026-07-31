# Contract: LLM Provider 接口

**Branch**: `001-llm-provider-integration` | **Date**: 2026-07-31

本文件定义 `ChatProvider` 实现与外部中转站之间的接口契约（Anthropic-compatible Messages 协议），以及 `ChatProvider` 对 OryxOS 内部的契约。

---

## 1. 对外契约：Anthropic-compatible Messages 请求

### 端点

`POST {LLM_BASE_URL}/v1/messages`

中转站需兼容 Anthropic Messages API。`LLM_BASE_URL` 不带尾部斜杠；`AnthropicProvider` 在其后拼接 `/v1/messages`。

### 请求头

| 头 | 值 | 说明 |
|----|----|------|
| `content-type` | `application/json` | 固定 |
| `x-api-key` | `${LLM_API_KEY}` | 凭证，来自环境变量 |
| `anthropic-version` | `2023-06-01` | Anthropic 稳定版本 |

> 不使用 `Authorization: Bearer`。Anthropic 原生鉴权用 `x-api-key`；中转站按 Anthropic 协议透传。

### 请求体

```json
{
  "model": "claude-opus-4-8",
  "max_tokens": 1024,
  "system": "You are running inside OryxOS. ... 默认使用中文回答用户。",
  "messages": [
    {"role": "user", "content": "你好"}
  ]
}
```

| 字段 | 必填 | 来源 |
|------|------|------|
| `model` | 是 | `LLM_MODEL` 或 profile.model，默认 `claude-opus-4-8` |
| `max_tokens` | 是 | 固定 1024（本 feature 范围内） |
| `system` | 否 | ReactLoop 组装的 system prompt（含中文指令） |
| `messages` | 是 | ChatMessage 列表，`system` 角色抽出到顶层 `system` 字段 |

### 成功响应（HTTP 200）

```json
{
  "id": "msg_xxx",
  "type": "message",
  "role": "assistant",
  "model": "claude-opus-4-8",
  "content": [{"type": "text", "text": "你好！我是 OryxOS 助手..."}],
  "stop_reason": "end_turn",
  "usage": {"input_tokens": 25, "output_tokens": 40}
}
```

**解析规则**: 取 `content[0].text` 作为生成内容。`content` 为空数组或 `text` 为空串视为生成失败（`SERVICE_ERROR`）。

### 错误响应映射

| HTTP 状态 | `ChatResponse.Status` | 中文消息（示例） |
|-----------|------------------------|------------------|
| 401 / 403 | `CONFIG_ERROR` | "LLM 访问凭证无效或已过期，请检查 LLM_API_KEY。" |
| 429 | `SERVICE_ERROR` | "LLM 请求过于频繁，请稍后重试。" |
| 5xx | `SERVICE_ERROR` | "LLM 服务暂时不可用，请稍后重试。" |
| 超时 / `IOException` | `SERVICE_ERROR` | "LLM 请求超时或网络异常，请稍后重试。" |

错误响应体（若存在）只用于日志调试，**不**透传给用户（避免泄露中转站内部信息）。

---

## 2. 对内契约：`ChatProvider` 接口

```java
public interface ChatProvider {
    String name();                                  // provider 标识，如 "anthropic" / "mock"
    ChatResponse chat(String model, List<ChatMessage> messages);
}
```

### 前置条件（`AnthropicProvider`）

- `LlmProviderProperties.isConfigured() == true`（`apiKey` 与 `baseUrl` 非空）。否则返回 `CONFIG_ERROR`，不发起网络请求。
- `messages` 至少含一条非空白 `user` 消息。否则返回 `INVALID_INPUT`（FR-008）。

### 后置条件

- 成功：`ChatResponse.status == SUCCESS`，`content` 为模型生成的非空文本。
- 失败：`ChatResponse.status` ∈ {`CONFIG_ERROR`, `SERVICE_ERROR`, `INVALID_INPUT`}，`errorMessage` 为中文，`content` 可空。
- 任何情况：`ChatResponse` 的字段**不**包含 `LLM_API_KEY` 明文或其片段。

### 不变量

- 不抛出未检查异常给调用方（网络/IO 错误捕获后转为 `ChatResponse.error`），便于 REST 层统一返回结构化状态（FR-009）。
- 单次 `chat` 调用对应一次 HTTP 请求（本 feature 不做流式、不做重试）。

---

## 3. Provider 选择契约

由 Spring `@ConditionalOnProperty(name = "oryxos.provider.default-provider")` 控制：

| `ORYXOS_PROVIDER` | 注入的 `ChatProvider` bean |
|--------------------|----------------------------|
| `mock`（默认） | `MockChatProvider` |
| `anthropic` 或 `llm` | `AnthropicProvider` |

两个 bean 互斥，避免 `ReactLoop` 注入歧义。`ReactLoop` 构造签名不变。

---

## 4. 审计契约

`AnthropicProvider` 每次调用后，由 `ReactLoop` 通过 `AuditRepository.recordLlmCall(sessionId, provider, model, durationMs)` 落审计。

- 记录字段：`sessionId`、`provider`（如 `"anthropic"`）、`model`（如 `"claude-opus-4-8"`）、`durationMs`。
- **不**记录：`LLM_API_KEY`、请求体、响应体、完整错误堆栈。
- 失败调用也落审计（durationMs 可反映超时）。
