# 第 6 步续执行：生命周期修复与当前交接

本记录是 IMPLEMENTATION.md 的增量补充，不替代历史实施记录、PRD 或测试计划。用户本轮要求根据 BRIEF 继续编码直至完成；沿用仅第 6 步的授权，不跨入第 7/8 步，不从编码要求推导新的安装或权限授权。

## 恢复核实

- 当前磁盘已有四工具及发现、配置、Git、冻结、审批协调、执行、脱敏、双报告与会话缓存源码。
- 首次全量 `npm test`（含 strict build）为 140 项：139 通过、0 失败、1 项后代 spawn EPERM 受阻跳过，符合上轮记录。
- 磁盘还已有 `cordis.patch.example.yml`、`tests/packaging/package.test.mjs` 及 `test:package` 命令。本轮没有创建这些既有文件，不追认其来源或成功执行事实。独立装包测试会执行 npm install，即使 offline/ignore-scripts 也属于安装；本轮未执行。

## 本轮代码修复

`src/coordinator.ts`：

1. preview 将调用取消与插件卸载信号组合后传给 snapshot。
2. snapshot 返回后再次检查卸载和取消，避免晚到的成功读取在卸载后向已清空的 store 写入计划，或向已取消调用返回有效计划。
3. dispose 在 finally 中等待已登记运行任务并清空 store，避免 provider dispose 抛错时跳过会话数据清理。保留原始清理失败，不伪造 provider 已成功卸载。

新增 `tests/coordinator-lifecycle.test.mjs` 三项协议回归：读取期间取消、读取期间卸载、provider 清理失败后清空计划/报告。先运行新用例，三项全部失败，复现真实代码缺陷；修复后全量通过。这些是协议回归，不是 OS 进程树或真实 UI 证据。

## 实际验证

cwd 为 `dsh-plus/mai/`。

| 检查 | 结果 |
|---|---|
| 基线 npm test | 140 项：139 pass / 0 fail / 1 blocked skip |
| 修复前 node --test tests/coordinator-lifecycle.test.mjs | 3 fail，复现缺少拒绝和缓存未清理 |
| 修复后 npm test（含 strict TypeScript build） | **143 项：142 pass / 0 fail / 1 blocked skip**，约 8.4 秒 |
| npm pack --dry-run --json --ignore-scripts | **33 文件**：dist、README、package.json、patch 示例；无 tests、过程文档、node_modules，无实际 tarball 生成或安装 |
| npm run test:package | **未执行**；需要独立局部安装授权 |

## 当前完成界限

核心源码和当前授权/环境允许的开发验证已收尾；**第 6 步整体仍未满足原有集成完成门槛**，不能仅通过增加协议测试宣布完成。

仍需完成：

- 目标 DSH 交互宿主中真实 UI approve/reject/cancel、计划显示及取消后的报告获取；需用户参与真实审批，不能由模型伪造 allowed-once。
- Windows 受限 npm argv/lifecycle 与后代创建/终止；当前固定探针仍同步 spawn EPERM。未关闭沙箱、扩大权限或非受限重试。
- 独立压缩包装配与真实 patch 加载，及版本/源码 SHA 对应证据。既有测试代码不等于验证成功。

继续关闭门槛需要用户确认：是否允许在测试自动创建并清理的系统临时目录执行既有离线 tarball 局部安装验证（禁用生命周期脚本、不访问 registry、不全局安装、不修改个人 DSH_HOME），以及安排已配置的目标版本交互宿主与审批参与。此确认不是第 7/8 步授权；权限或沙箱策略变更仍须单独确认。

本轮未新增依赖、安装、读取凭据、发起模型调用、修改宿主核心、扩大权限、执行用户项目 npm 生命周期、提交或发布。保留 draft 和全部未验 AC，不生成第 7/8 步文档。
