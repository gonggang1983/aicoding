# dsh-project-check 技术方案

> Feature：999 | Profile：standard | 状态：第 4 步首版收缩稿；仅会话双报告，无报告文件导出；G-03 因范围移除不再阻断首版
> 需求来源：[PRD](../02-prd/PRD.md)，FR-01～10、BR-01～12、NFR-01～07、AC-01～13。
> 模板：`mai-specs/_templates/TECH_DESIGN.tmpl.md`，按无页面、无数据库插件裁剪。
> 本地基线：main@ebdaabbc1e915b47a7a46294bdef6c8b3ecfda15；.gitignore 已有修改、dsh-plus/ 未跟踪，不改忽略规则。

[返回 BRIEF](../BRIEF.md) · [供评审的代码设计](CODE_DESIGN.md) · [设计评审与修复复核](../04-design-review/design_review.md) · [历史导出研究（非首版依赖）](G03_EXPORT_CAPABILITY.md)

## 需求依据与验收

用户授权“执行下一步，做技术设计”，据此以现有 PRD（包括 npm 首发、Windows x64 和建议阈值）作为设计工作基线，不表示设计已批准或允许编码。PRD 保留历史待确认标记，需求与 AC 仍只在那里维护；逐阶段人工确认不变。用户现已明确确认：首版只返回 Markdown/JSON，不提供报告文件导出；据此收缩 PRD/设计并留在第 4 步复评。前轮导出研究与探针保留为历史，不再是实施前置；这不是证明导出技术问题已解决。未授权第 5 步或生产实现。

必须形成：发现不执行→冻结计划→宿主一次性审批→串行执行→真实状态及双报告。当前没有插件源码或已运行宿主；下述源码路径均为拟新增。前轮仅只读核查；后续隔离探针已按授权编写/运行（非生产代码），不安装、不检出、不启动宿主。memory recall(scene=design) 为空。

## 1. 方案概述

### 1.1 最小方案与模块

单个 TypeScript ESM 插件包，拟位于 `dsh-plus/plugins/dsh-project-check/`，与 mai 过程文档分离。复用 Cordis apply、工具注册、effect 生命周期及宿主 approval/fs/subprocess/sandboxPolicy/sandbox 服务。业务模块禁止直接 node:child_process、直接磁盘 I/O 或 shell 字符串兜底；node:crypto 仅用于 UUID/摘要。不新增报告专用 Service、原生文件后端、导出能力探测或为未来导出预留契约；仅使用现有宿主服务完成核心闭环。

四个工具：发现、预览、执行、取报告；不注册导出工具。不新增 UI、用户命令、数据库、后台队列、通用框架、远程适配或重试系统。前台调用遵守 exec.signal；最大 20×1800 秒能否被宿主承载须验证，不承诺无限等待。

依赖方向为 tools→coordinator→各业务模块，宿主 I/O 集中 host.ts，纯规则不导入 Cordis；不拆多个发布包。

| 拟新增文件（相对插件包） | 职责 |
|---|---|
| src/index.ts、tools.ts、host.ts | apply、schema、工具注册、会话/审批/fs/进程适配 |
| src/types.ts、limits.ts | 类型、报告 schema、PRD 限额 |
| src/project.ts、config.ts | 路径、元数据、手工配置、工具链 |
| src/plan.ts、coordinator.ts | 冻结、归属、消费、项目锁、串行调度 |
| src/git.ts、runner.ts | Git 状态、argv 执行、取消、真实终态 |
| src/redact.ts、report.ts | 脱敏、真实结论、会话内双格式报告 |
| tests/、fixtures/ | 单测、临时样例、Windows/宿主集成驱动 |
| package.json、tsconfig.json、README.md、cordis.patch.yml | 构建、独立打包与安装说明 |

### 1.2 关键决策与 Review

