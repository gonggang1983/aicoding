package com.oryxos.provider;

/**
 * Chat 调用结果。
 *
 * <p>承载生成内容、provider/model 元数据，以及可机判的 {@link Status} 与中文
 * {@code errorMessage}。失败时 {@code content} 可为空，{@code errorMessage} 必填且为中文。
 *
 * <p>凭证（API Key）严禁出现在任何字段中。
 */
public record ChatResponse(
        String content,
        String provider,
        String model,
        Status status,
        String errorMessage
) {

    public enum Status {
        SUCCESS,
        CONFIG_ERROR,
        SERVICE_ERROR,
        INVALID_INPUT
    }

    public static ChatResponse success(String content, String provider, String model) {
        return new ChatResponse(content, provider, model, Status.SUCCESS, null);
    }

    public static ChatResponse error(Status status, String provider, String model, String errorMessage) {
        return new ChatResponse(null, provider, model, status, errorMessage);
    }

    public boolean isSuccess() {
        return status == Status.SUCCESS;
    }
}
