package com.oryxos.common;

public class OryxException extends RuntimeException {
    private final ErrorCode errorCode;

    public OryxException(ErrorCode errorCode, String message) {
        super(message);
        this.errorCode = errorCode;
    }

    public ErrorCode getErrorCode() {
        return errorCode;
    }
}
