package com.oryxos.provider;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class LlmProviderPropertiesTest {

    @Test
    void isConfiguredTrueWhenApiKeyAndBaseUrlPresent() {
        LlmProviderProperties props = new LlmProviderProperties(
                "sk-test-key", "https://relay.example.com", "claude-opus-4-8");

        assertThat(props.isConfigured()).isTrue();
    }

    @Test
    void isConfiguredFalseWhenApiKeyBlank() {
        LlmProviderProperties props = new LlmProviderProperties(
                "", "https://relay.example.com", "claude-opus-4-8");

        assertThat(props.isConfigured()).isFalse();
    }

    @Test
    void isConfiguredFalseWhenBaseUrlBlank() {
        LlmProviderProperties props = new LlmProviderProperties(
                "sk-test-key", "", "claude-opus-4-8");

        assertThat(props.isConfigured()).isFalse();
    }

    @Test
    void isConfiguredFalseWhenNulls() {
        LlmProviderProperties props = new LlmProviderProperties(null, null, null);

        assertThat(props.isConfigured()).isFalse();
    }

    @Test
    void modelDefaultsToClaudeOpus48WhenBlank() {
        LlmProviderProperties props = new LlmProviderProperties(
                "sk-test-key", "https://relay.example.com", "");

        assertThat(props.model()).isEqualTo("claude-opus-4-8");
    }

    @Test
    void modelDefaultsToClaudeOpus48WhenNull() {
        LlmProviderProperties props = new LlmProviderProperties(
                "sk-test-key", "https://relay.example.com", null);

        assertThat(props.model()).isEqualTo("claude-opus-4-8");
    }

    @Test
    void customModelPreserved() {
        LlmProviderProperties props = new LlmProviderProperties(
                "sk-test-key", "https://relay.example.com", "custom-model-x");

        assertThat(props.model()).isEqualTo("custom-model-x");
    }
}
