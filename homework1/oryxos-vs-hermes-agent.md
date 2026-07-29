# OryxOS 与 Hermes Agent 对比报告

> 生成时间：2026-07-29  
> 参考资料：
> - Hermes Agent 文档：[Architecture](https://hermesagent.org.cn/docs/developer-guide/architecture)
> - OryxOS 本地文档：`docs/oryxos.md`、`docs/DemandAnalysis.md`、`docs/TechnicalSolution.md`、`docs/VisionAndRoadmap.md`

## 1. 结论摘要

OryxOS 和 Hermes Agent 都属于“把裸模型变成能调用工具、能保持记忆、能跨入口工作的 Agent 运行底座”的范畴，但两者的重心明显不同：

- **Hermes Agent 更像一个功能非常完整的自托管个人/开发者 Agent**：以 Python 实现，围绕一个核心 `AIAgent`，提供强大的 CLI、消息网关、ACP/IDE 集成、浏览器与终端自动化、多平台消息适配、插件、上下文压缩、Prompt caching、轨迹/训练数据生成等能力。它的优势是“单体 Agent 能力丰富、端到端工具链成熟、入口和后端非常多”。
- **OryxOS 更像面向企业的 Agent Harness OS / Agent OS 底座**：以 Java 21 + Spring Boot 3.x 实现，强调一个企业私有部署的统一底座来运行和管理一群业务 Agent。它把 Provider、ReAct Loop、Memory、Tool、MCP、Skill、Notify、Web API、Web 管理台、SQLite 审计、沙箱白名单等做成企业可集成、可审计、可治理的基础设施。它的优势是“企业 Java 生态、私有部署、统一治理、审计和未来分布式/多 Agent 团队演进”。

一句话概括：

> **Hermes Agent 偏“强大的个人/开发者 Agent 产品”；OryxOS 偏“企业内部运行和治理一群 Agent 的操作系统底座”。**

---

## 2. 功能角度对比

| 维度 | OryxOS | Hermes Agent | 差异判断 |
| --- | --- | --- | --- |
| 产品定位 | 企业私有部署的 Agent Harness OS / Agent OS，一个底座运行和管理多个业务 Agent。 | 自托管 Agent，文档架构显示它以 `AIAgent` 为核心，支持 CLI、Gateway、ACP、Batch Runner、API Server、Python Library 等入口。 | OryxOS 的目标是“企业底座 + 多 Agent 管理”；Hermes 更像“一个能力很强的通用 Agent 核心 + 多入口产品”。 |
| Agent 定义方式 | “一个目录 = 一个 Agent”：`.oryxos/agents/<name>/AGENT.md`，frontmatter 定义 provider/model/tools/skills/schedules，正文定义任务指令。 | 以 profile、skills、tools、plugins、gateway session 等机制组织运行；文档强调 profile 隔离和配置独立。 | OryxOS 更强调 GitOps/Markdown 声明式业务 Agent；Hermes 更强调通过 CLI/config/plugin/skill 组合出强 Agent 运行体验。 |
| 核心对话能力 | 自实现 ReAct Loop：组装 Prompt → 调 LLM → 执行 Tool → 回填结果 → 循环，默认最大 10 轮。 | `AIAgent.run_conversation()` 负责提供者选择、提示词构建、工具执行、重试、降级、回调、压缩和持久化。 | 两者都有核心 Agent Loop；Hermes 的循环内置能力更厚，包括压缩、降级、回调、缓存等；OryxOS 当前阶段更克制，强调核心链路可控。 |
| Provider / 模型接入 | Spring AI Alibaba 做协议转换，但禁止自动 tool 执行；OryxOS 维护 provider name → ChatModel 的显式映射。 | runtime provider 将 `(provider, model)` 解析为 `(api_mode, api_key, base_url)`，支持 `chat_completions`、`codex_responses`、`anthropic_messages` 三种 API 模式，文档称支持 18+ Provider。 | Hermes 的 provider 覆盖和运行时解析更丰富；OryxOS 更强调显式映射、Java/Spring AI 生态和避免 Spring AI 自动执行 tool 的可控性。 |
| Tool 能力 | 内置文件、Shell、HTTP、时间、JSON、Notify、Memory、Web 搜索等工具；MCP Client；沙箱白名单；Tool 调用审计落库。 | 文档称中央 Tool Registry 包含约 47/48 个工具、20 个工具集/40 toolsets；支持 Terminal、Browser、Web、MCP、File、Vision、delegate、code execution 等后端。 | Hermes 当前工具面更宽，尤其浏览器自动化、终端后端、delegate、code execution 更成熟；OryxOS 当前工具少一些，但围绕企业审计、白名单、MCP 和 Java 集成打地基。 |
| 终端 / 执行后端 | 核心阶段 Shell 通过命令白名单执行；未来规划 Docker / SSH 等沙箱后端。 | Terminal 支持 6 种后端：local、Docker、SSH、Daytona、Modal、Singularity。 | Hermes 执行环境成熟度更高；OryxOS 当前是轻量白名单，适合先跑企业内控链路，重隔离仍在规划。 |
| 浏览器 / 多模态 | 当前核心文档中未作为已交付核心能力；未来规划浏览器、视觉、图像、TTS、多模型推理。 | 文档列出 Browser 相关工具、Vision、辅助 LLM、浏览器后端等。 | Hermes 在个人助理/开发者自动化场景下功能更完整；OryxOS 将这些作为后续能力扩展。 |
| Memory | 会话记忆 + 长期记忆；默认 Markdown `MEMORY.md`，也有 SQLite / Mem0 后端设计；每 Agent 可有独立记忆；未来语义记忆和用户画像。 | `memory_manager.py`、`memory_provider.py`、插件式 memory provider；Session Storage 使用 SQLite + FTS5；文档强调 profile 隔离、会话持久化、传承追踪。 | Hermes 的 session/search/compression 体系更成熟；OryxOS 更强调企业可读、可审计、可替换后端，以及未来和知识库共享向量基建。 |
| Skill | 全局共享 Skill 库：`.oryxos/skills/<name>/SKILL.md`，Agent 按名引用，由 `ContextLoader` 注入 system prompt；Skill 不是 Tool。 | 捆绑 skills、optional-skills、skill slash command、skills hub、按平台启用/禁用。未来可从经验自动沉淀 Skill。 | Hermes Skill 生态和命令体验更丰富；OryxOS 更强调企业统一能力库、由 Agent 显式引用、作为强约束上下文注入。 |
| 渠道 / Gateway | 当前核心入口：CLI、REST API、Web 管理台、定时任务；未来规划飞书/企微/钉钉/微信/Slack/Discord/Email/WebSocket 等。 | Gateway 支持大量平台适配器：telegram、discord、slack、whatsapp、signal、matrix、mattermost、email、sms、dingtalk、feishu、wecom、weixin、webhook、Home Assistant 等；并有 DM 配对授权、会话路由、hooks。 | Hermes 全渠道能力明显更成熟；OryxOS 当前把全渠道放在后续，优先做好企业内部 REST/Web/API 底座。 |
| 定时任务 | Agent 级 cron，执行历史落 SQLite，Web 管理台可查可触发。 | 原生 Agent job，JSON 存储，可附加 skills/scripts，可投递到任意平台。 | 两者都有 Agent-native schedule；Hermes 与多平台投递结合更深；OryxOS 与企业管理台、审计和未来分布式调度结合更深。 |
| 多 Agent / 委派 | 当前目标是一个底座跑多个业务 Agent；未来规划 Flow、子 Agent 委托、A2A、自然语言组织 Agent 团队交付任务。 | 文档已有 `delegate_tool.py` 和多入口统一 `AIAgent`，但架构页更强调强单 Agent 与委派工具。 | OryxOS 的终局是企业多 Agent OS；Hermes 当前已有委派能力但不是以企业多 Agent 治理为主轴。 |
| Web / 管理能力 | REST API + Vue Web 管理台：Agent 管理、文件浏览、Skill、沙箱、通知等。 | 文档提到 API Server、网站文档、Gateway，但核心体验更多围绕 CLI/Gateway/ACP。 | OryxOS 更强调企业管理台和业务系统 HTTP 集成；Hermes 更强调命令行、消息渠道和 IDE/ACP。 |

---

## 3. 技术架构角度对比

### 3.1 架构风格

**OryxOS**

- 技术栈：Java 21、Spring Boot 3.x、Spring MVC、Spring AI Alibaba、SQLite + Spring Data JPA、Picocli、Logback、Micrometer/Prometheus。
- 部署形态：单可执行 JAR，企业自己的 K8s、虚拟机或服务器上运行；长期方向是无状态实例 + 状态外置 + 多副本。
- 核心分层：
  1. 接入层：CLI、REST API、AgentScheduler；
  2. 引擎层：`ReActLoop`、`PromptBuilder`、`ToolExecutor`；
  3. 能力层：Provider、Memory、Tool；
  4. 基础层：Agent/Profile/Skill/Bootstrap 加载、Session、SQLite、配置和密钥。
- 设计特征：自实现 ReAct Loop；Spring AI 只做协议转换和 `@Tool` schema 生成；Provider 显式映射；同步阻塞 + Java 21 virtual thread；审计表 day-one 写入。

**Hermes Agent**

- 技术栈：Python 项目，文档中核心文件包括 `run_agent.py`、`cli.py`、`model_tools.py`、`hermes_state.py`、`gateway/run.py`、`acp_adapter/` 等。
- 部署/运行形态：一个核心 `AIAgent` 同时服务 CLI、Gateway、ACP、Batch Runner、API Server、Python Library。
- 核心结构：
  1. Entry Points：CLI、Gateway、ACP、Batch Runner、API Server、Python Library；
  2. AIAgent：Prompt Builder、Provider Resolution、Tool Dispatch、Compression & Caching、3 API Modes、Tool Registry；
  3. Session Storage：SQLite + FTS5；
  4. Tool Backends：Terminal、Browser、Web、MCP、File、Vision 等；
  5. Gateway：多消息平台、授权、hooks、mirror、status；
  6. 插件：用户级、项目级、pip entry point；memory provider 和 context engine 单选插件。
- 设计特征：平台无关核心、提示稳定性、工具调用可观察、可中断、松耦合、profile 隔离、导入时自动注册工具。

### 3.2 核心循环对比

| 维度 | OryxOS | Hermes Agent |
| --- | --- | --- |
| 核心类 | `ReActLoop` + `AgentService` | `AIAgent` in `run_agent.py` |
| 实现哲学 | 循环保持短小可控，不使用 Spring AI Agent 抽象，避免框架自动 tool 执行。 | 一个核心类承载完整对话编排：provider、prompt、tool、retry、fallback、callback、compression、persistence。 |
| 上下文策略 | `PromptBuilder` 注入 Agent 指令、Bootstrap、Skill、Memory、历史和工具列表；核心阶段保留最近 N 轮。 | `prompt_builder.py` 组装 SOUL、MEMORY、USER、skills、上下文文件、工具指导、模型特定指令；`context_compressor.py` 处理超过阈值的压缩。 |
| 缓存 | 当前不是核心重点。 | 明确支持 Anthropic Prompt caching 断点。 |
| 可靠性控制 | 最大迭代次数、同步链路、ToolExecutor 审计、沙箱白名单。 | 可中断、重试、降级、回调、压缩、工具预览、session 传承追踪。 |

### 3.3 Provider 架构对比

- **OryxOS** 通过 Spring AI Alibaba 复用各家协议转换，但显式维护 provider name → ChatModel 映射，强调企业场景中多 Provider 并存时不可依赖 Bean 类型扫描。凭证走环境变量，配置缺失要清晰报错。
- **Hermes Agent** 通过 runtime provider 解析器把 `(provider, model)` 转成实际 API 模式和凭证，支持多 API mode、OAuth、凭证池、别名解析和 18+ providers。

差异：Hermes 的 Provider 接入范围和运行时动态性更丰富；OryxOS 的 Provider 设计更贴近 Java/Spring 企业工程，强调显式映射、可审计和配置治理。

### 3.4 Tool 与扩展架构对比

- **OryxOS**：`OryxTool` 是统一抽象，内置 Tool、MCP Tool 都进入 `ToolRegistry`；Tool 执行前过 `SandboxChecker`/白名单；执行结果写 `tool_invocations`。业务扩展分三档：
  1. 零代码：写 Agent 目录 + 复用 MCP server；
  2. 轻代码：任意语言写 MCP server；
  3. 重代码：Java `@Tool` 注解 Spring Bean。
- **Hermes Agent**：中央 `tools/registry.py`，工具文件导入时注册；文档列出约 47/48 个工具、20 个工具集/40 toolsets；支持多终端后端、浏览器工具、web 工具、MCP、code execution、delegate、credential files、env passthrough 等。

差异：Hermes 的工具生态更“大而全”；OryxOS 的工具体系更强调企业安全边界、MCP 开放标准、Java 原生扩展和审计数据沉淀。

### 3.5 存储与状态对比

| 维度 | OryxOS | Hermes Agent |
| --- | --- | --- |
| 会话 | SQLite `sessions` 表，Session 跨重启恢复。 | SQLite + FTS5，支持全文搜索、会话传承关系、跨平台隔离、原子写入。 |
| 审计 | `tool_invocations`、`llm_calls` day-one 写入；后续作为审计 UI、成本看板、评测/蒸馏数据飞轮基础。 | 文档强调轨迹保存、ShareGPT 格式轨迹、RL/benchmark 数据生成。 |
| 记忆 | Markdown / SQLite / Mem0 三档后端；人可读与可审计优先。 | Memory provider 插件、memory manager、profile 隔离。 |
| 分布式方向 | 规划 SQLite → MySQL/PostgreSQL，实例无状态化，DB 心跳和调度抢锁。 | 架构页强调 profile 级隔离和多 gateway/session，但不是企业分布式 Agent OS 主线。 |

### 3.6 部署与运维对比

- **OryxOS** 面向企业 Java 生产环境：Spring Boot JAR、K8s/服务器、Actuator、Prometheus、结构化日志、SQLite 起步，未来 MySQL/PostgreSQL、无状态多副本。
- **Hermes Agent** 面向个人/开发者/多平台自动化：CLI、Gateway、ACP、插件、不同环境后端，profile 隔离，能在多个入口里运行同一个 Agent 核心。

---

## 4. 企业价值角度对比

### 4.1 OryxOS 的企业价值

1. **企业私有部署，数据不出域**  
   OryxOS 明确部署在企业自己的 K8s、虚拟机或服务器上，业务数据、会话、记忆、审计都留在企业基础设施内。

2. **Java / Spring 生态适配企业现状**  
   大量企业后端、运维、监控、治理体系围绕 Java/Spring 构建。OryxOS 采用 Java 21 + Spring Boot，可直接复用企业现有构建、部署、监控、安全和治理工具链。

3. **统一底座管理一群业务 Agent**  
   企业不是只需要一个个人助手，而是需要运维助手、客服助手、HR 助手、销售助手、知识管理助手等多个业务 Agent 共享 Provider、Tool、Memory、Skill、Notify、审计和沙箱能力。

4. **审计和合规从第一天内建**  
   `llm_calls` 和 `tool_invocations` day-one 落库，未来可形成成本看板、审计回放、行为回归、模型蒸馏和 RL 数据飞轮。这对企业合规与生产可信非常关键。

5. **低门槛定义业务 Agent**  
   “一个目录 = 一个 Agent”，业务人员或平台团队写 Markdown 即可定义 Agent，底座提供工具、记忆、Skill、MCP、通知能力，降低从 demo 到生产的工程门槛。

6. **未来企业治理空间清晰**  
   OryxOS 路线图明确包含多租户、SSO、RBAC、Tool Policy、HITL 审批、成本治理、分布式调度、Agent 团队协作等企业级能力。

### 4.2 Hermes Agent 的企业价值

1. **开箱即用的强 Agent 能力**  
   Hermes 工具体系、终端后端、浏览器、消息渠道、ACP、插件、上下文压缩等能力丰富，适合开发者或团队快速获得一个非常强的自托管 Agent。

2. **多入口触达能力强**  
   CLI、Gateway、ACP、API Server、Python Library 多入口，Gateway 覆盖大量 IM/消息平台，适合“一个 Agent 到处用”。

3. **开发者自动化和研发场景适配好**  
   Terminal、Browser、MCP、delegate、code execution、IDE/ACP、trajectory 等能力，使 Hermes 很适合研发、自动化、数据生成、训练/评估等技术场景。

4. **插件和工具生态灵活**  
   用户级、项目级、pip entry point 插件，以及 memory/context engine 插件，为高级用户提供较强可扩展性。

5. **个人/团队生产力提升直接**  
   Hermes 更像“装在自己环境中的强个人 Agent”，对个人和小团队的价值更直接：快速接渠道、跑工具、记忆上下文、自动化任务。

### 4.3 企业采用时的关键取舍

| 取舍问题 | 更偏 OryxOS | 更偏 Hermes Agent |
| --- | --- | --- |
| 企业已有 Java/Spring 技术栈，需要纳入现有工程治理 | ✅ |  |
| 需要一个统一底座运行和管理多个业务 Agent | ✅ |  |
| 需要 day-one 审计、沙箱白名单、未来 RBAC/SSO/HITL/成本治理 | ✅ |  |
| 需要快速获得大量现成工具、浏览器自动化、终端后端、消息平台 |  | ✅ |
| 主要用户是个人开发者或小团队，重视 CLI/IDE/消息平台体验 |  | ✅ |
| 需要强大的上下文压缩、Prompt caching、轨迹生成、RL/benchmark 相关能力 |  | ✅ |
| 需要通过 REST/Web 管理台嵌入企业内部系统 | ✅ | 部分支持，但不是主轴 |
| 需要国内企业渠道作为企业 IM 接入 | 规划中 | 已有 feishu/wecom/dingtalk/weixin 等适配器 |
| 希望以 Markdown/GitOps 方式声明业务 Agent | ✅ | 部分支持，但不是唯一核心形态 |

---

## 5. 三个角度的详细差异总结

### 5.1 功能差异

- Hermes Agent 的功能面更宽：多平台 Gateway、ACP/IDE、浏览器自动化、多终端后端、插件、上下文压缩、Prompt caching、轨迹/训练数据生成等已经在架构中成体系。
- OryxOS 的功能面更聚焦：先跑通企业 Agent OS 的核心链路，即 Provider、ReAct、Memory、Tool、MCP、Skill、Notify、REST、Web 管理台、审计、沙箱。
- Hermes 更像“一个 Agent 能做很多事”；OryxOS 更像“一个企业能运行很多 Agent，并逐步治理它们”。

### 5.2 技术架构差异

- Hermes 是 Python 生态，核心是大而全的 `AIAgent`，通过多入口复用同一个 Agent 核心，并围绕工具注册、Gateway、ACP、插件、环境后端形成完整产品。
- OryxOS 是 Java/Spring 生态，核心是更分层的企业应用架构：接入层、引擎层、能力层、基础层；强调接口解耦、显式 Provider 映射、同步 + virtual thread、SQLite 审计、Spring MVC REST API。
- Hermes 的架构成熟度体现在“工具/入口/上下文/插件/多后端”广度；OryxOS 的架构取向体现在“企业可部署、可审计、可治理、可分布式演进”的底座设计。

### 5.3 企业价值差异

- Hermes 对企业的直接价值是“快速拥有一个很强的自托管 Agent 能力”，尤其适合研发自动化、个人助理、多渠道接入、IDE 集成和实验/评估。
- OryxOS 对企业的直接价值是“把 Agent 变成可管理的企业基础设施”，让多个业务 Agent 共享能力、数据不出域、过程可审计、工具可控、未来可做多租户和成本治理。
- 如果企业的目标是先提升开发者个人效率，Hermes 更快；如果目标是建设内部 Agent 平台和长期治理体系，OryxOS 更贴近终局。

---

## 6. 对 OryxOS 的借鉴建议

Hermes Agent 的架构页对 OryxOS 后续路线有几类可借鉴点：

1. **上下文压缩与 Prompt caching**  
   OryxOS 当前核心阶段采用最近 N 轮截断，后续可以借鉴 Hermes 的 context compressor 和 prompt caching 思路，在不破坏提示稳定性的前提下降低长会话成本。

2. **多执行后端**  
   Hermes Terminal 支持 local/Docker/SSH/Daytona/Modal/Singularity。OryxOS 可按路线图从白名单沙箱升级到 Docker/SSH，再视企业需求引入更强隔离。

3. **全渠道 Gateway**  
   Hermes Gateway 对平台适配、用户授权、session routing、hooks 的设计成熟。OryxOS 后续补飞书/企微/钉钉/微信等渠道时，可以重点借鉴其 gateway/session/adapter 分层。

4. **插件体系和上下文引擎**  
   Hermes 的用户级、项目级、pip 插件与 memory/context engine 插件说明，Agent 底座需要把扩展点设计成稳定 API。OryxOS 可在 Java 生态下形成 Connector / Skill / Knowledge / Tool 的能力市场。

5. **轨迹数据与训练闭环**  
   Hermes 已有 trajectory、ShareGPT 格式、RL/benchmark 数据生成。OryxOS 已有 `llm_calls` 和 `tool_invocations` 审计表，后续可把审计数据升级成企业私有的数据飞轮。

6. **Delegate / 子 Agent**  
   Hermes 的 delegate tool 对 OryxOS 的 Flow、多 Agent 团队和 A2A 方向有直接参考价值。但 OryxOS 应保留自己的企业约束：逐 Agent 沙箱、逐步骤审计、HITL 审批、成本归集和有界迭代。

---

## 7. 最终判断

- **Hermes Agent 是一个能力丰富、工程化程度高、面向个人/开发者自托管场景的强 Agent 系统。** 它的多入口、多工具、多后端、多渠道能力已经比较完整。
- **OryxOS 是一个面向企业的 Agent OS 底座。** 当前功能广度不如 Hermes，但架构主线更贴近企业长期诉求：Java 技术栈、私有部署、统一底座、多 Agent 管理、REST/Web 管理、沙箱、审计、治理和未来分布式。

因此，两者不是简单的“谁替代谁”，而是面向不同主场：

> **Hermes Agent 解决“我需要一个强大的自托管 Agent”；OryxOS 解决“企业需要一套能运行、管理、审计和治理一群业务 Agent 的底座”。**
