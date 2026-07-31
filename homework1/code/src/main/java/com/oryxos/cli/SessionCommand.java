package com.oryxos.cli;

import com.oryxos.session.SessionService;
import org.springframework.stereotype.Component;
import picocli.CommandLine.Command;

@Component
@Command(name = "session", description = "Manage sessions", mixinStandardHelpOptions = true,
        subcommands = SessionCommand.ListSessions.class)
public class SessionCommand implements Runnable {
    @Override
    public void run() {
        System.out.println("Use `oryxos session list` to list sessions.");
    }

    @Component
    @Command(name = "list", description = "List sessions")
    public static class ListSessions implements Runnable {
        private final SessionService sessionService;

        public ListSessions(SessionService sessionService) {
            this.sessionService = sessionService;
        }

        @Override
        public void run() {
            sessionService.list().forEach(session -> System.out.println(session.sessionId() + "\t" + session.profileName() + "\t" + session.status()));
        }
    }
}
