package com.mdstech.wealthmesh.household.repository;

import java.util.UUID;

import org.springframework.data.repository.reactive.ReactiveCrudRepository;

import com.mdstech.wealthmesh.household.domain.HouseholdMember;

import reactor.core.publisher.Flux;

public interface HouseholdMemberRepository extends ReactiveCrudRepository<HouseholdMember, UUID> {

    Flux<HouseholdMember> findByHouseholdId(UUID householdId);
}
