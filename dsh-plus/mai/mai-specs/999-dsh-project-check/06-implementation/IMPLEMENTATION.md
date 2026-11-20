# 第 6 步实施记录：最小宿主集成切片

> 最新续执行：用户要求继续完成编码阶段。本轮补齐真实 Git 集成、修复管道尾部/异常关闭竞态、增加固定恢复建议及后续调度阻断回归。`npm test` 为 **140 项 / 139 通过 / 0 失败 / 1 受阻跳过**。核心源码与当前可执行开发验证已收尾；G-02/T-01、真实 UI 和独立装包仍未闭环，不能将第 6 步整体或业务 AC 标通过。详见末节；前轮保留为历史。

[返回 BRIEF](../BRIEF.md) · [技术设计](../03-design/TECH_DESIGN.md) · [测试计划](../05-test-plan/TEST_PLAN.md)

## 授权及目录

用户确认：“确认测试计划及上述首版基线，进入第 6 步编码，先做最小宿主集成切片；需要安装时另行确认。文档按设定放置目录，代码放到/dsh-plus/mai目录下。”

- 本次仅实施 T-01 最小集成切片，不自动跨入全面实现、代码评审或实际验收。
- 代码包根目录按用户最新指示采用仓库 `dsh-plus/mai/`，未来源码为该目录下 `src/`，测试为 `tests/`，包配置在该目录；不使用技术设计历史拟定的 `dsh-plus/plugins/dsh-project-check/`，也不解释成磁盘卷根目录。
- 过程文档保持 Feature 阶段目录；本文仅记录实施，不把源码放进 `06-implementation/`。
- 测试计划及上一轮列明的 npm 首发、Windows x64 和数值基线已获用户确认；不修改 AC 内容，不再把这些细则当作等待产品选择的阻断。前序文档中的“待确认/未授权编码”为历史阶段状态，后续同步由相应规格维护阶段处理。
- 安装原需单独授权，用户随后明确回复“允许项目内局部安装固定版本依赖，继续最小集成切片”。不提权、修改宿主核心、读取 API Key 或关闭审批/沙箱。memory recall(scene=implement) 返回空。

## 切片顺序及状态

| 工作 | 对应需求 | 当前状态 |
|---|---|---|
| 核查环境、固定制品及服务版本 | T-01 / AC-12 | 只读预检已执行；安装制品与源码 SHA 对应关系待核验 |
| 项目内依赖装配及真实类型编译 | T-01 / AC-12 | 已获局部安装授权，已安装并锁定依赖；strict TypeScript 编译通过（skipLibCheck=false） |
| 独立加载及发现 | AC-01/12，TC-01/02 | 已实现初始只读发现，并在真实 Cordis/Tools/fs provider 中装卸及直接调用；尚非完整发现契约或真实 DSH 模型/UI 调用 |
| 真实批准/拒绝、受限执行、取消 | AC-04/06/11/12 | 未执行；可能还需已有可用宿主模型配置，不读取凭据 |
| 同会话双报告/拒绝无副作用 | AC-10/12 | 未执行 |

上述受阻不等于接口失败或目标版本不兼容；不进入 T-02～08 扩展实现，不生成永远拒绝的工具占位，不以 Mock 替代宿主证据。

## 安装前实际只读预检（历史）

执行目录：仓库根 `E:/AI编程课程/aicoding`。通过终端查询，无安装命令、无 npx 隐式下载、未启动 DSH。

| 检查 | 实际观察 | 结论边界 |
|---|---|---|
| `node --version` / `npm --version` | v24.18.0 / 11.16.0 | 版本与设计目标一致，不证明宿主内嵌运行时 |
| `Get-Command dsh,tsc -ErrorAction SilentlyContinue` | 未返回命令 | 当前 PATH 不可用；不推断机器其他目录一定未安装 |
| 工作目录/全局 npm 模块列表 | 工作区无插件包或 node_modules；全局列出 @easyuseai/@fission-ai/@openai | 未发现本切片可直接复用的 DSH/TypeScript 装配 |
| 固定 SHA 的官方根 package.json（只读 HTTP） | name=@deepseek-ai/dsh-root，private=true，version=0.2.2-rc.3，Node>=24.9.0 | 源码版本事实，不把私有根包当可安装 CLI 包 |
| registry `npm view` | 下表各精确版本存在 | 元数据查询成功不等于已下载安装或装配成功 |

registry 使用 `https://registry.npmjs.org/`，查询形式为 `npm view <包>@<精确版本> name version --json`；另对 dsh/tools 查询 dist.integrity 和 gitHead，未返回 gitHead，不声称已证明与固定源码 SHA 完全对应。

