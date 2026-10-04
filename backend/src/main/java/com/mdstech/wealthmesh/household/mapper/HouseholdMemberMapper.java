package com.mdstech.wealthmesh.household.mapper;

import java.util.Locale;

import org.mapstruct.Mapper;
import org.mapstruct.Mapping;
import org.mapstruct.Named;

import com.mdstech.wealthmesh.household.domain.HouseholdMember;
import com.mdstech.wealthmesh.household.dto.HouseholdMemberRequest;
import com.mdstech.wealthmesh.household.dto.HouseholdMemberResponse;

@Mapper(componentModel = "spring")
public interface HouseholdMemberMapper {

    HouseholdMemberResponse toResponse(HouseholdMember member);

    @Mapping(target = "id", ignore = true)
    @Mapping(target = "name", source = "name", qualifiedByName = "strip")
    @Mapping(target = "label", source = "label", qualifiedByName = "stripOrNull")
    @Mapping(target = "nameKey", source = "name", qualifiedByName = "key")
    @Mapping(target = "labelKey", source = "label", qualifiedByName = "key")
    @Mapping(target = "createdAt", expression = "java(java.time.Instant.now())")
    @Mapping(target = "updatedAt", expression = "java(java.time.Instant.now())")
    HouseholdMember toNewEntity(HouseholdMemberRequest request);

    @Mapping(target = "id", source = "existing.id")
    @Mapping(target = "householdId", source = "existing.householdId")
    @Mapping(target = "name", source = "request.name", qualifiedByName = "strip")
    @Mapping(target = "label", source = "request.label", qualifiedByName = "stripOrNull")
    @Mapping(target = "nameKey", source = "request.name", qualifiedByName = "key")
    @Mapping(target = "labelKey", source = "request.label", qualifiedByName = "key")
    @Mapping(target = "createdAt", source = "existing.createdAt")
    @Mapping(target = "updatedAt", expression = "java(java.time.Instant.now())")
    HouseholdMember toUpdatedEntity(HouseholdMemberRequest request, HouseholdMember existing);

    @Named("strip")
    default String strip(String value) {
        return value == null ? "" : value.strip();
    }

    @Named("stripOrNull")
    default String stripOrNull(String value) {
        return value == null || value.isBlank() ? null : value.strip();
    }

    @Named("key")
    default String key(String value) {
        return value == null ? "" : value.strip().toLowerCase(Locale.ROOT);
    }
}
