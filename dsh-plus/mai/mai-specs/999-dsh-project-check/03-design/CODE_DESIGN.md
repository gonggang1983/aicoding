# 供评审的代码设计

[返回技术方案](TECH_DESIGN.md) · [第 4 步评审](../04-design-review/design_review.md)

第 4 步收缩修订：用户已确认首版只返回 Markdown/JSON，不提供文件导出。移除原 E/F 导出拒绝分支、专用 Service 与原生能力契约；R-01/G-03 因范围变更不再适用于首版，不是技术修复。R-02 脱敏顺序修订保留。

全部为拟新增 TypeScript 的局部设计示意，未编译、未实现、未测试。函数名为内部契约，不冒充 DSH 的实际导出；宿主字段依据正文固定 SHA。外围 schema、import、时钟与缓存适配省略；关键分支在代码或紧邻文字完整定义，不向生产目录写文件。

## A. 类型与状态不变量

```typescript src/types.ts
export type TaskStatus = 'passed' | 'failed' | 'not_run' | 'unknown';
export type Overall = 'passed' | 'failed' | 'inconclusive';
export interface TaskResult {
  id: string; selected: boolean; status: TaskStatus; reason: string;
  startedAt: string | null; endedAt: string | null;
  durationMs: number | null; exitCode: number | null;
  stdout: string; stderr: string; truncated: boolean;
}
export interface ExitEvidence {
  started: 'no' | 'possible' | 'yes'; rangeEmpty: boolean;
  outcomeKnown: boolean; exitCode: number | null;
  cause: 'normal' | 'timeout' | 'cancel' | 'channel_lost';
}
```

Plan 私有字段及 PublicPlan 详见主文 §2.1，不重复维护完整报告 schema。运行状态机：ready→awaiting_approval→running→settling→finished；拒绝从 awaiting_approval 直接进入 finished；running 的取消进入 settling，不把终止请求当确认退出。Plan 从 fresh→consumed 单向转换，owner/digest/expiry 不可由模型替换。

```typescript src/report.ts
export function overall(tasks: readonly TaskResult[], complete: boolean): Overall {
  const selected = tasks.filter(t => t.selected);
  if (selected.some(t => t.status === 'failed')) return 'failed';
  if (!complete || selected.length === 0) return 'inconclusive';
  return selected.every(t => t.status === 'passed') ? 'passed' : 'inconclusive';
}
```

Review：complete 只表示必要任务执行证据齐全；Git 不可用、输出截断不应错误置为缺执行证据。未选项不参与总体成功证明。

## B. 审批与串行调度

```typescript src/coordinator.ts
async function approvedRun(publicPlan: PublicPlan, exec: Execution) {
  const plan = plans.consumeMatching(publicPlan, exec.agent.session);
  const release = locks.tryAcquire(plan.projectKey);
  if (!release) return busyReport(plan);
  try {
    const outcome = await host.ask(plan.safeApprovalView, exec);
    if (outcome !== 'allowed-once') return deniedReport(plan, outcome);
    return await schedule(plan, exec);
  } finally { release(); }
}
```

consumeMatching 原子校验 owner、TTL、完整公共快照和 digest，移除计划；故 busy 时本次计划也消费，用户重新预览，不能复用已问过的授权。host.ask 必须调用 ctx.approval.request，传 agent、toolName、callId、signal 及可读安全计划 reason；异常转换为拒绝证据，原始异常不输出。exec.signal 已中止时保持 AbortError；outer finally 缓存证据后传播，不能返回假成功。

```typescript src/coordinator.ts
async function schedule(plan: FrozenPlan, exec: Execution) {
  const results = initialNotRunResults(plan);
  try {
    for (const task of plan.selectedInConfigOrder) {
      if (exec.signal.aborted || disposed) break;
      if (!await host.matchesSnapshotAndPolicy(plan)) {
        markRemaining(results, 'PLAN_CHANGED'); break;
      }
      const result = await runner.run(task, plan, exec.signal);
      replaceTaskResult(results, result);
      if (result.status === 'unknown') break;
    }
  } finally { cacheSafePartial(plan, results); }
  exec.signal.throwIfAborted();
  return finalReport(plan, results);
}
```

initialNotRunResults 对未选设 NOT_SELECTED，对已选设 NOT_STARTED；取消时 cacheSafePartial 将尚未启动的已选项标 CANCELLED_QUEUED，卸载同理；执行中项由 runner 给出真实终态。普通 failed 继续、unknown 停止；没有自动重试。runner 的任务 deadline 不直接 abort 外层 exec.signal，否则单项超时会错误取消全部任务。cacheSafePartial 只保存脱敏投影；安全处理失败则整段隐藏，不能绕过脱敏保存。

## C. 执行与终态优先级

