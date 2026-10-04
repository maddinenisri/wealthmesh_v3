package com.mdstech.wealthmesh.account.repository;

import java.util.UUID;

import org.springframework.data.repository.reactive.ReactiveCrudRepository;

import com.mdstech.wealthmesh.account.domain.Account;

import reactor.core.publisher.Flux;

public interface AccountRepository extends ReactiveCrudRepository<Account, UUID> {

    Flux<Account> findAllByOrderByNameAscCreatedAtAsc();
}
