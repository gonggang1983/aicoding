package com.oryxos.workspace;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "oryxos.workspace")
public class WorkspaceProperties {
    private String path = ".oryxos";

    public String getPath() {
        return path;
    }

    public void setPath(String path) {
        this.path = path;
    }
}
