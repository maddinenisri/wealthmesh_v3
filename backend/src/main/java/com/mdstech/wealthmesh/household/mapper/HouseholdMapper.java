package com.mdstech.wealthmesh.household.mapper;

import org.mapstruct.Mapper;
import org.mapstruct.Mapping;
import org.mapstruct.Named;

import com.mdstech.wealthmesh.household.domain.Household;
import com.mdstech.wealthmesh.household.dto.HouseholdRequest;
import com.mdstech.wealthmesh.household.dto.HouseholdResponse;

@Mapper(componentModel = "spring")
public interface HouseholdMapper {

    HouseholdResponse toResponse(Household household);

    @Mapping(target = "id", ignore = true)
    @Mapping(target = "name", source = "name", qualifiedByName = "strip")
    @Mapping(target = "createdAt", expression = "java(java.time.Instant.now())")
    @Mapping(target = "updatedAt", expression = "java(java.time.Instant.now())")
    Household toNewEntity(HouseholdRequest request);

    @Mapping(target = "id", source = "existing.id")
    @Mapping(target = "name", source = "request.name", qualifiedByName = "strip")
    @Mapping(target = "createdAt", source = "existing.createdAt")
    @Mapping(target = "updatedAt", expression = "java(java.time.Instant.now())")
    Household toUpdatedEntity(HouseholdRequest request, Household existing);

    @Named("strip")
    default String strip(String value) {
        return value == null ? "" : value.strip();
    }
}