| 包 | 已查询版本 |
|---|---|
| @deepseek-ai/dsh | 0.2.2-rc.3 |
| @deepseek-ai/cordis | 4.1.0 |
| @deepseek-ai/dsh-tools | 0.2.2-rc.3 |
| @deepseek-ai/dsh-user-approval | 0.2.2-rc.3 |
| @deepseek-ai/dsh-fs | 0.2.2-rc.3 |
| @deepseek-ai/dsh-subprocess | 0.2.2-rc.3 |
| @deepseek-ai/dsh-sandbox | 0.2.2-rc.3 |
| @deepseek-ai/dsh-sandbox-policy | 0.2.2-rc.3 |
| typescript | 6.0.3 |

另查询了 @types/node@24 的版本列表，尚未写入依赖选择或锁文件；只安装实际编译所需的精确版本，不自动采用浮动范围。

registry 返回的 integrity：
- dsh：`sha512-S+4oUYVKWuc1SCMMp1mpUa2llxVy0o9gIgp7TDg/Ea7PuvXVkAfnykqSH1/oDXVB+y5VzEm0QIJulo1LIB3qRg==`
- dsh-tools：`sha512-6IGKOJzAl41jyUB+TCNBmtb2NfAryhTfsXH17rQPukWQteluyvZRNjwJsPnTRYJE27s6TeojZReT5MJxi7iIyA==`

## 安装授权请求与恢复点

请求允许在 `dsh-plus/mai/` 内局部安装上述固定宿主/直接依赖及必要的精确 TypeScript/Node 类型开发依赖，生成 package.json、package-lock.json 和 node_modules；不全局安装，不升级既有工具，不初始化/同步 my-ai-infra，不配置或读取模型密钥。

获准后先核实 CLI 包依赖/安装脚本和制品，再按最小必要范围安装、核验类型与 provider。若存在需额外授权的安装脚本、原生构建或系统配置操作，先回报；不能通过跳过必要安装步骤后伪称完整宿主可用。已有可用宿主也可由用户提供路径替代安装。

以上为安装前暂停记录，保留作历史；最新执行结果如下。

## 局部安装后的执行记录

### 文件与实际范围

代码位于仓库 `dsh-plus/mai/`：

- `package.json` / `package-lock.json`：固定直接 peer/dev 版本，锁定解析图；包仍 private，禁止误发布；exports 指向 dist/index.js，files 白名单仅 dist/README（npm 仍自动包含 package.json）。
- `tsconfig.json`：NodeNext ESM、strict、noUncheckedIndexedAccess、exactOptionalPropertyTypes、skipLibCheck=false。
- `src/limits.ts`：已批准基线常量。
- `src/host.ts`：ctx.fs 只读适配；部署可信根范围校验、普通目录/文件、1 MiB 上限、文件版本复核与一次重读、fatal UTF-8/JSON、固定错误码及取消传播。未承诺消除宿主读取 TOCTOU。
- `src/index.ts`：真实 apply/name/inject、project_check_discover 注册；只展示固定标准候选名，不输出任意 scripts 正文、配置内容、路径或异常；缺 session cwd 要求绝对路径，根拒绝额外字段；JSON/Markdown 来自同一结果。
- `tests/host.test.mjs`、`tests/plugin.test.mjs`、`tests/runtime-gate.test.mjs`：真实本地 provider/注册表开发测试，无 provider internals 替换，不以模拟批准当真实 UI。
- `README.md`：明确初始增量限制、命令和未实现项。
- `.gitignore`：仅在本项目补 node_modules/dist/tgz 忽略，保留既有 my-ai-infra 规则和仓库根用户修改。

发现工具是可运行的初始增量，不是完整 FR-01/02/07：目前不含任意候选/配置任务校验、项目路径回显、Git、包管理器冲突、预览、run/report/cache。只注册一个实际可用工具，不注册永远拒绝的执行/导出占位。本次未进入 T-02～08 的全面展开。

### 命令及结果

以下除安装前查询外均在 `dsh-plus/mai/` 执行：