| 决策 | 推荐、成本与评审重点 |
|---|---|
| D-01 固定宿主源码 | 0.2.2-rc.3 + 精确 SHA，不追随 master；发布包可用性待验证 |
| D-02 argv 执行 | node.exe + npm-cli.js，不调用 npm.cmd/拼 shell；部署配置可信 CLI 绝对路径；npm 内部 shell 仍须 AC-11 实测 |
| D-03 显式审批 | execute 内对冻结计划请求 ctx.approval，只放行 allowed-once；不关闭外围策略，可能出现双重询问 |
| D-04 无原始 spill | pipe 有界采集后脱敏，不继承控制台；牺牲完整日志恢复，避免原始 spill 泄密 |
| D-05 内存缓存 | 每会话最近 5 份报告/10 分钟，最多 10 个预览/10 分钟；取消后可取证，淘汰和重启明确 unavailable |
| D-06 首版报告仅返回 | 用户已批准移除文件导出；不实现导出工具/暂存/发布/清理/原生制品，不保留 unavailable 占位工具。宿主自身会话存储及获准脚本副作用照常披露 |

维护成本集中于 host API、报告 schema、脱敏规则与 Windows 测试。升级宿主重跑审批/沙箱/取消/安装；脱敏修改重跑泄漏扫描。减法检查去掉跨进程锁、持久历史、实时 UI、DAG；跨实例并发不在 NFR-07 保证内。

## 2. 详细设计

### 2.1 结构与配置

Task={id,name,script,args:string[],timeoutSeconds}。id 非空唯一；script 必须为 scripts 自有键，禁止 NUL 和以 '-' 开始的名称以免 npm 选项歧义。未知字段拒绝，不能注入 command/env/cwd。

私有 Plan 包含随机 planId、owner 会话对象身份、规范项目 target、过期时间、文件摘要、工具链身份、有序任务、不可变 argv/cwd/timeout、digest。摘要使用固定字段规范 JSON，含完整 package/config 字节 SHA-256、包管理器声明/锁文件存在性、Node/npm 路径/版本。不声称锁定全部源码。读取前后 stat 版本变化重读一次，仍变化返回 PLAN_UNSTABLE。

PublicPlan 含 planId/digest、项目、任务、命令参数/目录/超时、风险/有效期；run 回传公共快照必须与缓存匹配，传入 argv 绝不成为执行依据。秘密字段脱敏，私有 argv 不进输出；脱敏后无法核对操作则阻断，要求移除参数秘密。用户必须知晓模型参数会在 execute 前被宿主记录，不要将秘密作为工具参数。

RunReport v1 覆盖 PRD §8.3，额外记录 approval.outcome、policy.mode/enforcement、原因码及完整性。规范 JSON/Markdown/缓存/日志均只含安全投影，不含原始配置、异常 cause 或秘密列表。未启动项时间/退出码/耗时为 null；已启动不得伪造终态。reason 与四类 status 分开。非法调用用稳定 HarnessError（import 待编译核对），检查失败返回领域报告。

项目手工文件 `.dsh-project-check.json`：version=1、tasks、可选 redactLiterals:string[]。未知版本/字段、空秘密字面值、非法类型拒绝。无配置只发现，不自动创建。默认/上限直接采用 PRD：120 秒、1～1800 秒、20 任务、64 KiB 合计输出、200 Git 路径、单文件 1 MiB、终止确认 5 秒。

可信插件部署配置 nodeExecutable/npmCliPath 绝对路径，模型/项目不可覆盖。Node 可经 fs.processPathFromHostPath(process.execPath) 映射，失败要求显式配置；npmCliPath 指向已安装 npm/bin/npm-cli.js，核对所属 package.json name/version，不从项目 node_modules 查找。固定 Node 24.18.0/npm 11.16.0，宿主内嵌 Node 不同须重新固定验证。显式非 npm 声明、pnpm/yarn 锁文件冲突、npm 版本不符阻断。缺依赖不自动安装。

### 2.2 接口与流程

| 工具 | 输入与输出 |
|---|---|
| project_check_discover | 可选 projectPath；默认仅会话 cwd，无 cwd 要求路径；返回发现报告 |
| project_check_preview | projectPath、taskIds；空选不执行，按配置顺序，返回 PublicPlan |
| project_check_run | PublicPlan；真实审批后执行，返回 RunReport/Markdown，无 approved 参数 |
| project_check_report | runId；仅同会话缓存，取消后可取部分证据，跨会话拒绝 |

工具根额外字段显式拒绝（defineTool 隐式根默认开放）；输出声明 ValueSchemaSpec，render 从同一安全 JSON 派生 Markdown，不仅脱敏展示。固定文案引用 PRD COPY-01～08，不另维护真源。

