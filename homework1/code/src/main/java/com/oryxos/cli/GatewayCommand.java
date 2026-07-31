package com.oryxos.cli;

import org.springframework.stereotype.Component;
import picocli.CommandLine.Command;

@Component
@Command(name = "gateway", description = "Start the multi-channel gateway daemon", mixinStandardHelpOptions = true)
public class GatewayCommand implements Runnable {
    @Override
    public void run() {
        System.out.println("Gateway mode is reserved. Core stage currently includes CLI and HTTP API channels.");
    }
}