| 命令/检查 | 实际结果 |
|---|---|
| `npm install --ignore-scripts --no-audit --no-fund --registry=https://registry.npmjs.org/` | 首次遇 ECONNRESET/EPERM cleanup 警告并超时；未提权或改 registry。有限重试增加 fetch-retries=1/fetch-timeout=45000，工具仍报告超时，但 npm 返回 added 671 packages in 4m；随后以 npm ls/锁文件/编译独立确认安装结果，不把超时当成功依据 |
| 后续补齐显式测试 provider devDependencies 后同样 install | up to date in 4s；未执行生命周期脚本 |
| `npm ls --depth=0` | 全部直接固定版本解析正常；DSH=0.2.2-rc.3、Cordis=4.1.0、TypeScript=6.0.3、@types/node=24.13.5；直接测试 provider 固定同一 DSH 版本 |
| `node node_modules/@deepseek-ai/dsh/lib/bin.js --version` | 0.2.2-rc.3 |
| CLI `--help`、`headless --help` | 正常；headless 帮助使用自有临时 DSH_HOME 并清理；没有模型请求或启动长期服务器，不推断可交互审批能力 |
| `npm run build` | 最终通过。早期 FsInfo 字段误用 kind、输出字面量推断问题已修正，未放宽 strict 或跳过库类型检查 |
| `npm test`（含 pretest build） | **8 passed / 0 failed / 0 skipped**，最终运行约 1 秒；6 个 fs/取消用例、1 个注册发现/卸载用例、1 个真实受限进程门槛 |
| `npm pack --dry-run --json --ignore-scripts` | 白名单 8 个文件（README、package.json、dist 内 6 个文件），无 node_modules/过程文档/fixtures；仅 dry-run，不是装包运行证据 |
| `git check-ignore node_modules dist` | 两目录均忽略；未提交/推送/发布 |

最早测试夹具错误使用 Cordis 旧式 ctx.start/stop，导致 6 项失败，修订为 await ctx.plugin/fiber.dispose 后复验通过。最早失败发生在清理钩子注册前，可能留下 6 个本次空 mkdtemp 目录（系统临时目录 dsh-check-*）；未按通配符删除不确定归属目录，不宣称全轮临时文件已清零。现夹具先注册清理，最终测试样例正常清理。

安装脚本检查发现 subprocess-local POSIX helper chmod、koffi、node-pty、protobufjs 等依赖脚本；保持禁用。未运行 native rebuild/额外安装，未全局安装。CLI help/import 成功不代表 PTY/全部可选能力已可用。实际 Windows pipe-mode 沙箱路径已单独验证可用，不据此推论全部宿主能力。

### 门槛结果与证据边界

- **G-01 部分证实**：目标 npm 制品可装配、真实类型可编译、Cordis 插件/Tools/fs 可加载调用卸载。包版本一致不等于固定源码 SHA 的制品对应关系已证实，尚待核验；独立打包安装及真实 DSH UI 仍待验。
- **G-02 仅基础机制证实**：真实 LocalSandbox(read-only) → LocalSubprocess(pipe) 执行固定 Node --version，出口版本与预期一致，退出码 0、waitForExit=true。enforcement=**partial**。没有测试项目 npm 参数转发、后代树、timeout/cancel；不将 partial 称 full。探针不授 workspace-write、不修改工作区 ACL、不回退直接执行。
- **G-04 未执行真实 UI**：现有授权未提供可用交互宿主配置/审批参与方式；本轮不探查个人 DSH_HOME、API Key 或发起模型请求。headless help 只展示 ask/never 选项，不证明有交互答复器。需要用户确认可用交互配置/自行配置凭据和参与批准/拒绝，不要求在聊天中提供密钥。
- **G-05 尚未完成**：当前发现输出只含固定候选/固定提示，测试未发现合成 script 字符串泄漏；这不是任务日志脱敏算法或完整泄漏扫描通过。

T-01 **部分完成、未闭环**。审批执行、预览冻结及会话双报告尚未实现，不能把尚未实现全部归因于环境。由于真实审批参与方式尚未安排，暂不扩展完整调度/报告系统。下一轮先确定交互验证环境，在第 6 步内继续剩余最小链路；无需重复编码授权，不自动进入代码评审/实际验收。全部业务 AC 保持待验，Phase/ROADMAP 不前移。

## 本轮续执行：G-02 参数及取消边界

用户根据 BRIEF 要求继续第 6 步。本轮复核既有依赖可用，Node v24.18.0/npm 11.16.0 未变；没有重新安装、读取凭据、启动模型请求或交互服务器。遵守 T-01 未闭环不展开 T-02～08 的门槛。

新增 `tests/runtime-boundaries.test.mjs`，使用真实 LocalSandbox(read-only)/LocalSubprocess(pipe)，只执行固定合成 Node 代码，不执行项目脚本或 npm：

| 验证 | 实测结果及边界 |
|---|---|
| 中文/空格/特殊字符/空参数/选项形状参数 | direct Node argv 完整保留；不推论 npm 内部 shell 转发安全 |
| stdout/stderr 与非零码 | 两路固定文本正确，exitCode=7，托管范围确认结束 |
| 根进程取消 | 收到 root-ready 后 AbortController.abort，waitForExit 在 5 秒界限内确认 true；不是业务 timeout 调度或后代终止证明 |
| 后代取消 | **受阻**：父 Node 创建固定子 Node 时同步 `spawn EPERM`，未收到 child-ready，故未抵达取消断言。不得标通过，不证明所有沙箱组合均失败，也不推定根因 |

