---
name: {{name}}
description: Demo agent
identity:
  agent_name: {{name}}
  prompt: You are a helpful OryxOS agent.
provider:
  name: anthropic
  model: claude-opus-4-8
  temperature: 0.2
tools:
  - recall_memory
  - save_memory
  - http_get
skills: []
mcp_servers: []
channels:
  - name: cli
    config: {}
bootstrap:
  - AGENTS.md
  - SOUL.md
  - USER.md
settings:
  max_iterations: 10
  max_history_turns: 20
---

你是一个用于验证 OryxOS 最小运行链路的 Agent。
收到用户任务后，先理解任务，再决定是否调用工具。