1. **发现**：经 ctx.fs 解析/校验普通目录及部署允许读取边界，以 readBytes 的 1 MiB 上限读取元数据，拒绝配置链接逃逸；不回传原始 scripts 正文。限定本地 Windows 同执行世界 provider，远程组合明确不支持。
2. **预览**：校验 taskIds，按配置顺序冻结计划，列未选项；不向祖先切换执行目录。发现/预览均不执行 npm 或生命周期脚本。
3. **审批**：按规范 targetKey 获取实例内项目锁，等待审批也占锁，重复请求 busy。校验 owner/有效期并单次消费 planId，拒绝后也不复用。request 使用真实 agent/callId/signal，reason 含安全计划/digest/argv/cwd/超时/生命周期风险；必须当前 turn 打开。异常或非 allowed-once 不启动；不把外围 pre-execute 放行当成本次计划批准。
4. **逐项复核**：批准后及每项启动前核对文件/锁标志/工具链和当前 sandbox policy；变化停止余下调度，余项 not_run/PLAN_CHANGED，已执行项保留结果。不能自动重新批准/重试，不声称原子锁定全部源码。
5. **启动**：固定 argv=[nodeExe,npmCli,'run-script',script,'--',...args]，cwd 为项目。sandboxPolicy.resolve({session}) 不传 mode 提权；受限模式经 sandbox.confine，返回 argv 原样交 subprocess.spawn，失败不原始 argv 回退。danger-full-access 仅在宿主已经选择时使用并披露。partial enforcement 必须呈现，部署要求 full 时拒绝 partial，不声称绝对隔离。
6. **采集**：stdin ignore、stdout/stderr pipe、无 inherit/spill，graceMs 显式指定；不从项目注入环境变量，使用宿主清理环境。每项独立 deadline，审批不计执行超时。普通非零退出后继续；整次取消/卸载停止调度。
7. **终止**：terminate 后最多等 5 秒确认 waitForExit 的 managed range 为空；不能确认则 unknown 并停止后续调度。根进程 close 不等于进程树结束。done reject 不证明没启动；仅明确启动前错误可 not_run，其他 unknown。正常码 0 但仍有后代时也不立即 passed，等至 deadline 终止并分类；已确认超时的本项 failed，确认结束后可继续其他项。
8. **取消证据**：遵守宿主 AbortError 传播契约，不把取消包装成成功工具结果。finally 将已脱敏部分报告缓存到会话，后续 report 可取；不发异步模型消息。卸载清理中止 controllers 并尽力确认退出，注册由 Cordis 注销；崩溃不承诺持久报告。
9. **结论**：selected 有 failed→failed；否则空集、有 not_run/unknown 或缺必要执行证据→inconclusive；否则 passed。未选项不覆盖，Git 缺失只标变更证据缺口；两格式由同一安全结果生成。

### 2.3 Git、脱敏与报告返回

**Git**：可信 resolveExecutable('git')，固定 argv 禁可选锁与 fsmonitor，读取 rev-parse/status --porcelain=v1 -z --untracked-files=all -- 。用项目 cwd，仓库根可在上层，但只保留目标子树；路径用 literal pathspec，不成为魔法表达式。解析 XY/重命名第二路径/NUL，不读正文或 diff、不改索引。固定元数据调用不属于项目脚本，但仍经沙箱；不可用降级。采集设 10 秒截止。流式解析并用有界 top-200 集合/计数，不存整个仓库列表；异常编码/超长单记录隐藏且标不完整，无法精确计数则 omittedCount=null，不编造。重命名跨子树需测试，前后差异不全部归因任务。

**日志**：两流独立 UTF-8 解码与跨 chunk 重组，合计原始保留上限 64 KiB，保留前缀；达限仍消费、丢弃后续。完整记录才脱敏；无换行超长记录/预算末尾半记录整段隐藏，防截断秘密泄露。先在未经换行/控制字符规范化的完整保留缓冲上标记用户字面值的全部匹配区间（含重叠匹配），覆盖跨 chunk/换行；可能构成字面值的预算边界尾段也标记隐藏。不得先删半记录或规范化再匹配原字面值；否则含 CRLF/控制字符的字面值会失配。隐藏区间不参与后续拼接形成新文本，不能让删除操作重新拼出秘密。完成字面值遮蔽、半记录隐藏后，再规范化控制字符并应用已知凭据规则及安全输出检查；不能确认安全则隐藏整字段。规则覆盖 password/token/secret 赋值、Authorization、URL userinfo 及用户敏感字面值，不保证恶意编码/未知秘密全检出。无法安全处理片段不输出。路径、命令、参数、错误也走安全投影；不 console.log 原始异常。Markdown 转义 HTML/表格/控制字符和围栏内容，不生成可执行链接，不执行日志指令；报告含 COPY-04/05。

