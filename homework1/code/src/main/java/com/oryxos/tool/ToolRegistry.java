package com.oryxos.tool;

import org.springframework.stereotype.Component;

import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.function.Function;
import java.util.stream.Collectors;

@Component
public class ToolRegistry {
    private final Map<String, Tool> tools;

    public ToolRegistry(List<Tool> tools) {
        this.tools = tools.stream().collect(Collectors.toUnmodifiableMap(Tool::name, Function.identity()));
    }

    public List<String> names() {
        return tools.keySet().stream().sorted().toList();
    }

    public List<ToolDescriptor> descriptors() {
        return tools.values().stream()
                .map(tool -> new ToolDescriptor(tool.name(), tool.description()))
                .sorted(Comparator.comparing(ToolDescriptor::name))
                .toList();
    }

    public Optional<Tool> find(String name) {
        return Optional.ofNullable(tools.get(name));
    }
}
