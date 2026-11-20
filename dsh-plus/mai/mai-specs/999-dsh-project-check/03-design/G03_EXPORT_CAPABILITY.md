# G-03：安全导出能力可行性设计（路线 A，历史归档）

> **第五轮范围决策覆盖**：用户已明确移除首版报告文件导出。本文件全文为前轮研究历史，不是首版设计、依赖或待执行任务；停止探针及替代算法研究。原技术问题未解决，G-03 仅因范围移除不再阻断首版。最新结论见 [范围收缩复评](../04-design-review/scope_recheck.md)。下文需求/AC 引用为当时旧基线。

> Feature 999 / Profile standard / 第 4 步；最新状态：第四轮组合探针已完成，当前严格共享发布候选失败，未获实施批准。
> 用户已选 A，后续明确授权隔离探针编码/运行及合成临时文件；不授权生产插件、依赖安装、提权或修改 DSH 核心。
> 需求真源：[PRD](../02-prd/PRD.md) BR-10、NFR-01、AC-10/11/12，不修改其范围或威胁模型。
> [技术设计](TECH_DESIGN.md) · [代码设计](CODE_DESIGN.md) · [路线 A 复评](../04-design-review/re_review_A.md)

## 1. 可行性结论

**第四轮更新**：严格 FILE_SHARE_READ 下，被测试写句柄在两个取得顺序都被拒绝（Win32=32），但同模式原生 no-replace 发布返回 STATUS_SHARING_VIOLATION（0xC0000043）。当前具体组合失败；不能释放锁或放宽共享来绕过。结果不是所有 Windows 方案不可能的证明。见 [严格组合探针复评](../04-design-review/strict_probe_recheck.md)。以下算法保留研究历史，不是可实施方案。

- 现有固定 DSH FileSystem 的路径写入不能闭合 G-03；增加 realpath/lstat 无效，导出保持 EXPORT_BOUNDARY_UNAVAILABLE、零文件变更。
- 存在不改核心的接入点：Cordis 插件可提供命名 Service，通过部署 patch 安装。候选为报告专用可信宿主能力，不替换全局 ctx.fs。
- Windows 提供相对目录句柄打开、拒绝重解析、共享模式约束、独占创建、句柄重命名与删除等原语。候选组合为“固定完整祖先链 + 句柄内暂存/发布/清理”，但组合语义尚未证明。
- 当前没有获审制品、Windows 组合语义及宿主政策集成证据。**路线 A 可继续研究，完整设计仍需要修改，R-01/G-03 保持 P0。** 不将 API 存在当作安全实现成立，不以禁用导出完成 AC。

## 2. 本轮只读证据

DSH 固定 0.2.2-rc.3 / `39163dd30f703a79079e2d2446545cff3c453738`。Microsoft 在线文档不是固定 Windows 构建的实测。

