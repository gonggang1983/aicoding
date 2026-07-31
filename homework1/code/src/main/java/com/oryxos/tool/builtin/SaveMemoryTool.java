package com.oryxos.tool.builtin;

import com.oryxos.memory.MemoryService;
import com.oryxos.tool.Tool;
import com.oryxos.tool.ToolResult;
import org.springframework.stereotype.Component;

import java.util.Map;

@Component
public class SaveMemoryTool implements Tool {
    private final MemoryService memoryService;

    public SaveMemoryTool(MemoryService memoryService) {
        this.memoryService = memoryService;
    }

    @Override
    public String name() {
        return "save_memory";
    }

    @Override
    public String description() {
        return "Append a long-term memory item to .oryxos/memory/MEMORY.md";
    }

    @Override
    public ToolResult invoke(Map<String, Object> input) {
        memoryService.save(String.valueOf(input.getOrDefault("content", "")));
        return ToolResult.ok("memory saved");
    }
}
