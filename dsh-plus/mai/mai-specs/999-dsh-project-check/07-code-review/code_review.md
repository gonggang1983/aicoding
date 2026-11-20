# Feature 999：代码评审

## 授权、来源与结论

- 用户明确授权进入第 7 步代码评审与修复，指定 `my-review-code`。实际读取项目安装入口 `.agents/skills/my-review-code/SKILL.md` 及同作用域 stage-contracts、FEATURE_PROFILES 和个人记忆接入约定；recall(code-review) 返回空、bound=false，不初始化或新增记忆。
- Profile：standard（注册表有效）；本 Skill 没有独立评审模板，采用其 Step 5 要求的结构。路径按 `mai-specs/FEATURE_LAYOUT.json` 的 code-review 登记。
- 唯一需求源：[PRD](../02-prd/PRD.md) FR-01～10 / AC-01～13；设计采用 [TECH_DESIGN](../03-design/TECH_DESIGN.md)，特别是 §6 编码优先补充及实际代码根；参考 [TEST_PLAN](../05-test-plan/TEST_PLAN.md)、BRIEF、README、[第 6 步最新记录](../06-implementation/lifecycle_recheck.md)。历史待确认条目按 BRIEF 已登记的首版基线授权理解，不改写规格或历史事实。
- **初评：修改后重新审查**。确认一项 P1 执行证据错误和一项 P2 Git 兼容遗漏。尚无 P0 的充分证据。真实 UI、Windows npm/后代与独立装包未验仍是交付阻塞，用户授权进入第 7 步不使第 6 步或 AC 自动通过。
- **最新复评：两项源码发现已关闭，代码层面有条件合并（仅开发增量）**；真实宿主等交付条件仍保留。详见同目录 [fix_recheck.md](fix_recheck.md)。本文件保留初评证据，不用后续修复抹去原始结论。

## 1. 比较范围与可复查基线

工作区 HEAD：`ebdaabbc1e915b47a7a46294bdef6c8b3ecfda15`。实际执行 `git diff --cached --stat`、`git diff --stat`、`git ls-files --others --exclude-standard dsh-plus/mai`：staged 为空，tracked unstaged 仅根 .gitignore 的 3 行，整个插件与规格均为 untracked。没有可用的插件历史 diff，本次是**当前文件审查**，不将缺陷归因到某次提交，也不将空 diff 当作无代码变更。

范围：全部 `src/`（15 个 TypeScript 模块）、`tests/`（含 opt-in packaging）、package/lock/tsconfig、README、patch 示例；不审其他作业，不改根忽略文件。追踪真实 Tools/fs/approval/subprocess/sandboxPolicy/sandbox seams 及必要的已安装 provider 实现，不改 node_modules。

初评指纹（SHA-256）：

| 对象 | 初评 SHA-256 |
|---|---|
| src/runner.ts | DBACC6C46A185C8D5317E03D27B29C801902E2564BC3DBC1531EEA772948CEAB |
| src/git.ts | BBF3172586677F65920F80790CA8190208BEE3339E2620921EA5C143D46A1B5E |
| src/coordinator.ts | 0E195C78F6DFFFADEF43A637CB36EF8109799AC65D89BBB6300305660A41FEC8 |
| package-lock.json | D1219CBB541BD942013BA25B857016F05F90FD323909B73A2340B421EB1D9C55 |
| 37 个范围文件的聚合指纹 | ea22668ceed7a0217af488bb9759b73d0fd055c3a15accef1e3d59f6cfc9dc80 |

聚合规则：递归 src/tests 所有文件，加 package.json、package-lock.json、tsconfig.json、cordis.patch.example.yml、README.md；相对路径统一 `/`，按 JS 默认排序；依次将 `路径 + NUL + 文件内容SHA256小写hex + LF` 输入 SHA256。文档和 dist 不参与。复评记录最终指纹。

## 2. 独立预期与实现核查

预期是先发现不执行，只执行选定、冻结且被真实单次批准的任务；调用者不能用命令或批准标志替代宿主决定；同项目实例锁、会话归属、TTL、串行与非零继续、未知停止；终态不凭日志猜测。所有动态数据先安全投影，同一安全对象产生 JSON/Markdown/cache，无报告文件导出；可选 Git 缺失不能伪装 clean，也不应把脚本通过等同于业务验收。

