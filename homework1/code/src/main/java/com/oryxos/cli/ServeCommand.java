package com.oryxos.cli;

import org.springframework.stereotype.Component;
import picocli.CommandLine.Command;

@Component
@Command(name = "serve", description = "Start the HTTP API service", mixinStandardHelpOptions = true)
public class ServeCommand implements Runnable {
    @Override
    public void run() {
        System.out.println("Run `java -jar target/oryxos-0.1.0-SNAPSHOT.jar serve` to start the HTTP API service.");
    }
}
