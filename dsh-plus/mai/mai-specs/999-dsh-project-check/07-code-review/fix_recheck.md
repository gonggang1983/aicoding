# Feature 999：第 7 步修复与复评

[初评报告](code_review.md) · [BRIEF](../BRIEF.md)

## 后续装包增量（最新）

用户随后明确授权临时目录离线安装并禁用生命周期脚本。已执行 `npm run test:package`：strict build 与独立装包套件 **1/1 通过、0 失败、0 跳过**，真实 patch/Loader 从安装后的 tarball 加载、never-policy 拒绝、取报告和卸载均通过；新增临时目录残留为 0。详见 [package_recheck.md](package_recheck.md)。以下原复评与当时待授权记录保留为历史；其中“独立局部装包验证待执行”已由本增量关闭，UI、npm/后代和源码制品对应仍待验。没有进入第 8 步。

## 结论（源码修复复评时）

**本轮两项已确认源码发现均已修复并复核关闭；代码层面有条件合并，仅限开发增量，不给出发布/完整交付的无条件合并建议。**

R-01（P1）不再把 task-controlled stderr 匹配当作未启动证明；R-02（P2）合法 Git T 状态保留。仍保留真实 UI、Windows npm/后代、独立装包及固定版本制品对应的交付条件。第 7 步本轮评审→修复→复评已执行，不自动进入第 8 步，不标业务 AC 通过。

本轮无子 Agent 工具，由同一主 Agent 按角色顺序完成初评落盘、基于 `my-implement-code` 的局部修复和 `my-review-code` 复评；不是独立第二人审查。Profile/模板/有效需求来源及范围沿用初评报告。

## 修复及复核

| 发现 | 最小修复 | 复核证据 | 状态 |
|---|---|---|---|
| R-01 / P1 | `src/runner.ts:100–107`：匹配 runner fatal 时 started=possible，分类 unknown、原因 TERMINATION_OR_OUTCOME_UNKNOWN；不伪造 task 时间/退出事实；沿用 coordinator 的 unknown 停调度和 safe-cache | 修改原错误测试预期；新增 coordinator 协议测试确认真实 fixture 执行发生、launch 仅 1 次、第二任务 not_run、overall inconclusive、JSON schema/Markdown/cache/notices 一致；新增真实 Windows 受限 direct Node 测试，脚本到达 main、写 windows-acl-run: 并 exit 127，结果 unknown | 已关闭 |
| R-02 / P2 | `src/git.ts:36` 白名单接纳 T，不放宽非预期字符/破损数据 | 新增 ` T`、`T `、`TM` 三组逐字节/NUL/subtree 测试，保留路径和精确计数；Z 负例仍 incomplete | 已关闭 |

R-01 明确前置失败仍是 not_run（现有 synchronous preparation failure 回归通过）；正常非零退出仍 failed 并继续；真实根进程超时仍 failed；通道/受管范围不明仍 unknown。没有新增启动猜测、重试、权限提升或 provider 内部修改。命中 stderr 子串无法区分“wrapper 真失败”与“task 伪造”的两种来源，因此选择 unknown 是对现有 BR-05 的保守落实，不是把实际未启动编造成已启动，也不是把终态缺失改成通过。若未来需要精确 not_run，须宿主提供独立的任务启动回执，不能再凭日志推断。

新增 `tests/review-regressions.test.mjs` 为协议测试；真实 Windows 用例在 `tests/runner.test.mjs`，走原有 read-only sandbox/subprocess，不 mock confinement 或换原 argv 后备执行；非 Windows 明确不运行此平台特定用例。本机真实结果为 partial。该新用例证明 task 可实际输出与 active Windows wrapper 同形的消息，**不是 npm argv/lifecycle、后代终止或 UI 批准证据**。R-02 是 parser 层修复，未新增 OS 符号链接类型变更用例。

## 实际命令与结果

cwd：`dsh-plus/mai/`；实际版本：Windows x64，Node v24.18.0，npm 11.16.0。直接 DSH 依赖保持 0.2.2-rc.3、Cordis 4.1.0；同版不冒充源码 SHA 对应证明。

