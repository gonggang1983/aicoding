package com.oryxos.cli;

import com.oryxos.workspace.WorkspaceService;
import org.springframework.stereotype.Component;
import picocli.CommandLine.Command;
import picocli.CommandLine.Parameters;

@Component
@Command(name = "profile", description = "Manage Agent profiles", mixinStandardHelpOptions = true,
        subcommands = {ProfileCommand.ListProfiles.class, ProfileCommand.CreateProfile.class, ProfileCommand.ShowProfile.class, ProfileCommand.DeleteProfile.class})
public class ProfileCommand implements Runnable {
    @Override
    public void run() {
        System.out.println("Use `oryxos profile --help` to see profile commands.");
    }

    @Component
    @Command(name = "list", description = "List profiles")
    public static class ListProfiles implements Runnable {
        private final WorkspaceService workspaceService;

        public ListProfiles(WorkspaceService workspaceService) {
            this.workspaceService = workspaceService;
        }

        @Override
        public void run() {
            workspaceService.listProfiles().forEach(System.out::println);
        }
    }

    @Component
    @Command(name = "create", description = "Create a profile")
    public static class CreateProfile implements Runnable {
        private final WorkspaceService workspaceService;

        @Parameters(index = "0", description = "Profile name")
        private String name;

        public CreateProfile(WorkspaceService workspaceService) {
            this.workspaceService = workspaceService;
        }

        @Override
        public void run() {
            workspaceService.initWorkspace();
            System.out.println("Created profile: " + workspaceService.createProfile(name));
        }
    }

    @Component
    @Command(name = "show", description = "Show profile AGENT.md")
    public static class ShowProfile implements Runnable {
        private final WorkspaceService workspaceService;

        @Parameters(index = "0", description = "Profile name")
        private String name;

        public ShowProfile(WorkspaceService workspaceService) {
            this.workspaceService = workspaceService;
        }

        @Override
        public void run() {
            System.out.println(workspaceService.showProfile(name));
        }
    }

    @Component
    @Command(name = "delete", description = "Delete a profile directory")
    public static class DeleteProfile implements Runnable {
        @Parameters(index = "0", description = "Profile name")
        private String name;

        @Override
        public void run() {
            System.out.println("Profile delete is intentionally not implemented in the initial skeleton. Delete .oryxos/agents/" + name + " manually after review.");
        }
    }
}
