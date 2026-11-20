# Feature 999：独立装包增量验证

[代码评审](code_review.md) · [修复复评](fix_recheck.md) · [BRIEF](../BRIEF.md)

## 授权与范围

用户明确授权：“继续补齐 Feature 999 的独立装包验证，允许在自动清理的临时目录离线局部安装，禁用生命周期脚本，不进入第 8 步。”

本次仅补第 7 步既有装包验证缺口，执行已审阅的 `tests/packaging/package.test.mjs`；不改变源码、测试、package/lock、沙箱或宿主核心，不启动交互 UI/model loop，不创建第 8 步产物，不修改 Phase/ROADMAP。

## 基线与命令

- cwd：仓库 `dsh-plus/mai/`。
- 实际 Node v24.18.0 / npm 11.16.0，Windows 开发环境。
- HEAD：`ebdaabbc1e915b47a7a46294bdef6c8b3ecfda15`；插件仍为未跟踪工作区，不能据 HEAD 代表插件版本。
- 执行命令：`npm run test:package`，先 strict TypeScript 构建，再 `node --test tests/packaging/*.test.mjs`。
- 内部打包：`npm pack --json --ignore-scripts --pack-destination <本次临时根>`。
- 内部安装：`npm install <本地tarball> --offline --ignore-scripts --legacy-peer-deps --no-audit --no-fund --package-lock=false`，仅安装至临时根下 install/，不在用户项目安装。
- 对照临时目录 `dsh-pack-*` 执行前后集合，观察本轮新增残留数；不删除任何先存目录。

测试时的 38 文件聚合 SHA-256（算法见初评报告）：`634d985682bd0d0926f637b6f63e79a0970aced0bf39b488ad2af85a19929ffd`，与上轮源码复评基线一致。本轮结果归档后 README/索引文字更新不在该实测快照内。

| 关键输入 | SHA-256 |
|---|---|
| tests/packaging/package.test.mjs | 2e741f796b7e81d881d004dafcb2f3ffe3a6b9bd347486de0ca12c20b9ae9b5b |
| package-lock.json | d1219cbb541bd942013ba25b857016f05f90fd323909b73a2340b421eb1d9c55 |
| cordis.patch.example.yml | 2083de756b9f0047bafbd8c554c220d59d2cf64be98c59d2f89d062c6524d97e |

本次 tarball 按授权自清理，测试没有输出或持久归档该 tarball 的字节摘要，故不编造制品 hash、不使用旧 dry-run 的摘要代替。输入基线、实际断言和命令可复查；不是持久发布制品归档。

## 实际结果

**退出码 0；1 项测试，1 通过、0 失败、0 跳过。** 测试约 5.83 秒，Node test runner 总计约 6.60 秒（不含前置 tsc）。strict 构建通过。

实际断言全部通过：

1. 生成 `dsh-project-check-0.1.0.tgz`，包内 33 白名单文件；包含 dist、README、package.json、patch 示例，不含 src、测试或过程文档。
2. 从该 tarball 在全新临时 install/ 离线安装，生命周期脚本禁用，未自动安装 peer dependencies；安装目录的版本为 0.1.0，src/index.ts 不存在。
3. 将已安装包内 patch 示例的四个绝对路径占位符替换为本次临时位置，真实 `app-boot` + overlay Loader 加载的是**临时安装包的 dist/index.js**，不是工作区 dist。
4. 真实工具注册表出现 discover/preview/run/report 四工具，无 export。
5. 临时中文/空格项目经发现返回正确名称和 inconclusive；预览成功冻结。
6. 真实 approval 服务 `never` 策略拒绝执行，report.approval=rejected、任务 startedAt=null；同会话按 planId 取回相同报告。
7. 项目文件清单仍只有 package.json 与手工配置；未生成报告文件或其他项目文件。
8. 通过真实 Loader.remove/await 卸载条目，观察到四工具贡献全部消失；内部 warning 数为 0。
9. 测试清理卸载 host、移除临时 peer junction，再删除整个临时树；额外前后集合观察为 **RemainingCount=0**。包根也没有生成遗留 *.tgz。

补充路径校验仍退出 0，valid=true，无 issues/warnings；仅是路径合法性，不算业务验收。

## 结论及证据边界

**关闭“独立本地 tarball 安装 + patch/Loader 加载、never-policy 拒绝、报告取回与卸载”的验证缺口。** patch 不再只是未验证模板，但这仅证明本次替换路径后的隔离组合，不代表任意部署自动可用。

安装的插件来源独立 tarball；宿主 peer 服务通过临时 junction 复用当前已装固定依赖。它不是从零离线安装完整 DSH，也没有验证 npm peer 自动解析安装。宿主会话/审批服务真实，agent facade 为测试对象；没有交互 UI 或模型循环。`requireFullEnforcement: true` 未下调，执行在审批拒绝时即停止，**本例未测试 full enforcement 进程启动能力**。

未新增依赖/全局安装、读取凭据、请求模型、提权、扩大 ACL、切换 sandbox mode、提交/推送或发布。禁用的是 npm lifecycle hooks；明确调用的 build/test 命令仍执行，并非声称没有运行任何测试命令。

本轮不重复全量 `npm test`：生产源码和测试未改，strict build 已重跑；上一轮 **148 项 / 147 通过 / 0 失败 / 1 后代 EPERM 受阻** 仍是该独立开发套件的历史结果，新增装包套件 **1/1 通过** 分开登记，不拼成一次虚构的 149 项执行。

## 尚未关闭

- 真实 DSH UI 的批准/拒绝/取消、renderer、长调用和取消后取报告，需要目标交互宿主与用户参与。
- Windows npm argv/pre/post 与后代受管终止：已有 EPERM 阻塞未解决，本例无批准执行项目脚本。
- 固定 registry 制品与设计源码 SHA 的对应证据；同版号和成功 Loader 启动不足以证明来源一致。

因此保持“仅开发增量有条件合并”，不宣称 AC-12 或 T-01/T-08 整体完成，不进入第 8 步。本轮完成后暂停；优先下一步是安排目标版本交互宿主及用户审批参与，先核查其运行条件，不从本次临时局部安装授权推导个人 DSH_HOME 配置、凭据或权限变更。
