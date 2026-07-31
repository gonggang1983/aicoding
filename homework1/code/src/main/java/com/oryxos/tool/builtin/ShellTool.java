package com.oryxos.tool.builtin;

import com.oryxos.tool.Tool;
import com.oryxos.tool.ToolResult;
import com.oryxos.tool.sandbox.SandboxPolicy;
import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Map;
import java.util.concurrent.TimeUnit;

@Component
public class ShellTool implements Tool {
    private final SandboxPolicy sandboxPolicy;

    public ShellTool(SandboxPolicy sandboxPolicy) {
        this.sandboxPolicy = sandboxPolicy;
    }

    @Override
    public String name() {
        return "shell";
    }

    @Override
    public String description() {
        return "Run a whitelisted shell command with timeout";
    }

    @Override
    public ToolResult invoke(Map<String, Object> input) {
        try {
            String command = String.valueOf(input.get("command"));
            sandboxPolicy.checkCommand(command);
            Process process = new ProcessBuilder("bash", "-lc", command).redirectErrorStream(true).start();
            boolean finished = process.waitFor(Duration.ofSeconds(10).toMillis(), TimeUnit.MILLISECONDS);
            if (!finished) {
                process.destroyForcibly();
                return ToolResult.error("command timed out");
            }
            return ToolResult.ok(new String(process.getInputStream().readAllBytes(), StandardCharsets.UTF_8));
        } catch (Exception e) {
            return ToolResult.error(e.getMessage());
        }
    }
}
