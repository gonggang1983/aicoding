package com.oryxos.storage;

import org.sqlite.SQLiteDataSource;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import javax.sql.DataSource;
import java.nio.file.Files;
import java.nio.file.Path;

@Configuration
public class SqliteConfig {

    @Bean
    DataSource dataSource(@Value("${oryxos.sqlite.path:.oryxos/sessions/oryxos.db}") String sqlitePath) throws Exception {
        Path dbPath = Path.of(sqlitePath);
        Path parent = dbPath.getParent();
        if (parent != null) {
            Files.createDirectories(parent);
        }
        SQLiteDataSource dataSource = new SQLiteDataSource();
        dataSource.setUrl("jdbc:sqlite:" + dbPath);
        return dataSource;
    }
}
