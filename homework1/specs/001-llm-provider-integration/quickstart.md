# Quickstart 验证指南：接入真实 LLM Provider

**Branch**: `001-llm-provider-integration` | **Date**: 2026-07-31

本文件提供端到端验证步骤，覆盖 spec 中三个 User Story 的核心验收场景。

---

## 前提条件

1. Java 21 + Maven 已安装
2. 拥有可用的 Anthropic-compatible 中转站，且以下环境变量可配置：
   - `LLM_API_KEY`：有效的中转站 API Key
   - `LLM_BASE_URL`：中转站地址（如 `https://api.example.com`，不含尾部 `/v1/messages`）
   - `LLM_MODEL`：可选，未配置时默认 `claude-opus-4-8`

---

## 验证一：真实模型生成中文回复（US1）

**目的**: 验证 mock 被替换为真实模型调用（SC-001、SC-006）

```bash
# 1. 构建
cd code && mvn package -q

# 2. 配置并启动
export LLM_API_KEY="your-api-key"
export LLM_BASE_URL="https://your-relay.example.com"
export ORYXOS_PROVIDER=anthropic

java -jar target/oryxos-0.1.0-SNAPSHOT.jar init
java -jar target/oryxos-0.1.0-SNAPSHOT.jar profile create demo

# 3. 发送请求
java -jar target/oryxos-0.1.0-SNAPSHOT.jar chat --profile demo --message "什么是 Spring Boot？请用中文简要回答。"
```

**预期结果**: 返回与 Spring Boot 相关的中文回答，内容自然完整，不包含 `[mock:xxx]` 前缀。

**连续两次验证**:
```bash
java -jar target/oryxos-0.1.0-SNAPSHOT.jar chat --profile demo --message "解释一下什么是 ReAct 循环。"
```

两次回复内容应不同，分别针对各自问题生成，证明非固定占位文本。

---

## 验证二：环境变量自动加载（US2）

**目的**: 验证凭证从环境变量读取，用户无需手动输入（SC-002、SC-004）

```bash
# 验证配置（不启动服务，仅检查配置加载）
java -jar target/oryxos-0.1.0-SNAPSHOT.jar status

# 检查日志中是否出现 LLM_API_KEY 明文（不应出现）
```

**预期结果**: 凭证值不出现在控制台输出、日志文件、错误消息中。

---

## 验证三：配置缺失时的中文错误（US3）

**目的**: 验证凭证缺失时返回中文提示，不返回模拟成功内容（SC-003）

```bash
# 1. 在不设置 ORYXOS_PROVIDER 的情况下发起请求（默认 mock）
java -jar target/oryxos-0.1.0-SNAPSHOT.jar chat --profile demo --message "你好"
# 预期: 返回 [mock:xxx] 前缀的模拟内容（mock 回退正常）

# 2. 设置 ORYXOS_PROVIDER=anthropic 但不设 LLM_API_KEY
unset LLM_API_KEY
export ORYXOS_PROVIDER=anthropic
java -jar target/oryxos-0.1.0-SNAPSHOT.jar chat --profile demo --message "你好"
# 预期: 返回中文错误提示，说明未配置凭证
```

**预期结果**: 返回类似"未配置 LLM 访问凭证（LLM_API_KEY），请设置后重试。"的中文消息，**不**返回 `[mock:xxx]` 前缀内容。

---

## 验证四：凭证无效的中文错误（US3 + SC-003）

**目的**: 验证凭证存在但无效时的错误反馈

```bash
export LLM_API_KEY="invalid-key"
export LLM_BASE_URL="https://your-relay.example.com"
export ORYXOS_PROVIDER=anthropic

java -jar target/oryxos-0.1.0-SNAPSHOT.jar chat --profile demo --message "你好"
```

**预期结果**: 返回中文错误提示，说明凭证无效或已过期。

---

## 验证五：单元测试

```bash
cd code

# 全量测试
mvn test

# 单独运行 provider 测试
mvn -Dtest=AnthropicProviderTest test
mvn -Dtest=LlmProviderPropertiesTest test
```

**预期结果**: 所有测试通过，覆盖 mock / 真实 / 错误场景。

---

## 验证六：REST API 端点验证

```bash
# 在真实 provider 配置下启动服务
export LLM_API_KEY="your-api-key"
export LLM_BASE_URL="https://your-relay.example.com"
export ORYXOS_PROVIDER=anthropic
java -jar target/oryxos-0.1.0-SNAPSHOT.jar serve &

# 创建 session 并发消息
curl -s -X POST http://localhost:8080/api/v1/sessions \
  -H 'Content-Type: application/json' \
  -d '{"profileName":"demo","channel":"test","userId":"tester"}' | jq .

curl -s -X POST http://localhost:8080/api/v1/agents/demo/invoke \
  -H 'Content-Type: application/json' \
  -d '{"message":"你好，请介绍自己"}' | jq .
```

**预期结果**: 返回包含真实模型回复的 JSON 响应，`response` 字段为中文内容。

---

## 通过标准

| 验证项 | 通过条件 |
|--------|----------|
| 真实模型回复 | 返回非 `[mock:xxx]` 的自然中文内容 |
| 配置自动加载 | 用户无需在 UI/请求中输入密钥 |
| 凭证不出现在用户可见内容 | 日志/错误/输出中无 `LLM_API_KEY` 明文 |
| 缺失凭证的中文提示 | 返回"未配置"类中文消息 |
| 失败不伪装为成功 | 错误时不返回 `[mock:xxx]` 内容 |
| 单元测试通过 | `mvn test` 全部绿色 |
