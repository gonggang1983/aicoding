# Bugfix: Shell 白名单绕过

> 本文记录一次完整的 AI 辅助 bugfix 流程：AI 找 bug → 本地 issue 草稿 → 根因分析 → 修复方案 → 回归测试 → 验证结果。
>
> 用户已确认本次“提 issue”采用**本地 issue 草稿**方式，不创建真实 GitHub Issue，避免公开安全漏洞细节。

---

## 1. Issue 草稿 / 本地 Issue 记录

### 标题

Shell whitelist can be bypassed by appending shell composition after an allowed first token

### 类型

Bug / Security

### 严重级别

High

### 影响范围

- `oryxos-tool` 模块
- `WhitelistSandbox` 的 `SHELL_COMMAND` 校验
- `ShellTools` 执行 shell 命令的路径

### 摘要

`WhitelistSandbox` 原先只校验 shell 命令字符串的首 token 是否在 `shell.allowed_commands` 白名单中；但 `ShellTools` 随后通过 `bash -c` 执行完整命令字符串。

因此，当白名单只允许 `echo` 时，下面的命令会通过沙箱：

```bash
echo ok; touch /tmp/pwned
```

沙箱看到首 token 是 `echo` 后放行，但 `bash -c` 会继续执行 `touch /tmp/pwned`，从而绕过 `shell.allowed_commands`。

### 复现步骤

1. 配置 shell 白名单仅允许：

```yaml
shell.allowed_commands:
  - echo
```

2. 调用 shell tool：

```bash
echo ok; touch /tmp/pwned
```

3. 原行为：

- `WhitelistSandbox` 只检查首 token `echo`。
- `echo` 在白名单内，校验通过。
- `ShellTools` 通过 `bash -c` 执行完整字符串。
- 非白名单命令 `touch` 被执行。

### 期望行为

在白名单 shell 模式下，包含 shell 组合、管道、重定向、命令替换、换行等控制语法的命令应被拒绝。

### 实际行为

只校验首 token，导致完整 shell 字符串中的后续命令仍可执行。

### 发布说明

本 issue 当前仅作为本地记录写入 `bugfix.md`。如需公开到 GitHub，应先由维护者确认是否适合公开安全细节，再执行 `gh issue create`。

---

## 2. AI 发现过程

本次先由 AI 对代码库做只读探索，重点寻找适合“发现 bug → 提 issue → 修复”的真实问题。AI 给出的候选包括：

1. Shell 白名单可被命令串联绕过。
2. `AGENT.md` bootstrap 路径可能越界读取。
3. 递归文件搜索可能通过 symlink 读取外部文件。
4. Provider models 代理可能存在 SSRF 风险。
5. CLI `tool list` / `provider list` 与运行时事实源不一致。

综合安全影响、复现难度、修复边界和可测试性，本次选择 **Shell 白名单绕过** 作为修复对象。

---

## 3. 根因分析

### 关键文件 1：`WhitelistSandbox.java`

原逻辑位置：

```java
private void checkShellCommand(String command) {
  String firstToken = command.trim().split("\\s+")[0];
  if (!allowedCommands.contains(firstToken)) {
    throw new SandboxViolationException(...);
  }
}
```

该逻辑只把 shell 命令字符串按空白切分，并校验首 token。

它能拦住：

```bash
rm -rf /tmp/x
```

但拦不住：

```bash
echo ok; rm -rf /tmp/x
```

因为首 token 仍是白名单内的 `echo`。

### 关键文件 2：`ShellTools.java`

执行逻辑：

```java
sandbox.enforce(new SandboxAction(ActionType.SHELL_COMMAND, command));
Process process = new ProcessBuilder("bash", "-c", command).start();
```

`bash -c` 会执行完整 shell 字符串，所以 `;`、`&&`、`||`、`|`、`$()`、反引号、重定向和换行都具备 shell 控制语义。

### 根因总结

沙箱校验粒度是“首 token”，但实际执行粒度是“完整 shell 脚本片段”。这两个粒度不一致，导致白名单策略被绕过。

---

## 4. 修复方案

本次采用保守的 fail-closed 策略：

