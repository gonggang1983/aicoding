package com.oryxos.tool;

import java.util.Map;

public record ToolCall(String name, Map<String, Object> input) {
}
