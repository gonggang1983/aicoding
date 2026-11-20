# G-03 最小隔离技术验证：证据归档与复评（历史）

> **第五轮范围决策**：首版文件导出已由用户明确移除。本文件只保留前轮实验事实和当时结论，不作为当前功能/依赖/后续任务；停止相关探针。最新见 [范围收缩复评](scope_recheck.md)。第四轮补测已完成，前轮若干过强推论的限定见 [第四轮 §3](strict_probe_recheck.md#3-复评与设计纠正)。

> 第 4 步第三轮；用户两次授权同一范围："执行 G-03 最小隔离技术验证；允许编写和运行仅用于验证的探针代码、创建合成临时测试文件。不得安装依赖、提权、修改 DSH 核心或编写生产插件；条件不足先回报，验证后复评，不进入第 5 步。"
> 探针源：[G03Probe.cs](probes/G03Probe.cs)、[RunProbe.ps1](probes/RunProbe.ps1)。本文件为证据真源；复评结论见文末与 [re_review_A](re_review_A.md)。

## 1. 执行环境（实测）

| 项 | 值 |
|---|---|
| OS | Windows 10.0.26200.0，x64 进程 |
| PowerShell | 5.1.26100.9711（Desktop） |
| 编译 | .NET Framework 4.8 csc（Add-Type 内存编译；无 SDK 安装、无依赖安装） |
| 工作区文件系统 | NTFS |
| DSH 宿主 | `dsh` / `deepseek-harness` 均不在 PATH；本轮未安装、未运行宿主 |
| 探针源 SHA-256 | `2B8EF9060018A7F6099473C7A0AB27F85016A82277400697EA3347ED531F50CC`（最终版；早期版本 `6526…C08B7D6` 仅含 Win32 发布，已被替代） |
| 归档时间 | 2026-11-16T02:33:06Z（参数化归档轮） |

## 2. 观察结果

三轮运行（两次手工 + 一次参数化双变体：ASCII 与"中文 space"路径）结果一致。参数化轮原始输出已核，关键行如下；完整行集与首轮相同。

| 验证点 | 结果 | 原始证据 |
|---|---|---|
| 句柄相对打开既有目录（OBJ_DONT_REPARSE+CASE_INSENSITIVE） | 通过 | NTSTATUS=0x00000000 |
| 持有 share=读+写（不拒绝删除）目录句柄时目录重命名 | 被阻止 | HRESULT=0x80070020（sharing violation）；释放句柄后重命名成功（rename_after_release PASS） |
| 句柄相对独占创建暂存文件（FILE_CREATE，share=0） | 通过 | NTSTATUS=0x00000000 |
| 写入 + FlushFileBuffers | 通过 | bytes=21 |
| **Win32 SetFileInformationByHandle/FileRenameInfo 发布** | **失败** | success=False Win32=87（ERROR_INVALID_PARAMETER），本机稳定复现 |
| **原生 NtSetInformationFile + FILE_RENAME_INFORMATION 发布（RootDirectory 相对、no-replace）** | **通过** | NTSTATUS=0x00000000 |
| 发布至已存在同名文件 | 拒绝且旧文件未改 | NTSTATUS=0xC0000035（STATUS_OBJECT_NAME_COLLISION）；existing.md 内容保持 OLD-SENTINEL |
| FileDispositionInfo 句柄删除暂存/碰撞文件 | 通过 | Win32=0 |
| 独占创建已存在文件 | 拒绝 | NTSTATUS=0xC0000035 |
| **持有 share=读+写句柄时对同一空目录设置 junction** | **攻击成功（关键反例）** | set=True Win32=0 |
| **目录已变 junction 后，原目录句柄上的相对创建** | **被拒绝，未重定向** | NTSTATUS=0xC0000280；outsideEntry=False；模拟项目外目录最终为空 |
| OBJ_DONT_REPARSE 相对打开 junction | 拒绝 | NTSTATUS=0xC000050B（STATUS_REPARSE_POINT_ENCOUNTERED） |
| 移除合成重解析点 | 通过 | Win32=0；后续按 reparse 检查逐项清理，全部临时物已确认删除（遗留两轮手工目录也已清理，Remaining: 0） |

路径变体：ASCII 与"中文 space"根目录结果逐行一致。

## 3. 对证明义务的影响

| 缺口 | 验证前状态 | 验证后状态 |
|---|---|---|
| F-01 独立装配/制品 | 开放 | 仍开放：无 DSH 宿主、无 Service 装配、无固定制品 |
| F-02 完整链/重解析变化 | 关键未证实 | **部分证实，方向修正**：(a) deny-delete 语义不足以阻止 reparse 变更——即使持句柄，junction 设置仍成功；(b) 有利结果：已打开目录句柄在变异后拒绝相对创建（0xC0000280），未发生重定向；(c) 未测 share=只读（deny write+delete）下 reparse 设置是否被阻止；(d) 未测卷根→目标全链、卷映射变化、祖先带既有句柄 |
| F-03 句柄发布/清理 | 关键未证实 | **核心语义证实**：原生 NtSetInformationFile no-replace 发布、冲突拒绝、句柄删除在本机 x64/NTFS（含中文/空格路径）可用；Win32 封装在本机不可用（错误 87），候选实现必须使用原生调用与 FILE_RENAME_INFORMATION 布局。未测：严格共享（如目录句柄 deny write）下的发布兼容性、多进程并发竞争、取消/崩溃注入 |
| F-04 政策/意图/观测 | 开放 | 仍完全开放：无宿主，未验证 |
| F-05 故障/打包 | 已列未运行 | 仍开放 |

## 4. 设计修订（据此更新）

1. 完整链目录句柄共享模式从"至少不共享删除"收紧为"读共享 + 不共享写 + 不共享删除"；须另测该模式下 reparse 设置是否被阻止、发布是否仍可用。若两者不可兼得，候选失败，不放宽。
2. 发布一律使用原生 NtSetInformationFile + FILE_RENAME_INFORMATION（x64 布局：BOOLEAN@0、HANDLE@8、DWORD@16、WCHAR[]@20，长度按字节不含结尾 NUL）；不使用本机已证失败的 Win32 封装，也不把 87 当环境可修复问题掩盖。
3. 保留双重防线：即便共享模式被证明不足，OBJ_DONT_REPARSE 相对打开 + 已打开句柄拒绝变异后相对创建（0xC0000280）提供了纵深；但纵深不是允许放宽共享模式的理由。
4. 相对打开必须自卷根逐级、单组件、拒绝重解析——这是本轮唯一直接验证过的打开约束。

## 5. 本轮未做与不得声称

未运行真实 DSH 宿主、未装配 Service、未测多进程并发/取消/崩溃、未测卷根全链与卷映射、未测 deny-write 下 reparse 与发布组合。单机、单进程、合成目录、无策略桥接。以上任何一项都不能因本轮 PASS 而视为已验证；G-03 不得据此关闭。

## 6. 复评结论

**G-03 / R-01 仍为 P0，但证明义务收窄且方向明确**：F-03 核心机制证实可行；F-02 收紧为两个可判定的组合问题（deny-write 下 reparse 阻止、deny-write 下发布兼容）；F-01/F-04 完全未动。建议下一轮最小探针仅补 F-02 剩余组合（同一授权范围即可）；F-01/F-04 需要宿主环境，属后续获批阶段。当前不进入第 5 步，导出门禁不变。
