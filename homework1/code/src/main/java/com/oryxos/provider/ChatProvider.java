package com.oryxos.provider;

import java.util.List;

public interface ChatProvider {
    String name();

    ChatResponse chat(String model, List<ChatMessage> messages);
}
