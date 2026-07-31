package com.oryxos.tool;

import java.util.Map;

public interface Tool {
    String name();

    String description();

    ToolResult invoke(Map<String, Object> input);
}
