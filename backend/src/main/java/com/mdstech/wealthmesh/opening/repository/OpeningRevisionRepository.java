package com.mdstech.wealthmesh.opening.repository;

import java.time.Instant;
import java.util.UUID;

import org.springframework.data.repository.reactive.ReactiveCrudRepository;

import com.mdstech.wealthmesh.opening.domain.OpeningRevision;

import reactor.core.publisher.Mono;

public interface OpeningRevisionRepository extends ReactiveCrudRepository<OpeningRevision, UUID> {

    Mono<OpeningRevision> findByIdempotencyKeyAndCreatedAtAfter(String idempotencyKey, Instant cutoff);
}
