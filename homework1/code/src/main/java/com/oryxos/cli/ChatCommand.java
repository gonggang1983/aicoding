package com.oryxos.cli;

import com.oryxos.agent.AgentService;
import org.springframework.stereotype.Component;
import picocli.CommandLine.Command;
import picocli.CommandLine.Option;

import java.io.BufferedReader;
import java.io.InputStreamReader;

@Component
@Command(name = "chat", description = "Chat with an Agent through the CLI channel", mixinStandardHelpOptions = true)
public class ChatCommand implements Runnable {
    private final AgentService agentService;

    @Option(names = "--profile", description = "Agent profile name")
    private String profile = "demo";

    @Option(names = "--message", description = "Send one message and exit")
    private String message;

    public ChatCommand(AgentService agentService) {
        this.agentService = agentService;
    }

    @Override
    public void run() {
        if (message != null) {
            System.out.println(agentService.invoke(profile, message).response());
            return;
        }
        System.out.println("OryxOS chat. Type `exit` to quit.");
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(System.in))) {
            while (true) {
                System.out.print("> ");
                String line = reader.readLine();
                if (line == null || "exit".equalsIgnoreCase(line.strip())) {
                    return;
                }
                System.out.println(agentService.invoke(profile, line).response());
            }
        } catch (Exception e) {
            throw new IllegalStateException("Chat failed", e);
        }
    }
}
