package com.oryxos.react;

public record ReactResult(String content, int iterations, com.oryxos.provider.ChatResponse.Status status) {
    public static ReactResult success(String content, int iterations) {
        return new ReactResult(content, iterations, com.oryxos.provider.ChatResponse.Status.SUCCESS);
    }

    public static ReactResult error(com.oryxos.provider.ChatResponse.Status status, String errorMessage) {
        return new ReactResult(errorMessage, 0, status);
    }
}
