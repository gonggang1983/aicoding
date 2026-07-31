package com.oryxos.agent;

import java.util.List;
import java.util.Map;

public record Profile(
        String name,
        String description,
        String providerName,
        String model,
        List<String> tools,
        List<String> skills,
        List<String> bootstrap,
        int maxIterations,
        int maxHistoryTurns,
        Map<String, Object> raw
) {
}
