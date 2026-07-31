package com.oryxos.api;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.boot.test.web.server.LocalServerPort;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "oryxos.workspace.path=target/test-workspaces/api/.oryxos",
        "oryxos.sqlite.path=target/test-workspaces/api/.oryxos/sessions/oryxos.db"
})
class ApiSmokeTest {
    @LocalServerPort
    int port;

    @Autowired
    TestRestTemplate restTemplate;

    @Test
    void healthAndInfoEndpointsAreAvailable() {
        Map<?, ?> health = restTemplate.getForObject(url("/api/v1/health"), Map.class);
        Map<?, ?> info = restTemplate.getForObject(url("/api/v1/info"), Map.class);
        Object[] tools = restTemplate.getForObject(url("/api/v1/tools"), Object[].class);

        assertThat(health.get("status")).isEqualTo("UP");
        assertThat(info.get("name")).isEqualTo("OryxOS");
        assertThat(tools).isNotEmpty();
    }

    private String url(String path) {
        return "http://localhost:" + port + path;
    }
}
