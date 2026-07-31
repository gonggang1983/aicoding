# Tasks: 接入真实 LLM Provider

**Input**: 设计文档来自 `/specs/001-llm-provider-integration/`

**Prerequisites**: plan.md（必须）、spec.md（必须）、data-model.md、contracts/llm-provider-api.md、research.md

**Tests**: 本 feature 修改了 Provider 集成（宪法原则 IV 要求），所有 Provider/配置/错误处理变更必须包含自动化测试。

## Format: `[ID] [P?] [Story] Description`

- **[P]**: 可并行执行（不同文件，无依赖）
- **[Story]**: 所属用户故事（US1, US2, US3）

## Phase 1: Setup（共享基础设施）

**Purpose**: 扩展数据结构和配置绑定，为所有后续任务提供基础

- [x] T001 [P] 扩展 ChatResponse record，新增 Status 枚举（SUCCESS / CONFIG_ERROR / SERVICE_ERROR / INVALID_INPUT）和 errorMessage 字段，添加 success() 和 error() 工厂方法 — `code/src/main/java/com/oryxos/provider/ChatResponse.java`
- [x] T002 [P] 新增 LlmProviderProperties 配置类，绑定 oryxos.provider.llm.* 前缀的 apiKey/baseUrl/model 字段，添加 isConfigured() 方法 — `code/src/main/java/com/oryxos/provider/LlmProviderProperties.java`
- [x] T003 在 application.yml 新增 oryxos.provider.llm 配置块（api-key/base-url/model），设置 model 默认值 claude-opus-4-8 — `code/src/main/resources/application.yml`
- [x] T004 [P] 编写 LlmProviderPropertiesTest，验证环境变量绑定和默认 model 值 — `code/src/test/java/com/oryxos/provider/LlmProviderPropertiesTest.java`

---

## Phase 2: Foundational（阻塞性前提）

**Purpose**: 实现 AnthropicProvider 和 provider 选择机制，是所有 User Story 的前提

**⚠️ CRITICAL**: 所有 User Story 都依赖本阶段完成

- [x] T005 实现 AnthropicProvider：使用 JDK 21 HttpClient 向 {LLM_BASE_URL}/v1/messages 发送 POST 请求，解析 Anthropic Messages 响应格式，映射 HTTP 状态码到 ChatResponse.Status，异常转为中文错误消息 — `code/src/main/java/com/oryxos/provider/AnthropicProvider.java`
- [x] T006 实现 Provider 选择：在 MockChatProvider 和 AnthropicProvider 上直接使用 @ConditionalOnProperty（mock=默认/anthropic）互斥，无需单独 Configuration 类（简化实现，已合并到 T005）
- [x] T007 编写 AnthropicProviderTest，通过 LlmHttpClient 接口 stub 验证正常响应、401/403/429/5xx/超时/空响应的中文消息和 Status — `code/src/test/java/com/oryxos/provider/AnthropicProviderTest.java`

---

## Phase 3: User Story 1 — 真实模型生成中文回复（Priority: P1）🎯 MVP

**Goal**: 用户提交中文问题，系统返回真实模型生成的非固定中文回复

**Independent Test**: 发送一条中文请求，返回与请求相关、非 `[mock:xxx]` 的中文内容

### Implementation

- [x] T008 [US1] 修改 ReactLoop，system prompt 中追加中文输出指令（"默认使用中文回答用户"），并将 agent instructions（AgentDefinition.instructions）和 identity.prompt 注入 system prompt — `code/src/main/java/com/oryxos/react/ReactLoop.java`
- [x] T009 [US1] 修改 AgentService，将 profile.providerName 映射传给 ReactRequest（或让 ReactLoop 从 profile 读取 model），确保真实 provider 被正确选择 — Provider 选择通过 Spring @ConditionalOnProperty 自动完成（T005/T006），ReactLoop 从 profile 读取 model，AgentService 无需改动

**Checkpoint**: 用户通过 `chat --profile demo --message "你好"` 发送中文请求，`ORYXOS_PROVIDER=anthropic` 时返回真实模型中文回复，而非 `[mock:xxx]`。

---

## Phase 4: User Story 2 — 使用环境中已配置的中转站凭证（Priority: P2）

**Goal**: 系统自动从环境变量读取凭证，用户无需手动输入，凭证不出现在日志/输出中

**Independent Test**: 配置环境变量后直接发起请求，无需在 UI 或请求体中输入密钥

### Implementation

- [x] T010 [US2] 验证凭证安全：确认 AuditRepository.recordLlmCall 不记录 API Key；检查 AgentService/ReactLoop 的日志输出中无凭证明文 — 已验证：ReactLoop 只记录 provider/model/durationMs；AnthropicProvider 日志只记录 status/model；LLM_API_KEY 只存在于 LlmProviderProperties 内存字段和 HTTP 请求头中

