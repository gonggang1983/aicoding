package com.oryxos.provider;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.stereotype.Component;

import java.net.URI;
import java.net.http.HttpRequest;
import java.time.Duration;
import java.util.List;
import java.util.stream.Collectors;

/**
 * 真实 LLM Provider —— 使用 Anthropic-compatible Messages 协议。
 *
 * <p>当 {@code ORYXOS_PROVIDER=anthropic} 时激活；
 * 当 {@code ORYXOS_PROVIDER=mock} 或未设置时由 {@link MockChatProvider} 接管。
 *
 * <p>凭证通过环境变量注入，严禁出现在日志或异常消息中。
 */
@Component
@ConditionalOnProperty(name = "oryxos.provider.default-provider", havingValue = "anthropic")
@EnableConfigurationProperties(LlmProviderProperties.class)
public class AnthropicProvider implements ChatProvider {

    private static final Logger log = LoggerFactory.getLogger(AnthropicProvider.class);
    private static final String MESSAGES_PATH = "/v1/messages";
    private static final String ANTHROPIC_VERSION = "2023-06-01";
    private static final int MAX_TOKENS = 1024;
    private static final int TIMEOUT_SECONDS = 30;

    private final LlmProviderProperties properties;
    private final LlmHttpClient httpClient;
    private final ObjectMapper objectMapper;

    @Autowired
    public AnthropicProvider(LlmProviderProperties properties) {
        this(properties,
                LlmHttpClient.fromJdkClient(java.net.http.HttpClient.newBuilder()
                        .connectTimeout(Duration.ofSeconds(TIMEOUT_SECONDS))
                        .build()),
                new ObjectMapper());
    }

    /** 可注入 LlmHttpClient 和 ObjectMapper 便于测试。 */
    AnthropicProvider(LlmProviderProperties properties, LlmHttpClient httpClient, ObjectMapper objectMapper) {
        this.properties = properties;
        this.httpClient = httpClient;
        this.objectMapper = objectMapper;
    }

    @Override
    public String name() {
        return "anthropic";
    }

