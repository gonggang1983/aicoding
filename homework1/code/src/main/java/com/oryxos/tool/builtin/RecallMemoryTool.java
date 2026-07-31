package com.oryxos.tool.builtin;

import com.oryxos.memory.MemoryService;
import com.oryxos.tool.Tool;
import com.oryxos.tool.ToolResult;
import org.springframework.stereotype.Component;

import java.util.Map;

@Component
public class RecallMemoryTool implements Tool {
    private final MemoryService memoryService;

    public RecallMemoryTool(MemoryService memoryService) {
        this.memoryService = memoryService;
    }

    @Override
    public String name() {
        return "recall_memory";
    }

    @Override
    public String description() {
        return "Recall long-term memories by keyword from MEMORY.md";
    }

    @Override
    public ToolResult invoke(Map<String, Object> input) {
        return ToolResult.ok(memoryService.recall(String.valueOf(input.getOrDefault("query", ""))));
    }
}
