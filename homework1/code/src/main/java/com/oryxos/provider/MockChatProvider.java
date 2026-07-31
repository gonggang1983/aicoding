package com.oryxos.provider;

import org.springframework.stereotype.Component;

import java.util.List;

@Component
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
        return new ChatResponse("[mock:" + model + "] " + userMessage, name(), model);
    }
}
