package com.oryxos.api;

import com.oryxos.tool.ToolDescriptor;
import com.oryxos.tool.ToolRegistry;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/v1/tools")
public class ToolController {
    private final ToolRegistry toolRegistry;

    public ToolController(ToolRegistry toolRegistry) {
        this.toolRegistry = toolRegistry;
    }

    @GetMapping
    public List<ToolDescriptor> list() {
        return toolRegistry.descriptors();
    }
}
