package com.mdstech.wealthmesh.household.repository;

import java.util.UUID;

import org.springframework.data.repository.reactive.ReactiveCrudRepository;

import com.mdstech.wealthmesh.household.domain.Household;

public interface HouseholdRepository extends ReactiveCrudRepository<Household, UUID> {
}
