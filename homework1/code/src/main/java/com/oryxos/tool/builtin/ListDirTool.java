package com.oryxos.tool.builtin;

import com.oryxos.tool.Tool;
import com.oryxos.tool.ToolResult;
import com.oryxos.tool.sandbox.SandboxPolicy;
import org.springframework.stereotype.Component;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;
import java.util.stream.Collectors;

@Component
public class ListDirTool implements Tool {
    private final SandboxPolicy sandboxPolicy;

    public ListDirTool(SandboxPolicy sandboxPolicy) {
        this.sandboxPolicy = sandboxPolicy;
    }

    @Override
    public String name() {
        return "list_dir";
    }

    @Override
    public String description() {
        return "List files in an allowed directory";
    }

    @Override
    public ToolResult invoke(Map<String, Object> input) {
        try {
            Path path = Path.of(String.valueOf(input.get("path")));
            sandboxPolicy.checkFile(path);
            try (var stream = Files.list(path)) {
                return ToolResult.ok(stream.map(item -> item.getFileName().toString()).sorted().collect(Collectors.joining(System.lineSeparator())));
            }
        } catch (Exception e) {
            return ToolResult.error(e.getMessage());
        }
    }
}
