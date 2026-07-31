package com.oryxos.agent;

import com.oryxos.react.ReactLoop;
import com.oryxos.react.ReactRequest;
import com.oryxos.react.ReactResult;
import com.oryxos.session.Session;
import com.oryxos.session.SessionService;
import org.springframework.stereotype.Service;

@Service
public class AgentService {
    private final AgentLoader agentLoader;
    private final ReactLoop reactLoop;
    private final SessionService sessionService;

    public AgentService(AgentLoader agentLoader, ReactLoop reactLoop, SessionService sessionService) {
        this.agentLoader = agentLoader;
        this.reactLoop = reactLoop;
        this.sessionService = sessionService;
    }

    public AgentInvokeResponse invoke(String agentName, String message) {
        AgentDefinition definition = agentLoader.load(agentName);
        Session session = sessionService.create(agentName, "invoke", "anonymous");
        ReactResult result = reactLoop.run(new ReactRequest(session.sessionId(), definition, message));
        sessionService.appendMessage(session.sessionId(), "user", message);
        sessionService.appendMessage(session.sessionId(), "assistant", result.content());
        return new AgentInvokeResponse(session.sessionId(), agentName, result.content());
    }

    public record AgentInvokeResponse(String sessionId, String agentName, String response) {
    }
}