**报告返回契约**：discover/run/report 返回安全 JSON，Markdown render 从同一对象派生。不接受报告目标目录、文件名、导出开关或写盘参数；不注册 project_check_export。报告只保存在有界会话内存缓存，不建立报告文件、暂存文件、持久历史或自动恢复逻辑。取报告必须校验会话归属和 TTL；过期/重启返回 unavailable，不重新执行任务。

**G-03 范围处置**：用户已明确移除首版报告文件导出，因此原导出竞态 R-01/G-03 不再适用于首版，不是技术修复或安全验收通过。前轮设计/探针保留为历史，不依赖、不继续研究。不得保留一个永远拒绝的导出工具冒充最小实现。

**仍需验证的边界**：元数据读取依宿主文件策略，执行仍经真实审批、当前 sandbox policy 与受限 subprocess；不绕过读取/执行拒绝。报告不落盘不等于脚本只读或 DSH 不保存会话，风险依 PRD BR-08/09/10 明示。产品验收需验证两格式一致、报告写盘调用不存在，以及真实宿主批准/拒绝/取消闭环。

### 2.4 供评审代码

见同目录 [CODE_DESIGN.md](CODE_DESIGN.md)：类型与不变量、一次性审批、调度及终态优先级、日志边界。所有片段为未编译设计示意，不是源码或测试证据；外围装配/完整 schema 留给实施，不用空函数隐藏核心分支。

## 3. 风险与实施前门槛

| 门槛 | 触发/影响 | 最小验证与处理 |
|---|---|---|
| G-01 发布与装配 | 源码版本不等于 npm 可用包；类型或 provider 不匹配会阻断加载 | 固定 SHA 对应包/制品，真实独立包加载及 tsc；失败回报，不偷换版本 |
| G-02 Windows 执行 | npm 转发可能二次 shell 解释；ACL 为 partial；Job/fallback 有范围限制 | 中文/空格/元字符、副作用标记、子进程取消、Job 支持实测；不扩大权限，不用 shell fallback |
| G-03 历史导出竞态 | 用户已批准移除首版文件导出，不再作为首版阻断 | 历史问题未技术解决；首版验证无导出工具/写盘接口，未来恢复功能须重新立项评审 |
| G-04 宿主审批与取消 | 审批 reason 是否完整显示、长调用/abort 是否丢弃返回结果尚未实测 | 真 UI 批准/拒绝/不可用；取消后 report 取证；缺模型配置则记录受阻 |
| G-05 输出与资源 | 截断或跨 chunk 可能泄密，Git/输出可无界增长 | 大流/半记录/跨 chunk 秘密扫描，原始日志不得 spill；失败时隐藏，不降规则 |

G-01/02/04/05 保留为后续最小验证义务，不标通过。实施获批后的首个切片只做独立加载、发现、真实批准/拒绝执行及报告返回；兼容/权限/取消关键能力不足则停止扩展并回报，不安装或绕过限制解决。G-03 已按范围变更移出首版，不再研究原生导出。当前仅在第 4 步收缩设计与自复评；第 5 步仍须用户另行授权，未创建测试计划、不开始产品编码。

## 4. 兼容性与证据

### 4.1 固定基线

- 官方仓库：https://github.com/deepseek-ai/deepseek-harness
- 本轮 API 查询 master 得到 SHA：`39163dd30f703a79079e2d2446545cff3c453738`。
- 该 SHA 根 package.json：0.2.2-rc.3，Node >=24.9.0；tools 包同版，Cordis 4.1.0。
- 本机实际命令：Node v24.18.0、npm 11.16.0。尚无 DSH 运行证据。
- 拟精确 peer：@deepseek-ai/cordis=4.1.0，@deepseek-ai/dsh-tools、dsh-user-approval、dsh-fs、dsh-subprocess、dsh-sandbox、dsh-sandbox-policy 采用同 SHA 对应精确版本；未逐个读取 package.json 的版本标记为待核对，不假装已锁定。仅 type 导入使用直接类型包，不捆绑另一份宿主服务；编译器用 strict TypeScript，精确开发依赖及 lockfile 在实施前装配切片核实。

