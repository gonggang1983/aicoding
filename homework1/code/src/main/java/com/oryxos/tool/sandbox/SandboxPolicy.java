package com.oryxos.tool.sandbox;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.net.URI;
import java.nio.file.Path;
import java.util.List;

@Component
public class SandboxPolicy {
    private final List<String> allowedFileRoots;
    private final List<String> allowedCommands;
    private final List<String> allowedDomains;

    public SandboxPolicy(
            @Value("${oryxos.sandbox.file.allowed-roots:.oryxos}") List<String> allowedFileRoots,
            @Value("${oryxos.sandbox.shell.allowed-commands:echo}") List<String> allowedCommands,
            @Value("${oryxos.sandbox.http.allowed-domains:httpbin.org}") List<String> allowedDomains) {
        this.allowedFileRoots = allowedFileRoots;
        this.allowedCommands = allowedCommands;
        this.allowedDomains = allowedDomains;
    }

    public void checkFile(Path path) {
        Path normalized = path.toAbsolutePath().normalize();
        boolean allowed = allowedFileRoots.stream()
                .map(root -> Path.of(root).toAbsolutePath().normalize())
                .anyMatch(normalized::startsWith);
        if (!allowed) {
            throw new SandboxViolationException("File path is outside allowed roots: " + path);
        }
    }

    public void checkCommand(String command) {
        String executable = command == null ? "" : command.strip().split("\\s+")[0];
        if (!allowedCommands.contains(executable)) {
            throw new SandboxViolationException("Shell command is not allowed: " + executable);
        }
    }

    public void checkUrl(String url) {
        String host = URI.create(url).getHost();
        if (host == null || !allowedDomains.contains(host)) {
            throw new SandboxViolationException("HTTP domain is not allowed: " + host);
        }
    }
}
