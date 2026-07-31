package com.oryxos.cli;

import com.oryxos.tool.ToolRegistry;
import org.springframework.stereotype.Component;
import picocli.CommandLine.Command;

@Component
@Command(name = "tool", description = "Manage tools", mixinStandardHelpOptions = true,
        subcommands = ToolCommand.ListTools.class)
public class ToolCommand implements Runnable {
    @Override
    public void run() {
        System.out.println("Use `oryxos tool list` to list tools.");
    }

    @Component
    @Command(name = "list", description = "List registered tools")
    public static class ListTools implements Runnable {
        private final ToolRegistry toolRegistry;

        public ListTools(ToolRegistry toolRegistry) {
            this.toolRegistry = toolRegistry;
        }

        @Override
        public void run() {
            toolRegistry.descriptors().forEach(tool -> System.out.println(tool.name() + "\t" + tool.description()));
        }
    }
}
