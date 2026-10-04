package com.mdstech.wealthmesh;

import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.test.context.DynamicPropertyRegistrar;
import org.testcontainers.postgresql.PostgreSQLContainer;
import org.testcontainers.utility.DockerImageName;

/**
 * Starts a throwaway Postgres and points the R2DBC and JDBC (Flyway) connections at it.
 * Properties are set directly instead of via @ServiceConnection so that
 * spring.r2dbc.properties.schema from application.yaml still applies.
 * Flyway applies the real migrations, so no schema.sql initializer is needed.
 */
@TestConfiguration(proxyBeanMethods = false)
public class TestcontainersConfiguration {

    @Bean
    PostgreSQLContainer postgresContainer() {
        return new PostgreSQLContainer(DockerImageName.parse("postgres:17"));
    }

    @Bean
    DynamicPropertyRegistrar databaseProperties(PostgreSQLContainer postgres) {
        return registry -> {
            registry.add("spring.r2dbc.url", () -> "r2dbc:postgresql://%s:%d/%s".formatted(
                    postgres.getHost(), postgres.getMappedPort(PostgreSQLContainer.POSTGRESQL_PORT),
                    postgres.getDatabaseName()));
            registry.add("spring.r2dbc.username", postgres::getUsername);
            registry.add("spring.r2dbc.password", postgres::getPassword);
            registry.add("spring.flyway.url", postgres::getJdbcUrl);
            registry.add("spring.flyway.user", postgres::getUsername);
            registry.add("spring.flyway.password", postgres::getPassword);
        };
    }
}