1. 保持 `ShellTools` 的 `bash -c` 执行能力不变。
2. 在 `WhitelistSandbox` 中增强 `SHELL_COMMAND` 校验。
3. 白名单模式下拒绝以下 shell 控制结构：
   - `$(`
   - 反引号 `` ` ``
   - `\r`
   - `\n`
   - `&&`
   - `||`
   - `;`
   - `|`
   - `>`
   - `<`
   - `&`
4. 拒绝 `null`、空字符串和纯空白 shell 命令。
5. 通过安全结构检查后，再检查首 token 是否在 `allowedCommands`。

这种方案的取舍是：

- 优点：实现简单、边界清晰、默认安全，能覆盖最常见的命令串联和命令替换绕过。
- 缺点：会拒绝部分本身无害但包含这些字符的参数，例如 `echo 'a;b'`。

在 OryxOS 的生产白名单沙箱里，安全边界优先于 shell 表达能力，因此该取舍是可接受的。

---

## 5. 实际修改清单

### 5.1 `WhitelistSandbox.java`

文件：

- `oryxos-tool/src/main/java/io/oryxos/tool/sandbox/WhitelistSandbox.java`

修改内容：

- 新增 `FORBIDDEN_SHELL_TOKENS` 常量。
- 新增 `requireSafeShellCommand()`。
- 新增 `firstForbiddenShellToken()`。
- 修改 `checkShellCommand()`：
  - 先拒绝空命令和危险 shell token。
  - 再用 `split("\\s+", 2)[0]` 取首 token。
  - 再检查白名单。

### 5.2 `ShellTools.java`

文件：

- `oryxos-tool/src/main/java/io/oryxos/tool/builtin/ShellTools.java`

修改内容：

- 更新类注释。
- 更新 SpotBugs `COMMAND_INJECTION` 抑制说明。
- 业务执行逻辑未改，仍由 `Sandbox.enforce()` 作为前置安全边界。

### 5.3 `WhitelistSandboxTest.java`

文件：

- `oryxos-tool/src/test/java/io/oryxos/tool/sandbox/WhitelistSandboxTest.java`

新增测试：

- `shellCompositionAfterAllowedCommandRejected()`
- `blankShellCommandRejected()`

覆盖以下绕过形态：

```bash
echo ok; touch /tmp/pwned
echo ok && touch /tmp/pwned
echo ok || touch /tmp/pwned
echo ok | sh
echo ok > /tmp/pwned
cat < /etc/passwd
echo $(touch /tmp/pwned)
echo `touch /tmp/pwned`
echo ok\ntouch /tmp/pwned
echo ok\r\ntouch /tmp/pwned
echo ok & touch /tmp/pwned
```

### 5.4 `ShellToolsTest.java`

文件：

- `oryxos-tool/src/test/java/io/oryxos/tool/builtin/ShellToolsTest.java`

新增测试：

- `compositeCommandAfterAllowedToken_processNeverStarts()`

该测试使用真实 `WhitelistSandbox`，只允许 `echo`，然后尝试执行：

```bash
echo ok; touch <temp>/pwned
```

断言：

- 抛出 `SandboxViolationException`。
- `<temp>/pwned` 文件不存在，证明副作用命令没有执行。

---

## 6. 验证结果

### 6.1 初次目标测试命令

命令：

```bash
mvn -pl oryxos-tool -am test -Dtest=io.oryxos.tool.sandbox.WhitelistSandboxTest,io.oryxos.tool.builtin.ShellToolsTest
```

结果：失败。

原因：`-am` 会先进入上游模块 `oryxos-core`，但该模块没有匹配 `-Dtest` 指定模式的测试，Surefire 报：

```text
No tests matching pattern "io.oryxos.tool.sandbox.WhitelistSandboxTest, io.oryxos.tool.builtin.ShellToolsTest" were executed!
```

这不是代码修复失败，而是 Maven Reactor + Surefire 指定测试模式的执行方式问题。

### 6.2 修正后的目标测试命令

命令：

```bash
mvn -pl oryxos-tool -am test -Dtest=io.oryxos.tool.sandbox.WhitelistSandboxTest,io.oryxos.tool.builtin.ShellToolsTest -Dsurefire.failIfNoSpecifiedTests=false
```

结果：通过。

关键输出：

```text
Tests run: 24, Failures: 0, Errors: 0, Skipped: 0
BUILD SUCCESS
```

### 6.3 Tool 模块完整测试

命令：

```bash
mvn -pl oryxos-tool -am test
```

结果：失败。

失败原因与本次修改无关：`oryxos-core` 中 `AgentLifecycleServiceTest` 使用 Mockito inline mock，当前环境 Java 26 与 Byte Buddy 版本不兼容：

```text
Java 26 (70) is not supported by the current version of Byte Buddy which officially supports Java 23 (67)
```

即：全模块测试在当前 JDK 26 环境下被 Mockito / Byte Buddy 兼容性阻断，未运行到本次修改导致的失败。

### 6.4 仅运行 `oryxos-tool` 测试

命令：

```bash
mvn -pl oryxos-tool test
```

结果：失败。

原因：不带 `-am` 时，Maven 尝试从远程仓库解析 `io.oryxos:oryxos-core:0.1.1-RELEASE`，但该 artifact 不存在：

```text
Could not find artifact io.oryxos:oryxos-core:jar:0.1.1-RELEASE
```

因此当前仓库需要 `-am` 编译上游模块；但全量 `-am test` 又受 Java 26 / Byte Buddy 兼容性影响。

### 6.5 Spotless 格式检查

命令：

```bash
mvn -pl oryxos-tool -am spotless:check -q
```

结果：失败。

失败原因与本次修改无关：`google-java-format` 在当前 Java 26 环境下出现 API 不兼容：

```text
java.lang.NoSuchMethodError: 'java.util.Queue com.sun.tools.javac.util.Log$DeferredDiagnosticHandler.getDiagnostics()'
```

---

## 7. 修复结果

修复后，在 `WhitelistSandbox` 白名单模式下：

| 命令 | 结果 |
| --- | --- |
| `ls -la` 且 `ls` 在白名单内 | 放行 |
| `cat README.md` 且 `cat` 在白名单内 | 放行 |
| `rm -rf /` 且 `rm` 不在白名单内 | 拒绝 |
| `echo ok; touch /tmp/pwned` | 拒绝 |
| `echo ok && touch /tmp/pwned` | 拒绝 |
| `echo $(touch /tmp/pwned)` | 拒绝 |
| `echo \`touch /tmp/pwned\`` | 拒绝 |
| `echo ok \| sh` | 拒绝 |
| 空命令 / 纯空白命令 | 拒绝 |

