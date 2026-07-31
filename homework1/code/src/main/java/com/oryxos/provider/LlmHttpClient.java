package com.oryxos.provider;

import java.net.http.HttpRequest;

/**
 * 轻量 HTTP 客户端抽象，隔离 {@link java.net.http.HttpClient} 和
 * {@link java.net.http.HttpResponse} 以支持单元测试（Java 26 上 Mockito 无法 mock 这些 JDK 类）。
 */
public interface LlmHttpClient {

    /** 简化响应：状态码 + 响应体。 */
    record Response(int statusCode, String body) {}

    Response send(HttpRequest request) throws java.io.IOException, InterruptedException;

    /** 生产实现：委托到 JDK HttpClient。 */
    static LlmHttpClient fromJdkClient(java.net.http.HttpClient client) {
        return request -> {
            var resp = client.send(request, java.net.http.HttpResponse.BodyHandlers.ofString());
            return new Response(resp.statusCode(), resp.body());
        };
    }
}
