package com.oryxos.provider;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

import java.util.List;

@Component
@ConditionalOnProperty(name = "oryxos.provider.default-provider", havingValue = "mock", matchIfMissing = true)
public class MockChatProvider implements ChatProvider {
    @Override
    public String name() {
        return "mock";
    }

    @Override
    public ChatResponse chat(String model, List<ChatMessage> messages) {
        String userMessage = messages.stream()
                .filter(message -> "user".equals(message.role()))
                .reduce((first, second) -> second)
                .map(ChatMessage::content)
                .orElse("");
        return ChatResponse.success("[mock:" + model + "] " + userMessage, name(), model);
    }
}
