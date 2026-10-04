package com.mdstech.wealthmesh.household.mapper;

import java.time.Clock;
import java.time.Instant;

import org.mapstruct.Mapper;
import org.mapstruct.Mapping;
import org.mapstruct.Named;
import org.springframework.beans.factory.annotation.Autowired;

import com.mdstech.wealthmesh.household.domain.Household;
import com.mdstech.wealthmesh.household.dto.HouseholdRequest;
import com.mdstech.wealthmesh.household.dto.HouseholdResponse;

@Mapper(componentModel = "spring")
public abstract class HouseholdMapper {

    @Autowired
    protected Clock clock;

    public abstract HouseholdResponse toResponse(Household household);

    @Mapping(target = "id", ignore = true)
    @Mapping(target = "name", source = "name", qualifiedByName = "strip")
    @Mapping(target = "createdAt", expression = "java(now())")
    @Mapping(target = "updatedAt", expression = "java(now())")
    public abstract Household toNewEntity(HouseholdRequest request);

    @Mapping(target = "id", source = "existing.id")
    @Mapping(target = "name", source = "request.name", qualifiedByName = "strip")
    @Mapping(target = "createdAt", source = "existing.createdAt")
    @Mapping(target = "updatedAt", expression = "java(now())")
    public abstract Household toUpdatedEntity(HouseholdRequest request, Household existing);

    @Named("strip")
    protected String strip(String value) {
        return value == null ? "" : value.strip();
    }

    protected Instant now() {
        return clock.instant();
    }
}
