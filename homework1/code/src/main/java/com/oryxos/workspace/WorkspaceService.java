package com.oryxos.workspace;

import org.springframework.core.io.Resource;
import org.springframework.core.io.ResourceLoader;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;

@Service
public class WorkspaceService {
    private final WorkspaceProperties properties;
    private final ResourceLoader resourceLoader;

    public WorkspaceService(WorkspaceProperties properties, ResourceLoader resourceLoader) {
        this.properties = properties;
        this.resourceLoader = resourceLoader;
    }

    public Path workspacePath() {
        return Path.of(properties.getPath());
    }

    public WorkspaceInitResult initWorkspace() {
        return initWorkspace(workspacePath());
    }

    public WorkspaceInitResult initWorkspace(Path workspace) {
        List<String> created = new ArrayList<>();
        createDirectory(workspace, created);
        for (String dir : List.of("agents", "skills", "output", "memory", "sessions", "logs")) {
            createDirectory(workspace.resolve(dir), created);
        }
        createTemplate(workspace.resolve("AGENTS.md"), "templates/AGENTS.md", created, null);
        createTemplate(workspace.resolve("SOUL.md"), "templates/SOUL.md", created, null);
        createTemplate(workspace.resolve("USER.md"), "templates/USER.md", created, null);
        createFileIfMissing(workspace.resolve("memory/MEMORY.md"), "# MEMORY\n\n", created);
        return new WorkspaceInitResult(workspace.toAbsolutePath().normalize().toString(), created);
    }

    public Path createProfile(String name) {
        validateName(name);
        Path agentDir = workspacePath().resolve("agents").resolve(name);
        createDirectory(agentDir, new ArrayList<>());
        Path agentFile = agentDir.resolve("AGENT.md");
        createTemplate(agentFile, "templates/AGENT.md", new ArrayList<>(), name);
        return agentFile;
    }

    public List<String> listProfiles() {
        Path agents = workspacePath().resolve("agents");
        if (!Files.isDirectory(agents)) {
            return List.of();
        }
        try (var stream = Files.list(agents)) {
            return stream.filter(Files::isDirectory)
                    .filter(path -> Files.exists(path.resolve("AGENT.md")))
                    .map(path -> path.getFileName().toString())
                    .sorted()
                    .toList();
        } catch (IOException e) {
            throw new IllegalStateException("Failed to list profiles", e);
        }
    }

    public String showProfile(String name) {
        validateName(name);
        Path agentFile = workspacePath().resolve("agents").resolve(name).resolve("AGENT.md");
        if (!Files.exists(agentFile)) {
            throw new IllegalArgumentException("Profile not found: " + name);
        }
        try {
            return Files.readString(agentFile, StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new IllegalStateException("Failed to read profile: " + name, e);
        }
    }

    private void createDirectory(Path path, List<String> created) {
        try {
            if (!Files.exists(path)) {
                Files.createDirectories(path);
                created.add(path.toString());
            }
        } catch (IOException e) {
            throw new IllegalStateException("Failed to create directory: " + path, e);
        }
    }

    private void createTemplate(Path target, String templatePath, List<String> created, String profileName) {
        if (Files.exists(target)) {
            return;
        }
        try {
            Resource resource = resourceLoader.getResource("classpath:" + templatePath);
            String content = new String(resource.getInputStream().readAllBytes(), StandardCharsets.UTF_8);
            if (profileName != null) {
                content = content.replace("{{name}}", profileName);
            }
            createFileIfMissing(target, content, created);
        } catch (IOException e) {
            throw new IllegalStateException("Failed to create template: " + target, e);
        }
    }

    private void createFileIfMissing(Path target, String content, List<String> created) {
        try {
            if (Files.exists(target)) {
                return;
            }
            Path parent = target.getParent();
            if (parent != null) {
                Files.createDirectories(parent);
            }
            Files.writeString(target, content, StandardCharsets.UTF_8);
            created.add(target.toString());
        } catch (IOException e) {
            throw new IllegalStateException("Failed to create file: " + target, e);
        }
    }

    private void validateName(String name) {
        if (name == null || !name.matches("[a-zA-Z0-9_.-]+")) {
            throw new IllegalArgumentException("Profile name may only contain letters, numbers, dot, underscore and dash");
        }
    }
}
