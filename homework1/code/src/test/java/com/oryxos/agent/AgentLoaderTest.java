package com.oryxos.agent;

import com.oryxos.workspace.WorkspaceProperties;
import com.oryxos.workspace.WorkspaceService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.core.io.DefaultResourceLoader;

import java.nio.file.Path;

import static org.assertj.core.api.Assertions.assertThat;

class AgentLoaderTest {
    @TempDir
    Path tempDir;

    @Test
    void loadDerivesProfileFromAgentFrontmatter() {
        WorkspaceProperties properties = new WorkspaceProperties();
        properties.setPath(tempDir.resolve(".oryxos").toString());
        WorkspaceService workspaceService = new WorkspaceService(properties, new DefaultResourceLoader());
        workspaceService.initWorkspace();
        workspaceService.createProfile("demo");

        AgentLoader loader = new AgentLoader(workspaceService);
        AgentDefinition definition = loader.load("demo");

        assertThat(definition.profile().name()).isEqualTo("demo");
        assertThat(definition.profile().providerName()).isEqualTo("mock");
        assertThat(definition.profile().tools()).contains("recall_memory", "save_memory", "http_get");
        assertThat(definition.instructions()).contains("OryxOS");
    }
}
