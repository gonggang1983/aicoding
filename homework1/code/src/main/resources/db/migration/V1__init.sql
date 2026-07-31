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
);

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
);

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
);

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
);
