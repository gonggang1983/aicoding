package com.oryxos.workspace;

import java.util.List;

public record WorkspaceInitResult(String workspacePath, List<String> createdPaths) {
}
