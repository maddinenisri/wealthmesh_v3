package com.mdstech.wealthmesh.category.repository;

import java.util.UUID;

import org.springframework.data.r2dbc.repository.Query;
import org.springframework.data.repository.reactive.ReactiveCrudRepository;

import com.mdstech.wealthmesh.category.domain.Category;

import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

public interface CategoryRepository extends ReactiveCrudRepository<Category, UUID> {

    Flux<Category> findAllByOrderBySortOrder();

    Flux<Category> findAllByKindOrderBySortOrder(String kind);

    @Query("SELECT * FROM category WHERE archived_at IS NULL ORDER BY sort_order")
    Flux<Category> findActive();

    @Query("SELECT * FROM category WHERE kind = :kind AND archived_at IS NULL ORDER BY sort_order")
    Flux<Category> findActiveByKind(String kind);

    /** A category chosen by name: archived and merged ones are not offered (CATEGORIES_004, 005). */
    @Query("SELECT * FROM category WHERE kind = :kind AND name = :name AND archived_at IS NULL")
    Mono<Category> findActiveByKindAndName(String kind, String name);

    /** Reads one category and blocks a concurrent archive, rename or merge until the transaction ends. */
    @Query("SELECT * FROM category WHERE id = :id FOR SHARE")
    Mono<Category> findByIdForShare(UUID id);
}
