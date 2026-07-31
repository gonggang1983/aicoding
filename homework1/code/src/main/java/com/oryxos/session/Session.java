package com.oryxos.session;

public record Session(
        String sessionId,
        String profileName,
        String channel,
        String userId,
        String messagesJson,
        String status
) {
}
