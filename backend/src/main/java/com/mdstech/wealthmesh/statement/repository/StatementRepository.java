package com.mdstech.wealthmesh.statement.repository;

import java.time.Instant;
import java.util.UUID;

import org.springframework.data.repository.reactive.ReactiveCrudRepository;

import com.mdstech.wealthmesh.statement.domain.Statement;

import reactor.core.publisher.Mono;

public interface StatementRepository extends ReactiveCrudRepository<Statement, UUID> {

    Mono<Statement> findByIdempotencyKeyAndCreatedAtAfter(String idempotencyKey, Instant cutoff);
}
