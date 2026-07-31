package com.oryxos;

import com.oryxos.cli.OryxosCommand;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.WebApplicationType;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.context.ConfigurableApplicationContext;
import picocli.CommandLine;

import java.util.Arrays;

@SpringBootApplication
@ConfigurationPropertiesScan
public class OryxOsApplication {

    public static void main(String[] args) {
        if (args.length > 0 && "serve".equals(args[0])) {
            String[] webArgs = Arrays.copyOfRange(args, 1, args.length);
            SpringApplication.run(OryxOsApplication.class, webArgs);
            return;
        }

        try (ConfigurableApplicationContext context = new SpringApplicationBuilder(OryxOsApplication.class)
                .web(WebApplicationType.NONE)
                .run(args)) {
            int exitCode = new CommandLine(context.getBean(OryxosCommand.class), context.getBean(CommandLine.IFactory.class))
                    .execute(args);
            System.exit(exitCode);
        }
    }
}
