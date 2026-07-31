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
public class WriteFileTool implements Tool {
    private final SandboxPolicy sandboxPolicy;

    public WriteFileTool(SandboxPolicy sandboxPolicy) {
        this.sandboxPolicy = sandboxPolicy;
    }

    @Override
    public String name() {
        return "write_file";
    }

    @Override
    public String description() {
        return "Write a UTF-8 text file to an allowed path";
    }

    @Override
    public ToolResult invoke(Map<String, Object> input) {
        try {
            Path path = Path.of(String.valueOf(input.get("path")));
            sandboxPolicy.checkFile(path);
            Path parent = path.getParent();
            if (parent != null) {
                Files.createDirectories(parent);
            }
            Files.writeString(path, String.valueOf(input.getOrDefault("content", "")), StandardCharsets.UTF_8);
            return ToolResult.ok("file written: " + path);
        } catch (Exception e) {
            return ToolResult.error(e.getMessage());
        }
    }
}