执行命令：在 `dsh-plus/mai/` 运行 `npm test`（含 strict build），最终 **12 tests / 11 pass / 0 fail / 1 skipped**，约 2 秒。enforcement 全部仍为 **partial**。本轮先前测试失败保留事实：初始夹具使用 require/嵌套转义不适合 eval ESM，修订为动态 import 与 JSON 编码；修订后定位明确 EPERM。仅固定探针明确退出码 77 + 固定错误标记同时匹配时将后代用例登记为 blocked/skipped，其他失败不跳过。测试退出码 0 不等于门槛通过。

清理在 handle 创建后立即登记，最终所有实例执行 terminate + waitForExit，provider dispose 正常；未扩大权限、修改宿主、调整沙箱或非受限重试。README 同步披露受阻结果。生产插件仍只注册发现工具，没有新增虚假 run/report 占位。

**当前暂停点**：G-02 后代创建/终止能力出现具体阻断，G-04 交互审批仍待安排。依技术设计遇关键能力不足应停止扩展。本轮不以审批环境解释全部未实现功能，也不进入第 7/8 步。恢复需先安排用户已配置的目标版本交互宿主（不提供密钥文本），在其现有审批/沙箱策略下验证；若需要修改可信部署配置、安装/重建或系统权限，须另行确认，不自动尝试。下一轮优先查明当前受限模式的后代创建能力及可用审批答复器，再继续 T-01 最小链路。

## 最新续编码：配置模型与只读发现增量

用户在明确第 6 步尚未完成后要求“继续编码吧”。本次继续可独立验证的配置模型/只读发现代码，不将该指示解释为绕过宿主门槛、启用受阻执行或授权安装/提权。前述暂停执行与不全面展开调度的限制仍有效；纯模型实现进度不代表 T-01 关闭，亦不把 T-02 全量标完成。

### 本轮实际改动

- 新增 `src/config.ts`：v1 严格配置解析；未知字段拒绝；任务 ID 非空唯一、name 必填、script 为自有键且非选项/NUL、args 必须为无 NUL 字符串数组；默认 120 秒，整数 1～1800 秒，最多 20 任务；可选敏感字面值必须为非空字符串数组。显式 null 超时拒绝，不作为默认值。复制并递归冻结任务相关数组/对象，避免输入对象事后变异影响结果。
- `packageScripts` 使用无原型字典并仅接收自有字符串脚本，不泄漏脚本正文；无 scripts 返回空候选集，非法 scripts 类型拒绝。支持合法 `__proto__` 自有脚本键，不将原型链键作为脚本。
- 包管理器声明检查：仅 npm@11.16.0（可带受支持格式完整性后缀）不产生声明阻断；非法声明、其他包管理器或 npm 版本不符分别返回固定原因。不执行 npm，不据此声称已验证可信工具链身份。
- `src/host.ts` 新增固定锁名 lstat 检测：pnpm/yarn/bun 锁项存在即冲突，目录/链接也不静默忽略；不读取内容、不跟随其目标；继续部署边界与取消检查。
- `src/index.ts` 接入配置有效性、配置任务计数、总候选计数、固定错误码/字段/任务索引及工具链阻断数组，两格式来自同一对象。非法配置不输出部分任务；未知字段名与无效值不回传。标准候选名之外的脚本/任务标签、参数、路径仍不回显，等待安全投影，故完整 FR-01/02 尚未完成。
- `tests/config.test.mjs` 新增 33 个纯规则用例；`tests/host.test.mjs` 增加真实锁项/边界/取消用例；`tests/plugin.test.mjs` 增加真实注册工具调用的有效配置、未知字段、合成秘密不外泄、锁冲突及项目文件前后对照子用例。README 补充配置示例及增量限制。

### 实际命令与结论

在 `dsh-plus/mai/` 执行：

| 命令 | 结果 |
|---|---|
| `npm test`（含 strict build） | **48 tests / 47 pass / 0 fail / 1 skipped**，约 2.8 秒；后代创建 EPERM 仍明确受阻，不是全部门槛通过 |
| `npm pack --dry-run --json --ignore-scripts` | 10 个白名单文件（README/package.json/dist），新增 config 的 js/d.ts；无 tests/过程文档/node_modules；未生成或安装 tgz，不是独立安装验证 |

未新增依赖、未执行安装脚本、未读凭据、未发模型请求、未关闭审批/沙箱、未运行项目脚本、未提交/推送/发布。生产插件仍仅注册实际可用的 discover，不注册占位执行/导出工具。

