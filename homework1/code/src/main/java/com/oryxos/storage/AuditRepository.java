package com.oryxos.storage;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.time.Instant;

@Repository
public class AuditRepository {
    private final JdbcTemplate jdbcTemplate;

    public AuditRepository(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    public void recordLlmCall(String sessionId, String provider, String model, long durationMs) {
        jdbcTemplate.update("""
                INSERT INTO llm_calls(session_id, provider, model, prompt_tokens, completion_tokens, total_tokens, duration_ms, created_at)
                VALUES (?, ?, ?, 0, 0, 0, ?, ?)
                """, sessionId, provider, model, durationMs, Instant.now().toString());
    }

    public void recordToolInvocation(String sessionId, String toolName, String inputJson, String resultJson, boolean success,
                                     String errorMessage, long durationMs) {
        jdbcTemplate.update("""
                INSERT INTO tool_invocations(session_id, tool_name, input_json, result_json, success, error_message, duration_ms, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """, sessionId, toolName, inputJson, resultJson, success, errorMessage, durationMs, Instant.now().toString());
    }
}
