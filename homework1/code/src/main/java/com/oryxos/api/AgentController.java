package com.oryxos.api;

import com.oryxos.agent.AgentService;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/agents")
public class AgentController {
    private final AgentService agentService;

    public AgentController(AgentService agentService) {
        this.agentService = agentService;
    }

    @PostMapping("/{name}/invoke")
    public AgentService.AgentInvokeResponse invoke(@PathVariable String name, @RequestBody InvokeRequest request) {
        return agentService.invoke(name, request.message());
    }

    public record InvokeRequest(String message) {
    }
}