**恢复点**：本次完成配置模型及发现摘要增量，不是第 6 步完成。下一编码部分为安全输出投影与完整发现契约，随后才可安全接入冻结预览。Git/冻结审批/项目执行/运行双报告及缓存仍未实现；真实 UI、后代创建/终止和 npm 生命周期仍待验证。执行门槛不因纯规则测试增加而通过，代码评审与实际验收仍须另行授权。

## my-implement-code 接续：发现工具安全投影

### 调用与上下文

用户明确要求“使用my-implement-code 指令开发”。本轮读取并遵循实际安装入口 `.agents/skills/my-implement-code/SKILL.md`，不是通过另一套 speckit 工作流替代。此前直接编码的增量保留，**不追溯声称此前已使用该 Skill**。

- 作用域资源：同作用域 stage-contracts、FEATURE_PROFILES（standard 合法）、个人记忆 sdd-integration；项目 FEATURE_LAYOUT 登记的路径有效，标准模板文件存在。本次增量维护现有实施记录，不新建或重渲染前序产物。
- 输入：项目 README/空 AGENTS 规则、BRIEF/context 索引、PRD 的 FR/AC、TECH_DESIGN/CODE_DESIGN、design_review 及有效 scope_recheck、TEST_PLAN；已有源码、测试和 package scripts 共同构成实现基线。PRD 历史待确认标记按既有第 6 步授权解释，不改前序规格。
- `memory recall --project E:/AI编程课程/aicoding/dsh-plus/mai --scene implement` 实际返回空、bound=false；不初始化/绑定个人库。本次方法纠正直接落实在本 Feature，不自动保存为跨项目长期偏好。
- 核实中断：`src/project.ts` 不存在；`src/redact.ts` 存在但此前未接入、未验证。本轮重新读取并接入/测试，不把取消调用算作成功。
- 门槛：TECH_DESIGN §3/§5 的 T-01 失败不得扩展执行链要求仍有效。本轮只补既有 discover 的安全展示与数据投影，未启用执行、引入调度或将 T-02/06 标完成；更大范围扩展前须解决门槛，若需改变依赖顺序应由设计能力同步，实施不自行改规格。

### 依赖顺序与实际任务

| 本轮任务 | 实际文件 | 对应 AC/测试 | 状态 |
|---|---|---|---|
| 完整元数据字段安全投影 | src/redact.ts、tests/redact.test.mjs | AC-09/11 元数据部分，TC-07 的子集 | 已实现及开发验证；不是流式任务日志脱敏 |
| 安全发现领域结果与唯一运行标识 | src/project.ts、tests/project.test.mjs | AC-01/02；AC-08/10 的发现结果部分 | 已实现及开发验证；Git/运行报告缺口明示 |
| 注册工具/schema/Markdown 调用链接入 | src/index.ts、tests/plugin.test.mjs | AC-01/02/10 当前切片 | 真实 Cordis/fs/Tools 调用通过；真实 DSH UI 未验 |
| 构建、全量测试、pack 预检、说明 | README、本文 | TC-01/02/07/08 相关子集 | 已执行，整体 T-01/第 6 步不结项 |

### 实现细节与边界

- MetadataProjection 对完整原字段先检查用户字面值（含重叠/CRLF/控制字符），不返回截断前缀；命中则整字段隐藏。凭据形状、URL userinfo、控制字符/双向控制及孤立代理项同样整字段隐藏；支持正常中文/emoji。没有删除片段后重拼文本。
- 防御性展示限额：单字段最多 4 KiB、每次发现合计安全动态文本最多 64 KiB；不包括 JSON 结构或 Markdown entity 扩展。超出整字段隐藏并计数，不声称整个序列化报告仅 64 KiB。候选排序显示前 200 项，省略数量准确；这是显示保护，不变更已批准任务数/执行语义。合法字段也可能被保守规则隐藏。
- project.ts 输出规范路径/名称、任意候选名、配置任务 ID/name/script/参数数量/timeout/redacted、reportVersion=1、随机 runId、discoveredAt、遗漏/隐藏计数。发现始终 inconclusive，明确 CHECKS_NOT_RUN/GIT_NOT_IMPLEMENTED/TOOLCHAIN_IDENTITY_NOT_VERIFIED。脚本正文/实参值/秘密规则不回传。
- 配置无效时，不能可靠采纳其敏感字面值，故隐藏所有动态元数据，不静默忽略规则后返回原文；不输出部分配置任务。稳定错误字段及计数仍可用。
- Markdown 仅从安全 JSON 对象生成，动态内容 numeric entity 转义，覆盖 HTML/链接标记/围栏/表格/控制字符；含 COPY-04/05。测试覆盖源码和单次 entity 解码一致性，**未证明真实 DSH UI 的 renderer 行为**。
- 工具根参数及无导出工具不变；生产源码无新增直接磁盘/子进程后备或原始 console 输出。读取仍经原 ctx.fs 适配。未将元数据整字段策略冒称已经实现设计中的跨分片日志区间合并算法。

