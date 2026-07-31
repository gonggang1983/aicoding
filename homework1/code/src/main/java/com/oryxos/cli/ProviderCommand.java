package com.oryxos.cli;

import org.springframework.stereotype.Component;
import picocli.CommandLine.Command;

@Component
@Command(name = "provider", description = "Manage providers", mixinStandardHelpOptions = true,
        subcommands = ProviderCommand.ListProviders.class)
public class ProviderCommand implements Runnable {
    @Override
    public void run() {
        System.out.println("Use `oryxos provider list` to list providers.");
    }

    @Component
    @Command(name = "list", description = "List providers")
    public static class ListProviders implements Runnable {
        @Override
        public void run() {
            System.out.println("mock\tmock-chat\tready");
        }
    }
}
