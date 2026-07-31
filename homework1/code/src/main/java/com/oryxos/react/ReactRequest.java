package com.oryxos.react;

import com.oryxos.agent.AgentDefinition;

public record ReactRequest(String sessionId, AgentDefinition agentDefinition, String message) {
}