    @Override
    public ChatResponse chat(String model, List<ChatMessage> messages) {
        // 1. 前置校验：凭证是否配置
        if (!properties.isConfigured()) {
            return ChatResponse.error(
                    ChatResponse.Status.CONFIG_ERROR, name(), model,
                    "未配置 LLM 访问凭证（LLM_API_KEY 或 LLM_BASE_URL），请设置后重试。");
        }

        // 2. 前置校验：输入是否有效
        String lastUserMessage = messages.stream()
                .filter(m -> "user".equals(m.role()))
                .reduce((a, b) -> b)
                .map(ChatMessage::content)
                .orElse("");
        if (lastUserMessage.isBlank()) {
            return ChatResponse.error(
                    ChatResponse.Status.INVALID_INPUT, name(), model,
                    "用户输入为空，请提供明确的请求内容。");
        }

        // 3. 组装 Anthropic Messages 请求体
        try {
            String requestBody = buildRequestBody(model, messages);
            String endpoint = properties.baseUrl().replaceAll("/+$", "") + MESSAGES_PATH;

            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(endpoint))
                    .header("Content-Type", "application/json")
                    .header("x-api-key", properties.apiKey())
                    .header("anthropic-version", ANTHROPIC_VERSION)
                    .timeout(Duration.ofSeconds(TIMEOUT_SECONDS))
                    .POST(HttpRequest.BodyPublishers.ofString(requestBody))
                    .build();

            LlmHttpClient.Response response = httpClient.send(request);

            // 4. 解析响应
            return parseResponse(response.statusCode(), response.body(), model);

        } catch (java.net.http.HttpTimeoutException e) {
            log.error("[AnthropicProvider] 请求超时，model={}", model);
            return ChatResponse.error(
                    ChatResponse.Status.SERVICE_ERROR, name(), model,
                    "LLM 请求超时或网络异常，请稍后重试。");
        } catch (java.io.IOException e) {
            log.error("[AnthropicProvider] 网络异常，model={}", model);
            return ChatResponse.error(
                    ChatResponse.Status.SERVICE_ERROR, name(), model,
                    "LLM 服务暂时不可用，请稍后重试。");
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            log.error("[AnthropicProvider] 请求被中断，model={}", model);
            return ChatResponse.error(
                    ChatResponse.Status.SERVICE_ERROR, name(), model,
                    "LLM 请求被中断，请稍后重试。");
        } catch (Exception e) {
            log.error("[AnthropicProvider] 未知异常，model={}", model);
            return ChatResponse.error(
                    ChatResponse.Status.SERVICE_ERROR, name(), model,
                    "LLM 请求发生未知错误，请稍后重试。");
        }
    }

    /** 构建 Anthropic Messages API 请求 JSON。 */
    private String buildRequestBody(String model, List<ChatMessage> messages) throws Exception {
        String systemPrompt = messages.stream()
                .filter(m -> "system".equals(m.role()))
                .map(ChatMessage::content)
                .collect(Collectors.joining("\n"));

        List<ChatMessage> nonSystemMessages = messages.stream()
                .filter(m -> !"system".equals(m.role()))
                .toList();

        var node = objectMapper.createObjectNode();
        node.put("model", model);
        node.put("max_tokens", MAX_TOKENS);

        if (!systemPrompt.isBlank()) {
            node.put("system", systemPrompt);
        }

        var messagesArray = objectMapper.createArrayNode();
        for (ChatMessage msg : nonSystemMessages) {
            var msgNode = objectMapper.createObjectNode();
            msgNode.put("role", msg.role());
            msgNode.put("content", msg.content());
            messagesArray.add(msgNode);
        }
        node.set("messages", messagesArray);

        return objectMapper.writeValueAsString(node);
    }

    /** 解析 Anthropic Messages API 响应。 */
    private ChatResponse parseResponse(int statusCode, String body, String model) {
        try {
            JsonNode root = objectMapper.readTree(body);

            if (statusCode == 401 || statusCode == 403) {
                log.error("[AnthropicProvider] 凭证无效，status={}", statusCode);
                return ChatResponse.error(
                        ChatResponse.Status.CONFIG_ERROR, name(), model,
                        "LLM 访问凭证无效或已过期，请检查 LLM_API_KEY。");
            }
            if (statusCode == 429) {
                log.warn("[AnthropicProvider] 速率限制，status={}", statusCode);
                return ChatResponse.error(
                        ChatResponse.Status.SERVICE_ERROR, name(), model,
                        "LLM 请求过于频繁，请稍后重试。");
            }
            if (statusCode >= 500) {
                log.error("[AnthropicProvider] 服务端错误，status={}", statusCode);
                return ChatResponse.error(
                        ChatResponse.Status.SERVICE_ERROR, name(), model,
                        "LLM 服务暂时不可用，请稍后重试。");
            }
            if (statusCode != 200) {
                log.error("[AnthropicProvider] 意外状态码，status={}", statusCode);
                return ChatResponse.error(
                        ChatResponse.Status.SERVICE_ERROR, name(), model,
                        "LLM 服务返回异常状态，请稍后重试。");
            }

            // 200：解析 content
            JsonNode contentArray = root.get("content");
            if (contentArray == null || !contentArray.isArray() || contentArray.isEmpty()) {
                log.warn("[AnthropicProvider] 响应 content 为空，model={}", model);
                return ChatResponse.error(
                        ChatResponse.Status.SERVICE_ERROR, name(), model,
                        "模型未返回有效内容，请重试或调整问题。");
            }

            for (JsonNode block : contentArray) {
                if ("text".equals(block.path("type").asText())) {
                    String text = block.path("text").asText("");
                    if (!text.isBlank()) {
                        return ChatResponse.success(text, name(), model);
                    }
                }
            }

            log.warn("[AnthropicProvider] 响应中无 text block，model={}", model);
            return ChatResponse.error(
                    ChatResponse.Status.SERVICE_ERROR, name(), model,
                    "模型未返回有效文本内容，请重试或调整问题。");

        } catch (Exception e) {
            log.error("[AnthropicProvider] 响应解析异常，status={}", statusCode);
            return ChatResponse.error(
                    ChatResponse.Status.SERVICE_ERROR, name(), model,
                    "LLM 响应格式异常，请稍后重试。");
        }
    }
}
