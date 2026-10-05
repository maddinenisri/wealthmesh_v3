package com.mdstech.wealthmesh.household.repository;

import java.util.UUID;

import org.springframework.data.r2dbc.repository.Query;
import org.springframework.data.repository.reactive.ReactiveCrudRepository;

import com.mdstech.wealthmesh.household.domain.HouseholdMember;

import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

public interface HouseholdMemberRepository extends ReactiveCrudRepository<HouseholdMember, UUID> {

    Flux<HouseholdMember> findByHouseholdId(UUID householdId);

    /** Reads the members and blocks a concurrent deactivate until the caller's transaction ends. */
    @Query("SELECT * FROM household_member WHERE household_id = :householdId FOR SHARE")
    Flux<HouseholdMember> findByHouseholdIdForShare(UUID householdId);

    /** Reads one member and blocks any other writer of it until the caller's transaction ends. */
    @Query("SELECT * FROM household_member WHERE id = :id FOR UPDATE")
    Mono<HouseholdMember> findByIdForUpdate(UUID id);
}
