package com.oryxos.react;

import com.oryxos.agent.AgentDefinition;
import com.oryxos.provider.ChatMessage;
import com.oryxos.provider.ChatProvider;
import com.oryxos.provider.ChatResponse;
import com.oryxos.storage.AuditRepository;
import com.oryxos.tool.ToolRegistry;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * ReAct 循环：组装 prompt → 调用 ChatProvider → 记录审计。
 *
 * <p>当前为单次调用循环（不解析工具调用、不做多轮迭代），
 * 后续版本将在此处扩展真正的 Reason + Act 循环。
 */
@Component
public class ReactLoop {

    private static final Logger log = LoggerFactory.getLogger(ReactLoop.class);
    private static final String CHINESE_OUTPUT_INSTRUCTION =
            "\n默认使用中文回答用户。除非用户明确要求其他语言，否则所有面向用户的回复必须使用中文。";

    private final ChatProvider chatProvider;
    private final ToolRegistry toolRegistry;
    private final AuditRepository auditRepository;

    public ReactLoop(ChatProvider chatProvider, ToolRegistry toolRegistry, AuditRepository auditRepository) {
        this.chatProvider = chatProvider;
        this.toolRegistry = toolRegistry;
        this.auditRepository = auditRepository;
    }

    public ReactResult run(ReactRequest request) {
        AgentDefinition definition = request.agentDefinition();
        String userMessage = request.message();

        // 空输入校验（FR-008）
        if (userMessage == null || userMessage.isBlank()) {
            return ReactResult.error(ChatResponse.Status.INVALID_INPUT, "用户输入为空，请提供明确的请求内容。");
        }

        long start = System.currentTimeMillis();

        // 组装 system prompt
        String systemPrompt = buildSystemPrompt(definition);

        // 构建消息列表
        List<ChatMessage> messages = new ArrayList<>();
        messages.add(new ChatMessage("system", systemPrompt));
        messages.add(new ChatMessage("user", userMessage));

        // 调用 ChatProvider
        String model = definition.profile().model();
        ChatResponse response = chatProvider.chat(model, messages);

        long durationMs = System.currentTimeMillis() - start;

        // 审计落库（不记录 API Key）
        auditRepository.recordLlmCall(
                request.sessionId(),
                response.provider() != null ? response.provider() : "unknown",
                response.model() != null ? response.model() : model,
                durationMs
        );

        // 根据状态返回结果
        if (response.isSuccess()) {
            return ReactResult.success(response.content(), 1);
        } else {
            log.warn("[ReactLoop] ChatProvider 调用失败：status={}, provider={}, model={}, duration={}ms",
                    response.status(), response.provider(), response.model(), durationMs);
            return ReactResult.error(response.status(), response.errorMessage());
        }
    }

    /** 组装 system prompt：工具列表 + Agent 指令 + 中文输出指令。 */
    private String buildSystemPrompt(AgentDefinition definition) {
        StringBuilder prompt = new StringBuilder();
        prompt.append("You are running inside OryxOS. Available tools: ")
              .append(toolRegistry.names());

        // 注入 Agent 的 identity prompt（从 AGENT.md frontmatter identity.prompt 读取）
        if (definition.profile().raw() != null) {
            Object identity = definition.profile().raw().get("identity");
            if (identity instanceof Map<?, ?> identityMap) {
                Object agentPrompt = identityMap.get("prompt");
                if (agentPrompt instanceof String s && !s.isBlank()) {
                    prompt.append("\n\n").append(s);
                }
            }
        }

        // 注入 Agent 正文指令（AGENT.md 正文部分）
        if (definition.instructions() != null && !definition.instructions().isBlank()) {
            prompt.append("\n\n").append(definition.instructions());
        }

        // 中文输出指令
        prompt.append(CHINESE_OUTPUT_INSTRUCTION);

        return prompt.toString();
    }
}
