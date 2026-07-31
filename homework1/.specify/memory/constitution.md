<!--
Sync Impact Report
Version change: template/unversioned → 1.0.0
Modified principles:
- Placeholder Principle 1 → I. Java-Native Agent OS Core
- Placeholder Principle 2 → II. Markdown-Declared Agent Portability
- Placeholder Principle 3 → III. Security, Privacy, and Auditability by Default
- Placeholder Principle 4 → IV. Testable Vertical Slices
- Placeholder Principle 5 → V. Operational Simplicity and Observability
Added sections:
- Technology and Architecture Constraints
- Development Workflow and Quality Gates
Removed sections:
- None; template placeholder sections were concretized.
Templates requiring updates:
- ✅ updated: .specify/templates/plan-template.md
- ✅ updated: .specify/templates/spec-template.md
- ✅ updated: .specify/templates/tasks-template.md
- ✅ checked/no update required: .specify/templates/checklist-template.md
- ✅ checked/no update required: .claude/skills/speckit-*/SKILL.md
Runtime guidance requiring updates:
- ✅ checked/no update required: code/README.md
- ✅ checked/no update required: docs/DemandAnalysis.md
- ✅ checked/no update required: docs/VisionAndRoadmap.md
Follow-up TODOs:
- None
-->
# OryxOS Constitution

## Core Principles

### I. Java-Native Agent OS Core

OryxOS MUST remain a Java-native enterprise Agent OS runtime before it expands into
higher-level orchestration. Core implementation decisions MUST preserve Java 21,
Spring Boot 3.x, Spring MVC or virtual-thread-friendly synchronous execution, and a
clear Provider → ReAct Loop → Tool → Memory → API runtime path. New frameworks,
reactive stacks, or distributed components MUST be justified in the implementation
plan by a concrete requirement that cannot be met with the existing stack.

Rationale: OryxOS exists to fill the Java enterprise Agent OS gap. A small,
auditable Java runtime is more valuable than a broad but incoherent architecture.

### II. Markdown-Declared Agent Portability

A business Agent MUST remain representable as a directory with an `AGENT.md`
frontmatter profile and markdown instructions, plus optional `skills/`, `scripts/`,
and reference files. Features that add Provider, Tool, MCP, Skill, Memory, Channel,
or schedule capability MUST keep those capabilities declarative and portable unless
the feature explicitly targets a Java-only extension point such as `@Tool` beans.
Generated or updated Agent definitions MUST be human-readable and safe to review in
Git.

Rationale: The project goal is to reduce Agent definition cost to natural language
and markdown while retaining GitOps reviewability.

### III. Security, Privacy, and Auditability by Default

Sensitive values such as LLM API keys, database passwords, Tool credentials, and
MCP credentials MUST NOT be hardcoded in source files, `AGENT.md`, Skill files,
prompts, generated output, or normal logs. They MUST be loaded through environment
variables or dedicated configuration mechanisms with clear validation errors. Tool
execution MUST pass sandbox checks for paths, commands, domains, timeouts, and
resource limits before execution. Every LLM call and Tool invocation that changes
state or reaches an external system MUST produce an audit record containing status,
timing, target Provider or Tool, and a redacted error/result summary.

Rationale: OryxOS is intended for private enterprise deployment where data residency,
credential protection, and replayable audit trails are baseline requirements.

### IV. Testable Vertical Slices

Every feature MUST be specified and implemented as independently testable user-value
slices. The implementation plan MUST identify the minimum viable user story, its
acceptance scenarios, and the commands or API calls that prove it works. Changes to
Provider integration, ReAct behavior, Tool execution, sandbox policy, persistence,
public REST endpoints, or audit records MUST include automated tests or an explicit
constitution-approved justification for why automation is not feasible. Tests MUST be
run with `mvn test` when Java code changes are made.

Rationale: OryxOS is a runtime system; unverified integration changes can appear to
work while silently breaking Agent behavior, safety checks, or auditability.

### V. Operational Simplicity and Observability

The default deployment and development path MUST stay simple: local workspace,
SQLite plus Flyway, CLI commands, REST health/info endpoints, structured logs, and
Maven build commands. New complexity such as additional databases, queues, clusters,
model-routing layers, or dashboards SHOULD be introduced only after the simpler path
is documented and remains usable. User-visible failures MUST return clear Chinese
messages when the feature serves Chinese users, and operational failures MUST be
observable through logs, status endpoints, metrics, or audit records.

Rationale: The project roadmap explicitly values “slow is fast”: a dependable,
observable core is the foundation for distributed Agent teams later.

## Technology and Architecture Constraints

- Runtime language is Java 21; build and test flow uses Maven.
- Primary application framework is Spring Boot 3.x with Spring MVC and Actuator.
- Default persistence is SQLite with Flyway migrations. PostgreSQL, MySQL, vector
  stores, or other persistence layers require a plan-level migration and fallback
  story.
- CLI behavior is part of the product contract. Any feature exposed via REST SHOULD
  also identify whether a CLI path is needed for local operation or demonstration.
- Agent workspace artifacts use markdown and frontmatter conventions. Changes to
  `AGENT.md`, `SKILL.md`, `MEMORY.md`, bootstrap files, or templates MUST preserve
  human reviewability.
- Provider integrations MUST isolate provider-specific protocol, authentication,
  error mapping, and model configuration behind the Provider abstraction. Application
  code outside the Provider layer MUST NOT depend on a single vendor protocol unless
  the feature explicitly requires that protocol.
- Sandbox-sensitive tools MUST default to deny-by-configuration when a path, command,
  domain, or credential requirement is missing.

## Development Workflow and Quality Gates

- `/speckit-specify` outputs MUST express user stories, edge cases, functional
  requirements, and measurable success criteria in a way that can be validated
  without reading implementation code.
- `/speckit-clarify` MUST resolve configuration, security, data, and integration
  ambiguities that would change implementation or tests before `/speckit-plan`.
- `/speckit-plan` MUST include a Constitution Check covering all five core principles.
  Any violation MUST be recorded in Complexity Tracking with a simpler rejected
  alternative.
- `/speckit-tasks` MUST group work by independently testable user stories and include
  foundational tasks for configuration, sandbox, audit, and observability when those
  areas are touched.
- Implementation MUST keep generated docs, quickstarts, and acceptance commands in
  sync with behavior. If a command or API example is changed, the matching README or
  feature quickstart MUST be updated in the same change.
- Code review MUST treat violations of MUST statements in this constitution as
  blocking defects unless the constitution itself is amended first.

## Governance

This constitution supersedes conflicting project practices, generated plans, and task
lists. Feature specifications, implementation plans, and tasks MUST be interpreted in
light of these principles.

Amendments require an explicit constitution update that includes a Sync Impact Report,
a semantic version change, and review of dependent Spec Kit templates and runtime
guidance. Principle removals or incompatible redefinitions require a MAJOR version
increment. New principles, new governance sections, or materially expanded guidance
require a MINOR increment. Clarifications and wording-only refinements require a
PATCH increment.

Compliance is checked at `/speckit-plan`, `/speckit-analyze`, `/speckit-converge`,
and code review time. If a feature cannot satisfy a MUST principle, the plan MUST
name the violation, explain why it is necessary, and document the simpler compliant
alternative that was rejected before implementation begins.

**Version**: 1.0.0 | **Ratified**: 2026-07-31 | **Last Amended**: 2026-07-31
