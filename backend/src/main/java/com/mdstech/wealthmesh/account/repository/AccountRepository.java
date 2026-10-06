package com.mdstech.wealthmesh.account.repository;

import java.util.UUID;

import org.springframework.data.r2dbc.repository.Query;
import org.springframework.data.repository.reactive.ReactiveCrudRepository;

import com.mdstech.wealthmesh.account.domain.Account;

import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

/**
 * Every read skips a deleted account (`deleted_at`, slice 12): `findById` is overridden so no service that loads an
 * account by id can see one. The Undo of a delete (group 4) reads past the filter with its own SQL.
 */
public interface AccountRepository extends ReactiveCrudRepository<Account, UUID> {

    @Override
    @Query("SELECT * FROM account WHERE id = :id AND deleted_at IS NULL")
    Mono<Account> findById(UUID id);

    @Query("SELECT * FROM account WHERE deleted_at IS NULL ORDER BY name ASC, created_at ASC")
    Flux<Account> findAllByOrderByNameAscCreatedAtAsc();
}
