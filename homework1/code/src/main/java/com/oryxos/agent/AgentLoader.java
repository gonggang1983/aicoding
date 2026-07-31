package com.oryxos.agent;

import com.oryxos.workspace.WorkspaceService;
import org.springframework.stereotype.Component;
import org.yaml.snakeyaml.Yaml;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Collections;
import java.util.List;
import java.util.Map;

@Component
public class AgentLoader {
    private final WorkspaceService workspaceService;
    private final Yaml yaml = new Yaml();

    public AgentLoader(WorkspaceService workspaceService) {
        this.workspaceService = workspaceService;
    }

    public AgentDefinition load(String name) {
        Path agentFile = workspaceService.workspacePath().resolve("agents").resolve(name).resolve("AGENT.md");
        if (!Files.exists(agentFile)) {
            throw new IllegalArgumentException("Agent not found: " + name + ". Run `oryxos profile create " + name + "` first.");
        }
        try {
            String content = Files.readString(agentFile, StandardCharsets.UTF_8);
            Frontmatter frontmatter = parseFrontmatter(content);
            return new AgentDefinition(deriveProfile(frontmatter.yaml()), frontmatter.body());
        } catch (Exception e) {
            throw new IllegalStateException("Failed to load agent: " + name, e);
        }
    }

    @SuppressWarnings("unchecked")
    Profile deriveProfile(Map<String, Object> config) {
        String name = stringValue(config.get("name"), "demo");
        String description = stringValue(config.get("description"), "OryxOS agent");
        Map<String, Object> provider = mapValue(config.get("provider"));
        Map<String, Object> settings = mapValue(config.get("settings"));
        return new Profile(
                name,
                description,
                stringValue(provider.get("name"), "mock"),
                stringValue(provider.get("model"), "mock-chat"),
                stringList(config.get("tools")),
                stringList(config.get("skills")),
                stringList(config.get("bootstrap")),
                intValue(settings.get("max_iterations"), 10),
                intValue(settings.get("max_history_turns"), 20),
                config
        );
    }

    @SuppressWarnings("unchecked")
    private Frontmatter parseFrontmatter(String content) {
        if (!content.startsWith("---")) {
            return new Frontmatter(Collections.emptyMap(), content);
        }
        int end = content.indexOf("\n---", 3);
        if (end < 0) {
            return new Frontmatter(Collections.emptyMap(), content);
        }
        String yamlText = content.substring(3, end).trim();
        String body = content.substring(end + 4).trim();
        Object loaded = yaml.load(yamlText);
        Map<String, Object> map = loaded instanceof Map<?, ?> loadedMap ? (Map<String, Object>) loadedMap : Collections.emptyMap();
        return new Frontmatter(map, body);
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> mapValue(Object value) {
        if (value instanceof Map<?, ?> map) {
            return (Map<String, Object>) map;
        }
        return Collections.emptyMap();
    }

    private List<String> stringList(Object value) {
        if (value instanceof List<?> list) {
            return list.stream().map(String::valueOf).toList();
        }
        return List.of();
    }

    private String stringValue(Object value, String defaultValue) {
        return value == null ? defaultValue : String.valueOf(value);
    }

    private int intValue(Object value, int defaultValue) {
        if (value instanceof Number number) {
            return number.intValue();
        }
        if (value != null) {
            return Integer.parseInt(String.valueOf(value));
        }
        return defaultValue;
    }

    private record Frontmatter(Map<String, Object> yaml, String body) {
    }
}