| 顺序 | 命令/操作 | 退出码及观察 |
|---|---|---|
| 初评 | inline Node Git T 与模拟 task/runner 子串探针 | 0；观察到 paths=[]/incomplete，以及 executed=true 却 not_run，确认缺陷，不称通过 |
| 红灯复现 | `node --test tests/review-regressions.test.mjs`（生产代码修复前） | 1；4 项失败。三组 T 被丢弃；coordinator 误启动第二项，launches=2 |
| 第一轮修复验证 | `npm test`（含 strict tsc build） | 0；147 项 / 146 pass / 0 fail / 1 blocked skip |
| 增加真实 Windows 回归后全量 | `npm test`（含 strict tsc build） | **0；148 项 / 147 pass / 0 fail / 1 blocked skip**；约 11.1 秒。新增受限真实 Node 同形消息测试实际通过 |
| 路径检查 | `node .agents/skills/my-create-feature/scripts/validate-feature.mjs --feature mai-specs/999-dsh-project-check --artifact code-review` | 0；valid=true，无 issues/warnings；仅证明产物路径合法 |
| 包清单检查 | `npm pack --dry-run --json --ignore-scripts` | 0；33 文件（dist/README/package.json/patch），无 tests/过程文档/node_modules；不是安装/patch 启动证明。README 随后仅更新最新统计和修复说明，白名单结构不变 |

唯一 skipped 是历史固定探针的 child spawn EPERM；未以新 skip 隐藏本轮缺陷。没有新增依赖或安装，没有模型调用、凭据读取、修改个人 DSH_HOME、关沙箱、扩 ACL、提交/推送/发布；自有临时 Git fixture 的初始化和提交仍限测试隔离树。

## 变更范围与最终指纹

本轮改动：`src/runner.ts`、`src/git.ts`、`tests/runner.test.mjs`、新增 `tests/review-regressions.test.mjs`；README 更新开发结果/边界。评审产物在本目录，索引由主编排者同步；不修改 PRD、设计、Phase 或 ROADMAP。package/lock、运行策略、审批语义、配置和宿主核心未变。

HEAD 保持 `ebdaabbc1e915b47a7a46294bdef6c8b3ecfda15`；原插件仍是未跟踪工作区，归因和比较限制不变。按初评同一算法：最终范围 38 个文件，聚合 SHA-256 `634d985682bd0d0926f637b6f63e79a0970aced0bf39b488ad2af85a19929ffd`。

| 文件 | 修复后 SHA-256 |
|---|---|
| src/runner.ts | 4f94784ac9e069db4f46a3955041e04d3e9ac67603b1dc6ab241e0a0ff4890a9 |
| src/git.ts | c12bd4d6b567925932d3b14f5830263b9df1dfff729fdb2d669ef95e2bd127e9 |
| tests/runner.test.mjs | 7b599bbe981cd194f3ea5aa33e94f1d01aa68a2ec129b117518f0d6851bd8509 |
| tests/review-regressions.test.mjs | 29a067ebba0a8f2a095a39efc738966f26900140bcee1118eda2c7e7578e6768 |

## 未关闭的交付条件与下一步

1. 优先取得独立临时目录离线 tarball 安装验证授权后，执行既有 opt-in `npm run test:package`，核查真实 Loader/patch 装配、never-policy 拒绝、取报告及卸载。它仍不关闭真实 UI 或 npm 执行 AC。
2. 安排目标版本交互宿主及用户审批参与，依既有 TC-01/03/05/07/08 补展示、批准/拒绝/取消、取报告和长调用证据；不要把协议 allowed-once 当作 UI。
3. 受限环境确认 npm argv/pre/post、后代创建/终止及版本制品来源；现有 EPERM 不解就保留受阻，不改变沙箱来使测试变绿。

这些已有 TC 覆盖，不重新创建第 5 步计划，不建立第 8 步验收文件。本轮后暂停，等用户确认后续验证授权和安排。
