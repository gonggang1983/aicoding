# dsh-project-check 插件安装和使用手册

## 1. 版本与交付状态

适用插件：`dsh-project-check@0.1.0`，仓库代码根为 `dsh-plus/mai/`。当前是 TypeScript ESM 开发增量，尚未发布到 npm registry，不应按名称下载未经核实的同名包。

**本轮验收已收束为受阻，未通过、未结项。** 用户确认目前没有 DSH 交互界面，真实批准/取消/展示无法验收。本手册不是发布通过声明；安装成功不代表脚本可运行。

- strict 构建通过；自动测试 148 项：147 通过、0 失败、1 项后代 EPERM 受阻跳过。
- 历史独立离线 tarball/真实 patch/Loader 验证 1/1 通过，覆盖加载、发现、预览、never-policy 拒绝、报告与卸载。
- 真实 UI、Windows npm argv/pre/post、后代终止、固定制品与设计源码 SHA 对应仍未完整验证。

[验收记录](../mai-specs/999-dsh-project-check/08-acceptance/ACCEPTANCE.md)。本文件为仓库配套手册，位于 docs/，**不在当前 tarball 白名单内**；分发离线包时请另附本手册。

## 2. 功能和安全边界

流程：只读发现项目/配置/Git → 冻结所选任务 → 宿主一次批准 → 串行执行 npm scripts → 会话 JSON/Markdown 报告。

不自动创建配置、安装依赖、修复、提交/推送/发布；不导出或创建报告文件。候选脚本不等于配置任务，配置任务不等于获准任务。获准 npm/pre/post 脚本仍可按宿主能力写文件或联网；宿主可自行保存会话，这些不等于插件报告落盘。

## 3. 安装前提

已验证开发组合：**Windows x64、Node 24.18.0、npm 11.16.0、DSH 0.2.2-rc.3、Cordis 4.1.0**。Git 可选，缺失应报告变更证据不足，不能虚构 clean。其他平台/版本未测，不作兼容承诺。

完整宿主需 tools/fs/approval/subprocess/sandboxPolicy/sandbox、有效 session/turn 及审批流程；仅 tools/fs 可独立发现。精确 peers 见插件 package.json；插件不自带 DSH UI、不配置模型账号。没有界面时可准备构建或获准运行隔离测试，不能完成真实批准旅程。

部署配置：

| 字段 | 要求 |
|---|---|
| readRoot | 可信部署者指定的绝对读取边界，尽量限定项目；不替代宿主策略 |
| nodeExecutable | 宿主当前映射的 Node 24.18.0 二进制；不能随意换另一个 Node |
| npmCliPath | 可信 npm 11.16.0 的 bin/npm-cli.js 绝对路径，不是 npm.cmd |
| requireFullEnforcement | 示例为 true；当前 provider 实测 partial，必须拒绝不满足 full 的执行，不为测试调低要求 |

## 4. 构建与离线安装

以下是**部署者审阅后手动执行的示例**；本次编写手册未执行安装或启动宿主。替换所有 C:/REPLACE 路径，使用已授权的隔离部署目录，不默认修改个人 DSH_HOME。

### 4.1 构建和打包

已有固定依赖的代码工作区：

```powershell build-package.ps1
Set-Location 'C:/REPLACE/repository/dsh-plus/mai'
node --version
npm --version
npm run build
npm pack --dry-run --json --ignore-scripts
npm pack --ignore-scripts
Get-FileHash -Algorithm SHA256 './dsh-project-check-0.1.0.tgz'
```

**任一步失败即停止**，不要打包陈旧 dist。当前包白名单：dist、README.md、package.json、cordis.patch.example.yml；历史实测 33 文件，不包含源码/测试/过程文档/node_modules/手册。记录本次实际包的 SHA-256，不照抄历史 dry-run 摘要。

若源码依赖未装，需另行批准并准备锁定依赖/离线缓存。缓存齐全时可由部署者明确执行 `npm ci --offline --ignore-scripts --no-audit --no-fund`；缓存缺失就停止，不去掉 offline 联网重试。禁用 hooks 不表示显式 build/test 不执行。

### 4.2 安装本地 tarball

选已有精确 DSH peers 的**隔离宿主依赖目录副本**，先备份 package.json/lockfile，再安装：

```powershell install-local-package.ps1
Set-Location 'C:/REPLACE/existing-host-dependency-root'
npm install 'C:/REPLACE/artifacts/dsh-project-check-0.1.0.tgz' --offline --ignore-scripts --legacy-peer-deps --no-audit --no-fund
```

命令会修改选定目录的依赖/清单/锁，必须先确认目录与授权。legacy-peer-deps 避免自动解析安装 peers，**不验证兼容性**；应预先具备精确 peers，缺依赖就停止。

上面是部署示例；实际验证是在临时目录安装插件，通过临时 junction 复用已装宿主 peers，并自动清理。它不证明完整 DSH 从零安装或任意依赖布局可用。不要求全局安装，不用 npx 自动下载，不用隐式在线插件管理安装替代。

