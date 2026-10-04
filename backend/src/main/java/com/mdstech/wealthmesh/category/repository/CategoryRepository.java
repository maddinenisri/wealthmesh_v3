package com.mdstech.wealthmesh.category.repository;

import java.util.UUID;

import org.springframework.data.repository.reactive.ReactiveCrudRepository;

import com.mdstech.wealthmesh.category.domain.Category;

import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

public interface CategoryRepository extends ReactiveCrudRepository<Category, UUID> {

    Flux<Category> findAllByOrderBySortOrder();

    Flux<Category> findAllByKindOrderBySortOrder(String kind);

    Mono<Category> findByName(String name);
}
