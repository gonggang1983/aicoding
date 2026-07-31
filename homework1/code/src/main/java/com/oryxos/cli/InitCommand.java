package com.oryxos.cli;

import com.oryxos.workspace.WorkspaceService;
import org.springframework.stereotype.Component;
import picocli.CommandLine.Command;

@Component
@Command(name = "init", description = "Initialize the .oryxos workspace", mixinStandardHelpOptions = true)
public class InitCommand implements Runnable {
    private final WorkspaceService workspaceService;

    public InitCommand(WorkspaceService workspaceService) {
        this.workspaceService = workspaceService;
    }

    @Override
    public void run() {
        var result = workspaceService.initWorkspace();
        System.out.println("Workspace: " + result.workspacePath());
        if (result.createdPaths().isEmpty()) {
            System.out.println("Already initialized. No files overwritten.");
        } else {
            System.out.println("Created " + result.createdPaths().size() + " paths.");
        }
    }
}