开发时也可直接加载本仓库 build 后的 dist/index.js，但这不是独立包安装验证。

## 5. 配置宿主 overlay

复制包内 cordis.patch.example.yml 到独立部署文件，替换全部绝对路径。JSON/YAML 建议正斜杠；不要放密钥。

```yaml cordis.project-check.patch.yml
- insert:
    - id: dsh-project-check
      name: 'C:/REPLACE/host/node_modules/dsh-project-check/dist/index.js'
      config:
        readRoot: 'C:/REPLACE/project'
        nodeExecutable: 'C:/REPLACE/node.exe'
        npmCliPath: 'C:/REPLACE/node_modules/npm/bin/npm-cli.js'
        requireFullEnforcement: true
```

保持宿主已有审批/fs/沙箱服务，不另挂不受限 fs、不扩 ACL、不切 danger-full-access。项目/模型不能覆盖部署配置。

仅在**已有、已配置且获准启动**的 profile 上附加 overlay。CLI 参数形式经固定包源码核对，真实 UI 启动未验收：

```powershell launch-existing-profile.ps1
& 'C:/REPLACE/host/node_modules/.bin/dsh.cmd' --profile 'REPLACE_EXISTING_PROFILE' --patch 'C:/REPLACE/cordis.project-check.patch.yml'
```

局部 CLI 不在 PATH 不等于未安装。没有 profile/UI 时停在此处，插件不能提供界面。不要用 --from-default-profile 自动重建个人配置；不要分享可能含秘密的 dump-config/启动诊断。启动可能写宿主文件、使用模型配置或建立连接，需部署者另行确认。

若自行后台启动，应记录确切 PID，停止时仅处理该 PID，例如 `Stop-Process -Id <已确认PID>`，不要结束所有 node 进程。

## 6. 配置项目任务

在目标 package.json 同级手工创建；假设 test/build 已存在：

```json .dsh-project-check.json
{
  "version": 1,
  "tasks": [
    { "id": "unit", "name": "单元测试", "script": "test", "args": [], "timeoutSeconds": 120 },
    { "id": "build", "name": "构建", "script": "build", "args": [], "timeoutSeconds": 120 }
  ],
  "redactLiterals": []
}
```

- id/name/script/args 必填；ID 唯一非空；script 是 scripts 自有键，不以 - 开头、不含 NUL。
- args 为字符串数组，不拼 shell、不放凭据；npm 内部 Windows shell 转发尚未完成验收。
- 超时省略默认 120 秒，允许 1～1800 整数；最多 20 任务，按配置顺序串行。
- 不接受 command/env/cwd/outputPath 等未知字段；cwd 固定目标项目。
- redactLiterals 可省略/为空，元素不可空字符串；只用合成值测试，不收集真实秘密。
- 非 npm 声明及 pnpm/yarn/bun 锁冲突可阻断，不自动回退 npm。配置无效会隐藏动态元数据，不绕过后执行。

## 7. 使用四个会话工具

以下是**宿主工具调用示意，不是终端命令或已通过的 UI 教程**。需要有效会话，不能伪造 approved 获得授权。

### 7.1 发现：不执行项目脚本

```json project_check_discover.arguments.json
{ "projectPath": "C:/REPLACE/project" }
```

可省略路径，取调用会话 cwd；无 cwd 则必须显式提供绝对路径，不支持相对路径。检查 configStatus、候选/配置区分、toolchainBlockers、Git 和 evidenceGaps。发现总览 inconclusive 是正常的，因为没有执行检查。

### 7.2 预览：保留完整返回计划

```json project_check_preview.arguments.json
{ "projectPath": "C:/REPLACE/project", "taskIds": ["unit", "build"] }
```

核对路径、任务、Node/npm、argv、超时、策略与生命周期风险。预览不执行项目脚本；空选择不代表通过。无法安全展示参数时会阻断，而不是批准隐藏的操作。

### 7.3 运行：只接受完整计划

调用 project_check_run，参数对象仅包含 plan，值为上一步**原样返回的完整计划对象**，不是 planId、摘要或重拼命令。不要添加 approved=true、修改 argv，本文不提供伪造计划 JSON。

只接受宿主 allowed-once；普通会话文字“同意”不替代审批服务。核对 npm/pre/post 可写文件/联网风险后再决定。拒绝、取消或审批不可用不得启动所选项。

计划单次消费，拒绝后也要重新预览；文件/工具链/策略变化会阻断。预览最多 10 份/10 分钟。同项目同实例已有运行或等审批时 busy，不排队。

当前 partial provider 不满足示例 full 要求时，得到前置阻断是预期保护；**不要调低 requireFullEnforcement 来完成验收**。

### 7.4 同会话取报告

预览 planId 也是未来 runId，用真实 ID 替换占位值：

```json project_check_report.arguments.json
{ "runId": "REPLACE_WITH_PREVIEW_PLAN_ID" }
```

