package com.oryxos.workspace;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.core.io.DefaultResourceLoader;

import java.nio.file.Files;
import java.nio.file.Path;

import static org.assertj.core.api.Assertions.assertThat;

class WorkspaceServiceTest {
    @TempDir
    Path tempDir;

    @Test
    void initWorkspaceCreatesRequiredDirectoriesAndIsIdempotent() {
        WorkspaceProperties properties = new WorkspaceProperties();
        properties.setPath(tempDir.resolve(".oryxos").toString());
        WorkspaceService service = new WorkspaceService(properties, new DefaultResourceLoader());

        WorkspaceInitResult first = service.initWorkspace();
        WorkspaceInitResult second = service.initWorkspace();

        Path workspace = Path.of(first.workspacePath());
        assertThat(Files.isDirectory(workspace.resolve("agents"))).isTrue();
        assertThat(Files.isDirectory(workspace.resolve("skills"))).isTrue();
        assertThat(Files.exists(workspace.resolve("memory/MEMORY.md"))).isTrue();
        assertThat(Files.exists(workspace.resolve("AGENTS.md"))).isTrue();
        assertThat(second.createdPaths()).isEmpty();
    }
}