```typescript src/runner.ts
function classify(e: ExitEvidence): TaskStatus {
  if (e.started === 'no') return 'not_run';
  if (!e.rangeEmpty || e.cause === 'channel_lost') return 'unknown';
  if (e.started === 'yes' && (e.cause === 'timeout' || e.cause === 'cancel')) return 'failed';
  if (e.started !== 'yes' || !e.outcomeKnown) return 'unknown';
  if (e.exitCode === 0) return 'passed';
  return 'failed';
}
```

正常信号退出的 exitCode=null 是已知异常终态，故 failed；不能将 null 变成 0。已证明启动且 timeout/cancel + rangeEmpty 足够判定失败，outcomeKnown 只对 normal 必需；只有 possible 启动证据时仍 unknown。Review 须核对是否真有启动证据，不依赖 done 的竞态顺序。

执行算法（伪代码，逐分支契约）：

1. 已取消/缺依赖/沙箱准备失败，且尚未 spawn：started=no，not_run。
2. 固定 argv 经过策略及 confine，spawn 返回句柄后 started=possible；仅获得可靠启动证据才 yes。同步异常明确在创建前则 no；不清楚是否启动的故障 possible。
3. 同时持续排空两流，观察 done、waitForExit、deadline 和用户取消；事件由单一 reducer 顺序处理，首次已确认的终态与取消/超时谁先被记录决定 cause。记录终态后晚到取消不反转历史 passed；终态确认前取消胜出即 failed（前提范围已空）。
4. deadline/cancel 或通道丢失：handle.terminate()，使用独立 5 秒确认信号 await waitForExit。确认失败/抛错/超时均 unknown；取消 run 时不再调度下一项。单项 timeout 在范围空后可以继续。
5. direct done 成功但范围非空：继续等待到 deadline，不把根退出当全结束。pipe 错误标 outputIncomplete，不打印原始异常；若退出证据仍完整，保留真实任务结论并披露输出缺口。
6. done reject 后始终尝试 terminate/确认范围；不是明确启动前失败就 unknown，即使范围后来为空也不能猜测退出码。清理定时器/监听器，不将 finally 当终态。

Review：Windows Job 可管理范围不涵盖所有 breakaway，必须报告 provider 限制；不得宣称杀死机器上一切后代。runner 不使用宿主默认 collect 模式以免秘密进入 spill。

## D. 有界输出与安全出口

```typescript src/redact.ts
function retainPrefix(state: Capture, stream: 'stdout' | 'stderr', bytes: Uint8Array) {
  const remaining = Math.max(0, 65536 - state.retainedBytes);
  const kept = bytes.subarray(0, remaining);
  state.appendPrivate(stream, kept);
  state.retainedBytes += kept.byteLength;
  if (kept.byteLength < bytes.byteLength) state.truncated = true;
  // 调用方仍持续消费两流，不对丢弃部分落盘或打印。
}
```

appendPrivate 只留有界原始前缀；结束前不向模型/日志暴露。安全投影顺序：UTF-8 增量解码（不改 CRLF/控制字符）→在完整保留缓冲上标记所有用户字面值匹配区间及预算尾部可疑前缀（重叠区间取并集）→与不完整记录隐藏区间合并并遮蔽→控制字符规范化→已知凭据规则与最终安全检查→Markdown 专用转义。不得先改变文本再匹配未经相同变换的敏感字面值；不能通过删段拼接出新的秘密。所有规范化后的出口也须核对受保护字面值及其展示变体，无法确定则隐藏整字段，不采用脱敏异常时返回原文的回退。JSON 保持规范安全文本，Markdown 从 JSON 生成。非法 UTF-8 或不能判断安全的片段整段隐藏。

不完整尾段不能简单先删再假定凭据完整；跨 chunk/换行的用户字面值在完整保留缓冲上匹配，字面值恰跨预算边界的可疑前缀隐藏。规则不具备全秘密检测保证，报告必须保留局限提示。路径/参数/错误消息也经过安全投影，schema value、render 和会话内报告缓存都不得绕过。脱敏内部异常只返回固定错误码与隐藏标记。

## E. 会话报告与最小装配

1. discover/run 输出脱敏后的规范 JSON，Markdown 从同一结果生成，不能分别重新计算状态。
2. report 仅按 runId 读取当前会话安全内存缓存；校验 owner、TTL 和条数限制。不存在、过期或重启后明确 unavailable，不重新执行任务，不读取其他会话。
3. 不注册导出工具，不接受目标文件名/报告目录/写盘开关，不生成报告或暂存文件。工具根拒绝未知字段；不保留 capability 探测、导出审批、createdPaths 或导出错误占位分支。
4. 不实现 export.ts、host-export-contract.ts 或报告专用 Service。旧导出研究仅见 [历史附录](G03_EXPORT_CAPABILITY.md)，不是首版依赖。

安装/卸载沿用官方 apply/defineTool，inject 仅需已有 tools、fs、subprocess、approval、sandboxPolicy、sandbox，effect 清理绑定取消/终止；不要求后台 jobs 或新原生扩展。仍需真实宿主类型编译和集成验证，不能以设计示例当作已运行代码。