| AC | 实现与现有开发证据 | 判断边界 |
|---|---|---|
| 01/02 | host/config/project/index；host/config/plugin/project tests；固定配置、根边界、候选与任务分离 | 开发证据可用；非真实 UI 验收 |
| 03 | RuntimeHost.git → 固定受限 Git → GitParser；git-runtime 与五组 git-integration | 发现 R-02；没有关闭真实会话前后观察项 |
| 04/11 | preview → SessionStore consume/acquire → approval → 每项 snapshot/policy → confine/spawn；workflow/runtime-policy/never-policy 集成 | allowed-once 测试是协议对象；无真实 UI 批准，npm 二次解释仍未验 |
| 05/06/07 | runner 终态与根进程、timeout、cancel、通道故障测试 | 发现 R-01；后代 EPERM 及 npm 三任务旅程未闭环 |
| 08 | overall 的 failed 优先、空选择 inconclusive、未选忽略；安全固定免责声明 | 状态表通过不代替真实执行结果 |
| 09/10 | bounded OutputCapture/MetadataProjection、schemas/report/cache、拒绝写盘参数和无 export；safety/workflow/tool-errors | 整字段隐藏符合设计 §6；真实 renderer、完整旅程泄漏扫描仍待验 |
| 12/13 | Cordis 注册/卸载、会话锁、单次消费、TTL/copies/restart；已有 patch 和 opt-in packaging 测试 | 打包安装与 UI 未验；不能只凭 import/mock 关闭 AC |

生产模块未直接使用 node:fs/node:child_process 或安装/上传接口；测试中的临时 Git 建仓和 process 启动是隔离夹具，不是插件对用户仓库执行写操作。非报告写盘与宿主会话持久化/获准脚本副作用区分合理。不为首版恢复导出研究。

## 3. 关键发现

### R-01 / P1 / 阻断：可控 stderr 被当成未启动的权威证据

- 初评位置：`src/runner.ts:95–108`（特别是 100 行），`src/redact.ts:62–66` 的 runnerFailed；现有 `tests/runner.test.mjs` 最后一例固化错误预期。
- 触发：脚本真实启动后输出与 active runnerFailureRules 相同的 fatal 子串及允许的非零退出码。stdout/stderr 由脚本控制，不具备来源鉴别。
- 机制：classifyRunnerFailure 仅匹配非零码和 stderr 子串；runTask 据此无条件把 started 改成 no，从而 not_run、清空启动/退出事实。可将“已执行且失败”伪装成“未执行”，并继续后续调度。
- 影响：违反 BR-05/07、AC-05/07 的真实证据契约；用户可能误信无副作用。不能因为 provider 提供匹配规则就视为独立启动证明。
- 归因：当前交付源码确认，历史来源未知。
- 证据：初评隔离 inline Node 协议探针设置 executed=true，脚本写 synthetic runner fatal / exit 17，返回 `executed=true,status=not_run,reason=SANDBOX_RUNNER_FAILED,startedAt=null`。同时只读核实已安装 sandbox/lib/index.js 的 classifyRunnerFailure 确为子串判断。
- 最小修复：无独立“子脚本未启动”证据时，对 runner 与任务来源不明的结果保守为 unknown，不可 not_run；停止余项，给出既有 unknown 建议。明确的 launch 前失败仍 not_run。增加伪造日志回归和 coordinator 剩余任务零启动验证。

### R-02 / P2 / 非阻断但应修复：遗漏合法 Git 类型变化状态 T

- 初评位置：`src/git.ts:36` 状态字符白名单缺 T。
- 触发：Git porcelain v1 出现 ` T`、`T ` 等合法类型变化（如普通文件/符号链接类型变化）。
- 机制/影响：记录被标成损坏并丢弃路径；总数未知、摘要 incomplete，妨碍 FR-03/AC-03 正确呈现合法变更。没有误报 clean，因此不升级为严重安全缺陷。
- 归因：当前交付源码确认，历史来源未知。
- 证据：inline Node 直接输入 ` T changed-file\0`，返回 incomplete 且 paths=[]，应保留合法状态和路径。
- 最小修复：接纳 T，保持其他损坏/未知记录保守处理；覆盖 staged/unstaged 类型变化与 malformed 负例。真实 symlink 类型变化尚未新增 OS 证据，不假装协议输入等于真实 Git 验证。

## 4. 验证与缺口

初评命令 cwd=`dsh-plus/mai/`：memory recall(code-review) 退出 0/空；只读范围/指纹与两项 inline Node 复现均退出 0（探针观察到缺陷，不是产品通过）。上轮 143 项开发测试结果是历史证据，本轮修复后必须重跑再登记，不把旧结果冒充本轮结果。

保留交付条件（不是已确认源码缺陷，也不重复另造业务测试计划）：

- TC-01/03/05/07/08：真实目标版本 UI、审批 reason/renderer、取消后 report 和长调用，需交互宿主及用户参与。
- TC-05/09：Windows 受限 npm argv/pre/post 与后代管理，现有 child spawn EPERM 仍受阻；不得关沙箱、提权或非受限重试。
- TC-01/10：独立 tarball/patch 装配卸载与固定源码 SHA/registry 制品对应；已有 test:package 不等于实测，局部安装仍须单独授权。

评审不修改 PRD/设计、Phase、ROADMAP 或验收状态。用户本次同时授权“评审与修复”，由主编排者在初评产物落盘后切换实施职责做最小修复，再按相同 Skill 复评；不在评审职责内偷偷改源码。
