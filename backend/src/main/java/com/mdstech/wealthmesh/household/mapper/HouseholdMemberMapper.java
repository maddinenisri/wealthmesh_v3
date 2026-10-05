package com.mdstech.wealthmesh.household.mapper;

import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.Locale;

import org.mapstruct.Mapper;
import org.mapstruct.Mapping;
import org.mapstruct.Named;
import org.springframework.beans.factory.annotation.Autowired;

import com.mdstech.wealthmesh.household.domain.HouseholdMember;
import com.mdstech.wealthmesh.household.dto.HouseholdMemberRequest;
import com.mdstech.wealthmesh.household.dto.HouseholdMemberResponse;
import com.mdstech.wealthmesh.household.dto.HouseholdMemberResponse.NameChange;

@Mapper(componentModel = "spring")
public abstract class HouseholdMemberMapper {

    @Autowired
    protected Clock clock;

    public HouseholdMemberResponse toResponse(HouseholdMember member, List<NameChange> history) {
        return new HouseholdMemberResponse(member.id(), member.householdId(), member.name(), member.label(),
                member.active(), history == null ? List.of() : history, member.createdAt(), member.updatedAt());
    }

    @Mapping(target = "id", ignore = true)
    @Mapping(target = "name", source = "name", qualifiedByName = "strip")
    @Mapping(target = "label", source = "label", qualifiedByName = "stripOrNull")
    @Mapping(target = "nameKey", source = "name", qualifiedByName = "key")
    @Mapping(target = "labelKey", source = "label", qualifiedByName = "key")
    @Mapping(target = "active", constant = "true")
    @Mapping(target = "createdAt", expression = "java(now())")
    @Mapping(target = "updatedAt", expression = "java(now())")
    public abstract HouseholdMember toNewEntity(HouseholdMemberRequest request);

    @Mapping(target = "id", source = "existing.id")
    @Mapping(target = "householdId", source = "existing.householdId")
    @Mapping(target = "name", source = "request.name", qualifiedByName = "strip")
    @Mapping(target = "label", source = "request.label", qualifiedByName = "stripOrNull")
    @Mapping(target = "nameKey", source = "request.name", qualifiedByName = "key")
    @Mapping(target = "labelKey", source = "request.label", qualifiedByName = "key")
    @Mapping(target = "active", source = "existing.active")
    @Mapping(target = "createdAt", source = "existing.createdAt")
    @Mapping(target = "updatedAt", expression = "java(now())")
    public abstract HouseholdMember toUpdatedEntity(HouseholdMemberRequest request, HouseholdMember existing);

    @Named("strip")
    protected String strip(String value) {
        return value == null ? "" : value.strip();
    }

    @Named("stripOrNull")
    protected String stripOrNull(String value) {
        return value == null || value.isBlank() ? null : value.strip();
    }

    @Named("key")
    protected String key(String value) {
        return value == null ? "" : value.strip().toLowerCase(Locale.ROOT);
    }

    protected Instant now() {
        return clock.instant();
    }
}
