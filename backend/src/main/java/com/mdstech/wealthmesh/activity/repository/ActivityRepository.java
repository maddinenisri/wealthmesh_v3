package com.mdstech.wealthmesh.activity.repository;

import java.time.Instant;
import java.util.UUID;

import org.springframework.data.repository.reactive.ReactiveCrudRepository;

import com.mdstech.wealthmesh.activity.domain.Activity;

import reactor.core.publisher.Mono;

public interface ActivityRepository extends ReactiveCrudRepository<Activity, UUID> {

    Mono<Activity> findByIdempotencyKeyAndCreatedAtAfter(String idempotencyKey, Instant cutoff);
}
