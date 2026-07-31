package com.oryxos.session;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

@Repository
public class SessionRepository {
    private final JdbcTemplate jdbcTemplate;

    public SessionRepository(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
        initializeSchema();
    }

    public void save(Session session) {
        Instant now = Instant.now();
        jdbcTemplate.update("""
                INSERT INTO sessions(session_id, profile_name, channel, user_id, messages_json, status, created_at, last_active_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """, session.sessionId(), session.profileName(), session.channel(), session.userId(),
                session.messagesJson(), session.status(), now.toString(), now.toString());
    }

    public Optional<Session> findById(String sessionId) {
        List<Session> sessions = jdbcTemplate.query("""
                SELECT session_id, profile_name, channel, user_id, messages_json, status
                FROM sessions WHERE session_id = ?
                """, (rs, rowNum) -> new Session(
                rs.getString("session_id"),
                rs.getString("profile_name"),
                rs.getString("channel"),
                rs.getString("user_id"),
                rs.getString("messages_json"),
                rs.getString("status")
        ), sessionId);
        return sessions.stream().findFirst();
    }

    public List<Session> findAll() {
        return jdbcTemplate.query("""
                SELECT session_id, profile_name, channel, user_id, messages_json, status
                FROM sessions ORDER BY last_active_at DESC
                """, (rs, rowNum) -> new Session(
                rs.getString("session_id"),
                rs.getString("profile_name"),
                rs.getString("channel"),
                rs.getString("user_id"),
                rs.getString("messages_json"),
                rs.getString("status")
        ));
    }

    public void updateMessages(String sessionId, String messagesJson) {
        jdbcTemplate.update("UPDATE sessions SET messages_json = ?, last_active_at = ? WHERE session_id = ?",
                messagesJson, Instant.now().toString(), sessionId);
    }

    public void archive(String sessionId) {
        jdbcTemplate.update("UPDATE sessions SET status = 'archived', archived_at = ? WHERE session_id = ?",
                Instant.now().toString(), sessionId);
    }

    private void initializeSchema() {
        jdbcTemplate.execute("""
                CREATE TABLE IF NOT EXISTS sessions (
                    session_id VARCHAR(128) PRIMARY KEY,
                    profile_name VARCHAR(128) NOT NULL,
                    channel VARCHAR(64) NOT NULL,
                    user_id VARCHAR(128) NOT NULL,
                    messages_json TEXT NOT NULL,
                    status VARCHAR(32) NOT NULL,
                    created_at TIMESTAMP NOT NULL,
                    last_active_at TIMESTAMP NOT NULL,
                    archived_at TIMESTAMP
                )
                """);
        jdbcTemplate.execute("""
                CREATE TABLE IF NOT EXISTS tool_invocations (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    session_id VARCHAR(128),
                    tool_name VARCHAR(128) NOT NULL,
                    input_json TEXT,
                    result_json TEXT,
                    success BOOLEAN NOT NULL,
                    error_message TEXT,
                    duration_ms BIGINT NOT NULL,
                    created_at TIMESTAMP NOT NULL
                )
                """);
        jdbcTemplate.execute("""
                CREATE TABLE IF NOT EXISTS llm_calls (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    session_id VARCHAR(128),
                    provider VARCHAR(128) NOT NULL,
                    model VARCHAR(128) NOT NULL,
                    prompt_tokens INT NOT NULL DEFAULT 0,
                    completion_tokens INT NOT NULL DEFAULT 0,
                    total_tokens INT NOT NULL DEFAULT 0,
                    duration_ms BIGINT NOT NULL,
                    created_at TIMESTAMP NOT NULL
                )
                """);
        jdbcTemplate.execute("""
                CREATE TABLE IF NOT EXISTS agent_executions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    agent_name VARCHAR(128) NOT NULL,
                    trigger_type VARCHAR(64) NOT NULL,
                    trigger_ref VARCHAR(256),
                    session_id VARCHAR(128),
                    status VARCHAR(32) NOT NULL,
                    started_at TIMESTAMP NOT NULL,
                    finished_at TIMESTAMP,
                    error_message TEXT
                )
                """);
    }
}