| 组合 | 当前结论 |
|---|---|
| Windows x64 + 上述 SHA/Node/npm | 首验目标，源码/文档支持方向，运行兼容未验证 |
| 其他 DSH 版本、macOS/Linux | 未验证，不声称支持 |
| pnpm/yarn 项目执行、远端 provider | 不支持；发现可提示 |
| 报告 JSON v1 | 新协议，无旧报告迁移；未知版本拒绝解析 |

独立包导出 apply/name/inject，编译产物 dist；npm pack 仅打包 dist/说明，不发布仓库或秘密。通过宿主 --patch 贡献绝对模块路径（教程确认）；从压缩包装到独立目录后加载，不改核心。卸载 overlay 后工具贡献消失，运行任务清理；首次真实安装命令由制品形态确认，不捏造未经核对的 CLI。宿主构建用 pnpm 不表示插件能执行 pnpm 项目脚本，两者范围不同。

### 4.2 已读远端依据

以下均为同一固定 SHA 下的相对路径，可在官方仓库 blob/<SHA>/<path> 复核；通过只读 HTTP 获取，没有将官方源码复制进项目。

| 路径 | 已核实内容 |
|---|---|
| package.json、vendor/cordis/package.json、packages/core/tools/package.json | 版本、Node 下限、导出及 peer 形态 |
| docs/user/develop/basic/tool.zh.md、index.zh.md | defineTool/apply/inject、绝对路径 patch、effect 清理 |
| docs/cookbook/adding-a-tool.zh.md | exec.signal/agent/token、规范 JSON、abort 传播、纯渲染 |
| docs/subsystems/approval.zh.md、packages/interaction/user-approval/src/types.ts | request 字段、allowed-once、open turn、失败拒绝 |
| docs/subsystems/sandbox.zh.md、packages/shell/pwsh-sandbox/src/index.ts | resolve/confine、受限策略、partial、无隔离回退禁止 |
| docs/subsystems/subprocess.zh.md、packages/subprocess/subprocess/src/index.ts | argv、不经 shell、pipe、terminate/waitForExit、done 失败不证明未启动 |
| packages/subprocess/subprocess-local/README.zh.md | Windows Job/fallback、breakaway、范围可观察性限制 |
| docs/subsystems/filesystem.zh.md、packages/fs/fs-sandbox/src/index.ts | readBytes/contains/createIfAbsent、fs 意图事件、残余 TOCTOU |
| 路线 A 补证：docs/user/develop/framework/service.zh.md、basic/index.zh.md；Microsoft Windows API 文档 | 独立 Service/patch 扩展接入与候选句柄原语；具体来源和证据限制见能力附录 §2，不是运行证据 |
| 第 4 步复核：packages/fs/fs/src/index.ts、packages/fs/fs-local/src/index.ts、packages/fs/fs-local/src/fsio.ts | 公开路径型接口无受约束目录句柄契约；writeFileAtomic:605～687 的路径型暂存、硬链接 no-replace 发布与清理；非运行证据 |

一次 GitHub recursive tree 请求超时，早期猜测的 core/fs、core/subprocess 路径返回 404；随后用子系统文档定位并读到正确源码，不把失败请求当核实证据。所有证据仅证明接口/源码事实，不证明本插件运行、安全或验收通过。

## 5. 依赖有序实施任务（计划，未执行）

