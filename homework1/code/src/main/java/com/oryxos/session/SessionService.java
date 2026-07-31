package com.oryxos.session;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

@Service
public class SessionService {
    private final SessionRepository sessionRepository;
    private final ObjectMapper objectMapper;

    public SessionService(SessionRepository sessionRepository, ObjectMapper objectMapper) {
        this.sessionRepository = sessionRepository;
        this.objectMapper = objectMapper;
    }

    public Session create(String profileName, String channel, String userId) {
        Session session = new Session(UUID.randomUUID().toString(), profileName, channel, userId, "[]", "active");
        sessionRepository.save(session);
        return session;
    }

    public Session get(String sessionId) {
        return sessionRepository.findById(sessionId)
                .orElseThrow(() -> new IllegalArgumentException("Session not found: " + sessionId));
    }

    public List<Session> list() {
        return sessionRepository.findAll();
    }

    public void appendMessage(String sessionId, String role, String content) {
        Session session = get(sessionId);
        try {
            List<SessionMessage> messages = new ArrayList<>(objectMapper.readValue(
                    session.messagesJson(), new TypeReference<List<SessionMessage>>() {
                    }));
            messages.add(new SessionMessage(role, content));
            sessionRepository.updateMessages(sessionId, objectMapper.writeValueAsString(messages));
        } catch (Exception e) {
            throw new IllegalStateException("Failed to append session message", e);
        }
    }

    public void archive(String sessionId) {
        sessionRepository.archive(sessionId);
    }
}