取消可能传播 abort 而没有正常工具返回；可同会话尝试取安全部分报告。缓存最近 5 份/10 分钟；跨会话、过期/淘汰、重启/卸载后不可取，不会自动重跑。

## 8. 结果、取消与隐私

| 任务状态 | 含义 |
|---|---|
| passed | 正常退出 0 且受管终态确认 |
| failed | 真实非零退出，或确认的超时/执行中取消 |
| not_run | 未启动，如拒绝、未选、前置阻断；不虚构时间/退出码 |
| unknown | 可能启动但终态不足；提示残留并停止后续调度 |

总览：有选定 failed 则 failed；否则空选、有选定 not_run/unknown 或必要执行证据不足则 inconclusive；非空选定集全 passed 才 passed。普通非零继续后续已批准任务，无自动重试。未选项不覆盖，无 Git 单独列缺口，日志打印 success 不等于通过。

使用宿主既有取消入口，不新增取消工具。正常取消停止调度并尝试终止受管范围；根进程退出不能证明所有后代退出。未知终态须核查已识别残留，不宽泛杀进程/扩大权限。真实 UI 取消、Windows 后代终止仍待验。

JSON/Markdown 来自同一安全结果；两管道合计保留上限 64 KiB，溢出继续消费并标截断。命中秘密、截断、编码/流不完整可整字段隐藏。Git 最多展示 200 路径，元数据单文件限 1 MiB。

脱敏不保证识别全部未知/编码秘密；不要把秘密放工具参数。会话内容可能随宿主请求发往模型服务。无 export 或报告写盘参数；用户自行保存返回内容前需审阅敏感信息。

## 9. 常见问题

| 现象/原因 | 处理 |
|---|---|
| 无 DSH 界面 | 插件不自带 UI；先准备兼容宿主，不声称完整验收通过 |
| 只有 discover | 核查运行服务装配/生命周期，不手工绕过审批补工具 |
| Node/npm 不匹配 | 核对可信绝对路径和固定版本，不用 npm.cmd 或项目 npm 替换 |
| APPROVAL_NOT_GRANTED | 处理宿主审批条件，重新预览，不伪造批准 |
| PLAN_CHANGED / 过期 / 重放 | 重新预览批准，不改旧计划 |
| BUSY | 等本次结束/通过宿主取消后再新建计划，不并发绕锁 |
| FULL_ENFORCEMENT_REQUIRED / partial | 保留拒绝，准备满足要求的 provider；不放宽配置使测试变绿 |
| spawn EPERM | 记录受限失败；不提权/关沙箱/原始 argv 重试，不当作任务通过 |
| REPORT_UNAVAILABLE | 核对会话/真实 ID/TTL/卸载状态；报告不持久，不自动重跑 |
| 输出隐藏/截断 | 是保守保护，不通过关闭脱敏取原始秘密；在授权环境自行检查合成样例 |
| Git unavailable/incomplete | 按缺口解释，不当 clean，也不把差异全部归因任务 |

分享问题时只提供版本、固定错误码、安全配置摘要及已审阅的脱敏报告；启动诊断可能含原始配置，不直接上传。

## 10. 验证、卸载和升级

已有依赖的开发环境可手动执行：

```powershell verify-existing-source.ps1
Set-Location 'C:/REPLACE/repository/dsh-plus/mai'
npm test
```

这会构建并运行含自建临时 Git 仓库/受限进程的测试，不是 UI 验收。`npm run test:package` 会在临时目录做离线局部安装，即使自动清理也需单独授权；本文不自动执行它。

卸载顺序：

1. 通过宿主取消本插件任务，确认受管进程结束；unknown 时先核查已识别残留。
2. 从启动参数移除本插件 --patch，或在部署者维护的 overlay 移除 dsh-project-check 条目；不删除共享宿主配置。
3. 经宿主支持的 Loader 卸载或受控重启后，核查四工具均消失。卸载/重启清内存报告，不承诺取消报告持久保留。
4. 如需删除包，由部署者在确认的安装目录明确执行卸载；离线、禁用 hooks，并审查 package/lock 差异：

```powershell uninstall-local-package.ps1
Set-Location 'C:/REPLACE/existing-host-dependency-root'
npm uninstall dsh-project-check --offline --ignore-scripts --legacy-peer-deps --no-audit --no-fund
```

升级前备份旧包、overlay 和安装清单，保存已审阅且需要的报告。新版本记录 hash、重跑构建/装包及受影响宿主验收；失败可恢复已确认的旧制品与配置，但旧版本也仍受本手册验收限制。不删除未知临时目录、业务项目配置或其他插件依赖。

## 11. 没有交互界面时的交付清单

可交付：源码/锁/构建、经核对的 tarball 与摘要、本手册、非敏感 overlay/项目配置示例，以及[验收证据](../mai-specs/999-dsh-project-check/08-acceptance/ACCEPTANCE.md)。

不可声称：真实批准项目运行、npm/pre/post、后代终止、UI 渲染或业务验收已通过。待目标宿主和用户审批参与就绪后，在第 8 步续验；无需假装本轮已经完成这些项目。