### 验证实录

执行 cwd=`dsh-plus/mai/`，Node v24.18.0、npm 11.16.0，未新增依赖。

| 检查 | 实际结果 |
|---|---|
| `npm test`（pretest strict tsc） | 最终 **75 tests / 74 pass / 0 fail / 1 skipped**，约 2.5 秒；EPERM 后代用例仍受阻 |
| `npm pack --dry-run --json --ignore-scripts` | 14 白名单文件；仅 README/package.json/dist，新增 project/redact 的 js/d.ts；未生成/安装 tgz，不是独立安装证据 |
| src 定向静态检查 | 无 node:child_process/node:fs、console、TODO/FIXME 或写文件调用命中；只支持源码检查结论，不代替行为验收 |
| `git diff --check` | 退出码 0，既有 .gitignore 有 LF→CRLF 警告；项目仍为未跟踪文件，故不能据此声称检查覆盖了全部新源码。strict 构建及测试另有证据 |

本轮首次编译发现 UUID/template literal、reportVersion 常量和 schema 阻断枚举类型不一致，已修正，未放宽 strict。首次实际测试有两项一致性断言失败：错误地比较未解码的 entity 文本、预期遗漏 # 的转义；修正为实际展示文本/完整 entity 预期，保护规则未降低。并简化 URL userinfo 匹配，避免在长非 URL 字段重复扫描 scheme 前缀。最终复验通过。测试临时夹具按既有清理钩子释放；未读取密钥、调用模型、运行项目脚本、安装/重建、提权、修改沙箱、提交/推送/发布。

### Skill 自检与交接

- [x] 本轮发现投影模块及实际工具调用链已接入，相关测试与 README 齐全。
- [x] 保留既有用户文件和授权边界；没有导出/执行占位工具、原始异常或调试输出。
- [x] 构建/测试/pack 证据真实登记；受阻与未验未用降低标准关闭。
- [ ] Feature 全部需求/设计/集成完成：**否**。Git、可信工具链、冻结预览、真实批准/拒绝执行、任务日志捕获/脱敏、运行报告/缓存未实现或未验证。
- [ ] 真实宿主与业务结果验收：**未完成**。G-02 后代创建 EPERM、npm 转发/生命周期及 G-04 UI 仍缺证据；当前开发测试不能替代。

**交接**：本轮仅第 6 步的部分实施完成，不进入 my-review-code 或实际验收，不推进 BRIEF Phase/ROADMAP。后续优先解决 T-01 的宿主/执行门槛；如需先扩展冻结预览等后续模块，由主编排者安排设计能力确认依赖顺序，不能由实施悄悄改写。真实 UI 安全呈现也保留为 TC-07 待验，不另造重复测试计划。

## 上下文中断恢复：运行报告契约与策略回归

### 基线恢复与授权解释

本轮用户要求根据 BRIEF 继续第 6 步。实际磁盘已有 host-runtime、plan、coordinator、runner、git、report、schemas、tools、types 及相应 workflow/safety/runner/runtime-plugin 测试，但本实施记录仍停在 75 项发现切片。TECH_DESIGN §6 已登记用户“先把编码完成”的依赖重排，允许 T-02～06 源码及开发测试先行，不等于关闭真实宿主门槛。本轮沿用该补充，不重新改设计、不追溯声称这些已有模块全由本轮新增，也不声称已调用历史记录中的 Skill。

首次实际 `npm test` 在 strict 编译时失败：RunReport 已要求 notices，但 coordinator 尚未初始化。该失败是实际中断点，不是环境阻断。

### 本轮实际修改

- coordinator.ts 初始化 notices，在 finally 依据已选择任务的实际 enforcement 生成去重的 `SANDBOX_ENFORCEMENT_PARTIAL` / `SANDBOX_NOT_ENFORCED`；尚未启动、尚未解析策略的任务不冒称 partial/full。即使启动结果不明，已获得的 none 信息也不因空 startedAt 而被隐藏。
- schemas.ts 与 report.ts 同步 notices 的必填数组及 Markdown 展示，缓存沿用同一安全报告。执行结果与隔离能力分别呈现，不把 partial 当 full，也不把所有检查通过等同业务验收。
- workflow.test.mjs 新增 partial/none/full 三组 JSON/schema/Markdown/cache 一致性及告警去重测试；批准拒绝/不可用等零启动分支也断言空 notices 和合法 schema。
- 新增 runtime-policy.test.mjs 五项能力接缝协议测试：要求 full 而仅 partial 时零 spawn；冻结策略改变时零 confinement/spawn；confinement 期间策略变更或取消时零 spawn；完整 wrapper argv/pipe 传递及卸载清理。使用显式协议对象，**不是实际 OS full enforcement 证据**。
- README 同步已有四工具、可信部署项、冻结/审批/缓存、Git/日志保护和剩余验证项，移除“只有 discover”的过期描述。

