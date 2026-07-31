package com.oryxos.api;

import com.oryxos.session.Session;
import com.oryxos.session.SessionService;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
@RequestMapping("/api/v1/sessions")
public class SessionController {
    private final SessionService sessionService;

    public SessionController(SessionService sessionService) {
        this.sessionService = sessionService;
    }

    @PostMapping
    public Session create(@RequestBody CreateSessionRequest request) {
        return sessionService.create(defaultValue(request.agentName(), "demo"), defaultValue(request.channel(), "http"), defaultValue(request.userId(), "anonymous"));
    }

    @PostMapping("/{id}/messages")
    public Map<String, Object> message(@PathVariable String id, @RequestBody MessageRequest request) {
        sessionService.appendMessage(id, "user", request.message());
        String response = "[mock:session] " + request.message();
        sessionService.appendMessage(id, "assistant", response);
        return Map.of("sessionId", id, "response", response);
    }

    @GetMapping("/{id}")
    public Session get(@PathVariable String id) {
        return sessionService.get(id);
    }

    @DeleteMapping("/{id}")
    public Map<String, Object> archive(@PathVariable String id) {
        sessionService.archive(id);
        return Map.of("sessionId", id, "status", "archived");
    }

    private String defaultValue(String value, String defaultValue) {
        return value == null || value.isBlank() ? defaultValue : value;
    }

    public record CreateSessionRequest(String agentName, String channel, String userId) {
    }

    public record MessageRequest(String message) {
    }
}
