# 第 8 步本轮自动化复核证据摘要

此文件是工具实际输出的人工摘要/节选，不是完整 stdout、原始业务会话报告或新执行脚本。没有原始秘密、模型请求或用户项目日志。

## 本轮执行

cwd：`dsh-plus/mai/`。命令 `npm test` → pretest `npm run build` → `tsc -p tsconfig.json` → `node --test tests/*.test.mjs`。

- 命令退出码：0。
- tests 148，pass 147，fail 0，cancelled 0，skipped 1，todo 0。
- Node test runner duration_ms：7914.3378（不含前置构建）。
- 唯一跳过：`G-02: cancellation ends a ready synthetic parent and its provider-managed child`。
- 原输出原因：`BLOCKED G-02: confined child spawn returned EPERM; descendant cancellation and npm lifecycle capability NOT verified. No privilege expansion or fallback.`
- 真实 read-only Node/Git provider probes 报告 enforcement=partial。

## 已执行通过的关键证据组

| 现有测试 | 本轮观察及边界 |
|---|---|
| config.test.mjs / host.test.mjs | 配置负例、限额、包管理器/锁、真实 fs 边界/链接读取拒绝通过；不是所有真实 UI 输入旅程 |
| plugin.test.mjs / project.test.mjs | 真实 Cordis 发现、候选/任务分离、标签/参数保护、卸载及纯发现投影通过 |
| git-integration.test.mjs | 5 组真实临时 Git 仓库：clean/staged/unstaged/untracked、中文/空格、子树与 rename、top-200/脱敏、非仓库/取消；采集走现有 read-only/partial 沙箱，索引字节对照通过 |
| git-runtime.test.mjs | pipe 尾部/close/非法编码/取消是协议故障测试，不当作真实 Git 缺失环境 |
| runner.test.mjs | 真实受限 direct Node：0/7、大流、合成敏感字面值、任务超时；Windows 同形 runner 消息回归通过；不用 npm，不运行项目 scripts |
| runtime-boundaries.test.mjs | 真实受限 direct Node 中文/空格/元字符 argv、非零独立管道、就绪根进程取消通过；就绪后代测试因 EPERM 受阻 |
| runtime-plugin.test.mjs | 真实 session/approval(never)/policy/fs 服务；冻结 argv/超时、拒绝、not_run、同会话缓存、非法 approved/outputPath 拒绝、无项目增量、卸载通过；agent facade 合成，非 UI 批准 |
| runtime-policy.test.mjs / coordinator-lifecycle.test.mjs | 策略/取消/卸载竞态与清缓存协议回归通过；成功的 full/none 注入不证明 OS 隔离能力 |
| safety.test.mjs / redact.test.mjs / workflow.test.mjs / tool-errors.test.mjs | 状态表、输出/元数据整字段保护、转义、schema、会话归属/TTL/锁/重放、非零继续与 unknown 停调度、错误防泄漏通过；协议 allowed-once 不等于真实批准，文本实体断言不等于 UI renderer |
| review-regressions.test.mjs | R-01 调度/缓存 unknown 和 R-02 Git T 状态 parser 回归通过 |

真实 never-policy 用例断言 report/tasks/缓存一致，但当前测试输出未导出其 plan/run ID、完整 JSON/Markdown 或审批截图；不能将其伪造成完整业务运行证据。

## 未在本轮重复的历史有效证据

[第 7 步装包记录](../../07-code-review/package_recheck.md)：上一轮用户单独授权后实际执行 `npm run test:package`，1/1 通过、0 跳过，临时装包清理新增残留为 0。打包驱动未变；本轮未安装或重复该命令，不将它加进本次 148 项。

## 现场安全检查

- 无新增安装、真实项目脚本、模型调用、个人配置/凭据读取、权限扩大、关沙箱、Git 用户仓库提交/推送/发布。
- 真实 Git 用例的 init/add/commit 仅针对测试自建临时仓库，hooks/signing 关闭；生产采集仍受限。
- 测试进程前台返回，无本轮后台进程待停止。各进程夹具现有 teardown 的 terminate/waitForExit 断言无失败，不扩大为脱离受管范围后代的绝对保证。
- 测后 dsh-git/plugin/runtime/pack 前缀目录未观察到；另有 6 个 dsh-check 和 1 个 dsh-spill 目录时间早于本轮（环境时钟 2026-11-18），归属未确认，未读取内容或删除。没有本轮前集合，故不宣称整个临时区零残留。
- [环境快照](environment.json)记录版本、局部制品和测试输入 SHA-256。README 在归档时更新，不修改源码或测试。