| 任务 | 拟新增/修改文件 | 依赖 | 交付与验收映射 |
|---|---|---|---|
| T-01 门槛验证与最小装配 | package.json、tsconfig、index/tools/host、README、patch；阶段实施记录 | 第 4 步收缩版复评认可、第 5 步测试计划获批；G-03 按用户批准移出首版 | 固定制品和直接依赖；独立加载、真实审批/拒绝、signal、受限 spawn；AC-04/11/12；失败不得扩展实现 |
| T-02 模型与发现 | types/limits/project/config、对应 tests | T-01 | 单文件上限、无脚本副作用、非法配置与 npm 冲突；AC-01/02 |
| T-03 Git 摘要 | git、临时 Git fixtures/tests | T-01/02 | staged/unstaged/untracked/rename、子树/缺 Git/截断；AC-03 |
| T-04 冻结与审批调度 | plan/coordinator、并发及审批 tests | T-02 | owner、过期、单次消费、变更阻断、busy；AC-04/13 |
| T-05 执行与终止 | runner/host、Windows 子进程 tests | T-01/04 | 串行/非零继续、timeout/cancel/unknown、不重试；AC-05/06/07/11 |
| T-06 安全输出与报告 | redact/report、泄漏扫描/状态表 tests | T-02/05 | 64 KiB、跨分片/CRLF/控制字符字面值及重叠匹配、转义、双格式一致、无报告写盘/导出入口、真实结论、取消取证；AC-08/09/10 |
| T-07（已移除，保留编号） | 原文件导出任务不属于首版，无占位实现 | 用户批准范围变更 | 不实施；无导出工具/报告写盘的验证归 T-06（AC-10） |
| T-08 打包与文档 | README、package/patch、宿主验证驱动 | T-03～06（不依赖已移除 T-07） | npm pack 安装、发现/批准/拒绝/卸载、禁止行为扫描；AC-12/13 |

第 6 步仅执行经批准任务；第 7 步另作代码评审修复，第 8 步在真实 Windows DSH 逐条验收并归档版本/命令/报告/拒绝无副作用证据。mock 或 import 成功不能替代宿主闭环。当前只完成设计材料，Phase 仍为 draft，ROADMAP 不前移。

## 6. 编码优先接续（当前有效任务顺序补充）

来源：用户在第 6 步明确要求“继续，先把编码完成”。主编排者据此使用本作用域 my-create-design 做依赖顺序同步，再由 my-implement-code 实施。本节仅调整编码/验证的先后，不修改 PRD、审批语义、安全边界、通过标准或 Phase；上文第 4 步未授权状态保留为历史。实际代码根按既有第 6 步明确授权为 dsh-plus/mai/。

- T-02～06 的源码、纯规则、故障注入及本地开发集成可先补齐，不以 T-01 的真实 UI、npm 转发/后代终止证据缺失作为全部编码暂停理由；T-01/G-01/02/04/05 仍为发布/验收前必过项，未通过不得宣称产品可用或验收通过。没有授权扩大当前权限、安装或绕过沙箱。
- 运行时仍逐次真实审批、当前策略及 confinement；不可用就零启动拒绝。开发测试中的协议注入不等于宿主批准。四工具有实际实现；仅 tools/fs 装配时可独立发现，运行相关服务由生命周期子注入装配，完整部署需现有 approval/subprocess/sandboxPolicy/sandbox 服务。
- 沿用 CODE_DESIGN A～E 的冻结/消费/锁/终态/缓存不变量。宿主适配可拆 host-runtime.ts，纯类型归 types.ts；这不是新 Service 或发布包。工具 schema 可用现有 ToolDefinition 的原生 JSON Schema 完整声明，保持根/嵌套未知字段拒绝和同源安全 render。
- 输出先用更保守的整字段遮蔽替代精细区间替换：完整保留字段中任一字面值/凭据命中即整字段隐藏；截断、非法编码、控制字符或不完整流同样隐藏整个字段。不会删除片段重拼，不改变先匹配再规范化顺序；牺牲可见日志但不降低秘密保护。若未来改为区间保留，须重跑 AC-09。
- Node 身份先限定已映射的当前固定 Node 二进制；其他二进制/远程世界未获版本证据则拒绝。npm 采用可信部署绝对路径，核对固定包版本、完整 CLI/package 摘要和文件版本；不从项目 PATH/node_modules 自动寻找或安装。
- 核心代表逻辑仍为：consumeMatching → tryAcquire → realApproval(allowed-once only) → 每项重新 snapshot/policy → runTask → finally safeReportCache；拒绝也消费，取消仍传播，unknown 停止后续。Git 只读元数据固定命令经同策略执行，不归项目脚本审批，不读正文或变更索引；不可用只产生 Git 证据缺口。

本次依赖重排无需变更任何业务用例预期；沿用 TEST_PLAN TC-01～10。真实 UI、Windows npm/后代、装包运行与最大调用时长仍待验；本节同步不是设计评审或执行验收通过。

