package com.oryxos.tool.builtin;

import com.oryxos.tool.Tool;
import com.oryxos.tool.ToolResult;
import com.oryxos.tool.sandbox.SandboxPolicy;
import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;

@Component
public class ReadFileTool implements Tool {
    private final SandboxPolicy sandboxPolicy;

    public ReadFileTool(SandboxPolicy sandboxPolicy) {
        this.sandboxPolicy = sandboxPolicy;
    }

    @Override
    public String name() {
        return "read_file";
    }

    @Override
    public String description() {
        return "Read a UTF-8 text file from an allowed path";
    }

    @Override
    public ToolResult invoke(Map<String, Object> input) {
        try {
            Path path = Path.of(String.valueOf(input.get("path")));
            sandboxPolicy.checkFile(path);
            return ToolResult.ok(Files.readString(path, StandardCharsets.UTF_8));
        } catch (Exception e) {
            return ToolResult.error(e.getMessage());
        }
    }
}
