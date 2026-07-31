package com.oryxos.provider;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.net.http.HttpRequest;
import java.net.http.HttpTimeoutException;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class AnthropicProviderTest {

    private LlmHttpClient httpClient;
    private AnthropicProvider provider;

    @BeforeEach
    void setUp() {
        httpClient = mock(LlmHttpClient.class);
        LlmProviderProperties configuredProps = new LlmProviderProperties(
                "sk-test-key", "https://relay.example.com", "claude-opus-4-8");
        provider = new AnthropicProvider(configuredProps, httpClient, new ObjectMapper());
    }

    private List<ChatMessage> userMessage(String text) {
        return List.of(new ChatMessage("user", text));
    }

    private LlmHttpClient.Response resp(int status, String body) {
        return new LlmHttpClient.Response(status, body);
    }

    @Test
    void configErrorWhenApiKeyMissing() {
        AnthropicProvider p = new AnthropicProvider(
                new LlmProviderProperties("", "https://relay.example.com", "claude-opus-4-8"),
                httpClient, new ObjectMapper());

        ChatResponse response = p.chat("claude-opus-4-8", userMessage("你好"));

        assertThat(response.status()).isEqualTo(ChatResponse.Status.CONFIG_ERROR);
        assertThat(response.errorMessage()).contains("未配置");
        assertThat(response.content()).isNull();
    }

    @Test
    void configErrorWhenBaseUrlMissing() {
        AnthropicProvider p = new AnthropicProvider(
                new LlmProviderProperties("sk-key", "", "claude-opus-4-8"),
                httpClient, new ObjectMapper());

        ChatResponse response = p.chat("claude-opus-4-8", userMessage("你好"));

        assertThat(response.status()).isEqualTo(ChatResponse.Status.CONFIG_ERROR);
    }

    @Test
    void invalidInputWhenUserMessageBlank() {
        ChatResponse response = provider.chat("claude-opus-4-8",
                List.of(new ChatMessage("user", "   ")));

        assertThat(response.status()).isEqualTo(ChatResponse.Status.INVALID_INPUT);
        assertThat(response.errorMessage()).contains("输入为空");
    }

    @Test
    void successOn200WithTextContent() throws Exception {
        String body = """
                {
                  "id": "msg_1",
                  "type": "message",
                  "role": "assistant",
                  "content": [{"type": "text", "text": "你好，我是 OryxOS 助手。"}],
                  "stop_reason": "end_turn",
                  "usage": {"input_tokens": 10, "output_tokens": 20}
                }
                """;
        when(httpClient.send(any(HttpRequest.class))).thenReturn(resp(200, body));

        ChatResponse response = provider.chat("claude-opus-4-8", userMessage("你好"));

        assertThat(response.isSuccess()).isTrue();
        assertThat(response.content()).isEqualTo("你好，我是 OryxOS 助手。");
        assertThat(response.provider()).isEqualTo("anthropic");
        assertThat(response.model()).isEqualTo("claude-opus-4-8");
    }

    @Test
    void successExtractsFirstTextBlockWhenMultiple() throws Exception {
        String body = "{\"content\":[{\"type\":\"text\",\"text\":\"第一段\"},{\"type\":\"text\",\"text\":\"第二段\"}]}";
        when(httpClient.send(any(HttpRequest.class))).thenReturn(resp(200, body));

        ChatResponse response = provider.chat("claude-opus-4-8", userMessage("你好"));

        assertThat(response.isSuccess()).isTrue();
        assertThat(response.content()).isEqualTo("第一段");
    }

    @Test
    void configErrorOn401() throws Exception {
        when(httpClient.send(any(HttpRequest.class)))
                .thenReturn(resp(401, "{\"error\":{\"type\":\"authentication_error\"}}"));

        ChatResponse response = provider.chat("claude-opus-4-8", userMessage("你好"));

        assertThat(response.status()).isEqualTo(ChatResponse.Status.CONFIG_ERROR);
        assertThat(response.errorMessage()).contains("凭证无效");
    }

    @Test
    void configErrorOn403() throws Exception {
        when(httpClient.send(any(HttpRequest.class))).thenReturn(resp(403, "{}"));

        ChatResponse response = provider.chat("claude-opus-4-8", userMessage("你好"));

        assertThat(response.status()).isEqualTo(ChatResponse.Status.CONFIG_ERROR);
    }

    @Test
    void serviceErrorOn429() throws Exception {
        when(httpClient.send(any(HttpRequest.class))).thenReturn(resp(429, "{}"));

        ChatResponse response = provider.chat("claude-opus-4-8", userMessage("你好"));

        assertThat(response.status()).isEqualTo(ChatResponse.Status.SERVICE_ERROR);
        assertThat(response.errorMessage()).contains("频繁");
    }

    @Test
    void serviceErrorOn500() throws Exception {
        when(httpClient.send(any(HttpRequest.class))).thenReturn(resp(500, "{}"));

        ChatResponse response = provider.chat("claude-opus-4-8", userMessage("你好"));

        assertThat(response.status()).isEqualTo(ChatResponse.Status.SERVICE_ERROR);
        assertThat(response.errorMessage()).contains("不可用");
    }

    @Test
    void serviceErrorOnTimeout() throws Exception {
        when(httpClient.send(any(HttpRequest.class)))
                .thenThrow(new HttpTimeoutException("read timeout"));

        ChatResponse response = provider.chat("claude-opus-4-8", userMessage("你好"));

        assertThat(response.status()).isEqualTo(ChatResponse.Status.SERVICE_ERROR);
        assertThat(response.errorMessage()).contains("超时");
    }

    @Test
    void serviceErrorOnIOException() throws Exception {
        when(httpClient.send(any(HttpRequest.class)))
                .thenThrow(new IOException("connection refused"));

        ChatResponse response = provider.chat("claude-opus-4-8", userMessage("你好"));

        assertThat(response.status()).isEqualTo(ChatResponse.Status.SERVICE_ERROR);
        assertThat(response.errorMessage()).contains("不可用");
    }

    @Test
    void serviceErrorWhenContentEmpty() throws Exception {
        when(httpClient.send(any(HttpRequest.class))).thenReturn(resp(200, "{\"content\":[]}"));

        ChatResponse response = provider.chat("claude-opus-4-8", userMessage("你好"));

        assertThat(response.status()).isEqualTo(ChatResponse.Status.SERVICE_ERROR);
        assertThat(response.errorMessage()).contains("未返回有效内容");
    }

    @Test
    void serviceErrorWhenNoTextBlock() throws Exception {
        String body = "{\"content\":[{\"type\":\"tool_use\",\"id\":\"x\",\"name\":\"t\",\"input\":{}}]}";
        when(httpClient.send(any(HttpRequest.class))).thenReturn(resp(200, body));

        ChatResponse response = provider.chat("claude-opus-4-8", userMessage("你好"));

        assertThat(response.status()).isEqualTo(ChatResponse.Status.SERVICE_ERROR);
    }

    @Test
    void endpointUrlStripsTrailingSlash() throws Exception {
        AnthropicProvider p = new AnthropicProvider(
                new LlmProviderProperties("k", "https://relay.example.com/", "claude-opus-4-8"),
                httpClient, new ObjectMapper());
        when(httpClient.send(any(HttpRequest.class)))
                .thenReturn(resp(200, "{\"content\":[{\"type\":\"text\",\"text\":\"hi\"}]}"));

        ChatResponse response = p.chat("claude-opus-4-8", userMessage("hi"));

        assertThat(response.isSuccess()).isTrue();
    }
}
