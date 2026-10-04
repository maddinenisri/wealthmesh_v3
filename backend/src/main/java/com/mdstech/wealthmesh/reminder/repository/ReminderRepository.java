package com.mdstech.wealthmesh.reminder.repository;

import java.time.Instant;
import java.util.UUID;

import org.springframework.data.repository.reactive.ReactiveCrudRepository;

import com.mdstech.wealthmesh.reminder.domain.Reminder;

import reactor.core.publisher.Mono;

public interface ReminderRepository extends ReactiveCrudRepository<Reminder, UUID> {

    Mono<Reminder> findByIdempotencyKeyAndCreatedAtAfter(String idempotencyKey, Instant cutoff);
}