| ID | 来源 | 支持与限制 |
|---|---|---|
| E-01 | [服务与依赖](https://github.com/deepseek-ai/deepseek-harness/blob/39163dd30f703a79079e2d2446545cff3c453738/docs/user/develop/framework/service.zh.md)、[第一个插件](https://github.com/deepseek-ai/deepseek-harness/blob/39163dd30f703a79079e2d2446545cff3c453738/docs/user/develop/basic/index.zh.md) | Service、inject、ctx.get、effect、绝对路径 patch 已有。不证明新服务自动继承 ctx.fs 防护 |
| E-02 | [NtCreateFile](https://learn.microsoft.com/en-us/windows/win32/api/winternl/nf-winternl-ntcreatefile) | 用户态调用；RootDirectory 相对打开，FILE_CREATE 同名失败，FILE_OPEN 不创建。不证明 Node 已暴露这些参数，不要求内核驱动 |
| E-03 | [OBJECT_ATTRIBUTES](https://learn.microsoft.com/en-us/windows/win32/api/ntdef/ns-ntdef-_object_attributes) | OBJ_DONT_REPARSE 遇重解析失败；已有句柄上的属性变化仍待核实 |
| E-04 | [CreateFileW](https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-createfilew) | 不共享 FILE_SHARE_DELETE 与删除/重命名访问互斥，已有不兼容句柄使打开失败。不等于阻断所有重解析修改 |
| E-05 | [FILE_RENAME_INFO](https://learn.microsoft.com/en-us/windows/win32/api/winbase/ns-winbase-file_rename_info)、[SetFileInformationByHandle](https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-setfileinformationbyhandle) | 句柄重命名、相对目标、ReplaceIfExists=false；FileDispositionInfo 句柄删除。共享模式与结构布局需验证 |
| E-06 | [FILE_RENAME_INFORMATION](https://learn.microsoft.com/en-us/windows-hardware/drivers/ddi/ntifs/ns-ntifs-_file_rename_information) | 补充同卷、相对目标、no-replace 语义；不把 WDK 结构当用户态已编译代码 |
| E-07 | [FSCTL_SET_REPARSE_POINT](https://learn.microsoft.com/en-us/windows/win32/api/winioctl/ni-winioctl-fsctl_set_reparse_point) | 属性可按句柄修改；只检查初始状态不足。本轮未创建链接或请求特权 |
| E-08 | 本机只读查询 | Windows 10.0.26200.0、X64、工作区 NTFS；cl、cmake、clang-cl 未在 PATH。不表示机器完全没有 SDK 或宿主已兼容 |

既有后端竞态证据见首轮 [R-01](../04-design-review/design_review.md)。猜测的 basic/service.zh.md 与 winternl/NtSetInformationFile 页面返回 404，未作依据，随后读取表内真实页面。memory recall(scene=design-review) 为空。

## 3. 最小候选及明确排除

选择报告专用 Service + Windows 原生后端为研究候选；不是批准安装或实现。保持一个 npm 分发包，能力模块及原生制品可选部署，业务模块不直接做磁盘 I/O。不改核心、不替换全局 fs、不开后台服务/端口、不自动下载/构建/安装、不提权、不装驱动。

排除路径重检、业务模块 node:fs/PowerShell/外部写盘助手，以及只固定目标句柄不固定祖先；后者仍可把批准目录移出项目。修改宿主核心与授权及 AC-12 冲突。

新增 Service 必须部署者显式装配，受宿主政策与审批约束并经安全评审；命名为 Service 不会自动变成可信能力。Node 原生接口、SDK/编译器、二进制版本及校验尚未固定，不虚构制品。这是初始纯 TS 方案之外的实质维护成本。

## 4. 私有能力契约（拟议，非现有 DSH API）

暂名 projectCheckExport，仅处理本插件的固定双报告，不暴露通用写盘、删除或原生调用工具。

| 操作 | 来源与行为 |
|---|---|
| observeProject | 真实宿主 project target/session 取得卷与目录文件身份，存私有 run 元数据；不接收模型 fileId。旧 run 无可靠身份则要求重建，不将路径重新绑定成原项目 |
| prepareExport | 本会话不可变安全双报告、项目身份、目录和真实 exec；只读取得链快照、摘要及审批视图，不建暂存物、不长期占锁等待用户 |
| executeExport | 私有 prepare 对象与真实 exec；内部调用独立 approval.request，仅 allowed-once 放行。批准后重新固定链、比对快照，再执行政策/意图/发布/观测 |
| dispose | 拒绝新调用，中止未提交项，等活动 I/O 收敛，清理自有临时句柄，最后释放链；不先关链再清理 |

prepare 绑定 session 对象身份、runId、两份内容 SHA-256、目标、链身份及 nonce，单次消费。不得向模型暴露句柄、原始异常或批准票据。最终名仅从 runId 和 md/json 后缀生成。业务模块不能自由提交文件名/字节，审批不是 approved 布尔参数。

可用性同时要求获审部署、固定制品、OS/文件系统/执行世界匹配及服务存在。模型 capability、方法存在或动态探测为 true 均不够。业务插件可选 ctx.get，能力缺失时其他工具仍能工作；不设强依赖导致整个插件无法加载。

## 5. Windows 候选算法与不变量

以下是待验证组合，不是已成立保证。需要路径写入回退、跟随重解析或扩大共享模式才能工作时，判候选失败，不自动降级。（探针实测进展见 [验证归档](../04-design-review/probe_recheck.md)：F-03 核心已在本机证实，共享模式已收紧，见 §5.1。）

### 5.1 身份与完整目录链

1. 将展示盘符绑定实际卷身份，操作根不用可变盘符或 cwd。首验本地 NTFS；UNC、设备名、ADS、远端世界、未经核实文件系统拒绝，不声称支持。若合法必验场景因此受阻，回报兼容缺口，不改 PRD。
2. 从卷根逐级到项目、再到导出目录：父目录句柄 + 单组件相对名，只打开既有目录，拒绝重解析、空组件、点/点点及分隔符。核对目录类型、卷与文件身份，持有从卷根到目标的全部祖先，而非仅项目以下部分。
3. 链句柄共享模式为“读共享，不共享写、不共享删除”（探针证实 share=读写不足以阻止 reparse 变更；deny-delete 单独不充分）；意图阻断目录自身及祖先的写入、删除与重解析属性修改。已有 DELETE/WRITE 等不兼容句柄则安全失败，不关闭他人句柄、不自动重试。第四轮已判定：被测试 GENERIC_WRITE 句柄的两个取得顺序均被阻断，但发布也因共享冲突失败；该严格共享候选不可启用。
4. prepare 只读取快照后释放；批准后重新自根取得整链并逐项比对。变化则拒绝，不在旧批准下重新绑定位置。固定后才变更文件，保持至所有 I/O 与清理结束。

I1：写入期间项目身份与包含关系同时成立，祖先变化不能重定向操作。此不变量的证明缺口 F-02 仍开放。

### 5.2 暂存、发布、清理

- 两格式从同一不可变安全 RunReport 在内存生成并固定摘要。审批展示两条最终路径、摘要及不覆盖语义。
- 在固定目标目录按句柄独占创建随机临时文件（FILE_CREATE），不打开现有对象、不递归 mkdir、不使用路径 tmpdir。句柄不继承，暂存文件不向他人共享写入/删除。
- 写入并刷出后，持有源句柄，以原生 NtSetInformationFile + FILE_RENAME_INFORMATION（RootDirectory 相对）发布至固定 basename、ReplaceIfExists=false；前轮所测 Win32 封装用法返回 87（不推及所有 Win32 方式），原生发布在读写共享下成功；第四轮在严格只读共享下原生发布失败（0xC0000043）。故当前组合不可实施，不允许 replace/POSIX 或路径回退。
- 失败仅通过自有临时文件句柄标记删除并关闭，不按路径 rm/unlink，不扫描删除旧文件；已发布文件不回滚，目录链此时仍保持。
- 提交点是 no-replace 发布成功。晚到取消不将 created 改成未写；第二份失败逐份回执，任务结论不变。提交结果不明时不能声称 createdPaths=[]，记录 EXPORT_COMMIT_UNCONFIRMED 及待核对路径；现有能力缺失的零写入分支仍确定为空。
- 清理失败披露项目内残留，不在重启后按旧路径自动清理。崩溃不承诺持久回执/恢复。取消必须先等待原生 I/O 收敛，不能先释放链，再让异步操作继续写入。

I2：旧文件 never replace。I3：暂存/发布/清理都使用已验证身份。I4：释放链前所有原生操作已收敛。I5：回执仅反映已知提交事实；不要求两文件原子事务。

### 5.3 必须排除的反例

不共享删除不等于阻止 FSCTL_SET_REPARSE_POINT。允许共享写是否允许改变目录属性、已持有 RootDirectory 如何处理新属性、OBJ_DONT_REPARSE 对每次相对打开的覆盖，均须核实。简单改为不共享写也不是已证实解：发布内部的目标目录打开可能出现共享冲突。

必须覆盖卷根、项目根及全部祖先，不能只测导出目录。盘符/卷挂载变化不得重新绑定身份；无法稳定绑定卷则拒绝。句柄仍指向原目录却可将其移出项目，也违反 I1。不能用随机压力测试未命中窗口代替论证。

## 6. 宿主政策桥接

- 外围权限检查保留；allowed-once 不绕过 read-only、workspace-write、可写根或部署拒绝。danger-full-access 也不放宽项目内导出约束。
- 能力依赖真实 sandboxPolicy/fs/approval，每份暂存前、发布前按 session resolve，不传提权 mode；实际链须同时在批准项目、批准目录及当次政策可写根内。政策根也须绑定身份，不能只字符串 startsWith。
- fs/write-intent 经过宿主现有入口。只可保守组合为 no-replace；监听器要求 replace、拒绝或无法组合时，拒绝，不将其结果静默改成允许。FsTarget/版本须与 ctx.fs 的同一对象对应；提交成功后才发 fs/observed，不伪造临时物的最终文件观测。
- 不能复制 containment 代码就声称继承宿主限制。现有政策对象如何桥接原生身份/提交，动态政策变化的生效点，真实版本观测一致性仍属于 F-04。
- 可信宿主前提不涵盖已控制 DSH 进程/内核或管理员调试能力的对手；这不排除拥有普通目录修改权限的并发进程。若方案需要再排除该类攻击者，必须回交用户，本轮未改变威胁模型。

## 7. 证明义务与退出条件

| 缺口 | 状态 | 必要证据 |
|---|---|---|
| F-01 独立装配/制品 | 接入点已核实，制品不存在 | 不改核心的 Service 装配；固定原生接口/SDK/二进制；无自动下载/提权；完整生命周期 |
| F-02 完整链/重解析变化 | 探针部分证实：deny-delete 不足，变异后原句柄拒绝相对创建（0xC0000280）；第四轮阻断被测试写句柄，但严格共享下发布失败，不能关闭 F-02 | 逐级相对打开、已有恶意句柄、祖先移动、空目录转 junction（已证实可设置）、卷映射变化的语义论证及普通用户对手下的可重复验证 |
| F-03 句柄发布/清理组合 | 读写共享下核心可用；严格只读共享下发布实测失败（0xC0000043），当前候选失败 | 严格共享（读共享，不共享写/删除）下源/目标句柄兼容；同名竞争确定失败；仅删除自有对象；取消 I/O 收敛 |
| F-04 政策/意图/观测 | 关键未证实 | read-only/受限根不能被批准绕过；拒绝监听器保留；根身份稳定；政策变化生效点与宿主一致；版本观测可复核 |
| F-05 故障/打包 | 已列义务，未运行 | 部分提交、异常、卸载真实回执；独立包加载、拒绝无文件；AC-10/11/12 |

新增维护面为 Windows ABI/SDK、原生内存与句柄安全、制品供应链、文件系统语义及政策桥接，显著高于初始纯 TS 插件。不新增通用 fs provider/后台 broker/跨平台模拟层；失败不自动扩大成驱动、管理员方案或修改核心。

**本轮探针已执行并复评**，见 [第四轮证据](../04-design-review/strict_probe_recheck.md)。暂停扩张探针范围；优先回交用户是否另行授权路线 A 的替代算法设计，先说明发布期间如何同时维持身份、包含关系与政策。未自动选择 B，不安装、不提权、不改核心，不进入第 5 步。

关闭条件不是“允许以后再测”：F-02～04 须有可审查的组合语义与最小证据，F-01 须确定可信装配/制品路径，复评才可能撤销设计阻断。完整运行验收仍留给后续获批阶段。若不授权探针，则停在当前证据边界，不能宣布 A 已成功。

