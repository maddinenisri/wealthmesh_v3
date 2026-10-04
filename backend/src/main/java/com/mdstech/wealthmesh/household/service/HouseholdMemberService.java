package com.mdstech.wealthmesh.household.service;

import java.util.UUID;

import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import com.mdstech.wealthmesh.household.domain.HouseholdMember;
import com.mdstech.wealthmesh.household.repository.HouseholdMemberRepository;
import com.mdstech.wealthmesh.household.dto.HouseholdMemberRequest;
import com.mdstech.wealthmesh.household.dto.HouseholdMemberResponse;
import com.mdstech.wealthmesh.household.mapper.HouseholdMemberMapper;

import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

@Service
public class HouseholdMemberService {

    private final HouseholdMemberRepository repository;
    private final HouseholdMemberMapper mapper;

    public HouseholdMemberService(HouseholdMemberRepository repository, HouseholdMemberMapper mapper) {
        this.repository = repository;
        this.mapper = mapper;
    }

    public Flux<HouseholdMemberResponse> findAll(UUID householdId) {
        Flux<HouseholdMember> members = householdId == null
                ? repository.findAll()
                : repository.findByHouseholdId(householdId);
        return members.map(mapper::toResponse);
    }

    public Mono<HouseholdMemberResponse> findById(UUID id) {
        return load(id).map(mapper::toResponse);
    }

    public Mono<HouseholdMemberResponse> create(HouseholdMemberRequest request) {
        if (request.householdId() == null) {
            return Mono.error(new ResponseStatusException(HttpStatus.BAD_REQUEST, "householdId is required"));
        }
        return validate(request)
                .then(Mono.defer(() -> repository.save(mapper.toNewEntity(request))))
                .onErrorMap(DataIntegrityViolationException.class, HouseholdMemberService::duplicate)
                .map(mapper::toResponse);
    }

    public Mono<HouseholdMemberResponse> update(UUID id, HouseholdMemberRequest request) {
        return validate(request)
                .then(Mono.defer(() -> load(id)))
                .flatMap(existing -> repository.save(mapper.toUpdatedEntity(request, existing)))
                .onErrorMap(DataIntegrityViolationException.class, HouseholdMemberService::duplicate)
                .map(mapper::toResponse);
    }

    public Mono<Void> delete(UUID id) {
        return load(id).flatMap(repository::delete);
    }

    private static Mono<Void> validate(HouseholdMemberRequest request) {
        String name = request.name() == null ? "" : request.name().strip();
        String label = request.label() == null ? "" : request.label().strip();
        if (name.isEmpty() || name.length() > 120) {
            return Mono.error(new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Member name must be 1 to 120 characters"));
        }
        if (label.length() > 80) {
            return Mono.error(new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Label must be 80 characters or fewer"));
        }
        return Mono.empty();
    }

    private static ResponseStatusException duplicate(DataIntegrityViolationException e) {
        return new ResponseStatusException(HttpStatus.CONFLICT,
                "A member with this name and label already exists, or the household does not exist", e);
    }

    private Mono<HouseholdMember> load(UUID id) {
        return repository.findById(id).switchIfEmpty(Mono.error(
                new ResponseStatusException(HttpStatus.NOT_FOUND, "Household member not found: " + id)));
    }
}
