package com.oryxos.provider;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class MockChatProviderTest {

    @Test
    void returnsSuccessWithMockPrefix() {
        MockChatProvider provider = new MockChatProvider();

        ChatResponse response = provider.chat("mock-chat",
                List.of(new ChatMessage("user", "你好")));

        assertThat(response.isSuccess()).isTrue();
        assertThat(response.provider()).isEqualTo("mock");
        assertThat(response.model()).isEqualTo("mock-chat");
        assertThat(response.content()).startsWith("[mock:mock-chat]");
        assertThat(response.content()).contains("你好");
    }

    @Test
    void usesLastUserMessageWhenMultipleMessages() {
        MockChatProvider provider = new MockChatProvider();

        ChatResponse response = provider.chat("m",
                List.of(
                        new ChatMessage("system", "sys"),
                        new ChatMessage("user", "第一条"),
                        new ChatMessage("user", "第二条")));

        assertThat(response.content()).contains("第二条");
        assertThat(response.content()).doesNotContain("第一条");
    }
}
