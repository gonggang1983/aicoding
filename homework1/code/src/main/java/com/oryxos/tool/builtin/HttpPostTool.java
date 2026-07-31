package com.oryxos.tool.builtin;

import com.oryxos.tool.Tool;
import com.oryxos.tool.ToolResult;
import com.oryxos.tool.sandbox.SandboxPolicy;
import org.springframework.stereotype.Component;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.Map;

@Component
public class HttpPostTool implements Tool {
    private final SandboxPolicy sandboxPolicy;
    private final HttpClient httpClient = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();

    public HttpPostTool(SandboxPolicy sandboxPolicy) {
        this.sandboxPolicy = sandboxPolicy;
    }

    @Override
    public String name() {
        return "http_post";
    }

    @Override
    public String description() {
        return "Send an HTTP POST request to an allowed domain";
    }

    @Override
    public ToolResult invoke(Map<String, Object> input) {
        try {
            String url = String.valueOf(input.get("url"));
            String body = String.valueOf(input.getOrDefault("body", ""));
            sandboxPolicy.checkUrl(url);
            HttpRequest request = HttpRequest.newBuilder(URI.create(url))
                    .timeout(Duration.ofSeconds(10))
                    .POST(HttpRequest.BodyPublishers.ofString(body))
                    .build();
            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            return ToolResult.ok(response.body());
        } catch (Exception e) {
            return ToolResult.error(e.getMessage());
        }
    }
}
