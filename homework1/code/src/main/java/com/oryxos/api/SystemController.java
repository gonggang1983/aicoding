package com.oryxos.api;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
@RequestMapping("/api/v1")
public class SystemController {
    @Value("${oryxos.version:0.1.0-SNAPSHOT}")
    private String version;

    @GetMapping("/health")
    public Map<String, Object> health() {
        return Map.of("status", "UP", "name", "OryxOS", "version", version);
    }

    @GetMapping("/info")
    public Map<String, Object> info() {
        return Map.of("name", "OryxOS", "version", version, "runtime", "Agent Harness OS");
    }
}
