package com.oryxos.cli;

import com.oryxos.tool.ToolRegistry;
import com.oryxos.workspace.WorkspaceService;
import org.springframework.stereotype.Component;
import picocli.CommandLine.Command;

@Component
@Command(name = "status", description = "Show OryxOS local status", mixinStandardHelpOptions = true)
public class StatusCommand implements Runnable {
    private final WorkspaceService workspaceService;
    private final ToolRegistry toolRegistry;

    public StatusCommand(WorkspaceService workspaceService, ToolRegistry toolRegistry) {
        this.workspaceService = workspaceService;
        this.toolRegistry = toolRegistry;
    }

    @Override
    public void run() {
        System.out.println("Workspace: " + workspaceService.workspacePath().toAbsolutePath().normalize());
        System.out.println("Profiles: " + workspaceService.listProfiles().size());
        System.out.println("Providers: mock");
        System.out.println("Tools: " + toolRegistry.names().size());
    }
}
