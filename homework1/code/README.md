# OryxOS

OryxOS 是一个 Java 原生、企业私有部署、可审计的 Agent Harness OS。当前工程是根据 `../docs` 下的需求与路线文档初始化的最小可运行代码骨架。

## 技术栈

- Java 21
- Spring Boot 3.x
- Spring MVC / Actuator
- picocli CLI
- SQLite + Flyway
- Markdown frontmatter + SnakeYAML

## 构建

```bash
mvn test
mvn package
```

## CLI

```bash
java -jar target/oryxos-0.1.0-SNAPSHOT.jar --help
java -jar target/oryxos-0.1.0-SNAPSHOT.jar init
java -jar target/oryxos-0.1.0-SNAPSHOT.jar status
java -jar target/oryxos-0.1.0-SNAPSHOT.jar profile create demo
java -jar target/oryxos-0.1.0-SNAPSHOT.jar chat --profile demo --message "ping"
```

## REST API

```bash
java -jar target/oryxos-0.1.0-SNAPSHOT.jar serve
curl http://localhost:8080/api/v1/health
curl http://localhost:8080/api/v1/info
curl http://localhost:8080/api/v1/tools
```

## 工作区

`oryxos init` 会在当前目录创建 `.oryxos/` 工作区。该命令是幂等的：已存在的目录和文件不会被覆盖。
