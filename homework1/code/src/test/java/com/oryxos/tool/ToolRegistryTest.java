package com.oryxos.tool;

import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

class ToolRegistryTest {
    @Test
    void registersToolsByName() {
        Tool tool = new Tool() {
            @Override
            public String name() {
                return "demo_tool";
            }

            @Override
            public String description() {
                return "demo";
            }

            @Override
            public ToolResult invoke(Map<String, Object> input) {
                return ToolResult.ok("ok");
            }
        };

        ToolRegistry registry = new ToolRegistry(List.of(tool));

        assertThat(registry.names()).containsExactly("demo_tool");
        assertThat(registry.find("demo_tool")).isPresent();
        assertThat(registry.descriptors()).extracting(ToolDescriptor::name).containsExactly("demo_tool");
    }
}