### 实际验证

执行 cwd=`dsh-plus/mai/`，未安装或修改依赖。

| 检查 | 本轮结果与边界 |
|---|---|
| 首次 npm test | strict tsc 因缺 notices 失败，未执行测试 |
| 修复后 npm test | 111 项：110 通过、0 失败、1 EPERM 受阻跳过 |
| 补回归后 npm test（含 strict build） | **119 项：118 通过、0 失败、1 EPERM 受阻跳过**，约 6.3 秒 |
| npm pack --dry-run --json --ignore-scripts | **32 白名单文件**，仅 README/package.json/dist；无 tests/过程文档/node_modules，无生成/安装 tgz；不是独立装包证据 |

全量测试中已有真实 LocalSandbox/read-only + LocalSubprocess 合成 direct Node 的非零码、超时、根进程取消验证；不是 npm 项目执行或后代树证明。已有 runtime-plugin 集成使用真实 Cordis/session/approval 的 never 策略验证预览→拒绝→同会话取报告→卸载，以及项目目录无新增文件；agent facade 仍为合成对象，不能替代真实 DSH UI 批准/拒绝。状态机测试中的 allowed-once 是协议注入，未冒称用户真实批准。

### 当前实现状态与接续

| 工作 | 开发实现/证据 | 仍待补齐 |
|---|---|---|
| T-02 发现/配置/元数据 | 已有源码及本地 provider 测试 | 完整 PRD/测试计划交叉核查 |
| T-03 Git | 已有固定宿主命令适配及有界 NUL parser 测试 | 真实 Git 仓库状态、跨子树 rename、不可用/超时组合测试 |
| T-04 冻结/审批 | 已有一次消费、owner、TTL、锁、变更阻断及 never 策略集成 | 真实 UI 计划展示、批准/拒绝/取消 |
| T-05 执行/终止 | 已有串行协调、真实合成根进程和协议故障测试 | Windows npm 参数/生命周期、后代终止（EPERM）、长调用 |
| T-06 安全输出/报告 | 已有有界整字段隐藏、双报告/缓存、notices | 真实 UI 渲染、完整秘密扫描与取消取证链路 |
| T-08 打包/文档 | README 更新，32 文件 pack dry-run | 独立装包/宿主 patch 加载及版本-SHA 对应关系 |

本轮没有读取密钥、发模型请求、运行项目/npm 生命周期脚本、提权、关闭沙箱、非受限重试、安装/重建、提交/推送/发布。Phase 仍 draft；不进入第 7/8 步，不将业务 AC 标通过。下一编码优先真实 Git 元数据集成夹具与完整契约核查；真实 UI、npm/后代和独立安装继续作为明确未验项，若需要新的安装/权限/宿主配置则另行确认。

## 编码收尾：真实 Git、管道完成语义与可恢复错误

### 本轮改动

1. 新增 `tests/git-integration.test.mjs`，五组真实临时 Git 仓库测试。采集走 RuntimeHost → 真实 sandboxPolicy/read-only → LocalSandbox/LocalSubprocess，不替换 provider，不非受限重试。覆盖 clean、staged/unstaged/untracked、中文空格文件与目录、子树外过滤、内部/跨子树重命名、205 项仅保留 200/省略 5、配置字面值隐藏、非仓库降级及调用取消。读取前后 `.git/index` 字节一致。
2. `src/host-runtime.ts`：进程 done 和两路 pipe EOF 独立确认；异常 close/error、非法 UTF-8 prefix 不再误判 clean。取消/失败时终止并关闭剩余 pipe；管理范围尚未确认清空的 handle 保留跟踪，供卸载再次尝试，而非过早 release。新增四项 `git-runtime.test.mjs` 接缝测试。
3. `src/runner.ts`：pipe 未到 EOF 就 close 时标 outputIncomplete，隐藏已经收到的非空字段；订阅前已 destroyed 的 pipe 同样处理。新增两项回归。空字段仍为空，但带明确 incomplete 标记，不伪造曾有输出。
4. `src/report.ts` / coordinator / tools：固定恢复文案进入同一 notices/双报告/缓存；拒绝、零选择、busy、计划失效/变化、timeout、unknown、工具链/完整隔离要求均提供安全下一步。工具边界异常仅返回固定码与固定建议，不返回原始异常、cause、路径或实参。unknown 提示“终态证据不足”，避免把已知范围清空但退出事实缺失说成一定残留。
5. 补充六组恢复建议规则测试、两个工具错误边界测试，以及首任务后配置变化、通道丢失两项调度测试：已得证据保留，剩余任务不启动，none 告警不因 startedAt=null 被丢掉。README 同步真实 Git 证据、测试前提和剩余门槛。

