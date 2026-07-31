package com.oryxos.provider;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * 真实 LLM Provider 的配置属性。
 *
 * <p>通过环境变量注入：
 * <ul>
 *   <li>{@code LLM_API_KEY} → {@code apiKey}（必填，真实 provider 启用时）</li>
 *   <li>{@code LLM_BASE_URL} → {@code baseUrl}（必填，真实 provider 启用时）</li>
 *   <li>{@code LLM_MODEL} → {@code model}（可选，默认 {@code claude-opus-4-8}）</li>
 * </ul>
 *
 * <p>{@code apiKey} 属于敏感信息，严禁出现在日志、异常消息或用户可见输出中。
 */
@ConfigurationProperties(prefix = "oryxos.provider.llm")
public record LlmProviderProperties(
        String apiKey,
        String baseUrl,
        String model
) {
    public static final String DEFAULT_MODEL = "claude-opus-4-8";

    public LlmProviderProperties {
        if (model == null || model.isBlank()) {
            model = DEFAULT_MODEL;
        }
    }

    /**
     * 判断真实 provider 是否已正确配置（apiKey 和 baseUrl 均非空）。
     */
    public boolean isConfigured() {
        return apiKey != null && !apiKey.isBlank()
                && baseUrl != null && !baseUrl.isBlank();
    }
}
