package com.oryxos.memory;

import com.oryxos.workspace.WorkspaceService;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.Arrays;

@Service
public class MemoryService {
    private final WorkspaceService workspaceService;

    public MemoryService(WorkspaceService workspaceService) {
        this.workspaceService = workspaceService;
    }

    public Path memoryFile() {
        return workspaceService.workspacePath().resolve("memory").resolve("MEMORY.md");
    }

    public String readAll() {
        Path file = memoryFile();
        if (!Files.exists(file)) {
            return "";
        }
        try {
            return Files.readString(file, StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new IllegalStateException("Failed to read MEMORY.md", e);
        }
    }

    public void save(String content) {
        try {
            Path file = memoryFile();
            Files.createDirectories(file.getParent());
            String item = "\n- " + Instant.now() + " — " + content + "\n";
            Files.writeString(file, item, StandardCharsets.UTF_8,
                    Files.exists(file) ? java.nio.file.StandardOpenOption.APPEND : java.nio.file.StandardOpenOption.CREATE);
        } catch (IOException e) {
            throw new IllegalStateException("Failed to write MEMORY.md", e);
        }
    }

    public String recall(String query) {
        String all = readAll();
        if (query == null || query.isBlank()) {
            return all;
        }
        String normalized = query.toLowerCase();
        return Arrays.stream(all.split("\\R"))
                .filter(line -> line.toLowerCase().contains(normalized))
                .reduce((a, b) -> a + System.lineSeparator() + b)
                .orElse("");
    }
}