### 夹具边界与失败记录

Git 夹具只在本次 mkdtemp 目录内由测试装配直接运行固定 init/add/commit；禁用 hooks/signing，显式合成用户身份、隔离 setup 的系统/全局配置，清理继承的工作树/索引覆盖项。不在用户仓库提交，不改变全局 Git 配置；这是测试样例建设，不是插件自动提交能力。所有生产 Git 读取仍经宿主沙箱。实际 Git 版本为 **2.55.0.windows.2**，不据此宣称其他版本/平台兼容。

- 第一次 Git 集成测试 4 失败/1 通过：夹具遗漏 policy 所依赖的 sessionProjections，导致 ctx.sandboxPolicy 未挂载；补齐真实 provider 并加挂载断言后五项全通过，没有放宽隔离。只读固定 Git 诊断也正常，未归因 EPERM。
- 新增 pipe 竞态测试先复现 **3 项失败**：尾部被漏读、premature close/非法 prefix 被当 clean。修复生产代码后通过，不将其登记为环境跳过。
- runner 已关闭空 pipe 的初始断言错误要求 `[withheld]`；按既有安全契约修正为空文本 + outputIncomplete=true，非空残片仍隐藏。未放宽保护。
- 一次只读官方固定 SHA 文档请求遭 ECONNRESET；未把失败响应当作安装说明来源，未编造未经核验的宿主 patch 配置。

### 验证结果

在 `dsh-plus/mai/` 执行，无新增依赖或安装/重建：

| 检查 | 实际结果 |
|---|---|
| Git 专项（真实服务补齐后） | 5/5 通过，无 skip |
| 首轮修复后全量 npm test | 130 项：129 通过、0 失败、1 后代 EPERM 受阻跳过 |
| 收尾全量 npm test（含 strict build） | **140 项：139 通过、0 失败、1 后代 EPERM 受阻跳过**，约 11.4 秒 |
| npm pack --dry-run --json --ignore-scripts | **32 文件**，仅 README/package.json/dist，仍无 tests/fixtures/过程文档/node_modules；未生成或安装压缩包 |

### 需求对照与交接界限

| 需求 | 已有源码与开发证据 | 不能据此关闭的项 |
|---|---|---|
| FR-01/02、AC-01/02 | 规范路径/会话 cwd、候选与配置分离、严格验证、有界安全投影及真实 fs/注册调用 | 真实 UI 调用 |
| FR-03、AC-03 | 固定元数据命令、有界 parser、五组真实仓库集成、索引内容不变 | 其他 Git/宿主组合及真实会话前后观察 |
| FR-04、AC-04/11 | 可信工具链指纹、一次消费、owner/TTL/锁、批准前后及任务间变化阻断、实际 never 服务拒绝 | 真实 UI allowed-once、Windows npm 实参/生命周期 |
| FR-05/06、AC-05/06/07/08/13 | 串行/非零继续/未知停止、真实合成根进程、timeout、取消、四状态及总览、并发/缓存重启测试 | npm 三任务真实执行、后代 EPERM、真实卸载/长调用 |
| FR-07/08/09、AC-09/10 | 有界整字段隐藏、双报告/schema/cache、Markdown entity、no-export/未知参数拒绝、固定恢复建议 | 真 UI renderer/取证及完整业务泄漏验收 |
| FR-10、AC-12 | 独立包导出/白名单、真实 Cordis 装卸、固定依赖 | 独立压缩包装载、宿主 patch/UI、制品 SHA 对应 |

核心功能源码和当前环境可执行的开发测试已收尾；剩余事项主要是**明确的集成门槛与安装交付验证**，不是再用占位工具或增加 Mock 数量替代。T-01/G-02/G-04 未通过，T-08 独立装包未验，因此本记录不宣称“第 6 步整体完成”、不提前形成第 7/8 步结论、不改变 Phase/ROADMAP 或业务 AC。

本轮未读凭据、发模型请求、执行用户项目/npm 生命周期、扩大权限、修改宿主核心/ACL、发布或提交用户仓库。若继续完成阶段门槛，需要安排用户已配置的目标版本交互宿主及审批参与，并明确独立装包验证的授权与目录；不能从“继续编码”推导出自动安装/配置秘密/关闭沙箱的许可。