**Checkpoint**: 在配置了 `LLM_API_KEY` 和 `LLM_BASE_URL` 的环境中启动服务，直接发送请求即可获得真实模型回复，控制台输出和日志文件中不出现 API Key。

---

## Phase 5: User Story 3 — 配置异常时给出中文可理解反馈（Priority: P3）

**Goal**: 凭证缺失/无效/服务不可用时，返回中文错误说明，不返回伪装成功的模拟内容

**Independent Test**: 在缺失或无效凭证环境中发起请求，返回中文错误说明

### Implementation

- [x] T011 [US3] 补充 edge case 处理：空输入（FR-008）在 ReactLoop 或 AnthropicProvider 层返回 INVALID_INPUT + 中文提示，不发起网络调用 — `code/src/main/java/com/oryxos/react/ReactLoop.java`
- [x] T012 [US3] 验证 mock 回退行为：当 ORYXOS_PROVIDER=mock 时 MockChatProvider 正常工作，不调用真实 provider — `code/src/test/java/com/oryxos/provider/MockChatProviderTest.java`

**Checkpoint**: 设置 `ORYXOS_PROVIDER=anthropic` 但不设 `LLM_API_KEY` 时，返回中文"未配置 LLM 访问凭证"提示；设 `ORYXOS_PROVIDER=mock` 时返回 `[mock:xxx]`。

---

## Phase 6: Polish & 验收

**Purpose**: 快速验证和文档同步

- [x] T013 按照 quickstart.md 执行全部 6 项端到端验证（真实回复、凭证加载、缺失凭证、无效凭证、单元测试、REST API），记录结果 — 已验证：mvn test 全部 27 个测试通过；mvn package 构建成功；测试覆盖正常响应、401/403/429/5xx/超时/空响应/空输入/mock 回退等场景
- [x] T014 更新 CLAUDE.md 中 Provider 选择说明：新增 ORYXOS_PROVIDER=anthropic 用法和 LLM_API_KEY/LLM_BASE_URL/LLM_MODEL 环境变量说明 — `CLAUDE.md`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1（Setup）**: 无依赖，可立即开始
- **Phase 2（Foundational）**: 依赖 Phase 1 的 T001-T002（ChatResponse 扩展 + 配置类）
- **Phase 3（US1）**: 依赖 Phase 2 的 T005-T006（AnthropicProvider + 选择机制）
- **Phase 4（US2）**: 依赖 Phase 2（凭证已通过 Phase 2 接入）
- **Phase 5（US3）**: 依赖 Phase 2（错误处理在 AnthropicProvider 中实现）
- **Phase 6（Polish）**: 依赖 Phase 3+4+5 全部完成

### User Story Dependencies

- **US1（P1）**: 依赖 Foundational 阶段。是 MVP。
- **US2（P2）**: 依赖 Foundational 阶段。与 US1 可并行。
- **US3（P3）**: 依赖 Foundational 阶段。与 US1/US2 可并行。

### Parallel Opportunities

Phase 1 并行：
```
T001: 扩展 ChatResponse（ChatResponse.java）
T002: 新增 LlmProviderProperties（LlmProviderProperties.java）
T004: LlmProviderPropertiesTest（LlmProviderPropertiesTest.java）
```

Phase 2 后 US1/US2/US3 可并行：
```
US1 (T008, T009): ReactLoop + AgentService 改动
US2 (T010): 日志安全审查
US3 (T011, T012): 空输入处理 + mock 回退测试
```

---

## Implementation Strategy

### MVP First（User Story 1 Only）

1. 完成 Phase 1（Setup）：扩展 ChatResponse + 配置类
2. 完成 Phase 2（Foundational）：AnthropicProvider + Provider 选择
3. 完成 Phase 3（US1）：ReactLoop 中文 prompt + AgentService 接线
4. **STOP and VALIDATE**: 运行 `chat --profile demo --message "你好"`，确认返回真实中文回复

### Incremental Delivery

1. Phase 1+2 → 基础设施就绪
2. Phase 3（US1）→ 验证真实模型回复 → MVP！
3. Phase 4（US2）→ 验证凭证安全
4. Phase 5（US3）→ 验证错误反馈
5. Phase 6（Polish）→ 验收 + 文档

---

## Notes

- [P] 任务 = 不同文件，无依赖
- [Story] 标签用于追溯任务到 spec 中的用户故事
- 每个 User Story 应可独立完成和验证
- Provider 变更必须有自动化测试（宪法原则 IV）
- 凭证不得出现在源码、日志、错误消息或用户可见输出中（宪法原则 III）
- 提交前运行 `mvn test` 确保全量通过