端到端测试证明：当 `ShellTools` 使用真实 `WhitelistSandbox` 时，漏洞命令会在 `sandbox.enforce()` 阶段抛出 `SandboxViolationException`，不会进入 `bash -c`，副作用文件不会产生。

---

## 8. 后续建议

1. **命令白名单升级为 argv 模式**
   - 长期更稳的方案是把 shell tool 输入从单个字符串升级为 `command + args[]`，用 `ProcessBuilder(List<String>)` 执行，完全避开 shell parser。

2. **管理台提示危险白名单项**
   - 如果管理员把 `bash`、`sh`、`python`、`node`、`perl`、`ruby` 等解释器加入白名单，仍可能通过解释器参数执行复杂逻辑。
   - 可在 Sandbox 白名单管理 UI 中提示风险。

3. **区分简单 shell 与高级 shell**
   - 默认 `shell` 走安全白名单模式。
   - 如确需复杂脚本，可后续设计独立的受控脚本执行能力，例如脚本文件签名、审批、审计、容器隔离。

4. **在 JDK 21 下跑全量门禁**
   - 项目要求 Java 21。
   - 当前环境实际运行 Java 26，导致 Byte Buddy / Mockito / google-java-format 兼容性失败。
   - 建议切到 JDK 21 后运行：

```bash
mvn -pl oryxos-tool -am test
mvn -pl oryxos-tool -am spotless:check
```

---

## 9. 结论

本次 AI 找到并修复了一个真实安全 bug：**Shell 白名单只校验首 token，而实际通过 `bash -c` 执行完整命令，导致非白名单命令可被串联执行。**

修复后的 `WhitelistSandbox` 在白名单模式下会拒绝 shell 组合、管道、重定向、命令替换和换行等危险结构，从而阻断 `echo ok; touch ...` 这类绕过。

已通过相关回归测试：

```text
mvn -pl oryxos-tool -am test -Dtest=io.oryxos.tool.sandbox.WhitelistSandboxTest,io.oryxos.tool.builtin.ShellToolsTest -Dsurefire.failIfNoSpecifiedTests=false

Tests run: 24, Failures: 0, Errors: 0, Skipped: 0
BUILD SUCCESS
```
