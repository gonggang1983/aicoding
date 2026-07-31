package com.oryxos.cli;

import org.springframework.stereotype.Component;
import picocli.CommandLine.Command;

@Component
@Command(
        name = "oryxos",
        mixinStandardHelpOptions = true,
        version = "OryxOS 0.1.0-SNAPSHOT",
        description = "Java native Agent Harness OS",
        subcommands = {
                InitCommand.class,
                StatusCommand.class,
                ChatCommand.class,
                ServeCommand.class,
                GatewayCommand.class,
                ProfileCommand.class,
                ProviderCommand.class,
                ToolCommand.class,
                SessionCommand.class
        }
)
public class OryxosCommand implements Runnable {
    @Override
    public void run() {
        System.out.println("Use `oryxos --help` to see available commands.");
    }
}
