package com.oryxos.react;

import com.oryxos.provider.ChatMessage;
import com.oryxos.provider.ChatProvider;
import com.oryxos.provider.ChatResponse;
import com.oryxos.storage.AuditRepository;
import com.oryxos.tool.ToolRegistry;
import org.springframework.stereotype.Component;

import java.util.List;

@Component
public class ReactLoop {
    private final ChatProvider chatProvider;
    private final ToolRegistry toolRegistry;
    private final AuditRepository auditRepository;

    public ReactLoop(ChatProvider chatProvider, ToolRegistry toolRegistry, AuditRepository auditRepository) {
        this.chatProvider = chatProvider;
        this.toolRegistry = toolRegistry;
        this.auditRepository = auditRepository;
    }

    public ReactResult run(ReactRequest request) {
        long start = System.currentTimeMillis();
        String systemPrompt = "You are running inside OryxOS. Available tools: " + toolRegistry.names();
        ChatResponse response = chatProvider.chat(
                request.agentDefinition().profile().model(),
                List.of(new ChatMessage("system", systemPrompt), new ChatMessage("user", request.message()))
        );
        auditRepository.recordLlmCall(request.sessionId(), response.provider(), response.model(), System.currentTimeMillis() - start);
        return new ReactResult(response.content(), 1);
    }
}
